"use client";

import { useRef, useState } from "react";
import type React from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  parseCoordinatePair,
  findBestHighwayGroupForSelection,
  sliceBranchByKmRange,
  buildAffectedPartSummary,
  buildDetourMetaPayload,
  type DetourPointPhotoLocationInput,
} from "@/components/admin/tabs/map-management-helpers";
import { calculatePolylineRoadDistanceKm } from "@/lib/detour-presentation";
import {
  deleteExternalMediaAction,
  upsertRouteAction,
  syncReportingRowAction,
  uploadExternalMediaAction,
} from "@/app/actions/doh-actions";
import {
  detectClosedRoadConflicts,
  detectPassabilityFloodWarnings,
  analyzeCarriagewaySeparation,
  localArea,
} from "@/lib/gis-utils";
import {
  ROAD_SIDE_OPTIONS,
  AFFECTED_LANES_OPTIONS,
  AFFECTED_SHOULDER_OPTIONS,
  RoadSideType,
  AffectedShoulderType,
  DetourDirectionModeType,
} from "@/lib/constants";
import {
  FloodDirectionCode,
  AffectedRoadPart,
  AFFECTED_ROAD_PART_LABELS,
  FloodPhotoItem,
  FloodSegmentDirectionMeta,
  parseFloodDirectionMeta,
  generateNextEventCode,
  resolveEffectiveRoadSide,
  mapTrafficStatusToDetail,
  mapDetailToDbStatus,
  detectOverlappingFloodSegments,
} from "@/lib/flood-event-schema";
import { cleanHighwaySectionName } from "@/lib/highway-schema";

export interface UseMapRouteSubmitParams {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onNavigateToIncidents?: () => void;
  onClearEditingRoute?: () => void;
  editingRoute?: any;
  routeMode: "FLOOD" | "DETOUR";
  routeEditId: string;
  setRouteEditId: (id: string) => void;
  saveAsDraft: boolean;
  setIsSubmitting: (v: boolean) => void;
  startLat: string | number;
  startLon: string | number;
  endLat: string | number;
  endLon: string | number;
  revStartLat: string | number;
  revStartLon: string | number;
  revEndLat: string | number;
  revEndLon: string | number;
  draftCoordinates: [number, number][];
  draftReverseCoordinates: [number, number][];
  draftReverseWaypoints: [number, number][];
  closedRoadConflicts: string[];
  detourName: string;
  detourRefId: string;
  detourDesc: string;
  detourDirectionMode: DetourDirectionModeType;
  detourRoadCondition: string;
  detourDurationMinFwd: string;
  detourDurationMinRev: string;
  detourDistanceMeters: { forward: number; reverse: number };
  detourGoogleMapsUrlFwd: string;
  detourGoogleMapsUrlRev: string;
  detourStartPhotoUrl: string;
  detourStartPhotoCaption: string;
  detourStartPhotoLocation?: DetourPointPhotoLocationInput | null;
  detourEndPhotoUrl: string;
  detourEndPhotoCaption: string;
  detourEndPhotoLocation?: DetourPointPhotoLocationInput | null;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  directionCode: FloodDirectionCode;
  roadSide: RoadSideType;
  isDividedBothFlood: boolean;
  affectedParts: AffectedRoadPart[];
  reverseAffectedParts: AffectedRoadPart[];
  routeWaterLevel: string | number;
  reverseRouteWaterLevel: string | number;
  waterLevelKnown: boolean;
  reverseWaterLevelKnown: boolean;
  routeStatus: "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE" | "CLOSED" | "WARNING";
  reverseRouteStatus: "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE" | "CLOSED" | "WARNING";
  startedAt: string;
  selectedMeasure: string;
  reporterName: string;
  causeAndNote: string;
  startArea: { subdistrict: string; district: string; province?: string };
  endArea: { subdistrict: string; district: string; province?: string };
  villageOrLandmark: string;
  detailedPhotos: FloodPhotoItem[];
  fieldImages: string[];
  setFieldImages: (imgs: string[]) => void;
  selectedParentEventId: string;
  eventCode: string;
  eventTitle: string;
  existingParentEvents: any[];
  affectedLanes: string;
  affectedShoulder: AffectedShoulderType;
  startCoordinateText: string;
  endCoordinateText: string;
  setClosedRoadConflicts: (msgs: string[]) => void;
  availableHighways: any[];
  useCarriagewaySnapping: boolean;
  editOriginalFloodDirRef: React.MutableRefObject<any>;
  handleClearRoute: () => void;
}

