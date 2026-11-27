-- New relations from the detour editor start at global rank 1. Existing
-- explicit order and review status are preserved, apart from shifting ranks.
-- Compatible with Edge v26: function signature and result remain unchanged.
-- Deploy only after the global event order migration.
CREATE OR REPLACE FUNCTION public.doh_append_event_detour_link(p_flood_id text, p_detour_id text)
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

  -- The event lock above also serializes inserts with the manual reorder
  -- path. Do not move an existing link again on retry or normal edit.
  WITH first_link AS (
    SELECT DISTINCT ON (detour_id)
      detour_id, event_position, position,
      CASE event_direction WHEN 'BOTH' THEN 0 WHEN 'A_TO_B' THEN 1 WHEN 'B_TO_A' THEN 2 ELSE 3 END AS direction_rank
    FROM public.doh_event_detour_links
    WHERE event_id = link_event
    ORDER BY detour_id, event_position NULLS LAST, position, direction_rank
  ), ranks AS (
    SELECT detour_id,
      (1 + row_number() OVER (ORDER BY event_position NULLS LAST, position, direction_rank, detour_id COLLATE "C"))::int AS new_rank
    FROM first_link
  )
  UPDATE public.doh_event_detour_links l
  SET event_position = ranks.new_rank,
      position = l.position + CASE WHEN l.event_direction = link_event_dir THEN 1 ELSE 0 END
  FROM ranks
  WHERE l.event_id = link_event AND l.detour_id = ranks.detour_id;

  INSERT INTO public.doh_event_detour_links
    (event_id, detour_id, event_direction, detour_direction, position, event_position, recommendation)
  VALUES (link_event, p_detour_id, link_event_dir, link_detour_dir, 1, 1, 'PENDING');

  UPDATE public.doh_flood_events SET link_version = link_version + 1, updated_at = now()
  WHERE id = link_event;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.doh_append_event_detour_link(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doh_append_event_detour_link(text, text) TO service_role;
