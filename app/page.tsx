"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload, FloodRoute } from "@/db/default-data";

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
// Chart.js + react-chartjs-2 are only needed once a flood dossier is open, so keep them out of the
// initial bundle that every visitor downloads.
const WaterTimelineChart = dynamic(
  () => import("@/components/charts/WaterTimelineChart").then((mod) => mod.WaterTimelineChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">กำลังโหลดกราฟระดับน้ำ...</div>
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
  Droplets,
} from "lucide-react";
import { extractDirectionalAdvice, splitDetourAdviceByDirection } from "@/lib/gis-utils";
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

type StatusColor = ReturnType<typeof getTrafficPresentation>["color"];

// Most severe first, so the points citizens must avoid are always at the top of the list.
const STATUS_ORDER: Record<StatusColor, number> = { red: 0, amber: 1, sky: 2, emerald: 3 };
const STATUS_BAR: Record<StatusColor, string> = { red: "#ef4444", amber: "#f59e0b", sky: "#38bdf8", emerald: "#10b981" };
const STATUS_CHIP: Record<StatusColor, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/50",
  amber: "bg-amber-500/15 text-amber-200 border-amber-500/50",
  sky: "bg-sky-500/15 text-sky-200 border-sky-500/50",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-500/50",
};
const SUMMARY_ITEMS: ReadonlyArray<{ color: StatusColor; label: string; dot: string }> = [
  { color: "red", label: "ผ่านไม่ได้", dot: "bg-red-500" },
  { color: "amber", label: "เฝ้าระวัง", dot: "bg-amber-500" },
  { color: "sky", label: "รถเล็กผ่านได้", dot: "bg-sky-400" },
  { color: "emerald", label: "ผ่านได้ปกติ", dot: "bg-emerald-500" },
];

function SituationSummary({ counts }: { counts: Record<StatusColor, number> }) {
  const visible = SUMMARY_ITEMS.filter((item) => counts[item.color] > 0);
  if (visible.length === 0) return <p className="text-xs text-slate-300">ยังไม่มีจุดเฝ้าระวังที่รายงานในขณะนี้</p>;
  return (
    <ul aria-label="สรุปสถานการณ์ทุกจุด" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-200">
      {visible.map((item) => (
        <li key={item.color} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
          <strong className="font-mono text-sm text-white">{counts[item.color]}</strong> {item.label}
        </li>
      ))}
    </ul>
  );
}

