import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const BOUNDARY_INDEX_PATH = `${BASE}/boundaries/th/index.json`;

export function boundaryAreaPath(code: string) {
  if (!/^(?:\d{2}|\d{4}|\d{6})$/.test(code)) throw Error("Invalid area code");
  return `${BASE}/boundaries/th/${code}.json`;
}

export type BoundaryArea = { code: string; name: string };
export type BoundaryIndex = { provinces: BoundaryArea[] };
type BoundaryProperties = { codes: string[] };
type BoundaryFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>;
export type BoundarySelection = { children: BoundaryArea[]; feature: BoundaryFeature };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid object");
  return value as Record<string, unknown>;
}

function label(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 300) throw Error("Invalid label");
  return value.trim();
}

function entries<T extends BoundaryArea>(value: unknown, prefix: string, size: number, map: (obj: Record<string, unknown>, area: BoundaryArea) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) throw Error("Invalid area index");
  const known = new Set<string>();
  return value.map(item => {
    const obj = record(item);
    const code = obj.code;
    if (typeof code !== "string" || code.length !== size || !/^\d+$/.test(code) || !code.startsWith(prefix) || known.has(code)) {
      throw Error("Invalid area code");
    }
    known.add(code);
    return map(obj, { code, name: label(obj.name) });
  });
}

export function parseBoundaryIndex(value: unknown): BoundaryIndex {
  const obj = record(value);
  if (obj.version !== 2) throw Error("Invalid boundary index version");
  const provinces = entries(obj.provinces, "", 2, (_obj, area) => area);
  if (provinces.length !== 77 || !provinces.some(area => area.code === "94")) throw Error("Incomplete provinces");
  return { provinces };
}

export function parseBoundarySelection(value: unknown, code: string): BoundarySelection {
  const obj = record(value);
  if (obj.version !== 2 || obj.code !== code) throw Error("Invalid boundary asset");
  const children = entries(obj.children, code, code.length + 2, (_obj, area) => area);
  if (code.length === 6 && children.length) throw Error("Unexpected child areas");
  let remainingPoints = 100_000;
  const ring = (value: unknown): Position[] => {
    if (!Array.isArray(value) || value.length < 4 || (remainingPoints -= value.length) < 0) throw Error("Invalid ring");
    const positions = value.map(point => {
      if (!Array.isArray(point) || point.length !== 2) throw Error("Invalid coordinate");
      const [lon, lat] = point;
      // Narrow WGS84 guard for Thailand, catches inverted axes and foreign geometry.
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 96 || lon > 107 || lat < 4 || lat > 22) throw Error("Invalid WGS84 coordinate");
      return [lon, lat];
    });
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) throw Error("Unclosed ring");
    return positions;
  };
  const polygon = (value: unknown): Position[][] => {
    if (!Array.isArray(value) || !value.length) throw Error("Invalid polygon");
    return value.map(ring);
  };
  const feature = record(obj.feature);
  const codes = record(feature.properties).codes;
  const geometry = record(feature.geometry);
  if (feature.type !== "Feature" || !Array.isArray(codes) || !codes.includes(code) ||
      new Set(codes).size !== codes.length || codes.some(candidate => typeof candidate !== "string" ||
        !/^\d+$/.test(candidate) || candidate.length !== code.length ||
        (candidate !== code && (!code.startsWith("10") || code.length !== 6 || candidate.slice(0, 4) !== code.slice(0, 4))))) {
    throw Error("Unexpected feature codes");
  }
  let shape: Polygon | MultiPolygon;
  if (geometry.type === "Polygon") shape = { type: "Polygon", coordinates: polygon(geometry.coordinates) };
  else if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length) {
    shape = { type: "MultiPolygon", coordinates: geometry.coordinates.map(polygon) };
  } else throw Error("Invalid polygon type");
  return { children, feature: { type: "Feature", properties: { codes }, geometry: shape } };
}

export async function readBoundaryJson(path: string, limit: number, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal, mode: "same-origin", redirect: "error" });
  if (!response.ok || !response.body) throw Error("Boundary asset unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let data = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Boundary asset exceeds budget");
      data += decoder.decode(value, { stream: true });
    }
    return JSON.parse(data + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
