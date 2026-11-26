"use client";

import React from "react";
import workspace from "../AdminWorkspace.module.css";
import { ClipboardList, FileText, FileUp, MapPinned, Navigation, Save } from "lucide-react";
import { HighwayIdentificationSection } from "@/components/admin/tabs/HighwayIdentificationSection";
import { RouteGeometryEditorSection } from "@/components/admin/tabs/RouteGeometryEditorSection";
import { DetourAdviceSection } from "@/components/admin/tabs/DetourAdviceSection";
import { AdminOfflineFormNotice } from "./AdminOfflineFormNotice";
import { FloodSaveError, type FloodSaveValidation } from "./flood-save-validation";
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
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div>
        <h2 className={`${workspace.formHeadingTitle} flex items-center gap-2 font-heading font-black leading-snug tracking-normal text-white`}>
          <MapPinned className={`${workspace.formHeadingIcon} shrink-0 text-amber-400`} aria-hidden="true" /> {routeMode === "FLOOD" ? "รายงานสถานการณ์น้ำท่วม" : "วาดและบันทึกทางเลี่ยง"}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
          เลือกประเภทงาน ใช้แผนที่ GIS กำหนดแนวเส้น แล้วบันทึกในแบบฟอร์มนี้
        </p>
      </div>
      {/* Switcher: Flood vs Detour */}
      <div role="group" aria-label="ประเภทงานภาคสนาม"
        className="grid w-full grid-cols-2 rounded-xl border border-surface bg-surface-canvas p-1 sm:flex sm:w-auto">
        <button
          type="button"
          onClick={() => onSelectRouteMode("FLOOD")}
          aria-pressed={routeMode === "FLOOD"}
          className={`min-h-11 px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold tracking-normal transition cursor-pointer ${
            routeMode === "FLOOD" ? "bg-red-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          เส้นน้ำท่วม
        </button>
        <button
          type="button"
          onClick={() => onSelectRouteMode("DETOUR")}
          aria-pressed={routeMode === "DETOUR"}
          className={`min-h-11 px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold tracking-normal transition cursor-pointer ${
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
function RouteImportControl({ onImportFile }: { onImportFile: React.ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-2 rounded-xl border border-dashed border-sky-500/50 bg-surface-panel px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-surface-card hover:border-sky-400">
      <FileUp className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง</span>
      <span className="ml-6 text-[11px] font-normal text-slate-400 sm:ml-auto">KML · SHP · GeoJSON · GPX</span>
      <input
        type="file"
        aria-label="นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง"
        className="sr-only"
        accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx"
        onChange={onImportFile}
      />
    </label>
  );
}

function DraftPublicationChoice({
  saveAsDraft, onSaveAsDraftChange,
}: {
  saveAsDraft: boolean;
  onSaveAsDraftChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-surface bg-surface-panel px-4 py-3">
      <h3 className="text-sm font-bold text-white">บันทึกและเผยแพร่</h3>
      <p className="mt-1 text-xs text-slate-400">ถ้าข้อมูลยังไม่พร้อมให้ประชาชนเห็น ให้เลือกบันทึกเป็นฉบับร่าง</p>
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-surface bg-surface-card px-3 py-2 text-xs font-semibold text-slate-200">
        <input type="checkbox" checked={saveAsDraft}
          onChange={(event) => onSaveAsDraftChange(event.target.checked)}
          className="h-4 w-4 shrink-0 cursor-pointer accent-amber-500" />
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
  linkedDetourPending?: boolean;
  dualFloodSaveState?: "idle" | "retry-right" | "verify";
  onSubmit: () => void;
  offline: boolean;
  heldOffline: boolean;
  routeEditId: string;
  routeMode: "FLOOD" | "DETOUR";
  onCancelEdit?: () => void;
}

export function MapSubmitActionBar({
  saveAsDraft,
  isSubmitting,
  linkedDetourPending,
  dualFloodSaveState,
  onSubmit,
  offline,
  heldOffline,
  routeEditId,
  routeMode,
  onCancelEdit,
}: MapSubmitActionBarProps) {
  return (
    <div aria-label="การบันทึกแบบฟอร์ม" role="region"
      className={`${workspace.actionBar} fixed inset-x-2 bottom-2 z-[510] grid items-center lg:sticky lg:inset-x-auto lg:bottom-0 lg:z-10 gap-1.5 rounded-xl border border-surface bg-surface-floating px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_20px_rgba(2,6,23,0.50)] sm:-mx-[0.25rem] sm:flex sm:p-[0.75rem] ${offline || heldOffline ? "sm:flex-wrap" : "sm:flex-nowrap"} ${routeEditId && onCancelEdit ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}>
      <AdminOfflineFormNotice offline={offline} held={heldOffline} />
      <div className="contents sm:flex sm:flex-1 sm:min-w-0 sm:flex-row sm:items-center sm:gap-1.5">
        {saveAsDraft && (
          <span className="col-span-full inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 text-xs font-bold leading-snug text-amber-200 sm:py-1.5">
            <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            โหมดฉบับร่าง (ยังไม่แสดงประชาชน)
          </span>
        )}
        <button
          type="button"
          disabled={isSubmitting || (!offline && dualFloodSaveState === "verify")}
          onClick={onSubmit}
          className={`min-w-0 flex-1 min-h-11 font-heading font-black tracking-normal py-2 px-2.5 rounded-xl text-xs sm:px-4 sm:text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer ${
            saveAsDraft
              ? "bg-surface-card hover:bg-slate-800 text-amber-200 border border-amber-500/50"
              : workspace.primary
          }`}
        >
          <Save className="w-4 h-4 shrink-0" />
          <span>
            {offline ? "เก็บไว้ในฟอร์มนี้ (ยังไม่ส่ง)"
              : dualFloodSaveState === "verify" ? "ตรวจผลบันทึกในทะเบียนเหตุการณ์ก่อน"
              : dualFloodSaveState === "retry-right" ? "ลองบันทึกฝั่งขวาอีกครั้ง"
              : routeMode === "DETOUR" && !routeEditId && linkedDetourPending
              ? "ลองผูกเหตุการณ์อีกครั้ง"
              : saveAsDraft
                ? routeMode === "DETOUR" ? "บันทึกร่างทางเลี่ยง" : "บันทึกร่างเหตุการณ์"
                : routeEditId
                  ? routeMode === "DETOUR" ? "บันทึกการแก้ไขทางเลี่ยง" : "บันทึกการแก้ไขเหตุการณ์"
                  : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ" : "บันทึกเหตุการณ์"}
          </span>
        </button>
      </div>
      {routeEditId && onCancelEdit && (
        <button
          type="button"
          onClick={onCancelEdit}
          disabled={isSubmitting}
          className="min-h-11 border border-surface bg-surface-card hover:bg-slate-800 text-slate-200 px-3 py-2.5 sm:px-4 rounded-xl text-xs font-heading font-semibold tracking-normal transition cursor-pointer"
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
  floodValidation?: FloodSaveValidation | null;
  highwayProps: Omit<React.ComponentProps<typeof HighwayIdentificationSection>, "routeMode">;
  geometryProps: Omit<React.ComponentProps<typeof RouteGeometryEditorSection>, "routeMode">;
  detourProps: React.ComponentProps<typeof DetourAdviceSection>;
  floodProps: React.ComponentProps<typeof FloodSituationSection>;
  submitBarProps: Omit<MapSubmitActionBarProps, "routeMode">;
  onImportFile: React.ChangeEventHandler<HTMLInputElement>;
  onSaveAsDraftChange: (checked: boolean) => void;
}

export function MapFormSections({
  routeMode, floodValidation,
  highwayProps,
  geometryProps,
  detourProps,
  floodProps,
  submitBarProps,
  onImportFile,
  onSaveAsDraftChange,
}: MapFormSectionsProps) {
  const sectionId = React.useId();
  const sections = [
    { key: "route", text: "ตำแหน่ง", label: "สายทางและหลักกิโลเมตร", icon: MapPinned },
    { key: "geometry", text: "แนวเส้น", label: "แนวเส้นและพิกัด", icon: Navigation },
    { key: "details", text: routeMode === "FLOOD" ? "สถานการณ์" : "คำแนะนำ", label: routeMode === "FLOOD" ? "ข้อมูลสถานการณ์น้ำท่วม" : "คำแนะนำเส้นทางเลี่ยง", icon: ClipboardList },
    { key: "publish", text: "บันทึก", label: "เลือกวิธีบันทึกและเผยแพร่", icon: Save },
  ] as const;
  const getId = (key: string) => `${sectionId}-${key}`;
  const focusSection = (key: string) => {
    const target = document.getElementById(getId(key));
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", inline: "nearest" });
  };

  return (
    <div className="min-w-0 space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:space-y-5 sm:pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
      <nav aria-label="ข้ามไปยังส่วนของแบบฟอร์ม"
        className={`${workspace.sectionJumps} rounded-xl border border-surface bg-surface-panel`}>
        <p className="mb-1 px-1 text-[11px] font-semibold text-slate-400">หัวข้องานในแบบฟอร์ม</p>
        <div className="grid grid-cols-4 gap-1">
          {sections.map(({ key, text, label, icon: Icon }) => (
            <button key={key} type="button" aria-label={label} aria-controls={getId(key)}
              onClick={() => focusSection(key)}
              className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-card px-1 py-1.5 text-center text-[11px] font-heading font-bold leading-tight text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:flex-row sm:gap-1.5 sm:text-xs">
              <Icon className="size-3.5 shrink-0 text-sky-300" aria-hidden="true" />
              <span className="min-w-0">{text}</span>
            </button>
          ))}
        </div>
      </nav>
      <section id={getId("route")} tabIndex={-1} aria-label={sections[0].label}
        className="min-w-0 scroll-mt-32 rounded-xl lg:scroll-mt-3 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
        <HighwayIdentificationSection routeMode={routeMode} {...highwayProps} validation={floodValidation} />
      </section>

      <section id={getId("geometry")} tabIndex={-1} aria-label={sections[1].label}
        className="min-w-0 scroll-mt-32 rounded-xl lg:scroll-mt-3 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
        <div className="space-y-2">
          {routeMode === "FLOOD" && (
            <div id="flood-geometry-validation-target" tabIndex={-1} role="group" aria-label="ตรวจแนวเส้นน้ำท่วม"
              aria-describedby={floodValidation?.target === "flood-geometry-validation-target" ? "flood-save-validation-message" : undefined}>
              <FloodSaveError validation={floodValidation} target="flood-geometry-validation-target" />
            </div>
          )}
          <RouteGeometryEditorSection routeMode={routeMode} {...geometryProps} />
          <RouteImportControl onImportFile={onImportFile} />
        </div>
      </section>

      <section id={getId("details")} tabIndex={-1} aria-label={sections[2].label}
        className="min-w-0 scroll-mt-32 rounded-xl lg:scroll-mt-3 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
        {routeMode === "DETOUR" ? <DetourAdviceSection {...detourProps} /> : <FloodSituationSection {...floodProps} validation={floodValidation} />}
      </section>

      <section id={getId("publish")} tabIndex={-1} aria-label={sections[3].label}
        className="min-w-0 scroll-mt-32 rounded-xl lg:scroll-mt-3 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
        <DraftPublicationChoice saveAsDraft={submitBarProps.saveAsDraft} onSaveAsDraftChange={onSaveAsDraftChange} />
      </section>
      <MapSubmitActionBar routeMode={routeMode} {...submitBarProps} />
    </div>
  );
}
