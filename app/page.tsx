"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { AdviceText } from "@/components/AdviceText";
import { INITIAL_SYSTEM_DATA, SystemDataPayload, FloodRoute, DetourRoute } from "@/db/default-data";
import { createClient } from "@/lib/supabase/client";

const LongdoGisMap = dynamic(
  () => import("@/components/map/LongdoGisMap").then((mod) => mod.LongdoGisMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[350px] w-full bg-[#0b1426] p-4" role="status" aria-live="polite">
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
// Chart.js + react-chartjs-2 are only needed once a flood dossier is open, so keep them out of the
// initial bundle that every visitor downloads.
const WaterTimelineChart = dynamic(
  () => import("@/components/charts/WaterTimelineChart").then((mod) => mod.WaterTimelineChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">กำลังโหลดกราฟระดับน้ำ...</div>
    ),
  }
);
const FloodEventMiniMap = dynamic(
  () => import("@/components/map/FloodEventMiniMap").then((mod) => mod.FloodEventMiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 w-full items-center justify-center rounded-xl border border-slate-700/80 bg-[#0b1528] text-xs text-slate-400">
        กำลังโหลดแผนที่ตำแหน่ง...
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

export default function HomePage() {
  const isPollingActive = usePollingActivity();
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
  const previousDataFingerprint = useRef<string>("");

  // TanStack Query for Data Fetching & Sync with automatic background refetch (Network-First live data)
  const { data: systemData = INITIAL_SYSTEM_DATA, isPending, isError, refetch } = useQuery<SystemDataPayload>({
    queryKey: ["dohSystemData"],
    queryFn: async () => {
      return await getPublicSystemDataAction();
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

  // Background Auto-Notification when new/updated data arrives (Issue #6)
  useEffect(() => {
    if (!systemData) return;
    const currentFingerprint = `${systemData.updatedAt || ""}_${systemData.floodRoutes?.length || 0}_${(systemData.floodRoutes || [])
      .map((r) => `${r.id}:${r.water_level_cm}:${r.traffic_status}:${r.updated_at}`)
      .join("|")}`;

    if (previousDataFingerprint.current && previousDataFingerprint.current !== currentFingerprint) {
      showToast("🔔 มีข้อมูลสถานการณ์อัปเดตล่าสุดจากศูนย์ปฏิบัติการ");
    }
    previousDataFingerprint.current = currentFingerprint;
  }, [systemData]);

  // Listener for opening Detour Modal from map popups
  useEffect(() => {
    const handleOpenDetourModal = (e: any) => {
      const detourId = e.detail;
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

  const selectedFlood =
    systemData.floodRoutes.find((r) => r.id === selectedFloodId) || systemData.floodRoutes[0];
  const selectedFloodMeta = React.useMemo(() => parseFloodDirectionMeta(selectedFlood?.direction_meta, selectedFlood), [selectedFlood]);

  // Parsing the advice text is regex heavy; do it once per advice text, not on every render.
  const selectedFloodKey = selectedFlood?.id;
  const selectedFloodAdvice = selectedFlood?.detour_advice || "";
  const directionalAdvice = React.useMemo(() => extractDirectionalAdvice(selectedFloodAdvice), [selectedFloodAdvice]);
  // Latest 3 updates of the selected flood, computed once per data/selection change.
  const selectedFloodRecentUpdates = React.useMemo(
    () => (selectedFloodKey ? systemData.timelineUpdates.filter((u) => u.flood_id_ref === selectedFloodKey).slice(0, 3) : []),
    [systemData.timelineUpdates, selectedFloodKey]
  );

  // Sibling segments under the same parent event or same control section
  const siblingSegments = React.useMemo(() => {
    if (!selectedFlood) return [];
    const eventId = selectedFloodMeta?.eventId;
    return (systemData.floodRoutes || []).filter(
      (r) =>
        r.is_active &&
        ((eventId && r.direction_meta?.eventId === eventId) ||
          (r.route_no === selectedFlood.route_no && r.section_name === selectedFlood.section_name))
    );
  }, [selectedFlood, selectedFloodMeta?.eventId, systemData.floodRoutes]);

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

  const floodRouteChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active || !flood.route_no || /^(?:ปน)\.?/i.test(flood.route_no)) continue;
      const number = flood.route_no.replace(/^ทล\.?\s*/i, "").trim();
      if (number) counts.set(number, (counts.get(number) || 0) + 1);
    }
    const sorted = [...counts.keys()].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    return [{ id: "ALL", label: "ทุกสายทาง", count: (systemData.floodRoutes || []).filter((route) => route.is_active).length }, ...sorted.map((id) => ({ id, label: `ทล.${id}`, count: counts.get(id) || 0 }))];
  }, [systemData.floodRoutes]);

  const detourRouteChips = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const detour of systemData.detourRoutes || []) {
      if (!detour.is_active) continue;
      const linked = getLinkedEventsForDetour(detour, systemData);
      const labels = linked.length > 0
        ? linked.map((event) => ({ id: event.routeNo, label: `ทล.${event.routeNo}` }))
        : [...`${detour.route_name || ""} ${detour.description || ""}`.matchAll(/(ปน\.(?:ถ\.)?\s*\d{1,5})/gi)].map((match) => ({ id: match[1].replace(/\s+/g, ""), label: match[1].replace(/\s+/g, "") }));
      for (const item of labels) {
        const current = counts.get(item.id);
        counts.set(item.id, { label: item.label, count: (current?.count || 0) + 1 });
      }
    }
    const sorted = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "th", { numeric: true }));
    return [{ id: "ALL", label: "ทุกสายทาง", count: (systemData.detourRoutes || []).filter((route) => route.is_active).length }, ...sorted.map(([id, item]) => ({ id, ...item }))];
  }, [systemData.floodRoutes, systemData.detourRoutes]);
  const routeChips = sidebarTab === "FLOOD" ? floodRouteChips : detourRouteChips;
  useEffect(() => {
    if (!routeChips.some((chip) => chip.id === selectedRouteFilter)) setSelectedRouteFilter("ALL");
  }, [routeChips, selectedRouteFilter]);

  // Filtered flood routes for citizens/users
  const filteredFloods = (systemData.floodRoutes || []).filter((r) => {
    if (!r.is_active) return false;
    const normalizedQuery = searchQuery.trim().replace(/^(?:ทล|ปน)\.?\s*/i, "").toLocaleLowerCase();
    const matchSearch =
      r.route_no.toLowerCase().includes(normalizedQuery) ||
      r.section_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.subdistrict && r.subdistrict.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase()));

    const cleanNo = r.route_no.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim();
    const matchChip = selectedRouteFilter === "ALL" || cleanNo === selectedRouteFilter || r.route_no === selectedRouteFilter;

    const presentation = getTrafficPresentation(r.traffic_status as TrafficStatus, r.water_level_cm, r.direction_meta?.trafficStatusDetail);
    const matchStatus = selectedStatusFilter === "ALL" || presentation.color === selectedStatusFilter;
    return matchSearch && matchChip && matchStatus;
  }).sort(
    (a, b) =>
      STATUS_ORDER[getTrafficPresentation(a.traffic_status as TrafficStatus, a.water_level_cm, a.direction_meta?.trafficStatusDetail).color] -
      STATUS_ORDER[getTrafficPresentation(b.traffic_status as TrafficStatus, b.water_level_cm, b.direction_meta?.trafficStatusDetail).color]
  );
  const situationCounts = React.useMemo(() => {
    const counts: Record<StatusColor, number> = { red: 0, orange: 0, amber: 0, sky: 0, emerald: 0, slate: 0 };
    (systemData.floodRoutes || []).forEach((route) => {
      if (route.is_active) counts[getTrafficPresentation(route.traffic_status as TrafficStatus, route.water_level_cm, route.direction_meta?.trafficStatusDetail).color] += 1;
    });
    return counts;
  }, [systemData.floodRoutes]);
  const activeFloodCount = situationCounts.red + situationCounts.orange + situationCounts.amber + situationCounts.sky + situationCounts.emerald + situationCounts.slate;
  const handleStatusFilter = (color: StatusColor) => {
    setSelectedStatusFilter((current) => (current === color ? "ALL" : color));
    setSidebarTab("FLOOD");
    setIsMobileDrawerOpen(true);
  };
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [onDemandPhotos, setOnDemandPhotos] = useState<Record<string, any[]>>({});
  const dossierStatus = getTrafficPresentation(
    (selectedFlood?.traffic_status ?? "PASSABLE") as TrafficStatus,
    selectedFlood?.water_level_cm ?? 0,
    selectedFlood?.direction_meta?.trafficStatusDetail
  );
  const handleSelectFlood = (flood: FloodRoute, scrollToDetour: boolean = false) => {
    scrollToDetourOnOpenRef.current = scrollToDetour;
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
    if (flood.lat_start && flood.lon_start) setFocusCoordinates([flood.lon_start, flood.lat_start]);

    // Phase 4: On-demand load of full photo album (photos 1..4) without bloating initial page payload
    if (!onDemandPhotos[flood.id]) {
      (async () => {
        try {
          const client = createClient();
          const { data } = await client
            .from("doh_flood_routes")
            .select("direction_meta")
            .eq("id", flood.id)
            .maybeSingle();
          if (data?.direction_meta?.photos && Array.isArray(data.direction_meta.photos) && data.direction_meta.photos.length > 0) {
            const normalizedPhotos = data.direction_meta.photos.map((p: any) => ({
              ...p,
              dataUrl: normalizeMediaUrl(p?.dataUrl),
            }));
            setOnDemandPhotos((prev) => ({ ...prev, [flood.id]: normalizedPhotos }));
          }
        } catch {
          // Fallback to primary photo already available
        }
      })();
    }
  };
  const handleOpenFloodDetourSection = (flood: FloodRoute) => {
    handleSelectFlood(flood, true);
  };
  const activeDetours = (systemData.detourRoutes || []).filter((route) => route.is_active);
  const detourCountByFloodId = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active) continue;
      counts.set(flood.id, getLinkedDetoursForFlood(flood, systemData).length);
    }
    return counts;
  }, [systemData]);
  const filteredDetours = activeDetours.filter((route) => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const normalizedQuery = query.replace(/^(?:ทล|ปน)\.?\s*/i, "");
    const detourHighwayIds = highwayIdsInDetour(route, systemData);
    const linkedEventsText = getLinkedEventsForDetour(route, systemData)
      .map((ev) => `${ev.routeNo} ${ev.sectionName} ${ev.kmRangeLabel}`)
      .join(" ");
    const matchesText = `${route.route_name} ${route.description || ""} ${linkedEventsText}`.toLocaleLowerCase().includes(query) ||
      detourHighwayIds.some((id) => id.includes(normalizedQuery));
    const standaloneLocalIds = getLinkedEventsForDetour(route, systemData).length === 0
      ? [...`${route.route_name || ""} ${route.description || ""}`.matchAll(/(ปน\.(?:ถ\.)?\s*\d{1,5})/gi)].map((match) => match[1].replace(/\s+/g, ""))
      : [];
    const matchesHighway = selectedRouteFilter === "ALL" || detourHighwayIds.includes(selectedRouteFilter) || standaloneLocalIds.includes(selectedRouteFilter);
    return matchesText && matchesHighway;
  });
  const highlightFloodIds = filteredFloods.map((route) => route.id);
  const highlightDetourIds = filteredDetours.map((route) => route.id);
  const activeRouteChip = routeChips.find((chip) => chip.id === selectedRouteFilter);
  const selectedFloodDetourEntries = React.useMemo(
    () => getLinkedDetoursForFlood(selectedFlood, systemData),
    [selectedFlood, systemData]
  );
  const selectedFloodDetours = React.useMemo(
    () => selectedFloodDetourEntries.map((entry) => entry.detour),
    [selectedFloodDetourEntries]
  );
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
            className="group block min-h-12 w-full rounded-2xl border border-slate-700/90 bg-[#101d33] px-3.5 py-3 text-left text-white transition hover:border-amber-400/70 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
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
    <div className="doh-readable min-h-dvh flex flex-col bg-slate-950 text-slate-100 font-body">
      {/* =================================================================== */}
      {/* 1. TOP NAVBAR (Official DOH Brand + Status + Hotline)               */}
      {/* =================================================================== */}
      <header className="doh-header border-b-2 border-amber-500 sticky top-0 z-50 h-16 px-3 sm:px-6 flex items-center justify-between gap-2 shadow-xl bg-[#091122]">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {systemData.systemSettings?.logoUrl ? (
            <img
              src={systemData.systemSettings.logoUrl}
              alt="Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md shrink-0 bg-slate-900 border border-slate-700 p-0.5"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md shrink-0">
              <AlertTriangle className="w-5 h-5 text-slate-950 font-bold" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-heading font-black text-amber-400 text-[0.8125rem] sm:text-sm tracking-wide">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>
              <span className="hidden md:inline-block shrink-0 bg-amber-400 text-slate-950 text-[0.75rem]/[1.1rem] font-heading font-extrabold px-[0.5em] rounded">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
              <span className="text-[0.75rem]/[1.1rem] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-[0.667em] py-[0.167em] rounded font-bold hidden md:inline-flex items-center gap-[0.333em]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"></span> <span className="tracking-wide">LIVE</span>
              </span>
            </div>
            <h1 className="font-heading text-xs sm:text-sm font-semibold text-slate-300 truncate">
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
            } order-2 lg:order-1 w-full lg:w-[min(35%,25.625rem)] xl:w-[min(35%,27.5rem)] bg-[#0c1527] border-t lg:border-t-0 lg:border-r border-slate-800 flex-col shrink-0 z-20 lg:h-full overflow-hidden transition-all duration-300`}
        >
          {/* Sidebar Header & Search */}
          <div className="p-3.5 bg-[#091122] border-b border-slate-800 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse motion-reduce:animate-none" />
                <h2 className="font-heading font-bold text-xs sm:text-sm text-white">
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
            <div className="grid grid-cols-2 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-heading font-bold">
              <button
                type="button"
                aria-pressed={sidebarTab === "FLOOD"}
                onClick={() => setSidebarTab("FLOOD")}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${sidebarTab === "FLOOD"
                  ? "bg-amber-500 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
                  }`}
              >
                <span>🌊 น้ำท่วม ({filteredFloods.length})</span>
              </button>
              <button
                type="button"
                aria-pressed={sidebarTab === "DETOUR"}
                onClick={() => setSidebarTab("DETOUR")}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${sidebarTab === "DETOUR"
                  ? "bg-amber-500 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
                  }`}
              >
                <span>🔄 ทางเลี่ยง ({filteredDetours.length})</span>
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
          <div className="p-3 bg-[#091122] border-t border-slate-800 text-xs flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[0.75rem]/[1.1rem] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: 073-336-000
            </span>
            {adminUrl && <a href={adminUrl} className="text-[0.75rem]/[1.1rem] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</a>}
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="order-1 lg:order-2 relative h-[calc(100dvh-4rem)] lg:h-full flex-1 w-full overflow-hidden bg-[#0b1426]">
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
            className="h-full w-full"
          />
          {selectedRouteFilter !== "ALL" && activeRouteChip && (
            <div className="pointer-events-auto absolute right-3 top-3 z-[400] flex items-center gap-2 rounded-lg border border-amber-400/60 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-amber-100 shadow-lg">
              <span>กำลังกรอง: {activeRouteChip.label}</span>
              <button type="button" onClick={() => setSelectedRouteFilter("ALL")} className="min-h-8 rounded px-[0.667em] py-[0.333em] text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">ล้าง</button>
            </div>
          )}

          {/* =============================================================== */}
          {/* C. MOBILE FLOATING ACTION BAR & BOTTOM SHEET DRAWER             */}
          {/* =============================================================== */}
          {/* 1. Situation bar on mobile when drawer & dossier are closed */}
          {!isMobileDrawerOpen && !showDossier && (
            <div className="lg:hidden fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[450] rounded-2xl border border-amber-500/50 bg-[#091122]/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-heading text-sm font-bold text-white">จุดเฝ้าระวังน้ำท่วม {activeFloodCount} จุด</p>
                  <SituationSummary counts={situationCounts} activeFilter={selectedStatusFilter} onFilter={handleStatusFilter} />
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className="min-h-12 shrink-0 rounded-xl bg-amber-500 px-4 font-heading text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white flex items-center gap-1.5"
                >
                  <Search className="h-4 w-4" />
                  <span>ดูรายการสายทาง</span>
                </button>
              </div>
            </div>
          )}

          {/* Mobile citizen list: one sheet, three heights; never stack it behind detour details. */}
          {isMobileDrawerOpen && !viewingDetourModal && (
            <div className="lg:hidden fixed inset-0 z-[650] flex flex-col justify-end bg-slate-950/65" onClick={() => setIsMobileDrawerOpen(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label="รายการสายทางและจุดเฝ้าระวัง"
                onClick={(event) => event.stopPropagation()}
                className={`flex w-full flex-col overflow-hidden rounded-t-3xl border-t border-amber-500/60 bg-[#0c1527] text-slate-100 shadow-2xl transition-[height] duration-200 motion-reduce:transition-none ${mobileDrawerStage === "full" ? "h-[95dvh]" : mobileDrawerStage === "peek" ? "h-[14.6875rem]" : "h-[78dvh]"
                  }`}
              >
                <div className="shrink-0 border-b border-slate-800 bg-[#0c1527] px-3 pb-3 pt-2.5">
                  <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-600" aria-hidden="true" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 py-0.5">
                      <h2 className="font-heading text-lg font-bold leading-snug text-white break-words [overflow-wrap:anywhere]">สถานการณ์ทางหลวง</h2>
                      <p className="mt-0.5 text-xs text-slate-300">ข้อมูลน้ำท่วมและเส้นทางเลี่ยง</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage === "list" ? "full" : "peek")}
                        aria-label={mobileDrawerStage === "peek" ? "แสดงรายการ" : mobileDrawerStage === "list" ? "ขยายรายการเต็มจอ" : "ย่อรายการ"}
                        className="grid h-11 w-11 place-items-center rounded-xl text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        {mobileDrawerStage === "full" ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMobileDrawerOpen(false)}
                        aria-label="ปิดรายการสายทาง"
                        className="grid h-11 w-11 place-items-center rounded-xl bg-slate-800 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  {selectedStatusFilter !== "ALL" && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-950/35 px-2.5 py-1.5 text-xs">
                      <span className="text-amber-100">กำลังกรองตามสถานะที่เลือก</span>
                      <button
                        type="button"
                        onClick={() => setSelectedStatusFilter("ALL")}
                        className="min-h-8 rounded-md px-2 font-semibold text-amber-300 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                      >
                        แสดงทุกสถานะ
                      </button>
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-slate-700/80 bg-slate-900/90 p-1 text-xs font-heading font-bold" role="group" aria-label="ประเภทข้อมูล">
                    {([
                      { id: "FLOOD", label: "น้ำท่วม", count: filteredFloods.length },
                      { id: "DETOUR", label: "ทางเลี่ยง", count: filteredDetours.length },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={sidebarTab === item.id}
                        onClick={() => { setSidebarTab(item.id); setMobileDrawerStage((stage) => stage === "peek" ? "list" : stage); }}
                        className={`min-h-11 rounded-lg px-1 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${sidebarTab === item.id ? "bg-amber-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
                      >
                        {item.label} <span className="tabular-nums">({item.count})</span>
                      </button>
                    ))}
                  </div>
                  {mobileDrawerStage !== "peek" && (
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="ค้นหาสายทางหรือชื่อพื้นที่..."
                          aria-label="ค้นหาหมายเลขทางหลวงหรือพื้นที่"
                          className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-10 pr-3 text-sm text-white placeholder-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor="citizen-highway-filter" className="shrink-0 text-xs font-semibold text-slate-300">สายทาง</label>
                        <select
                          id="citizen-highway-filter"
                          value={selectedRouteFilter}
                          onChange={(event) => setSelectedRouteFilter(event.target.value)}
                          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                        >
                          {routeChips.map((chip) => <option key={chip.id} value={chip.id}>{chip.label}</option>)}
                        </select>
                        {(searchQuery || selectedRouteFilter !== "ALL") && ((sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length) > 0) && (
                          <button type="button" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">ล้างตัวกรอง</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {mobileDrawerStage !== "peek" && (
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <p className="text-xs text-slate-300" role="status">
                      พบ {sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length} รายการ
                    </p>
                    {sidebarTab === "FLOOD" && (
                      <section aria-label="รายการน้ำท่วม" className="space-y-2">
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
                      </section>
                    )}
                    {sidebarTab === "DETOUR" && detourList}
                    {((sidebarTab === "FLOOD" && filteredFloods.length === 0) || (sidebarTab === "DETOUR" && filteredDetours.length === 0)) && (
                      <div className="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">
                        <p>{sidebarTab === "DETOUR" ? "ไม่พบเส้นทางเลี่ยงที่ตรงกับคำค้นหา" : systemData.floodRoutes.length === 0 ? "ยังไม่มีรายงานจุดน้ำท่วม" : "ไม่พบจุดที่ตรงกับตัวกรอง"}</p>
                        <button type="button" className="mt-2 min-h-11 font-bold text-amber-300" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }}>ล้างตัวกรอง</button>
                      </div>
                    )}
                    {isError && <button type="button" onClick={() => void refetch()} className="min-h-11 w-full rounded-lg border border-amber-500/50 p-2 text-sm text-amber-300">โหลดข้อมูลล่าสุดไม่สำเร็จ · ลองใหม่</button>}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedFlood && showDossier && (
            <div
              className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/75 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowDossier(false);
              }}
            >
              {(() => {
                const routeLabel = /^(?:ทล|ปน)\.?\s*/i.test(selectedFlood.route_no) ? selectedFlood.route_no : `ทล.${selectedFlood.route_no}`;
                const dossierArea = formatFloodAreaLine(selectedFlood);
                const waterKnown = selectedFlood.direction_meta?.water_level_known !== false && selectedFloodMeta.waterLevelKnown !== false;
                const rawMetaPhotos = (onDemandPhotos[selectedFlood.id] || selectedFloodMeta.photos || []) as Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>;
                const dossierPhotos = rawMetaPhotos.length > 0
                  ? rawMetaPhotos.filter((p) => Boolean(p?.dataUrl))
                  : selectedFlood.latest_photo_url
                    ? [{ id: "primary", dataUrl: selectedFlood.latest_photo_url, sizeBytes: 0 }]
                    : [];
                const safePhotoIdx = dossierPhotos.length > 0 ? Math.min(activePhotoIdx, dossierPhotos.length - 1) : 0;
                const activePhoto = dossierPhotos[safePhotoIdx];
                const recordedParts = Array.isArray(selectedFloodMeta.affectedParts)
                  ? selectedFloodMeta.affectedParts
                    .filter((p) => p && p !== "UNSPECIFIED" && p !== "PENDING_VERIFICATION")
                    .map((p) => AFFECTED_ROAD_PART_LABELS[p] || String(p))
                    .filter(Boolean)
                  : [];
                const recordedLanesText =
                  (selectedFlood.affected_lanes && selectedFlood.affected_lanes.trim() !== "-" ? selectedFlood.affected_lanes.trim() : "") ||
                  (recordedParts.length > 0 ? recordedParts.join(", ") : "") ||
                  "ไม่ระบุ";

                return (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
                    className="relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700/80 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[92dvh] sm:max-w-[57.5rem] sm:rounded-3xl"
                  >
                    {/* Header: Route Badge, Section Title, KM Range, Area, Traffic Status, Close */}
                    <div className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#0c182e] px-4 py-3.5 sm:px-6 shadow-md">
                      <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className="mt-0.5 shrink-0 rounded-lg bg-[#f59e0b] px-3 py-1 font-heading text-sm font-black text-slate-950 shadow">
                              {routeLabel}
                            </span>
                            <div className="min-w-0 space-y-1">
                              <h3 className="font-heading text-base sm:text-xl font-bold leading-snug text-white break-words">
                                {selectedFlood.section_name}
                              </h3>
                              <p className="text-xs sm:text-sm text-slate-300 flex items-center gap-1.5 flex-wrap">
                                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                <span>{formatKmText(selectedFlood.km_start)} ถึง {formatKmText(selectedFlood.km_end)}</span>
                              </p>
                              {dossierArea && (
                                <p className="text-xs text-slate-300 break-words">{dossierArea}</p>
                              )}
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-heading text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                            <span aria-hidden="true">{dossierStatus.icon}</span>
                            <span>{dossierStatus.label}</span>
                          </span>
                        </div>
                        <button
                          ref={closeDetailsRef}
                          type="button"
                          onClick={() => setShowDossier(false)}
                          aria-label="ปิดรายละเอียด"
                          className="grid min-h-[2.75rem] min-w-[2.75rem] sm:min-h-10 sm:min-w-10 shrink-0 place-items-center rounded-lg bg-slate-800/90 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
                          title="ปิดหน้าต่างรายละเอียด"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* 2-Column Dark Navy Body */}
                    <div className="grid grid-cols-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:grid-cols-[1.18fr_0.82fr]">
                      {/* LEFT COLUMN: Real DB Photo Carousel + Detour Recommendations Accordion */}
                      <div className="space-y-4 min-w-0">
                        {/* Situation Photo Card */}
                        <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1930] shadow-lg">
                          {activePhoto?.dataUrl ? (
                            <>
                              <img
                                src={activePhoto.dataUrl}
                                alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                                loading="lazy"
                                decoding="async"
                                className="h-52 w-full object-cover sm:h-64"
                              />
                              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-slate-700/80 px-2.5 py-1 text-xs font-heading font-bold text-white backdrop-blur-xs">
                                <Camera aria-hidden="true" className="h-3.5 w-3.5 text-slate-200" />
                                <span>ภาพสถานการณ์</span>
                              </div>
                              {dossierPhotos.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    aria-label="ภาพก่อนหน้า"
                                    onClick={() => setActivePhotoIdx((idx) => (idx - 1 + dossierPhotos.length) % dossierPhotos.length)}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                                  >
                                    <ChevronLeft className="h-5 w-5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="ภาพถัดไป"
                                    onClick={() => setActivePhotoIdx((idx) => (idx + 1) % dossierPhotos.length)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-slate-950/75 border border-slate-600/80 text-white hover:bg-slate-900 transition cursor-pointer"
                                  >
                                    <ChevronRight className="h-5 w-5" />
                                  </button>
                                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1">
                                    {dossierPhotos.map((_, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        aria-label={`ดูภาพที่ ${idx + 1}`}
                                        onClick={() => setActivePhotoIdx(idx)}
                                        className={`h-2 w-2 rounded-full transition cursor-pointer ${idx === safePhotoIdx ? "bg-[#f59e0b]" : "bg-slate-400/60 hover:bg-slate-300"}`}
                                      />
                                    ))}
                                  </div>
                                </>
                              )}
                              <div className="absolute right-3 bottom-2.5 flex items-center gap-1.5">
                                <span className="rounded-md bg-slate-950/85 border border-slate-700/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                                  {safePhotoIdx + 1}/{dossierPhotos.length}
                                </span>
                                <button
                                  type="button"
                                  aria-label="ขยายภาพสถานการณ์เต็มจอ"
                                  onClick={() => setIsPhotoFullscreen(true)}
                                  className="grid h-7 w-7 place-items-center rounded-md bg-slate-950/85 border border-slate-700/80 text-white hover:bg-slate-800 transition cursor-pointer"
                                >
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex h-44 items-center justify-center px-4 text-center text-xs text-slate-400">
                              ยังไม่มีภาพถ่ายสถานการณ์ล่าสุด
                            </div>
                          )}
                        </div>

                        {/* Sibling Segments Comparative Switcher (when parent event has multiple stretches) */}
                        {siblingSegments.length > 1 && (
                          <div className="rounded-2xl border border-sky-600/40 bg-sky-950/35 p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-heading font-bold text-sky-200">
                                📊 ช่วงในเหตุการณ์นี้ ({siblingSegments.length} ช่วง)
                              </span>
                              <span className="text-[0.75rem]/[1.1rem] text-slate-400">แตะเพื่อสลับดูข้อมูล</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {siblingSegments.map((s) => {
                                const isCurrent = s.id === selectedFlood.id;
                                const pres = getTrafficPresentation(s.traffic_status, s.water_level_cm, s.direction_meta?.trafficStatusDetail);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedFloodId(s.id);
                                      if (s.lat_start && s.lon_start) setFocusCoordinates([s.lon_start, s.lat_start]);
                                    }}
                                    className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between gap-1 cursor-pointer ${isCurrent
                                      ? "bg-sky-900/75 border-sky-400 ring-1 ring-sky-400 text-white"
                                      : "bg-slate-900/75 border-slate-700/80 hover:bg-slate-800 text-slate-200"
                                      }`}
                                  >
                                    <div className="flex items-center justify-between gap-1.5 text-xs">
                                      <span className="font-semibold text-amber-300">กม.{s.km_start}–{s.km_end}</span>
                                      <span className="text-[0.75rem]/[1.1rem] font-mono font-bold text-white">{s.water_level_cm} ซม.</span>
                                    </div>
                                    <span className="text-[0.75rem]/[1.1rem] text-slate-300">{pres.icon} {pres.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Detour Recommendations (Exclusive Single-Open Accordion with Per-Route Independent Direction) */}
                        <div
                          id="dossier-detour-section"
                          ref={dossierDetourRef}
                          tabIndex={-1}
                          className="space-y-2.5 focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-sm sm:text-base font-heading font-bold text-white">
                            <Compass className="w-5 h-5 text-[#f59e0b] shrink-0" />
                            <span>ทางเลี่ยงแนะนำ ({selectedFloodDetours.length} สาย)</span>
                          </div>

                          {selectedFloodDetours.length > 0 && (
                            <div className="space-y-2.5">
                              {selectedFloodDetours.map((route, idx) => {
                                const linkedEntry = selectedFloodDetourEntries[idx];
                                const isExpanded = expandedDetourId === route.id;
                                const isTwoWay =
                                  isDetourDirectionAllowed(route.direction_mode, "FORWARD") &&
                                  isDetourDirectionAllowed(route.direction_mode, "REVERSE");
                                const fallbackDir: "FORWARD" | "REVERSE" =
                                  linkedEntry?.effectiveDetourDirection === "REVERSE" &&
                                    isDetourDirectionAllowed(route.direction_mode, "REVERSE")
                                    ? "REVERSE"
                                    : linkedEntry?.effectiveDetourDirection === "FORWARD" &&
                                      isDetourDirectionAllowed(route.direction_mode, "FORWARD")
                                      ? "FORWARD"
                                      : isTwoWay
                                        ? eventAdviceDirection
                                        : defaultDetourDirection(route.direction_mode);
                                const storedDir = detourDirectionById[route.id];
                                const effectiveDirection: "FORWARD" | "REVERSE" =
                                  storedDir && isDetourDirectionAllowed(route.direction_mode, storedDir)
                                    ? storedDir
                                    : fallbackDir;

                                const meters = detourDistanceMeters(route.detour_meta, effectiveDirection);
                                const durationSec = detourDurationSeconds(route.detour_meta, effectiveDirection);
                                const fwdCoords = parseRouteCoordinates(route.coordinates_json);
                                const revCoords = parseRouteCoordinates(route.reverse_coordinates_json);
                                const polyCoords =
                                  effectiveDirection === "REVERSE" && revCoords.length > 0
                                    ? revCoords
                                    : fwdCoords;
                                const polyKm = calculatePolylineRoadDistanceKm(polyCoords);
                                const ext = extractDirectionalAdvice(route.description || "");
                                const parsed = splitDetourAdviceByDirection(route.description || "", route.direction_mode);
                                const displayText =
                                  ext.hasBoth && route.direction_mode !== "FORWARD_ONLY" && route.direction_mode !== "REVERSE_ONLY"
                                    ? effectiveDirection === "FORWARD"
                                      ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                                      : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                                    : effectiveDirection === "FORWARD"
                                      ? parsed.forwardText
                                      : parsed.reverseText;
                                const timeline = getDetourTimelinePresentation(
                                  displayText || "",
                                  meters,
                                  polyKm,
                                  selectedFlood ? `${routeLabel} (${selectedFlood.section_name})` : route.route_name,
                                  "",
                                  route.detour_meta?.road_condition,
                                  durationSec
                                );
                                const shortSummary = getDetourShortSummary(displayText || route.description || "");
                                const detourNav = resolveDetourGoogleMapsNavigation(route, effectiveDirection, systemData.floodRoutes);

                                return (
                                  <div
                                    key={route.id}
                                    data-detour-card={route.id}
                                    className={`rounded-2xl border transition ${isExpanded
                                      ? "border-[#f59e0b] bg-[#0b162a] shadow-lg"
                                      : "border-slate-700/80 bg-[#0d1930]/80 hover:border-amber-400/60"
                                      } text-sm text-slate-100`}
                                  >
                                    <button
                                      type="button"
                                      aria-expanded={isExpanded}
                                      aria-controls={`dossier-detour-panel-${route.id}`}
                                      onClick={() => setExpandedDetourId((current) => (current === route.id ? null : route.id))}
                                      className="flex w-full min-h-12 cursor-pointer items-start justify-between gap-2.5 rounded-t-2xl p-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                                    >
                                      <span className="flex min-w-0 flex-1 items-start gap-2.5">
                                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black ${isExpanded ? "bg-[#f59e0b] text-slate-950" : "bg-sky-200/90 text-slate-950"
                                          }`}>
                                          {idx + 1}
                                        </span>
                                        <span className="min-w-0 flex-1 space-y-1">
                                          <span className="block font-heading text-sm font-bold text-white break-words">
                                            <span>ทางเลี่ยงที่ {idx + 1} – </span>
                                            <span>{route.route_name}</span>
                                          </span>
                                          {shortSummary && (
                                            <span className="block line-clamp-2 text-xs leading-snug text-slate-300 break-words">
                                              {shortSummary}
                                            </span>
                                          )}
                                          {!isExpanded && (
                                            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.75rem]/[1.1rem] text-slate-300">
                                              <span className="inline-flex items-center gap-1 font-medium text-amber-200">
                                                <Route aria-hidden="true" className="h-3 w-3 shrink-0" />
                                                {timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุระยะทาง"}
                                              </span>
                                              <span aria-hidden="true" className="text-slate-600">|</span>
                                              <span className="inline-flex items-center gap-1 text-slate-200">
                                                <Clock aria-hidden="true" className="h-3 w-3 shrink-0 text-sky-300" />
                                                {timeline.estimatedDurationText}
                                              </span>
                                            </span>
                                          )}
                                        </span>
                                      </span>
                                      <ChevronDown
                                        aria-hidden="true"
                                        className={`mt-1 h-5 w-5 shrink-0 transition-transform ${isExpanded ? "rotate-180 text-[#f59e0b]" : "text-slate-300"}`}
                                      />
                                    </button>

                                    {isExpanded && (
                                      <div
                                        id={`dossier-detour-panel-${route.id}`}
                                        className="space-y-3 border-t border-slate-700/70 p-3.5 pt-3"
                                      >
                                        {/* Advice Steps for this route's direction (without duplicated distance/duration lines) */}
                                        {displayText ? (
                                          <AdviceText
                                            text={displayText}
                                            hideDistanceAndDuration
                                            className="text-xs sm:text-sm text-slate-200 leading-relaxed"
                                          />
                                        ) : (
                                          <p className="text-xs text-slate-400">ยังไม่มีคำแนะนำการเดินทาง</p>
                                        )}

                                        {/* Per-Detour Direction Switch (isolated per route.id) */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-[#091325] p-2">
                                          <span className="px-1.5 text-xs font-semibold text-slate-300">ทิศทางของเส้นทางนี้</span>
                                          <DirectionSwitch
                                            size="sm"
                                            fullWidth
                                            className="flex-1 min-w-[min(100%,12.5rem)]"
                                            ariaLabel={`ทิศทางของเส้นทางนี้ ${route.route_name}`}
                                            value={effectiveDirection}
                                            onChange={(nextDir) => setDetourDirectionById((prev) => ({ ...prev, [route.id]: nextDir }))}
                                            options={[
                                              {
                                                value: "FORWARD",
                                                label: "ขาไป (A → B)",
                                                disabled: !isDetourDirectionAllowed(route.direction_mode, "FORWARD"),
                                              },
                                              {
                                                value: "REVERSE",
                                                label: "ขากลับ (B → A)",
                                                disabled: !isDetourDirectionAllowed(route.direction_mode, "REVERSE"),
                                              },
                                            ]}
                                          />
                                        </div>

                                        {/* Entrance Photo for Active Direction (Start A or End B) */}
                                        {(() => {
                                          const activePointPhoto =
                                            effectiveDirection === "REVERSE"
                                              ? route.detour_meta?.end_point_photo
                                              : route.detour_meta?.start_point_photo;
                                          if (!activePointPhoto?.url) return null;
                                          const pointLabel =
                                            effectiveDirection === "REVERSE"
                                              ? "จุดสิ้นสุด B — ภาพบริเวณทางเข้าทางเลี่ยง (ฝั่งขากลับ B → A)"
                                              : "จุดเริ่มต้น A — ภาพบริเวณทางเข้าทางเลี่ยง (ฝั่งขาไป A → B)";
                                          return (
                                            <div className="rounded-xl border border-slate-700/80 bg-[#091325] p-2.5 space-y-1.5">
                                              <div className="flex items-center gap-1.5 text-xs font-heading font-bold text-amber-300">
                                                <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                                                <span>{pointLabel}</span>
                                              </div>
                                              <img
                                                src={normalizeMediaUrl(activePointPhoto.url)}
                                                alt={activePointPhoto.caption || pointLabel}
                                                className="w-full h-36 rounded-lg object-cover border border-slate-800"
                                              />
                                              {activePointPhoto.caption && (
                                                <p className="text-xs text-slate-300 leading-snug">{activePointPhoto.caption}</p>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        {/* Distance & Duration Metrics Grid (Line Length + Admin Duration) */}
                                        <div className="grid grid-cols-2 gap-2.5">
                                          <div className="rounded-xl border border-slate-700/80 bg-[#0d1930] px-3 py-2 flex items-center gap-2.5">
                                            <Route aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-300" />
                                            <div className="min-w-0">
                                              <div className="text-[0.75rem]/[1.1rem] text-slate-400">ระยะทางรวม</div>
                                              <div className="font-heading text-sm font-bold text-white">
                                                {timeline.totalDistanceKm > 0 ? `${timeline.totalDistanceFormatted} กม.` : "ไม่ระบุ"}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="rounded-xl border border-slate-700/80 bg-[#0d1930] px-3 py-2 flex items-center gap-2.5">
                                            <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-300" />
                                            <div className="min-w-0">
                                              <div className="text-[0.75rem]/[1.1rem] text-slate-400">เวลาโดยประมาณ</div>
                                              <div className="font-heading text-xs sm:text-sm font-bold text-white break-words">
                                                {timeline.estimatedDurationText}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Per-Detour Navigation & Focus Actions (Always visible directly on list item) */}
                                    <div className="grid grid-cols-2 gap-2 border-t border-slate-700/60 px-3.5 py-2.5">
                                      {detourNav && detourNav.isValid && detourNav.url ? (
                                        <a
                                          href={detourNav.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          aria-label="ดูบน Google Maps"
                                          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f59e0b] hover:bg-[#d97706] px-2.5 py-2 font-heading text-xs sm:text-sm font-black text-slate-950 shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                                        >
                                          <Navigation aria-hidden="true" className="h-4 w-4 shrink-0" />
                                          <span>ดูบน Google Maps</span>
                                        </a>
                                      ) : (
                                        <span
                                          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-[0.833em] py-[0.667em] font-heading text-[0.75rem]/[1.1rem] text-slate-300 text-center leading-tight"
                                          title={detourNav?.warning || "ยังไม่ยืนยันนำทางอัตโนมัติ"}
                                        >
                                          <Navigation aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
                                          <span>ยังไม่ยืนยันนำทางอัตโนมัติ</span>
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (Number.isFinite(route.lon_start) && Number.isFinite(route.lat_start)) {
                                            setFocusCoordinates([route.lon_start, route.lat_start]);
                                          } else if (Array.isArray(polyCoords) && polyCoords.length > 0 && Array.isArray(polyCoords[0])) {
                                            const mid = polyCoords[Math.floor(polyCoords.length / 2)];
                                            const a = Number(mid[0]);
                                            const b = Number(mid[1]);
                                            if (Number.isFinite(a) && Number.isFinite(b)) {
                                              setFocusCoordinates(Math.abs(a) <= 90 && Math.abs(b) > 90 ? [b, a] : [a, b]);
                                            }
                                          }
                                          setShowDossier(false);
                                        }}
                                        className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-2.5 py-2 font-heading text-xs sm:text-sm font-bold text-white leading-tight text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                                      >
                                        <MapPinned aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-300" />
                                        <span>ดูตำแหน่งบนแผนที่</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {selectedFloodDetours.length === 0 && !selectedFlood.detour_advice && (
                            <p className="rounded-xl border border-slate-700/80 bg-[#0d1930] p-3 text-xs text-slate-300">
                              ยังไม่มีทางเลี่ยงที่ยืนยันและผูกกับจุดน้ำท่วมนี้ โปรดโทร 1586 ก่อนเดินทาง
                            </p>
                          )}

                          {selectedFlood.detour_advice && (
                            <div className="space-y-2 rounded-xl border border-amber-400/30 bg-[#0d1930] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-heading font-bold text-amber-300">คำแนะนำเพิ่มเติมจากเหตุการณ์</span>
                                {directionalAdvice.hasBoth && (
                                  <DirectionSwitch
                                    size="sm"
                                    ariaLabel="ทิศทางคำแนะนำเพิ่มเติมจากเหตุการณ์"
                                    value={eventAdviceDirection}
                                    onChange={setEventAdviceDirection}
                                    options={[
                                      { value: "FORWARD", label: "ขาไป (A → B)" },
                                      { value: "REVERSE", label: "ขากลับ (B → A)" },
                                    ]}
                                  />
                                )}
                              </div>
                              {(() => {
                                const ext = directionalAdvice;
                                const displayText = ext.hasBoth
                                  ? eventAdviceDirection === "FORWARD"
                                    ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                                    : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                                  : selectedFlood.detour_advice;
                                return (
                                  <div className="font-sans text-xs text-slate-200 sm:max-h-48 sm:overflow-y-auto">
                                    <AdviceText text={displayText} />
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* RIGHT COLUMN: Current Water Level, Affected Lanes (Exact DB), Updated At, Pinned Incident Mini-Map */}
                      <div className="space-y-3 min-w-0">
                        <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] divide-y divide-slate-700/75 shadow-lg">
                          {/* Water Level */}
                          <div className="p-3.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-slate-300">
                                <Droplets aria-hidden="true" className="h-4 w-4 text-sky-300" />
                                <span>ระดับน้ำปัจจุบัน</span>
                              </span>
                              <span className={`px-[0.667em] py-[0.167em] rounded-md text-[0.75rem]/[1.1rem] font-heading font-bold ${selectedFlood.trend === "RISING"
                                ? "bg-rose-950/90 text-rose-300 border border-rose-700/80"
                                : selectedFlood.trend === "FALLING"
                                  ? "bg-emerald-950/90 text-emerald-300 border border-emerald-700/80"
                                  : "bg-amber-950/80 text-amber-300 border border-amber-600/60"
                                }`}>
                                แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : "ทรงตัว"}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-4xl font-black tracking-tight text-red-500">
                                {waterKnown ? selectedFlood.water_level_cm : "รอตรวจสอบ"}
                              </span>
                              {waterKnown && <span className="text-sm font-bold text-slate-200">ซม.</span>}
                            </div>
                          </div>

                          {/* Affected Lanes (Verbatim from DB without inventing suffix) */}
                          <div className="p-3.5 flex items-start gap-2.5">
                            <Milestone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs text-slate-400">ส่วนถนนที่ได้รับผลกระทบ</div>
                              <div className="font-heading text-sm font-bold text-amber-300 break-words">
                                {recordedLanesText}
                              </div>
                            </div>
                          </div>

                          {/* Latest Updated Timestamp */}
                          <div className="p-3.5 flex items-start gap-2.5">
                            <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs text-slate-400">อัปเดตล่าสุด:</div>
                              <div className="font-mono text-xs sm:text-sm font-semibold text-white">
                                {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ไม่ระบุ"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pinned Incident Location Mini-Map (Never follows detour direction toggles) */}
                        <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] p-3.5 space-y-2.5 shadow-lg">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-heading font-bold text-white">
                            <MapPinned aria-hidden="true" className="h-4 w-4 text-sky-300 shrink-0" />
                            <span>ตำแหน่งบนแผนที่</span>
                          </div>
                          <FloodEventMiniMap flood={selectedFlood} />
                          <button
                            type="button"
                            onClick={() => {
                              if (Number.isFinite(selectedFlood.lon_start) && Number.isFinite(selectedFlood.lat_start)) {
                                setFocusCoordinates([selectedFlood.lon_start, selectedFlood.lat_start]);
                              }
                              setShowDossier(false);
                            }}
                            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-600/80 bg-[#13203c] hover:bg-[#1a2b50] px-3 py-2 font-heading text-xs font-bold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                          >
                            <MapPin aria-hidden="true" className="h-4 w-4 text-sky-300" />
                            <span>ดูตำแหน่งบนแผนที่</span>
                          </button>
                        </div>
                      </div>

                      {/* FULL-WIDTH BOTTOM COLLAPSIBLE HISTORY BUTTON & CHART */}
                      <div className="md:col-span-2 pt-1">
                        <div className="rounded-2xl border border-slate-700/80 bg-[#0d1930] overflow-hidden">
                          <button
                            type="button"
                            aria-expanded={isHistoryExpanded}
                            aria-controls="dossier-water-history-panel"
                            onClick={() => setIsHistoryExpanded((prev) => !prev)}
                            className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left font-heading text-sm font-bold text-white transition hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                          >
                            <span className="mx-auto flex items-center gap-2">
                              <TrendingUp aria-hidden="true" className="h-4 w-4 text-sky-300" />
                              <span>ดูประวัติระดับน้ำท่วม</span>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${isHistoryExpanded ? "rotate-90" : ""}`}
                            />
                          </button>

                          {isHistoryExpanded && (
                            <div
                              id="dossier-water-history-panel"
                              className="space-y-3 border-t border-slate-700/75 bg-slate-950/75 p-4"
                            >
                              <div className="h-44 w-full rounded-xl border border-slate-800 bg-slate-950/90 p-2.5">
                                <WaterTimelineChart
                                  timelineUpdates={systemData.timelineUpdates}
                                  floodId={selectedFlood.id}
                                />
                              </div>

                              {selectedFloodRecentUpdates.length > 0 ? (
                                <div className="space-y-1.5">
                                  {selectedFloodRecentUpdates.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs"
                                    >
                                      <span className="mr-2 truncate text-slate-300">
                                        <strong className="font-mono text-amber-400">
                                          {new Date(item.reported_at).toLocaleString("th-TH", {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          })} น.
                                        </strong>{" "}
                                        {item.remark}
                                      </span>
                                      <strong className="shrink-0 font-mono font-bold text-red-400">
                                        {item.water_level_cm} ซม.
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-center text-xs text-slate-400">
                                  ยังไม่มีข้อมูลประวัติระดับน้ำในระบบ
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Fullscreen Photo Preview Overlay */}
              {isPhotoFullscreen && (() => {
                const rawMetaPhotos = (onDemandPhotos[selectedFlood.id] || selectedFloodMeta.photos || []) as Array<{ dataUrl?: string }>;
                const dossierPhotos = rawMetaPhotos.length > 0
                  ? rawMetaPhotos.filter((p) => Boolean(p?.dataUrl))
                  : selectedFlood.latest_photo_url
                    ? [{ dataUrl: selectedFlood.latest_photo_url }]
                    : [];
                const active = dossierPhotos[Math.min(activePhotoIdx, Math.max(0, dossierPhotos.length - 1))];
                if (!active?.dataUrl) return null;
                return (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="ภาพถ่ายสถานการณ์ขนาดเต็ม"
                    className="fixed inset-0 z-[800] flex items-center justify-center bg-slate-950/90 p-4"
                    onClick={() => setIsPhotoFullscreen(false)}
                  >
                    <button
                      type="button"
                      aria-label="ปิดภาพขนาดเต็ม"
                      onClick={() => setIsPhotoFullscreen(false)}
                      className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white hover:bg-slate-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <img
                      src={active.dataUrl}
                      alt={`ภาพสถานการณ์ขนาดเต็ม ${selectedFlood.section_name}`}
                      className="max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                );
              })()}
            </div>
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
              onFocusMapLocation={(coords) => {
                if (coords) setFocusCoordinates(coords);
                setViewingDetourModal(null);
                setReturnToDetourList(false);
                setIsMobileDrawerOpen(false);
              }}
            />
          )}
        </div>
      </div>


      {/* Toast Notification */}
      {(toastMessage || isError) && (
        <div role="status" aria-live="polite" className="fixed bottom-28 left-3 right-3 z-[9999] lg:bottom-4 lg:left-auto lg:right-4 bg-slate-950 border-2 border-amber-400 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-heading flex items-center gap-2.5 max-w-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{toastMessage || "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง"}</span>
        </div>
      )}
    </div>
  );
}
