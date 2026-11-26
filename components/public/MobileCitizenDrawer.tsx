"use client";

import React from "react";
import { Waves, Map, Maximize2, Minimize2, Phone, Route, Search, X } from "lucide-react";
import type { DetourRoute, FloodRoute } from "@/db/default-data";
import type { StatusColor } from "@/lib/traffic-presentation";
import { SituationSummary } from "@/components/public/SituationSummary";
import { PUBLIC_READ_MESSAGES, type PublicReadState } from "./public-read-state";
import { FloodCard } from "@/components/public/FloodCard";

export interface MobileCitizenDrawerProps {
  openContacts: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isMobileDrawerOpen: boolean;
  setIsMobileDrawerOpen: (open: boolean) => void;
  showDossier: boolean;
  viewingDetourModal: DetourRoute | null;
  situationCounts: Record<StatusColor, number>;
  selectedStatusFilter: StatusColor | "ALL";
  mapStatusFilterLabel?: string;
  setSelectedStatusFilter: (filter: StatusColor | "ALL") => void;
  handleStatusFilter: (color: StatusColor) => void;
  mobileDrawerStage: "peek" | "list" | "full";
  setMobileDrawerStage: React.Dispatch<React.SetStateAction<"peek" | "list" | "full">>;
  sidebarTab: "FLOOD" | "DETOUR";
  setSidebarTab: (tab: "FLOOD" | "DETOUR") => void;
  filteredFloods: FloodRoute[];
  filteredDetours: DetourRoute[];
  totalFloodCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedRouteFilter: string;
  setSelectedRouteFilter: (f: string) => void;
  routeChips: Array<{ id: string; label: string }>;
  selectedFloodId: string | null;
  detourCountByFloodId: Map<string, number>;
  handleSelectFlood: (flood: FloodRoute, openDossier: boolean) => void;
  handleOpenFloodDetourSection: (flood: FloodRoute) => void;
  detourList: React.ReactNode;
  readState: PublicReadState;
  fetchedAtLabel: string | null;
  latestReportLabel: string | null;
  hasCounts: boolean;
  refetch: () => Promise<unknown> | void;
}

