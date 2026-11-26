"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./citizen-theme.css";
import "./citizen-field-map.css";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { AdviceText } from "@/components/AdviceText";
import { INITIAL_SYSTEM_DATA, SystemDataPayload, FloodRoute, DetourRoute } from "@/db/default-data";
import { createClient } from "@/lib/supabase/client";
import type { GisMapViewportApi } from "@/components/map/LongdoGisMap";
import { useSharedGisFocus } from "@/components/map/useSharedGisFocus";
import { PUBLIC_READ_MESSAGES } from "@/components/public/public-read-state";
import { CitizenPhotoViewer, publicPhotoSource, type CitizenPhoto } from "@/components/public/CitizenPhotoViewer";
import { CitizenMapStatus, recordedPassability, mapPassabilityLabel, type MapPassability } from "@/components/public/CitizenMapStatus";
import { CitizenInstallPrompt } from "@/components/public/CitizenInstallPrompt";
import { CitizenOfficeDirectory } from "@/components/public/CitizenOfficeDirectory";
import { CitizenThemeSymbol } from "@/components/public/CitizenThemeSymbol";
import { GisFocusModeBar } from "@/components/public/GisFocusModeBar";
import type { GisFocusViewportSnapshot } from "@/lib/gis-focus-mode";

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
  Sun,
  Moon,
  Settings,
  RotateCw,
  Search,
  ChevronRight,
  ChevronDown,
  X,
  Navigation,
  Compass,
  Phone,
  Clock,
  ArrowRightLeft,
  ArrowLeftRight,
  Droplets,
  Waves,
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
import { clearPublicFloodShareParam, readPublicFloodShareRef, resolvePublicFloodShare } from "@/components/public/public-share";

function isFocusableAfterFocusExit(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement &&
    element !== document.body && element !== document.documentElement &&
    element.isConnected && element.getClientRects().length > 0 &&
    !element.matches(":disabled, [aria-disabled='true']") &&
    !element.closest("[inert], [aria-hidden='true']") &&
    getComputedStyle(element).visibility === "visible";
}