// One card for the desktop sidebar and the mobile sheet (they used to be two diverging copies).
function FloodCard({ flood, selected, onSelect }: { flood: FloodRoute; selected: boolean; onSelect: (flood: FloodRoute) => void }) {
  const status = getTrafficPresentation(flood.traffic_status as TrafficStatus, flood.water_level_cm);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(flood)}
      className={`relative block w-full overflow-hidden rounded-2xl border py-3 pl-4 pr-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
        selected ? "border-amber-400/70 bg-slate-900 ring-1 ring-amber-400/60" : "border-slate-800 bg-[#0f1b33] hover:border-slate-600"
      }`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: STATUS_BAR[status.color] }} />
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-amber-400 px-2 py-0.5 font-heading text-xs font-black text-slate-950">ทล.{flood.route_no}</span>
          <span className="truncate text-xs text-slate-300">กม.{flood.km_start} - {flood.km_end}</span>
        </span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 font-heading text-xs font-bold ${STATUS_CHIP[status.color]}`}>
          {status.icon} {status.label}
        </span>
      </span>
      <span className="mt-2 line-clamp-2 block font-heading text-sm font-bold leading-snug text-white">{flood.section_name}</span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Droplets aria-hidden="true" className="h-4 w-4 text-sky-300" />
          ระดับน้ำ <strong className="font-mono text-sm text-white">{flood.water_level_cm}</strong> ซม.
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-amber-300">
          รายละเอียด <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </span>
      {flood.detour_advice && (
        <span className="mt-2 flex items-start gap-1.5 rounded-lg bg-slate-950/50 px-2 py-1.5 text-xs text-amber-100">
          <Compass aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="line-clamp-2">ทางเลี่ยง: {flood.detour_advice}</span>
        </span>
      )}
    </button>
  );
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
      return await getPublicSystemDataAction();
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

  // Parsing the advice text is regex heavy; do it once per advice text, not on every render.
  const selectedFloodKey = selectedFlood?.id;
  const selectedFloodAdvice = selectedFlood?.detour_advice || "";
  const directionalAdvice = React.useMemo(() => extractDirectionalAdvice(selectedFloodAdvice), [selectedFloodAdvice]);
  // Latest 3 updates of the selected flood, computed once per data/selection change.
  const selectedFloodRecentUpdates = React.useMemo(
    () => (selectedFloodKey ? systemData.timelineUpdates.filter((u) => u.flood_id_ref === selectedFloodKey).slice(0, 3) : []),
    [systemData.timelineUpdates, selectedFloodKey]
  );

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
  }).sort(
    (a, b) =>
      STATUS_ORDER[getTrafficPresentation(a.traffic_status as TrafficStatus, a.water_level_cm).color] -
      STATUS_ORDER[getTrafficPresentation(b.traffic_status as TrafficStatus, b.water_level_cm).color]
  );
  const situationCounts = React.useMemo(() => {
    const counts: Record<StatusColor, number> = { red: 0, amber: 0, sky: 0, emerald: 0 };
    (systemData.floodRoutes || []).forEach((route) => {
      if (route.is_active) counts[getTrafficPresentation(route.traffic_status as TrafficStatus, route.water_level_cm).color] += 1;
    });
    return counts;
  }, [systemData.floodRoutes]);
  const activeFloodCount = situationCounts.red + situationCounts.amber + situationCounts.sky + situationCounts.emerald;
  const dossierStatus = getTrafficPresentation((selectedFlood?.traffic_status ?? "PASSABLE") as TrafficStatus, selectedFlood?.water_level_cm ?? 0);
  const handleSelectFlood = (flood: FloodRoute) => {
    setSelectedFloodId(flood.id);
    setShowDossier(true);
    setIsMobileDrawerOpen(false);
    if (flood.lat_start && flood.lon_start) setFocusCoordinates([flood.lon_start, flood.lat_start]);
  };
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
    <div className="doh-readable min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Status + Hotline)               */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between gap-2 shadow-xl bg-[#091122]">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md shrink-0 bg-slate-900 border border-slate-700 p-0.5"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
              <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-heading font-black text-amber-400 text-[13px] sm:text-sm tracking-wide">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>
              <span className="hidden md:inline-block shrink-0 bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-1.5 py-0.2 rounded">
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
            aria-label={`โทรสายด่วน ${systemData.systemSettings?.phone || "1586"}`}
            className="min-h-11 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-sm px-3 sm:px-3.5 py-1.5 rounded-xl shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">สายด่วน</span>
            <span className="font-mono">{systemData.systemSettings?.phone || "1586"}</span>
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

            <SituationSummary counts={situationCounts} />

            {/* Search Input Box */}
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาสายทาง (ทล.43, ทล.42, ทล.418) หรือชื่อจุด/อำเภอ..."
                aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                className="min-h-11 w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
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
            {filteredFloods.map((flood) => (
              <FloodCard key={flood.id} flood={flood} selected={flood.id === selectedFloodId} onSelect={handleSelectFlood} />
            ))}
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
        <div className="order-1 lg:order-2 relative h-[calc(100dvh-64px)] lg:h-full flex-1 w-full overflow-hidden bg-[#0b1426]">
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
          {/* 1. Situation bar on mobile when drawer & dossier are closed */}
          {!isMobileDrawerOpen && !showDossier && (
            <div className="lg:hidden fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[450] rounded-2xl border border-amber-500/50 bg-[#091122]/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-heading text-sm font-bold text-white">จุดเฝ้าระวังน้ำท่วม {activeFloodCount} จุด</p>
                  <SituationSummary counts={situationCounts} />
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className="min-h-12 shrink-0 rounded-xl bg-amber-500 px-4 font-heading text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white flex items-center gap-1.5"
                >
                  <Search className="h-4 w-4" />
                  <span>ดูรายการสายทาง</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Slide-up Drawer on mobile */}
          {isMobileDrawerOpen && (
            <div className="lg:hidden fixed inset-0 z-[650] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
              <div className="flex-1" onClick={() => setIsMobileDrawerOpen(false)} />
              <div role="dialog" aria-modal="true" aria-label="รายการสายทางและจุดเฝ้าระวัง" className="bg-[#0c1527] border-t-2 border-amber-500 rounded-t-3xl max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-3 bg-[#091122] border-b border-slate-800 space-y-2.5 shrink-0">
                  <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto mb-1" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none" />
                      <h2 className="font-heading font-bold text-sm text-white">
                        จุดเฝ้าระวังและน้ำท่วมทางหลวง ({filteredFloods.length} จุด)
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMobileDrawerOpen(false)}
                      aria-label="ปิดรายการสายทาง"
                      className="grid h-11 w-11 place-items-center rounded-lg bg-slate-800 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <SituationSummary counts={situationCounts} />

                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาสายทาง (ทล.43, ทล.42, ทล.418)..."
                      aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                      inputMode="search"
                      className="min-h-11 w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-400"
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
                          className={`min-h-11 px-3 py-1 rounded-lg font-heading font-bold whitespace-nowrap transition ${
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

                <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
                  {detourList}
                  {filteredFloods.length === 0 && <div className="rounded-xl border border-slate-700 p-4 text-slate-300 text-sm"><p>{systemData.floodRoutes.length === 0 ? "ยังไม่มีรายงานจุดน้ำท่วม" : "ไม่พบจุดที่ตรงกับตัวกรอง"}</p><button type="button" className="mt-3 min-h-11 text-amber-300" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }}>ล้างตัวกรอง</button></div>}
                  {filteredFloods.map((flood) => (
                    <FloodCard key={flood.id} flood={flood} selected={flood.id === selectedFloodId} onSelect={handleSelectFlood} />
                  ))}
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
                    {dossierStatus.icon} {dossierStatus.label}{" "}
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
            <div
              className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/65 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowDossier(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
                className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700/80 bg-[#0c162c] text-slate-100 shadow-2xl sm:max-h-[90vh] sm:max-w-[560px] sm:rounded-3xl"
              >
                {/* Header: what is it, how bad is it, when was it updated */}
                <div className="sticky top-0 z-20 border-b border-slate-800 bg-[#0c1a30] px-4 pb-3 pt-2 shadow-md">
                  <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="shrink-0 rounded-md bg-[#f59e0b] px-2.5 py-1 font-heading text-xs font-black text-slate-950 shadow">
                          ทล.{selectedFlood.route_no}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 font-heading text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                          {dossierStatus.icon} {dossierStatus.label}
                        </span>
                      </div>
                      <h3 className="font-heading text-base font-bold leading-snug text-white">{selectedFlood.section_name}</h3>
                      <p className="text-xs text-slate-300">
                        กม.{selectedFlood.km_start} ถึง กม.{selectedFlood.km_end} ({selectedFlood.subdistrict || selectedFlood.district || "อ.หนองจิก"})
                      </p>
                      {(selectedFlood.road_side || selectedFlood.affected_lanes) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {selectedFlood.road_side && (
                            <span className="rounded bg-sky-950/90 border border-sky-700/80 px-2 py-0.5 text-sky-200 font-semibold">
                              {selectedFlood.road_side === "LEFT"
                                ? "ฝั่งซ้ายทาง (ตามทิศ กม. เพิ่มขึ้น)"
                                : selectedFlood.road_side === "RIGHT"
                                ? "ฝั่งขวาทาง (ตามทิศ กม. เพิ่มขึ้น)"
                                : selectedFlood.road_side === "BOTH"
                                ? "ท่วมทั้งสองฝั่งจราจร"
                                : "ไม่ระบุฝั่งถนน"}
                            </span>
                          )}
                          {selectedFlood.affected_lanes && (
                            <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-slate-200">
                              {selectedFlood.affected_lanes}
                            </span>
                          )}
                          {selectedFlood.affected_shoulder && selectedFlood.affected_shoulder !== "NONE" && (
                            <span className="rounded bg-amber-950/80 border border-amber-700/70 px-2 py-0.5 text-amber-200">
                              ไหล่ทางได้รับผลกระทบ
                            </span>
                          )}
                          {(selectedFlood.road_side === "LEFT" || selectedFlood.road_side === "RIGHT") && (
                            <span className="text-[11px] text-amber-300 block w-full mt-0.5">
                              ⚠️ อีกฝั่งจราจรที่ไม่มีรายงานน้ำท่วม ยังไม่ถือว่าปลอดภัยอัตโนมัติ โปรดสังเกตป้ายเตือนหน้างาน
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">อัปเดตล่าสุด: {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ไม่ระบุ"}</p>
                    </div>
                    <button
                      ref={closeDetailsRef}
                      type="button"
                      onClick={() => setShowDossier(false)}
                      aria-label="ปิดรายละเอียด"
                      className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                      title="ปิดหน้าต่างรายละเอียด"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body, in reading priority on a phone: level -> what to do -> photo -> history.
                    From sm up the photo sits beside the level card. */}
                <div className="grid grid-cols-1 gap-3.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-2">
                  <div className="sm:col-start-2 sm:row-start-1">
                  {/* Right: Water Level Stat & Traffic Advisory */}
                  <div className="flex h-full flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-[#0f1b33] p-3.5 sm:min-h-36">
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
                        <span className="font-heading font-black text-5xl text-red-500 font-mono tracking-tight">
                          {selectedFlood.water_level_cm}
                        </span>
                        <span className="text-xs text-slate-300 font-bold">เซนติเมตร (ซม.)</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-start gap-1.5 text-xs text-slate-300">
                        <span className="text-amber-400 font-bold shrink-0">
                          {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).icon}
                        </span>
                        <p className="text-[11px] leading-tight">
                          {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).detail}
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>
                  <div className="sm:col-span-2 sm:row-start-2">
                {/* Detour Recommendation Box (Yellow Banner) */}
                <div className="bg-amber-500/10 border border-amber-400/50 rounded-xl p-3.5 space-y-2.5">
                  {selectedFloodDetours.map((route) => {
                    const parsed = splitDetourAdviceByDirection(route.description || "", route.direction_mode);
                    const displayText = citizenDetourDirection === "FORWARD" ? parsed.forwardText : parsed.reverseText;
                    return (
                      <div key={route.id} className="rounded-lg border border-amber-400/30 bg-slate-950/70 p-3 text-sm text-amber-100">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="block text-amber-300 font-heading">{route.route_name}</strong>
                          <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 shrink-0">
                            {route.direction_mode === "FORWARD_ONLY" ? "A → B (ทิศทางเดียว)" : route.direction_mode === "REVERSE_ONLY" ? "B → A (ทิศทางเดียว)" : "ไป-กลับ (A ⇄ B)"}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-amber-100/95">{displayText}</p>
                      </div>
                    );
                  })}
                  {selectedFloodDetours.length === 0 && !selectedFlood.detour_advice && (
                    <p className="text-[11px] text-amber-100/90">ยังไม่มีทางเลี่ยงที่ยืนยันและผูกกับจุดน้ำท่วมนี้ โปรดโทร 1586 ก่อนเดินทาง</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs font-heading font-bold">
                      <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>คำแนะนำเส้นทางเลี่ยงน้ำท่วม</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Direction Switcher Toggle if bidirectional advice or detour exists */}
                      {(directionalAdvice.hasBoth || selectedFloodDetours.length > 0) && (
                        <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-amber-500/40 text-[10px] font-heading font-bold">
                          <button
                            type="button"
                            onClick={() => setCitizenDetourDirection("FORWARD")}
                            className={`min-h-9 px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer ${
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
                            className={`min-h-9 px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer ${
                              citizenDetourDirection === "REVERSE"
                                ? "bg-amber-500 text-slate-950 shadow"
                                : "text-amber-300/80 hover:text-white"
                            }`}
                          >
                            <span>🚙 ขากลับ (B → A)</span>
                          </button>
                        </div>
                      )}

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
                    const ext = directionalAdvice;
                    const displayText = ext.hasBoth
                      ? citizenDetourDirection === "FORWARD"
                        ? ext.forward
                        : ext.reverse
                      : selectedFlood.detour_advice;

                    return (
                      <div className="bg-slate-950/70 p-3 rounded-lg border border-amber-500/20 text-xs text-amber-100/95 leading-relaxed font-sans whitespace-pre-line sm:max-h-56 sm:overflow-y-auto">
                        {displayText}
                      </div>
                    );
                  })()}
                </div>


                  </div>
                  <div className="sm:col-start-1 sm:row-start-1">
                  {/* Left: Photo with GPS overlay */}
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 group">
                    {selectedFlood.latest_photo_url ? (
                      <img
                        src={selectedFlood.latest_photo_url}
                        alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center px-4 text-center text-xs text-slate-400">ยังไม่มีภาพถ่ายสถานการณ์ล่าสุด</div>
                    )}
                    {/* Animated Alert Badge Overlay on photo */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-950/95 px-2.5 py-1 text-[10px] font-heading font-black text-white shadow-xl">
                        {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).icon} {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).label}
                      </span>
                    </div>
                    <div className="p-1.5 bg-slate-950/90 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                      <span>📍 ภาพถ่ายหน้างานพร้อมพิกัด GPS: {selectedFlood.lat_start.toFixed(3)}, {selectedFlood.lon_start.toFixed(3)}</span>
                    </div>
                  </div>


                  </div>
                  <div className="sm:col-span-2 sm:row-start-3">
                {/* Timeline Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-heading font-bold text-white">
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span>📈</span> ไทม์ไลน์ระดับน้ำแต่ละช่วงเวลา
                    </span>
                    <span className="text-[10px] text-amber-300 font-normal">+ อัปเดตระดับน้ำล่าสุด</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 h-36 w-full">
                    <WaterTimelineChart
                      timelineUpdates={systemData.timelineUpdates}
                      floodId={selectedFlood.id}
                    />
                  </div>

                  {/* Recent Timeline History Updates */}
                  <div className="space-y-1.5">
                    {selectedFloodRecentUpdates
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
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Toast Notification */}
      {(toastMessage || isError) && (
        <div role="status" aria-live="polite" className="fixed bottom-28 left-3 right-3 z-[9999] lg:bottom-4 lg:left-auto lg:right-4 bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage || "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง"}</span>
        </div>
      )}
    </div>
  );
}
