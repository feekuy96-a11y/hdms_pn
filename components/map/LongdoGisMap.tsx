"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload, DetourRoute } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { MapLegendOverlay } from "./MapLegendOverlay";
import {
  escapeHtml,
  isFloodLineVisibleOnCurrentMap,
  toLeafletLatLng,
  EMPTY_COORDS,
  EMPTY_LINES,
  EMPTY_PICK_MARKERS,
  MAX_VISIBLE_SHIELDS,
  type FloodLineEntry,
  type AnimatedLineEntry,
  addLineCasing,
  routeCodeOf,
  routeNameOf,
  geoJsonFeatures,
  lineAnimationClasses,
  dashArrayFor,
  raisePathLayers,
  getResponsivePopupOptions,
  buildHighwayPopupHtml,
  buildOfficePopupHtml,
  buildDetourPointPhotoPopupHtml,
  parseRouteCoordinates,
} from "./longdo-map-popups";
import {
  buildDetourPhotoBadgeSpec,
  collectCriticalHighwayRouteNos,
  collectHighwayShieldCandidates,
  collectLegendRoutes,
  resolveHighwayForegroundStyle,
  shouldShowHighwayFeature,
  resolveDetourPhotoPointCoords,
} from "./longdo-layer-builders";
import { placeArrowsOnLine, renderDirectionalArrows } from "./longdo-arrow-layer";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
import { renderVertexEditHandles } from "./longdo-vertex-handles";
import { renderDraftAndConflictLayer } from "./longdo-draft-layer";
import { useLongdoPopupBridge, useLongdoRouteLayers } from "./useLongdoRouteLayers";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import {
  collectFocusBoundsPoints,
  resolveDetourFocusGeometry,
  resolveFloodFocusData,
  type GisFocusDirection,
  type GisFocusState,
  type GisFocusViewportSnapshot,
} from "@/lib/gis-focus-mode";

export interface GisMapViewportApi {
  getViewport: () => GisFocusViewportSnapshot | null;
  restoreViewport: (viewport: GisFocusViewportSnapshot) => void;
  closePopup: () => void;
}

export { isFloodLineVisibleOnCurrentMap } from "./longdo-map-popups";

