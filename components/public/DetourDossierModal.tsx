"use client";

import React from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  Link2,
  MapPin,
  Milestone,
  RefreshCw,
  Route,
  Undo2,
  X,
} from "lucide-react";
import type { DetourRoute, SystemDataPayload } from "@/db/default-data";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { splitDetourAdviceByDirection } from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  detourDirectionDetailedBadge,
  detourDistanceMeters,
  detourDurationSeconds,
  getDetourTimelinePresentation,
  isDetourDirectionAllowed,
  isRecordedDetourDirection,
  type DetourTimelineStep,
} from "@/lib/detour-presentation";

function renderStepIcon(iconType: DetourTimelineStep["iconType"]) {
  switch (iconType) {
    case "start":
      return <MapPin aria-hidden="true" className="w-4 h-4 text-emerald-400 shrink-0 stroke-[2.5]" />;
    case "end":
      return <Flag aria-hidden="true" className="w-4 h-4 text-emerald-400 shrink-0 stroke-[2.5]" />;
    case "turn_left":
      return <CornerUpLeft aria-hidden="true" className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />;
    case "turn_right":
      return <CornerUpRight aria-hidden="true" className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />;
    case "slight_left":
      return <ArrowUpLeft aria-hidden="true" className="w-4 h-4 text-sky-300 shrink-0 stroke-[2.5]" />;
    case "slight_right":
      return <ArrowUpRight aria-hidden="true" className="w-4 h-4 text-sky-300 shrink-0 stroke-[2.5]" />;
    case "uturn":
      return <Undo2 aria-hidden="true" className="w-4 h-4 text-amber-200 shrink-0 stroke-[2.5]" />;
    case "roundabout":
      return <RefreshCw aria-hidden="true" className="w-4 h-4 text-sky-300 shrink-0 stroke-[2.5]" />;
    case "straight":
    default:
      return <ArrowUp aria-hidden="true" className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />;
  }
}
import { getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";
import {
  formatFloodAreaLine,
  parseRouteCoordinates,
} from "@/components/public/public-route-helpers";

export interface DetourDossierModalProps {
  viewingDetourModal: DetourRoute;
  systemData: SystemDataPayload;
  modalDetourDirection: "FORWARD" | "REVERSE";
  setModalDetourDirection: (dir: "FORWARD" | "REVERSE") => void;
  detourDialogRef: React.RefObject<HTMLDivElement | null>;
  detourCloseRef: React.RefObject<HTMLButtonElement | null>;
  closeDetourDetails: () => void;
  onFocusMapLocation: (coords?: [number, number]) => void;
}

export function DetourDossierModal({
  viewingDetourModal,
  systemData,
  modalDetourDirection,
  setModalDetourDirection,
  detourDialogRef,
  detourCloseRef,
  closeDetourDetails,
  onFocusMapLocation,
}: DetourDossierModalProps) {
  return (
    <div
      className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/80 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDetourDetails();
      }}
    >
      <div
        ref={detourDialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`คำแนะนำเส้นทางเลี่ยง ${viewingDetourModal.route_name}`}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border-x-0 border-t border-b-0 border-sky-950 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[88dvh] sm:max-w-[30.625rem] sm:rounded-[1.75rem] sm:border-0 sm:ring-1 sm:ring-sky-950"
      >
        {/* 1. Top Header Bar (Fixed outside scroll container) */}
        <div className="shrink-0 z-20 border-b border-slate-800/80 bg-[#0c182e] px-4 pb-3 pt-2.5 shadow-md">
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ArrowLeftRight className="w-6 h-6 text-[#f59e0b] stroke-[2.8] shrink-0" />
              <h3 className="font-heading text-lg sm:text-xl font-bold tracking-wide text-white truncate">
                เส้นทางเลี่ยง
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded-full border border-amber-500/70 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-300 shadow-xs whitespace-nowrap">
                {detourDirectionDetailedBadge(viewingDetourModal.direction_mode)}
              </span>
              <button
                ref={detourCloseRef}
                type="button"
                onClick={closeDetourDetails}
                className="grid min-h-[2.75rem] min-w-[2.75rem] sm:min-h-9 sm:min-w-9 sm:h-9 sm:w-9 place-items-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                aria-label="ปิดหน้าต่างคำแนะนำทางเลี่ยง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4">
          {/* 2. Sub-header Card (Route Info Card) */}
          {(() => {
            const linkedEvents = getLinkedEventsForDetour(viewingDetourModal, systemData);
            const scopeText = linkedEvents.length > 0
              ? linkedEvents
                .map((ev) => `ทล.${ev.routeNo} (${ev.sectionName || ev.kmRangeLabel})${ev.kmRangeLabel ? ` · ${ev.kmRangeLabel}` : ""}`)
                .join(" | ")
              : viewingDetourModal.description && viewingDetourModal.description.includes("ทล.")
                ? viewingDetourModal.description.split("\n")[0].replace(/^===?\s*/, "").replace(/\s*===?$/, "")
                : "โครงข่ายทางหลวงแผ่นดิน แขวงทางหลวงปัตตานี";

            return (
              <div className="rounded-2xl border border-sky-800/80 bg-[#0e2146] p-3.5 flex items-center gap-3.5 shadow-md">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-[#0284c7] flex items-center justify-center text-white shadow-sm">
                  <Link2 className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-heading text-sm sm:text-base font-bold text-white leading-snug break-words [overflow-wrap:anywhere]">
                    {viewingDetourModal.route_name}
                  </h4>
                  <p className="text-xs text-sky-200/90 font-medium leading-normal mt-0.5 break-words">
                    {scopeText}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Optional: Linked Flood Event Photos */}
          {(() => {
            const linkedEvents = getLinkedEventsForDetour(viewingDetourModal, systemData);
            const photoFloods = linkedEvents
              .map((ev) => ev.primaryFlood)
              .filter((f) => Boolean(f?.latest_photo_url));
            if (photoFloods.length === 0) return null;
            return (
              <details className="rounded-xl border border-slate-700/80 bg-slate-900/70">
                <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-semibold text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                  ดูภาพประกอบจุดเกิดเหตุน้ำท่วม{photoFloods.length > 1 ? ` (${photoFloods.length} จุด)` : ""}
                </summary>
                <div className="space-y-2 p-2 bg-slate-950 rounded-b-xl">
                  {photoFloods.map((linked) => (
                    <div key={linked.id} className="relative overflow-hidden rounded-lg bg-slate-950">
                      <img
                        src={normalizeMediaUrl(linked.latest_photo_url)}
                        alt="ภาพจุดน้ำท่วมที่ผูกกับทางเลี่ยง"
                        className="w-full h-40 object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent p-2 text-xs text-white">
                        <span className="font-bold text-amber-300">จุดเกิดเหตุ:</span> ทล.{linked.route_no} {linked.section_name} (กม.{linked.km_start} - {linked.km_end})
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}

          {/* 3. Direction Selector */}
          <section aria-label="เลือกทิศทางการเดินทาง">
            <label className="text-sm font-semibold text-slate-200 block mb-2">
              เลือกทิศทางการเดินทาง
            </label>
            <DirectionSwitch
              fullWidth
              ariaLabel="เลือกทิศทางการเดินทาง"
              value={modalDetourDirection}
              onChange={setModalDetourDirection}
              options={[
                {
                  value: "FORWARD",
                  label: "ขาไป (A → B)",
                  ariaLabel: "ขาไป A → B",
                  disabled: !isDetourDirectionAllowed(viewingDetourModal.direction_mode, "FORWARD"),
                },
                {
                  value: "REVERSE",
                  label: "ขากลับ (B → A)",
                  ariaLabel: "ขากลับ B → A",
                  disabled: !isDetourDirectionAllowed(viewingDetourModal.direction_mode, "REVERSE"),
                },
              ]}
            />
            {!isRecordedDetourDirection(viewingDetourModal.direction_mode) && (
              <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1.5" role="status">
                <span>⚠️</span>ยังไม่ได้ยืนยันทิศทางเดินรถ กรุณาตรวจสอบกับเจ้าหน้าที่ก่อนเดินทาง
              </p>
            )}
            {(() => {
              const activePointPhoto =
                modalDetourDirection === "REVERSE"
                  ? viewingDetourModal.detour_meta?.end_point_photo
                  : viewingDetourModal.detour_meta?.start_point_photo;
              if (!activePointPhoto?.url) return null;
              const pointLabel =
                modalDetourDirection === "REVERSE"
                  ? "จุดสิ้นสุด B — ภาพทางเข้าทางเลี่ยง (ฝั่งขากลับ B → A)"
                  : "จุดเริ่มต้น A — ภาพทางเข้าทางเลี่ยง (ฝั่งขาไป A → B)";
              return (
                <div className="mt-2.5 rounded-xl border border-slate-700/80 bg-[#0d1b36] p-2.5 space-y-1.5">
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
          </section>

          {/* 4. Timeline (คำแนะนำเส้นทาง) + 5. Metrics + 6. Condition */}
          {(() => {
            const parsed = splitDetourAdviceByDirection(
              viewingDetourModal.description || "",
              viewingDetourModal.direction_mode
            );
            const adviceText = modalDetourDirection === "FORWARD" ? parsed.forwardText : parsed.reverseText;
            const meters = detourDistanceMeters(viewingDetourModal.detour_meta, modalDetourDirection);
            const durationSeconds = detourDurationSeconds(viewingDetourModal.detour_meta, modalDetourDirection);
            const fwdCoords = parseRouteCoordinates(viewingDetourModal.coordinates_json);
            const revCoords = parseRouteCoordinates(viewingDetourModal.reverse_coordinates_json);
            const polyCoords =
              modalDetourDirection === "REVERSE" && revCoords.length > 0
                ? revCoords
                : fwdCoords;
            const fallbackPolyKm = calculatePolylineRoadDistanceKm(polyCoords);
            const linked = getLinkedEventsForDetour(viewingDetourModal, systemData)[0]?.primaryFlood ?? null;
            const baseStartHint = linked ? `ทล.${linked.route_no} (${linked.section_name})` : viewingDetourModal.route_name;
            const areaText = linked ? formatFloodAreaLine(linked) : null;
            const baseEndHint = areaText ? `(${areaText})` : "";
            const effectiveStartHint =
              modalDetourDirection === "REVERSE" ? (baseEndHint || baseStartHint) : baseStartHint;
            const effectiveEndHint =
              modalDetourDirection === "REVERSE" ? baseStartHint : baseEndHint;

            const timeline = getDetourTimelinePresentation(
              adviceText,
              meters,
              fallbackPolyKm,
              effectiveStartHint,
              effectiveEndHint,
              viewingDetourModal.detour_meta?.road_condition,
              durationSeconds
            );

            return (
              <section aria-label="คำแนะนำเส้นทาง" className="space-y-3 pt-1">
                {/* Section Header */}
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                  <Route className="w-5 h-5 text-[#f59e0b]" />
                  <span>คำแนะนำเส้นทาง</span>
                </div>

                {/* Step Timeline Container (numbered strictly for travel steps 1..N) */}
                {timeline.steps.length > 0 ? (
                  <div className="relative space-y-3 pl-1">
                    {/* Vertical Connector Line */}
                    {timeline.steps.length > 1 && (
                      <div
                        aria-hidden="true"
                        className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-slate-600/70"
                      />
                    )}

                    {timeline.steps.map((st) => (
                      <div key={st.stepNumber} className="relative flex items-start">
                        {/* Step Number Circle */}
                        <div
                          aria-hidden="true"
                          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-xs font-black text-slate-950 shadow-md"
                        >
                          {st.stepNumber}
                        </div>

                        {/* Step Card */}
                        <div className="ml-3 flex-1 min-w-0 rounded-2xl border border-slate-800 bg-[#0d1b36] p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {renderStepIcon(st.iconType)}
                              <span className="font-heading font-bold text-sm text-amber-300 break-words">
                                {st.title}
                              </span>
                            </div>
                            <span className="rounded-md border border-slate-700/80 bg-slate-900/90 px-2 py-0.5 font-mono text-xs text-slate-300 whitespace-nowrap shrink-0">
                              {st.badge}
                            </span>
                          </div>
                          {st.detail && (
                            <p className="text-xs text-slate-300 mt-1 leading-normal break-words">
                              {st.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-500/40 bg-slate-900/80 p-3.5 text-xs text-amber-200 leading-relaxed">
                    {timeline.directionNotice || "ไม่มีข้อมูลขั้นตอนการเดินทางสำหรับทิศทางนี้"}
                  </div>
                )}

                {/* 5. Metrics Bar: ระยะทางรวม & เวลาโดยประมาณ */}
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <div className="rounded-2xl border border-slate-800/80 bg-[#0e1c36] px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                    <Route aria-hidden="true" className="w-4 h-4 text-slate-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[0.75rem]/[1.1rem] text-slate-400">ระยะทางรวม</div>
                      <strong className="font-heading font-bold text-sm text-white block">
                        {timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุ"}
                      </strong>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-[#0e1c36] px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                    <Clock aria-hidden="true" className="w-4 h-4 text-slate-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[0.75rem]/[1.1rem] text-slate-400">เวลาโดยประมาณ</div>
                      <strong className="font-heading font-bold text-xs sm:text-sm text-white block break-words">
                        {timeline.estimatedMinutes !== null ? `${timeline.estimatedMinutes} นาที` : timeline.estimatedDurationText}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 6. Road Condition Bar: สภาพเส้นทาง */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-200">
                    <Milestone className="w-4 h-4 text-slate-300" />
                    <span>สภาพเส้นทาง</span>
                  </div>
                  <div className="rounded-full border border-emerald-500/70 bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{timeline.roadCondition}</span>
                  </div>
                </div>
              </section>
            );
          })()}
        </div>

        {/* 7. Bottom Action Footer (Outside scroll container — zero scroll overlap) */}
        {(() => {
          const nav = resolveDetourGoogleMapsNavigation(
            viewingDetourModal,
            modalDetourDirection,
            systemData.floodRoutes
          );

          const getFocusCoords = (): [number, number] | undefined => {
            const fwdCoords = parseRouteCoordinates(viewingDetourModal.coordinates_json);
            const revCoords = parseRouteCoordinates(viewingDetourModal.reverse_coordinates_json);
            if (modalDetourDirection === "REVERSE") {
              if (revCoords.length > 0 && Number.isFinite(revCoords[0][0]) && Number.isFinite(revCoords[0][1])) {
                return revCoords[0];
              }
              if (Number.isFinite(viewingDetourModal.lon_end) && Number.isFinite(viewingDetourModal.lat_end)) {
                return [viewingDetourModal.lon_end, viewingDetourModal.lat_end];
              }
              if (fwdCoords.length > 0) {
                const last = fwdCoords[fwdCoords.length - 1];
                if (Number.isFinite(last[0]) && Number.isFinite(last[1])) return last;
              }
            }
            if (Number.isFinite(viewingDetourModal.lon_start) && Number.isFinite(viewingDetourModal.lat_start)) {
              return [viewingDetourModal.lon_start, viewingDetourModal.lat_start];
            }
            if (fwdCoords.length > 0 && Number.isFinite(fwdCoords[0][0]) && Number.isFinite(fwdCoords[0][1])) {
              return fwdCoords[0];
            }
            return undefined;
          };

          return (
            <div className="shrink-0 z-20 space-y-2 border-t border-slate-800/90 bg-[#081120] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_20px_rgba(8,17,32,0.95)] sm:rounded-b-[1.75rem]">
              <div className="flex flex-col sm:flex-row sm:items-stretch gap-2.5">
                {nav.isValid && nav.url ? (
                  <a
                    href={nav.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:flex-[1.35] min-h-[2.75rem] flex items-center justify-between rounded-2xl bg-[#10b981] hover:bg-[#059669] px-3.5 py-2.5 text-white shadow-lg shadow-emerald-950/40 transition-all touch-manipulation cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-white p-1 flex items-center justify-center shadow">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                          <path fill="#EA4335" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <circle fill="#FFFFFF" cx="12" cy="9" r="2.8" />
                          <circle fill="#4285F4" cx="12" cy="9" r="1.8" />
                        </svg>
                      </div>
                      <div className="text-left min-w-0">
                        <div className="font-heading text-xs sm:text-sm font-bold text-white leading-tight truncate">
                          ดูบน Google Maps
                        </div>
                        <div className="text-[0.75rem]/[1.1rem] font-medium text-emerald-100 mt-0.5 truncate">
                          {modalDetourDirection === "FORWARD" ? "(ขาไป A ➔ B)" : "(ขากลับ B ➔ A)"}
                        </div>
                      </div>
                    </div>
                    <ExternalLink aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                ) : (
                  <div className="w-full sm:flex-[1.35] min-h-[2.75rem] flex items-center justify-center rounded-2xl border border-amber-500/40 bg-slate-900 px-3.5 py-2.5 text-center text-xs text-amber-200">
                    ⚠️ {nav.warning || "เส้นทางยังไม่พร้อมสำหรับการนำทาง"}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onFocusMapLocation(getFocusCoords())}
                  className="w-full sm:flex-1 min-h-[2.75rem] flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-[#13203c] hover:bg-[#1a2b50] px-3.5 py-2.5 font-heading text-xs sm:text-sm font-bold text-white shadow transition-all touch-manipulation cursor-pointer shrink-0"
                >
                  <BookOpen aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0" />
                  <span>ดูตำแหน่งบนแผนที่</span>
                </button>
              </div>
              {nav.disclaimer && (
                <details className="text-xs text-slate-300">
                  <summary className="cursor-pointer py-0.5 text-center text-slate-300 underline underline-offset-2 hover:text-white">ข้อควรทราบก่อนนำทาง</summary>
                  <p className="mt-1 text-center leading-relaxed text-slate-300">{nav.disclaimer}</p>
                </details>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
