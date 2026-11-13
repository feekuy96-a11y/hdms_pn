"use client";

import React from "react";
import { Save, Sliders, Trash2, X } from "lucide-react";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import type { DohOfficeLocation } from "@/db/default-data";
import type { LonLat } from "@/lib/line-edit";

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
            aria-label="ปิดหน้าต่างแก้ไขคุณสมบัติ"
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 block mb-1">หมายเลขทางหลวง *</label>
              <input
                type="text"
                value={editingRouteSpecs.routeNo}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, routeNo: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-slate-300 block mb-1">ชื่อสายทาง / ตอนควบคุม *</label>
              <input
                type="text"
                value={editingRouteSpecs.sectionName}
                onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, sectionName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 block mb-1">กม.เริ่มต้น</label>
              <input
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
              <label className="text-slate-300 block mb-1">กม.สิ้นสุด</label>
              <input
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
              <label className="text-slate-300 block mb-1">ระยะทาง (กม.) · คำนวณอัตโนมัติ</label>
              <input
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
              <label className="text-slate-300 block mb-1">
                จำนวนช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) *
              </label>
              <select
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
              <label className="text-slate-300 block mb-1">ชนิดผิวจราจร</label>
              <select
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
              <label className="text-slate-300 block mb-1">หน่วยงานที่รับผิดชอบ *</label>
              <select
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
              <label className="text-slate-300 block mb-1">ประเภททางหลวง</label>
              <select
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
            <label className="text-slate-300 block mb-1">หมายเหตุ</label>
            <input
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
            className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSave}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" /> บันทึกคุณสมบัติทางวิศวกรรม
          </button>
        </div>
      </div>
    </div>
  );
}

