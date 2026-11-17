/**
 * Shared event↔detour relationship contract.
 * Event travel direction and detour geometry direction are intentionally separate.
 */
export type EventTravelDirection = "A_TO_B" | "B_TO_A" | "UNKNOWN";
export type DetourTravelDirection = "FORWARD" | "REVERSE" | "UNKNOWN";
export type DetourRecommendation = "PENDING" | "RECOMMENDED" | "UNAVAILABLE" | "WITHDRAWN";

export interface EventDetourLink {
  eventId: string;
  detourId: string;
  eventDirection: EventTravelDirection;
  detourDirection: DetourTravelDirection;
  position: number;
  recommendation: DetourRecommendation;
  reviewedGeometryVersion: number | null;
}

export interface SaveEventDetourLinks {
  eventId: string;
  expectedVersion: number;
  operationId: string;
  links: EventDetourLink[];
}

const EVENT_DIRECTIONS = ["A_TO_B", "B_TO_A", "UNKNOWN"] as const;
const DETOUR_DIRECTIONS = ["FORWARD", "REVERSE", "UNKNOWN"] as const;
const RECOMMENDATIONS = ["PENDING", "RECOMMENDED", "UNAVAILABLE", "WITHDRAWN"] as const;
const MAX_LINKS_PER_EVENT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEventDirection(value: unknown): value is EventTravelDirection {
  return typeof value === "string" && (EVENT_DIRECTIONS as readonly string[]).includes(value);
}

function isDetourDirection(value: unknown): value is DetourTravelDirection {
  return typeof value === "string" && (DETOUR_DIRECTIONS as readonly string[]).includes(value);
}

function isRecommendation(value: unknown): value is DetourRecommendation {
  return typeof value === "string" && (RECOMMENDATIONS as readonly string[]).includes(value);
}

function hasSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Reject malformed full replacements before they reach the atomic RPC.
 * This is a user-facing guard only; the database repeats every invariant.
 */
export function validateEventDetourLinks(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ["รูปแบบคำขอเชื่อมโยงไม่ถูกต้อง"];

  const eventId = typeof input.eventId === "string" ? input.eventId.trim() : "";
  const operationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
  const expectedVersion = input.expectedVersion;
  const links = input.links;

  if (!eventId || eventId.length > 128) errors.push("ต้องระบุเหตุการณ์ที่ถูกต้อง");
  if (operationId.length < 8 || operationId.length > 128) errors.push("รหัสการบันทึกไม่ถูกต้อง");
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) errors.push("เวอร์ชันข้อมูลไม่ถูกต้อง");
  if (!Array.isArray(links)) return [...new Set([...errors, "รายการทางเลี่ยงไม่ถูกต้อง"])];
  if (links.length > MAX_LINKS_PER_EVENT) errors.push("เลือกทางเลี่ยงได้ไม่เกิน 100 รายการต่อเหตุการณ์");

  const seen = new Set<string>();
  const positions = new Map<EventTravelDirection, number[]>();

  for (const rawLink of links) {
    if (!isRecord(rawLink)) {
      errors.push("พบรายการทางเลี่ยงที่มีรูปแบบไม่ถูกต้อง");
      continue;
    }

    const linkEventId = typeof rawLink.eventId === "string" ? rawLink.eventId.trim() : "";
    const detourId = typeof rawLink.detourId === "string" ? rawLink.detourId.trim() : "";
    const eventDirection = rawLink.eventDirection;
    const detourDirection = rawLink.detourDirection;
    const recommendation = rawLink.recommendation;
    const position = rawLink.position;
    const reviewedGeometryVersion = rawLink.reviewedGeometryVersion;

    if (!linkEventId || linkEventId !== eventId || !detourId) {
      errors.push("ความสัมพันธ์ไม่ตรงกับเหตุการณ์");
    }
    if (!isEventDirection(eventDirection)) errors.push("ทิศทางเหตุการณ์ไม่ถูกต้อง");
    if (!isDetourDirection(detourDirection)) errors.push("ทิศทางทางเลี่ยงไม่ถูกต้อง");
    if (!isRecommendation(recommendation)) errors.push("สถานะคำแนะนำไม่ถูกต้อง");
    if (!hasSafePositiveInteger(position)) errors.push("ลำดับทางเลี่ยงต้องเป็นจำนวนเต็มบวก");
    if (reviewedGeometryVersion !== null && reviewedGeometryVersion !== undefined && !hasSafePositiveInteger(reviewedGeometryVersion)) {
      errors.push("เวอร์ชันแนวเส้นที่ตรวจทานไม่ถูกต้อง");
    }

    if (detourId && isEventDirection(eventDirection)) {
      const key = JSON.stringify([detourId, eventDirection]);
      if (seen.has(key)) errors.push("ทางเลี่ยงซ้ำในทิศทางเดียวกัน");
      seen.add(key);
    }
    if (isEventDirection(eventDirection) && hasSafePositiveInteger(position)) {
      const scope = positions.get(eventDirection) ?? [];
      scope.push(position);
      positions.set(eventDirection, scope);
    }
    if (
      recommendation === "RECOMMENDED" && (
        !isEventDirection(eventDirection) || eventDirection === "UNKNOWN" ||
        !isDetourDirection(detourDirection) || detourDirection === "UNKNOWN" ||
        !hasSafePositiveInteger(reviewedGeometryVersion)
      )
    ) {
      errors.push("ต้องยืนยันทิศทางและเวอร์ชันแนวเส้นก่อนแนะนำ");
    }
  }

  for (const scope of positions.values()) {
    if (scope.sort((a, b) => a - b).some((position, index) => position !== index + 1)) {
      errors.push("ลำดับต้องเริ่มจาก 1 และต่อเนื่องในแต่ละทิศทาง");
    }
  }
  return [...new Set(errors)];
}

