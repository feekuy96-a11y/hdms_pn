-- Preserve legacy WARNING records while adding the four public traffic states.
ALTER TABLE public.doh_flood_routes
  DROP CONSTRAINT IF EXISTS chk_doh_flood_traffic_status;

ALTER TABLE public.doh_flood_routes
  DROP CONSTRAINT IF EXISTS doh_flood_routes_traffic_status_check;

ALTER TABLE public.doh_flood_routes
  ADD CONSTRAINT chk_doh_flood_traffic_status
  CHECK (traffic_status IN ('PASSABLE', 'LIGHT_VEHICLES_ONLY', 'ONE_LANE', 'CLOSED', 'WARNING'));

ALTER TABLE public.doh_timeline_updates
  DROP CONSTRAINT IF EXISTS doh_timeline_updates_traffic_status_check;

ALTER TABLE public.doh_timeline_updates
  DROP CONSTRAINT IF EXISTS chk_doh_timeline_traffic_status;

ALTER TABLE public.doh_timeline_updates
  ADD CONSTRAINT chk_doh_timeline_traffic_status
  CHECK (traffic_status IN ('PASSABLE', 'LIGHT_VEHICLES_ONLY', 'ONE_LANE', 'CLOSED', 'WARNING'));
