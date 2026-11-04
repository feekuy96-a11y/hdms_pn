"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload } from "@/db/default-data";
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
  onOfficeDragged?: (officeId: string, newPosition: { lat: number; lon: number }) => void;
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
  draftCoordinates = [],
  draftWaypoints = [],
  draftPickMarkers = [],
  onWaypointDragged,
  onOfficeDragged,
  draftMode = "FLOOD",
  focusCoordinates = null,
  incomingGisLines = [],
  className = "h-full w-full",
  publicMode = false,
  isSidebarCollapsed = false,
}: LongdoGisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const overlayGroupRef = useRef<any>(null);
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
  const [mapZoom, setMapZoom] = useState(APP_CONFIG.DEFAULT_ZOOM);

  const mapStyles = systemData.mapStyles || DEFAULT_MAP_STYLES;

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

  // Sync refs to avoid stale closures in Leaflet events
  const adminPickModeRef = useRef(adminPickMode);
  adminPickModeRef.current = adminPickMode;
  const onCoordinatePickedRef = useRef(onCoordinatePicked);
  onCoordinatePickedRef.current = onCoordinatePicked;
  const onWaypointDraggedRef = useRef(onWaypointDragged);
  onWaypointDraggedRef.current = onWaypointDragged;
  const onOfficeDraggedRef = useRef(onOfficeDragged);
  onOfficeDraggedRef.current = onOfficeDragged;

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

        // Clean up previous leaflet id on DOM element to prevent "Map container is already initialized" error
        if ((mapContainerRef.current as any)._leaflet_id) {
          delete (mapContainerRef.current as any)._leaflet_id;
        }

        const map = L.map(mapContainerRef.current, {
          center: [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon],
          zoom: APP_CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
          fadeAnimation: false,
        });
        map.on("zoomend", () => setMapZoom(map.getZoom()));

        const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY;

        const baseLayers = {
          road: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap • ขท.ปัตตานี",
          }),
          sat: L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
            maxZoom: 20,
            attribution: "© Google Hybrid Satellite • ขท.ปัตตานี",
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

        const overlayGroup = L.layerGroup().addTo(map);
        overlayGroupRef.current = overlayGroup;

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

  // 4. Redraw Overlays when state or layers change
  useEffect(() => {
    async function renderOverlays() {
      if (!leafletMapRef.current || !overlayGroupRef.current) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default?.map
        ? (leafletModule as any).default
        : (leafletModule as any);
      const group = overlayGroupRef.current;
      group.clearLayers();

      // Hardware-accelerated canvas renderer for 60fps vector rendering with click tolerance
      const vectorCanvas = L.canvas ? (L.canvas as any)({ padding: 0.5, tolerance: 10 }) : undefined;
      const highwayFeatureCount = (systemData.highwayLayers || []).reduce((count, layer) => count + (Array.isArray(layer.geojson_data?.features) ? layer.geojson_data.features.length : 0), 0);
      const allowLineAnimation = highwayFeatureCount <= 250;

      // A. Draw Dual-Color GIS File Preview (เส้นสีน้ำเงิน = ข้อมูลที่กำลังนำเข้า)
      if (incomingGisLines && incomingGisLines.length > 0) {
        incomingGisLines.forEach((line) => {
          if (line.length >= 2) {
            const latLngs = line.map(toLeafletLatLng);
            L.polyline(latLngs as any, {
              color: "#0284c7",
              weight: 5,
              dashArray: "6, 6",
              opacity: 0.95,
              renderer: vectorCanvas,
            }).addTo(group);
          }
        });
      }

      // C. Draw Highway Layers (Main & Secondary)
      const mapStyles = systemData.mapStyles || DEFAULT_MAP_STYLES;

      (systemData.highwayLayers || []).forEach((layer) => {
        if (!layer.is_visible) return;
        if (layer.layer_id === "MAIN_HIGHWAY" && !showMainHwy) return;
        if (layer.layer_id === "SECOND_HIGHWAY" && !showSecHwy) return;

        const isMain = layer.layer_id === "MAIN_HIGHWAY";
        const style = isMain ? mapStyles.primary : mapStyles.secondary;
        const color = style?.color || (isMain ? "#1B5E20" : "#0284c7");
        const weight = style?.weight || (isMain ? 5 : 3.5);
        const opacity = style?.opacity ?? 0.85;
        const dashArray = style?.pattern === "dash" ? (style.dashArray || "8, 6") : style?.pattern === "dot" ? "2, 6" : style?.pattern === "long-dash-dot" ? "14, 6, 3, 6" : undefined;
        const animClass = allowLineAnimation && style?.animation === "chaser" ? "doh-line-chaser" : allowLineAnimation && style?.animation === "pulse" ? "doh-line-pulse" : allowLineAnimation && style?.animation === "blink" ? "doh-line-blink" : allowLineAnimation && style?.animation === "arrows" ? "doh-line-arrows" : "";
        const speedClass = style?.animationSpeed === "slow" ? "doh-anim-slow" : style?.animationSpeed === "fast" ? "doh-anim-fast" : "";

        if (layer.geojson_data) {
          try {
            const geoLayer = L.geoJSON(layer.geojson_data, {
              renderer: vectorCanvas,
              filter: (feature: any) => {
                // Issue #13: Respect individual route visibility
                return feature?.properties?.is_visible !== false;
              },
              style: (feature: any) => {
                const props = feature?.properties || {};
                let featureWeight = weight;
                if (props.lanes) {
                  const lanesStr = String(props.lanes);
                  if (lanesStr.includes("๘") || lanesStr.includes("8")) featureWeight = 8.5;
                  else if (lanesStr.includes("๖") || lanesStr.includes("6")) featureWeight = 7.5;
                  else if (lanesStr.includes("๔") || lanesStr.includes("4")) featureWeight = 5.5;
                  else if (lanesStr.includes("๒") || lanesStr.includes("2")) featureWeight = 3.5;
                }
                const featureColor = color;
                return {
                  color: featureColor,
                  weight: featureWeight,
                  opacity,
                  dashArray,
                  className: `${animClass} ${speedClass}`.trim(),
                };
              },
              onEachFeature: (feature: any, geoFeatureLayer: any) => {
                const props = feature.properties || {};
                const code = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "";
                const name = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || "ทางหลวง";
                const desc = props.description || props.remarks || "";
                const lengthKm = props.length_km || "";
                const ptsCount = props.points_count || (feature.geometry?.coordinates?.length || "");

                // Tooltip showing highway name on hover
                if (showHighwayShields && mapZoom >= 11 && feature.geometry && ["LineString", "MultiLineString"].includes(feature.geometry.type)) {
                  const line = feature.geometry.type === "LineString"
                    ? feature.geometry.coordinates
                    : feature.geometry.coordinates.flat(1);
                  const midpoint = line[Math.floor(line.length / 2)];
                  if (midpoint && code) {
                    const signIcon = L.divIcon({
                      html: `<div style="min-width:26px;height:20px;padding:0 4px;transform:translate(-50%,-50%);background:#fff;border:1.5px solid #111827;border-radius:2px;box-shadow:0 1px 2px #0007;color:#111827;text-align:center;line-height:17px;font-family:Sarabun,sans-serif;font-size:11px;font-weight:700">${escapeHtml(code)}</div>`,
                      className: "doh-highway-sign",
                      iconSize: [34, 20],
                      iconAnchor: [17, 10],
                    });
                    const sign = L.marker(toLeafletLatLng(midpoint), { icon: signIcon, interactive: true }).addTo(group);
                    sign.bindTooltip(`ทล.${escapeHtml(code)} · ${escapeHtml(name)}`, { direction: "top", offset: [0, -18] });
                    sign.bindPopup(`<div style="padding-top:5px"><strong>ทล.${escapeHtml(code)}</strong><br/>${escapeHtml(name)}</div>`);
                  }
                }

                if (showRoadLabels) {
                  geoFeatureLayer.bindTooltip(
                    code ? `ทล.${code} • ${name}` : name,
                    {
                      sticky: true,
                      className: "doh-map-tooltip",
                    }
                  );
                }

                // Detailed dossier popup when clicked
                geoFeatureLayer.bindPopup(`
                  <div class="text-xs p-2.5 min-w-[270px] font-body bg-slate-950 text-white rounded-xl border-2 shadow-2xl" style="border-color: ${color}">
                    <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 gap-2">
                      <span class="text-white text-base font-black font-heading tracking-wide">
                        ${code ? `ทล.${escapeHtml(code)}` : "ทางหลวง"}
                      </span>
                      <span class="text-[10px] text-amber-300 font-heading font-semibold">
                        ${isMain ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
                      </span>
                    </div>
                    <div class="mt-2">
                      <h4 class="font-bold text-white text-sm font-heading">${escapeHtml(name)}</h4>
                      ${props.km_start !== undefined && props.km_start !== null && String(props.km_start).trim() !== "" ? `<p class="text-amber-300 text-[11px] mt-0.5 font-mono">ก.ม. ${escapeHtml(formatKmPost(props.km_start))}${props.km_end !== undefined && props.km_end !== null && String(props.km_end).trim() !== "" ? ` ถึง ก.ม. ${escapeHtml(formatKmPost(props.km_end))}` : ""}</p>` : ""}
                      ${desc ? `<p class="text-slate-300 text-[11px] mt-0.5">${escapeHtml(desc)}</p>` : ""}
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
                      <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">ระยะทาง</span>
                        <strong class="text-amber-400 font-mono">${lengthKm ? `${lengthKm} กม.` : "ตามโครงข่าย"}</strong>
                      </div>
                      <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">ช่องจราจร</span>
                        <strong class="text-sky-400 font-mono text-[10px]">${props.lanes || "๔ ช่องจราจร"}</strong>
                      </div>
                    </div>
                    ${props.surface ? `
                      <div class="mt-1.5 text-[10px] text-slate-300 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <span class="text-slate-400">ผิวจราจร:</span> <span class="text-amber-200">${escapeHtml(props.surface)}</span>
                      </div>
                    ` : ""}
                    <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                      <span>${escapeHtml(props.responsible_office || "ขท.ปัตตานี")}</span>
                      <span class="text-emerald-400 font-semibold">${escapeHtml(props.road_status || "เปิดการจราจร ✓")}</span>
                    </div>
                  </div>
                `);
              },
            }).addTo(group);
          } catch (e) {}
        }
      });

      // D. Draw Detour Routes (Yellow Lines)
      if (showDetourLayer) {
        (systemData.detourRoutes || []).forEach((detour) => {
          if (!detour.is_active) return;
          let coords: [number, number][] = [];
          if (Array.isArray(detour.coordinates_json)) {
            coords = detour.coordinates_json;
          } else if (typeof detour.coordinates_json === "string") {
            try {
              coords = JSON.parse(detour.coordinates_json);
            } catch (e) {}
          }

          if (coords.length >= 2) {
            const latLngs = coords.map(toLeafletLatLng);
            const detourStyle = mapStyles.detour;
            const dColor = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
            const dDash = detourStyle?.pattern === "solid" ? undefined : (detourStyle?.dashArray || LAYER_CONFIG.DETOUR_YELLOW_LINE.dashArray);
            const dAnim = detourStyle?.animation === "chaser" ? "doh-line-chaser" : detourStyle?.animation === "pulse" ? "doh-line-pulse" : detourStyle?.animation === "blink" ? "doh-line-blink" : detourStyle?.animation === "arrows" ? "doh-line-arrows" : "";
            const dSpeed = detourStyle?.animationSpeed === "slow" ? "doh-anim-slow" : detourStyle?.animationSpeed === "fast" ? "doh-anim-fast" : "";

            const polyline = L.polyline(latLngs as any, {
              color: dColor,
              weight: detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight,
              dashArray: dDash,
              opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
              className: `${dAnim} ${dSpeed}`.trim(),
              renderer: vectorCanvas,
            }).addTo(group);

            polyline.bindPopup(`
              <div class="text-xs p-1.5 font-body bg-slate-950 text-white rounded-xl border" style="border-color: ${dColor}">
                <span class="text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded font-heading shadow" style="background-color: ${dColor}">
                  เส้นทางเลี่ยงแนะนำ
                </span>
                <h4 class="font-bold text-white text-sm mt-1.5 font-heading">${escapeHtml(detour.route_name)}</h4>
                <p class="text-slate-300 mt-1">${escapeHtml(detour.description || "-")}</p>
              </div>
            `);
          }
        });
      }

      // E. Draw Flood Routes (Red Lines) & Pulse Markers
      if (showFloodLayer) {
        (systemData.floodRoutes || []).forEach((flood) => {
          if (!flood.is_active) return;

          let coords: [number, number][] = [];
          if (Array.isArray(flood.coordinates_json)) {
            coords = flood.coordinates_json;
          } else if (typeof flood.coordinates_json === "string") {
            try {
              coords = JSON.parse(flood.coordinates_json);
            } catch (e) {}
          }

          const isSelected = flood.id === selectedFloodId;
          const floodStyle = mapStyles.flood;
          const fColor = floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
          const fWeight = (floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight) + (isSelected ? 1.5 : 0);
          const fOpacity = floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity;
          const fDash = floodStyle?.pattern === "dash" ? (floodStyle.dashArray || "8, 6") : undefined;
          const fAnim = floodStyle?.animation === "pulse" ? "doh-line-pulse" : floodStyle?.animation === "chaser" ? "doh-line-chaser" : floodStyle?.animation === "blink" ? "doh-line-blink" : floodStyle?.animation === "arrows" ? "doh-line-arrows" : "";
          const fSpeed = floodStyle?.animationSpeed === "slow" ? "doh-anim-slow" : floodStyle?.animationSpeed === "fast" ? "doh-anim-fast" : "";

          if (coords.length >= 2) {
            const latLngs = coords.map(toLeafletLatLng);
            const polyline = L.polyline(latLngs as any, {
              color: fColor,
              weight: fWeight,
              opacity: fOpacity,
              dashArray: fDash,
              className: `${fAnim} ${fSpeed}`.trim(),
              renderer: vectorCanvas,
            }).addTo(group);

            polyline.on("click", (e: any) => {
              L.DomEvent.stopPropagation(e);
              onSelectFlood(flood.id);
            });
          }

          // Flood Location Marker (Capsule Badge with Icon and Level as shown in reference)
          const midLat = flood.lat_start || (coords[0] ? coords[0][1] : APP_CONFIG.DEFAULT_CENTER.lat);
          const midLon = flood.lon_start || (coords[0] ? coords[0][0] : APP_CONFIG.DEFAULT_CENTER.lon);

          let capsuleClass = "doh-capsule-tag doh-capsule-amber";
          let statusIcon = "⚠️";
          let levelText = `${flood.water_level_cm} ซม.`;

          if (flood.traffic_status === "CLOSED" || flood.water_level_cm >= 40) {
            capsuleClass = "doh-capsule-tag doh-capsule-red";
            statusIcon = "⛔";
          } else if (flood.water_level_cm === 0 || ["PASSABLE", "LIGHT_VEHICLES_ONLY"].includes(flood.traffic_status)) {
            capsuleClass = "doh-capsule-tag doh-capsule-green";
            statusIcon = "✅";
            levelText = "ปกติ";
          }

          const iconHtml = `
            <div class="${capsuleClass}">
              <span class="text-xs">${statusIcon}</span>
              <span>ทล.${escapeHtml(flood.route_no)}</span>
              <span class="opacity-90">(${escapeHtml(levelText)})</span>
            </div>
          `;

          const pinIcon = L.divIcon({
            html: iconHtml,
            className: "doh-map-capsule-pin",
            iconSize: [120, 28],
            iconAnchor: [60, 14],
          });

          const marker = L.marker([midLat, midLon], { icon: pinIcon }).addTo(group);
          const updates = (systemData.timelineUpdates || [])
            .filter((update) => update.flood_id_ref === flood.id)
            .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime());
          const levels = updates.map((update) => update.water_level_cm);
          const minLevel = Math.min(...levels);
          const maxLevel = Math.max(...levels);
          const chartPoints = updates.map((update, index) => {
            const y = 48 - (maxLevel === minLevel ? 24 : ((update.water_level_cm - minLevel) / (maxLevel - minLevel)) * 40);
            const x = updates.length < 2 ? 10 : 8 + (index * 104) / (updates.length - 1);
            const time = new Date(update.reported_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
            return `<circle cx="${x}" cy="${y}" r="2.5" fill="#f59e0b"><title>${escapeHtml(time)} · ${update.water_level_cm} ซม.</title></circle>`;
          }).join("");
          const linePoints = updates.map((update, index) => {
            const y = 48 - (maxLevel === minLevel ? 24 : ((update.water_level_cm - minLevel) / (maxLevel - minLevel)) * 40);
            const x = updates.length < 2 ? 10 : 8 + (index * 104) / (updates.length - 1);
            return `${x},${y}`;
          }).join(" ");
          marker.bindPopup(`<div style="width:250px;color:#0f172a;font-family:Sarabun,sans-serif"><strong>ทล.${escapeHtml(flood.route_no)} · ${escapeHtml(flood.section_name)}</strong><div style="font-size:12px;margin-top:3px">ก.ม. ${escapeHtml(formatKmPost(flood.km_start))} ถึง ก.ม. ${escapeHtml(formatKmPost(flood.km_end))}</div>${flood.latest_photo_url ? `<img src="${escapeHtml(flood.latest_photo_url)}" alt="ภาพสถานการณ์" style="width:100%;height:108px;object-fit:cover;border-radius:8px;margin-top:7px"/>` : ""}<div style="margin-top:7px;font-size:13px"><b>ระดับน้ำล่าสุด ${flood.water_level_cm} ซม.</b> · ${escapeHtml(trafficStatusLabel(flood.traffic_status))}</div>${updates.length ? `<svg viewBox="0 0 120 56" style="width:100%;height:80px;margin-top:4px"><line x1="8" y1="48" x2="112" y2="48" stroke="#cbd5e1"/><polyline points="${linePoints}" fill="none" stroke="#f59e0b" stroke-width="2"/>${chartPoints}</svg><div style="font-size:10px;color:#64748b">ชี้ที่จุดกราฟเพื่อดูเวลาและระดับน้ำ</div>` : `<div style="font-size:11px;color:#64748b;margin-top:3px">ยังไม่มีข้อมูลระดับน้ำย้อนหลัง</div>`}</div>`, { maxWidth: 280 });
          marker.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            onSelectFlood(flood.id);
          });
        });
      }

      // D. Draw Admin Draft Snapped Route
      if (draftCoordinates.length >= 2) {
        const draftLatLngs = draftCoordinates.map(toLeafletLatLng);
        const draftColor = draftMode === "FLOOD"
          ? (mapStyles.flood?.color || "#ef4444")
          : (mapStyles.detour?.color || "#f59e0b");
        const draftLine = L.polyline(draftLatLngs as any, {
          color: draftColor,
          weight: 6,
          dashArray: draftMode === "FLOOD"
            ? (mapStyles.flood?.pattern === "dash" ? (mapStyles.flood.dashArray || "8, 6") : undefined)
            : (mapStyles.detour?.pattern === "solid" ? undefined : (mapStyles.detour?.dashArray || "8, 6")),
          opacity: 0.95,
          renderer: vectorCanvas,
        }).addTo(group);
        draftLine.on("click", (event: any) => {
          if (adminPickModeRef.current !== "ADD_WAYPOINT") return;
          L.DomEvent.stopPropagation(event);
          const point = event.latlng;
          onCoordinatePickedRef.current?.(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)), "ADD_WAYPOINT");
        });
      }

      // E. Draw Numbered Draggable Waypoints for Bending Paths (ดัดเส้น)
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

      // E. Draw Numbered Draggable Waypoints for Bending Paths (ดัดเส้น)
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

      // F. Draw DOH Offices & Highway Stations (หมุดแขวงทางหลวง และ หมวดทางหลวง)
      if (showOffices) {
        (systemData.offices || []).forEach((office) => {
          if (!office.is_active) return;
          const isHq = office.type === "HEADQUARTERS";
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

          const marker = L.marker([office.lat, office.lon], { icon: officeIcon, draggable: !publicMode && Boolean(onOfficeDraggedRef.current) }).addTo(group);
          if (!publicMode && onOfficeDraggedRef.current) {
            marker.on("dragend", (event: any) => {
              const position = event.target.getLatLng();
              onOfficeDraggedRef.current?.(office.id, { lat: Number(position.lat.toFixed(6)), lon: Number(position.lng.toFixed(6)) });
            });
          }
          marker.bindPopup(`
            <div class="text-xs p-1 min-w-[220px] font-body text-slate-100">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="bg-amber-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded font-heading">
                  ${isHq ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
                </span>
              </div>
              <h4 class="font-bold text-white text-sm font-heading">${escapeHtml(office.name)}</h4>
              <p class="text-slate-300 text-[11px] mt-1">${escapeHtml(office.address)}</p>
              <div class="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between">
                <a href="tel:${office.phone.replace(/[^0-9]/g, "")}" class="text-amber-300 hover:underline font-bold text-xs flex items-center gap-1">
                  📞 ${escapeHtml(office.phone)}
                </a>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lon}" target="_blank" rel="noopener noreferrer" class="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-amber-400">
                  นำทาง
                </a>
              </div>
            </div>
          `);
        });
      }
    }

    renderOverlays();
  }, [
    mapReady,
    systemData,
    selectedFloodId,
    showFloodLayer,
    showDetourLayer,
    showMainHwy,
    showSecHwy,
    showHighwayShields,
    mapZoom,
    showOffices,
    draftCoordinates,
    draftWaypoints,
    draftPickMarkers,
    draftMode,
    incomingGisLines,
    publicMode,
  ]);

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

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.flood?.color }} />
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
                <span className="w-4 h-1.5 inline-block rounded" style={{ backgroundColor: mapStyles.detour?.color }} />
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
