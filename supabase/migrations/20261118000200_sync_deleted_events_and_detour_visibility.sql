-- Sync soft-deletes & restores across doh_flood_routes, doh_detour_routes, doh_event_segments,
-- doh_event_detour_links, and doh_flood_events, and recover active detours whose legacy
-- flood_id_ref referenced an already-deleted flood segment.
--
-- Why:
-- 1) Active detours (e.g. D-7dc93ad2, D-e954426a) became hidden by RLS policy
--    doh_detour_deleted_visibility and doh_get_public_system_data_display_rpc because
--    their legacy flood_id_ref pointed to a soft-deleted flood route (F-14ab47e0).
-- 2) Soft-deleting flood routes or detours left stale rows in doh_event_segments,
--    doh_event_detour_links, and doh_flood_events.
-- 3) RLS & public RPC must recognize active M2M links in doh_event_detour_links.
--
-- Impact:
-- - Clears orphaned flood_id_ref values on non-deleted detours referencing deleted floods.
-- - Cleans orphaned segments/links/unreferenced events tied to deleted floods/detours.
-- - Keeps triggers synchronized on future soft-deletes and restores.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_doh_sync_detour_delete ON public.doh_detour_routes;
--   DROP FUNCTION IF EXISTS public.doh_sync_detour_delete();
--   Restore trg_doh_sync_flood_event_segment, doh_sync_flood_event_segment(),
--   doh_detour_deleted_visibility, and doh_get_public_system_data_display_rpc()
--   from previous migrations.

-- 1. Clean existing orphaned references & deleted-record leftovers
UPDATE public.doh_detour_routes d
SET flood_id_ref = NULL,
    updated_at = now()
WHERE d.flood_id_ref IS NOT NULL
  AND (
    NOT EXISTS (SELECT 1 FROM public.doh_flood_routes f WHERE f.id = d.flood_id_ref)
    OR EXISTS (
      SELECT 1 FROM public.doh_flood_routes f
      WHERE f.id = d.flood_id_ref AND f.deleted_at IS NOT NULL
    )
  );

DELETE FROM public.doh_event_segments s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.doh_flood_routes f
  WHERE f.id = s.flood_id AND f.deleted_at IS NULL
);

DELETE FROM public.doh_event_detour_links l
WHERE NOT EXISTS (
  SELECT 1
  FROM public.doh_event_segments s
  WHERE s.event_id = l.event_id
)
   OR NOT EXISTS (
  SELECT 1
  FROM public.doh_detour_routes d
  WHERE d.id = l.detour_id AND d.deleted_at IS NULL
);

DELETE FROM public.doh_flood_events e
WHERE NOT EXISTS (SELECT 1 FROM public.doh_event_segments s WHERE s.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.doh_event_detour_links l WHERE l.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.doh_event_detour_operations op WHERE op.event_id = e.id);

