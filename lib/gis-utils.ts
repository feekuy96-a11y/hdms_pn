import { computeGoogleDetourRouteAction, type GoogleRouteStep } from "@/app/actions/doh-actions";
import { UTM_47N_PARAMS } from "./constants";
import { parseKmPostMeters } from "./highway-schema";
import { cleanThaiAdminPrefix, findPattaniDistrictName, isPointInPolygon, resolveArea, localArea } from "./area-lookup";
import { fetchOsrmWithFailover, getOsrmFailureHint } from "./osrm-client";
import { haversineDistanceKm, calculatePolylineLengthKm, calculateGeoBearing } from "./gis/geo-math";
import { extractFeaturesFromGeoJson, extractLinesFromGeoJson } from "./gis/gis-file-parser";
import { pointToSegmentDistanceMeters } from "./gis/conflict-detection";
export { cleanThaiAdminPrefix, findPattaniDistrictName, isPointInPolygon, localArea } from "./area-lookup";
export { haversineDistanceKm, calculatePolylineLengthKm, calculateGeoBearing };
export {
  type ExtractedGisFeature,
  extractFeaturesFromKmz,
  extractLinesFromKmz,
  extractFeaturesFromGeoJson,
  extractLinesFromGeoJson,
  extractFeaturesFromKml,
  extractLinesFromKml,
  extractAvailableGisFields,
  detectSmartFieldMapping,
} from "./gis/gis-file-parser";
export { compressImageToBase64, compressImageToAdaptiveBase64 } from "./gis/image-compress";
export {
  type ClosedRoadConflict,
  pointToSegmentDistanceMeters,
  detectClosedRoadConflicts,
  detectPassabilityFloodWarnings,
  analyzeCarriagewaySeparation,
} from "./gis/conflict-detection";

const GOOGLE_ROUTE_UNCONFIGURED_COOLDOWN_MS = 5 * 60 * 1000;
const GOOGLE_ROUTE_BREAKER_MS = 60 * 1000;
const GOOGLE_ROUTE_RATE_LIMIT_MS = 120 * 1000;
let googleRouteDownUntil = 0;
let googleRouteConfirmed = false;
let googleRouteProbePromise: Promise<void> | null = null;

export function resetGoogleRouteBreaker() {
  googleRouteDownUntil = 0;
  googleRouteConfirmed = false;
  googleRouteProbePromise = null;
}

/**
 * เธ–เธญเธ”เธฃเธซเธฑเธช Google Encoded Polyline (1e5) เน€เธเนเธเธเธดเธเธฑเธ” GeoJSON [lon, lat][]
 */
export function decodeGooglePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      if (index >= encoded.length) return points;
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push([Number((lon / 1e5).toFixed(6)), Number((lat / 1e5).toFixed(6))]);
  }
  return points;
}

export interface HybridGoogleRoute {
  coords: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  steps: GoogleRouteStep[];
}

export async function computeGoogleRouteHybrid(
  points: [number, number][],
  routingPreference: "TRAFFIC_UNAWARE" | "TRAFFIC_AWARE" = "TRAFFIC_UNAWARE"
): Promise<HybridGoogleRoute | null> {
  if (!points || points.length < 2) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    return null;
  }
  if (Date.now() < googleRouteDownUntil) return null;

  // Coalesce concurrent initial calls while Google configuration status is still unknown
  if (!googleRouteConfirmed && googleRouteProbePromise) {
    await googleRouteProbePromise;
    if (!googleRouteConfirmed || Date.now() < googleRouteDownUntil) return null;
  }

  let resolveProbe: (() => void) | null = null;
  if (!googleRouteConfirmed && !googleRouteProbePromise) {
    googleRouteProbePromise = new Promise<void>((resolve) => {
      resolveProbe = resolve;
    });
  }

  try {
    const intermediates = points.slice(1, -1).slice(0, 25);
    const res = await computeGoogleDetourRouteAction({
      origin: points[0],
      destination: points[points.length - 1],
      intermediates,
      routingPreference,
    });
    if (!res || !res.configured) {
      googleRouteConfirmed = false;
      googleRouteDownUntil = Date.now() + GOOGLE_ROUTE_UNCONFIGURED_COOLDOWN_MS;
      return null;
    }
    googleRouteConfirmed = true;
    if (!res.available) {
      googleRouteDownUntil = Date.now() + (res.status === 429 ? GOOGLE_ROUTE_RATE_LIMIT_MS : GOOGLE_ROUTE_BREAKER_MS);
      return null;
    }
    if (!res.found) return null;
    const coords = res.encodedPolyline ? decodeGooglePolyline(res.encodedPolyline) : [];
    return {
      coords,
      distanceMeters: res.distanceMeters || 0,
      durationSeconds: res.durationSeconds || 0,
      steps: Array.isArray(res.steps) ? res.steps : [],
    };
  } catch {
    googleRouteDownUntil = Date.now() + GOOGLE_ROUTE_BREAKER_MS;
    return null;
  } finally {
    if (resolveProbe) {
      googleRouteProbePromise = null;
      resolveProbe();
    }
  }
}

/**
 * เธเธฑเธ”เน€เธฅเธทเธญเธเธเธธเธ”เธซเธฑเธเน€เธฅเธตเนเธขเธงเธชเธณเธเธฑเธเธ•เธฒเธกเนเธเธงเน€เธชเนเธ (Douglas-Peucker importance) เนเธ”เธขเธเธเธฅเธณเธ”เธฑเธเธ•เนเธเธ—เธฒเธ โ’ เธเธฅเธฒเธขเธ—เธฒเธเนเธงเน
 */
export function selectRouteCornerWaypoints(
  coords: [number, number][],
  maxCount: number = 8
): [number, number][] {
  if (!coords || coords.length <= 2 || maxCount <= 0) return [];
  const clean: [number, number][] = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
    const prev = clean[clean.length - 1];
    if (!prev || Math.abs(prev[0] - pt[0]) > 1e-7 || Math.abs(prev[1] - pt[1]) > 1e-7) {
      clean.push([pt[0], pt[1]]);
    }
  }
  if (clean.length <= 2) return [];
  const innerCount = clean.length - 2;
  if (innerCount <= maxCount) {
    return clean.slice(1, -1);
  }

  const importance = new Array<number>(clean.length).fill(0);
  const scoreRange = (startIdx: number, endIdx: number) => {
    if (endIdx - startIdx <= 1) return;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const dist = perpendicularDistance(clean[i], clean[startIdx], clean[endIdx]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxIdx !== -1) {
      importance[maxIdx] = maxDist;
      if (maxDist > 1e-7) {
        scoreRange(startIdx, maxIdx);
        scoreRange(maxIdx, endIdx);
      }
    }
  };
  scoreRange(0, clean.length - 1);

  const significant = [];
  for (let i = 1; i < clean.length - 1; i++) {
    if (importance[i] >= 1e-6) {
      significant.push({ idx: i, score: importance[i] });
    }
  }

  let chosenIndices: number[];
  if (significant.length === 0) {
    // เธเธฃเธ“เธตเธเธธเธ”เน€เธฃเธตเธขเธเธ•เธฑเธงเน€เธเนเธเน€เธชเนเธเธ•เธฃเธเธ—เธฑเนเธเธซเธกเธ” เน€เธฅเธทเธญเธเธเธฃเธฐเธเธฒเธขเธ•เธฑเธงเธชเธกเนเธณเน€เธชเธกเธญเนเธกเนเน€เธเธดเธ maxCount เธเธธเธ”
    chosenIndices = [];
    const step = innerCount / (maxCount + 1);
    for (let i = 1; i <= maxCount; i++) {
      const idx = Math.min(1 + Math.floor(i * step), clean.length - 2);
      if (!chosenIndices.includes(idx)) chosenIndices.push(idx);
    }
  } else {
    significant.sort((a, b) => b.score - a.score);
    chosenIndices = significant.slice(0, maxCount).map((entry) => entry.idx).sort((a, b) => a - b);
  }

  return chosenIndices.map((idx) => clean[idx]);
}

/**
 * เนเธเธฅเธเธเธดเธเธฑเธ”เธ เธนเธกเธดเธจเธฒเธชเธ•เธฃเน (WGS84 Lat/Lon) เน€เธเนเธ UTM Zone 47N (EPSG:32647)
 * เนเธเนเธชเธนเธ•เธฃเนเธกเนเธเธขเธณเธ—เธฒเธเธ เธนเธกเธดเธกเธฒเธ•เธฃเธจเธฒเธชเธ•เธฃเนเธ•เธฒเธกเธกเธฒเธ•เธฃเธเธฒเธเธเธฃเธกเธ—เธฒเธเธซเธฅเธงเธ
 */
export function latLonToUtm47N(lat: number, lon: number): { easting: number; northing: number; formatted: string } {
  if (isNaN(lat) || isNaN(lon)) {
    return { easting: 0, northing: 0, formatted: "E --, N --" };
  }

  const { a, f, k0, lon0Rad } = UTM_47N_PARAMS;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);

  const phi = (lat * Math.PI) / 180.0;
  const lam = (lon * Math.PI) / 180.0;

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
  const T = Math.tan(phi) * Math.tan(phi);
  const C = ep2 * Math.cos(phi) * Math.cos(phi);
  const A = Math.cos(phi) * (lam - lon0Rad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256) * Math.sin(4 * phi));

  const easting = Math.round(500000 + k0 * N * (A + ((1 - T + C) * Math.pow(A, 3)) / 6));
  const northing = Math.round(
    k0 * (M + N * Math.tan(phi) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24))
  );

  return {
    easting,
    northing,
    formatted: `UTM Zone 47N: E ${easting.toLocaleString()}, N ${northing.toLocaleString()}`,
  };
}

