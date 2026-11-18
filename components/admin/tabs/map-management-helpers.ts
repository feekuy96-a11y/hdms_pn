import { SystemDataPayload } from "@/db/default-data";
import { slicePolylineByKmRange } from "@/lib/gis-utils";
import { AffectedShoulderType } from "@/lib/constants";
import {
  AffectedRoadPart,
  AFFECTED_ROAD_PART_LABELS,
  parseKmPostMeters,
} from "@/lib/flood-event-schema";
import {
  groupHighwayFeatures,
  cleanHighwaySectionName,
  haversineDistanceMeters,
  HighwaySectionGroup,
  HighwayBranchItem,
} from "@/lib/highway-schema";

export function parseCoordinatePair(value: string): [number, number] | null {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 2) return null;
  const [lat, lon] = numbers;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

export function calculateBearing(from: [number, number], to: [number, number]): number {
  const fromLat = (from[1] * Math.PI) / 180;
  const toLat = (to[1] * Math.PI) / 180;
  const deltaLon = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export function buildDetourRoutingParams(points: [number, number][], forceStraightThrough: boolean): string {
  const base = "overview=full&geometries=geojson";
  if (!forceStraightThrough || points.length < 3) return `${base}&alternatives=true`;
  const bearings = points
    .map((point, index) => {
      if (index === 0 || index === points.length - 1) return "";
      return `${calculateBearing(points[index - 1], points[index + 1])},45`;
    })
    .join(";");
  return `${base}&continue_straight=true&alternatives=false&bearings=${encodeURIComponent(bearings)}`;
}

export function findBestHighwayGroupForSelection(
  highwayLayers: SystemDataPayload["highwayLayers"] | undefined,
  routeNo: string,
  sectionName: string,
  kmStart: string,
  kmEnd: string
): HighwaySectionGroup | null {
  const cleanRoute = String(routeNo || "").replace(/^ทล\.?/i, "").trim();
  if (!cleanRoute) return null;
  const matchingGroups = groupHighwayFeatures(highwayLayers || []).filter((g) => g.routeNo === cleanRoute);
  if (matchingGroups.length === 0) return null;

  const cleanSec = cleanHighwaySectionName(sectionName);
  if (cleanSec) {
    const bySection = matchingGroups.find((g) => cleanHighwaySectionName(g.sectionName) === cleanSec);
    if (bySection) return bySection;
  }

  const tStartMeters = parseKmPostMeters(kmStart);
  const tEndMeters = parseKmPostMeters(kmEnd);
  if (tStartMeters !== null && tEndMeters !== null) {
    const targetMid = (tStartMeters + tEndMeters) / 2;
    let bestGroup = matchingGroups[0];
    let minDiff = Infinity;
    for (const g of matchingGroups) {
      const sMeters = parseKmPostMeters(g.kmStart);
      const eMeters = parseKmPostMeters(g.kmEnd);
      if (sMeters !== null && eMeters !== null) {
        const minKm = Math.min(sMeters, eMeters);
        const maxKm = Math.max(sMeters, eMeters);
        if (targetMid >= minKm && targetMid <= maxKm) return g;
        const diff = Math.min(Math.abs(targetMid - minKm), Math.abs(targetMid - maxKm));
        if (diff < minDiff) {
          minDiff = diff;
          bestGroup = g;
        }
      }
    }
    return bestGroup;
  }
  return matchingGroups[0];
}

export function sliceBranchByKmRange(
  branch: HighwayBranchItem,
  referenceForwardBranch: HighwayBranchItem | undefined,
  groupKmStart: string,
  groupKmEnd: string,
  targetKmStart: string,
  targetKmEnd: string,
  wantReverseOrder: boolean
): [number, number][] {
  let sourceCoords = branch.coordinates;
  const secStart = branch.properties?.km_start || groupKmStart;
  const secEnd = branch.properties?.km_end || groupKmEnd;
  if (
    branch.directionCode === "B_TO_A" &&
    referenceForwardBranch &&
    referenceForwardBranch.coordinates.length >= 2 &&
    sourceCoords.length >= 2
  ) {
    const fwdStart = referenceForwardBranch.coordinates[0];
    const fwdEnd = referenceForwardBranch.coordinates[referenceForwardBranch.coordinates.length - 1];
    const distToFwdStart = haversineDistanceMeters(sourceCoords[0], fwdStart);
    const distToFwdEnd = haversineDistanceMeters(sourceCoords[0], fwdEnd);
    const revPropsStart = parseKmPostMeters(secStart);
    const revPropsEnd = parseKmPostMeters(secEnd);
    if (revPropsStart !== null && revPropsEnd !== null && revPropsStart < revPropsEnd && distToFwdEnd < distToFwdStart) {
      sourceCoords = [...sourceCoords].reverse();
    }
  }
  return slicePolylineByKmRange(sourceCoords, secStart, secEnd, targetKmStart, targetKmEnd, wantReverseOrder);
}

export function buildAffectedPartSummary(parts: AffectedRoadPart[]): { lanesSummary: string; shoulderSummary: AffectedShoulderType } {
  const lanesSummary = parts.includes("ALL_LANES")
    ? "ทุกช่องจราจร"
    : parts.map((p) => AFFECTED_ROAD_PART_LABELS[p]).join(", ") || "ไม่ระบุ";
  const shoulderSummary = (parts.includes("LEFT_SHOULDER") && parts.includes("RIGHT_SHOULDER"))
    ? "BOTH"
    : parts.includes("LEFT_SHOULDER")
      ? "LEFT"
      : parts.includes("RIGHT_SHOULDER")
        ? "RIGHT"
        : "NONE";
  return { lanesSummary, shoulderSummary };
}

export interface BuildDetourMetaPayloadParams {
  routeEditId: string;
  detourRefId: string;
  linkedEventId?: string;
  detourRoutes: SystemDataPayload["detourRoutes"] | undefined;
  coords: [number, number][];
  draftReverseCoordinates: [number, number][];
  detourDirectionMode: string;
  detourDurationMinFwd: string;
  detourDurationMinRev: string;
  detourDistanceMeters: { forward: number; reverse: number };
  closedRoadConflictsCount: number;
  isSymmetricSingleLine: boolean;
  detourGoogleMapsUrlFwd: string;
  detourGoogleMapsUrlRev: string;
  detourRoadCondition: string;
  resolvedDetourStartPhotoUrl: string;
  detourStartPhotoCaption: string;
  resolvedDetourEndPhotoUrl: string;
  detourEndPhotoCaption: string;
  fwdPolyKm: number;
  revPolyKm: number;
}

export function buildDetourMetaPayload(params: BuildDetourMetaPayloadParams): Record<string, any> {
  const {
    routeEditId,
    detourRefId,
    linkedEventId,
    detourRoutes,
    detourDirectionMode,
    detourDurationMinFwd,
    detourDurationMinRev,
    detourDistanceMeters,
    closedRoadConflictsCount,
    isSymmetricSingleLine,
    detourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev,
    detourRoadCondition,
    resolvedDetourStartPhotoUrl,
    detourStartPhotoCaption,
    resolvedDetourEndPhotoUrl,
    detourEndPhotoCaption,
    fwdPolyKm,
    revPolyKm,
  } = params;

  const existingDetour = routeEditId ? (detourRoutes || []).find((d) => d.id === routeEditId) : undefined;
  const existingMeta = existingDetour?.detour_meta;

  const resolveOrderIndex = (): number => {
    if (detourRefId && existingMeta?.event_orders && typeof existingMeta.event_orders[detourRefId] === "number" && Number.isFinite(existingMeta.event_orders[detourRefId])) {
      return existingMeta.event_orders[detourRefId];
    }
    if (existingDetour && (existingDetour.flood_id_ref || "") === (detourRefId || "") && typeof existingMeta?.order_index === "number" && Number.isFinite(existingMeta.order_index)) {
      return existingMeta.order_index;
    }
    const siblings = (detourRoutes || []).filter(
      (d) =>
        d.id !== routeEditId &&
        ((detourRefId && d.flood_id_ref === detourRefId) ||
          (linkedEventId && d.detour_meta?.eventId === linkedEventId))
    );
    let maxOrder = 0;
    siblings.forEach((d, idx) => {
      const raw = (detourRefId && d.detour_meta?.event_orders?.[detourRefId]) ?? d.detour_meta?.order_index;
      const val = typeof raw === "number" && Number.isFinite(raw) ? raw : idx + 1;
      if (val > maxOrder) maxOrder = val;
    });
    return maxOrder + 1;
  };

  const orderIndex = resolveOrderIndex();
  const mergedEventOrders = {
    ...(existingMeta?.event_orders || {}),
    ...(detourRefId ? { [detourRefId]: orderIndex } : {}),
  };
  const parsedFwdMin = Number(detourDurationMinFwd);
  const parsedRevMin = Number(detourDurationMinRev);
  const hasFwdMin = Number.isFinite(parsedFwdMin) && parsedFwdMin > 0;
  const hasRevMin = Number.isFinite(parsedRevMin) && parsedRevMin > 0;

  const nextMeta: Record<string, any> = {
    ...(existingMeta || {}),
    order_index: typeof existingMeta?.order_index === "number" && (!detourRefId || existingDetour?.flood_id_ref === detourRefId)
      ? existingMeta.order_index
      : orderIndex,
    ...(Object.keys(mergedEventOrders).length > 0 ? { event_orders: mergedEventOrders } : {}),
    forward_distance_km: fwdPolyKm || undefined,
    reverse_distance_km: detourDirectionMode === "FORWARD_ONLY" ? undefined : (revPolyKm || undefined),
    forward_distance_m: fwdPolyKm > 0 ? Math.round(fwdPolyKm * 1000) : (detourDistanceMeters.forward || existingMeta?.forward_distance_m || undefined),
    reverse_distance_m: detourDirectionMode === "FORWARD_ONLY"
      ? undefined
      : revPolyKm > 0
        ? Math.round(revPolyKm * 1000)
        : (detourDistanceMeters.reverse || existingMeta?.reverse_distance_m || undefined),
    show_arrows: true,
    verified_no_closed_overlap: closedRoadConflictsCount === 0,
    carriageway_type: isSymmetricSingleLine ? "SINGLE_CENTERLINE" : "ASYMMETRIC_DETOUR",
    eventId: linkedEventId,
    ...(detourGoogleMapsUrlFwd.trim() ? { google_maps_url_forward: detourGoogleMapsUrlFwd.trim(), google_maps_url: detourGoogleMapsUrlFwd.trim() } : {}),
    ...(detourGoogleMapsUrlRev.trim() ? { google_maps_url_reverse: detourGoogleMapsUrlRev.trim() } : {}),
    ...(detourRoadCondition.trim() ? { road_condition: detourRoadCondition.trim() } : {}),
  };
  if (hasFwdMin) {
    nextMeta.forward_duration_min = Math.round(parsedFwdMin);
    nextMeta.forward_duration_s = Math.round(parsedFwdMin * 60);
  } else {
    delete nextMeta.forward_duration_min;
    delete nextMeta.forward_duration_s;
  }
  if (hasRevMin) {
    nextMeta.reverse_duration_min = Math.round(parsedRevMin);
    nextMeta.reverse_duration_s = Math.round(parsedRevMin * 60);
  } else {
    delete nextMeta.reverse_duration_min;
    delete nextMeta.reverse_duration_s;
  }
  if (resolvedDetourStartPhotoUrl) {
    nextMeta.start_point_photo = {
      url: resolvedDetourStartPhotoUrl,
      ...(detourStartPhotoCaption.trim() ? { caption: detourStartPhotoCaption.trim() } : {}),
    };
  } else {
    delete nextMeta.start_point_photo;
  }
  if (resolvedDetourEndPhotoUrl) {
    nextMeta.end_point_photo = {
      url: resolvedDetourEndPhotoUrl,
      ...(detourEndPhotoCaption.trim() ? { caption: detourEndPhotoCaption.trim() } : {}),
    };
  } else {
    delete nextMeta.end_point_photo;
  }
  return nextMeta;
}
