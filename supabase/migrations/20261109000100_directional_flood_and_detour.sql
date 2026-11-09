-- =============================================================================
-- Migration: 20261109000100_directional_flood_and_detour.sql
-- Purpose:
--   1. Support directional & lane-specific flood reporting (Item 3):
--      road_side, affected_lanes, affected_shoulder, reporter_name, direction_meta
--      plus timeline update fields.
--   2. Support bidirectional & asymmetric detour routing A->B and B->A (Item 4):
--      reverse_coordinates_json, reverse_waypoints_json, direction_mode, detour_meta
--
-- Safety:
--   - Strictly additive & idempotent (ADD COLUMN IF NOT EXISTS).
--   - Existing rows, constraints, triggers, and RPCs (to_jsonb(f), to_jsonb(d), to_jsonb(t))
--     automatically expose the new columns without overwriting patched RPC definitions.
--
-- Rollback plan (if ever needed):
--   ALTER TABLE public.doh_flood_routes
--     DROP COLUMN IF EXISTS road_side,
--     DROP COLUMN IF EXISTS affected_lanes,
--     DROP COLUMN IF EXISTS affected_shoulder,
--     DROP COLUMN IF EXISTS reporter_name,
--     DROP COLUMN IF EXISTS direction_meta;
--   ALTER TABLE public.doh_timeline_updates
--     DROP COLUMN IF EXISTS road_side,
--     DROP COLUMN IF EXISTS affected_lanes,
--     DROP COLUMN IF EXISTS affected_shoulder,
--     DROP COLUMN IF EXISTS direction_meta;
--   ALTER TABLE public.doh_detour_routes
--     DROP COLUMN IF EXISTS reverse_coordinates_json,
--     DROP COLUMN IF EXISTS reverse_waypoints_json,
--     DROP COLUMN IF EXISTS direction_mode,
--     DROP COLUMN IF EXISTS detour_meta;
-- =============================================================================

-- 1. Flood Routes: Directional, Lane, Shoulder, Reporter & Metadata columns
ALTER TABLE public.doh_flood_routes
  ADD COLUMN IF NOT EXISTS road_side VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS affected_lanes VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_shoulder VARCHAR(30) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS reporter_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS direction_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_flood_road_side'
  ) THEN
    ALTER TABLE public.doh_flood_routes
      ADD CONSTRAINT chk_doh_flood_road_side
      CHECK (road_side IN ('LEFT', 'RIGHT', 'BOTH', 'UNKNOWN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_flood_affected_shoulder'
  ) THEN
    ALTER TABLE public.doh_flood_routes
      ADD CONSTRAINT chk_doh_flood_affected_shoulder
      CHECK (affected_shoulder IN ('NONE', 'LEFT', 'RIGHT', 'BOTH', 'AFFECTED', 'UNKNOWN'));
  END IF;
END $$;

-- 2. Timeline Updates: Preserve directional/lane snapshot per historical update
ALTER TABLE public.doh_timeline_updates
  ADD COLUMN IF NOT EXISTS road_side VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS affected_lanes VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_shoulder VARCHAR(30) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS direction_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Detour Routes: Separate A->B and B->A geometries, waypoints & direction mode
ALTER TABLE public.doh_detour_routes
  ADD COLUMN IF NOT EXISTS reverse_coordinates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reverse_waypoints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS direction_mode VARCHAR(30) NOT NULL DEFAULT 'TWO_WAY',
  ADD COLUMN IF NOT EXISTS detour_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_detour_direction_mode'
  ) THEN
    ALTER TABLE public.doh_detour_routes
      ADD CONSTRAINT chk_doh_detour_direction_mode
      CHECK (direction_mode IN ('TWO_WAY', 'FORWARD_ONLY', 'REVERSE_ONLY'));
  END IF;
END $$;