export default function HomePage() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_ADMIN_URL
    : null;
  const testPreview = process.env.NEXT_PUBLIC_HDMS_TEST_PREVIEW === "1";
  const [citizenTheme, setCitizenTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("hdms.citizen.theme") === "dark") setCitizenTheme("dark");
    } catch { /* The map remains usable when browser storage is unavailable. */ }
  }, []);
  useEffect(() => {
    const handleThumbnailError = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const button = image.closest("[data-citizen-theme] button[data-public-photo]");
      if (!button) return;
      image.hidden = true;
      const fallback = button.querySelector<HTMLElement>("[data-photo-error]");
      if (fallback) fallback.hidden = false;
    };
    document.addEventListener("error", handleThumbnailError, true);
    return () => document.removeEventListener("error", handleThumbnailError, true);
  }, []);
  const toggleCitizenTheme = () => {
    const next = citizenTheme === "light" ? "dark" : "light";
    setCitizenTheme(next);
    try { window.localStorage.setItem("hdms.citizen.theme", next); } catch { /* session-only */ }
  };
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);
  const detourDialogRef = useRef<HTMLDivElement | null>(null);
  const detourCloseRef = useRef<HTMLButtonElement | null>(null);
  const detourPreviousFocus = useRef<HTMLElement | null>(null);
  const dossierDetourRef = useRef<HTMLDivElement | null>(null);
  const scrollToDetourOnOpenRef = useRef<boolean>(false);
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [showDossier, setShowDossier] = useState<boolean>(false);
  const publicShareHandled = useRef(false);
  const publicShareDossier = useRef<{ id: string; shown: boolean } | null>(null);
  const [expandedDetourId, setExpandedDetourId] = useState<string | null>(null);
  const [detourDirectionById, setDetourDirectionById] = useState<Record<string, "FORWARD" | "REVERSE">>({});
  const [eventAdviceDirection, setEventAdviceDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [publicPhoto, setPublicPhoto] = useState<CitizenPhoto | null>(null);
  const openPublicPhoto = (raw: string, alt: string, trigger: HTMLElement) => {
    const src = publicPhotoSource(raw);
    if (src) setPublicPhoto({ src, alt, trigger });
  };
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [selectedStatusFilter, setLegacyStatusFilter] = useState<StatusColor | "ALL">("ALL");
  const [mapPassability, setMapPassability] = useState<MapPassability | "ALL">("ALL");
  const setSelectedStatusFilter = (value: StatusColor | "ALL" | ((current: StatusColor | "ALL") => StatusColor | "ALL")) => {
    setLegacyStatusFilter(value);
    setMapPassability("ALL");
  };
  const matchFloodPassability = useMemo(() => mapPassability === "ALL"
    ? undefined : (route: FloodRoute) => recordedPassability(route) === mapPassability, [mapPassability]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"FLOOD" | "DETOUR">("FLOOD");
  const [viewingDetourModal, setViewingDetourModal] = useState<DetourRoute | null>(null);
  const [modalDetourDirection, setModalDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isContactOpen, setIsContactOpen] = useState(false);
  const contactOpener = useRef<HTMLButtonElement | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [mobileDrawerStage, setMobileDrawerStage] = useState<"peek" | "list" | "full">("list");
  const [returnToDetourList, setReturnToDetourList] = useState(false);
  const [focusCoordinates, setFocusCoordinates] = useState<[number, number] | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const mapViewportApiRef = useRef<GisMapViewportApi | null>(null);
  const preModalViewportRef = useRef<GisFocusViewportSnapshot | null>(null);
  const mapWorkspaceRef = useRef<HTMLElement | null>(null);
  const detourFocusReturn = useRef<{ opener: HTMLElement | null; requested: boolean } | null>(null);

  const focusFilters = useMemo(
    () => ({
      activeTab: sidebarTab,
      statusFilter: selectedStatusFilter,
      routeFilter: selectedRouteFilter,
      searchQuery,
    }),
    [sidebarTab, selectedStatusFilter, selectedRouteFilter, searchQuery]
  );

  const handleBeforeEnterFocus = useCallback(() => {
    setFocusCoordinates(null);
    setShowDossier(false);
    setViewingDetourModal(null);
    setReturnToDetourList(false);
    setIsMobileDrawerOpen(false);
  }, []);

  const handleAfterExitFocus = useCallback(() => {
    if (detourFocusReturn.current) detourFocusReturn.current.requested = true;
    setFocusCoordinates(null);
  }, []);

  const {
    gisFocus,
    enterFloodFocus: handleEnterFloodFocus,
    enterDetourFocus,
    updateFocusOptions,
    exitFocus: handleExitGisFocus,
  } = useSharedGisFocus({
    mapViewportApiRef,
    preFocusViewportRef: preModalViewportRef,
    filters: focusFilters,
    isModalOpen: showDossier || Boolean(viewingDetourModal),
    onBeforeEnterFocus: handleBeforeEnterFocus,
    onAfterExitFocus: handleAfterExitFocus,
  });

  const handleEnterDetourFocus = (...args: Parameters<typeof enterDetourFocus>) => {
    if (!args[0]) return;
    if (!detourFocusReturn.current) {
      const candidate = viewingDetourModal ? detourPreviousFocus.current
        : showDossier ? previousFocus.current : document.activeElement;
      detourFocusReturn.current = { opener: isFocusableAfterFocusExit(candidate) ? candidate : null, requested: false };
    }
    enterDetourFocus(...args);
  };

  useEffect(() => {
    if (gisFocus.status === "focused") {
      if (gisFocus.targetType !== "DETOUR") detourFocusReturn.current = null;
      return;
    }
    const intent = detourFocusReturn.current;
    detourFocusReturn.current = null;
    // Auto-exit on filters or opening another route does not claim keyboard focus.
    if (!intent?.requested) return;
    const frame = window.requestAnimationFrame(() => {
      if (isFocusableAfterFocusExit(document.activeElement)) return;
      if (Array.from(document.querySelectorAll("dialog[open], [aria-modal='true']")).some(isFocusableAfterFocusExit)) return;
      const target = isFocusableAfterFocusExit(intent.opener) ? intent.opener
        : mapWorkspaceRef.current?.querySelector(".leaflet-control-zoom-in") ?? null;
      if (isFocusableAfterFocusExit(target)) target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gisFocus.status, gisFocus.targetType]);

  // Clear pre-modal snapshot if user closes FloodDossierModal without entering Focus Mode
  useEffect(() => {
    if (!showDossier && gisFocus.status === "idle") {
      preModalViewportRef.current = null;
    }
  }, [showDossier, gisFocus.status]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  }, []);

  const {
    systemData,
    readState,
    dataUpdatedAt,
    showingSavedDisplay,
    latestReportMs,
    refetch,
    floodAlbums,
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
    matchFloodPassability,
    showToast,
  });

  const timeFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
  const fetchedAtLabel = dataUpdatedAt > 0 ? timeFormatter.format(dataUpdatedAt) : null;
  const latestReportLabel = latestReportMs !== null ? timeFormatter.format(latestReportMs) : null;
  const savedDisplayLabel = showingSavedDisplay && fetchedAtLabel
    ? `ข้อมูลที่บันทึกไว้เมื่อ ${fetchedAtLabel} น. ไม่ใช่สถานการณ์ปัจจุบัน โปรดตรวจสอบก่อนเดินทาง` : null;
  const showCounts = readState === "ready" || (readState === "stale" && (systemData.floodRoutes.length > 0 || systemData.detourRoutes.length > 0));
  const hotlinePhone = systemData.systemSettings?.phone || "1586";

  const openContacts = (event: React.MouseEvent<HTMLButtonElement>) => {
    contactOpener.current = event.currentTarget;
    setShowDossier(false);
    setViewingDetourModal(null);
    setIsMobileDrawerOpen(false);
    setIsContactOpen(true);
  };

  const closeContacts = () => {
    setIsContactOpen(false);
    requestAnimationFrame(() => {
      const opener = contactOpener.current;
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else Array.from(document.querySelectorAll<HTMLButtonElement>("[data-citizen-contact], [data-citizen-contact-desktop]"))
        .find((button) => button.getClientRects().length > 0)?.focus();
    });
  };

  // Listener for opening Detour Modal from map popups
  useEffect(() => {
    const handleOpenDetourModal = (e: Event) => {
      const detourId = (e as CustomEvent<string>).detail;
      const found = systemData.detourRoutes.find((d) => d.id === detourId);
      if (found) {
        setReturnToDetourList(false);
        setIsMobileDrawerOpen(false);
        setModalDetourDirection(found.direction_mode === "REVERSE_ONLY" ? "REVERSE" : "FORWARD");
        setShowDossier(false);
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

  const showMapList = (tab: "FLOOD" | "DETOUR") => {
    setSidebarTab(tab);
    if (window.matchMedia("(min-width: 1024px)").matches) setIsSidebarCollapsed(false);
    else {
      setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage);
      setIsMobileDrawerOpen(true);
    }
  };
  const filterMapPassability = (status: MapPassability | "ALL") => {
    setLegacyStatusFilter("ALL");
    setMapPassability(status);
    setSidebarTab("FLOOD");
  };
  const handleStatusFilter = (color: StatusColor) => {
    setSelectedStatusFilter((current) => (current === color ? "ALL" : color));
    showMapList("FLOOD");
  };

  const handleSelectFlood = useCallback((flood: FloodRoute, scrollToDetour = false, fromMobileList = false) => {
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
    setViewingDetourModal(null);
    setShowDossier(true);
    // The dossier hides the drawer while open; preserve the originating list.
    if (!fromMobileList) setIsMobileDrawerOpen(false);
    if (gisFocus.status !== "focused" && flood.lat_start && flood.lon_start) {
      setFocusCoordinates([flood.lon_start, flood.lat_start]);
    }
    loadFloodPhotosOnDemand(flood);
  }, [gisFocus.status, loadFloodPhotosOnDemand]);

  useEffect(() => {
    if (publicShareHandled.current) return;
    const ref = readPublicFloodShareRef(window.location.search);
    if (ref === null) {
      publicShareHandled.current = true;
      return;
    }
    // A stale/failed read may recover; never substitute the first visible report.
    if (ref !== "invalid" && readState !== "ready") return;
    publicShareHandled.current = true;
    const flood = ref === "invalid" ? undefined : resolvePublicFloodShare(ref, systemData);
    if (!flood) {
      clearPublicFloodShareParam();
      showToast("ไม่พบเหตุการณ์น้ำท่วมนี้ในรายงานสาธารณะล่าสุด");
      return;
    }
    publicShareDossier.current = { id: flood.id, shown: false };
    setIsContactOpen(false);
    handleSelectFlood(flood);
  }, [handleSelectFlood, readState, showToast, systemData]);

  useEffect(() => {
    const link = publicShareDossier.current;
    if (!link) return;
    if (showDossier && !link.shown) {
      link.shown = true;
      return;
    }
    if (!link.shown) return;
    const withdrawn = readState === "ready" && !systemData.floodRoutes.some((flood) => flood.id === link.id && flood.is_active);
    if (!showDossier || withdrawn) {
      publicShareDossier.current = null;
      clearPublicFloodShareParam();
      if (withdrawn) {
        setShowDossier(false);
        showToast("ไม่พบเหตุการณ์น้ำท่วมนี้ในรายงานสาธารณะล่าสุด");
      }
    }
  }, [showDossier, readState, systemData.floodRoutes, showToast]);

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
    <div data-citizen-theme={citizenTheme} className="citizen-ui doh-readable min-h-dvh flex flex-col bg-surface-canvas text-slate-100 font-body"
      onClickCapture={(event) => {
        const photoTrigger = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-public-photo]") : null;
        if (photoTrigger) {
          const img = photoTrigger.querySelector("img");
          if (img) openPublicPhoto(img.getAttribute("src") ?? "", img.alt, photoTrigger);
          return;
        }
        if (!testPreview) return;
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        const href = link?.getAttribute("href") ?? "";
        if (/^(https?:|tel:)/i.test(href)) {
          event.preventDefault();
          showToast("โหมดทดสอบ: ไม่ได้เปิดลิงก์ภายนอกหรือโทรออก");
        }
      }}
    >
      {testPreview && <p role="note" className="citizen-test-note h-5 shrink-0 bg-slate-950 px-2 text-center text-[0.6875rem] font-bold leading-5 text-amber-200">เว็บทดสอบ · ข้อมูลจำลอง</p>}
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Status + Hotline)               */}
      {/* =================================================================== */}
      <header className="citizen-header doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between gap-2 shadow-xl">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md shrink-0 bg-slate-900 border border-surface p-0.5"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl citizen-logo gold-gradient flex items-center justify-center shadow-md shrink-0">
              <AlertTriangle className="citizen-brand-existing w-5 h-5 text-slate-950 font-bold" />
              <svg className="citizen-field-sign" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M14 1.8 26.2 14 14 26.2 1.8 14 14 1.8Z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8.5 19.5c0-4.2 3.9-3.8 3.9-7.1V8m7.1 11.5c0-4.2-3.9-3.8-3.9-7.1V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M14 18.5v1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="citizen-brand-name truncate font-heading font-black text-[0.8125rem] sm:text-sm tracking-normal">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>

            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold tracking-normal text-slate-300 truncate">
              {systemData.systemSettings?.org || "แขวงทางหลวงปัตตานี กรมทางหลวง"}
            </h1>
          </div>
        </div>

        {/* Right Actions: Hotline (Admin and manual refresh buttons removed for citizens) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!testPreview && fetchedAtLabel && <span className="citizen-traffic-time hidden xl:inline">ดึงข้อมูลสำเร็จล่าสุด {fetchedAtLabel} น.</span>}
          <button type="button" data-citizen-contact-desktop className="citizen-theme-button hidden lg:inline-flex" onClick={openContacts}>
            <Phone aria-hidden="true" className="size-4" />ติดต่อ
          </button>
          <button type="button" className="citizen-theme-button citizen-theme-switch" onClick={toggleCitizenTheme}
            aria-label={citizenTheme === "light" ? "เปิดธีมมืด" : "เปิดธีมสว่าง"} aria-pressed={citizenTheme === "dark"}>
            <CitizenThemeSymbol day={citizenTheme === "dark"} />
            {citizenTheme === "light" ? <Moon aria-hidden="true" className="citizen-theme-legacy size-4" /> : <Sun aria-hidden="true" className="citizen-theme-legacy size-4" />}
          </button>
          <a
            href={`tel:${hotlinePhone}`}
            aria-label={`โทรสายด่วน ${systemData.systemSettings?.phone || "1586"}`}
            className="citizen-hotline min-h-11 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-heading font-bold text-sm px-3 sm:px-3.5 py-1.5 rounded-xl shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
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
      <main className="citizen-workspace flex flex-col lg:flex-row relative h-[calc(100dvh-4rem)] min-h-0 lg:min-h-[28.125rem] lg:overflow-hidden" style={testPreview ? { height: "calc(100dvh - 5.25rem)" } : undefined}>
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (DESKTOP COLLAPSIBLE)                 */}
        {/* ================================================================= */}
        <div
          id="public-map-route-pane"
          className={`${isSidebarCollapsed ? "hidden" : "hidden lg:flex"
            } citizen-sidebar lg:order-1 w-full lg:w-[min(35%,25.625rem)] xl:w-[min(35%,27.5rem)] bg-surface-panel border-t lg:border-t-0 lg:border-r border-surface flex-col shrink-0 z-20 lg:h-full overflow-hidden transition-all duration-300`}
        >
          {/* Sidebar Header & Search */}
          <div className="citizen-dock-controls p-3.5 bg-surface-panel border-b border-surface space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">ตรวจสอบเส้นทาง</h2>
                <p className="citizen-subcopy">ค้นหา เลือกสายทาง หรือกรองสถานะการเดินทาง</p>
              </div>
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

            {showCounts && <SituationSummary counts={situationCounts} activeFilter={selectedStatusFilter} onFilter={handleStatusFilter} />}
            {(selectedStatusFilter !== "ALL" || mapPassability !== "ALL") && (
              <button
                type="button"
                onClick={() => setSelectedStatusFilter("ALL")}
                className="self-start text-xs font-semibold text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                แสดงทุกสถานะ
              </button>
            )}

            {/* View Switcher Sub-tabs: Floods / Detours */}
            <div className="citizen-section-tabs grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-xl border border-surface text-xs font-heading font-bold">
              <button
                type="button"
                aria-pressed={sidebarTab === "FLOOD"}
                onClick={() => setSidebarTab("FLOOD")}
                className={`min-h-10 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${sidebarTab === "FLOOD"
                  ? "bg-amber-500 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
                  }`}
              >
                <Waves aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>น้ำท่วม{showCounts && ` (${filteredFloods.length})`}</span>
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
                <span>ทางเลี่ยง{showCounts && ` (${filteredDetours.length})`}</span>
              </button>
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
            {readState !== "ready" && <p className="text-xs text-slate-300" role="status">{PUBLIC_READ_MESSAGES[readState]}</p>}
            {fetchedAtLabel && <p className="text-xs text-slate-300">
              ดึงข้อมูลสำเร็จล่าสุด {fetchedAtLabel} น.
              {latestReportLabel && <><br />เวลาอัปเดตรายงานล่าสุด {latestReportLabel} น.</>}
            </p>}
            {sidebarTab === "DETOUR" && showCounts && detourList}
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
            {readState === "ready" && sidebarTab === "DETOUR" && filteredDetours.length === 0 && (
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
            {readState === "ready" && sidebarTab === "FLOOD" && filteredFloods.length === 0 && (
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-6 text-center text-sm space-y-2.5">
                <div className="w-10 h-10 mx-auto rounded-full bg-surface-card flex items-center justify-center text-slate-300">
                  <Search aria-hidden="true" className="w-5 h-5" />
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
                {(searchQuery || selectedRouteFilter !== "ALL" || selectedStatusFilter !== "ALL" || mapPassability !== "ALL") && (
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
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: {hotlinePhone}
            </span>
            {adminUrl && <a href={adminUrl} className="text-[0.75rem]/[1.1rem] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</a>}
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <section ref={mapWorkspaceRef} aria-label="แผนที่และข้อมูลการเดินทาง" className="citizen-map-workspace order-1 lg:order-2 relative h-full min-h-0 flex-1 w-full overflow-hidden bg-surface-canvas">
          {readState === "loading" && (
            <div role="status" aria-live="polite" className="absolute left-1/2 top-[6.75rem] sm:top-14 z-[600] -translate-x-1/2 max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-17.5rem)] rounded-xl border border-slate-700 bg-slate-950/95 px-4 py-2.5 text-sm text-white shadow-xl">
              กำลังโหลดข้อมูลสถานการณ์ล่าสุด…
            </div>
          )}
          {(readState === "unavailable" || readState === "stale") && (
            savedDisplayLabel ? (
              <div role="alert" className="absolute inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[415] mx-auto flex max-w-[28rem] items-center gap-2 rounded-xl border border-amber-500/60 bg-surface-panel px-3 py-2 text-xs text-slate-200 shadow-lg lg:bottom-4">
                <span className="min-w-0">{savedDisplayLabel} แผนที่พื้นหลังและภาพอาจไม่พร้อมใช้งาน</span>
                <button type="button" onClick={() => void refetch()} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-surface px-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">ลองใหม่</button>
              </div>
            ) : (
              <div role="alert" className="absolute left-1/2 top-[6.75rem] sm:top-14 z-[600] flex max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-17.5rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/60 bg-slate-950/95 px-4 py-2.5 text-sm text-white shadow-xl">
                <span>{PUBLIC_READ_MESSAGES[readState]}</span>
                <button type="button" onClick={() => void refetch()} className="min-h-11 rounded-lg bg-amber-400 px-3 font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">ลองอีกครั้ง</button>
              </div>
            )
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
            publicStatusSummary={!showDossier && !viewingDetourModal && !isContactOpen ? (
              <div className={isMobileDrawerOpen ? "hidden lg:block" : undefined}>
                <CitizenMapStatus systemData={systemData} selected={mapPassability}
                  onFilter={filterMapPassability} onDetours={() => showMapList("DETOUR")} readState={readState} />
              </div>
            ) : undefined}
            isSidebarCollapsed={isSidebarCollapsed}
            sidePaneControl={{
              controlsId: "public-map-route-pane",
              openLabel: "แสดงรายการสายทาง",
              closeLabel: "ย่อรายการสายทาง",
              onToggle: () => setIsSidebarCollapsed((previous) => !previous),
            }}
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
              setShowDossier(false);
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
              updateFocusOptions({ direction, refit: true })
            }
            onToggleLinkedDetour={(show, detourId) =>
              updateFocusOptions({
                showLinkedDetour: show,
                linkedDetourId: detourId,
                refit: true,
              })
            }
          />
          {selectedRouteFilter !== "ALL" && activeRouteChip && (
            <div
              data-testid="public-active-filter-chip"
              className="citizen-map-active-filter pointer-events-auto absolute top-[8.25rem] left-3 sm:top-auto sm:bottom-[5.75rem] lg:bottom-4 z-[405] flex w-fit max-w-[calc(100%-1.5rem)] sm:max-w-[24rem] items-center gap-2 rounded-xl border border-amber-400/60 bg-surface-floating/95 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur-md"
            >
              <span className="truncate">กำลังกรอง: {activeRouteChip.label}</span>
              <button type="button" onClick={() => setSelectedRouteFilter("ALL")} className="min-h-8 shrink-0 rounded-lg px-2 py-1 text-amber-300 underline underline-offset-2 hover:bg-amber-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white cursor-pointer">ล้าง</button>
            </div>
          )}

          {/* C. MOBILE FLOATING ACTION BAR & BOTTOM SHEET DRAWER */}
          <MobileCitizenDrawer
            openContacts={openContacts}
            isMobileDrawerOpen={isMobileDrawerOpen}
            setIsMobileDrawerOpen={setIsMobileDrawerOpen}
            showDossier={showDossier || isContactOpen}
            viewingDetourModal={viewingDetourModal}
            situationCounts={situationCounts}
            selectedStatusFilter={selectedStatusFilter}
            mapStatusFilterLabel={mapPassability === "ALL" ? undefined : mapPassabilityLabel(mapPassability)}
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
            handleSelectFlood={(flood, scrollToDetour) => handleSelectFlood(flood, scrollToDetour, true)}
            handleOpenFloodDetourSection={(flood) => handleSelectFlood(flood, true, true)}
            detourList={detourList}
            readState={readState}
            fetchedAtLabel={fetchedAtLabel}
            latestReportLabel={latestReportLabel}
            hasCounts={showCounts}
            refetch={refetch}
          />

          {/* FLOOD DOSSIER MODAL */}
          {selectedFlood && showDossier && !viewingDetourModal && selectedFlood.id === selectedFloodId && (
            <FloodDossierModal
              selectedFlood={selectedFlood}
              savedDisplayLabel={savedDisplayLabel}
              selectedFloodMeta={selectedFloodMeta}
              dossierStatus={dossierStatus}
              systemData={systemData}
              floodAlbum={floodAlbums[selectedFlood.id]}
              loadFloodPhotosOnDemand={loadFloodPhotosOnDemand}
              activePhotoIdx={activePhotoIdx}
              setActivePhotoIdx={setActivePhotoIdx}
              onOpenPhoto={openPublicPhoto}
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
              savedDisplayLabel={savedDisplayLabel}
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
        </section>
      </main>


      {publicPhoto && <CitizenPhotoViewer photo={publicPhoto} onClose={() => setPublicPhoto(null)} />}
      <CitizenInstallPrompt blocked={Boolean(testPreview || showDossier || isMobileDrawerOpen || isContactOpen || viewingDetourModal || gisFocus.status !== "idle")} />
      {isContactOpen && <CitizenOfficeDirectory offices={systemData.offices} hotlinePhone={hotlinePhone} onClose={closeContacts} />}

      {/* Toast Notification (z-[640]: above map/floating-bar z-[400..600], below drawer z-[650] and modals z-[700..800]) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-28 left-3 right-3 z-[640] lg:bottom-4 lg:left-auto lg:right-4 bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm"
        >
          <span aria-hidden="true" className="w-2 h-2 shrink-0 rounded-full bg-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
