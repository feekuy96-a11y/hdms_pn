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
    <ul aria-label="สรุปสถานการณ์ทุกจุด" className="grid grid-cols-2 gap-1.5 text-xs text-slate-200 lg:grid-cols-3">
      {visible.map((item) => (
        <li key={item.color}>
          {onFilter ? (
            <button
              type="button"
              aria-pressed={activeFilter === item.color}
              onClick={() => onFilter(item.color)}
              className={`inline-flex min-h-11 w-full items-center gap-1.5 rounded-md px-[0.667em] py-[0.333em] text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${activeFilter === item.color ? "bg-slate-700/90 ring-1 ring-amber-400/70" : "hover:bg-slate-800/80"
                }`}
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
              <strong className="font-mono text-sm text-white">{counts[item.color]}</strong> {item.label}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
              <strong className="font-mono text-sm text-white">{counts[item.color]}</strong> {item.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
