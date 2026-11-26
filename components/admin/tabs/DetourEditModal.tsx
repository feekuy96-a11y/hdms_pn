"use client";

import React from "react";
import {
  Camera,
  Clock,
  Compass,
  MapPin,
  Navigation,
  Save,
  Signpost,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  DetourPointLocationSource,
  DetourPointPhoto,
  DetourRoute,
  FloodRoute,
} from "@/db/default-data";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { calculatePolylineRoadDistanceKm } from "@/lib/detour-presentation";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";
import { composeDirectionalAdvice, extractDirectionalAdviceForEdit, localArea } from "@/lib/gis-utils";
import {
  EMPTY_DETOUR_PHOTO_LOCATION,
  type DetourPhotoLocationState,
} from "@/components/admin/tabs/useMapRouteFormState";
import {
  DETOUR_POINT_SOURCE_LABELS,
  formatDetourPointResolvedAt,
} from "@/components/admin/tabs/RouteGeometryEditorSection";

export interface DetourEditModalProps {
  editingDetour: DetourRoute | null;
  floodList: FloodRoute[];
  dialog: {
    dialogRef: React.RefObject<HTMLDivElement | null>;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  editDetourName: string;
  setEditDetourName: (value: string) => void;
  editDetourRefId: string;
  setEditDetourRefId: (value: string) => void;
  editDetourDesc: string;
  setEditDetourDesc: (value: string) => void;
  editDetourAdviceView: "FORWARD" | "REVERSE" | "COMBINED";
  setEditDetourAdviceView: (value: "FORWARD" | "REVERSE" | "COMBINED") => void;
  editDetourGoogleMapsUrlFwd: string;
  setEditDetourGoogleMapsUrlFwd: (value: string) => void;
  editDetourGoogleMapsUrlRev: string;
  setEditDetourGoogleMapsUrlRev: (value: string) => void;
  editDetourDurationMinFwd: string;
  setEditDetourDurationMinFwd: (value: string) => void;
  editDetourDurationMinRev: string;
  setEditDetourDurationMinRev: (value: string) => void;
  editDetourStartPhotoUrl: string;
  setEditDetourStartPhotoUrl: (value: string) => void;
  editDetourStartPhotoCaption: string;
  setEditDetourStartPhotoCaption: (value: string) => void;
  editDetourStartPhotoLocation?: DetourPhotoLocationState;
  setEditDetourStartPhotoLocation?: React.Dispatch<React.SetStateAction<DetourPhotoLocationState>>;
  editDetourEndPhotoUrl: string;
  setEditDetourEndPhotoUrl: (value: string) => void;
  editDetourEndPhotoCaption: string;
  setEditDetourEndPhotoCaption: (value: string) => void;
  editDetourEndPhotoLocation?: DetourPhotoLocationState;
  setEditDetourEndPhotoLocation?: React.Dispatch<React.SetStateAction<DetourPhotoLocationState>>;
  editDetourRoadCondition: string;
  setEditDetourRoadCondition: (value: string) => void;
  editIsActive: boolean;
  setEditIsActive: (value: boolean) => void;
  isSubmitting: boolean;
  onClose: () => void;
  onGenerateAdvice: () => void;
  onPointPhotoUpload: (point: "START" | "END", e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditOnMap: (detourId: string) => void;
  onSave: (photoLocations?: {
    start?: DetourPhotoLocationState;
    end?: DetourPhotoLocationState;
  }) => void;
}

function parseDetourEndpointCoords(detour: DetourRoute, endpoint: "START" | "END"): { lat: number; lon: number } {
  const isStart = endpoint === "START";
  let coords: [number, number][] = [];
  if (Array.isArray(detour.coordinates_json)) {
    coords = detour.coordinates_json as [number, number][];
  } else if (typeof detour.coordinates_json === "string") {
    try {
      coords = JSON.parse(detour.coordinates_json);
    } catch {
      coords = [];
    }
  }
  const lat = isStart
    ? Number(detour.lat_start) || coords[0]?.[1] || 0
    : Number(detour.lat_end) || coords[coords.length - 1]?.[1] || 0;
  const lon = isStart
    ? Number(detour.lon_start) || coords[0]?.[0] || 0
    : Number(detour.lon_end) || coords[coords.length - 1]?.[0] || 0;
  return { lat, lon };
}

function ModalPhotoLocationFields({
  pointLabel,
  pointName,
  location,
  onChange,
  onSyncFromEndpoint,
  onResolveFromCoords,
}: {
  pointLabel: "A" | "B";
  pointName: string;
  location: DetourPhotoLocationState;
  onChange: (patch: Partial<DetourPhotoLocationState>) => void;
  onSyncFromEndpoint: () => void;
  onResolveFromCoords: (lat: number, lon: number) => void;
}) {
  const focusCoordRef = React.useRef("");

  const handleCoordBlur = () => {
    if (`${location.lat},${location.lon}` === focusCoordRef.current) return;
    const nLat = Number(location.lat);
    const nLon = Number(location.lon);
    if (
      Number.isFinite(nLat) &&
      Number.isFinite(nLon) &&
      Math.abs(nLat) <= 90 &&
      Math.abs(nLon) <= 180 &&
      (nLat !== 0 || nLon !== 0)
    ) {
      onResolveFromCoords(nLat, nLon);
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
    <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-900/70 p-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-heading font-semibold text-slate-300">
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
        <button
          type="button"
          onClick={onSyncFromEndpoint}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-heading font-semibold text-slate-200 hover:border-amber-400/60 hover:text-amber-300 transition cursor-pointer"
        >
          ดึงจากจุด {pointLabel}
        </button>
      </div>
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
            onChange={(e) =>
              onChange({
                lat: e.target.value,
                locationSource: "MANUAL",
                resolvedAt: new Date().toISOString(),
              })
            }
            onBlur={handleCoordBlur}
            placeholder="เช่น 6.834000"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-white placeholder:text-slate-600"
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
            onChange={(e) =>
              onChange({
                lon: e.target.value,
                locationSource: "MANUAL",
                resolvedAt: new Date().toISOString(),
              })
            }
            onBlur={handleCoordBlur}
            placeholder="เช่น 101.186000"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-white placeholder:text-slate-600"
          />
        </label>
      </div>
      {location.areaStatus === "resolving" && (
        <p className="text-[10px] text-sky-300">กำลังค้นหาตำบล/อำเภอ/จังหวัดอัตโนมัติ...</p>
      )}
      {isAreaMissing && (
        <div
          role="status"
          className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[10px] font-medium text-amber-200"
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
            onChange={(e) =>
              onChange({
                subdistrict: e.target.value,
                areaStatus: e.target.value.trim() || location.district.trim() ? "resolved" : "not_found",
                resolvedAt: new Date().toISOString(),
              })
            }
            placeholder="ตำบล"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-white placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">อำเภอ</span>
          <input
            type="text"
            aria-label={`อำเภอภาพ${pointName}`}
            value={location.district}
            onChange={(e) =>
              onChange({
                district: e.target.value,
                areaStatus: location.subdistrict.trim() || e.target.value.trim() ? "resolved" : "not_found",
                resolvedAt: new Date().toISOString(),
              })
            }
            placeholder="อำเภอ"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-white placeholder:text-slate-600"
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-slate-400">จังหวัด</span>
          <input
            type="text"
            aria-label={`จังหวัดภาพ${pointName}`}
            value={location.province}
            onChange={(e) =>
              onChange({
                province: e.target.value,
                resolvedAt: new Date().toISOString(),
              })
            }
            placeholder="ปัตตานี"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-white placeholder:text-slate-600"
          />
        </label>
      </div>
    </div>
  );
}

/** Modal แก้ไขข้อมูลเส้นทางเลี่ยงแบบรวดเร็ว (คำแนะนำไป-กลับ, ภาพจุดเข้า A/B, เวลาเดินทาง, ลิงก์ Google Maps) */
export function DetourEditModal({
  editingDetour,
  floodList,
  dialog,
  editDetourName,
  setEditDetourName,
  editDetourRefId,
  setEditDetourRefId,
  editDetourDesc,
  setEditDetourDesc,
  editDetourAdviceView,
  setEditDetourAdviceView,
  editDetourGoogleMapsUrlFwd,
  setEditDetourGoogleMapsUrlFwd,
  editDetourGoogleMapsUrlRev,
  setEditDetourGoogleMapsUrlRev,
  editDetourDurationMinFwd,
  setEditDetourDurationMinFwd,
  editDetourDurationMinRev,
  setEditDetourDurationMinRev,
  editDetourStartPhotoUrl,
  setEditDetourStartPhotoUrl,
  editDetourStartPhotoCaption,
  setEditDetourStartPhotoCaption,
  editDetourStartPhotoLocation,
  setEditDetourStartPhotoLocation,
  editDetourEndPhotoUrl,
  setEditDetourEndPhotoUrl,
  editDetourEndPhotoCaption,
  setEditDetourEndPhotoCaption,
  editDetourEndPhotoLocation,
  setEditDetourEndPhotoLocation,
  editDetourRoadCondition,
  setEditDetourRoadCondition,
  editIsActive,
  setEditIsActive,
  isSubmitting,
  onClose,
  onGenerateAdvice,
  onPointPhotoUpload,
  onEditOnMap,
  onSave,
}: DetourEditModalProps) {
  const [localStartLoc, setLocalStartLoc] = React.useState<DetourPhotoLocationState>(
    EMPTY_DETOUR_PHOTO_LOCATION
  );
  const [localEndLoc, setLocalEndLoc] = React.useState<DetourPhotoLocationState>(
    EMPTY_DETOUR_PHOTO_LOCATION
  );
  const effectiveStartLoc = editDetourStartPhotoLocation ?? localStartLoc;
  const setEffectiveStartLoc = setEditDetourStartPhotoLocation ?? setLocalStartLoc;
  const effectiveEndLoc = editDetourEndPhotoLocation ?? localEndLoc;
  const setEffectiveEndLoc = setEditDetourEndPhotoLocation ?? setLocalEndLoc;
  const [activePointTab, setActivePointTab] = React.useState<"START" | "END">("START");
  const activeDetourIdRef = React.useRef<string | null>(null);

  const resolveEndpointArea = React.useCallback(
    (
      endpoint: "START" | "END",
      lat: number,
      lon: number,
      saved?: Partial<DetourPointPhoto>,
      targetDetourId?: string,
      source: DetourPointLocationSource = "MANUAL"
    ) => {
      const setLoc = endpoint === "START" ? setEffectiveStartLoc : setEffectiveEndLoc;
      const validCoord =
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180 &&
        (lat !== 0 || lon !== 0);
      const savedSub = saved?.subdistrict?.trim() || "";
      const savedDist = saved?.district?.trim() || "";
      const savedProv = saved?.province?.trim() || "";
      const hasArea = Boolean(savedSub || savedDist);
      const resolvedSource = saved?.locationSource ?? source;
      const resolvedAt = saved?.resolvedAt ?? new Date().toISOString();
      setLoc({
        lat: validCoord ? lat.toFixed(6) : "",
        lon: validCoord ? lon.toFixed(6) : "",
        subdistrict: savedSub,
        district: savedDist,
        province: savedProv || (validCoord ? "ปัตตานี" : ""),
        locationSource: resolvedSource,
        resolvedAt,
        areaStatus: hasArea ? "resolved" : validCoord ? "resolving" : "idle",
      });
      if (validCoord && (!savedSub || !savedDist)) {
        void localArea(lon, lat)
          .then((loc) => {
            if (targetDetourId && activeDetourIdRef.current !== targetDetourId) return;
            setLoc((prev) => {
              const nextSub = prev.subdistrict || loc.tambon || "";
              const nextDist = prev.district || loc.amphoe || "";
              return {
                ...prev,
                subdistrict: nextSub,
                district: nextDist,
                province: prev.province || loc.province || "ปัตตานี",
                areaStatus: nextSub || nextDist ? "resolved" : "not_found",
                resolvedAt: new Date().toISOString(),
              };
            });
          })
          .catch(() => {
            if (targetDetourId && activeDetourIdRef.current !== targetDetourId) return;
            setLoc((prev) => ({
              ...prev,
              areaStatus: prev.subdistrict || prev.district ? "resolved" : "not_found",
            }));
          });
      }
    },
    [setEffectiveEndLoc, setEffectiveStartLoc]
  );

  React.useEffect(() => {
    if (!editingDetour) {
      activeDetourIdRef.current = null;
      return;
    }
    if (activeDetourIdRef.current === editingDetour.id) return;
    activeDetourIdRef.current = editingDetour.id;
    setActivePointTab("START");

    const initEndpoint = (endpoint: "START" | "END", photo?: DetourPointPhoto) => {
      const setLoc = endpoint === "START" ? setEffectiveStartLoc : setEffectiveEndLoc;
      const hasSavedCoord =
        typeof photo?.lat === "number" &&
        typeof photo?.lon === "number" &&
        Number.isFinite(photo.lat) &&
        Number.isFinite(photo.lon) &&
        Math.abs(photo.lat) <= 90 &&
        Math.abs(photo.lon) <= 180 &&
        (photo.lat !== 0 || photo.lon !== 0);
      const fallback = parseDetourEndpointCoords(editingDetour, endpoint);
      const targetLat = hasSavedCoord ? photo!.lat! : fallback.lat;
      const targetLon = hasSavedCoord ? photo!.lon! : fallback.lon;
      if (
        !photo?.url &&
        !photo?.caption &&
        !hasSavedCoord &&
        !photo?.subdistrict &&
        !photo?.district &&
        !photo?.province
      ) {
        setLoc(EMPTY_DETOUR_PHOTO_LOCATION);
        return;
      }
      resolveEndpointArea(
        endpoint,
        targetLat,
        targetLon,
        {
          subdistrict: photo?.subdistrict || (endpoint === "START" ? editingDetour.subdistrict : ""),
          district: photo?.district || (endpoint === "START" ? editingDetour.district : ""),
          province: photo?.province,
          locationSource: photo?.locationSource ?? (hasSavedCoord ? "MANUAL" : "ROUTE_ENDPOINT"),
          resolvedAt: photo?.resolvedAt,
        },
        editingDetour.id,
        photo?.locationSource ?? (hasSavedCoord ? "MANUAL" : "ROUTE_ENDPOINT")
      );
    };

    initEndpoint("START", editingDetour.detour_meta?.start_point_photo);
    initEndpoint("END", editingDetour.detour_meta?.end_point_photo);
  }, [editingDetour, resolveEndpointArea, setEffectiveEndLoc, setEffectiveStartLoc]);

  // Fill defaults when a new photo is uploaded inside the modal
  React.useEffect(() => {
    if (!editingDetour || !editDetourStartPhotoUrl) return;
    if (effectiveStartLoc.lat || effectiveStartLoc.lon) return;
    const { lat, lon } = parseDetourEndpointCoords(editingDetour, "START");
    resolveEndpointArea(
      "START",
      lat,
      lon,
      { subdistrict: editingDetour.subdistrict, district: editingDetour.district },
      editingDetour.id,
      "ROUTE_ENDPOINT"
    );
  }, [editDetourStartPhotoUrl, editingDetour, effectiveStartLoc.lat, effectiveStartLoc.lon, resolveEndpointArea]);

  React.useEffect(() => {
    if (!editingDetour || !editDetourEndPhotoUrl) return;
    if (effectiveEndLoc.lat || effectiveEndLoc.lon) return;
    const { lat, lon } = parseDetourEndpointCoords(editingDetour, "END");
    resolveEndpointArea("END", lat, lon, undefined, editingDetour.id, "ROUTE_ENDPOINT");
  }, [editDetourEndPhotoUrl, editingDetour, effectiveEndLoc.lat, effectiveEndLoc.lon, resolveEndpointArea]);

  if (!editingDetour) return null;

  const editParts = extractDirectionalAdviceForEdit(editDetourDesc);
  const fwdKm = calculatePolylineRoadDistanceKm(editingDetour.coordinates_json);
  const revKm = calculatePolylineRoadDistanceKm(
    editingDetour.reverse_coordinates_json || editingDetour.coordinates_json
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialog.dialogRef}
        role="dialog"
        data-hdms-popup="panel"
        aria-modal="true"
        aria-label="แก้ไขข้อมูลเส้นทางเลี่ยง"
        tabIndex={-1}
        onKeyDown={dialog.onKeyDown}
        className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
              <Signpost className="w-5 h-5 text-amber-400" />
              <span>แก้ไขข้อมูลเส้นทางเลี่ยงน้ำท่วม</span>
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างแก้ไขเส้นทางเลี่ยง" data-hdms-popup-close
            className="min-h-10 min-w-10 inline-flex items-center justify-center p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-3.5 text-xs">
          {/* Row 1: Name & Linked Flood */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-detour-name-input" className="text-slate-300 block mb-1">
                ชื่อเส้นทางเลี่ยง *
              </label>
              <input
                id="edit-detour-name-input"
                type="text"
                value={editDetourName}
                onChange={(e) => setEditDetourName(e.target.value)}
                placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
              />
            </div>

            <div>
              <label htmlFor="edit-detour-ref-select" className="text-slate-300 block mb-1">
                ผูกกับจุดน้ำท่วมอ้างอิง
              </label>
              <select
                id="edit-detour-ref-select"
                value={editDetourRefId}
                onChange={(e) => setEditDetourRefId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="">-- ไม่ระบุ --</option>
                {floodList.map((f) => (
                  <option key={f.id} value={f.id}>
                    ทล.{f.route_no} - {f.section_name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-sky-300/90 leading-snug">
                ช่องนี้เป็นจุดน้ำท่วมอ้างอิงเดิม (Legacy) การผูกหลายเหตุการณ์สามารถจัดการได้อย่างปลอดภัยผ่านปุ่ม &quot;จัดการความสัมพันธ์ (หลายจุด)&quot; โดยไม่ถูกหน้านี้เขียนทับ
              </p>
            </div>
          </div>

          {/* Row 2: Directional Advice Header & Switch Tabs */}
          <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="edit-detour-advice-textarea"
                  className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน</span>
                </label>
                <DirectionSwitch
                  size="sm"
                  ariaLabel="เลือกมุมมองทิศทางคำแนะนำ"
                  value={editDetourAdviceView}
                  onChange={setEditDetourAdviceView}
                  options={[
                    { value: "FORWARD", label: "ขาไป (A → B)", ariaLabel: "ขาไป A → B" },
                    { value: "REVERSE", label: "ขากลับ (B → A)", ariaLabel: "ขากลับ B → A" },
                    { value: "COMBINED", label: "ทั้ง ๒ ทิศทาง", ariaLabel: "ทั้ง ๒ ทิศทาง" },
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={onGenerateAdvice}
                className="min-h-10 text-xs bg-amber-500 text-slate-950 font-heading font-bold px-3 py-2 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> วิเคราะห์คำแนะนำอัตโนมัติ
              </button>
            </div>

            <textarea
              id="edit-detour-advice-textarea"
              rows={8}
              value={
                editDetourAdviceView === "FORWARD"
                  ? editParts.forward
                  : editDetourAdviceView === "REVERSE"
                    ? editParts.reverse
                    : editDetourDesc
              }
              onChange={(e) => {
                const val = e.target.value;
                if (editDetourAdviceView === "FORWARD" || editDetourAdviceView === "REVERSE") {
                  const forwardText = editDetourAdviceView === "FORWARD" ? val : editParts.forward;
                  const reverseText = editDetourAdviceView === "REVERSE" ? val : editParts.reverse;
                  setEditDetourDesc(
                    composeDirectionalAdvice(
                      editParts.forwardHeader,
                      forwardText,
                      editParts.reverseHeader,
                      reverseText
                    )
                  );
                } else {
                  setEditDetourDesc(val);
                }
              }}
              placeholder="กรอกคำแนะนำการเดินทาง หรือกด 'วิเคราะห์คำแนะนำอัตโนมัติ'..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
            />
          </div>

          {/* Row 2.2: Estimated Duration (Minutes) + Polyline Distance Preview */}
          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-heading font-bold text-sky-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>เวลาเดินทางโดยประมาณสำหรับประชาชน (นาที)</span>
              </span>
              {fwdKm > 0 && (
                <span className="text-[11px] text-amber-200 font-mono">
                  ระยะทางเส้นจริง: ขาไป {fwdKm.toFixed(1)} กม.
                  {editingDetour.direction_mode === "TWO_WAY" && revKm > 0
                    ? ` · ขากลับ ${revKm.toFixed(1)} กม.`
                    : ""}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="edit-detour-duration-fwd" className="text-[11px] text-slate-300 block mb-1">
                  เวลาโดยประมาณ ขาไป (A → B) (นาที):
                </label>
                <input
                  id="edit-detour-duration-fwd"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  disabled={editingDetour.direction_mode === "REVERSE_ONLY"}
                  value={editDetourDurationMinFwd}
                  onChange={(e) => setEditDetourDurationMinFwd(e.target.value)}
                  placeholder="เช่น 25"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                />
              </div>
              <div>
                <label htmlFor="edit-detour-duration-rev" className="text-[11px] text-slate-300 block mb-1">
                  เวลาโดยประมาณ ขากลับ (B → A) (นาที):
                </label>
                <input
                  id="edit-detour-duration-rev"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  disabled={editingDetour.direction_mode === "FORWARD_ONLY"}
                  value={editDetourDurationMinRev}
                  onChange={(e) => setEditDetourDurationMinRev(e.target.value)}
                  placeholder="เช่น 25"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          {/* Row 2.4: Point A & Point B Entrance Photos */}
          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                <span>ภาพทางเข้าเส้นทางเลี่ยงบนแผนที่ (จุดเริ่มต้น A / จุดสิ้นสุด B)</span>
              </span>
              <span className="text-[10px] text-slate-400">แสดงหมุดกล้องบนแผนที่เมื่อคลิก</span>
            </div>
            {(() => {
              const isStartTab = activePointTab === "START";
              const pointLabel = isStartTab ? "A" : "B";
              const pointName = isStartTab ? "จุดเริ่มต้น A" : "จุดสิ้นสุด B";
              const photoUrl = isStartTab ? editDetourStartPhotoUrl : editDetourEndPhotoUrl;
              const setPhotoUrl = isStartTab ? setEditDetourStartPhotoUrl : setEditDetourEndPhotoUrl;
              const caption = isStartTab ? editDetourStartPhotoCaption : editDetourEndPhotoCaption;
              const setCaption = isStartTab ? setEditDetourStartPhotoCaption : setEditDetourEndPhotoCaption;
              const loc = isStartTab ? effectiveStartLoc : effectiveEndLoc;
              const setLoc = isStartTab ? setEffectiveStartLoc : setEffectiveEndLoc;
              const hasPointLoc = Boolean(loc.lat || loc.lon || loc.subdistrict || loc.district);
              const hasStartSaved = Boolean(editDetourStartPhotoUrl || effectiveStartLoc.lat || effectiveStartLoc.subdistrict);
              const hasEndSaved = Boolean(editDetourEndPhotoUrl || effectiveEndLoc.lat || effectiveEndLoc.subdistrict);

              return (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      role="tablist"
                      aria-label="เลือกแก้ไขข้อมูลจุด A หรือ จุด B"
                      className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5"
                    >
                      {(
                        [
                          { id: "START" as const, label: "จุด A (ต้นทาง A → B)", ready: hasStartSaved },
                          { id: "END" as const, label: "จุด B (ปลายทาง B → A)", ready: hasEndSaved },
                        ] as const
                      ).map((tab) => {
                        const selected = activePointTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setActivePointTab(tab.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-heading font-bold transition flex items-center gap-1.5 cursor-pointer ${
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
                    <div className="flex items-center gap-1.5">
                      {hasPointLoc && (
                        <button
                          type="button"
                          onClick={() => setLoc(EMPTY_DETOUR_PHOTO_LOCATION)}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-heading text-slate-300 hover:border-rose-500/50 hover:text-rose-300 transition cursor-pointer"
                        >
                          ล้างพิกัดจุด {pointLabel}
                        </button>
                      )}
                      <label className="cursor-pointer rounded-md border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-heading font-bold text-emerald-200 transition">
                        {photoUrl ? "เปลี่ยนภาพ" : `+ แนบภาพ${pointName}`}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={`แนบภาพ${pointName}`}
                          className="sr-only"
                          onChange={(e) => onPointPhotoUpload(activePointTab, e)}
                        />
                      </label>
                    </div>
                  </div>

                  <ModalPhotoLocationFields
                    pointLabel={pointLabel}
                    pointName={pointName}
                    location={loc}
                    onChange={(patch) => setLoc((prev) => ({ ...prev, ...patch }))}
                    onSyncFromEndpoint={() => {
                      const { lat, lon } = parseDetourEndpointCoords(editingDetour, activePointTab);
                      resolveEndpointArea(
                        activePointTab,
                        lat,
                        lon,
                        isStartTab
                          ? { subdistrict: editingDetour.subdistrict, district: editingDetour.district }
                          : undefined,
                        editingDetour.id,
                        "ROUTE_ENDPOINT"
                      );
                    }}
                    onResolveFromCoords={(lat, lon) =>
                      resolveEndpointArea(activePointTab, lat, lon, undefined, editingDetour.id, "MANUAL")
                    }
                  />

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
                    {photoUrl && (
                      <div className="relative">
                        <img
                          src={normalizeMediaUrl(photoUrl)}
                          alt={`ภาพทางเข้า${pointName}`}
                          className="h-28 w-full rounded-md object-contain bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotoUrl("")}
                          aria-label={`ลบภาพ${pointName}`}
                          title="ลบเฉพาะภาพ (พิกัดและพื้นที่จุดยังคงอยู่)"
                          className="absolute top-1 right-1 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <input
                      type="text"
                      aria-label={`คำอธิบายภาพ${pointName}`}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder={`คำอธิบายทางเข้า${pointName}...`}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Row 2.5: Approved Google Maps Navigation URLs */}
          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-heading font-bold text-emerald-400 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Google Maps URL ที่เจ้าหน้าที่ตรวจสอบและอนุมัติแล้ว (Optional)</span>
              </span>
              <span className="text-[10px] text-slate-400">ถ้ามี จะใช้นำทางแทนการคำนวณอัตโนมัติ</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="edit-detour-gmaps-url-fwd" className="text-[11px] text-slate-300 block mb-1">
                  ลิงก์ขาไป (A → B):
                </label>
                <input
                  id="edit-detour-gmaps-url-fwd"
                  type="url"
                  value={editDetourGoogleMapsUrlFwd}
                  onChange={(e) => setEditDetourGoogleMapsUrlFwd(e.target.value)}
                  placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                />
              </div>
              <div>
                <label htmlFor="edit-detour-gmaps-url-rev" className="text-[11px] text-slate-300 block mb-1">
                  ลิงก์ขากลับ (B → A):
                </label>
                <input
                  id="edit-detour-gmaps-url-rev"
                  type="url"
                  value={editDetourGoogleMapsUrlRev}
                  onChange={(e) => setEditDetourGoogleMapsUrlRev(e.target.value)}
                  placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Road Condition */}
          <div>
            <label htmlFor="edit-detour-road-condition" className="text-slate-300 block mb-1">
              สภาพผิวทาง (Road Surface Condition)
            </label>
            <input
              id="edit-detour-road-condition"
              type="text"
              value={editDetourRoadCondition}
              onChange={(e) => setEditDetourRoadCondition(e.target.value)}
              placeholder="เช่น ผิวทางลาดยาง สัญจรได้ตามปกติ หรือ ทางลูกรัง/หินคลุก"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </div>

          {/* Row 3: Active Status Switch */}
          <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-heading font-bold text-white block">
                สถานะการเปิดใช้งาน (Active Status)
              </span>
              <span className="text-[11px] text-slate-400">
                เปิดเพื่อให้เส้นทางเลี่ยงนี้ปรากฏบนแผนที่ของประชาชน
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="เปิดใช้งานเส้นทางเลี่ยง"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* Action Link to Redraw Path on Map */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-amber-300 block font-heading">
                ต้องการวาดหรือดัดแนวเส้นทางบนแผนที่?
              </span>
              <span className="text-[11px] text-slate-400">
                สลับไปยังแท็บ &quot;จัดการแผนที่&quot; เพื่อลากหมุดและเกาะถนนจริง (Dual-Source Snapping)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const id = editingDetour.id;
                onClose();
                onEditOnMap(id);
              }}
              className="min-h-10 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 px-3 py-2 rounded-xl font-heading text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <MapPin className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>เปิดเครื่องมือวาดแผนที่</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onSave({ start: effectiveStartLoc, end: effectiveEndLoc })}
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            <span>{isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
