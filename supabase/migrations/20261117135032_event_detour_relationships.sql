-- Event↔detour relationship foundation.
--
-- Why: one flood event may span several road segments and may use several
-- detour masters; legacy flood_id_ref can represent only one relationship.
-- This migration is additive. Legacy readers remain the production source until
-- the later read-wrapper/UI cutover is verified.
--
-- Rollback before cutover: drop the two triggers, the three functions, the five
-- new tables and geometry_revision in reverse dependency order. Do not remove
-- existing flood_id_ref or detour_meta fields.

CREATE TABLE IF NOT EXISTS public.doh_flood_events (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 128),
  link_version integer NOT NULL DEFAULT 0 CHECK (link_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doh_event_segments (
  flood_id varchar(50) PRIMARY KEY REFERENCES public.doh_flood_routes(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.doh_flood_events(id) ON DELETE RESTRICT,
  event_direction text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (event_direction IN ('A_TO_B', 'B_TO_A', 'BOTH', 'UNKNOWN')),
  segment_position integer NOT NULL CHECK (segment_position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, segment_position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS doh_event_segments_event_idx ON public.doh_event_segments(event_id);

-- A detour master owns its geometry. Any geometry mutation increments this value
-- and automatically demotes previously reviewed recommendations to PENDING.
ALTER TABLE public.doh_detour_routes
  ADD COLUMN IF NOT EXISTS geometry_revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.doh_detour_routes
  ALTER COLUMN geometry_revision SET DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.doh_event_detour_links (
  event_id text NOT NULL REFERENCES public.doh_flood_events(id) ON DELETE RESTRICT,
  detour_id varchar(50) NOT NULL REFERENCES public.doh_detour_routes(id) ON DELETE RESTRICT,
  event_direction text NOT NULL CHECK (event_direction IN ('A_TO_B', 'B_TO_A', 'UNKNOWN')),
  detour_direction text NOT NULL CHECK (detour_direction IN ('FORWARD', 'REVERSE', 'UNKNOWN')),
  position integer NOT NULL CHECK (position > 0),
  recommendation text NOT NULL CHECK (recommendation IN ('PENDING', 'RECOMMENDED', 'UNAVAILABLE', 'WITHDRAWN')),
  reviewed_geometry_version integer CHECK (reviewed_geometry_version IS NULL OR reviewed_geometry_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, detour_id, event_direction),
  UNIQUE (event_id, event_direction, position) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    recommendation <> 'RECOMMENDED' OR (
      event_direction <> 'UNKNOWN'
      AND detour_direction <> 'UNKNOWN'
      AND reviewed_geometry_version IS NOT NULL
      AND reviewed_geometry_version > 0
    )
  )
);
CREATE INDEX IF NOT EXISTS doh_event_detour_links_detour_idx ON public.doh_event_detour_links(detour_id);
CREATE INDEX IF NOT EXISTS doh_event_detour_links_event_status_idx
  ON public.doh_event_detour_links(event_id, recommendation, event_direction, position);

CREATE TABLE IF NOT EXISTS public.doh_event_detour_operations (
  event_id text NOT NULL REFERENCES public.doh_flood_events(id) ON DELETE RESTRICT,
  operation_id text NOT NULL CHECK (char_length(operation_id) BETWEEN 8 AND 128),
  request jsonb NOT NULL,
  before_links jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id, operation_id)
);
CREATE INDEX IF NOT EXISTS doh_event_detour_operations_created_idx
  ON public.doh_event_detour_operations(created_at);

CREATE OR REPLACE FUNCTION public.doh_bump_detour_geometry_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.coordinates_json IS DISTINCT FROM OLD.coordinates_json
    OR NEW.reverse_coordinates_json IS DISTINCT FROM OLD.reverse_coordinates_json
    OR NEW.reverse_waypoints_json IS DISTINCT FROM OLD.reverse_waypoints_json
    OR NEW.lat_start IS DISTINCT FROM OLD.lat_start
    OR NEW.lon_start IS DISTINCT FROM OLD.lon_start
    OR NEW.lat_end IS DISTINCT FROM OLD.lat_end
    OR NEW.lon_end IS DISTINCT FROM OLD.lon_end
    OR NEW.direction_mode IS DISTINCT FROM OLD.direction_mode THEN
    NEW.geometry_revision := GREATEST(COALESCE(OLD.geometry_revision, 1), 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doh_detour_geometry_revision ON public.doh_detour_routes;
CREATE TRIGGER trg_doh_detour_geometry_revision
  BEFORE UPDATE OF coordinates_json, reverse_coordinates_json, reverse_waypoints_json, lat_start, lon_start, lat_end, lon_end, direction_mode
  ON public.doh_detour_routes
  FOR EACH ROW EXECUTE FUNCTION public.doh_bump_detour_geometry_revision();

CREATE OR REPLACE FUNCTION public.doh_invalidate_event_detour_reviews()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.geometry_revision IS DISTINCT FROM OLD.geometry_revision THEN
    UPDATE public.doh_event_detour_links
      SET recommendation = 'PENDING',
          reviewed_geometry_version = NULL,
          updated_at = now()
      WHERE detour_id = NEW.id
        AND recommendation = 'RECOMMENDED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doh_detour_invalidate_event_reviews ON public.doh_detour_routes;
CREATE TRIGGER trg_doh_detour_invalidate_event_reviews
  AFTER UPDATE ON public.doh_detour_routes
  FOR EACH ROW EXECUTE FUNCTION public.doh_invalidate_event_detour_reviews();

-- Initial backfill is deliberately conservative. It runs exactly once: existing
-- legacy links become PENDING, and a later re-run cannot resurrect a link an
-- operator intentionally removed through the new relationship editor.
CREATE TABLE IF NOT EXISTS public.doh_event_detour_backfill_markers (
  marker text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  should_backfill boolean := false;
BEGIN
  INSERT INTO public.doh_event_detour_backfill_markers(marker)
  VALUES ('event_detour_relationships_v1')
  ON CONFLICT (marker) DO NOTHING
  RETURNING true INTO should_backfill;

  IF should_backfill THEN
    WITH source_segments AS (
      SELECT
        f.id AS flood_id,
        COALESCE(NULLIF(btrim(f.direction_meta->>'eventId'), ''), 'EV-' || f.id) AS event_id,
        CASE COALESCE(f.direction_meta->>'directionCode', '')
          WHEN 'A_TO_B' THEN 'A_TO_B'
          WHEN 'B_TO_A' THEN 'B_TO_A'
          WHEN 'BOTH' THEN 'BOTH'
          ELSE 'UNKNOWN'
        END AS event_direction
      FROM public.doh_flood_routes f
    )
    INSERT INTO public.doh_flood_events(id)
    SELECT DISTINCT event_id FROM source_segments
    ON CONFLICT (id) DO NOTHING;

    WITH source_segments AS (
      SELECT
        f.id AS flood_id,
        COALESCE(NULLIF(btrim(f.direction_meta->>'eventId'), ''), 'EV-' || f.id) AS event_id,
        CASE COALESCE(f.direction_meta->>'directionCode', '')
          WHEN 'A_TO_B' THEN 'A_TO_B'
          WHEN 'B_TO_A' THEN 'B_TO_A'
          WHEN 'BOTH' THEN 'BOTH'
          ELSE 'UNKNOWN'
        END AS event_direction
      FROM public.doh_flood_routes f
    ), numbered_segments AS (
      SELECT
        flood_id,
        event_id,
        event_direction,
        row_number() OVER (PARTITION BY event_id ORDER BY flood_id)::integer AS segment_position
      FROM source_segments
    )
    INSERT INTO public.doh_event_segments(flood_id, event_id, event_direction, segment_position)
    SELECT flood_id, event_id, event_direction, segment_position
    FROM numbered_segments
    ON CONFLICT (flood_id) DO NOTHING;

    WITH legacy_links AS (
      SELECT
        s.event_id,
        d.id AS detour_id,
        CASE WHEN s.event_direction IN ('A_TO_B', 'B_TO_A') THEN s.event_direction ELSE 'UNKNOWN' END AS event_direction,
        CASE d.direction_mode
          WHEN 'FORWARD_ONLY' THEN 'FORWARD'
          WHEN 'REVERSE_ONLY' THEN 'REVERSE'
          ELSE 'UNKNOWN'
        END AS detour_direction,
        CASE
          WHEN jsonb_typeof(d.detour_meta->'event_orders'->d.flood_id_ref) = 'number'
            AND d.detour_meta->'event_orders'->>d.flood_id_ref ~ '^[1-9][0-9]{0,8}$'
            THEN (d.detour_meta->'event_orders'->>d.flood_id_ref)::integer
          WHEN jsonb_typeof(d.detour_meta->'order_index') = 'number'
            AND d.detour_meta->>'order_index' ~ '^[1-9][0-9]{0,8}$'
            THEN (d.detour_meta->>'order_index')::integer
          ELSE NULL
        END AS legacy_position,
        CASE WHEN d.deleted_at IS NULL THEN 'PENDING' ELSE 'WITHDRAWN' END AS recommendation
      FROM public.doh_detour_routes d
      JOIN public.doh_event_segments s ON s.flood_id = d.flood_id_ref
      WHERE d.flood_id_ref IS NOT NULL
    ), ranked_legacy_links AS (
      SELECT
        *,
        row_number() OVER (
          PARTITION BY event_id, event_direction
          ORDER BY legacy_position NULLS LAST, detour_id
        )::integer AS position
      FROM legacy_links
    )
    INSERT INTO public.doh_event_detour_links(
      event_id, detour_id, event_direction, detour_direction, position, recommendation, reviewed_geometry_version
    )
    SELECT event_id, detour_id, event_direction, detour_direction, position, recommendation, NULL
    FROM ranked_legacy_links
    ON CONFLICT (event_id, detour_id, event_direction) DO NOTHING;
  END IF;
END;
$$;

ALTER TABLE public.doh_flood_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doh_event_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doh_event_detour_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doh_event_detour_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doh_event_detour_backfill_markers ENABLE ROW LEVEL SECURITY;

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
      OR jsonb_typeof(x->'eventDirection') <> 'string' OR x->>'eventDirection' NOT IN ('A_TO_B', 'B_TO_A', 'UNKNOWN')
      OR jsonb_typeof(x->'detourDirection') <> 'string' OR x->>'detourDirection' NOT IN ('FORWARD', 'REVERSE', 'UNKNOWN')
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
        OR NOT EXISTS (
          SELECT 1
          FROM public.doh_event_segments s
          WHERE s.event_id = p_event_id
            AND s.event_direction IN (x->>'eventDirection', 'BOTH')
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

REVOKE ALL ON FUNCTION public.doh_replace_event_detour_links(text, integer, text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.doh_replace_event_detour_links(text, integer, text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.doh_replace_event_detour_links(text, integer, text, jsonb) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- FOR SHARE in the replacement RPC requires UPDATE privilege in PostgreSQL.
    -- This role already owns the existing Edge mutation path for detour masters.
    GRANT SELECT, UPDATE ON TABLE public.doh_detour_routes TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doh_flood_events TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doh_event_segments TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doh_event_detour_links TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.doh_event_detour_operations TO service_role;
    GRANT EXECUTE ON FUNCTION public.doh_replace_event_detour_links(text, integer, text, jsonb) TO service_role;
  END IF;
END;
$$;
