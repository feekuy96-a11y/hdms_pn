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
  getFloodCompletenessIssues, mapTrafficStatusToDetail,
  AFFECTED_ROAD_PART_LABELS, DetailedTrafficStatus, ParentFloodEventGroup,
} from "@/lib/flood-event-schema";
import {
  getTrafficPresentation, TRAFFIC_STATUS_OPTIONS, deriveTrafficStatusFromWaterLevel,
  formatRelativeUpdateTime,
} from "@/lib/traffic-presentation";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { useIncidentRegistry } from "./useIncidentRegistry";
import { IncidentActionModals } from "./IncidentActionModals";
import { IncidentDetailModal } from "./IncidentDetailModal";

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
      {deleted && <div className="border border-surface bg-surface-panel rounded-xl p-3 text-sm text-slate-300"><button type="button" onClick={() => setDeleted(null)} className="underline text-amber-300 cursor-pointer">ปิดรายการ</button>{deleted.length === 0 && <p className="mt-1">ไม่มีรายการที่ลบ</p>}{deleted.map((r) => <div key={r.id} className="flex justify-between py-2 border-t border-surface mt-1"><span>ทล.{r.route_no} {r.section_name}</span><button type="button" className="text-emerald-300 cursor-pointer" onClick={async () => { try { const res = await restoreRouteAction("FLOOD", r.id); onDataRefresh(res.systemData); setDeleted(await getDeletedRoutesAction()); } catch { onToast("กู้คืนไม่สำเร็จ"); } }}>กู้คืน</button></div>)}</div>}
      {/* Incident Header Stats */}
      <div className="border-b border-surface pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-lg leading-snug tracking-normal text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-400 shrink-0" /> ทะเบียนเหตุการณ์น้ำท่วม
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            กำลังเกิดเหตุ <strong className="text-red-400">{activeCount}</strong> จุด · ปกติแล้ว{" "}
            <strong className="text-emerald-400">{resolvedCount}</strong> จุด · ทั้งหมด{" "}
            <strong>{totalCount}</strong> รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-10 rounded-xl border border-surface bg-surface-card px-3 text-xs font-heading font-bold tracking-normal text-sky-300 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer" onClick={async () => { try { setDeleted(await getDeletedRoutesAction()); } catch { onToast("โหลดรายการที่ลบไม่สำเร็จ"); } }}>รายการที่ลบ / กู้คืน</button>
          <label className="flex items-center gap-1.5 rounded-xl border border-surface bg-surface-card px-2 text-xs text-amber-300">
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
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold tracking-normal text-xs min-h-10 px-4 rounded-xl flex items-center gap-1.5 shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" /> เพิ่มเหตุการณ์
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-panel p-3.5 rounded-2xl border border-surface">
        <div role="group" aria-label="กรองสถานะเหตุการณ์" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIncidentFilter("ACTIVE")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold tracking-normal transition cursor-pointer ${incidentFilter === "ACTIVE"
                ? "bg-red-600 text-white shadow-sm"
                : "border border-surface bg-surface-card text-slate-300 hover:bg-slate-800"
              }`}
          >
            กำลังเกิดเหตุ ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("RESOLVED")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold tracking-normal transition cursor-pointer ${incidentFilter === "RESOLVED"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-surface bg-surface-card text-slate-300 hover:bg-slate-800"
              }`}
          >
            ปกติแล้ว ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setIncidentFilter("ALL")}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold tracking-normal transition cursor-pointer ${incidentFilter === "ALL"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "border border-surface bg-surface-card text-slate-300 hover:bg-slate-800"
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
            className="min-h-10 bg-surface-card border border-surface rounded-xl px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
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
            className="min-h-10 bg-surface-card border border-surface rounded-xl px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
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
              className="min-h-10 w-full bg-surface-card border border-surface rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
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
              className="min-h-10 rounded-xl border border-surface bg-surface-card hover:bg-slate-800 px-3 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Incident Table / Grouped Hierarchy List */}
      <div className="doh-incident-container space-y-3">
        {parentEvents.length === 0 ? (
          <div className="text-center py-12 bg-surface-panel rounded-2xl border border-surface text-slate-400 text-xs">
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
                className="rounded-2xl border border-surface bg-surface-panel shadow-xl overflow-hidden"
              >
                {/* Parent Event Header Card */}
                <div className="doh-incident-header p-4 bg-surface-card border-b border-surface">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-heading font-black text-xs text-sky-400 bg-sky-950/80 border border-sky-800 px-2 py-0.5 rounded-lg shrink-0">
                      ทล.{ev.routeNo}
                    </span>
                    <h3 className="font-heading font-bold text-sm leading-snug tracking-normal text-white break-words min-w-0">
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
                      className="min-h-10 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface bg-surface-panel text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                      title={isCollapsed ? "กางดูช่วงย่อยทั้งหมด" : "ย่อเก็บช่วงย่อย"}
                    >
                      <span className="text-[11px] font-semibold whitespace-nowrap">{ev.segments.length} ช่วง</span>
                      {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Child Segments Container */}
                {!isCollapsed && (
                  <div className="p-2 sm:p-3 space-y-2">
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
                          className="doh-incident-segment p-3 rounded-xl border border-surface bg-surface-canvas/70 hover:bg-surface-card/70 transition min-w-0"
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
                            <div className="inline-flex flex-wrap items-center gap-1 bg-surface-panel p-1 rounded-xl border border-surface">
                              <button
                                type="button"
                                onClick={() => {
                                  setUpdateModalIncident(r);
                                  setNewWaterLevel(r.water_level_cm);
                                  setNewTrafficStatus(r.traffic_status);
                                }}
                                className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold tracking-normal px-2.5 py-2 rounded-lg text-xs flex items-center gap-1 shadow transition whitespace-nowrap cursor-pointer"
                                title="อัปเดตระดับน้ำและสถานะจราจรด่วน"
                              >
                                ⚡ อัปเดตด่วน
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditFlood(r.id)}
                                className="min-h-10 bg-surface-card border border-surface hover:bg-amber-500 hover:text-slate-950 text-amber-300 px-2.5 py-2 rounded-lg text-xs font-heading font-semibold tracking-normal transition whitespace-nowrap cursor-pointer"
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewingIncident(r)}
                                className="min-h-10 rounded-lg border border-surface bg-surface-card px-2.5 py-2 text-xs font-semibold tracking-normal text-slate-100 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                              >
                                รายละเอียด
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleIncidentStatus(r.id, r.is_active)}
                                className={`min-h-10 px-2.5 py-2 rounded-lg text-xs font-heading font-semibold tracking-normal transition border whitespace-nowrap cursor-pointer ${r.is_active
                                    ? "bg-surface-card text-slate-300 hover:bg-emerald-950 hover:text-emerald-300 border-surface"
                                    : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border-emerald-700"
                                  }`}
                              >
                                {r.is_active ? "คืนปกติ" : "เปิดใหม่"}
                              </button>
                            </div>

                            <div className="inline-flex flex-wrap items-center gap-1 bg-surface-panel p-1 rounded-xl border border-surface">
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

      <IncidentDetailModal
        viewingIncident={viewingIncident}
        systemData={systemData}
        dialog={viewingDialog}
        onClose={() => setViewingIncident(null)}
        onManageDetourLinks={(eventId) => setLinkingEventId(eventId)}
        onEditOnMap={onEditFlood}
        onDelete={handleDeleteRoute}
      />

      {/* Quick Water Level Update, Split Segment & Merge Segments Modals */}
      <IncidentActionModals
        isSubmitting={isSubmitting}
        updateModalIncident={updateModalIncident}
        updateDialog={updateDialog}
        newWaterLevel={newWaterLevel}
        setNewWaterLevel={setNewWaterLevel}
        newTrafficStatus={newTrafficStatus}
        setNewTrafficStatus={setNewTrafficStatus}
        updateNote={updateNote}
        setUpdateNote={setUpdateNote}
        onCloseUpdateModal={() => setUpdateModalIncident(null)}
        onSubmitQuickUpdate={handleSubmitQuickUpdate}
        splitModalIncident={splitModalIncident}
        splitDialog={splitDialog}
        splitKm={splitKm}
        setSplitKm={setSplitKm}
        splitNewWaterLevel={splitNewWaterLevel}
        setSplitNewWaterLevel={setSplitNewWaterLevel}
        splitNewTrafficStatus={splitNewTrafficStatus}
        setSplitNewTrafficStatus={setSplitNewTrafficStatus}
        onCloseSplitModal={() => setSplitModalIncident(null)}
        onSubmitSplitSegment={handleSplitSegment}
        mergeModalIncident={mergeModalIncident}
        mergeDialog={mergeDialog}
        mergeCandidates={mergeCandidates}
        targetMergeIncidentId={targetMergeIncidentId}
        setTargetMergeIncidentId={setTargetMergeIncidentId}
        onCloseMergeModal={() => {
          setMergeModalIncident(null);
          setTargetMergeIncidentId("");
        }}
        onSubmitMergeSegments={handleMergeSegments}
      />

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

