"use client";

import React from "react";
import type { StatusColor } from "@/lib/traffic-presentation";
import { SUMMARY_ITEMS } from "@/components/public/public-route-helpers";

export function SituationSummary({
  counts,
  activeFilter = "ALL",
  onFilter,
}: {
  counts: Record<StatusColor, number>;
  activeFilter?: StatusColor | "ALL";
  onFilter?: (color: StatusColor) => void;
}) {
  const visible = SUMMARY_ITEMS.filter((item) => counts[item.color] > 0);
  if (visible.length === 0) return <p className="text-xs text-slate-300">ยังไม่มีจุดเฝ้าระวังที่รายงานในขณะนี้</p>;
  return (
    <ul aria-label="สรุปสถานการณ์ทุกจุด" className="flex flex-wrap gap-1.5 text-xs text-slate-200">
      {visible.map((item) => (
        <li key={item.color}>
          {onFilter ? (
            <button
              type="button"
              aria-pressed={activeFilter === item.color}
              onClick={() => onFilter(item.color)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-left whitespace-nowrap leading-snug tracking-normal transition touch-manipulation cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                activeFilter === item.color
                  ? "border-amber-400/80 bg-surface-card ring-1 ring-amber-400/50 text-white"
                  : "border-surface bg-surface-panel/70 hover:bg-surface-card text-slate-200"
              }`}
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
              <strong className="font-mono text-sm text-white">{counts[item.color]}</strong>
              <span>{item.label}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-surface bg-surface-panel/70 px-2.5 py-1 whitespace-nowrap leading-snug tracking-normal">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
              <strong className="font-mono text-sm text-white">{counts[item.color]}</strong>
              <span>{item.label}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
