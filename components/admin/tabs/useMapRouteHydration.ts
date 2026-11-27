"use client";

import { decodeFloodImpactParts } from "@/lib/flood-event-schema";
import { savedRouteEditLine, type SavedRouteEditReference } from "@/components/map/longdo-draft-layer";
import React, { useEffect, useRef } from "react";
import { type DetourPointPhoto, SystemDataPayload } from "@/db/default-data";
import {
  EMPTY_DETOUR_PHOTO_LOCATION,
  type DetourPhotoLocationState,
} from "@/components/admin/tabs/useMapRouteFormState";
import {
  findBestHighwayGroupForSelection,
  sliceBranchByKmRange,
} from "@/components/admin/tabs/map-management-helpers";
import { detourDurationSeconds as readDetourDurationSeconds } from "@/lib/detour-presentation";
import { localArea, resolveDetourPinArea } from "@/lib/gis-utils";
import {
  AFFECTED_LANES_OPTIONS,
  type AffectedShoulderType,
  type DetourDirectionModeType,
  type RoadSideType,
} from "@/lib/constants";
import {
  parseFloodDirectionMeta,
  resolveEffectiveRoadSide,
  type AffectedRoadPart,
  type FloodDirectionCode,
  type FloodPhotoItem,
} from "@/lib/flood-event-schema";
import {
  cleanHighwaySectionName,
  getAvailableHighwayRoutes,
} from "@/lib/highway-schema";
import type { AdminMapDraftSnapshot } from "@/components/admin/tabs/map-draft-storage";

type TrafficStatus = AdminMapDraftSnapshot["routeStatus"];

export interface UseMapRouteHydrationParams {
  editingRoute?: { type: "FLOOD" | "DETOUR"; id: string } | null;
  systemData: SystemDataPayload;
  setSavedEditReference: (reference: SavedRouteEditReference | null) => void;
  setRouteMode: (v: "FLOOD" | "DETOUR") => void;
  setRouteEditId: (v: string) => void;
  setRouteNo: (v: string) => void;
  setKmStart: (v: string) => void;
  setKmEnd: (v: string) => void;
  setSectionName: (v: string) => void;
  setSelectedHighwayName: (v: string) => void;
  sectionNameManuallyEdited: React.MutableRefObject<boolean>;
  setRouteWaterLevel: (v: string | number) => void;
  setRouteStatus: (v: TrafficStatus) => void;
  editOriginalFloodDirRef: React.MutableRefObject<FloodDirectionCode | null>;
  setRoadSide: (v: RoadSideType) => void;
  setAffectedLanes: (v: string) => void;
  setAffectedShoulder: (v: AffectedShoulderType) => void;
  setReporterName: (v: string) => void;
  setWaterLevelKnown: (v: boolean) => void;
  setUseCarriagewaySnapping: (v: boolean) => void;
  setSaveAsDraft: (v: boolean) => void;
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
  originalRouteCoordinates: React.MutableRefObject<[number, number][]>;
  originalReverseRouteCoordinates: React.MutableRefObject<[number, number][]>;
  setDraftCoordinates: (v: [number, number][]) => void;
  setDraftReverseCoordinates?: (v: [number, number][]) => void;
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setDraftConflictPoints?: (points: Array<{ coord: [number, number]; label: string }>) => void;
  setClosedRoadConflicts: (v: string[]) => void;
  setReverseRouteWaterLevel: (v: string | number) => void;
  setReverseRouteStatus: (v: TrafficStatus) => void;
  setReverseWaterLevelKnown: (v: boolean) => void;
  setReverseAffectedParts: (v: AffectedRoadPart[]) => void;
  setSelectedParentEventId: (v: string) => void;
  setEventCode: (v: string) => void;
  setEventTitle: (v: string) => void;
  setVillageOrLandmark: (v: string) => void;
  setStartedAt: (v: string) => void;
  setCauseAndNote: (v: string) => void;
  setDirectionCode: (v: FloodDirectionCode) => void;
  setAffectedParts: (v: AffectedRoadPart[]) => void;
  setDetailedPhotos: (v: FloodPhotoItem[]) => void;
  setFieldImages: (v: string[]) => void;
  setDetourRefId: (v: string) => void;
  setDetourName: (v: string) => void;
  setDetourDesc: (v: string) => void;
  setCarriagewayChoice: (v: "" | "SHARED" | "DIVIDED") => void;
  setDetourDirectionMode: (v: DetourDirectionModeType) => void;
  setDetourGoogleMapsUrlFwd: (v: string) => void;
  setDetourGoogleMapsUrlRev: (v: string) => void;
  setDetourRoadCondition: (v: string) => void;
  setDetourDistanceMeters: (v: { forward: number; reverse: number }) => void;
  setDetourDurationSeconds: (v: { forward: number; reverse: number }) => void;
  durationFwdManualRef: React.MutableRefObject<boolean>;
  durationRevManualRef: React.MutableRefObject<boolean>;
  setDetourDurationMinFwd: (v: string) => void;
  setDetourDurationMinRev: (v: string) => void;
  setPassabilityWarnings: (v: string[]) => void;
  setDetourStartPhotoUrl: (v: string) => void;
  setDetourStartPhotoCaption: (v: string) => void;
  setDetourStartPhotoLocation?: React.Dispatch<React.SetStateAction<DetourPhotoLocationState>>;
  setDetourEndPhotoUrl: (v: string) => void;
  setDetourEndPhotoCaption: (v: string) => void;
  setDetourEndPhotoLocation?: React.Dispatch<React.SetStateAction<DetourPhotoLocationState>>;
  startPhotoLocManualRef?: React.MutableRefObject<boolean>;
  endPhotoLocManualRef?: React.MutableRefObject<boolean>;
}

