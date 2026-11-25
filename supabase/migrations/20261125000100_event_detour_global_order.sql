-- One display rank per detour in a flood event. Keep directional position
-- and review metadata for compatibility. Legacy rows have no global order:
-- use earliest directional position, then direction precedence and route ID.
ALTER TABLE public.doh_event_detour_links
  ADD COLUMN event_position integer CHECK (event_position > 0);

WITH first_links AS (
  SELECT DISTINCT ON (event_id, detour_id)
    event_id, detour_id, position,
    CASE event_direction WHEN 'BOTH' THEN 0 WHEN 'A_TO_B' THEN 1 WHEN 'B_TO_A' THEN 2 ELSE 3 END AS direction_priority
  FROM public.doh_event_detour_links
  ORDER BY event_id, detour_id, position, direction_priority
), ranks AS (
  SELECT event_id, detour_id,
    row_number() OVER (PARTITION BY event_id ORDER BY position, direction_priority, detour_id COLLATE "C") AS rank
  FROM first_links
)
UPDATE public.doh_event_detour_links l
SET event_position = ranks.rank
FROM ranks
WHERE l.event_id = ranks.event_id AND l.detour_id = ranks.detour_id;

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
  saved_links jsonb;
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

  -- Existing clients omit eventPosition. New clients must send a complete
  -- contiguous order, shared by all directional rows of the same detour.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_links) x WHERE x ? 'eventPosition') AND (
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_links) x
      WHERE jsonb_typeof(x->'eventPosition') IS DISTINCT FROM 'number'
        OR x->>'eventPosition' !~ '^[1-9][0-9]{0,2}$'
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_links) x
      GROUP BY x->>'detourId' HAVING count(DISTINCT x->>'eventPosition') <> 1
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_links) x
      HAVING count(DISTINCT x->>'detourId') <> count(DISTINCT x->>'eventPosition')
    ) OR EXISTS (
      SELECT 1 FROM generate_series(
        1, (SELECT count(DISTINCT y->>'detourId')::int FROM jsonb_array_elements(p_links) y)
      ) AS ranks(rank)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_links) z WHERE z->>'eventPosition' = rank::text
      )
    )
  ) THEN
    RAISE EXCEPTION 'INVALID_EVENT_DETOUR_ORDER' USING ERRCODE = '22023';
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

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_links) x WHERE x ? 'eventPosition') THEN
    saved_links := p_links;
  ELSE
    -- Older clients can still save direction/status without clobbering global order.
    WITH existing AS (
      SELECT detour_id, min(event_position) AS rank
      FROM public.doh_event_detour_links WHERE event_id = p_event_id
      GROUP BY detour_id
    ), inputs AS (
      SELECT min(ord) AS first_row, x->>'detourId' AS id
      FROM jsonb_array_elements(p_links) WITH ORDINALITY AS rows(x, ord)
      GROUP BY x->>'detourId'
    ), ranks AS (
      SELECT id, row_number() OVER (ORDER BY existing.rank NULLS LAST, first_row) AS rank
      FROM inputs LEFT JOIN existing ON existing.detour_id = inputs.id
    )
    SELECT COALESCE(jsonb_agg(x || jsonb_build_object('eventPosition', rank) ORDER BY ord), '[]'::jsonb)
    INTO saved_links
    FROM jsonb_array_elements(p_links) WITH ORDINALITY AS rows(x, ord)
    JOIN ranks ON ranks.id = x->>'detourId';
  END IF;

  DELETE FROM public.doh_event_detour_links WHERE event_id = p_event_id;
  INSERT INTO public.doh_event_detour_links(
    event_id,
    detour_id,
    event_direction,
    detour_direction,
    position,
    event_position,
    recommendation,
    reviewed_geometry_version
  )
  SELECT
    p_event_id,
    x->>'detourId',
    x->>'eventDirection',
    x->>'detourDirection',
    (x->>'position')::integer,
    (x->>'eventPosition')::integer,
    x->>'recommendation',
    CASE
      WHEN x ? 'reviewedGeometryVersion' AND x->>'reviewedGeometryVersion' IS NOT NULL
        THEN (x->>'reviewedGeometryVersion')::integer
      ELSE NULL
    END
  FROM jsonb_array_elements(saved_links) AS x;

  UPDATE public.doh_flood_events
  SET link_version = link_version + 1,
      updated_at = now()
  WHERE id = p_event_id;

  result_value := jsonb_build_object(
    'eventId', p_event_id,
    'version', current_version + 1,
    'links', saved_links
  );
  INSERT INTO public.doh_event_detour_operations(event_id, operation_id, request, before_links, result)
  VALUES (p_event_id, p_operation_id, payload, before_state, result_value);
  RETURN result_value;
END;
$$;

-- Serialize appends against the same event row/version as the editor.
-- Never promote a detour to RECOMMENDED as a side effect of linking it.
CREATE FUNCTION public.doh_append_event_detour_link(p_flood_id text, p_detour_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  link_event text;
  link_event_dir text;
  link_detour_dir text;
BEGIN
  SELECT event_id, event_direction INTO link_event, link_event_dir
  FROM public.doh_event_segments WHERE flood_id = p_flood_id;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1 FROM public.doh_flood_events WHERE id = link_event FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.doh_event_detour_links
    WHERE event_id = link_event AND detour_id = p_detour_id
  ) THEN RETURN true; END IF;

  SELECT CASE direction_mode
    WHEN 'FORWARD_ONLY' THEN 'FORWARD'
    WHEN 'REVERSE_ONLY' THEN 'REVERSE'
    WHEN 'TWO_WAY' THEN 'TWO_WAY'
    ELSE 'UNKNOWN' END INTO link_detour_dir
  FROM public.doh_detour_routes WHERE id = p_detour_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DETOUR_UNAVAILABLE_OR_DIRECTION_MISMATCH' USING ERRCODE = '22023'; END IF;

  IF (SELECT count(*) FROM public.doh_event_detour_links WHERE event_id = link_event) >= 100 THEN
    RAISE EXCEPTION 'TOO_MANY_EVENT_DETOUR_LINKS' USING ERRCODE = '22023';
  END IF;

  -- Do not guess an unknown applicability direction.
  IF link_event_dir NOT IN ('A_TO_B', 'B_TO_A', 'BOTH') THEN link_event_dir := 'UNKNOWN'; END IF;

  INSERT INTO public.doh_event_detour_links
    (event_id, detour_id, event_direction, detour_direction, position, event_position, recommendation)
  SELECT link_event, p_detour_id, link_event_dir, link_detour_dir,
    COALESCE(max(position) FILTER (WHERE event_direction = link_event_dir), 0) + 1,
    greatest(COALESCE(max(event_position), 0), count(DISTINCT detour_id)::integer) + 1,
    'PENDING'
  FROM public.doh_event_detour_links WHERE event_id = link_event;

  UPDATE public.doh_flood_events SET link_version = link_version + 1, updated_at = now()
  WHERE id = link_event;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.doh_append_event_detour_link(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doh_append_event_detour_link(text, text) TO service_role;
