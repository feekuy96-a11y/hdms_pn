"use client";

import React from "react";
import { ChevronRight, Clock, Droplets, MapPin } from "lucide-react";
import type { FloodRoute } from "@/db/default-data";
import { parseFloodDirectionMeta, resolveEffectiveRoadSide } from "@/lib/flood-event-schema";
import {
  formatRelativeUpdateTime,
  getTrafficPresentation,
  type TrafficStatus,
} from "@/lib/traffic-presentation";
import {
  formatFloodAreaLine,
  formatFloodSideShortLabel,
  formatKmText,
  STATUS_BAR,
  STATUS_CHIP,
} from "@/components/public/public-route-helpers";

// Compact 6-group flood situation card shared between desktop sidebar and mobile drawer.
export function FloodCard({
  flood,
  selected,
  detourCount,
  onSelect,
  onOpenDetours,
}: {
  flood: FloodRoute;
  selected: boolean;
  detourCount: number;
  onSelect: (flood: FloodRoute) => void;
  onOpenDetours: (flood: FloodRoute) => void;
}) {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const status = getTrafficPresentation(flood.traffic_status as TrafficStatus, flood.water_level_cm, meta.trafficStatusDetail);
  const sideLabel = formatFloodSideShortLabel(resolveEffectiveRoadSide(flood));
  const areaLine = formatFloodAreaLine(flood);
  const routeLabel = /^(?:ทล|ปน)\.?\s*/i.test(flood.route_no) ? flood.route_no : `ทล.${flood.route_no}`;
  const trimmedSection = flood.section_name.trim();
  const sectionLabel = trimmedSection.startsWith("ตอน") ? trimmedSection : `ตอน ${trimmedSection}`;
  const waterDisplay = meta.waterLevelKnown === false && flood.water_level_cm === 0 ? "รอตรวจสอบ" : `${flood.water_level_cm} ซม.`;
  const relativeUpdated = formatRelativeUpdateTime(flood.updated_at || meta.updatedAt);

  const detailActionButton = (
    <button
      type="button"
      onClick={() => onSelect(flood)}
      className="inline-flex min-h-11 sm:min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-xl border border-surface bg-slate-900/90 px-3 py-1.5 font-heading text-xs font-bold tracking-normal text-amber-300 whitespace-nowrap transition hover:border-amber-400/60 hover:bg-slate-800 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span>ดูรายละเอียด</span>
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </button>
  );

  return (
    <article
      className={`relative w-full rounded-2xl border bg-surface-card py-2.5 pl-3.5 pr-3 sm:py-3 sm:pl-4 sm:pr-3.5 text-left transition ${selected ? "border-amber-400 ring-1 ring-amber-400/50" : "border-surface hover:border-amber-400/70"
        }`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ backgroundColor: STATUS_BAR[status.color] }} />

      {/* Groups 1–4 inside summary button (non-nested with Group 5 detour button & Group 6 detail button) */}
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(flood)}
        className="block w-full min-w-0 cursor-pointer rounded-xl text-left touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {/* Group 1: Route & Section + Traffic Status */}
        <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] font-heading text-sm font-bold leading-snug tracking-normal text-white">
            {routeLabel} · {sectionLabel}
          </span>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold leading-snug tracking-normal ${STATUS_CHIP[status.color]}`}>
            <span aria-hidden="true">{status.icon}</span>
            <span>{status.label}</span>
          </span>
        </span>

        {/* Group 2: KM Range (before Area) */}
        <span className="mt-1 block text-xs font-medium text-amber-200/95">
          {formatKmText(flood.km_start)} – {formatKmText(flood.km_end)}
        </span>

        {/* Group 3: Real Area Coordinates (never hardcoded) */}
        {areaLine && (
          <span className="mt-0.5 flex min-w-0 items-start gap-1 text-xs text-slate-300">
            <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="min-w-0 break-words leading-snug">{areaLine}</span>
          </span>
        )}

        {/* Group 4: Water Level & Flooded Side */}
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-200">
          <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-950/50 px-2 py-0.5 text-sky-100">
            <Droplets aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-300" />
            <span className="text-sky-200/90">ระดับน้ำ</span>
            <strong className="font-mono text-[0.8125rem] sm:text-sm font-bold text-white">{waterDisplay}</strong>
          </span>
          {sideLabel && (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-lg border border-surface bg-slate-900/70 px-2 py-0.5 text-sky-200">
              <span className="text-slate-400">ฝั่งน้ำท่วม</span>
              <strong className="font-semibold text-white">{sideLabel}</strong>
            </span>
          )}
        </span>
      </button>

      {/* Groups 5–6: Compact Timestamp + Action Bar (44px touch targets on mobile) */}
      {detourCount > 0 ? (
        <div className="mt-2 border-t border-surface pt-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{relativeUpdated}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenDetours(flood)}
              className="inline-flex min-h-11 sm:min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-300 whitespace-nowrap transition hover:bg-amber-500/25 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <span>เส้นทางเลี่ยง {detourCount} สาย</span>
            </button>
            {detailActionButton}
          </div>
        </div>
      ) : (
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-surface pt-1.5 text-xs">
          <div className="min-w-0 flex-1 space-y-0.5 text-slate-400">
            <span className="flex items-center gap-1">
              <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{relativeUpdated}</span>
            </span>
            <span className="block truncate text-[0.75rem] text-slate-400">ไม่มีเส้นทางเลี่ยง</span>
          </div>
          {detailActionButton}
        </div>
      )}
    </article>
  );
}
