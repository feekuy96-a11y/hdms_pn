// Pure helpers for Google My Maps style line editing (add / delete / move vertices, split, join).
// All coordinates are GeoJSON order: [longitude, latitude]. No React or Leaflet dependency.

export type LonLat = [number, number];

export interface VertexEditEvent {
  type: "move" | "insert" | "click" | "contextmenu";
  index: number;
  coord?: LonLat;
  seq: number;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export function roundCoord(point: LonLat, digits = 6): LonLat {
  const factor = 10 ** digits;
  return [Math.round(point[0] * factor) / factor, Math.round(point[1] * factor) / factor];
}

export function haversineMeters(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthKm(coords: LonLat[]): number {
  let meters = 0;
  for (let i = 1; i < coords.length; i++) meters += haversineMeters(coords[i - 1], coords[i]);
  return meters / 1000;
}

export function moveVertex(coords: LonLat[], index: number, to: LonLat): LonLat[] {
  if (index < 0 || index >= coords.length) return coords;
  const next = coords.slice();
  next[index] = [to[0], to[1]];
  return next;
}

/** Insert `at` so that it becomes coords[index] (index 0..length). */
export function insertVertex(coords: LonLat[], index: number, at: LonLat): LonLat[] {
  const safeIndex = Math.max(0, Math.min(coords.length, index));
  const next = coords.slice();
  next.splice(safeIndex, 0, [at[0], at[1]]);
  return next;
}

/** A line must keep at least 2 vertices, so deleting from a 2-point line is a no-op. */
export function removeVertex(coords: LonLat[], index: number): LonLat[] {
  if (coords.length <= 2 || index < 0 || index >= coords.length) return coords;
  const next = coords.slice();
  next.splice(index, 1);
  return next;
}

/** Split at an interior vertex. The vertex is shared by both parts so they stay touching. */
export function splitLine(coords: LonLat[], index: number): [LonLat[], LonLat[]] | null {
  if (index <= 0 || index >= coords.length - 1) return null;
  return [coords.slice(0, index + 1), coords.slice(index)];
}

/**
 * Where a clicked point should be inserted so the line follows it like Google My Maps:
 * on the nearest segment, or extending the line when the click is beyond one of its ends.
 */
export function nearestInsertIndex(coords: LonLat[], point: LonLat): { index: number; distanceMeters: number } {
  if (coords.length < 2) return { index: coords.length, distanceMeters: 0 };
  const metersPerLon = 111320 * Math.cos(toRad(point[1]));
  const metersPerLat = 110574;
  let best = { index: 1, distanceMeters: Number.POSITIVE_INFINITY };

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - point[0]) * metersPerLon;
    const ay = (coords[i][1] - point[1]) * metersPerLat;
    const bx = (coords[i + 1][0] - point[0]) * metersPerLon;
    const by = (coords[i + 1][1] - point[1]) * metersPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const rawT = lengthSquared === 0 ? 0 : -(ax * dx + ay * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (distance < best.distanceMeters) {
      let index = i + 1;
      if (i === 0 && rawT < 0) index = 0;
      else if (i === coords.length - 2 && rawT > 1) index = coords.length;
      best = { index, distanceMeters: distance };
    }
  }
  return best;
}

function dedupeConsecutive(coords: LonLat[]): LonLat[] {
  const result: LonLat[] = [];
  coords.forEach((point) => {
    const last = result[result.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) result.push(point);
  });
  return result;
}

/**
 * Connect two lines end-to-end using whichever pair of ends is closest, reversing a line when needed.
 * A small gap is bridged with a straight segment; gapMeters tells the caller how large it was.
 */
export function joinLines(a: LonLat[], b: LonLat[]): { coords: LonLat[]; gapMeters: number } {
  const reversedB = b.slice().reverse();
  const options: Array<{ gap: number; coords: LonLat[] }> = [
    { gap: haversineMeters(a[a.length - 1], b[0]), coords: [...a, ...b] },
    { gap: haversineMeters(a[a.length - 1], b[b.length - 1]), coords: [...a, ...reversedB] },
    { gap: haversineMeters(a[0], b[b.length - 1]), coords: [...b, ...a] },
    { gap: haversineMeters(a[0], b[0]), coords: [...reversedB, ...a] },
  ];
  const best = options.reduce((winner, option) => (option.gap < winner.gap ? option : winner));
  return { coords: dedupeConsecutive(best.coords), gapMeters: best.gap };
}
