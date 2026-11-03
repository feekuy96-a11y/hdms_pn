"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { SystemDataPayload } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES, OFFICIAL_PATTANI_HIGHWAYS } from "@/lib/constants";
import { Layers, Navigation, Building2, Map, ChevronUp, ChevronDown } from "lucide-react";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] || character));

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
  onWaypointDragged?: (index: number, newCoord: [number, number]) => void;
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
  onWaypointDragged,
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

        const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY || "demokey";

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

      // A. Draw Official Highway Route Shields (ไอคอนแสดงหมายเลขทางหลวงบนแผนที่ในรูปแบบทางการ)
      if (showHighwayShields) {
        OFFICIAL_PATTANI_HIGHWAYS.forEach((hwy) => {
          const isRural = hwy.type === "RURAL_ROAD";
          const code = hwy.code;
          const is4Digits = code.length >= 4;

          const shieldSvg = isRural
            ? `
              <div class="doh-drr-shield group relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-125" style="transform: translate(-50%, -50%);">
                <svg width="36" height="40" viewBox="0 0 38 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
                  <path d="M19 1 C30 1 37 6 37 17 C37 28 24 37 19 40 C14 37 1 28 1 17 C1 6 8 1 19 1 Z" fill="#0284c7" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
                  <path d="M19 3 C28 3 34.5 7.5 34.5 17 C34.5 26.5 23 34.5 19 37.5 C15 34.5 3.5 26.5 3.5 17 C3.5 7.5 10 3 19 3 Z" fill="#0284c7" stroke="#facc15" stroke-width="1"/>
                  <text x="19" y="12" text-anchor="middle" font-family="'Sarabun', sans-serif" font-weight="800" font-size="7.5" fill="#fef08a">ทช.</text>
                  <text x="19" y="26" text-anchor="middle" font-family="'Sarabun', sans-serif" font-weight="900" font-size="${is4Digits ? 9.5 : 11.5}" fill="#ffffff" letter-spacing="-0.3">${escapeHtml(code)}</text>
                </svg>
              </div>
            `
            : `
              <div class="doh-hwy-shield group relative cursor-pointer flex flex-col items-center justify-center transition-transform hover:scale-125" style="transform: translate(-50%, -50%);">
                <svg width="34" height="40" viewBox="0 0 34 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.65));">
                  <path d="M17 1 C28 1 33 6 33 17 C33 28 21 36 17 39 C13 36 1 28 1 17 C1 6 6 1 17 1 Z" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
                  <path d="M17 3.5 C26 3.5 30.5 7.5 30.5 17 C30.5 26 19.5 33.5 17 36 C14.5 33.5 3.5 26 3.5 17 C3.5 7.5 8 3.5 17 3.5 Z" fill="#ffffff" stroke="#475569" stroke-width="0.9"/>
                  <text x="17" y="11" text-anchor="middle" font-family="'Sarabun', sans-serif" font-weight="800" font-size="7.5" fill="#64748b">ทล.</text>
                  <text x="17" y="26" text-anchor="middle" font-family="'Sarabun', sans-serif" font-weight="900" font-size="${is4Digits ? 10.5 : 13.5}" fill="#0f172a" letter-spacing="-0.5">${escapeHtml(code)}</text>
                </svg>
              </div>
            `;

          const shieldIcon = L.divIcon({
            html: shieldSvg,
            className: "doh-shield-marker",
            iconSize: [34, 40],
            iconAnchor: [17, 20],
          });

          const marker = L.marker([hwy.lat, hwy.lon], { icon: shieldIcon }).addTo(group);
          marker.bindTooltip(`<strong>ทล.${hwy.code}</strong> ${hwy.name}`, { direction: "top", offset: [0, -20] });
          marker.bindPopup(`
            <div class="text-xs p-1 min-w-[270px] font-body text-slate-100">
              <div class="flex items-center gap-1.5 mb-1.5">
                <span class="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded font-heading">
                  ${isRural ? `ทางหลวงชนบท ${hwy.code}` : `ทางหลวงแผ่นดิน ทล.${hwy.code}`}
                </span>
                <span class="text-[10px] text-emerald-400 font-bold ml-auto flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span> สัญจรปกติ
                </span>
              </div>
              <h4 class="font-bold text-white text-sm font-heading leading-tight">${escapeHtml(hwy.name)}</h4>
              <div class="mt-2 space-y-1 text-[11px] text-slate-300 bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/80">
                <div class="flex items-center justify-between"><span class="text-slate-400">จุดสังเกต:</span> <strong class="text-white">${escapeHtml(hwy.locationName)}</strong></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">มาตรฐานช่องจราจร:</span> <span class="text-sky-300 font-medium">${escapeHtml(hwy.lanes)}</span></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">ประเภทผิวทาง:</span> <span class="text-amber-200">${escapeHtml(hwy.surface)}</span></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">หมวดทางหลวงรับผิดชอบ:</span> <span class="text-white font-medium">${escapeHtml(hwy.responsibleOffice)}</span></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">ความเร็วจำกัด:</span> <span class="text-slate-200">${escapeHtml(hwy.speedLimit)}</span></div>
              </div>
            </div>
          `);
        });
      }

      // B. Draw Dual-Color GIS File Preview (เส้นสีน้ำเงิน = ข้อมูลที่กำลังนำเข้า)
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
        const animClass = style?.animation === "chaser" ? "doh-line-chaser" : style?.animation === "pulse" ? "doh-line-pulse" : style?.animation === "blink" ? "doh-line-blink" : style?.animation === "arrows" ? "doh-line-arrows" : "";
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
                const featureColor = props.color || color;
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
                const name = props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || layer.layer_name;
                const desc = props.description || props.remarks || "";
                const lengthKm = props.length_km || "";
                const ptsCount = props.points_count || (feature.geometry?.coordinates?.length || "");

                // Tooltip showing highway name on hover
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
                      <span class="text-white text-[11px] font-bold px-2 py-0.5 rounded font-heading shadow flex items-center gap-1" style="background-color: ${color}">
                        ${code ? `ทล.${code}` : "ทางหลวง"}
                      </span>
                      <span class="text-[10px] text-amber-300 font-heading font-semibold">
                        ${isMain ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง"}
                      </span>
                    </div>
                    <div class="mt-2">
                      <h4 class="font-bold text-white text-sm font-heading">${name}</h4>
                      ${props.km_start ? `<p class="text-amber-300 text-[11px] mt-0.5 font-mono">กม.${props.km_start} ถึง ${props.km_end || ""}</p>` : ""}
                      ${desc ? `<p class="text-slate-300 text-[11px] mt-0.5">${desc}</p>` : ""}
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
          const fColor = isSelected ? "#ff2222" : (floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color);
          const fWeight = isSelected ? 8 : (floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight);
          const fOpacity = isSelected ? 1 : (floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity);
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
          } else if (flood.water_level_cm === 0 || flood.traffic_status === "PASSABLE") {
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
          marker.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            onSelectFlood(flood.id);
          });
        });
      }

      // D. Draw Admin Draft Snapped Route
      if (draftCoordinates.length >= 2) {
        const draftLatLngs = draftCoordinates.map(toLeafletLatLng);
        const draftColor = draftMode === "FLOOD" ? "#ef4444" : "#f59e0b";
        L.polyline(draftLatLngs as any, {
          color: draftColor,
          weight: 6,
          dashArray: draftMode === "DETOUR" ? "6, 6" : undefined,
          opacity: 0.95,
          renderer: vectorCanvas,
        }).addTo(group);
      }

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
                <div class="w-7 h-7 rounded-lg ${isHq ? "bg-[#0B2A5B]" : "bg-sky-800"} border-2 border-amber-400 flex items-center justify-center shadow-lg text-white">
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

          const marker = L.marker([office.lat, office.lon], { icon: officeIcon }).addTo(group);
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
    showOffices,
    draftCoordinates,
    draftWaypoints,
    draftMode,
    incomingGisLines,
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
          <span>เลเยอร์แผนที่</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>
      ) : (
        <div className="absolute top-4 right-4 z-[400] bg-[#0b162c]/95 backdrop-blur border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl min-w-[215px] sm:min-w-[240px] text-xs pointer-events-auto animate-fade-in">
          <div className="font-heading font-bold text-amber-400 flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-xs text-white">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> เลเยอร์แผนที่ <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1 rounded font-mono">GIS</span>
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
                <span className="w-4 h-1.5 inline-block rounded bg-[#1B5E20]" />
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
                <span className="w-4 h-1.5 inline-block rounded bg-[#0284c7]" />
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
                <span className="w-4 h-1.5 inline-block rounded bg-red-600 animate-pulse" />
                <span>เส้นทางน้ำท่วม (Red)</span>
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
                <span className="w-4 h-1.5 inline-block rounded bg-yellow-400 border-b border-dashed border-slate-900" />
                <span>ทางเลี่ยงแนะนำ (Yellow)</span>
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
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-sm" />
                <span>หมุดระดับน้ำ & ภาพถ่าย</span>
              </span>
              <input
                type="checkbox"
                checked={showRoadLabels}
                onChange={(e) => setShowRoadLabels(e.target.checked)}
                className="accent-amber-400 rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-200 hover:text-white">
              <span className="flex items-center gap-2">
                <Building2 className="w-3 h-3 text-sky-400 inline-block" />
                <span>หมุดแขวงฯ & หมวดทางหลวง</span>
              </span>
              <input
                type="checkbox"
                checked={showOffices}
                onChange={(e) => setShowOffices(e.target.checked)}
                className="accent-sky-400 rounded"
              />
            </label>
          </div>

          {/* Base Map Switcher: Restored Longdo Map + Street + Satellite (Issues #2 & #4) */}
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
    </div>
  );
}
