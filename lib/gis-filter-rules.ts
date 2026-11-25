import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { getHighwayIdsForDetour, getLinkedEventsForDetour } from "@/lib/event-detour-links";
import type { GisFocusFilterSnapshot } from "@/lib/gis-focus-mode";
import {
  getTrafficPresentation,
  type StatusColor,
  type TrafficStatus,
} from "@/lib/traffic-presentation";
import { STATUS_ORDER } from "@/components/public/public-route-helpers";

export interface GisFilterCriteria {
  searchQuery: string;
  routeFilter: string;
  statusFilter: StatusColor | "ALL";
  /** Include inactive/draft records (e.g. Admin view). Defaults to false (Public). */
  includeInactive?: boolean;
}

export interface GisFilterHighlights {
  filteredFloods: FloodRoute[];
  filteredDetours: DetourRoute[];
  highlightFloodIds: string[];
  highlightDetourIds: string[];
  highlightHighwayRouteNos: string[];
  isFilterActive: boolean;
}

export function normalizeGisHighwayCode(value: string): string {
  return value.replace(/^ทล\.?\s*/i, "").trim();
}

export function isGisFilterCriteriaActive(criteria: Pick<GisFilterCriteria, "searchQuery" | "routeFilter" | "statusFilter">): boolean {
  return (
    Boolean(criteria.searchQuery.trim()) ||
    criteria.routeFilter !== "ALL" ||
    criteria.statusFilter !== "ALL"
  );
}

export function hasGisFilterChanged(
  prev: Pick<GisFocusFilterSnapshot, "searchQuery" | "routeFilter" | "statusFilter"> | null | undefined,
  next: Pick<GisFocusFilterSnapshot, "searchQuery" | "routeFilter" | "statusFilter"> | null | undefined
): boolean {
  if (!prev || !next) return false;
  return (
    prev.searchQuery !== next.searchQuery ||
    prev.routeFilter !== next.routeFilter ||
    prev.statusFilter !== next.statusFilter
  );
}

/**
 * Shared flood filtering and severity sorting used across Public & Admin views.
 */
export function filterFloodRoutes(
  floodRoutes: FloodRoute[] | undefined,
  criteria: GisFilterCriteria
): FloodRoute[] {
  const { searchQuery, routeFilter, statusFilter, includeInactive = false } = criteria;
  const normalizedQuery = searchQuery.trim().replace(/^(?:ทล|ปน)\.?\s*/i, "").toLocaleLowerCase();
  const rawQuery = searchQuery.toLowerCase();

  return (floodRoutes || [])
    .filter((route) => {
      if (!includeInactive && !route.is_active) return false;

      const matchSearch =
        route.route_no.toLowerCase().includes(normalizedQuery) ||
        route.section_name.toLowerCase().includes(rawQuery) ||
        Boolean(route.subdistrict && route.subdistrict.toLowerCase().includes(rawQuery)) ||
        Boolean(route.district && route.district.toLowerCase().includes(rawQuery));

      const cleanNo = route.route_no.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim();
      const matchRoute =
        routeFilter === "ALL" || cleanNo === routeFilter || route.route_no === routeFilter;

      const presentation = getTrafficPresentation(
        route.traffic_status as TrafficStatus,
        route.water_level_cm,
        route.direction_meta?.trafficStatusDetail
      );
      const matchStatus = statusFilter === "ALL" || presentation.color === statusFilter;

      return matchSearch && matchRoute && matchStatus;
    })
    .sort((a, b) => {
      const aColor = getTrafficPresentation(
        a.traffic_status as TrafficStatus,
        a.water_level_cm,
        a.direction_meta?.trafficStatusDetail
      ).color;
      const bColor = getTrafficPresentation(
        b.traffic_status as TrafficStatus,
        b.water_level_cm,
        b.direction_meta?.trafficStatusDetail
      ).color;
      return STATUS_ORDER[aColor] - STATUS_ORDER[bColor];
    });
}

