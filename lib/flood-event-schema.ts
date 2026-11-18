/**
 * =============================================================================
 * DOH Pattani Flood Event Schema & Parent-Child Management (Phase 2)
 * แขวงทางหลวงปัตตานี กรมทางหลวง กระทรวงคมนาคม
 * =============================================================================
 * สถาปัตยกรรมข้อมูลเหตุการณ์น้ำท่วม:
 * หนึ่งเหตุการณ์น้ำท่วมหลัก (Parent Flood Event) → มีหลายช่วงกิโลเมตรและหลายทิศทาง (Child Flood Segments)
 * - แต่ละช่วงจัดเก็บใน doh_flood_routes โดยเชื่อมโยงผ่าน eventId ใน direction_meta (JSONB)
 * - รองรับทิศทาง A_TO_B (ตามหลัก กม.) และ B_TO_A (ย้อนหลัก กม.)
 * - รองรับส่วนของถนนที่ได้รับผลกระทบแบบเลือกได้หลายรายการ (Multi-select)
 * - รองรับ 5 สถานะจราจร พร้อมสีและไอคอนตรงตามมาตรฐาน
 * - รองรับรูปภาพหน้างานสูงสุด 5 รูป บีบอัด <= 300 KB ต่อรูป
 * - รองรับการบันทึกเวลาเริ่มเกิดเหตุ และเวลายืนยันน้ำลดเหลือ 0 ซม.
 */

import { parseKmPostMeters, formatKmPostString } from "./highway-schema";
import { getTrafficPresentation, type TrafficPresentation } from "./traffic-presentation";
export { parseKmPostMeters, formatKmPostString };

