-- MRC funnel hardening: attribution, idempotency, first-party measurement,
-- asynchronous Meta CAPI delivery, aggregate dashboard and LGPD operations.
-- Browser roles never access these tables or RPCs directly. Edge Functions use
-- the service role and enforce origin, payload, rate-limit and token checks.

alter type public.funnel_event_name add value if not exists 'landing_view';
alter type public.funnel_event_name add value if not exists 'form_start';
alter type public.funnel_event_name add value if not exists 'validation_error';
alter type public.funnel_event_name add value if not exists 'submit_attempt';
alter type public.funnel_event_name add value if not exists 'lead_saved';
alter type public.funnel_event_name add value if not exists 'redirect_started';
alter type public.funnel_event_name add value if not exists 'redirect_unique';
alter type public.funnel_event_name add value if not exists 'web_vital';
alter type public.funnel_event_name add value if not exists 'api_request';

alter table public.leads
  add column if not exists first_touch jsonb not null default '{}'::jsonb,
  add column if not exists last_touch jsonb not null default '{}'::jsonb,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists submission_count integer not null default 1
    check (submission_count > 0);

alter table public.leads
  add constraint leads_first_touch_object_check
    check (jsonb_typeof(first_touch) = 'object'),
  add constraint leads_last_touch_object_check
    check (jsonb_typeof(last_touch) = 'object');

update public.leads
set first_touch = jsonb_strip_nulls(jsonb_build_object(
      'utm_source', utm_source,
      'utm_medium', utm_medium,
      'utm_campaign', utm_campaign,
      'utm_content', utm_content,
      'utm_term', utm_term,
      'gclid', gclid,
      'fbclid', fbclid,
      'referrer', referrer,
      'landing_path', landing_path,
      'captured_at', created_at
    )),
    last_touch = jsonb_strip_nulls(jsonb_build_object(
      'utm_source', utm_source,
      'utm_medium', utm_medium,
      'utm_campaign', utm_campaign,
      'utm_content', utm_content,
      'utm_term', utm_term,
      'gclid', gclid,
      'fbclid', fbclid,
      'referrer', referrer,
      'landing_path', landing_path,
      'captured_at', updated_at
    )),
    first_seen_at = created_at,
    last_seen_at = updated_at
where first_touch = '{}'::jsonb;

create index if not exists leads_first_touch_campaign_idx
  on public.leads ((first_touch ->> 'utm_campaign'), created_at desc)
  where first_touch ? 'utm_campaign';
create index if not exists leads_last_seen_at_idx
  on public.leads (last_seen_at desc);
create index if not exists leads_retention_eligible_idx
  on public.leads (retention_until)
  where retention_until is not null and not legal_hold;

alter table public.funnel_events
  add column if not exists event_id uuid,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists ip_hash text
    check (ip_hash is null or char_length(ip_hash) = 64),
  add column if not exists consent_analytics boolean not null default false,
  add column if not exists duration_ms integer
    check (duration_ms is null or duration_ms between 0 and 120000),
  add column if not exists is_suspicious boolean not null default false,
  add column if not exists utm_source text
    check (utm_source is null or char_length(utm_source) <= 200),
  add column if not exists utm_medium text
    check (utm_medium is null or char_length(utm_medium) <= 200),
  add column if not exists utm_campaign text
    check (utm_campaign is null or char_length(utm_campaign) <= 200),
  add column if not exists utm_content text
    check (utm_content is null or char_length(utm_content) <= 200),
  add column if not exists utm_term text
    check (utm_term is null or char_length(utm_term) <= 200);

update public.funnel_events set occurred_at = created_at where occurred_at is null;

create unique index if not exists funnel_events_event_id_key
  on public.funnel_events (event_id) where event_id is not null;
-- `event_name::text` cannot be used in an index predicate because enum-to-text
-- casts are not immutable. Redirect uniqueness is enforced by the immutable
-- `event_id` and by the one-time `whatsapp_clicked_at` update on the lead.
create index if not exists funnel_events_occurred_name_idx
  on public.funnel_events (occurred_at desc, event_name);
create index if not exists funnel_events_campaign_occurred_idx
  on public.funnel_events (utm_campaign, occurred_at desc)
  where utm_campaign is not null;
create index if not exists funnel_events_session_occurred_idx
  on public.funnel_events (session_id, occurred_at desc)
  where session_id is not null;

create table public.lead_submissions (
  idempotency_key uuid primary key,
  lead_id uuid references public.leads(id) on delete set null,
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);
create index lead_submissions_lead_idx
  on public.lead_submissions (lead_id, created_at desc) where lead_id is not null;