const EMPTY_IDS: string[] = [];

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
  /** Public-list filter: keep non-matching safety routes visible but de-emphasized. */
  highlightFloodIds?: string[];
  highlightDetourIds?: string[];
  isFilterActive?: boolean;
  searchQuery?: string;
  highlightHighwayRouteNos?: string[];
  activeCardFocus?: { floodIds: string[]; detourIds: string[]; highwayRouteNos: string[] } | null;
  /** Shared GIS Focus Mode state (Presentation Override on the existing Map Instance). */
  gisFocus?: GisFocusState | null;
  /** Imperative viewport snapshot/restore bridge for Shared GIS Focus Mode. */
  mapViewportApiRef?: React.MutableRefObject<GisMapViewportApi | null>;
  /** Enter Shared GIS Focus Mode directly from flood map popup. */
  onFocusFloodOnMap?: (floodId: string) => void;
  /** Enter Shared GIS Focus Mode directly from detour map popup. */
  onFocusDetourOnMap?: (detourId: string, direction: GisFocusDirection) => void;
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
  highlightFloodIds = EMPTY_IDS,
  highlightDetourIds = EMPTY_IDS,
  isFilterActive = false,
  searchQuery = "",
  highlightHighwayRouteNos = EMPTY_IDS,
  activeCardFocus = null,
  gisFocus = null,
  mapViewportApiRef,
  onFocusFloodOnMap,
  onFocusDetourOnMap,
}: LongdoGisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const highwayGroupRef = useRef<any>(null);
  const highwayFeatureKeysRef = useRef(new WeakMap<object, string>());
  const shieldGroupRef = useRef<any>(null);
  const detourGroupRef = useRef<any>(null);
  const floodGroupRef = useRef<any>(null);
  const draftGroupRef = useRef<any>(null);
  const arrowGroupRef = useRef<any>(null);
  const draftLineRef = useRef<any>(null);
  const revDraftLineRef = useRef<any>(null);
  const vertexGroupRef = useRef<any>(null);
  const officeGroupRef = useRef<any>(null);
  const focusGroupRef = useRef<any>(null);
  const isProgrammaticMoveRef = useRef(false);
  const userInteractedDuringFocusRef = useRef(false);
  const lastFittedRequestIdRef = useRef<number>(0);
  const floodLinesRef = useRef<Record<string, FloodLineEntry & { baseOpacity: number; filterOpacity: number }>>({});
  const detourLinesRef = useRef<Array<AnimatedLineEntry & { id: string; filterOpacity: number }>>([]);
  const userLocationMarkerRef = useRef<any>(null);
  const baseLayersRef = useRef<Record<string, any>>({});
  const currentBaseKeyRef = useRef<string>("longdo");

  const [activeBaseMap, setActiveBaseMap] = useState<"road" | "sat" | "longdo">("longdo");
  const [isLayerControlCollapsed, setIsLayerControlCollapsed] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [isMapPopupOpen, setIsMapPopupOpen] = useState(false);
  const [activePopupEntity, setActivePopupEntity] = useState<{ type: "HIGHWAY" | "FLOOD" | "DETOUR"; id: string } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(APP_CONFIG.DEFAULT_ZOOM);
  const [forceShowAllHighways, setForceShowAllHighways] = useState(false);
  const isFocusMode = gisFocus?.status === "focused";
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [floodDisplayMode, setFloodDisplayMode] = useState<"SEGMENTS" | "EVENTS">("SEGMENTS");
  const [showDetourLayer, setShowDetourLayer] = useState(true);
  const effectiveShowFloodLayer = isFocusMode ? false : showFloodLayer;
  const effectiveShowDetourLayer = isFocusMode ? false : showDetourLayer;
  const [showMainHwy, setShowMainHwy] = useState(true);
  const [showSecHwy, setShowSecHwy] = useState(true);
  const [showHighwayShields, setShowHighwayShields] = useState(false);
  const [showOffices, setShowOffices] = useState(true);
  const effectiveShowMainHwy = isFocusMode ? false : showMainHwy;
  const effectiveShowSecHwy = isFocusMode ? false : showSecHwy;
  const effectiveShowHighwayShields = isFocusMode ? false : showHighwayShields;
  const effectiveShowOffices = isFocusMode ? false : showOffices;
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [legendRouteList, setLegendRouteList] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY" | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [previewPointPhoto, setPreviewPointPhoto] = useState<{ url: string; title: string } | null>(null);

  const mapStyles = systemData.mapStyles || DEFAULT_MAP_STYLES;
  const legendRoutes = (type: "MAIN_HIGHWAY" | "SECOND_HIGHWAY") =>
    collectLegendRoutes(systemData.highwayLayers, type);

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
  const onFocusFloodOnMapRef = useRef(onFocusFloodOnMap);
  onFocusFloodOnMapRef.current = onFocusFloodOnMap;
  const onFocusDetourOnMapRef = useRef(onFocusDetourOnMap);
  onFocusDetourOnMapRef.current = onFocusDetourOnMap;
  const selectedFloodIdRef = useRef(selectedFloodId);
  selectedFloodIdRef.current = selectedFloodId;
  const systemDataRef = useRef(systemData);
  systemDataRef.current = systemData;

  // Global popup handlers for direction toggling, opening modal, focusing map, and Google Maps navigation
  useLongdoPopupBridge({
    leafletMapRef,
    leafletRef,
    systemDataRef,
    onSelectFloodRef,
    onOpenFloodDetoursRef,
    onSelectDetourRef,
    setPreviewPointPhoto,
  });

  // Route flood & detour popup "ดูตำแหน่งบนแผนที่" actions into Shared GIS Focus Mode when provided
  useEffect(() => {
    const prevFocusFlood = (window as any).__focusFloodOnMap;
    (window as any).__focusFloodOnMap = (id: string) => {
      if (onFocusFloodOnMapRef.current) {
        leafletMapRef.current?.closePopup?.();
        onFocusFloodOnMapRef.current(id);
        return;
      }
      prevFocusFlood?.(id);
    };

    const container = mapContainerRef.current;
    const handlePopupFocusClick = (evt: Event) => {
      if (!onFocusDetourOnMapRef.current) return;
      const target = evt.target as HTMLElement | null;
      const detailBtn = target?.closest?.(".doh-detour-detail-btn") as HTMLButtonElement | null;
      if (!detailBtn) return;
      const popupRoot = detailBtn.closest?.(".doh-detour-popup") as HTMLElement | null;
      if (!popupRoot) return;
      const onclickAttr = detailBtn.getAttribute("onclick") || "";
      const match = onclickAttr.match(/__openDetourModal\((['"])([^'"]+)\1\)/);
      const rawId = match?.[2];
      if (!rawId) return;
      const detour = (systemDataRef.current.detourRoutes || []).find(
        (d) => d.id === rawId || escapeHtml(d.id) === rawId
      );
      const detourId = detour?.id ?? rawId;
      const isReverse = Boolean(
        popupRoot.querySelector('button[id^="detour-btn-rev-"][aria-pressed="true"]')
      );
      evt.preventDefault();
      evt.stopPropagation();
      leafletMapRef.current?.closePopup?.();
      onFocusDetourOnMapRef.current(detourId, isReverse ? "REVERSE" : "FORWARD");
    };

    container?.addEventListener("click", handlePopupFocusClick, true);
    return () => {
      container?.removeEventListener("click", handlePopupFocusClick, true);
      if (prevFocusFlood) {
        (window as any).__focusFloodOnMap = prevFocusFlood;
      } else {
        delete (window as any).__focusFloodOnMap;
      }
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
        focusGroupRef.current = L.layerGroup().addTo(map);

        setCurrentZoom(map.getZoom());
        map.on("zoomend", () => {
          setCurrentZoom(map.getZoom());
        });
        map.on("dragstart zoomstart", () => {
          if (!isProgrammaticMoveRef.current) {
            userInteractedDuringFocusRef.current = true;
          }
        });

        if (mapViewportApiRef) {
          mapViewportApiRef.current = {
            getViewport: () => {
              const center = map.getCenter();
              return {
                center: [center.lng, center.lat],
                zoom: map.getZoom(),
              };
            },
            restoreViewport: (vp) => {
              isProgrammaticMoveRef.current = true;
              map.stop();
              map.setView([vp.center[1], vp.center[0]], vp.zoom, { animate: true });
              window.setTimeout(() => {
                isProgrammaticMoveRef.current = false;
              }, 350);
            },
            closePopup: () => {
              map.closePopup();
            },
          };
        }

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
        map.on("popupclose", (e: any) => {
          const activePopup = (map as any)._popup;
          setIsMapPopupOpen(Boolean(activePopup && activePopup !== e?.popup && activePopup.isOpen?.()));
          queueMicrotask(() => {
            if (!(map as any)._popup?.isOpen?.()) setActivePopupEntity(null);
          });
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

  const shieldCandidates = useMemo(
    () => collectHighwayShieldCandidates(systemData.highwayLayers),
    [systemData.highwayLayers]
  );

  // Set of highway numbers that currently have active flood or detour incidents (must remain visible even when zoomed out)
  const criticalHighwayRouteNos = useMemo(
    () => collectCriticalHighwayRouteNos(systemData.floodRoutes),
    [systemData.floodRoutes]
  );

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
      geoJsonFeatures(layer.geojson_data).forEach((feature: object, index: number) => {
        highwayFeatureKeysRef.current.set(feature, `${layer.layer_id}:${index}`);
      });
      const isMain = layer.layer_id === "MAIN_HIGHWAY";
      const style = isMain ? mapStyles.primary : mapStyles.secondary;
      const color = style?.color || (isMain ? "#1B5E20" : "#0284c7");
      const weight = style?.weight || (isMain ? 5 : 3.5);
      const opacity = style?.opacity ?? 0.85;
      const className = lineAnimationClasses(style, allowLineAnimationRef.current);

    const shouldShowFeature = (feature: any) =>
      shouldShowHighwayFeature(
        feature,
        isMain,
        effectiveShowMainHwy,
        effectiveShowSecHwy,
        showSecondaryAtCurrentZoom,
        criticalHighwayRouteNos
      );

    const highwayForegroundStyle = (feature: any) =>
      resolveHighwayForegroundStyle(feature, isMain, mapStyles, weight, isLowZoom);

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
              setActivePopupEntity({ type: "HIGHWAY", id: highwayFeatureKeysRef.current.get(feature)! });
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
  }, [mapReady, systemData.highwayLayers, mapStyles, effectiveShowMainHwy, effectiveShowSecHwy, showRoadLabels, showSecondaryAtCurrentZoom, criticalHighwayRouteNos, currentZoom]);

  // 4b. Highway shield labels - viewport-limited, grid-based collision check, redrawn on pan/zoom.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = shieldGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();
    if (!effectiveShowHighwayShields) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      group.clearLayers();
      const z = map.getZoom();
      if (z < 10 && !isFilterActive && !searchQuery.trim() && !activeCardFocus) return;
      const viewport = map.getBounds().pad(0.25);
      const occupied: Record<string, Array<{ x: number; y: number }>> = {};
      let drawn = 0;

      for (const item of shieldCandidates) {
        if (!shouldShowHighwayFeature(
          { properties: { route_no: item.code } }, item.isMain,
          effectiveShowMainHwy, effectiveShowSecHwy, true, criticalHighwayRouteNos,
          Boolean(activeCardFocus) || isFilterActive || Boolean(searchQuery.trim()),
          activeCardFocus?.highwayRouteNos ?? highlightHighwayRouteNos, searchQuery
        )) continue;
        if (drawn >= MAX_VISIBLE_SHIELDS) break;
        if (item.isMain ? !effectiveShowMainHwy : !effectiveShowSecHwy) continue;
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
        sign.on("popupopen", () => {
          let closest: { key: string; distance: number } | null = null;
          const visit = (path: any) => {
            if (path.eachLayer) { path.eachLayer(visit); return; }
            const feature = path.feature;
            if (!feature || String(routeCodeOf(feature.properties)) !== String(item.code)) return;
            const key = highwayFeatureKeysRef.current.get(feature);
            const center = path.getBounds?.().getCenter();
            if (!key || !center) return;
            const distance = L.latLng(item.latlng).distanceTo(center);
            if (!closest || distance < closest.distance) closest = { key, distance };
          };
          highwayGroupRef.current?.eachLayer(visit);
          if (closest) setActivePopupEntity({ type: "HIGHWAY", id: (closest as { key: string }).key });
        });
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
  }, [mapReady, shieldCandidates, effectiveShowHighwayShields, effectiveShowMainHwy, effectiveShowSecHwy, forceShowAllHighways, criticalHighwayRouteNos, isFilterActive, searchQuery, activeCardFocus, highlightHighwayRouteNos]);

  // 4c & 4d. Detour routes + Flood routes & markers Hook
  useLongdoRouteLayers({
    onActivateMapEntity: setActivePopupEntity,
    mapReady,
    systemData,
    mapStyles,
    effectiveShowDetourLayer,
    effectiveShowFloodLayer,
    floodDisplayMode,
    currentZoom,
    leafletRef,
    rendererRef,
    detourGroupRef,
    floodGroupRef,
    draftGroupRef,
    detourLinesRef,
    floodLinesRef,
    allowLineAnimationRef,
    selectedFloodIdRef,
  });

  // Leaflet's Canvas renderer intentionally ignores CSS class animation. Animate only
  // the already-drawn flood/detour paths at a low fixed rate, so the style editor's
  // motion settings are visible without changing renderer or rebuilding GIS layers.
  useEffect(() => {
    if (!mapReady || !allowLineAnimation || isFocusMode) return;
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
        const liveEntry = detourLinesRef.current.find((item) => item.line === entry.line) ?? Object.values(floodLinesRef.current).find((item) => item.line === entry.line);
        if (!liveEntry || liveEntry.filterOpacity === 0) return;
        entry.filterOpacity = liveEntry.filterOpacity;
        const speed = entry.animation === "blink" ? 1.8 : entry.animation === "pulse" ? 0.7 : 1.2;
        const wave = (Math.sin(phase * speed * 0.35) + 1) / 2;
        if (entry.animation === "pulse") {
          entry.line.setStyle({ opacity: Math.max(0.35 * entry.filterOpacity, entry.baseOpacity * entry.filterOpacity * (0.62 + wave * 0.38)), weight: entry.baseWeight + wave * 0.8 });
        } else if (entry.animation === "blink") {
          entry.line.setStyle({ opacity: wave > 0.45 ? entry.baseOpacity * entry.filterOpacity : Math.max(0.25 * entry.filterOpacity, entry.baseOpacity * entry.filterOpacity * 0.42) });
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
      entries.forEach((entry) => entry.line.setStyle({ opacity: entry.baseOpacity * entry.filterOpacity, weight: entry.baseWeight, dashOffset: "0" }));
    };
  }, [mapReady, allowLineAnimation, isFocusMode, mapStyles, systemData.floodRoutes, systemData.detourRoutes, effectiveShowFloodLayer, effectiveShowDetourLayer]);

  // 4e. Selected flood: restyle one polyline in place instead of redrawing the map.
  useEffect(() => {
    Object.entries(floodLinesRef.current).forEach(([id, entry]) => {
      const selectedDelta = id === selectedFloodId ? 1.5 : 0;
      entry.line.setStyle({ weight: entry.baseWeight + selectedDelta });
      entry.casing?.setStyle({ weight: entry.baseWeight + selectedDelta + (entry.baseBorderWidth || 0) * 2 });
    });
  }, [selectedFloodId, mapReady, systemData.floodRoutes, showFloodLayer, mapStyles]);

  // Public filters reuse the existing Canvas paths. Non-matching routes remain
  // visible at 25% opacity so a traveler can still notice nearby safety data.
  useEffect(() => {
    if (!publicMode) return;
    const popupFocus = activePopupEntity ? {
      floodIds: activePopupEntity.type === "FLOOD" ? [activePopupEntity.id] : [],
      detourIds: activePopupEntity.type === "DETOUR" ? [activePopupEntity.id] : [],
      highwayRouteNos: activePopupEntity.type === "HIGHWAY" ? [activePopupEntity.id] : [],
    } : null;
    const focus = popupFocus ?? activeCardFocus;
    const hasFocus = focus !== null;
    const active = hasFocus || isFilterActive || Boolean(searchQuery.trim());
    const floodMatches = new Set(focus?.floodIds ?? highlightFloodIds);
    const detourMatches = new Set(focus?.detourIds ?? highlightDetourIds);
    Object.entries(floodLinesRef.current).forEach(([id, entry]) => {
      entry.filterOpacity = !active || floodMatches.has(id) ? 1 : 0;
      entry.line.setStyle({ opacity: entry.baseOpacity * entry.filterOpacity });
      if (entry.line.__dohBaseInteractive === undefined) entry.line.__dohBaseInteractive = entry.line.options.interactive ?? true;
      entry.line.options.interactive = Boolean(entry.filterOpacity) && entry.line.__dohBaseInteractive;
      entry.casing?.setStyle({ opacity: entry.filterOpacity });
      if (entry.casing) entry.casing.options.interactive = false;
    });
    detourLinesRef.current.forEach((entry) => {
      entry.filterOpacity = !active || detourMatches.has(entry.id) ? 1 : 0;
      entry.line.setStyle({ opacity: entry.baseOpacity * entry.filterOpacity });
      if (entry.line.__dohBaseInteractive === undefined) entry.line.__dohBaseInteractive = entry.line.options.interactive ?? true;
      entry.line.options.interactive = Boolean(entry.filterOpacity) && entry.line.__dohBaseInteractive;
    });
    const applyGroupOpacity = (group: any, matches: Set<string>) => group?.eachLayer?.((layer: any) => {
      const ids = layer.__dohFilterIds || (layer.__dohFilterId ? [layer.__dohFilterId] : null);
      if (!ids) return;
      const baseOpacity = Number.isFinite(layer.__dohBaseOpacity) ? layer.__dohBaseOpacity : 1;
      const visible = !active || ids.some((id: string) => matches.has(id));
      const opacity = baseOpacity * (visible ? 1 : 0);
      if (layer.__dohBaseInteractive === undefined) layer.__dohBaseInteractive = layer.options?.interactive ?? true;
      layer.options.interactive = visible && layer.__dohBaseInteractive;
      if (layer.setStyle) layer.setStyle({ opacity });
      const element = layer.getElement?.();
      if (element) {
        element.style.opacity = String(opacity);
        element.style.display = visible ? "" : "none";
        element.style.pointerEvents = visible ? "" : "none";
        element.dataset.filterOpacity = String(opacity);
      }
    });
    applyGroupOpacity(floodGroupRef.current, floodMatches);
    applyGroupOpacity(detourGroupRef.current, detourMatches);
    const normalize = (value: string) => value.replace(/^ทล\.?\s*/i, "").trim();
    const highways = new Set((focus?.highwayRouteNos ?? highlightHighwayRouteNos).map(normalize));
    if (hasFocus && !activePopupEntity) {
      systemData.floodRoutes.forEach((route) => {
        if (floodMatches.has(route.id)) highways.add(normalize(route.route_no));
      });
    }
    const applyHighwayOpacity = (layer: any) => {
      if (layer.eachLayer) { layer.eachLayer(applyHighwayOpacity); return; }
      if (!layer.feature || !layer.setStyle) return;
      if (layer.__dohBaseOpacity === undefined) layer.__dohBaseOpacity = layer.options.opacity ?? 1;
      const matched = activePopupEntity?.type === "HIGHWAY"
        ? highwayFeatureKeysRef.current.get(layer.feature) === activePopupEntity.id
        : highways.has(normalize(String(routeCodeOf(layer.feature.properties))));
      const visible = !active || matched;
      if (layer.__dohBaseInteractive === undefined) layer.__dohBaseInteractive = layer.options.interactive ?? true;
      layer.options.interactive = visible && layer.__dohBaseInteractive;
      layer.setStyle({ opacity: layer.__dohBaseOpacity * (visible ? 1 : 0) });
      const element = layer.getElement?.();
      if (element) {
        element.style.display = visible ? "" : "none";
        element.style.pointerEvents = visible ? "" : "none";
      }
    };
    highwayGroupRef.current?.eachLayer(applyHighwayOpacity);
    if (mapContainerRef.current) {
      const highwayOpacities: Record<string, number> = {};
      const highwayFeatures: Record<string, { opacity: number; x: number; y: number }> = {};
      const collectHighwayOpacity = (layer: any) => {
        if (layer.eachLayer) { layer.eachLayer(collectHighwayOpacity); return; }
        if (!layer.feature) return;
        const routeNo = normalize(String(routeCodeOf(layer.feature.properties)));
        const opacity = Number(layer.options?.opacity);
        const key = highwayFeatureKeysRef.current.get(layer.feature);
        const center = layer.getBounds?.().getCenter();
        if (key && center) {
          const point = leafletMapRef.current.latLngToContainerPoint(center);
          highwayFeatures[key] = { opacity, x: point.x, y: point.y };
        }
        if (routeNo && Number.isFinite(opacity)) {
          highwayOpacities[routeNo] = Math.max(highwayOpacities[routeNo] ?? 0, opacity);
        }
      };
      highwayGroupRef.current?.eachLayer(collectHighwayOpacity);
      mapContainerRef.current.dataset.publicLayerOpacities = JSON.stringify({
        zoom: leafletMapRef.current?.getZoom(),
        highwayFeatures,
        floods: Object.fromEntries(Object.entries(floodLinesRef.current).map(([id, entry]) => [id, entry.line.options.opacity])),
        detours: Object.fromEntries(detourLinesRef.current.map((entry) => [entry.id, entry.line.options.opacity])),
        highways: highwayOpacities,
        interactive: {
          floods: Object.fromEntries(Object.entries(floodLinesRef.current).map(([id, entry]) => [id, Boolean(entry.line.options.interactive)])),
          detours: Object.fromEntries(detourLinesRef.current.map((entry) => [entry.id, Boolean(entry.line.options.interactive)])),
        },
      });
    }
  }, [publicMode, highlightFloodIds, highlightDetourIds, isFilterActive, searchQuery, highlightHighwayRouteNos, activeCardFocus, activePopupEntity, mapReady, systemData.floodRoutes, systemData.detourRoutes, systemData.highwayLayers, mapStyles, showMainHwy, showSecHwy, showRoadLabels, showSecondaryAtCurrentZoom, criticalHighwayRouteNos, currentZoom, showFloodLayer, showDetourLayer]);

  // 4f. Admin draft route (A->B and B->A), conflict alerts, imported-GIS preview and draggable markers.
  useEffect(() => {
    const L = leafletRef.current;
    const group = draftGroupRef.current;
    if (!mapReady || !L || !group) return;
    renderDraftAndConflictLayer({
      L,
      group,
      renderer: rendererRef.current,
      incomingGisLines,
      draftCoordinates,
      draftReverseCoordinates,
      draftWaypoints,
      draftReverseWaypoints,
      draftConflictPoints,
      draftPickMarkers,
      draftMode,
      mapStyles,
      vertexEditable,
      draftLineRef,
      revDraftLineRef,
      adminPickModeRef,
      onCoordinatePickedRef,
      onWaypointDraggedRef,
      onReverseWaypointDraggedRef,
    });
    return () => {
      draftLineRef.current = null;
      revDraftLineRef.current = null;
      group.clearLayers();
    };
  }, [mapReady, incomingGisLines, draftCoordinates, draftReverseCoordinates, draftWaypoints, draftReverseWaypoints, draftConflictPoints, draftPickMarkers, draftMode, mapStyles, vertexEditable]);

  // 4f-arrows. Directional Arrow System (Items 2 & 4): Viewport-culled, zoom-gated directional arrows for highways, detours, and active draft previews.
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = arrowGroupRef.current;
    if (!mapReady || !L || !map || !group) return;
    group.clearLayers();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const drawArrows = () => {
      const visibleDetourIds = new Set(detourLinesRef.current
        .filter((entry) => entry.line.options.opacity > 0)
        .map((entry) => entry.id));
      const visibleHighwayKeys = new Set<string>();
      const collectVisibleHighways = (path: any) => {
        if (path.eachLayer) { path.eachLayer(collectVisibleHighways); return; }
        if (!path.feature || !(path.options?.opacity > 0)) return;
        const key = highwayFeatureKeysRef.current.get(path.feature);
        if (key) visibleHighwayKeys.add(key);
      };
      highwayGroupRef.current?.eachLayer(collectVisibleHighways);
      renderDirectionalArrows({
        L,
        map,
        group,
        mapStyles,
        highwayLayers: systemData.highwayLayers,
        detourRoutes: systemData.detourRoutes,
        showMainHwy: effectiveShowMainHwy,
        showSecHwy: effectiveShowSecHwy,
        showDetourLayer: effectiveShowDetourLayer,
        showSecondaryAtCurrentZoom,
        draftCoordinates,
        draftReverseCoordinates,
        draftDirectionMeta,
        draftMode,
        vertexEditable,
        visibleDetourIds,
        visibleHighwayKeys,
        isFilterOrFocusActive: publicMode && (isFilterActive || Boolean(searchQuery.trim()) || Boolean(activeCardFocus) || Boolean(activePopupEntity)),
      });
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
  }, [mapReady, systemData.highwayLayers, systemData.detourRoutes, systemData.floodRoutes, mapStyles, effectiveShowMainHwy, effectiveShowSecHwy, effectiveShowDetourLayer, effectiveShowFloodLayer, showSecondaryAtCurrentZoom, currentZoom, draftCoordinates, draftReverseCoordinates, draftDirectionMeta, draftMode, vertexEditable, publicMode, isFilterActive, searchQuery, activeCardFocus, activePopupEntity, highlightDetourIds, highlightHighwayRouteNos]);

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

    let timer: ReturnType<typeof setTimeout> | null = null;
    const draw = () =>
      renderVertexEditHandles({
        L,
        map,
        group,
        geometryToEdit,
        draftCoordinates,
        draftReverseCoordinates,
        vertexEditCoordinates,
        draftLineRef,
        revDraftLineRef,
        onVertexMovedRef,
        onVertexInsertedRef,
        onVertexClickedRef,
      });
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
  }, [mapReady, vertexEditable, draftCoordinates, draftReverseCoordinates, vertexEditCoordinates]);

  // 4g. DOH offices & highway stations
  useEffect(() => {
    const L = leafletRef.current;
    const group = officeGroupRef.current;
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowOffices) return;

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
  }, [mapReady, systemData.offices, effectiveShowOffices, publicMode, editableOfficeId]);

  // 4h. Shared GIS Focus Mode Layer (single presentation override on existing map instance)
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = focusGroupRef.current;
    if (!mapReady || !L || !map || !group) return;

    group.clearLayers();
    if (!gisFocus || gisFocus.status !== "focused" || !gisFocus.targetType || !gisFocus.targetId) {
      userInteractedDuringFocusRef.current = false;
      return;
    }

    const renderer = rendererRef.current;
    const allPolylines: [number, number][][] = [];
    const allPoints: ([number, number] | null)[] = [];

    const drawDetourFocusOverlay = (
      detour: DetourRoute,
      direction: "FORWARD" | "REVERSE",
      isPrimary: boolean
    ) => {
      const geom = resolveDetourFocusGeometry(detour, direction);
      const style = mapStyles.detour;
      const color = style?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
      const weight = (style?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) + (isPrimary ? 1.5 : 0);
      const borderColor = style?.borderActive ? style.borderColor || "#ffffff" : "#091326";
      const borderWidth = style?.borderActive ? Math.max(1, Number(style.borderWidth) || 1) : 2;
      const arrowColor = resolveVisibleArrowColor(color, style?.arrowColor || "#0f172a");

      if (geom.coords.length >= 2) {
        const latLngs = geom.coords.map(toLeafletLatLng);
        L.polyline(latLngs, {
          renderer,
          color: borderColor,
          weight: weight + borderWidth * 2,
          opacity: style?.opacity ?? 0.95,
        }).addTo(group);
        const line = L.polyline(latLngs, {
          renderer,
          color,
          weight,
          opacity: style?.opacity ?? 0.95,
          dashArray: isPrimary ? dashArrayFor(style) : "10, 6",
        }).addTo(group);
        raisePathLayers(line);
        allPolylines.push(geom.coords);

        const viewport = map.getBounds().pad(0.6);
        placeArrowsOnLine(
          L,
          map,
          group,
          geom.coords,
          "FORWARD",
          arrowColor,
          style?.arrowSize || 14,
          style?.arrowSpacingPx || 96,
          color,
          viewport,
          { count: 0 }
        );
      } else if (geom.startCoord) {
        allPoints.push(geom.startCoord);
      }

      // Keep the A/B photos on their canonical coordinates, regardless of the
      // currently displayed travel direction. This replaces the old floating
      // endpoint labels and keeps each marker attached to its real map point.
      const photoPoints = resolveDetourPhotoPointCoords(
        detour,
        parseRouteCoordinates(detour.coordinates_json)
      );
      const endpoints = [
        { point: "START" as const, lat: photoPoints.startLat, lon: photoPoints.startLon, photo: detour.detour_meta?.start_point_photo },
        { point: "END" as const, lat: photoPoints.endLat, lon: photoPoints.endLon, photo: detour.detour_meta?.end_point_photo },
      ];

      endpoints.forEach(({ point, lat, lon, photo }) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const marker = L.marker([lat, lon], {
          interactive: Boolean(photo?.url),
          zIndexOffset: 900,
          icon: L.divIcon(buildDetourPhotoBadgeSpec(point, "FULL", true)),
        }).addTo(group);
        allPoints.push([lon, lat]);
        if (!photo?.url) return;
        marker.bindPopup(
          () => buildDetourPointPhotoPopupHtml(detour, point, photo, lat, lon),
          getResponsivePopupOptions(L, 380, 280, "doh-detour-leaflet-popup")
        );
        marker.on("click", (event: any) => {
          L.DomEvent.stopPropagation(event);
          marker.openPopup();
        });
      });
    };

    if (gisFocus.targetType === "DETOUR") {
      const detour = (systemData.detourRoutes || []).find((d) => d.id === gisFocus.targetId);
      if (detour) {
        drawDetourFocusOverlay(detour, gisFocus.direction, true);
        // Show linked flood impact warning marker if an active flood affects this detour
        const linkedFlood = (systemData.floodRoutes || []).find(
          (f) => f.id === detour.flood_id_ref && f.is_active !== false && f.water_level_cm > 0
        );
        if (linkedFlood && Number.isFinite(linkedFlood.lon_start) && Number.isFinite(linkedFlood.lat_start)) {
          const status = getTrafficPresentation(linkedFlood.traffic_status);
          L.marker([linkedFlood.lat_start, linkedFlood.lon_start], {
            interactive: false,
            zIndexOffset: 850,
            icon: L.divIcon({
              className: "hdms-focus-warning",
              html: `<div style="transform:translate(-50%,-50%)" class="rounded-lg border border-rose-400 bg-rose-950/95 px-2 py-0.5 text-[10px] font-bold text-rose-200 shadow-lg whitespace-nowrap">⚠️ ทล.${escapeHtml(linkedFlood.route_no)} ${escapeHtml(status.label)}</div>`,
              iconSize: [0, 0],
            }),
          }).addTo(group);
        }
      }
    } else if (gisFocus.targetType === "FLOOD") {
      const floodData = resolveFloodFocusData(gisFocus.targetId, systemData);
      if (floodData.primaryFlood && !floodData.isResolved) {
        // Draw all active segments (including LT/RT siblings) exempt from zoom-dependent hiding
        const style = mapStyles.flood;
        const color = style?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
        const borderColor = style?.borderActive ? style.borderColor || "#ffffff" : "#091326";
        const borderWidth = style?.borderActive ? Math.max(1, Number(style.borderWidth) || 1) : 2;
        const weight = (style?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight) + 0.5;
        floodData.activeSegments.forEach((seg) => {
          const segCoords = (floodData.coordsList.find((_, idx) => floodData.activeSegments[idx]?.id === seg.id)) || [];
          if (segCoords.length >= 2) {
            const latLngs = segCoords.map(toLeafletLatLng);
            L.polyline(latLngs, {
              renderer,
              color: borderColor,
              weight: weight + borderWidth * 2,
              opacity: style?.opacity ?? 0.95,
            }).addTo(group);
            const line = L.polyline(latLngs, {
              renderer,
              color,
              weight,
              opacity: style?.opacity ?? 0.95,
            }).addTo(group);
            raisePathLayers(line);
            allPolylines.push(segCoords);
          } else if (Number.isFinite(seg.lon_start) && Number.isFinite(seg.lat_start)) {
            allPoints.push([seg.lon_start, seg.lat_start]);
            L.circleMarker([seg.lat_start, seg.lon_start], {
              renderer,
              radius: 10,
              color: borderColor,
              weight: borderWidth,
              fillColor: color,
              fillOpacity: style?.opacity ?? 0.95,
            }).addTo(group);
          }
        });
      } else if (floodData.primaryFlood && floodData.isResolved) {
        // Resolved / 0 cm flood: do NOT draw as an active impacted flood line; keep neutral location point only for bounds
        floodData.pointFallbacks.forEach((pt) => allPoints.push(pt));
        floodData.coordsList.forEach((line) => allPolylines.push(line));
      }

      if (gisFocus.showLinkedDetour && floodData.linkedDetours.length > 0) {
        const linked =
          floodData.linkedDetours.find((d) => d.id === gisFocus.linkedDetourId) ??
          floodData.linkedDetours[0];
        if (linked) {
          drawDetourFocusOverlay(linked, gisFocus.direction, false);
        }
      }
    }

    // Fit bounds only on explicit fit requests (not on live data refresh after user pan/zoom)
    const shouldFit =
      gisFocus.fitRequestId !== lastFittedRequestIdRef.current ||
      !userInteractedDuringFocusRef.current;

    if (shouldFit && gisFocus.fitRequestId !== lastFittedRequestIdRef.current) {
      lastFittedRequestIdRef.current = gisFocus.fitRequestId;
      userInteractedDuringFocusRef.current = false;
      map.closePopup();

      const boundsPoints = collectFocusBoundsPoints(allPolylines, allPoints);
      const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 640;
      const mapEl = mapContainerRef.current;
      const mapRect = mapEl?.getBoundingClientRect();
      const focusBarRect = document
        .querySelector('[data-testid="gis-focus-mode-bar"]')
        ?.getBoundingClientRect();
      const focusTimelineRect = document
        .querySelector('[data-testid="gis-focus-timeline-panel"]')
        ?.getBoundingClientRect();

      const leftPadding = isMobileViewport ? 58 : 24;
      let rightPadding = isMobileViewport ? 44 : 24;
      let topPadding = isMobileViewport ? 108 : 132;
      let bottomPadding = isMobileViewport ? 240 : 40;
      if (mapRect && focusBarRect && mapRect.height > 0) {
        const barCenterY = focusBarRect.top + focusBarRect.height / 2;
        const mapCenterY = mapRect.top + mapRect.height / 2;
        if (isMobileViewport && barCenterY > mapCenterY) {
          // Photo A/B markers have a visible 30px footprint, unlike the
          // former zero-size endpoint labels. Keep their full icon clear of
          // the Focus Bar rather than fitting only their coordinate center.
          const neededBottom = Math.ceil(mapRect.bottom - focusBarRect.top) + 48;
          bottomPadding = Math.min(Math.max(120, neededBottom), Math.max(120, mapRect.height - topPadding - 96));
        } else if (!isMobileViewport && barCenterY < mapCenterY) {
          const neededTop = Math.ceil(focusBarRect.bottom - mapRect.top) + 48;
          topPadding = Math.min(Math.max(132, neededTop), Math.max(132, mapRect.height - bottomPadding - 120));
        }
      }
      if (mapRect && focusTimelineRect && mapRect.width > 0 && mapRect.height > 0) {
        if (isMobileViewport) {
          const neededBottom = Math.ceil(mapRect.bottom - focusTimelineRect.top) + 16;
          bottomPadding = Math.min(
            Math.max(bottomPadding, neededBottom),
            Math.max(120, mapRect.height - topPadding - 96)
          );
        } else {
          const neededRight = Math.ceil(mapRect.right - focusTimelineRect.left) + 16;
          rightPadding = Math.min(
            Math.max(rightPadding, neededRight),
            Math.max(80, mapRect.width - leftPadding - 160)
          );
        }
      }

      if (boundsPoints.length >= 2) {
        isProgrammaticMoveRef.current = true;
        map.stop();
        map.fitBounds(L.latLngBounds(boundsPoints.map(toLeafletLatLng)), {
          paddingTopLeft: [leftPadding, topPadding],
          paddingBottomRight: [rightPadding, bottomPadding],
          maxZoom: 15,
          animate: true,
        });
        window.setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 400);
      } else if (boundsPoints.length === 1) {
        isProgrammaticMoveRef.current = true;
        map.stop();
        const targetZoom = 14;
        const targetLatLng = toLeafletLatLng(boundsPoints[0]);
        const offsetY = Math.round((bottomPadding - topPadding) / 2);
        const targetCenter =
          offsetY !== 0 && typeof map.project === "function" && typeof map.unproject === "function"
            ? map.unproject(map.project(targetLatLng, targetZoom).add([0, offsetY]), targetZoom)
            : targetLatLng;
        map.setView(targetCenter, targetZoom, { animate: true });
        window.setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 400);
      }
    }

    return () => {
      group.clearLayers();
    };
  }, [mapReady, gisFocus, systemData, mapStyles]);

  return (
    <div data-public-filter-counts={`flood:${highlightFloodIds.length};detour:${highlightDetourIds.length}`} className={`relative ${className} ${isMapPopupOpen ? "doh-map-popup-open" : ""} overflow-hidden w-full h-full min-h-[450px]`} style={{ minHeight: 450 }}>
      <div
        ref={mapContainerRef}
        className="w-full h-full min-h-[350px] bg-surface-canvas relative z-0"
        style={{ position: "absolute", inset: 0, minHeight: 450 }}
      />

      <MapLegendOverlay
        publicMode={publicMode}
        isSidebarCollapsed={isSidebarCollapsed}
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
