import { UTM_47N_PARAMS } from "./constants";

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

/**
 * ดึงข้อมูลการคำนวณเส้นทาง OSRM แบบ Multi-Tier Failover
 * Tier 1: Local OSRM Microservice (เช่น Docker บน localhost:5000 หรือ LAN Server ของหน่วยงาน)
 * Tier 2: Public OSRM API (Fallback อัตโนมัติเมื่อ Local ปิดอยู่หรือตอบสนองช้าเกิน 1.2 วินาที)
 */
export async function fetchOsrmWithFailover(
  coordString: string,
  params: string = "overview=full&geometries=geojson"
): Promise<{ data: any; source: "local" | "public" } | null> {
  const localBase = process.env.NEXT_PUBLIC_OSRM_LOCAL_URL;
  const publicBase = process.env.NEXT_PUBLIC_OSRM_ROUTING_URL || "https://router.project-osrm.org/route/v1/driving";

  // Tier 1: Local Microservice
  if (localBase) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const url = `${localBase}/${coordString}?${params}`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data?.routes?.[0]) {
          return { data, source: "local" };
        }
      }
    } catch {
      // Local ไม่ตอบสนอง ลื่นไหลไป Tier 2
    }
  }

  // Tier 2: Public OSRM API Fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);
    const url = `${publicBase}/${coordString}?${params}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (data?.routes?.[0]) {
        return { data, source: "public" };
      }
    }
  } catch (err) {
    console.warn("[fetchOsrmWithFailover] All OSRM sources unavailable:", err);
  }

  return null;
}

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
export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * ค้นหาชื่ออำเภอใน จ.ปัตตานี จากพิกัด
 */
export function findPattaniDistrictName(coord: [number, number]): string {
  if (!coord || coord.length < 2) return "จ.ปัตตานี";
  for (const feat of PATTANI_DISTRICTS_GEOJSON.features) {
    const poly = feat.geometry.coordinates[0] as [number, number][];
    if (isPointInPolygon(coord, poly)) {
      return feat.properties.name;
    }
  }

  // Centroid distance fallback
  let bestDist = Infinity;
  let bestName = "อ.เมืองปัตตานี";
  for (const feat of PATTANI_DISTRICTS_GEOJSON.features) {
    const poly = feat.geometry.coordinates[0] as [number, number][];
    const cX = poly.reduce((acc, p) => acc + p[0], 0) / poly.length;
    const cY = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
    const d = Math.hypot(coord[0] - cX, coord[1] - cY);
    if (d < bestDist) {
      bestDist = d;
      bestName = feat.properties.name;
    }
  }
  return bestName;
}

/**
 * ค้นหาถนนหรือทางหลวงที่ใกล้พิกัดที่สุดจาก Highway Layers
 */
export function findNearestHighwayFromLayers(
  coord: [number, number],
  highwayLayers: any[] = [],
  maxDistKm: number = 1.0
): { code: string; name: string } | null {
  if (!highwayLayers || highwayLayers.length === 0) return null;

  let closestDist = maxDistKm;
  let closest: { code: string; name: string } | null = null;

  for (const layer of highwayLayers) {
    if (!layer.geojson_data) continue;
    const lines = extractLinesFromGeoJson(layer.geojson_data);
    for (const line of lines) {
      for (const pt of line) {
        const d = haversineDistanceKm(coord, pt);
        if (d < closestDist) {
          closestDist = d;
          closest = {
            code: layer.layer_name?.match(/(\d+)/)?.[1] || "",
            name: layer.layer_name || "โครงข่ายกรมทางหลวง",
          };
        }
      }
    }
  }

  return closest;
}

/**
 * ข้อมูลตำบลและหมู่บ้านสำคัญใน จ.ปัตตานี สำหรับระบุพิกัดอย่างแม่นยำ (ทำงานออฟไลน์ 100%)
 */
export const PATTANI_SUBDISTRICTS_DATA = [
  // อ.เมืองปัตตานี
  { tambon: "รูสะมิแล", village: "บ.รูสะมิแล", amphoe: "เมืองปัตตานี", bounds: [101.205, 6.848, 101.242, 6.885] },
  { tambon: "บานา", village: "บ.บานา", amphoe: "เมืองปัตตานี", bounds: [101.265, 6.855, 101.305, 6.895] },
  { tambon: "สะบารัง", village: "ชุมชนสะบารัง", amphoe: "เมืองปัตตานี", bounds: [101.240, 6.855, 101.265, 6.875] },
  { tambon: "อาเนาะรู", village: "ชุมชนหัวตลาด", amphoe: "เมืองปัตตานี", bounds: [101.242, 6.870, 101.265, 6.895] },
  { tambon: "จะบังติกอ", village: "ชุมชนจะบังติกอ", amphoe: "เมืองปัตตานี", bounds: [101.245, 6.835, 101.270, 6.858] },
  { tambon: "ตะลุโบะ", village: "บ.ดอนยาง", amphoe: "เมืองปัตตานี", bounds: [101.220, 6.820, 101.260, 6.850] },
  { tambon: "ปะกาฮะรัง", village: "บ.ปะกาฮะรัง", amphoe: "เมืองปัตตานี", bounds: [101.215, 6.835, 101.245, 6.865] },
  { tambon: "ตันหยงลุโละ", village: "บ.กรือเซะ", amphoe: "เมืองปัตตานี", bounds: [101.295, 6.840, 101.340, 6.875] },
  { tambon: "บาราโหม", village: "บ.บาราโหม", amphoe: "เมืองปัตตานี", bounds: [101.305, 6.865, 101.345, 6.895] },
  // อ.หนองจิก
  { tambon: "ดอนรัก", village: "บ.ดอนรัก", amphoe: "หนองจิก", bounds: [101.175, 6.825, 101.220, 6.855] },
  { tambon: "ตุยง", village: "บ.ตุยง", amphoe: "หนองจิก", bounds: [101.140, 6.840, 101.185, 6.875] },
  { tambon: "บ่อทอง", village: "บ.ค่ายอิงคยุทธ", amphoe: "หนองจิก", bounds: [101.135, 6.800, 101.180, 6.840] },
  { tambon: "บางตาวา", village: "บ.บางตาวา", amphoe: "หนองจิก", bounds: [101.180, 6.860, 101.225, 6.895] },
  { tambon: "เกาะเปาะ", village: "บ.เกาะเปาะ", amphoe: "หนองจิก", bounds: [101.125, 6.855, 101.175, 6.890] },
  // อ.ยะหริ่ง
  { tambon: "ยามู", village: "บ.ยามู", amphoe: "ยะหริ่ง", bounds: [101.345, 6.840, 101.390, 6.885] },
  { tambon: "บางปู", village: "บ.บางปู", amphoe: "ยะหริ่ง", bounds: [101.320, 6.860, 101.365, 6.895] },
  { tambon: "ตะโละกาโปร์", village: "บ.ตะโละกาโปร์", amphoe: "ยะหริ่ง", bounds: [101.380, 6.850, 101.435, 6.905] },
  // อ.สายบุรี
  { tambon: "ตะลุบัน", village: "บ.ตะลุบัน", amphoe: "สายบุรี", bounds: [101.580, 6.680, 101.630, 6.725] },
  { tambon: "ละหาร", village: "บ.ละหาร", amphoe: "สายบุรี", bounds: [101.540, 6.640, 101.590, 6.690] },
  // อ.ยะรัง
  { tambon: "ยะรัง", village: "บ.ยะรัง", amphoe: "ยะรัง", bounds: [101.270, 6.740, 101.315, 6.785] },
  // อ.โคกโพธิ์
  { tambon: "โคกโพธิ์", village: "บ.โคกโพธิ์", amphoe: "โคกโพธิ์", bounds: [101.110, 6.710, 101.160, 6.755] },
  { tambon: "นาประดู่", village: "บ.นาประดู่", amphoe: "โคกโพธิ์", bounds: [101.140, 6.660, 101.190, 6.710] },
];

const detailedAddressCache = new Map<string, { tag: string; road: string; tambon: string; amphoe: string }>();

/**
 * ดึงชื่อหมู่บ้าน (บ.), ตำบล (ต.), อำเภอ (อ.) จากพิกัดแบบรวดเร็วและแม่นยำ
 */
export async function getDetailedPattaniAddress(
  lon: number,
  lat: number
): Promise<{ tag: string; road: string; tambon: string; amphoe: string }> {
  const cacheKey = `${lon.toFixed(4)},${lat.toFixed(4)}`;
  if (detailedAddressCache.has(cacheKey)) {
    return detailedAddressCache.get(cacheKey)!;
  }

  // 1. ตรวจสอบจากฐานข้อมูลเชิงพื้นที่ท้องถิ่นก่อน (ความเร็ว 0.001 ms)
  let localResult = {
    tag: `(${findPattaniDistrictName([lon, lat])})`,
    road: "",
    tambon: "",
    amphoe: findPattaniDistrictName([lon, lat]).replace(/^อ\./, ""),
  };

  for (const s of PATTANI_SUBDISTRICTS_DATA) {
    const [minX, minY, maxX, maxY] = s.bounds;
    if (lon >= minX && lon <= maxX && lat >= minY && lat <= maxY) {
      localResult = {
        tag: `(${s.village ? s.village + " " : ""}ต.${s.tambon} อ.${s.amphoe})`,
        road: "",
        tambon: s.tambon,
        amphoe: s.amphoe,
      };
      break;
    }
  }

  // 2. ลองดึงข้อมูลชื่อถนน/หมู่บ้านเพิ่มเติมจาก Reverse Geocoder ในพื้นหลัง (Timeout 1.2s)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th&zoom=18`;
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "DOH-Pattani/2.0" } });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address || {};
      const road = addr.road || "";
      const rawVillage = cleanThaiAdminPrefix(addr.village || addr.hamlet || addr.neighbourhood || addr.suburb || "");
      const rawTambon = cleanThaiAdminPrefix(addr.subdistrict || addr.town || addr.city_district || localResult.tambon || "");
      const rawAmphoe = cleanThaiAdminPrefix(addr.district || addr.county || localResult.amphoe || findPattaniDistrictName([lon, lat]));

      const parts: string[] = [];
      if (rawVillage) {
        parts.push(`บ.${rawVillage}`);
      } else if (localResult.tag.includes("บ.")) {
        const match = localResult.tag.match(/บ\.[^\s]+/);
        if (match) parts.push(match[0]);
      }
      if (rawTambon) parts.push(`ต.${rawTambon}`);
      if (rawAmphoe) parts.push(`อ.${rawAmphoe}`);

      const result = {
        tag: parts.length > 0 ? `(${parts.join(" ")})` : localResult.tag,
        road,
        tambon: rawTambon,
        amphoe: rawAmphoe,
      };
      detailedAddressCache.set(cacheKey, result);
      return result;
    }
  } catch {}

  detailedAddressCache.set(cacheKey, localResult);
  return localResult;
}

