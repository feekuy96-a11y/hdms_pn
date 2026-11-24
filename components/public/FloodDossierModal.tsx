"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  MapPin,
  MapPinned,
  Maximize2,
  Milestone,
  X,
} from "lucide-react";
import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import type { extractDirectionalAdvice } from "@/lib/gis-utils";
import {
  AFFECTED_ROAD_PART_LABELS,
  type parseFloodDirectionMeta,
} from "@/lib/flood-event-schema";
import { getTrafficPresentation, type TrafficPresentation } from "@/lib/traffic-presentation";
import {
  formatFloodAreaLine,
  formatKmText,
  STATUS_CHIP,
} from "@/components/public/public-route-helpers";
import {
  FloodDossierDetourSection,
  FloodDossierHistorySection,
} from "@/components/public/FloodDossierSections";
import type { getLinkedDetoursForFlood } from "@/lib/event-detour-links";

const FloodEventMiniMap = dynamic(
  () => import("@/components/map/FloodEventMiniMap").then((mod) => mod.FloodEventMiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 w-full items-center justify-center rounded-xl border border-slate-700/80 bg-[#0b1528] text-xs text-slate-400">
        กำลังโหลดแผนที่ตำแหน่ง...
      </div>
    ),
  }
);

export interface FloodDossierModalProps {
  selectedFlood: FloodRoute;
  selectedFloodMeta: ReturnType<typeof parseFloodDirectionMeta>;
  dossierStatus: TrafficPresentation;
  systemData: SystemDataPayload;
  onDemandPhotos: Record<string, Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>>;
  activePhotoIdx: number;
  setActivePhotoIdx: React.Dispatch<React.SetStateAction<number>>;
  isPhotoFullscreen: boolean;
  setIsPhotoFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  siblingSegments: FloodRoute[];
  setSelectedFloodId: (id: string) => void;
  setFocusCoordinates: (coords: [number, number]) => void;
  closeDetailsRef: React.RefObject<HTMLButtonElement | null>;
  dossierDetourRef: React.RefObject<HTMLDivElement | null>;
  setShowDossier: (show: boolean) => void;
  selectedFloodDetours: DetourRoute[];
  selectedFloodDetourEntries: ReturnType<typeof getLinkedDetoursForFlood>;
  expandedDetourId: string | null;
  setExpandedDetourId: React.Dispatch<React.SetStateAction<string | null>>;
  detourDirectionById: Record<string, "FORWARD" | "REVERSE">;
  setDetourDirectionById: React.Dispatch<React.SetStateAction<Record<string, "FORWARD" | "REVERSE">>>;
  eventAdviceDirection: "FORWARD" | "REVERSE";
  setEventAdviceDirection: (dir: "FORWARD" | "REVERSE") => void;
  directionalAdvice: ReturnType<typeof extractDirectionalAdvice>;
  isHistoryExpanded: boolean;
  setIsHistoryExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFloodRecentUpdates: SystemDataPayload["timelineUpdates"];
}

