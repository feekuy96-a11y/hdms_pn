"use client";

import React, { useEffect } from "react";
import type { DetourPointLocationSource } from "@/db/default-data";
import type { DetourPhotoLocationState } from "@/components/admin/tabs/useMapRouteFormState";
import { reverseGeocodeTambonAmphoe } from "@/lib/gis-utils";
import { insertVertex, nearestInsertIndex } from "@/lib/line-edit";

export interface UseMapCoordinatePickerParams {
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  startLat: string | number;
  startLon: string | number;
  endLat: string | number;
  endLon: string | number;
  revStartLat: string | number;
  revStartLon: string | number;
  revEndLat: string | number;
  revEndLon: string | number;
  setStartLat: (v: string | number) => void;
  setStartLon: (v: string | number) => void;
  setEndLat: (v: string | number) => void;
  setEndLon: (v: string | number) => void;
  setRevStartLat: (v: string | number) => void;
  setRevStartLon: (v: string | number) => void;
  setRevEndLat: (v: string | number) => void;
  setRevEndLon: (v: string | number) => void;
  setStartArea: (v: { subdistrict: string; district: string } | null) => void;
  setEndArea: (v: { subdistrict: string; district: string } | null) => void;
  resolveDetourPhotoArea?: (
    target: "START" | "END",
    latVal: number | string,
    lonVal: number | string,
    options?: {
      manual?: boolean;
      source?: DetourPointLocationSource;
      areaHint?: { subdistrict?: string; district?: string; province?: string } | null;
    }
  ) => Promise<void> | void;
  updateDetourPhotoLocation?: (
    target: "START" | "END",
    patch: Partial<DetourPhotoLocationState>,
    manual?: boolean
  ) => void;
  setIsGeocoding: (v: boolean) => void;
  setAdminPickMode: (mode: string | null) => void;
  freeEditEnabled: boolean;
  setFreeEditEnabled: (v: boolean) => void;
  activeEditTarget: "FORWARD" | "REVERSE";
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftReverseWaypoints: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  updateFreeGeometry: (coords: [number, number][]) => void;
  triggerDualRoadSnapping: (
    sLat: string | number,
    sLon: string | number,
    eLat: string | number,
    eLon: string | number,
    wps?: [number, number][],
    revWps?: [number, number][],
    options?: {
      revSLat?: string | number;
      revSLon?: string | number;
      revELat?: string | number;
      revELon?: string | number;
      reverseOnly?: boolean;
    }
  ) => Promise<void>;
  onToast: (msg: string) => void;
}

