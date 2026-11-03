ALTER TABLE public.doh_highway_layers ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.doh_import_routes_rpc(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE f jsonb; p jsonb; g jsonb;
BEGIN
IF coalesce(auth.role(),'') <> 'service_role' AND coalesce(auth.jwt()->'app_metadata'->>'role','') NOT IN ('admin','doh_admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
IF coalesce(payload->>'layerId','') = '' THEN RAISE EXCEPTION 'Layer ID required'; END IF;
g := payload->'geojsonData';
IF g IS NOT NULL THEN
IF g->>'type' <> 'FeatureCollection' OR jsonb_typeof(g->'features') <> 'array' THEN RAISE EXCEPTION 'FeatureCollection required'; END IF;
IF jsonb_array_length(g->'features') > 10000 THEN RAISE EXCEPTION 'Too many routes'; END IF;
FOR f IN SELECT value FROM jsonb_array_elements(g->'features') LOOP
IF f->'geometry'->>'type' <> 'LineString' OR jsonb_array_length(f->'geometry'->'coordinates') < 2 THEN RAISE EXCEPTION 'LineString required'; END IF;
FOR p IN SELECT value FROM jsonb_array_elements(f->'geometry'->'coordinates') LOOP
IF jsonb_typeof(p->0) <> 'number' OR jsonb_typeof(p->1) <> 'number' OR abs((p->>0)::numeric)>180 OR abs((p->>1)::numeric)>90 THEN RAISE EXCEPTION 'Invalid WGS84 coordinate'; END IF;
END LOOP;
END LOOP;
END IF;
INSERT INTO public.doh_highway_layers(layer_id,layer_name,color_hex,line_width,geojson_data,metadata)
VALUES(payload->>'layerId',coalesce(payload->>'layerName',payload->>'layerId'),coalesce(payload->>'colorHex','#1B5E20'),coalesce((payload->>'lineWidth')::numeric,4),g,coalesce(payload->'metadata','{}'))
ON CONFLICT(layer_id) DO UPDATE SET layer_name=coalesce(payload->>'layerName',doh_highway_layers.layer_name),color_hex=coalesce(payload->>'colorHex',doh_highway_layers.color_hex),line_width=coalesce((payload->>'lineWidth')::numeric,doh_highway_layers.line_width),geojson_data=coalesce(g,doh_highway_layers.geojson_data),metadata=doh_highway_layers.metadata||coalesce(payload->'metadata','{}'),updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.doh_import_routes_rpc(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doh_import_routes_rpc(jsonb) TO authenticated,service_role;
