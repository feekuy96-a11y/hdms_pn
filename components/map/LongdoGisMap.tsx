"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload, FloodRoute, DetourRoute, TimelineUpdate, DohOfficeLocation } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { Layers, Navigation, Building2, Map, ChevronUp, ChevronDown } from "lucide-react";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] || character));

const formatKmPost = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("+")) return raw;
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return raw;
  const meters = Math.round(Number.isInteger(numeric) && numeric >= 1000 ? numeric : numeric * 1000);
  const km = Math.floor(meters / 1000);
  const post = Math.round(meters % 1000).toString().padStart(3, "0");
  return `${km}+${post}`;
};

const trafficStatusLabel = (status: unknown) => ({
  PASSABLE: "ผ่านได้ปกติ",
  LIGHT_VEHICLES_ONLY: "รถเล็กผ่านได้",
  ONE_LANE: "รถเล็กผ่านได้ ๑ ช่องทาง",
  CLOSED: "ผ่านไม่ได้",
  WARNING: "เฝ้าระวัง",
}[String(status)] || "ไม่ระบุสถานะ");

/**
 * ปรับพิกัดให้เป็น [Latitude, Longitude] สำหรับ Leaflet เสมอ
 * ป้องกันพิกัดสลับที่ทำให้ละติจูดพุ่งขึ้นไป 101 องศาลงทะเล
 */
function toLeafletLatLng(coord: [number, number]): [number, number] {
  if (!coord || coord.length < 2) return [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon];
  const [val1, val2] = coord;
  // ในประเทศไทย: Lat อยู่ระหว่าง 5 - 21 N, Lon อยู่ระหว่าง 97 - 106 E
  if (val1 > 50 && val2 < 30) {
    return [val2, val1];
  }
  return [val1, val2];
}

// Stable empty defaults. Using `= []` in destructured props creates a NEW array on every
// render, which made every overlay effect re-run on every render of the map component.
const EMPTY_COORDS: [number, number][] = [];
const EMPTY_LINES: [number, number][][] = [];
const EMPTY_PICK_MARKERS: { lat: number; lon: number; label: string; mode: string }[] = [];

const MAX_VISIBLE_SHIELDS = 200;
const MAX_VERTEX_HANDLES = 400;

interface ShieldCandidate {
  code: string;
  name: string;
  latlng: [number, number];
  isMain: boolean;
}

interface FloodLineEntry {
  line: any;
  baseWeight: number;
}

const routeCodeOf = (props: any) => props?.route_no || props?.route_code || props?.ROAD_NO || props?.route || props?.code || "";
const routeNameOf = (props: any) => props?.section_name || props?.route_name || props?.ROAD_NAME || props?.section || props?.name || "ทางหลวง";

function geoJsonFeatures(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data.features)) return data.features;
  if (data.type === "Feature") return [data];
  return [];
}

