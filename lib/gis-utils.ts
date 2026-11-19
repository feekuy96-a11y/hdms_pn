import { computeGoogleDetourRouteAction, type GoogleRouteStep } from "@/app/actions/doh-actions";
import { UTM_47N_PARAMS } from "./constants";
import { parseKmPostMeters } from "./highway-schema";
import { cleanThaiAdminPrefix, findPattaniDistrictName, isPointInPolygon, resolveArea } from "./area-lookup";
import { fetchOsrmWithFailover, getOsrmFailureHint } from "./osrm-client";
export { cleanThaiAdminPrefix, findPattaniDistrictName, isPointInPolygon } from "./area-lookup";

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
 * ถอดรหัส Google Encoded Polyline (1e5) เป็นพิกัด GeoJSON [lon, lat][]
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
 * คัดเลือกจุดหักเลี้ยวสำคัญตามแนวเส้น (Douglas-Peucker importance) โดยคงลำดับต้นทาง → ปลายทางไว้
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
    // กรณีจุดเรียงตัวเป็นเส้นตรงทั้งหมด เลือกกระจายตัวสม่ำเสมอไม่เกิน maxCount จุด
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
 * แปลงพิกัดภูมิศาสตร์ (WGS84 Lat/Lon) เป็น UTM Zone 47N (EPSG:32647)
 * ใช้สูตรแม่นยำทางภูมิมาตรศาสตร์ตามมาตรฐานกรมทางหลวง
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
 * จัดรูปแบบวันที่เป็นปีพุทธศักราช (พ.ศ.) ภาษาไทย
 */
