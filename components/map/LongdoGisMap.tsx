"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload, FloodRoute, DetourRoute, DohOfficeLocation } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { splitDetourAdviceByDirection } from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  defaultDetourDirection,
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
  groupFloodRoutesIntoEvents,
  ParentFloodEventGroup,
  parseFloodDirectionMeta,
} from "@/lib/flood-event-schema";
import { Layers, Navigation, Building2, Map, ChevronUp, ChevronDown, LocateFixed } from "lucide-react";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] || character));

const formatKmPost = (value: unknown) => {
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
function toLeafletLatLng(coord: [number, number]): [number, number] {
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
const EMPTY_COORDS: [number, number][] = [];
const EMPTY_LINES: [number, number][][] = [];
const EMPTY_PICK_MARKERS: { lat: number; lon: number; label: string; mode: string }[] = [];

const MAX_VISIBLE_SHIELDS = 200;
const MAX_VERTEX_HANDLES = 400;

interface ShieldCandidate {
  code: string;
  name: string;
  latlng: [number, number];
  isMain: boolean;
}

interface FloodLineEntry {
  line: any;
  baseWeight: number;
  casing?: any;
  baseBorderWidth?: number;
}

interface AnimatedLineEntry {
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
function addLineCasing(
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

const routeCodeOf = (props: any) => props?.route_no || props?.route_code || props?.ROAD_NO || props?.route || props?.code || "";
const routeNameOf = (props: any) => props?.section_name || props?.route_name || props?.ROAD_NAME || props?.section || props?.name || "ทางหลวง";

function geoJsonFeatures(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data.features)) return data.features;
  if (data.type === "Feature") return [data];
  return [];
}

function parseRouteCoordinates(value: unknown): [number, number][] {
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

function lineAnimationClasses(style: { animation?: string; animationSpeed?: string } | undefined, allow: boolean): string {
  const animation = allow && style?.animation === "chaser" ? "doh-line-chaser"
    : allow && style?.animation === "pulse" ? "doh-line-pulse"
      : allow && style?.animation === "blink" ? "doh-line-blink"
        : allow && style?.animation === "arrows" ? "doh-line-arrows"
          : "";
  const speed = style?.animationSpeed === "slow" ? "doh-anim-slow" : style?.animationSpeed === "fast" ? "doh-anim-fast" : "";
  return `${animation} ${speed}`.trim();
}

function dashArrayFor(style: { pattern?: string; dashArray?: string } | undefined): string | undefined {
  return style?.pattern === "dash" ? (style.dashArray || "8, 6")
    : style?.pattern === "dot" ? "2, 6"
      : style?.pattern === "long-dash-dot" ? "14, 6, 3, 6"
        : undefined;
}

// Bring path layers of the given groups to the top of the shared canvas, in the order given.
// Highway lines are never touched, so they stay at the bottom without re-sorting thousands of paths.
function raisePathLayers(...groups: any[]) {
  groups.forEach((group) => {
    group?.eachLayer?.((layer: any) => {
      if (typeof layer.bringToFront === "function") layer.bringToFront();
    });
  });
}

// ---- Popup HTML builders (called lazily, only when a popup is actually opened) ----

function buildHighwayPopupHtml(props: any, featureIsMain: boolean, color: string): string {
  const code = routeCodeOf(props);
  const name = routeNameOf(props);
  const lengthKm = props.length_km || "";
  return `
    <div class="text-xs p-2.5 min-w-[270px] font-body bg-slate-950 text-white rounded-xl border-2 shadow-2xl" style="border-color: ${color}">
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 gap-2">
        <span class="text-white text-base font-bold font-heading tracking-wide">
          ${code ? `ทล.${escapeHtml(code)} ` : ""}${escapeHtml(name)}
        </span>
      </div>
      <div class="mt-2">
        ${props.km_start !== undefined && props.km_start !== null && String(props.km_start).trim() !== "" ? `<p class="text-amber-300 text-[11px] mt-0.5 font-mono">ระหว่าง กม.${escapeHtml(formatKmPost(props.km_start))}${props.km_end !== undefined && props.km_end !== null && String(props.km_end).trim() !== "" ? ` ถึง กม.${escapeHtml(formatKmPost(props.km_end))}` : ""}</p>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
        <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[10px]">ระยะทาง</span>
          <strong class="text-amber-400 font-mono">${lengthKm ? `${escapeHtml(lengthKm)} กม.` : "ตามโครงข่าย"}</strong>
        </div>
        <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[10px]">ช่องจราจร</span>
          <strong class="text-sky-400 font-mono text-[10px]">${escapeHtml(props.lanes || "๔ ช่องจราจร")}</strong>
        </div>
        <div class="col-span-2 mt-0.5 rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-center text-[10px] font-semibold text-amber-300">
          ${featureIsMain ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
        </div>
      </div>
    </div>
  `;
}

function buildDetourTimelineSectionHtml(presentation: DetourTimelinePresentation): string {
  if (!presentation.steps.length) {
    return `<div class="rounded-xl border border-slate-800 bg-[#0d1b36] p-3 text-xs text-slate-300 text-center">ไม่มีข้อมูลขั้นตอนการเดินทางสำหรับทิศทางนี้</div>`;
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
      <div class="relative flex items-start gap-3">
        ${!isLast ? `<div class="absolute left-[11px] top-6 bottom-[-8px] w-0.5 bg-slate-600/80" aria-hidden="true"></div>` : ""}
        <div class="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-slate-950 text-xs font-black shadow" aria-hidden="true">
          ${step.stepNumber}
        </div>
        <div class="flex-1 min-w-0 rounded-xl border border-slate-800 bg-[#0d1b36] p-2.5 shadow-sm">
          <div class="flex items-center justify-between gap-1.5">
            <div class="flex items-center gap-1.5 min-w-0">
              ${iconSvg}
              <span class="font-bold text-[#fbbf24] text-xs font-heading truncate">${escapeHtml(step.title)}</span>
            </div>
            <span class="shrink-0 rounded-full border border-slate-700 bg-slate-900/90 px-2 py-0.5 text-[10px] font-medium text-slate-300">
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
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#0d1b36] px-3 py-2 text-xs">
        <div class="flex items-center gap-1.5 text-slate-300">
          <span class="text-sm" aria-hidden="true">🛣</span>
          <span>ระยะทางรวม</span>
          <strong class="font-bold text-white text-xs">${escapeHtml(presentation.totalDistanceFormatted)} กม.</strong>
        </div>
        <span class="text-slate-600 hidden sm:inline" aria-hidden="true">|</span>
        <div class="flex items-center gap-1.5 text-slate-300">
          <span class="text-sm" aria-hidden="true">⏱</span>
          <strong class="font-bold text-white text-xs">${escapeHtml(presentation.estimatedDurationText)}</strong>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs">
        <div class="flex items-center gap-1.5 font-bold text-white text-xs">
          <span class="text-sm" aria-hidden="true">🛣</span>
          <span>สภาพเส้นทาง</span>
        </div>
        <span class="rounded-full border border-emerald-500/80 bg-emerald-950/80 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 flex items-center gap-1">
          <span class="text-xs" aria-hidden="true">✔</span>
          <span>${escapeHtml(presentation.roadCondition)}</span>
        </span>
      </div>
    </div>
  `;
}

function buildDetourPopupHtml(
  detour: DetourRoute,
  color: string,
  defaultDir: DetourDirection = "FORWARD",
  floodRoutes: FloodRoute[] = []
): string {
  const dirMode = detour.direction_mode || "TWO_WAY";
  const { forwardText, reverseText } = splitDetourAdviceByDirection(detour.description || "", dirMode);
  const safeId = String(detour.id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const recorded = isRecordedDetourDirection(dirMode);
  const fwdAllowed = isDetourDirectionAllowed(dirMode, "FORWARD");
  const revAllowed = isDetourDirectionAllowed(dirMode, "REVERSE");
  const isRev = revAllowed && (!fwdAllowed || defaultDir === "REVERSE");

  const linked = detour.flood_id_ref
    ? floodRoutes.find((f) => f.id === detour.flood_id_ref)
    : null;
  const startHint = linked ? `ทล.${linked.route_no} (${linked.section_name})` : detour.route_name;
  const areaParts = [
    linked?.subdistrict ? `ต.${linked.subdistrict}` : "",
    linked?.district ? `อ.${linked.district}` : "",
    linked?.province ? `จ.${linked.province}` : "",
  ].filter(Boolean);
  const endHint = areaParts.length ? `(${areaParts.join(" ")})` : "";

  const fwdRoadKm = detour.detour_meta?.forward_distance_km || calculatePolylineRoadDistanceKm(detour.coordinates_json);
  const revRoadKm = detour.detour_meta?.reverse_distance_km || calculatePolylineRoadDistanceKm(detour.reverse_coordinates_json || detour.coordinates_json);

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

  const scopeText = linked
    ? `ทล.${linked.route_no}${areaParts.length ? ` (${areaParts.join(" ")})` : ` (${linked.section_name})`}`
    : (detour.flood_id_ref ? "เชื่อมโยงจุดน้ำท่วม" : "ทางเลี่ยงอิสระ (โครงข่ายทางหลวง)");

  const activeBtnClass = "flex-1 min-h-[38px] py-2 px-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 bg-[#f59e0b] text-slate-950 font-black shadow-md";
  const inactiveBtnClass = "flex-1 min-h-[38px] py-2 px-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 bg-[#13203c] border border-slate-700/80 text-slate-200 hover:text-white";

  return `
    <div class="doh-detour-popup text-xs p-3.5 w-[min(380px,calc(100vw-36px))] max-w-full font-body bg-[#070d1e] text-white rounded-2xl select-text">
      <div class="flex items-center justify-between gap-2 pb-2.5 pr-7 border-b border-slate-800/80">
        <div class="flex items-center gap-2 min-w-0">
          <span style="color:${color}" class="text-lg font-black shrink-0 leading-none" aria-hidden="true">↔</span>
          <h4 class="font-bold text-white text-base font-heading leading-tight truncate">เส้นทางเลี่ยง</h4>
        </div>
        <span class="rounded-full bg-amber-500/10 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 whitespace-nowrap shrink-0">
          ${escapeHtml(detourDirectionDetailedBadge(dirMode))}
        </span>
      </div>

      <div class="mt-2.5 rounded-2xl border border-sky-800/80 bg-[#0e2146] p-3 flex items-start gap-2.5 shadow-sm">
        <div class="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <div class="min-w-0 flex-1">
          <h5 class="font-bold text-white text-sm font-heading leading-snug break-words [overflow-wrap:anywhere]">${escapeHtml(detour.route_name)}</h5>
          <p class="text-[11px] text-sky-200/80 mt-0.5 break-words [overflow-wrap:anywhere]">${escapeHtml(scopeText)}</p>
        </div>
      </div>

      <div class="mt-2.5">
        <div class="text-xs font-bold text-slate-200 mb-1.5">เลือกทิศทางการเดินทาง</div>
        <div class="flex gap-2">
          <button
            type="button"
            id="detour-btn-fwd-${safeId}"
            ${fwdAllowed ? "" : "disabled aria-disabled=\"true\""}
            onclick="window.__toggleDetourPopupDir && window.__toggleDetourPopupDir('${safeId}', 'FORWARD')"
            class="${!isRev && fwdAllowed ? activeBtnClass : inactiveBtnClass} disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">🚗</span>
            <span>ขาไป (A ➔ B)</span>
          </button>
          <button
            type="button"
            id="detour-btn-rev-${safeId}"
            ${revAllowed ? "" : "disabled aria-disabled=\"true\""}
            onclick="window.__toggleDetourPopupDir && window.__toggleDetourPopupDir('${safeId}', 'REVERSE')"
            class="${isRev ? activeBtnClass : inactiveBtnClass} disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">🚙</span>
            <span>ขากลับ (B ➔ A)</span>
          </button>
        </div>
        ${recorded ? "" : `<p class="mt-1.5 text-[11px] text-amber-300" role="status">⚠️ ยังไม่ได้ยืนยันทิศทางเดินรถ กรุณาตรวจสอบกับเจ้าหน้าที่ก่อนเดินทาง</p>`}
      </div>

      <div class="mt-3">
        <div class="flex items-center gap-1.5 mb-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg>
          <span class="font-bold text-white text-xs font-heading">คำแนะนำเส้นทาง</span>
        </div>
        <div id="detour-desc-fwd-${safeId}" class="${!isRev ? "block" : "hidden"} max-h-52 overflow-y-auto pr-0.5">
          ${buildDetourTimelineSectionHtml(forwardPresentation)}
        </div>
        <div id="detour-desc-rev-${safeId}" class="${isRev ? "block" : "hidden"} max-h-52 overflow-y-auto pr-0.5">
          ${buildDetourTimelineSectionHtml(reversePresentation)}
        </div>
      </div>

      <div class="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
        <button
          type="button"
          id="detour-nav-btn-${safeId}"
          ${recorded ? "" : "disabled aria-disabled=\"true\" title=\"รอเจ้าหน้าที่ตรวจสอบทิศทางเดินรถ\""}
          onclick="window.__openDetourGoogleMaps && window.__openDetourGoogleMaps('${safeId}', window.__getDetourCurrentDir ? window.__getDetourCurrentDir('${safeId}') : '${defaultDir}')"
          class="doh-detour-nav-btn flex-1 min-h-[44px] py-2 px-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl flex items-center justify-between shadow transition cursor-pointer border border-emerald-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#059669"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </div>
            <div class="text-left min-w-0">
              <div class="font-bold text-xs leading-tight truncate">นำทางด้วย Google Maps</div>
              <div id="detour-nav-subtext-${safeId}" class="text-[10px] text-emerald-100 font-medium leading-tight mt-0.5 truncate">
                ${isRev ? "(ขากลับ B ➔ A)" : "(ขาไป A ➔ B)"}
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-100 shrink-0 ml-1" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>

        <button
          type="button"
          onclick="window.__openDetourModal && window.__openDetourModal('${escapeHtml(detour.id)}')"
          class="doh-detour-detail-btn min-h-[44px] py-2 px-3 bg-[#13203c] hover:bg-[#1a2b50] border border-sky-800/80 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition cursor-pointer shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span>ดูตำแหน่งบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

function formatPopupAreaSegment(prefix: string, value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "-") return null;
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

function formatPopupAreaLine(flood: FloodRoute): string | null {
  const sub = formatPopupAreaSegment("ต.", flood.subdistrict);
  const dist = formatPopupAreaSegment("อ.", flood.district);
  const provRaw =
    flood.province ||
    (flood.direction_meta as { province?: string } | undefined)?.province;
  const prov = formatPopupAreaSegment("จ.", provRaw);
  const parts = [sub, dist, prov].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatPopupRelativeUpdate(iso?: string | null): string {
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

function resolveRecordedLanesText(flood: FloodRoute): string | null {
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

function resolvePopupTrafficStatus(flood: FloodRoute): { label: string; badgeClass: string } {
  const detail = flood.direction_meta?.trafficStatusDetail;
  const status = String(flood.traffic_status || "");
  if (detail === "PENDING_VERIFICATION" || status === "PENDING_VERIFICATION") {
    return { label: "รอตรวจสอบสถานะ", badgeClass: "bg-slate-600/80 text-white border border-slate-400/50" };
  }
  if (detail === "NO_SMALL_VEHICLES") {
    return { label: "รถเล็กไม่สามารถผ่านได้", badgeClass: "bg-orange-500 text-slate-950 font-black" };
  }
  switch (status) {
    case "CLOSED":
      return { label: "ผ่านไม่ได้", badgeClass: "bg-red-600 text-white font-black" };
    case "LIGHT_VEHICLES_ONLY":
      return { label: "รถเล็กผ่านได้", badgeClass: "bg-sky-500 text-slate-950 font-black" };
    case "ONE_LANE":
      return { label: "รถเล็กผ่านได้ ๑ ช่องทาง", badgeClass: "bg-amber-400 text-slate-950 font-black" };
    case "WARNING":
      return { label: "รถเล็กผ่านไม่ได้", badgeClass: "bg-amber-400 text-slate-950 font-black" };
    case "PASSABLE":
      return { label: "ผ่านได้ปกติ", badgeClass: "bg-emerald-500 text-white font-black" };
    default:
      return { label: "รอตรวจสอบสถานะ", badgeClass: "bg-slate-600/80 text-white border border-slate-400/50" };
  }
}

function buildFloodPopupHtml(flood: FloodRoute, detourCount: number = 0): string {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const waterKnown = flood.direction_meta?.water_level_known !== false && meta.waterLevelKnown !== false;
  const levelDisplay = waterKnown ? `${flood.water_level_cm} ซม.` : "รอตรวจสอบระดับน้ำ";
  const lanesText = resolveRecordedLanesText(flood);
  const statusInfo = resolvePopupTrafficStatus(flood);
  const routeBadge = /^(?:ทล|ปน)\.?\s*/i.test(String(flood.route_no || "")) ? String(flood.route_no) : `ทล.${flood.route_no}`;
  const areaLine = formatPopupAreaLine(flood);
  const photoUrl = meta.photos?.[0]?.dataUrl || flood.latest_photo_url || "";
  const relativeUpdate = formatPopupRelativeUpdate(flood.updated_at || meta.updatedAt);
  const safeId = escapeHtml(flood.id);

  return `
    <div class="w-[310px] sm:w-[340px] max-w-[calc(100vw-32px)] p-3.5 pr-4 font-body text-slate-100 bg-[#081120]">
      <div class="flex items-start justify-between gap-2 pr-7">
        <div class="flex min-w-0 items-center gap-2 flex-wrap">
          <span class="shrink-0 rounded-lg bg-[#f59e0b] px-2 py-0.5 font-heading text-xs font-black text-slate-950 shadow">
            ${escapeHtml(routeBadge)}
          </span>
          <span class="min-w-0 font-heading text-sm font-bold leading-snug text-white break-words">
            ${escapeHtml(flood.section_name)}
          </span>
        </div>
        <span class="shrink-0 rounded-lg px-2 py-0.5 font-heading text-[11px] font-bold whitespace-nowrap ${statusInfo.badgeClass}">
          ${escapeHtml(statusInfo.label)}
        </span>
      </div>

      <div class="mt-2 text-xs text-slate-300 font-medium">
        ระหว่าง กม.${escapeHtml(formatKmPost(flood.km_start))} ถึง กม.${escapeHtml(formatKmPost(flood.km_end))}
      </div>

      ${areaLine ? `
        <div class="mt-2 flex items-center gap-1.5 rounded-xl border border-slate-700/75 bg-[#0e1b33] px-2.5 py-1.5 text-xs text-slate-200">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="min-w-0 break-words">${escapeHtml(areaLine)}</span>
        </div>
      ` : ""}

      <div class="mt-2.5 rounded-xl border border-slate-700/80 bg-[#0d1930] px-3 py-2 space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>
            <span>ระดับน้ำล่าสุด</span>
          </span>
          <strong class="font-mono text-base font-black text-[#f59e0b]">${escapeHtml(levelDisplay)}</strong>
        </div>
        ${lanesText ? `
          <div class="flex items-start gap-1.5 border-t border-slate-800/80 pt-1.5 text-xs text-slate-200">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0" aria-hidden="true"><path d="M4 19L8 5"/><path d="M20 19L16 5"/><path d="M12 19v-2"/><path d="M12 13v-2"/><path d="M12 7V5"/></svg>
            <span class="min-w-0 break-words">ช่องจราจร: <strong class="font-semibold text-white">${escapeHtml(lanesText)}</strong></span>
          </div>
        ` : ""}
      </div>

      ${photoUrl ? `
        <div class="mt-2.5 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900">
          <img src="${escapeHtml(photoUrl)}" alt="ภาพสถานการณ์น้ำท่วม" class="h-32 w-full object-cover"/>
        </div>
      ` : ""}

      <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span class="inline-flex items-center gap-1 min-w-0 truncate">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="truncate">${escapeHtml(relativeUpdate)}</span>
        </span>
        ${detourCount > 0 ? `
          <button
            type="button"
            onclick="window.__openFloodDetourDossier && window.__openFloodDetourDossier('${safeId}')"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 transition cursor-pointer"
          >
            <span>ทางเลี่ยง ${detourCount} สาย ›</span>
          </button>
        ` : `<span class="shrink-0 text-slate-500">ไม่มีทางเลี่ยง</span>`}
      </div>

      <div class="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onclick="window.__openFloodDossier && window.__openFloodDossier('${safeId}')"
          class="min-h-10 rounded-xl bg-[#f59e0b] hover:bg-[#d97706] px-3 py-2 font-heading text-xs font-black text-slate-950 shadow transition cursor-pointer flex items-center justify-center gap-1.5"
        >
          <span>ดูรายละเอียด</span>
        </button>
        <button
          type="button"
          onclick="window.__focusFloodOnMap && window.__focusFloodOnMap('${safeId}')"
          class="min-h-10 rounded-xl border border-slate-700 bg-[#13203c] hover:bg-[#1a2b50] px-3 py-2 font-heading text-xs font-bold text-white shadow transition cursor-pointer flex items-center justify-center gap-1.5"
        >
          <span>ดูตำแหน่งบนแผนที่</span>
        </button>
      </div>
    </div>
  `;
}

function buildOfficePopupHtml(office: DohOfficeLocation): string {
  const isHq = office.type === "HEADQUARTERS";
  return `
    <div class="text-xs p-1 min-w-[220px] font-body text-slate-100">
      <div class="flex items-center gap-1.5 mb-1">
        <span class="bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded font-heading">
          ${isHq ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
        </span>
      </div>
      <h4 class="font-bold text-white text-sm font-heading">${escapeHtml(office.name)}</h4>
      <p class="text-slate-300 text-[11px] mt-1">${escapeHtml(office.address)}</p>
      <div class="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between">
        <a href="tel:${String(office.phone ?? "").replace(/[^0-9]/g, "")}" class="text-amber-300 hover:underline font-bold text-xs flex items-center gap-1">
          📞 ${escapeHtml(office.phone)}
        </a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lon}" target="_blank" rel="noopener noreferrer" class="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-amber-400">
          นำทาง
        </a>
      </div>
    </div>
  `;
}
interface LongdoGisMapProps {
  systemData: SystemDataPayload;
  selectedFloodId: string;
  onSelectFlood: (id: string) => void;
  onOpenFloodDetours?: (id: string) => void;
  onSelectDetour?: (detour: DetourRoute) => void;
  citizenLayerFilter?: "FLOOD" | "DETOUR";
  adminPickMode?: string | null;
  onCoordinatePicked?: (lat: number, lon: number, mode: string) => void;
  draftCoordinates?: [number, number][];
  draftReverseCoordinates?: [number, number][];
  draftWaypoints?: [number, number][];
  draftReverseWaypoints?: [number, number][];
  draftPickMarkers?: { lat: number; lon: number; label: string; mode: string }[];
  draftDirectionMeta?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  draftConflictPoints?: [number, number][];
  onWaypointDragged?: (index: number, newCoord: [number, number]) => void;
  onReverseWaypointDragged?: (index: number, newCoord: [number, number]) => void;
  /** Freeform line editor (Google My Maps style): show draggable handles on every vertex of the draft line. */
  vertexEditable?: boolean;
  vertexEditCoordinates?: [number, number][];
  onVertexMoved?: (index: number, newCoord: [number, number]) => void;
  onVertexInserted?: (index: number, coord: [number, number]) => void;
  onVertexClicked?: (index: number, via: "click" | "contextmenu") => void;
  onOfficeDragged?: (officeId: string, newPosition: { lat: number; lon: number }) => void;
  editableOfficeId?: string | null;
  draftMode?: "FLOOD" | "DETOUR";
  focusCoordinates?: [number, number] | null;
  incomingGisLines?: [number, number][][];
  className?: string;
  publicMode?: boolean;
  isSidebarCollapsed?: boolean;
  /** Optional citizen-side status filter: only these flood records are drawn. */
  visibleFloodIds?: string[];
}

export function LongdoGisMap({
  systemData,
  selectedFloodId,
  onSelectFlood,
  onOpenFloodDetours,
  onSelectDetour,
  citizenLayerFilter,
  adminPickMode = null,
  onCoordinatePicked,
  draftCoordinates = EMPTY_COORDS,
  draftReverseCoordinates = EMPTY_COORDS,
  draftWaypoints = EMPTY_COORDS,
  draftReverseWaypoints = EMPTY_COORDS,
  draftPickMarkers = EMPTY_PICK_MARKERS,
  draftDirectionMeta = "TWO_WAY",
  draftConflictPoints = EMPTY_COORDS,
  onWaypointDragged,
  onReverseWaypointDragged,
  vertexEditable = false,
  vertexEditCoordinates,
  onVertexMoved,
  onVertexInserted,
  onVertexClicked,
  onOfficeDragged,
  editableOfficeId = null,
  draftMode = "FLOOD",
  focusCoordinates = null,
  incomingGisLines = EMPTY_LINES,
  className = "h-full w-full",
  publicMode = false,
  isSidebarCollapsed = false,
  visibleFloodIds,
}: LongdoGisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const highwayGroupRef = useRef<any>(null);
  const shieldGroupRef = useRef<any>(null);
  const detourGroupRef = useRef<any>(null);
  const floodGroupRef = useRef<any>(null);
  const draftGroupRef = useRef<any>(null);
  const arrowGroupRef = useRef<any>(null);
  const draftLineRef = useRef<any>(null);
  const vertexGroupRef = useRef<any>(null);
  const officeGroupRef = useRef<any>(null);
  const floodLinesRef = useRef<Record<string, FloodLineEntry>>({});
  const detourLinesRef = useRef<AnimatedLineEntry[]>([]);
  const userLocationMarkerRef = useRef<any>(null);
  const baseLayersRef = useRef<Record<string, any>>({});
  const currentBaseKeyRef = useRef<string>("longdo");

  const [activeBaseMap, setActiveBaseMap] = useState<"road" | "sat" | "longdo">("longdo");
  const [isLayerControlCollapsed, setIsLayerControlCollapsed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(APP_CONFIG.DEFAULT_ZOOM);
  const [forceShowAllHighways, setForceShowAllHighways] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [floodDisplayMode, setFloodDisplayMode] = useState<"SEGMENTS" | "EVENTS">("SEGMENTS");
  const [showDetourLayer, setShowDetourLayer] = useState(true);
  const effectiveShowFloodLayer = citizenLayerFilter ? citizenLayerFilter === "FLOOD" : showFloodLayer;
  const effectiveShowDetourLayer = citizenLayerFilter ? citizenLayerFilter === "DETOUR" : showDetourLayer;
  const [showMainHwy, setShowMainHwy] = useState(true);
  const [showSecHwy, setShowSecHwy] = useState(true);
  const [showHighwayShields, setShowHighwayShields] = useState(false);
  const [showOffices, setShowOffices] = useState(true);
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [legendRouteList, setLegendRouteList] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  const mapStyles = systemData.mapStyles || DEFAULT_MAP_STYLES;
  const legendRoutes = (type: "MAIN_HIGHWAY" | "SECOND_HIGHWAY") => {
    const routes = new globalThis.Map<string, string>();
    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible) return;
      (layer.geojson_data?.features || []).forEach((feature: any) => {
        const props = feature.properties || {};
        const featureType = props.highway_type || (layer.layer_id === "SECOND_HIGHWAY" ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY");
        const code = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
        const name = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "ไม่ระบุชื่อตอน";
        if (featureType === type && props.is_visible !== false && code) {
          routes.set(`${String(code)}::${String(name)}`, String(name));
        }
      });
    });
    return [...routes.entries()]
      .map(([key, name]) => ({ code: key.split("::")[0], name }))
      .sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }) || a.name.localeCompare(b.name, "th"));
  };

  // Sync dynamic CSS variables on root when mapStyles update
  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      const styles = systemData.mapStyles || DEFAULT_MAP_STYLES;
      if (styles.flood?.color) root.style.setProperty("--doh-color-flood", styles.flood.color);
      if (styles.detour?.color) root.style.setProperty("--doh-color-detour", styles.detour.color);
      if (styles.primary?.color) root.style.setProperty("--doh-color-primary", styles.primary.color);
      if (styles.secondary?.color) root.style.setProperty("--doh-color-secondary", styles.secondary.color);
    }
  }, [systemData.mapStyles]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncAnimationState = () => setAnimationsEnabled(!document.hidden && !media.matches);
    syncAnimationState();
    document.addEventListener("visibilitychange", syncAnimationState);
    media.addEventListener?.("change", syncAnimationState);
    return () => {
      document.removeEventListener("visibilitychange", syncAnimationState);
      media.removeEventListener?.("change", syncAnimationState);
    };
  }, []);

  // Sync refs to avoid stale closures in Leaflet events
  const adminPickModeRef = useRef(adminPickMode);
  adminPickModeRef.current = adminPickMode;
  const onCoordinatePickedRef = useRef(onCoordinatePicked);
  onCoordinatePickedRef.current = onCoordinatePicked;
  const onWaypointDraggedRef = useRef(onWaypointDragged);
  onWaypointDraggedRef.current = onWaypointDragged;
  const onReverseWaypointDraggedRef = useRef(onReverseWaypointDragged);
  onReverseWaypointDraggedRef.current = onReverseWaypointDragged;
  const onOfficeDraggedRef = useRef(onOfficeDragged);
  onOfficeDraggedRef.current = onOfficeDragged;
  const onVertexMovedRef = useRef(onVertexMoved);
  onVertexMovedRef.current = onVertexMoved;
  const onVertexInsertedRef = useRef(onVertexInserted);
  onVertexInsertedRef.current = onVertexInserted;
  const onVertexClickedRef = useRef(onVertexClicked);
  onVertexClickedRef.current = onVertexClicked;
  const onSelectFloodRef = useRef(onSelectFlood);
  onSelectFloodRef.current = onSelectFlood;
  const onOpenFloodDetoursRef = useRef(onOpenFloodDetours);
  onOpenFloodDetoursRef.current = onOpenFloodDetours;
  const onSelectDetourRef = useRef(onSelectDetour);
  onSelectDetourRef.current = onSelectDetour;
  const selectedFloodIdRef = useRef(selectedFloodId);
  selectedFloodIdRef.current = selectedFloodId;
  const systemDataRef = useRef(systemData);
  systemDataRef.current = systemData;

  // Global popup handlers for direction toggling, opening modal, focusing map, and Google Maps navigation
  useEffect(() => {
    const activeDirMap: Record<string, "FORWARD" | "REVERSE"> = {};

    (window as any).__getDetourCurrentDir = (id: string) => {
      return activeDirMap[id] || "FORWARD";
    };

    (window as any).__openFloodDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      onSelectFloodRef.current?.(id);
    };

    (window as any).__openFloodDetourDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      if (onOpenFloodDetoursRef.current) {
        onOpenFloodDetoursRef.current(id);
      } else {
        onSelectFloodRef.current?.(id);
      }
    };

    (window as any).__focusFloodOnMap = (id: string) => {
      const map = leafletMapRef.current;
      const L = leafletRef.current;
      const flood = (systemDataRef.current.floodRoutes || []).find((f) => f.id === id);
      if (!map || !L || !flood) return;
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        map.fitBounds(L.latLngBounds(coords.map(toLeafletLatLng)), { padding: [48, 48], maxZoom: 16 });
      } else if (Number.isFinite(flood.lat_start) && Number.isFinite(flood.lon_start)) {
        map.setView([flood.lat_start, flood.lon_start], 15);
      }
    };

    (window as any).__openDetourModal = (id: string) => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => d.id === id);
      if (detour) {
        onSelectDetourRef.current?.(detour);
      }
    };

    (window as any).__openDetourGoogleMaps = (safeId: string, dir?: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === safeId);
      if (!detour) return;
      const targetDir = dir || activeDirMap[safeId] || defaultDetourDirection(detour.direction_mode) || "FORWARD";
      const nav = resolveDetourGoogleMapsNavigation(detour, targetDir, systemDataRef.current.floodRoutes || []);
      if (nav.url) {
        window.open(nav.url, "_blank", "noopener,noreferrer");
      } else if (nav.warning) {
        alert(nav.warning);
      }
    };

    (window as any).__toggleDetourPopupDir = (id: string, dir: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const route = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === id);
      if (!isDetourDirectionAllowed(route?.direction_mode, dir)) return;
      activeDirMap[id] = dir;
      const fwdBtn = document.getElementById(`detour-btn-fwd-${id}`);
      const revBtn = document.getElementById(`detour-btn-rev-${id}`);
      const fwdDesc = document.getElementById(`detour-desc-fwd-${id}`);
      const revDesc = document.getElementById(`detour-desc-rev-${id}`);
      const navSub = document.getElementById(`detour-nav-subtext-${id}`);
      if (!fwdBtn || !revBtn || !fwdDesc || !revDesc) return;

      const activeClasses = "flex-1 min-h-[38px] py-2 px-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 bg-[#f59e0b] text-slate-950 font-black shadow-md disabled:opacity-35 disabled:cursor-not-allowed";
      const inactiveClasses = "flex-1 min-h-[38px] py-2 px-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 bg-[#13203c] border border-slate-700/80 text-slate-200 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed";

      if (dir === "FORWARD") {
        fwdBtn.className = activeClasses;
        revBtn.className = inactiveClasses;
        fwdDesc.classList.remove("hidden");
        fwdDesc.classList.add("block");
        revDesc.classList.remove("block");
        revDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขาไป A ➔ B)";
      } else {
        revBtn.className = activeClasses;
        fwdBtn.className = inactiveClasses;
        revDesc.classList.remove("hidden");
        revDesc.classList.add("block");
        fwdDesc.classList.remove("block");
        fwdDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขากลับ B ➔ A)";
      }
    };
    return () => {
      delete (window as any).__openFloodDossier;
      delete (window as any).__openFloodDetourDossier;
      delete (window as any).__focusFloodOnMap;
      delete (window as any).__toggleDetourPopupDir;
      delete (window as any).__openDetourModal;
      delete (window as any).__openDetourGoogleMaps;
      delete (window as any).__getDetourCurrentDir;
    };
  }, []);

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    let isMounted = true;
    const initialResizeTimers: ReturnType<typeof setTimeout>[] = [];

    async function initMap() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;
      if (leafletMapRef.current) return;

      try {
        const leafletModule = await import("leaflet");
        const L = (leafletModule as any).default?.map
          ? (leafletModule as any).default
          : (leafletModule as any);

        if (!isMounted || !mapContainerRef.current) return;

        const sharedRenderer = L.canvas({ padding: 0.5, tolerance: 10 });

        // Clean up previous leaflet id on DOM element to prevent "Map container is already initialized" error
        if ((mapContainerRef.current as any)._leaflet_id) {
          delete (mapContainerRef.current as any)._leaflet_id;
        }

        const map = L.map(mapContainerRef.current, {
          center: [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon],
          zoom: APP_CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
          fadeAnimation: false,
          // One shared canvas renderer for every vector layer (created once, never per redraw).
          renderer: sharedRenderer,
        });

        const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY;

        const baseLayers = {
          road: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap • ขท.ปัตตานี",
          }),
          sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles © Esri • ขท.ปัตตานี",
          }),
          longdo: L.tileLayer(
            `https://ms.longdo.com/mmmap/tile.php?zoom={z}&x={x}&y={y}&key=${longdoKey}&proj=epsg3857&mode=icons`,
            {
              maxZoom: 19,
              attribution: "© Longdo Map / ขท.ปัตตานี",
            }
          ),
        };

        baseLayers.longdo.addTo(map);
        baseLayersRef.current = baseLayers;
        leafletMapRef.current = map;

        leafletRef.current = L;
        rendererRef.current = sharedRenderer;
        highwayGroupRef.current = L.layerGroup().addTo(map);
        detourGroupRef.current = L.layerGroup().addTo(map);
        floodGroupRef.current = L.layerGroup().addTo(map);
        draftGroupRef.current = L.layerGroup().addTo(map);
        arrowGroupRef.current = L.layerGroup().addTo(map);
        vertexGroupRef.current = L.layerGroup().addTo(map);
        officeGroupRef.current = L.layerGroup().addTo(map);
        shieldGroupRef.current = L.layerGroup().addTo(map);

        setCurrentZoom(map.getZoom());
        map.on("zoomend", () => {
          setCurrentZoom(map.getZoom());
        });

        setMapReady(true);

        // Invalidate size multiple times to ensure full canvas coverage across viewports
        [100, 300, 600, 1000].forEach((delay) => {
          initialResizeTimers.push(setTimeout(() => {
            if (map) map.invalidateSize();
          }, delay));
        });

        // Handle map clicks for coordinate picking
        map.on("click", (e: any) => {
          if (!adminPickModeRef.current) return;
          const lat = Number(e.latlng.lat.toFixed(6));
          const lon = Number(e.latlng.lng.toFixed(6));
          onCoordinatePickedRef.current?.(lat, lon, adminPickModeRef.current);
        });

        // Ensure popup controls and buttons respond smoothly to clicks and touch
        map.on("popupopen", (e: any) => {
          const container = e?.popup?.getElement?.();
          if (container && L?.DomEvent) {
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
          }
        });
      } catch (err) {
        console.error("[LongdoGisMap] Failed to initialize Leaflet map:", err);
      }
    }

    initMap();

    return () => {
      isMounted = false;
      initialResizeTimers.forEach(clearTimeout);
      setMapReady(false);
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) { }
        leafletMapRef.current = null;
      }
      leafletRef.current = null;
      rendererRef.current = null;
      highwayGroupRef.current = null;
      detourGroupRef.current = null;
      floodGroupRef.current = null;
      draftGroupRef.current = null;
      arrowGroupRef.current = null;
      draftLineRef.current = null;
      vertexGroupRef.current = null;
      officeGroupRef.current = null;
      shieldGroupRef.current = null;
      floodLinesRef.current = {};
      detourLinesRef.current = [];
      userLocationMarkerRef.current = null;
    };
  }, []);

  // Responsive Container Resize Observer & Sidebar Toggle Invalidator
  useEffect(() => {
    if (!leafletMapRef.current) return;
    const timers = [50, 150, 300, 500].map((delay) =>
      setTimeout(() => {
        leafletMapRef.current?.invalidateSize();
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!mapContainerRef.current || !leafletMapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    });
    ro.observe(mapContainerRef.current);

    const handleWindowResize = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [mapReady]);

  // 2. FlyTo focus when coordinates change
  useEffect(() => {
    if (leafletMapRef.current && focusCoordinates) {
      leafletMapRef.current.flyTo(toLeafletLatLng(focusCoordinates) as any, 13, { duration: 1.2 });
    }
  }, [focusCoordinates]);

  // Coordinate editing has priority over feature inspection. The cursor is also
  // restored reliably when the operator exits the edit command.
  useEffect(() => {
    const container = leafletMapRef.current?.getContainer?.();
    if (!container) return;
    container.style.cursor = adminPickMode ? "crosshair" : "";
    if (adminPickMode) leafletMapRef.current?.closePopup?.();
    return () => { container.style.cursor = ""; };
  }, [adminPickMode]);

  // 3. Switch Base Map Tile
  const switchBaseMap = (key: "road" | "sat" | "longdo") => {
    const map = leafletMapRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers[key]) return;

    if (baseLayers[currentBaseKeyRef.current]) {
      map.removeLayer(baseLayers[currentBaseKeyRef.current]);
    }
    baseLayers[key].addTo(map);
    currentBaseKeyRef.current = key;
    setActiveBaseMap(key);
  };

  const resetCamera = () => {
    if (!leafletMapRef.current) return;
    leafletMapRef.current.setView([APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon], APP_CONFIG.DEFAULT_ZOOM);
  };

  // This stays entirely in the browser: the current position is never sent to
  // Supabase or stored with a flood report. Low accuracy/short cache avoids an
  // unnecessary GPS wake-up while still centering the map for most travelers.
  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationStatus("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    if (!leafletMapRef.current || !leafletRef.current) {
      setLocationStatus("แผนที่ยังไม่พร้อม กรุณาลองอีกครั้ง");
      return;
    }
    setIsLocating(true);
    setLocationStatus("กำลังค้นหาตำแหน่งของคุณ…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = leafletMapRef.current;
        const L = leafletRef.current;
        if (!map || !L) return;
        const latLng: [number, number] = [position.coords.latitude, position.coords.longitude];
        if (userLocationMarkerRef.current) userLocationMarkerRef.current.setLatLng(latLng);
        else {
          userLocationMarkerRef.current = L.circleMarker(latLng, {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 0.95,
            interactive: false,
            pane: "markerPane",
          }).addTo(map).bindTooltip("ตำแหน่งของคุณ", { direction: "top", offset: [0, -8] });
        }
        map.flyTo(latLng, Math.max(map.getZoom(), 14), { duration: 0.7 });
        setLocationStatus("แสดงตำแหน่งของคุณแล้ว");
        setIsLocating(false);
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาเปิดสิทธิ์ในเบราว์เซอร์"
          : "ไม่พบตำแหน่งของคุณ กรุณาลองอีกครั้ง";
        setLocationStatus(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  // 4. Overlay layers
  // Each layer group below redraws ONLY when its own data/toggles change. Previously one effect
  // cleared and rebuilt everything (all highways, floods, detours, drafts, labels) on every zoom,
  // click, drag or selection, and created a brand-new <canvas> renderer each time.
  const highwayFeatureCount = useMemo(
    () => (systemData.highwayLayers || []).reduce((count, layer) => count + geoJsonFeatures(layer.geojson_data).length, 0),
    [systemData.highwayLayers]
  );
  const animatedRouteCount = useMemo(
    () => (systemData.floodRoutes || []).filter((route) => route.is_active).length + (systemData.detourRoutes || []).filter((route) => route.is_active).length,
    [systemData.floodRoutes, systemData.detourRoutes]
  );
  const allowLineAnimation = animationsEnabled && highwayFeatureCount <= 250 && animatedRouteCount <= 80;
  // Read through a ref so hiding/showing the browser tab (which flips animationsEnabled) does not
  // rebuild every layer. Note: Leaflet ignores className for canvas-rendered paths anyway.
  const allowLineAnimationRef = useRef(allowLineAnimation);
  allowLineAnimationRef.current = allowLineAnimation;

  const shieldCandidates = useMemo<ShieldCandidate[]>(() => {
    const items: ShieldCandidate[] = [];
    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible) return;
      const layerIsMain = layer.layer_id === "MAIN_HIGHWAY";
      geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
        const props = feature?.properties || {};
        if (props.is_visible === false) return;
        const geometry = feature?.geometry;
        const code = routeCodeOf(props);
        if (!code || !geometry || !["LineString", "MultiLineString"].includes(geometry.type)) return;
        const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : layerIsMain;
        const line = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat(1);
        const midpoint = line[Math.floor(line.length / 2)];
        if (!midpoint) return;
        items.push({ code: String(code), name: String(routeNameOf(props)), latlng: toLeafletLatLng(midpoint), isMain: featureIsMain });
      });
    });
    return items;
  }, [systemData.highwayLayers]);

  // Set of highway numbers that currently have active flood or detour incidents (must remain visible even when zoomed out)
  const criticalHighwayRouteNos = useMemo(() => {
    const set = new Set<string>();
    (systemData.floodRoutes || []).forEach((f) => {
      if (f.is_active && f.route_no) {
        set.add(String(f.route_no).replace(/^ทล\.?/i, "").trim());
      }
    });
    return set;
  }, [systemData.floodRoutes]);

  // 4a. Highway network (Zoom-dependent rendering per Item 1: Zoom < 11 hides secondary highways unless they have active critical incidents or forceShowAllHighways is toggled).
  const showSecondaryAtCurrentZoom = forceShowAllHighways || currentZoom >= 11;

  useEffect(() => {
    const L = leafletRef.current;
    const group = highwayGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    const renderer = rendererRef.current;
    const isLowZoom = currentZoom < 11;

    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible || !layer.geojson_data) return;
      const isMain = layer.layer_id === "MAIN_HIGHWAY";
      const style = isMain ? mapStyles.primary : mapStyles.secondary;
      const color = style?.color || (isMain ? "#1B5E20" : "#0284c7");
      const weight = style?.weight || (isMain ? 5 : 3.5);
      const opacity = style?.opacity ?? 0.85;
      const className = lineAnimationClasses(style, allowLineAnimationRef.current);

    const shouldShowFeature = (feature: any) => {
      if (feature?.properties?.is_visible === false) return false;
      const type = feature?.properties?.highway_type;
      const featureIsMain = type === "MAIN_HIGHWAY" ? true : type === "SECOND_HIGHWAY" ? false : isMain;
      if (featureIsMain) return showMainHwy;
      if (!showSecHwy) return false;
      if (showSecondaryAtCurrentZoom) return true;
      const code = String(routeCodeOf(feature?.properties)).replace(/^ทล\.?/i, "").trim();
      return Boolean(code && criticalHighwayRouteNos.has(code));
    };

    const highwayForegroundStyle = (feature: any) => {
      const props = feature?.properties || {};
      const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;
      const featureStyle = featureIsMain ? mapStyles.primary : mapStyles.secondary;
      let featureWeight = featureStyle?.weight || weight;
      if (props.lanes) {
        const lanesStr = String(props.lanes);
        if (lanesStr.includes("๘") || lanesStr.includes("8")) featureWeight = 8.5;
        else if (lanesStr.includes("๖") || lanesStr.includes("6")) featureWeight = 7.5;
        else if (lanesStr.includes("๔") || lanesStr.includes("4")) featureWeight = 5.5;
        else if (lanesStr.includes("๒") || lanesStr.includes("2")) featureWeight = 3.5;
      }
      if (isLowZoom) featureWeight = Math.max(2, featureWeight * 0.8);
      return { featureStyle, featureWeight };
    };

      try {
      // Casing is a separate non-interactive Canvas path.  It must be drawn
      // before the foreground GeoJSON so clicks and labels stay on the road.
      const hasHighwayCasing = [mapStyles.primary, mapStyles.secondary].some(
        (item) => item?.borderActive && Number(item.borderWidth) > 0,
      );
      if (hasHighwayCasing) {
        L.geoJSON(layer.geojson_data, {
          renderer,
          interactive: false,
          filter: (feature: any) => {
            const { featureStyle } = highwayForegroundStyle(feature);
            return shouldShowFeature(feature) && Boolean(featureStyle?.borderActive && Number(featureStyle.borderWidth) > 0);
          },
          style: (feature: any) => {
            const { featureStyle, featureWeight } = highwayForegroundStyle(feature);
            const borderWidth = Math.max(0, Number(featureStyle?.borderWidth) || 0);
            return {
              color: featureStyle?.borderColor || "#ffffff",
              weight: featureWeight + borderWidth * 2,
              opacity: featureStyle?.opacity ?? opacity,
              interactive: false,
            };
          },
        }).addTo(group);
      }
        const geoLayer = L.geoJSON(layer.geojson_data, {
          renderer,
          filter: shouldShowFeature,
          style: (feature: any) => {
            const { featureStyle, featureWeight } = highwayForegroundStyle(feature);
            return {
              color: featureStyle?.color || color,
              weight: featureWeight,
              opacity: featureStyle?.opacity ?? opacity,
              dashArray: dashArrayFor(featureStyle),
              className,
            };
          },
          onEachFeature: (feature: any, featureLayer: any) => {
            const props = feature.properties || {};
            const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;

            // Tooltip text is produced only when the tooltip opens.
            if (showRoadLabels) {
              featureLayer.bindTooltip(() => {
                const code = routeCodeOf(props);
                const name = routeNameOf(props);
                return escapeHtml(code ? `ทล.${code} • ${name}` : name);
              }, { sticky: true, className: "doh-map-tooltip" });
            }

            // One click handler per feature, no per-feature popup object or popup HTML.
            // Editing commands take precedence over the normal road popup.
            featureLayer.on("click", (event: any) => {
              const map = leafletMapRef.current;
              if (!map) return;
              const mode = adminPickModeRef.current;
              if (mode) {
                L.DomEvent.stopPropagation(event);
                map.closePopup();
                onCoordinatePickedRef.current?.(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)), mode);
                return;
              }
              map.openPopup(buildHighwayPopupHtml(props, featureIsMain, color), event.latlng);
            });
          },
        }).addTo(group);
        geoLayer.bringToBack();
      } catch (error) {
        console.warn("[LongdoGisMap] Skipped invalid highway layer:", layer.layer_id, error);
      }
    });

    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.highwayLayers, mapStyles, showMainHwy, showSecHwy, showRoadLabels, showSecondaryAtCurrentZoom, criticalHighwayRouteNos, currentZoom]);

  // 4b. Highway shield labels - viewport-limited, grid-based collision check, redrawn on pan/zoom.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = shieldGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    if (!showHighwayShields) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      group.clearLayers();
      const z = map.getZoom();
      if (z < 10) return;
      const viewport = map.getBounds().pad(0.25);
      const occupied: Record<string, Array<{ x: number; y: number }>> = {};
      let drawn = 0;

      for (const item of shieldCandidates) {
        if (drawn >= MAX_VISIBLE_SHIELDS) break;
        if (item.isMain ? !showMainHwy : !showSecHwy) continue;
        if (!item.isMain && z < 11 && !forceShowAllHighways && !criticalHighwayRouteNos.has(item.code.replace(/^ทล\.?/i, "").trim())) continue;
        if (!viewport.contains(item.latlng)) continue;
        const point = map.latLngToContainerPoint(item.latlng);
        const cellX = Math.floor(point.x / 48);
        const cellY = Math.floor(point.y / 28);
        let collides = false;
        for (let dx = -1; dx <= 1 && !collides; dx++) {
          for (let dy = -1; dy <= 1 && !collides; dy++) {
            const bucket = occupied[`${cellX + dx}:${cellY + dy}`];
            if (bucket && bucket.some((other) => Math.abs(other.x - point.x) < 48 && Math.abs(other.y - point.y) < 28)) collides = true;
          }
        }
        if (collides) continue;
        const key = `${cellX}:${cellY}`;
        if (!occupied[key]) occupied[key] = [];
        occupied[key].push({ x: point.x, y: point.y });

        const signIcon = L.divIcon({
          html: `<div style="width:28px;height:18px;background:#fff;border:1px solid #64748b;border-radius:3px;color:#334155;text-align:center;line-height:16px;font-size:10px;font-weight:600">${escapeHtml(item.code)}</div>`,
          className: "doh-highway-sign",
          iconSize: [28, 18],
          iconAnchor: [14, 9],
        });
        const sign = L.marker(item.latlng, { icon: signIcon, interactive: true }).addTo(group);
        sign.bindTooltip(`ทล.${escapeHtml(item.code)} · ${escapeHtml(item.name)}`, { direction: "top", offset: [0, -18] });
        sign.bindPopup(() => `<div style="padding-top:5px"><strong>ทล.${escapeHtml(item.code)}</strong><br/>${escapeHtml(item.name)}</div>`);
        drawn++;
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 150);
    };

    draw();
    map.on("moveend zoomend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend zoomend", schedule);
      group.clearLayers();
    };
  }, [mapReady, shieldCandidates, showHighwayShields, showMainHwy, showSecHwy, forceShowAllHighways, criticalHighwayRouteNos]);

  // 4c. Detour routes (Supports A->B, B->A asymmetric carriageways & one-way detours per Item 4)
  useEffect(() => {
    const L = leafletRef.current;
    const group = detourGroupRef.current;
    detourLinesRef.current = [];
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowDetourLayer) return;
    const renderer = rendererRef.current;
    const detourStyle = mapStyles.detour;
    const dColor = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
    const dDash = detourStyle?.pattern === "solid" ? undefined : (detourStyle?.dashArray || LAYER_CONFIG.DETOUR_YELLOW_LINE.dashArray);
    const className = lineAnimationClasses(detourStyle, allowLineAnimationRef.current);

    (systemData.detourRoutes || []).forEach((detour) => {
      if (!detour.is_active) return;
      const dirMode = detour.direction_mode || "TWO_WAY";
      const fwdCoords = parseRouteCoordinates(detour.coordinates_json);
      const revCoords = parseRouteCoordinates(detour.reverse_coordinates_json);

      const linkedFlood = detour.flood_id_ref
        ? (systemData.floodRoutes || []).find((f) => f.id === detour.flood_id_ref)
        : null;
      const linkedMeta = linkedFlood ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood) : null;
      const defaultDir: "FORWARD" | "REVERSE" =
        linkedMeta?.directionCode === "B_TO_A" || detour.direction_mode === "REVERSE_ONLY"
          ? "REVERSE"
          : "FORWARD";

      // Draw forward A->B line if mode is TWO_WAY or FORWARD_ONLY
      if (dirMode !== "REVERSE_ONLY" && fwdCoords.length >= 2) {
        const latLngs = fwdCoords.map(toLeafletLatLng);
        const forwardWeight = detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight;
        addLineCasing(L, group, latLngs, detourStyle || {}, forwardWeight, renderer);
        const polyline = L.polyline(latLngs as any, {
          color: dColor,
          weight: forwardWeight,
          dashArray: dDash,
          opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
          className,
          renderer,
        }).addTo(group);
        detourLinesRef.current.push({
          line: polyline,
          baseWeight: detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight,
          baseOpacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
        });
        const detourPopupOpts = { maxWidth: 440, minWidth: 320, className: "doh-detour-leaflet-popup" };
        polyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData.floodRoutes || []), detourPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          polyline.openPopup(e.latlng);
        });

        const midPoint = latLngs[Math.floor(latLngs.length / 2)];
        const detourIcon = L.divIcon({
          html: `<div class="doh-route-symbol" style="width:30px;height:30px;border-radius:9px;background:${dColor};color:#0f172a;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(15,23,42,.45)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg></div>`,
          className: "doh-detour-symbol",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const detourMarker = L.marker(midPoint, { icon: detourIcon, interactive: true }).bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData.floodRoutes || []), detourPopupOpts).addTo(group);
        detourMarker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          detourMarker.openPopup();
        });
      }

      // Draw reverse B->A line if present and distinct (or when REVERSE_ONLY)
      if (dirMode !== "FORWARD_ONLY") {
        const effectiveRev = revCoords.length >= 2 ? revCoords : (dirMode === "REVERSE_ONLY" ? fwdCoords : []);
        if (effectiveRev.length >= 2) {
          const revLatLngs = effectiveRev.map(toLeafletLatLng);
          const revColor = dirMode === "REVERSE_ONLY" ? dColor : (detour.detour_meta?.arrow_color_reverse || "#38bdf8");
          const reverseWeight = Math.max(3.5, (detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) - 0.5);
          addLineCasing(L, group, revLatLngs, detourStyle || {}, reverseWeight, renderer);
          const revPolyline = L.polyline(revLatLngs as any, {
            color: revColor,
            weight: reverseWeight,
            dashArray: dDash || "6, 6",
            opacity: detourStyle?.opacity ?? 0.9,
            renderer,
          }).addTo(group);
          detourLinesRef.current.push({
            line: revPolyline,
            baseWeight: Math.max(3.5, (detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) - 0.5),
            baseOpacity: detourStyle?.opacity ?? 0.9,
          });
          const revPopupOpts = { maxWidth: 440, minWidth: 320, className: "doh-detour-leaflet-popup" };
          revPolyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData.floodRoutes || []), revPopupOpts);
          revPolyline.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            revPolyline.openPopup(e.latlng);
          });
        }
      }
    });

    // Keep stacking order: highways (bottom) < detours < floods < drafts.
    raisePathLayers(group, floodGroupRef.current, draftGroupRef.current);
    return () => {
      detourLinesRef.current = [];
      group.clearLayers();
    };
  }, [mapReady, systemData.detourRoutes, effectiveShowDetourLayer, mapStyles]);

  // 4d. Flood routes + capsule markers (Item 3: Hide flood line from current map when confirmed water_level_cm === 0, while preserving DB history).
  useEffect(() => {
    const L = leafletRef.current;
    const group = floodGroupRef.current;
    floodLinesRef.current = {};
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowFloodLayer) return;
    const renderer = rendererRef.current;
    const floodStyle = mapStyles.flood;
    const fColor = floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
    const fBaseWeight = floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight;
    const fOpacity = floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity;
    const fDash = floodStyle?.pattern === "dash" ? (floodStyle.dashArray || "8, 6") : undefined;
    const className = lineAnimationClasses(floodStyle, allowLineAnimationRef.current);

    const activeDetours = (systemData.detourRoutes || []).filter((d) => d.is_active);
    const countDetoursForFlood = (flood: FloodRoute) => {
      const fMeta = parseFloodDirectionMeta(flood.direction_meta, flood);
      return activeDetours.filter(
        (d) => d.flood_id_ref === flood.id || (d.detour_meta?.eventId && fMeta?.eventId && d.detour_meta.eventId === fMeta.eventId)
      ).length;
    };
    const floodPopupOpts = { maxWidth: 370, minWidth: 300, className: "doh-flood-leaflet-popup" };

    // 4d. Flood routes + capsule markers (with De-overlapping, Priority z-Index & Merged/Segment modes)
    const visibleFloodIdSet = visibleFloodIds ? new Set(visibleFloodIds) : null;
    const visibleFloods = (systemData.floodRoutes || []).filter(
      (flood) => isFloodLineVisibleOnCurrentMap(flood) && (!visibleFloodIdSet || visibleFloodIdSet.has(flood.id))
    );

    // First draw polylines for all visible flood routes using configured unified line style
    visibleFloods.forEach((flood) => {
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        const selectedWeight = fBaseWeight + (flood.id === selectedFloodIdRef.current ? 1.5 : 0);
        const latLngs = coords.map(toLeafletLatLng);
        const casing = addLineCasing(L, group, latLngs, floodStyle || {}, selectedWeight, renderer);
        const polyline = L.polyline(coords.map(toLeafletLatLng) as any, {
          color: fColor,
          weight: selectedWeight,
          opacity: fOpacity,
          dashArray: fDash,
          className,
          renderer,
        }).addTo(group);
        floodLinesRef.current[flood.id] = {
          line: polyline,
          baseWeight: fBaseWeight,
          casing,
          baseBorderWidth: Number(floodStyle?.borderWidth) || 0,
        };
        polyline.bindPopup(() => buildFloodPopupHtml(flood, countDetoursForFlood(flood)), floodPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          polyline.openPopup(e.latlng);
        });
      }
    });

    if (floodDisplayMode === "EVENTS") {
      // Merged parent event capsule markers
      const parentEvents = groupFloodRoutesIntoEvents(visibleFloods);
      parentEvents.forEach((ev) => {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        ev.segments.forEach((seg) => {
          const coords = parseRouteCoordinates(seg.coordinates_json);
          const mid = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
          const lat = mid ? mid[1] : (seg.lat_start || APP_CONFIG.DEFAULT_CENTER.lat);
          const lon = mid ? mid[0] : (seg.lon_start || APP_CONFIG.DEFAULT_CENTER.lon);
          sumLat += lat;
          sumLon += lon;
          count++;
        });
        const centerLat = count > 0 ? sumLat / count : APP_CONFIG.DEFAULT_CENTER.lat;
        const centerLon = count > 0 ? sumLon / count : APP_CONFIG.DEFAULT_CENTER.lon;

        let zIndex = 200;
        let capsuleClass = "doh-capsule-tag doh-capsule-amber";
        let glyphIcon = "⚠️";

        if (ev.mostSevereStatus === "CLOSED") {
          capsuleClass = "doh-capsule-tag doh-capsule-red";
          glyphIcon = "⛔";
          zIndex = 1000;
        } else if (ev.mostSevereStatus === "NO_SMALL_VEHICLES") {
          capsuleClass = "doh-capsule-tag doh-capsule-orange";
          glyphIcon = "🚗";
          zIndex = 800;
        } else if (ev.mostSevereStatus === "CAUTION") {
          capsuleClass = "doh-capsule-tag doh-capsule-amber";
          glyphIcon = "⚠️";
          zIndex = 600;
        } else if (ev.mostSevereStatus === "PASSABLE") {
          capsuleClass = "doh-capsule-tag doh-capsule-green";
          glyphIcon = "✅";
          zIndex = 200;
        } else if (ev.mostSevereStatus === "PENDING_VERIFICATION") {
          capsuleClass = "doh-capsule-tag doh-capsule-slate";
          glyphIcon = "⏳";
          zIndex = 400;
        }

        const pinIcon = L.divIcon({
          html: `
            <div class="${capsuleClass}">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-[11px] font-bold shadow-sm" aria-hidden="true">${glyphIcon}</span>
              <span>ทล.${escapeHtml(ev.routeNo)} [${ev.segments.length} ช่วง]</span>
              <span class="opacity-90">(${escapeHtml(ev.maxWaterLevelCm)} ซม.)</span>
            </div>
          `,
          className: "doh-map-capsule-pin",
          iconSize: [140, 28],
          iconAnchor: [70, 14],
        });

        const primarySeg = ev.segments[0];
        const marker = L.marker([centerLat, centerLon], { icon: pinIcon, zIndexOffset: zIndex }).addTo(group);
        marker.bindPopup(() => buildFloodPopupHtml(primarySeg, countDetoursForFlood(primarySeg)), floodPopupOpts);
        marker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          marker.openPopup();
        });
      });
    } else {
      // Individual segment markers with smart de-overlapping & priority z-index
      type MarkerCandidate = {
        flood: FloodRoute;
        lat: number;
        lon: number;
        dirCode: string;
        zIndex: number;
        capsuleClass: string;
        glyphIcon: string;
        statusLabel: string;
        sideBadge: string;
        levelText: string;
      };

      const candidates: MarkerCandidate[] = visibleFloods.map((flood) => {
        const coords = parseRouteCoordinates(flood.coordinates_json);
        const midCoord = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
        const lat = midCoord ? midCoord[1] : (flood.lat_start || APP_CONFIG.DEFAULT_CENTER.lat);
        const lon = midCoord ? midCoord[0] : (flood.lon_start || APP_CONFIG.DEFAULT_CENTER.lon);

        const meta = flood.direction_meta;
        const trafficDetail = meta?.trafficStatusDetail;
        const waterKnown = meta?.water_level_known !== false;
        const levelText = waterKnown ? `${flood.water_level_cm} ซม.` : "รอวัดระดับน้ำ";

        let zIndex = 200;
        let capsuleClass = "doh-capsule-tag doh-capsule-amber";
        let glyphIcon = "⚠️";
        let statusLabel = "เฝ้าระวัง / ระมัดระวัง";

        if (trafficDetail === "PENDING_VERIFICATION" || (flood.traffic_status as string) === "PENDING_VERIFICATION") {
          capsuleClass = "doh-capsule-tag doh-capsule-slate";
          glyphIcon = "⏳";
          statusLabel = "รอตรวจสอบสถานะ";
          zIndex = 400;
        } else if (trafficDetail === "NO_SMALL_VEHICLES") {
          capsuleClass = "doh-capsule-tag doh-capsule-orange";
          glyphIcon = "🚗";
          statusLabel = "รถเล็กไม่สามารถผ่านได้";
          zIndex = 800;
        } else if (flood.traffic_status === "CLOSED" || trafficDetail === "CLOSED") {
          capsuleClass = "doh-capsule-tag doh-capsule-red";
          glyphIcon = "⛔";
          statusLabel = "ผ่านไม่ได้";
          zIndex = 1000;
        } else if (flood.traffic_status === "LIGHT_VEHICLES_ONLY") {
          capsuleClass = "doh-capsule-tag doh-capsule-sky";
          glyphIcon = "🚗";
          statusLabel = "รถเล็กผ่านได้";
          zIndex = 600;
        } else if (flood.traffic_status === "ONE_LANE") {
          capsuleClass = "doh-capsule-tag doh-capsule-amber";
          glyphIcon = "↔️";
          statusLabel = "รถเล็กผ่านได้ ๑ ช่องทาง";
          zIndex = 600;
        } else if (flood.traffic_status === "WARNING" || trafficDetail === "CAUTION") {
          capsuleClass = "doh-capsule-tag doh-capsule-amber";
          glyphIcon = "⚠️";
          statusLabel = "รถเล็กไม่สามารถผ่านได้";
          zIndex = 800;
        } else if (flood.traffic_status === "PASSABLE" || trafficDetail === "PASSABLE") {
          capsuleClass = "doh-capsule-tag doh-capsule-green";
          glyphIcon = "✅";
          statusLabel = "ผ่านได้ปกติ";
          zIndex = 200;
        }

        // Never guess a missing direction as two-way: unknown stays UNKNOWN (no side badge, no lateral offset by direction).
        const dirCode = meta?.directionCode || (flood.road_side === "LEFT" ? "A_TO_B" : flood.road_side === "RIGHT" ? "B_TO_A" : flood.road_side === "BOTH" ? "BOTH" : "UNKNOWN");
        const sideBadge = dirCode === "A_TO_B"
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
          glyphIcon,
          statusLabel,
          sideBadge,
          levelText,
        };
      });

      // Cluster candidates within proximity (< ~35m or 0.00035 deg) to prevent stacking
      const clusters: MarkerCandidate[][] = [];
      const assigned = new Set<number>();

      for (let i = 0; i < candidates.length; i++) {
        if (assigned.has(i)) continue;
        const c1 = candidates[i];
        const groupList: MarkerCandidate[] = [c1];
        assigned.add(i);

        for (let j = i + 1; j < candidates.length; j++) {
          if (assigned.has(j)) continue;
          const c2 = candidates[j];
          const distLat = Math.abs(c1.lat - c2.lat);
          const distLon = Math.abs(c1.lon - c2.lon);
          const isSameEvent = Boolean(c1.flood.direction_meta?.eventId && c1.flood.direction_meta.eventId === c2.flood.direction_meta?.eventId);
          if ((distLat < 0.00035 && distLon < 0.00045) || (isSameEvent && distLat < 0.0008 && distLon < 0.0008)) {
            groupList.push(c2);
            assigned.add(j);
          }
        }
        clusters.push(groupList);
      }

      clusters.forEach((cluster) => {
        const count = cluster.length;
        cluster.forEach((item, idx) => {
          let renderLat = item.lat;
          let renderLon = item.lon;

          if (count === 2) {
            // Smart lateral offset for dual carriageways (A->B vs B->A)
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

          // 3-Tier Zoom Adaptive Markers (P6-03: Compact Flood Marker)
          let pinHtml = "";
          let pinSize: [number, number] = [130, 28];
          let pinAnchor: [number, number] = [65, 14];

          if (currentZoom <= 10) {
            // ซูมไกล: แสดงเฉพาะไอคอนสถานะในทรงกลมกะทัดรัด 28x28px
            pinSize = [28, 28];
            pinAnchor = [14, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-far" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                <span class="text-xs font-bold leading-none" aria-hidden="true">${item.glyphIcon}</span>
              </div>
            `;
          } else if (currentZoom >= 11 && currentZoom <= 13) {
            // ซูมกลาง: แสดงไอคอนสถานะ + หมายเลขทางหลวง
            pinSize = [96, 28];
            pinAnchor = [48, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-mid" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-[11px] font-bold shadow-sm" aria-hidden="true">${item.glyphIcon}</span>
                <span>ทล.${escapeHtml(item.flood.route_no)}</span>
              </div>
            `;
          } else {
            // ซูมใกล้: ไอคอนสถานะ + ทล. + ระดับน้ำ (เช่น ⚠ ทล.4075 · 60 ซม.) — สีมาจากสถานะที่เจ้าหน้าที่บันทึก ไม่คำนวณจากระดับน้ำ
            const isPending = item.statusLabel === "รอตรวจสอบสถานะ";
            pinSize = [isPending ? 244 : 168, 28];
            pinAnchor = [isPending ? 122 : 84, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-near" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-[11px] font-bold shadow-sm" aria-hidden="true">${item.glyphIcon}</span>
                <span>ทล.${escapeHtml(item.flood.route_no)}</span>
                <span class="opacity-95 font-mono text-[11px]">· ${escapeHtml(item.levelText)}</span>
                ${isPending ? '<span class="bg-black/25 px-1.5 py-0.5 rounded text-[10px] font-bold">รอตรวจสอบ</span>' : ""}
              </div>
            `;
          }

          const pinIcon = L.divIcon({
            html: pinHtml,
            className: "doh-map-capsule-pin",
            iconSize: pinSize,
            iconAnchor: pinAnchor,
          });

          const marker = L.marker([renderLat, renderLon], {
            icon: pinIcon,
            zIndexOffset: item.zIndex,
          }).addTo(group);

          marker.bindPopup(() => buildFloodPopupHtml(item.flood, countDetoursForFlood(item.flood)), floodPopupOpts);
          marker.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            marker.openPopup();
          });
        });
      });
    }

    raisePathLayers(group, draftGroupRef.current);
    return () => {
      group.clearLayers();
      floodLinesRef.current = {};
    };
  }, [mapReady, systemData.floodRoutes, systemData.detourRoutes, effectiveShowFloodLayer, floodDisplayMode, mapStyles, currentZoom, visibleFloodIds]);

  // Leaflet's Canvas renderer intentionally ignores CSS class animation. Animate only
  // the already-drawn flood/detour paths at a low fixed rate, so the style editor's
  // motion settings are visible without changing renderer or rebuilding GIS layers.
  useEffect(() => {
    if (!mapReady || !allowLineAnimation) return;
    const floodStyle = mapStyles.flood;
    const detourStyle = mapStyles.detour;
    const floodAnimation = floodStyle?.animation || "none";
    const detourAnimation = detourStyle?.animation || "none";
    if (floodAnimation === "none" && detourAnimation === "none") return;

    const entries = [
      ...Object.values(floodLinesRef.current).map((entry) => ({
        ...entry,
        baseOpacity: floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity,
        animation: floodAnimation,
      })),
      ...detourLinesRef.current.map((entry) => ({ ...entry, animation: detourAnimation })),
    ].filter((entry) => entry.line && entry.animation !== "none");
    if (entries.length === 0) return;

    let phase = 0;
    const tick = () => {
      phase = (phase + 1) % 200;
      entries.forEach((entry) => {
        const speed = entry.animation === "blink" ? 1.8 : entry.animation === "pulse" ? 0.7 : 1.2;
        const wave = (Math.sin(phase * speed * 0.35) + 1) / 2;
        if (entry.animation === "pulse") {
          entry.line.setStyle({ opacity: Math.max(0.35, entry.baseOpacity * (0.62 + wave * 0.38)), weight: entry.baseWeight + wave * 0.8 });
        } else if (entry.animation === "blink") {
          entry.line.setStyle({ opacity: wave > 0.45 ? entry.baseOpacity : Math.max(0.25, entry.baseOpacity * 0.42) });
        } else {
          // Chaser/arrows move the existing dash pattern; Canvas supports dashOffset
          // while avoiding a new DOM/SVG element per route.
          entry.line.setStyle({ dashOffset: String(-phase * (entry.animation === "arrows" ? 2 : 1.2)) });
        }
      });
    };
    tick();
    const timer = window.setInterval(tick, 140);
    return () => {
      window.clearInterval(timer);
      entries.forEach((entry) => entry.line.setStyle({ opacity: entry.baseOpacity, weight: entry.baseWeight, dashOffset: "0" }));
    };
  }, [mapReady, allowLineAnimation, mapStyles, systemData.floodRoutes, systemData.detourRoutes, showFloodLayer, showDetourLayer, visibleFloodIds]);

  // 4e. Selected flood: restyle one polyline in place instead of redrawing the map.
  useEffect(() => {
    Object.entries(floodLinesRef.current).forEach(([id, entry]) => {
      const selectedDelta = id === selectedFloodId ? 1.5 : 0;
      entry.line.setStyle({ weight: entry.baseWeight + selectedDelta });
      entry.casing?.setStyle({ weight: entry.baseWeight + selectedDelta + (entry.baseBorderWidth || 0) * 2 });
    });
  }, [selectedFloodId, mapReady, systemData.floodRoutes, showFloodLayer, mapStyles]);

  // 4f. Admin draft route (A->B and B->A), conflict alerts, imported-GIS preview and draggable markers.
  useEffect(() => {
    const L = leafletRef.current;
    const group = draftGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    draftLineRef.current = null;
    const renderer = rendererRef.current;

    // Blue dashed preview of the GIS file being imported / geometry being edited
    incomingGisLines.forEach((line) => {
      if (line.length < 2) return;
      L.polyline(line.map(toLeafletLatLng) as any, {
        color: "#0284c7",
        weight: 5,
        dashArray: "6, 6",
        opacity: 0.95,
        renderer,
      }).addTo(group);
    });

    // Snapped draft route (Primary / Forward A->B)
    if (draftCoordinates.length >= 2) {
      const draftColor = draftMode === "FLOOD"
        ? (mapStyles.flood?.color || "#ef4444")
        : (mapStyles.detour?.color || "#f59e0b");
      const draftLine = L.polyline(draftCoordinates.map(toLeafletLatLng) as any, {
        color: draftColor,
        weight: 6,
        dashArray: draftMode === "FLOOD"
          ? (mapStyles.flood?.pattern === "dash" ? (mapStyles.flood.dashArray || "8, 6") : undefined)
          : (mapStyles.detour?.pattern === "solid" ? undefined : (mapStyles.detour?.dashArray || "8, 6")),
        opacity: 0.95,
        renderer,
      }).addTo(group);
      draftLineRef.current = draftLine;
      draftLine.on("click", (event: any) => {
        if (adminPickModeRef.current !== "ADD_WAYPOINT") return;
        L.DomEvent.stopPropagation(event);
        const point = event.latlng;
        onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), "ADD_WAYPOINT");
      });
    }

    // Snapped reverse draft route (B->A for Detour or Dual Carriageway preview)
    if (draftReverseCoordinates.length >= 2) {
      const revDraftLine = L.polyline(draftReverseCoordinates.map(toLeafletLatLng) as any, {
        color: "#38bdf8",
        weight: 5,
        dashArray: "6, 6",
        opacity: 0.95,
        renderer,
      }).addTo(group);
      revDraftLine.on("click", (event: any) => {
        if (adminPickModeRef.current !== "ADD_REVERSE_WAYPOINT") return;
        L.DomEvent.stopPropagation(event);
        const point = event.latlng;
        onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), "ADD_REVERSE_WAYPOINT");
      });
    }

    // Closed-road conflict warning markers on draft detour
    draftConflictPoints.forEach((pt, idx) => {
      const [lat, lng] = toLeafletLatLng(pt);
      const conflictIcon = L.divIcon({
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;box-shadow:0 0 12px rgba(220,38,38,0.9)">!</div>`,
        className: "doh-conflict-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([lat, lng], { icon: conflictIcon, zIndexOffset: 1500 })
        .bindTooltip(`⚠️ จุดตัดผ่านถนนที่ปิดการจราจร (#${idx + 1}) — ห้ามใช้เส้นทางนี้`, { direction: "top" })
        .addTo(group);
    });

    // Start / end pick markers (A / B)
    draftPickMarkers.forEach((point) => {
      const icon = L.divIcon({
        html: `<div class="w-7 h-7 rounded-full bg-sky-500 text-white border-2 border-white font-heading font-black text-xs flex items-center justify-center shadow-lg">${escapeHtml(point.label)}</div>`,
        className: "doh-draft-endpoint",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([point.lat, point.lon], { icon, zIndexOffset: 1200, draggable: true }).bindTooltip(`จุด${point.label}`, { direction: "top" }).addTo(group);
      marker.on("dragend", (event: any) => {
        const position = event.target.getLatLng();
        onCoordinatePickedRef.current?.(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)), point.mode);
      });
    });

    // Numbered draggable waypoints for forward path (A->B)
    draftWaypoints.forEach((wp, idx) => {
      const wpIcon = L.divIcon({
        html: `<div class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 border-2 border-slate-950 font-heading font-black text-[11px] flex items-center justify-center shadow-lg cursor-move">${idx + 1}</div>`,
        className: "doh-wp-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const wpMarker = L.marker([wp[1], wp[0]], { icon: wpIcon, draggable: true }).addTo(group);
      wpMarker.bindTooltip(`จุดดัดขาไป A→B ที่ ${idx + 1} (ลากหมุดเพื่อขยับแนวถนน)`, { direction: "top" });
      wpMarker.on("dragend", (ev: any) => {
        const pos = ev.target.getLatLng();
        onWaypointDraggedRef.current?.(idx, [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))]);
      });
    });

    // Numbered draggable waypoints for reverse path (B->A)
    draftReverseWaypoints.forEach((wp, idx) => {
      const wpIcon = L.divIcon({
        html: `<div class="w-6 h-6 rounded-full bg-sky-400 text-slate-950 border-2 border-slate-950 font-heading font-black text-[11px] flex items-center justify-center shadow-lg cursor-move">R${idx + 1}</div>`,
        className: "doh-wp-rev-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const wpMarker = L.marker([wp[1], wp[0]], { icon: wpIcon, draggable: true }).addTo(group);
      wpMarker.bindTooltip(`จุดดัดขากลับ B→A ที่ ${idx + 1} (ลากหมุดเพื่อขยับแนวถนน)`, { direction: "top" });
      wpMarker.on("dragend", (ev: any) => {
        const pos = ev.target.getLatLng();
        onReverseWaypointDraggedRef.current?.(idx, [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))]);
      });
    });

    raisePathLayers(group);
    return () => {
      draftLineRef.current = null;
      group.clearLayers();
    };
  }, [mapReady, incomingGisLines, draftCoordinates, draftReverseCoordinates, draftWaypoints, draftReverseWaypoints, draftConflictPoints, draftPickMarkers, draftMode, mapStyles]);

  // 4f-arrows. Directional Arrow System (Items 2 & 4): Viewport-culled, zoom-gated directional arrows for highways, detours, and active draft previews.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = arrowGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const MAX_ARROWS = 160;

    const placeArrowsOnLine = (
      coords: [number, number][],
      direction: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN",
      color: string,
      sizePx: number,
      spacingPx: number,
      bgBadge: string | null,
      viewport: any,
      counter: { count: number }
    ) => {
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
    };

    const drawArrows = () => {
      group.clearLayers();
      const z = map.getZoom();
      const viewport = map.getBounds().pad(0.15);
      const counter = { count: 0 };

      // 1. Draft preview arrows (always shown at zoom >= 11 so admin can inspect before saving)
      if (z >= 11 && draftCoordinates.length >= 2) {
        const isDetourDraft = draftMode === "DETOUR";
        const effectiveDir = draftReverseCoordinates.length >= 2 ? "FORWARD" : draftDirectionMeta;
        placeArrowsOnLine(
          draftCoordinates,
          effectiveDir,
          isDetourDraft ? "#0f172a" : "#ffffff",
          13,
          110,
          isDetourDraft ? "#f59e0b" : "#0284c7",
          viewport,
          counter
        );
      }
      if (z >= 11 && draftReverseCoordinates.length >= 2) {
        placeArrowsOnLine(
          draftReverseCoordinates,
          "FORWARD",
          "#0f172a",
          13,
          110,
          "#38bdf8",
          viewport,
          counter
        );
      }

      // 2. Active Detour Route Arrows (Item 4)
      const detourStyle = mapStyles.detour;
      const showDetourArrows = detourStyle?.showArrows ?? true;
      const detourMinZoom = detourStyle?.arrowMinZoom ?? 11;
      if (showDetourLayer && showDetourArrows && z >= detourMinZoom) {
        const dArrowColor = detourStyle?.arrowColor || "#0f172a";
        const dArrowSize = detourStyle?.arrowSize || 12;
        const dArrowSpacing = detourStyle?.arrowSpacingPx || 120;
        const dBadgeBg = detourStyle?.color || "#FBC02D";

        (systemData.detourRoutes || []).forEach((detour) => {
          if (!detour.is_active) return;
          if (detour.detour_meta?.show_arrows === false) return;
          const dirMode = detour.direction_mode || "TWO_WAY";
          const fwd = parseRouteCoordinates(detour.coordinates_json);
          const rev = parseRouteCoordinates(detour.reverse_coordinates_json);

          if (dirMode === "FORWARD_ONLY") {
            placeArrowsOnLine(fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
          } else if (dirMode === "REVERSE_ONLY") {
            const target = rev.length >= 2 ? rev : fwd;
            placeArrowsOnLine(target, rev.length >= 2 ? "FORWARD" : "REVERSE", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
          } else {
            if (rev.length >= 2) {
              placeArrowsOnLine(fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
              placeArrowsOnLine(rev, "FORWARD", "#0f172a", dArrowSize, dArrowSpacing, "#38bdf8", viewport, counter);
            } else {
              placeArrowsOnLine(fwd, "TWO_WAY", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
            }
          }
        });
      }

      // 3. Highway Network Arrows (Item 2: Only draw on features with explicit directional metadata or when zoomed in >= 12)
      const priStyle = mapStyles.primary;
      const secStyle = mapStyles.secondary;
      if (z >= 12) {
        (systemData.highwayLayers || []).forEach((layer) => {
          if (!layer.is_visible || !layer.geojson_data) return;
          const isMain = layer.layer_id === "MAIN_HIGHWAY";
          geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
            const props = feature?.properties || {};
            if (props.is_visible === false) return;
            const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;
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
                  : props.arrow_direction === "TWO_WAY" || props.carriageway_type === "SINGLE_CENTERLINE" || props.lanes?.includes("2") || props.lanes?.includes("๒")
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
              placeArrowsOnLine(lineCoords, dirMeta, arrowColor, arrowSize, arrowSpacing, null, viewport, counter);
            });
          });
        });
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(drawArrows, 150);
    };

    drawArrows();
    map.on("moveend zoomend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend zoomend", schedule);
      group.clearLayers();
    };
  }, [mapReady, systemData.highwayLayers, systemData.detourRoutes, mapStyles, showMainHwy, showSecHwy, showDetourLayer, showSecondaryAtCurrentZoom, draftCoordinates, draftReverseCoordinates, draftDirectionMeta, draftMode]);

  // 4h. Freeform vertex editor: draggable handle on every vertex + "+" handle on every segment middle.
  // Only vertices inside the viewport are drawn (at most MAX_VERTEX_HANDLES), so long lines stay fast.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = vertexGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    const geometryToEdit = vertexEditCoordinates ?? draftCoordinates;
    if (!vertexEditable || geometryToEdit.length < 2) return;

    const working: [number, number][] = geometryToEdit.map(toLeafletLatLng);
    const lastIndex = working.length - 1;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      group.clearLayers();
      const view = map.getBounds().pad(0.15);
      const visible: number[] = [];
      for (let i = 0; i < working.length; i++) {
        if (view.contains(working[i])) visible.push(i);
      }
      const step = Math.max(1, Math.ceil(visible.length / MAX_VERTEX_HANDLES));

      visible.forEach((index, order) => {
        const isEnd = index === 0 || index === lastIndex;
        if (step > 1 && order % step !== 0 && !isEnd) return;
        const borderColor = index === 0 ? "#22c55e" : index === lastIndex ? "#ef4444" : "#0284c7";
        const icon = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid ${borderColor};box-shadow:0 1px 4px rgba(15,23,42,.6);cursor:grab"></div>`,
          className: "doh-vertex-handle",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const handle = L.marker(working[index], { icon, draggable: true, zIndexOffset: 1100, keyboard: false }).addTo(group);
        handle.bindTooltip(`จุดที่ ${index + 1} · ลากเพื่อย้าย · คลิกขวา/กดค้างเพื่อลบ`, { direction: "top", offset: [0, -8] });
        handle.on("drag", (event: any) => {
          const position = event.target.getLatLng();
          working[index] = [position.lat, position.lng];
          if (!vertexEditCoordinates || vertexEditCoordinates === draftCoordinates) draftLineRef.current?.setLatLngs(working);
        });
        handle.on("dragend", (event: any) => {
          const position = event.target.getLatLng();
          onVertexMovedRef.current?.(index, [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))]);
        });
        handle.on("click", (event: any) => {
          L.DomEvent.stopPropagation(event);
          onVertexClickedRef.current?.(index, "click");
        });
        handle.on("contextmenu", (event: any) => {
          L.DomEvent.stopPropagation(event);
          L.DomEvent.preventDefault(event);
          onVertexClickedRef.current?.(index, "contextmenu");
        });
      });

      // Midpoint handles are only shown when every vertex in view has its own handle.
      if (step === 1) {
        for (let i = 0; i < lastIndex; i++) {
          if (!view.contains(working[i]) && !view.contains(working[i + 1])) continue;
          const mid: [number, number] = [(working[i][0] + working[i + 1][0]) / 2, (working[i][1] + working[i + 1][1]) / 2];
          const icon = L.divIcon({
            html: `<div style="width:10px;height:10px;border-radius:50%;background:rgba(2,132,199,.55);border:1px solid #fff;cursor:copy"></div>`,
            className: "doh-vertex-mid",
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          const midHandle = L.marker(mid, { icon, draggable: true, zIndexOffset: 900, keyboard: false }).addTo(group);
          midHandle.bindTooltip("คลิกหรือลากเพื่อเพิ่มจุด", { direction: "top", offset: [0, -6] });
          midHandle.on("click", (event: any) => {
            L.DomEvent.stopPropagation(event);
            onVertexInsertedRef.current?.(i + 1, [Number(mid[1].toFixed(6)), Number(mid[0].toFixed(6))]);
          });
          midHandle.on("dragend", (event: any) => {
            const position = event.target.getLatLng();
            onVertexInsertedRef.current?.(i + 1, [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))]);
          });
        }
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 150);
    };

    draw();
    map.on("moveend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend", schedule);
      group.clearLayers();
    };
  }, [mapReady, vertexEditable, draftCoordinates, vertexEditCoordinates]);

  // 4g. DOH offices & highway stations
  useEffect(() => {
    const L = leafletRef.current;
    const group = officeGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!showOffices) return;

    (systemData.offices || []).forEach((office) => {
      if (!office.is_active) return;
      const officeIcon = L.divIcon({
        html: `
              <div class="relative cursor-pointer" style="transform: translate(-50%, -50%);">
                <div class="w-7 h-7 rounded-full bg-slate-100 border border-slate-500 flex items-center justify-center shadow-md text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
                    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
                    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
                    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
                  </svg>
                </div>
              </div>
            `,
        className: "doh-office-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const isOfficeEditable = !publicMode && editableOfficeId === office.id && Boolean(onOfficeDraggedRef.current);
      const marker = L.marker([office.lat, office.lon], { icon: officeIcon, draggable: isOfficeEditable }).addTo(group);
      if (isOfficeEditable) {
        marker.on("dragend", (event: any) => {
          const position = event.target.getLatLng();
          onOfficeDraggedRef.current?.(office.id, { lat: Number(position.lat.toFixed(6)), lon: Number(position.lng.toFixed(6)) });
        });
      }
      marker.bindPopup(() => buildOfficePopupHtml(office));
    });

    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.offices, showOffices, publicMode, editableOfficeId]);

  return (
    <div className={`relative ${className} overflow-hidden w-full h-full min-h-[450px]`} style={{ minHeight: 450 }}>
      <div
        ref={mapContainerRef}
        className="w-full h-full min-h-[350px] bg-[#0b1426] relative z-0"
        style={{ position: "absolute", inset: 0, minHeight: 450 }}
      />

      {/* Top Header Controls Bar (Responsive: status badges on left, legend toggle button on right) */}
      <div className="absolute top-3 inset-x-3 z-[400] flex items-center justify-between gap-1.5 pointer-events-none" aria-label="สรุปสถานการณ์และแถบควบคุมบนแผนที่">
        {/* Status Badges on the left */}
        <div className="flex items-center gap-1.5 pointer-events-auto overflow-x-auto no-scrollbar py-0.5 max-w-[calc(100%-105px)] sm:max-w-none">
          <div className="rounded-lg border border-red-500/50 bg-slate-950/95 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-white shadow-lg backdrop-blur shrink-0 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            <span>น้ำท่วม <strong className="text-red-300 font-bold">{showFloodLayer ? (systemData.floodRoutes || []).filter((item) => item.is_active).length : 0}</strong> จุด</span>
          </div>
          <div className="rounded-lg border border-amber-500/50 bg-slate-950/95 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-white shadow-lg backdrop-blur shrink-0 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            <span>ทางเลี่ยง <strong className="text-amber-300 font-bold">{showDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</strong> เส้นทาง</span>
          </div>
        </div>

        {/* Legend Toggle Button on the right (collapsed state) */}
        {isLayerControlCollapsed && (
          <div className="pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsLayerControlCollapsed(false)}
              className="bg-[#0b162c]/95 hover:bg-[#0f1d3a] border border-slate-700/80 rounded-lg px-2.5 py-1 shadow-lg flex items-center gap-1.5 text-[11px] sm:text-xs font-heading font-bold text-amber-300 transition backdrop-blur-md cursor-pointer"
              title="เปิดแถบควบคุมเลเยอร์แผนที่"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden xs:inline sm:inline">สัญลักษณ์บนแผนที่</span>
              <span className="inline xs:hidden sm:hidden">สัญลักษณ์</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Legend Panel (positioned cleanly at top-3 right-3, drops down smoothly) */}
      {!isLayerControlCollapsed && (
        <div className="absolute top-3 right-3 z-[410] bg-[#0b162c]/95 backdrop-blur border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl min-w-[215px] sm:min-w-[240px] max-w-[calc(100vw-24px)] text-xs pointer-events-auto animate-fade-in max-h-[85vh] overflow-y-auto">
          <div className="font-heading font-bold text-amber-400 flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-xs text-white">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> สัญลักษณ์บนแผนที่
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetCamera} className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline">
                รีเซ็ต
              </button>
              <button
                type="button"
                onClick={locateUser}
                disabled={isLocating}
                aria-label="ตำแหน่งของฉัน"
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-sky-300 hover:bg-slate-800 hover:text-sky-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                {isLocating ? "กำลังหา…" : "ตำแหน่งของฉัน"}
              </button>
              <button
                type="button"
                onClick={() => setIsLayerControlCollapsed(true)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                title="ย่อแถบควบคุมเลเยอร์"
                aria-label="ย่อแถบควบคุมเลเยอร์"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {locationStatus && (
            <p role="status" aria-live="polite" className="mt-2 rounded-md bg-slate-900/80 px-2 py-1.5 text-[11px] leading-snug text-slate-300">
              {locationStatus}
            </p>
          )}

          <div className="space-y-1.5">
            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายหลัก" onFocus={() => setLegendRouteList("MAIN_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("MAIN_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
              <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.primary?.color }} />
                  <span>ทางหลวงสายหลัก</span>
                </span>
                <input
                  type="checkbox"
                  checked={showMainHwy}
                  onChange={(e) => setShowMainHwy(e.target.checked)}
                  className="accent-emerald-500 rounded"
                />
              </label>
              {legendRouteList === "MAIN_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl">{legendRoutes("MAIN_HIGHWAY").length ? legendRoutes("MAIN_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-1 last:border-0"><strong className="text-emerald-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายรอง" onFocus={() => setLegendRouteList("SECOND_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("SECOND_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
              <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.secondary?.color }} />
                  <span>ทางหลวงสายรอง</span>
                </span>
                <input
                  type="checkbox"
                  checked={showSecHwy}
                  onChange={(e) => setShowSecHwy(e.target.checked)}
                  className="accent-sky-400 rounded"
                />
              </label>
              {legendRouteList === "SECOND_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl">{legendRoutes("SECOND_HIGHWAY").length ? legendRoutes("SECOND_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-1 last:border-0"><strong className="text-sky-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            {showSecHwy && (
              <div className="pl-5 pb-1">
                <label className="flex items-center justify-between gap-2 cursor-pointer text-[11px] text-slate-300 hover:text-white">
                  <span className="truncate">
                    แสดงสายรองทุกระดับซูม {!showSecondaryAtCurrentZoom ? "(ซูมออกซ่อนอัตโนมัติ)" : ""}
                  </span>
                  <input
                    type="checkbox"
                    checked={forceShowAllHighways}
                    onChange={(e) => setForceShowAllHighways(e.target.checked)}
                    className="accent-amber-400 rounded"
                  />
                </label>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-700"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /><path d="M3 14c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /></svg></span>
                <span>เส้นน้ำท่วม <span className="ml-1 rounded-full bg-red-950 px-1.5 py-0.5 text-[10px] text-red-300">{effectiveShowFloodLayer ? (systemData.floodRoutes || []).filter((item) => isFloodLineVisibleOnCurrentMap(item)).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={effectiveShowFloodLayer}
                disabled={Boolean(citizenLayerFilter)}
                onChange={(e) => setShowFloodLayer(e.target.checked)}
                className="accent-red-500 rounded disabled:opacity-50"
              />
            </label>

            {effectiveShowFloodLayer && (
              <div className="pl-6 pb-1 pt-0.5 flex items-center justify-between text-[11px] text-slate-300">
                <span>รูปแบบหมุด:</span>
                <div className="inline-flex rounded-lg bg-slate-900/90 p-0.5 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setFloodDisplayMode("SEGMENTS")}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${floodDisplayMode === "SEGMENTS"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                      }`}
                  >
                    แยกช่วง
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloodDisplayMode("EVENTS")}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${floodDisplayMode === "EVENTS"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                      }`}
                  >
                    รวมเหตุการณ์
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-400 text-slate-950"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9" /><path d="m15 2 3 3-3 3" /><path d="M9 19h10" /></svg></span>
                <span>ทางเลี่ยง <span className="ml-1 rounded-full bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-300">{effectiveShowDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={effectiveShowDetourLayer}
                disabled={Boolean(citizenLayerFilter)}
                onChange={(e) => setShowDetourLayer(e.target.checked)}
                className="accent-yellow-400 rounded disabled:opacity-50"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <Building2 className="w-3 h-3 text-sky-400 inline-block" />
                <span>สำนักงาน/หมวดทางหลวง</span>
              </span>
              <input
                type="checkbox"
                checked={showOffices}
                onChange={(e) => setShowOffices(e.target.checked)}
                className="accent-sky-400 rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="flex h-4 min-w-5 items-center justify-center rounded-sm border border-slate-800 bg-white px-0.5 text-[8px] font-bold text-slate-900">42</span>
                <span>หมายเลขทางหลวง</span>
              </span>
              <input type="checkbox" checked={showHighwayShields} onChange={(e) => setShowHighwayShields(e.target.checked)} className="accent-slate-400 rounded" />
            </label>
          </div>

          {/* Base Map Switcher */}
          <div className="mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-3 gap-1 text-[10px] font-heading font-bold">
            <button
              type="button"
              onClick={() => switchBaseMap("longdo")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${activeBaseMap === "longdo" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              Longdo
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("road")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${activeBaseMap === "road" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              ถนน OSM
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("sat")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${activeBaseMap === "sat" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              ดาวเทียม
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
