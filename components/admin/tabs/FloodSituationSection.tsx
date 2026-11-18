"use client";

import React from "react";
import { FormSection } from "@/components/admin/ui";
import { SAFETY_MEASURES, RoadSideType } from "@/lib/constants";
import {
  AFFECTED_ROAD_PARTS,
  AffectedRoadPart,
  FloodDirectionCode,
  FloodPhotoItem,
} from "@/lib/flood-event-schema";
import { TRAFFIC_STATUS_OPTIONS } from "@/lib/traffic-presentation";
import { Camera, Trash2 } from "lucide-react";

type TrafficStatusValue = "WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";

interface FloodSituationSectionProps {
  selectedHighwayOption: { lanes?: string } | undefined;
  selectedHighwayLaneCount: number;
  isSelectedHighwayDivided: boolean;
  isDividedBothFlood: boolean;
  directionCode: FloodDirectionCode;
  setDirectionCode: (code: FloodDirectionCode) => void;
  roadSide: RoadSideType;
  setRoadSide: (side: RoadSideType) => void;
  draftCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setFreeEditTarget: (target: "FORWARD" | "REVERSE") => void;
  ensureReverseFloodGeometry: (forwardSource: [number, number][]) => void;
  affectedParts: AffectedRoadPart[];
  setAffectedParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>;
  reverseAffectedParts: AffectedRoadPart[];
  setReverseAffectedParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>;
  routeWaterLevel: number | string;
  setRouteWaterLevel: (val: number | string) => void;
  reverseRouteWaterLevel: number | string;
  setReverseRouteWaterLevel: (val: number | string) => void;
  waterLevelKnown: boolean;
  setWaterLevelKnown: (known: boolean) => void;
  reverseWaterLevelKnown: boolean;
  setReverseWaterLevelKnown: (known: boolean) => void;
  routeStatus: TrafficStatusValue;
  setRouteStatus: React.Dispatch<React.SetStateAction<TrafficStatusValue>>;
  reverseRouteStatus: TrafficStatusValue;
  setReverseRouteStatus: React.Dispatch<React.SetStateAction<TrafficStatusValue>>;
  handleWaterLevelInputChange: (rawValue: string) => void;
  handleReverseWaterLevelInputChange: (rawValue: string) => void;
  toggleAffectedPartWithAutoStatus: (
    part: AffectedRoadPart,
    currentParts: AffectedRoadPart[],
    setParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>,
    waterLevelValue: number | string,
    isKnown: boolean,
    setStatus: React.Dispatch<React.SetStateAction<TrafficStatusValue>>
  ) => void;
  useCarriagewaySnapping: boolean;
  setUseCarriagewaySnapping: (use: boolean) => void;
  startedAt: string;
  setStartedAt: (val: string) => void;
  selectedMeasure: string;
  setSelectedMeasure: (val: string) => void;
  reporterName: string;
  setReporterName: (val: string) => void;
  availableOfficeNames: string[];
  causeAndNote: string;
  setCauseAndNote: (val: string) => void;
  detailedPhotos: FloodPhotoItem[];
  setDetailedPhotos: React.Dispatch<React.SetStateAction<FloodPhotoItem[]>>;
  setFieldImages: React.Dispatch<React.SetStateAction<string[]>>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}

