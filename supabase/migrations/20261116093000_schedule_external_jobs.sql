-- Wake the durable Drive/Sheets outbox independently from Admin traffic.
-- Rollback: select cron.unschedule('hdms-process-external-jobs');
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hdms-process-external-jobs') then
    perform cron.unschedule('hdms-process-external-jobs');
  end if;
end;
$$;

select cron.schedule(
  'hdms-process-external-jobs',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://ebyobrtvisylwawxiurx.supabase.co/functions/v1/hdms-api',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"syncReportingRowAction","args":[{"recordId":"system-worker-heartbeat"}],"light":true}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
