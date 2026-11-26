"use client";

import { ChevronDown, Route, Waves } from "lucide-react";

interface MapStatusRowProps {
  floods: number;
  detours: number;
  onFloods?: () => void;
  onDetours?: () => void;
  floodExpanded?: boolean;
  floodControlsId?: string;
  label?: string;
}

/** The two map counters use one visual language. Only views that supply an action expose a button. */
export function MapStatusRow({ floods, detours, onFloods, onDetours, floodExpanded, floodControlsId, label }: MapStatusRowProps) {
  return (
    <div className="hdms-map-status-head citizen-map-status-head" aria-label={label}>
      {([
        { id: "flood", Icon: Waves, text: `น้ำท่วม ${floods} จุด`, onClick: onFloods },
        { id: "detours", Icon: Route, text: `ทางเลี่ยง ${detours} เส้นทาง`, onClick: onDetours },
      ] as const).map(({ id, Icon, text, onClick }) => {
        const isFlood = id === "flood";
        const className = `hdms-map-status-chip citizen-map-status-${id}`;
        const content = <>
          <Icon className="hdms-map-status-icon" aria-hidden="true" />
          <span>{text}</span>
          {isFlood && <ChevronDown className={`hdms-map-status-chevron${onClick ? "" : " invisible"}`} aria-hidden="true" />}
        </>;
        return onClick
          ? <button key={id} type="button" data-status-chip={id} className={className}
              aria-expanded={isFlood ? floodExpanded : undefined} aria-controls={isFlood ? floodControlsId : undefined} onClick={onClick}>{content}</button>
          : <span key={id} data-status-chip={id} className={className}>{content}</span>;
      })}
    </div>
  );
}
