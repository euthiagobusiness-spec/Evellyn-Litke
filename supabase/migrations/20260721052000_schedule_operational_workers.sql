-- Durable retries for Meta CAPI and safe housekeeping. The bearer token is
-- read from Vault at execution time; no plaintext secret exists in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname in ('mrc-process-meta-outbox', 'mrc-retention-housekeeping');

select cron.schedule(
  'mrc-process-meta-outbox',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://zsrgdjzouhykatrypdmr.supabase.co/functions/v1/process-meta-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'mrc_capi_worker_token'
          order by created_at desc
          limit 1
        )
      ),
      body := '{"limit":20}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);

select cron.schedule(
  'mrc-retention-housekeeping',
  '17 4 * * *',
  $job$ select public.run_retention_secure(); $job$
);

comment on extension pg_cron is
  'Schedules MRC outbox retries each minute and non-lead housekeeping daily.';
