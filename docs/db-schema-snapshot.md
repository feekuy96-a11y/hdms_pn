# DB Schema Snapshot — Production RPC

- **Project:** ebyobrtvisylwawxiurx (โครงการแขวงทางหลวงปัตตานี — supabase_pn_pattani)
- **Extracted at:** 2026-11-19 (read-only SELECT ผ่าน Supabase MCP `execute_sql`; คำนิยามจาก Production โดยตรง — drift ระหว่าง Production RPC และ `db/*.sql` ใน repo ใช้ตาม R4)
- **Edge function:** `hdms-api` — version 24, `verify_jwt: false`, status ACTIVE (ยืนยันแล้วตาม B-014, Phase 1.1)
- **RPC ใช้งานใน repo:** doh_claim_external_jobs, doh_get_public_system_data_display_rpc, doh_get_system_data_rpc, doh_import_routes_rpc, doh_promote_staged_media, doh_replace_event_detour_links, doh_snap_line_rpc, doh_update_timeline_rpc

---

## doh_claim_external_jobs

```sql
CREATE OR REPLACE FUNCTION public.doh_claim_external_jobs(p_limit integer DEFAULT 3)
 RETURNS SETOF doh_external_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
    with picked as (
      select j.id from public.doh_external_jobs j
      where ((j.status = 'pending' and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.claimed_at < now() - interval '3 minutes'))
        and j.attempts < 8
      order by j.created_at
      limit least(greatest(p_limit, 1), 10)
      for update skip locked
    )
    update public.doh_external_jobs j
    set status = 'processing', claimed_at = now(), attempts = j.attempts + 1, updated_at = now()
    from picked where j.id = picked.id
    returning j.*;
end;
$function$
```

## doh_get_public_system_data_display_rpc

```sql
CREATE OR REPLACE FUNCTION public.doh_get_public_system_data_display_rpc()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  base jsonb;
BEGIN
  base := public.doh_get_system_data_display_rpc();
  IF base IS NULL THEN
    RETURN base;
  END IF;

  IF jsonb_typeof(base->'floodRoutes') = 'array' THEN
    base := jsonb_set(
      base,
      '{floodRoutes}',
      COALESCE((
        SELECT jsonb_agg(t.route ORDER BY t.ord)
        FROM jsonb_array_elements(base->'floodRoutes') WITH ORDINALITY AS t(route, ord)
        WHERE COALESCE((t.route->>'is_active')::boolean, false)
      ), '[]'::jsonb)
    );
  END IF;

  IF jsonb_typeof(base->'detourRoutes') = 'array' THEN
    base := jsonb_set(
      base,
      '{detourRoutes}',
      COALESCE((
        SELECT jsonb_agg(t.route ORDER BY t.ord)
        FROM jsonb_array_elements(base->'detourRoutes') WITH ORDINALITY AS t(route, ord)
        WHERE COALESCE((t.route->>'is_active')::boolean, false)
          AND (
            public.doh_detour_has_active_event_link(t.route->>'id', true)
            OR NULLIF(t.route->>'flood_id_ref', '') IS NULL
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(base->'floodRoutes') AS active(route)
              WHERE active.route->>'id' = t.route->>'flood_id_ref'
            )
          )
      ), '[]'::jsonb)
    );
  END IF;

  IF jsonb_typeof(base->'timelineUpdates') = 'array' THEN
    base := jsonb_set(
      base,
      '{timelineUpdates}',
      COALESCE((
        SELECT jsonb_agg(t.item ORDER BY t.ord)
        FROM jsonb_array_elements(base->'timelineUpdates') WITH ORDINALITY AS t(item, ord)
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(base->'floodRoutes') AS active(route)
          WHERE active.route->>'id' = t.item->>'flood_id_ref'
        )
      ), '[]'::jsonb)
    );
  END IF;

  RETURN base;
END
$function$
```

## doh_get_system_data_rpc

