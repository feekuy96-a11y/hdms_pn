-- Lightweight geometry for the PUBLIC map.
--
-- Problem: doh_get_system_data_rpc() ships the full-resolution GeoJSON of every highway layer
-- (often tens of thousands of vertices with ~15 decimal digits) to every visitor, on every page load.
--
-- Fix: keep the original geometry untouched in doh_highway_layers.geojson_data (the admin editor needs
-- it), and store a simplified copy (about 2 m tolerance, 5 decimals ~ 1 m) in a new column that is
-- computed ONCE when a layer is saved, not on every request. A new RPC returns the normal system
-- payload with each layer's geojson_data swapped for that light copy. Admin reads keep using
-- doh_get_system_data_rpc() and therefore still get full precision.
--
-- Safe to run more than once. Existing functions and data are not modified.

ALTER TABLE public.doh_highway_layers ADD COLUMN IF NOT EXISTS geojson_display jsonb;

-- Simplify one GeoJSON line geometry. Any failure returns the original geometry unchanged.
CREATE OR REPLACE FUNCTION public.doh_simplify_geojson_geometry(
  p_geometry jsonb,
  p_tolerance double precision DEFAULT 0.00002,
  p_digits integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  simplified geometry;
BEGIN
  IF p_geometry IS NULL OR jsonb_typeof(p_geometry) <> 'object' THEN
    RETURN p_geometry;
  END IF;
  IF COALESCE(p_geometry->>'type', '') NOT IN ('LineString', 'MultiLineString') THEN
    RETURN p_geometry;
  END IF;
  simplified := ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::text), 4326), p_tolerance);
  IF simplified IS NULL OR ST_IsEmpty(simplified) THEN
    RETURN p_geometry;
  END IF;
  RETURN ST_AsGeoJSON(simplified, p_digits)::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN p_geometry;
END
$fn$;

-- Apply it to every feature of a FeatureCollection (feature order and all properties are kept).
CREATE OR REPLACE FUNCTION public.doh_simplify_feature_collection(
  p_collection jsonb,
  p_tolerance double precision DEFAULT 0.00002,
  p_digits integer DEFAULT 5
) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_collection IS NULL OR jsonb_typeof(p_collection->'features') <> 'array' THEN p_collection
    ELSE jsonb_set(
      p_collection,
      '{features}',
      COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(t.feature->'geometry') = 'object'
              THEN jsonb_set(t.feature, '{geometry}', public.doh_simplify_geojson_geometry(t.feature->'geometry', p_tolerance, p_digits))
            ELSE t.feature
          END
          ORDER BY t.ord
        )
        FROM jsonb_array_elements(p_collection->'features') WITH ORDINALITY AS t(feature, ord)
      ), '[]'::jsonb)
    )
  END
$fn$;

-- Keep the light copy in sync whenever a layer is saved (import, geometry edit, ...).
CREATE OR REPLACE FUNCTION public.doh_trg_sync_highway_layer_display()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.geojson_display := public.doh_simplify_feature_collection(NEW.geojson_data);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_doh_highway_layer_display ON public.doh_highway_layers;
CREATE TRIGGER trg_doh_highway_layer_display
  BEFORE INSERT OR UPDATE OF geojson_data ON public.doh_highway_layers
  FOR EACH ROW
  EXECUTE FUNCTION public.doh_trg_sync_highway_layer_display();

-- One-time backfill for layers that already exist.
UPDATE public.doh_highway_layers
SET geojson_display = public.doh_simplify_feature_collection(geojson_data)
WHERE geojson_data IS NOT NULL AND geojson_display IS NULL;

-- Same payload as doh_get_system_data_rpc() (whatever patches it already has), but with the light
-- geometry for highway layers. Layers without a light copy fall back to the original geometry.
CREATE OR REPLACE FUNCTION public.doh_get_system_data_display_rpc()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  base jsonb;
BEGIN
  base := public.doh_get_system_data_rpc();
  IF base IS NULL OR jsonb_typeof(base->'highwayLayers') <> 'array' THEN
    RETURN base;
  END IF;

  RETURN jsonb_set(
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
END
$fn$;

GRANT EXECUTE ON FUNCTION public.doh_get_system_data_display_rpc() TO anon, authenticated, service_role;
