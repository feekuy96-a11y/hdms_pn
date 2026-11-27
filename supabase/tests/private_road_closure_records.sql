-- Execute against a disposable local or staging database with the closure migration.
-- Uses a synthetic incident only. ROLLBACK preserves the database when the tests pass.
BEGIN;

INSERT INTO public.doh_flood_events(id) VALUES ('EV-CLOSURE-POLICY-FIXTURE');

SELECT set_config('closure_test.payload', $payload$
{"version":1,"eventId":"EV-CLOSURE-POLICY-FIXTURE","route":"ถนนทดสอบ","section":"","roadMode":"MAP_AB",
 "begins":"","reason":"ทดสอบ","note":"ไม่ใช่ข้อมูลจริง","savedAt":"2026-11-27T00:00:00.000Z","detourIds":[],
 "a":{"position":[101,6],"km":"","area":"A","landmark":"AAA","photo":""},
 "b":{"position":[101.1,6],"km":"","area":"B","landmark":"BBB","photo":""},"line":[[101,6],[101.1,6]]}
$payload$,true);

SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF has_table_privilege(current_user,'public.doh_road_closure_records','SELECT') OR
     has_any_column_privilege(current_user,'public.doh_road_closure_records','SELECT') OR
     has_any_column_privilege(current_user,'public.doh_road_closure_records','INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Anonymous role must not have closure data privileges';
  END IF;
END
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"app_metadata":{"role":"viewer"},"user_metadata":{"role":"admin"}}',true);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',current_setting('closure_test.payload')::jsonb);
    RAISE EXCEPTION 'A non-admin or user_metadata escalation must not write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true,"app_metadata":{"role":"admin"}}',true);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',current_setting('closure_test.payload')::jsonb);
    RAISE EXCEPTION 'An anonymous Supabase sign-in cannot write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"app_metadata":{"role":"road_closure_editor"}}',true);
DO $test$
DECLARE
  saved_payload jsonb := current_setting('closure_test.payload')::jsonb;
  first_revision uuid;
  second_revision uuid;
BEGIN
  BEGIN
    INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',jsonb_set(saved_payload,'{line}','[[101,6],[6,101]]'));
    RAISE EXCEPTION 'Invalid latitude was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',jsonb_set(saved_payload,'{a,area}','""'));
    RAISE EXCEPTION 'Missing endpoint area was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',jsonb_set(saved_payload,'{line}','[[101.001,6],[101.1,6]]'));
    RAISE EXCEPTION 'A line more than 40 m from the first endpoint was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.doh_road_closure_records(event_id,payload)
    VALUES ('EV-CLOSURE-POLICY-FIXTURE',saved_payload) RETURNING revision INTO STRICT first_revision;

  UPDATE public.doh_road_closure_records SET payload=jsonb_set(saved_payload,'{note}','"ทดสอบแก้ไข"')
  WHERE event_id='EV-CLOSURE-POLICY-FIXTURE' AND revision=first_revision
  RETURNING revision INTO STRICT second_revision;
  IF first_revision = second_revision THEN RAISE EXCEPTION 'Update must change revision'; END IF;

  UPDATE public.doh_road_closure_records SET payload=saved_payload
  WHERE event_id='EV-CLOSURE-POLICY-FIXTURE' AND revision=first_revision;
  IF FOUND THEN RAISE EXCEPTION 'A stale update must not match the row'; END IF;

  BEGIN
    DELETE FROM public.doh_road_closure_records WHERE event_id='EV-CLOSURE-POLICY-FIXTURE';
    RAISE EXCEPTION 'Editor must not have DELETE privilege';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;

SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false,"app_metadata":{"role":"admin"}}',true);
DO $test$
BEGIN
  IF (
    SELECT payload->>'note' FROM public.doh_road_closure_records WHERE event_id='EV-CLOSURE-POLICY-FIXTURE'
  ) IS DISTINCT FROM 'ทดสอบแก้ไข' THEN
    RAISE EXCEPTION 'Another authorized staff account must read the saved update';
  END IF;
END
$test$;

SELECT set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":false,"app_metadata":{"role":"viewer"},"user_metadata":{"role":"admin"}}',true);
DO $test$
BEGIN
  IF EXISTS(SELECT 1 FROM public.doh_road_closure_records WHERE event_id='EV-CLOSURE-POLICY-FIXTURE') THEN
    RAISE EXCEPTION 'Non-admin must not read private closure data';
  END IF;
END
$test$;
ROLLBACK;