```sql
CREATE OR REPLACE FUNCTION public.doh_get_system_data_rpc()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'updatedAt', NOW(),
        'floodRoutes', (
            SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.is_active DESC, f.updated_at DESC), '[]'::jsonb)
            FROM doh_flood_routes f WHERE f.deleted_at IS NULL
        ),
        'detourRoutes', (
            SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.updated_at DESC), '[]'::jsonb)
            FROM doh_detour_routes d WHERE d.deleted_at IS NULL
        ),
        'timelineUpdates', (
            SELECT COALESCE(jsonb_agg((to_jsonb(t) - 'doh_rn') ORDER BY t.reported_at DESC), '[]'::jsonb)
            FROM (SELECT x.*, row_number() OVER (PARTITION BY x.flood_id_ref ORDER BY x.reported_at DESC) AS doh_rn FROM doh_timeline_updates x) t WHERE t.doh_rn <= 60
        ),
        'mitigationProjects', (
            SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.project_id ASC), '[]'::jsonb)
            FROM doh_mitigation_projects p
        ),
        'highwayLayers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'layer_id', l.layer_id,
                'layer_name', l.layer_name,
                'color_hex', l.color_hex,
                'line_width', l.line_width,
                'geojson_data', l.geojson_data,
                'is_visible', l.is_visible, 'metadata', l.metadata,
                'updated_at', l.updated_at
            ) ORDER BY l.layer_id ASC), '[]'::jsonb)
            FROM doh_highway_layers l
        ),
        'offices', (
            SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.type ASC, o.id ASC), '[]'::jsonb)
            FROM doh_offices o
        ),
        'mapStyles', (
            SELECT COALESCE(
                jsonb_object_agg(s.style_key, s.style_data),
                '{}'::jsonb
            )
            FROM doh_map_styles s
        ),
        'systemSettings', (
            SELECT COALESCE(
                jsonb_object_agg(st.setting_key, st.setting_value),
                '{}'::jsonb
            )
            FROM doh_system_settings st
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$
```

## doh_import_routes_rpc

```sql
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
$function$
```

## doh_promote_staged_media

```sql
CREATE OR REPLACE FUNCTION public.doh_promote_staged_media(p_temp_url text, p_drive_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_projects integer := 0;
  v_floods integer := 0;
  v_detours integer := 0;
begin
  if nullif(trim(p_temp_url), '') is null or nullif(trim(p_drive_url), '') is null then
    raise exception 'media URLs are required';
  end if;

  update public.doh_mitigation_projects
  set before_image_url = case when before_image_url = p_temp_url then p_drive_url else before_image_url end,
      after_image_url = case when after_image_url = p_temp_url then p_drive_url else after_image_url end
  where before_image_url = p_temp_url or after_image_url = p_temp_url;
  get diagnostics v_projects = row_count;

  update public.doh_flood_routes as route
  set latest_photo_url = case when route.latest_photo_url = p_temp_url then p_drive_url else route.latest_photo_url end,
      direction_meta = case
        when jsonb_typeof(route.direction_meta -> 'photos') = 'array' then
          jsonb_set(
            route.direction_meta,
            '{photos}',
            (select jsonb_agg(
              case when photo ->> 'dataUrl' = p_temp_url
                then jsonb_set(photo, '{dataUrl}', to_jsonb(p_drive_url), true)
                else photo
              end
            ) from jsonb_array_elements(route.direction_meta -> 'photos') as photo),
            false
          )
        else route.direction_meta
      end
  where route.latest_photo_url = p_temp_url
     or (jsonb_typeof(route.direction_meta -> 'photos') = 'array'
         and exists (
           select 1 from jsonb_array_elements(route.direction_meta -> 'photos') as photo
           where photo ->> 'dataUrl' = p_temp_url
         ));
  get diagnostics v_floods = row_count;

  update public.doh_detour_routes as detour
  set detour_meta = (
    case
      when detour.detour_meta -> 'end_point_photo' ->> 'url' = p_temp_url then
        jsonb_set(
          case
            when detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url then
              jsonb_set(detour.detour_meta, '{start_point_photo,url}', to_jsonb(p_drive_url), false)
            else detour.detour_meta
          end,
          '{end_point_photo,url}',
          to_jsonb(p_drive_url),
          false
        )
      when detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url then
        jsonb_set(detour.detour_meta, '{start_point_photo,url}', to_jsonb(p_drive_url), false)
      else detour.detour_meta
    end
  )
  where detour.detour_meta -> 'start_point_photo' ->> 'url' = p_temp_url
     or detour.detour_meta -> 'end_point_photo' ->> 'url' = p_temp_url;
  get diagnostics v_detours = row_count;

  return jsonb_build_object(
    'projects', v_projects,
    'floodRoutes', v_floods,
    'detourRoutes', v_detours,
    'total', v_projects + v_floods + v_detours
  );
end;
$function$
```

## doh_replace_event_detour_links

