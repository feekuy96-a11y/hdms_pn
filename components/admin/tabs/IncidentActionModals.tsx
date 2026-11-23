"use client";

import React from "react";
import { Merge, Split } from "lucide-react";
import type { FloodRoute } from "@/db/default-data";
import { parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import {
  deriveTrafficStatusFromWaterLevel,
  TRAFFIC_STATUS_OPTIONS,
} from "@/lib/traffic-presentation";

interface DialogAccessibilityHandle {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export interface IncidentActionModalsProps {
  isSubmitting: boolean;
  // Quick Water Level Update Modal
  updateModalIncident: FloodRoute | null;
  updateDialog: DialogAccessibilityHandle;
  newWaterLevel: number;
  setNewWaterLevel: (value: number) => void;
  newTrafficStatus: FloodRoute["traffic_status"];
  setNewTrafficStatus: (value: FloodRoute["traffic_status"]) => void;
  updateNote: string;
  setUpdateNote: (value: string) => void;
  onCloseUpdateModal: () => void;
  onSubmitQuickUpdate: () => void;
  // Split Segment Modal
  splitModalIncident: FloodRoute | null;
  splitDialog: DialogAccessibilityHandle;
  splitKm: string;
  setSplitKm: (value: string) => void;
  splitNewWaterLevel: number;
  setSplitNewWaterLevel: (value: number) => void;
  splitNewTrafficStatus: FloodRoute["traffic_status"];
  setSplitNewTrafficStatus: (value: FloodRoute["traffic_status"]) => void;
  onCloseSplitModal: () => void;
  onSubmitSplitSegment: () => void;
  // Merge Segments Modal
  mergeModalIncident: FloodRoute | null;
  mergeDialog: DialogAccessibilityHandle;
  mergeCandidates: FloodRoute[];
  targetMergeIncidentId: string;
  setTargetMergeIncidentId: (value: string) => void;
  onCloseMergeModal: () => void;
  onSubmitMergeSegments: () => void;
}

/** รวม Modal ปฏิบัติการด่วนของเหตุการณ์น้ำท่วม: อัปเดตระดับน้ำ, แบ่งช่วง กม. (Split) และรวมช่วง กม. (Merge) */
export function IncidentActionModals({
  isSubmitting,
  updateModalIncident,
  updateDialog,
  newWaterLevel,
  setNewWaterLevel,
  newTrafficStatus,
  setNewTrafficStatus,
  updateNote,
  setUpdateNote,
  onCloseUpdateModal,
  onSubmitQuickUpdate,
  splitModalIncident,
  splitDialog,
  splitKm,
  setSplitKm,
  splitNewWaterLevel,
  setSplitNewWaterLevel,
  splitNewTrafficStatus,
  setSplitNewTrafficStatus,
  onCloseSplitModal,
  onSubmitSplitSegment,
  mergeModalIncident,
  mergeDialog,
  mergeCandidates,
  targetMergeIncidentId,
  setTargetMergeIncidentId,
  onCloseMergeModal,
  onSubmitMergeSegments,
}: IncidentActionModalsProps) {
  return (
    <>
      {/* Quick Water Level Update Modal */}
      {updateModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            ref={updateDialog.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="อัปเดตระดับน้ำ"
            tabIndex={-1}
            onKeyDown={updateDialog.onKeyDown}
            className="bg-slate-900 border-2 border-amber-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up"
          >
            <h3 className="font-heading font-bold text-sm text-white">
              อัปเดตระดับน้ำ: ทล.{updateModalIncident.route_no} {updateModalIncident.section_name}
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="quick-update-water-level" className="text-xs text-slate-300">
                    ระดับน้ำใหม่ (ซม.) *
                  </label>
                  <span className="text-xs text-slate-400">
                    เดิม: <strong className="text-amber-300">{updateModalIncident.water_level_cm} ซม.</strong>
                  </span>
                </div>
                <input
                  id="quick-update-water-level"
                  type="number"
                  min={0}
                  value={newWaterLevel}
                  onChange={(e) => {
                    const nextVal = Number(e.target.value);
                    setNewWaterLevel(nextVal);
                    const meta = parseFloodDirectionMeta(
                      updateModalIncident.direction_meta,
                      updateModalIncident
                    );
                    const suggested = deriveTrafficStatusFromWaterLevel(nextVal, meta.affectedParts);
                    if (suggested) setNewTrafficStatus(suggested);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold"
                />
                {newWaterLevel === 0 && (
                  <p className="mt-1 text-[11px] text-emerald-300">
                    💡 เมื่อระดับน้ำเป็น 0 ซม. ระบบเลือกสถานะแนะนำเป็น <strong>ผ่านได้ปกติ</strong> และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (หากถนนยังชำรุด/ปิดจราจร สามารถแก้ไขสถานะด้านล่างได้ทันที)
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="quick-update-traffic-status" className="text-xs text-slate-300 block mb-1">
                  สถานะการจราจร (เจ้าหน้าที่ยืนยัน) *
                </label>
                <select
                  id="quick-update-traffic-status"
                  value={newTrafficStatus}
                  onChange={(e) => setNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quick-update-note" className="text-xs text-slate-300">
                  หมายเหตุ / มาตรการความปลอดภัย
                </label>
                <input
                  id="quick-update-note"
                  type="text"
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="เช่น ติดตั้งเสาวัดระดับน้ำเพิ่ม..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseUpdateModal}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onSubmitQuickUpdate}
                className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow"
              >
                บันทึกการอัปเดต
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Segment Modal (Phase 2) */}
      {splitModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            ref={splitDialog.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="แบ่งช่วงกิโลเมตรน้ำท่วม"
            tabIndex={-1}
            onKeyDown={splitDialog.onKeyDown}
            className="bg-slate-900 border-2 border-sky-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up"
          >
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                <Split className="w-4 h-4 text-sky-400" aria-hidden="true" /> แบ่งช่วงกิโลเมตรน้ำท่วม (Split Segment)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ทล.{splitModalIncident.route_no} {splitModalIncident.section_name} (เดิม: กม.{splitModalIncident.km_start} - {splitModalIncident.km_end})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="split-km-input" className="text-slate-300 block mb-1">
                  หลักกิโลเมตรจุดตัดแบ่งช่วง (Split KM) *
                </label>
                <input
                  id="split-km-input"
                  type="text"
                  value={splitKm}
                  onChange={(e) => setSplitKm(e.target.value)}
                  placeholder="เช่น 95+250"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 font-mono text-sm font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  ช่วงที่ ๑: กม.{splitModalIncident.km_start} ถึง กม.{splitKm || "..."} | ช่วงที่ ๒: กม.{splitKm || "..."} ถึง กม.{splitModalIncident.km_end}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="split-water-level-input" className="text-slate-300 block mb-1">
                    ระดับน้ำช่วงที่ ๒ (ซม.)
                  </label>
                  <input
                    id="split-water-level-input"
                    type="number"
                    min={0}
                    value={splitNewWaterLevel}
                    onChange={(e) => {
                      const nextVal = Number(e.target.value);
                      setSplitNewWaterLevel(nextVal);
                      const meta = splitModalIncident
                        ? parseFloodDirectionMeta(splitModalIncident.direction_meta, splitModalIncident)
                        : undefined;
                      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, meta?.affectedParts);
                      if (suggested) setSplitNewTrafficStatus(suggested);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="split-traffic-status-select" className="text-slate-300 block mb-1">
                    สถานะจราจรช่วงที่ ๒
                  </label>
                  <select
                    id="split-traffic-status-select"
                    value={splitNewTrafficStatus}
                    onChange={(e) => setSplitNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-white text-xs"
                  >
                    {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onCloseSplitModal}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || !splitKm.trim()}
                onClick={onSubmitSplitSegment}
                className="min-h-10 bg-sky-500 hover:bg-sky-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow disabled:opacity-50"
              >
                ยืนยันการแบ่งช่วง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Segments Modal (Phase 4) */}
      {mergeModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            ref={mergeDialog.dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="รวมช่วงกิโลเมตรน้ำท่วม"
            tabIndex={-1}
            onKeyDown={mergeDialog.onKeyDown}
            className="bg-slate-900 border-2 border-indigo-500/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up"
          >
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                <Merge className="w-4 h-4 text-indigo-400" /> รวมช่วงกิโลเมตรน้ำท่วม (Merge Segments)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ทล.{mergeModalIncident.route_no} {mergeModalIncident.section_name} (ช่วงหลัก: กม.{mergeModalIncident.km_start} - {mergeModalIncident.km_end})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  เลือกช่วงที่ต้องการนำมารวมกับช่วงนี้ *
                </label>
                {mergeCandidates.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs text-center">
                    ไม่พบช่วงน้ำท่วมอื่นที่เปิดใช้งานอยู่ใน ทล.{mergeModalIncident.route_no} เดียวกัน
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {mergeCandidates.map((c) => {
                      const cMeta = parseFloodDirectionMeta(c.direction_meta, c);
                      const isSelected = targetMergeIncidentId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTargetMergeIncidentId(c.id)}
                          className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? "bg-indigo-950/90 border-indigo-400 text-white ring-1 ring-indigo-400"
                              : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="font-bold text-amber-300 font-mono">
                              กม.{c.km_start} - {c.km_end}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {cMeta.directionCode === "B_TO_A"
                                ? "ขากลับ (B→A)"
                                : cMeta.directionCode === "A_TO_B"
                                  ? "ขาไป (A→B)"
                                  : cMeta.directionCode === "BOTH"
                                    ? "ไป-กลับ"
                                    : "ไม่ระบุทิศทาง"}{" "}
                              | น้ำท่วม {c.water_level_cm} ซม.
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              isSelected ? "bg-indigo-500 text-slate-950" : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {isSelected ? "เลือกแล้ว" : "เลือกรวม"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {targetMergeIncidentId && (
                <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-900/60 text-[11px] text-indigo-200">
                  ℹ️ ระบบจะรวมช่วง กม. จากจุดเริ่มต้นน้อยที่สุดถึงจุดสิ้นสุดมากที่สุด ปรับแนวเส้น Geometry อัตโนมัติ และปรับสถานะช่วงที่ถูกรวมเป็นซ่อน/ยุติ
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onCloseMergeModal}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || !targetMergeIncidentId}
                onClick={onSubmitMergeSegments}
                className="min-h-10 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow disabled:opacity-50"
              >
                ยืนยันการรวมช่วง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
