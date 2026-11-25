import {
  type DetourPointLocationSource,
  type DetourPointPhoto,
  SystemDataPayload,
} from "@/db/default-data";
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

export interface DetourPointPhotoLocationInput {
  lat?: number | string | null;
  lon?: number | string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  locationSource?: DetourPointLocationSource | null;
  resolvedAt?: string | null;
}

function parseValidPhotoCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAreaText(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "-") return undefined;
  return trimmed;
}

function normalizeLocationSource(
  value: unknown
): DetourPointLocationSource | undefined {
  if (value === "MAP" || value === "MANUAL" || value === "ROUTE_ENDPOINT") {
    return value;
  }
  return undefined;
}

function normalizeResolvedAt(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

export function hasDetourPointData(
  photo: DetourPointPhoto | null | undefined
): boolean {
  if (!photo) return false;
  const hasCoord =
    typeof photo.lat === "number" &&
    Number.isFinite(photo.lat) &&
    typeof photo.lon === "number" &&
    Number.isFinite(photo.lon) &&
    (photo.lat !== 0 || photo.lon !== 0);
  return Boolean(
    (typeof photo.url === "string" && photo.url.trim()) ||
      (typeof photo.caption === "string" && photo.caption.trim()) ||
      hasCoord ||
      normalizeAreaText(photo.subdistrict) ||
      normalizeAreaText(photo.district) ||
      normalizeAreaText(photo.province)
  );
}

export function buildDetourPointPhotoPayload(params: {
  url?: string | null;
  caption?: string;
  mediaId?: string;
  location?: DetourPointPhotoLocationInput | null;
  existingPhoto?: DetourPointPhoto;
}): DetourPointPhoto {
  const { url, caption, mediaId, location, existingPhoto } = params;
  const trimmedUrl = String(url ?? "").trim();
  const trimmedCaption = String(caption ?? "").trim();
  const resolvedMediaId = trimmedUrl
    ? mediaId ||
      (existingPhoto && existingPhoto.url === trimmedUrl
        ? existingPhoto.mediaId
        : undefined)
    : undefined;

  const hasExplicitLocation = location !== undefined;
  const rawLat = hasExplicitLocation ? location?.lat : existingPhoto?.lat;
  const rawLon = hasExplicitLocation ? location?.lon : existingPhoto?.lon;
  const parsedLat = parseValidPhotoCoord(rawLat);
  const parsedLon = parseValidPhotoCoord(rawLon);
  const hasValidCoord =
    parsedLat !== null &&
    parsedLon !== null &&
    Math.abs(parsedLat) <= 90 &&
    Math.abs(parsedLon) <= 180 &&
    (parsedLat !== 0 || parsedLon !== 0);

  const subdistrict = normalizeAreaText(
    hasExplicitLocation ? location?.subdistrict : existingPhoto?.subdistrict
  );
  const district = normalizeAreaText(
    hasExplicitLocation ? location?.district : existingPhoto?.district
  );
  const province = normalizeAreaText(
    hasExplicitLocation ? location?.province : existingPhoto?.province
  );
  const locationSource =
    (hasExplicitLocation
      ? normalizeLocationSource(location?.locationSource)
      : undefined) ?? normalizeLocationSource(existingPhoto?.locationSource);
  const explicitResolvedAt = hasExplicitLocation
    ? normalizeResolvedAt(location?.resolvedAt)
    : undefined;
  const preservedResolvedAt = normalizeResolvedAt(existingPhoto?.resolvedAt);
  const resolvedAt =
    explicitResolvedAt ??
    preservedResolvedAt ??
    (hasExplicitLocation && (hasValidCoord || subdistrict || district || province)
      ? new Date().toISOString()
      : undefined);

  return {
    ...(trimmedUrl ? { url: trimmedUrl } : {}),
    ...(trimmedCaption ? { caption: trimmedCaption } : {}),
    ...(resolvedMediaId ? { mediaId: resolvedMediaId } : {}),
    ...(hasValidCoord
      ? {
          lat: Number(parsedLat!.toFixed(6)),
          lon: Number(parsedLon!.toFixed(6)),
        }
      : {}),
    ...(subdistrict ? { subdistrict } : {}),
    ...(district ? { district } : {}),
    ...(province ? { province } : {}),
    ...(locationSource ? { locationSource } : {}),
    ...(resolvedAt ? { resolvedAt } : {}),
  };
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
  detourStartPhotoLocation?: DetourPointPhotoLocationInput | null;
  resolvedDetourEndPhotoUrl: string;
  detourEndPhotoCaption: string;
  detourEndPhotoLocation?: DetourPointPhotoLocationInput | null;
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
    detourStartPhotoLocation,
    resolvedDetourEndPhotoUrl,
    detourEndPhotoCaption,
    detourEndPhotoLocation,
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
  const startPointPhoto = buildDetourPointPhotoPayload({
    url: resolvedDetourStartPhotoUrl,
    caption: detourStartPhotoCaption,
    location: detourStartPhotoLocation,
    existingPhoto: existingMeta?.start_point_photo,
  });
  if (hasDetourPointData(startPointPhoto)) {
    nextMeta.start_point_photo = startPointPhoto;
  } else {
    delete nextMeta.start_point_photo;
  }

  const endPointPhoto = buildDetourPointPhotoPayload({
    url: resolvedDetourEndPhotoUrl,
    caption: detourEndPhotoCaption,
    location: detourEndPhotoLocation,
    existingPhoto: existingMeta?.end_point_photo,
  });
  if (hasDetourPointData(endPointPhoto)) {
    nextMeta.end_point_photo = endPointPhoto;
  } else {
    delete nextMeta.end_point_photo;
  }
  return nextMeta;
}

export function computeSlicedHighwayPolylines(params: {
  highwayLayers: SystemDataPayload["highwayLayers"];
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  roadSide: string;
  isSelectedHighwayDivided: boolean;
  directionCode: string;
}): { slicedForward: [number, number][]; slicedReverse: [number, number][] } {
  const {
    highwayLayers,
    routeNo,
    sectionName,
    kmStart,
    kmEnd,
    roadSide,
    isSelectedHighwayDivided,
    directionCode,
  } = params;

  const cleanRoute = String(routeNo).replace(/^ทล\.?/i, "").trim();
  const bestGroup = findBestHighwayGroupForSelection(highwayLayers, routeNo, sectionName, kmStart, kmEnd);

  let slicedForward: [number, number][] = [];
  let slicedReverse: [number, number][] = [];

  if (bestGroup) {
    const forwardBranch =
      bestGroup.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) ||
      bestGroup.primaryBranch;
    const reverseBranch = bestGroup.branches.find((b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2);

    if (roadSide === "BOTH" && isSelectedHighwayDivided) {
      if (forwardBranch && forwardBranch.coordinates.length >= 2) {
        slicedForward = sliceBranchByKmRange(forwardBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, false);
      }
      if (reverseBranch && reverseBranch.coordinates.length >= 2) {
        slicedReverse = sliceBranchByKmRange(reverseBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, true);
      } else if (slicedForward.length >= 2) {
        slicedReverse = [...slicedForward].reverse().map((p) => [...p] as [number, number]);
      }
    } else if (directionCode === "B_TO_A") {
      const chosenBranch = reverseBranch || bestGroup.primaryBranch;
      if (chosenBranch && chosenBranch.coordinates.length >= 2) {
        slicedForward = sliceBranchByKmRange(chosenBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, true);
      }
    } else {
      const chosenBranch = forwardBranch || bestGroup.primaryBranch;
      if (chosenBranch && chosenBranch.coordinates.length >= 2) {
        slicedForward = sliceBranchByKmRange(chosenBranch, forwardBranch, bestGroup.kmStart, bestGroup.kmEnd, kmStart, kmEnd, false);
      }
    }
  }

  // Fallback: search raw features if no grouped branch matched (prefer feature whose KM span covers target range)
  if (slicedForward.length < 2) {
    let targetCoords: [number, number][] = [];
    let secKmStart: string | number | null = null;
    let secKmEnd: string | number | null = null;
    const reqStartM = parseKmPostMeters(kmStart);
    const reqEndM = parseKmPostMeters(kmEnd);
    const reqMidM = reqStartM !== null && reqEndM !== null ? (reqStartM + reqEndM) / 2 : null;
    for (const layer of highwayLayers || []) {
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        for (const f of layer.geojson_data.features) {
          const props = f.properties || {};
          const fRoute = String(props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || "").replace(/^ทล\.?/i, "").trim();
          if (fRoute === cleanRoute && f.geometry?.coordinates?.length >= 2) {
            const fStartM = parseKmPostMeters(props.km_start);
            const fEndM = parseKmPostMeters(props.km_end);
            const coversRange = reqMidM !== null && fStartM !== null && fEndM !== null &&
              reqMidM >= Math.min(fStartM, fEndM) && reqMidM <= Math.max(fStartM, fEndM);
            if (targetCoords.length < 2 || coversRange) {
              targetCoords = f.geometry.coordinates;
              secKmStart = props.km_start || kmStart;
              secKmEnd = props.km_end || kmEnd;
              if (coversRange) break;
            }
          }
        }
      }
    }
    if (targetCoords.length >= 2) {
      slicedForward = slicePolylineByKmRange(targetCoords, secKmStart ?? kmStart, secKmEnd ?? kmEnd, kmStart, kmEnd, directionCode === "B_TO_A");
      if (roadSide === "BOTH" && isSelectedHighwayDivided && slicedForward.length >= 2) {
        slicedReverse = [...slicedForward].reverse().map((p) => [...p] as [number, number]);
      }
    }
  }

  return { slicedForward, slicedReverse };
}
