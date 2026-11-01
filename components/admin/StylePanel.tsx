"use client";
/**
 * ตั้งค่าเส้นบนแผนที่อย่างละเอียด (สายหลัก/สายรอง/น้ำท่วม/ทางเลี่ยง)
 *  สี · ความหนา · ความโปร่งใส · ขอบเส้น · รัศมีเรือง (glow) · รูปแบบเส้น (ทึบ/ประ/จุด) · เอฟเฟกต์เคลื่อนไหว
 *  ตัวอย่างบนแผนที่ Longdo เปลี่ยนทันทีที่ปรับ (ใช้ข้อมูลจริง ถ้ายังไม่มีข้อมูลจะแสดงเส้นตัวอย่างกลางแผนที่)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { fetchFloods, fetchRoutes, fetchSettings, saveMapStyle } from "@/lib/api";
import { MAP_DEFAULT } from "@/lib/config";
import { createMap, fitTo, loadLongdo, type LngLat } from "@/lib/longdo";
import { MapLayers } from "@/lib/mapLayers";
import { DEFAULT_STYLE, mergeStyle, type FxKind, type LineStyle, type MapStyle } from "@/lib/mapStyle";
import type { Incident, RouteRow } from "@/lib/supabase";
import { Btn, Card, Field, inputCls } from "@/components/common";
import { useFeedback } from "@/components/feedback";

type Key = "flood" | "detour" | "primary" | "secondary";
const TABS: { k: Key; l: string; dot: string }[] = [
  { k: "flood", l: "เส้นน้ำท่วม", dot: "#D32F2F" }, { k: "detour", l: "ทางเลี่ยง", dot: "#FBC02D" },
  { k: "primary", l: "ทางหลวงสายหลัก", dot: "#1B5E20" }, { k: "secondary", l: "ทางหลวงสายรอง", dot: "#81C784" },
];
const FX_LABEL: Record<FxKind, string> = { none: "ไม่มีเอฟเฟกต์", chaser: "จุดไฟวิ่งตามเส้น (A→B)", arrows: "ลูกศรชี้ทิศทาง", pulse: "กะพริบพร้อมกัน (หายใจ)", blink: "ติด-ดับ" };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex min-h-[40px] items-center justify-between gap-3"><span className="text-sm text-slate-600">{label}</span><div className="flex items-center gap-2">{children}</div></div>
);
const Color = ({ v, on }: { v: string; on: (v: string) => void }) => (
  <><span className="font-mono text-[11px] uppercase text-slate-400">{v}</span><input type="color" value={v} onChange={(e) => on(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5" /></>
);
const Range = ({ v, min, max, step, on, unit }: { v: number; min: number; max: number; step: number; on: (v: number) => void; unit?: string }) => (
  <><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-32 accent-[#0B2A5B] sm:w-40" /><span className="w-14 text-right text-xs tabular-nums text-slate-500">{v}{unit}</span></>
);
const Toggle = ({ v, on }: { v: boolean; on: (v: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={v} onClick={() => on(!v)} className={`relative h-7 w-12 rounded-full transition ${v ? "bg-[#0B2A5B]" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${v ? "left-[22px]" : "left-0.5"}`} /></button>
);
const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 p-3.5"><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t}</p><div className="divide-y divide-slate-100">{children}</div></div>
);

/* เส้นตัวอย่างเมื่อยังไม่มีข้อมูลจริง */
const demo = (): { routes: RouteRow[]; floods: Incident[] } => {
  const c = [MAP_DEFAULT.lon, MAP_DEFAULT.lat], line = (dx: number, dy: number, n: number) => Array.from({ length: n }, (_, i) => [c[0] + dx * (i / (n - 1)) - 0.02, c[1] + dy * (i / (n - 1)) + Math.sin(i / 3) * 0.002]);
  const mk = (id: string, t: "primary" | "secondary", coords: number[][]) => ({ id, route_code: id, route_name: id, route_type: t, color: "", geojson: { type: "MultiLineString", coordinates: [coords] }, pin_lng: c[0], pin_lat: c[1] }) as RouteRow;
  return {
    routes: [mk("demo1", "primary", line(0.04, 0, 20)), mk("demo2", "secondary", line(0.01, -0.03, 12).map(([x, y]) => [x + 0.01, y]))],
    floods: [{ incident_id: "demo", title: "ตัวอย่าง", flood_geojson: { type: "LineString", coordinates: line(0.012, 0, 10).map(([x, y]) => [x + 0.014, y]) },
      detour_geojson: { type: "LineString", coordinates: [[c[0] - 0.006, c[1]], [c[0] - 0.004, c[1] + 0.008], [c[0] + 0.012, c[1] + 0.009], [c[0] + 0.016, c[1] + 0.001]] }, pin_lng: c[0], pin_lat: c[1] } as unknown as Incident],
  };
};

