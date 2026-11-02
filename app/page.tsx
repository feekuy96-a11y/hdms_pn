"use client";

import React, { useEffect, useRef, useState } from "react";
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
import Link from "next/link";
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
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [showDossier, setShowDossier] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [citizenDetourDirection, setCitizenDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");


  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);

  // TanStack Query for Data Fetching & Sync
  const { data: systemData = INITIAL_SYSTEM_DATA, refetch, isFetching, isError } = useQuery<SystemDataPayload>({
    queryKey: ["dohSystemData"],
    queryFn: async () => {
      return await getSystemDataAction();
    },
    initialData: INITIAL_SYSTEM_DATA,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

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

  // Quick route chips list
  const routeChips = [
    { id: "ALL", label: "ทั้งหมด" },
    { id: "43", label: "ทล.43 (หาดใหญ่-ปัตตานี)" },
    { id: "42", label: "ทล.42 (คลองแงะ-สายบุรี)" },
    { id: "418", label: "ทล.418 (ปัตตานี-ยะลา)" },
  ];

  // Filtered flood routes for citizens/users
  const filteredFloods = (systemData.floodRoutes || []).filter((r) => {
    if (!r.is_active) return false;
    const matchSearch =
      r.route_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.section_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.subdistrict && r.subdistrict.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchChip = selectedRouteFilter === "ALL" || r.route_no === selectedRouteFilter;

    return matchSearch && matchChip;
  });


  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Hotline + Admin Switcher)       */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between shadow-xl bg-[#091122]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
            <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-heading font-black text-amber-400 text-xs sm:text-sm tracking-wide">
                แขวงทางหลวงปัตตานี กรมทางหลวง
              </span>
              <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-1.5 py-0.2 rounded uppercase">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold text-slate-300 truncate">
              ตรวจสอบจุดน้ำท่วมและคำแนะนำการเดินทาง
            </h1>
          </div>
        </div>

        {/* Right Actions: Admin Link + Refresh + Hotline 1586 */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin"
            className="hidden lg:flex min-h-11 px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 hover:border-amber-400 shadow-md"
            title="เข้าสู่ระบบหลังบ้าน เจ้าหน้าที่ (Admin Panel)"
          >
            <Settings className="w-3.5 h-3.5" /> <span>ระบบแอดมิน</span>
          </Link>

          <button
            type="button"
            onClick={async () => {
              const result = await refetch();
              showToast(result.isError ? "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง" : "ตรวจสอบข้อมูลล่าสุดแล้ว");
            }}
            title="รีเฟรชข้อมูล"
            aria-label="ตรวจสอบข้อมูลล่าสุด"
            className="min-h-11 min-w-11 p-2 text-slate-300 hover:text-amber-400 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>

          <a
            href="tel:1586"
            className="min-h-11 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-xl shadow-lg transition"
          >
            <Phone className="w-3.5 h-3.5" /> สายด่วน 1586
          </a>
        </div>
      </header>

      <div role="status" className="bg-amber-400 px-4 py-2 text-center text-sm font-bold text-slate-950">
        ระบบยังไม่ยืนยันความสดใหม่ของข้อมูล โปรดโทร 1586 ก่อนตัดสินใจเดินทาง
      </div>

      {/* =================================================================== */}
      {/* 2. MAIN LAYOUT: GIS MAP + COLLAPSIBLE SIDEBAR + DETAIL DOSSIER     */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row relative lg:overflow-hidden min-h-[calc(100vh-104px)] lg:h-[calc(100vh-104px)]">
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (COLLAPSIBLE)                        */}
        {/* ================================================================= */}
        <div
          className={`${
            isSidebarCollapsed ? "hidden" : "flex"
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
            <Link href="/admin" className="text-[11px] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</Link>
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="order-1 lg:order-2 relative h-[55vh] shrink-0 lg:shrink lg:flex-1 lg:h-full min-h-[350px] lg:min-h-0 w-full overflow-hidden bg-[#0b1426]">
          {/* Floating Expand Sidebar Button (when collapsed) */}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="absolute top-4 left-4 z-[400] bg-slate-950/95 hover:bg-slate-900 text-amber-400 border border-amber-400/50 px-3 py-2 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-heading font-bold transition"
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
              const flood = systemData.floodRoutes.find((r) => r.id === id);
              if (flood && flood.lat_start && flood.lon_start) {
                setFocusCoordinates([flood.lon_start, flood.lat_start]);
              }
            }}
            focusCoordinates={focusCoordinates}
            className="h-full w-full"
          />

          {/* =============================================================== */}
          {/* C. FLOATING DETAIL DOSSIER CARD (MATCHING REFERENCE IMAGE 3)   */}
          {/* =============================================================== */}
          {selectedFlood && !showDossier && (
            <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-xl bg-[#0c162c] p-3 shadow-xl lg:right-auto lg:w-[420px]">
              <p className="text-xs text-amber-300">ทล.{selectedFlood.route_no} · กม.{selectedFlood.km_start}–{selectedFlood.km_end}</p>
              <h2 className="font-heading text-sm font-bold">{selectedFlood.traffic_status === "CLOSED" ? "ปิดการจราจร" : selectedFlood.traffic_status === "WARNING" ? "รถเล็กห้ามผ่าน" : "ผ่านได้ปกติ"} · {selectedFlood.section_name}</h2>
              <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-300">น้ำ {selectedFlood.water_level_cm} ซม. · {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ยังไม่มีเวลายืนยันล่าสุด"}</span><button type="button" onClick={() => setShowDossier(true)} className="min-h-11 shrink-0 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">ดูรายละเอียด</button></div>
            </div>
          )}
          {selectedFlood && showDossier && (
            <div role="dialog" aria-modal="false" aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`} className="fixed inset-x-0 bottom-0 z-[600] max-h-[82vh] overflow-y-auto rounded-t-2xl border border-slate-700/80 bg-[#0c162c] text-slate-100 shadow-2xl lg:absolute lg:bottom-4 lg:left-4 lg:right-auto lg:w-[500px] lg:rounded-2xl lg:max-h-[80vh]">
              {/* Header: Dark Navy Header with Badge, Section Title, KM Range & Action Buttons */}
              <div className="bg-[#0c1a30] text-white p-3.5 border-b border-slate-800 flex items-start justify-between gap-2">
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
                      <span>คำแนะนำเส้นทางเลี่ยงน้ำท่วม</span>
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
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedFlood.lat_start},${selectedFlood.lon_start}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 shadow shrink-0 transition"
                      >
                        <Navigation className="w-3 h-3" /> แผนที่ Google
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
                      <span>📈</span> ประวัติระดับน้ำ
                    </span>
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
