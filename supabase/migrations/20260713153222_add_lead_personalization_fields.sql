alter table public.leads
  add column country_iso text
    check (country_iso is null or country_iso ~ '^[A-Z]{2}$'),
  add column country_calling_code text
    check (country_calling_code is null or country_calling_code ~ '^\+[1-9][0-9]{0,3}$'),
  add column niche text
    check (niche is null or char_length(niche) <= 120),
  add column instagram_handle text
    check (instagram_handle is null or char_length(instagram_handle) <= 160),
  add column audience_size text
    check (audience_size is null or char_length(audience_size) <= 40),
  add column biggest_challenge text
    check (biggest_challenge is null or char_length(biggest_challenge) <= 120),
  add column preferred_contact_period text
    check (preferred_contact_period is null or char_length(preferred_contact_period) <= 40);

update public.leads
   set country_iso = 'BR',
       country_calling_code = '+55'
 where phone_e164 like '+55%'
   and country_iso is null;

create or replace function public.capture_lead_secure_v2(
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
  v_event public.funnel_event_name;
  v_email text := lower(btrim(p_email));
  v_country_iso text := upper(btrim(p_country_iso));
begin
  if p_consent_privacy is not true then
    raise exception 'privacy_consent_required' using errcode = '22023';
  end if;

  if char_length(btrim(p_name)) not between 2 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
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

  insert into public.leads (
    name, email, phone, phone_e164, country_iso, country_calling_code,
    business_stage, goal, niche, instagram_handle, audience_size,
    biggest_challenge, preferred_contact_period,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, referrer, landing_path
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
    nullif(btrim(p_landing_path), '')
  )
  on conflict (email_normalized) do nothing
  returning id, public_reference into v_lead_id, v_reference;

  if found then
    v_event := 'lead_created';
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
           utm_source = coalesce(nullif(btrim(p_utm_source), ''), utm_source),
           utm_medium = coalesce(nullif(btrim(p_utm_medium), ''), utm_medium),
           utm_campaign = coalesce(nullif(btrim(p_utm_campaign), ''), utm_campaign),
           utm_content = coalesce(nullif(btrim(p_utm_content), ''), utm_content),
           utm_term = coalesce(nullif(btrim(p_utm_term), ''), utm_term),
           gclid = coalesce(nullif(btrim(p_gclid), ''), gclid),
           fbclid = coalesce(nullif(btrim(p_fbclid), ''), fbclid),
           referrer = coalesce(nullif(btrim(p_referrer), ''), referrer),
           landing_path = coalesce(nullif(btrim(p_landing_path), ''), landing_path)
     where email_normalized = v_email
     returning id, public_reference into v_lead_id, v_reference;
    v_event := 'lead_updated';
  end if;

  insert into public.consents (
    lead_id, consent_type, granted, policy_version, source_page, ip_hash, user_agent
  ) values
    (v_lead_id, 'privacy_policy', true, p_policy_version, p_source_page, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'marketing_email', coalesce(p_consent_marketing, false), p_policy_version, p_source_page, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'marketing_whatsapp', coalesce(p_consent_marketing, false), p_policy_version, p_source_page, p_ip_hash, left(p_user_agent, 512)),
    (v_lead_id, 'analytics', coalesce(p_consent_analytics, false), p_policy_version, p_source_page, p_ip_hash, left(p_user_agent, 512));

  insert into public.funnel_events (lead_id, event_name, page, session_id, metadata)
  values (
    v_lead_id,
    v_event,
    nullif(left(p_source_page, 500), ''),
    nullif(left(p_session_id, 128), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'lead_reference', v_reference,
    'event_name', v_event::text
  );
end;
$$;

revoke all on function public.capture_lead_secure_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.capture_lead_secure_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text, text, text, text, text, jsonb
) to service_role;
