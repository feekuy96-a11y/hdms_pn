"use client";

import { useEffect, useRef, useState } from "react";
import { DetourDirectionModeType } from "@/lib/constants";
import { FloodDirectionCode } from "@/lib/flood-event-schema";
import { insertVertex, moveVertex, removeVertex } from "@/lib/line-edit";
import type { VertexEditEvent } from "@/lib/line-edit";

export interface UseMapFreeGeometryEditParams {
  routeMode: "FLOOD" | "DETOUR";
  editingRouteId?: string;
  supportsTwoWayLineEdit: boolean;
  detourDirectionMode: DetourDirectionModeType;
  directionCode: FloodDirectionCode;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (enabled: boolean) => void;
  onVertexEditTargetChange?: (target: "FORWARD" | "REVERSE") => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  startLat: number | string;
  setStartLat: (lat: number | string) => void;
  startLon: number | string;
  setStartLon: (lon: number | string) => void;
  endLat: number | string;
  setEndLat: (lat: number | string) => void;
  endLon: number | string;
  setEndLon: (lon: number | string) => void;
  revStartLat: number | string;
  setRevStartLat: (lat: number | string) => void;
  revStartLon: number | string;
  setRevStartLon: (lon: number | string) => void;
  revEndLat: number | string;
  setRevEndLat: (lat: number | string) => void;
  revEndLon: number | string;
  setRevEndLon: (lon: number | string) => void;
  routingRequestRef: React.MutableRefObject<number>;
  originalReverseRouteCoordinatesRef: React.MutableRefObject<[number, number][]>;
  setAdminPickMode: (mode: string | null) => void;
  setSnappingStatusText: (text: string) => void;
  onToast: (msg: string) => void;
}

/**
 * Manages freehand vertex editing, undo/redo history stacks, and bidirectional
 * reverse-endpoint seeding/clearing for flood and detour geometries.
 * Coordinates stay strictly in [lon, lat] order for Longdo Map compatibility.
 */