/**
 * เธเธฑเธ”เธฃเธนเธเนเธเธเธงเธฑเธเธ—เธตเนเน€เธเนเธเธเธตเธเธธเธ—เธเธจเธฑเธเธฃเธฒเธ (เธ.เธจ.) เธ เธฒเธฉเธฒเนเธ—เธข
 */
export function formatThaiBuddhistDate(isoString: string | Date, includeTime = true): string {
  if (!isoString) return "-";
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return "-";

  const thaiMonths = [
    "เธก.เธ.", "เธ.เธ.", "เธกเธต.เธ.", "เน€เธก.เธข.", "เธ.เธ.", "เธกเธด.เธข.",
    "เธ.เธ.", "เธช.เธ.", "เธ.เธข.", "เธ•.เธ.", "เธ.เธข.", "เธ.เธ."
  ];

  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const yearBE = date.getFullYear() + 543;

  if (!includeTime) {
    return `${day} ${month} ${yearBE}`;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${yearBE} เน€เธงเธฅเธฒ ${hours}:${minutes} เธ.`;
}

/**
 * เธชเธเธฑเธ”เธเธดเธเธฑเธ” GPS เธเธฒเธเธ เธฒเธเธ–เนเธฒเธข EXIF metadata
 */
export async function extractExifGps(file: File): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const exifr = await import("exifr");
    const gps = await exifr.default.gps(file);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      return {
        latitude: Number(gps.latitude.toFixed(6)),
        longitude: Number(gps.longitude.toFixed(6)),
      };
    }
  } catch (err) {
    console.warn("EXIF GPS extraction failed:", err);
  }
  return null;
}

// fetchOsrmWithFailover now lives in ./osrm-client (cache, de-duplication, retry, spacing, circuit breaker).
// It is re-exported here so existing imports from "@/lib/gis-utils" keep working.
export { fetchOsrmWithFailover };

/**
 * เธ•เธฃเธงเธเธชเธญเธเธชเธ–เธฒเธเธฐเธเธฒเธฃเน€เธเธทเนเธญเธกเธ•เนเธญเธเธญเธ OSRM Routing Engines (Local & Public)
 */
export async function checkOsrmStatus(): Promise<{ localOnline: boolean; publicOnline: boolean }> {
  let localOnline = false;
  let publicOnline = false;

  const localBase = process.env.NEXT_PUBLIC_OSRM_LOCAL_URL;
  const testQuery = "101.18,6.86;101.25,6.87?overview=false";

  if (localBase) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 1000);
      const res = await fetch(`${localBase}/${testQuery}`, { signal: c.signal });
      clearTimeout(t);
      if (res.ok) localOnline = true;
    } catch {}
  }

  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2500);
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${testQuery}`, { signal: c.signal });
    clearTimeout(t);
    if (res.ok) publicOnline = true;
  } catch {}

  return { localOnline, publicOnline };
}
// isPointInPolygon, findPattaniDistrictName and cleanThaiAdminPrefix now live in ./area-lookup (re-exported below).

function formatHighwayLayerLabel(layerName: string, featureProps?: Record<string, any>): { code: string; label: string; name: string } {
  const propRouteNo = String(
    featureProps?.route_no || featureProps?.road_code || featureProps?.route_code || ""
  ).trim();
  const propName = String(
    featureProps?.route_name || featureProps?.section_na || featureProps?.section_name || ""
  ).trim();
  const layerFallback = (layerName || "").trim() || "เนเธเธฃเธเธเนเธฒเธขเธเธฃเธกเธ—เธฒเธเธซเธฅเธงเธ";
  const displayName = propName || layerFallback;
  const candidateCodeSource = propRouteNo || layerFallback;

  const ruralMatch = candidateCodeSource.match(/(?:เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ—\s*)?(เธเธ|เธขเธฅ|เธเธ|เธชเธ)\.?\s*(\d{3,5})/i);
  if (ruralMatch) {
    const code = `${ruralMatch[1]}.${ruralMatch[2]}`;
    return { code, label: `เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ— ${code} (${displayName})`, name: displayName };
  }
  const nationalMatch = candidateCodeSource.match(/(?:เธ—เธฅ\.?|เธ—เธฒเธเธซเธฅเธงเธ(?:เนเธเนเธเธ”เธดเธ)?(?:เธซเธกเธฒเธขเน€เธฅเธ)?\s*)?(\d{1,4})/);
  if (nationalMatch) {
    const code = nationalMatch[1];
    return { code, label: `เธ—เธฅ.${code} (${displayName})`, name: displayName };
  }
  return { code: "", label: displayName, name: displayName };
}

/**
 * เธเนเธเธซเธฒเธ–เธเธเธซเธฃเธทเธญเธ—เธฒเธเธซเธฅเธงเธเธ—เธตเนเนเธเธฅเนเธเธดเธเธฑเธ”เธ—เธตเนเธชเธธเธ”เธเธฒเธ Highway Layers เนเธ”เธขเธงเธฑเธ”เธฃเธฐเธขเธฐเธ•เธฑเนเธเธเธฒเธเธเธฑเธเนเธเธงเน€เธชเนเธเธเธฃเธดเธเนเธฅเธฐเธญเนเธฒเธเธฃเธซเธฑเธชเธชเธฒเธขเธ—เธฒเธเธเธฒเธ feature properties
 */
export function findNearestHighwayFromLayers(
  coord: [number, number],
  highwayLayers: any[] = [],
  maxDistKm: number = 0.035
): { code: string; name: string; label?: string } | null {
  if (!highwayLayers || highwayLayers.length === 0) return null;

  let closestDistKm = maxDistKm;
  let closest: { code: string; name: string; label?: string } | null = null;

  for (const layer of highwayLayers) {
    if (!layer.geojson_data) continue;
    const features = extractFeaturesFromGeoJson(layer.geojson_data);
    for (const feat of features) {
      const line = feat.coords;
      if (!line || line.length === 0) continue;
      if (line.length === 1) {
        const dKm = haversineDistanceKm(coord, line[0]);
        if (dKm < closestDistKm) {
          closestDistKm = dKm;
          closest = formatHighwayLayerLabel(layer.layer_name, feat.properties);
        }
        continue;
      }
      for (let i = 0; i < line.length - 1; i++) {
        const dKm = pointToSegmentDistanceMeters(coord, line[i], line[i + 1]) / 1000;
        if (dKm < closestDistKm) {
          closestDistKm = dKm;
          closest = formatHighwayLayerLabel(layer.layer_name, feat.properties);
        }
      }
    }
  }

  return closest;
}

/** เธเธทเนเธญเธเธทเนเธเธ—เธตเนเธชเธณเธซเธฃเธฑเธเนเธชเธ”เธเนเธเธเนเธญเธเธงเธฒเธก เน€เธเนเธ "(เธ.เธเนเธฒเธเธ”เธญเธเธฃเธฑเธ เธ•.เธฃเธนเธชเธฐเธกเธดเนเธฅ เธญ.เน€เธกเธทเธญเธเธเธฑเธ•เธ•เธฒเธเธต)" */
function formatAreaTag(area: { village: string; tambon: string; amphoe: string }): string {
  const parts: string[] = [];
  if (area.village) parts.push(area.village.startsWith("เธเนเธฒเธ") ? area.village : `เธ.${area.village}`);
  if (area.tambon) parts.push(`เธ•.${area.tambon}`);
  parts.push(`เธญ.${area.amphoe || "เน€เธกเธทเธญเธเธเธฑเธ•เธ•เธฒเธเธต"}`);
  return `(${parts.join(" ")})`;
}

/**
 * เธ”เธถเธเธเธทเนเธญเธซเธกเธนเนเธเนเธฒเธ (เธ.), เธ•เธณเธเธฅ (เธ•.), เธญเธณเน€เธ เธญ (เธญ.) เนเธฅเธฐเธเธทเนเธญเธ–เธเธเธเธฒเธเธเธดเธเธฑเธ”
 * เนเธเนเธ•เธฑเธงเธ”เธถเธเธเนเธญเธกเธนเธฅเธเธทเนเธเธ—เธตเนเธเธฅเธฒเธ (lib/area-lookup.ts): เนเธเธ, เธเธณเธเธฑเธ”เธญเธฑเธ•เธฃเธฒเน€เธฃเธตเธขเธ, เนเธเนเธเนเธญเธกเธนเธฅเธ เธฒเธขเนเธเน€เธกเธทเนเธญเธญเธญเธเนเธฅเธเน
 * needRoad = true เน€เธกเธทเนเธญเธ•เนเธญเธเธเธฒเธฃเธเธทเนเธญเธ–เธเธเธเธญเธเธเธธเธ”เธเธตเนเธเธฃเธดเธ เน (เธ–เนเธฒเนเธกเนเธ•เนเธญเธเธเธฒเธฃ เธเธฐเนเธเนเธเธณเธ•เธญเธเธเธญเธเธเธธเธ”เธ—เธตเนเธญเธขเธนเนเนเธเธฅเนเธ เธฒเธขเนเธ 150 เธก.)
 */
export async function getDetailedPattaniAddress(
  lon: number,
  lat: number,
  options: { needRoad?: boolean } = {}
): Promise<{ tag: string; road: string; tambon: string; amphoe: string; confidence: "high" | "medium" | "low" }> {
  const area = await resolveArea(lon, lat, options);
  return {
    tag: formatAreaTag(area),
    road: area.road,
    tambon: area.tambon,
    amphoe: area.amphoe,
    confidence: area.confidence,
  };
}

