-- Keep private history linked when the final flood segment is soft-deleted.
-- Apply before releasing the closure SQL import UI. No new grants or policies.
-- Rollback after use: revert/disable the import UI, but keep this guard while
-- any closure records reference events. Removing it would break soft-deletion.
BEGIN;

DO $migration$
DECLARE
  current_def text := pg_catalog.pg_get_functiondef('public.doh_sync_flood_event_segment()'::regprocedure);
  original_fragment constant text := $before$
      DELETE FROM public.doh_flood_events e
      WHERE e.id = v_event_id
        AND NOT EXISTS (
          SELECT 1 FROM public.doh_event_detour_operations op WHERE op.event_id = e.id
        );$before$;
  guarded_fragment constant text := $after$
      -- Serialize this final cleanup with the FK key lock used by closure imports.
      PERFORM 1 FROM public.doh_flood_events e WHERE e.id = v_event_id FOR UPDATE;
      DELETE FROM public.doh_flood_events e
      WHERE e.id = v_event_id
        AND NOT EXISTS (
          SELECT 1 FROM public.doh_event_detour_operations op WHERE op.event_id = e.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.doh_road_closure_records closure WHERE closure.event_id = e.id
        );$after$;
  remainder text;
BEGIN
  IF pg_catalog.to_regclass('public.doh_road_closure_records') IS NULL THEN
    RAISE EXCEPTION 'The private road closure table must exist before patching flood cleanup';
  END IF;
  IF pg_catalog.strpos(current_def, guarded_fragment) > 0 THEN
    RETURN;
  END IF;
  IF pg_catalog.strpos(current_def, original_fragment) = 0 THEN
    RAISE EXCEPTION 'Unexpected flood event cleanup definition; inspect the live trigger before applying';
  END IF;
  remainder := pg_catalog.replace(current_def, original_fragment, '');
  IF pg_catalog.length(current_def) - pg_catalog.length(remainder) <> pg_catalog.length(original_fragment) THEN
    RAISE EXCEPTION 'More than one matching flood cleanup fragment; refusing to change the trigger';
  END IF;
  EXECUTE pg_catalog.replace(current_def, original_fragment, guarded_fragment);
END;
$migration$;

COMMIT;
