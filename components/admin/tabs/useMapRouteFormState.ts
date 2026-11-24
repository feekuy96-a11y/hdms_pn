"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SystemDataPayload } from "@/db/default-data";
import { clearAdminMapDraft } from "@/components/admin/tabs/map-draft-storage";
import { compressImageToAdaptiveBase64 } from "@/lib/gis-utils";
import type { DetourDirectionModeType } from "@/lib/constants";
import {
  FloodDirectionCode,
  FloodPhotoItem,
  groupFloodRoutesIntoEvents,
} from "@/lib/flood-event-schema";

interface UseMapRouteFormStateParams {
  systemData: SystemDataPayload;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  setDraftCoordinates: (coords: [number, number][]) => void;
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setDraftConflictPoints?: (points: Array<{ coord: [number, number]; label: string }>) => void;
  onDraftPickMarkersChange?: (markers: { lat: number; lon: number; label: string; mode: string }[]) => void;
  draftCoordinates: [number, number][];
  draftWaypoints: [number, number][];
  onToast: (msg: string) => void;
}

/**
 * Manages core form fields, coordinate inputs, combobox dropdown, parent event grouping,
 * detour point photos, and base form reset logic for MapManagementTab.
 */
export function useMapRouteFormState({
  systemData,
  onDraftModeChange,
  setDraftCoordinates,
  setDraftWaypoints,
  setDraftReverseCoordinates,
  setDraftReverseWaypoints,
  setDraftConflictPoints,
  onDraftPickMarkersChange,
  draftCoordinates,
  draftWaypoints,
  onToast,
}: UseMapRouteFormStateParams) {
  // Mode: Flood vs Detour
  const [routeMode, setRouteMode] = useState<"FLOOD" | "DETOUR">("FLOOD");
  useEffect(() => {
    onDraftModeChange?.(routeMode);
  }, [routeMode, onDraftModeChange]);

  const routingRequest = useRef(0);
  const originalRouteCoordinates = useRef<[number, number][]>([]);
  const originalReverseRouteCoordinates = useRef<[number, number][]>([]);
  const [routeEditId, setRouteEditId] = useState<string>("");

  // Common Highway Attributes
  const [routeNo, setRouteNo] = useState("");
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [startArea, setStartArea] = useState<{ subdistrict: string; district: string } | null>(null);
  const [endArea, setEndArea] = useState<{ subdistrict: string; district: string } | null>(null);
  const sectionNameManuallyEdited = useRef(false);
  const [reporterName, setReporterName] = useState<string>("");

  // Highway Search Combobox State
  const [selectedHighwayName, setSelectedHighwayName] = useState("");
  const [isHighwayDropdownOpen, setIsHighwayDropdownOpen] = useState(false);
  const [highwaySearchQuery, setHighwaySearchQuery] = useState("");
  const highwayComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (highwayComboboxRef.current && !highwayComboboxRef.current.contains(event.target as Node)) {
        setIsHighwayDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Detour Specific (Bidirectional & Asymmetric Detour Routing)
  const [detourRefId, setDetourRefId] = useState("");
  const [detourName, setDetourName] = useState("");
  const [detourDesc, setDetourDesc] = useState("");
  const [detourAdviceView, setDetourAdviceView] = useState<"FORWARD" | "REVERSE" | "COMBINED">("COMBINED");
  const [detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd] = useState("");
  const [detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev] = useState("");
  const [detourRoadCondition, setDetourRoadCondition] = useState("");
  const [detourDurationMinFwd, setDetourDurationMinFwd] = useState("");
  const [detourDurationMinRev, setDetourDurationMinRev] = useState("");
  const durationFwdManualRef = useRef(false);
  const durationRevManualRef = useRef(false);
  const editOriginalFloodDirRef = useRef<FloodDirectionCode>("UNKNOWN");
  const [detourStartPhotoUrl, setDetourStartPhotoUrl] = useState("");
  const [detourStartPhotoCaption, setDetourStartPhotoCaption] = useState("");
  const [detourEndPhotoUrl, setDetourEndPhotoUrl] = useState("");
  const [detourEndPhotoCaption, setDetourEndPhotoCaption] = useState("");
  const [forceStraightThrough, setForceStraightThrough] = useState(false);
  const [detourDirectionMode, setDetourDirectionMode] = useState<DetourDirectionModeType>("TWO_WAY");
  const [detourDistanceMeters, setDetourDistanceMeters] = useState<{ forward: number; reverse: number }>({
    forward: 0,
    reverse: 0,
  });
  const [detourDurationSeconds, setDetourDurationSeconds] = useState<{ forward: number; reverse: number }>({
    forward: 0,
    reverse: 0,
  });
  const [closedRoadConflicts, setClosedRoadConflicts] = useState<string[]>([]);
  const [passabilityWarnings, setPassabilityWarnings] = useState<string[]>([]);

  // Coordinates - Start empty without hardcoded mock defaults
  const [startLat, setStartLat] = useState<number | string>("");
  const [startLon, setStartLon] = useState<number | string>("");
  const [endLat, setEndLat] = useState<number | string>("");
  const [endLon, setEndLon] = useState<number | string>("");
  const [startCoordinateText, setStartCoordinateText] = useState("");
  const [endCoordinateText, setEndCoordinateText] = useState("");
  const [revStartLat, setRevStartLat] = useState<number | string>("");
  const [revStartLon, setRevStartLon] = useState<number | string>("");
  const [revEndLat, setRevEndLat] = useState<number | string>("");
  const [revEndLon, setRevEndLon] = useState<number | string>("");
  const [revStartCoordinateText, setRevStartCoordinateText] = useState("");
  const [revEndCoordinateText, setRevEndCoordinateText] = useState("");

  useEffect(() => {
    setStartCoordinateText(startLat !== "" && startLon !== "" ? `${startLat}, ${startLon}` : "");
  }, [startLat, startLon]);
  useEffect(() => {
    setEndCoordinateText(endLat !== "" && endLon !== "" ? `${endLat}, ${endLon}` : "");
  }, [endLat, endLon]);
  useEffect(() => {
    setRevStartCoordinateText(revStartLat !== "" && revStartLon !== "" ? `${revStartLat}, ${revStartLon}` : "");
  }, [revStartLat, revStartLon]);
  useEffect(() => {
    setRevEndCoordinateText(revEndLat !== "" && revEndLon !== "" ? `${revEndLat}, ${revEndLon}` : "");
  }, [revEndLat, revEndLon]);

  // Snapping & Geocoding State
  const [snappingStatusText, setSnappingStatusText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Images & Submitting
  const [fieldImages, setFieldImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [detailedPhotos, setDetailedPhotos] = useState<FloodPhotoItem[]>([]);

  // Parent Event & Multi-Segment Management
  const [parentEventMode, setParentEventMode] = useState<"NEW" | "EXISTING">("NEW");
  const [selectedParentEventId, setSelectedParentEventId] = useState<string>("");
  const [eventCode, setEventCode] = useState<string>("");
  const [eventTitle, setEventTitle] = useState<string>("");
  const [villageOrLandmark, setVillageOrLandmark] = useState<string>("");
  const [isFetchingAddress, setIsFetchingAddress] = useState<boolean>(false);
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [causeAndNote, setCauseAndNote] = useState<string>("");

  const existingParentEvents = useMemo(
    () => groupFloodRoutesIntoEvents(systemData.floodRoutes || []),
    [systemData.floodRoutes]
  );

  const handleDetourPointPhotoUpload = async (
    target: "START" | "END",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl } = await compressImageToAdaptiveBase64(file, 250 * 1024);
      if (target === "START") {
        setDetourStartPhotoUrl(dataUrl);
        onToast("แนบภาพบริเวณทางเข้าจุดเริ่มต้น (A) เรียบร้อย");
      } else {
        setDetourEndPhotoUrl(dataUrl);
        onToast("แนบภาพบริเวณทางเข้าจุดสิ้นสุด (B) เรียบร้อย");
      }
    } catch {
      onToast("ไม่สามารถประมวลผลไฟล์ภาพได้ กรุณาลองใหม่");
    }
  };

  const resetBaseFormState = () => {
    routingRequest.current += 1;
    setDraftCoordinates([]);
    setDraftWaypoints([]);
    setDraftReverseCoordinates?.([]);
    setDraftReverseWaypoints?.([]);
    setDraftConflictPoints?.([]);
    setClosedRoadConflicts([]);
    setPassabilityWarnings([]);
    durationFwdManualRef.current = false;
    durationRevManualRef.current = false;
    editOriginalFloodDirRef.current = "UNKNOWN";
    sectionNameManuallyEdited.current = false;
    setStartArea(null);
    setEndArea(null);
    [
      setSnappingStatusText,
      setStartLat, setStartLon, setEndLat, setEndLon,
      setRevStartLat, setRevStartLon, setRevEndLat, setRevEndLon,
      setKmStart, setKmEnd, setSectionName, setReporterName,
      setDetourName, setDetourDesc, setDetourGoogleMapsUrlFwd, setDetourGoogleMapsUrlRev,
      setDetourRoadCondition, setDetourDurationMinFwd, setDetourDurationMinRev,
      setDetourStartPhotoUrl, setDetourStartPhotoCaption, setDetourEndPhotoUrl, setDetourEndPhotoCaption,
      setSelectedParentEventId, setEventCode, setEventTitle, setVillageOrLandmark, setCauseAndNote,
    ].forEach((reset) => reset(""));
    setDetourDirectionMode("TWO_WAY");
    setDetourDistanceMeters({ forward: 0, reverse: 0 });
    setDetourDurationSeconds({ forward: 0, reverse: 0 });
    setFieldImages([]);
    setDetailedPhotos([]);
    setParentEventMode("NEW");
    setStartedAt(new Date().toISOString().slice(0, 16));
    setSaveAsDraft(false);
    setForceStraightThrough(false);
    clearAdminMapDraft();
    originalRouteCoordinates.current = [];
    onDraftPickMarkersChange?.([]);
  };

  const isFormDirty = Boolean(
    routeNo || sectionName || detourName || detourDesc || startLat || startLon || endLat || endLon ||
    draftCoordinates.length || draftWaypoints.length || fieldImages.length
  );

  return {
    routeMode, setRouteMode,
    routingRequest,
    originalRouteCoordinates,
    originalReverseRouteCoordinates,
    routeEditId, setRouteEditId,
    routeNo, setRouteNo,
    kmStart, setKmStart,
    kmEnd, setKmEnd,
    sectionName, setSectionName,
    startArea, setStartArea,
    endArea, setEndArea,
    sectionNameManuallyEdited,
    reporterName, setReporterName,
    selectedHighwayName, setSelectedHighwayName,
    isHighwayDropdownOpen, setIsHighwayDropdownOpen,
    highwaySearchQuery, setHighwaySearchQuery,
    highwayComboboxRef,
    detourRefId, setDetourRefId,
    detourName, setDetourName,
    detourDesc, setDetourDesc,
    detourAdviceView, setDetourAdviceView,
    detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev,
    detourRoadCondition, setDetourRoadCondition,
    detourDurationMinFwd, setDetourDurationMinFwd,
    detourDurationMinRev, setDetourDurationMinRev,
    durationFwdManualRef,
    durationRevManualRef,
    editOriginalFloodDirRef,
    detourStartPhotoUrl, setDetourStartPhotoUrl,
    detourStartPhotoCaption, setDetourStartPhotoCaption,
    detourEndPhotoUrl, setDetourEndPhotoUrl,
    detourEndPhotoCaption, setDetourEndPhotoCaption,
    forceStraightThrough, setForceStraightThrough,
    detourDirectionMode, setDetourDirectionMode,
    detourDistanceMeters, setDetourDistanceMeters,
    detourDurationSeconds, setDetourDurationSeconds,
    closedRoadConflicts, setClosedRoadConflicts,
    passabilityWarnings, setPassabilityWarnings,
    startLat, setStartLat,
    startLon, setStartLon,
    endLat, setEndLat,
    endLon, setEndLon,
    startCoordinateText, setStartCoordinateText,
    endCoordinateText, setEndCoordinateText,
    revStartLat, setRevStartLat,
    revStartLon, setRevStartLon,
    revEndLat, setRevEndLat,
    revEndLon, setRevEndLon,
    revStartCoordinateText, setRevStartCoordinateText,
    revEndCoordinateText, setRevEndCoordinateText,
    snappingStatusText, setSnappingStatusText,
    isGeocoding, setIsGeocoding,
    fieldImages, setFieldImages,
    isSubmitting, setIsSubmitting,
    saveAsDraft, setSaveAsDraft,
    detailedPhotos, setDetailedPhotos,
    parentEventMode, setParentEventMode,
    selectedParentEventId, setSelectedParentEventId,
    eventCode, setEventCode,
    eventTitle, setEventTitle,
    villageOrLandmark, setVillageOrLandmark,
    isFetchingAddress, setIsFetchingAddress,
    startedAt, setStartedAt,
    causeAndNote, setCauseAndNote,
    existingParentEvents,
    handleDetourPointPhotoUpload,
    resetBaseFormState,
    isFormDirty,
  };
}

interface UseMapMetaAndMarkerSyncParams {
  routeMode: "FLOOD" | "DETOUR";
  roadSide: string;
  detourDirectionMode: DetourDirectionModeType;
  setDraftDirectionMeta?: (meta: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null) => void;
  startLat: number | string;
  startLon: number | string;
  endLat: number | string;
  endLon: number | string;
  revStartLat: number | string;
  revStartLon: number | string;
  revEndLat: number | string;
  revEndLon: number | string;
  supportsTwoWayLineEdit: boolean;
  onDraftPickMarkersChange?: (markers: { lat: number; lon: number; label: string; mode: string }[]) => void;
  sectionNameManuallyEdited: React.MutableRefObject<boolean>;
  startArea: { subdistrict: string; district: string } | null;
  endArea: { subdistrict: string; district: string } | null;
  selectedHighwaySectionName?: string;
  routeNo: string;
  setSectionName: (name: string) => void;
}

/** Synchronizes directional metadata, endpoint pick markers, and auto section name. */
export function useMapMetaAndMarkerSync({
  routeMode,
  roadSide,
  detourDirectionMode,
  setDraftDirectionMeta,
  startLat,
  startLon,
  endLat,
  endLon,
  revStartLat,
  revStartLon,
  revEndLat,
  revEndLon,
  supportsTwoWayLineEdit,
  onDraftPickMarkersChange,
  sectionNameManuallyEdited,
  startArea,
  endArea,
  selectedHighwaySectionName,
  routeNo,
  setSectionName,
}: UseMapMetaAndMarkerSyncParams) {
  useEffect(() => {
    if (routeMode === "FLOOD") {
      const arrowDir = roadSide === "LEFT" ? "FORWARD" : roadSide === "RIGHT" ? "REVERSE" : roadSide === "BOTH" ? "TWO_WAY" : "UNKNOWN";
      setDraftDirectionMeta?.({ arrowDirection: arrowDir, showArrows: roadSide === "LEFT" || roadSide === "RIGHT" });
    } else {
      const arrowDir = detourDirectionMode === "FORWARD_ONLY" ? "FORWARD" : detourDirectionMode === "REVERSE_ONLY" ? "REVERSE" : "TWO_WAY";
      setDraftDirectionMeta?.({ arrowDirection: arrowDir, showArrows: true, directionMode: detourDirectionMode });
    }
  }, [routeMode, roadSide, detourDirectionMode, setDraftDirectionMeta]);

  useEffect(() => {
    const markers: { lat: number; lon: number; label: string; mode: string }[] = [];
    const startLatNumber = Number(startLat);
    const startLonNumber = Number(startLon);
    const endLatNumber = Number(endLat);
    const endLonNumber = Number(endLon);
    if (Number.isFinite(startLatNumber) && Number.isFinite(startLonNumber) && startLatNumber !== 0 && startLonNumber !== 0) {
      markers.push({ lat: startLatNumber, lon: startLonNumber, label: "A", mode: "PICK_START" });
    }
    if (Number.isFinite(endLatNumber) && Number.isFinite(endLonNumber) && endLatNumber !== 0 && endLonNumber !== 0) {
      markers.push({ lat: endLatNumber, lon: endLonNumber, label: "B", mode: "PICK_END" });
    }
    if (supportsTwoWayLineEdit) {
      const rSLat = Number(revStartLat);
      const rSLon = Number(revStartLon);
      const rELat = Number(revEndLat);
      const rELon = Number(revEndLon);
      if (Number.isFinite(rSLat) && Number.isFinite(rSLon) && rSLat !== 0 && rSLon !== 0) {
        markers.push({ lat: rSLat, lon: rSLon, label: "B→", mode: "PICK_REV_START" });
      }
      if (Number.isFinite(rELat) && Number.isFinite(rELon) && rELat !== 0 && rELon !== 0) {
        markers.push({ lat: rELat, lon: rELon, label: "→A", mode: "PICK_REV_END" });
      }
    }
    onDraftPickMarkersChange?.(markers);
  }, [startLat, startLon, endLat, endLon, revStartLat, revStartLon, revEndLat, revEndLon, supportsTwoWayLineEdit, onDraftPickMarkersChange]);

  useEffect(() => {
    if (sectionNameManuallyEdited.current || !startArea || !endArea) return;
    if (selectedHighwaySectionName) return; // อย่าเขียนทับชื่อตอนควบคุมทางการของแขวงทางหลวง
    const highway = routeNo ? `ทล.${routeNo} ` : "";
    setSectionName(`${highway}(ต.${startArea.subdistrict} อ.${startArea.district} → ต.${endArea.subdistrict} อ.${endArea.district})`);
  }, [routeNo, startArea, endArea, selectedHighwaySectionName, sectionNameManuallyEdited, setSectionName]);
}
