"use client";

import React from "react";
import { FileUp, MapPinned, Save } from "lucide-react";
import { StickyActionBar } from "@/components/admin/ui";

// ============================================================================
// 1. Header & Mode Switcher (เส้นน้ำท่วม vs ทางเลี่ยง)
// ============================================================================
export interface MapTabHeaderProps {
  routeMode: "FLOOD" | "DETOUR";
  onSelectRouteMode: (mode: "FLOOD" | "DETOUR") => void;
}

export function MapTabHeader({ routeMode, onSelectRouteMode }: MapTabHeaderProps) {
  return (
    <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
          <MapPinned className="w-5 h-5 text-amber-400" /> จัดการแผนที่และรายงานเหตุการณ์
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          กำหนดจุดน้ำท่วม จุดเริ่มต้น-สิ้นสุด และดัดแนวเส้นทางให้เกาะถนนจริง
        </p>
      </div>
      {/* Switcher: Flood vs Detour */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => onSelectRouteMode("FLOOD")}
          className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold transition ${
            routeMode === "FLOOD" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          เส้นน้ำท่วม
        </button>
        <button
          type="button"
          onClick={() => onSelectRouteMode("DETOUR")}
          className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold transition ${
            routeMode === "DETOUR" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
          }`}
        >
          ทางเลี่ยง
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 2. Draft Auto-Save Recovery Banner
// ============================================================================
export interface DraftRecoveryBannerProps {
  recoverableDraft: {
    routeMode: "FLOOD" | "DETOUR";
    savedAt: number | string;
  } | null;
  routeEditId: string;
  onRestore: () => void;
  onClear: () => void;
}

export function DraftRecoveryBanner({
  recoverableDraft,
  routeEditId,
  onRestore,
  onClear,
}: DraftRecoveryBannerProps) {
  if (!recoverableDraft || routeEditId) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-[0.65em] rounded-xl border border-amber-500/50 bg-amber-950/35 px-[1rem] py-[0.75rem]"
    >
      <p className="max-w-[65ch] text-[0.8125rem] text-amber-200">
        <strong className="font-heading text-amber-300">พบร่างข้อมูลที่พิมพ์ค้างไว้</strong>{" "}
        ({recoverableDraft.routeMode === "FLOOD" ? "เส้นน้ำท่วม" : "ทางเลี่ยง"} · บันทึกเมื่อ{" "}
        {new Date(recoverableDraft.savedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
      </p>
      <div className="flex flex-wrap items-center gap-[0.5em]">
        <button
          type="button"
          onClick={onRestore}
          className="min-h-[2.5rem] rounded-lg bg-amber-500 px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold text-slate-950 hover:bg-amber-400 transition"
        >
          กู้คืนร่างที่ค้างไว้
        </button>
        <button
          type="button"
          onClick={onClear}
          className="min-h-[2.5rem] rounded-lg border border-slate-700 bg-slate-900 px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold text-slate-300 hover:text-white transition"
        >
          ลบร่าง
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 3. File Import & Save As Draft Options
// ============================================================================
export interface RouteImportAndDraftOptionsProps {
  saveAsDraft: boolean;
  onSaveAsDraftChange: (checked: boolean) => void;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function RouteImportAndDraftOptions({
  saveAsDraft,
  onSaveAsDraftChange,
  onImportFile,
}: RouteImportAndDraftOptionsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-sky-700 bg-sky-950/30 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-950/50">
        <FileUp className="h-4 w-4" /> นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง
        <input
          type="file"
          className="sr-only"
          accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx"
          onChange={onImportFile}
        />
      </label>

      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={saveAsDraft}
          onChange={(event) => onSaveAsDraftChange(event.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        บันทึกเป็นฉบับร่าง (ยังไม่แสดงบนแผนที่ประชาชน)
      </label>
    </div>
  );
}

// ============================================================================
// 4. Submit & Cancel Sticky Action Bar
// ============================================================================
export interface MapSubmitActionBarProps {
  saveAsDraft: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  routeEditId: string;
  routeMode: "FLOOD" | "DETOUR";
  onCancelEdit?: () => void;
}

export function MapSubmitActionBar({
  saveAsDraft,
  isSubmitting,
  onSubmit,
  routeEditId,
  routeMode,
  onCancelEdit,
}: MapSubmitActionBarProps) {
  return (
    <StickyActionBar>
      <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
        <span
          className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-heading font-bold whitespace-nowrap ${
            saveAsDraft
              ? "border border-amber-500/40 bg-amber-950/50 text-amber-200"
              : "border border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
          }`}
        >
          {saveAsDraft ? "📝 โหมดฉบับร่าง (ยังไม่แสดงประชาชน)" : "🌐 เผยแพร่ขึ้นแผนที่ประชาชน"}
        </span>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmit}
          className={`flex-1 font-heading font-black py-3 px-4 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer ${
            saveAsDraft
              ? "bg-slate-700 hover:bg-slate-600 text-amber-200 border border-amber-500/50"
              : "bg-amber-500 hover:bg-amber-400 text-slate-950"
          }`}
        >
          <Save className="w-4 h-4" />
          {routeEditId
            ? routeMode === "DETOUR" ? "บันทึกการแก้ไขทางเลี่ยง" : "บันทึกการแก้ไขเหตุการณ์"
            : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ" : "บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ"}
        </button>
      </div>
      {routeEditId && onCancelEdit && (
        <button
          type="button"
          onClick={onCancelEdit}
          className="bg-slate-800 text-slate-300 px-4 py-3 rounded-xl text-xs font-heading font-semibold"
        >
          ยกเลิก
        </button>
      )}
    </StickyActionBar>
  );
}

// ============================================================================
// 5. Main Form Section Container Wrapper
// ============================================================================
export interface MapFormSectionsProps {
  children: React.ReactNode;
}

export function MapFormSections({ children }: MapFormSectionsProps) {
  return <div className="space-y-5">{children}</div>;
}
