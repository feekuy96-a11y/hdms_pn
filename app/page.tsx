"use client";

import React, { useEffect, useRef, useState } from "react";
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
import {
  AlertTriangle,
  Settings,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Navigation,
  Compass,
  Phone,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
  ArrowLeftRight,
  Droplets,
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
} from "lucide-react";
import { extractDirectionalAdvice, splitDetourAdviceByDirection } from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  defaultDetourDirection,
  detourDirectionBadge,
  detourDirectionDetailedBadge,
  detourDistanceMeters,
  getDetourTimelinePresentation,
  isDetourDirectionAllowed,
  isRecordedDetourDirection,
  parseDetourAdvice,
} from "@/lib/detour-presentation";
import { parseFloodDirectionMeta, resolveEffectiveRoadSide, AFFECTED_ROAD_PART_LABELS } from "@/lib/flood-event-schema";
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";

type TrafficStatus = "CLOSED" | "WARNING" | "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE" | "PENDING_VERIFICATION";

function getTrafficPresentation(status: string, waterLevelCm: number, detailStatus?: string) {
  if (detailStatus === "PENDING_VERIFICATION" || status === "PENDING_VERIFICATION") {
    return { label: "รอตรวจสอบสถานะ", detail: "อยู่ระหว่างตรวจสอบสถานการณ์หน้างาน", icon: "⏳", color: "slate" as const };
  }
  if (detailStatus === "NO_SMALL_VEHICLES") {
    return { label: "รถเล็กไม่สามารถผ่านได้", detail: `ระดับน้ำ ${waterLevelCm} ซม. รถเล็กผ่านไม่ได้`, icon: "🚗", color: "orange" as const };
  }
  switch (status) {
    case "CLOSED":
      return { label: "ผ่านไม่ได้", detail: "รถทุกชนิดผ่านไม่ได้", icon: "⛔", color: "red" as const };
    case "LIGHT_VEHICLES_ONLY":
      return { label: "รถเล็กผ่านได้", detail: "อนุญาตเฉพาะรถขนาดเล็ก", icon: "🚗", color: "sky" as const };
    case "ONE_LANE":
      return { label: "รถเล็กผ่านได้ ๑ ช่องทาง", detail: "เปิดการจราจรหนึ่งช่องทาง", icon: "↔️", color: "amber" as const };
    case "WARNING":
      return { label: "รถเล็กผ่านไม่ได้", detail: `ระดับน้ำ ${waterLevelCm} ซม.`, icon: "⚠️", color: "amber" as const };
    case "PASSABLE":
      return { label: "ผ่านได้ปกติ", detail: "การจราจรผ่านได้ตามปกติ", icon: "✅", color: "emerald" as const };
    default:
      // External imports and older records can contain an unsupported value.
      // It must never be presented as safe traffic until an officer verifies it.
      return { label: "รอตรวจสอบสถานะ", detail: "ไม่พบสถานะการจราจรที่ยืนยันได้", icon: "⏳", color: "slate" as const };
  }
}

type StatusColor = "red" | "orange" | "amber" | "sky" | "emerald" | "slate";

// Most severe first, so the points citizens must avoid are always at the top of the list.
const STATUS_ORDER: Record<StatusColor, number> = { red: 0, orange: 1, amber: 2, sky: 3, emerald: 4, slate: 5 };
const STATUS_BAR: Record<StatusColor, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  sky: "#38bdf8",
  emerald: "#10b981",
  slate: "#64748b",
};
const STATUS_CHIP: Record<StatusColor, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/50",
  orange: "bg-orange-500/15 text-orange-200 border-orange-500/50",
  amber: "bg-amber-500/15 text-amber-200 border-amber-500/50",
  sky: "bg-sky-500/15 text-sky-200 border-sky-500/50",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-500/50",
  slate: "bg-slate-500/15 text-slate-300 border-slate-500/50",
};
const SUMMARY_ITEMS: ReadonlyArray<{ color: StatusColor; label: string; dot: string }> = [
  { color: "red", label: "ผ่านไม่ได้", dot: "bg-red-500" },
  { color: "orange", label: "รถเล็กไม่สามารถผ่านได้", dot: "bg-orange-500" },
  { color: "amber", label: "เฝ้าระวัง / ระมัดระวัง", dot: "bg-amber-500" },
  { color: "sky", label: "รถเล็กผ่านได้", dot: "bg-sky-400" },
  { color: "emerald", label: "ผ่านได้ปกติ", dot: "bg-emerald-500" },
  { color: "slate", label: "รอตรวจสอบ", dot: "bg-slate-400" },
];

function SituationSummary({ counts }: { counts: Record<StatusColor, number> }) {
  const visible = SUMMARY_ITEMS.filter((item) => counts[item.color] > 0);
  if (visible.length === 0) return <p className="text-xs text-slate-300">ยังไม่มีจุดเฝ้าระวังที่รายงานในขณะนี้</p>;
  return (
    <ul aria-label="สรุปสถานการณ์ทุกจุด" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-200">
      {visible.map((item) => (
        <li key={item.color} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
          <strong className="font-mono text-sm text-white">{counts[item.color]}</strong> {item.label}
        </li>
      ))}
    </ul>
  );
}

// Direction badge / advice parsing / distance live in lib/detour-presentation.ts and are shared
// with the map popup. Unknown legacy direction must never be shown as a confirmed two-way detour.

function highwayIdsInDetour(route: DetourRoute, floods: FloodRoute[]): string[] {
  const ids = new Set<string>();
  const matchingFlood = floods.find((flood) => flood.id === route.flood_id_ref);
  if (matchingFlood?.route_no) ids.add(matchingFlood.route_no.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim());
  const names = `${route.route_name || ""} ${route.description || ""}`;
  for (const match of names.matchAll(/(?:ทล|ปน)\.?\s*(\d{1,5})/gi)) ids.add(match[1]);
  return [...ids];
}