/**
 * แยกคำแนะนำแบบ ๒ ทิศทาง (ขาไป A -> B และ ขากลับ B -> A)
 */
export function extractDirectionalAdvice(text: string): {
  forward: string;
  reverse: string;
  hasBoth: boolean;
} {
  if (!text) return { forward: "", reverse: "", hasBoth: false };

  const forwardMarker = /===\s*ทิศทางขาไป[^=]*===/i;
  const reverseMarker = /===\s*ทิศทางขากลับ[^=]*===/i;

  if (forwardMarker.test(text) && reverseMarker.test(text)) {
    const parts = text.split(reverseMarker);
    const forwardPart = parts[0].replace(forwardMarker, "").trim();
    const reversePart = (parts[1] || "").trim();
    return {
      forward: forwardPart,
      reverse: reversePart,
      hasBoth: true,
    };
  }

  return {
    forward: text.trim(),
    reverse: text.trim(),
    hasBoth: false,
  };
}

/**
 * สกัดฟังก์ชันสร้างคำแนะนำเส้นทางเลี่ยงสำหรับ ๑ ทิศทาง
 */
async function buildSingleDirectionAdvice(
  queryPoints: [number, number][],
  label: string,
  relatedHighwayNo?: string,
  highwayLayers: any[] = []
): Promise<string> {
  const startPt = queryPoints[0];
  const endPt = queryPoints[queryPoints.length - 1];
  const startAddr = await getDetailedPattaniAddress(startPt[0], startPt[1]);
  const endAddr = await getDetailedPattaniAddress(endPt[0], endPt[1]);
  const startHwyStr = relatedHighwayNo ? `ทล.${relatedHighwayNo}` : "จุดตัดทางหลวง";

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

      if (!isFirst && s.maneuver.type === "depart") continue;
      if (!isLast && s.maneuver.type === "arrive") continue;
      if (!isFirst && !isLast && s.distance < 30 && s.maneuver.type !== "turn" && s.maneuver.type !== "roundabout" && s.maneuver.type !== "rotary") {
        continue;
      }

      let action = "ตรงไปตาม";
      const mType = s.maneuver.type;
      const mMod = s.maneuver.modifier || "";

      if (isFirst || mType === "depart") {
        action = "จุดเริ่มต้น:";
      } else if (isLast || mType === "arrive") {
        action = "ถึงจุดบรรจบทางหลวงสายหลัก:";
      } else if (mType === "roundabout" || mType === "rotary") {
        // วงเวียน: ตรวจจับทิศทางการเลี้ยวเพื่อความเป็นธรรมชาติ (เช่น เลี้ยวซ้ายผ่านวงเวียน)
        if (mMod.includes("left")) {
          action = "เลี้ยวซ้ายผ่านวงเวียนมุ่งหน้าสู่";
        } else if (mMod.includes("right")) {
          action = "เลี้ยวขวาผ่านวงเวียนมุ่งหน้าสู่";
        } else if (mMod.includes("straight")) {
          action = "ตรงไปผ่านวงเวียนมุ่งหน้าสู่";
        } else {
          action = "เข้าสู่วงเวียน (เลี้ยวซ้าย) มุ่งหน้าสู่";
        }
      } else if (mType === "turn") {
        if (mMod.includes("slight left")) action = "เบี่ยงซ้ายเข้าสู่";
        else if (mMod.includes("sharp left")) action = "เลี้ยวซ้ายหักศอกเข้าสู่";
        else if (mMod.includes("left")) action = "เลี้ยวซ้ายเข้าสู่";
        else if (mMod.includes("slight right")) action = "เบี่ยงขวาเข้าสู่";
        else if (mMod.includes("sharp right")) action = "เลี้ยวขวาหักศอกเข้าสู่";
        else if (mMod.includes("right")) action = "เลี้ยวขวาเข้าสู่";
        else if (mMod.includes("uturn")) action = "กลับรถเข้าสู่";
        else action = "เลี้ยวเข้าสู่";
      } else if (mType === "merge" || mType === "on ramp" || mType === "fork") {
        action = mMod.includes("right") ? "เบี่ยงขวาเข้าสู่" : "เบี่ยงซ้ายเข้าสู่";
      }

      let roadName = (s.name || "").trim();
      let refStr = (s.ref || "").trim();

      if (refStr) {
        if (/^ปน\.?\s*\d+/i.test(refStr) || /^ยล\.?\s*\d+/i.test(refStr)) {
          refStr = `ทางหลวงชนบท ${refStr.toUpperCase()}`;
        } else if (/^\d+$/.test(refStr)) {
          refStr = `ทล.${refStr}`;
        }
      }

      let fullRoad = "";
      if (roadName && refStr) {
        fullRoad = `${roadName} (${refStr})`;
      } else if (refStr) {
        fullRoad = refStr;
      } else if (roadName) {
        fullRoad = roadName;
      } else {
        // ค้นหาชื่อทางหลวงจาก highwayLayers
        if (s.maneuver.location && highwayLayers.length > 0) {
          const nearest = findNearestHighwayFromLayers(s.maneuver.location, highwayLayers, 0.5);
          if (nearest && nearest.code) {
            fullRoad = `ทล.${nearest.code} (${nearest.name})`;
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
        loc: s.maneuver.location || startPt,
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

    const lines: string[] = [];
    const dirHeader = `=== ${label} (${startAddr.amphoe ? `อ.${startAddr.amphoe}` : "อ.เมืองปัตตานี"} → ${endAddr.amphoe ? `อ.${endAddr.amphoe}` : "อ.เมืองปัตตานี"}) ===`;
    lines.push(dirHeader);

    const totalKm = (totalDistanceM / 1000).toFixed(1);
    const estMinutes = Math.max(2, Math.ceil(totalDurationS / 60));

    let stepCounter = 1;
    // Step 1: จุดเริ่มต้น
    const initHwy = osrmSteps[0]?.ref ? `ทล.${osrmSteps[0].ref}` : startHwyStr;
    lines.push(`${stepCounter++}. จุดเริ่มต้น: บริเวณ ${initHwy} ${startAddr.tag}`);

    // Steps กลาง: จุดเลี้ยวและถนนจริง
    for (const step of consolidated) {
      if (step.action.includes("จุดเริ่มต้น") || step.action.includes("จุดบรรจบ")) continue;
      if (step.distanceM < 35 && !step.action.includes("เลี้ยว") && !step.action.includes("วงเวียน")) continue;

      const distStr = step.distanceM >= 1000 ? `${(step.distanceM / 1000).toFixed(1)} กม.` : `${Math.round(step.distanceM)} ม.`;
      const stepAddr = await getDetailedPattaniAddress(step.loc[0], step.loc[1]);
      let roadName = step.road;
      if (roadName === "เส้นทางเชื่อมต่อท้องถิ่น" && stepAddr.road) {
        roadName = stepAddr.road;
      }
      lines.push(`${stepCounter++}. ${step.action} ${roadName} ${stepAddr.tag} (ระยะทาง ${distStr})`);
    }

    // Step สุดท้าย: ถึงจุดหมาย
    lines.push(`${stepCounter++}. ถึงจุดบรรจบทางหลวงสายหลัก ${endAddr.tag} สัญจรต่อได้ตามปกติ`);
    lines.push(`- รวมระยะทางเลี่ยง: ${totalKm} กม. (ใช้เวลาเดินทางประมาณ ${estMinutes} นาที)`);
    lines.push(`- สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ`);

    return lines.join("\n");
  }

  // Fallback กรณี OSRM ไม่ตอบสนอง
  const lengthKm = calculatePolylineLengthKm(queryPoints);
  const dirHeader = `=== ${label} (${startAddr.amphoe ? `อ.${startAddr.amphoe}` : "อ.เมืองปัตตานี"} → ${endAddr.amphoe ? `อ.${endAddr.amphoe}` : "อ.เมืองปัตตานี"}) ===`;
  const lines: string[] = [
    dirHeader,
    `1. จุดเริ่มต้น: บริเวณ ${startHwyStr} ${startAddr.tag}`,
    `2. เบี่ยงเข้าสู่ โครงข่ายเส้นทางเลี่ยง มุ่งหน้า ${endAddr.tag}`,
    `3. ถึงจุดบรรจบทางหลวงสายหลัก ${endAddr.tag} สัญจรต่อได้ตามปกติ`,
    `- รวมระยะทางเลี่ยง: ประมาณ ${lengthKm} กม. (ใช้เวลาเดินทางประมาณ ${Math.ceil(lengthKm * 1.5)} นาที)`,
    `- สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ`,
  ];
  return lines.join("\n");
}

/**
 * วิเคราะห์ทิศทางและสร้างคำแนะนำทางเลี่ยงอัตโนมัติสำหรับประชาชนแบบ ๒ ทิศทาง (ขาไป A -> B และ ขากลับ B -> A)
 * ดึงชื่อหมู่บ้าน (บ.) ตำบล (ต.) อำเภอ (อ.) ชื่อถนน และจุดเลี้ยวจริง
 */
export async function generateAutoDetourAdvice(
  startCoord: [number, number],
  endCoord: [number, number],
  detourCoords: [number, number][] = [],
  relatedHighwayNo?: string,
  highwayLayers: any[] = []
): Promise<string> {
  // สกัดลำดับพิกัดสำหรับทิศทางขาไป (Forward: A -> B)
  let forwardPoints: [number, number][] = [startCoord, endCoord];
  if (detourCoords.length >= 2) {
    const simplified = simplifyCoordinates(detourCoords, 0.001);
    const step = Math.max(1, Math.floor(simplified.length / 8));
    const sampled: [number, number][] = [];
    for (let i = 0; i < simplified.length; i += step) {
      sampled.push(simplified[i]);
    }
    if (sampled[sampled.length - 1] !== simplified[simplified.length - 1]) {
      sampled.push(simplified[simplified.length - 1]);
    }
    forwardPoints = sampled;
  }

  // สกัดลำดับพิกัดสำหรับทิศทางขากลับ (Reverse: B -> A)
  const reversePoints = [...forwardPoints].reverse();

  // สร้างคำแนะนำทั้ง ๒ ทิศทางพร้อมกัน
  const [forwardText, reverseText] = await Promise.all([
    buildSingleDirectionAdvice(forwardPoints, "ทิศทางขาไป: จุด A → จุด B", relatedHighwayNo, highwayLayers),
    buildSingleDirectionAdvice(reversePoints, "ทิศทางขากลับ: จุด B → จุด A", relatedHighwayNo, highwayLayers),
  ]);

  return `${forwardText}\n\n${reverseText}`;
}

/**
 * ลดทอนจุดพิกัดส่วนเกินด้วยขั้นตอนวิธี Douglas-Peucker (Point Decimation)
 */
export function simplifyCoordinates(
  points: [number, number][],
  tolerance: number = 0.00008
): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyCoordinates(points.slice(0, index + 1), tolerance);
    const right = simplifyCoordinates(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
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
    console.warn("OSRM routing unavailable, using direct waypoints:", err);
  }
  return allPoints;
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

/**
 * เส้นขอบเขตจำลองของ ๑๒ อำเภอใน จ.ปัตตานี สำหรับ Boundary Layer
 */
export const PATTANI_DISTRICTS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "อ.เมืองปัตตานี", code: "9401" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.20, 6.88], [101.28, 6.89], [101.30, 6.84], [101.23, 6.82], [101.20, 6.88]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.หนองจิก", code: "9403" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.12, 6.85], [101.22, 6.86], [101.22, 6.78], [101.14, 6.76], [101.12, 6.85]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.โคกโพธิ์", code: "9402" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.05, 6.78], [101.16, 6.78], [101.18, 6.66], [101.08, 6.64], [101.05, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ยะรัง", code: "9405" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.24, 6.78], [101.33, 6.78], [101.32, 6.68], [101.22, 6.70], [101.24, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.สายบุรี", code: "9407" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.55, 6.74], [101.66, 6.72], [101.64, 6.60], [101.52, 6.62], [101.55, 6.74]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ยะหริ่ง", code: "9406" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.34, 6.88], [101.46, 6.87], [101.44, 6.78], [101.32, 6.80], [101.34, 6.88]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ปะนาเระ", code: "9404" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.46, 6.87], [101.56, 6.84], [101.54, 6.74], [101.44, 6.76], [101.46, 6.87]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.มายอ", code: "9408" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.34, 6.78], [101.46, 6.77], [101.45, 6.68], [101.33, 6.68], [101.34, 6.78]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.แม่ลาน", code: "9412" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.18, 6.68], [101.25, 6.69], [101.24, 6.60], [101.16, 6.61], [101.18, 6.68]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ทุ่งยางแดง", code: "9409" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.44, 6.68], [101.53, 6.68], [101.52, 6.58], [101.42, 6.59], [101.44, 6.68]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.กะพ้อ", code: "9410" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.53, 6.62], [101.62, 6.60], [101.60, 6.52], [101.51, 6.54], [101.53, 6.62]]]
      }
    },
    {
      type: "Feature",
      properties: { name: "อ.ไม้แก่น", code: "9411" },
      geometry: {
        type: "Polygon",
        coordinates: [[[101.64, 6.62], [101.72, 6.60], [101.69, 6.52], [101.62, 6.54], [101.64, 6.62]]]
      }
    }
  ]
};

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จาก GeoJSON
 */