```sql
CREATE OR REPLACE FUNCTION public.doh_replace_event_detour_links(p_event_id text, p_expected_version integer, p_operation_id text, p_links jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_version integer;
  prior record;
  payload jsonb;
  before_state jsonb;
  result_value jsonb;
BEGIN
  IF p_event_id IS NULL OR char_length(btrim(p_event_id)) NOT BETWEEN 1 AND 128
    OR p_operation_id IS NULL OR char_length(btrim(p_operation_id)) NOT BETWEEN 8 AND 128
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_links IS NULL OR jsonb_typeof(p_links) <> 'array'
    OR jsonb_array_length(p_links) > 100 THEN
    RAISE EXCEPTION 'INVALID_LINK_REQUEST' USING ERRCODE = '22023';
  END IF;

  SELECT link_version INTO current_version
  FROM public.doh_flood_events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doh_event_segments WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'EVENT_HAS_NO_SEGMENTS' USING ERRCODE = '22023';
  END IF;

  payload := jsonb_build_object('expectedVersion', p_expected_version, 'links', p_links);
  SELECT request, result INTO prior
  FROM public.doh_event_detour_operations
  WHERE event_id = p_event_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF prior.request <> payload THEN
      RAISE EXCEPTION 'OPERATION_ID_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN prior.result;
  END IF;
  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'LINK_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    WHERE jsonb_typeof(x) <> 'object'
      OR jsonb_typeof(x->'eventId') <> 'string' OR x->>'eventId' IS DISTINCT FROM p_event_id
      OR jsonb_typeof(x->'detourId') <> 'string' OR NULLIF(btrim(x->>'detourId'), '') IS NULL
      OR jsonb_typeof(x->'eventDirection') <> 'string' OR x->>'eventDirection' NOT IN ('A_TO_B', 'B_TO_A', 'BOTH', 'UNKNOWN')
      OR jsonb_typeof(x->'detourDirection') <> 'string' OR x->>'detourDirection' NOT IN ('FORWARD', 'REVERSE', 'TWO_WAY', 'UNKNOWN')
      OR jsonb_typeof(x->'recommendation') <> 'string' OR x->>'recommendation' NOT IN ('PENDING', 'RECOMMENDED', 'UNAVAILABLE', 'WITHDRAWN')
      OR jsonb_typeof(x->'position') <> 'number' OR x->>'position' !~ '^[1-9][0-9]{0,8}$'
      OR (
        x ? 'reviewedGeometryVersion'
        AND x->'reviewedGeometryVersion' <> 'null'::jsonb
        AND (jsonb_typeof(x->'reviewedGeometryVersion') <> 'number' OR x->>'reviewedGeometryVersion' !~ '^[1-9][0-9]{0,8}$')
      )
  ) THEN
    RAISE EXCEPTION 'INVALID_LINK' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    GROUP BY x->>'eventDirection', x->>'detourId'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    GROUP BY x->>'detourId'
    HAVING bool_or(x->>'eventDirection' = 'BOTH') AND count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_DETOUR_LINK' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    GROUP BY x->>'eventDirection'
    HAVING min((x->>'position')::integer) <> 1
      OR max((x->>'position')::integer) <> count(*)
      OR count(DISTINCT (x->>'position')::integer) <> count(*)
  ) THEN
    RAISE EXCEPTION 'NON_CONTIGUOUS_ORDER' USING ERRCODE = '22023';
  END IF;

  -- Lock masters before validating their current status/direction/revision.
  PERFORM 1
  FROM public.doh_detour_routes d
  WHERE d.id IN (SELECT x->>'detourId' FROM jsonb_array_elements(p_links) AS x)
  ORDER BY d.id
  FOR SHARE;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    LEFT JOIN public.doh_detour_routes d ON d.id = x->>'detourId'
    WHERE d.id IS NULL OR d.deleted_at IS NOT NULL
      OR (x->'detourDirection' = 'FORWARD' AND d.direction_mode = 'REVERSE_ONLY')
      OR (x->'detourDirection' = 'REVERSE' AND d.direction_mode = 'FORWARD_ONLY')
      OR (x->'detourDirection' = 'TWO_WAY' AND d.direction_mode IN ('FORWARD_ONLY', 'REVERSE_ONLY'))
  ) THEN
    RAISE EXCEPTION 'DETOUR_UNAVAILABLE_OR_DIRECTION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_links) AS x
    LEFT JOIN public.doh_detour_routes d ON d.id = x->>'detourId'
    WHERE x->>'recommendation' = 'RECOMMENDED'
      AND (
        x->>'eventDirection' = 'UNKNOWN'
        OR x->>'detourDirection' = 'UNKNOWN'
        OR d.is_active IS NOT TRUE
        OR (x->>'reviewedGeometryVersion')::integer <> d.geometry_revision
        OR NOT (
          (x->>'eventDirection' IN ('A_TO_B', 'B_TO_A') AND EXISTS (
            SELECT 1
            FROM public.doh_event_segments s
            WHERE s.event_id = p_event_id
              AND s.event_direction IN (x->>'eventDirection', 'BOTH', 'UNKNOWN')
          ))
          OR (x->>'eventDirection' = 'BOTH' AND (
            EXISTS (
              SELECT 1
              FROM public.doh_event_segments s
              WHERE s.event_id = p_event_id
                AND s.event_direction IN ('BOTH', 'UNKNOWN')
            )
            OR (
              EXISTS (SELECT 1 FROM public.doh_event_segments s WHERE s.event_id = p_event_id AND s.event_direction = 'A_TO_B')
              AND EXISTS (SELECT 1 FROM public.doh_event_segments s WHERE s.event_id = p_event_id AND s.event_direction = 'B_TO_A')
            )
          ))
        )
      )
  ) THEN
    RAISE EXCEPTION 'RECOMMENDATION_REVIEW_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.event_direction, l.position), '[]'::jsonb)
  INTO before_state
  FROM public.doh_event_detour_links l
  WHERE l.event_id = p_event_id;

  DELETE FROM public.doh_event_detour_links WHERE event_id = p_event_id;
  INSERT INTO public.doh_event_detour_links(
    event_id,
    detour_id,
    event_direction,
    detour_direction,
    position,
    recommendation,
    reviewed_geometry_version
  )
  SELECT
    p_event_id,
    x->>'detourId',
    x->>'eventDirection',
    x->>'detourDirection',
    (x->>'position')::integer,
    x->>'recommendation',
    CASE
      WHEN x ? 'reviewedGeometryVersion' AND x->>'reviewedGeometryVersion' IS NOT NULL
        THEN (x->>'reviewedGeometryVersion')::integer
      ELSE NULL
    END
  FROM jsonb_array_elements(p_links) AS x;

  UPDATE public.doh_flood_events
  SET link_version = link_version + 1,
      updated_at = now()
  WHERE id = p_event_id;

  result_value := jsonb_build_object(
    'eventId', p_event_id,
    'version', current_version + 1,
    'links', p_links
  );
  INSERT INTO public.doh_event_detour_operations(event_id, operation_id, request, before_links, result)
  VALUES (p_event_id, p_operation_id, payload, before_state, result_value);
  RETURN result_value;
END;
$function$
```

