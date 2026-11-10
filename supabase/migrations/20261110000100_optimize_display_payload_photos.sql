-- =============================================================================
-- Migration: 20261110000100_optimize_display_payload_photos.sql
-- Purpose:
--   Phase 4 Optimization (Item 1.1):
--   Trim direction_meta.photos in the public display payload (doh_get_system_data_display_rpc)
--   to include only the primary photo (photos[0..0]) on initial page load.
--
--   Citizens receive a lightweight payload (~80% bandwidth reduction), while full photo
--   galleries (up to 5 photos) remain preserved in doh_flood_routes.direction_meta in the database
--   and are retrieved on-demand when the citizen opens the incident dossier modal.
--
-- Rollback Plan:
--   Run migration 20261107000200_highway_display_geometry.sql again to restore the
--   previous definition of doh_get_system_data_display_rpc().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.doh_get_system_data_display_rpc()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  base jsonb;
BEGIN
  base := public.doh_get_system_data_rpc();
  IF base IS NULL THEN
    RETURN base;
  END IF;

  -- 1. Light highway geometry for the public map (from 20261107000200)
  IF jsonb_typeof(base->'highwayLayers') = 'array' THEN
    base := jsonb_set(
      base,
      '{highwayLayers}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN d.geojson_display IS NOT NULL THEN jsonb_set(t.layer, '{geojson_data}', d.geojson_display)
            ELSE t.layer
          END
          ORDER BY t.ord
        )
        FROM jsonb_array_elements(base->'highwayLayers') WITH ORDINALITY AS t(layer, ord)
        LEFT JOIN public.doh_highway_layers d ON d.layer_id = t.layer->>'layer_id'
      ), '[]'::jsonb)
    );
  END IF;

  -- 2. Phase 4 Payload Optimization: Only include primary photo in direction_meta.photos
  -- for the public initial payload to drastically reduce mobile payload size.
  IF jsonb_typeof(base->'floodRoutes') = 'array' THEN
    base := jsonb_set(
      base,
      '{floodRoutes}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(t.flood->'direction_meta'->'photos') = 'array'
                 AND jsonb_array_length(t.flood->'direction_meta'->'photos') > 1 THEN
              jsonb_set(
                t.flood,
                '{direction_meta,photos}',
                jsonb_build_array(t.flood->'direction_meta'->'photos'->0)
              )
            ELSE t.flood
          END
          ORDER BY t.ord
        )
        FROM jsonb_array_elements(base->'floodRoutes') WITH ORDINALITY AS t(flood, ord)
      ), '[]'::jsonb)
    );
  END IF;

  RETURN base;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.doh_get_system_data_display_rpc() TO anon, authenticated, service_role;