create table public.meta_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_name text not null default 'Lead' check (event_name = 'Lead'),
  event_source_url text not null check (char_length(event_source_url) <= 1000),
  client_user_agent text check (client_user_agent is null or char_length(client_user_agent) <= 512),
  client_ip inet,
  fbc text check (fbc is null or char_length(fbc) <= 512),
  fbp text check (fbp is null or char_length(fbp) <= 512),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'dead')),
  attempts smallint not null default 0 check (attempts between 0 and 12),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 120000),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  response_code text check (response_code is null or char_length(response_code) <= 80),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meta_event_outbox_dispatch_idx
  on public.meta_event_outbox (status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');
create index meta_event_outbox_lead_idx
  on public.meta_event_outbox (lead_id, created_at desc);

create table public.api_request_metrics (
  id bigint generated always as identity primary key,
  endpoint text not null check (char_length(endpoint) between 1 and 80),
  status_code smallint not null check (status_code between 100 and 599),
  duration_ms integer not null check (duration_ms between 0 and 120000),
  success boolean not null,
  event_id uuid,
  created_at timestamptz not null default now()
);
create index api_request_metrics_endpoint_created_idx
  on public.api_request_metrics (endpoint, created_at desc);

create table public.group_member_snapshots (
  id bigint generated always as identity primary key,
  member_count integer not null check (member_count >= 0),
  captured_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'import')),
  note text check (note is null or char_length(note) <= 500)
);
create index group_member_snapshots_captured_idx
  on public.group_member_snapshots (captured_at desc);

create table public.meta_campaign_daily (
  id bigint generated always as identity primary key,
  external_key text not null unique check (char_length(external_key) <= 300),
  metric_date date not null,
  campaign_id text check (campaign_id is null or char_length(campaign_id) <= 100),
  campaign_name text not null check (char_length(campaign_name) between 1 and 300),
  adset_id text check (adset_id is null or char_length(adset_id) <= 100),
  adset_name text check (adset_name is null or char_length(adset_name) <= 300),
  ad_id text check (ad_id is null or char_length(ad_id) <= 100),
  ad_name text check (ad_name is null or char_length(ad_name) <= 300),
  spend numeric(12, 2) not null default 0 check (spend >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  reach integer not null default 0 check (reach >= 0),
  link_clicks integer not null default 0 check (link_clicks >= 0),
  all_clicks integer not null default 0 check (all_clicks >= 0),
  meta_leads integer not null default 0 check (meta_leads >= 0),
  imported_at timestamptz not null default now()
);
create index meta_campaign_daily_date_campaign_idx
  on public.meta_campaign_daily (metric_date desc, campaign_name);

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null unique default gen_random_uuid(),
  request_type text not null
    check (request_type in ('access', 'correction', 'deletion', 'revocation', 'portability')),
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  email_normalized text generated always as (lower(btrim(email))) stored,
  email_hash text not null check (char_length(email_hash) = 64),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  requested_changes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(requested_changes) = 'object'),
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'in_progress', 'completed', 'rejected')),
  verification_method text check (verification_method is null or char_length(verification_method) <= 100),
  verified_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  completed_at timestamptz,
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_subject_requests_status_created_idx
  on public.data_subject_requests (status, created_at);
create index data_subject_requests_email_hash_idx
  on public.data_subject_requests (email_hash, created_at desc);

create table public.data_retention_policies (
  data_category text primary key,
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  legal_basis text not null check (char_length(legal_basis) between 3 and 300),
  automatic_purge boolean not null default false,
  updated_at timestamptz not null default now()
);

