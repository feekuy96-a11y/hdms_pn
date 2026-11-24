"use client";

import React from "react";
import { X } from "lucide-react";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import type { EditingRouteSpecsState, HighwayFeatureSummary } from "./GisHighwayModals";

export interface HighwayRouteDetailModalProps {
  selectedRoute: { layerId: string; featureIdx: number } | null;
  setSelectedRoute: (route: { layerId: string; featureIdx: number } | null) => void;
  allHighwayFeatures: HighwayFeatureSummary[];
  setEditingRouteSpecs: React.Dispatch<React.SetStateAction<EditingRouteSpecsState | null>>;
  openGeometryEditor: (layerId: string, featureIdx: number) => void;
  handleDeleteHighwayFeature: (layerId: string, featureIdx: number, title: string) => void;
}

export function HighwayRouteDetailModal({
  selectedRoute,
  setSelectedRoute,
  allHighwayFeatures,
  setEditingRouteSpecs,
  openGeometryEditor,
  handleDeleteHighwayFeature,
}: HighwayRouteDetailModalProps) {
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
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
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
            className="min-h-10 flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold font-heading text-slate-950 transition shadow-md"
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
            className="min-h-10 flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-bold font-heading text-slate-200 transition border border-slate-700"
            onClick={() => {
              setSelectedRoute(null);
              openGeometryEditor(item.layerId, item.featureIdx);
            }}
          >
            แนวถนน
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl bg-rose-950/80 hover:bg-rose-900 px-4 py-2.5 text-xs font-bold font-heading text-rose-300 transition border border-rose-800/60"
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
