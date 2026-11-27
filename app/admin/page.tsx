"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LonLat, VertexEditEvent } from "@/lib/line-edit";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminOperationalDataAction,
  getAdminStaticGisDataAction,
  getSystemDataAction,
  snapRouteAction,
  type AdminOperationalDataPayload,
  type AdminStaticGisDataPayload,
} from "@/app/actions/doh-actions";
import { INITIAL_SYSTEM_DATA, SystemDataPayload } from "@/db/default-data";
import { AdminConsole } from "@/components/admin/AdminConsole";
import workspace from "@/components/admin/AdminWorkspace.module.css";
import { useAdminMotionPresence } from "@/components/admin/useAdminMotionPresence";

const ADMIN_THEME_KEY = "hdms-admin-workspace-theme";
type AdminTheme = "system" | "light" | "dark";

function isAdminTheme(value: string | null): value is AdminTheme {
  return value === "system" || value === "light" || value === "dark";
}

const LongdoGisMap = dynamic(
  () => import("@/components/map/LongdoGisMap").then((mod) => mod.LongdoGisMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[22rem] w-full bg-surface-canvas p-4" role="status" aria-live="polite">
        <span className="sr-only">กำลังโหลดแผนที่ GIS ปัตตานี</span>
        <div aria-hidden="true" className="h-full min-h-[20rem] rounded-2xl border border-surface bg-slate-900/60 p-4">
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
import type { GisMapViewportApi } from "@/components/map/LongdoGisMap";
import { useSharedGisFocus } from "@/components/map/useSharedGisFocus";
import { computeGisFilterHighlights } from "@/lib/gis-filter-rules";
import { OfflineSyncStatus } from "@/components/offline/OfflineSyncStatus";
import { OsrmRoutingBadge } from "@/components/offline/OsrmRoutingBadge";
import { calculateRoadSnappedRoute } from "@/lib/gis-utils";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Search, RotateCw, FileText, PieChart, Settings, Smartphone, X, Sun, Moon, Monitor } from "lucide-react";
import { OfficialReportDispatchModal } from "@/components/admin/OfficialReportDispatchModal";
const ExecutiveDashboard = dynamic(
  () => import("@/components/executive/ExecutiveDashboard").then((mod) => mod.ExecutiveDashboard),
  { ssr: false }
);
import { usePollingActivity } from "@/lib/use-polling-activity";
import { websiteEmblemClip } from "@/lib/website-emblem";
import { useSystemFavicon } from "@/lib/use-system-favicon";

export default function AdminPage() {
  const [mapSearch, setMapSearch] = useState("");
  const [registryFloodIds, setRegistryFloodIds] = useState<ReadonlySet<string> | null>(null);
  const [registryDetourIds, setRegistryDetourIds] = useState<ReadonlySet<string> | null>(null);
  const isPollingActive = usePollingActivity();
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const HIDE_EXECUTIVE_VIEW_SWITCHER = true;
  const [adminViewMode, setAdminViewMode] = useState<"console" | "executive">("console");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileActivePane, setMobileActivePane] = useState<"form" | "map">("form");
  const [workspacePaneWidth, setWorkspacePaneWidth] = useState<number | null>(null);
  const workspaceDrag = useRef<{ startX: number; startWidth: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const workspacePaneRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const savedMobileScrollYRef = useRef<number | null>(null);
  const prevAdminPickModeRef = useRef<string | null>(null);
  const clampWorkspaceWidth = (width: number) => Math.max(440, Math.min(width, window.innerWidth - 350));
  const scheduleMapResize = useCallback(() => {
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;
      window.dispatchEvent(new Event("resize"));
    });
  }, []);
  const startWorkspaceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isSidebarCollapsed) return;
    workspaceDrag.current = { startX: event.clientX, startWidth: workspacePaneRef.current?.getBoundingClientRect().width || 650 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveWorkspaceDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!workspaceDrag.current) return;
    setWorkspacePaneWidth(clampWorkspaceWidth(workspaceDrag.current.startWidth + event.clientX - workspaceDrag.current.startX));
    scheduleMapResize();
  };
  const stopWorkspaceDrag = () => {
    workspaceDrag.current = null;
    window.dispatchEvent(new Event("resize"));
  };
  const [adminTheme, setAdminTheme] = useState<AdminTheme>("system");
  const [themeChoicesOpen, setThemeChoicesOpen] = useState(false);
  const themeButton = useRef<HTMLButtonElement>(null);
  const adminShell = useRef<HTMLDivElement>(null);
  const adminHeader = useRef<HTMLElement>(null);
  const adminPaneSwitch = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = adminShell.current;
    const header = adminHeader.current;
    if (!shell || !header) return;
    const paneSwitch = adminPaneSwitch.current;
    const updateHeaderOffset = () => {
      shell.style.setProperty("--admin-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
      shell.style.setProperty("--admin-pane-switch-height", `${Math.ceil(paneSwitch?.getBoundingClientRect().height ?? 0)}px`);
    };
    updateHeaderOffset();
    const observer = new ResizeObserver(updateHeaderOffset);
    observer.observe(header);
    if (paneSwitch) observer.observe(paneSwitch);
    return () => observer.disconnect();
  }, [adminViewMode]);
  const themeChoicesPresent = useAdminMotionPresence(themeChoicesOpen);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ADMIN_THEME_KEY);
      if (isAdminTheme(saved)) setAdminTheme(saved);
    } catch {
      // Theme remains available for the session if browser storage is blocked.
    }
  }, []);
  const changeAdminTheme = (value: string) => {
    if (!isAdminTheme(value)) return;
    setAdminTheme(value);
    try {
      localStorage.setItem(ADMIN_THEME_KEY, value);
    } catch {
      // The in-memory choice is still applied.
    }
  };
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
  const [vertexEditTarget, setVertexEditTarget] = useState<"FORWARD" | "REVERSE">("FORWARD");
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
  const mapViewportApiRef = useRef<GisMapViewportApi | null>(null);
  const isEditingBlocked = Boolean(
    adminPickMode ||
      vertexEditable ||
      draftCoordinates.length > 0 ||
      draftReverseCoordinates.length > 0 ||
      editableOfficeId
  );

  const handleBeforeEnterFocus = useCallback(() => {
    setFocusCoordinates(null);
  }, []);

  const handleAfterExitFocus = useCallback(() => {
    setFocusCoordinates(null);
  }, []);

  const {
    gisFocus,
    isFocused,
    enterFloodFocus: handleEnterFloodFocus,
    enterDetourFocus: handleEnterDetourFocus,
    exitFocus: handleExitGisFocus,
  } = useSharedGisFocus({
    mapViewportApiRef,
    isModalOpen: isDispatchModalOpen || adminViewMode === "executive",
    isEditingBlocked,
    onBeforeEnterFocus: handleBeforeEnterFocus,
    onAfterExitFocus: handleAfterExitFocus,
  });

  // Phase 2.1: Single initial bootstrap (1 RTT via getSystemDataAction) hydrates both split caches:
  // ["dohAdminStaticGis"] (10m staleTime) and ["dohAdminOperational"] (live). Subsequent saves
  // refetch only the affected tier, avoiding ~293 KB (-63.9%) of unchanged full-res highway GeoJSON.
  const queryClient = useQueryClient();
  const bootstrapQuery = useQuery<SystemDataPayload>({
    queryKey: ["dohAdminSystemData"],
    queryFn: async () => {
      const full = await getSystemDataAction();
      queryClient.setQueryData<AdminStaticGisDataPayload>(["dohAdminStaticGis"], {
        updatedAt: full.updatedAt,
        highwayLayers: full.highwayLayers,
        offices: full.offices,
        mapStyles: full.mapStyles,
        systemSettings: full.systemSettings,
      });
      queryClient.setQueryData<AdminOperationalDataPayload>(["dohAdminOperational"], {
        updatedAt: full.updatedAt,
        floodRoutes: full.floodRoutes,
        detourRoutes: full.detourRoutes,
        timelineUpdates: full.timelineUpdates,
        mitigationProjects: full.mitigationProjects,
        eventDetourLinks: full.eventDetourLinks,
        eventSegments: full.eventSegments,
        floodEvents: full.floodEvents,
      });
      return full;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnMount: "always",
    refetchInterval: false,
  });

  const staticGisQuery = useQuery<AdminStaticGisDataPayload>({
    queryKey: ["dohAdminStaticGis"],
    queryFn: async () => await getAdminStaticGisDataAction(),
    enabled: false,
    staleTime: 10 * 60 * 1000,
  });

  const operationalQuery = useQuery<AdminOperationalDataPayload>({
    queryKey: ["dohAdminOperational"],
    queryFn: async () => await getAdminOperationalDataAction(),
    enabled: bootstrapQuery.isSuccess,
    staleTime: 0,
    refetchOnMount: false,
    refetchInterval: isPollingActive ? 30 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });

  const systemData = useMemo<SystemDataPayload>(() => ({
    updatedAt: operationalQuery.data?.updatedAt || staticGisQuery.data?.updatedAt || bootstrapQuery.data?.updatedAt || INITIAL_SYSTEM_DATA.updatedAt,
    floodRoutes: operationalQuery.data?.floodRoutes ?? bootstrapQuery.data?.floodRoutes ?? INITIAL_SYSTEM_DATA.floodRoutes,
    detourRoutes: operationalQuery.data?.detourRoutes ?? bootstrapQuery.data?.detourRoutes ?? INITIAL_SYSTEM_DATA.detourRoutes,
    timelineUpdates: operationalQuery.data?.timelineUpdates ?? bootstrapQuery.data?.timelineUpdates ?? INITIAL_SYSTEM_DATA.timelineUpdates,
    mitigationProjects: operationalQuery.data?.mitigationProjects ?? bootstrapQuery.data?.mitigationProjects ?? INITIAL_SYSTEM_DATA.mitigationProjects,
    eventDetourLinks: operationalQuery.data?.eventDetourLinks ?? bootstrapQuery.data?.eventDetourLinks ?? INITIAL_SYSTEM_DATA.eventDetourLinks,
    eventSegments: operationalQuery.data?.eventSegments ?? bootstrapQuery.data?.eventSegments ?? INITIAL_SYSTEM_DATA.eventSegments,
    floodEvents: operationalQuery.data?.floodEvents ?? bootstrapQuery.data?.floodEvents ?? INITIAL_SYSTEM_DATA.floodEvents,
    highwayLayers: staticGisQuery.data?.highwayLayers ?? bootstrapQuery.data?.highwayLayers ?? INITIAL_SYSTEM_DATA.highwayLayers,
    offices: staticGisQuery.data?.offices ?? bootstrapQuery.data?.offices ?? INITIAL_SYSTEM_DATA.offices,
    mapStyles: staticGisQuery.data?.mapStyles ?? bootstrapQuery.data?.mapStyles ?? INITIAL_SYSTEM_DATA.mapStyles,
    systemSettings: staticGisQuery.data?.systemSettings ?? bootstrapQuery.data?.systemSettings ?? INITIAL_SYSTEM_DATA.systemSettings,
  }), [bootstrapQuery.data, operationalQuery.data, staticGisQuery.data]);
  const mapHighlights = useMemo(() => computeGisFilterHighlights(systemData, {
    searchQuery: mapSearch,
    routeFilter: "ALL",
    statusFilter: "ALL",
    includeInactive: true,
  }), [systemData, mapSearch]);
  const mapRegistryRoutes = useMemo(() => ({
    floodRoutes: registryFloodIds === null ? systemData.floodRoutes : systemData.floodRoutes.filter((route) => registryFloodIds.has(route.id)),
    detourRoutes: registryDetourIds === null ? systemData.detourRoutes : systemData.detourRoutes.filter((route) => registryDetourIds.has(route.id)),
  }), [registryFloodIds, registryDetourIds, systemData.floodRoutes, systemData.detourRoutes]);

  const isFetching = bootstrapQuery.isFetching || operationalQuery.isFetching || staticGisQuery.isFetching;
  const isError = bootstrapQuery.isError || operationalQuery.isError || staticGisQuery.isError;

  const refreshAdminData = useCallback(async (scope: "operational" | "static" | "all" = "operational"): Promise<SystemDataPayload> => {
    if (scope === "all") {
      const result = await bootstrapQuery.refetch();
      if (result.error) throw result.error;
      return result.data ?? systemData;
    }
    const [opRes, stRes] = await Promise.all([
      scope === "static" ? Promise.resolve(null) : operationalQuery.refetch(),
      scope === "operational" ? Promise.resolve(null) : staticGisQuery.refetch(),
    ]);
    if (opRes?.error) throw opRes.error;
    if (stRes?.error) throw stRes.error;
    const op = opRes?.data ?? operationalQuery.data;
    const st = stRes?.data ?? staticGisQuery.data;
    return {
      updatedAt: op?.updatedAt || st?.updatedAt || systemData.updatedAt,
      floodRoutes: op?.floodRoutes ?? systemData.floodRoutes,
      detourRoutes: op?.detourRoutes ?? systemData.detourRoutes,
      timelineUpdates: op?.timelineUpdates ?? systemData.timelineUpdates,
      mitigationProjects: op?.mitigationProjects ?? systemData.mitigationProjects,
      eventDetourLinks: op?.eventDetourLinks ?? systemData.eventDetourLinks,
      eventSegments: op?.eventSegments ?? systemData.eventSegments,
      floodEvents: op?.floodEvents ?? systemData.floodEvents,
      highwayLayers: st?.highwayLayers ?? systemData.highwayLayers,
      offices: st?.offices ?? systemData.offices,
      mapStyles: st?.mapStyles ?? systemData.mapStyles,
      systemSettings: st?.systemSettings ?? systemData.systemSettings,
    };
  }, [bootstrapQuery, operationalQuery, staticGisQuery, systemData]);
  useSystemFavicon(systemData.systemSettings?.logoUrl, systemData.systemSettings?.name, systemData.systemSettings?.org);

  const adminFocusLabel = useMemo(() => {
    if (!isFocused || !gisFocus.targetId) return null;
    if (gisFocus.targetType === "FLOOD") {
      const flood = systemData.floodRoutes.find((item) => item.id === gisFocus.targetId);
      return flood ? `ทล.${flood.route_no} ${flood.section_name}` : "จุดน้ำท่วม";
    }
    if (gisFocus.targetType === "DETOUR") {
      const detour = systemData.detourRoutes.find((item) => item.id === gisFocus.targetId);
      const dirText = gisFocus.direction === "REVERSE" ? "B → A" : "A → B";
      return detour ? `${detour.route_name} (${dirText})` : `ทางเลี่ยง (${dirText})`;
    }
    return null;
  }, [isFocused, gisFocus.targetId, gisFocus.targetType, gisFocus.direction, systemData.floodRoutes, systemData.detourRoutes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  useEffect(() => {
    const prevMode = prevAdminPickModeRef.current;
    prevAdminPickModeRef.current = adminPickMode;
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;

    if (!prevMode && adminPickMode) {
      savedMobileScrollYRef.current = window.scrollY;
      setMobileActivePane("map");
      window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
        mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return;
    }

    if (prevMode && !adminPickMode) {
      setMobileActivePane("form");
      if (savedMobileScrollYRef.current !== null) {
        const targetY = savedMobileScrollYRef.current;
        savedMobileScrollYRef.current = null;
        window.setTimeout(() => window.scrollTo({ top: targetY, behavior: "smooth" }), 80);
      }
    }
  }, [adminPickMode]);

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
        // Keep the last valid preview on screen. Clearing it here made an operator
        // lose visual context after a transient routing failure while dragging.
        showToast("คำนวณเส้นทางใหม่ไม่สำเร็จ ระบบคงแนวเส้นเดิมไว้ กรุณาลองอีกครั้ง");
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
        let snapped: [number, number][];
        if (draftMode === "FLOOD") {
          const points = [startCoord, ...nextReverseWaypoints, endCoord];
          const segments = await Promise.all(points.slice(1).map((point, index) => snapRouteAction(points[index], point)));
          if (segments.some((segment) => !segment || segment.length < 2)) throw new Error("ไม่พบแนวทางหลวง");
          snapped = segments.flatMap((segment, index) => index === 0 ? segment! : segment!.slice(1));
        } else {
          snapped = await calculateRoadSnappedRoute(startCoord, endCoord, nextReverseWaypoints);
        }
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
    <div ref={adminShell} data-admin-theme={adminTheme} className={`${workspace.theme} min-h-dvh lg:h-dvh lg:overflow-hidden flex flex-col bg-surface-canvas text-slate-100 font-body`}>
      {/* Official Thai Government Protected Top Header */}
      <header ref={adminHeader} className={`${workspace.chrome} ${workspace.topbar} doh-header bg-surface-panel border-b sticky top-0 ${themeChoicesPresent ? "z-[1020]" : "z-50"} min-h-16 px-3 sm:px-5 py-2 lg:py-0 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1 lg:flex-none">
          <Link
            href="/"
            aria-label="หน้าประชาชน"
            title="กลับหน้าประชาชน"
            className="min-h-[2.5rem] min-w-[2.5rem] flex items-center justify-center gap-[0.4em] text-[0.75rem] text-amber-300 hover:text-white bg-slate-900/90 px-[0.8em] py-[0.5em] rounded-lg border border-surface transition font-heading font-bold shrink-0"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">หน้าประชาชน</span>
          </Link>
          <div className={workspace.brand} role="group" aria-label="ระบบจัดการของส่วนราชการ">
            {systemData.systemSettings?.logoUrl ? (
              <img src={systemData.systemSettings.logoUrl} alt="" className={workspace.brandLogo} style={{ clipPath: websiteEmblemClip(systemData.systemSettings.logoUrl) }} />
            ) : (
              <span className={`${workspace.brandLogo} ${workspace.brandFallback}`} aria-hidden="true">ขท.</span>
            )}
            <div className={workspace.brandCopy}>
              <h1 className={`${workspace.brandTitle} font-heading`}>
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </h1>
              <p className={workspace.brandOrg}>
                {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher: (รายงานผู้ว่าฯ / KPI vs ระบบหลังบ้าน Admin) */}
        {!HIDE_EXECUTIVE_VIEW_SWITCHER && (
          <div className="order-3 lg:order-none w-full lg:w-auto flex items-center justify-center lg:justify-start gap-1 bg-surface-canvas/80 p-1 rounded-xl border border-surface shrink-0">
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
        )}

        <div className="flex items-center gap-[0.45em] sm:gap-[0.55em] shrink-0">
          {isError && <span role="status" className="rounded-lg border border-red-700/70 bg-red-950/80 px-[0.6em] py-[0.25em] text-[0.75rem] text-red-200">โหลดข้อมูลฐานข้อมูลไม่สำเร็จ</span>}
          {adminViewMode === "console" && (
            <div className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setThemeChoicesOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !themeChoicesOpen) return;
                event.stopPropagation();
                setThemeChoicesOpen(false);
                themeButton.current?.focus();
              }}>
              <button type="button" ref={themeButton} className={workspace.themeChooser}
                aria-label="รูปแบบสีพื้นที่จัดการ" aria-expanded={themeChoicesOpen}
                aria-controls="admin-theme-choices" title="เปลี่ยนธีมพื้นที่จัดการ"
                onClick={() => setThemeChoicesOpen((open) => !open)}>
                <Sun className={workspace.themeSun} aria-hidden="true" size={18} />
                <Moon className={workspace.themeMoon} aria-hidden="true" size={18} />
              </button>
              <div id="admin-theme-choices" role="group" aria-label="เลือกธีมพื้นที่จัดการ"
                className={workspace.themeChoices} data-motion-open={themeChoicesOpen}
                hidden={!themeChoicesPresent} inert={!themeChoicesOpen} aria-hidden={themeChoicesOpen ? undefined : true}>
                {([
                  ["system", "ตามอุปกรณ์", Monitor], ["light", "ธีมสว่าง", Sun], ["dark", "ธีมมืด", Moon],
                ] as const).map(([mode, label, Icon]) => (
                  <button key={mode} type="button" aria-pressed={adminTheme === mode}
                    onClick={() => {
                      changeAdminTheme(mode);
                      setThemeChoicesOpen(false);
                      themeButton.current?.focus();
                    }}>
                    <Icon aria-hidden="true" size={16} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              void refreshAdminData("all");
              showToast("รีเฟรชฐานข้อมูลสารสนเทศเรียบร้อย");
            }}
            aria-label="รีเฟรชข้อมูล"
            title="รีเฟรชข้อมูล"
            className="min-h-[2.5rem] min-w-[2.5rem] flex items-center justify-center rounded-lg border border-surface bg-slate-900/70 text-slate-300 hover:text-amber-400 hover:bg-slate-800 shrink-0 transition cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile / Tablet (< lg) Sticky Segmented Switch: Form vs GIS Map */}
      {adminViewMode === "console" && (
        <div
          ref={adminPaneSwitch}
          role="group"
          aria-label="สลับมุมมองฟอร์มและแผนที่บนมือถือ"
          className={`${workspace.chrome} ${workspace.paneSwitch} lg:hidden sticky top-[var(--admin-header-height,4rem)] z-40 grid grid-cols-2 gap-[0.5em] border-b border-surface px-3 py-2`}
        >
          <button
            type="button"
            aria-pressed={mobileActivePane === "form"}
            onClick={() => setMobileActivePane("form")}
            className={`min-h-[2.5rem] rounded-lg border px-[0.85em] py-[0.45em] text-[0.8125rem] font-heading font-bold transition ${
              mobileActivePane === "form"
                ? "border-amber-500 bg-amber-500 text-slate-950"
                : "border-surface bg-surface-card text-slate-200 hover:text-white"
            }`}
          >
            ฟอร์มข้อมูล
          </button>
          <button
            type="button"
            aria-pressed={mobileActivePane === "map"}
            onClick={() => {
              setMobileActivePane("map");
              window.setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
            }}
            className={`min-h-[2.5rem] rounded-lg border px-[0.85em] py-[0.45em] text-[0.8125rem] font-heading font-bold transition ${
              mobileActivePane === "map"
                ? "border-sky-400 bg-sky-500 text-slate-950"
                : "border-surface bg-surface-card text-slate-200 hover:text-white"
            }`}
          >
            แผนที่ GIS
          </button>
        </div>
      )}

      {/* Main Content Area: Executive Dashboard (ภาพที่ 2) vs Admin Console + Map */}
      {adminViewMode === "executive" ? (
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 bg-surface-canvas">
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
            id="admin-map-workspace-pane"
            ref={workspacePaneRef}
            style={!isSidebarCollapsed && workspacePaneWidth !== null ? { width: `${workspacePaneWidth}px`, maxWidth: "calc(100vw - 22rem)" } : undefined}
            className={`transition-all duration-300 ease-in-out border-b lg:border-b-0 lg:border-r border-surface shrink-0 flex-col overflow-hidden ${
              mobileActivePane === "map" ? "hidden lg:flex" : "flex"
            } ${
              isSidebarCollapsed
                ? "w-full lg:w-[4.5rem]"
                : "w-full lg:w-[56vw] xl:w-[clamp(45rem,50vw,65rem)] min-h-[72dvh] lg:min-h-0"
            }`}
          >
            <AdminConsole
              systemData={systemData}
              onFloodMapIdsChange={setRegistryFloodIds}
              onDetourMapIdsChange={setRegistryDetourIds}
              onDataRefresh={async (scope?: "operational" | "static" | "all") => {
                return await refreshAdminData(scope === "static" || scope === "all" ? scope : "operational");
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
              onVertexEditTargetChange={setVertexEditTarget}
              onVertexEditChange={setVertexEditable}
              onOfficeEditModeChange={setEditableOfficeId}
              isPaneCollapsed={isSidebarCollapsed}
              onTogglePaneCollapse={() => {
                setIsSidebarCollapsed(false);
                setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
              }}
            />
          </div>

          {/* Accessible resize grip: resize the actual admin workspace, not only the icon menu. */}
          {!isSidebarCollapsed && <div
            role="separator"
            aria-orientation="vertical"
            aria-label="ลากเพื่อปรับความกว้างแผงจัดการและแผนที่"
            aria-valuemin={440}
            aria-valuemax={1200}
            aria-valuenow={workspacePaneWidth ?? 720}
            tabIndex={0}
            onPointerDown={startWorkspaceDrag}
            onPointerMove={moveWorkspaceDrag}
            onPointerUp={stopWorkspaceDrag}
            onPointerCancel={stopWorkspaceDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setWorkspacePaneWidth(clampWorkspaceWidth((workspacePaneWidth ?? (workspacePaneRef.current?.getBoundingClientRect().width || 720)) + (event.key === "ArrowRight" ? 32 : -32)));
                window.dispatchEvent(new Event("resize"));
              }
            }}
            title="ลากแบ่งพื้นที่: แผงจัดการ ↔ แผนที่"
            className="hidden lg:flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center bg-surface-panel border-x border-surface hover:bg-amber-500 focus-visible:bg-amber-400 focus-visible:outline-none transition-colors"
          ><span aria-hidden="true" className="h-12 w-0.5 rounded-full bg-slate-500" /></div>}

          {/* Right: Interactive GIS Map */}
          <div
            ref={mapContainerRef}
            className={`${
              mobileActivePane === "form" ? "hidden lg:flex" : "flex"
            } hdms-admin-map-pane h-[calc(100dvh-8.5rem)] min-h-[22.5rem] lg:h-auto lg:min-h-0 lg:flex-1 relative isolate flex-col bg-surface-canvas`}
          >
            <div className="relative min-h-0 flex-1">
            <LongdoGisMap
              systemData={systemData}
              registryRoutes={isEditingBlocked ? undefined : mapRegistryRoutes}
              isSidebarCollapsed={isSidebarCollapsed}
              sidePaneControl={{
                controlsId: "admin-map-workspace-pane",
                openLabel: "เปิดแผงควบคุม",
                closeLabel: "พับแผงควบคุม",
                onToggle: () => {
                  setIsSidebarCollapsed((previous) => !previous);
                  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
                },
              }}
              isFilterActive={mapHighlights.isFilterActive}
              highlightFloodIds={mapHighlights.highlightFloodIds}
              highlightDetourIds={mapHighlights.highlightDetourIds}
              highlightHighwayRouteNos={mapHighlights.highlightHighwayRouteNos}
              searchQuery={mapSearch}
              suspendRouteFiltering={isEditingBlocked}
              selectedFloodId={selectedFloodId}
              onSelectFlood={(id) => {
                setSelectedFloodId(id);
                const flood = systemData.floodRoutes.find((r) => r.id === id);
                if (flood && flood.lat_start && flood.lon_start) {
                  setFocusCoordinates([flood.lon_start, flood.lat_start]);
                }
              }}
              onSelectDetour={(detour) => {
                if (detour.lat_start && detour.lon_start) {
                  setFocusCoordinates([detour.lon_start, detour.lat_start]);
                }
              }}
              adminPickMode={adminPickMode}
              onCoordinatePicked={(lat, lon, mode) => {
                setPickedCoordinate({ lat, lon, mode, ts: Date.now() });
                if (["PICK_START", "PICK_END", "PICK_HIGHWAY_START", "PICK_HIGHWAY_END", "PICK_REV_START", "PICK_REV_END"].includes(mode)) {
                  const label = mode === "PICK_START" || mode === "PICK_HIGHWAY_START"
                    ? "A"
                    : mode === "PICK_END" || mode === "PICK_HIGHWAY_END"
                      ? "B"
                      : mode === "PICK_REV_START"
                        ? "B→"
                        : "→A";
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
              vertexEditCoordinates={vertexEditable && vertexEditTarget === "REVERSE" ? draftReverseCoordinates : draftCoordinates}
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
              gisFocus={gisFocus}
              mapViewportApiRef={mapViewportApiRef}
              onFocusFloodOnMap={handleEnterFloodFocus}
              onFocusDetourOnMap={handleEnterDetourFocus}
            />

            {isFocused && adminFocusLabel && (
              <div
                data-testid="admin-gis-focus-exit-bar"
                role="region"
                aria-label="แถบควบคุมโหมดโฟกัสบนแผนที่"
                className="pointer-events-auto absolute bottom-16 lg:bottom-4 left-1/2 -translate-x-1/2 z-[460] flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-sky-400/50 bg-surface-floating/95 py-1 pl-3.5 pr-1.5 text-xs font-heading text-slate-100 shadow-2xl backdrop-blur-md"
              >
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                <span className="truncate max-w-[14rem] sm:max-w-[20rem] font-bold">
                  โฟกัส: {adminFocusLabel}
                </span>
                <button
                  type="button"
                  data-testid="gis-focus-exit-btn"
                  onClick={() => handleExitGisFocus()}
                  title="ออกจากโหมดโฟกัส (Esc)"
                  className="inline-flex min-h-[2.25rem] shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>ออกจากโฟกัส</span>
                </button>
              </div>
            )}

            {adminPickMode && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-[500] w-[calc(100%-1.5rem)] sm:w-auto top-[6.75rem] sm:top-14 sm:max-w-[min(34rem,calc(100%-17.5rem))] bg-amber-500 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-heading font-extrabold shadow-2xl flex items-center justify-between gap-3 border border-slate-950"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping" />
                  <span>
                    {adminPickMode === "TIMELINE_PIN"
                      ? "คลิกบนแผนที่เพื่อปักหมุดจุดรายงานระดับน้ำ..."
                      : adminPickMode === "PICK_START"
                        ? "คลิกบนแผนที่เพื่อกำหนดจุดเริ่มต้น..."
                        : adminPickMode === "PICK_END"
                          ? "คลิกบนแผนที่เพื่อกำหนดจุดสิ้นสุด..."
                          : adminPickMode === "PICK_REV_START"
                            ? "คลิกบนแผนที่เพื่อกำหนดจุดเริ่มต้นขากลับ (B → A)..."
                            : adminPickMode === "PICK_REV_END"
                              ? "คลิกบนแผนที่เพื่อกำหนดจุดสิ้นสุดขากลับ (B → A)..."
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
                  className="min-h-10 bg-slate-950 text-white px-3 py-2 rounded-lg text-xs font-heading font-bold shrink-0"
                >
                  เสร็จสิ้น / ปิดโหมด
                </button>
              </div>
            )}
            </div>
            <div className="hdms-admin-map-foot" role="group" aria-label="เครื่องมือค้นหาและกลับไปฟอร์ม">
              <button
                type="button"
                onClick={() => {
                  setMobileActivePane("form");
                  if (savedMobileScrollYRef.current !== null) {
                    const y = savedMobileScrollYRef.current;
                    savedMobileScrollYRef.current = null;
                    window.setTimeout(() => window.scrollTo({ top: y, behavior: "smooth" }), 80);
                  } else {
                    window.setTimeout(() => workspacePaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                  }
                }}
                aria-label="กลับไปส่วนกรอกฟอร์ม"
                className={`${workspace.mapBack} font-heading`}
              >
                <ArrowUp size={14} aria-hidden="true" />กลับไปฟอร์ม
              </button>
              <div className={workspace.mapSearch} hidden={isEditingBlocked}>
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="ค้นหาสายทางบนแผนที่"
                  placeholder="ค้นหาสายทางบนแผนที่"
                  value={mapSearch}
                  disabled={isEditingBlocked}
                  onChange={(event) => setMapSearch(event.target.value)}
                />
              </div>
            </div>
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
        <div className={`fixed right-4 z-[9999] bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-[min(24rem,calc(100vw-2rem))] ${adminViewMode === "console" && mobileActivePane === "form" ? "bottom-[calc(7rem+env(safe-area-inset-bottom))] lg:bottom-4" : "bottom-4"}`}>
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
