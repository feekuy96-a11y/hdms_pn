import type { CSSProperties } from "react";
import { MAP_STATUS_GLYPHS } from "@/lib/map-status-glyphs";
import { TRAFFIC_ACCENT, type StatusColor } from "@/lib/traffic-presentation";
import glyphStyle from "./SituationStatusGlyph.module.css";

export function TrafficStatusGlyph({ color }: { color: StatusColor }) {
  const glyph = MAP_STATUS_GLYPHS[color];
  return (
    <span className={glyphStyle.badge} style={{ "--status-sign-color": TRAFFIC_ACCENT[color] } as CSSProperties} aria-hidden="true">
      <svg className="hdms-status-sign" data-traffic-glyph={glyph.key} width="20" height="20" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path className="hdms-status-sign-halo" d={`${glyph.face} ${glyph.route}`} />
        <path className="hdms-status-sign-face" d={glyph.face} />
        <path className="hdms-status-sign-inset" d={glyph.inset} />
        <path className="hdms-status-sign-edge" d={glyph.face} />
        <path className="hdms-status-sign-route" d={glyph.route} />
      </svg>
    </span>
  );
}
