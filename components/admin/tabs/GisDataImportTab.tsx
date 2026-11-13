"use client";
import { readRouteFile } from "@/lib/route-import";
import { haversineMeters, insertVertex, joinLines, moveVertex, nearestInsertIndex, removeVertex, roundCoord, splitLine } from "@/lib/line-edit";
import type { LonLat, VertexEditEvent } from "@/lib/line-edit";
import { exportLineFeatures, GisExportFormat } from "@/lib/gis-export";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import { SystemDataPayload } from "@/db/default-data";
type LineStylesMap = Record<string, import("@/db/default-data").MapLineStyleItem>;
import {
  FileSpreadsheet,
  Plus,
  Upload,
  MapPin,
  Tag,
  Building,
  CheckCircle2,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Sliders,
  Settings,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ArrowRightLeft,
  ArrowRight,
  Compass,
  RotateCcw,
  Pin,
} from "lucide-react";
import {
  updateHighwayLayerAction,
  deleteHighwayLayerAction,
} from "@/app/actions/doh-actions";
import {
  extractFeaturesFromGeoJson,
  extractFeaturesFromKml,
  extractFeaturesFromKmz,
  extractAvailableGisFields,
  detectSmartFieldMapping,
  calculateRoadSnappedRoute,
  analyzeCarriagewaySeparation,
  ExtractedGisFeature,
} from "@/lib/gis-utils";
import {
  groupHighwayFeatures,
  HighwaySectionGroup,
  HighwayBranchItem,
  HighwayBranchType,
  HighwayDirectionCode,
  KmCalibrationPoint,
  calculateGeodesicLengthKm,
  formatKmPostString,
  parseKmPostMeters,
  calculateKmDistanceKm,
  generateStableFeatureId,
  generateSectionGroupId,
  interpolateKmFromCoordinate,
} from "@/lib/highway-schema";

