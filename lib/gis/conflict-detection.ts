import { haversineDistanceKm } from "./geo-math";

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
