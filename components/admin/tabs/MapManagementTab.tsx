"use client";

import React, { useState, useEffect, useRef } from "react";
import { ActionButton, FormSection, StickyActionBar, ToolGroup } from "@/components/admin/ui";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { SystemDataPayload } from "@/db/default-data";
import { DetourAdviceSection } from "@/components/admin/tabs/DetourAdviceSection";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
} from "@/lib/detour-presentation";
import {
  MapPinned,
  ArrowRightLeft,
  Navigation,
  Sparkles,
  Wand2,
  Plus,
  Undo2,
  Camera,
  Save,
  FileUp,
  Trash2,
  Search,
  ChevronDown,
  X,
  Layers,
  Split,
  Clock,
  Image as ImageIcon,
  MapPin,
  RotateCw,
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
  analyzeCarriagewaySeparation,
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
  AFFECTED_ROAD_PARTS,
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
import { TRAFFIC_STATUS_OPTIONS, deriveTrafficStatusFromWaterLevel } from "@/lib/traffic-presentation";
import {
  groupHighwayFeatures,
  getAvailableHighwayRoutes,
  cleanHighwaySectionName,
  haversineDistanceMeters,
  HighwaySectionGroup,
  HighwayBranchItem,
} from "@/lib/highway-schema";
import { insertVertex, moveVertex, removeVertex, nearestInsertIndex } from "@/lib/line-edit";
import type { VertexEditEvent } from "@/lib/line-edit";

function parseCoordinatePair(value: string): [number, number] | null {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 2) return null;
  const [lat, lon] = numbers;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

function calculateBearing(from: [number, number], to: [number, number]): number {
  const fromLat = from[1] * Math.PI / 180;
  const toLat = to[1] * Math.PI / 180;
  const deltaLon = (to[0] - from[0]) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
}

export function buildDetourRoutingParams(points: [number, number][], forceStraightThrough: boolean): string {
  const base = "overview=full&geometries=geojson";
  if (!forceStraightThrough || points.length < 3) return `${base}&alternatives=true`;
  const bearings = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return "";
    return `${calculateBearing(points[index - 1], points[index + 1])},45`;
  }).join(";");
  return `${base}&continue_straight=true&alternatives=false&bearings=${encodeURIComponent(bearings)}`;
}

function findBestHighwayGroupForSelection(
  highwayLayers: SystemDataPayload["highwayLayers"] | undefined,
  routeNo: string,
  sectionName: string,
  kmStart: string,
  kmEnd: string
): HighwaySectionGroup | null {
  const cleanRoute = String(routeNo || "").replace(/^ทล\.?/i, "").trim();
  if (!cleanRoute) return null;
  const matchingGroups = groupHighwayFeatures(highwayLayers || []).filter((g) => g.routeNo === cleanRoute);
  if (matchingGroups.length === 0) return null;

  const cleanSec = cleanHighwaySectionName(sectionName);
  if (cleanSec) {
    const bySection = matchingGroups.find((g) => cleanHighwaySectionName(g.sectionName) === cleanSec);
    if (bySection) return bySection;
  }

  const tStartMeters = parseKmPostMeters(kmStart);
  const tEndMeters = parseKmPostMeters(kmEnd);
  if (tStartMeters !== null && tEndMeters !== null) {
    const targetMid = (tStartMeters + tEndMeters) / 2;
    let bestGroup = matchingGroups[0];
    let minDiff = Infinity;
    for (const g of matchingGroups) {
      const sMeters = parseKmPostMeters(g.kmStart);
      const eMeters = parseKmPostMeters(g.kmEnd);
      if (sMeters !== null && eMeters !== null) {
        const minKm = Math.min(sMeters, eMeters);
        const maxKm = Math.max(sMeters, eMeters);
        if (targetMid >= minKm && targetMid <= maxKm) return g;
        const diff = Math.min(Math.abs(targetMid - minKm), Math.abs(targetMid - maxKm));
        if (diff < minDiff) {
          minDiff = diff;
          bestGroup = g;
        }
      }
    }
    return bestGroup;
  }
  return matchingGroups[0];
}

function sliceBranchByKmRange(
  branch: HighwayBranchItem,
  referenceForwardBranch: HighwayBranchItem | undefined,
  groupKmStart: string,
  groupKmEnd: string,
  targetKmStart: string,
  targetKmEnd: string,
  wantReverseOrder: boolean
): [number, number][] {
  let sourceCoords = branch.coordinates;
  const secStart = branch.properties?.km_start || groupKmStart;
  const secEnd = branch.properties?.km_end || groupKmEnd;
  if (
    branch.directionCode === "B_TO_A" &&
    referenceForwardBranch &&
    referenceForwardBranch.coordinates.length >= 2 &&
    sourceCoords.length >= 2
  ) {
    const fwdStart = referenceForwardBranch.coordinates[0];
    const fwdEnd = referenceForwardBranch.coordinates[referenceForwardBranch.coordinates.length - 1];
    const distToFwdStart = haversineDistanceMeters(sourceCoords[0], fwdStart);
    const distToFwdEnd = haversineDistanceMeters(sourceCoords[0], fwdEnd);
    const revPropsStart = parseKmPostMeters(secStart);
    const revPropsEnd = parseKmPostMeters(secEnd);
    if (revPropsStart !== null && revPropsEnd !== null && revPropsStart < revPropsEnd && distToFwdEnd < distToFwdStart) {
      sourceCoords = [...sourceCoords].reverse();
    }
  }
  return slicePolylineByKmRange(sourceCoords, secStart, secEnd, targetKmStart, targetKmEnd, wantReverseOrder);
}

