"use client";

import { Check, CircleCheck, CircleHelp, CircleMinus, TriangleAlert, CarFront, Gauge } from "lucide-react";
import type { StatusColor } from "@/lib/traffic-presentation";
import { SUMMARY_ITEMS } from "@/components/public/public-route-helpers";

const summaryIcons = {
  red: CircleMinus,
  orange: CarFront,
  amber: TriangleAlert,
  sky: Gauge,
  emerald: CircleCheck,
  slate: CircleHelp,
} satisfies Record<StatusColor, typeof CircleMinus>;

export function SituationSummary({
  counts,
  activeFilter = "ALL",
  onFilter,
}: {
  counts: Record<StatusColor, number>;
  activeFilter?: StatusColor | "ALL";
  onFilter: (color: StatusColor) => void;
}) {
  const visible = SUMMARY_ITEMS.filter((item) => counts[item.color] > 0);
  if (visible.length === 0) return <p className="text-xs text-slate-300">ยังไม่มีจุดเฝ้าระวังที่รายงานในขณะนี้</p>;

  return (
    <ul aria-label="สรุปสถานการณ์ทุกจุด" className="citizen-status-card-list">
      {visible.map((item) => {
        const Icon = summaryIcons[item.color];
        const selected = activeFilter === item.color;
        return (
          <li key={item.color}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${counts[item.color]} ${item.label}`}
              data-traffic-card={item.color}
              onClick={() => onFilter(item.color)}
              className="citizen-traffic-card"
            >
              <span className="citizen-traffic-card-top" aria-hidden="true">
                <Icon size={15} />
                <strong>{counts[item.color]}</strong>
                {selected && <Check className="citizen-traffic-card-check" size={14} />}
              </span>
              <span className="citizen-traffic-card-label">{item.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
