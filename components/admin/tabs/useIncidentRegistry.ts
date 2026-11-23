"use client";

import React, { useState } from "react";
import { FloodRoute, SystemDataPayload } from "@/db/default-data";
import {
  deleteRouteAction,
  setIncidentStatusAction,
  saveTimelineUpdateAction,
  upsertRouteAction,
} from "@/app/actions/doh-actions";
import { LAYER_CONFIG } from "@/lib/constants";
import { exportLineFeatures, GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";
import { slicePolylineByKmRange } from "@/lib/gis-utils";
import {
  groupFloodRoutesIntoEvents,
  parseFloodDirectionMeta,
  resolveEffectiveRoadSide,
  mapTrafficStatusToDetail,
  FloodSegmentDirectionMeta,
  parseKmPostMeters,
  formatKmPostString,
} from "@/lib/flood-event-schema";
import {
  getTrafficPresentation,
  deriveTrafficStatusFromWaterLevel,
} from "@/lib/traffic-presentation";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

export interface UseIncidentRegistryParams {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
}

export function useIncidentRegistry({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
}: UseIncidentRegistryParams) {
  const [incidentFilter, setIncidentFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ACTIVE");
  const [routeNoFilter, setRouteNoFilter] = useState<string>("ALL");
  const [trafficStatusFilter, setTrafficStatusFilter] = useState<string>("ALL");
  const [incidentSearch, setIncidentSearch] = useState("");
  const [deleted, setDeleted] = useState<{ id: string; route_no: string; section_name: string }[] | null>(null);
  const [updateModalIncident, setUpdateModalIncident] = useState<FloodRoute | null>(null);
  const [viewingIncident, setViewingIncident] = useState<FloodRoute | null>(null);
  const [newWaterLevel, setNewWaterLevel] = useState<number>(0);
  const [newTrafficStatus, setNewTrafficStatus] = useState<FloodRoute["traffic_status"]>("WARNING");
  const [updateNote, setUpdateNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineWaterLevel, setInlineWaterLevel] = useState<string>("");
  const [inlineTrafficStatus, setInlineTrafficStatus] = useState<FloodRoute["traffic_status"]>("WARNING");
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<Set<string>>(() => new Set());
  const [exportScope, setExportScope] = useState<"FILTERED" | "ALL" | "SELECTED">("FILTERED");

  // Phase 2 & Phase 4: Hierarchy, Split & Merge states (default collapsed to keep parent list clean)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(() => new Set());
  const [splitModalIncident, setSplitModalIncident] = useState<FloodRoute | null>(null);
  const [splitKm, setSplitKm] = useState<string>("");
  const [splitNewWaterLevel, setSplitNewWaterLevel] = useState<number>(0);
  const [splitNewTrafficStatus, setSplitNewTrafficStatus] = useState<FloodRoute["traffic_status"]>("WARNING");

  // Phase 4: Merge Segments states
  const [mergeModalIncident, setMergeModalIncident] = useState<FloodRoute | null>(null);
  const [targetMergeIncidentId, setTargetMergeIncidentId] = useState<string>("");
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);
  const viewingDialog = useModalAccessibility(Boolean(viewingIncident), () => setViewingIncident(null));
  const updateDialog = useModalAccessibility(Boolean(updateModalIncident), () => setUpdateModalIncident(null));
  const splitDialog = useModalAccessibility(Boolean(splitModalIncident), () => setSplitModalIncident(null));
  const mergeDialog = useModalAccessibility(Boolean(mergeModalIncident), () => {
    setMergeModalIncident(null);
    setTargetMergeIncidentId("");
  });

  const activeCount = (systemData.floodRoutes || []).filter((r) => r.is_active).length;
  const resolvedCount = (systemData.floodRoutes || []).filter((r) => !r.is_active).length;
  const totalCount = (systemData.floodRoutes || []).length;

  const availableRouteNumbers = React.useMemo(() => {
    const routes = new Set<string>();
    for (const r of systemData.floodRoutes || []) {
      if (r.route_no) routes.add(r.route_no);
    }
    return Array.from(routes).sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  }, [systemData.floodRoutes]);

  const filteredIncidents = (systemData.floodRoutes || []).filter((r) => {
    if (incidentFilter === "ACTIVE" && !r.is_active) return false;
    if (incidentFilter === "RESOLVED" && r.is_active) return false;
    if (routeNoFilter !== "ALL" && r.route_no !== routeNoFilter) return false;
    if (trafficStatusFilter !== "ALL" && r.traffic_status !== trafficStatusFilter) return false;
    if (incidentSearch.trim()) {
      const q = incidentSearch.toLowerCase().trim();
      return (
        r.route_no.toLowerCase().includes(q) ||
        r.section_name.toLowerCase().includes(q) ||
        (r.district || "").toLowerCase().includes(q) ||
        (r.subdistrict || "").toLowerCase().includes(q) ||
        r.km_start.includes(q)
      );
    }
    return true;
  });

  // Group filtered incidents by Parent Flood Event
  const parentEvents = React.useMemo(() => {
    return groupFloodRoutesIntoEvents(filteredIncidents);
  }, [filteredIncidents]);

  const handleToggleIncidentStatus = async (floodId: string, currentActive: boolean) => {
    try {
      const flood = systemData.floodRoutes.find((r) => r.id === floodId);
      if (!flood) return;

      const nextActive = !currentActive;
      const res = await setIncidentStatusAction(floodId, nextActive);

      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal(
          "อัปเดตสถานะสำเร็จ",
          nextActive ? `เปิดเหตุการณ์ [ทล.${flood.route_no}] อีกครั้ง` : `คืนสภาพปกติ [ทล.${flood.route_no}] เรียบร้อย`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  const handleSplitSegment = async () => {
    if (!splitModalIncident || !splitKm.trim()) {
      onToast("กรุณาระบุหลักกิโลเมตรที่ต้องการตัดแบ่งช่วง");
      return;
    }
    setIsSubmitting(true);
    try {
      const orig = splitModalIncident;
      const meta = parseFloodDirectionMeta(orig.direction_meta, orig);
      const origKmStart = orig.km_start;
      const origKmEnd = orig.km_end;

      const rawCoords = orig.coordinates_json;
      let origCoords: [number, number][] = [];
      if (Array.isArray(rawCoords)) {
        origCoords = rawCoords as [number, number][];
      } else if (typeof rawCoords === "string") {
        try {
          origCoords = JSON.parse(rawCoords);
        } catch {
          origCoords = [];
        }
      }

      const isReverse = meta.directionCode === "B_TO_A";
      let part1Coords = origCoords;
      let part2Coords = origCoords;

      if (origCoords.length >= 2) {
        part1Coords = slicePolylineByKmRange(origCoords, origKmStart, origKmEnd, origKmStart, splitKm.trim(), isReverse);
        part2Coords = slicePolylineByKmRange(origCoords, origKmStart, origKmEnd, splitKm.trim(), origKmEnd, isReverse);
      }

      const p1Start = part1Coords[0] || [orig.lon_start, orig.lat_start];
      const p1End = part1Coords[part1Coords.length - 1] || [orig.lon_end, orig.lat_end];

      const p2Start = part2Coords[0] || [p1End[0], p1End[1]];
      const p2End = part2Coords[part2Coords.length - 1] || [orig.lon_end, orig.lat_end];

      const origSide = resolveEffectiveRoadSide(orig);

      // 1. Update original segment to end at splitKm with sliced geometry
      await upsertRouteAction({
        id: orig.id,
        recordType: "FLOOD",
        routeNo: orig.route_no,
        kmStart: origKmStart,
        kmEnd: splitKm.trim(),
        sectionName: orig.section_name,
        waterLevelCm: orig.water_level_cm,
        trafficStatus: orig.traffic_status,
        isActive: orig.is_active,
        latStart: p1Start[1],
        lonStart: p1Start[0],
        latEnd: p1End[1],
        lonEnd: p1End[0],
        coordinates: part1Coords,
        latestPhotoUrl: orig.latest_photo_url || undefined,
        roadSide: origSide,
        affectedLanes: orig.affected_lanes,
        affectedShoulder: orig.affected_shoulder,
        reporterName: orig.reporter_name,
        directionMeta: {
          ...meta,
          roadSide: origSide,
          updatedAt: new Date().toISOString(),
          causeAndNote: `${meta.causeAndNote || ""} (แบ่งช่วงที่ กม.${splitKm.trim()})`.trim(),
        },
      });

      // 2. Insert new segment from splitKm to origKmEnd with sliced geometry
      const newMeta: FloodSegmentDirectionMeta = {
        ...meta,
        roadSide: origSide,
        trafficStatusDetail: mapTrafficStatusToDetail(splitNewTrafficStatus),
        status_verified: true,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        splitFromSegmentId: orig.id,
        causeAndNote: `แบ่งช่วงออกจากช่วง กม.${origKmStart} - ${origKmEnd}`,
      };

      const res2 = await upsertRouteAction({
        recordType: "FLOOD",
        routeNo: orig.route_no,
        kmStart: splitKm.trim(),
        kmEnd: origKmEnd,
        sectionName: orig.section_name,
        waterLevelCm: splitNewWaterLevel,
        trafficStatus: splitNewTrafficStatus,
        isActive: orig.is_active,
        latStart: p2Start[1],
        lonStart: p2Start[0],
        latEnd: p2End[1],
        lonEnd: p2End[0],
        coordinates: part2Coords,
        latestPhotoUrl: orig.latest_photo_url || undefined,
        roadSide: origSide,
        affectedLanes: orig.affected_lanes,
        affectedShoulder: orig.affected_shoulder,
        reporterName: orig.reporter_name,
        directionMeta: newMeta,
      });

      if (res2.success) {
        onDataRefresh(res2.systemData);
        showSuccessModal(
          "แบ่งช่วงสำเร็จ",
          `แบ่ง ทล.${orig.route_no} เป็น ๒ ช่วง: [กม.${origKmStart} - ${splitKm.trim()}] และ [กม.${splitKm.trim()} - ${origKmEnd}] เรียบร้อยแล้ว`
        );
        setSplitModalIncident(null);
        setSplitKm("");
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาดในการแบ่งช่วง: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const mergeCandidates = React.useMemo(() => {
    if (!mergeModalIncident) return [];
    const origMeta = parseFloodDirectionMeta(mergeModalIncident.direction_meta, mergeModalIncident);
    return (systemData.floodRoutes || []).filter((r) => {
      if (r.id === mergeModalIncident.id || !r.is_active) return false;
      if (r.route_no !== mergeModalIncident.route_no) return false;
      const rMeta = parseFloodDirectionMeta(r.direction_meta, r);
      return rMeta.directionCode === origMeta.directionCode || rMeta.eventId === origMeta.eventId;
    });
  }, [mergeModalIncident, systemData.floodRoutes]);

  const handleMergeSegments = async () => {
    if (!mergeModalIncident || !targetMergeIncidentId) {
      onToast("กรุณาเลือกช่วงน้ำท่วมที่ต้องการรวมเข้าด้วยกัน");
      return;
    }
    const targetIncident = mergeCandidates.find((c) => c.id === targetMergeIncidentId);
    if (!targetIncident) {
      onToast("ไม่พบข้อมูลช่วงน้ำท่วมที่เลือก");
      return;
    }

    setIsSubmitting(true);
    try {
      const segA = mergeModalIncident;
      const segB = targetIncident;
      const metaA = parseFloodDirectionMeta(segA.direction_meta, segA);
      const metaB = parseFloodDirectionMeta(segB.direction_meta, segB);

      // 1. Calculate combined KM start and end
      const kmA1 = parseKmPostMeters(segA.km_start) ?? 0;
      const kmA2 = parseKmPostMeters(segA.km_end) ?? 0;
      const kmB1 = parseKmPostMeters(segB.km_start) ?? 0;
      const kmB2 = parseKmPostMeters(segB.km_end) ?? 0;
      const minMeters = Math.min(kmA1, kmA2, kmB1, kmB2);
      const maxMeters = Math.max(kmA1, kmA2, kmB1, kmB2);
      const combinedKmStart = formatKmPostString(minMeters);
      const combinedKmEnd = formatKmPostString(maxMeters);

      // 2. Derive combined geometry
      let combinedCoords: [number, number][] = [];
      const cleanTargetRoute = segA.route_no?.replace(/^ทล\.?/i, "").trim();
      const layer = (systemData.highwayLayers || []).find((l) => {
        const fc = l.geojson_data;
        if (fc && Array.isArray(fc.features)) {
          return fc.features.some((f: any) => {
            const props = f.properties || {};
            const no = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
            return no && String(no).replace(/^ทล\.?/i, "").trim() === cleanTargetRoute;
          });
        }
        return l.layer_name?.includes(cleanTargetRoute || "");
      });
      const isReverse = metaA.directionCode === "B_TO_A";
      if (layer?.geojson_data?.features?.[0]?.geometry?.coordinates) {
        const hwCoords = layer.geojson_data.features[0].geometry.coordinates as [number, number][];
        const hwProps = layer.geojson_data.features[0].properties || {};
        combinedCoords = slicePolylineByKmRange(
          hwCoords,
          hwProps.km_start || combinedKmStart,
          hwProps.km_end || combinedKmEnd,
          combinedKmStart,
          combinedKmEnd,
          isReverse
        );
      }
      if (combinedCoords.length < 2) {
        const cA = (Array.isArray(segA.coordinates_json) ? segA.coordinates_json : []) as [number, number][];
        const cB = (Array.isArray(segB.coordinates_json) ? segB.coordinates_json : []) as [number, number][];
        combinedCoords = isReverse ? [...cB, ...cA] : [...cA, ...cB];
      }

      const pStart = combinedCoords[0] || [segA.lon_start, segA.lat_start];
      const pEnd = combinedCoords[combinedCoords.length - 1] || [segA.lon_end, segA.lat_end];

      const combinedWaterLevel = Math.max(segA.water_level_cm, segB.water_level_cm);
      const severityOrder: Record<string, number> = { CLOSED: 5, LIGHT_VEHICLES_ONLY: 4, ONE_LANE: 3, WARNING: 2, PASSABLE: 1 };
      const combinedStatus =
        (severityOrder[segA.traffic_status] || 0) >= (severityOrder[segB.traffic_status] || 0)
          ? segA.traffic_status
          : segB.traffic_status;

      // 3. Update segA to be the merged span
      const mergedSide = resolveEffectiveRoadSide(segA);
      await upsertRouteAction({
        id: segA.id,
        recordType: "FLOOD",
        routeNo: segA.route_no,
        kmStart: combinedKmStart,
        kmEnd: combinedKmEnd,
        sectionName: segA.section_name,
        waterLevelCm: combinedWaterLevel,
        trafficStatus: combinedStatus,
        isActive: true,
        latStart: pStart[1],
        lonStart: pStart[0],
        latEnd: pEnd[1],
        lonEnd: pEnd[0],
        coordinates: combinedCoords,
        latestPhotoUrl: segA.latest_photo_url || segB.latest_photo_url || undefined,
        roadSide: mergedSide,
        affectedLanes: segA.affected_lanes || segB.affected_lanes,
        affectedShoulder: segA.affected_shoulder || segB.affected_shoulder,
        reporterName: segA.reporter_name || segB.reporter_name,
        directionMeta: {
          ...metaA,
          roadSide: mergedSide,
          updatedAt: new Date().toISOString(),
          causeAndNote: `${metaA.causeAndNote || ""} (รวมช่วงกับ กม.${segB.km_start}–${segB.km_end})`.trim(),
        },
      });

      // 4. Deactivate segB
      await setIncidentStatusAction(segB.id, false);

      // 5. Timeline update
      await saveTimelineUpdateAction({
        floodId: segA.id,
        waterLevelCm: combinedWaterLevel,
        trafficStatus: combinedStatus,
        latitude: pStart[1],
        longitude: pStart[0],
        reporterName: "เจ้าหน้าที่",
        remark: `รวมช่วงน้ำท่วม กม.${segA.km_start}-${segA.km_end} เข้ากับ กม.${segB.km_start}-${segB.km_end} เป็นช่วง กม.${combinedKmStart}-${combinedKmEnd}`,
      });

      await onDataRefresh();
      showSuccessModal(
        "รวมช่วงสำเร็จ",
        `รวมช่วงน้ำท่วม ทล.${segA.route_no} เป็นช่วง กม.${combinedKmStart} ถึง ${combinedKmEnd} สำเร็จเรียบร้อยแล้ว`
      );
      setMergeModalIncident(null);
      setTargetMergeIncidentId("");
    } catch (err: any) {
      onToast("เกิดข้อผิดพลาดในการรวมช่วง: " + (err?.message || "ไม่สามารถรวมช่วงได้"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitWaterLevelUpdate = async (
    flood: FloodRoute,
    waterLevelCm: number,
    trafficStatus: FloodRoute["traffic_status"],
    remark?: string
  ) => {
    const effectiveSide = resolveEffectiveRoadSide(flood);
    const updatedMeta = {
      ...(flood.direction_meta && typeof flood.direction_meta === "object" ? flood.direction_meta : {}),
      trafficStatusDetail: mapTrafficStatusToDetail(trafficStatus),
      status_verified: true,
      waterLevelKnown: true,
      water_level_known: true,
      zeroConfirmedAt: waterLevelCm === 0 ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    return saveTimelineUpdateAction({
      floodId: flood.id,
      waterLevelCm,
      trafficStatus,
      latitude: flood.lat_start,
      longitude: flood.lon_start,
      photoUrl: flood.latest_photo_url || "",
      reporterName: flood.reporter_name || "เจ้าหน้าที่ศูนย์ฯ 24 ชม.",
      remark: remark || `อัปเดตระดับน้ำเป็น ${waterLevelCm} ซม. (${getTrafficPresentation(trafficStatus, waterLevelCm).label})`,
      roadSide: effectiveSide,
      affectedLanes: flood.affected_lanes,
      affectedShoulder: flood.affected_shoulder,
      directionMeta: updatedMeta,
    });
  };

  const handleSubmitQuickUpdate = async () => {
    if (!updateModalIncident) return;
    setIsSubmitting(true);
    try {
      const flood = updateModalIncident;
      const trafficStatus = newTrafficStatus || flood.traffic_status;
      const res = await submitWaterLevelUpdate(flood, newWaterLevel, trafficStatus, updateNote || undefined);
      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("อัปเดตระดับน้ำสำเร็จ", `ระดับน้ำ ทล.${flood.route_no} เป็น ${newWaterLevel} ซม.`);
        setUpdateModalIncident(null);
        setUpdateNote("");
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveInlineWaterLevel = async (flood: FloodRoute) => {
    const parsed = Number(inlineWaterLevel);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
      onToast("กรุณาระบุระดับน้ำเป็นตัวเลข 0–500 ซม.");
      return;
    }
    const nextLevel = Math.round(parsed);
    const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
    const nextStatus =
      inlineTrafficStatus ||
      deriveTrafficStatusFromWaterLevel(nextLevel, meta.affectedParts) ||
      flood.traffic_status;

    setInlineSavingId(flood.id);
    try {
      const res = await submitWaterLevelUpdate(flood, nextLevel, nextStatus);
      if (res.success) {
        onDataRefresh(res.systemData);
        setInlineEditId(null);
        const pres = getTrafficPresentation(nextStatus, nextLevel);
        onToast(`บันทึก ทล.${flood.route_no} (${nextLevel} ซม. · ${pres.label}) สำเร็จ`);
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + (e?.message || "ไม่สามารถบันทึกได้"));
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleDeleteRoute = (id: string) => {
    showConfirmModal("ยืนยันการลบจุดน้ำท่วม?", `ซ่อนจุดน้ำท่วม [${id}] โดยสามารถกู้คืนภายหลังได้`, async () => {
      try {
        const res = await deleteRouteAction("FLOOD", id);
        if (res.success) {
          onDataRefresh(res.systemData);
          showSuccessModal("ลบข้อมูลสำเร็จ", `ลบข้อมูลจุดน้ำท่วม [${id}] เรียบร้อยแล้ว`);
        }
      } catch (e: any) {
        onToast("เกิดข้อผิดพลาด: " + e.message);
      }
    });
  };

  const exportRecords = () => exportScope === "ALL"
    ? (systemData.floodRoutes || [])
    : exportScope === "SELECTED"
      ? (systemData.floodRoutes || []).filter((route) => selectedIncidentIds.has(route.id))
      : filteredIncidents;

  const handleExportCsv = (records = exportRecords()) => {
    const headers = ["ID", "RouteNo", "Section", "KmStart", "KmEnd", "Lat", "Lon", "WaterCm", "Status", "IsActive", "UpdatedAt"];
    const rows = records.map((r) => [
      r.id,
      r.route_no,
      `"${r.section_name.replace(/"/g, '""')}"`,
      r.km_start,
      r.km_end,
      r.lat_start,
      r.lon_start,
      r.water_level_cm,
      r.traffic_status,
      r.is_active ? "TRUE" : "FALSE",
      r.updated_at,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `doh_pattani_incidents_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast("ส่งออกข้อมูล CSV สำเร็จ");
  };

  const handleExport = async (format: GisExportFormat) => {
    const records = exportRecords();
    if (!records.length) return onToast(exportScope === "SELECTED" ? "กรุณาเลือกรายการก่อนส่งออก" : "ไม่มีเหตุการณ์สำหรับส่งออก");
    if (format === "csv") return handleExportCsv();
    const features = records.map((route) => ({
      type: "Feature" as const,
      properties: {
        id: route.id, name: `ทล.${route.route_no} ${route.section_name}`, route_no: route.route_no,
        section_name: route.section_name, km_start: route.km_start, km_end: route.km_end,
        water_cm: route.water_level_cm, status: route.traffic_status, active: route.is_active,
        updated_at: route.updated_at,
      },
      geometry: { type: "LineString" as const, coordinates: parseLineCoordinates(route.coordinates_json) },
    })).filter((feature) => feature.geometry.coordinates.length >= 2);
    if (!features.length) return onToast("รายการตามตัวกรองไม่มีแนวเส้นสำหรับส่งออก GIS");
    await exportLineFeatures(features, format, `flood-incidents-${new Date().toISOString().slice(0, 10)}`);
    onToast(`ส่งออก ${format.toUpperCase()} สำเร็จ`);
  };

  const floodColor = systemData.mapStyles?.flood?.color || "#D32F2F";
  const detourColor = systemData.mapStyles?.detour?.color || "#FBC02D";

  return {
    incidentFilter,
    setIncidentFilter,
    routeNoFilter,
    setRouteNoFilter,
    trafficStatusFilter,
    setTrafficStatusFilter,
    incidentSearch,
    setIncidentSearch,
    deleted,
    setDeleted,
    updateModalIncident,
    setUpdateModalIncident,
    viewingIncident,
    setViewingIncident,
    newWaterLevel,
    setNewWaterLevel,
    newTrafficStatus,
    setNewTrafficStatus,
    updateNote,
    setUpdateNote,
    isSubmitting,
    inlineEditId,
    setInlineEditId,
    inlineWaterLevel,
    setInlineWaterLevel,
    inlineTrafficStatus,
    setInlineTrafficStatus,
    inlineSavingId,
    selectedIncidentIds,
    setSelectedIncidentIds,
    exportScope,
    setExportScope,
    expandedEvents,
    setExpandedEvents,
    splitModalIncident,
    setSplitModalIncident,
    splitKm,
    setSplitKm,
    splitNewWaterLevel,
    setSplitNewWaterLevel,
    splitNewTrafficStatus,
    setSplitNewTrafficStatus,
    mergeModalIncident,
    setMergeModalIncident,
    targetMergeIncidentId,
    setTargetMergeIncidentId,
    linkingEventId,
    setLinkingEventId,
    viewingDialog,
    updateDialog,
    splitDialog,
    mergeDialog,
    activeCount,
    resolvedCount,
    totalCount,
    availableRouteNumbers,
    filteredIncidents,
    parentEvents,
    mergeCandidates,
    handleToggleIncidentStatus,
    handleSplitSegment,
    handleMergeSegments,
    handleSubmitQuickUpdate,
    handleSaveInlineWaterLevel,
    handleDeleteRoute,
    handleExportCsv,
    handleExport,
  };
}
