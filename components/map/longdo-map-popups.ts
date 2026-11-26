import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  SystemDataPayload,
  FloodRoute,
  DetourRoute,
  DohOfficeLocation,
  DetourPointPhoto,
} from "@/db/default-data";
import { APP_CONFIG } from "@/lib/constants";
import { splitDetourAdviceByDirection } from "@/lib/gis-utils";
import {
  calculatePolylineRoadDistanceKm,
  detourDirectionDetailedBadge,
  detourDistanceMeters,
  detourDurationSeconds,
  getDetourTimelinePresentation,
  isDetourDirectionAllowed,
  isRecordedDetourDirection,
  type DetourDirection,
  type DetourTimelinePresentation,
  type DetourTimelineStep,
} from "@/lib/detour-presentation";
import {
  AFFECTED_ROAD_PART_LABELS,
  parseFloodDirectionMeta,
  resolveFloodWaterReading,
  normalizeMediaUrl,
} from "@/lib/flood-event-schema";
import { getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { getTrafficPresentation } from "@/lib/traffic-presentation";

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));

export const formatKmPost = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("+")) return raw;
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return raw;
  const meters = Math.round(Number.isInteger(numeric) && numeric >= 1000 ? numeric : numeric * 1000);
  const km = Math.floor(meters / 1000);
  const post = Math.round(meters % 1000).toString().padStart(3, "0");
  return `${km}+${post}`;
};

export function isFloodLineVisibleOnCurrentMap(flood: FloodRoute): boolean {
  if (!flood.is_active) return false;
  const reading = resolveFloodWaterReading(flood.direction_meta, flood.water_level_cm);
  // รายการที่ 3: หากยืนยันระดับน้ำล่าสุดเป็น 0 ซม. ให้ซ่อนเส้นน้ำท่วมออกจากแผนที่สถานการณ์ปัจจุบัน (แต่ถ้าไม่ทราบระดับน้ำ ไม่ตีความเป็น 0)
  if (reading.confirmedZero) return false;
  return true;
}

/**
 * ปรับพิกัดให้เป็น [Latitude, Longitude] สำหรับ Leaflet เสมอ
 * ป้องกันพิกัดสลับที่ทำให้ละติจูดพุ่งขึ้นไป 101 องศาลงทะเล
 */
export function toLeafletLatLng(coord: [number, number]): [number, number] {
  if (!coord || coord.length < 2) return [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon];
  const [val1, val2] = coord;
  // ในประเทศไทย: Lat อยู่ระหว่าง 5 - 21 N, Lon อยู่ระหว่าง 97 - 106 E
  if (val1 > 50 && val2 < 30) {
    return [val2, val1];
  }
  return [val1, val2];
}

// Stable empty defaults. Using `= []` in destructured props creates a NEW array on every
// render, which made every overlay effect re-run on every render of the map component.
export const EMPTY_COORDS: [number, number][] = [];
export const EMPTY_LINES: [number, number][][] = [];
export const EMPTY_PICK_MARKERS: { lat: number; lon: number; label: string; mode: string }[] = [];

export const MAX_VISIBLE_SHIELDS = 200;
export const MAX_VERTEX_HANDLES = 400;

export interface ShieldCandidate {
  code: string;
  name: string;
  latlng: [number, number];
  isMain: boolean;
}

export interface FloodLineEntry {
  line: any;
  baseWeight: number;
  casing?: any;
  baseBorderWidth?: number;
}

export interface AnimatedLineEntry {
  line: any;
  motionDirection?: "forward" | "reverse" | "both";
  baseWeight: number;
  baseOpacity: number;
}

/**
 * Canvas paths cannot render a separate stroke on one polyline.  Draw a
 * non-interactive casing first, then the interactive foreground path.  This
 * keeps hit-testing and popups on one layer while only adding work when the
 * administrator has explicitly enabled a casing.
 */
export function addLineCasing(
  L: any,
  group: any,
  latLngs: [number, number][],
  style: { borderActive?: boolean; borderColor?: string; borderWidth?: number; opacity?: number },
  foregroundWeight: number,
  renderer: any,
) {
  if (!style.borderActive) return null;
  const borderWidth = Number(style.borderWidth);
  if (!Number.isFinite(borderWidth) || borderWidth <= 0) return null;
  return L.polyline(latLngs as any, {
    color: style.borderColor || "#ffffff",
    weight: foregroundWeight + borderWidth * 2,
    opacity: style.opacity ?? 1,
    interactive: false,
    renderer,
  }).addTo(group);
}

export const routeCodeOf = (props: any) => props?.route_no || props?.route_code || props?.ROAD_NO || props?.route || props?.code || "";
export const routeNameOf = (props: any) => props?.section_name || props?.route_name || props?.ROAD_NAME || props?.section || props?.name || "ทางหลวง";

export function geoJsonFeatures(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data.features)) return data.features;
  if (data.type === "Feature") return [data];
  return [];
}

