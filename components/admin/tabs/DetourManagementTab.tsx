"use client";

import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  Signpost, Plus, FileText, Search, CheckCircle2, XCircle,
  ArrowRightLeft, Route, Link2,
} from "lucide-react";
import { EventDetourLinkModal } from "@/components/admin/EventDetourLinkModal";
import { GisExportFormat } from "@/lib/gis-export";
import { useDetourManagement } from "./useDetourManagement";
import { DetourListSection } from "./DetourListCard";
import { DetourEditModal } from "./DetourEditModal";
import { DetourViewModal } from "./DetourViewModal";

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
        <div className="bg-surface-card border border-surface p-3 rounded-2xl">
          <span className="text-xs leading-snug tracking-normal text-slate-400 block font-heading">เส้นทางเลี่ยงทั้งหมด</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-0.5 block">
            {totalCount}
          </span>
          <span className="text-[11px] text-slate-400">โครงข่ายทางเลี่ยงในระบบ</span>
        </div>

        <div className="bg-surface-card border border-surface p-3 rounded-2xl">
          <span className="text-xs leading-snug tracking-normal text-slate-400 block font-heading">เปิดใช้งาน (Active)</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-0.5 block">
            {activeCount}
          </span>
          <span className="text-[11px] text-emerald-500/80">แสดงบนแผนที่ประชาชน</span>
        </div>

        <div className="bg-surface-card border border-surface p-3 rounded-2xl">
          <span className="text-xs leading-snug tracking-normal text-slate-400 block font-heading">ปิดชั่วคราว</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-400 mt-0.5 block">
            {inactiveCount}
          </span>
          <span className="text-[11px] text-slate-400">ซ่อนจากการแสดงผล</span>
        </div>

        <div className="bg-surface-card border border-surface p-3 rounded-2xl">
          <span className="text-xs leading-snug tracking-normal text-slate-400 block font-heading">ผูกกับจุดน้ำท่วม</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-sky-400 mt-0.5 block">
            {new Set(Array.from(linkedEventsByDetourId.values()).flatMap((evs) => evs.map((e) => e.eventId))).size}
          </span>
          <span className="text-[11px] text-sky-400/80">เหตุการณ์ที่มีเส้นทางเลี่ยง</span>
        </div>
      </div>

      {/* 2. Top Action Bar: Search, Filters & Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-panel p-3.5 rounded-2xl border border-surface">
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
              className="min-h-10 w-full bg-surface-card border border-surface rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Status Filter */}
          <select
            aria-label="กรองตามสถานะทางเลี่ยง"
            value={detourFilter}
            onChange={(e: any) => setDetourFilter(e.target.value)}
            className="min-h-10 bg-surface-card border border-surface text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading tracking-normal"
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
            className="min-h-10 bg-surface-card border border-surface text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading tracking-normal max-w-[200px] truncate"
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
              className="min-h-10 rounded-xl border border-surface bg-surface-card hover:bg-slate-800 px-3 text-xs text-slate-300 hover:text-white transition cursor-pointer"
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
            className="min-h-10 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/50 font-heading font-bold tracking-normal text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>จัดการความสัมพันธ์ (หลายจุด)</span>
          </button>
          <label className="flex items-center gap-1.5 rounded-xl border border-surface bg-surface-card px-2 text-xs text-slate-200">
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
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold tracking-normal text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>วาดทางเลี่ยงใหม่บนแผนที่</span>
          </button>
        </div>
      </div>

      {/* 3. Detour Routes Data Table */}
      <DetourListSection
        filteredDetours={filteredDetours}
        linkedEventsByDetourId={linkedEventsByDetourId}
        getReorderSiblings={getReorderSiblings}
        reorderingId={reorderingId}
        autoTableRef={autoTableRef}
        tableLayoutMode={tableLayoutMode}
        selectedDetourIds={selectedDetourIds}
        onToggleSelect={(detourId, checked) =>
          setSelectedDetourIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(detourId);
            else next.delete(detourId);
            return next;
          })
        }
        onToggleStatus={handleToggleStatus}
        onViewDetour={setViewingDetour}
        onMoveOrder={handleMoveDetourOrder}
        onFocusCoordinates={onFocusCoordinates}
        onOpenLinkModal={(detourId) => setLinkModalState({ mode: "BY_DETOUR", detourId })}
        onOpenEditModal={handleOpenEditModal}
        onDeleteDetour={handleDeleteDetour}
        onAddDetour={onAddDetour}
      />

      <DetourViewModal
        viewingDetour={viewingDetour}
        viewingDetourDir={viewingDetourDir}
        setViewingDetourDir={setViewingDetourDir}
        linkedEventsByDetourId={linkedEventsByDetourId}
        floodList={floodList}
        dialog={viewingDialog}
        onClose={() => setViewingDetour(null)}
        onManageLinks={(detourId) => setLinkModalState({ mode: "BY_DETOUR", detourId })}
        onEdit={handleOpenEditModal}
        onDelete={handleDeleteDetour}
      />

      {/* 4. Modal: Quick Detour Editor */}
      <DetourEditModal
        editingDetour={editingDetour}
        floodList={floodList}
        dialog={editingDialog}
        editDetourName={editDetourName}
        setEditDetourName={setEditDetourName}
        editDetourRefId={editDetourRefId}
        setEditDetourRefId={setEditDetourRefId}
        editDetourDesc={editDetourDesc}
        setEditDetourDesc={setEditDetourDesc}
        editDetourAdviceView={editDetourAdviceView}
        setEditDetourAdviceView={setEditDetourAdviceView}
        editDetourGoogleMapsUrlFwd={editDetourGoogleMapsUrlFwd}
        setEditDetourGoogleMapsUrlFwd={setEditDetourGoogleMapsUrlFwd}
        editDetourGoogleMapsUrlRev={editDetourGoogleMapsUrlRev}
        setEditDetourGoogleMapsUrlRev={setEditDetourGoogleMapsUrlRev}
        editDetourDurationMinFwd={editDetourDurationMinFwd}
        setEditDetourDurationMinFwd={setEditDetourDurationMinFwd}
        editDetourDurationMinRev={editDetourDurationMinRev}
        setEditDetourDurationMinRev={setEditDetourDurationMinRev}
        editDetourStartPhotoUrl={editDetourStartPhotoUrl}
        setEditDetourStartPhotoUrl={setEditDetourStartPhotoUrl}
        editDetourStartPhotoCaption={editDetourStartPhotoCaption}
        setEditDetourStartPhotoCaption={setEditDetourStartPhotoCaption}
        editDetourEndPhotoUrl={editDetourEndPhotoUrl}
        setEditDetourEndPhotoUrl={setEditDetourEndPhotoUrl}
        editDetourEndPhotoCaption={editDetourEndPhotoCaption}
        setEditDetourEndPhotoCaption={setEditDetourEndPhotoCaption}
        editDetourRoadCondition={editDetourRoadCondition}
        setEditDetourRoadCondition={setEditDetourRoadCondition}
        editIsActive={editIsActive}
        setEditIsActive={setEditIsActive}
        isSubmitting={isSubmitting}
        onClose={() => setEditingDetour(null)}
        onGenerateAdvice={handleGenerateAdviceInModal}
        onPointPhotoUpload={handleEditPointPhotoUpload}
        onEditOnMap={onEditDetourOnMap}
        onSave={handleSaveModal}
      />

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
