import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { APP_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { parseFloodDirectionMeta, resolveFloodWaterReading } from "@/lib/flood-event-schema";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import {
  escapeHtml,
  geoJsonFeatures,
  parseRouteCoordinates,
  routeCodeOf,
  routeNameOf,
  toLeafletLatLng,
  type ShieldCandidate,
} from "./longdo-map-popups";

export type MapStyleConfig = typeof DEFAULT_MAP_STYLES;

export interface DivIconSpec {
  html: string;
  className: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

export interface FloodMarkerCandidate {
  flood: FloodRoute;
  lat: number;
  lon: number;
  dirCode: string;
  zIndex: number;
  capsuleClass: string;
  statusLabel: string;
  sideBadge: string;
  levelText: string;
}

export type FloodPinPresentation = Pick<FloodMarkerCandidate, "capsuleClass" | "statusLabel" | "sideBadge" | "levelText"> & {
  flood: Pick<FloodRoute, "route_no">;
  segmentCount?: number;
};

const FLOOD_PIN_Z_INDEX = {
  red: 1000,
  orange: 800,
  amber: 700,
  sky: 600,
  slate: 400,
  emerald: 200,
} as const;

/** รวบรวมรายชื่อสายทางหลวงสำหรับแสดงในกล่องคำอธิบายแผนที่ (Legend) */
export function collectLegendRoutes(
  highwayLayers: SystemDataPayload["highwayLayers"] | undefined,
  type: "MAIN_HIGHWAY" | "SECOND_HIGHWAY"
): { code: string; name: string }[] {
  const routes = new globalThis.Map<string, string>();
  (highwayLayers || []).forEach((layer) => {
    if (!layer.is_visible) return;
    (layer.geojson_data?.features || []).forEach((feature: any) => {
      const props = feature.properties || {};
      const featureType =
        props.highway_type ||
        (layer.layer_id === "SECOND_HIGHWAY" ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY");
      const code =
        props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
      const name =
        props.section_name ||
        props.route_name ||
        props.ROAD_NAME ||
        props.section ||
        props.name ||
        "ไม่ระบุชื่อตอน";
      if (featureType === type && props.is_visible !== false && code) {
        routes.set(`${String(code)}::${String(name)}`, String(name));
      }
    });
  });
  return [...routes.entries()]
    .map(([key, name]) => ({ code: key.split("::")[0], name }))
    .sort(
      (a, b) =>
        a.code.localeCompare(b.code, "th", { numeric: true }) ||
        a.name.localeCompare(b.name, "th")
    );
}

/** รวบรวมจุดกึ่งกลางสายทางหลวงสำหรับปักป้ายหมายเลขทางหลวง (Shields) */
export function collectHighwayShieldCandidates(
  highwayLayers: SystemDataPayload["highwayLayers"] | undefined
): ShieldCandidate[] {
  const items: ShieldCandidate[] = [];
  (highwayLayers || []).forEach((layer) => {
    if (!layer.is_visible) return;
    const layerIsMain = layer.layer_id === "MAIN_HIGHWAY";
    geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
      const props = feature?.properties || {};
      if (props.is_visible === false) return;
      const geometry = feature?.geometry;
      const code = routeCodeOf(props);
      if (!code || !geometry || !["LineString", "MultiLineString"].includes(geometry.type)) return;
      const featureIsMain =
        props.highway_type === "MAIN_HIGHWAY"
          ? true
          : props.highway_type === "SECOND_HIGHWAY"
            ? false
            : layerIsMain;
      const line =
        geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat(1);
      const midpoint = line[Math.floor(line.length / 2)];
      if (!midpoint) return;
      items.push({
        code: String(code),
        name: String(routeNameOf(props)),
        latlng: toLeafletLatLng(midpoint),
        isMain: featureIsMain,
      });
    });
  });
  return items;
}

/** รวบรวมหมายเลขทางหลวงที่มีเหตุน้ำท่วมกำลังใช้งานอยู่ (เพื่อให้แสดงแม้ซูมออกไกล) */
export function collectCriticalHighwayRouteNos(
  floodRoutes: FloodRoute[] | undefined
): Set<string> {
  const set = new Set<string>();
  (floodRoutes || []).forEach((f) => {
    if (f.is_active && f.route_no) {
      set.add(String(f.route_no).replace(/^ทล\.?/i, "").trim());
    }
  });
  return set;
}

/** ตรวจสอบว่าควรแสดงฟีเจอร์สายทางหลวงนี้ตามระดับซูมและตัวกรองหรือไม่ */
export function shouldShowHighwayFeature(
  feature: any,
  isLayerMain: boolean,
  showMainHwy: boolean,
  showSecHwy: boolean,
  showSecondaryAtCurrentZoom: boolean,
  criticalHighwayRouteNos: Set<string>,
  isFilterActive = false,
  highlightHighwayRouteNos: string[] = [],
  searchQuery = ""
): boolean {
  if (feature?.properties?.is_visible === false) return false;
  const type = feature?.properties?.highway_type;
  const featureIsMain =
    type === "MAIN_HIGHWAY" ? true : type === "SECOND_HIGHWAY" ? false : isLayerMain;
  if (!(featureIsMain ? showMainHwy : showSecHwy)) return false;
  const normalize = (value: string) => value.replace(/^ทล\.?\s*/i, "").trim();
  const code = normalize(String(routeCodeOf(feature?.properties)));
  // Keep the legacy zoom arguments compatible; road geometry is visible at every zoom.
  void showSecondaryAtCurrentZoom;
  void criticalHighwayRouteNos;
  if (!isFilterActive && !searchQuery.trim()) return true;
  return highlightHighwayRouteNos.some((value) => normalize(value) === code);
}

/** คำนวณ style และความหนาเส้นสายทางหลวงตามจำนวนช่องจราจรและระดับซูม */
export function resolveHighwayForegroundStyle(
  feature: any,
  isLayerMain: boolean,
  mapStyles: MapStyleConfig,
  fallbackWeight: number,
  isLowZoom: boolean
) {
  const props = feature?.properties || {};
  const featureIsMain =
    props.highway_type === "MAIN_HIGHWAY"
      ? true
      : props.highway_type === "SECOND_HIGHWAY"
        ? false
        : isLayerMain;
  const featureStyle = featureIsMain ? mapStyles.primary : mapStyles.secondary;
  let featureWeight = featureStyle?.weight || fallbackWeight;
  if (props.lanes) {
    const lanesStr = String(props.lanes);
    if (lanesStr.includes("๘") || lanesStr.includes("8")) featureWeight = 8.5;
    else if (lanesStr.includes("๖") || lanesStr.includes("6")) featureWeight = 7.5;
    else if (lanesStr.includes("๔") || lanesStr.includes("4")) featureWeight = 5.5;
    else if (lanesStr.includes("๒") || lanesStr.includes("2")) featureWeight = 3.5;
  }
  if (isLowZoom) featureWeight = Math.max(2, featureWeight * 0.8);
  return { featureStyle, featureWeight };
}

/** หาทิศทางเริ่มต้นของ Popup เส้นทางเลี่ยงจากความสัมพันธ์เหตุการณ์น้ำท่วมหรือ direction_mode */
export function resolveDetourDefaultDirection(
  detour: DetourRoute,
  systemData: SystemDataPayload
): "FORWARD" | "REVERSE" {
  const linkedEvents = getLinkedEventsForDetour(detour, systemData);
  const linkedFlood = linkedEvents[0]?.primaryFlood ?? null;
  const linkedMeta = linkedFlood
    ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood)
    : null;
  const linkedDetourDir = linkedEvents[0]?.links[0]?.detourDirection;
  return linkedDetourDir === "REVERSE" ||
    linkedMeta?.directionCode === "B_TO_A" ||
    detour.direction_mode === "REVERSE_ONLY"
    ? "REVERSE"
    : "FORWARD";
}

