-- Explicit restrictive policies document that browser roles have no direct table access.
-- The Edge Functions use backend-only security-definer RPCs granted solely to service_role.

create policy "deny browser access" on public.leads
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.customers
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.products
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.orders
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.order_items
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.payments
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.webhook_events
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.funnel_events
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.consents
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny browser access" on public.lead_rate_limits
as restrictive for all to anon, authenticated using (false) with check (false);
