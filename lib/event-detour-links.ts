import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { sortDetoursByOrder } from "@/lib/detour-presentation";
import { computeEventKmRangeLabel, parseFloodDirectionMeta } from "@/lib/flood-event-schema";

/**
 * Shared event↔detour relationship contract.
 * Event travel direction and detour geometry direction are intentionally separate.
 */
export type EventTravelDirection = "A_TO_B" | "B_TO_A" | "BOTH" | "UNKNOWN";
export type DetourTravelDirection = "FORWARD" | "REVERSE" | "TWO_WAY" | "UNKNOWN";
export type DetourRecommendation = "PENDING" | "RECOMMENDED" | "UNAVAILABLE" | "WITHDRAWN";
export type LinkStatusMode = "ACTIVE" | "INACTIVE";

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

export interface LinkedDetourEntry {
  detour: DetourRoute;
  links: EventDetourLink[];
  position: number;
  effectiveEventDirection: EventTravelDirection;
  effectiveDetourDirection: DetourTravelDirection;
  isActiveLink: boolean;
}

export interface LinkedFloodEventEntry {
  eventId: string;
  routeNo: string;
  sectionName: string;
  eventTitle: string;
  kmRangeLabel: string;
  floodRoutes: FloodRoute[];
  links: EventDetourLink[];
  primaryFlood: FloodRoute;
  isActiveLink: boolean;
}