function kilometerPostMeters(value: unknown): number | null {
  const raw = String(value ?? "").replace(/กม\.?/gi, "").replace(/,/g, "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)\s*\+\s*(\d{1,3})$/);
  if (match) return Number(match[1]) * 1000 + Number(match[2]);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.round(Number.isInteger(numeric) && numeric >= 1000 ? numeric : numeric * 1000) : null;
}

function formatKilometerPost(value: unknown): string {
  const meters = kilometerPostMeters(value);
  if (meters === null) return "";
  return `${Math.floor(meters / 1000)}+${String(meters % 1000).padStart(3, "0")}`;
}

function normalizeSurface(value: unknown): string {
  const surface = String(value ?? "").toLowerCase();
  if (surface.includes("conc") || surface.includes("pcc") || surface.includes("concrete")) return "Conc.";
  if (surface.includes("dst")) return "DST.";
  return "AC.";
}

function normalizeLanes(value: unknown): string {
  const match = String(value ?? "").match(/[2-8๒-๘]/)?.[0];
  const digit = match && /[๒-๘]/.test(match) ? String("๒๓๔๕๖๗๘".indexOf(match) + 2) : match;
  return ["2", "3", "4", "6", "8"].includes(digit || "") ? `${digit} ช่องจราจร` : "4 ช่องจราจร";
}

function calculateDistanceKm(start: unknown, end: unknown): string {
  const startMeters = kilometerPostMeters(start);
  const endMeters = kilometerPostMeters(end);
  return startMeters === null || endMeters === null
    ? ""
    : (Math.abs(endMeters - startMeters) / 1000).toFixed(3);
}

function previewLines(features: ExtractedGisFeature[]): [number, number][][] {
  const maxLines = 500;
  const maxPointsPerLine = 500;
  return features.slice(0, maxLines).map(({ coords }) => {
    if (coords.length <= maxPointsPerLine) return coords;
    const step = (coords.length - 1) / (maxPointsPerLine - 1);
    return Array.from({ length: maxPointsPerLine }, (_, index) => coords[Math.round(index * step)]);
  });
}

function simplifyInWorker(features: ExtractedGisFeature[], tolerance: number): Promise<ExtractedGisFeature[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/route-simplify-worker.js`);
    worker.onmessage = (event: MessageEvent<{ features?: ExtractedGisFeature[]; error?: string }>) => {
      worker.terminate();
      if (event.data.error || !event.data.features) reject(new Error(event.data.error || "ไม่สามารถประมวลผลเส้นทางได้"));
      else resolve(event.data.features);
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("ไม่สามารถประมวลผลไฟล์ในเบื้องหลังได้")); };
    worker.postMessage({ features, tolerance });
  });
}

function lineCoordinates(geometry: any): [number, number][] {
  const coordinates = geometry?.type === "LineString"
    ? geometry.coordinates
    : geometry?.type === "MultiLineString"
      ? geometry.coordinates.flat(1)
      : [];
  return Array.isArray(coordinates)
    ? coordinates.filter((point: any) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map((point: any) => [Number(point[0]), Number(point[1])] as [number, number])
    : [];
}

interface GisDataImportTabProps {
  systemData: SystemDataPayload;
  lineStyles: LineStylesMap;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string; ts?: number } | null;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftReverseCoordinates?: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftReverseWaypoints?: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftDirectionMeta?: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null;
  setDraftDirectionMeta?: (meta: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null) => void;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  setDraftPickMarkers?: React.Dispatch<React.SetStateAction<Array<{ lat: number; lon: number; label: string; mode: string }>>>;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (active: boolean) => void;
}

// One undo/redo step of the freeform editor. Split/join results are part of the snapshot so
// undo also reverts them.
interface EditSnapshot {
  coords: LonLat[];
  remainder: LonLat[] | null;
  absorbed: number[];
}

export function GisDataImportTab({
  systemData,
  lineStyles,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  setIncomingGisLines,
  adminPickMode,
  setAdminPickMode,
  pickedCoordinate,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  draftReverseCoordinates = [],
  setDraftReverseCoordinates,
  draftReverseWaypoints = [],
  setDraftReverseWaypoints,
  draftDirectionMeta,
  setDraftDirectionMeta,
  onDraftModeChange,
  setDraftPickMarkers,
  vertexEvent,
  onVertexEditChange,
}: GisDataImportTabProps) {
  const offices = useMemo(() => (systemData.offices || []).filter((office) => office.is_active), [systemData.offices]);
  const [importedGisFeatures, setImportedGisFeatures] = useState<ExtractedGisFeature[]>([]);
  const [, setImportedPreviewLines] = useState<[number, number][][]>([]);
  const [importedLayerName, setImportedLayerName] = useState("");
  const [availableGisFields, setAvailableGisFields] = useState<string[]>([]);
  const [selectedRouteCodeField, setSelectedRouteCodeField] = useState("");
  const [manualRouteCode, setManualRouteCode] = useState("");
  const [selectedRouteNameField, setSelectedRouteNameField] = useState("");
  const [manualRouteName, setManualRouteName] = useState("");
  const [selectedRouteTypeField, setSelectedRouteTypeField] = useState("");
  const [targetLayerCategory, setTargetLayerCategory] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY">("MAIN_HIGHWAY");
  const [labelDisplayMode, setLabelDisplayMode] = useState<"hover" | "permanent" | "click">("hover");

  // Specifications
  const [layerLanes, setLayerLanes] = useState("4 ช่องจราจร");
  const [layerSurface, setLayerSurface] = useState("AC.");
  const [layerResponsibleOffice, setLayerResponsibleOffice] = useState(systemData.offices?.find((office) => office.is_active)?.name || "");
  const [layerSpeedLimit, setLayerSpeedLimit] = useState("๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)");
  const [layerRoadStatus, setLayerRoadStatus] = useState("สัญจรได้ตามปกติ");
  const [layerRemarks, setLayerRemarks] = useState("");
  const [simplifyTolerance, setSimplifyTolerance] = useState(0.00008);
  const [isCommitting, setIsCommitting] = useState(false);
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<{ layerId: string; featureIdx: number } | null>(null);
  const [editingGeometry, setEditingGeometry] = useState<{ layerId: string; featureIdx: number; start: [number, number]; end: [number, number]; originalCoordinates: [number, number][] } | null>(null);
  const [isSnappingGeometry, setIsSnappingGeometry] = useState(false);

  // Item 2: Road Structure & Directional Arrow Metadata for GIS Line Generation
  const [carriagewayStructure, setCarriagewayStructure] = useState<"SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY">("SINGLE_CENTERLINE");
  const [arrowDirectionSetting, setArrowDirectionSetting] = useState<"TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN">("TWO_WAY");
  const [showFeatureArrows, setShowFeatureArrows] = useState<boolean>(true);
  const [dualReverseCoords, setDualReverseCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!editingGeometry) return;
    const effectiveArrowDir =
      carriagewayStructure === "DUAL_CARRIAGEWAY"
        ? "FORWARD"
        : carriagewayStructure === "ONE_WAY"
          ? arrowDirectionSetting === "REVERSE"
            ? "REVERSE"
            : "FORWARD"
          : arrowDirectionSetting;
    setDraftDirectionMeta?.({
      arrowDirection: effectiveArrowDir,
      showArrows: showFeatureArrows && effectiveArrowDir !== "UNKNOWN",
      directionMode: carriagewayStructure === "DUAL_CARRIAGEWAY" ? "TWO_WAY" : "FORWARD_ONLY",
    });
  }, [editingGeometry, carriagewayStructure, arrowDirectionSetting, showFeatureArrows, setDraftDirectionMeta]);

  // Freeform editor state (Google My Maps style)
  const [editorMode, setEditorMode] = useState<"free" | "road">("road");
  const [vertexTool, setVertexTool] = useState<"move" | "delete" | "split">("move");
  const [splitRemainder, setSplitRemainder] = useState<LonLat[] | null>(null);
  const [absorbedFeatureIdxs, setAbsorbedFeatureIdxs] = useState<number[]>([]);
  const [joinTargetIdx, setJoinTargetIdx] = useState("");
  const historyRef = useRef<{ past: EditSnapshot[]; future: EditSnapshot[] }>({ past: [], future: [] });
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const isEditingGeometry = Boolean(editingGeometry);

  const snapshotNow = (): EditSnapshot => ({ coords: draftCoordinates, remainder: splitRemainder, absorbed: absorbedFeatureIdxs });
  const applySnapshot = (snapshot: EditSnapshot) => {
    setDraftCoordinates(snapshot.coords);
    setSplitRemainder(snapshot.remainder);
    setAbsorbedFeatureIdxs(snapshot.absorbed);
  };
  const resetEditHistory = () => {
    historyRef.current = { past: [], future: [] };
    setHistorySize({ undo: 0, redo: 0 });
  };
  const commitEdit = (next: EditSnapshot) => {
    const history = historyRef.current;
    history.past.push(snapshotNow());
    if (history.past.length > 100) history.past.shift();
    history.future = [];
    applySnapshot(next);
    setHistorySize({ undo: history.past.length, redo: 0 });
  };
  const undoEdit = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(snapshotNow());
    applySnapshot(previous);
    setHistorySize({ undo: history.past.length, redo: history.future.length });
  };
  const redoEdit = () => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past.push(snapshotNow());
    applySnapshot(next);
    setHistorySize({ undo: history.past.length, redo: history.future.length });
  };
  const closeGeometryEditor = () => {
    setEditingGeometry(null);
    setAdminPickMode(null);
    setDraftCoordinates([]);
    setDraftWaypoints([]);
    setDraftReverseCoordinates?.([]);
    setDraftReverseWaypoints?.([]);
    setDraftDirectionMeta?.(null);
    setDualReverseCoords([]);
    setSplitRemainder(null);
    setAbsorbedFeatureIdxs([]);
    setJoinTargetIdx("");
    setVertexTool("move");
    resetEditHistory();
    onDraftModeChange?.("FLOOD");
  };

  useEffect(() => {
    if (!editingGeometry || editorMode === "free") { setDraftPickMarkers?.([]); return; }
    const { start, end } = editingGeometry;
    setDraftPickMarkers?.([
      { lat: start[1], lon: start[0], label: "A", mode: "PICK_HIGHWAY_START" },
      { lat: end[1], lon: end[0], label: "B", mode: "PICK_HIGHWAY_END" },
    ]);
  }, [editingGeometry, editorMode, setDraftPickMarkers]);

  // Tell the map to show vertex handles only while the freeform editor is open.
  useEffect(() => {
    onVertexEditChange?.(isEditingGeometry && editorMode === "free");
    return () => onVertexEditChange?.(false);
  }, [isEditingGeometry, editorMode, onVertexEditChange]);

  useEffect(() => {
    if (!editingGeometry || !pickedCoordinate) return;
    if (pickedCoordinate.mode === "PICK_HIGHWAY_START") setEditingGeometry((current) => current ? { ...current, start: [pickedCoordinate.lon, pickedCoordinate.lat] } : current);
    if (pickedCoordinate.mode === "PICK_HIGHWAY_END") setEditingGeometry((current) => current ? { ...current, end: [pickedCoordinate.lon, pickedCoordinate.lat] } : current);
    if (pickedCoordinate.mode === "ADD_HIGHWAY_BEND") setDraftWaypoints((current) => [...current, [pickedCoordinate.lon, pickedCoordinate.lat]]);
    if (pickedCoordinate.mode === "ADD_LINE_VERTEX" && editorMode === "free") {
      const point: LonLat = [pickedCoordinate.lon, pickedCoordinate.lat];
      const { index } = nearestInsertIndex(draftCoordinates, point);
      commitEdit({ ...snapshotNow(), coords: insertVertex(draftCoordinates, index, point) });
    }
  }, [pickedCoordinate?.ts, pickedCoordinate?.mode]);

  // Events from the vertex handles drawn on the map (drag / click "+" / click vertex / right-click vertex)
  useEffect(() => {
    if (!editingGeometry || editorMode !== "free" || !vertexEvent) return;
    const { type, index, coord } = vertexEvent;
    if (type === "move" && coord) {
      commitEdit({ ...snapshotNow(), coords: moveVertex(draftCoordinates, index, coord) });
      return;
    }
    if (type === "insert" && coord) {
      commitEdit({ ...snapshotNow(), coords: insertVertex(draftCoordinates, index, coord) });
      return;
    }
    if (type === "contextmenu" || (type === "click" && vertexTool === "delete")) {
      if (draftCoordinates.length <= 2) { onToast("เส้นต้องมีอย่างน้อย 2 จุด ไม่สามารถลบจุดเพิ่มได้"); return; }
      commitEdit({ ...snapshotNow(), coords: removeVertex(draftCoordinates, index) });
      return;
    }
    if (type === "click" && vertexTool === "split") {
      if (splitRemainder) { onToast("ตัดเส้นได้ครั้งละ 1 ครั้ง กรุณาบันทึก หรือกดย้อนกลับก่อน"); return; }
      const parts = splitLine(draftCoordinates, index);
      if (!parts) { onToast("เลือกจุดตรงกลางเส้นเพื่อตัด (ไม่ใช่จุดปลายเส้น)"); return; }
      commitEdit({ ...snapshotNow(), coords: parts[0], remainder: parts[1] });
      setVertexTool("move");
      onToast("ตัดเส้นแล้ว ส่วนที่ 2 (เส้นประสีฟ้า) จะถูกบันทึกเป็นสายทางใหม่เมื่อกดบันทึก");
    }
  }, [vertexEvent?.seq]);

  useEffect(() => {
    if (editingGeometry) {
      const lines: [number, number][][] = [draftCoordinates];
      if (splitRemainder && splitRemainder.length >= 2) lines.push(splitRemainder);
      if (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2) lines.push(dualReverseCoords);
      setIncomingGisLines?.(lines);
      setDraftReverseCoordinates?.(carriagewayStructure === "DUAL_CARRIAGEWAY" ? dualReverseCoords : []);
    } else {
      setIncomingGisLines?.([]);
    }
  }, [editingGeometry, draftCoordinates, splitRemainder, carriagewayStructure, dualReverseCoords, setIncomingGisLines, setDraftReverseCoordinates]);

  // Nearest other routes of the same layer (by distance between line ends) that can be joined.
  const joinCandidates = useMemo(() => {
    if (!editingGeometry || editorMode !== "free" || draftCoordinates.length < 2) return [];
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    const features = layer?.geojson_data?.features;
    if (!Array.isArray(features)) return [];
    const first = draftCoordinates[0];
    const last = draftCoordinates[draftCoordinates.length - 1];
    const rows: Array<{ idx: number; label: string; gap: number }> = [];
    features.forEach((feature: any, idx: number) => {
      if (idx === editingGeometry.featureIdx || absorbedFeatureIdxs.includes(idx)) return;
      const geometry = feature?.geometry;
      const coords: any[] = geometry?.type === "LineString" ? geometry.coordinates : geometry?.type === "MultiLineString" ? geometry.coordinates.flat(1) : [];
      if (!Array.isArray(coords) || coords.length < 2) return;
      const a = coords[0] as LonLat;
      const b = coords[coords.length - 1] as LonLat;
      const gap = Math.min(haversineMeters(last, a), haversineMeters(last, b), haversineMeters(first, a), haversineMeters(first, b));
      const props = feature?.properties || {};
      rows.push({ idx, gap, label: `ทล.${props.route_no ?? ""} · ${props.section_name ?? ""}` });
    });
    rows.sort((x, y) => x.gap - y.gap);
    return rows.slice(0, 50);
  }, [editingGeometry, editorMode, draftCoordinates, absorbedFeatureIdxs, systemData.highwayLayers]);

  // Individual Highway Specifications Modal State (Issue #13)
  const [editingRouteSpecs, setEditingRouteSpecs] = useState<{
    layerId: string;
    featureIdx: number;
    routeNo: string;
    sectionName: string;
    kmStart: string;
    kmEnd: string;
    lengthKm: string | number;
    responsibleOffice: string;
    highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
    lanes: string;
    surface: string;
    remarks: string;
    isVisible: boolean;
  } | null>(null);
  const specsDialog = useModalAccessibility(Boolean(editingRouteSpecs), () => setEditingRouteSpecs(null));
  const routeDialog = useModalAccessibility(Boolean(selectedRoute), () => setSelectedRoute(null));

  // Toggle Eye visibility for a single feature inside a highway layer
  const handleToggleFeatureVisibility = async (layerId: string, featureIdx: number) => {
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === layerId);
    if (!layer || !layer.geojson_data?.features?.[featureIdx]) return;

    try {
      const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
      const targetFeature = updatedGeojson.features[featureIdx];
      const currentVis = targetFeature.properties?.is_visible !== false;
      targetFeature.properties.is_visible = !currentVis;

      const res = await updateHighwayLayerAction({
        layerId,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        onToast(
          `สลับการแสดงผล [${targetFeature.properties?.route_no || targetFeature.properties?.section_name || "สายทาง"}] เป็น ${!currentVis ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"
          }`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาดในการเปลี่ยนการแสดงผล: " + e.message);
    }
  };

  // Toggle Eye visibility for all features in a highway section group
  const handleToggleGroupVisibility = async (group: HighwaySectionGroup) => {
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === group.layerId);
    if (!layer || !layer.geojson_data?.features) return;

    try {
      const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
      const targetVis = !group.isVisible;
      const branchIdxSet = new Set(group.branches.map((b) => b.featureIdx));

      updatedGeojson.features.forEach((feature: any, idx: number) => {
        if (branchIdxSet.has(idx) && feature?.properties) {
          feature.properties.is_visible = targetVis;
        }
      });

      const res = await updateHighwayLayerAction({
        layerId: group.layerId,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        onToast(
          `สลับการแสดงผล ทล.${group.routeNo} ${group.sectionName} เป็น ${targetVis ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาดในการเปลี่ยนการแสดงผล: " + e.message);
    }
  };

  // Save updated specifications for a single feature
  const handleSaveRouteSpecsModal = async () => {
    if (!editingRouteSpecs) return;
    const { layerId, featureIdx, ...specs } = editingRouteSpecs;
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === layerId);
    if (!layer || featureIdx < 0 || !layer.geojson_data?.features?.[featureIdx]) {
      onToast("กรุณานำเข้าแนวเส้นทางก่อนตั้งค่าข้อมูลสายทาง");
      return;
    }

    try {
      const updatedGeojson = layer.geojson_data
        ? JSON.parse(JSON.stringify(layer.geojson_data))
        : { type: "FeatureCollection", features: [] };
      if (!Array.isArray(updatedGeojson.features)) updatedGeojson.features = [];

      const newProps = {
        route_no: specs.routeNo.trim(),
        route_code: specs.routeNo.trim(),
        section_name: specs.sectionName.trim(),
        route_name: specs.sectionName.trim(),
        km_start: formatKilometerPost(specs.kmStart),
        km_end: formatKilometerPost(specs.kmEnd),
        length_km: Number(specs.lengthKm) || 0,
        responsible_office: specs.responsibleOffice,
        highway_type: specs.highwayType,
        lanes: specs.lanes,
        surface: specs.surface,
        remarks: specs.remarks.trim(),
        is_visible: specs.isVisible,
      };

      if (featureIdx >= 0 && updatedGeojson.features[featureIdx]) {
        const targetFeature = updatedGeojson.features[featureIdx];
        const targetGroupId = targetFeature.properties?.section_group_id;

        targetFeature.properties = {
          ...(targetFeature.properties || {}),
          ...newProps,
        };

        // Also sync common engineering specs to sibling branches in the same section group
        if (targetGroupId) {
          updatedGeojson.features.forEach((f: any, idx: number) => {
            if (idx !== featureIdx && f?.properties?.section_group_id === targetGroupId) {
              f.properties = {
                ...(f.properties || {}),
                lanes: specs.lanes,
                surface: specs.surface,
                responsible_office: specs.responsibleOffice,
                highway_type: specs.highwayType,
              };
            }
          });
        }
      }

      const res = await updateHighwayLayerAction({
        layerId: layer.layer_id,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setEditingRouteSpecs(null);
        showSuccessModal(
          "บันทึกคุณสมบัติทางหลวงสำเร็จ",
          `บันทึกข้อมูล ทล.${specs.routeNo} ${specs.sectionName} ช่องจราจร [${specs.lanes}] เรียบร้อยแล้ว (ขนาดเส้นบนแผนที่ถูกปรับเปลี่ยนทันที)`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  const openGeometryEditor = (layerId: string, featureIdx: number) => {
    const feature = (systemData.highwayLayers || []).find((layer) => layer.layer_id === layerId)?.geojson_data?.features?.[featureIdx];
    const coords = lineCoordinates(feature?.geometry);
    if (coords.length < 2) {
      onToast("สายทางนี้ไม่มีข้อมูลเส้นที่แก้ไขได้ กรุณานำเข้าไฟล์เส้นทางก่อน");
      return;
    }
    const start = coords[0];
    const end = coords[coords.length - 1];
    const props = feature?.properties || {};
    setDraftCoordinates(coords);
    setDraftWaypoints([]);
    setDualReverseCoords([]);
    setCarriagewayStructure(
      props.carriageway_type === "DUAL_CARRIAGEWAY"
        ? "DUAL_CARRIAGEWAY"
        : props.carriageway_type === "ONE_WAY"
          ? "ONE_WAY"
          : "SINGLE_CENTERLINE"
    );
    setArrowDirectionSetting(
      props.arrow_direction === "FORWARD" || props.arrow_direction === "REVERSE" || props.arrow_direction === "TWO_WAY" || props.arrow_direction === "UNKNOWN"
        ? props.arrow_direction
        : "TWO_WAY"
    );
    setShowFeatureArrows(props.show_arrows !== false);
    // The common map drag handler must use road routing for a highway editor,
    // not the flood-only PostGIS snap rule inherited from a previous tab.
    onDraftModeChange?.("DETOUR");
    setEditingGeometry({ layerId, featureIdx, start, end, originalCoordinates: coords.map((coordinate) => [...coordinate] as [number, number]) });
    // Opens in road-snapping mode, the long-standing default (and what tests/e2e expect). Free editing is
    // one click away on the mode switch.
    setEditorMode("road");
    setVertexTool("move");
    setSplitRemainder(null);
    setAbsorbedFeatureIdxs([]);
    setJoinTargetIdx("");
    resetEditHistory();
    onToast("เปิดตัวแก้ไขแนวถนนแล้ว เลือกพิกัดบนแผนที่หรือกรอกพิกัดเองได้ (สลับเป็น \"วาด/แก้ไขอิสระ\" เพื่อลากจุดเอง)");
  };

  const snapEditedGeometry = async () => {
    if (!editingGeometry) return;
    setIsSnappingGeometry(true);
    try {
      const coords = await calculateRoadSnappedRoute(editingGeometry.start, editingGeometry.end, draftWaypoints);
      if (coords.length < 2) throw new Error("ไม่พบแนวถนนสำหรับเชื่อมต่อพิกัดที่เลือก");
      setDraftCoordinates(coords);

      if (carriagewayStructure === "DUAL_CARRIAGEWAY") {
        // Query real opposite carriageway B -> A from OSRM without fake parallel offset
        const revWaypoints = [...draftWaypoints].reverse();
        const revCoords = await calculateRoadSnappedRoute(editingGeometry.end, editingGeometry.start, revWaypoints).catch(() => [] as [number, number][]);
        if (revCoords.length >= 2) {
          const sep = analyzeCarriagewaySeparation(coords, revCoords);
          if (!sep.isSymmetricSingleLine) {
            setDualReverseCoords(revCoords);
            onToast(`สร้างแนวถนน 2 คันทางแยกตามโครงข่ายจริงแล้ว (A→B ${coords.length} จุด, B→A ${revCoords.length} จุด · ห่างเฉลี่ย ${sep.medianSeparationMeters} ม.)`);
          } else {
            setDualReverseCoords([]);
            onToast("โครงข่ายถนนบริเวณนี้เป็นเส้นกึ่งกลางเดี่ยว ระบบใช้เส้นเดี่ยวพร้อมลูกศร 2 ทิศทาง (ไม่ใช้เส้นคู่ขนานปลอม)");
          }
        } else {
          setDualReverseCoords([]);
        }
      } else {
        setDualReverseCoords([]);
        onToast("สร้างแนวเชื่อมต่อเกาะตามถนนแล้ว คุณสามารถลากจุดสีส้มเพื่อดัดแนวได้");
      }
    } catch (error: any) {
      onToast(`สร้างแนวถนนไม่สำเร็จ: ${error.message}`);
    } finally {
      setIsSnappingGeometry(false);
    }
  };

  const removeGeometryWaypoint = async (index: number) => {
    if (!editingGeometry) return;
    const nextWaypoints = draftWaypoints.filter((_, waypointIndex) => waypointIndex !== index);
    setDraftWaypoints(nextWaypoints);
    setIsSnappingGeometry(true);
    try {
      const coords = await calculateRoadSnappedRoute(editingGeometry.start, editingGeometry.end, nextWaypoints);
      if (coords.length < 2) throw new Error("ไม่พบแนวถนนหลังลบจุดดัด");
      setDraftCoordinates(coords);
      onToast(`ลบจุดดัดที่ ${index + 1} และคำนวณแนวถนนใหม่แล้ว`);
    } catch (error: any) {
      onToast(`ลบจุดดัดแล้ว แต่คำนวณแนวถนนใหม่ไม่สำเร็จ: ${error.message}`);
    } finally {
      setIsSnappingGeometry(false);
    }
  };

  const restoreOriginalGeometry = () => {
    if (!editingGeometry) return;
    setDraftWaypoints([]);
    commitEdit({ coords: editingGeometry.originalCoordinates.map((coordinate) => [...coordinate] as LonLat), remainder: null, absorbed: [] });
    onToast("คืนค่าแนวถนนเดิมแล้ว กดบันทึกเพื่อยืนยัน (กดย้อนกลับเพื่อยกเลิกการคืนค่า)");
  };

  const switchEditorMode = (mode: "free" | "road") => {
    if (!editingGeometry || mode === editorMode) return;
    if (mode === "road") {
      if (splitRemainder || absorbedFeatureIdxs.length > 0) {
        onToast("กรุณาบันทึก หรือกดย้อนกลับการตัด/เชื่อมเส้นก่อนสลับไปโหมดเกาะแนวถนน");
        return;
      }
      const first = draftCoordinates[0];
      const last = draftCoordinates[draftCoordinates.length - 1];
      if (first && last) setEditingGeometry((current) => current ? { ...current, start: first, end: last } : current);
    } else {
      setDraftWaypoints([]);
    }
    setAdminPickMode(null);
    setVertexTool("move");
    resetEditHistory();
    setEditorMode(mode);
  };

  const handleJoinSelected = () => {
    if (!editingGeometry) return;
    const targetIdx = Number(joinTargetIdx);
    if (!joinTargetIdx || !Number.isInteger(targetIdx)) return;
    if (splitRemainder) { onToast("กรุณาบันทึก หรือกดย้อนกลับการตัดเส้นก่อนเชื่อมเส้น"); return; }
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    const otherCoords = lineCoordinates(layer?.geojson_data?.features?.[targetIdx]?.geometry);
    if (otherCoords.length < 2) { onToast("สายทางที่เลือกไม่มีข้อมูลเส้นที่เชื่อมได้"); return; }
    const { coords, gapMeters } = joinLines(draftCoordinates, otherCoords);
    commitEdit({ coords: coords.map((point) => roundCoord(point)), remainder: null, absorbed: [...absorbedFeatureIdxs, targetIdx] });
    setJoinTargetIdx("");
    onToast(gapMeters > 1
      ? `เชื่อมเส้นแล้ว (ปลายเส้นห่างกัน ${Math.round(gapMeters)} ม. ต่อด้วยเส้นตรง) สายทางที่เลือกจะถูกรวมเมื่อกดบันทึก`
      : "เชื่อมเส้นแล้ว สายทางที่เลือกจะถูกรวมเข้ากับเส้นนี้เมื่อกดบันทึก");
  };

  const saveEditedGeometry = async () => {
    if (!editingGeometry || draftCoordinates.length < 2) return;
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    if (!layer?.geojson_data?.features?.[editingGeometry.featureIdx]) return;
    const geojson = JSON.parse(JSON.stringify(layer.geojson_data));
    const currentProps = geojson.features[editingGeometry.featureIdx].properties || {};
    const effectiveArrowDir =
      carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2
        ? "FORWARD"
        : carriagewayStructure === "ONE_WAY"
          ? arrowDirectionSetting === "REVERSE"
            ? "REVERSE"
            : "FORWARD"
          : arrowDirectionSetting;

    geojson.features[editingGeometry.featureIdx].geometry = { type: "LineString", coordinates: draftCoordinates };
    geojson.features[editingGeometry.featureIdx].properties = {
      ...currentProps,
      carriageway_type: carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2 ? "DUAL_CARRIAGEWAY" : carriagewayStructure,
      arrow_direction: effectiveArrowDir,
      show_arrows: showFeatureArrows && effectiveArrowDir !== "UNKNOWN",
      direction_verified: effectiveArrowDir !== "UNKNOWN",
    };

    if (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2) {
      const reverseProps = JSON.parse(JSON.stringify(geojson.features[editingGeometry.featureIdx].properties || {}));
      const baseSection = String(currentProps.section_name || currentProps.route_name || "").replace(/\s*\(ขาไป.*\)|\s*\(ขากลับ.*\)/g, "").trim();
      geojson.features[editingGeometry.featureIdx].properties.section_name = baseSection ? `${baseSection} (ขาไป A→B)` : "ขาไป A→B";
      reverseProps.section_name = baseSection ? `${baseSection} (ขากลับ B→A)` : "ขากลับ B→A";
      reverseProps.arrow_direction = "FORWARD"; // vertices of dualReverseCoords are already ordered B -> A
      reverseProps.carriageway_type = "DUAL_CARRIAGEWAY";
      reverseProps.show_arrows = showFeatureArrows;
      reverseProps.direction_verified = true;
      geojson.features.push({
        type: "Feature",
        properties: reverseProps,
        geometry: { type: "LineString", coordinates: dualReverseCoords },
      });
    }

    if (splitRemainder && splitRemainder.length >= 2) {
      // Second half of a split becomes a new feature. Copy the properties but clear km values that
      // no longer describe it, so they can be re-entered from the route specs editor.
      const sourceProps = JSON.parse(JSON.stringify(geojson.features[editingGeometry.featureIdx].properties || {}));
      const newProps = { ...sourceProps, km_start: "", km_end: "", length_km: "" };
      if (sourceProps.section_name) newProps.section_name = `${sourceProps.section_name} (ส่วนที่ 2)`;
      geojson.features.push({ type: "Feature", properties: newProps, geometry: { type: "LineString", coordinates: splitRemainder } });
    }
    if (absorbedFeatureIdxs.length > 0) {
      geojson.features = geojson.features.filter((_: unknown, index: number) => !absorbedFeatureIdxs.includes(index));
    }
    try {
      const result = await updateHighwayLayerAction({ layerId: layer.layer_id, geojsonData: geojson });
      if (!result.success) throw new Error("ฐานข้อมูลไม่ยืนยันการบันทึกแนวถนน");
      onDataRefresh(result.systemData);
      closeGeometryEditor();
      showSuccessModal("บันทึกแนวถนนสำเร็จ", splitRemainder || absorbedFeatureIdxs.length > 0 || (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2) ? "อัปเดตเส้นทางและทิศทางลูกศรในฐานข้อมูลและบนแผนที่แล้ว" : "อัปเดตเส้นทางในฐานข้อมูลและบนแผนที่แล้ว");
    } catch (error: any) {
      onToast(`บันทึกแนวถนนไม่สำเร็จ: ${error.message}`);
    }
  };

  const exportEditedGeometry = (format: "geojson" | "kml") => {
    if (!editingGeometry || draftCoordinates.length < 2) return;
    const feature = (systemData.highwayLayers || []).find((layer) => layer.layer_id === editingGeometry.layerId)?.geojson_data?.features?.[editingGeometry.featureIdx];
    const props = feature?.properties || {};
    const data = format === "geojson"
      ? JSON.stringify({ type: "FeatureCollection", features: [{ ...feature, geometry: { type: "LineString", coordinates: draftCoordinates } }] }, null, 2)
      : `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${String(props.section_name || props.route_no || "ทางหลวง").replace(/[&<>]/g, "")}</name><LineString><coordinates>${draftCoordinates.map(([lon, lat]) => `${lon},${lat},0`).join(" ")}</coordinates></LineString></Placemark></Document></kml>`;
    const blob = new Blob([data], { type: format === "geojson" ? "application/geo+json" : "application/vnd.google-earth.kml+xml" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `highway-route.${format}`;
    link.click();
    URL.revokeObjectURL(href);
  };

  // Delete a single highway feature
  const handleDeleteHighwayFeature = (layerId: string, featureIdx: number, routeTitle: string) => {
    showConfirmModal(
      "ยืนยันการลบสายทาง",
      `คุณต้องการลบสายทาง [${routeTitle}] ออกจากโครงข่ายทางหลวงใช่หรือไม่?`,
      async () => {
        const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === layerId);
        if (!layer || !layer.geojson_data?.features?.[featureIdx]) return;
        try {
          const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
          updatedGeojson.features.splice(featureIdx, 1);
          const res = await updateHighwayLayerAction({
            layerId,
            geojsonData: updatedGeojson,
          });
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบสำเร็จ", `ลบสายทาง [${routeTitle}] เรียบร้อยแล้ว`);
          }
        } catch (e: any) {
          onToast("เกิดข้อผิดพลาดในการลบ: " + e.message);
        }
      }
    );
  };

  // Delete all features belonging to a highway section group
  const handleDeleteHighwayGroup = (group: HighwaySectionGroup) => {
    showConfirmModal(
      "ยืนยันการลบตอนควบคุมสายทาง",
      `คุณต้องการลบตอนควบคุม [ทล.${group.routeNo} ${group.sectionName}] (ทั้งหมด ${group.branches.length} ฝั่งคันทาง) ออกจากโครงข่ายใช่หรือไม่?`,
      async () => {
        const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === group.layerId);
        if (!layer || !layer.geojson_data?.features) return;
        try {
          const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
          const branchIdxSet = new Set(group.branches.map((b) => b.featureIdx));
          updatedGeojson.features = updatedGeojson.features.filter((_: any, idx: number) => !branchIdxSet.has(idx));
          const res = await updateHighwayLayerAction({
            layerId: group.layerId,
            geojsonData: updatedGeojson,
          });
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบสำเร็จ", `ลบตอนควบคุม [ทล.${group.routeNo} ${group.sectionName}] เรียบร้อยแล้ว`);
          }
        } catch (e: any) {
          onToast("เกิดข้อผิดพลาดในการลบ: " + e.message);
        }
      }
    );
  };

  // Export Highway Specs CSV
  const handleExportHighwaySpecsCSV = () => {
    if (allHighwayFeatures.length === 0) {
      onToast("ไม่มีรายการทางหลวงสำหรับส่งออก");
      return;
    }
    const headers = [
      "ลำดับ",
      "การแสดงผลบนแผนที่",
      "หมายเลขทางหลวง",
      "ชื่อสายทาง_ตอนควบคุม",
      "กม_เริ่มต้น",
      "กม_สิ้นสุด",
      "ระยะทาง_กม",
      "จำนวนช่องจราจร",
      "ชนิดผิวจราจร",
      "หน่วยงานรับผิดชอบ",
      "ประเภททางหลวง",
      "หมายเหตุ",
    ];
    const rows = allHighwayFeatures.map((item, idx) =>
      [
        idx + 1,
        item.isVisible ? "แสดง" : "ซ่อน",
        `"ทล.${item.routeNo}"`,
        `"${item.sectionName.replace(/"/g, '""')}"`,
        `"${item.kmStart}"`,
        `"${item.kmEnd}"`,
        item.lengthKm || "",
        `"${item.lanes}"`,
        `"${item.surface}"`,
        `"${item.responsibleOffice}"`,
        item.highwayType === "MAIN_HIGHWAY" ? "สายหลัก" : "สายรอง",
        `"${(item.remarks || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `DOH_Highway_Specifications_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast("ส่งออกบัญชีคุณสมบัติทางหลวง CSV สำเร็จ");
  };

  // Flattened highway features list for specifications table (Issue #13)
  const allHighwayFeatures = (() => {
    const list: Array<{
      layerId: string;
      layerName: string;
      featureIdx: number;
      routeNo: string;
      sectionName: string;
      kmStart: string;
      kmEnd: string;
      lengthKm: number | string;
      responsibleOffice: string;
      highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
      lanes: string;
      surface: string;
      remarks: string;
      isVisible: boolean;
      pointsCount: number;
    }> = [];

    (systemData.highwayLayers || []).forEach((layer) => {
      const isSec = layer.layer_id === "SECOND_HIGHWAY";
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        layer.geojson_data.features.forEach((feature: any, idx: number) => {
          const props = feature.properties || {};
          list.push({
            layerId: layer.layer_id,
            layerName: layer.layer_name,
            featureIdx: idx,
            routeNo: props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || `${idx + 1}`,
            sectionName: props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || layer.layer_name,
            kmStart: formatKilometerPost(props.km_start) || "-",
            kmEnd: formatKilometerPost(props.km_end) || "-",
            lengthKm: calculateDistanceKm(props.km_start, props.km_end) || props.length_km || "-",
            responsibleOffice: props.responsible_office || layer.metadata?.responsibleOffice || offices[0]?.name || "",
            highwayType: props.highway_type === "SECOND_HIGHWAY" || props.highway_type === "MAIN_HIGHWAY" ? props.highway_type : isSec ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY",
            lanes: normalizeLanes(props.lanes || layer.metadata?.lanes || "4"),
            surface: normalizeSurface(props.surface || layer.metadata?.surface || "AC."),
            remarks: props.remarks || layer.metadata?.remarks || "-",
            isVisible: props.is_visible !== false,
            pointsCount: feature.geometry?.coordinates?.length || 0,
          });
        });
      }
    });

    return list.sort((a, b) => {
      const aNumber = Number(String(a.routeNo).match(/\d+/)?.[0] ?? Infinity);
      const bNumber = Number(String(b.routeNo).match(/\d+/)?.[0] ?? Infinity);
      return aNumber - bNumber || String(a.routeNo).localeCompare(String(b.routeNo), "th", { numeric: true }) || (kilometerPostMeters(a.kmStart) ?? Infinity) - (kilometerPostMeters(b.kmStart) ?? Infinity);
    });
  })();

  const handleExportHighwayGis = async (format: GisExportFormat) => {
    if (format === "csv") return handleExportHighwaySpecsCSV();
    const features = matchingHighwayFeatures.flatMap((item) => {
      const layer = (systemData.highwayLayers || []).find((candidate) => candidate.layer_id === item.layerId);
      const feature = layer?.geojson_data?.features?.[item.featureIdx];
      if (!feature?.geometry || feature.geometry.type !== "LineString") return [];
      return [{
        type: "Feature" as const,
        properties: {
          ...(feature.properties || {}), route_no: item.routeNo, section_name: item.sectionName,
          highway_type: item.highwayType, km_start: item.kmStart, km_end: item.kmEnd,
        },
        geometry: { type: "LineString" as const, coordinates: feature.geometry.coordinates },
      }];
    });
    if (!features.length) return onToast("ไม่มีแนวเส้นตามผลการค้นหาสำหรับส่งออก GIS");
    await exportLineFeatures(features, format, `highway-network-${new Date().toISOString().slice(0, 10)}`);
    onToast(`ส่งออก ${format.toUpperCase()} สำเร็จ`);
  };
  const matchingHighwayFeatures = allHighwayFeatures.filter((item) =>
    [item.routeNo, item.sectionName, item.kmStart, item.kmEnd, item.responsibleOffice, item.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"]
      .some((value) => String(value).toLocaleLowerCase("th").includes(routeSearch.trim().toLocaleLowerCase("th")))
  );

  // Grouped highway sections (Parent-Child)
  const highwaySectionGroups = useMemo(() => {
    return groupHighwayFeatures(systemData.highwayLayers || []);
  }, [systemData.highwayLayers]);

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [highwayFilterVisibility, setHighwayFilterVisibility] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");
  const [highwayFilterType, setHighwayFilterType] = useState<"ALL" | "MAIN" | "SECONDARY">("ALL");
  const [highwayFilterOffice, setHighwayFilterOffice] = useState<string>("ALL");

  const availableOffices = useMemo(() => {
    const set = new Set<string>();
    highwaySectionGroups.forEach((g) => {
      if (g.responsibleOffice && g.responsibleOffice.trim()) {
        set.add(g.responsibleOffice.trim());
      }
    });
    return Array.from(set).sort();
  }, [highwaySectionGroups]);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const matchingHighwayGroups = useMemo(() => {
    const query = routeSearch.trim().toLocaleLowerCase("th");
    return highwaySectionGroups.filter((group) => {
      // 1. Visibility filter
      if (highwayFilterVisibility === "VISIBLE" && !group.isVisible) return false;
      if (highwayFilterVisibility === "HIDDEN" && group.isVisible) return false;

      // 2. Highway Type filter
      if (highwayFilterType === "MAIN" && group.highwayType !== "MAIN_HIGHWAY") return false;
      if (highwayFilterType === "SECONDARY" && group.highwayType !== "SECOND_HIGHWAY") return false;

      // 3. Responsible Office filter
      if (highwayFilterOffice !== "ALL" && group.responsibleOffice !== highwayFilterOffice) return false;

      // 4. Text Search
      if (!query) return true;
      const fields = [
        group.routeNo,
        group.sectionName,
        group.kmStart,
        group.kmEnd,
        group.responsibleOffice,
        group.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง",
        ...group.branches.map((b) => b.branchLabel),
      ];
      return fields.some((val) => String(val).toLocaleLowerCase("th").includes(query));
    });
  }, [highwaySectionGroups, routeSearch, highwayFilterVisibility, highwayFilterType, highwayFilterOffice]);

  // Handle GIS File Upload (KML, KMZ, Shapefile .zip, GeoJSON, GPX)
  const handleGisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onToast(`กำลังตรวจสอบและวิเคราะห์โครงข่าย ${file.name}...`);
    try {
      let extractedFeatures: ExtractedGisFeature[] = [];
      const lower = file.name.toLowerCase();

      extractedFeatures = await readRouteFile(file);

      if (extractedFeatures.length === 0) {
        throw new Error("ไม่พบแนวเส้นทาง (LineString) ในไฟล์ หรือรูปแบบพิกัดไม่ใช่ WGS84");
      }

      // Simplify coordinates with Douglas-Peucker
      const simplified = await simplifyInWorker(extractedFeatures, simplifyTolerance);
      const decimatedFeatures = simplified.map((f) => ({
        ...f,
        coords: f.coords
          .map(([lon, lat]) => [Number(lon), Number(lat)] as [number, number])
          .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90),
      })).filter((f) => f.coords.length >= 2);

      if (!decimatedFeatures.length) {
        throw new Error("ไม่พบแนวเส้นที่มีพิกัด WGS84 ถูกต้องหลังตรวจสอบไฟล์");
      }

      setImportedGisFeatures(decimatedFeatures);
      const decimatedLines = previewLines(decimatedFeatures);
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

      showSuccessModal(
        "ตรวจสอบโครงข่ายสำเร็จ (Dual-Color Preview)",
        `พบเส้นทาง ${decimatedFeatures.length} เส้นในไฟล์ และตรวจพบ ${fields.length} ฟิลด์ข้อมูล ระบบแสดงเส้นสีน้ำเงินตรวจสอบบนแผนที่แล้ว`
      );
    } catch (err: any) {
      if (showErrorModal) {
        showErrorModal(
          "ไฟล์ข้อมูลไม่ถูกต้อง",
          err.message || "กรุณาตรวจสอบระบบพิกัด EPSG:4326 (WGS84) และชนิดข้อมูลต้องเป็น LineString"
        );
      } else {
        onToast("ข้อผิดพลาด: " + (err.message || "ไฟล์ข้อมูลไม่ถูกต้อง"));
      }
    }
  };

  // Re-simplify tolerance on demand
  const handleResimplifyTolerance = async (newTol: number) => {
    setSimplifyTolerance(newTol);
    if (importedGisFeatures.length > 0) {
      try {
        // Keep potentially large re-simplification work off the UI thread too.
        const reDecimated = await simplifyInWorker(importedGisFeatures, newTol);
        setImportedGisFeatures(reDecimated);
        const lines = previewLines(reDecimated);
        setImportedPreviewLines(lines);
        setIncomingGisLines?.(lines);
      } catch (error) {
        onToast(error instanceof Error ? error.message : "ไม่สามารถลดจำนวนจุดเส้นทางได้");
      }
    }
  };

  // Commit GIS Layer to System
  const handleCommitGisLayer = async () => {
    if (!importedGisFeatures || importedGisFeatures.length === 0) {
      onToast("ยังไม่มีข้อมูลเส้นทางที่นำเข้า");
      return;
    }
    const isSec = targetLayerCategory === "SECOND_HIGHWAY";
    // Each import gets its own layer so uploading a second file never replaces
    // the existing primary or secondary network.
    const layerId = `IMPORT-${crypto.randomUUID()}`;
    const colorHex = isSec ? (lineStyles.secondary?.color || "#0284c7") : (lineStyles.primary?.color || "#1B5E20");
    const lineWidth = isSec ? (lineStyles.secondary?.weight || 3.5) : (lineStyles.primary?.weight || 5);

    const validFeatures = importedGisFeatures.filter((feature) =>
      feature.coords.length >= 2 && feature.coords.every(([lon, lat]) =>
        Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
      )
    );
    if (validFeatures.length !== importedGisFeatures.length) {
      onToast("พบพิกัดเส้นทางไม่ถูกต้อง โปรดนำเข้าไฟล์ใหม่ในระบบพิกัด WGS84");
      return;
    }

    const geojsonData = {
      type: "FeatureCollection",
      features: validFeatures.map((f, idx) => {
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
            highway_type: targetLayerCategory,
            length_km: f.lengthKm,
            points_count: f.coords.length,
            layer_name: importedLayerName,
            label_mode: labelDisplayMode,
          },
          geometry: { type: "LineString", coordinates: f.coords },
        };
      }),
    };

    setIsCommitting(true);
    try {
      const res = await updateHighwayLayerAction({
        layerId,
        layerName: importedLayerName || (isSec ? "ทางหลวงสายรอง" : "ทางหลวงสายหลัก"),
        colorHex,
        lineWidth,
        geojsonData,
        metadata: {
          lanes: layerLanes,
          surface: layerSurface,
          responsibleOffice: layerResponsibleOffice,
          speedLimit: layerSpeedLimit,
          roadStatus: layerRoadStatus,
          remarks: layerRemarks,
        },
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setImportedPreviewLines([]);
        setImportedGisFeatures([]);
        setIncomingGisLines?.([]);
        setImportedLayerName("");
        setAvailableGisFields([]);
        showSuccessModal(
          "บันทึกโครงข่ายสายทางสำเร็จ",
          `โครงข่ายจำนวน ${geojsonData.features.length} เส้นทาง พร้อมป้ายกำกับชื่อสายทาง ถูกจัดเก็บและแสดงบนแผนที่เรียบร้อยแล้ว`
        );
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    } finally {
      setIsCommitting(false);
    }
  };

  // Delete Highway Layer
  const handleDeleteHighwayLayer = (layerId: string, layerName: string) => {
    showConfirmModal(
      "ยืนยันการลบเลเยอร์โครงข่าย?",
      `ท่านกำลังจะลบชั้นข้อมูล [${layerName}] (${layerId}) ออกจากแผนที่ระบบ`,
      async () => {
        try {
          const res = await deleteHighwayLayerAction(layerId);
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบชั้นข้อมูลสำเร็จ", `ลบเลเยอร์ [${layerName}] ออกจากระบบเรียบร้อย`);
          }
        } catch (e: any) {
          onToast("ข้อผิดพลาดในการลบเลเยอร์: " + e.message);
        }
      }
    );
  };

  return (
    <div className="space-y-6 w-full max-w-none min-w-0">
      <div className="border-b border-slate-800 pb-3">
        <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-amber-400" /> โครงข่ายสายทาง
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          จัดการสายทางและนำเข้าข้อมูล GIS
        </p>
      </div>

      {/* Upload Dropzone */}
      <div className="bg-slate-950 p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400 transition space-y-3 text-center">
        <Upload className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
        <div>
          <h4 className="font-heading font-bold text-sm text-white">เลือกไฟล์โครงข่ายเส้นทางหลวง</h4>
          <p className="text-xs text-slate-400 mt-1">
            รองรับ .kml, .kmz, .zip หรือ .shp (Shapefile), .geojson, .json, .gpx (พิกัด EPSG:4326)
          </p>
        </div>
        <label className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg transition">
          เปิดเลือกไฟล์จากคอมพิวเตอร์
          <input
            type="file"
            accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json,application/json"
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
                <label className="text-slate-300 block mb-1">ฟิลด์รหัสสายทาง</label>
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
                <label className="text-slate-300 block mb-1">ฟิลด์ชื่อสายทาง / ป้ายกำกับ</label>
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
                <label className="text-slate-300 block mb-1">ประเภททางหลวง</label>
                <select
                  value={targetLayerCategory}
                  onChange={(e: any) => setTargetLayerCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก</option>
                  <option value="SECOND_HIGHWAY">ทางหลวงสายรอง</option>
                </select>
              </div>

              {/* Field 4: Label Display Mode */}
              <div>
                <label className="text-slate-300 block mb-1">โหมดการแสดงป้ายชื่อบนแผนที่</label>
                <select
                  value={labelDisplayMode}
                  onChange={(e: any) => setLabelDisplayMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="hover">แสดงเมื่อเลื่อนเมาส์ชี้</option>
                  <option value="permanent">แสดงตลอดเวลาบนแนวเส้น</option>
                  <option value="click">แสดงเมื่อคลิกดูรายละเอียด</option>
                </select>
              </div>
            </div>

            {/* Extended Highway Specifications */}
            <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-sky-950/60 space-y-3">
              <div className="flex items-center gap-2 text-sky-400 font-heading font-semibold text-xs border-b border-sky-950 pb-1.5">
                <Building className="w-4 h-4 text-sky-400" />
                <span>กำหนดรายละเอียดและคุณสมบัติทางวิศวกรรมของเส้นทาง</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {/* Lanes */}
                <div>
                  <label className="text-slate-300 block mb-1">จำนวนช่องจราจร</label>
                  <select
                    value={layerLanes}
                    onChange={(e) => setLayerLanes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="2 ช่องจราจร">2 ช่องจราจร</option>
                    <option value="3 ช่องจราจร">3 ช่องจราจร</option>
                    <option value="4 ช่องจราจร">4 ช่องจราจร</option>
                    <option value="6 ช่องจราจร">6 ช่องจราจร</option>
                    <option value="8 ช่องจราจร">8 ช่องจราจร</option>
                  </select>
                </div>

                {/* Surface Type */}
                <div>
                  <label className="text-slate-300 block mb-1">ชนิดผิวจราจร</label>
                  <select
                    value={layerSurface}
                    onChange={(e) => setLayerSurface(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="AC.">AC.</option>
                    <option value="Conc.">Conc.</option>
                    <option value="DST.">DST.</option>
                  </select>
                </div>

                {/* Responsible Subdivision */}
                <div>
                  <label className="text-slate-300 block mb-1">หน่วยงานรับผิดชอบ</label>
                  <select
                    value={layerResponsibleOffice}
                    onChange={(e) => setLayerResponsibleOffice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-medium"
                  >
                    {offices.map((office) => <option key={office.id} value={office.name}>{office.name}</option>)}
                  </select>
                </div>

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
              disabled={isCommitting}
              onClick={handleCommitGisLayer}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {isCommitting ? "กำลังบันทึก..." : "บันทึกโครงข่ายเข้าสู่ระบบ"}
            </button>
          </div>
        </div>
      )}

      {/* Highway Layers in System */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-sm text-white">เลเยอร์โครงข่ายเดิมในระบบ</h3>
        <div className="space-y-2">
          {(systemData.highwayLayers || []).map((layer) => {
            const firstType = layer.geojson_data?.features?.[0]?.properties?.highway_type;
            const isMain = firstType === "MAIN_HIGHWAY" || (firstType !== "SECOND_HIGHWAY" && layer.layer_id !== "SECOND_HIGHWAY");
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
                      รหัส: {layer.layer_id} • สี: {layerColor} • จำนวน {layer.geojson_data?.features?.length || 0} สายทาง
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-heading font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> เปิดใช้งานบนแผนที่
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHighwayLayer(layer.layer_id, layer.layer_name)}
                    title="ลบเลเยอร์โครงข่าย"
                    className="p-1.5 bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Highway Specifications Table (Issue #13) */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-400" /> ตารางรายการทางหลวงและคุณสมบัติทางวิศวกรรม
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              คลิกไอคอนรูปดวงตาเพื่อ เปิด/ปิด การแสดงผลเส้นทาง หรือคลิก &quot;ตั้งค่า&quot; เพื่อปรับแต่งช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) ผิวจราจร และข้อมูลเฉพาะสายทาง
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-[11px] bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-xl text-amber-300 font-mono">
              {highwaySectionGroups.length} ตอนควบคุม ({allHighwayFeatures.length} เส้นย่อย)
            </span>
            <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 shadow-sm">
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <select aria-label="ส่งออกโครงข่ายตามผลการค้นหา" defaultValue="" onChange={(e) => { if (e.target.value) void handleExportHighwayGis(e.target.value as GisExportFormat); e.target.value = ""; }} className="min-h-10 bg-transparent font-heading outline-none">
                <option value="" disabled>ส่งออกตามผลค้นหา…</option>
                <option value="csv">CSV</option><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="kmz">KMZ</option><option value="shapefile">Shapefile ZIP</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                setEditingRouteSpecs({
                  layerId: "MAIN_HIGHWAY",
                  featureIdx: -1,
                  routeNo: "",
                  sectionName: "",
                  kmStart: "",
                  kmEnd: "",
                  lengthKm: "",
                  responsibleOffice: offices[0]?.name || "",
                  highwayType: "MAIN_HIGHWAY",
                  lanes: "4 ช่องจราจร",
                  surface: "AC.",
                  remarks: "",
                  isVisible: true,
                })
              }
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ เพิ่มสายทางใหม่</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="block text-xs text-slate-300">
              <span className="font-heading font-medium">ค้นหาสายทาง</span>
              <input
                type="search"
                value={routeSearch}
                onChange={(event) => setRouteSearch(event.target.value)}
                placeholder="หมายเลข ชื่อตอน ก.ม. หรือหน่วยงาน"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300">
              <span className="font-heading font-medium">สถานะแสดงผลบนแผนที่</span>
              <select
                aria-label="กรองสถานะแสดงผลบนแผนที่"
                value={highwayFilterVisibility}
                onChange={(e) => setHighwayFilterVisibility(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="ALL">ทั้งหมด (แสดงและซ่อน)</option>
                <option value="VISIBLE">เฉพาะที่แสดงบนแผนที่ (Eye)</option>
                <option value="HIDDEN">เฉพาะที่ซ่อนอยู่ (EyeOff)</option>
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              <span className="font-heading font-medium">ประเภทสายทาง</span>
              <select
                aria-label="กรองประเภทสายทาง"
                value={highwayFilterType}
                onChange={(e) => setHighwayFilterType(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="ALL">ทุกประเภททางหลวง</option>
                <option value="MAIN">ทางหลวงสายหลัก</option>
                <option value="SECONDARY">ทางหลวงสายรอง</option>
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              <span className="font-heading font-medium">หน่วยงานรับผิดชอบ</span>
              <select
                aria-label="กรองหน่วยงานรับผิดชอบ"
                value={highwayFilterOffice}
                onChange={(e) => setHighwayFilterOffice(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-300 focus:border-amber-400 focus:outline-none font-medium"
              >
                <option value="ALL">ทุกหน่วยงาน/หมวดทางหลวง</option>
                {availableOffices.map((off) => (
                  <option key={off} value={off}>
                    {off}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {matchingHighwayGroups.length === 0 ? (
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
            {highwaySectionGroups.length === 0 ? "ยังไม่มีรายการเส้นทางในระบบ กรุณาอัปโหลดไฟล์ด้านบน" : "ไม่พบสายทางที่ตรงกับคำค้นหาและตัวกรองที่เลือก"}
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
            <table className="w-full min-w-[880px] text-left text-xs text-slate-300">
              <thead className="bg-[#091122] text-slate-400 font-heading border-b border-slate-800">
                <tr>
                  <th className="p-3 w-10 text-center sticky left-0 bg-[#091122] z-10">#</th>
                  <th className="p-3 w-16 text-center sticky left-10 bg-[#091122] z-10 whitespace-nowrap">แสดงผล</th>
                  <th className="p-3 whitespace-nowrap min-w-[120px]">หมายเลขทางหลวง</th>
                  <th className="p-3 whitespace-nowrap min-w-[200px]">ชื่อสายทาง / ตอนควบคุม</th>
                  <th className="p-3 whitespace-nowrap min-w-[140px]">ช่วง กม. & ระยะทาง</th>
                  <th className="p-3 whitespace-nowrap min-w-[130px]">ช่องจราจร & ผิวทาง</th>
                  <th className="p-3 whitespace-nowrap min-w-[140px]">หน่วยงานรับผิดชอบ</th>
                  <th className="p-3 min-w-[120px]">หมายเหตุ</th>
                  <th className="p-3 text-right whitespace-nowrap sticky right-0 bg-[#091122] z-10">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-body">
                {matchingHighwayGroups.map((group, gIdx) => {
                  const isExpanded = expandedGroupIds.has(group.groupId);
                  const isMultiBranch = group.branches.length > 1;
                  const primaryBranch = group.primaryBranch || group.branches[0];

                  return (
                    <React.Fragment key={group.groupId}>
                      {/* แถวหลัก (Parent Control Section) */}
                      <tr
                        onClick={(event) => {
                          if (!(event.target as HTMLElement).closest("button")) {
                            if (isMultiBranch) {
                              toggleGroupExpand(group.groupId);
                            }
                            if (primaryBranch) {
                              setSelectedRoute({ layerId: group.layerId, featureIdx: primaryBranch.featureIdx });
                            }
                          }
                        }}
                        className={`cursor-pointer hover:bg-slate-900/60 transition ${
                          !group.isVisible ? "opacity-50 bg-slate-950/40" : isExpanded ? "bg-slate-900/30" : ""
                        }`}
                      >
                        <td className="p-3 text-center font-mono text-slate-400 sticky left-0 bg-[#090d16] z-10">{gIdx + 1}</td>
                        <td className="p-3 text-center sticky left-10 bg-[#090d16] z-10">
                          <button
                            type="button"
                            onClick={() => handleToggleGroupVisibility(group)}
                            className={`p-1.5 rounded-lg border transition ${
                              group.isVisible
                                ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                                : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                            }`}
                            title={group.isVisible ? "คลิกเพื่อซ่อนสายทางนี้บนแผนที่" : "คลิกเพื่อแสดงสายทางนี้บนแผนที่"}
                          >
                            {group.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="p-3">
                          <span className="font-heading font-black text-xs px-2 py-0.5 rounded bg-amber-400 text-slate-950 shadow-sm inline-block whitespace-nowrap">
                            ทล.{group.routeNo}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white max-w-[240px] truncate" title={group.sectionName}>
                              {group.sectionName}
                            </span>
                            {isMultiBranch ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGroupExpand(group.groupId);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-sky-950/90 text-sky-300 border border-sky-600/70 hover:bg-sky-900 transition font-medium whitespace-nowrap"
                                title={isExpanded ? "คลิกเพื่อย่อรายละเอียด ๒ ฝั่ง" : "คลิกเพื่อดูรายละเอียดเส้นทางทั้ง ๒ ฝั่ง"}
                              >
                                {isExpanded ? <ChevronDown className="w-3 h-3 text-sky-400" /> : <ChevronRight className="w-3 h-3 text-sky-400" />}
                                <span>{group.branches.length} ฝั่ง ({group.branches.map((b) => b.directionCode === "A_TO_B" ? "A→B" : b.directionCode === "B_TO_A" ? "B→A" : "A⇄B").join(", ")})</span>
                              </button>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-400 border border-slate-700 whitespace-nowrap">
                                คันทางเดี่ยว
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                          <div className="text-amber-300">{group.kmStart} - {group.kmEnd}</div>
                          <div className="text-emerald-400 text-[10px]">{group.lengthKm ? `${group.lengthKm} กม.` : "-"}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-950 text-sky-300 border border-sky-700 font-mono">
                            {group.lanes}
                          </span>
                          <span className="ml-1 text-[11px] text-slate-300 font-mono">{group.surface}</span>
                        </td>
                        <td className="p-3 text-[11px] text-slate-300 whitespace-nowrap">
                          {group.responsibleOffice}
                        </td>
                        <td className="p-3 text-[11px] text-slate-400 max-w-[120px] truncate" title={group.remarks}>
                          {group.remarks || "-"}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-[#090d16] z-10">
                          <div className="inline-flex items-center gap-1.5">
                            {isMultiBranch && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGroupExpand(group.groupId);
                                }}
                                className="p-1.5 bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 rounded-xl text-xs transition"
                                title={isExpanded ? "ย่อรายละเอียดเส้น ๒ ฝั่ง" : "เปิดดูรายละเอียดเส้น ๒ ฝั่ง"}
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            {primaryBranch && (
                              <button
                                type="button"
                                onClick={() => openGeometryEditor(group.layerId, primaryBranch.featureIdx)}
                                className="bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 px-2.5 py-1.5 rounded-xl font-heading text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                                title="แก้แนวถนน ปักจุดและเกาะแนวถนน"
                              >
                                <MapPin className="w-3.5 h-3.5" /> แนวถนน
                              </button>
                            )}
                            {primaryBranch && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingRouteSpecs({
                                    layerId: group.layerId,
                                    featureIdx: primaryBranch.featureIdx,
                                    routeNo: group.routeNo,
                                    sectionName: group.sectionName,
                                    kmStart: group.kmStart !== "-" ? group.kmStart : "",
                                    kmEnd: group.kmEnd !== "-" ? group.kmEnd : "",
                                    lengthKm: group.lengthKm !== "-" ? group.lengthKm : "",
                                    responsibleOffice: group.responsibleOffice,
                                    highwayType: group.highwayType,
                                    lanes: group.lanes,
                                    surface: group.surface,
                                    remarks: group.remarks !== "-" ? group.remarks : "",
                                    isVisible: group.isVisible,
                                  })
                                }
                                className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 px-2.5 py-1.5 rounded-xl font-heading text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                                title="ตั้งค่าคุณสมบัติทางวิศวกรรม"
                              >
                                <Sliders className="w-3.5 h-3.5 text-amber-400" /> ตั้งค่า
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteHighwayGroup(group)}
                              className="p-1.5 bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 rounded-xl transition shadow-sm"
                              title="ลบสายทางนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* แถวย่อย Child Branches (เมื่อกดขยาย) */}
                      {isExpanded && isMultiBranch && group.branches.map((branch, bIdx) => {
                        const isBranchVis = branch.properties?.is_visible !== false;
                        return (
                          <tr
                            key={`${group.groupId}-b-${branch.featureIdx}`}
                            onClick={(event) => {
                              if (!(event.target as HTMLElement).closest("button")) {
                                setSelectedRoute({ layerId: group.layerId, featureIdx: branch.featureIdx });
                              }
                            }}
                            className={`cursor-pointer bg-slate-900/40 hover:bg-slate-900/80 transition text-xs border-l-4 ${
                              branch.directionCode === "A_TO_B"
                                ? "border-l-sky-500"
                                : branch.directionCode === "B_TO_A"
                                ? "border-l-indigo-500"
                                : "border-l-amber-500"
                            } ${!isBranchVis ? "opacity-50" : ""}`}
                          >
                            <td className="p-2.5 text-center font-mono text-slate-500 text-[11px] sticky left-0 bg-[#0c1322] z-10">
                              ↳ {bIdx + 1}
                            </td>
                            <td className="p-2.5 text-center sticky left-10 bg-[#0c1322] z-10">
                              <button
                                type="button"
                                onClick={() => handleToggleFeatureVisibility(group.layerId, branch.featureIdx)}
                                className={`p-1 rounded-md border transition ${
                                  isBranchVis
                                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                                    : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                                }`}
                                title={isBranchVis ? "คลิกเพื่อซ่อนเส้นฝั่งนี้บนแผนที่" : "คลิกเพื่อแสดงเส้นฝั่งนี้บนแผนที่"}
                              >
                                {isBranchVis ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap inline-block ${
                                branch.directionCode === "A_TO_B"
                                  ? "bg-sky-950 text-sky-300 border border-sky-600"
                                  : branch.directionCode === "B_TO_A"
                                  ? "bg-indigo-950 text-indigo-300 border border-indigo-600"
                                  : "bg-slate-800 text-slate-300 border border-slate-600"
                              }`}>
                                {branch.directionCode === "A_TO_B" ? "ขาไป (A → B)" : branch.directionCode === "B_TO_A" ? "ขากลับ (B → A)" : "๒ ทิศทาง"}
                              </span>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className="text-slate-300 font-medium">{branch.branchLabel}</span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">
                              <div className="text-amber-300/90">{formatKilometerPost(branch.properties?.km_start) || group.kmStart} - {formatKilometerPost(branch.properties?.km_end) || group.kmEnd}</div>
                              <div className="text-emerald-400/90 text-[10px]">{branch.geometricLengthKm ? `${branch.geometricLengthKm} กม.` : `${group.lengthKm} กม.`}</div>
                            </td>
                            <td className="p-2.5 text-[11px] whitespace-nowrap">
                              <span className="font-mono text-slate-300">{group.lanes}</span>
                              <span className="ml-1 text-[10px] text-slate-500 font-mono">{group.surface}</span>
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                              {group.responsibleOffice}
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-500 truncate max-w-[120px]" title={branch.properties?.remarks}>
                              {branch.properties?.remarks || "-"}
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap sticky right-0 bg-[#0c1322] z-10">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openGeometryEditor(group.layerId, branch.featureIdx)}
                                  className="bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 px-2 py-1 rounded-lg font-heading text-[11px] font-bold transition inline-flex items-center gap-1 shadow-sm"
                                  title={`แก้ไขแนวถนนฝั่ง ${branch.branchLabel}`}
                                >
                                  <MapPin className="w-3 h-3" /> แนวถนน
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingRouteSpecs({
                                      layerId: group.layerId,
                                      featureIdx: branch.featureIdx,
                                      routeNo: group.routeNo,
                                      sectionName: branch.properties?.section_name || group.sectionName,
                                      kmStart: branch.properties?.km_start ? formatKilometerPost(branch.properties.km_start) : group.kmStart,
                                      kmEnd: branch.properties?.km_end ? formatKilometerPost(branch.properties.km_end) : group.kmEnd,
                                      lengthKm: branch.properties?.length_km ? String(branch.properties.length_km) : group.lengthKm,
                                      responsibleOffice: group.responsibleOffice,
                                      highwayType: group.highwayType,
                                      lanes: group.lanes,
                                      surface: group.surface,
                                      remarks: branch.properties?.remarks || group.remarks,
                                      isVisible: branch.properties?.is_visible !== false,
                                    })
                                  }
                                  className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 px-2 py-1 rounded-lg font-heading text-[11px] font-bold transition inline-flex items-center gap-1 shadow-sm"
                                  title={`ตั้งค่าคุณสมบัติฝั่ง ${branch.branchLabel}`}
                                >
                                  <Sliders className="w-3 h-3 text-amber-400" /> ตั้งค่า
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteHighwayFeature(
                                      group.layerId,
                                      branch.featureIdx,
                                      `ทล.${group.routeNo} ${branch.branchLabel}`
                                    )
                                  }
                                  className="p-1 bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 rounded-lg transition shadow-sm"
                                  title="ลบเส้นทางฝั่งนี้"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Highway Specifications Editor (Issue #13) */}
      {editingRouteSpecs && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div ref={specsDialog.dialogRef} role="dialog" aria-modal="true" aria-label="ตั้งค่าคุณสมบัติทางวิศวกรรม" tabIndex={-1} onKeyDown={specsDialog.onKeyDown} className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <span>ตั้งค่าคุณสมบัติทางวิศวกรรม</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  ทล.{editingRouteSpecs.routeNo} {editingRouteSpecs.sectionName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRouteSpecs(null)}
                aria-label="ปิดหน้าต่างแก้ไขคุณสมบัติ"
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Row 1: Route No & Section Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">หมายเลขทางหลวง *</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.routeNo}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, routeNo: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-slate-300 block mb-1">ชื่อสายทาง / ตอนควบคุม *</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.sectionName}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, sectionName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Row 2: KM Range & Distance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">กม.เริ่มต้น</label>
                  <input
                    type="text"
                    aria-label="กม.เริ่มต้น"
                    value={editingRouteSpecs.kmStart}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingRouteSpecs({
                        ...editingRouteSpecs,
                        kmStart: val,
                        lengthKm: calculateDistanceKm(val, editingRouteSpecs.kmEnd),
                      });
                    }}
                    onBlur={() => setEditingRouteSpecs((current) => current ? { ...current, kmStart: formatKilometerPost(current.kmStart) } : current)}
                    placeholder="เช่น 12+500"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">กม.สิ้นสุด</label>
                  <input
                    type="text"
                    aria-label="กม.สิ้นสุด"
                    value={editingRouteSpecs.kmEnd}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingRouteSpecs({
                        ...editingRouteSpecs,
                        kmEnd: val,
                        lengthKm: calculateDistanceKm(editingRouteSpecs.kmStart, val),
                      });
                    }}
                    onBlur={() => setEditingRouteSpecs((current) => current ? { ...current, kmEnd: formatKilometerPost(current.kmEnd) } : current)}
                    placeholder="เช่น 18+200"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ระยะทาง (กม.) · คำนวณอัตโนมัติ</label>
                  <input
                    type="number"
                    step="any"
                    value={editingRouteSpecs.lengthKm}
                    readOnly
                    aria-label="ระยะทางคำนวณอัตโนมัติ"
                    placeholder="เช่น 5.7"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Row 3: Lanes (Affects Map line width) & Surface */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">
                    จำนวนช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) *
                  </label>
                  <select
                    value={editingRouteSpecs.lanes}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, lanes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sky-300 font-heading font-medium"
                  >
                    <option value="2 ช่องจราจร">2 ช่องจราจร</option>
                    <option value="3 ช่องจราจร">3 ช่องจราจร</option>
                    <option value="4 ช่องจราจร">4 ช่องจราจร</option>
                    <option value="6 ช่องจราจร">6 ช่องจราจร</option>
                    <option value="8 ช่องจราจร">8 ช่องจราจร</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ชนิดผิวจราจร</label>
                  <select
                    value={editingRouteSpecs.surface}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, surface: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-300"
                  >
                    <option value="AC.">AC.</option>
                    <option value="Conc.">Conc.</option>
                    <option value="DST.">DST.</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Responsible Office & Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">หน่วยงานที่รับผิดชอบ *</label>
                  <select
                    value={editingRouteSpecs.responsibleOffice}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, responsibleOffice: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    {offices.map((office) => <option key={office.id} value={office.name}>{office.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ประเภททางหลวง</label>
                  <select
                    value={editingRouteSpecs.highwayType}
                    onChange={(e: any) => setEditingRouteSpecs({ ...editingRouteSpecs, highwayType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก</option>
                    <option value="SECOND_HIGHWAY">ทางหลวงสายรอง</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Remarks */}
              <div>
                <label className="text-slate-300 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={editingRouteSpecs.remarks}
                  onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, remarks: e.target.value })}
                  placeholder="เช่น เส้นทางหลักเชื่อมโยง สงขลา - ปัตตานี"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Row 6: Visibility Switch */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-heading font-bold text-white block">
                    แสดงผลบนแผนที่
                  </span>
                  <span className="text-[11px] text-slate-400">
                    เปิดเพื่อให้เส้นทางนี้ปรากฏบนแผนที่ของทั้งประชาชนและเจ้าหน้าที่
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRouteSpecs.isVisible}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, isVisible: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRouteSpecs(null)}
                className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveRouteSpecsModal}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> บันทึกคุณสมบัติทางวิศวกรรม
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRoute && (() => {
        const item = allHighwayFeatures.find((entry) => entry.layerId === selectedRoute.layerId && entry.featureIdx === selectedRoute.featureIdx);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="รายละเอียดสายทาง">
            <div ref={routeDialog.dialogRef} tabIndex={-1} onKeyDown={routeDialog.onKeyDown} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 text-white shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2.5 py-1 text-sm font-black font-heading">
                    ทล.{item.routeNo}
                  </span>
                  <span className="text-base font-bold font-heading text-white truncate max-w-[280px] sm:max-w-xs">
                    {item.sectionName}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="ปิดรายละเอียด"
                  onClick={() => setSelectedRoute(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Categorized Specifications Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 flex items-center justify-between">
                  <span className="text-slate-400">ประเภทสายทาง</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${item.highwayType === "MAIN_HIGHWAY"
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                      : "border-sky-500/40 bg-sky-500/15 text-sky-400"
                    }`}>
                    {item.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 block">ช่วงหลักกิโลเมตร</span>
                  <p className="font-mono text-sm font-bold text-amber-300">
                    กม. {item.kmStart} ถึง {item.kmEnd}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 block">ระยะทางตลอดสาย</span>
                  <p className="font-mono text-sm font-bold text-sky-300">
                    {item.lengthKm} กม.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 block">จำนวนช่องจราจร</span>
                  <p className="text-sm font-medium text-slate-200">
                    {item.lanes}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
                  <span className="text-[11px] text-slate-400 block">ชนิดผิวจราจร</span>
                  <p className="text-sm font-medium text-slate-200">
                    {item.surface}
                  </p>
                </div>

                <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
                  <span className="text-slate-400">หน่วยงานรับผิดชอบ</span>
                  <span className="text-slate-200 font-medium">
                    {item.responsibleOffice || "ไม่ระบุ"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold font-heading text-slate-950 transition shadow-md"
                  onClick={() => {
                    setSelectedRoute(null);
                    setEditingRouteSpecs({
                      ...item,
                      kmStart: item.kmStart === "-" ? "" : item.kmStart,
                      kmEnd: item.kmEnd === "-" ? "" : item.kmEnd,
                      lengthKm: item.lengthKm === "-" ? "" : item.lengthKm,
                    });
                  }}
                >
                  ตั้งค่า
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-bold font-heading text-slate-200 transition border border-slate-700"
                  onClick={() => {
                    setSelectedRoute(null);
                    openGeometryEditor(item.layerId, item.featureIdx);
                  }}
                >
                  แนวถนน
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-rose-950/80 hover:bg-rose-900 px-4 py-2.5 text-xs font-bold font-heading text-rose-300 transition border border-rose-800/60"
                  onClick={() => {
                    setSelectedRoute(null);
                    handleDeleteHighwayFeature(item.layerId, item.featureIdx, `ทล.${item.routeNo} ${item.sectionName}`);
                  }}
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {editingGeometry && (
        <div className="pointer-events-none fixed inset-x-2 bottom-2 z-[1000] flex justify-start lg:inset-y-20 lg:left-3 lg:right-auto">
          <div className="pointer-events-auto w-full lg:w-[min(38vw,520px)] max-h-[38vh] lg:max-h-full overflow-y-auto rounded-2xl border border-sky-500/60 bg-[#0c162c] p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-heading font-black text-white">ปรับแนวถนนทางหลวง</h3>
                <p className="text-xs text-slate-400">{editorMode === "free" ? "ลากหมุดบนเส้นเพื่อย้ายจุด เพิ่ม/ลบจุด ตัดหรือเชื่อมเส้นได้อิสระเหมือน Google My Maps" : "กำหนดต้นทาง–ปลายทาง แล้วสร้างแนวเกาะถนน จากนั้นลากจุดสีส้มเพื่อปรับแนว"}</p>
                {(() => {
                  const item = allHighwayFeatures.find((entry) => entry.layerId === editingGeometry.layerId && entry.featureIdx === editingGeometry.featureIdx);
                  return item ? <p className="mt-2 text-sm text-white">ทล.{item.routeNo} · {item.sectionName}<br />ก.ม. {item.kmStart} ถึง {item.kmEnd} · ระยะทาง {item.lengthKm} กม.</p> : null;
                })()}
              </div>
              <button type="button" aria-label="ปิดตัวแก้ไขแนวถนน" onClick={closeGeometryEditor} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex rounded-xl border border-slate-700 bg-slate-900 p-1 text-xs" role="group" aria-label="โหมดแก้ไขแนวถนน">
              <button type="button" aria-pressed={editorMode === "free"} onClick={() => switchEditorMode("free")} className={`flex-1 rounded-lg px-3 py-2 font-bold ${editorMode === "free" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"}`}>วาด/แก้ไขอิสระ</button>
              <button type="button" aria-pressed={editorMode === "road"} onClick={() => switchEditorMode("road")} className={`flex-1 rounded-lg px-3 py-2 font-bold ${editorMode === "road" ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"}`}>ตามถนน (OSRM)</button>
            </div>
            {/* Item 2: Road Structure & Directional Arrow Controls */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-300 block mb-1">โครงสร้างทางหลวงตามจริง</label>
                  <select
                    value={carriagewayStructure}
                    onChange={(e) => {
                      const val = e.target.value as "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY";
                      setCarriagewayStructure(val);
                      if (val === "SINGLE_CENTERLINE") {
                        setArrowDirectionSetting("TWO_WAY");
                        setDualReverseCoords([]);
                      } else if (val === "ONE_WAY") {
                        setArrowDirectionSetting("FORWARD");
                        setDualReverseCoords([]);
                      } else {
                        setArrowDirectionSetting("FORWARD");
                      }
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-amber-300 font-semibold"
                  >
                    <option value="SINGLE_CENTERLINE">ถนน 2 ทิศทาง (เส้นเดี่ยวกึ่งกลาง ⇄)</option>
                    <option value="DUAL_CARRIAGEWAY">ถนนมีเกาะกลาง (แยกเส้น A→B และ B→A ตามจริง)</option>
                    <option value="ONE_WAY">ถนนเดินรถทางเดียว (ลูกศรทิศทางเดียว →)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ทิศทางลูกศรจราจรบนเส้น</label>
                  <select
                    value={arrowDirectionSetting}
                    disabled={carriagewayStructure === "DUAL_CARRIAGEWAY"}
                    onChange={(e) => setArrowDirectionSetting(e.target.value as "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    <option value="TWO_WAY">⇄ สวนกัน 2 ทิศทาง (Two-Way)</option>
                    <option value="FORWARD">→ ทิศทางเดียวตามแนว A → B</option>
                    <option value="REVERSE">← ทิศทางเดียวตามแนว B → A</option>
                    <option value="UNKNOWN">ไม่ระบุทิศทาง (ซ่อนลูกศรเพื่อป้องกันการเดาทิศทาง)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={showFeatureArrows}
                    onChange={(e) => setShowFeatureArrows(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-400"
                  />
                  <span>แสดงลูกศรกำกับทิศทางบนสายทางนี้ (พรีวิวบนแผนที่ทันที)</span>
                </label>
                {carriagewayStructure === "DUAL_CARRIAGEWAY" && (
                  <span className="text-[10px] text-sky-300">
                    {dualReverseCoords.length >= 2
                      ? `✓ แยก 2 คันทางจริง (A→B ${draftCoordinates.length} จุด · B→A ${dualReverseCoords.length} จุด)`
                      : "กด \"เกาะแนวถนน\" เพื่อดึงเส้นคู่ขนานตามคันทางจริงจากโครงข่ายถนน"}
                  </span>
                )}
              </div>
            </div>
            {editorMode === "free" && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { key: "move", label: "ลากจุด", active: vertexTool === "move" && adminPickMode !== "ADD_LINE_VERTEX", onClick: () => { setVertexTool("move"); setAdminPickMode(null); } },
                    { key: "add", label: "เพิ่มจุด", active: adminPickMode === "ADD_LINE_VERTEX", onClick: () => { setVertexTool("move"); setAdminPickMode(adminPickMode === "ADD_LINE_VERTEX" ? null : "ADD_LINE_VERTEX"); } },
                    { key: "delete", label: "ลบจุด", active: vertexTool === "delete", onClick: () => { setAdminPickMode(null); setVertexTool(vertexTool === "delete" ? "move" : "delete"); } },
                    { key: "split", label: "ตัดเส้น", active: vertexTool === "split", onClick: () => { setAdminPickMode(null); setVertexTool(vertexTool === "split" ? "move" : "split"); } },
                  ] as const).map((tool) => (
                    <button key={tool.key} type="button" aria-pressed={tool.active} onClick={tool.onClick} className={`rounded-lg border px-3 py-2 text-xs font-bold ${tool.active ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-400"}`}>{tool.label}</button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  {adminPickMode === "ADD_LINE_VERTEX"
                    ? "คลิกบนแผนที่เพื่อเพิ่มจุด (คลิกใกล้ปลายเส้นเพื่อต่อเส้นออกไป)"
                    : vertexTool === "delete"
                      ? "คลิกที่หมุดจุดที่ต้องการลบ"
                      : vertexTool === "split"
                        ? "คลิกที่หมุดจุดกลางเส้นที่ต้องการตัดเส้นเป็น 2 ส่วน"
                        : "ลากหมุดเพื่อย้ายจุด · คลิกหมุด + กลางช่วงเส้นเพื่อเพิ่มจุด · คลิกขวา/กดค้างที่หมุดเพื่อลบจุด"}
                </p>
                {draftCoordinates.length > 400 && (
                  <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">เส้นนี้มี {draftCoordinates.length} จุด ซูมเข้าเพื่อให้เห็นหมุดทุกจุดและหมุด + ของช่วงที่ต้องการแก้</p>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                  <button type="button" disabled={historySize.undo === 0} onClick={undoEdit} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40">ย้อนกลับ</button>
                  <button type="button" disabled={historySize.redo === 0} onClick={redoEdit} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40">ทำซ้ำ</button>
                  <span className="text-[11px] text-slate-400">เส้นปัจจุบัน {draftCoordinates.length} จุด{splitRemainder ? ` · ส่วนที่ 2 ${splitRemainder.length} จุด (เส้นประสีฟ้า)` : ""}{absorbedFeatureIdxs.length > 0 ? ` · รวมสายทางอื่น ${absorbedFeatureIdxs.length} เส้น` : ""}</span>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-xs font-semibold text-slate-200">เชื่อมกับสายทางอื่นในเลเยอร์เดียวกัน</p>
                  <div className="flex flex-wrap gap-2">
                    <select aria-label="เลือกสายทางที่จะเชื่อม" value={joinTargetIdx} onChange={(event) => setJoinTargetIdx(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white">
                      <option value="">เลือกสายทางที่ปลายเส้นอยู่ใกล้ที่สุด...</option>
                      {joinCandidates.map((item) => (
                        <option key={item.idx} value={String(item.idx)}>{item.label} · ห่าง {item.gap < 1000 ? `${Math.round(item.gap)} ม.` : `${(item.gap / 1000).toFixed(1)} กม.`}</option>
                      ))}
                    </select>
                    <button type="button" disabled={!joinTargetIdx} onClick={handleJoinSelected} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">เชื่อมเส้น</button>
                  </div>
                  <p className="text-[11px] text-slate-500">แสดง 50 สายทางที่ปลายเส้นใกล้ที่สุด · ระบบต่อปลายเส้นที่ใกล้กันที่สุดและกลับทิศให้อัตโนมัติ</p>
                </div>
              </>
            )}
            {editorMode === "road" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(["start", "end"] as const).map((key) => {
                    const label = key === "start" ? "พิกัด กม.เริ่มต้น" : "พิกัด กม.สิ้นสุด";
                    return <div key={key} className="space-y-1.5">
                      <label className="text-xs text-slate-300">{label} · ละติจูด, ลองจิจูด</label>
                      <input key={`${key}-${editingGeometry[key].join(",")}`} aria-label={label} type="text" defaultValue={`${editingGeometry[key][1]}, ${editingGeometry[key][0]}`} placeholder="เช่น 6.850000, 101.250000" onBlur={(event) => {
                        const rawParts = event.target.value.split(",").map((value) => value.trim());
                        const parts = rawParts.map(Number);
                        if (rawParts.length !== 2 || rawParts.some((value) => !value) || parts.some((value) => !Number.isFinite(value)) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) { onToast("กรุณากรอกพิกัดเป็นละติจูด, ลองจิจูด"); event.target.value = `${editingGeometry[key][1]}, ${editingGeometry[key][0]}`; return; }
                        setEditingGeometry((current) => current ? { ...current, [key]: [parts[1], parts[0]] } : current);
                      }} className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 font-mono text-xs text-white" />
                      <button type="button" onClick={() => setAdminPickMode(key === "start" ? "PICK_HIGHWAY_START" : "PICK_HIGHWAY_END")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-sky-300 hover:border-sky-400">ปักหมุดบนแผนที่</button>
                    </div>;
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                  <button type="button" onClick={() => setAdminPickMode("ADD_HIGHWAY_BEND")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-300 hover:border-amber-400">เพิ่มจุดดัดแนวจากแผนที่</button>
                  <button type="button" disabled={isSnappingGeometry} onClick={snapEditedGeometry} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{isSnappingGeometry ? "กำลังหาแนวถนน" : "เกาะแนวถนน"}</button>
                  <span className="text-[11px] text-slate-400">เส้นปัจจุบัน {draftCoordinates.length} จุด · จุดดัด {draftWaypoints.length} จุด</span>
                </div>
                {draftWaypoints.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" aria-label="รายการจุดดัดแนวถนน">
                    <p className="mb-2 text-xs font-semibold text-slate-200">จุดดัดแนวถนน ({draftWaypoints.length} จุด)</p>
                    <div className="flex flex-wrap gap-2">
                      {draftWaypoints.map(([lon, lat], index) => (
                        <div key={`${lon}-${lat}-${index}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300">
                          <span className="font-mono">#{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                          <button type="button" onClick={() => void removeGeometryWaypoint(index)} aria-label={`ลบจุดดัดแนวถนนที่ ${index + 1}`} className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-3">
              <div className="flex gap-2">
                <button type="button" onClick={() => exportEditedGeometry("geojson")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">ส่งออก GeoJSON</button>
                <button type="button" onClick={() => exportEditedGeometry("kml")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">ส่งออก KML</button>
                <button type="button" onClick={restoreOriginalGeometry} className="rounded-lg border border-sky-700 bg-sky-950/40 px-3 py-2 text-xs text-sky-200">คืนค่าแนวเดิม</button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeGeometryEditor} className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-white">ยกเลิก</button>
                <button type="button" onClick={saveEditedGeometry} disabled={draftCoordinates.length < 2} className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">บันทึกแนวถนน</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

