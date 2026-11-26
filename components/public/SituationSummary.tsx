"use client";

import { Check } from "lucide-react";
import type { StatusColor } from "@/lib/traffic-presentation";
import { SUMMARY_ITEMS } from "@/components/public/public-route-helpers";
import { MAP_STATUS_GLYPHS } from "@/lib/map-status-glyphs";
import glyphStyle from "./SituationStatusGlyph.module.css";

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
        const glyph = MAP_STATUS_GLYPHS[item.color];
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
                <span className="citizen-traffic-card-value">
                  <span className={glyphStyle.badge}>
                    <svg className="hdms-status-sign" data-traffic-glyph={glyph.key} width="20" height="20" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path className="hdms-status-sign-halo" d={`${glyph.face} ${glyph.route}`} />
                      <path className="hdms-status-sign-face" d={glyph.face} />
                      <path className="hdms-status-sign-inset" d={glyph.inset} />
                      <path className="hdms-status-sign-edge" d={glyph.face} />
                      <path className="hdms-status-sign-route" d={glyph.route} />
                    </svg>
                  </span>
                  <strong>{counts[item.color]}</strong>
                </span>
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
