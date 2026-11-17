-- Keep the additive Event↔Detour foundation in sync with the existing flood
-- save path. The first migration backfilled historical rows once, but future
-- writes still arrive through doh_flood_routes.direction_meta.
--
-- Why: without this trigger, a new flood segment has an eventId in legacy JSON
-- but no doh_flood_events/doh_event_segments row. The atomic link editor then
-- returns EVENT_NOT_FOUND even though the event is visible in Admin.
--
-- Rollback before Event↔Detour UI cutover: DROP TRIGGER
-- trg_doh_sync_flood_event_segment ON public.doh_flood_routes; then DROP
-- FUNCTION public.doh_sync_flood_event_segment(). Do not remove legacy fields
-- or the tables created by 20261117135032_event_detour_relationships.sql.

CREATE OR REPLACE FUNCTION public.doh_sync_flood_event_segment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text;
  v_event_direction text;
  v_previous_event_id text;
  v_previous_position integer;
  v_position integer;
BEGIN
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

  -- A row lock on the event serializes position allocation for simultaneous
  -- saves of two segments belonging to one event. Existing memberships keep
  -- their position, so editing a segment does not silently reorder it.
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
$$;

DROP TRIGGER IF EXISTS trg_doh_sync_flood_event_segment ON public.doh_flood_routes;
CREATE TRIGGER trg_doh_sync_flood_event_segment
  AFTER INSERT OR UPDATE OF direction_meta
  ON public.doh_flood_routes
  FOR EACH ROW EXECUTE FUNCTION public.doh_sync_flood_event_segment();
