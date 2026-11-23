"use client";

import React from "react";
import { FloodRoute, SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { GisExportFormat } from "@/lib/gis-export";
import {
  ClipboardList, Plus, FileText, Search, Trash2, Edit, CheckCircle2, Layers,
  Split, Merge, ChevronDown, ChevronUp, Camera, Clock, ArrowRight, Link2,
} from "lucide-react";
import { EventDetourLinkModal } from "@/components/admin/EventDetourLinkModal";
import { getDeletedRoutesAction, restoreRouteAction } from "@/app/actions/doh-actions";
import {
  parseFloodDirectionMeta, resolveEffectiveRoadSide, getDetailedTrafficPresentation,
  getFloodCompletenessIssues, mapTrafficStatusToDetail, normalizeMediaUrl,
  AFFECTED_ROAD_PART_LABELS, DetailedTrafficStatus, ParentFloodEventGroup,
} from "@/lib/flood-event-schema";
import {
  getTrafficPresentation, TRAFFIC_STATUS_OPTIONS, deriveTrafficStatusFromWaterLevel,
  formatRelativeUpdateTime,
} from "@/lib/traffic-presentation";
import { getEventIdForFloodRoute, getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { useIncidentRegistry } from "./useIncidentRegistry";

interface IncidentRegistryTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  onEditFlood: (floodId: string) => void;
  onAddFlood: (context?: { routeNo?: string; sectionName?: string; eventId?: string }) => void;
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
  const {
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
    handleExport,
  } = useIncidentRegistry({
    systemData,
    onDataRefresh,
    onToast,
    showConfirmModal,
    showSuccessModal,
  });

  return (
    <div className="space-y-5 w-full">
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
            onClick={() => onAddFlood()}
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
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${incidentFilter === "ACTIVE"
                ? "bg-red-600 text-white"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
          >
            กำลังเกิดเหตุ ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("RESOLVED")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${incidentFilter === "RESOLVED"
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
          >
            ปกติแล้ว ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("ALL")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition ${incidentFilter === "ALL"
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
          >
            ทั้งหมด ({totalCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="กรองตามสายทางหลวง"
            value={routeNoFilter}
            onChange={(e) => setRouteNoFilter(e.target.value)}
            className="min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
          >
            <option value="ALL">ทุกสายทาง</option>
            {availableRouteNumbers.map((rn) => (
              <option key={rn} value={rn}>
                ทล.{rn}
              </option>
            ))}
          </select>

          <select
            aria-label="กรองตามสถานะจราจร"
            value={trafficStatusFilter}
            onChange={(e) => setTrafficStatusFilter(e.target.value)}
            className="min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
          >
            <option value="ALL">ทุกสถานะจราจร</option>
            {TRAFFIC_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="relative min-w-[200px]">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="ค้นหาเหตุการณ์น้ำท่วม"
              value={incidentSearch}
              onChange={(e) => setIncidentSearch(e.target.value)}
              placeholder="ค้นหาสายทาง 42, 43, หนองจิก..."
              className="min-h-10 w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white"
            />
          </div>

          {(routeNoFilter !== "ALL" || trafficStatusFilter !== "ALL" || incidentSearch.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setRouteNoFilter("ALL");
                setTrafficStatusFilter("ALL");
                setIncidentSearch("");
              }}
              className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Incident Table / Grouped Hierarchy List */}
      <div className="doh-incident-container space-y-3">
        {parentEvents.length === 0 ? (
          <div className="text-center py-12 bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
            ไม่พบรายการเหตุการณ์ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          parentEvents.map((ev) => {
            const isCollapsed = !expandedEvents.has(ev.eventId);
            const statusConfig = getDetailedTrafficPresentation(ev.mostSevereStatus, ev.maxWaterLevelCm);
            const incompleteCount = ev.segments.filter(
              (seg) => getFloodCompletenessIssues(seg, seg._meta || parseFloodDirectionMeta(seg.direction_meta, seg)).length > 0
            ).length;
            const linkedEventDetours = getLinkedDetoursForFlood(ev.segments[0], systemData, {
              includeInactiveDetours: true,
            });
            const floodBadgeColor = systemData.mapStyles?.flood?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;

            return (
              <div
                key={ev.eventId}
                className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden"
              >
                {/* Parent Event Header Card */}
                <div className="doh-incident-header p-4 bg-slate-900/80 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-heading font-black text-xs text-sky-400 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded-lg shrink-0">
                      ทล.{ev.routeNo}
                    </span>
                    <h3 className="font-heading font-bold text-sm text-white break-words min-w-0">
                      {ev.eventTitle || `ตอน${ev.sectionName}`}
                    </h3>
                    <span className={`text-[11px] font-heading font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusConfig.badgeClass}`}>
                      {statusConfig.icon} {statusConfig.label}
                    </span>
                    {linkedEventDetours.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-heading font-bold px-2.5 py-0.5 rounded-full border border-sky-500/40 bg-sky-950/70 text-sky-300 whitespace-nowrap">
                        <Link2 className="w-3 h-3" /> {linkedEventDetours.length} ทางเลี่ยง
                      </span>
                    )}
                    {incompleteCount > 0 && (
                      <span className="text-[11px] font-heading font-semibold px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-300 whitespace-nowrap">
                        ⚠️ ข้อมูลไม่ครบ ({incompleteCount})
                      </span>
                    )}
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                      (น้ำสูงสุด {ev.maxWaterLevelCm} ซม. · {ev.segments.length} ช่วงกิโลเมตร)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setLinkingEventId(ev.eventId)}
                      aria-label={`จัดการทางเลี่ยงเชื่อมโยง ${ev.eventTitle || ev.sectionName}`}
                      className="min-h-10 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/50 px-3 py-1.5 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition whitespace-nowrap"
                      title="จัดการทางเลี่ยงเชื่อมโยงแบบหลายต่อหลาย"
                    >
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> จัดการทางเลี่ยงเชื่อมโยง
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddFlood({ routeNo: ev.routeNo, sectionName: ev.sectionName, eventId: ev.eventId })}
                      className="min-h-10 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 px-3 py-1.5 rounded-xl text-xs font-heading font-bold flex items-center gap-1 transition whitespace-nowrap"
                      title="เพิ่มช่วง กม. ย่อยในเหตุการณ์หลักนี้"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> เพิ่มช่วง กม.
                    </button>
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? `กางดูช่วงย่อยทั้งหมด ${ev.eventTitle || ev.sectionName}` : `ย่อเก็บช่วงย่อย ${ev.eventTitle || ev.sectionName}`}
                      onClick={() => {
                        setExpandedEvents((prev) => {
                          const next = new Set(prev);
                          if (next.has(ev.eventId)) next.delete(ev.eventId);
                          else next.add(ev.eventId);
                          return next;
                        });
                      }}
                      className="min-h-10 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                      title={isCollapsed ? "กางดูช่วงย่อยทั้งหมด" : "ย่อเก็บช่วงย่อย"}
                    >
                      <span className="text-[11px] font-semibold whitespace-nowrap">{ev.segments.length} ช่วง</span>
                      {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Child Segments Container */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-850 p-2 sm:p-3 space-y-2">
                    {ev.segments.map((r) => {
                      const meta = r._meta || parseFloodDirectionMeta(r.direction_meta, r);
                      const segStatusConfig = getTrafficPresentation(
                        r.traffic_status,
                        r.water_level_cm ?? 0,
                        meta.trafficStatusDetail
                      );
                      const completenessIssues = getFloodCompletenessIssues(r, meta);
                      const visibleParts = (meta.affectedParts || []).filter(
                        (p: any) => p && p !== "UNSPECIFIED" && p !== "PENDING_VERIFICATION"
                      );

                      return (
                        <div
                          key={r.id}
                          className="doh-incident-segment p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 transition min-w-0"
                        >
                          <div className="space-y-2 min-w-0 flex-1">
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
                                className="h-4 w-4 accent-amber-500 shrink-0"
                              />
                              <span
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white shadow-sm"
                                style={{ backgroundColor: floodBadgeColor }}
                                title="จุดน้ำท่วม"
                              >
                                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                  <path d="M2 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />
                                  <path d="M2 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />
                                </svg>
                              </span>
                              <span className={`text-[11px] font-heading font-bold px-2 py-0.5 rounded whitespace-nowrap ${segStatusConfig.badgeClass}`}>
                                {segStatusConfig.icon} {segStatusConfig.label}
                              </span>
                              {completenessIssues.length > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[11px] font-heading font-semibold text-amber-300"
                                  title={completenessIssues.join(" · ")}
                                >
                                  ⚠️ ข้อมูลไม่ครบ: {completenessIssues.join(", ")}
                                </span>
                              )}
                              <span className="text-xs font-mono font-bold text-amber-300 whitespace-nowrap">
                                {meta.directionCode === "B_TO_A" ? "🚙 ขากลับ (B → A)" : meta.directionCode === "BOTH" ? "↔️ ไป-กลับ" : meta.directionCode === "A_TO_B" ? "🚗 ขาไป (A → B)" : "ยังไม่ระบุทิศทาง"}
                              </span>
                              <span className="text-xs font-bold text-white font-mono whitespace-nowrap">
                                กม.{r.km_start} ถึง กม.{r.km_end}
                              </span>
                              {meta.villageOrLandmark && (
                                <span className="text-[11px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md break-words">
                                  📍 {meta.villageOrLandmark}
                                </span>
                              )}
                            </div>

                            {/* Details Row: Level, Affected routes/parts, Photos */}
                            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                              {inlineEditId === r.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void handleSaveInlineWaterLevel(r);
                                  }}
                                  className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/60 bg-slate-900/95 px-2 py-1"
                                >
                                  <label htmlFor={`inline-water-${r.id}`} className="text-[11px] font-semibold text-amber-300">
                                    ระดับน้ำ (ซม.):
                                  </label>
                                  <input
                                    id={`inline-water-${r.id}`}
                                    type="number"
                                    min={0}
                                    max={500}
                                    autoFocus
                                    value={inlineWaterLevel}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setInlineWaterLevel(val);
                                      const parsed = Number(val);
                                      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 500) {
                                        const suggested = deriveTrafficStatusFromWaterLevel(
                                          Math.round(parsed),
                                          meta.affectedParts
                                        );
                                        if (suggested) setInlineTrafficStatus(suggested);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        setInlineEditId(null);
                                      }
                                    }}
                                    aria-label="ระดับน้ำใหม่ (ซม.)"
                                    className="h-7 w-16 rounded border border-slate-600 bg-slate-950 px-1.5 text-center font-mono text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                                  />
                                  <select
                                    aria-label="สถานะจราจรใหม่"
                                    value={inlineTrafficStatus}
                                    onChange={(e) =>
                                      setInlineTrafficStatus(e.target.value as FloodRoute["traffic_status"])
                                    }
                                    className="h-7 rounded border border-slate-600 bg-slate-950 px-2 text-[11px] font-semibold text-white focus:border-amber-400 focus:outline-none"
                                  >
                                    {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="submit"
                                    disabled={inlineSavingId === r.id}
                                    className="min-h-9 rounded bg-emerald-500 hover:bg-emerald-400 px-2.5 text-[11px] font-bold text-slate-950 transition disabled:opacity-50 cursor-pointer"
                                  >
                                    {inlineSavingId === r.id ? "กำลังบันทึก..." : "บันทึก"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineEditId(null)}
                                    className="min-h-9 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 text-[11px] text-slate-200 transition cursor-pointer"
                                  >
                                    ยกเลิก
                                  </button>
                                </form>
                              ) : (
                                <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                                  <span>
                                    ระดับน้ำ:{" "}
                                    <strong className="text-white font-mono text-sm">
                                      {meta.waterLevelKnown === false ? "ยังไม่ระบุ" : `${r.water_level_cm} ซม.`}
                                    </strong>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineEditId(r.id);
                                      setInlineWaterLevel(String(r.water_level_cm ?? 0));
                                      setInlineTrafficStatus(r.traffic_status);
                                    }}
                                    aria-label={`แก้ไขระดับน้ำด่วน ทล.${r.route_no} กม.${r.km_start}`}
                                    title="แก้ไขระดับน้ำแบบด่วนทันที"
                                    className="min-h-9 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 hover:border-amber-400/70 hover:text-amber-300 px-2 py-1 text-[11px] text-slate-300 transition cursor-pointer"
                                  >
                                    <Edit className="h-3 w-3" aria-hidden="true" />
                                    <span>แก้ตัวเลข</span>
                                  </button>
                                  {r.water_level_cm === 0 && meta.waterLevelKnown !== false && (
                                    <span className="text-[10px] text-emerald-400 font-bold">(ซ่อนเส้นบนแผนที่ปัจจุบัน · เก็บประวัติ)</span>
                                  )}
                                </span>
                              )}

                              <span className="text-slate-400">
                                เส้นทางที่ได้รับผลกระทบ:{" "}
                                <strong className={visibleParts.length > 0 ? "text-sky-300" : "text-amber-300"}>
                                  {visibleParts.length > 0
                                    ? visibleParts.map((p: any) => AFFECTED_ROAD_PART_LABELS[p as keyof typeof AFFECTED_ROAD_PART_LABELS] || p).join(", ")
                                    : "ไม่ระบุ"}
                                </strong>
                              </span>

                              {meta.photos && meta.photos.length > 0 && (
                                <span className="text-amber-300/90 inline-flex items-center gap-1 font-mono text-[11px] whitespace-nowrap">
                                  <Camera className="w-3.5 h-3.5 text-amber-400" /> {meta.photos.length} ภาพ
                                </span>
                              )}
                            </div>

                            {/* Meta Footer Row: Updated timestamp & reporter */}
                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span>{formatRelativeUpdateTime(r.updated_at || meta.updatedAt)}</span>
                              <span>ผู้รายงาน: {meta.subdivisionName || r.reporter_name || "เจ้าหน้าที่แขวงทางหลวงปัตตานี"}</span>
                            </div>
                          </div>

                          {/* Action Buttons Per Segment: รองรับการปรับขยายทุกขนาดโดยไม่ทับข้อความ */}
                          <div className="doh-incident-actions shrink-0">
                            <div className="inline-flex flex-wrap items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700/60">
                              <button
                                type="button"
                                onClick={() => {
                                  setUpdateModalIncident(r);
                                  setNewWaterLevel(r.water_level_cm);
                                  setNewTrafficStatus(r.traffic_status);
                                }}
                                className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-2.5 py-2 rounded-lg text-xs flex items-center gap-1 shadow transition whitespace-nowrap cursor-pointer"
                                title="อัปเดตระดับน้ำและสถานะจราจรด่วน"
                              >
                                ⚡ อัปเดตด่วน
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditFlood(r.id)}
                                className="min-h-10 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 px-2.5 py-2 rounded-lg text-xs font-heading font-semibold transition whitespace-nowrap cursor-pointer"
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewingIncident(r)}
                                className="min-h-10 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                              >
                                รายละเอียด
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleIncidentStatus(r.id, r.is_active)}
                                className={`min-h-10 px-2.5 py-2 rounded-lg text-xs font-heading font-semibold transition border whitespace-nowrap cursor-pointer ${r.is_active
                                    ? "bg-slate-800 text-slate-300 hover:bg-emerald-950 hover:text-emerald-300 border-slate-700"
                                    : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border-emerald-700"
                                  }`}
                              >
                                {r.is_active ? "คืนปกติ" : "เปิดใหม่"}
                              </button>
                            </div>

                            <div className="inline-flex flex-wrap items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitModalIncident(r);
                                  setSplitKm("");
                                  setSplitNewWaterLevel(Math.max(0, Math.round(r.water_level_cm / 2)));
                                  setSplitNewTrafficStatus(r.traffic_status);
                                }}
                                className="min-h-10 bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-800/80 px-2.5 py-2 rounded-lg text-xs font-heading font-bold flex items-center gap-1 transition whitespace-nowrap cursor-pointer"
                                title="แบ่งช่วง กม. นี้ออกเป็น ๒ ช่วงย่อย"
                              >
                                <Split className="w-3.5 h-3.5" aria-hidden="true" /> แบ่งช่วง
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMergeModalIncident(r);
                                  setTargetMergeIncidentId("");
                                }}
                                className="min-h-10 bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 px-2.5 py-2 rounded-lg text-xs font-heading font-bold flex items-center gap-1 transition whitespace-nowrap cursor-pointer"
                                title="รวมช่วง กม. นี้เข้ากับช่วงย่อยอื่นในสายทางเดียวกัน"
                              >
                                <Merge className="w-3.5 h-3.5" aria-hidden="true" /> รวมช่วง
                              </button>
                              <button
                                type="button"
                                aria-label="ลบช่วงนี้ (กู้คืนได้)"
                                onClick={() => handleDeleteRoute(r.id)}
                                className="min-h-10 min-w-10 flex items-center justify-center bg-red-950/70 hover:bg-red-800 text-red-300 p-2 rounded-lg text-xs transition border border-red-900/50 cursor-pointer"
                                title="ลบช่วงนี้ (กู้คืนได้)"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
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
          <div ref={viewingDialog.dialogRef} role="dialog" aria-modal="true" aria-label="รายละเอียดเหตุการณ์" tabIndex={-1} onKeyDown={viewingDialog.onKeyDown} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-3">
              <div><p className="text-xs font-semibold text-amber-300">ทล.{viewingIncident.route_no}</p><h3 className="text-lg font-semibold text-white">{viewingIncident.section_name}</h3></div>
              <button type="button" onClick={() => setViewingIncident(null)} className="min-h-10 min-w-10 flex items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer" aria-label="ปิดรายละเอียด">×</button>
            </div>

            {viewingIncident.latest_photo_url && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <img
                  src={normalizeMediaUrl(viewingIncident.latest_photo_url)}
                  alt={`ภาพหน้างาน ทล.${viewingIncident.route_no}`}
                  className="w-full h-44 object-cover"
                />
              </div>
            )}

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-400 text-xs">ช่วงสายทาง</dt><dd className="text-white font-mono">กม.{viewingIncident.km_start} - {viewingIncident.km_end}</dd></div>
              <div><dt className="text-slate-400 text-xs">สถานะการจราจร</dt><dd className="text-white font-semibold">{getTrafficPresentation(viewingIncident.traffic_status, viewingIncident.water_level_cm ?? 0, viewingIncident.direction_meta?.trafficStatusDetail).label}</dd></div>
              <div><dt className="text-slate-400 text-xs">ระดับน้ำล่าสุด</dt><dd className="text-white font-bold text-amber-300">{viewingIncident.water_level_cm} ซม.</dd></div>
              <div>
                <dt className="text-slate-400 text-xs">ฝั่งถนนที่รายงาน</dt>
                <dd className="text-white">
                  {viewingIncident.road_side === "LEFT"
                    ? "ฝั่งซ้าย (ตามหลัก กม.)"
                    : viewingIncident.road_side === "RIGHT"
                      ? "ฝั่งขวา (ย้อนหลัก กม.)"
                      : viewingIncident.road_side === "BOTH"
                        ? "ทั้ง ๒ ฝั่ง (ไป-กลับ)"
                        : "รอตรวจสอบฝั่งทาง"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 text-xs">ช่องจราจรที่กระทบ</dt>
                <dd className="text-white">{viewingIncident.affected_lanes || "ไม่ระบุ"}</dd>
              </div>
              <div>
                <dt className="text-slate-400 text-xs">ไหล่ทางที่กระทบ</dt>
                <dd className="text-white">
                  {viewingIncident.affected_shoulder === "BOTH"
                    ? "ไหล่ทางทั้งสองฝั่ง"
                    : viewingIncident.affected_shoulder === "LEFT"
                      ? "ไหล่ทางฝั่งซ้าย"
                      : viewingIncident.affected_shoulder === "RIGHT"
                        ? "ไหล่ทางฝั่งขวา"
                        : "ไม่มีผลกระทบ"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 text-xs">เจ้าหน้าที่ผู้บันทึก</dt>
                <dd className="text-white">{viewingIncident.reporter_name || "เจ้าหน้าที่แขวงทางหลวงปัตตานี"}</dd>
              </div>
              <div><dt className="text-slate-400 text-xs">อัปเดตล่าสุด</dt><dd className="text-white text-xs">{new Date(viewingIncident.updated_at).toLocaleString("th-TH")}</dd></div>
            </dl>

            {(viewingIncident.direction_meta?.causeAndNote || viewingIncident.detour_advice) && (
              <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-semibold block">สาเหตุ / คำแนะนำ / หมายเหตุ:</span>
                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {viewingIncident.direction_meta?.causeAndNote || viewingIncident.detour_advice}
                </p>
              </div>
            )}

            {(() => {
              const linkedDetours = getLinkedDetoursForFlood(viewingIncident, systemData, {
                includeInactiveDetours: true,
              });
              const viewingEventId = getEventIdForFloodRoute(viewingIncident, systemData.eventSegments);
              return (
                <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-amber-300 font-heading font-bold flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" />
                      <span>ทางเลี่ยงที่เชื่อมโยง ({linkedDetours.length} สาย)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setViewingIncident(null);
                        setLinkingEventId(viewingEventId);
                      }}
                      className="text-[11px] font-heading font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer"
                    >
                      จัดการทางเลี่ยงเชื่อมโยง
                    </button>
                  </div>
                  {linkedDetours.length === 0 ? (
                    <p className="text-slate-400">ยังไม่มีทางเลี่ยงที่เชื่อมโยงกับเหตุการณ์นี้</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {linkedDetours.map((entry, idx) => (
                        <li
                          key={`${entry.detour.id}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-slate-900/70 px-2.5 py-2"
                        >
                          <span className="font-heading font-semibold text-white">
                            #{entry.position || idx + 1} · {entry.detour.route_name}
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-sky-300">
                              {entry.effectiveDetourDirection === "FORWARD"
                                ? "ขาไป (A → B)"
                                : entry.effectiveDetourDirection === "REVERSE"
                                  ? "ขากลับ (B → A)"
                                  : "๒ ทิศทาง (A ⇄ B)"}
                            </span>
                            {!entry.detour.is_active && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 border border-slate-700">
                                ปิดชั่วคราว
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setViewingIncident(null); onEditFlood(viewingIncident.id); }} className="min-h-10 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-heading font-bold text-slate-950 transition cursor-pointer">แก้ไขข้อมูลบนแผนที่</button>
              <button type="button" onClick={() => { setViewingIncident(null); handleDeleteRoute(viewingIncident.id); }} className="min-h-10 rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900 px-4 py-2 text-xs font-heading font-bold text-rose-300 transition cursor-pointer">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Water Level Update Modal */}
      {updateModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div ref={updateDialog.dialogRef} role="dialog" aria-modal="true" aria-label="อัปเดตระดับน้ำ" tabIndex={-1} onKeyDown={updateDialog.onKeyDown} className="bg-slate-900 border-2 border-amber-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
            <h3 className="font-heading font-bold text-sm text-white">
              อัปเดตระดับน้ำ: ทล.{updateModalIncident.route_no} {updateModalIncident.section_name}
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="quick-update-water-level" className="text-xs text-slate-300">ระดับน้ำใหม่ (ซม.) *</label>
                  <span className="text-xs text-slate-400">
                    เดิม: <strong className="text-amber-300">{updateModalIncident.water_level_cm} ซม.</strong>
                  </span>
                </div>
                <input
                  id="quick-update-water-level"
                  type="number"
                  min={0}
                  value={newWaterLevel}
                  onChange={(e) => {
                    const nextVal = Number(e.target.value);
                    setNewWaterLevel(nextVal);
                    const meta = parseFloodDirectionMeta(updateModalIncident.direction_meta, updateModalIncident);
                    const suggested = deriveTrafficStatusFromWaterLevel(nextVal, meta.affectedParts);
                    if (suggested) setNewTrafficStatus(suggested);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold"
                />
                {newWaterLevel === 0 && (
                  <p className="mt-1 text-[11px] text-emerald-300">
                    💡 เมื่อระดับน้ำเป็น 0 ซม. ระบบเลือกสถานะแนะนำเป็น <strong>ผ่านได้ปกติ</strong> และซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบัน (หากถนนยังชำรุด/ปิดจราจร สามารถแก้ไขสถานะด้านล่างได้ทันที)
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="quick-update-traffic-status" className="text-xs text-slate-300 block mb-1">สถานะการจราจร (เจ้าหน้าที่ยืนยัน) *</label>
                <select
                  id="quick-update-traffic-status"
                  value={newTrafficStatus}
                  onChange={(e) => setNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quick-update-note" className="text-xs text-slate-300">หมายเหตุ / มาตรการความปลอดภัย</label>
                <input
                  id="quick-update-note"
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
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitQuickUpdate}
                className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow"
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
          <div ref={splitDialog.dialogRef} role="dialog" aria-modal="true" aria-label="แบ่งช่วงกิโลเมตรน้ำท่วม" tabIndex={-1} onKeyDown={splitDialog.onKeyDown} className="bg-slate-900 border-2 border-sky-400/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                <Split className="w-4 h-4 text-sky-400" aria-hidden="true" /> แบ่งช่วงกิโลเมตรน้ำท่วม (Split Segment)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ทล.{splitModalIncident.route_no} {splitModalIncident.section_name} (เดิม: กม.{splitModalIncident.km_start} - {splitModalIncident.km_end})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="split-km-input" className="text-slate-300 block mb-1">หลักกิโลเมตรจุดตัดแบ่งช่วง (Split KM) *</label>
                <input
                  id="split-km-input"
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
                  <label htmlFor="split-water-level-input" className="text-slate-300 block mb-1">ระดับน้ำช่วงที่ ๒ (ซม.)</label>
                  <input
                    id="split-water-level-input"
                    type="number"
                    min={0}
                    value={splitNewWaterLevel}
                    onChange={(e) => {
                      const nextVal = Number(e.target.value);
                      setSplitNewWaterLevel(nextVal);
                      const meta = splitModalIncident ? parseFloodDirectionMeta(splitModalIncident.direction_meta, splitModalIncident) : undefined;
                      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, meta?.affectedParts);
                      if (suggested) setSplitNewTrafficStatus(suggested);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="split-traffic-status-select" className="text-slate-300 block mb-1">สถานะจราจรช่วงที่ ๒</label>
                  <select
                    id="split-traffic-status-select"
                    value={splitNewTrafficStatus}
                    onChange={(e) => setSplitNewTrafficStatus(e.target.value as FloodRoute["traffic_status"])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-white text-xs"
                  >
                    {TRAFFIC_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSplitModalIncident(null)}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || !splitKm.trim()}
                onClick={handleSplitSegment}
                className="min-h-10 bg-sky-500 hover:bg-sky-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow disabled:opacity-50"
              >
                ยืนยันการแบ่งช่วง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Segments Modal (Phase 4) */}
      {mergeModalIncident && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div ref={mergeDialog.dialogRef} role="dialog" aria-modal="true" aria-label="รวมช่วงกิโลเมตรน้ำท่วม" tabIndex={-1} onKeyDown={mergeDialog.onKeyDown} className="bg-slate-900 border-2 border-indigo-500/80 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="border-b border-slate-800 pb-2">
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
                <Merge className="w-4 h-4 text-indigo-400" /> รวมช่วงกิโลเมตรน้ำท่วม (Merge Segments)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ทล.{mergeModalIncident.route_no} {mergeModalIncident.section_name} (ช่วงหลัก: กม.{mergeModalIncident.km_start} - {mergeModalIncident.km_end})
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">เลือกช่วงที่ต้องการนำมารวมกับช่วงนี้ *</label>
                {mergeCandidates.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs text-center">
                    ไม่พบช่วงน้ำท่วมอื่นที่เปิดใช้งานอยู่ใน ทล.{mergeModalIncident.route_no} เดียวกัน
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {mergeCandidates.map((c) => {
                      const cMeta = parseFloodDirectionMeta(c.direction_meta, c);
                      const isSelected = targetMergeIncidentId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTargetMergeIncidentId(c.id)}
                          className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${isSelected
                              ? "bg-indigo-950/90 border-indigo-400 text-white ring-1 ring-indigo-400"
                              : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                            }`}
                        >
                          <div>
                            <div className="font-bold text-amber-300 font-mono">
                              กม.{c.km_start} - {c.km_end}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {cMeta.directionCode === "B_TO_A" ? "ขากลับ (B→A)" : cMeta.directionCode === "A_TO_B" ? "ขาไป (A→B)" : cMeta.directionCode === "BOTH" ? "ไป-กลับ" : "ไม่ระบุทิศทาง"} | น้ำท่วม {c.water_level_cm} ซม.
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${isSelected ? "bg-indigo-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
                            {isSelected ? "เลือกแล้ว" : "เลือกรวม"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {targetMergeIncidentId && (
                <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-900/60 text-[11px] text-indigo-200">
                  ℹ️ ระบบจะรวมช่วง กม. จากจุดเริ่มต้นน้อยที่สุดถึงจุดสิ้นสุดมากที่สุด ปรับแนวเส้น Geometry อัตโนมัติ และปรับสถานะช่วงที่ถูกรวมเป็นซ่อน/ยุติ
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMergeModalIncident(null);
                  setTargetMergeIncidentId("");
                }}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || !targetMergeIncidentId}
                onClick={handleMergeSegments}
                className="min-h-10 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow disabled:opacity-50"
              >
                ยืนยันการรวมช่วง
              </button>
            </div>
          </div>
        </div>
      )}

      <EventDetourLinkModal
        isOpen={Boolean(linkingEventId)}
        initialMode="BY_EVENT"
        initialEventId={linkingEventId || undefined}
        systemData={systemData}
        onDataRefresh={onDataRefresh}
        onClose={() => setLinkingEventId(null)}
        onToast={onToast}
      />
    </div>
  );
}

