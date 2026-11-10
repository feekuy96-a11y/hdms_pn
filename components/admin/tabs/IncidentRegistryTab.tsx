"use client";

import React, { useState } from "react";
import { FloodRoute, SystemDataPayload } from "@/db/default-data";
import {
  ClipboardList,
  Plus,
  FileText,
  Search,
  Trash2,
  Edit,
  CheckCircle2,
  Waves,
  Layers,
  Split,
  ChevronDown,
  ChevronUp,
  Camera,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  deleteRouteAction,
  setIncidentStatusAction,
  saveTimelineUpdateAction,
  getDeletedRoutesAction,
  restoreRouteAction,
  upsertRouteAction,
} from "@/app/actions/doh-actions";
import { exportLineFeatures, GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";
import {
  groupFloodRoutesIntoEvents,
  parseFloodDirectionMeta,
  getDetailedTrafficPresentation,
  AFFECTED_ROAD_PART_LABELS,
  FloodSegmentDirectionMeta,
  DetailedTrafficStatus,
  ParentFloodEventGroup,
} from "@/lib/flood-event-schema";

interface IncidentRegistryTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  onEditFlood: (floodId: string) => void;
  onAddFlood: () => void;
}

const trafficLabel = (status: FloodRoute["traffic_status"]) => ({
  CLOSED: "ผ่านไม่ได้", WARNING: "เฝ้าระวัง", PASSABLE: "ผ่านได้ปกติ",
  LIGHT_VEHICLES_ONLY: "รถเล็กผ่านได้", ONE_LANE: "ผ่านได้ 1 ช่องทาง",
}[status]);