export function FloodSituationSection({
  selectedHighwayOption,
  selectedHighwayLaneCount,
  isSelectedHighwayDivided,
  isDividedBothFlood,
  directionCode,
  setDirectionCode,
  roadSide,
  setRoadSide,
  draftCoordinates,
  setDraftReverseCoordinates,
  setDraftReverseWaypoints,
  setFreeEditTarget,
  ensureReverseFloodGeometry,
  affectedParts,
  setAffectedParts,
  reverseAffectedParts,
  setReverseAffectedParts,
  routeWaterLevel,
  setRouteWaterLevel,
  reverseRouteWaterLevel,
  setReverseRouteWaterLevel,
  waterLevelKnown,
  setWaterLevelKnown,
  reverseWaterLevelKnown,
  setReverseWaterLevelKnown,
  routeStatus,
  setRouteStatus,
  reverseRouteStatus,
  setReverseRouteStatus,
  handleWaterLevelInputChange,
  handleReverseWaterLevelInputChange,
  toggleAffectedPartWithAutoStatus,
  useCarriagewaySnapping,
  setUseCarriagewaySnapping,
  startedAt,
  setStartedAt,
  selectedMeasure,
  setSelectedMeasure,
  reporterName,
  setReporterName,
  availableOfficeNames,
  causeAndNote,
  setCauseAndNote,
  detailedPhotos,
  setDetailedPhotos,
  setFieldImages,
  handleImageUpload,
}: FloodSituationSectionProps) {
  return (
    <FormSection step={3} title="สถานการณ์น้ำและมาตรการ" description="ทิศทาง เส้นทางที่ได้รับผลกระทบ ระดับน้ำ สถานะจราจร ๕ สถานะ วันเวลา และภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)">
      {/* Direction and Highway Carriageway Info */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="text-xs text-slate-300">ทิศทางการเดินรถของช่วงน้ำท่วมนี้</label>
            {selectedHighwayOption && (
              <span className={`text-[11px] font-heading font-semibold px-2 py-0.5 rounded-lg border ${
                isSelectedHighwayDivided
                  ? "border-sky-500/40 bg-sky-950/60 text-sky-300"
                  : "border-slate-700 bg-slate-950 text-slate-300"
              }`}>
                🛣️ {selectedHighwayOption.lanes || `${selectedHighwayLaneCount} ช่องจราจร`} · {isSelectedHighwayDivided ? "แยกคันทาง A→B / B→A" : "คันทางเดี่ยว"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setDirectionCode("A_TO_B");
                setRoadSide("LEFT");
                setDraftReverseCoordinates?.([]);
                setDraftReverseWaypoints?.([]);
                setFreeEditTarget("FORWARD");
              }}
              className={`p-2 rounded-xl border text-left transition ${directionCode === "A_TO_B" && roadSide === "LEFT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
            >
              <span className="text-xs font-heading font-bold block">🚗 ฝั่งซ้ายทาง (ขาไป A → B)</span>
              <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. เพิ่มขึ้น</span>
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
              className={`p-2 rounded-xl border text-left transition ${directionCode === "B_TO_A" && roadSide === "RIGHT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
            >
              <span className="text-xs font-heading font-bold block">🚙 ฝั่งขวาทาง (ขากลับ B → A)</span>
              <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. ลดลง</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDirectionCode("BOTH");
                setRoadSide("BOTH");
                if (isSelectedHighwayDivided) {
                  ensureReverseFloodGeometry(draftCoordinates);
                } else {
                  setDraftReverseCoordinates?.([]);
                  setDraftReverseWaypoints?.([]);
                  setFreeEditTarget("FORWARD");
                }
              }}
              className={`p-2 rounded-xl border text-left transition ${directionCode === "BOTH" && roadSide === "BOTH" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
            >
              <span className="text-xs font-heading font-bold block">↔️ ท่วมทั้งสองฝั่งจราจร</span>
              <span className="text-[10px] text-slate-400">
                {isSelectedHighwayDivided ? "แยกเส้น A→B / B→A และแยกระดับน้ำ" : "น้ำท่วมเต็มทั้งสองคันทาง"}
              </span>
            </button>
          </div>

          {roadSide === "BOTH" && (
            <p className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              isDividedBothFlood
                ? "border-sky-500/40 bg-sky-950/40 text-sky-200"
                : "border-slate-800 bg-slate-950/70 text-slate-400"
            }`}>
              {isDividedBothFlood
                ? `✓ ทางหลวง ${selectedHighwayOption?.lanes || "ตั้งแต่ ๔ ช่องจราจรขึ้นไป"}: สามารถสลับแก้ไขแนวเส้น ขาไป (A → B) / ขากลับ (B → A) ในส่วนที่ ๒ และกรอกระดับน้ำแยกฝั่งด้านล่างได้ทันที`
                : selectedHighwayOption
                  ? `ทางหลวง ${selectedHighwayOption.lanes || `${selectedHighwayLaneCount} ช่องจราจร`} (< ๔ ช่องจราจร): ใช้แนวเส้นและข้อมูลระดับน้ำร่วมกันทั้งสองฝั่ง`
                  : "เลือกหมายเลขทางหลวงจากโครงข่ายทางหลวง (ตั้งแต่ ๔ ช่องจราจรขึ้นไป) เพื่อเปิดการแก้ไขแนวเส้นและระดับน้ำแยกฝั่งขาไป–ขากลับ"}
            </p>
          )}
        </div>

        {!isDividedBothFlood && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-300 font-heading font-semibold">
                เส้นทางที่ได้รับผลกระทบ (เลือกได้หลายรายการตามสภาพจริง) *
              </label>
              <span className="text-[10px] text-amber-300 font-mono">เลือกแล้ว {affectedParts.length} ส่วน</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AFFECTED_ROAD_PARTS.map((part) => {
                const isSelected = affectedParts.includes(part.value);
                return (
                  <button
                    key={part.value}
                    type="button"
                    onClick={() =>
                      toggleAffectedPartWithAutoStatus(
                        part.value,
                        affectedParts,
                        setAffectedParts,
                        routeWaterLevel,
                        waterLevelKnown,
                        setRouteStatus
                      )
                    }
                    title={part.desc}
                    className={`px-2.5 py-1 rounded-lg text-xs font-heading font-bold border transition ${isSelected
                        ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    {part.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(directionCode === "A_TO_B" || directionCode === "B_TO_A" || isDividedBothFlood) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-sky-300">
              <input
                type="checkbox"
                checked={useCarriagewaySnapping}
                onChange={(e) => setUseCarriagewaySnapping(e.target.checked)}
                className="h-4 w-4 accent-sky-400"
              />
              <span>เกาะแนวคันทางแยกฝั่งอัตโนมัติ (สำหรับถนน 4 ช่องจราจรที่มีเกาะกลาง)</span>
            </label>
            <span className="text-[11px] text-amber-300/90">
              ⚠️ ระบบจะไม่สรุปว่าฝั่งตรงข้ามปลอดภัยอัตโนมัติหากยังไม่มีรายงานยืนยัน
            </span>
          </div>
        )}
      </div>

      {isDividedBothFlood ? (
        <div className="space-y-3">
          {[
            {
              key: "FORWARD" as const,
              heading: "🚗 ๑. ฝั่งขาไป (A → B)",
              sideHint: "ฝั่งซ้ายของทางหลวง",
              borderClass: "border-amber-500/40 bg-amber-950/20",
              headingClass: "text-amber-300",
              knownLabelClass: "text-amber-300",
              checkboxAccent: "accent-amber-400",
              parts: affectedParts,
              setParts: setAffectedParts,
              waterLevel: routeWaterLevel,
              onWaterLevelChange: handleWaterLevelInputChange,
              waterKnown: waterLevelKnown,
              setWaterKnown: setWaterLevelKnown,
              clearWaterLevel: () => setRouteWaterLevel(""),
              status: routeStatus,
              setStatus: setRouteStatus,
              levelInputId: "flood-water-level-forward",
              statusSelectId: "flood-traffic-status-forward",
              levelLabel: "ระดับน้ำขาไป (ซม.) *",
              statusLabel: "สถานะสภาพการจราจรขาไป (๕ สถานะ)",
              placeholder: "เช่น 30",
            },
            {
              key: "REVERSE" as const,
              heading: "🚙 ๒. ฝั่งขากลับ (B → A)",
              sideHint: "ฝั่งขวาของทางหลวง",
              borderClass: "border-sky-500/40 bg-sky-950/20",
              headingClass: "text-sky-300",
              knownLabelClass: "text-sky-300",
              checkboxAccent: "accent-sky-400",
              parts: reverseAffectedParts,
              setParts: setReverseAffectedParts,
              waterLevel: reverseRouteWaterLevel,
              onWaterLevelChange: handleReverseWaterLevelInputChange,
              waterKnown: reverseWaterLevelKnown,
              setWaterKnown: setReverseWaterLevelKnown,
              clearWaterLevel: () => setReverseRouteWaterLevel(""),
              status: reverseRouteStatus,
              setStatus: setReverseRouteStatus,
              levelInputId: "flood-water-level-reverse",
              statusSelectId: "flood-traffic-status-reverse",
              levelLabel: "ระดับน้ำขากลับ (ซม.) *",
              statusLabel: "สถานะสภาพการจราจรขากลับ (๕ สถานะ)",
              placeholder: "เช่น 15 (หรือระบุ 0)",
            },
          ].map((side) => (
            <div
              key={side.key}
              role="group"
              aria-label={side.key === "FORWARD" ? "ข้อมูลฝั่งขาไป A → B" : "ข้อมูลฝั่งขากลับ B → A"}
              className={`rounded-xl border ${side.borderClass} p-3 space-y-2.5`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-heading font-bold text-xs ${side.headingClass}`}>
                  {side.heading}
                </span>
                <span className="text-[10px] text-slate-400">{side.sideHint}</span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-300 font-heading font-semibold">เส้นทางที่ได้รับผลกระทบ ({side.key === "FORWARD" ? "ขาไป" : "ขากลับ"})</span>
                  <span className="text-[10px] text-amber-300 font-mono">เลือกแล้ว {side.parts.length} ส่วน</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AFFECTED_ROAD_PARTS.map((part) => {
                    const isSelected = side.parts.includes(part.value);
                    return (
                      <button
                        key={`${side.key}-${part.value}`}
                        type="button"
                        onClick={() =>
                          toggleAffectedPartWithAutoStatus(
                            part.value,
                            side.parts,
                            side.setParts,
                            side.waterLevel,
                            side.waterKnown,
                            side.setStatus
                          )
                        }
                        title={part.desc}
                        className={`px-2 py-1 rounded-lg text-[11px] font-heading font-bold border transition ${isSelected
                            ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                      >
                        {part.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor={side.levelInputId} className="text-[11px] text-slate-300">{side.levelLabel}</label>
                    <label className={`flex items-center gap-1 text-[10px] ${side.knownLabelClass} cursor-pointer`}>
                      <input
                        type="checkbox"
                        checked={!side.waterKnown}
                        onChange={(e) => {
                          const unknown = e.target.checked;
                          side.setWaterKnown(!unknown);
                          if (unknown) side.clearWaterLevel();
                        }}
                        className={`h-3 w-3 ${side.checkboxAccent}`}
                      />
                      <span>ไม่ทราบค่า</span>
                    </label>
                  </div>
                  <input
                    id={side.levelInputId}
                    type="number"
                    min={0}
                    disabled={!side.waterKnown}
                    value={side.waterLevel}
                    onChange={(e) => side.onWaterLevelChange(e.target.value)}
                    placeholder={side.waterKnown ? side.placeholder : "ยังไม่ทราบระดับน้ำ"}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor={side.statusSelectId} className="text-[11px] text-slate-300 block mb-1">{side.statusLabel}</label>
                  <select
                    id={side.statusSelectId}
                    value={side.status}
                    onChange={(e: any) => side.setStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                  >
                    {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {side.waterKnown && Number(side.waterLevel) === 0 && side.waterLevel !== "" && (
                <p className="text-[11px] text-emerald-300">
                  💡 ระดับน้ำ 0 ซม.: ระบบตั้งค่าสถานะแนะนำเป็น &quot;ผ่านได้ปกติ&quot; และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (แก้ไขสถานะด้วยตนเองได้)
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="flood-water-level-single" className="text-xs text-slate-300">ระดับน้ำท่วมผิวทาง (ซม.) *</label>
              <label className="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!waterLevelKnown}
                  onChange={(e) => {
                    const unknown = e.target.checked;
                    setWaterLevelKnown(!unknown);
                    if (unknown) setRouteWaterLevel("");
                  }}
                  className="h-3.5 w-3.5 accent-amber-400"
                />
                <span>ยังไม่ทราบค่าระดับน้ำ</span>
              </label>
            </div>
            <input
              id="flood-water-level-single"
              type="number"
              min={0}
              disabled={!waterLevelKnown}
              value={routeWaterLevel}
              onChange={(e) => handleWaterLevelInputChange(e.target.value)}
              placeholder={waterLevelKnown ? "เช่น 35 (ระบุ 0 เมื่อน้ำแห้งแต่คงประวัติ)" : "ยังไม่ทราบระดับน้ำ (รอวัดหน้างาน)"}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono disabled:opacity-50"
            />
            {waterLevelKnown && Number(routeWaterLevel) === 0 && routeWaterLevel !== "" && (
              <p className="mt-1 text-[11px] text-emerald-300">
                💡 ระดับน้ำ 0 ซม.: ระบบตั้งค่าสถานะแนะนำเป็น &quot;ผ่านได้ปกติ&quot; และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (หากถนนยังชำรุด/ปิดจราจร สามารถแก้ไขสถานะทางขวามือได้ทันที)
              </p>
            )}
          </div>
          <div>
            <label htmlFor="flood-traffic-status-single" className="text-xs text-slate-300 block mb-1">สถานะสภาพการจราจร (๕ สถานะ)</label>
            <select
              id="flood-traffic-status-single"
              value={routeStatus}
              onChange={(e: any) => setRouteStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-300 block mb-1">วันและเวลาเริ่มเกิดเหตุ</label>
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-slate-300 block mb-1">มาตรการอำนวยความปลอดภัย</label>
          <select
            value={selectedMeasure}
            onChange={(e) => setSelectedMeasure(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          >
            {SAFETY_MEASURES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-300 block mb-1">ผู้รายงาน / หมวดทางหลวง</label>
          <input
            type="text"
            list="doh-offices-datalist"
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
            placeholder="เช่น หมวดทางหลวงหนองจิก / เจ้าหน้าที่ศูนย์ฯ"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
          />
          <datalist id="doh-offices-datalist">
            {availableOfficeNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-300 block mb-1">สาเหตุ / ลักษณะน้ำท่วม / หมายเหตุเจ้าหน้าที่</label>
        <input
          type="text"
          value={causeAndNote}
          onChange={(e) => setCauseAndNote(e.target.value)}
          placeholder="เช่น ฝนตกหนักต่อเนื่อง น้ำล้นคลองชลประทาน / รถเล็กสามารถสัญจรด้วยความระมัดระวัง"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
        />
      </div>

      {/* Image Upload Gallery (Max 5 photos, <= 300 KB each) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-slate-300">
            ภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)
          </label>
          <span className="text-[11px] text-amber-300 font-mono">
            {detailedPhotos.length} / 5 ภาพ
          </span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className={`bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-xs text-amber-300 ${detailedPhotos.length >= 5 ? "opacity-50 pointer-events-none" : ""}`}>
            <Camera className="w-4 h-4" />
            <span>{detailedPhotos.length >= 5 ? "ครบ ๕ ภาพแล้ว" : "เลือกรูปภาพจากเครื่อง / มือถือ"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={detailedPhotos.length >= 5}
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>

        {detailedPhotos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            {detailedPhotos.map((photo, i) => (
              <div key={photo.id || i} className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between">
                <div className="h-20 w-full overflow-hidden rounded bg-slate-900">
                  <img src={photo.dataUrl} className="w-full h-full object-cover" alt={`field-${i + 1}`} />
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  <span>{i === 0 ? "ภาพหลัก" : `ภาพที่ ${i + 1}`}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextPhotos = detailedPhotos.filter((_, idx) => idx !== i);
                    setDetailedPhotos(nextPhotos);
                    setFieldImages(nextPhotos.map((p) => p.dataUrl));
                  }}
                  className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded p-1 text-[10px] leading-none shadow"
                  title="ลบรูปภาพนี้"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  );
}
