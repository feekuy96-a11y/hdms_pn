"use client";

import React from "react";
import { FormSection } from "@/components/admin/ui";
import { ThaiIncidentDateTimePicker } from "@/components/admin/ThaiIncidentDateTimePicker";
import { SAFETY_MEASURES, RoadSideType } from "@/lib/constants";
import {
  AFFECTED_ROAD_PARTS,
  floodImpactSummaryLabel,
  hasFloodImpactPart,
  mirrorFloodImpactForReverse,
  AffectedRoadPart,
  FloodDirectionCode,
  FloodPhotoItem,
} from "@/lib/flood-event-schema";
import {
  TRAFFIC_STATUS_OPTIONS,
} from "@/lib/traffic-presentation";
import { FloodSaveError, type FloodSaveValidation } from "./flood-save-validation";
import { Camera, Trash2 } from "lucide-react";

type TrafficStatusValue = "WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";

interface FloodSituationSectionProps {
  isDividedBothFlood: boolean;
  roadSide: RoadSideType;
  directionCode: FloodDirectionCode;
  validation?: FloodSaveValidation | null;
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
  isDividedBothFlood, roadSide, directionCode, validation,
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
  const isSpecific = (part: AffectedRoadPart) => part !== "UNSPECIFIED" && part !== "PENDING_VERIFICATION";
  const partControls = (
    list: AffectedRoadPart[],
    setParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>,
    level: number | string,
    known: boolean,
    setStatus: React.Dispatch<React.SetStateAction<TrafficStatusValue>>,
    sideName: string,
  ) => {
    const specific = list.filter(isSpecific);
    const isLane = (part: AffectedRoadPart) => part === "ALL_LANES" || part.endsWith("_LANE");
    const isShoulder = (part: AffectedRoadPart) => part.endsWith("_SHOULDER");
    const main = AFFECTED_ROAD_PARTS.filter(({ value }) => isLane(value));
    const shoulder = AFFECTED_ROAD_PARTS.filter(({ value }) => isShoulder(value));
    const frontage = AFFECTED_ROAD_PARTS.filter(({ value }) => value.endsWith("_FRONTAGE"));
    const describe = (values: AffectedRoadPart[]) => values.map(floodImpactSummaryLabel).filter(Boolean).join(" · ");
    const mainText = describe(specific.filter(isLane));
    const shoulderText = describe(specific.filter(isShoulder));
    const frontageText = describe(specific.filter((part) => part.endsWith("_FRONTAGE")));
    const summary = [mainText, shoulderText, frontageText].filter(Boolean).join(" / ");
    const buttons = (options: typeof AFFECTED_ROAD_PARTS) => options.map((part) => {
      const selected = part.value === "UNSPECIFIED" ? specific.length === 0 : hasFloodImpactPart(list, part.value);
      return <button type="button" key={part.value} aria-pressed={selected} onClick={() => toggleAffectedPartWithAutoStatus(part.value, list, setParts, level, known, setStatus)}
        title={part.desc} className={`min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${selected ? "border-amber-400 bg-amber-500 text-slate-950" : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"}`}>
        {part.label}
      </button>;
    });
    return <div className="space-y-2" role="group" aria-label={`ส่วนที่ได้รับผลกระทบ ${sideName}`}>
      <p className="text-xs font-semibold text-slate-200">ส่วนที่ได้รับผลกระทบ</p>
      <div className="space-y-1">
        <p className="text-xs text-slate-300">คันทางหลัก · เลือกช่องจราจร</p>
        <div className="flex flex-wrap gap-1.5">{buttons(main)}</div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-300">ไหล่ทาง · เลือกตามตำแหน่งที่พบ</p>
        <div className="flex flex-wrap gap-1.5">{buttons(shoulder)}</div>
        <p className="text-xs text-slate-400">การเลือกไหล่ทางไม่เลื่อนเส้นบนแผนที่ หากอยู่ริมทางคู่ขนาน ให้ใช้แนวเส้นที่ตรวจแล้วในขั้นที่ ๒</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-300">ทางคู่ขนาน · เลือกฝั่งที่ได้รับผลกระทบ</p>
        <div className="flex flex-wrap gap-1.5">{buttons(frontage)}</div>
      </div>
      <p className="text-xs text-slate-400">เลือกไหล่ทางและทางคู่ขนานฝั่งเดียวกัน เมื่อต้องการระบุไหล่ทางของทางคู่ขนาน</p>
      <div className="flex flex-wrap gap-1.5">{buttons(AFFECTED_ROAD_PARTS.filter(({ value }) => value === "UNSPECIFIED"))}</div>
      <p role="status" className="rounded-lg bg-slate-950 px-2.5 py-2 text-xs text-slate-200">
        <strong>{sideName}:</strong> {summary ? `น้ำท่วมบริเวณ${summary}` : "ยังไม่ระบุส่วนที่ได้รับผลกระทบ"}
      </p>
    </div>;
  };

  const sideName = roadSide === "LEFT" ? "ฝั่งซ้ายทาง" : roadSide === "RIGHT" ? "ฝั่งขวาทาง" : roadSide === "BOTH" ? "ทั้งสองฝั่ง" : "ยังไม่ได้เลือกฝั่ง";

