"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Droplets,
  Circle,
  EyeOff,
  Route,
  X,
} from "lucide-react";
import type { DetourRoute, SystemDataPayload } from "@/db/default-data";
import {
  detourDistanceMeters,
  detourDurationSeconds,
  formatDetourDistanceKm,
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import { formatRelativeUpdateTime, getTrafficPresentation, resolveReportFreshness, type TrafficPresentation } from "@/lib/traffic-presentation";
import {
  resolveDetourFocusGeometry,
  resolveFloodFocusData,
  type GisFocusDirection,
  type GisFocusState,
} from "@/lib/gis-focus-mode";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { parseFloodDirectionMeta, resolveEffectiveRoadSide, resolveFloodWaterReading } from "@/lib/flood-event-schema";
import { formatFloodSideShortLabel, formatKmText } from "@/components/public/public-route-helpers";
const FOCUS_SEVERITY = {
  red: "border-[var(--status-danger-ink)] bg-[var(--status-danger-wash)] text-[var(--status-danger-ink)]",
  orange: "border-[var(--status-warning-high-ink)] bg-[var(--status-warning-high-wash)] text-[var(--status-warning-high-ink)]",
  amber: "border-[var(--status-warning-low-ink)] bg-[var(--status-warning-low-wash)] text-[var(--status-warning-low-ink)]",
  sky: "border-[var(--status-info-ink)] bg-[var(--status-info-wash)] text-[var(--status-info-ink)]",
  emerald: "border-[var(--status-normal-ink)] bg-[var(--status-normal-wash)] text-[var(--status-normal-ink)]",
  slate: "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-secondary)]",
} satisfies Record<TrafficPresentation["color"], string>;

function FloodFocusStatus({ status }: { status: TrafficPresentation }) {
  return (
    <strong data-flood-focus-status={status.color}
      className={`mr-1 inline-flex max-w-full flex-wrap items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${FOCUS_SEVERITY[status.color]}`}>
      <span aria-hidden="true">{status.icon}</span>{status.label}
    </strong>
  );
}

export interface GisFocusModeBarProps {
  focusState: GisFocusState;
  systemData: SystemDataPayload;
  onExit: () => void;
  onChangeDirection: (direction: GisFocusDirection) => void;
  onOpenLinkedDetour: (detourId: string, directions: GisFocusDirection[]) => void;
  linkedDirections?: GisFocusDirection[];
  onFloodDetails: (flood: NonNullable<ReturnType<typeof resolveFloodFocusData>["primaryFlood"]>) => void;
  onReturnToFlood?: () => void;
}

export function GisFocusModeBar({
  focusState,
  systemData,
  onExit,
  onChangeDirection,
  onOpenLinkedDetour,
  onFloodDetails,
  linkedDirections,
  onReturnToFlood,
}: GisFocusModeBarProps) {
  const [isCompactControlsOpen, setIsCompactControlsOpen] = React.useState(false);
  const [floodListFor, setFloodListFor] = React.useState<string | null>(null);
  const isFloodFocused = focusState.status === "focused" && focusState.targetType === "FLOOD";
  const [reportClock, setReportClock] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!isFloodFocused) return;
    const refreshClock = () => setReportClock(Date.now());
    refreshClock();
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, [isFloodFocused]);
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

  const linkedDetours = getLinkedDetoursForFlood(floodData?.primaryFlood, systemData).flatMap(entry => {
    const directions = (["FORWARD", "REVERSE"] as const).filter(direction =>
      isDetourDirectionAllowed(entry.detour.direction_mode, direction) &&
      (!entry.links.length || entry.links.some(link =>
        link.recommendation === "RECOMMENDED" && (link.detourDirection === direction || link.detourDirection === "TWO_WAY")
      ))
    );
    if (!directions.length) return [];
    const metrics = directions.flatMap(direction => {
      const distance = detourDistanceMeters(entry.detour.detour_meta, direction);
      const duration = detourDurationSeconds(entry.detour.detour_meta, direction);
      const parts = [distance === null ? "" : `${formatDetourDistanceKm(distance)} กม.`,
        duration === null ? "" : `ประมาณ ${Math.max(1, Math.round(duration / 60))} นาที`].filter(Boolean);
      return parts.length ? [`${direction === "FORWARD" ? "ขาไป" : "ขากลับ"}: ${parts.join(" · ")}`] : [];
    });
    return [{ route: entry.detour, directions, metrics }];
  });
  const singleLinked = linkedDetours.length === 1 ? linkedDetours[0] : null;
  const showLinkedChoices = floodListFor === focusState.targetId && linkedDetours.length > 1;
  const canSwitchForward = detourTarget && (!linkedDirections || linkedDirections.includes("FORWARD")) && isDetourDirectionAllowed(detourTarget.direction_mode, "FORWARD");
  const canSwitchReverse = detourTarget && (!linkedDirections || linkedDirections.includes("REVERSE")) && isDetourDirectionAllowed(detourTarget.direction_mode, "REVERSE");
  const showDirectionToggle = Boolean(canSwitchForward || canSwitchReverse);

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

  const floodRows = (floodData?.activeSegments ?? []).map(segment => {
    const status = getTrafficPresentation(segment.traffic_status, segment.water_level_cm, segment.direction_meta?.trafficStatusDetail);
    const sideMeta = parseFloodDirectionMeta(segment.direction_meta, segment);
    const fallbackSide = sideMeta.impactMode === "BOTH_SIDES" ? "ทั้งสองฝั่ง" :
      sideMeta.sideCode === "LT" ? "ซ้ายทาง" : sideMeta.sideCode === "RT" ? "ขวาทาง" : null;
    const side = formatFloodSideShortLabel(resolveEffectiveRoadSide(segment))?.replace(/ \((?:LT|RT)\)/g, "") ||
      fallbackSide || "ไม่ระบุฝั่ง";
    const water = resolveFloodWaterReading(segment.direction_meta, segment.water_level_cm);
    const start = segment.km_start, end = segment.km_end;
    const km = start ? `${formatKmText(start)}${end && end !== start ? `–${end}` : ""}` : "";
    return { id: segment.id, side, status, km, water, depth: segment.water_level_cm };
  });
  const floodUpdate = floodData?.primaryFlood?.updated_at;
  const freshness = resolveReportFreshness(floodUpdate, reportClock);
  const freshnessNote = freshness === "stale" ? " · โปรดตรวจสอบซ้ำ" : "";
  const title = targetMissing
    ? "ไม่พบข้อมูลรายการที่เลือก"
    : isDetour
      ? detourTarget!.route_name
      : `ทล.${floodData!.primaryFlood!.route_no} ${floodData!.primaryFlood!.section_name}`;

  return (
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

          {!isDetour && !floodData?.isResolved && floodRows.length === 1 && (
            <FloodFocusStatus status={floodRows[0].status} />
          )}
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
                <ul className="m-0 w-full list-none grid gap-1 p-0">
                  {floodRows.map(row => <li key={row.id} className="break-words tabular-nums">
                    {floodRows.length > 1 && <FloodFocusStatus status={row.status} />}
                    {row.side}{row.km ? ` · ${row.km}` : ""} · {row.water.known ? `ระดับน้ำ ${row.depth} ซม.` : "รอตรวจสอบระดับน้ำ"}
                  </li>)}
                </ul>
              )}
            </div>
          )}

          {!isDetour && floodData?.primaryFlood && (
            <p className="m-0 text-[0.6875rem] tabular-nums">
              <span className="citizen-freshness inline-flex flex-wrap items-center gap-1" data-freshness={freshness}>
                {freshness === "fresh" && <Circle aria-hidden="true" className="size-1.5 fill-current" />}
                {freshness === "unknown" ? "ยังไม่ยืนยันเวลาอัปเดต" : `${formatRelativeUpdateTime(floodUpdate)}${freshnessNote}`}
              </span>
            </p>
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

        <FocusExitButton onExit={onExit}/>

      </div>

      {!targetMissing && showDirectionToggle && (
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

      {!isDetour && floodData?.primaryFlood && (
        <div className="mt-2 grid gap-1.5 border-t border-[var(--border-subtle)] pt-2">
          <div className="flex flex-wrap gap-2">
            {singleLinked ? (
              <button type="button" data-testid="gis-focus-open-linked-detour"
                onClick={() => onOpenLinkedDetour(singleLinked.route.id, singleLinked.directions)}
                className="min-h-11 rounded-lg bg-[var(--cta-primary-bg)] px-3 py-1.5 text-xs font-bold tabular-nums text-[var(--cta-primary-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                ดูทางเลี่ยง
              </button>
            ) : linkedDetours.length > 1 && (
              <button type="button" data-testid="gis-focus-open-linked-detour" aria-expanded={showLinkedChoices}
                aria-controls={showLinkedChoices ? "gis-focus-linked-detours" : undefined}
                onClick={() => setFloodListFor(showLinkedChoices ? null : focusState.targetId)}
                className="min-h-11 rounded-lg bg-[var(--cta-primary-bg)] px-3 py-1.5 text-xs font-bold tabular-nums text-[var(--cta-primary-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                {showLinkedChoices ? "ซ่อนรายการทางเลี่ยง" : `ดูทางเลี่ยง (${linkedDetours.length} เส้น)`}
              </button>
            )}
            <button type="button" onClick={() => onFloodDetails(floodData.primaryFlood!)}
              className="hdms-map-control min-h-11 rounded-lg border px-3 py-1.5 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
              รายละเอียดน้ำท่วม
            </button>
          </div>
          {showLinkedChoices && (
            <ul id="gis-focus-linked-detours" aria-label="ทางเลี่ยงที่เกี่ยวข้อง" className="m-0 grid list-none gap-1.5 overflow-y-auto max-h-32 overscroll-contain p-0.5">
              {linkedDetours.map(({ route, directions, metrics }) => <li key={route.id}>
                <button type="button"
                  onClick={() => { setFloodListFor(null); onOpenLinkedDetour(route.id, directions); }}
                  className="w-full min-h-11 rounded-lg border border-[var(--hdms-control-edge)] bg-[var(--bg-input)] p-2 text-left text-xs tabular-nums text-[var(--text-primary)] hover:bg-[var(--state-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                  <strong className="block break-words">{route.route_name}</strong>
                  <span className="text-[var(--text-secondary)]">{directions.length === 2 ? "ไป–กลับ" : directions[0] === "FORWARD" ? "เฉพาะขาไป A → B" : "เฉพาะขากลับ B → A"}</span>
                  {metrics.map(line => <span className="block text-[var(--text-secondary)]" key={line}>{line}</span>)}
                </button>
              </li>)}
            </ul>
          )}
          {linkedDetours.length === 0 &&
            <p className="m-0 text-xs">ยังไม่มีทางเลี่ยงที่ยืนยันทิศทางสำหรับจุดนี้</p>}
        </div>
      )}
      {isDetour && onReturnToFlood && (
        <button type="button" onClick={onReturnToFlood} className="hdms-map-control mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg border px-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
          <ArrowLeft aria-hidden="true" className="size-4" />กลับไปจุดน้ำท่วม
        </button>
      )}
      {!targetMissing && showDirectionToggle && (
        <div id="gis-focus-extra-controls"
          className={`mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800/90 pt-2 ${isCompactControlsOpen ? "flex" : "hidden"} sm:flex`}>
          {showDirectionToggle && (
            <div
              role="group"
              aria-label="สลับทิศทางเส้นทางเลี่ยง"
              className="citizen-focus-directions hdms-contrast-switch hdms-guide-card inline-flex gap-0.5 rounded-xl border p-0.5"
            >
              {canSwitchForward && (
              <button
                type="button"
                aria-pressed={focusState.direction === "FORWARD"}
                data-testid="gis-focus-dir-forward"
                onClick={() => onChangeDirection("FORWARD")}
                className="min-h-8 cursor-pointer rounded-lg px-2.5 py-1 font-heading text-xs font-bold transition"
              >
                ขาไป A → B
              </button>
              )}
              {canSwitchReverse && (
              <button
                type="button"
                aria-pressed={focusState.direction === "REVERSE"}
                data-testid="gis-focus-dir-reverse"
                onClick={() => onChangeDirection("REVERSE")}
                className="min-h-8 cursor-pointer rounded-lg px-2.5 py-1 font-heading text-xs font-bold transition"
              >
                ขากลับ B → A
              </button>
              )}
            </div>
          )}
        </div>
      )}
      </div>
  );
}

// The compact variant has no citizen-only direction or dossier callbacks.
export function CompactGisFocusModeBar({ label, onExit }: { label: string; onExit: () => void }) {
  return (
    <div
      data-testid="admin-gis-focus-exit-bar"
      role="region"
      aria-label="แถบควบคุมโหมดโฟกัสบนแผนที่"
      className="pointer-events-auto absolute bottom-16 lg:bottom-4 left-1/2 -translate-x-1/2 z-[460] flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-sky-400/50 bg-surface-floating/95 py-1 pl-3.5 pr-1.5 text-xs font-heading text-slate-100 shadow-2xl backdrop-blur-md"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
      <span className="truncate max-w-[14rem] sm:max-w-[20rem] font-bold">
        โฟกัส: {label}
      </span>
      <FocusExitButton onExit={onExit} compact/>
    </div>
  );
}


function FocusExitButton({ onExit, compact = false }: { onExit: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onExit}
      aria-label={compact ? "ออกจากโฟกัส" : "ออกจากโหมดโฟกัส"}
      title={compact ? "ออกจากโหมดโฟกัส (Esc)" : undefined}
      data-testid="gis-focus-exit-btn"
      className={compact
        ? "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
        : "inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-heading text-xs font-bold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:px-3"}
    >
      <X aria-hidden="true" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {compact ? <span>ออกจากโฟกัส</span> : <>
        <span className="sm:hidden">ออก</span>
        <span className="hidden sm:inline">ออกจากโหมดโฟกัส</span>
        <kbd className="hdms-key-hint hidden rounded px-1.5 py-0.5 font-mono text-[0.65rem] sm:inline">Esc</kbd>
      </>}
    </button>
  );
}
