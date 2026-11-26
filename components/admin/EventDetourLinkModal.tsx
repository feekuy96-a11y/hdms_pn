"use client";

import workspace from "./AdminWorkspace.module.css";
import { useAdminMotionPresence } from "./useAdminMotionPresence";

import React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { SystemDataPayload } from "@/db/default-data";
import {
  getEventSupportedRecommendedDirections,
  getRecommendationReviewBlockers,
  isDetourDirectionAllowed,
  recommendationToLinkStatus,
  resolveDefaultDetourDirection,
  resolveDefaultEventDirection,
  type DetourTravelDirection,
  type EventDetourLink,
  type EventTravelDirection,
  type LinkStatusMode,
} from "@/lib/event-detour-links";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import { useEventDetourLinkModal } from "./useEventDetourLinkModal";

interface EventDetourLinkModalProps {
  isOpen: boolean;
  initialMode?: "BY_EVENT" | "BY_DETOUR";
  initialEventId?: string;
  initialDetourId?: string;
  systemData: SystemDataPayload;
  onDataRefresh?: (data?: any) => Promise<any> | void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const EVENT_DIRECTION_LABELS: Record<EventTravelDirection, string> = {
  BOTH: "๒ ทิศทาง (ไป-กลับ A ⇄ B)",
  A_TO_B: "ขาไปตามหลัก กม. (A → B)",
  B_TO_A: "ขากลับย้อนหลัก กม. (B → A)",
  UNKNOWN: "ยังไม่ระบุทิศทางเหตุการณ์",
};

const DETOUR_DIRECTION_LABELS: Record<DetourTravelDirection, string> = {
  TWO_WAY: "๒ ทิศทาง (A ⇄ B)",
  FORWARD: "ขาไปของทางเลี่ยง (A → B)",
  REVERSE: "ขากลับของทางเลี่ยง (B → A)",
  UNKNOWN: "ยังไม่ระบุทิศทางทางเลี่ยง",
};

const STATUS_MODE_LABELS: Record<LinkStatusMode, string> = {
  ACTIVE: "ใช้งาน",
  INACTIVE: "ไม่ใช้งาน",
};

function getDetourModeLabel(mode?: string): string {
  if (mode === "FORWARD_ONLY") return "เฉพาะขาไป (A → B)";
  if (mode === "REVERSE_ONLY") return "เฉพาะขากลับ (B → A)";
  if (mode === "TWO_WAY") return "๒ ทิศทาง (A ⇄ B)";
  return "ไม่ระบุทิศทาง";
}

export function EventDetourLinkModal({
  isOpen,
  initialMode = "BY_EVENT",
  initialEventId,
  initialDetourId,
  systemData,
  onDataRefresh,
  onClose,
  onToast,
}: EventDetourLinkModalProps) {
  const dialog = useModalAccessibility(isOpen, onClose);
  const present = useAdminMotionPresence(isOpen);
  const {
    parentEvents,
    detourList,
    detourMap,
    mode,
    setMode,
    selectedEventId,
    setSelectedEventId,
    selectedDetourId,
    setSelectedDetourId,
    eventLoading,
    eventError,
    eventVersion,
    draftLinks,
    detourSearch,
    setDetourSearch,
    addEventDirection,
    setAddEventDirection,
    byDetourLoading,
    byDetourError,
    eventStates,
    byDetourDrafts,
    setByDetourDrafts,
    isSaving,
    saveError,
    setSaveError,
    verifiedNotice,
    setVerifiedNotice,
    readySession,
    selectedEvent,
    selectedEventSupportedDirs,
    loadSingleEvent,
    loadAllEventsForDetourMode,
    handleAddDetourToEvent,
    handleRemoveLink,
    handleMoveLink,
    handleUpdateLink,
    handleSaveByEvent,
    handleSaveByDetour,
    filteredAvailableDetours,
    selectedDetour,
  } = useEventDetourLinkModal({
    isOpen,
    initialMode,
    initialEventId,
    initialDetourId,
    systemData,
    onDataRefresh,
    onClose,
    onToast,
  });

  if (!present) return null;

  return (
    <div
      className={`${workspace.backdrop} fixed inset-0 z-[1050] flex items-end justify-center p-2 sm:items-center sm:p-4 [@media(max-height:540px)]:p-2`}
      data-motion-open={isOpen}
      inert={!isOpen}
      aria-hidden={isOpen ? undefined : true}
      onClick={onClose}
    >
      <div
        ref={dialog.dialogRef}
        role="dialog"
        data-hdms-popup="panel"
        aria-modal="true"
        aria-label="จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง"
        tabIndex={-1}
        onKeyDown={dialog.onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={`${workspace.ranked} flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border sm:max-h-[min(92dvh,calc(100dvh-2rem))] [@media(max-height:540px)]:max-h-[calc(100dvh-1rem)]`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/70 px-3 py-2 sm:px-6 sm:py-3.5 [@media(max-height:540px)]:py-1">
          <div className="min-w-0">
            <h2 className="font-heading font-black text-base sm:text-lg text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-400 shrink-0" />
              <span>เชื่อมเหตุการณ์กับทางเลี่ยง</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 [@media(max-height:540px)]:hidden">
              เลือกเหตุการณ์ จัดอันดับทางเลี่ยง แล้วบันทึกการเชื่อมโยง
            </p>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่างจัดการความสัมพันธ์" data-hdms-popup-close
            onClick={onClose}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div role="group" aria-label="มุมมองการเชื่อมโยง"
          className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-slate-800/80 bg-slate-900/40 px-3 py-2 sm:flex sm:px-6 [@media(max-height:540px)]:py-1">
          <button
            type="button"
            onClick={() => {
              setMode("BY_EVENT");
              setSaveError(null);
              setVerifiedNotice(null);
            }}
            aria-pressed={mode === "BY_EVENT"}
            className={`min-h-11 px-2.5 rounded-xl text-xs sm:px-3.5 font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              mode === "BY_EVENT"
                ? "bg-amber-500 text-slate-950 shadow"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800"
            }`}
          >
            จัดการตามเหตุการณ์
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("BY_DETOUR");
              setSaveError(null);
              setVerifiedNotice(null);
            }}
            aria-pressed={mode === "BY_DETOUR"}
            className={`min-h-11 px-2.5 rounded-xl text-xs sm:px-3.5 font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              mode === "BY_DETOUR"
                ? "bg-amber-500 text-slate-950 shadow"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800"
            }`}
          >
            ผูกตามทางเลี่ยง
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div role="region" aria-label="รายละเอียดการเชื่อมโยง"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 text-xs sm:p-6 [@media(max-height:540px)]:py-2">
          {/* Status Feedback Banners */}
          {saveError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/60 bg-rose-950/60 p-3 text-rose-200 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  mode === "BY_EVENT"
                    ? void loadSingleEvent(selectedEventId)
                    : void loadAllEventsForDetourMode(selectedDetourId)
                }
                className="min-h-9 px-3 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white font-heading font-bold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> ลองโหลดใหม่
              </button>
            </div>
          )}