export function parseRouteCoordinates(value: unknown): [number, number][] {
  if (Array.isArray(value)) return value as [number, number][];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function lineAnimationClasses(style: { animation?: string; animationSpeed?: string | number } | undefined, allow: boolean): string {
  const animation = allow && style?.animation === "chaser" ? "doh-line-chaser"
    : allow && style?.animation === "pulse" ? "doh-line-pulse"
      : allow && style?.animation === "blink" ? "doh-line-blink"
        : allow && style?.animation === "arrows" ? "doh-line-arrows"
          : "";
  const speed = style?.animationSpeed === "slow" ? "doh-anim-slow" : style?.animationSpeed === "fast" ? "doh-anim-fast" : "";
  return `${animation} ${speed}`.trim();
}

export function dashArrayFor(style: { pattern?: string; dashArray?: string } | undefined): string | undefined {
  return style?.pattern === "dash" ? (style.dashArray || "8, 6")
    : style?.pattern === "dot" ? "2, 6"
      : style?.pattern === "long-dash-dot" ? "14, 6, 3, 6"
        : undefined;
}

// Bring path layers of the given groups to the top of the shared canvas, in the order given.
// Highway lines are never touched, so they stay at the bottom without re-sorting thousands of paths.
export function raisePathLayers(...groups: any[]) {
  groups.forEach((group) => {
    group?.eachLayer?.((layer: any) => {
      if (typeof layer.bringToFront === "function") layer.bringToFront();
    });
  });
}

// ---- Popup HTML builders (called lazily, only when a popup is actually opened) ----

export function getResponsivePopupOptions(
  L: any,
  desktopMaxWidth: number,
  desktopMinWidth: number,
  className: string
) {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const isMobile = viewportWidth < 640;
  const maxWidth = isMobile
    ? Math.max(256, Math.min(desktopMaxWidth, viewportWidth - 32))
    : desktopMaxWidth;
  const minWidth = isMobile
    ? Math.min(desktopMinWidth, 260)
    : desktopMinWidth;

  return {
    maxWidth,
    minWidth,
    keepInView: isMobile,
    className: `hdms-popup-map ${className}`.trim(),
    // Leaflet positions overlays in map pixels. Reserve the popup frame and its
    // mobile close target so a near-edge detour marker can pan fully into view.
    autoPanPaddingTopLeft: L?.point ? L.point(isMobile ? 24 : 12, isMobile ? 16 : 56) : [isMobile ? 24 : 12, isMobile ? 16 : 56],
    autoPanPaddingBottomRight: L?.point ? L.point(isMobile ? 24 : 12, isMobile ? 112 : 24) : [isMobile ? 24 : 12, isMobile ? 112 : 24],
  };
}

export function buildHighwayPopupHtml(props: any, featureIsMain: boolean, color: string): string {
  const code = routeCodeOf(props);
  const name = routeNameOf(props);
  const lengthKm = props.length_km || "";
  return `
    <div class="doh-highway-popup w-[min(18.5rem,calc(100vw-2.25rem))] max-w-full text-xs p-[0.833em] sm:p-[1em] font-body bg-slate-950 text-white rounded-xl" style="border-top: 3px solid ${color}">
      <div class="hdms-map-popup-heading flex items-center justify-between pb-1.5 border-b border-slate-800 gap-[0.667em]">
        <span class="text-white text-sm sm:text-base font-bold font-heading tracking-wide break-words">
          ${code ? `ทล.${escapeHtml(code)} ` : ""}${escapeHtml(name)}
        </span>
      </div>
      <div class="mt-2">
        ${props.km_start !== undefined && props.km_start !== null && String(props.km_start).trim() !== "" ? `<p class="text-amber-300 text-[0.75rem] mt-0.5 font-mono">ระหว่าง กม.${escapeHtml(formatKmPost(props.km_start))}${props.km_end !== undefined && props.km_end !== null && String(props.km_end).trim() !== "" ? ` ถึง กม.${escapeHtml(formatKmPost(props.km_end))}` : ""}</p>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-[0.5em] mt-2.5 pt-2 border-t border-slate-800 text-[0.75rem]">
        <div class="bg-slate-900/90 p-[0.5em] rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[0.75rem]">ระยะทาง</span>
          <strong class="text-amber-400 font-mono">${lengthKm ? `${escapeHtml(lengthKm)} กม.` : "ตามโครงข่าย"}</strong>
        </div>
        <div class="bg-slate-900/90 p-[0.5em] rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[0.75rem]">ช่องจราจร</span>
          <strong class="text-sky-400 font-mono text-[0.75rem]">${escapeHtml(props.lanes || "๔ ช่องจราจร")}</strong>
        </div>
        <div class="col-span-2 mt-0.5 rounded-lg border border-slate-700 bg-slate-900/90 px-[0.667em] py-[0.5em] text-center text-[0.75rem] font-semibold text-amber-300">
          ${featureIsMain ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
        </div>
      </div>
    </div>
  `;
}

function getDetourStepIconSvg(iconType: DetourTimelineStep["iconType"]): string {
  switch (iconType) {
    case "start":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="hdms-guide-icon doh-detour-step-icon--start shrink-0" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
    case "end":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--end shrink-0" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
    case "turn_right":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--turn shrink-0" aria-hidden="true"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>`;
    case "turn_left":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--turn shrink-0" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`;
    case "slight_right":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--guide shrink-0" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;
    case "slight_left":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--guide shrink-0" aria-hidden="true"><line x1="17" y1="17" x2="7" y2="7"/><polyline points="17 7 7 7 7 17"/></svg>`;
    case "uturn":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--uturn shrink-0" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
    case "roundabout":
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--guide shrink-0" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
    case "straight":
    default:
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hdms-guide-icon doh-detour-step-icon--turn shrink-0" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  }
}

export function buildDetourTimelineSectionHtml(presentation: DetourTimelinePresentation): string {
  if (!presentation.steps.length) {
    return `<div class="doh-detour-empty hdms-guide-card hdms-guide-warning rounded-xl border p-3 text-xs text-center">${escapeHtml(presentation.directionNotice || "ไม่มีข้อมูลขั้นตอนการเดินทางสำหรับทิศทางนี้")}</div>`;
  }

  const stepsHtml = presentation.steps
    .map((step, idx) => {
      const isLast = idx === presentation.steps.length - 1;
      const iconSvg = getDetourStepIconSvg(step.iconType);

      return `
      <div class="relative flex items-start gap-3">
        ${!isLast ? `<div class="doh-detour-timeline-line absolute left-[0.6875rem] top-6 bottom-[-8px] border-l-2 border-dashed border-amber-500/45" aria-hidden="true"></div>` : ""}
        <div class="doh-detour-step-number hdms-guide-number relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums shadow" aria-hidden="true">
          ${step.stepNumber}
        </div>
        <div class="doh-detour-step-card hdms-guide-card flex-1 min-w-0 rounded-xl border p-2.5 shadow-sm">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              ${iconSvg}
              <span class="doh-detour-step-title hdms-guide-title font-bold text-xs font-heading break-words">${escapeHtml(step.title)}</span>
            </div>
            <span class="doh-detour-step-badge hdms-guide-badge shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
              ${escapeHtml(step.badge)}
            </span>
          </div>
          ${step.detail ? `<p class="doh-detour-step-detail hdms-guide-copy mt-1 text-xs leading-relaxed break-words [overflow-wrap:anywhere]">${escapeHtml(step.detail)}</p>` : ""}
        </div>
      </div>
    `;
    })
    .join("");

  return `
    <div class="space-y-2">
      <div class="space-y-2">
        ${stepsHtml}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="doh-detour-metric-card hdms-guide-card rounded-xl border p-2 flex flex-col justify-center">
          <div class="doh-detour-metric-label hdms-guide-copy flex items-center gap-1 text-[11px] font-medium leading-none mb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M4 19h4"/><path d="M10 19h4"/><path d="M16 19h4"/><path d="M5 13 9 5h6l4 8"/></svg>
            <span>ระยะทางรวม</span>
          </div>
          <strong class="doh-detour-metric-value hdms-guide-title font-heading font-bold text-xs sm:text-sm tabular-nums leading-tight">${presentation.totalDistanceKm > 0 ? `${escapeHtml(presentation.totalDistanceFormatted)} กม.` : "ไม่ระบุ"}</strong>
        </div>
        <div class="doh-detour-metric-card hdms-guide-card rounded-xl border p-2 flex flex-col justify-center">
          <div class="doh-detour-metric-label hdms-guide-copy flex items-center gap-1 text-[11px] font-medium leading-none mb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>เวลาเดินทาง</span>
          </div>
          <strong class="doh-detour-metric-value hdms-guide-title font-heading font-bold text-xs sm:text-sm tabular-nums leading-tight">${escapeHtml(presentation.estimatedDurationText)}</strong>
        </div>
      </div>
      <div class="doh-detour-condition-row flex flex-wrap items-center justify-between gap-2 border-t border-surface pt-2 text-xs">
        <div class="doh-detour-condition-label hdms-guide-title flex items-center gap-1.5 font-bold text-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
          <span>สภาพเส้นทาง</span>
        </div>
        <span class="doh-detour-condition-badge rounded-full border border-emerald-500/70 bg-emerald-950/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-200 inline-flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          <span>${escapeHtml(presentation.roadCondition)}</span>
        </span>
      </div>
    </div>
  `;
}

export function hasSeparateDetourLines(
  detour: DetourRoute,
  forward: [number, number][],
  reverse: [number, number][]
): boolean {
  if (detour.detour_meta?.carriageway_type === "SINGLE_CENTERLINE" || forward.length < 2 || reverse.length < 2) return false;
  if (forward.length !== reverse.length) return true;
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  return !forward.every((point, i) => same(point, reverse[i])) &&
    !forward.every((point, i) => same(point, reverse[reverse.length - 1 - i]));
}

export function buildDetourPopupHtml(
  detour: DetourRoute,
  defaultDir: DetourDirection = "FORWARD",
  systemData?: SystemDataPayload
): string {
  const dirMode = detour.direction_mode || "TWO_WAY";
  const { forwardText, reverseText } = splitDetourAdviceByDirection(detour.description || "", dirMode);
  const safeId = String(detour.id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const recorded = isRecordedDetourDirection(dirMode);
  const fwdAllowed = isDetourDirectionAllowed(dirMode, "FORWARD");
  const revAllowed = isDetourDirectionAllowed(dirMode, "REVERSE");
  const isRev = revAllowed && (!fwdAllowed || defaultDir === "REVERSE");

  const linkedEvents = systemData ? getLinkedEventsForDetour(detour, systemData) : [];
  const linked = linkedEvents[0]?.primaryFlood ?? null;
  const startHint = linked ? `ทล.${linked.route_no} (${linked.section_name})` : detour.route_name;
  const areaParts = [
    linked?.subdistrict ? `ต.${linked.subdistrict}` : "",
    linked?.district ? `อ.${linked.district}` : "",
    linked?.province ? `จ.${linked.province}` : "",
  ].filter(Boolean);
  const endHint = areaParts.length ? `(${areaParts.join(" ")})` : "";

  const fwdRoadKm = calculatePolylineRoadDistanceKm(detour.coordinates_json);
  const revPolyKmRaw = calculatePolylineRoadDistanceKm(detour.reverse_coordinates_json);
  const revRoadKm = revPolyKmRaw > 0 ? revPolyKmRaw : fwdRoadKm;

  const forwardPresentation = getDetourTimelinePresentation(
    forwardText,
    detourDistanceMeters(detour.detour_meta, "FORWARD"),
    fwdRoadKm,
    startHint,
    endHint,
    detour.detour_meta?.road_condition,
    detourDurationSeconds(detour.detour_meta, "FORWARD")
  );

  const reversePresentation = getDetourTimelinePresentation(
    reverseText,
    detourDistanceMeters(detour.detour_meta, "REVERSE"),
    revRoadKm,
    endHint || startHint,
    startHint,
    detour.detour_meta?.road_condition,
    detourDurationSeconds(detour.detour_meta, "REVERSE")
  );

  const scopeText = linkedEvents.length > 0
    ? linkedEvents
        .map((ev) => `ทล.${ev.routeNo}${ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ` (${ev.sectionName})`}`)
        .join(" · ")
    : (detour.flood_id_ref ? "เชื่อมโยงจุดน้ำท่วม" : "ทางเลี่ยงอิสระ (โครงข่ายทางหลวง)");

  const directionBtnClass = "min-h-[2.75rem] py-2 px-2.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 border disabled:cursor-not-allowed";

  return `
    <div class="doh-detour-popup text-xs p-3 sm:p-3.5 w-[min(20.25rem,calc(100vw-2rem))] sm:w-[23.75rem] max-w-full max-h-[min(54dvh,21.875rem)] sm:max-h-none overflow-y-auto sm:overflow-visible overscroll-contain font-body rounded-2xl border-t-4 border-amber-500 flex flex-col gap-2.5 select-text">
      <!-- ส่วนที่ 1: Header (แถวเดียว: ไอคอนทางเลี่ยง + ชื่อ + ป้ายโหมดทิศทาง) -->
      <div class="doh-detour-header hdms-map-popup-heading flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-surface shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="doh-detour-header-badge inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-500/45 bg-amber-500/15 text-amber-300" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H9a4 4 0 0 0-4 4v1"/><path d="m8 21-4-4 4-4"/><path d="M4 17h11a4 4 0 0 0 4-4v-1"/></svg>
          </span>
          <h4 class="doh-detour-heading font-bold text-sm sm:text-base font-heading leading-tight break-words">เส้นทางเลี่ยง</h4>
        </div>
        <span class="doh-detour-mode-badge rounded-full border border-amber-500/45 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 whitespace-nowrap shrink-0">
          ${escapeHtml(detourDirectionDetailedBadge(dirMode))}
        </span>
      </div>

      <!-- ส่วนที่ 2: การ์ดระบุชื่อทางเลี่ยงและจุดเชื่อมโยง (Rule 2: โทนเหลืองอำพันมีขอบ + สัญลักษณ์เส้นประ) -->
      <div class="doh-detour-hero-card hdms-guide-card rounded-xl border p-2.5 flex items-start gap-2.5 shadow-sm shrink-0">
        <div class="doh-detour-hero-icon hdms-guide-icon-tile w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/><path d="M19 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/><path d="M8 12h2"/><path d="M14 12h2"/><path d="m14 9 3 3-3 3"/></svg>
        </div>
        <div class="min-w-0 flex-1">
          <h5 class="doh-detour-route-name hdms-guide-title font-bold text-xs sm:text-sm font-heading leading-snug break-words [overflow-wrap:anywhere]">${escapeHtml(detour.route_name)}</h5>
          <p class="doh-detour-scope hdms-guide-copy text-xs mt-0.5 break-words [overflow-wrap:anywhere] flex items-start gap-1.5">
            <span class="doh-detour-dash-sample mt-1.5 inline-block w-3.5 shrink-0 border-t-2 border-dashed border-amber-400" aria-hidden="true"></span>
            <span class="min-w-0 flex-1">${escapeHtml(scopeText)}</span>
          </p>
        </div>
      </div>

      <!-- ส่วนที่ 3: สวิตช์เลือกทิศทาง (Rule 4 + Rule 10: ≥ 44px touch target) -->
      <div class="shrink-0">
        <div class="doh-detour-section-label hdms-guide-title text-xs font-bold mb-1.5">เลือกทิศทางการเดินทาง</div>
        <div role="group" aria-label="เลือกทิศทางการเดินทาง" class="doh-detour-dir-group hdms-contrast-switch hdms-guide-card grid grid-cols-2 gap-1 rounded-xl border p-1">
          <button
            type="button"
            id="detour-btn-fwd-${safeId}"
            aria-label="ขาไป A → B"
            aria-pressed="${!isRev && fwdAllowed ? "true" : "false"}"
            ${fwdAllowed ? "" : "disabled aria-disabled=\"true\""}
            onclick="window.__toggleDetourPopupDir && window.__toggleDetourPopupDir('${safeId}', 'FORWARD')"
            class="${directionBtnClass}"
          >
            <span>ขาไป (A → B)</span>
          </button>
          <button
            type="button"
            id="detour-btn-rev-${safeId}"
            aria-label="ขากลับ B → A"
            aria-pressed="${isRev ? "true" : "false"}"
            ${revAllowed ? "" : "disabled aria-disabled=\"true\""}
            onclick="window.__toggleDetourPopupDir && window.__toggleDetourPopupDir('${safeId}', 'REVERSE')"
            class="${directionBtnClass}"
          >
            <span>ขากลับ (B → A)</span>
          </button>
        </div>
        ${recorded ? "" : `<p class="doh-detour-unconfirmed hdms-guide-warning mt-1.5 text-xs rounded-lg border px-2.5 py-1.5" role="status">⚠️ ยังไม่ได้ยืนยันทิศทางเดินรถ กรุณาตรวจสอบกับเจ้าหน้าที่ก่อนเดินทาง</p>`}
      </div>

      <!-- ส่วนที่ 4: คำแนะนำเส้นทางและสรุปตัวเลข (tabular-nums) -->
      <div class="shrink-0">
        <div class="flex items-center gap-1.5 mb-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="doh-detour-advice-icon hdms-guide-accent shrink-0" aria-hidden="true"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg>
          <span class="doh-detour-section-label hdms-guide-title font-bold text-xs font-heading">คำแนะนำเส้นทาง</span>
        </div>
        <div id="detour-desc-fwd-${safeId}" class="${!isRev ? "block" : "hidden"} sm:max-h-48 sm:overflow-y-auto sm:overscroll-contain sm:pr-0.5">
          ${buildDetourTimelineSectionHtml(forwardPresentation)}
        </div>
        <div id="detour-desc-rev-${safeId}" class="${isRev ? "block" : "hidden"} sm:max-h-48 sm:overflow-y-auto sm:overscroll-contain sm:pr-0.5">
          ${buildDetourTimelineSectionHtml(reversePresentation)}
        </div>
      </div>

      <!-- ส่วนที่ 5: ปุ่มดำเนินการ (CTA อำพันทอง + ปุ่มโฟกัสแผนที่ ≥ 44px) -->
      <div class="doh-detour-actions pt-2 border-t border-surface flex flex-col sm:grid sm:grid-cols-2 gap-2 shrink-0">
        <button
          type="button"
          id="detour-nav-btn-${safeId}"
          ${recorded ? "" : "disabled aria-disabled=\"true\" title=\"รอเจ้าหน้าที่ตรวจสอบทิศทางเดินรถ\""}
          onclick="window.__openDetourGoogleMaps && window.__openDetourGoogleMaps('${safeId}', window.__getDetourCurrentDir ? window.__getDetourCurrentDir('${safeId}') : '${defaultDir}')"
          class="doh-detour-nav-btn w-full min-h-[2.75rem] py-2 px-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded-xl flex items-center justify-between gap-2 shadow-md transition touch-manipulation cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="doh-detour-nav-pin doh-detour-nav-icon w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </div>
            <div class="text-left min-w-0">
              <div class="font-black text-xs leading-tight truncate">ดูบน Google Maps</div>
              <div id="detour-nav-subtext-${safeId}" class="doh-detour-nav-sub text-[11px] font-bold leading-tight mt-0.5 truncate">
                ${isRev ? "(ขากลับ B ➔ A)" : "(ขาไป A ➔ B)"}
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>

        <button
          type="button"
          onclick="window.__openDetourModal && window.__openDetourModal('${escapeHtml(detour.id)}')"
          class="doh-detour-detail-btn hdms-map-control w-full min-h-[2.75rem] py-2 px-3 border font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition touch-manipulation cursor-pointer shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span>ดูตำแหน่งบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

export function hasDetourPointMetadata(photo?: DetourPointPhoto | null): boolean {
  if (!photo) return false;
  const hasCoord =
    typeof photo.lat === "number" &&
    Number.isFinite(photo.lat) &&
    typeof photo.lon === "number" &&
    Number.isFinite(photo.lon) &&
    Math.abs(photo.lat) <= 90 &&
    Math.abs(photo.lon) <= 180 &&
    (photo.lat !== 0 || photo.lon !== 0);
  const hasArea = Boolean(
    formatPopupAreaSegment("ต.", photo.subdistrict) ||
      formatPopupAreaSegment("อ.", photo.district) ||
      formatPopupAreaSegment("จ.", photo.province)
  );
  return Boolean(
    (typeof photo.url === "string" && photo.url.trim()) ||
      (typeof photo.caption === "string" && photo.caption.trim()) ||
      hasCoord ||
      hasArea
  );
}

export function resolveDetourPointPinCoord(
  photo: DetourPointPhoto | null | undefined,
  fallbackLat: number,
  fallbackLon: number
): { lat: number; lon: number } {
  const hasCustom =
    photo &&
    typeof photo.lat === "number" &&
    typeof photo.lon === "number" &&
    Number.isFinite(photo.lat) &&
    Number.isFinite(photo.lon) &&
    Math.abs(photo.lat) <= 90 &&
    Math.abs(photo.lon) <= 180 &&
    (photo.lat !== 0 || photo.lon !== 0);
  return hasCustom
    ? { lat: photo.lat!, lon: photo.lon! }
    : { lat: fallbackLat, lon: fallbackLon };
}

export function buildDetourFallbackPinSpec(
  point: "START" | "END",
  variant: "COMPACT" | "FULL" = "FULL",
  isFocusEndpoint = false
) {
  const compact = variant === "COMPACT";
  const size = compact ? 20 : 26;
  const label = point === "START" ? "A" : "B";
  const bg = point === "START" ? "#064e3b" : "#0c4a6e";
  const border = point === "START" ? "#10b981" : "#38bdf8";
  const text = point === "START" ? "#a7f3d0" : "#bae6fd";
  const pointClass = point === "START" ? "doh-detour-photo-start" : "doh-detour-photo-end";
  return {
    html: `<div class="doh-detour-photo-badge doh-detour-point-fallback" style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:${text};border:2px solid ${border};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${compact ? 10 : 11}px;line-height:1;box-shadow:0 3px 10px rgba(0,0,0,0.6)"><span>${label}</span></div>`,
    className: `doh-detour-photo-point ${pointClass}${isFocusEndpoint ? " hdms-focus-endpoint" : ""}`,
    iconSize: [size, size] as [number, number],
    iconAnchor: [size / 2, size / 2] as [number, number],
  };
}

export function buildDetourPointPhotoPopupHtml(
  detour: DetourRoute,
  role: "START" | "END",
  photo: DetourPointPhoto | null | undefined,
  lat: number,
  lon: number
): string {
  const safePhoto = photo ?? {};
  const isStart = role === "START";
  const rawUrl = typeof safePhoto.url === "string" ? safePhoto.url.trim() : "";
  const normalizedUrl = rawUrl ? escapeHtml(normalizeMediaUrl(rawUrl)) : "";
  const hasPhotoUrl = Boolean(normalizedUrl);
  const badgeIcon = hasPhotoUrl ? "📷" : "📍";
  const badgeText = isStart
    ? hasPhotoUrl
      ? "จุดเริ่มต้น A — ทางเข้าทางเลี่ยง (ขาไป A → B)"
      : "จุดเริ่มต้น A — พิกัดทางเข้าทางเลี่ยง (ขาไป A → B)"
    : hasPhotoUrl
      ? "จุดสิ้นสุด B — ทางเข้าทางเลี่ยง (ขากลับ B → A)"
      : "จุดสิ้นสุด B — พิกัดทางเข้าทางเลี่ยง (ขากลับ B → A)";
  const defaultCaption = isStart
    ? "บริเวณทางเข้าเส้นทางเลี่ยง ฝั่งจุดเริ่มต้น A (สำหรับผู้ใช้ทางขาไป A → B)"
    : "บริเวณทางเข้าเส้นทางเลี่ยง ฝั่งจุดสิ้นสุด B (สำหรับผู้ใช้ทางที่มาจากอีกฝั่ง B → A)";
  const pinCoord = resolveDetourPointPinCoord(safePhoto, lat, lon);
  const effectiveLat = pinCoord.lat;
  const effectiveLon = pinCoord.lon;
  const hasValidCoord =
    Number.isFinite(effectiveLat) &&
    Number.isFinite(effectiveLon) &&
    (effectiveLat !== 0 || effectiveLon !== 0);
  const coordText = hasValidCoord
    ? `${Number(effectiveLat).toFixed(6)}, ${Number(effectiveLon).toFixed(6)}`
    : null;
  const areaParts = [
    formatPopupAreaSegment("ต.", safePhoto.subdistrict),
    formatPopupAreaSegment("อ.", safePhoto.district),
    formatPopupAreaSegment("จ.", safePhoto.province),
  ].filter((part): part is string => Boolean(part));
  const areaLine = areaParts.length > 0 ? areaParts.join(" ") : null;

  const captionText = escapeHtml(safePhoto.caption?.trim() || defaultCaption);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${Number(effectiveLat).toFixed(6)},${Number(effectiveLon).toFixed(6)}&travelmode=driving`;

  return `
    <div class="doh-detour-point-photo-popup text-xs p-[0.833em] sm:p-[1.167em] w-[min(20.25rem,calc(100vw-2rem))] sm:w-[21.25rem] max-w-full max-h-[min(54dvh,21.875rem)] sm:max-h-none overflow-y-auto sm:overflow-visible overscroll-contain font-body bg-[#070d1e] text-white rounded-2xl select-text space-y-2 sm:space-y-2.5">
      <div class="hdms-map-popup-heading flex items-center justify-between gap-[0.667em] pb-2 border-b border-slate-800/80">
        <span class="inline-flex items-center gap-[0.5em] rounded-full px-[0.833em] py-[0.167em] text-[0.75rem] font-heading font-bold ${
          isStart
            ? "bg-emerald-950/90 border border-emerald-500/60 text-emerald-300"
            : "bg-sky-950/90 border border-sky-500/60 text-sky-300"
        }">
          <span>${badgeIcon}</span>
          <span>${escapeHtml(badgeText)}</span>
        </span>
      </div>
      <div class="space-y-1">
        <h5 class="font-bold text-white text-sm font-heading leading-snug break-words">${escapeHtml(detour.route_name)}</h5>
        ${
          areaLine || coordText
            ? `<div class="rounded-lg border border-slate-800/90 bg-slate-900/75 px-2.5 py-1.5 space-y-0.5">
                ${
                  areaLine
                    ? `<p class="text-[0.75rem] font-medium text-sky-200 leading-snug break-words">📍 ${escapeHtml(areaLine)}</p>`
                    : !hasPhotoUrl
                      ? `<p class="text-[0.75rem] font-medium text-slate-400 leading-snug">📍 ยังไม่พบข้อมูลพื้นที่ ต./อ./จ.</p>`
                      : ""
                }
                ${coordText ? `<p class="font-mono text-[0.6875rem] text-slate-300 leading-tight">พิกัด: ${escapeHtml(coordText)}</p>` : ""}
              </div>`
            : ""
        }
        <p class="text-xs text-amber-200/95 leading-relaxed break-words">${captionText}</p>
      </div>
      ${
        hasPhotoUrl
          ? `<div class="relative flex items-center justify-center overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950">
              <img
                src="${normalizedUrl}"
                alt="${escapeHtml(`${badgeText} ${detour.route_name}`)}"
                onclick="window.__openDetourPointPhoto && window.__openDetourPointPhoto(this.src, this.alt)"
                class="w-full h-auto max-h-[min(36dvh,16rem)] object-contain cursor-zoom-in hover:opacity-95 transition"
              />
              <span class="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-slate-950/85 border border-slate-700 px-[0.667em] py-[0.167em] text-[0.75rem] text-slate-200">
                แตะที่ภาพเพื่อขยายเต็มจอ
              </span>
            </div>`
          : `<div class="rounded-xl border border-dashed border-slate-700/90 bg-slate-900/70 px-3 py-3 text-center text-[0.75rem] text-slate-300">
              ยังไม่มีภาพถ่ายประกอบจุดนี้
            </div>`
      }
      <div class="grid grid-cols-2 gap-[0.5em] sm:gap-[0.667em] pt-1">
        ${
          hasValidCoord
            ? `<a
                href="${escapeHtml(navUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="min-h-[2.75rem] px-[0.667em] sm:px-[0.833em] py-[0.5em] rounded-xl bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 font-heading font-black text-xs flex items-center justify-center gap-[0.333em] text-center shadow transition"
              >
                <span>🧭 ดูบน Google Maps</span>
              </a>`
            : `<span
                aria-disabled="true"
                class="min-h-[2.75rem] px-[0.667em] sm:px-[0.833em] py-[0.5em] rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 font-heading font-bold text-xs flex items-center justify-center text-center"
              >
                ไม่มีพิกัดนำทาง
              </span>`
        }
        <button
          type="button"
          onclick="window.__openDetourModal && window.__openDetourModal('${escapeHtml(detour.id)}')"
          class="min-h-[2.75rem] px-[0.667em] sm:px-[0.833em] py-[0.5em] rounded-xl border border-slate-700 bg-[#13203c] hover:bg-[#1a2b50] text-white font-heading font-bold text-xs flex items-center justify-center gap-[0.333em] text-center transition cursor-pointer"
        >
          <span>ดูคำแนะนำทางเลี่ยง</span>
        </button>
      </div>
    </div>
  `;
}

/** Keep the saved A/B identity separate from its role in the current direction. */
export function getPublicDetourEndpointLabel(
  detour: DetourRoute,
  point: "START" | "END",
  direction: DetourDirection,
) {
  const reverse = direction === "REVERSE";
  const confirmed = isRecordedDetourDirection(detour.direction_mode) && isDetourDirectionAllowed(detour.direction_mode, direction);
  const letter = point === "START" ? "A" : "B";
  const begins = (point === "START") !== reverse;
  const role = !confirmed ? "ยังไม่ยืนยันทิศทาง" : begins ? "จุดเริ่มต้น" : "จุดสิ้นสุด";
  return { title: `${letter} · ${role}`, trip: confirmed ? (reverse ? "ขากลับ B → A" : "ขาไป A → B") : null };
}

export function labelPublicDetourEndpointMarker(
  marker: { getElement: () => HTMLElement | undefined; setTooltipContent: (content: string) => unknown },
  { title, trip }: ReturnType<typeof getPublicDetourEndpointLabel>,
) {
  const name = trip ? `${title} (${trip})` : title;
  marker.getElement()?.setAttribute("aria-label", name);
  marker.setTooltipContent(name);
}

export function buildPublicDetourEndpointPopup(
  detour: DetourRoute,
  point: "START" | "END",
  photo: DetourPointPhoto | null | undefined,
  direction: DetourDirection,
  floodRoutes: FloodRoute[],
  _availablePoints: ReadonlySet<"START" | "END">,
): string {
  const photoUrl = normalizeMediaUrl(photo?.url);
  const safePhotoUrl = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(photoUrl) ? escapeHtml(photoUrl) : "";
  const area = [
    formatPopupAreaSegment("ต.", photo?.subdistrict),
    formatPopupAreaSegment("อ.", photo?.district),
    formatPopupAreaSegment("จ.", photo?.province),
  ].filter(Boolean).join(" ");
  const { title, trip } = getPublicDetourEndpointLabel(detour, point, direction);
  const caption = photo?.caption?.trim();
  const nav = resolveDetourGoogleMapsNavigation(detour, direction, floodRoutes);
  return `
    <section data-detour-endpoint="${point}" class="doh-detour-point-photo-popup font-body" aria-label="${title}" style="width:min(320px,calc(100vw - 26px));max-height:none;overflow:visible">
      <header class="citizen-endpoint-header" style="min-height:54px">
        <h3 data-endpoint-heading tabindex="-1" class="m-0 text-sm font-bold text-[var(--cit-ink)]">${title}</h3>
        ${trip ? `<span class="citizen-endpoint-trip-direction">${trip}</span>` : ""}
      </header>
      <div class="grid min-w-0 gap-1.5 p-2.5 text-xs">
        ${safePhotoUrl ? `<div class="mx-auto w-full max-w-[224px] [@media(max-height:460px)]:hidden">
          <button type="button" data-endpoint-photo data-public-photo aria-haspopup="dialog" aria-label="เปิดภาพขนาดเต็ม ${title}" class="citizen-endpoint-photo-button">
            <img src="${safePhotoUrl}" alt="ภาพจุด ${title}" class="citizen-detour-photo-image" style="aspect-ratio:16 / 9">
            <span class="citizen-endpoint-zoom" aria-hidden="true">ขยายภาพ</span>
            <span data-photo-error hidden>โหลดภาพตัวอย่างไม่สำเร็จ · แตะเพื่อลองเปิดภาพ</span>
          </button>
        </div>` : ""}
        ${area ? `<p data-endpoint-locality class="line-clamp-1 !m-0" title="${escapeHtml(area)}">${escapeHtml(area)}</p>` : ""}
        ${caption ? `<p class="citizen-endpoint-caption line-clamp-2 !m-0" title="${escapeHtml(caption)}">${escapeHtml(caption)}</p>` : ""}
        <div class="citizen-endpoint-actions">
          ${nav.isValid && nav.url ? `<a href="${escapeHtml(nav.url)}" target="_blank" rel="noopener noreferrer">ดูบน Google Maps</a>` : `<p>${escapeHtml(nav.warning || "ยังไม่ยืนยันนำทาง")}</p>`}
          <button type="button" data-endpoint-focus>ดูตำแหน่งบนแผนที่</button>
        </div>
      </div>
    </section>
  `;
}

/** Both public overview and focused endpoints bind the same one-popup interaction. */
export function bindPublicEndpointInspector(
  L: any, map: any, marker: any, _markers: Map<"START" | "END", any>, _point: "START" | "END",
  openFocus: () => void, keepFocusBarClear: boolean,
) {
  marker.on("popupopen", (event: { popup: { getElement: () => HTMLElement | null; options: { autoPanPaddingTopLeft: unknown; autoPanPaddingBottomRight: unknown }; update: () => void } }) => {
    if (keepFocusBarClear) {
      const bounds = map.getContainer().getBoundingClientRect();
      const bar = map.getContainer().parentElement?.parentElement?.querySelector('[data-testid="gis-focus-mode-bar"]')?.getBoundingClientRect();
      if (bar) {
        const wide = window.innerWidth >= 640;
        event.popup.options.autoPanPaddingTopLeft = L.point(12, wide ? Math.max(64, Math.ceil(bar.bottom - bounds.top + 12)) : 16);
        event.popup.options.autoPanPaddingBottomRight = L.point(12, wide ? 24 : Math.max(112, Math.ceil(bounds.bottom - bar.top + 8)));
        event.popup.update();
      }
    }
    const popup = event.popup.getElement()?.querySelector<HTMLElement>("[data-detour-endpoint]");
    if (!popup) return;
    popup.querySelector<HTMLElement>("[data-endpoint-heading]")?.focus({ preventScroll: true });
    popup.onclick = (click) => {
      if (click.target instanceof Element && click.target.closest("[data-endpoint-focus]")) {
        map.closePopup();
        openFocus();
      }
    };
    popup.onkeydown = (key) => {
      if (key.key !== "Escape") return;
      key.stopPropagation();
      map.closePopup();
      marker.getElement()?.focus({ preventScroll: true });
    };
  });
}

export function formatPopupAreaSegment(prefix: string, value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "-") return null;
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

export function formatPopupAreaLine(flood: FloodRoute): string | null {
  const sub = formatPopupAreaSegment("ต.", flood.subdistrict);
  const dist = formatPopupAreaSegment("อ.", flood.district);
  const provRaw =
    flood.province ||
    (flood.direction_meta as { province?: string } | undefined)?.province;
  const prov = formatPopupAreaSegment("จ.", provRaw);
  const parts = [sub, dist, prov].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : null;
}

export function formatPopupRelativeUpdate(iso?: string | null): string {
  if (!iso) return "อัปเดต ไม่ระบุเวลา";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "อัปเดต ไม่ระบุเวลา";
  const diffMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "อัปเดต เมื่อสักครู่";
  if (mins < 60) return `อัปเดต ${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `อัปเดต ${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `อัปเดต ${days} วันที่แล้ว`;
  return `อัปเดต ${new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}`;
}

export function resolveRecordedLanesText(flood: FloodRoute): string | null {
  const direct = String(flood.affected_lanes ?? "").trim();
  if (direct && direct !== "-") return direct;
  const parts = flood.direction_meta?.affectedParts;
  if (Array.isArray(parts) && parts.length > 0) {
    const valid = parts
      .filter((p) => p && p !== "UNSPECIFIED" && p !== "PENDING_VERIFICATION")
      .map((p) => AFFECTED_ROAD_PART_LABELS[p as keyof typeof AFFECTED_ROAD_PART_LABELS] || String(p))
      .filter(Boolean);
    if (valid.length > 0) return valid.join(", ");
  }
  return null;
}

export function resolvePopupTrafficStatus(flood: FloodRoute): { label: string; badgeClass: string; accentColor: string } {
  const presentation = getTrafficPresentation(
    flood.traffic_status,
    flood.water_level_cm ?? 0,
    flood.direction_meta?.trafficStatusDetail
  );
  return {
    label: presentation.label,
    badgeClass: presentation.popupBadgeClass,
    accentColor: presentation.hex,
  };
}

export function buildFloodPopupHtml(flood: FloodRoute, detourCount = 0, publicMode = false): string {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const waterKnown = meta.waterLevelKnown;
  const lanesText = resolveRecordedLanesText(flood);
  const lanesDisplay = lanesText || "ทุกช่องจราจร";
  const statusInfo = resolvePopupTrafficStatus(flood);
  const routeBadge = /^(?:ทล|ปน)\.?\s*/i.test(String(flood.route_no || "")) ? String(flood.route_no) : `ทล.${flood.route_no}`;
  const areaLine = formatPopupAreaLine(flood);
  const photoUrl = normalizeMediaUrl(meta.photos?.[0]?.dataUrl || flood.latest_photo_url || "");
  const safePhoto = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif|avif);base64,|\/(?!\/))/i.test(photoUrl) ? escapeHtml(photoUrl) : "";
  const relativeUpdate = formatPopupRelativeUpdate(flood.updated_at || meta.updatedAt);
  const safeId = escapeHtml(flood.id);
  const kmText = `กม.${formatKmPost(flood.km_start)} – ${formatKmPost(flood.km_end)}`;

  const isClosed = flood.traffic_status === "CLOSED";
  const statusThemeClass = isClosed
    ? "status-red bg-[#3e161a] text-[#fca5a5] border-[#7f1d1d]"
    : statusInfo.accentColor === "#38bdf8"
      ? "status-sky bg-[#0c2b3d] text-[#7dd3fc] border-[#0369a1]"
      : statusInfo.accentColor === "#10b981"
        ? "status-green bg-[#0f2e22] text-[#6ee7b7] border-[#047857]"
        : "status-amber bg-[#362210] text-[#fcd34d] border-[#78350f]";

  return `
    <div class="doh-flood-popup-card w-[min(360px,calc(100vw-24px))] max-w-full max-h-[min(52dvh,21rem)] sm:max-h-[min(85dvh,34rem)] overflow-y-auto overscroll-contain p-3 font-body text-slate-100 bg-[#142638] rounded-2xl shadow-2xl flex flex-col gap-2 border border-[#526D83]/40">
      <!-- ส่วนที่ 1: Header (แถวเดียว) -->
      <div class="hdms-map-popup-heading flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="shrink-0 rounded-lg bg-[#F6A52F] px-2 py-0.5 font-heading text-xs font-black text-slate-950 shadow">
            ${escapeHtml(routeBadge)}
          </span>
          <span class="min-w-0 font-heading text-sm sm:text-base font-bold leading-snug text-white break-words">
            ${escapeHtml(flood.section_name)}
          </span>
        </div>
      </div>

      <!-- ส่วนที่ 2: ภาพเหตุการณ์ (ทันทีใต้ Header, aspect 16:7) -->
      <div class="relative overflow-hidden rounded-xl bg-slate-950 border border-[#526D83]/30 aspect-[16/7] w-full shrink-0">
        ${safePhoto
          ? `<button type="button" data-public-photo aria-haspopup="dialog" aria-label="ขยายภาพสถานการณ์เต็มจอ" class="block h-full w-full cursor-zoom-in">
              <img src="${safePhoto}" alt="ภาพสถานการณ์น้ำท่วม ${escapeHtml(flood.section_name)}" class="h-full w-full object-cover">
              <span data-photo-error hidden>โหลดภาพตัวอย่างไม่สำเร็จ · แตะเพื่อลองเปิดภาพ</span>
            </button>`
          : `<div class="flex h-full w-full flex-col items-center justify-center bg-[#20384A]/60 text-slate-400 p-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="mb-1 opacity-60" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span class="text-[11px] font-medium text-slate-400">ยังไม่มีภาพถ่ายเหตุการณ์</span>
            </div>`}
      </div>

      <!-- ส่วนที่ 3: สถานะจราจร (ทันทีใต้ภาพในแถบสีตามสถานะจริง) -->
      <div class="doh-flood-popup-status-bar flex items-center gap-2 rounded-xl px-2.5 py-2 shrink-0 border ${statusThemeClass}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span class="doh-flood-popup-status font-heading text-xs sm:text-sm font-bold leading-snug break-words">
          ${escapeHtml(statusInfo.label)}
        </span>
      </div>

      <!-- ส่วนที่ 4: ข้อมูลสำคัญ 2 ช่อง (จัด Grid 2 คอลัมน์) -->
      <div class="grid grid-cols-2 gap-2 shrink-0">
        <!-- ซ้าย: ระดับน้ำล่าสุด -->
        <div class="rounded-xl bg-[#20384A] p-2 border border-[#526D83]/40 flex flex-col justify-center">
          <div class="text-[11px] text-[#B5CBD9] font-medium leading-none mb-1">ระดับน้ำล่าสุด</div>
          ${waterKnown
            ? `<div class="flex items-baseline gap-1 mt-0.5">
                <strong class="doh-flood-popup-water font-heading font-black text-xl sm:text-2xl text-[#F6A52F] tabular-nums leading-none">${escapeHtml(flood.water_level_cm ?? 0)}</strong>
                <span class="text-xs text-[#F6A52F]/90 font-bold">ซม.</span>
              </div>`
            : `<div class="doh-flood-popup-water font-heading font-bold text-xs sm:text-sm text-[#F6A52F] mt-0.5 leading-tight">รอตรวจสอบระดับน้ำ</div>`}
        </div>

        <!-- ขวา: ช่องจราจร -->
        <div class="rounded-xl bg-[#20384A] p-2 border border-[#526D83]/40 flex flex-col justify-center">
          <div class="text-[11px] text-[#B5CBD9] font-medium leading-none mb-1">ช่องจราจร:</div>
          <strong class="font-heading font-bold text-xs sm:text-sm text-white leading-tight block break-words mt-0.5">${escapeHtml(lanesDisplay)}</strong>
        </div>
      </div>

      <!-- ส่วนที่ 5: ตำแหน่งและเวลา (3 แถวต่อเนื่องกัน gap-1 = 4px) -->
      <div class="flex flex-col gap-1 text-xs shrink-0 pt-0.5">
        <!-- แถว 1: ตำแหน่ง กม. -->
        <div class="flex items-center gap-1.5 text-slate-200">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F6A52F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="font-medium tabular-nums">${escapeHtml(kmText)}</span>
        </div>

        <!-- แถว 2: พื้นที่ ตำบล/อำเภอ -->
        ${areaLine ? `
          <div class="doh-flood-popup-area flex items-center gap-1.5 text-slate-300">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-slate-400" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span class="min-w-0 break-words">${escapeHtml(areaLine)}</span>
          </div>
        ` : ""}

        <!-- แถว 3: เวลา + Badge ทางเลี่ยง -->
        <div class="flex items-center justify-between gap-2 pt-0.5">
          <div class="flex items-center gap-1.5 text-slate-400 text-xs min-w-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span class="truncate">${escapeHtml(relativeUpdate)}</span>
          </div>
          ${detourCount > 0 ? `
            <button
              type="button"
              onclick="window.__openFloodDetourDossier && window.__openFloodDetourDossier('${safeId}')"
              class="shrink-0 inline-flex items-center rounded-full border border-amber-500/40 bg-[#3a2010] px-2.5 py-0.5 text-[11px] font-bold text-[#F6A52F] hover:bg-[#4a2b16] transition cursor-pointer"
            >
              <span>ทางเลี่ยง ${detourCount} สาย</span>
            </button>
          ` : `<span class="shrink-0 text-[11px] text-slate-500 font-medium">ไม่มีทางเลี่ยง</span>`}
        </div>
      </div>

      <!-- ส่วนที่ 6: ปุ่มดำเนินการ (2 ปุ่มแถวเดียวกัน กว้างเท่ากัน min-h-11 = 44px) -->
      <div class="grid grid-cols-2 gap-2 pt-1 shrink-0">
        <button
          type="button"
          onclick="window.__openFloodDossier && window.__openFloodDossier('${safeId}')"
          class="min-h-11 rounded-xl bg-[#F6A52F] hover:bg-[#e29320] active:bg-[#c97f14] px-3 py-2 font-heading text-xs sm:text-sm font-black text-slate-950 shadow-md transition cursor-pointer flex items-center justify-center text-center leading-tight touch-manipulation"
        >
          <span>ดูรายละเอียด</span>
        </button>
        <button
          type="button"
          aria-label="ดูตำแหน่งบนแผนที่"
          onclick="window.__focusFloodOnMap && window.__focusFloodOnMap('${safeId}')"
          class="min-h-11 rounded-xl border border-[#526D83] bg-[#20384A] hover:bg-[#2a485e] active:bg-[#182b3a] px-3 py-2 font-heading text-xs sm:text-sm font-bold text-white shadow-md transition cursor-pointer flex items-center justify-center text-center leading-tight touch-manipulation"
        >
          <span>ดูบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

export function buildOfficePopupHtml(office: DohOfficeLocation): string {
  const isHq = office.type === "HEADQUARTERS";
  return `
    <div class="w-[min(17.5rem,calc(100vw-2.25rem))] max-w-full text-xs p-[0.833em] font-body text-slate-100">
      <div class="hdms-map-popup-heading">
      <div class="flex items-center gap-[0.5em] mb-1">
        <span class="bg-amber-400 text-slate-950 text-[0.75rem] font-bold px-[0.5em] py-[0.067em] rounded font-heading">
          ${isHq ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
        </span>
      </div>
      <h4 class="font-bold text-white text-sm font-heading break-words">${escapeHtml(office.name)}</h4>
      </div>
      <p class="text-slate-300 text-[0.75rem] mt-1 break-words">${escapeHtml(office.address)}</p>
      <div class="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between gap-[0.667em]">
        <a href="tel:${String(office.phone ?? "").replace(/[^0-9]/g, "")}" class="text-amber-300 hover:underline font-bold text-xs inline-flex items-center gap-[0.333em] min-h-[2.75rem]">
          📞 ${escapeHtml(office.phone)}
        </a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lon}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center min-h-[2.75rem] bg-amber-500 text-slate-950 px-[0.833em] py-[0.5em] rounded-lg text-xs font-bold hover:bg-amber-400 shrink-0">
          นำทาง
        </a>
      </div>
    </div>
  `;
}
