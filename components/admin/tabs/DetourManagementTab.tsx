"use client";

import React from "react";
import { AdviceText } from "@/components/AdviceText";
import { SystemDataPayload } from "@/db/default-data";
import {
  Signpost, Plus, FileText, Search, Trash2, Edit, Eye, CheckCircle2, XCircle,
  MapPin, Sparkles, ArrowRightLeft, Wand2, X, Save, Compass, Route, Clock,
  Camera, Navigation, ChevronUp, ChevronDown, Link2,
} from "lucide-react";
import { EventDetourLinkModal } from "@/components/admin/EventDetourLinkModal";
import {
  composeDirectionalAdvice, extractDirectionalAdvice, extractDirectionalAdviceForEdit,
  splitDetourAdviceByDirection,
} from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
  isDetourDirectionAllowed,
} from "@/lib/detour-presentation";
import { normalizeMediaUrl, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import { GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { useDetourManagement } from "./useDetourManagement";

interface DetourManagementTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onEditDetourOnMap: (detourId: string) => void;
  onAddDetour: () => void;
  onFocusCoordinates?: (coords: [number, number]) => void;
}

export function DetourManagementTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  onEditDetourOnMap,
  onAddDetour,
  onFocusCoordinates,
}: DetourManagementTabProps) {
  const {
    detourFilter,
    setDetourFilter,
    floodFilter,
    setFloodFilter,
    searchQuery,
    setSearchQuery,
    viewingDetour,
    setViewingDetour,
    viewingDetourDir,
    setViewingDetourDir,
    editingDetour,
    setEditingDetour,
    editDetourName,
    setEditDetourName,
    editDetourRefId,
    setEditDetourRefId,
    editDetourDesc,
    setEditDetourDesc,
    editDetourAdviceView,
    setEditDetourAdviceView,
    editDetourGoogleMapsUrlFwd,
    setEditDetourGoogleMapsUrlFwd,
    editDetourGoogleMapsUrlRev,
    setEditDetourGoogleMapsUrlRev,
    editDetourDurationMinFwd,
    setEditDetourDurationMinFwd,
    editDetourDurationMinRev,
    setEditDetourDurationMinRev,
    editDetourStartPhotoUrl,
    setEditDetourStartPhotoUrl,
    editDetourStartPhotoCaption,
    setEditDetourStartPhotoCaption,
    editDetourEndPhotoUrl,
    setEditDetourEndPhotoUrl,
    editDetourEndPhotoCaption,
    setEditDetourEndPhotoCaption,
    editDetourRoadCondition,
    setEditDetourRoadCondition,
    editIsActive,
    setEditIsActive,
    isSubmitting,
    reorderingId,
    selectedDetourIds,
    setSelectedDetourIds,
    exportScope,
    setExportScope,
    linkModalState,
    setLinkModalState,
    viewingDialog,
    editingDialog,
    autoTableRef,
    tableLayoutMode,
    detourList,
    floodList,
    totalCount,
    activeCount,
    inactiveCount,
    linkedEventsByDetourId,
    filteredDetours,
    getReorderSiblings,
    handleMoveDetourOrder,
    handleToggleStatus,
    handleOpenEditModal,
    handleEditPointPhotoUpload,
    handleGenerateAdviceInModal,
    handleSaveModal,
    handleDeleteDetour,
    handleExport,
  } = useDetourManagement({
    systemData,
    onDataRefresh,
    onToast,
    showConfirmModal,
    showSuccessModal,
    showErrorModal,
  });

  return (
    <div className="space-y-4">
      {/* 1. Header & Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">เส้นทางเลี่ยงทั้งหมด</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-0.5 block">
            {totalCount}
          </span>
          <span className="text-[10px] text-slate-400">โครงข่ายทางเลี่ยงในระบบ</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">เปิดใช้งาน (Active)</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-0.5 block">
            {activeCount}
          </span>
          <span className="text-[10px] text-emerald-500/80">แสดงบนแผนที่ประชาชน</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">ปิดชั่วคราว</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-400 mt-0.5 block">
            {inactiveCount}
          </span>
          <span className="text-[10px] text-slate-400">ซ่อนจากการแสดงผล</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">ผูกกับจุดน้ำท่วม</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-sky-400 mt-0.5 block">
            {new Set(Array.from(linkedEventsByDetourId.values()).flatMap((evs) => evs.map((e) => e.eventId))).size}
          </span>
          <span className="text-[10px] text-sky-400/80">เหตุการณ์ที่มีเส้นทางเลี่ยง</span>
        </div>
      </div>

      {/* 2. Top Action Bar: Search, Filters & Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative min-w-[180px] flex-1 basis-[210px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              aria-label="ค้นหาเส้นทางเลี่ยง"
              placeholder="ค้นหาเส้นทางเลี่ยง, ทล., ตอนควบคุม..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Status Filter */}
          <select
            aria-label="กรองตามสถานะทางเลี่ยง"
            value={detourFilter}
            onChange={(e: any) => setDetourFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading"
          >
            <option value="ALL">สถานะทั้งหมด ({totalCount})</option>
            <option value="ACTIVE">เปิดใช้งาน ({activeCount})</option>
            <option value="INACTIVE">ปิดชั่วคราว ({inactiveCount})</option>
          </select>

          {/* Linked Flood Filter */}
          <select
            aria-label="กรองตามจุดน้ำท่วม"
            value={floodFilter}
            onChange={(e) => setFloodFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading max-w-[200px] truncate"
          >
            <option value="ALL">จุดน้ำท่วมทั้งหมด</option>
            {floodList.map((f) => (
              <option key={f.id} value={f.id}>
                ทล.{f.route_no} - {f.section_name} {f.is_active ? "(กำลังเกิดเหตุ)" : "(ปกติแล้ว)"}
              </option>
            ))}
          </select>
          {(detourFilter !== "ALL" || floodFilter !== "ALL" || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setDetourFilter("ALL");
                setFloodFilter("ALL");
                setSearchQuery("");
              }}
              className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <button
            type="button"
            onClick={() => setLinkModalState({ mode: "BY_DETOUR" })}
            className="min-h-10 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/50 font-heading font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>จัดการความสัมพันธ์ (หลายจุด)</span>
          </button>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200">
            <FileText className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <select aria-label="ขอบเขตส่งออกทางเลี่ยง" value={exportScope} onChange={(e) => setExportScope(e.target.value as typeof exportScope)} className="min-h-10 max-w-28 bg-transparent font-heading outline-none">
              <option value="FILTERED">ตามตัวกรอง</option><option value="ALL">ทั้งหมด</option><option value="SELECTED">ที่เลือก</option>
            </select>
            <select aria-label="รูปแบบส่งออกทางเลี่ยง" defaultValue="" onChange={(e) => { if (e.target.value) void handleExport(e.target.value as GisExportFormat); e.target.value = ""; }} className="min-h-10 bg-transparent font-heading outline-none">
              <option value="" disabled>ส่งออก…</option>
              <option value="csv">CSV</option><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="kmz">KMZ</option><option value="shapefile">Shapefile ZIP</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onAddDetour}
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>วาดทางเลี่ยงใหม่บนแผนที่</span>
          </button>
        </div>
      </div>

      {/* 3. Detour Routes Data Table */}
      {filteredDetours.length === 0 ? (
        <div className="bg-slate-950 p-8 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 space-y-2">
          <Signpost className="w-8 h-8 text-slate-600 mx-auto" />
          <p>ไม่พบรายการเส้นทางเลี่ยงที่ตรงกับเงื่อนไขการค้นหา</p>
          <button
            type="button"
            onClick={onAddDetour}
            className="text-amber-400 hover:underline font-heading font-bold inline-block"
          >
            + คลิกที่นี่เพื่อวาดเส้นทางเลี่ยงใหม่บนแผนที่
          </button>
        </div>
      ) : (
        <div ref={autoTableRef} className="doh-auto-table space-y-3">
          {/* Mobile Card View (จอแคบ / มือถือ / พื้นที่แสดงจริงแคบ) */}
          {tableLayoutMode !== "table" && <div className="doh-auto-table-cards block md:hidden space-y-3">
            {filteredDetours.map((item, idx) => {
              const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
              const ext = extractDirectionalAdvice(item.description || "");
              const siblings = getReorderSiblings(item);
              const groupPos = siblings.findIndex((d) => d.id === item.id);
              const canMoveUp = groupPos > 0 && !reorderingId;
              const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

              return (
                <div
                  key={item.id}
                  onClick={() => setViewingDetour(item)}
                  className={`p-3.5 rounded-2xl border border-slate-800 bg-slate-950/80 shadow-md space-y-2.5 cursor-pointer hover:border-slate-700 transition ${!item.is_active ? "opacity-60" : ""
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
                        checked={selectedDetourIds.has(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedDetourIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-amber-500 rounded"
                      />
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950" title="เส้นทางเลี่ยง">
                        <Route className="h-4 w-4" />
                      </span>
                      <span className="font-heading font-black text-sm text-white">{item.route_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(item.id, item.is_active);
                      }}
                      className={`min-h-9 px-2.5 py-1 rounded-full text-[10px] font-heading font-bold border whitespace-nowrap transition cursor-pointer ${item.is_active
                          ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                          : "bg-slate-900 text-slate-400 border-slate-700"
                        }`}
                    >
                      {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-sky-300 font-medium">
                      {item.direction_mode === "FORWARD_ONLY"
                        ? "→ เฉพาะขาไป (A → B)"
                        : item.direction_mode === "REVERSE_ONLY"
                          ? "→ เฉพาะขากลับ (B → A)"
                          : "⇄ เดินรถ ๒ ทิศทาง (A ⇄ B)"}
                    </span>
                    {linkedEvents.map((ev) => (
                      <span
                        key={ev.eventId}
                        className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.2 rounded font-bold"
                      >
                        ผูก ทล.{ev.routeNo} ({ev.sectionName}){ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}
                      </span>
                    ))}
                  </div>

                  {ext.hasBoth ? (
                    <div className="text-[11px] space-y-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <div className="text-amber-200 line-clamp-1">
                        <strong className="text-amber-400">🚗 ขาไป:</strong> {ext.forward}
                      </div>
                      <div className="text-sky-200 line-clamp-1">
                        <strong className="text-sky-400">🚙 ขากลับ:</strong> {ext.reverse}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                      {item.description || "-"}
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 font-mono">
                      ลำดับที่ {groupPos + 1} · {Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0} จุดโหนด
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
                        disabled={!canMoveUp}
                        onClick={() => handleMoveDetourOrder(item, "UP")}
                        title="เลื่อนลำดับขึ้น"
                        className="min-h-9 px-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
                        disabled={!canMoveDown}
                        onClick={() => handleMoveDetourOrder(item, "DOWN")}
                        title="เลื่อนลำดับลง"
                        className="min-h-9 px-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingDetour(item)}
                        className="min-h-10 px-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 font-heading font-bold text-xs hover:bg-slate-700"
                      >
                        รายละเอียด
                      </button>
                      <button
                        type="button"
                        aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
                        onClick={() => setLinkModalState({ mode: "BY_DETOUR", detourId: item.id })}
                        className="min-h-10 px-2.5 rounded-lg border border-sky-500/50 bg-sky-950/50 text-sky-300 font-heading font-bold text-xs hover:bg-sky-900 inline-flex items-center gap-1"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>ผูกหลายเหตุการณ์</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="min-h-10 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-heading font-bold text-xs border border-slate-700"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        aria-label={`ลบทางเลี่ยง ${item.route_name}`}
                        title="ลบเส้นทางเลี่ยง"
                        onClick={() => handleDeleteDetour(item)}
                        className="min-h-10 min-w-10 inline-flex items-center justify-center bg-red-950/60 text-red-400 hover:bg-red-900 rounded-lg border border-red-900/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>}

          {/* Desktop & Tablet Table View */}
          {tableLayoutMode !== "cards" && <div className="doh-auto-table-desktop hidden md:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
            <table className="w-full min-w-[880px] table-auto text-left text-xs text-slate-300">
              <thead className="bg-[#091122] text-slate-400 font-heading border-b border-slate-800">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 min-w-[170px] whitespace-nowrap">ชื่อเส้นทางเลี่ยง</th>
                  <th className="p-3 min-w-[150px] whitespace-nowrap">ผูกกับจุดน้ำท่วม</th>
                  <th className="p-3 min-w-[200px]">คำแนะนำการเดินทาง (ไป-กลับ)</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">พิกัด/โหนด</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">อัปเดต</th>
                  <th className="p-3 text-right min-w-[130px] whitespace-nowrap">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-body">
                {filteredDetours.map((item, idx) => {
                  const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
                  const ext = extractDirectionalAdvice(item.description || "");
                  const coordsCount = Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0;
                  const siblings = getReorderSiblings(item);
                  const groupPos = siblings.findIndex((d) => d.id === item.id);
                  const canMoveUp = groupPos > 0 && !reorderingId;
                  const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setViewingDetour(item)}
                      className={`hover:bg-slate-900/60 transition ${!item.is_active ? "opacity-50 bg-slate-950/40" : ""
                        }`}
                    >
                      <td className="p-3 text-center font-mono text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
                            checked={selectedDetourIds.has(item.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              setSelectedDetourIds((previous) => {
                                const next = new Set(previous);
                                if (event.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 accent-amber-500 rounded"
                          />
                          {idx + 1}
                        </div>
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="p-3 text-center whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item.id, item.is_active)}
                          className={`min-h-9 px-2.5 py-1 rounded-full text-[10px] font-heading font-bold border whitespace-nowrap transition cursor-pointer ${item.is_active
                              ? "bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                              : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                            }`}
                          title={item.is_active ? "คลิกเพื่อปิดใช้งานชั่วคราว" : "คลิกเพื่อเปิดใช้งาน"}
                        >
                          {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                        </button>
                      </td>

                      {/* Detour Name */}
                      <td className="p-3">
                        <div className="font-heading font-bold text-white text-xs flex items-center gap-1.5">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950" title="เส้นทางเลี่ยง">
                            <Route className="h-4 w-4" />
                          </span>
                          <div>
                            <span>{item.route_name}</span>
                            <span className="block text-[10px] font-normal text-sky-300 mt-0.5">
                              {item.direction_mode === "FORWARD_ONLY"
                                ? "→ เฉพาะขาไป (A → B)"
                                : item.direction_mode === "REVERSE_ONLY"
                                  ? "→ เฉพาะขากลับ (B → A)"
                                  : "⇄ เดินรถ ๒ ทิศทาง (A ⇄ B)"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Linked Flood Incident */}
                      <td className="p-3">
                        {linkedEvents.length > 0 ? (
                          <div className="space-y-1">
                            {linkedEvents.map((ev) => (
                              <div key={ev.eventId}>
                                <span className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded">
                                  ทล.{ev.routeNo}
                                </span>
                                <span className="block text-[11px] text-slate-200 mt-0.5 truncate max-w-[180px]" title={`${ev.sectionName}${ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}`}>
                                  {ev.sectionName}{ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">-- ไม่ได้ผูก --</span>
                        )}
                      </td>

                      {/* Directional Advice */}
                      <td className="p-3">
                        <div className="space-y-1">
                          {ext.hasBoth ? (
                            <>
                              <div className="text-[11px] text-amber-200 line-clamp-1" title={ext.forward}>
                                <span className="text-amber-400 font-bold">🚗 ขาไป:</span> {ext.forward}
                              </div>
                              <div className="text-[11px] text-sky-200 line-clamp-1" title={ext.reverse}>
                                <span className="text-sky-400 font-bold">🚙 ขากลับ:</span> {ext.reverse}
                              </div>
                            </>
                          ) : (
                            <div className="text-[11px] text-slate-300 line-clamp-2" title={item.description}>
                              {item.description || "-"}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Coordinates / Nodes */}
                      <td className="p-3 text-center font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        <div>{coordsCount} จุด</div>
                        {item.lat_start && item.lon_start && (
                          <div className="text-[9px] text-slate-400">
                            {item.lat_start.toFixed(2)}, {item.lon_start.toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Updated At */}
                      <td className="p-3 text-center text-[10px] text-slate-400 whitespace-nowrap">
                        {item.updated_at ? new Date(item.updated_at).toLocaleDateString("th-TH") : "-"}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {/* Move Order Up/Down */}
                          <button
                            type="button"
                            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
                            disabled={!canMoveUp}
                            onClick={() => handleMoveDetourOrder(item, "UP")}
                            title={`เลื่อนลำดับขึ้น (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
                            disabled={!canMoveDown}
                            onClick={() => handleMoveDetourOrder(item, "DOWN")}
                            title={`เลื่อนลำดับลง (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Focus on map */}
                          {item.lat_start && item.lon_start && onFocusCoordinates && (
                            <button
                              type="button"
                              aria-label={`ซูมไปยังทางเลี่ยง ${item.route_name} บนแผนที่`}
                              onClick={() => onFocusCoordinates([item.lon_start, item.lat_start])}
                              title="ซูมไปยังเส้นทางบนแผนที่"
                              className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}

                          {/* Link multiple events */}
                          <button
                            type="button"
                            aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
                            onClick={() => setLinkModalState({ mode: "BY_DETOUR", detourId: item.id })}
                            title="ผูกหลายเหตุการณ์ (Many-to-Many)"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-700/60 transition cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Quick Edit Modal */}
                          <button
                            type="button"
                            aria-label="แก้ไข"
                            onClick={() => handleOpenEditModal(item)}
                            title="แก้ไขรายละเอียด & คำแนะนำ"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            aria-label={`ลบทางเลี่ยง ${item.route_name}`}
                            onClick={() => handleDeleteDetour(item)}
                            title="ลบเส้นทางเลี่ยง"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {viewingDetour && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 backdrop-blur-sm p-2 sm:items-center sm:p-4" onClick={() => setViewingDetour(null)}>
          <div ref={viewingDialog.dialogRef} role="dialog" aria-modal="true" aria-label="รายละเอียดเส้นทางเลี่ยง" tabIndex={-1} onKeyDown={viewingDialog.onKeyDown} className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl space-y-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-heading font-black text-white flex items-center gap-2">
                  <Signpost className="w-5 h-5 text-amber-400" />
                  <span>{viewingDetour.route_name}</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {viewingDetour.direction_mode === "FORWARD_ONLY" ? "เฉพาะขาไป (A → B)" : viewingDetour.direction_mode === "REVERSE_ONLY" ? "เฉพาะขากลับ (B → A)" : viewingDetour.direction_mode === "TWO_WAY" ? "เดินรถ ๒ ทิศทาง (A ⇄ B)" : "ไม่ระบุทิศทาง (ต้องตรวจสอบ)"}
                </p>
              </div>
              <button type="button" aria-label="ปิดรายละเอียด" onClick={() => setViewingDetour(null)} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl p-2 hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <dt className="text-slate-400">สถานะการใช้งาน</dt>
                <dd className="font-bold text-white mt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${viewingDetour.is_active ? "bg-emerald-950 text-emerald-300 border border-emerald-600" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                    {viewingDetour.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                  </span>
                </dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-slate-400">จุดน้ำท่วมที่ผูกไว้</dt>
                  <button
                    type="button"
                    onClick={() => {
                      const detourId = viewingDetour.id;
                      setViewingDetour(null);
                      setLinkModalState({ mode: "BY_DETOUR", detourId });
                    }}
                    className="text-[11px] font-heading font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer"
                  >
                    จัดการความสัมพันธ์
                  </button>
                </div>
                <dd className="font-bold text-amber-300 mt-1 space-y-1">
                  {(() => {
                    const linkedEvents = linkedEventsByDetourId.get(viewingDetour.id) || [];
                    if (linkedEvents.length === 0) {
                      return "ทางเลี่ยงอิสระ (ไม่ผูกจุดน้ำท่วม)";
                    }
                    return linkedEvents.map((ev) => (
                      <div key={ev.eventId} className="text-xs text-amber-300">
                        • ทล.{ev.routeNo} {ev.sectionName}{ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                      </div>
                    ));
                  })()}
                </dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                <dt className="text-slate-400 font-sans">พิกัดจุด A (เริ่มต้น)</dt>
                <dd className="text-white mt-0.5">{viewingDetour.lat_start}, {viewingDetour.lon_start}</dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                <dt className="text-slate-400 font-sans">พิกัดจุด B (สิ้นสุด)</dt>
                <dd className="text-white mt-0.5">{viewingDetour.lat_end}, {viewingDetour.lon_end}</dd>
              </div>
            </dl>

            {/* Lightweight SVG Route Shape Mini-Map Preview */}
            {(() => {
              const rawCoords =
                viewingDetourDir === "REVERSE" &&
                Array.isArray(viewingDetour.reverse_coordinates_json) &&
                viewingDetour.reverse_coordinates_json.length >= 2
                  ? viewingDetour.reverse_coordinates_json
                  : viewingDetour.coordinates_json;
              const coords = Array.isArray(rawCoords)
                ? rawCoords.filter(
                    (pt): pt is [number, number] =>
                      Array.isArray(pt) &&
                      pt.length >= 2 &&
                      Number.isFinite(Number(pt[0])) &&
                      Number.isFinite(Number(pt[1]))
                  )
                : [];
              if (coords.length < 2) return null;
              const lats = coords.map((c) => Number(c[0]));
              const lons = coords.map((c) => Number(c[1]));
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);
              const minLon = Math.min(...lons);
              const maxLon = Math.max(...lons);
              const spanLat = Math.max(0.0005, maxLat - minLat);
              const spanLon = Math.max(0.0005, maxLon - minLon);
              const W = 280;
              const H = 88;
              const PAD = 14;
              const toPt = (lat: number, lon: number) => {
                const x = PAD + ((lon - minLon) / spanLon) * (W - PAD * 2);
                const y = H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);
                return [Number(x.toFixed(1)), Number(y.toFixed(1))];
              };
              const points = coords.map((c) => toPt(Number(c[0]), Number(c[1])));
              const polylineStr = points.map((p) => p.join(",")).join(" ");
              const startPt = points[0];
              const endPt = points[points.length - 1];
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>พรีวิวรูปทรงแนวเส้นทาง ({viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})</span>
                    <span className="font-mono">{coords.length} จุดพิกัด</span>
                  </div>
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="h-22 w-full rounded-lg bg-slate-900/90"
                    role="img"
                    aria-label={`แผนที่ย่อแนวเส้นทาง ${viewingDetour.route_name}`}
                  >
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylineStr}
                    />
                    <circle cx={startPt[0]} cy={startPt[1]} r="5" fill="#10b981" stroke="#0f172a" strokeWidth="1.5" />
                    <circle cx={endPt[0]} cy={endPt[1]} r="5" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.5" />
                  </svg>
                </div>
              );
            })()}

            {/* Directional Tabs for Turn-by-Turn Advice */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-heading font-bold text-amber-300">คำแนะนำการเดินทางทีละขั้นตอน:</span>
                <DirectionSwitch
                  size="sm"
                  ariaLabel="เลือกทิศทางคำแนะนำการเดินทาง"
                  value={viewingDetourDir}
                  onChange={setViewingDetourDir}
                  options={[
                    {
                      value: "FORWARD",
                      label: "ขาไป (A → B)",
                      ariaLabel: "ขาไป A → B",
                      disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "FORWARD"),
                    },
                    {
                      value: "REVERSE",
                      label: "ขากลับ (B → A)",
                      ariaLabel: "ขากลับ B → A",
                      disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "REVERSE"),
                    },
                  ]}
                />
              </div>
              {(() => {
                const fwdKm = calculatePolylineRoadDistanceKm(viewingDetour.coordinates_json);
                const revKm = calculatePolylineRoadDistanceKm(
                  viewingDetour.reverse_coordinates_json || viewingDetour.coordinates_json
                );
                const polyKm = viewingDetourDir === "REVERSE" ? revKm : fwdKm;
                const durSec = readDetourDurationSeconds(viewingDetour.detour_meta, viewingDetourDir);
                const durMin = durSec ? Math.max(1, Math.round(durSec / 60)) : null;
                return (
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Route className="w-3.5 h-3.5 text-amber-300" />
                      <span>ระยะทางตามแนวเส้น:</span>
                      <strong className="text-white font-mono">
                        {polyKm > 0 ? `${polyKm.toFixed(1)} กม.` : "ไม่ระบุ"}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-300" />
                      <span>เวลาโดยประมาณ:</span>
                      <strong className="text-white font-mono">
                        {durMin ? `ประมาณ ${durMin} นาที` : "ยังไม่มีข้อมูลเวลาเดินทาง"}
                      </strong>
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const ext = extractDirectionalAdvice(viewingDetour.description || "");
                const parsed = splitDetourAdviceByDirection(viewingDetour.description || "", viewingDetour.direction_mode);
                const adviceText =
                  ext.hasBoth && viewingDetour.direction_mode !== "FORWARD_ONLY" && viewingDetour.direction_mode !== "REVERSE_ONLY"
                    ? viewingDetourDir === "FORWARD"
                      ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                      : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                    : viewingDetourDir === "FORWARD"
                      ? parsed.forwardText
                      : parsed.reverseText;
                return (
                  <div className="rounded-xl border border-amber-500/20 bg-slate-950/80 p-3 text-xs text-amber-100/95 leading-relaxed max-h-48 overflow-y-auto font-sans">
                    {adviceText ? <AdviceText text={adviceText} /> : "ไม่มีคำแนะนำการเดินทางเฉพาะทิศทาง"}
                  </div>
                );
              })()}
            </div>

            {/* Google Maps Test Navigation */}
            {(() => {
              const nav = resolveDetourGoogleMapsNavigation(viewingDetour, viewingDetourDir, floodList);
              return (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-heading text-slate-300">
                      {nav.source === "APPROVED_URL" ? "✅ ใช้ลิงก์ที่เจ้าหน้าที่อนุมัติไว้" : "🧭 สร้างเส้นทางและจุดผ่านทางอัตโนมัติ"}
                    </span>
                    {nav.isValid && nav.url ? (
                      <a
                        href={nav.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 shadow transition"
                      >
                        <Navigation className="w-3.5 h-3.5" aria-hidden="true" /> ทดสอบเปิด Google Maps ({viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})
                      </a>
                    ) : (
                      <span className="text-xs text-rose-400 font-medium">⚠️ {nav.warning}</span>
                    )}
                  </div>
                  {nav.disclaimer && <p className="text-[10px] text-slate-400">{nav.disclaimer}</p>}
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-800 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const item = viewingDetour;
                  setViewingDetour(null);
                  handleOpenEditModal(item);
                }}
                className="min-h-10 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-heading font-bold text-slate-950 transition"
              >
                แก้ไขข้อมูล
              </button>
              <button
                type="button"
                onClick={() => {
                  const item = viewingDetour;
                  setViewingDetour(null);
                  handleDeleteDetour(item);
                }}
                className="min-h-10 rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900 px-4 py-2 text-xs font-heading font-bold text-rose-300 transition"
              >
                ลบทางเลี่ยง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Quick Detour Editor */}
      {editingDetour && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div ref={editingDialog.dialogRef} role="dialog" aria-modal="true" aria-label="แก้ไขข้อมูลเส้นทางเลี่ยง" tabIndex={-1} onKeyDown={editingDialog.onKeyDown} className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
                  <Signpost className="w-5 h-5 text-amber-400" />
                  <span>แก้ไขข้อมูลเส้นทางเลี่ยงน้ำท่วม</span>
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingDetour(null)}
                aria-label="ปิดหน้าต่างแก้ไขเส้นทางเลี่ยง"
                className="min-h-10 min-w-10 inline-flex items-center justify-center p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5 text-xs">
              {/* Row 1: Name & Linked Flood */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-detour-name-input" className="text-slate-300 block mb-1">ชื่อเส้นทางเลี่ยง *</label>
                  <input
                    id="edit-detour-name-input"
                    type="text"
                    value={editDetourName}
                    onChange={(e) => setEditDetourName(e.target.value)}
                    placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
                  />
                </div>

                <div>
                  <label htmlFor="edit-detour-ref-select" className="text-slate-300 block mb-1">ผูกกับจุดน้ำท่วมอ้างอิง</label>
                  <select
                    id="edit-detour-ref-select"
                    value={editDetourRefId}
                    onChange={(e) => setEditDetourRefId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {floodList.map((f) => (
                      <option key={f.id} value={f.id}>
                        ทล.{f.route_no} - {f.section_name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-sky-300/90 leading-snug">
                    ช่องนี้เป็นจุดน้ำท่วมอ้างอิงเดิม (Legacy) การผูกหลายเหตุการณ์สามารถจัดการได้อย่างปลอดภัยผ่านปุ่ม &quot;จัดการความสัมพันธ์ (หลายจุด)&quot; โดยไม่ถูกหน้านี้เขียนทับ
                  </p>
                </div>
              </div>

              {/* Row 2: Directional Advice Header & Switch Tabs */}
              <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="edit-detour-advice-textarea" className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5" />
                      <span>คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน</span>
                    </label>
                    <DirectionSwitch
                      size="sm"
                      ariaLabel="เลือกมุมมองทิศทางคำแนะนำ"
                      value={editDetourAdviceView}
                      onChange={setEditDetourAdviceView}
                      options={[
                        { value: "FORWARD", label: "ขาไป (A → B)", ariaLabel: "ขาไป A → B" },
                        { value: "REVERSE", label: "ขากลับ (B → A)", ariaLabel: "ขากลับ B → A" },
                        { value: "COMBINED", label: "ทั้ง ๒ ทิศทาง", ariaLabel: "ทั้ง ๒ ทิศทาง" },
                      ]}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAdviceInModal}
                    className="min-h-10 text-xs bg-amber-500 text-slate-950 font-heading font-bold px-3 py-2 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> วิเคราะห์คำแนะนำอัตโนมัติ
                  </button>
                </div>

                {(() => {
                  const editParts = extractDirectionalAdviceForEdit(editDetourDesc);
                  return (
                    <textarea
                      id="edit-detour-advice-textarea"
                      rows={8}
                      value={
                        editDetourAdviceView === "FORWARD"
                          ? editParts.forward
                          : editDetourAdviceView === "REVERSE"
                            ? editParts.reverse
                            : editDetourDesc
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (editDetourAdviceView === "FORWARD" || editDetourAdviceView === "REVERSE") {
                          const forwardText = editDetourAdviceView === "FORWARD" ? val : editParts.forward;
                          const reverseText = editDetourAdviceView === "REVERSE" ? val : editParts.reverse;
                          setEditDetourDesc(
                            composeDirectionalAdvice(
                              editParts.forwardHeader,
                              forwardText,
                              editParts.reverseHeader,
                              reverseText
                            )
                          );
                        } else {
                          setEditDetourDesc(val);
                        }
                      }}
                      placeholder="กรอกคำแนะนำการเดินทาง หรือกด 'วิเคราะห์คำแนะนำอัตโนมัติ'..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
                    />
                  );
                })()}
              </div>

              {/* Row 2.2: Estimated Duration (Minutes) + Polyline Distance Preview */}
              {(() => {
                const fwdKm = calculatePolylineRoadDistanceKm(editingDetour.coordinates_json);
                const revKm = calculatePolylineRoadDistanceKm(
                  editingDetour.reverse_coordinates_json || editingDetour.coordinates_json
                );
                return (
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-heading font-bold text-sky-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>เวลาเดินทางโดยประมาณสำหรับประชาชน (นาที)</span>
                      </span>
                      {fwdKm > 0 && (
                        <span className="text-[11px] text-amber-200 font-mono">
                          ระยะทางเส้นจริง: ขาไป {fwdKm.toFixed(1)} กม.
                          {editingDetour.direction_mode === "TWO_WAY" && revKm > 0 ? ` · ขากลับ ${revKm.toFixed(1)} กม.` : ""}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="edit-detour-duration-fwd" className="text-[11px] text-slate-300 block mb-1">
                          เวลาโดยประมาณ ขาไป (A → B) (นาที):
                        </label>
                        <input
                          id="edit-detour-duration-fwd"
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          disabled={editingDetour.direction_mode === "REVERSE_ONLY"}
                          value={editDetourDurationMinFwd}
                          onChange={(e) => setEditDetourDurationMinFwd(e.target.value)}
                          placeholder="เช่น 25"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-detour-duration-rev" className="text-[11px] text-slate-300 block mb-1">
                          เวลาโดยประมาณ ขากลับ (B → A) (นาที):
                        </label>
                        <input
                          id="edit-detour-duration-rev"
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          disabled={editingDetour.direction_mode === "FORWARD_ONLY"}
                          value={editDetourDurationMinRev}
                          onChange={(e) => setEditDetourDurationMinRev(e.target.value)}
                          placeholder="เช่น 25"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Row 2.4: Point A & Point B Entrance Photos */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    <span>ภาพทางเข้าเส้นทางเลี่ยงบนแผนที่ (จุดเริ่มต้น A / จุดสิ้นสุด B)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">แสดงหมุดกล้องบนแผนที่เมื่อคลิก</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-heading font-bold text-emerald-300">จุดเริ่มต้น A (ขาไป A → B)</span>
                      <label className="cursor-pointer rounded-md border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-heading font-bold text-emerald-200 transition">
                        {editDetourStartPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดเริ่ม A"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="แนบภาพจุดเริ่มต้น A"
                          className="sr-only"
                          onChange={(e) => handleEditPointPhotoUpload("START", e)}
                        />
                      </label>
                    </div>
                    {editDetourStartPhotoUrl && (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <img
                            src={normalizeMediaUrl(editDetourStartPhotoUrl)}
                            alt="ภาพทางเข้าจุดเริ่มต้น A"
                            className="h-24 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditDetourStartPhotoUrl("");
                              setEditDetourStartPhotoCaption("");
                            }}
                            aria-label="ลบภาพจุดเริ่มต้น A"
                            className="absolute top-1 right-1 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          aria-label="คำอธิบายภาพจุดเริ่มต้น A"
                          value={editDetourStartPhotoCaption}
                          onChange={(e) => setEditDetourStartPhotoCaption(e.target.value)}
                          placeholder="คำอธิบายทางเข้าจุดเริ่ม A..."
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-heading font-bold text-sky-300">จุดสิ้นสุด B (ขากลับ B → A)</span>
                      <label className="cursor-pointer rounded-md border border-sky-700/70 bg-sky-950/40 hover:bg-sky-900/60 px-2 py-0.5 text-[10px] font-heading font-bold text-sky-200 transition">
                        {editDetourEndPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดสิ้นสุด B"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="แนบภาพจุดสิ้นสุด B"
                          className="sr-only"
                          onChange={(e) => handleEditPointPhotoUpload("END", e)}
                        />
                      </label>
                    </div>
                    {editDetourEndPhotoUrl && (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <img
                            src={normalizeMediaUrl(editDetourEndPhotoUrl)}
                            alt="ภาพทางเข้าจุดสิ้นสุด B"
                            className="h-24 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditDetourEndPhotoUrl("");
                              setEditDetourEndPhotoCaption("");
                            }}
                            aria-label="ลบภาพจุดสิ้นสุด B"
                            className="absolute top-1 right-1 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          aria-label="คำอธิบายภาพจุดสิ้นสุด B"
                          value={editDetourEndPhotoCaption}
                          onChange={(e) => setEditDetourEndPhotoCaption(e.target.value)}
                          placeholder="คำอธิบายทางเข้าจุดสิ้นสุด B (ฝั่งขากลับ)..."
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2.5: Approved Google Maps Navigation URLs */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-heading font-bold text-emerald-400 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Google Maps URL ที่เจ้าหน้าที่ตรวจสอบและอนุมัติแล้ว (Optional)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">ถ้ามี จะใช้นำทางแทนการคำนวณอัตโนมัติ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="edit-detour-gmaps-url-fwd" className="text-[11px] text-slate-300 block mb-1">ลิงก์ขาไป (A → B):</label>
                    <input
                      id="edit-detour-gmaps-url-fwd"
                      type="url"
                      value={editDetourGoogleMapsUrlFwd}
                      onChange={(e) => setEditDetourGoogleMapsUrlFwd(e.target.value)}
                      placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-detour-gmaps-url-rev" className="text-[11px] text-slate-300 block mb-1">ลิงก์ขากลับ (B → A):</label>
                    <input
                      id="edit-detour-gmaps-url-rev"
                      type="url"
                      value={editDetourGoogleMapsUrlRev}
                      onChange={(e) => setEditDetourGoogleMapsUrlRev(e.target.value)}
                      placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Road Condition */}
              <div>
                <label htmlFor="edit-detour-road-condition" className="text-slate-300 block mb-1">สภาพผิวทาง (Road Surface Condition)</label>
                <input
                  id="edit-detour-road-condition"
                  type="text"
                  value={editDetourRoadCondition}
                  onChange={(e) => setEditDetourRoadCondition(e.target.value)}
                  placeholder="เช่น ผิวทางลาดยาง สัญจรได้ตามปกติ หรือ ทางลูกรัง/หินคลุก"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Row 3: Active Status Switch */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-heading font-bold text-white block">
                    สถานะการเปิดใช้งาน (Active Status)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    เปิดเพื่อให้เส้นทางเลี่ยงนี้ปรากฏบนแผนที่ของประชาชน
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label="เปิดใช้งานเส้นทางเลี่ยง"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Action Link to Redraw Path on Map */}
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-300 block font-heading">
                    ต้องการวาดหรือดัดแนวเส้นทางบนแผนที่?
                  </span>
                  <span className="text-[11px] text-slate-400">
                    สลับไปยังแท็บ &quot;จัดการแผนที่&quot; เพื่อลากหมุดและเกาะถนนจริง (Dual-Source Snapping)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const id = editingDetour.id;
                    setEditingDetour(null);
                    onEditDetourOnMap(id);
                  }}
                  className="min-h-10 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 px-3 py-2 rounded-xl font-heading text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  <span>เปิดเครื่องมือวาดแผนที่</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingDetour(null)}
                className="min-h-10 bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveModal}
                className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>{isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <EventDetourLinkModal
        isOpen={Boolean(linkModalState)}
        initialMode={linkModalState?.mode || "BY_DETOUR"}
        initialEventId={linkModalState?.eventId}
        initialDetourId={linkModalState?.detourId}
        systemData={systemData}
        onDataRefresh={onDataRefresh}
        onClose={() => setLinkModalState(null)}
        onToast={onToast}
      />
    </div>
  );
}
