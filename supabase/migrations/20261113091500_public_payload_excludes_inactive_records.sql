-- =============================================================================
-- Migration: 20261113091500_public_payload_excludes_inactive_records.sql
-- Purpose:
--   Create a public-only payload wrapper.  The admin payload intentionally keeps
--   Draft/inactive records, but the citizen endpoint must never transmit them.
--   This also removes timeline entries and linked detours that belong to a Draft
--   flood event.
--
-- Impact:
--   No tables or source records are changed.  Only callers of the new RPC receive
--   the filtered JSON payload.  The existing admin/display RPCs remain intact.
--
-- Rollback:
--   Re-deploy the previous Edge Function version so it calls
--   doh_get_system_data_display_rpc(), then DROP FUNCTION IF EXISTS
--   public.doh_get_public_system_data_display_rpc().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.doh_get_public_system_data_display_rpc()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  base jsonb;
BEGIN
  -- Preserve the existing display simplification and photo trimming first.
  base := public.doh_get_system_data_display_rpc();
  IF base IS NULL THEN
    RETURN base;
  END IF;

  -- A Draft is represented by is_active = false.  Treat an absent or malformed
  -- flag as inactive so a newly introduced record shape cannot leak publicly.
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

  -- A detour linked to a Draft flood is also Draft from the public point of view.
  -- Standalone detours remain visible when they are explicitly active.
  IF jsonb_typeof(base->'detourRoutes') = 'array' THEN
    base := jsonb_set(
      base,
      '{detourRoutes}',
      COALESCE((
        SELECT jsonb_agg(t.route ORDER BY t.ord)
        FROM jsonb_array_elements(base->'detourRoutes') WITH ORDINALITY AS t(route, ord)
        WHERE COALESCE((t.route->>'is_active')::boolean, false)
          AND (
            NULLIF(t.route->>'flood_id_ref', '') IS NULL
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(base->'floodRoutes') AS active(route)
              WHERE active.route->>'id' = t.route->>'flood_id_ref'
            )
          )
      ), '[]'::jsonb)
    );
  END IF;

  -- Timeline rows can contain the same unpublished location details; only expose
  -- rows whose flood event survived the public filter above.
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
$fn$;

GRANT EXECUTE ON FUNCTION public.doh_get_public_system_data_display_rpc()
  TO anon, authenticated, service_role;
