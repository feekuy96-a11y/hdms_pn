CREATE OR REPLACE FUNCTION public.doh_save_route_rpc(p_type text,p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
IF coalesce(auth.jwt()->'app_metadata'->>'role','') NOT IN ('admin','doh_admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
IF p_type='FLOOD' THEN
INSERT INTO doh_flood_routes(id,route_no,section_name,km_start,km_end,lat_start,lon_start,lat_end,lon_end,coordinates_json,water_level_cm,traffic_status,latest_photo_url,is_active,district,subdistrict,detour_advice)
VALUES(p_row->>'id',p_row->>'route_no',p_row->>'section_name',p_row->>'km_start',p_row->>'km_end',(p_row->>'lat_start')::float8,(p_row->>'lon_start')::float8,(p_row->>'lat_end')::float8,(p_row->>'lon_end')::float8,p_row->'coordinates_json',(p_row->>'water_level_cm')::int,p_row->>'traffic_status',p_row->>'latest_photo_url',(p_row->>'is_active')::boolean,p_row->>'district',p_row->>'subdistrict',p_row->>'detour_advice')
ON CONFLICT(id) DO UPDATE SET route_no=excluded.route_no,section_name=excluded.section_name,km_start=excluded.km_start,km_end=excluded.km_end,lat_start=excluded.lat_start,lon_start=excluded.lon_start,lat_end=excluded.lat_end,lon_end=excluded.lon_end,coordinates_json=excluded.coordinates_json,water_level_cm=excluded.water_level_cm,traffic_status=excluded.traffic_status,latest_photo_url=excluded.latest_photo_url,is_active=excluded.is_active,district=excluded.district,subdistrict=excluded.subdistrict,detour_advice=excluded.detour_advice,updated_at=now();
ELSIF p_type='DETOUR' THEN
PERFORM 1 FROM doh_flood_routes WHERE id=p_row->>'flood_id_ref' AND deleted_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Linked incident not found'; END IF;
INSERT INTO doh_detour_routes(id,flood_id_ref,route_name,lat_start,lon_start,lat_end,lon_end,coordinates_json,description,is_active)
VALUES(p_row->>'id',p_row->>'flood_id_ref',p_row->>'route_name',(p_row->>'lat_start')::float8,(p_row->>'lon_start')::float8,(p_row->>'lat_end')::float8,(p_row->>'lon_end')::float8,p_row->'coordinates_json',p_row->>'description',(p_row->>'is_active')::boolean)
ON CONFLICT(id) DO UPDATE SET flood_id_ref=excluded.flood_id_ref,route_name=excluded.route_name,lat_start=excluded.lat_start,lon_start=excluded.lon_start,lat_end=excluded.lat_end,lon_end=excluded.lon_end,coordinates_json=excluded.coordinates_json,description=excluded.description,is_active=excluded.is_active,updated_at=now();
UPDATE doh_flood_routes SET detour_advice=coalesce(p_row->>'description',''),updated_at=now() WHERE id=p_row->>'flood_id_ref';
ELSE RAISE EXCEPTION 'Invalid route type'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.doh_save_route_rpc(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.doh_save_route_rpc(text,jsonb) TO authenticated;
DO $body$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.doh_get_system_data_rpc()'::regprocedure) INTO definition;
definition:=replace(definition,'''is_visible'', l.is_visible,','''is_visible'', l.is_visible, ''metadata'', l.metadata,');
EXECUTE definition; END $body$;