export function formatThaiBuddhistDate(isoString: string | Date, includeTime = true): string {
  if (!isoString) return "-";
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return "-";

  const thaiMonths = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const yearBE = date.getFullYear() + 543;

  if (!includeTime) {
    return `${day} ${month} ${yearBE}`;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${yearBE} เวลา ${hours}:${minutes} น.`;
}

/**
 * สกัดพิกัด GPS จากภาพถ่าย EXIF metadata
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

/**
 * คำนวณระยะทาง Haversine ระหว่างสองพิกัด (กิโลเมตร)
 */
export function haversineDistanceKm(p1: [number, number], p2: [number, number]): number {
  const R = 6371; // รัศมีโลกเฉลี่ย กม.
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[1] * Math.PI) / 180) *
    Math.cos((p2[1] * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * คำนวณความยาวรวมของเส้น Polyline (กิโลเมตร)
 */
export function calculatePolylineLengthKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistanceKm(coords[i], coords[i + 1]);
  }
  return Number(total.toFixed(2));
}

// fetchOsrmWithFailover now lives in ./osrm-client (cache, de-duplication, retry, spacing, circuit breaker).
// It is re-exported here so existing imports from "@/lib/gis-utils" keep working.
export { fetchOsrmWithFailover };

/**
 * ตรวจสอบสถานะการเชื่อมต่อของ OSRM Routing Engines (Local & Public)
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
  const layerFallback = (layerName || "").trim() || "โครงข่ายกรมทางหลวง";
  const displayName = propName || layerFallback;
  const candidateCodeSource = propRouteNo || layerFallback;

  const ruralMatch = candidateCodeSource.match(/(?:ทางหลวงชนบท\s*)?(ปน|ยล|นธ|สข)\.?\s*(\d{3,5})/i);
  if (ruralMatch) {
    const code = `${ruralMatch[1]}.${ruralMatch[2]}`;
    return { code, label: `ทางหลวงชนบท ${code} (${displayName})`, name: displayName };
  }
  const nationalMatch = candidateCodeSource.match(/(?:ทล\.?|ทางหลวง(?:แผ่นดิน)?(?:หมายเลข)?\s*)?(\d{1,4})/);
  if (nationalMatch) {
    const code = nationalMatch[1];
    return { code, label: `ทล.${code} (${displayName})`, name: displayName };
  }
  return { code: "", label: displayName, name: displayName };
}

/**
 * ค้นหาถนนหรือทางหลวงที่ใกล้พิกัดที่สุดจาก Highway Layers โดยวัดระยะตั้งฉากกับแนวเส้นจริงและอ่านรหัสสายทางจาก feature properties
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

export { PATTANI_SUBDISTRICTS_DATA, PATTANI_DISTRICTS_GEOJSON } from "./gis-data";

/** ชื่อพื้นที่สำหรับแสดงในข้อความ เช่น "(บ.บ้านดอนรัก ต.รูสะมิแล อ.เมืองปัตตานี)" */
function formatAreaTag(area: { village: string; tambon: string; amphoe: string }): string {
  const parts: string[] = [];
  if (area.village) parts.push(area.village.startsWith("บ้าน") ? area.village : `บ.${area.village}`);
  if (area.tambon) parts.push(`ต.${area.tambon}`);
  parts.push(`อ.${area.amphoe || "เมืองปัตตานี"}`);
  return `(${parts.join(" ")})`;
}

/**
 * ดึงชื่อหมู่บ้าน (บ.), ตำบล (ต.), อำเภอ (อ.) และชื่อถนนจากพิกัด
 * ใช้ตัวดึงข้อมูลพื้นที่กลาง (lib/area-lookup.ts): แคช, จำกัดอัตราเรียก, ใช้ข้อมูลภายในเมื่อออฟไลน์
 * needRoad = true เมื่อต้องการชื่อถนนของจุดนี้จริง ๆ (ถ้าไม่ต้องการ จะใช้คำตอบของจุดที่อยู่ใกล้ภายใน 150 ม.)
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

/** ส่วนหัวของแต่ละทิศทาง เช่น "=== ทิศทางขาไป: จุด A → จุด B (ต.รูสะมิแล อ.เมืองปัตตานี → ต.บานา อ.เมืองปัตตานี) ===" */
function formatDirectionHeader(
  label: string,
  startAddr: { tambon: string; amphoe: string },
  endAddr: { tambon: string; amphoe: string }
): string {
  const place = (addr: { tambon: string; amphoe: string }) =>
    `${addr.tambon ? `ต.${addr.tambon} ` : ""}อ.${addr.amphoe || "เมืองปัตตานี"}`;
  return `=== ${label} (${place(startAddr)} → ${place(endAddr)}) ===`;
}

/**
 * แยกคำแนะนำแบบ ๒ ทิศทาง (ขาไป A -> B และ ขากลับ B -> A)
 * ใช้ส่วนหัว "=== ทิศทาง... ===" อันแรกเป็นขาไป และอันที่สองเป็นขากลับ (ไม่สนว่าสะกดคำว่าขาไป/ขากลับถูกหรือไม่)
 * และคืนส่วนหัวเดิมมาด้วย เพื่อไม่ให้รายละเอียดตำบล/อำเภอในหัวข้อหายไปเมื่อแก้ข้อความ
 */
export function extractDirectionalAdvice(text: string): {
  forward: string;
  reverse: string;
  hasBoth: boolean;
  forwardHeader: string;
  reverseHeader: string;
} {
  if (!text) return { forward: "", reverse: "", hasBoth: false, forwardHeader: "", reverseHeader: "" };

  const headers = Array.from(text.matchAll(/===\s*ทิศทาง[^=\n]*===/g));
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

  const headers = Array.from(text.matchAll(/===\s*ทิศทาง[^=\n]*===/g));
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
  const fwdH = forwardHeader || "=== ทิศทางขาไป: จุด A → จุด B ===";
  const revH = reverseHeader || "=== ทิศทางขากลับ: จุด B → จุด A ===";
  return `${fwdH}\n${forwardText}\n\n${revH}\n${reverseText}`;
}

function formatRefRoadPrefix(rawRef: string | undefined, fallbackStr: string): string {
  const ref = (rawRef || "").trim();
  if (!ref) return fallbackStr;
  if (/^(ปน|ยล|นธ|สข)\.?\s*\d+/i.test(ref)) {
    return `ทางหลวงชนบท ${ref.replace(/\s+/g, "")}`;
  }
  if (/^\d+$/.test(ref)) return `ทล.${ref}`;
  return ref;
}

/**
 * สกัดฟังก์ชันสร้างคำแนะนำเส้นทางเลี่ยงสำหรับ ๑ ทิศทาง (Google Routes API ก่อน แล้ว Fallback ไป OSRM / เส้นตรง)
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
  const startHwyStr = relatedHighwayNo ? `ทล.${relatedHighwayNo}` : (startAddr.road || "จุดตัดทางหลวง");
  const endHwyStr = relatedHighwayNo ? `ทล.${relatedHighwayNo} ` : (endAddr.road ? `${endAddr.road} ` : "");
  const dirHeader = formatDirectionHeader(label, startAddr, endAddr);

  // Tier 1: Google Maps Routes API (through secure Edge proxy)
  const googleRoute = await computeGoogleRouteHybrid(queryPoints, "TRAFFIC_UNAWARE");
  if (googleRoute && googleRoute.steps.length > 0) {
    const lines: string[] = [dirHeader];
    let stepCounter = 1;
    lines.push(`${stepCounter++}. จุดเริ่มต้น: บริเวณ ${startAddr.road || startHwyStr} ${startAddr.tag}`);

    for (let idx = 0; idx < googleRoute.steps.length; idx++) {
      const step = googleRoute.steps[idx];
      const cleanInstr = (step.instructions || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!cleanInstr) continue;
      if (idx === 0 && step.distanceMeters < 15) continue;
      const distStr = step.distanceMeters >= 1000
        ? `${(step.distanceMeters / 1000).toFixed(1)} กม.`
        : `${Math.round(step.distanceMeters)} ม.`;
      lines.push(`${stepCounter++}. ${cleanInstr}${step.distanceMeters > 0 ? ` (ระยะทาง ${distStr})` : ""}`);
    }

    lines.push(`${stepCounter++}. จุดสิ้นสุด: ถึงจุดบรรจบทางหลวงสายหลัก ${endHwyStr}${endAddr.tag} สัญจรต่อได้ตามปกติ`);
    const totalKm = ((googleRoute.distanceMeters || calculatePolylineLengthKm(queryPoints) * 1000) / 1000).toFixed(1);
    const estMinutes = Math.max(1, Math.round((googleRoute.durationSeconds || Number(totalKm) * 90) / 60));
    lines.push(`- รวมระยะทางเลี่ยง: ${totalKm} กม.`);
    lines.push(`- ระยะเวลาเดินทาง: ประมาณ ${estMinutes} นาที`);
    lines.push(`- สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ`);
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

      let action = "ตรงไปตาม";

      if (isFirst) {
        action = "จุดเริ่มต้น:";
      } else if (mType === "depart") {
        // ขั้นตอน depart ของ leg ถัดไป (จาก waypoint กลางเส้นทาง) คือการขับตรงต่อเนื่องบนช่วงถนนนั้น
        action = "ตรงไปตาม";
      } else if (isLast || mType === "arrive") {
        action = "ถึงจุดบรรจบทางหลวงสายหลัก:";
      } else if (mType === "roundabout" || mType === "rotary") {
        const exitNumber = Number(s.maneuver.exit);
        if (Number.isInteger(exitNumber) && exitNumber > 0) {
          action = `เมื่อถึงวงเวียน ให้ใช้ทางออกที่ ${exitNumber} มุ่งหน้าสู่`;
        } else if (mMod.includes("left")) {
          action = "เลี้ยวซ้ายผ่านวงเวียนมุ่งหน้าสู่";
        } else if (mMod.includes("right")) {
          action = "เลี้ยวขวาผ่านวงเวียนมุ่งหน้าสู่";
        } else if (mMod.includes("straight")) {
          action = "ตรงไปผ่านวงเวียนมุ่งหน้าสู่";
        } else {
          action = "เข้าสู่วงเวียน (เลี้ยวซ้าย) มุ่งหน้าสู่";
        }
      } else if (mType === "end of road") {
        if (mMod.includes("left")) action = "สุดทาง เลี้ยวซ้ายเข้าสู่";
        else if (mMod.includes("right")) action = "สุดทาง เลี้ยวขวาเข้าสู่";
        else if (mMod.includes("uturn")) action = "สุดทาง กลับรถเข้าสู่";
        else action = "สุดทาง มุ่งหน้าเข้าสู่";
      } else if (mType === "turn") {
        if (mMod.includes("slight left")) action = "เบี่ยงซ้ายเข้าสู่";
        else if (mMod.includes("sharp left")) action = "เลี้ยวซ้ายหักศอกเข้าสู่";
        else if (mMod.includes("left")) action = "เลี้ยวซ้ายเข้าสู่";
        else if (mMod.includes("slight right")) action = "เบี่ยงขวาเข้าสู่";
        else if (mMod.includes("sharp right")) action = "เลี้ยวขวาหักศอกเข้าสู่";
        else if (mMod.includes("right")) action = "เลี้ยวขวาเข้าสู่";
        else if (mMod.includes("uturn")) action = "กลับรถเข้าสู่";
        else action = "เลี้ยวเข้าสู่";
      } else if (mType === "continue") {
        if (mMod.includes("slight left")) action = "เบี่ยงซ้ายตาม";
        else if (mMod.includes("left")) action = "เลี้ยวซ้ายไปตาม";
        else if (mMod.includes("slight right")) action = "เบี่ยงขวาตาม";
        else if (mMod.includes("right")) action = "เลี้ยวขวาไปตาม";
        else if (mMod.includes("uturn")) action = "กลับรถไปตาม";
        else action = "ตรงไปต่อเนื่องตาม";
      } else if (mType === "off ramp") {
        action = mMod.includes("left") ? "ใช้ทางออกซ้ายเข้าสู่" : "ใช้ทางออกขวาเข้าสู่";
      } else if (mType === "merge" || mType === "on ramp" || mType === "fork") {
        action = mMod.includes("right") ? "เบี่ยงขวาเข้าสู่" : "เบี่ยงซ้ายเข้าสู่";
      } else if (mType === "new name") {
        action = "ตรงไปตาม";
      }

      const roadName = (s.name || "").trim();
      let refStr = (s.ref || "").trim();

      if (refStr) {
        if (/^(ปน|ยล|นธ|สข)\.?\s*\d+/i.test(refStr)) {
          refStr = `ทางหลวงชนบท ${refStr.toUpperCase()}`;
        } else if (/^\d+$/.test(refStr)) {
          refStr = `ทล.${refStr}`;
        }
      }

      let fullRoad = "";
      if (roadName && refStr) {
        fullRoad = /^ทางหลวงชนบท\s/.test(refStr)
          ? `${roadName} ${refStr.replace(/^ทางหลวงชนบท\s+/, "")}`
          : `${roadName} (${refStr})`;
      } else if (refStr) {
        fullRoad = refStr;
      } else if (roadName) {
        fullRoad = roadName;
      } else {
        if (s.maneuver?.location && highwayLayers.length > 0) {
          const nearest = findNearestHighwayFromLayers(s.maneuver.location, highwayLayers, 0.035);
          if (nearest) {
            fullRoad = nearest.label || nearest.name;
          }
        }
        if (!fullRoad) {
          fullRoad = "เส้นทางเชื่อมต่อท้องถิ่น";
        }
      }

      rawTurnInstructions.push({
        action,
        road: fullRoad,
        distanceM: s.distance,
        loc: s.maneuver?.location || startPt,
      });
    }

    // รวมขั้นตอนที่ต่อเนื่องบนถนนเดียวกัน
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
        step.action.startsWith("ตรงไป") &&
        prev.action.startsWith("ตรงไป")
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
    // Step 1: จุดเริ่มต้น
    const initHwy = formatRefRoadPrefix(osrmSteps[0]?.ref, startHwyStr);
    lines.push(`${stepCounter++}. จุดเริ่มต้น: บริเวณ ${initHwy} ${startAddr.tag}`);

    // Steps กลาง: จุดเลี้ยวและถนนจริง
    for (const step of consolidated) {
      if (step.action.includes("จุดเริ่มต้น") || step.action.includes("จุดบรรจบ")) continue;
      if (step.distanceM < 35 && !/(เลี้ยว|เบี่ยง|กลับรถ|วงเวียน|สุดทาง|ทางออก)/.test(step.action)) continue;

      const distStr = step.distanceM >= 1000 ? `${(step.distanceM / 1000).toFixed(1)} กม.` : `${Math.round(step.distanceM)} ม.`;
      const stepAddr = await getDetailedPattaniAddress(step.loc[0], step.loc[1], {
        needRoad: step.road === "เส้นทางเชื่อมต่อท้องถิ่น",
      });
      let roadName = step.road;
      if (roadName === "เส้นทางเชื่อมต่อท้องถิ่น" && stepAddr.road) {
        roadName = stepAddr.road;
      }
      lines.push(`${stepCounter++}. ${step.action} ${roadName} (ระยะทาง ${distStr})`);
    }

    // Step สุดท้าย: ถึงจุดหมาย
    lines.push(`${stepCounter++}. จุดสิ้นสุด: ถึงจุดบรรจบทางหลวงสายหลัก ${endHwyStr}${endAddr.tag} สัญจรต่อได้ตามปกติ`);
    lines.push(`- รวมระยะทางเลี่ยง: ${totalKm} กม.`);
    lines.push(`- ระยะเวลาเดินทาง: ประมาณ ${estMinutes} นาที`);
    lines.push(`- สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ`);

    return lines.join("\n");
  }

  // Tier 3 Fallback กรณี Google และ OSRM ไม่ตอบสนอง
  const lengthKm = calculatePolylineLengthKm(queryPoints);
  const lines: string[] = [
    dirHeader,
    `1. จุดเริ่มต้น: บริเวณ ${startHwyStr} ${startAddr.tag}`,
    `2. เบี่ยงเข้าสู่ โครงข่ายเส้นทางเลี่ยง มุ่งหน้า ${endAddr.tag}`,
    `3. จุดสิ้นสุด: ถึงจุดบรรจบทางหลวงสายหลัก ${endHwyStr}${endAddr.tag} สัญจรต่อได้ตามปกติ`,
    `- รวมระยะทางเลี่ยง: ประมาณ ${lengthKm} กม.`,
    `- ระยะเวลาเดินทาง: ประมาณ ${Math.ceil(lengthKm * 1.5)} นาที`,
    `- สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ`,
  ];
  return lines.join("\n");
}

export interface AutoDetourAdviceOptions {
  forwardWaypoints?: [number, number][];
  reverseWaypoints?: [number, number][];
}

/**
 * วิเคราะห์ทิศทางและสร้างคำแนะนำทางเลี่ยงอัตโนมัติสำหรับประชาชนแบบ ๒ ทิศทาง (ขาไป A -> B และ ขากลับ B -> A)
 * ดึงชื่อหมู่บ้าน (บ.) ตำบล (ต.) อำเภอ (อ.) ชื่อถนน และจุดเลี้ยวจริง
 * รองรับทั้งทางเลี่ยงแบบไป-กลับคนละเส้นทาง (reverseCoords แยก) และจุดดัดเส้นที่เจ้าหน้าที่วางไว้
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

  // สกัดลำดับพิกัดสำหรับทิศทางขาไป (Forward: A -> B)
  const forwardPoints = buildQueryPoints(detourCoords, options.forwardWaypoints, startCoord, endCoord);

  // สกัดลำดับพิกัดสำหรับทิศทางขากลับ (Reverse: B -> A)
  // ใช้แนว/จุดดัดขากลับจริงก่อน หากไม่มีให้ใช้จุดหักเลี้ยวย้อนลำดับเพื่อให้เครื่องมือนำทางเลือกช่องจราจรฝั่ง B -> A ที่ถูกต้อง
  const reversePoints =
    reverseDetourCoords && reverseDetourCoords.length >= 2
      ? buildQueryPoints(reverseDetourCoords, options.reverseWaypoints, endCoord, startCoord)
      : Array.isArray(options.forwardWaypoints) && options.forwardWaypoints.length > 0
        ? [endCoord, ...[...options.forwardWaypoints].reverse().slice(0, 20), startCoord]
        : buildQueryPoints([...detourCoords].reverse(), undefined, endCoord, startCoord);

  if (directionMode === "FORWARD_ONLY") {
    const forwardText = await buildSingleDirectionAdvice(forwardPoints, "ทิศทางขาไป: จุด A → จุด B", relatedHighwayNo, highwayLayers);
    return `${forwardText}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n- เส้นทางเลี่ยงนี้เปิดใช้งานเฉพาะทิศทางขาไป (A → B) เท่านั้น กรุณาใช้เส้นทางอื่นสำหรับขากลับ`;
  }

  if (directionMode === "REVERSE_ONLY") {
    const reverseText = await buildSingleDirectionAdvice(reversePoints, "ทิศทางขากลับ: จุด B → จุด A", relatedHighwayNo, highwayLayers);
    return `=== ทิศทางขาไป: จุด A → จุด B ===\n- เส้นทางเลี่ยงนี้เปิดใช้งานเฉพาะทิศทางขากลับ (B → A) เท่านั้น กรุณาใช้เส้นทางอื่นสำหรับขาไป\n\n${reverseText}`;
  }

  // สร้างคำแนะนำทั้ง ๒ ทิศทางพร้อมกัน
  const [forwardText, reverseText] = await Promise.all([
    buildSingleDirectionAdvice(forwardPoints, "ทิศทางขาไป: จุด A → จุด B", relatedHighwayNo, highwayLayers),
    buildSingleDirectionAdvice(reversePoints, "ทิศทางขากลับ: จุด B → จุด A", relatedHighwayNo, highwayLayers),
  ]);

  return `${forwardText}\n\n${reverseText}`;
}

/**
 * แยกคำแนะนำการเดินทางของเส้นทางเลี่ยงออกเป็น ๒ ทิศทาง: ขาไป (A → B) และขากลับ (B → A)
 * สำหรับใช้แสดงผลสลับแท็บบนแผนที่และหน้าต่างรายละเอียด
 */
export function splitDetourAdviceByDirection(
  description: string,
  directionMode: string = "TWO_WAY"
): { forwardText: string; reverseText: string } {
  const desc = (description || "").trim();
  if (!desc) {
    return {
      forwardText: "ยังไม่มีคำแนะนำการเดินทางขาไป (A → B)",
      reverseText: "ยังไม่มีคำแนะนำการเดินทางขากลับ (B → A)",
    };
  }

  if (directionMode === "FORWARD_ONLY") {
    return {
      forwardText: desc,
      reverseText: "เส้นทางเลี่ยงนี้เปิดใช้งานเฉพาะทิศทางขาไป (A → B) เท่านั้น กรุณาใช้เส้นทางอื่นสำหรับขากลับ",
    };
  }

  if (directionMode === "REVERSE_ONLY") {
    return {
      forwardText: "เส้นทางเลี่ยงนี้เปิดใช้งานเฉพาะทิศทางขากลับ (B → A) เท่านั้น กรุณาใช้เส้นทางอื่นสำหรับขาไป",
      reverseText: desc,
    };
  }

  // รองรับรูปแบบที่มีส่วนหัว === ทิศทาง... === ๒ ส่วน (แม้พิมพ์หัวข้อขากลับผิดเป็น "ทิศทางขาไป: จุด B → จุด A")
  const extracted = extractDirectionalAdvice(desc);
  if (extracted.hasBoth) {
    return {
      forwardText: extracted.forward || desc,
      reverseText: extracted.reverse || desc,
    };
  }

  const markers = [
    "=== ทิศทางขากลับ",
    "ทิศทางขากลับ: จุด B → จุด A ===",
    "ทิศทางขากลับ:",
    "ขากลับ (จุด B → จุด A):",
    "ขากลับ:",
  ];

  for (const marker of markers) {
    const idx = desc.indexOf(marker);
    if (idx !== -1) {
      let forward = desc.substring(0, idx).trim();
      let reverse = desc.substring(idx).trim();
      // ตัดหัวข้อนำทางเดิมออกเพื่อให้เนื้อหากระชับสวยงาม
      forward = forward.replace(/^===?\s*ทิศทางขาไป[^=]*===?\s*/i, "").trim();
      reverse = reverse.replace(/^===?\s*ทิศทางขากลับ[^=]*===?\s*/i, "").trim();
      return {
        forwardText: forward || desc,
        reverseText: reverse || desc,
      };
    }
  }

  return {
    forwardText: desc,
    reverseText: `ทิศทางขากลับ (จุด B → จุด A):\nวิ่งย้อนเส้นทางตามแนวถนนเดิม หรือใช้คำแนะนำการเดินทางของเส้นทางเลี่ยงนี้ในทิศทางตรงกันข้าม\n\n${desc}`,
  };
}

/**
 * ลดทอนจุดพิกัดส่วนเกินด้วยขั้นตอนวิธี Douglas-Peucker (Point Decimation)
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

export interface ExtractedGisFeature {
  coords: [number, number][];
  properties: Record<string, any>;
  lengthKm: number;
}

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จากไฟล์ KMZ
 */
export async function extractFeaturesFromKmz(file: File): Promise<ExtractedGisFeature[]> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    let kmlContent = "";

    for (const filename of Object.keys(zip.files)) {
      if (filename.toLowerCase().endsWith(".kml")) {
        kmlContent = await zip.files[filename].async("text");
        break;
      }
    }

    if (kmlContent) {
      return extractFeaturesFromKml(kmlContent);
    }
  } catch (err) {
    console.warn("Error parsing KMZ with JSZip:", err);
  }
  return [];
}

/**
 * สกัดแนวเส้นทางจากไฟล์ KMZ (บีบอัดไฟล์ KML ภายใน)
 */
export async function extractLinesFromKmz(file: File): Promise<[number, number][][]> {
  const features = await extractFeaturesFromKmz(file);
  return features.map((f) => f.coords);
}

/**
 * คำนวณแนวเส้นทางเกาะถนนจริงอัตโนมัติผ่าน OSRM (Multi-Tier Failover)
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
  const alternative = "หรือสลับเป็นโหมด \"วาด/แก้ไขอิสระ\" เพื่อลากจุดเอง";
  if (hint === "rate_limited") throw new Error(`ระบบหาเส้นทาง (OSRM) ถูกจำกัดการเรียกชั่วคราว รอประมาณ 1 นาทีแล้วลองใหม่ ${alternative}`);
  if (hint === "no_route") throw new Error(`ไม่พบเส้นทางตามถนนระหว่างจุดที่เลือก ลองขยับจุดให้ใกล้ถนนมากขึ้น ${alternative}`);
  if (hint === "unreachable") throw new Error(`เชื่อมต่อระบบหาเส้นทาง (OSRM) ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ ${alternative}`);
  throw new Error("ไม่สามารถคำนวณเส้นทางตามถนนได้ กรุณาลองใหม่");
}

/**
 * ระบบดัดเส้นถนนแบบ Dual-Source (PostGIS DB -> OSRM -> Straight Line)
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
  // 1. ลองค้นหาตัดจากเลเยอร์โครงข่ายทางหลวงในระบบ (Local / PostGIS Proximity)
  if (highwayLayers.length > 0) {
    for (const layer of highwayLayers) {
      const lines = extractLinesFromGeoJson(layer.geojson_data);
      for (const line of lines) {
        let nearestA = -1;
        let nearestB = -1;
        let minDistA = 0.003; // ~300 เมตร
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
              label: layer.layer_name || "โครงข่ายกรมทางหลวง",
              message: `เกาะตามถนน ${layer.layer_name || "ทล."} จากข้อมูลโครงข่ายในระบบ ✓ — ดัดเส้นเพิ่มได้`,
            };
          }
        }
      }
    }
  }

  // 2. หากไม่พบในระบบ ลองส่งคำนวณผ่าน OSRM (ตัวสำรอง)
  try {
    const osrmResult = await calculateRoadSnappedRoute(start, end, waypoints);
    if (osrmResult && osrmResult.length > 2) {
      return {
        coords: osrmResult,
        via: "osrm",
        message: "สร้างเส้นตามถนนด้วย OSRM (ตัวสำรอง) — ตรวจแนวเส้นก่อนบันทึก",
      };
    }
  } catch (err) { }

  // 3. Fallback เส้นตรง
  const directLine: [number, number][] = [start, ...waypoints, end];
  return {
    coords: directLine,
    via: "line",
    message: "ไม่พบถนนใกล้จุดที่ระบุ จึงลากเส้นตรงให้ — ลากจุดขาวเพื่อดัดตามถนนได้",
  };
}

// PATTANI_DISTRICTS_GEOJSON is imported and re-exported from ./gis-data

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จาก GeoJSON
 */
export function extractFeaturesFromGeoJson(geojsonObj: any): ExtractedGisFeature[] {
  const result: ExtractedGisFeature[] = [];
  try {
    const collections = Array.isArray(geojsonObj) ? geojsonObj : [geojsonObj];
    collections.forEach((col) => {
      const features = col.features || [col];
      features.forEach((f: any) => {
        const geom = f.geometry || f;
        const props = f.properties || {};
        if (!geom) return;
        if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
          result.push(...extractFeaturesFromGeoJson(geom.geometries.map((geometry: any) => ({ type: "Feature", geometry, properties: props }))));
        } else if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
          result.push({
            coords: geom.coordinates,
            properties: props,
            lengthKm: calculatePolylineLengthKm(geom.coordinates),
          });
        } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
          geom.coordinates.forEach((seg: [number, number][]) => {
            result.push({
              coords: seg,
              properties: props,
              lengthKm: calculatePolylineLengthKm(seg),
            });
          });
        }
      });
    });
  } catch (e) {
    console.warn("Error parsing GeoJSON features:", e);
  }
  return result;
}

/**
 * ดึงเส้น LineString / MultiLineString จาก GeoJSON (รองรับแบบเดิม)
 */
export function extractLinesFromGeoJson(geojsonObj: any): [number, number][][] {
  const features = extractFeaturesFromGeoJson(geojsonObj);
  return features.map((f) => f.coords);
}

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จากไฟล์ KML
 */
export function extractFeaturesFromKml(kmlText: string): ExtractedGisFeature[] {
  const result: ExtractedGisFeature[] = [];
  try {
    const xml = new DOMParser().parseFromString(kmlText, "text/xml");
    const placemarks = xml.getElementsByTagName("Placemark");

    if (placemarks.length > 0) {
      for (let i = 0; i < placemarks.length; i++) {
        const p = placemarks[i];
        const nameNode = p.getElementsByTagName("name")[0];
        const descNode = p.getElementsByTagName("description")[0];
        const name = nameNode ? (nameNode.textContent || "").trim() : "";
        const description = descNode ? (descNode.textContent || "").trim() : "";

        const props: Record<string, any> = { name, description };

        // Parse SimpleData in ExtendedData if available
        const simpleDataNodes = p.getElementsByTagName("SimpleData");
        for (let j = 0; j < simpleDataNodes.length; j++) {
          const s = simpleDataNodes[j];
          const attrName = s.getAttribute("name");
          if (attrName) {
            props[attrName] = (s.textContent || "").trim();
          }
        }

        const coordNodes = p.getElementsByTagName("coordinates");
        for (let j = 0; j < coordNodes.length; j++) {
          const raw = (coordNodes[j].textContent || "").trim();
          const pts = raw
            .split(/\s+/)
            .map((chunk) => {
              const [lon, lat] = chunk.split(",");
              return [Number(lon), Number(lat)] as [number, number];
            })
            .filter((pt) => !isNaN(pt[0]) && !isNaN(pt[1]));

          if (pts.length >= 2) {
            result.push({
              coords: pts,
              properties: props,
              lengthKm: calculatePolylineLengthKm(pts),
            });
          }
        }
      }
    } else {
      // Fallback for coordinate nodes without Placemarks
      const coordNodes = xml.getElementsByTagName("coordinates");
      for (let i = 0; i < coordNodes.length; i++) {
        const raw = (coordNodes[i].textContent || "").trim();
        const pts = raw
          .split(/\s+/)
          .map((chunk) => {
            const [lon, lat] = chunk.split(",");
            return [Number(lon), Number(lat)] as [number, number];
          })
          .filter((pt) => !isNaN(pt[0]) && !isNaN(pt[1]));

        if (pts.length >= 2) {
          result.push({
            coords: pts,
            properties: { name: `เส้นทางที่ ${i + 1}`, description: "" },
            lengthKm: calculatePolylineLengthKm(pts),
          });
        }
      }
    }
  } catch (e) {
    console.warn("Error parsing KML features:", e);
  }
  return result;
}

/**
 * สกัดแนวเส้นทางจากเนื้อหาไฟล์ KML (รองรับแบบเดิม)
 */
export function extractLinesFromKml(kmlText: string): [number, number][][] {
  const features = extractFeaturesFromKml(kmlText);
  return features.map((f) => f.coords);
}

/**
 * ดึงรายชื่อฟิลด์ Attribute ทั้งหมดที่มีในชุดข้อมูล GIS
 */
export function extractAvailableGisFields(features: ExtractedGisFeature[]): string[] {
  const fieldSet = new Set<string>();
  features.forEach((f) => {
    Object.keys(f.properties || {}).forEach((k) => {
      if (k && typeof k === "string") fieldSet.add(k);
    });
  });
  return Array.from(fieldSet);
}

/**
 * ตรวจจับการจับคู่ฟิลด์อัจฉริยะ (Smart Field Mapping) ตามมาตรฐานข้อมูลกรมทางหลวง
 */
export function detectSmartFieldMapping(fields: string[]): {
  routeCodeField: string;
  routeNameField: string;
  routeTypeField: string;
} {
  let routeCodeField = "";
  let routeNameField = "";
  let routeTypeField = "";

  for (const f of fields) {
    const lower = f.toLowerCase();
    if (!routeCodeField && /^(road_?no|route_?no|route|hwy_?no|hwy|code|ref|สายทาง|ทล|no)$/i.test(lower)) {
      routeCodeField = f;
    }
    if (!routeNameField && /^(road_?name|name|section_?name|section|desc|description|label|title|ชื่อสายทาง)$/i.test(lower)) {
      routeNameField = f;
    }
    if (!routeTypeField && /^(class|type|category|hier|road_?type|ประเภท)$/i.test(lower)) {
      routeTypeField = f;
    }
  }

  return { routeCodeField, routeNameField, routeTypeField };
}

/**
 * แปลงไฟล์ภาพเป็น Base64 Data URL แบบย่อขนาด (Resize)
 */
export function compressImageToBase64(file: File, maxDimension = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = img.width > maxDimension ? maxDimension / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * บีบอัดรูปภาพแบบ Adaptive รับประกันขนาดไม่เกินเพดานที่กำหนด (ค่าเริ่มต้น 300 KB)
 * ปรับลดความละเอียดและคุณภาพอย่างเป็นลำดับ โดยใช้ WebP เป็นอันดับแรก (Fallback เป็น JPEG)
 * การวาดผ่าน Canvas ช่วยล้าง EXIF metadata ป้องกันข้อมูลตำแหน่งส่วนตัวและลดขนาดไฟล์ลงทันที
 */
export async function compressImageToAdaptiveBase64(
  file: File,
  maxSizeBytes = 300 * 1024
): Promise<{ dataUrl: string; sizeBytes: number; format?: "webp" | "jpeg" }> {
  // สร้าง image element จากไฟล์
  const dataUrlOriginal = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrlOriginal;
  });

  // ตรวจสอบการรองรับ WebP บน Canvas
  let supportsWebp = false;
  try {
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 1;
    testCanvas.height = 1;
    supportsWebp = testCanvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    supportsWebp = false;
  }
  const preferredMime = supportsWebp ? "image/webp" : "image/jpeg";

  // ลำดับขั้นตอนการลดขนาด: [maxDimension, quality]
  const stages: Array<[number, number]> = [
    [1280, 0.82],
    [1024, 0.75],
    [840, 0.65],
    [680, 0.55],
    [540, 0.45],
    [420, 0.38],
    [320, 0.32],
  ];

  let bestDataUrl = dataUrlOriginal;
  let bestSizeBytes = Math.round((bestDataUrl.length * 3) / 4);
  let bestFormat: "webp" | "jpeg" = "jpeg";

  for (const [maxDim, quality] of stages) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.drawImage(img, 0, 0, targetW, targetH);
    let candidateUrl = canvas.toDataURL(preferredMime, quality);
    let chosenFormat: "webp" | "jpeg" = candidateUrl.startsWith("data:image/webp") ? "webp" : "jpeg";

    if (preferredMime === "image/webp" && !candidateUrl.startsWith("data:image/webp")) {
      candidateUrl = canvas.toDataURL("image/jpeg", quality);
      chosenFormat = "jpeg";
    }

    const candidateSize = Math.round((candidateUrl.length * 3) / 4);

    bestDataUrl = candidateUrl;
    bestSizeBytes = candidateSize;
    bestFormat = chosenFormat;

    if (candidateSize <= maxSizeBytes) {
      break;
    }
  }

  return { dataUrl: bestDataUrl, sizeBytes: bestSizeBytes, format: bestFormat };
}

/**
 * ตัดช่วงพิกัด (LineString) จากเส้นทางหลวงหลักตามช่วงกิโลเมตรและทิศทาง (Linear Referencing)
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

  // คำนวณระยะทางสะสมตามจุดพิกัดจริง (เมตร)
  const cumDist: number[] = [0];
  for (let i = 1; i < polylineCoords.length; i++) {
    const d = haversineDistanceKm(polylineCoords[i - 1], polylineCoords[i]) * 1000;
    cumDist.push(cumDist[i - 1] + d);
  }
  const totalGeomMeters = cumDist[cumDist.length - 1];
  if (totalGeomMeters <= 0) return polylineCoords;

  // คำนวณตำแหน่งสัดส่วนตามแนวสายทางจริง (Physical linear reference along the geometry from index 0 to last)
  // ที่ index 0 มีค่าหลักกิโลเมตร = sKm, ที่ index สุดท้าย มีค่าหลักกิโลเมตร = eKm
  const kmSpan = eKm - sKm;
  const fStart = (tStart - sKm) / kmSpan;
  const fEnd = (tEnd - sKm) / kmSpan;

  const clampedStart = Math.max(0, Math.min(1, fStart));
  const clampedEnd = Math.max(0, Math.min(1, fEnd));

  const minFraction = Math.min(clampedStart, clampedEnd);
  const maxFraction = Math.max(clampedStart, clampedEnd);

  const targetDistStart = minFraction * totalGeomMeters;
  const targetDistEnd = maxFraction * totalGeomMeters;

  // ฟังก์ชันหาพิกัด ณ ระยะทาง dMeters
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

  // ตรวจสอบทิศทางการจัดเรียงพิกัดผลลัพธ์ (Coordinate sequence order):
  // หากผู้ใช้ต้องการทิศทางย้อนกลับ (B_TO_A หรือ targetKmStart > targetKmEnd)
  // ลำดับพิกัดต้องเริ่มจากจุด กม. มาก ไปหาจุด กม. น้อย เพื่อแสดงทิศทางการขับขี่ที่ถูกต้อง
  const wantsHighToLow = isReverseOrientation || tStart > tEnd;
  const isCurrentlyLowToHigh = sKm < eKm;

  if (wantsHighToLow && isCurrentlyLowToHigh) {
    sliced.reverse();
  } else if (!wantsHighToLow && !isCurrentlyLowToHigh) {
    sliced.reverse();
  }

  return sliced.length >= 2 ? sliced : polylineCoords;
}

/**
 * ดึงชื่อตำบล อำเภอ จังหวัด อัตโนมัติจากพิกัด (ตัวดึงข้อมูลพื้นที่กลาง: Longdo → OSM Nominatim → ข้อมูลภายใน)
 * confidence = "high" เมื่อได้ชื่อตำบลจากแหล่งออนไลน์ ส่วน "medium"/"low" ควรให้เจ้าหน้าที่ตรวจสอบก่อนใช้
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
 * ตรวจสอบว่าแนวเส้นทางสองเส้นอยู่ใกล้หรือตัดกันภายในระยะที่กำหนด (เมตร) หรือไม่
 * ใช้สำหรับตรวจจับว่าเส้นทางเลี่ยงวิ่งผ่าจุดน้ำท่วมที่ปิดการจราจร (CLOSED) หรือไม่
 * และตรวจว่าเส้น A->B กับ B->A เป็นถนนเส้นเดี่ยวหรือถนนแยกฝั่งจราจร
 */
export function pointToSegmentDistanceMeters(
  pt: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
): number {
  const cosLat = Math.cos(((segStart[1] + segEnd[1]) * 0.5 * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * cosLat;

  const px = (pt[0] - segStart[0]) * mPerDegLon;
  const py = (pt[1] - segStart[1]) * mPerDegLat;
  const dx = (segEnd[0] - segStart[0]) * mPerDegLon;
  const dy = (segEnd[1] - segStart[1]) * mPerDegLat;

  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  const projX = t * dx;
  const projY = t * dy;
  return Math.hypot(px - projX, py - projY);
}

function segmentsIntersect2D(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const ccw = (p1: [number, number], p2: [number, number], p3: [number, number]) =>
    (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

export interface ClosedRoadConflict {
  floodId: string;
  routeNo: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  trafficStatus: string;
  direction: "FORWARD" | "REVERSE";
  conflictPoint: [number, number];
}

function detectFloodStatusConflicts(
  detourCoords: [number, number][],
  floodRoutes: Array<{
    id: string;
    route_no: string;
    section_name: string;
    km_start: string;
    km_end: string;
    is_active: boolean;
    traffic_status: string;
    coordinates_json: string | [number, number][];
  }>,
  targetStatuses: Set<string>,
  direction: "FORWARD" | "REVERSE" = "FORWARD",
  thresholdMeters = 22
): ClosedRoadConflict[] {
  if (!Array.isArray(detourCoords) || detourCoords.length < 2) return [];
  const startPt = detourCoords[0];
  const endPt = detourCoords[detourCoords.length - 1];
  const conflicts: ClosedRoadConflict[] = [];

  for (const flood of floodRoutes || []) {
    if (!flood.is_active || !targetStatuses.has(flood.traffic_status)) continue;
    let fCoords: [number, number][] = [];
    try {
      fCoords = Array.isArray(flood.coordinates_json)
        ? (flood.coordinates_json as [number, number][])
        : typeof flood.coordinates_json === "string"
        ? JSON.parse(flood.coordinates_json)
        : [];
    } catch {
      fCoords = [];
    }
    if (fCoords.length < 2) continue;

    let hitPoint: [number, number] | null = null;
    for (let i = 0; i < detourCoords.length - 1 && !hitPoint; i++) {
      const d1 = detourCoords[i];
      const d2 = detourCoords[i + 1];
      const midD: [number, number] = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];

      // ยกเว้นบริเวณจุดเชื่อมต่อปากทางเริ่มต้น/สิ้นสุดระยะ 45 เมตร
      if (
        haversineDistanceKm(midD, startPt) < 0.045 ||
        haversineDistanceKm(midD, endPt) < 0.045
      ) {
        continue;
      }

      for (let j = 0; j < fCoords.length - 1; j++) {
        const f1 = fCoords[j];
        const f2 = fCoords[j + 1];
        if (segmentsIntersect2D(d1, d2, f1, f2)) {
          hitPoint = midD;
          break;
        }
        const dist1 = pointToSegmentDistanceMeters(d1, f1, f2);
        const dist2 = pointToSegmentDistanceMeters(midD, f1, f2);
        if (Math.min(dist1, dist2) <= thresholdMeters) {
          hitPoint = midD;
          break;
        }
      }
    }

    if (hitPoint) {
      conflicts.push({
        floodId: flood.id,
        routeNo: flood.route_no,
        sectionName: flood.section_name,
        kmStart: flood.km_start,
        kmEnd: flood.km_end,
        trafficStatus: flood.traffic_status,
        direction,
        conflictPoint: hitPoint,
      });
    }
  }

  return conflicts;
}

/**
 * ตรวจสอบว่าเส้นทางเลี่ยง (A->B หรือ B->A) วิ่งตัดหรือทับช่วงถนนที่ปิดการจราจร (CLOSED) หรือไม่
 * ไม่นับปลายจุดเริ่มต้น/สิ้นสุดระยะ 45 เมตรแรกเพื่อให้ทางเลี่ยงสามารถเริ่มต้นจากปากทางก่อนจุดปิดถนนได้
 */
export function detectClosedRoadConflicts(
  detourCoords: [number, number][],
  floodRoutes: Array<{
    id: string;
    route_no: string;
    section_name: string;
    km_start: string;
    km_end: string;
    is_active: boolean;
    traffic_status: string;
    coordinates_json: string | [number, number][];
  }>,
  direction: "FORWARD" | "REVERSE" = "FORWARD",
  thresholdMeters = 22
): ClosedRoadConflict[] {
  return detectFloodStatusConflicts(detourCoords, floodRoutes, new Set(["CLOSED"]), direction, thresholdMeters);
}

/**
 * ตรวจสอบคำเตือนเมื่อทางเลี่ยงวิ่งผ่านช่วงที่รถเล็กผ่านไม่ได้ (WARNING) หรือผ่านได้ ๑ ช่องทาง (ONE_LANE)
 */
export function detectPassabilityFloodWarnings(
  detourCoords: [number, number][],
  floodRoutes: Array<{
    id: string;
    route_no: string;
    section_name: string;
    km_start: string;
    km_end: string;
    is_active: boolean;
    traffic_status: string;
    coordinates_json: string | [number, number][];
  }>,
  direction: "FORWARD" | "REVERSE" = "FORWARD",
  thresholdMeters = 22
): ClosedRoadConflict[] {
  return detectFloodStatusConflicts(
    detourCoords,
    floodRoutes,
    new Set(["WARNING", "ONE_LANE"]),
    direction,
    thresholdMeters
  );
}

/**
 * ตรวจสอบว่าเส้นทางขาไป (A->B) และขากลับ (B->A) แยกฝั่งจราจรกัน (Dual Carriageway / Asymmetric) หรือเป็นเส้นเดี่ยวเดียวกัน
 */
export function analyzeCarriagewaySeparation(
  forwardCoords: [number, number][],
  reverseCoords: [number, number][]
): {
  structure: "SINGLE_CENTERLINE" | "DUAL_CARRIAGEWAY" | "ASYMMETRIC_DETOUR";
  avgSeparationMeters: number;
  maxSeparationMeters: number;
  medianSeparationMeters: number;
  isSymmetricSingleLine: boolean;
} {
  if (forwardCoords.length < 2 || reverseCoords.length < 2) {
    return {
      structure: "SINGLE_CENTERLINE",
      avgSeparationMeters: 0,
      maxSeparationMeters: 0,
      medianSeparationMeters: 0,
      isSymmetricSingleLine: true,
    };
  }

  const sampleCount = Math.min(25, forwardCoords.length);
  const step = Math.max(1, Math.floor(forwardCoords.length / sampleCount));
  let sumDist = 0;
  let maxDist = 0;
  let count = 0;

  for (let i = 1; i < forwardCoords.length - 1; i += step) {
    const pt = forwardCoords[i];
    let minD = Infinity;
    for (let j = 0; j < reverseCoords.length - 1; j++) {
      const d = pointToSegmentDistanceMeters(pt, reverseCoords[j], reverseCoords[j + 1]);
      if (d < minD) minD = d;
    }
    if (Number.isFinite(minD)) {
      sumDist += minD;
      if (minD > maxDist) maxDist = minD;
      count++;
    }
  }

  const avg = count > 0 ? sumDist / count : 0;
  const roundedAvg = Number(avg.toFixed(1));
  if (maxDist > 60 || avg > 35) {
    return {
      structure: "ASYMMETRIC_DETOUR",
      avgSeparationMeters: Math.round(avg),
      maxSeparationMeters: Math.round(maxDist),
      medianSeparationMeters: Math.round(avg),
      isSymmetricSingleLine: false,
    };
  }
  if (avg >= 3.5 || maxDist >= 6) {
    return {
      structure: "DUAL_CARRIAGEWAY",
      avgSeparationMeters: roundedAvg,
      maxSeparationMeters: Number(maxDist.toFixed(1)),
      medianSeparationMeters: roundedAvg,
      isSymmetricSingleLine: false,
    };
  }
  return {
    structure: "SINGLE_CENTERLINE",
    avgSeparationMeters: roundedAvg,
    maxSeparationMeters: Number(maxDist.toFixed(1)),
    medianSeparationMeters: roundedAvg,
    isSymmetricSingleLine: true,
  };
}

/**
 * คำนวณมุมทิศทาง (Bearing 0-360 องศา) จากพิกัดที่ 1 ไปพิกัดที่ 2
 */
export function calculateGeoBearing(from: [number, number], to: [number, number]): number {
  const fromLat = (from[1] * Math.PI) / 180;
  const toLat = (to[1] * Math.PI) / 180;
  const deltaLon = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