export function HighwayRouteDetailModal({
  selectedRoute,
  setSelectedRoute,
  allHighwayFeatures,
  setEditingRouteSpecs,
  openGeometryEditor,
  handleDeleteHighwayFeature,
}: {
  selectedRoute: { layerId: string; featureIdx: number } | null;
  setSelectedRoute: (route: { layerId: string; featureIdx: number } | null) => void;
  allHighwayFeatures: HighwayFeatureSummary[];
  setEditingRouteSpecs: React.Dispatch<React.SetStateAction<EditingRouteSpecsState | null>>;
  openGeometryEditor: (layerId: string, featureIdx: number) => void;
  handleDeleteHighwayFeature: (layerId: string, featureIdx: number, title: string) => void;
}) {
  const routeDialog = useModalAccessibility(Boolean(selectedRoute), () => setSelectedRoute(null));
  if (!selectedRoute) return null;
  const item = allHighwayFeatures.find(
    (entry) => entry.layerId === selectedRoute.layerId && entry.featureIdx === selectedRoute.featureIdx
  );
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="รายละเอียดสายทาง">
      <div
        ref={routeDialog.dialogRef}
        tabIndex={-1}
        onKeyDown={routeDialog.onKeyDown}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 text-white shadow-2xl space-y-4 [contain:layout_style_paint]"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2.5 py-1 text-sm font-black font-heading">
              ทล.{item.routeNo}
            </span>
            <span className="text-base font-bold font-heading text-white truncate max-w-[280px] sm:max-w-xs">
              {item.sectionName}
            </span>
          </div>
          <button
            type="button"
            aria-label="ปิดรายละเอียด"
            onClick={() => setSelectedRoute(null)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 flex items-center justify-between">
            <span className="text-slate-400">ประเภทสายทาง</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                item.highwayType === "MAIN_HIGHWAY"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-sky-500/40 bg-sky-500/15 text-sky-400"
              }`}
            >
              {item.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
            <span className="text-[11px] text-slate-400 block">ช่วงหลักกิโลเมตร</span>
            <p className="font-mono text-sm font-bold text-amber-300">
              กม. {item.kmStart} ถึง {item.kmEnd}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
            <span className="text-[11px] text-slate-400 block">ระยะทางตลอดสาย</span>
            <p className="font-mono text-sm font-bold text-sky-300">{item.lengthKm} กม.</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
            <span className="text-[11px] text-slate-400 block">จำนวนช่องจราจร</span>
            <p className="text-sm font-medium text-slate-200">{item.lanes}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
            <span className="text-[11px] text-slate-400 block">ชนิดผิวจราจร</span>
            <p className="text-sm font-medium text-slate-200">{item.surface}</p>
          </div>

          <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
            <span className="text-slate-400">หน่วยงานรับผิดชอบ</span>
            <span className="text-slate-200 font-medium">{item.responsibleOffice || "ไม่ระบุ"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold font-heading text-slate-950 transition shadow-md"
            onClick={() => {
              setSelectedRoute(null);
              setEditingRouteSpecs({
                ...item,
                kmStart: item.kmStart === "-" ? "" : item.kmStart,
                kmEnd: item.kmEnd === "-" ? "" : item.kmEnd,
                lengthKm: item.lengthKm === "-" ? "" : item.lengthKm,
              });
            }}
          >
            ตั้งค่า
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-bold font-heading text-slate-200 transition border border-slate-700"
            onClick={() => {
              setSelectedRoute(null);
              openGeometryEditor(item.layerId, item.featureIdx);
            }}
          >
            แนวถนน
          </button>
          <button
            type="button"
            className="rounded-xl bg-rose-950/80 hover:bg-rose-900 px-4 py-2.5 text-xs font-bold font-heading text-rose-300 transition border border-rose-800/60"
            onClick={() => {
              setSelectedRoute(null);
              handleDeleteHighwayFeature(item.layerId, item.featureIdx, `ทล.${item.routeNo} ${item.sectionName}`);
            }}
          >
            ลบ
          </button>
        </div>
      </div>
    </div>
  );
}

export function HighwayGeometryEditorPanel({
  editingGeometry,
  setEditingGeometry,
  allHighwayFeatures,
  closeGeometryEditor,
  editorMode,
  switchEditorMode,
  carriagewayStructure,
  setCarriagewayStructure,
  arrowDirectionSetting,
  setArrowDirectionSetting,
  showFeatureArrows,
  setShowFeatureArrows,
  dualReverseCoords,
  setDualReverseCoords,
  draftCoordinates,
  draftWaypoints,
  vertexTool,
  setVertexTool,
  adminPickMode,
  setAdminPickMode,
  historySize,
  undoEdit,
  redoEdit,
  splitRemainder,
  absorbedFeatureIdxs,
  joinTargetIdx,
  setJoinTargetIdx,
  joinCandidates,
  handleJoinSelected,
  onToast,
  isSnappingGeometry,
  snapEditedGeometry,
  removeGeometryWaypoint,
  exportEditedGeometry,
  restoreOriginalGeometry,
  saveEditedGeometry,
}: {
  editingGeometry: EditingGeometryState | null;
  setEditingGeometry: React.Dispatch<React.SetStateAction<EditingGeometryState | null>>;
  allHighwayFeatures: HighwayFeatureSummary[];
  closeGeometryEditor: () => void;
  editorMode: "free" | "road";
  switchEditorMode: (mode: "free" | "road") => void;
  carriagewayStructure: "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY";
  setCarriagewayStructure: React.Dispatch<React.SetStateAction<"SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY">>;
  arrowDirectionSetting: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  setArrowDirectionSetting: React.Dispatch<React.SetStateAction<"TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN">>;
  showFeatureArrows: boolean;
  setShowFeatureArrows: React.Dispatch<React.SetStateAction<boolean>>;
  dualReverseCoords: [number, number][];
  setDualReverseCoords: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftCoordinates: [number, number][];
  draftWaypoints: [number, number][];
  vertexTool: "move" | "delete" | "split";
  setVertexTool: React.Dispatch<React.SetStateAction<"move" | "delete" | "split">>;
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  historySize: { undo: number; redo: number };
  undoEdit: () => void;
  redoEdit: () => void;
  splitRemainder: LonLat[] | null;
  absorbedFeatureIdxs: number[];
  joinTargetIdx: string;
  setJoinTargetIdx: (value: string) => void;
  joinCandidates: Array<{ idx: number; label: string; gap: number }>;
  handleJoinSelected: () => void;
  onToast: (msg: string) => void;
  isSnappingGeometry: boolean;
  snapEditedGeometry: () => void;
  removeGeometryWaypoint: (index: number) => Promise<void>;
  exportEditedGeometry: (format: "geojson" | "kml") => void;
  restoreOriginalGeometry: () => void;
  saveEditedGeometry: () => void;
}) {
  if (!editingGeometry) return null;
  const item = allHighwayFeatures.find(
    (entry) => entry.layerId === editingGeometry.layerId && entry.featureIdx === editingGeometry.featureIdx
  );

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[1000] flex justify-start lg:inset-y-20 lg:left-3 lg:right-auto">
      <div className="pointer-events-auto w-full lg:w-[min(38vw,520px)] max-h-[38vh] lg:max-h-full overflow-y-auto rounded-2xl border border-sky-500/60 bg-[#0c162c] p-4 shadow-2xl space-y-4 [contain:layout_style_paint]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-heading font-black text-white">ปรับแนวถนนทางหลวง</h3>
            <p className="text-xs text-slate-400">
              {editorMode === "free"
                ? "ลากหมุดบนเส้นเพื่อย้ายจุด เพิ่ม/ลบจุด ตัดหรือเชื่อมเส้นได้อิสระเหมือน Google My Maps"
                : "กำหนดต้นทาง–ปลายทาง แล้วสร้างแนวเกาะถนน จากนั้นลากจุดสีส้มเพื่อปรับแนว"}
            </p>
            {item && (
              <p className="mt-2 text-sm text-white">
                ทล.{item.routeNo} · {item.sectionName}
                <br />
                ก.ม. {item.kmStart} ถึง {item.kmEnd} · ระยะทาง {item.lengthKm} กม.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="ปิดตัวแก้ไขแนวถนน"
            onClick={closeGeometryEditor}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex rounded-xl border border-slate-700 bg-slate-900 p-1 text-xs" role="group" aria-label="โหมดแก้ไขแนวถนน">
          <button
            type="button"
            aria-pressed={editorMode === "free"}
            onClick={() => switchEditorMode("free")}
            className={`flex-1 rounded-lg px-3 py-2 font-bold ${
              editorMode === "free" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            วาด/แก้ไขอิสระ
          </button>
          <button
            type="button"
            aria-pressed={editorMode === "road"}
            onClick={() => switchEditorMode("road")}
            className={`flex-1 rounded-lg px-3 py-2 font-bold ${
              editorMode === "road" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            ตามถนน (OSRM)
          </button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 block mb-1">โครงสร้างทางหลวงตามจริง</label>
              <select
                aria-label="โครงสร้างทางหลวงตามจริง"
                value={carriagewayStructure}
                onChange={(e) => {
                  const val = e.target.value as "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY";
                  setCarriagewayStructure(val);
                  if (val === "SINGLE_CENTERLINE") {
                    setArrowDirectionSetting("TWO_WAY");
                    setDualReverseCoords([]);
                  } else if (val === "ONE_WAY") {
                    setArrowDirectionSetting("FORWARD");
                    setDualReverseCoords([]);
                  } else {
                    setArrowDirectionSetting("FORWARD");
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-amber-300 font-semibold"
              >
                <option value="SINGLE_CENTERLINE">ถนน 2 ทิศทาง (เส้นเดี่ยวกึ่งกลาง ⇄)</option>
                <option value="DUAL_CARRIAGEWAY">ถนนมีเกาะกลาง (แยกเส้น A→B และ B→A ตามจริง)</option>
                <option value="ONE_WAY">ถนนเดินรถทางเดียว (ลูกศรทิศทางเดียว →)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-300 block mb-1">ทิศทางลูกศรจราจรบนเส้น</label>
              <select
                aria-label="ทิศทางลูกศรจราจรบนเส้น"
                value={arrowDirectionSetting}
                disabled={carriagewayStructure === "DUAL_CARRIAGEWAY"}
                onChange={(e) => setArrowDirectionSetting(e.target.value as "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN")}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
              >
                <option value="TWO_WAY">⇄ สวนกัน 2 ทิศทาง (Two-Way)</option>
                <option value="FORWARD">→ ทิศทางเดียวตามแนว A → B</option>
                <option value="REVERSE">← ทิศทางเดียวตามแนว B → A</option>
                <option value="UNKNOWN">ไม่ระบุทิศทาง (ซ่อนลูกศรเพื่อป้องกันการเดาทิศทาง)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            <label className="flex items-center gap-2 cursor-pointer text-slate-200">
              <input
                type="checkbox"
                checked={showFeatureArrows}
                onChange={(e) => setShowFeatureArrows(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-400"
              />
              <span>แสดงลูกศรกำกับทิศทางบนสายทางนี้ (พรีวิวบนแผนที่ทันที)</span>
            </label>
            {carriagewayStructure === "DUAL_CARRIAGEWAY" && (
              <span className="text-[10px] text-sky-300">
                {dualReverseCoords.length >= 2
                  ? `✓ แยก 2 คันทางจริง (A→B ${draftCoordinates.length} จุด · B→A ${dualReverseCoords.length} จุด)`
                  : "กด \"เกาะแนวถนน\" เพื่อดึงเส้นคู่ขนานตามคันทางจริงจากโครงข่ายถนน"}
              </span>
            )}
          </div>
        </div>
        {editorMode === "free" && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                {
                  key: "move",
                  label: "ลากจุด",
                  active: vertexTool === "move" && adminPickMode !== "ADD_LINE_VERTEX",
                  onClick: () => {
                    setVertexTool("move");
                    setAdminPickMode(null);
                  },
                },
                {
                  key: "add",
                  label: "เพิ่มจุด",
                  active: adminPickMode === "ADD_LINE_VERTEX",
                  onClick: () => {
                    setVertexTool("move");
                    setAdminPickMode(adminPickMode === "ADD_LINE_VERTEX" ? null : "ADD_LINE_VERTEX");
                  },
                },
                {
                  key: "delete",
                  label: "ลบจุด",
                  active: vertexTool === "delete",
                  onClick: () => {
                    setAdminPickMode(null);
                    setVertexTool(vertexTool === "delete" ? "move" : "delete");
                  },
                },
                {
                  key: "split",
                  label: "ตัดเส้น",
                  active: vertexTool === "split",
                  onClick: () => {
                    setAdminPickMode(null);
                    setVertexTool(vertexTool === "split" ? "move" : "split");
                  },
                },
              ] as const).map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  aria-pressed={tool.active}
                  onClick={tool.onClick}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                    tool.active
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-400"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              {adminPickMode === "ADD_LINE_VERTEX"
                ? "คลิกบนแผนที่เพื่อเพิ่มจุด (คลิกใกล้ปลายเส้นเพื่อต่อเส้นออกไป)"
                : vertexTool === "delete"
                  ? "คลิกที่หมุดจุดที่ต้องการลบ"
                  : vertexTool === "split"
                    ? "คลิกที่หมุดจุดกลางเส้นที่ต้องการตัดเส้นเป็น 2 ส่วน"
                    : "ลากหมุดเพื่อย้ายจุด · คลิกหมุด + กลางช่วงเส้นเพื่อเพิ่มจุด · คลิกขวา/กดค้างที่หมุดเพื่อลบจุด"}
            </p>
            {draftCoordinates.length > 400 && (
              <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">
                เส้นนี้มี {draftCoordinates.length} จุด ซูมเข้าเพื่อให้เห็นหมุดทุกจุดและหมุด + ของช่วงที่ต้องการแก้
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                disabled={historySize.undo === 0}
                onClick={undoEdit}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={historySize.redo === 0}
                onClick={redoEdit}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40"
              >
                ทำซ้ำ
              </button>
              <span className="text-[11px] text-slate-400">
                เส้นปัจจุบัน {draftCoordinates.length} จุด
                {splitRemainder ? ` · ส่วนที่ 2 ${splitRemainder.length} จุด (เส้นประสีฟ้า)` : ""}
                {absorbedFeatureIdxs.length > 0 ? ` · รวมสายทางอื่น ${absorbedFeatureIdxs.length} เส้น` : ""}
              </span>
            </div>
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-xs font-semibold text-slate-200">เชื่อมกับสายทางอื่นในเลเยอร์เดียวกัน</p>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="เลือกสายทางที่จะเชื่อม"
                  value={joinTargetIdx}
                  onChange={(event) => setJoinTargetIdx(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
                >
                  <option value="">เลือกสายทางที่ปลายเส้นอยู่ใกล้ที่สุด...</option>
                  {joinCandidates.map((candidate) => (
                    <option key={candidate.idx} value={String(candidate.idx)}>
                      {candidate.label} · ห่าง {candidate.gap < 1000 ? `${Math.round(candidate.gap)} ม.` : `${(candidate.gap / 1000).toFixed(1)} กม.`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!joinTargetIdx}
                  onClick={handleJoinSelected}
                  className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                >
                  เชื่อมเส้น
                </button>
              </div>
              <p className="text-[11px] text-slate-500">แสดง 50 สายทางที่ปลายเส้นใกล้ที่สุด · ระบบต่อปลายเส้นที่ใกล้กันที่สุดและกลับทิศให้อัตโนมัติ</p>
            </div>
          </>
        )}
        {editorMode === "road" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["start", "end"] as const).map((key) => {
                const label = key === "start" ? "พิกัด กม.เริ่มต้น" : "พิกัด กม.สิ้นสุด";
                return (
                  <div key={key} className="space-y-1.5">
                    <label className="text-xs text-slate-300">{label} · ละติจูด, ลองจิจูด</label>
                    <input
                      key={`${key}-${editingGeometry[key].join(",")}`}
                      aria-label={label}
                      type="text"
                      defaultValue={`${editingGeometry[key][1]}, ${editingGeometry[key][0]}`}
                      placeholder="เช่น 6.850000, 101.250000"
                      onBlur={(event) => {
                        const rawParts = event.target.value.split(",").map((value) => value.trim());
                        const parts = rawParts.map(Number);
                        if (
                          rawParts.length !== 2 ||
                          rawParts.some((value) => !value) ||
                          parts.some((value) => !Number.isFinite(value)) ||
                          Math.abs(parts[0]) > 90 ||
                          Math.abs(parts[1]) > 180
                        ) {
                          onToast("กรุณากรอกพิกัดเป็นละติจูด, ลองจิจูด");
                          event.target.value = `${editingGeometry[key][1]}, ${editingGeometry[key][0]}`;
                          return;
                        }
                        setEditingGeometry((current) => (current ? { ...current, [key]: [parts[1], parts[0]] } : current));
                      }}
                      className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setAdminPickMode(key === "start" ? "PICK_HIGHWAY_START" : "PICK_HIGHWAY_END")}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-sky-300 hover:border-sky-400"
                    >
                      ปักหมุดบนแผนที่
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setAdminPickMode("ADD_HIGHWAY_BEND")}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-300 hover:border-amber-400"
              >
                เพิ่มจุดดัดแนวจากแผนที่
              </button>
              <button
                type="button"
                disabled={isSnappingGeometry}
                onClick={snapEditedGeometry}
                className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
              >
                {isSnappingGeometry ? "กำลังหาแนวถนน" : "เกาะแนวถนน"}
              </button>
              <span className="text-[11px] text-slate-400">
                เส้นปัจจุบัน {draftCoordinates.length} จุด · จุดดัด {draftWaypoints.length} จุด
              </span>
            </div>
            {draftWaypoints.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" aria-label="รายการจุดดัดแนวถนน">
                <p className="mb-2 text-xs font-semibold text-slate-200">จุดดัดแนวถนน ({draftWaypoints.length} จุด)</p>
                <div className="flex flex-wrap gap-2">
                  {draftWaypoints.map(([lon, lat], index) => (
                    <div
                      key={`${lon}-${lat}-${index}`}
                      className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300"
                    >
                      <span className="font-mono">
                        #{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeGeometryWaypoint(index)}
                        aria-label={`ลบจุดดัดแนวถนนที่ ${index + 1}`}
                        className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => exportEditedGeometry("geojson")}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
            >
              ส่งออก GeoJSON
            </button>
            <button
              type="button"
              onClick={() => exportEditedGeometry("kml")}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
            >
              ส่งออก KML
            </button>
            <button
              type="button"
              onClick={restoreOriginalGeometry}
              className="rounded-lg border border-sky-700 bg-sky-950/40 px-3 py-2 text-xs text-sky-200"
            >
              คืนค่าแนวเดิม
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={closeGeometryEditor} className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-white">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={saveEditedGeometry}
              disabled={draftCoordinates.length < 2}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
            >
              บันทึกแนวถนน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

