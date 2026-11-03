"use client";

import React, { useState } from "react";
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
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  onFocusCoordinates?: (coords: [number, number]) => void;
  onToast: (msg: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
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
  pickedCoordinate,
  onFocusCoordinates,
  onToast,
  setIncomingGisLines,
}: AdminConsoleProps) {
  // Navigation & View
  const [activeTab, setActiveTab] = useState<
    "system" | "map" | "incidents" | "detours" | "routes" | "style" | "projects"
  >("map");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  // Cross-tab route editing
  const [editingRoute, setEditingRoute] = useState<{
    type: "FLOOD" | "DETOUR";
    id: string;
  } | null>(null);

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

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 font-body overflow-hidden select-none">
      {/* ===================================================================== */}
      {/* 1. LEFT AUTHENTIC SIDEBAR (Matching reference site)                   */}
      {/* ===================================================================== */}
      <aside
        className={`hidden shrink-0 flex-col text-white transition-[width] duration-200 lg:flex ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
        style={{ background: "linear-gradient(180deg, #071B3D, #0B2A5B)" }}
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
          {!isSidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">แขวงทางหลวงปัตตานี</p>
              <p className="text-[11px] text-yellow-300 font-mono">Admin Console</p>
            </div>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== "map") {
                    setEditingRoute(null);
                  }
                }}
                className={`w-full flex items-center rounded-xl p-2.5 text-left transition ${
                  isActive
                    ? "bg-amber-500 text-slate-950 font-bold shadow-md"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-slate-950" : "text-amber-400"}`} />
                {!isSidebarCollapsed && (
                  <div className="ml-3 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-xs font-heading font-bold">{item.label}</p>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                            isActive ? "bg-slate-950 text-white" : "bg-red-600 text-white"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`truncate text-[10px] ${
                        isActive ? "text-slate-800" : "text-slate-400"
                      }`}
                    >
                      {item.subLabel}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
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
            {!isSidebarCollapsed && <span>รายงานผู้ว่าฯ ด่วน</span>}
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
      </aside>

      {/* ===================================================================== */}
      {/* 2. MAIN WORKING PANE                                                  */}
      {/* ===================================================================== */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950">
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
                  if (item.id !== "map") setEditingRoute(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold shrink-0 flex items-center gap-1.5 transition ${
                  isActive
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
        <div className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6">
          {/* TAB 1: System Settings */}
          {activeTab === "system" && (
            <SystemSettingsTab
              systemData={systemData}
              onDataRefresh={onDataRefresh}
              onToast={onToast}
              showConfirmModal={showConfirmModal}
              showSuccessModal={showSuccessModal}
              setAdminPickMode={setAdminPickMode}
              pickedCoordinate={pickedCoordinate}
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
              onAddFlood={() => {
                setEditingRoute(null);
                setActiveTab("map");
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