## doh_snap_line_rpc

```sql
CREATE OR REPLACE FUNCTION public.doh_snap_line_rpc(p_a_lng double precision, p_a_lat double precision, p_b_lng double precision, p_b_lat double precision, p_max_m double precision DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a geometry:=ST_SetSRID(ST_Point(p_a_lng,p_a_lat),4326); b geometry:=ST_SetSRID(ST_Point(p_b_lng,p_b_lat),4326); line geometry; code text; pa float8; pb float8;
BEGIN
IF abs(p_a_lng)>180 OR abs(p_b_lng)>180 OR abs(p_a_lat)>90 OR abs(p_b_lat)>90 OR p_max_m NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid snapping parameters'; END IF;
SELECT d.geom,l.layer_id INTO line,code FROM doh_highway_layers l CROSS JOIN LATERAL ST_Dump(ST_LineMerge(l.geom)) d WHERE l.is_visible AND ST_GeometryType(d.geom)='ST_LineString' AND ST_DWithin(d.geom::geography,a::geography,p_max_m) AND ST_DWithin(d.geom::geography,b::geography,p_max_m) ORDER BY ST_Distance(d.geom::geography,a::geography)+ST_Distance(d.geom::geography,b::geography) LIMIT 1;
IF line IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
pa:=ST_LineLocatePoint(line,a); pb:=ST_LineLocatePoint(line,b);
IF pa=pb THEN RETURN jsonb_build_object('found',false); END IF;
line:=ST_LineSubstring(line,least(pa,pb),greatest(pa,pb));
IF pa>pb THEN line:=ST_Reverse(line); END IF;
RETURN jsonb_build_object('found',true,'via','db','route_code',code,'geojson',ST_AsGeoJSON(line)::jsonb);
END $function$
```

