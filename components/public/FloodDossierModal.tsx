"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Droplets,
  MapPin,
  MapPinned,
  Maximize2,
  Milestone,
  Navigation,
  Route,
  TrendingUp,
  X,
} from "lucide-react";
import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { AdviceText } from "@/components/AdviceText";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { extractDirectionalAdvice, splitDetourAdviceByDirection } from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  defaultDetourDirection,
  detourDistanceMeters,
  detourDurationSeconds,
  getDetourShortSummary,
  getDetourTimelinePresentation,
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import {
  AFFECTED_ROAD_PART_LABELS,
  normalizeMediaUrl,
  type parseFloodDirectionMeta,
} from "@/lib/flood-event-schema";
import { getTrafficPresentation, type TrafficPresentation } from "@/lib/traffic-presentation";
import {
  formatFloodAreaLine,
  formatKmText,
  parseRouteCoordinates,
  STATUS_CHIP,
} from "@/components/public/public-route-helpers";
import type { getLinkedDetoursForFlood } from "@/lib/event-detour-links";

// Chart.js + react-chartjs-2 are only needed once a flood dossier is open, so keep them out of the
// initial bundle that every visitor downloads.
const WaterTimelineChart = dynamic(
  () => import("@/components/charts/WaterTimelineChart").then((mod) => mod.WaterTimelineChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">กำลังโหลดกราฟระดับน้ำ...</div>
    ),
  }
);

const FloodEventMiniMap = dynamic(
  () => import("@/components/map/FloodEventMiniMap").then((mod) => mod.FloodEventMiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 w-full items-center justify-center rounded-xl border border-slate-700/80 bg-[#0b1528] text-xs text-slate-400">
        กำลังโหลดแผนที่ตำแหน่ง...
      </div>
    ),
  }
);

export interface FloodDossierModalProps {
  selectedFlood: FloodRoute;
  selectedFloodMeta: ReturnType<typeof parseFloodDirectionMeta>;
  dossierStatus: TrafficPresentation;
  systemData: SystemDataPayload;
  onDemandPhotos: Record<string, Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>>;
  activePhotoIdx: number;
  setActivePhotoIdx: React.Dispatch<React.SetStateAction<number>>;
  isPhotoFullscreen: boolean;
  setIsPhotoFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  siblingSegments: FloodRoute[];
  setSelectedFloodId: (id: string) => void;
  setFocusCoordinates: (coords: [number, number]) => void;
  closeDetailsRef: React.RefObject<HTMLButtonElement | null>;
  dossierDetourRef: React.RefObject<HTMLDivElement | null>;
  setShowDossier: (show: boolean) => void;
  selectedFloodDetours: DetourRoute[];
  selectedFloodDetourEntries: ReturnType<typeof getLinkedDetoursForFlood>;
  expandedDetourId: string | null;
  setExpandedDetourId: React.Dispatch<React.SetStateAction<string | null>>;
  detourDirectionById: Record<string, "FORWARD" | "REVERSE">;
  setDetourDirectionById: React.Dispatch<React.SetStateAction<Record<string, "FORWARD" | "REVERSE">>>;
  eventAdviceDirection: "FORWARD" | "REVERSE";
  setEventAdviceDirection: (dir: "FORWARD" | "REVERSE") => void;
  directionalAdvice: ReturnType<typeof extractDirectionalAdvice>;
  isHistoryExpanded: boolean;
  setIsHistoryExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFloodRecentUpdates: SystemDataPayload["timelineUpdates"];
}

