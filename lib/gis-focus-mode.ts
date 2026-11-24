import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { groupFloodRoutesIntoEvents, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { parseRouteCoordinates } from "@/components/public/public-route-helpers";

export type GisFocusTargetType = "DETOUR" | "FLOOD";
export type GisFocusDirection = "FORWARD" | "REVERSE";

/** Longitude-first coordinate pair `[lon, lat]`. */
export type LonLatCoord = [number, number];

export interface GisFocusViewportSnapshot {
  /** `[lon, lat]` — longitude first per HDMS/Longdo contract. */
  center: LonLatCoord;
  zoom: number;
}

export interface GisFocusFilterSnapshot {
  activeTab: "FLOOD" | "DETOUR";
  statusFilter: string;
  routeFilter: string;
  searchQuery: string;
}

export interface GisFocusOriginSnapshot {
  viewport: GisFocusViewportSnapshot | null;
  filters: GisFocusFilterSnapshot | null;
}

export interface GisFocusState {
  status: "idle" | "focused";
  targetType: GisFocusTargetType | null;
  targetId: string | null;
  direction: GisFocusDirection;
  showLinkedDetour: boolean;
  linkedDetourId: string | null;
  /** Incremented whenever an explicit fitBounds should run (enter, target switch, direction/overlay toggle). */
  fitRequestId: number;
  originSnapshot: GisFocusOriginSnapshot | null;
}

export const IDLE_GIS_FOCUS_STATE: GisFocusState = {
  status: "idle",
  targetType: null,
  targetId: null,
  direction: "FORWARD",
  showLinkedDetour: false,
  linkedDetourId: null,
  fitRequestId: 0,
  originSnapshot: null,
};

export interface EnterGisFocusInput {
  targetType: GisFocusTargetType;
  targetId: string;
  direction?: GisFocusDirection;
  showLinkedDetour?: boolean;
  linkedDetourId?: string | null;
  captureSnapshot: () => GisFocusOriginSnapshot;
}

/**
 * Transitions into Shared GIS Focus Mode.
 * Preserves the original `originSnapshot` immutably when switching directly
 * from one focused item to another without returning to `idle`.
 */
export function enterGisFocus(
  prev: GisFocusState,
  input: EnterGisFocusInput
): GisFocusState {
  const originSnapshot =
    prev.status === "idle" ? input.captureSnapshot() : prev.originSnapshot;

  return {
    status: "focused",
    targetType: input.targetType,
    targetId: input.targetId,
    direction: input.direction ?? "FORWARD",
    showLinkedDetour: input.showLinkedDetour ?? false,
    linkedDetourId: input.linkedDetourId ?? null,
    fitRequestId: prev.fitRequestId + 1,
    originSnapshot,
  };
}

export function updateGisFocusOptions(
  prev: GisFocusState,
  patch: Partial<Pick<GisFocusState, "direction" | "showLinkedDetour" | "linkedDetourId">> & {
    refit?: boolean;
  }
): GisFocusState {
  if (prev.status !== "focused") return prev;
  return {
    ...prev,
    direction: patch.direction ?? prev.direction,
    showLinkedDetour: patch.showLinkedDetour ?? prev.showLinkedDetour,
    linkedDetourId:
      patch.linkedDetourId !== undefined ? patch.linkedDetourId : prev.linkedDetourId,
    fitRequestId: patch.refit ? prev.fitRequestId + 1 : prev.fitRequestId,
  };
}

export function exitGisFocus(prev: GisFocusState): {
  nextState: GisFocusState;
  restoreSnapshot: GisFocusOriginSnapshot | null;
} {
  return {
    nextState: {
      ...IDLE_GIS_FOCUS_STATE,
      fitRequestId: prev.fitRequestId,
    },
    restoreSnapshot: prev.status === "focused" ? prev.originSnapshot : null,
  };
}

export function isValidLonLat(coord: unknown): coord is LonLatCoord {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1]) &&
    (coord[0] !== 0 || coord[1] !== 0)
  );
}

/**
 * Resolves non-mutating `[lon, lat][]` geometry for a Detour in the requested direction.
 */
export function resolveDetourFocusGeometry(
  detour: DetourRoute | null | undefined,
  direction: GisFocusDirection
): {
  coords: LonLatCoord[];
  startCoord: LonLatCoord | null;
  endCoord: LonLatCoord | null;
  usedFallbackReverse: boolean;
} {
  if (!detour) {
    return { coords: [], startCoord: null, endCoord: null, usedFallbackReverse: false };
  }

  const fwd = parseRouteCoordinates(detour.coordinates_json).filter(isValidLonLat);
  const rev = parseRouteCoordinates(detour.reverse_coordinates_json).filter(isValidLonLat);

  let coords: LonLatCoord[] = [];
  let usedFallbackReverse = false;

  if (direction === "REVERSE") {
    if (rev.length >= 2) {
      coords = rev.map(([lon, lat]) => [lon, lat]);
    } else if (fwd.length >= 2) {
      coords = [...fwd].reverse().map(([lon, lat]) => [lon, lat]);
      usedFallbackReverse = true;
    } else if (rev.length === 1) {
      coords = [[rev[0][0], rev[0][1]]];
    } else if (fwd.length === 1) {
      coords = [[fwd[0][0], fwd[0][1]]];
    }
  } else {
    coords = fwd.map(([lon, lat]) => [lon, lat]);
  }

  const fallbackStart: LonLatCoord | null = isValidLonLat([detour.lon_start, detour.lat_start])
    ? [detour.lon_start, detour.lat_start]
    : null;
  const fallbackEnd: LonLatCoord | null = isValidLonLat([detour.lon_end, detour.lat_end])
    ? [detour.lon_end, detour.lat_end]
    : null;

  const startCoord =
    coords.length > 0
      ? coords[0]
      : direction === "REVERSE"
        ? fallbackEnd ?? fallbackStart
        : fallbackStart ?? fallbackEnd;

  const endCoord =
    coords.length > 1
      ? coords[coords.length - 1]
      : direction === "REVERSE"
        ? fallbackStart
        : fallbackEnd;

  return { coords, startCoord, endCoord, usedFallbackReverse };
}

