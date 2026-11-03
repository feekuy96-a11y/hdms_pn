CREATE OR REPLACE FUNCTION public.doh_trg_sync_highway_layer_geom()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE geoms geometry;
BEGIN
IF NEW.geojson_data IS NULL THEN NEW.geom:=NULL; RETURN NEW; END IF;
IF NEW.geojson_data->>'type'='FeatureCollection' THEN
SELECT ST_Collect(ST_SetSRID(ST_GeomFromGeoJSON(feature->'geometry'),4326)) INTO geoms FROM jsonb_array_elements(NEW.geojson_data->'features') feature WHERE feature->'geometry' IS NOT NULL AND feature->'geometry'<>'null'::jsonb;
ELSIF NEW.geojson_data->>'type'='Feature' THEN geoms:=ST_SetSRID(ST_GeomFromGeoJSON(NEW.geojson_data->'geometry'),4326);
ELSE geoms:=ST_SetSRID(ST_GeomFromGeoJSON(NEW.geojson_data),4326);
END IF;
NEW.geom:=ST_Multi(ST_CollectionExtract(geoms,2));
RETURN NEW;
END $$;
UPDATE public.doh_highway_layers SET geojson_data=geojson_data;
