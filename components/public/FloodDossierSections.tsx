"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  MapPinned,
  Navigation,
  Route,
  TrendingUp,
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
import { normalizeMediaUrl } from "@/lib/flood-event-schema";
import type { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { parseRouteCoordinates } from "@/components/public/public-route-helpers";

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

export interface FloodDossierDetourSectionProps {
  selectedFlood: FloodRoute;
  routeLabel: string;
  systemData: SystemDataPayload;
  dossierDetourRef: React.RefObject<HTMLDivElement | null>;
  selectedFloodDetours: DetourRoute[];
  selectedFloodDetourEntries: ReturnType<typeof getLinkedDetoursForFlood>;
  expandedDetourId: string | null;
  setExpandedDetourId: React.Dispatch<React.SetStateAction<string | null>>;
  detourDirectionById: Record<string, "FORWARD" | "REVERSE">;
  setDetourDirectionById: React.Dispatch<React.SetStateAction<Record<string, "FORWARD" | "REVERSE">>>;
  eventAdviceDirection: "FORWARD" | "REVERSE";
  setEventAdviceDirection: (dir: "FORWARD" | "REVERSE") => void;
  directionalAdvice: ReturnType<typeof extractDirectionalAdvice>;
  setFocusCoordinates: (coords: [number, number]) => void;
  setShowDossier: (show: boolean) => void;
  onFocusDetourOnMap?: (detourId: string, direction: "FORWARD" | "REVERSE") => void;
}

export function FloodDossierDetourSection({
  selectedFlood,
  routeLabel,
  systemData,
  dossierDetourRef,
  selectedFloodDetours,
  selectedFloodDetourEntries,
  expandedDetourId,
  setExpandedDetourId,
  detourDirectionById,
  setDetourDirectionById,
  eventAdviceDirection,
  setEventAdviceDirection,
  directionalAdvice,
  setFocusCoordinates,
  setShowDossier,
  onFocusDetourOnMap,
}: FloodDossierDetourSectionProps) {
  return (
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
            const baseHint = selectedFlood ? `${routeLabel} (${selectedFlood.section_name})` : route.route_name;
            const timeline = getDetourTimelinePresentation(
              displayText || "",
              meters,
              polyKm,
              effectiveDirection === "REVERSE" ? route.route_name : baseHint,
              effectiveDirection === "REVERSE" ? baseHint : "",
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
                    ) : timeline.directionNotice ? (
                      <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-xs text-amber-200 leading-relaxed">
                        {timeline.directionNotice}
                      </div>
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
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f59e0b] hover:bg-[#d97706] px-2.5 py-2 font-heading text-xs sm:text-sm font-black text-slate-950 shadow-md transition touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
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
                      if (onFocusDetourOnMap) {
                        onFocusDetourOnMap(route.id, effectiveDirection);
                        return;
                      }

                      const pickCoord = (pt: unknown): [number, number] | null => {
                        if (!Array.isArray(pt) || pt.length < 2) return null;
                        const a = Number(pt[0]);
                        const b = Number(pt[1]);
                        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
                        return Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b];
                      };

                      let target: [number, number] | null = null;
                      if (effectiveDirection === "REVERSE") {
                        target =
                          pickCoord(revCoords[0]) ??
                          (Number.isFinite(route.lon_end) && Number.isFinite(route.lat_end)
                            ? [route.lon_end, route.lat_end]
                            : null) ??
                          pickCoord(fwdCoords[fwdCoords.length - 1]);
                      } else {
                        target =
                          (Number.isFinite(route.lon_start) && Number.isFinite(route.lat_start)
                            ? [route.lon_start, route.lat_start]
                            : null) ??
                          pickCoord(fwdCoords[0]);
                      }

                      if (!target && Array.isArray(polyCoords) && polyCoords.length > 0) {
                        target = pickCoord(polyCoords[Math.floor(polyCoords.length / 2)]);
                      }

                      if (target) setFocusCoordinates(target);
                      setShowDossier(false);
                    }}
                    className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-2.5 py-2 font-heading text-xs sm:text-sm font-bold text-white leading-tight text-center transition touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
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
  );
}

export interface FloodDossierHistorySectionProps {
  selectedFloodId: string;
  timelineUpdates: SystemDataPayload["timelineUpdates"];
  selectedFloodRecentUpdates: SystemDataPayload["timelineUpdates"];
  isHistoryExpanded: boolean;
  setIsHistoryExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export function FloodDossierHistorySection({
  selectedFloodId,
  timelineUpdates,
  selectedFloodRecentUpdates,
  isHistoryExpanded,
  setIsHistoryExpanded,
}: FloodDossierHistorySectionProps) {
  return (
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
                timelineUpdates={timelineUpdates}
                floodId={selectedFloodId}
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
  );
}
