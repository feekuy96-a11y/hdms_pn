"use client";

import React, { useState, useEffect } from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  MapPinned,
  ArrowRightLeft,
  Navigation,
  Sparkles,
  Wand2,
  Plus,
  Undo2,
  Camera,
  Save,
} from "lucide-react";
import { upsertRouteAction, snapRouteAction } from "@/app/actions/doh-actions";
import {
  calculateRoadSnappedDualSource,
  generateAutoDetourAdvice,
  extractDirectionalAdvice,
  reverseGeocodeTambonAmphoe,
  compressImageToBase64,
} from "@/lib/gis-utils";
import {
  HIGHWAY_ROUTES,
  SAFETY_MEASURES,
} from "@/lib/constants";

interface MapManagementTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal?: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onNavigateToIncidents?: () => void;

  // Map interactions
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;

  // Editing state passed from parent
  editingRoute?: { type: "FLOOD" | "DETOUR"; id: string } | null;
  onClearEditingRoute?: () => void;
}

export function MapManagementTab({
  systemData,
  onDataRefresh,
  onToast,
  showSuccessModal,
  showErrorModal,
  onNavigateToIncidents,
  adminPickMode,
  setAdminPickMode,
  pickedCoordinate,
  draftCoordinates,
  setDraftCoordinates,
  editingRoute,
  onClearEditingRoute,
}: MapManagementTabProps) {
  // Mode: Flood vs Detour
  const [routeMode, setRouteMode] = useState<"FLOOD" | "DETOUR">("FLOOD");
  const [routeEditId, setRouteEditId] = useState<string>("");

  // Common Highway Attributes
  const [routeNo, setRouteNo] = useState("");
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [sectionName, setSectionName] = useState("");

  // Detour Specific
  const [detourRefId, setDetourRefId] = useState("");
  const [detourName, setDetourName] = useState("");
  const [detourDesc, setDetourDesc] = useState("");
  const [detourAdviceView, setDetourAdviceView] = useState<"FORWARD" | "REVERSE" | "COMBINED">("COMBINED");

  // Coordinates - Start empty without hardcoded mock defaults
  const [startLat, setStartLat] = useState<number | string>("");
  const [startLon, setStartLon] = useState<number | string>("");
  const [endLat, setEndLat] = useState<number | string>("");
  const [endLon, setEndLon] = useState<number | string>("");
  const [draftWaypoints, setDraftWaypoints] = useState<[number, number][]>([]);

  // Snapping & Geocoding State
  const [snappingStatusText, setSnappingStatusText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Flood Severity & Traffic Status - Start empty for clean input
  const [routeWaterLevel, setRouteWaterLevel] = useState<number | string>("");
  const [routeStatus, setRouteStatus] = useState<"WARNING" | "CLOSED" | "PASSABLE">("WARNING");
  const [selectedMeasure, setSelectedMeasure] = useState<string>(SAFETY_MEASURES[0]);

  // Images & Submitting
  const [fieldImages, setFieldImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Highway Routes strictly from database (Issue #12)
  const availableHighways = React.useMemo(() => {
    const map = new Map<string, string>();
    (systemData.highwayLayers || []).forEach((layer) => {
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        layer.geojson_data.features.forEach((f: any) => {
          const props = f.properties || {};
          const no = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
          const name = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "";
          if (no) {
            const cleanNo = String(no).replace(/^ทล\.?/i, "").trim();
            if (!map.has(cleanNo)) {
              map.set(cleanNo, name ? `ทล.${cleanNo} - ${name}` : `ทล.${cleanNo}`);
            }
          }
        });
      }
    });

    (systemData.floodRoutes || []).forEach((r) => {
      if (r.route_no) {
        const cleanNo = String(r.route_no).replace(/^ทล\.?/i, "").trim();
        if (!map.has(cleanNo)) {
          map.set(cleanNo, r.section_name ? `ทล.${cleanNo} - ${r.section_name}` : `ทล.${cleanNo}`);
        }
      }
    });

    if (map.size === 0) {
      HIGHWAY_ROUTES.forEach((h) => {
        map.set(h.no, `ทล.${h.no} - ${h.name}`);
      });
    }

    return Array.from(map.entries()).map(([no, name]) => ({ no, name }));
  }, [systemData.highwayLayers, systemData.floodRoutes]);

  // Sync with editingRoute prop
  useEffect(() => {
    if (!editingRoute) return;
    const { type, id } = editingRoute;
    setRouteMode(type);
    setRouteEditId(id);

    if (type === "FLOOD") {
      const flood = systemData.floodRoutes.find((r) => r.id === id);
      if (!flood) return;
      setRouteNo(flood.route_no);
      setKmStart(flood.km_start);
      setKmEnd(flood.km_end);
      setSectionName(flood.section_name);
      setRouteWaterLevel(flood.water_level_cm);
      setRouteStatus(flood.traffic_status);
      setStartLat(flood.lat_start);
      setStartLon(flood.lon_start);
      setEndLat(flood.lat_end);
      setEndLon(flood.lon_end);

      let coords: [number, number][] = [];
      if (Array.isArray(flood.coordinates_json)) coords = flood.coordinates_json as [number, number][];
      else if (typeof flood.coordinates_json === "string") coords = JSON.parse(flood.coordinates_json);
      setDraftCoordinates(coords);
      setFieldImages(flood.latest_photo_url ? [flood.latest_photo_url] : []);
    } else {
      const detour = systemData.detourRoutes.find((r) => r.id === id);
      if (!detour) return;
      setDetourRefId(detour.flood_id_ref || "");
      setDetourName(detour.route_name);
      setDetourDesc(detour.description || "");
      setStartLat(detour.lat_start || 0);
      setStartLon(detour.lon_start || 0);
      setEndLat(detour.lat_end || 0);
      setEndLon(detour.lon_end || 0);

      let coords: [number, number][] = [];
      if (Array.isArray(detour.coordinates_json)) coords = detour.coordinates_json as [number, number][];
      else if (typeof detour.coordinates_json === "string") coords = JSON.parse(detour.coordinates_json);
      setDraftCoordinates(coords);
    }
  }, [editingRoute, systemData]);

  // Listen to pickedCoordinate from map
  useEffect(() => {
    if (!pickedCoordinate) return;

    if (pickedCoordinate.mode === "PICK_START") {
      setStartLat(pickedCoordinate.lat);
      setStartLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดเริ่มต้น (A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat);
    } else if (pickedCoordinate.mode === "PICK_END") {
      setEndLat(pickedCoordinate.lat);
      setEndLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดสิ้นสุด (B): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      if (startLat && startLon) {
        triggerDualRoadSnapping(startLat, startLon, pickedCoordinate.lat, pickedCoordinate.lon);
      }
    } else if (pickedCoordinate.mode === "ADD_WAYPOINT") {
      const newWp: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      setDraftWaypoints((prev) => [...prev, newWp]);
      setAdminPickMode(null);
      onToast("เพิ่มจุดดัดเส้นทางเรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, [...draftWaypoints, newWp]);
      }
    }
  }, [pickedCoordinate]);

  // Trigger Road Snapping
  const triggerDualRoadSnapping = async (
    sLat: number | string,
    sLon: number | string,
    eLat: number | string,
    eLon: number | string,
    waypoints: [number, number][] = draftWaypoints
  ) => {
    const numSLat = Number(sLat);
    const numSLon = Number(sLon);
    const numELat = Number(eLat);
    const numELon = Number(eLon);

    if (!numSLat || !numSLon || !numELat || !numELon || isNaN(numSLat) || isNaN(numELat)) {
      onToast("กรุณาระบุพิกัด A และ B ให้ครบถ้วนก่อนคำนวณเส้นเกาะถนน");
      return;
    }

    setSnappingStatusText("กำลังคำนวณเส้นเกาะถนนจริง (Dual-Source Snapping)...");
    try {
      const dbCoords = waypoints.length === 0 ? await snapRouteAction([numSLon, numSLat], [numELon, numELat]).catch(() => null) : null;
      const result = dbCoords ? { coords: dbCoords } : await calculateRoadSnappedDualSource([numSLon, numSLat], [numELon, numELat], waypoints, systemData.highwayLayers);
      const snapped = result.coords;
      if (snapped && snapped.length > 0) {
        setDraftCoordinates(snapped);
        setSnappingStatusText(`✓ คำนวณเส้นทางเกาะโครงข่ายถนนสำเร็จ (${snapped.length} จุด)`);
        onToast(`สร้างแนวเส้นทางเกาะถนนสำเร็จ: ${snapped.length} จุด`);
      } else {
        const fallback: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        setDraftCoordinates(fallback);
        setSnappingStatusText("ไม่สามารถเชื่อมต่อโครงข่ายทางหลวงได้ จึงใช้เส้นตรงระหว่างจุด");
      }
    } catch {
      const fallback: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
      setDraftCoordinates(fallback);
      setSnappingStatusText("ใช้เส้นตรงระหว่างจุด (โครงข่ายอยู่นอกพื้นที่สำรวจ)");
    }
  };

  // Auto Geocode
  const handleAutoGeocode = async (lon: number, lat: number) => {
    setIsGeocoding(true);
    try {
      const location = await reverseGeocodeTambonAmphoe(lon, lat);
      if (location) {
        setSectionName(`ต.${location.subdistrict} อ.${location.district} จ.${location.province}`);
        onToast(`ระบุพื้นที่อัตโนมัติ: ${location}`);
      }
    } catch {
      onToast("ไม่สามารถดึงข้อมูลตำบล/อำเภออัตโนมัติได้");
    } finally {
      setIsGeocoding(false);
    }
  };

  // Swap Endpoints
  const handleSwapEndpoints = () => {
    const tmpLat = startLat;
    const tmpLon = startLon;
    setStartLat(endLat);
    setStartLon(endLon);
    setEndLat(tmpLat);
    setEndLon(tmpLon);

    if (draftCoordinates.length > 0) {
      const reversed = [...draftCoordinates].reverse() as [number, number][];
      setDraftCoordinates(reversed);
    }
    if (draftWaypoints.length > 0) {
      setDraftWaypoints([...draftWaypoints].reverse());
    }
    onToast("สลับจุดเริ่มต้นและสิ้นสุด A ⇄ B เรียบร้อย");
  };

  // Add Midpoint Waypoint
  const handleAddMidpointWaypoint = () => {
    if (draftCoordinates.length < 2) {
      onToast("ต้องมีแนวเส้นทางอย่างน้อย ๒ จุดก่อนเพิ่มจุดกึ่งกลาง");
      return;
    }
    const midIdx = Math.floor(draftCoordinates.length / 2);
    const midPoint = draftCoordinates[midIdx];
    setDraftWaypoints((prev) => [...prev, midPoint]);
    onToast(`เพิ่มจุดดัดแนวเส้นทางที่พิกัด ${midPoint[1].toFixed(4)}, ${midPoint[0].toFixed(4)}`);
  };

  // Undo Waypoint
  const handleUndoWaypoint = () => {
    if (draftWaypoints.length > 0) {
      const updated = draftWaypoints.slice(0, -1);
      setDraftWaypoints(updated);
      onToast("ยกเลิกจุดดัดล่าสุดเรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated);
      }
    } else {
      onToast("ไม่มีจุดดัดเส้นทางให้ยกเลิก");
    }
  };

  // Clear Route
  const handleClearRoute = () => {
    setDraftCoordinates([]);
    setDraftWaypoints([]);
    setSnappingStatusText("");
    setStartLat("");
    setStartLon("");
    setEndLat("");
    setEndLon("");
    setKmStart("");
    setKmEnd("");
    setSectionName("");
    setRouteWaterLevel("");
    setDetourName("");
    setDetourDesc("");
    setFieldImages([]);
    onToast("ล้างเส้นทางร่างและแบบฟอร์มแล้ว");
  };

  // Generate Detour Advice
  const handleGenerateDetourAdviceClick = async () => {
    const numSLat = Number(startLat) || 6.834;
    const numSLon = Number(startLon) || 101.186;
    const numELat = Number(endLat) || 6.839;
    const numELon = Number(endLon) || 101.192;

    const advice = await generateAutoDetourAdvice([numSLon, numSLat], [numELon, numELat], draftCoordinates, routeNo);
    setDetourDesc(advice);
    onToast("วิเคราะห์คำแนะนำการเดินทางไป-กลับสำเร็จ");
  };

  // Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    onToast(`กำลังประมวลผลรูปภาพ ${files.length} ไฟล์...`);
    const newBase64s: string[] = [];

    for (let i = 0; i < Math.min(files.length, 10); i++) {
      try {
        const compressed = await compressImageToBase64(files[i], 1280, 0.7);
        newBase64s.push(compressed);
      } catch {
        // ignore single failed image
      }
    }

    setFieldImages((prev) => [...prev, ...newBase64s].slice(0, 10));
    onToast(`เพิ่มภาพถ่ายหน้างานสำเร็จ (${newBase64s.length} รูป)`);
  };

  // Submit Flood or Detour Route
  const handleSubmitRoute = async () => {
    if (!sectionName && routeMode === "FLOOD") {
      onToast("กรุณาระบุชื่อตอนควบคุมหรือบริเวณที่เกิดเหตุ");
      return;
    }

    const numSLat = Number(startLat);
    const numSLon = Number(startLon);
    const numELat = Number(endLat);
    const numELon = Number(endLon);
    const numWaterLevel = Number(routeWaterLevel) || 0;

    if (draftCoordinates.length < 2 && (!numSLat || !numELat || isNaN(numSLat) || isNaN(numELat))) {
      onToast("กรุณากำหนดจุดพิกัดเริ่มต้นและสิ้นสุดบนแผนที่");
      return;
    }

    setIsSubmitting(true);
    try {
      const coords = (
        draftCoordinates.length >= 2
          ? draftCoordinates
          : [
              [numSLon, numSLat],
              [numELon, numELat],
            ]
      ) as [number, number][];

      const chosenRouteNo = routeNo || (availableHighways[0]?.no || "43");

      const res = await upsertRouteAction({
        id: routeEditId || undefined,
        recordType: routeMode,
        routeNo: chosenRouteNo,
        kmStart,
        kmEnd,
        sectionName: sectionName || "จุดรายงานน้ำท่วม",
        waterLevelCm: numWaterLevel,
        trafficStatus: routeStatus,
        detourRefId,
        detourName: detourName || "เส้นทางเลี่ยงน้ำท่วม",
        detourDesc,
        latStart: numSLat || undefined,
        lonStart: numSLon || undefined,
        latEnd: numELat || undefined,
        lonEnd: numELon || undefined,
        coordinates: coords,
        latestPhotoUrl: fieldImages[0] || undefined,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal(
          routeEditId ? "แก้ไขข้อมูลเส้นทางสำเร็จ" : "บันทึกเหตุการณ์น้ำท่วมสำเร็จ",
          `ข้อมูล ทล.${routeNo} ${sectionName} ถูกจัดเก็บและแสดงบนแผนที่ประชาชนเรียบร้อยแล้ว`
        );
        setRouteEditId("");
        setFieldImages([]);
        handleClearRoute();
        if (onClearEditingRoute) onClearEditingRoute();
        if (onNavigateToIncidents) onNavigateToIncidents();
      }
    } catch (err: any) {
      if (showErrorModal) {
        showErrorModal("เกิดข้อผิดพลาดในการบันทึก", err.message);
      } else {
        onToast("ข้อผิดพลาด: " + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-amber-400" /> จัดการแผนที่และรายงานเหตุการณ์
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            กำหนดจุดน้ำท่วม จุดเริ่มต้น-สิ้นสุด และดัดแนวเส้นทางให้เกาะถนนจริง
          </p>
        </div>
        {/* Switcher: Flood vs Detour */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setRouteMode("FLOOD")}
            className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition ${
              routeMode === "FLOOD" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            เส้นน้ำท่วม (แดง)
          </button>
          <button
            type="button"
            onClick={() => setRouteMode("DETOUR")}
            className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition ${
              routeMode === "DETOUR" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            ทางเลี่ยง (เหลือง)
          </button>
        </div>
      </div>

      {/* Main Map Form Container */}
      <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
        {/* 1. Highway Identification */}
        {routeMode === "FLOOD" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-300">หมายเลขทางหลวง *</label>
              <select
                value={routeNo}
                onChange={(e) => setRouteNo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {!routeNo && <option value="">-- เลือกหมายเลขทางหลวง --</option>}
                {availableHighways.map((h) => (
                  <option key={h.no} value={h.no}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300">ช่วง กม. เริ่มต้น</label>
              <input
                type="text"
                value={kmStart}
                onChange={(e) => setKmStart(e.target.value)}
                placeholder="เช่น 12+500"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300">ช่วง กม. สิ้นสุด</label>
              <input
                type="text"
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="เช่น 14+200"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300">ผูกกับจุดน้ำท่วมอ้างอิง</label>
              <select
                value={detourRefId}
                onChange={(e) => setDetourRefId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {systemData.floodRoutes.length === 0 ? (
                  <option value="">-- ยังไม่มีจุดน้ำท่วมอ้างอิงในระบบ --</option>
                ) : (
                  systemData.floodRoutes.map((f) => (
                    <option key={f.id} value={f.id}>
                      [{f.id}] ทล.{f.route_no} - {f.section_name}
                    </option>
                  ))
                )}
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
        )}

        {/* Section Name & Auto-Geocoding Button */}
        {routeMode === "FLOOD" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-300">ชื่อตอนควบคุม / บริเวณพื้นที่ *</label>
              <button
                type="button"
                disabled={isGeocoding}
                onClick={() => handleAutoGeocode(Number(startLon), Number(startLat))}
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-lg font-heading transition"
              >
                <Navigation className="w-3 h-3" />
                {isGeocoding ? "กำลังระบุพื้นที่..." : "ดึงตำบล/อำเภออัตโนมัติ"}
              </button>
            </div>
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="เช่น ตอน ดอนยาง - บานา (ต.ดอนยาง อ.หนองจิก)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        )}

        {/* 2. Coordinates & Dual-Source Snapping Controls */}
        <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-xs font-heading font-bold text-amber-400 shrink-0">
              ๑. กำหนดจุดเริ่มต้น (A) และ สิ้นสุด (B)
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAdminPickMode("PICK_START")}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-heading transition ${
                  adminPickMode === "PICK_START"
                    ? "bg-amber-500 text-slate-950 font-bold border-amber-400 animate-pulse"
                    : "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                {adminPickMode === "PICK_START" ? "คลิกจุด A..." : "จิ้มจุด A"}
              </button>
              <button
                type="button"
                onClick={() => setAdminPickMode("PICK_END")}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-heading transition ${
                  adminPickMode === "PICK_END"
                    ? "bg-amber-500 text-slate-950 font-bold border-amber-400 animate-pulse"
                    : "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                {adminPickMode === "PICK_END" ? "คลิกจุด B..." : "จิ้มจุด B"}
              </button>
              <button
                type="button"
                onClick={handleSwapEndpoints}
                title="สลับจุดเริ่มต้น (A) ↔ สิ้นสุด (B) และกลับทิศทางเส้นทาง"
                className="text-[11px] px-2.5 py-1 rounded-lg border font-heading transition bg-slate-800 text-sky-300 border-sky-700/60 hover:bg-sky-900/60 flex items-center gap-1 shadow-sm"
              >
                <ArrowRightLeft className="w-3 h-3 text-sky-400" />
                <span>สลับ A ⇄ B</span>
              </button>
            </div>
          </div>

          {/* Lat/Lon Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-400">Lat A (เริ่ม)</span>
              <input
                type="number"
                step="any"
                value={startLat}
                onChange={(e) => setStartLat(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="เช่น 6.8340"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px] placeholder:text-slate-600"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Lon A (เริ่ม)</span>
              <input
                type="number"
                step="any"
                value={startLon}
                onChange={(e) => setStartLon(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="เช่น 101.1860"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px] placeholder:text-slate-600"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Lat B (สิ้นสุด)</span>
              <input
                type="number"
                step="any"
                value={endLat}
                onChange={(e) => setEndLat(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="เช่น 6.8390"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px] placeholder:text-slate-600"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Lon B (สิ้นสุด)</span>
              <input
                type="number"
                step="any"
                value={endLon}
                onChange={(e) => setEndLon(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="เช่น 101.1920"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px] placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Snapping Status Feedback Banner */}
          {snappingStatusText && (
            <div className="p-2.5 rounded-lg bg-sky-950/70 border border-sky-800 text-sky-200 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{snappingStatusText}</span>
            </div>
          )}

          {/* Waypoint Operations & Midpoint Insertion */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow"
              >
                <Wand2 className="w-3.5 h-3.5" /> คำนวณเส้นเกาะถนน
              </button>
              <button
                type="button"
                onClick={handleAddMidpointWaypoint}
                className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-heading text-xs px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> แตะจุดกลางเส้นเพื่อเพิ่มจุด
              </button>
              <button
                type="button"
                onClick={() => setAdminPickMode("ADD_WAYPOINT")}
                className={`text-xs px-3 py-1.5 rounded-lg border font-heading transition ${
                  adminPickMode === "ADD_WAYPOINT"
                    ? "bg-amber-500 text-slate-950 font-bold border-amber-400 animate-pulse"
                    : "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                {adminPickMode === "ADD_WAYPOINT" ? "คลิกถนนเพื่อดัด..." : "+ เพิ่มจุดดัดเส้น"}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleUndoWaypoint}
                className="text-amber-400 hover:underline flex items-center gap-1 font-heading"
              >
                <Undo2 className="w-3 h-3" /> ย้อนกลับ
              </button>
              <button
                type="button"
                onClick={handleClearRoute}
                className="text-red-400 hover:underline font-heading"
              >
                ล้างเส้นร่าง
              </button>
            </div>
          </div>
        </div>

        {/* 3. Auto Detour Advice Generator (If in Detour mode) */}
        {routeMode === "DETOUR" && (
          <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-heading font-bold text-amber-300">
                  คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน
                </label>
                {/* Switch View Tabs */}
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-heading font-bold">
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("FORWARD")}
                    className={`px-2 py-0.5 rounded transition ${
                      detourAdviceView === "FORWARD" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🚗 ขาไป (A → B)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("REVERSE")}
                    className={`px-2 py-0.5 rounded transition ${
                      detourAdviceView === "REVERSE" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🚙 ขากลับ (B → A)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("COMBINED")}
                    className={`px-2 py-0.5 rounded transition ${
                      detourAdviceView === "COMBINED" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📋 ทั้ง ๒ ทิศทาง
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateDetourAdviceClick}
                className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำ (ไป-กลับ)
              </button>
            </div>

            <textarea
              rows={8}
              value={
                detourAdviceView === "FORWARD"
                  ? extractDirectionalAdvice(detourDesc).forward
                  : detourAdviceView === "REVERSE"
                  ? extractDirectionalAdvice(detourDesc).reverse
                  : detourDesc
              }
              onChange={(e) => {
                const val = e.target.value;
                if (detourAdviceView === "FORWARD") {
                  const ext = extractDirectionalAdvice(detourDesc);
                  setDetourDesc(`=== ทิศทางขาไป: จุด A → จุด B ===\n${val}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${ext.reverse}`);
                } else if (detourAdviceView === "REVERSE") {
                  const ext = extractDirectionalAdvice(detourDesc);
                  setDetourDesc(`=== ทิศทางขาไป: จุด A → จุด B ===\n${ext.forward}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${val}`);
                } else {
                  setDetourDesc(val);
                }
              }}
              placeholder="วิเคราะห์คำแนะนำอัตโนมัติ หรือกรอกคำแนะนำทั้ง ๒ ทิศทาง..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 ประชาชนสามารถสลับทิศทางเดินทางได้ทันทีในหน้าหลัก</span>
              <button
                type="button"
                onClick={() => {
                  setDetourAdviceView((prev) => (prev === "FORWARD" ? "REVERSE" : prev === "REVERSE" ? "FORWARD" : "FORWARD"));
                }}
                className="text-amber-400 hover:underline flex items-center gap-1 font-heading"
              >
                <ArrowRightLeft className="w-3 h-3" /> สลับมุมมองทิศทาง
              </button>
            </div>
          </div>
        )}

        {/* 4. Water Level, Status & Safety Measures (If Flood) */}
        {routeMode === "FLOOD" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300">ระดับน้ำท่วมผิวทาง (ซม.) *</label>
                <input
                  type="number"
                  value={routeWaterLevel}
                  onChange={(e) => setRouteWaterLevel(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="เช่น 35 (ระบุเป็นตัวเลข ซม.)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">สถานะสภาพการจราจร</label>
                <select
                  value={routeStatus}
                  onChange={(e: any) => setRouteStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="WARNING">เฝ้าระวัง / รถเล็กผ่านได้ ๑ ช่องทาง</option>
                  <option value="CLOSED">รถเล็กผ่านไม่ได้ / ปิดการจราจรเด็ดขาด</option>
                  <option value="PASSABLE">สถานการณ์คลี่คลาย / ผ่านได้ปกติ</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300">มาตรการอำนวยความปลอดภัย</label>
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

            {/* Image Upload Gallery */}
            <div>
              <label className="text-xs text-slate-300 block mb-1">
                ภาพถ่ายหน้างาน (ไม่เกิน ๑๐ ภาพ บีบอัดอัตโนมัติ &lt; 300KB)
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-xs text-amber-300">
                  <Camera className="w-4 h-4" />
                  <span>เลือกรูปภาพจากเครื่อง / มือถือ</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-400">เลือกแล้ว {fieldImages.length} รูป</span>
              </div>

              {fieldImages.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                  {fieldImages.map((img, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-slate-700 h-16">
                      <img src={img} className="w-full h-full object-cover" alt="field" />
                      <button
                        type="button"
                        onClick={() => setFieldImages(fieldImages.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded p-0.5 text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Route Button */}
        <div className="pt-3 border-t border-slate-800 flex gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmitRoute}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black py-3 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            {routeEditId ? "บันทึกการแก้ไขเหตุการณ์" : "บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ"}
          </button>
          {routeEditId && (
            <button
              type="button"
              onClick={() => {
                setRouteEditId("");
                handleClearRoute();
                if (onClearEditingRoute) onClearEditingRoute();
              }}
              className="bg-slate-800 text-slate-300 px-4 py-3 rounded-xl text-xs font-heading font-semibold"
            >
              ยกเลิก
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

