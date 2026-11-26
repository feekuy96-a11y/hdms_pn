"use client";

import React from "react";
import { Layers, Plus, Minus, Building2, ChevronUp, ChevronDown, LocateFixed, Map as MapIcon, Info, X } from "lucide-react";
import { SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
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
  onZoomIn: () => void;
  onZoomOut: () => void;
  isLocating: boolean;
  locationStatus: string | null;
  previewPointPhoto: { url: string; title: string } | null;
  setPreviewPointPhoto: (photo: { url: string; title: string } | null) => void;
  isMapPopupOpen?: boolean;
  publicMode?: boolean;
  publicStatusSummary?: React.ReactNode;
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
  onZoomIn,
  onZoomOut,
  isLocating,
  locationStatus,
  previewPointPhoto,
  setPreviewPointPhoto,
  isMapPopupOpen = false,
  publicMode = true,
  publicStatusSummary,
  isSidebarCollapsed = false,
}: MapLegendOverlayProps) {
  const citizenLayersButton = React.useRef<HTMLButtonElement>(null);
  const citizenLayersPanel = React.useRef<HTMLDivElement>(null);
  const [pinnedRouteList, setPinnedRouteList] = React.useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null>(null);
  const mobileOverlayHiddenClass = isMapPopupOpen ? "max-sm:opacity-0 max-sm:pointer-events-none" : "";
  const mobileInteractiveClass = isMapPopupOpen ? "pointer-events-auto max-sm:pointer-events-none" : "pointer-events-auto";

  const closeLayerControl = () => {
    if (publicMode) {
      if (citizenLayersPanel.current?.contains(document.activeElement)) citizenLayersButton.current?.focus();
      citizenLayersPanel.current?.querySelectorAll("details[open]").forEach(details => details.removeAttribute("open"));
      citizenLayersPanel.current?.querySelector(".citizen-legend")?.scrollTo(0, 0);
    }
    setPinnedRouteList(null);
    setLegendRouteList(null);
    setIsLayerControlCollapsed(true);
  };
  const highwayLayerItems = [
    {
      key: "MAIN_HIGHWAY" as const,
      label: "ทางหลวงสายหลัก",
      infoLabel: "ดูรายชื่อทางหลวงสายหลัก",
      color: mapStyles.primary?.color,
      checked: showMainHwy,
      onChange: setShowMainHwy,
      checkboxAccent: "accent-emerald-500",
      activeBtnClass: "border-emerald-400/70 bg-emerald-950/70 text-emerald-300",
      codeTextClass: "text-emerald-300",
    },
    {
      key: "SECOND_HIGHWAY" as const,
      label: "ทางหลวงสายรอง",
      infoLabel: "ดูรายชื่อทางหลวงสายรอง",
      color: mapStyles.secondary?.color,
      checked: showSecHwy,
      onChange: setShowSecHwy,
      checkboxAccent: "accent-sky-400",
      activeBtnClass: "border-sky-400/70 bg-sky-950/70 text-sky-300",
      codeTextClass: "hdms-map-link",
    },
  ];
  const activeHighwayConfig = highwayLayerItems.find((item) => item.key === legendRouteList) ?? null;

  const highwayListPanel = legendRouteList && activeHighwayConfig && (
            <div
              role="tooltip"
              aria-label={`รายชื่อ${activeHighwayConfig.label}`}
              className={`${publicMode ? "citizen-layer-route-list" : ""} hdms-map-surface pointer-events-auto w-full sm:w-64 max-h-40 sm:max-h-[min(20rem,75dvh)] overflow-y-auto rounded-xl border p-3 text-xs shadow-2xl`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                <span className="font-heading font-bold">
                  รายชื่อ{activeHighwayConfig.label}
                </span>
                {pinnedRouteList && (
                  <button
                    type="button"
                    aria-label="ปิดรายชื่อสายทางหลวง" data-hdms-popup-close
                    onClick={() => {
                      setPinnedRouteList(null);
                      setLegendRouteList(null);
                    }}
                    className="hdms-map-control grid h-7 w-7 place-items-center rounded-md cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {legendRoutes(legendRouteList).length ? (
                legendRoutes(legendRouteList).map((route) => (
                  <div key={`${route.code}-${route.name}`} className="border-b border-slate-800/80 py-1.5 last:border-0 leading-snug">
                    <strong className={activeHighwayConfig.codeTextClass}>ทล.{route.code}</strong> — {route.name}
                  </div>
                ))
              ) : (
                <p className="py-1 hdms-map-muted">ไม่มีสายทางที่แสดง</p>
              )}
            </div>
          );

  const floodSwatch = mapStyles.flood?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
  const detourSwatch = mapStyles.detour?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;

  const baseMapChooser = (
            <div className="citizen-basemap-options hdms-contrast-switch mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-3 gap-[0.333em] text-[0.75rem]/[1.1rem] font-heading font-bold">
              <button
                type="button"
                onClick={() => switchBaseMap("longdo")}
                aria-pressed={activeBaseMap === "longdo"}
                className="min-h-11 sm:min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer"
              >
                Longdo
              </button>
              <button
                type="button"
                onClick={() => switchBaseMap("road")}
                aria-pressed={activeBaseMap === "road"}
                className="min-h-11 sm:min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer"
              >
                ถนน OSM
              </button>
              <button
                type="button"
                onClick={() => switchBaseMap("sat")}
                aria-pressed={activeBaseMap === "sat"}
                className="min-h-11 sm:min-h-10 py-[0.333em] rounded-lg transition text-center px-[0.333em] truncate cursor-pointer"
              >
                ดาวเทียม
              </button>
            </div>

  );

  const secondaryDisplaySetting = showSecHwy && (
                <div className="pl-5 pb-1">
                  <label className="flex min-h-11 sm:min-h-9 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 text-[0.75rem]/[1.1rem] hdms-guide-title touch-manipulation">
                    <span className="truncate">
                      แสดงสายรองทุกระดับซูม {!showSecondaryAtCurrentZoom ? "(ซูมออกซ่อนอัตโนมัติ)" : ""}
                    </span>
                    <input
                      type="checkbox"
                      checked={forceShowAllHighways}
                      onChange={(e) => setForceShowAllHighways(e.target.checked)}
                      className="accent-amber-400 rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer"
                    />
                  </label>
                </div>
              );
  const floodMarkerSetting = effectiveShowFloodLayer && (
                <div className="pl-6 pb-1 pt-0.5 flex items-center justify-between text-[0.75rem]/[1.1rem] hdms-map-muted">
                  <span>รูปแบบหมุด:</span>
                  <div className="hdms-contrast-switch hdms-map-subtle inline-flex gap-0.5 rounded-lg p-[0.167em] border">
                    <button
                      type="button"
                      onClick={() => setFloodDisplayMode("SEGMENTS")}
                      aria-pressed={floodDisplayMode === "SEGMENTS"}
                      className="min-h-9 sm:min-h-8 px-[0.667em] py-[0.167em] rounded text-[0.75rem]/[1.1rem] font-medium transition cursor-pointer"
                    >
                      แยกช่วง
                    </button>
                    <button
                      type="button"
                      onClick={() => setFloodDisplayMode("EVENTS")}
                      aria-pressed={floodDisplayMode === "EVENTS"}
                      className="min-h-9 sm:min-h-8 px-[0.667em] py-[0.167em] rounded text-[0.75rem]/[1.1rem] font-medium transition cursor-pointer"
                    >
                      รวมเหตุการณ์
                    </button>
                  </div>
                </div>
              );

  return (
    <>
      {publicMode ? (isLayerControlCollapsed && !isMapPopupOpen && publicStatusSummary) : (
      <div className={`${publicMode ? "citizen-map-summary" : ""} absolute top-3 inset-x-3 z-[400] flex items-start justify-between gap-1.5 sm:gap-2 pointer-events-none transition-opacity duration-150 ${mobileOverlayHiddenClass}`} aria-label="สรุปสถานการณ์และแถบควบคุมบนแผนที่">
        {/* Status Badges on the left */}
        <div className={`${publicMode ? "citizen-map-count" : ""} flex flex-1 min-w-0 flex-wrap items-center gap-1 sm:gap-2 pointer-events-none ${
          !publicMode
            ? isSidebarCollapsed
              ? "lg:pl-[9.25rem]"
              : "lg:pl-[6.75rem]"
            : isSidebarCollapsed
              ? "lg:pl-[11rem]"
              : ""
        }`}>
          <div className={`${mobileInteractiveClass} hdms-map-surface min-h-8 sm:min-h-9 rounded-lg border border-red-500/50 px-2 sm:px-3 py-1 text-[0.7rem]/[1rem] sm:text-xs font-medium shadow-lg shrink-0 whitespace-nowrap flex items-center gap-1.5 sm:gap-2`} data-map-tone="danger">
            <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
            <span>น้ำท่วม <strong className="font-bold">{showFloodLayer ? (systemData.floodRoutes || []).filter((item) => item.is_active).length : 0}</strong> จุด</span>
          </div>
          <div className={`${mobileInteractiveClass} hdms-map-surface min-h-8 sm:min-h-9 rounded-lg border border-amber-500/50 px-2 sm:px-3 py-1 text-[0.7rem]/[1rem] sm:text-xs font-medium shadow-lg shrink-0 whitespace-nowrap flex items-center gap-1.5 sm:gap-2`} data-map-tone="warning">
            <span className="inline-block h-2 w-2 rounded-full bg-current" />
            <span>ทางเลี่ยง <strong className="font-bold">{showDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</strong> เส้นทาง</span>
          </div>
        </div>

        {/* Legend Toggle Button on the right (collapsed state) */}
        {isLayerControlCollapsed && !publicMode && (
          <div className={`${mobileInteractiveClass} flex items-center gap-1 sm:gap-1.5 shrink-0`}>
            <button
              type="button"
              onClick={() => switchBaseMap(activeBaseMap === "sat" ? "road" : "sat")}
              className="citizen-map-action hdms-map-control min-h-8 sm:min-h-9 border rounded-lg px-2 sm:px-2.5 py-1 shadow-lg flex items-center gap-1.5 text-[0.7rem]/[1rem] sm:text-xs font-medium text-slate-300 hover:text-white transition backdrop-blur-md cursor-pointer"
              title={activeBaseMap === "sat" ? "เปลี่ยนเป็นแผนที่ถนน" : "เปลี่ยนเป็นภาพถ่ายดาวเทียม"}
              aria-label={activeBaseMap === "sat" ? "เปลี่ยนเป็นแผนที่ถนน" : "เปลี่ยนเป็นภาพถ่ายดาวเทียม"}
            >
              <MapIcon className="w-3.5 h-3.5 hdms-map-link shrink-0" />
              <span className="hidden sm:inline">{activeBaseMap === "sat" ? "ดาวเทียม" : "ถนน"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsLayerControlCollapsed(false)}
              className="citizen-map-action hdms-map-control min-h-8 sm:min-h-9 border rounded-lg px-2.5 sm:px-3 py-1 shadow-lg flex items-center gap-1.5 sm:gap-2 text-[0.7rem]/[1rem] sm:text-xs font-heading font-bold text-amber-300 transition backdrop-blur-md cursor-pointer"
              title="เปิดแถบควบคุมเลเยอร์แผนที่"
              aria-expanded={false}
            >
              <Layers className="w-3.5 h-3.5 hdms-guide-accent shrink-0" />
              <span className="hidden xs:inline sm:inline">สัญลักษณ์บนแผนที่</span>
              <span className="inline xs:hidden sm:hidden">สัญลักษณ์</span>
              <ChevronDown className="w-3.5 h-3.5 hdms-map-muted shrink-0" />
            </button>
          </div>
        )}
      </div>

      )}

      {publicMode && (
        <div className={`citizen-map-toolwrap ${mobileOverlayHiddenClass}`}>
          <div role="group" aria-label="เครื่องมือแผนที่" className={`citizen-map-tools hdms-map-surface ${mobileInteractiveClass}`}>
            <button type="button" className="leaflet-control-zoom-in hdms-map-control" aria-label="Zoom in" title="ซูมเข้า" onClick={onZoomIn} disabled={!mapReady}>
              <Plus size={19} aria-hidden="true" />
            </button>
            <button type="button" className="leaflet-control-zoom-out hdms-map-control" aria-label="Zoom out" title="ซูมออก" onClick={onZoomOut} disabled={!mapReady}>
              <Minus size={19} aria-hidden="true" />
            </button>
            <button type="button" className="hdms-map-control" aria-label="ตำแหน่งของฉัน" title="ตำแหน่งของฉัน" aria-busy={isLocating} onClick={locateUser} disabled={isLocating || !mapReady}>
              <LocateFixed size={19} aria-hidden="true" />
            </button>
            <button ref={citizenLayersButton} type="button" className="hdms-map-control" aria-label="เลเยอร์" title="เลเยอร์" aria-expanded={!isLayerControlCollapsed} aria-controls="citizen-map-layers"
              onClick={() => isLayerControlCollapsed ? setIsLayerControlCollapsed(false) : closeLayerControl()}>
              <Layers size={19} aria-hidden="true" />
            </button>
          </div>
          {locationStatus && <p role="status" aria-live="polite" className="citizen-map-location-status">{locationStatus}</p>}
        </div>
      )}

      {/* Quick Geolocation Control & Live Status when Legend is collapsed */}
      {isLayerControlCollapsed && !publicMode && (
        <div className={`absolute top-[3.375rem] sm:top-14 right-3 z-[400] flex flex-col items-end gap-[0.5em] pointer-events-none transition-opacity duration-150 ${mobileOverlayHiddenClass}`}>
          <button
            type="button"
            onClick={locateUser}
            disabled={isLocating || !mapReady}
            aria-label="ตำแหน่งของฉัน"
            className={`citizen-map-action hdms-map-control ${mobileInteractiveClass} inline-flex min-h-11 sm:min-h-9 items-center gap-[0.5em] rounded-lg border px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] font-semibold shadow-lg transition disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400`}
          >
            <LocateFixed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{isLocating ? "กำลังหา…" : "ตำแหน่งของฉัน"}</span>
          </button>
          {locationStatus && (
            <p role="status" aria-live="polite" className={`${mobileInteractiveClass} hdms-map-surface max-w-[13.75rem] rounded-md border px-[0.833em] py-[0.333em] text-[0.75rem]/[1.1rem] leading-snug shadow-lg-md`}>
              {locationStatus}
            </p>
          )}
        </div>
      )}

      {/* Expanded Legend Panel + Floating Highway List (outside overflow-y-auto so zero clipping & zero layout shift) */}
      {(publicMode || !isLayerControlCollapsed) && (
        <div
          ref={publicMode ? citizenLayersPanel : undefined}
          data-citizen-layers-open={publicMode ? !isLayerControlCollapsed : undefined}
          inert={publicMode && isLayerControlCollapsed ? true : undefined}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || (!legendRouteList && !publicMode)) return;
            event.stopPropagation();
            if (legendRouteList) {
              setPinnedRouteList(null);
              setLegendRouteList(null);
            } else closeLayerControl();
          }}
          className={`${publicMode ? "citizen-map-layer-wrap" : ""} absolute top-3 right-3 z-[410] flex flex-col sm:flex-row-reverse items-end sm:items-start gap-2 pointer-events-none max-w-[calc(100vw-1.5rem)]`}
        >
          <div
            id={publicMode ? "citizen-map-layers" : undefined}
            role={publicMode ? "region" : undefined}
            aria-label={publicMode ? "เลเยอร์และสัญลักษณ์แผนที่" : undefined}
            className={`citizen-legend hdms-map-surface pointer-events-auto border rounded-2xl p-[1em] sm:p-[1.167em] shadow-2xl min-w-[14.5rem] sm:min-w-[15.5rem] max-w-full text-xs ${publicMode ? "" : "animate-fade-in"} overflow-y-auto ${
              legendRouteList ? "max-h-[54dvh] sm:max-h-[85dvh]" : "max-h-[80dvh] sm:max-h-[85dvh]"
            }`}
          >
            <div className="citizen-layer-head font-heading font-bold flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="flex items-center gap-[0.5em] text-xs">
                <Layers className="w-3.5 h-3.5 hdms-guide-accent" /> {publicMode ? "เลเยอร์" : "สัญลักษณ์บนแผนที่"}
              </span>
              <div className="flex items-center gap-[0.667em]">
                <button type="button" onClick={resetCamera} className="min-h-9 sm:min-h-8 px-1.5 text-[0.75rem]/[1.1rem] hdms-map-link hover:underline cursor-pointer">
                  รีเซ็ต
                </button>
                {!publicMode && (
                <button
                  type="button"
                  onClick={locateUser}
                  disabled={isLocating || !mapReady}
                  aria-label="ตำแหน่งของฉัน"
                  className="inline-flex min-h-9 sm:min-h-8 items-center gap-[0.333em] rounded-md px-[0.5em] text-[0.75rem]/[1.1rem] font-semibold hdms-map-link disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
                >
                  <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                  {isLocating ? "กำลังหา…" : "ตำแหน่งของฉัน"}
                </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPinnedRouteList(null);
                    setLegendRouteList(null);
                    setIsLayerControlCollapsed(true);
                  }}
                  className="grid h-9 w-9 sm:h-8 sm:w-8 place-items-center hdms-map-control rounded-lg transition cursor-pointer"
                  title="ย่อแถบควบคุมเลเยอร์"
                  aria-label="ย่อแถบควบคุมเลเยอร์"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!publicMode && locationStatus && (
              <p role="status" aria-live="polite" className="mt-2 rounded-md hdms-map-subtle hdms-map-muted px-[0.667em] py-[0.5em] text-[0.75rem]/[1.1rem] leading-snug">
                {locationStatus}
              </p>
            )}

            {publicMode && <div className="citizen-basemap">
              <h3>แผนที่ฐาน</h3>
              {baseMapChooser}
            </div>}
            {publicMode && <h3 className="citizen-layer-label">แสดงบนแผนที่</h3>}
            <div className="citizen-visibility space-y-1">
              {highwayLayerItems.map((item) => {
                const isOpen = legendRouteList === item.key;
                return (
                  <div
                    key={item.key}
                    className="citizen-layer-road-row flex items-center gap-1.5"
                    onPointerEnter={(event) => {
                      if (!publicMode && event.pointerType === "mouse" && !pinnedRouteList) {
                        setLegendRouteList(item.key);
                      }
                    }}
                    onPointerLeave={(event) => {
                      if (!publicMode && event.pointerType === "mouse" && !pinnedRouteList) {
                        setLegendRouteList(null);
                      }
                    }}
                  >
                    <label className="flex flex-1 min-w-0 min-h-11 sm:min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 hdms-guide-title touch-manipulation">
                      <span className="flex items-center gap-[0.667em] min-w-0">
                        <span className="hdms-map-symbol w-4 h-1.5 inline-block rounded shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => item.onChange(e.target.checked)}
                        className={`${item.checkboxAccent} rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer`}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={item.infoLabel}
                      aria-expanded={isOpen}
                      onClick={() => {
                        const next = pinnedRouteList === item.key ? null : item.key;
                        setPinnedRouteList(next);
                        setLegendRouteList(next);
                      }}
                      onFocus={() => {
                        if (!publicMode && !pinnedRouteList) setLegendRouteList(item.key);
                      }}
                      onBlur={(event) => {
                        if (
                          !pinnedRouteList &&
                          !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)
                        ) {
                          setLegendRouteList(null);
                        }
                      }}
                      className={`citizen-layer-info hdms-map-control grid h-11 w-10 sm:h-8 sm:w-7 shrink-0 place-items-center rounded-lg border transition cursor-pointer touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        isOpen
                          ? item.activeBtnClass
                          : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                      title={item.infoLabel}
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}

              {!publicMode && secondaryDisplaySetting}

              <label className="flex min-h-11 sm:min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 hdms-guide-title touch-manipulation">
                <span className="flex items-center gap-[0.667em]">
                  <span className="hdms-map-symbol inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: floodSwatch, color: resolveVisibleArrowColor(floodSwatch) }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /><path d="M3 14c2 2 4 2 6 0s4-2 6 0 4 2 6 0" /></svg></span>
                  <span>เส้นน้ำท่วม <span data-map-tone="danger" className="ml-1 rounded-full px-[0.5em] py-[0.167em] text-[0.75rem]/[1.1rem]">{effectiveShowFloodLayer ? (systemData.floodRoutes || []).filter((item) => isFloodLineVisibleOnCurrentMap(item)).length : 0}</span></span>
                </span>
                <input
                  type="checkbox"
                  checked={effectiveShowFloodLayer}
                  onChange={(e) => setShowFloodLayer(e.target.checked)}
                  className="accent-red-500 rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer disabled:opacity-50"
                />
              </label>

              {!publicMode && floodMarkerSetting}

              <label className="flex min-h-11 sm:min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 hdms-guide-title touch-manipulation">
                <span className="flex items-center gap-[0.667em]">
                  <span className="hdms-map-symbol inline-flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: detourSwatch, color: resolveVisibleArrowColor(detourSwatch) }}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9" /><path d="m15 2 3 3-3 3" /><path d="M9 19h10" /></svg></span>
                  <span>ทางเลี่ยง <span data-map-tone="warning" className="ml-1 rounded-full px-[0.5em] py-[0.167em] text-[0.75rem]/[1.1rem]">{effectiveShowDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</span></span>
                </span>
                <input
                  type="checkbox"
                  checked={effectiveShowDetourLayer}
                  onChange={(e) => setShowDetourLayer(e.target.checked)}
                  className="accent-yellow-400 rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer disabled:opacity-50"
                />
              </label>

              <label className="flex min-h-11 sm:min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 hdms-guide-title touch-manipulation">
                <span className="flex items-center gap-[0.667em]">
                  <Building2 className="w-3.5 h-3.5 hdms-map-link inline-block shrink-0" />
                  <span>สำนักงาน/หมวดทางหลวง</span>
                </span>
                <input
                  type="checkbox"
                  checked={showOffices}
                  onChange={(e) => setShowOffices(e.target.checked)}
                  className="accent-sky-400 rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer"
                />
              </label>
              <label className="flex min-h-11 sm:min-h-10 items-center justify-between gap-[0.667em] cursor-pointer py-1.5 hdms-guide-title touch-manipulation">
                <span className="flex items-center gap-[0.667em]">
                  <span className="flex h-4 min-w-5 items-center justify-center rounded-sm border border-slate-800 bg-white px-[0.167em] text-[0.625rem] font-bold text-slate-900 shrink-0">42</span>
                  <span>หมายเลขทางหลวง</span>
                </span>
                <input type="checkbox" checked={showHighwayShields} onChange={(e) => setShowHighwayShields(e.target.checked)} className="accent-slate-400 rounded h-5 w-5 sm:h-4 sm:w-4 shrink-0 cursor-pointer" />
              </label>
            </div>

            {publicMode && (secondaryDisplaySetting || floodMarkerSetting) && (
              <details className="citizen-layer-advanced">
                <summary>ตั้งค่าเพิ่มเติม</summary>
                {secondaryDisplaySetting}
                {floodMarkerSetting}
              </details>
            )}
            {publicMode && (
              <details className="citizen-legend-explainer">
                <summary>คำอธิบายสัญลักษณ์</summary>
                <p>หมุดรูปคลื่นระบุจุดน้ำท่วม หมุดลูกศรและเส้นทางเลี่ยงระบุทางเลือก เส้นสีของทางหลวงใช้สีเดียวกับตัวอย่างในรายการด้านบน</p>
              </details>
            )}
            {!publicMode && baseMapChooser}
            {publicMode && highwayListPanel}
          </div>
          {!publicMode && highwayListPanel}
        </div>
      )}

      {previewPointPhoto && (
        <div
          role="dialog"
          data-hdms-popup="photo"
          aria-modal="true"
          aria-label={previewPointPhoto.title}
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 p-[1em]"
          onClick={() => setPreviewPointPhoto(null)}
        >
          <button
            type="button"
            aria-label="ปิดภาพทางเข้าทางเลี่ยง" data-hdms-popup-close
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