/** เธชเนเธงเธเธซเธฑเธงเธเธญเธเนเธ•เนเธฅเธฐเธ—เธดเธจเธ—เธฒเธ เน€เธเนเธ "=== เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” A โ’ เธเธธเธ” B (เธ•.เธฃเธนเธชเธฐเธกเธดเนเธฅ เธญ.เน€เธกเธทเธญเธเธเธฑเธ•เธ•เธฒเธเธต โ’ เธ•.เธเธฒเธเธฒ เธญ.เน€เธกเธทเธญเธเธเธฑเธ•เธ•เธฒเธเธต) ===" */
function formatDirectionHeader(
  label: string,
  startAddr: { tambon: string; amphoe: string },
  endAddr: { tambon: string; amphoe: string }
): string {
  const place = (addr: { tambon: string; amphoe: string }) =>
    `${addr.tambon ? `เธ•.${addr.tambon} ` : ""}เธญ.${addr.amphoe || "เน€เธกเธทเธญเธเธเธฑเธ•เธ•เธฒเธเธต"}`;
  return `=== ${label} (${place(startAddr)} โ’ ${place(endAddr)}) ===`;
}

/**
 * เนเธขเธเธเธณเนเธเธฐเธเธณเนเธเธ เน’ เธ—เธดเธจเธ—เธฒเธ (เธเธฒเนเธ A -> B เนเธฅเธฐ เธเธฒเธเธฅเธฑเธ B -> A)
 * เนเธเนเธชเนเธงเธเธซเธฑเธง "=== เธ—เธดเธจเธ—เธฒเธ... ===" เธญเธฑเธเนเธฃเธเน€เธเนเธเธเธฒเนเธ เนเธฅเธฐเธญเธฑเธเธ—เธตเนเธชเธญเธเน€เธเนเธเธเธฒเธเธฅเธฑเธ (เนเธกเนเธชเธเธงเนเธฒเธชเธฐเธเธ”เธเธณเธงเนเธฒเธเธฒเนเธ/เธเธฒเธเธฅเธฑเธเธ–เธนเธเธซเธฃเธทเธญเนเธกเน)
 * เนเธฅเธฐเธเธทเธเธชเนเธงเธเธซเธฑเธงเน€เธ”เธดเธกเธกเธฒเธ”เนเธงเธข เน€เธเธทเนเธญเนเธกเนเนเธซเนเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธ•เธณเธเธฅ/เธญเธณเน€เธ เธญเนเธเธซเธฑเธงเธเนเธญเธซเธฒเธขเนเธเน€เธกเธทเนเธญเนเธเนเธเนเธญเธเธงเธฒเธก
 */
export function extractDirectionalAdvice(text: string): {
  forward: string;
  reverse: string;
  hasBoth: boolean;
  forwardHeader: string;
  reverseHeader: string;
} {
  if (!text) return { forward: "", reverse: "", hasBoth: false, forwardHeader: "", reverseHeader: "" };

  const headers = Array.from(text.matchAll(/===\s*เธ—เธดเธจเธ—เธฒเธ[^=\n]*===/g));
  if (headers.length >= 2) {
    const [first, second] = headers;
    const third = headers[2];
    const firstEnd = (first.index ?? 0) + first[0].length;
    const secondStart = second.index ?? 0;
    const secondEnd = secondStart + second[0].length;
    return {
      forward: text.slice(firstEnd, secondStart).trim(),
      reverse: text.slice(secondEnd, third ? third.index : undefined).trim(),
      hasBoth: true,
      forwardHeader: first[0],
      reverseHeader: second[0],
    };
  }

  return {
    forward: text.trim(),
    reverse: text.trim(),
    hasBoth: false,
    forwardHeader: "",
    reverseHeader: "",
  };
}

/**
 * Extract directional advice sections for interactive editing WITHOUT stripping trailing spaces or newlines.
 */
export function extractDirectionalAdviceForEdit(text: string): {
  forward: string;
  reverse: string;
  hasBoth: boolean;
  forwardHeader: string;
  reverseHeader: string;
} {
  if (!text) return { forward: "", reverse: "", hasBoth: false, forwardHeader: "", reverseHeader: "" };

  const headers = Array.from(text.matchAll(/===\s*เธ—เธดเธจเธ—เธฒเธ[^=\n]*===/g));
  if (headers.length >= 2) {
    const [first, second] = headers;
    const third = headers[2];
    const firstEnd = (first.index ?? 0) + first[0].length;
    const secondStart = second.index ?? 0;
    const secondEnd = secondStart + second[0].length;
    return {
      forward: text.slice(firstEnd, secondStart).replace(/^\r?\n/, "").replace(/\r?\n\r?\n$/, ""),
      reverse: text.slice(secondEnd, third ? third.index : undefined).replace(/^\r?\n/, ""),
      hasBoth: true,
      forwardHeader: first[0],
      reverseHeader: second[0],
    };
  }

  return {
    forward: text,
    reverse: "",
    hasBoth: false,
    forwardHeader: "",
    reverseHeader: "",
  };
}

/** Compose directional advice string from forward & reverse sections. */
export function composeDirectionalAdvice(
  forwardHeader: string,
  forwardText: string,
  reverseHeader: string,
  reverseText: string
): string {
  const fwdH = forwardHeader || "=== เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” A โ’ เธเธธเธ” B ===";
  const revH = reverseHeader || "=== เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ: เธเธธเธ” B โ’ เธเธธเธ” A ===";
  return `${fwdH}\n${forwardText}\n\n${revH}\n${reverseText}`;
}

export function formatHighwayOrRuralPrefix(rawNo?: string, fallbackStr: string = "เธเธธเธ”เธ•เธฑเธ”เธ—เธฒเธเธซเธฅเธงเธ"): string {
  const ref = (rawNo || "").trim();
  if (!ref) return fallbackStr;
  if (/^(เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ—|เธ—เธ\.)/i.test(ref)) {
    return ref;
  }
  if (/^(เธเธ|เธขเธฅ|เธเธ|เธชเธ)\.?\s*\d+/i.test(ref)) {
    return `เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ— ${ref.replace(/\s+/g, "")}`;
  }
  if (/^เธ—เธฅ\.\s*/i.test(ref)) {
    return ref;
  }
  if (/^\d+$/.test(ref)) {
    return `เธ—เธฅ.${ref}`;
  }
  return ref;
}

function formatRefRoadPrefix(rawRef: string | undefined, fallbackStr: string): string {
  return formatHighwayOrRuralPrefix(rawRef, fallbackStr);
}

/**
 * เธชเธเธฑเธ”เธเธฑเธเธเนเธเธฑเธเธชเธฃเนเธฒเธเธเธณเนเธเธฐเธเธณเน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธชเธณเธซเธฃเธฑเธ เน‘ เธ—เธดเธจเธ—เธฒเธ (Google Routes API เธเนเธญเธ เนเธฅเนเธง Fallback เนเธ OSRM / เน€เธชเนเธเธ•เธฃเธ)
 */
