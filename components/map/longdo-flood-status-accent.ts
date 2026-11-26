import type { LayerGroup, Renderer } from "leaflet";
import type { FloodRoute } from "@/db/default-data";
import { getTrafficPresentation } from "@/lib/traffic-presentation";

/** Keep the saved line color visible; thin, non-interactive dashes communicate severity. */
export function drawFloodStatusAccent(
  L: typeof import("leaflet"),
  group: LayerGroup,
  latLngs: [number, number][],
  renderer: Renderer,
  flood: FloodRoute,
  savedWeight: number,
  opacity: number,
) {
  const status = getTrafficPresentation(flood.traffic_status, flood.water_level_cm, flood.direction_meta?.trafficStatusDetail);
  return L.polyline(latLngs, {
    renderer,
    color: status.hex,
    weight: Math.min(2, savedWeight * 0.4),
    opacity,
    dashArray: "4 7",
    interactive: false,
  }).addTo(group);
}
