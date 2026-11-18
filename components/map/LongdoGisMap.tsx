"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload, FloodRoute, DetourRoute } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  defaultDetourDirection,
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import {
  groupFloodRoutesIntoEvents,
  parseFloodDirectionMeta,
} from "@/lib/flood-event-schema";
import { getLinkedDetoursForFlood, getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import { MapLegendOverlay } from "./MapLegendOverlay";
import {
  escapeHtml,
  isFloodLineVisibleOnCurrentMap,
  toLeafletLatLng,
  EMPTY_COORDS,
  EMPTY_LINES,
  EMPTY_PICK_MARKERS,
  MAX_VISIBLE_SHIELDS,
  MAX_VERTEX_HANDLES,
  type ShieldCandidate,
  type FloodLineEntry,
  type AnimatedLineEntry,
  addLineCasing,
  routeCodeOf,
  routeNameOf,
  geoJsonFeatures,
  parseRouteCoordinates,
  lineAnimationClasses,
  dashArrayFor,
  raisePathLayers,
  getResponsivePopupOptions,
  buildHighwayPopupHtml,
  buildDetourPopupHtml,
  buildDetourPointPhotoPopupHtml,
  buildFloodPopupHtml,
  buildOfficePopupHtml,
} from "./longdo-map-popups";

export { isFloodLineVisibleOnCurrentMap } from "./longdo-map-popups";

interface LongdoGisMapProps {
  systemData: SystemDataPayload;
  selectedFloodId: string;
  onSelectFlood: (id: string) => void;
  onOpenFloodDetours?: (id: string) => void;
  onSelectDetour?: (detour: DetourRoute) => void;
  adminPickMode?: string | null;
  onCoordinatePicked?: (lat: number, lon: number, mode: string) => void;
  draftCoordinates?: [number, number][];
  draftReverseCoordinates?: [number, number][];
  draftWaypoints?: [number, number][];
  draftReverseWaypoints?: [number, number][];
  draftPickMarkers?: { lat: number; lon: number; label: string; mode: string }[];
  draftDirectionMeta?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
  draftConflictPoints?: [number, number][];
  onWaypointDragged?: (index: number, newCoord: [number, number]) => void;
  onReverseWaypointDragged?: (index: number, newCoord: [number, number]) => void;
  /** Freeform line editor (Google My Maps style): show draggable handles on every vertex of the draft line. */
  vertexEditable?: boolean;
  vertexEditCoordinates?: [number, number][];
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
  onOpenFloodDetours,
  onSelectDetour,
  adminPickMode = null,
  onCoordinatePicked,
  draftCoordinates = EMPTY_COORDS,
  draftReverseCoordinates = EMPTY_COORDS,
  draftWaypoints = EMPTY_COORDS,
  draftReverseWaypoints = EMPTY_COORDS,
  draftPickMarkers = EMPTY_PICK_MARKERS,
  draftDirectionMeta = "TWO_WAY",
  draftConflictPoints = EMPTY_COORDS,
  onWaypointDragged,
  onReverseWaypointDragged,
  vertexEditable = false,
  vertexEditCoordinates,
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
  const arrowGroupRef = useRef<any>(null);
  const draftLineRef = useRef<any>(null);
  const vertexGroupRef = useRef<any>(null);
  const officeGroupRef = useRef<any>(null);
  const floodLinesRef = useRef<Record<string, FloodLineEntry>>({});
  const detourLinesRef = useRef<AnimatedLineEntry[]>([]);
  const userLocationMarkerRef = useRef<any>(null);
  const baseLayersRef = useRef<Record<string, any>>({});
  const currentBaseKeyRef = useRef<string>("longdo");

  const [activeBaseMap, setActiveBaseMap] = useState<"road" | "sat" | "longdo">("longdo");
  const [isLayerControlCollapsed, setIsLayerControlCollapsed] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [isMapPopupOpen, setIsMapPopupOpen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(APP_CONFIG.DEFAULT_ZOOM);
  const [forceShowAllHighways, setForceShowAllHighways] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [floodDisplayMode, setFloodDisplayMode] = useState<"SEGMENTS" | "EVENTS">("SEGMENTS");
  const [showDetourLayer, setShowDetourLayer] = useState(true);
  const effectiveShowFloodLayer = showFloodLayer;
  const effectiveShowDetourLayer = showDetourLayer;
  const [showMainHwy, setShowMainHwy] = useState(true);
  const [showSecHwy, setShowSecHwy] = useState(true);
  const [showHighwayShields, setShowHighwayShields] = useState(false);
  const [showOffices, setShowOffices] = useState(true);
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [legendRouteList, setLegendRouteList] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [previewPointPhoto, setPreviewPointPhoto] = useState<{ url: string; title: string } | null>(null);

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
  const onReverseWaypointDraggedRef = useRef(onReverseWaypointDragged);
  onReverseWaypointDraggedRef.current = onReverseWaypointDragged;
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
  const onOpenFloodDetoursRef = useRef(onOpenFloodDetours);
  onOpenFloodDetoursRef.current = onOpenFloodDetours;
  const onSelectDetourRef = useRef(onSelectDetour);
  onSelectDetourRef.current = onSelectDetour;
  const selectedFloodIdRef = useRef(selectedFloodId);
  selectedFloodIdRef.current = selectedFloodId;
  const systemDataRef = useRef(systemData);
  systemDataRef.current = systemData;

  // Global popup handlers for direction toggling, opening modal, focusing map, and Google Maps navigation
  useEffect(() => {
    const activeDirMap: Record<string, "FORWARD" | "REVERSE"> = {};

    (window as any).__getDetourCurrentDir = (id: string) => {
      return activeDirMap[id] || "FORWARD";
    };

    (window as any).__openFloodDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      onSelectFloodRef.current?.(id);
    };

    (window as any).__openFloodDetourDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      if (onOpenFloodDetoursRef.current) {
        onOpenFloodDetoursRef.current(id);
      } else {
        onSelectFloodRef.current?.(id);
      }
    };

    (window as any).__focusFloodOnMap = (id: string) => {
      const map = leafletMapRef.current;
      const L = leafletRef.current;
      const flood = (systemDataRef.current.floodRoutes || []).find((f) => f.id === id);
      if (!map || !L || !flood) return;
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        map.fitBounds(L.latLngBounds(coords.map(toLeafletLatLng)), { padding: [48, 48], maxZoom: 16 });
      } else if (Number.isFinite(flood.lat_start) && Number.isFinite(flood.lon_start)) {
        map.setView([flood.lat_start, flood.lon_start], 15);
      }
    };

    (window as any).__openDetourModal = (id: string) => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => d.id === id);
      if (detour) {
        onSelectDetourRef.current?.(detour);
      }
    };

    (window as any).__openDetourPointPhoto = (url: string, title?: string) => {
      if (!url) return;
      setPreviewPointPhoto({ url, title: title || "ภาพทางเข้าเส้นทางเลี่ยง" });
    };

    (window as any).__openDetourGoogleMaps = (safeId: string, dir?: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === safeId);
      if (!detour) return;
      const targetDir = dir || activeDirMap[safeId] || defaultDetourDirection(detour.direction_mode) || "FORWARD";
      const nav = resolveDetourGoogleMapsNavigation(detour, targetDir, systemDataRef.current.floodRoutes || []);
      if (nav.url) {
        window.open(nav.url, "_blank", "noopener,noreferrer");
      } else if (nav.warning) {
        alert(nav.warning);
      }
    };

    (window as any).__toggleDetourPopupDir = (id: string, dir: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const route = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === id);
      if (!isDetourDirectionAllowed(route?.direction_mode, dir)) return;
      activeDirMap[id] = dir;
      const fwdBtn = document.getElementById(`detour-btn-fwd-${id}`);
      const revBtn = document.getElementById(`detour-btn-rev-${id}`);
      const fwdDesc = document.getElementById(`detour-desc-fwd-${id}`);
      const revDesc = document.getElementById(`detour-desc-rev-${id}`);
      const navSub = document.getElementById(`detour-nav-subtext-${id}`);
      if (!fwdBtn || !revBtn || !fwdDesc || !revDesc) return;

      const activeClasses = "min-h-[38px] py-1.5 px-2.5 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1 bg-[#f59e0b] text-slate-950 shadow-sm disabled:opacity-35 disabled:cursor-not-allowed";
      const inactiveClasses = "min-h-[38px] py-1.5 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-slate-300 hover:bg-slate-800/70 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed";

      if (dir === "FORWARD") {
        fwdBtn.className = activeClasses;
        revBtn.className = inactiveClasses;
        fwdBtn.setAttribute("aria-pressed", "true");
        revBtn.setAttribute("aria-pressed", "false");
        fwdDesc.classList.remove("hidden");
        fwdDesc.classList.add("block");
        revDesc.classList.remove("block");
        revDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขาไป A ➔ B)";
      } else {
        revBtn.className = activeClasses;
        fwdBtn.className = inactiveClasses;
        revBtn.setAttribute("aria-pressed", "true");
        fwdBtn.setAttribute("aria-pressed", "false");
        revDesc.classList.remove("hidden");
        revDesc.classList.add("block");
        fwdDesc.classList.remove("block");
        fwdDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขากลับ B ➔ A)";
      }
    };
    return () => {
      delete (window as any).__openFloodDossier;
      delete (window as any).__openFloodDetourDossier;
      delete (window as any).__focusFloodOnMap;
      delete (window as any).__toggleDetourPopupDir;
      delete (window as any).__openDetourModal;
      delete (window as any).__openDetourPointPhoto;
      delete (window as any).__openDetourGoogleMaps;
      delete (window as any).__getDetourCurrentDir;
    };
  }, []);

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    let isMounted = true;
    const initialResizeTimers: ReturnType<typeof setTimeout>[] = [];

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
        arrowGroupRef.current = L.layerGroup().addTo(map);
        vertexGroupRef.current = L.layerGroup().addTo(map);
        officeGroupRef.current = L.layerGroup().addTo(map);
        shieldGroupRef.current = L.layerGroup().addTo(map);

        setCurrentZoom(map.getZoom());
        map.on("zoomend", () => {
          setCurrentZoom(map.getZoom());
        });

        setMapReady(true);

        // Invalidate size multiple times to ensure full canvas coverage across viewports
        [100, 300, 600, 1000].forEach((delay) => {
          initialResizeTimers.push(setTimeout(() => {
            if (map) map.invalidateSize();
          }, delay));
        });

        // Handle map clicks for coordinate picking
        map.on("click", (e: any) => {
          if (!adminPickModeRef.current) return;
          const lat = Number(e.latlng.lat.toFixed(6));
          const lon = Number(e.latlng.lng.toFixed(6));
          onCoordinatePickedRef.current?.(lat, lon, adminPickModeRef.current);
        });

        // Ensure popup controls and buttons respond smoothly to clicks and touch
        map.on("popupopen", (e: any) => {
          setIsMapPopupOpen(true);
          const container = e?.popup?.getElement?.();
          if (container && L?.DomEvent) {
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
          }
        });
        map.on("popupclose", () => {
          setIsMapPopupOpen(Boolean((map as any)._popup && (map as any)._popup.isOpen?.()));
        });
      } catch (err) {
        console.error("[LongdoGisMap] Failed to initialize Leaflet map:", err);
      }
    }

    initMap();

    return () => {
      isMounted = false;
      initialResizeTimers.forEach(clearTimeout);
      setIsMapPopupOpen(false);
      setMapReady(false);
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) { }
        leafletMapRef.current = null;
      }
      leafletRef.current = null;
      rendererRef.current = null;
      highwayGroupRef.current = null;
      detourGroupRef.current = null;
      floodGroupRef.current = null;
      draftGroupRef.current = null;
      arrowGroupRef.current = null;
      draftLineRef.current = null;
      vertexGroupRef.current = null;
      officeGroupRef.current = null;
      shieldGroupRef.current = null;
      floodLinesRef.current = {};
      detourLinesRef.current = [];
      userLocationMarkerRef.current = null;
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

  // This stays entirely in the browser: the current position is never sent to
  // Supabase or stored with a flood report. Low accuracy/short cache avoids an
  // unnecessary GPS wake-up while still centering the map for most travelers.
  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationStatus("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    const executeLocate = () => {
      const map = leafletMapRef.current;
      const L = leafletRef.current;
      if (!map || !L) {
        setLocationStatus("แผนที่ยังไม่พร้อม กรุณาลองอีกครั้ง");
        setIsLocating(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const m = leafletMapRef.current;
          const l = leafletRef.current;
          if (!m || !l) return;
          const latLng: [number, number] = [position.coords.latitude, position.coords.longitude];
          if (userLocationMarkerRef.current) userLocationMarkerRef.current.setLatLng(latLng);
          else {
            userLocationMarkerRef.current = l.circleMarker(latLng, {
              radius: 8,
              color: "#ffffff",
              weight: 2,
              fillColor: "#2563eb",
              fillOpacity: 0.95,
              interactive: false,
              pane: "markerPane",
            }).addTo(m).bindTooltip("ตำแหน่งของคุณ", { direction: "top", offset: [0, -8] });
          }
          m.flyTo(latLng, Math.max(m.getZoom(), 14), { duration: 0.7 });
          setLocationStatus("แสดงตำแหน่งของคุณแล้ว");
          setIsLocating(false);
        },
        (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาเปิดสิทธิ์ในเบราว์เซอร์"
            : "ไม่พบตำแหน่งของคุณ กรุณาลองอีกครั้ง";
          setLocationStatus(message);
          setIsLocating(false);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
      );
    };

    setIsLocating(true);
    setLocationStatus("กำลังค้นหาตำแหน่งของคุณ…");

    if (!leafletMapRef.current || !leafletRef.current) {
      const start = Date.now();
      const timer = setInterval(() => {
        if (leafletMapRef.current && leafletRef.current) {
          clearInterval(timer);
          executeLocate();
        } else if (Date.now() - start > 3000) {
          clearInterval(timer);
          setLocationStatus("แผนที่ยังไม่พร้อม กรุณาลองอีกครั้ง");
          setIsLocating(false);
        }
      }, 100);
      return;
    }

    executeLocate();
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

  // Set of highway numbers that currently have active flood or detour incidents (must remain visible even when zoomed out)
  const criticalHighwayRouteNos = useMemo(() => {
    const set = new Set<string>();
    (systemData.floodRoutes || []).forEach((f) => {
      if (f.is_active && f.route_no) {
        set.add(String(f.route_no).replace(/^ทล\.?/i, "").trim());
      }
    });
    return set;
  }, [systemData.floodRoutes]);

  // 4a. Highway network (Zoom-dependent rendering per Item 1: Zoom < 11 hides secondary highways unless they have active critical incidents or forceShowAllHighways is toggled).
  const showSecondaryAtCurrentZoom = forceShowAllHighways || currentZoom >= 11;

  useEffect(() => {
    const L = leafletRef.current;
    const group = highwayGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    const renderer = rendererRef.current;
    const isLowZoom = currentZoom < 11;

    (systemData.highwayLayers || []).forEach((layer) => {
      if (!layer.is_visible || !layer.geojson_data) return;
      const isMain = layer.layer_id === "MAIN_HIGHWAY";
      const style = isMain ? mapStyles.primary : mapStyles.secondary;
      const color = style?.color || (isMain ? "#1B5E20" : "#0284c7");
      const weight = style?.weight || (isMain ? 5 : 3.5);
      const opacity = style?.opacity ?? 0.85;
      const className = lineAnimationClasses(style, allowLineAnimationRef.current);

    const shouldShowFeature = (feature: any) => {
      if (feature?.properties?.is_visible === false) return false;
      const type = feature?.properties?.highway_type;
      const featureIsMain = type === "MAIN_HIGHWAY" ? true : type === "SECOND_HIGHWAY" ? false : isMain;
      if (featureIsMain) return showMainHwy;
      if (!showSecHwy) return false;
      if (showSecondaryAtCurrentZoom) return true;
      const code = String(routeCodeOf(feature?.properties)).replace(/^ทล\.?/i, "").trim();
      return Boolean(code && criticalHighwayRouteNos.has(code));
    };

    const highwayForegroundStyle = (feature: any) => {
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
      if (isLowZoom) featureWeight = Math.max(2, featureWeight * 0.8);
      return { featureStyle, featureWeight };
    };

      try {
      // Casing is a separate non-interactive Canvas path.  It must be drawn
      // before the foreground GeoJSON so clicks and labels stay on the road.
      const hasHighwayCasing = [mapStyles.primary, mapStyles.secondary].some(
        (item) => item?.borderActive && Number(item.borderWidth) > 0,
      );
      if (hasHighwayCasing) {
        L.geoJSON(layer.geojson_data, {
          renderer,
          interactive: false,
          filter: (feature: any) => {
            const { featureStyle } = highwayForegroundStyle(feature);
            return shouldShowFeature(feature) && Boolean(featureStyle?.borderActive && Number(featureStyle.borderWidth) > 0);
          },
          style: (feature: any) => {
            const { featureStyle, featureWeight } = highwayForegroundStyle(feature);
            const borderWidth = Math.max(0, Number(featureStyle?.borderWidth) || 0);
            return {
              color: featureStyle?.borderColor || "#ffffff",
              weight: featureWeight + borderWidth * 2,
              opacity: featureStyle?.opacity ?? opacity,
              interactive: false,
            };
          },
        }).addTo(group);
      }
        const geoLayer = L.geoJSON(layer.geojson_data, {
          renderer,
          filter: shouldShowFeature,
          style: (feature: any) => {
            const { featureStyle, featureWeight } = highwayForegroundStyle(feature);
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
  }, [mapReady, systemData.highwayLayers, mapStyles, showMainHwy, showSecHwy, showRoadLabels, showSecondaryAtCurrentZoom, criticalHighwayRouteNos, currentZoom]);

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
      const z = map.getZoom();
      if (z < 10) return;
      const viewport = map.getBounds().pad(0.25);
      const occupied: Record<string, Array<{ x: number; y: number }>> = {};
      let drawn = 0;

      for (const item of shieldCandidates) {
        if (drawn >= MAX_VISIBLE_SHIELDS) break;
        if (item.isMain ? !showMainHwy : !showSecHwy) continue;
        if (!item.isMain && z < 11 && !forceShowAllHighways && !criticalHighwayRouteNos.has(item.code.replace(/^ทล\.?/i, "").trim())) continue;
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
  }, [mapReady, shieldCandidates, showHighwayShields, showMainHwy, showSecHwy, forceShowAllHighways, criticalHighwayRouteNos]);

  // 4c. Detour routes (Supports A->B, B->A asymmetric carriageways & one-way detours per Item 4)
  useEffect(() => {
    const L = leafletRef.current;
    const group = detourGroupRef.current;
    detourLinesRef.current = [];
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowDetourLayer) return;
    const renderer = rendererRef.current;
    const detourStyle = mapStyles.detour;
    const dColor = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
    const dDash = detourStyle?.pattern === "solid" ? undefined : (detourStyle?.dashArray || LAYER_CONFIG.DETOUR_YELLOW_LINE.dashArray);
    const className = lineAnimationClasses(detourStyle, allowLineAnimationRef.current);

    (systemData.detourRoutes || []).forEach((detour) => {
      if (!detour.is_active) return;
      const dirMode = detour.direction_mode || "TWO_WAY";
      const fwdCoords = parseRouteCoordinates(detour.coordinates_json);
      const revCoords = parseRouteCoordinates(detour.reverse_coordinates_json);

      const linkedEvents = getLinkedEventsForDetour(detour, systemData);
      const linkedFlood = linkedEvents[0]?.primaryFlood ?? null;
      const linkedMeta = linkedFlood ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood) : null;
      const linkedDetourDir = linkedEvents[0]?.links[0]?.detourDirection;
      const defaultDir: "FORWARD" | "REVERSE" =
        linkedDetourDir === "REVERSE" || linkedMeta?.directionCode === "B_TO_A" || detour.direction_mode === "REVERSE_ONLY"
          ? "REVERSE"
          : "FORWARD";

      // Draw forward A->B line if mode is TWO_WAY or FORWARD_ONLY
      if (dirMode !== "REVERSE_ONLY" && fwdCoords.length >= 2) {
        const latLngs = fwdCoords.map(toLeafletLatLng);
        const forwardWeight = detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight;
        addLineCasing(L, group, latLngs, detourStyle || {}, forwardWeight, renderer);
        const polyline = L.polyline(latLngs as any, {
          color: dColor,
          weight: forwardWeight,
          dashArray: dDash,
          opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
          className,
          renderer,
        }).addTo(group);
        detourLinesRef.current.push({
          line: polyline,
          baseWeight: detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight,
          baseOpacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
        });
        const detourPopupOpts = getResponsivePopupOptions(L, 440, 320, "doh-detour-leaflet-popup");
        polyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), detourPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          polyline.openPopup(e.latlng);
        });

        const midPoint = latLngs[Math.floor(latLngs.length / 2)];
        const detourIcon = L.divIcon({
          html: `<div class="doh-route-symbol" style="width:30px;height:30px;border-radius:9px;background:${dColor};color:#0f172a;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(15,23,42,.45)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9a4 4 0 0 1 4-4h9"/><path d="m15 2 3 3-3 3"/><path d="M9 19h10"/><path d="m16 16 3 3-3 3"/></svg></div>`,
          className: "doh-detour-symbol",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const detourMarker = L.marker(midPoint, { icon: detourIcon, interactive: true }).bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), detourPopupOpts).addTo(group);
        detourMarker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          detourMarker.openPopup();
        });
      }

      // Draw reverse B->A line if present and distinct (or when REVERSE_ONLY)
      if (dirMode !== "FORWARD_ONLY") {
        const effectiveRev = revCoords.length >= 2 ? revCoords : (dirMode === "REVERSE_ONLY" ? fwdCoords : []);
        if (effectiveRev.length >= 2) {
          const revLatLngs = effectiveRev.map(toLeafletLatLng);
          const revColor = dirMode === "REVERSE_ONLY" ? dColor : (detour.detour_meta?.arrow_color_reverse || "#38bdf8");
          const reverseWeight = Math.max(3.5, (detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) - 0.5);
          addLineCasing(L, group, revLatLngs, detourStyle || {}, reverseWeight, renderer);
          const revPolyline = L.polyline(revLatLngs as any, {
            color: revColor,
            weight: reverseWeight,
            dashArray: dDash || "6, 6",
            opacity: detourStyle?.opacity ?? 0.9,
            renderer,
          }).addTo(group);
          detourLinesRef.current.push({
            line: revPolyline,
            baseWeight: Math.max(3.5, (detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) - 0.5),
            baseOpacity: detourStyle?.opacity ?? 0.9,
          });
          const revPopupOpts = getResponsivePopupOptions(L, 440, 320, "doh-detour-leaflet-popup");
          revPolyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), revPopupOpts);
          revPolyline.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            revPolyline.openPopup(e.latlng);
          });
        }
      }

      // Draw Start Point A & End Point B Entrance Photo Markers if photos are attached
      const startPhoto = detour.detour_meta?.start_point_photo;
      const endPhoto = detour.detour_meta?.end_point_photo;
      const startLat = Number.isFinite(detour.lat_start) && detour.lat_start !== 0 ? detour.lat_start : (fwdCoords[0]?.[1] ?? NaN);
      const startLon = Number.isFinite(detour.lon_start) && detour.lon_start !== 0 ? detour.lon_start : (fwdCoords[0]?.[0] ?? NaN);
      const endLat = Number.isFinite(detour.lat_end) && detour.lat_end !== 0 ? detour.lat_end : (fwdCoords[fwdCoords.length - 1]?.[1] ?? NaN);
      const endLon = Number.isFinite(detour.lon_end) && detour.lon_end !== 0 ? detour.lon_end : (fwdCoords[fwdCoords.length - 1]?.[0] ?? NaN);

      if (startPhoto?.url && Number.isFinite(startLat) && Number.isFinite(startLon)) {
        const startPhotoIcon = L.divIcon({
          html: `<div class="doh-detour-photo-badge" style="min-width:34px;height:26px;padding:0 6px;border-radius:999px;background:#064e3b;color:#a7f3d0;border:2px solid #10b981;display:flex;align-items:center;justify-content:center;gap:3px;font-weight:900;font-size:11px;box-shadow:0 3px 10px rgba(0,0,0,0.6)"><span>📷</span><span>A</span></div>`,
          className: "doh-detour-photo-point doh-detour-photo-start",
          iconSize: [36, 26],
          iconAnchor: [-6, 26],
        });
        const startMarker = L.marker([startLat, startLon], { icon: startPhotoIcon, interactive: true, zIndexOffset: 200 })
          .bindTooltip(`📷 ภาพทางเข้าจุดเริ่มต้น A (${detour.route_name})`, { direction: "top" })
          .bindPopup(
            () => buildDetourPointPhotoPopupHtml(detour, "START", startPhoto, startLat, startLon),
            getResponsivePopupOptions(L, 380, 280, "doh-detour-leaflet-popup")
          )
          .addTo(group);
        startMarker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          startMarker.openPopup();
        });
      }

      if (endPhoto?.url && Number.isFinite(endLat) && Number.isFinite(endLon)) {
        const endPhotoIcon = L.divIcon({
          html: `<div class="doh-detour-photo-badge" style="min-width:34px;height:26px;padding:0 6px;border-radius:999px;background:#0c4a6e;color:#bae6fd;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;gap:3px;font-weight:900;font-size:11px;box-shadow:0 3px 10px rgba(0,0,0,0.6)"><span>📷</span><span>B</span></div>`,
          className: "doh-detour-photo-point doh-detour-photo-end",
          iconSize: [36, 26],
          iconAnchor: [-6, 0],
        });
        const endMarker = L.marker([endLat, endLon], { icon: endPhotoIcon, interactive: true, zIndexOffset: 200 })
          .bindTooltip(`📷 ภาพทางเข้าจุดสิ้นสุด B - ฝั่งขากลับ (${detour.route_name})`, { direction: "top" })
          .bindPopup(
            () => buildDetourPointPhotoPopupHtml(detour, "END", endPhoto, endLat, endLon),
            getResponsivePopupOptions(L, 380, 280, "doh-detour-leaflet-popup")
          )
          .addTo(group);
        endMarker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          endMarker.openPopup();
        });
      }
    });

    // Keep stacking order: highways (bottom) < detours < floods < drafts.
    raisePathLayers(group, floodGroupRef.current, draftGroupRef.current);
    return () => {
      detourLinesRef.current = [];
      group.clearLayers();
    };
  }, [mapReady, systemData.detourRoutes, effectiveShowDetourLayer, mapStyles]);

  // 4d. Flood routes + capsule markers (Item 3: Hide flood line from current map when confirmed water_level_cm === 0, while preserving DB history).
  useEffect(() => {
    const L = leafletRef.current;
    const group = floodGroupRef.current;
    floodLinesRef.current = {};
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowFloodLayer) return;
    const renderer = rendererRef.current;
    const floodStyle = mapStyles.flood;
    const fColor = floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
    const floodWaveIcon = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M2 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0 4-2 6 0"/><path d="M2 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0 4-2 6 0"/></svg>`;
    const floodWaveBadge = `<span style="background:${escapeHtml(fColor)};color:white" class="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/70 shadow-sm" aria-hidden="true">${floodWaveIcon}</span>`;
    const fBaseWeight = floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight;
    const fOpacity = floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity;
    const fDash = floodStyle?.pattern === "dash" ? (floodStyle.dashArray || "8, 6") : undefined;
    const className = lineAnimationClasses(floodStyle, allowLineAnimationRef.current);

    const countDetoursForFlood = (flood: FloodRoute) =>
      getLinkedDetoursForFlood(flood, systemData).length;
    const floodPopupOpts = getResponsivePopupOptions(L, 370, 300, "doh-flood-leaflet-popup");

    // 4d. Flood routes + capsule markers (with De-overlapping, Priority z-Index & Merged/Segment modes)
    const visibleFloods = (systemData.floodRoutes || []).filter(
      (flood) => isFloodLineVisibleOnCurrentMap(flood)
    );

    // First draw polylines for all visible flood routes using configured unified line style
    visibleFloods.forEach((flood) => {
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        const selectedWeight = fBaseWeight + (flood.id === selectedFloodIdRef.current ? 1.5 : 0);
        const latLngs = coords.map(toLeafletLatLng);
        const casing = addLineCasing(L, group, latLngs, floodStyle || {}, selectedWeight, renderer);
        const polyline = L.polyline(coords.map(toLeafletLatLng) as any, {
          color: fColor,
          weight: selectedWeight,
          opacity: fOpacity,
          dashArray: fDash,
          className,
          renderer,
        }).addTo(group);
        floodLinesRef.current[flood.id] = {
          line: polyline,
          baseWeight: fBaseWeight,
          casing,
          baseBorderWidth: Number(floodStyle?.borderWidth) || 0,
        };
        polyline.bindPopup(() => buildFloodPopupHtml(flood, countDetoursForFlood(flood)), floodPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          polyline.openPopup(e.latlng);
        });
      }
    });

    if (floodDisplayMode === "EVENTS") {
      // Merged parent event capsule markers
      const parentEvents = groupFloodRoutesIntoEvents(visibleFloods);
      parentEvents.forEach((ev) => {
        let sumLat = 0;
        let sumLon = 0;
        let count = 0;
        ev.segments.forEach((seg) => {
          const coords = parseRouteCoordinates(seg.coordinates_json);
          const mid = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
          const lat = mid ? mid[1] : (seg.lat_start || APP_CONFIG.DEFAULT_CENTER.lat);
          const lon = mid ? mid[0] : (seg.lon_start || APP_CONFIG.DEFAULT_CENTER.lon);
          sumLat += lat;
          sumLon += lon;
          count++;
        });
        const centerLat = count > 0 ? sumLat / count : APP_CONFIG.DEFAULT_CENTER.lat;
        const centerLon = count > 0 ? sumLon / count : APP_CONFIG.DEFAULT_CENTER.lon;

        const evPresentation = getTrafficPresentation(ev.mostSevereStatus, ev.maxWaterLevelCm);
        const zIndexMap = { red: 1000, orange: 800, amber: 700, sky: 600, slate: 400, emerald: 200 } as const;
        const zIndex = zIndexMap[evPresentation.color];
        const capsuleClass = evPresentation.capsuleClass;

        const pinIcon = L.divIcon({
          html: `
            <div class="${capsuleClass}">
              ${floodWaveBadge}
              <span>ทล.${escapeHtml(ev.routeNo)} [${ev.segments.length} ช่วง]</span>
              <span class="opacity-90">(${escapeHtml(ev.maxWaterLevelCm)} ซม.)</span>
            </div>
          `,
          className: "doh-map-capsule-pin",
          iconSize: [140, 28],
          iconAnchor: [70, 14],
        });

        const primarySeg = ev.segments[0];
        const marker = L.marker([centerLat, centerLon], { icon: pinIcon, zIndexOffset: zIndex }).addTo(group);
        marker.bindPopup(() => buildFloodPopupHtml(primarySeg, countDetoursForFlood(primarySeg)), floodPopupOpts);
        marker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          marker.openPopup();
        });
      });
    } else {
      // Individual segment markers with smart de-overlapping & priority z-index
      type MarkerCandidate = {
        flood: FloodRoute;
        lat: number;
        lon: number;
        dirCode: string;
        zIndex: number;
        capsuleClass: string;
        statusLabel: string;
        sideBadge: string;
        levelText: string;
      };

      const candidates: MarkerCandidate[] = visibleFloods.map((flood) => {
        const coords = parseRouteCoordinates(flood.coordinates_json);
        const midCoord = coords.length > 0 ? coords[Math.floor(coords.length / 2)] : null;
        const lat = midCoord ? midCoord[1] : (flood.lat_start || APP_CONFIG.DEFAULT_CENTER.lat);
        const lon = midCoord ? midCoord[0] : (flood.lon_start || APP_CONFIG.DEFAULT_CENTER.lon);

        const meta = flood.direction_meta;
        const trafficDetail = meta?.trafficStatusDetail;
        const waterKnown = meta?.water_level_known !== false;
        const levelText = waterKnown ? `${flood.water_level_cm} ซม.` : "รอวัดระดับน้ำ";

        const presentation = getTrafficPresentation(
          flood.traffic_status,
          flood.water_level_cm ?? 0,
          trafficDetail
        );
        const zIndexMap = { red: 1000, orange: 800, amber: 700, sky: 600, slate: 400, emerald: 200 } as const;
        const zIndex = zIndexMap[presentation.color];
        const capsuleClass = presentation.capsuleClass;
        const statusLabel = presentation.label;

        // Never guess a missing direction as two-way: unknown stays UNKNOWN (no side badge, no lateral offset by direction).
        const dirCode = meta?.directionCode || (flood.road_side === "LEFT" ? "A_TO_B" : flood.road_side === "RIGHT" ? "B_TO_A" : flood.road_side === "BOTH" ? "BOTH" : "UNKNOWN");
        const sideBadge = dirCode === "A_TO_B"
          ? " [ขาไป]"
          : dirCode === "B_TO_A"
            ? " [ขากลับ]"
            : flood.road_side === "LEFT"
              ? " [ซ้าย]"
              : flood.road_side === "RIGHT"
                ? " [ขวา]"
                : "";

        return {
          flood,
          lat,
          lon,
          dirCode,
          zIndex,
          capsuleClass,
          statusLabel,
          sideBadge,
          levelText,
        };
      });

      // Cluster candidates within proximity (< ~35m or 0.00035 deg) to prevent stacking
      const clusters: MarkerCandidate[][] = [];
      const assigned = new Set<number>();

      for (let i = 0; i < candidates.length; i++) {
        if (assigned.has(i)) continue;
        const c1 = candidates[i];
        const groupList: MarkerCandidate[] = [c1];
        assigned.add(i);

        for (let j = i + 1; j < candidates.length; j++) {
          if (assigned.has(j)) continue;
          const c2 = candidates[j];
          const distLat = Math.abs(c1.lat - c2.lat);
          const distLon = Math.abs(c1.lon - c2.lon);
          const isSameEvent = Boolean(c1.flood.direction_meta?.eventId && c1.flood.direction_meta.eventId === c2.flood.direction_meta?.eventId);
          if ((distLat < 0.00035 && distLon < 0.00045) || (isSameEvent && distLat < 0.0008 && distLon < 0.0008)) {
            groupList.push(c2);
            assigned.add(j);
          }
        }
        clusters.push(groupList);
      }

      clusters.forEach((cluster) => {
        const count = cluster.length;
        cluster.forEach((item, idx) => {
          let renderLat = item.lat;
          let renderLon = item.lon;

          if (count === 2) {
            // Smart lateral offset for dual carriageways (A->B vs B->A)
            if (item.dirCode === "A_TO_B") {
              renderLat += 0.00018;
              renderLon -= 0.00012;
            } else if (item.dirCode === "B_TO_A") {
              renderLat -= 0.00018;
              renderLon += 0.00012;
            } else {
              renderLat += idx === 0 ? 0.00018 : -0.00018;
            }
          } else if (count > 2) {
            const factor = idx - (count - 1) / 2;
            renderLat += factor * 0.00022;
            renderLon += factor * 0.00012;
          }

          // 3-Tier Zoom Adaptive Markers (P6-03: Compact Flood Marker)
          let pinHtml = "";
          let pinSize: [number, number] = [130, 28];
          let pinAnchor: [number, number] = [65, 14];

          if (currentZoom <= 10) {
            // ซูมไกล: แสดงเฉพาะไอคอนสถานะในทรงกลมกะทัดรัด 28x28px
            pinSize = [28, 28];
            pinAnchor = [14, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-far" style="background:${escapeHtml(fColor)}" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                ${floodWaveIcon}
              </div>
            `;
          } else if (currentZoom >= 11 && currentZoom <= 13) {
            // ซูมกลาง: แสดงไอคอนสถานะ + หมายเลขทางหลวง
            pinSize = [96, 28];
            pinAnchor = [48, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-mid" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                ${floodWaveBadge}
                <span>ทล.${escapeHtml(item.flood.route_no)}</span>
              </div>
            `;
          } else {
            // ซูมใกล้: ไอคอนสถานะ + ทล. + ระดับน้ำ (เช่น ⚠ ทล.4075 · 60 ซม.) — สีมาจากสถานะที่เจ้าหน้าที่บันทึก ไม่คำนวณจากระดับน้ำ
            const isPending = item.statusLabel === "รอตรวจสอบสถานะ";
            pinSize = [isPending ? 244 : 168, 28];
            pinAnchor = [isPending ? 122 : 84, 14];
            pinHtml = `
              <div class="${item.capsuleClass} doh-capsule-zoom-near" title="ทล.${escapeHtml(item.flood.route_no)}${escapeHtml(item.sideBadge)} - ${escapeHtml(item.statusLabel)}">
                ${floodWaveBadge}
                <span>ทล.${escapeHtml(item.flood.route_no)}</span>
                <span class="opacity-95 font-mono text-[11px]">· ${escapeHtml(item.levelText)}</span>
                ${isPending ? '<span class="bg-black/25 px-1.5 py-0.5 rounded text-[10px] font-bold">รอตรวจสอบ</span>' : ""}
              </div>
            `;
          }

          const pinIcon = L.divIcon({
            html: pinHtml,
            className: "doh-map-capsule-pin",
            iconSize: pinSize,
            iconAnchor: pinAnchor,
          });

          const marker = L.marker([renderLat, renderLon], {
            icon: pinIcon,
            zIndexOffset: item.zIndex,
          }).addTo(group);

          marker.bindPopup(() => buildFloodPopupHtml(item.flood, countDetoursForFlood(item.flood)), floodPopupOpts);
          marker.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            marker.openPopup();
          });
        });
      });
    }

    raisePathLayers(group, draftGroupRef.current);
    return () => {
      group.clearLayers();
      floodLinesRef.current = {};
    };
  }, [mapReady, systemData.floodRoutes, systemData.detourRoutes, effectiveShowFloodLayer, floodDisplayMode, mapStyles, currentZoom]);

  // Leaflet's Canvas renderer intentionally ignores CSS class animation. Animate only
  // the already-drawn flood/detour paths at a low fixed rate, so the style editor's
  // motion settings are visible without changing renderer or rebuilding GIS layers.
  useEffect(() => {
    if (!mapReady || !allowLineAnimation) return;
    const floodStyle = mapStyles.flood;
    const detourStyle = mapStyles.detour;
    const floodAnimation = floodStyle?.animation || "none";
    const detourAnimation = detourStyle?.animation || "none";
    if (floodAnimation === "none" && detourAnimation === "none") return;

    const entries = [
      ...Object.values(floodLinesRef.current).map((entry) => ({
        ...entry,
        baseOpacity: floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity,
        animation: floodAnimation,
      })),
      ...detourLinesRef.current.map((entry) => ({ ...entry, animation: detourAnimation })),
    ].filter((entry) => entry.line && entry.animation !== "none");
    if (entries.length === 0) return;

    let phase = 0;
    const tick = () => {
      phase = (phase + 1) % 200;
      entries.forEach((entry) => {
        const speed = entry.animation === "blink" ? 1.8 : entry.animation === "pulse" ? 0.7 : 1.2;
        const wave = (Math.sin(phase * speed * 0.35) + 1) / 2;
        if (entry.animation === "pulse") {
          entry.line.setStyle({ opacity: Math.max(0.35, entry.baseOpacity * (0.62 + wave * 0.38)), weight: entry.baseWeight + wave * 0.8 });
        } else if (entry.animation === "blink") {
          entry.line.setStyle({ opacity: wave > 0.45 ? entry.baseOpacity : Math.max(0.25, entry.baseOpacity * 0.42) });
        } else {
          // Chaser/arrows move the existing dash pattern; Canvas supports dashOffset
          // while avoiding a new DOM/SVG element per route.
          entry.line.setStyle({ dashOffset: String(-phase * (entry.animation === "arrows" ? 2 : 1.2)) });
        }
      });
    };
    tick();
    const timer = window.setInterval(tick, 140);
    return () => {
      window.clearInterval(timer);
      entries.forEach((entry) => entry.line.setStyle({ opacity: entry.baseOpacity, weight: entry.baseWeight, dashOffset: "0" }));
    };
  }, [mapReady, allowLineAnimation, mapStyles, systemData.floodRoutes, systemData.detourRoutes, showFloodLayer, showDetourLayer]);

  // 4e. Selected flood: restyle one polyline in place instead of redrawing the map.
  useEffect(() => {
    Object.entries(floodLinesRef.current).forEach(([id, entry]) => {
      const selectedDelta = id === selectedFloodId ? 1.5 : 0;
      entry.line.setStyle({ weight: entry.baseWeight + selectedDelta });
      entry.casing?.setStyle({ weight: entry.baseWeight + selectedDelta + (entry.baseBorderWidth || 0) * 2 });
    });
  }, [selectedFloodId, mapReady, systemData.floodRoutes, showFloodLayer, mapStyles]);

  // 4f. Admin draft route (A->B and B->A), conflict alerts, imported-GIS preview and draggable markers.
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

    // Snapped draft route (Primary / Forward A->B)
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
        const mode = adminPickModeRef.current;
        if (mode !== "ADD_WAYPOINT" && mode !== "ADD_REVERSE_WAYPOINT") return;
        L.DomEvent.stopPropagation(event);
        const point = event.latlng;
        onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), mode);
      });
    }

    // Snapped reverse draft route (B->A for Detour or Dual Carriageway preview)
    if (draftReverseCoordinates.length >= 2) {
      const revDraftLine = L.polyline(draftReverseCoordinates.map(toLeafletLatLng) as any, {
        color: "#38bdf8",
        weight: 5,
        dashArray: "6, 6",
        opacity: 0.95,
        renderer,
      }).addTo(group);
      revDraftLine.on("click", (event: any) => {
        if (adminPickModeRef.current !== "ADD_REVERSE_WAYPOINT") return;
        L.DomEvent.stopPropagation(event);
        const point = event.latlng;
        onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), "ADD_REVERSE_WAYPOINT");
      });
    }

    // Closed-road conflict warning markers on draft detour
    draftConflictPoints.forEach((pt, idx) => {
      const [lat, lng] = toLeafletLatLng(pt);
      const conflictIcon = L.divIcon({
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;box-shadow:0 0 12px rgba(220,38,38,0.9)">!</div>`,
        className: "doh-conflict-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([lat, lng], { icon: conflictIcon, zIndexOffset: 1500 })
        .bindTooltip(`⚠️ จุดตัดผ่านถนนที่ปิดการจราจร (#${idx + 1}) — ห้ามใช้เส้นทางนี้`, { direction: "top" })
        .addTo(group);
    });

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

    // Numbered draggable waypoints for forward path (A->B)
    draftWaypoints.forEach((wp, idx) => {
      const wpIcon = L.divIcon({
        html: `<div class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 border-2 border-slate-950 font-heading font-black text-[11px] flex items-center justify-center shadow-lg cursor-move">${idx + 1}</div>`,
        className: "doh-wp-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const wpMarker = L.marker([wp[1], wp[0]], { icon: wpIcon, draggable: true }).addTo(group);
      wpMarker.bindTooltip(`จุดดัดขาไป A→B ที่ ${idx + 1} (ลากหมุดเพื่อขยับแนวถนน)`, { direction: "top" });
      wpMarker.on("dragend", (ev: any) => {
        const pos = ev.target.getLatLng();
        onWaypointDraggedRef.current?.(idx, [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))]);
      });
    });

    // Numbered draggable waypoints for reverse path (B->A)
    draftReverseWaypoints.forEach((wp, idx) => {
      const wpIcon = L.divIcon({
        html: `<div class="w-6 h-6 rounded-full bg-sky-400 text-slate-950 border-2 border-slate-950 font-heading font-black text-[11px] flex items-center justify-center shadow-lg cursor-move">R${idx + 1}</div>`,
        className: "doh-wp-rev-marker",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const wpMarker = L.marker([wp[1], wp[0]], { icon: wpIcon, draggable: true }).addTo(group);
      wpMarker.bindTooltip(`จุดดัดขากลับ B→A ที่ ${idx + 1} (ลากหมุดเพื่อขยับแนวถนน)`, { direction: "top" });
      wpMarker.on("dragend", (ev: any) => {
        const pos = ev.target.getLatLng();
        onReverseWaypointDraggedRef.current?.(idx, [Number(pos.lng.toFixed(6)), Number(pos.lat.toFixed(6))]);
      });
    });

    raisePathLayers(group);
    return () => {
      draftLineRef.current = null;
      group.clearLayers();
    };
  }, [mapReady, incomingGisLines, draftCoordinates, draftReverseCoordinates, draftWaypoints, draftReverseWaypoints, draftConflictPoints, draftPickMarkers, draftMode, mapStyles]);

  // 4f-arrows. Directional Arrow System (Items 2 & 4): Viewport-culled, zoom-gated directional arrows for highways, detours, and active draft previews.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = arrowGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const MAX_ARROWS = 160;

    const placeArrowsOnLine = (
      coords: [number, number][],
      direction: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN",
      color: string,
      sizePx: number,
      spacingPx: number,
      bgBadge: string | null,
      viewport: any,
      counter: { count: number }
    ) => {
      if (direction === "UNKNOWN" || coords.length < 2 || counter.count >= MAX_ARROWS) return;
      const latLngs = coords.map(toLeafletLatLng);
      let accumPx = spacingPx * 0.45;

      for (let i = 0; i < latLngs.length - 1 && counter.count < MAX_ARROWS; i++) {
        const p1 = latLngs[i];
        const p2 = latLngs[i + 1];
        if (!viewport.contains(p1) && !viewport.contains(p2)) continue;

        const pt1 = map.latLngToContainerPoint(p1);
        const pt2 = map.latLngToContainerPoint(p2);
        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const segLenPx = Math.hypot(dx, dy);
        if (segLenPx < 6) continue;

        while (accumPx + segLenPx >= spacingPx && counter.count < MAX_ARROWS) {
          const remain = spacingPx - accumPx;
          const ratio = Math.max(0, Math.min(1, remain / segLenPx));
          const lat = p1[0] + (p2[0] - p1[0]) * ratio;
          const lng = p1[1] + (p2[1] - p1[1]) * ratio;

          if (viewport.contains([lat, lng])) {
            let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (direction === "REVERSE") angleDeg += 180;

            const svgHtml =
              direction === "TWO_WAY"
                ? `<div style="transform:rotate(${angleDeg.toFixed(1)}deg);width:${sizePx + 6}px;height:${sizePx + 6}px;display:flex;align-items:center;justify-content:center;${bgBadge ? `background:${bgBadge};border-radius:999px;border:1px solid rgba(255,255,255,0.75);box-shadow:0 1px 4px rgba(0,0,0,0.45);` : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));"}"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8l4 4-4 4"/><path d="M7 16l-4-4 4-4"/><path d="M3 12h18"/></svg></div>`
                : `<div style="transform:rotate(${angleDeg.toFixed(1)}deg);width:${sizePx + 4}px;height:${sizePx + 4}px;display:flex;align-items:center;justify-content:center;${bgBadge ? `background:${bgBadge};border-radius:999px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 1px 4px rgba(0,0,0,0.45);` : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));"}"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></div>`;

            const icon = L.divIcon({
              html: svgHtml,
              className: "doh-dir-arrow-icon",
              iconSize: [sizePx + 6, sizePx + 6],
              iconAnchor: [(sizePx + 6) / 2, (sizePx + 6) / 2],
            });
            L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(group);
            counter.count++;
          }
          accumPx -= spacingPx;
        }
        accumPx += segLenPx;
      }
    };

    const drawArrows = () => {
      group.clearLayers();
      const z = map.getZoom();
      const viewport = map.getBounds().pad(0.15);
      const counter = { count: 0 };

      // 1. Draft preview arrows (always shown at zoom >= 11 so admin can inspect before saving)
      if (z >= 11 && draftCoordinates.length >= 2) {
        const isDetourDraft = draftMode === "DETOUR";
        const effectiveDir = draftReverseCoordinates.length >= 2 ? "FORWARD" : draftDirectionMeta;
        placeArrowsOnLine(
          draftCoordinates,
          effectiveDir,
          isDetourDraft ? "#0f172a" : "#ffffff",
          13,
          110,
          isDetourDraft ? "#f59e0b" : "#0284c7",
          viewport,
          counter
        );
      }
      if (z >= 11 && draftReverseCoordinates.length >= 2) {
        placeArrowsOnLine(
          draftReverseCoordinates,
          "FORWARD",
          "#0f172a",
          13,
          110,
          "#38bdf8",
          viewport,
          counter
        );
      }

      // While editing a line, keep the map focused on the draft. Rebuilding
      // decorative markers for every active route competes with vertex dragging.
      if (vertexEditable) return;

      // 2. Active Detour Route Arrows (Item 4)
      const detourStyle = mapStyles.detour;
      const showDetourArrows = detourStyle?.showArrows ?? true;
      const detourMinZoom = detourStyle?.arrowMinZoom ?? 11;
      if (showDetourLayer && showDetourArrows && z >= detourMinZoom) {
        const dArrowColor = detourStyle?.arrowColor || "#0f172a";
        const dArrowSize = detourStyle?.arrowSize || 12;
        const dArrowSpacing = detourStyle?.arrowSpacingPx || 120;
        const dBadgeBg = detourStyle?.color || "#FBC02D";

        (systemData.detourRoutes || []).forEach((detour) => {
          if (!detour.is_active) return;
          if (detour.detour_meta?.show_arrows === false) return;
          const dirMode = detour.direction_mode || "TWO_WAY";
          const fwd = parseRouteCoordinates(detour.coordinates_json);
          const rev = parseRouteCoordinates(detour.reverse_coordinates_json);

          if (dirMode === "FORWARD_ONLY") {
            placeArrowsOnLine(fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
          } else if (dirMode === "REVERSE_ONLY") {
            const target = rev.length >= 2 ? rev : fwd;
            placeArrowsOnLine(target, rev.length >= 2 ? "FORWARD" : "REVERSE", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
          } else {
            if (rev.length >= 2) {
              placeArrowsOnLine(fwd, "FORWARD", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
              placeArrowsOnLine(rev, "FORWARD", "#0f172a", dArrowSize, dArrowSpacing, "#38bdf8", viewport, counter);
            } else {
              placeArrowsOnLine(fwd, "TWO_WAY", dArrowColor, dArrowSize, dArrowSpacing, dBadgeBg, viewport, counter);
            }
          }
        });
      }

      // 3. Highway Network Arrows (Item 2: Only draw on features with explicit directional metadata or when zoomed in >= 12)
      const priStyle = mapStyles.primary;
      const secStyle = mapStyles.secondary;
      if (z >= 12) {
        (systemData.highwayLayers || []).forEach((layer) => {
          if (!layer.is_visible || !layer.geojson_data) return;
          const isMain = layer.layer_id === "MAIN_HIGHWAY";
          geoJsonFeatures(layer.geojson_data).forEach((feature: any) => {
            const props = feature?.properties || {};
            if (props.is_visible === false) return;
            const featureIsMain = props.highway_type === "MAIN_HIGHWAY" ? true : props.highway_type === "SECOND_HIGHWAY" ? false : isMain;
            if (featureIsMain ? !showMainHwy : !showSecHwy) return;
            if (!featureIsMain && !showSecondaryAtCurrentZoom) return;

            const st = featureIsMain ? priStyle : secStyle;
            const allowLayerArrows = (st?.showArrows ?? true) && z >= (st?.arrowMinZoom ?? (featureIsMain ? 12 : 13));
            if (!allowLayerArrows && !props.arrow_direction) return;

            // Only draw highway arrows when direction metadata is known (never guess from raw vertex order alone)
            const dirMeta: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN" =
              props.arrow_direction === "FORWARD" || props.traffic_direction === "ONE_WAY_FORWARD"
                ? "FORWARD"
                : props.arrow_direction === "REVERSE" || props.traffic_direction === "ONE_WAY_REVERSE"
                  ? "REVERSE"
                  : props.arrow_direction === "TWO_WAY" || props.carriageway_type === "SINGLE_CENTERLINE" || props.lanes?.includes("2") || props.lanes?.includes("๒")
                    ? "TWO_WAY"
                    : props.arrow_direction === "UNKNOWN"
                      ? "UNKNOWN"
                      : "TWO_WAY";

            if (props.show_arrows === false || dirMeta === "UNKNOWN") return;
            const geom = feature?.geometry;
            const lines: [number, number][][] =
              geom?.type === "LineString"
                ? [geom.coordinates]
                : geom?.type === "MultiLineString"
                  ? geom.coordinates
                  : [];
            const arrowColor = props.arrow_color || st?.arrowColor || "#ffffff";
            const arrowSize = Number(props.arrow_size || st?.arrowSize || (featureIsMain ? 11 : 10));
            const arrowSpacing = Number(props.arrow_spacing_px || st?.arrowSpacingPx || (featureIsMain ? 160 : 180));

            lines.forEach((lineCoords) => {
              placeArrowsOnLine(lineCoords, dirMeta, arrowColor, arrowSize, arrowSpacing, null, viewport, counter);
            });
          });
        });
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(drawArrows, 150);
    };

    drawArrows();
    map.on("moveend zoomend", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend zoomend", schedule);
      group.clearLayers();
    };
  }, [mapReady, systemData.highwayLayers, systemData.detourRoutes, mapStyles, showMainHwy, showSecHwy, showDetourLayer, showSecondaryAtCurrentZoom, draftCoordinates, draftReverseCoordinates, draftDirectionMeta, draftMode, vertexEditable]);

  // 4h. Freeform vertex editor: draggable handle on every vertex + "+" handle on every segment middle.
  // Only vertices inside the viewport are drawn (at most MAX_VERTEX_HANDLES), so long lines stay fast.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = vertexGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    const geometryToEdit = vertexEditCoordinates ?? draftCoordinates;
    if (!vertexEditable || geometryToEdit.length < 2) return;

    const working: [number, number][] = geometryToEdit.map(toLeafletLatLng);
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
          if (!vertexEditCoordinates || vertexEditCoordinates === draftCoordinates) draftLineRef.current?.setLatLngs(working);
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
  }, [mapReady, vertexEditable, draftCoordinates, vertexEditCoordinates]);

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
      marker.bindPopup(() => buildOfficePopupHtml(office), getResponsivePopupOptions(L, 320, 220, ""));
    });

    return () => {
      group.clearLayers();
    };
  }, [mapReady, systemData.offices, showOffices, publicMode, editableOfficeId]);

  return (
    <div className={`relative ${className} ${isMapPopupOpen ? "doh-map-popup-open" : ""} overflow-hidden w-full h-full min-h-[450px]`} style={{ minHeight: 450 }}>
      <div
        ref={mapContainerRef}
        className="w-full h-full min-h-[350px] bg-[#0b1426] relative z-0"
        style={{ position: "absolute", inset: 0, minHeight: 450 }}
      />

      <MapLegendOverlay
        systemData={systemData}
        mapStyles={mapStyles}
        mapReady={mapReady}
        isMapPopupOpen={isMapPopupOpen}
        isLayerControlCollapsed={isLayerControlCollapsed}
        setIsLayerControlCollapsed={setIsLayerControlCollapsed}
        showFloodLayer={showFloodLayer}
        setShowFloodLayer={setShowFloodLayer}
        effectiveShowFloodLayer={effectiveShowFloodLayer}
        floodDisplayMode={floodDisplayMode}
        setFloodDisplayMode={setFloodDisplayMode}
        showDetourLayer={showDetourLayer}
        setShowDetourLayer={setShowDetourLayer}
        effectiveShowDetourLayer={effectiveShowDetourLayer}
        showMainHwy={showMainHwy}
        setShowMainHwy={setShowMainHwy}
        showSecHwy={showSecHwy}
        setShowSecHwy={setShowSecHwy}
        showSecondaryAtCurrentZoom={showSecondaryAtCurrentZoom}
        forceShowAllHighways={forceShowAllHighways}
        setForceShowAllHighways={setForceShowAllHighways}
        showOffices={showOffices}
        setShowOffices={setShowOffices}
        showHighwayShields={showHighwayShields}
        setShowHighwayShields={setShowHighwayShields}
        legendRouteList={legendRouteList}
        setLegendRouteList={setLegendRouteList}
        legendRoutes={legendRoutes}
        activeBaseMap={activeBaseMap}
        switchBaseMap={switchBaseMap}
        resetCamera={resetCamera}
        locateUser={locateUser}
        isLocating={isLocating}
        locationStatus={locationStatus}
        previewPointPhoto={previewPointPhoto}
        setPreviewPointPhoto={setPreviewPointPhoto}
      />
    </div>
  );
}