function buildAffectedPartSummary(parts: AffectedRoadPart[]): { lanesSummary: string; shoulderSummary: AffectedShoulderType } {
  const lanesSummary = parts.includes("ALL_LANES")
    ? "ทุกช่องจราจร"
    : parts.map((p) => AFFECTED_ROAD_PART_LABELS[p]).join(", ") || "ไม่ระบุ";
  const shoulderSummary = (parts.includes("LEFT_SHOULDER") && parts.includes("RIGHT_SHOULDER"))
    ? "BOTH"
    : parts.includes("LEFT_SHOULDER")
      ? "LEFT"
      : parts.includes("RIGHT_SHOULDER")
        ? "RIGHT"
        : "NONE";
  return { lanesSummary, shoulderSummary };
}

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
    if (activeEditTarget === "REVERSE") setDraftReverseCoordinates?.(next);
    else setDraftCoordinates(next);
    // Keep the form's A/B coordinates aligned if an endpoint handle is dragged.
    const reversed = activeEditTarget === "REVERSE" || (routeMode === "DETOUR" ? detourDirectionMode === "REVERSE_ONLY" : directionCode === "B_TO_A");
    const pointA = reversed ? next[next.length - 1] : next[0];
    const pointB = reversed ? next[0] : next[next.length - 1];
    if (pointA && pointB) {
      setStartLon(pointA[0]); setStartLat(pointA[1]);
      setEndLon(pointB[0]); setEndLat(pointB[1]);
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
      if (vertexEvent.index === 0 || (vertexEvent.type === "move" && vertexEvent.index === coords.length - 1) || (vertexEvent.type === "insert" && vertexEvent.index >= coords.length)) {
        onToast("จุด A/B เป็นหมุดอ้างอิง กรุณาปักหมุดใหม่และคำนวณเส้นหากต้องการย้ายจุดต้นหรือปลาย");
        return;
      }
      const valid = vertexEvent.coord.every(Number.isFinite) && Math.abs(vertexEvent.coord[0]) <= 180 && Math.abs(vertexEvent.coord[1]) <= 90;
      if (!valid) return;
      const next = vertexEvent.type === "move"
        ? moveVertex(coords, vertexEvent.index, vertexEvent.coord)
        : insertVertex(coords, vertexEvent.index, vertexEvent.coord);
      updateFreeGeometry(next);
    } else if (vertexEvent.type === "contextmenu" || (vertexEvent.type === "click" && freeVertexTool === "delete")) {
      if (vertexEvent.index === 0 || vertexEvent.index === coords.length - 1) {
        onToast("ไม่สามารถลบหมุด A/B ได้ กรุณาย้ายหมุดแทน");
        return;
      }
      updateFreeGeometry(removeVertex(coords, vertexEvent.index));
    }
  }, [vertexEvent, freeEditEnabled, activeEditTarget, freeVertexTool, draftCoordinates, draftReverseCoordinates]);

  const [detourDistanceMeters, setDetourDistanceMeters] = useState<{ forward: number; reverse: number }>({ forward: 0, reverse: 0 });
  const [detourDurationSeconds, setDetourDurationSeconds] = useState<{ forward: number; reverse: number }>({ forward: 0, reverse: 0 });
  const [closedRoadConflicts, setClosedRoadConflicts] = useState<string[]>([]);

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
  useEffect(() => {
    setStartCoordinateText(startLat !== "" && startLon !== "" ? `${startLat}, ${startLon}` : "");
  }, [startLat, startLon]);
  useEffect(() => {
    setEndCoordinateText(endLat !== "" && endLon !== "" ? `${endLat}, ${endLon}` : "");
  }, [endLat, endLon]);

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
    onDraftPickMarkersChange?.(markers);
  }, [startLat, startLon, endLat, endLon, onDraftPickMarkersChange]);

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
        setReverseRouteWaterLevel(flood.water_level_cm);
        setReverseRouteStatus(flood.traffic_status);
        setReverseWaterLevelKnown(flood.direction_meta?.water_level_known !== false);
        setReverseAffectedParts(meta.affectedParts && meta.affectedParts.length ? meta.affectedParts : ["ALL_LANES"]);
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
      setDetourDurationMinFwd(fwdSec ? String(Math.max(1, Math.round(fwdSec / 60))) : "");
      setDetourDurationMinRev(revSec ? String(Math.max(1, Math.round(revSec / 60))) : "");
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
    } else if (pickedCoordinate.mode === "ADD_LINE_VERTEX" && freeEditEnabled) {
      const point: [number, number] = [pickedCoordinate.lon, pickedCoordinate.lat];
      const geometry = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
      if (geometry.length >= 2) updateFreeGeometry(insertVertex(geometry, Math.max(1, Math.min(geometry.length - 1, nearestInsertIndex(geometry, point).index)), point));
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
    reverseWaypoints: [number, number][] = draftReverseWaypoints
  ) => {
    const requestId = ++routingRequest.current;
    if (freeEditEnabled) setFreeEditEnabled(false);
    const numSLat = Number(sLat);
    const numSLon = Number(sLon);
    const numELat = Number(eLat);
    const numELon = Number(eLon);

    if (!numSLat || !numSLon || !numELat || !numELon || isNaN(numSLat) || isNaN(numELat)) {
      onToast("กรุณาระบุพิกัด A และ B ให้ครบถ้วนก่อนคำนวณเส้นเกาะถนน");
      return;
    }

    setSnappingStatusText("กำลังคำนวณเส้นเกาะถนนจริง (Dual-Source Snapping)...");
    try {
      if (routeMode === "DETOUR") {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[numELon, numELat], ...reverseWaypoints, [numSLon, numSLat]];
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
        const [pickedAB, pickedBA] = await Promise.all([
          detourDirectionMode !== "REVERSE_ONLY" ? resolveDetourDirection(pointsAB) : Promise.resolve(emptyPicked),
          detourDirectionMode !== "FORWARD_ONLY" ? resolveDetourDirection(pointsBA) : Promise.resolve(emptyPicked),
        ]);
        if (requestId !== routingRequest.current) return;

        const forwardCoords = detourDirectionMode === "REVERSE_ONLY" ? pickedBA.coords : pickedAB.coords;
        const reverseCoords = detourDirectionMode === "TWO_WAY" ? pickedBA.coords : [];

        if (forwardCoords.length < 2) {
          setDraftCoordinates([]);
          setDraftReverseCoordinates?.([]);
          setSnappingStatusText("ไม่สามารถคำนวณทางเลี่ยงตามถนนได้ กรุณาเพิ่มจุดดัดหรือลองใหม่");
          return;
        }

        setDraftCoordinates(forwardCoords);
        setDraftReverseCoordinates?.(reverseCoords);
        setDetourDistanceMeters({
          forward: detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.distance,
          reverse: detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.distance,
        });
        const nextFwdDurS = detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.duration;
        const nextRevDurS = detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.duration;
        setDetourDurationSeconds({
          forward: nextFwdDurS,
          reverse: nextRevDurS,
        });
        if (!detourDurationMinFwd.trim() && nextFwdDurS > 0) {
          setDetourDurationMinFwd(String(Math.max(1, Math.round(nextFwdDurS / 60))));
        }
        if (!detourDurationMinRev.trim() && nextRevDurS > 0) {
          setDetourDurationMinRev(String(Math.max(1, Math.round(nextRevDurS / 60))));
        }

        const allConflicts = [...pickedAB.conflicts, ...pickedBA.conflicts];
        const uniqueConflictMsgs = Array.from(
          new Set(allConflicts.map((c) => `ทล.${c.routeNo} (${c.sectionName})`))
        );
        setClosedRoadConflicts(uniqueConflictMsgs);
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
              ? `✓ ${straightLabel}: A→B (${pickedAB.coords.length} จุด) และ B→A (${pickedBA.coords.length} จุด) — ปลอดจุดปิดจราจร`
              : `✓ ${straightLabel} (${forwardCoords.length} จุด) — ปลอดจุดปิดจราจร`
          );
        }
        return;
      }

      // FLOOD mode: Snap single or dual carriageways (A->B and B->A)
      const snapFloodDirected = async (directedPoints: [number, number][]): Promise<[number, number][] | null> => {
        if (useCarriagewaySnapping || isDividedBothFlood) {
          const googleCarriageway = await computeGoogleRouteHybrid(directedPoints, "TRAFFIC_UNAWARE");
          if (requestId !== routingRequest.current) return null;
          if (googleCarriageway && googleCarriageway.coords.length >= 2) return googleCarriageway.coords;
          const osrmRes = await fetchOsrmWithFailover(
            directedPoints.map((p) => p.join(",")).join(";"),
            "overview=full&geometries=geojson"
          );
          if (requestId !== routingRequest.current) return null;
          const osrmCoords = osrmRes?.data?.routes?.[0]?.geometry?.coordinates;
          if (Array.isArray(osrmCoords) && osrmCoords.length >= 2) return osrmCoords as [number, number][];
        }
        const segments = await Promise.all(
          directedPoints.slice(1).map((point, index) => snapRouteAction(directedPoints[index], point).catch(() => null))
        );
        if (requestId !== routingRequest.current) return null;
        if (segments.some((segment) => !segment || segment.length < 2)) return null;
        return segments.flatMap((segment, index) => (index === 0 ? segment! : segment!.slice(1)));
      };

      if (isDividedBothFlood) {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[numELon, numELat], ...reverseWaypoints, [numSLon, numSLat]];
        const [fwdSnapped, revSnapped] = await Promise.all([
          snapFloodDirected(pointsAB),
          snapFloodDirected(pointsBA),
        ]);
        if (requestId !== routingRequest.current) return;
        const resolvedFwd = fwdSnapped && fwdSnapped.length >= 2 ? fwdSnapped : pointsAB;
        const resolvedRev = revSnapped && revSnapped.length >= 2 ? revSnapped : [...resolvedFwd].reverse();
        setDraftCoordinates(resolvedFwd);
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
    if (nextTarget === "REVERSE" && draftReverseCoordinates.length < 2 && draftCoordinates.length >= 2) {
      const seeded = [...draftCoordinates].reverse().map((p) => [...p] as [number, number]);
      setDraftReverseCoordinates?.(seeded);
      if (originalReverseRouteCoordinates.current.length < 2) {
        originalReverseRouteCoordinates.current = seeded.map((p) => [...p] as [number, number]);
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
      const revSource =
        draftReverseCoordinates.length >= 2
          ? draftReverseCoordinates
          : [...draftCoordinates].reverse();
      const midPoint: [number, number] =
        revSource.length >= 2
          ? revSource[Math.floor(revSource.length / 2)]
          : [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
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
    setSnappingStatusText("");
    setStartLat("");
    setStartLon("");
    setEndLat("");
    setEndLon("");
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

    // Fallback: search raw features if no grouped branch matched
    if (slicedForward.length < 2) {
      let targetCoords: [number, number][] = [];
      let secKmStart: any = null;
      let secKmEnd: any = null;
      for (const layer of systemData.highwayLayers || []) {
        if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
          for (const f of layer.geojson_data.features) {
            const props = f.properties || {};
            const fRoute = String(props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "").replace(/^ทล\.?/i, "").trim();
            if (fRoute === cleanRoute && f.geometry?.coordinates?.length >= 2) {
              targetCoords = f.geometry.coordinates;
              secKmStart = props.km_start || kmStart;
              secKmEnd = props.km_end || kmEnd;
              break;
            }
          }
        }
        if (targetCoords.length >= 2) break;
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

        const forwardRes = await upsertRouteAction({
          id: routeEditId || undefined,
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

        // 2. Reverse segment (B -> A): prefer operator's edited/snapped reverse line, fallback to GIS B_TO_A slice
        let reverseCoords: [number, number][] = draftReverseCoordinates.length >= 2 ? draftReverseCoordinates : [];
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

        const existingReverseSiblingId = routeEditId
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
        reverseCoordinates: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? draftReverseCoordinates : undefined,
        reverseWaypoints: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? draftReverseWaypoints : undefined,
        directionMode: routeMode === "DETOUR" ? detourDirectionMode : undefined,
        detourMeta: routeMode === "DETOUR"
          ? (() => {
            const existingDetour = routeEditId ? (systemData.detourRoutes || []).find((d) => d.id === routeEditId) : undefined;
            const existingMeta = existingDetour?.detour_meta;
            const resolveOrderIndex = (): number => {
              if (detourRefId && existingMeta?.event_orders && typeof existingMeta.event_orders[detourRefId] === "number" && Number.isFinite(existingMeta.event_orders[detourRefId])) {
                return existingMeta.event_orders[detourRefId];
              }
              if (existingDetour && (existingDetour.flood_id_ref || "") === (detourRefId || "") && typeof existingMeta?.order_index === "number" && Number.isFinite(existingMeta.order_index)) {
                return existingMeta.order_index;
              }
              const siblings = (systemData.detourRoutes || []).filter(
                (d) =>
                  d.id !== routeEditId &&
                  ((detourRefId && d.flood_id_ref === detourRefId) ||
                    (linkedEventId && d.detour_meta?.eventId === linkedEventId))
              );
              let maxOrder = 0;
              siblings.forEach((d, idx) => {
                const raw = (detourRefId && d.detour_meta?.event_orders?.[detourRefId]) ?? d.detour_meta?.order_index;
                const val = typeof raw === "number" && Number.isFinite(raw) ? raw : idx + 1;
                if (val > maxOrder) maxOrder = val;
              });
              return maxOrder + 1;
            };
            const orderIndex = resolveOrderIndex();
            const mergedEventOrders = {
              ...(existingMeta?.event_orders || {}),
              ...(detourRefId ? { [detourRefId]: orderIndex } : {}),
            };
            const parsedFwdMin = Number(detourDurationMinFwd);
            const parsedRevMin = Number(detourDurationMinRev);
            const hasFwdMin = Number.isFinite(parsedFwdMin) && parsedFwdMin > 0;
            const hasRevMin = Number.isFinite(parsedRevMin) && parsedRevMin > 0;
            const fwdPolyKm = calculatePolylineRoadDistanceKm(coords);
            const revPolyKm = calculatePolylineRoadDistanceKm(
              detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2 ? draftReverseCoordinates : coords
            );
            const nextMeta: Record<string, any> = {
              ...(existingMeta || {}),
              order_index: typeof existingMeta?.order_index === "number" && (!detourRefId || existingDetour?.flood_id_ref === detourRefId)
                ? existingMeta.order_index
                : orderIndex,
              ...(Object.keys(mergedEventOrders).length > 0 ? { event_orders: mergedEventOrders } : {}),
              forward_distance_km: fwdPolyKm || undefined,
              reverse_distance_km: detourDirectionMode === "FORWARD_ONLY" ? undefined : (revPolyKm || undefined),
              forward_distance_m: fwdPolyKm > 0 ? Math.round(fwdPolyKm * 1000) : (detourDistanceMeters.forward || existingMeta?.forward_distance_m || undefined),
              reverse_distance_m: detourDirectionMode === "FORWARD_ONLY"
                ? undefined
                : revPolyKm > 0
                  ? Math.round(revPolyKm * 1000)
                  : (detourDistanceMeters.reverse || existingMeta?.reverse_distance_m || undefined),
              show_arrows: true,
              verified_no_closed_overlap: closedRoadConflicts.length === 0,
              carriageway_type: separation?.isSymmetricSingleLine ? "SINGLE_CENTERLINE" : "ASYMMETRIC_DETOUR",
              eventId: linkedEventId,
              ...(detourGoogleMapsUrlFwd.trim() ? { google_maps_url_forward: detourGoogleMapsUrlFwd.trim(), google_maps_url: detourGoogleMapsUrlFwd.trim() } : {}),
              ...(detourGoogleMapsUrlRev.trim() ? { google_maps_url_reverse: detourGoogleMapsUrlRev.trim() } : {}),
              ...(detourRoadCondition.trim() ? { road_condition: detourRoadCondition.trim() } : {}),
            };
            if (hasFwdMin) {
              nextMeta.forward_duration_min = Math.round(parsedFwdMin);
              nextMeta.forward_duration_s = Math.round(parsedFwdMin * 60);
            } else {
              delete nextMeta.forward_duration_min;
              delete nextMeta.forward_duration_s;
            }
            if (hasRevMin) {
              nextMeta.reverse_duration_min = Math.round(parsedRevMin);
              nextMeta.reverse_duration_s = Math.round(parsedRevMin * 60);
            } else {
              delete nextMeta.reverse_duration_min;
              delete nextMeta.reverse_duration_s;
            }
            if (resolvedDetourStartPhotoUrl) {
              nextMeta.start_point_photo = {
                url: resolvedDetourStartPhotoUrl,
                ...(detourStartPhotoCaption.trim() ? { caption: detourStartPhotoCaption.trim() } : {}),
              };
            } else {
              delete nextMeta.start_point_photo;
            }
            if (resolvedDetourEndPhotoUrl) {
              nextMeta.end_point_photo = {
                url: resolvedDetourEndPhotoUrl,
                ...(detourEndPhotoCaption.trim() ? { caption: detourEndPhotoCaption.trim() } : {}),
              };
            } else {
              delete nextMeta.end_point_photo;
            }
            return nextMeta;
          })()
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
        <FormSection step={1} title="ข้อมูลสายทางและพื้นที่" description="ระบุทางหลวง ช่วง กม. และบริเวณที่เกิดเหตุ">
          {routeMode === "FLOOD" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 mb-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" /> การจัดกลุ่มเหตุการณ์หลัก (Parent Event)
                </span>
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => { setParentEventMode("NEW"); setSelectedParentEventId(""); setEventCode(""); }}
                    className={`px-2.5 py-1 rounded font-heading font-bold transition ${parentEventMode === "NEW" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    + สร้างเหตุการณ์ใหม่
                  </button>
                  <button
                    type="button"
                    disabled={existingParentEvents.length === 0}
                    onClick={() => setParentEventMode("EXISTING")}
                    className={`px-2.5 py-1 rounded font-heading font-bold transition disabled:opacity-40 ${parentEventMode === "EXISTING" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    ผูกเหตุการณ์เดิม ({existingParentEvents.length})
                  </button>
                </div>
              </div>

              {parentEventMode === "EXISTING" && existingParentEvents.length > 0 && (
                <div>
                  <label className="text-xs text-slate-300 block mb-1">เลือกเหตุการณ์หลักที่ต้องการเพิ่มช่วง กม. ย่อย</label>
                  <select
                    value={selectedParentEventId}
                    onChange={(e) => {
                      const evId = e.target.value;
                      setSelectedParentEventId(evId);
                      const ev = existingParentEvents.find((item) => item.eventId === evId);
                      if (ev) {
                        setRouteNo(ev.routeNo);
                        setSelectedHighwayName(`ทล.${ev.routeNo} - ${ev.sectionName}`);
                        setSectionName(ev.sectionName);
                        setEventCode(ev.eventCode);
                        setEventTitle(ev.eventTitle);
                        if (ev.villageOrLandmark) setVillageOrLandmark(ev.villageOrLandmark);
                        if (ev.subdivisionName) setReporterName(ev.subdivisionName);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-semibold"
                  >
                    <option value="">-- เลือกเหตุการณ์หลัก --</option>
                    {existingParentEvents.map((ev) => (
                      <option key={ev.eventId} value={ev.eventId}>
                        ทล.{ev.routeNo} ตอน{ev.sectionName} ({ev.segments.length} ช่วงย่อย)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">หมู่บ้าน / จุดสังเกตหน้างาน</label>
                  <button
                    type="button"
                    onClick={handleFetchLocationFromCoords}
                    disabled={isFetchingAddress}
                    className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-heading cursor-pointer disabled:opacity-50"
                    title="ดึงชื่อหมู่บ้านและตำบลจากพิกัด"
                  >
                    {isFetchingAddress ? <RotateCw className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                    <span>{isFetchingAddress ? "กำลังดึง..." : "📍 ดึงจากพิกัด"}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={villageOrLandmark}
                  onChange={(e) => setVillageOrLandmark(e.target.value)}
                  placeholder="เช่น บ.ดอนยาง ม.2 ต.ดอนยาง อ.หนองจิก"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          )}

          {routeMode === "FLOOD" ? (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative" ref={highwayComboboxRef}>
                  <label className="text-xs text-slate-300">หมายเลขทางหลวง *</label>
                  <button
                    type="button"
                    aria-expanded={isHighwayDropdownOpen}
                    aria-haspopup="listbox"
                    aria-label="หมายเลขทางหลวง"
                    className="relative mt-1 flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-white hover:border-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    onClick={() => setIsHighwayDropdownOpen((prev) => !prev)}
                  >
                    <span className={`truncate ${!routeNo ? "text-slate-400" : "font-semibold text-amber-300"}`}>
                      {selectedHighwayName || (routeNo ? (availableHighways.find((h) => h.no === routeNo)?.name || `ทล.${routeNo}`) : "-- เลือกหมายเลขทางหลวง --")}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
                  </button>

                  {/* Hidden select to preserve standard form/accessible value if queried */}
                  <select
                    value={routeNo}
                    onChange={(e) => setRouteNo(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {!routeNo && <option value="">-- เลือกหมายเลขทางหลวง --</option>}
                    {availableHighways.map((h) => (
                      <option key={`${h.no}_${h.name}`} value={h.no}>
                        {h.name}
                      </option>
                    ))}
                  </select>

                  {/* Smart Search Filterable Dropdown */}
                  {isHighwayDropdownOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full sm:min-w-[320px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl backdrop-blur-md flex flex-col">
                      <div className="p-2 border-b border-slate-800 bg-slate-900/90 flex items-center gap-2">
                        <Search className="h-4 w-4 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          autoFocus
                          value={highwaySearchQuery}
                          onChange={(e) => setHighwaySearchQuery(e.target.value)}
                          placeholder="พิมพ์ค้นหาเลขทางหลวง หรือชื่อตอน..."
                          className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {highwaySearchQuery && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHighwaySearchQuery("");
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div
                        role="listbox"
                        aria-label="รายการทางหลวง"
                        className="overflow-y-auto max-h-52 divide-y divide-slate-850"
                      >
                        {(() => {
                          const query = highwaySearchQuery.trim().toLowerCase();
                          const filtered = availableHighways.filter(
                            (h) => h.no.toLowerCase().includes(query) || h.name.toLowerCase().includes(query)
                          );
                          if (filtered.length === 0) {
                            return (
                              <div className="p-3 text-center text-xs text-slate-500">
                                {availableHighways.length === 0
                                  ? "ไม่พบข้อมูลสายทางหลวงในฐานข้อมูลโครงข่ายทางหลวง"
                                  : `ไม่พบสายทางหลวงที่ตรงกับ "${highwaySearchQuery}"`}
                              </div>
                            );
                          }
                          return filtered.map((h) => (
                            <div
                              key={`${h.no}_${h.name}_${h.kmStart || ""}`}
                              onClick={() => {
                                setRouteNo(h.no);
                                setSelectedHighwayName(h.name);
                                if (h.sectionName) {
                                  setSectionName(h.sectionName);
                                  sectionNameManuallyEdited.current = true;
                                }
                                if (h.kmStart) {
                                  setKmStart(h.kmStart);
                                }
                                if (h.kmEnd) {
                                  setKmEnd(h.kmEnd);
                                }
                                if (routeMode === "FLOOD" && roadSide === "BOTH" && !(h.laneCount >= 4 || h.hasDualCarriageway)) {
                                  setDraftReverseCoordinates?.([]);
                                  setDraftReverseWaypoints?.([]);
                                  setFreeEditTarget("FORWARD");
                                }
                                if (!routeEditId && (!eventCode || eventCode.startsWith("FL-"))) {
                                  setEventCode(generateNextEventCode(h.no, existingParentEvents));
                                }
                                setIsHighwayDropdownOpen(false);
                                setHighwaySearchQuery("");
                              }}
                              className={`cursor-pointer px-3 py-2 text-xs transition hover:bg-slate-800/80 flex items-center justify-between ${routeNo === h.no && selectedHighwayName === h.name ? "bg-amber-500/15 text-amber-300 font-semibold" : "text-slate-200"
                                }`}
                            >
                              <span className="truncate">{h.name}</span>
                              {h.kmStart && h.kmEnd && (
                                <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
                                  {h.kmStart} - {h.kmEnd}
                                </span>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-300">กม. เริ่มต้น</label>
                  <input
                    type="text"
                    value={kmStart}
                    onChange={(e) => setKmStart(e.target.value)}
                    placeholder="เช่น 12+500"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">กม. สิ้นสุด</label>
                  <input
                    type="text"
                    value={kmEnd}
                    onChange={(e) => setKmEnd(e.target.value)}
                    placeholder="เช่น 14+200"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleSlicePolylineFromKm}
                  className="text-[11px] bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-700 px-3 py-1.5 rounded-xl font-heading font-semibold flex items-center gap-1.5 transition"
                  title="คำนวณแนวเส้นและพิกัดเริ่มต้น-สิ้นสุดจากข้อมูล GIS ทางหลวงอัตโนมัติ"
                >
                  <Wand2 className="w-3.5 h-3.5 text-sky-400" /> คำนวณแนวเส้นจากช่วง กม. อัตโนมัติ (Linear Referencing)
                </button>
                <span className="text-[10px] text-slate-400">ระบบจะตัดเฉพาะช่วงเส้นทางหลวงตาม กม. เริ่มต้น–สิ้นสุด</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">ผูกกับจุดน้ำท่วมอ้างอิง</label>
                  <select
                    value={detourRefId}
                    onChange={(e) => setDetourRefId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">ไม่ผูกกับจุดน้ำท่วม</option>
                    {systemData.floodRoutes.map((f) => (
                      <option key={f.id} value={f.id}>
                        ทล.{f.route_no} - {f.section_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">ชื่อเส้นทางเลี่ยง *</label>
                  <input
                    type="text"
                    value={detourName}
                    onChange={(e) => setDetourName(e.target.value)}
                    placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">ทิศทางการเดินรถของทางเลี่ยง (A-B / B-A)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {DETOUR_DIRECTION_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setDetourDirectionMode(mode.value)}
                      className={`p-2.5 rounded-xl border text-left transition ${detourDirectionMode === mode.value
                        ? "border-amber-400 bg-amber-500/15 text-amber-200"
                        : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700"
                        }`}
                    >
                      <p className="text-xs font-heading font-bold">{mode.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{mode.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section Name & Auto-Geocoding Button */}
          {routeMode === "FLOOD" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-300">ชื่อตอนควบคุม / บริเวณพื้นที่ *</label>
                <button
                  type="button"
                  disabled={isGeocoding}
                  onClick={async () => {
                    await handleAutoGeocode(Number(startLon), Number(startLat), "START");
                    if (endLon && endLat) await handleAutoGeocode(Number(endLon), Number(endLat), "END");
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-lg font-heading transition"
                >
                  <Navigation className="w-3 h-3" />
                  {isGeocoding ? "กำลังระบุพื้นที่..." : "ดึงตำบล/อำเภออัตโนมัติ"}
                </button>
              </div>
              <input
                type="text"
                value={sectionName}
                onChange={(e) => { sectionNameManuallyEdited.current = true; setSectionName(e.target.value); }}
                placeholder="เช่น ตอน ดอนยาง - บานา (ต.ดอนยาง อ.หนองจิก)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          )}

        </FormSection>

        {/* 2. Coordinates & Dual-Source Snapping Controls */}
        <FormSection
          step={2}
          title="แนวเส้นบนแผนที่"
          description="เลือกจุดเริ่มต้น-สิ้นสุด ให้ระบบคำนวณเส้นเกาะถนน แล้วดัดแนวด้วยจุดดัดเส้น"
          actions={
            <ActionButton
              variant="secondary"
              onClick={handleSwapEndpoints}
              title="สลับจุดเริ่มต้น (A) ↔ สิ้นสุด (B) และกลับทิศทางเส้นทาง"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-sky-400" />
              <span>สลับ A ⇄ B</span>
            </ActionButton>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs font-black text-slate-950">A</span>
                  จุดเริ่มต้น
                </span>
                <ActionButton variant="pick" active={adminPickMode === "PICK_START"} onClick={() => setAdminPickMode("PICK_START")}>
                  {adminPickMode === "PICK_START" ? "เลือกจุด A..." : "เลือกจุด A"}
                </ActionButton>
              </div>
              <input
                type="text"
                aria-label="พิกัดจุด A"
                value={startCoordinateText}
                onChange={(e) => setStartCoordinateText(e.target.value)}
                onBlur={() => { const pair = parseCoordinatePair(startCoordinateText); if (pair) { setStartLat(pair[0]); setStartLon(pair[1]); } else { setStartLat(""); setStartLon(""); } }}
                placeholder="วางจาก Google Maps เช่น 6.8340, 101.1860"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500"
              />
              {routeMode === "DETOUR" && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-heading font-semibold text-emerald-300 flex items-center gap-1">
                      <Camera className="h-3.5 w-3.5" />
                      ภาพทางเข้าจุดเริ่มต้น A (ขาไป A → B)
                    </span>
                    <label className="cursor-pointer rounded-lg border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/60 px-2.5 py-1 text-[11px] font-heading font-bold text-emerald-200 transition">
                      {detourStartPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดเริ่ม A"}
                      <input
                        type="file"
                        accept="image/*"
                        aria-label="แนบภาพจุดเริ่มต้น A"
                        className="sr-only"
                        onChange={(e) => handleDetourPointPhotoUpload("START", e)}
                      />
                    </label>
                  </div>
                  {detourStartPhotoUrl && (
                    <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2">
                      <div className="relative">
                        <img
                          src={detourStartPhotoUrl}
                          alt="ภาพทางเข้าจุดเริ่มต้น A"
                          className="h-28 w-full rounded-md object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setDetourStartPhotoUrl("");
                            setDetourStartPhotoCaption("");
                          }}
                          aria-label="ลบภาพจุดเริ่มต้น A"
                          className="absolute top-1.5 right-1.5 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        aria-label="คำอธิบายภาพจุดเริ่มต้น A"
                        value={detourStartPhotoCaption}
                        onChange={(e) => setDetourStartPhotoCaption(e.target.value)}
                        placeholder="คำอธิบาย เช่น ปากทางเข้าซอยฝั่งจุดเริ่มต้น A"
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs font-black text-white">B</span>
                  จุดสิ้นสุด
                </span>
                <ActionButton variant="pick" active={adminPickMode === "PICK_END"} onClick={() => setAdminPickMode("PICK_END")}>
                  {adminPickMode === "PICK_END" ? "เลือกจุด B..." : "เลือกจุด B"}
                </ActionButton>
              </div>
              <input
                type="text"
                aria-label="พิกัดจุด B"
                value={endCoordinateText}
                onChange={(e) => setEndCoordinateText(e.target.value)}
                onBlur={() => { const pair = parseCoordinatePair(endCoordinateText); if (pair) { setEndLat(pair[0]); setEndLon(pair[1]); } else { setEndLat(""); setEndLon(""); } }}
                placeholder="วางจาก Google Maps เช่น 6.8390, 101.1920"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500"
              />
              {routeMode === "DETOUR" && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-heading font-semibold text-sky-300 flex items-center gap-1">
                      <Camera className="h-3.5 w-3.5" />
                      ภาพทางเข้าจุดสิ้นสุด B (ขากลับ B → A)
                    </span>
                    <label className="cursor-pointer rounded-lg border border-sky-700/70 bg-sky-950/40 hover:bg-sky-900/60 px-2.5 py-1 text-[11px] font-heading font-bold text-sky-200 transition">
                      {detourEndPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดสิ้นสุด B"}
                      <input
                        type="file"
                        accept="image/*"
                        aria-label="แนบภาพจุดสิ้นสุด B"
                        className="sr-only"
                        onChange={(e) => handleDetourPointPhotoUpload("END", e)}
                      />
                    </label>
                  </div>
                  {detourEndPhotoUrl && (
                    <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2">
                      <div className="relative">
                        <img
                          src={detourEndPhotoUrl}
                          alt="ภาพทางเข้าจุดสิ้นสุด B"
                          className="h-28 w-full rounded-md object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setDetourEndPhotoUrl("");
                            setDetourEndPhotoCaption("");
                          }}
                          aria-label="ลบภาพจุดสิ้นสุด B"
                          className="absolute top-1.5 right-1.5 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        aria-label="คำอธิบายภาพจุดสิ้นสุด B"
                        value={detourEndPhotoCaption}
                        onChange={(e) => setDetourEndPhotoCaption(e.target.value)}
                        placeholder="คำอธิบาย เช่น ปากทางเข้าฝั่งขากลับ (สำหรับผู้มาจากอีกฝั่ง)"
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Snapping Status Feedback Banner */}
          {snappingStatusText && (
            <div className="p-2.5 rounded-lg bg-sky-950/70 border border-sky-800 text-sky-200 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{snappingStatusText}</span>
            </div>
          )}

          {/* Unified My Maps-style geometry editor (also used by highway geometry). */}
          <div className="rounded-xl border border-sky-800/70 bg-slate-900/50 p-3 space-y-3" role="group" aria-label="โหมดแก้ไขแนวเส้น">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">แก้ไขแนวเส้นบนแผนที่</p>
              <span className="text-xs text-slate-400">ตามถนน / ดัดเส้นอิสระ</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton variant={freeEditEnabled ? "secondary" : "primary"} active={!freeEditEnabled} onClick={() => { setFreeEditEnabled(false); setAdminPickMode(null); }}>
                <Wand2 className="h-4 w-4" /> ตามแนวถนน
              </ActionButton>
              <ActionButton variant={freeEditEnabled ? "primary" : "secondary"} active={freeEditEnabled} onClick={() => {
                if (draftCoordinates.length < 2) { onToast("กรุณาปัก A และ B แล้วคำนวณแนวถนนก่อนดัดเส้นอิสระ"); return; }
                if (activeEditTarget === "REVERSE" && draftReverseCoordinates.length < 2) {
                  setDraftReverseCoordinates?.([...draftCoordinates].reverse().map((p) => [...p] as [number, number]));
                }
                routingRequest.current += 1;
                freePast.current = []; freeFuture.current = [];
                setFreeEditEnabled(true); setAdminPickMode(null); setFreeVertexTool("move");
              }}>
                <MapPinned className="h-4 w-4" /> ดัดเส้นอิสระ
              </ActionButton>
            </div>
            {supportsTwoWayLineEdit && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs font-semibold text-slate-300">เลือกทิศทางเส้นทางที่ต้องการแก้ไข:</span>
                <DirectionSwitch
                  size="sm"
                  ariaLabel="เลือกทิศทางสำหรับดัดเส้น"
                  value={activeEditTarget}
                  onChange={handleSelectEditDirection}
                  options={[
                    { value: "FORWARD", label: "ขาไป (A → B)", ariaLabel: "ขาไป A → B" },
                    { value: "REVERSE", label: "ขากลับ (B → A)", ariaLabel: "ขากลับ B → A" },
                  ]}
                />
              </div>
            )}
            {freeEditEnabled && (
              <>
                <ToolGroup label="แก้ไขจุดดัด (ใช้เครื่องมือเดียวกับแนวทางหลวง)">
                  <ActionButton variant="secondary" active={freeVertexTool === "move" && adminPickMode !== "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(null); }}>ลากจุดดัด</ActionButton>
                  <ActionButton variant="pick" active={adminPickMode === "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(adminPickMode === "ADD_LINE_VERTEX" ? null : "ADD_LINE_VERTEX"); }}>+ เพิ่มจุดดัดอิสระ</ActionButton>
                  <ActionButton variant="danger" active={freeVertexTool === "delete"} onClick={() => { setFreeVertexTool(freeVertexTool === "delete" ? "move" : "delete"); setAdminPickMode(null); }}>ลบจุดดัด</ActionButton>
                  <ActionButton variant="secondary" disabled={!freePast.current.length} onClick={() => undoFreeGeometry(false)}>ย้อนกลับ</ActionButton>
                  <ActionButton variant="secondary" disabled={!freeFuture.current.length} onClick={() => undoFreeGeometry(true)}>ทำซ้ำ</ActionButton>
                </ToolGroup>
                <p className="text-xs text-sky-200">ลากหมุดเล็กบนเส้นเพื่อย้ายจุด คลิกจุดกึ่งกลางเพื่อแทรก คลิกขวาเพื่อลบ หรือเลือกโหมดลบจุด ข้อมูลจะคงแนวเส้นอิสระตามที่บันทึก</p>
                {supportsTwoWayLineEdit && (
                  <p className="text-xs text-amber-200">
                    กำลังดัดเส้น: <strong>{activeEditTarget === "REVERSE" ? "ขากลับ (B → A)" : "ขาไป (A → B)"}</strong> (สลับปุ่มทิศทางด้านบนเพื่อแก้แต่ละฝั่งแยกกันได้ทันที)
                  </p>
                )}
              </>
            )}
          </div>

          {/* Waypoint Operations & Midpoint Insertion */}
          {!freeEditEnabled && routeMode === "DETOUR" && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-100">
              <input
                type="checkbox"
                checked={forceStraightThrough}
                onChange={(event) => {
                  setForceStraightThrough(event.target.checked);
                  setSnappingStatusText(event.target.checked
                    ? "เปิดโหมดตรงผ่านแยกแล้ว: เพิ่มจุดดัดบนกึ่งกลางสามแยก/สี่แยก แล้วกดคำนวณเส้นเกาะถนน"
                    : "ปิดโหมดตรงผ่านแยกแล้ว");
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
              />
              <span><strong className="block text-amber-300">บังคับตรงผ่านสามแยก/สี่แยก</strong>จุดดัดจะเป็นจุดควบคุมทิศทางตรง ระบบจะป้องกันการยูเทิร์นที่จุดนั้นและยังคงเกาะถนนจริง กรุณาตรวจเส้นพรีวิวก่อนบันทึก</span>
            </label>
          )}
          <div className="space-y-4 border-t border-slate-800 pt-4">
            <ActionButton
              variant="primary"
              className="w-full sm:w-auto"
              onClick={() => triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, draftReverseWaypoints)}
            >
              <Wand2 className="h-3.5 w-3.5" /> คำนวณเส้นเกาะถนน
            </ActionButton>

            {!freeEditEnabled && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ToolGroup label={supportsTwoWayLineEdit ? `ดัดแนวเส้น (${activeEditTarget === "REVERSE" ? "ขากลับ B → A" : "ขาไป A → B"})` : "ดัดแนวเส้น"}>
                  <ActionButton variant="secondary" className="text-amber-300" onClick={handleAddMidpointWaypoint}>
                    <Plus className="h-3.5 w-3.5" /> แตะจุดกลางเส้นเพื่อเพิ่มจุด
                  </ActionButton>
                  {(() => {
                    const pickTargetMode = activeEditTarget === "REVERSE" ? "ADD_REVERSE_WAYPOINT" : "ADD_WAYPOINT";
                    const isPicking = adminPickMode === pickTargetMode;
                    return (
                      <ActionButton
                        variant="pick"
                        active={isPicking}
                        onClick={() => setAdminPickMode(isPicking ? null : pickTargetMode)}
                      >
                        {isPicking
                          ? (forceStraightThrough && routeMode === "DETOUR" ? "คลิกกึ่งกลางแยก..." : "คลิกถนนเพื่อดัด...")
                          : (forceStraightThrough && routeMode === "DETOUR" ? "+ เพิ่มจุดผ่านแยกตรง" : "+ เพิ่มจุดดัดเส้น")}
                      </ActionButton>
                    );
                  })()}
                </ToolGroup>

                <ToolGroup label="ย้อนกลับหรือล้าง">
                  <ActionButton variant="secondary" onClick={handleUndoWaypoint}>
                    <Undo2 className="h-3.5 w-3.5" /> ย้อนกลับ
                  </ActionButton>
                  {(originalRouteCoordinates.current.length >= 2 || originalReverseRouteCoordinates.current.length >= 2) && (
                    <ActionButton variant="secondary" className="text-sky-300" onClick={handleRestoreOriginalRoute}>
                      คืนค่าแนวเดิม
                    </ActionButton>
                  )}
                  <ActionButton variant="danger" onClick={requestClearRoute}>
                    ล้างข้อมูลทั้งหมด
                  </ActionButton>
                </ToolGroup>
              </div>
            )}
          </div>
          {!freeEditEnabled && draftWaypoints.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3" aria-label="รายการจุดดัดเส้น">
              <p className="mb-2 text-xs font-semibold text-slate-200">จุดดัดเส้น ({draftWaypoints.length} จุด)</p>
              <div className="flex flex-wrap gap-2">
                {draftWaypoints.map(([lon, lat], index) => (
                  <div key={`${lon}-${lat}-${index}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300">
                    <span className="font-mono">#{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveWaypoint(index)}
                      aria-label={`ลบจุดดัดที่ ${index + 1}`}
                      className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!freeEditEnabled && supportsTwoWayLineEdit && draftReverseWaypoints.length > 0 && (
            <div className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-3" aria-label="รายการจุดดัดเส้นขากลับ">
              <p className="mb-2 text-xs font-semibold text-sky-200">จุดดัดเส้นขากลับ B → A ({draftReverseWaypoints.length} จุด)</p>
              <div className="flex flex-wrap gap-2">
                {draftReverseWaypoints.map(([lon, lat], index) => (
                  <div key={`rev-${lon}-${lat}-${index}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-sky-800 bg-slate-950 px-2 text-xs text-sky-200">
                    <span className="font-mono">#R{index + 1} · {lat.toFixed(5)}, {lon.toFixed(5)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = draftReverseWaypoints.filter((_, i) => i !== index);
                        setDraftReverseWaypoints?.(next);
                        if (startLat && startLon && endLat && endLon) {
                          void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints, next);
                        }
                      }}
                      aria-label={`ลบจุดดัดขากลับที่ ${index + 1}`}
                      className="grid h-8 w-8 place-items-center rounded-md text-red-400 hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {routeMode === "DETOUR" && draftCoordinates.length >= 2 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-heading font-bold text-amber-300">🔍 พรีวิวตรวจสอบทางเลี่ยงก่อนบันทึก (A-B / B-A Inspector)</span>
                {closedRoadConflicts.length === 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                    ✓ ผ่านเกณฑ์: ไม่ตัดผ่านจุดปิดการจราจร
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-200 border border-red-600 text-[10px] font-bold">
                    ✕ พบตัดผ่านจุดปิดการจราจร ({closedRoadConflicts.length} จุด)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                  <span className="text-slate-400 block">ขาไป (A → B)</span>
                  <strong className="text-amber-300 font-mono">
                    {detourDirectionMode === "REVERSE_ONLY"
                      ? "ไม่ใช้ (เดินรถเฉพาะ B→A)"
                      : `${draftCoordinates.length} จุด${detourDistanceMeters.forward ? ` · ${(detourDistanceMeters.forward / 1000).toFixed(2)} กม.` : ""}`}
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                  <span className="text-slate-400 block">ขากลับ (B → A)</span>
                  <strong className="text-sky-300 font-mono">
                    {detourDirectionMode === "FORWARD_ONLY"
                      ? "ไม่ใช้ (เดินรถเฉพาะ A→B)"
                      : detourDirectionMode === "REVERSE_ONLY"
                        ? `${draftCoordinates.length} จุด${detourDistanceMeters.reverse ? ` · ${(detourDistanceMeters.reverse / 1000).toFixed(2)} กม.` : ""}`
                        : `${draftReverseCoordinates.length || draftCoordinates.length} จุด${detourDistanceMeters.reverse ? ` · ${(detourDistanceMeters.reverse / 1000).toFixed(2)} กม.` : ""}`}
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-900 p-2 border border-slate-800">
                  <span className="text-slate-400 block">โครงสร้างแนวเส้นและลูกศร</span>
                  <strong className="text-emerald-300">
                    {detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2
                      ? analyzeCarriagewaySeparation(draftCoordinates, draftReverseCoordinates).isSymmetricSingleLine
                        ? "ใช้ถนนสายเดียวกัน (ลูกศร ⇄)"
                        : "แยกแนวเส้น A→B และ B→A (ลูกศร →)"
                      : "เดินรถทิศทางเดียว (ลูกศร →)"}
                  </strong>
                </div>
              </div>
              {closedRoadConflicts.length > 0 && (
                <p className="rounded-lg bg-red-950/70 border border-red-700 p-2 text-[11px] text-red-200">
                  ⚠️ เส้นทางเลี่ยงทับซ้อนช่วงถนนที่ปิดการจราจร: <strong>{closedRoadConflicts.join(", ")}</strong> — กรุณาเพิ่มจุดดัดเส้นเพื่ออ้อมจุดดังกล่าวก่อนเผยแพร่
                </p>
              )}
            </div>
          )}
        </FormSection>

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
            setDetourDurationMinFwd={setDetourDurationMinFwd}
            detourDurationMinRev={detourDurationMinRev}
            setDetourDurationMinRev={setDetourDurationMinRev}
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
          <FormSection step={3} title="สถานการณ์น้ำและมาตรการ" description="ทิศทาง เส้นทางที่ได้รับผลกระทบ ระดับน้ำ สถานะจราจร ๕ สถานะ วันเวลา และภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)">
            {/* Direction and Highway Carriageway Info */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs text-slate-300">ทิศทางการเดินรถของช่วงน้ำท่วมนี้</label>
                  {selectedHighwayOption && (
                    <span className={`text-[11px] font-heading font-semibold px-2 py-0.5 rounded-lg border ${
                      isSelectedHighwayDivided
                        ? "border-sky-500/40 bg-sky-950/60 text-sky-300"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}>
                      🛣️ {selectedHighwayOption.lanes || `${selectedHighwayLaneCount} ช่องจราจร`} · {isSelectedHighwayDivided ? "แยกคันทาง A→B / B→A" : "คันทางเดี่ยว"}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDirectionCode("A_TO_B");
                      setRoadSide("LEFT");
                      setDraftReverseCoordinates?.([]);
                      setDraftReverseWaypoints?.([]);
                      setFreeEditTarget("FORWARD");
                    }}
                    className={`p-2 rounded-xl border text-left transition ${directionCode === "A_TO_B" && roadSide === "LEFT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                  >
                    <span className="text-xs font-heading font-bold block">🚗 ฝั่งซ้ายทาง (ขาไป A → B)</span>
                    <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. เพิ่มขึ้น</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirectionCode("B_TO_A");
                      setRoadSide("RIGHT");
                      setDraftReverseCoordinates?.([]);
                      setDraftReverseWaypoints?.([]);
                      setFreeEditTarget("FORWARD");
                    }}
                    className={`p-2 rounded-xl border text-left transition ${directionCode === "B_TO_A" && roadSide === "RIGHT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                  >
                    <span className="text-xs font-heading font-bold block">🚙 ฝั่งขวาทาง (ขากลับ B → A)</span>
                    <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. ลดลง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirectionCode("BOTH");
                      setRoadSide("BOTH");
                      if (isSelectedHighwayDivided) {
                        ensureReverseFloodGeometry(draftCoordinates);
                      } else {
                        setDraftReverseCoordinates?.([]);
                        setDraftReverseWaypoints?.([]);
                        setFreeEditTarget("FORWARD");
                      }
                    }}
                    className={`p-2 rounded-xl border text-left transition ${directionCode === "BOTH" && roadSide === "BOTH" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                  >
                    <span className="text-xs font-heading font-bold block">↔️ ท่วมทั้งสองฝั่งจราจร</span>
                    <span className="text-[10px] text-slate-400">
                      {isSelectedHighwayDivided ? "แยกเส้น A→B / B→A และแยกระดับน้ำ" : "น้ำท่วมเต็มทั้งสองคันทาง"}
                    </span>
                  </button>
                </div>

                {roadSide === "BOTH" && (
                  <p className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                    isDividedBothFlood
                      ? "border-sky-500/40 bg-sky-950/40 text-sky-200"
                      : "border-slate-800 bg-slate-950/70 text-slate-400"
                  }`}>
                    {isDividedBothFlood
                      ? `✓ ทางหลวง ${selectedHighwayOption?.lanes || "ตั้งแต่ ๔ ช่องจราจรขึ้นไป"}: สามารถสลับแก้ไขแนวเส้น ขาไป (A → B) / ขากลับ (B → A) ในส่วนที่ ๒ และกรอกระดับน้ำแยกฝั่งด้านล่างได้ทันที`
                      : selectedHighwayOption
                        ? `ทางหลวง ${selectedHighwayOption.lanes || `${selectedHighwayLaneCount} ช่องจราจร`} (< ๔ ช่องจราจร): ใช้แนวเส้นและข้อมูลระดับน้ำร่วมกันทั้งสองฝั่ง`
                        : "เลือกหมายเลขทางหลวงจากโครงข่ายทางหลวง (ตั้งแต่ ๔ ช่องจราจรขึ้นไป) เพื่อเปิดการแก้ไขแนวเส้นและระดับน้ำแยกฝั่งขาไป–ขากลับ"}
                  </p>
                )}
              </div>

              {!isDividedBothFlood && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-300 font-heading font-semibold">
                      เส้นทางที่ได้รับผลกระทบ (เลือกได้หลายรายการตามสภาพจริง) *
                    </label>
                    <span className="text-[10px] text-amber-300 font-mono">เลือกแล้ว {affectedParts.length} ส่วน</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AFFECTED_ROAD_PARTS.map((part) => {
                      const isSelected = affectedParts.includes(part.value);
                      return (
                        <button
                          key={part.value}
                          type="button"
                          onClick={() =>
                            toggleAffectedPartWithAutoStatus(
                              part.value,
                              affectedParts,
                              setAffectedParts,
                              routeWaterLevel,
                              waterLevelKnown,
                              setRouteStatus
                            )
                          }
                          title={part.desc}
                          className={`px-2.5 py-1 rounded-lg text-xs font-heading font-bold border transition ${isSelected
                              ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                              : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                            }`}
                        >
                          {part.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(directionCode === "A_TO_B" || directionCode === "B_TO_A" || isDividedBothFlood) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-sky-300">
                    <input
                      type="checkbox"
                      checked={useCarriagewaySnapping}
                      onChange={(e) => setUseCarriagewaySnapping(e.target.checked)}
                      className="h-4 w-4 accent-sky-400"
                    />
                    <span>เกาะแนวคันทางแยกฝั่งอัตโนมัติ (สำหรับถนน 4 ช่องจราจรที่มีเกาะกลาง)</span>
                  </label>
                  <span className="text-[11px] text-amber-300/90">
                    ⚠️ ระบบจะไม่สรุปว่าฝั่งตรงข้ามปลอดภัยอัตโนมัติหากยังไม่มีรายงานยืนยัน
                  </span>
                </div>
              )}
            </div>

            {isDividedBothFlood ? (
              <div className="space-y-3">
                {[
                  {
                    key: "FORWARD" as const,
                    heading: "🚗 ๑. ฝั่งขาไป (A → B)",
                    sideHint: "ฝั่งซ้ายของทางหลวง",
                    borderClass: "border-amber-500/40 bg-amber-950/20",
                    headingClass: "text-amber-300",
                    knownLabelClass: "text-amber-300",
                    checkboxAccent: "accent-amber-400",
                    parts: affectedParts,
                    setParts: setAffectedParts,
                    waterLevel: routeWaterLevel,
                    onWaterLevelChange: handleWaterLevelInputChange,
                    waterKnown: waterLevelKnown,
                    setWaterKnown: setWaterLevelKnown,
                    clearWaterLevel: () => setRouteWaterLevel(""),
                    status: routeStatus,
                    setStatus: setRouteStatus,
                    levelInputId: "flood-water-level-forward",
                    statusSelectId: "flood-traffic-status-forward",
                    levelLabel: "ระดับน้ำขาไป (ซม.) *",
                    statusLabel: "สถานะสภาพการจราจรขาไป (๕ สถานะ)",
                    placeholder: "เช่น 30",
                  },
                  {
                    key: "REVERSE" as const,
                    heading: "🚙 ๒. ฝั่งขากลับ (B → A)",
                    sideHint: "ฝั่งขวาของทางหลวง",
                    borderClass: "border-sky-500/40 bg-sky-950/20",
                    headingClass: "text-sky-300",
                    knownLabelClass: "text-sky-300",
                    checkboxAccent: "accent-sky-400",
                    parts: reverseAffectedParts,
                    setParts: setReverseAffectedParts,
                    waterLevel: reverseRouteWaterLevel,
                    onWaterLevelChange: handleReverseWaterLevelInputChange,
                    waterKnown: reverseWaterLevelKnown,
                    setWaterKnown: setReverseWaterLevelKnown,
                    clearWaterLevel: () => setReverseRouteWaterLevel(""),
                    status: reverseRouteStatus,
                    setStatus: setReverseRouteStatus,
                    levelInputId: "flood-water-level-reverse",
                    statusSelectId: "flood-traffic-status-reverse",
                    levelLabel: "ระดับน้ำขากลับ (ซม.) *",
                    statusLabel: "สถานะสภาพการจราจรขากลับ (๕ สถานะ)",
                    placeholder: "เช่น 15 (หรือระบุ 0)",
                  },
                ].map((side) => (
                  <div
                    key={side.key}
                    role="group"
                    aria-label={side.key === "FORWARD" ? "ข้อมูลฝั่งขาไป A → B" : "ข้อมูลฝั่งขากลับ B → A"}
                    className={`rounded-xl border ${side.borderClass} p-3 space-y-2.5`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-heading font-bold text-xs ${side.headingClass}`}>
                        {side.heading}
                      </span>
                      <span className="text-[10px] text-slate-400">{side.sideHint}</span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-300 font-heading font-semibold">เส้นทางที่ได้รับผลกระทบ ({side.key === "FORWARD" ? "ขาไป" : "ขากลับ"})</span>
                        <span className="text-[10px] text-amber-300 font-mono">เลือกแล้ว {side.parts.length} ส่วน</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {AFFECTED_ROAD_PARTS.map((part) => {
                          const isSelected = side.parts.includes(part.value);
                          return (
                            <button
                              key={`${side.key}-${part.value}`}
                              type="button"
                              onClick={() =>
                                toggleAffectedPartWithAutoStatus(
                                  part.value,
                                  side.parts,
                                  side.setParts,
                                  side.waterLevel,
                                  side.waterKnown,
                                  side.setStatus
                                )
                              }
                              title={part.desc}
                              className={`px-2 py-1 rounded-lg text-[11px] font-heading font-bold border transition ${isSelected
                                  ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                                  : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                                }`}
                            >
                              {part.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label htmlFor={side.levelInputId} className="text-[11px] text-slate-300">{side.levelLabel}</label>
                          <label className={`flex items-center gap-1 text-[10px] ${side.knownLabelClass} cursor-pointer`}>
                            <input
                              type="checkbox"
                              checked={!side.waterKnown}
                              onChange={(e) => {
                                const unknown = e.target.checked;
                                side.setWaterKnown(!unknown);
                                if (unknown) side.clearWaterLevel();
                              }}
                              className={`h-3 w-3 ${side.checkboxAccent}`}
                            />
                            <span>ไม่ทราบค่า</span>
                          </label>
                        </div>
                        <input
                          id={side.levelInputId}
                          type="number"
                          min={0}
                          disabled={!side.waterKnown}
                          value={side.waterLevel}
                          onChange={(e) => side.onWaterLevelChange(e.target.value)}
                          placeholder={side.waterKnown ? side.placeholder : "ยังไม่ทราบระดับน้ำ"}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label htmlFor={side.statusSelectId} className="text-[11px] text-slate-300 block mb-1">{side.statusLabel}</label>
                        <select
                          id={side.statusSelectId}
                          value={side.status}
                          onChange={(e: any) => side.setStatus(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                        >
                          {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {side.waterKnown && Number(side.waterLevel) === 0 && side.waterLevel !== "" && (
                      <p className="text-[11px] text-emerald-300">
                        💡 ระดับน้ำ 0 ซม.: ระบบตั้งค่าสถานะแนะนำเป็น &quot;ผ่านได้ปกติ&quot; และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (แก้ไขสถานะด้วยตนเองได้)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor="flood-water-level-single" className="text-xs text-slate-300">ระดับน้ำท่วมผิวทาง (ซม.) *</label>
                    <label className="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!waterLevelKnown}
                        onChange={(e) => {
                          const unknown = e.target.checked;
                          setWaterLevelKnown(!unknown);
                          if (unknown) setRouteWaterLevel("");
                        }}
                        className="h-3.5 w-3.5 accent-amber-400"
                      />
                      <span>ยังไม่ทราบค่าระดับน้ำ</span>
                    </label>
                  </div>
                  <input
                    id="flood-water-level-single"
                    type="number"
                    min={0}
                    disabled={!waterLevelKnown}
                    value={routeWaterLevel}
                    onChange={(e) => handleWaterLevelInputChange(e.target.value)}
                    placeholder={waterLevelKnown ? "เช่น 35 (ระบุ 0 เมื่อน้ำแห้งแต่คงประวัติ)" : "ยังไม่ทราบระดับน้ำ (รอวัดหน้างาน)"}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono disabled:opacity-50"
                  />
                  {waterLevelKnown && Number(routeWaterLevel) === 0 && routeWaterLevel !== "" && (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      💡 ระดับน้ำ 0 ซม.: ระบบตั้งค่าสถานะแนะนำเป็น &quot;ผ่านได้ปกติ&quot; และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (หากถนนยังชำรุด/ปิดจราจร สามารถแก้ไขสถานะทางขวามือได้ทันที)
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="flood-traffic-status-single" className="text-xs text-slate-300 block mb-1">สถานะสภาพการจราจร (๕ สถานะ)</label>
                  <select
                    id="flood-traffic-status-single"
                    value={routeStatus}
                    onChange={(e: any) => setRouteStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">วันและเวลาเริ่มเกิดเหตุ</label>
                <input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">มาตรการอำนวยความปลอดภัย</label>
                <select
                  value={selectedMeasure}
                  onChange={(e) => setSelectedMeasure(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {SAFETY_MEASURES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">ผู้รายงาน / หมวดทางหลวง</label>
                <input
                  type="text"
                  list="doh-offices-datalist"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="เช่น หมวดทางหลวงหนองจิก / เจ้าหน้าที่ศูนย์ฯ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <datalist id="doh-offices-datalist">
                  {availableOfficeNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">สาเหตุ / ลักษณะน้ำท่วม / หมายเหตุเจ้าหน้าที่</label>
              <input
                type="text"
                value={causeAndNote}
                onChange={(e) => setCauseAndNote(e.target.value)}
                placeholder="เช่น ฝนตกหนักต่อเนื่อง น้ำล้นคลองชลประทาน / รถเล็กสามารถสัญจรด้วยความระมัดระวัง"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            {/* Image Upload Gallery (Max 5 photos, <= 300 KB each) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-300">
                  ภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)
                </label>
                <span className="text-[11px] text-amber-300 font-mono">
                  {detailedPhotos.length} / 5 ภาพ
                </span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <label className={`bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-xs text-amber-300 ${detailedPhotos.length >= 5 ? "opacity-50 pointer-events-none" : ""}`}>
                  <Camera className="w-4 h-4" />
                  <span>{detailedPhotos.length >= 5 ? "ครบ ๕ ภาพแล้ว" : "เลือกรูปภาพจากเครื่อง / มือถือ"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={detailedPhotos.length >= 5}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {detailedPhotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                  {detailedPhotos.map((photo, i) => (
                    <div key={photo.id || i} className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between">
                      <div className="h-20 w-full overflow-hidden rounded bg-slate-900">
                        <img src={photo.dataUrl} className="w-full h-full object-cover" alt={`field-${i + 1}`} />
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        <span>{i === 0 ? "ภาพหลัก" : `ภาพที่ ${i + 1}`}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextPhotos = detailedPhotos.filter((_, idx) => idx !== i);
                          setDetailedPhotos(nextPhotos);
                          setFieldImages(nextPhotos.map((p) => p.dataUrl));
                        }}
                        className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded p-1 text-[10px] leading-none shadow"
                        title="ลบรูปภาพนี้"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FormSection>
        )}

        {/* Submit Route Button */}
        <StickyActionBar>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmitRoute}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black py-3 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            {routeEditId
              ? routeMode === "DETOUR" ? "บันทึกการแก้ไขทางเลี่ยง" : "บันทึกการแก้ไขเหตุการณ์"
              : routeMode === "DETOUR" ? "บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ" : "บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ"}
          </button>
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

