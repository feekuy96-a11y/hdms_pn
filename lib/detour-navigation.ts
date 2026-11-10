import { DetourRoute, FloodRoute } from "@/db/default-data";
import { detectClosedRoadConflicts } from "./gis-utils";

export interface DetourNavResult {
  url: string | null;
  isValid: boolean;
  source: "APPROVED_URL" | "GENERATED_WAYPOINTS" | "UNVERIFIED";
  warning?: string;
  disclaimer?: string;
  origin?: [number, number];
  destination?: [number, number];
  waypointsCount?: number;
}

/**
 * สุ่มเลือกจุดผ่านทาง (Waypoints) จากพิกัด เพื่อส่งให้ Google Maps URL (ไม่เกิน maxCount จุด)
 */
export function sampleWaypointsForGoogleMaps(
  coords: [number, number][],
  maxCount: number = 8
): [number, number][] {
  if (!coords || coords.length <= 2) return [];

  // ไม่รวมจุดแรกและจุดสุดท้าย
  const inner = coords.slice(1, -1);
  if (inner.length <= maxCount) {
    return inner;
  }

  const step = inner.length / (maxCount + 1);
  const result: [number, number][] = [];
  for (let i = 1; i <= maxCount; i++) {
    const idx = Math.min(Math.floor(i * step), inner.length - 1);
    result.push(inner[idx]);
  }
  return result;
}

/**
 * ถอดรหัส Coordinates JSON
 */
function parseCoords(val: string | [number, number][] | undefined): [number, number][] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * ตรวจสอบความถูกต้องของพิกัด Lat/Lon
 */
function isValidCoord(lat: any, lon: any): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= 5 &&
    lat <= 21 &&
    lon >= 97 &&
    lon <= 106
  );
}

/**
 * สถาปัตยกรรม Google Maps Detour Navigation 5 ขั้นตอน (Single Source of Truth)
 */
