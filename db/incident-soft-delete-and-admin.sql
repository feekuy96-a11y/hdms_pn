ALTER TABLE public.doh_flood_routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.doh_detour_routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $body$
DECLARE t text; definition text;
BEGIN
FOREACH t IN ARRAY ARRAY['doh_flood_routes','doh_detour_routes','doh_timeline_updates','doh_mitigation_projects','doh_highway_layers','doh_offices','doh_map_styles','doh_system_settings'] LOOP
EXECUTE format('ALTER POLICY %I ON public.%I USING ((auth.jwt()->''app_metadata''->>''role'') IN (''admin'',''doh_admin'')) WITH CHECK ((auth.jwt()->''app_metadata''->>''role'') IN (''admin'',''doh_admin''))',t||'_admin_write',t);
END LOOP;
SELECT pg_get_functiondef('public.doh_get_system_data_rpc()'::regprocedure) INTO definition;
definition := replace(definition,'FROM doh_flood_routes f','FROM doh_flood_routes f WHERE f.deleted_at IS NULL');
definition := replace(definition,'FROM doh_detour_routes d','FROM doh_detour_routes d WHERE d.deleted_at IS NULL');
EXECUTE definition;
END $body$;