async function buildSingleDirectionAdvice(
  queryPoints: [number, number][],
  label: string,
  relatedHighwayNo?: string,
  highwayLayers: any[] = []
): Promise<string> {
  const startPt = queryPoints[0];
  const endPt = queryPoints[queryPoints.length - 1];
  const startAddr = await getDetailedPattaniAddress(startPt[0], startPt[1], { needRoad: true });
  const endAddr = await getDetailedPattaniAddress(endPt[0], endPt[1], { needRoad: true });
  const startHwyStr = relatedHighwayNo ? formatHighwayOrRuralPrefix(relatedHighwayNo) : (startAddr.road || "เธเธธเธ”เธ•เธฑเธ”เธ—เธฒเธเธซเธฅเธงเธ");
  const endHwyStr = relatedHighwayNo ? `${formatHighwayOrRuralPrefix(relatedHighwayNo)} ` : (endAddr.road ? `${endAddr.road} ` : "");
  const dirHeader = formatDirectionHeader(label, startAddr, endAddr);

  // Tier 1: Google Maps Routes API (through secure Edge proxy)
  const googleRoute = await computeGoogleRouteHybrid(queryPoints, "TRAFFIC_UNAWARE");
  if (googleRoute && googleRoute.steps.length > 0) {
    const lines: string[] = [dirHeader];
    let stepCounter = 1;
    lines.push(`${stepCounter++}. เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ: เธเธฃเธดเน€เธงเธ“ ${startAddr.road || startHwyStr} ${startAddr.tag}`);

    for (let idx = 0; idx < googleRoute.steps.length; idx++) {
      const step = googleRoute.steps[idx];
      const cleanInstr = (step.instructions || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!cleanInstr) continue;
      if (idx === 0 && step.distanceMeters < 15) continue;
      const distStr = step.distanceMeters >= 1000
        ? `${(step.distanceMeters / 1000).toFixed(1)} เธเธก.`
        : `${Math.round(step.distanceMeters)} เธก.`;
      lines.push(`${stepCounter++}. ${cleanInstr}${step.distanceMeters > 0 ? ` (เธฃเธฐเธขเธฐเธ—เธฒเธ ${distStr})` : ""}`);
    }

    lines.push(`${stepCounter++}. เธเธธเธ”เธชเธดเนเธเธชเธธเธ”: เธ–เธถเธเธเธธเธ”เธเธฃเธฃเธเธเธ—เธฒเธเธซเธฅเธงเธเธชเธฒเธขเธซเธฅเธฑเธ ${endHwyStr}${endAddr.tag} เธชเธฑเธเธเธฃเธ•เนเธญเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`);
    const totalKm = ((googleRoute.distanceMeters || calculatePolylineLengthKm(queryPoints) * 1000) / 1000).toFixed(1);
    const estMinutes = Math.max(1, Math.round((googleRoute.durationSeconds || Number(totalKm) * 90) / 60));
    lines.push(`- เธฃเธงเธกเธฃเธฐเธขเธฐเธ—เธฒเธเน€เธฅเธตเนเธขเธ: ${totalKm} เธเธก.`);
    lines.push(`- เธฃเธฐเธขเธฐเน€เธงเธฅเธฒเน€เธ”เธดเธเธ—เธฒเธ: เธเธฃเธฐเธกเธฒเธ“ ${estMinutes} เธเธฒเธ—เธต`);
    lines.push(`- เธชเธ เธฒเธเน€เธชเนเธเธ—เธฒเธ: เธเธดเธงเธ—เธฒเธเธฅเธฒเธ”เธขเธฒเธ เธฃเธ–เธขเธเธ•เนเธ—เธธเธเธเธเธดเธ”เธชเธฒเธกเธฒเธฃเธ–เธชเธฑเธเธเธฃเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`);
    return lines.join("\n");
  }

  // Tier 2: Hardened OSRM Fallback
  let osrmSteps: any[] = [];
  let totalDistanceM = 0;
  let totalDurationS = 0;

  const coordString = queryPoints.map((p) => `${p[0]},${p[1]}`).join(";");
  const osrmResult = await fetchOsrmWithFailover(coordString, "overview=full&geometries=geojson&steps=true");

  if (osrmResult?.data?.routes?.[0]) {
    const route = osrmResult.data.routes[0];
    totalDistanceM = route.distance || 0;
    totalDurationS = route.duration || 0;
    osrmSteps = (route.legs || []).flatMap((l: any) => l.steps || []);
  }

  if (osrmSteps.length > 0) {
    const rawTurnInstructions: {
      action: string;
      road: string;
      distanceM: number;
      loc: [number, number];
    }[] = [];

    for (let idx = 0; idx < osrmSteps.length; idx++) {
      const s = osrmSteps[idx];
      const isFirst = idx === 0;
      const isLast = idx === osrmSteps.length - 1;
      const mType = s.maneuver?.type || "";
      const mMod = s.maneuver?.modifier || "";

      if (!isFirst && mType === "depart" && s.distance < 35) continue;
      if (!isLast && mType === "arrive") continue;
      if (!isFirst && !isLast && s.distance < 20 && (mType === "new name" || mType === "notification")) {
        continue;
      }
      // เธเนเธฒเธก micro-maneuvers (< 30 เธก.) เธ—เธตเนเน€เธเนเธเน€เธเธตเธขเธเธ—เธฒเธเนเธเนเธเธซเธฃเธทเธญเธเธฃเธฑเธเธฃเธฐเธ”เธฑเธเธเธดเธงเธ—เธฒเธ เนเธกเนเนเธเนเธเธฒเธฃเน€เธเธฅเธตเนเธขเธเธชเธฒเธขเธ—เธฒเธเธเธฃเธดเธ
      if (!isFirst && !isLast && s.distance < 30 && mType === "continue") continue;
      if (!isFirst && !isLast && s.distance < 25 && mType === "turn" && (mMod === "slight left" || mMod === "slight right") && !s.name && !s.ref) {
        continue;
      }

      // เธเธณเธเธงเธ“เธเธดเธเธฑเธ” Lookahead เธ–เธฑเธ”เธเธฒเธเธเธธเธ”เธ—เธฒเธเนเธขเธ 25-50 เธก. เธ•เธฒเธกเนเธเธงเธชเธฒเธขเธ—เธฒเธเธ—เธตเนเธเธณเธฅเธฑเธเน€เธฅเธตเนเธขเธงเน€เธเนเธฒเนเธ
      // เน€เธเธทเนเธญเธเนเธญเธเธเธฑเธเนเธกเนเนเธซเนเธเธฒเธฃเธเนเธเธซเธฒเธ—เธฒเธเธซเธฅเธงเธเธเธฑเธเธเธนเนเนเธ”เธเธ—เธฒเธเธซเธฅเธงเธเธชเธฒเธขเธซเธฅเธฑเธเน€เธ”เธดเธก เธ“ เธเธธเธ”เธขเธญเธ”เธ—เธฒเธเนเธขเธ
      const stepCoords: [number, number][] = Array.isArray(s.geometry?.coordinates) ? s.geometry.coordinates : [];
      let lookaheadLoc: [number, number] = s.maneuver?.location || startPt;
      if (stepCoords.length >= 2) {
        const origin = stepCoords[0];
        let chosen = stepCoords[stepCoords.length - 1];
        for (let cIdx = 1; cIdx < stepCoords.length; cIdx++) {
          const distKm = haversineDistanceKm(origin, stepCoords[cIdx]);
          if (distKm >= 0.025) {
            chosen = stepCoords[cIdx];
            break;
          }
        }
        lookaheadLoc = chosen;
      }

      let action = "เธ•เธฃเธเนเธเธ•เธฒเธก";

      if (isFirst) {
        action = "เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ:";
      } else if (mType === "depart") {
        // เธเธฑเนเธเธ•เธญเธ depart เธเธญเธ leg เธ–เธฑเธ”เนเธ (เธเธฒเธ waypoint เธเธฅเธฒเธเน€เธชเนเธเธ—เธฒเธ) เธเธทเธญเธเธฒเธฃเธเธฑเธเธ•เธฃเธเธ•เนเธญเน€เธเธทเนเธญเธเธเธเธเนเธงเธเธ–เธเธเธเธฑเนเธ
        action = "เธ•เธฃเธเนเธเธ•เธฒเธก";
      } else if (isLast || mType === "arrive") {
        action = "เธ–เธถเธเธเธธเธ”เธเธฃเธฃเธเธเธ—เธฒเธเธซเธฅเธงเธเธชเธฒเธขเธซเธฅเธฑเธ:";
      } else if (mType === "roundabout" || mType === "rotary") {
        const exitNumber = Number(s.maneuver.exit);
        if (Number.isInteger(exitNumber) && exitNumber > 0) {
          action = `เน€เธกเธทเนเธญเธ–เธถเธเธงเธเน€เธงเธตเธขเธ เนเธซเนเนเธเนเธ—เธฒเธเธญเธญเธเธ—เธตเน ${exitNumber} เธกเธธเนเธเธซเธเนเธฒเธชเธนเน`;
        } else if (mMod.includes("left")) {
          action = "เน€เธฅเธตเนเธขเธงเธเนเธฒเธขเธเนเธฒเธเธงเธเน€เธงเธตเธขเธเธกเธธเนเธเธซเธเนเธฒเธชเธนเน";
        } else if (mMod.includes("right")) {
          action = "เน€เธฅเธตเนเธขเธงเธเธงเธฒเธเนเธฒเธเธงเธเน€เธงเธตเธขเธเธกเธธเนเธเธซเธเนเธฒเธชเธนเน";
        } else if (mMod.includes("straight")) {
          action = "เธ•เธฃเธเนเธเธเนเธฒเธเธงเธเน€เธงเธตเธขเธเธกเธธเนเธเธซเธเนเธฒเธชเธนเน";
        } else {
          action = "เน€เธเนเธฒเธชเธนเนเธงเธเน€เธงเธตเธขเธ (เน€เธฅเธตเนเธขเธงเธเนเธฒเธข) เธกเธธเนเธเธซเธเนเธฒเธชเธนเน";
        }
      } else if (mType === "end of road") {
        if (mMod.includes("left")) action = "เธชเธธเธ”เธ—เธฒเธ เน€เธฅเธตเนเธขเธงเธเนเธฒเธขเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("right")) action = "เธชเธธเธ”เธ—เธฒเธ เน€เธฅเธตเนเธขเธงเธเธงเธฒเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("uturn")) action = "เธชเธธเธ”เธ—เธฒเธ เธเธฅเธฑเธเธฃเธ–เน€เธเนเธฒเธชเธนเน";
        else action = "เธชเธธเธ”เธ—เธฒเธ เธกเธธเนเธเธซเธเนเธฒเน€เธเนเธฒเธชเธนเน";
      } else if (mType === "turn") {
        if (mMod.includes("slight left")) action = "เน€เธเธตเนเธขเธเธเนเธฒเธขเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("sharp left")) action = "เน€เธฅเธตเนเธขเธงเธเนเธฒเธขเธซเธฑเธเธจเธญเธเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("left")) action = "เน€เธฅเธตเนเธขเธงเธเนเธฒเธขเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("slight right")) action = "เน€เธเธตเนเธขเธเธเธงเธฒเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("sharp right")) action = "เน€เธฅเธตเนเธขเธงเธเธงเธฒเธซเธฑเธเธจเธญเธเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("right")) action = "เน€เธฅเธตเนเธขเธงเธเธงเธฒเน€เธเนเธฒเธชเธนเน";
        else if (mMod.includes("uturn")) action = "เธเธฅเธฑเธเธฃเธ–เน€เธเนเธฒเธชเธนเน";
        else action = "เน€เธฅเธตเนเธขเธงเน€เธเนเธฒเธชเธนเน";
      } else if (mType === "continue") {
        if (mMod.includes("slight left")) action = "เน€เธเธตเนเธขเธเธเนเธฒเธขเธ•เธฒเธก";
        else if (mMod.includes("left")) action = "เน€เธฅเธตเนเธขเธงเธเนเธฒเธขเนเธเธ•เธฒเธก";
        else if (mMod.includes("slight right")) action = "เน€เธเธตเนเธขเธเธเธงเธฒเธ•เธฒเธก";
        else if (mMod.includes("right")) action = "เน€เธฅเธตเนเธขเธงเธเธงเธฒเนเธเธ•เธฒเธก";
        else if (mMod.includes("uturn")) action = "เธเธฅเธฑเธเธฃเธ–เนเธเธ•เธฒเธก";
        else action = "เธ•เธฃเธเนเธเธ•เนเธญเน€เธเธทเนเธญเธเธ•เธฒเธก";
      } else if (mType === "off ramp") {
        action = mMod.includes("left") ? "เนเธเนเธ—เธฒเธเธญเธญเธเธเนเธฒเธขเน€เธเนเธฒเธชเธนเน" : "เนเธเนเธ—เธฒเธเธญเธญเธเธเธงเธฒเน€เธเนเธฒเธชเธนเน";
      } else if (mType === "merge" || mType === "on ramp" || mType === "fork") {
        action = mMod.includes("right") ? "เน€เธเธตเนเธขเธเธเธงเธฒเน€เธเนเธฒเธชเธนเน" : "เน€เธเธตเนเธขเธเธเนเธฒเธขเน€เธเนเธฒเธชเธนเน";
      } else if (mType === "new name") {
        action = "เธ•เธฃเธเนเธเธ•เธฒเธก";
      }

      const roadName = (s.name || "").trim();
      let refStr = (s.ref || "").trim();

      if (refStr) {
        refStr = formatHighwayOrRuralPrefix(refStr);
      }

      let fullRoad = "";
      if (roadName && refStr) {
        fullRoad = /^เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ—\s/.test(refStr)
          ? `${roadName} ${refStr.replace(/^เธ—เธฒเธเธซเธฅเธงเธเธเธเธเธ—\s+/, "")}`
          : `${roadName} (${refStr})`;
      } else if (refStr) {
        fullRoad = refStr;
      } else if (roadName) {
        fullRoad = roadName;
      } else {
        if (lookaheadLoc && highwayLayers.length > 0) {
          const nearest = findNearestHighwayFromLayers(lookaheadLoc, highwayLayers, 0.035);
          if (nearest) {
            fullRoad = nearest.label || nearest.name;
          }
        }
        if (!fullRoad) {
          const locArea = await localArea(lookaheadLoc[0], lookaheadLoc[1]);
          if (locArea.tambon && locArea.amphoe) {
            fullRoad = `เน€เธชเนเธเธ—เธฒเธเน€เธเธทเนเธญเธกเธ•เนเธญเธ—เนเธญเธเธ–เธดเนเธ (เธ•.${locArea.tambon} เธญ.${locArea.amphoe})`;
          } else {
            fullRoad = "เน€เธชเนเธเธ—เธฒเธเน€เธเธทเนเธญเธกเธ•เนเธญเธ—เนเธญเธเธ–เธดเนเธ";
          }
        }
      }

      rawTurnInstructions.push({
        action,
        road: fullRoad,
        distanceM: s.distance,
        loc: lookaheadLoc,
      });
    }

    // เธฃเธงเธกเธเธฑเนเธเธ•เธญเธเธ—เธตเนเธ•เนเธญเน€เธเธทเนเธญเธเธเธเธ–เธเธเน€เธ”เธตเธขเธงเธเธฑเธ
    const consolidated: {
      action: string;
      road: string;
      distanceM: number;
      loc: [number, number];
    }[] = [];

    rawTurnInstructions.forEach((step) => {
      const prev = consolidated[consolidated.length - 1];
      if (
        prev &&
        prev.road === step.road &&
        step.action.startsWith("เธ•เธฃเธเนเธ") &&
        prev.action.startsWith("เธ•เธฃเธเนเธ")
      ) {
        prev.distanceM += step.distanceM;
      } else {
        consolidated.push({ ...step });
      }
    });

    const lines: string[] = [dirHeader];

    const totalKm = (totalDistanceM / 1000).toFixed(1);
    const estMinutes = Math.max(2, Math.ceil(totalDurationS / 60));

    let stepCounter = 1;
    // Step 1: เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ
    const initHwy = formatRefRoadPrefix(osrmSteps[0]?.ref, startHwyStr);
    lines.push(`${stepCounter++}. เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ: เธเธฃเธดเน€เธงเธ“ ${initHwy} ${startAddr.tag}`);

    // Steps เธเธฅเธฒเธ: เธเธธเธ”เน€เธฅเธตเนเธขเธงเนเธฅเธฐเธ–เธเธเธเธฃเธดเธ
    for (const step of consolidated) {
      if (step.action.includes("เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ") || step.action.includes("เธเธธเธ”เธเธฃเธฃเธเธ")) continue;
      if (step.distanceM < 35 && !/(เน€เธฅเธตเนเธขเธง|เน€เธเธตเนเธขเธ|เธเธฅเธฑเธเธฃเธ–|เธงเธเน€เธงเธตเธขเธ|เธชเธธเธ”เธ—เธฒเธ|เธ—เธฒเธเธญเธญเธ)/.test(step.action)) continue;

      const distStr = step.distanceM >= 1000 ? `${(step.distanceM / 1000).toFixed(1)} เธเธก.` : `${Math.round(step.distanceM)} เธก.`;
      const isLocalRoute = step.road.startsWith("เน€เธชเนเธเธ—เธฒเธเน€เธเธทเนเธญเธกเธ•เนเธญเธ—เนเธญเธเธ–เธดเนเธ");
      const stepAddr = await getDetailedPattaniAddress(step.loc[0], step.loc[1], {
        needRoad: isLocalRoute,
      });
      let roadName = step.road;
      if (isLocalRoute && stepAddr.road) {
        roadName = stepAddr.road;
      }
      lines.push(`${stepCounter++}. ${step.action} ${roadName} (เธฃเธฐเธขเธฐเธ—เธฒเธ ${distStr})`);
    }

    // Step เธชเธธเธ”เธ—เนเธฒเธข: เธ–เธถเธเธเธธเธ”เธซเธกเธฒเธข
    lines.push(`${stepCounter++}. เธเธธเธ”เธชเธดเนเธเธชเธธเธ”: เธ–เธถเธเธเธธเธ”เธเธฃเธฃเธเธเธ—เธฒเธเธซเธฅเธงเธเธชเธฒเธขเธซเธฅเธฑเธ ${endHwyStr}${endAddr.tag} เธชเธฑเธเธเธฃเธ•เนเธญเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`);
    lines.push(`- เธฃเธงเธกเธฃเธฐเธขเธฐเธ—เธฒเธเน€เธฅเธตเนเธขเธ: ${totalKm} เธเธก.`);
    lines.push(`- เธฃเธฐเธขเธฐเน€เธงเธฅเธฒเน€เธ”เธดเธเธ—เธฒเธ: เธเธฃเธฐเธกเธฒเธ“ ${estMinutes} เธเธฒเธ—เธต`);
    lines.push(`- เธชเธ เธฒเธเน€เธชเนเธเธ—เธฒเธ: เธเธดเธงเธ—เธฒเธเธฅเธฒเธ”เธขเธฒเธ เธฃเธ–เธขเธเธ•เนเธ—เธธเธเธเธเธดเธ”เธชเธฒเธกเธฒเธฃเธ–เธชเธฑเธเธเธฃเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`);

    return lines.join("\n");
  }

  // Tier 3 Fallback เธเธฃเธ“เธต Google เนเธฅเธฐ OSRM เนเธกเนเธ•เธญเธเธชเธเธญเธ
  const lengthKm = calculatePolylineLengthKm(queryPoints);
  const lines: string[] = [
    dirHeader,
    `1. เธเธธเธ”เน€เธฃเธดเนเธกเธ•เนเธ: เธเธฃเธดเน€เธงเธ“ ${startHwyStr} ${startAddr.tag}`,
    `2. เน€เธเธตเนเธขเธเน€เธเนเธฒเธชเธนเน เนเธเธฃเธเธเนเธฒเธขเน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธ เธกเธธเนเธเธซเธเนเธฒ ${endAddr.tag}`,
    `3. เธเธธเธ”เธชเธดเนเธเธชเธธเธ”: เธ–เธถเธเธเธธเธ”เธเธฃเธฃเธเธเธ—เธฒเธเธซเธฅเธงเธเธชเธฒเธขเธซเธฅเธฑเธ ${endHwyStr}${endAddr.tag} เธชเธฑเธเธเธฃเธ•เนเธญเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`,
    `- เธฃเธงเธกเธฃเธฐเธขเธฐเธ—เธฒเธเน€เธฅเธตเนเธขเธ: เธเธฃเธฐเธกเธฒเธ“ ${lengthKm} เธเธก.`,
    `- เธฃเธฐเธขเธฐเน€เธงเธฅเธฒเน€เธ”เธดเธเธ—เธฒเธ: เธเธฃเธฐเธกเธฒเธ“ ${Math.ceil(lengthKm * 1.5)} เธเธฒเธ—เธต`,
    `- เธชเธ เธฒเธเน€เธชเนเธเธ—เธฒเธ: เธเธดเธงเธ—เธฒเธเธฅเธฒเธ”เธขเธฒเธ เธฃเธ–เธขเธเธ•เนเธ—เธธเธเธเธเธดเธ”เธชเธฒเธกเธฒเธฃเธ–เธชเธฑเธเธเธฃเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด`,
  ];
  return lines.join("\n");
}