export function useMapRouteSubmit(params: UseMapRouteSubmitParams) {
  const {
    systemData, onDataRefresh, onToast, showSuccessModal, showErrorModal,
    onNavigateToIncidents, onClearEditingRoute, editingRoute,
    routeMode, routeEditId, setRouteEditId, saveAsDraft, setIsSubmitting,
    startLat, startLon, endLat, endLon, revStartLat, revStartLon, revEndLat, revEndLon,
    draftCoordinates, draftReverseCoordinates, draftReverseWaypoints,
    closedRoadConflicts, setClosedRoadConflicts, detourName, detourRefId, detourDesc, detourDirectionMode,
    detourRoadCondition, detourDurationMinFwd, detourDurationMinRev,
    detourDistanceMeters, detourGoogleMapsUrlFwd, detourGoogleMapsUrlRev,
    detourStartPhotoUrl, detourStartPhotoCaption, detourStartPhotoLocation,
    detourEndPhotoUrl, detourEndPhotoCaption, detourEndPhotoLocation,
    routeNo, sectionName, kmStart, kmEnd, directionCode, roadSide, isDividedBothFlood,
    affectedParts, reverseAffectedParts, routeWaterLevel, reverseRouteWaterLevel,
    waterLevelKnown, reverseWaterLevelKnown, routeStatus, reverseRouteStatus,
    startedAt, selectedMeasure, reporterName, causeAndNote,
    startArea, endArea, villageOrLandmark, detailedPhotos, fieldImages, setFieldImages,
    selectedParentEventId, eventCode, eventTitle, existingParentEvents,
    affectedLanes, affectedShoulder, startCoordinateText, endCoordinateText,
    availableHighways, useCarriagewaySnapping, editOriginalFloodDirRef, handleClearRoute,
  } = params;

  const linkedCreateAttempt = useRef<Parameters<typeof upsertRouteAction>[0] | null>(null);
  const linkedRequestInFlight = useRef(false);
  const [linkedDetourPending, setLinkedDetourPending] = useState(false);

  const submitLinkedDetour = async (payload: Parameters<typeof upsertRouteAction>[0]) => {
    linkedCreateAttempt.current = payload;
    try {
      const result = await upsertRouteAction(payload);
      if (!result.success || result.savedId !== payload.id || result.detourLinkState !== "LINKED") {
        setLinkedDetourPending(true);
        const known = result.success && result.savedId === payload.id && result.detourLinkState === "PENDING";
        const title = known ? "บันทึกทางเลี่ยงแล้ว แต่ยังผูกเหตุการณ์ไม่สำเร็จ" : "ยังยืนยันผลการบันทึกทางเลี่ยงไม่ได้";
        const message = `ใช้ปุ่มลองผูกเหตุการณ์อีกครั้งเพื่อดำเนินการกับทางเลี่ยงเดิมโดยไม่อัปโหลดรูปใหม่ หากปิดหน้านี้ ให้ตรวจรายการทางเลี่ยงก่อนสร้างใหม่ (รหัส ${payload.id})`;
        if (showErrorModal) showErrorModal(title, message);
        else onToast(`${title}: ${message}`);
        return null;
      }
      linkedCreateAttempt.current = null;
      setLinkedDetourPending(false);
      return result;
    } catch {
      // A timeout/invalid response need not mean the insert failed. Keep
      // the original ID and uploaded media; retry will not allocate either.
      setLinkedDetourPending(true);
      const title = "ยังยืนยันผลการบันทึกทางเลี่ยงไม่ได้";
      const message = `ใช้ปุ่มลองผูกเหตุการณ์อีกครั้งเพื่อดำเนินการกับทางเลี่ยงเดิม หากปิดหน้านี้ ให้ตรวจรายการทางเลี่ยงก่อนสร้างใหม่ (รหัส ${payload.id})`;
      if (showErrorModal) showErrorModal(title, message);
      else onToast(`${title}: ${message}`);
      return null;
    }
  };

  const completeDetourRetry = async (result: Awaited<ReturnType<typeof upsertRouteAction>>) => {
    if (result.savedId) {
      try {
        await syncReportingRowAction({ recordId: result.savedId, recordType: "DETOUR", updatedAt: new Date().toISOString() });
      } catch { /* The committed route already has a report job; this only wakes the worker. */ }
    }
    try { await onDataRefresh(result.systemData); } catch { onToast("ผูกเหตุการณ์แล้ว แต่ไม่สามารถโหลดข้อมูลล่าสุด กรุณารีเฟรชหน้าจอ"); }
    showSuccessModal("ผูกทางเลี่ยงกับเหตุการณ์สำเร็จ", "ใช้ทางเลี่ยงและรูปเดิม ไม่ได้สร้างรายการใหม่");
    setRouteEditId("");
    setFieldImages([]);
    handleClearRoute();
    if (onClearEditingRoute) onClearEditingRoute();
  };

  const handleSubmitRoute = async () => {
    if (linkedRequestInFlight.current) return;
    if (routeMode === "DETOUR" && !routeEditId && linkedCreateAttempt.current) {
      linkedRequestInFlight.current = true;
      setIsSubmitting(true);
      try {
        const result = await submitLinkedDetour(linkedCreateAttempt.current);
        if (result) await completeDetourRetry(result);
      } finally {
        linkedRequestInFlight.current = false;
        setIsSubmitting(false);
      }
      return;
    }
    // Never silently turn a missing/legacy direction into bidirectional traffic.
    const hasPhotoLocationValues = (loc?: DetourPointPhotoLocationInput | null) =>
      Boolean(
        loc &&
          (String(loc.lat ?? "").trim() ||
            String(loc.lon ?? "").trim() ||
            loc.subdistrict?.trim() ||
            loc.district?.trim() ||
            loc.province?.trim())
      );

    const resolveSubmitPhotoLocation = (
      loc: DetourPointPhotoLocationInput | null | undefined,
      fallbackLat: number,
      fallbackLon: number,
      fallbackArea?: { subdistrict: string; district: string; province?: string } | null
    ): DetourPointPhotoLocationInput | undefined => {
      if (hasPhotoLocationValues(loc)) return loc ?? undefined;
      if (
        Number.isFinite(fallbackLat) &&
        Number.isFinite(fallbackLon) &&
        (fallbackLat !== 0 || fallbackLon !== 0)
      ) {
        return {
          lat: fallbackLat,
          lon: fallbackLon,
          subdistrict: fallbackArea?.subdistrict,
          district: fallbackArea?.district,
          province: fallbackArea?.province || "ปัตตานี",
          locationSource: "ROUTE_ENDPOINT",
        };
      }
      return undefined;
    };

    if (routeMode === "DETOUR" && !["FORWARD_ONLY", "REVERSE_ONLY", "TWO_WAY"].includes(detourDirectionMode)) {
      onToast("ไม่พบค่าทิศทางเดินรถที่ถูกต้อง กรุณาเลือก A → B, B → A หรือสองทิศทางก่อนบันทึก");
      return;
    }
    if (routeMode === "FLOOD" && (roadSide === "UNKNOWN" ||
        (roadSide === "LEFT" && directionCode !== "A_TO_B") ||
        (roadSide === "RIGHT" && directionCode !== "B_TO_A") ||
        (roadSide === "BOTH" && directionCode !== "BOTH"))) {
      onToast("กรุณาเลือกฝั่งถนนและทิศทางการเดินรถให้ตรงกันก่อนบันทึก (ซ้าย A→B / ขวา B→A / ทั้งสองฝั่ง)");
      return;
    }
    if (routeMode === "FLOOD" && isDividedBothFlood && reverseWaterLevelKnown && reverseRouteWaterLevel === "") {
      onToast("กรุณาระบุระดับน้ำท่วมผิวทางฝั่งขากลับ (B → A) หรือติ๊ก 'ไม่ทราบค่า'");
      return;
    }
    if (!sectionName && routeMode === "FLOOD") {
      onToast("กรุณาระบุชื่อตอนควบคุมหรือบริเวณที่เกิดเหตุ");
      return;
    }

    const startPair = parseCoordinatePair(startCoordinateText);
    const endPair = parseCoordinatePair(endCoordinateText);
    const numSLat = startPair?.[0] ?? Number(startLat);
    const numSLon = startPair?.[1] ?? Number(startLon);
    const numELat = endPair?.[0] ?? Number(endLat);
    const numELon = endPair?.[1] ?? Number(endLon);
    const numWaterLevel = Number(routeWaterLevel) || 0;

    if (draftCoordinates.length < 2 && (!numSLat || !numELat || isNaN(numSLat) || isNaN(numELat))) {
      onToast("กรุณากำหนดจุดพิกัดเริ่มต้นและสิ้นสุดบนแผนที่");
      return;
    }
    if (routeMode === "DETOUR" && draftCoordinates.length < 2) {
      onToast("กรุณาคำนวณทางเลี่ยงตามถนนให้สำเร็จก่อนบันทึก");
      return;
    }
    if (routeMode === "DETOUR" && !saveAsDraft) {
      // Re-verify against confirmed CLOSED flood routes before allowing public publish
      const forwardConflicts = detectClosedRoadConflicts(draftCoordinates, systemData.floodRoutes || []);
      const reverseConflicts = detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2
        ? detectClosedRoadConflicts(draftReverseCoordinates, systemData.floodRoutes || [])
        : [];
      const activeConflicts = [...forwardConflicts, ...reverseConflicts];
      if (activeConflicts.length > 0) {
        const msgList = Array.from(new Set(activeConflicts.map((c) => `ทล.${c.routeNo} (${c.sectionName})`))).join(", ");
        const errText = `ไม่อนุญาตให้เผยแพร่ทางเลี่ยงที่ตัดผ่านช่วงถนนที่ปิดการจราจร (${msgList}) กรุณาเพิ่มจุดดัดเส้นทางเพื่ออ้อมจุดปิดจราจร หรือเลือก "บันทึกเป็นฉบับร่าง"`;
        setClosedRoadConflicts(Array.from(new Set(activeConflicts.map((c) => `ทล.${c.routeNo} (${c.sectionName})`))));
        if (showErrorModal) showErrorModal("พบทางเลี่ยงตัดผ่านจุดปิดการจราจร", errText);
        else onToast(errText);
        return;
      }
    }
    if (routeMode === "FLOOD" && draftCoordinates.length < 2) {
      onToast("กรุณาสร้างเส้นน้ำท่วมบนแนวทางหลวงก่อนบันทึก");
      return;
    }

    const chosenRouteNo = routeNo || (availableHighways[0]?.no || "43");

    if (routeMode === "FLOOD" && !saveAsDraft && kmStart && kmEnd) {
      const targetNewSeg = {
        route_no: chosenRouteNo,
        km_start: kmStart,
        km_end: kmEnd,
        direction_meta: { directionCode },
      };
      const existingActiveOnRoute = (systemData.floodRoutes || []).filter(
        (r) => r.is_active && String(r.id) !== String(routeEditId) && String(r.route_no) === String(chosenRouteNo)
      );
      const overlaps = detectOverlappingFloodSegments([targetNewSeg, ...existingActiveOnRoute]);
      if (overlaps.length > 0) {
        onToast(`⚠️ แจ้งเตือน: ${overlaps[0].message}`);
      }
    }

    const uploadedMediaIds: string[] = [];
    let mediaPersisted = false;
    const isLinkedCreate = routeMode === "DETOUR" && !routeEditId && Boolean(detourRefId);
    const linkedCreateId = isLinkedCreate ? `D-${crypto.randomUUID()}` : undefined;
    if (isLinkedCreate) linkedRequestInFlight.current = true;
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

      const separation = routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2
        ? analyzeCarriagewaySeparation(coords, draftReverseCoordinates)
        : null;

      // Phase 3: Link Detour to Parent Flood Event if applicable
      const linkedFlood = (systemData.floodRoutes || []).find((f) => String(f.id) === String(detourRefId));
      const linkedEventId = linkedFlood ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood).eventId : undefined;

      // Phase 2: Compute Parent Event, Direction, and Multi-Photo metadata
      const currentEventId = selectedParentEventId || `EV-${chosenRouteNo}-${Date.now()}`;
      const currentEventCode = eventCode.trim() || generateNextEventCode(chosenRouteNo, existingParentEvents);
      const currentEventTitle = eventTitle.trim() || (sectionName ? `ทล.${chosenRouteNo} ตอน${sectionName}` : "เหตุการณ์น้ำท่วมทางหลวง");
      const storedPhotos = await Promise.all(detailedPhotos.map(async (photo, index) => {
        if (!photo.dataUrl.startsWith("data:")) return photo;
        const uploaded = await uploadExternalMediaAction({
          dataUrl: photo.dataUrl,
          fileName: photo.caption || `flood-${currentEventId}-${index + 1}.${photo.format === "jpeg" ? "jpg" : "webp"}`,
          ownerType: "FLOOD",
          ownerId: routeEditId || currentEventId,
        });
        uploadedMediaIds.push(uploaded.mediaId);
        return { ...photo, dataUrl: uploaded.url, sizeBytes: uploaded.sizeBytes, format: uploaded.mimeType === "image/jpeg" ? "jpeg" as const : "webp" as const };
      }));
      const effectiveRoadSide: RoadSideType = roadSide;
      const { lanesSummary, shoulderSummary } = buildAffectedPartSummary(affectedParts);
      const primaryPhoto = storedPhotos[0]?.dataUrl || fieldImages[0] || undefined;
      const dbTrafficStatus = (routeStatus as string) === "PENDING_VERIFICATION" ? "WARNING" : routeStatus;
      const syncReport = async (recordId?: string, status = String(dbTrafficStatus)) => {
        if (!recordId) return;
        try {
          const result = await syncReportingRowAction({
            recordId,
            recordType: routeMode,
            routeNo: chosenRouteNo,
            sectionName: routeMode === "FLOOD" ? sectionName : detourName,
            status,
            isActive: !saveAsDraft,
            updatedAt: new Date().toISOString(),
          });
          if (!result.synced && !result.queued) onToast("บันทึกแล้ว แต่ยังไม่ได้ตั้งค่าการส่งรายงาน Google Sheets");
        } catch {
          onToast("บันทึกแล้ว แต่ส่งรายงาน Google Sheets ไม่สำเร็จ");
        }
      };

      const floodDirectionMeta: FloodSegmentDirectionMeta = {
        schemaVersion: 2,
        eventId: currentEventId,
        eventCode: currentEventCode,
        eventTitle: currentEventTitle,
        controlSectionId: "",
        subdivisionName: reporterName.trim() || "เจ้าหน้าที่แขวงทางหลวงปัตตานี",
        villageOrLandmark: villageOrLandmark.trim(),
        directionCode,
        directionLabel: directionCode === "A_TO_B" ? "ตามหลัก กม. (ขาไป A → B)" : directionCode === "B_TO_A" ? "ย้อนหลัก กม. (ขากลับ B → A)" : directionCode === "BOTH" ? "ทั้งสองทิศทาง" : "ไม่ระบุทิศทาง",
        roadSide: effectiveRoadSide,
        affectedParts,
        trafficStatusDetail: mapTrafficStatusToDetail(dbTrafficStatus),
        status_verified: true,
        waterLevelKnown,
        startedAt: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        zeroConfirmedAt: waterLevelKnown && numWaterLevel === 0 ? new Date().toISOString() : null,
        causeAndNote: causeAndNote.trim(),
        photos: storedPhotos,
        arrow_direction: directionCode === "A_TO_B" ? "FORWARD" : directionCode === "B_TO_A" ? "REVERSE" : directionCode === "BOTH" ? "TWO_WAY" : "UNKNOWN",
        show_arrows: true,
        carriageway_type: (useCarriagewaySnapping || isDividedBothFlood) ? "DUAL_CARRIAGEWAY" : "SINGLE_CENTERLINE",
        water_level_known: waterLevelKnown,
      };

      // ดึงหรือระบุ อำเภอ/ตำบล สำหรับบันทึกข้อมูลทางหลวงลงฐานข้อมูล
      const fallbackArea = await localArea(numSLon, numSLat);
      const effectiveDistrict =
        startArea?.district?.trim() ||
        endArea?.district?.trim() ||
        (editingRoute?.type === "FLOOD" ? systemData.floodRoutes.find((f) => f.id === routeEditId)?.district : undefined) ||
        fallbackArea.amphoe ||
        "";
      const effectiveSubdistrict =
        startArea?.subdistrict?.trim() ||
        endArea?.subdistrict?.trim() ||
        (editingRoute?.type === "FLOOD" ? systemData.floodRoutes.find((f) => f.id === routeEditId)?.subdistrict : undefined) ||
        fallbackArea.tambon ||
        "";

      if (routeMode === "FLOOD" && isDividedBothFlood) {
        // 1. Forward segment (A -> B)
        const forwardDirectionMeta: FloodSegmentDirectionMeta = {
          ...floodDirectionMeta,
          directionCode: "A_TO_B",
          directionLabel: "ตามหลัก กม. (ขาไป A → B)",
          arrow_direction: "FORWARD",
          roadSide: "LEFT",
          carriageway_type: "DUAL_CARRIAGEWAY",
        };

        const existingForwardSiblingId =
          routeEditId && editOriginalFloodDirRef.current === "B_TO_A"
            ? (systemData.floodRoutes || []).find((f) => {
                if (String(f.id) === String(routeEditId)) return false;
                const m = parseFloodDirectionMeta(f.direction_meta, f);
                return m.eventId === currentEventId && m.directionCode === "A_TO_B";
              })?.id
            : routeEditId || undefined;

        const forwardRes = await upsertRouteAction({
          id: existingForwardSiblingId,
          recordType: "FLOOD",
          routeNo: chosenRouteNo,
          kmStart,
          kmEnd,
          district: effectiveDistrict,
          subdistrict: effectiveSubdistrict,
          sectionName: sectionName || "จุดรายงานน้ำท่วม",
          waterLevelCm: waterLevelKnown ? numWaterLevel : 0,
          trafficStatus: dbTrafficStatus,
          isActive: !saveAsDraft,
          latStart: numSLat || undefined,
          lonStart: numSLon || undefined,
          latEnd: numELat || undefined,
          lonEnd: numELon || undefined,
          coordinates: coords,
          latestPhotoUrl: primaryPhoto,
          roadSide: "LEFT",
          affectedLanes: lanesSummary,
          affectedShoulder: shoulderSummary,
          reporterName: reporterName.trim() || "เจ้าหน้าที่แขวงทางหลวงปัตตานี",
          directionMeta: forwardDirectionMeta,
        });
        if (forwardRes.success) {
          mediaPersisted = true;
        }

        // 2. Reverse segment (B -> A): prefer operator's edited/snapped reverse line, then explicit reverse pins, fallback to GIS B_TO_A slice
        let reverseCoords: [number, number][] = draftReverseCoordinates.length >= 2 ? draftReverseCoordinates : [];
        if (reverseCoords.length < 2 && revStartLat && revStartLon && revEndLat && revEndLon) {
          reverseCoords = [[Number(revStartLon), Number(revStartLat)], [Number(revEndLon), Number(revEndLat)]];
        }
        if (reverseCoords.length < 2) {
          const matchedGroup = findBestHighwayGroupForSelection(systemData.highwayLayers, chosenRouteNo, sectionName, kmStart, kmEnd);
          const fwdBranch = matchedGroup?.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) || matchedGroup?.primaryBranch;
          const revBranch = matchedGroup?.branches.find((b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2);
          if (matchedGroup && revBranch) {
            reverseCoords = sliceBranchByKmRange(revBranch, fwdBranch, matchedGroup.kmStart, matchedGroup.kmEnd, kmStart, kmEnd, true);
          }
        }
        if (reverseCoords.length < 2) {
          reverseCoords = [...coords].reverse();
        }

        const revSLat = reverseCoords[0] ? reverseCoords[0][1] : numELat;
        const revSLon = reverseCoords[0] ? reverseCoords[0][0] : numELon;
        const revELat = reverseCoords[reverseCoords.length - 1] ? reverseCoords[reverseCoords.length - 1][1] : numSLat;
        const revELon = reverseCoords[reverseCoords.length - 1] ? reverseCoords[reverseCoords.length - 1][0] : numSLon;

        const numRevWaterLevel = Number(reverseRouteWaterLevel || 0);
        const { lanesSummary: revLanesSummary, shoulderSummary: revShoulderSummary } = buildAffectedPartSummary(reverseAffectedParts);
        const revTrafficStatus = (reverseRouteStatus as string) === "PENDING_VERIFICATION" ? "WARNING" : reverseRouteStatus;

        const reverseDirectionMeta: FloodSegmentDirectionMeta = {
          ...floodDirectionMeta,
          directionCode: "B_TO_A",
          directionLabel: "ย้อนหลัก กม. (ขากลับ B → A)",
          affectedParts: reverseAffectedParts,
          trafficStatusDetail: mapTrafficStatusToDetail(revTrafficStatus),
          status_verified: true,
          waterLevelKnown: reverseWaterLevelKnown,
          arrow_direction: "REVERSE",
          roadSide: "RIGHT",
          carriageway_type: "DUAL_CARRIAGEWAY",
          zeroConfirmedAt: reverseWaterLevelKnown && numRevWaterLevel === 0 ? new Date().toISOString() : null,
        };

        const existingReverseSiblingId =
          routeEditId && editOriginalFloodDirRef.current === "B_TO_A"
            ? routeEditId
            : routeEditId
              ? (systemData.floodRoutes || []).find((f) => {
                  if (String(f.id) === String(routeEditId)) return false;
                  const m = parseFloodDirectionMeta(f.direction_meta, f);
                  return m.eventId === currentEventId && m.directionCode === "B_TO_A";
                })?.id
              : undefined;

        const revFallbackArea = (revSLon && revSLat) ? await localArea(Number(revSLon), Number(revSLat)) : fallbackArea;
        const revEffectiveDistrict = endArea?.district?.trim() || effectiveDistrict || revFallbackArea.amphoe || "";
        const revEffectiveSubdistrict = endArea?.subdistrict?.trim() || effectiveSubdistrict || revFallbackArea.tambon || "";

        const res = await upsertRouteAction({
          id: existingReverseSiblingId,
          recordType: "FLOOD",
          routeNo: chosenRouteNo,
          kmStart,
          kmEnd,
          district: revEffectiveDistrict,
          subdistrict: revEffectiveSubdistrict,
          sectionName: sectionName || "จุดรายงานน้ำท่วม",
          waterLevelCm: reverseWaterLevelKnown ? numRevWaterLevel : 0,
          trafficStatus: revTrafficStatus,
          isActive: !saveAsDraft,
          latStart: revSLat || undefined,
          lonStart: revSLon || undefined,
          latEnd: revELat || undefined,
          lonEnd: revELon || undefined,
          coordinates: reverseCoords,
          latestPhotoUrl: primaryPhoto,
          roadSide: "RIGHT",
          affectedLanes: revLanesSummary,
          affectedShoulder: revShoulderSummary,
          reporterName: reporterName.trim() || "เจ้าหน้าที่แขวงทางหลวงปัตตานี",
          directionMeta: reverseDirectionMeta,
        });

        if (res.success) {
          mediaPersisted = true;
          await syncReport(forwardRes.savedId, String(dbTrafficStatus));
          await syncReport(res.savedId, String(revTrafficStatus));
          try { await onDataRefresh(res.systemData); } catch { onToast("บันทึกแล้ว แต่ไม่สามารถโหลดข้อมูลล่าสุด กรุณารีเฟรชหน้าจอ"); }
          showSuccessModal(
            routeEditId ? "บันทึกเหตุการณ์ ๒ ฝั่งแยกกันสำเร็จ" : "บันทึกเหตุการณ์ ๒ ทิศทางสำเร็จ",
            `บันทึกช่วงน้ำท่วม ทล.${chosenRouteNo} ทั้งฝั่งขาไป (A→B) และฝั่งขากลับ (B→A) แยกข้อมูลระดับน้ำและแนวเส้นเรียบร้อยแล้ว`
          );
          setRouteEditId("");
          setFieldImages([]);
          handleClearRoute();
          if (onClearEditingRoute) onClearEditingRoute();
          if (onNavigateToIncidents) onNavigateToIncidents();
        }
        return;
      }

      let resolvedDetourStartPhotoUrl = detourStartPhotoUrl.trim();
      let resolvedDetourEndPhotoUrl = detourEndPhotoUrl.trim();
      if (routeMode === "DETOUR") {
        if (resolvedDetourStartPhotoUrl.startsWith("data:")) {
          try {
            const uploadedStart = await uploadExternalMediaAction({
              dataUrl: resolvedDetourStartPhotoUrl,
              fileName: `detour-start-${routeEditId || Date.now()}.webp`,
              ownerType: "DETOUR",
              ownerId: routeEditId || detourName || "detour",
            });
            uploadedMediaIds.push(uploadedStart.mediaId);
            resolvedDetourStartPhotoUrl = uploadedStart.url;
          } catch {
            // Keep compressed dataUrl if staging endpoint is not mocked in offline/unit test
          }
        }
        if (resolvedDetourEndPhotoUrl.startsWith("data:")) {
          try {
            const uploadedEnd = await uploadExternalMediaAction({
              dataUrl: resolvedDetourEndPhotoUrl,
              fileName: `detour-end-${routeEditId || Date.now()}.webp`,
              ownerType: "DETOUR",
              ownerId: routeEditId || detourName || "detour",
            });
            uploadedMediaIds.push(uploadedEnd.mediaId);
            resolvedDetourEndPhotoUrl = uploadedEnd.url;
          } catch {
            // Keep compressed dataUrl if staging endpoint is not mocked in offline/unit test
          }
        }
      }

      const resolvedDetourReverseCoords: [number, number][] =
        routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY"
          ? (draftReverseCoordinates.length >= 2
              ? draftReverseCoordinates
              : (revStartLat && revStartLon && revEndLat && revEndLon
                  ? [[Number(revStartLon), Number(revStartLat)], ...draftReverseWaypoints, [Number(revEndLon), Number(revEndLat)]]
                  : []))
          : [];

      const payload: Parameters<typeof upsertRouteAction>[0] = {
        id: routeEditId || linkedCreateId,
        ...(linkedCreateId ? { linkedDetourCreate: true } : {}),
        recordType: routeMode,
        routeNo: chosenRouteNo,
        kmStart,
        kmEnd,
        district: effectiveDistrict,
        subdistrict: effectiveSubdistrict,
        sectionName: sectionName || "จุดรายงานน้ำท่วม",
        waterLevelCm: waterLevelKnown ? numWaterLevel : 0,
        trafficStatus: dbTrafficStatus,
        detourRefId,
        detourName: detourName || "เส้นทางเลี่ยงน้ำท่วม",
        detourDesc,
        isActive: !saveAsDraft,
        latStart: numSLat || undefined,
        lonStart: numSLon || undefined,
        latEnd: numELat || undefined,
        lonEnd: numELon || undefined,
        coordinates: coords,
        latestPhotoUrl: primaryPhoto,
        // Item 3: Flood Directional & Lane-Specific Fields
        roadSide: routeMode === "FLOOD" ? effectiveRoadSide : undefined,
        affectedLanes: routeMode === "FLOOD" ? lanesSummary : undefined,
        affectedShoulder: routeMode === "FLOOD" ? shoulderSummary : undefined,
        reporterName: routeMode === "FLOOD" ? (reporterName.trim() || "เจ้าหน้าที่แขวงทางหลวงปัตตานี") : undefined,
        directionMeta: routeMode === "FLOOD" ? floodDirectionMeta : undefined,
        // Item 4: Detour Bidirectional & Asymmetric Fields
        reverseCoordinates: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? resolvedDetourReverseCoords : undefined,
        reverseWaypoints: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? draftReverseWaypoints : undefined,
        directionMode: routeMode === "DETOUR" ? detourDirectionMode : undefined,
        detourMeta: routeMode === "DETOUR"
          ? buildDetourMetaPayload({
              routeEditId,
              detourRefId,
              linkedEventId,
              detourRoutes: systemData.detourRoutes,
              coords,
              draftReverseCoordinates: resolvedDetourReverseCoords,
              detourDirectionMode,
              detourDurationMinFwd,
              detourDurationMinRev,
              detourDistanceMeters,
              closedRoadConflictsCount: closedRoadConflicts.length,
              isSymmetricSingleLine: Boolean(separation?.isSymmetricSingleLine),
              detourGoogleMapsUrlFwd,
              detourGoogleMapsUrlRev,
              detourRoadCondition,
              resolvedDetourStartPhotoUrl,
              detourStartPhotoCaption,
              detourStartPhotoLocation: resolveSubmitPhotoLocation(
                detourStartPhotoLocation,
                numSLat,
                numSLon,
                startArea
              ),
              resolvedDetourEndPhotoUrl,
              detourEndPhotoCaption,
              detourEndPhotoLocation: resolveSubmitPhotoLocation(
                detourEndPhotoLocation,
                numELat,
                numELon,
                endArea
              ),
              fwdPolyKm: calculatePolylineRoadDistanceKm(coords),
              revPolyKm: calculatePolylineRoadDistanceKm(
                detourDirectionMode === "TWO_WAY" && resolvedDetourReverseCoords.length >= 2 ? resolvedDetourReverseCoords : coords
              ),
            })
          : undefined,
      };
      const res = linkedCreateId ? await submitLinkedDetour(payload) : await upsertRouteAction(payload);
      if (!res) return;

      if (res.success) {
        mediaPersisted = true;
        await syncReport(res.savedId);
        try { await onDataRefresh(res.systemData); } catch { onToast("บันทึกแล้ว แต่ไม่สามารถโหลดข้อมูลล่าสุด กรุณารีเฟรชหน้าจอ"); }
        showSuccessModal(
          saveAsDraft ? "บันทึกร่างสำเร็จ" : routeEditId ? "แก้ไขข้อมูลสำเร็จ" : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงสำเร็จ" : "บันทึกเหตุการณ์น้ำท่วมสำเร็จ",
          saveAsDraft
            ? "บันทึกรายการแบบยังไม่เผยแพร่แล้ว สามารถเปิดจากรายการเพื่อแก้ไขและเปิดใช้งานภายหลัง"
            : routeMode === "DETOUR"
              ? `ทางเลี่ยง ${detourName || "รายการใหม่"} ถูกจัดเก็บและแสดงในรายการทางเลี่ยงแล้ว`
              : `ข้อมูล ทล.${routeNo} ${sectionName} ถูกจัดเก็บและแสดงบนแผนที่ประชาชนเรียบร้อยแล้ว`
        );
        setRouteEditId("");
        setFieldImages([]);
        handleClearRoute();
        if (onClearEditingRoute) onClearEditingRoute();
        if (routeMode === "FLOOD" && onNavigateToIncidents) onNavigateToIncidents();
      }
    } catch (err: any) {
      if (!mediaPersisted && uploadedMediaIds.length > 0) {
        await Promise.allSettled(uploadedMediaIds.map((mediaId) => deleteExternalMediaAction(mediaId)));
      }
      if (showErrorModal) {
        showErrorModal("เกิดข้อผิดพลาดในการบันทึก", err.message);
      } else {
        onToast("ข้อผิดพลาด: " + err.message);
      }
    } finally {
      if (isLinkedCreate) linkedRequestInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return { handleSubmitRoute, linkedDetourPending };
}