export function IncidentRegistryTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  onEditFlood,
  onAddFlood,
}: IncidentRegistryTabProps) {
  const [incidentFilter, setIncidentFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ACTIVE");
  const [incidentSearch, setIncidentSearch] = useState("");
  const [deleted, setDeleted] = useState<{id: string; route_no: string; section_name: string}[] | null>(null);
  const [updateModalIncident, setUpdateModalIncident] = useState<FloodRoute | null>(null);
  const [viewingIncident, setViewingIncident] = useState<FloodRoute | null>(null);
  const [newWaterLevel, setNewWaterLevel] = useState<number>(0);
  const [newTrafficStatus, setNewTrafficStatus] = useState<FloodRoute["traffic_status"]>("WARNING");
  const [updateNote, setUpdateNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<Set<string>>(() => new Set());
  const [exportScope, setExportScope] = useState<"FILTERED" | "ALL" | "SELECTED">("FILTERED");

  // Phase 2: Hierarchy & Split states
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(() => new Set());
  const [splitModalIncident, setSplitModalIncident] = useState<FloodRoute | null>(null);
  const [splitKm, setSplitKm] = useState<string>("");
  const [splitNewWaterLevel, setSplitNewWaterLevel] = useState<number>(0);
  const [splitNewTrafficStatus, setSplitNewTrafficStatus] = useState<FloodRoute["traffic_status"]>("WARNING");

  const activeCount = (systemData.floodRoutes || []).filter((r) => r.is_active).length;
  const resolvedCount = (systemData.floodRoutes || []).filter((r) => !r.is_active).length;
  const totalCount = (systemData.floodRoutes || []).length;

  const filteredIncidents = (systemData.floodRoutes || []).filter((r) => {
    if (incidentFilter === "ACTIVE" && !r.is_active) return false;
    if (incidentFilter === "RESOLVED" && r.is_active) return false;
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

      // 1. Update original segment to end at splitKm
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
        latStart: orig.lat_start,
        lonStart: orig.lon_start,
        latEnd: orig.lat_end,
        lonEnd: orig.lon_end,
        coordinates: orig.coordinates_json as any,
        latestPhotoUrl: orig.latest_photo_url || undefined,
        roadSide: orig.road_side,
        affectedLanes: orig.affected_lanes,
        affectedShoulder: orig.affected_shoulder,
        reporterName: orig.reporter_name,
        directionMeta: {
          ...meta,
          updatedAt: new Date().toISOString(),
          causeAndNote: `${meta.causeAndNote || ""} (แบ่งช่วงที่ กม.${splitKm.trim()})`.trim(),
        },
      });

      // 2. Insert new segment from splitKm to origKmEnd
      const newMeta: FloodSegmentDirectionMeta = {
        ...meta,
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
        latStart: orig.lat_start,
        lonStart: orig.lon_start,
        latEnd: orig.lat_end,
        lonEnd: orig.lon_end,
        coordinates: orig.coordinates_json as any,
        latestPhotoUrl: orig.latest_photo_url || undefined,
        roadSide: orig.road_side,
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

  const handleSubmitQuickUpdate = async () => {
    if (!updateModalIncident) return;
    setIsSubmitting(true);
    try {
      const flood = updateModalIncident;
      // Strict Rule (Item 3): Never auto-change traffic_status to PASSABLE just because waterLevel === 0 cm.
      // Use the explicit traffic status selected by the officer (initialized to flood.traffic_status).
      const trafficStatus = newTrafficStatus || flood.traffic_status;

      const res = await saveTimelineUpdateAction({
        floodId: flood.id,
        waterLevelCm: newWaterLevel,
        trafficStatus,
        latitude: flood.lat_start,
        longitude: flood.lon_start,
        photoUrl: flood.latest_photo_url || "",
        reporterName: flood.reporter_name || "เจ้าหน้าที่ศูนย์ฯ 24 ชม.",
        remark: updateNote || `อัปเดตระดับน้ำเป็น ${newWaterLevel} ซม. (${trafficLabel(trafficStatus)})`,
        roadSide: flood.road_side,
        affectedLanes: flood.affected_lanes,
        affectedShoulder: flood.affected_shoulder,
      });

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

  return (
    <div className="space-y-5 max-w-4xl">
      {deleted && <div className="border border-slate-700 rounded-xl p-3 text-sm text-slate-300"><button type="button" onClick={() => setDeleted(null)}>ปิดรายการ</button>{deleted.length === 0 && <p>ไม่มีรายการที่ลบ</p>}{deleted.map((r) => <div key={r.id} className="flex justify-between py-2"><span>ทล.{r.route_no} {r.section_name}</span><button type="button" className="text-emerald-300" onClick={async () => { try { const res = await restoreRouteAction("FLOOD", r.id); onDataRefresh(res.systemData); setDeleted(await getDeletedRoutesAction()); } catch { onToast("กู้คืนไม่สำเร็จ"); } }}>กู้คืน</button></div>)}</div>}
      {/* Incident Header Stats */}
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-400" /> ทะเบียนเหตุการณ์น้ำท่วม
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            กำลังเกิดเหตุ <strong className="text-red-400">{activeCount}</strong> จุด · ปกติแล้ว{" "}
            <strong className="text-emerald-400">{resolvedCount}</strong> จุด · ทั้งหมด{" "}
            <strong>{totalCount}</strong> รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-heading font-bold text-sky-300 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400" onClick={async () => { try { setDeleted(await getDeletedRoutesAction()); } catch { onToast("โหลดรายการที่ลบไม่สำเร็จ"); } }}>รายการที่ลบ / กู้คืน</button>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2 text-xs text-amber-300">
            <FileText className="w-4 h-4" />
            <select aria-label="ขอบเขตส่งออกเหตุการณ์" value={exportScope} onChange={(e) => setExportScope(e.target.value as typeof exportScope)} className="min-h-10 max-w-28 bg-transparent font-heading outline-none">
              <option value="FILTERED">ตามตัวกรอง</option><option value="ALL">ทั้งหมด</option><option value="SELECTED">ที่เลือก</option>
            </select>
            <select aria-label="รูปแบบส่งออกเหตุการณ์" defaultValue="" onChange={(e) => { if (e.target.value) void handleExport(e.target.value as GisExportFormat); e.target.value = ""; }} className="min-h-10 bg-transparent font-heading font-semibold outline-none">
              <option value="" disabled>ส่งออก…</option>
              <option value="csv">CSV</option><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="kmz">KMZ</option><option value="shapefile">Shapefile ZIP</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onAddFlood}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs min-h-10 px-4 rounded-xl flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" /> เพิ่มเหตุการณ์
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
        <div role="group" aria-label="กรองสถานะเหตุการณ์" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIncidentFilter("ACTIVE")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${
              incidentFilter === "ACTIVE"
                ? "bg-red-600 text-white"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            กำลังเกิดเหตุ ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("RESOLVED")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${
              incidentFilter === "RESOLVED"
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            ปกติแล้ว ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("ALL")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${
              incidentFilter === "ALL"
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            ทั้งหมด ({totalCount})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={incidentSearch}
            onChange={(e) => setIncidentSearch(e.target.value)}
            placeholder="ค้นหาสายทาง 42, 43, หนองจิก..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white"
          />
        </div>
      </div>

      {/* Incident Table / Grouped Hierarchy List */}
      <div className="space-y-3">
        {parentEvents.length === 0 ? (
          <div className="text-center py-12 bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
            ไม่พบรายการเหตุการณ์ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          parentEvents.map((ev) => {
            const isCollapsed = collapsedEvents.has(ev.eventId);
            const statusConfig = getDetailedTrafficPresentation(ev.mostSevereStatus);

            return (
              <div
                key={ev.eventId}
                className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden"
              >
                {/* Parent Event Header Card */}
                <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black bg-amber-500 text-slate-950 px-2 py-0.5 rounded-lg shadow-sm">
                      {ev.eventCode}
                    </span>
                    <span className="font-heading font-black text-xs text-sky-400 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded-lg">
                      ทล.{ev.routeNo}
                    </span>
                    <h3 className="font-heading font-bold text-sm text-white">
                      {ev.eventTitle || `ตอน${ev.sectionName}`}
                    </h3>
                    <span className={`text-[11px] font-heading font-bold px-2.5 py-0.5 rounded-full ${statusConfig.badgeClass}`}>
                      {statusConfig.icon} {statusConfig.label}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      (น้ำสูงสุด {ev.maxWaterLevelCm} ซม. · {ev.segments.length} ช่วงกิโลเมตร)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAddFlood()}
                      className="bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 px-2.5 py-1 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition"
                      title="เพิ่มช่วง กม. ย่อยในเหตุการณ์หลักนี้"
                    >
                      <Plus className="w-3.5 h-3.5" /> เพิ่มช่วง กม.
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCollapsedEvents((prev) => {
                          const next = new Set(prev);
                          if (isCollapsed) next.delete(ev.eventId);
                          else next.add(ev.eventId);
                          return next;
                        });
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                      title={isCollapsed ? "กางดูช่วงย่อยทั้งหมด" : "ย่อเก็บช่วงย่อย"}
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Child Segments Container */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-850 p-2 sm:p-3 space-y-2">
                    {ev.segments.map((r) => {
                      const meta = r._meta || parseFloodDirectionMeta(r.direction_meta, r);
                      const segStatusConfig = getDetailedTrafficPresentation(meta.trafficStatusDetail || r.traffic_status);

                      return (
                        <div
                          key={r.id}
                          className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="checkbox"
                                aria-label={`เลือกเหตุการณ์ ทล.${r.route_no} ${r.section_name}`}
                                checked={selectedIncidentIds.has(r.id)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setSelectedIncidentIds((previous) => {
                                  const next = new Set(previous);
                                  if (event.target.checked) next.add(r.id); else next.delete(r.id);
                                  return next;
                                })}
                                className="h-4 w-4 accent-amber-500"
                              />
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700" title="จุดน้ำท่วม">
                                <Waves className="h-4 w-4" />
                              </span>
                              <span className={`text-[11px] font-heading font-bold px-2 py-0.5 rounded ${segStatusConfig.badgeClass}`}>
                                {segStatusConfig.icon} {segStatusConfig.label}
                              </span>
                              <span className="text-xs font-mono font-bold text-amber-300">
                                {meta.directionCode === "B_TO_A" ? "🚙 ขากลับ (B → A)" : meta.directionCode === "BOTH" ? "↔️ ไป-กลับ" : "🚗 ขาไป (A → B)"}
                              </span>
                              <span className="text-xs font-bold text-white font-mono">
                                กม.{r.km_start} ถึง กม.{r.km_end}
                              </span>
                              {meta.villageOrLandmark && (
                                <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md">
                                  📍 {meta.villageOrLandmark}
                                </span>
                              )}
                            </div>

                            {/* Details Row: Level, Affected parts, Photos */}
                            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                ระดับน้ำ:{" "}
                                <strong className="text-white font-mono text-sm">
                                  {meta.waterLevelKnown === false ? "ยังไม่ทราบค่า" : `${r.water_level_cm} ซม.`}
                                </strong>
                                {r.water_level_cm === 0 && meta.waterLevelKnown !== false && (
                                  <span className="ml-1 text-[10px] text-emerald-400 font-bold">(ซ่อนเส้นบนแผนที่ปัจจุบัน · เก็บประวัติ)</span>
                                )}
                              </span>

                              {meta.affectedParts && meta.affectedParts.length > 0 && (
                                <span className="text-slate-400">
                                  ส่วนผิวทาง: <strong className="text-sky-300">{meta.affectedParts.map((p: any) => AFFECTED_ROAD_PART_LABELS[p as keyof typeof AFFECTED_ROAD_PART_LABELS] || p).join(", ")}</strong>
                                </span>
                              )}

                              {meta.photos && meta.photos.length > 0 && (
                                <span className="text-amber-300/90 inline-flex items-center gap-1 font-mono text-[11px]">
                                  <Camera className="w-3.5 h-3.5 text-amber-400" /> {meta.photos.length} ภาพ (≤300KB)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons Per Segment */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setUpdateModalIncident(r);
                                setNewWaterLevel(r.water_level_cm);
                                setNewTrafficStatus(r.traffic_status);
                              }}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow transition"
                              title="อัปเดตระดับน้ำและสถานะจราจรด่วน"
                            >
                              ⚡ อัปเดตด่วน
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSplitModalIncident(r);
                                setSplitKm("");
                                setSplitNewWaterLevel(Math.max(0, Math.round(r.water_level_cm / 2)));
                                setSplitNewTrafficStatus(r.traffic_status);
                              }}
                              className="bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 px-2.5 py-1.5 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition"
                              title="แบ่งช่วง กม. นี้ออกเป็น ๒ ช่วงย่อย"
                            >
                              <Split className="w-3.5 h-3.5" /> แบ่งช่วง
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleIncidentStatus(r.id, r.is_active)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-heading font-semibold transition border ${
                                r.is_active
                                  ? "bg-slate-800 text-slate-300 hover:bg-emerald-950 hover:text-emerald-300 border-slate-700"
                                  : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border-emerald-700"
                              }`}
                            >
                              {r.is_active ? "คืนปกติ" : "เปิดใหม่"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditFlood(r.id)}
                              className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-heading transition"
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoute(r.id)}
                              className="bg-red-950 hover:bg-red-800 text-red-300 p-1.5 rounded-xl text-xs transition"
                              title="ลบช่วงนี้ (กู้คืนได้)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {viewingIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" onClick={() => setViewingIncident(null)}>
          <section role="dialog" aria-modal="true" aria-label="รายละเอียดเหตุการณ์" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-3">
              <div><p className="text-xs font-semibold text-amber-300">ทล.{viewingIncident.route_no}</p><h3 className="text-lg font-semibold text-white">{viewingIncident.section_name}</h3></div>
              <button type="button" onClick={() => setViewingIncident(null)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="ปิดรายละเอียด">×</button>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-400">ช่วงสายทาง</dt><dd className="text-white">ระหว่าง กม.{viewingIncident.km_start} ถึง กม.{viewingIncident.km_end}</dd></div><div><dt className="text-slate-400">สถานะการจราจร</dt><dd className="text-white">{trafficLabel(viewingIncident.traffic_status)}</dd></div><div><dt className="text-slate-400">ระดับน้ำล่าสุด</dt><dd className="text-white">{viewingIncident.water_level_cm} ซม.</dd></div><div><dt className="text-slate-400">อัปเดตล่าสุด</dt><dd className="text-white">{new Date(viewingIncident.updated_at).toLocaleString("th-TH")}</dd></div></dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setViewingIncident(null); onEditFlood(viewingIncident.id); }} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">แก้ไข</button><button type="button" onClick={() => { setViewingIncident(null); handleDeleteRoute(viewingIncident.id); }} className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white">ลบ</button></div>
          </section>
        </div>
      )}

      {/* Quick Water Level Update Modal */}
      {updateModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border-2 border-amber-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
            <h3 className="font-heading font-bold text-sm text-white">
              อัปเดตระดับน้ำ: ทล.{updateModalIncident.route_no} {updateModalIncident.section_name}
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300">ระดับน้ำใหม่ (ซม.) *</label>
                  <span className="text-xs text-slate-400">
                    เดิม: <strong className="text-amber-300">{updateModalIncident.water_level_cm} ซม.</strong>
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  value={newWaterLevel}
                  onChange={(e) => setNewWaterLevel(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold"
                />
                {newWaterLevel === 0 && (
                  <p className="mt-1 text-[11px] text-emerald-300">
                    💡 เมื่อระดับน้ำเป็น 0 ซม. ระบบจะซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน แต่<strong>ไม่เปลี่ยนสถานะการจราจรเป็นเปิดอัตโนมัติ</strong> กรุณาเลือกสถานะการจราจรด้านล่างตามความจริง
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">สถานะการจราจร (เจ้าหน้าที่ยืนยัน) *</label>
                <select
                  value={newTrafficStatus}
                  onChange={(e) => setNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="PASSABLE">ผ่านได้ปกติ</option>
                  <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                  <option value="ONE_LANE">ผ่านได้ 1 ช่องทาง</option>
                  <option value="WARNING">เฝ้าระวัง</option>
                  <option value="CLOSED">ผ่านไม่ได้ (ปิดการจราจร)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-300">หมายเหตุ / มาตรการความปลอดภัย</label>
                <input
                  type="text"
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="เช่น ติดตั้งเสาวัดระดับน้ำเพิ่ม..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpdateModalIncident(null)}
                className="bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitQuickUpdate}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow"
              >
                บันทึกการอัปเดต
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Segment Modal (Phase 2) */}
      {splitModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border-2 border-sky-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                <Split className="w-4 h-4 text-sky-400" /> แบ่งช่วงกิโลเมตรน้ำท่วม (Split Segment)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ทล.{splitModalIncident.route_no} {splitModalIncident.section_name} (เดิม: กม.{splitModalIncident.km_start} - {splitModalIncident.km_end})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">หลักกิโลเมตรจุดตัดแบ่งช่วง (Split KM) *</label>
                <input
                  type="text"
                  value={splitKm}
                  onChange={(e) => setSplitKm(e.target.value)}
                  placeholder="เช่น 95+250"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 font-mono text-sm font-bold"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  ช่วงที่ ๑: กม.{splitModalIncident.km_start} ถึง กม.{splitKm || "..."} | ช่วงที่ ๒: กม.{splitKm || "..."} ถึง กม.{splitModalIncident.km_end}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">ระดับน้ำช่วงที่ ๒ (ซม.)</label>
                  <input
                    type="number"
                    min={0}
                    value={splitNewWaterLevel}
                    onChange={(e) => setSplitNewWaterLevel(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">สถานะจราจรช่วงที่ ๒</label>
                  <select
                    value={splitNewTrafficStatus}
                    onChange={(e) => setSplitNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-white text-xs"
                  >
                    <option value="PASSABLE">ผ่านได้ปกติ</option>
                    <option value="LIGHT_VEHICLES_ONLY">รถเล็กผ่านได้</option>
                    <option value="ONE_LANE">ผ่านได้ 1 ช่องทาง</option>
                    <option value="WARNING">เฝ้าระวัง</option>
                    <option value="CLOSED">ผ่านไม่ได้</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSplitModalIncident(null)}
                className="bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || !splitKm.trim()}
                onClick={handleSplitSegment}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow disabled:opacity-50"
              >
                ยืนยันการแบ่งช่วง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

