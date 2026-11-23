"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { updateHighwayLayerAction } from "@/app/actions/doh-actions";
import type { EditingGeometryState } from "@/components/admin/tabs/GisHighwayModals";
import { lineCoordinates } from "@/components/admin/tabs/gis-import-helpers";
import { analyzeCarriagewaySeparation, calculateRoadSnappedRoute } from "@/lib/gis-utils";
import {
  haversineMeters,
  insertVertex,
  joinLines,
  moveVertex,
  nearestInsertIndex,
  removeVertex,
  roundCoord,
  splitLine,
  type LonLat,
  type VertexEditEvent,
} from "@/lib/line-edit";

// One undo/redo step of the freeform editor. Split/join results are part of the snapshot so
// undo also reverts them.
interface EditSnapshot {
  coords: LonLat[];
  remainder: LonLat[] | null;
  absorbed: number[];
}

export interface UseHighwayGeometryEditorParams {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showSuccessModal: (title: string, message: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string; ts?: number } | null;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setDraftDirectionMeta?: (
    meta: {
      arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
      showArrows?: boolean;
      directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
    } | null
  ) => void;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  setDraftPickMarkers?: React.Dispatch<
    React.SetStateAction<Array<{ lat: number; lon: number; label: string; mode: string }>>
  >;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (active: boolean) => void;
}

/**
 * Manages the interactive Highway Geometry Editor (road-snapping mode, freeform vertex
 * edit/split/join with undo/redo snapshots, dual-carriageway OSRM separation, and GeoJSON/KML export).
 * Preserves GeoJSON [lon, lat] coordinate ordering at every boundary.
 */
