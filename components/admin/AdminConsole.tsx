"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { DEFAULT_MAP_STYLES } from "@/lib/constants";
import {
  Settings,
  MapPinned,
  ClipboardList,
  Signpost,
  FileSpreadsheet,
  Palette,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { AnimatedStatusModal } from "@/components/ui/AnimatedStatusModal";
import { OfficialReportDispatchModal } from "@/components/admin/OfficialReportDispatchModal";

// Modular Subcomponents
import { SystemSettingsTab } from "@/components/admin/tabs/SystemSettingsTab";
import { MapManagementTab } from "@/components/admin/tabs/MapManagementTab";
import { IncidentRegistryTab } from "@/components/admin/tabs/IncidentRegistryTab";
import { DetourManagementTab } from "@/components/admin/tabs/DetourManagementTab";
import { GisDataImportTab } from "@/components/admin/tabs/GisDataImportTab";
import type { VertexEditEvent } from "@/lib/line-edit";
import { LineStylingTab } from "@/components/admin/tabs/LineStylingTab";
import { GovernorProjectsTab } from "@/components/admin/tabs/GovernorProjectsTab";

interface AdminConsoleProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftReverseCoordinates?: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftReverseWaypoints?: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftDirectionMeta?: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null;
  setDraftDirectionMeta?: (meta: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null) => void;
  draftConflictPoints?: Array<{ coord: [number, number]; label: string }>;
  setDraftConflictPoints?: (points: Array<{ coord: [number, number]; label: string }>) => void;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  onFocusCoordinates?: (coords: [number, number]) => void;
  onToast: (msg: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
  setDraftPickMarkers?: React.Dispatch<React.SetStateAction<Array<{ lat: number; lon: number; label: string; mode: string }>>>;
  onOfficeEditModeChange?: (officeId: string | null) => void;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (active: boolean) => void;
  onVertexEditTargetChange?: (target: "FORWARD" | "REVERSE") => void;
  isPaneCollapsed?: boolean;
  onTogglePaneCollapse?: () => void;
  onRequestFullGeometry?: () => void;
}

export function AdminConsole({
  systemData,
  onDataRefresh,
  adminPickMode,
  setAdminPickMode,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  draftReverseCoordinates,
  setDraftReverseCoordinates,
  draftReverseWaypoints,
  setDraftReverseWaypoints,
  draftDirectionMeta,
  setDraftDirectionMeta,
  draftConflictPoints,
  setDraftConflictPoints,
  onDraftModeChange,
  pickedCoordinate,
  onFocusCoordinates,
  onToast,
  setIncomingGisLines,
  setDraftPickMarkers,
  onOfficeEditModeChange,
  vertexEvent,
  onVertexEditChange,
  onVertexEditTargetChange,
  isPaneCollapsed,
  onTogglePaneCollapse,
  onRequestFullGeometry,
}: AdminConsoleProps) {
  // Navigation & View
  const [activeTab, setActiveTab] = useState<
    "system" | "map" | "incidents" | "detours" | "routes" | "style" | "projects"
  >("map");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // Desktop workspace width: drag the divider without changing the map's flex layout.
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const startSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isSidebarCollapsed || isPaneCollapsed) return;
    event.preventDefault();
    resizeState.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [isSidebarCollapsed, isPaneCollapsed, sidebarWidth]);
  const moveSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeState.current;
    if (!drag) return;
    setSidebarWidth(Math.min(440, Math.max(220, drag.startWidth + event.clientX - drag.startX)));
  }, []);
  const stopSidebarResize = useCallback(() => { resizeState.current = null; }, []);

  // On laptop-width screens the menu starts as an icon rail so the forms get the room.
  // It runs once after mount (not during render) to stay hydration safe; the user can still toggle it.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1535px)").matches) setIsSidebarCollapsed(true);
  }, []);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  // Cross-tab route editing
  const [editingRoute, setEditingRoute] = useState<{
    type: "FLOOD" | "DETOUR";
    id: string;
  } | null>(null);

  // Stable callback: an inline arrow here changed identity on every render and re-fired the
  // MapManagementTab effect that depends on it. It also skips the state update when nothing changed.
  const handleDraftPickMarkersChange = useCallback(
    (markers: { lat: number; lon: number; label: string; mode: string }[]) => {
      setDraftPickMarkers?.((previous) => {
        const unchanged = previous.length === markers.length && previous.every((item, index) => {
          const next = markers[index];
          return item.lat === next?.lat && item.lon === next?.lon && item.label === next?.label && item.mode === next?.mode;
        });
        return unchanged ? previous : markers;
      });
    },
    [setDraftPickMarkers]
  );

  // Status Modal State
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: "confirm" | "success" | "error" | "info";
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const showConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setModalState({
      isOpen: true,
      type: "confirm",
      title,
      message,
      onConfirm: () => {
        setModalState((prev) => ({ ...prev, isOpen: false }));
        onConfirm();
      },
    });
  };

  const showSuccessModal = (title: string, message: string) => {
    setModalState({
      isOpen: true,
      type: "success",
      title,
      message,
    });
  };

  const showErrorModal = (title: string, message: string) => {
    setModalState({
      isOpen: true,
      type: "error",
      title,
      message,
    });
  };

  // Nav Items Configuration matching reference site
  const NAV_ITEMS = [
    {
      id: "system" as const,
      label: "จัดการระบบ",
      subLabel: "ข้อมูลหน่วยงาน & พิกัดหมวด/แขวง",
      icon: Settings,
    },
    {
      id: "map" as const,
      label: "จัดการแผนที่",
      subLabel: "กำหนดจุดน้ำท่วม & ดัดเส้นเกาะถนน",
      icon: MapPinned,
    },
    {
      id: "incidents" as const,
      label: "รายการเหตุการณ์",
      subLabel: `อัปเดตระดับน้ำ (${systemData.floodRoutes?.length || 0} จุด) & ส่งออก CSV`,
      icon: ClipboardList,
      badge: systemData.floodRoutes?.filter((r) => r.is_active).length || 0,
    },
    {
      id: "detours" as const,
      label: "รายการทางเลี่ยง",
      subLabel: `ทางเลี่ยง & คำแนะนำ (${systemData.detourRoutes?.length || 0} เส้นทาง)`,
      icon: Signpost,
      badge: systemData.detourRoutes?.filter((r) => r.is_active).length || 0,
    },
    {
      id: "routes" as const,
      label: "โครงข่ายสายทาง",
      subLabel: "นำเข้า GIS & ป้ายกำกับสายทาง",
      icon: FileSpreadsheet,
    },
    {
      id: "style" as const,
      label: "สไตล์เส้นทาง",
      subLabel: "สี, แอนิเมชันวิ่ง & ความหนา",
      icon: Palette,
    },
    {
      id: "projects" as const,
      label: "โครงการผู้ว่าฯ",
      subLabel: `แผนงบประมาณ 10 จุด (${systemData.mitigationProjects?.length || 0} โครงการ)`,
      icon: Briefcase,
    },
  ];

  // Menu grouped by what the officer is doing, in the order of a normal working day.
  const NAV_GROUPS: Array<{ title: string; ids: Array<(typeof NAV_ITEMS)[number]["id"]> }> = [
    { title: "สถานการณ์น้ำท่วม", ids: ["incidents", "map", "detours"] },
    { title: "ข้อมูลโครงข่ายและแผนที่", ids: ["routes", "style"] },
    { title: "บริหารและรายงาน", ids: ["projects", "system"] },
  ];

  return (
    <div className="doh-readable flex h-full w-full bg-slate-950 text-slate-100 font-body overflow-hidden select-none">
      {/* ===================================================================== */}
      {/* 1. LEFT AUTHENTIC SIDEBAR (Matching reference site)                   */}
      {/* ===================================================================== */}
      <aside
        className={`relative hidden shrink-0 flex-col text-white lg:flex ${isPaneCollapsed || isSidebarCollapsed ? "w-[72px] transition-[width] duration-200" : ""}`}
        style={{ background: "#071B3D", width: isPaneCollapsed || isSidebarCollapsed ? 72 : sidebarWidth }}
      >
        {/* Sidebar Header Brand */}
        <div className="flex h-16 items-center border-b border-white/10 gap-3 px-4">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="h-10 w-10 shrink-0 rounded-xl object-contain shadow bg-white/10 p-0.5"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20 shadow">
              <ShieldCheck className="h-5 w-5 text-yellow-300" />
            </span>
          )}
          {!isPaneCollapsed && !isSidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">แขวงทางหลวงปัตตานี</p>
              <p className="text-[11px] text-yellow-300 font-mono">Admin Console</p>
            </div>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav aria-label="เมนูระบบจัดการ" className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.title} className={groupIndex === 0 ? "" : "mt-4"}>
              {isPaneCollapsed || isSidebarCollapsed ? (
                groupIndex > 0 && <div aria-hidden="true" className="mx-3 mb-3 border-t border-white/10" />
              ) : (
                <p className="px-2.5 pb-1.5 text-xs font-semibold tracking-wide text-slate-400">{group.title}</p>
              )}
              <div className="space-y-1">
                {group.ids.map((id) => NAV_ITEMS.find((entry) => entry.id === id)).filter((entry): entry is (typeof NAV_ITEMS)[number] => Boolean(entry)).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (item.id === "routes") {
                          onRequestFullGeometry?.();
                        }
                        if (item.id !== "map") {
                          setEditingRoute(null);
                        }
                        if (item.id !== "system") onOfficeEditModeChange?.(null);
                        if (isPaneCollapsed && onTogglePaneCollapse) {
                          onTogglePaneCollapse();
                        }
                      }}
                      className={`w-full flex items-center rounded-xl p-2.5 text-left transition ${isActive
                          ? "bg-amber-500 text-slate-950 font-bold shadow-md"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-slate-950" : "text-amber-400"}`} />
                      {!isPaneCollapsed && !isSidebarCollapsed && (
                        <div className="ml-3 min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-xs font-heading font-bold">{item.label}</p>
                            {item.badge !== undefined && item.badge > 0 && (
                              <span
                                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? "bg-slate-950 text-white" : "bg-red-600 text-white"
                                  }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p
                            className={`truncate text-[10px] ${isActive ? "text-slate-800" : "text-slate-400"
                              }`}
                          >
                            {item.subLabel}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-heading font-bold shadow transition"
            title="ออกรายงานเสนอผู้ว่าฯ (ด่วนที่สุด)"
          >
            <FileText className="w-4 h-4 shrink-0" />
            {!isPaneCollapsed && !isSidebarCollapsed && <span>รายงานผู้ว่าฯ ด่วน</span>}
          </button>

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white text-xs transition"
            title={isSidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <div className="flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[11px]">ย่อแถบเมนูข้าง</span>
              </div>
            )}
          </button>
        </div>
        {!isPaneCollapsed && !isSidebarCollapsed && (
          <div
            role="separator"
            aria-label="ปรับความกว้างแถบเมนู"
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={440}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            title="ลากเพื่อปรับความกว้างเมนู หรือใช้ปุ่มลูกศรซ้ายขวา"
            onPointerDown={startSidebarResize}
            onPointerMove={moveSidebarResize}
            onPointerUp={stopSidebarResize}
            onPointerCancel={stopSidebarResize}
            onLostPointerCapture={stopSidebarResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setSidebarWidth((width) => Math.min(440, Math.max(220, width + (event.key === "ArrowRight" ? 16 : -16))));
              }
            }}
            className="absolute right-0 top-0 z-30 h-full w-2 translate-x-1/2 cursor-col-resize touch-none bg-transparent hover:bg-amber-400/40 focus-visible:bg-amber-400/40 focus-visible:outline-none"
          />
        )}
      </aside>

      {/* ===================================================================== */}
      {/* 2. MAIN WORKING PANE                                                  */}
      {/* ===================================================================== */}
      <main className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950 ${isPaneCollapsed ? "hidden lg:hidden" : ""}`}>
        {/* Mobile / Tablet Horizontal Navigation Bar */}
        <div className="lg:hidden flex items-center overflow-x-auto border-b border-slate-800 p-2 gap-1.5 bg-slate-900 shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === "routes") onRequestFullGeometry?.();
                  if (item.id !== "map") setEditingRoute(null);
                  if (item.id !== "system") onOfficeEditModeChange?.(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold shrink-0 flex items-center gap-1.5 transition ${isActive
                    ? "bg-amber-500 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Tab Workspace */}
        <div className="doh-form flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6">
          {/* TAB 1: System Settings */}
          {activeTab === "system" && (
            <SystemSettingsTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              adminPickMode={adminPickMode}
              setAdminPickMode={setAdminPickMode}
              pickedCoordinate={pickedCoordinate}
              onOfficeEditModeChange={onOfficeEditModeChange}
            />
          )}

          {/* TAB 2: Map & Incident Management */}
          {activeTab === "map" && (
            <MapManagementTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              showErrorModal={showErrorModal}
              onNavigateToIncidents={() => setActiveTab("incidents")}
              adminPickMode={adminPickMode}
              setAdminPickMode={setAdminPickMode}
              pickedCoordinate={pickedCoordinate}
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
              onDraftModeChange={onDraftModeChange}
              onDraftPickMarkersChange={handleDraftPickMarkersChange}
              vertexEvent={vertexEvent}
              onVertexEditChange={onVertexEditChange}
              onVertexEditTargetChange={onVertexEditTargetChange}
              editingRoute={editingRoute}
              onClearEditingRoute={() => setEditingRoute(null)}
            />
          )}

          {/* TAB 3: Incident Registry & CSV */}
          {activeTab === "incidents" && (
            <IncidentRegistryTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              onEditFlood={(floodId) => {
                setEditingRoute({ type: "FLOOD", id: floodId });
                setActiveTab("map");
              }}
              onAddFlood={(ctx) => {
                setEditingRoute(null);
                setActiveTab("map");
                if (ctx?.routeNo) {
                  // ส่ง event ให้ MapManagementTab เลือกสายทางและกรอกข้อมูลเหตุการณ์แม่อัตโนมัติ
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("doh:preset-flood-context", { detail: ctx }));
                  }, 150);
                }
              }}
            />
          )}

          {/* TAB 4: Detour Routes Management */}
          {activeTab === "detours" && (
            <DetourManagementTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              showErrorModal={showErrorModal}
              onEditDetourOnMap={(detourId) => {
                setEditingRoute({ type: "DETOUR", id: detourId });
                setActiveTab("map");
              }}
              onAddDetour={() => {
                setEditingRoute({ type: "DETOUR", id: "" });
                setActiveTab("map");
              }}
              onFocusCoordinates={onFocusCoordinates}
            />
          )}

          {/* TAB 5: GIS Data Import & Highway Layers */}
          {activeTab === "routes" && (
            <GisDataImportTab
              systemData={systemData}
              lineStyles={systemData.mapStyles || DEFAULT_MAP_STYLES}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              showErrorModal={showErrorModal}
              setIncomingGisLines={setIncomingGisLines}
              adminPickMode={adminPickMode}
              setAdminPickMode={setAdminPickMode}
              pickedCoordinate={pickedCoordinate}
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
              onDraftModeChange={onDraftModeChange}
              setDraftPickMarkers={setDraftPickMarkers}
              vertexEvent={vertexEvent}
              onVertexEditChange={onVertexEditChange}
            />
          )}

          {/* TAB 5: Line Styling & SVG Studio */}
          {activeTab === "style" && (
            <LineStylingTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showSuccessModal={showSuccessModal}
            />
          )}

          {/* TAB 6: Governor & Mitigation Projects */}
          {activeTab === "projects" && (
            <GovernorProjectsTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              setIsDispatchModalOpen={setIsDispatchModalOpen}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
            />
          )}
        </div>
      </main>

      {/* Official Governor Dispatch Modal */}
      <OfficialReportDispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        systemData={systemData}
      />

      {/* Global Status Modal */}
      <AnimatedStatusModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        onConfirm={modalState.onConfirm}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