export function useMapFreeGeometryEdit({
  routeMode,
  editingRouteId,
  supportsTwoWayLineEdit,
  detourDirectionMode,
  directionCode,
  vertexEvent,
  onVertexEditChange,
  onVertexEditTargetChange,
  draftCoordinates,
  setDraftCoordinates,
  draftReverseCoordinates,
  setDraftReverseCoordinates,
  startLat,
  setStartLat,
  startLon,
  setStartLon,
  endLat,
  setEndLat,
  endLon,
  setEndLon,
  revStartLat,
  setRevStartLat,
  revStartLon,
  setRevStartLon,
  revEndLat,
  setRevEndLat,
  revEndLon,
  setRevEndLon,
  routingRequestRef,
  originalReverseRouteCoordinatesRef,
  setAdminPickMode,
  setSnappingStatusText,
  onToast,
}: UseMapFreeGeometryEditParams) {
  const [freeEditEnabled, setFreeEditEnabled] = useState(false);
  const [freeEditTarget, setFreeEditTarget] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const activeEditTarget: "FORWARD" | "REVERSE" = supportsTwoWayLineEdit ? freeEditTarget : "FORWARD";
  const [freeVertexTool, setFreeVertexTool] = useState<"move" | "delete">("move");
  const [, setFreeHistoryVersion] = useState(0);
  const freePast = useRef<[number, number][][]>([]);
  const freeFuture = useRef<[number, number][][]>([]);
  const handledFreeVertexSeq = useRef(0);
  const onVertexEditChangeRef = useRef(onVertexEditChange);
  onVertexEditChangeRef.current = onVertexEditChange;
  const onVertexEditTargetChangeRef = useRef(onVertexEditTargetChange);
  onVertexEditTargetChangeRef.current = onVertexEditTargetChange;

  useEffect(() => {
    onVertexEditChangeRef.current?.(freeEditEnabled);
    return () => {
      if (freeEditEnabled) onVertexEditChangeRef.current?.(false);
    };
  }, [freeEditEnabled]);

  useEffect(() => {
    if (!supportsTwoWayLineEdit && freeEditTarget !== "FORWARD") {
      setFreeEditTarget("FORWARD");
    }
  }, [supportsTwoWayLineEdit, freeEditTarget]);

  useEffect(() => {
    onVertexEditTargetChangeRef.current?.(activeEditTarget);
  }, [activeEditTarget]);

  useEffect(() => {
    setFreeEditEnabled(false);
    setFreeEditTarget("FORWARD");
    freePast.current = [];
    freeFuture.current = [];
    setFreeHistoryVersion((v) => v + 1);
  }, [routeMode, editingRouteId]);

  const freeGeometry = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;

  const updateFreeGeometry = (next: [number, number][], recordHistory = true) => {
    const current = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
    if (
      next.length < 2 ||
      next === current ||
      next.every((point, index) => point[0] === current[index]?.[0] && point[1] === current[index]?.[1])
    ) {
      return;
    }
    routingRequestRef.current += 1; // prevent a stale OSRM response from overwriting manual edits
    if (recordHistory) {
      freePast.current.push(current.map((p) => [...p] as [number, number]));
      if (freePast.current.length > 30) freePast.current.shift();
      freeFuture.current = [];
    }
    if (activeEditTarget === "REVERSE") {
      setDraftReverseCoordinates?.(next);
      const revStart = next[0];
      const revEnd = next[next.length - 1];
      if (revStart && revEnd) {
        setRevStartLon(revStart[0]);
        setRevStartLat(revStart[1]);
        setRevEndLon(revEnd[0]);
        setRevEndLat(revEnd[1]);
      }
    } else {
      setDraftCoordinates(next);
      // Keep the form's A/B coordinates aligned if an endpoint handle is dragged.
      const reversed = routeMode === "DETOUR" ? detourDirectionMode === "REVERSE_ONLY" : directionCode === "B_TO_A";
      const pointA = reversed ? next[next.length - 1] : next[0];
      const pointB = reversed ? next[0] : next[next.length - 1];
      if (pointA && pointB) {
        setStartLon(pointA[0]);
        setStartLat(pointA[1]);
        setEndLon(pointB[0]);
        setEndLat(pointB[1]);
      }
    }
    setSnappingStatusText("แก้แนวเส้นอิสระแล้ว — ระบบจะบันทึกตามแนวที่เห็น ไม่คำนวณถนนใหม่อัตโนมัติ");
    setFreeHistoryVersion((v) => v + 1);
  };

  const undoFreeGeometry = (redo = false) => {
    const source = redo ? freeFuture.current : freePast.current;
    const destination = redo ? freePast.current : freeFuture.current;
    const previous = source.pop();
    if (!previous) return;
    destination.push(freeGeometry.map((p) => [...p] as [number, number]));
    updateFreeGeometry(previous, false);
  };

  const resetFreeGeometryHistory = (disableEdit = false) => {
    if (disableEdit) {
      setFreeEditEnabled(false);
    }
    freePast.current = [];
    freeFuture.current = [];
    setFreeHistoryVersion((v) => v + 1);
  };

  useEffect(() => {
    if (!freeEditEnabled || !vertexEvent || vertexEvent.seq === handledFreeVertexSeq.current) return;
    handledFreeVertexSeq.current = vertexEvent.seq;
    const coords = activeEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates;
    if (coords.length < 2 || vertexEvent.index < 0 || vertexEvent.index >= coords.length) {
      if (vertexEvent.type !== "insert" || vertexEvent.index < 0 || vertexEvent.index > coords.length) return;
    }
    if ((vertexEvent.type === "move" || vertexEvent.type === "insert") && vertexEvent.coord) {
      const valid =
        vertexEvent.coord.every(Number.isFinite) &&
        Math.abs(vertexEvent.coord[0]) <= 180 &&
        Math.abs(vertexEvent.coord[1]) <= 90;
      if (!valid) return;
      const next =
        vertexEvent.type === "move"
          ? moveVertex(coords, vertexEvent.index, vertexEvent.coord)
          : insertVertex(coords, vertexEvent.index, vertexEvent.coord);
      updateFreeGeometry(next);
    } else if (vertexEvent.type === "contextmenu" || (vertexEvent.type === "click" && freeVertexTool === "delete")) {
      if (coords.length <= 2) {
        onToast("เส้นทางต้องมีจุดอย่างน้อย ๒ จุด");
        return;
      }
      updateFreeGeometry(removeVertex(coords, vertexEvent.index));
    }
  }, [vertexEvent, freeEditEnabled, activeEditTarget, freeVertexTool, draftCoordinates, draftReverseCoordinates]);

  const handleSeedReverseEndpoints = () => {
    if (draftReverseCoordinates.length >= 2) {
      const first = draftReverseCoordinates[0];
      const last = draftReverseCoordinates[draftReverseCoordinates.length - 1];
      setRevStartLat(first[1]);
      setRevStartLon(first[0]);
      setRevEndLat(last[1]);
      setRevEndLon(last[0]);
      onToast("แยกหมุดขากลับ (B → A) จากแนวเส้นปัจจุบันแล้ว ลากหมุดบนแผนที่เพื่อปรับตำแหน่งได้");
      return;
    }
    const eLat = Number(endLat);
    const eLon = Number(endLon);
    const sLat = Number(startLat);
    const sLon = Number(startLon);
    if (!eLat || !eLon || !sLat || !sLon) {
      onToast("กรุณากำหนดจุด A และ B ก่อนแยกหมุดขากลับ (B → A)");
      return;
    }
    setRevStartLat(eLat);
    setRevStartLon(eLon);
    setRevEndLat(sLat);
    setRevEndLon(sLon);
    onToast("วางหมุดขากลับ B→ และ →A บนแผนที่แล้ว สามารถลากแยกตำแหน่งได้ทันที");
  };

  const handleClearReverseEndpoints = () => {
    setRevStartLat("");
    setRevStartLon("");
    setRevEndLat("");
    setRevEndLon("");
    onToast("กลับไปใช้จุด B → A ร่วมกับขาไปเรียบร้อย");
  };

  const handleSelectEditDirection = (nextTarget: "FORWARD" | "REVERSE") => {
    if (nextTarget === "REVERSE" && draftReverseCoordinates.length < 2) {
      const rsLat = Number(revStartLat);
      const rsLon = Number(revStartLon);
      const reLat = Number(revEndLat);
      const reLon = Number(revEndLon);
      if (rsLat && rsLon && reLat && reLon) {
        const seededRev: [number, number][] = [
          [rsLon, rsLat],
          [reLon, reLat],
        ];
        setDraftReverseCoordinates?.(seededRev);
        if (originalReverseRouteCoordinatesRef.current.length < 2) {
          originalReverseRouteCoordinatesRef.current = seededRev.map((p) => [...p] as [number, number]);
        }
      } else if (draftCoordinates.length >= 2) {
        const seeded = [...draftCoordinates].reverse().map((p) => [...p] as [number, number]);
        setDraftReverseCoordinates?.(seeded);
        if (originalReverseRouteCoordinatesRef.current.length < 2) {
          originalReverseRouteCoordinatesRef.current = seeded.map((p) => [...p] as [number, number]);
        }
      }
    }
    setFreeEditTarget(nextTarget);
    setAdminPickMode(null);
    resetFreeGeometryHistory(false);
  };

  return {
    freeEditEnabled,
    setFreeEditEnabled,
    freeEditTarget,
    setFreeEditTarget,
    activeEditTarget,
    freeVertexTool,
    setFreeVertexTool,
    freePastRef: freePast,
    freeFutureRef: freeFuture,
    freeGeometry,
    updateFreeGeometry,
    undoFreeGeometry,
    resetFreeGeometryHistory,
    handleSeedReverseEndpoints,
    handleClearReverseEndpoints,
    handleSelectEditDirection,
  };
}