export function FloodDossierModal({
  selectedFlood,
  selectedFloodMeta,
  dossierStatus,
  systemData,
  onDemandPhotos,
  activePhotoIdx,
  setActivePhotoIdx,
  isPhotoFullscreen,
  setIsPhotoFullscreen,
  siblingSegments,
  setSelectedFloodId,
  setFocusCoordinates,
  closeDetailsRef,
  dossierDetourRef,
  setShowDossier,
  selectedFloodDetours,
  selectedFloodDetourEntries,
  expandedDetourId,
  setExpandedDetourId,
  detourDirectionById,
  setDetourDirectionById,
  eventAdviceDirection,
  setEventAdviceDirection,
  directionalAdvice,
  isHistoryExpanded,
  setIsHistoryExpanded,
  selectedFloodRecentUpdates,
}: FloodDossierModalProps) {
  const routeLabel = /^(?:ทล|ปน)\.?\s*/i.test(selectedFlood.route_no) ? selectedFlood.route_no : `ทล.${selectedFlood.route_no}`;
  const dossierArea = formatFloodAreaLine(selectedFlood);
  const waterKnown = selectedFlood.direction_meta?.water_level_known !== false && selectedFloodMeta.waterLevelKnown !== false;
  const rawMetaPhotos = (onDemandPhotos[selectedFlood.id] || selectedFloodMeta.photos || []) as Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>;
  const dossierPhotos = rawMetaPhotos.length > 0
    ? rawMetaPhotos.filter((p) => Boolean(p?.dataUrl))
    : selectedFlood.latest_photo_url
      ? [{ id: "primary", dataUrl: selectedFlood.latest_photo_url, sizeBytes: 0 }]
      : [];
  const safePhotoIdx = dossierPhotos.length > 0 ? Math.min(activePhotoIdx, dossierPhotos.length - 1) : 0;
  const activePhoto = dossierPhotos[safePhotoIdx];
  const recordedParts = Array.isArray(selectedFloodMeta.affectedParts)
    ? selectedFloodMeta.affectedParts
      .filter((p) => p && p !== "UNSPECIFIED" && p !== "PENDING_VERIFICATION")
      .map((p) => AFFECTED_ROAD_PART_LABELS[p] || String(p))
      .filter(Boolean)
    : [];
  const recordedLanesText =
    (selectedFlood.affected_lanes && selectedFlood.affected_lanes.trim() !== "-" ? selectedFlood.affected_lanes.trim() : "") ||
    (recordedParts.length > 0 ? recordedParts.join(", ") : "") ||
    "ไม่ระบุ";

  return (
    <div
      className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/75 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowDossier(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
        className="relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700/80 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[92dvh] sm:max-w-[57.5rem] sm:rounded-3xl"
      >
        {/* Header: Route Badge, Section Title, KM Range, Area, Traffic Status, Close */}
        <div className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#0c182e] px-4 py-3.5 sm:px-6 shadow-md">
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-[#f59e0b] px-3 py-1 font-heading text-sm font-black text-slate-950 shadow">
                  {routeLabel}
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="font-heading text-base sm:text-xl font-bold leading-snug text-white break-words">
                    {selectedFlood.section_name}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-1.5 flex-wrap">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span>{formatKmText(selectedFlood.km_start)} ถึง {formatKmText(selectedFlood.km_end)}</span>
                  </p>
                  {dossierArea && (
                    <p className="text-xs text-slate-300 break-words">{dossierArea}</p>
                  )}
                </div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-heading text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                <span aria-hidden="true">{dossierStatus.icon}</span>
                <span>{dossierStatus.label}</span>
              </span>
            </div>
            <button
              ref={closeDetailsRef}
              type="button"
              onClick={() => setShowDossier(false)}
              aria-label="ปิดรายละเอียด"
              className="grid min-h-[2.75rem] min-w-[2.75rem] sm:min-h-10 sm:min-w-10 shrink-0 place-items-center rounded-lg bg-slate-800/90 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
              title="ปิดหน้าต่างรายละเอียด"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Dark Navy Body */}
        <div className="grid grid-cols-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:grid-cols-[1.18fr_0.82fr]">
          {/* LEFT COLUMN: Real DB Photo Carousel + Detour Recommendations Accordion */}
          <div className="space-y-4 min-w-0">
            {/* Situation Photo Card */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1930] shadow-lg">
              {activePhoto?.dataUrl ? (
                <>
                  <img
                    src={activePhoto.dataUrl}
                    alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                    loading="lazy"
                    decoding="async"
                    className="h-52 w-full object-cover sm:h-64"
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-slate-700/80 px-2.5 py-1 text-xs font-heading font-bold text-white backdrop-blur-xs">
                    <Camera aria-hidden="true" className="h-3.5 w-3.5 text-slate-200" />
                    <span>ภาพสถานการณ์</span>
                  </div>
                  {dossierPhotos.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="ภาพก่อนหน้า"
                        onClick={() => setActivePhotoIdx((idx) => (idx - 1 + dossierPhotos.length) % dossierPhotos.length)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="ภาพถัดไป"
                        onClick={() => setActivePhotoIdx((idx) => (idx + 1) % dossierPhotos.length)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1">
                        {dossierPhotos.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            aria-label={`ดูภาพที่ ${idx + 1}`}
                            onClick={() => setActivePhotoIdx(idx)}
                            className={`h-2 w-2 rounded-full transition cursor-pointer ${idx === safePhotoIdx ? "bg-[#f59e0b]" : "bg-slate-400/60 hover:bg-slate-300"}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <div className="absolute right-3 bottom-2.5 flex items-center gap-1.5">
                    <span className="rounded-md bg-slate-950/85 border border-slate-700/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {safePhotoIdx + 1}/{dossierPhotos.length}
                    </span>
                    <button
                      type="button"
                      aria-label="ขยายภาพสถานการณ์เต็มจอ"
                      onClick={() => setIsPhotoFullscreen(true)}
                      className="grid h-7 w-7 place-items-center rounded-md bg-slate-950/85 border border-slate-700/80 text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-44 items-center justify-center px-4 text-center text-xs text-slate-400">
                  ยังไม่มีภาพถ่ายสถานการณ์ล่าสุด
                </div>
              )}
            </div>

            {/* Sibling Segments Comparative Switcher (when parent event has multiple stretches) */}
            {siblingSegments.length > 1 && (
              <div className="rounded-2xl border border-sky-600/40 bg-sky-950/35 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-heading font-bold text-sky-200">
                    📊 ช่วงในเหตุการณ์นี้ ({siblingSegments.length} ช่วง)
                  </span>
                  <span className="text-[0.75rem]/[1.1rem] text-slate-400">แตะเพื่อสลับดูข้อมูล</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {siblingSegments.map((s) => {
                    const isCurrent = s.id === selectedFlood.id;
                    const pres = getTrafficPresentation(s.traffic_status, s.water_level_cm, s.direction_meta?.trafficStatusDetail);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedFloodId(s.id);
                          if (s.lat_start && s.lon_start) setFocusCoordinates([s.lon_start, s.lat_start]);
                        }}
                        className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between gap-1 cursor-pointer ${isCurrent
                          ? "bg-sky-900/75 border-sky-400 ring-1 ring-sky-400 text-white"
                          : "bg-slate-900/75 border-slate-700/80 hover:bg-slate-800 text-slate-200"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 text-xs">
                          <span className="font-semibold text-amber-300">กม.{s.km_start}–{s.km_end}</span>
                          <span className="text-[0.75rem]/[1.1rem] font-mono font-bold text-white">{s.water_level_cm} ซม.</span>
                        </div>
                        <span className="text-[0.75rem]/[1.1rem] text-slate-300">{pres.icon} {pres.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detour Recommendations (Exclusive Single-Open Accordion with Per-Route Independent Direction) */}
            <FloodDossierDetourSection
              selectedFlood={selectedFlood}
              routeLabel={routeLabel}
              systemData={systemData}
              dossierDetourRef={dossierDetourRef}
              selectedFloodDetours={selectedFloodDetours}
              selectedFloodDetourEntries={selectedFloodDetourEntries}
              expandedDetourId={expandedDetourId}
              setExpandedDetourId={setExpandedDetourId}
              detourDirectionById={detourDirectionById}
              setDetourDirectionById={setDetourDirectionById}
              eventAdviceDirection={eventAdviceDirection}
              setEventAdviceDirection={setEventAdviceDirection}
              directionalAdvice={directionalAdvice}
              setFocusCoordinates={setFocusCoordinates}
              setShowDossier={setShowDossier}
            />
          </div>

          {/* RIGHT COLUMN: Current Water Level, Affected Lanes (Exact DB), Updated At, Pinned Incident Mini-Map */}
          <div className="space-y-3 min-w-0">
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] divide-y divide-slate-700/75 shadow-lg">
              {/* Water Level */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-slate-300">
                    <Droplets aria-hidden="true" className="h-4 w-4 text-sky-300" />
                    <span>ระดับน้ำปัจจุบัน</span>
                  </span>
                  <span className={`px-[0.667em] py-[0.167em] rounded-md text-[0.75rem]/[1.1rem] font-heading font-bold ${selectedFlood.trend === "RISING"
                    ? "bg-rose-950/90 text-rose-300 border border-rose-700/80"
                    : selectedFlood.trend === "FALLING"
                      ? "bg-emerald-950/90 text-emerald-300 border border-emerald-700/80"
                      : "bg-amber-950/80 text-amber-300 border border-amber-600/60"
                    }`}>
                    แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : "ทรงตัว"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-black tracking-tight text-red-500">
                    {waterKnown ? selectedFlood.water_level_cm : "รอตรวจสอบ"}
                  </span>
                  {waterKnown && <span className="text-sm font-bold text-slate-200">ซม.</span>}
                </div>
              </div>

              {/* Affected Lanes (Verbatim from DB without inventing suffix) */}
              <div className="p-3.5 flex items-start gap-2.5">
                <Milestone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs text-slate-400">ส่วนถนนที่ได้รับผลกระทบ</div>
                  <div className="font-heading text-sm font-bold text-amber-300 break-words">
                    {recordedLanesText}
                  </div>
                </div>
              </div>

              {/* Latest Updated Timestamp */}
              <div className="p-3.5 flex items-start gap-2.5">
                <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs text-slate-400">อัปเดตล่าสุด:</div>
                  <div className="font-mono text-xs sm:text-sm font-semibold text-white">
                    {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ไม่ระบุ"}
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Incident Location Mini-Map (Never follows detour direction toggles) */}
            <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] p-3.5 space-y-2.5 shadow-lg">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-heading font-bold text-white">
                <MapPinned aria-hidden="true" className="h-4 w-4 text-sky-300 shrink-0" />
                <span>ตำแหน่งบนแผนที่</span>
              </div>
              <FloodEventMiniMap flood={selectedFlood} />
              <button
                type="button"
                onClick={() => {
                  if (Number.isFinite(selectedFlood.lon_start) && Number.isFinite(selectedFlood.lat_start)) {
                    setFocusCoordinates([selectedFlood.lon_start, selectedFlood.lat_start]);
                  }
                  setShowDossier(false);
                }}
                className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-3 py-2 font-heading text-xs font-bold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <MapPin aria-hidden="true" className="h-4 w-4 text-sky-300" />
                <span>ดูตำแหน่งบนแผนที่</span>
              </button>
            </div>
          </div>

          {/* FULL-WIDTH BOTTOM COLLAPSIBLE HISTORY BUTTON & CHART */}
          <FloodDossierHistorySection
            selectedFloodId={selectedFlood.id}
            timelineUpdates={systemData.timelineUpdates}
            selectedFloodRecentUpdates={selectedFloodRecentUpdates}
            isHistoryExpanded={isHistoryExpanded}
            setIsHistoryExpanded={setIsHistoryExpanded}
          />
        </div>
      </div>

      {/* Fullscreen Photo Preview Overlay */}
      {isPhotoFullscreen && activePhoto?.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ภาพถ่ายสถานการณ์ขนาดเต็ม"
          className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setIsPhotoFullscreen(false)}
        >
          <button
            type="button"
            aria-label="ปิดภาพขนาดเต็ม"
            onClick={() => setIsPhotoFullscreen(false)}
            className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={activePhoto.dataUrl}
            alt={`ภาพสถานการณ์ขนาดเต็ม ${selectedFlood.section_name}`}
            className="max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
