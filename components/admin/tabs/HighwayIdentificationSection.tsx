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
} from "lucide-react";
import { DETOUR_DIRECTION_MODES, DetourDirectionModeType, RoadSideType } from "@/lib/constants";
import { FloodDirectionCode, groupFloodRoutesIntoEvents, generateNextEventCode, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import { getAvailableHighwayRoutes, parseKmPostMeters } from "@/lib/highway-schema";

export type FloodParentEvent = ReturnType<typeof groupFloodRoutesIntoEvents>[number];
export type HighwayOption = ReturnType<typeof getAvailableHighwayRoutes>[number];

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
  directionCode: FloodDirectionCode;
  setDirectionCode: (code: FloodDirectionCode) => void;
  roadSide: RoadSideType;
  setRoadSide: (side: RoadSideType) => void;
  isSelectedHighwayDivided: boolean;
  ensureReverseFloodGeometry: () => void;
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
  directionCode,
  setDirectionCode,
  roadSide,
  setRoadSide,
  isSelectedHighwayDivided,
  ensureReverseFloodGeometry,
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
                className={`min-h-10 px-3 py-2 rounded font-heading font-bold transition ${parentEventMode === "NEW" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                + สร้างเหตุการณ์ใหม่
              </button>
              <button
                type="button"
                disabled={existingParentEvents.length === 0}
                onClick={() => setParentEventMode("EXISTING")}
                className={`min-h-10 px-3 py-2 rounded font-heading font-bold transition disabled:opacity-40 ${parentEventMode === "EXISTING" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
              >
                ผูกเหตุการณ์เดิม ({existingParentEvents.length})
              </button>
            </div>
          </div>

          {parentEventMode === "EXISTING" && existingParentEvents.length > 0 && (
            <div>
              <label htmlFor="flood-parent-event-select" className="text-xs text-slate-300 block mb-1">เลือกเหตุการณ์หลักที่ต้องการเพิ่มช่วง กม. ย่อย</label>
              <select
                id="flood-parent-event-select"
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="flood-village-landmark-input" className="text-xs font-medium text-slate-200">จุดสังเกตหน้างาน / หมู่บ้าน / ตำบล–อำเภอ</label>
              <button
                type="button"
                onClick={async () => {
                  await handleFetchLocationFromCoords();
                  if (startLon && startLat) {
                    await handleAutoGeocode(Number(startLon), Number(startLat), "START");
                    if (endLon && endLat) await handleAutoGeocode(Number(endLon), Number(endLat), "END");
                  }
                }}
                disabled={isFetchingAddress || isGeocoding}
                className="min-h-10 text-[11px] text-sky-300 hover:text-sky-200 bg-sky-950/60 border border-sky-800/80 px-3 py-2 rounded-lg flex items-center gap-1.5 font-heading cursor-pointer disabled:opacity-50 transition"
                title="ดึงชื่อหมู่บ้าน ตำบล และอำเภอจากพิกัดจุดเริ่มต้น"
              >
                {isFetchingAddress || isGeocoding ? <RotateCw className="w-3 h-3 animate-spin" aria-hidden="true" /> : <MapPin className="w-3 h-3" aria-hidden="true" />}
                <span>{isFetchingAddress || isGeocoding ? "กำลังดึงพิกัด..." : "📍 ดึงตำแหน่ง-ตำบล/อำเภอจากพิกัด"}</span>
              </button>
            </div>
            <input
              id="flood-village-landmark-input"
              type="text"
              value={villageOrLandmark}
              onChange={(e) => setVillageOrLandmark(e.target.value)}
              placeholder="เช่น หน้า รร.บ้านดอนยาง ม.2 ต.ดอนยาง อ.หนองจิก"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        </div>
      )}

      {routeMode === "FLOOD" ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative" ref={highwayComboboxRef}>
              <label htmlFor="highway-route-select-fallback" className="text-xs text-slate-300">หมายเลขทางหลวง *</label>
              <button
                type="button"
                aria-expanded={isHighwayDropdownOpen}
                aria-haspopup="listbox"
                aria-label="หมายเลขทางหลวง"
                className="relative mt-1 flex min-h-[2.5rem] w-full cursor-pointer items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-white hover:border-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                onClick={() => setIsHighwayDropdownOpen((prev) => !prev)}
              >
                <span className={`truncate ${!routeNo ? "text-slate-400" : "font-semibold text-amber-300"}`}>
                  {selectedHighwayName || (routeNo ? (availableHighways.find((h) => h.no === routeNo)?.name || `ทล.${routeNo}`) : "-- เลือกหมายเลขทางหลวง --")}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
              </button>

              {/* Hidden select to preserve standard form/accessible value if queried */}
              <select
                id="highway-route-select-fallback"
                aria-label="หมายเลขทางหลวง"
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
              <label htmlFor="flood-km-start" className="text-xs text-slate-300">กม. เริ่มต้น</label>
              <input
                id="flood-km-start"
                type="text"
                value={kmStart}
                onChange={(e) => setKmStart(e.target.value)}
                placeholder="เช่น 12+500"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="flood-km-end" className="text-xs text-slate-300">กม. สิ้นสุด</label>
              <input
                id="flood-km-end"
                type="text"
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="เช่น 14+200"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          {(() => {
            const mStart = parseKmPostMeters(kmStart);
            const mEnd = parseKmPostMeters(kmEnd);
            const spanKm = mStart !== null && mEnd !== null ? Math.abs(mEnd - mStart) / 1000 : 0;
            if (spanKm < 5) return null;
            return (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                <span>⚠️ ช่วง กม. นี้ยาว {spanKm.toFixed(1)} กม. (อาจเป็นช่วงเต็มตอนควบคุม) — แนะนำแก้ให้ตรงจุดน้ำท่วมจริงก่อนกดตัดเส้น</span>
                <button
                  type="button"
                  onClick={() => {
                    setKmStart("");
                    setKmEnd("");
                  }}
                  className="shrink-0 rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-slate-800 cursor-pointer"
                >
                  ล้าง กม.
                </button>
              </div>
            );
          })()}

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2" role="group" aria-label="เลือกฝั่งถนนเบื้องต้น">
            <span className="text-[11px] font-heading font-semibold text-slate-300">ฝั่งถนน/ทิศทาง:</span>
            <button
              type="button"
              onClick={() => {
                setDirectionCode("A_TO_B");
                setRoadSide("LEFT");
                setDraftReverseCoordinates?.([]);
                setDraftReverseWaypoints?.([]);
                setFreeEditTarget("FORWARD");
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-[11px] font-heading font-bold border transition cursor-pointer ${directionCode === "A_TO_B" && roadSide === "LEFT" ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"}`}
            >
              ขาไป A→B
            </button>
            <button
              type="button"
              onClick={() => {
                setDirectionCode("B_TO_A");
                setRoadSide("RIGHT");
                setDraftReverseCoordinates?.([]);
                setDraftReverseWaypoints?.([]);
                setFreeEditTarget("FORWARD");
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-[11px] font-heading font-bold border transition cursor-pointer ${directionCode === "B_TO_A" && roadSide === "RIGHT" ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"}`}
            >
              ขากลับ B→A
            </button>
            <button
              type="button"
              onClick={() => {
                setDirectionCode("BOTH");
                setRoadSide("BOTH");
                if (isSelectedHighwayDivided) ensureReverseFloodGeometry();
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-[11px] font-heading font-bold border transition cursor-pointer ${directionCode === "BOTH" && roadSide === "BOTH" ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"}`}
            >
              ทั้ง ๒ ฝั่ง A⇄B
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSlicePolylineFromKm}
              className="min-h-10 text-[11px] bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-700 px-3 py-2 rounded-xl font-heading font-semibold flex items-center gap-1.5 transition"
              title="คำนวณแนวเส้นและพิกัดเริ่มต้น-สิ้นสุดจากข้อมูล GIS ทางหลวงอัตโนมัติ"
            >
              <Wand2 className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" /> คำนวณแนวเส้นจากช่วง กม. อัตโนมัติ (Linear Referencing)
            </button>
            <span className="text-[10px] text-slate-400">ระบบจะตัดเฉพาะช่วงเส้นทางหลวงตาม กม. เริ่มต้น–สิ้นสุด</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="detour-ref-flood-select" className="text-xs text-slate-300">ผูกกับจุดน้ำท่วมอ้างอิง</label>
              <select
                id="detour-ref-flood-select"
                value={detourRefId}
                onChange={(e) => setDetourRefId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">ไม่ผูกกับจุดน้ำท่วม</option>
                {floodRoutes.map((f) => {
                  const meta = parseFloodDirectionMeta(f.direction_meta, f);
                  const dirTag =
                    meta.directionCode === "A_TO_B"
                      ? "ขาไป A→B"
                      : meta.directionCode === "B_TO_A"
                        ? "ขากลับ B→A"
                        : meta.directionCode === "BOTH"
                          ? "ทั้ง ๒ ฝั่ง"
                          : "ไม่ระบุทิศ";
                  return (
                    <option key={f.id} value={f.id}>
                      ทล.{f.route_no} กม.{f.km_start}–{f.km_end} ({dirTag}) · {f.section_name}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label htmlFor="detour-route-name-input" className="text-xs text-slate-300">ชื่อเส้นทางเลี่ยง *</label>
              <input
                id="detour-route-name-input"
                type="text"
                value={detourName}
                onChange={(e) => setDetourName(e.target.value)}
                placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
          <div role="group" aria-label="ทิศทางการเดินรถของทางเลี่ยง (A-B / B-A)">
            <span className="text-xs text-slate-300 block mb-1">ทิศทางการเดินรถของทางเลี่ยง (A-B / B-A)</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {DETOUR_DIRECTION_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={detourDirectionMode === mode.value}
                  onClick={() => setDetourDirectionMode(mode.value)}
                  className={`min-h-10 p-2.5 rounded-xl border text-left transition ${detourDirectionMode === mode.value
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

      {/* Highway Section Name (Distinct from Landmark/Subdistrict) */}
      {routeMode === "FLOOD" && (
        <div>
          <label htmlFor="flood-section-name-input" className="text-xs font-medium text-slate-200 block mb-1">ชื่อตอนสายทางหลวง (ตามบัญชีทางหลวง) *</label>
          <input
            id="flood-section-name-input"
            type="text"
            value={sectionName}
            onChange={(e) => { sectionNameManuallyEditedRef.current = true; setSectionName(e.target.value); }}
            placeholder="เช่น ตอน ดอนยาง - บ้านดี (ระบบเติมให้อัตโนมัติเมื่อเลือกสายทาง)"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>
      )}
    </FormSection>
  );
}
