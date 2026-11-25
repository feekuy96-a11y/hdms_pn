"use client";

import React from "react";
import type { DetourPointLocationSource } from "@/db/default-data";
import { ActionButton, FormSection, ToolGroup } from "@/components/admin/ui";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { analyzeCarriagewaySeparation } from "@/lib/gis-utils";
import { DetourDirectionModeType } from "@/lib/constants";
import { parseCoordinatePair } from "./map-management-helpers";
import {
  EMPTY_DETOUR_PHOTO_LOCATION,
  type DetourPhotoLocationState,
} from "./useMapRouteFormState";
import {
  ArrowRightLeft,
  Camera,
  Trash2,
  Sparkles,
  Wand2,
  MapPinned,
  Plus,
  Undo2,
} from "lucide-react";

interface RouteGeometryEditorSectionProps {
  onToast: (msg: string) => void;
  routeMode: "FLOOD" | "DETOUR";
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  startLat: number | string;
  setStartLat: (lat: number | string) => void;
  startLon: number | string;
  setStartLon: (lon: number | string) => void;
  endLat: number | string;
  setEndLat: (lat: number | string) => void;
  endLon: number | string;
  setEndLon: (lon: number | string) => void;
  startCoordinateText: string;
  setStartCoordinateText: (text: string) => void;
  endCoordinateText: string;
  setEndCoordinateText: (text: string) => void;
  revStartLat: number | string;
  setRevStartLat: (lat: number | string) => void;
  revStartLon: number | string;
  setRevStartLon: (lon: number | string) => void;
  revEndLat: number | string;
  setRevEndLat: (lat: number | string) => void;
  revEndLon: number | string;
  setRevEndLon: (lon: number | string) => void;
  revStartCoordinateText: string;
  setRevStartCoordinateText: (text: string) => void;
  revEndCoordinateText: string;
  setRevEndCoordinateText: (text: string) => void;
  onSeedReverseEndpoints: () => void;
  onClearReverseEndpoints: () => void;
  detourStartPhotoUrl: string;
  setDetourStartPhotoUrl: (url: string) => void;
  detourStartPhotoCaption: string;
  setDetourStartPhotoCaption: (caption: string) => void;
  detourStartPhotoLocation?: DetourPhotoLocationState;
  detourEndPhotoUrl: string;
  setDetourEndPhotoUrl: (url: string) => void;
  detourEndPhotoCaption: string;
  setDetourEndPhotoCaption: (caption: string) => void;
  detourEndPhotoLocation?: DetourPhotoLocationState;
  startPhotoLocManualRef?: React.MutableRefObject<boolean>;
  endPhotoLocManualRef?: React.MutableRefObject<boolean>;
  resolveDetourPhotoArea?: (
    target: "START" | "END",
    latVal: number | string,
    lonVal: number | string,
    options?: {
      manual?: boolean;
      source?: DetourPointLocationSource;
      areaHint?: { subdistrict?: string; district?: string; province?: string } | null;
    }
  ) => Promise<void> | void;
  updateDetourPhotoLocation?: (
    target: "START" | "END",
    patch: Partial<DetourPhotoLocationState>,
    manual?: boolean
  ) => void;
  handleDetourPointPhotoUpload: (endpoint: "START" | "END", event: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  snappingStatusText: string;
  setSnappingStatusText: (text: string) => void;
  freeEditEnabled: boolean;
  setFreeEditEnabled: (enabled: boolean) => void;
  freeVertexTool: "move" | "delete";
  setFreeVertexTool: (tool: "move" | "delete") => void;
  supportsTwoWayLineEdit: boolean;
  activeEditTarget: "FORWARD" | "REVERSE";
  handleSelectEditDirection: (nextTarget: "FORWARD" | "REVERSE") => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  draftReverseWaypoints: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  routingRequestRef: React.MutableRefObject<number>;
  freePastRef: React.MutableRefObject<[number, number][][]>;
  freeFutureRef: React.MutableRefObject<[number, number][][]>;
  undoFreeGeometry: (redo?: boolean) => void;
  forceStraightThrough: boolean;
  setForceStraightThrough: (force: boolean) => void;
  triggerDualRoadSnapping: (
    sLat: number | string,
    sLon: number | string,
    eLat: number | string,
    eLon: number | string,
    fwdWaypoints?: [number, number][],
    revWaypoints?: [number, number][]
  ) => Promise<void> | void;
  handleSwapEndpoints: () => void;
  handleAddMidpointWaypoint: () => void;
  handleUndoWaypoint: () => void;
  handleRemoveWaypoint: (index: number) => void;
  originalRouteCoordsRef: React.MutableRefObject<[number, number][]>;
  originalReverseRouteCoordsRef: React.MutableRefObject<[number, number][]>;
  handleRestoreOriginalRoute: () => void;
  requestClearRoute: () => void;
  closedRoadConflicts: string[];
  passabilityWarnings?: string[];
  detourDirectionMode: DetourDirectionModeType;
  detourDistanceMeters: { forward: number; reverse: number };
}

interface DetourPhotoLocationFieldsProps {
  endpoint: "START" | "END";
  pointLabel: "A" | "B";
  pointName: string;
  location: DetourPhotoLocationState;
  routeLat: number | string;
  routeLon: number | string;
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  manualRef?: React.MutableRefObject<boolean>;
  resolveDetourPhotoArea?: RouteGeometryEditorSectionProps["resolveDetourPhotoArea"];
  updateDetourPhotoLocation?: RouteGeometryEditorSectionProps["updateDetourPhotoLocation"];
  onToast: (msg: string) => void;
}

export const DETOUR_POINT_SOURCE_LABELS: Record<DetourPointLocationSource, string> = {
  MAP: "เลือกจากแผนที่",
  MANUAL: "กรอกพิกัดเอง",
  ROUTE_ENDPOINT: "ดึงจากแนวเส้น",
};

export function formatDetourPointResolvedAt(iso?: string): string | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Shared coordinate & Thai area editor for point A/B entrance points. */
function DetourPhotoLocationFields({
  endpoint,
  pointLabel,
  pointName,
  location,
  routeLat,
  routeLon,
  adminPickMode,
  setAdminPickMode,
  manualRef,
  resolveDetourPhotoArea,
  updateDetourPhotoLocation,
  onToast,
}: DetourPhotoLocationFieldsProps) {
  const focusCoordRef = React.useRef("");
  const pickMode = endpoint === "START" ? "PICK_DETOUR_PHOTO_START" : "PICK_DETOUR_PHOTO_END";
  const isPicking = adminPickMode === pickMode;

  const handleSyncFromRoute = () => {
    const nLat = Number(routeLat);
    const nLon = Number(routeLon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon) || (nLat === 0 && nLon === 0)) {
      onToast(`กรุณากำหนดพิกัดจุด ${pointLabel} ของเส้นทางก่อน`);
      return;
    }
    if (manualRef) manualRef.current = false;
    void resolveDetourPhotoArea?.(endpoint, nLat, nLon, { source: "ROUTE_ENDPOINT" });
    onToast(`ดึงพิกัดและพื้นที่จากจุด ${pointLabel} แล้ว`);
  };