// One card for the desktop sidebar and the mobile sheet (they used to be two diverging copies).
function FloodCard({ flood, selected, onSelect }: { flood: FloodRoute; selected: boolean; onSelect: (flood: FloodRoute) => void }) {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const status = getTrafficPresentation(flood.traffic_status as TrafficStatus, flood.water_level_cm, meta.trafficStatusDetail);
  const direction = meta.directionCode === "A_TO_B" ? "A → B" : meta.directionCode === "B_TO_A" ? "B → A" : meta.directionCode === "BOTH" ? "A ⇄ B" : "ไม่ระบุทิศทาง";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(flood)}
      className={`relative block min-h-12 w-full overflow-hidden rounded-2xl border bg-[#101d33] px-3.5 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${selected ? "border-amber-400 ring-1 ring-amber-400/50" : "border-slate-700/90 hover:border-amber-400/70"}`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: STATUS_BAR[status.color] }} />
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-amber-400 px-2 py-1 font-heading text-xs font-black text-slate-950">ทล.{flood.route_no}</span>
          <span className="text-xs text-slate-300">กม.{flood.km_start} – {flood.km_end}</span>
        </span>
        <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_CHIP[status.color]}`}>
          {status.icon} {status.label}
        </span>
      </span>
      <span className="mt-2 block break-words font-heading text-sm font-bold leading-snug text-white">{flood.section_name}</span>
      <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Droplets aria-hidden="true" className="h-4 w-4 text-sky-300" /> ระดับน้ำ
          <strong className="text-sm text-white">{flood.water_level_cm} ซม.</strong>
          <span className="rounded bg-sky-950/70 px-1.5 py-1 text-[11px] text-sky-200">{direction}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-amber-300">รายละเอียด <ChevronRight aria-hidden="true" className="h-4 w-4" /></span>
      </span>
    </button>
  );
}

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
  const [selectedFloodId, setSelectedFloodId] = useState<string>("");
  const [showDossier, setShowDossier] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRouteFilter, setSelectedRouteFilter] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [citizenDetourDirection, setCitizenDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [sidebarTab, setSidebarTab] = useState<"ALL" | "FLOOD" | "DETOUR">("ALL");
  const [viewingDetourModal, setViewingDetourModal] = useState<DetourRoute | null>(null);
  const [modalDetourDirection, setModalDetourDirection] = useState<"FORWARD" | "REVERSE">("FORWARD");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [mobileDrawerStage, setMobileDrawerStage] = useState<"peek" | "list" | "full">("list");
  const [returnToDetourList, setReturnToDetourList] = useState(false);
  const [isSummaryCardVisible, setIsSummaryCardVisible] = useState<boolean>(true);

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
    closeDetailsRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDossier(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [showDossier]);

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

  // Auto-synchronize citizen detour direction to match the flood direction when selecting a flood segment
  useEffect(() => {
    if (!selectedFlood) return;
    const meta = parseFloodDirectionMeta(selectedFlood.direction_meta, selectedFlood);
    if (meta.directionCode === "B_TO_A") {
      setCitizenDetourDirection("REVERSE");
    } else if (meta.directionCode === "A_TO_B") {
      setCitizenDetourDirection("FORWARD");
    }
  }, [selectedFlood]);

  // One highway filter for floods and detours. Keep standalone detours visible with "ทั้งหมด".
  const routeChips = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active || !flood.route_no) continue;
      const number = flood.route_no.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim();
      if (number) labels.set(number, /^(?:ปน)\.?/i.test(flood.route_no) ? `ปน.${number}` : `ทล.${number}`);
    }
    for (const detour of systemData.detourRoutes || []) {
      if (!detour.is_active) continue;
      for (const match of `${detour.route_name || ""} ${detour.description || ""}`.matchAll(/(ทล|ปน)\.?\s*(\d{1,5})/gi)) {
        if (!labels.has(match[2])) labels.set(match[2], `${match[1]}.${match[2]}`);
      }
    }
    const sorted = [...labels.keys()].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    return [{ id: "ALL", label: "ทุกสายทาง" }, ...sorted.map((id) => ({ id, label: labels.get(id) || id }))];
  }, [systemData.floodRoutes, systemData.detourRoutes]);

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

    return matchSearch && matchChip;
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
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [onDemandPhotos, setOnDemandPhotos] = useState<Record<string, any[]>>({});
  const dossierStatus = getTrafficPresentation(
    (selectedFlood?.traffic_status ?? "PASSABLE") as TrafficStatus,
    selectedFlood?.water_level_cm ?? 0,
    selectedFlood?.direction_meta?.trafficStatusDetail
  );
  const handleSelectFlood = (flood: FloodRoute) => {
    setSelectedFloodId(flood.id);
    const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
    if (meta.directionCode === "B_TO_A") {
      setCitizenDetourDirection("REVERSE");
    } else if (meta.directionCode === "A_TO_B") {
      setCitizenDetourDirection("FORWARD");
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
            setOnDemandPhotos((prev) => ({ ...prev, [flood.id]: data.direction_meta.photos }));
          }
        } catch {
          // Fallback to primary photo already available
        }
      })();
    }
  };
  const activeDetours = (systemData.detourRoutes || []).filter((route) => route.is_active);
  const filteredDetours = activeDetours.filter((route) => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const normalizedQuery = query.replace(/^(?:ทล|ปน)\.?\s*/i, "");
    const matchesText = `${route.route_name} ${route.description || ""}`.toLocaleLowerCase().includes(query) ||
      highwayIdsInDetour(route, systemData.floodRoutes || []).some((id) => id.includes(normalizedQuery));
    const matchesHighway = selectedRouteFilter === "ALL" || highwayIdsInDetour(route, systemData.floodRoutes || []).includes(selectedRouteFilter);
    return matchesText && matchesHighway;
  });
  const selectedFloodDetours = selectedFlood
    ? activeDetours.filter(
      (route) =>
        route.flood_id_ref === selectedFlood.id ||
        (route.detour_meta?.eventId &&
          selectedFloodMeta?.eventId &&
          route.detour_meta.eventId === selectedFloodMeta.eventId)
    )
    : [];
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
      {sidebarTab === "ALL" && (
        <h3 className="px-1 text-xs font-heading font-bold text-amber-300">ทางเลี่ยง ({filteredDetours.length} เส้นทาง)</h3>
      )}
      {filteredDetours.map((route) => {
        const linkedFlood = route.flood_id_ref
          ? systemData.floodRoutes.find((f) => f.id === route.flood_id_ref)
          : null;
        return (
          <button
            key={route.id}
            type="button"
            className="group block min-h-12 w-full rounded-2xl border border-slate-700/90 bg-[#101d33] px-3.5 py-3 text-left text-white transition hover:border-amber-400/70 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            onClick={() => {
              setReturnToDetourList(isMobileDrawerOpen);
              setIsMobileDrawerOpen(false);
              setViewingDetourModal(route);
              const linkedMeta = linkedFlood ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood) : null;
              setModalDetourDirection(linkedMeta?.directionCode === "B_TO_A" || route.direction_mode === "REVERSE_ONLY" ? "REVERSE" : "FORWARD");
            }}
          >
            <span className="flex min-w-0 items-start justify-between gap-2">
              <strong className="min-w-0 flex-1 font-heading text-sm leading-snug font-bold break-words [overflow-wrap:anywhere] group-hover:text-amber-200">
                {route.route_name}
              </strong>
              <span className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                {detourDirectionBadge(route.direction_mode)}
              </span>
            </span>
            <span className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 text-slate-300 break-words">
                {linkedFlood ? `เลี่ยงจุดน้ำท่วม ทล.${linkedFlood.route_no}` : "ทางเลี่ยงอิสระ"}
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
    <div className="doh-readable min-h-screen flex flex-col bg-slate-950 text-slate-100 font-body">
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
              <span className="truncate font-heading font-black text-amber-400 text-[13px] sm:text-sm tracking-wide">
                {systemData.systemSettings?.name || "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย"}
              </span>
              <span className="hidden md:inline-block shrink-0 bg-amber-400 text-slate-950 text-[10px] font-heading font-extrabold px-1.5 py-0.2 rounded">
                ศูนย์ปฏิบัติการฉุกเฉิน 24 ชม.
              </span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold hidden md:inline-flex items-center gap-1">
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
      <div className="flex flex-col lg:flex-row relative lg:overflow-hidden" style={{ height: "calc(100dvh - 64px)", minHeight: 450 }}>
        {/* ================================================================= */}
        {/* A. LEFT SIDEBAR: ROUTE LIST (DESKTOP COLLAPSIBLE)                 */}
        {/* ================================================================= */}
        <div
          className={`${isSidebarCollapsed ? "hidden" : "hidden lg:flex"
            } order-2 lg:order-1 w-full lg:w-[410px] xl:w-[440px] bg-[#0c1527] border-t lg:border-t-0 lg:border-r border-slate-800 flex-col shrink-0 z-20 lg:h-full overflow-hidden transition-all duration-300`}
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

            <SituationSummary counts={situationCounts} />

            {/* View Switcher Sub-tabs: All / Floods / Detours */}
            <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-heading font-bold">
              <button
                type="button"
                onClick={() => setSidebarTab("ALL")}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${sidebarTab === "ALL"
                    ? "bg-amber-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>ทั้งหมด ({filteredFloods.length + filteredDetours.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("FLOOD")}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${sidebarTab === "FLOOD"
                    ? "bg-amber-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>🌊 น้ำท่วม ({filteredFloods.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("DETOUR")}
                className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${sidebarTab === "DETOUR"
                    ? "bg-amber-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>🔄 ทางเลี่ยง ({filteredDetours.length})</span>
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative">
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

            {/* Route Quick Filter Chips (Shown when viewing floods) */}
            {sidebarTab !== "DETOUR" && routeChips.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
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
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Incident & Detour Cards Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {(sidebarTab === "ALL" || sidebarTab === "DETOUR") && detourList}
            {(sidebarTab === "ALL" || sidebarTab === "FLOOD") && (
              <>
                {filteredFloods.map((flood) => (
                  <FloodCard key={flood.id} flood={flood} selected={flood.id === selectedFloodId} onSelect={handleSelectFlood} />
                ))}
              </>
            )}
            {sidebarTab === "DETOUR" && filteredDetours.length === 0 && (
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-6 text-center text-sm space-y-2.5">
                <h4 className="font-heading font-bold text-white text-xs">ไม่พบเส้นทางเลี่ยงที่ค้นหา</h4>
                <p className="text-xs text-slate-400 leading-relaxed">ขณะนี้ยังไม่มีเส้นทางเลี่ยงที่ตรงกับคำค้นหาของคุณ</p>
              </div>
            )}
            {(sidebarTab === "ALL" || sidebarTab === "FLOOD") && filteredFloods.length === 0 && (
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
          </div>

          {/* Sidebar Bottom Footer: Call Contact */}
          <div className="p-3 bg-[#091122] border-t border-slate-800 text-xs flex items-center justify-between text-slate-400 shrink-0">
            <span className="text-[11px] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-400" /> ติดต่อศูนย์ความปลอดภัย: 073-336-000
            </span>
            {adminUrl && <a href={adminUrl} className="text-[11px] text-amber-400 underline underline-offset-2">สำหรับเจ้าหน้าที่</a>}
          </div>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN GIS MAP VIEWPORT                                          */}
        {/* ================================================================= */}
        <div className="order-1 lg:order-2 relative h-[calc(100dvh-64px)] lg:h-full flex-1 w-full overflow-hidden bg-[#0b1426]">
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
            selectedFloodId={selectedFloodId}
            onSelectFlood={(id) => {
              setSelectedFloodId(id);
              setShowDossier(true);
              setIsMobileDrawerOpen(false);
              const flood = systemData.floodRoutes.find((r) => r.id === id);
              if (flood && flood.lat_start && flood.lon_start) {
                setFocusCoordinates([flood.lon_start, flood.lat_start]);
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

          {/* =============================================================== */}
          {/* C. MOBILE FLOATING ACTION BAR & BOTTOM SHEET DRAWER             */}
          {/* =============================================================== */}
          {/* 1. Situation bar on mobile when drawer & dossier are closed */}
          {!isMobileDrawerOpen && !showDossier && (
            <div className="lg:hidden fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[450] rounded-2xl border border-amber-500/50 bg-[#091122]/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-heading text-sm font-bold text-white">จุดเฝ้าระวังน้ำท่วม {activeFloodCount} จุด</p>
                  <SituationSummary counts={situationCounts} />
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
                className={`flex w-full flex-col overflow-hidden rounded-t-3xl border-t border-amber-500/60 bg-[#0c1527] text-slate-100 shadow-2xl transition-[height] duration-200 motion-reduce:transition-none ${mobileDrawerStage === "full" ? "h-[95dvh]" : mobileDrawerStage === "peek" ? "h-[235px]" : "h-[78dvh]"
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
                  <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-700/80 bg-slate-900/90 p-1 text-xs font-heading font-bold" role="group" aria-label="ประเภทข้อมูล">
                    {([
                      { id: "ALL", label: "ทั้งหมด", count: filteredFloods.length + filteredDetours.length },
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
                        {(searchQuery || selectedRouteFilter !== "ALL") && (filteredFloods.length + filteredDetours.length > 0) && (
                          <button type="button" onClick={() => { setSearchQuery(""); setSelectedRouteFilter("ALL"); }} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">ล้างตัวกรอง</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {mobileDrawerStage !== "peek" && (
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <p className="text-xs text-slate-300" role="status">
                      พบ {sidebarTab === "ALL" ? filteredFloods.length + filteredDetours.length : sidebarTab === "FLOOD" ? filteredFloods.length : filteredDetours.length} รายการ
                    </p>
                    {(sidebarTab === "ALL" || sidebarTab === "FLOOD") && (
                      <section aria-label="รายการน้ำท่วม" className="space-y-2">
                        {sidebarTab === "ALL" && filteredFloods.length > 0 && <h3 className="px-1 text-xs font-heading font-bold text-amber-300">น้ำท่วม ({filteredFloods.length} จุด)</h3>}
                        {filteredFloods.map((flood) => <FloodCard key={flood.id} flood={flood} selected={flood.id === selectedFloodId} onSelect={handleSelectFlood} />)}
                      </section>
                    )}
                    {(sidebarTab === "ALL" || sidebarTab === "DETOUR") && detourList}
                    {((sidebarTab === "FLOOD" && filteredFloods.length === 0) || (sidebarTab === "DETOUR" && filteredDetours.length === 0) || (sidebarTab === "ALL" && filteredDetours.length + filteredFloods.length === 0)) && (
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

          {/* =============================================================== */}
          {/* D. FLOATING DETAIL DOSSIER CARD (COLLAPSIBLE / DISMISSIBLE)     */}
          {/* =============================================================== */}
          {selectedFlood && !showDossier && isSummaryCardVisible && (
            <div className="hidden lg:block absolute bottom-3 left-3 right-3 z-[500] rounded-2xl bg-[#0c162c]/95 border border-slate-700/80 p-3.5 shadow-2xl lg:right-auto lg:w-[430px] backdrop-blur-md animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-black px-1.5 py-0.2 rounded">
                      ทล.{selectedFlood.route_no}
                    </span>
                    <span className="text-xs text-amber-300 font-medium">
                      กม.{selectedFlood.km_start}–{selectedFlood.km_end}
                    </span>
                  </div>
                  <h2 className="font-heading text-sm font-bold text-white truncate">
                    {dossierStatus.icon} {dossierStatus.label}{" "}
                    · {selectedFlood.section_name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSummaryCardVisible(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  title="ย่อแถบรายงานข้อมูล"
                  aria-label="ย่อแถบรายงานข้อมูล"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                <span className="text-xs text-slate-300">
                  ระดับน้ำ{" "}
                  <strong className="text-red-400 font-mono font-bold">
                    {selectedFlood.water_level_cm} ซม.
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setShowDossier(true)}
                  className="min-h-9 shrink-0 rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950 transition shadow"
                >
                  ดูรายละเอียด & ไทม์ไลน์
                </button>
              </div>
            </div>
          )}

          {/* Floating Pill to Restore Summary Card if Dismissed */}
          {selectedFlood && !showDossier && !isSummaryCardVisible && (
            <button
              type="button"
              onClick={() => setIsSummaryCardVisible(true)}
              className="hidden lg:flex absolute bottom-3 left-3 z-[500] bg-[#0c162c]/95 hover:bg-[#0f1d3a] text-amber-300 border border-amber-400/50 px-3 py-2 rounded-xl shadow-xl items-center gap-2 text-xs font-heading font-bold transition backdrop-blur-md"
              title="เปิดแถบรายงานข้อมูล"
            >
              <span>📊 แสดงแถบรายงานข้อมูล ทล.{selectedFlood.route_no}</span>
            </button>
          )}
          {selectedFlood && showDossier && (
            <div
              className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/65 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowDossier(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`รายละเอียดจุดน้ำท่วม ${selectedFlood.section_name}`}
                className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-700/80 bg-[#0c162c] text-slate-100 shadow-2xl sm:max-h-[90vh] sm:max-w-[560px] sm:rounded-3xl"
              >
                {/* Header: what is it, how bad is it, when was it updated */}
                <div className="sticky top-0 z-20 border-b border-slate-800 bg-[#0c1a30] px-4 pb-3 pt-2 shadow-md">
                  <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="shrink-0 rounded-md bg-[#f59e0b] px-2.5 py-1 font-heading text-xs font-black text-slate-950 shadow">
                          ทล.{selectedFlood.route_no}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 font-heading text-xs font-bold ${STATUS_CHIP[dossierStatus.color]}`}>
                          {dossierStatus.icon} {dossierStatus.label}
                        </span>
                        {selectedFloodMeta.directionCode && (
                          <span className="rounded bg-sky-950/90 border border-sky-700/80 px-2 py-0.5 text-sky-200 text-xs font-semibold">
                            {selectedFloodMeta.directionCode === "A_TO_B"
                              ? "ตามหลัก กม. (ขาไป A → B)"
                              : selectedFloodMeta.directionCode === "B_TO_A"
                                ? "ย้อนหลัก กม. (ขากลับ B → A)"
                                : selectedFloodMeta.directionCode === "BOTH"
                                  ? "ไป-กลับ ๒ ทิศทาง (A ⇄ B)" : "ไม่ระบุทิศทาง (รอตรวจสอบ)"}
                          </span>
                        )}
                      </div>
                      <h3 className="font-heading text-base font-bold leading-snug text-white">{selectedFlood.section_name}</h3>
                      <p className="text-xs text-slate-300">
                        กม.{selectedFlood.km_start} ถึง กม.{selectedFlood.km_end} ({selectedFlood.subdistrict || selectedFlood.district || "อ.หนองจิก"})
                      </p>
                      {selectedFloodMeta.villageOrLandmark && (
                        <p className="text-xs text-amber-300 font-medium">📍 {selectedFloodMeta.villageOrLandmark}</p>
                      )}
                      {selectedFloodMeta.affectedParts && selectedFloodMeta.affectedParts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-1">
                          <span className="text-slate-400 font-medium">ส่วนถนนที่ท่วม:</span>
                          {selectedFloodMeta.affectedParts.map((part) => (
                            <span key={part} className="rounded bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-amber-200">
                              {AFFECTED_ROAD_PART_LABELS[part] || part}
                            </span>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const sideCode = resolveEffectiveRoadSide(selectedFlood);

                        return (sideCode !== "UNKNOWN" || selectedFlood.affected_lanes) ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {sideCode !== "UNKNOWN" && (
                              <span className="rounded bg-sky-950/90 border border-sky-700/80 px-2 py-0.5 text-sky-200 font-semibold">
                                {sideCode === "LEFT"
                                  ? "ฝั่งซ้ายทาง (ขาไป A → B)"
                                  : sideCode === "RIGHT"
                                    ? "ฝั่งขวาทาง (ขากลับ B → A)"
                                    : "ท่วมทั้งสองฝั่งจราจร"}
                              </span>
                            )}
                            {selectedFlood.affected_lanes && (
                              <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-slate-200">
                                {selectedFlood.affected_lanes}
                              </span>
                            )}
                            {selectedFlood.affected_shoulder && selectedFlood.affected_shoulder !== "NONE" && (
                              <span className="rounded bg-amber-950/80 border border-amber-700/70 px-2 py-0.5 text-amber-200">
                                ไหล่ทางได้รับผลกระทบ
                              </span>
                            )}
                            {(sideCode === "LEFT" || sideCode === "RIGHT") && (
                              <span className="text-[11px] text-amber-300 block w-full mt-0.5">
                                ⚠️ อีกฝั่งจราจรยังไม่ยืนยันความปลอดภัย โปรดใช้ความระมัดระวัง
                              </span>
                            )}
                          </div>
                        ) : null;
                      })()}
                      <p className="text-xs text-slate-400">อัปเดตล่าสุด: {selectedFlood.updated_at ? new Date(selectedFlood.updated_at).toLocaleString("th-TH") : "ไม่ระบุ"}</p>
                    </div>
                    <button
                      ref={closeDetailsRef}
                      type="button"
                      onClick={() => setShowDossier(false)}
                      aria-label="ปิดรายละเอียด"
                      className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                      title="ปิดหน้าต่างรายละเอียด"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body, in reading priority on a phone: level -> what to do -> photo -> history.
                    From sm up the photo sits beside the level card. */}
                <div className="grid grid-cols-1 gap-3.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-2">
                  <div className="sm:col-start-2 sm:row-start-1">
                    {/* Right: Water Level Stat & Traffic Advisory */}
                    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-[#0f1b33] p-3.5 sm:min-h-36">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-heading font-bold text-slate-400 uppercase">
                            ระดับน้ำปัจจุบัน
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-heading font-bold ${selectedFlood.trend === "RISING"
                              ? "bg-rose-950/80 text-rose-300 border border-rose-800"
                              : selectedFlood.trend === "FALLING"
                                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                                : "bg-amber-950/80 text-amber-300 border border-amber-800"
                            }`}>
                            แนวโน้ม: {selectedFlood.trend === "RISING" ? "เพิ่มขึ้น" : selectedFlood.trend === "FALLING" ? "ลดลง" : "ทรงตัว"}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="font-heading font-black text-5xl text-red-500 font-mono tracking-tight">
                            {selectedFlood.water_level_cm}
                          </span>
                          <span className="text-xs text-slate-300 font-bold">เซนติเมตร (ซม.)</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5 text-xs text-slate-300">
                          <span className="text-amber-400 font-bold shrink-0">
                            {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).icon}
                          </span>
                          <p className="text-[11px] leading-tight">
                            {getTrafficPresentation(selectedFlood.traffic_status, selectedFlood.water_level_cm).detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2 sm:row-start-2 space-y-3">
                    {/* Sibling Segments Comparative Summary (When Parent Event has multiple directions/stretches) */}
                    {siblingSegments.length > 1 && (
                      <div className="rounded-xl border border-sky-600/40 bg-sky-950/40 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-heading font-bold text-sky-200 flex items-center gap-1.5">
                            <span>📊 ช่วงและทิศทางในเหตุการณ์นี้ ({siblingSegments.length} ช่วง)</span>
                          </span>
                          <span className="text-[11px] text-slate-400">แตะเพื่อสลับดูข้อมูล</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {siblingSegments.map((s) => {
                            const sMeta = parseFloodDirectionMeta(s.direction_meta, s);
                            const isCurrent = s.id === selectedFlood.id;
                            const pres = getTrafficPresentation(s.traffic_status, s.water_level_cm);
                            const dirName =
                              sMeta.directionCode === "A_TO_B"
                                ? "ขาไป (A → B)"
                                : sMeta.directionCode === "B_TO_A"
                                  ? "ขากลับ (B → A)"
                                  : sMeta.directionCode === "BOTH" ? "ไป-กลับ (A ⇄ B)" : "ไม่ระบุทิศทาง";

                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSelectedFloodId(s.id);
                                  if (s.lat_start && s.lon_start) {
                                    setFocusCoordinates([s.lon_start, s.lat_start]);
                                  }
                                }}
                                className={`text-left p-2.5 rounded-lg border transition flex flex-col justify-between gap-1.5 cursor-pointer ${isCurrent
                                    ? "bg-sky-900/80 border-sky-400 ring-1 ring-sky-400 text-white shadow"
                                    : "bg-slate-900/70 border-slate-700/80 hover:bg-slate-800 text-slate-200"
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-1.5 w-full">
                                  <span className="font-heading text-xs font-bold text-amber-300">
                                    {dirName}
                                  </span>
                                  {isCurrent ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-400 text-slate-950">
                                      กำลังดูอยู่
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-sky-300 underline font-medium">
                                      แตะเพื่อดู
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-300">
                                  ระหว่าง กม.{s.km_start}–{s.km_end}
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] w-full">
                                  <span className="font-mono font-bold text-amber-400">
                                    {s.water_level_cm} ซม.
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.traffic_status === "CLOSED"
                                      ? "bg-red-500/80 text-white"
                                      : s.traffic_status === "PASSABLE"
                                        ? "bg-emerald-500/80 text-white"
                                        : "bg-amber-500/80 text-slate-950"
                                    }`}>
                                    {pres.icon} {pres.detail}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Detour Recommendation Box (Yellow Banner) */}
                    <div className="bg-amber-500/10 border border-amber-400/50 rounded-xl p-3.5 space-y-2.5">
                      {selectedFloodDetours.map((route) => {
                        const ext = extractDirectionalAdvice(route.description || "");
                        const parsed = splitDetourAdviceByDirection(route.description || "", route.direction_mode);
                        const displayText =
                          ext.hasBoth && route.direction_mode !== "FORWARD_ONLY" && route.direction_mode !== "REVERSE_ONLY"
                            ? citizenDetourDirection === "FORWARD"
                              ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                              : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                            : citizenDetourDirection === "FORWARD"
                              ? parsed.forwardText
                              : parsed.reverseText;
                        return (
                          <div key={route.id} className="rounded-lg border border-amber-400/30 bg-slate-950/70 p-3 text-sm text-amber-100">
                            <div className="flex items-center justify-between gap-2">
                              <strong className="block text-amber-300 font-heading">{route.route_name}</strong>
                              <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-300 shrink-0">
                                {route.direction_mode === "FORWARD_ONLY" ? "A → B (ทิศทางเดียว)" : route.direction_mode === "REVERSE_ONLY" ? "B → A (ทิศทางเดียว)" : "ไป-กลับ (A ⇄ B)"}
                              </span>
                            </div>
                            {route.description ? (
                              <AdviceText text={displayText} className="mt-2" />
                            ) : (
                              <p className="mt-1 text-xs">ยังไม่มีคำแนะนำการเดินทาง</p>
                            )}
                          </div>
                        );
                      })}
                      {selectedFloodDetours.length === 0 && !selectedFlood.detour_advice && (
                        <p className="text-[11px] text-amber-100/90">ยังไม่มีทางเลี่ยงที่ยืนยันและผูกกับจุดน้ำท่วมนี้ โปรดโทร 1586 ก่อนเดินทาง</p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-amber-300 text-xs font-heading font-bold">
                          <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>คำแนะนำเส้นทางเลี่ยงน้ำท่วม</span>
                          {selectedFloodMeta.directionCode === "B_TO_A" && (
                            <span className="text-[10px] font-normal text-amber-200/80 bg-amber-950/80 border border-amber-500/30 px-1.5 py-0.2 rounded">
                              (ปรับทิศทางขากลับอัตโนมัติ)
                            </span>
                          )}
                          {selectedFloodMeta.directionCode === "A_TO_B" && (
                            <span className="text-[10px] font-normal text-amber-200/80 bg-amber-950/80 border border-amber-500/30 px-1.5 py-0.2 rounded">
                              (ปรับทิศทางขาไปอัตโนมัติ)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Direction Switcher Toggle if bidirectional advice or detour exists */}
                          {(directionalAdvice.hasBoth || selectedFloodDetours.length > 0) && (
                            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-amber-500/40 text-[10px] font-heading font-bold">
                              <button
                                type="button"
                                onClick={() => setCitizenDetourDirection("FORWARD")}
                                className={`min-h-9 px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer ${citizenDetourDirection === "FORWARD"
                                    ? "bg-amber-500 text-slate-950 shadow"
                                    : "text-amber-300/80 hover:text-white"
                                  }`}
                              >
                                <span>🚗 ขาไป (A → B)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCitizenDetourDirection("REVERSE")}
                                className={`min-h-9 px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer ${citizenDetourDirection === "REVERSE"
                                    ? "bg-amber-500 text-slate-950 shadow"
                                    : "text-amber-300/80 hover:text-white"
                                  }`}
                              >
                                <span>🚙 ขากลับ (B → A)</span>
                              </button>
                            </div>
                          )}

                          {(() => {
                            const linkedDetour = selectedFloodDetours[0] || null;
                            const detourNav = linkedDetour
                              ? resolveDetourGoogleMapsNavigation(linkedDetour, citizenDetourDirection, systemData.floodRoutes)
                              : null;

                            if (detourNav && detourNav.isValid && detourNav.url) {
                              return (
                                <a
                                  href={detourNav.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md shrink-0 transition"
                                >
                                  <Navigation className="w-3.5 h-3.5" /> นำทางด้วยทางเลี่ยง
                                </a>
                              );
                            }
                            return (
                              <span
                                className="bg-slate-800 text-slate-400 font-heading text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 border border-slate-700"
                                title="ยังไม่มีเส้นทางเลี่ยงที่ยืนยันสำหรับการนำทางอัตโนมัติ โปรดศึกษาคำแนะนำด้านล่างหรือโทร 1586"
                              >
                                <Navigation className="w-3.5 h-3.5 opacity-50" /> ยังไม่ยืนยันนำทาง
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Detour Text Content with Direction Handling */}
                      {(() => {
                        if (!selectedFlood.detour_advice) {
                          return (
                            <p className="text-[11px] text-amber-100/90 leading-snug">
                              ยังไม่มีคำแนะนำเส้นทางเลี่ยงที่ยืนยันแล้ว โปรดโทร 1586 ก่อนเดินทาง
                            </p>
                          );
                        }
                        const ext = directionalAdvice;
                        const displayText = ext.hasBoth
                          ? citizenDetourDirection === "FORWARD"
                            ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                            : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                          : selectedFlood.detour_advice;

                        return (
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-amber-500/20 text-amber-100/95 font-sans sm:max-h-56 sm:overflow-y-auto">
                            <AdviceText text={displayText} />
                          </div>
                        );
                      })()}
                    </div>


                  </div>
                  <div className="sm:col-start-1 sm:row-start-1">
                    {/* Left: Photo with GPS overlay & Multi-photo thumbnail gallery */}
                    {(() => {
                      const photos = (selectedFlood && onDemandPhotos[selectedFlood.id]) || selectedFloodMeta.photos || [];
                      const displayPhotoUrl = photos[activePhotoIdx]?.dataUrl || selectedFlood.latest_photo_url;
                      return (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 group">
                            {displayPhotoUrl ? (
                              <img
                                src={displayPhotoUrl}
                                alt={`ภาพสถานการณ์ ${selectedFlood.section_name}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-36 sm:h-44 object-cover"
                              />
                            ) : (
                              <div className="flex h-36 items-center justify-center px-4 text-center text-xs text-slate-400">ยังไม่มีภาพถ่ายสถานการณ์ล่าสุด</div>
                            )}
                            {/* Animated Alert Badge Overlay on photo */}
                            <div className="absolute top-2 left-2 z-10">
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-950/95 px-2.5 py-1 text-[10px] font-heading font-black text-white shadow-xl">
                                {dossierStatus.icon} {dossierStatus.label}
                              </span>
                            </div>
                            <div className="p-1.5 bg-slate-950/90 text-[10px] text-slate-400 flex items-center justify-between font-mono">
                              <span>📍 ภาพถ่ายหน้างาน: {selectedFlood.lat_start?.toFixed(3)}, {selectedFlood.lon_start?.toFixed(3)}</span>
                              {photos.length > 0 && (
                                <span className="text-amber-300 font-bold">ภาพ {activePhotoIdx + 1}/{photos.length}</span>
                              )}
                            </div>
                          </div>

                          {/* Thumbnail gallery if multiple photos exist */}
                          {photos.length > 1 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="ภาพถ่ายสถานการณ์เพิ่มเติม">
                              {photos.map((photo, idx) => (
                                <button
                                  key={photo.id || idx}
                                  type="button"
                                  onClick={() => setActivePhotoIdx(idx)}
                                  className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition shrink-0 cursor-pointer ${activePhotoIdx === idx
                                      ? "border-amber-400 ring-2 ring-amber-400/50 shadow-md scale-105"
                                      : "border-slate-700 opacity-60 hover:opacity-100"
                                    }`}
                                  aria-label={`ดูภาพที่ ${idx + 1}`}
                                >
                                  <img
                                    src={photo.dataUrl}
                                    alt={`ภาพย่อที่ ${idx + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] text-center text-white font-mono">
                                    {Math.round(photo.sizeBytes / 1024)} KB
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="sm:col-span-2 sm:row-start-3">
                    {/* Timeline Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-heading font-bold text-white">
                        <span className="flex items-center gap-1.5 text-red-400">
                          <span>📈</span> ไทม์ไลน์ระดับน้ำแต่ละช่วงเวลา
                        </span>
                        <span className="text-[10px] text-amber-300 font-normal">+ อัปเดตระดับน้ำล่าสุด</span>
                      </div>

                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 h-36 w-full">
                        <WaterTimelineChart
                          timelineUpdates={systemData.timelineUpdates}
                          floodId={selectedFlood.id}
                        />
                      </div>

                      {/* Recent Timeline History Updates */}
                      <div className="space-y-1.5">
                        {selectedFloodRecentUpdates
                          .map((item) => (
                            <div
                              key={item.id}
                              className="text-[11px] bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center justify-between"
                            >
                              <span className="text-slate-300 truncate mr-2">
                                <strong className="text-amber-400 font-mono">
                                  {new Date(item.reported_at).toLocaleTimeString("th-TH", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })} น.
                                </strong>{" "}
                                {item.remark}
                              </span>
                              <strong className="text-red-400 font-bold font-mono shrink-0">
                                {item.water_level_cm} ซม.
                              </strong>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* DETOUR RECOMMENDATION MODAL (POPUP BOTTOM SHEET)                */}
          {/* Matches media_1794419336660_102fe43c.jpg 100%                   */}
          {/* =============================================================== */}
          {viewingDetourModal && (
            <div
              className="fixed inset-0 z-[700] flex items-end justify-center bg-slate-950/80 backdrop-blur-xs animate-fade-in sm:items-center sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeDetourDetails();
              }}
            >
              <div
                ref={detourDialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={`คำแนะนำเส้นทางเลี่ยง ${viewingDetourModal.route_name}`}
                className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-sky-950 bg-[#081120] text-slate-100 shadow-2xl sm:max-h-[88vh] sm:max-w-[490px] sm:rounded-[28px]"
              >
                {/* 1. Top Header Bar */}
                <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0c182e] px-4 pb-3 pt-2.5 shadow-md">
                  <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ArrowLeftRight className="w-6 h-6 text-[#f59e0b] stroke-[2.8] shrink-0" />
                      <h3 className="font-heading text-lg sm:text-xl font-bold tracking-wide text-white truncate">
                        เส้นทางเลี่ยง
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full border border-amber-500/70 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-300 shadow-xs whitespace-nowrap">
                        {detourDirectionDetailedBadge(viewingDetourModal.direction_mode)}
                      </span>
                      <button
                        ref={detourCloseRef}
                        type="button"
                        onClick={closeDetourDetails}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                        aria-label="ปิดหน้าต่างคำแนะนำทางเลี่ยง"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body Content */}
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4">
                  {/* 2. Sub-header Card (Route Info Card) */}
                  {(() => {
                    const linked = viewingDetourModal.flood_id_ref
                      ? systemData.floodRoutes.find((f) => f.id === viewingDetourModal.flood_id_ref)
                      : null;
                    const scopeText = linked
                      ? `ทล.${linked.route_no} (${linked.section_name || `กม.${linked.km_start} - ${linked.km_end}`})`
                      : viewingDetourModal.description && viewingDetourModal.description.includes("ทล.")
                        ? viewingDetourModal.description.split("\n")[0].replace(/^===?\s*/, "").replace(/\s*===?$/, "")
                        : "โครงข่ายทางหลวงแผ่นดิน แขวงทางหลวงปัตตานี";

                    return (
                      <div className="rounded-2xl border border-sky-800/80 bg-[#0e2146] p-3.5 flex items-center gap-3.5 shadow-md">
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-[#0284c7] flex items-center justify-center text-white shadow-sm">
                          <Link2 className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-heading text-sm sm:text-base font-bold text-white leading-tight truncate">
                            {viewingDetourModal.route_name}
                          </h4>
                          <p className="text-xs text-sky-200/90 font-medium leading-normal mt-0.5 truncate">
                            {scopeText}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Optional: Linked Flood Event Photo */}
                  {(() => {
                    const linked = viewingDetourModal.flood_id_ref
                      ? systemData.floodRoutes.find((f) => f.id === viewingDetourModal.flood_id_ref)
                      : null;
                    if (!linked?.latest_photo_url) return null;
                    return (
                      <details className="rounded-xl border border-slate-700/80 bg-slate-900/70">
                        <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-semibold text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                          ดูภาพประกอบจุดเกิดเหตุน้ำท่วม
                        </summary>
                        <div className="relative overflow-hidden rounded-b-xl bg-slate-950">
                          <img
                            src={linked.latest_photo_url}
                            alt="ภาพจุดน้ำท่วมที่ผูกกับทางเลี่ยง"
                            className="w-full h-40 object-cover"
                          />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent p-2 text-xs text-white">
                            <span className="font-bold text-amber-300">จุดเกิดเหตุ:</span> ทล.{linked.route_no} {linked.section_name} (กม.{linked.km_start} - {linked.km_end})
                          </div>
                        </div>
                      </details>
                    );
                  })()}

                  {/* 3. Direction Selector */}
                  <section aria-label="เลือกทิศทางการเดินทาง">
                    <label className="text-sm font-semibold text-slate-200 block mb-2">
                      เลือกทิศทางการเดินทาง
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-label="ขาไป A → B"
                        disabled={!isDetourDirectionAllowed(viewingDetourModal.direction_mode, "FORWARD")}
                        aria-pressed={modalDetourDirection === "FORWARD"}
                        onClick={() => setModalDetourDirection("FORWARD")}
                        className={`min-h-11 rounded-xl px-3 py-2.5 font-heading text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${modalDetourDirection === "FORWARD"
                            ? "bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 shadow-md font-black"
                            : "bg-[#13203c] border border-slate-700/60 hover:bg-[#1a2b50] text-slate-200"
                          }`}
                      >
                        <span aria-hidden="true">🚗</span>
                        <span>ขาไป (A ➔ B)</span>
                      </button>
                      <button
                        type="button"
                        aria-label="ขากลับ B → A"
                        disabled={!isDetourDirectionAllowed(viewingDetourModal.direction_mode, "REVERSE")}
                        aria-pressed={modalDetourDirection === "REVERSE"}
                        onClick={() => setModalDetourDirection("REVERSE")}
                        className={`min-h-11 rounded-xl px-3 py-2.5 font-heading text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${modalDetourDirection === "REVERSE"
                            ? "bg-[#f59e0b] hover:bg-[#d97706] text-slate-950 shadow-md font-black"
                            : "bg-[#13203c] border border-slate-700/60 hover:bg-[#1a2b50] text-slate-200"
                          }`}
                      >
                        <span aria-hidden="true">🚙</span>
                        <span>ขากลับ (B ➔ A)</span>
                      </button>
                    </div>
                    {!isRecordedDetourDirection(viewingDetourModal.direction_mode) && (
                      <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1.5" role="status">
                        <span>⚠️</span>ยังไม่ได้ยืนยันทิศทางเดินรถ กรุณาตรวจสอบกับเจ้าหน้าที่ก่อนเดินทาง
                      </p>
                    )}
                  </section>

                  {/* 4. Timeline (คำแนะนำเส้นทาง) + 5. Metrics + 6. Condition */}
                  {(() => {
                    const parsed = splitDetourAdviceByDirection(
                      viewingDetourModal.description || "",
                      viewingDetourModal.direction_mode
                    );
                    const adviceText = modalDetourDirection === "FORWARD" ? parsed.forwardText : parsed.reverseText;
                    const meters = detourDistanceMeters(viewingDetourModal.detour_meta, modalDetourDirection);
                    const linked = viewingDetourModal.flood_id_ref
                      ? systemData.floodRoutes.find((f) => f.id === viewingDetourModal.flood_id_ref)
                      : null;
                    const startHint = linked ? `ทล.${linked.route_no} (${linked.section_name})` : viewingDetourModal.route_name;
                    const endHint = linked ? `(ต.${linked.subdistrict || 'เมือง'} อ.${linked.district || 'เมืองปัตตานี'})` : "";

                    const timeline = getDetourTimelinePresentation(
                      adviceText,
                      meters,
                      viewingDetourModal.detour_meta?.forward_distance_km || 0,
                      startHint,
                      endHint,
                      viewingDetourModal.detour_meta?.road_condition
                    );

                    return (
                      <section aria-label="คำแนะนำเส้นทาง" className="space-y-3 pt-1">
                        {/* Section Header */}
                        <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                          <Route className="w-5 h-5 text-[#f59e0b]" />
                          <span>คำแนะนำเส้นทาง</span>
                        </div>

                        {/* Step Timeline Container */}
                        <div className="relative space-y-3 pl-1">
                          {/* Vertical Connector Line */}
                          {timeline.steps.length > 1 && (
                            <div
                              aria-hidden="true"
                              className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-slate-600/70"
                            />
                          )}

                          {timeline.steps.map((st) => (
                            <div key={st.stepNumber} className="relative flex items-start">
                              {/* Step Number Circle */}
                              <div
                                aria-hidden="true"
                                className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f59e0b] text-xs font-black text-slate-950 shadow-md"
                              >
                                {st.stepNumber}
                              </div>

                              {/* Step Card */}
                              <div className="ml-3 flex-1 rounded-2xl border border-slate-800 bg-[#0d1b36] p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {st.iconType === "start" ? (
                                      <span className="text-sm">📍</span>
                                    ) : st.iconType === "turn_left" ? (
                                      <CornerUpLeft className="w-4 h-4 text-white inline-block stroke-[2.5]" />
                                    ) : (
                                      <CornerUpRight className="w-4 h-4 text-white inline-block stroke-[2.5]" />
                                    )}
                                    <span className="font-heading font-bold text-sm text-amber-300 truncate">
                                      {st.title}
                                    </span>
                                  </div>
                                  <span className="rounded-md border border-slate-700/80 bg-slate-900/90 px-2 py-0.5 font-mono text-xs text-slate-300 whitespace-nowrap shrink-0">
                                    {st.badge}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 leading-normal break-words">
                                  {st.detail}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 5. Metrics Bar: ระยะทางรวม & เวลาโดยประมาณ */}
                        <div className="rounded-2xl border border-slate-800/80 bg-[#0e1c36] p-3 flex items-center justify-around text-slate-200 mt-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Route className="w-4 h-4 text-slate-300" />
                            <span className="text-xs text-slate-300">ระยะทางรวม</span>
                            <strong className="font-heading font-bold text-sm sm:text-base text-white">
                              {timeline.totalDistanceFormatted} กม.
                            </strong>
                          </div>
                          <div className="h-5 w-px bg-slate-700/80" />
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-300" />
                            <span className="text-xs text-slate-300">เวลาโดยประมาณ</span>
                            <strong className="font-heading font-bold text-sm sm:text-base text-white">
                              {timeline.estimatedMinutes} นาที
                            </strong>
                          </div>
                        </div>

                        {/* 6. Road Condition Bar: สภาพเส้นทาง */}
                        <div className="flex items-center justify-between mt-3 px-1">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-200">
                            <Milestone className="w-4 h-4 text-slate-300" />
                            <span>สภาพเส้นทาง</span>
                          </div>
                          <div className="rounded-full border border-emerald-500/70 bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{timeline.roadCondition}</span>
                          </div>
                        </div>
                      </section>
                    );
                  })()}

                  {/* 7. Bottom Action Buttons: นำทางด้วย Google Maps & ดูตำแหน่งบนแผนที่ */}
                  {(() => {
                    const nav = resolveDetourGoogleMapsNavigation(
                      viewingDetourModal,
                      modalDetourDirection,
                      systemData.floodRoutes
                    );

                    return (
                      <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-slate-800/90 bg-[#081120] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_20px_rgba(8,17,32,0.95)]">
                        <div className="grid grid-cols-2 gap-2.5">
                          {nav.isValid && nav.url ? (
                            <a
                              href={nav.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between rounded-2xl bg-[#10b981] hover:bg-[#059669] p-2.5 sm:p-3 text-white shadow-lg shadow-emerald-950/40 transition-all cursor-pointer group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full bg-white p-1 flex items-center justify-center shadow">
                                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                                    <path fill="#EA4335" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                                    <circle fill="#FFFFFF" cx="12" cy="9" r="2.8" />
                                    <circle fill="#4285F4" cx="12" cy="9" r="1.8" />
                                  </svg>
                                </div>
                                <div className="text-left min-w-0">
                                  <div className="font-heading text-xs sm:text-sm font-bold text-white leading-tight truncate">
                                    นำทางด้วย Google Maps
                                  </div>
                                  <div className="text-[10px] sm:text-[11px] font-medium text-emerald-100 leading-tight mt-0.5 truncate">
                                    {modalDetourDirection === "FORWARD" ? "(ขาไป A ➔ B)" : "(ขากลับ B ➔ A)"}
                                  </div>
                                </div>
                              </div>
                              <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </a>
                          ) : (
                            <div className="flex items-center justify-center rounded-2xl border border-amber-500/40 bg-slate-900 p-2.5 text-center text-xs text-amber-200">
                              ⚠️ {nav.warning || "เส้นทางยังไม่พร้อมสำหรับการนำทาง"}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (Number.isFinite(viewingDetourModal.lon_start) && Number.isFinite(viewingDetourModal.lat_start)) {
                                setFocusCoordinates([viewingDetourModal.lon_start, viewingDetourModal.lat_start]);
                              }
                              setViewingDetourModal(null);
                              setReturnToDetourList(false);
                              setIsMobileDrawerOpen(false);
                            }}
                            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-[#13203c] hover:bg-[#1a2b50] p-2.5 sm:p-3 font-heading text-xs sm:text-sm font-bold text-white shadow transition-all cursor-pointer"
                          >
                            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0" />
                            <span>ดูตำแหน่งบนแผนที่</span>
                          </button>
                        </div>
                        {nav.disclaimer && (
                          <details className="text-xs text-slate-400">
                            <summary className="cursor-pointer text-center text-slate-400 underline underline-offset-2">ข้อควรทราบก่อนนำทาง</summary>
                            <p className="mt-1 text-center leading-relaxed">{nav.disclaimer}</p>
                          </details>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
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
