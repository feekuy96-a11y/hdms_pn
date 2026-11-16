"use client";

import React, { useEffect, useRef } from "react";
import type { FloodRoute } from "@/db/default-data";
import { APP_CONFIG } from "@/lib/constants";

function parseFloodCoords(raw: string | [number, number][] | undefined | null): [number, number][] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
    .map(([a, b]) => {
      const n0 = Number(a);
      const n1 = Number(b);
      if (!Number.isFinite(n0) || !Number.isFinite(n1)) return null;
      // Convert [lon, lat] GeoJSON pairs into Leaflet [lat, lon]
      return Math.abs(n0) <= 90 && Math.abs(n1) > 90 ? ([n0, n1] as [number, number]) : ([n1, n0] as [number, number]);
    })
    .filter((pt): pt is [number, number] => Boolean(pt));
}

/**
 * Lightweight Leaflet mini-map pinned strictly to the flood event coordinates.
 * Never shifts when detour direction toggles inside the Dossier modal.
 */
export function FloodEventMiniMap({ flood }: { flood: FloodRoute }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let map: any = null;

    async function initMiniMap() {
      if (!containerRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const latLngs = parseFloodCoords(flood.coordinates_json);
      const hasStart = Number.isFinite(flood.lat_start) && Number.isFinite(flood.lon_start) && flood.lat_start !== 0;
      const midPoint: [number, number] =
        latLngs.length > 0
          ? latLngs[Math.floor(latLngs.length / 2)]
          : hasStart
            ? [flood.lat_start, flood.lon_start]
            : [APP_CONFIG.DEFAULT_CENTER.lat, APP_CONFIG.DEFAULT_CENTER.lon];

      map = L.map(containerRef.current, {
        center: midPoint,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      });
      mapInstanceRef.current = map;

      const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY;
      const tileUrl = longdoKey
        ? `https://ms.longdo.com/mmmap/tile.php?zoom={z}&x={x}&y={y}&key=${longdoKey}&proj=epsg3857&mode=icons`
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map);

      if (latLngs.length >= 2) {
        const line = L.polyline(latLngs, { color: "#ef4444", weight: 5, opacity: 0.92 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [18, 18], maxZoom: 15, animate: false });
      } else {
        map.setView(midPoint, 14, { animate: false });
      }

      const cleanRoute = String(flood.route_no || "").replace(/^(?:ทล|ปน)\.?\s*/i, "").trim();
      const pinIcon = L.divIcon({
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
            <div style="width:26px;height:26px;border-radius:9999px;background:#ef4444;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;">
              <div style="width:8px;height:8px;border-radius:9999px;background:#ffffff;"></div>
            </div>
            ${cleanRoute ? `<span style="margin-top:2px;padding:1px 6px;border-radius:6px;background:#0f172a;border:1px solid #f59e0b;color:#fde68a;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.6);">${cleanRoute}</span>` : ""}
          </div>
        `,
        className: "doh-flood-minimap-pin",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(midPoint, { icon: pinIcon, interactive: false }).addTo(map);
    }

    void initMiniMap();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      } else if (map) {
        map.remove();
      }
    };
  }, [flood.id, flood.lat_start, flood.lon_start, flood.route_no, flood.coordinates_json]);

  return (
    <div
      ref={containerRef}
      aria-label={`แผนที่แสดงตำแหน่งเหตุการณ์ ทล.${flood.route_no}`}
      className="h-32 w-full overflow-hidden rounded-xl border border-slate-700/80 bg-[#0b1528]"
    />
  );
}