export function MobileCitizenDrawer({
  openContacts,
  isMobileDrawerOpen,
  setIsMobileDrawerOpen,
  showDossier,
  viewingDetourModal,
  situationCounts,
  selectedStatusFilter,
  mapStatusFilterLabel,
  setSelectedStatusFilter,
  handleStatusFilter,
  mobileDrawerStage,
  setMobileDrawerStage,
  sidebarTab,
  setSidebarTab,
  filteredFloods,
  filteredDetours,
  totalFloodCount,
  searchQuery,
  setSearchQuery,
  selectedRouteFilter,
  setSelectedRouteFilter,
  routeChips,
  selectedFloodId,
  detourCountByFloodId,
  handleSelectFlood,
  handleOpenFloodDetourSection,
  detourList,
  readState,
  fetchedAtLabel,
  latestReportLabel,
  hasCounts,
  refetch,
}: MobileCitizenDrawerProps) {
  const openSection = (section: "FLOOD" | "DETOUR") => {
    setSidebarTab(section);
    setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage);
    setIsMobileDrawerOpen(true);
  };
  const showNavigation = !showDossier && !viewingDetourModal && !isMobileDrawerOpen;
  const navAction = "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center text-[0.75rem] leading-tight font-heading font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 touch-manipulation";
  return (
    <>
      {showNavigation && (
        <nav aria-label="เมนูประชาชน" className="citizen-nav fixed inset-x-0 bottom-0 z-[460] grid min-h-14 grid-cols-4 items-center gap-1 border-t border-surface bg-surface-panel px-1 pt-0.5 pb-[max(0.125rem,env(safe-area-inset-bottom))] lg:hidden">
          <button type="button" aria-current="page" className={navAction + " bg-surface-card text-sky-200"} onClick={() => setIsMobileDrawerOpen(false)}>
            <Map className="size-[1.125rem]" aria-hidden="true" />แผนที่
          </button>
          <button type="button" className={navAction} onClick={() => openSection("FLOOD")}>
            <Waves className="size-[1.125rem]" aria-hidden="true" /><span><span className="whitespace-nowrap">เหตุการณ์</span><wbr /><span className="whitespace-nowrap">น้ำท่วม</span></span>
          </button>
          <button type="button" className={navAction} onClick={() => openSection("DETOUR")}>
            <Route className="size-[1.125rem]" aria-hidden="true" />ทางเลี่ยง
          </button>
          <button type="button" data-citizen-contact onClick={openContacts} className={navAction}>
            <Phone className="size-[1.125rem]" aria-hidden="true" />ติดต่อ
          </button>
        </nav>
      )}
      {/* Mobile citizen list: one sheet, three heights; never stack it behind detour details. */}
      {isMobileDrawerOpen && !showDossier && !viewingDetourModal && (
        <div className="lg:hidden fixed inset-0 z-[650] flex flex-col justify-end bg-slate-950/65" onClick={() => setIsMobileDrawerOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="รายการสายทางและจุดเฝ้าระวัง"
            onClick={(event) => event.stopPropagation()}
            className={`citizen-drawer flex w-full flex-col overflow-y-auto overscroll-contain rounded-t-3xl border-t border-amber-500/60 bg-surface-panel text-slate-100 shadow-2xl transition-[height] duration-200 motion-reduce:transition-none ${mobileDrawerStage === "full" ? "h-[95dvh]" : mobileDrawerStage === "peek" ? "h-[14.6875rem]" : "h-[78dvh]"
              }`}
          >
            <div className="shrink-0 border-b border-surface bg-surface-panel px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={() => setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage === "list" ? "full" : "peek")}
                aria-label="สลับความสูงหน้าต่างรายการ"
                className="mx-auto mb-1.5 flex h-5 w-16 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
              >
                <span className="h-1.5 w-10 rounded-full bg-slate-600" aria-hidden="true" />
              </button>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 py-0.5">
                  <h2 className="font-heading text-lg font-bold leading-snug tracking-normal text-white break-words [overflow-wrap:anywhere]">{sidebarTab === "FLOOD" ? "เหตุการณ์น้ำท่วม" : "ทางเลี่ยง"}</h2>
                  <p className="mt-0.5 text-xs text-slate-300">{sidebarTab === "FLOOD" ? "ค้นหาตามสายทาง พื้นที่ หรือสถานะ" : "ดูเส้นทางที่แนะนำและทิศที่ยืนยันแล้ว"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage === "list" ? "full" : "peek")}
                    aria-label={mobileDrawerStage === "peek" ? "แสดงรายการ" : mobileDrawerStage === "list" ? "ขยายรายการเต็มจอ" : "ย่อรายการ"}
                    className="grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    {mobileDrawerStage === "full" ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMobileDrawerOpen(false)}
                    aria-label="ปิดรายการสายทาง"
                    className="grid h-11 w-11 place-items-center rounded-xl bg-slate-800 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              {(selectedStatusFilter !== "ALL" || mapStatusFilterLabel) && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-950/35 px-2.5 py-1.5 text-xs">
                  <span className="text-amber-100">{mapStatusFilterLabel ? "กำลังกรอง: " + mapStatusFilterLabel : "กำลังกรองตามสถานะที่เลือก"}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter("ALL")}
                    className="min-h-8 rounded-md px-2 font-semibold text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                  >
                    แสดงทุกสถานะ
                  </button>
                </div>
              )}
              <div className="citizen-section-tabs mt-3 grid grid-cols-2 gap-1 rounded-xl border border-surface bg-slate-900/90 p-1 text-xs font-heading font-bold" role="group" aria-label="ประเภทข้อมูล">
                {([
                  { id: "FLOOD", label: "น้ำท่วม", count: filteredFloods.length, Icon: Waves },
                  { id: "DETOUR", label: "ทางเลี่ยง", count: filteredDetours.length, Icon: Route },
                ] as const).map(({ id, label, count, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={sidebarTab === id}
                    onClick={() => { setSidebarTab(id); setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage); }}
                    className={`min-h-11 rounded-lg px-1 py-1.5 transition flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${sidebarTab === id ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}{hasCounts && <> <span className="tabular-nums">({count})</span></>}</span>
                  </button>
                ))}
              </div>
              {mobileDrawerStage !== "peek" && (
                <div className="mt-3 space-y-2">
                  {hasCounts && <SituationSummary counts={situationCounts} activeFilter={selectedStatusFilter} onFilter={handleStatusFilter} />}
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="ค้นหาสายทางหรือชื่อพื้นที่..."
                      aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                      className="min-h-11 w-full rounded-xl border border-surface bg-slate-900 pl-10 pr-3 text-sm text-white placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="citizen-highway-filter" className="shrink-0 text-xs font-semibold text-slate-300">สายทาง</label>
                    <select
                      id="citizen-highway-filter"
                      value={selectedRouteFilter}
                      onChange={(event) => setSelectedRouteFilter(event.target.value)}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface bg-slate-900 px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      {routeChips.map((chip) => <option key={chip.id} value={chip.id}>{chip.label}</option>)}
                    </select>
                    {(searchQuery || selectedRouteFilter !== "ALL") && ((sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length) > 0) && (
                      <button type="button" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">ล้างตัวกรอง</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {mobileDrawerStage !== "peek" && (
              <div className="space-y-2.5 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {readState !== "ready" && <p className="text-xs text-slate-300" role="status">{PUBLIC_READ_MESSAGES[readState]}</p>}
                {fetchedAtLabel && <p className="text-xs text-slate-300">
                  ดึงข้อมูลสำเร็จล่าสุด {fetchedAtLabel} น.
                  {latestReportLabel && <><br />เวลาอัปเดตรายงานล่าสุด {latestReportLabel} น.</>}
                </p>}
                {hasCounts && <p className="text-xs text-slate-300" role="status">
                  พบ {sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length} รายการ
                </p>}
                {sidebarTab === "FLOOD" && (
                  <section aria-label="รายการน้ำท่วม" className="space-y-2">
                    {filteredFloods.map((flood) => (
                      <FloodCard
                        key={flood.id}
                        flood={flood}
                        selected={flood.id === selectedFloodId}
                        detourCount={detourCountByFloodId.get(flood.id) ?? 0}
                        onSelect={(item) => handleSelectFlood(item, false)}
                        onOpenDetours={handleOpenFloodDetourSection}
                      />
                    ))}
                  </section>
                )}
                {sidebarTab === "DETOUR" && hasCounts && detourList}
                {readState === "ready" && ((sidebarTab === "FLOOD" && filteredFloods.length === 0) || (sidebarTab === "DETOUR" && filteredDetours.length === 0)) && (
                  <div className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">
                    <p>{sidebarTab === "DETOUR" ? "ไม่พบเส้นทางเลี่ยงที่ตรงกับคำค้นหา" : totalFloodCount === 0 ? "ยังไม่มีรายงานจุดน้ำท่วม" : "ไม่พบจุดที่ตรงกับตัวกรอง"}</p>
                    {sidebarTab === "FLOOD" && totalFloodCount === 0 && <p className="mt-1 text-xs">ข้อมูลนี้ไม่ยืนยันว่าทุกเส้นทางปลอดภัย</p>}
                    {(searchQuery || selectedRouteFilter !== "ALL") && <button type="button" className="mt-2 min-h-11 font-bold text-amber-300" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }}>ล้างตัวกรอง</button>}
                  </div>
                )}
                {(readState === "stale" || readState === "unavailable") && <button type="button" onClick={() => void refetch()} className="min-h-11 w-full rounded-lg border border-amber-500/50 p-2 text-sm text-amber-300">โหลดข้อมูลล่าสุดไม่สำเร็จ · ลองใหม่</button>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