/**
 * Checks if a flood segment is resolved / cleared (0 cm or inactive).
 */
export function isFloodSegmentResolved(flood: FloodRoute): boolean {
  if (flood.is_active === false) return true;
  if (typeof flood.water_level_cm === "number" && flood.water_level_cm <= 0) return true;
  return false;
}

export interface ResolvedFloodFocusData {
  primaryFlood: FloodRoute | null;
  segments: FloodRoute[];
  activeSegments: FloodRoute[];
  isResolved: boolean;
  maxWaterLevelCm: number;
  sideSummary: string | null;
  linkedDetours: DetourRoute[];
  coordsList: LonLatCoord[][];
  pointFallbacks: LonLatCoord[];
}

/**
 * Resolves all segments (including LT/RT multi-side siblings) and linked detours
 * for a focused flood event without mutating `systemData`.
 */
export function resolveFloodFocusData(
  targetId: string | null,
  systemData: SystemDataPayload
): ResolvedFloodFocusData {
  if (!targetId) {
    return {
      primaryFlood: null,
      segments: [],
      activeSegments: [],
      isResolved: false,
      maxWaterLevelCm: 0,
      sideSummary: null,
      linkedDetours: [],
      coordsList: [],
      pointFallbacks: [],
    };
  }

  const allFloods = systemData.floodRoutes || [];
  const primaryFlood = allFloods.find((f) => f.id === targetId) ?? null;
  if (!primaryFlood) {
    return {
      primaryFlood: null,
      segments: [],
      activeSegments: [],
      isResolved: false,
      maxWaterLevelCm: 0,
      sideSummary: null,
      linkedDetours: [],
      coordsList: [],
      pointFallbacks: [],
    };
  }

  const groupedEvents = groupFloodRoutesIntoEvents(allFloods);
  const matchingGroup = groupedEvents.find((ev) =>
    ev.segments.some((seg) => seg.id === targetId)
  );
  let segments = matchingGroup ? [...matchingGroup.segments] : [primaryFlood];
  if (segments.length <= 1) {
    const sameSpanSiblings = allFloods.filter(
      (f) =>
        f.route_no === primaryFlood.route_no &&
        f.section_name === primaryFlood.section_name &&
        f.km_start === primaryFlood.km_start &&
        f.km_end === primaryFlood.km_end
    );
    if (sameSpanSiblings.length > 1) {
      segments = sameSpanSiblings;
    }
  }
  const activeSegments = segments.filter((seg) => !isFloodSegmentResolved(seg));
  const isResolved = activeSegments.length === 0;

  const maxWaterLevelCm = segments.reduce(
    (max, seg) => Math.max(max, Number(seg.water_level_cm) || 0),
    0
  );

  const sideLabels = new Set<string>();
  segments.forEach((seg) => {
    const meta = parseFloodDirectionMeta(seg.direction_meta, seg);
    if (meta.impactMode === "BOTH_SIDES") {
      sideLabels.add("ทั้งสองฝั่ง (LT/RT)");
    } else if (meta.sideCode === "LT") {
      sideLabels.add("ฝั่งซ้ายทาง (LT)");
    } else if (meta.sideCode === "RT") {
      sideLabels.add("ฝั่งขวาทาง (RT)");
    }
  });
  const sideSummary = sideLabels.size > 0 ? Array.from(sideLabels).join(" · ") : null;

  const linkedDetours = getLinkedDetoursForFlood(
    primaryFlood,
    systemData
  ).map((entry) => entry.detour);

  const coordsList: LonLatCoord[][] = [];
  const pointFallbacks: LonLatCoord[] = [];
  const sourceSegments = isResolved ? segments : activeSegments;

  sourceSegments.forEach((seg) => {
    const coords = parseRouteCoordinates(seg.coordinates_json).filter(isValidLonLat);
    if (coords.length >= 2) {
      coordsList.push(coords);
    } else if (coords.length === 1) {
      pointFallbacks.push(coords[0]);
    } else if (isValidLonLat([seg.lon_start, seg.lat_start])) {
      pointFallbacks.push([seg.lon_start, seg.lat_start]);
    }
  });

  return {
    primaryFlood,
    segments,
    activeSegments,
    isResolved,
    maxWaterLevelCm,
    sideSummary,
    linkedDetours,
    coordsList,
    pointFallbacks,
  };
}

/**
 * Collects all valid `[lon, lat]` points from polylines and standalone points for `fitBounds`.
 */
export function collectFocusBoundsPoints(
  polylines: LonLatCoord[][],
  points: (LonLatCoord | null | undefined)[] = []
): LonLatCoord[] {
  const result: LonLatCoord[] = [];
  for (const line of polylines) {
    for (const pt of line) {
      if (isValidLonLat(pt)) result.push([pt[0], pt[1]]);
    }
  }
  for (const pt of points) {
    if (isValidLonLat(pt)) result.push([pt[0], pt[1]]);
  }
  return result;
}