export function useHighwayGeometryEditor({
  systemData,
  onDataRefresh,
  onToast,
  showSuccessModal,
  setIncomingGisLines,
  setAdminPickMode,
  pickedCoordinate,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  setDraftReverseCoordinates,
  setDraftReverseWaypoints,
  setDraftDirectionMeta,
  onDraftModeChange,
  setDraftPickMarkers,
  vertexEvent,
  onVertexEditChange,
}: UseHighwayGeometryEditorParams) {
  const [editingGeometry, setEditingGeometry] = useState<{
    layerId: string;
    featureIdx: number;
    start: [number, number];
    end: [number, number];
    originalCoordinates: [number, number][];
  } | null>(null);
  const [isSnappingGeometry, setIsSnappingGeometry] = useState(false);

  // Item 2: Road Structure & Directional Arrow Metadata for GIS Line Generation
  const [carriagewayStructure, setCarriagewayStructure] = useState<
    "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ONE_WAY"
  >("SINGLE_CENTERLINE");
  const [arrowDirectionSetting, setArrowDirectionSetting] = useState<
    "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN"
  >("TWO_WAY");
  const [showFeatureArrows, setShowFeatureArrows] = useState<boolean>(true);
  const [dualReverseCoords, setDualReverseCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!editingGeometry) return;
    const effectiveArrowDir =
      carriagewayStructure === "DUAL_CARRIAGEWAY"
        ? "FORWARD"
        : carriagewayStructure === "ONE_WAY"
          ? arrowDirectionSetting === "REVERSE"
            ? "REVERSE"
            : "FORWARD"
          : arrowDirectionSetting;
    setDraftDirectionMeta?.({
      arrowDirection: effectiveArrowDir,
      showArrows: showFeatureArrows && effectiveArrowDir !== "UNKNOWN",
      directionMode: carriagewayStructure === "DUAL_CARRIAGEWAY" ? "TWO_WAY" : "FORWARD_ONLY",
    });
  }, [editingGeometry, carriagewayStructure, arrowDirectionSetting, showFeatureArrows, setDraftDirectionMeta]);

  // Freeform editor state (Google My Maps style)
  const [editorMode, setEditorMode] = useState<"free" | "road">("road");
  const [vertexTool, setVertexTool] = useState<"move" | "delete" | "split">("move");
  const [splitRemainder, setSplitRemainder] = useState<LonLat[] | null>(null);
  const [absorbedFeatureIdxs, setAbsorbedFeatureIdxs] = useState<number[]>([]);
  const [joinTargetIdx, setJoinTargetIdx] = useState("");
  const historyRef = useRef<{ past: EditSnapshot[]; future: EditSnapshot[] }>({ past: [], future: [] });
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const isEditingGeometry = Boolean(editingGeometry);

  const snapshotNow = (): EditSnapshot => ({
    coords: draftCoordinates,
    remainder: splitRemainder,
    absorbed: absorbedFeatureIdxs,
  });
  const applySnapshot = (snapshot: EditSnapshot) => {
    setDraftCoordinates(snapshot.coords);
    setSplitRemainder(snapshot.remainder);
    setAbsorbedFeatureIdxs(snapshot.absorbed);
  };
  const resetEditHistory = () => {
    historyRef.current = { past: [], future: [] };
    setHistorySize({ undo: 0, redo: 0 });
  };
  const commitEdit = (next: EditSnapshot) => {
    const history = historyRef.current;
    history.past.push(snapshotNow());
    if (history.past.length > 100) history.past.shift();
    history.future = [];
    applySnapshot(next);
    setHistorySize({ undo: history.past.length, redo: 0 });
  };
  const undoEdit = () => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(snapshotNow());
    applySnapshot(previous);
    setHistorySize({ undo: history.past.length, redo: history.future.length });
  };
  const redoEdit = () => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past.push(snapshotNow());
    applySnapshot(next);
    setHistorySize({ undo: history.past.length, redo: history.future.length });
  };

  const closeGeometryEditor = () => {
    setEditingGeometry(null);
    setAdminPickMode(null);
    setDraftCoordinates([]);
    setDraftWaypoints([]);
    setDraftReverseCoordinates?.([]);
    setDraftReverseWaypoints?.([]);
    setDraftDirectionMeta?.(null);
    setDualReverseCoords([]);
    setSplitRemainder(null);
    setAbsorbedFeatureIdxs([]);
    setJoinTargetIdx("");
    setVertexTool("move");
    resetEditHistory();
    onDraftModeChange?.("FLOOD");
  };

  useEffect(() => {
    if (!editingGeometry || editorMode === "free") {
      setDraftPickMarkers?.([]);
      return;
    }
    const { start, end } = editingGeometry;
    setDraftPickMarkers?.([
      { lat: start[1], lon: start[0], label: "A", mode: "PICK_HIGHWAY_START" },
      { lat: end[1], lon: end[0], label: "B", mode: "PICK_HIGHWAY_END" },
    ]);
  }, [editingGeometry, editorMode, setDraftPickMarkers]);

  // Tell the map to show vertex handles only while the freeform editor is open.
  useEffect(() => {
    onVertexEditChange?.(isEditingGeometry && editorMode === "free");
    return () => onVertexEditChange?.(false);
  }, [isEditingGeometry, editorMode, onVertexEditChange]);

  useEffect(() => {
    if (!editingGeometry || !pickedCoordinate) return;
    if (pickedCoordinate.mode === "PICK_HIGHWAY_START") {
      setEditingGeometry((current) =>
        current ? { ...current, start: [pickedCoordinate.lon, pickedCoordinate.lat] } : current
      );
    }
    if (pickedCoordinate.mode === "PICK_HIGHWAY_END") {
      setEditingGeometry((current) =>
        current ? { ...current, end: [pickedCoordinate.lon, pickedCoordinate.lat] } : current
      );
    }
    if (pickedCoordinate.mode === "ADD_HIGHWAY_BEND") {
      setDraftWaypoints((current) => [...current, [pickedCoordinate.lon, pickedCoordinate.lat]]);
    }
    if (pickedCoordinate.mode === "ADD_LINE_VERTEX" && editorMode === "free") {
      const point: LonLat = [pickedCoordinate.lon, pickedCoordinate.lat];
      const { index } = nearestInsertIndex(draftCoordinates, point);
      commitEdit({ ...snapshotNow(), coords: insertVertex(draftCoordinates, index, point) });
    }
  }, [pickedCoordinate?.ts, pickedCoordinate?.mode]);

  // Events from the vertex handles drawn on the map (drag / click "+" / click vertex / right-click vertex)
  useEffect(() => {
    if (!editingGeometry || editorMode !== "free" || !vertexEvent) return;
    const { type, index, coord } = vertexEvent;
    if (type === "move" && coord) {
      commitEdit({ ...snapshotNow(), coords: moveVertex(draftCoordinates, index, coord) });
      return;
    }
    if (type === "insert" && coord) {
      commitEdit({ ...snapshotNow(), coords: insertVertex(draftCoordinates, index, coord) });
      return;
    }
    if (type === "contextmenu" || (type === "click" && vertexTool === "delete")) {
      if (draftCoordinates.length <= 2) {
        onToast("เส้นต้องมีอย่างน้อย 2 จุด ไม่สามารถลบจุดเพิ่มได้");
        return;
      }
      commitEdit({ ...snapshotNow(), coords: removeVertex(draftCoordinates, index) });
      return;
    }
    if (type === "click" && vertexTool === "split") {
      if (splitRemainder) {
        onToast("ตัดเส้นได้ครั้งละ 1 ครั้ง กรุณาบันทึก หรือกดย้อนกลับก่อน");
        return;
      }
      const parts = splitLine(draftCoordinates, index);
      if (!parts) {
        onToast("เลือกจุดตรงกลางเส้นเพื่อตัด (ไม่ใช่จุดปลายเส้น)");
        return;
      }
      commitEdit({ ...snapshotNow(), coords: parts[0], remainder: parts[1] });
      setVertexTool("move");
      onToast("ตัดเส้นแล้ว ส่วนที่ 2 (เส้นประสีฟ้า) จะถูกบันทึกเป็นสายทางใหม่เมื่อกดบันทึก");
    }
  }, [vertexEvent?.seq]);

  useEffect(() => {
    if (editingGeometry) {
      const lines: [number, number][][] = [draftCoordinates];
      if (splitRemainder && splitRemainder.length >= 2) lines.push(splitRemainder);
      if (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2) lines.push(dualReverseCoords);
      setIncomingGisLines?.(lines);
      setDraftReverseCoordinates?.(carriagewayStructure === "DUAL_CARRIAGEWAY" ? dualReverseCoords : []);
    } else {
      setIncomingGisLines?.([]);
    }
  }, [
    editingGeometry,
    draftCoordinates,
    splitRemainder,
    carriagewayStructure,
    dualReverseCoords,
    setIncomingGisLines,
    setDraftReverseCoordinates,
  ]);

  // Nearest other routes of the same layer (by distance between line ends) that can be joined.
  const firstCoordLon = draftCoordinates[0]?.[0];
  const firstCoordLat = draftCoordinates[0]?.[1];
  const lastCoordLon = draftCoordinates[draftCoordinates.length - 1]?.[0];
  const lastCoordLat = draftCoordinates[draftCoordinates.length - 1]?.[1];
  const hasMinDraftPoints = draftCoordinates.length >= 2;
  const joinCandidates = useMemo(() => {
    if (
      !editingGeometry ||
      editorMode !== "free" ||
      !hasMinDraftPoints ||
      firstCoordLon === undefined ||
      firstCoordLat === undefined ||
      lastCoordLon === undefined ||
      lastCoordLat === undefined
    ) {
      return [];
    }
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    const features = layer?.geojson_data?.features;
    if (!Array.isArray(features)) return [];
    const first: LonLat = [firstCoordLon, firstCoordLat];
    const last: LonLat = [lastCoordLon, lastCoordLat];
    const rows: Array<{ idx: number; label: string; gap: number }> = [];
    features.forEach((feature: any, idx: number) => {
      if (idx === editingGeometry.featureIdx || absorbedFeatureIdxs.includes(idx)) return;
      const geometry = feature?.geometry;
      const coords: any[] =
        geometry?.type === "LineString"
          ? geometry.coordinates
          : geometry?.type === "MultiLineString"
            ? geometry.coordinates.flat(1)
            : [];
      if (!Array.isArray(coords) || coords.length < 2) return;
      const a = coords[0] as LonLat;
      const b = coords[coords.length - 1] as LonLat;
      const gap = Math.min(
        haversineMeters(last, a),
        haversineMeters(last, b),
        haversineMeters(first, a),
        haversineMeters(first, b)
      );
      const props = feature?.properties || {};
      rows.push({ idx, gap, label: `ทล.${props.route_no ?? ""} · ${props.section_name ?? ""}` });
    });
    rows.sort((x, y) => x.gap - y.gap);
    return rows.slice(0, 50);
  }, [
    editingGeometry,
    editorMode,
    hasMinDraftPoints,
    firstCoordLon,
    firstCoordLat,
    lastCoordLon,
    lastCoordLat,
    absorbedFeatureIdxs,
    systemData.highwayLayers,
  ]);

  const openGeometryEditor = (layerId: string, featureIdx: number) => {
    const feature = (systemData.highwayLayers || []).find((layer) => layer.layer_id === layerId)?.geojson_data
      ?.features?.[featureIdx];
    const coords = lineCoordinates(feature?.geometry);
    if (coords.length < 2) {
      onToast("สายทางนี้ไม่มีข้อมูลเส้นที่แก้ไขได้ กรุณานำเข้าไฟล์เส้นทางก่อน");
      return;
    }
    const start = coords[0];
    const end = coords[coords.length - 1];
    const props = feature?.properties || {};
    setDraftCoordinates(coords);
    setDraftWaypoints([]);
    setDualReverseCoords([]);
    setCarriagewayStructure(
      props.carriageway_type === "DUAL_CARRIAGEWAY"
        ? "DUAL_CARRIAGEWAY"
        : props.carriageway_type === "ONE_WAY"
          ? "ONE_WAY"
          : "SINGLE_CENTERLINE"
    );
    setArrowDirectionSetting(
      props.arrow_direction === "FORWARD" ||
        props.arrow_direction === "REVERSE" ||
        props.arrow_direction === "TWO_WAY" ||
        props.arrow_direction === "UNKNOWN"
        ? props.arrow_direction
        : "TWO_WAY"
    );
    setShowFeatureArrows(props.show_arrows !== false);
    // The common map drag handler must use road routing for a highway editor,
    // not the flood-only PostGIS snap rule inherited from a previous tab.
    onDraftModeChange?.("DETOUR");
    setEditingGeometry({
      layerId,
      featureIdx,
      start,
      end,
      originalCoordinates: coords.map((coordinate) => [...coordinate] as [number, number]),
    });
    // Opens in road-snapping mode, the long-standing default (and what tests/e2e expect).
    setEditorMode("road");
    setVertexTool("move");
    setSplitRemainder(null);
    setAbsorbedFeatureIdxs([]);
    setJoinTargetIdx("");
    resetEditHistory();
    onToast(
      'เปิดตัวแก้ไขแนวถนนแล้ว เลือกพิกัดบนแผนที่หรือกรอกพิกัดเองได้ (สลับเป็น "วาด/แก้ไขอิสระ" เพื่อลากจุดเอง)'
    );
  };

  const snapEditedGeometry = async () => {
    if (!editingGeometry) return;
    setIsSnappingGeometry(true);
    try {
      const coords = await calculateRoadSnappedRoute(editingGeometry.start, editingGeometry.end, draftWaypoints);
      if (coords.length < 2) throw new Error("ไม่พบแนวถนนสำหรับเชื่อมต่อพิกัดที่เลือก");
      setDraftCoordinates(coords);

      if (carriagewayStructure === "DUAL_CARRIAGEWAY") {
        // Query real opposite carriageway B -> A from OSRM without fake parallel offset
        const revWaypoints = [...draftWaypoints].reverse();
        const revCoords = await calculateRoadSnappedRoute(
          editingGeometry.end,
          editingGeometry.start,
          revWaypoints
        ).catch(() => [] as [number, number][]);
        if (revCoords.length >= 2) {
          const sep = analyzeCarriagewaySeparation(coords, revCoords);
          if (!sep.isSymmetricSingleLine) {
            setDualReverseCoords(revCoords);
            onToast(
              `สร้างแนวถนน 2 คันทางแยกตามโครงข่ายจริงแล้ว (A→B ${coords.length} จุด, B→A ${revCoords.length} จุด · ห่างเฉลี่ย ${sep.medianSeparationMeters} ม.)`
            );
          } else {
            setDualReverseCoords([]);
            onToast(
              "โครงข่ายถนนบริเวณนี้เป็นเส้นกึ่งกลางเดี่ยว ระบบใช้เส้นเดี่ยวพร้อมลูกศร 2 ทิศทาง (ไม่ใช้เส้นคู่ขนานปลอม)"
            );
          }
        } else {
          setDualReverseCoords([]);
        }
      } else {
        setDualReverseCoords([]);
        onToast("สร้างแนวเชื่อมต่อเกาะตามถนนแล้ว คุณสามารถลากจุดสีส้มเพื่อดัดแนวได้");
      }
    } catch (error: any) {
      onToast(`สร้างแนวถนนไม่สำเร็จ: ${error.message}`);
    } finally {
      setIsSnappingGeometry(false);
    }
  };

  const removeGeometryWaypoint = async (index: number) => {
    if (!editingGeometry) return;
    const nextWaypoints = draftWaypoints.filter((_, waypointIndex) => waypointIndex !== index);
    setDraftWaypoints(nextWaypoints);
    setIsSnappingGeometry(true);
    try {
      const coords = await calculateRoadSnappedRoute(editingGeometry.start, editingGeometry.end, nextWaypoints);
      if (coords.length < 2) throw new Error("ไม่พบแนวถนนหลังลบจุดดัด");
      setDraftCoordinates(coords);
      onToast(`ลบจุดดัดที่ ${index + 1} และคำนวณแนวถนนใหม่แล้ว`);
    } catch (error: any) {
      onToast(`ลบจุดดัดแล้ว แต่คำนวณแนวถนนใหม่ไม่สำเร็จ: ${error.message}`);
    } finally {
      setIsSnappingGeometry(false);
    }
  };

  const restoreOriginalGeometry = () => {
    if (!editingGeometry) return;
    setDraftWaypoints([]);
    commitEdit({
      coords: editingGeometry.originalCoordinates.map((coordinate) => [...coordinate] as LonLat),
      remainder: null,
      absorbed: [],
    });
    onToast("คืนค่าแนวถนนเดิมแล้ว กดบันทึกเพื่อยืนยัน (กดย้อนกลับเพื่อยกเลิกการคืนค่า)");
  };

  const switchEditorMode = (mode: "free" | "road") => {
    if (!editingGeometry || mode === editorMode) return;
    if (mode === "road") {
      if (splitRemainder || absorbedFeatureIdxs.length > 0) {
        onToast("กรุณาบันทึก หรือกดย้อนกลับการตัด/เชื่อมเส้นก่อนสลับไปโหมดเกาะแนวถนน");
        return;
      }
      const first = draftCoordinates[0];
      const last = draftCoordinates[draftCoordinates.length - 1];
      if (first && last) setEditingGeometry((current) => (current ? { ...current, start: first, end: last } : current));
    } else {
      setDraftWaypoints([]);
    }
    setAdminPickMode(null);
    setVertexTool("move");
    resetEditHistory();
    setEditorMode(mode);
  };

  const handleJoinSelected = () => {
    if (!editingGeometry) return;
    const targetIdx = Number(joinTargetIdx);
    if (!joinTargetIdx || !Number.isInteger(targetIdx)) return;
    if (splitRemainder) {
      onToast("กรุณาบันทึก หรือกดย้อนกลับการตัดเส้นก่อนเชื่อมเส้น");
      return;
    }
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    const otherCoords = lineCoordinates(layer?.geojson_data?.features?.[targetIdx]?.geometry);
    if (otherCoords.length < 2) {
      onToast("สายทางที่เลือกไม่มีข้อมูลเส้นที่เชื่อมได้");
      return;
    }
    const { coords, gapMeters } = joinLines(draftCoordinates, otherCoords);
    commitEdit({
      coords: coords.map((point) => roundCoord(point)),
      remainder: null,
      absorbed: [...absorbedFeatureIdxs, targetIdx],
    });
    setJoinTargetIdx("");
    onToast(
      gapMeters > 1
        ? `เชื่อมเส้นแล้ว (ปลายเส้นห่างกัน ${Math.round(gapMeters)} ม. ต่อด้วยเส้นตรง) สายทางที่เลือกจะถูกรวมเมื่อกดบันทึก`
        : "เชื่อมเส้นแล้ว สายทางที่เลือกจะถูกรวมเข้ากับเส้นนี้เมื่อกดบันทึก"
    );
  };

  const saveEditedGeometry = async () => {
    if (!editingGeometry || draftCoordinates.length < 2) return;
    const layer = (systemData.highwayLayers || []).find((item) => item.layer_id === editingGeometry.layerId);
    if (!layer?.geojson_data?.features?.[editingGeometry.featureIdx]) return;
    const geojson = JSON.parse(JSON.stringify(layer.geojson_data));
    const currentProps = geojson.features[editingGeometry.featureIdx].properties || {};
    const effectiveArrowDir =
      carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2
        ? "FORWARD"
        : carriagewayStructure === "ONE_WAY"
          ? arrowDirectionSetting === "REVERSE"
            ? "REVERSE"
            : "FORWARD"
          : arrowDirectionSetting;

    geojson.features[editingGeometry.featureIdx].geometry = {
      type: "LineString",
      coordinates: draftCoordinates,
    };
    geojson.features[editingGeometry.featureIdx].properties = {
      ...currentProps,
      carriageway_type:
        carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2
          ? "DUAL_CARRIAGEWAY"
          : carriagewayStructure,
      arrow_direction: effectiveArrowDir,
      show_arrows: showFeatureArrows && effectiveArrowDir !== "UNKNOWN",
      direction_verified: effectiveArrowDir !== "UNKNOWN",
    };

    if (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2) {
      const reverseProps = JSON.parse(JSON.stringify(geojson.features[editingGeometry.featureIdx].properties || {}));
      const baseSection = String(currentProps.section_name || currentProps.route_name || "")
        .replace(/\s*\(ขาไป.*\)|\s*\(ขากลับ.*\)/g, "")
        .trim();
      geojson.features[editingGeometry.featureIdx].properties.section_name = baseSection
        ? `${baseSection} (ขาไป A→B)`
        : "ขาไป A→B";
      reverseProps.section_name = baseSection ? `${baseSection} (ขากลับ B→A)` : "ขากลับ B→A";
      reverseProps.arrow_direction = "FORWARD"; // vertices of dualReverseCoords are already ordered B -> A
      reverseProps.carriageway_type = "DUAL_CARRIAGEWAY";
      reverseProps.show_arrows = showFeatureArrows;
      reverseProps.direction_verified = true;
      geojson.features.push({
        type: "Feature",
        properties: reverseProps,
        geometry: { type: "LineString", coordinates: dualReverseCoords },
      });
    }

    if (splitRemainder && splitRemainder.length >= 2) {
      const sourceProps = JSON.parse(JSON.stringify(geojson.features[editingGeometry.featureIdx].properties || {}));
      const newProps = { ...sourceProps, km_start: "", km_end: "", length_km: "" };
      if (sourceProps.section_name) newProps.section_name = `${sourceProps.section_name} (ส่วนที่ 2)`;
      geojson.features.push({
        type: "Feature",
        properties: newProps,
        geometry: { type: "LineString", coordinates: splitRemainder },
      });
    }
    if (absorbedFeatureIdxs.length > 0) {
      geojson.features = geojson.features.filter((_: unknown, index: number) => !absorbedFeatureIdxs.includes(index));
    }
    try {
      const result = await updateHighwayLayerAction({ layerId: layer.layer_id, geojsonData: geojson });
      if (!result.success) throw new Error("ฐานข้อมูลไม่ยืนยันการบันทึกแนวถนน");
      onDataRefresh(result.systemData);
      closeGeometryEditor();
      showSuccessModal(
        "บันทึกแนวถนนสำเร็จ",
        splitRemainder ||
          absorbedFeatureIdxs.length > 0 ||
          (carriagewayStructure === "DUAL_CARRIAGEWAY" && dualReverseCoords.length >= 2)
          ? "อัปเดตเส้นทางและทิศทางลูกศรในฐานข้อมูลและบนแผนที่แล้ว"
          : "อัปเดตเส้นทางในฐานข้อมูลและบนแผนที่แล้ว"
      );
    } catch (error: any) {
      onToast(`บันทึกแนวถนนไม่สำเร็จ: ${error.message}`);
    }
  };

  const exportEditedGeometry = (format: "geojson" | "kml") => {
    if (!editingGeometry || draftCoordinates.length < 2) return;
    const feature = (systemData.highwayLayers || []).find((layer) => layer.layer_id === editingGeometry.layerId)
      ?.geojson_data?.features?.[editingGeometry.featureIdx];
    const props = feature?.properties || {};
    const data =
      format === "geojson"
        ? JSON.stringify(
            {
              type: "FeatureCollection",
              features: [{ ...feature, geometry: { type: "LineString", coordinates: draftCoordinates } }],
            },
            null,
            2
          )
        : `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${String(props.section_name || props.route_no || "ทางหลวง").replace(/[&<>]/g, "")}</name><LineString><coordinates>${draftCoordinates.map(([lon, lat]) => `${lon},${lat},0`).join(" ")}</coordinates></LineString></Placemark></Document></kml>`;
    const blob = new Blob([data], {
      type: format === "geojson" ? "application/geo+json" : "application/vnd.google-earth.kml+xml",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `highway-route.${format}`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return {
    editingGeometry,
    setEditingGeometry: setEditingGeometry as React.Dispatch<React.SetStateAction<EditingGeometryState | null>>,
    editorMode,
    carriagewayStructure,
    setCarriagewayStructure,
    arrowDirectionSetting,
    setArrowDirectionSetting,
    showFeatureArrows,
    setShowFeatureArrows,
    dualReverseCoords,
    setDualReverseCoords,
    vertexTool,
    setVertexTool,
    historySize,
    undoEdit,
    redoEdit,
    splitRemainder,
    absorbedFeatureIdxs,
    joinTargetIdx,
    setJoinTargetIdx,
    joinCandidates,
    handleJoinSelected,
    isSnappingGeometry,
    openGeometryEditor,
    closeGeometryEditor,
    switchEditorMode,
    snapEditedGeometry,
    removeGeometryWaypoint,
    exportEditedGeometry,
    restoreOriginalGeometry,
    saveEditedGeometry,
  };
}
