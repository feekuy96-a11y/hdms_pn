import { SystemDataPayload, FloodRoute, DetourRoute, DohOfficeLocation } from "@/db/default-data";
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
} from "@/lib/detour-presentation";
import {
  AFFECTED_ROAD_PART_LABELS,
  parseFloodDirectionMeta,
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
  const known = flood.direction_meta?.water_level_known !== false;
  // รายการที่ 3: หากยืนยันระดับน้ำล่าสุดเป็น 0 ซม. ให้ซ่อนเส้นน้ำท่วมออกจากแผนที่สถานการณ์ปัจจุบัน (แต่ถ้าไม่ทราบระดับน้ำ ไม่ตีความเป็น 0)
  if (known && Number(flood.water_level_cm) === 0) return false;
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

export function lineAnimationClasses(style: { animation?: string; animationSpeed?: string } | undefined, allow: boolean): string {
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
    ...(className ? { className } : {}),
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
    <div class="w-[min(18.5rem,calc(100vw-2.25rem))] max-w-full text-xs p-[0.833em] sm:p-[1em] pr-8 font-body bg-slate-950 text-white rounded-xl" style="border-top: 3px solid ${color}">
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 gap-[0.667em]">
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

export function buildDetourTimelineSectionHtml(presentation: DetourTimelinePresentation): string {
  if (!presentation.steps.length) {
    return `<div class="rounded-xl border border-slate-800 bg-[#0d1b36] p-[1em] text-xs text-slate-300 text-center">ไม่มีข้อมูลขั้นตอนการเดินทางสำหรับทิศทางนี้</div>`;
  }

  const stepsHtml = presentation.steps
    .map((step, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === presentation.steps.length - 1;
      const isTurnRight = step.iconType === "turn_right";
      const isTurnLeft = step.iconType === "turn_left";

      const iconSvg = isFirst
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="#10b981" class="shrink-0" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`
        : isTurnRight
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>`
          : isTurnLeft
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

      return `
      <div class="relative flex items-start gap-[1em]">
        ${!isLast ? `<div class="absolute left-[0.6875rem] top-6 bottom-[-8px] w-0.5 bg-slate-600/80" aria-hidden="true"></div>` : ""}
        <div class="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-slate-950 text-xs font-black shadow" aria-hidden="true">
          ${step.stepNumber}
        </div>
        <div class="flex-1 min-w-0 rounded-xl border border-slate-800 bg-[#0d1b36] p-[0.833em] shadow-sm">
          <div class="flex items-center justify-between gap-[0.5em]">
            <div class="flex items-center gap-[0.5em] min-w-0">
              ${iconSvg}
              <span class="font-bold text-[#fbbf24] text-xs font-heading truncate">${escapeHtml(step.title)}</span>
            </div>
            <span class="shrink-0 rounded-full border border-slate-700 bg-slate-900/90 px-[0.667em] py-[0.167em] text-[0.75rem] font-medium text-slate-300">
              ${escapeHtml(step.badge)}
            </span>
          </div>
          <p class="mt-1 text-xs text-slate-300 leading-relaxed break-words [overflow-wrap:anywhere]">
            ${escapeHtml(step.detail)}
          </p>
        </div>
      </div>
    `;
    })
    .join("");

  return `
    <div class="space-y-2">
      <div class="space-y-2.5">
        ${stepsHtml}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-[0.667em] rounded-xl border border-slate-800/80 bg-[#0d1b36] px-[1em] py-[0.667em] text-xs">
        <div class="flex items-center gap-[0.5em] text-slate-300">
          <span class="text-sm" aria-hidden="true">🛣</span>
          <span>ระยะทางรวม</span>
          <strong class="font-bold text-white text-xs">${escapeHtml(presentation.totalDistanceFormatted)} กม.</strong>
        </div>
        <span class="text-slate-600 hidden sm:inline" aria-hidden="true">|</span>
        <div class="flex items-center gap-[0.5em] text-slate-300">
          <span class="text-sm" aria-hidden="true">⏱</span>
          <strong class="font-bold text-white text-xs">${escapeHtml(presentation.estimatedDurationText)}</strong>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-[0.667em] border-t border-slate-800/80 pt-2 text-xs">
        <div class="flex items-center gap-[0.5em] font-bold text-white text-xs">
          <span class="text-sm" aria-hidden="true">🛣</span>
          <span>สภาพเส้นทาง</span>
        </div>
        <span class="rounded-full border border-emerald-500/80 bg-emerald-950/80 px-[0.833em] py-[0.167em] text-[0.75rem] font-medium text-emerald-300 flex items-center gap-[0.333em]">
          <span class="text-xs" aria-hidden="true">✔</span>
          <span>${escapeHtml(presentation.roadCondition)}</span>
        </span>
      </div>
    </div>
  `;
}

export function buildDetourPopupHtml(
  detour: DetourRoute,
  color: string,
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

  const activeBtnClass = "min-h-[2.75rem] py-[0.5em] px-[0.833em] text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-[0.333em] bg-[#f59e0b] text-slate-950 shadow-sm";
  const inactiveBtnClass = "min-h-[2.75rem] py-[0.5em] px-[0.833em] text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-[0.333em] text-slate-300 hover:bg-slate-800/70 hover:text-white";

  return `
    <div class="doh-detour-popup text-xs p-[0.833em] sm:p-[1.167em] w-[min(20.25rem,calc(100vw-2rem))] sm:w-[23.75rem] max-w-full max-h-[min(54dvh,21.875rem)] sm:max-h-none overflow-y-auto sm:overflow-visible overscroll-contain font-body bg-[#070d1e] text-white rounded-2xl border-t-4 border-amber-400 select-text">
      <div class="flex items-center justify-between gap-[0.667em] pb-2 sm:pb-2.5 pr-9 border-b border-slate-800/80">
        <div class="flex items-center gap-[0.667em] min-w-0">
          <span style="color:${color}" class="text-base sm:text-lg font-black shrink-0 leading-none" aria-hidden="true">↔</span>
          <h4 class="font-bold text-white text-sm sm:text-base font-heading leading-tight truncate">เส้นทางเลี่ยง</h4>
        </div>
        <span class="rounded-full bg-amber-500/10 border border-amber-500/40 px-[0.667em] py-[0.167em] text-[0.75rem] font-bold text-amber-300 whitespace-nowrap shrink-0">
          ${escapeHtml(detourDirectionDetailedBadge(dirMode))}
        </span>
      </div>

      <div class="mt-2 sm:mt-2.5 rounded-xl sm:rounded-2xl border border-sky-800/80 bg-[#0e2146] p-[0.833em] sm:p-[1em] flex items-start gap-[0.667em] sm:gap-[0.833em] shadow-sm">
        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <div class="min-w-0 flex-1">
          <h5 class="font-bold text-white text-xs sm:text-sm font-heading leading-snug break-words [overflow-wrap:anywhere]">${escapeHtml(detour.route_name)}</h5>
          <p class="text-[0.75rem] text-sky-200/80 mt-0.5 break-words [overflow-wrap:anywhere]">${escapeHtml(scopeText)}</p>
        </div>
      </div>

      <div class="mt-2 sm:mt-2.5">
        <div class="text-xs font-bold text-slate-200 mb-1.5">เลือกทิศทางการเดินทาง</div>
        <div role="group" aria-label="เลือกทิศทางการเดินทาง" class="grid grid-cols-2 gap-[0.333em] rounded-xl border border-slate-700/80 bg-[#060d1b] p-[0.333em]">
          <button
            type="button"
            id="detour-btn-fwd-${safeId}"
            aria-label="ขาไป A → B"
            aria-pressed="${!isRev && fwdAllowed ? "true" : "false"}"
            ${fwdAllowed ? "" : "disabled aria-disabled=\"true\""}
            onclick="window.__toggleDetourPopupDir && window.__toggleDetourPopupDir('${safeId}', 'FORWARD')"
            class="${!isRev && fwdAllowed ? activeBtnClass : inactiveBtnClass} disabled:opacity-35 disabled:cursor-not-allowed"
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
            class="${isRev ? activeBtnClass : inactiveBtnClass} disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <span>ขากลับ (B → A)</span>
          </button>
        </div>
        ${recorded ? "" : `<p class="mt-1.5 text-[0.75rem] text-amber-300" role="status">⚠️ ยังไม่ได้ยืนยันทิศทางเดินรถ กรุณาตรวจสอบกับเจ้าหน้าที่ก่อนเดินทาง</p>`}
      </div>

      <div class="mt-2 sm:mt-3">
        <div class="flex items-center gap-[0.5em] mb-1.5 sm:mb-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg>
          <span class="font-bold text-white text-xs font-heading">คำแนะนำเส้นทาง</span>
        </div>
        <div id="detour-desc-fwd-${safeId}" class="${!isRev ? "block" : "hidden"} max-h-32 sm:max-h-52 overflow-y-auto overscroll-contain pr-0.5">
          ${buildDetourTimelineSectionHtml(forwardPresentation)}
        </div>
        <div id="detour-desc-rev-${safeId}" class="${isRev ? "block" : "hidden"} max-h-32 sm:max-h-52 overflow-y-auto overscroll-contain pr-0.5">
          ${buildDetourTimelineSectionHtml(reversePresentation)}
        </div>
      </div>

      <div class="mt-2.5 sm:mt-3.5 pt-2 sm:pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-[0.5em] sm:gap-[0.667em]">
        <button
          type="button"
          id="detour-nav-btn-${safeId}"
          ${recorded ? "" : "disabled aria-disabled=\"true\" title=\"รอเจ้าหน้าที่ตรวจสอบทิศทางเดินรถ\""}
          onclick="window.__openDetourGoogleMaps && window.__openDetourGoogleMaps('${safeId}', window.__getDetourCurrentDir ? window.__getDetourCurrentDir('${safeId}') : '${defaultDir}')"
          class="doh-detour-nav-btn w-full sm:w-auto flex-1 min-h-[2.75rem] py-[0.667em] px-[1em] bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl flex items-center justify-between shadow transition cursor-pointer border border-emerald-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div class="flex items-center gap-[0.667em] min-w-0">
            <div class="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#059669"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </div>
            <div class="text-left min-w-0">
              <div class="font-bold text-xs leading-tight truncate">นำทางด้วย Google Maps</div>
              <div id="detour-nav-subtext-${safeId}" class="text-[0.75rem] sm:text-[0.75rem] text-emerald-100 font-medium leading-tight mt-0.5 truncate">
                ${isRev ? "(ขากลับ B ➔ A)" : "(ขาไป A ➔ B)"}
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-100 shrink-0 ml-1" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>

        <button
          type="button"
          onclick="window.__openDetourModal && window.__openDetourModal('${escapeHtml(detour.id)}')"
          class="doh-detour-detail-btn w-full sm:w-auto min-h-[2.75rem] py-[0.667em] px-[1em] bg-[#13203c] hover:bg-[#1a2b50] border border-sky-800/80 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-[0.5em] shadow transition cursor-pointer shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span>ดูตำแหน่งบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

export function buildDetourPointPhotoPopupHtml(
  detour: DetourRoute,
  role: "START" | "END",
  photo: { url: string; caption?: string },
  lat: number,
  lon: number
): string {
  const isStart = role === "START";
  const badgeText = isStart
    ? "จุดเริ่มต้น A — ทางเข้าทางเลี่ยง (ขาไป A → B)"
    : "จุดสิ้นสุด B — ทางเข้าทางเลี่ยง (ขากลับ B → A)";
  const defaultCaption = isStart
    ? "บริเวณทางเข้าเส้นทางเลี่ยง ฝั่งจุดเริ่มต้น A (สำหรับผู้ใช้ทางขาไป A → B)"
    : "บริเวณทางเข้าเส้นทางเลี่ยง ฝั่งจุดสิ้นสุด B (สำหรับผู้ใช้ทางที่มาจากอีกฝั่ง B → A)";
  const normalizedUrl = escapeHtml(normalizeMediaUrl(photo.url));
  const captionText = escapeHtml(photo.caption?.trim() || defaultCaption);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}&travelmode=driving`;

  return `
    <div class="doh-detour-point-photo-popup text-xs p-[0.833em] sm:p-[1.167em] w-[min(20.25rem,calc(100vw-2rem))] sm:w-[21.25rem] max-w-full max-h-[min(54dvh,21.875rem)] sm:max-h-none overflow-y-auto sm:overflow-visible overscroll-contain font-body bg-[#070d1e] text-white rounded-2xl select-text space-y-2 sm:space-y-2.5">
      <div class="flex items-center justify-between gap-[0.667em] pb-2 pr-9 border-b border-slate-800/80">
        <span class="inline-flex items-center gap-[0.5em] rounded-full px-[0.833em] py-[0.167em] text-[0.75rem] font-heading font-bold ${
          isStart
            ? "bg-emerald-950/90 border border-emerald-500/60 text-emerald-300"
            : "bg-sky-950/90 border border-sky-500/60 text-sky-300"
        }">
          <span>📷</span>
          <span>${escapeHtml(badgeText)}</span>
        </span>
      </div>
      <div>
        <h5 class="font-bold text-white text-sm font-heading leading-snug break-words">${escapeHtml(detour.route_name)}</h5>
        <p class="text-xs text-amber-200/95 mt-1 leading-relaxed break-words">${captionText}</p>
      </div>
      <div class="relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950">
        <img
          src="${normalizedUrl}"
          alt="${escapeHtml(`${badgeText} ${detour.route_name}`)}"
          onclick="window.__openDetourPointPhoto && window.__openDetourPointPhoto(this.src, this.alt)"
          class="w-full h-32 sm:h-44 object-cover cursor-zoom-in hover:opacity-95 transition"
        />
        <span class="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-slate-950/85 border border-slate-700 px-[0.667em] py-[0.167em] text-[0.75rem] text-slate-200">
          แตะที่ภาพเพื่อขยายเต็มจอ
        </span>
      </div>
      <div class="grid grid-cols-2 gap-[0.5em] sm:gap-[0.667em] pt-1">
        <a
          href="${escapeHtml(navUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          class="min-h-[2.75rem] px-[0.667em] sm:px-[0.833em] py-[0.5em] rounded-xl bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 font-heading font-black text-xs flex items-center justify-center gap-[0.333em] text-center shadow transition"
        >
          <span>🧭 นำทางไปจุดนี้</span>
        </a>
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

const POPUP_ACCENT_COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  sky: "#38bdf8",
  green: "#10b981",
};

export function resolvePopupTrafficStatus(flood: FloodRoute): { label: string; badgeClass: string; accentColor: string } {
  const presentation = getTrafficPresentation(
    flood.traffic_status,
    flood.water_level_cm ?? 0,
    flood.direction_meta?.trafficStatusDetail
  );
  return {
    label: presentation.label,
    badgeClass: presentation.popupBadgeClass,
    accentColor: POPUP_ACCENT_COLOR_MAP[presentation.color] ?? "#f59e0b",
  };
}

export function buildFloodPopupHtml(flood: FloodRoute, detourCount: number = 0): string {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const waterKnown = flood.direction_meta?.water_level_known !== false && meta.waterLevelKnown !== false;
  const levelDisplay = waterKnown ? `${flood.water_level_cm} ซม.` : "รอตรวจสอบระดับน้ำ";
  const lanesText = resolveRecordedLanesText(flood);
  const statusInfo = resolvePopupTrafficStatus(flood);
  const routeBadge = /^(?:ทล|ปน)\.?\s*/i.test(String(flood.route_no || "")) ? String(flood.route_no) : `ทล.${flood.route_no}`;
  const areaLine = formatPopupAreaLine(flood);
  const photoUrl = normalizeMediaUrl(meta.photos?.[0]?.dataUrl || flood.latest_photo_url || "");
  const relativeUpdate = formatPopupRelativeUpdate(flood.updated_at || meta.updatedAt);
  const safeId = escapeHtml(flood.id);

  return `
    <div style="border-top: 4px solid ${statusInfo.accentColor};" class="w-[min(20.25rem,calc(100vw-2rem))] sm:w-[21.25rem] max-w-full max-h-[min(54dvh,21.875rem)] sm:max-h-none overflow-y-auto sm:overflow-visible overscroll-contain p-[0.833em] sm:p-[1.167em] font-body text-slate-100 bg-[#081120] rounded-2xl">
      <div class="flex items-start justify-between gap-[0.667em] pb-2 pr-9 border-b border-slate-800/80">
        <div class="flex min-w-0 items-center gap-[0.5em] sm:gap-[0.667em] flex-wrap">
          <span class="shrink-0 rounded-lg bg-[#f59e0b] px-[0.667em] py-[0.167em] font-heading text-xs font-black text-slate-950 shadow">
            ${escapeHtml(routeBadge)}
          </span>
          <span class="min-w-0 font-heading text-xs sm:text-sm font-bold leading-snug text-white break-words">
            ${escapeHtml(flood.section_name)}
          </span>
        </div>
        <span class="shrink-0 rounded-lg px-[0.667em] py-[0.167em] font-heading text-[0.75rem] font-bold whitespace-nowrap ${statusInfo.badgeClass}">
          ${escapeHtml(statusInfo.label)}
        </span>
      </div>

      <div class="mt-1.5 sm:mt-2 text-xs text-slate-300 font-medium">
        ระหว่าง กม.${escapeHtml(formatKmPost(flood.km_start))} ถึง กม.${escapeHtml(formatKmPost(flood.km_end))}
      </div>

      ${areaLine ? `
        <div class="mt-1.5 sm:mt-2 flex items-center gap-[0.5em] rounded-xl border border-slate-700/75 bg-[#0e1b33] px-[0.833em] py-[0.5em] text-xs text-slate-200">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="min-w-0 break-words">${escapeHtml(areaLine)}</span>
        </div>
      ` : ""}

      <div class="mt-2 sm:mt-2.5 rounded-xl border border-slate-700/80 bg-[#0d1930] px-[0.833em] py-[0.5em] sm:px-[1em] sm:py-[0.667em] space-y-1.5">
        <div class="flex items-center justify-between gap-[0.667em]">
          <span class="inline-flex items-center gap-[0.5em] text-xs text-slate-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>
            <span>ระดับน้ำล่าสุด</span>
          </span>
          <strong class="font-mono text-sm sm:text-base font-black text-[#f59e0b]">${escapeHtml(levelDisplay)}</strong>
        </div>
        ${lanesText ? `
          <div class="flex items-start gap-[0.5em] border-t border-slate-800/80 pt-1.5 text-xs text-slate-200">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0" aria-hidden="true"><path d="M4 19L8 5"/><path d="M20 19L16 5"/><path d="M12 19v-2"/><path d="M12 13v-2"/><path d="M12 7V5"/></svg>
            <span class="min-w-0 break-words">ช่องจราจร: <strong class="font-semibold text-white">${escapeHtml(lanesText)}</strong></span>
          </div>
        ` : ""}
      </div>

      ${photoUrl ? `
        <div class="mt-2 sm:mt-2.5 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900">
          <img src="${escapeHtml(photoUrl)}" alt="ภาพสถานการณ์น้ำท่วม" class="h-24 sm:h-32 w-full object-cover"/>
        </div>
      ` : ""}

      <div class="mt-2 sm:mt-2.5 flex items-center justify-between gap-[0.667em] text-[0.75rem] text-slate-400">
        <span class="inline-flex items-center gap-[0.333em] min-w-0 truncate">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="truncate">${escapeHtml(relativeUpdate)}</span>
        </span>
        ${detourCount > 0 ? `
          <button
            type="button"
            onclick="window.__openFloodDetourDossier && window.__openFloodDetourDossier('${safeId}')"
            class="inline-flex shrink-0 items-center gap-[0.333em] rounded-full border border-amber-400/60 bg-amber-500/15 px-[0.833em] py-[0.333em] text-[0.75rem] font-bold text-amber-300 hover:bg-amber-500/25 transition cursor-pointer"
          >
            <span>ทางเลี่ยง ${detourCount} สาย ›</span>
          </button>
        ` : `<span class="shrink-0 text-slate-500">ไม่มีทางเลี่ยง</span>`}
      </div>

      <div class="mt-2 sm:mt-2.5 grid grid-cols-2 gap-[0.5em] sm:gap-[0.667em]">
        <button
          type="button"
          onclick="window.__openFloodDossier && window.__openFloodDossier('${safeId}')"
          class="min-h-[2.75rem] rounded-xl bg-[#f59e0b] hover:bg-[#d97706] px-[0.667em] sm:px-[1em] py-[0.667em] font-heading text-xs font-black text-slate-950 shadow transition cursor-pointer flex items-center justify-center gap-[0.333em] text-center leading-tight"
        >
          <span>ดูรายละเอียด</span>
        </button>
        <button
          type="button"
          onclick="window.__focusFloodOnMap && window.__focusFloodOnMap('${safeId}')"
          class="min-h-[2.75rem] rounded-xl border border-slate-700 bg-[#13203c] hover:bg-[#1a2b50] px-[0.667em] sm:px-[1em] py-[0.667em] font-heading text-xs font-bold text-white shadow transition cursor-pointer flex items-center justify-center gap-[0.333em] text-center leading-tight"
        >
          <span>ดูตำแหน่งบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

export function buildOfficePopupHtml(office: DohOfficeLocation): string {
  const isHq = office.type === "HEADQUARTERS";
  return `
    <div class="w-[min(17.5rem,calc(100vw-2.25rem))] max-w-full text-xs p-[0.833em] pr-8 font-body text-slate-100">
      <div class="flex items-center gap-[0.5em] mb-1">
        <span class="bg-amber-400 text-slate-950 text-[0.75rem] font-bold px-[0.5em] py-[0.067em] rounded font-heading">
          ${isHq ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
        </span>
      </div>
      <h4 class="font-bold text-white text-sm font-heading break-words">${escapeHtml(office.name)}</h4>
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