export default function StylePanel() {
  const fb = useFeedback();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const lyRef = useRef<MapLayers | null>(null);
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState<MapStyle>(DEFAULT_STYLE);
  const [saved, setSaved] = useState<MapStyle>(DEFAULT_STYLE);
  const [tab, setTab] = useState<Key>("flood");
  const [data, setData] = useState<{ routes: RouteRow[]; floods: Incident[]; real: boolean } | null>(null);

  useEffect(() => {
    fetchSettings().then((s) => { const m = mergeStyle(s?.map_style); setStyle(m); setSaved(m); }).catch(() => {});
    Promise.all([fetchRoutes().catch(() => [] as RouteRow[]), fetchFloods().catch(() => [] as Incident[])]).then(([routes, floods]) => {
      const d = demo();
      setData({ routes: routes.length ? routes : d.routes, floods: floods.length ? floods : d.floods, real: !!(routes.length || floods.length) });
    });
    let dead = false;
    loadLongdo().then((L) => {
      if (dead || !boxRef.current || mapRef.current) return;
      mapRef.current = createMap(L, boxRef.current, { ...MAP_DEFAULT, zoom: 14 });
      lyRef.current = new MapLayers(L, mapRef.current, DEFAULT_STYLE);
      setReady(true);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => { if (ready && data) { lyRef.current?.setRoutes(data.routes, { primary: true, secondary: true }); lyRef.current?.setFloods(data.floods, true); } }, [ready, data]);
  useEffect(() => { if (ready) lyRef.current?.setStyle(style); }, [ready, style]);
  useEffect(() => {
    if (!ready || !data) return;
    const pts: LngLat[] = [];
    for (const f of data.floods) { const c = (f.flood_geojson as any)?.coordinates; if (c?.length) pts.push(c[0], c[c.length - 1]); }
    if (pts.length) fitTo(mapRef.current, pts, 0.012);
  }, [ready, data]);

  const st = style[tab];
  const set = <K extends keyof LineStyle>(k: K, v: LineStyle[K]) => setStyle((s) => ({ ...s, [tab]: { ...s[tab], [k]: v } }));
  const dirty = useMemo(() => JSON.stringify(style) !== JSON.stringify(saved), [style, saved]);

  const save = async () => {
    const ok = await fb.run({ title: "ยืนยันการบันทึกสไตล์เส้น?", message: "เส้นบนแผนที่ของหน้าประชาชนทุกคนจะเปลี่ยนตามนี้ทันที", confirmText: "บันทึก", kind: "saved", detail: "สไตล์เส้นบนแผนที่" }, () => saveMapStyle(style));
    if (ok) setSaved(style);
  };
  const reset = async () => {
    const ok = await fb.confirm({ title: "คืนค่าเริ่มต้นทั้งหมด?", message: "สไตล์ที่ปรับไว้ในหน้านี้จะถูกแทนที่ (ยังไม่บันทึกจนกว่าจะกดบันทึก)", confirmText: "คืนค่าเริ่มต้น", tone: "danger" });
    if (ok) setStyle(DEFAULT_STYLE);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="lg:sticky lg:top-0 lg:self-start">
        <Card title="ตัวอย่างบนแผนที่" sub={data?.real === false ? "ยังไม่มีข้อมูลจริง — แสดงเส้นตัวอย่าง" : "ใช้ข้อมูลจริงของระบบ"} className="overflow-hidden">
          <div className="-m-4 sm:-m-5"><div className="relative h-[40dvh] min-h-[260px] bg-slate-200 lg:h-[calc(100dvh-13rem)]"><div ref={boxRef} className="fm-map absolute inset-0" /></div></div>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-bold ${tab === t.k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}>
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: t.dot }} />{t.l}
            </button>
          ))}
        </div>

        <Sec t="เส้นหลัก">
          <Row label="สี"><Color v={st.color} on={(v) => set("color", v)} /></Row>
          <Row label="ความหนา"><Range v={st.width} min={1} max={24} step={0.5} on={(v) => set("width", v)} unit="px" /></Row>
          <Row label="ความโปร่งใส"><Range v={st.opacity} min={0.1} max={1} step={0.05} on={(v) => set("opacity", v)} /></Row>
        </Sec>
        <Sec t="ขอบเส้น">
          <Row label="สีขอบ"><Color v={st.casingColor} on={(v) => set("casingColor", v)} /></Row>
          <Row label="ความหนาขอบ (ต่อข้าง)"><Range v={st.casingWidth} min={0} max={8} step={0.5} on={(v) => set("casingWidth", v)} unit="px" /></Row>
        </Sec>
        <Sec t="รัศมีเรือง (Glow)">
          <Row label="เปิดใช้งาน"><Toggle v={st.glow} on={(v) => set("glow", v)} /></Row>
          {st.glow && <>
            <Row label="สี"><Color v={st.glowColor} on={(v) => set("glowColor", v)} /></Row>
            <Row label="ความกว้างรัศมี"><Range v={st.glowWidth} min={2} max={40} step={1} on={(v) => set("glowWidth", v)} unit="px" /></Row>
            <Row label="ความเข้ม"><Range v={st.glowOpacity} min={0.05} max={0.8} step={0.05} on={(v) => set("glowOpacity", v)} /></Row>
          </>}
        </Sec>
        <Sec t="รูปแบบเส้น">
          <Row label="ลักษณะ">
            <select className={inputCls + " !w-40"} value={st.dash} onChange={(e) => set("dash", e.target.value as any)}><option value="solid">เส้นทึบ</option><option value="dashed">เส้นประ</option><option value="dotted">เส้นจุด</option></select>
          </Row>
          {st.dash !== "solid" && <>
            <Row label="ความยาวขีด"><Range v={st.dashLen} min={2} max={120} step={1} on={(v) => set("dashLen", v)} unit=" ม." /></Row>
            <Row label="ระยะห่าง"><Range v={st.gapLen} min={2} max={120} step={1} on={(v) => set("gapLen", v)} unit=" ม." /></Row>
          </>}
        </Sec>
        <Sec t="เอฟเฟกต์เคลื่อนไหว (อนิเมชันของเส้น)">
          <Row label="รูปแบบ">
            <select className={inputCls + " !w-56"} value={st.fx} onChange={(e) => set("fx", e.target.value as FxKind)}>{(Object.keys(FX_LABEL) as FxKind[]).map((k) => <option key={k} value={k}>{FX_LABEL[k]}</option>)}</select>
          </Row>
          {st.fx !== "none" && <>
            <Row label="สี"><Color v={st.fxColor} on={(v) => set("fxColor", v)} /></Row>
            <Row label="ขนาด"><Range v={st.fxSize} min={4} max={20} step={1} on={(v) => set("fxSize", v)} unit="px" /></Row>
            <Row label="ระยะห่างระหว่างจุด"><Range v={st.fxSpacing} min={12} max={120} step={2} on={(v) => set("fxSpacing", v)} unit="px" /></Row>
            <Row label="รอบการเคลื่อนไหว"><Range v={st.fxSpeed} min={0.6} max={6} step={0.1} on={(v) => set("fxSpeed", v)} unit=" วิ" /></Row>
          </>}
        </Sec>
        <Sec t="ทั่วไป">
          <Row label="เปิดเอฟเฟกต์เคลื่อนไหวทั้งหมด"><Toggle v={style.fxEnabled} on={(v) => setStyle((s) => ({ ...s, fxEnabled: v }))} /></Row>
          <Row label="วงแหวนกระพริบที่หมุดน้ำท่วม"><Toggle v={style.pinPulse} on={(v) => setStyle((s) => ({ ...s, pinPulse: v }))} /></Row>
        </Sec>
        <p className="px-1 text-[11px] leading-relaxed text-slate-400">เอฟเฟกต์ทำงานด้วยจุด/ลูกศรเล็กๆ เรียงตามเส้น ปรับระยะห่างอัตโนมัติเมื่อซูม และปิดเองสำหรับผู้ใช้ที่ตั้งค่าอุปกรณ์ “ลดการเคลื่อนไหว”</p>

        <div className="sticky bottom-0 -mx-1 flex gap-2 border-t border-slate-200 bg-slate-50/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Btn v="ghost" onClick={reset}><RotateCcw className="h-4 w-4" />ค่าเริ่มต้น</Btn>
          <Btn className="flex-1" disabled={!dirty} onClick={save}><Save className="h-4 w-4" />{dirty ? "บันทึกสไตล์เส้น" : "ไม่มีการเปลี่ยนแปลง"}</Btn>
        </div>
      </div>
    </div>
  );
}
