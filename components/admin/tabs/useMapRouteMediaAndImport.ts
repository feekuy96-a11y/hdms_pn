"use client";

import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  compressImageToAdaptiveBase64,
  generateAutoDetourAdvice,
} from "@/lib/gis-utils";
import { readRouteFile } from "@/lib/route-import";
import type { FloodPhotoItem } from "@/lib/flood-event-schema";

export interface UseMapRouteMediaAndImportParams {
  systemData: SystemDataPayload;
  routeMode: "FLOOD" | "DETOUR";
  routeNo: string;
  setRouteNo: (v: string) => void;
  setSectionName: (v: string) => void;
  setDetourName: (v: string) => void;
  setDetourDesc: (v: string) => void;
  startLat: string | number;
  startLon: string | number;
  endLat: string | number;
  endLon: string | number;
  setStartLat: (v: string | number) => void;
  setStartLon: (v: string | number) => void;
  setEndLat: (v: string | number) => void;
  setEndLon: (v: string | number) => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (v: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: (v: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  draftReverseWaypoints: [number, number][];
  detourDirectionMode: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  setSaveAsDraft: (v: boolean) => void;
  detailedPhotos: FloodPhotoItem[];
  setDetailedPhotos: (v: FloodPhotoItem[]) => void;
  setFieldImages: (v: string[]) => void;
  sectionNameManuallyEdited: React.MutableRefObject<boolean>;
  onToast: (msg: string) => void;
  showErrorModal?: (title: string, msg: string) => void;
}

export function useMapRouteMediaAndImport(params: UseMapRouteMediaAndImportParams) {
  const {
    systemData,
    routeMode,
    routeNo, setRouteNo,
    setSectionName,
    setDetourName,
    setDetourDesc,
    startLat, startLon, endLat, endLon,
    setStartLat, setStartLon, setEndLat, setEndLon,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, draftReverseWaypoints,
    detourDirectionMode,
    setSaveAsDraft,
    detailedPhotos, setDetailedPhotos, setFieldImages,
    sectionNameManuallyEdited,
    onToast, showErrorModal,
  } = params;

  // Adaptive Image Upload (Max 5 photos, <= 300 KB each)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = Math.max(0, 5 - detailedPhotos.length);
    if (remainingSlots === 0) {
      onToast("บันทึกภาพถ่ายได้สูงสุด ๕ ภาพต่อเหตุการณ์");
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    onToast(`กำลังประมวลผลและบีบอัดภาพถ่าย ${filesToProcess.length} ภาพ...`);

    const newPhotos: FloodPhotoItem[] = [];
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const { dataUrl, sizeBytes, format } = await compressImageToAdaptiveBase64(file, 300 * 1024);
        newPhotos.push({
          id: `photo-${Date.now()}-${i}`,
          dataUrl,
          sizeBytes,
          uploadedAt: new Date().toISOString(),
          caption: file.name || `ภาพถ่ายที่ ${detailedPhotos.length + i + 1}`,
          format: format || "webp",
          originalSizeBytes: file.size,
        });
      } catch (err) {
        console.warn("Failed to compress image:", err);
      }
    }

    const updated = [...detailedPhotos, ...newPhotos].slice(0, 5);
    setDetailedPhotos(updated);
    setFieldImages(updated.map((p) => p.dataUrl));
    onToast(`เพิ่มภาพถ่ายหน้างานสำเร็จ (${newPhotos.length} ภาพ) รวมเป็น ${updated.length}/5 ภาพ`);
  };

  // Generate Detour Advice
  const handleGenerateDetourAdviceClick = async () => {
    const numSLat = Number(startLat) || 6.834;
    const numSLon = Number(startLon) || 101.186;
    const numELat = Number(endLat) || 6.839;
    const numELon = Number(endLon) || 101.192;

    const advice = await generateAutoDetourAdvice(
      [numSLon, numSLat],
      [numELon, numELat],
      draftCoordinates,
      routeNo,
      systemData.highwayLayers || [],
      draftReverseCoordinates,
      detourDirectionMode,
      {
        forwardWaypoints: draftWaypoints,
        reverseWaypoints: draftReverseCoordinates.length >= 2 ? draftReverseWaypoints : undefined,
      }
    );
    setDetourDesc(advice);
    onToast("วิเคราะห์คำแนะนำการเดินทางไป-กลับสำเร็จ");
  };

  // Import Route from GPX / KML / KMZ / GeoJSON
  const handleRouteFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const features = await readRouteFile(file);
      const feature = features[0];
      const coordinates = feature?.coords || [];
      if (coordinates.length < 2) throw new Error("ไม่พบแนวเส้นที่ใช้งานได้");
      setDraftCoordinates(coordinates);
      setDraftWaypoints([]);
      setSaveAsDraft(true);
      const [firstLon, firstLat] = coordinates[0];
      const [lastLon, lastLat] = coordinates[coordinates.length - 1];
      setStartLat(firstLat); setStartLon(firstLon); setEndLat(lastLat); setEndLon(lastLon);
      const properties = feature.properties || {};
      const importedRouteNo = String(properties.route_no || properties.route || properties.ROAD_NO || "").replace(/^ทล\.?/i, "").trim();
      const importedName = String(properties.section_name || properties.name || properties.route_name || file.name.replace(/\.[^.]+$/, ""));
      if (routeMode === "FLOOD") {
        if (importedRouteNo) setRouteNo(importedRouteNo);
        sectionNameManuallyEdited.current = false;
        setSectionName(importedName);
      } else {
        setDetourName(importedName);
      }
      onToast(`นำเข้าแนวเส้นจาก ${file.name} แล้ว (${coordinates.length} จุด) กรุณาตรวจรายละเอียดก่อนบันทึก`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์ได้";
      showErrorModal?.("นำเข้าไฟล์ไม่สำเร็จ", message);
      if (!showErrorModal) onToast(message);
    }
  };

  return {
    handleImageUpload,
    handleGenerateDetourAdviceClick,
    handleRouteFileImport,
  };
}
