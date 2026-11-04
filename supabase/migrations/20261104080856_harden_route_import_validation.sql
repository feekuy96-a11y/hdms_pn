-- Prevent PostgreSQL 22023 errors from leaking to the administrator when a
-- third-party GIS file contains an incomplete feature or coordinate.
CREATE OR REPLACE FUNCTION public.doh_import_routes_rpc(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  f jsonb;
  p jsonb;
  g jsonb;
  feature_index integer := 0;
  point_index integer;
  safe_width numeric;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
    AND coalesce(auth.jwt()->'app_metadata'->>'role', '') NOT IN ('admin', 'doh_admin') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  IF coalesce(payload->>'layerId', '') = '' THEN
    RAISE EXCEPTION 'Layer ID required';
  END IF;

  g := payload->'geojsonData';
  IF g IS NOT NULL THEN
    IF jsonb_typeof(g) <> 'object'
      OR g->>'type' <> 'FeatureCollection'
      OR jsonb_typeof(g->'features') <> 'array' THEN
      RAISE EXCEPTION 'ข้อมูลโครงข่ายต้องเป็น FeatureCollection';
    END IF;
    IF jsonb_array_length(g->'features') > 10000 THEN
      RAISE EXCEPTION 'จำนวนเส้นทางเกิน 10,000 เส้น';
    END IF;

    FOR f IN SELECT value FROM jsonb_array_elements(g->'features') LOOP
      feature_index := feature_index + 1;
      IF jsonb_typeof(f) <> 'object'
        OR jsonb_typeof(f->'geometry') <> 'object'
        OR f->'geometry'->>'type' <> 'LineString'
        OR jsonb_typeof(f->'geometry'->'coordinates') <> 'array'
        OR jsonb_array_length(f->'geometry'->'coordinates') < 2 THEN
        RAISE EXCEPTION 'แนวเส้นลำดับ % ต้องมีพิกัดอย่างน้อย 2 จุด', feature_index
          USING ERRCODE = '22023';
      END IF;

      point_index := 0;
      FOR p IN SELECT value FROM jsonb_array_elements(f->'geometry'->'coordinates') LOOP
        point_index := point_index + 1;
        IF jsonb_typeof(p) <> 'array'
          OR jsonb_array_length(p) < 2
          OR jsonb_typeof(p->0) <> 'number'
          OR jsonb_typeof(p->1) <> 'number'
          OR abs((p->>0)::numeric) > 180
          OR abs((p->>1)::numeric) > 90 THEN
          RAISE EXCEPTION 'พิกัดจุดที่ % ของแนวเส้นลำดับ % ไม่อยู่ในระบบ WGS84', point_index, feature_index
            USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  safe_width := CASE
    WHEN coalesce(payload->>'lineWidth', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (payload->>'lineWidth')::numeric
    ELSE 4
  END;

  INSERT INTO public.doh_highway_layers(layer_id, layer_name, color_hex, line_width, geojson_data, metadata)
  VALUES (
    payload->>'layerId',
    coalesce(payload->>'layerName', payload->>'layerId'),
    coalesce(payload->>'colorHex', '#1B5E20'),
    safe_width,
    g,
    coalesce(payload->'metadata', '{}')
  )
  ON CONFLICT(layer_id) DO UPDATE
  SET layer_name = coalesce(payload->>'layerName', doh_highway_layers.layer_name),
      color_hex = coalesce(payload->>'colorHex', doh_highway_layers.color_hex),
      line_width = safe_width,
      geojson_data = coalesce(g, doh_highway_layers.geojson_data),
      metadata = doh_highway_layers.metadata || coalesce(payload->'metadata', '{}'),
      updated_at = now();
END
$function$;

REVOKE ALL ON FUNCTION public.doh_import_routes_rpc(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doh_import_routes_rpc(jsonb) TO authenticated, service_role;
