"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { INITIAL_SYSTEM_DATA, type FloodRoute, type SystemDataPayload } from "@/db/default-data";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { createClient } from "@/lib/supabase/client";
import { extractDirectionalAdvice } from "@/lib/gis-utils";
import { getLinkedDetoursForFlood, getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { normalizeMediaUrl, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import {
  getTrafficPresentation,
  type StatusColor,
  type TrafficStatus,
} from "@/lib/traffic-presentation";
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";
import { highwayIdsInDetour, STATUS_ORDER } from "@/components/public/public-route-helpers";

export interface UsePublicDashboardDataParams {
  selectedFloodId: string;
  sidebarTab: "FLOOD" | "DETOUR";
  searchQuery: string;
  selectedRouteFilter: string;
  setSelectedRouteFilter: (v: string) => void;
  selectedStatusFilter: StatusColor | "ALL";
  showToast: (msg: string) => void;
}

export function usePublicDashboardData({
  selectedFloodId,
  sidebarTab,
  searchQuery,
  selectedRouteFilter,
  setSelectedRouteFilter,
  selectedStatusFilter,
  showToast,
}: UsePublicDashboardDataParams) {
  const isPollingActive = usePollingActivity();
  const previousDataFingerprint = useRef<string>("");
  const [onDemandPhotos, setOnDemandPhotos] = useState<
    Record<string, Array<{ dataUrl?: string; sizeBytes?: number; id?: string }>>
  >({});

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

  useSystemFavicon(
    systemData.systemSettings?.logoUrl,
    systemData.systemSettings?.name,
    systemData.systemSettings?.org
  );

  // Background Auto-Notification when new/updated data arrives
  useEffect(() => {
    if (!systemData) return;
    const currentFingerprint = `${systemData.updatedAt || ""}_${systemData.floodRoutes?.length || 0}_${(systemData.floodRoutes || [])
      .map((r) => `${r.id}:${r.water_level_cm}:${r.traffic_status}:${r.updated_at}`)
      .join("|")}`;

    if (previousDataFingerprint.current && previousDataFingerprint.current !== currentFingerprint) {
      showToast("🔔 มีข้อมูลสถานการณ์อัปเดตล่าสุดจากศูนย์ปฏิบัติการ");
    }
    previousDataFingerprint.current = currentFingerprint;
  }, [systemData, showToast]);

  const selectedFlood =
    systemData.floodRoutes.find((r) => r.id === selectedFloodId) || systemData.floodRoutes[0];
  const selectedFloodMeta = useMemo(
    () => parseFloodDirectionMeta(selectedFlood?.direction_meta, selectedFlood),
    [selectedFlood]
  );

  // Parsing the advice text is regex heavy; do it once per advice text, not on every render.
  const selectedFloodKey = selectedFlood?.id;
  const selectedFloodAdvice = selectedFlood?.detour_advice || "";
  const directionalAdvice = useMemo(
    () => extractDirectionalAdvice(selectedFloodAdvice),
    [selectedFloodAdvice]
  );

  // Latest 3 updates of the selected flood, computed once per data/selection change.
  const selectedFloodRecentUpdates = useMemo(
    () =>
      selectedFloodKey
        ? systemData.timelineUpdates.filter((u) => u.flood_id_ref === selectedFloodKey).slice(0, 3)
        : [],
    [systemData.timelineUpdates, selectedFloodKey]
  );

  // Sibling segments under the same parent event or same control section
  const siblingSegments = useMemo(() => {
    if (!selectedFlood) return [];
    const eventId = selectedFloodMeta?.eventId;
    return (systemData.floodRoutes || []).filter(
      (r) =>
        r.is_active &&
        ((eventId && r.direction_meta?.eventId === eventId) ||
          (r.route_no === selectedFlood.route_no && r.section_name === selectedFlood.section_name))
    );
  }, [selectedFlood, selectedFloodMeta?.eventId, systemData.floodRoutes]);

  const floodRouteChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active || !flood.route_no || /^(?:ปน)\.?/i.test(flood.route_no)) continue;
      const number = flood.route_no.replace(/^ทล\.?\s*/i, "").trim();
      if (number) counts.set(number, (counts.get(number) || 0) + 1);
    }
    const sorted = [...counts.keys()].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
    return [
      { id: "ALL", label: "ทุกสายทาง", count: (systemData.floodRoutes || []).filter((route) => route.is_active).length },
      ...sorted.map((id) => ({ id, label: `ทล.${id}`, count: counts.get(id) || 0 })),
    ];
  }, [systemData.floodRoutes]);

  const detourRouteChips = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const detour of systemData.detourRoutes || []) {
      if (!detour.is_active) continue;
      const linked = getLinkedEventsForDetour(detour, systemData);
      const labels =
        linked.length > 0
          ? linked.map((event) => ({ id: event.routeNo, label: `ทล.${event.routeNo}` }))
          : [...`${detour.route_name || ""} ${detour.description || ""}`.matchAll(/(ปน\.(?:ถ\.)?\s*\d{1,5})/gi)].map(
              (match) => ({ id: match[1].replace(/\s+/g, ""), label: match[1].replace(/\s+/g, "") })
            );
      for (const item of labels) {
        const current = counts.get(item.id);
        counts.set(item.id, { label: item.label, count: (current?.count || 0) + 1 });
      }
    }
    const sorted = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "th", { numeric: true }));
    return [
      { id: "ALL", label: "ทุกสายทาง", count: (systemData.detourRoutes || []).filter((route) => route.is_active).length },
      ...sorted.map(([id, item]) => ({ id, ...item })),
    ];
  }, [systemData]);

  const routeChips = sidebarTab === "FLOOD" ? floodRouteChips : detourRouteChips;
  useEffect(() => {
    if (!routeChips.some((chip) => chip.id === selectedRouteFilter)) setSelectedRouteFilter("ALL");
  }, [routeChips, selectedRouteFilter, setSelectedRouteFilter]);

  // Filtered flood routes for citizens/users
  const filteredFloods = useMemo(() => {
    const normalizedQuery = searchQuery.trim().replace(/^(?:ทล|ปน)\.?\s*/i, "").toLocaleLowerCase();
    const rawQuery = searchQuery.toLowerCase();
    return (systemData.floodRoutes || [])
      .filter((r) => {
        if (!r.is_active) return false;
        const matchSearch =
          r.route_no.toLowerCase().includes(normalizedQuery) ||
          r.section_name.toLowerCase().includes(rawQuery) ||
          (r.subdistrict && r.subdistrict.toLowerCase().includes(rawQuery)) ||
          (r.district && r.district.toLowerCase().includes(rawQuery));

        const cleanNo = r.route_no.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim();
        const matchChip =
          selectedRouteFilter === "ALL" || cleanNo === selectedRouteFilter || r.route_no === selectedRouteFilter;

        const presentation = getTrafficPresentation(
          r.traffic_status as TrafficStatus,
          r.water_level_cm,
          r.direction_meta?.trafficStatusDetail
        );
        const matchStatus = selectedStatusFilter === "ALL" || presentation.color === selectedStatusFilter;
        return matchSearch && matchChip && matchStatus;
      })
      .sort(
        (a, b) =>
          STATUS_ORDER[
            getTrafficPresentation(a.traffic_status as TrafficStatus, a.water_level_cm, a.direction_meta?.trafficStatusDetail).color
          ] -
          STATUS_ORDER[
            getTrafficPresentation(b.traffic_status as TrafficStatus, b.water_level_cm, b.direction_meta?.trafficStatusDetail).color
          ]
      );
  }, [systemData.floodRoutes, searchQuery, selectedRouteFilter, selectedStatusFilter]);

  const situationCounts = useMemo(() => {
    const counts: Record<StatusColor, number> = { red: 0, orange: 0, amber: 0, sky: 0, emerald: 0, slate: 0 };
    (systemData.floodRoutes || []).forEach((route) => {
      if (route.is_active) {
        counts[
          getTrafficPresentation(route.traffic_status as TrafficStatus, route.water_level_cm, route.direction_meta?.trafficStatusDetail).color
        ] += 1;
      }
    });
    return counts;
  }, [systemData.floodRoutes]);

  const activeFloodCount =
    situationCounts.red +
    situationCounts.orange +
    situationCounts.amber +
    situationCounts.sky +
    situationCounts.emerald +
    situationCounts.slate;

  const dossierStatus = getTrafficPresentation(
    (selectedFlood?.traffic_status ?? "PASSABLE") as TrafficStatus,
    selectedFlood?.water_level_cm ?? 0,
    selectedFlood?.direction_meta?.trafficStatusDetail
  );

  // On-demand load of full photo album (photos 1..4) without bloating initial page payload
  const loadFloodPhotosOnDemand = useCallback(
    (flood: FloodRoute) => {
      if (onDemandPhotos[flood.id]) return;
      void (async () => {
        try {
          const client = createClient();
          const { data } = await client
            .from("doh_flood_routes")
            .select("direction_meta")
            .eq("id", flood.id)
            .maybeSingle();
          if (data?.direction_meta?.photos && Array.isArray(data.direction_meta.photos) && data.direction_meta.photos.length > 0) {
            const normalizedPhotos = data.direction_meta.photos.map(
              (p: { dataUrl?: string; sizeBytes?: number; id?: string }) => ({
                ...p,
                dataUrl: normalizeMediaUrl(p?.dataUrl),
              })
            );
            setOnDemandPhotos((prev) => ({ ...prev, [flood.id]: normalizedPhotos }));
          }
        } catch {
          // Fallback to primary photo already available
        }
      })();
    },
    [onDemandPhotos]
  );

  const detourCountByFloodId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active) continue;
      counts.set(flood.id, getLinkedDetoursForFlood(flood, systemData).length);
    }
    return counts;
  }, [systemData]);

  const filteredDetours = useMemo(() => {
    const activeDetours = (systemData.detourRoutes || []).filter((route) => route.is_active);
    const query = searchQuery.trim().toLocaleLowerCase();
    const normalizedQuery = query.replace(/^(?:ทล|ปน)\.?\s*/i, "");
    return activeDetours.filter((route) => {
      const detourHighwayIds = highwayIdsInDetour(route, systemData);
      const linkedEvents = getLinkedEventsForDetour(route, systemData);
      const linkedEventsText = linkedEvents
        .map((ev) => `${ev.routeNo} ${ev.sectionName} ${ev.kmRangeLabel}`)
        .join(" ");
      const matchesText =
        `${route.route_name} ${route.description || ""} ${linkedEventsText}`.toLocaleLowerCase().includes(query) ||
        detourHighwayIds.some((id) => id.includes(normalizedQuery));
      const standaloneLocalIds =
        linkedEvents.length === 0
          ? [...`${route.route_name || ""} ${route.description || ""}`.matchAll(/(ปน\.(?:ถ\.)?\s*\d{1,5})/gi)].map(
              (match) => match[1].replace(/\s+/g, "")
            )
          : [];
      const matchesHighway =
        selectedRouteFilter === "ALL" ||
        detourHighwayIds.includes(selectedRouteFilter) ||
        standaloneLocalIds.includes(selectedRouteFilter);
      return matchesText && matchesHighway;
    });
  }, [systemData, searchQuery, selectedRouteFilter]);

  const highlightFloodIds = useMemo(() => filteredFloods.map((route) => route.id), [filteredFloods]);
  const highlightDetourIds = useMemo(() => filteredDetours.map((route) => route.id), [filteredDetours]);
  const activeRouteChip = routeChips.find((chip) => chip.id === selectedRouteFilter);

  const selectedFloodDetourEntries = useMemo(
    () => getLinkedDetoursForFlood(selectedFlood, systemData),
    [selectedFlood, systemData]
  );
  const selectedFloodDetours = useMemo(
    () => selectedFloodDetourEntries.map((entry) => entry.detour),
    [selectedFloodDetourEntries]
  );

  return {
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
    activeRouteChip,
    selectedFloodDetourEntries,
    selectedFloodDetours,
  };
}
