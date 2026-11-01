-- =============================================================================
-- Migration: Optimize Indexes, Row-Level Security (RLS) & PostGIS RPCs
-- Target: Supabase / PostgreSQL for DOH Pattani Flood Monitoring System
-- Supabase Postgres Best Practices:
--   1. query-composite-indexes: Composite B-tree indexes matching exact ORDER BY / WHERE patterns
--   2. query-partial-indexes: Partial indexes for active records (is_active = TRUE)
--   3. advanced-jsonb-indexing: GIN jsonb_path_ops indexes for coordinates_json
--   4. query-index-types: PostGIS GiST spatial indexing for geometries and coordinates
--   5. security-rls-basics & security-rls-performance: RLS enabled with cached (SELECT auth.role())
--   6. security-privileges: Explicit search_path hardening & STABLE function volatility
-- =============================================================================

-- Ensure PostGIS is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- 1. Optimize Indexes: doh_flood_routes
-- -----------------------------------------------------------------------------
-- Composite index for system data export sorting (is_active DESC, updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_doh_flood_active_updated 
    ON doh_flood_routes(is_active DESC, updated_at DESC);

-- Partial index for active incident filtering (5-20x smaller, faster lookups)
CREATE INDEX IF NOT EXISTS idx_doh_flood_active_status_route 
    ON doh_flood_routes(traffic_status, route_no) WHERE is_active = TRUE;

-- Route number lookup
CREATE INDEX IF NOT EXISTS idx_doh_flood_route_no 
    ON doh_flood_routes(route_no);

-- GIN Path Ops index for coordinates_json containment queries
CREATE INDEX IF NOT EXISTS idx_doh_flood_coords_gin 
    ON doh_flood_routes USING GIN (coordinates_json jsonb_path_ops);

-- GiST spatial index on starting coordinate
CREATE INDEX IF NOT EXISTS idx_doh_flood_spatial_start 
    ON doh_flood_routes USING GIST (ST_SetSRID(ST_Point(lon_start, lat_start), 4326));

-- -----------------------------------------------------------------------------
-- 2. Optimize Indexes: doh_detour_routes
-- -----------------------------------------------------------------------------
-- Composite index for sorting (is_active, updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_doh_detour_active_updated 
    ON doh_detour_routes(is_active, updated_at DESC);

-- Foreign key index for JOINs and CASCADE operations
CREATE INDEX IF NOT EXISTS idx_doh_detour_flood_ref 
    ON doh_detour_routes(flood_id_ref);

-- Partial index for active detour lookups
CREATE INDEX IF NOT EXISTS idx_doh_detour_active_ref 
    ON doh_detour_routes(flood_id_ref) WHERE is_active = TRUE;

-- GIN Path Ops index for detour coordinates
CREATE INDEX IF NOT EXISTS idx_doh_detour_coords_gin 
    ON doh_detour_routes USING GIN (coordinates_json jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- 3. Optimize Indexes: doh_timeline_updates
-- -----------------------------------------------------------------------------
-- Global reported_at DESC index (eliminates full table sort in doh_get_system_data_rpc)
CREATE INDEX IF NOT EXISTS idx_doh_timeline_reported_at 
    ON doh_timeline_updates(reported_at DESC);

-- Route-specific timeline history (composite FK + timestamp)
CREATE INDEX IF NOT EXISTS idx_doh_timeline_flood 
    ON doh_timeline_updates(flood_id_ref, reported_at DESC);

-- GiST spatial index for field GPS coordinates
CREATE INDEX IF NOT EXISTS idx_doh_timeline_spatial 
    ON doh_timeline_updates USING GIST (ST_SetSRID(ST_Point(longitude, latitude), 4326));

-- -----------------------------------------------------------------------------
-- 4. Optimize Indexes: doh_mitigation_projects
-- -----------------------------------------------------------------------------
-- Composite index for Governor KPI status filtering and budget sorting
CREATE INDEX IF NOT EXISTS idx_doh_proj_status_budget 
    ON doh_mitigation_projects(status_group, budget_mb DESC);

CREATE INDEX IF NOT EXISTS idx_doh_proj_route_no 
    ON doh_mitigation_projects(route_no);

-- -----------------------------------------------------------------------------
-- 5. Native PostGIS Geometry & Spatial Index: doh_highway_layers
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'doh_highway_layers' AND column_name = 'geom'
    ) THEN
        ALTER TABLE doh_highway_layers ADD COLUMN geom geometry(Geometry, 4326) DEFAULT NULL;
    END IF;
END $$;

-- GiST spatial index for lightning-fast road intersection queries
CREATE INDEX IF NOT EXISTS idx_doh_highway_layers_geom 
    ON doh_highway_layers USING GIST (geom);

-- Trigger to maintain native geometry from GeoJSON automatically
CREATE OR REPLACE FUNCTION doh_trg_sync_highway_layer_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.geojson_data IS NOT NULL AND (NEW.geojson_data ? 'geometry') THEN
        BEGIN
            NEW.geom := ST_SetSRID(ST_GeomFromGeoJSON(NEW.geojson_data->'geometry'), 4326);
        EXCEPTION WHEN OTHERS THEN
            NEW.geom := NULL;
        END IF;
    ELSE
        NEW.geom := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doh_highway_layer_geom ON doh_highway_layers;
CREATE TRIGGER trg_doh_highway_layer_geom
    BEFORE INSERT OR UPDATE OF geojson_data ON doh_highway_layers
    FOR EACH ROW
    EXECUTE FUNCTION doh_trg_sync_highway_layer_geom();

-- Backfill geometry on existing rows
UPDATE doh_highway_layers
SET geom = CASE 
    WHEN geojson_data IS NOT NULL AND (geojson_data ? 'geometry')
    THEN ST_SetSRID(ST_GeomFromGeoJSON(geojson_data->'geometry'), 4326)
    ELSE NULL
END
WHERE geom IS NULL AND geojson_data IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. Optimize Indexes: doh_offices
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_doh_offices_type_id 
    ON doh_offices(type ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_doh_offices_active 
    ON doh_offices(type) WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 7. Domain Constraints (Safe Idempotent Migrations)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_flood_traffic_status'
    ) THEN
        ALTER TABLE doh_flood_routes
        ADD CONSTRAINT chk_doh_flood_traffic_status
        CHECK (traffic_status IN ('CLOSED', 'WARNING', 'PASSABLE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_flood_water_level'
    ) THEN
        ALTER TABLE doh_flood_routes
        ADD CONSTRAINT chk_doh_flood_water_level
        CHECK (water_level_cm >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_proj_status_group'
    ) THEN
        ALTER TABLE doh_mitigation_projects
        ADD CONSTRAINT chk_doh_proj_status_group
        CHECK (status_group IN ('COMPLETED', 'PENDING_BUDGET'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_proj_budget_positive'
    ) THEN
        ALTER TABLE doh_mitigation_projects
        ADD CONSTRAINT chk_doh_proj_budget_positive
        CHECK (budget_mb >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doh_office_type'
    ) THEN
        ALTER TABLE doh_offices
        ADD CONSTRAINT chk_doh_office_type
        CHECK (type IN ('HEADQUARTERS', 'SUBDIVISION', 'SERVICE_POINT'));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Row-Level Security (RLS) & Performance-Optimized Policies
-- -----------------------------------------------------------------------------
ALTER TABLE doh_flood_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_detour_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_timeline_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_mitigation_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_highway_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_map_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE doh_system_settings ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
DO $$
BEGIN
    DROP POLICY IF EXISTS doh_flood_routes_public_select ON doh_flood_routes;
    CREATE POLICY doh_flood_routes_public_select ON doh_flood_routes
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_detour_routes_public_select ON doh_detour_routes;
    CREATE POLICY doh_detour_routes_public_select ON doh_detour_routes
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_timeline_updates_public_select ON doh_timeline_updates;
    CREATE POLICY doh_timeline_updates_public_select ON doh_timeline_updates
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_mitigation_projects_public_select ON doh_mitigation_projects;
    CREATE POLICY doh_mitigation_projects_public_select ON doh_mitigation_projects
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_highway_layers_public_select ON doh_highway_layers;
    CREATE POLICY doh_highway_layers_public_select ON doh_highway_layers
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_offices_public_select ON doh_offices;
    CREATE POLICY doh_offices_public_select ON doh_offices
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_map_styles_public_select ON doh_map_styles;
    CREATE POLICY doh_map_styles_public_select ON doh_map_styles
        FOR SELECT TO anon, authenticated USING (true);

    DROP POLICY IF EXISTS doh_system_settings_public_select ON doh_system_settings;
    CREATE POLICY doh_system_settings_public_select ON doh_system_settings
        FOR SELECT TO anon, authenticated USING (true);
END $$;

-- Authenticated Write Policies (using cached subquery (SELECT auth.role()))
DO $$
BEGIN
    DROP POLICY IF EXISTS doh_flood_routes_admin_write ON doh_flood_routes;
    CREATE POLICY doh_flood_routes_admin_write ON doh_flood_routes
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_detour_routes_admin_write ON doh_detour_routes;
    CREATE POLICY doh_detour_routes_admin_write ON doh_detour_routes
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_timeline_updates_admin_write ON doh_timeline_updates;
    CREATE POLICY doh_timeline_updates_admin_write ON doh_timeline_updates
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_mitigation_projects_admin_write ON doh_mitigation_projects;
    CREATE POLICY doh_mitigation_projects_admin_write ON doh_mitigation_projects
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_highway_layers_admin_write ON doh_highway_layers;
    CREATE POLICY doh_highway_layers_admin_write ON doh_highway_layers
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_offices_admin_write ON doh_offices;
    CREATE POLICY doh_offices_admin_write ON doh_offices
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_map_styles_admin_write ON doh_map_styles;
    CREATE POLICY doh_map_styles_admin_write ON doh_map_styles
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');

    DROP POLICY IF EXISTS doh_system_settings_admin_write ON doh_system_settings;
    CREATE POLICY doh_system_settings_admin_write ON doh_system_settings
        FOR ALL TO authenticated
        USING ((SELECT auth.role()) = 'authenticated')
        WITH CHECK ((SELECT auth.role()) = 'authenticated');
END $$;

-- -----------------------------------------------------------------------------
-- 9. Hardened Functions (STABLE Volatility, Search Path, Native Geometry)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION doh_find_intersecting_highway(
    p_lon DOUBLE PRECISION,
    p_lat DOUBLE PRECISION,
    p_dist_meters DOUBLE PRECISION DEFAULT 200
)
RETURNS TABLE (
    layer_id VARCHAR(50),
    layer_name TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pt geography;
BEGIN
    v_pt := ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography;

    RETURN QUERY
    SELECT 
        l.layer_id,
        l.layer_name,
        ST_Distance(
            v_pt,
            COALESCE(l.geom, ST_GeomFromGeoJSON(l.geojson_data->'geometry'))::geography
        ) AS distance_meters
    FROM doh_highway_layers l
    WHERE (l.geom IS NOT NULL OR l.geojson_data IS NOT NULL)
      AND ST_DWithin(
          v_pt,
          COALESCE(l.geom, ST_GeomFromGeoJSON(l.geojson_data->'geometry'))::geography,
          p_dist_meters
      )
    ORDER BY distance_meters ASC
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION doh_snap_line_rpc(
    p_a_lng DOUBLE PRECISION,
    p_a_lat DOUBLE PRECISION,
    p_b_lng DOUBLE PRECISION,
    p_b_lat DOUBLE PRECISION,
    p_max_m DOUBLE PRECISION DEFAULT 250
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found BOOLEAN := FALSE;
    v_route_code TEXT := '';
    v_geojson JSONB := NULL;
    v_pt_a geometry;
    v_pt_b geometry;
BEGIN
    v_pt_a := ST_SetSRID(ST_Point(p_a_lng, p_a_lat), 4326);
    v_pt_b := ST_SetSRID(ST_Point(p_b_lng, p_b_lat), 4326);

    SELECT 
        TRUE,
        COALESCE(sub.layer_id, 'ทล.'),
        ST_AsGeoJSON(ST_LineSubstring(
            sub.geom,
            LEAST(ST_LineLocatePoint(sub.geom, v_pt_a), ST_LineLocatePoint(sub.geom, v_pt_b)),
            GREATEST(ST_LineLocatePoint(sub.geom, v_pt_a), ST_LineLocatePoint(sub.geom, v_pt_b))
        ))::JSONB
    INTO v_found, v_route_code, v_geojson
    FROM (
        SELECT 
            l.layer_id,
            COALESCE(l.geom, ST_GeomFromGeoJSON(l.geojson_data->'geometry')) AS geom
        FROM doh_highway_layers l
        WHERE l.geom IS NOT NULL OR l.geojson_data IS NOT NULL
    ) sub
    WHERE sub.geom IS NOT NULL
      AND ST_DWithin(sub.geom::geography, v_pt_a::geography, p_max_m)
      AND ST_DWithin(sub.geom::geography, v_pt_b::geography, p_max_m)
    LIMIT 1;

    IF v_found AND v_geojson IS NOT NULL THEN
        RETURN jsonb_build_object(
            'found', TRUE,
            'via', 'db',
            'route_code', v_route_code,
            'geojson', v_geojson
        );
    ELSE
        RETURN jsonb_build_object('found', FALSE);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION doh_update_timeline_rpc(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_timeline_id VARCHAR(50);
    v_flood_id VARCHAR(50);
    v_water_level INTEGER;
    v_status VARCHAR(20);
    v_photo TEXT;
    v_reporter TEXT;
    v_remark TEXT;
    v_lat DOUBLE PRECISION;
    v_lon DOUBLE PRECISION;
BEGIN
    v_timeline_id := COALESCE(payload->>'timelineId', 'TL-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISSMS'));
    v_flood_id := payload->>'floodId';
    v_water_level := COALESCE((payload->>'waterLevelCm')::INTEGER, 0);
    v_status := COALESCE(payload->>'trafficStatus', 'WARNING');
    v_photo := COALESCE(payload->>'photoUrl', '');
    v_reporter := COALESCE(payload->>'reporterName', 'เจ้าหน้าที่หมวดทางหลวง');
    v_remark := COALESCE(payload->>'remark', '');
    v_lat := COALESCE((payload->>'latitude')::DOUBLE PRECISION, 0);
    v_lon := COALESCE((payload->>'longitude')::DOUBLE PRECISION, 0);

    INSERT INTO doh_timeline_updates (
        id, flood_id_ref, reported_at, water_level_cm, traffic_status,
        latitude, longitude, photo_url, reporter_name, remark, created_at
    ) VALUES (
        v_timeline_id, v_flood_id, NOW(), v_water_level, v_status,
        v_lat, v_lon, v_photo, v_reporter, v_remark, NOW()
    );

    UPDATE doh_flood_routes
    SET 
        water_level_cm = v_water_level,
        traffic_status = v_status,
        latest_photo_url = CASE WHEN v_photo <> '' THEN v_photo ELSE latest_photo_url END,
        updated_at = NOW()
    WHERE id = v_flood_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'timelineId', v_timeline_id,
        'floodId', v_flood_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION doh_get_system_data_rpc()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'updatedAt', NOW(),
        'floodRoutes', (
            SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
            FROM doh_flood_routes f
            ORDER BY f.is_active DESC, f.updated_at DESC
        ),
        'detourRoutes', (
            SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
            FROM doh_detour_routes d
            ORDER BY d.updated_at DESC
        ),
        'timelineUpdates', (
            SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
            FROM doh_timeline_updates t
            ORDER BY t.reported_at DESC
        ),
        'mitigationProjects', (
            SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
            FROM doh_mitigation_projects p
            ORDER BY p.project_id ASC
        ),
        'highwayLayers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'layer_id', l.layer_id,
                'layer_name', l.layer_name,
                'color_hex', l.color_hex,
                'line_width', l.line_width,
                'geojson_data', l.geojson_data,
                'is_visible', l.is_visible,
                'updated_at', l.updated_at
            )), '[]'::jsonb)
            FROM doh_highway_layers l
            ORDER BY l.layer_id ASC
        ),
        'offices', (
            SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
            FROM doh_offices o
            ORDER BY o.type ASC, o.id ASC
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

