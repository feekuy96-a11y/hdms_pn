"use client";
import type { VertexEditEvent } from "@/lib/line-edit";
import { exportLineFeatures, GisExportFormat } from "@/lib/gis-export";

import React, { useMemo, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  HighwaySpecsEditModal,
  HighwayRouteDetailModal,
  HighwayGeometryEditorPanel,
  type EditingRouteSpecsState,
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
import { useGisDataImport } from "@/components/admin/tabs/useGisDataImport";
import { useHighwayGeometryEditor } from "@/components/admin/tabs/useHighwayGeometryEditor";
import {
  kilometerPostMeters,
  formatKilometerPost,
  normalizeSurface,
  normalizeLanes,
  calculateDistanceKm,
} from "@/components/admin/tabs/gis-import-helpers";
import { updateHighwayLayerAction } from "@/app/actions/doh-actions";
import {
  groupHighwayFeatures,
  HighwaySectionGroup,
  HighwayBranchItem,
  HighwayBranchType,
  HighwayDirectionCode,
  KmCalibrationPoint,
  parseKmPostMeters,
  generateStableFeatureId,
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
  setDraftReverseCoordinates,
  setDraftReverseWaypoints,
  setDraftDirectionMeta,
  onDraftModeChange,
  setDraftPickMarkers,
  vertexEvent,
  onVertexEditChange,
}: GisDataImportTabProps) {
  const offices = useMemo(() => (systemData.offices || []).filter((office) => office.is_active), [systemData.offices]);
  const {
    importedGisFeatures,
    importedLayerName, setImportedLayerName,
    availableGisFields,
    selectedRouteCodeField, setSelectedRouteCodeField,
    manualRouteCode, setManualRouteCode,
    selectedRouteNameField, setSelectedRouteNameField,
    manualRouteName, setManualRouteName,
    targetLayerCategory, setTargetLayerCategory,
    labelDisplayMode, setLabelDisplayMode,
    layerLanes, setLayerLanes,
    layerSurface, setLayerSurface,
    layerResponsibleOffice, setLayerResponsibleOffice,
    simplifyTolerance,
    isCommitting,
    handleGisUpload,
    handleResimplifyTolerance,
    handleCancelImport,
    handleCommitGisLayer,
    handleDeleteHighwayLayer,
  } = useGisDataImport({
    systemData,
    lineStyles,
    onDataRefresh,
    onToast,
    showConfirmModal,
    showSuccessModal,
    showErrorModal,
    setIncomingGisLines,
  });
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<{ layerId: string; featureIdx: number } | null>(null);
  const {
    editingGeometry,
    setEditingGeometry,
    editorMode,
    carriagewayStructure,
    setCarriagewayStructure,
    arrowDirectionSetting,
    setArrowDirectionSetting,
    showFeatureArrows,
    setShowFeatureArrows,
    dualReverseCoords,
    setDualReverseCoords,
    vertexTool,
    setVertexTool,
    historySize,
    undoEdit,
    redoEdit,
    splitRemainder,
    absorbedFeatureIdxs,
    joinTargetIdx,
    setJoinTargetIdx,
    joinCandidates,
    handleJoinSelected,
    isSnappingGeometry,
    openGeometryEditor,
    closeGeometryEditor,
    switchEditorMode,
    snapEditedGeometry,
    removeGeometryWaypoint,
    exportEditedGeometry,
    restoreOriginalGeometry,
    saveEditedGeometry,
  } = useHighwayGeometryEditor({
    systemData,
    onDataRefresh,
    onToast,
    showSuccessModal,
    setIncomingGisLines,
    setAdminPickMode,
    pickedCoordinate,
    draftCoordinates,
    setDraftCoordinates,
    draftWaypoints,
    setDraftWaypoints,
    setDraftReverseCoordinates,
    setDraftReverseWaypoints,
    setDraftDirectionMeta,
    onDraftModeChange,
    setDraftPickMarkers,
    vertexEvent,
    onVertexEditChange,
  });

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
        onCancelImport={handleCancelImport}
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
        setEditingGeometry={setEditingGeometry}
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

