-- Secure funnel database for the Metodo Referencia Crista.
-- All writes from the public site go through backend-only RPCs called by Edge Functions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create type public.lead_status as enum (
  'active',
  'inactive',
  'unsubscribed',
  'customer'
);

create type public.funnel_stage as enum (
  'captured',
  'registered',
  'whatsapp',
  'sales_page',
  'checkout',
  'customer'
);

create type public.product_type as enum (
  'main_product',
  'order_bump',
  'upsell',
  'downsell'
);

create type public.order_status as enum (
  'pending',
  'under_review',
  'approved',
  'completed',
  'cancelled',
  'expired',
  'refunded',
  'chargeback'
);

create type public.upsell_status as enum (
  'not_offered',
  'pending',
  'accepted',
  'declined'
);

create type public.payment_status as enum (
  'pending',
  'under_review',
  'approved',
  'failed',
  'cancelled',
  'refunded',
  'chargeback'
);

create type public.funnel_event_name as enum (
  'lead_created',
  'lead_updated',
  'thank_you_registration_viewed',
  'whatsapp_clicked',
  'sales_page_viewed',
  'checkout_clicked',
  'payment_started',
  'payment_pending',
  'payment_approved',
  'upsell_viewed',
  'upsell_accepted',
  'upsell_declined',
  'upsell_purchased',
  'thank_you_purchase_viewed',
  'order_cancelled',
  'order_refunded'
);

create type public.consent_type as enum (
  'privacy_policy',
  'marketing_email',
  'marketing_whatsapp',
  'analytics'
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  public_reference uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  email_normalized text generated always as (lower(btrim(email))) stored,
  phone text not null check (char_length(phone) <= 40),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  lead_status public.lead_status not null default 'active',
  funnel_stage public.funnel_stage not null default 'captured',
  business_stage text check (business_stage is null or char_length(business_stage) <= 100),
  goal text check (goal is null or char_length(goal) <= 160),
  utm_source text check (utm_source is null or char_length(utm_source) <= 200),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 200),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 200),
  utm_content text check (utm_content is null or char_length(utm_content) <= 200),
  utm_term text check (utm_term is null or char_length(utm_term) <= 200),
  gclid text check (gclid is null or char_length(gclid) <= 500),
  fbclid text check (fbclid is null or char_length(fbclid) <= 500),
  referrer text check (referrer is null or char_length(referrer) <= 1000),
  landing_path text check (landing_path is null or char_length(landing_path) <= 500),
  whatsapp_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index leads_email_normalized_key on public.leads (email_normalized);
create index leads_funnel_stage_idx on public.leads (funnel_stage, updated_at desc);
create index leads_whatsapp_clicked_at_idx on public.leads (whatsapp_clicked_at) where whatsapp_clicked_at is not null;
create index leads_created_at_idx on public.leads (created_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  external_customer_id text,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  email_normalized text generated always as (lower(btrim(email))) stored,
  phone text check (phone is null or char_length(phone) <= 40),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_email_normalized_key on public.customers (email_normalized);
create unique index customers_external_customer_id_key on public.customers (external_customer_id)
  where external_customer_id is not null;
create index customers_lead_id_idx on public.customers (lead_id) where lead_id is not null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  external_product_id text,
  name text not null check (char_length(name) between 2 and 160),
  product_type public.product_type not null,
  price numeric(12, 2) check (price is null or price >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_external_product_id_key on public.products (external_product_id)
  where external_product_id is not null;
create index products_type_active_idx on public.products (product_type, active);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  external_transaction_id text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.order_status not null default 'pending',
  payment_method text check (payment_method is null or char_length(payment_method) <= 80),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  upsell_status public.upsell_status not null default 'not_offered',
  approved_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_external_transaction_id_key unique (external_transaction_id)
);

create index orders_customer_id_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  external_item_id text,
  item_type public.product_type not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index order_items_external_item_id_key on public.order_items (external_item_id)
  where external_item_id is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  external_payment_id text,
  payment_method text check (payment_method is null or char_length(payment_method) <= 80),
  status public.payment_status not null default 'pending',
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payments_external_payment_id_key on public.payments (external_payment_id)
  where external_payment_id is not null;
create index payments_order_id_idx on public.payments (order_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 80),
  external_event_id text not null check (char_length(external_event_id) <= 255),
  event_type text not null check (char_length(event_type) <= 160),
  transaction_id text,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_events_provider_external_event_key unique (provider, external_event_id)
);

