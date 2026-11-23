"use client";

import React, { useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  deleteHighwayLayerAction,
  updateHighwayLayerAction,
} from "@/app/actions/doh-actions";
import {
  previewLines,
  simplifyInWorker,
} from "@/components/admin/tabs/gis-import-helpers";
import {
  detectSmartFieldMapping,
  extractAvailableGisFields,
  ExtractedGisFeature,
} from "@/lib/gis-utils";
import { readRouteFile } from "@/lib/route-import";

type LineStylesMap = Record<string, import("@/db/default-data").MapLineStyleItem>;

export interface UseGisDataImportParams {
  systemData: SystemDataPayload;
  lineStyles: LineStylesMap;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
}

/**
 * Manages GIS route file ingestion (KML, KMZ, Shapefile .zip, GeoJSON, GPX),
 * Douglas-Peucker simplification in worker, smart field mapping, layer commit, and deletion.
 * Preserves GeoJSON [lon, lat] coordinate ordering at every step.
 */
export function useGisDataImport({
  systemData,
  lineStyles,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  setIncomingGisLines,
}: UseGisDataImportParams) {
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
  const [layerResponsibleOffice, setLayerResponsibleOffice] = useState(
    systemData.offices?.find((office) => office.is_active)?.name || ""
  );
  const [layerSpeedLimit, setLayerSpeedLimit] = useState("๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)");
  const [layerRoadStatus, setLayerRoadStatus] = useState("สัญจรได้ตามปกติ");
  const [layerRemarks, setLayerRemarks] = useState("");
  const [simplifyTolerance, setSimplifyTolerance] = useState(0.00008);
  const [isCommitting, setIsCommitting] = useState(false);

  // Handle GIS File Upload (KML, KMZ, Shapefile .zip, GeoJSON, GPX)
  const handleGisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onToast(`กำลังตรวจสอบและวิเคราะห์โครงข่าย ${file.name}...`);
    try {
      const extractedFeatures = await readRouteFile(file);

      if (extractedFeatures.length === 0) {
        throw new Error("ไม่พบแนวเส้นทาง (LineString) ในไฟล์ หรือรูปแบบพิกัดไม่ใช่ WGS84");
      }

      // Simplify coordinates with Douglas-Peucker
      const simplified = await simplifyInWorker(extractedFeatures, simplifyTolerance);
      const decimatedFeatures = simplified
        .map((f) => ({
          ...f,
          coords: f.coords
            .map(([lon, lat]) => [Number(lon), Number(lat)] as [number, number])
            .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90),
        }))
        .filter((f) => f.coords.length >= 2);

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

  // Cancel current import preview
  const handleCancelImport = () => {
    setImportedPreviewLines([]);
    setImportedGisFeatures([]);
    setIncomingGisLines?.([]);
    setAvailableGisFields([]);
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

    const validFeatures = importedGisFeatures.filter(
      (feature) =>
        feature.coords.length >= 2 &&
        feature.coords.every(
          ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
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
        const code = selectedRouteCodeField
          ? props[selectedRouteCodeField] || manualRouteCode || `สายทางที่ ${idx + 1}`
          : manualRouteCode || `สายทางที่ ${idx + 1}`;
        const name = selectedRouteNameField
          ? props[selectedRouteNameField] || manualRouteName || importedLayerName
          : manualRouteName || importedLayerName;
        const type = selectedRouteTypeField ? props[selectedRouteTypeField] || targetLayerCategory : targetLayerCategory;

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

  return {
    importedGisFeatures,
    importedLayerName,
    setImportedLayerName,
    availableGisFields,
    selectedRouteCodeField,
    setSelectedRouteCodeField,
    manualRouteCode,
    setManualRouteCode,
    selectedRouteNameField,
    setSelectedRouteNameField,
    manualRouteName,
    setManualRouteName,
    selectedRouteTypeField,
    setSelectedRouteTypeField,
    targetLayerCategory,
    setTargetLayerCategory,
    labelDisplayMode,
    setLabelDisplayMode,
    layerLanes,
    setLayerLanes,
    layerSurface,
    setLayerSurface,
    layerResponsibleOffice,
    setLayerResponsibleOffice,
    layerSpeedLimit,
    setLayerSpeedLimit,
    layerRoadStatus,
    setLayerRoadStatus,
    layerRemarks,
    setLayerRemarks,
    simplifyTolerance,
    isCommitting,
    handleGisUpload,
    handleResimplifyTolerance,
    handleCancelImport,
    handleCommitGisLayer,
    handleDeleteHighwayLayer,
  };
}
