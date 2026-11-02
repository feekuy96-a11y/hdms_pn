"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { AdminConsole } from "@/components/admin/AdminConsole";

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
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { OsrmRoutingBadge } from "@/components/offline/OsrmRoutingBadge";
import { calculateRoadSnappedRoute } from "@/lib/gis-utils";
import Link from "next/link";
import { ArrowLeft, RotateCw, LogOut, FileText, PieChart, Settings, Smartphone } from "lucide-react";
import { OfficialReportDispatchModal } from "@/components/admin/OfficialReportDispatchModal";
import { ExecutiveDashboard } from "@/components/executive/ExecutiveDashboard";

export default function AdminPage() {
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState<"console" | "executive">("console");
  const [adminPickMode, setAdminPickMode] = useState<string | null>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<[number, number][]>([]);
  const [draftWaypoints, setDraftWaypoints] = useState<[number, number][]>([]);
  const [incomingGisLines, setIncomingGisLines] = useState<[number, number][][]>([]);
  const [pickedCoordinate, setPickedCoordinate] = useState<{ lat: number; lon: number; mode: string; ts: number } | null>(null);
  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: systemData = INITIAL_SYSTEM_DATA, refetch, isFetching } = useQuery<SystemDataPayload>({
    queryKey: ["dohAdminSystemData"],
    queryFn: async () => {
      return await getSystemDataAction();
    },
    initialData: INITIAL_SYSTEM_DATA,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Dragging a numbered waypoint marker on the map immediately re-snaps the road path!
  const handleWaypointDragged = async (idx: number, newCoord: [number, number]) => {
    const nextWaypoints = [...draftWaypoints];
    nextWaypoints[idx] = newCoord;
    setDraftWaypoints(nextWaypoints);

    if (draftCoordinates.length >= 2) {
      const startCoord = draftCoordinates[0];
      const endCoord = draftCoordinates[draftCoordinates.length - 1];
      const snapped = await calculateRoadSnappedRoute(startCoord, endCoord, nextWaypoints);
      setDraftCoordinates(snapped);
      showToast(`ปรับดัดแนวเส้นทางที่จุด #${idx + 1} สำเร็จ`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* Official Thai Government Protected Top Header */}
      <header className="bg-[#0f2347] border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-4 sm:px-6 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-white bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 transition font-heading font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> หน้าประชาชน
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-heading font-black text-xs shadow">
              ขท.
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-black px-1.5 py-0.2 rounded uppercase">
                  ส่วนราชการ
                </span>
                <span className="text-[11px] text-amber-300 font-heading font-medium hidden sm:inline">
                  สำนักงานทางหลวงที่ ๑๘ กรมทางหลวง
                </span>
              </div>
              <h1 className="font-heading text-xs sm:text-sm font-bold text-white">
                ศูนย์ปฏิบัติการและรายงานข้อมูลอุทกภัย แขวงทางหลวงปัตตานี
              </h1>
            </div>
          </div>
        </div>

        {/* View Switcher: Matching Image 1 (สำหรับประชาชน, รายงานผู้ว่าฯ / KPI, ระบบหลังบ้าน Admin) */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-700">
          <Link
            href="/"
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-heading font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
            title="หน้าแผนที่สำหรับประชาชน"
          >
            <Smartphone className="w-3.5 h-3.5" /> <span className="hidden md:inline">สำหรับประชาชน</span>
          </Link>
          <button
            type="button"
            onClick={() => setAdminViewMode("executive")}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 ${
              adminViewMode === "executive"
                ? "bg-amber-500 text-slate-950 shadow-md"
                : "text-slate-300 hover:text-white"
            }`}
            title="แดชบอร์ดสรุปผลผู้ว่าฯ และ KPI เชิงยุทธศาสตร์ (ตามภาพที่ 1)"
          >
            <PieChart className="w-3.5 h-3.5" /> <span>รายงานผู้ว่าฯ / KPI</span>
          </button>
          <button
            type="button"
            onClick={() => setAdminViewMode("console")}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 ${
              adminViewMode === "console"
                ? "bg-amber-500 text-slate-950 shadow-md"
                : "text-slate-300 hover:text-white"
            }`}
            title="ระบบจัดการข้อมูลหลังบ้าน Admin"
          >
            <Settings className="w-3.5 h-3.5" /> <span>ระบบหลังบ้าน (Admin)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition"
            title="ออกรายงานสถานการณ์เสนอผู้ว่าราชการจังหวัด (ด่วนที่สุด)"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">รายงานผู้ว่าฯ (ด่วนที่สุด)</span>
          </button>
          <OsrmRoutingBadge />
          <OfflineSyncStatus onSyncComplete={() => refetch()} />
          <button
            type="button"
            onClick={() => {
              refetch();
              showToast("รีเฟรชฐานข้อมูลสารสนเทศเรียบร้อย");
            }}
            title="รีเฟรชข้อมูล"
            className="p-1.5 text-slate-300 hover:text-amber-400"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area: Executive Dashboard (ภาพที่ 1) vs Admin Console + Map */}
      {adminViewMode === "executive" ? (
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-950">
          <ExecutiveDashboard projects={systemData.mitigationProjects} />
        </main>
      ) : (
        /* Main Split Layout: Admin Console on Left (ฝั่งซ้ายมือ), GIS Map on Right */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Full Government Administrative Console (ฝั่งซ้ายมือ) */}
          <div className="w-full lg:w-[680px] xl:w-[720px] flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
            <AdminConsole
              systemData={systemData}
              onDataRefresh={(newData) => {
                refetch();
              }}
              adminPickMode={adminPickMode}
              setAdminPickMode={setAdminPickMode}
              draftCoordinates={draftCoordinates}
              setDraftCoordinates={setDraftCoordinates}
              draftWaypoints={draftWaypoints}
              setDraftWaypoints={setDraftWaypoints}
              pickedCoordinate={pickedCoordinate}
              onFocusCoordinates={(coords) => setFocusCoordinates(coords)}
              onToast={showToast}
              setIncomingGisLines={setIncomingGisLines}
            />
          </div>

          {/* Right: Interactive GIS Map */}
          <div className="h-[48vh] lg:h-[calc(100vh-64px)] lg:flex-1 relative">
            <LongdoGisMap
              systemData={systemData}
              selectedFloodId={selectedFloodId}
              onSelectFlood={(id) => {
                setSelectedFloodId(id);
                const flood = systemData.floodRoutes.find((r) => r.id === id);
                if (flood && flood.lat_start && flood.lon_start) {
                  setFocusCoordinates([flood.lon_start, flood.lat_start]);
                }
              }}
              adminPickMode={adminPickMode}
              onCoordinatePicked={(lat, lon, mode) => {
                setPickedCoordinate({ lat, lon, mode, ts: Date.now() });
                if (mode !== "ADD_WAYPOINT") {
                  setAdminPickMode(null);
                }
              }}
              draftCoordinates={draftCoordinates}
              draftWaypoints={draftWaypoints}
              onWaypointDragged={handleWaypointDragged}
              focusCoordinates={focusCoordinates}
              incomingGisLines={incomingGisLines}
            />

            {adminPickMode && (
              <div className="absolute top-16 left-3 right-3 sm:left-auto sm:right-3 z-[500] bg-amber-500 text-slate-950 px-4 py-2 rounded-xl text-xs font-heading font-extrabold shadow-2xl flex items-center justify-between gap-3 border border-slate-950">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping" />
                  <span>
                    {adminPickMode === "TIMELINE_PIN"
                      ? "คลิกบนแผนที่เพื่อปักหมุดจุดรายงานระดับน้ำ..."
                      : adminPickMode === "PICK_START"
                        ? "คลิกบนแผนที่เพื่อกำหนดจุดเริ่มต้น..."
                        : adminPickMode === "PICK_END"
                          ? "คลิกบนแผนที่เพื่อกำหนดจุดสิ้นสุด..."
                          : "คลิกบนถนนเพื่อเพิ่มจุดดัดแนวเส้นทาง (หรือลากหมุดสีส้ม)..."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminPickMode(null)}
                  className="bg-slate-950 text-white px-2.5 py-1 rounded-lg text-[10px]"
                >
                  เสร็จสิ้น / ปิดโหมด
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Official Governor Dispatch Modal */}
      <OfficialReportDispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        systemData={systemData}
      />

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
