"use client";
import { readRouteFile } from "@/lib/route-import";
import { haversineMeters, insertVertex, joinLines, moveVertex, nearestInsertIndex, removeVertex, roundCoord, splitLine } from "@/lib/line-edit";
import type { LonLat, VertexEditEvent } from "@/lib/line-edit";
import { exportLineFeatures, GisExportFormat } from "@/lib/gis-export";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  HighwaySpecsEditModal,
  HighwayRouteDetailModal,
  HighwayGeometryEditorPanel,
  type EditingRouteSpecsState,
  type EditingGeometryState,
  type HighwayFeatureSummary,
} from "@/components/admin/tabs/GisHighwayModals";
type LineStylesMap = Record<string, import("@/db/default-data").MapLineStyleItem>;
import {
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { GisUploadMappingPanel } from "@/components/admin/tabs/GisUploadMappingPanel";
import { HighwaySpecificationsTableSection } from "@/components/admin/tabs/HighwaySpecificationsTableSection";
import {
  kilometerPostMeters,
  formatKilometerPost,
  normalizeSurface,
  normalizeLanes,
  calculateDistanceKm,
  previewLines,
  simplifyInWorker,
  lineCoordinates,
} from "@/components/admin/tabs/gis-import-helpers";
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
  const firstCoordLon = draftCoordinates[0]?.[0];
  const firstCoordLat = draftCoordinates[0]?.[1];
  const lastCoordLon = draftCoordinates[draftCoordinates.length - 1]?.[0];
  const lastCoordLat = draftCoordinates[draftCoordinates.length - 1]?.[1];
  const hasMinDraftPoints = draftCoordinates.length >= 2;
  const joinCandidates = useMemo(() => {
    if (
      !editingGeometry ||
      editorMode !== "free" ||
      !hasMinDraftPoints ||
      firstCoordLon === undefined ||
      firstCoordLat === undefined ||
      lastCoordLon === undefined ||
      lastCoordLat === undefined
    ) {
      return [];
    }
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    const features = layer?.geojson_data?.features;
    if (!Array.isArray(features)) return [];
    const first: LonLat = [firstCoordLon, firstCoordLat];
    const last: LonLat = [lastCoordLon, lastCoordLat];
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
  }, [
    editingGeometry,
    editorMode,
    hasMinDraftPoints,
    firstCoordLon,
    firstCoordLat,
    lastCoordLon,
    lastCoordLat,
    absorbedFeatureIdxs,
    systemData.highwayLayers,
  ]);

  // Individual Highway Specifications Modal State (Issue #13)
  const [editingRouteSpecs, setEditingRouteSpecs] = useState<EditingRouteSpecsState | null>(null);

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

  // Flattened highway features list for specifications table (Issue #13)
  const allHighwayFeatures = useMemo(() => {
    const list: HighwayFeatureSummary[] = [];

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
  }, [systemData.highwayLayers, offices]);

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

  const deferredRouteSearch = React.useDeferredValue(routeSearch);

  const matchingHighwayFeatures = useMemo(() => {
    const query = deferredRouteSearch.trim().toLocaleLowerCase("th");
    if (!query) return allHighwayFeatures;
    return allHighwayFeatures.filter((item) =>
      [item.routeNo, item.sectionName, item.kmStart, item.kmEnd, item.responsibleOffice, item.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"]
        .some((value) => String(value).toLocaleLowerCase("th").includes(query))
    );
  }, [allHighwayFeatures, deferredRouteSearch]);

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
    const query = deferredRouteSearch.trim().toLocaleLowerCase("th");
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
  }, [highwaySectionGroups, deferredRouteSearch, highwayFilterVisibility, highwayFilterType, highwayFilterOffice]);

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

      {/* Upload Dropzone & Attribute Field Mapping Panel */}
      <GisUploadMappingPanel
        handleGisUpload={handleGisUpload}
        importedGisFeatures={importedGisFeatures}
        importedLayerName={importedLayerName}
        setImportedLayerName={setImportedLayerName}
        availableGisFields={availableGisFields}
        selectedRouteCodeField={selectedRouteCodeField}
        setSelectedRouteCodeField={setSelectedRouteCodeField}
        manualRouteCode={manualRouteCode}
        setManualRouteCode={setManualRouteCode}
        selectedRouteNameField={selectedRouteNameField}
        setSelectedRouteNameField={setSelectedRouteNameField}
        manualRouteName={manualRouteName}
        setManualRouteName={setManualRouteName}
        targetLayerCategory={targetLayerCategory}
        setTargetLayerCategory={setTargetLayerCategory}
        labelDisplayMode={labelDisplayMode}
        setLabelDisplayMode={setLabelDisplayMode}
        layerLanes={layerLanes}
        setLayerLanes={setLayerLanes}
        layerSurface={layerSurface}
        setLayerSurface={setLayerSurface}
        layerResponsibleOffice={layerResponsibleOffice}
        setLayerResponsibleOffice={setLayerResponsibleOffice}
        offices={offices}
        simplifyTolerance={simplifyTolerance}
        handleResimplifyTolerance={handleResimplifyTolerance}
        onCancelImport={() => {
          setImportedPreviewLines([]);
          setImportedGisFeatures([]);
          setIncomingGisLines?.([]);
          setAvailableGisFields([]);
        }}
        isCommitting={isCommitting}
        handleCommitGisLayer={handleCommitGisLayer}
      />

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
                    aria-label={`ลบเลเยอร์โครงข่าย ${layer.layer_name}`}
                    onClick={() => handleDeleteHighwayLayer(layer.layer_id, layer.layer_name)}
                    title="ลบเลเยอร์โครงข่าย"
                    className="min-h-10 min-w-10 inline-flex items-center justify-center bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Highway Specifications Table (Issue #13) */}
      <HighwaySpecificationsTableSection
        highwaySectionGroups={highwaySectionGroups}
        allHighwayFeatures={allHighwayFeatures}
        matchingHighwayGroups={matchingHighwayGroups}
        handleExportHighwayGis={handleExportHighwayGis}
        setEditingRouteSpecs={setEditingRouteSpecs}
        offices={offices}
        routeSearch={routeSearch}
        setRouteSearch={setRouteSearch}
        highwayFilterVisibility={highwayFilterVisibility}
        setHighwayFilterVisibility={setHighwayFilterVisibility}
        highwayFilterType={highwayFilterType}
        setHighwayFilterType={setHighwayFilterType}
        highwayFilterOffice={highwayFilterOffice}
        setHighwayFilterOffice={setHighwayFilterOffice}
        availableOffices={availableOffices}
        expandedGroupIds={expandedGroupIds}
        toggleGroupExpand={toggleGroupExpand}
        setSelectedRoute={setSelectedRoute}
        handleToggleGroupVisibility={handleToggleGroupVisibility}
        handleToggleFeatureVisibility={handleToggleFeatureVisibility}
        openGeometryEditor={openGeometryEditor}
        handleDeleteHighwayGroup={handleDeleteHighwayGroup}
        handleDeleteHighwayFeature={handleDeleteHighwayFeature}
      />

      {/* Modal: Highway Specifications Editor (Issue #13) */}
      <HighwaySpecsEditModal
        editingRouteSpecs={editingRouteSpecs}
        setEditingRouteSpecs={setEditingRouteSpecs}
        offices={offices}
        onSave={handleSaveRouteSpecsModal}
        calculateDistanceKm={calculateDistanceKm}
        formatKilometerPost={formatKilometerPost}
      />

      <HighwayRouteDetailModal
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        allHighwayFeatures={allHighwayFeatures}
        setEditingRouteSpecs={setEditingRouteSpecs}
        openGeometryEditor={openGeometryEditor}
        handleDeleteHighwayFeature={handleDeleteHighwayFeature}
      />

      <HighwayGeometryEditorPanel
        editingGeometry={editingGeometry}
        setEditingGeometry={setEditingGeometry as React.Dispatch<React.SetStateAction<EditingGeometryState | null>>}
        allHighwayFeatures={allHighwayFeatures}
        closeGeometryEditor={closeGeometryEditor}
        editorMode={editorMode}
        switchEditorMode={switchEditorMode}
        carriagewayStructure={carriagewayStructure}
        setCarriagewayStructure={setCarriagewayStructure}
        arrowDirectionSetting={arrowDirectionSetting}
        setArrowDirectionSetting={setArrowDirectionSetting}
        showFeatureArrows={showFeatureArrows}
        setShowFeatureArrows={setShowFeatureArrows}
        dualReverseCoords={dualReverseCoords}
        setDualReverseCoords={setDualReverseCoords}
        draftCoordinates={draftCoordinates}
        draftWaypoints={draftWaypoints}
        vertexTool={vertexTool}
        setVertexTool={setVertexTool}
        adminPickMode={adminPickMode}
        setAdminPickMode={setAdminPickMode}
        historySize={historySize}
        undoEdit={undoEdit}
        redoEdit={redoEdit}
        splitRemainder={splitRemainder}
        absorbedFeatureIdxs={absorbedFeatureIdxs}
        joinTargetIdx={joinTargetIdx}
        setJoinTargetIdx={setJoinTargetIdx}
        joinCandidates={joinCandidates}
        handleJoinSelected={handleJoinSelected}
        onToast={onToast}
        isSnappingGeometry={isSnappingGeometry}
        snapEditedGeometry={snapEditedGeometry}
        removeGeometryWaypoint={removeGeometryWaypoint}
        exportEditedGeometry={exportEditedGeometry}
        restoreOriginalGeometry={restoreOriginalGeometry}
        saveEditedGeometry={saveEditedGeometry}
      />
    </div>
  );
}

