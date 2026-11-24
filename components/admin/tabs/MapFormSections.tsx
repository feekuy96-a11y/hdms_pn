"use client";

import React from "react";
import { FileText, FileUp, Globe, MapPinned, Save } from "lucide-react";
import { HighwayIdentificationSection } from "@/components/admin/tabs/HighwayIdentificationSection";
import { RouteGeometryEditorSection } from "@/components/admin/tabs/RouteGeometryEditorSection";
import { DetourAdviceSection } from "@/components/admin/tabs/DetourAdviceSection";
import { FloodSituationSection } from "@/components/admin/tabs/FloodSituationSection";

// ============================================================================
// 1. Header & Mode Switcher (เส้นน้ำท่วม vs ทางเลี่ยง)
// ============================================================================
export interface MapTabHeaderProps {
  routeMode: "FLOOD" | "DETOUR";
  onSelectRouteMode: (mode: "FLOOD" | "DETOUR") => void;
}

export function MapTabHeader({ routeMode, onSelectRouteMode }: MapTabHeaderProps) {
  return (
    <div className="border-b border-surface pb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-heading font-black text-lg leading-snug tracking-normal text-white flex items-center gap-2">
          <MapPinned className="w-5 h-5 text-amber-400 shrink-0" /> จัดการแผนที่และรายงานเหตุการณ์
        </h2>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
          กำหนดจุดน้ำท่วม จุดเริ่มต้น-สิ้นสุด และดัดแนวเส้นทางให้เกาะถนนจริง
        </p>
      </div>
      {/* Switcher: Flood vs Detour */}
      <div className="flex bg-surface-canvas p-1 rounded-xl border border-surface">
        <button
          type="button"
          onClick={() => onSelectRouteMode("FLOOD")}
          className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold tracking-normal transition cursor-pointer ${
            routeMode === "FLOOD" ? "bg-red-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          เส้นน้ำท่วม
        </button>
        <button
          type="button"
          onClick={() => onSelectRouteMode("DETOUR")}
          className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold tracking-normal transition cursor-pointer ${
            routeMode === "DETOUR" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
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
          className="min-h-[2.5rem] rounded-lg bg-amber-500 px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold tracking-normal text-slate-950 hover:bg-amber-400 transition cursor-pointer"
        >
          กู้คืนร่างที่ค้างไว้
        </button>
        <button
          type="button"
          onClick={onClear}
          className="min-h-[2.5rem] rounded-lg border border-surface bg-surface-card px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold tracking-normal text-slate-300 hover:text-white transition cursor-pointer"
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
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-sky-500/50 bg-surface-card/70 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-surface-card hover:border-sky-400 transition">
        <FileUp className="h-4 w-4 shrink-0" /> นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง
        <input
          type="file"
          className="sr-only"
          accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx"
          onChange={onImportFile}
        />
      </label>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-surface bg-surface-card px-3 py-2 text-xs text-slate-200 hover:border-amber-400/50 transition">
        <input
          type="checkbox"
          checked={saveAsDraft}
          onChange={(event) => onSaveAsDraftChange(event.target.checked)}
          className="h-4 w-4 accent-amber-500 shrink-0 cursor-pointer"
        />
        <span>บันทึกเป็นฉบับร่าง (ยังไม่แสดงบนแผนที่ประชาชน)</span>
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
    <div className="sticky bottom-0 z-10 -mx-[0.25rem] flex flex-wrap sm:flex-nowrap items-center gap-[0.5em] rounded-xl border border-surface bg-surface-floating p-[0.75rem] shadow-[0_-10px_24px_rgba(2,6,23,0.65)]">
      <div className="flex flex-1 min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
        <span
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-heading font-bold leading-snug tracking-normal whitespace-nowrap ${
            saveAsDraft
              ? "border border-amber-500/40 bg-amber-950/50 text-amber-200"
              : "border border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
          }`}
        >
          {saveAsDraft ? (
            <>
              <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>โหมดฉบับร่าง (ยังไม่แสดงประชาชน)</span>
            </>
          ) : (
            <>
              <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>เผยแพร่ขึ้นแผนที่ประชาชน</span>
            </>
          )}
        </span>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmit}
          className={`flex-1 min-h-11 font-heading font-black tracking-normal py-2.5 px-4 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer ${
            saveAsDraft
              ? "bg-surface-card hover:bg-slate-800 text-amber-200 border border-amber-500/50"
              : "bg-amber-500 hover:bg-amber-400 text-slate-950"
          }`}
        >
          <Save className="w-4 h-4 shrink-0" />
          <span>
            {routeEditId
              ? routeMode === "DETOUR" ? "บันทึกการแก้ไขทางเลี่ยง" : "บันทึกการแก้ไขเหตุการณ์"
              : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ" : "บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ"}
          </span>
        </button>
      </div>
      {routeEditId && onCancelEdit && (
        <button
          type="button"
          onClick={onCancelEdit}
          className="min-h-11 border border-surface bg-surface-card hover:bg-slate-800 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-heading font-semibold tracking-normal transition cursor-pointer"
        >
          ยกเลิก
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 5. Main Form Section Container Wrapper
// ============================================================================
export interface MapFormSectionsProps {
  routeMode: "FLOOD" | "DETOUR";
  highwayProps: Omit<React.ComponentProps<typeof HighwayIdentificationSection>, "routeMode">;
  geometryProps: Omit<React.ComponentProps<typeof RouteGeometryEditorSection>, "routeMode">;
  detourProps: React.ComponentProps<typeof DetourAdviceSection>;
  floodProps: React.ComponentProps<typeof FloodSituationSection>;
  submitBarProps: Omit<MapSubmitActionBarProps, "routeMode">;
}

export function MapFormSections({
  routeMode,
  highwayProps,
  geometryProps,
  detourProps,
  floodProps,
  submitBarProps,
}: MapFormSectionsProps) {
  return (
    <div className="space-y-5">
      {/* 1. Highway Identification */}
      <HighwayIdentificationSection routeMode={routeMode} {...highwayProps} />

      {/* 2. Coordinates & Dual-Source Snapping Controls */}
      <RouteGeometryEditorSection routeMode={routeMode} {...geometryProps} />

      {/* 3. Auto Detour Advice Generator (If in Detour mode) */}
      {routeMode === "DETOUR" && <DetourAdviceSection {...detourProps} />}

      {/* 4. Water Level, Status & Safety Measures (If Flood) */}
      {routeMode === "FLOOD" && <FloodSituationSection {...floodProps} />}

      {/* 5. Submit Route Button */}
      <MapSubmitActionBar routeMode={routeMode} {...submitBarProps} />
    </div>
  );
}
