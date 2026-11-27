"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import workspace from "./AdminWorkspace.module.css";
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
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { AnimatedStatusModal } from "@/components/ui/AnimatedStatusModal";
import { OfficialReportDispatchModal } from "@/components/admin/OfficialReportDispatchModal";

// Modular Subcomponents (Code-Split Heavy Tabs)
import { IncidentRegistryTab } from "@/components/admin/tabs/IncidentRegistryTab";
import type { VertexEditEvent } from "@/lib/line-edit";

const SystemSettingsTab = dynamic(
  () => import("@/components/admin/tabs/SystemSettingsTab").then((m) => m.SystemSettingsTab),
  { ssr: false }
);
const MapManagementTab = dynamic(
  () => import("@/components/admin/tabs/MapManagementTab").then((m) => m.MapManagementTab),
  { ssr: false }
);
const DetourManagementTab = dynamic(
  () => import("@/components/admin/tabs/DetourManagementTab").then((m) => m.DetourManagementTab),
  { ssr: false }
);
const GisDataImportTab = dynamic(
  () => import("@/components/admin/tabs/GisDataImportTab").then((m) => m.GisDataImportTab),
  { ssr: false }
);
const LineStylingTab = dynamic(
  () => import("@/components/admin/tabs/LineStylingTab").then((m) => m.LineStylingTab),
  { ssr: false }
);
const GovernorProjectsTab = dynamic(
  () => import("@/components/admin/tabs/GovernorProjectsTab").then((m) => m.GovernorProjectsTab),
  { ssr: false }
);
const ExternalJobsTab = dynamic(
  () => import("@/components/admin/tabs/ExternalJobsTab").then((m) => m.ExternalJobsTab),
  { ssr: false }
);

