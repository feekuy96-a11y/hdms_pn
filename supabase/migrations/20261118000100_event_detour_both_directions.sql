-- Support bidirectional ('BOTH' / 'TWO_WAY') relationships in doh_event_detour_links
-- and relax segment compatibility for legacy UNKNOWN segments so active two-way
-- links can be promoted cleanly to RECOMMENDED.
--
-- Why: Flood events and detours in DOH Pattani are commonly recorded as two-way
-- (directionCode='BOTH' / direction_mode='TWO_WAY'), while the initial Phase 2
-- migration only allowed A_TO_B / B_TO_A and FORWARD / REVERSE.
--
-- Impact: Existing rows remain intact. Allows 'BOTH' on event_direction and
-- 'TWO_WAY' on detour_direction, prevents duplicate BOTH + single-direction
-- links for the same (event_id, detour_id), and validates TWO_WAY against
-- detour direction_mode.
--
-- Rollback: Restore public.doh_replace_event_detour_links from
-- 20261117135032_event_detour_relationships.sql, convert any 'BOTH'/'TWO_WAY'
-- rows back to 'A_TO_B'/'FORWARD', then restore the narrower CHECK constraints.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.doh_event_detour_links'::regclass
      AND c.contype = 'c'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%event_direction%'
        OR pg_get_constraintdef(c.oid) ILIKE '%detour_direction%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.doh_event_detour_links DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.doh_event_detour_links
  ADD CONSTRAINT chk_doh_edl_event_direction
    CHECK (event_direction IN ('A_TO_B', 'B_TO_A', 'BOTH', 'UNKNOWN')),
  ADD CONSTRAINT chk_doh_edl_detour_direction
    CHECK (detour_direction IN ('FORWARD', 'REVERSE', 'TWO_WAY', 'UNKNOWN')),
  ADD CONSTRAINT chk_doh_edl_recommended_reviewed
    CHECK (
      recommendation <> 'RECOMMENDED' OR (
        event_direction <> 'UNKNOWN'
        AND detour_direction <> 'UNKNOWN'
        AND reviewed_geometry_version IS NOT NULL
        AND reviewed_geometry_version > 0
      )
    );

CREATE OR REPLACE FUNCTION public.doh_replace_event_detour_links(
  p_event_id text,
  p_expected_version integer,
  p_operation_id text,
  p_links jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
      OR (x->>'detourDirection' = 'FORWARD' AND d.direction_mode = 'REVERSE_ONLY')
      OR (x->>'detourDirection' = 'REVERSE' AND d.direction_mode = 'FORWARD_ONLY')
      OR (x->>'detourDirection' = 'TWO_WAY' AND d.direction_mode IN ('FORWARD_ONLY', 'REVERSE_ONLY'))
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
$$;