function parseRouteCoordinates(value: unknown): [number, number][] {
  if (Array.isArray(value)) return value as [number, number][];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function lineAnimationClasses(style: { animation?: string; animationSpeed?: string } | undefined, allow: boolean): string {
  const animation = allow && style?.animation === "chaser" ? "doh-line-chaser"
    : allow && style?.animation === "pulse" ? "doh-line-pulse"
    : allow && style?.animation === "blink" ? "doh-line-blink"
    : allow && style?.animation === "arrows" ? "doh-line-arrows"
    : "";
  const speed = style?.animationSpeed === "slow" ? "doh-anim-slow" : style?.animationSpeed === "fast" ? "doh-anim-fast" : "";
  return `${animation} ${speed}`.trim();
}

function dashArrayFor(style: { pattern?: string; dashArray?: string } | undefined): string | undefined {
  return style?.pattern === "dash" ? (style.dashArray || "8, 6")
    : style?.pattern === "dot" ? "2, 6"
    : style?.pattern === "long-dash-dot" ? "14, 6, 3, 6"
    : undefined;
}

// Bring path layers of the given groups to the top of the shared canvas, in the order given.
// Highway lines are never touched, so they stay at the bottom without re-sorting thousands of paths.
function raisePathLayers(...groups: any[]) {
  groups.forEach((group) => {
    group?.eachLayer?.((layer: any) => {
      if (typeof layer.bringToFront === "function") layer.bringToFront();
    });
  });
}

// ---- Popup HTML builders (called lazily, only when a popup is actually opened) ----

function buildHighwayPopupHtml(props: any, featureIsMain: boolean, color: string): string {
  const code = routeCodeOf(props);
  const name = routeNameOf(props);
  const lengthKm = props.length_km || "";
  return `
    <div class="text-xs p-2.5 min-w-[270px] font-body bg-slate-950 text-white rounded-xl border-2 shadow-2xl" style="border-color: ${color}">
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 gap-2">
        <span class="text-white text-base font-bold font-heading tracking-wide">
          ${code ? `ทล.${escapeHtml(code)} ` : ""}${escapeHtml(name)}
        </span>
      </div>
      <div class="mt-2">
        ${props.km_start !== undefined && props.km_start !== null && String(props.km_start).trim() !== "" ? `<p class="text-amber-300 text-[11px] mt-0.5 font-mono">ระหว่าง กม.${escapeHtml(formatKmPost(props.km_start))}${props.km_end !== undefined && props.km_end !== null && String(props.km_end).trim() !== "" ? ` ถึง กม.${escapeHtml(formatKmPost(props.km_end))}` : ""}</p>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
        <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[10px]">ระยะทาง</span>
          <strong class="text-amber-400 font-mono">${lengthKm ? `${escapeHtml(lengthKm)} กม.` : "ตามโครงข่าย"}</strong>
        </div>
        <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[10px]">ช่องจราจร</span>
          <strong class="text-sky-400 font-mono text-[10px]">${escapeHtml(props.lanes || "๔ ช่องจราจร")}</strong>
        </div>
        <div class="col-span-2 mt-0.5 rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1.5 text-center text-[10px] font-semibold text-amber-300">
          ${featureIsMain ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
        </div>
      </div>
    </div>
  `;
}

function buildDetourPopupHtml(detour: DetourRoute, color: string): string {
  return `
    <div class="text-xs p-2.5 min-w-[240px] font-body bg-slate-950 text-white rounded-xl border" style="border-color: ${color}">
      <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
        <span style="color:${color}" aria-hidden="true">↪</span>
        <h4 class="font-bold text-white text-sm font-heading">${escapeHtml(detour.route_name)}</h4>
      </div>
      <p class="text-slate-300 mt-2 whitespace-pre-wrap">${escapeHtml(detour.description || "ยังไม่มีคำแนะนำการเดินทาง")}</p>
      <div class="mt-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] text-amber-300">${detour.flood_id_ref ? "เชื่อมโยงกับเหตุการณ์น้ำท่วม" : "ทางเลี่ยงอิสระ"}</div>
    </div>
  `;
}

function buildFloodPopupHtml(flood: FloodRoute, updates: TimelineUpdate[]): string {
  const levels = updates.map((update) => update.water_level_cm);
  const minLevel = levels.length ? Math.min(...levels) : 0;
  const maxLevel = levels.length ? Math.max(...levels) : 0;
  const yFor = (level: number) => 48 - (maxLevel === minLevel ? 24 : ((level - minLevel) / (maxLevel - minLevel)) * 40);
  const xFor = (index: number) => updates.length < 2 ? 10 : 8 + (index * 104) / (updates.length - 1);
  const chartPoints = updates.map((update, index) => {
    const time = new Date(update.reported_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    return `<circle cx="${xFor(index)}" cy="${yFor(update.water_level_cm)}" r="2.5" fill="#f59e0b"><title>${escapeHtml(time)} · ${update.water_level_cm} ซม.</title></circle>`;
  }).join("");
  const linePoints = updates.map((update, index) => `${xFor(index)},${yFor(update.water_level_cm)}`).join(" ");
  return `<div style="width:250px;color:#0f172a;font-family:Sarabun,sans-serif"><strong>ทล.${escapeHtml(flood.route_no)} ${escapeHtml(flood.section_name)}</strong><div style="font-size:12px;margin-top:3px">ระหว่าง กม.${escapeHtml(formatKmPost(flood.km_start))} ถึง กม.${escapeHtml(formatKmPost(flood.km_end))}</div>${flood.latest_photo_url ? `<img src="${escapeHtml(flood.latest_photo_url)}" alt="ภาพสถานการณ์" style="width:100%;height:108px;object-fit:cover;border-radius:8px;margin-top:7px"/>` : ""}<div style="margin-top:7px;font-size:13px"><b>ระดับน้ำล่าสุด ${flood.water_level_cm} ซม.</b> · ${escapeHtml(trafficStatusLabel(flood.traffic_status))}</div>${updates.length ? `<svg viewBox="0 0 120 56" style="width:100%;height:80px;margin-top:4px"><line x1="8" y1="48" x2="112" y2="48" stroke="#cbd5e1"/><polyline points="${linePoints}" fill="none" stroke="#f59e0b" stroke-width="2"/>${chartPoints}</svg><div style="font-size:10px;color:#64748b">ชี้ที่จุดกราฟเพื่อดูเวลาและระดับน้ำ</div>` : `<div style="font-size:11px;color:#64748b;margin-top:3px">ยังไม่มีข้อมูลระดับน้ำย้อนหลัง</div>`}</div>`;
}

function buildOfficePopupHtml(office: DohOfficeLocation): string {
  const isHq = office.type === "HEADQUARTERS";
  return `
    <div class="text-xs p-1 min-w-[220px] font-body text-slate-100">
      <div class="flex items-center gap-1.5 mb-1">
        <span class="bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded font-heading">
          ${isHq ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
        </span>
      </div>
      <h4 class="font-bold text-white text-sm font-heading">${escapeHtml(office.name)}</h4>
      <p class="text-slate-300 text-[11px] mt-1">${escapeHtml(office.address)}</p>
      <div class="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between">
        <a href="tel:${String(office.phone ?? "").replace(/[^0-9]/g, "")}" class="text-amber-300 hover:underline font-bold text-xs flex items-center gap-1">
          📞 ${escapeHtml(office.phone)}
        </a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lon}" target="_blank" rel="noopener noreferrer" class="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-amber-400">
          นำทาง
        </a>
      </div>
    </div>
  `;
}
interface LongdoGisMapProps {
  systemData: SystemDataPayload;
  selectedFloodId: string;
  onSelectFlood: (id: string) => void;
  adminPickMode?: string | null;
  onCoordinatePicked?: (lat: number, lon: number, mode: string) => void;
  draftCoordinates?: [number, number][];
  draftWaypoints?: [number, number][];
  draftPickMarkers?: { lat: number; lon: number; label: string; mode: string }[];
  onWaypointDragged?: (index: number, newCoord: [number, number]) => void;
  /** Freeform line editor (Google My Maps style): show draggable handles on every vertex of the draft line. */
  vertexEditable?: boolean;
  onVertexMoved?: (index: number, newCoord: [number, number]) => void;
  onVertexInserted?: (index: number, coord: [number, number]) => void;
  onVertexClicked?: (index: number, via: "click" | "contextmenu") => void;
  onOfficeDragged?: (officeId: string, newPosition: { lat: number; lon: number }) => void;
  editableOfficeId?: string | null;
  draftMode?: "FLOOD" | "DETOUR";
  focusCoordinates?: [number, number] | null;
  incomingGisLines?: [number, number][][];
  className?: string;
  publicMode?: boolean;
  isSidebarCollapsed?: boolean;
}

export function LongdoGisMap({
  systemData,
  selectedFloodId,
  onSelectFlood,
  adminPickMode = null,
  onCoordinatePicked,
  draftCoordinates = EMPTY_COORDS,
  draftWaypoints = EMPTY_COORDS,
  draftPickMarkers = EMPTY_PICK_MARKERS,
  onWaypointDragged,
  vertexEditable = false,
  onVertexMoved,
  onVertexInserted,
  onVertexClicked,
  onOfficeDragged,
  editableOfficeId = null,
  draftMode = "FLOOD",
  focusCoordinates = null,
  incomingGisLines = EMPTY_LINES,
  className = "h-full w-full",
  publicMode = false,
  isSidebarCollapsed = false,
}: LongdoGisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const highwayGroupRef = useRef<any>(null);
  const shieldGroupRef = useRef<any>(null);
  const detourGroupRef = useRef<any>(null);
  const floodGroupRef = useRef<any>(null);
  const draftGroupRef = useRef<any>(null);
  const draftLineRef = useRef<any>(null);
  const vertexGroupRef = useRef<any>(null);
  const officeGroupRef = useRef<any>(null);
  const floodLinesRef = useRef<Record<string, FloodLineEntry>>({});
  const baseLayersRef = useRef<Record<string, any>>({});
  const currentBaseKeyRef = useRef<string>("longdo");

  const [activeBaseMap, setActiveBaseMap] = useState<"road" | "sat" | "longdo">("longdo");
  const [isLayerControlCollapsed, setIsLayerControlCollapsed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showDetourLayer, setShowDetourLayer] = useState(true);
  const [showMainHwy, setShowMainHwy] = useState(true);
  const [showSecHwy, setShowSecHwy] = useState(true);
  const [showHighwayShields, setShowHighwayShields] = useState(false);
  const [showOffices, setShowOffices] = useState(true);
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [legendRouteList, setLegendRouteList] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const mapStyles = systemData.mapStyles || DEFAULT_MAP_STYLES;
  const legendRoutes = (type: "MAIN_HIGHWAY" | "SECOND_HIGHWAY") => {
    const routes = new globalThis.Map<string, string>();
    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible) return;
      (layer.geojson_data?.features || []).forEach((feature: any) => {
        const props = feature.properties || {};
        const featureType = props.highway_type || (layer.layer_id === "SECOND_HIGHWAY" ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY");
        const code = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
        const name = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "ไม่ระบุชื่อตอน";
        if (featureType === type && props.is_visible !== false && code) {
          routes.set(`${String(code)}::${String(name)}`, String(name));
        }
      });
    });
    return [...routes.entries()]
      .map(([key, name]) => ({ code: key.split("::")[0], name }))
      .sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }) || a.name.localeCompare(b.name, "th"));
  };

  // Sync dynamic CSS variables on root when mapStyles update
  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      const styles = systemData.mapStyles || DEFAULT_MAP_STYLES;
      if (styles.flood?.color) root.style.setProperty("--doh-color-flood", styles.flood.color);
      if (styles.detour?.color) root.style.setProperty("--doh-color-detour", styles.detour.color);
      if (styles.primary?.color) root.style.setProperty("--doh-color-primary", styles.primary.color);
      if (styles.secondary?.color) root.style.setProperty("--doh-color-secondary", styles.secondary.color);
    }
  }, [systemData.mapStyles]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncAnimationState = () => setAnimationsEnabled(!document.hidden && !media.matches);
    syncAnimationState();
    document.addEventListener("visibilitychange", syncAnimationState);
    media.addEventListener?.("change", syncAnimationState);
    return () => {
      document.removeEventListener("visibilitychange", syncAnimationState);
      media.removeEventListener?.("change", syncAnimationState);
    };
  }, []);

  // Sync refs to avoid stale closures in Leaflet events
  const adminPickModeRef = useRef(adminPickMode);
  adminPickModeRef.current = adminPickMode;
  const onCoordinatePickedRef = useRef(onCoordinatePicked);
  onCoordinatePickedRef.current = onCoordinatePicked;
  const onWaypointDraggedRef = useRef(onWaypointDragged);
  onWaypointDraggedRef.current = onWaypointDragged;
  const onOfficeDraggedRef = useRef(onOfficeDragged);
  onOfficeDraggedRef.current = onOfficeDragged;
  const onVertexMovedRef = useRef(onVertexMoved);
  onVertexMovedRef.current = onVertexMoved;
  const onVertexInsertedRef = useRef(onVertexInserted);
  onVertexInsertedRef.current = onVertexInserted;
  const onVertexClickedRef = useRef(onVertexClicked);
  onVertexClickedRef.current = onVertexClicked;
  const onSelectFloodRef = useRef(onSelectFlood);
  onSelectFloodRef.current = onSelectFlood;
  const selectedFloodIdRef = useRef(selectedFloodId);
  selectedFloodIdRef.current = selectedFloodId;

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;
      if (leafletMapRef.current) return;

      try {
        const leafletModule = await import("leaflet");
        const L = (leafletModule as any).default?.map
          ? (leafletModule as any).default
          : (leafletModule as any);

        if (!isMounted || !mapContainerRef.current) return;

        const sharedRenderer = L.canvas({ padding: 0.5, tolerance: 10 });

        // Clean up previous leaflet id on DOM element to prevent "Map container is already initialized" error
        if ((mapContainerRef.current as any)._leaflet_id) {
          delete (mapContainerRef.current as any)._leaflet_id;
        }

        const map = L.map(mapContainerRef.current, {
          center: [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon],
          zoom: APP_CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
          fadeAnimation: false,
          // One shared canvas renderer for every vector layer (created once, never per redraw).
          renderer: sharedRenderer,
        });

        const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY;

        const baseLayers = {
          road: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap • ขท.ปัตตานี",
          }),
          sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles © Esri • ขท.ปัตตานี",
          }),
          longdo: L.tileLayer(
            `https://ms.longdo.com/mmmap/tile.php?zoom={z}&x={x}&y={y}&key=${longdoKey}&proj=epsg3857&mode=icons`,
            {
              maxZoom: 19,
              attribution: "© Longdo Map / ขท.ปัตตานี",
            }
          ),
        };

        baseLayers.longdo.addTo(map);
        baseLayersRef.current = baseLayers;
        leafletMapRef.current = map;

        leafletRef.current = L;
        rendererRef.current = sharedRenderer;
        highwayGroupRef.current = L.layerGroup().addTo(map);
        detourGroupRef.current = L.layerGroup().addTo(map);
        floodGroupRef.current = L.layerGroup().addTo(map);
        draftGroupRef.current = L.layerGroup().addTo(map);
        vertexGroupRef.current = L.layerGroup().addTo(map);
        officeGroupRef.current = L.layerGroup().addTo(map);
        shieldGroupRef.current = L.layerGroup().addTo(map);

        setMapReady(true);

        // Invalidate size multiple times to ensure full canvas coverage across viewports
        [100, 300, 600, 1000].forEach((delay) => {
          setTimeout(() => {
            if (map) map.invalidateSize();
          }, delay);
        });

        // Handle map clicks for coordinate picking
        map.on("click", (e: any) => {
          if (!adminPickModeRef.current) return;
          const lat = Number(e.latlng.lat.toFixed(6));
          const lon = Number(e.latlng.lng.toFixed(6));
          onCoordinatePickedRef.current?.(lat, lon, adminPickModeRef.current);
        });
      } catch (err) {
        console.error("[LongdoGisMap] Failed to initialize Leaflet map:", err);
      }
    }

    initMap();

    return () => {
      isMounted = false;
      setMapReady(false);
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {}
        leafletMapRef.current = null;
      }
      leafletRef.current = null;
      rendererRef.current = null;
      highwayGroupRef.current = null;
      detourGroupRef.current = null;
      floodGroupRef.current = null;
      draftGroupRef.current = null;
      draftLineRef.current = null;
      vertexGroupRef.current = null;
      officeGroupRef.current = null;
      shieldGroupRef.current = null;
      floodLinesRef.current = {};
    };
  }, []);

  // Responsive Container Resize Observer & Sidebar Toggle Invalidator
  useEffect(() => {
    if (!leafletMapRef.current) return;
    const timers = [50, 150, 300, 500].map((delay) =>
      setTimeout(() => {
        leafletMapRef.current?.invalidateSize();
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!mapContainerRef.current || !leafletMapRef.current) return;
    const ro = new ResizeObserver(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    });
    ro.observe(mapContainerRef.current);

    const handleWindowResize = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [mapReady]);

  // 2. FlyTo focus when coordinates change
  useEffect(() => {
    if (leafletMapRef.current && focusCoordinates) {
      leafletMapRef.current.flyTo(toLeafletLatLng(focusCoordinates) as any, 13, { duration: 1.2 });
    }
  }, [focusCoordinates]);

  // Coordinate editing has priority over feature inspection. The cursor is also
  // restored reliably when the operator exits the edit command.
  useEffect(() => {
    const container = leafletMapRef.current?.getContainer?.();
    if (!container) return;
    container.style.cursor = adminPickMode ? "crosshair" : "";
    if (adminPickMode) leafletMapRef.current?.closePopup?.();
    return () => { container.style.cursor = ""; };
  }, [adminPickMode]);

  // 3. Switch Base Map Tile
  const switchBaseMap = (key: "road" | "sat" | "longdo") => {
    const map = leafletMapRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers[key]) return;

    if (baseLayers[currentBaseKeyRef.current]) {
      map.removeLayer(baseLayers[currentBaseKeyRef.current]);
    }
    baseLayers[key].addTo(map);
    currentBaseKeyRef.current = key;
    setActiveBaseMap(key);
  };

  const resetCamera = () => {
    if (!leafletMapRef.current) return;
    leafletMapRef.current.setView([APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon], APP_CONFIG.DEFAULT_ZOOM);
  };

  // 4. Overlay layers
  // Each layer group below redraws ONLY when its own data/toggles change. Previously one effect
  // cleared and rebuilt everything (all highways, floods, detours, drafts, labels) on every zoom,
  // click, drag or selection, and created a brand-new <canvas> renderer each time.
  const highwayFeatureCount = useMemo(
    () => (systemData.highwayLayers || []).reduce((count, layer) => count + geoJsonFeatures(layer.geojson_data).length, 0),
    [systemData.highwayLayers]
  );
  const animatedRouteCount = useMemo(
    () => (systemData.floodRoutes || []).filter((route) => route.is_active).length + (systemData.detourRoutes || []).filter((route) => route.is_active).length,
    [systemData.floodRoutes, systemData.detourRoutes]
  );
  const allowLineAnimation = animationsEnabled && highwayFeatureCount <= 250 && animatedRouteCount <= 80;
  // Read through a ref so hiding/showing the browser tab (which flips animationsEnabled) does not
  // rebuild every layer. Note: Leaflet ignores className for canvas-rendered paths anyway.
  const allowLineAnimationRef = useRef(allowLineAnimation);
  allowLineAnimationRef.current = allowLineAnimation;

  const shieldCandidates = useMemo<ShieldCandidate[]>(() => {
    const items: ShieldCandidate[] = [];
    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible) return;
      const layerIsMain = layer.layer_id === "MAIN_HIGHWAY";
      geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
        const props = feature?.properties || {};
        if (props.is_visible === false) return;
        const geometry = feature?.geometry;
        const code = routeCodeOf(props);
        if (!code || !geometry || !["LineString", "MultiLineString"].includes(geometry.type)) return;
        const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : layerIsMain;
        const line = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat(1);
        const midpoint = line[Math.floor(line.length / 2)];
        if (!midpoint) return;
        items.push({ code: String(code), name: String(routeNameOf(props)), latlng: toLeafletLatLng(midpoint), isMain: featureIsMain });
      });
    });
    return items;
  }, [systemData.highwayLayers]);

  // 4a. Highway network (the heaviest layer) - independent from drafts, zoom, selection and picking.
  useEffect(() => {
    const L = leafletRef.current;
    const group = highwayGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    const renderer = rendererRef.current;

    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible || !layer.geojson_data) return;
      const isMain = layer.layer_id === "MAIN_HIGHWAY";
      const style = isMain ? mapStyles.primary : mapStyles.secondary;
      const color = style?.color || (isMain ? "#1B5E20" : "#0284c7");
      const weight = style?.weight || (isMain ? 5 : 3.5);
      const opacity = style?.opacity ?? 0.85;
      const className = lineAnimationClasses(style, allowLineAnimationRef.current);

      try {
        const geoLayer = L.geoJSON(layer.geojson_data, {
          renderer,
          filter: (feature: any) => {
            const type = feature?.properties?.highway_type;
            const featureIsMain = type === "MAIN_HIGHWAY" ? true : type === "SECOND_HIGHWAY" ? false : isMain;
            return feature?.properties?.is_visible !== false && (featureIsMain ? showMainHwy : showSecHwy);
          },
          style: (feature: any) => {
            const props = feature?.properties || {};
            const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;
            const featureStyle = featureIsMain ? mapStyles.primary : mapStyles.secondary;
            let featureWeight = featureStyle?.weight || weight;
            if (props.lanes) {
              const lanesStr = String(props.lanes);
              if (lanesStr.includes("๘") || lanesStr.includes("8")) featureWeight = 8.5;
              else if (lanesStr.includes("๖") || lanesStr.includes("6")) featureWeight = 7.5;
              else if (lanesStr.includes("๔") || lanesStr.includes("4")) featureWeight = 5.5;
              else if (lanesStr.includes("๒") || lanesStr.includes("2")) featureWeight = 3.5;
            }
            return {
              color: featureStyle?.color || color,
              weight: featureWeight,
              opacity: featureStyle?.opacity ?? opacity,
              dashArray: dashArrayFor(featureStyle),
              className,
            };
          },
          onEachFeature: (feature: any, featureLayer: any) => {
            const props = feature.properties || {};
            const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;

            // Tooltip text is produced only when the tooltip opens.
            if (showRoadLabels) {
              featureLayer.bindTooltip(() => {
                const code = routeCodeOf(props);
                const name = routeNameOf(props);
                return escapeHtml(code ? `ทล.${code} • ${name}` : name);
              }, { sticky: true, className: "doh-map-tooltip" });
            }

            // One click handler per feature, no per-feature popup object or popup HTML.
            // Editing commands take precedence over the normal road popup.
            featureLayer.on("click", (event: any) => {
              const map = leafletMapRef.current;
              if (!map) return;
              const mode = adminPickModeRef.current;
              if (mode) {
                L.DomEvent.stopPropagation(event);
                map.closePopup();
                onCoordinatePickedRef.current?.(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)), mode);
                return;
              }
              map.openPopup(buildHighwayPopupHtml(props, featureIsMain, color), event.latlng);
            });
          },
        }).addTo(group);
        geoLayer.bringToBack();
      } catch (error) {
        console.warn("[LongdoGisMap] Skipped invalid highway layer:", layer.layer_id, error);
      }
    });

    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.highwayLayers, mapStyles, showMainHwy, showSecHwy, showRoadLabels]);

  // 4b. Highway shield labels - viewport-limited, grid-based collision check, redrawn on pan/zoom.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = shieldGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    if (!showHighwayShields) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      group.clearLayers();
      if (map.getZoom() < 11) return;
      const viewport = map.getBounds().pad(0.25);
      const occupied: Record<string, Array<{ x: number; y: number }>> = {};
      let drawn = 0;

      for (const item of shieldCandidates) {
        if (drawn >= MAX_VISIBLE_SHIELDS) break;
        if (item.isMain ? !showMainHwy : !showSecHwy) continue;
        if (!viewport.contains(item.latlng)) continue;
        const point = map.latLngToContainerPoint(item.latlng);
        const cellX = Math.floor(point.x / 48);
        const cellY = Math.floor(point.y / 28);
        let collides = false;
        for (let dx = -1; dx <= 1 && !collides; dx++) {
          for (let dy = -1; dy <= 1 && !collides; dy++) {
            const bucket = occupied[`${cellX + dx}:${cellY + dy}`];
            if (bucket && bucket.some((other) => Math.abs(other.x - point.x) < 48 && Math.abs(other.y - point.y) < 28)) collides = true;
          }
        }
        if (collides) continue;
        const key = `${cellX}:${cellY}`;
        if (!occupied[key]) occupied[key] = [];
        occupied[key].push({ x: point.x, y: point.y });

        const signIcon = L.divIcon({
          html: `<div style="width:28px;height:18px;background:#fff;border:1px solid #64748b;border-radius:3px;color:#334155;text-align:center;line-height:16px;font-size:10px;font-weight:600">${escapeHtml(item.code)}</div>`,
          className: "doh-highway-sign",
          iconSize: [28, 18],
          iconAnchor: [14, 9],
        });
        const sign = L.marker(item.latlng, { icon: signIcon, interactive: true }).addTo(group);
        sign.bindTooltip(`ทล.${escapeHtml(item.code)} · ${escapeHtml(item.name)}`, { direction: "top", offset: [0, -18] });
        sign.bindPopup(() => `<div style="padding-top:5px"><strong>ทล.${escapeHtml(item.code)}</strong><br/>${escapeHtml(item.name)}</div>`);
        drawn++;
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 150);
    };

    draw();
    map.on("moveend zoomend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend zoomend", schedule);
      group.clearLayers();
    };
  }, [mapReady, shieldCandidates, showHighwayShields, showMainHwy, showSecHwy]);

  // 4c. Detour routes
  useEffect(() => {
    const L = leafletRef.current;
    const group = detourGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!showDetourLayer) return;
    const renderer = rendererRef.current;
    const detourStyle = mapStyles.detour;
    const dColor = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
    const dDash = detourStyle?.pattern === "solid" ? undefined : (detourStyle?.dashArray || LAYER_CONFIG.DETOUR_YELLOW_LINE.dashArray);
    const className = lineAnimationClasses(detourStyle, allowLineAnimationRef.current);

    (systemData.detourRoutes || []).forEach((detour) => {
      if (!detour.is_active) return;
      const coords = parseRouteCoordinates(detour.coordinates_json);
      if (coords.length < 2) return;
      const latLngs = coords.map(toLeafletLatLng);

      const polyline = L.polyline(latLngs as any, {
        color: dColor,
        weight: detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight,
        dashArray: dDash,
        opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
        className,
        renderer,
      }).addTo(group);
      polyline.bindPopup(() => buildDetourPopupHtml(detour, dColor));

      const midPoint = latLngs[Math.floor(latLngs.length / 2)];
      const detourIcon = L.divIcon({
        html: `<div class="doh-route-symbol" style="width:30px;height:30px;border-radius:9px;background:${dColor};color:#0f172a;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(15,23,42,.45)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg></div>`,
        className: "doh-detour-symbol",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker(midPoint, { icon: detourIcon, interactive: true }).bindPopup(() => buildDetourPopupHtml(detour, dColor)).addTo(group);
    });

    // Keep stacking order: highways (bottom) < detours < floods < drafts.
    raisePathLayers(group, floodGroupRef.current, draftGroupRef.current);
    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.detourRoutes, showDetourLayer, mapStyles]);

  // 4d. Flood routes + capsule markers. Selection no longer rebuilds this layer (see 4e).
  useEffect(() => {
    const L = leafletRef.current;
    const group = floodGroupRef.current;
    floodLinesRef.current = {};
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!showFloodLayer) return;
    const renderer = rendererRef.current;
    const floodStyle = mapStyles.flood;
    const fColor = floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
    const fBaseWeight = floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight;
    const fOpacity = floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity;
    const fDash = floodStyle?.pattern === "dash" ? (floodStyle.dashArray || "8, 6") : undefined;
    const className = lineAnimationClasses(floodStyle, allowLineAnimationRef.current);

    // Group + sort timeline updates once (was a filter+sort per flood route).
    const updatesByFlood: Record<string, TimelineUpdate[]> = {};
    (systemData.timelineUpdates || []).forEach((update) => {
      (updatesByFlood[update.flood_id_ref] = updatesByFlood[update.flood_id_ref] || []).push(update);
    });
    Object.values(updatesByFlood).forEach((list) => list.sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()));

    (systemData.floodRoutes || []).forEach((flood) => {
      if (!flood.is_active) return;
      const coords = parseRouteCoordinates(flood.coordinates_json);

      if (coords.length >= 2) {
        const polyline = L.polyline(coords.map(toLeafletLatLng) as any, {
          color: fColor,
          weight: fBaseWeight + (flood.id === selectedFloodIdRef.current ? 1.5 : 0),
          opacity: fOpacity,
          dashArray: fDash,
          className,
          renderer,
        }).addTo(group);
        floodLinesRef.current[flood.id] = { line: polyline, baseWeight: fBaseWeight };
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          onSelectFloodRef.current(flood.id);
        });
      }

      // Flood location marker (capsule badge with route number and level)
      const midLat = flood.lat_start || (coords[0] ? coords[0][1] : APP_CONFIG.DEFAULT_CENTER.lat);
      const midLon = flood.lon_start || (coords[0] ? coords[0][0] : APP_CONFIG.DEFAULT_CENTER.lon);

      let capsuleClass = "doh-capsule-tag doh-capsule-amber";
      let levelText = `${flood.water_level_cm} ซม.`;
      if (flood.traffic_status === "CLOSED" || flood.water_level_cm >= 40) {
        capsuleClass = "doh-capsule-tag doh-capsule-red";
      } else if (flood.water_level_cm === 0 || ["PASSABLE", "LIGHT_VEHICLES_ONLY"].includes(flood.traffic_status)) {
        capsuleClass = "doh-capsule-tag doh-capsule-green";
        levelText = "ปกติ";
      }

      const pinIcon = L.divIcon({
        html: `
            <div class="${capsuleClass}">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-sky-700" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 14c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M12 3v2"/></svg></span>
              <span>ทล.${escapeHtml(flood.route_no)}</span>
              <span class="opacity-90">(${escapeHtml(levelText)})</span>
            </div>
          `,
        className: "doh-map-capsule-pin",
        iconSize: [120, 28],
        iconAnchor: [60, 14],
      });

      const marker = L.marker([midLat, midLon], { icon: pinIcon }).addTo(group);
      marker.bindPopup(() => buildFloodPopupHtml(flood, updatesByFlood[flood.id] || []), { maxWidth: 280 });
      marker.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        onSelectFloodRef.current(flood.id);
      });
    });

    raisePathLayers(group, draftGroupRef.current);
    return () => {
      group.clearLayers();
      floodLinesRef.current = {};
    };
  }, [mapReady, systemData.floodRoutes, systemData.timelineUpdates, showFloodLayer, mapStyles]);

  // 4e. Selected flood: restyle one polyline in place instead of redrawing the map.
  useEffect(() => {
    Object.entries(floodLinesRef.current).forEach(([id, entry]) => {
      entry.line.setStyle({ weight: entry.baseWeight + (id === selectedFloodId ? 1.5 : 0) });
    });
  }, [selectedFloodId, mapReady, systemData.floodRoutes, showFloodLayer, mapStyles]);

  // 4f. Admin draft route, imported-GIS preview and draggable markers (small, redrawn often).
  useEffect(() => {
    const L = leafletRef.current;
    const group = draftGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    draftLineRef.current = null;
    const renderer = rendererRef.current;

    // Blue dashed preview of the GIS file being imported / geometry being edited
    incomingGisLines.forEach((line) => {
      if (line.length < 2) return;
      L.polyline(line.map(toLeafletLatLng) as any, {
        color: "#0284c7",
        weight: 5,
        dashArray: "6, 6",
        opacity: 0.95,
        renderer,
      }).addTo(group);
    });

    // Snapped draft route
    if (draftCoordinates.length >= 2) {
      const draftColor = draftMode === "FLOOD"
        ? (mapStyles.flood?.color || "#ef4444")
        : (mapStyles.detour?.color || "#f59e0b");
      const draftLine = L.polyline(draftCoordinates.map(toLeafletLatLng) as any, {
        color: draftColor,
        weight: 6,
        dashArray: draftMode === "FLOOD"
          ? (mapStyles.flood?.pattern === "dash" ? (mapStyles.flood.dashArray || "8, 6") : undefined)
          : (mapStyles.detour?.pattern === "solid" ? undefined : (mapStyles.detour?.dashArray || "8, 6")),
        opacity: 0.95,
        renderer,
      }).addTo(group);
      draftLineRef.current = draftLine;
      draftLine.on("click", (event: any) => {
        if (adminPickModeRef.current !== "ADD_WAYPOINT") return;
        L.DomEvent.stopPropagation(event);
        const point = event.latlng;
        onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), "ADD_WAYPOINT");
      });
    }

    // Start / end pick markers (A / B)
    draftPickMarkers.forEach((point) => {
      const icon = L.divIcon({
        html: `<div class="w-7 h-7 rounded-full bg-sky-500 text-white border-2 border-white font-heading font-black text-xs flex items-center justify-center shadow-lg">${escapeHtml(point.label)}</div>`,
        className: "doh-draft-endpoint",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([point.lat, point.lon], { icon, zIndexOffset: 1200, draggable: true }).bindTooltip(`จุด${point.label}`, { direction: "top" }).addTo(group);
      marker.on("dragend", (event: any) => {
        const position = event.target.getLatLng();
        onCoordinatePickedRef.current?.(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)), point.mode);
      });
    });

    // Numbered draggable waypoints for bending paths (ดัดเส้น)
    draftWaypoints.forEach((wp, idx) => {
      const wpIcon = L.divIcon({
        html: `<div class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 border-2 border-slate-950 font-heading font-black text-[11px] flex items-center justify-center shadow-lg cursor-move">${idx + 1}</div>`,
        className: "doh-wp-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const wpMarker = L.marker([wp[1], wp[0]], { icon: wpIcon, draggable: true }).addTo(group);
      wpMarker.bindTooltip(`จุดดัดเส้นทางที่ ${idx + 1} (ลากหมุดนี้เพื่อขยับแนวถนน)`, { direction: "top" });
      wpMarker.on("dragend", (ev: any) => {
        const pos = ev.target.getLatLng();
        onWaypointDraggedRef.current?.(idx, [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))]);
      });
    });

    raisePathLayers(group);
    return () => {
      draftLineRef.current = null;
      group.clearLayers();
    };
  }, [mapReady, incomingGisLines, draftCoordinates, draftWaypoints, draftPickMarkers, draftMode, mapStyles]);

  // 4h. Freeform vertex editor: draggable handle on every vertex + "+" handle on every segment middle.
  // Only vertices inside the viewport are drawn (at most MAX_VERTEX_HANDLES), so long lines stay fast.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = vertexGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    if (!vertexEditable || draftCoordinates.length < 2) return;

    const working: [number, number][] = draftCoordinates.map(toLeafletLatLng);
    const lastIndex = working.length - 1;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      group.clearLayers();
      const view = map.getBounds().pad(0.15);
      const visible: number[] = [];
      for (let i = 0; i < working.length; i++) {
        if (view.contains(working[i])) visible.push(i);
      }
      const step = Math.max(1, Math.ceil(visible.length / MAX_VERTEX_HANDLES));

      visible.forEach((index, order) => {
        const isEnd = index === 0 || index === lastIndex;
        if (step > 1 && order % step !== 0 && !isEnd) return;
        const borderColor = index === 0 ? "#22c55e" : index === lastIndex ? "#ef4444" : "#0284c7";
        const icon = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid ${borderColor};box-shadow:0 1px 4px rgba(15,23,42,.6);cursor:grab"></div>`,
          className: "doh-vertex-handle",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const handle = L.marker(working[index], { icon, draggable: true, zIndexOffset: 1100, keyboard: false }).addTo(group);
        handle.bindTooltip(`จุดที่ ${index + 1} · ลากเพื่อย้าย · คลิกขวา/กดค้างเพื่อลบ`, { direction: "top", offset: [0, -8] });
        handle.on("drag", (event: any) => {
          const position = event.target.getLatLng();
          working[index] = [position.lat, position.lng];
          draftLineRef.current?.setLatLngs(working);
        });
        handle.on("dragend", (event: any) => {
          const position = event.target.getLatLng();
          onVertexMovedRef.current?.(index, [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))]);
        });
        handle.on("click", (event: any) => {
          L.DomEvent.stopPropagation(event);
          onVertexClickedRef.current?.(index, "click");
        });
        handle.on("contextmenu", (event: any) => {
          L.DomEvent.stopPropagation(event);
          L.DomEvent.preventDefault(event);
          onVertexClickedRef.current?.(index, "contextmenu");
        });
      });

      // Midpoint handles are only shown when every vertex in view has its own handle.
      if (step === 1) {
        for (let i = 0; i < lastIndex; i++) {
          if (!view.contains(working[i]) && !view.contains(working[i + 1])) continue;
          const mid: [number, number] = [(working[i][0] + working[i + 1][0]) / 2, (working[i][1] + working[i + 1][1]) / 2];
          const icon = L.divIcon({
            html: `<div style="width:10px;height:10px;border-radius:50%;background:rgba(2,132,199,.55);border:1px solid #fff;cursor:copy"></div>`,
            className: "doh-vertex-mid",
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          const midHandle = L.marker(mid, { icon, draggable: true, zIndexOffset: 900, keyboard: false }).addTo(group);
          midHandle.bindTooltip("คลิกหรือลากเพื่อเพิ่มจุด", { direction: "top", offset: [0, -6] });
          midHandle.on("click", (event: any) => {
            L.DomEvent.stopPropagation(event);
            onVertexInsertedRef.current?.(i + 1, [Number(mid[1].toFixed(6)), Number(mid[0].toFixed(6))]);
          });
          midHandle.on("dragend", (event: any) => {
            const position = event.target.getLatLng();
            onVertexInsertedRef.current?.(i + 1, [Number(position.lng.toFixed(6)), Number(position.lat.toFixed(6))]);
          });
        }
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(draw, 150);
    };

    draw();
    map.on("moveend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend", schedule);
      group.clearLayers();
    };
  }, [mapReady, vertexEditable, draftCoordinates]);

  // 4g. DOH offices & highway stations
  useEffect(() => {
    const L = leafletRef.current;
    const group = officeGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!showOffices) return;

    (systemData.offices || []).forEach((office) => {
      if (!office.is_active) return;
      const officeIcon = L.divIcon({
        html: `
              <div class="relative cursor-pointer" style="transform: translate(-50%, -50%);">
                <div class="w-7 h-7 rounded-full bg-slate-100 border border-slate-500 flex items-center justify-center shadow-md text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
                    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
                    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
                    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
                  </svg>
                </div>
              </div>
            `,
        className: "doh-office-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const isOfficeEditable = !publicMode && editableOfficeId === office.id && Boolean(onOfficeDraggedRef.current);
      const marker = L.marker([office.lat, office.lon], { icon: officeIcon, draggable: isOfficeEditable }).addTo(group);
      if (isOfficeEditable) {
        marker.on("dragend", (event: any) => {
          const position = event.target.getLatLng();
          onOfficeDraggedRef.current?.(office.id, { lat: Number(position.lat.toFixed(6)), lon: Number(position.lng.toFixed(6)) });
        });
      }
      marker.bindPopup(() => buildOfficePopupHtml(office));
    });

    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.offices, showOffices, publicMode, editableOfficeId]);

  return (
    <div className={`relative ${className} overflow-hidden w-full h-full min-h-[450px]`} style={{ minHeight: 450 }}>
      <div
        ref={mapContainerRef}
        className="w-full h-full min-h-[350px] bg-[#0b1426] relative z-0"
        style={{ position: "absolute", inset: 0, minHeight: 450 }}
      />

      {/* Layer Control Legend (Floating Top-Right matching Reference Image 1 & Collapsible for Issue #4) */}
      {isLayerControlCollapsed ? (
        <button
          type="button"
          onClick={() => setIsLayerControlCollapsed(false)}
          className="absolute top-4 right-4 z-[400] bg-[#0b162c]/95 hover:bg-[#0f1d3a] border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2 text-xs font-heading font-bold text-amber-300 transition backdrop-blur-md"
          title="เปิดแถบควบคุมเลเยอร์แผนที่"
        >
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>สัญลักษณ์บนแผนที่</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>
      ) : (
        <div className="absolute top-4 right-4 z-[400] bg-[#0b162c]/95 backdrop-blur border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl min-w-[215px] sm:min-w-[240px] text-xs pointer-events-auto animate-fade-in">
          <div className="font-heading font-bold text-amber-400 flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-xs text-white">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> สัญลักษณ์บนแผนที่
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetCamera} className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline">
                รีเซ็ต
              </button>
              <button
                type="button"
                onClick={() => setIsLayerControlCollapsed(true)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                title="ย่อแถบควบคุมเลเยอร์"
                aria-label="ย่อแถบควบคุมเลเยอร์"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายหลัก" onFocus={() => setLegendRouteList("MAIN_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("MAIN_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.primary?.color }} />
                <span>ทางหลวงสายหลัก</span>
              </span>
              <input
                type="checkbox"
                checked={showMainHwy}
                onChange={(e) => setShowMainHwy(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
            </label>
            {legendRouteList === "MAIN_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl">{legendRoutes("MAIN_HIGHWAY").length ? legendRoutes("MAIN_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-1 last:border-0"><strong className="text-emerald-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            <div tabIndex={0} aria-label="แสดงรายการทางหลวงสายรอง" onFocus={() => setLegendRouteList("SECOND_HIGHWAY")} onBlur={() => setLegendRouteList(null)} onPointerEnter={(event) => { if (event.pointerType === "mouse") setLegendRouteList("SECOND_HIGHWAY"); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setLegendRouteList(null); }}>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.secondary?.color }} />
                <span>ทางหลวงสายรอง</span>
              </span>
              <input
                type="checkbox"
                checked={showSecHwy}
                onChange={(e) => setShowSecHwy(e.target.checked)}
                className="accent-sky-400 rounded"
              />
            </label>
            {legendRouteList === "SECOND_HIGHWAY" && <div role="tooltip" className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl">{legendRoutes("SECOND_HIGHWAY").length ? legendRoutes("SECOND_HIGHWAY").map((route) => <div key={`${route.code}-${route.name}`} className="border-b border-slate-800 py-1 last:border-0"><strong className="text-sky-300">ทล.{route.code}</strong> — {route.name}</div>) : "ไม่มีสายทางที่แสดง"}</div>}
            </div>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-700"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 14c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/></svg></span>
                <span>เส้นน้ำท่วม <span className="ml-1 rounded-full bg-red-950 px-1.5 py-0.5 text-[10px] text-red-300">{showFloodLayer ? (systemData.floodRoutes || []).filter((item) => item.is_active).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={showFloodLayer}
                onChange={(e) => setShowFloodLayer(e.target.checked)}
                className="accent-red-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-400 text-slate-950"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/></svg></span>
                <span>ทางเลี่ยง <span className="ml-1 rounded-full bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-300">{showDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</span></span>
              </span>
              <input
                type="checkbox"
                checked={showDetourLayer}
                onChange={(e) => setShowDetourLayer(e.target.checked)}
                className="accent-yellow-400 rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <Building2 className="w-3 h-3 text-sky-400 inline-block" />
                <span>สำนักงาน/หมวดทางหลวง</span>
              </span>
              <input
                type="checkbox"
                checked={showOffices}
                onChange={(e) => setShowOffices(e.target.checked)}
                className="accent-sky-400 rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="flex h-4 min-w-5 items-center justify-center rounded-sm border border-slate-800 bg-white px-0.5 text-[8px] font-bold text-slate-900">42</span>
                <span>หมายเลขทางหลวง</span>
              </span>
              <input type="checkbox" checked={showHighwayShields} onChange={(e) => setShowHighwayShields(e.target.checked)} className="accent-slate-400 rounded" />
            </label>
          </div>

          {/* Base Map Switcher */}
          <div className="mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-3 gap-1 text-[10px] font-heading font-bold">
            <button
              type="button"
              onClick={() => switchBaseMap("longdo")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${
                activeBaseMap === "longdo" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              Longdo
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("road")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${
                activeBaseMap === "road" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              ถนน OSM
            </button>
            <button
              type="button"
              onClick={() => switchBaseMap("sat")}
              className={`py-1 rounded-lg transition text-center px-1 truncate ${
                activeBaseMap === "sat" ? "bg-amber-500 text-slate-950 shadow" : "bg-slate-900 text-slate-400 hover:text-white"
              }`}
            >
              ดาวเทียม
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 z-[400] flex flex-wrap gap-2 pointer-events-none" aria-label="สรุปสถานการณ์บนแผนที่">
        <div className="rounded-xl border border-red-400/40 bg-slate-950/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-400" />
          น้ำท่วม <strong className="text-red-300">{showFloodLayer ? (systemData.floodRoutes || []).filter((item) => item.is_active).length : 0}</strong> จุด
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-slate-950/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-300" />
          ทางเลี่ยง <strong className="text-amber-300">{showDetourLayer ? (systemData.detourRoutes || []).filter((item) => item.is_active).length : 0}</strong> เส้นทาง
        </div>
      </div>
    </div>
  );
}
