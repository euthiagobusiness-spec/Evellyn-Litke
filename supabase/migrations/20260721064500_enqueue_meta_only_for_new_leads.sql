-- Prevent an updated/repeated lead from entering the Meta CAPI outbox.
-- The decision is made inside the same transaction that creates or updates the
-- lead, removing the race between an Edge Function delete and the cron worker.

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_updated text;
begin
  v_oid := pg_catalog.to_regprocedure(
    'public.capture_lead_secure_v3(uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,text,jsonb)'
  )::oid;

  if v_oid is null then
    raise exception 'capture_lead_secure_v3_not_found';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);

  v_updated := v_definition;

  if pg_catalog.strpos(
    v_definition,
    'if coalesce(p_consent_analytics, false) then'
  ) > 0 then
    v_updated := pg_catalog.replace(
      v_updated,
      'if coalesce(p_consent_analytics, false) then',
      'if coalesce(p_consent_analytics, false) and v_lead_action = ''created'' then'
    );
  end if;

  if pg_catalog.strpos(
    v_definition,
    '''meta_queued'', coalesce(p_consent_analytics, false),'
  ) > 0 then
    v_updated := pg_catalog.replace(
      v_updated,
      '''meta_queued'', coalesce(p_consent_analytics, false),',
      '''meta_queued'', coalesce(p_consent_analytics, false) and v_lead_action = ''created'','
    );
  end if;

  if pg_catalog.strpos(
    v_updated,
    'if coalesce(p_consent_analytics, false) and v_lead_action = ''created'' then'
  ) = 0 or pg_catalog.strpos(
    v_updated,
    '''meta_queued'', coalesce(p_consent_analytics, false) and v_lead_action = ''created'','
  ) = 0 or pg_catalog.strpos(
    v_updated,
    'if coalesce(p_consent_analytics, false) then'
  ) > 0 or pg_catalog.strpos(
    v_updated,
    '''meta_queued'', coalesce(p_consent_analytics, false),'
  ) > 0 then
    raise exception 'capture_lead_secure_v3_unexpected_definition';
  end if;

  if v_updated <> v_definition then
    execute v_updated;
  end if;
end;
$migration$;

comment on function public.capture_lead_secure_v3(
  uuid, text, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text,
  text, boolean, boolean, boolean, text, text, text, text, text, text, jsonb
) is 'Atomic idempotent capture. Only a newly created lead with analytics consent may enqueue one Meta conversion.';
