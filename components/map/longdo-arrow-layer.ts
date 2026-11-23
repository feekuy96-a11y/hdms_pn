import { SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
import {
  geoJsonFeatures,
  parseRouteCoordinates,
  toLeafletLatLng,
} from "./longdo-map-popups";

const MAX_ARROWS = 160;

export function placeArrowsOnLine(
  L: any,
  map: any,
  group: any,
  coords: [number, number][],
  direction: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN",
  color: string,
  sizePx: number,
  spacingPx: number,
  bgBadge: string | null,
  viewport: any,
  counter: { count: number }
) {
  if (direction === "UNKNOWN" || coords.length < 2 || counter.count >= MAX_ARROWS) return;
  const latLngs = coords.map(toLeafletLatLng);
  let accumPx = spacingPx * 0.45;

  for (let i = 0; i < latLngs.length - 1 && counter.count < MAX_ARROWS; i++) {
    const p1 = latLngs[i];
    const p2 = latLngs[i + 1];
    if (!viewport.contains(p1) && !viewport.contains(p2)) continue;

    const pt1 = map.latLngToContainerPoint(p1);
    const pt2 = map.latLngToContainerPoint(p2);
    const dx = pt2.x - pt1.x;
    const dy = pt2.y - pt1.y;
    const segLenPx = Math.hypot(dx, dy);
    if (segLenPx < 6) continue;

    while (accumPx + segLenPx >= spacingPx && counter.count < MAX_ARROWS) {
      const remain = spacingPx - accumPx;
      const ratio = Math.max(0, Math.min(1, remain / segLenPx));
      const lat = p1[0] + (p2[0] - p1[0]) * ratio;
      const lng = p1[1] + (p2[1] - p1[1]) * ratio;

      if (viewport.contains([lat, lng])) {
        let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (direction === "REVERSE") angleDeg += 180;

        const svgHtml =
          direction === "TWO_WAY"
            ? `<div style="transform:rotate(${angleDeg.toFixed(1)}deg);width:${sizePx + 6}px;height:${sizePx + 6}px;display:flex;align-items:center;justify-content:center;${bgBadge ? `background:${bgBadge};border-radius:999px;border:1px solid rgba(255,255,255,0.75);box-shadow:0 1px 4px rgba(0,0,0,0.45);` : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));"}"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8l4 4-4 4"/><path d="M7 16l-4-4 4-4"/><path d="M3 12h18"/></svg></div>`
            : `<div style="transform:rotate(${angleDeg.toFixed(1)}deg);width:${sizePx + 4}px;height:${sizePx + 4}px;display:flex;align-items:center;justify-content:center;${bgBadge ? `background:${bgBadge};border-radius:999px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 1px 4px rgba(0,0,0,0.45);` : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));"}"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></div>`;

        const icon = L.divIcon({
          html: svgHtml,
          className: "doh-dir-arrow-icon",
          iconSize: [sizePx + 6, sizePx + 6],
          iconAnchor: [(sizePx + 6) / 2, (sizePx + 6) / 2],
        });
        L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(group);
        counter.count++;
      }
      accumPx -= spacingPx;
    }
    accumPx += segLenPx;
  }
}

export interface RenderDirectionalArrowsParams {
  L: any;
  map: any;
  group: any;
  mapStyles: NonNullable<SystemDataPayload["mapStyles"]>;
  highwayLayers: SystemDataPayload["highwayLayers"];
  detourRoutes: SystemDataPayload["detourRoutes"];
  showMainHwy: boolean;
  showSecHwy: boolean;
  showDetourLayer: boolean;
  showSecondaryAtCurrentZoom: boolean;
  draftCoordinates: [number, number][];
  draftReverseCoordinates: [number, number][];
  draftDirectionMeta: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  draftMode: "FLOOD" | "DETOUR";
  vertexEditable: boolean;
}

/**
 * Pure renderer for viewport-culled, zoom-gated directional arrows across draft previews,
 * active detours, and highway networks. Preserves [lon, lat] input conversion via toLeafletLatLng.
 */
export function renderDirectionalArrows({
  L,
  map,
  group,
  mapStyles,
  highwayLayers,
  detourRoutes,
  showMainHwy,
  showSecHwy,
  showDetourLayer,
  showSecondaryAtCurrentZoom,
  draftCoordinates,
  draftReverseCoordinates,
  draftDirectionMeta,
  draftMode,
  vertexEditable,
}: RenderDirectionalArrowsParams) {
  group.clearLayers();
  const z = map.getZoom();
  const viewport = map.getBounds().pad(0.15);
  const counter = { count: 0 };

  // 1. Draft preview arrows (always shown at zoom >= 11 so admin can inspect before saving)
  const draftStyle = draftMode === "DETOUR" ? mapStyles.detour : mapStyles.flood;
  const draftBadgeBg =
    draftStyle?.color ||
    (draftMode === "DETOUR" ? LAYER_CONFIG.DETOUR_YELLOW_LINE.color : LAYER_CONFIG.FLOOD_RED_LINE.color);
  const draftArrowColor = resolveVisibleArrowColor(
    draftBadgeBg,
    draftStyle?.arrowColor || (draftMode === "DETOUR" ? "#0f172a" : "#ffffff")
  );
  if (z >= 11 && draftCoordinates.length >= 2) {
    const effectiveDir = draftReverseCoordinates.length >= 2 ? "FORWARD" : draftDirectionMeta;
    placeArrowsOnLine(
      L,
      map,
      group,
      draftCoordinates,
      effectiveDir,
      draftArrowColor,
      13,
      110,
      draftBadgeBg,
      viewport,
      counter
    );
  }
  if (z >= 11 && draftReverseCoordinates.length >= 2) {
    placeArrowsOnLine(
      L,
      map,
      group,
      draftReverseCoordinates,
      "FORWARD",
      draftArrowColor,
      13,
      110,
      draftBadgeBg,
      viewport,
      counter
    );
  }

  // While editing a line, keep the map focused on the draft. Rebuilding
  // decorative markers for every active route competes with vertex dragging.
  if (vertexEditable) return;

  // 2. Active Detour Route Arrows
  const detourStyle = mapStyles.detour;
  const showDetourArrows = detourStyle?.showArrows ?? true;
  const detourMinZoom = detourStyle?.arrowMinZoom ?? 11;
  if (showDetourLayer && showDetourArrows && z >= detourMinZoom) {
    const dBadgeBg = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
    const dArrowColor = resolveVisibleArrowColor(dBadgeBg, detourStyle?.arrowColor || "#0f172a");
    const dArrowSize = detourStyle?.arrowSize || 12;
    const dArrowSpacing = detourStyle?.arrowSpacingPx || 120;

    (detourRoutes || []).forEach((detour) => {
      if (!detour.is_active) return;
      if (detour.detour_meta?.show_arrows === false) return;
      const dirMode = detour.direction_mode || "TWO_WAY";
      const fwd = parseRouteCoordinates(detour.coordinates_json);
      const rev = parseRouteCoordinates(detour.reverse_coordinates_json);

      if (dirMode === "FORWARD_ONLY") {
        placeArrowsOnLine(L, map, group, fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
      } else if (dirMode === "REVERSE_ONLY") {
        const target = rev.length >= 2 ? rev : fwd;
        placeArrowsOnLine(
          L,
          map,
          group,
          target,
          rev.length >= 2 ? "FORWARD" : "REVERSE",
          dArrowColor,
          dArrowSize,
          dArrowSpacing,
          dBadgeBg,
          viewport,
          counter
        );
      } else if (rev.length >= 2) {
        placeArrowsOnLine(L, map, group, fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
        placeArrowsOnLine(L, map, group, rev, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
      } else {
        placeArrowsOnLine(L, map, group, fwd, "TWO_WAY", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
      }
    });
  }

  // 3. Highway Network Arrows (Only draw on features with explicit directional metadata or when zoomed in >= 12)
  const priStyle = mapStyles.primary;
  const secStyle = mapStyles.secondary;
  if (z >= 12) {
    (highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible || !layer.geojson_data) return;
      const isMain = layer.layer_id === "MAIN_HIGHWAY";
      geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
        const props = feature?.properties || {};
        if (props.is_visible === false) return;
        const featureIsMain =
          props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;
        if (featureIsMain ? !showMainHwy : !showSecHwy) return;
        if (!featureIsMain && !showSecondaryAtCurrentZoom) return;

        const st = featureIsMain ? priStyle : secStyle;
        const allowLayerArrows = (st?.showArrows ?? true) && z >= (st?.arrowMinZoom ?? (featureIsMain ? 12 : 13));
        if (!allowLayerArrows && !props.arrow_direction) return;

        // Only draw highway arrows when direction metadata is known (never guess from raw vertex order alone)
        const dirMeta: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN" =
          props.arrow_direction === "FORWARD" || props.traffic_direction === "ONE_WAY_FORWARD"
            ? "FORWARD"
            : props.arrow_direction === "REVERSE" || props.traffic_direction === "ONE_WAY_REVERSE"
              ? "REVERSE"
              : props.arrow_direction === "TWO_WAY" ||
                  props.carriageway_type === "SINGLE_CENTERLINE" ||
                  props.lanes?.includes("2") ||
                  props.lanes?.includes("๒")
                ? "TWO_WAY"
                : props.arrow_direction === "UNKNOWN"
                  ? "UNKNOWN"
                  : "TWO_WAY";

        if (props.show_arrows === false || dirMeta === "UNKNOWN") return;
        const geom = feature?.geometry;
        const lines: [number, number][][] =
          geom?.type === "LineString"
            ? [geom.coordinates]
            : geom?.type === "MultiLineString"
              ? geom.coordinates
              : [];
        const arrowColor = props.arrow_color || st?.arrowColor || "#ffffff";
        const arrowSize = Number(props.arrow_size || st?.arrowSize || (featureIsMain ? 11 : 10));
        const arrowSpacing = Number(props.arrow_spacing_px || st?.arrowSpacingPx || (featureIsMain ? 160 : 180));

        lines.forEach((lineCoords) => {
          placeArrowsOnLine(L, map, group, lineCoords, dirMeta, arrowColor, arrowSize, arrowSpacing, null, viewport, counter);
        });
      });
    });
  }
}
