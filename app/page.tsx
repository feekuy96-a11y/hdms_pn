"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { AdviceText } from "@/components/AdviceText";
import { INITIAL_SYSTEM_DATA, SystemDataPayload, FloodRoute, DetourRoute } from "@/db/default-data";
import { createClient } from "@/lib/supabase/client";
import type { GisMapViewportApi } from "@/components/map/LongdoGisMap";
import { GisFocusModeBar } from "@/components/public/GisFocusModeBar";
import {
  enterGisFocus,
  exitGisFocus,
  IDLE_GIS_FOCUS_STATE,
  updateGisFocusOptions,
  type GisFocusDirection,
  type GisFocusState,
} from "@/lib/gis-focus-mode";

const LongdoGisMap = dynamic(
  () => import("@/components/map/LongdoGisMap").then((mod) => mod.LongdoGisMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[350px] w-full bg-surface-canvas p-4" role="status" aria-live="polite">
        <span className="sr-only">กำลังโหลดแผนที่ GIS ปัตตานี</span>
        <div aria-hidden="true" className="h-full min-h-[318px] rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="h-5 w-40 rounded-md bg-slate-700/70 animate-pulse motion-reduce:animate-none" />
          <div className="mt-4 h-8 w-56 rounded-xl bg-slate-800/80 animate-pulse motion-reduce:animate-none" />
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
import {
  AlertTriangle,
  Settings,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Navigation,
  Compass,
  Phone,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
  ArrowLeftRight,
  Droplets,
  MapPin,
  MapPinned,
  Route,
  Maximize2,
  Minimize2,
  Link2,
  CornerUpRight,
  CornerUpLeft,
  Milestone,
  BookOpen,
  ExternalLink,
  Camera,
  TrendingUp,
} from "lucide-react";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { extractDirectionalAdvice, splitDetourAdviceByDirection } from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  defaultDetourDirection,
  detourDirectionBadge,
  detourDirectionDetailedBadge,
  detourDistanceMeters,
  detourDurationSeconds,
  getDetourShortSummary,
  getDetourTimelinePresentation,
  isDetourDirectionAllowed,
  isRecordedDetourDirection,
} from "@/lib/detour-presentation";
import {
  getHighwayIdsForDetour,
  getLinkedDetoursForFlood,
  getLinkedEventsForDetour,
} from "@/lib/event-detour-links";
import { parseFloodDirectionMeta, resolveEffectiveRoadSide, AFFECTED_ROAD_PART_LABELS, normalizeMediaUrl } from "@/lib/flood-event-schema";
import {
  getTrafficPresentation,
  formatRelativeUpdateTime,
  type TrafficStatus,
  type StatusColor,
} from "@/lib/traffic-presentation";
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";

import {
  STATUS_ORDER,
  STATUS_BAR,
  STATUS_CHIP,
  highwayIdsInDetour,
  formatFloodAreaLine,
  formatKmText,
  parseRouteCoordinates,
  formatFloodSideShortLabel,
} from "@/components/public/public-route-helpers";
import { SituationSummary } from "@/components/public/SituationSummary";
import { FloodCard } from "@/components/public/FloodCard";
import { DetourDossierModal } from "@/components/public/DetourDossierModal";
import { FloodDossierModal } from "@/components/public/FloodDossierModal";
import { MobileCitizenDrawer } from "@/components/public/MobileCitizenDrawer";
import { usePublicDashboardData } from "@/components/public/usePublicDashboardData";

export default function HomePage() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_ADMIN_URL
    : null;
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);
  const detourDialogRef = useRef<HTMLDivElement | null>(null);
  const detourCloseRef = useRef<HTMLButtonElement | null>(null);
  const detourPreviousFocus = useRef<HTMLElement | null>(null);
  const dossierDetourRef = useRef<HTMLDivElement | null>(null);
  const scrollToDetourOnOpenRef = useRef<boolean>(false);
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [showDossier, setShowDossier] = useState<boolean>(false);
  const [expandedDetourId, setExpandedDetourId] = useState<string | null>(null);
  const [detourDirectionById, setDetourDirectionById] = useState<Record<string, "FORWARD" | "REVERSE">>({});
  const [eventAdviceDirection, setEventAdviceDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [isPhotoFullscreen, setIsPhotoFullscreen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<StatusColor | "ALL">("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"FLOOD" | "DETOUR">("FLOOD");
  const [viewingDetourModal, setViewingDetourModal] = useState<DetourRoute | null>(null);
  const [modalDetourDirection, setModalDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [mobileDrawerStage, setMobileDrawerStage] = useState<"peek" | "list" | "full">("list");
  const [returnToDetourList, setReturnToDetourList] = useState(false);
  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [gisFocus, setGisFocus] = useState<GisFocusState>(IDLE_GIS_FOCUS_STATE);
  const mapViewportApiRef = useRef<GisMapViewportApi | null>(null);
  const preModalViewportRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const captureFocusOriginSnapshot = useCallback(() => {
    const viewport = preModalViewportRef.current ?? mapViewportApiRef.current?.getViewport() ?? null;
    preModalViewportRef.current = null;
    return {
      viewport,
      filters: {
        activeTab: sidebarTab,
        statusFilter: selectedStatusFilter,
        routeFilter: selectedRouteFilter,
        searchQuery,
      },
    };
  }, [sidebarTab, selectedStatusFilter, selectedRouteFilter, searchQuery]);

  // Clear pre-modal snapshot if user closes FloodDossierModal without entering Focus Mode
  useEffect(() => {
    if (!showDossier && gisFocus.status === "idle") {
      preModalViewportRef.current = null;
    }
  }, [showDossier, gisFocus.status]);

  const handleEnterDetourFocus = useCallback((detourId: string, direction: GisFocusDirection) => {
    mapViewportApiRef.current?.closePopup();
    setFocusCoordinates(null);
    setViewingDetourModal(null);
    setShowDossier(false);
    setReturnToDetourList(false);
    setIsMobileDrawerOpen(false);
    setGisFocus((prev) =>
      enterGisFocus(prev, {
        targetType: "DETOUR",
        targetId: detourId,
        direction,
        captureSnapshot: captureFocusOriginSnapshot,
      })
    );
  }, [captureFocusOriginSnapshot]);

  const handleEnterFloodFocus = useCallback((floodId: string) => {
    mapViewportApiRef.current?.closePopup();
    setFocusCoordinates(null);
    setShowDossier(false);
    setViewingDetourModal(null);
    setIsMobileDrawerOpen(false);
    setGisFocus((prev) =>
      enterGisFocus(prev, {
        targetType: "FLOOD",
        targetId: floodId,
        direction: "FORWARD",
        showLinkedDetour: false,
        linkedDetourId: null,
        captureSnapshot: captureFocusOriginSnapshot,
      })
    );
  }, [captureFocusOriginSnapshot]);

  const handleExitGisFocus = useCallback(() => {
    preModalViewportRef.current = null;
    setFocusCoordinates(null);
    setGisFocus((prev) => {
      const { nextState, restoreSnapshot } = exitGisFocus(prev);
      if (restoreSnapshot?.viewport) {
        const vp = restoreSnapshot.viewport;
        window.requestAnimationFrame(() => {
          mapViewportApiRef.current?.restoreViewport(vp);
        });
      }
      return nextState;
    });
  }, []);

  // Desktop Esc shortcut to exit Shared GIS Focus Mode when no modal is open
  useEffect(() => {
    if (gisFocus.status !== "focused" || showDossier || viewingDetourModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleExitGisFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gisFocus.status, showDossier, viewingDetourModal, handleExitGisFocus]);

  // Interaction Policy: auto-exit Focus Mode when sidebar filters/search change to prevent state conflict
  const prevFiltersRef = useRef({ searchQuery, selectedRouteFilter, selectedStatusFilter });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const changed =
      prev.searchQuery !== searchQuery ||
      prev.selectedRouteFilter !== selectedRouteFilter ||
      prev.selectedStatusFilter !== selectedStatusFilter;
    prevFiltersRef.current = { searchQuery, selectedRouteFilter, selectedStatusFilter };
    if (changed && gisFocus.status === "focused") {
      setGisFocus((current) => exitGisFocus(current).nextState);
    }
  }, [searchQuery, selectedRouteFilter, selectedStatusFilter, gisFocus.status]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  }, []);

  const {
    systemData,
    isPending,
    isError,
    refetch,
    onDemandPhotos,
    loadFloodPhotosOnDemand,
    selectedFlood,
    selectedFloodMeta,
    directionalAdvice,
    selectedFloodRecentUpdates,
    siblingSegments,
    routeChips,
    filteredFloods,
    filteredDetours,
    situationCounts,
    activeFloodCount,
    dossierStatus,
    detourCountByFloodId,
    highlightFloodIds,
    highlightDetourIds,
    isFilterActive,
    highlightHighwayRouteNos,
    activeRouteChip,
    selectedFloodDetourEntries,
    selectedFloodDetours,
  } = usePublicDashboardData({
    selectedFloodId,
    sidebarTab,
    searchQuery,
    selectedRouteFilter,
    setSelectedRouteFilter,
    selectedStatusFilter,
    showToast,
  });

  // Listener for opening Detour Modal from map popups
  useEffect(() => {
    const handleOpenDetourModal = (e: Event) => {
      const detourId = (e as CustomEvent<string>).detail;
      const found = systemData.detourRoutes.find((d) => d.id === detourId);
      if (found) {
        setReturnToDetourList(false);
        setIsMobileDrawerOpen(false);
        setModalDetourDirection(found.direction_mode === "REVERSE_ONLY" ? "REVERSE" : "FORWARD");
        setViewingDetourModal(found);
      }
    };
    window.addEventListener("doh:open-detour-modal", handleOpenDetourModal);
    return () => window.removeEventListener("doh:open-detour-modal", handleOpenDetourModal);
  }, [systemData.detourRoutes]);

  useEffect(() => {
    if (!showDossier) return;
    previousFocus.current = document.activeElement as HTMLElement;
    if (!scrollToDetourOnOpenRef.current) {
      closeDetailsRef.current?.focus();
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDossier(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [showDossier]);

  // All detour accordions and timeline history start collapsed when opening or switching flood events
  useEffect(() => {
    setExpandedDetourId(null);
    setIsHistoryExpanded(false);
    setIsPhotoFullscreen(false);
  }, [selectedFloodId, showDossier]);

  // Auto-scroll to #dossier-detour-section when opening via FloodCard detour count button
  useEffect(() => {
    if (!showDossier || !scrollToDetourOnOpenRef.current) return;
    scrollToDetourOnOpenRef.current = false;
    const timer = window.setTimeout(() => {
      dossierDetourRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      dossierDetourRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [showDossier, selectedFloodId]);

  // Auto-synchronize fallback event advice direction to match the selected flood segment (per-route detours stay independent)
  useEffect(() => {
    if (!selectedFlood) return;
    const meta = parseFloodDirectionMeta(selectedFlood.direction_meta, selectedFlood);
    if (meta.directionCode === "B_TO_A") {
      setEventAdviceDirection("REVERSE");
    } else if (meta.directionCode === "A_TO_B") {
      setEventAdviceDirection("FORWARD");
    }
  }, [selectedFlood]);

  const handleStatusFilter = (color: StatusColor) => {
    setSelectedStatusFilter((current) => (current === color ? "ALL" : color));
    setSidebarTab("FLOOD");
    setIsMobileDrawerOpen(true);
  };

  const handleSelectFlood = (flood: FloodRoute, scrollToDetour: boolean = false) => {
    scrollToDetourOnOpenRef.current = scrollToDetour;
    if (gisFocus.status === "idle" && !preModalViewportRef.current) {
      preModalViewportRef.current = mapViewportApiRef.current?.getViewport() ?? null;
    }
    setSelectedFloodId(flood.id);
    const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
    if (meta.directionCode === "B_TO_A") {
      setEventAdviceDirection("REVERSE");
    } else if (meta.directionCode === "A_TO_B") {
      setEventAdviceDirection("FORWARD");
    }
    setActivePhotoIdx(0);
    setShowDossier(true);
    setIsMobileDrawerOpen(false);
    if (gisFocus.status !== "focused" && flood.lat_start && flood.lon_start) {
      setFocusCoordinates([flood.lon_start, flood.lat_start]);
    }
    loadFloodPhotosOnDemand(flood);
  };

  const handleOpenFloodDetourSection = (flood: FloodRoute) => {
    handleSelectFlood(flood, true);
  };

  const closeDetourDetails = () => {
    setViewingDetourModal(null);
    if (returnToDetourList) {
      setIsMobileDrawerOpen(true);
      setSidebarTab("DETOUR");
    }
    setReturnToDetourList(false);
  };

  // A detour opens above the mobile route sheet, so retain keyboard focus in the
  // active dialog and return it to the originating control when it closes.
  useEffect(() => {
    if (!viewingDetourModal) return;

    detourPreviousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = detourDialogRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const getFocusableElements = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
      );

    const focusableElements = getFocusableElements();
    // Let the newly rendered bottom sheet finish its layout before moving focus.
    const focusFrame = window.requestAnimationFrame(() => (detourCloseRef.current ?? focusableElements[0])?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetourDetails();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      if (detourPreviousFocus.current?.isConnected) detourPreviousFocus.current.focus();
      detourPreviousFocus.current = null;
    };
  }, [viewingDetourModal]);

  const detourList = filteredDetours.length > 0 && (
    <section className="space-y-2" aria-label="รายการทางเลี่ยง">
      <h3 className="px-1 text-xs font-heading font-bold text-amber-300">ทางเลี่ยง ({filteredDetours.length} เส้นทาง)</h3>
      {filteredDetours.map((route) => {
        const linkedEvents = getLinkedEventsForDetour(route, systemData);
        const primaryLinked = linkedEvents[0]?.primaryFlood ?? null;
        return (
          <button
            key={route.id}
            type="button"
            className="group block min-h-12 w-full rounded-2xl border border-surface bg-surface-card px-3.5 py-3 text-left text-white transition hover:border-amber-400/70 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            onClick={() => {
              setReturnToDetourList(isMobileDrawerOpen);
              setIsMobileDrawerOpen(false);
              setViewingDetourModal(route);
              const linkedMeta = primaryLinked ? parseFloodDirectionMeta(primaryLinked.direction_meta, primaryLinked) : null;
              const linkedDir = linkedEvents[0]?.links[0]?.detourDirection;
              setModalDetourDirection(
                linkedDir === "REVERSE" || linkedMeta?.directionCode === "B_TO_A" || route.direction_mode === "REVERSE_ONLY"
                  ? "REVERSE"
                  : "FORWARD"
              );
            }}
          >
            <span className="flex min-w-0 items-start justify-between gap-2">
              <strong className="min-w-0 flex-1 font-heading text-sm leading-snug font-bold break-words [overflow-wrap:anywhere] group-hover:text-amber-200">
                {route.route_name}
              </strong>
              <span className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-[0.667em] py-[0.333em] text-[0.75rem]/[1.1rem] font-semibold text-amber-200">
                {detourDirectionBadge(route.direction_mode)}
              </span>
            </span>
            <span className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 text-slate-300 break-words">
                {linkedEvents.length > 0
                  ? linkedEvents.length === 1
                    ? `เลี่ยงจุดน้ำท่วม ทล.${linkedEvents[0].routeNo}`
                    : `เลี่ยงจุดน้ำท่วม ${linkedEvents.map((e) => `ทล.${e.routeNo}`).join(", ")}`
                  : "ทางเลี่ยงอิสระ"}
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-amber-300">
                ดูเส้นทาง <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );


  return (
    <div className="doh-readable min-h-dvh flex flex-col bg-surface-canvas text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Status + Hotline)               */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between gap-2 shadow-xl">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md shrink-0 bg-slate-900 border border-surface p-0.5"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
              <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-heading font-black text-amber-400 text-[0.8125rem] sm:text-sm tracking-normal">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>
              <span className="hidden md:inline-block shrink-0 bg-amber-400 text-slate-950 text-[0.75rem]/[1.1rem] font-heading font-extrabold tracking-normal px-[0.5em] rounded">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
              <span className="text-[0.75rem]/[1.1rem] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-[0.667em] py-[0.167em] rounded font-bold hidden md:inline-flex items-center gap-[0.333em]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"></span> <span className="tracking-wide">LIVE</span>
              </span>
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold tracking-normal text-slate-300 truncate">
              {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
            </h1>
          </div>
        </div>

        {/* Right Actions: Hotline (Admin and manual refresh buttons removed for citizens) */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`tel:${systemData.systemSettings?.phone || "1586"}`}
            aria-label={`โทรสายด่วน ${systemData.systemSettings?.phone || "1586"}`}
            className="min-h-11 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-sm px-3 sm:px-3.5 py-1.5 rounded-xl shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">สายด่วน</span>
            <span className="font-mono">{systemData.systemSettings?.phone || "1586"}</span>
          </a>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. MAIN LAYOUT: GIS MAP + COLLAPSIBLE SIDEBAR + DETAIL DOSSIER     */}
      {/* =================================================================== */}
      <div className="flex flex-col lg:flex-row relative lg:overflow-hidden" style={{ height: "calc(100dvh - 4rem)", minHeight: "28.125rem" }}>
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (DESKTOP COLLAPSIBLE)                 */}
        {/* ================================================================= */}
        <div
          className={`${isSidebarCollapsed ? "hidden" : "hidden lg:flex"
            } order-2 lg:order-1 w-full lg:w-[min(35%,25.625rem)] xl:w-[min(35%,27.5rem)] bg-surface-panel border-t lg:border-t-0 lg:border-r border-surface flex-col shrink-0 z-20 lg:h-full overflow-hidden transition-all duration-300`}
        >
          {/* Sidebar Header & Search */}
          <div className="p-3.5 bg-surface-panel border-b border-surface space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none" />
                <h2 className="font-heading font-bold text-xs sm:text-sm tracking-normal text-white">
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

            <SituationSummary counts={situationCounts} activeFilter={selectedStatusFilter} onFilter={handleStatusFilter} />
            {selectedStatusFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setSelectedStatusFilter("ALL")}
                className="self-start text-xs font-semibold text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                แสดงทุกสถานะ
              </button>
            )}

            {/* View Switcher Sub-tabs: Floods / Detours */}
            <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-xl border border-surface text-xs font-heading font-bold">
              <button
                type="button"
                aria-pressed={sidebarTab === "FLOOD"}
                onClick={() => setSidebarTab("FLOOD")}
                className={`min-h-10 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === "FLOOD"
                  ? "bg-amber-500 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
                  }`}
              >
                <Droplets aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>น้ำท่วม ({filteredFloods.length})</span>
              </button>
              <button
                type="button"
                aria-pressed={sidebarTab === "DETOUR"}
                onClick={() => setSidebarTab("DETOUR")}
                className={`min-h-10 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === "DETOUR"
                  ? "bg-amber-500 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
                  }`}
              >
                <Route aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>ทางเลี่ยง ({filteredDetours.length})</span>
              </button>
            </div>

            {/* Search Input Box */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาสายทาง (ทล.43, ทล.42, ทล.418) หรือชื่อจุด/อำเภอ..."
                  aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                  className="min-h-11 w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                />
              </div>
              {(searchQuery || selectedRouteFilter !== "ALL") && ((sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length) > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedRouteFilter("ALL");
                    setSelectedStatusFilter("ALL");
                  }}
                  className="min-h-11 shrink-0 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 text-xs font-bold text-amber-300 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {/* Route Quick Filter Chips (Available for both floods and detours) */}
            {routeChips.length > 1 && (
              <div className="relative">
                <div className="flex gap-1.5 overflow-x-auto pb-1 pr-6 scrollbar-none text-[0.75rem]/[1.1rem]">
                  {routeChips.map((chip) => {
                    const isActive = selectedRouteFilter === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setSelectedRouteFilter(chip.id)}
                        aria-pressed={isActive}
                        className={`min-h-11 px-3 py-1 rounded-lg font-heading font-bold whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${isActive
                          ? "bg-amber-500 text-slate-950 shadow-md"
                          : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
                          }`}
                      >
                        {chip.label} <span aria-hidden="true">({chip.count})</span>
                      </button>
                    );
                  })}
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-slate-950 via-slate-950/75 to-transparent" />
              </div>
            )}
          </div>

          {/* Incident & Detour Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {sidebarTab === "DETOUR" && detourList}
            {sidebarTab === "FLOOD" && (
              <>
                {filteredFloods.map((flood) => (
                  <FloodCard
                    key={flood.id}
                    flood={flood}
                    selected={flood.id === selectedFloodId}
                    detourCount={detourCountByFloodId.get(flood.id) ?? 0}
                    onSelect={(item) => handleSelectFlood(item, false)}
                    onOpenDetours={handleOpenFloodDetourSection}
                  />
                ))}
              </>
            )}
            {sidebarTab === "DETOUR" && filteredDetours.length === 0 && (
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-6 text-center text-sm space-y-2.5">
                <h4 className="font-heading font-bold text-white text-xs">ไม่พบเส้นทางเลี่ยงที่ค้นหา</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {systemData.detourRoutes.length === 0
                    ? "ขณะนี้ยังไม่มีข้อมูลเส้นทางเลี่ยงในระบบ"
                    : "ขณะนี้ยังไม่มีเส้นทางเลี่ยงที่ตรงกับคำค้นหาหรือตัวกรองของคุณ"}
                </p>
                {(searchQuery || selectedRouteFilter !== "ALL") && (
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
            {sidebarTab === "FLOOD" && filteredFloods.length === 0 && (
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
                {(searchQuery || selectedRouteFilter !== "ALL" || selectedStatusFilter !== "ALL") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedRouteFilter("ALL");
                      setSelectedStatusFilter("ALL");
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
          <div className="p-3 bg-surface-panel border-t border-surface text-xs flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[0.75rem]/[1.1rem] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: 073-336-000
            </span>
            {adminUrl && <a href={adminUrl} className="text-[0.75rem]/[1.1rem] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</a>}
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="order-1 lg:order-2 relative h-[calc(100dvh-4rem)] lg:h-full flex-1 w-full overflow-hidden bg-surface-canvas">
          {isPending && (
            <div role="status" aria-live="polite" className="absolute left-1/2 top-4 z-[600] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/95 px-4 py-3 text-sm text-white shadow-xl">
              กำลังโหลดข้อมูลสถานการณ์ล่าสุด…
            </div>
          )}
          {isError && systemData.floodRoutes.length === 0 && systemData.detourRoutes.length === 0 && (
            <div role="alert" className="absolute left-1/2 top-4 z-[600] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/60 bg-slate-950/95 px-4 py-3 text-sm text-white shadow-xl">
              <span>โหลดข้อมูลสถานการณ์ไม่สำเร็จ</span>
              <button type="button" onClick={() => void refetch()} className="min-h-11 rounded-lg bg-amber-400 px-3 font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">ลองอีกครั้ง</button>
            </div>
          )}
          {/* Floating Expand Sidebar Button (when collapsed on desktop) */}
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="hidden lg:flex absolute top-4 left-4 z-[400] bg-slate-950/95 hover:bg-slate-900 text-amber-400 border border-amber-400/50 px-3 py-2 rounded-xl shadow-2xl items-center gap-2 text-xs font-heading font-bold transition"
            >
              <ChevronRight className="w-4 h-4" /> แสดงรายการสายทาง
            </button>
          )}

          <LongdoGisMap
            isFilterActive={isFilterActive}
            searchQuery={searchQuery}
            highlightHighwayRouteNos={highlightHighwayRouteNos}
            activeCardFocus={viewingDetourModal
              ? {
                  floodIds: [],
                  detourIds: [viewingDetourModal.id],
                  highwayRouteNos: getHighwayIdsForDetour(viewingDetourModal, systemData),
                }
              : showDossier && selectedFlood
                ? {
                    floodIds: [selectedFlood.id],
                    detourIds: selectedFloodDetours.map((detour) => detour.id),
                    highwayRouteNos: [
                      selectedFlood.route_no,
                      ...selectedFloodDetours.flatMap((detour) => getHighwayIdsForDetour(detour, systemData)),
                    ],
                  }
                : null}
            publicMode
            isSidebarCollapsed={isSidebarCollapsed}
            systemData={systemData}
            highlightFloodIds={highlightFloodIds}
            highlightDetourIds={highlightDetourIds}
            selectedFloodId={selectedFloodId}
            onSelectFlood={(id) => {
              const flood = systemData.floodRoutes.find((r) => r.id === id);
              if (flood) {
                handleSelectFlood(flood, false);
              }
            }}
            onOpenFloodDetours={(id) => {
              const flood = systemData.floodRoutes.find((r) => r.id === id);
              if (flood) {
                handleOpenFloodDetourSection(flood);
              }
            }}
            onSelectDetour={(detour) => {
              setViewingDetourModal(detour);
              setModalDetourDirection(defaultDetourDirection(detour.direction_mode) || "FORWARD");
              setIsMobileDrawerOpen(false);
            }}
            focusCoordinates={focusCoordinates}
            gisFocus={gisFocus}
            mapViewportApiRef={mapViewportApiRef}
            onFocusFloodOnMap={handleEnterFloodFocus}
            onFocusDetourOnMap={handleEnterDetourFocus}
            className="h-full w-full"
          />
          <GisFocusModeBar
            focusState={gisFocus}
            systemData={systemData}
            onExit={handleExitGisFocus}
            onChangeDirection={(direction) =>
              setGisFocus((prev) => updateGisFocusOptions(prev, { direction, refit: true }))
            }
            onToggleLinkedDetour={(show, detourId) =>
              setGisFocus((prev) =>
                updateGisFocusOptions(prev, {
                  showLinkedDetour: show,
                  linkedDetourId: detourId ?? prev.linkedDetourId,
                  refit: true,
                })
              )
            }
          />
          {selectedRouteFilter !== "ALL" && activeRouteChip && (
            <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-14 sm:top-3 z-[405] flex items-center gap-2 rounded-xl border border-amber-400/60 bg-surface-floating px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg whitespace-nowrap">
              <span>กำลังกรอง: {activeRouteChip.label}</span>
              <button type="button" onClick={() => setSelectedRouteFilter("ALL")} className="min-h-8 rounded px-2 py-1 text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white cursor-pointer">ล้าง</button>
            </div>
          )}

          {/* C. MOBILE FLOATING ACTION BAR & BOTTOM SHEET DRAWER */}
          <MobileCitizenDrawer
            isMobileDrawerOpen={isMobileDrawerOpen}
            setIsMobileDrawerOpen={setIsMobileDrawerOpen}
            showDossier={showDossier}
            viewingDetourModal={viewingDetourModal}
            activeFloodCount={activeFloodCount}
            situationCounts={situationCounts}
            selectedStatusFilter={selectedStatusFilter}
            setSelectedStatusFilter={setSelectedStatusFilter}
            handleStatusFilter={handleStatusFilter}
            mobileDrawerStage={mobileDrawerStage}
            setMobileDrawerStage={setMobileDrawerStage}
            sidebarTab={sidebarTab}
            setSidebarTab={setSidebarTab}
            filteredFloods={filteredFloods}
            filteredDetours={filteredDetours}
            totalFloodCount={systemData.floodRoutes.length}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedRouteFilter={selectedRouteFilter}
            setSelectedRouteFilter={setSelectedRouteFilter}
            routeChips={routeChips}
            selectedFloodId={selectedFloodId}
            detourCountByFloodId={detourCountByFloodId}
            handleSelectFlood={handleSelectFlood}
            handleOpenFloodDetourSection={handleOpenFloodDetourSection}
            detourList={detourList}
            isError={isError}
            refetch={refetch}
          />

          {/* FLOOD DOSSIER MODAL */}
          {selectedFlood && showDossier && (
            <FloodDossierModal
              selectedFlood={selectedFlood}
              selectedFloodMeta={selectedFloodMeta}
              dossierStatus={dossierStatus}
              systemData={systemData}
              onDemandPhotos={onDemandPhotos}
              activePhotoIdx={activePhotoIdx}
              setActivePhotoIdx={setActivePhotoIdx}
              isPhotoFullscreen={isPhotoFullscreen}
              setIsPhotoFullscreen={setIsPhotoFullscreen}
              siblingSegments={siblingSegments}
              setSelectedFloodId={setSelectedFloodId}
              setFocusCoordinates={setFocusCoordinates}
              closeDetailsRef={closeDetailsRef}
              dossierDetourRef={dossierDetourRef}
              setShowDossier={setShowDossier}
              selectedFloodDetours={selectedFloodDetours}
              selectedFloodDetourEntries={selectedFloodDetourEntries}
              expandedDetourId={expandedDetourId}
              setExpandedDetourId={setExpandedDetourId}
              detourDirectionById={detourDirectionById}
              setDetourDirectionById={setDetourDirectionById}
              eventAdviceDirection={eventAdviceDirection}
              setEventAdviceDirection={setEventAdviceDirection}
              directionalAdvice={directionalAdvice}
              isHistoryExpanded={isHistoryExpanded}
              setIsHistoryExpanded={setIsHistoryExpanded}
              selectedFloodRecentUpdates={selectedFloodRecentUpdates}
              onFocusFloodOnMap={(floodId) => handleEnterFloodFocus(floodId)}
              onFocusDetourOnMap={(detourId, dir) => handleEnterDetourFocus(detourId, dir)}
            />
          )}

          {/* DETOUR RECOMMENDATION MODAL (POPUP BOTTOM SHEET) */}
          {viewingDetourModal && (
            <DetourDossierModal
              viewingDetourModal={viewingDetourModal}
              systemData={systemData}
              modalDetourDirection={modalDetourDirection}
              setModalDetourDirection={setModalDetourDirection}
              detourDialogRef={detourDialogRef}
              detourCloseRef={detourCloseRef}
              closeDetourDetails={closeDetourDetails}
              onFocusMapLocation={() => {
                handleEnterDetourFocus(viewingDetourModal.id, modalDetourDirection);
              }}
            />
          )}
        </div>
      </div>


      {/* Toast Notification (z-[640]: above map/floating-bar z-[400..600], below drawer z-[650] and modals z-[700..800]) */}
      {(toastMessage || isError) && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-28 left-3 right-3 z-[640] lg:bottom-4 lg:left-auto lg:right-4 bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm"
        >
          <span aria-hidden="true" className="w-2 h-2 shrink-0 rounded-full bg-amber-400" />
          <span>{toastMessage || "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง"}</span>
        </div>
      )}
    </div>
  );
}
