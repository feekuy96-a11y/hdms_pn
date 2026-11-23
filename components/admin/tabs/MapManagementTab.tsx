"use client";

import React, { useState, useEffect, useRef } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { clearAdminMapDraft } from "@/components/admin/tabs/map-draft-storage";
import {
  MapTabHeader,
  DraftRecoveryBanner,
  RouteImportAndDraftOptions,
  MapFormSections,
} from "@/components/admin/tabs/MapFormSections";
import { useDualRoadSnapping } from "@/components/admin/tabs/useDualRoadSnapping";
import { useMapRouteSubmit } from "@/components/admin/tabs/useMapRouteSubmit";
import { useMapRouteDraft } from "@/components/admin/tabs/useMapRouteDraft";
import { useMapRouteMediaAndImport } from "@/components/admin/tabs/useMapRouteMediaAndImport";
import { useMapRouteHydration } from "@/components/admin/tabs/useMapRouteHydration";
import { useMapCoordinatePicker } from "@/components/admin/tabs/useMapCoordinatePicker";
import { useMapFreeGeometryEdit } from "@/components/admin/tabs/useMapFreeGeometryEdit";
import { useMapRouteActions } from "@/components/admin/tabs/useMapRouteActions";
import {
  parseCoordinatePair,
  buildDetourRoutingParams,
  findBestHighwayGroupForSelection,
  sliceBranchByKmRange,
  buildAffectedPartSummary,
  buildDetourMetaPayload,
} from "@/components/admin/tabs/map-management-helpers";
export { buildDetourRoutingParams } from "@/components/admin/tabs/map-management-helpers";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
} from "@/lib/detour-presentation";
import { deleteExternalMediaAction, upsertRouteAction, snapRouteAction, syncReportingRowAction, uploadExternalMediaAction } from "@/app/actions/doh-actions";
import {
  fetchOsrmWithFailover,
  computeGoogleRouteHybrid,
  extractDirectionalAdvice,
  reverseGeocodeTambonAmphoe,
  compressImageToBase64,
  compressImageToAdaptiveBase64,
  slicePolylineByKmRange,
  detectClosedRoadConflicts,
  detectPassabilityFloodWarnings,
  analyzeCarriagewaySeparation,
  haversineDistanceKm,
  localArea,
} from "@/lib/gis-utils";
import {
  SAFETY_MEASURES,
  ROAD_SIDE_OPTIONS,
  AFFECTED_LANES_OPTIONS,
  AFFECTED_SHOULDER_OPTIONS,
  DETOUR_DIRECTION_MODES,
  RoadSideType,
  AffectedShoulderType,
  DetourDirectionModeType,
} from "@/lib/constants";
import {
  FloodDirectionCode,
  AffectedRoadPart,
  AFFECTED_ROAD_PART_LABELS,
  DetailedTrafficStatus,
  FloodPhotoItem,
  FloodSegmentDirectionMeta,
  parseFloodDirectionMeta,
  groupFloodRoutesIntoEvents,
  generateNextEventCode,
  resolveEffectiveRoadSide,
  mapTrafficStatusToDetail,
  mapDetailToDbStatus,
  detectOverlappingFloodSegments,
  parseKmPostMeters,
} from "@/lib/flood-event-schema";
import { deriveTrafficStatusFromWaterLevel } from "@/lib/traffic-presentation";
import {
  getAvailableHighwayRoutes,
  cleanHighwaySectionName,
} from "@/lib/highway-schema";
import type { VertexEditEvent } from "@/lib/line-edit";


interface MapManagementTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal?: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onNavigateToIncidents?: () => void;

  // Map interactions
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
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
  draftConflictPoints?: Array<{ coord: [number, number]; label: string }>;
  setDraftConflictPoints?: (points: Array<{ coord: [number, number]; label: string }>) => void;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  onDraftPickMarkersChange?: (markers: { lat: number; lon: number; label: string; mode: string }[]) => void;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (active: boolean) => void;
  onVertexEditTargetChange?: (target: "FORWARD" | "REVERSE") => void;

  // Editing state passed from parent
  editingRoute?: { type: "FLOOD" | "DETOUR"; id: string } | null;
  onClearEditingRoute?: () => void;
}