create index webhook_events_processing_idx on public.webhook_events (processed, received_at);
create index webhook_events_transaction_id_idx on public.webhook_events (transaction_id)
  where transaction_id is not null;

create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  event_name public.funnel_event_name not null,
  page text check (page is null or char_length(page) <= 500),
  session_id text check (session_id is null or char_length(session_id) <= 128),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint funnel_events_subject_check check (
    lead_id is not null or customer_id is not null or order_id is not null
  )
);

create index funnel_events_lead_idx on public.funnel_events (lead_id, created_at desc)
  where lead_id is not null;
create index funnel_events_customer_idx on public.funnel_events (customer_id, created_at desc)
  where customer_id is not null;
create index funnel_events_order_idx on public.funnel_events (order_id, created_at desc)
  where order_id is not null;
create index funnel_events_name_idx on public.funnel_events (event_name, created_at desc);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  consent_type public.consent_type not null,
  granted boolean not null,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  source_page text not null check (char_length(source_page) <= 500),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint consents_revocation_check check (revoked_at is null or granted = true)
);

create index consents_lead_type_idx on public.consents (lead_id, consent_type, created_at desc);
create index consents_granted_idx on public.consents (consent_type, granted, created_at desc);

create table public.lead_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  endpoint text not null check (char_length(endpoint) <= 80),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  constraint lead_rate_limits_window_key unique (ip_hash, endpoint, window_started_at)
);

