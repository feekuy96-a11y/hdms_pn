-- Cap the timeline history returned by doh_get_system_data_rpc() to the latest 60 updates per flood point.
--
-- Why: the RPC returned EVERY row of doh_timeline_updates. The table grows with each field report, and the
-- whole result is downloaded by every visitor on page load, every 30 minutes, and again after every admin
-- save. The water-level chart and the "latest updates" list only need recent history.
--
-- This patches the function that is deployed in the database (same technique as
-- db/incident-soft-delete-and-admin.sql) instead of replacing it, so earlier patches such as soft-delete
-- filters are preserved. If the deployed definition does not look as expected it raises an error and
-- changes nothing. Running it twice is safe.
-- Apply with the Supabase SQL editor (or `supabase db push`). No Edge Function redeploy is needed.
DO $body$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.doh_get_system_data_rpc()'::regprocedure) INTO definition;

  IF position('doh_rn' IN definition) > 0 THEN
    RAISE NOTICE 'doh_get_system_data_rpc already limits timeline history; nothing to do';
    RETURN;
  END IF;

  IF position('FROM doh_timeline_updates t' IN definition) = 0 OR position('to_jsonb(t)' IN definition) = 0 THEN
    RAISE EXCEPTION 'doh_get_system_data_rpc has an unexpected definition; timeline limit not applied (nothing was changed)';
  END IF;

  definition := replace(
    definition,
    'FROM doh_timeline_updates t',
    'FROM (SELECT x.*, row_number() OVER (PARTITION BY x.flood_id_ref ORDER BY x.reported_at DESC) AS doh_rn FROM doh_timeline_updates x) t WHERE t.doh_rn <= 60'
  );
  definition := replace(definition, 'to_jsonb(t)', '(to_jsonb(t) - ''doh_rn'')');
  EXECUTE definition;
END
$body$;