/** ดึงพิกัดจุดเริ่มต้น A และจุดสิ้นสุด B สำหรับหมุดภาพทางเข้า (คงลำดับพิกัด [lon, lat] จาก fwdCoords) */
export function resolveDetourPhotoPointCoords(
  detour: DetourRoute,
  fwdCoords: [number, number][]
) {
  const startLat =
    Number.isFinite(detour.lat_start) && detour.lat_start !== 0
      ? detour.lat_start
      : (fwdCoords[0]?.[1] ?? NaN);
  const startLon =
    Number.isFinite(detour.lon_start) && detour.lon_start !== 0
      ? detour.lon_start
      : (fwdCoords[0]?.[0] ?? NaN);
  const endLat =
    Number.isFinite(detour.lat_end) && detour.lat_end !== 0
      ? detour.lat_end
      : (fwdCoords[fwdCoords.length - 1]?.[1] ?? NaN);
  const endLon =
    Number.isFinite(detour.lon_end) && detour.lon_end !== 0
      ? detour.lon_end
      : (fwdCoords[fwdCoords.length - 1]?.[0] ?? NaN);
  return { startLat, startLon, endLat, endLon };
}

/** สร้างสเปกไอคอนสัญลักษณ์เส้นทางเลี่ยงกึ่งกลางแนวเส้น */
export function buildDetourSymbolIconSpec(dColor: string): DivIconSpec {
  return {
    html: `<div class="doh-route-symbol" style="width:30px;height:30px;border-radius:9px;background:${dColor};color:#0f172a;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(15,23,42,.45)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg></div>`,
    className: "doh-detour-symbol",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  };
}