export function useMapRouteHydration(params: UseMapRouteHydrationParams) {
  const {
    editingRoute,
    systemData,
    setSavedEditReference,
    setRouteMode,
    setRouteEditId,
    setRouteNo,
    setKmStart,
    setKmEnd,
    setSectionName,
    setSelectedHighwayName,
    sectionNameManuallyEdited,
    setRouteWaterLevel,
    setRouteStatus,
    editOriginalFloodDirRef,
    setRoadSide,
    setAffectedLanes,
    setAffectedShoulder,
    setReporterName,
    setWaterLevelKnown,
    setUseCarriagewaySnapping,
    setSaveAsDraft,
    setStartLat,
    setStartLon,
    setEndLat,
    setEndLon,
    setRevStartLat,
    setRevStartLon,
    setRevEndLat,
    setRevEndLon,
    setStartArea,
    setEndArea,
    originalRouteCoordinates,
    originalReverseRouteCoordinates,
    setDraftCoordinates,
    setDraftReverseCoordinates,
    setDraftReverseWaypoints,
    setDraftConflictPoints,
    setClosedRoadConflicts,
    setReverseRouteWaterLevel,
    setReverseRouteStatus,
    setReverseWaterLevelKnown,
    setReverseAffectedParts,
    setSelectedParentEventId,
    setEventCode,
    setEventTitle,
    setVillageOrLandmark,
    setStartedAt,
    setCauseAndNote,
    setDirectionCode,
    setAffectedParts,
    setDetailedPhotos,
    setFieldImages,
    setDetourRefId,
    setDetourName,
    setDetourDesc,
    setDetourDirectionMode,
    setCarriagewayChoice,
    setDetourGoogleMapsUrlFwd,
    setDetourGoogleMapsUrlRev,
    setDetourRoadCondition,
    setDetourDistanceMeters,
    setDetourDurationSeconds,
    durationFwdManualRef,
    durationRevManualRef,
    setDetourDurationMinFwd,
    setDetourDurationMinRev,
    setPassabilityWarnings,
    setDetourStartPhotoUrl,
    setDetourStartPhotoCaption,
    setDetourStartPhotoLocation,
    setDetourEndPhotoUrl,
    setDetourEndPhotoCaption,
    setDetourEndPhotoLocation,
    startPhotoLocManualRef,
    endPhotoLocManualRef,
  } = params;

  // Hydrate an existing record only once per editing session. Refetches of public/full
  // geometry must not silently overwrite the officer's unsaved manual edits.
  const hydratedRouteKey = useRef<string | null>(null);
  useEffect(() => {
    if (!editingRoute) { hydratedRouteKey.current = null; return; }
    const { type, id } = editingRoute;
    const key = `${type}:${id}`;
    if (id && hydratedRouteKey.current === key) return;
    setRouteMode(type);
    setRouteEditId(id);

    if (type === "FLOOD") {
      const flood = systemData.floodRoutes.find((r) => r.id === id);
      if (!flood) return;
      hydratedRouteKey.current = key;
      if (startPhotoLocManualRef) startPhotoLocManualRef.current = false;
      if (endPhotoLocManualRef) endPhotoLocManualRef.current = false;
      setDetourStartPhotoLocation?.(EMPTY_DETOUR_PHOTO_LOCATION);
      setDetourEndPhotoLocation?.(EMPTY_DETOUR_PHOTO_LOCATION);
      setRouteNo(flood.route_no);
      setKmStart(flood.km_start);
      setKmEnd(flood.km_end);
      setSectionName(flood.section_name);
      const cleanSec = cleanHighwaySectionName(flood.section_name);
      const matchedOpt = getAvailableHighwayRoutes(systemData).find(
        (h) => h.no === String(flood.route_no).replace(/^ทล\.?/i, "").trim() &&
          (!cleanSec || cleanHighwaySectionName(h.sectionName) === cleanSec)
      );
      setSelectedHighwayName(matchedOpt?.name || "");
      sectionNameManuallyEdited.current = true;
      setRouteWaterLevel(flood.water_level_cm);
      setRouteStatus(flood.traffic_status);
      const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
      editOriginalFloodDirRef.current = meta.directionCode;
      const effectiveSide = resolveEffectiveRoadSide(flood);
      setRoadSide(effectiveSide);
      setAffectedLanes(flood.affected_lanes || AFFECTED_LANES_OPTIONS[0]);
      setAffectedShoulder((flood.affected_shoulder as AffectedShoulderType) || "NONE");
      setReporterName(flood.reporter_name || "");
      setWaterLevelKnown(flood.direction_meta?.water_level_known !== false);
      setUseCarriagewaySnapping(flood.direction_meta?.carriageway_type === "DUAL_CARRIAGEWAY");
      setSaveAsDraft(!flood.is_active);
      setStartLat(flood.lat_start);
      setStartLon(flood.lon_start);
      setEndLat(flood.lat_end);
      setEndLon(flood.lon_end);
      if (flood.lat_start && flood.lon_start) {
        if (flood.subdistrict && flood.district) {
          setStartArea({ subdistrict: flood.subdistrict, district: flood.district });
        } else {
          void localArea(Number(flood.lon_start), Number(flood.lat_start)).then((loc) => {
            if (loc.tambon && loc.amphoe) setStartArea({ subdistrict: loc.tambon, district: loc.amphoe });
          });
        }
      }
      if (flood.lat_end && flood.lon_end) {
        void localArea(Number(flood.lon_end), Number(flood.lat_end)).then((endLoc) => {
          if (endLoc.tambon && endLoc.amphoe) setEndArea({ subdistrict: endLoc.tambon, district: endLoc.amphoe });
        });
      }

      let coords: [number, number][] = [];
      if (Array.isArray(flood.coordinates_json)) coords = flood.coordinates_json as [number, number][];
      else if (typeof flood.coordinates_json === "string") coords = JSON.parse(flood.coordinates_json);
      originalRouteCoordinates.current = coords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftCoordinates(coords);

      const savedLines = savedRouteEditLine(id, coords);
      let revCoords: [number, number][] = [];
      if (effectiveSide === "BOTH") {
        const existingRevSibling = meta.eventId
          ? (systemData.floodRoutes || []).find((f) => {
              if (String(f.id) === String(flood.id)) return false;
              const fm = parseFloodDirectionMeta(f.direction_meta, f);
              return fm.eventId === meta.eventId && fm.directionCode === "B_TO_A";
            })
          : undefined;
        if (existingRevSibling) {
          if (Array.isArray(existingRevSibling.coordinates_json)) revCoords = existingRevSibling.coordinates_json as [number, number][];
          else if (typeof existingRevSibling.coordinates_json === "string") {
            try { revCoords = JSON.parse(existingRevSibling.coordinates_json); } catch { revCoords = []; }
          }
        }
        if (existingRevSibling) savedLines.push(...savedRouteEditLine(existingRevSibling.id, revCoords));
        if (revCoords.length < 2) {
          const matchedGroup = findBestHighwayGroupForSelection(
            systemData.highwayLayers,
            flood.route_no,
            flood.section_name,
            flood.km_start,
            flood.km_end
          );
          const fwdBranch = matchedGroup?.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) || matchedGroup?.primaryBranch;
          const revBranch = matchedGroup?.branches.find((b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2);
          if (matchedGroup && revBranch) {
            revCoords = sliceBranchByKmRange(revBranch, fwdBranch, matchedGroup.kmStart, matchedGroup.kmEnd, flood.km_start, flood.km_end, true);

          }
        }
        setReverseRouteWaterLevel(existingRevSibling ? existingRevSibling.water_level_cm : flood.water_level_cm);
        setReverseRouteStatus(existingRevSibling ? existingRevSibling.traffic_status : flood.traffic_status);
        setReverseWaterLevelKnown(existingRevSibling ? existingRevSibling.direction_meta?.water_level_known !== false : flood.direction_meta?.water_level_known !== false);
        const siblingMeta = existingRevSibling ? parseFloodDirectionMeta(existingRevSibling.direction_meta, existingRevSibling) : meta;
        setReverseAffectedParts(siblingMeta.affectedParts.length ? decodeFloodImpactParts(siblingMeta) : ["ALL_LANES"]);
      } else {
        setReverseRouteWaterLevel("");
        setReverseRouteStatus("WARNING");
        setReverseWaterLevelKnown(true);
        setReverseAffectedParts(["ALL_LANES"]);
      }
      setSavedEditReference(savedLines.length ? { type, id, lines: savedLines } : null);
      // Preserve the existing record shape on edit; new reports still require
      // explicit confirmation when neither roadway metadata nor a choice exists.
      setCarriagewayChoice(effectiveSide === "BOTH"
        ? revCoords.length >= 2 ? "DIVIDED" : "SHARED"
        : "");
      originalReverseRouteCoordinates.current = revCoords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftReverseCoordinates?.(revCoords);
      setDraftReverseWaypoints?.([]);
      setDraftConflictPoints?.([]);
      if (effectiveSide === "BOTH" && revCoords.length >= 2) {
        setRevStartLat(revCoords[0][1]);
        setRevStartLon(revCoords[0][0]);
        setRevEndLat(revCoords[revCoords.length - 1][1]);
        setRevEndLon(revCoords[revCoords.length - 1][0]);
      } else {
        setRevStartLat("");
        setRevStartLon("");
        setRevEndLat("");
        setRevEndLon("");
      }

      // Phase 2 Meta Hydration
      setSelectedParentEventId(meta.eventId);
      setEventCode(meta.eventCode);
      setEventTitle(meta.eventTitle || "");
      setVillageOrLandmark(meta.villageOrLandmark || "");
      if (meta.startedAt) setStartedAt(meta.startedAt.slice(0, 16));
      setCauseAndNote(meta.causeAndNote || flood.detour_advice || "");
      setDirectionCode(meta.directionCode);
      setAffectedParts(meta.affectedParts.length ? decodeFloodImpactParts(meta) : ["UNSPECIFIED"]);
      setDetailedPhotos(meta.photos || []);
      setFieldImages(meta.photos?.length ? meta.photos.map((p) => p.dataUrl) : (flood.latest_photo_url ? [flood.latest_photo_url] : []));
    } else {
      const detour = systemData.detourRoutes.find((r) => r.id === id);
      if (!detour) return;
      hydratedRouteKey.current = key;
      setDetourRefId(detour.flood_id_ref || "");
      setDetourName(detour.route_name);
      setDetourDesc(detour.description || "");
      setDetourDirectionMode((detour.direction_mode as DetourDirectionModeType) || ("" as DetourDirectionModeType));
      setDetourGoogleMapsUrlFwd(detour.detour_meta?.google_maps_url_forward || detour.detour_meta?.google_maps_url || "");
      setDetourGoogleMapsUrlRev(detour.detour_meta?.google_maps_url_reverse || "");
      setDetourRoadCondition(detour.detour_meta?.road_condition || "");
      setDetourDistanceMeters({
        forward: Number(detour.detour_meta?.forward_distance_m) || 0,
        reverse: Number(detour.detour_meta?.reverse_distance_m) || 0,
      });
      const fwdSec = readDetourDurationSeconds(detour.detour_meta, "FORWARD");
      const revSec = readDetourDurationSeconds(detour.detour_meta, "REVERSE");
      setDetourDurationSeconds({
        forward: fwdSec || 0,
        reverse: revSec || 0,
      });
      durationFwdManualRef.current = Boolean(fwdSec);
      durationRevManualRef.current = Boolean(revSec);
      setDetourDurationMinFwd(fwdSec ? String(Math.max(1, Math.round(fwdSec / 60))) : "");
      setDetourDurationMinRev(revSec ? String(Math.max(1, Math.round(revSec / 60))) : "");
      setPassabilityWarnings([]);
      setDetourStartPhotoUrl(detour.detour_meta?.start_point_photo?.url || "");
      setDetourStartPhotoCaption(detour.detour_meta?.start_point_photo?.caption || "");
      setDetourEndPhotoUrl(detour.detour_meta?.end_point_photo?.url || "");
      setDetourEndPhotoCaption(detour.detour_meta?.end_point_photo?.caption || "");
      setSaveAsDraft(!detour.is_active);
      setStartLat(detour.lat_start || 0);
      setStartLon(detour.lon_start || 0);
      setEndLat(detour.lat_end || 0);
      setEndLon(detour.lon_end || 0);
      if (detour.lat_start && detour.lon_start) {
        if (detour.subdistrict && detour.district) {
          setStartArea({ subdistrict: detour.subdistrict, district: detour.district });
        } else {
          void localArea(Number(detour.lon_start), Number(detour.lat_start)).then((loc) => {
            if (loc.tambon && loc.amphoe) setStartArea({ subdistrict: loc.tambon, district: loc.amphoe });
          });
        }
      }
      if (detour.lat_end && detour.lon_end) {
        void localArea(Number(detour.lon_end), Number(detour.lat_end)).then((endLoc) => {
          if (endLoc.tambon && endLoc.amphoe) setEndArea({ subdistrict: endLoc.tambon, district: endLoc.amphoe });
        });
      }

      let coords: [number, number][] = [];
      if (Array.isArray(detour.coordinates_json)) coords = detour.coordinates_json as [number, number][];
      else if (typeof detour.coordinates_json === "string") coords = JSON.parse(detour.coordinates_json);

      const hydratePhotoLocation = (
        photo: DetourPointPhoto | undefined,
        fallbackLat: number,
        fallbackLon: number,
        manualRef: React.MutableRefObject<boolean> | undefined,
        setLoc: React.Dispatch<React.SetStateAction<DetourPhotoLocationState>> | undefined
      ) => {
        if (!setLoc) return;
        const photoPin = typeof photo?.lat === "number" && typeof photo?.lon === "number" &&
          Number.isFinite(photo.lat) && Number.isFinite(photo.lon) &&
          Math.abs(photo.lat) <= 90 && Math.abs(photo.lon) <= 180 && (photo.lat !== 0 || photo.lon !== 0);
        const lat = photoPin ? photo!.lat! : fallbackLat;
        const lon = photoPin ? photo!.lon! : fallbackLon;
        const valid = Number.isFinite(lat) && Number.isFinite(lon) &&
          Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
        const subdistrict = photo?.subdistrict?.trim() || "";
        const district = photo?.district?.trim() || "";
        const province = photo?.province?.trim() || "";
        if (manualRef) manualRef.current = Boolean(photoPin || subdistrict || district || province);
        if (!photo?.url && !photo?.caption && !manualRef?.current && !photoPin && !subdistrict && !district && !province) {
          setLoc(EMPTY_DETOUR_PHOTO_LOCATION);
          return;
        }
        const latText = valid ? lat.toFixed(6) : "", lonText = valid ? lon.toFixed(6) : "";
        setLoc({
          lat: latText,
          lon: lonText,
          subdistrict, district, province,
          locationSource: photo?.locationSource ?? (photoPin ? "MANUAL" : "ROUTE_ENDPOINT"),
          resolvedAt: photo?.resolvedAt,
          areaStatus: subdistrict && district ? "resolved" : valid ? "resolving" : "idle",
        });
        if (valid && (!subdistrict || !district || !province)) {
          void resolveDetourPinArea(lon, lat).then((area) => {
            if (hydratedRouteKey.current !== key) return;
            setLoc((prev) => {
              if (Number(prev.lat) !== Number(latText) || Number(prev.lon) !== Number(lonText)) return prev;
              const nextSub = prev.subdistrict || area?.tambon || "";
              const nextDist = prev.district || area?.amphoe || "";
              return {
                ...prev, subdistrict: nextSub, district: nextDist, province: prev.province || area?.province || "",
                areaStatus: nextSub && nextDist ? "resolved" : "not_found",
              };
            });
          });
        }
      };

      const startPhoto = detour.detour_meta?.start_point_photo;
      const endPhoto = detour.detour_meta?.end_point_photo;
      const fallbackStartLat = Number(detour.lat_start) || coords[0]?.[1] || 0;
      const fallbackStartLon = Number(detour.lon_start) || coords[0]?.[0] || 0;
      const fallbackEndLat = Number(detour.lat_end) || coords[coords.length - 1]?.[1] || 0;
      const fallbackEndLon = Number(detour.lon_end) || coords[coords.length - 1]?.[0] || 0;

      hydratePhotoLocation(
        startPhoto,
        fallbackStartLat,
        fallbackStartLon,
        startPhotoLocManualRef,
        setDetourStartPhotoLocation
      );
      hydratePhotoLocation(
        endPhoto,
        fallbackEndLat,
        fallbackEndLon,
        endPhotoLocManualRef,
        setDetourEndPhotoLocation
      );

      originalRouteCoordinates.current = coords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftCoordinates(coords);

      let revCoords: [number, number][] = [];
      if (Array.isArray(detour.reverse_coordinates_json)) revCoords = detour.reverse_coordinates_json as [number, number][];
      else if (typeof detour.reverse_coordinates_json === "string") {
        try { revCoords = JSON.parse(detour.reverse_coordinates_json); } catch { revCoords = []; }
      }
      const savedLines = [...savedRouteEditLine(id, coords), ...savedRouteEditLine(id, revCoords)];
      setSavedEditReference(savedLines.length ? { type, id, lines: savedLines } : null);
      setCarriagewayChoice(revCoords.length >= 2 ? "DIVIDED" : "SHARED");
      originalReverseRouteCoordinates.current = revCoords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftReverseCoordinates?.(revCoords);

      let revWps: [number, number][] = [];
      if (Array.isArray(detour.reverse_waypoints_json)) revWps = detour.reverse_waypoints_json as [number, number][];
      else if (typeof detour.reverse_waypoints_json === "string") {
        try { revWps = JSON.parse(detour.reverse_waypoints_json); } catch { revWps = []; }
      }
      setDraftReverseWaypoints?.(revWps);
      setDraftConflictPoints?.([]);
      setClosedRoadConflicts([]);
      if (detour.direction_mode === "TWO_WAY" && revCoords.length >= 2) {
        setRevStartLat(revCoords[0][1]);
        setRevStartLon(revCoords[0][0]);
        setRevEndLat(revCoords[revCoords.length - 1][1]);
        setRevEndLon(revCoords[revCoords.length - 1][0]);
      } else {
        setRevStartLat("");
        setRevStartLon("");
        setRevEndLat("");
        setRevEndLon("");
      }
    }
  }, [editingRoute, systemData]);

  // Listen to preset flood context when adding segment from parent event
  useEffect(() => {
    const handlePresetContext = (e: Event) => {
      const ctx = (e as CustomEvent<{ routeNo?: string; sectionName?: string }>).detail;
      if (!ctx) return;
      setRouteMode("FLOOD");
      if (ctx.routeNo) setRouteNo(ctx.routeNo);
      if (ctx.sectionName) {
        setSectionName(ctx.sectionName);
        sectionNameManuallyEdited.current = true;
      }
    };
    window.addEventListener("doh:preset-flood-context", handlePresetContext);
    return () => window.removeEventListener("doh:preset-flood-context", handlePresetContext);
  }, []);
}