## doh_update_timeline_rpc

```sql
CREATE OR REPLACE FUNCTION public.doh_update_timeline_rpc(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_timeline_id VARCHAR(50) := COALESCE(payload->>'timelineId', 'TL-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISSMS'));
  v_request_id TEXT := NULLIF(payload->>'clientRequestId', '');
  v_flood_id VARCHAR(50) := payload->>'floodId';
  v_water_level INTEGER := COALESCE((payload->>'waterLevelCm')::INTEGER, 0);
  v_status VARCHAR(20) := COALESCE(payload->>'trafficStatus', 'WARNING');
  v_photo TEXT := COALESCE(payload->>'photoUrl', '');
  v_reporter TEXT := COALESCE(payload->>'reporterName', 'เจ้าหน้าที่หมวดทางหลวง');
  v_remark TEXT := COALESCE(payload->>'remark', '');
  v_lat DOUBLE PRECISION := COALESCE((payload->>'latitude')::DOUBLE PRECISION, 0);
  v_lon DOUBLE PRECISION := COALESCE((payload->>'longitude')::DOUBLE PRECISION, 0);
  v_existing_id VARCHAR(50);
BEGIN
  IF v_flood_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.doh_flood_routes WHERE id = v_flood_id) THEN
    RAISE EXCEPTION 'Flood route not found';
  END IF;

  IF v_request_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.doh_timeline_updates WHERE client_request_id = v_request_id;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', TRUE, 'duplicate', TRUE, 'timelineId', v_existing_id, 'floodId', v_flood_id);
    END IF;
  END IF;

  IF v_request_id IS NULL THEN
    INSERT INTO public.doh_timeline_updates (
      id, flood_id_ref, reported_at, water_level_cm, traffic_status, latitude, longitude,
      photo_url, reporter_name, remark, road_side, affected_lanes, affected_shoulder,
      direction_meta, client_request_id, created_at
    ) VALUES (
      v_timeline_id, v_flood_id, NOW(), v_water_level, v_status, v_lat, v_lon,
      v_photo, v_reporter, v_remark,
      COALESCE(NULLIF(payload->>'roadSide', ''), 'UNKNOWN'),
      COALESCE(payload->>'affectedLanes', ''),
      COALESCE(NULLIF(payload->>'affectedShoulder', ''), 'NONE'),
      COALESCE(payload->'directionMeta', '{}'::jsonb), NULL, NOW()
    );
  ELSE
    INSERT INTO public.doh_timeline_updates (
      id, flood_id_ref, reported_at, water_level_cm, traffic_status, latitude, longitude,
      photo_url, reporter_name, remark, road_side, affected_lanes, affected_shoulder,
      direction_meta, client_request_id, created_at
    ) VALUES (
      v_timeline_id, v_flood_id, NOW(), v_water_level, v_status, v_lat, v_lon,
      v_photo, v_reporter, v_remark,
      COALESCE(NULLIF(payload->>'roadSide', ''), 'UNKNOWN'),
      COALESCE(payload->>'affectedLanes', ''),
      COALESCE(NULLIF(payload->>'affectedShoulder', ''), 'NONE'),
      COALESCE(payload->'directionMeta', '{}'::jsonb), v_request_id, NOW()
    ) ON CONFLICT (client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
      SELECT id INTO v_existing_id FROM public.doh_timeline_updates WHERE client_request_id = v_request_id;
      RETURN jsonb_build_object('success', TRUE, 'duplicate', TRUE, 'timelineId', v_existing_id, 'floodId', v_flood_id);
    END IF;
  END IF;

  UPDATE public.doh_flood_routes
  SET water_level_cm = v_water_level,
      traffic_status = v_status,
      latest_photo_url = CASE WHEN v_photo <> '' THEN v_photo ELSE latest_photo_url END,
      road_side = COALESCE(NULLIF(payload->>'roadSide', ''), road_side),
      affected_lanes = COALESCE(payload->>'affectedLanes', affected_lanes),
      affected_shoulder = COALESCE(NULLIF(payload->>'affectedShoulder', ''), affected_shoulder),
      direction_meta = COALESCE(payload->'directionMeta', direction_meta),
      updated_at = NOW()
  WHERE id = v_flood_id;

  RETURN jsonb_build_object('success', TRUE, 'duplicate', FALSE, 'timelineId', v_timeline_id, 'floodId', v_flood_id);
END;
$function$
```
