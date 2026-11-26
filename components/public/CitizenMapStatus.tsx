"use client";
import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, Route, Waves } from "lucide-react";
import type { FloodRoute, SystemDataPayload } from "@/db/default-data";
import { DETAILED_TRAFFIC_STATUS_CONFIG, mapTrafficStatusToDetail, type DetailedTrafficStatus } from "@/lib/flood-event-schema";
import { PUBLIC_READ_MESSAGES, type PublicReadState } from "./public-read-state";
import { getEventIdForFloodRoute } from "@/lib/event-detour-links";

export type MapPassability = Exclude<DetailedTrafficStatus, "CAUTION">;
const statuses: readonly MapPassability[] = ["CLOSED", "NO_SMALL_VEHICLES", "LIGHT_VEHICLES_ONLY", "ONE_LANE", "PASSABLE", "PENDING_VERIFICATION"];

export function mapPassabilityLabel(value: MapPassability): string {
  return value === "NO_SMALL_VEHICLES" ? DETAILED_TRAFFIC_STATUS_CONFIG.CAUTION.label : DETAILED_TRAFFIC_STATUS_CONFIG[value].label;
}

export function recordedPassability(route: FloodRoute): MapPassability {
  const detail = route.direction_meta?.trafficStatusDetail;
  if (detail === "PENDING_VERIFICATION" || String(route.traffic_status) === "PENDING_VERIFICATION") return "PENDING_VERIFICATION";
  const status = mapTrafficStatusToDetail(route.traffic_status, detail);
  return status === "CAUTION" ? "NO_SMALL_VEHICLES" : status;
}

export function CitizenMapStatus({ systemData, selected, onFilter, onDetours, readState }: {
  systemData: SystemDataPayload;
  selected: MapPassability | "ALL";
  onFilter: (value: MapPassability | "ALL") => void;
  onDetours: () => void;
  readState: PublicReadState;
}) {
  const [expanded, setExpanded] = useState(false);
  const { count, detours, totals } = useMemo(() => {
    const keys = new Set<string>();
    const matched = new Map<MapPassability, Set<string>>();
    for (const route of systemData.floodRoutes || []) {
      if (!route.is_active) continue;
      const key = getEventIdForFloodRoute(route, systemData.eventSegments);
      keys.add(key);
      const group = recordedPassability(route);
      const items = matched.get(group) || new Set<string>();
      items.add(key);
      matched.set(group, items);
    }
    return { count: keys.size, detours: (systemData.detourRoutes || []).filter(route => route.is_active).length, totals: matched };
  }, [systemData]);
  const pending = totals.get("PENDING_VERIFICATION")?.size ?? 0;
  const showCounts = readState === "ready" || (readState === "stale" && (count > 0 || detours > 0));
  return (
    <aside aria-label="สรุปสถานการณ์บนแผนที่" className="citizen-map-status">
      {!showCounts ? (
        <p className="citizen-map-status-note">{PUBLIC_READ_MESSAGES[readState]}</p>
      ) : (
        <>
          <div className="citizen-map-status-head">
          <button type="button" className="citizen-map-status-flood" aria-expanded={expanded} aria-controls="citizen-map-status-filters" onClick={() => setExpanded(open => !open)}>
            <Waves size={13} aria-hidden="true" /><span>{`น้ำท่วม ${count} จุด`}</span><ChevronDown size={11} aria-hidden="true" />
          </button>
          <button type="button" className="citizen-map-status-detours" onClick={onDetours}><Route size={13} aria-hidden="true" /><span>ทางเลี่ยง {detours} เส้นทาง</span></button>
          </div>
          {readState === "stale" && <p className="citizen-map-status-note">{PUBLIC_READ_MESSAGES.stale}</p>}
        </>
      )}
      {selected !== "ALL" && (
        <button type="button" className="citizen-clear-status" onClick={() => onFilter("ALL")} aria-label="ล้างตัวกรองสถานะ">
          {mapPassabilityLabel(selected)}<span aria-hidden="true">×</span>
        </button>
      )}
      {expanded && showCounts && (
        <div id="citizen-map-status-filters" className="citizen-map-status-filters" aria-label="กรองตามการผ่านทาง">
          {pending > 0 && <p className="citizen-map-status-note">มี {pending} จุดรอตรวจสอบสถานะ</p>}
          {readState === "ready" && count === 0 && <p className="citizen-map-status-note">ยังไม่พบจุดที่รายงาน</p>}
          {statuses.filter((key) => (totals.get(key)?.size ?? 0) > 0 || selected === key).map(key => {
            const status = DETAILED_TRAFFIC_STATUS_CONFIG[key];
            return (
              <button type="button" key={key} aria-pressed={selected === key} data-map-flood-status={key}
                style={{ "--flood-status-color": status.hex } as CSSProperties}
                onClick={() => onFilter(selected === key ? "ALL" : key)}>
                <span className="citizen-flood-filter-label">
                  <i className="citizen-flood-filter-swatch" aria-hidden="true" />
                  <span>{mapPassabilityLabel(key)}</span>
                </span>
                <strong className="citizen-flood-filter-count">{totals.get(key)?.size ?? 0}</strong>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