create table private.dashboard_access_tokens (
  token_hash text primary key check (char_length(token_hash) = 64),
  label text not null check (char_length(label) between 2 and 120),
  active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.dashboard_access_tokens from public, anon, authenticated;
grant select, insert, update, delete on private.dashboard_access_tokens to service_role;

insert into public.data_retention_policies
  (data_category, retention_days, legal_basis, automatic_purge)
values
  ('anonymous_funnel_events', 90, 'Metrica operacional minimizada; validar interesse legitimo no RIPD.', true),
  ('api_request_metrics', 90, 'Seguranca, disponibilidade e diagnostico.', true),
  ('rate_limit_records', 2, 'Prevencao a fraude e abuso.', true),
  ('meta_outbox_completed', 30, 'Auditoria tecnica de entrega, sem payload de resposta.', true),
  ('data_subject_requests', 730, 'Comprovacao do atendimento aos direitos do titular.', false),
  ('active_leads', null, 'Prazo depende da finalidade e da decisao documentada da controladora.', false)
on conflict (data_category) do update
set retention_days = excluded.retention_days,
    legal_basis = excluded.legal_basis,
    automatic_purge = excluded.automatic_purge,
    updated_at = now();

create trigger meta_event_outbox_set_updated_at
before update on public.meta_event_outbox
for each row execute function private.set_updated_at();

create trigger data_subject_requests_set_updated_at
before update on public.data_subject_requests
for each row execute function private.set_updated_at();

alter table public.lead_submissions enable row level security;
alter table public.meta_event_outbox enable row level security;
alter table public.api_request_metrics enable row level security;
alter table public.group_member_snapshots enable row level security;
alter table public.meta_campaign_daily enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.data_retention_policies enable row level security;

create policy "deny browser access" on public.lead_submissions
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.meta_event_outbox
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.api_request_metrics
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.group_member_snapshots
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.meta_campaign_daily
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.data_subject_requests
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.data_retention_policies
as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on public.lead_submissions from public, anon, authenticated;
revoke all on public.meta_event_outbox from public, anon, authenticated;
revoke all on public.api_request_metrics from public, anon, authenticated;
revoke all on public.group_member_snapshots from public, anon, authenticated;
revoke all on public.meta_campaign_daily from public, anon, authenticated;
revoke all on public.data_subject_requests from public, anon, authenticated;
revoke all on public.data_retention_policies from public, anon, authenticated;
grant select, insert, update, delete on public.lead_submissions to service_role;
grant select, insert, update, delete on public.meta_event_outbox to service_role;
grant select, insert, update, delete on public.api_request_metrics to service_role;
grant select, insert, update, delete on public.group_member_snapshots to service_role;
grant select, insert, update, delete on public.meta_campaign_daily to service_role;
grant select, insert, update, delete on public.data_subject_requests to service_role;
grant select, insert, update, delete on public.data_retention_policies to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.capture_lead_secure_v3(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_phone_e164 text,
  p_country_iso text,
  p_country_calling_code text,
  p_business_stage text,
  p_goal text,
  p_niche text,
  p_instagram_handle text,
  p_audience_size text,
  p_biggest_challenge text,
  p_preferred_contact_period text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_utm_term text,
  p_gclid text,
  p_fbclid text,
  p_referrer text,
  p_landing_path text,
  p_consent_privacy boolean,
  p_consent_marketing boolean,
  p_consent_analytics boolean,
  p_policy_version text,
  p_source_page text,
  p_ip_hash text,
  p_client_ip text,
  p_user_agent text,
  p_session_id text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_reference uuid;
  v_lead_action text;
  v_email text := lower(btrim(p_email));
  v_country_iso text := upper(btrim(p_country_iso));
  v_existing public.lead_submissions%rowtype;
  v_touch jsonb;
  v_result jsonb;
  v_source_path text;
  v_client_ip inet;
  v_fbc text;
begin
  if p_idempotency_key is null or p_event_id is null then
    raise exception 'idempotency_required' using errcode = '22023';
  end if;
  if p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_request_fingerprint' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );
  select * into v_existing
  from public.lead_submissions
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'idempotency_key_reused' using errcode = '22023';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay', true);
  end if;

  if p_consent_privacy is not true then
    raise exception 'privacy_consent_required' using errcode = '22023';
  end if;
  if char_length(btrim(p_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_country_iso !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country' using errcode = '22023';
  end if;
  if btrim(p_country_calling_code) !~ '^\+[1-9][0-9]{0,3}$' then
    raise exception 'invalid_country_calling_code' using errcode = '22023';
  end if;

  v_source_path := case
    when coalesce(p_source_page, '') ~ '^/[A-Za-z0-9_?&=./%-]*$'
      then left(p_source_page, 500)
    else '/'
  end;

  v_touch := jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(btrim(p_utm_source), ''),
    'utm_medium', nullif(btrim(p_utm_medium), ''),
    'utm_campaign', nullif(btrim(p_utm_campaign), ''),
    'utm_content', nullif(btrim(p_utm_content), ''),
    'utm_term', nullif(btrim(p_utm_term), ''),
    'gclid', nullif(btrim(p_gclid), ''),
    'fbclid', nullif(btrim(p_fbclid), ''),
    'referrer', nullif(btrim(p_referrer), ''),
    'landing_path', nullif(btrim(p_landing_path), ''),
    'session_id', nullif(btrim(p_session_id), ''),
    'captured_at', now()
  ));

  insert into public.leads (
    name, email, phone, phone_e164, country_iso, country_calling_code,
    business_stage, goal, niche, instagram_handle, audience_size,
    biggest_challenge, preferred_contact_period,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, referrer, landing_path,
    first_touch, last_touch, first_seen_at, last_seen_at, submission_count
  ) values (
    btrim(p_name), v_email, btrim(p_phone), p_phone_e164,
    v_country_iso, btrim(p_country_calling_code),
    nullif(btrim(p_business_stage), ''), nullif(btrim(p_goal), ''),
    nullif(btrim(p_niche), ''), nullif(btrim(p_instagram_handle), ''),
    nullif(btrim(p_audience_size), ''), nullif(btrim(p_biggest_challenge), ''),
    nullif(btrim(p_preferred_contact_period), ''),
    nullif(btrim(p_utm_source), ''), nullif(btrim(p_utm_medium), ''),
    nullif(btrim(p_utm_campaign), ''), nullif(btrim(p_utm_content), ''),
    nullif(btrim(p_utm_term), ''), nullif(btrim(p_gclid), ''),
    nullif(btrim(p_fbclid), ''), nullif(btrim(p_referrer), ''),
    nullif(btrim(p_landing_path), ''),
    v_touch, v_touch, now(), now(), 1
  )
  on conflict (email_normalized) do nothing
  returning id, public_reference into v_lead_id, v_reference;

  if found then
    v_lead_action := 'created';
  else
    update public.leads
    set name = btrim(p_name),
        email = v_email,
        phone = btrim(p_phone),
        phone_e164 = p_phone_e164,
        country_iso = v_country_iso,
        country_calling_code = btrim(p_country_calling_code),
        business_stage = coalesce(nullif(btrim(p_business_stage), ''), business_stage),
        goal = coalesce(nullif(btrim(p_goal), ''), goal),
        niche = coalesce(nullif(btrim(p_niche), ''), niche),
        instagram_handle = coalesce(nullif(btrim(p_instagram_handle), ''), instagram_handle),
        audience_size = coalesce(nullif(btrim(p_audience_size), ''), audience_size),
        biggest_challenge = coalesce(nullif(btrim(p_biggest_challenge), ''), biggest_challenge),
        preferred_contact_period = coalesce(nullif(btrim(p_preferred_contact_period), ''), preferred_contact_period),
        -- Legacy attribution columns retain first touch for backwards compatibility.
        utm_source = coalesce(utm_source, nullif(btrim(p_utm_source), '')),
        utm_medium = coalesce(utm_medium, nullif(btrim(p_utm_medium), '')),
        utm_campaign = coalesce(utm_campaign, nullif(btrim(p_utm_campaign), '')),
        utm_content = coalesce(utm_content, nullif(btrim(p_utm_content), '')),
        utm_term = coalesce(utm_term, nullif(btrim(p_utm_term), '')),
        gclid = coalesce(gclid, nullif(btrim(p_gclid), '')),
        fbclid = coalesce(fbclid, nullif(btrim(p_fbclid), '')),
        referrer = coalesce(referrer, nullif(btrim(p_referrer), '')),
        landing_path = coalesce(landing_path, nullif(btrim(p_landing_path), '')),
        last_touch = v_touch,
        last_seen_at = now(),
        submission_count = submission_count + 1
    where email_normalized = v_email
    returning id, public_reference into v_lead_id, v_reference;
    v_lead_action := 'updated';
  end if;

  insert into public.consents (
    lead_id, consent_type, granted, policy_version, source_page, ip_hash, user_agent
  ) values
    (v_lead_id, 'privacy_policy', true, p_policy_version, v_source_path, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'marketing_email', coalesce(p_consent_marketing, false), p_policy_version, v_source_path, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'marketing_whatsapp', coalesce(p_consent_marketing, false), p_policy_version, v_source_path, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'analytics', coalesce(p_consent_analytics, false), p_policy_version, v_source_path, p_ip_hash, left(p_user_agent, 512));

  insert into public.funnel_events (
    lead_id, event_name, event_id, page, session_id, metadata,
    occurred_at, ip_hash, consent_analytics,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) values (
    v_lead_id, 'lead_saved', p_event_id, v_source_path,
    nullif(left(p_session_id, 128), ''),
    jsonb_build_object('lead_action', v_lead_action),
    now(), null, coalesce(p_consent_analytics, false),
    nullif(left(btrim(p_utm_source), 200), ''),
    nullif(left(btrim(p_utm_medium), 200), ''),
    nullif(left(btrim(p_utm_campaign), 200), ''),
    nullif(left(btrim(p_utm_content), 200), ''),
    nullif(left(btrim(p_utm_term), 200), '')
  ) on conflict (event_id) where event_id is not null do nothing;

  if coalesce(p_consent_analytics, false) and v_lead_action = 'created' then
    begin
      v_client_ip := nullif(p_client_ip, '')::inet;
    exception when invalid_text_representation then
      v_client_ip := null;
    end;

    v_fbc := nullif(left(p_metadata ->> 'fbc', 512), '');
    if v_fbc is null and nullif(btrim(p_fbclid), '') is not null then
      v_fbc := 'fb.1.' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
        || '.' || left(btrim(p_fbclid), 480);
    end if;

    insert into public.meta_event_outbox (
      event_id, lead_id, event_source_url, client_user_agent, client_ip, fbc, fbp
    ) values (
      p_event_id,
      v_lead_id,
      'https://www.eventomrc.com.br' || v_source_path,
      nullif(left(p_user_agent, 512), ''),
      v_client_ip,
      v_fbc,
      nullif(left(p_metadata ->> 'fbp', 512), '')
    ) on conflict (event_id) do nothing;
  end if;

  v_result := jsonb_build_object(
    'lead_reference', v_reference,
    'lead_action', v_lead_action,
    'event_name', 'lead_saved',
    'event_id', p_event_id,
    'meta_queued', coalesce(p_consent_analytics, false) and v_lead_action = 'created',
    'idempotent_replay', false
  );

  insert into public.lead_submissions
    (idempotency_key, lead_id, request_fingerprint, result)
  values (p_idempotency_key, v_lead_id, p_request_fingerprint, v_result);

  return v_result;
end;
$$;

create or replace function public.record_first_party_event_secure(
  p_event_id uuid,
  p_event_name text,
  p_lead_reference uuid,
  p_session_id text,
  p_page text,
  p_occurred_at timestamptz,
  p_consent_analytics boolean,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_utm_term text,
  p_metadata jsonb,
  p_ip_hash text,
  p_duration_ms integer,
  p_is_suspicious boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := lower(btrim(p_event_name));
  v_lead_id uuid;
  v_inserted_count integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id_required' using errcode = '22023';
  end if;
  if v_name not in (
    'landing_view', 'form_start', 'validation_error', 'submit_attempt',
    'lead_saved', 'redirect_started', 'redirect_unique'
    , 'web_vital', 'api_request'
  ) then
    raise exception 'invalid_event_name' using errcode = '22023';
  end if;
  if p_session_id is not null and char_length(p_session_id) > 128 then
    raise exception 'invalid_session_id' using errcode = '22023';
  end if;
  if p_occurred_at is not null
     and (p_occurred_at < now() - interval '7 days' or p_occurred_at > now() + interval '10 minutes') then
    raise exception 'invalid_occurred_at' using errcode = '22023';
  end if;

  if p_lead_reference is not null then
    select id into v_lead_id
    from public.leads
    where public_reference = p_lead_reference;
  end if;

  insert into public.funnel_events (
    lead_id, event_name, event_id, page, session_id, metadata,
    occurred_at, ip_hash, consent_analytics, duration_ms, is_suspicious,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) values (
    v_lead_id,
    v_name::public.funnel_event_name,
    p_event_id,
    nullif(left(p_page, 500), ''),
    case when coalesce(p_consent_analytics, false)
      then nullif(left(p_session_id, 128), '') else null end,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now()),
    case when coalesce(p_consent_analytics, false) then p_ip_hash else null end,
    coalesce(p_consent_analytics, false),
    p_duration_ms,
    coalesce(p_is_suspicious, false),
    nullif(left(btrim(p_utm_source), 200), ''),
    nullif(left(btrim(p_utm_medium), 200), ''),
    nullif(left(btrim(p_utm_campaign), 200), ''),
    nullif(left(btrim(p_utm_content), 200), ''),
    nullif(left(btrim(p_utm_term), 200), '')
  ) on conflict do nothing;
  get diagnostics v_inserted_count = row_count;

  if v_inserted_count > 0 and v_name = 'redirect_unique' and v_lead_id is not null then
    update public.leads
    set whatsapp_clicked_at = coalesce(whatsapp_clicked_at, now()),
        funnel_stage = 'whatsapp',
        last_seen_at = now()
    where id = v_lead_id;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'inserted', v_inserted_count > 0,
    'event_name', v_name
  );
end;
$$;

create or replace function public.claim_meta_outbox_secure(
  p_limit integer default 10,
  p_event_id uuid default null
)
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select o.id
    from public.meta_event_outbox o
    where (
      (o.status in ('pending', 'retry') and o.next_attempt_at <= now())
      or (o.status = 'processing' and o.locked_at < now() - interval '5 minutes')
    )
      and o.attempts < 6
      and (p_event_id is null or o.event_id = p_event_id)
    order by o.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update public.meta_event_outbox o
    set status = 'processing',
        attempts = o.attempts + 1,
        locked_at = now(),
        updated_at = now()
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select jsonb_build_object(
    'id', c.id,
    'eventId', c.event_id,
    'eventName', c.event_name,
    'eventTime', extract(epoch from c.created_at)::bigint,
    'eventSourceUrl', c.event_source_url,
    'clientUserAgent', c.client_user_agent,
    'clientIp', c.client_ip::text,
    'fbc', c.fbc,
    'fbp', c.fbp,
    'attempts', c.attempts,
    'lead', jsonb_build_object(
      'publicReference', l.public_reference,
      'email', l.email_normalized,
      'phoneE164', l.phone_e164,
      'name', l.name,
      'countryIso', l.country_iso
    )
  )
  from claimed c
  join public.leads l on l.id = c.lead_id;
$$;

create or replace function public.finish_meta_outbox_secure(
  p_outbox_id uuid,
  p_success boolean,
  p_http_status integer,
  p_latency_ms integer,
  p_response_code text,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts
  from public.meta_event_outbox
  where id = p_outbox_id
  for update;
  if not found then return false; end if;

  update public.meta_event_outbox
  set status = case
        when p_success then 'sent'
        when v_attempts >= 6 then 'dead'
        else 'retry'
      end,
      next_attempt_at = case
        when p_success or v_attempts >= 6 then next_attempt_at
        else now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(v_attempts - 1, 0))::integer))
      end,
      locked_at = null,
      sent_at = case when p_success then now() else sent_at end,
      latency_ms = greatest(0, least(coalesce(p_latency_ms, 0), 120000)),
      http_status = case when p_http_status between 100 and 599 then p_http_status else null end,
      response_code = nullif(left(p_response_code, 80), ''),
      error_code = case when p_success then null else nullif(left(p_error_code, 120), '') end,
      -- Raw IP is needed only while a retry is possible.
      client_ip = case when p_success or v_attempts >= 6 then null else client_ip end,
      updated_at = now()
  where id = p_outbox_id;
  return true;
