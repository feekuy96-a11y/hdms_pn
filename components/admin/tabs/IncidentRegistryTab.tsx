"use client";

import React, { useState } from "react";
import { FloodRoute, SystemDataPayload } from "@/db/default-data";
import { ClipboardList, Plus, FileText, Search, Trash2, Edit, CheckCircle2 } from "lucide-react";
import { deleteRouteAction, setIncidentStatusAction, saveTimelineUpdateAction, getDeletedRoutesAction, restoreRouteAction } from "@/app/actions/doh-actions";
import { exportLineFeatures, GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";

interface IncidentRegistryTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  onEditFlood: (floodId: string) => void;
  onAddFlood: () => void;
}

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
  const [updateNote, setUpdateNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmitQuickUpdate = async () => {
    if (!updateModalIncident) return;
    setIsSubmitting(true);
    try {
      const flood = updateModalIncident;
      const trafficStatus = newWaterLevel >= 40 ? "CLOSED" : newWaterLevel > 0 ? "WARNING" : "PASSABLE";

      const res = await saveTimelineUpdateAction({
        floodId: flood.id,
        waterLevelCm: newWaterLevel,
        trafficStatus,
        latitude: flood.lat_start,
        longitude: flood.lon_start,
        photoUrl: flood.latest_photo_url || "",
        reporterName: "เจ้าหน้าที่ศูนย์ฯ 24 ชม.",
        remark: updateNote || `อัปเดตระดับน้ำเป็น ${newWaterLevel} ซม.`,
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

  const handleExportCsv = (records = filteredIncidents) => {
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
    if (!filteredIncidents.length) return onToast("ไม่มีเหตุการณ์ตามตัวกรองสำหรับส่งออก");
    if (format === "csv") return handleExportCsv();
    const features = filteredIncidents.map((route) => ({
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
        <div className="flex gap-2">
          <button type="button" className="text-sky-300 text-xs" onClick={async () => { try { setDeleted(await getDeletedRoutesAction()); } catch { onToast("โหลดรายการที่ลบไม่สำเร็จ"); } }}>รายการที่ลบ / กู้คืน</button>
          <button
            type="button"
            onClick={onAddFlood}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" /> เพิ่มเหตุการณ์
          </button>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2 text-xs text-amber-300">
            <FileText className="w-4 h-4" />
            <select aria-label="ส่งออกเหตุการณ์ตามตัวกรอง" defaultValue="" onChange={(e) => { if (e.target.value) void handleExport(e.target.value as GisExportFormat); e.target.value = ""; }} className="min-h-10 bg-transparent font-heading font-semibold outline-none">
              <option value="" disabled>ส่งออกตามตัวกรอง…</option>
              <option value="csv">CSV</option><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="kmz">KMZ</option><option value="shapefile">Shapefile ZIP</option>
            </select>
          </label>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setIncidentFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
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
            className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
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
            className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition ${
              incidentFilter === "ALL"
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            ทั้งหมด ({totalCount})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={incidentSearch}
            onChange={(e) => setIncidentSearch(e.target.value)}
            placeholder="ค้นหาสายทาง 42, 43, หนองจิก..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
          />
        </div>
      </div>

      {/* Incident Table List */}
      <div className="space-y-2.5">
        {filteredIncidents.length === 0 ? (
          <div className="text-center py-12 bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
            ไม่พบรายการเหตุการณ์ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          filteredIncidents.map((r) => {
            const isClosed = r.traffic_status === "CLOSED";
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewingIncident(r)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setViewingIncident(r); } }}
                className={`cursor-pointer p-4 rounded-2xl border transition shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  r.is_active
                    ? "bg-slate-950 border-slate-800 hover:border-slate-700"
                    : "bg-slate-950/60 border-slate-900 opacity-70"
                }`}
                style={
                  r.is_active
                    ? { borderLeftWidth: "4px", borderLeftColor: floodColor }
                    : undefined
                }
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-heading font-black text-xs px-2 py-0.5 rounded shadow-sm"
                        style={
                          r.is_active
                            ? isClosed
                              ? { backgroundColor: floodColor, color: "#ffffff" }
                              : { backgroundColor: detourColor, color: "#0f172a" }
                            : { backgroundColor: "#334155", color: "#cbd5e1" }
                        }
                      >
                        {r.is_active ? (isClosed ? "ปิดการจราจร" : "เฝ้าระวัง") : "คืนสภาพปกติแล้ว"}
                      </span>
                      <span className="font-heading font-bold text-amber-300 text-xs sm:text-sm">
                        ทล.{r.route_no}
                      </span>
                      <span className="text-xs text-white font-medium">{r.section_name}</span>
                    </div>
                    <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                      <span>ช่วง กม. {r.km_start} - {r.km_end}</span>
                      <span>
                        ระดับน้ำ:{" "}
                        <strong className="text-white font-mono">{r.water_level_cm} ซม.</strong>
                        {r.diff_cm !== undefined && (
                          <span
                            className={`ml-1 text-[11px] font-bold ${
                              r.diff_cm > 0
                                ? "text-red-400"
                                : r.diff_cm < 0
                                ? "text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            ({r.diff_cm > 0 ? `+${r.diff_cm}` : r.diff_cm} ซม.)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setUpdateModalIncident(r);
                        setNewWaterLevel(r.water_level_cm);
                      }}
                      className="bg-sky-950 hover:bg-sky-800 text-sky-300 border border-sky-700 px-3 py-1 rounded-xl text-xs font-heading font-medium transition"
                    >
                      อัปเดตน้ำ
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); handleToggleIncidentStatus(r.id, r.is_active); }}
                      className={`px-3 py-1 rounded-xl text-xs font-heading font-medium transition border ${
                        r.is_active
                          ? "bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border-emerald-700"
                          : "bg-amber-950 hover:bg-amber-800 text-amber-300 border-amber-700"
                      }`}
                    >
                      {r.is_active ? "คืนปกติ" : "เปิดใหม่"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onEditFlood(r.id); }}
                      className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 px-2.5 py-1 rounded-xl text-xs font-heading transition"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); handleDeleteRoute(r.id); }}
                      className="bg-red-950 hover:bg-red-800 text-red-300 px-2 py-1 rounded-xl text-xs transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
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
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-400">ก.ม.</dt><dd className="text-white">{viewingIncident.km_start} ถึง {viewingIncident.km_end}</dd></div><div><dt className="text-slate-400">สถานะการจราจร</dt><dd className="text-white">{viewingIncident.traffic_status}</dd></div><div><dt className="text-slate-400">ระดับน้ำล่าสุด</dt><dd className="text-white">{viewingIncident.water_level_cm} ซม.</dd></div><div><dt className="text-slate-400">สถานะรายการ</dt><dd className="text-white">{viewingIncident.is_active ? "กำลังใช้งาน" : "คืนสภาพปกติ"}</dd></div></dl>
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
                  value={newWaterLevel}
                  onChange={(e) => setNewWaterLevel(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold"
                />
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
    </div>
  );
}