export function resolveDetourGoogleMapsNavigation(
  detour: DetourRoute | null | undefined,
  direction: "FORWARD" | "REVERSE" = "FORWARD",
  floodRoutes: FloodRoute[] = []
): DetourNavResult {
  if (!detour) {
    return {
      url: null,
      isValid: false,
      source: "UNVERIFIED",
      warning: "ไม่พบข้อมูลเส้นทางเลี่ยง",
    };
  }

  const meta = detour.detour_meta || {};

  // ขั้นที่ 1: ตรวจสอบ URL ที่เจ้าหน้าที่ตรวจสอบและอนุมัติไว้โดยตรง
  const approvedUrl =
    direction === "REVERSE"
      ? meta.google_maps_url_reverse || meta.google_maps_url
      : meta.google_maps_url_forward || meta.google_maps_url;

  if (approvedUrl && typeof approvedUrl === "string" && approvedUrl.trim().length > 10) {
    const trimmed = approvedUrl.trim();
    if (
      trimmed.startsWith("https://www.google.com/maps") ||
      trimmed.startsWith("https://maps.app.goo.gl") ||
      trimmed.startsWith("https://maps.google.com") ||
      trimmed.startsWith("https://goo.gl/maps")
    ) {
      return {
        url: trimmed,
        isValid: true,
        source: "APPROVED_URL",
        disclaimer: "เส้นทางนำทางได้รับการตรวจสอบและยืนยันโดยเจ้าหน้าที่แขวงทางหลวงปัตตานี",
      };
    }
  }

  // ขั้นที่ 2: ตรวจสอบสถานะการอนุมัติและความปลอดภัยของทางเลี่ยงในฐานข้อมูล
  if (detour.is_active === false) {
    return {
      url: null,
      isValid: false,
      source: "UNVERIFIED",
      warning: "เส้นทางเลี่ยงนี้ถูกปิดใช้งานชั่วคราว",
    };
  }

  const dirMode = detour.direction_mode || "BOTH";
  if (direction === "REVERSE" && dirMode === "FORWARD_ONLY") {
    return {
      url: null,
      isValid: false,
      source: "UNVERIFIED",
      warning: "เส้นทางเลี่ยงนี้อนุญาตเฉพาะขาไป (A → B) เท่านั้น",
    };
  }
  if (direction === "FORWARD" && dirMode === "REVERSE_ONLY") {
    return {
      url: null,
      isValid: false,
      source: "UNVERIFIED",
      warning: "เส้นทางเลี่ยงนี้อนุญาตเฉพาะขากลับ (B → A) เท่านั้น",
    };
  }

  // ตรวจสอบความปลอดภัยกับจุดน้ำท่วมที่ปิดการจราจร
  if (floodRoutes && floodRoutes.length > 0) {
    const rawCoords =
      direction === "REVERSE" && detour.reverse_coordinates_json
        ? detour.reverse_coordinates_json
        : detour.coordinates_json;
    const coords = parseCoords(rawCoords);
    if (coords.length >= 2) {
      const conflicts = detectClosedRoadConflicts(coords, floodRoutes, direction);
      if (conflicts.length > 0) {
        return {
          url: null,
          isValid: false,
          source: "UNVERIFIED",
          warning: "เส้นทางเลี่ยงนี้ตัดผ่านช่วงน้ำท่วมที่ปิดการจราจร (CLOSED) ไม่ปลอดภัยสำหรับการสัญจร",
        };
      }
    }
  }

  // ขั้นที่ 3: สกัดพิกัดต้นทาง-ปลายทาง และสร้างจุดผ่านทาง (Waypoints) ตามทิศทาง
  let origin: [number, number];
  let destination: [number, number];
  let waypoints: [number, number][] = [];

  const forwardCoords = parseCoords(detour.coordinates_json);
  const reverseCoords = parseCoords(detour.reverse_coordinates_json);
  const manualWaypointsForward = parseCoords(meta.waypoints_json);
  const manualWaypointsReverse = parseCoords(detour.reverse_waypoints_json);

  if (direction === "FORWARD") {
    origin = [detour.lat_start, detour.lon_start];
    destination = [detour.lat_end, detour.lon_end];

    if (manualWaypointsForward.length > 0) {
      waypoints = manualWaypointsForward.slice(0, 8);
    } else if (forwardCoords.length > 2) {
      waypoints = sampleWaypointsForGoogleMaps(forwardCoords, 8);
    }
  } else {
    // REVERSE (B -> A)
    if (reverseCoords.length >= 2) {
      origin = [reverseCoords[0][1], reverseCoords[0][0]];
      destination = [
        reverseCoords[reverseCoords.length - 1][1],
        reverseCoords[reverseCoords.length - 1][0],
      ];
      if (manualWaypointsReverse.length > 0) {
        waypoints = manualWaypointsReverse.slice(0, 8);
      } else {
        waypoints = sampleWaypointsForGoogleMaps(reverseCoords, 8);
      }
    } else {
      origin = [detour.lat_end, detour.lon_end];
      destination = [detour.lat_start, detour.lon_start];
      if (manualWaypointsForward.length > 0) {
        waypoints = [...manualWaypointsForward].reverse().slice(0, 8);
      } else if (forwardCoords.length > 2) {
        waypoints = sampleWaypointsForGoogleMaps([...forwardCoords].reverse(), 8);
      }
    }
  }

  // ขั้นที่ 4: มาตรการป้องกันเมื่อข้อมูลไม่ครบหรือไม่ผ่านการตรวจสอบ
  if (!isValidCoord(origin[0], origin[1]) || !isValidCoord(destination[0], destination[1])) {
    return {
      url: null,
      isValid: false,
      source: "UNVERIFIED",
      warning: "ข้อมูลพิกัดเริ่มต้นหรือสิ้นสุดของเส้นทางเลี่ยงไม่สมบูรณ์ ไม่สามารถสร้างเส้นทางนำทางได้",
    };
  }

  // สร้าง Google Maps URL พร้อม Waypoints
  // หมายเหตุ: Coordinates ใน GeoJSON เป็น [lon, lat] แต่ Google Maps ใช้ lat,lon
  const originStr = `${origin[0]},${origin[1]}`;
  const destStr = `${destination[0]},${destination[1]}`;

  let waypointsParam = "";
  if (waypoints.length > 0) {
    const formattedWp = waypoints
      .map((pt) => {
        // ตรวจสอบว่าพอยต์เป็น [lat, lon] หรือ [lon, lat]
        const lat = pt[0] <= 21 && pt[0] >= 5 ? pt[0] : pt[1];
        const lon = pt[1] >= 97 && pt[1] <= 106 ? pt[1] : pt[0];
        return `${lat},${lon}`;
      })
      .filter((s) => s !== originStr && s !== destStr);

    if (formattedWp.length > 0) {
      waypointsParam = `&waypoints=${encodeURIComponent(formattedWp.join("|"))}`;
    }
  }

  const generatedUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}${waypointsParam}&travelmode=driving`;

  // ขั้นที่ 5: แหล่งข้อมูลเดียวกัน + ข้อความชี้แจงข้อจำกัด
  return {
    url: generatedUrl,
    isValid: true,
    source: "GENERATED_WAYPOINTS",
    origin,
    destination,
    waypointsCount: waypoints.length,
    disclaimer:
      "หมายเหตุ: Google Maps คำนวณเส้นทางระหว่างจุดผ่านทางอัตโนมัติ อาจมีบางช่วงแตกต่างจากแนวเส้นโครงข่ายบนแผนที่ GIS โปรดสังเกตป้ายแนะนำทางเลี่ยงของแขวงทางหลวงปัตตานีเป็นสำคัญ",
  };
}

/**
 * Traffic Status Presentation มาตรฐานชุดเดียวสำหรับทั้งระบบ (ครบ 5 สถานะ + รอตรวจสอบ)
 */
export interface UnifiedTrafficStatus {
  key: "PASSABLE" | "LIGHT_VEHICLES_ONLY" | "ONE_LANE" | "WARNING" | "CLOSED" | "PENDING_VERIFICATION";
  label: string;
  detail: string;
  icon: string;
  color: "emerald" | "sky" | "amber" | "orange" | "red" | "slate";
  hex: string;
  capsuleClass: string;
  badgeClass: string;
  popupBadgeClass: string;
}

export function getUnifiedTrafficStatus(
  status: string | undefined,
  waterLevelCm: number = 0,
  detailedStatus?: string
): UnifiedTrafficStatus {
  if (detailedStatus === "PENDING_VERIFICATION" || status === "PENDING_VERIFICATION") {
    return {
      key: "PENDING_VERIFICATION",
      label: "รอตรวจสอบสถานะ",
      detail: "เจ้าหน้าที่อยู่ระหว่างตรวจสอบสถานการณ์หน้างาน",
      icon: "⏳",
      color: "slate",
      hex: "#64748b",
      capsuleClass: "doh-capsule-slate",
      badgeClass: "bg-slate-900/80 text-slate-300 border border-slate-600/50",
      popupBadgeClass: "bg-slate-900 text-slate-300 border-slate-700",
    };
  }

  if (detailedStatus === "NO_SMALL_VEHICLES") {
    return {
      key: "WARNING",
      label: "รถเล็กไม่สามารถผ่านได้",
      detail: `ระดับน้ำ ${waterLevelCm} ซม. รถเล็กผ่านไม่ได้ รถใหญ่ผ่านได้`,
      icon: "⚠️",
      color: "orange",
      hex: "#f97316",
      capsuleClass: "doh-capsule-orange",
      badgeClass: "bg-orange-950/80 text-orange-200 border border-orange-500/50",
      popupBadgeClass: "bg-orange-950 text-orange-300 border-orange-500/60",
    };
  }

  switch (status) {
    case "CLOSED":
      return {
        key: "CLOSED",
        label: "ผ่านไม่ได้",
        detail: "การจราจรผ่านไม่ได้ ปิดเส้นทางเด็ดขาด รถทุกชนิดผ่านไม่ได้",
        icon: "⛔",
        color: "red",
        hex: "#dc2626",
        capsuleClass: "doh-capsule-red",
        badgeClass: "bg-red-950/80 text-red-300 border border-red-500/50",
        popupBadgeClass: "bg-red-950 text-red-300 border-red-500/60",
      };
    case "LIGHT_VEHICLES_ONLY":
      return {
        key: "LIGHT_VEHICLES_ONLY",
        label: "รถเล็กผ่านได้",
        detail: "อนุญาตเฉพาะรถขนาดเล็ก / สัญจรด้วยความระมัดระวัง",
        icon: "🚗",
        color: "sky",
        hex: "#0ea5e9",
        capsuleClass: "doh-capsule-sky",
        badgeClass: "bg-sky-950/80 text-sky-300 border border-sky-500/50",
        popupBadgeClass: "bg-sky-950 text-sky-300 border-sky-500/60",
      };
    case "ONE_LANE":
      return {
        key: "ONE_LANE",
        label: "รถเล็กผ่านได้ ๑ ช่องทาง",
        detail: "เปิดการจราจรหนึ่งช่องทาง สัญจรสลับทิศทาง",
        icon: "↔️",
        color: "amber",
        hex: "#f59e0b",
        capsuleClass: "doh-capsule-amber",
        badgeClass: "bg-amber-950/80 text-amber-300 border border-amber-500/50",
        popupBadgeClass: "bg-amber-950 text-amber-300 border-amber-500/60",
      };
    case "WARNING":
      return {
        key: "WARNING",
        label: "รถเล็กไม่สามารถผ่านได้",
        detail: `ระดับน้ำ ${waterLevelCm} ซม. รถเล็กผ่านไม่ได้`,
        icon: "⚠️",
        color: "orange",
        hex: "#f97316",
        capsuleClass: "doh-capsule-orange",
        badgeClass: "bg-orange-950/80 text-orange-200 border border-orange-500/50",
        popupBadgeClass: "bg-orange-950 text-orange-300 border-orange-500/60",
      };
    case "PASSABLE":
    default:
      return {
        key: "PASSABLE",
        label: "ผ่านได้ปกติ",
        detail: "การจราจรผ่านได้ตามปกติ",
        icon: "✅",
        color: "emerald",
        hex: "#16a34a",
        capsuleClass: "doh-capsule-emerald",
        badgeClass: "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50",
        popupBadgeClass: "bg-emerald-950 text-emerald-300 border-emerald-500/60",
      };
  }
}
