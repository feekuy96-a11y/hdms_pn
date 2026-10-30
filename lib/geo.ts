/** เรขาคณิตล้วน (ไม่พึ่งแผนที่/ฐานข้อมูล) */
import type { LngLat } from "./longdo";

export const inThailand = ([lng, lat]: LngLat) => lng >= 97 && lng <= 106 && lat >= 5 && lat <= 21;

/** ปัด 6 ทศนิยม, ตัดจุดซ้ำติดกัน, ตรวจว่าอยู่ในไทย (ดักการสลับ lat/lng) */
export function cleanLine(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords) {
    const p: LngLat = [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error("พิกัดไม่ถูกต้อง");
    if (!inThailand(p)) throw new Error(`พิกัดอยู่นอกประเทศไทย [${p}] — ตรวจลำดับ lng,lat`);
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length < 2) throw new Error("เส้นต้องมีอย่างน้อย 2 จุดที่ไม่ซ้ำกัน");
  return out;
}

function sqSegDist(p: LngLat, a: LngLat, b: LngLat) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx || dy) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker (แบบวนซ้ำ ไม่ recursion) tol หน่วยองศา (0.00001 ≈ 1.1 ม.) */
export function simplify(pts: LngLat[], tol: number): LngLat[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = sqSegDist(pts[i], pts[a], pts[b]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > t2 && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** ลดจุดจนไม่เกิน max (ไว้ให้ Admin ดัดเส้นได้สะดวก) */
export function simplifyToMax(pts: LngLat[], max: number): LngLat[] {
  let tol = 0.000008, out = pts;
  while (out.length > max && tol < 0.02) { tol *= 1.6; out = simplify(pts, tol); }
  return out;
}

export function lengthM(c: LngLat[]) {
  const R = 6371008.8, rad = Math.PI / 180;
  let s = 0;
  for (let i = 1; i < c.length; i++) {
    const [x1, y1] = c[i - 1], [x2, y2] = c[i];
    const dLat = (y2 - y1) * rad, dLon = (x2 - x1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin(dLon / 2) ** 2;
    s += 2 * R * Math.asin(Math.sqrt(a));
  }
  return s;
}

/** รับ geometry อะไรก็ได้ → รายการเส้น [[lng,lat]...] (ทิ้งค่า Z, ข้ามพื้นที่/จุด) */
export function toLines(g: any): LngLat[][] {
  if (!g) return [];
  const strip = (l: any[]): LngLat[] => l.map((p) => [Number(p[0]), Number(p[1])] as LngLat);
  switch (g.type) {
    case "LineString": return [strip(g.coordinates)];
    case "MultiLineString": return g.coordinates.map(strip);
    case "GeometryCollection": return (g.geometries ?? []).flatMap(toLines);
    case "Feature": return toLines(g.geometry);
    default: return [];
  }
}
