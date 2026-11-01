"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { LongdoGisMap } from "@/components/map/LongdoGisMap";
import { WaterTimelineChart } from "@/components/charts/WaterTimelineChart";
import { ExecutiveDashboard } from "@/components/executive/ExecutiveDashboard";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { latLonToUtm47N, formatThaiBuddhistDate, calculateRoadSnappedRoute } from "@/lib/gis-utils";
import Link from "next/link";
import {
  AlertTriangle,
  Smartphone,
  PieChart,
  Settings,
  RotateCw,
  Search,
  Filter,
  MapPin,
  Clock,
} from "lucide-react";

export default function HomePage() {
  const [currentView, setCurrentView] = useState<"public" | "executive" | "admin">("public");
  const [selectedFloodId, setSelectedFloodId] = useState<string>("F-001");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Admin Map Picking & Path Bending State
  const [adminPickMode, setAdminPickMode] = useState<string | null>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<[number, number][]>([]);
  const [draftWaypoints, setDraftWaypoints] = useState<[number, number][]>([]);
  const [pickedCoordinate, setPickedCoordinate] = useState<{ lat: number; lon: number; mode: string; ts: number } | null>(null);
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
      showToast(`ดัดแนวเส้นทางที่จุด #${idx + 1} สำเร็จ`);
    }
  };

  // Filtered flood routes for citizens
  const filteredFloods = (systemData.floodRoutes || []).filter((r) => {
    if (!r.is_active) return false;
    const matchSearch =
      r.route_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.section_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "ALL" || r.traffic_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectedFlood =
    systemData.floodRoutes.find((r) => r.id === selectedFloodId) || systemData.floodRoutes[0];
  const selectedUtm = selectedFlood
    ? latLonToUtm47N(selectedFlood.lat_start, selectedFlood.lon_start)
    : { formatted: "" };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + View Switcher + Offline Sync)   */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
            <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-2 py-0.5 rounded uppercase">
                กรมทางหลวง • ขท.ปัตตานี
              </span>
              <OfflineSyncStatus onSyncComplete={() => refetch()} />
            </div>
            <h1 className="font-heading text-xs sm:text-base font-bold text-white truncate">
              ระบบรายงานสถานการณ์น้ำท่วมและเส้นทางเลี่ยง จ.ปัตตานี
            </h1>
          </div>
        </div>

        {/* View Switcher Buttons */}
        <div className="flex items-center gap-1 sm:gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentView("public")}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 ${
              currentView === "public" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> <span className="hidden sm:inline">สำหรับประชาชน</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView("executive")}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 ${
              currentView === "executive" ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            <PieChart className="w-3.5 h-3.5" /> <span className="hidden sm:inline">รายงานผู้ว่าฯ / KPI</span>
          </button>
          <Link
            href="/admin"
            className="px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 text-slate-300 hover:text-amber-300 hover:bg-slate-900 border border-transparent hover:border-slate-700"
            title="เข้าสู่ระบบหลังบ้าน เจ้าหน้าที่ (Protected Route)"
          >
            <Settings className="w-3.5 h-3.5" /> <span className="hidden sm:inline">ระบบหลังบ้าน (Admin)</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              refetch();
              showToast("รีเฟรชข้อมูลจากระบบเรียบร้อย");
            }}
            title="รีเฟรชข้อมูล"
            className="p-1.5 text-slate-300 hover:text-amber-400"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. MAIN LAYOUT: PUBLIC & ADMIN MAP VIEW                              */}
      {/* =================================================================== */}
      {currentView !== "executive" ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left/Top: GIS Interactive Map Viewport */}
          <div className="h-[48vh] min-h-[340px] lg:h-[calc(100vh-64px)] lg:flex-1 relative">
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
            />

            {/* Admin Picking Banner Notification */}
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

          {/* Right/Bottom: Sidebar Panels (Citizen vs Admin) */}
          {currentView === "public" ? (
            <div className="w-full lg:w-[480px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col overflow-y-auto">
              {/* Citizen Search & Filter Header */}
              <div className="p-3.5 bg-slate-950 border-b border-slate-800 sticky top-0 z-10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading font-bold text-sm sm:text-base text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> ตรวจสอบเส้นทางน้ำท่วม & ทางเลี่ยง
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    อัปเดต: {formatThaiBuddhistDate(systemData.updatedAt)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาสายทาง 42, 43, 418, 410, หนองจิก..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="ALL">ทุกสถานะ</option>
                    <option value="CLOSED">ผ่านไม่ได้</option>
                    <option value="WARNING">เฝ้าระวัง</option>
                    <option value="PASSABLE">ผ่านได้</option>
                  </select>
                </div>
              </div>

              {/* Citizen Flood Cards List */}
              <div className="p-3 space-y-2.5">
                {filteredFloods.map((flood) => {
                  const isSelected = flood.id === selectedFloodId;
                  const isClosed = flood.traffic_status === "CLOSED";
                  const floodColor = systemData.mapStyles?.flood?.color || "#D32F2F";
                  const detourColor = systemData.mapStyles?.detour?.color || "#FBC02D";

                  return (
                    <div
                      key={flood.id}
                      onClick={() => {
                        setSelectedFloodId(flood.id);
                        if (flood.lat_start && flood.lon_start) {
                          setFocusCoordinates([flood.lon_start, flood.lat_start]);
                        }
                      }}
                      className={`p-3 rounded-2xl border transition cursor-pointer shadow-md ${
                        isSelected
                          ? "bg-slate-800/90 ring-1 ring-amber-400"
                          : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                      }`}
                      style={{
                        borderLeftWidth: "4px",
                        borderLeftColor: isClosed ? floodColor : detourColor,
                        borderColor: isSelected ? "#f59e0b" : undefined,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="gold-gradient text-slate-950 font-heading font-extrabold text-xs px-2 py-0.5 rounded">
                            ทล.{flood.route_no}
                          </span>
                          <h3 className="font-heading font-bold text-sm text-white">{flood.section_name}</h3>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border"
                          style={{
                            backgroundColor: `${isClosed ? floodColor : detourColor}22`,
                            color: isClosed ? floodColor : detourColor,
                            borderColor: `${isClosed ? floodColor : detourColor}66`,
                          }}
                        >
                          {isClosed ? "ปิดการจราจร" : "เฝ้าระวัง"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-300 mt-2">
                        <span>ช่วง กม. {flood.km_start} - {flood.km_end}</span>
                        <span className="font-heading font-bold text-amber-400 text-sm font-mono">
                          {flood.water_level_cm} ซม.
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detailed Water Level Timeline Chart & Photo & UTM */}
              {selectedFlood && (
                <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-heading font-bold text-amber-400 uppercase tracking-wider">
                        TIMELINE ระดับน้ำตามช่วงเวลา
                      </span>
                      <h3 className="font-heading font-bold text-sm text-white">
                        ทล.{selectedFlood.route_no} {selectedFlood.section_name}
                      </h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-heading font-bold bg-red-500/20 text-red-300 border border-red-500/40 shrink-0 font-mono">
                      {selectedFlood.water_level_cm} ซม.
                    </span>
                  </div>

                  {/* Water Timeline Line Chart */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 relative h-48 w-full">
                    <WaterTimelineChart
                      timelineUpdates={systemData.timelineUpdates}
                      floodId={selectedFlood.id}
                    />
                  </div>

                  {/* Field Photo & UTM Zone 47N Info */}
                  <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden p-3 space-y-2">
                    <div className="text-[11px] text-sky-400 font-mono">
                      {selectedUtm.formatted}
                    </div>
                    {selectedFlood.latest_photo_url && (
                      <div className="relative rounded-lg overflow-hidden border border-slate-700">
                        <img
                          src={selectedFlood.latest_photo_url}
                          className="w-full h-44 object-cover"
                          alt="Field Flood Condition"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Admin Console Sidebar */
            <div className="w-full lg:w-[680px] xl:w-[720px] flex flex-col overflow-hidden">
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
              />
            </div>
          )}
        </div>
      ) : (
        /* =================================================================== */
        /* 3. EXECUTIVE / GOVERNOR DASHBOARD VIEW                             */
        /* =================================================================== */
        <main className="flex-1 overflow-y-auto">
          <ExecutiveDashboard projects={systemData.mitigationProjects} />
        </main>
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
