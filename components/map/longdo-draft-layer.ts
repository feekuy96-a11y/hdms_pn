import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import {
  dashArrayFor,
  escapeHtml,
  raisePathLayers,
  toLeafletLatLng,
} from "./longdo-map-popups";

export interface DraftPickMarkerPoint {
  lat: number;
  lon: number;
  label: string;
  mode: string;
}

export interface RenderDraftAndConflictLayerParams {
  L: any;
  group: any;
  renderer: any;
  incomingGisLines: [number, number][][];
  draftCoordinates: [number, number][];
  draftReverseCoordinates: [number, number][];
  draftWaypoints: [number, number][];
  draftReverseWaypoints: [number, number][];
  draftConflictPoints: [number, number][];
  draftPickMarkers: DraftPickMarkerPoint[];
  draftMode: "FLOOD" | "DETOUR";
  mapStyles: NonNullable<SystemDataPayload["mapStyles"]>;
  vertexEditable: boolean;
  draftLineRef: React.MutableRefObject<any>;
  revDraftLineRef: React.MutableRefObject<any>;
  adminPickModeRef: React.MutableRefObject<string | null | undefined>;
  onCoordinatePickedRef: React.MutableRefObject<((lat: number, lon: number, mode: string) => void) | undefined>;
  onWaypointDraggedRef: React.MutableRefObject<((index: number, coord: [number, number]) => void) | undefined>;
  onReverseWaypointDraggedRef: React.MutableRefObject<((index: number, coord: [number, number]) => void) | undefined>;
}

/**
 * Renders draft route previews (forward A->B and reverse B->A), imported GIS lines,
 * closed-road conflict pins, start/end pick pins, and numbered draggable waypoints.
 */
export function renderDraftAndConflictLayer({
  L,
  group,
  renderer,
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
}: RenderDraftAndConflictLayerParams) {
  group.clearLayers();
  draftLineRef.current = null;
  revDraftLineRef.current = null;

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

  const draftStyle = draftMode === "FLOOD" ? mapStyles.flood : mapStyles.detour;
  const draftColor =
    draftStyle?.color ||
    (draftMode === "FLOOD" ? LAYER_CONFIG.FLOOD_RED_LINE.color : LAYER_CONFIG.DETOUR_YELLOW_LINE.color);
  const draftDash = dashArrayFor(draftStyle);

  // Snapped draft route (Primary / Forward A->B)
  if (draftCoordinates.length >= 2) {
    const draftLine = L.polyline(draftCoordinates.map(toLeafletLatLng) as any, {
      color: draftColor,
      weight: 6,
      dashArray: draftDash,
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
      color: draftColor,
      weight: 6,
      dashArray: draftDash,
      opacity: 0.95,
      renderer,
    }).addTo(group);
    revDraftLineRef.current = revDraftLine;
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

  // Start / end pick markers (A / B and separate reverse pins B→ / →A).
  // Hidden while freeform vertex handles are active so endpoint handles can be dragged freely.
  if (!vertexEditable) {
    const forwardPoints = draftPickMarkers.filter((p) => p.mode !== "PICK_REV_START" && p.mode !== "PICK_REV_END");
    draftPickMarkers.forEach((point) => {
      const isReversePin = point.mode === "PICK_REV_START" || point.mode === "PICK_REV_END";
      const overlapsForwardPin =
        isReversePin &&
        forwardPoints.some(
          (fp) => Math.abs(fp.lat - point.lat) < 0.00008 && Math.abs(fp.lon - point.lon) < 0.00008
        );
      const badgeStyle =
        point.mode === "PICK_REV_START"
          ? "background:#f59e0b;color:#0f172a;border:2px solid #fff"
          : point.mode === "PICK_REV_END"
            ? "background:#6366f1;color:#fff;border:2px solid #fff"
            : "background:#0ea5e9;color:#fff;border:2px solid #fff";
      const tooltipText =
        point.mode === "PICK_REV_START"
          ? "จุดเริ่มต้นขากลับ (B → A) — ลากเพื่อย้าย"
          : point.mode === "PICK_REV_END"
            ? "จุดสิ้นสุดขากลับ (B → A) — ลากเพื่อย้าย"
            : `จุด${point.label}`;
      const icon = L.divIcon({
        html: `<div style="${badgeStyle}" class="min-w-7 h-7 px-1.5 rounded-full font-heading font-black text-xs flex items-center justify-center shadow-lg">${escapeHtml(point.label)}</div>`,
        className: isReversePin ? "doh-draft-rev-endpoint" : "doh-draft-endpoint",
        iconSize: [32, 28],
        iconAnchor: overlapsForwardPin ? [-2, 14] : [16, 14],
      });
      const marker = L.marker([point.lat, point.lon], {
        icon,
        zIndexOffset: isReversePin ? 1250 : 1200,
        draggable: true,
      })
        .bindTooltip(tooltipText, { direction: "top" })
        .addTo(group);
      marker.on("dragend", (event: any) => {
        const position = event.target.getLatLng();
        onCoordinatePickedRef.current?.(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)), point.mode);
      });
    });
  }

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
}
