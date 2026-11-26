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
  resolveFloodWaterReading,
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
import type { PublicFloodAlbum } from "@/components/public/usePublicDashboardData";
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
  floodAlbum?: PublicFloodAlbum;
  loadFloodPhotosOnDemand: (flood: FloodRoute) => void;
  activePhotoIdx: number;
  setActivePhotoIdx: React.Dispatch<React.SetStateAction<number>>;
  onOpenPhoto: (src: string, alt: string, trigger: HTMLElement) => void;
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
  onFocusFloodOnMap?: (floodId: string) => void;
  onFocusDetourOnMap?: (detourId: string, direction: "FORWARD" | "REVERSE") => void;
}

export function FloodDossierModal({
  selectedFlood,
  selectedFloodMeta,
  dossierStatus,
  systemData,
  floodAlbum,
  loadFloodPhotosOnDemand,
  activePhotoIdx,
  setActivePhotoIdx,
  onOpenPhoto,
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
  onFocusFloodOnMap,
  onFocusDetourOnMap,
}: FloodDossierModalProps) {
  const routeLabel = /^(?:ทล|ปน)\.?\s*/i.test(selectedFlood.route_no) ? selectedFlood.route_no : `ทล.${selectedFlood.route_no}`;
  const dossierArea = formatFloodAreaLine(selectedFlood);
  const recordedUpdate = selectedFlood.updated_at ? new Date(selectedFlood.updated_at) : null;
  const updateTime = recordedUpdate && Number.isFinite(recordedUpdate.getTime()) ? recordedUpdate : null;
  const displayUpdate = updateTime?.toLocaleString("th-TH") ?? "ไม่ระบุ";
  const waterKnown = selectedFloodMeta.waterLevelKnown;
  const embeddedPhotos = (selectedFloodMeta.photos || []).filter((p) => Boolean(p?.dataUrl));
  const knownPhotos = embeddedPhotos.length
    ? embeddedPhotos
    : selectedFlood.latest_photo_url
      ? [{ id: "primary", dataUrl: selectedFlood.latest_photo_url, sizeBytes: 0 }]
      : [];
  const [failedSources, setFailedSources] = React.useState<ReadonlySet<string>>(() => new Set());
  const remotePhotos = floodAlbum?.status === "photos" ? floodAlbum.photos : [];
  const useRemotePhotos = remotePhotos.length > 0 && (!knownPhotos.length || remotePhotos.some((photo) => !failedSources.has(photo.dataUrl)));
  const dossierPhotos = useRemotePhotos ? remotePhotos : knownPhotos;
  const safePhotoIdx = dossierPhotos.length > 0 ? Math.min(activePhotoIdx, dossierPhotos.length - 1) : 0;
  const activePhotoSrc = dossierPhotos[safePhotoIdx]?.dataUrl;
  const activePhotoFailed = Boolean(activePhotoSrc && failedSources.has(activePhotoSrc));
  const photoMessage = activePhotoFailed || floodAlbum?.status === "failed"
    ? "โหลดภาพแนบไม่สำเร็จ"
    : floodAlbum?.status === "empty" ? "ยังไม่มีภาพแนบ" : "กำลังโหลดภาพแนบ";
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
      className="citizen-flood-dossier fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/75 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowDossier(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
          )).filter((element) => element.getClientRects().length > 0);
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
        aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
        className="citizen-dossier-frame relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border-x-0 border-t border-b-0 border-slate-700/80 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[92dvh] sm:max-w-[57.5rem] sm:rounded-[1.75rem] sm:border-0 sm:ring-1 sm:ring-slate-700/80"
      >
        {/* Header: dialog label, road and event name */}
        <div className="citizen-incident-header shrink-0 z-20 border-b border-slate-800/90 bg-[#0c182e] px-4 py-3.5 sm:px-6 shadow-md">
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
          <div className="citizen-incident-heading">
            <h2 className="citizen-incident-kicker">รายละเอียดน้ำท่วม</h2>
            <div className="citizen-incident-road flex items-start gap-2">
              <span className="citizen-route-id mt-0.5 shrink-0 rounded-lg px-2 py-1 text-xs font-bold">{routeLabel}</span>
              <h3 className="text-base font-bold leading-snug break-words sm:text-xl">{selectedFlood.section_name}</h3>
            </div>
            <button
              ref={closeDetailsRef}
              type="button"
              onClick={() => setShowDossier(false)}
              aria-label="ปิดรายละเอียด"
              className="citizen-incident-close citizen-theme-button"
              title="ปิดหน้าต่างรายละเอียด"
            >
              <X className="size-[1.125rem]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 2-Column Dark Navy Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain sm:rounded-b-[1.75rem]">
        <div className="citizen-incident-grid">
            <div role="group" aria-label="ภาพสถานการณ์" className="citizen-incident-photo relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1930] shadow-lg">
              <span className={`citizen-photo-status inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                <span aria-hidden="true">{dossierStatus.icon}</span><span>{dossierStatus.label}</span>
              </span>
              {activePhotoSrc && !activePhotoFailed ? (
                <>
                  <button type="button" className="citizen-photo-open block w-full cursor-zoom-in" aria-haspopup="dialog" aria-label="ขยายภาพสถานการณ์เต็มจอ"
                    onClick={(event) => onOpenPhoto(activePhotoSrc, `ภาพสถานการณ์ขนาดเต็ม ${selectedFlood.section_name}`, event.currentTarget)}>
                    <img
                      src={activePhotoSrc}
                      onError={() => setFailedSources((previous) => new Set(previous).add(activePhotoSrc))}
                      alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                      loading="lazy"
                      decoding="async"
                      className="h-36 w-full object-cover sm:h-56"
                    />
                  </button>
                  <div className="citizen-photo-caption pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-slate-700/80 px-2.5 py-1 text-xs font-heading font-bold text-white backdrop-blur-xs">
                    <Camera aria-hidden="true" className="h-3.5 w-3.5 text-slate-200" />
                    <span>ภาพสถานการณ์</span>
                  </div>
                  <div className="citizen-photo-controls pointer-events-none absolute right-3 bottom-2.5 flex items-center gap-1.5">
                    <span className="rounded-md bg-slate-950/85 border border-slate-700/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {safePhotoIdx + 1}/{dossierPhotos.length}
                    </span>
                    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-slate-950/85 text-white">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </>
              ) : (
                <div className="citizen-photo-placeholder">
                  <svg aria-hidden="true" viewBox="0 0 560 155" preserveAspectRatio="xMidYMid slice" focusable="false">
                    <path fill="#d7e8e9" d="M0 0h560v155H0z" />
                    <path fill="#95b6a8" d="M0 82V48l64 22 60-23 75 31 53-12 91 10 62-24 75 12 80-26v117H0z" />
                    <path fill="#344f60" d="M248 50h65l100 105H146z" />
                    <path stroke="#e7edf0" strokeWidth="3" d="m248 50-102 105M313 50l100 105" />
                    <path d="M281 51v104" stroke="#f9dea1" strokeWidth="3" strokeDasharray="7 9" />
                    <path fill="#64a7bb" d="M0 96q70-16 137 0t137 0q70-18 137 0t149 0v37q-83-15-149 0t-137 0q-72-14-137 0T0 133z" />
                    <path d="M31 105q18-6 36 0t36 0m80 15q18-6 36 0t36 0m65-11q20-6 40 0t40 0m42 12q19-5 38 0t38 0" stroke="#d1edf1" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M404 47v38" stroke="#466e67" strokeWidth="3" />
                    <rect x="385" y="40" width="39" height="19" rx="3" fill="#e0efdf" stroke="#466e67" />
                    <path d="M393 50h23l-5-5m5 5-5 5" stroke="#466e67" strokeWidth="2" fill="none" />
                  </svg>
                  <p role="status">{photoMessage}</p>
                </div>
              )}
                  {dossierPhotos.length > 1 && (
                    <>
                      <div className="citizen-gallery-arrows">
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
                      </div>
                      {!activePhotoFailed && <div className="citizen-gallery-dots absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1">
                        {dossierPhotos.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            aria-label={`ดูภาพที่ ${idx + 1}`}
                            onClick={() => setActivePhotoIdx(idx)}
                            className={`h-2 w-2 rounded-full transition cursor-pointer ${idx === safePhotoIdx ? "bg-[#f59e0b]" : "bg-slate-400/60 hover:bg-slate-300"}`}
                          />
                        ))}
                      </div>}
                    </>
                  )}
            </div>

            <div role="group" aria-label="ช่วงถนน พื้นที่ และเวลาอัปเดต" className="citizen-incident-details">
              <p className="citizen-incident-km">{formatKmText(selectedFlood.km_start)} ถึง {formatKmText(selectedFlood.km_end)}</p>
              {dossierArea && <p className="citizen-incident-area"><MapPin size={15} aria-hidden="true" />{dossierArea}</p>}
              <p className="citizen-incident-update">
                <Clock aria-hidden="true" size={14} />
                <span>อัปเดตล่าสุด {updateTime ? <time dateTime={updateTime.toISOString()}>{displayUpdate}</time> : displayUpdate}</span>
              </p>
            </div>

            <div role="group" aria-label="ระดับน้ำและส่วนถนนที่ได้รับผลกระทบ" className="citizen-incident-facts rounded-2xl border border-slate-700/80 bg-[#0d1930] divide-y divide-slate-700/75 shadow-lg">
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
                    แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : selectedFlood.trend === "STEADY" ? "ทรงตัว" : "ไม่ระบุ"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="citizen-water-value text-xl font-black tracking-tight">
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

            </div>

          <div className="citizen-incident-detours">
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
              onFocusDetourOnMap={onFocusDetourOnMap}
            />
          </div>
            {/* Pinned Incident Location Mini-Map (Never follows detour direction toggles) */}
            <div role="group" aria-label="ตำแหน่งเหตุการณ์บนแผนที่" className="citizen-incident-position rounded-2xl border border-slate-700/80 bg-[#0d1930] p-3.5 space-y-2.5 shadow-lg">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-heading font-bold text-white">
                <MapPinned aria-hidden="true" className="h-4 w-4 text-sky-300 shrink-0" />
                <span>ตำแหน่งบนแผนที่</span>
              </div>
              {/* A definite slot contains Leaflet’s global 100%-height rule. */}
              <div className="h-32">
                <FloodEventMiniMap flood={selectedFlood} />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onFocusFloodOnMap) {
                    onFocusFloodOnMap(selectedFlood.id);
                    return;
                  }
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
            {/* Sibling Segments Comparative Switcher (when parent event has multiple stretches) */}
            {siblingSegments.length > 1 && (
              <div className="citizen-incident-siblings rounded-2xl border border-sky-600/40 bg-sky-950/35 p-3 space-y-2">
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
                          loadFloodPhotosOnDemand(s);
                          if (s.lat_start && s.lon_start) setFocusCoordinates([s.lon_start, s.lat_start]);
                        }}
                        className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between gap-1 cursor-pointer ${isCurrent
                          ? "bg-sky-900/75 border-sky-400 ring-1 ring-sky-400 text-white"
                          : "bg-slate-900/75 border-slate-700/80 hover:bg-slate-800 text-slate-200"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 text-xs">
                          <span className="font-semibold text-amber-300">กม.{s.km_start}–{s.km_end}</span>
                          <span className="text-[0.75rem]/[1.1rem] font-mono font-bold text-white">{resolveFloodWaterReading(s.direction_meta, s.water_level_cm).known ? `${s.water_level_cm} ซม.` : "รอตรวจสอบ"}</span>
                        </div>
                        <span className="text-[0.75rem]/[1.1rem] text-slate-300">{pres.icon} {pres.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
      </div>

    </div>
  );
}
