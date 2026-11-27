-- Private, event-scoped records. Saving does not announce a closure.
-- Rollback after use: revert/disable the web writer and REVOKE DML access;
-- preserve the table and records for recovery. Never drop it as a web rollback.
BEGIN;

CREATE TABLE IF NOT EXISTS public.doh_road_closure_records (
  event_id text PRIMARY KEY REFERENCES public.doh_flood_events(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doh_road_closure_payload_shape CHECK ((
    jsonb_typeof(payload) = 'object'
    AND octet_length(payload::text) <= 1100000
    AND payload->'version' = '1'::jsonb
    AND payload->>'eventId' = event_id
    AND payload->>'roadMode' IN ('HIGHWAY_KM', 'MAP_AB')
    AND jsonb_typeof(payload->'route') = 'string'
    AND char_length(payload->>'route') BETWEEN 1 AND 80
    AND jsonb_typeof(payload->'section') = 'string'
    AND char_length(payload->>'section') <= 260
    AND jsonb_typeof(payload->'reason') = 'string'
    AND char_length(btrim(payload->>'reason')) BETWEEN 1 AND 500
    AND jsonb_typeof(payload->'note') = 'string'
    AND char_length(payload->>'note') <= 500
    AND jsonb_typeof(payload->'a') = 'object'
    AND jsonb_typeof(payload->'b') = 'object'
    AND payload#>'{a,position}' <> payload#>'{b,position}'
    AND jsonb_typeof(payload->'line') = 'array'
    AND jsonb_array_length(payload->'line') BETWEEN 2 AND 2000
    AND jsonb_typeof(payload->'detourIds') = 'array'
    AND jsonb_array_length(payload->'detourIds') <= 60
  ) IS TRUE)
);

ALTER TABLE public.doh_road_closure_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doh_road_closure_records FROM PUBLIC, anon, authenticated;
GRANT SELECT (event_id, payload, revision) ON public.doh_road_closure_records TO authenticated;
GRANT INSERT (event_id, payload), UPDATE (payload) ON public.doh_road_closure_records TO authenticated;

DROP POLICY IF EXISTS closure_staff_read ON public.doh_road_closure_records;
CREATE POLICY closure_staff_read ON public.doh_road_closure_records FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL
    AND ((SELECT auth.jwt()) ->> 'is_anonymous') IS DISTINCT FROM 'true'
    AND ((SELECT auth.jwt()) #>> '{app_metadata,role}') IN ('road_closure_editor', 'admin', 'doh_admin'));
DROP POLICY IF EXISTS closure_staff_insert ON public.doh_road_closure_records;
CREATE POLICY closure_staff_insert ON public.doh_road_closure_records FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL
    AND ((SELECT auth.jwt()) ->> 'is_anonymous') IS DISTINCT FROM 'true'
    AND ((SELECT auth.jwt()) #>> '{app_metadata,role}') IN ('road_closure_editor', 'admin', 'doh_admin'));
DROP POLICY IF EXISTS closure_staff_update ON public.doh_road_closure_records;
CREATE POLICY closure_staff_update ON public.doh_road_closure_records FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL
    AND ((SELECT auth.jwt()) ->> 'is_anonymous') IS DISTINCT FROM 'true'
    AND ((SELECT auth.jwt()) #>> '{app_metadata,role}') IN ('road_closure_editor', 'admin', 'doh_admin'))
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL
    AND ((SELECT auth.jwt()) ->> 'is_anonymous') IS DISTINCT FROM 'true'
    AND ((SELECT auth.jwt()) #>> '{app_metadata,role}') IN ('road_closure_editor', 'admin', 'doh_admin'));

CREATE OR REPLACE FUNCTION public.doh_refresh_road_closure_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  point jsonb;
  endpoint jsonb;
  side text;
  first_or_last jsonb;
  hav double precision;
BEGIN
  IF jsonb_typeof(NEW.payload->'line') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid closure line' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(NEW.payload->'line') NOT BETWEEN 2 AND 2000 THEN
    RAISE EXCEPTION 'Invalid closure line size' USING ERRCODE = '23514';
  END IF;

  FOR endpoint IN SELECT value FROM jsonb_array_elements(jsonb_build_array(NEW.payload->'a', NEW.payload->'b')) LOOP
    IF NOT ((
      jsonb_typeof(endpoint->'km') = 'string' AND char_length(endpoint->>'km') <= 12
      AND jsonb_typeof(endpoint->'area') = 'string' AND char_length(btrim(endpoint->>'area')) BETWEEN 1 AND 180
      AND jsonb_typeof(endpoint->'landmark') = 'string' AND char_length(btrim(endpoint->>'landmark')) BETWEEN 1 AND 180
      AND jsonb_typeof(endpoint->'photo') = 'string' AND char_length(endpoint->>'photo') < 320000
      AND (endpoint->>'photo' = '' OR endpoint->>'photo' ~* '^data:image/(jpeg|webp);base64,[a-z0-9+/=]+$')
    ) IS TRUE) THEN
      RAISE EXCEPTION 'Invalid closure endpoint details' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR point IN
    SELECT value FROM jsonb_array_elements(NEW.payload->'line')
    UNION ALL SELECT NEW.payload#>'{a,position}'
    UNION ALL SELECT NEW.payload#>'{b,position}'
  LOOP
    IF jsonb_typeof(point) IS DISTINCT FROM 'array'
      OR jsonb_typeof(point->0) IS DISTINCT FROM 'number'
      OR jsonb_typeof(point->1) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid closure coordinate type' USING ERRCODE = '23514';
    END IF;
    IF jsonb_array_length(point) <> 2
      OR abs((point->>0)::numeric) > 180
      OR abs((point->>1)::numeric) > 90
      OR ((point->>0)::numeric = 0 AND (point->>1)::numeric = 0) THEN
      RAISE EXCEPTION 'Invalid closure coordinate' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- Align with the map's 40 m tolerance: routing may snap A/B slightly.
  -- Editing interior vertices cannot move either endpoint.
  FOREACH side IN ARRAY ARRAY['a','b'] LOOP
    endpoint := NEW.payload->side->'position';
    first_or_last := CASE side WHEN 'a' THEN NEW.payload->'line'->0 ELSE NEW.payload->'line'->(-1) END;
    hav := sin(radians(((endpoint->>1)::double precision - (first_or_last->>1)::double precision) / 2)) ^ 2
      + cos(radians((endpoint->>1)::double precision)) * cos(radians((first_or_last->>1)::double precision))
        * sin(radians(((endpoint->>0)::double precision - (first_or_last->>0)::double precision) / 2)) ^ 2;
    IF 2 * 6371000 * asin(sqrt(least(1.0, greatest(0.0, hav)))) > 40 THEN
      RAISE EXCEPTION 'Closure line does not match A/B' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  NEW.revision := pg_catalog.gen_random_uuid();
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.doh_refresh_road_closure_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_doh_road_closure_revision ON public.doh_road_closure_records;
CREATE TRIGGER trg_doh_road_closure_revision
  BEFORE INSERT OR UPDATE ON public.doh_road_closure_records
  FOR EACH ROW EXECUTE FUNCTION public.doh_refresh_road_closure_revision();

COMMIT;