/**
 * Deduplicate links by (detourId, eventDirection) and resequence positions 1..N per direction.
 */
export function resequenceEventDetourLinks(links: EventDetourLink[]): EventDetourLink[] {
  const seen = new Set<string>();
  const grouped = new Map<EventTravelDirection, EventDetourLink[]>([
    ["A_TO_B", []],
    ["B_TO_A", []],
    ["UNKNOWN", []],
  ]);

  for (const link of links) {
    const key = `${link.eventDirection}::${link.detourId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = grouped.get(link.eventDirection);
    if (bucket) {
      bucket.push(link);
    }
  }

  const ordered: EventDetourLink[] = [];
  for (const dir of EVENT_DIRECTIONS) {
    const bucket = grouped.get(dir) ?? [];
    bucket.forEach((link, idx) => {
      ordered.push({
        ...link,
        position: idx + 1,
      });
    });
  }
  return ordered;
}

/**
 * Validate whether a detour travel direction is permitted by the detour's direction_mode.
 */
export function isDetourDirectionAllowed(
  detourDirection: DetourTravelDirection,
  directionMode?: string
): boolean {
  if (detourDirection === "FORWARD" && directionMode === "REVERSE_ONLY") return false;
  if (detourDirection === "REVERSE" && directionMode === "FORWARD_ONLY") return false;
  return true;
}

/**
 * Determine a safe default detour travel direction from a detour's direction_mode.
 */
export function resolveDefaultDetourDirection(directionMode?: string): DetourTravelDirection {
  if (directionMode === "FORWARD_ONLY") return "FORWARD";
  if (directionMode === "REVERSE_ONLY") return "REVERSE";
  if (directionMode === "TWO_WAY") return "FORWARD";
  return "UNKNOWN";
}

/**
 * Derive which event travel directions are supported by the event's segments in doh_event_segments.
 * Mirrors PostgreSQL trigger doh_sync_flood_event_segment reading raw direction_meta->>'directionCode'.
 */
export function getEventSupportedRecommendedDirections(
  segments: Array<{ direction_meta?: unknown }>
): Set<EventTravelDirection> {
  const supported = new Set<EventTravelDirection>();
  for (const seg of segments) {
    let metaObj: Record<string, unknown> | null = null;
    if (typeof seg?.direction_meta === "string") {
      try {
        const parsed = JSON.parse(seg.direction_meta);
        if (isRecord(parsed)) metaObj = parsed;
      } catch {
        metaObj = null;
      }
    } else if (isRecord(seg?.direction_meta)) {
      metaObj = seg.direction_meta;
    }
    const rawCode = typeof metaObj?.directionCode === "string" ? metaObj.directionCode : "";
    if (rawCode === "A_TO_B") {
      supported.add("A_TO_B");
    } else if (rawCode === "B_TO_A") {
      supported.add("B_TO_A");
    } else if (rawCode === "BOTH") {
      supported.add("A_TO_B");
      supported.add("B_TO_A");
    }
  }
  return supported;
}

/**
 * Mirror all PostgreSQL RECOMMENDATION_REVIEW_REQUIRED checks for user-facing validation.
 */
export function getRecommendationReviewBlockers(
  link: EventDetourLink,
  detour: { is_active?: boolean; direction_mode?: string; geometry_revision?: number } | undefined,
  supportedDirections: Set<EventTravelDirection>
): string[] {
  const blockers: string[] = [];
  if (link.eventDirection === "UNKNOWN") {
    blockers.push("ต้องระบุทิศทางเหตุการณ์ (ขาไป A→B หรือ ขากลับ B→A)");
  } else if (!supportedDirections.has(link.eventDirection)) {
    blockers.push("ช่วงน้ำท่วมในฐานข้อมูลยังไม่ระบุทิศทางที่ตรงกัน");
  }
  if (link.detourDirection === "UNKNOWN") {
    blockers.push("ต้องระบุทิศทางทางเลี่ยง (ขาไป หรือ ขากลับ)");
  }
  if (!detour || !isDetourDirectionAllowed(link.detourDirection, detour.direction_mode)) {
    blockers.push("ทิศทางทางเลี่ยงขัดกับโหมดเดินรถของเส้นทางเลี่ยง");
  }
  if (!detour?.is_active) {
    blockers.push("เส้นทางเลี่ยงยังปิดชั่วคราว (ต้องเปิดใช้งานก่อนแนะนำ)");
  }
  return blockers;
}