const EVENT_DIRECTIONS = ["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const;
const DETOUR_DIRECTIONS = ["TWO_WAY", "FORWARD", "REVERSE", "UNKNOWN"] as const;
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

export function isEventDetourLinkVisible(recommendation?: string | null): boolean {
  return recommendation !== "WITHDRAWN" && recommendation !== "UNAVAILABLE";
}

export function recommendationToLinkStatus(recommendation?: string | null): LinkStatusMode {
  return isEventDetourLinkVisible(recommendation) ? "ACTIVE" : "INACTIVE";
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
  const dirsByDetourId = new Map<string, Set<EventTravelDirection>>();
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

      const dirSet = dirsByDetourId.get(detourId) ?? new Set<EventTravelDirection>();
      dirSet.add(eventDirection);
      dirsByDetourId.set(detourId, dirSet);
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

  for (const dirSet of dirsByDetourId.values()) {
    if (dirSet.has("BOTH") && dirSet.size > 1) {
      errors.push("ทางเลี่ยงที่กำหนดเป็น ๒ ทิศทางแล้วไม่สามารถผูกแยกทิศทางซ้ำในเหตุการณ์เดียวกัน");
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
    ["BOTH", []],
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
  if (detourDirection === "TWO_WAY" && (directionMode === "FORWARD_ONLY" || directionMode === "REVERSE_ONLY")) {
    return false;
  }
  return true;
}

/**
 * Determine a default detour travel direction directly from the recorded detour direction_mode.
 * Defaults TWO_WAY routes to TWO_WAY instead of collapsing them to FORWARD.
 */
export function resolveDefaultDetourDirection(directionMode?: string): DetourTravelDirection {
  if (directionMode === "FORWARD_ONLY") return "FORWARD";
  if (directionMode === "REVERSE_ONLY") return "REVERSE";
  if (directionMode === "TWO_WAY") return "TWO_WAY";
  return "TWO_WAY";
}

function readSegmentDirectionCode(seg: { direction_meta?: unknown; road_side?: unknown }): string {
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
  if (rawCode === "A_TO_B" || rawCode === "B_TO_A" || rawCode === "BOTH") return rawCode;
  if (seg?.road_side === "LEFT") return "A_TO_B";
  if (seg?.road_side === "RIGHT") return "B_TO_A";
  if (seg?.road_side === "BOTH") return "BOTH";
  return "UNKNOWN";
}

/**
 * Derive initial event travel direction directly from the recorded flood segments.
 * Defaults to BOTH when flood is recorded as bidirectional or unspecified.
 */
export function resolveDefaultEventDirection(
  segments: Array<{ direction_meta?: unknown; road_side?: unknown }>
): EventTravelDirection {
  let hasA = false;
  let hasB = false;
  for (const seg of segments) {
    const code = readSegmentDirectionCode(seg);
    if (code === "BOTH") return "BOTH";
    if (code === "A_TO_B") hasA = true;
    if (code === "B_TO_A") hasB = true;
  }
  if (hasA && hasB) return "BOTH";
  if (hasA) return "A_TO_B";
  if (hasB) return "B_TO_A";
  return "BOTH";
}

/**
 * Derive which event travel directions are supported by the event's segments in doh_event_segments.
 */
export function getEventSupportedRecommendedDirections(
  segments: Array<{ direction_meta?: unknown; road_side?: unknown }>
): Set<EventTravelDirection> {
  const supported = new Set<EventTravelDirection>();
  let hasKnownDirection = false;
  for (const seg of segments) {
    const rawCode = readSegmentDirectionCode(seg);
    if (rawCode === "A_TO_B") {
      supported.add("A_TO_B");
      hasKnownDirection = true;
    } else if (rawCode === "B_TO_A") {
      supported.add("B_TO_A");
      hasKnownDirection = true;
    } else if (rawCode === "BOTH") {
      supported.add("A_TO_B");
      supported.add("B_TO_A");
      supported.add("BOTH");
      hasKnownDirection = true;
    }
  }
  if (supported.has("A_TO_B") && supported.has("B_TO_A")) {
    supported.add("BOTH");
  }
  // Older imported flood routes with UNKNOWN direction remain linkable as BOTH / A_TO_B / B_TO_A.
  if (!hasKnownDirection) {
    supported.add("A_TO_B");
    supported.add("B_TO_A");
    supported.add("BOTH");
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
    blockers.push("ต้องระบุทิศทางเหตุการณ์ (๒ ทิศทาง, ขาไป A→B หรือ ขากลับ B→A)");
  } else if (!supportedDirections.has(link.eventDirection)) {
    blockers.push("ช่วงน้ำท่วมในฐานข้อมูลยังไม่ระบุทิศทางที่ตรงกัน");
  }
  if (link.detourDirection === "UNKNOWN") {
    blockers.push("ต้องระบุทิศทางทางเลี่ยง (๒ ทิศทาง, ขาไป หรือ ขากลับ)");
  }
  if (!detour || !isDetourDirectionAllowed(link.detourDirection, detour.direction_mode)) {
    blockers.push("ทิศทางทางเลี่ยงขัดกับโหมดเดินรถของเส้นทางเลี่ยง");
  }
  if (!detour?.is_active) {
    blockers.push("เส้นทางเลี่ยงยังปิดชั่วคราว (ต้องเปิดใช้งานก่อนแนะนำ)");
  }
  return blockers;
}

export function getEventIdForFloodRoute(
  flood: Pick<FloodRoute, "id" | "direction_meta">,
  eventSegments?: SystemDataPayload["eventSegments"]
): string {
  const mapped = Array.isArray(eventSegments)
    ? eventSegments.find((s) => s.flood_id === flood.id)?.event_id
    : undefined;
  if (mapped && mapped.trim()) return mapped.trim();
  const metaEventId = parseFloodDirectionMeta(flood.direction_meta, flood).eventId;
  if (metaEventId && metaEventId.trim()) return metaEventId.trim();
  return `EV-${flood.id}`;
}

function isEventManagedByLinkTable(
  eventId: string,
  systemData: SystemDataPayload
): boolean {
  if (!Array.isArray(systemData.eventDetourLinks)) return false;
  const hasLinks = systemData.eventDetourLinks.some((l) => l.eventId === eventId);
  if (hasLinks) return true;
  const evMeta = Array.isArray(systemData.floodEvents)
    ? systemData.floodEvents.find((e) => e.id === eventId)
    : undefined;
  return Boolean(evMeta && evMeta.link_version > 0);
}

/**
 * Resolve all linked detours for a given flood route/segment using doh_event_detour_links
 * (Option A+B: shows RECOMMENDED + PENDING, hides WITHDRAWN/UNAVAILABLE) with clean
 * fallback to legacy flood_id_ref when the event is not yet managed in the link table.
 */
export function getLinkedDetoursForFlood(
  flood: FloodRoute | null | undefined,
  systemData: SystemDataPayload,
  options?: { includeInactiveDetours?: boolean }
): LinkedDetourEntry[] {
  if (!flood) return [];
  const includeInactive = Boolean(options?.includeInactiveDetours);
  const detours = (systemData.detourRoutes || []).filter(
    (d) => includeInactive || d.is_active
  );
  const detourMap = new Map<string, DetourRoute>();
  for (const d of detours) detourMap.set(d.id, d);

  const eventId = getEventIdForFloodRoute(flood, systemData.eventSegments);
  if (isEventManagedByLinkTable(eventId, systemData)) {
    const activeLinks = (systemData.eventDetourLinks || [])
      .filter((l) => l.eventId === eventId && isEventDetourLinkVisible(l.recommendation))
      .sort((a, b) => a.position - b.position);

    const grouped = new Map<string, EventDetourLink[]>();
    for (const link of activeLinks) {
      if (!detourMap.has(link.detourId)) continue;
      const list = grouped.get(link.detourId);
      if (list) list.push(link);
      else grouped.set(link.detourId, [link]);
    }

    const entries: LinkedDetourEntry[] = [];
    for (const [detourId, links] of grouped.entries()) {
      const detour = detourMap.get(detourId);
      if (!detour) continue;
      const first = links[0];
      entries.push({
        detour,
        links,
        position: first.position,
        effectiveEventDirection:
          links.length > 1 || first.eventDirection === "BOTH" ? "BOTH" : first.eventDirection,
        effectiveDetourDirection: first.detourDirection,
        isActiveLink: true,
      });
    }
    return entries;
  }

  // Legacy fallback for unmigrated events or mocked APIs without eventDetourLinks.
  const fMeta = parseFloodDirectionMeta(flood.direction_meta, flood);
  const legacyMatched = detours.filter(
    (d) =>
      d.flood_id_ref === flood.id ||
      (d.detour_meta?.eventId && fMeta?.eventId && d.detour_meta.eventId === fMeta.eventId)
  );
  const sorted = sortDetoursByOrder(legacyMatched, flood.id);
  return sorted.map((detour, idx) => ({
    detour,
    links: [],
    position: idx + 1,
    effectiveEventDirection: "BOTH",
    effectiveDetourDirection: resolveDefaultDetourDirection(detour.direction_mode),
    isActiveLink: true,
  }));
}

/**
 * Resolve all linked flood events for a given detour using doh_event_detour_links
 * (Option A+B: shows RECOMMENDED + PENDING, hides WITHDRAWN/UNAVAILABLE) plus legacy
 * flood_id_ref fallback ONLY for events not yet managed in the new relationship table.
 */
export function getLinkedEventsForDetour(
  detour: DetourRoute | null | undefined,
  systemData: SystemDataPayload,
  options?: { includeInactiveFloods?: boolean }
): LinkedFloodEventEntry[] {
  if (!detour) return [];
  const includeInactive = Boolean(options?.includeInactiveFloods);
  const floodRoutes = (systemData.floodRoutes || []).filter(
    (f) => includeInactive || f.is_active
  );

  const eventSegmentsMap = new Map<string, FloodRoute[]>();
  for (const flood of floodRoutes) {
    const eventId = getEventIdForFloodRoute(flood, systemData.eventSegments);
    const list = eventSegmentsMap.get(eventId);
    if (list) list.push(flood);
    else eventSegmentsMap.set(eventId, [flood]);
  }

  const matchedLinksByEvent = new Map<string, EventDetourLink[]>();
  if (Array.isArray(systemData.eventDetourLinks)) {
    for (const link of systemData.eventDetourLinks) {
      if (link.detourId !== detour.id || !isEventDetourLinkVisible(link.recommendation)) continue;
      if (!eventSegmentsMap.has(link.eventId)) continue;
      const list = matchedLinksByEvent.get(link.eventId);
      if (list) list.push(link);
      else matchedLinksByEvent.set(link.eventId, [link]);
    }
  }

  // Add legacy flood_id_ref / detour_meta.eventId only if that event is NOT managed in doh_event_detour_links.
  const matchedEventIds = new Set<string>(matchedLinksByEvent.keys());
  if (detour.flood_id_ref) {
    const legacyFlood = floodRoutes.find((f) => f.id === detour.flood_id_ref);
    if (legacyFlood) {
      const legacyEventId = getEventIdForFloodRoute(legacyFlood, systemData.eventSegments);
      if (!isEventManagedByLinkTable(legacyEventId, systemData) && !matchedEventIds.has(legacyEventId)) {
        matchedEventIds.add(legacyEventId);
      }
    }
  }
  const metaEventId = typeof detour.detour_meta?.eventId === "string" ? detour.detour_meta.eventId.trim() : "";
  if (metaEventId && eventSegmentsMap.has(metaEventId) && !isEventManagedByLinkTable(metaEventId, systemData)) {
    matchedEventIds.add(metaEventId);
  }

  const entries: LinkedFloodEventEntry[] = [];
  for (const eventId of matchedEventIds) {
    const segments = eventSegmentsMap.get(eventId);
    if (!segments || segments.length === 0) continue;
    const primary = segments[0];
    const meta = parseFloodDirectionMeta(primary.direction_meta, primary);
    entries.push({
      eventId,
      routeNo: String(primary.route_no || ""),
      sectionName: String(primary.section_name || ""),
      eventTitle: meta.eventTitle || `ทล.${primary.route_no} ตอน${primary.section_name}`,
      kmRangeLabel: computeEventKmRangeLabel(segments),
      floodRoutes: segments,
      links: matchedLinksByEvent.get(eventId) || [],
      primaryFlood: primary,
      isActiveLink: true,
    });
  }
  return entries;
}

export function getHighwayIdsForDetour(
  detour: DetourRoute,
  systemData: SystemDataPayload
): string[] {
  const ids = new Set<string>();
  const linkedEvents = getLinkedEventsForDetour(detour, systemData);
  for (const ev of linkedEvents) {
    if (ev.routeNo) {
      ids.add(ev.routeNo.replace(/^(?:ทล|ปน)\.?\s*/i, "").trim());
    }
  }
  const names = `${detour.route_name || ""} ${detour.description || ""}`;
  for (const match of names.matchAll(/(?:ทล|ปน)\.?\s*(\d{1,5})/gi)) {
    ids.add(match[1]);
  }
  return [...ids];
}
