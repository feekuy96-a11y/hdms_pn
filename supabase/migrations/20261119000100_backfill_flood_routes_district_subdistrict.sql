-- =============================================================================
-- Migration: 20261119000100_backfill_flood_routes_district_subdistrict.sql
-- Purpose:
--   One-off idempotent backfill of missing `district` and `subdistrict` values
--   on public.doh_flood_routes (22 rows identified with empty strings), derived
--   from `(lon_start, lat_start)` against verified 115-tambon DOPA boundaries
--   (lib/gis-data.ts & lib/area-lookup.ts).
--   Note: Intentionally preserves `updated_at` so public relative-time badges
--   ("อัปเดตล่าสุด") and doh_enqueue_external_report() trigger are not mutated.
--
-- Rollback Plan:
--   Run the following SQL to revert these 22 rows back to empty strings:
--   UPDATE public.doh_flood_routes
--   SET district = '', subdistrict = ''
--   WHERE id IN (
--     'F-06921eb2-ab4f-425c-96e3-0639f4f63a34',
--     'F-0e0383ca-03fb-47a0-8767-29a3c0e4d546',
--     'F-12eba5a3-a2d9-44d4-93ce-c628cd137266',
--     'F-14ab47e0-4c13-4540-92e8-30d580806237',
--     'F-14bad70c-09d5-4dee-bc0b-becb73a9a977',
--     'F-1a6500c8-9a6a-4fbc-8c44-acce22b1f803',
--     'F-4b5bfca3-dff9-4ef8-baa3-07fa0614081b',
--     'F-4b730fe9-a21b-4af1-84c2-be90d02dd71e',
--     'F-4bccf3c0-0fc3-400b-b7d4-95428179f223',
--     'F-5e75911c-3b6d-4026-bc05-05ecd7a9dfe8',
--     'F-65a3ed3f-56c2-414b-9b9d-bdf50f23edc5',
--     'F-79b2b376-3659-4dca-917a-a2601475ce53',
--     'F-7b681460-703b-41a7-b196-7155b8f618fc',
--     'F-808f2278-c99e-4269-af57-e5f33e0fa6bc',
--     'F-a59af13c-1ad4-4ea0-ac06-cdd408860ed5',
--     'F-a6ad9704-4049-4fe2-8633-9b537309c650',
--     'F-c48eef3a-400a-407f-ba56-dba2013455ed',
--     'F-cde0a35f-8480-401a-8195-496a20bbc355',
--     'F-cfe6cba3-a393-44b4-8475-df81f4714ce5',
--     'F-e76b3870-170c-4340-891a-a654d17dd888',
--     'F-ee275b49-8a46-426a-9089-83fadab579e9',
--     'test-check-only-999'
--   );
-- =============================================================================

UPDATE public.doh_flood_routes AS route
SET
  district = CASE
    WHEN COALESCE(TRIM(route.district), '') = '' THEN v.district
    ELSE route.district
  END,
  subdistrict = CASE
    WHEN COALESCE(TRIM(route.subdistrict), '') = '' THEN v.subdistrict
    ELSE route.subdistrict
  END
FROM (
  VALUES
    ('F-06921eb2-ab4f-425c-96e3-0639f4f63a34', 'หนองจิก', 'ดอนรัก'),
    ('F-0e0383ca-03fb-47a0-8767-29a3c0e4d546', 'สายบุรี', 'ละหาร'),
    ('F-12eba5a3-a2d9-44d4-93ce-c628cd137266', 'โคกโพธิ์', 'โคกโพธิ์'),
    ('F-14ab47e0-4c13-4540-92e8-30d580806237', 'หนองจิก', 'ปุโละปุโย'), -- soft-deleted test row
    ('F-14bad70c-09d5-4dee-bc0b-becb73a9a977', 'โคกโพธิ์', 'นาเกตุ'),
    ('F-1a6500c8-9a6a-4fbc-8c44-acce22b1f803', 'หนองจิก', 'ลิปะสะโง'),
    ('F-4b5bfca3-dff9-4ef8-baa3-07fa0614081b', 'เมืองปัตตานี', 'ตะลุโบะ'),
    ('F-4b730fe9-a21b-4af1-84c2-be90d02dd71e', 'มายอ', 'มายอ'),
    ('F-4bccf3c0-0fc3-400b-b7d4-95428179f223', 'สายบุรี', 'ละหาร'),
    ('F-5e75911c-3b6d-4026-bc05-05ecd7a9dfe8', 'เมืองปัตตานี', 'รูสะมิแล'),
    ('F-65a3ed3f-56c2-414b-9b9d-bdf50f23edc5', 'สายบุรี', 'ละหาร'), -- soft-deleted row
    ('F-79b2b376-3659-4dca-917a-a2601475ce53', 'มายอ', 'มายอ'),
    ('F-7b681460-703b-41a7-b196-7155b8f618fc', 'เมืองปัตตานี', 'รูสะมิแล'),
    ('F-808f2278-c99e-4269-af57-e5f33e0fa6bc', 'เมืองปัตตานี', 'จะบังติกอ'),
    ('F-a59af13c-1ad4-4ea0-ac06-cdd408860ed5', 'หนองจิก', 'ลิปะสะโง'),
    ('F-a6ad9704-4049-4fe2-8633-9b537309c650', 'หนองจิก', 'ท่ากำชำ'),
    ('F-c48eef3a-400a-407f-ba56-dba2013455ed', 'ปะนาเระ', 'ควน'),
    ('F-cde0a35f-8480-401a-8195-496a20bbc355', 'เมืองปัตตานี', 'ตะลุโบะ'),
    ('F-cfe6cba3-a393-44b4-8475-df81f4714ce5', 'ปะนาเระ', 'ดอน'),
    ('F-e76b3870-170c-4340-891a-a654d17dd888', 'เมืองปัตตานี', 'บานา'),
    ('F-ee275b49-8a46-426a-9089-83fadab579e9', 'โคกโพธิ์', 'มะกรูด'),
    ('test-check-only-999', 'หนองจิก', 'ปุโละปุโย') -- soft-deleted test row
) AS v(id, district, subdistrict)
WHERE route.id = v.id
  AND (
    COALESCE(TRIM(route.district), '') = ''
    OR COALESCE(TRIM(route.subdistrict), '') = ''
  );