export interface AutoDetourAdviceOptions {
  forwardWaypoints?: [number, number][];
  reverseWaypoints?: [number, number][];
}

/**
 * เธงเธดเน€เธเธฃเธฒเธฐเธซเนเธ—เธดเธจเธ—เธฒเธเนเธฅเธฐเธชเธฃเนเธฒเธเธเธณเนเธเธฐเธเธณเธ—เธฒเธเน€เธฅเธตเนเธขเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธชเธณเธซเธฃเธฑเธเธเธฃเธฐเธเธฒเธเธเนเธเธ เน’ เธ—เธดเธจเธ—เธฒเธ (เธเธฒเนเธ A -> B เนเธฅเธฐ เธเธฒเธเธฅเธฑเธ B -> A)
 * เธ”เธถเธเธเธทเนเธญเธซเธกเธนเนเธเนเธฒเธ (เธ.) เธ•เธณเธเธฅ (เธ•.) เธญเธณเน€เธ เธญ (เธญ.) เธเธทเนเธญเธ–เธเธ เนเธฅเธฐเธเธธเธ”เน€เธฅเธตเนเธขเธงเธเธฃเธดเธ
 * เธฃเธญเธเธฃเธฑเธเธ—เธฑเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเนเธเธเนเธ-เธเธฅเธฑเธเธเธเธฅเธฐเน€เธชเนเธเธ—เธฒเธ (reverseCoords เนเธขเธ) เนเธฅเธฐเธเธธเธ”เธ”เธฑเธ”เน€เธชเนเธเธ—เธตเนเน€เธเนเธฒเธซเธเนเธฒเธ—เธตเนเธงเธฒเธเนเธงเน
 */
