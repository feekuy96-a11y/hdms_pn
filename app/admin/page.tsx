"use client";

import React, { useCallback, useRef, useState } from "react";
import type { LonLat, VertexEditEvent } from "@/lib/line-edit";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getSystemDataAction, getPublicSystemDataAction, snapRouteAction } from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { AdminConsole } from "@/components/admin/AdminConsole";

const LongdoGisMap = dynamic(
  () => import("@/components/map/LongdoGisMap").then((mod) => mod.LongdoGisMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[350px] w-full bg-[#0b1426] p-4" role="status" aria-live="polite">
        <span className="sr-only">กำลังโหลดแผนที่ GIS ปัตตานี</span>
        <div aria-hidden="true" className="h-full min-h-[318px] rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="h-5 w-48 rounded-md bg-slate-700/70 animate-pulse motion-reduce:animate-none" />
          <div className="mt-4 h-8 w-64 rounded-xl bg-slate-800/80 animate-pulse motion-reduce:animate-none" />
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
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { OsrmRoutingBadge } from "@/components/offline/OsrmRoutingBadge";
import { calculateRoadSnappedRoute } from "@/lib/gis-utils";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, RotateCw, LogOut, FileText, PieChart, Settings, Smartphone, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { OfficialReportDispatchModal } from "@/components/admin/OfficialReportDispatchModal";
import { ExecutiveDashboard } from "@/components/executive/ExecutiveDashboard";
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";

export default function AdminPage() {
  const isPollingActive = usePollingActivity();
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState<"console" | "executive">("console");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [adminPickMode, setAdminPickMode] = useState<string | null>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<[number, number][]>([]);
  const [draftWaypoints, setDraftWaypoints] = useState<[number, number][]>([]);
  const [draftReverseCoordinates, setDraftReverseCoordinates] = useState<[number, number][]>([]);
  const [draftReverseWaypoints, setDraftReverseWaypoints] = useState<[number, number][]>([]);
  const [draftDirectionMeta, setDraftDirectionMeta] = useState<{
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null>(null);
  const [draftConflictPoints, setDraftConflictPoints] = useState<Array<{ coord: [number, number]; label: string }>>([]);
  const [draftMode, setDraftMode] = useState<"FLOOD" | "DETOUR">("FLOOD");
  const [incomingGisLines, setIncomingGisLinesState] = useState<[number, number][][]>([]);
  // Stable setter that ignores "clear" requests when the preview is already empty, so child tabs
  // that call setIncomingGisLines([]) from effects no longer trigger a re-render + map redraw.
  const setIncomingGisLines = useCallback((lines: [number, number][][]) => {
    setIncomingGisLinesState((previous) => (previous.length === 0 && lines.length === 0 ? previous : lines));
  }, []);
  const waypointRequestRef = useRef(0);
  // Freeform line editor (vertex handles) - events travel map -> page -> AdminConsole -> GisDataImportTab
  const [vertexEditable, setVertexEditable] = useState(false);
  const [vertexEvent, setVertexEvent] = useState<VertexEditEvent | null>(null);
  const vertexSeqRef = useRef(0);
  const emitVertexEvent = useCallback((event: Omit<VertexEditEvent, "seq">) => {
    vertexSeqRef.current += 1;
    setVertexEvent({ ...event, seq: vertexSeqRef.current });
  }, []);
  const [pickedCoordinate, setPickedCoordinate] = useState<{ lat: number; lon: number; mode: string; ts: number } | null>(null);
  const [draftPickMarkers, setDraftPickMarkers] = useState<Array<{ lat: number; lon: number; label: string; mode: string }>>([]);
  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editableOfficeId, setEditableOfficeId] = useState<string | null>(null);

  const [needsFullGeometry, setNeedsFullGeometry] = useState(false);
  const { data: systemData = INITIAL_SYSTEM_DATA, refetch, isFetching, isError } = useQuery<SystemDataPayload>({
    queryKey: ["dohAdminSystemData", needsFullGeometry],
    queryFn: async () => {
      return needsFullGeometry ? await getSystemDataAction() : await getPublicSystemDataAction();
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

  // Dragging a numbered waypoint marker on the map immediately re-snaps the road path!
  const handleWaypointDragged = async (idx: number, newCoord: [number, number]) => {
    const nextWaypoints = [...draftWaypoints];
    nextWaypoints[idx] = newCoord;
    setDraftWaypoints(nextWaypoints);
    // Only the latest drag may write its result; older (slower) routing responses are dropped.
    const requestId = ++waypointRequestRef.current;

    if (draftCoordinates.length >= 2) {
      const startCoord = draftCoordinates[0];
      const endCoord = draftCoordinates[draftCoordinates.length - 1];
      try {
        let snapped: [number, number][];
        if (draftMode === "FLOOD") {
          const points = [startCoord, ...nextWaypoints, endCoord];
          const segments = await Promise.all(points.slice(1).map((point, index) => snapRouteAction(points[index], point)));
          if (segments.some((segment) => !segment || segment.length < 2)) throw new Error("ไม่พบแนวทางหลวง");
          snapped = segments.flatMap((segment, index) => index === 0 ? segment! : segment!.slice(1));
        } else {
          snapped = await calculateRoadSnappedRoute(startCoord, endCoord, nextWaypoints);
        }
        if (requestId !== waypointRequestRef.current) return;
        setDraftCoordinates(snapped);
        showToast(`ปรับดัดแนวเส้นทางที่จุด #${idx + 1} สำเร็จ`);
      } catch {
        if (requestId !== waypointRequestRef.current) return;
        setDraftCoordinates([]);
        showToast("คำนวณเส้นทางใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    }
  };

  const handleReverseWaypointDragged = async (idx: number, newCoord: [number, number]) => {
    const nextReverseWaypoints = [...draftReverseWaypoints];
    nextReverseWaypoints[idx] = newCoord;
    setDraftReverseWaypoints(nextReverseWaypoints);
    const requestId = ++waypointRequestRef.current;

    if (draftReverseCoordinates.length >= 2) {
      const startCoord = draftReverseCoordinates[0];
      const endCoord = draftReverseCoordinates[draftReverseCoordinates.length - 1];
      try {
        const snapped = await calculateRoadSnappedRoute(startCoord, endCoord, nextReverseWaypoints);
        if (requestId !== waypointRequestRef.current) return;
        setDraftReverseCoordinates(snapped);
        showToast(`ปรับดัดแนวเส้นขากลับ B→A จุด #R${idx + 1} สำเร็จ`);
      } catch {
        if (requestId !== waypointRequestRef.current) return;
        showToast("คำนวณเส้นทางขากลับใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* Official Thai Government Protected Top Header */}
      <header className="bg-[#0f2347] border-b-2 border-amber-500 sticky top-0 z-50 min-h-16 px-3 sm:px-5 py-2 lg:py-0 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 shadow-xl">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 lg:flex-none">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-white bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-700 transition font-heading font-bold shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">หน้าประชาชน</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            {systemData.systemSettings?.logoUrl ? (
              <img
                src={systemData.systemSettings.logoUrl}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-contain shadow shrink-0 bg-slate-900 p-0.5 border border-slate-700"
              />
            ) : (
              <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-heading font-black text-xs shadow shrink-0">
                ขท.
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-black px-1.5 py-0.2 rounded uppercase shrink-0">
                  ส่วนราชการ
                </span>
                <span className="text-[11px] text-amber-300 font-heading font-medium hidden md:inline truncate">
                  {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
                </span>
              </div>
              <h1 className="font-heading text-xs sm:text-sm font-bold text-white whitespace-nowrap truncate">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </h1>
            </div>
          </div>
        </div>

        {/* View Switcher: (รายงานผู้ว่าฯ / KPI vs ระบบหลังบ้าน Admin) */}
        <div className="order-3 lg:order-none w-full lg:w-auto flex items-center justify-center lg:justify-start gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setAdminViewMode("executive")}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition flex items-center gap-1.5 ${
              adminViewMode === "executive"
                ? "bg-amber-500 text-slate-950 shadow-md"
                : "text-slate-300 hover:text-white"
            }`}
            title="แดชบอร์ดสรุปผลผู้ว่าฯ และ KPI เชิงยุทธศาสตร์"
          >
            <PieChart className="w-3.5 h-3.5" /> <span className="hidden sm:inline">รายงานผู้ว่าฯ / KPI</span>
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
            <Settings className="w-3.5 h-3.5" /> <span className="hidden sm:inline">ระบบหลังบ้าน</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button type="button" title="ออกจากระบบ" className="p-2 text-slate-300 hover:text-amber-400" onClick={async () => { await createClient().auth.signOut(); }}><LogOut className="w-4 h-4" /></button>
          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="bg-red-600 hover:bg-red-500 text-white font-heading font-black text-xs px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition shrink-0"
            title="ออกรายงานสถานการณ์เสนอผู้ว่าราชการจังหวัด (ด่วนที่สุด)"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">รายงานผู้ว่าฯ ด่วน</span>
          </button>
          <OfflineSyncStatus onSyncComplete={() => refetch()} />
          {isError && <span role="status" className="rounded-lg border border-red-700/70 bg-red-950/80 px-2 py-1 text-[10px] text-red-200">โหลดข้อมูลฐานข้อมูลไม่สำเร็จ</span>}
          <button
            type="button"
            onClick={() => {
              refetch();
              showToast("รีเฟรชฐานข้อมูลสารสนเทศเรียบร้อย");
            }}
            title="รีเฟรชข้อมูล"
            className="p-1.5 text-slate-300 hover:text-amber-400 shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area: Executive Dashboard (ภาพที่ 2) vs Admin Console + Map */}
      {adminViewMode === "executive" ? (
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-950">
          <ExecutiveDashboard
            projects={systemData.mitigationProjects}
            onManageProjects={() => setAdminViewMode("console")}
          />
        </main>
      ) : (
        /* Main Split Layout: Admin Console on Left (ฝั่งซ้ายมือ), GIS Map on Right */
        <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0 overflow-visible lg:overflow-hidden relative">
          {/* Left: Full Government Administrative Console (ฝั่งซ้ายมือ - รองรับการพับ/เปิด) */}
          <div
            className={`transition-all duration-300 ease-in-out border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col overflow-hidden ${
              isSidebarCollapsed
                ? "w-full lg:w-[72px]"
                : "w-full lg:w-[56vw] xl:w-[clamp(720px,50vw,1040px)] min-h-[72vh] lg:min-h-0"
            }`}
          >
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
              draftReverseCoordinates={draftReverseCoordinates}
              setDraftReverseCoordinates={setDraftReverseCoordinates}
              draftReverseWaypoints={draftReverseWaypoints}
              setDraftReverseWaypoints={setDraftReverseWaypoints}
              draftDirectionMeta={draftDirectionMeta}
              setDraftDirectionMeta={setDraftDirectionMeta}
              draftConflictPoints={draftConflictPoints}
              setDraftConflictPoints={setDraftConflictPoints}
              onDraftModeChange={setDraftMode}
              pickedCoordinate={pickedCoordinate}
              onFocusCoordinates={(coords) => setFocusCoordinates(coords)}
              onToast={showToast}
              setIncomingGisLines={setIncomingGisLines}
              setDraftPickMarkers={setDraftPickMarkers}
              vertexEvent={vertexEvent}
              onVertexEditChange={(active) => {
                setVertexEditable(active);
                if (active) setNeedsFullGeometry(true);
              }}
              onRequestFullGeometry={() => setNeedsFullGeometry(true)}
              onOfficeEditModeChange={setEditableOfficeId}
              isPaneCollapsed={isSidebarCollapsed}
              onTogglePaneCollapse={() => {
                setIsSidebarCollapsed(false);
                setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
              }}
            />
          </div>

          {/* Right: Interactive GIS Map */}
          <div className="h-[44vh] min-h-[360px] lg:h-auto lg:min-h-0 lg:flex-1 relative">
            {/* Sidebar Toggle Button (พับ/เปิด แผงควบคุมฝั่งซ้าย) */}
            <div className="absolute top-3 left-3 z-[450] hidden lg:block">
              <button
                type="button"
                onClick={() => {
                  setIsSidebarCollapsed((prev) => !prev);
                  // Trigger map resize adjustment
                  setTimeout(() => {
                    window.dispatchEvent(new Event("resize"));
                  }, 350);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs font-heading font-bold text-slate-200 shadow-xl backdrop-blur hover:bg-slate-800 hover:text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                title={isSidebarCollapsed ? "เปิดแผงควบคุม (แสดงฟอร์ม)" : "พับแผงควบคุม (ขยายแผนที่เต็มจอ)"}
                aria-label={isSidebarCollapsed ? "เปิดแผงควบคุม" : "พับแผงควบคุม"}
              >
                {isSidebarCollapsed ? (
                  <>
                    <PanelLeftOpen className="h-4 w-4 text-amber-400" />
                    <span>เปิดแผงควบคุม</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 text-slate-400" />
                    <span>พับแผง</span>
                  </>
                )}
              </button>
            </div>
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
                if (["PICK_START", "PICK_END", "PICK_HIGHWAY_START", "PICK_HIGHWAY_END"].includes(mode)) {
                  const label = mode === "PICK_START" || mode === "PICK_HIGHWAY_START" ? "A" : "B";
                  setDraftPickMarkers((prev) => [
                    ...prev.filter((item) => item.label !== label),
                    { lat, lon, label, mode },
                  ]);
                }
                if (mode !== "ADD_WAYPOINT" && mode !== "ADD_REVERSE_WAYPOINT" && mode !== "ADD_LINE_VERTEX") {
                  setAdminPickMode(null);
                }
              }}
              draftCoordinates={draftCoordinates}
              draftWaypoints={draftWaypoints}
              draftReverseCoordinates={draftReverseCoordinates}
              draftReverseWaypoints={draftReverseWaypoints}
              draftDirectionMeta={
                draftDirectionMeta?.showArrows === false
                  ? "UNKNOWN"
                  : (draftDirectionMeta?.arrowDirection || "TWO_WAY")
              }
              draftConflictPoints={draftConflictPoints.map((p) => p.coord)}
              draftPickMarkers={draftPickMarkers}
              onWaypointDragged={handleWaypointDragged}
              onReverseWaypointDragged={handleReverseWaypointDragged}
              vertexEditable={vertexEditable}
              onVertexMoved={(index, coord: LonLat) => emitVertexEvent({ type: "move", index, coord })}
              onVertexInserted={(index, coord: LonLat) => emitVertexEvent({ type: "insert", index, coord })}
              onVertexClicked={(index, via) => emitVertexEvent({ type: via, index })}
              editableOfficeId={editableOfficeId}
              onOfficeDragged={editableOfficeId ? (officeId, position) => {
                if (officeId !== editableOfficeId) return;
                setPickedCoordinate({ lat: position.lat, lon: position.lon, mode: "OFFICE_DRAG", ts: Date.now() });
                showToast("ย้ายหมุดสำนักงานแล้ว กดบันทึกในฟอร์มเพื่อยืนยันตำแหน่งใหม่");
              } : undefined}
              draftMode={draftMode}
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
                          : adminPickMode === "PICK_HIGHWAY_START"
                            ? "คลิกบนแผนที่เพื่อกำหนดพิกัด กม.เริ่มต้น..."
                            : adminPickMode === "PICK_HIGHWAY_END"
                              ? "คลิกบนแผนที่เพื่อกำหนดพิกัด กม.สิ้นสุด..."
                          : adminPickMode === "ADD_LINE_VERTEX"
                            ? "คลิกบนแผนที่เพื่อเพิ่มจุดบนเส้น (คลิกใกล้ปลายเส้นเพื่อต่อเส้นออกไป)..."
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
