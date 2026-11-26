"use client";

import React from "react";
import { Link2 } from "lucide-react";
import type { FloodRoute, SystemDataPayload } from "@/db/default-data";
import {
  getEventIdForFloodRoute,
  getLinkedDetoursForFlood,
} from "@/lib/event-detour-links";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";
import { getTrafficPresentation } from "@/lib/traffic-presentation";

export interface IncidentDetailModalProps {
  viewingIncident: FloodRoute | null;
  systemData: SystemDataPayload;
  dialog: {
    dialogRef: React.RefObject<HTMLDivElement | null>;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  onClose: () => void;
  onManageDetourLinks: (eventId: string) => void;
  onEditOnMap: (floodId: string) => void;
  onDelete: (floodId: string) => void;
}

/** Modal แสดงรายละเอียดเหตุการณ์น้ำท่วม, ภาพถ่าย (ผ่าน normalizeMediaUrl), และรายการทางเลี่ยงที่เชื่อมโยง */
export function IncidentDetailModal({
  viewingIncident,
  systemData,
  dialog,
  onClose,
  onManageDetourLinks,
  onEditOnMap,
  onDelete,
}: IncidentDetailModalProps) {
  if (!viewingIncident) return null;

  const linkedDetours = getLinkedDetoursForFlood(viewingIncident, systemData, {
    includeInactiveDetours: true,
  });
  const viewingEventId = getEventIdForFloodRoute(viewingIncident, systemData.eventSegments);

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialog.dialogRef}
        role="dialog"
        data-hdms-popup="panel"
        aria-modal="true"
        aria-label="รายละเอียดเหตุการณ์"
        tabIndex={-1}
        onKeyDown={dialog.onKeyDown}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-3">
          <div>
            <p className="text-xs font-semibold text-amber-300">ทล.{viewingIncident.route_no}</p>
            <h3 className="text-lg font-semibold text-white">{viewingIncident.section_name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
            aria-label="ปิดรายละเอียด" data-hdms-popup-close
          >
            ×
          </button>
        </div>

        {viewingIncident.latest_photo_url && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <img
              src={normalizeMediaUrl(viewingIncident.latest_photo_url)}
              alt={`ภาพหน้างาน ทล.${viewingIncident.route_no}`}
              className="w-full h-44 object-cover"
            />
          </div>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400 text-xs">ช่วงสายทาง</dt>
            <dd className="text-white font-mono">
              กม.{viewingIncident.km_start} - {viewingIncident.km_end}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">สถานะการจราจร</dt>
            <dd className="text-white font-semibold">
              {
                getTrafficPresentation(
                  viewingIncident.traffic_status,
                  viewingIncident.water_level_cm ?? 0,
                  viewingIncident.direction_meta?.trafficStatusDetail
                ).label
              }
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">ระดับน้ำล่าสุด</dt>
            <dd className="text-white font-bold text-amber-300">{viewingIncident.water_level_cm} ซม.</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">ฝั่งถนนที่รายงาน</dt>
            <dd className="text-white">
              {viewingIncident.road_side === "LEFT"
                ? "ฝั่งซ้าย (ตามหลัก กม.)"
                : viewingIncident.road_side === "RIGHT"
                  ? "ฝั่งขวา (ย้อนหลัก กม.)"
                  : viewingIncident.road_side === "BOTH"
                    ? "ทั้ง ๒ ฝั่ง (ไป-กลับ)"
                    : "รอตรวจสอบฝั่งทาง"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">ช่องจราจรที่กระทบ</dt>
            <dd className="text-white">{viewingIncident.affected_lanes || "ไม่ระบุ"}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">ไหล่ทางที่กระทบ</dt>
            <dd className="text-white">
              {viewingIncident.affected_shoulder === "BOTH"
                ? "ไหล่ทางทั้งสองฝั่ง"
                : viewingIncident.affected_shoulder === "LEFT"
                  ? "ไหล่ทางฝั่งซ้าย"
                  : viewingIncident.affected_shoulder === "RIGHT"
                    ? "ไหล่ทางฝั่งขวา"
                    : "ไม่มีผลกระทบ"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">เจ้าหน้าที่ผู้บันทึก</dt>
            <dd className="text-white">
              {viewingIncident.reporter_name || "เจ้าหน้าที่แขวงทางหลวงปัตตานี"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">อัปเดตล่าสุด</dt>
            <dd className="text-white text-xs">
              {new Date(viewingIncident.updated_at).toLocaleString("th-TH")}
            </dd>
          </div>
        </dl>

        {(viewingIncident.direction_meta?.causeAndNote || viewingIncident.detour_advice) && (
          <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
            <span className="text-slate-400 font-semibold block">สาเหตุ / คำแนะนำ / หมายเหตุ:</span>
            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
              {viewingIncident.direction_meta?.causeAndNote || viewingIncident.detour_advice}
            </p>
          </div>
        )}

        <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-amber-300 font-heading font-bold flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span>ทางเลี่ยงที่เชื่อมโยง ({linkedDetours.length} สาย)</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onManageDetourLinks(viewingEventId);
              }}
              className="text-[11px] font-heading font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer"
            >
              จัดการทางเลี่ยงเชื่อมโยง
            </button>
          </div>
          {linkedDetours.length === 0 ? (
            <p className="text-slate-400">ยังไม่มีทางเลี่ยงที่เชื่อมโยงกับเหตุการณ์นี้</p>
          ) : (
            <ul className="space-y-1.5">
              {linkedDetours.map((entry, idx) => (
                <li
                  key={`${entry.detour.id}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-slate-900/70 px-2.5 py-2"
                >
                  <span className="font-heading font-semibold text-white">
                    #{entry.position || idx + 1} · {entry.detour.route_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-sky-300">
                      {entry.effectiveDetourDirection === "FORWARD"
                        ? "ขาไป (A → B)"
                        : entry.effectiveDetourDirection === "REVERSE"
                          ? "ขากลับ (B → A)"
                          : "๒ ทิศทาง (A ⇄ B)"}
                    </span>
                    {!entry.detour.is_active && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 border border-slate-700">
                        ปิดชั่วคราว
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEditOnMap(viewingIncident.id);
            }}
            className="min-h-10 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-heading font-bold text-slate-950 transition cursor-pointer"
          >
            แก้ไขข้อมูลบนแผนที่
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onDelete(viewingIncident.id);
            }}
            className="min-h-10 rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900 px-4 py-2 text-xs font-heading font-bold text-rose-300 transition cursor-pointer"
          >
            ลบ
          </button>
        </div>
      </div>
    </div>
  );
}