/** สร้างสเปกไอคอนป้ายกล้องจุดเริ่มต้น A / จุดสิ้นสุด B ของทางเลี่ยง */
export function buildDetourPhotoBadgeSpec(
  point: "START" | "END",
  variant: "COMPACT" | "FULL" = "FULL",
  isFocusEndpoint = false
): DivIconSpec {
  const compact = variant === "COMPACT";
  const size = compact ? 22 : 30;
  const label = compact ? "" : `<span>${point === "START" ? "A" : "B"}</span>`;
  if (point === "START") {
    return {
      html: `<div class="doh-detour-photo-badge" style="width:${size}px;height:${size}px;border-radius:999px;background:#064e3b;color:#a7f3d0;border:2px solid #10b981;display:flex;align-items:center;justify-content:center;gap:${compact ? 0 : 2}px;font-weight:900;font-size:${compact ? 11 : 10}px;box-shadow:0 3px 10px rgba(0,0,0,0.6)"><span>📷</span>${label}</div>`,
      className: `doh-detour-photo-point doh-detour-photo-start${isFocusEndpoint ? " hdms-focus-endpoint" : ""}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    };
  }
  return {
    html: `<div class="doh-detour-photo-badge" style="width:${size}px;height:${size}px;border-radius:999px;background:#0c4a6e;color:#bae6fd;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;gap:${compact ? 0 : 2}px;font-weight:900;font-size:${compact ? 11 : 10}px;box-shadow:0 3px 10px rgba(0,0,0,0.6)"><span>📷</span>${label}</div>`,
    className: `doh-detour-photo-point doh-detour-photo-end${isFocusEndpoint ? " hdms-focus-endpoint" : ""}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}

/** คำนวณจุดศูนย์กลาง [centerLat, centerLon] ของกลุ่มเหตุการณ์น้ำท่วมจากพิกัด [lon, lat] */
export function computeFloodEventCenter(
  segments: FloodRoute[]
): { centerLat: number; centerLon: number } {
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;
  segments.forEach((seg) => {
    const coords = parseRouteCoordinates(seg.coordinates_json);
    const mid = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
    const lat = mid ? mid[1] : seg.lat_start || APP_CONFIG.DEFAULT_CENTER.lat;
    const lon = mid ? mid[0] : seg.lon_start || APP_CONFIG.DEFAULT_CENTER.lon;
    sumLat += lat;
    sumLon += lon;
    count++;
  });
  return {
    centerLat: count > 0 ? sumLat / count : APP_CONFIG.DEFAULT_CENTER.lat,
    centerLon: count > 0 ? sumLon / count : APP_CONFIG.DEFAULT_CENTER.lon,
  };
}

/** แปลงรายการจุดน้ำท่วมที่แสดงผลเป็นข้อมูลสำหรับปักหมุด (คงค่า UNKNOWN โดยไม่เดาทิศทาง) */
export function buildFloodMarkerCandidates(visibleFloods: FloodRoute[]): FloodMarkerCandidate[] {
  return visibleFloods.map((flood) => {
    const coords = parseRouteCoordinates(flood.coordinates_json);
    const midCoord = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
    const lat = midCoord ? midCoord[1] : flood.lat_start || APP_CONFIG.DEFAULT_CENTER.lat;
    const lon = midCoord ? midCoord[0] : flood.lon_start || APP_CONFIG.DEFAULT_CENTER.lon;

    const meta = flood.direction_meta;
    const trafficDetail = meta?.trafficStatusDetail;
    const waterKnown = resolveFloodWaterReading(meta, flood.water_level_cm).known;
    const levelText = waterKnown ? `${flood.water_level_cm} ซม.` : "รอวัดระดับน้ำ";

    const presentation = getTrafficPresentation(
      flood.traffic_status,
      flood.water_level_cm ?? 0,
      trafficDetail
    );
    const zIndex = FLOOD_PIN_Z_INDEX[presentation.color];
    const capsuleClass = presentation.capsuleClass;
    const statusLabel = presentation.label;

    // Never guess a missing direction as two-way: unknown stays UNKNOWN.
    const dirCode =
      meta?.directionCode ||
      (flood.road_side === "LEFT"
        ? "A_TO_B"
        : flood.road_side === "RIGHT"
          ? "B_TO_A"
          : flood.road_side === "BOTH"
            ? "BOTH"
            : "UNKNOWN");
    const sideBadge =
      dirCode === "A_TO_B"
        ? " [ขาไป]"
        : dirCode === "B_TO_A"
          ? " [ขากลับ]"
          : flood.road_side === "LEFT"
            ? " [ซ้าย]"
            : flood.road_side === "RIGHT"
              ? " [ขวา]"
              : "";

    return {
      flood,
      lat,
      lon,
      dirCode,
      zIndex,
      capsuleClass,
      statusLabel,
      sideBadge,
      levelText,
    };
  });
}

/** จัดกลุ่มหมุดน้ำท่วมที่อยู่ใกล้กัน (< ~35 ม.) เพื่อลดการทับซ้อนกันบนแผนที่ */
export function clusterFloodMarkerCandidates(
  candidates: FloodMarkerCandidate[]
): FloodMarkerCandidate[][] {
  const clusters: FloodMarkerCandidate[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue;
    const c1 = candidates[i];
    const groupList: FloodMarkerCandidate[] = [c1];
    assigned.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue;
      const c2 = candidates[j];
      const distLat = Math.abs(c1.lat - c2.lat);
      const distLon = Math.abs(c1.lon - c2.lon);
      const isSameEvent = Boolean(
        c1.flood.direction_meta?.eventId &&
          c1.flood.direction_meta.eventId === c2.flood.direction_meta?.eventId
      );
      if (
        (distLat < 0.00035 && distLon < 0.00045) ||
        (isSameEvent && distLat < 0.0008 && distLon < 0.0008)
      ) {
        groupList.push(c2);
        assigned.add(j);
      }
    }
    clusters.push(groupList);
  }
  return clusters;
}

/** คำนวณตำแหน่งปักหมุด Leaflet [lat, lon] หลังเยื้องจุดที่ทับซ้อน (แยกฝั่งขาไป/ขากลับอัตโนมัติ) */
export function computeDeoverlappedMarkerCoord(
  item: FloodMarkerCandidate,
  idx: number,
  count: number
): [number, number] {
  let renderLat = item.lat;
  let renderLon = item.lon;

  if (count === 2) {
    if (item.dirCode === "A_TO_B") {
      renderLat += 0.00018;
      renderLon -= 0.00012;
    } else if (item.dirCode === "B_TO_A") {
      renderLat -= 0.00018;
      renderLon += 0.00012;
    } else {
      renderLat += idx === 0 ? 0.00018 : -0.00018;
    }
  } else if (count > 2) {
    const factor = idx - (count - 1) / 2;
    renderLat += factor * 0.00022;
    renderLon += factor * 0.00012;
  }

  return [renderLat, renderLon];
}

/** สร้างสเปกไอคอนหมุดน้ำท่วม 3 ระดับตามค่าซูม (Far / Mid / Near) */
export function buildZoomAdaptiveFloodPinSpec(
  item: FloodPinPresentation,
  currentZoom: number,
  fColor: string,
  floodWaveIcon: string,
  floodWaveBadge: string
): DivIconSpec {
  // The default map viewport is zoom 11. Keep that overview uncluttered and
  // progressively disclose the highway number and water level only after zooming in.
  if (currentZoom <= 11) {
    return {
      html: `
        <div class="${item.capsuleClass} doh-capsule-zoom-far" style="background:${escapeHtml(fColor)}" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
          ${floodWaveIcon}
        </div>
      `,
      className: "doh-map-capsule-pin",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    };
  }
  if (currentZoom <= 13) {
    return {
      html: `
        <div class="${item.capsuleClass} doh-capsule-zoom-mid" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
          ${floodWaveBadge}
          <span>ทล.${escapeHtml(item.flood.route_no)}</span>
        </div>
      `,
      className: "doh-map-capsule-pin",
      iconSize: [96, 28],
      iconAnchor: [48, 14],
    };
  }
  const isPending = item.statusLabel === "รอตรวจสอบสถานะ";
  const labelWidth = (isPending ? 244 : 168) + (item.segmentCount === undefined ? 0 : 48);
  return {
    html: `
      <div class="${item.capsuleClass} doh-capsule-zoom-near" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
        ${floodWaveBadge}
        <span>ทล.${escapeHtml(item.flood.route_no)}</span>
        ${item.segmentCount === undefined ? "" : `<span>${escapeHtml(item.segmentCount)} ช่วง</span>`}
        <span class="opacity-95 font-mono text-[11px]">· ${escapeHtml(item.levelText)}</span>
        ${isPending ? '<span class="bg-black/25 px-1.5 py-0.5 rounded text-[10px] font-bold">รอตรวจสอบ</span>' : ""}
      </div>
    `,
    className: "doh-map-capsule-pin",
    iconSize: [labelWidth, 28],
    iconAnchor: [labelWidth / 2, 14],
  };
}