interface AdminConsoleProps {
  systemData: SystemDataPayload;
  onFloodMapIdsChange?: (ids: ReadonlySet<string> | null) => void;
  onDetourMapIdsChange?: (ids: ReadonlySet<string> | null) => void;
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
  onFloodMapIdsChange,
  onDetourMapIdsChange,
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
    "system" | "map" | "incidents" | "detours" | "routes" | "style" | "projects" | "jobs"
  >("map");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navDescriptionId = useId();
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
  const floodExitGuard = useRef<((leave: () => void) => void) | null>(null);
  const registerFloodExitGuard = useCallback((guard: ((leave: () => void) => void) | null) => {
    floodExitGuard.current = guard;
  }, []);
  const adminTabBody = useRef<HTMLDivElement>(null);
  const floodEditReturn = useRef<{ id: string; trigger: HTMLElement | null; paneTop: number; pageTop: number } | null>(null);
  const resumeIncidentRegistry = useCallback(() => {
    const source = floodEditReturn.current;
    floodEditReturn.current = null;
    setEditingRoute(null);
    setActiveTab("incidents");
    if (!source) return;
    requestAnimationFrame(() => {
      if (adminTabBody.current) adminTabBody.current.scrollTop = source.paneTop;
      window.scrollTo({ top: source.pageTop, behavior: "instant" });
      const trigger = source.trigger?.isConnected && source.trigger.getClientRects().length
        ? source.trigger
        : Array.from(document.querySelectorAll<HTMLElement>("[data-admin-flood-edit]"))
          .find((button) => button.dataset.adminFloodEdit === source.id);
      trigger?.focus({ preventScroll: true });
    });
  }, []);


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
    confirmLabel?: string;
    cancelLabel?: string;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });

  const showConfirmModal = (title: string, message: string, onConfirm: () => void, labels?: { confirmLabel: string; cancelLabel: string }) => {
    setModalState({
      isOpen: true,
      type: "confirm",
      ...labels,
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

  // One navigation inventory feeds both layouts. Visibility is unchanged.
  const NAV_ITEMS = [
    {
      id: "system" as const,
      label: "จัดการระบบ",
      subLabel: "หน่วยงาน ผู้ติดต่อ และตำแหน่งสำนักงาน",
      icon: Settings,
    },
    {
      id: "map" as const,
      label: "รายงานสถานการณ์น้ำท่วม",
      subLabel: "บันทึกเหตุการณ์หรือวาดทางเลี่ยง",
      icon: MapPinned,
    },
    {
      id: "incidents" as const,
      label: "รายการเหตุการณ์",
      subLabel: "ติดตามน้ำและอัปเดตสถานะ",
      icon: ClipboardList,
      badge: systemData.floodRoutes?.filter((r) => r.is_active).length || 0,
    },
    {
      id: "detours" as const,
      label: "รายการทางเลี่ยง",
      subLabel: "จัดอันดับและเชื่อมกับเหตุการณ์",
      icon: Signpost,
      badge: systemData.detourRoutes?.filter((r) => r.is_active).length || 0,
    },
    {
      id: "routes" as const,
      label: "โครงข่ายสายทาง",
      subLabel: "นำเข้า GIS และแก้ข้อมูลสายทาง",
      icon: FileSpreadsheet,
    },
    {
      id: "style" as const,
      label: "สไตล์เส้นทาง",
      subLabel: "รูปแบบเส้นและการเคลื่อนไหว",
      icon: Palette,
    },
    {
      id: "jobs" as const,
      label: "งานเบื้องหลัง",
      subLabel: "ตรวจสถานะการส่ง Drive และ Sheets",
      icon: Activity,
    },
    {
      id: "projects" as const,
      label: "โครงการผู้ว่าฯ",
      subLabel: "ติดตามแผนงานและงบประมาณ",
      icon: Briefcase,
    },
  ];

  // UI visibility flag: hide Governor & Quick Dispatch controls without removing APIs, tables, or permissions
  const HIDE_GOVERNOR_EXECUTIVE_UI = true;

  type WorkspaceId = (typeof NAV_ITEMS)[number]["id"];
  type NavItem = (typeof NAV_ITEMS)[number];
  const getNavItem = (id: WorkspaceId): NavItem => NAV_ITEMS.find((item) => item.id === id)!;
  const primaryIds: WorkspaceId[] = ["incidents", "map", "detours"];
  const toolGroups: Array<{ title: string; ids: WorkspaceId[] }> = [
    { title: "ข้อมูลแผนที่", ids: ["routes", "style"] },
    ...(!HIDE_GOVERNOR_EXECUTIVE_UI ? [{ title: "รายงานและโครงการ", ids: ["projects"] as WorkspaceId[] }] : []),
    { title: "ระบบและการส่งข้อมูล", ids: ["jobs", "system"] },
  ];
  const navGroups = [{ title: "งานภาคสนาม", ids: primaryIds }, ...toolGroups];
  const toolIsActive = !primaryIds.includes(activeTab);

  const openWorkspace = (id: WorkspaceId, expandPane: boolean) => {
    const open = () => {
      setActiveTab(id);
      if (id === "routes") onRequestFullGeometry?.();
      if (id !== "map") {
        setEditingRoute(null);
        floodEditReturn.current = null;
      }
      if (id !== "system") onOfficeEditModeChange?.(null);
      if (expandPane && isPaneCollapsed) onTogglePaneCollapse?.();
    };
    if (id !== "map" && editingRoute?.type === "FLOOD" && floodExitGuard.current) {
      floodExitGuard.current(id === "incidents" ? resumeIncidentRegistry : open);
    } else {
      open();
    }
  };

  const openToolsHint = toolIsActive ? getNavItem(activeTab).label : "ระบบและแผนที่";
  const describeCount = (item: NavItem) =>
    `${item.badge} ${item.id === "incidents" ? "ช่วงถนนกำลังแสดง" : "ทางเปิดใช้งาน"}`;
  const countId = (layout: "mobile" | "desktop", id: WorkspaceId) => `${navDescriptionId}-${layout}-${id}`;
  const renderMobileItem = (id: WorkspaceId, compact: boolean) => {
    const item = getNavItem(id);
    const Icon = item.icon;
    return (
      <button key={id} type="button"
        aria-label={item.label}
        aria-describedby={item.badge ? countId("mobile", id) : undefined}
        aria-current={activeTab === id ? "page" : undefined}
        onClick={() => openWorkspace(id, false)}
        className={`${workspace.mobileNavItem} ${compact ? workspace.mobileNavPrimary : ""} min-h-11 min-w-0 rounded-lg border border-transparent text-xs font-semibold leading-snug`}>
        <span className={workspace.mobileNavGlyph} aria-hidden="true">
          <Icon className="size-3.5 shrink-0" />
          {!!item.badge && <span className={workspace.navCount}>{item.badge > 99 ? "99+" : item.badge}</span>}
        </span>
        <span className={workspace.mobileNavLabel}>{id === "map" ? "รายงานสถานการณ์" : item.label}</span>
        {!!item.badge && <span id={countId("mobile", id)} className="sr-only">{describeCount(item)}</span>}
      </button>
    );
  };

  return (
    <div className="doh-readable flex h-full w-full bg-surface-canvas text-slate-100 font-body overflow-hidden select-none">
      {/* ===================================================================== */}
      {/* 1. LEFT AUTHENTIC SIDEBAR (Matching reference site)                   */}
      {/* ===================================================================== */}
      <aside
        className={`${workspace.chrome} relative hidden shrink-0 flex-col bg-surface-panel border-r border-surface text-white lg:flex ${isPaneCollapsed || isSidebarCollapsed ? "w-[4.5rem] transition-[width] duration-200" : ""}`}
        style={{ width: isPaneCollapsed || isSidebarCollapsed ? "4.5rem" : sidebarWidth }}
      >
        {/* Sidebar Header Brand */}
        <div className="flex h-16 items-center border-b border-surface gap-3 px-4">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="h-10 w-10 shrink-0 rounded-xl object-contain shadow bg-white/10 p-0.5"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20 shadow">
              <ShieldCheck className="h-5 w-5 text-amber-300" />
            </span>
          )}
          {!isPaneCollapsed && !isSidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-snug tracking-normal text-white">แขวงทางหลวงปัตตานี</p>
              <p className="font-mono text-[0.75rem] text-amber-300">พื้นที่จัดการเหตุการณ์</p>
            </div>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav aria-label="เมนูระบบจัดการ" className="flex-1 overflow-y-auto p-3">
          {navGroups.map((group, groupIndex) => (
            <div key={group.title} className={groupIndex === 0 ? "" : "mt-4"}>
              {isPaneCollapsed || isSidebarCollapsed ? (
                groupIndex > 0 && <div aria-hidden="true" className="mx-3 mb-3 border-t border-surface" />
              ) : (
                <p className="px-2.5 pb-1.5 text-xs font-semibold tracking-normal leading-snug text-slate-400">{group.title}</p>
              )}
              <div className="space-y-1">
                {group.ids.map(getNavItem).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      aria-describedby={item.badge ? countId("desktop", item.id) : undefined}
                      onClick={() => openWorkspace(item.id, true)}
                      className={`flex w-full items-center rounded-xl p-[0.833em] text-left transition cursor-pointer ${isActive
                          ? "bg-amber-500 text-slate-950 font-bold shadow-md"
                          : "text-slate-300 hover:bg-surface-card hover:text-white"
                        }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-slate-950" : "text-amber-400"}`} aria-hidden="true" />
                      {!!item.badge && <span id={countId("desktop", item.id)} className="sr-only">{describeCount(item)}</span>}
                      {!isPaneCollapsed && !isSidebarCollapsed && (
                        <div className="ml-3 min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-xs font-heading font-bold tracking-normal leading-snug">{item.label}</p>
                            {item.badge !== undefined && item.badge > 0 && (
                              <span className={workspace.navCount} aria-hidden="true">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            )}
                          </div>
                          <p
                            className={`truncate text-[0.75rem] ${isActive ? "text-slate-800" : "text-slate-400"
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
        <div className="p-3 border-t border-surface space-y-2">
          {!HIDE_GOVERNOR_EXECUTIVE_UI && (
            <button
              type="button"
              onClick={() => setIsDispatchModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-heading font-bold shadow transition"
              title="ออกรายงานเสนอผู้ว่าฯ (ด่วนที่สุด)"
            >
              <FileText className="w-4 h-4 shrink-0" />
              {!isPaneCollapsed && !isSidebarCollapsed && <span>รายงานผู้ว่าฯ ด่วน</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hdms-map-control w-full min-h-11 flex items-center justify-center p-2 rounded-xl transition cursor-pointer"
            title={isSidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
            aria-label={isSidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
            aria-expanded={!isSidebarCollapsed}
          >
            {isSidebarCollapsed
              ? <ChevronRight className="w-4 h-4" aria-hidden="true" />
              : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
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
      <main className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-surface-canvas ${isPaneCollapsed ? "hidden lg:hidden" : ""}`}>
        <nav aria-label="เมนูจัดการแอดมินมือถือ"
          className={`${workspace.chrome} ${workspace.mobileNav} lg:hidden shrink-0 border-b px-2.5 py-2`}>
          <div role="group" aria-label="งานภาคสนาม" className="grid grid-cols-3 gap-1">
            {primaryIds.map((id) => renderMobileItem(id, true))}
          </div>
          <details className={workspace.mobileTools}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !event.currentTarget.open) return;
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }}>
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-1.5 text-xs font-semibold">
              <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
              <span>เครื่องมือและตั้งค่า</span>
              <span className={`${workspace.toolsHint} ml-auto text-[11px] text-slate-400`}>{openToolsHint}</span>
              <ChevronRight className={`${workspace.disclosureArrow} size-3 shrink-0`} aria-hidden="true" />
            </summary>
            <div className="grid gap-2 pb-0.5 pt-1 sm:grid-cols-2">
              {toolGroups.map(({ title, ids }) => (
                <div key={title} role="group" aria-label={title} className="min-w-0">
                  <p aria-hidden="true" className="px-2.5 text-[11px] font-semibold text-slate-400">{title}</p>
                  <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
                    {ids.map((id) => renderMobileItem(id, false))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </nav>

        {/* Scrollable Tab Workspace (do not use layout/paint containment so fixed modals stay viewport-centered) */}
        <div ref={adminTabBody} className={`doh-form flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6 ${activeTab !== "projects" ? workspace.canvas : ""}`}>
          {/* TAB 1: System Settings */}
          {activeTab === "system" && (
            <SystemSettingsTab
              systemData={systemData}
              onDataRefresh={() => onDataRefresh("static")}
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
              onNavigateToIncidents={resumeIncidentRegistry}
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
              onCancelFloodEdit={resumeIncidentRegistry}
              onAbandonFloodReturn={() => { floodEditReturn.current = null; }}
              registerFloodExitGuard={registerFloodExitGuard}
            />
          )}

          {/* TAB 3: Incident Registry & CSV */}
          {(activeTab === "incidents" || (activeTab === "map" && editingRoute?.type === "FLOOD")) && (
            <div hidden={activeTab !== "incidents"} inert={activeTab !== "incidents"}>
            <IncidentRegistryTab
              onMapRouteIdsChange={activeTab === "incidents" ? onFloodMapIdsChange : undefined}
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              onEditFlood={(floodId) => {
                floodEditReturn.current = {
                  id: floodId,
                  trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
                  paneTop: adminTabBody.current?.scrollTop ?? 0,
                  pageTop: window.scrollY,
                };
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
            </div>
          )}

          {/* TAB 4: Detour Routes Management */}
          {activeTab === "detours" && (
            <DetourManagementTab
              onMapRouteIdsChange={onDetourMapIdsChange}
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
              onDataRefresh={() => onDataRefresh("static")}
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
              onDataRefresh={() => onDataRefresh("static")}
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

          {activeTab === "jobs" && <ExternalJobsTab onToast={onToast} />}
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
        confirmLabel={modalState.confirmLabel}
        cancelLabel={modalState.cancelLabel}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
