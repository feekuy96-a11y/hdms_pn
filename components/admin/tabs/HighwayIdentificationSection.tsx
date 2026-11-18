"use client";

import React from "react";
import { FormSection } from "@/components/admin/ui";
import { SystemDataPayload } from "@/db/default-data";
import {
  Wand2,
  Search,
  ChevronDown,
  X,
  Layers,
  MapPin,
  RotateCw,
  Navigation,
} from "lucide-react";
import { DETOUR_DIRECTION_MODES, DetourDirectionModeType, RoadSideType } from "@/lib/constants";
import { FloodParentEvent, generateNextEventCode } from "@/lib/flood-event-schema";
import { HighwayOption } from "@/lib/highway-schema";

export interface HighwayIdentificationSectionProps {
  routeMode: "FLOOD" | "DETOUR";
  parentEventMode: "NEW" | "EXISTING";
  setParentEventMode: (mode: "NEW" | "EXISTING") => void;
  selectedParentEventId: string;
  setSelectedParentEventId: (id: string) => void;
  eventCode: string;
  setEventCode: (code: string) => void;
  setEventTitle: (title: string) => void;
  existingParentEvents: FloodParentEvent[];
  routeNo: string;
  setRouteNo: (no: string) => void;
  selectedHighwayName: string;
  setSelectedHighwayName: (name: string) => void;
  sectionName: string;
  setSectionName: (name: string) => void;
  sectionNameManuallyEditedRef: React.MutableRefObject<boolean>;
  villageOrLandmark: string;
  setVillageOrLandmark: (val: string) => void;
  setReporterName: (name: string) => void;
  handleFetchLocationFromCoords: () => Promise<void>;
  isFetchingAddress: boolean;
  highwayComboboxRef: React.RefObject<HTMLDivElement | null>;
  isHighwayDropdownOpen: boolean;
  setIsHighwayDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  availableHighways: HighwayOption[];
  highwaySearchQuery: string;
  setHighwaySearchQuery: (q: string) => void;
  kmStart: string;
  setKmStart: (km: string) => void;
  kmEnd: string;
  setKmEnd: (km: string) => void;
  roadSide: RoadSideType;
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  setDraftReverseWaypoints?: (pts: [number, number][]) => void;
  setFreeEditTarget: (target: "FORWARD" | "REVERSE") => void;
  routeEditId: string;
  handleSlicePolylineFromKm: () => void;
  detourRefId: string;
  setDetourRefId: (id: string) => void;
  floodRoutes: SystemDataPayload["floodRoutes"];
  detourName: string;
  setDetourName: (name: string) => void;
  detourDirectionMode: DetourDirectionModeType;
  setDetourDirectionMode: (mode: DetourDirectionModeType) => void;
  isGeocoding: boolean;
  startLon: number | string;
  startLat: number | string;
  endLon: number | string;
  endLat: number | string;
  handleAutoGeocode: (lon: number, lat: number, target: "START" | "END") => Promise<void>;
}

