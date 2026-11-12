-- A field report can time out after Postgres commits but before the browser receives
-- a response. Preserve the caller's stable request key so replaying the queue does
-- not create a second timeline row. The RPC also owns every flood/timeline update
-- so a failure rolls the whole report back atomically.
ALTER TABLE public.doh_timeline_updates
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_doh_timeline_client_request_id
  ON public.doh_timeline_updates (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.doh_update_timeline_rpc(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
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
$$;
