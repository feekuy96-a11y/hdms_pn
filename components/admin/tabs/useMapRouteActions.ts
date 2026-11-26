"use client";

import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import { computeSlicedHighwayPolylines } from "@/components/admin/tabs/map-management-helpers";
import { RoadSideType } from "@/lib/constants";
import { FloodDirectionCode } from "@/lib/flood-event-schema";
import { getDetailedPattaniAddress } from "@/lib/gis-utils";

export interface UseMapRouteActionsParams {
  highwayLayers: SystemDataPayload["highwayLayers"];
  routeMode: "FLOOD" | "DETOUR";
  activeEditTarget: "FORWARD" | "REVERSE";
  isSelectedHighwayDivided: boolean;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  roadSide: RoadSideType;
  directionCode: FloodDirectionCode;
  villageOrLandmark: string;
  setVillageOrLandmark: (val: string) => void;
  setIsFetchingAddress: (val: boolean) => void;
  startLat: number | string;
  setStartLat: (lat: number | string) => void;
  startLon: number | string;
  setStartLon: (lon: number | string) => void;
  endLat: number | string;
  setEndLat: (lat: number | string) => void;
  endLon: number | string;
  setEndLon: (lon: number | string) => void;
  revStartLat: number | string;
  setRevStartLat: (lat: number | string) => void;
  revStartLon: number | string;
  setRevStartLon: (lon: number | string) => void;
  revEndLat: number | string;
  setRevEndLat: (lat: number | string) => void;
  revEndLon: number | string;
  setRevEndLon: (lon: number | string) => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: (waypoints: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftReverseWaypoints: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  detourStartPhotoUrl: string;
  setDetourStartPhotoUrl: (url: string) => void;
  detourStartPhotoCaption: string;
  setDetourStartPhotoCaption: (caption: string) => void;
  detourEndPhotoUrl: string;
  setDetourEndPhotoUrl: (url: string) => void;
  detourEndPhotoCaption: string;
  setDetourEndPhotoCaption: (caption: string) => void;
  routingRequestRef: React.MutableRefObject<number>;
  originalRouteCoordinatesRef: React.MutableRefObject<[number, number][]>;
  originalReverseRouteCoordinatesRef: React.MutableRefObject<[number, number][]>;
  triggerDualRoadSnapping: (
    sLat: number | string,
    sLon: number | string,
    eLat: number | string,
    eLon: number | string,
    fwdWps: [number, number][],
    revWps: [number, number][]
  ) => Promise<void> | void;
  setSnappingStatusText: (text: string) => void;
  onToast: (msg: string) => void;
}

/**
 * Encapsulates route geometry manipulation actions (swap endpoints, midpoint/undo/remove
 * waypoints, original route restoration, KM-range slicing, and coordinate reverse-geocoding).
 * Preserves [lon, lat] Longdo Map coordinate order and increments routingRequestRef to prevent
 * stale OSRM responses from overwriting restored routes.
 */
export function useMapRouteActions({
  highwayLayers,
  routeMode,
  activeEditTarget,
  isSelectedHighwayDivided,
  routeNo,
  sectionName,
  kmStart,
  kmEnd,
  roadSide,
  directionCode,
  villageOrLandmark,
  setVillageOrLandmark,
  setIsFetchingAddress,
  startLat,
  setStartLat,
  startLon,
  setStartLon,
  endLat,
  setEndLat,
  endLon,
  setEndLon,
  revStartLat,
  setRevStartLat,
  revStartLon,
  setRevStartLon,
  revEndLat,
  setRevEndLat,
  revEndLon,
  setRevEndLon,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  draftReverseCoordinates,
  setDraftReverseCoordinates,
  draftReverseWaypoints,
  setDraftReverseWaypoints,
  detourStartPhotoUrl,
  setDetourStartPhotoUrl,
  detourStartPhotoCaption,
  setDetourStartPhotoCaption,
  detourEndPhotoUrl,
  setDetourEndPhotoUrl,
  detourEndPhotoCaption,
  setDetourEndPhotoCaption,
  routingRequestRef,
  originalRouteCoordinatesRef,
  originalReverseRouteCoordinatesRef,
  triggerDualRoadSnapping,
  setSnappingStatusText,
  onToast,
}: UseMapRouteActionsParams) {
  // Swap Endpoints
  const handleSwapEndpoints = () => {
    const tmpLat = startLat;
    const tmpLon = startLon;
    setStartLat(endLat);
    setStartLon(endLon);
    setEndLat(tmpLat);
    setEndLon(tmpLon);

    if (revStartLat !== "" || revStartLon !== "" || revEndLat !== "" || revEndLon !== "") {
      const tmpRevLat = revStartLat;
      const tmpRevLon = revStartLon;
      setRevStartLat(revEndLat);
      setRevStartLon(revEndLon);
      setRevEndLat(tmpRevLat);
      setRevEndLon(tmpRevLon);
    }

    if (routeMode === "DETOUR") {
      const tmpPhoto = detourStartPhotoUrl;
      const tmpCaption = detourStartPhotoCaption;
      setDetourStartPhotoUrl(detourEndPhotoUrl);
      setDetourStartPhotoCaption(detourEndPhotoCaption);
      setDetourEndPhotoUrl(tmpPhoto);
      setDetourEndPhotoCaption(tmpCaption);
    }

    if (draftCoordinates.length > 0) {
      const reversed = [...draftCoordinates].reverse() as [number, number][];
      setDraftCoordinates(reversed);
    }
    if (draftWaypoints.length > 0) {
      setDraftWaypoints([...draftWaypoints].reverse());
    }
    if (draftReverseCoordinates.length > 0) {
      setDraftReverseCoordinates?.([...draftReverseCoordinates].reverse() as [number, number][]);
    }
    if (draftReverseWaypoints.length > 0) {
      setDraftReverseWaypoints?.([...draftReverseWaypoints].reverse());
    }
    onToast("สลับจุดเริ่มต้นและสิ้นสุด A ⇄ B เรียบร้อย");
  };

  // Add Midpoint Waypoint (supports both A -> B and B -> A)
  const handleAddMidpointWaypoint = () => {
    const start: [number, number] = [Number(startLon), Number(startLat)];
    const end: [number, number] = [Number(endLon), Number(endLat)];
    const hasEndpoints =
      [...start, ...end].every(Number.isFinite) &&
      start.every((value) => value !== 0) &&
      end.every((value) => value !== 0);
    if (draftCoordinates.length < 2 && !hasEndpoints) {
      onToast("กรุณากำหนดจุด A และ B ก่อนเพิ่มจุดกึ่งกลาง");
      return;
    }
    if (activeEditTarget === "REVERSE") {
      const revStartPt: [number, number] = [Number(revStartLon) || end[0], Number(revStartLat) || end[1]];
      const revEndPt: [number, number] = [Number(revEndLon) || start[0], Number(revEndLat) || start[1]];
      const revSource =
        draftReverseCoordinates.length >= 2
          ? draftReverseCoordinates
          : [...draftCoordinates].reverse();
      const midPoint: [number, number] =
        revSource.length >= 2
          ? revSource[Math.floor(revSource.length / 2)]
          : [(revStartPt[0] + revEndPt[0]) / 2, (revStartPt[1] + revEndPt[1]) / 2];
      const nextRevWps = [...draftReverseWaypoints, midPoint];
      setDraftReverseWaypoints?.(nextRevWps);
      onToast(`เพิ่มจุดดัดแนวเส้นขากลับ (B → A) ที่พิกัด ${midPoint[1].toFixed(4)}, ${midPoint[0].toFixed(4)}`);
      if (startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, nextRevWps);
      }
      return;
    }
    const midPoint: [number, number] =
      draftCoordinates.length >= 2
        ? draftCoordinates[Math.floor(draftCoordinates.length / 2)]
        : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const nextFwdWps = [...draftWaypoints, midPoint];
    setDraftWaypoints(nextFwdWps);
    onToast(`เพิ่มจุดดัดแนวเส้นทางที่พิกัด ${midPoint[1].toFixed(4)}, ${midPoint[0].toFixed(4)}`);
    if (startLat && startLon && endLat && endLon && routeMode === "DETOUR") {
      void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, nextFwdWps, draftReverseWaypoints);
    }
  };

  // Undo Waypoint (supports both A -> B and B -> A)
  const handleUndoWaypoint = () => {
    if (activeEditTarget === "REVERSE") {
      if (draftReverseWaypoints.length > 0) {
        const updated = draftReverseWaypoints.slice(0, -1);
        setDraftReverseWaypoints?.(updated);
        onToast("ยกเลิกจุดดัดขากลับ (B → A) ล่าสุดเรียบร้อย");
        if (startLat && startLon && endLat && endLon) {
          void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, updated);
        }
      } else {
        onToast("ไม่มีจุดดัดเส้นทางขากลับให้ยกเลิก");
      }
      return;
    }
    if (draftWaypoints.length > 0) {
      const updated = draftWaypoints.slice(0, -1);
      setDraftWaypoints(updated);
      onToast("ยกเลิกจุดดัดล่าสุดเรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated, draftReverseWaypoints);
      }
    } else {
      onToast("ไม่มีจุดดัดเส้นทางให้ยกเลิก");
    }
  };

  const handleRemoveWaypoint = (index: number) => {
    const updated = draftWaypoints.filter((_, waypointIndex) => waypointIndex !== index);
    setDraftWaypoints(updated);
    onToast(`ลบจุดดัดที่ ${index + 1} แล้ว`);
    if (startLat && startLon && endLat && endLon) {
      void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated, draftReverseWaypoints);
    }
  };

  const handleRestoreOriginalRoute = () => {
    if (activeEditTarget === "REVERSE") {
      const source = originalReverseRouteCoordinatesRef.current;
      if (source.length < 2) {
        onToast("รายการนี้ไม่มีแนวเส้นขากลับเดิมสำหรับคืนค่า");
        return;
      }
      routingRequestRef.current += 1;
      setDraftReverseWaypoints?.([]);
      setDraftReverseCoordinates?.(source.map((coordinate) => [...coordinate] as [number, number]));
      setSnappingStatusText("คืนค่าแนวเส้นขากลับ (B → A) เดิมแล้ว กดบันทึกเพื่อยืนยัน");
      onToast("คืนค่าแนวเส้นขากลับ (B → A) เดิมเรียบร้อยแล้ว");
      return;
    }
    if (originalRouteCoordinatesRef.current.length < 2) {
      onToast("รายการนี้ไม่มีแนวเส้นเดิมสำหรับคืนค่า");
      return;
    }
    routingRequestRef.current += 1;
    setDraftWaypoints([]);
    setDraftCoordinates(originalRouteCoordinatesRef.current.map((coordinate) => [...coordinate] as [number, number]));
    setSnappingStatusText("คืนค่าแนวเส้นเดิมแล้ว กดบันทึกเพื่อยืนยัน");
    onToast("คืนค่าแนวเส้นเดิมเรียบร้อยแล้ว");
  };

  // ดึงชื่อหมู่บ้าน/ตำบลจากพิกัดจุดเริ่มต้น
  const handleFetchLocationFromCoords = async () => {
    const lon = startLon || (draftCoordinates.length > 0 ? draftCoordinates[0][0] : undefined);
    const lat = startLat || (draftCoordinates.length > 0 ? draftCoordinates[0][1] : undefined);
    if (lon === undefined || lat === undefined || (Number(lon) === 0 && Number(lat) === 0)) {
      onToast("กรุณาระบุพิกัดหรือคำนวณแนวเส้นก่อนดึงตำแหน่ง");
      return;
    }
    try {
      setIsFetchingAddress(true);
      const addr = await getDetailedPattaniAddress(Number(lon), Number(lat));
      const cleanTag = addr.tag ? addr.tag.replace(/^\(|\)$/g, "").trim() : "";
      const displayLoc =
        [cleanTag, addr.road].filter(Boolean).join(" ") ||
        (addr.tambon ? `ต.${addr.tambon} อ.${addr.amphoe}` : "");
      if (displayLoc.trim()) {
        setVillageOrLandmark(displayLoc.trim());
        onToast(`ดึงตำแหน่งสำเร็จ: ${displayLoc.trim()}`);
      } else {
        onToast("ไม่พบชื่อหมู่บ้านจากพิกัดดังกล่าว");
      }
    } catch {
      onToast("ไม่สามารถดึงข้อมูลตำแหน่งจากพิกัดได้");
    } finally {
      setIsFetchingAddress(false);
    }
  };

  // Slice Polyline from Phase 1 GIS Highway Layers by KM Range & Direction
  const handleSlicePolylineFromKm = () => {
    if (!routeNo || !kmStart || !kmEnd) {
      onToast("กรุณาระบุหมายเลขทางหลวง, กม.เริ่มต้น และ กม.สิ้นสุด ก่อนคำนวณแนวเส้น");
      return;
    }

    const { slicedForward, slicedReverse } = computeSlicedHighwayPolylines({
      highwayLayers,
      routeNo,
      sectionName,
      kmStart,
      kmEnd,
      roadSide,
      isSelectedHighwayDivided,
      directionCode,
    });

    if (slicedForward.length >= 2) {
      setDraftCoordinates(slicedForward);
      originalRouteCoordinatesRef.current = slicedForward.map((p) => [...p] as [number, number]);
      setDraftReverseCoordinates?.(slicedReverse);
      originalReverseRouteCoordinatesRef.current = slicedReverse.map((p) => [...p] as [number, number]);
      const [firstLon, firstLat] = slicedForward[0];
      const [lastLon, lastLat] = slicedForward[slicedForward.length - 1];
      setStartLat(firstLat);
      setStartLon(firstLon);
      setEndLat(lastLat);
      setEndLon(lastLon);
      if (!villageOrLandmark.trim()) {
        getDetailedPattaniAddress(firstLon, firstLat)
          .then((addr) => {
            if (addr && addr.tag) {
              const cleanTag = addr.tag.replace(/^\(|\)$/g, "").trim();
              const displayLoc =
                [cleanTag, addr.road].filter(Boolean).join(" ") ||
                (addr.tambon ? `ต.${addr.tambon} อ.${addr.amphoe}` : "");
              if (displayLoc.trim()) setVillageOrLandmark(displayLoc.trim());
            }
          })
          .catch(() => {});
      }
      onToast(
        slicedReverse.length >= 2
          ? `คำนวณแนวเส้น ทล.${routeNo} ช่วง กม.${kmStart} - ${kmEnd} (แยกขาไป A→B และขากลับ B→A) สำเร็จ`
          : `คำนวณแนวเส้น ทล.${routeNo} ช่วง กม.${kmStart} - ${kmEnd} (${directionCode === "B_TO_A" ? "ย้อน กม." : "ตาม กม."}) สำเร็จ`
      );
    } else {
      onToast(`ไม่พบข้อมูลแนวเส้น GIS ของ ทล.${routeNo} ในระบบ กรุณาคลิกเลือกจุดบนแผนที่หรือคำนวณเส้นเกาะถนน`);
    }
  };

  return {
    handleSwapEndpoints,
    handleAddMidpointWaypoint,
    handleUndoWaypoint,
    handleRemoveWaypoint,
    handleRestoreOriginalRoute,
    handleFetchLocationFromCoords,
    handleSlicePolylineFromKm,
  };
}
