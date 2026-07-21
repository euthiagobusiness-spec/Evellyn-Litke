-- Dashboard measurement contract v2.
-- Additive only: preserves existing snapshots and imported Meta rows.

alter table public.group_member_snapshots
  add column if not exists admin_count integer not null default 0
    check (admin_count >= 0 and admin_count <= member_count),
  add column if not exists reported_exits integer not null default 0
    check (reported_exits >= 0),
  add column if not exists is_baseline boolean not null default false;

-- The oldest existing inventory is the safest historical baseline. A second
-- snapshot is still required before the dashboard calculates a net change.
update public.group_member_snapshots
set is_baseline = true
where id = (
  select id from public.group_member_snapshots order by captured_at, id limit 1
)
  and not exists (
    select 1 from public.group_member_snapshots where is_baseline
  );

alter table public.meta_campaign_daily
  add column if not exists landing_page_views integer
    check (landing_page_views is null or landing_page_views >= 0),
  add column if not exists angle text
    check (angle is null or char_length(angle) <= 120),
  add column if not exists creative_format text
    check (creative_format is null or char_length(creative_format) <= 80),
  add column if not exists hook text
    check (hook is null or char_length(hook) <= 200),
  alter column spend drop default,
  alter column impressions drop default,
  alter column reach drop not null,
  alter column reach drop default,
  alter column link_clicks drop not null,
  alter column link_clicks drop default,
  alter column all_clicks drop not null,
  alter column all_clicks drop default,
  alter column meta_leads drop not null,
  alter column meta_leads drop default;

create index if not exists meta_campaign_daily_ad_date_idx
  on public.meta_campaign_daily (ad_id, metric_date desc)
  where ad_id is not null;