  return (
    <FormSection step={3} title="สถานการณ์น้ำและมาตรการ" description="ระบุส่วนที่ได้รับผลกระทบ ระดับน้ำ และข้อมูลจากหน้างาน">
      <h4 className="text-sm font-bold text-white">ผลกระทบต่อการเดินทาง</h4>
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <p className="text-xs text-slate-300">ฝั่งถนน: <strong>{sideName}</strong> · เปลี่ยนฝั่งได้ในขั้นที่ ๑</p>
        {!isDividedBothFlood && partControls(affectedParts, setAffectedParts, routeWaterLevel, waterLevelKnown, setRouteStatus, sideName)}
        {roadSide === "BOTH" && !isDividedBothFlood && (
          <p className="text-xs text-slate-300">หากใช้แนวเส้นร่วมกัน ระบบบันทึกผลกระทบและระดับน้ำร่วมกันทั้งสองฝั่ง</p>
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
              levelInputId: "flood-water-level-forward" as const,
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
              levelInputId: "flood-water-level-reverse" as const,
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
              {partControls(side.parts, side.setParts, side.waterLevel, side.waterKnown, side.setStatus, side.key === "FORWARD" ? "ฝั่งซ้ายทาง (A → B)" : "ฝั่งขวาทาง (B → A)")}
              {side.key === "REVERSE" && (
                <button type="button" className="min-h-11 rounded-lg border border-slate-600 px-3 text-xs text-sky-200 hover:border-sky-400"
                  onClick={() => setReverseAffectedParts(affectedParts.some(isSpecific) ? mirrorFloodImpactForReverse(affectedParts.filter(isSpecific)) : ["UNSPECIFIED"])}>
                  ใช้ส่วนที่ได้รับผลกระทบเหมือนขาไป (สลับฝั่งไหล่ทางและทางขนาน)
                </button>
              )}
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
                    aria-required={side.waterKnown}
                    aria-invalid={validation?.target === side.levelInputId ? true : undefined}
                    aria-describedby={validation?.target === side.levelInputId ? "flood-save-validation-message" : undefined}
                    type="number"
                    min={0}
                    disabled={!side.waterKnown}
                    value={side.waterLevel}
                    onChange={(e) => side.onWaterLevelChange(e.target.value)}
                    placeholder={side.waterKnown ? side.placeholder : "ยังไม่ทราบระดับน้ำ"}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono disabled:opacity-50"
                  />
                  <FloodSaveError validation={validation} target={side.levelInputId} />
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
              aria-required={waterLevelKnown}
              aria-invalid={validation?.target === "flood-water-level-single" ? true : undefined}
              aria-describedby={validation?.target === "flood-water-level-single" ? "flood-save-validation-message" : undefined}
              type="number"
              min={0}
              disabled={!waterLevelKnown}
              value={routeWaterLevel}
              onChange={(e) => handleWaterLevelInputChange(e.target.value)}
              placeholder={waterLevelKnown ? "เช่น 35 (ระบุ 0 เมื่อน้ำแห้งแต่คงประวัติ)" : "ยังไม่ทราบระดับน้ำ (รอวัดหน้างาน)"}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono disabled:opacity-50"
            />
            <FloodSaveError validation={validation} target="flood-water-level-single" />
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

      <h4 className="border-t border-surface pt-3 text-sm font-bold text-white">เวลา ผู้รายงาน และมาตรการ</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label id="flood-started-at-input-label" htmlFor="flood-started-at-input" className="text-xs text-slate-300 block mb-1">วันและเวลาเริ่มเกิดเหตุ</label>
          <ThaiIncidentDateTimePicker id="flood-started-at-input" value={startedAt} onChange={setStartedAt} />
        </div>
        <div>
          <label htmlFor="flood-safety-measure-select" className="text-xs text-slate-300 block mb-1">มาตรการอำนวยความปลอดภัย</label>
          <select
            id="flood-safety-measure-select"
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
          <label htmlFor="flood-reporter-name-input" className="text-xs text-slate-300 block mb-1">ผู้รายงาน / หมวดทางหลวง</label>
          <input
            id="flood-reporter-name-input"
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
        <label htmlFor="flood-cause-note-input" className="text-xs text-slate-300 block mb-1">สาเหตุ / ลักษณะน้ำท่วม / หมายเหตุเจ้าหน้าที่</label>
        <input
          id="flood-cause-note-input"
          type="text"
          value={causeAndNote}
          onChange={(e) => setCauseAndNote(e.target.value)}
          placeholder="เช่น ฝนตกหนักต่อเนื่อง น้ำล้นคลองชลประทาน / รถเล็กสามารถสัญจรด้วยความระมัดระวัง"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
        />
      </div>

      {/* Image Upload Gallery (Max 5 photos, <= 300 KB each) */}
      <div className="border-t border-surface pt-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-bold text-white">ภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)</h4>
          <span className="text-[11px] text-amber-300 font-mono">
            {detailedPhotos.length} / 5 ภาพ
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-1.5">
          รองรับไฟล์ .jpg, .png (ระบบบีบอัดขนาดอัตโนมัติไม่เกิน 300 KB ต่อภาพ)
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className={`min-h-10 bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-xs text-amber-300 ${detailedPhotos.length >= 5 ? "opacity-50 pointer-events-none" : ""}`}>
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>{detailedPhotos.length >= 5 ? "ครบ ๕ ภาพแล้ว" : "เลือกรูปภาพจากเครื่อง / มือถือ"}</span>
            <input
              type="file"
              aria-label="เลือกรูปภาพหน้างาน"
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
                  aria-label={`ลบรูปภาพที่ ${i + 1}`}
                  onClick={() => {
                    const nextPhotos = detailedPhotos.filter((_, idx) => idx !== i);
                    setDetailedPhotos(nextPhotos);
                    setFieldImages(nextPhotos.map((p) => p.dataUrl));
                  }}
                  className="min-h-9 min-w-9 flex items-center justify-center absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded p-1 text-[10px] leading-none shadow"
                  title="ลบรูปภาพนี้"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  );
}
