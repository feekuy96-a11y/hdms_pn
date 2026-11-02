"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { WaterTimelineChart } from "@/components/charts/WaterTimelineChart";

const LongdoGisMap = dynamic(
  () => import("@/components/map/LongdoGisMap").then((mod) => mod.LongdoGisMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[350px] bg-[#0b1426] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-heading font-medium">กำลังโหลดแผนที่ GIS ปัตตานี...</span>
        </div>
      </div>
    ),
  }
);
import {
  AlertTriangle,
  Settings,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Navigation,
  Compass,
  Phone,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
} from "lucide-react";
import { extractDirectionalAdvice } from "@/lib/gis-utils";

export default function HomePage() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_ADMIN_URL
    : null;
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [showDossier, setShowDossier] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [citizenDetourDirection, setCitizenDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [isSummaryCardVisible, setIsSummaryCardVisible] = useState<boolean>(true);

  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);
  const previousDataFingerprint = useRef<string>("");

  // TanStack Query for Data Fetching & Sync with automatic background refetch (Issue #6)
  const { data: systemData = INITIAL_SYSTEM_DATA, isFetching, isError } = useQuery<SystemDataPayload>({
    queryKey: ["dohSystemData"],
    queryFn: async () => {
      return await getSystemDataAction();
    },
    initialData: INITIAL_SYSTEM_DATA,
    refetchInterval: 10000, // Poll every 10 seconds in background
    refetchIntervalInBackground: true,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Background Auto-Notification when new/updated data arrives (Issue #6)
  useEffect(() => {
    if (!systemData) return;
    const currentFingerprint = `${systemData.updatedAt || ""}_${systemData.floodRoutes?.length || 0}_${(systemData.floodRoutes || [])
      .map((r) => `${r.id}:${r.water_level_cm}:${r.traffic_status}:${r.updated_at}`)
      .join("|")}`;

    if (previousDataFingerprint.current && previousDataFingerprint.current !== currentFingerprint) {
      showToast("🔔 มีข้อมูลสถานการณ์อัปเดตล่าสุดจากศูนย์ปฏิบัติการ");
    }
    previousDataFingerprint.current = currentFingerprint;
  }, [systemData]);

  useEffect(() => {
    if (!showDossier) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeDetailsRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDossier(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [showDossier]);

  const selectedFlood =
    systemData.floodRoutes.find((r) => r.id === selectedFloodId) || systemData.floodRoutes[0];

  // Dynamic route chips strictly from database & imported files (Issue #7)
  const routeChips = React.useMemo(() => {
    const routeMap = new Map<string, string>();
    (systemData.floodRoutes || []).forEach((r) => {
      if (r.route_no) {
        const cleanNo = r.route_no.replace(/^ทล\.?/i, "").trim();
        const key = cleanNo || r.route_no;
        if (!routeMap.has(key)) {
          routeMap.set(key, `ทล.${key}`);
        }
      }
    });

    (systemData.highwayLayers || []).forEach((layer) => {
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        layer.geojson_data.features.forEach((f: any) => {
          const props = f.properties || {};
          const no = props.route_no || props.route_code || props.ROAD_NO || props.route || props.code;
          if (no) {
            const cleanNo = String(no).replace(/^ทล\.?/i, "").trim();
            const key = cleanNo || String(no);
            if (!routeMap.has(key)) {
              routeMap.set(key, `ทล.${key}`);
            }
          }
        });
      }
    });

    const dynamicList = Array.from(routeMap.entries()).map(([id, label]) => ({ id, label }));
    return [{ id: "ALL", label: "ทั้งหมด" }, ...dynamicList];
  }, [systemData.floodRoutes, systemData.highwayLayers]);

  // Filtered flood routes for citizens/users
  const filteredFloods = (systemData.floodRoutes || []).filter((r) => {
    if (!r.is_active) return false;
    const matchSearch =
      r.route_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.section_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.subdistrict && r.subdistrict.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase()));

    const cleanNo = r.route_no.replace(/^ทล\.?/i, "").trim();
    const matchChip = selectedRouteFilter === "ALL" || cleanNo === selectedRouteFilter || r.route_no === selectedRouteFilter;

    return matchSearch && matchChip;
  });


  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Status + Hotline)               */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between shadow-xl bg-[#091122]">
        <div className="flex items-center gap-3 min-w-0">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="w-10 h-10 rounded-xl object-contain shadow-md shrink-0 bg-slate-900 border border-slate-700 p-0.5"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
              <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
            </div>
          )}
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-heading font-black text-amber-400 text-xs sm:text-sm tracking-wide">
                {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
              </span>
              <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-1.5 py-0.2 rounded uppercase">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold hidden md:inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ออนไลน์ (ข้อมูลล่าสุด)
              </span>
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold text-slate-300 truncate">
              {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย (HDMS Real-Time GIS)"}
            </h1>
          </div>
        </div>

        {/* Right Actions: Hotline (Admin and manual refresh buttons removed for citizens) */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`tel:${systemData.systemSettings?.phone || "1586"}`}
            className="min-h-11 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-lg transition"
          >
            <Phone className="w-3.5 h-3.5" /> สายด่วน {systemData.systemSettings?.phone || "1586"}
          </a>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. MAIN LAYOUT: GIS MAP + COLLAPSIBLE SIDEBAR + DETAIL DOSSIER     */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row relative lg:overflow-hidden min-h-[calc(100vh-104px)] lg:h-[calc(100vh-104px)]">
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (DESKTOP COLLAPSIBLE)                 */}
        {/* ================================================================= */}
        <div
          className={`${
            isSidebarCollapsed ? "hidden" : "hidden lg:flex"
          } order-2 lg:order-1 w-full lg:w-[410px] xl:w-[440px] bg-[#0c1527] border-t lg:border-t-0 lg:border-r border-slate-800 flex-col shrink-0 z-20 lg:h-full overflow-hidden transition-all duration-300`}
        >
          {/* Sidebar Header & Search */}
          <div className="p-3.5 bg-[#091122] border-b border-slate-800 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="font-heading font-bold text-xs sm:text-sm text-white">
                  จุดเฝ้าระวังและน้ำท่วมทางหลวง ({filteredFloods.length} จุด)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                aria-label="ย่อรายการสายทาง"
                className="hidden lg:flex text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
                title="ย่อแถบข้างเพื่อขยายแผนที่เต็มจอ"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาสายทาง (ทล.43, ทล.42, ทล.418) หรือชื่อจุด/อำเภอ..."
                aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                className="min-h-11 w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              />
            </div>

            {/* Route Quick Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              {routeChips.map((chip) => {
                const isActive = selectedRouteFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setSelectedRouteFilter(chip.id)}
                    aria-pressed={isActive}
                    className={`min-h-11 px-3 py-1 rounded-lg font-heading font-bold whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      isActive
                        ? "bg-amber-500 text-slate-950 shadow-md"
                        : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Incident Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredFloods.map((flood) => {
              const isSelected = flood.id === selectedFloodId;
              const isClosed = flood.traffic_status === "CLOSED";
              const isWarning = flood.traffic_status === "WARNING";

              return (
                <button
                  key={flood.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedFloodId(flood.id);
                    setShowDossier(true);
                    if (flood.lat_start && flood.lon_start) {
                      setFocusCoordinates([flood.lon_start, flood.lat_start]);
                    }
                  }}
                  className={`block w-full text-left min-h-20 p-3 rounded-2xl border transition cursor-pointer shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                    isSelected
                      ? "bg-slate-900 ring-2 ring-amber-400 border-transparent shadow-amber-500/10"
                      : "bg-[#0f1b33] border-slate-800/90 hover:border-slate-700"
                  }`}
                  style={{
                    borderLeftWidth: "1px",
                    borderLeftColor: isClosed ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981",
                  }}
                >
                  {/* Top Line: Badge, Section Name, Traffic Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="bg-amber-400 text-slate-950 font-heading font-black text-[10px] px-1.5 py-0.2 rounded">
                          ทล.{flood.route_no}
                        </span>
                        <span className="text-slate-400 text-[10px]">
                          กม.{flood.km_start} - {flood.km_end}
                        </span>
                      </div>
                      <h3 className="font-heading font-bold text-xs sm:text-sm text-white truncate">
                        {flood.section_name}
                      </h3>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border shrink-0 ${
                        isClosed
                          ? "bg-red-500/20 text-red-400 border-red-500/40 alert-badge-pulse"
                          : isWarning
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      }`}
                    >
                      {isClosed
                        ? "⛔ ปิดทาง / ทางเบี่ยง"
                        : isWarning
                        ? `⚠️ รถเล็กห้ามผ่าน (${flood.water_level_cm} ซม.)`
                        : "✅ ผ่านได้ปกติ"}
                    </span>
                  </div>

                  {/* Middle Line: Timestamp & Latest Update Note */}
                  <div className="mt-2 text-[11px] text-slate-300 flex items-start gap-1.5 bg-slate-950/40 p-2 rounded-xl">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-2">
                        {flood.detour_advice
                          ? `คำแนะนำ: ${flood.detour_advice}`
                          : `ระดับน้ำ ${flood.water_level_cm} ซม. รายงานสถานการณ์ล่าสุด`}
                      </p>
                    </div>
                    <span className="text-amber-400 font-bold hover:underline shrink-0 text-[10px]">
                      ดูไทม์ไลน์ &gt;
                    </span>
                  </div>

                  {/* Detour Route Advice if available */}
                  {flood.detour_advice && (
                    <div className="mt-1.5 text-[10px] text-amber-200/90 flex items-center gap-1 font-mono">
                      <Compass className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">ทางเลี่ยง: {flood.detour_advice}</span>
                    </div>
                  )}
                </button>
              );
            })}
            {filteredFloods.length === 0 && (
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-6 text-center text-sm space-y-2.5">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="font-heading font-bold text-white text-xs">
                  {systemData.floodRoutes.length === 0
                    ? "ยังไม่มีรายงานจุดน้ำท่วม"
                    : "ไม่พบจุดที่ตรงกับตัวกรอง"}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {systemData.floodRoutes.length === 0
                    ? "ยังไม่มีรายงานในระบบ ข้อมูลนี้ไม่ยืนยันว่าทุกเส้นทางปลอดภัย โปรดตรวจสอบกับสายด่วน 1586 ก่อนเดินทาง"
                    : "กรุณาลองเปลี่ยนคำค้นหา หรือกดปุ่มด้านล่างเพื่อล้างตัวกรอง"}
                </p>
                {systemData.floodRoutes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedRouteFilter("ALL");
                    }}
                    className="mt-3 min-h-11 rounded-lg border border-amber-400 px-4 font-bold text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Bottom Footer: Call Contact */}
          <div className="p-3 bg-[#091122] border-t border-slate-800 text-xs flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[11px] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: 073-336-000
            </span>
            {adminUrl && <a href={adminUrl} className="text-[11px] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</a>}
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="order-1 lg:order-2 relative h-[calc(100vh-64px)] lg:h-full flex-1 w-full overflow-hidden bg-[#0b1426]">
          {/* Floating Expand Sidebar Button (when collapsed on desktop) */}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="hidden lg:flex absolute top-4 left-4 z-[400] bg-slate-950/95 hover:bg-slate-900 text-amber-400 border border-amber-400/50 px-3 py-2 rounded-xl shadow-2xl items-center gap-2 text-xs font-heading font-bold transition"
            >
              <ChevronRight className="w-4 h-4" /> แสดงรายการสายทาง
            </button>
          )}

          <LongdoGisMap
            publicMode
            isSidebarCollapsed={isSidebarCollapsed}
            systemData={systemData}
            selectedFloodId={selectedFloodId}
            onSelectFlood={(id) => {
              setSelectedFloodId(id);
              setShowDossier(true);
              setIsMobileDrawerOpen(false);
              const flood = systemData.floodRoutes.find((r) => r.id === id);
              if (flood && flood.lat_start && flood.lon_start) {
                setFocusCoordinates([flood.lon_start, flood.lat_start]);
              }
            }}
            focusCoordinates={focusCoordinates}
            className="h-full w-full"
          />

          {/* =============================================================== */}
          {/* C. MOBILE FLOATING ACTION BAR & BOTTOM SHEET DRAWER             */}
          {/* =============================================================== */}
          {/* 1. Floating bottom pill on mobile when drawer & dossier are closed */}
          {!isMobileDrawerOpen && !showDossier && (
            <div className="lg:hidden fixed bottom-3 inset-x-3 z-[450] bg-[#091122]/95 backdrop-blur-md border border-amber-500/50 p-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <div className="truncate">
                  <div className="text-xs font-heading font-bold text-white truncate">
                    จุดเฝ้าระวังและน้ำท่วม ({filteredFloods.length} จุด)
                  </div>
                  <div className="text-[10px] text-amber-300 font-mono truncate">
                    ปิดทาง {systemData.floodRoutes.filter((r) => r.traffic_status === "CLOSED").length} จุด · ห้ามผ่าน {systemData.floodRoutes.filter((r) => r.traffic_status === "WARNING").length} จุด
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black text-xs px-3.5 py-2 rounded-xl shadow-lg flex items-center gap-1.5 shrink-0 transition"
              >
                <Search className="w-3.5 h-3.5" />
                <span>ดูรายการสายทาง</span>
              </button>
            </div>
          )}

          {/* 2. Slide-up Drawer on mobile */}
          {isMobileDrawerOpen && (
            <div className="lg:hidden fixed inset-0 z-[650] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
              <div className="flex-1" onClick={() => setIsMobileDrawerOpen(false)} />
              <div className="bg-[#0c1527] border-t-2 border-amber-500 rounded-t-3xl max-h-[82vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-3 bg-[#091122] border-b border-slate-800 space-y-2.5 shrink-0">
                  <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto mb-1" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <h2 className="font-heading font-bold text-sm text-white">
                        จุดเฝ้าระวังและน้ำท่วมทางหลวง ({filteredFloods.length} จุด)
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMobileDrawerOpen(false)}
                      aria-label="ปิดรายการสายทาง"
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาสายทาง (ทล.43, ทล.42, ทล.418)..."
                      className="min-h-11 w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-400"
                    />
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                    {routeChips.map((chip) => {
                      const isActive = selectedRouteFilter === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setSelectedRouteFilter(chip.id)}
                          className={`min-h-10 px-3 py-1 rounded-lg font-heading font-bold whitespace-nowrap transition ${
                            isActive
                              ? "bg-amber-500 text-slate-950 shadow-md"
                              : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {filteredFloods.map((flood) => {
                    const isSelected = flood.id === selectedFloodId;
                    const isClosed = flood.traffic_status === "CLOSED";
                    const isWarning = flood.traffic_status === "WARNING";

                    return (
                      <button
                        key={flood.id}
                        type="button"
                        onClick={() => {
                          setSelectedFloodId(flood.id);
                          setShowDossier(true);
                          setIsMobileDrawerOpen(false);
                          if (flood.lat_start && flood.lon_start) {
                            setFocusCoordinates([flood.lon_start, flood.lat_start]);
                          }
                        }}
                        className={`block w-full text-left p-3 rounded-2xl border transition shadow-md ${
                          isSelected
                            ? "bg-slate-900 ring-2 ring-amber-400 border-transparent shadow-amber-500/10"
                            : "bg-[#0f1b33] border-slate-800/90 hover:border-slate-700"
                        }`}
                        style={{
                          borderLeftWidth: "4px",
                          borderLeftColor: isClosed ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="bg-amber-400 text-slate-950 font-heading font-black text-[10px] px-1.5 py-0.2 rounded">
                                ทล.{flood.route_no}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                กม.{flood.km_start} - {flood.km_end}
                              </span>
                            </div>
                            <h3 className="font-heading font-bold text-xs sm:text-sm text-white truncate">
                              {flood.section_name}
                            </h3>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border shrink-0 ${
                              isClosed
                                ? "bg-red-500/20 text-red-400 border-red-500/40"
                                : isWarning
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            }`}
                          >
                            {isClosed
                              ? "⛔ ปิดทาง / ทางเบี่ยง"
                              : isWarning
                              ? `⚠️ รถเล็กห้ามผ่าน (${flood.water_level_cm} ซม.)`
                              : "✅ ผ่านได้ปกติ"}
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-300 flex items-start gap-1.5 bg-slate-950/40 p-2 rounded-xl">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="line-clamp-2">
                              {flood.detour_advice
                                ? `คำแนะนำ: ${flood.detour_advice}`
                                : `ระดับน้ำ ${flood.water_level_cm} ซม. รายงานสถานการณ์ล่าสุด`}
                            </p>
                          </div>
                          <span className="text-amber-400 font-bold hover:underline shrink-0 text-[10px]">
                            ดูไทม์ไลน์ &gt;
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* D. FLOATING DETAIL DOSSIER CARD (COLLAPSIBLE / DISMISSIBLE)     */}
          {/* =============================================================== */}
          {selectedFlood && !showDossier && isSummaryCardVisible && (
            <div className="hidden lg:block absolute bottom-3 left-3 right-3 z-[500] rounded-2xl bg-[#0c162c]/95 border border-slate-700/80 p-3.5 shadow-2xl lg:right-auto lg:w-[430px] backdrop-blur-md animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-black px-1.5 py-0.2 rounded">
                      ทล.{selectedFlood.route_no}
                    </span>
                    <span className="text-xs text-amber-300 font-medium">
                      กม.{selectedFlood.km_start}–{selectedFlood.km_end}
                    </span>
                  </div>
                  <h2 className="font-heading text-sm font-bold text-white truncate">
                    {selectedFlood.traffic_status === "CLOSED"
                      ? "⛔ ปิดการจราจร"
                      : selectedFlood.traffic_status === "WARNING"
                      ? "⚠️ รถเล็กห้ามผ่าน"
                      : "✅ ผ่านได้ปกติ"}{" "}
                    · {selectedFlood.section_name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSummaryCardVisible(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  title="ย่อแถบรายงานข้อมูล"
                  aria-label="ย่อแถบรายงานข้อมูล"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                <span className="text-xs text-slate-300">
                  ระดับน้ำ{" "}
                  <strong className="text-red-400 font-mono font-bold">
                    {selectedFlood.water_level_cm} ซม.
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setShowDossier(true)}
                  className="min-h-9 shrink-0 rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950 transition shadow"
                >
                  ดูรายละเอียด & ไทม์ไลน์
                </button>
              </div>
            </div>
          )}

          {/* Floating Pill to Restore Summary Card if Dismissed */}
          {selectedFlood && !showDossier && !isSummaryCardVisible && (
            <button
              type="button"
              onClick={() => setIsSummaryCardVisible(true)}
              className="hidden lg:flex absolute bottom-3 left-3 z-[500] bg-[#0c162c]/95 hover:bg-[#0f1d3a] text-amber-300 border border-amber-400/50 px-3 py-2 rounded-xl shadow-xl items-center gap-2 text-xs font-heading font-bold transition backdrop-blur-md"
              title="เปิดแถบรายงานข้อมูล"
            >
              <span>📊 แสดงแถบรายงานข้อมูล ทล.{selectedFlood.route_no}</span>
            </button>
          )}
          {selectedFlood && showDossier && (
            <div role="dialog" aria-modal="false" aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`} className="fixed inset-x-2 bottom-2 z-[700] max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700/80 bg-[#0c162c] text-slate-100 shadow-2xl lg:absolute lg:bottom-4 lg:left-4 lg:right-auto lg:w-[500px] lg:max-h-[80vh]">
              {/* Pull handle on mobile */}
              <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto my-2 lg:hidden" />
              {/* Header: Dark Navy Header with Badge, Section Title, KM Range & Action Buttons */}
              <div className="sticky top-0 z-20 bg-[#0c1a30] text-white p-3.5 border-b border-slate-800 flex items-start justify-between gap-2 shadow-md">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#f59e0b] text-slate-950 font-heading font-black text-xs px-2.5 py-1 rounded-md shadow shrink-0">
                      ทล.{selectedFlood.route_no}
                    </span>
                    <h3 className="font-heading font-bold text-sm sm:text-base text-white truncate">
                      {selectedFlood.section_name}
                    </h3>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    กม.{selectedFlood.km_start} ถึง กม.{selectedFlood.km_end} ({selectedFlood.subdistrict || selectedFlood.district || "อ.หนองจิก"}) • พิกัด {selectedFlood.lat_start.toFixed(4)}, {selectedFlood.lon_start.toFixed(4)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Close Dossier Button */}
                  <button
                    ref={closeDetailsRef}
                    type="button"
                    onClick={() => setShowDossier(false)}
                    aria-label="ปิดรายละเอียด"
                    className="min-h-11 min-w-11 p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    title="ปิดหน้าต่างรายละเอียด"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-4 space-y-3.5">
                {/* 2-Column Section: Photo & Current Water Level */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  {/* Left: Photo with GPS overlay */}
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 group">
                    <img
                      src={
                        selectedFlood.latest_photo_url || undefined
                      }
                      alt={selectedFlood.section_name}
                      className="w-full h-36 object-cover"
                    />
                    {/* Animated Alert Badge Overlay on photo */}
                    <div className="absolute top-2 left-2 z-10">
                      {selectedFlood.traffic_status === "CLOSED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-heading font-black text-white bg-red-600/95 alert-badge-pulse shadow-xl">
                          ⛔ ผ่านไม่ได้ (รถทุกชนิด)
                        </span>
                      ) : selectedFlood.traffic_status === "WARNING" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-heading font-black text-slate-950 bg-amber-400/95 warning-badge-pulse shadow-xl">
                          ⚠️ รถเล็กห้ามผ่าน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-heading font-black text-white bg-emerald-600/95 shadow-xl">
                          ✅ ผ่านได้ปกติ
                        </span>
                      )}
                    </div>
                    <div className="p-1.5 bg-slate-950/90 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>📍 ภาพถ่ายหน้างานพร้อมพิกัด GPS: {selectedFlood.lat_start.toFixed(3)}, {selectedFlood.lon_start.toFixed(3)}</span>
                    </div>
                  </div>

                  {/* Right: Water Level Stat & Traffic Advisory */}
                  <div className="bg-[#0f1b33] p-3 rounded-xl border border-slate-800 flex flex-col justify-between h-36">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-heading font-bold text-slate-400 uppercase">
                          ระดับน้ำปัจจุบัน
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-heading font-bold ${
                          selectedFlood.trend === "RISING"
                            ? "bg-rose-950/80 text-rose-300 border border-rose-800"
                            : selectedFlood.trend === "FALLING"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                            : "bg-amber-950/80 text-amber-300 border border-amber-800"
                        }`}>
                          แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : "ทรงตัว"}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="font-heading font-black text-4xl sm:text-5xl text-red-500 font-mono tracking-tight">
                          {selectedFlood.water_level_cm}
                        </span>
                        <span className="text-xs text-slate-300 font-bold">เซนติเมตร (ซม.)</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-start gap-1.5 text-xs text-slate-300">
                        <span className="text-red-500 font-bold shrink-0">
                          {selectedFlood.traffic_status === "CLOSED" ? "⛔" : "⚠️"}
                        </span>
                        <p className="text-[11px] leading-tight">
                          {selectedFlood.traffic_status === "CLOSED"
                            ? "รถเก๋ง/รถกระบะเตี้ยห้ามผ่านเด็ดขาด ให้ใช้ทางเบี่ยงสีเหลือง"
                            : "รถเล็กห้ามผ่าน รถกระบะยกสูงและรถบรรทุกผ่านได้ ระมัดระวัง"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detour Recommendation Box (Yellow Banner) */}
                <div className="bg-amber-500/10 border border-amber-400/50 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs font-heading font-bold">
                      <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>คำแนะนำเส้นทางเลี่ยงน้ำท่วม (Yellow Line)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Direction Switcher Toggle if bidirectional advice exists */}
                      {(() => {
                        const ext = extractDirectionalAdvice(selectedFlood.detour_advice || "");
                        if (!ext.hasBoth) return null;
                        return (
                          <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-amber-500/40 text-[10px] font-heading font-bold">
                            <button
                              type="button"
                              onClick={() => setCitizenDetourDirection("FORWARD")}
                              className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                                citizenDetourDirection === "FORWARD"
                                  ? "bg-amber-500 text-slate-950 shadow"
                                  : "text-amber-300/80 hover:text-white"
                              }`}
                            >
                              <span>🚗 ขาไป (A → B)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCitizenDetourDirection("REVERSE")}
                              className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                                citizenDetourDirection === "REVERSE"
                                  ? "bg-amber-500 text-slate-950 shadow"
                                  : "text-amber-300/80 hover:text-white"
                              }`}
                            >
                              <span>🚙 ขากลับ (B → A)</span>
                            </button>
                          </div>
                        );
                      })()}

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFlood.lat_start},${selectedFlood.lon_start}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md shrink-0 transition"
                      >
                        <Navigation className="w-3.5 h-3.5" /> นำทาง
                      </a>
                    </div>
                  </div>

                  {/* Detour Text Content with Direction Handling */}
                  {(() => {
                    if (!selectedFlood.detour_advice) {
                      return (
                        <p className="text-[11px] text-amber-100/90 leading-snug">
                          ยังไม่มีคำแนะนำเส้นทางเลี่ยงที่ยืนยันแล้ว โปรดโทร 1586 ก่อนเดินทาง
                        </p>
                      );
                    }
                    const ext = extractDirectionalAdvice(selectedFlood.detour_advice);
                    const displayText = ext.hasBoth
                      ? citizenDetourDirection === "FORWARD"
                        ? ext.forward
                        : ext.reverse
                      : selectedFlood.detour_advice;

                    return (
                      <div className="bg-slate-950/70 p-3 rounded-lg border border-amber-500/20 text-xs text-amber-100/95 leading-relaxed font-sans whitespace-pre-line max-h-56 overflow-y-auto">
                        {displayText}
                      </div>
                    );
                  })()}
                </div>

                {/* Timeline Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-heading font-bold text-white">
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span>📈</span> ไทม์ไลน์ระดับน้ำแต่ละช่วงเวลา (Water Level Timeline)
                    </span>
                    <span className="text-[10px] text-amber-300 font-normal">+ อัปเดตระดับน้ำล่าสุด</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 h-28 w-full">
                    <WaterTimelineChart
                      timelineUpdates={systemData.timelineUpdates}
                      floodId={selectedFlood.id}
                    />
                  </div>

                  {/* Recent Timeline History Updates */}
                  <div className="space-y-1.5 max-h-24 overflow-y-auto">
                    {systemData.timelineUpdates
                      .filter((u) => u.flood_id_ref === selectedFlood.id)
                      .slice(0, 3)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="text-[11px] bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center justify-between"
                        >
                          <span className="text-slate-300 truncate mr-2">
                            <strong className="text-amber-400 font-mono">
                              {new Date(item.reported_at).toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })} น.
                            </strong>{" "}
                            {item.remark}
                          </span>
                          <strong className="text-red-400 font-bold font-mono shrink-0">
                            {item.water_level_cm} ซม.
                          </strong>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Toast Notification */}
      {(toastMessage || isError) && (
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[9999] bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage || "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง"}</span>
        </div>
      )}
    </div>
  );
}
