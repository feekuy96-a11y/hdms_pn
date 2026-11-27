-- Isolated fixture for the deployed flood trigger and both closure migrations.
-- Requires synthetic closure rows and four named fixture flood/related rows on
-- a disposable schema. Do not run against the production project.
BEGIN;

UPDATE public.doh_flood_routes SET deleted_at = now() WHERE id IN ('F-CLOSURE-A', 'F-NO-CLOSURE');
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.doh_event_segments WHERE flood_id IN ('F-CLOSURE-A', 'F-NO-CLOSURE')) THEN
    RAISE EXCEPTION 'Soft-delete must remove both operational segments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doh_event_segments WHERE flood_id = 'F-CLOSURE-B') THEN
    RAISE EXCEPTION 'A remaining segment must stay attached';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doh_flood_events WHERE id = 'EV-NO-CLOSURE') THEN
    RAISE EXCEPTION 'Final ordinary flood event must keep the original cleanup behavior';
  END IF;
END;
$test$;

UPDATE public.doh_flood_routes SET deleted_at = now() WHERE id = 'F-CLOSURE-B';
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.doh_flood_events WHERE id = 'EV-CLOSURE-HISTORY')
      OR NOT EXISTS (SELECT 1 FROM public.doh_road_closure_records WHERE event_id = 'EV-CLOSURE-HISTORY') THEN
    RAISE EXCEPTION 'Soft-delete must preserve event identity and private closure history';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doh_event_segments WHERE event_id = 'EV-CLOSURE-HISTORY')
      OR EXISTS (SELECT 1 FROM public.doh_event_detour_links WHERE event_id = 'EV-CLOSURE-HISTORY')
      OR EXISTS (SELECT 1 FROM public.doh_detour_routes WHERE flood_id_ref IN ('F-CLOSURE-A', 'F-CLOSURE-B')) THEN
    RAISE EXCEPTION 'Private history must not keep active segments or detour links';
  END IF;
END;
$test$;

SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.doh_flood_events WHERE id = 'EV-CLOSURE-HISTORY') THEN
    RAISE EXCEPTION 'An unauthenticated reader must not see the closure-only event';
  END IF;
  BEGIN
    PERFORM 1 FROM public.doh_road_closure_records;
    RAISE EXCEPTION 'An unauthenticated reader must not see closure records';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

UPDATE public.doh_flood_routes SET deleted_at = NULL WHERE id IN ('F-CLOSURE-B', 'F-NO-CLOSURE');
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.doh_event_segments WHERE event_id='EV-CLOSURE-HISTORY' AND flood_id='F-CLOSURE-B')
      OR NOT EXISTS (SELECT 1 FROM public.doh_event_segments WHERE event_id='EV-NO-CLOSURE' AND flood_id='F-NO-CLOSURE') THEN
    RAISE EXCEPTION 'Restore must attach the original event identity, with or without a closure';
  END IF;
END;
$test$;
ROLLBACK;

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.doh_event_segments WHERE event_id='EV-CLOSURE-HISTORY') <> 2
      OR NOT EXISTS (SELECT 1 FROM public.doh_event_detour_links WHERE event_id='EV-CLOSURE-HISTORY')
      OR NOT EXISTS (SELECT 1 FROM public.doh_road_closure_records WHERE event_id='EV-CLOSURE-HISTORY') THEN
    RAISE EXCEPTION 'A rolled-back delete must not change related rows';
  END IF;
END;
$test$;
