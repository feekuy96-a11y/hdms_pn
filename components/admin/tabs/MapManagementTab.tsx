"use client";

import React, { useState, useEffect, useRef } from "react";
import { StickyActionBar } from "@/components/admin/ui";
import { SystemDataPayload } from "@/db/default-data";
import { DetourAdviceSection } from "@/components/admin/tabs/DetourAdviceSection";
import { HighwayIdentificationSection } from "@/components/admin/tabs/HighwayIdentificationSection";
import { RouteGeometryEditorSection } from "@/components/admin/tabs/RouteGeometryEditorSection";
import { FloodSituationSection } from "@/components/admin/tabs/FloodSituationSection";
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
import {
  MapPinned,
  Save,
  FileUp,
} from "lucide-react";
import { deleteExternalMediaAction, upsertRouteAction, snapRouteAction, syncReportingRowAction, uploadExternalMediaAction } from "@/app/actions/doh-actions";
import {
  fetchOsrmWithFailover,
  computeGoogleRouteHybrid,
  generateAutoDetourAdvice,
  extractDirectionalAdvice,
  reverseGeocodeTambonAmphoe,
  getDetailedPattaniAddress,
  compressImageToBase64,
  compressImageToAdaptiveBase64,
  slicePolylineByKmRange,
  detectClosedRoadConflicts,
  detectPassabilityFloodWarnings,
  analyzeCarriagewaySeparation,
  haversineDistanceKm,
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
import { readRouteFile } from "@/lib/route-import";
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
import { insertVertex, moveVertex, removeVertex, nearestInsertIndex } from "@/lib/line-edit";
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

  // The highway, flood and detour editors share the same draggable Leaflet vertex handles
  // and pure GeoJSON editing helpers. Freehand changes do not invoke road snapping.
  const [freeEditEnabled, setFreeEditEnabled] = useState(false);
  const [freeEditTarget, setFreeEditTarget] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const activeEditTarget: "FORWARD" | "REVERSE" = supportsTwoWayLineEdit ? freeEditTarget : "FORWARD";
  const [freeVertexTool, setFreeVertexTool] = useState<"move" | "delete">("move");
  const [, setFreeHistoryVersion] = useState(0);
  const freePast = useRef<[number, number][][]>([]);
  const freeFuture = useRef<[number, number][][]>([]);
  const handledFreeVertexSeq = useRef(0);
  const onVertexEditChangeRef = useRef(onVertexEditChange);
  onVertexEditChangeRef.current = onVertexEditChange;
  const onVertexEditTargetChangeRef = useRef(onVertexEditTargetChange);
  onVertexEditTargetChangeRef.current = onVertexEditTargetChange;

  useEffect(() => {
    onVertexEditChangeRef.current?.(freeEditEnabled);
    return () => { if (freeEditEnabled) onVertexEditChangeRef.current?.(false); };
  }, [freeEditEnabled]);
  useEffect(() => {
    if (!supportsTwoWayLineEdit && freeEditTarget !== "FORWARD") {
      setFreeEditTarget("FORWARD");
    }
  }, [supportsTwoWayLineEdit, freeEditTarget]);
  useEffect(() => { onVertexEditTargetChangeRef.current?.(activeEditTarget); }, [activeEditTarget]);
  useEffect(() => {
    setFreeEditEnabled(false);
    setFreeEditTarget("FORWARD");
    freePast.current = [];
    freeFuture.current = [];
    setFreeHistoryVersion((v) => v + 1);
  }, [routeMode, editingRoute?.id]);

  const freeGeometry = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
  const updateFreeGeometry = (next: [number, number][], recordHistory = true) => {
    const current = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
    if (next.length < 2 || next === current || next.every((point, index) => point[0] === current[index]?.[0] && point[1] === current[index]?.[1])) return;
    routingRequest.current += 1; // prevent a stale OSRM response from overwriting manual edits
    if (recordHistory) {
      freePast.current.push(current.map((p) => [...p] as [number, number]));
      if (freePast.current.length > 30) freePast.current.shift();
      freeFuture.current = [];
    }
    if (activeEditTarget === "REVERSE") {
      setDraftReverseCoordinates?.(next);
      const revStart = next[0];
      const revEnd = next[next.length - 1];
      if (revStart && revEnd) {
        setRevStartLon(revStart[0]); setRevStartLat(revStart[1]);
        setRevEndLon(revEnd[0]); setRevEndLat(revEnd[1]);
      }
    } else {
      setDraftCoordinates(next);
      // Keep the form's A/B coordinates aligned if an endpoint handle is dragged.
      const reversed = routeMode === "DETOUR" ? detourDirectionMode === "REVERSE_ONLY" : directionCode === "B_TO_A";
      const pointA = reversed ? next[next.length - 1] : next[0];
      const pointB = reversed ? next[0] : next[next.length - 1];
      if (pointA && pointB) {
        setStartLon(pointA[0]); setStartLat(pointA[1]);
        setEndLon(pointB[0]); setEndLat(pointB[1]);
      }
    }
    setSnappingStatusText("แก้แนวเส้นอิสระแล้ว — ระบบจะบันทึกตามแนวที่เห็น ไม่คำนวณถนนใหม่อัตโนมัติ");
    setFreeHistoryVersion((v) => v + 1);
  };

  const undoFreeGeometry = (redo = false) => {
    const source = redo ? freeFuture.current : freePast.current;
    const destination = redo ? freePast.current : freeFuture.current;
    const previous = source.pop();
    if (!previous) return;
    destination.push(freeGeometry.map((p) => [...p] as [number, number]));
    updateFreeGeometry(previous, false);
  };

  useEffect(() => {
    if (!freeEditEnabled || !vertexEvent || vertexEvent.seq === handledFreeVertexSeq.current) return;
    handledFreeVertexSeq.current = vertexEvent.seq;
    const coords = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
    if (coords.length < 2 || vertexEvent.index < 0 || vertexEvent.index >= coords.length) {
      if (vertexEvent.type !== "insert" || vertexEvent.index < 0 || vertexEvent.index > coords.length) return;
    }
    if ((vertexEvent.type === "move" || vertexEvent.type === "insert") && vertexEvent.coord) {
      const valid = vertexEvent.coord.every(Number.isFinite) && Math.abs(vertexEvent.coord[0]) <= 180 && Math.abs(vertexEvent.coord[1]) <= 90;
      if (!valid) return;
      const next = vertexEvent.type === "move"
        ? moveVertex(coords, vertexEvent.index, vertexEvent.coord)
        : insertVertex(coords, vertexEvent.index, vertexEvent.coord);
      updateFreeGeometry(next);
    } else if (vertexEvent.type === "contextmenu" || (vertexEvent.type === "click" && freeVertexTool === "delete")) {
      if (coords.length <= 2) {
        onToast("เส้นทางต้องมีจุดอย่างน้อย ๒ จุด");
        return;
      }
      updateFreeGeometry(removeVertex(coords, vertexEvent.index));
    }
  }, [vertexEvent, freeEditEnabled, activeEditTarget, freeVertexTool, draftCoordinates, draftReverseCoordinates]);

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

  const handleSeedReverseEndpoints = () => {
    if (draftReverseCoordinates.length >= 2) {
      const first = draftReverseCoordinates[0];
      const last = draftReverseCoordinates[draftReverseCoordinates.length - 1];
      setRevStartLat(first[1]); setRevStartLon(first[0]);
      setRevEndLat(last[1]); setRevEndLon(last[0]);
      onToast("แยกหมุดขากลับ (B → A) จากแนวเส้นปัจจุบันแล้ว ลากหมุดบนแผนที่เพื่อปรับตำแหน่งได้");
      return;
    }
    const eLat = Number(endLat); const eLon = Number(endLon);
    const sLat = Number(startLat); const sLon = Number(startLon);
    if (!eLat || !eLon || !sLat || !sLon) {
      onToast("กรุณากำหนดจุด A และ B ก่อนแยกหมุดขากลับ (B → A)");
      return;
    }
    setRevStartLat(eLat); setRevStartLon(eLon);
    setRevEndLat(sLat); setRevEndLon(sLon);
    onToast("วางหมุดขากลับ B→ และ →A บนแผนที่แล้ว สามารถลากแยกตำแหน่งได้ทันที");
  };

  const handleClearReverseEndpoints = () => {
    setRevStartLat(""); setRevStartLon("");
    setRevEndLat(""); setRevEndLon("");
    onToast("กลับไปใช้จุด B → A ร่วมกับขาไปเรียบร้อย");
  };

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

      let coords: [number, number][] = [];
      if (Array.isArray(flood.coordinates_json)) coords = flood.coordinates_json as [number, number][];
      else if (typeof flood.coordinates_json === "string") coords = JSON.parse(flood.coordinates_json);
      originalRouteCoordinates.current = coords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftCoordinates(coords);

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
          } else if (coords.length >= 2) {
            revCoords = [...coords].reverse().map((p) => [...p] as [number, number]);
          }
        }
        setReverseRouteWaterLevel(existingRevSibling ? existingRevSibling.water_level_cm : flood.water_level_cm);
        setReverseRouteStatus(existingRevSibling ? existingRevSibling.traffic_status : flood.traffic_status);
        setReverseWaterLevelKnown(existingRevSibling ? existingRevSibling.direction_meta?.water_level_known !== false : flood.direction_meta?.water_level_known !== false);
        const siblingMeta = existingRevSibling ? parseFloodDirectionMeta(existingRevSibling.direction_meta, existingRevSibling) : meta;
        setReverseAffectedParts(siblingMeta.affectedParts && siblingMeta.affectedParts.length ? siblingMeta.affectedParts : ["ALL_LANES"]);
      } else {
        setReverseRouteWaterLevel("");
        setReverseRouteStatus("WARNING");
        setReverseWaterLevelKnown(true);
        setReverseAffectedParts(["ALL_LANES"]);
      }
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
      setAffectedParts(meta.affectedParts && meta.affectedParts.length ? meta.affectedParts : ["UNSPECIFIED"]);
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

      let coords: [number, number][] = [];
      if (Array.isArray(detour.coordinates_json)) coords = detour.coordinates_json as [number, number][];
      else if (typeof detour.coordinates_json === "string") coords = JSON.parse(detour.coordinates_json);
      originalRouteCoordinates.current = coords.map((coordinate) => [...coordinate] as [number, number]);
      setDraftCoordinates(coords);

      let revCoords: [number, number][] = [];
      if (Array.isArray(detour.reverse_coordinates_json)) revCoords = detour.reverse_coordinates_json as [number, number][];
      else if (typeof detour.reverse_coordinates_json === "string") {
        try { revCoords = JSON.parse(detour.reverse_coordinates_json); } catch { revCoords = []; }
      }
      originalReverseRouteCoordinates.current = (
        revCoords.length >= 2 ? revCoords : [...coords].reverse()
      ).map((coordinate) => [...coordinate] as [number, number]);
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
    const handlePresetContext = (e: any) => {
      const ctx = e.detail;
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

  // Listen to pickedCoordinate from map
  useEffect(() => {
    if (!pickedCoordinate) return;

    if (pickedCoordinate.mode === "PICK_START") {
      setStartLat(pickedCoordinate.lat);
      setStartLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดเริ่มต้น (A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "START");
      if (endLat && endLon) { setFreeEditEnabled(false); setDraftCoordinates([]); setDraftReverseCoordinates?.([]); void triggerDualRoadSnapping(pickedCoordinate.lat, pickedCoordinate.lon, endLat, endLon); }
    } else if (pickedCoordinate.mode === "PICK_END") {
      setEndLat(pickedCoordinate.lat);
      setEndLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดสิ้นสุด (B): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "END");
      if (startLat && startLon) { setFreeEditEnabled(false); setDraftCoordinates([]); setDraftReverseCoordinates?.([]); void triggerDualRoadSnapping(startLat, startLon, pickedCoordinate.lat, pickedCoordinate.lon); }
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
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, [...draftWaypoints, newWp], draftReverseWaypoints);
      }
    } else if (pickedCoordinate.mode === "ADD_REVERSE_WAYPOINT") {
      const newRevWp: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      const nextRevWps = [...draftReverseWaypoints, newRevWp];
      setDraftReverseWaypoints?.(nextRevWps);
      setAdminPickMode(null);
      onToast("เพิ่มจุดดัดเส้นทางขากลับ (B → A) เรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, nextRevWps);
      }
    }
  }, [pickedCoordinate]);

  // Trigger Road Snapping
  const triggerDualRoadSnapping = async (
    sLat: number | string,
    sLon: number | string,
    eLat: number | string,
    eLon: number | string,
    waypoints: [number, number][] = draftWaypoints,
    reverseWaypoints: [number, number][] = draftReverseWaypoints,
    revOverrides?: {
      revSLat?: number | string;
      revSLon?: number | string;
      revELat?: number | string;
      revELon?: number | string;
      reverseOnly?: boolean;
    }
  ) => {
    const requestId = ++routingRequest.current;
    if (freeEditEnabled) setFreeEditEnabled(false);
    const numSLat = Number(sLat);
    const numSLon = Number(sLon);
    const numELat = Number(eLat);
    const numELon = Number(eLon);
    const effRevSLat = Number(revOverrides?.revSLat ?? revStartLat) || numELat;
    const effRevSLon = Number(revOverrides?.revSLon ?? revStartLon) || numELon;
    const effRevELat = Number(revOverrides?.revELat ?? revEndLat) || numSLat;
    const effRevELon = Number(revOverrides?.revELon ?? revEndLon) || numSLon;

    if (!numSLat || !numSLon || !numELat || !numELon || isNaN(numSLat) || isNaN(numELat)) {
      onToast("กรุณาระบุพิกัด A และ B ให้ครบถ้วนก่อนคำนวณเส้นเกาะถนน");
      return;
    }

    setSnappingStatusText("กำลังคำนวณเส้นเกาะถนนจริง (Dual-Source Snapping)...");
    try {
      if (routeMode === "DETOUR") {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[effRevSLon, effRevSLat], ...reverseWaypoints, [effRevELon, effRevELat]];
        if (forceStraightThrough && waypoints.length === 0) {
          setDraftCoordinates([[numSLon, numSLat], [numELon, numELat]]);
          setSnappingStatusText("กรุณาเพิ่มจุดดัดบนสามแยก/สี่แยกอย่างน้อย 1 จุด แล้วคำนวณอีกครั้ง");
          return;
        }

        // Pick a route from alternatives that avoids confirmed CLOSED flood routes
        const pickSafeRoute = (routingRes: any) => {
          const routes = Array.isArray(routingRes?.data?.routes) ? routingRes.data.routes : [];
          if (routes.length === 0) return { coords: [] as [number, number][], distance: 0, duration: 0, conflicts: [] as ReturnType<typeof detectClosedRoadConflicts> };
          for (const candidate of routes) {
            const cCoords = candidate?.geometry?.coordinates;
            if (!Array.isArray(cCoords) || cCoords.length < 2) continue;
            const cConflicts = detectClosedRoadConflicts(cCoords, systemData.floodRoutes || []);
            if (cConflicts.length === 0) {
              return { coords: cCoords as [number, number][], distance: Number(candidate.distance) || 0, duration: Number(candidate.duration) || 0, conflicts: [] };
            }
          }
          const primary = routes[0];
          const pCoords = (primary?.geometry?.coordinates || []) as [number, number][];
          return {
            coords: pCoords,
            distance: Number(primary?.distance) || 0,
            duration: Number(primary?.duration) || 0,
            conflicts: detectClosedRoadConflicts(pCoords, systemData.floodRoutes || []),
          };
        };

        const resolveDetourDirection = async (points: [number, number][]) => {
          const googleRes = await computeGoogleRouteHybrid(points, "TRAFFIC_UNAWARE");
          if (googleRes && googleRes.coords.length >= 2) {
            const gConflicts = detectClosedRoadConflicts(googleRes.coords, systemData.floodRoutes || []);
            if (gConflicts.length === 0 || forceStraightThrough) {
              return { coords: googleRes.coords, distance: googleRes.distanceMeters, duration: googleRes.durationSeconds, conflicts: gConflicts };
            }
            const osrmAlt = pickSafeRoute(
              await fetchOsrmWithFailover(
                points.map((point) => point.join(",")).join(";"),
                buildDetourRoutingParams(points, forceStraightThrough),
              )
            );
            if (osrmAlt.coords.length >= 2 && osrmAlt.conflicts.length === 0) {
              return osrmAlt;
            }
            return { coords: googleRes.coords, distance: googleRes.distanceMeters, duration: googleRes.durationSeconds, conflicts: gConflicts };
          }
          return pickSafeRoute(
            await fetchOsrmWithFailover(
              points.map((point) => point.join(",")).join(";"),
              buildDetourRoutingParams(points, forceStraightThrough),
            )
          );
        };

        const emptyPicked = { coords: [] as [number, number][], distance: 0, duration: 0, conflicts: [] as ReturnType<typeof detectClosedRoadConflicts> };
        const preserveForward = Boolean(revOverrides?.reverseOnly && draftCoordinates.length >= 2);
        const [pickedAB, pickedBA] = await Promise.all([
          !preserveForward && detourDirectionMode !== "REVERSE_ONLY" ? resolveDetourDirection(pointsAB) : Promise.resolve(emptyPicked),
          detourDirectionMode !== "FORWARD_ONLY" ? resolveDetourDirection(pointsBA) : Promise.resolve(emptyPicked),
        ]);
        if (requestId !== routingRequest.current) return;

        const forwardCoords = preserveForward
          ? draftCoordinates
          : detourDirectionMode === "REVERSE_ONLY"
            ? pickedBA.coords
            : pickedAB.coords;
        const reverseCoords = detourDirectionMode === "TWO_WAY" ? pickedBA.coords : [];

        if (forwardCoords.length < 2) {
          setDraftCoordinates([]);
          setDraftReverseCoordinates?.([]);
          setSnappingStatusText("ไม่สามารถคำนวณทางเลี่ยงตามถนนได้ กรุณาเพิ่มจุดดัดหรือลองใหม่");
          return;
        }

        if (!preserveForward) {
          setDraftCoordinates(forwardCoords);
        }
        setDraftReverseCoordinates?.(reverseCoords);
        setDetourDistanceMeters((prev) => ({
          forward: preserveForward ? prev.forward : detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.distance,
          reverse: detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.distance,
        }));
        const nextFwdDurS = preserveForward ? detourDurationSeconds.forward : detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.duration;
        const nextRevDurS = detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.duration;
        setDetourDurationSeconds({
          forward: nextFwdDurS,
          reverse: nextRevDurS,
        });
        if (!durationFwdManualRef.current && nextFwdDurS > 0) {
          setDetourDurationMinFwd(String(Math.max(1, Math.round(nextFwdDurS / 60))));
        }
        if (!durationRevManualRef.current && nextRevDurS > 0) {
          setDetourDurationMinRev(String(Math.max(1, Math.round(nextRevDurS / 60))));
        }

        const fwdConflicts = preserveForward
          ? detectClosedRoadConflicts(forwardCoords, systemData.floodRoutes || [])
          : pickedAB.conflicts;
        const allConflicts = [...fwdConflicts, ...pickedBA.conflicts];
        const uniqueConflictMsgs = Array.from(
          new Set(allConflicts.map((c) => `ทล.${c.routeNo} (${c.sectionName})`))
        );
        setClosedRoadConflicts(uniqueConflictMsgs);

        const fwdPassWarnings = detectPassabilityFloodWarnings(forwardCoords, systemData.floodRoutes || [], "FORWARD");
        const revPassWarnings = detourDirectionMode === "TWO_WAY" && pickedBA.coords.length >= 2
          ? detectPassabilityFloodWarnings(pickedBA.coords, systemData.floodRoutes || [], "REVERSE")
          : [];
        const uniquePassMsgs = Array.from(
          new Set(
            [...fwdPassWarnings, ...revPassWarnings].map(
              (w) => `ทล.${w.routeNo} กม.${w.kmStart}–${w.kmEnd} (${w.trafficStatus === "ONE_LANE" ? "ผ่านได้ ๑ ช่องทาง" : "รถเล็กผ่านไม่ได้"})`
            )
          )
        );
        setPassabilityWarnings(uniquePassMsgs);
        setDraftConflictPoints?.(
          allConflicts.map((c) => ({
            coord: c.conflictPoint,
            label: `ทับซ้อนจุดปิดการจราจร: ทล.${c.routeNo} ${c.sectionName}`,
          }))
        );

        if (uniqueConflictMsgs.length > 0) {
          setSnappingStatusText(
            `⚠️ พบเส้นทางเลี่ยงตัดผ่านจุดที่ปิดการจราจร (${uniqueConflictMsgs.join(", ")}) — กรุณาเพิ่มจุดดัดเพื่ออ้อมจุดปิดจราจร`
          );
          onToast(`คำเตือน: เส้นทางตัดผ่านจุดปิดการจราจร (${uniqueConflictMsgs.join(", ")})`);
        } else {
          const straightLabel = forceStraightThrough ? "คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ" : "คำนวณทางเลี่ยงตามถนนสำเร็จ";
          setSnappingStatusText(
            detourDirectionMode === "TWO_WAY"
              ? `✓ ${straightLabel}: A→B (${forwardCoords.length} จุด) และ B→A (${pickedBA.coords.length} จุด) — ปลอดจุดปิดจราจร`
              : `✓ ${straightLabel} (${forwardCoords.length} จุด) — ปลอดจุดปิดจราจร`
          );
        }
        return;
      }

      // FLOOD mode: Snap single or dual carriageways (A->B and B->A)
      // Prefer real DOH PostGIS highway geometry (snapRouteAction) first so flood lines never loop around distant U-turns;
      // fall back to Google/OSRM only if PostGIS fails, with a U-turn loop guard.
      const snapFloodDirected = async (directedPoints: [number, number][]): Promise<[number, number][] | null> => {
        const segments = await Promise.all(
          directedPoints.slice(1).map((point, index) => snapRouteAction(directedPoints[index], point).catch(() => null))
        );
        if (requestId !== routingRequest.current) return null;
        if (segments.every((segment) => Array.isArray(segment) && segment.length >= 2)) {
          return segments.flatMap((segment, index) => (index === 0 ? segment! : segment!.slice(1)));
        }

        if (useCarriagewaySnapping || isDividedBothFlood) {
          const directKm = haversineDistanceKm(directedPoints[0], directedPoints[directedPoints.length - 1]);
          const acceptNonUTurn = (coords: [number, number][]) => {
            const polyKm = calculatePolylineRoadDistanceKm(coords);
            if (directKm > 0.05 && polyKm > Math.max(0.8, directKm * 2.5)) {
              onToast("⚠️ พบแนวเส้นอ้อมจุดกลับรถยาวผิดปกติ — ระบบขอใช้จุดพิกัดตรงแทนเพื่อกันเส้นเลยจุดท่วม");
              return false;
            }
            return true;
          };
          const googleCarriageway = await computeGoogleRouteHybrid(directedPoints, "TRAFFIC_UNAWARE");
          if (requestId !== routingRequest.current) return null;
          if (googleCarriageway && googleCarriageway.coords.length >= 2 && acceptNonUTurn(googleCarriageway.coords)) {
            return googleCarriageway.coords;
          }
          const osrmRes = await fetchOsrmWithFailover(
            directedPoints.map((p) => p.join(",")).join(";"),
            "overview=full&geometries=geojson"
          );
          if (requestId !== routingRequest.current) return null;
          const osrmCoords = osrmRes?.data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
          if (Array.isArray(osrmCoords) && osrmCoords.length >= 2 && acceptNonUTurn(osrmCoords)) {
            return osrmCoords;
          }
        }
        return null;
      };

      if (isDividedBothFlood) {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[effRevSLon, effRevSLat], ...reverseWaypoints, [effRevELon, effRevELat]];
        const preserveForward = Boolean(revOverrides?.reverseOnly && draftCoordinates.length >= 2);
        const [fwdSnapped, revSnapped] = await Promise.all([
          preserveForward ? Promise.resolve(draftCoordinates) : snapFloodDirected(pointsAB),
          snapFloodDirected(pointsBA),
        ]);
        if (requestId !== routingRequest.current) return;
        const resolvedFwd = fwdSnapped && fwdSnapped.length >= 2 ? fwdSnapped : pointsAB;
        const resolvedRev = revSnapped && revSnapped.length >= 2 ? revSnapped : [...resolvedFwd].reverse();
        if (!preserveForward) {
          setDraftCoordinates(resolvedFwd);
        }
        setDraftReverseCoordinates?.(resolvedRev);
        setSnappingStatusText(
          `✓ คำนวณเส้นน้ำท่วม ๒ ฝั่งแยกกัน: ขาไป A→B (${resolvedFwd.length} จุด) และ ขากลับ B→A (${resolvedRev.length} จุด)`
        );
        onToast(`คำนวณแนวเส้นน้ำท่วม ๒ ฝั่งแยกกันสำเร็จ (A→B ${resolvedFwd.length} จุด, B→A ${resolvedRev.length} จุด)`);
        return;
      }

      if (useCarriagewaySnapping && (roadSide === "LEFT" || roadSide === "RIGHT")) {
        const directedPoints: [number, number][] =
          roadSide === "RIGHT"
            ? [[numELon, numELat], ...[...waypoints].reverse(), [numSLon, numSLat]]
            : [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const snappedCoords = await snapFloodDirected(directedPoints);
        if (requestId !== routingRequest.current) return;
        if (Array.isArray(snappedCoords) && snappedCoords.length >= 2) {
          setDraftCoordinates(snappedCoords);
          setSnappingStatusText(
            `✓ คำนวณเส้นน้ำท่วมแยกตามคันทางจริง (${roadSide === "LEFT" ? "ฝั่งซ้าย ขาไป A→B" : "ฝั่งขวา ขากลับ B→A"}, ${snappedCoords.length} จุด)`
          );
          onToast(`เกาะแนวคันทาง ${roadSide === "LEFT" ? "ฝั่งซ้าย" : "ฝั่งขวา"} สำเร็จ (${snappedCoords.length} จุด)`);
          return;
        }
      }

      const points: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
      const segments = await Promise.all(points.slice(1).map((point, index) => snapRouteAction(points[index], point).catch(() => null)));
      if (requestId !== routingRequest.current) return;
      if (segments.some((segment) => !segment || segment.length < 2)) {
        setDraftCoordinates([]);
        setSnappingStatusText("ไม่พบแนวทางหลวงที่เชื่อมจุดที่เลือก กรุณาเลือกตำแหน่งบนเลเยอร์ทางหลวงอีกครั้ง");
        return;
      }
      const snapped = segments.flatMap((segment, index) => index === 0 ? segment! : segment!.slice(1));
      if (snapped && snapped.length > 0) {
        setDraftCoordinates(snapped);
        setSnappingStatusText(`✓ คำนวณเส้นทางเกาะโครงข่ายถนนสำเร็จ (${snapped.length} จุด)`);
        onToast(`สร้างแนวเส้นทางเกาะถนนสำเร็จ: ${snapped.length} จุด`);
      } else {
        const fallback: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        setDraftCoordinates(fallback);
        setSnappingStatusText("ไม่สามารถเชื่อมต่อโครงข่ายทางหลวงได้ จึงใช้เส้นตรงระหว่างจุด");
      }
    } catch {
      if (requestId !== routingRequest.current) return;
      if (routeMode === "DETOUR") {
        setDraftCoordinates([]);
        setSnappingStatusText("ไม่สามารถคำนวณทางเลี่ยงตามถนนได้ กรุณาลองใหม่");
        return;
      }
      setDraftCoordinates([]);
      setSnappingStatusText("ไม่สามารถเกาะแนวทางหลวงได้ กรุณาตรวจตำแหน่งแล้วลองใหม่");
    }
  };

  // Auto Geocode
  const handleAutoGeocode = async (lon: number, lat: number, endpoint: "START" | "END") => {
    setIsGeocoding(true);
    try {
      const location = await reverseGeocodeTambonAmphoe(lon, lat);
      if (location) {
        const area = { subdistrict: location.subdistrict, district: location.district };
        if (endpoint === "START") setStartArea(area);
        else setEndArea(area);
        onToast(`ระบุพื้นที่อัตโนมัติ: ต.${location.subdistrict} อ.${location.district}`);
      }
    } catch {
      onToast("ไม่สามารถดึงข้อมูลตำบล/อำเภออัตโนมัติได้");
    } finally {
      setIsGeocoding(false);
    }
  };

  useEffect(() => {
    if (sectionNameManuallyEdited.current || !startArea || !endArea) return;
    const highway = routeNo ? `ทล.${routeNo} ` : "";
    setSectionName(`${highway}(ต.${startArea.subdistrict} อ.${startArea.district} → ต.${endArea.subdistrict} อ.${endArea.district})`);
  }, [routeNo, startArea, endArea]);

  const handleSelectEditDirection = (nextTarget: "FORWARD" | "REVERSE") => {
    if (nextTarget === "REVERSE" && draftReverseCoordinates.length < 2) {
      const rsLat = Number(revStartLat); const rsLon = Number(revStartLon);
      const reLat = Number(revEndLat); const reLon = Number(revEndLon);
      if (rsLat && rsLon && reLat && reLon) {
        const seededRev: [number, number][] = [[rsLon, rsLat], [reLon, reLat]];
        setDraftReverseCoordinates?.(seededRev);
        if (originalReverseRouteCoordinates.current.length < 2) {
          originalReverseRouteCoordinates.current = seededRev.map((p) => [...p] as [number, number]);
        }
      } else if (draftCoordinates.length >= 2) {
        const seeded = [...draftCoordinates].reverse().map((p) => [...p] as [number, number]);
        setDraftReverseCoordinates?.(seeded);
        if (originalReverseRouteCoordinates.current.length < 2) {
          originalReverseRouteCoordinates.current = seeded.map((p) => [...p] as [number, number]);
        }
      }
    }
    setFreeEditTarget(nextTarget);
    setAdminPickMode(null);
    freePast.current = [];
    freeFuture.current = [];
    setFreeHistoryVersion((v) => v + 1);
  };

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
    const hasEndpoints = [...start, ...end].every(Number.isFinite) && start.every((value) => value !== 0) && end.every((value) => value !== 0);
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
    const midPoint: [number, number] = draftCoordinates.length >= 2
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
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated, draftReverseWaypoints);
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
      const source =
        originalReverseRouteCoordinates.current.length >= 2
          ? originalReverseRouteCoordinates.current
          : [...originalRouteCoordinates.current].reverse();
      if (source.length < 2) {
        onToast("รายการนี้ไม่มีแนวเส้นขากลับเดิมสำหรับคืนค่า");
        return;
      }
      routingRequest.current += 1;
      setDraftReverseWaypoints?.([]);
      setDraftReverseCoordinates?.(source.map((coordinate) => [...coordinate] as [number, number]));
      setSnappingStatusText("คืนค่าแนวเส้นขากลับ (B → A) เดิมแล้ว กดบันทึกเพื่อยืนยัน");
      onToast("คืนค่าแนวเส้นขากลับ (B → A) เดิมเรียบร้อยแล้ว");
      return;
    }
    if (originalRouteCoordinates.current.length < 2) {
      onToast("รายการนี้ไม่มีแนวเส้นเดิมสำหรับคืนค่า");
      return;
    }
    routingRequest.current += 1;
    setDraftWaypoints([]);
    setDraftCoordinates(originalRouteCoordinates.current.map((coordinate) => [...coordinate] as [number, number]));
    setSnappingStatusText("คืนค่าแนวเส้นเดิมแล้ว กดบันทึกเพื่อยืนยัน");
    onToast("คืนค่าแนวเส้นเดิมเรียบร้อยแล้ว");
  };

  // Clear Route
  const handleClearRoute = () => {
    setFreeEditEnabled(false);
    freePast.current = [];
    freeFuture.current = [];
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
    originalRouteCoordinates.current = [];
    onDraftPickMarkersChange?.([]);
    onToast("ล้างเส้นทางร่างและแบบฟอร์มแล้ว");
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
      const displayLoc = [cleanTag, addr.road].filter(Boolean).join(" ") || (addr.tambon ? `ต.${addr.tambon} อ.${addr.amphoe}` : "");
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

  // Slice Polyline from Phase 1 GIS Highway Layers by KM Range & Direction
  const handleSlicePolylineFromKm = () => {
    if (!routeNo || !kmStart || !kmEnd) {
      onToast("กรุณาระบุหมายเลขทางหลวง, กม.เริ่มต้น และ กม.สิ้นสุด ก่อนคำนวณแนวเส้น");
      return;
    }

    const cleanRoute = String(routeNo).replace(/^ทล\.?/i, "").trim();
    const bestGroup = findBestHighwayGroupForSelection(systemData.highwayLayers, routeNo, sectionName, kmStart, kmEnd);

    let slicedForward: [number, number][] = [];
    let slicedReverse: [number, number][] = [];

    if (bestGroup) {
      const forwardBranch =
        bestGroup.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) ||
        bestGroup.primaryBranch;
      const reverseBranch = bestGroup.branches.find((b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2);

      if (roadSide === "BOTH" && isSelectedHighwayDivided) {
        if (forwardBranch && forwardBranch.coordinates.length >= 2) {
          slicedForward = sliceBranchByKmRange(forwardBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, false);
        }
        if (reverseBranch && reverseBranch.coordinates.length >= 2) {
          slicedReverse = sliceBranchByKmRange(reverseBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, true);
        } else if (slicedForward.length >= 2) {
          slicedReverse = [...slicedForward].reverse().map((p) => [...p] as [number, number]);
        }
      } else if (directionCode === "B_TO_A") {
        const chosenBranch = reverseBranch || bestGroup.primaryBranch;
        if (chosenBranch && chosenBranch.coordinates.length >= 2) {
          slicedForward = sliceBranchByKmRange(chosenBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, true);
        }
      } else {
        const chosenBranch = forwardBranch || bestGroup.primaryBranch;
        if (chosenBranch && chosenBranch.coordinates.length >= 2) {
          slicedForward = sliceBranchByKmRange(chosenBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, false);
        }
      }
    }

    // Fallback: search raw features if no grouped branch matched (prefer feature whose KM span covers target range)
    if (slicedForward.length < 2) {
      let targetCoords: [number, number][] = [];
      let secKmStart: any = null;
      let secKmEnd: any = null;
      const reqStartM = parseKmPostMeters(kmStart);
      const reqEndM = parseKmPostMeters(kmEnd);
      const reqMidM = reqStartM !== null && reqEndM !== null ? (reqStartM + reqEndM) / 2 : null;
      for (const layer of systemData.highwayLayers || []) {
        if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
          for (const f of layer.geojson_data.features) {
            const props = f.properties || {};
            const fRoute = String(props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "").replace(/^ทล\.?/i, "").trim();
            if (fRoute === cleanRoute && f.geometry?.coordinates?.length >= 2) {
              const fStartM = parseKmPostMeters(props.km_start);
              const fEndM = parseKmPostMeters(props.km_end);
              const coversRange = reqMidM !== null && fStartM !== null && fEndM !== null &&
                reqMidM >= Math.min(fStartM, fEndM) && reqMidM <= Math.max(fStartM, fEndM);
              if (targetCoords.length < 2 || coversRange) {
                targetCoords = f.geometry.coordinates;
                secKmStart = props.km_start || kmStart;
                secKmEnd = props.km_end || kmEnd;
                if (coversRange) break;
              }
            }
          }
        }
      }
      if (targetCoords.length >= 2) {
        slicedForward = slicePolylineByKmRange(targetCoords, secKmStart, secKmEnd, kmStart, kmEnd, directionCode === "B_TO_A");
        if (roadSide === "BOTH" && isSelectedHighwayDivided && slicedForward.length >= 2) {
          slicedReverse = [...slicedForward].reverse().map((p) => [...p] as [number, number]);
        }
      }
    }

    if (slicedForward.length >= 2) {
      setDraftCoordinates(slicedForward);
      originalRouteCoordinates.current = slicedForward.map((p) => [...p] as [number, number]);
      setDraftReverseCoordinates?.(slicedReverse);
      originalReverseRouteCoordinates.current = slicedReverse.map((p) => [...p] as [number, number]);
      const [firstLon, firstLat] = slicedForward[0];
      const [lastLon, lastLat] = slicedForward[slicedForward.length - 1];
      setStartLat(firstLat);
      setStartLon(firstLon);
      setEndLat(lastLat);
      setEndLon(lastLon);
      if (!villageOrLandmark.trim()) {
        getDetailedPattaniAddress(firstLon, firstLat).then((addr) => {
          if (addr && addr.tag) {
            const cleanTag = addr.tag.replace(/^\(|\)$/g, "").trim();
            const displayLoc = [cleanTag, addr.road].filter(Boolean).join(" ") || (addr.tambon ? `ต.${addr.tambon} อ.${addr.amphoe}` : "");
            if (displayLoc.trim()) setVillageOrLandmark(displayLoc.trim());
          }
        }).catch(() => {});
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

  // Submit Flood or Detour Route
  const handleSubmitRoute = async () => {
    // Never silently turn a missing/legacy direction into bidirectional traffic.
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

        const res = await upsertRouteAction({
          id: existingReverseSiblingId,
          recordType: "FLOOD",
          routeNo: chosenRouteNo,
          kmStart,
          kmEnd,
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

      const res = await upsertRouteAction({
        id: routeEditId || undefined,
        recordType: routeMode,
        routeNo: chosenRouteNo,
        kmStart,
        kmEnd,
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
              resolvedDetourEndPhotoUrl,
              detourEndPhotoCaption,
              fwdPolyKm: calculatePolylineRoadDistanceKm(coords),
              revPolyKm: calculatePolylineRoadDistanceKm(
                detourDirectionMode === "TWO_WAY" && resolvedDetourReverseCoords.length >= 2 ? resolvedDetourReverseCoords : coords
              ),
            })
          : undefined,
      });

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
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-amber-400" /> จัดการแผนที่และรายงานเหตุการณ์
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            กำหนดจุดน้ำท่วม จุดเริ่มต้น-สิ้นสุด และดัดแนวเส้นทางให้เกาะถนนจริง
          </p>
        </div>
        {/* Switcher: Flood vs Detour */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => { if (routeMode !== "FLOOD") { handleClearRoute(); setRouteMode("FLOOD"); } }}
            className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition ${routeMode === "FLOOD" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
              }`}
          >
            เส้นน้ำท่วม
          </button>
          <button
            type="button"
            onClick={() => { if (routeMode !== "DETOUR") { handleClearRoute(); setRouteMode("DETOUR"); } }}
            className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition ${routeMode === "DETOUR" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
          >
            ทางเลี่ยง
          </button>
        </div>
      </div>

      {/* Save options: import a file, or keep the record hidden from citizens until it is reviewed */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-sky-700 bg-sky-950/30 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-950/50">
          <FileUp className="h-4 w-4" /> นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง
          <input type="file" className="sr-only" accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx" onChange={handleRouteFileImport} />
        </label>

        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200">
          <input type="checkbox" checked={saveAsDraft} onChange={(event) => setSaveAsDraft(event.target.checked)} className="h-4 w-4 accent-amber-500" />
          บันทึกเป็นฉบับร่าง (ยังไม่แสดงบนแผนที่ประชาชน)
        </label>
      </div>

      {/* Main Map Form Container */}
      <div className="space-y-5">
        {/* 1. Highway Identification */}
        <HighwayIdentificationSection
          routeMode={routeMode}
          parentEventMode={parentEventMode}
          setParentEventMode={setParentEventMode}
          selectedParentEventId={selectedParentEventId}
          setSelectedParentEventId={setSelectedParentEventId}
          eventCode={eventCode}
          setEventCode={setEventCode}
          setEventTitle={setEventTitle}
          existingParentEvents={existingParentEvents}
          routeNo={routeNo}
          setRouteNo={setRouteNo}
          selectedHighwayName={selectedHighwayName}
          setSelectedHighwayName={setSelectedHighwayName}
          sectionName={sectionName}
          setSectionName={setSectionName}
          sectionNameManuallyEditedRef={sectionNameManuallyEdited}
          villageOrLandmark={villageOrLandmark}
          setVillageOrLandmark={setVillageOrLandmark}
          setReporterName={setReporterName}
          handleFetchLocationFromCoords={handleFetchLocationFromCoords}
          isFetchingAddress={isFetchingAddress}
          highwayComboboxRef={highwayComboboxRef}
          isHighwayDropdownOpen={isHighwayDropdownOpen}
          setIsHighwayDropdownOpen={setIsHighwayDropdownOpen}
          availableHighways={availableHighways}
          highwaySearchQuery={highwaySearchQuery}
          setHighwaySearchQuery={setHighwaySearchQuery}
          kmStart={kmStart}
          setKmStart={setKmStart}
          kmEnd={kmEnd}
          setKmEnd={setKmEnd}
          directionCode={directionCode}
          setDirectionCode={setDirectionCode}
          roadSide={roadSide}
          setRoadSide={setRoadSide}
          isSelectedHighwayDivided={isSelectedHighwayDivided}
          draftCoordinates={draftCoordinates}
          ensureReverseFloodGeometry={ensureReverseFloodGeometry}
          setDraftReverseCoordinates={setDraftReverseCoordinates}
          setDraftReverseWaypoints={setDraftReverseWaypoints}
          setFreeEditTarget={setFreeEditTarget}
          routeEditId={routeEditId}
          handleSlicePolylineFromKm={handleSlicePolylineFromKm}
          detourRefId={detourRefId}
          setDetourRefId={setDetourRefId}
          floodRoutes={systemData.floodRoutes}
          detourName={detourName}
          setDetourName={setDetourName}
          detourDirectionMode={detourDirectionMode}
          setDetourDirectionMode={setDetourDirectionMode}
          isGeocoding={isGeocoding}
          startLon={startLon}
          startLat={startLat}
          endLon={endLon}
          endLat={endLat}
          handleAutoGeocode={handleAutoGeocode}
        />

        {/* 2. Coordinates & Dual-Source Snapping Controls */}
        <RouteGeometryEditorSection
          onToast={onToast}
          routeMode={routeMode}
          adminPickMode={adminPickMode}
          setAdminPickMode={setAdminPickMode}
          startLat={startLat}
          setStartLat={setStartLat}
          startLon={startLon}
          setStartLon={setStartLon}
          endLat={endLat}
          setEndLat={setEndLat}
          endLon={endLon}
          setEndLon={setEndLon}
          startCoordinateText={startCoordinateText}
          setStartCoordinateText={setStartCoordinateText}
          endCoordinateText={endCoordinateText}
          setEndCoordinateText={setEndCoordinateText}
          revStartLat={revStartLat}
          setRevStartLat={setRevStartLat}
          revStartLon={revStartLon}
          setRevStartLon={setRevStartLon}
          revEndLat={revEndLat}
          setRevEndLat={setRevEndLat}
          revEndLon={revEndLon}
          setRevEndLon={setRevEndLon}
          revStartCoordinateText={revStartCoordinateText}
          setRevStartCoordinateText={setRevStartCoordinateText}
          revEndCoordinateText={revEndCoordinateText}
          setRevEndCoordinateText={setRevEndCoordinateText}
          onSeedReverseEndpoints={handleSeedReverseEndpoints}
          onClearReverseEndpoints={handleClearReverseEndpoints}
          detourStartPhotoUrl={detourStartPhotoUrl}
          setDetourStartPhotoUrl={setDetourStartPhotoUrl}
          detourStartPhotoCaption={detourStartPhotoCaption}
          setDetourStartPhotoCaption={setDetourStartPhotoCaption}
          detourEndPhotoUrl={detourEndPhotoUrl}
          setDetourEndPhotoUrl={setDetourEndPhotoUrl}
          detourEndPhotoCaption={detourEndPhotoCaption}
          setDetourEndPhotoCaption={setDetourEndPhotoCaption}
          handleDetourPointPhotoUpload={handleDetourPointPhotoUpload}
          snappingStatusText={snappingStatusText}
          setSnappingStatusText={setSnappingStatusText}
          freeEditEnabled={freeEditEnabled}
          setFreeEditEnabled={setFreeEditEnabled}
          freeVertexTool={freeVertexTool}
          setFreeVertexTool={setFreeVertexTool}
          supportsTwoWayLineEdit={supportsTwoWayLineEdit}
          activeEditTarget={activeEditTarget}
          handleSelectEditDirection={handleSelectEditDirection}
          draftCoordinates={draftCoordinates}
          setDraftCoordinates={setDraftCoordinates}
          draftReverseCoordinates={draftReverseCoordinates}
          setDraftReverseCoordinates={setDraftReverseCoordinates}
          draftWaypoints={draftWaypoints}
          draftReverseWaypoints={draftReverseWaypoints}
          setDraftReverseWaypoints={setDraftReverseWaypoints}
          routingRequestRef={routingRequest}
          freePastRef={freePast}
          freeFutureRef={freeFuture}
          undoFreeGeometry={undoFreeGeometry}
          forceStraightThrough={forceStraightThrough}
          setForceStraightThrough={setForceStraightThrough}
          triggerDualRoadSnapping={triggerDualRoadSnapping}
          handleSwapEndpoints={handleSwapEndpoints}
          handleAddMidpointWaypoint={handleAddMidpointWaypoint}
          handleUndoWaypoint={handleUndoWaypoint}
          handleRemoveWaypoint={handleRemoveWaypoint}
          originalRouteCoordsRef={originalRouteCoordinates}
          originalReverseRouteCoordsRef={originalReverseRouteCoordinates}
          handleRestoreOriginalRoute={handleRestoreOriginalRoute}
          requestClearRoute={requestClearRoute}
          closedRoadConflicts={closedRoadConflicts}
          passabilityWarnings={passabilityWarnings}
          detourDirectionMode={detourDirectionMode}
          detourDistanceMeters={detourDistanceMeters}
        />

        {/* 3. Auto Detour Advice Generator (If in Detour mode) */}
        {routeMode === "DETOUR" && (
          <DetourAdviceSection
            detourDesc={detourDesc}
            setDetourDesc={setDetourDesc}
            detourAdviceView={detourAdviceView}
            setDetourAdviceView={setDetourAdviceView}
            detourRoadCondition={detourRoadCondition}
            setDetourRoadCondition={setDetourRoadCondition}
            detourDurationMinFwd={detourDurationMinFwd}
            setDetourDurationMinFwd={(val) => {
              durationFwdManualRef.current = val.trim() !== "";
              setDetourDurationMinFwd(val);
            }}
            detourDurationMinRev={detourDurationMinRev}
            setDetourDurationMinRev={(val) => {
              durationRevManualRef.current = val.trim() !== "";
              setDetourDurationMinRev(val);
            }}
            detourDirectionMode={detourDirectionMode}
            detourGoogleMapsUrlFwd={detourGoogleMapsUrlFwd}
            setDetourGoogleMapsUrlFwd={setDetourGoogleMapsUrlFwd}
            detourGoogleMapsUrlRev={detourGoogleMapsUrlRev}
            setDetourGoogleMapsUrlRev={setDetourGoogleMapsUrlRev}
            draftCoordinates={draftCoordinates}
            draftReverseCoordinates={draftReverseCoordinates}
            onGenerateAdvice={handleGenerateDetourAdviceClick}
          />
        )}

        {/* 4. Water Level, Status & Safety Measures (If Flood) */}
        {routeMode === "FLOOD" && (
          <FloodSituationSection
            selectedHighwayOption={selectedHighwayOption}
            selectedHighwayLaneCount={selectedHighwayLaneCount}
            isSelectedHighwayDivided={isSelectedHighwayDivided}
            isDividedBothFlood={isDividedBothFlood}
            directionCode={directionCode}
            setDirectionCode={setDirectionCode}
            roadSide={roadSide}
            setRoadSide={setRoadSide}
            draftCoordinates={draftCoordinates}
            setDraftReverseCoordinates={setDraftReverseCoordinates}
            setDraftReverseWaypoints={setDraftReverseWaypoints}
            setFreeEditTarget={setFreeEditTarget}
            ensureReverseFloodGeometry={ensureReverseFloodGeometry}
            affectedParts={affectedParts}
            setAffectedParts={setAffectedParts}
            reverseAffectedParts={reverseAffectedParts}
            setReverseAffectedParts={setReverseAffectedParts}
            routeWaterLevel={routeWaterLevel}
            setRouteWaterLevel={setRouteWaterLevel}
            reverseRouteWaterLevel={reverseRouteWaterLevel}
            setReverseRouteWaterLevel={setReverseRouteWaterLevel}
            waterLevelKnown={waterLevelKnown}
            setWaterLevelKnown={setWaterLevelKnown}
            reverseWaterLevelKnown={reverseWaterLevelKnown}
            setReverseWaterLevelKnown={setReverseWaterLevelKnown}
            routeStatus={routeStatus}
            setRouteStatus={setRouteStatus}
            reverseRouteStatus={reverseRouteStatus}
            setReverseRouteStatus={setReverseRouteStatus}
            handleWaterLevelInputChange={handleWaterLevelInputChange}
            handleReverseWaterLevelInputChange={handleReverseWaterLevelInputChange}
            toggleAffectedPartWithAutoStatus={toggleAffectedPartWithAutoStatus}
            useCarriagewaySnapping={useCarriagewaySnapping}
            setUseCarriagewaySnapping={setUseCarriagewaySnapping}
            startedAt={startedAt}
            setStartedAt={setStartedAt}
            selectedMeasure={selectedMeasure}
            setSelectedMeasure={setSelectedMeasure}
            reporterName={reporterName}
            setReporterName={setReporterName}
            availableOfficeNames={availableOfficeNames}
            causeAndNote={causeAndNote}
            setCauseAndNote={setCauseAndNote}
            detailedPhotos={detailedPhotos}
            setDetailedPhotos={setDetailedPhotos}
            setFieldImages={setFieldImages}
            handleImageUpload={handleImageUpload}
          />
        )}

        {/* Submit Route Button */}
        <StickyActionBar>
          <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
            <span
              className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[11px] font-heading font-bold whitespace-nowrap ${
                saveAsDraft
                  ? "border border-amber-500/40 bg-amber-950/50 text-amber-200"
                  : "border border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
              }`}
            >
              {saveAsDraft ? "📝 โหมดฉบับร่าง (ยังไม่แสดงประชาชน)" : "🌐 เผยแพร่ขึ้นแผนที่ประชาชน"}
            </span>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitRoute}
              className={`flex-1 font-heading font-black py-3 px-4 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition cursor-pointer ${
                saveAsDraft
                  ? "bg-slate-700 hover:bg-slate-600 text-amber-200 border border-amber-500/50"
                  : "bg-amber-500 hover:bg-amber-400 text-slate-950"
              }`}
            >
              <Save className="w-4 h-4" />
              {routeEditId
                ? routeMode === "DETOUR" ? "บันทึกการแก้ไขทางเลี่ยง" : "บันทึกการแก้ไขเหตุการณ์"
                : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ" : "บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ"}
            </button>
          </div>
          {routeEditId && (
            <button
              type="button"
              onClick={() => {
                setRouteEditId("");
                handleClearRoute();
                if (onClearEditingRoute) onClearEditingRoute();
              }}
              className="bg-slate-800 text-slate-300 px-4 py-3 rounded-xl text-xs font-heading font-semibold"
            >
              ยกเลิก
            </button>
          )}
        </StickyActionBar>
      </div>
    </div>
  );
}

