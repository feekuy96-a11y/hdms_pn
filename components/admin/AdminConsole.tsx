"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  SystemDataPayload,
  FloodRoute,
  DetourRoute,
  MitigationProject,
  DohOfficeLocation,
  MapLineStyleItem,
} from "@/db/default-data";
import {
  saveTimelineUpdateAction,
  upsertRouteAction,
  deleteRouteAction,
  upsertMitigationProjectAction,
  deleteMitigationProjectAction,
  updateHighwayLayerAction,
  setIncidentStatusAction,
  updateMapStyleAction,
  saveOfficeAction,
  deleteOfficeAction,
  updateSystemSettingsAction,
} from "@/app/actions/doh-actions";
import { saveOfflineReport } from "@/lib/offline-db";
import {
  latLonToUtm47N,
  extractExifGps,
  compressImageToBase64,
  calculateRoadSnappedDualSource,
  generateAutoDetourAdvice,
  simplifyCoordinates,
  extractLinesFromGeoJson,
  extractLinesFromKml,
  extractLinesFromKmz,
  extractFeaturesFromGeoJson,
  extractFeaturesFromKml,
  extractFeaturesFromKmz,
  extractAvailableGisFields,
  detectSmartFieldMapping,
  ExtractedGisFeature,
  reverseGeocodeTambonAmphoe,
} from "@/lib/gis-utils";
import {
  APP_CONFIG,
  DOH_SUBDIVISIONS,
  HIGHWAY_ROUTES,
  TRAFFIC_STATUS,
  SAFETY_MEASURES,
  DEFAULT_MAP_STYLES,
  DEFAULT_DOH_OFFICES,
  LINE_STYLE_PRESET_THEMES,
} from "@/lib/constants";
import { OfficialReportDispatchModal } from "./OfficialReportDispatchModal";
import { AnimatedStatusModal } from "@/components/ui/AnimatedStatusModal";
import {
  Settings,
  MapPinned,
  ClipboardList,
  FileSpreadsheet,
  Palette,
  Briefcase,
  Camera,
  Navigation,
  Wand2,
  Trash2,
  Edit,
  Save,
  Layers,
  FileText,
  Printer,
  ShieldCheck,
  RotateCcw,
  Upload,
  Undo2,
  Plus,
  Search,
  CheckCircle2,
  Phone,
  Building,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Tag,
  MapPin,
} from "lucide-react";

export type AdminTab = "system" | "map" | "incidents" | "routes" | "style" | "projects";

interface AdminConsoleProps {
  systemData: SystemDataPayload;
  onDataRefresh: (newData: SystemDataPayload) => void;
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  onFocusCoordinates?: (coords: [number, number]) => void;
  onToast: (msg: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
}

export function AdminConsole({
  systemData,
  onDataRefresh,
  adminPickMode,
  setAdminPickMode,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  pickedCoordinate,
  onFocusCoordinates,
  onToast,
  setIncomingGisLines,
}: AdminConsoleProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>("incidents");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  // Animated Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: "success" | "delete" | "error" | "confirm" | "info";
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const showSuccessModal = (title: string, message: string) => {
    setModalState({ isOpen: true, type: "success", title, message });
  };

  const showConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setModalState({ isOpen: true, type: "confirm", title, message, onConfirm });
  };

  // =========================================================================
  // 1. SYSTEM SETTINGS & OFFICES STATE
  // =========================================================================
  const [sysName, setSysName] = useState(systemData.systemSettings?.name || APP_CONFIG.TITLE);
  const [sysOrg, setSysOrg] = useState(systemData.systemSettings?.org || APP_CONFIG.ORGANIZATION);
  const [sysDesc, setSysDesc] = useState(
    systemData.systemSettings?.desc || "ระบบติดตามและรายงานสถานการณ์อุทกภัย เส้นทางน้ำท่วมและทางเลี่ยงแบบเรียลไทม์"
  );
  const [sysPhone, setSysPhone] = useState(systemData.systemSettings?.phone || APP_CONFIG.HOTLINE);