export function MapManagementTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  onNavigateToIncidents,
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
  draftConflictPoints = [],
  setDraftConflictPoints,
  onDraftModeChange,
  onDraftPickMarkersChange,
  vertexEvent,
  onVertexEditChange,
  onVertexEditTargetChange,
  editingRoute,
  onClearEditingRoute,
}: MapManagementTabProps) {
  // Mode: Flood vs Detour
  const [routeMode, setRouteMode] = useState<"FLOOD" | "DETOUR">("FLOOD");
  useEffect(() => { onDraftModeChange?.(routeMode); }, [routeMode, onDraftModeChange]);
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

  // Item 3: Directional & Lane-Specific Flood Attributes
  const [roadSide, setRoadSide] = useState<RoadSideType>("UNKNOWN");
  const [affectedLanes, setAffectedLanes] = useState<string>(AFFECTED_LANES_OPTIONS[0]);
  const [affectedShoulder, setAffectedShoulder] = useState<AffectedShoulderType>("NONE");
  const [reporterName, setReporterName] = useState<string>("");
  const [waterLevelKnown, setWaterLevelKnown] = useState<boolean>(true);
  const [useCarriagewaySnapping, setUseCarriagewaySnapping] = useState<boolean>(false);

  // Highway Search Combobox State
  const [selectedHighwayName, setSelectedHighwayName] = useState("");
  const [isHighwayDropdownOpen, setIsHighwayDropdownOpen] = useState(false);
  const [highwaySearchQuery, setHighwaySearchQuery] = useState("");
  const highwayComboboxRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (highwayComboboxRef.current && !highwayComboboxRef.current.contains(event.target as Node)) {
        setIsHighwayDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Detour Specific (Item 4: Bidirectional & Asymmetric Detour Routing)
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

  // Flood Severity & Traffic Status + Dual Carriageway Support
  const [routeWaterLevel, setRouteWaterLevel] = useState<number | string>("");
  const [routeStatus, setRouteStatus] = useState<"WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE">("WARNING");
  const [selectedMeasure, setSelectedMeasure] = useState<string>(SAFETY_MEASURES[0]);
  const [directionCode, setDirectionCode] = useState<FloodDirectionCode>("UNKNOWN");
  const [affectedParts, setAffectedParts] = useState<AffectedRoadPart[]>(["UNSPECIFIED"]);
  const [reverseRouteWaterLevel, setReverseRouteWaterLevel] = useState<number | string>("");
  const [reverseRouteStatus, setReverseRouteStatus] = useState<"WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE">("WARNING");
  const [reverseWaterLevelKnown, setReverseWaterLevelKnown] = useState<boolean>(true);
  const [reverseAffectedParts, setReverseAffectedParts] = useState<AffectedRoadPart[]>(["ALL_LANES"]);

  // Dynamic Highway Routes strictly from highwayLayers database
  const availableHighways = React.useMemo(
    () => getAvailableHighwayRoutes(systemData),
    [systemData]
  );

  const selectedHighwayOption = React.useMemo(() => {
    if (!routeNo && !selectedHighwayName) return undefined;
    if (selectedHighwayName) {
      const byName = availableHighways.find((h) => h.name === selectedHighwayName);
      if (byName) return byName;
    }
    const cleanNo = String(routeNo || "").replace(/^ทล\.?/i, "").trim();
    const candidates = availableHighways.filter((h) => h.no === cleanNo);
    if (candidates.length === 0) return undefined;
    const cleanSec = cleanHighwaySectionName(sectionName);
    if (cleanSec) {
      const bySec = candidates.find((h) => cleanHighwaySectionName(h.sectionName) === cleanSec);
      if (bySec) return bySec;
    }
    const kmSMeters = parseKmPostMeters(kmStart);
    const kmEMeters = parseKmPostMeters(kmEnd);
    if (kmSMeters !== null && kmEMeters !== null) {
      const mid = (kmSMeters + kmEMeters) / 2;
      const containing = candidates.find((h) => {
        const hs = parseKmPostMeters(h.kmStart);
        const he = parseKmPostMeters(h.kmEnd);
        return hs !== null && he !== null && mid >= Math.min(hs, he) && mid <= Math.max(hs, he);
      });
      if (containing) return containing;
    }
    return candidates[0];
  }, [availableHighways, routeNo, selectedHighwayName, sectionName, kmStart, kmEnd]);

  const selectedHighwayLaneCount = selectedHighwayOption?.laneCount ?? 0;
  const isSelectedHighwayDivided = Boolean(
    selectedHighwayOption && (selectedHighwayOption.laneCount >= 4 || selectedHighwayOption.hasDualCarriageway)
  );
  const isDividedBothFlood =
    routeMode === "FLOOD" && roadSide === "BOTH" && directionCode === "BOTH" && isSelectedHighwayDivided;
  const supportsTwoWayLineEdit =
    (routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY") || isDividedBothFlood;

  const [detourDistanceMeters, setDetourDistanceMeters] = useState<{ forward: number; reverse: number }>({ forward: 0, reverse: 0 });
  const [detourDurationSeconds, setDetourDurationSeconds] = useState<{ forward: number; reverse: number }>({ forward: 0, reverse: 0 });
  const [closedRoadConflicts, setClosedRoadConflicts] = useState<string[]>([]);
  const [passabilityWarnings, setPassabilityWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (routeMode === "FLOOD") {
      const arrowDir = roadSide === "LEFT" ? "FORWARD" : roadSide === "RIGHT" ? "REVERSE" : roadSide === "BOTH" ? "TWO_WAY" : "UNKNOWN";
      setDraftDirectionMeta?.({ arrowDirection: arrowDir, showArrows: roadSide === "LEFT" || roadSide === "RIGHT" });
    } else {
      const arrowDir = detourDirectionMode === "FORWARD_ONLY" ? "FORWARD" : detourDirectionMode === "REVERSE_ONLY" ? "REVERSE" : "TWO_WAY";
      setDraftDirectionMeta?.({ arrowDirection: arrowDir, showArrows: true, directionMode: detourDirectionMode });
    }
  }, [routeMode, roadSide, detourDirectionMode, setDraftDirectionMeta]);

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

  // Snapping & Geocoding State
  const [snappingStatusText, setSnappingStatusText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Freehand Vertex Editing & Reverse Endpoints Hook
  const {
    freeEditEnabled,
    setFreeEditEnabled,
    setFreeEditTarget,
    activeEditTarget,
    freeVertexTool,
    setFreeVertexTool,
    freePastRef: freePast,
    freeFutureRef: freeFuture,
    updateFreeGeometry,
    undoFreeGeometry,
    resetFreeGeometryHistory,
    handleSeedReverseEndpoints,
    handleClearReverseEndpoints,
    handleSelectEditDirection,
  } = useMapFreeGeometryEdit({
    routeMode,
    editingRouteId: editingRoute?.id,
    supportsTwoWayLineEdit,
    detourDirectionMode,
    directionCode,
    vertexEvent,
    onVertexEditChange,
    onVertexEditTargetChange,
    draftCoordinates,
    setDraftCoordinates,
    draftReverseCoordinates,
    setDraftReverseCoordinates,
    startLat, setStartLat, startLon, setStartLon,
    endLat, setEndLat, endLon, setEndLon,
    revStartLat, setRevStartLat, revStartLon, setRevStartLon,
    revEndLat, setRevEndLat, revEndLon, setRevEndLon,
    routingRequestRef: routingRequest,
    originalReverseRouteCoordinatesRef: originalReverseRouteCoordinates,
    setAdminPickMode,
    setSnappingStatusText,
    onToast,
  });

  // Images & Submitting
  const [fieldImages, setFieldImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  // Phase 2: Parent Event & Multi-Segment Management
  const [parentEventMode, setParentEventMode] = useState<"NEW" | "EXISTING">("NEW");
  const [selectedParentEventId, setSelectedParentEventId] = useState<string>("");
  const [eventCode, setEventCode] = useState<string>("");
  const [eventTitle, setEventTitle] = useState<string>("");
  const [villageOrLandmark, setVillageOrLandmark] = useState<string>("");
  const [isFetchingAddress, setIsFetchingAddress] = useState<boolean>(false);
  const [startedAt, setStartedAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [causeAndNote, setCauseAndNote] = useState<string>("");

  const { recoverableDraft, setRecoverableDraft, handleRestoreSavedDraft } = useMapRouteDraft({
    routeEditId,
    editingRouteId: editingRoute?.id,
    routeMode, setRouteMode,
    routeNo, setRouteNo,
    kmStart, setKmStart,
    kmEnd, setKmEnd,
    sectionName, setSectionName,
    reporterName, setReporterName,
    routeWaterLevel, setRouteWaterLevel,
    routeStatus, setRouteStatus,
    causeAndNote, setCauseAndNote,
    villageOrLandmark, setVillageOrLandmark,
    detourRefId, setDetourRefId,
    detourName, setDetourName,
    detourDesc, setDetourDesc,
    detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev,
    detourRoadCondition, setDetourRoadCondition,
    detourDurationMinFwd, setDetourDurationMinFwd,
    detourDurationMinRev, setDetourDurationMinRev,
    detourDirectionMode, setDetourDirectionMode,
    saveAsDraft, setSaveAsDraft,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftReverseWaypoints, setDraftReverseWaypoints,
    onToast,
  });
  const [detailedPhotos, setDetailedPhotos] = useState<FloodPhotoItem[]>([]);

  // Group existing flood routes into parent events
  const existingParentEvents = React.useMemo(() => {
    return groupFloodRoutesIntoEvents(systemData.floodRoutes || []);
  }, [systemData.floodRoutes]);

  const availableOfficeNames = React.useMemo(() => {
    const names = new Set<string>();
    (systemData.offices || []).forEach((o) => {
      if (o.is_active && o.name) names.add(o.name.trim());
    });
    availableHighways.forEach((h) => {
      if (h.responsibleOffice) names.add(h.responsibleOffice);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "th"));
  }, [systemData.offices, availableHighways]);

  // Hydrate existing record on edit + listen to preset flood context
  useMapRouteHydration({
    editingRoute,
    systemData,
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
    setDetourEndPhotoUrl,
    setDetourEndPhotoCaption,
  });

  // Trigger Road Snapping
  const { triggerDualRoadSnapping } = useDualRoadSnapping({
    systemData,
    routeMode,
    detourDirectionMode,
    forceStraightThrough,
    useCarriagewaySnapping,
    isDividedBothFlood,
    roadSide,
    freeEditEnabled,
    setFreeEditEnabled,
    revStartLat,
    revStartLon,
    revEndLat,
    revEndLon,
    draftCoordinates,
    setDraftCoordinates,
    setDraftReverseCoordinates,
    draftWaypoints,
    draftReverseWaypoints,
    routingRequest,
    durationFwdManualRef,
    durationRevManualRef,
    detourDurationSeconds,
    setDetourDistanceMeters,
    setDetourDurationSeconds,
    setDetourDurationMinFwd,
    setDetourDurationMinRev,
    setClosedRoadConflicts,
    setPassabilityWarnings,
    setDraftConflictPoints,
    setSnappingStatusText,
    onToast,
  });

  // Coordinate Picker & Auto Geocode
  const { handleAutoGeocode } = useMapCoordinatePicker({
    pickedCoordinate,
    startLat, startLon, endLat, endLon,
    revStartLat, revStartLon, revEndLat, revEndLon,
    setStartLat, setStartLon, setEndLat, setEndLon,
    setRevStartLat, setRevStartLon, setRevEndLat, setRevEndLon,
    setStartArea, setEndArea, setIsGeocoding,
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
  });

  useEffect(() => {
    if (sectionNameManuallyEdited.current || !startArea || !endArea) return;
    if (selectedHighwayOption?.sectionName) return; // อย่าเขียนทับชื่อตอนควบคุมทางการของแขวงทางหลวง
    const highway = routeNo ? `ทล.${routeNo} ` : "";
    setSectionName(`${highway}(ต.${startArea.subdistrict} อ.${startArea.district} → ต.${endArea.subdistrict} อ.${endArea.district})`);
  }, [routeNo, startArea, endArea, selectedHighwayOption]);

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

  // Waypoint, Endpoint Swap, Restore, KM Slicing & Address Lookup Hook
  const {
    handleSwapEndpoints,
    handleAddMidpointWaypoint,
    handleUndoWaypoint,
    handleRemoveWaypoint,
    handleRestoreOriginalRoute,
    handleFetchLocationFromCoords,
    handleSlicePolylineFromKm,
  } = useMapRouteActions({
    highwayLayers: systemData.highwayLayers,
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
    startLat, setStartLat, startLon, setStartLon,
    endLat, setEndLat, endLon, setEndLon,
    revStartLat, setRevStartLat, revStartLon, setRevStartLon,
    revEndLat, setRevEndLat, revEndLon, setRevEndLon,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftReverseWaypoints, setDraftReverseWaypoints,
    detourStartPhotoUrl, setDetourStartPhotoUrl,
    detourStartPhotoCaption, setDetourStartPhotoCaption,
    detourEndPhotoUrl, setDetourEndPhotoUrl,
    detourEndPhotoCaption, setDetourEndPhotoCaption,
    routingRequestRef: routingRequest,
    originalRouteCoordinatesRef: originalRouteCoordinates,
    originalReverseRouteCoordinatesRef: originalReverseRouteCoordinates,
    triggerDualRoadSnapping,
    setSnappingStatusText,
    onToast,
  });

  // Clear Route
  const handleClearRoute = () => {
    resetFreeGeometryHistory(true);
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
    setSnappingStatusText("");
    setStartLat("");
    setStartLon("");
    setEndLat("");
    setEndLon("");
    setRevStartLat("");
    setRevStartLon("");
    setRevEndLat("");
    setRevEndLon("");
    setKmStart("");
    setKmEnd("");
    setSectionName("");
    setStartArea(null);
    setEndArea(null);
    sectionNameManuallyEdited.current = false;
    setRouteWaterLevel("");
    setRoadSide("UNKNOWN");
    setAffectedLanes(AFFECTED_LANES_OPTIONS[0]);
    setAffectedShoulder("NONE");
    setReporterName("");
    setWaterLevelKnown(true);
    setUseCarriagewaySnapping(false);
    setDetourName("");
    setDetourDesc("");
    setDetourDirectionMode("TWO_WAY");
    setDetourGoogleMapsUrlFwd("");
    setDetourGoogleMapsUrlRev("");
    setDetourRoadCondition("");
    setDetourDurationMinFwd("");
    setDetourDurationMinRev("");
    setDetourStartPhotoUrl("");
    setDetourStartPhotoCaption("");
    setDetourEndPhotoUrl("");
    setDetourEndPhotoCaption("");
    setDetourDistanceMeters({ forward: 0, reverse: 0 });
    setDetourDurationSeconds({ forward: 0, reverse: 0 });
    setFieldImages([]);
    setDetailedPhotos([]);
    setParentEventMode("NEW");
    setSelectedParentEventId("");
    setEventCode("");
    setEventTitle("");
    setVillageOrLandmark("");
    setStartedAt(new Date().toISOString().slice(0, 16));
    setCauseAndNote("");
    setDirectionCode("UNKNOWN");
    setAffectedParts(["UNSPECIFIED"]);
    setRouteStatus("WARNING");
    setFreeEditTarget("FORWARD");
    setReverseRouteWaterLevel("");
    setReverseRouteStatus("WARNING");
    setReverseWaterLevelKnown(true);
    setReverseAffectedParts(["ALL_LANES"]);
    setSaveAsDraft(false);
    setForceStraightThrough(false);
    clearAdminMapDraft();
    setRecoverableDraft(null);
    originalRouteCoordinates.current = [];
    onDraftPickMarkersChange?.([]);
    onToast("ล้างเส้นทางร่างและแบบฟอร์มแล้ว");
  };

  // Water-level & affected road parts -> auto-derive suggested traffic status (editable manually afterward)
  const handleWaterLevelInputChange = (rawValue: string) => {
    const nextVal: number | string = rawValue === "" ? "" : Number(rawValue);
    setRouteWaterLevel(nextVal);
    if (nextVal !== "" && waterLevelKnown) {
      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, affectedParts);
      if (suggested) setRouteStatus(suggested);
    }
  };

  const handleReverseWaterLevelInputChange = (rawValue: string) => {
    const nextVal: number | string = rawValue === "" ? "" : Number(rawValue);
    setReverseRouteWaterLevel(nextVal);
    if (nextVal !== "" && reverseWaterLevelKnown) {
      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, reverseAffectedParts);
      if (suggested) setReverseRouteStatus(suggested);
    }
  };

  const toggleAffectedPartWithAutoStatus = (
    part: AffectedRoadPart,
    currentParts: AffectedRoadPart[],
    setParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>,
    waterLevelValue: number | string,
    isKnown: boolean,
    setStatus: React.Dispatch<React.SetStateAction<"WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE">>
  ) => {
    const isSelected = currentParts.includes(part);
    let nextParts: AffectedRoadPart[];
    if (part === "ALL_LANES") {
      nextParts = isSelected ? ["UNSPECIFIED"] : ["ALL_LANES"];
    } else {
      const filtered = currentParts.filter((p) => p !== "ALL_LANES" && p !== "UNSPECIFIED");
      if (isSelected) {
        const remaining = filtered.filter((p) => p !== part);
        nextParts = remaining.length ? remaining : ["UNSPECIFIED"];
      } else {
        nextParts = [...filtered, part];
      }
    }
    setParts(nextParts);
    if (isKnown && waterLevelValue !== "") {
      const suggested = deriveTrafficStatusFromWaterLevel(waterLevelValue, nextParts);
      if (suggested) setStatus(suggested);
    }
  };

  // Seed or slice reverse carriageway geometry when "ท่วมทั้งสองฝั่งจราจร" is chosen on a >= 4-lane highway
  const ensureReverseFloodGeometry = (forwardSource: [number, number][]) => {
    if (!isSelectedHighwayDivided) return;
    if (routeNo && kmStart && kmEnd) {
      const bestGroup = findBestHighwayGroupForSelection(systemData.highwayLayers, routeNo, sectionName, kmStart, kmEnd);
      const fwdBranch = bestGroup?.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) || bestGroup?.primaryBranch;
      const revBranch = bestGroup?.branches.find((b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2);
      if (bestGroup && revBranch) {
        const slicedRev = sliceBranchByKmRange(revBranch, fwdBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, true);
        if (slicedRev.length >= 2) {
          setDraftReverseCoordinates?.(slicedRev);
          originalReverseRouteCoordinates.current = slicedRev.map((p) => [...p] as [number, number]);
          return;
        }
      }
    }
    if (draftReverseCoordinates.length < 2 && forwardSource.length >= 2) {
      const seeded = [...forwardSource].reverse().map((p) => [...p] as [number, number]);
      setDraftReverseCoordinates?.(seeded);
      originalReverseRouteCoordinates.current = seeded.map((p) => [...p] as [number, number]);
    }
  };

  // Adaptive Image Upload, Detour Advice Generator & Route File Import
  const {
    handleImageUpload,
    handleGenerateDetourAdviceClick,
    handleRouteFileImport,
  } = useMapRouteMediaAndImport({
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
  });

  const requestClearRoute = () => {
    const isDirty = Boolean(
      routeNo || sectionName || detourName || detourDesc || startLat || startLon || endLat || endLon ||
      draftCoordinates.length || draftWaypoints.length || fieldImages.length
    );
    if (isDirty && showConfirmModal) {
      showConfirmModal(
        "ล้างข้อมูลทั้งหมด?",
        "ข้อมูลที่ยังไม่ได้บันทึก จุด A/B จุดดัด เส้นพรีวิว และรูปภาพในแบบฟอร์มนี้จะถูกล้าง โดยไม่กระทบข้อมูลที่บันทึกแล้ว",
        handleClearRoute
      );
      return;
    }
    handleClearRoute();
  };

  // Submit Flood or Detour Route
  const { handleSubmitRoute } = useMapRouteSubmit({
    systemData, onDataRefresh, onToast, showSuccessModal, showErrorModal,
    onNavigateToIncidents, onClearEditingRoute, editingRoute,
    routeMode, routeEditId, setRouteEditId, saveAsDraft, setIsSubmitting,
    startLat, startLon, endLat, endLon, revStartLat, revStartLon, revEndLat, revEndLon,
    draftCoordinates, draftReverseCoordinates, draftReverseWaypoints,
    closedRoadConflicts, detourName, detourRefId, detourDesc, detourDirectionMode,
    detourRoadCondition, detourDurationMinFwd, detourDurationMinRev,
    detourDistanceMeters, detourGoogleMapsUrlFwd, detourGoogleMapsUrlRev,
    detourStartPhotoUrl, detourStartPhotoCaption, detourEndPhotoUrl, detourEndPhotoCaption,
    routeNo, sectionName, kmStart, kmEnd, directionCode, roadSide, isDividedBothFlood,
    affectedParts, reverseAffectedParts, routeWaterLevel, reverseRouteWaterLevel,
    waterLevelKnown, reverseWaterLevelKnown, routeStatus, reverseRouteStatus,
    startedAt, selectedMeasure, reporterName, causeAndNote,
    startArea, endArea, villageOrLandmark, detailedPhotos, fieldImages, setFieldImages,
    selectedParentEventId, eventCode, eventTitle, existingParentEvents,
    affectedLanes, affectedShoulder, startCoordinateText, endCoordinateText,
    setClosedRoadConflicts, availableHighways, useCarriagewaySnapping,
    editOriginalFloodDirRef, handleClearRoute,
  });

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Switcher: Flood vs Detour Header */}
      <MapTabHeader
        routeMode={routeMode}
        onSelectRouteMode={(mode) => {
          if (routeMode !== mode) {
            handleClearRoute();
            setRouteMode(mode);
          }
        }}
      />

      {/* Phase 2.4: Draft Auto-Save Recovery Banner */}
      <DraftRecoveryBanner
        recoverableDraft={recoverableDraft}
        routeEditId={routeEditId}
        onRestore={handleRestoreSavedDraft}
        onClear={() => {
          clearAdminMapDraft();
          setRecoverableDraft(null);
          onToast("ลบร่างข้อมูลที่ค้างไว้แล้ว");
        }}
      />

      {/* Save options: import a file, or keep the record hidden from citizens until it is reviewed */}
      <RouteImportAndDraftOptions
        saveAsDraft={saveAsDraft}
        onSaveAsDraftChange={setSaveAsDraft}
        onImportFile={handleRouteFileImport}
      />

      {/* Main Map Form Container */}
      <MapFormSections
        routeMode={routeMode}
        highwayProps={{
          parentEventMode, setParentEventMode,
          selectedParentEventId, setSelectedParentEventId,
          eventCode, setEventCode, setEventTitle, existingParentEvents,
          routeNo, setRouteNo, selectedHighwayName, setSelectedHighwayName,
          sectionName, setSectionName, sectionNameManuallyEditedRef: sectionNameManuallyEdited,
          villageOrLandmark, setVillageOrLandmark, setReporterName,
          handleFetchLocationFromCoords, isFetchingAddress,
          highwayComboboxRef, isHighwayDropdownOpen, setIsHighwayDropdownOpen,
          availableHighways, highwaySearchQuery, setHighwaySearchQuery,
          kmStart, setKmStart, kmEnd, setKmEnd, directionCode, setDirectionCode,
          roadSide, setRoadSide, isSelectedHighwayDivided, draftCoordinates,
          ensureReverseFloodGeometry, setDraftReverseCoordinates, setDraftReverseWaypoints,
          setFreeEditTarget, routeEditId, handleSlicePolylineFromKm,
          detourRefId, setDetourRefId, floodRoutes: systemData.floodRoutes,
          detourName, setDetourName, detourDirectionMode, setDetourDirectionMode,
          isGeocoding, startLon, startLat, endLon, endLat, handleAutoGeocode,
        }}
        geometryProps={{
          onToast, adminPickMode, setAdminPickMode,
          startLat, setStartLat, startLon, setStartLon, endLat, setEndLat, endLon, setEndLon,
          startCoordinateText, setStartCoordinateText, endCoordinateText, setEndCoordinateText,
          revStartLat, setRevStartLat, revStartLon, setRevStartLon,
          revEndLat, setRevEndLat, revEndLon, setRevEndLon,
          revStartCoordinateText, setRevStartCoordinateText,
          revEndCoordinateText, setRevEndCoordinateText,
          onSeedReverseEndpoints: handleSeedReverseEndpoints,
          onClearReverseEndpoints: handleClearReverseEndpoints,
          detourStartPhotoUrl, setDetourStartPhotoUrl,
          detourStartPhotoCaption, setDetourStartPhotoCaption,
          detourEndPhotoUrl, setDetourEndPhotoUrl,
          detourEndPhotoCaption, setDetourEndPhotoCaption,
          handleDetourPointPhotoUpload, snappingStatusText, setSnappingStatusText,
          freeEditEnabled, setFreeEditEnabled, freeVertexTool, setFreeVertexTool,
          supportsTwoWayLineEdit, activeEditTarget, handleSelectEditDirection,
          draftCoordinates, setDraftCoordinates,
          draftReverseCoordinates, setDraftReverseCoordinates,
          draftWaypoints, draftReverseWaypoints, setDraftReverseWaypoints,
          routingRequestRef: routingRequest, freePastRef: freePast, freeFutureRef: freeFuture,
          undoFreeGeometry, forceStraightThrough, setForceStraightThrough,
          triggerDualRoadSnapping, handleSwapEndpoints, handleAddMidpointWaypoint,
          handleUndoWaypoint, handleRemoveWaypoint,
          originalRouteCoordsRef: originalRouteCoordinates,
          originalReverseRouteCoordsRef: originalReverseRouteCoordinates,
          handleRestoreOriginalRoute, requestClearRoute,
          closedRoadConflicts, passabilityWarnings, detourDirectionMode, detourDistanceMeters,
        }}
        detourProps={{
          detourDesc, setDetourDesc, detourAdviceView, setDetourAdviceView,
          detourRoadCondition, setDetourRoadCondition, detourDurationMinFwd,
          setDetourDurationMinFwd: (val) => {
            durationFwdManualRef.current = val.trim() !== "";
            setDetourDurationMinFwd(val);
          },
          detourDurationMinRev,
          setDetourDurationMinRev: (val) => {
            durationRevManualRef.current = val.trim() !== "";
            setDetourDurationMinRev(val);
          },
          detourDirectionMode,
          detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
          detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev,
          draftCoordinates, draftReverseCoordinates,
          onGenerateAdvice: handleGenerateDetourAdviceClick,
        }}
        floodProps={{
          selectedHighwayOption, selectedHighwayLaneCount,
          isSelectedHighwayDivided, isDividedBothFlood,
          directionCode, setDirectionCode, roadSide, setRoadSide, draftCoordinates,
          setDraftReverseCoordinates, setDraftReverseWaypoints,
          setFreeEditTarget, ensureReverseFloodGeometry,
          affectedParts, setAffectedParts, reverseAffectedParts, setReverseAffectedParts,
          routeWaterLevel, setRouteWaterLevel, reverseRouteWaterLevel, setReverseRouteWaterLevel,
          waterLevelKnown, setWaterLevelKnown, reverseWaterLevelKnown, setReverseWaterLevelKnown,
          routeStatus, setRouteStatus, reverseRouteStatus, setReverseRouteStatus,
          handleWaterLevelInputChange, handleReverseWaterLevelInputChange,
          toggleAffectedPartWithAutoStatus,
          useCarriagewaySnapping, setUseCarriagewaySnapping,
          startedAt, setStartedAt, selectedMeasure, setSelectedMeasure,
          reporterName, setReporterName, availableOfficeNames,
          causeAndNote, setCauseAndNote, detailedPhotos, setDetailedPhotos,
          setFieldImages, handleImageUpload,
        }}
        submitBarProps={{
          saveAsDraft, isSubmitting, onSubmit: handleSubmitRoute, routeEditId,
          onCancelEdit: () => {
            setRouteEditId("");
            handleClearRoute();
            if (onClearEditingRoute) onClearEditingRoute();
          },
        }}
      />
    </div>
  );
}

