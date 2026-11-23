"use client";

import React, { useState, useEffect, useRef } from "react";
import { StickyActionBar } from "@/components/admin/ui";
import { SystemDataPayload } from "@/db/default-data";
import { DetourAdviceSection } from "@/components/admin/tabs/DetourAdviceSection";
import { HighwayIdentificationSection } from "@/components/admin/tabs/HighwayIdentificationSection";
import { clearAdminMapDraft } from "@/components/admin/tabs/map-draft-storage";
import { RouteGeometryEditorSection } from "@/components/admin/tabs/RouteGeometryEditorSection";
import { FloodSituationSection } from "@/components/admin/tabs/FloodSituationSection";
import { useDualRoadSnapping } from "@/components/admin/tabs/useDualRoadSnapping";
import { useMapRouteSubmit } from "@/components/admin/tabs/useMapRouteSubmit";
import { useMapRouteDraft } from "@/components/admin/tabs/useMapRouteDraft";
import { useMapRouteMediaAndImport } from "@/components/admin/tabs/useMapRouteMediaAndImport";
import { useMapRouteHydration } from "@/components/admin/tabs/useMapRouteHydration";
import { useMapCoordinatePicker } from "@/components/admin/tabs/useMapCoordinatePicker";
import {
  parseCoordinatePair,
  buildDetourRoutingParams,
  findBestHighwayGroupForSelection,
  sliceBranchByKmRange,
  buildAffectedPartSummary,
  buildDetourMetaPayload,
  computeSlicedHighwayPolylines,
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
    clearAdminMapDraft();
    setRecoverableDraft(null);
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

    const { slicedForward, slicedReverse } = computeSlicedHighwayPolylines({
      highwayLayers: systemData.highwayLayers,
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
            className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold transition ${routeMode === "FLOOD" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
              }`}
          >
            เส้นน้ำท่วม
          </button>
          <button
            type="button"
            onClick={() => { if (routeMode !== "DETOUR") { handleClearRoute(); setRouteMode("DETOUR"); } }}
            className={`min-h-[2.5rem] px-[0.9em] py-[0.45em] rounded-lg text-xs font-heading font-bold transition ${routeMode === "DETOUR" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
          >
            ทางเลี่ยง
          </button>
        </div>
      </div>

      {/* Phase 2.4: Draft Auto-Save Recovery Banner */}
      {recoverableDraft && !routeEditId && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-[0.65em] rounded-xl border border-amber-500/50 bg-amber-950/35 px-[1rem] py-[0.75rem]"
        >
          <p className="max-w-[65ch] text-[0.8125rem] text-amber-200">
            <strong className="font-heading text-amber-300">พบร่างข้อมูลที่พิมพ์ค้างไว้</strong>{" "}
            ({recoverableDraft.routeMode === "FLOOD" ? "เส้นน้ำท่วม" : "ทางเลี่ยง"} · บันทึกเมื่อ{" "}
            {new Date(recoverableDraft.savedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
          </p>
          <div className="flex flex-wrap items-center gap-[0.5em]">
            <button
              type="button"
              onClick={handleRestoreSavedDraft}
              className="min-h-[2.5rem] rounded-lg bg-amber-500 px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              กู้คืนร่างที่ค้างไว้
            </button>
            <button
              type="button"
              onClick={() => {
                clearAdminMapDraft();
                setRecoverableDraft(null);
                onToast("ลบร่างข้อมูลที่ค้างไว้แล้ว");
              }}
              className="min-h-[2.5rem] rounded-lg border border-slate-700 bg-slate-900 px-[0.9em] py-[0.45em] text-[0.75rem] font-heading font-bold text-slate-300 hover:text-white transition"
            >
              ลบร่าง
            </button>
          </div>
        </div>
      )}

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

