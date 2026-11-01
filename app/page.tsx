"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction, upsertRouteAction, saveTimelineUpdateAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload, FloodRoute } from "@/db/default-data";
import { LongdoGisMap } from "@/components/map/LongdoGisMap";
import { WaterTimelineChart } from "@/components/charts/WaterTimelineChart";
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { latLonToUtm47N, formatThaiBuddhistDate } from "@/lib/gis-utils";
import Link from "next/link";
import {
  AlertTriangle,
  Settings,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Edit3,
  Navigation,
  Compass,
  Phone,
  Clock,
  Camera,
  CheckCircle2,
  Plus,
  ShieldAlert,
} from "lucide-react";

export default function HomePage() {
  const [selectedFloodId, setSelectedFloodId] = useState<string>("F-001");
  const [showDossier, setShowDossier] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    routeNo: "",
    sectionName: "",
    kmStart: "",
    kmEnd: "",
    waterLevelCm: 0,
    trafficStatus: "WARNING" as "CLOSED" | "WARNING" | "PASSABLE",
    photoUrl: "",
    detourAdvice: "",
    timelineRemark: "",
  });

  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);

  // TanStack Query for Data Fetching & Sync
  const { data: systemData = INITIAL_SYSTEM_DATA, refetch, isFetching } = useQuery<SystemDataPayload>({
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

    const matchChip =
      selectedRouteFilter === "ALL" ||
      r.route_no.includes(selectedRouteFilter) ||
      (selectedRouteFilter === "43" && r.route_no === "43") ||
      (selectedRouteFilter === "42" && r.route_no === "42") ||
      (selectedRouteFilter === "418" && r.route_no === "418");

    return matchSearch && matchChip;
  });

  // Open Edit Modal with current flood values
  const handleOpenEditModal = (flood: FloodRoute) => {
    setEditForm({
      routeNo: flood.route_no,
      sectionName: flood.section_name,
      kmStart: flood.km_start,
      kmEnd: flood.km_end,
      waterLevelCm: flood.water_level_cm,
      trafficStatus: flood.traffic_status as any,
      photoUrl: flood.latest_photo_url || "",
      detourAdvice: flood.detour_advice || "",
      timelineRemark: `ระดับน้ำ ${flood.water_level_cm} ซม. รายงานสถานการณ์ล่าสุด`,
    });
    setIsEditModalOpen(true);
  };

  // Submit quick edit to database
  const handleSaveEdit = async () => {
    if (!selectedFlood) return;
    setIsSavingEdit(true);
    try {
      // 1. Update Route Details
      await upsertRouteAction({
        recordType: "FLOOD",
        id: selectedFlood.id,
        routeNo: editForm.routeNo,
        sectionName: editForm.sectionName,
        kmStart: editForm.kmStart,
        kmEnd: editForm.kmEnd,
        waterLevelCm: Number(editForm.waterLevelCm),
        trafficStatus: editForm.trafficStatus,
        detourAdvice: editForm.detourAdvice,
        photoUrl: editForm.photoUrl,
      });

      // 2. Also record a new timeline update entry
      await saveTimelineUpdateAction({
        floodId: selectedFlood.id,
        waterLevelCm: Number(editForm.waterLevelCm),
        trafficStatus: editForm.trafficStatus,
        latitude: selectedFlood.lat_start,
        longitude: selectedFlood.lon_start,
        reporterName: "เจ้าหน้าที่เวรศูนย์ฯ แขวงฯ ปัตตานี",
        remark: editForm.timelineRemark || "อัปเดตข้อมูลและภาพถ่ายระดับน้ำหน้างาน",
        photoUrl: editForm.photoUrl,
      });

      await refetch();
      setIsEditModalOpen(false);
      showToast("บันทึกการแก้ไขและอัปเดตระดับน้ำสำเร็จ");
    } catch (err) {
      showToast("เกิดข้อผิดพลาดในการบันทึก: " + (err as Error).message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Sample photo options for rapid selection in edit modal
  const samplePhotoOptions = [
    { label: "น้ำท่วมสูง ทล.43 เกาะหม้อแกง", url: "https://images.unsplash.com/photo-1547683905-f686c993aae5?q=80&w=800&auto=format&fit=crop" },
    { label: "น้ำท่วมไหลผ่านผิวจราจร ทล.418", url: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=800&auto=format&fit=crop" },
    { label: "น้ำลดลงระดับเฝ้าระวัง ทล.42", url: "https://images.unsplash.com/photo-1508873696983-2df5293cb395?q=80&w=800&auto=format&fit=crop" },
  ];

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
              <OfflineSyncStatus onSyncComplete={() => refetch()} />
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold text-slate-300 truncate">
              ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย (HDMS Real-Time GIS)
            </h1>
          </div>
        </div>

        {/* Right Actions: Admin Link + Refresh + Hotline 1586 */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 hover:border-amber-400 shadow-md"
            title="เข้าสู่ระบบหลังบ้าน เจ้าหน้าที่ (Admin Panel)"
          >
            <Settings className="w-3.5 h-3.5" /> <span>ระบบแอดมิน</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              refetch();
              showToast("รีเฟรชข้อมูลจากระบบเรียบร้อย");
            }}
            title="รีเฟรชข้อมูล"
            className="p-2 text-slate-300 hover:text-amber-400 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>

          <a
            href="tel:1586"
            className="hidden sm:flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-xl shadow-lg transition"
          >
            <Phone className="w-3.5 h-3.5" /> สายด่วน 1586
          </a>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. MAIN LAYOUT: GIS MAP + COLLAPSIBLE SIDEBAR + DETAIL DOSSIER     */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col-reverse lg:flex-row relative overflow-hidden h-[calc(100vh-64px)]">
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (COLLAPSIBLE)                        */}
        {/* ================================================================= */}
        <div
          className={`${
            isSidebarCollapsed ? "hidden" : "flex"
          } w-full lg:w-[410px] xl:w-[440px] bg-[#0c1527] border-t lg:border-t-0 lg:border-r border-slate-800 flex-col shrink-0 z-20 h-[50vh] lg:h-full overflow-hidden transition-all duration-300`}
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
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
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
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
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
                    className={`px-2.5 py-1 rounded-lg font-heading font-bold whitespace-nowrap transition ${
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
                <div
                  key={flood.id}
                  onClick={() => {
                    setSelectedFloodId(flood.id);
                    setShowDossier(true);
                    if (flood.lat_start && flood.lon_start) {
                      setFocusCoordinates([flood.lon_start, flood.lat_start]);
                    }
                  }}
                  className={`p-3 rounded-2xl border transition cursor-pointer shadow-md ${
                    isSelected
                      ? "bg-slate-900 ring-2 ring-amber-400 border-transparent shadow-amber-500/10"
                      : "bg-[#0f1b33] border-slate-800/90 hover:border-slate-700"
                  }`}
                  style={{
                    borderLeftWidth: "4px",
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
                        ? `⚠️ รถเล็กมองผ่าน (${flood.water_level_cm} ซม.)`
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
                </div>
              );
            })}
          </div>

          {/* Sidebar Bottom Footer: Call Contact */}
          <div className="p-3 bg-[#091122] border-t border-slate-800 text-xs flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[11px] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: 073-336-000
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedFlood) handleOpenEditModal(selectedFlood);
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-heading font-bold flex items-center gap-1 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg"
            >
              <Edit3 className="w-3 h-3" /> แก้ไขข้อมูล
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="flex-1 relative h-[55vh] lg:h-full min-h-[460px] lg:min-h-0 w-full overflow-hidden">
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
            className="h-full w-full min-h-[460px] lg:min-h-0"
          />

          {/* =============================================================== */}
          {/* C. FLOATING DETAIL DOSSIER CARD (MATCHING REFERENCE IMAGE 3)   */}
          {/* =============================================================== */}
          {selectedFlood && showDossier && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:left-4 sm:bottom-4 z-[500] w-auto sm:w-[500px] max-h-[85vh] overflow-y-auto bg-[#0c162c] text-slate-100 rounded-2xl border border-slate-700/80 shadow-2xl p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
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
                  {/* Quick Edit Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedFlood)}
                    className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition text-xs font-heading flex items-center gap-1"
                    title="แก้ไขข้อมูลหรือเปลี่ยนรูปภาพ"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="text-[10px] hidden sm:inline">แก้ไข</span>
                  </button>
                  {/* Close Dossier Button */}
                  <button
                    type="button"
                    onClick={() => setShowDossier(false)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
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
                        selectedFlood.latest_photo_url ||
                        "https://images.unsplash.com/photo-1547683905-f686c993aae5?q=80&w=800&auto=format&fit=crop"
                      }
                      alt={selectedFlood.section_name}
                      className="w-full h-36 object-cover transition duration-300 group-hover:scale-105"
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
                <div className="bg-amber-500/10 border border-amber-400/50 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs font-heading font-bold">
                      <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>คำแนะนำเส้นทางเลี่ยงน้ำท่วม (Yellow Line)</span>
                    </div>
                    <p className="text-[11px] text-amber-100/90 mt-1 leading-snug">
                      {selectedFlood.detour_advice || "ทางเบี่ยงสวนเลนฝั่งขาล่อง (SB) กม.84+397 - 85+000 (ระยะทาง 603 ม.)"}
                    </p>
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFlood.lat_start},${selectedFlood.lon_start}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black text-xs px-3.5 py-2 rounded-lg flex items-center gap-1 shadow-md shrink-0 transition"
                  >
                    <Navigation className="w-3.5 h-3.5" /> นำทาง
                  </a>
                </div>

                {/* Timeline Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-heading font-bold text-white">
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span>📈</span> ไทม์ไลน์ระดับน้ำแต่ละช่วงเวลา (Water Level Timeline)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(selectedFlood)}
                      className="text-sky-400 hover:text-sky-300 font-heading font-bold text-[10px] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> อัปเดตระดับน้ำล่าสุด
                    </button>
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

      {/* =================================================================== */}
      {/* 3. QUICK DATA MANAGEMENT & PHOTO EDIT MODAL (POPUP)                */}
      {/* =================================================================== */}
      {isEditModalOpen && selectedFlood && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0c1527] border-2 border-amber-500 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-heading font-bold">
                  <Edit3 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-heading font-bold text-sm sm:text-base text-white">
                    แก้ไขข้อมูลจุดน้ำท่วม & จัดการรูปภาพ
                  </h3>
                  <p className="text-[11px] text-amber-300">
                    ทล.{selectedFlood.route_no} {selectedFlood.section_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">หมายเลขสายทาง</label>
                  <input
                    type="text"
                    value={editForm.routeNo}
                    onChange={(e) => setEditForm({ ...editForm, routeNo: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">ระดับน้ำ (ซม.)</label>
                  <input
                    type="number"
                    value={editForm.waterLevelCm}
                    onChange={(e) => setEditForm({ ...editForm, waterLevelCm: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ชื่อตอน / จุดน้ำท่วม</label>
                <input
                  type="text"
                  value={editForm.sectionName}
                  onChange={(e) => setEditForm({ ...editForm, sectionName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">สถานะการจราจร</label>
                <select
                  value={editForm.trafficStatus}
                  onChange={(e) => setEditForm({ ...editForm, trafficStatus: e.target.value as any })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                >
                  <option value="CLOSED">⛔ ผ่านไม่ได้ (ปิดการจราจรเด็ดขาด)</option>
                  <option value="WARNING">⚠️ เฝ้าระวัง / รถเล็กห้ามผ่าน</option>
                  <option value="PASSABLE">✅ ผ่านได้ปกติ</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">คำแนะนำเส้นทางเลี่ยง (Yellow Line)</label>
                <textarea
                  rows={2}
                  value={editForm.detourAdvice}
                  onChange={(e) => setEditForm({ ...editForm, detourAdvice: e.target.value })}
                  placeholder="ระบุทางเลี่ยง เช่น ใช้ ทล.43 ขาออก หรือถนนสายรอง..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              {/* Photo URL & Quick Presets */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-400" /> ลิงก์รูปภาพสภาพน้ำท่วมหน้างาน
                  </span>
                  <span className="text-[10px] text-slate-400">รองรับ URL ภาพถ่าย</span>
                </label>
                <input
                  type="text"
                  value={editForm.photoUrl}
                  onChange={(e) => setEditForm({ ...editForm, photoUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-[11px]"
                />

                {/* Quick Presets */}
                <div className="flex gap-1.5 overflow-x-auto pt-1">
                  {samplePhotoOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, photoUrl: opt.url })}
                      className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700 truncate max-w-[140px]"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline Remark */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">ข้อความบันทึกไทม์ไลน์ล่าสุด</label>
                <input
                  type="text"
                  value={editForm.timelineRemark}
                  onChange={(e) => setEditForm({ ...editForm, timelineRemark: e.target.value })}
                  placeholder="เช่น ระดับน้ำลดลง 5 ซม. รถกระบะผ่านได้..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-heading font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 shadow-lg flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" /> กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> บันทึกและซิงค์ข้อมูล
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