export function useMapCoordinatePicker(params: UseMapCoordinatePickerParams) {
  const {
    pickedCoordinate,
    startLat, startLon, endLat, endLon,
    revStartLat, revStartLon, revEndLat, revEndLon,
    setStartLat, setStartLon, setEndLat, setEndLon,
    setRevStartLat, setRevStartLon, setRevEndLat, setRevEndLon,
    setStartArea, setEndArea, resolveDetourPhotoArea, setIsGeocoding,
    setAdminPickMode,
    freeEditEnabled, setFreeEditEnabled,
    activeEditTarget,
    draftCoordinates, setDraftCoordinates,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseWaypoints, setDraftReverseWaypoints,
    updateFreeGeometry,
    triggerDualRoadSnapping,
    onToast,
  } = params;

  // Auto Geocode (lon, lat order preserved)
  const handleAutoGeocode = async (
    lon: number,
    lat: number,
    endpoint: "START" | "END"
  ) => {
    setIsGeocoding(true);
    try {
      const location = await reverseGeocodeTambonAmphoe(lon, lat);
      if (location) {
        const area = { subdistrict: location.subdistrict, district: location.district };
        if (endpoint === "START") setStartArea(area);
        else if (endpoint === "END") setEndArea(area);

        onToast(`ระบุพื้นที่อัตโนมัติ: ต.${location.subdistrict} อ.${location.district}`);
      }
    } catch {
      onToast("ไม่สามารถดึงข้อมูลตำบล/อำเภออัตโนมัติได้");
    } finally {
      setIsGeocoding(false);
    }
  };

  // Listen to pickedCoordinate from map
  useEffect(() => {
    if (!pickedCoordinate) return;

    if (pickedCoordinate.mode === "PICK_START") {
      setStartLat(pickedCoordinate.lat);
      setStartLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดเริ่มต้น (A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      void handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "START");
      if (endLat && endLon) {
        setFreeEditEnabled(false);
        setDraftCoordinates([]);
        setDraftReverseCoordinates?.([]);
        void triggerDualRoadSnapping(pickedCoordinate.lat, pickedCoordinate.lon, endLat, endLon);
      }
    } else if (pickedCoordinate.mode === "PICK_END") {
      setEndLat(pickedCoordinate.lat);
      setEndLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดสิ้นสุด (B): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      void handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "END");
      if (startLat && startLon) {
        setFreeEditEnabled(false);
        setDraftCoordinates([]);
        setDraftReverseCoordinates?.([]);
        void triggerDualRoadSnapping(startLat, startLon, pickedCoordinate.lat, pickedCoordinate.lon);
      }
    } else if (pickedCoordinate.mode === "PICK_DETOUR_PHOTO_START") {
      setAdminPickMode(null);
      onToast(`ปักหมุดจุดเริ่มต้น (A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      void resolveDetourPhotoArea?.("START", pickedCoordinate.lat, pickedCoordinate.lon, {
        manual: true,
        source: "MAP",
      });
    } else if (pickedCoordinate.mode === "PICK_DETOUR_PHOTO_END") {
      setAdminPickMode(null);
      onToast(`ปักหมุดจุดสิ้นสุด (B): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      void resolveDetourPhotoArea?.("END", pickedCoordinate.lat, pickedCoordinate.lon, {
        manual: true,
        source: "MAP",
      });
    } else if (pickedCoordinate.mode === "PICK_REV_START") {
      setRevStartLat(pickedCoordinate.lat);
      setRevStartLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดเริ่มขากลับ (B → A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      const targetRevEndLat = Number(revEndLat) || Number(startLat);
      const targetRevEndLon = Number(revEndLon) || Number(startLon);
      if (!freeEditEnabled && targetRevEndLat && targetRevEndLon && startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, draftReverseWaypoints, {
          revSLat: pickedCoordinate.lat,
          revSLon: pickedCoordinate.lon,
          revELat: targetRevEndLat,
          revELon: targetRevEndLon,
          reverseOnly: draftCoordinates.length >= 2,
        });
      }
    } else if (pickedCoordinate.mode === "PICK_REV_END") {
      setRevEndLat(pickedCoordinate.lat);
      setRevEndLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดสิ้นสุดขากลับ (B → A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      const targetRevStartLat = Number(revStartLat) || Number(endLat);
      const targetRevStartLon = Number(revStartLon) || Number(endLon);
      if (!freeEditEnabled && targetRevStartLat && targetRevStartLon && startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, draftReverseWaypoints, {
          revSLat: targetRevStartLat,
          revSLon: targetRevStartLon,
          revELat: pickedCoordinate.lat,
          revELon: pickedCoordinate.lon,
          reverseOnly: draftCoordinates.length >= 2,
        });
      }
    } else if (pickedCoordinate.mode === "ADD_LINE_VERTEX" && freeEditEnabled) {
      const point: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      const geometry = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
      if (geometry.length >= 2) updateFreeGeometry(insertVertex(geometry, nearestInsertIndex(geometry, point).index, point));
      setAdminPickMode(null);
    } else if (pickedCoordinate.mode === "ADD_WAYPOINT") {
      const newWp: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      setDraftWaypoints((prev) => [...prev, newWp]);
      setAdminPickMode(null);
      onToast("เพิ่มจุดดัดเส้นทางขาไป (A → B) เรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, [...draftWaypoints, newWp], draftReverseWaypoints);
      }
    } else if (pickedCoordinate.mode === "ADD_REVERSE_WAYPOINT") {
      const newRevWp: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      const nextRevWps = [...draftReverseWaypoints, newRevWp];
      setDraftReverseWaypoints?.(nextRevWps);
      setAdminPickMode(null);
      onToast("เพิ่มจุดดัดเส้นทางขากลับ (B → A) เรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, nextRevWps);
      }
    }
  }, [pickedCoordinate]);

  return { handleAutoGeocode };
}