create index lead_rate_limits_updated_at_idx on public.lead_rate_limits (updated_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at before update on public.leads
for each row execute function private.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function private.set_updated_at();
create trigger order_items_set_updated_at before update on public.order_items
for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function private.set_updated_at();

create or replace function public.capture_lead_secure(
  p_name text,
  p_email text,
  p_phone text,
  p_phone_e164 text,
  p_business_stage text,
  p_goal text,
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

  insert into public.leads (
    name, email, phone, phone_e164, business_stage, goal,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, referrer, landing_path
  ) values (
    btrim(p_name), v_email, btrim(p_phone), p_phone_e164,
    nullif(btrim(p_business_stage), ''), nullif(btrim(p_goal), ''),
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
           business_stage = coalesce(nullif(btrim(p_business_stage), ''), business_stage),
           goal = coalesce(nullif(btrim(p_goal), ''), goal),
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

create or replace function public.track_funnel_event_secure(
  p_lead_reference uuid,
  p_event_name public.funnel_event_name,
  p_page text,
  p_session_id text,
  p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
begin
  select id into v_lead_id
    from public.leads
   where public_reference = p_lead_reference;

  if v_lead_id is null then
    return false;
  end if;

  if p_event_name = 'whatsapp_clicked' then
    update public.leads
       set whatsapp_clicked_at = coalesce(whatsapp_clicked_at, now()),
           funnel_stage = 'whatsapp'
     where id = v_lead_id;
  elsif p_event_name = 'thank_you_registration_viewed' then
    update public.leads
       set funnel_stage = case when funnel_stage = 'captured' then 'registered' else funnel_stage end
     where id = v_lead_id;
  elsif p_event_name = 'sales_page_viewed' then
    update public.leads set funnel_stage = 'sales_page' where id = v_lead_id;
  elsif p_event_name = 'checkout_clicked' then
    update public.leads set funnel_stage = 'checkout' where id = v_lead_id;
  end if;

  insert into public.funnel_events (lead_id, event_name, page, session_id, metadata)
  values (
    v_lead_id,
    p_event_name,
    nullif(left(p_page, 500), ''),
    nullif(left(p_session_id, 128), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

create or replace function public.check_lead_rate_limit_secure(
  p_ip_hash text,
  p_endpoint text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if char_length(p_ip_hash) <> 64
     or p_limit < 1 or p_limit > 100
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.lead_rate_limits (ip_hash, endpoint, window_started_at)
  values (p_ip_hash, left(p_endpoint, 80), v_window)
  on conflict (ip_hash, endpoint, window_started_at)
  do update set request_count = public.lead_rate_limits.request_count + 1,
                updated_at = now()
  returning request_count into v_count;

  if random() < 0.02 then
    delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after_seconds', greatest(
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
      1
    )
  );
end;
$$;

revoke all on function public.capture_lead_secure(
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean, boolean, boolean, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.capture_lead_secure(
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean, boolean, boolean, text, text, text, text, text, jsonb
) to service_role;

revoke all on function public.track_funnel_event_secure(uuid, public.funnel_event_name, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.track_funnel_event_secure(uuid, public.funnel_event_name, text, text, jsonb)
  to service_role;

revoke all on function public.check_lead_rate_limit_secure(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_lead_rate_limit_secure(text, text, integer, integer)
  to service_role;

alter table public.leads enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.funnel_events enable row level security;
alter table public.consents enable row level security;
alter table public.lead_rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

create view private.segment_leads_registered
with (security_invoker = true)
as
select id, name, email_normalized as email, phone_e164 as phone, created_at, updated_at
from public.leads
where lead_status = 'active';

create view private.segment_leads_in_whatsapp
with (security_invoker = true)
as
select id, name, email_normalized as email, phone_e164 as phone, whatsapp_clicked_at
from public.leads
where whatsapp_clicked_at is not null;

create view private.segment_leads_not_in_whatsapp
with (security_invoker = true)
as
select id, name, email_normalized as email, phone_e164 as phone, created_at
from public.leads
where whatsapp_clicked_at is null and lead_status = 'active';

create view private.segment_sales_page_visitors
with (security_invoker = true)
as
select distinct l.id, l.name, l.email_normalized as email, l.phone_e164 as phone
from public.leads l
join public.funnel_events e on e.lead_id = l.id
where e.event_name = 'sales_page_viewed';

create view private.segment_checkout_clicks
with (security_invoker = true)
as
select distinct l.id, l.name, l.email_normalized as email, l.phone_e164 as phone
from public.leads l
join public.funnel_events e on e.lead_id = l.id
where e.event_name = 'checkout_clicked';

create view private.segment_leads_without_purchase
with (security_invoker = true)
as
select l.id, l.name, l.email_normalized as email, l.phone_e164 as phone, l.created_at
from public.leads l
where not exists (
  select 1 from public.customers c
  join public.orders o on o.customer_id = c.id
  where c.lead_id = l.id and o.status in ('approved', 'completed')
);

create view private.segment_pending_payments
with (security_invoker = true)
as
select o.id as order_id, c.name, c.email_normalized as email, c.phone_e164 as phone,
       o.total_amount, o.currency, o.created_at
from public.orders o
join public.customers c on c.id = o.customer_id
where o.status in ('pending', 'under_review');

create view private.segment_main_product_buyers
with (security_invoker = true)
as
select distinct c.id as customer_id, c.name, c.email_normalized as email, c.phone_e164 as phone
from public.customers c
join public.orders o on o.customer_id = c.id
join public.order_items oi on oi.order_id = o.id
where oi.item_type = 'main_product' and o.status in ('approved', 'completed');

create view private.segment_upsell_buyers
with (security_invoker = true)
as
select distinct c.id as customer_id, c.name, c.email_normalized as email, c.phone_e164 as phone
from public.customers c
join public.orders o on o.customer_id = c.id
join public.order_items oi on oi.order_id = o.id
where oi.item_type = 'upsell' and o.status in ('approved', 'completed');

create view private.segment_buyers_without_upsell
with (security_invoker = true)
as
select distinct c.id as customer_id, c.name, c.email_normalized as email, c.phone_e164 as phone
from public.customers c
join public.orders o on o.customer_id = c.id
where o.status in ('approved', 'completed')
  and exists (select 1 from public.order_items i where i.order_id = o.id and i.item_type = 'main_product')
  and not exists (select 1 from public.order_items i where i.order_id = o.id and i.item_type = 'upsell');

create view private.segment_cancelled_orders
with (security_invoker = true)
as
select o.id as order_id, c.name, c.email_normalized as email, c.phone_e164 as phone,
       o.total_amount, o.currency, o.cancelled_at
from public.orders o
join public.customers c on c.id = o.customer_id
where o.status in ('cancelled', 'expired');

create view private.segment_refunded_orders
with (security_invoker = true)
as
select o.id as order_id, c.name, c.email_normalized as email, c.phone_e164 as phone,
       o.total_amount, o.currency, o.refunded_at
from public.orders o
join public.customers c on c.id = o.customer_id
where o.status in ('refunded', 'chargeback');

grant select on all tables in schema private to service_role;

comment on table public.webhook_events is
  'Backend-only audit log. Define provider-specific payload retention before enabling payment webhooks.';
comment on table public.consents is
  'Append-only consent history. Revocations create a new record or set revoked_at without deleting history.';
comment on function public.capture_lead_secure is
  'Backend-only transactional lead upsert with consent and funnel event registration.';
comment on function public.track_funnel_event_secure is
  'Backend-only event registration using an opaque lead reference.';
