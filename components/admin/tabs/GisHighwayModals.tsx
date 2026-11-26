"use client";

import React from "react";
import { Save, Sliders, X } from "lucide-react";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import type { DohOfficeLocation } from "@/db/default-data";

export interface HighwayFeatureSummary {
  layerId: string;
  layerName: string;
  featureIdx: number;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  lengthKm: number | string;
  responsibleOffice: string;
  highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
  lanes: string;
  surface: string;
  remarks: string;
  isVisible: boolean;
  pointsCount: number;
}

export interface EditingRouteSpecsState {
  layerId: string;
  featureIdx: number;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  lengthKm: string | number;
  responsibleOffice: string;
  highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
  lanes: string;
  surface: string;
  remarks: string;
  isVisible: boolean;
}

export interface EditingGeometryState {
  layerId: string;
  featureIdx: number;
  start: [number, number];
  end: [number, number];
  originalCoordinates: [number, number][];
}

export function HighwaySpecsEditModal({
  editingRouteSpecs,
  setEditingRouteSpecs,
  offices,
  onSave,
  calculateDistanceKm,
  formatKilometerPost,
}: {
  editingRouteSpecs: EditingRouteSpecsState | null;
  setEditingRouteSpecs: React.Dispatch<React.SetStateAction<EditingRouteSpecsState | null>>;
  offices: DohOfficeLocation[];
  onSave: () => void;
  calculateDistanceKm: (start: unknown, end: unknown) => string;
  formatKilometerPost: (value: unknown) => string;
}) {
  const specsDialog = useModalAccessibility(Boolean(editingRouteSpecs), () => setEditingRouteSpecs(null));
  if (!editingRouteSpecs) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        ref={specsDialog.dialogRef}
        role="dialog"
        data-hdms-popup="panel"
        aria-modal="true"
        aria-label="ตั้งค่าคุณสมบัติทางวิศวกรรม"
        tabIndex={-1}
        onKeyDown={specsDialog.onKeyDown}
        className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto [contain:layout_style_paint]"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <span>ตั้งค่าคุณสมบัติทางวิศวกรรม</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              ทล.{editingRouteSpecs.routeNo} {editingRouteSpecs.sectionName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingRouteSpecs(null)}
            aria-label="ปิดหน้าต่างแก้ไขคุณสมบัติ" data-hdms-popup-close
            className="min-h-10 min-w-10 flex items-center justify-center p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="specs-route-no" className="text-slate-300 block mb-1">หมายเลขทางหลวง *</label>
              <input
                id="specs-route-no"
                type="text"
                value={editingRouteSpecs.routeNo}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, routeNo: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="specs-section-name" className="text-slate-300 block mb-1">ชื่อสายทาง / ตอนควบคุม *</label>
              <input
                id="specs-section-name"
                type="text"
                value={editingRouteSpecs.sectionName}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, sectionName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="specs-km-start" className="text-slate-300 block mb-1">กม.เริ่มต้น</label>
              <input
                id="specs-km-start"
                type="text"
                aria-label="กม.เริ่มต้น"
                value={editingRouteSpecs.kmStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditingRouteSpecs({
                    ...editingRouteSpecs,
                    kmStart: val,
                    lengthKm: calculateDistanceKm(val, editingRouteSpecs.kmEnd),
                  });
                }}
                onBlur={() =>
                  setEditingRouteSpecs((current) =>
                    current ? { ...current, kmStart: formatKilometerPost(current.kmStart) } : current
                  )
                }
                placeholder="เช่น 12+500"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label htmlFor="specs-km-end" className="text-slate-300 block mb-1">กม.สิ้นสุด</label>
              <input
                id="specs-km-end"
                type="text"
                aria-label="กม.สิ้นสุด"
                value={editingRouteSpecs.kmEnd}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditingRouteSpecs({
                    ...editingRouteSpecs,
                    kmEnd: val,
                    lengthKm: calculateDistanceKm(editingRouteSpecs.kmStart, val),
                  });
                }}
                onBlur={() =>
                  setEditingRouteSpecs((current) =>
                    current ? { ...current, kmEnd: formatKilometerPost(current.kmEnd) } : current
                  )
                }
                placeholder="เช่น 18+200"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label htmlFor="specs-length-km" className="text-slate-300 block mb-1">ระยะทาง (กม.) · คำนวณอัตโนมัติ</label>
              <input
                id="specs-length-km"
                type="number"
                step="any"
                value={editingRouteSpecs.lengthKm}
                readOnly
                aria-label="ระยะทางคำนวณอัตโนมัติ"
                placeholder="เช่น 5.7"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="specs-lanes" className="text-slate-300 block mb-1">
                จำนวนช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) *
              </label>
              <select
                id="specs-lanes"
                value={editingRouteSpecs.lanes}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, lanes: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sky-300 font-heading font-medium"
              >
                <option value="2 ช่องจราจร">2 ช่องจราจร</option>
                <option value="3 ช่องจราจร">3 ช่องจราจร</option>
                <option value="4 ช่องจราจร">4 ช่องจราจร</option>
                <option value="6 ช่องจราจร">6 ช่องจราจร</option>
                <option value="8 ช่องจราจร">8 ช่องจราจร</option>
              </select>
            </div>
            <div>
              <label htmlFor="specs-surface" className="text-slate-300 block mb-1">ชนิดผิวจราจร</label>
              <select
                id="specs-surface"
                value={editingRouteSpecs.surface}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, surface: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-300"
              >
                <option value="AC.">AC.</option>
                <option value="Conc.">Conc.</option>
                <option value="DST.">DST.</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="specs-office" className="text-slate-300 block mb-1">หน่วยงานที่รับผิดชอบ *</label>
              <select
                id="specs-office"
                value={editingRouteSpecs.responsibleOffice}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, responsibleOffice: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.name}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="specs-highway-type" className="text-slate-300 block mb-1">ประเภททางหลวง</label>
              <select
                id="specs-highway-type"
                value={editingRouteSpecs.highwayType}
                onChange={(e: any) => setEditingRouteSpecs({ ...editingRouteSpecs, highwayType: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก</option>
                <option value="SECOND_HIGHWAY">ทางหลวงสายรอง</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="specs-remarks" className="text-slate-300 block mb-1">หมายเหตุ</label>
            <input
              id="specs-remarks"
              type="text"
              value={editingRouteSpecs.remarks}
              onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, remarks: e.target.value })}
              placeholder="เช่น เส้นทางหลักเชื่อมโยง สงขลา - ปัตตานี"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-heading font-bold text-white block">แสดงผลบนแผนที่</span>
              <span className="text-[11px] text-slate-400">
                เปิดเพื่อให้เส้นทางนี้ปรากฏบนแผนที่ของทั้งประชาชนและเจ้าหน้าที่
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="แสดงผลบนแผนที่"
                checked={editingRouteSpecs.isVisible}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, isVisible: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setEditingRouteSpecs(null)}
            className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSave}
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" aria-hidden="true" /> บันทึกคุณสมบัติทางวิศวกรรม
          </button>
        </div>
      </div>
    </div>
  );
}

export { HighwayRouteDetailModal, type HighwayRouteDetailModalProps } from "./HighwayRouteDetailModal";

export { HighwayGeometryEditorPanel, type HighwayGeometryEditorPanelProps } from "./HighwayGeometryEditorPanel";