          {verifiedNotice && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3 text-emerald-200 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-heading font-bold">{verifiedNotice}</span>
            </div>
          )}

          {mode === "BY_EVENT" ? (
            <div className="space-y-4">
              {/* Event Selector + Version */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="flex-1 min-w-0 space-y-1">
                  <label htmlFor="select-flood-event" className="block text-slate-300 font-heading font-bold">
                    เลือกเหตุการณ์น้ำท่วมหลัก
                  </label>
                  <select
                    id="select-flood-event"
                    aria-label="เลือกเหตุการณ์น้ำท่วม"
                    value={selectedEventId}
                    onChange={(e) => {
                      setSelectedEventId(e.target.value);
                      setVerifiedNotice(null);
                      setSaveError(null);
                    }}
                    className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    {parentEvents.length === 0 ? (
                      <option value="">-- ไม่มีเหตุการณ์น้ำท่วมในระบบ --</option>
                    ) : (
                      parentEvents.map((ev) => (
                        <option key={ev.eventId} value={ev.eventId}>
                          ทล.{ev.routeNo} · {ev.sectionName || ev.eventTitle}{ev.kmRangeLabel ? ` · ${ev.kmRangeLabel}` : ""} ({ev.segments.length} ช่วง)
                        </option>
                      ))
                    )}
                  </select>
                  {selectedEvent?.kmRangeLabel && (
                    <p className="text-[11px] text-amber-300/90 font-mono">
                      ช่วงหลักกิโลเมตร: {selectedEvent.kmRangeLabel} ({selectedEvent.segments.length} ช่วง)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="min-h-10 inline-flex items-center px-3 rounded-xl bg-sky-950/80 border border-sky-700/60 text-sky-300 font-mono font-bold">
                    เวอร์ชันข้อมูล v{eventVersion}
                  </span>
                </div>
              </div>

              {/* Linked Detours List */}
              {eventLoading ? (
                <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-2 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span>กำลังโหลดความสัมพันธ์จากฐานข้อมูล...</span>
                </div>
              ) : eventError ? (
                <div className="p-6 rounded-2xl border border-rose-500/50 bg-rose-950/30 text-center space-y-3">
                  <p className="text-rose-300 font-heading font-bold">{eventError}</p>
                  <button
                    type="button"
                    onClick={() => void loadSingleEvent(selectedEventId)}
                    className="min-h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-heading font-bold inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" /> ลองโหลดใหม่
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-white">
                      ทางเลี่ยงที่เชื่อมโยงกับเหตุการณ์นี้ ({new Set(draftLinks.map((link) => link.detourId)).size} เส้น)
                    </h3>
                    <p className="mt-0.5 leading-snug text-slate-400">อันดับเดียวต่อเส้น ไม่ขึ้นอยู่กับทิศทาง ใช้ลูกศรขึ้นหรือลงเพื่อจัดอันดับ</p>
                  </div>

                  {draftLinks.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/80 text-center text-slate-400">
                      ยังไม่มีทางเลี่ยงที่ผูกกับเหตุการณ์นี้ — สามารถเลือกเพิ่มได้จากรายการด้านล่าง
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {draftLinks.map((link) => {
                        const detour = detourMap.get(link.detourId);
                        const detourName = detour?.route_name || link.detourId;
                        const rank = link.eventPosition ?? 1;
                        const count = new Set(draftLinks.map((row) => row.detourId)).size;
                        const isFirstDirection = draftLinks.find((row) => row.detourId === link.detourId) === link;
                        const canUp = rank > 1;
                        const canDown = rank < count;
                        const statusMode = recommendationToLinkStatus(link.recommendation);
                        const blockers = getRecommendationReviewBlockers(
                          { ...link, recommendation: "RECOMMENDED" },
                          detour,
                          selectedEventSupportedDirs
                        );

                        return (
                          <div
                            key={`${link.eventDirection}::${link.detourId}`}
                            className="min-w-0 space-y-2.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-2.5 sm:p-3.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${isFirstDirection ? "bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/35" : "bg-slate-800 text-slate-300"}`}>
                                  {isFirstDirection ? `อันดับ ${rank}` : "ทิศเพิ่มเติม"}
                                </span>
                                <span className="min-w-0 break-words font-heading text-sm font-bold text-white">
                                  {detourName}
                                </span>
                                {detour && !detour.is_active && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                    ปิดชั่วคราว
                                  </span>
                                )}
                                {detour && (
                                  <span className="text-[11px] text-sky-300">
                                    ({getDetourModeLabel(detour.direction_mode)})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isFirstDirection && <button
                                  type="button"
                                  aria-label={`เลื่อนลำดับ ${detourName} ขึ้น`}
                                  disabled={!canUp}
                                  onClick={() =>
                                    handleMoveLink(link.detourId, "UP")
                                  }
                                  className="min-h-11 min-w-11 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed"
                                  title="เลื่อนลำดับขึ้น"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>}
                                {isFirstDirection && <button
                                  type="button"
                                  aria-label={`เลื่อนลำดับ ${detourName} ลง`}
                                  disabled={!canDown}
                                  onClick={() =>
                                    handleMoveLink(link.detourId, "DOWN")
                                  }
                                  className="min-h-11 min-w-11 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed"
                                  title="เลื่อนลำดับลง"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>}
                                <button
                                  type="button"
                                  aria-label={`นำทางเลี่ยง ${detourName} ออกจากเหตุการณ์`}
                                  onClick={() =>
                                    handleRemoveLink(link.detourId, link.eventDirection)
                                  }
                                  className="min-h-11 min-w-11 flex items-center justify-center rounded-xl border border-rose-800/60 bg-rose-950/50 hover:bg-rose-900 text-rose-300"
                                  title="นำออกจากเหตุการณ์"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางเหตุการณ์
                                </label>
                                <select
                                  aria-label={`ทิศทางเหตุการณ์ของ ${detourName}`}
                                  value={link.eventDirection}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      eventDirection: e.target.value as EventTravelDirection,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                                    <option key={dir} value={dir}>
                                      {EVENT_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางทางเลี่ยง
                                </label>
                                <select
                                  aria-label={`ทิศทางทางเลี่ยงของ ${detourName}`}
                                  value={link.detourDirection}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      detourDirection: e.target.value as DetourTravelDirection,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["TWO_WAY", "FORWARD", "REVERSE", "UNKNOWN"] as const).map((dir) => (
                                    <option
                                      key={dir}
                                      value={dir}
                                      disabled={
                                        detour
                                          ? !isDetourDirectionAllowed(dir, detour.direction_mode)
                                          : false
                                      }
                                    >
                                      {DETOUR_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  สถานะ
                                </label>
                                <select
                                  aria-label={`สถานะของ ${detourName}`}
                                  value={statusMode}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      statusMode: e.target.value as LinkStatusMode,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["ACTIVE", "INACTIVE"] as const).map((modeOpt) => (
                                    <option key={modeOpt} value={modeOpt}>
                                      {STATUS_MODE_LABELS[modeOpt]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {statusMode === "ACTIVE" && blockers.length > 0 && (
                              <p className="text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                                หมายเหตุ: {blockers.join(" · ")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Detour Section */}
                  <div className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                    <h3 className="font-heading font-bold text-sm text-amber-300 flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> เพิ่มทางเลี่ยงเข้าในเหตุการณ์นี้
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          aria-label="ค้นหาทางเลี่ยงเพื่อผูกกับเหตุการณ์"
                          placeholder="ค้นหาชื่อเส้นทางเลี่ยง..."
                          value={detourSearch}
                          onChange={(e) => setDetourSearch(e.target.value)}
                          className="w-full min-h-10 bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-slate-500"
                        />
                      </div>
                      <select
                        aria-label="ทิศทางเหตุการณ์ที่จะเพิ่ม"
                        value={addEventDirection}
                        onChange={(e) =>
                          setAddEventDirection(e.target.value as EventTravelDirection)
                        }
                        className="w-full min-h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs text-white"
                      >
                        {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                          <option key={dir} value={dir}>
                            เพิ่มสำหรับ {EVENT_DIRECTION_LABELS[dir]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 sm:max-h-52 sm:overflow-y-auto sm:pr-1 [@media(max-height:540px)]:max-h-none [@media(max-height:540px)]:overflow-visible">
                      {filteredAvailableDetours.length === 0 ? (
                        <p className="text-slate-400 py-2 text-center">ไม่พบทางเลี่ยงที่ค้นหา</p>
                      ) : (
                        filteredAvailableDetours.map((d) => {
                          const alreadyInDir = draftLinks.some(
                            (l) => l.detourId === d.id && l.eventDirection === addEventDirection
                          );
                          return (
                            <div
                              key={d.id}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80"
                            >
                              <div className="min-w-0">
                                <span className="font-heading font-bold text-white block [overflow-wrap:anywhere]">
                                  {d.route_name}
                                </span>
                                <span className="text-slate-400">
                                  {getDetourModeLabel(d.direction_mode)}
                                  {!d.is_active ? " · ปิดชั่วคราว" : ""}
                                </span>
                              </div>
                              <button
                                type="button"
                                aria-label={`เพิ่มทางเลี่ยง ${d.route_name}`}
                                disabled={alreadyInDir || !selectedEventId}
                                onClick={() => handleAddDetourToEvent(d)}
                                className="min-h-10 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-heading font-bold shrink-0 inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{alreadyInDir ? "ผูกแล้ว" : "เพิ่ม"}</span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Detour Selector */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <label htmlFor="select-detour-route" className="block text-slate-300 font-heading font-bold">
                  เลือกเส้นทางเลี่ยงที่ต้องการผูกกับหลายเหตุการณ์
                </label>
                <select
                  id="select-detour-route"
                  aria-label="เลือกเส้นทางเลี่ยง"
                  value={selectedDetourId}
                  onChange={(e) => {
                    setSelectedDetourId(e.target.value);
                    setVerifiedNotice(null);
                    setSaveError(null);
                  }}
                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {detourList.length === 0 ? (
                    <option value="">-- ไม่มีเส้นทางเลี่ยงในระบบ --</option>
                  ) : (
                    detourList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.route_name} ({getDetourModeLabel(d.direction_mode)})
                      </option>
                    ))
                  )}
                </select>
                {selectedDetour && (
                  <p className="text-slate-400">
                    โหมดเดินรถ: <strong className="text-sky-300">{getDetourModeLabel(selectedDetour.direction_mode)}</strong>
                    {" · "}สถานะ: <strong className={selectedDetour.is_active ? "text-emerald-300" : "text-slate-300"}>{selectedDetour.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}</strong>
                    {" · "}เวอร์ชันแนวเส้น rev.{selectedDetour.geometry_revision || 1}
                  </p>
                )}
              </div>

              {byDetourLoading ? (
                <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-2 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span>กำลังโหลดความสัมพันธ์ของทุกเหตุการณ์จากฐานข้อมูล...</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {byDetourError && (
                    <div className="p-3 rounded-xl border border-amber-500/50 bg-amber-950/30 text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <span>{byDetourError}</span>
                      <button
                        type="button"
                        onClick={() => void loadAllEventsForDetourMode(selectedDetourId)}
                        className="min-h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-heading font-bold inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> ลองโหลดใหม่
                      </button>
                    </div>
                  )}

                  {parentEvents.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950 text-center text-slate-400">
                      ไม่มีเหตุการณ์น้ำท่วมในระบบ
                    </div>
                  ) : (
                    parentEvents.map((ev) => {
                      const state = eventStates[ev.eventId];
                      const draft = byDetourDrafts[ev.eventId];
                      const eventTitle = ev.eventTitle || `ทล.${ev.routeNo} ตอน${ev.sectionName}`;
                      const supported = getEventSupportedRecommendedDirections(ev.segments || []);
                      const previewLink: EventDetourLink | null = draft
                        ? {
                            eventId: ev.eventId,
                            detourId: selectedDetourId,
                            eventDirection: draft.eventDirection,
                            detourDirection: draft.detourDirection,
                            position: 1,
                            recommendation: "RECOMMENDED",
                            reviewedGeometryVersion: null,
                          }
                        : null;
                      const blockers = previewLink
                        ? getRecommendationReviewBlockers(previewLink, selectedDetour, supported)
                        : [];

                      return (
                        <div
                          key={ev.eventId}
                          className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                            draft?.linked
                              ? "border-amber-500/50 bg-slate-950"
                              : "border-slate-800 bg-slate-950/60"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                aria-label={`ผูกกับเหตุการณ์ ${eventTitle}`}
                                disabled={!state || state.status !== "ok"}
                                checked={Boolean(draft?.linked)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setByDetourDrafts((prev) => ({
                                    ...prev,
                                    [ev.eventId]: {
                                      ...(prev[ev.eventId] || {
                                        sourceEventDirection: null,
                                        eventDirection: resolveDefaultEventDirection(ev.segments || []),
                                        detourDirection: resolveDefaultDetourDirection(
                                          selectedDetour?.direction_mode
                                        ),
                                        status: "ACTIVE",
                                      }),
                                      linked: checked,
                                    },
                                  }));
                                  setVerifiedNotice(null);
                                  setSaveError(null);
                                }}
                                className="mt-0.5 h-5 w-5 accent-amber-500 rounded shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="font-heading font-bold text-sm text-white break-words block">
                                  {eventTitle}
                                </span>
                                {ev.kmRangeLabel && (
                                  <span className="text-[11px] font-mono text-amber-300/90 block">
                                    {ev.kmRangeLabel} ({ev.segments.length} ช่วง)
                                  </span>
                                )}
                              </span>
                            </label>
                            <span className="text-slate-400 font-mono">
                              {state?.status === "ok"
                                ? `v${state.version} · ${new Set(state.links.map((row) => row.detourId)).size} ทางเลี่ยง`
                                : state?.error || "โหลดไม่สำเร็จ"}
                            </span>
                          </div>

                          {draft?.linked && state?.status === "ok" && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางเหตุการณ์
                                </label>
                                <select
                                  aria-label={`ทิศทางเหตุการณ์สำหรับ ${eventTitle}`}
                                  value={draft.eventDirection}
                                  onChange={(e) => {
                                    const nextDir = e.target.value as EventTravelDirection;
                                    setByDetourDrafts((prev) => {
                                      const cur = prev[ev.eventId];
                                      if (!cur) return prev;
                                      return { ...prev, [ev.eventId]: { ...cur, eventDirection: nextDir } };
                                    });
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                                    <option key={dir} value={dir}>
                                      {EVENT_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางทางเลี่ยง
                                </label>
                                <select
                                  aria-label={`ทิศทางทางเลี่ยงสำหรับ ${eventTitle}`}
                                  value={draft.detourDirection}
                                  onChange={(e) => {
                                    const nextDir = e.target.value as DetourTravelDirection;
                                    setByDetourDrafts((prev) => {
                                      const cur = prev[ev.eventId];
                                      if (!cur) return prev;
                                      return { ...prev, [ev.eventId]: { ...cur, detourDirection: nextDir } };
                                    });
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["TWO_WAY", "FORWARD", "REVERSE", "UNKNOWN"] as const).map((dir) => (
                                    <option
                                      key={dir}
                                      value={dir}
                                      disabled={
                                        selectedDetour
                                          ? !isDetourDirectionAllowed(
                                              dir,
                                              selectedDetour.direction_mode
                                            )
                                          : false
                                      }
                                    >
                                      {DETOUR_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  สถานะ
                                </label>
                                <select
                                  aria-label={`สถานะสำหรับ ${eventTitle}`}
                                  value={draft.status}
                                  onChange={(e) => {
                                    const nextStatus = e.target.value as LinkStatusMode;
                                    setByDetourDrafts((prev) => ({
                                      ...prev,
                                      [ev.eventId]: {
                                        ...prev[ev.eventId],
                                        status: nextStatus,
                                      },
                                    }));
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["ACTIVE", "INACTIVE"] as const).map((modeOpt) => (
                                    <option key={modeOpt} value={modeOpt}>
                                      {STATUS_MODE_LABELS[modeOpt]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {draft.status === "ACTIVE" && blockers.length > 0 && (
                                <p className="sm:col-span-3 text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                                  หมายเหตุ: {blockers.join(" · ")}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions — primary save button MUST be last focusable element */}
        <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 border-t border-slate-800 bg-slate-950/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:flex sm:justify-between sm:gap-2 sm:px-6 sm:py-3.5 [@media(max-height:540px)]:py-1">
          <button
            type="button"
            aria-label="โหลดข้อมูลล่าสุดจากฐานข้อมูล"
            disabled={isSaving || eventLoading || byDetourLoading}
            onClick={() =>
              mode === "BY_EVENT"
                ? void loadSingleEvent(selectedEventId)
                : void loadAllEventsForDetourMode(selectedDetourId)
            }
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs font-bold text-sky-300 hover:bg-slate-800 disabled:opacity-50 sm:gap-1.5 sm:px-3.5"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">โหลดล่าสุด</span>
            <span className="hidden sm:inline">โหลดข้อมูลล่าสุดจากฐานข้อมูล</span>
          </button>

          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:ml-auto sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 shrink-0 rounded-xl bg-slate-800 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 sm:px-4"
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={
                isSaving ||
                (mode === "BY_EVENT" ? eventLoading || !selectedEventId || Boolean(eventError) : byDetourLoading || !selectedDetourId)
              }
              onClick={() =>
                mode === "BY_EVENT" ? void handleSaveByEvent() : void handleSaveByDetour()
              }
              aria-label={isSaving ? "กำลังบันทึกและตรวจสอบ" : "บันทึกความสัมพันธ์"}
              className={`${workspace.primary} inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2.5 text-xs font-bold leading-tight disabled:opacity-50 sm:flex-none sm:gap-1.5 sm:px-5`}
            >
              {isSaving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Save className="h-4 w-4 shrink-0" />}
              <span className="min-[360px]:hidden">{isSaving ? "กำลังบันทึก" : "บันทึก"}</span>
              <span className="hidden min-[360px]:inline">{isSaving ? "กำลังบันทึกและตรวจสอบ..." : "บันทึกความสัมพันธ์"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
