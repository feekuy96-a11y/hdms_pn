import { INITIAL_SYSTEM_DATA, type FloodRoute, type SystemDataPayload } from "@/db/default-data";
import { parseFloodDirectionMeta } from "@/lib/flood-event-schema";

const KEY = `hdms:public-display:v1:${process.env.NEXT_PUBLIC_BASE_PATH || "/"}`;
const MAX_BYTES = 1024 * 1024;
const MAX_AGE = 24 * 60 * 60 * 1000;
type DisplaySnapshot = { fetchedAt: number; data: SystemDataPayload };

function fields<T extends object, K extends keyof T>(record: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = record[key];
    return value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ? [[key, value]] : [];
  })) as Pick<T, K>;
}

function routeCoordinates(raw: unknown): [number, number][] {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (!Array.isArray(data) || data.length > 24000) return [];
    return data.every((pair) => Array.isArray(pair) && pair.length >= 2 &&
      typeof pair[0] === "number" && Math.abs(pair[0]) <= 180 &&
      typeof pair[1] === "number" && Math.abs(pair[1]) <= 90) ?
      data.map(([lon, lat]) => [lon, lat]) : [];
  } catch {
    return [];
  }
}

const floodFields = ["id", "route_no", "section_name", "km_start", "km_end", "lat_start", "lon_start", "lat_end", "lon_end",
  "water_level_cm", "traffic_status", "is_active", "updated_at", "district", "subdistrict", "province",
  "trend", "diff_cm", "road_side", "affected_shoulder"] as const;
const detourFields = ["id", "flood_id_ref", "route_name", "lat_start", "lon_start", "lat_end", "lon_end",
  "direction_mode", "geometry_revision", "is_active", "district", "subdistrict", "updated_at"] as const;

function recordedLanes(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw) || !raw.length || raw.length > 12 || !raw.every((value) => typeof value === "string")) return undefined;
  // Historic stored text arrays use the same display join; do not infer a lane/status.
  return raw.join(", ");
}

function floodMeta(flood: FloodRoute) {
  const meta = parseFloodDirectionMeta(flood.direction_meta, flood);
  return {
    ...fields(meta, ["eventId", "eventCode", "directionCode", "roadSide",
      "trafficStatusDetail", "waterLevelKnown", "startedAt", "updatedAt", "zeroConfirmedAt", "status_verified"]),
    affectedParts: meta.affectedParts,
    frontageShoulderSides: meta.frontageShoulderSides,
    // Legacy durable keys are restricted to recorded engineering values, never an arbitrary nested object.
    water_level_known: typeof flood.direction_meta?.water_level_known === "boolean" ? flood.direction_meta.water_level_known : undefined,
  };
}

/** Scope: already-published map display only. No source response, media, people or free-form notes are persisted. */
export function projectPublicOfflineDisplay(source: SystemDataPayload): SystemDataPayload {
  const floodRoutes = source.floodRoutes.filter((row) => row.is_active === true).map((row) => ({
    ...fields(row, floodFields), coordinates_json: routeCoordinates(row.coordinates_json),
    latest_photo_url: "", affected_lanes: recordedLanes(row.affected_lanes), direction_meta: floodMeta(row),
  }));
  const floodIds = new Set(floodRoutes.map(({ id }) => id));
  const detourRoutes = source.detourRoutes.filter((row) => row.is_active === true).map((row) => ({
    ...fields(row, detourFields), description: "",
    coordinates_json: routeCoordinates(row.coordinates_json),
    reverse_coordinates_json: routeCoordinates(row.reverse_coordinates_json),
    flood_id_ref: row.flood_id_ref && floodIds.has(row.flood_id_ref) ? row.flood_id_ref : null,
  }));
  const detourIds = new Set(detourRoutes.map(({ id }) => id));
  const eventSegments = source.eventSegments?.filter((row) => floodIds.has(row.flood_id))
    .map((row) => fields(row, ["flood_id", "event_id", "event_direction", "segment_position"]));
  const eventIds = new Set(eventSegments?.map(({ event_id }) => event_id));
  return {
    ...INITIAL_SYSTEM_DATA,
    updatedAt: source.updatedAt,
    floodRoutes, detourRoutes, eventSegments,
    floodEvents: source.floodEvents?.filter(({ id }) => eventIds.has(id))
      .map((row) => fields(row, ["id", "link_version"])),
    eventDetourLinks: source.eventDetourLinks?.filter((row) =>
      eventIds.has(row.eventId) && detourIds.has(row.detourId) && ["PENDING", "RECOMMENDED"].includes(row.recommendation))
      .map((row) => fields(row, ["eventId", "detourId", "eventDirection", "detourDirection", "position", "eventPosition",
        "recommendation", "reviewedGeometryVersion"])),
  };
}

export function writePublicOfflineDisplay(data: SystemDataPayload, fetchedAt = Date.now()): DisplaySnapshot | null {
  try {
    const stored = { fetchedAt, data: projectPublicOfflineDisplay(data) };
    const json = JSON.stringify(stored);
    if (new TextEncoder().encode(json).length > MAX_BYTES) {
      window.localStorage.removeItem(KEY); // Never fall back to a superseded report.
      return null;
    }
    window.localStorage.setItem(KEY, json);
    return stored;
  } catch {
    try { window.localStorage.removeItem(KEY); } catch { /* local storage can be unavailable */ }
    return null;
  }
}

export function readPublicOfflineDisplay(): DisplaySnapshot | null {
  try {
    const input = window.localStorage.getItem(KEY);
    if (!input || input.length > MAX_BYTES) return null;
    const snapshot = JSON.parse(input) as DisplaySnapshot;
    if (!Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt > Date.now() || Date.now() - snapshot.fetchedAt > MAX_AGE ||
      !Array.isArray(snapshot.data?.floodRoutes) || !Array.isArray(snapshot.data?.detourRoutes)) return null;
    return { fetchedAt: snapshot.fetchedAt, data: projectPublicOfflineDisplay(snapshot.data) };
  } catch {
    return null;
  }
}
