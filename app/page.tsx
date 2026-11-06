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
      <div className="h-full min-h-[350px] w-full bg-[#0b1426] p-4" role="status" aria-live="polite">
        <span className="sr-only">กำลังโหลดแผนที่ GIS ปัตตานี</span>
        <div aria-hidden="true" className="h-full min-h-[318px] rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="h-5 w-40 rounded-md bg-slate-700/70 animate-pulse motion-reduce:animate-none" />
          <div className="mt-4 h-8 w-56 rounded-xl bg-slate-800/80 animate-pulse motion-reduce:animate-none" />
          <div className="mt-6 grid h-[calc(100%-7rem)] grid-cols-3 gap-3 opacity-60">
            <div className="rounded-xl bg-slate-800/80 animate-pulse motion-reduce:animate-none" />
            <div className="rounded-xl bg-slate-700/50 animate-pulse motion-reduce:animate-none" />
            <div className="rounded-xl bg-slate-800/70 animate-pulse motion-reduce:animate-none" />
          </div>
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
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";

type TrafficStatus = "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE";

function getTrafficPresentation(status: TrafficStatus, waterLevelCm: number) {
  switch (status) {
    case "CLOSED":
      return { label: "ผ่านไม่ได้", detail: "รถทุกชนิดผ่านไม่ได้", icon: "⛔", color: "red" as const };
    case "LIGHT_VEHICLES_ONLY":
      return { label: "รถเล็กผ่านได้", detail: "อนุญาตเฉพาะรถขนาดเล็ก", icon: "🚗", color: "sky" as const };
    case "ONE_LANE":
      return { label: "รถเล็กผ่านได้ ๑ ช่องทาง", detail: "เปิดการจราจรหนึ่งช่องทาง", icon: "↔️", color: "amber" as const };
    case "WARNING":
      return { label: "รถเล็กผ่านไม่ได้", detail: `ระดับน้ำ ${waterLevelCm} ซม.`, icon: "⚠️", color: "amber" as const };
    default:
      return { label: "ผ่านได้ปกติ", detail: "การจราจรผ่านได้ตามปกติ", icon: "✅", color: "emerald" as const };
  }
}

export default function HomePage() {
  const isPollingActive = usePollingActivity();
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

  // TanStack Query for Data Fetching & Sync with automatic background refetch (Network-First live data)
  const { data: systemData = INITIAL_SYSTEM_DATA, isPending, isError, refetch } = useQuery<SystemDataPayload>({
    queryKey: ["dohSystemData"],
    queryFn: async () => {
      return await getSystemDataAction();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: isPollingActive ? 30 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });
  useSystemFavicon(systemData.systemSettings?.logoUrl, systemData.systemSettings?.name, systemData.systemSettings?.org);

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
  const activeDetours = (systemData.detourRoutes || []).filter((route) => route.is_active);
  const filteredDetours = activeDetours.filter((route) => `${route.route_name} ${route.description || ""}`.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  const selectedFloodDetours = selectedFlood
    ? activeDetours.filter((route) => route.flood_id_ref === selectedFlood.id)
    : [];
  const detourList = filteredDetours.length > 0 && (
    <section className="space-y-2 rounded-xl border border-amber-700/50 bg-slate-900 p-3" aria-label="รายการทางเลี่ยง">
      <h3 className="font-heading font-bold text-amber-300">ทางเลี่ยง ({filteredDetours.length} เส้นทาง)</h3>
      {filteredDetours.map((route) => <button key={route.id} type="button" className="block min-h-11 w-full rounded-lg border border-slate-700 p-3 text-left text-sm text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400" onClick={() => { if (Number.isFinite(route.lon_start) && Number.isFinite(route.lat_start)) setFocusCoordinates([route.lon_start, route.lat_start]); setIsMobileDrawerOpen(false); }}><span className="flex items-center justify-between gap-2"><strong>{route.route_name}</strong><span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{route.flood_id_ref ? "ผูกจุดน้ำท่วม" : "ทางเลี่ยงอิสระ"}</span></span><span className="mt-1 block text-xs text-slate-300">{route.description || "เลือกเพื่อดูตำแหน่งบนแผนที่"}</span></button>)}
    </section>
  );


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
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>
              <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-1.5 py-0.2 rounded uppercase">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold hidden md:inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"></span> <span className="tracking-wide">LIVE</span>
              </span>
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold text-slate-300 truncate">
              {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
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
      <div className="flex flex-col lg:flex-row relative lg:overflow-hidden" style={{ height: "calc(100dvh - 64px)", minHeight: 450 }}>
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
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none" />
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
            {detourList}
            {filteredFloods.map((flood) => {
              const isSelected = flood.id === selectedFloodId;
              const status = getTrafficPresentation(flood.traffic_status, flood.water_level_cm);

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
                    borderLeftColor: status.color === "red" ? "#ef4444" : status.color === "amber" ? "#f59e0b" : status.color === "sky" ? "#38bdf8" : "#10b981",
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
                        status.color === "red"
                          ? "bg-red-500/20 text-red-400 border-red-500/40 alert-badge-pulse"
                          : status.color === "amber"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : status.color === "sky"
                          ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      }`}
                    >
                      {status.icon} {status.label}
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
                {(searchQuery || selectedRouteFilter !== "ALL") && (
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
          {isPending && (
            <div role="status" aria-live="polite" className="absolute left-1/2 top-4 z-[600] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/95 px-4 py-3 text-sm text-white shadow-xl">
              กำลังโหลดข้อมูลสถานการณ์ล่าสุด…
            </div>
          )}
          {isError && systemData.floodRoutes.length === 0 && systemData.detourRoutes.length === 0 && (
            <div role="alert" className="absolute left-1/2 top-4 z-[600] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/60 bg-slate-950/95 px-4 py-3 text-sm text-white shadow-xl">
              <span>โหลดข้อมูลสถานการณ์ไม่สำเร็จ</span>
              <button type="button" onClick={() => void refetch()} className="min-h-11 rounded-lg bg-amber-400 px-3 font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">ลองอีกครั้ง</button>
            </div>
          )}
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
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping motion-reduce:animate-none" />
   