  const handleCoordBlur = () => {
    const current = `${location.lat},${location.lon}`;
    if (current === focusCoordRef.current) return;
    const nLat = Number(location.lat);
    const nLon = Number(location.lon);
    if (
      Number.isFinite(nLat) &&
      Number.isFinite(nLon) &&
      Math.abs(nLat) <= 90 &&
      Math.abs(nLon) <= 180 &&
      (nLat !== 0 || nLon !== 0)
    ) {
      void resolveDetourPhotoArea?.(endpoint, nLat, nLon, {
        manual: true,
        source: "MANUAL",
      });
    }
  };

  const sourceLabel = location.locationSource
    ? DETOUR_POINT_SOURCE_LABELS[location.locationSource]
    : null;
  const resolvedAtLabel = formatDetourPointResolvedAt(location.resolvedAt);
  const isAreaMissing =
    location.areaStatus === "not_found" ||
    (Boolean(location.lat.trim() && location.lon.trim()) &&
      !location.subdistrict.trim() &&
      !location.district.trim() &&
      location.areaStatus !== "resolving");

  return (
    <div className="space-y-2 rounded-lg border border-slate-800/90 bg-slate-900/70 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-heading font-semibold text-slate-200">
            พิกัด &amp; พื้นที่{pointName}
          </span>
          {sourceLabel && (
            <span className="rounded-full border border-sky-500/40 bg-sky-950/60 px-2 py-0.5 text-[10px] font-heading font-semibold text-sky-200">
              {sourceLabel}
            </span>
          )}
          {resolvedAtLabel && (
            <span className="text-[10px] text-slate-400">
              อัปเดต {resolvedAtLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleSyncFromRoute}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-heading font-semibold text-slate-200 hover:border-amber-400/60 hover:text-amber-300 transition cursor-pointer"
          >
            ดึงจากจุด {pointLabel}
          </button>
          <ActionButton
            variant="pick"
            active={isPicking}
            onClick={() => setAdminPickMode(isPicking ? null : pickMode)}
          >
            {isPicking ? `เลือกจุดภาพ ${pointLabel}...` : `ปักหมุดภาพ ${pointLabel}`}
          </ActionButton>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 leading-snug">
        เลือกได้ 3 วิธี: ปักหมุดบนแผนที่, กรอกพิกัด Lat/Lon เอง หรือดึงจากแนวเส้นจุด {pointLabel} แล้วตรวจแก้ ต./อ./จ. ได้เสมอ
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">ละติจูด (Lat)</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`ละติจูดภาพ${pointName}`}
            value={location.lat}
            onFocus={() => {
              focusCoordRef.current = `${location.lat},${location.lon}`;
            }}
            onChange={(e) => updateDetourPhotoLocation?.(endpoint, { lat: e.target.value })}
            onBlur={handleCoordBlur}
            placeholder="เช่น 6.834000"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-white placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">ลองจิจูด (Lon)</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`ลองจิจูดภาพ${pointName}`}
            value={location.lon}
            onFocus={() => {
              focusCoordRef.current = `${location.lat},${location.lon}`;
            }}
            onChange={(e) => updateDetourPhotoLocation?.(endpoint, { lon: e.target.value })}
            onBlur={handleCoordBlur}
            placeholder="เช่น 101.186000"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-white placeholder:text-slate-600"
          />
        </label>
      </div>
      {location.areaStatus === "resolving" && (
        <p className="text-[10px] text-sky-300">กำลังค้นหาตำบล/อำเภอ/จังหวัดอัตโนมัติ...</p>
      )}
      {isAreaMissing && (
        <div
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-950/40 px-2.5 py-1.5 text-[10px] font-medium text-amber-200"
        >
          ยังไม่พบข้อมูลพื้นที่ — สามารถกรอกตำบล/อำเภอ/จังหวัดเอง หรือบันทึกพิกัดและภาพได้เลย
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">ตำบล</span>
          <input
            type="text"
            aria-label={`ตำบลภาพ${pointName}`}
            value={location.subdistrict}
            onChange={(e) => updateDetourPhotoLocation?.(endpoint, { subdistrict: e.target.value })}
            placeholder="เช่น บานา"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">อำเภอ</span>
          <input
            type="text"
            aria-label={`อำเภอภาพ${pointName}`}
            value={location.district}
            onChange={(e) => updateDetourPhotoLocation?.(endpoint, { district: e.target.value })}
            placeholder="เช่น เมืองปัตตานี"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">จังหวัด</span>
          <input
            type="text"
            aria-label={`จังหวัดภาพ${pointName}`}
            value={location.province}
            onChange={(e) => updateDetourPhotoLocation?.(endpoint, { province: e.target.value })}
            placeholder="ปัตตานี"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
          />
        </label>
      </div>
    </div>
  );
}

export function RouteGeometryEditorSection({
  onToast,
  routeMode,
  adminPickMode,
  setAdminPickMode,
  startLat,
  setStartLat,
  startLon,
  setStartLon,
  endLat,
  setEndLat,
  endLon,
  setEndLon,
  startCoordinateText,
  setStartCoordinateText,
  endCoordinateText,
  setEndCoordinateText,
  revStartLat,
  setRevStartLat,
  revStartLon,
  setRevStartLon,
  revEndLat,
  setRevEndLat,
  revEndLon,
  setRevEndLon,
  revStartCoordinateText,
  setRevStartCoordinateText,
  revEndCoordinateText,
  setRevEndCoordinateText,
  onSeedReverseEndpoints,
  onClearReverseEndpoints,
  detourStartPhotoUrl,
  setDetourStartPhotoUrl,
  detourStartPhotoCaption,
  setDetourStartPhotoCaption,
  detourStartPhotoLocation = EMPTY_DETOUR_PHOTO_LOCATION,
  detourEndPhotoUrl,
  setDetourEndPhotoUrl,
  detourEndPhotoCaption,
  setDetourEndPhotoCaption,
  detourEndPhotoLocation = EMPTY_DETOUR_PHOTO_LOCATION,
  startPhotoLocManualRef,
  endPhotoLocManualRef,
  resolveDetourPhotoArea,
  updateDetourPhotoLocation,
  handleDetourPointPhotoUpload,
  snappingStatusText,
  setSnappingStatusText,
  freeEditEnabled,
  setFreeEditEnabled,
  freeVertexTool,
  setFreeVertexTool,
  supportsTwoWayLineEdit,
  activeEditTarget,
  handleSelectEditDirection,
  draftCoordinates,
  setDraftCoordinates,
  draftReverseCoordinates,
  setDraftReverseCoordinates,
  draftWaypoints,
  draftReverseWaypoints,
  setDraftReverseWaypoints,
  routingRequestRef,
  freePastRef,
  freeFutureRef,
  undoFreeGeometry,
  forceStraightThrough,
  setForceStraightThrough,
  triggerDualRoadSnapping,
  handleSwapEndpoints,
  handleAddMidpointWaypoint,
  handleUndoWaypoint,
  handleRemoveWaypoint,
  originalRouteCoordsRef,
  originalReverseRouteCoordsRef,
  handleRestoreOriginalRoute,
  requestClearRoute,
  closedRoadConflicts,
  passabilityWarnings = [],
  detourDirectionMode,
  detourDistanceMeters,
}: RouteGeometryEditorSectionProps) {
  const [activeDetourPointTab, setActiveDetourPointTab] = React.useState<"START" | "END">("START");
  const activePointConfig =
    activeDetourPointTab === "START"
      ? {
          endpoint: "START" as const,
          pointLabel: "A" as const,
          pointName: "จุดเริ่มต้น A",
          photoUrl: detourStartPhotoUrl,
          setPhotoUrl: setDetourStartPhotoUrl,
          caption: detourStartPhotoCaption,
          setCaption: setDetourStartPhotoCaption,
          location: detourStartPhotoLocation,
          routeLat: startLat,
          routeLon: startLon,
          manualRef: startPhotoLocManualRef,
          uploadLabel: detourStartPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดเริ่ม A",
          uploadAriaLabel: "แนบภาพจุดเริ่มต้น A",
          deleteAriaLabel: "ลบภาพจุดเริ่มต้น A",
          captionAriaLabel: "คำอธิบายภาพจุดเริ่มต้น A",
          captionPlaceholder: "คำอธิบาย เช่น ปากทางเข้าซอยฝั่งจุดเริ่มต้น A",
          previewAlt: "ภาพทางเข้าจุดเริ่มต้น A",
        }
      : {
          endpoint: "END" as const,
          pointLabel: "B" as const,
          pointName: "จุดสิ้นสุด B",
          photoUrl: detourEndPhotoUrl,
          setPhotoUrl: setDetourEndPhotoUrl,
          caption: detourEndPhotoCaption,
          setCaption: setDetourEndPhotoCaption,
          location: detourEndPhotoLocation,
          routeLat: endLat,
          routeLon: endLon,
          manualRef: endPhotoLocManualRef,
          uploadLabel: detourEndPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดสิ้นสุด B",
          uploadAriaLabel: "แนบภาพจุดสิ้นสุด B",
          deleteAriaLabel: "ลบภาพจุดสิ้นสุด B",
          captionAriaLabel: "คำอธิบายภาพจุดสิ้นสุด B",
          captionPlaceholder: "คำอธิบาย เช่น ปากทางเข้าฝั่งขากลับ (สำหรับผู้มาจากอีกฝั่ง)",
          previewAlt: "ภาพทางเข้าจุดสิ้นสุด B",
        };
  const hasStartPointSaved = Boolean(detourStartPhotoUrl || detourStartPhotoLocation.lat || detourStartPhotoLocation.subdistrict);
  const hasEndPointSaved = Boolean(detourEndPhotoUrl || detourEndPhotoLocation.lat || detourEndPhotoLocation.subdistrict);
  const activePointHasLocation = Boolean(
    activePointConfig.location.lat ||
      activePointConfig.location.lon ||
      activePointConfig.location.subdistrict ||
      activePointConfig.location.district
  );

  return (
    <FormSection
      step={2}
      title="แนวเส้นบนแผนที่"
      description="เลือกจุดเริ่มต้น-สิ้นสุด ให้ระบบคำนวณเส้นเกาะถนน แล้วดัดแนวด้วยจุดดัดเส้น"
      actions={
        <ActionButton
          variant="secondary"
          onClick={handleSwapEndpoints}
          title="สลับจุดเริ่มต้น (A) ↔ สิ้นสุด (B) และกลับทิศทางเส้นทาง"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-sky-400" />
          <span>สลับ A ⇄ B</span>
        </ActionButton>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs font-black text-slate-950">A</span>
              จุดเริ่มต้น
            </span>
            <ActionButton variant="pick" active={adminPickMode === "PICK_START"} onClick={() => setAdminPickMode("PICK_START")}>
              {adminPickMode === "PICK_START" ? "เลือกจุด A..." : "เลือกจุด A"}
            </ActionButton>
          </div>
          <input
            type="text"
            aria-label="พิกัดจุด A"
            value={startCoordinateText}
            onChange={(e) => setStartCoordinateText(e.target.value)}
            onBlur={() => { const pair = parseCoordinatePair(startCoordinateText); if (pair) { setStartLat(pair[0]); setStartLon(pair[1]); } else { setStartLat(""); setStartLon(""); } }}
            placeholder="วางจาก Google Maps เช่น 6.8340, 101.1860"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500"
          />
        </div>
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs font-black text-white">B</span>
              จุดสิ้นสุด
            </span>
            <ActionButton variant="pick" active={adminPickMode === "PICK_END"} onClick={() => setAdminPickMode("PICK_END")}>
              {adminPickMode === "PICK_END" ? "เลือกจุด B..." : "เลือกจุด B"}
            </ActionButton>
          </div>
          <input
            type="text"
            aria-label="พิกัดจุด B"
            value={endCoordinateText}
            onChange={(e) => setEndCoordinateText(e.target.value)}
            onBlur={() => { const pair = parseCoordinatePair(endCoordinateText); if (pair) { setEndLat(pair[0]); setEndLon(pair[1]); } else { setEndLat(""); setEndLon(""); } }}
            placeholder="วางจาก Google Maps เช่น 6.8390, 101.1920"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Point-First Tabbed Editor for Detour Point A / Point B */}
      {routeMode === "DETOUR" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-heading font-bold text-white flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-amber-400" />
                ข้อมูลพิกัด พื้นที่ และภาพจุดเข้า–ออกทางเลี่ยง (จุด A / จุด B)
              </p>
              <p className="text-[10px] text-slate-400">
                พิกัดและพื้นที่ผูกกับตัวจุด A/B (สามารถเปลี่ยนหรือลบรูปภายหลังได้โดยพิกัดและพื้นที่ไม่หาย)
              </p>
            </div>
            <div role="tablist" aria-label="เลือกจุดต้นทางหรือปลายทางของทางเลี่ยง" className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
              {(
                [
                  { id: "START" as const, label: "จุด A (ต้นทาง)", ready: hasStartPointSaved },
                  { id: "END" as const, label: "จุด B (ปลายทาง)", ready: hasEndPointSaved },
                ] as const
              ).map((tab) => {
                const selected = activeDetourPointTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveDetourPointTab(tab.id)}
                    className={`min-h-9 px-3 py-1 rounded-md text-xs font-heading font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selected
                        ? tab.id === "START"
                          ? "bg-emerald-600 text-white shadow"
                          : "bg-sky-600 text-white shadow"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.ready && (
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white" : "bg-amber-400"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <DetourPhotoLocationFields
            endpoint={activePointConfig.endpoint}
            pointLabel={activePointConfig.pointLabel}
            pointName={activePointConfig.pointName}
            location={activePointConfig.location}
            routeLat={activePointConfig.routeLat}
            routeLon={activePointConfig.routeLon}
            adminPickMode={adminPickMode}
            setAdminPickMode={setAdminPickMode}
            manualRef={activePointConfig.manualRef}
            resolveDetourPhotoArea={resolveDetourPhotoArea}
            updateDetourPhotoLocation={updateDetourPhotoLocation}
            onToast={onToast}
          />

          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-heading font-semibold text-slate-200">
                ภาพถ่ายประกอบ &amp; คำอธิบาย ({activePointConfig.pointName})
              </span>
              <div className="flex items-center gap-2">
                {activePointHasLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activePointConfig.manualRef) activePointConfig.manualRef.current = false;
                      updateDetourPhotoLocation?.(
                        activePointConfig.endpoint,
                        EMPTY_DETOUR_PHOTO_LOCATION,
                        false
                      );
                    }}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-heading text-slate-300 hover:border-rose-500/50 hover:text-rose-300 transition cursor-pointer"
                  >
                    ล้างพิกัดจุด {activePointConfig.pointLabel}
                  </button>
                )}
                <label className="cursor-pointer rounded-lg border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/60 px-2.5 py-1 text-[11px] font-heading font-bold text-emerald-200 transition">
                  {activePointConfig.uploadLabel}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={activePointConfig.uploadAriaLabel}
                    className="sr-only"
                    onChange={(e) => handleDetourPointPhotoUpload(activePointConfig.endpoint, e)}
                  />
                </label>
              </div>
            </div>
            {activePointConfig.photoUrl && (
              <div className="relative">
                <img
                  src={activePointConfig.photoUrl}
                  alt={activePointConfig.previewAlt}
                  className="h-32 w-full rounded-md object-contain bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => activePointConfig.setPhotoUrl("")}
                  aria-label={activePointConfig.deleteAriaLabel}
                  title="ลบเฉพาะภาพ (พิกัดและพื้นที่จุดยังคงอยู่)"
                  className="absolute top-1.5 right-1.5 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <input
              type="text"
              aria-label={activePointConfig.captionAriaLabel}
              value={activePointConfig.caption}
              onChange={(e) => activePointConfig.setCaption(e.target.value)}
              placeholder={activePointConfig.captionPlaceholder}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
            />
          </div>
        </div>
      )}

      {/* Separate B -> A Endpoints Card when 2-way editing is active */}
      {supportsTwoWayLineEdit && (
        <div className="rounded-xl border border-amber-500/35 bg-slate-900/50 p-3 space-y-3" role="group" aria-label="หมุดเส้นทางขากลับ (B → A)">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-heading font-bold text-amber-300">
                หมุดเส้นทางขากลับ (B → A) แยกอิสระ
              </p>
              <p className="text-[11px] text-slate-400">
                ปักหมุดต้นทาง–ปลายทางของขากลับแยกจากขาไปได้ (หรือปล่อยว่างเพื่อใช้จุด B → A ของขาไปอัตโนมัติ)
              </p>
            </div>
            {revStartLat !== "" || revStartLon !== "" || revEndLat !== "" || revEndLon !== "" ? (
              <ActionButton variant="secondary" onClick={onClearReverseEndpoints}>
                ใช้หมุดเดียวกับ A⇄B
              </ActionButton>
            ) : (
              <ActionButton variant="secondary" onClick={onSeedReverseEndpoints}>
                แยกหมุด B→A บนแผนที่
              </ActionButton>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-white">
                  <span aria-hidden="true" className="grid h-6 min-w-6 px-1 place-items-center rounded-full bg-amber-400 text-[11px] font-black text-slate-950">B→</span>
                  จุดเริ่มขากลับ (B → A)
                </span>
                <ActionButton variant="pick" active={adminPickMode === "PICK_REV_START"} onClick={() => setAdminPickMode("PICK_REV_START")}>
                  {adminPickMode === "PICK_REV_START" ? "เลือกจุดเริ่ม B→A..." : "เลือกจุดเริ่ม B→A"}
                </ActionButton>
              </div>
              <input
                type="text"
                aria-label="พิกัดจุดเริ่มต้นขากลับ (B → A)"
                value={revStartCoordinateText}
                onChange={(e) => setRevStartCoordinateText(e.target.value)}
                onBlur={() => { const pair = parseCoordinatePair(revStartCoordinateText); if (pair) { setRevStartLat(pair[0]); setRevStartLon(pair[1]); } else { setRevStartLat(""); setRevStartLon(""); } }}
                placeholder="ค่าเริ่มต้น: จุด B ของขาไป (หรือปักหมุดแยก)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-white">
                  <span aria-hidden="true" className="grid h-6 min-w-6 px-1 place-items-center rounded-full bg-indigo-500 text-[11px] font-black text-white">→A</span>
                  จุดสิ้นสุดขากลับ (B → A)
                </span>
                <ActionButton variant="pick" active={adminPickMode === "PICK_REV_END"} onClick={() => setAdminPickMode("PICK_REV_END")}>
                  {adminPickMode === "PICK_REV_END" ? "เลือกจุดปลาย B→A..." : "เลือกจุดปลาย B→A"}
                </ActionButton>
              </div>
              <input
                type="text"
                aria-label="พิกัดจุดสิ้นสุดขากลับ (B → A)"
                value={revEndCoordinateText}
                onChange={(e) => setRevEndCoordinateText(e.target.value)}
                onBlur={() => { const pair = parseCoordinatePair(revEndCoordinateText); if (pair) { setRevEndLat(pair[0]); setRevEndLon(pair[1]); } else { setRevEndLat(""); setRevEndLon(""); } }}
                placeholder="ค่าเริ่มต้น: จุด A ของขาไป (หรือปักหมุดแยก)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Snapping Status Feedback Banner */}
      {snappingStatusText && (
        <div className="p-2.5 rounded-lg bg-sky-950/70 border border-sky-800 text-sky-200 text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{snappingStatusText}</span>
        </div>
      )}

      {/* Unified My Maps-style geometry editor (also used by highway geometry). */}
      <div className="rounded-xl border border-sky-800/70 bg-slate-900/50 p-3 space-y-3" role="group" aria-label="โหมดแก้ไขแนวเส้น">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">แก้ไขแนวเส้นบนแผนที่</p>
          <span className="text-xs text-slate-400">ตามถนน / ดัดเส้นอิสระ</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton variant={freeEditEnabled ? "secondary" : "primary"} active={!freeEditEnabled} onClick={() => { setFreeEditEnabled(false); setAdminPickMode(null); }}>
            <Wand2 className="h-4 w-4" /> ตามแนวถนน
          </ActionButton>
          <ActionButton variant={freeEditEnabled ? "primary" : "secondary"} active={freeEditEnabled} onClick={() => {
            let nextFwd = draftCoordinates;
            if (nextFwd.length < 2) {
              const sLat = Number(startLat); const sLon = Number(startLon);
              const eLat = Number(endLat); const eLon = Number(endLon);
              if (!sLat || !sLon || !eLat || !eLon || isNaN(sLat) || isNaN(eLat)) {
                onToast("กรุณาปัก A และ B แล้วคำนวณแนวถนนก่อนดัดเส้นอิสระ");
                return;
              }
              nextFwd = [[sLon, sLat], [eLon, eLat]];
              setDraftCoordinates(nextFwd);
            }
            if (supportsTwoWayLineEdit && draftReverseCoordinates.length < 2) {
              const rsLat = Number(revStartLat) || Number(endLat);
              const rsLon = Number(revStartLon) || Number(endLon);
              const reLat = Number(revEndLat) || Number(startLat);
              const reLon = Number(revEndLon) || Number(startLon);
              if (rsLat && rsLon && reLat && reLon) {
                setDraftReverseCoordinates?.(
                  draftCoordinates.length >= 2 && (revStartLat === "" && revEndLat === "")
                    ? [...nextFwd].reverse().map((p) => [...p] as [number, number])
                    : [[rsLon, rsLat], [reLon, reLat]]
                );
              }
            } else if (activeEditTarget === "REVERSE" && draftReverseCoordinates.length < 2) {
              setDraftReverseCoordinates?.([...nextFwd].reverse().map((p) => [...p] as [number, number]));
            }
            routingRequestRef.current += 1;
            freePastRef.current = []; freeFutureRef.current = [];
            setFreeEditEnabled(true); setAdminPickMode(null); setFreeVertexTool("move");
          }}>
            <MapPinned className="h-4 w-4" /> ดัดเส้นอิสระ
          </ActionButton>
        </div>
        {supportsTwoWayLineEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-300">เลือกทิศทางเส้นทางที่ต้องการแก้ไข:</span>
            <DirectionSwitch
              size="sm"
              ariaLabel="เลือกทิศทางสำหรับดัดเส้น"
              value={activeEditTarget}
              onChange={handleSelectEditDirection}
              options={[
                { value: "FORWARD", label: "ขาไป (A → B)", ariaLabel: "ขาไป A → B" },
                { value: "REVERSE", label: "ขากลับ (B → A)", ariaLabel: "ขากลับ B → A" },
              ]}
            />
          </div>
        )}
        {freeEditEnabled && (
          <>
            <ToolGroup label="แก้ไขจุดดัด (ใช้เครื่องมือเดียวกับแนวทางหลวง)">
              <ActionButton variant="secondary" active={freeVertexTool === "move" && adminPickMode !== "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(null); }}>ลากจุดดัด</ActionButton>
              <ActionButton variant="pick" active={adminPickMode === "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(adminPickMode === "ADD_LINE_VERTEX" ? null : "ADD_LINE_VERTEX"); }}>+ เพิ่มจุดดัดอิสระ</ActionButton>
              <ActionButton variant="danger" active={freeVertexTool === "delete"} onClick={() => { setFreeVertexTool(freeVertexTool === "delete" ? "move" : "delete"); setAdminPickMode(null); }}>ลบจุดดัด</ActionButton>
              <ActionButton variant="secondary" disabled={!freePastRef.current.length} onClick={() => undoFreeGeometry(false)}>ย้อนกลับ</ActionButton>
              <ActionButton variant="secondary" disabled={!freeFutureRef.current.length} onClick={() => undoFreeGeometry(true)}>ทำซ้ำ</ActionButton>
            </ToolGroup>
            <p className="text-xs text-sky-200">ลากหมุดเล็กบนเส้น (รวมถึงจุดต้นทาง–ปลายทาง) เพื่อย้ายจุด คลิกจุดกึ่งกลางเพื่อแทรก คลิกขวาเพื่อลบ หรือเลือกโหมดลบจุด ข้อมูลจะคงแนวเส้นอิสระตามที่บันทึก</p>
            {supportsTwoWayLineEdit && (
              <p className="text-xs text-amber-200">
                กำลังดัดเส้น: <strong>{activeEditTarget === "REVERSE" ? "ขากลับ (B → A)" : "ขาไป (A → B)"}</strong> (สลับปุ่มทิศทางด้านบนเพื่อแก้แต่ละฝั่งแยกกันได้ทันที)
              </p>
            )}
          </>
        )}
      </div>

      {/* Waypoint Operations & Midpoint Insertion */}
      {!freeEditEnabled && routeMode === "DETOUR" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-100">
          <input
            type="checkbox"
            checked={forceStraightThrough}
            onChange={(event) => {
              setForceStraightThrough(event.target.checked);
              setSnappingStatusText(event.target.checked
                ? "เปิดโหมดตรงผ่านแยกแล้ว: เพิ่มจุดดัดบนกึ่งกลางสามแยก/สี่แยก แล้วกดคำนวณเส้นเกาะถนน"
                : "ปิดโหมดตรงผ่านแยกแล้ว");
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span><strong className="block text-amber-300">บังคับตรงผ่านสามแยก/สี่แยก</strong>จุดดัดจะเป็นจุดควบคุมทิศทางตรง ระบบจะป้องกันการยูเทิร์นที่จุดนั้นและยังคงเกาะถนนจริง กรุณาตรวจเส้นพรีวิวก่อนบันทึก</span>
        </label>
      )}
      <div className="space-y-4 border-t border-slate-800 pt-4">
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-amber-300">สร้างแนวเส้นอัตโนมัติ (แนะนำ)</p>
            <p className="text-[11px] text-slate-300">คำนวณเส้นทางเกาะแนวถนนจริงจากจุดเริ่มต้น (A) ไปปลายทาง (B)</p>
          </div>
          <ActionButton
            variant="primary"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, draftReverseWaypoints)}
          >
            <Wand2 className="h-3.5 w-3.5" /> คำนวณเส้นเกาะถนน
          </ActionButton>
        </div>

        {!freeEditEnabled && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 space-y-3">
            <p className="text-[11px] font-semibold text-slate-400">เครื่องมือปรับแต่งจุดดัดเส้นและล้างข้อมูล (ทางเลือกเพิ่มเติม)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ToolGroup label={supportsTwoWayLineEdit ? `ดัดแนวเส้น (${activeEditTarget === "REVERSE" ? "ขากลับ B → A" : "ขาไป A → B"})` : "ดัดแนวเส้น"}>
                <ActionButton variant="secondary" className="text-amber-300" onClick={handleAddMidpointWaypoint}>
                  <Plus className="h-3.5 w-3.5" /> แตะจุดกลางเส้นเพื่อเพิ่มจุด
                </ActionButton>
                {(() => {
                  const pickTargetMode = activeEditTarget === "REVERSE" ? "ADD_REVERSE_WAYPOINT" : "ADD_WAYPOINT";
                  const isPicking = adminPickMode === pickTargetMode;
                  return (
                    <ActionButton
                      variant="pick"
                      active={isPicking}
                      onClick={() => setAdminPickMode(isPicking ? null : pickTargetMode)}
                    >
                      {isPicking
                        ? (forceStraightThrough && routeMode === "DETOUR" ? "คลิกกึ่งกลางแยก..." : "คลิกถนนเพื่อดัด...")
                        : (forceStraightThrough && routeMode === "DETOUR" ? "+ เพิ่มจุดผ่านแยกตรง" : "+ เพิ่มจุดดัดเส้น")}
                    </ActionButton>
                  );
                })()}
              </ToolGroup>

              <ToolGroup label="ย้อนกลับหรือล้าง">
                <ActionButton variant="secondary" onClick={handleUndoWaypoint}>
                  <Undo2 className="h-3.5 w-3.5" /> ย้อนกลับ
                </ActionButton>
                {(originalRouteCoordsRef.current.length >= 2 || originalReverseRouteCoordsRef.current.length >= 2) && (
                  <ActionButton variant="secondary" className="text-sky-300" onClick={handleRestoreOriginalRoute}>
                    คืนค่าแนวเดิม
                  </ActionButton>
                )}
                <ActionButton variant="danger" onClick={requestClearRoute}>
                  ล้างข้อมูลทั้งหมด
                </ActionButton>
              </ToolGroup>
            </div>
          </div>
        )}
      </div>
      {!freeEditEnabled && draftWaypoints.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" aria-label="รายการจุดดัดเส้น">
          <p className="mb-2 text-xs font-semibold text-slate-200">จุดดัดเส้น ({draftWaypoints.length} จุด)</p>
          <div className="flex flex-wrap gap-2">
            {draftWaypoints.map(([lon, lat], index) => (
              <div key={`${lon}-${lat}-${index}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300">
                <span className="font-mono">#{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveWaypoint(index)}
                  aria-label={`ลบจุดดัดที่ ${index + 1}`}
                  className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!freeEditEnabled && supportsTwoWayLineEdit && draftReverseWaypoints.length > 0 && (
        <div className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-3" aria-label="รายการจุดดัดเส้นขากลับ">
          <p className="mb-2 text-xs font-semibold text-sky-200">จุดดัดเส้นขากลับ B → A ({draftReverseWaypoints.length} จุด)</p>
          <div className="flex flex-wrap gap-2">
            {draftReverseWaypoints.map(([lon, lat], index) => (
              <div key={`rev-${lon}-${lat}-${index}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-sky-800 bg-slate-950 px-2 text-xs text-sky-200">
                <span className="font-mono">#R{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = draftReverseWaypoints.filter((_, i) => i !== index);
                    setDraftReverseWaypoints?.(next);
                    if (startLat && startLon && endLat && endLon) {
                      void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, next);
                    }
                  }}
                  aria-label={`ลบจุดดัดขากลับที่ ${index + 1}`}
                  className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {routeMode === "DETOUR" && draftCoordinates.length >= 2 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-heading font-bold text-amber-300">🔍 พรีวิวตรวจสอบทางเลี่ยงก่อนบันทึก (A-B / B-A Inspector)</span>
            {closedRoadConflicts.length === 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                ✓ ผ่านเกณฑ์: ไม่ตัดผ่านจุดปิดการจราจร
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-200 border border-red-600 text-[10px] font-bold">
                ✕ พบตัดผ่านจุดปิดการจราจร ({closedRoadConflicts.length} จุด)
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
            <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
              <span className="text-slate-400 block">ขาไป (A → B)</span>
              <strong className="text-amber-300 font-mono">
                {detourDirectionMode === "REVERSE_ONLY"
                  ? "ไม่ใช้ (เดินรถเฉพาะ B→A)"
                  : `${draftCoordinates.length} จุด${detourDistanceMeters.forward ? ` · ${(detourDistanceMeters.forward / 1000).toFixed(2)} กม.` : ""}`}
              </strong>
            </div>
            <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
              <span className="text-slate-400 block">ขากลับ (B → A)</span>
              <strong className="text-sky-300 font-mono">
                {detourDirectionMode === "FORWARD_ONLY"
                  ? "ไม่ใช้ (เดินรถเฉพาะ A→B)"
                  : detourDirectionMode === "REVERSE_ONLY"
                    ? `${draftCoordinates.length} จุด${detourDistanceMeters.reverse ? ` · ${(detourDistanceMeters.reverse / 1000).toFixed(2)} กม.` : ""}`
                    : `${draftReverseCoordinates.length || draftCoordinates.length} จุด${detourDistanceMeters.reverse ? ` · ${(detourDistanceMeters.reverse / 1000).toFixed(2)} กม.` : ""}`}
              </strong>
            </div>
            <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
              <span className="text-slate-400 block">โครงสร้างแนวเส้นและลูกศร</span>
              <strong className="text-emerald-300">
                {detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2
                  ? analyzeCarriagewaySeparation(draftCoordinates, draftReverseCoordinates).isSymmetricSingleLine
                    ? "ใช้ถนนสายเดียวกัน (ลูกศร ⇄)"
                    : "แยกแนวเส้น A→B และ B→A (ลูกศร →)"
                  : "เดินรถทิศทางเดียว (ลูกศร →)"}
              </strong>
            </div>
          </div>
          {closedRoadConflicts.length > 0 && (
            <p className="rounded-lg bg-red-950/70 border border-red-700 p-2 text-[11px] text-red-200">
              ⚠️ เส้นทางเลี่ยงทับซ้อนช่วงถนนที่ปิดการจราจร: <strong>{closedRoadConflicts.join(", ")}</strong> — กรุณาเพิ่มจุดดัดเส้นเพื่ออ้อมจุดดังกล่าวก่อนเผยแพร่
            </p>
          )}
          {passabilityWarnings.length > 0 && (
            <p className="rounded-lg bg-amber-950/70 border border-amber-600/80 p-2 text-[11px] text-amber-200">
              ⚠️ ข้อควรระวัง: ทางเลี่ยงนี้ผ่านช่วงถนนที่มีน้ำท่วม/จำกัดการสัญจร: <strong>{passabilityWarnings.join(", ")}</strong> — กรุณาตรวจสอบว่าประเภทรถที่แนะนำสามารถผ่านได้จริง
            </p>
          )}
        </div>
      )}
    </FormSection>
  );
}
