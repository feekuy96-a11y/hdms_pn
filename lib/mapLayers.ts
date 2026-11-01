/**
 * ตัววาดเส้นบนแผนที่ Longdo (ใช้ร่วมกันทั้งหน้าประชาชน, แอดมิน, หน้าตัวอย่างสไตล์)
 *
 * กติกาการจัดลำดับชั้น (z-order) — แก้บั๊ก "สลับเลเยอร์เวลาติ๊กซ่อน/แสดง":
 *   Longdo วาง overlay ใหม่ไว้บนสุดเสมอตอน Overlays.add() ไม่มี API ตั้งค่า z-index ตรงๆ
 *   ถ้าสลับเปิด/ปิดเฉพาะบางกลุ่ม (เช่น route) แล้ว redraw แยกจากกลุ่มอื่น กลุ่มที่เพิ่งวาดใหม่จะเด้งขึ้นบนสุด
 *   ทำให้เส้นถนนไปทับเส้นน้ำท่วมได้ทั้งที่ไม่ควร
 *   → วิธีแก้: ทุกครั้งที่มีการเปลี่ยนแปลงอะไรก็ตาม ("set*" ใดๆ) ให้ "ล้างทั้งหมดแล้ววาดใหม่ทั้งหมดในลำดับเดียวกันเสมอ"
 *     ลำดับจากล่างขึ้นบน: สายรอง → สายหลัก → ทางเลี่ยง → เส้นน้ำท่วม (เห็นชัดสุดเพราะสำคัญสุด)
 *
 * เส้น = รัศมีเรือง (glow, ต่อเนื่อง) + ขอบเส้น (casing, "ตามลายเส้นหลักเสมอ" แก้บั๊กเส้นประที่เคยมีขอบทึบทับ) + เส้นหลัก
 * เอฟเฟกต์เคลื่อนไหว = หมุด HTML เล็กๆ เรียงตามแนวเส้น ขยับด้วย CSS animation (ไม่กิน CPU ฝั่ง JS)
 */
import { dashSegments, mPerPx, pointsAlong, toLines } from "./geo";
import { marker, polyline, type LngLat } from "./longdo";
import { DEFAULT_STYLE, rgba, type LineStyle, type MapStyle } from "./mapStyle";
import type { Incident, RouteRow } from "./supabase";

const clear = (map: any, arr: any[]) => { arr.forEach((o) => { try { map.Overlays.remove(o); } catch { /* ignore */ } }); arr.length = 0; };

/** เส้นที่ตัดเป็นช่วงๆ (เส้นประ/เส้นจุด) หรือเส้นเดียวยาวตลอด (เส้นทึบ) — ใช้ชุดเดียวกันทั้งขอบเส้นและเส้นหลัก */
function lineSegments(coords: LngLat[], st: LineStyle): LngLat[][] {
  if (st.dash === "solid") return [coords];
  const dash = st.dash === "dotted" ? Math.max(2, st.dashLen / 4) : st.dashLen;
  return dashSegments(coords, dash, st.gapLen);
}

/** วาดเส้นหนึ่งเส้นตามสไตล์ (ไม่รวมเอฟเฟกต์) — เรียงบนสุดคือเส้นหลัก: glow → casing(ตามลาย) → main(ตามลาย) */
export function drawLine(L: any, map: any, coords: LngLat[], st: LineStyle, out: any[]) {
  if (coords.length < 2) return;
  const add = (o: any) => { map.Overlays.add(o); out.push(o); };
  if (st.glow) add(polyline(L, coords, { color: rgba(st.glowColor, st.glowOpacity), width: st.width + st.glowWidth }));
  const segs = lineSegments(coords, st);
  if (st.casingWidth > 0) for (const seg of segs) add(polyline(L, seg, { color: rgba(st.casingColor, 1), width: st.width + st.casingWidth * 2 }));
  const main = rgba(st.color, st.opacity);
  for (const seg of segs) add(polyline(L, seg, { color: main, width: st.width }));
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
  private all: any[] = [];                 // overlay ทั้งหมดที่ MapLayers สร้าง เรียงตาม z-order จริง
  private routes: RouteRow[] = [];
  private floods: Incident[] = [];
  private vis = { primary: true, secondary: true, detour: true };
  private timer: any;
  private extra: (() => void) | null = null; // hook ให้ผู้เรียก (เช่น MapEditor) วาดชั้นของตัวเองทับบนสุดเสมอ

  constructor(private L: any, private map: any, public style: MapStyle = DEFAULT_STYLE) {
    try { map.Event.bind("zoom", () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.redraw(), 300); }); } catch { /* ignore */ }
  }

  private zoom() { return Number(this.map.zoom()) || 12; }

  /** ให้ผู้เรียกภายนอก (เช่นตัวแก้ไขเส้นในหน้าแอดมิน) ลงทะเบียนชั้นที่ต้องอยู่ "บนสุดเสมอ" */
  setTopLayer(drawFn: (() => void) | null) { this.extra = drawFn; this.redraw(); }

  setStyle(s: MapStyle) { this.style = s; this.redraw(); }
  setRoutes(routes: RouteRow[], vis: { primary: boolean; secondary: boolean }) { this.routes = routes; this.vis = { ...this.vis, ...vis }; this.redraw(); }
  setFloods(floods: Incident[], showDetour: boolean) { this.floods = floods; this.vis.detour = showDetour; this.redraw(); }

  /** ล้างทุกอย่างแล้ววาดใหม่ "ทั้งหมด" ตามลำดับคงที่ — การันตี z-order ไม่สลับไม่ว่าจะแก้อะไรก่อน/หลัง */
  private redraw() {
    clear(this.map, this.all);
    const z = this.zoom(), fxOk = this.style.fxEnabled;

    // 1) สายรอง → 2) สายหลัก (ให้สายหลักเด่นกว่าสายรองที่อาจวิ่งขนานกัน)
    for (const type of ["secondary", "primary"] as const) {
      if (!this.vis[type]) continue;
      const st = this.style[type];
      const list = this.routes.filter((r) => r.route_type === type);
      const fx = fxOk && list.length <= 40;
      for (const r of list) for (const part of toLines(r.geojson)) {
        drawLine(this.L, this.map, part, st, this.all);
        if (fx) drawFx(this.L, this.map, part, st, z, this.all, 30);
      }
    }
    // 3) ทางเลี่ยง (เหลือง)
    if (this.vis.detour) for (const f of this.floods) if (f.detour_geojson) for (const part of toLines(f.detour_geojson)) {
      drawLine(this.L, this.map, part, this.style.detour, this.all);
      if (fxOk) drawFx(this.L, this.map, part, this.style.detour, z, this.all);
    }
    // 4) เส้นน้ำท่วม (แดง) — อยู่บนสุดของเส้นทั้งหมดเสมอ เพราะสำคัญที่สุด
    for (const f of this.floods) for (const part of toLines(f.flood_geojson)) {
      drawLine(this.L, this.map, part, this.style.flood, this.all);
      if (fxOk) drawFx(this.L, this.map, part, this.style.flood, z, this.all);
    }
    // 5) ชั้นของผู้เรียกภายนอก (เช่น จุดแก้ไข/หมุด A-B) — บังคับให้อยู่บนสุดเสมอ ไม่ว่า redraw() จะถูกเรียกกี่รอบ
    this.extra?.();
  }

  dispose() { clearTimeout(this.timer); clear(this.map, this.all); }
}
