"use client";

import React, { useEffect, useRef, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { APP_CONFIG, LAYER_CONFIG, DEFAULT_MAP_STYLES } from "@/lib/constants";
import { PATTANI_DISTRICTS_GEOJSON } from "@/lib/gis-utils";
import { Layers, Navigation, Building2, Map } from "lucide-react";

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
}: LongdoGisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const overlayGroupRef = useRef<any>(null);
  const baseLayersRef = useRef<Record<string, any>>({});
  const currentBaseKeyRef = useRef<string>("road");

  const [activeBaseMap, setActiveBaseMap] = useState<"road" | "sat" | "longdo">("road");
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showDetourLayer, setShowDetourLayer] = useState(true);
  const [showMainHwy, setShowMainHwy] = useState(true);
  const [showSecHwy, setShowSecHwy] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
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

      const L = (await import("leaflet")).default;

      if (!isMounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon],
        zoom: APP_CONFIG.DEFAULT_ZOOM,
        zoomControl: true,
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

      baseLayers.road.addTo(map);
      baseLayersRef.current = baseLayers;
      leafletMapRef.current = map;

      const overlayGroup = L.layerGroup().addTo(map);
      overlayGroupRef.current = overlayGroup;

      // Handle map clicks for coordinate picking
      map.on("click", (e: any) => {
        if (!adminPickModeRef.current) return;
        const lat = Number(e.latlng.lat.toFixed(6));
        const lon = Number(e.latlng.lng.toFixed(6));
        onCoordinatePickedRef.current?.(lat, lon, adminPickModeRef.current);
      });
    }

    initMap();

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // 2. FlyTo focus when coordinates change
  useEffect(() => {
    if (leafletMapRef.current && focusCoordinates) {
      leafletMapRef.current.flyTo([focusCoordinates[1], focusCoordinates[0]], 13, { duration: 1.2 });
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
      const L = (await import("leaflet")).default;
      const group = overlayGroupRef.current;
      group.clearLayers();

      // A. Draw Boundary Layers (เส้นขอบเขต ๑๒ อำเภอ จ.ปัตตานี)
      if (showBoundaries) {
        try {
          L.geoJSON(PATTANI_DISTRICTS_GEOJSON as any, {
            style: {
              color: "#38bdf8",
              weight: 1.5,
              dashArray: "4, 4",
              fillColor: "#0284c7",
              fillOpacity: 0.05,
            },
            onEachFeature: (feature: any, layer: any) => {
              if (feature?.properties?.name) {
                layer.bindTooltip(feature.properties.name, {
                  permanent: false,
                  direction: "center",
                  className: "bg-slate-900 text-sky-300 font-heading text-[10px] px-1.5 py-0.5 rounded border border-sky-600 shadow",
                });
              }
            },
          }).addTo(group);
        } catch (e) {}
      }

      // B. Draw Dual-Color GIS File Preview (เส้นสีน้ำเงิน = ข้อมูลที่กำลังนำเข้า)
      if (incomingGisLines && incomingGisLines.length > 0) {
        incomingGisLines.forEach((line) => {
          if (line.length >= 2) {
            const latLngs = line.map((c) => [c[1], c[0]]);
            L.polyline(latLngs as any, {
              color: "#0284c7",
              weight: 5,
              dashArray: "6, 6",
              opacity: 0.95,
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
              style: {
                color,
                weight,
                opacity,
                dashArray,
                className: `${animClass} ${speedClass}`.trim(),
              },
              onEachFeature: (feature: any, geoFeatureLayer: any) => {
                const props = feature.properties || {};
                const code = props.route_code || props.ROAD_NO || props.route || props.code || "";
                const name = props.route_name || props.ROAD_NAME || props.section || props.name || layer.layer_name;
                const desc = props.description || "";
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
                  <div class="text-xs p-2 min-w-[260px] font-body bg-slate-950 text-white rounded-xl border-2 shadow-2xl" style="border-color: ${color}">
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
                      ${desc ? `<p class="text-slate-300 text-[11px] mt-0.5">${desc}</p>` : ""}
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800 text-[11px]">
                      <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">ระยะทางสายทาง</span>
                        <strong class="text-amber-400 font-mono">${lengthKm ? `${lengthKm} กม.` : "ตามโครงข่าย"}</strong>
                      </div>
                      <div class="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <span class="text-slate-400 block text-[10px]">จุดพิกัด GIS</span>
                        <strong class="text-sky-400 font-mono">${ptsCount ? `${ptsCount} จุด` : "มาตรฐาน"}</strong>
                      </div>
                    </div>
                    <div class="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                      <span>ความรับผิดชอบ: ขท.ปัตตานี</span>
                      <span class="text-emerald-400 font-semibold">เปิดการจราจร ✓</span>
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
            const latLngs = coords.map((c) => [c[1], c[0]]);
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
            }).addTo(group);

            polyline.bindPopup(`
              <div class="text-xs p-1.5 font-body bg-slate-950 text-white rounded-xl border" style="border-color: ${dColor}">
                <span class="text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded font-heading shadow" style="background-color: ${dColor}">
                  เส้นทางเลี่ยงแนะนำ
                </span>
                <h4 class="font-bold text-white text-sm mt-1.5 font-heading">${detour.route_name}</h4>
                <p class="text-slate-300 mt-1">${detour.description || "-"}</p>
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
            const latLngs = coords.map((c) => [c[1], c[0]]);
            const polyline = L.polyline(latLngs as any, {
              color: fColor,
              weight: fWeight,
              opacity: fOpacity,
              dashArray: fDash,
              className: `${fAnim} ${fSpeed}`.trim(),
            }).addTo(group);

            polyline.on("click", () => onSelectFlood(flood.id));
          }

          // Flood Location Marker (Pulsing Pin with DOH Highway Emblem)
          const midLat = flood.lat_start || (coords[0] ? coords[0][1] : APP_CONFIG.DEFAULT_CENTER.lat);
          const midLon = flood.lon_start || (coords[0] ? coords[0][0] : APP_CONFIG.DEFAULT_CENTER.lon);

          const statusColor = flood.traffic_status === "CLOSED" ? "bg-red-700" : "bg-amber-600";
          const iconHtml = `
            <div class="relative cursor-pointer" style="transform: translate(-50%, -50%);">
              <div class="w-8 h-8 rounded-full ${statusColor} flood-pin-pulse flex items-center justify-center border-2 border-white shadow-xl" style="background-color: ${fColor}">
                <span class="text-white text-[10px] font-extrabold font-heading">${flood.route_no}</span>
              </div>
              <div class="absolute -top-5 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-amber-400 text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded shadow whitespace-nowrap font-heading">
                ${flood.water_level_cm} ซม.
              </div>
            </div>
          `;

          const pinIcon = L.divIcon({
            html: iconHtml,
            className: "doh-flood-marker",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const marker = L.marker([midLat, midLon], { icon: pinIcon }).addTo(group);
          marker.on("click", () => onSelectFlood(flood.id));

          marker.bindPopup(`
            <div class="text-xs p-1.5 min-w-[220px] font-body bg-slate-950 text-white rounded-xl border" style="border-color: ${fColor}">
              <div class="flex items-center justify-between mb-1 gap-2">
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded font-heading shadow" style="background-color: ${fColor}">
                  ทล.${flood.route_no}
                </span>
                <span class="text-[10px] font-bold font-heading ${flood.traffic_status === "CLOSED" ? "text-red-400" : "text-amber-400"}">
                  ${flood.traffic_status === "CLOSED" ? "ปิดการจราจรเด็ดขาด" : "เฝ้าระวัง / ๑ ช่องทาง"}
                </span>
              </div>
              <h4 class="font-bold text-white text-sm font-heading mt-1">${flood.section_name}</h4>
              <div class="text-slate-300 text-[11px] mt-1">ช่วง กม. ${flood.km_start} - ${flood.km_end}</div>
              <div class="mt-2 text-amber-300 font-bold flex items-center justify-between border-t border-slate-700 pt-1.5 font-heading">
                <span>ระดับน้ำท่วมขัง:</span>
                <span class="text-sm font-mono">${flood.water_level_cm} ซม.</span>
              </div>
            </div>
          `);
        });
      }

      // D. Draw Admin Draft Snapped Route
      if (draftCoordinates.length >= 2) {
        const draftLatLngs = draftCoordinates.map((c) => [c[1], c[0]]);
        const draftColor = draftMode === "FLOOD" ? "#ef4444" : "#f59e0b";
        L.polyline(draftLatLngs as any, {
          color: draftColor,
          weight: 6,
          dashArray: draftMode === "DETOUR" ? "6, 6" : undefined,
          opacity: 0.95,
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
              <h4 class="font-bold text-white text-sm font-heading">${office.name}</h4>
              <p class="text-slate-300 text-[11px] mt-1">${office.address}</p>
              <div class="mt-2 pt-1.5 border-t border-slate-700 flex items-center justify-between">
                <a href="tel:${office.phone.replace(/[^0-9]/g, "")}" class="text-amber-300 hover:underline font-bold text-xs flex items-center gap-1">
                  📞 ${office.phone}
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
    systemData,
    selectedFloodId,
    showFloodLayer,
    showDetourLayer,
    showMainHwy,
    showSecHwy,
    showBoundaries,
    showOffices,
    draftCoordinates,
    draftWaypoints,
    draftMode,
    incomingGisLines,
  ]);

  return (
    <div className={`relative ${className} overflow-hidden`}>
      <div ref={mapContainerRef} className="w-full h-full bg-slate-950" />

      {/* Top Map KPI Status Badges & Base Map Switcher */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap gap-1.5 pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur border border-red-500/60 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-[11px] text-slate-300">ผ่านไม่ได้:</span>
            <strong className="text-xs sm:text-sm font-heading text-red-400">
              {systemData.floodRoutes.filter((r) => r.is_active && r.traffic_status === "CLOSED").length} จุด
            </strong>
          </div>
          <div className="bg-slate-950/90 backdrop-blur border border-amber-500/60 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-[11px] text-slate-300">เฝ้าระวัง:</span>
            <strong className="text-xs sm:text-sm font-heading text-amber-300">
              {systemData.floodRoutes.filter((r) => r.is_active && r.traffic_status !== "CLOSED").length} จุด
            </strong>
          </div>
          <div className="bg-slate-950/90 backdrop-blur border border-yellow-400/60 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
            <Navigation className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[11px] text-slate-300">ทางเลี่ยง:</span>
            <strong className="text-xs sm:text-sm font-heading text-yellow-300">
              {systemData.detourRoutes.length} สาย
            </strong>
          </div>
        </div>

        {/* Base Map Switcher */}
        <div className="pointer-events-auto flex items-center gap-1 bg-slate-950/90 backdrop-blur p-1 rounded-xl border border-slate-700 shadow-lg text-[11px] font-heading">
          <button
            type="button"
            onClick={() => switchBaseMap("road")}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              activeBaseMap === "road" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            แผนที่ถนน
          </button>
          <button
            type="button"
            onClick={() => switchBaseMap("sat")}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              activeBaseMap === "sat" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            ดาวเทียม Hybrid
          </button>
          <button
            type="button"
            onClick={() => switchBaseMap("longdo")}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              activeBaseMap === "longdo" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Longdo HD
          </button>
        </div>
      </div>

      {/* Layer Control Legend on Bottom Left */}
      <div className="absolute bottom-3 left-3 z-[400] bg-slate-950/90 backdrop-blur border border-slate-700 rounded-xl p-2.5 text-[11px] shadow-xl space-y-1.5 max-w-[230px]">
        <div className="font-heading font-bold text-amber-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> เลเยอร์โครงข่าย
          </span>
          <button type="button" onClick={resetCamera} className="text-[10px] text-sky-400 hover:underline">
            รวมทั้งจังหวัด
          </button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showFloodLayer}
            onChange={(e) => setShowFloodLayer(e.target.checked)}
            className="accent-red-500"
          />
          <span
            className="w-4 h-1.5 inline-block rounded shadow-sm"
            style={{ backgroundColor: mapStyles.flood?.color || "#D32F2F" }}
          />
          <span>เส้นทางน้ำท่วม (Flood Line)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showDetourLayer}
            onChange={(e) => setShowDetourLayer(e.target.checked)}
            className="accent-yellow-400"
          />
          <span
            className="w-4 h-1.5 inline-block rounded shadow-sm"
            style={{ backgroundColor: mapStyles.detour?.color || "#FBC02D" }}
          />
          <span>เส้นทางเลี่ยง (Detour Line)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showMainHwy}
            onChange={(e) => setShowMainHwy(e.target.checked)}
            className="accent-emerald-500"
          />
          <span
            className="w-4 h-1.5 inline-block rounded shadow-sm"
            style={{ backgroundColor: mapStyles.primary?.color || "#1B5E20" }}
          />
          <span>ทางหลวงสายหลัก</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showSecHwy}
            onChange={(e) => setShowSecHwy(e.target.checked)}
            className="accent-sky-400"
          />
          <span
            className="w-4 h-1 inline-block rounded shadow-sm"
            style={{ backgroundColor: mapStyles.secondary?.color || "#0284c7" }}
          />
          <span>ทางหลวงสายรอง</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBoundaries}
            onChange={(e) => setShowBoundaries(e.target.checked)}
            className="accent-cyan-400"
          />
          <span className="w-4 h-1 border-t-2 border-dashed border-cyan-400 inline-block" />
          <span>ขอบเขต ๑๒ อำเภอ</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOffices}
            onChange={(e) => setShowOffices(e.target.checked)}
            className="accent-amber-400"
          />
          <span className="w-3.5 h-3.5 rounded bg-[#0B2A5B] border border-amber-400 inline-block" />
          <span>หมุดแขวงฯ & ๕ หมวดทางหลวง</span>
        </label>
        <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRoadLabels}
              onChange={(e) => setShowRoadLabels(e.target.checked)}
              className="accent-amber-500 rounded"
            />
            <span>แสดงป้ายชื่อสายทาง (Road Labels)</span>
          </label>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOffices}
            onChange={(e) => setShowOffices(e.target.checked)}
            className="accent-amber-400"
          />
          <span className="w-2.5 h-2.5 bg-amber-400 inline-block rounded" />
          <span>หมุดแขวง/หมวดทางหลวง</span>
        </label>
      </div>
    </div>
  );
}