create or replace function public.get_funnel_dashboard_secure(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_timezone text := 'America/Manaus';
  v_today date;
  v_start_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_landing integer := 0;
  v_form integer := 0;
  v_submit integer := 0;
  v_leads integer := 0;
  v_redirects integer := 0;
  v_validation_errors integer := 0;
  v_validation_failures integer := 0;
  v_last_lead timestamptz;
  v_capi_success integer := 0;
  v_capi_failed integer := 0;
  v_capi_pending integer := 0;
  v_capi_oldest_minutes numeric;
  v_api_p95 numeric;
  v_api_samples integer := 0;
  v_utm_source numeric;
  v_utm_medium numeric;
  v_utm_campaign numeric;
  v_utm_content numeric;
  v_utm_term numeric;
  v_utm_complete numeric;
  v_ad_id_coverage numeric;
  v_literal_macro_leads integer := 0;
  v_meta_rows integer := 0;
  v_metric_days integer := 0;
  v_last_meta_date date;
  v_spend numeric := 0;
  v_impressions bigint := 0;
  v_reach bigint := 0;
  v_link_clicks bigint := 0;
  v_all_clicks bigint := 0;
  v_landing_page_views bigint := 0;
  v_meta_leads bigint := 0;
  v_meta_incomplete_rows integer := 0;
  v_unattributed_leads integer := 0;
  v_reconciled_spend numeric := 0;
  v_reconciled_leads integer := 0;
  v_current_snapshot public.group_member_snapshots%rowtype;
  v_baseline_snapshot public.group_member_snapshots%rowtype;
  v_has_current boolean := false;
  v_has_baseline boolean := false;
  v_group_total integer;
  v_group_admins integer;
  v_group_participants integer;
  v_group_baseline integer;
  v_group_exits integer;
  v_group_net integer;
  v_group_measured boolean := false;
  v_group_fresh boolean := false;
  v_snapshot_count integer := 0;
  v_daily jsonb;
  v_campaigns jsonb;
  v_snapshots jsonb;
  v_alerts jsonb;
begin
  v_today := (now() at time zone v_timezone)::date;
  v_start_date := v_today - (v_days - 1);
  v_start := v_start_date::timestamp at time zone v_timezone;
  v_end := (v_today + 1)::timestamp at time zone v_timezone;

  select
    count(*) filter (where e.event_name::text = 'landing_view'),
    count(*) filter (where e.event_name::text = 'form_start'),
    count(*) filter (where e.event_name::text = 'submit_attempt'),
    count(*) filter (where e.event_name::text = 'validation_error')
  into v_landing, v_form, v_submit, v_validation_errors
  from public.funnel_events e
  where e.occurred_at >= v_start
    and e.occurred_at < v_end
    and not e.is_suspicious;

  -- A field blur can never make the operational failure rate exceed the
  -- number of actual submit attempts. The client sends one validation event
  -- per submit, and this cap protects historical/malformed duplicate events.
  v_validation_failures := least(v_validation_errors, v_submit);

  select count(*), max(l.created_at)
  into v_leads, v_last_lead
  from public.leads l
  where l.created_at >= v_start and l.created_at < v_end;

  -- Cohort-safe: redirect belongs to a lead created in the same selected window.
  select count(*) into v_redirects
  from public.leads l
  where l.created_at >= v_start
    and l.created_at < v_end
    and l.whatsapp_clicked_at is not null
    and l.whatsapp_clicked_at < v_end;

  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status in ('retry', 'dead'))
  into v_capi_success, v_capi_failed
  from public.meta_event_outbox
  where created_at >= v_start and created_at < v_end;

  -- Backlog is current operational state, so it must not be truncated by the
  -- reporting period selected in the dashboard.
  select
    count(*),
    extract(epoch from (
      now() - (min(created_at) filter (
        where status in ('pending', 'processing', 'retry')
      ))
    )) / 60.0
  into v_capi_pending, v_capi_oldest_minutes
  from public.meta_event_outbox
  where status in ('pending', 'processing', 'retry');

  select
    count(*),
    percentile_cont(0.95) within group (order by duration_ms)
  into v_api_samples, v_api_p95
  from public.api_request_metrics
  where endpoint = 'create-lead'
    and created_at >= v_start and created_at < v_end;

  select
    round(100.0 * count(*) filter (where coalesce(first_touch ->> 'utm_source', '') <> '' and (first_touch ->> 'utm_source') !~ '\{\{[^}]+\}\}') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where coalesce(first_touch ->> 'utm_medium', '') <> '' and (first_touch ->> 'utm_medium') !~ '\{\{[^}]+\}\}') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where coalesce(first_touch ->> 'utm_campaign', '') <> '' and (first_touch ->> 'utm_campaign') !~ '\{\{[^}]+\}\}') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where coalesce(first_touch ->> 'utm_content', '') <> '' and (first_touch ->> 'utm_content') !~ '\{\{[^}]+\}\}') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (where coalesce(first_touch ->> 'utm_term', '') <> '' and (first_touch ->> 'utm_term') !~ '\{\{[^}]+\}\}') / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (
      where coalesce(first_touch ->> 'utm_source', '') <> ''
        and coalesce(first_touch ->> 'utm_medium', '') <> ''
        and coalesce(first_touch ->> 'utm_campaign', '') <> ''
        and coalesce(first_touch ->> 'utm_content', '') <> ''
        and coalesce(first_touch ->> 'utm_term', '') <> ''
        and concat_ws('|',
          first_touch ->> 'utm_source', first_touch ->> 'utm_medium',
          first_touch ->> 'utm_campaign', first_touch ->> 'utm_content',
          first_touch ->> 'utm_term'
        ) !~ '\{\{[^}]+\}\}'
    ) / nullif(count(*), 0), 2),
    round(100.0 * count(*) filter (
      where coalesce(first_touch ->> 'ad_id', '') <> ''
        and (first_touch ->> 'ad_id') !~ '\{\{[^}]+\}\}'
    ) / nullif(count(*), 0), 2),
    count(*) filter (where concat_ws('|',
      first_touch ->> 'utm_source', first_touch ->> 'utm_medium',
      first_touch ->> 'utm_campaign', first_touch ->> 'utm_content',
      first_touch ->> 'utm_term'
    ) ~ '\{\{[^}]+\}\}')
  into
    v_utm_source, v_utm_medium, v_utm_campaign, v_utm_content,
    v_utm_term, v_utm_complete, v_ad_id_coverage, v_literal_macro_leads
  from public.leads
  where created_at >= v_start and created_at < v_end;

  select
    count(*), count(distinct metric_date), max(metric_date),
    coalesce(sum(spend), 0), coalesce(sum(impressions), 0),
    sum(reach), sum(link_clicks),
    sum(all_clicks), sum(landing_page_views),
    sum(meta_leads),
    count(*) filter (where spend is null or impressions is null or link_clicks is null)
  into
    v_meta_rows, v_metric_days, v_last_meta_date, v_spend, v_impressions, v_reach,
    v_link_clicks, v_all_clicks, v_landing_page_views, v_meta_leads,
    v_meta_incomplete_rows
  from public.meta_campaign_daily
  where metric_date between v_start_date and v_today;

  select count(*) into v_unattributed_leads
  from public.leads l
  where l.created_at >= v_start and l.created_at < v_end
    and concat_ws('',
      l.first_touch ->> 'campaign_id', l.first_touch ->> 'adset_id',
      l.first_touch ->> 'ad_id', l.first_touch ->> 'utm_campaign',
      l.first_touch ->> 'utm_content', l.first_touch ->> 'utm_term'
    ) = '';

  with lead_ids as (
    select nullif(l.first_touch ->> 'ad_id', '') as ad_id, count(*)::integer as leads
    from public.leads l
    where l.created_at >= v_start and l.created_at < v_end
      and nullif(l.first_touch ->> 'ad_id', '') is not null
    group by nullif(l.first_touch ->> 'ad_id', '')
  ), meta_ids as (
    select nullif(m.ad_id, '') as ad_id, sum(m.spend) as spend
    from public.meta_campaign_daily m
    where m.metric_date between v_start_date and v_today
      and nullif(m.ad_id, '') is not null
    group by nullif(m.ad_id, '')
  )
  select coalesce(sum(m.spend), 0), coalesce(sum(l.leads), 0)::integer
  into v_reconciled_spend, v_reconciled_leads
  from meta_ids m
  join lead_ids l using (ad_id);

  select * into v_current_snapshot
  from public.group_member_snapshots
  where captured_at >= v_start
    and captured_at < v_end
  order by captured_at desc, id desc
  limit 1;
  v_has_current := found;

  if v_has_current then
    -- Align the comparison to the selected reporting window: the primary
    -- baseline is the closest inventory at or before the window start.
    select * into v_baseline_snapshot
    from public.group_member_snapshots
    where id <> v_current_snapshot.id
      and captured_at <= v_start
    order by captured_at desc, id desc
    limit 1;
    v_has_baseline := found;

    -- A manually marked baseline inside the window is the next-best choice.
    if not v_has_baseline then
      select * into v_baseline_snapshot
      from public.group_member_snapshots
      where id <> v_current_snapshot.id
        and is_baseline
        and captured_at >= v_start
        and captured_at < v_current_snapshot.captured_at
      order by captured_at desc, id desc
      limit 1;
      v_has_baseline := found;
    end if;

    -- For a brand-new operation, use the earliest prior inventory in this
    -- window. Never combine a stale current snapshot from another period.
    if not v_has_baseline then
      select * into v_baseline_snapshot
      from public.group_member_snapshots
      where id <> v_current_snapshot.id
        and captured_at >= v_start
        and captured_at < v_current_snapshot.captured_at
      order by captured_at, id
      limit 1;
      v_has_baseline := found;
    end if;

    v_group_total := v_current_snapshot.member_count;
    v_group_admins := v_current_snapshot.admin_count;
    v_group_participants := greatest(v_group_total - v_group_admins, 0);
    v_group_exits := v_current_snapshot.reported_exits;
    v_group_fresh := v_current_snapshot.captured_at >= now() - interval '14 hours';

    if v_has_baseline then
      v_group_baseline := greatest(
        v_baseline_snapshot.member_count - v_baseline_snapshot.admin_count,
        0
      );
      v_group_net := v_group_participants - v_group_baseline;
      v_group_measured := v_group_fresh;
    end if;
  end if;

  select count(*) into v_snapshot_count
  from public.group_member_snapshots
  where captured_at >= v_start and captured_at < v_end;

  select coalesce(jsonb_agg(row_data order by day), '[]'::jsonb)
  into v_daily
  from (
    select d::date as day,
      jsonb_build_object(
        'date', d::date,
        'landingViews', (select count(*) from public.funnel_events e
          where e.occurred_at >= (d::date::timestamp at time zone v_timezone)
            and e.occurred_at < ((d::date + 1)::timestamp at time zone v_timezone)
            and e.event_name::text = 'landing_view' and not e.is_suspicious),
        'formStarts', (select count(*) from public.funnel_events e
          where e.occurred_at >= (d::date::timestamp at time zone v_timezone)
            and e.occurred_at < ((d::date + 1)::timestamp at time zone v_timezone)
            and e.event_name::text = 'form_start' and not e.is_suspicious),
        'submitAttempts', (select count(*) from public.funnel_events e
          where e.occurred_at >= (d::date::timestamp at time zone v_timezone)
            and e.occurred_at < ((d::date + 1)::timestamp at time zone v_timezone)
            and e.event_name::text = 'submit_attempt' and not e.is_suspicious),
        'leadsSaved', (select count(*) from public.leads l
          where l.created_at >= (d::date::timestamp at time zone v_timezone)
            and l.created_at < ((d::date + 1)::timestamp at time zone v_timezone)),
        'redirectsUnique', (select count(*) from public.leads l
          where l.created_at >= (d::date::timestamp at time zone v_timezone)
            and l.created_at < ((d::date + 1)::timestamp at time zone v_timezone)
            and l.whatsapp_clicked_at is not null),
        'spend', (select sum(m.spend) from public.meta_campaign_daily m where m.metric_date = d::date),
        'linkClicks', (select sum(m.link_clicks) from public.meta_campaign_daily m where m.metric_date = d::date)
      ) as row_data
    from generate_series(v_start_date, v_today, interval '1 day') d
  ) q;

  with lead_base as (
    select
      l.created_at,
      l.whatsapp_clicked_at,
      nullif(l.first_touch ->> 'utm_campaign', '') as campaign_token,
      nullif(l.first_touch ->> 'utm_term', '') as adset_token,
      nullif(l.first_touch ->> 'utm_content', '') as ad_token,
      coalesce(
        nullif(l.first_touch ->> 'campaign_id', ''),
        case when l.first_touch ->> 'utm_campaign' ~ '^[0-9]+$' then l.first_touch ->> 'utm_campaign' end
      ) as campaign_id,
      coalesce(
        nullif(l.first_touch ->> 'adset_id', ''),
        case when l.first_touch ->> 'utm_term' ~ '^[0-9]+$' then l.first_touch ->> 'utm_term' end
      ) as adset_id,
      coalesce(
        nullif(l.first_touch ->> 'ad_id', ''),
        case when l.first_touch ->> 'utm_content' ~ '^[0-9]+$' then l.first_touch ->> 'utm_content' end
      ) as ad_id
    from public.leads l
    where l.created_at >= v_start and l.created_at < v_end
  ), lead_keys as (
    select *,
      case
        when ad_id is not null then 'ad:id:' || ad_id
        when ad_token is not null then 'ad:name:' || lower(btrim(ad_token)) || '|campaign:' || lower(coalesce(campaign_token, ''))
        when adset_id is not null then 'adset:id:' || adset_id
        when campaign_id is not null then 'campaign:id:' || campaign_id
        when campaign_token is not null then 'campaign:name:' || lower(btrim(campaign_token))
        else 'unattributed'
      end as join_key,
      case when campaign_id is null then campaign_token end as campaign_name,
      case when adset_id is null then adset_token end as adset_name,
      case when ad_id is null then ad_token end as ad_name
    from lead_base
  ), lead_agg as (
    select join_key,
      max(campaign_id) as campaign_id, max(campaign_name) as campaign_name,
      max(adset_id) as adset_id, max(adset_name) as adset_name,
      max(ad_id) as ad_id, max(ad_name) as ad_name,
      count(*) as supabase_leads,
      count(*) filter (where whatsapp_clicked_at is not null and whatsapp_clicked_at < v_end) as redirects_unique
    from lead_keys
    group by join_key
  ), meta_keys as (
    select m.*,
      case
        when nullif(m.ad_id, '') is not null then 'ad:id:' || m.ad_id
        when nullif(m.ad_name, '') is not null then 'ad:name:' || lower(btrim(m.ad_name)) || '|campaign:' || lower(m.campaign_name)
        when nullif(m.adset_id, '') is not null then 'adset:id:' || m.adset_id
        when nullif(m.campaign_id, '') is not null then 'campaign:id:' || m.campaign_id
        else 'campaign:name:' || lower(btrim(m.campaign_name))
      end as join_key
    from public.meta_campaign_daily m
    where m.metric_date between v_start_date and v_today
  ), meta_agg as (
    select join_key,
      max(metric_date) as metric_date,
      count(distinct metric_date) as metric_days,
      max(campaign_id) as campaign_id, max(campaign_name) as campaign_name,
      max(adset_id) as adset_id, max(adset_name) as adset_name,
      max(ad_id) as ad_id, max(ad_name) as ad_name,
      max(angle) as angle, max(creative_format) as creative_format,
      max(hook) as hook,
      sum(spend) as spend, sum(impressions) as impressions,
      sum(reach) as reach, sum(link_clicks) as link_clicks,
      sum(all_clicks) as all_clicks,
      sum(landing_page_views) as landing_page_views,
      sum(meta_leads) as meta_leads
    from meta_keys
    group by join_key
  ), joined as (
    select
      coalesce(m.join_key, l.join_key) as join_key,
      m.metric_date,
      coalesce(m.campaign_id, l.campaign_id) as campaign_id,
      coalesce(m.campaign_name, l.campaign_name, '(sem campanha)') as campaign_name,
      coalesce(m.adset_id, l.adset_id) as adset_id,
      coalesce(m.adset_name, l.adset_name) as adset_name,
      coalesce(m.ad_id, l.ad_id) as ad_id,
      coalesce(m.ad_name, l.ad_name) as ad_name,
      m.angle,
      m.creative_format,
      m.hook,
      m.metric_days,
      m.spend,
      m.impressions,
      m.reach,
      m.link_clicks,
      m.all_clicks,
      m.landing_page_views,
      m.meta_leads,
      coalesce(l.supabase_leads, 0) as supabase_leads,
      coalesce(l.redirects_unique, 0) as redirects_unique,
      (m.join_key is not null and l.join_key is not null) as directly_matched,
      (m.join_key is not null and l.join_key is not null
        and m.ad_id is not null and l.ad_id is not null) as directly_matched_by_id,
      (m.join_key is not null and m.ad_id is not null and coalesce(v_ad_id_coverage, 0) >= 95) as zero_lead_reconciled
    from meta_agg m
    full outer join lead_agg l on l.join_key = m.join_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', metric_date,
    'campaignId', campaign_id,
    'campaign', campaign_name,
    'adsetId', adset_id,
    'adset', adset_name,
    'adId', ad_id,
    'ad', ad_name,
    'angle', angle,
    'format', creative_format,
    'hook', hook,
    'spend', spend,
    'impressions', impressions,
    'reach', reach,
    -- Reach is not additive across days. Frequency is only valid for a single
    -- imported date at this grain; otherwise the dashboard shows no reading.
    'frequency', case when metric_days = 1 and reach > 0 then round(impressions::numeric / reach, 2) else null end,
    'clicksAll', all_clicks,
    'linkClicks', link_clicks,
    'linkCtr', case when impressions > 0 then round(100.0 * link_clicks / impressions, 2) else null end,
    'linkCpc', case when link_clicks > 0 then round(spend / link_clicks, 2) else null end,
    'landingPageViews', landing_page_views,
    'metaLeads', meta_leads,
    'supabaseLeads', supabase_leads,
    'redirectsUnique', redirects_unique,
    'netMembers', null,
    'reconciledFirstPartyCpl', case when directly_matched_by_id and supabase_leads > 0 then round(spend / supabase_leads, 2) else null end,
    'firstPartyCpl', case when directly_matched_by_id and supabase_leads > 0 then round(spend / supabase_leads, 2) else null end,
    'costPerMember', null,
    'reconciled', directly_matched_by_id or zero_lead_reconciled,
    'optimizationEligible', directly_matched_by_id or zero_lead_reconciled,
    'metaDataFresh', v_last_meta_date >= v_today - 1,
    'matchingMethod', case
      when directly_matched_by_id then 'id'
      when directly_matched then 'name_auxiliary'
      when zero_lead_reconciled then 'id_zero_leads'
      when impressions > 0 then 'meta_only'
      else 'lead_only'
    end,
    'groupMeasured', v_group_measured
  ) order by spend desc nulls last, supabase_leads desc, join_key), '[]'::jsonb)
  into v_campaigns
  from joined;

  select coalesce(jsonb_agg(row_data order by captured_at desc), '[]'::jsonb)
  into v_snapshots
  from (
    select captured_at,
      jsonb_build_object(
        'count', member_count,
        'memberCount', member_count,
        'adminCount', admin_count,
        'participantCount', greatest(member_count - admin_count, 0),
        'reportedExits', reported_exits,
        'isBaseline', is_baseline,
        'capturedAt', captured_at,
        'source', source
      ) as row_data
    from public.group_member_snapshots
    where (captured_at >= v_start and captured_at < v_end)
      or (v_has_baseline and id = v_baseline_snapshot.id)
    order by captured_at desc, id desc
    limit 12
  ) s;

  select coalesce(jsonb_agg(alert), '[]'::jsonb)
  into v_alerts
  from (
    select jsonb_build_object('level', 'critical', 'code', 'no_leads', 'message', 'Nenhum lead salvo no período.') alert
      where v_leads = 0
    union all
    select jsonb_build_object('level', 'critical', 'code', 'tracking_missing', 'message', 'Há leads, mas os eventos de visita/formulário não foram recebidos.')
      where v_leads > 0 and (v_landing = 0 or v_form = 0 or v_submit = 0)
    union all
    select jsonb_build_object('level', 'warning', 'code', 'utm_coverage', 'message', 'Cobertura UTM completa abaixo de 95%.')
      where v_leads > 0 and coalesce(v_utm_complete, 0) < 95
    union all
    select jsonb_build_object('level', 'critical', 'code', 'literal_macro', 'message', 'Foram recebidas macros Meta literais nas UTMs.')
      where v_literal_macro_leads > 0
    union all
    select jsonb_build_object('level', 'warning', 'code', 'redirect_rate', 'message', 'Menos de 90% da coorte chegou ao redirecionamento.')
      where v_leads > 0 and (100.0 * v_redirects / v_leads) < 90
    union all
    select jsonb_build_object('level', 'critical', 'code', 'api_latency', 'message', 'p95 da captura acima de 2 segundos.')
      where v_api_samples >= 5 and v_api_p95 > 2000
    union all
    select jsonb_build_object('level', 'critical', 'code', 'capi_failure', 'message', 'Falhas da CAPI acima de 5%.')
      where (v_capi_success + v_capi_failed) > 0
        and (100.0 * v_capi_failed / (v_capi_success + v_capi_failed)) > 5
    union all
    select jsonb_build_object('level', 'critical', 'code', 'capi_backlog', 'message', 'Fila CAPI pendente há mais de 15 minutos.')
      where v_capi_pending > 0 and v_capi_oldest_minutes > 15
    union all
    select jsonb_build_object('level', 'warning', 'code', 'form_errors', 'message', 'Erros de validação acima de 2% dos envios.')
      where v_submit > 0 and (100.0 * v_validation_failures / v_submit) > 2
    union all
    select jsonb_build_object('level', 'warning', 'code', 'group_unmeasured', 'message', 'São necessários dois snapshots do grupo para calcular membros líquidos.')
      where not v_group_measured
    union all
    select jsonb_build_object('level', 'warning', 'code', 'group_stale', 'message', 'O snapshot mais recente do grupo tem mais de 14 horas.')
      where v_has_current and not v_group_fresh
    union all
    select jsonb_build_object('level', 'warning', 'code', 'meta_missing', 'message', 'Nenhuma métrica Meta foi importada para o período.')
      where v_meta_rows = 0
    union all
    select jsonb_build_object('level', 'warning', 'code', 'meta_stale', 'message', 'A importação da Meta está desatualizada; não otimize com base neste recorte.')
      where v_meta_rows > 0 and v_last_meta_date < v_today - 1
    union all
    select jsonb_build_object('level', 'critical', 'code', 'meta_incomplete', 'message', 'Faltam dias ou linhas Meta completas no recorte; CTR, CPC e decisões ficam bloqueados.')
      where v_meta_rows > 0 and (v_metric_days < v_days or v_meta_incomplete_rows > 0)
  ) a;

  return jsonb_build_object(
    'generatedAt', now(),
    'reportingTimezone', v_timezone,
    'periodStart', v_start,
    'periodEnd', v_end,
    'source', 'supabase_first_party_plus_meta_import',
    'summary', jsonb_build_object(
      'landingViews', v_landing,
      'formStarts', v_form,
      'submitAttempts', v_submit,
      'leadsSaved', v_leads,
      'redirectsUnique', v_redirects,
      'groupMembers', v_group_total,
      'groupAdmins', v_group_admins,
      'groupParticipants', v_group_participants,
      'groupBaseline', v_group_baseline,
      'groupReportedExits', v_group_exits,
      'netMembers', v_group_net,
      'spend', case when v_meta_rows > 0 then v_spend else null end,
      'impressions', case when v_meta_rows > 0 then v_impressions else null end,
      -- Reach/frequency cannot be globally summed across ads or dates.
      'reach', null,
      'frequency', null,
      'linkClicks', v_link_clicks,
      'allClicks', v_all_clicks,
      'landingPageViews', v_landing_page_views,
      'metaLeads', v_meta_leads,
      'linkCtr', case when v_impressions > 0 then round(100.0 * v_link_clicks / v_impressions, 2) else null end,
      'linkCpc', case when v_link_clicks > 0 then round(v_spend / v_link_clicks, 2) else null end,
      'metaReportedCpl', case when v_meta_rows > 0 and v_meta_leads > 0 then round(v_spend / v_meta_leads, 2) else null end,
      'reconciledFirstPartyCpl', case when v_reconciled_leads > 0 then round(v_reconciled_spend / v_reconciled_leads, 2) else null end,
      'firstPartyCpl', case when v_reconciled_leads > 0 then round(v_reconciled_spend / v_reconciled_leads, 2) else null end,
      'blendedFirstPartyCpl', case when v_meta_rows > 0 and v_leads > 0 then round(v_spend / v_leads, 2) else null end,
      'unattributedLeads', v_unattributed_leads,
      'costPerMember', case when v_meta_rows > 0 and v_group_net > 0 then round(v_spend / v_group_net, 2) else null end,
      'apiP95Ms', case when v_api_samples > 0 then round(v_api_p95, 0) else null end,
      'utmCoverage', v_utm_complete
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object('key', 'landingViews', 'label', 'Sessões rastreadas', 'value', v_landing, 'rate', case when v_landing > 0 then 100 else null end),
      jsonb_build_object('key', 'formStarts', 'label', 'Inícios de formulário', 'value', v_form, 'rate', case when v_landing > 0 then round(100.0 * v_form / v_landing, 2) else null end),
      jsonb_build_object('key', 'submitAttempts', 'label', 'Tentativas de envio', 'value', v_submit, 'rate', case when v_form > 0 then round(100.0 * v_submit / v_form, 2) else null end),
      jsonb_build_object('key', 'leadsSaved', 'label', 'Leads salvos', 'value', v_leads, 'rate', case when v_submit > 0 then round(100.0 * v_leads / v_submit, 2) else null end),
      jsonb_build_object('key', 'redirectsUnique', 'label', 'Redirecionamentos únicos', 'value', v_redirects, 'rate', case when v_leads > 0 then round(100.0 * v_redirects / v_leads, 2) else null end),
      jsonb_build_object('key', 'netMembers', 'label', 'Membros líquidos', 'value', v_group_net, 'rate', case when v_group_net is not null and v_redirects > 0 then round(100.0 * v_group_net / v_redirects, 2) else null end),
      jsonb_build_object('key', 'groupMembers', 'label', 'Total atual do grupo', 'value', v_group_total, 'rate', null)
    ),
    'daily', v_daily,
    'campaigns', v_campaigns,
    'health', jsonb_build_object(
      'trackingHealthy', case when v_leads = 0 and v_landing = 0 then null else (v_landing > 0 and v_form > 0 and v_submit > 0) end,
      'validationErrors', v_validation_failures,
      'rawValidationEvents', v_validation_errors,
      'submitSamples', v_submit,
      'formErrorRate', case when v_submit > 0 then least(100, round(100.0 * v_validation_failures / v_submit, 2)) else null end,
      'apiP95Ms', case when v_api_samples > 0 then round(v_api_p95, 0) else null end,
      'apiSamples', v_api_samples,
      'utmCoverage', v_utm_complete,
      'utmSourceCoverage', v_utm_source,
      'utmMediumCoverage', v_utm_medium,
      'utmCampaignCoverage', v_utm_campaign,
      'utmContentCoverage', v_utm_content,
      'utmTermCoverage', v_utm_term,
      'attributionIdCoverage', v_ad_id_coverage,
      'literalMacroLeads', v_literal_macro_leads,
      'leadRedirectRate', case when v_leads > 0 then round(100.0 * v_redirects / v_leads, 2) else null end,
      'hoursSinceLastLead', case when v_last_lead is not null then round((extract(epoch from (now() - v_last_lead)) / 3600.0)::numeric, 2) else null end,
      'capiSuccess', v_capi_success,
      'capiFailed', v_capi_failed,
      'capiSamples', v_capi_success + v_capi_failed,
      'capiFailureRate', case when (v_capi_success + v_capi_failed) > 0 then round(100.0 * v_capi_failed / (v_capi_success + v_capi_failed), 2) else null end,
      'pendingCapi', v_capi_pending,
      'oldestPendingCapiMinutes', case when v_capi_oldest_minutes is not null then round(v_capi_oldest_minutes, 1) else null end,
      'capiBacklogHealthy', v_capi_pending = 0,
      'groupMeasured', v_group_measured,
      'groupSnapshotCount', v_snapshot_count,
      'lastGroupSnapshotAt', case when v_has_current then v_current_snapshot.captured_at else null end,
      'groupBaselineAt', case when v_has_baseline then v_baseline_snapshot.captured_at else null end,
      'metaRows', v_meta_rows,
      'metricDays', v_metric_days,
      'lastMetaMetricDate', v_last_meta_date,
      'metaDataFresh', case when v_meta_rows = 0 then null else v_last_meta_date >= v_today - 1 end,
      'metaDataComplete', case when v_meta_rows = 0 then null else v_metric_days >= v_days and v_meta_incomplete_rows = 0 end,
      'routesHealthy', null,
      'sslHealthy', null
    ),
    'groupSnapshots', v_snapshots,
    'alerts', v_alerts
  );
end;
$$;

revoke all on function public.get_funnel_dashboard_secure(integer)
  from public, anon, authenticated;
grant execute on function public.get_funnel_dashboard_secure(integer)
  to service_role;

comment on function public.get_funnel_dashboard_secure(integer) is
  'Returns a PII-free operational dashboard in America/Manaus with cohort-safe redirects, complete UTM coverage, reconciled Meta ad metrics, health samples and two-snapshot WhatsApp net membership.';
