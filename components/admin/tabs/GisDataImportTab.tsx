"use client";
import type { VertexEditEvent } from "@/lib/line-edit";

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
import { FileSpreadsheet } from "lucide-react";
import { GisUploadMappingPanel } from "@/components/admin/tabs/GisUploadMappingPanel";
import { GisHighwayTable } from "@/components/admin/tabs/GisHighwayTable";
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

      {/* Highway Layers & Specifications Table */}
      <GisHighwayTable
        systemData={systemData}
        lineStyles={lineStyles}
        offices={offices}
        allHighwayFeatures={allHighwayFeatures}
        onDataRefresh={onDataRefresh}
        onToast={onToast}
        showConfirmModal={showConfirmModal}
        showSuccessModal={showSuccessModal}
        handleDeleteHighwayLayer={handleDeleteHighwayLayer}
        setEditingRouteSpecs={setEditingRouteSpecs}
        setSelectedRoute={setSelectedRoute}
        openGeometryEditor={openGeometryEditor}
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