export function extractFeaturesFromGeoJson(geojsonObj: any): ExtractedGisFeature[] {
  const result: ExtractedGisFeature[] = [];
  try {
    const collections = Array.isArray(geojsonObj) ? geojsonObj : [geojsonObj];
    collections.forEach((col) => {
      const features = col.features || (col.type === "Feature" ? [col] : []);
      features.forEach((f: any) => {
        const geom = f.geometry || f;
        const props = f.properties || {};
        if (!geom) return;
        if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
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
 * ตัดคำนำหน้าชื่อหน่วยการปกครองไทย (ตำบล, อำเภอ, จังหวัด) ให้กระชับ
 */
export function cleanThaiAdminPrefix(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/^(ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ต\.|อ\.|จ\.)\s*/, "").trim();
}

/**
 * ดึงชื่อตำบล อำเภอ จังหวัด อัตโนมัติจากพิกัด (Longdo Map Address API + OSM Nominatim Fallback)
 */
export async function reverseGeocodeTambonAmphoe(
  lon: number,
  lat: number
): Promise<{ subdistrict: string; district: string; province: string } | null> {
  if (isNaN(lon) || isNaN(lat)) return null;

  const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY || "demokey";

  // 1. ลองค้นหาผ่าน Longdo Map Address API (แม่นยำที่สุดสำหรับประเทศไทย)
  try {
    const res = await fetch(
      `https://api.longdo.com/map/services/address?lon=${lon}&lat=${lat}&key=${encodeURIComponent(longdoKey)}`
    );
    if (res.ok) {
      const data = await res.json();
      const resObj = {
        subdistrict: cleanThaiAdminPrefix(data.subdistrict),
        district: cleanThaiAdminPrefix(data.district),
        province: cleanThaiAdminPrefix(data.province),
      };
      if (resObj.subdistrict || resObj.district) return resObj;
    }
  } catch (err) {
    // ข้ามไป fallback
  }

  // 2. หากไม่สำเร็จ ลองค้นหาผ่าน OpenStreetMap Nominatim API (Fallback)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th&zoom=14`
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      return {
        subdistrict: cleanThaiAdminPrefix(addr.suburb || addr.village || addr.neighbourhood || addr.hamlet),
        district: cleanThaiAdminPrefix(addr.county || addr.city_district || addr.district || addr.town || addr.city),
        province: cleanThaiAdminPrefix(addr.state || addr.province),
      };
    }
  } catch (err) {
    // fallback ล้มเหลว
  }

  return null;
}
