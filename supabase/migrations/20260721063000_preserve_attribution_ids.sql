-- Preserve the exact Meta hierarchy alongside human-readable UTMs.
-- Backend-only: values are already sanitized by the Edge Function and are
-- validated again here before being merged into first_touch/last_touch.

create or replace function public.enrich_lead_attribution_secure(
  p_lead_reference uuid,
  p_attribution jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
begin
  if jsonb_typeof(coalesce(p_attribution, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_attribution' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_clean
  from jsonb_each_text(coalesce(p_attribution, '{}'::jsonb)) item
  where item.key in ('campaign_id', 'adset_id', 'ad_id', 'placement', 'landing_url')
    and btrim(item.value) <> ''
    and item.value !~ '\{\{[^}]+\}\}'
    and item.value !~ '[[:cntrl:]]'
    and char_length(item.value) <= case when item.key = 'landing_url' then 1000 else 300 end;

  update public.leads
  set first_touch = v_clean || coalesce(first_touch, '{}'::jsonb),
      last_touch = coalesce(last_touch, '{}'::jsonb) || v_clean
  where public_reference = p_lead_reference;

  return found;
end;
$$;

revoke all on function public.enrich_lead_attribution_secure(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.enrich_lead_attribution_secure(uuid, jsonb)
  to service_role;

comment on function public.enrich_lead_attribution_secure(uuid, jsonb) is
  'Adds sanitized campaign, ad set, ad, placement and landing URL identifiers to first/last touch without exposing a public write path.';