end;
$$;

create or replace function public.record_api_metric_secure(
  p_endpoint text,
  p_status_code integer,
  p_duration_ms integer,
  p_success boolean,
  p_event_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.api_request_metrics
    (endpoint, status_code, duration_ms, success, event_id)
  values (
    left(coalesce(nullif(btrim(p_endpoint), ''), 'unknown'), 80),
    greatest(100, least(coalesce(p_status_code, 500), 599)),
    greatest(0, least(coalesce(p_duration_ms, 0), 120000)),
    coalesce(p_success, false),
    p_event_id
  );
  select true;
$$;

create or replace function public.verify_dashboard_token_secure(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid boolean;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update private.dashboard_access_tokens
  set last_used_at = now()
  where token_hash = p_token_hash
    and active
    and (expires_at is null or expires_at > now())
  returning true into v_valid;
  return coalesce(v_valid, false);
end;
$$;

create or replace function public.submit_data_subject_request_secure(
  p_request_type text,
  p_requester_name text,
  p_email text,
  p_email_hash text,
  p_phone_e164 text,
  p_requested_changes jsonb,
  p_ip_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference uuid;
  v_email text := lower(btrim(p_email));
begin
  if p_request_type not in ('access', 'correction', 'deletion', 'revocation', 'portability') then
    raise exception 'invalid_request_type' using errcode = '22023';
  end if;
  if char_length(btrim(p_requester_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_email_hash' using errcode = '22023';
  end if;
  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  insert into public.data_subject_requests (
    request_type, requester_name, email, email_hash, phone_e164, requested_changes, ip_hash
  ) values (
    p_request_type, btrim(p_requester_name), v_email, p_email_hash, p_phone_e164,
    coalesce(p_requested_changes, '{}'::jsonb), p_ip_hash
  ) returning public_reference into v_reference;
  return v_reference;
end;
$$;

create or replace function public.get_data_subject_export_secure(
  p_request_reference uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_subject_requests%rowtype;
  v_lead public.leads%rowtype;
begin
  select * into v_request
  from public.data_subject_requests
  where public_reference = p_request_reference;
  if not found or v_request.status not in ('verified', 'in_progress') then
    raise exception 'request_not_verified' using errcode = '22023';
  end if;

  select * into v_lead
  from public.leads
  where email_normalized = v_request.email_normalized;
  if not found then return jsonb_build_object('lead', null, 'consents', '[]'::jsonb); end if;

  return jsonb_build_object(
    'lead', to_jsonb(v_lead) - 'id' - 'public_reference',
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', c.consent_type,
        'granted', c.granted,
        'policyVersion', c.policy_version,
        'sourcePage', c.source_page,
        'createdAt', c.created_at,
        'revokedAt', c.revoked_at
      ) order by c.created_at)
      from public.consents c where c.lead_id = v_lead.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.delete_verified_data_subject_secure(
  p_request_reference uuid,
  p_resolution_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_subject_requests%rowtype;
  v_lead_id uuid;
begin
  select * into v_request
  from public.data_subject_requests
  where public_reference = p_request_reference
  for update;
  if not found or v_request.request_type <> 'deletion' or v_request.status <> 'verified' then
    raise exception 'verified_deletion_request_required' using errcode = '22023';
  end if;

  select id into v_lead_id from public.leads
  where email_normalized = v_request.email_normalized;
  if v_lead_id is not null then
    delete from public.leads where id = v_lead_id;
  end if;

  update public.data_subject_requests
  set status = 'completed',
      completed_at = now(),
      resolution_note = left(coalesce(p_resolution_note, 'Exclusao concluida.'), 1000),
      email = 'removed+' || left(email_hash, 16) || '@invalid.local',
      requester_name = 'Titular removido',
      phone_e164 = null,
      requested_changes = '{}'::jsonb
  where id = v_request.id;
  return true;
end;
$$;

create or replace function public.run_retention_secure()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events integer;
  v_metrics integer;
  v_limits integer;
  v_outbox integer;
begin
  delete from public.funnel_events
  where lead_id is null and occurred_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.api_request_metrics where created_at < now() - interval '90 days';
  get diagnostics v_metrics = row_count;

  delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics v_limits = row_count;

  delete from public.meta_event_outbox
  where status in ('sent', 'dead') and updated_at < now() - interval '30 days';
  get diagnostics v_outbox = row_count;

  return jsonb_build_object(
    'anonymous_events_deleted', v_events,
    'api_metrics_deleted', v_metrics,
    'rate_limits_deleted', v_limits,
    'outbox_deleted', v_outbox
  );
end;
$$;

create or replace function public.preview_lead_retention_secure()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'eligible', count(*) filter (where retention_until <= now() and not legal_hold),
    'onLegalHold', count(*) filter (where retention_until <= now() and legal_hold),
    'withoutDecision', count(*) filter (where retention_until is null)
  )
  from public.leads;
$$;

create or replace function public.delete_expired_leads_secure(p_confirmation text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_confirmation <> 'DELETE_EXPIRED_LEADS' then
    raise exception 'explicit_confirmation_required' using errcode = '22023';
  end if;
  delete from public.leads
  where retention_until <= now() and not legal_hold;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.get_funnel_dashboard_secure(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_start timestamptz;
  v_landing integer;
  v_form integer;
  v_submit integer;
  v_leads integer;
  v_redirects integer;
  v_group integer;
  v_capi_success integer;
  v_capi_failed integer;
  v_api_p95 numeric;
  v_utm numeric;
  v_validation_errors integer;
  v_daily jsonb;
  v_campaigns jsonb;
  v_snapshots jsonb;
  v_alerts jsonb;
begin
  v_start := date_trunc('day', now()) - make_interval(days => v_days - 1);

  select
    count(*) filter (where e.event_name::text = 'landing_view'),
    count(*) filter (where e.event_name::text = 'form_start'),
    count(*) filter (where e.event_name::text = 'submit_attempt'),
    count(*) filter (where e.event_name::text = 'validation_error')
  into v_landing, v_form, v_submit, v_validation_errors
  from public.funnel_events e
  where e.occurred_at >= v_start and not e.is_suspicious;

  select count(*) into v_leads
  from public.leads l where l.created_at >= v_start;
  select count(*) into v_redirects
  from public.leads l where l.whatsapp_clicked_at >= v_start;
  select coalesce((select member_count from public.group_member_snapshots order by captured_at desc limit 1), 0)
  into v_group;
  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status in ('retry', 'dead'))
  into v_capi_success, v_capi_failed
  from public.meta_event_outbox where created_at >= v_start;
  select coalesce(percentile_cont(0.95) within group (order by duration_ms), 0)
  into v_api_p95
  from public.api_request_metrics
  where endpoint = 'create-lead' and created_at >= v_start;
  select coalesce(round(100.0 * count(*) filter (
      where coalesce(first_touch ->> 'utm_source', '') <> ''
         or coalesce(first_touch ->> 'utm_campaign', '') <> ''
    ) / nullif(count(*), 0), 2), 0)
  into v_utm
  from public.leads where created_at >= v_start;

  select coalesce(jsonb_agg(row_data order by day), '[]'::jsonb) into v_daily
  from (
    select d::date as day,
      jsonb_build_object(
        'date', d::date,
        'landingViews', (select count(*) from public.funnel_events e where e.occurred_at >= d and e.occurred_at < d + interval '1 day' and e.event_name::text = 'landing_view' and not e.is_suspicious),
        'formStarts', (select count(*) from public.funnel_events e where e.occurred_at >= d and e.occurred_at < d + interval '1 day' and e.event_name::text = 'form_start' and not e.is_suspicious),
        'submitAttempts', (select count(*) from public.funnel_events e where e.occurred_at >= d and e.occurred_at < d + interval '1 day' and e.event_name::text = 'submit_attempt' and not e.is_suspicious),
        'leadsSaved', (select count(*) from public.leads l where l.created_at >= d and l.created_at < d + interval '1 day'),
        'redirectsUnique', (select count(*) from public.leads l where l.whatsapp_clicked_at >= d and l.whatsapp_clicked_at < d + interval '1 day'),
        'spend', coalesce((select sum(m.spend) from public.meta_campaign_daily m where m.metric_date = d::date), 0),
        'linkClicks', coalesce((select sum(m.link_clicks) from public.meta_campaign_daily m where m.metric_date = d::date), 0)
      ) as row_data
    from generate_series(v_start, date_trunc('day', now()), interval '1 day') d
  ) q;

  select coalesce(jsonb_agg(row_data order by leads_saved desc, campaign), '[]'::jsonb)
  into v_campaigns
  from (
    select campaign,
      jsonb_build_object(
        'campaign', campaign,
        'leadsSaved', count(*),
        'redirectsUnique', count(*) filter (where whatsapp_clicked_at is not null),
        'spend', coalesce((select sum(m.spend) from public.meta_campaign_daily m where m.metric_date >= v_start::date and m.campaign_name = campaign), 0),
        'linkClicks', coalesce((select sum(m.link_clicks) from public.meta_campaign_daily m where m.metric_date >= v_start::date and m.campaign_name = campaign), 0),
        'impressions', coalesce((select sum(m.impressions) from public.meta_campaign_daily m where m.metric_date >= v_start::date and m.campaign_name = campaign), 0)
      ) as row_data,
      count(*) as leads_saved
    from (
      select coalesce(nullif(first_touch ->> 'utm_campaign', ''), '(sem campanha)') as campaign,
             whatsapp_clicked_at
      from public.leads where created_at >= v_start
    ) l
    group by campaign
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'count', member_count,
    'capturedAt', captured_at,
    'source', source,
    'note', note
  ) order by captured_at), '[]'::jsonb)
  into v_snapshots
  from public.group_member_snapshots
  where captured_at >= v_start;

  select coalesce(jsonb_agg(alert), '[]'::jsonb) into v_alerts
  from (
    select jsonb_build_object('level', 'critical', 'code', 'no_leads', 'message', 'Nenhum lead salvo no periodo.') alert where v_leads = 0
    union all
    select jsonb_build_object('level', 'warning', 'code', 'utm_coverage', 'message', 'Cobertura UTM abaixo de 95%.') where v_utm < 95
    union all
    select jsonb_build_object('level', 'warning', 'code', 'redirect_rate', 'message', 'Menos de 90% dos leads chegaram ao redirecionamento.') where v_leads > 0 and (100.0 * v_redirects / v_leads) < 90
    union all
    select jsonb_build_object('level', 'critical', 'code', 'api_latency', 'message', 'p95 da captura acima de 2 segundos.') where v_api_p95 > 2000
    union all
    select jsonb_build_object('level', 'critical', 'code', 'capi_failure', 'message', 'Falhas da CAPI acima de 5%.') where (v_capi_success + v_capi_failed) > 0 and (100.0 * v_capi_failed / (v_capi_success + v_capi_failed)) > 5
    union all
    select jsonb_build_object('level', 'warning', 'code', 'form_errors', 'message', 'Erros de validacao acima de 2% dos envios.') where v_submit > 0 and (100.0 * v_validation_errors / v_submit) > 2
  ) a;

  return jsonb_build_object(
    'generatedAt', now(),
    'source', 'supabase_first_party',
    'summary', jsonb_build_object(
      'landingViews', coalesce(v_landing, 0),
      'formStarts', coalesce(v_form, 0),
      'submitAttempts', coalesce(v_submit, 0),
      'leadsSaved', coalesce(v_leads, 0),
      'redirectsUnique', coalesce(v_redirects, 0),
      'groupMembers', coalesce(v_group, 0),
      'capiSuccess', coalesce(v_capi_success, 0),
      'capiFailed', coalesce(v_capi_failed, 0),
      'apiP95Ms', round(coalesce(v_api_p95, 0), 0),
      'utmCoverage', coalesce(v_utm, 0)
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object('key', 'landingViews', 'label', 'Visitas', 'value', coalesce(v_landing, 0), 'rate', 100),
      jsonb_build_object('key', 'formStarts', 'label', 'Inicios de formulario', 'value', coalesce(v_form, 0), 'rate', case when v_landing > 0 then round(100.0 * v_form / v_landing, 2) else 0 end),
      jsonb_build_object('key', 'leadsSaved', 'label', 'Leads salvos', 'value', coalesce(v_leads, 0), 'rate', case when v_form > 0 then round(100.0 * v_leads / v_form, 2) else 0 end),
      jsonb_build_object('key', 'redirectsUnique', 'label', 'Redirecionamentos unicos', 'value', coalesce(v_redirects, 0), 'rate', case when v_leads > 0 then round(100.0 * v_redirects / v_leads, 2) else 0 end),
      jsonb_build_object('key', 'groupMembers', 'label', 'Membros no grupo', 'value', coalesce(v_group, 0), 'rate', case when v_redirects > 0 then round(100.0 * v_group / v_redirects, 2) else 0 end)
    ),
    'daily', v_daily,
    'campaigns', v_campaigns,
    'health', jsonb_build_object(
      'validationErrors', coalesce(v_validation_errors, 0),
      'apiP95Ms', round(coalesce(v_api_p95, 0), 0),
      'utmCoverage', coalesce(v_utm, 0),
      'capiSuccess', coalesce(v_capi_success, 0),
      'capiFailed', coalesce(v_capi_failed, 0),
      'pendingCapi', (select count(*) from public.meta_event_outbox where status in ('pending', 'retry', 'processing'))
    ),
    'groupSnapshots', v_snapshots,
    'alerts', v_alerts
  );
end;
$$;

revoke all on function public.capture_lead_secure_v3(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, boolean, boolean, boolean, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.capture_lead_secure_v3(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, boolean, boolean, boolean, text, text, text, text, text, text, jsonb
) to service_role;

revoke all on function public.record_first_party_event_secure(
  uuid, text, uuid, text, text, timestamptz, boolean,
  text, text, text, text, text, jsonb, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.record_first_party_event_secure(
  uuid, text, uuid, text, text, timestamptz, boolean,
  text, text, text, text, text, jsonb, text, integer, boolean
) to service_role;

revoke all on function public.claim_meta_outbox_secure(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_meta_outbox_secure(integer, uuid) to service_role;
revoke all on function public.finish_meta_outbox_secure(uuid, boolean, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.finish_meta_outbox_secure(uuid, boolean, integer, integer, text, text) to service_role;
revoke all on function public.record_api_metric_secure(text, integer, integer, boolean, uuid) from public, anon, authenticated;
grant execute on function public.record_api_metric_secure(text, integer, integer, boolean, uuid) to service_role;
revoke all on function public.verify_dashboard_token_secure(text) from public, anon, authenticated;
grant execute on function public.verify_dashboard_token_secure(text) to service_role;
revoke all on function public.submit_data_subject_request_secure(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_data_subject_request_secure(text, text, text, text, text, jsonb, text) to service_role;
revoke all on function public.get_data_subject_export_secure(uuid) from public, anon, authenticated;
grant execute on function public.get_data_subject_export_secure(uuid) to service_role;
revoke all on function public.delete_verified_data_subject_secure(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_verified_data_subject_secure(uuid, text) to service_role;
revoke all on function public.run_retention_secure() from public, anon, authenticated;
grant execute on function public.run_retention_secure() to service_role;
revoke all on function public.preview_lead_retention_secure() from public, anon, authenticated;
grant execute on function public.preview_lead_retention_secure() to service_role;
revoke all on function public.delete_expired_leads_secure(text) from public, anon, authenticated;
grant execute on function public.delete_expired_leads_secure(text) to service_role;
revoke all on function public.get_funnel_dashboard_secure(integer) from public, anon, authenticated;
grant execute on function public.get_funnel_dashboard_secure(integer) to service_role;

comment on table public.lead_submissions is
  'Idempotency ledger. A retried request returns the original result without duplicate consent or conversion rows.';
comment on table public.meta_event_outbox is
  'Backend-only CAPI outbox. Raw IP is cleared after success or terminal failure; response bodies are never stored.';
comment on table public.data_subject_requests is
  'LGPD request registry. Identity must be verified out of band before export, correction or deletion.';
comment on function public.get_funnel_dashboard_secure(integer) is
  'Aggregate-only operational dashboard. It never returns lead-level PII.';
