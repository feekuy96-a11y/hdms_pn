-- =============================================================================
-- Migration: 20261119000200_backfill_flood_route_f6bc2ee64.sql
-- Purpose:
--   Idempotent backfill for flood route `F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844`
--   (ทล.418 งาแม่ - ยุโป, created 2026-11-19 07:12:30Z prior to PR #49 deploy)
--   where `district` and `subdistrict` were blank. Resolved via DOPA polygon
--   from `(101.222628575, 6.855105571)` -> อ.เมืองปัตตานี, ต.รูสะมิแล.
--   Intentionally preserves `updated_at` so relative-time badges and
--   doh_enqueue_external_report() trigger are not mutated.
--
-- Rollback Plan:
--   UPDATE public.doh_flood_routes
--   SET district = '', subdistrict = ''
--   WHERE id = 'F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844';
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
    ('F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844', 'เมืองปัตตานี', 'รูสะมิแล')
) AS v(id, district, subdistrict)
WHERE route.id = v.id
  AND (
    COALESCE(TRIM(route.district), '') = ''
    OR COALESCE(TRIM(route.subdistrict), '') = ''
  );
