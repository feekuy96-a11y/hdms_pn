CREATE POLICY doh_flood_deleted_visibility ON public.doh_flood_routes AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (deleted_at IS NULL OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','doh_admin'));
CREATE POLICY doh_detour_deleted_visibility ON public.doh_detour_routes AS RESTRICTIVE FOR SELECT TO anon,authenticated USING ((deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.doh_flood_routes f WHERE f.id=flood_id_ref AND f.deleted_at IS NULL)) OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','doh_admin'));
CREATE POLICY doh_timeline_deleted_visibility ON public.doh_timeline_updates AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM public.doh_flood_routes f WHERE f.id=flood_id_ref AND f.deleted_at IS NULL) OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','doh_admin'));
CREATE OR REPLACE FUNCTION public.doh_snap_line_rpc(p_a_lng double precision,p_a_lat double precision,p_b_lng double precision,p_b_lat double precision,p_max_m double precision DEFAULT 250)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a geometry:=ST_SetSRID(ST_Point(p_a_lng,p_a_lat),4326); b geometry:=ST_SetSRID(ST_Point(p_b_lng,p_b_lat),4326); line geometry; code text; pa float8; pb float8;
BEGIN
IF abs(p_a_lng)>180 OR abs(p_b_lng)>180 OR abs(p_a_lat)>90 OR abs(p_b_lat)>90 OR p_max_m NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid snapping parameters'; END IF;
SELECT d.geom,l.layer_id INTO line,code FROM doh_highway_layers l CROSS JOIN LATERAL ST_Dump(ST_LineMerge(l.geom)) d WHERE l.is_visible AND ST_GeometryType(d.geom)='ST_LineString' AND ST_DWithin(d.geom::geography,a::geography,p_max_m) AND ST_DWithin(d.geom::geography,b::geography,p_max_m) ORDER BY ST_Distance(d.geom::geography,a::geography)+ST_Distance(d.geom::geography,b::geography) LIMIT 1;
IF line IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
pa:=ST_LineLocatePoint(line,a); pb:=ST_LineLocatePoint(line,b);
IF pa=pb THEN RETURN jsonb_build_object('found',false); END IF;
line:=ST_LineSubstring(line,least(pa,pb),greatest(pa,pb));
IF pa>pb THEN line:=ST_Reverse(line); END IF;
RETURN jsonb_build_object('found',true,'via','db','route_code',code,'geojson',ST_AsGeoJSON(line)::jsonb);
END $$;
