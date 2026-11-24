"use client";

import React from "react";
import { Layers, Building2, ChevronUp, ChevronDown, LocateFixed, Map as MapIcon } from "lucide-react";
import { SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { isFloodLineVisibleOnCurrentMap } from "./longdo-map-popups";

interface MapLegendOverlayProps {
  systemData: SystemDataPayload;
  mapStyles: any;
  mapReady: boolean;
  isLayerControlCollapsed: boolean;
  setIsLayerControlCollapsed: (collapsed: boolean) => void;
  showFloodLayer: boolean;
  setShowFloodLayer: (show: boolean) => void;
  effectiveShowFloodLayer: boolean;
  floodDisplayMode: "SEGMENTS" | "EVENTS";
  setFloodDisplayMode: (mode: "SEGMENTS" | "EVENTS") => void;
  showDetourLayer: boolean;
  setShowDetourLayer: (show: boolean) => void;
  effectiveShowDetourLayer: boolean;
  showMainHwy: boolean;
  setShowMainHwy: (show: boolean) => void;
  showSecHwy: boolean;
  setShowSecHwy: (show: boolean) => void;
  showSecondaryAtCurrentZoom: boolean;
  forceShowAllHighways: boolean;
  setForceShowAllHighways: (force: boolean) => void;
  showOffices: boolean;
  setShowOffices: (show: boolean) => void;
  showHighwayShields: boolean;
  setShowHighwayShields: (show: boolean) => void;
  legendRouteList: "MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null;
  setLegendRouteList: (list: "MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null) => void;
  legendRoutes: (type: "MAIN_HIGHWAY" | "SECOND_HIGHWAY") => { code: string; name: string }[];
  activeBaseMap: "road" | "sat" | "longdo";
  switchBaseMap: (key: "road" | "sat" | "longdo") => void;
  resetCamera: () => void;
  locateUser: () => void;
  isLocating: boolean;
  locationStatus: string | null;
  previewPointPhoto: { url: string; title: string } | null;
  setPreviewPointPhoto: (photo: { url: string; title: string } | null) => void;
  isMapPopupOpen?: boolean;
  publicMode?: boolean;
  isSidebarCollapsed?: boolean;
}

export function MapLegendOverlay({
  systemData,
  mapStyles,
  mapReady,
  isLayerControlCollapsed,
  setIsLayerControlCollapsed,
  showFloodLayer,
  setShowFloodLayer,
  effectiveShowFloodLayer,
  floodDisplayMode,
  setFloodDisplayMode,
  showDetourLayer,
  setShowDetourLayer,
  effectiveShowDetourLayer,
  showMainHwy,
  setShowMainHwy,
  showSecHwy,
  setShowSecHwy,
  showSecondaryAtCurrentZoom,
  forceShowAllHighways,
  setForceShowAllHighways,
  showOffices,
  setShowOffices,
  showHighwayShields,
  setShowHighwayShields,
  legendRouteList,
  setLegendRouteList,
  legendRoutes,
  activeBaseMap,
  switchBaseMap,
  resetCamera,
  locateUser,
  isLocating,
  locationStatus,
  previewPointPhoto,
  setPreviewPointPhoto,
  isMapPopupOpen = false,
  publicMode = true,
  isSidebarCollapsed = false,
}: MapLegendOverlayProps) {
  const mobileOverlayHiddenClass = isMapPopupOpen ? "max-sm:opacity-0 max-sm:pointer-events-none" : "";
  const mobileInteractiveClass = isMapPopupOpen ? "pointer-events-auto max-sm:pointer-events-none" : "pointer-events-auto";

  return (
    <>
      {/* Top Header Controls Bar (Responsive: status badges on left, legend toggle button on right) */}
      <div className={`absolute top-[1em] inset-x-3 z-[400] flex items-start justify-between gap-[0.5em] pointer-events-none transition-opacity duration-150 ${mobileOverlayHiddenClass}`} aria-label="สรุปสถานการณ์และแถบควบคุมบนแผนที่">
        {/* Status Badges on the left */}
        <div className={`flex flex-1 min-w-0 flex-wrap items-center gap-[0.333em] sm:gap-[0.5em] pointer-events-none py-[0.167em] ${
          !publicMode ? "lg:pl-28" : isSidebarCollapsed ? "lg:pl-44" : ""
        }`}>
          <div className={`${mobileInteractiveClass} rounded-lg border border-red-500/50 bg-slate-950/95 px-[0.667em] sm:px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] font-medium text-white shadow-lg backdrop-blur shrink-0 whitespace-nowrap flex items-center gap-[0.5em]`}>
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            <span>น้ำท่วม <strong className="text-red-300 font-bold">{showFloodLayer ? (systemData.floodRoutes || []).filter((item) => item.is_active).length : 0}</strong> จุด</span>
          </div>
          <div className={`${mobileInteractiveClass} rounded-lg border border-amber-500/50 bg-slate-950/95 px-[0.667em] sm:px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] font-medium text-white shadow-lg backdrop-blur shrink-0 whitespace-nowrap flex items-center gap-[0.5em]`}>
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            <span>ทางเลี่ยง <strong className="text-amber-300 font-bold">{showDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</strong> เส้นทาง</span>
          </div>
        </div>

        {/* Legend Toggle Button on the right (collapsed state) */}
        {isLayerControlCollapsed && (
          <div className={`${mobileInteractiveClass} flex items-center gap-1.5 shrink-0`}>
            <button
              type="button"
              onClick={() => switchBaseMap(activeBaseMap === "sat" ? "road" : "sat")}
              className="bg-[#0b162c]/95 hover:bg-[#0f1d3a] border border-slate-700/80 rounded-lg px-[0.667em] py-[0.333em] shadow-lg flex items-center gap-[0.333em] text-[0.75rem]/[1.1rem] font-medium text-slate-300 hover:text-white transition backdrop-blur-md cursor-pointer"
              title={activeBaseMap === "sat" ? "เปลี่ยนเป็นแผนที่ถนน" : "เปลี่ยนเป็นภาพถ่ายดาวเทียม"}
              aria-label={activeBaseMap === "sat" ? "เปลี่ยนเป็นแผนที่ถนน" : "เปลี่ยนเป็นภาพถ่ายดาวเทียม"}
            >
              <MapIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="hidden sm:inline">{activeBaseMap === "sat" ? "ดาวเทียม" : "ถนน"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsLayerControlCollapsed(false)}
              className="bg-[#0b162c]/95 hover:bg-[#0f1d3a] border border-slate-700/80 rounded-lg px-[0.833em] py-[0.333em] shadow-lg flex items-center gap-[0.5em] text-[0.75rem]/[1.1rem] font-heading font-bold text-amber-300 transition backdrop-blur-md cursor-pointer"
              title="เปิดแถบควบคุมเลเยอร์แผนที่"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden xs:inline sm:inline">สัญลักษณ์บนแผนที่</span>
              <span className="inline xs:hidden sm:hidden">สัญลักษณ์</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* Quick Geolocation Control & Live Status when Legend is collapsed */}
      {isLayerControlCollapsed && (
        <div className={`absolute top-[calc(1em+3rem)] right-3 z-[400] flex flex-col items-end gap-[0.5em] pointer-events-none transition-opacity duration-150 ${mobileOverlayHiddenClass}`}>
          <button
            type="button"
            onClick={locateUser}
            disabled={isLocating || !mapReady}
            aria-label="ตำแหน่งของฉัน"
            className={`${mobileInteractiveClass} inline-flex min-h-11 sm:min-h-9 items-center gap-[0.5em] rounded-lg border border-slate-700/80 bg-[#0b162c]/95 px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] font-semibold text-sky-300 shadow-lg backdrop-blur-md transition hover:bg-[#0f1d3a] hover:text-sky-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400`}
          >
            <LocateFixed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{isLocating ? "กำลังหา…" : "ตำแหน่งของฉัน"}</span>
          </button>
          {locationStatus && (
            <p role="status" aria-live="polite" className={`${mobileInteractiveClass} max-w-[13.75rem] rounded-md border border-slate-700/80 bg-slate-950/90 px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] leading-snug text-slate-200 shadow-lg backdrop-blur-md`}>
              {locationStatus}
            </p>
          )}
        </div>
      )}

      {/* Expanded Legend Panel (positioned cleanly at top-[1em] right-3, drops down smoothly) */}
      {!isLayerControlCollapsed && (
        <div className="absolute top-[1em] right-3 z-[410] bg-[#0b162c]/95 backdrop-blur border border-slate-700/80 rounded-2xl p-[1em] sm:p-[1.167em] shadow-2xl min-w-[13.4375rem] sm:min-w-[15rem] max-w-[calc(100vw-1.5rem)] text-xs pointer-events-auto animate-fade-in max-h-[85dvh] overflow-y-auto">
          <div className="font-heading font-bold text-amber-400 flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="flex items-center gap-[0.5em] text-xs text-white">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> สัญลักษณ์บนแผนที่
            </span>
            <div className="flex items-center gap-[0.667em]">
              <button type="button" onClick={resetCamera} className="text-[0.75rem]/[1.1rem] text-sky-400 hover:text-sky-300 hover:underline">
                รีเซ็ต
              </button>
              <button
                type="button"
                onClick={locateUser}
                disabled={isLocating || !mapReady}
                aria-label="ตำแหน่งของฉัน"
                className="inline-flex min-h-8 items-center gap-[0.333em] rounded-md px-[0.5em] text-[0.75rem]/[1.1rem] font-semibold text-sky-300 hover:bg-slate-800 hover:text-sky-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                {isLocating ? "กำลังหา…" : "ตำแหน่งของฉัน"}
              </button>
              <button
                type="button"
                onClick={() => setIsLayerControlCollapsed(true)}
                className="p-[0.333em] text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                title="ย่อแถบควบคุมเลเยอร์"
                aria-label="ย่อแถบควบคุมเลเยอร์"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {locationStatus && (
            <p role="status" aria-live="polite" className="mt-2 rounded-md bg-slate-900/80 px-[0.667em] py-[0.5em] text-[0.75rem]/[1.1rem] leading-snug text-slate-300">
              {locationStatus}
            </p>
          )}

          <div className="space-y-1.5">
            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายหลัก" onFocus={() => setLegendRouteList("MAIN_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("MAIN_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
              <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
                <span className="flex items-center gap-[0.667em]">
                  <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.primary?.color }} />
                  <span>ทางหลวงสายหลัก</span>
                </span>
                <input
                  type="checkbox"
                  checked={showMainHwy}
                  onChange={(e) => setShowMainHwy(e.target.checked)}
                  className="accent-emerald-500 rounded h-4 w-4 shrink-0 cursor-pointer"
                />
              </label>
              {legendRouteList === "MAIN_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-[0.667em] text-xs text-white shadow-xl">{legendRoutes("MAIN_HIGHWAY").length ? legendRoutes("MAIN_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-[0.333em] last:border-0"><strong className="text-emerald-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายรอง" onFocus={() => setLegendRouteList("SECOND_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("SECOND_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
              <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
                <span className="flex items-center gap-[0.667em]">
                  <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.secondary?.color }} />
                  <span>ทางหลวงสายรอง</span>
                </span>
                <input
                  type="checkbox"
                  checked={showSecHwy}
                  onChange={(e) => setShowSecHwy(e.target.checked)}
                  className="accent-sky-400 rounded h-4 w-4 shrink-0 cursor-pointer"
                />
              </label>
              {legendRouteList === "SECOND_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-[0.667em] text-xs text-white shadow-xl">{legendRoutes("SECOND_HIGHWAY").length ? legendRoutes("SECOND_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-[0.333em] last:border-0"><strong className="text-sky-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            {showSecHwy && (
              <div className="pl-5 pb-1">
                <label className="flex min-h-9 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-[0.75rem]/[1.1rem] text-slate-300 hover:text-white">
                  <span className="truncate">
                    แสดงสายรองทุกระดับซูม {!showSecondaryAtCurrentZoom ? "(ซูมออกซ่อนอัตโนมัติ)" : ""}
                  </span>
                  <input
                    type="checkbox"
                    checked={forceShowAllHighways}
                    onChange={(e) => setForceShowAllHighways(e.target.checked)}
                    className="accent-amber-400 rounded h-4 w-4 shrink-0 cursor-pointer"
                  />
                </label>
              </div>
            )}

            <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
              <span className="flex items-center gap-[0.667em]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ backgroundColor: mapStyles.flood?.color || LAYER_CONFIG.FLOOD_RED_LINE.color }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /><path d="M3 14c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /></svg></span>
                <span>เส้นน้ำท่วม <span className="ml-1 rounded-full bg-red-950 px-[0.5em] py-[0.167em] text-[0.75rem]/[1.1rem] text-red-300">{effectiveShowFloodLayer ? (systemData.floodRoutes || []).filter((item) => isFloodLineVisibleOnCurrentMap(item)).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={effectiveShowFloodLayer}
                onChange={(e) => setShowFloodLayer(e.target.checked)}
                className="accent-red-500 rounded h-4 w-4 shrink-0 cursor-pointer disabled:opacity-50"
              />
            </label>

            {effectiveShowFloodLayer && (
              <div className="pl-6 pb-1 pt-0.5 flex items-center justify-between text-[0.75rem]/[1.1rem] text-slate-300">
                <span>รูปแบบหมุด:</span>
                <div className="inline-flex rounded-lg bg-slate-900/90 p-[0.167em] border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setFloodDisplayMode("SEGMENTS")}
                    className={`min-h-8 px-[0.667em] py-[0.167em] rounded text-[0.75rem]/[1.1rem] font-medium transition cursor-pointer ${floodDisplayMode === "SEGMENTS"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                      }`}
                  >
                    แยกช่วง
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloodDisplayMode("EVENTS")}
                    className={`min-h-8 px-[0.667em] py-[0.167em] rounded text-[0.75rem]/[1.1rem] font-medium transition cursor-pointer ${floodDisplayMode === "EVENTS"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                      }`}
                  >
                    รวมเหตุการณ์
                  </button>
                </div>
              </div>
            )}

            <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
              <span className="flex items-center gap-[0.667em]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-950" style={{ backgroundColor: mapStyles.detour?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9" /><path d="m15 2 3 3-3 3" /><path d="M9 19h10" /></svg></span>
                <span>ทางเลี่ยง <span className="ml-1 rounded-full bg-amber-950 px-[0.5em] py-[0.167em] text-[0.75rem]/[1.1rem] text-amber-300">{effectiveShowDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={effectiveShowDetourLayer}
                onChange={(e) => setShowDetourLayer(e.target.checked)}
                className="accent-yellow-400 rounded h-4 w-4 shrink-0 cursor-pointer disabled:opacity-50"
              />
            </label>

            <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
              <span className="flex items-center gap-[0.667em]">
                <Building2 className="w-3.5 h-3.5 text-sky-400 inline-block shrink-0" />
                <span>สำนักงาน/หมวดทางหลวง</span>
              </span>
              <input
                type="checkbox"
                checked={showOffices}
                onChange={(e) => setShowOffices(e.target.checked)}
                className="accent-sky-400 rounded h-4 w-4 shrink-0 cursor-pointer"
              />
            </label>
            <label className="flex min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1 text-slate-200 hover:text-white">
              <span className="flex items-center gap-[0.667em]">
                <span className="flex h-4 min-w-5 items-center justify-center rounded-sm border border-slate-800 bg-white px-[0.167em] text-[0.625rem] font-bold text-slate-900 shrink-0">42</span>
                <span>หมายเลขทางหลวง</span>
              </span>
              <input type="checkbox" checked={showHighwayShields} onChange={(e) => setShowHighwayShields(e.target.checked)} className="accent-slate-400 rounded h-4 w-4 shrink-0 cursor-pointer" />
            </label>
          </div>

          {/* Base Map Switcher */}
          <div className="mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-3 gap-[0.333em] text-[0.75rem]/[1.1rem] font-heading font-bold">
            <button
              type="button"
              onClick={() => switchBaseMap("longdo")}
              className={`min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer ${activeBaseMap === "longdo" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              Longdo
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("road")}
              className={`min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer ${activeBaseMap === "road" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              ถนน OSM
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("sat")}
              className={`min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer ${activeBaseMap === "sat" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}
            >
              ดาวเทียม
            </button>
          </div>
        </div>
      )}

      {previewPointPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={previewPointPhoto.title}
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 p-[1em]"
          onClick={() => setPreviewPointPhoto(null)}
        >
          <button
            type="button"
            aria-label="ปิดภาพทางเข้าทางเลี่ยง"
            onClick={() => setPreviewPointPhoto(null)}
            className="absolute top-[1em] right-4 grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
          >
            ✕
          </button>
          <div className="max-w-[92vw] space-y-2 text-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewPointPhoto.url}
              alt={previewPointPhoto.title}
              className="max-h-[82dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl mx-auto"
            />
            <p className="text-xs sm:text-sm font-heading font-bold text-amber-200">{previewPointPhoto.title}</p>
          </div>
        </div>
      )}
    </>
  );
}