/**
 * Shared detour filtering matching route text, linked events, and highway numbers.
 */
export function filterDetourRoutes(
  systemData: SystemDataPayload,
  criteria: Pick<GisFilterCriteria, "searchQuery" | "routeFilter" | "includeInactive">
): DetourRoute[] {
  const { searchQuery, routeFilter, includeInactive = false } = criteria;
  const query = searchQuery.trim().toLocaleLowerCase();
  const normalizedQuery = query.replace(/^(?:ทล|ปน)\.?\s*/i, "");

  return (systemData.detourRoutes || []).filter((route) => {
    if (!includeInactive && !route.is_active) return false;

    const detourHighwayIds = getHighwayIdsForDetour(route, systemData);
    const linkedEvents = getLinkedEventsForDetour(route, systemData, { includeInactiveFloods: includeInactive });
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
      routeFilter === "ALL" ||
      detourHighwayIds.includes(routeFilter) ||
      standaloneLocalIds.includes(routeFilter);

    return matchesText && matchesHighway;
  });
}

/**
 * Collects highway route numbers to highlight when a GIS filter is active.
 */
export function collectHighlightHighwayRouteNos(
  systemData: SystemDataPayload,
  filteredFloods: FloodRoute[],
  filteredDetours: DetourRoute[],
  criteria: Pick<GisFilterCriteria, "searchQuery" | "routeFilter" | "statusFilter">,
  isFilterActive = isGisFilterCriteriaActive(criteria)
): string[] {
  if (!isFilterActive) return [];

  const routes = new Set<string>();
  const add = (value: string) => {
    const number = normalizeGisHighwayCode(value);
    if (/^\d+$/.test(number)) routes.add(number);
  };

  filteredFloods.forEach((route) => add(route.route_no));
  filteredDetours.forEach((route) => getHighwayIdsForDetour(route, systemData).forEach(add));

  const query = criteria.searchQuery.trim().toLocaleLowerCase();
  const normalizedQuery = normalizeGisHighwayCode(query);

  for (const layer of systemData.highwayLayers || []) {
    const features =
      layer.geojson_data?.type === "FeatureCollection"
        ? layer.geojson_data.features
        : layer.geojson_data?.type === "Feature"
          ? [layer.geojson_data]
          : [];
    for (const feature of features || []) {
      const props = feature.properties || {};
      const number = normalizeGisHighwayCode(
        String(props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "")
      );
      const name = String(
        props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || ""
      );
      if (
        (criteria.routeFilter === "ALL" || number === normalizeGisHighwayCode(criteria.routeFilter)) &&
        (!query || number.toLocaleLowerCase().includes(normalizedQuery) || name.toLocaleLowerCase().includes(query)) &&
        (criteria.statusFilter === "ALL" ||
          filteredFloods.some((route) => normalizeGisHighwayCode(route.route_no) === number))
      ) {
        add(number);
      }
    }
  }

  return [...routes].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
}

/**
 * Computes the complete synchronized set of highlighted IDs and filtered lists.
 */
export function computeGisFilterHighlights(
  systemData: SystemDataPayload,
  criteria: GisFilterCriteria
): GisFilterHighlights {
  const filteredFloods = filterFloodRoutes(systemData.floodRoutes, criteria);
  const filteredDetours = filterDetourRoutes(systemData, criteria);
  const isFilterActive = isGisFilterCriteriaActive(criteria);
  const highlightHighwayRouteNos = collectHighlightHighwayRouteNos(
    systemData,
    filteredFloods,
    filteredDetours,
    criteria,
    isFilterActive
  );

  return {
    filteredFloods,
    filteredDetours,
    highlightFloodIds: filteredFloods.map((route) => route.id),
    highlightDetourIds: filteredDetours.map((route) => route.id),
    highlightHighwayRouteNos,
    isFilterActive,
  };
}