export async function generateAutoDetourAdvice(
  startCoord: [number, number],
  endCoord: [number, number],
  detourCoords: [number, number][] = [],
  relatedHighwayNo?: string,
  highwayLayers: any[] = [],
  reverseDetourCoords?: [number, number][],
  directionMode: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY" = "TWO_WAY",
  options: AutoDetourAdviceOptions = {}
): Promise<string> {
  const buildQueryPoints = (
    pts: [number, number][],
    explicitWaypoints: [number, number][] | undefined,
    fallbackStart: [number, number],
    fallbackEnd: [number, number]
  ): [number, number][] => {
    if (Array.isArray(explicitWaypoints) && explicitWaypoints.length > 0) {
      return [fallbackStart, ...explicitWaypoints.slice(0, 20), fallbackEnd];
    }
    if (pts.length < 2) return [fallbackStart, fallbackEnd];
    const corners = selectRouteCornerWaypoints(pts, 12);
    return [pts[0], ...corners, pts[pts.length - 1]];
  };

  // เธชเธเธฑเธ”เธฅเธณเธ”เธฑเธเธเธดเธเธฑเธ”เธชเธณเธซเธฃเธฑเธเธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ (Forward: A -> B)
  const forwardPoints = buildQueryPoints(detourCoords, options.forwardWaypoints, startCoord, endCoord);

  // เธชเธเธฑเธ”เธฅเธณเธ”เธฑเธเธเธดเธเธฑเธ”เธชเธณเธซเธฃเธฑเธเธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ (Reverse: B -> A)
  // เนเธเนเนเธเธง/เธเธธเธ”เธ”เธฑเธ”เธเธฒเธเธฅเธฑเธเธเธฃเธดเธเธเนเธญเธ เธซเธฒเธเนเธกเนเธกเธตเนเธซเนเนเธเนเธเธธเธ”เธซเธฑเธเน€เธฅเธตเนเธขเธงเธขเนเธญเธเธฅเธณเธ”เธฑเธเน€เธเธทเนเธญเนเธซเนเน€เธเธฃเธทเนเธญเธเธกเธทเธญเธเธณเธ—เธฒเธเน€เธฅเธทเธญเธเธเนเธญเธเธเธฃเธฒเธเธฃเธเธฑเนเธ B -> A เธ—เธตเนเธ–เธนเธเธ•เนเธญเธ
  const reversePoints =
    reverseDetourCoords && reverseDetourCoords.length >= 2
      ? buildQueryPoints(reverseDetourCoords, options.reverseWaypoints, endCoord, startCoord)
      : Array.isArray(options.forwardWaypoints) && options.forwardWaypoints.length > 0
        ? [endCoord, ...[...options.forwardWaypoints].reverse().slice(0, 20), startCoord]
        : buildQueryPoints([...detourCoords].reverse(), undefined, endCoord, startCoord);

  if (directionMode === "FORWARD_ONLY") {
    const forwardText = await buildSingleDirectionAdvice(forwardPoints, "เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” A โ’ เธเธธเธ” B", relatedHighwayNo, highwayLayers);
    return `${forwardText}\n\n=== เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ: เธเธธเธ” B โ’ เธเธธเธ” A ===\n- เน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธเธตเนเน€เธเธดเธ”เนเธเนเธเธฒเธเน€เธเธเธฒเธฐเธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ (A โ’ B) เน€เธ—เนเธฒเธเธฑเนเธ เธเธฃเธธเธ“เธฒเนเธเนเน€เธชเนเธเธ—เธฒเธเธญเธทเนเธเธชเธณเธซเธฃเธฑเธเธเธฒเธเธฅเธฑเธ`;
  }

  if (directionMode === "REVERSE_ONLY") {
    const reverseText = await buildSingleDirectionAdvice(reversePoints, "เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ: เธเธธเธ” B โ’ เธเธธเธ” A", relatedHighwayNo, highwayLayers);
    return `=== เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” A โ’ เธเธธเธ” B ===\n- เน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธเธตเนเน€เธเธดเธ”เนเธเนเธเธฒเธเน€เธเธเธฒเธฐเธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ (B โ’ A) เน€เธ—เนเธฒเธเธฑเนเธ เธเธฃเธธเธ“เธฒเนเธเนเน€เธชเนเธเธ—เธฒเธเธญเธทเนเธเธชเธณเธซเธฃเธฑเธเธเธฒเนเธ\n\n${reverseText}`;
  }

  // เธชเธฃเนเธฒเธเธเธณเนเธเธฐเธเธณเธ—เธฑเนเธ เน’ เธ—เธดเธจเธ—เธฒเธเธเธฃเนเธญเธกเธเธฑเธ
  const [forwardText, reverseText] = await Promise.all([
    buildSingleDirectionAdvice(forwardPoints, "เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” A โ’ เธเธธเธ” B", relatedHighwayNo, highwayLayers),
    buildSingleDirectionAdvice(reversePoints, "เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ: เธเธธเธ” B โ’ เธเธธเธ” A", relatedHighwayNo, highwayLayers),
  ]);

  return `${forwardText}\n\n${reverseText}`;
}

/**
 * เนเธขเธเธเธณเนเธเธฐเธเธณเธเธฒเธฃเน€เธ”เธดเธเธ—เธฒเธเธเธญเธเน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธญเธญเธเน€เธเนเธ เน’ เธ—เธดเธจเธ—เธฒเธ: เธเธฒเนเธ (A โ’ B) เนเธฅเธฐเธเธฒเธเธฅเธฑเธ (B โ’ A)
 * เธชเธณเธซเธฃเธฑเธเนเธเนเนเธชเธ”เธเธเธฅเธชเธฅเธฑเธเนเธ—เนเธเธเธเนเธเธเธ—เธตเนเนเธฅเธฐเธซเธเนเธฒเธ•เนเธฒเธเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”
 */
export function splitDetourAdviceByDirection(
  description: string,
  directionMode: string = "TWO_WAY"
): { forwardText: string; reverseText: string } {
  const desc = (description || "").trim();
  if (!desc) {
    return {
      forwardText: "เธขเธฑเธเนเธกเนเธกเธตเธเธณเนเธเธฐเธเธณเธเธฒเธฃเน€เธ”เธดเธเธ—เธฒเธเธเธฒเนเธ (A โ’ B)",
      reverseText: "เธขเธฑเธเนเธกเนเธกเธตเธเธณเนเธเธฐเธเธณเธเธฒเธฃเน€เธ”เธดเธเธ—เธฒเธเธเธฒเธเธฅเธฑเธ (B โ’ A)",
    };
  }

  if (directionMode === "FORWARD_ONLY") {
    return {
      forwardText: desc,
      reverseText: "เน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธเธตเนเน€เธเธดเธ”เนเธเนเธเธฒเธเน€เธเธเธฒเธฐเธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ (A โ’ B) เน€เธ—เนเธฒเธเธฑเนเธ เธเธฃเธธเธ“เธฒเนเธเนเน€เธชเนเธเธ—เธฒเธเธญเธทเนเธเธชเธณเธซเธฃเธฑเธเธเธฒเธเธฅเธฑเธ",
    };
  }

  if (directionMode === "REVERSE_ONLY") {
    return {
      forwardText: "เน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธเธตเนเน€เธเธดเธ”เนเธเนเธเธฒเธเน€เธเธเธฒเธฐเธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ (B โ’ A) เน€เธ—เนเธฒเธเธฑเนเธ เธเธฃเธธเธ“เธฒเนเธเนเน€เธชเนเธเธ—เธฒเธเธญเธทเนเธเธชเธณเธซเธฃเธฑเธเธเธฒเนเธ",
      reverseText: desc,
    };
  }

  // เธฃเธญเธเธฃเธฑเธเธฃเธนเธเนเธเธเธ—เธตเนเธกเธตเธชเนเธงเธเธซเธฑเธง === เธ—เธดเธจเธ—เธฒเธ... === เน’ เธชเนเธงเธ (เนเธกเนเธเธดเธกเธเนเธซเธฑเธงเธเนเธญเธเธฒเธเธฅเธฑเธเธเธดเธ”เน€เธเนเธ "เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ: เธเธธเธ” B โ’ เธเธธเธ” A")
  const extracted = extractDirectionalAdvice(desc);
  if (extracted.hasBoth) {
    return {
      forwardText: extracted.forward || desc,
      reverseText: extracted.reverse || desc,
    };
  }

  const markers = [
    "=== เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ",
    "เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ: เธเธธเธ” B โ’ เธเธธเธ” A ===",
    "เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ:",
    "เธเธฒเธเธฅเธฑเธ (เธเธธเธ” B โ’ เธเธธเธ” A):",
    "เธเธฒเธเธฅเธฑเธ:",
  ];

  for (const marker of markers) {
    const idx = desc.indexOf(marker);
    if (idx !== -1) {
      let forward = desc.substring(0, idx).trim();
      let reverse = desc.substring(idx).trim();
      // เธ•เธฑเธ”เธซเธฑเธงเธเนเธญเธเธณเธ—เธฒเธเน€เธ”เธดเธกเธญเธญเธเน€เธเธทเนเธญเนเธซเนเน€เธเธทเนเธญเธซเธฒเธเธฃเธฐเธเธฑเธเธชเธงเธขเธเธฒเธก
      forward = forward.replace(/^===?\s*เธ—เธดเธจเธ—เธฒเธเธเธฒเนเธ[^=]*===?\s*/i, "").trim();
      reverse = reverse.replace(/^===?\s*เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ[^=]*===?\s*/i, "").trim();
      return {
        forwardText: forward || desc,
        reverseText: reverse || desc,
      };
    }
  }

  return {
    forwardText: desc,
    reverseText: `เธ—เธดเธจเธ—เธฒเธเธเธฒเธเธฅเธฑเธ (เธเธธเธ” B โ’ เธเธธเธ” A):\nเธงเธดเนเธเธขเนเธญเธเน€เธชเนเธเธ—เธฒเธเธ•เธฒเธกเนเธเธงเธ–เธเธเน€เธ”เธดเธก เธซเธฃเธทเธญเนเธเนเธเธณเนเธเธฐเธเธณเธเธฒเธฃเน€เธ”เธดเธเธ—เธฒเธเธเธญเธเน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธเธตเนเนเธเธ—เธดเธจเธ—เธฒเธเธ•เธฃเธเธเธฑเธเธเนเธฒเธก\n\n${desc}`,
  };
}

