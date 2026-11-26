"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Droplets,
  EyeOff,
  Route,
  X,
} from "lucide-react";
import type { DetourRoute, SystemDataPayload } from "@/db/default-data";
import {
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import {
  resolveDetourFocusGeometry,
  resolveFloodFocusData,
  type GisFocusDirection,
  type GisFocusState,
} from "@/lib/gis-focus-mode";
import { splitDetourAdviceByDirection } from "@/lib/gis-utils";
import {
  calculatePolylineRoadDistanceKm,
  detourDistanceMeters,
  detourDurationSeconds,
  getDetourTimelinePresentation,
} from "@/lib/detour-presentation";
import { parseRouteCoordinates } from "@/components/public/public-route-helpers";

export interface GisFocusModeBarProps {
  focusState: GisFocusState;
  systemData: SystemDataPayload;
  onExit: () => void;
  onChangeDirection: (direction: GisFocusDirection) => void;
  onToggleLinkedDetour: (show: boolean, detourId?: string | null) => void;
}

export function GisFocusModeBar({
  focusState,
  systemData,
  onExit,
  onChangeDirection,
  onToggleLinkedDetour,
}: GisFocusModeBarProps) {
  const [isTimelineOpen, setIsTimelineOpen] = React.useState(false);
  const [isCompactControlsOpen, setIsCompactControlsOpen] = React.useState(false);
  if (focusState.status !== "focused" || !focusState.targetType || !focusState.targetId) {
    return null;
  }

  const isDetour = focusState.targetType === "DETOUR";
  const detourTarget: DetourRoute | null = isDetour
    ? (systemData.detourRoutes || []).find((d) => d.id === focusState.targetId) ?? null
    : null;

  const floodData = !isDetour
    ? resolveFloodFocusData(focusState.targetId, systemData)
    : null;

  const targetMissing = isDetour ? !detourTarget : !floodData?.primaryFlood;

  const detourGeom = isDetour
    ? resolveDetourFocusGeometry(detourTarget, focusState.direction)
    : null;

  const linkedDetour: DetourRoute | null =
    !isDetour && floodData && floodData.linkedDetours.length > 0
      ? floodData.linkedDetours.find((d) => d.id === focusState.linkedDetourId) ??
        floodData.linkedDetours[0]
      : null;

  const activeDetourForDir = isDetour
    ? detourTarget
    : focusState.showLinkedDetour
      ? linkedDetour
      : null;

  const canSwitchForward = activeDetourForDir
    ? isDetourDirectionAllowed(activeDetourForDir.direction_mode, "FORWARD")
    : false;
  const canSwitchReverse = activeDetourForDir
    ? isDetourDirectionAllowed(activeDetourForDir.direction_mode, "REVERSE")
    : false;
  const showDirectionToggle = Boolean(activeDetourForDir && canSwitchForward && canSwitchReverse);

  const timeline = activeDetourForDir ? (() => {
    const adviceByDirection = splitDetourAdviceByDirection(
      activeDetourForDir.description || "",
      activeDetourForDir.direction_mode
    );
    const advice = focusState.direction === "REVERSE"
      ? adviceByDirection.reverseText
      : adviceByDirection.forwardText;
    const coordinates = focusState.direction === "REVERSE"
      ? parseRouteCoordinates(activeDetourForDir.reverse_coordinates_json).length > 0
        ? parseRouteCoordinates(activeDetourForDir.reverse_coordinates_json)
        : parseRouteCoordinates(activeDetourForDir.coordinates_json)
      : parseRouteCoordinates(activeDetourForDir.coordinates_json);
    return getDetourTimelinePresentation(
      advice,
      detourDistanceMeters(activeDetourForDir.detour_meta, focusState.direction),
      calculatePolylineRoadDistanceKm(coordinates),
      "จุดเริ่มต้น",
      "จุดสิ้นสุด",
      activeDetourForDir.detour_meta?.road_condition,
      detourDurationSeconds(activeDetourForDir.detour_meta, focusState.direction)
    );
  })() : null;

  const hasMissingGeometry = targetMissing
    ? false
    : isDetour
      ? (detourGeom?.coords.length ?? 0) === 0 && !detourGeom?.startCoord
      : (floodData?.coordsList.length ?? 0) === 0 && (floodData?.pointFallbacks.length ?? 0) === 0;

  // Check if a focused detour has a linked active flood warning
  const detourImpactWarning = (() => {
    if (!isDetour || !detourTarget) return null;
    const linkedFlood = (systemData.floodRoutes || []).find(
      (f) => f.id === detourTarget.flood_id_ref && f.is_active !== false && f.water_level_cm > 0
    );
    if (!linkedFlood) return null;
    const status = getTrafficPresentation(linkedFlood.traffic_status);
    return `หลีกเลี่ยงจุดน้ำท่วม ทล.${linkedFlood.route_no} (${status.label})`;
  })();

  const floodStatus = floodData?.primaryFlood
    ? getTrafficPresentation(floodData.primaryFlood.traffic_status)
    : null;

  const title = targetMissing
    ? "ไม่พบข้อมูลรายการที่เลือก"
    : isDetour
      ? detourTarget!.route_name
      : `ทล.${floodData!.primaryFlood!.route_no} ${floodData!.primaryFlood!.section_name}`;

  return (
    <>
      <div
      role="region"
      aria-label="แถบโหมดโฟกัสแผนที่"
      data-testid="gis-focus-mode-bar"
      className="citizen-map-focus pointer-events-auto absolute inset-x-2 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.75rem)] z-[620] mx-auto max-w-2xl rounded-2xl border border-amber-400/50 bg-[#081120]/95 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-14 sm:w-[min(32rem,calc(100%-17.5rem))] sm:-translate-x-1/2 sm:px-4 sm:py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-heading font-bold whitespace-nowrap ${
                isDetour
                  ? "bg-amber-400 text-slate-950"
                  : "bg-sky-500 text-slate-950"
              }`}
            >
              {isDetour ? (
                <ArrowLeftRight aria-hidden="true" className="h-3 w-3 shrink-0" />
              ) : (
                <Droplets aria-hidden="true" className="h-3 w-3 shrink-0" />
              )}
              <span>{isDetour ? "โหมดโฟกัส: เส้นทางเลี่ยง" : "โหมดโฟกัส: เหตุการณ์น้ำท่วม"}</span>
            </span>

            <span className="hidden items-center gap-1 rounded-full border border-slate-700 bg-slate-900/90 px-2 py-0.5 text-[0.6875rem] text-slate-300 whitespace-nowrap sm:inline-flex">
              <EyeOff aria-hidden="true" className="h-3 w-3 shrink-0 text-amber-300" />
              <span>ซ่อนชั้นข้อมูลอื่นชั่วคราว</span>
            </span>
          </div>

          <h2 className="truncate font-heading text-sm font-bold text-white sm:text-base">
            {title}
          </h2>

          {/* Key Status Summary */}
          {!targetMissing && isDetour && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-300">
              <span className="font-semibold text-amber-300">
                ทิศทาง: {focusState.direction === "FORWARD" ? "ขาไป (A → B)" : "ขากลับ (B → A)"}
              </span>
              {detourImpactWarning && (
                <span className="inline-flex items-center gap-1 text-amber-200">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{detourImpactWarning}</span>
                </span>
              )}
            </div>
          )}

          {!targetMissing && !isDetour && floodData && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-200">
              {floodData.isResolved ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-950/70 px-2 py-0.5 font-semibold text-emerald-300">
                  {floodData.hasConfirmedZero
                    ? "สถานการณ์คลี่คลายแล้ว (ระดับน้ำ 0 ซม. — ไม่แสดงเป็นจุดน้ำท่วมที่มีผลกระทบ)"
                    : "เหตุการณ์นี้ไม่แสดงเป็นจุดน้ำท่วมปัจจุบัน"}
                </span>
              ) : (
                <>
                  <span className="font-bold text-rose-300">
                    {floodData.hasKnownWaterLevel ? `ระดับน้ำ ${floodData.maxWaterLevelCm} ซม.` : "รอตรวจสอบระดับน้ำ"}
                  </span>
                  {floodData.sideSummary && (
                    <span className="hidden text-sky-200 sm:inline">{floodData.sideSummary}</span>
                  )}
                  {floodStatus && (
                    <span className="hidden rounded-md border border-amber-500/40 bg-slate-900 px-1.5 py-0.5 font-semibold text-amber-200 sm:inline">
                      {floodStatus.label}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Missing target or geometry resilience warning */}
          {(targetMissing || hasMissingGeometry) && (
            <p role="alert" className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>
                {targetMissing
                  ? "รายการนี้อาจถูกลบหรือปิดเหตุการณ์แล้วระหว่างดูข้อมูล"
                  : "ไม่พบข้อมูลพิกัดเส้นทางของรายการนี้ จึงไม่สามารถปรับซูมไปยังเส้นได้"}
              </span>
            </p>
          )}
        </div>

        {/* Exit Focus Button */}
        <button
          type="button"
          onClick={onExit}
          aria-label="ออกจากโหมดโฟกัส"
          data-testid="gis-focus-exit-btn"
          className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-heading text-xs font-bold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:px-3"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="sm:hidden">ออก</span>
          <span className="hidden sm:inline">ออกจากโหมดโฟกัส</span>
          <kbd className="hidden rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[0.65rem] text-slate-300 sm:inline">
            Esc
          </kbd>
        </button>
      </div>

      {!targetMissing && (showDirectionToggle || (!isDetour && linkedDetour) || timeline) && (
        <button
          type="button"
          aria-expanded={isCompactControlsOpen}
          aria-controls="gis-focus-extra-controls"
          onClick={() => setIsCompactControlsOpen((open) => !open)}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1 font-heading text-xs font-bold text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:hidden"
        >
          <Route aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" />
          {isCompactControlsOpen ? "ซ่อนตัวเลือกเส้นทาง" : "ตัวเลือกเส้นทาง"}
        </button>
      )}

      {/* Action Controls Row: Linked Detour Overlay + A→B / B→A Switch */}
      {!targetMissing && (showDirectionToggle || (!isDetour && linkedDetour)) && (
        <div
          id="gis-focus-extra-controls"
          className={`mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800/90 pt-2 ${isCompactControlsOpen ? "flex" : "hidden"} sm:flex`}
        >
          {!isDetour && linkedDetour && (
            <button
              type="button"
              aria-pressed={focusState.showLinkedDetour}
              data-testid="gis-focus-toggle-linked-detour"
              onClick={() =>
                onToggleLinkedDetour(!focusState.showLinkedDetour, linkedDetour.id)
              }
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1 font-heading text-xs font-bold transition ${
                focusState.showLinkedDetour
                  ? "border-amber-400 bg-amber-400 text-slate-950"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Route aria-hidden="true" className="h-3.5 w-3.5" />
              <span>
                {focusState.showLinkedDetour
                  ? "ซ่อนทางเลี่ยงที่เกี่ยวข้อง"
                  : "แสดงทางเลี่ยงที่เกี่ยวข้อง"}
              </span>
            </button>
          )}

          {showDirectionToggle && (
            <div
              role="group"
              aria-label="สลับทิศทางเส้นทางเลี่ยง"
              className="citizen-focus-directions inline-flex rounded-xl border border-slate-700 bg-slate-950/90 p-0.5"
            >
              <button
                type="button"
                aria-pressed={focusState.direction === "FORWARD"}
                data-testid="gis-focus-dir-forward"
                onClick={() => onChangeDirection("FORWARD")}
                className={`min-h-8 cursor-pointer rounded-lg px-2.5 py-1 font-heading text-xs font-bold transition ${
                  focusState.direction === "FORWARD"
                    ? "bg-amber-400 text-slate-950"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                ขาไป A → B
              </button>
              <button
                type="button"
                aria-pressed={focusState.direction === "REVERSE"}
                data-testid="gis-focus-dir-reverse"
                onClick={() => onChangeDirection("REVERSE")}
                className={`min-h-8 cursor-pointer rounded-lg px-2.5 py-1 font-heading text-xs font-bold transition ${
                  focusState.direction === "REVERSE"
                    ? "bg-amber-400 text-slate-950"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                ขากลับ B → A
              </button>
            </div>
          )}
        </div>
      )}
      {timeline && (
        <div className={`mt-2 border-t border-slate-800/90 pt-2 ${isCompactControlsOpen ? "block" : "hidden"} sm:block`}>
          <button
            type="button"
            aria-expanded={isTimelineOpen}
            aria-controls="gis-focus-timeline-panel"
            onClick={() => setIsTimelineOpen((open) => !open)}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1 font-heading text-xs font-bold text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Route aria-hidden="true" className="h-3.5 w-3.5 text-amber-300" />
            {isTimelineOpen ? "ซ่อนคำแนะนำเส้นทาง" : "อ่านคำแนะนำเส้นทาง"}
          </button>
        </div>
      )}
      </div>

      {timeline && isTimelineOpen && (
        <aside
          id="gis-focus-timeline-panel"
          data-testid="gis-focus-timeline-panel"
          aria-label="รายละเอียดเส้นทางในโหมดโฟกัส"
          className="citizen-focus-timeline pointer-events-auto absolute inset-x-2 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+14.25rem)] z-[619] max-h-[min(44dvh,28rem)] overflow-hidden rounded-2xl border border-slate-700 bg-[#081120]/[0.98] text-slate-100 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[22rem] sm:max-h-[calc(100%-8rem)]"
        >
          <div className="citizen-focus-timeline-head flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5">
            <div className="min-w-0">
              <p className="citizen-focus-ink font-heading text-sm font-bold text-white">คำแนะนำเส้นทาง</p>
              <p className="citizen-focus-accent text-xs text-amber-300">{focusState.direction === "FORWARD" ? "ขาไป A → B" : "ขากลับ B → A"}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsTimelineOpen(false)}
              className="citizen-focus-timeline-close grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              aria-label="ปิดคำแนะนำเส้นทาง"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(min(44dvh,28rem)-3.5rem)] space-y-2.5 overflow-y-auto overscroll-contain p-3 sm:max-h-[calc(100dvh-12rem)]">
            {timeline.steps.length > 0 ? timeline.steps.map((step) => (
              <article key={step.stepNumber} className="citizen-focus-timeline-tile flex gap-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
                <span className="citizen-focus-timeline-number grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-black text-slate-950">{step.stepNumber}</span>
                <div className="min-w-0">
                  <p className="citizen-focus-ink text-sm font-bold text-amber-200">{step.title}</p>
                  {step.detail && <p className="citizen-focus-quiet mt-0.5 text-xs leading-relaxed text-slate-300">{step.detail}</p>}
                </div>
              </article>
            )) : (
              <p className="citizen-focus-timeline-tile citizen-focus-accent rounded-xl border border-amber-500/40 bg-slate-900/80 p-3 text-xs leading-relaxed text-amber-100">
                {timeline.directionNotice || "ยังไม่มีขั้นตอนเดินทางสำหรับทิศทางนี้"}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <p className="citizen-focus-timeline-tile citizen-focus-quiet rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-xs text-slate-300">ระยะทาง<br /><strong className="citizen-focus-ink text-sm text-white">{timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุ"}</strong></p>
              <p className="citizen-focus-timeline-tile citizen-focus-quiet rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-xs text-slate-300">เวลาโดยประมาณ<br /><strong className="citizen-focus-ink text-sm text-white">{timeline.estimatedMinutes !== null ? `${timeline.estimatedMinutes} นาที` : timeline.estimatedDurationText}</strong></p>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