  // Office CRUD Form
  const [officeEditId, setOfficeEditId] = useState<string>("");
  const [officeName, setOfficeName] = useState("");
  const [officeType, setOfficeType] = useState<"HEADQUARTERS" | "SUBDIVISION" | "SERVICE_POINT">("SUBDIVISION");
  const [officeAddress, setOfficeAddress] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeLat, setOfficeLat] = useState<number>(6.8665);
  const [officeLon, setOfficeLon] = useState<number>(101.2505);
  const [isOfficeFormOpen, setIsOfficeFormOpen] = useState(false);

  // =========================================================================
  // 2. MAP MANAGEMENT (ADD FLOOD & DETOUR) STATE
  // =========================================================================
  const [routeMode, setRouteMode] = useState<"FLOOD" | "DETOUR">("FLOOD");
  const [routeEditId, setRouteEditId] = useState("");
  const [routeNo, setRouteNo] = useState("42");
  const [kmStart, setKmStart] = useState("12+500");
  const [kmEnd, setKmEnd] = useState("14+200");
  const [sectionName, setSectionName] = useState("");
  const [routeWaterLevel, setRouteWaterLevel] = useState(35);
  const [routeStatus, setRouteStatus] = useState<"CLOSED" | "WARNING" | "PASSABLE">("WARNING");
  const [selectedMeasure, setSelectedMeasure] = useState<string>(SAFETY_MEASURES[0]);
  const [reporterName, setReporterName] = useState("นายช่างหัวหน้าหมวดทางหลวง");
  const [subdivisionName, setSubdivisionName] = useState("หมวดทางหลวงปัตตานี");
  const [fieldImages, setFieldImages] = useState<string[]>([]);
  const [snappingStatusText, setSnappingStatusText] = useState("");

  // Detour specifics
  const [detourRefId, setDetourRefId] = useState(systemData.floodRoutes[0]?.id || "F-001");
  const [detourName, setDetourName] = useState("");
  const [detourDesc, setDetourDesc] = useState("");

  // Route Stations
  const [startLat, setStartLat] = useState(6.842);
  const [startLon, setStartLon] = useState(101.242);
  const [endLat, setEndLat] = useState(6.8485);
  const [endLon, setEndLon] = useState(101.268);

  // =========================================================================
  // 3. INCIDENT REGISTRY & FILTER STATE
  // =========================================================================
  const [incidentSearch, setIncidentSearch] = useState("");
  const [incidentFilter, setIncidentFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ACTIVE");

  // Quick water update dialog
  const [updateModalIncident, setUpdateModalIncident] = useState<FloodRoute | null>(null);
  const [newWaterLevel, setNewWaterLevel] = useState<number>(30);
  const [updateNote, setUpdateNote] = useState("");
  const [updatePhoto, setUpdatePhoto] = useState<string | null>(null);

  // =========================================================================
  // 4. GIS ROUTE DATA IMPORT & ATTRIBUTE FIELD MAPPING STATE
  // =========================================================================
  const [simplifyTolerance, setSimplifyTolerance] = useState(0.00008);
  const [importedLayerName, setImportedLayerName] = useState("");
  const [importedLayerDesc, setImportedLayerDesc] = useState("");
  const [importedPreviewLines, setImportedPreviewLines] = useState<[number, number][][]>([]);
  const [importedGisFeatures, setImportedGisFeatures] = useState<ExtractedGisFeature[]>([]);
  const [availableGisFields, setAvailableGisFields] = useState<string[]>([]);
  const [selectedRouteCodeField, setSelectedRouteCodeField] = useState("");
  const [selectedRouteNameField, setSelectedRouteNameField] = useState("");
  const [selectedRouteTypeField, setSelectedRouteTypeField] = useState("");
  const [manualRouteCode, setManualRouteCode] = useState("");
  const [manualRouteName, setManualRouteName] = useState("");
  const [targetLayerCategory, setTargetLayerCategory] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | "AUTO">("MAIN_HIGHWAY");
  const [labelDisplayMode, setLabelDisplayMode] = useState<"hover" | "permanent" | "click">("hover");

  // =========================================================================
  // 5. LINE STYLING STUDIO STATE
  // =========================================================================
  const [selectedStyleKey, setSelectedStyleKey] = useState<"flood" | "detour" | "primary" | "secondary">("flood");
  const [lineStyles, setLineStyles] = useState<Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem>>(
    systemData.mapStyles || DEFAULT_MAP_STYLES
  );

  // =========================================================================
  // 6. MITIGATION PROJECTS (GOVERNOR BRIEFING) STATE
  // =========================================================================
  const [projId, setProjId] = useState("");
  const [projRouteNo, setProjRouteNo] = useState("42");
  const [projKmRange, setProjKmRange] = useState("");
  const [projLocation, setProjLocation] = useState("");
  const [projStatus, setProjStatus] = useState<"COMPLETED" | "PENDING_BUDGET">("COMPLETED");
  const [projBudget, setProjBudget] = useState(30.0);
  const [projSolution, setProjSolution] = useState("");
  const [projBeforeImg, setProjBeforeImg] = useState("");
  const [projAfterImg, setProjAfterImg] = useState("");

  // =========================================================================
  // REACTIVE MAP COORDINATE LISTENER
  // =========================================================================
  useEffect(() => {
    if (!pickedCoordinate) return;
    const { lat, lon, mode } = pickedCoordinate;

    if (mode === "PICK_START") {
      setStartLat(lat);
      setStartLon(lon);
      onToast(`กำหนดจุดเริ่มต้น (A): (${lat}, ${lon})`);
      triggerDualRoadSnapping(lat, lon, endLat, endLon, draftWaypoints);
    } else if (mode === "PICK_END") {
      setEndLat(lat);
      setEndLon(lon);
      onToast(`กำหนดจุดสิ้นสุด (B): (${lat}, ${lon})`);
      triggerDualRoadSnapping(startLat, startLon, lat, lon, draftWaypoints);
    } else if (mode === "ADD_WAYPOINT") {
      const nextWp: [number, number][] = [...draftWaypoints, [lon, lat]];
      setDraftWaypoints(nextWp);
      onToast(`เพิ่มจุดดัดเส้นทาง #${nextWp.length} (ลากหมุดเพื่อปรับแนวถนน)`);
      triggerDualRoadSnapping(startLat, startLon, endLat, endLon, nextWp);
    } else if (mode === "OFFICE_PIN") {
      setOfficeLat(lat);
      setOfficeLon(lon);
      onToast(`กำหนดพิกัดสำนักงาน: (${lat}, ${lon})`);
      setAdminPickMode(null);
    }
  }, [pickedCoordinate]);

  // Dual-source road snapping helper
  const triggerDualRoadSnapping = async (
    sLat: number,
    sLon: number,
    eLat: number,
    eLon: number,
    waypoints: [number, number][]
  ) => {
    if (!sLat || !sLon || !eLat || !eLon) return;
    setSnappingStatusText("กำลังประมวลผลดัดเส้นทางเกาะถนน (Dual-Source Snapping)...");
    const result = await calculateRoadSnappedDualSource(
      [sLon, sLat],
      [eLon, eLat],
      waypoints,
      systemData.highwayLayers
    );
    setDraftCoordinates(result.coords);
    setSnappingStatusText(result.message);
    onToast(result.message);

    // If in Detour mode, auto generate detour advice text
    if (routeMode === "DETOUR" && (!detourDesc || detourDesc.length < 10)) {
      const autoAdvice = generateAutoDetourAdvice([sLon, sLat], [eLon, eLat], result.coords, routeNo);
      setDetourDesc(autoAdvice);
    }
  };

  // Reverse geocoding helper
  const handleAutoGeocode = async (lon: number, lat: number) => {
    setIsGeocoding(true);
    onToast("กำลังเรียกข้อมูลระบุตำบล/อำเภอ จาก Longdo Map API...");
    try {
      const geo = await reverseGeocodeTambonAmphoe(lon, lat);
      if (geo && (geo.subdistrict || geo.district)) {
        const text = `ต.${geo.subdistrict || "-"} อ.${geo.district || "-"} จ.${geo.province || "ปัตตานี"}`;
        setSectionName(text);
        showSuccessModal("ดึงพื้นที่อัตโนมัติสำเร็จ", `ระบุพื้นที่: ${text}`);
      } else {
        onToast("ไม่สามารถระบุพื้นที่อัตโนมัติได้ สามารถกรอกเองได้");
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Add Midpoint Waypoint (แตะจุดกลางเส้นเพื่อเพิ่มจุดดัด)
  const handleAddMidpointWaypoint = () => {
    if (draftCoordinates.length < 2) {
      onToast("ต้องมีแนวเส้นทางอย่างน้อย ๒ จุดก่อนเพิ่มจุดกึ่งกลาง");
      return;
    }
    const midIdx = Math.floor(draftCoordinates.length / 2);
    const midPoint = draftCoordinates[midIdx];
    const nextWp: [number, number][] = [...draftWaypoints, midPoint];
    setDraftWaypoints(nextWp);
    triggerDualRoadSnapping(startLat, startLon, endLat, endLon, nextWp);
    showSuccessModal("เพิ่มจุดดัดกึ่งกลางเส้นแล้ว", `เพิ่มหมุดตัวเลข #${nextWp.length} บนเส้นทาง ท่านสามารถลากหมุดเพื่อดัดเส้นได้ทันที`);
  };

  // Undo Last Waypoint
  const handleUndoWaypoint = () => {
    if (draftWaypoints.length > 0) {
      const next = draftWaypoints.slice(0, -1);
      setDraftWaypoints(next);
      triggerDualRoadSnapping(startLat, startLon, endLat, endLon, next);
      onToast("ย้อนกลับ ๑ จุดดัดเส้น");
    }
  };

  // Clear Draft Route
  const handleClearRoute = () => {
    setDraftCoordinates([]);
    setDraftWaypoints([]);
    setSnappingStatusText("");
    onToast("ล้างแนวเส้นร่างเรียบร้อย");
  };

  // Auto Detour Generator Click
  const handleGenerateDetourAdviceClick = () => {
    const advice = generateAutoDetourAdvice([startLon, startLat], [endLon, endLat], draftCoordinates, routeNo);
    setDetourDesc(advice);
    showSuccessModal("วิเคราะห์เส้นทางเลี่ยงสำเร็จ", advice);
  };

  // Image Upload with Canvas Compression
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (fieldImages.length + files.length > 10) {
      onToast("อัปโหลดภาพถ่ายได้ไม่เกิน ๑๐ ภาพต่อเหตุการณ์");
      return;
    }

    onToast("กำลังบีบอัดภาพถ่ายหน้างาน (< 300KB)...");
    const newImgs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const b64 = await compressImageToBase64(files[i], 1200, 0.75);
        newImgs.push(b64);
        // Extract GPS from the first image if coordinates are not set
        if (i === 0) {
          const gps = await extractExifGps(files[i]);
          if (gps) {
            setStartLat(gps.latitude);
            setStartLon(gps.longitude);
            onToast(`สกัดพิกัด GPS จากภาพ: (${gps.latitude}, ${gps.longitude})`);
          }
        }
      } catch (err) {}
    }
    setFieldImages([...fieldImages, ...newImgs]);
    showSuccessModal("ประมวลผลรูปภาพสำเร็จ", `นำเข้ารูปภาพหน้างาน ${newImgs.length} รูป บีบอัดพร้อมส่งขึ้นระบบ`);
  };

  // Submit Flood or Detour Route
  const handleSubmitRoute = async () => {
    if (!sectionName && routeMode === "FLOOD") {
      onToast("กรุณาระบุชื่อตอนควบคุมหรือบริเวณที่เกิดเหตุ");
      return;
    }
    if (draftCoordinates.length < 2 && (!startLat || !endLat)) {
      onToast("กรุณากำหนดจุดพิกัดเริ่มต้นและสิ้นสุดบนแผนที่");
      return;
    }

    setIsSubmitting(true);
    try {
      const coords = (draftCoordinates.length >= 2 ? draftCoordinates : [[startLon, startLat], [endLon, endLat]]) as [number, number][];
      const res = await upsertRouteAction({
        id: routeEditId || undefined,
        recordType: routeMode,
        routeNo,
        kmStart,
        kmEnd,
        sectionName: sectionName || "จุดรายงานน้ำท่วม",
        waterLevelCm: routeWaterLevel,
        trafficStatus: routeStatus,
        detourRefId,
        detourName: detourName || "เส้นทางเลี่ยงน้ำท่วม",
        detourDesc,
        latStart: startLat,
        lonStart: startLon,
        latEnd: endLat,
        lonEnd: endLon,
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
        setActiveTab("incidents");
      }
    } catch (err: any) {
      setModalState({
        isOpen: true,
        type: "error",
        title: "เกิดข้อผิดพลาดในการบันทึก",
        message: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load Route Into Form
  const loadRouteIntoForm = (type: "FLOOD" | "DETOUR", id: string) => {
    setRouteMode(type);
    setRouteEditId(id);
    setActiveTab("map");

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
      if (Array.isArray(flood.coordinates_json)) coords = flood.coordinates_json;
      else {
        try {
          coords = JSON.parse(flood.coordinates_json as any);
        } catch (e) {}
      }
      setDraftCoordinates(coords);
      setDraftWaypoints([]);
      if (flood.lon_start && flood.lat_start) {
        onFocusCoordinates?.([flood.lon_start, flood.lat_start]);
      }
      onToast(`โหลดข้อมูลสายทาง [${id}] เข้าสู่ฟอร์มแก้ไข`);
    } else {
      const detour = systemData.detourRoutes.find((d) => d.id === id);
      if (!detour) return;
      setDetourRefId(detour.flood_id_ref);
      setDetourName(detour.route_name);
      setDetourDesc(detour.description || "");
      setStartLat(detour.lat_start);
      setStartLon(detour.lon_start);
      setEndLat(detour.lat_end);
      setEndLon(detour.lon_end);

      let coords: [number, number][] = [];
      if (Array.isArray(detour.coordinates_json)) coords = detour.coordinates_json;
      else {
        try {
          coords = JSON.parse(detour.coordinates_json as any);
        } catch (e) {}
      }
      setDraftCoordinates(coords);
      setDraftWaypoints([]);
      if (detour.lon_start && detour.lat_start) {
        onFocusCoordinates?.([detour.lon_start, detour.lat_start]);
      }
      onToast(`โหลดข้อมูลทางเลี่ยง [${id}] เข้าสู่ฟอร์มแก้ไข`);
    }
  };

  // Toggle Incident Active Status (คืนสภาพปกติ / เปิดใหม่)
  const handleToggleIncidentStatus = (id: string, currentActive: boolean) => {
    const nextStatus = !currentActive;
    const title = nextStatus ? "ยืนยันการเปิดเหตุการณ์อีกครั้ง?" : "ยืนยันการคืนสภาพปกติ?";
    const msg = nextStatus
      ? `เหตุการณ์ [${id}] จะกลับมาแสดงเป็นจุดเฝ้าระวัง/น้ำท่วมบนแผนที่ประชาชน`
      : `เหตุการณ์ [${id}] จะถูกบันทึกว่าสถานการณ์คลี่คลายแล้ว และถูกซ่อนจากแผนที่ประชาชน`;

    showConfirmModal(title, msg, async () => {
      try {
        const res = await setIncidentStatusAction(id, nextStatus);
        if (res.success) {
          onDataRefresh(res.systemData);
          showSuccessModal(
            nextStatus ? "เปิดเหตุการณ์สำเร็จ" : "คืนสภาพปกติสำเร็จ",
            nextStatus ? `เหตุการณ์ [${id}] แสดงบนแผนที่ประชาชนเรียบร้อย` : `เหตุการณ์ [${id}] ถูกจัดเก็บเข้าแฟ้มประวัติเรียบร้อย`
          );
        }
      } catch (err: any) {
        onToast("ข้อผิดพลาด: " + err.message);
      }
    });
  };

  // Delete Route
  const handleDeleteRoute = (type: "FLOOD" | "DETOUR", id: string) => {
    showConfirmModal(
      "ยืนยันการลบข้อมูลเส้นทาง?",
      `ท่านกำลังจะลบรายการ [${id}] ออกจากฐานข้อมูลระบบอย่างถาวร ข้อมูลจะไม่สามารถกู้คืนได้`,
      async () => {
        try {
          const res = await deleteRouteAction(type, id);
          if (res.success) {
            onDataRefresh(res.systemData);
            if (routeEditId === id) {
              setRouteEditId("");
              handleClearRoute();
            }
            showSuccessModal("ลบข้อมูลสำเร็จ", `ลบรายการ [${id}] ออกจากระบบเรียบร้อย`);
          }
        } catch (err: any) {
          onToast("ข้อผิดพลาดในการลบ: " + err.message);
        }
      }
    );
  };

  // Submit Water Level Quick Update
  const handleSubmitQuickUpdate = async () => {
    if (!updateModalIncident) return;
    setIsSubmitting(true);
    try {
      const res = await saveTimelineUpdateAction({
        floodId: updateModalIncident.id,
        waterLevelCm: newWaterLevel,
        trafficStatus: newWaterLevel >= 40 ? "CLOSED" : newWaterLevel > 15 ? "WARNING" : "PASSABLE",
        latitude: updateModalIncident.lat_start,
        longitude: updateModalIncident.lon_start,
        reporterName: `${subdivisionName} (${reporterName})`,
        remark: updateNote ? `${selectedMeasure} (${updateNote})` : selectedMeasure,
        photoUrl: updatePhoto || undefined,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setUpdateModalIncident(null);
        setUpdatePhoto(null);
        setUpdateNote("");
        showSuccessModal(
          "อัปเดตระดับน้ำสำเร็จ",
          `บันทึกระดับน้ำใหม่ ${newWaterLevel} ซม. เข้าสู่ระบบสารสนเทศกรมทางหลวงเรียบร้อย`
        );
      }
    } catch (err: any) {
      onToast("ข้อผิดพลาด: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export CSV Helper
  const handleExportCsv = () => {
    const headers = [
      "รหัสเหตุการณ์",
      "เลขสายทาง",
      "ชื่อตอนควบคุม/พื้นที่",
      "ช่วง กม.",
      "ระดับน้ำ (ซม.)",
      "สถานะจราจร",
      "สถานะเหตุการณ์",
      "พิกัด ละติจูด",
      "พิกัด ลองจิจูด",
      "อัปเดตล่าสุด",
    ];

    const rows = (systemData.floodRoutes || []).map((r) => [
      `"${r.id}"`,
      `"${r.route_no}"`,
      `"${(r.section_name || "").replace(/"/g, '""')}"`,
      `"${r.km_start} - ${r.km_end}"`,
      r.water_level_cm,
      `"${r.traffic_status}"`,
      r.is_active ? '"กำลังเกิดเหตุ"' : '"คืนสภาพปกติแล้ว"',
      r.lat_start,
      r.lon_start,
      `"${r.updated_at}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `DOH_Pattani_Flood_Incidents_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccessModal("ส่งออกข้อมูลสำเร็จ", "ดาวน์โหลดประวัติเหตุการณ์น้ำท่วมทั้งหมดเป็นไฟล์ CSV (เปิดใน Excel ได้) เรียบร้อย");
  };

  // Office Save
  const handleSaveOffice = async () => {
    if (!officeName || !officeAddress) {
      onToast("กรุณากรอกชื่อสำนักงานและที่อยู่");
      return;
    }
    const id = officeEditId || "OFFICE_" + Date.now().toString().slice(-4);
    const office: DohOfficeLocation = {
      id,
      name: officeName,
      type: officeType,
      address: officeAddress,
      phone: officePhone || APP_CONFIG.HOTLINE,
      lat: officeLat,
      lon: officeLon,
      is_active: true,
    };

    try {
      const res = await saveOfficeAction(office);
      if (res.success) {
        onDataRefresh(res.systemData);
        setIsOfficeFormOpen(false);
        setOfficeEditId("");
        setOfficeName("");
        setOfficeAddress("");
        setOfficePhone("");
        showSuccessModal(officeEditId ? "แก้ไขหมุดสำนักงานสำเร็จ" : "เพิ่มหมุดสำนักงานสำเร็จ", `${office.name} ปักหมุดบนแผนที่พร้อมแสดงต่อประชาชน`);
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    }
  };

  // Office Delete
  const handleDeleteOffice = (officeId: string) => {
    showConfirmModal("ยืนยันการลบหมุดสำนักงาน?", `ท่านกำลังจะลบหมุด [${officeId}] ออกจากแผนที่ประชาชน`, async () => {
      try {
        const res = await deleteOfficeAction(officeId);
        if (res.success) {
          onDataRefresh(res.systemData);
          showSuccessModal("ลบหมุดสำนักงานเรียบร้อย", `ลบหมุด [${officeId}] สำเร็จ`);
        }
      } catch (e: any) {
        onToast("ข้อผิดพลาด: " + e.message);
      }
    });
  };

  // Update Current Selected Line Style (Real-time sync)
  const handleUpdateCurrentStyle = (patch: Partial<MapLineStyleItem>) => {
    const current = lineStyles[selectedStyleKey] || DEFAULT_MAP_STYLES[selectedStyleKey];
    const nextItem: MapLineStyleItem = { ...current, ...patch };
    const nextStyles = {
      ...lineStyles,
      [selectedStyleKey]: nextItem,
    };
    setLineStyles(nextStyles);
    // Real-time map update
    if (systemData) {
      systemData.mapStyles = nextStyles;
    }
  };

  // Apply Preset Line Style Theme
  const handleApplyPresetTheme = (theme: (typeof LINE_STYLE_PRESET_THEMES)[0]) => {
    const next = { ...theme.styles };
    setLineStyles(next);
    if (systemData) {
      systemData.mapStyles = next;
    }
    showSuccessModal(
      "ปรับชุดสไตล์สำเร็จ",
      `เปิดใช้งาน "${theme.name}" แล้ว เส้นบนแผนที่จะสะท้อนสีใหม่ทันที กรุณากด "บันทึกสไตล์เส้น" เพื่อจัดเก็บถาวร`
    );
  };

  // Reset Styles to Default
  const handleResetStylesToDefault = () => {
    setLineStyles(DEFAULT_MAP_STYLES);
    if (systemData) {
      systemData.mapStyles = DEFAULT_MAP_STYLES;
    }
    onToast("รีเซ็ตสไตล์เส้นเป็นค่าเริ่มต้นกรมทางหลวงเรียบร้อย");
  };

  // Save Line Styles
  const handleSaveLineStyles = async () => {
    try {
      const res = await updateMapStyleAction(lineStyles);
      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("บันทึกสไตล์เส้นสำเร็จ", "เส้นบนแผนที่ของหน้าประชาชนทุกคนจะเปลี่ยนตามนี้ทันที");
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    }
  };

  // Handle GIS File Upload (KML, KMZ, Shapefile .zip, GeoJSON, GPX)
  const handleGisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onToast(`กำลังตรวจสอบและวิเคราะห์โครงข่าย ${file.name}...`);
    try {
      let extractedFeatures: ExtractedGisFeature[] = [];
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".kmz")) {
        extractedFeatures = await extractFeaturesFromKmz(file);
      } else if (lower.endsWith(".kml")) {
        const text = await file.text();
        extractedFeatures = extractFeaturesFromKml(text);
      } else if (lower.endsWith(".zip")) {
        const shp = (await import("shpjs")).default;
        const buf = await file.arrayBuffer();
        const geojson = await shp(buf);
        extractedFeatures = extractFeaturesFromGeoJson(geojson);
      } else {
        const text = await file.text();
        const geojson = JSON.parse(text);
        extractedFeatures = extractFeaturesFromGeoJson(geojson);
      }

      if (extractedFeatures.length === 0) {
        throw new Error("ไม่พบแนวเส้นทาง (LineString) ในไฟล์ หรือรูปแบบพิกัดไม่ใช่ WGS84");
      }

      // Simplify coordinates with Douglas-Peucker
      const decimatedFeatures = extractedFeatures.map((f) => ({
        ...f,
        coords: simplifyCoordinates(f.coords, simplifyTolerance),
      }));

      setImportedGisFeatures(decimatedFeatures);
      const decimatedLines = decimatedFeatures.map((f) => f.coords);
      setImportedPreviewLines(decimatedLines);
      setIncomingGisLines?.(decimatedLines);

      // Extract all property fields
      const fields = extractAvailableGisFields(decimatedFeatures);
      setAvailableGisFields(fields);

      // Auto-detect smart mapping
      const smart = detectSmartFieldMapping(fields);
      setSelectedRouteCodeField(smart.routeCodeField);
      setSelectedRouteNameField(smart.routeNameField);
      setSelectedRouteTypeField(smart.routeTypeField);

      // Auto layer name
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setImportedLayerName(cleanName);
      setImportedLayerDesc(`นำเข้าจากไฟล์ ${file.name} เมื่อ ${new Date().toLocaleDateString("th-TH")}`);

      showSuccessModal(
        "ตรวจสอบโครงข่ายสำเร็จ (Dual-Color Preview)",
        `พบเส้นทาง ${decimatedFeatures.length} เส้นในไฟล์ และตรวจพบ ${fields.length} ฟิลด์ข้อมูล ระบบแสดงเส้นสีน้ำเงินตรวจสอบบนแผนที่แล้ว`
      );
    } catch (err: any) {
      setModalState({
        isOpen: true,
        type: "error",
        title: "ไฟล์ข้อมูลไม่ถูกต้อง",
        message: err.message || "กรุณาตรวจสอบระบบพิกัด EPSG:4326 (WGS84) และชนิดข้อมูลต้องเป็น LineString",
      });
    }
  };

  // Re-simplify tolerance on demand
  const handleResimplifyTolerance = (newTol: number) => {
    setSimplifyTolerance(newTol);
    if (importedGisFeatures.length > 0) {
      const reDecimated = importedGisFeatures.map((f) => ({
        ...f,
        coords: simplifyCoordinates(f.coords, newTol),
      }));
      setImportedGisFeatures(reDecimated);
      const lines = reDecimated.map((f) => f.coords);
      setImportedPreviewLines(lines);
      setIncomingGisLines?.(lines);
    }
  };

  // Commit GIS Layer to System
  const handleCommitGisLayer = async () => {
    if (!importedGisFeatures || importedGisFeatures.length === 0) {
      onToast("ยังไม่มีข้อมูลเส้นทางที่นำเข้า");
      return;
    }
    const isSec = targetLayerCategory === "SECOND_HIGHWAY";
    const layerId = isSec ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY";
    const colorHex = isSec ? (lineStyles.secondary?.color || "#0284c7") : (lineStyles.primary?.color || "#1B5E20");
    const lineWidth = isSec ? (lineStyles.secondary?.weight || 3.5) : (lineStyles.primary?.weight || 5);

    const geojsonData = {
      type: "FeatureCollection",
      features: importedGisFeatures.map((f, idx) => {
        const props = f.properties || {};
        const code = selectedRouteCodeField ? (props[selectedRouteCodeField] || manualRouteCode || `สายทางที่ ${idx + 1}`) : (manualRouteCode || `สายทางที่ ${idx + 1}`);
        const name = selectedRouteNameField ? (props[selectedRouteNameField] || manualRouteName || importedLayerName) : (manualRouteName || importedLayerName);
        const type = selectedRouteTypeField ? (props[selectedRouteTypeField] || targetLayerCategory) : targetLayerCategory;

        return {
          type: "Feature",
          properties: {
            ...props,
            route_code: String(code).trim(),
            route_name: String(name).trim(),
            route_type: type,
            description: importedLayerDesc || "โครงข่ายสายทางกรมทางหลวง",
            length_km: f.lengthKm,
            points_count: f.coords.length,
            layer_name: importedLayerName,
            label_mode: labelDisplayMode,
          },
          geometry: { type: "LineString", coordinates: f.coords },
        };
      }),
    };

    try {
      const res = await updateHighwayLayerAction({
        layerId,
        layerName: importedLayerName || (isSec ? "ทางหลวงสายรอง" : "ทางหลวงสายหลัก"),
        colorHex,
        lineWidth,
        geojsonData,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setImportedPreviewLines([]);
        setImportedGisFeatures([]);
        setIncomingGisLines?.([]);
        setImportedLayerName("");
        setImportedLayerDesc("");
        setAvailableGisFields([]);
        showSuccessModal(
          "บันทึกโครงข่ายสายทางสำเร็จ",
          `โครงข่ายจำนวน ${geojsonData.features.length} เส้นทาง พร้อมป้ายกำกับชื่อสายทาง ถูกจัดเก็บและแสดงบนแผนที่เรียบร้อยแล้ว`
        );
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    }
  };

  // Filtered Incidents
  const filteredIncidents = (systemData.floodRoutes || []).filter((r) => {
    const matchSearch =
      r.route_no.toLowerCase().includes(incidentSearch.toLowerCase()) ||
      r.section_name.toLowerCase().includes(incidentSearch.toLowerCase());
    const matchStatus =
      incidentFilter === "ALL"
        ? true
        : incidentFilter === "ACTIVE"
        ? r.is_active
        : !r.is_active;
    return matchSearch && matchStatus;
  });

  const activeCount = (systemData.floodRoutes || []).filter((r) => r.is_active).length;
  const resolvedCount = (systemData.floodRoutes || []).filter((r) => !r.is_active).length;
  const totalCount = (systemData.floodRoutes || []).length;

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 font-body overflow-hidden select-none">
      {/* ===================================================================== */}
      {/* 1. LEFT AUTHENTIC SIDEBAR (Matching reference site)                   */}
      {/* ===================================================================== */}
      <aside
        className={`hidden shrink-0 flex-col text-white transition-[width] duration-200 lg:flex ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
        style={{ background: "linear-gradient(180deg, #071B3D, #0B2A5B)" }}
      >
        {/* Sidebar Header Brand */}
        <div className="flex h-16 items-center border-b border-white/10 gap-3 px-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20 shadow">
            <ShieldCheck className="h-5 w-5 text-yellow-300" />
          </span>
          {!isSidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">แขวงทางหลวงปัตตานี</p>
              <p className="text-[11px] text-yellow-300 font-mono">Admin Console</p>
            </div>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {/* 1. จัดการระบบ */}
          <button
            type="button"
            title="จัดการระบบ"
            onClick={() => setActiveTab("system")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "system"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold">จัดการระบบ</span>
                <span className="block text-[11px] text-white/50">โลโก้ / ข้อมูล / สำนักงาน</span>
              </span>
            )}
          </button>

          {/* 2. จัดการแผนที่ */}
          <button
            type="button"
            title="จัดการแผนที่"
            onClick={() => setActiveTab("map")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "map"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MapPinned className="h-5 w-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold">จัดการแผนที่</span>
                <span className="block text-[11px] text-white/50">เพิ่มน้ำท่วม / ดัดเส้นทาง</span>
              </span>
            )}
          </button>

          {/* 3. รายการเหตุการณ์ */}
          <button
            type="button"
            title="รายการเหตุการณ์"
            onClick={() => setActiveTab("incidents")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "incidents"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <ClipboardList className="h-5 w-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold">รายการเหตุการณ์</span>
                <span className="block text-[11px] text-white/50">ตาราง / ส่งออก CSV</span>
              </span>
            )}
          </button>

          {/* 4. ข้อมูลเส้นทาง */}
          <button
            type="button"
            title="ข้อมูลเส้นทาง"
            onClick={() => setActiveTab("routes")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "routes"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <FileSpreadsheet className="h-5 w-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold">ข้อมูลเส้นทาง</span>
                <span className="block text-[11px] text-white/50">นำเข้า KML / KMZ / SHP</span>
              </span>
            )}
          </button>

          {/* 5. สไตล์เส้น */}
          <button
            type="button"
            title="สไตล์เส้น"
            onClick={() => setActiveTab("style")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "style"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Palette className="h-5 w-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold">สไตล์เส้น</span>
                <span className="block text-[11px] text-white/50">สี / เอฟเฟกต์ไฟวิ่ง</span>
              </span>
            )}
          </button>

          {/* 6. โครงการผู้ว่าฯ */}
          <button
            type="button"
            title="โครงการผู้ว่าฯ"
            onClick={() => setActiveTab("projects")}
            className={`flex w-full items-center rounded-xl py-2.5 text-left transition gap-3 px-3 ${
              activeTab === "projects"
                ? "bg-white/15 shadow-[inset_3px_0_0_#FBC02D] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Briefcase className="h-5 w-5 shrink-0 text-amber-400" />
            {!isSidebarCollapsed && (
              <span>
                <span className="block text-sm font-semibold text-amber-300">โครงการผู้ว่าฯ</span>
                <span className="block text-[11px] text-white/50">งบ ๑๔๕ ลบ. / รง.ทล.๐๑</span>
              </span>
            )}
          </button>
        </nav>

        {/* Sidebar Footer Collapse Toggle */}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!isSidebarCollapsed && <span>ย่อเมนู</span>}
          </button>
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* 2. MAIN ADMIN CONTENT AREA                                            */}
      {/* ===================================================================== */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900 border-l border-slate-800">
        {/* Mobile Subtab Header Switcher (for small screens) */}
        <div className="lg:hidden flex items-center justify-between bg-slate-950 p-2.5 border-b border-slate-800 overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab("system")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "system" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            ระบบ
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "map" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            แผนที่
          </button>
          <button
            onClick={() => setActiveTab("incidents")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "incidents" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            เหตุการณ์
          </button>
          <button
            onClick={() => setActiveTab("routes")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "routes" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            เส้นทาง
          </button>
          <button
            onClick={() => setActiveTab("style")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "style" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            สไตล์เส้น
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={`px-2 py-1 rounded text-xs font-heading shrink-0 ${
              activeTab === "projects" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            ผู้ว่าฯ
          </button>
        </div>

        {/* Content Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* ================================================================= */}
          {/* TAB 1: จัดการระบบ (SYSTEM & OFFICES)                               */}
          {/* ================================================================= */}
          {activeTab === "system" && (
            <div className="space-y-6 max-w-3xl">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" /> ข้อมูลระบบและหน่วยงาน
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  กำหนดชื่อระบบ ข้อมูลติดต่อส่วนราชการ และปักหมุดสำนักงานแขวงและหมวดทางหลวง
                </p>
              </div>

              {/* System Metadata Form */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <h3 className="font-heading font-bold text-sm text-amber-300">ข้อมูลทั่วไปและเบอร์โทรฉุกเฉิน</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300">ชื่อระบบทางการ *</label>
                    <input
                      type="text"
                      value={sysName}
                      onChange={(e) => setSysName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">ชื่อหน่วยงานราชการ *</label>
                    <input
                      type="text"
                      value={sysOrg}
                      onChange={(e) => setSysOrg(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">สายด่วน / เบอร์ติดต่อประสานงาน</label>
                    <input
                      type="text"
                      value={sysPhone}
                      onChange={(e) => setSysPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">คำอธิบายระบบโดยย่อ</label>
                    <input
                      type="text"
                      value={sysDesc}
                      onChange={(e) => setSysDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await updateSystemSettingsAction({
                        name: sysName,
                        org: sysOrg,
                        desc: sysDesc,
                        phone: sysPhone,
                      });
                      if (res.success) {
                        onDataRefresh(res.systemData);
                        showSuccessModal("บันทึกข้อมูลระบบเรียบร้อย", "ข้อมูลชื่อระบบและเบอร์ติดต่อจะแสดงบนหน้าประชาชนทันที");
                      }
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow-md transition"
                  >
                    บันทึกข้อมูลระบบ
                  </button>
                </div>
              </div>

              {/* Office & Service Points Management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                      <Building className="w-4 h-4 text-sky-400" /> หมุดสำนักงาน / จุดบริการ (Offices & Service Points)
                    </h3>
                    <p className="text-xs text-slate-400">
                      แสดงเป็นไอคอนอาคารบนแผนที่ประชาชน (แตะดูที่อยู่ เบอร์โทรตรง และปุ่มนำทาง GPS)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOfficeEditId("");
                      setOfficeName("");
                      setOfficeAddress("");
                      setOfficePhone("");
                      setIsOfficeFormOpen(true);
                    }}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition shadow"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มสำนักงาน
                  </button>
                </div>

                {/* Office Create/Edit Dialog */}
                {isOfficeFormOpen && (
                  <div className="bg-slate-950 p-4 rounded-2xl border-2 border-sky-500/60 space-y-3 shadow-xl">
                    <h4 className="font-heading font-bold text-xs text-sky-300">
                      {officeEditId ? "แก้ไขข้อมูลสำนักงาน" : "เพิ่มหมุดสำนักงานใหม่"}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300">ชื่อสำนักงาน / หมวดทางหลวง *</label>
                        <input
                          type="text"
                          placeholder="เช่น หมวดทางหลวงหนองจิก"
                          value={officeName}
                          onChange={(e) => setOfficeName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300">ประเภทหน่วยงาน</label>
                        <select
                          value={officeType}
                          onChange={(e: any) => setOfficeType(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        >
                          <option value="HEADQUARTERS">สำนักงานใหญ่แขวงทางหลวง</option>
                          <option value="SUBDIVISION">หมวดทางหลวง</option>
                          <option value="SERVICE_POINT">จุดบริการ / เต็นท์อำนวยการ</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs text-slate-300">ที่ตั้งและสายทาง *</label>
                        <input
                          type="text"
                          placeholder="เช่น ต.ดอนยาง อ.หนองจิก จ.ปัตตานี (ทล.43 กม. 53+000)"
                          value={officeAddress}
                          onChange={(e) => setOfficeAddress(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300">เบอร์โทรศัพท์ติดต่อ</label>
                        <input
                          type="text"
                          placeholder="เช่น 073-349041 ต่อ 103"
                          value={officePhone}
                          onChange={(e) => setOfficePhone(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-slate-300">พิกัด Lat, Lon</label>
                          <button
                            type="button"
                            onClick={() => setAdminPickMode("OFFICE_PIN")}
                            className="text-[10px] text-amber-300 hover:underline"
                          >
                            จิ้มพิกัดบนแผนที่
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="any"
                            value={officeLat}
                            onChange={(e) => setOfficeLat(Number(e.target.value))}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                          />
                          <input
                            type="number"
                            step="any"
                            value={officeLon}
                            onChange={(e) => setOfficeLon(Number(e.target.value))}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsOfficeFormOpen(false)}
                        className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveOffice}
                        className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-heading font-bold px-4 py-1.5 rounded-xl text-xs shadow"
                      >
                        บันทึกหมุดสำนักงาน
                      </button>
                    </div>
                  </div>
                )}

                {/* Office Items List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(systemData.offices || DEFAULT_DOH_OFFICES).map((off) => (
                    <div
                      key={off.id}
                      className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 relative"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded font-heading ${
                              off.type === "HEADQUARTERS"
                                ? "bg-amber-400 text-slate-950"
                                : "bg-sky-900 text-sky-300 border border-sky-700"
                            }`}
                          >
                            {off.type === "HEADQUARTERS" ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
                          </span>
                          <h4 className="font-heading font-bold text-sm text-white mt-1">{off.name}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">{off.address}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setOfficeEditId(off.id);
                              setOfficeName(off.name);
                              setOfficeType(off.type);
                              setOfficeAddress(off.address);
                              setOfficePhone(off.phone);
                              setOfficeLat(off.lat);
                              setOfficeLon(off.lon);
                              setIsOfficeFormOpen(true);
                            }}
                            className="p-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 rounded-lg text-xs"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOffice(off.id)}
                            className="p-1 bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-amber-300 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {off.phone}
                        </span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${off.lat},${off.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 font-heading"
                        >
                          <ExternalLink className="w-3 h-3" /> นำทาง
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: จัดการแผนที่ (MAP MANAGEMENT & ADD FLOOD)                   */}
          {/* ================================================================= */}
          {activeTab === "map" && (
            <div className="space-y-6 max-w-3xl">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                    <MapPinned className="w-5 h-5 text-amber-400" /> จัดการแผนที่และรายงานเหตุการณ์
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    กำหนดจุดน้ำท่วม จุดเริ่มต้น-สิ้นสุด ดัดแนวเส้นทางเกาะถนนจริง (Dual-Source Snapping)
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
                      <label className="text-xs text-slate-300">หมายเลขทางหลวง (ทล.) *</label>
                      <select
                        value={routeNo}
                        onChange={(e) => setRouteNo(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        {HIGHWAY_ROUTES.map((h) => (
                          <option key={h.no} value={h.no}>
                            ทล.{h.no} - {h.name}
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
                        {systemData.floodRoutes.map((f) => (
                          <option key={f.id} value={f.id}>
                            [{f.id}] ทล.{f.route_no} - {f.section_name}
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
                )}

                {/* Section Name & Auto-Geocoding Button */}
                {routeMode === "FLOOD" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-slate-300">ชื่อตอนควบคุม / บริเวณพื้นที่ *</label>
                      <button
                        type="button"
                        disabled={isGeocoding}
                        onClick={() => handleAutoGeocode(startLon, startLat)}
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-heading font-bold text-amber-400">
                      ๑. กำหนดจุดเริ่มต้น (A) และ สิ้นสุด (B)
                    </span>
                    <div className="flex gap-2">
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
                        onChange={(e) => setStartLat(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Lon A (เริ่ม)</span>
                      <input
                        type="number"
                        step="any"
                        value={startLon}
                        onChange={(e) => setStartLon(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Lat B (สิ้นสุด)</span>
                      <input
                        type="number"
                        step="any"
                        value={endLat}
                        onChange={(e) => setEndLat(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Lon B (สิ้นสุด)</span>
                      <input
                        type="number"
                        step="any"
                        value={endLon}
                        onChange={(e) => setEndLon(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
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
                  <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-heading font-bold text-amber-300">
                        คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateDetourAdviceClick}
                        className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2 py-0.5 rounded shadow hover:bg-amber-400 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำอัตโนมัติ
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={detourDesc}
                      onChange={(e) => setDetourDesc(e.target.value)}
                      placeholder="แนะนำใช้ ทล.4092 ผ่านแยกนาเกตุ..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-white"
                    />
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
                          onChange={(e) => setRouteWaterLevel(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
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
                      }}
                      className="bg-slate-800 text-slate-300 px-4 py-3 rounded-xl text-xs font-heading font-semibold"
                    >
                      ยกเลิก
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: รายการเหตุการณ์ (INCIDENT REGISTRY & CSV)                    */}
          {/* ================================================================= */}
          {activeTab === "incidents" && (
            <div className="space-y-5 max-w-4xl">
              {/* Incident Header Stats */}
              <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-amber-400" /> ทะเบียนเหตุการณ์น้ำท่วม
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    กำลังเกิดเหตุ <strong className="text-red-400">{activeCount}</strong> จุด · ปกติแล้ว{" "}
                    <strong className="text-emerald-400">{resolvedCount}</strong> จุด · ทั้งหมด{" "}
                    <strong>{totalCount}</strong> รายการ
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRouteEditId("");
                      handleClearRoute();
                      setActiveTab("map");
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow"
                  >
                    <Plus className="w-4 h-4" /> เพิ่มเหตุการณ์
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-heading font-semibold text-xs px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 shadow"
                  >
                    <FileText className="w-4 h-4" /> ส่งออก CSV
                  </button>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIncidentFilter("ACTIVE")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
                      incidentFilter === "ACTIVE"
                        ? "bg-red-600 text-white"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    กำลังเกิดเหตุ ({activeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncidentFilter("RESOLVED")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
                      incidentFilter === "RESOLVED"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    ปกติแล้ว ({resolvedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncidentFilter("ALL")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
                      incidentFilter === "ALL"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    ทั้งหมด ({totalCount})
                  </button>
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={incidentSearch}
                    onChange={(e) => setIncidentSearch(e.target.value)}
                    placeholder="ค้นหาสายทาง 42, 43, หนองจิก..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* Incident Table List */}
              <div className="space-y-2.5">
                {filteredIncidents.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
                    ไม่พบรายการเหตุการณ์ตามเงื่อนไขที่เลือก
                  </div>
                ) : (
                  filteredIncidents.map((r) => {
                    const isClosed = r.traffic_status === "CLOSED";
                    return (
                      <div
                        key={r.id}
                        className={`p-4 rounded-2xl border transition shadow-lg ${
                          r.is_active
                            ? "bg-slate-950 border-slate-800 hover:border-slate-700"
                            : "bg-slate-950/60 border-slate-900 opacity-70"
                        }`}
                        style={
                          r.is_active
                            ? { borderLeftWidth: "4px", borderLeftColor: lineStyles.flood?.color || "#D32F2F" }
                            : undefined
                        }
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-heading font-black text-xs px-2 py-0.5 rounded shadow-sm"
                                style={
                                  r.is_active
                                    ? isClosed
                                      ? { backgroundColor: lineStyles.flood?.color || "#D32F2F", color: "#ffffff" }
                                      : { backgroundColor: lineStyles.detour?.color || "#FBC02D", color: "#0f172a" }
                                    : { backgroundColor: "#334155", color: "#cbd5e1" }
                                }
                              >
                                {r.is_active ? (isClosed ? "ปิดการจราจร" : "เฝ้าระวัง") : "คืนสภาพปกติแล้ว"}
                              </span>
                              <span className="font-heading font-bold text-amber-300 text-xs sm:text-sm">
                                ทล.{r.route_no}
                              </span>
                              <span className="text-xs text-white font-medium">{r.section_name}</span>
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                              <span>ช่วง กม. {r.km_start} - {r.km_end}</span>
                              <span>
                                ระดับน้ำ:{" "}
                                <strong className="text-white font-mono">{r.water_level_cm} ซม.</strong>
                                {r.diff_cm !== undefined && (
                                  <span
                                    className={`ml-1 text-[11px] font-bold ${
                                      r.diff_cm > 0
                                        ? "text-red-400"
                                        : r.diff_cm < 0
                                        ? "text-emerald-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    ({r.diff_cm > 0 ? `+${r.diff_cm}` : r.diff_cm} ซม.)
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setUpdateModalIncident(r);
                                setNewWaterLevel(r.water_level_cm);
                              }}
                              className="bg-sky-950 hover:bg-sky-800 text-sky-300 border border-sky-700 px-3 py-1 rounded-xl text-xs font-heading font-medium transition"
                            >
                              อัปเดตน้ำ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleIncidentStatus(r.id, r.is_active)}
                              className={`px-3 py-1 rounded-xl text-xs font-heading font-medium transition border ${
                                r.is_active
                                  ? "bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border-emerald-700"
                                  : "bg-amber-950 hover:bg-amber-800 text-amber-300 border-amber-700"
                              }`}
                            >
                              {r.is_active ? "คืนปกติ" : "เปิดใหม่"}
                            </button>
                            <button
                              type="button"
                              onClick={() => loadRouteIntoForm("FLOOD", r.id)}
                              className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 px-2.5 py-1 rounded-xl text-xs font-heading transition"
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoute("FLOOD", r.id)}
                              className="bg-red-950 hover:bg-red-800 text-red-300 px-2 py-1 rounded-xl text-xs transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Water Level Update Modal */}
              {updateModalIncident && (
                <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <div className="bg-slate-900 border-2 border-amber-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
                    <h3 className="font-heading font-bold text-sm text-white">
                      อัปเดตระดับน้ำ: ทล.{updateModalIncident.route_no} {updateModalIncident.section_name}
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-slate-300">ระดับน้ำใหม่ (ซม.) *</label>
                          <span className="text-xs text-slate-400">
                            เดิม: <strong className="text-amber-300">{updateModalIncident.water_level_cm} ซม.</strong>
                          </span>
                        </div>
                        <input
                          type="number"
                          value={newWaterLevel}
                          onChange={(e) => setNewWaterLevel(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-300">หมายเหตุ / มาตรการความปลอดภัย</label>
                        <input
                          type="text"
                          value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)}
                          placeholder="เช่น ติดตั้งเสาวัดระดับน้ำเพิ่ม..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setUpdateModalIncident(null)}
                        className="bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleSubmitQuickUpdate}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow"
                      >
                        บันทึกการอัปเดต
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: ข้อมูลเส้นทาง GIS (KML, KMZ, SHP, GPX & FIELD MAPPING)      */}
          {/* ================================================================= */}
          {activeTab === "routes" && (
            <div className="space-y-6 max-w-4xl">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-amber-400" /> นำเข้าโครงข่ายสายทาง GIS & กำหนดฟิลด์แสดงผล
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  รองรับ KML, KMZ, Shapefile (.zip), GeoJSON, GPX พร้อมแผนที่ตรวจสอบ Dual-Color, การจับคู่ฟิลด์ชื่อสายทางเพื่อแสดงป้ายกำกับ/Popup และตัวตัดจุดความหนาแน่นเกิน (Douglas-Peucker)
                </p>
              </div>

              {/* Upload Dropzone */}
              <div className="bg-slate-950 p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400 transition space-y-3 text-center">
                <Upload className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
                <div>
                  <h4 className="font-heading font-bold text-sm text-white">เลือกไฟล์โครงข่ายเส้นทางหลวง</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    รองรับ .kml, .kmz, .zip (Shapefile รวม .shp .dbf .prj), .geojson, .gpx (พิกัด EPSG:4326)
                  </p>
                </div>
                <label className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg transition">
                  เปิดเลือกไฟล์จากคอมพิวเตอร์
                  <input
                    type="file"
                    accept=".kml,.kmz,.zip,.geojson,.json,.gpx"
                    onChange={handleGisUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Dual-Color Preview Inspection & Attribute Field Mapping Panel */}
              {importedGisFeatures.length > 0 && (
                <div className="bg-slate-950 p-5 rounded-2xl border border-sky-500/60 space-y-4 shadow-2xl animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                    <div>
                      <span className="font-heading font-bold text-sm text-sky-300 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-sky-400" /> พรีวิวตรวจสอบโครงข่าย: พบ {importedGisFeatures.length} เส้นทาง
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ระบบแสดงแนวเส้นทางใหม่ (เส้นประสีน้ำเงิน) บนแผนที่ พร้อมตรวจสอบแนวเส้นเดิม (สีเขียว)
                      </p>
                    </div>
                    <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-600 px-2.5 py-1 rounded-full font-heading font-bold">
                      Dual-Color Inspection Active
                    </span>
                  </div>

                  {/* Layer Name & Description */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">ชื่อเลเยอร์โครงข่าย *</label>
                      <input
                        type="text"
                        value={importedLayerName}
                        onChange={(e) => setImportedLayerName(e.target.value)}
                        placeholder="เช่น โครงข่ายทางหลวงสาย 42"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">คำอธิบายเพื่อแสดงเมื่อคลิกเส้นบนแผนที่</label>
                      <input
                        type="text"
                        value={importedLayerDesc}
                        onChange={(e) => setImportedLayerDesc(e.target.value)}
                        placeholder="เช่น ทางหลวงแผ่นดิน 4 ช่องจราจร..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  {/* Attribute Field Mapping Card */}
                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h4 className="font-heading font-bold text-xs text-amber-300 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-amber-400" /> การจับคู่ฟิลด์ข้อมูลโครงข่าย (GIS Attribute Mapping)
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        ตรวจพบ {availableGisFields.length} คอลัมน์จากไฟล์
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Field 1: Route Code */}
                      <div>
                        <label className="text-slate-300 block mb-1">ฟิลด์รหัสสายทาง (Route Code)</label>
                        <select
                          value={selectedRouteCodeField}
                          onChange={(e) => setSelectedRouteCodeField(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                        >
                          <option value="">— กรอกรหัสสายทางเอง / กำหนดเอง —</option>
                          {availableGisFields.map((f) => (
                            <option key={f} value={f}>
                              คอลัมน์: {f}
                            </option>
                          ))}
                        </select>
                        {!selectedRouteCodeField && (
                          <input
                            type="text"
                            value={manualRouteCode}
                            onChange={(e) => setManualRouteCode(e.target.value)}
                            placeholder="ระบุรหัสสายทาง เช่น 42, 409"
                            className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono"
                          />
                        )}
                      </div>

                      {/* Field 2: Route Name / Label */}
                      <div>
                        <label className="text-slate-300 block mb-1">ฟิลด์ชื่อสายทาง / ป้ายกำกับ (Label/Name)</label>
                        <select
                          value={selectedRouteNameField}
                          onChange={(e) => setSelectedRouteNameField(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                        >
                          <option value="">— กรอกชื่อสายทางเอง / ใช้ชื่อเลเยอร์ —</option>
                          {availableGisFields.map((f) => (
                            <option key={f} value={f}>
                              คอลัมน์: {f}
                            </option>
                          ))}
                        </select>
                        {!selectedRouteNameField && (
                          <input
                            type="text"
                            value={manualRouteName}
                            onChange={(e) => setManualRouteName(e.target.value)}
                            placeholder="ระบุชื่อสายทาง เช่น คลองแงะ - ยะหริ่ง"
                            className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-sky-300"
                          />
                        )}
                      </div>

                      {/* Field 3: Classification */}
                      <div>
                        <label className="text-slate-300 block mb-1">ประเภททางหลวง (Classification)</label>
                        <select
                          value={targetLayerCategory}
                          onChange={(e: any) => setTargetLayerCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                        >
                          <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก (Primary Highway - ประธาน/หลัก)</option>
                          <option value="SECOND_HIGHWAY">ทางหลวงสายรอง (Secondary Highway - เชื่อมต่ออำเภอ)</option>
                        </select>
                      </div>

                      {/* Field 4: Label Display Mode */}
                      <div>
                        <label className="text-slate-300 block mb-1">โหมดการแสดงป้ายชื่อบนแผนที่ (Label Display)</label>
                        <select
                          value={labelDisplayMode}
                          onChange={(e: any) => setLabelDisplayMode(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                        >
                          <option value="hover">แสดงป้ายชื่อลอยเมื่อเลื่อนเมาส์ชี้ (Hover Tooltip)</option>
                          <option value="permanent">แสดงป้ายชื่อตลอดเวลาบนแนวเส้น (Permanent Label)</option>
                          <option value="click">แสดงเมื่อคลิกดูรายละเอียดเท่านั้น (Click Popup Only)</option>
                        </select>
                      </div>
                    </div>

                    {/* Sample Mapping Table (First 5 Rows) */}
                    <div className="mt-3 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-300">ตัวอย่างข้อมูลหลังจับคู่ฟิลด์ (๕ สายทางแรก):</span>
                        <span className="text-[10px] text-slate-400 font-mono">ทั้งหมด {importedGisFeatures.length} สายทาง</span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full text-[11px] text-left text-slate-300">
                          <thead className="bg-slate-950 text-slate-400 font-heading">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">รหัสสายทาง</th>
                              <th className="p-2">ชื่อสายทาง / ตอนควบคุม</th>
                              <th className="p-2">ระยะทาง (กม.)</th>
                              <th className="p-2">จุดพิกัด</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-body">
                            {importedGisFeatures.slice(0, 5).map((f, idx) => {
                              const props = f.properties || {};
                              const code = selectedRouteCodeField
                                ? (props[selectedRouteCodeField] || manualRouteCode || `สายทางที่ ${idx + 1}`)
                                : (manualRouteCode || `สายทางที่ ${idx + 1}`);
                              const name = selectedRouteNameField
                                ? (props[selectedRouteNameField] || manualRouteName || importedLayerName)
                                : (manualRouteName || importedLayerName);

                              return (
                                <tr key={idx} className="hover:bg-slate-800/40">
                                  <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                                  <td className="p-2 font-heading font-bold text-amber-300">ทล.{code}</td>
                                  <td className="p-2 text-white">{name}</td>
                                  <td className="p-2 font-mono text-emerald-400">{f.lengthKm} กม.</td>
                                  <td className="p-2 font-mono text-slate-400">{f.coords.length} จุด</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Douglas-Peucker Slider */}
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">ความละเอียดการตัดจุดส่วนเกิน (Douglas-Peucker)</span>
                      <span className="text-amber-400 font-mono font-bold">{simplifyTolerance}</span>
                    </div>
                    <input
                      type="range"
                      min="0.00001"
                      max="0.0005"
                      step="0.00001"
                      value={simplifyTolerance}
                      onChange={(e) => handleResimplifyTolerance(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <p className="text-[10px] text-slate-400">
                      ค่ามาตรฐาน 0.00008 เหมาะสมสำหรับการเรนเดอร์ถนนหลวงได้อย่างราบรื่นและไม่กินแรม
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportedPreviewLines([]);
                        setImportedGisFeatures([]);
                        setIncomingGisLines?.([]);
                        setAvailableGisFields([]);
                      }}
                      className="bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitGisLayer}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" /> บันทึกโครงข่ายเข้าสู่ระบบ
                    </button>
                  </div>
                </div>
              )}

              {/* Highway Layers in System */}
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-sm text-white">เลเยอร์โครงข่ายเดิมในระบบ</h3>
                <div className="space-y-2">
                  {(systemData.highwayLayers || []).map((layer) => {
                    const isMain = layer.layer_id === "MAIN_HIGHWAY";
                    const layerColor = isMain ? (lineStyles.primary?.color || "#1B5E20") : (lineStyles.secondary?.color || "#0284c7");
                    return (
                      <div
                        key={layer.layer_id}
                        className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs transition hover:border-slate-700"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-4 h-4 rounded-full border border-white/40 shadow"
                            style={{ backgroundColor: layerColor }}
                          />
                          <div>
                            <strong className="text-white block">{layer.layer_name}</strong>
                            <span className="text-slate-400 text-[11px]">
                              รหัส: {layer.layer_id} • สี: {layerColor}
                            </span>
                          </div>
                        </div>
                        <span className="text-emerald-400 font-heading font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> เปิดใช้งานบนแผนที่
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: สไตล์เส้น (LINE STYLING & ANIMATION STUDIO)                 */}
          {/* ================================================================= */}
          {activeTab === "style" && (
            <div className="space-y-6 max-w-4xl">
              <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                    <Palette className="w-5 h-5 text-amber-400" /> สตูดิโอปรับแต่งสไตล์เส้น & เอฟเฟกต์อนิเมชัน
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ปรับสี ความหนา ขอบเส้น รัศมีเรืองแสง (Glow) และอนิเมชันไฟวิ่งตามเส้น ลิงก์ตรงกับแผนที่ทันที
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetStylesToDefault}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-heading font-semibold text-xs px-3 py-2 rounded-xl border border-slate-700 transition"
                  >
                    รีเซ็ตค่าเริ่มต้น
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLineStyles}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-4 py-2 rounded-xl shadow transition flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" /> บันทึกสไตล์เส้น
                  </button>
                </div>
              </div>

              {/* Preset Style Themes Bar */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-xs font-bold font-heading text-amber-300 block">
                  ชุดสไตล์สำเร็จรูป (Preset Themes):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {LINE_STYLE_PRESET_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleApplyPresetTheme(theme)}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400 text-left transition flex flex-col justify-between group"
                    >
                      <div>
                        <strong className="text-xs text-white group-hover:text-amber-300 transition block">
                          {theme.name}
                        </strong>
                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                          {theme.description}
                        </p>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.flood.color }} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.detour.color }} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.primary.color }} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.styles.secondary.color }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Type Selector Pills (Live Syncing Dot) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: "flood", label: "เส้นน้ำท่วม (Flood)" },
                  { key: "detour", label: "ทางเลี่ยง (Detour)" },
                  { key: "primary", label: "ทางหลวงสายหลัก (Main)" },
                  { key: "secondary", label: "ทางหลวงสายรอง (Second)" },
                ].map((item) => {
                  const currentItemColor = lineStyles[item.key as any]?.color || DEFAULT_MAP_STYLES[item.key as any]?.color;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedStyleKey(item.key as any)}
                      className={`p-3 rounded-2xl border text-left transition flex items-center gap-2.5 ${
                        selectedStyleKey === item.key
                          ? "bg-slate-800 border-amber-400 text-white shadow-xl ring-2 ring-amber-400/20"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-white/50 shadow-sm shrink-0 transition-colors"
                        style={{ backgroundColor: currentItemColor }}
                      />
                      <span className="font-heading font-bold text-xs truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Live Interactive SVG Line Preview Box */}
              {lineStyles[selectedStyleKey] && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-heading font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> ตัวอย่างเส้นจริงแบบ Real-time (Live SVG Preview):
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {selectedStyleKey.toUpperCase()} • {lineStyles[selectedStyleKey].color} • {lineStyles[selectedStyleKey].weight}px
                    </span>
                  </div>

                  <div className="h-24 w-full bg-slate-900/90 rounded-xl border border-slate-800 relative flex items-center justify-center overflow-hidden">
                    {/* Road Grid Background */}
                    <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:12px_12px]" />

                    <svg className="w-full h-full" viewBox="0 0 600 90">
                      <defs>
                        {lineStyles[selectedStyleKey].glow && (
                          <filter id="preview-glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur
                              stdDeviation={(lineStyles[selectedStyleKey].glowWidth || 8) / 2}
                              result="blur"
                            />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        )}
                      </defs>

                      {/* Outline Border Path */}
                      {lineStyles[selectedStyleKey].borderActive && (
                        <path
                          d="M 30 45 Q 160 10 300 45 T 570 45"
                          stroke={lineStyles[selectedStyleKey].borderColor || "#ffffff"}
                          strokeWidth={(lineStyles[selectedStyleKey].weight || 5) + (lineStyles[selectedStyleKey].borderWidth || 2) * 2}
                          strokeOpacity={lineStyles[selectedStyleKey].opacity ?? 0.9}
                          fill="none"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Foreground Animated Line */}
                      <path
                        d="M 30 45 Q 160 10 300 45 T 570 45"
                        stroke={lineStyles[selectedStyleKey].color}
                        strokeWidth={lineStyles[selectedStyleKey].weight || 5}
                        strokeOpacity={lineStyles[selectedStyleKey].opacity ?? 0.9}
                        strokeDasharray={
                          lineStyles[selectedStyleKey].pattern === "dash"
                            ? (lineStyles[selectedStyleKey].dashArray || "8, 6")
                            : lineStyles[selectedStyleKey].pattern === "dot"
                            ? "2, 6"
                            : lineStyles[selectedStyleKey].pattern === "long-dash-dot"
                            ? "14, 6, 3, 6"
                            : undefined
                        }
                        className={
                          lineStyles[selectedStyleKey].animation === "chaser"
                            ? "doh-line-chaser"
                            : lineStyles[selectedStyleKey].animation === "pulse"
                            ? "doh-line-pulse"
                            : lineStyles[selectedStyleKey].animation === "blink"
                            ? "doh-line-blink"
                            : lineStyles[selectedStyleKey].animation === "arrows"
                            ? "doh-line-arrows"
                            : ""
                        }
                        filter={lineStyles[selectedStyleKey].glow ? "url(#preview-glow)" : undefined}
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>

                    <div className="absolute bottom-2 right-3 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono border border-slate-800">
                      เอฟเฟกต์: {lineStyles[selectedStyleKey].animation} • ลวดลาย: {lineStyles[selectedStyleKey].pattern}
                    </div>
                  </div>
                </div>
              )}

              {/* Style Controls Box */}
              {lineStyles[selectedStyleKey] && (
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Color Picker & Quick Palettes */}
                    <div className="space-y-2">
                      <label className="text-xs text-slate-300 block font-heading font-medium">สีของเส้นทาง (Line Color)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={lineStyles[selectedStyleKey].color}
                          onChange={(e) => handleUpdateCurrentStyle({ color: e.target.value })}
                          className="w-10 h-10 rounded-xl cursor-pointer bg-slate-900 border border-slate-700 p-0.5"
                        />
                        <input
                          type="text"
                          value={lineStyles[selectedStyleKey].color}
                          onChange={(e) => handleUpdateCurrentStyle({ color: e.target.value.toUpperCase() })}
                          className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono flex-1 uppercase"
                        />
                      </div>

                      {/* Quick Palette Chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          "#D32F2F", "#EF4444", "#B91C1C", // Reds
                          "#FBC02D", "#F59E0B", "#EAB308", // Yellows
                          "#1B5E20", "#059669", "#0B2A5B", // Greens & Navy
                          "#0284C7", "#38BDF8", "#FF1744", // Sky & Neon
                        ].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => handleUpdateCurrentStyle({ color: hex })}
                            className="w-5 h-5 rounded-md border border-white/20 transition-transform hover:scale-110"
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Weight Slider */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span className="font-heading font-medium">ความหนาของเส้น (Line Width)</span>
                        <strong className="text-amber-400 font-mono">{lineStyles[selectedStyleKey].weight} px</strong>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        value={lineStyles[selectedStyleKey].weight}
                        onChange={(e) => handleUpdateCurrentStyle({ weight: Number(e.target.value) })}
                        className="w-full accent-amber-500 mt-2"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>1 px</span>
                        <span>10 px</span>
                        <span>20 px</span>
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span className="font-heading font-medium">ความโปร่งใส (Opacity)</span>
                        <strong className="text-amber-400 font-mono">
                          {Math.round((lineStyles[selectedStyleKey].opacity ?? 0.9) * 100)}%
                        </strong>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={lineStyles[selectedStyleKey].opacity ?? 0.9}
                        onChange={(e) => handleUpdateCurrentStyle({ opacity: Number(e.target.value) })}
                        className="w-full accent-amber-500 mt-2"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>10%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Line Pattern (Solid, Dash, Dot) */}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-heading font-medium">
                        รูปแบบของเส้น (Pattern)
                      </label>
                      <select
                        value={lineStyles[selectedStyleKey].pattern}
                        onChange={(e: any) => handleUpdateCurrentStyle({ pattern: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="solid">เส้นทึบ (Solid Line)</option>
                        <option value="dash">เส้นประ (Dashed Line)</option>
                        <option value="dot">เส้นจุดไข่ปลา (Dotted Line)</option>
                        <option value="long-dash-dot">เส้นประยาวสลับจุด (Long Dash Dot)</option>
                      </select>
                    </div>

                    {/* Border / Outline Controls */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold font-heading text-slate-200">
                          <input
                            type="checkbox"
                            checked={!!lineStyles[selectedStyleKey].borderActive}
                            onChange={(e) => handleUpdateCurrentStyle({ borderActive: e.target.checked })}
                            className="accent-amber-500 rounded"
                          />
                          <span>ขอบเส้นตัดแสง (Outline Border)</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {lineStyles[selectedStyleKey].borderWidth || 1.5} px
                        </span>
                      </div>

                      {lineStyles[selectedStyleKey].borderActive && (
                        <div className="flex items-center gap-2 pt-1 animate-fade-in">
                          <input
                            type="color"
                            value={lineStyles[selectedStyleKey].borderColor || "#ffffff"}
                            onChange={(e) => handleUpdateCurrentStyle({ borderColor: e.target.value })}
                            className="w-7 h-7 rounded-lg cursor-pointer bg-slate-950 border border-slate-700 p-0.5"
                          />
                          <input
                            type="range"
                            min="0.5"
                            max="6"
                            step="0.5"
                            value={lineStyles[selectedStyleKey].borderWidth || 1.5}
                            onChange={(e) => handleUpdateCurrentStyle({ borderWidth: Number(e.target.value) })}
                            className="flex-1 accent-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Glow / Halo Effect Controls */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold font-heading text-slate-200">
                          <input
                            type="checkbox"
                            checked={!!lineStyles[selectedStyleKey].glow}
                            onChange={(e) => handleUpdateCurrentStyle({ glow: e.target.checked })}
                            className="accent-amber-500 rounded"
                          />
                          <span>เอฟเฟกต์เรืองแสง (Glow / Halo)</span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {lineStyles[selectedStyleKey].glowWidth || 8} px
                        </span>
                      </div>

                      {lineStyles[selectedStyleKey].glow && (
                        <div className="flex items-center gap-2 pt-1 animate-fade-in">
                          <input
                            type="color"
                            value={lineStyles[selectedStyleKey].glowColor || lineStyles[selectedStyleKey].color}
                            onChange={(e) => handleUpdateCurrentStyle({ glowColor: e.target.value })}
                            className="w-7 h-7 rounded-lg cursor-pointer bg-slate-950 border border-slate-700 p-0.5"
                          />
                          <input
                            type="range"
                            min="2"
                            max="30"
                            step="1"
                            value={lineStyles[selectedStyleKey].glowWidth || 8}
                            onChange={(e) => handleUpdateCurrentStyle({ glowWidth: Number(e.target.value) })}
                            className="flex-1 accent-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Animation Effects Dropdown */}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-heading font-medium">
                        เอฟเฟกต์อนิเมชันของเส้น (Animation)
                      </label>
                      <select
                        value={lineStyles[selectedStyleKey].animation}
                        onChange={(e: any) => handleUpdateCurrentStyle({ animation: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                      >
                        <option value="none">ไม่มีเอฟเฟกต์ (เส้นนิ่ง)</option>
                        <option value="chaser">จุดไฟวิ่งตามเส้น (A→B Chaser)</option>
                        <option value="pulse">กะพริบพร้อมกัน (จังหวะหายใจ Pulse)</option>
                        <option value="blink">ติด-ดับ (Blink Emergency Alert)</option>
                        <option value="arrows">ลูกศรชี้ทิศทางการจราจร (Direction Arrows)</option>
                      </select>
                    </div>

                    {/* Animation Speed Dropdown */}
                    <div>
                      <label className="text-xs text-slate-300 block mb-1 font-heading font-medium">
                        ความเร็วในการเคลื่อนไหว (Speed)
                      </label>
                      <select
                        value={lineStyles[selectedStyleKey].animationSpeed || "normal"}
                        onChange={(e: any) => handleUpdateCurrentStyle({ animationSpeed: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="slow">ช้า นุ่มนวล (3.5 วินาที)</option>
                        <option value="normal">ปานกลาง พอดีสายตา (2.0 วินาที)</option>
                        <option value="fast">เร็ว แจ้งเตือนฉุกเฉิน (1.0 วินาที)</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl text-xs text-slate-400 space-y-1 border border-slate-800/80">
                    <p className="font-heading font-bold text-amber-300">มาตรฐานการเข้าถึงและประสิทธิภาพ (Accessibility & Performance):</p>
                    <p>
                      การเปลี่ยนสีและความหนาของเส้นจะส่งผลไปยัง <strong>คำอธิบายสัญลักษณ์ (Legend) บนแผนที่</strong>, <strong>ป้ายกำกับเส้นทาง</strong>, และ <strong>ป๊อปอัพรายละเอียดเส้นทาง</strong> ทันที นอกจากนี้แอนิเมชันจะปิดอัตโนมัติเมื่อผู้ใช้เปิดโหมดลดการเคลื่อนไหว (prefers-reduced-motion)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 6: โครงการผู้ว่าฯ (GOVERNOR MITIGATION & DISPATCH)              */}
          {/* ================================================================= */}
          {activeTab === "projects" && (
            <div className="space-y-6 max-w-4xl">
              <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-amber-400" /> แผนงานโครงการแก้ไขปัญหาน้ำท่วม (รายงานผู้ว่าฯ)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ติดตามโครงการแก้ไขปัญหาเร่งด่วน ๑๐ โครงการ (งบประมาณ ๑๔๕ ล้านบาท) และพิมพ์เอกสารราชการ
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDispatchModalOpen(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow"
                  >
                    <Printer className="w-4 h-4" /> พิมพ์รายงานด่วน (รง.ทล.๐๑)
                  </button>
                </div>
              </div>

              {/* Projects List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(systemData.mitigationProjects || []).map((p) => (
                  <div
                    key={p.project_id}
                    className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-amber-300 text-xs">
                        โครงการ [{p.project_id}] ทล.{p.route_no}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded font-heading ${
                          p.status_group === "COMPLETED"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                            : "bg-amber-950 text-amber-300 border border-amber-700"
                        }`}
                      >
                        {p.status_group === "COMPLETED" ? "แก้ไขแล้วเสร็จ" : "รอรับงบประมาณ"}
                      </span>
                    </div>
                    <h4 className="font-heading font-bold text-sm text-white">{p.location_name}</h4>
                    <p className="text-xs text-slate-400">{p.solution_detail}</p>
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        งบประมาณ: <strong className="text-emerald-400 font-mono">{p.budget_mb} ลบ.</strong>
                      </span>
                      <span className="text-slate-400 font-mono">ช่วง กม. {p.km_range}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===================================================================== */}
      {/* 3. MODALS & POPUPS                                                    */}
      {/* ===================================================================== */}

      {/* Official Government Dispatch Print Modal (แบบ รง.ทล.๐๑) */}
      <OfficialReportDispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        systemData={systemData}
      />

      {/* Animated Status Modal for Save / Edit / Delete Feedback */}
      <AnimatedStatusModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        onConfirm={modalState.onConfirm}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        autoCloseMs={modalState.type === "success" ? 2800 : undefined}
      />
    </div>
  );
}
