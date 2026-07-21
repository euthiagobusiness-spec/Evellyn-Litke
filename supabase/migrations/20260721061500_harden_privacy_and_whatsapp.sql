-- Backend-only operational settings. Values are inserted outside source control.
create table if not exists private.funnel_settings (
  setting_key text primary key check (char_length(setting_key) between 2 and 80),
  setting_value text not null check (char_length(setting_value) between 1 and 2000),
  updated_at timestamptz not null default now()
);

revoke all on private.funnel_settings from public, anon, authenticated;
grant select, insert, update, delete on private.funnel_settings to service_role;

create or replace function public.get_funnel_setting_secure(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.setting_value
  from private.funnel_settings s
  where s.setting_key = p_key;
$$;

revoke all on function public.get_funnel_setting_secure(text) from public, anon, authenticated;
grant execute on function public.get_funnel_setting_secure(text) to service_role;

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

  select id into v_lead_id
  from public.leads
  where email_normalized = v_request.email_normalized;

  if v_lead_id is not null then
    update public.api_request_metrics
    set event_id = null
    where event_id in (
      select e.event_id from public.funnel_events e
      where e.lead_id = v_lead_id and e.event_id is not null
    );

    delete from public.meta_event_outbox where lead_id = v_lead_id;
    delete from public.lead_submissions where lead_id = v_lead_id;

    update public.funnel_events
    set lead_id = null,
        session_id = null,
        metadata = jsonb_build_object('anonymized', true),
        ip_hash = null,
        utm_source = null,
        utm_medium = null,
        utm_campaign = null,
        utm_content = null,
        utm_term = null
    where lead_id = v_lead_id;

    delete from public.leads where id = v_lead_id;
  end if;

  update public.data_subject_requests
  set status = 'completed',
      completed_at = now(),
      resolution_note = left(coalesce(p_resolution_note, 'Exclusao concluida.'), 1000),
      email = 'removed+' || left(encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), 16) || '@invalid.local',
      email_hash = encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'),
      requester_name = 'Titular removido',
      phone_e164 = null,
      requested_changes = '{}'::jsonb,
      ip_hash = null
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
  v_outbox_ips integer;
  v_submissions integer;
begin
  delete from public.funnel_events
  where lead_id is null and occurred_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.api_request_metrics where created_at < now() - interval '90 days';
  get diagnostics v_metrics = row_count;

  delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics v_limits = row_count;

  update public.meta_event_outbox
  set client_ip = null,
      updated_at = now()
  where client_ip is not null and created_at < now() - interval '24 hours';
  get diagnostics v_outbox_ips = row_count;

  delete from public.meta_event_outbox
  where status in ('sent', 'dead') and updated_at < now() - interval '30 days';
  get diagnostics v_outbox = row_count;

  delete from public.lead_submissions
  where lead_id is null and created_at < now() - interval '7 days';
  get diagnostics v_submissions = row_count;

  return jsonb_build_object(
    'anonymous_events_deleted', v_events,
    'api_metrics_deleted', v_metrics,
    'rate_limits_deleted', v_limits,
    'outbox_ips_cleared', v_outbox_ips,
    'outbox_deleted', v_outbox,
    'orphan_submissions_deleted', v_submissions
  );
end;
$$;

comment on table private.funnel_settings is
  'Operational values excluded from source control. Access is restricted to service_role.';