export function FloodDossierModal({
  selectedFlood,
  selectedFloodMeta,
  dossierStatus,
  systemData,
  onDemandPhotos,
  activePhotoIdx,
  setActivePhotoIdx,
  isPhotoFullscreen,
  setIsPhotoFullscreen,
  siblingSegments,
  setSelectedFloodId,
  setFocusCoordinates,
  closeDetailsRef,
  dossierDetourRef,
  setShowDossier,
  selectedFloodDetours,
  selectedFloodDetourEntries,
  expandedDetourId,
  setExpandedDetourId,
  detourDirectionById,
  setDetourDirectionById,
  eventAdviceDirection,
  setEventAdviceDirection,
  directionalAdvice,
  isHistoryExpanded,
  setIsHistoryExpanded,
  selectedFloodRecentUpdates,
}: FloodDossierModalProps) {
  const routeLabel = /^(?:ทล|ปน)\.?\s*/i.test(selectedFlood.route_no) ? selectedFlood.route_no : `ทล.${selectedFlood.route_no}`;
  const dossierArea = formatFloodAreaLine(selectedFlood);
  const waterKnown = selectedFlood.direction_meta?.water_level_known !== false && selectedFloodMeta.waterLevelKnown !== false;
  const rawMetaPhotos = (onDemandPhotos[selectedFlood.id] || selectedFloodMeta.photos || []) as Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>;
  const dossierPhotos = rawMetaPhotos.length > 0
    ? rawMetaPhotos.filter((p) => Boolean(p?.dataUrl))
    : selectedFlood.latest_photo_url
      ? [{ id: "primary", dataUrl: selectedFlood.latest_photo_url, sizeBytes: 0 }]
      : [];
  const safePhotoIdx = dossierPhotos.length > 0 ? Math.min(activePhotoIdx, dossierPhotos.length - 1) : 0;
  const activePhoto = dossierPhotos[safePhotoIdx];
  const recordedParts = Array.isArray(selectedFloodMeta.affectedParts)
    ? selectedFloodMeta.affectedParts
      .filter((p) => p && p !== "UNSPECIFIED" && p !== "PENDING_VERIFICATION")
      .map((p) => AFFECTED_ROAD_PART_LABELS[p] || String(p))
      .filter(Boolean)
    : [];
  const recordedLanesText =
    (selectedFlood.affected_lanes && selectedFlood.affected_lanes.trim() !== "-" ? selectedFlood.affected_lanes.trim() : "") ||
    (recordedParts.length > 0 ? recordedParts.join(", ") : "") ||
    "ไม่ระบุ";

  return (
    <div
      className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/75 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowDossier(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
        className="relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700/80 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[92dvh] sm:max-w-[57.5rem] sm:rounded-3xl"
      >
        {/* Header: Route Badge, Section Title, KM Range, Area, Traffic Status, Close */}
        <div className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#0c182e] px-4 py-3.5 sm:px-6 shadow-md">
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-[#f59e0b] px-3 py-1 font-heading text-sm font-black text-slate-950 shadow">
                  {routeLabel}
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="font-heading text-base sm:text-xl font-bold leading-snug text-white break-words">
                    {selectedFlood.section_name}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-1.5 flex-wrap">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span>{formatKmText(selectedFlood.km_start)} ถึง {formatKmText(selectedFlood.km_end)}</span>
                  </p>
                  {dossierArea && (
                    <p className="text-xs text-slate-300 break-words">{dossierArea}</p>
                  )}
                </div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-heading text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                <span aria-hidden="true">{dossierStatus.icon}</span>
                <span>{dossierStatus.label}</span>
              </span>
            </div>
            <button
              ref={closeDetailsRef}
              type="button"
              onClick={() => setShowDossier(false)}
              aria-label="ปิดรายละเอียด"
              className="grid min-h-[2.75rem] min-w-[2.75rem] sm:min-h-10 sm:min-w-10 shrink-0 place-items-center rounded-lg bg-slate-800/90 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
              title="ปิดหน้าต่างรายละเอียด"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Dark Navy Body */}
        <div className="grid grid-cols-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:grid-cols-[1.18fr_0.82fr]">
          {/* LEFT COLUMN: Real DB Photo Carousel + Detour Recommendations Accordion */}
          <div className="space-y-4 min-w-0">
            {/* Situation Photo Card */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1930] shadow-lg">
              {activePhoto?.dataUrl ? (
                <>
                  <img
                    src={activePhoto.dataUrl}
                    alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                    loading="lazy"
                    decoding="async"
                    className="h-52 w-full object-cover sm:h-64"
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-slate-700/80 px-2.5 py-1 text-xs font-heading font-bold text-white backdrop-blur-xs">
                    <Camera aria-hidden="true" className="h-3.5 w-3.5 text-slate-200" />
                    <span>ภาพสถานการณ์</span>
                  </div>
                  {dossierPhotos.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="ภาพก่อนหน้า"
                        onClick={() => setActivePhotoIdx((idx) => (idx - 1 + dossierPhotos.length) % dossierPhotos.length)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="ภาพถัดไป"
                        onClick={() => setActivePhotoIdx((idx) => (idx + 1) % dossierPhotos.length)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1">
                        {dossierPhotos.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            aria-label={`ดูภาพที่ ${idx + 1}`}
                            onClick={() => setActivePhotoIdx(idx)}
                            className={`h-2 w-2 rounded-full transition cursor-pointer ${idx === safePhotoIdx ? "bg-[#f59e0b]" : "bg-slate-400/60 hover:bg-slate-300"}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <div className="absolute right-3 bottom-2.5 flex items-center gap-1.5">
                    <span className="rounded-md bg-slate-950/85 border border-slate-700/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {safePhotoIdx + 1}/{dossierPhotos.length}
                    </span>
                    <button
                      type="button"
                      aria-label="ขยายภาพสถานการณ์เต็มจอ"
                      onClick={() => setIsPhotoFullscreen(true)}
                      className="grid h-7 w-7 place-items-center rounded-md bg-slate-950/85 border border-slate-700/80 text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-44 items-center justify-center px-4 text-center text-xs text-slate-400">
                  ยังไม่มีภาพถ่ายสถานการณ์ล่าสุด
                </div>
              )}
            </div>

            {/* Sibling Segments Comparative Switcher (when parent event has multiple stretches) */}
            {siblingSegments.length > 1 && (
              <div className="rounded-2xl border border-sky-600/40 bg-sky-950/35 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-heading font-bold text-sky-200">
                    📊 ช่วงในเหตุการณ์นี้ ({siblingSegments.length} ช่วง)
                  </span>
                  <span className="text-[0.75rem]/[1.1rem] text-slate-400">แตะเพื่อสลับดูข้อมูล</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {siblingSegments.map((s) => {
                    const isCurrent = s.id === selectedFlood.id;
                    const pres = getTrafficPresentation(s.traffic_status, s.water_level_cm, s.direction_meta?.trafficStatusDetail);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedFloodId(s.id);
                          if (s.lat_start && s.lon_start) setFocusCoordinates([s.lon_start, s.lat_start]);
                        }}
                        className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between gap-1 cursor-pointer ${isCurrent
                          ? "bg-sky-900/75 border-sky-400 ring-1 ring-sky-400 text-white"
                          : "bg-slate-900/75 border-slate-700/80 hover:bg-slate-800 text-slate-200"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 text-xs">
                          <span className="font-semibold text-amber-300">กม.{s.km_start}–{s.km_end}</span>
                          <span className="text-[0.75rem]/[1.1rem] font-mono font-bold text-white">{s.water_level_cm} ซม.</span>
                        </div>
                        <span className="text-[0.75rem]/[1.1rem] text-slate-300">{pres.icon} {pres.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detour Recommendations (Exclusive Single-Open Accordion with Per-Route Independent Direction) */}
            <div
              id="dossier-detour-section"
              ref={dossierDetourRef}
              tabIndex={-1}
              className="space-y-2.5 focus:outline-none"
            >
              <div className="flex items-center gap-2 text-sm sm:text-base font-heading font-bold text-white">
                <Compass className="w-5 h-5 text-[#f59e0b] shrink-0" />
                <span>ทางเลี่ยงแนะนำ ({selectedFloodDetours.length} สาย)</span>
              </div>

              {selectedFloodDetours.length > 0 && (
                <div className="space-y-2.5">
                  {selectedFloodDetours.map((route, idx) => {
                    const linkedEntry = selectedFloodDetourEntries[idx];
                    const isExpanded = expandedDetourId === route.id;
                    const isTwoWay =
                      isDetourDirectionAllowed(route.direction_mode, "FORWARD") &&
                      isDetourDirectionAllowed(route.direction_mode, "REVERSE");
                    const fallbackDir: "FORWARD" | "REVERSE" =
                      linkedEntry?.effectiveDetourDirection === "REVERSE" &&
                        isDetourDirectionAllowed(route.direction_mode, "REVERSE")
                        ? "REVERSE"
                        : linkedEntry?.effectiveDetourDirection === "FORWARD" &&
                          isDetourDirectionAllowed(route.direction_mode, "FORWARD")
                          ? "FORWARD"
                          : isTwoWay
                            ? eventAdviceDirection
                            : defaultDetourDirection(route.direction_mode);
                    const storedDir = detourDirectionById[route.id];
                    const effectiveDirection: "FORWARD" | "REVERSE" =
                      storedDir && isDetourDirectionAllowed(route.direction_mode, storedDir)
                        ? storedDir
                        : fallbackDir;

                    const meters = detourDistanceMeters(route.detour_meta, effectiveDirection);
                    const durationSec = detourDurationSeconds(route.detour_meta, effectiveDirection);
                    const fwdCoords = parseRouteCoordinates(route.coordinates_json);
                    const revCoords = parseRouteCoordinates(route.reverse_coordinates_json);
                    const polyCoords =
                      effectiveDirection === "REVERSE" && revCoords.length > 0
                        ? revCoords
                        : fwdCoords;
                    const polyKm = calculatePolylineRoadDistanceKm(polyCoords);
                    const ext = extractDirectionalAdvice(route.description || "");
                    const parsed = splitDetourAdviceByDirection(route.description || "", route.direction_mode);
                    const displayText =
                      ext.hasBoth && route.direction_mode !== "FORWARD_ONLY" && route.direction_mode !== "REVERSE_ONLY"
                        ? effectiveDirection === "FORWARD"
                          ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                          : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                        : effectiveDirection === "FORWARD"
                          ? parsed.forwardText
                          : parsed.reverseText;
                    const timeline = getDetourTimelinePresentation(
                      displayText || "",
                      meters,
                      polyKm,
                      selectedFlood ? `${routeLabel} (${selectedFlood.section_name})` : route.route_name,
                      "",
                      route.detour_meta?.road_condition,
                      durationSec
                    );
                    const shortSummary = getDetourShortSummary(displayText || route.description || "");
                    const detourNav = resolveDetourGoogleMapsNavigation(route, effectiveDirection, systemData.floodRoutes);

                    return (
                      <div
                        key={route.id}
                        data-detour-card={route.id}
                        className={`rounded-2xl border transition ${isExpanded
                          ? "border-[#f59e0b] bg-[#0b162a] shadow-lg"
                          : "border-slate-700/80 bg-[#0d1930]/80 hover:border-amber-400/60"
                          } text-sm text-slate-100`}
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`dossier-detour-panel-${route.id}`}
                          onClick={() => setExpandedDetourId((current) => (current === route.id ? null : route.id))}
                          className="flex w-full min-h-12 cursor-pointer items-start justify-between gap-2.5 rounded-t-2xl p-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                        >
                          <span className="flex min-w-0 flex-1 items-start gap-2.5">
                            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black ${isExpanded ? "bg-[#f59e0b] text-slate-950" : "bg-sky-200/90 text-slate-950"
                              }`}>
                              {idx + 1}
                            </span>
                            <span className="min-w-0 flex-1 space-y-1">
                              <span className="block font-heading text-sm font-bold text-white break-words">
                                <span>ทางเลี่ยงที่ {idx + 1} – </span>
                                <span>{route.route_name}</span>
                              </span>
                              {shortSummary && (
                                <span className="block line-clamp-2 text-xs leading-snug text-slate-300 break-words">
                                  {shortSummary}
                                </span>
                              )}
                              {!isExpanded && (
                                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.75rem]/[1.1rem] text-slate-300">
                                  <span className="inline-flex items-center gap-1 font-medium text-amber-200">
                                    <Route aria-hidden="true" className="h-3 w-3 shrink-0" />
                                    {timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุระยะทาง"}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-600">|</span>
                                  <span className="inline-flex items-center gap-1 text-slate-200">
                                    <Clock aria-hidden="true" className="h-3 w-3 shrink-0 text-sky-300" />
                                    {timeline.estimatedDurationText}
                                  </span>
                                </span>
                              )}
                            </span>
                          </span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`mt-1 h-5 w-5 shrink-0 transition-transform ${isExpanded ? "rotate-180 text-[#f59e0b]" : "text-slate-300"}`}
                          />
                        </button>

                        {isExpanded && (
                          <div
                            id={`dossier-detour-panel-${route.id}`}
                            className="space-y-3 border-t border-slate-700/70 p-3.5 pt-3"
                          >
                            {/* Advice Steps for this route's direction (without duplicated distance/duration lines) */}
                            {displayText ? (
                              <AdviceText
                                text={displayText}
                                hideDistanceAndDuration
                                className="text-xs sm:text-sm text-slate-200 leading-relaxed"
                              />
                            ) : (
                              <p className="text-xs text-slate-400">ยังไม่มีคำแนะนำการเดินทาง</p>
                            )}

                            {/* Per-Detour Direction Switch (isolated per route.id) */}
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-[#091325] p-2">
                              <span className="px-1.5 text-xs font-semibold text-slate-300">ทิศทางของเส้นทางนี้</span>
                              <DirectionSwitch
                                size="sm"
                                fullWidth
                                className="flex-1 min-w-[min(100%,12.5rem)]"
                                ariaLabel={`ทิศทางของเส้นทางนี้ ${route.route_name}`}
                                value={effectiveDirection}
                                onChange={(nextDir) => setDetourDirectionById((prev) => ({ ...prev, [route.id]: nextDir }))}
                                options={[
                                  {
                                    value: "FORWARD",
                                    label: "ขาไป (A → B)",
                                    disabled: !isDetourDirectionAllowed(route.direction_mode, "FORWARD"),
                                  },
                                  {
                                    value: "REVERSE",
                                    label: "ขากลับ (B → A)",
                                    disabled: !isDetourDirectionAllowed(route.direction_mode, "REVERSE"),
                                  },
                                ]}
                              />
                            </div>

                            {/* Entrance Photo for Active Direction (Start A or End B) */}
                            {(() => {
                              const activePointPhoto =
                                effectiveDirection === "REVERSE"
                                  ? route.detour_meta?.end_point_photo
                                  : route.detour_meta?.start_point_photo;
                              if (!activePointPhoto?.url) return null;
                              const pointLabel =
                                effectiveDirection === "REVERSE"
                                  ? "จุดสิ้นสุด B — ภาพบริเวณทางเข้าทางเลี่ยง (ฝั่งขากลับ B → A)"
                                  : "จุดเริ่มต้น A — ภาพบริเวณทางเข้าทางเลี่ยง (ฝั่งขาไป A → B)";
                              return (
                                <div className="rounded-xl border border-slate-700/80 bg-[#091325] p-2.5 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-xs font-heading font-bold text-amber-300">
                                    <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                                    <span>{pointLabel}</span>
                                  </div>
                                  <img
                                    src={normalizeMediaUrl(activePointPhoto.url)}
                                    alt={activePointPhoto.caption || pointLabel}
                                    className="w-full h-36 rounded-lg object-cover border border-slate-800"
                                  />
                                  {activePointPhoto.caption && (
                                    <p className="text-xs text-slate-300 leading-snug">{activePointPhoto.caption}</p>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Distance & Duration Metrics Grid (Line Length + Admin Duration) */}
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="rounded-xl border border-slate-700/80 bg-[#0d1930] px-3 py-2 flex items-center gap-2.5">
                                <Route aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-300" />
                                <div className="min-w-0">
                                  <div className="text-[0.75rem]/[1.1rem] text-slate-400">ระยะทางรวม</div>
                                  <div className="font-heading text-sm font-bold text-white">
                                    {timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุ"}
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-700/80 bg-[#0d1930] px-3 py-2 flex items-center gap-2.5">
                                <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-300" />
                                <div className="min-w-0">
                                  <div className="text-[0.75rem]/[1.1rem] text-slate-400">เวลาโดยประมาณ</div>
                                  <div className="font-heading text-xs sm:text-sm font-bold text-white break-words">
                                    {timeline.estimatedDurationText}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Per-Detour Navigation & Focus Actions (Always visible directly on list item) */}
                        <div className="grid grid-cols-2 gap-2 border-t border-slate-700/60 px-3.5 py-2.5">
                          {detourNav && detourNav.isValid && detourNav.url ? (
                            <a
                              href={detourNav.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="ดูบน Google Maps"
                              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f59e0b] hover:bg-[#d97706] px-2.5 py-2 font-heading text-xs sm:text-sm font-black text-slate-950 shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            >
                              <Navigation aria-hidden="true" className="h-4 w-4 shrink-0" />
                              <span>ดูบน Google Maps</span>
                            </a>
                          ) : (
                            <span
                              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-[0.833em] py-[0.667em] font-heading text-[0.75rem]/[1.1rem] text-slate-300 text-center leading-tight"
                              title={detourNav?.warning || "ยังไม่ยืนยันนำทางอัตโนมัติ"}
                            >
                              <Navigation aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
                              <span>ยังไม่ยืนยันนำทางอัตโนมัติ</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (Number.isFinite(route.lon_start) && Number.isFinite(route.lat_start)) {
                                setFocusCoordinates([route.lon_start, route.lat_start]);
                              } else if (Array.isArray(polyCoords) && polyCoords.length > 0 && Array.isArray(polyCoords[0])) {
                                const mid = polyCoords[Math.floor(polyCoords.length / 2)];
                                const a = Number(mid[0]);
                                const b = Number(mid[1]);
                                if (Number.isFinite(a) && Number.isFinite(b)) {
                                  setFocusCoordinates(Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b]);
                                }
                              }
                              setShowDossier(false);
                            }}
                            className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-2.5 py-2 font-heading text-xs sm:text-sm font-bold text-white leading-tight text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                          >
                            <MapPinned aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-300" />
                            <span>ดูตำแหน่งบนแผนที่</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedFloodDetours.length === 0 && !selectedFlood.detour_advice && (
                <p className="rounded-xl border border-slate-700/80 bg-[#0d1930] p-3 text-xs text-slate-300">
                  ยังไม่มีทางเลี่ยงที่ยืนยันและผูกกับจุดน้ำท่วมนี้ โปรดโทร 1586 ก่อนเดินทาง
                </p>
              )}

              {selectedFlood.detour_advice && (
                <div className="space-y-2 rounded-xl border border-amber-400/30 bg-[#0d1930] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-heading font-bold text-amber-300">คำแนะนำเพิ่มเติมจากเหตุการณ์</span>
                    {directionalAdvice.hasBoth && (
                      <DirectionSwitch
                        size="sm"
                        ariaLabel="ทิศทางคำแนะนำเพิ่มเติมจากเหตุการณ์"
                        value={eventAdviceDirection}
                        onChange={setEventAdviceDirection}
                        options={[
                          { value: "FORWARD", label: "ขาไป (A → B)" },
                          { value: "REVERSE", label: "ขากลับ (B → A)" },
                        ]}
                      />
                    )}
                  </div>
                  {(() => {
                    const ext = directionalAdvice;
                    const displayText = ext.hasBoth
                      ? eventAdviceDirection === "FORWARD"
                        ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                        : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                      : selectedFlood.detour_advice;
                    return (
                      <div className="font-sans text-xs text-slate-200 sm:max-h-48 sm:overflow-y-auto">
                        <AdviceText text={displayText} />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Current Water Level, Affected Lanes (Exact DB), Updated At, Pinned Incident Mini-Map */}
          <div className="space-y-3 min-w-0">
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] divide-y divide-slate-700/75 shadow-lg">
              {/* Water Level */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-slate-300">
                    <Droplets aria-hidden="true" className="h-4 w-4 text-sky-300" />
                    <span>ระดับน้ำปัจจุบัน</span>
                  </span>
                  <span className={`px-[0.667em] py-[0.167em] rounded-md text-[0.75rem]/[1.1rem] font-heading font-bold ${selectedFlood.trend === "RISING"
                    ? "bg-rose-950/90 text-rose-300 border border-rose-700/80"
                    : selectedFlood.trend === "FALLING"
                      ? "bg-emerald-950/90 text-emerald-300 border border-emerald-700/80"
                      : "bg-amber-950/80 text-amber-300 border border-amber-600/60"
                    }`}>
                    แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : "ทรงตัว"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-black tracking-tight text-red-500">
                    {waterKnown ? selectedFlood.water_level_cm : "รอตรวจสอบ"}
                  </span>
                  {waterKnown && <span className="text-sm font-bold text-slate-200">ซม.</span>}
                </div>
              </div>

              {/* Affected Lanes (Verbatim from DB without inventing suffix) */}
              <div className="p-3.5 flex items-start gap-2.5">
                <Milestone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs text-slate-400">ส่วนถนนที่ได้รับผลกระทบ</div>
                  <div className="font-heading text-sm font-bold text-amber-300 break-words">
                    {recordedLanesText}
                  </div>
                </div>
              </div>

              {/* Latest Updated Timestamp */}
              <div className="p-3.5 flex items-start gap-2.5">
                <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs text-slate-400">อัปเดตล่าสุด:</div>
                  <div className="font-mono text-xs sm:text-sm font-semibold text-white">
                    {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ไม่ระบุ"}
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Incident Location Mini-Map (Never follows detour direction toggles) */}
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] p-3.5 space-y-2.5 shadow-lg">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-heading font-bold text-white">
                <MapPinned aria-hidden="true" className="h-4 w-4 text-sky-300 shrink-0" />
                <span>ตำแหน่งบนแผนที่</span>
              </div>
              <FloodEventMiniMap flood={selectedFlood} />
              <button
                type="button"
                onClick={() => {
                  if (Number.isFinite(selectedFlood.lon_start) && Number.isFinite(selectedFlood.lat_start)) {
                    setFocusCoordinates([selectedFlood.lon_start, selectedFlood.lat_start]);
                  }
                  setShowDossier(false);
                }}
                className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-3 py-2 font-heading text-xs font-bold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <MapPin aria-hidden="true" className="h-4 w-4 text-sky-300" />
                <span>ดูตำแหน่งบนแผนที่</span>
              </button>
            </div>
          </div>

          {/* FULL-WIDTH BOTTOM COLLAPSIBLE HISTORY BUTTON & CHART */}
          <div className="md:col-span-2 pt-1">
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] overflow-hidden">
              <button
                type="button"
                aria-expanded={isHistoryExpanded}
                aria-controls="dossier-water-history-panel"
                onClick={() => setIsHistoryExpanded((prev) => !prev)}
                className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left font-heading text-sm font-bold text-white transition hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <span className="mx-auto flex items-center gap-2">
                  <TrendingUp aria-hidden="true" className="h-4 w-4 text-sky-300" />
                  <span>ดูประวัติระดับน้ำท่วม</span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${isHistoryExpanded ? "rotate-90" : ""}`}
                />
              </button>

              {isHistoryExpanded && (
                <div
                  id="dossier-water-history-panel"
                  className="space-y-3 border-t border-slate-700/75 bg-slate-950/75 p-4"
                >
                  <div className="h-44 w-full rounded-xl border border-slate-800 bg-slate-950/90 p-2.5">
                    <WaterTimelineChart
                      timelineUpdates={systemData.timelineUpdates}
                      floodId={selectedFlood.id}
                    />
                  </div>

                  {selectedFloodRecentUpdates.length > 0 ? (
                    <div className="space-y-1.5">
                      {selectedFloodRecentUpdates.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs"
                        >
                          <span className="mr-2 truncate text-slate-300">
                            <strong className="font-mono text-amber-400">
                              {new Date(item.reported_at).toLocaleString("th-TH", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })} น.
                            </strong>{" "}
                            {item.remark}
                          </span>
                          <strong className="shrink-0 font-mono font-bold text-red-400">
                            {item.water_level_cm} ซม.
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-slate-400">
                      ยังไม่มีข้อมูลประวัติระดับน้ำในระบบ
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Preview Overlay */}
      {isPhotoFullscreen && activePhoto?.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ภาพถ่ายสถานการณ์ขนาดเต็ม"
          className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setIsPhotoFullscreen(false)}
        >
          <button
            type="button"
            aria-label="ปิดภาพขนาดเต็ม"
            onClick={() => setIsPhotoFullscreen(false)}
            className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={activePhoto.dataUrl}
            alt={`ภาพสถานการณ์ขนาดเต็ม ${selectedFlood.section_name}`}
            className="max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
