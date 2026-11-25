"use client";

import workspace from "../AdminWorkspace.module.css";
import { RegistryUpdateTime } from "../RegistryUpdateTime";
import React from "react";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  Link2,
  Route,
  Signpost,
  Trash2,
} from "lucide-react";
import type { DetourRoute } from "@/db/default-data";
import type { LinkedFloodEventEntry } from "@/lib/event-detour-links";
import { extractDirectionalAdvice } from "@/lib/gis-utils";

export interface DetourListActionsProps {
  selectedDetourIds: Set<string>;
  onToggleSelect: (detourId: string, checked: boolean) => void;
  onToggleStatus: (detourId: string, currentActive: boolean) => void;
  onViewDetour: (item: DetourRoute) => void;
  onMoveOrder: (item: DetourRoute, direction: "UP" | "DOWN") => void;
  onFocusCoordinates?: (coords: [number, number]) => void;
  onOpenLinkModal: (detourId: string) => void;
  onOpenEditModal: (item: DetourRoute) => void;
  onDeleteDetour: (item: DetourRoute) => void;
}

export interface DetourListCardProps extends DetourListActionsProps {
  item: DetourRoute;
  linkedEvents: LinkedFloodEventEntry[];
  groupPos: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface DetourListSectionProps extends DetourListActionsProps {
  filteredDetours: DetourRoute[];
  linkedEventsByDetourId: Map<string, LinkedFloodEventEntry[]>;
  getReorderSiblings: (item: DetourRoute) => DetourRoute[];
  reorderingId: string | null;
  autoTableRef: React.RefObject<HTMLDivElement | null>;
  tableLayoutMode: "cards" | "table" | null;
  onAddDetour: () => void;
}

function getDirectionModeText(mode?: string): string {
  if (mode === "FORWARD_ONLY") return "→ เฉพาะขาไป (A → B)";
  if (mode === "REVERSE_ONLY") return "→ เฉพาะขากลับ (B → A)";
  return "⇄ เดินรถ ๒ ทิศทาง (A ⇄ B)";
}

function DetourDirectionalPreview({
  description,
  variant,
}: {
  description?: string;
  variant: "card" | "table";
}) {
  const ext = extractDirectionalAdvice(description || "");
  if (ext.hasBoth) {
    if (variant === "card") {
      return (
        <div className="text-[11px] space-y-1 bg-surface-panel p-2 rounded-lg border border-surface">
          <div className="text-amber-200 line-clamp-1">
            <strong className="text-amber-400">🚗 ขาไป:</strong> {ext.forward}
          </div>
          <div className="text-sky-200 line-clamp-1">
            <strong className="text-sky-400">🚙 ขากลับ:</strong> {ext.reverse}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-amber-200 line-clamp-1" title={ext.forward}>
          <span className="text-amber-400 font-bold">🚗 ขาไป:</span> {ext.forward}
        </div>
        <div className="text-[11px] text-sky-200 line-clamp-1" title={ext.reverse}>
          <span className="text-sky-400 font-bold">🚙 ขากลับ:</span> {ext.reverse}
        </div>
      </div>
    );
  }

  return variant === "card" ? (
    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
      {description || "-"}
    </p>
  ) : (
    <div className="space-y-1">
      <div className="text-[11px] text-slate-300 line-clamp-2" title={description}>
        {description || "-"}
      </div>
    </div>
  );
}

/** Mobile/Responsive Card สำหรับแสดงรายละเอียดและปุ่มจัดการเส้นทางเลี่ยง 1 รายการ */
export function DetourListCard({
  item,
  linkedEvents,
  groupPos,
  canMoveUp,
  canMoveDown,
  selectedDetourIds,
  onToggleSelect,
  onToggleStatus,
  onViewDetour,
  onMoveOrder,
  onOpenLinkModal,
  onOpenEditModal,
  onDeleteDetour,
}: DetourListCardProps) {
  return (
    <div
      onClick={() => onViewDetour(item)}
      className={`${workspace.registryCard} space-y-2 rounded-2xl border border-surface bg-surface-card p-3 cursor-pointer hover:border-amber-400/60 transition ${
        !item.is_active ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
            checked={selectedDetourIds.has(item.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelect(item.id, e.target.checked)}
            className="h-4 w-4 accent-amber-500 rounded"
          />
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950"
            title="เส้นทางเลี่ยง"
          >
            <Route className="h-4 w-4" />
          </span>
          <span className="font-heading font-black text-sm leading-snug tracking-normal text-white">{item.route_name}</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus(item.id, item.is_active);
          }}
          className={`min-h-9 px-2.5 py-1 rounded-full text-xs leading-snug tracking-normal font-heading font-bold border whitespace-nowrap transition cursor-pointer ${
            item.is_active
              ? "bg-emerald-950 text-emerald-300 border-emerald-600"
              : "bg-surface-panel text-slate-300 border-surface"
          }`}
        >
          {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-sky-300 font-medium">
          {getDirectionModeText(item.direction_mode)}
        </span>
        <RegistryUpdateTime updatedAt={item.updated_at} />
        {linkedEvents.map((ev) => (
          <span
            key={ev.eventId}
            className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.2 rounded font-bold"
          >
            ผูก ทล.{ev.routeNo} ({ev.sectionName})
            {ev.position != null && ` · อันดับ ${ev.position}`}
            {ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}
          </span>
        ))}
      </div>

      <DetourDirectionalPreview description={item.description} variant="card" />

      <div className="pt-2 border-t border-surface flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-400 font-mono">
          {!linkedEvents.some((event) => event.links.length > 0) && `ลำดับที่ ${groupPos + 1} · `}
          {Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0} จุดโหนด
        </span>
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!linkedEvents.some((event) => event.links.length > 0) && <button
            type="button"
            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
            disabled={!canMoveUp}
            onClick={() => onMoveOrder(item, "UP")}
            title="เลื่อนลำดับขึ้น"
            className="min-h-9 px-2 rounded-lg border border-surface bg-surface-panel text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>}
          {!linkedEvents.some((event) => event.links.length > 0) && <button
            type="button"
            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
            disabled={!canMoveDown}
            onClick={() => onMoveOrder(item, "DOWN")}
            title="เลื่อนลำดับลง"
            className="min-h-9 px-2 rounded-lg border border-surface bg-surface-panel text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>}
          <button
            type="button"
            onClick={() => onViewDetour(item)}
            className="min-h-10 px-2.5 rounded-lg border border-surface bg-surface-panel text-slate-100 font-heading font-bold tracking-normal text-xs hover:bg-slate-800 cursor-pointer"
          >
            รายละเอียด
          </button>
          <button
            type="button"
            aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
            onClick={() => onOpenLinkModal(item.id)}
            className="min-h-10 px-2.5 rounded-lg border border-sky-500/50 bg-sky-950/50 text-sky-300 font-heading font-bold tracking-normal text-xs hover:bg-sky-900 inline-flex items-center gap-1 cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>ผูกหลายเหตุการณ์</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenEditModal(item)}
            className="min-h-10 px-3 bg-surface-panel hover:bg-slate-800 text-amber-300 rounded-lg font-heading font-bold tracking-normal text-xs border border-surface cursor-pointer"
          >
            แก้ไข
          </button>
          <button
            type="button"
            aria-label={`ลบทางเลี่ยง ${item.route_name}`}
            title="ลบเส้นทางเลี่ยง"
            onClick={() => onDeleteDetour(item)}
            className="min-h-10 min-w-10 inline-flex items-center justify-center bg-red-950/60 text-red-400 hover:bg-red-900 rounded-lg border border-red-900/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** ส่วนแสดงรายการเส้นทางเลี่ยงทั้งแบบ Responsive Mobile Card View และ Desktop Table View */
export function DetourListSection({
  filteredDetours,
  linkedEventsByDetourId,
  getReorderSiblings,
  reorderingId,
  autoTableRef,
  tableLayoutMode,
  selectedDetourIds,
  onToggleSelect,
  onToggleStatus,
  onViewDetour,
  onMoveOrder,
  onFocusCoordinates,
  onOpenLinkModal,
  onOpenEditModal,
  onDeleteDetour,
  onAddDetour,
}: DetourListSectionProps) {
  if (filteredDetours.length === 0) {
    return (
      <div className="bg-surface-panel p-8 rounded-2xl border border-surface text-center text-xs text-slate-400 space-y-2">
        <Signpost className="w-8 h-8 text-slate-600 mx-auto" />
        <p>ไม่พบรายการเส้นทางเลี่ยงที่ตรงกับเงื่อนไขการค้นหา</p>
        <button
          type="button"
          onClick={onAddDetour}
          className="text-amber-400 hover:underline font-heading font-bold tracking-normal inline-block cursor-pointer"
        >
          + คลิกที่นี่เพื่อวาดเส้นทางเลี่ยงใหม่บนแผนที่
        </button>
      </div>
    );
  }

  return (
    <div ref={autoTableRef} className="doh-auto-table space-y-3">
      {/* Mobile Card View (จอแคบ / มือถือ / พื้นที่แสดงจริงแคบ) */}
      {tableLayoutMode !== "table" && (
        <div className="doh-auto-table-cards block md:hidden space-y-3">
          {filteredDetours.map((item) => {
            const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
            const siblings = getReorderSiblings(item);
            const groupPos = siblings.findIndex((d) => d.id === item.id);
            const canMoveUp = groupPos > 0 && !reorderingId;
            const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

            return (
              <DetourListCard
                key={item.id}
                item={item}
                linkedEvents={linkedEvents}
                groupPos={groupPos}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                selectedDetourIds={selectedDetourIds}
                onToggleSelect={onToggleSelect}
                onToggleStatus={onToggleStatus}
                onViewDetour={onViewDetour}
                onMoveOrder={onMoveOrder}
                onOpenLinkModal={onOpenLinkModal}
                onOpenEditModal={onOpenEditModal}
                onDeleteDetour={onDeleteDetour}
              />
            );
          })}
        </div>
      )}

      {/* Desktop & Tablet Table View */}
      {tableLayoutMode !== "cards" && (
        <div className={`${workspace.registryCard} doh-auto-table-desktop hidden overflow-x-auto rounded-2xl border border-surface bg-surface-panel md:block`}>
          <table className="w-full min-w-[780px] table-auto text-left text-xs text-slate-300">
            <thead className="bg-surface-card text-slate-300 font-heading tracking-normal border-b border-surface">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3 w-20 text-center whitespace-nowrap">สถานะ</th>
                <th className="p-3 min-w-[170px] whitespace-nowrap">ชื่อเส้นทางเลี่ยง</th>
                <th className="p-3 min-w-[150px] whitespace-nowrap">ผูกกับจุดน้ำท่วม</th>
                <th className="p-3 min-w-[200px]">คำแนะนำการเดินทาง (ไป-กลับ)</th>
                <th className="p-3 w-20 text-center whitespace-nowrap">พิกัด/โหนด</th>
                <th className="p-3 text-right min-w-[130px] whitespace-nowrap">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-body">
              {filteredDetours.map((item, idx) => {
                const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
                const coordsCount = Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0;
                const siblings = getReorderSiblings(item);
                const groupPos = siblings.findIndex((d) => d.id === item.id);
                const canMoveUp = groupPos > 0 && !reorderingId;
                const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

                return (
                  <tr
                    key={item.id}
                    onClick={() => onViewDetour(item)}
                    className={`hover:bg-surface-card/60 transition cursor-pointer ${
                      !item.is_active ? "opacity-55 bg-surface-canvas/40" : ""
                    }`}
                  >
                    <td className="p-3 text-center font-mono text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
                          checked={selectedDetourIds.has(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onToggleSelect(item.id, event.target.checked)}
                          className="h-4 w-4 accent-amber-500 rounded"
                        />
                        {idx + 1}
                      </div>
                    </td>

                    <td className="p-3 text-center whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(item.id, item.is_active)}
                        className={`min-h-9 px-2.5 py-1 rounded-full text-xs leading-snug tracking-normal font-heading font-bold border whitespace-nowrap transition cursor-pointer ${
                          item.is_active
                            ? "bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                            : "bg-surface-card text-slate-300 border-surface hover:text-white"
                        }`}
                        title={item.is_active ? "คลิกเพื่อปิดใช้งานชั่วคราว" : "คลิกเพื่อเปิดใช้งาน"}
                      >
                        {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                      </button>
                    </td>

                    <td className="p-3">
                      <div className="font-heading font-bold leading-snug tracking-normal text-white text-xs flex items-center gap-1.5">
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950"
                          title="เส้นทางเลี่ยง"
                        >
                          <Route className="h-4 w-4" />
                        </span>
                        <div>
                          <span>{item.route_name}</span>
                          <span className="block text-[10px] font-normal text-sky-300 mt-0.5">
                            {getDirectionModeText(item.direction_mode)}
                          </span>
                          <RegistryUpdateTime updatedAt={item.updated_at} />
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      {linkedEvents.length > 0 ? (
                        <div className="space-y-1">
                          {linkedEvents.map((ev) => (
                            <div key={ev.eventId}>
                              <span className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded">
                                ทล.{ev.routeNo}
                                {ev.position != null && ` · อันดับ ${ev.position}`}
                              </span>
                              <span
                                className="block text-[11px] text-slate-200 mt-0.5 truncate max-w-[180px]"
                                title={`${ev.sectionName}${ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}`}
                              >
                                {ev.sectionName}
                                {ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">-- ไม่ได้ผูก --</span>
                      )}
                    </td>

                    <td className="p-3">
                      <DetourDirectionalPreview description={item.description} variant="table" />
                    </td>

                    <td className="p-3 text-center font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      <div>{coordsCount} จุด</div>
                      {item.lat_start && item.lon_start && (
                        <div className="text-[9px] text-slate-400">
                          {item.lat_start.toFixed(2)}, {item.lon_start.toFixed(2)}
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {!linkedEvents.some((event) => event.links.length > 0) && <button
                          type="button"
                          aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
                          disabled={!canMoveUp}
                          onClick={() => onMoveOrder(item, "UP")}
                          title={`เลื่อนลำดับขึ้น (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-slate-800 text-slate-200 border border-surface transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>}
                        {!linkedEvents.some((event) => event.links.length > 0) && <button
                          type="button"
                          aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
                          disabled={!canMoveDown}
                          onClick={() => onMoveOrder(item, "DOWN")}
                          title={`เลื่อนลำดับลง (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-slate-800 text-slate-200 border border-surface transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>}

                        {/* Longdo Map focus coordinates must stay [lon, lat] */}
                        {item.lat_start && item.lon_start && onFocusCoordinates && (
                          <button
                            type="button"
                            aria-label={`ซูมไปยังทางเลี่ยง ${item.route_name} บนแผนที่`}
                            onClick={() => onFocusCoordinates([item.lon_start, item.lat_start])}
                            title="ซูมไปยังเส้นทางบนแผนที่"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-slate-800 text-sky-400 border border-surface transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
                          onClick={() => onOpenLinkModal(item.id)}
                          title="ผูกหลายเหตุการณ์ (Many-to-Many)"
                          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-slate-800 text-sky-300 border border-sky-700/60 transition cursor-pointer"
                        >
                          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          aria-label="แก้ไข"
                          onClick={() => onOpenEditModal(item)}
                          title="แก้ไขรายละเอียด & คำแนะนำ"
                          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-slate-800 text-amber-400 border border-surface transition cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          aria-label={`ลบทางเลี่ยง ${item.route_name}`}
                          onClick={() => onDeleteDetour(item)}
                          title="ลบเส้นทางเลี่ยง"
                          className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-surface-card hover:bg-rose-950 text-rose-400 border border-surface hover:border-rose-600 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
