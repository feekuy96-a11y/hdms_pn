import React from "react";
import { MAX_VERTEX_HANDLES, toLeafletLatLng } from "./longdo-map-popups";

export interface RenderVertexEditHandlesParams {
  L: any;
  map: any;
  group: any;
  geometryToEdit: [number, number][];
  draftCoordinates: [number, number][];
  draftReverseCoordinates: [number, number][];
  vertexEditCoordinates?: [number, number][];
  draftLineRef: React.MutableRefObject<any>;
  revDraftLineRef: React.MutableRefObject<any>;
  onVertexMovedRef: React.MutableRefObject<((index: number, coord: [number, number]) => void) | undefined>;
  onVertexInsertedRef: React.MutableRefObject<((index: number, coord: [number, number]) => void) | undefined>;
  onVertexClickedRef: React.MutableRefObject<((index: number, type: "click" | "contextmenu") => void) | undefined>;
}

/**
 * Renders draggable vertex handles and midpoint insertion handles inside the current
 * Leaflet viewport (bounded by MAX_VERTEX_HANDLES) and binds drag/click/contextmenu events.
 * Emits all mutated vertex coordinates strictly in [lng, lat] order.
 */
export function renderVertexEditHandles({
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
}: RenderVertexEditHandlesParams) {
  const working: [number, number][] = geometryToEdit.map(toLeafletLatLng);
  const lastIndex = working.length - 1;

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
      if (vertexEditCoordinates && vertexEditCoordinates === draftReverseCoordinates) {
        revDraftLineRef.current?.setLatLngs(working);
      } else if (!vertexEditCoordinates || vertexEditCoordinates === draftCoordinates) {
        draftLineRef.current?.setLatLngs(working);
      }
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
}