-- 2. Trigger sync for soft-delete & restore on doh_flood_routes
CREATE OR REPLACE FUNCTION public.doh_sync_flood_event_segment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id text;
  v_event_direction text;
  v_previous_event_id text;
  v_previous_position integer;
  v_position integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    SELECT event_id INTO v_event_id
    FROM public.doh_event_segments
    WHERE flood_id = NEW.id;

    DELETE FROM public.doh_event_segments
    WHERE flood_id = NEW.id;

    UPDATE public.doh_detour_routes
    SET flood_id_ref = NULL,
        updated_at = now()
    WHERE flood_id_ref = NEW.id;

    IF v_event_id IS NULL THEN
      v_event_id := NULLIF(btrim(COALESCE(NEW.direction_meta->>'eventId', '')), '');
    END IF;
    IF v_event_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.doh_event_segments WHERE event_id = v_event_id
    ) THEN
      DELETE FROM public.doh_event_detour_links WHERE event_id = v_event_id;
      DELETE FROM public.doh_flood_events e
      WHERE e.id = v_event_id
        AND NOT EXISTS (
          SELECT 1 FROM public.doh_event_detour_operations op WHERE op.event_id = e.id
        );
    END IF;

    RETURN NEW;
  END IF;

  v_event_id := NULLIF(btrim(COALESCE(NEW.direction_meta->>'eventId', '')), '');
  IF v_event_id IS NULL THEN
    v_event_id := 'EV-' || NEW.id;
  END IF;
  IF char_length(v_event_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'INVALID_EVENT_ID' USING ERRCODE = '22023';
  END IF;

  v_event_direction := CASE COALESCE(NEW.direction_meta->>'directionCode', '')
    WHEN 'A_TO_B' THEN 'A_TO_B'
    WHEN 'B_TO_A' THEN 'B_TO_A'
    WHEN 'BOTH' THEN 'BOTH'
    ELSE 'UNKNOWN'
  END;

  INSERT INTO public.doh_flood_events(id)
  VALUES (v_event_id)
  ON CONFLICT (id) DO NOTHING;

  PERFORM 1
  FROM public.doh_flood_events
  WHERE id = v_event_id
  FOR UPDATE;

  SELECT event_id, segment_position
  INTO v_previous_event_id, v_previous_position
  FROM public.doh_event_segments
  WHERE flood_id = NEW.id
  FOR UPDATE;

  IF FOUND AND v_previous_event_id = v_event_id THEN
    v_position := v_previous_position;
  ELSE
    SELECT COALESCE(MAX(segment_position), 0) + 1
    INTO v_position
    FROM public.doh_event_segments
    WHERE event_id = v_event_id;
  END IF;

  INSERT INTO public.doh_event_segments(flood_id, event_id, event_direction, segment_position)
  VALUES (NEW.id, v_event_id, v_event_direction, v_position)
  ON CONFLICT (flood_id) DO UPDATE
  SET event_id = EXCLUDED.event_id,
      event_direction = EXCLUDED.event_direction,
      segment_position = EXCLUDED.segment_position;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_doh_sync_flood_event_segment ON public.doh_flood_routes;
CREATE TRIGGER trg_doh_sync_flood_event_segment
  AFTER INSERT OR UPDATE OF direction_meta, deleted_at ON public.doh_flood_routes
  FOR EACH ROW EXECUTE FUNCTION public.doh_sync_flood_event_segment();

-- 3. Trigger sync when soft-deleting detours
CREATE OR REPLACE FUNCTION public.doh_sync_detour_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.doh_event_detour_links
    WHERE detour_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_doh_sync_detour_delete ON public.doh_detour_routes;
CREATE TRIGGER trg_doh_sync_detour_delete
  AFTER UPDATE OF deleted_at ON public.doh_detour_routes
  FOR EACH ROW EXECUTE FUNCTION public.doh_sync_detour_delete();

-- 4. Boolean-only helper for checking active event-detour links across RLS & public display RPC
CREATE OR REPLACE FUNCTION public.doh_detour_has_active_event_link(
  p_detour_id text,
  p_require_active_flood boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doh_event_detour_links l
    JOIN public.doh_event_segments s ON s.event_id = l.event_id
    JOIN public.doh_flood_routes f ON f.id = s.flood_id
    WHERE l.detour_id = p_detour_id
      AND l.recommendation IN ('PENDING', 'RECOMMENDED')
      AND f.deleted_at IS NULL
      AND (NOT p_require_active_flood OR f.is_active IS TRUE)
  );
$$;

REVOKE ALL ON FUNCTION public.doh_detour_has_active_event_link(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doh_detour_has_active_event_link(text, boolean) TO anon, authenticated, service_role;

-- 5. Update detour RLS visibility & public RPC to respect M2M event links cleanly
DROP POLICY IF EXISTS doh_detour_deleted_visibility ON public.doh_detour_routes;
CREATE POLICY doh_detour_deleted_visibility ON public.doh_detour_routes
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        public.doh_detour_has_active_event_link(id::text, false)
        OR flood_id_ref IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.doh_flood_routes f
          WHERE f.id::text = doh_detour_routes.flood_id_ref::text
            AND f.deleted_at IS NULL
        )
      )
    )
    OR ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'doh_admin'::text])
  );

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
$function$;
