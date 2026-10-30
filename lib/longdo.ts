/**
 * ตัวช่วย Longdo Map API v3
 *  - โหลดสคริปต์เอง (ไม่ต้องใส่ <script> ใน layout) และรอจนพร้อมก่อนสร้างแผนที่
 *  - ตั้ง Base Map มาตรฐาน (NORMAL, ภาษาไทย) ทันทีที่สร้าง
 *  - ซ่อน UI เริ่มต้นของ Longdo (แผงปุ่มต่างๆ) ให้หน้าจอไม่รก — โลโก้/ลิขสิทธิ์ของ Longdo คงไว้ตามเงื่อนไขการใช้งาน
 */
import { LONGDO_KEY, MAP_DEFAULT } from "./config";

export type LngLat = [number, number];

declare global {
  interface Window {
    longdo?: any;
  }
}

let loading: Promise<any> | null = null;

export function loadLongdo(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.longdo?.Map) return Promise.resolve(window.longdo);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://api.longdo.com/map/?key=${encodeURIComponent(LONGDO_KEY)}`;
    s.async = true;
    const t = setTimeout(() => { loading = null; reject(new Error("โหลด Longdo Map ไม่สำเร็จ (timeout)")); }, 20000);
    s.onload = () => {
      clearTimeout(t);
      if (window.longdo?.Map) resolve(window.longdo);
      else { loading = null; reject(new Error("Longdo Map ไม่พร้อมใช้งาน (ตรวจ API key / โดเมน)")); }
    };
    s.onerror = () => { clearTimeout(t); loading = null; reject(new Error("เชื่อมต่อ Longdo Map ไม่ได้")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** กัน XSS เวลาสร้าง HTML ของหมุดจากข้อมูลในฐานข้อมูล */
export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const ll = (c: LngLat) => ({ lon: c[0], lat: c[1] });

export function createMap(L: any, el: HTMLElement, view = MAP_DEFAULT) {
  const map = new L.Map({
    placeholder: el,
    zoom: view.zoom,
    location: { lon: view.lon, lat: view.lat },
    language: "th",
    lastView: false,
  });
  map.Layers.setBase(L.Layers.NORMAL); // Longdo Base Map มาตรฐาน เป็นค่าเริ่มต้นตั้งแต่โหลด
  for (const k of ["DPad", "Zoombar", "Geolocation", "LayerSelector", "Fullscreen", "Crosshair", "Toolbar", "Terrain"]) {
    try { map.Ui?.[k]?.visible(false); } catch { /* บางรุ่นไม่มี */ }
  }
  return map;
}

export function polyline(L: any, coords: LngLat[], o: { color: string; width: number; dashed?: boolean }) {
  const opt: any = { lineWidth: o.width, lineColor: o.color, clickable: false };
  if (o.dashed && L.LineStyle?.Dashed) opt.lineStyle = L.LineStyle.Dashed;
  return new L.Polyline(coords.map(ll), opt);
}

/** หมุด HTML — anchor คือจุดในรูปที่ตรงกับพิกัด (px) */
export function marker(L: any, c: LngLat, html: string, anchor: { x: number; y: number }, extra: any = {}) {
  return new L.Marker(ll(c), { icon: { html, offset: anchor }, ...extra });
}

export function fitTo(map: any, pts: LngLat[], pad = 0.004) {
  if (!pts.length) return;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  map.bound({
    minLon: Math.min(...xs) - pad, maxLon: Math.max(...xs) + pad,
    minLat: Math.min(...ys) - pad, maxLat: Math.max(...ys) + pad,
  });
}