export function HighwayIdentificationSection({
  routeMode,
  parentEventMode,
  setParentEventMode,
  selectedParentEventId,
  setSelectedParentEventId,
  eventCode,
  setEventCode,
  setEventTitle,
  existingParentEvents,
  routeNo,
  setRouteNo,
  selectedHighwayName,
  setSelectedHighwayName,
  sectionName,
  setSectionName,
  sectionNameManuallyEditedRef,
  villageOrLandmark,
  setVillageOrLandmark,
  setReporterName,
  handleFetchLocationFromCoords,
  isFetchingAddress,
  highwayComboboxRef,
  isHighwayDropdownOpen,
  setIsHighwayDropdownOpen,
  availableHighways,
  highwaySearchQuery,
  setHighwaySearchQuery,
  kmStart,
  setKmStart,
  kmEnd,
  setKmEnd,
  roadSide,
  setDraftReverseCoordinates,
  setDraftReverseWaypoints,
  setFreeEditTarget,
  routeEditId,
  handleSlicePolylineFromKm,
  detourRefId,
  setDetourRefId,
  floodRoutes,
  detourName,
  setDetourName,
  detourDirectionMode,
  setDetourDirectionMode,
  isGeocoding,
  startLon,
  startLat,
  endLon,
  endLat,
  handleAutoGeocode,
}: HighwayIdentificationSectionProps) {
  return (
    <FormSection step={1} title="ข้อมูลสายทางและพื้นที่" description="ระบุทางหลวง ช่วง กม. และบริเวณที่เกิดเหตุ">
      {routeMode === "FLOOD" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 mb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> การจัดกลุ่มเหตุการณ์หลัก (Parent Event)
            </span>
            <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => { setParentEventMode("NEW"); setSelectedParentEventId(""); setEventCode(""); }}
                className={`px-2.5 py-1 rounded font-heading font-bold transition ${parentEventMode === "NEW" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                + สร้างเหตุการณ์ใหม่
              </button>
              <button
                type="button"
                disabled={existingParentEvents.length === 0}
                onClick={() => setParentEventMode("EXISTING")}
                className={`px-2.5 py-1 rounded font-heading font-bold transition disabled:opacity-40 ${parentEventMode === "EXISTING" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                ผูกเหตุการณ์เดิม ({existingParentEvents.length})
              </button>
            </div>
          </div>

          {parentEventMode === "EXISTING" && existingParentEvents.length > 0 && (
            <div>
              <label className="text-xs text-slate-300 block mb-1">เลือกเหตุการณ์หลักที่ต้องการเพิ่มช่วง กม. ย่อย</label>
              <select
                value={selectedParentEventId}
                onChange={(e) => {
                  const evId = e.target.value;
                  setSelectedParentEventId(evId);
                  const ev = existingParentEvents.find((item) => item.eventId === evId);
                  if (ev) {
                    setRouteNo(ev.routeNo);
                    setSelectedHighwayName(`ทล.${ev.routeNo} - ${ev.sectionName}`);
                    setSectionName(ev.sectionName);
                    setEventCode(ev.eventCode);
                    setEventTitle(ev.eventTitle);
                    if (ev.villageOrLandmark) setVillageOrLandmark(ev.villageOrLandmark);
                    if (ev.subdivisionName) setReporterName(ev.subdivisionName);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-semibold"
              >
                <option value="">-- เลือกเหตุการณ์หลัก --</option>
                {existingParentEvents.map((ev) => (
                  <option key={ev.eventId} value={ev.eventId}>
                    ทล.{ev.routeNo} ตอน{ev.sectionName} ({ev.segments.length} ช่วงย่อย)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-300">หมู่บ้าน / จุดสังเกตหน้างาน</label>
              <button
                type="button"
                onClick={handleFetchLocationFromCoords}
                disabled={isFetchingAddress}
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-heading cursor-pointer disabled:opacity-50"
                title="ดึงชื่อหมู่บ้านและตำบลจากพิกัด"
              >
                {isFetchingAddress ? <RotateCw className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                <span>{isFetchingAddress ? "กำลังดึง..." : "📍 ดึงจากพิกัด"}</span>
              </button>
            </div>
            <input
              type="text"
              value={villageOrLandmark}
              onChange={(e) => setVillageOrLandmark(e.target.value)}
              placeholder="เช่น บ.ดอนยาง ม.2 ต.ดอนยาง อ.หนองจิก"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        </div>
      )}

      {routeMode === "FLOOD" ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative" ref={highwayComboboxRef}>
              <label className="text-xs text-slate-300">หมายเลขทางหลวง *</label>
              <button
                type="button"
                aria-expanded={isHighwayDropdownOpen}
                aria-haspopup="listbox"
                aria-label="หมายเลขทางหลวง"
                className="relative mt-1 flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-white hover:border-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                onClick={() => setIsHighwayDropdownOpen((prev) => !prev)}
              >
                <span className={`truncate ${!routeNo ? "text-slate-400" : "font-semibold text-amber-300"}`}>
                  {selectedHighwayName || (routeNo ? (availableHighways.find((h) => h.no === routeNo)?.name || `ทล.${routeNo}`) : "-- เลือกหมายเลขทางหลวง --")}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
              </button>

              {/* Hidden select to preserve standard form/accessible value if queried */}
              <select
                value={routeNo}
                onChange={(e) => setRouteNo(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              >
                {!routeNo && <option value="">-- เลือกหมายเลขทางหลวง --</option>}
                {availableHighways.map((h) => (
                  <option key={`${h.no}_${h.name}`} value={h.no}>
                    {h.name}
                  </option>
                ))}
              </select>

              {/* Smart Search Filterable Dropdown */}
              {isHighwayDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full sm:min-w-[320px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl backdrop-blur-md flex flex-col">
                  <div className="p-2 border-b border-slate-800 bg-slate-900/90 flex items-center gap-2">
                    <Search className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      value={highwaySearchQuery}
                      onChange={(e) => setHighwaySearchQuery(e.target.value)}
                      placeholder="พิมพ์ค้นหาเลขทางหลวง หรือชื่อตอน..."
                      className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {highwaySearchQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHighwaySearchQuery("");
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div
                    role="listbox"
                    aria-label="รายการทางหลวง"
                    className="overflow-y-auto max-h-52 divide-y divide-slate-850"
                  >
                    {(() => {
                      const query = highwaySearchQuery.trim().toLowerCase();
                      const filtered = availableHighways.filter(
                        (h) => h.no.toLowerCase().includes(query) || h.name.toLowerCase().includes(query)
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-500">
                            {availableHighways.length === 0
                              ? "ไม่พบข้อมูลสายทางหลวงในฐานข้อมูลโครงข่ายทางหลวง"
                              : `ไม่พบสายทางหลวงที่ตรงกับ "${highwaySearchQuery}"`}
                          </div>
                        );
                      }
                      return filtered.map((h) => (
                        <div
                          key={`${h.no}_${h.name}_${h.kmStart || ""}`}
                          onClick={() => {
                            setRouteNo(h.no);
                            setSelectedHighwayName(h.name);
                            if (h.sectionName) {
                              setSectionName(h.sectionName);
                              sectionNameManuallyEditedRef.current = true;
                            }
                            if (h.kmStart) {
                              setKmStart(h.kmStart);
                            }
                            if (h.kmEnd) {
                              setKmEnd(h.kmEnd);
                            }
                            if (routeMode === "FLOOD" && roadSide === "BOTH" && !(h.laneCount >= 4 || h.hasDualCarriageway)) {
                              setDraftReverseCoordinates?.([]);
                              setDraftReverseWaypoints?.([]);
                              setFreeEditTarget("FORWARD");
                            }
                            if (!routeEditId && (!eventCode || eventCode.startsWith("FL-"))) {
                              setEventCode(generateNextEventCode(h.no, existingParentEvents));
                            }
                            setIsHighwayDropdownOpen(false);
                            setHighwaySearchQuery("");
                          }}
                          className={`cursor-pointer px-3 py-2 text-xs transition hover:bg-slate-800/80 flex items-center justify-between ${routeNo === h.no && selectedHighwayName === h.name ? "bg-amber-500/15 text-amber-300 font-semibold" : "text-slate-200"
                            }`}
                        >
                          <span className="truncate">{h.name}</span>
                          {h.kmStart && h.kmEnd && (
                            <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
                              {h.kmStart} - {h.kmEnd}
                            </span>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-300">กม. เริ่มต้น</label>
              <input
                type="text"
                value={kmStart}
                onChange={(e) => setKmStart(e.target.value)}
                placeholder="เช่น 12+500"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">กม. สิ้นสุด</label>
              <input
                type="text"
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="เช่น 14+200"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSlicePolylineFromKm}
              className="text-[11px] bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-700 px-3 py-1.5 rounded-xl font-heading font-semibold flex items-center gap-1.5 transition"
              title="คำนวณแนวเส้นและพิกัดเริ่มต้น-สิ้นสุดจากข้อมูล GIS ทางหลวงอัตโนมัติ"
            >
              <Wand2 className="w-3.5 h-3.5 text-sky-400" /> คำนวณแนวเส้นจากช่วง กม. อัตโนมัติ (Linear Referencing)
            </button>
            <span className="text-[10px] text-slate-400">ระบบจะตัดเฉพาะช่วงเส้นทางหลวงตาม กม. เริ่มต้น–สิ้นสุด</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">ผูกกับจุดน้ำท่วมอ้างอิง</label>
              <select
                value={detourRefId}
                onChange={(e) => setDetourRefId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">ไม่ผูกกับจุดน้ำท่วม</option>
                {floodRoutes.map((f) => (
                  <option key={f.id} value={f.id}>
                    ทล.{f.route_no} - {f.section_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300">ชื่อเส้นทางเลี่ยง *</label>
              <input
                type="text"
                value={detourName}
                onChange={(e) => setDetourName(e.target.value)}
                placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-300 block mb-1">ทิศทางการเดินรถของทางเลี่ยง (A-B / B-A)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DETOUR_DIRECTION_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setDetourDirectionMode(mode.value)}
                  className={`p-2.5 rounded-xl border text-left transition ${detourDirectionMode === mode.value
                    ? "border-amber-400 bg-amber-500/15 text-amber-200"
                    : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700"
                    }`}
                >
                  <p className="text-xs font-heading font-bold">{mode.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{mode.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section Name & Auto-Geocoding Button */}
      {routeMode === "FLOOD" && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-300">ชื่อตอนควบคุม / บริเวณพื้นที่ *</label>
            <button
              type="button"
              disabled={isGeocoding}
              onClick={async () => {
                await handleAutoGeocode(Number(startLon), Number(startLat), "START");
                if (endLon && endLat) await handleAutoGeocode(Number(endLon), Number(endLat), "END");
              }}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-lg font-heading transition"
            >
              <Navigation className="w-3 h-3" />
              {isGeocoding ? "กำลังระบุพื้นที่..." : "ดึงตำบล/อำเภออัตโนมัติ"}
            </button>
          </div>
          <input
            type="text"
            value={sectionName}
            onChange={(e) => { sectionNameManuallyEditedRef.current = true; setSectionName(e.target.value); }}
            placeholder="เช่น ตอน ดอนยาง - บานา (ต.ดอนยาง อ.หนองจิก)"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
      )}
    </FormSection>
  );
}