/**
 * เธฅเธ”เธ—เธญเธเธเธธเธ”เธเธดเธเธฑเธ”เธชเนเธงเธเน€เธเธดเธเธ”เนเธงเธขเธเธฑเนเธเธ•เธญเธเธงเธดเธเธต Douglas-Peucker (Point Decimation)
 */
export function simplifyCoordinates(
  points: [number, number][],
  tolerance: number = 0.00008
): [number, number][] {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const ranges: [number, number][] = [[0, points.length - 1]];
  while (ranges.length) {
    const [start, end] = ranges.pop()!;
    let maxDist = tolerance;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDist) { maxDist = distance; index = i; }
    }
    if (index >= 0) {
      keep[index] = 1;
      ranges.push([start, index], [index, end]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function perpendicularDistance(
  pt: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(pt[0] - lineStart[0], pt[1] - lineStart[1]);
  return Math.abs(dy * pt[0] - dx * pt[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]) / mag;
}

/**
 * เธเธณเธเธงเธ“เนเธเธงเน€เธชเนเธเธ—เธฒเธเน€เธเธฒเธฐเธ–เธเธเธเธฃเธดเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธเนเธฒเธ OSRM (Multi-Tier Failover)
 */
export async function calculateRoadSnappedRoute(
  start: [number, number],
  end: [number, number],
  waypoints: [number, number][] = []
): Promise<[number, number][]> {
  const allPoints = [start, ...waypoints, end];
  const coordString = allPoints.map((p) => `${p[0]},${p[1]}`).join(";");

  try {
    const result = await fetchOsrmWithFailover(coordString, "overview=full&geometries=geojson");
    if (result?.data?.routes?.[0]?.geometry?.coordinates) {
      return result.data.routes[0].geometry.coordinates as [number, number][];
    }
  } catch (err) {
    console.warn("OSRM routing unavailable:", err);
  }
  const hint = getOsrmFailureHint();
  const alternative = "เธซเธฃเธทเธญเธชเธฅเธฑเธเน€เธเนเธเนเธซเธกเธ” \"เธงเธฒเธ”/เนเธเนเนเธเธญเธดเธชเธฃเธฐ\" เน€เธเธทเนเธญเธฅเธฒเธเธเธธเธ”เน€เธญเธ";
  if (hint === "rate_limited") throw new Error(`เธฃเธฐเธเธเธซเธฒเน€เธชเนเธเธ—เธฒเธ (OSRM) เธ–เธนเธเธเธณเธเธฑเธ”เธเธฒเธฃเน€เธฃเธตเธขเธเธเธฑเนเธงเธเธฃเธฒเธง เธฃเธญเธเธฃเธฐเธกเธฒเธ“ 1 เธเธฒเธ—เธตเนเธฅเนเธงเธฅเธญเธเนเธซเธกเน ${alternative}`);
  if (hint === "no_route") throw new Error(`เนเธกเนเธเธเน€เธชเนเธเธ—เธฒเธเธ•เธฒเธกเธ–เธเธเธฃเธฐเธซเธงเนเธฒเธเธเธธเธ”เธ—เธตเนเน€เธฅเธทเธญเธ เธฅเธญเธเธเธขเธฑเธเธเธธเธ”เนเธซเนเนเธเธฅเนเธ–เธเธเธกเธฒเธเธเธถเนเธ ${alternative}`);
  if (hint === "unreachable") throw new Error(`เน€เธเธทเนเธญเธกเธ•เนเธญเธฃเธฐเธเธเธซเธฒเน€เธชเนเธเธ—เธฒเธ (OSRM) เนเธกเนเนเธ”เน เธ•เธฃเธงเธเธชเธญเธเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เนเธฅเนเธงเธฅเธญเธเนเธซเธกเน ${alternative}`);
  throw new Error("เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธณเธเธงเธ“เน€เธชเนเธเธ—เธฒเธเธ•เธฒเธกเธ–เธเธเนเธ”เน เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน");
}

/**
 * เธฃเธฐเธเธเธ”เธฑเธ”เน€เธชเนเธเธ–เธเธเนเธเธ Dual-Source (PostGIS DB -> OSRM -> Straight Line)
 */
export async function calculateRoadSnappedDualSource(
  start: [number, number],
  end: [number, number],
  waypoints: [number, number][] = [],
  highwayLayers: any[] = []
): Promise<{
  coords: [number, number][];
  via: "db" | "osrm" | "line";
  label?: string;
  message: string;
}> {
  // 1. เธฅเธญเธเธเนเธเธซเธฒเธ•เธฑเธ”เธเธฒเธเน€เธฅเน€เธขเธญเธฃเนเนเธเธฃเธเธเนเธฒเธขเธ—เธฒเธเธซเธฅเธงเธเนเธเธฃเธฐเธเธ (Local / PostGIS Proximity)
  if (highwayLayers.length > 0) {
    for (const layer of highwayLayers) {
      const lines = extractLinesFromGeoJson(layer.geojson_data);
      for (const line of lines) {
        let nearestA = -1;
        let nearestB = -1;
        let minDistA = 0.003; // ~300 เน€เธกเธ•เธฃ
        let minDistB = 0.003;

        line.forEach((pt, idx) => {
          const distA = Math.hypot(pt[0] - start[0], pt[1] - start[1]);
          const distB = Math.hypot(pt[0] - end[0], pt[1] - end[1]);
          if (distA < minDistA) {
            minDistA = distA;
            nearestA = idx;
          }
          if (distB < minDistB) {
            minDistB = distB;
            nearestB = idx;
          }
        });

        if (nearestA !== -1 && nearestB !== -1) {
          const sliceStart = Math.min(nearestA, nearestB);
          const sliceEnd = Math.max(nearestA, nearestB);
          let slice = line.slice(sliceStart, sliceEnd + 1);
          if (nearestA > nearestB) slice = slice.reverse();
          if (slice.length >= 2) {
            return {
              coords: slice,
              via: "db",
              label: layer.layer_name || "เนเธเธฃเธเธเนเธฒเธขเธเธฃเธกเธ—เธฒเธเธซเธฅเธงเธ",
              message: `เน€เธเธฒเธฐเธ•เธฒเธกเธ–เธเธ ${layer.layer_name || "เธ—เธฅ."} เธเธฒเธเธเนเธญเธกเธนเธฅเนเธเธฃเธเธเนเธฒเธขเนเธเธฃเธฐเธเธ โ“ โ€” เธ”เธฑเธ”เน€เธชเนเธเน€เธเธดเนเธกเนเธ”เน`,
            };
          }
        }
      }
    }
  }

  // 2. เธซเธฒเธเนเธกเนเธเธเนเธเธฃเธฐเธเธ เธฅเธญเธเธชเนเธเธเธณเธเธงเธ“เธเนเธฒเธ OSRM (เธ•เธฑเธงเธชเธณเธฃเธญเธ)
  try {
    const osrmResult = await calculateRoadSnappedRoute(start, end, waypoints);
    if (osrmResult && osrmResult.length > 2) {
      return {
        coords: osrmResult,
        via: "osrm",
        message: "เธชเธฃเนเธฒเธเน€เธชเนเธเธ•เธฒเธกเธ–เธเธเธ”เนเธงเธข OSRM (เธ•เธฑเธงเธชเธณเธฃเธญเธ) โ€” เธ•เธฃเธงเธเนเธเธงเน€เธชเนเธเธเนเธญเธเธเธฑเธเธ—เธถเธ",
      };
    }
  } catch (err) { }

  // 3. Fallback เน€เธชเนเธเธ•เธฃเธ
  const directLine: [number, number][] = [start, ...waypoints, end];
  return {
    coords: directLine,
    via: "line",
    message: "เนเธกเนเธเธเธ–เธเธเนเธเธฅเนเธเธธเธ”เธ—เธตเนเธฃเธฐเธเธธ เธเธถเธเธฅเธฒเธเน€เธชเนเธเธ•เธฃเธเนเธซเน โ€” เธฅเธฒเธเธเธธเธ”เธเธฒเธงเน€เธเธทเนเธญเธ”เธฑเธ”เธ•เธฒเธกเธ–เธเธเนเธ”เน",
  };
}

/**
 * เธ•เธฑเธ”เธเนเธงเธเธเธดเธเธฑเธ” (LineString) เธเธฒเธเน€เธชเนเธเธ—เธฒเธเธซเธฅเธงเธเธซเธฅเธฑเธเธ•เธฒเธกเธเนเธงเธเธเธดเนเธฅเน€เธกเธ•เธฃเนเธฅเธฐเธ—เธดเธจเธ—เธฒเธ (Linear Referencing)
 */
export function slicePolylineByKmRange(
  polylineCoords: [number, number][],
  sectionKmStart: unknown,
  sectionKmEnd: unknown,
  targetKmStart: unknown,
  targetKmEnd: unknown,
  isReverseOrientation = false
): [number, number][] {
  if (!Array.isArray(polylineCoords) || polylineCoords.length < 2) {
    return polylineCoords || [];
  }

  const sKm = parseKmPostMeters(sectionKmStart);
  const eKm = parseKmPostMeters(sectionKmEnd);
  const tStart = parseKmPostMeters(targetKmStart);
  const tEnd = parseKmPostMeters(targetKmEnd);

  if (sKm === null || eKm === null || tStart === null || tEnd === null || sKm === eKm) {
    return polylineCoords;
  }

  // เธเธณเธเธงเธ“เธฃเธฐเธขเธฐเธ—เธฒเธเธชเธฐเธชเธกเธ•เธฒเธกเธเธธเธ”เธเธดเธเธฑเธ”เธเธฃเธดเธ (เน€เธกเธ•เธฃ)
  const cumDist: number[] = [0];
  for (let i = 1; i < polylineCoords.length; i++) {
    const d = haversineDistanceKm(polylineCoords[i - 1], polylineCoords[i]) * 1000;
    cumDist.push(cumDist[i - 1] + d);
  }
  const totalGeomMeters = cumDist[cumDist.length - 1];
  if (totalGeomMeters <= 0) return polylineCoords;

  // เธเธณเธเธงเธ“เธ•เธณเนเธซเธเนเธเธชเธฑเธ”เธชเนเธงเธเธ•เธฒเธกเนเธเธงเธชเธฒเธขเธ—เธฒเธเธเธฃเธดเธ (Physical linear reference along the geometry from index 0 to last)
  // เธ—เธตเน index 0 เธกเธตเธเนเธฒเธซเธฅเธฑเธเธเธดเนเธฅเน€เธกเธ•เธฃ = sKm, เธ—เธตเน index เธชเธธเธ”เธ—เนเธฒเธข เธกเธตเธเนเธฒเธซเธฅเธฑเธเธเธดเนเธฅเน€เธกเธ•เธฃ = eKm
  const kmSpan = eKm - sKm;
  const fStart = (tStart - sKm) / kmSpan;
  const fEnd = (tEnd - sKm) / kmSpan;

  const clampedStart = Math.max(0, Math.min(1, fStart));
  const clampedEnd = Math.max(0, Math.min(1, fEnd));

  const minFraction = Math.min(clampedStart, clampedEnd);
  const maxFraction = Math.max(clampedStart, clampedEnd);

  const targetDistStart = minFraction * totalGeomMeters;
  const targetDistEnd = maxFraction * totalGeomMeters;

  // เธเธฑเธเธเนเธเธฑเธเธซเธฒเธเธดเธเธฑเธ” เธ“ เธฃเธฐเธขเธฐเธ—เธฒเธ dMeters
  const interpolateAtDist = (dMeters: number): [number, number] => {
    if (dMeters <= 0) return polylineCoords[0];
    if (dMeters >= totalGeomMeters) return polylineCoords[polylineCoords.length - 1];

    let segIdx = 0;
    for (let i = 0; i < cumDist.length - 1; i++) {
      if (dMeters >= cumDist[i] && dMeters <= cumDist[i + 1]) {
        segIdx = i;
        break;
      }
    }

    const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
    const segFrac = segLen > 0 ? (dMeters - cumDist[segIdx]) / segLen : 0;
    const p1 = polylineCoords[segIdx];
    const p2 = polylineCoords[segIdx + 1];

    return [
      Number((p1[0] + (p2[0] - p1[0]) * segFrac).toFixed(6)),
      Number((p1[1] + (p2[1] - p1[1]) * segFrac).toFixed(6)),
    ];
  };

  const sliced: [number, number][] = [];
  sliced.push(interpolateAtDist(targetDistStart));

  for (let i = 0; i < polylineCoords.length; i++) {
    if (cumDist[i] > targetDistStart && cumDist[i] < targetDistEnd) {
      sliced.push(polylineCoords[i]);
    }
  }

  sliced.push(interpolateAtDist(targetDistEnd));

  // เธ•เธฃเธงเธเธชเธญเธเธ—เธดเธจเธ—เธฒเธเธเธฒเธฃเธเธฑเธ”เน€เธฃเธตเธขเธเธเธดเธเธฑเธ”เธเธฅเธฅเธฑเธเธเน (Coordinate sequence order):
  // clampedStart เธเธทเธญเธชเธฑเธ”เธชเนเธงเธเธ•เธณเนเธซเธเนเธเธเธญเธ targetKmStart
  // clampedEnd เธเธทเธญเธชเธฑเธ”เธชเนเธงเธเธ•เธณเนเธซเธเนเธเธเธญเธ targetKmEnd
  // เธซเธฒเธ clampedStart > clampedEnd เธฅเธณเธ”เธฑเธเธเธดเธเธฑเธ”เธ•เนเธญเธเธขเนเธญเธเธเธฅเธฑเธเน€เธเธทเนเธญเนเธซเนเธเธธเธ”เนเธฃเธเธเธญเธ sliced เธเธทเธญเธเธดเธเธฑเธ”เธเธญเธ targetKmStart
  if (clampedStart > clampedEnd) {
    sliced.reverse();
  }

  // เธซเธฒเธเธเธนเนเนเธเนเธฃเธฐเธเธธเนเธซเนเธชเธฅเธฑเธเธ—เธดเธจเธ—เธฒเธเธชเธณเธซเธฃเธฑเธเธเนเธญเธเธเธฃเธฒเธเธฃเธเธฒเธเธฅเธฑเธ (isReverseOrientation / B_TO_A)
  if (isReverseOrientation) {
    sliced.reverse();
  }

  return sliced.length >= 2 ? sliced : polylineCoords;
}

/**
 * เธ”เธถเธเธเธทเนเธญเธ•เธณเธเธฅ เธญเธณเน€เธ เธญ เธเธฑเธเธซเธงเธฑเธ” เธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธเธฒเธเธเธดเธเธฑเธ” (เธ•เธฑเธงเธ”เธถเธเธเนเธญเธกเธนเธฅเธเธทเนเธเธ—เธตเนเธเธฅเธฒเธ: Longdo โ’ OSM Nominatim โ’ เธเนเธญเธกเธนเธฅเธ เธฒเธขเนเธ)
 * confidence = "high" เน€เธกเธทเนเธญเนเธ”เนเธเธทเนเธญเธ•เธณเธเธฅเธเธฒเธเนเธซเธฅเนเธเธญเธญเธเนเธฅเธเน เธชเนเธงเธ "medium"/"low" เธเธงเธฃเนเธซเนเน€เธเนเธฒเธซเธเนเธฒเธ—เธตเนเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธเนเธเน
 */
export async function reverseGeocodeTambonAmphoe(
  lon: number,
  lat: number
): Promise<{
  subdistrict: string;
  district: string;
  province: string;
  confidence: "high" | "medium" | "low";
  source: "google" | "longdo" | "nominatim" | "local" | "district";
} | null> {
  if (isNaN(lon) || isNaN(lat)) return null;
  const area = await resolveArea(lon, lat);
  if (!area.tambon && !area.amphoe) return null;
  return {
    subdistrict: area.tambon,
    district: area.amphoe,
    province: area.province,
    confidence: area.confidence,
    source: area.source,
  };
}

/**
 * เธ•เธฃเธงเธเธชเธญเธเธงเนเธฒเนเธเธงเน€เธชเนเธเธ—เธฒเธเธชเธญเธเน€เธชเนเธเธญเธขเธนเนเนเธเธฅเนเธซเธฃเธทเธญเธ•เธฑเธ”เธเธฑเธเธ เธฒเธขเนเธเธฃเธฐเธขเธฐเธ—เธตเนเธเธณเธซเธเธ” (เน€เธกเธ•เธฃ) เธซเธฃเธทเธญเนเธกเน
 * เนเธเนเธชเธณเธซเธฃเธฑเธเธ•เธฃเธงเธเธเธฑเธเธงเนเธฒเน€เธชเนเธเธ—เธฒเธเน€เธฅเธตเนเธขเธเธงเธดเนเธเธเนเธฒเธเธธเธ”เธเนเธณเธ—เนเธงเธกเธ—เธตเนเธเธดเธ”เธเธฒเธฃเธเธฃเธฒเธเธฃ (CLOSED) เธซเธฃเธทเธญเนเธกเน
 * เนเธฅเธฐเธ•เธฃเธงเธเธงเนเธฒเน€เธชเนเธ A->B เธเธฑเธ B->A เน€เธเนเธเธ–เธเธเน€เธชเนเธเน€เธ”เธตเนเธขเธงเธซเธฃเธทเธญเธ–เธเธเนเธขเธเธเธฑเนเธเธเธฃเธฒเธเธฃ
 */
