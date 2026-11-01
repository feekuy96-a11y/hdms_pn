/**
 * ตัววาดเส้นบนแผนที่ Longdo (ใช้ร่วมกันทั้งหน้าประชาชน, แอดมิน, หน้าตัวอย่างสไตล์)
 *  เส้น = รัศมีเรือง (glow) + ขอบเส้น + เส้นหลัก (ทึบ/ประ/จุด)
 *  เอฟเฟกต์เคลื่อนไหว = หมุด HTML เล็กๆ เรียงตามแนวเส้น ขยับด้วย CSS animation (ไม่กิน CPU ฝั่ง JS)
 *     chaser = จุดไฟวิ่ง A→B · arrows = ลูกศรชี้ทิศ · pulse = กะพริบพร้อมกัน · blink = ติด-ดับ
 *  หมายเหตุ: Longdo Polyline ขยับเองไม่ได้ จึงใช้หมุดแทน (ปรับระยะห่างใหม่ทุกครั้งที่ซูม)
 */
import { dashSegments, mPerPx, pointsAlong, toLines } from "./geo";
import { marker, polyline, type LngLat } from "./longdo";
import { DEFAULT_STYLE, rgba, type LineStyle, type MapStyle } from "./mapStyle";
import type { Incident, RouteRow } from "./supabase";

const clear = (map: any, arr: any[]) => { arr.forEach((o) => { try { map.Overlays.remove(o); } catch { /* ignore */ } }); arr.length = 0; };

/** วาดเส้นหนึ่งเส้นตามสไตล์ (ไม่รวมเอฟเฟกต์) */
export function drawLine(L: any, map: any, coords: LngLat[], st: LineStyle, out: any[]) {
  if (coords.length < 2) return;
  const add = (o: any) => { map.Overlays.add(o); out.push(o); };
  if (st.glow) add(polyline(L, coords, { color: rgba(st.glowColor, st.glowOpacity), width: st.width + st.glowWidth }));
  if (st.casingWidth > 0) add(polyline(L, coords, { color: rgba(st.casingColor, 1), width: st.width + st.casingWidth * 2 }));
  const main = rgba(st.color, st.opacity);
  if (st.dash === "solid") { add(polyline(L, coords, { color: main, width: st.width })); return; }
  const dash = st.dash === "dotted" ? Math.max(2, st.dashLen / 4) : st.dashLen;
  for (const seg of dashSegments(coords, dash, st.gapLen)) add(polyline(L, seg, { color: main, width: st.width }));
}

const fxHtml = (kind: string, st: LineStyle, t: number, bearing: number) => {
  const wave = kind === "chaser" || kind === "arrows" ? (t * st.fxSpeed).toFixed(2) : "0";
  return `<div class="fm-fx ${kind}" style="--s:${st.fxSize}px;--c:${st.fxColor};--dur:${st.fxSpeed}s;--dl:${wave}s;--rot:${bearing.toFixed(0)}deg"><i></i></div>`;
};

/** เอฟเฟกต์เคลื่อนไหวตามแนวเส้น */
export function drawFx(L: any, map: any, coords: LngLat[], st: LineStyle, zoom: number, out: any[], cap = 60) {
  if (st.fx === "none" || coords.length < 2) return;
  const lat = coords[Math.floor(coords.length / 2)][1];
  const pts = pointsAlong(coords, st.fxSpacing * mPerPx(zoom, lat), cap);
  for (const { p, bearing, t } of pts) {
    const mk = marker(L, p, fxHtml(st.fx, st, t, bearing), { x: st.fxSize / 2, y: st.fxSize / 2 });
    map.Overlays.add(mk); out.push(mk);
  }
}

export class MapLayers {
  private routeOv: any[] = [];
  private floodOv: any[] = [];
  private routes: RouteRow[] = [];
  private floods: Incident[] = [];
  private vis = { primary: true, secondary: true, detour: true };
  private timer: any;

  constructor(private L: any, private map: any, public style: MapStyle = DEFAULT_STYLE) {
    try { map.Event.bind("zoom", () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.drawFloods(), 350); }); } catch { /* ignore */ }
  }

  private zoom() { return Number(this.map.zoom()) || 12; }

  setStyle(s: MapStyle) { this.style = s; this.drawRoutes(); this.drawFloods(); }
  setRoutes(routes: RouteRow[], vis: { primary: boolean; secondary: boolean }) {
    this.routes = routes; this.vis = { ...this.vis, ...vis }; this.drawRoutes();
  }
  setFloods(floods: Incident[], showDetour: boolean) { this.floods = floods; this.vis.detour = showDetour; this.drawFloods(); }

  private drawRoutes() {
    clear(this.map, this.routeOv);
    const fxOk = this.style.fxEnabled && this.routes.length <= 40;
    for (const r of this.routes) {
      if (!this.vis[r.route_type]) continue;
      const st = this.style[r.route_type];
      for (const part of toLines(r.geojson)) {
        drawLine(this.L, this.map, part, st, this.routeOv);
        if (fxOk) drawFx(this.L, this.map, part, st, this.zoom(), this.routeOv, 30);
      }
    }
  }

  private drawFloods() {
    clear(this.map, this.floodOv);
    const z = this.zoom(), fx = this.style.fxEnabled;
    for (const f of this.floods) {
      if (this.vis.detour && f.detour_geojson) for (const part of toLines(f.detour_geojson)) {
        drawLine(this.L, this.map, part, this.style.detour, this.floodOv);
        if (fx) drawFx(this.L, this.map, part, this.style.detour, z, this.floodOv);
      }
      for (const part of toLines(f.flood_geojson)) {
        drawLine(this.L, this.map, part, this.style.flood, this.floodOv);
        if (fx) drawFx(this.L, this.map, part, this.style.flood, z, this.floodOv);
      }
    }
  }

  dispose() { clearTimeout(this.timer); clear(this.map, this.routeOv); clear(this.map, this.floodOv); }
}
