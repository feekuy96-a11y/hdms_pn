"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { INITIAL_SYSTEM_DATA, type FloodRoute, type SystemDataPayload } from "@/db/default-data";
import { getPublicSystemDataAction } from "@/app/actions/doh-actions";
import { createClient } from "@/lib/supabase/client";
import { extractDirectionalAdvice } from "@/lib/gis-utils";
import { getLinkedDetoursForFlood, getLinkedEventsForDetour } from "@/lib/event-detour-links";
import { computeGisFilterHighlights } from "@/lib/gis-filter-rules";
import { normalizeMediaUrl, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import {
  getTrafficPresentation,
  type StatusColor,
  type TrafficStatus,
} from "@/lib/traffic-presentation";
import { usePollingActivity } from "@/lib/use-polling-activity";
import { useSystemFavicon } from "@/lib/use-system-favicon";

export type PublicFloodAlbumPhoto = { dataUrl: string; sizeBytes?: number; id?: string };
export type PublicFloodAlbum =
  | { status: "loading" | "empty" | "failed" }
  | { status: "photos"; photos: PublicFloodAlbumPhoto[] };

function readAlbumPhotos(raw: unknown[]): PublicFloodAlbumPhoto[] {
  return raw.flatMap((photo) => {
    if (!photo || typeof photo !== "object" || !("dataUrl" in photo)) return [];
    const dataUrl = normalizeMediaUrl(photo.dataUrl).trim();
    if (!/^(?:https?:\/\/[^\s]+|data:image\/[a-z.+-]+[;,]|\/(?!\/))/i.test(dataUrl)) return [];
    const id = "id" in photo && typeof photo.id === "string" ? photo.id : undefined;
    const sizeBytes = "sizeBytes" in photo && typeof photo.sizeBytes === "number" ? photo.sizeBytes : undefined;
    return [{ dataUrl, id, sizeBytes }];
  });
}

export interface UsePublicDashboardDataParams {
  selectedFloodId: string;
  sidebarTab: "FLOOD" | "DETOUR";
  searchQuery: string;
  selectedRouteFilter: string;
  setSelectedRouteFilter: (v: string) => void;
  selectedStatusFilter: StatusColor | "ALL";
  matchFloodPassability?: (route: FloodRoute) => boolean;
  showToast: (msg: string) => void;
}

export function usePublicDashboardData({
  selectedFloodId,
  sidebarTab,
  searchQuery,
  selectedRouteFilter,
  setSelectedRouteFilter,
  selectedStatusFilter,
  matchFloodPassability,
  showToast,
}: UsePublicDashboardDataParams) {
  const isPollingActive = usePollingActivity();
  const previousDataFingerprint = useRef<string>("");
  const [floodAlbums, setFloodAlbums] = useState<Record<string, PublicFloodAlbum>>({});
  const floodAlbumCache = useRef(new Map<string, PublicFloodAlbum>());

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

  // Shared flood, detour & highway filtering rules (Public active-only)
  const {
    filteredFloods,
    filteredDetours,
    highlightFloodIds,
    highlightDetourIds,
    highlightHighwayRouteNos,
    isFilterActive,
  } = useMemo(
    () =>
      computeGisFilterHighlights(systemData, {
        searchQuery,
        routeFilter: selectedRouteFilter,
        statusFilter: selectedStatusFilter,
        matchFloodPassability,
        includeInactive: false,
      }),
    [systemData, searchQuery, selectedRouteFilter, selectedStatusFilter, matchFloodPassability]
  );

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
      const cached = floodAlbumCache.current.get(flood.id);
      if (cached && cached.status !== "failed") return;
      const save = (album: PublicFloodAlbum) => {
        floodAlbumCache.current.set(flood.id, album);
        setFloodAlbums((prev) => ({ ...prev, [flood.id]: album }));
      };
      save({ status: "loading" });
      void (async () => {
        try {
          const client = createClient();
          const { data, error } = await client
            .from("doh_flood_routes")
            .select("direction_meta")
            .eq("id", flood.id)
            .maybeSingle();
          const raw = data?.direction_meta?.photos;
          if (error || (raw != null && !Array.isArray(raw))) {
            save({ status: "failed" });
          } else if (!raw?.length) {
            save({ status: "empty" });
          } else {
            const photos = readAlbumPhotos(raw);
            save(photos.length ? { status: "photos", photos } : { status: "failed" });
          }
        } catch {
          save({ status: "failed" });
        }
      })();
    },
    []
  );

  const detourCountByFloodId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flood of systemData.floodRoutes || []) {
      if (!flood.is_active) continue;
      counts.set(flood.id, getLinkedDetoursForFlood(flood, systemData).length);
    }
    return counts;
  }, [systemData]);

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
  };
}
