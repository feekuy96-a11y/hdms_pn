"use client";

import React, { useState, useEffect, useRef } from "react";
import { ActionButton, FormSection, StickyActionBar, ToolGroup } from "@/components/admin/ui";
import { SystemDataPayload } from "@/db/default-data";
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
import { upsertRouteAction, snapRouteAction } from "@/app/actions/doh-actions";
import {
  fetchOsrmWithFailover,
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
  HIGHWAY_ROUTES,
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
import { groupHighwayFeatures, HighwaySectionGroup, HighwayBranchItem } from "@/lib/highway-schema";
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
  const [forceStraightThrough, setForceStraightThrough] = useState(false);
  const [detourDirectionMode, setDetourDirectionMode] = useState<DetourDirectionModeType>("TWO_WAY");
  // The highway, flood and detour editors share the same draggable Leaflet vertex handles
  // and pure GeoJSON editing helpers. Freehand changes do not invoke road snapping.
  const [freeEditEnabled, setFreeEditEnabled] = useState(false);
  const [freeEditTarget, setFreeEditTarget] = useState<"FORWARD" | "REVERSE">("FORWARD");
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
  useEffect(() => { onVertexEditTargetChangeRef.current?.(freeEditTarget); }, [freeEditTarget]);
  useEffect(() => {
    setFreeEditEnabled(false);
    setFreeEditTarget("FORWARD");
    freePast.current = [];
    freeFuture.current = [];
    setFreeHistoryVersion((v) => v + 1);
  }, [routeMode, editingRoute?.id]);

  const freeGeometry = freeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
  const updateFreeGeometry = (next: [number, number][], recordHistory = true) => {
    const current = freeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
    if (next.length < 2 || next === current || next.every((point, index) => point[0] === current[index]?.[0] && point[1] === current[index]?.[1])) return;
    routingRequest.current += 1; // prevent a stale OSRM response from overwriting manual edits
    if (recordHistory) {
      freePast.current.push(current.map((p) => [...p] as [number, number]));
      if (freePast.current.length > 30) freePast.current.shift();
      freeFuture.current = [];
    }
    if (freeEditTarget === "REVERSE") setDraftReverseCoordinates?.(next);
    else setDraftCoordinates(next);
    // Keep the form's A/B coordinates aligned if an endpoint handle is dragged.
    const reversed = freeEditTarget === "REVERSE" || (routeMode === "DETOUR" ? detourDirectionMode === "REVERSE_ONLY" : directionCode === "B_TO_A");
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
    const coords = freeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
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
  }, [vertexEvent, freeEditEnabled, freeEditTarget, freeVertexTool, draftCoordinates, draftReverseCoordinates]);

  const [detourDistanceMeters, setDetourDistanceMeters] = useState<{ forward: number; reverse: number }>({ forward: 0, reverse: 0 });
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

  // Flood Severity & Traffic Status - Start empty for clean input
  const [routeWaterLevel, setRouteWaterLevel] = useState<number | string>("");
  const [routeStatus, setRouteStatus] = useState<"WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE">("WARNING");
  const [selectedMeasure, setSelectedMeasure] = useState<string>(SAFETY_MEASURES[0]);

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
  const [directionCode, setDirectionCode] = useState<FloodDirectionCode>("UNKNOWN");
  const [affectedParts, setAffectedParts] = useState<AffectedRoadPart[]>(["UNSPECIFIED"]);
  const [detailedPhotos, setDetailedPhotos] = useState<FloodPhotoItem[]>([]);

  // Phase 4: Dual Direction quick create
  const [isDualDirectionMode, setIsDualDirectionMode] = useState<boolean>(false);
  const [reverseRouteWaterLevel, setReverseRouteWaterLevel] = useState<number | string>("");
  const [reverseRouteStatus, setReverseRouteStatus] = useState<"WARNING" | "CLOSED" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE">("WARNING");
  const [reverseWaterLevelKnown, setReverseWaterLevelKnown] = useState<boolean>(true);
  const [reverseAffectedParts, setReverseAffectedParts] = useState<AffectedRoadPart[]>(["ALL_LANES"]);

  // Group existing flood routes into parent events
  const existingParentEvents = React.useMemo(() => {
    return groupFloodRoutesIntoEvents(systemData.floodRoutes || []);
  }, [systemData.floodRoutes]);

  // Dynamic Highway Routes strictly from database matching Highway Engineering Specifications
  const availableHighways = React.useMemo(() => {
    type HighwayOption = {
      no: string;
      name: string;
      sectionName?: string;
      kmStart?: string;
      kmEnd?: string;
      sortOrder: number;
    };
    const list: HighwayOption[] = [];
    const seen = new Set<string>();

    (systemData.highwayLayers || []).forEach((layer) => {
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        layer.geojson_data.features.forEach((f: any, idx: number) => {
          const props = f.properties || {};
          const no = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
          const section = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "";
          if (no) {
            const cleanNo = String(no).replace(/^ทล\.?/i, "").trim();
            const kmS = props.km_start ? String(props.km_start).trim() : "";
            const kmE = props.km_end ? String(props.km_end).trim() : "";
            const key = `${cleanNo}_${section}_${kmS}_${kmE}`;
            if (!seen.has(key)) {
              seen.add(key);
              const num = Number(cleanNo.match(/\d+/)?.[0] ?? Infinity);
              list.push({
                no: cleanNo,
                name: section ? `ทล.${cleanNo} - ${section}` : `ทล.${cleanNo}`,
                sectionName: section,
                kmStart: kmS,
                kmEnd: kmE,
                sortOrder: num,
              });
            }
          }
        });
      }
    });

    (systemData.floodRoutes || []).forEach((r) => {
      if (r.route_no) {
        const cleanNo = String(r.route_no).replace(/^ทล\.?/i, "").trim();
        const key = `${cleanNo}_${r.section_name || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          const num = Number(cleanNo.match(/\d+/)?.[0] ?? Infinity);
          list.push({
            no: cleanNo,
            name: r.section_name ? `ทล.${cleanNo} - ${r.section_name}` : `ทล.${cleanNo}`,
            sectionName: r.section_name,
            kmStart: r.km_start,
            kmEnd: r.km_end,
            sortOrder: num,
          });
        }
      }
    });

    if (list.length === 0) {
      HIGHWAY_ROUTES.forEach((h) => {
        const num = Number(h.no.match(/\d+/)?.[0] ?? Infinity);
        list.push({
          no: h.no,
          name: `ทล.${h.no} - ${h.name}`,
          sectionName: h.name,
          sortOrder: num,
        });
      });
    }

    return list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.no.localeCompare(b.no, "th", { numeric: true }) || a.name.localeCompare(b.name, "th");
    });
  }, [systemData.highwayLayers, systemData.floodRoutes]);

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
      setDraftReverseCoordinates?.([]);
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
      const geometry = freeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
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

        const [routingAB, routingBA] = await Promise.all([
          detourDirectionMode !== "REVERSE_ONLY"
            ? fetchOsrmWithFailover(
              pointsAB.map((point) => point.join(",")).join(";"),
              buildDetourRoutingParams(pointsAB, forceStraightThrough),
            )
            : Promise.resolve(null),
          detourDirectionMode !== "FORWARD_ONLY"
            ? fetchOsrmWithFailover(
              pointsBA.map((point) => point.join(",")).join(";"),
              buildDetourRoutingParams(pointsBA, forceStraightThrough),
            )
            : Promise.resolve(null),
        ]);
        if (requestId !== routingRequest.current) return;

        // Pick a route from alternatives that avoids confirmed CLOSED flood routes
        const pickSafeRoute = (routingRes: any) => {
          const routes = Array.isArray(routingRes?.data?.routes) ? routingRes.data.routes : [];
          if (routes.length === 0) return { coords: [] as [number, number][], distance: 0, conflicts: [] as ReturnType<typeof detectClosedRoadConflicts> };
          for (const candidate of routes) {
            const cCoords = candidate?.geometry?.coordinates;
            if (!Array.isArray(cCoords) || cCoords.length < 2) continue;
            const cConflicts = detectClosedRoadConflicts(cCoords, systemData.floodRoutes || []);
            if (cConflicts.length === 0) {
              return { coords: cCoords as [number, number][], distance: Number(candidate.distance) || 0, conflicts: [] };
            }
          }
          const primary = routes[0];
          const pCoords = (primary?.geometry?.coordinates || []) as [number, number][];
          return {
            coords: pCoords,
            distance: Number(primary?.distance) || 0,
            conflicts: detectClosedRoadConflicts(pCoords, systemData.floodRoutes || []),
          };
        };

        const pickedAB = pickSafeRoute(routingAB);
        const pickedBA = pickSafeRoute(routingBA);

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

      // FLOOD mode: If divided road / directional side is chosen with carriageway snapping, use OSRM along driving direction
      if (useCarriagewaySnapping && (roadSide === "LEFT" || roadSide === "RIGHT")) {
        const directedPoints: [number, number][] =
          roadSide === "RIGHT"
            ? [[numELon, numELat], ...[...waypoints].reverse(), [numSLon, numSLat]]
            : [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const routing = await fetchOsrmWithFailover(
          directedPoints.map((p) => p.join(",")).join(";"),
          "overview=full&geometries=geojson"
        );
        if (requestId !== routingRequest.current) return;
        const osrmCoords = routing?.data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(osrmCoords) && osrmCoords.length >= 2) {
          setDraftCoordinates(osrmCoords);
          setSnappingStatusText(
            `✓ คำนวณเส้นน้ำท่วมแยกตามคันทางจริง (${roadSide === "LEFT" ? "ฝั่งซ้าย ขาไป A→B" : "ฝั่งขวา ขากลับ B→A"}, ${osrmCoords.length} จุด)`
          );
          onToast(`เกาะแนวคันทาง ${roadSide === "LEFT" ? "ฝั่งซ้าย" : "ฝั่งขวา"} สำเร็จ (${osrmCoords.length} จุด)`);
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

  // Swap Endpoints
  const handleSwapEndpoints = () => {
    const tmpLat = startLat;
    const tmpLon = startLon;
    setStartLat(endLat);
    setStartLon(endLon);
    setEndLat(tmpLat);
    setEndLon(tmpLon);

    if (draftCoordinates.length > 0) {
      const reversed = [...draftCoordinates].reverse() as [number, number][];
      setDraftCoordinates(reversed);
    }
    if (draftWaypoints.length > 0) {
      setDraftWaypoints([...draftWaypoints].reverse());
    }
    onToast("สลับจุดเริ่มต้นและสิ้นสุด A ⇄ B เรียบร้อย");
  };

  // Add Midpoint Waypoint
  const handleAddMidpointWaypoint = () => {
    const start: [number, number] = [Number(startLon), Number(startLat)];
    const end: [number, number] = [Number(endLon), Number(endLat)];
    const hasEndpoints = [...start, ...end].every(Number.isFinite) && start.every((value) => value !== 0) && end.every((value) => value !== 0);
    if (draftCoordinates.length < 2 && !hasEndpoints) {
      onToast("กรุณากำหนดจุด A และ B ก่อนเพิ่มจุดกึ่งกลาง");
      return;
    }
    const midPoint: [number, number] = draftCoordinates.length >= 2
      ? draftCoordinates[Math.floor(draftCoordinates.length / 2)]
      : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    setDraftWaypoints((prev) => [...prev, midPoint]);
    onToast(`เพิ่มจุดดัดแนวเส้นทางที่พิกัด ${midPoint[1].toFixed(4)}, ${midPoint[0].toFixed(4)}`);
  };

  // Undo Waypoint
  const handleUndoWaypoint = () => {
    if (draftWaypoints.length > 0) {
      const updated = draftWaypoints.slice(0, -1);
      setDraftWaypoints(updated);
      onToast("ยกเลิกจุดดัดล่าสุดเรียบร้อย");
      if (startLat && startLon && endLat && endLon) {
        triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated);
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
      void triggerDualRoadSnapping(startLat, startLon, endLat, endLon, updated);
    }
  };

  const handleRestoreOriginalRoute = () => {
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
    setDetourDistanceMeters({ forward: 0, reverse: 0 });
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
    setIsDualDirectionMode(false);
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

  // Slice Polyline from Phase 1 GIS Highway Layers by KM Range & Direction
  const handleSlicePolylineFromKm = () => {
    if (!routeNo || !kmStart || !kmEnd) {
      onToast("กรุณาระบุหมายเลขทางหลวง, กม.เริ่มต้น และ กม.สิ้นสุด ก่อนคำนวณแนวเส้น");
      return;
    }

    const cleanRoute = String(routeNo).replace(/^ทล\.?/i, "").trim();
    const tStartMeters = parseKmPostMeters(kmStart);
    const tEndMeters = parseKmPostMeters(kmEnd);

    let targetCoords: [number, number][] = [];
    let secKmStart: any = null;
    let secKmEnd: any = null;

    // 1. ค้นหาผ่าน HighwaySectionGroup ที่จัดกลุ่มตามมาตรฐาน Phase 1
    const sectionGroups = groupHighwayFeatures(systemData.highwayLayers || []);
    const matchingGroups = sectionGroups.filter((g) => g.routeNo === cleanRoute);

    if (matchingGroups.length > 0) {
      // หากพบหลายตอนควบคุม ให้เลือกตอนที่ช่วง กม. ครอบคลุมเป้าหมายหรือใกล้เคียงที่สุด
      let bestGroup = matchingGroups[0];
      if (tStartMeters !== null && tEndMeters !== null) {
        const targetMid = (tStartMeters + tEndMeters) / 2;
        let minDiff = Infinity;
        for (const g of matchingGroups) {
          const sMeters = parseKmPostMeters(g.kmStart);
          const eMeters = parseKmPostMeters(g.kmEnd);
          if (sMeters !== null && eMeters !== null) {
            const minKm = Math.min(sMeters, eMeters);
            const maxKm = Math.max(sMeters, eMeters);
            if (targetMid >= minKm && targetMid <= maxKm) {
              bestGroup = g;
              break;
            }
            const diff = Math.min(Math.abs(targetMid - minKm), Math.abs(targetMid - maxKm));
            if (diff < minDiff) {
              minDiff = diff;
              bestGroup = g;
            }
          }
        }
      }

      // เลือก Branch ที่ตรงกับทิศทางจราจรที่เลือก (Dual-carriageway branches)
      let chosenBranch = bestGroup.primaryBranch;
      if (directionCode === "B_TO_A") {
        const reverseBranch = bestGroup.branches.find(
          (b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2
        );
        if (reverseBranch) chosenBranch = reverseBranch;
      } else if (directionCode === "A_TO_B") {
        const forwardBranch = bestGroup.branches.find(
          (b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2
        );
        if (forwardBranch) chosenBranch = forwardBranch;
      }

      if (chosenBranch && chosenBranch.coordinates.length >= 2) {
        targetCoords = chosenBranch.coordinates;
        secKmStart = chosenBranch.properties?.km_start || bestGroup.kmStart;
        secKmEnd = chosenBranch.properties?.km_end || bestGroup.kmEnd;
      }
    }

    // 2. Fallback: ค้นตรงจาก Features ใน highwayLayers หากยังไม่พบพิกัด
    if (targetCoords.length < 2) {
      for (const layer of systemData.highwayLayers || []) {
        if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
          for (const f of layer.geojson_data.features) {
            const props = f.properties || {};
            const fRoute = String(props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "").replace(/^ทล\.?/i, "").trim();
            if (fRoute === cleanRoute) {
              if (f.geometry?.coordinates?.length >= 2) {
                targetCoords = f.geometry.coordinates;
                secKmStart = props.km_start || kmStart;
                secKmEnd = props.km_end || kmEnd;
                break;
              }
            }
          }
        }
        if (targetCoords.length >= 2) break;
      }
    }

    if (targetCoords.length < 2) {
      onToast(`ไม่พบข้อมูลแนวเส้น GIS ของ ทล.${routeNo} ในระบบ กรุณาคลิกเลือกจุดบนแผนที่หรือคำนวณเส้นเกาะถนน`);
      return;
    }

    const sliced = slicePolylineByKmRange(
      targetCoords,
      secKmStart,
      secKmEnd,
      kmStart,
      kmEnd,
      directionCode === "B_TO_A"
    );

    if (sliced.length >= 2) {
      setDraftCoordinates(sliced);
      const [firstLon, firstLat] = sliced[0];
      const [lastLon, lastLat] = sliced[sliced.length - 1];
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
      onToast(`คำนวณแนวเส้น ทล.${routeNo} ช่วง กม.${kmStart} - ${kmEnd} (${directionCode === "B_TO_A" ? "ย้อน กม." : "ตาม กม."}) สำเร็จ`);
    } else {
      onToast("ไม่สามารถตัดแนวเส้นจากช่วง กม. ที่ระบุได้");
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
    onToast(`กำลังประมวลผลและบีบอัดภาพถ่าย ${filesToProcess.length} ภาพ (≤ 300 KB)...`);

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
      detourDirectionMode
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
    if (routeMode === "FLOOD" && !isDualDirectionMode && (roadSide === "UNKNOWN" ||
        (roadSide === "LEFT" && directionCode !== "A_TO_B") ||
        (roadSide === "RIGHT" && directionCode !== "B_TO_A") ||
        (roadSide === "BOTH" && directionCode !== "BOTH"))) {
      onToast("กรุณาเลือกฝั่งถนนและทิศทางการเดินรถให้ตรงกันก่อนบันทึก (ซ้าย A→B / ขวา B→A / ทั้งสองฝั่ง)");
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
      const effectiveRoadSide: RoadSideType = roadSide;
      const lanesSummary = affectedParts.includes("ALL_LANES")
        ? "ทุกช่องจราจร"
        : affectedParts.map((p) => AFFECTED_ROAD_PART_LABELS[p]).join(", ") || "ไม่ระบุ";
      const shoulderSummary = (affectedParts.includes("LEFT_SHOULDER") && affectedParts.includes("RIGHT_SHOULDER"))
        ? "BOTH"
        : affectedParts.includes("LEFT_SHOULDER")
          ? "LEFT"
          : affectedParts.includes("RIGHT_SHOULDER")
            ? "RIGHT"
            : "NONE";
      const primaryPhoto = detailedPhotos[0]?.dataUrl || fieldImages[0] || undefined;
      const dbTrafficStatus = (routeStatus as string) === "PENDING_VERIFICATION" ? "WARNING" : routeStatus;

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
        trafficStatusDetail: (routeStatus as string) === "PENDING_VERIFICATION" ? "PENDING_VERIFICATION" : mapTrafficStatusToDetail(routeStatus),
        waterLevelKnown,
        startedAt: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        zeroConfirmedAt: waterLevelKnown && numWaterLevel === 0 ? new Date().toISOString() : null,
        causeAndNote: causeAndNote.trim(),
        photos: detailedPhotos,
        arrow_direction: directionCode === "A_TO_B" ? "FORWARD" : directionCode === "B_TO_A" ? "REVERSE" : directionCode === "BOTH" ? "TWO_WAY" : "UNKNOWN",
        show_arrows: true,
        carriageway_type: useCarriagewaySnapping ? "DUAL_CARRIAGEWAY" : "SINGLE_CENTERLINE",
        water_level_known: waterLevelKnown,
      };

      if (routeMode === "FLOOD" && isDualDirectionMode && !routeEditId) {
        // 1. Forward segment (A -> B)
        const forwardDirectionMeta: FloodSegmentDirectionMeta = {
          ...floodDirectionMeta,
          directionCode: "A_TO_B",
          directionLabel: "ตามหลัก กม. (ขาไป A → B)",
          arrow_direction: "FORWARD",
          roadSide: "LEFT",
        };

        await upsertRouteAction({
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

        // 2. Reverse segment (B -> A)
        let reverseCoords: [number, number][] = [];
        const cleanChosenRoute = chosenRouteNo.replace(/^ทล\.?/i, "").trim();
        const layer = (systemData.highwayLayers || []).find((l) => {
          const fc = l.geojson_data;
          if (fc && Array.isArray(fc.features)) {
            return fc.features.some((f: any) => {
              const props = f.properties || {};
              const no = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
              return no && String(no).replace(/^ทล\.?/i, "").trim() === cleanChosenRoute;
            });
          }
          return l.layer_name?.includes(cleanChosenRoute || "");
        });
        if (layer?.geojson_data?.features?.[0]?.geometry?.coordinates) {
          const hwCoords = layer.geojson_data.features[0].geometry.coordinates as [number, number][];
          const hwProps = layer.geojson_data.features[0].properties || {};
          reverseCoords = slicePolylineByKmRange(hwCoords, hwProps.km_start || kmStart, hwProps.km_end || kmEnd, kmStart, kmEnd, true);
        }
        if (reverseCoords.length < 2) {
          reverseCoords = [...coords].reverse();
        }

        const revSLat = reverseCoords[0] ? reverseCoords[0][1] : numELat;
        const revSLon = reverseCoords[0] ? reverseCoords[0][0] : numELon;
        const revELat = reverseCoords[reverseCoords.length - 1] ? reverseCoords[reverseCoords.length - 1][1] : numSLat;
        const revELon = reverseCoords[reverseCoords.length - 1] ? reverseCoords[reverseCoords.length - 1][0] : numSLon;

        const numRevWaterLevel = Number(reverseRouteWaterLevel || 0);
        const revLanesSummary = reverseAffectedParts.includes("ALL_LANES")
          ? "ทุกช่องจราจร"
          : reverseAffectedParts.map((p) => AFFECTED_ROAD_PART_LABELS[p]).join(", ") || "ไม่ระบุ";
        const revShoulderSummary = (reverseAffectedParts.includes("LEFT_SHOULDER") && reverseAffectedParts.includes("RIGHT_SHOULDER"))
          ? "BOTH"
          : reverseAffectedParts.includes("LEFT_SHOULDER")
            ? "LEFT"
            : reverseAffectedParts.includes("RIGHT_SHOULDER")
              ? "RIGHT"
              : "NONE";
        const revTrafficStatus = (reverseRouteStatus as string) === "PENDING_VERIFICATION" ? "WARNING" : reverseRouteStatus;

        const reverseDirectionMeta: FloodSegmentDirectionMeta = {
          ...floodDirectionMeta,
          directionCode: "B_TO_A",
          directionLabel: "ย้อนหลัก กม. (ขากลับ B → A)",
          affectedParts: reverseAffectedParts,
          trafficStatusDetail: (reverseRouteStatus as string) === "PENDING_VERIFICATION" ? "PENDING_VERIFICATION" : mapTrafficStatusToDetail(reverseRouteStatus),
          waterLevelKnown: reverseWaterLevelKnown,
          arrow_direction: "REVERSE",
          roadSide: "RIGHT",
          zeroConfirmedAt: reverseWaterLevelKnown && numRevWaterLevel === 0 ? new Date().toISOString() : null,
        };

        const res = await upsertRouteAction({
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
          try { await onDataRefresh(res.systemData); } catch { onToast("บันทึกแล้ว แต่ไม่สามารถโหลดข้อมูลล่าสุด กรุณารีเฟรชหน้าจอ"); }
          showSuccessModal(
            "บันทึกเหตุการณ์ ๒ ทิศทางสำเร็จ",
            `สร้างช่วงน้ำท่วม ทล.${chosenRouteNo} ทั้งขาไป (A→B) และขากลับ (B→A) ในเหตุการณ์เดียวกันเรียบร้อยแล้ว`
          );
          setRouteEditId("");
          setFieldImages([]);
          handleClearRoute();
          if (onClearEditingRoute) onClearEditingRoute();
          if (onNavigateToIncidents) onNavigateToIncidents();
        }
        return;
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
          ? {
            ...((routeEditId ? (systemData.detourRoutes || []).find((d) => d.id === routeEditId)?.detour_meta : undefined) || {}),
            forward_distance_m: detourDistanceMeters.forward || undefined,
            reverse_distance_m: detourDistanceMeters.reverse || undefined,
            show_arrows: true,
            verified_no_closed_overlap: closedRoadConflicts.length === 0,
            carriageway_type: separation?.isSymmetricSingleLine ? "SINGLE_CENTERLINE" : "ASYMMETRIC_DETOUR",
            eventId: linkedEventId,
          }
          : undefined,
      });

      if (res.success) {
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
                        [{ev.eventCode}] ทล.{ev.routeNo} ตอน{ev.sectionName} ({ev.segments.length} ช่วงย่อย)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300">รหัสเหตุการณ์ (Event Code)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const code = generateNextEventCode(routeNo || "42", existingParentEvents);
                        setEventCode(code);
                        onToast(`สร้างรหัสอัตโนมัติ: ${code}`);
                      }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-heading cursor-pointer"
                      title="สร้างรหัสเหตุการณ์อัตโนมัติตามสายทาง"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>⚡ สร้างอัตโนมัติ</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={eventCode}
                    onChange={(e) => setEventCode(e.target.value)}
                    placeholder="เช่น FL-42-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
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
            </div>
          )}

          {routeMode === "FLOOD" ? (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative" ref={highwayComboboxRef}>
                  <label className="text-xs text-slate-300">หมายเลขทางหลวง *</label>
                  <div
                    className="relative mt-1 flex cursor-pointer items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white hover:border-slate-600 focus-within:border-amber-400"
                    onClick={() => setIsHighwayDropdownOpen((prev) => !prev)}
                  >
                    <span className={`truncate ${!routeNo ? "text-slate-400" : "font-semibold text-amber-300"}`}>
                      {selectedHighwayName || (routeNo ? (availableHighways.find((h) => h.no === routeNo)?.name || `ทล.${routeNo}`) : "-- เลือกหมายเลขทางหลวง --")}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
                  </div>

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
                      <div className="overflow-y-auto max-h-52 divide-y divide-slate-850">
                        {(() => {
                          const query = highwaySearchQuery.trim().toLowerCase();
                          const filtered = availableHighways.filter(
                            (h) => h.no.toLowerCase().includes(query) || h.name.toLowerCase().includes(query)
                          );
                          if (filtered.length === 0) {
                            return (
                              <div className="p-3 text-center text-xs text-slate-500">
                                ไม่พบสายทางหลวงที่ตรงกับ &quot;{highwaySearchQuery}&quot;
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
                                }
                                if (h.kmStart) {
                                  setKmStart(h.kmStart);
                                }
                                if (h.kmEnd) {
                                  setKmEnd(h.kmEnd);
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
                routingRequest.current += 1;
                freePast.current = []; freeFuture.current = [];
                setFreeEditEnabled(true); setAdminPickMode(null); setFreeVertexTool("move");
              }}>
                <MapPinned className="h-4 w-4" /> ดัดเส้นอิสระ
              </ActionButton>
            </div>
            {freeEditEnabled && (
              <>
                {routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกทิศทางสำหรับดัดเส้น">
                    <ActionButton variant="secondary" active={freeEditTarget === "FORWARD"} onClick={() => { setFreeEditTarget("FORWARD"); setAdminPickMode(null); freePast.current=[]; freeFuture.current=[]; }}>ขาไป A → B</ActionButton>
                    <ActionButton variant="secondary" active={freeEditTarget === "REVERSE"} disabled={draftReverseCoordinates.length < 2} onClick={() => { setFreeEditTarget("REVERSE"); setAdminPickMode(null); freePast.current=[]; freeFuture.current=[]; }}>ขากลับ B → A</ActionButton>
                  </div>
                )}
                <ToolGroup label="แก้ไขจุดดัด (ใช้เครื่องมือเดียวกับแนวทางหลวง)">
                  <ActionButton variant="secondary" active={freeVertexTool === "move" && adminPickMode !== "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(null); }}>ลากจุดดัด</ActionButton>
                  <ActionButton variant="pick" active={adminPickMode === "ADD_LINE_VERTEX"} onClick={() => { setFreeVertexTool("move"); setAdminPickMode(adminPickMode === "ADD_LINE_VERTEX" ? null : "ADD_LINE_VERTEX"); }}>+ เพิ่มจุดดัดอิสระ</ActionButton>
                  <ActionButton variant="danger" active={freeVertexTool === "delete"} onClick={() => { setFreeVertexTool(freeVertexTool === "delete" ? "move" : "delete"); setAdminPickMode(null); }}>ลบจุดดัด</ActionButton>
                  <ActionButton variant="secondary" disabled={!freePast.current.length} onClick={() => undoFreeGeometry(false)}>ย้อนกลับ</ActionButton>
                  <ActionButton variant="secondary" disabled={!freeFuture.current.length} onClick={() => undoFreeGeometry(true)}>ทำซ้ำ</ActionButton>
                </ToolGroup>
                <p className="text-xs text-sky-200">ลากหมุดเล็กบนเส้นเพื่อย้ายจุด คลิกจุดกึ่งกลางเพื่อแทรก คลิกขวาเพื่อลบ หรือเลือกโหมดลบจุด ข้อมูลจะคงแนวเส้นอิสระตามที่บันทึก</p>
                {routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" && <p className="text-xs text-amber-200">แก้ขาไปและขากลับแยกกัน หากเส้นขากลับยังไม่มี ให้คำนวณแนวถนนก่อน</p>}
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
              onClick={() => triggerDualRoadSnapping(startLat, startLon, endLat, endLon, draftWaypoints)}
            >
              <Wand2 className="h-3.5 w-3.5" /> คำนวณเส้นเกาะถนน
            </ActionButton>

            {!freeEditEnabled && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ToolGroup label="ดัดแนวเส้น">
                <ActionButton variant="secondary" className="text-amber-300" onClick={handleAddMidpointWaypoint}>
                  <Plus className="h-3.5 w-3.5" /> แตะจุดกลางเส้นเพื่อเพิ่มจุด
                </ActionButton>
                <ActionButton variant="pick" active={adminPickMode === "ADD_WAYPOINT"} onClick={() => setAdminPickMode("ADD_WAYPOINT")}>
                  {adminPickMode === "ADD_WAYPOINT"
                    ? (forceStraightThrough && routeMode === "DETOUR" ? "คลิกกึ่งกลางแยก..." : "คลิกถนนเพื่อดัด...")
                    : (forceStraightThrough && routeMode === "DETOUR" ? "+ เพิ่มจุดผ่านแยกตรง" : "+ เพิ่มจุดดัดเส้น")}
                </ActionButton>
                {routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" && (
                  <ActionButton variant="pick" active={adminPickMode === "ADD_REVERSE_WAYPOINT"} onClick={() => setAdminPickMode("ADD_REVERSE_WAYPOINT")}>
                    {adminPickMode === "ADD_REVERSE_WAYPOINT" ? "คลิกถนนขากลับ B→A..." : "+ เพิ่มจุดขากลับ (B→A)"}
                  </ActionButton>
                )}
              </ToolGroup>

              <ToolGroup label="ย้อนกลับหรือล้าง">
                <ActionButton variant="secondary" onClick={handleUndoWaypoint}>
                  <Undo2 className="h-3.5 w-3.5" /> ย้อนกลับ
                </ActionButton>
                {originalRouteCoordinates.current.length >= 2 && (
                  <ActionButton variant="secondary" className="text-sky-300" onClick={handleRestoreOriginalRoute}>
                    คืนค่าแนวเดิม
                  </ActionButton>
                )}
                <ActionButton variant="danger" onClick={requestClearRoute}>
                  ล้างข้อมูลทั้งหมด
                </ActionButton>
              </ToolGroup>
            </div>}
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
          {!freeEditEnabled && routeMode === "DETOUR" && draftReverseWaypoints.length > 0 && (
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
          <FormSection step={3} tone="amber" title="คำแนะนำสำหรับประชาชน" description="ข้อความที่ประชาชนจะเห็นในหน้าหลัก แยกทิศทางขาไปและขากลับ">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-heading font-bold text-amber-300">
                  คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน
                </label>
                {/* Switch View Tabs */}
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-heading font-bold">
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("FORWARD")}
                    className={`px-2 py-0.5 rounded transition ${detourAdviceView === "FORWARD" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    🚗 ขาไป (A → B)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("REVERSE")}
                    className={`px-2 py-0.5 rounded transition ${detourAdviceView === "REVERSE" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    🚙 ขากลับ (B → A)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetourAdviceView("COMBINED")}
                    className={`px-2 py-0.5 rounded transition ${detourAdviceView === "COMBINED" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    📋 ทั้ง ๒ ทิศทาง
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateDetourAdviceClick}
                className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำ (ไป-กลับ)
              </button>
            </div>

            <textarea
              rows={8}
              value={
                detourAdviceView === "FORWARD"
                  ? extractDirectionalAdvice(detourDesc).forward
                  : detourAdviceView === "REVERSE"
                    ? extractDirectionalAdvice(detourDesc).reverse
                    : detourDesc
              }
              onChange={(e) => {
                const val = e.target.value;
                if (detourAdviceView === "FORWARD") {
                  const ext = extractDirectionalAdvice(detourDesc);
                  setDetourDesc(`=== ทิศทางขาไป: จุด A → จุด B ===\n${val}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${ext.reverse}`);
                } else if (detourAdviceView === "REVERSE") {
                  const ext = extractDirectionalAdvice(detourDesc);
                  setDetourDesc(`=== ทิศทางขาไป: จุด A → จุด B ===\n${ext.forward}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${val}`);
                } else {
                  setDetourDesc(val);
                }
              }}
              placeholder="วิเคราะห์คำแนะนำอัตโนมัติ หรือกรอกคำแนะนำทั้ง ๒ ทิศทาง..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 ประชาชนสามารถสลับทิศทางเดินทางได้ทันทีในหน้าหลัก</span>
              <button
                type="button"
                onClick={() => {
                  setDetourAdviceView((prev) => (prev === "FORWARD" ? "REVERSE" : prev === "REVERSE" ? "FORWARD" : "FORWARD"));
                }}
                className="text-amber-400 hover:underline flex items-center gap-1 font-heading"
              >
                <ArrowRightLeft className="w-3 h-3" /> สลับมุมมองทิศทาง
              </button>
            </div>
          </FormSection>
        )}

        {/* 4. Water Level, Status & Safety Measures (If Flood) */}
        {routeMode === "FLOOD" && (
          <FormSection step={3} title="สถานการณ์น้ำและมาตรการ" description="ทิศทาง ส่วนของถนน ระดับน้ำ สถานะจราจร ๕ สถานะ วันเวลา และภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ)">
            {/* Direction and Affected Road Parts */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">ทิศทางการเดินรถของช่วงน้ำท่วมนี้</label>
                  {!routeEditId && (
                    <button
                      type="button"
                      onClick={() => setIsDualDirectionMode((prev) => !prev)}
                      className={`text-[11px] font-heading font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                        isDualDirectionMode
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                          : "bg-slate-950 text-amber-300 border-amber-500/50 hover:bg-amber-950/40"
                      }`}
                    >
                      <span>⚡ {isDualDirectionMode ? "✓ โหมด ๒ ทิศทางเปิดอยู่" : "บันทึก ๒ ทิศทาง (A→B และ B→A) พร้อมกัน"}</span>
                    </button>
                  )}
                </div>

                {isDualDirectionMode ? (
                  <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-2.5 text-xs text-amber-200 space-y-1">
                    <div className="font-bold font-heading flex items-center gap-1.5 text-amber-300">
                      <span>⚡ โหมดบันทึกคู่ ๒ ทิศทางพร้อมกัน (Dual-Direction Quick Create)</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      ระบบจะสร้างช่วงน้ำท่วม ๒ รายการภายใต้เหตุการณ์เดียวกันอัตโนมัติ: รายการที่ ๑ สำหรับ<strong>ขาไป (A → B)</strong> และรายการที่ ๒ สำหรับ<strong>ขากลับ (B → A)</strong> พร้อมตัดเส้น Geometry ตามทิศทางจริง
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setDirectionCode("A_TO_B"); setRoadSide("LEFT"); }}
                      className={`p-2 rounded-xl border text-left transition ${directionCode === "A_TO_B" && roadSide === "LEFT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                    >
                      <span className="text-xs font-heading font-bold block">🚗 ฝั่งซ้ายทาง (ขาไป A → B)</span>
                      <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. เพิ่มขึ้น</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDirectionCode("B_TO_A"); setRoadSide("RIGHT"); }}
                      className={`p-2 rounded-xl border text-left transition ${directionCode === "B_TO_A" && roadSide === "RIGHT" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                    >
                      <span className="text-xs font-heading font-bold block">🚙 ฝั่งขวาทาง (ขากลับ B → A)</span>
                      <span className="text-[10px] text-slate-400">เดินรถทิศทาง กม. ลดลง</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDirectionCode("BOTH"); setRoadSide("BOTH"); }}
                      className={`p-2 rounded-xl border text-left transition ${directionCode === "BOTH" && roadSide === "BOTH" ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"}`}
                    >
                      <span className="text-xs font-heading font-bold block">↔️ ท่วมทั้งสองฝั่งจราจร</span>
                      <span className="text-[10px] text-slate-400">น้ำท่วมเต็มทั้งสองคันทาง</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-300 font-heading font-semibold">
                    ส่วนของถนนที่ได้รับผลกระทบ (เลือกได้หลายส่วนตามสภาพจริง) *
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
                        onClick={() => {
                          if (part.value === "ALL_LANES") {
                            setAffectedParts(isSelected ? ["UNSPECIFIED"] : ["ALL_LANES"]);
                          } else {
                            const filtered = affectedParts.filter((p) => p !== "ALL_LANES" && p !== "UNSPECIFIED");
                            if (isSelected) {
                              const next = filtered.filter((p) => p !== part.value);
                              setAffectedParts(next.length ? next : ["UNSPECIFIED"]);
                            } else {
                              setAffectedParts([...filtered, part.value]);
                            }
                          }
                        }}
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

              {(directionCode === "A_TO_B" || directionCode === "B_TO_A") && (
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

            {isDualDirectionMode ? (
              <div className="space-y-3">
                {/* Direction 1: Forward A -> B */}
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-xs text-amber-300">
                      🚗 ๑. ทิศทางตามหลัก กม. (ขาไป A → B)
                    </span>
                    <span className="text-[10px] text-slate-400">ฝั่งซ้ายของทางหลวง</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] text-slate-300">ระดับน้ำขาไป (ซม.) *</label>
                        <label className="flex items-center gap-1 text-[10px] text-amber-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!waterLevelKnown}
                            onChange={(e) => {
                              const unknown = e.target.checked;
                              setWaterLevelKnown(!unknown);
                              if (unknown) setRouteWaterLevel("");
                            }}
                            className="h-3 w-3 accent-amber-400"
                          />
                          <span>ไม่ทราบค่า</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        min={0}
                        disabled={!waterLevelKnown}
                        value={routeWaterLevel}
                        onChange={(e) => setRouteWaterLevel(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={waterLevelKnown ? "เช่น 30" : "ยังไม่ทราบระดับน้ำ"}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">สถานะจราจรขาไป</label>
                      <select
                        value={routeStatus}
                        onChange={(e: any) => setRouteStatus(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="PASSABLE">ผ่านได้ปกติ</option>
                        <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                        <option value="ONE_LANE">รถเล็กผ่านได้ ๑ ช่องทาง</option>
                        <option value="CLOSED">ผ่านไม่ได้</option>
                        <option value="WARNING">เฝ้าระวัง / ผ่านได้ด้วยความระมัดระวัง</option>
                        <option value="PENDING_VERIFICATION">รอตรวจสอบสถานะ</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Direction 2: Reverse B -> A */}
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-xs text-sky-300">
                      🚙 ๒. ทิศทางย้อนหลัก กม. (ขากลับ B → A)
                    </span>
                    <span className="text-[10px] text-slate-400">ฝั่งขวาของทางหลวง</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] text-slate-300">ระดับน้ำขากลับ (ซม.) *</label>
                        <label className="flex items-center gap-1 text-[10px] text-sky-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!reverseWaterLevelKnown}
                            onChange={(e) => {
                              const unknown = e.target.checked;
                              setReverseWaterLevelKnown(!unknown);
                              if (unknown) setReverseRouteWaterLevel("");
                            }}
                            className="h-3 w-3 accent-sky-400"
                          />
                          <span>ไม่ทราบค่า</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        min={0}
                        disabled={!reverseWaterLevelKnown}
                        value={reverseRouteWaterLevel}
                        onChange={(e) => setReverseRouteWaterLevel(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={reverseWaterLevelKnown ? "เช่น 15 (หรือระบุ 0)" : "ยังไม่ทราบระดับน้ำ"}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">สถานะจราจรขากลับ</label>
                      <select
                        value={reverseRouteStatus}
                        onChange={(e: any) => setReverseRouteStatus(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="PASSABLE">ผ่านได้ปกติ</option>
                        <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                        <option value="ONE_LANE">รถเล็กผ่านได้ ๑ ช่องทาง</option>
                        <option value="CLOSED">ผ่านไม่ได้</option>
                        <option value="WARNING">เฝ้าระวัง / ผ่านได้ด้วยความระมัดระวัง</option>
                        <option value="PENDING_VERIFICATION">รอตรวจสอบสถานะ</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs text-slate-300">ระดับน้ำท่วมผิวทาง (ซม.) *</label>
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
                    type="number"
                    min={0}
                    disabled={!waterLevelKnown}
                    value={routeWaterLevel}
                    onChange={(e) => setRouteWaterLevel(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder={waterLevelKnown ? "เช่น 35 (ระบุ 0 เมื่อน้ำแห้งแต่คงประวัติ)" : "ยังไม่ทราบระดับน้ำ (รอวัดหน้างาน)"}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono disabled:opacity-50"
                  />
                  {waterLevelKnown && Number(routeWaterLevel) === 0 && routeWaterLevel !== "" && (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      💡 ระดับน้ำ 0 ซม.: ระบบจะซ่อนเส้นน้ำท่วมจากแผนที่สถานการณ์ปัจจุบันโดยเก็บประวัติไว้ และ<strong>ไม่เปลี่ยนสถานะจราจรเป็นเปิดอัตโนมัติ</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-slate-300">สถานะสภาพการจราจร (๕ สถานะ)</label>
                  <select
                    value={routeStatus}
                    onChange={(e: any) => setRouteStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="PASSABLE">ผ่านได้ปกติ</option>
                    <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                    <option value="ONE_LANE">รถเล็กผ่านได้ ๑ ช่องทาง</option>
                    <option value="CLOSED">ผ่านไม่ได้</option>
                    <option value="WARNING">เฝ้าระวัง / ผ่านได้ด้วยความระมัดระวัง</option>
                    <option value="PENDING_VERIFICATION">รอตรวจสอบสถานะ</option>
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
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="เช่น หมวดทางหลวงหนองจิก / เจ้าหน้าที่ศูนย์ฯ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
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
                  ภาพถ่ายหน้างาน (สูงสุด ๕ ภาพ บีบอัดอัตโนมัติ ≤ 300 KB ต่อภาพ)
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
                      <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-slate-400">
                        <div className="flex items-center justify-between">
                          <span>{i === 0 ? "ภาพหลัก" : `ภาพที่ ${i + 1}`}</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {(photo.sizeBytes / 1024).toFixed(0)} KB
                            <span className="text-[9px] text-sky-300 ml-1 uppercase">({photo.format || "img"})</span>
                          </span>
                        </div>
                        {photo.originalSizeBytes && photo.originalSizeBytes > photo.sizeBytes && (
                          <div className="text-[9px] text-slate-500 font-mono text-right">
                            ลดจาก {(photo.originalSizeBytes / (1024 * 1024)).toFixed(1)} MB (-{Math.round((1 - photo.sizeBytes / photo.originalSizeBytes) * 100)}%)
                          </div>
                        )}
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

