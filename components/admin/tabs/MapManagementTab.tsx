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
} from "lucide-react";
import { upsertRouteAction, snapRouteAction } from "@/app/actions/doh-actions";
import {
  fetchOsrmWithFailover,
  generateAutoDetourAdvice,
  extractDirectionalAdvice,
  reverseGeocodeTambonAmphoe,
  compressImageToBase64,
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
  const [roadSide, setRoadSide] = useState<RoadSideType>("BOTH");
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

  // Sync with editingRoute prop
  useEffect(() => {
    if (!editingRoute) return;
    const { type, id } = editingRoute;
    setRouteMode(type);
    setRouteEditId(id);

    if (type === "FLOOD") {
      const flood = systemData.floodRoutes.find((r) => r.id === id);
      if (!flood) return;
      setRouteNo(flood.route_no);
      setKmStart(flood.km_start);
      setKmEnd(flood.km_end);
      setSectionName(flood.section_name);
      sectionNameManuallyEdited.current = true;
      setRouteWaterLevel(flood.water_level_cm);
      setRouteStatus(flood.traffic_status);
      setRoadSide((flood.road_side as RoadSideType) || "BOTH");
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
      setFieldImages(flood.latest_photo_url ? [flood.latest_photo_url] : []);
    } else {
      const detour = systemData.detourRoutes.find((r) => r.id === id);
      if (!detour) return;
      setDetourRefId(detour.flood_id_ref || "");
      setDetourName(detour.route_name);
      setDetourDesc(detour.description || "");
      setDetourDirectionMode((detour.direction_mode as DetourDirectionModeType) || "TWO_WAY");
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

  // Listen to pickedCoordinate from map
  useEffect(() => {
    if (!pickedCoordinate) return;

    if (pickedCoordinate.mode === "PICK_START") {
      setStartLat(pickedCoordinate.lat);
      setStartLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดเริ่มต้น (A): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "START");
      if (endLat && endLon) setDraftCoordinates([[pickedCoordinate.lon, pickedCoordinate.lat], [Number(endLon), Number(endLat)]]);
    } else if (pickedCoordinate.mode === "PICK_END") {
      setEndLat(pickedCoordinate.lat);
      setEndLon(pickedCoordinate.lon);
      setAdminPickMode(null);
      onToast(`กำหนดจุดสิ้นสุด (B): ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      handleAutoGeocode(pickedCoordinate.lon, pickedCoordinate.lat, "END");
      if (startLat && startLon) setDraftCoordinates([[Number(startLon), Number(startLat)], [pickedCoordinate.lon, pickedCoordinate.lat]]);
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
          setSnappingStatusText(
            detourDirectionMode === "TWO_WAY"
              ? `✓ คำนวณทางเลี่ยง A→B (${pickedAB.coords.length} จุด) และ B→A (${pickedBA.coords.length} จุด) สำเร็จ — ปลอดจุดปิดจราจร`
              : `✓ คำนวณทางเลี่ยงตามถนนสำเร็จ (${forwardCoords.length} จุด) — ปลอดจุดปิดจราจร`
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
    setRoadSide("BOTH");
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
    setSaveAsDraft(false);
    setForceStraightThrough(false);
    originalRouteCoordinates.current = [];
    onDraftPickMarkersChange?.([]);
    onToast("ล้างเส้นทางร่างและแบบฟอร์มแล้ว");
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

  // Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    onToast(`กำลังประมวลผลรูปภาพ ${files.length} ไฟล์...`);
    const newBase64s: string[] = [];

    for (let i = 0; i < Math.min(files.length, 10); i++) {
      try {
        const compressed = await compressImageToBase64(files[i], 1280, 0.7);
        newBase64s.push(compressed);
      } catch {
        // ignore single failed image
      }
    }

    setFieldImages((prev) => [...prev, ...newBase64s].slice(0, 10));
    onToast(`เพิ่มภาพถ่ายหน้างานสำเร็จ (${newBase64s.length} รูป)`);
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

      const chosenRouteNo = routeNo || (availableHighways[0]?.no || "43");
      const separation = routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" && draftReverseCoordinates.length >= 2
        ? analyzeCarriagewaySeparation(coords, draftReverseCoordinates)
        : null;

      const res = await upsertRouteAction({
        id: routeEditId || undefined,
        recordType: routeMode,
        routeNo: chosenRouteNo,
        kmStart,
        kmEnd,
        sectionName: sectionName || "จุดรายงานน้ำท่วม",
        waterLevelCm: waterLevelKnown ? numWaterLevel : 0,
        trafficStatus: routeStatus,
        detourRefId,
        detourName: detourName || "เส้นทางเลี่ยงน้ำท่วม",
        detourDesc,
        isActive: !saveAsDraft,
        latStart: numSLat || undefined,
        lonStart: numSLon || undefined,
        latEnd: numELat || undefined,
        lonEnd: numELon || undefined,
        coordinates: coords,
        latestPhotoUrl: fieldImages[0] || undefined,
        // Item 3: Flood Directional & Lane-Specific Fields
        roadSide: routeMode === "FLOOD" ? roadSide : undefined,
        affectedLanes: routeMode === "FLOOD" ? affectedLanes : undefined,
        affectedShoulder: routeMode === "FLOOD" ? affectedShoulder : undefined,
        reporterName: routeMode === "FLOOD" ? (reporterName.trim() || "เจ้าหน้าที่แขวงทางหลวงปัตตานี") : undefined,
        directionMeta: routeMode === "FLOOD"
          ? {
            arrow_direction: roadSide === "LEFT" ? "FORWARD" : roadSide === "RIGHT" ? "REVERSE" : roadSide === "BOTH" ? "TWO_WAY" : "UNKNOWN",
            show_arrows: roadSide === "LEFT" || roadSide === "RIGHT",
            carriageway_type: useCarriagewaySnapping ? "DUAL_CARRIAGEWAY" : "SINGLE_CENTERLINE",
            water_level_known: waterLevelKnown,
          }
          : undefined,
        // Item 4: Detour Bidirectional & Asymmetric Fields
        reverseCoordinates: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? draftReverseCoordinates : undefined,
        reverseWaypoints: routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY" ? draftReverseWaypoints : undefined,
        directionMode: routeMode === "DETOUR" ? detourDirectionMode : undefined,
        detourMeta: routeMode === "DETOUR"
          ? {
            forward_distance_m: detourDistanceMeters.forward || undefined,
            reverse_distance_m: detourDistanceMeters.reverse || undefined,
            show_arrows: true,
            verified_no_closed_overlap: closedRoadConflicts.length === 0,
            carriageway_type: separation?.isSymmetricSingleLine ? "SINGLE_CENTERLINE" : "ASYMMETRIC_DETOUR",
          }
          : undefined,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
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
          {routeMode === "FLOOD" ? (
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

          {/* Waypoint Operations & Midpoint Insertion */}
          {routeMode === "DETOUR" && (
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>
          </div>
          {draftWaypoints.length > 0 && (
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
          {routeMode === "DETOUR" && draftReverseWaypoints.length > 0 && (
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
          <FormSection step={3} title="สถานการณ์น้ำและมาตรการ" description="ฝั่งถนน ช่องจราจร ระดับน้ำ สถานะการจราจร มาตรการความปลอดภัย และภาพถ่ายหน้างาน">
            {/* Item 3: Directional Road Side & Lane-Specific Reporting */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ฝั่งถนนที่เกิดน้ำท่วม (อ้างอิงทิศ กม. เพิ่มขึ้น)</label>
                  <select
                    value={roadSide}
                    onChange={(e) => setRoadSide(e.target.value as RoadSideType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-semibold"
                  >
                    {ROAD_SIDE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ช่องจราจรที่ได้รับผลกระทบ</label>
                  <select
                    value={affectedLanes}
                    onChange={(e) => setAffectedLanes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {AFFECTED_LANES_OPTIONS.map((lane) => (
                      <option key={lane} value={lane}>
                        {lane}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">ไหล่ทางที่ได้รับผลกระทบ</label>
                  <select
                    value={affectedShoulder}
                    onChange={(e) => setAffectedShoulder(e.target.value as AffectedShoulderType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {AFFECTED_SHOULDER_OPTIONS.map((sh) => (
                      <option key={sh.value} value={sh.value}>
                        {sh.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(roadSide === "LEFT" || roadSide === "RIGHT") && (
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
                <label className="text-xs text-slate-300">สถานะสภาพการจราจร</label>
                <select
                  value={routeStatus}
                  onChange={(e: any) => setRouteStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="PASSABLE">ผ่านได้ปกติ</option>
                  <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                  <option value="ONE_LANE">รถเล็กผ่านได้ ๑ ช่องทาง</option>
                  <option value="CLOSED">ผ่านไม่ได้</option>
                  <option value="WARNING">เฝ้าระวัง</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300">มาตรการอำนวยความปลอดภัย</label>
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
                <label className="text-xs text-slate-300">ผู้รายงาน / หมวดทางหลวง</label>
                <input
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="เช่น หมวดทางหลวงหนองจิก / เจ้าหน้าที่ศูนย์ฯ"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            {/* Image Upload Gallery */}
            <div>
              <label className="text-xs text-slate-300 block mb-1">
                ภาพถ่ายหน้างาน (ไม่เกิน ๑๐ ภาพ บีบอัดอัตโนมัติ &lt; 300KB)
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 rounded-xl p-3 flex items-center gap-2 cursor-pointer text-xs text-amber-300">
                  <Camera className="w-4 h-4" />
                  <span>เลือกรูปภาพจากเครื่อง / มือถือ</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-400">เลือกแล้ว {fieldImages.length} รูป</span>
              </div>

              {fieldImages.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                  {fieldImages.map((img, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-slate-700 h-16">
                      <img src={img} className="w-full h-full object-cover" alt="field" />
                      <button
                        type="button"
                        onClick={() => setFieldImages(fieldImages.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded p-0.5 text-[10px]"
                      >
                        ×
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

