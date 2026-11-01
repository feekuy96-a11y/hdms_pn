"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { LongdoGisMap } from "@/components/map/LongdoGisMap";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { calculateRoadSnappedRoute } from "@/lib/gis-utils";
import Link from "next/link";
import { ArrowLeft, RotateCw, LogOut } from "lucide-react";

export default function AdminPage() {
  const [selectedFloodId, setSelectedFloodId] = useState<string>("F-001");
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

        <div className="flex items-center gap-2">
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
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 px-2.5 py-1.5 rounded-lg border border-red-800/60 transition font-heading font-medium"
              title="ออกจากระบบ"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Interactive GIS Map */}
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

        {/* Right: Full Government Administrative Console */}
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
            setIncomingGisLines={setIncomingGisLines}
          />
        </div>
      </div>

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