export function normalizeMediaUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if ((url.hostname === "drive.google.com" && url.pathname === "/uc") || url.hostname === "drive.usercontent.google.com") {
      const fileId = url.searchParams.get("id");
      if (fileId) return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`;
    }
    if (url.hostname === "drive.google.com") {
      const idParam = url.searchParams.get("id");
      if (idParam) return `https://lh3.googleusercontent.com/d/${encodeURIComponent(idParam)}`;
      const match = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${encodeURIComponent(match[1])}`;
      }
    }
  } catch {
    // Preserve raw or non-URL string (e.g. data URLs)
  }
  return value;
}

export type FloodDirectionCode = "A_TO_B" | "B_TO_A" | "BOTH" | "UNKNOWN";

export type AffectedRoadPart =
  | "ALL_LANES"
  | "LEFT_LANE"
  | "RIGHT_LANE"
  | "LEFT_SHOULDER"
  | "RIGHT_SHOULDER"
  | "LEFT_FRONTAGE"
  | "RIGHT_FRONTAGE"
  | "UNSPECIFIED"
  | "PENDING_VERIFICATION";

export const AFFECTED_ROAD_PARTS: Array<{ value: AffectedRoadPart; label: string; desc: string }> = [
  { value: "ALL_LANES", label: "ทุกช่องจราจร", desc: "น้ำท่วมเต็มทุกช่องจราจรทั้งสาย" },
  { value: "LEFT_LANE", label: "ช่องจราจรซ้าย", desc: "ช่องจราจรซ้ายสุดตามทิศทางการเดินรถ" },
  { value: "RIGHT_LANE", label: "ช่องจราจรขวา", desc: "ช่องจราจรขวา (ติดเกาะกลาง) ตามทิศทางการเดินรถ" },
  { value: "LEFT_SHOULDER", label: "ไหล่ทางซ้าย", desc: "น้ำท่วมเฉพาะไหล่ทางฝั่งซ้าย" },
  { value: "RIGHT_SHOULDER", label: "ไหล่ทางขวา", desc: "น้ำท่วมเฉพาะไหล่ทางฝั่งขวา" },
  { value: "LEFT_FRONTAGE", label: "ทางขนานซ้าย", desc: "ทางคู่ขนาน/ทางบริการด้านซ้าย" },
  { value: "RIGHT_FRONTAGE", label: "ทางขนานขวา", desc: "ทางคู่ขนาน/ทางบริการด้านขวา" },
  { value: "UNSPECIFIED", label: "ไม่ระบุ", desc: "ยังไม่ได้ระบุเส้นทางที่ได้รับผลกระทบ" },
];

export const AFFECTED_ROAD_PART_LABELS: Record<AffectedRoadPart, string> = {
  ALL_LANES: "ทุกช่องจราจร",
  LEFT_LANE: "ช่องจราจรซ้าย",
  RIGHT_LANE: "ช่องจราจรขวา",
  LEFT_SHOULDER: "ไหล่ทางซ้าย",
  RIGHT_SHOULDER: "ไหล่ทางขวา",
  LEFT_FRONTAGE: "ทางขนานซ้าย",
  RIGHT_FRONTAGE: "ทางขนานขวา",
  UNSPECIFIED: "ไม่ระบุ",
  PENDING_VERIFICATION: "ไม่ระบุ",
};

export type DetailedTrafficStatus =
  | "PASSABLE"              // ผ่านได้ปกติ
  | "LIGHT_VEHICLES_ONLY"   // รถเล็กผ่านได้
  | "ONE_LANE"              // รถเล็กผ่านได้ ๑ ช่องทาง
  | "CAUTION"               // รถเล็กผ่านไม่ได้ (WARNING)
  | "NO_SMALL_VEHICLES"     // รถเล็กไม่สามารถผ่านได้ (legacy detail)
  | "CLOSED"                // ผ่านไม่ได้
  | "PENDING_VERIFICATION"; // รอตรวจสอบสถานะ (ข้อมูลนำเข้าที่ยังไม่ยืนยัน)

export interface DetailedTrafficStatusConfig {
  value: DetailedTrafficStatus;
  label: string;
  detail: string;
  colorName: "emerald" | "sky" | "amber" | "orange" | "red" | "slate";
  hex: string;
  badgeClass: string;
  dotClass: string;
  icon: string;
  dbStatus: "PASSABLE" | "WARNING" | "LIGHT_VEHICLES_ONLY" | "CLOSED" | "ONE_LANE";
}

export const DETAILED_TRAFFIC_STATUS_CONFIG: Record<DetailedTrafficStatus, DetailedTrafficStatusConfig> = {
  PASSABLE: {
    value: "PASSABLE",
    label: "ผ่านได้ปกติ",
    detail: "การจราจรผ่านได้ตามปกติ",
    colorName: "emerald",
    hex: "#10b981",
    badgeClass: "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50",
    dotClass: "bg-emerald-500",
    icon: "✅",
    dbStatus: "PASSABLE",
  },
  LIGHT_VEHICLES_ONLY: {
    value: "LIGHT_VEHICLES_ONLY",
    label: "รถเล็กผ่านได้",
    detail: "อนุญาตเฉพาะรถขนาดเล็ก",
    colorName: "sky",
    hex: "#0ea5e9",
    badgeClass: "bg-sky-950/80 text-sky-300 border border-sky-500/50",
    dotClass: "bg-sky-400",
    icon: "🚗",
    dbStatus: "LIGHT_VEHICLES_ONLY",
  },
  ONE_LANE: {
    value: "ONE_LANE",
    label: "รถเล็กผ่านได้ ๑ ช่องทาง",
    detail: "เปิดการจราจรหนึ่งช่องทาง",
    colorName: "amber",
    hex: "#f59e0b",
    badgeClass: "bg-amber-950/80 text-amber-200 border border-amber-500/50",
    dotClass: "bg-amber-500",
    icon: "↔️",
    dbStatus: "ONE_LANE",
  },
  CAUTION: {
    value: "CAUTION",
    label: "รถเล็กผ่านไม่ได้",
    detail: "น้ำท่วมผิวทาง รถเล็กผ่านไม่ได้",
    colorName: "amber",
    hex: "#f59e0b",
    badgeClass: "bg-amber-950/80 text-amber-200 border border-amber-500/50",
    dotClass: "bg-amber-500",
    icon: "⚠️",
    dbStatus: "WARNING",
  },
  NO_SMALL_VEHICLES: {
    value: "NO_SMALL_VEHICLES",
    label: "รถเล็กไม่สามารถผ่านได้",
    detail: "ระดับน้ำสูง รถเล็กไม่สามารถผ่านได้ รถใหญ่ผ่านได้",
    colorName: "orange",
    hex: "#f97316",
    badgeClass: "bg-orange-950/80 text-orange-200 border border-orange-500/50",
    dotClass: "bg-orange-500",
    icon: "🚗",
    dbStatus: "WARNING",
  },
  CLOSED: {
    value: "CLOSED",
    label: "ผ่านไม่ได้",
    detail: "รถทุกชนิดผ่านไม่ได้",
    colorName: "red",
    hex: "#dc2626",
    badgeClass: "bg-red-950/80 text-red-300 border border-red-500/50",
    dotClass: "bg-red-500 animate-pulse",
    icon: "⛔",
    dbStatus: "CLOSED",
  },
  PENDING_VERIFICATION: {
    value: "PENDING_VERIFICATION",
    label: "รอตรวจสอบสถานะ",
    detail: "ไม่พบสถานะการจราจรที่ยืนยันได้",
    colorName: "slate",
    hex: "#64748b",
    badgeClass: "bg-slate-900/80 text-slate-300 border border-slate-600/50",
    dotClass: "bg-slate-400",
    icon: "⏳",
    dbStatus: "WARNING",
  },
};

export interface FloodPhotoItem {
  id: string;
  dataUrl: string;
  sizeBytes: number;
  uploadedAt: string;
  caption?: string;
  format?: "webp" | "jpeg";
  originalSizeBytes?: number;
  exifGps?: { latitude: number; longitude: number };
}

export interface FloodSegmentDirectionMeta {
  schemaVersion: 2;
  // Parent Event Linking
  eventId: string;             // รหัสกลุ่มเหตุการณ์ เช่น "FL-42-001" หรือ UUID
  eventCode: string;           // รหัสแสดง เช่น "FL-001"
  eventTitle?: string;         // ชื่อเหตุการณ์หลัก
  controlSectionId?: string;   // รหัสตอนควบคุมจาก Phase 1 (section_group_id)
  subdivisionName?: string;    // หมวดทางหลวงที่รับผิดชอบ
  villageOrLandmark?: string;  // หมู่บ้าน / จุดสังเกต

  // Child Segment Details
  directionCode: FloodDirectionCode;
  directionLabel?: string;     // เช่น "ตามหลัก กม. (ขาไป A → B)"
  roadSide?: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  affectedParts: AffectedRoadPart[];
  trafficStatusDetail: DetailedTrafficStatus;
  waterLevelKnown: boolean;

  // Timestamps & Audit
  startedAt: string;           // ISO เวลาเริ่มเกิดเหตุ
  updatedAt: string;           // ISO เวลาแก้ไขล่าสุด
  zeroConfirmedAt?: string | null; // ISO เวลายืนยันน้ำลด 0 ซม.
  causeAndNote?: string;       // สาเหตุ / ลักษณะน้ำท่วม / หมายเหตุเจ้าหน้าที่

  // Photos (Max 5 items, <= 300KB each)
  photos: FloodPhotoItem[];

  // Split history
  splitFromSegmentId?: string | null;
  status_verified?: boolean;
  [key: string]: any;
}

export interface ParentFloodEventGroup {
  eventId: string;
  eventCode: string;
  eventTitle: string;
  kmRangeLabel: string;
  routeNo: string;
  sectionName: string;
  controlSectionId?: string;
  subdivisionName?: string;
  district?: string;
  subdistrict?: string;
  villageOrLandmark?: string;
  segments: any[];
  maxWaterLevelCm: number;
  mostSevereStatus: DetailedTrafficStatus;
  earliestStartedAt: string;
  latestUpdatedAt: string;
  hasActiveSegments: boolean;
  hasZeroConfirmed: boolean;
  allPhotos: FloodPhotoItem[];
}

/**
 * แปลงสถานะใน DB และ direction_meta ให้เป็น DetailedTrafficStatus
 */
export function mapTrafficStatusToDetail(dbStatus?: string, detail?: string): DetailedTrafficStatus {
  // Prefer explicit legacy detail only when compatible with DB status; prevent old ONE_LANE->CAUTION or PENDING mismatch.
  if (detail === "NO_SMALL_VEHICLES") return "NO_SMALL_VEHICLES";
  switch (dbStatus) {
    case "CLOSED":
      return "CLOSED";
    case "LIGHT_VEHICLES_ONLY":
      return "LIGHT_VEHICLES_ONLY";
    case "ONE_LANE":
      return "ONE_LANE";
    case "WARNING":
      return "CAUTION";
    case "PASSABLE":
      return "PASSABLE";
    case "CAUTION":
    case "NO_SMALL_VEHICLES":
    case "PENDING_VERIFICATION":
      return dbStatus;
    default:
      if (detail && detail in DETAILED_TRAFFIC_STATUS_CONFIG) {
        return detail as DetailedTrafficStatus;
      }
      return "PENDING_VERIFICATION";
  }
}

/**
 * แปลง DetailedTrafficStatus กลับเป็นค่าที่ฐานข้อมูลรับได้ (5 ค่าตาม DB check constraint)
 */
export function mapDetailToDbStatus(detail: DetailedTrafficStatus): "PASSABLE" | "WARNING" | "LIGHT_VEHICLES_ONLY" | "CLOSED" | "ONE_LANE" {
  const config = DETAILED_TRAFFIC_STATUS_CONFIG[detail];
  return config ? config.dbStatus : "WARNING";
}

/**
 * ดึงการนำเสนอสถานะจราจรจาก Single Source of Truth (R1)
 */
export function getDetailedTrafficPresentation(
  statusDetailOrDbStatus?: string,
  waterLevelCm: number = 0,
  fallbackDetail?: string
): TrafficPresentation {
  return getTrafficPresentation(statusDetailOrDbStatus, waterLevelCm, fallbackDetail);
}

/**
 * ตรวจว่าข้อมูลเหตุการณ์น้ำท่วมช่วงนี้กรอกครบถ้วนหรือมีรายการที่ยังไม่ได้ระบุ
 */
export function getFloodCompletenessIssues(route: any, meta: FloodSegmentDirectionMeta): string[] {
  const issues: string[] = [];
  if (meta.waterLevelKnown === false || route?.direction_meta?.water_level_known === false) {
    issues.push("ยังไม่ระบุระดับน้ำ");
  }
  if (
    !meta.affectedParts ||
    meta.affectedParts.length === 0 ||
    meta.affectedParts.every((p) => p === "UNSPECIFIED" || p === "PENDING_VERIFICATION")
  ) {
    issues.push("ยังไม่ระบุเส้นทางที่ได้รับผลกระทบ");
  }
  if (!meta.directionCode || meta.directionCode === "UNKNOWN") {
    issues.push("ยังไม่ระบุทิศทาง");
  }
  if (!String(route?.km_start || "").trim() || !String(route?.km_end || "").trim()) {
    issues.push("ยังไม่ระบุช่วง กม.");
  }
  const hasCoords =
    (Array.isArray(route?.coordinates_json) && route.coordinates_json.length >= 2) ||
    (Boolean(route?.lat_start) && Boolean(route?.lon_start));
  if (!hasCoords) {
    issues.push("ยังไม่วาดแนวเส้น");
  }
  const validStatuses = new Set(["PASSABLE", "LIGHT_VEHICLES_ONLY", "ONE_LANE", "WARNING", "CLOSED"]);
  if (
    !route?.traffic_status ||
    !validStatuses.has(String(route.traffic_status)) ||
    meta.trafficStatusDetail === "PENDING_VERIFICATION"
  ) {
    issues.push("ยังไม่ระบุสถานะจราจร");
  }
  return issues;
}

/**
 * อ่านและแปลง direction_meta ของ Flood Route ให้อยู่ในโครงสร้างมาตรฐาน Phase 2
 */
export function parseFloodDirectionMeta(meta: unknown, route?: any): FloodSegmentDirectionMeta {
  const parsed = typeof meta === "string" ? (() => {
    try { return JSON.parse(meta); } catch { return {}; }
  })() : (meta && typeof meta === "object" ? { ...meta } : {});

  const fallbackEventId = parsed.eventId || (route?.id ? `EV-${route.id}` : `EV-${Date.now()}`);
  const fallbackEventCode = parsed.eventCode || (route?.route_no ? `FL-${route.route_no}-${String(route.id || "").slice(-3)}` : "FL-001");
  const fallbackTitle = parsed.eventTitle || (route?.route_no && route?.section_name ? `ทล.${route.route_no} ตอน${route.section_name}` : "เหตุการณ์น้ำท่วมทางหลวง");

  const fallbackDirection: FloodDirectionCode =
    parsed.directionCode === "A_TO_B" || parsed.directionCode === "B_TO_A" || parsed.directionCode === "BOTH" || parsed.directionCode === "UNKNOWN"
      ? parsed.directionCode
      : route?.road_side === "LEFT"
      ? "A_TO_B"
      : route?.road_side === "RIGHT"
      ? "B_TO_A"
      : route?.road_side === "BOTH"
      ? "BOTH"
      : "UNKNOWN";

  const rawAffected = Array.isArray(parsed.affectedParts) ? parsed.affectedParts : [];
  const affectedParts: AffectedRoadPart[] = rawAffected.filter((p: any): p is AffectedRoadPart => p in AFFECTED_ROAD_PART_LABELS);
  if (affectedParts.length === 0) {
    if (route?.affected_lanes?.includes("ทุกช่อง")) affectedParts.push("ALL_LANES");
    else if (route?.affected_lanes?.includes("ซ้าย")) affectedParts.push("LEFT_LANE");
    else if (route?.affected_lanes?.includes("ขวา")) affectedParts.push("RIGHT_LANE");
    else if (route?.affected_shoulder === "LEFT") affectedParts.push("LEFT_SHOULDER");
    else if (route?.affected_shoulder === "RIGHT") affectedParts.push("RIGHT_SHOULDER");
    else if (route?.affected_shoulder === "BOTH") {
      affectedParts.push("LEFT_SHOULDER");
      affectedParts.push("RIGHT_SHOULDER");
    } else {
      affectedParts.push("UNSPECIFIED");
    }
  }

  const rawPhotos: any[] = Array.isArray(parsed.photos) ? parsed.photos : [];
  const photos: FloodPhotoItem[] = rawPhotos
    .filter((p) => p && typeof p.dataUrl === "string")
    .map((p, idx) => ({
      id: p.id || `photo-${idx + 1}-${Date.now()}`,
      dataUrl: normalizeMediaUrl(p.dataUrl),
      sizeBytes: Number(p.sizeBytes) || Math.round((p.dataUrl.length * 3) / 4),
      uploadedAt: p.uploadedAt || new Date().toISOString(),
      caption: p.caption || "",
      format: p.format || (p.dataUrl.startsWith("data:image/webp") ? "webp" : "jpeg"),
      originalSizeBytes: p.originalSizeBytes ? Number(p.originalSizeBytes) : undefined,
      exifGps: p.exifGps || undefined,
    }))
    .slice(0, 5);

  // หากไม่มี photos แต่มี latest_photo_url ให้ดึงมาเป็นรูปแรก
  if (photos.length === 0 && route?.latest_photo_url) {
    photos.push({
      id: `photo-primary-${Date.now()}`,
      dataUrl: normalizeMediaUrl(route.latest_photo_url),
      sizeBytes: Math.round((route.latest_photo_url.length * 3) / 4),
      uploadedAt: route.updated_at || new Date().toISOString(),
      caption: "ภาพถ่ายหน้างานหลัก",
    });
  }

  const fallbackRoadSide =
    (parsed.roadSide && parsed.roadSide !== "UNKNOWN" ? parsed.roadSide : undefined) ||
    (route?.road_side && route?.road_side !== "UNKNOWN" ? route.road_side : undefined) ||
    (fallbackDirection === "A_TO_B" ? "LEFT" : fallbackDirection === "B_TO_A" ? "RIGHT" : fallbackDirection === "BOTH" ? "BOTH" : "UNKNOWN");

  const knownFlag = parsed.waterLevelKnown ?? parsed.water_level_known;

  return {
    ...parsed,
    schemaVersion: 2,
    eventId: fallbackEventId,
    eventCode: fallbackEventCode,
    eventTitle: fallbackTitle,
    controlSectionId: parsed.controlSectionId || "",
    subdivisionName: parsed.subdivisionName || route?.reporter_name || "",
    villageOrLandmark: parsed.villageOrLandmark || "",
    directionCode: fallbackDirection,
    directionLabel: parsed.directionLabel || (fallbackDirection === "A_TO_B" ? "ตามหลัก กม. (ขาไป A → B)" : fallbackDirection === "B_TO_A" ? "ย้อนหลัก กม. (ขากลับ B → A)" : fallbackDirection === "BOTH" ? "ทั้งสองทิศทาง" : "ไม่ระบุทิศทาง"),
    roadSide: fallbackRoadSide,
    affectedParts,
    trafficStatusDetail: mapTrafficStatusToDetail(route?.traffic_status, parsed.trafficStatusDetail),
    waterLevelKnown: knownFlag !== undefined ? Boolean(knownFlag) : route?.water_level_cm !== null && route?.water_level_cm !== undefined,
    startedAt: parsed.startedAt || route?.updated_at || new Date().toISOString(),
    updatedAt: parsed.updatedAt || route?.updated_at || new Date().toISOString(),
    zeroConfirmedAt: parsed.zeroConfirmedAt || (route?.water_level_cm === 0 ? route.updated_at : null),
    causeAndNote: parsed.causeAndNote || route?.detour_advice || "",
    photos,
    splitFromSegmentId: parsed.splitFromSegmentId || null,
    status_verified: parsed.status_verified !== undefined ? Boolean(parsed.status_verified) : true,
  };
}

/**
 * ดึงฝั่งถนนที่ "บันทึกไว้จริง" จาก road_side หรือ direction_meta.roadSide เท่านั้น
 * ห้ามเดาจาก directionCode หรือ affectedParts (ไหล่ทางไม่ใช่ฝั่งถนน) — ข้อมูลเก่าที่เป็น UNKNOWN ต้องคงเป็น UNKNOWN
 * เพื่อให้หน้าจอแสดง "ต้องตรวจสอบ" และผู้ใช้เลือกใหม่เอง (P6-04)
 */
export function resolveEffectiveRoadSide(flood: any): "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN" {
  if (!flood) return "UNKNOWN";
  const valid = (value: unknown): value is "LEFT" | "RIGHT" | "BOTH" =>
    value === "LEFT" || value === "RIGHT" || value === "BOTH";
  if (valid(flood.road_side)) return flood.road_side;
  const meta = flood.direction_meta;
  if (meta && typeof meta === "object" && valid(meta.roadSide)) return meta.roadSide;
  return "UNKNOWN";
}

/**
 * สร้างรหัสเหตุการณ์อัตโนมัติ (เช่น FL-42-01, FL-42-02)
 * ใช้เลขสูงสุดที่มีอยู่จริงของสายทางนั้น + 1 (ไม่นับจำนวน จึงไม่ซ้ำแม้เคยลบรายการกลางคัน
 * และ FL-42 ไม่ชนกับ FL-420)
 */
export function generateNextEventCode(routeNo: string, events: ParentFloodEventGroup[]): string {
  const clean = String(routeNo || "").replace(/^ทล\.?/i, "").trim() || "42";
  const prefix = `FL-${clean}-`;
  let max = 0;
  for (const event of events || []) {
    const code = String(event.eventCode || "");
    if (!code.startsWith(prefix)) continue;
    const suffix = Number(code.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/**
 * คำนวณช่วง กม.เริ่มต้น - กม.สิ้นสุด ของเหตุการณ์น้ำท่วมหลัก
 */
export function computeEventKmRangeLabel(
  segments: Array<{ km_start?: string | null; km_end?: string | null }>
): string {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  let minM = Number.POSITIVE_INFINITY;
  let maxM = Number.NEGATIVE_INFINITY;
  let hasNumeric = false;
  for (const s of segments) {
    const startM = parseKmPostMeters(s.km_start);
    const endM = parseKmPostMeters(s.km_end);
    if (startM !== null) {
      hasNumeric = true;
      if (startM < minM) minM = startM;
      if (startM > maxM) maxM = startM;
    }
    if (endM !== null) {
      hasNumeric = true;
      if (endM < minM) minM = endM;
      if (endM > maxM) maxM = endM;
    }
  }
  if (hasNumeric && Number.isFinite(minM) && Number.isFinite(maxM)) {
    const startStr = formatKmPostString(minM);
    const endStr = formatKmPostString(maxM);
    return startStr === endStr ? `กม.${startStr}` : `กม.${startStr} - ${endStr}`;
  }
  const rawStart = String(segments[0]?.km_start || "").trim();
  const rawEnd = String(segments[0]?.km_end || "").trim();
  if (rawStart && rawEnd) {
    return rawStart === rawEnd ? `กม.${rawStart}` : `กม.${rawStart} - ${rawEnd}`;
  }
  return rawStart ? `กม.${rawStart}` : "";
}

/**
 * จัดกลุ่ม Flood Routes แต่ละช่วงให้เป็น Parent Flood Event Group
 */
export function groupFloodRoutesIntoEvents(floodRoutes: any[]): ParentFloodEventGroup[] {
  if (!Array.isArray(floodRoutes) || floodRoutes.length === 0) return [];

  const eventMap = new Map<string, any[]>();

  for (const route of floodRoutes) {
    const meta = parseFloodDirectionMeta(route.direction_meta, route);
    const groupKey = meta.eventId || `${route.route_no || ""}_${route.section_name || ""}`;
    if (!eventMap.has(groupKey)) {
      eventMap.set(groupKey, []);
    }
    eventMap.get(groupKey)!.push({ ...route, _meta: meta });
  }

  const result: ParentFloodEventGroup[] = [];

  for (const [eventId, segments] of eventMap.entries()) {
    const first = segments[0];
    const firstMeta: FloodSegmentDirectionMeta = first._meta;

    let maxWaterLevel = 0;
    let earliestStarted = firstMeta.startedAt;
    let latestUpdated = firstMeta.updatedAt;
    let hasActive = false;
    let hasZero = false;
    const allPhotos: FloodPhotoItem[] = [];

    // Most severe status priority
    const severityScore: Record<DetailedTrafficStatus, number> = {
      CLOSED: 6,
      NO_SMALL_VEHICLES: 5,
      CAUTION: 4,
      ONE_LANE: 3,
      LIGHT_VEHICLES_ONLY: 2,
      PENDING_VERIFICATION: 1,
      PASSABLE: 0,
    };
    let highestScore = -1;
    let mostSevere: DetailedTrafficStatus = firstMeta.trafficStatusDetail;

    for (const seg of segments) {
      const segMeta: FloodSegmentDirectionMeta = seg._meta;
      const wl = Number(seg.water_level_cm) || 0;
      if (wl > maxWaterLevel) maxWaterLevel = wl;
      if (seg.is_active) hasActive = true;
      if (wl === 0 || segMeta.zeroConfirmedAt) hasZero = true;

      const score = severityScore[segMeta.trafficStatusDetail] ?? 0;
      if (score > highestScore) {
        highestScore = score;
        mostSevere = segMeta.trafficStatusDetail;
      }

      if (segMeta.startedAt && segMeta.startedAt < earliestStarted) {
        earliestStarted = segMeta.startedAt;
      }
      if (segMeta.updatedAt && segMeta.updatedAt > latestUpdated) {
        latestUpdated = segMeta.updatedAt;
      }

      for (const ph of segMeta.photos) {
        if (!allPhotos.some((p) => p.dataUrl === ph.dataUrl)) {
          allPhotos.push(ph);
        }
      }
    }

    result.push({
      eventId,
      eventCode: firstMeta.eventCode,
      eventTitle: firstMeta.eventTitle || `ทล.${first.route_no} ตอน${first.section_name}`,
      kmRangeLabel: computeEventKmRangeLabel(segments),
      routeNo: String(first.route_no || ""),
      sectionName: String(first.section_name || ""),
      controlSectionId: firstMeta.controlSectionId,
      subdivisionName: firstMeta.subdivisionName || first.reporter_name || "",
      district: first.district || "",
      subdistrict: first.subdistrict || "",
      villageOrLandmark: firstMeta.villageOrLandmark || "",
      segments,
      maxWaterLevelCm: maxWaterLevel,
      mostSevereStatus: mostSevere,
      earliestStartedAt: earliestStarted,
      latestUpdatedAt: latestUpdated,
      hasActiveSegments: hasActive,
      hasZeroConfirmed: hasZero,
      allPhotos: allPhotos.slice(0, 5),
    });
  }

  // Sort: active events first, then by most severe status, then by latest update
  return result.sort((a, b) => {
    if (a.hasActiveSegments !== b.hasActiveSegments) return a.hasActiveSegments ? -1 : 1;
    return new Date(b.latestUpdatedAt).getTime() - new Date(a.latestUpdatedAt).getTime();
  });
}

/**
 * ตรวจสอบความซ้ำซ้อนของช่วง กม. ภายใต้สายทางและทิศทางเดียวกัน
 */
export function detectOverlappingFloodSegments(
  segments: any[]
): Array<{ seg1: any; seg2: any; message: string }> {
  if (!Array.isArray(segments) || segments.length < 2) return [];
  const overlaps: Array<{ seg1: any; seg2: any; message: string }> = [];

  for (let i = 0; i < segments.length; i++) {
    const s1 = segments[i];
    const m1 = s1._meta || parseFloodDirectionMeta(s1.direction_meta, s1);
    const start1 = parseKmPostMeters(s1.km_start);
    const end1 = parseKmPostMeters(s1.km_end);
    if (start1 === null || end1 === null) continue;

    const min1 = Math.min(start1, end1);
    const max1 = Math.max(start1, end1);

    for (let j = i + 1; j < segments.length; j++) {
      const s2 = segments[j];
      const m2 = s2._meta || parseFloodDirectionMeta(s2.direction_meta, s2);

      // ตรวจสอบเฉพาะเส้นทางเดียวกันและทิศทางเดียวกัน (หรือมี BOTH)
      if (String(s1.route_no) !== String(s2.route_no)) continue;
      if (m1.directionCode !== m2.directionCode && m1.directionCode !== "BOTH" && m2.directionCode !== "BOTH") {
        continue;
      }

      const start2 = parseKmPostMeters(s2.km_start);
      const end2 = parseKmPostMeters(s2.km_end);
      if (start2 === null || end2 === null) continue;

      const min2 = Math.min(start2, end2);
      const max2 = Math.max(start2, end2);

      // มีช่วงทับซ้อนกันมากกว่า 10 เมตร
      const overlapStart = Math.max(min1, min2);
      const overlapEnd = Math.min(max1, max2);
      if (overlapEnd - overlapStart > 10) {
        overlaps.push({
          seg1: s1,
          seg2: s2,
          message: `ช่วง กม. ซ้อนทับกันระหว่าง กม.${formatKmPostString(overlapStart)} ถึง กม.${formatKmPostString(overlapEnd)} ในทิศทางเดียวกัน`,
        });
      }
    }
  }

  return overlaps;
}

