"use client";
/**
 * ตัวแก้ไขเส้นบนแผนที่ (เพิ่ม/แก้เหตุการณ์น้ำท่วม)
 *
 * จุด A/B ของ "ช่วงน้ำท่วม (กม.เริ่มต้น–สิ้นสุด)" และ "ทางเลี่ยง" ใส่ได้ 2 วิธี:
 *   ① พิมพ์/วางพิกัด (lat, lng) → ปักหมุดบนแผนที่ → ครบ A และ B ระบบสร้างเส้นตามถนนให้อัตโนมัติ
 *   ② กด "เลือกบนแผนที่" หรือคลิกแผนที่ตรงๆ (คลิกแรก = A, คลิกที่สอง = B)
 * เส้นที่ได้ดัดต่อได้อิสระ: ลากจุดขาว · แตะจุดกลางเส้นเพื่อเพิ่มจุด · เลือกจุดแล้วลบ · ย้อนกลับ 30 ขั้น
 * ตำบล/อำเภอ ดึงจากพิกัดอัตโนมัติ (แก้เองได้ — ถ้าแก้แล้วระบบจะไม่เขียนทับ)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, PenLine, RotateCcw, Save, Sparkles, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { autoRoute, fetchRoutes, fetchSettings, reverseGeocode, saveIncident } from "@/lib/api";
import { fitTo, createMap, loadLongdo, marker, polyline, type LngLat } from "@/lib/longdo";
import { fmtCoord, lengthM, parseCoord, simplifyToMax, toLines } from "@/lib/geo";
import { drawLine } from "@/lib/mapLayers";
import { DEFAULT_STYLE, mergeStyle } from "@/lib/mapStyle";
import type { Incident, RouteRow, Traffic } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, TRAFFIC } from "@/components/common";
import { useFeedback } from "@/components/feedback";

type Mode = "flood" | "detour";
type Which = "a" | "b";
type Ends = Record<Mode, { a: LngLat | null; b: LngLat | null }>;
type Lines = Record<Mode, LngLat[]>;

function CoordField({ label, value, onChange, onCommit, onPick, picking, tone }: {
  label: string; value: string; onChange: (v: string) => void; onCommit: () => void; onPick: () => void; picking: boolean; tone: string;
}) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />{label}</span>
      <div className="flex gap-1.5">
        <input className={inputCls} inputMode="decimal" placeholder="6.870400, 101.253300" value={value}
          onChange={(e) => onChange(e.target.value)} onBlur={onCommit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())} />
        <button type="button" onClick={onPick} title="เลือกบนแผนที่" aria-label="เลือกบนแผนที่"
          className={`grid min-h-[42px] w-11 shrink-0 place-items-center rounded-lg border ${picking ? "border-[#0B2A5B] bg-[#0B2A5B] text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function MapEditor({ editing, onDone }: { editing: Incident | null; onDone: () => void }) {
  const fb = useFeedback();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const ov = useRef<any[]>([]);
  const bgOv = useRef<any[]>([]);
  const vtx = useRef<any[]>([]);
  const lastMarkerClick = useRef(0);
  const lastDrop = useRef(0);
  const firstGeo = useRef(true);

  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState<Mode>("flood");
  const [tool, setTool] = useState<"auto" | "manual">("auto");
  const initLines: Lines = {
    flood: editing ? toLines(editing.flood_geojson)[0] ?? [] : [],
    detour: editing?.detour_geojson ? toLines(editing.detour_geojson)[0] ?? [] : [],
  };
  const endsOf = (c: LngLat[]) => ({ a: c[0] ?? null, b: c.length >= 2 ? c[c.length - 1] : null });
  const [lines, setLines] = useState<Lines>(initLines);
  const [ends, setEnds] = useState<Ends>({ flood: endsOf(initLines.flood), detour: endsOf(initLines.detour) });
  const [txt, setTxt] = useState({
    floodA: initLines.flood[0] ? fmtCoord(initLines.flood[0]) : "", floodB: initLines.flood.length >= 2 ? fmtCoord(initLines.flood[initLines.flood.length - 1]) : "",
    detourA: initLines.detour[0] ? fmtCoord(initLines.detour[0]) : "", detourB: initLines.detour.length >= 2 ? fmtCoord(initLines.detour[initLines.detour.length - 1]) : "",
  });
  const [pick, setPick] = useState<{ mode: Mode; which: Which } | null>(null);
  const [hist, setHist] = useState<Lines[]>([]);
  const [selV, setSelV] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState({ loc: !!editing?.location_name, dist: !!editing?.district });
  const [form, setForm] = useState({
    title: editing?.title ?? "", location: editing?.location_name ?? "", district: editing?.district ?? "",
    traffic: (editing?.traffic_status ?? "closed") as Traffic, level: "", note: "", by: "",
    routeId: editing?.route_id ?? "", detourNote: editing?.detour_note ?? "",
    kmStart: editing?.km_start != null ? String(editing.km_start) : "", kmEnd: editing?.km_end != null ? String(editing.km_end) : "",
  });

  const st = useRef({ mode, tool, lines, ends, pick, busy, routes, routeId: form.routeId, touched });
  st.current = { mode, tool, lines, ends, pick, busy, routes, routeId: form.routeId, touched };

  /* ───── เขียนเส้น + ซิงก์จุด A/B/ช่องพิกัด ───── */
  const applyLine = useCallback((m: Mode, coords: LngLat[]) => {
    setHist((h) => [...h.slice(-29), st.current.lines]);
    setLines((l) => ({ ...l, [m]: coords }));
    setEnds((e) => ({ ...e, [m]: endsOf(coords) }));
    setTxt((t) => ({ ...t, [m === "flood" ? "floodA" : "detourA"]: coords[0] ? fmtCoord(coords[0]) : "", [m === "flood" ? "floodB" : "detourB"]: coords.length >= 2 ? fmtCoord(coords[coords.length - 1]) : "" }));
  }, []);

  const generate = useCallback(async (m: Mode, a: LngLat, b: LngLat) => {
    setBusy(true); setInfo("กำลังสร้างเส้นตามถนน…");
    try {
      const r = await autoRoute(a, b, m === "detour" ? "osrm" : "db");
      applyLine(m, simplifyToMax(r.coords, 90)); setSelV(null);
      setInfo(r.via === "db" ? `เกาะตามถนน ทล.${r.label} จากข้อมูลที่นำเข้า ✓ — ดัดเส้นเพิ่มได้`
        : r.via === "osrm" ? "สร้างเส้นตามถนนด้วย OSRM (ตัวสำรอง) — ตรวจแนวเส้นก่อนบันทึก"
        : "ไม่พบถนนใกล้จุดที่ระบุ จึงลากเส้นตรงให้ — ลากจุด/เพิ่มจุดเพื่อดัดตามถนนได้");
      if (r.via === "db" && m === "flood" && !st.current.routeId) {
        const hit = st.current.routes.find((x) => x.route_code === r.label);
        if (hit) setForm((f) => ({ ...f, routeId: hit.id }));
      }
    } finally { setBusy(false); }
  }, [applyLine]);

  const setEnd = useCallback(async (m: Mode, w: Which, pt: LngLat) => {
    const next = { ...st.current.ends[m], [w]: pt };
    setEnds((e) => ({ ...e, [m]: next }));
    setTxt((t) => ({ ...t, [(m === "flood" ? "flood" : "detour") + w.toUpperCase()]: fmtCoord(pt) }));
    setMode(m); setPick(null);
    if (next.a && next.b) await generate(m, next.a, next.b);
    else setInfo(w === "a" ? "ปักจุด A แล้ว — ใส่พิกัดหรือคลิกแผนที่เพื่อกำหนดจุด B" : "ปักจุด B แล้ว — ใส่พิกัดหรือคลิกแผนที่เพื่อกำหนดจุด A");
  }, [generate]);

  const commitCoord = (m: Mode, w: Which) => {
    const key = (m + w.toUpperCase()) as keyof typeof txt;
    const v = txt[key].trim();
    if (!v) return;
    const pt = parseCoord(v);
    if (!pt) { setInfo("รูปแบบพิกัดไม่ถูกต้อง — ตัวอย่าง 6.8704, 101.2533 (ในประเทศไทย)"); return; }
    const cur = st.current.ends[m][w];
    if (cur && Math.abs(cur[0] - pt[0]) < 1e-7 && Math.abs(cur[1] - pt[1]) < 1e-7) return;
    setEnd(m, w, pt);
    if (mapRef.current) mapRef.current.location({ lon: pt[0], lat: pt[1] }, true);
  };

  /* ───── คลิกบนแผนที่ ───── */
  const handleClick = useCallback((pt: LngLat) => {
    const s = st.current;
    if (s.busy) return;
    if (s.tool === "manual") { applyLine(s.mode, [...s.lines[s.mode], pt]); return; }
    const e = s.ends[s.mode];
    const tgt = s.pick ?? (!e.a ? { mode: s.mode, which: "a" as Which } : !e.b ? { mode: s.mode, which: "b" as Which } : null);
    if (!tgt) { setInfo("มีเส้นแล้ว — ลากจุดขาวเพื่อดัดเส้น, เลือก “เลือกบนแผนที่” เพื่อเปลี่ยนจุด A/B หรือกด “ลากเส้นใหม่”"); return; }
    setEnd(tgt.mode, tgt.which, pt);
  }, [applyLine, setEnd]);

  const syncVertices = useCallback(() => {
    if (!vtx.current.length) return;
    applyLine(st.current.mode, vtx.current.map((m) => { const p = m.location(); return [p.lon, p.lat] as LngLat; }));
  }, [applyLine]);

  const insertMid = useCallback((i: number) => {
    const s = st.current, cur = s.lines[s.mode];
    if (!cur[i] || !cur[i + 1]) return;
    applyLine(s.mode, [...cur.slice(0, i + 1), [(cur[i][0] + cur[i + 1][0]) / 2, (cur[i][1] + cur[i + 1][1]) / 2], ...cur.slice(i + 1)]);
    setSelV(i + 1);
  }, [applyLine]);

  const clickRef = useRef(handleClick); clickRef.current = handleClick;
  const syncRef = useRef(syncVertices); syncRef.current = syncVertices;
  const midRef = useRef(insertMid); midRef.current = insertMid;

  /* ───── สร้างแผนที่ ───── */
  useEffect(() => {
    let dead = false;
    const box = boxRef.current;
    const onBox = (e: Event) => {
      const t = e.target as HTMLElement;
      const v = t.closest?.("[data-vi]") as HTMLElement | null;
      const m = t.closest?.("[data-mid]") as HTMLElement | null;
      if (v) { lastMarkerClick.current = Date.now(); setSelV(Number(v.dataset.vi)); }
      else if (m) { lastMarkerClick.current = Date.now(); midRef.current(Number(m.dataset.mid)); }
    };
    loadLongdo().then((L) => {
      if (dead || !box || mapRef.current) return;
      LRef.current = L;
      const map = createMap(L, box);
      mapRef.current = map;
      map.Event.bind("click", () => {
        if (Date.now() - lastMarkerClick.current < 350 || Date.now() - lastDrop.current < 450) return;
        const p = map.location(L.LocationMode.Pointer);
        if (p) clickRef.current([p.lon, p.lat]);
      });
      map.Event.bind("drop", () => { lastDrop.current = Date.now(); setTimeout(() => syncRef.current(), 0); });
      box.addEventListener("click", onBox, true);
      setMapReady(true);
    }).catch((e) => setInfo(e.message));
    fetchRoutes().then(setRoutes).catch(() => {});
    fetchSettings().then((s) => setStyle(mergeStyle(s?.map_style))).catch(() => {});
    return () => { dead = true; box?.removeEventListener("click", onBox, true); };
  }, []);

  useEffect(() => { if (mapReady && editing && lines.flood.length) fitTo(mapRef.current, lines.flood, 0.01); /* eslint-disable-next-line */ }, [mapReady]);

  /**
   * วาดพื้นหลัง (เส้นทางหลวงอ้างอิง) + ชั้นแก้ไข (เส้น/จุดจับ/A-B) "รวมในเอฟเฟกต์เดียว"
   * เดิมแยกเป็น 2 เอฟเฟกต์คนละ dependency — พอ `routes` เปลี่ยนแล้ว effect พื้นหลังรันใหม่ทีหลัง
   * overlay ของพื้นหลังจะถูกเพิ่มต่อท้าย (Longdo ไม่มี z-index) ดันจุดแก้ไขที่วาดไว้ก่อนหน้าให้จมลงไป
   * คลิก/ลากจุดไม่ได้ทั้งที่มองเห็น → รวมเป็นเอฟเฟกต์เดียว ล้างทั้งคู่แล้ววาดพื้นหลังก่อนเสมอ
   * ตามด้วยชั้นแก้ไขเป็นลำดับสุดท้าย รับประกันว่าจุดจับอยู่บนสุดเสมอไม่ว่า dependency ไหนเปลี่ยน
   */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    bgOv.current.forEach((o) => m.Overlays.remove(o)); bgOv.current = [];
    ov.current.forEach((o) => m.Overlays.remove(o)); ov.current = []; vtx.current = [];

    for (const r of routes) for (const part of toLines(r.geojson)) {
      for (const o of [polyline(L, part, { color: "rgba(255,255,255,.9)", width: 8 }), polyline(L, part, { color: "rgba(27,94,32,.7)", width: 4 })]) { m.Overlays.add(o); bgOv.current.push(o); }
    }

    const add = (o: any) => { m.Overlays.add(o); ov.current.push(o); };
    drawLine(L, m, lines.detour, style.detour, ov.current);
    drawLine(L, m, lines.flood, style.flood, ov.current);
    const cur = lines[mode];
    cur.forEach((c, i) => {
      const last = i === cur.length - 1 && cur.length > 1;
      const cls = `fm-vtx${i === 0 ? " a" : last ? " b" : ""}${selV === i ? " sel" : ""}`;
      const label = i === 0 ? "A" : last ? "B" : "";
      const mk = marker(L, c, `<div class="${cls}" data-vi="${i}" style="${label ? "display:grid;place-items:center;font:800 10px/1 sans-serif;color:#0B2A5B;width:24px;height:24px" : ""}">${label}</div>`, label ? { x: 12, y: 12 } : { x: 10, y: 10 }, { draggable: true });
      add(mk); vtx.current.push(mk);
    });
    for (let i = 0; i < cur.length - 1; i++) add(marker(L, [(cur[i][0] + cur[i + 1][0]) / 2, (cur[i][1] + cur[i + 1][1]) / 2], `<div class="fm-mid" data-mid="${i}"></div>`, { x: 6, y: 6 }));
    if (cur.length < 2) {   // ยังไม่มีเส้น → โชว์จุดที่ปักไว้
      const e = ends[mode];
      if (e.a) add(marker(L, e.a, '<div class="fm-pend">A</div>', { x: 13, y: 13 }));
      if (e.b) add(marker(L, e.b, '<div class="fm-pend" style="background:#D32F2F">B</div>', { x: 13, y: 13 }));
    }
  }, [mapReady, routes, lines, ends, mode, selV, style]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── ตำบล/อำเภอจากพิกัด (ไม่เขียนทับสิ่งที่แอดมินแก้เอง) ───── */
  const fillPlace = useCallback(async (force = false) => {
    const fl = st.current.lines.flood;
    if (fl.length < 2) return;
    const mid = fl[Math.floor(fl.length / 2)];
    setGeoBusy(true);
    try {
      const g = await reverseGeocode(mid[0], mid[1]);
      if (!g) { if (force) setInfo("ดึงชื่อพื้นที่จากพิกัดไม่ได้ — กรอกเองได้"); return; }
      setForm((f) => ({
        ...f,
        location: force || !st.current.touched.loc ? g.subdistrict || f.location : f.location,
        district: force || !st.current.touched.dist ? g.district || f.district : f.district,
      }));
      if (force) setTouched({ loc: false, dist: false });
    } finally { setGeoBusy(false); }
  }, []);

  useEffect(() => {
    if (firstGeo.current) { firstGeo.current = false; if (editing) return; }
    if (lines.flood.length < 2) return;
    const t = setTimeout(() => fillPlace(false), 900);
    return () => clearTimeout(t);
  }, [lines.flood, fillPlace, editing]);

  /* ───── เครื่องมือ ───── */
  const undo = () => {
    const h = hist[hist.length - 1]; if (!h) return;
    setHist((x) => x.slice(0, -1)); setLines(h);
    setEnds({ flood: endsOf(h.flood), detour: endsOf(h.detour) });
    setTxt({ floodA: h.flood[0] ? fmtCoord(h.flood[0]) : "", floodB: h.flood.length > 1 ? fmtCoord(h.flood[h.flood.length - 1]) : "", detourA: h.detour[0] ? fmtCoord(h.detour[0]) : "", detourB: h.detour.length > 1 ? fmtCoord(h.detour[h.detour.length - 1]) : "" });
    setSelV(null);
  };
  const delVertex = () => { const cur = lines[mode]; if (selV == null || cur.length <= 2) return; applyLine(mode, cur.filter((_, i) => i !== selV)); setSelV(null); };
  const redraw = (m: Mode = mode) => {
    applyLine(m, []); setEnds((e) => ({ ...e, [m]: { a: null, b: null } })); setSelV(null); setPick(null);
    setTxt((t) => (m === "flood" ? { ...t, floodA: "", floodB: "" } : { ...t, detourA: "", detourB: "" }));
    setInfo(tool === "auto" ? "ใส่พิกัด/คลิกจุด A และ B ใหม่" : "คลิกวางจุดต่อเนื่อง");
  };

  const fl = lengthM(lines.flood), dl = lengthM(lines.detour);
  const fmtLen = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`);
  const hint = busy ? "กำลังสร้างเส้นตามถนน…" : info
    || (lines[mode].length >= 2 ? "ลากจุดขาวเพื่อดัดเส้น · แตะจุดกลางเส้นเพื่อเพิ่มจุด" : tool === "auto" ? "ใส่พิกัด A/B หรือคลิกบนถนน ระบบจะลากเส้นตามถนนให้" : "คลิกวางจุดต่อเนื่องตามแนวถนน");
  const canSave = lines.flood.length >= 2 && form.title.trim() && (editing || form.level !== "");

  const save = async () => {
    const ok = await fb.run({
      title: editing ? "ยืนยันการแก้ไขเหตุการณ์?" : "ยืนยันการบันทึกเหตุการณ์?",
      message: <>“{form.title.trim()}” · ช่วงน้ำท่วม {fmtLen(fl)}{lines.detour.length >= 2 ? ` · ทางเลี่ยง ${fmtLen(dl)}` : ""}<br />ข้อมูลจะแสดงบนหน้าประชาชนทันที</>,
      confirmText: editing ? "บันทึกการแก้ไข" : "บันทึก", kind: editing ? "edited" : "saved", detail: form.title.trim(),
    }, () => saveIncident({
      id: editing?.incident_id, title: form.title.trim(), location: form.location, district: form.district, traffic: form.traffic,
      flood: lines.flood, detour: lines.detour, detourNote: form.detourNote, routeId: form.routeId || null,
      kmStart: form.kmStart ? Number(form.kmStart) : null, kmEnd: form.kmEnd ? Number(form.kmEnd) : null,
      levelCm: Number(form.level), note: form.note, reportedBy: form.by, images: files,
    }));
    if (ok) onDone();
  };

  const seg = (on: boolean) => `flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${on ? "bg-white text-slate-900 shadow" : "text-slate-500"}`;
  const pk = (m: Mode, w: Which) => () => { setMode(m); setTool("auto"); setPick((p) => (p?.mode === m && p.which === w ? null : { mode: m, which: w })); setInfo(`คลิกบนแผนที่เพื่อกำหนดจุด ${w.toUpperCase()}`); };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="overflow-hidden" title={editing ? "แก้ไขเหตุการณ์" : "กำหนดจุดน้ำท่วมบนแผนที่"}
        right={
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button className={seg(mode === "flood")} onClick={() => { setMode("flood"); setSelV(null); }}><i className="h-2 w-2 rounded-full bg-[#D32F2F]" />เส้นน้ำท่วม</button>
            <button className={seg(mode === "detour")} onClick={() => { setMode("detour"); setSelV(null); }}><i className="h-2 w-2 rounded-full bg-[#FBC02D]" />เส้นเลี่ยง</button>
          </div>
        }>
        <div className="-m-4 sm:-m-5">
          <div className="relative h-[52dvh] min-h-[300px] bg-slate-200 lg:h-[calc(100dvh-17rem)]">
            <div ref={boxRef} className="fm-map absolute inset-0" />
            {busy && <div className="absolute inset-0 z-10 grid place-items-center bg-white/40"><Loader2 className="h-8 w-8 animate-spin text-[#0B2A5B]" /></div>}
            {pick && <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[#0B2A5B] px-4 py-1.5 text-xs font-bold text-white shadow-lg">คลิกบนแผนที่เพื่อกำหนดจุด {pick.which.toUpperCase()} ({pick.mode === "flood" ? "น้ำท่วม" : "ทางเลี่ยง"})</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex rounded-lg bg-slate-200/70 p-0.5">
              <button className={seg(tool === "auto")} onClick={() => setTool("auto")}><Wand2 className="h-3.5 w-3.5" />อัตโนมัติ</button>
              <button className={seg(tool === "manual")} onClick={() => { setTool("manual"); setPick(null); }}><PenLine className="h-3.5 w-3.5" />วาดเอง</button>
            </div>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={undo} disabled={!hist.length}><Undo2 className="h-4 w-4" />ย้อนกลับ</Btn>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={delVertex} disabled={selV == null || lines[mode].length <= 2}><Trash2 className="h-4 w-4" />ลบจุด</Btn>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={() => redraw()}><RotateCcw className="h-4 w-4" />ลากเส้นใหม่</Btn>
            <span className="ml-auto text-xs font-semibold text-slate-500">{fl > 0 ? `น้ำท่วม ~${fmtLen(fl)}` : ""}{dl > 0 ? ` · เลี่ยง ~${fmtLen(dl)}` : ""}</span>
          </div>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-600">{hint}</p>
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="ช่วงน้ำท่วม" sub="พิกัด = ตำแหน่ง กม.เริ่มต้น (A) และ กม.สิ้นสุด (B)">
          <div className="space-y-3">
            <Field label="หัวข้อเหตุการณ์ *"><input className={inputCls} placeholder="เช่น น้ำท่วม ทล.42 กม.15–16" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="กม.เริ่มต้น"><input type="number" inputMode="decimal" className={inputCls} value={form.kmStart} onChange={(e) => setForm({ ...form, kmStart: e.target.value })} /></Field>
              <Field label="กม.สิ้นสุด"><input type="number" inputMode="decimal" className={inputCls} value={form.kmEnd} onChange={(e) => setForm({ ...form, kmEnd: e.target.value })} /></Field>
            </div>
            <CoordField label="พิกัด กม.เริ่มต้น (จุด A)" tone="#16a34a" value={txt.floodA} onChange={(v) => setTxt({ ...txt, floodA: v })} onCommit={() => commitCoord("flood", "a")} onPick={pk("flood", "a")} picking={pick?.mode === "flood" && pick.which === "a"} />
            <CoordField label="พิกัด กม.สิ้นสุด (จุด B)" tone="#D32F2F" value={txt.floodB} onChange={(v) => setTxt({ ...txt, floodB: v })} onCommit={() => commitCoord("flood", "b")} onPick={pk("flood", "b")} picking={pick?.mode === "flood" && pick.which === "b"} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="ตำบล"><input className={inputCls} value={form.location} onChange={(e) => { setForm({ ...form, location: e.target.value }); setTouched((t) => ({ ...t, loc: true })); }} /></Field>
              <Field label="อำเภอ"><input className={inputCls} value={form.district} onChange={(e) => { setForm({ ...form, district: e.target.value }); setTouched((t) => ({ ...t, dist: true })); }} /></Field>
            </div>
            <button type="button" onClick={() => fillPlace(true)} disabled={lines.flood.length < 2 || geoBusy} className="flex items-center gap-1.5 text-xs font-semibold text-[#0B2A5B] disabled:opacity-40">
              {geoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}ดึงตำบล/อำเภอจากพิกัดอัตโนมัติ (แก้ไขเองได้)
            </button>
            <Field label="เส้นทางหลวง">
              <select className={inputCls} value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                <option value="">— ไม่ระบุ —</option>
                {routes.map((r) => <option key={r.id} value={r.id}>ทล.{r.route_code} {r.route_name}</option>)}
              </select>
            </Field>
            <Field label="สถานะจราจร">
              <select className={inputCls} value={form.traffic} onChange={(e) => setForm({ ...form, traffic: e.target.value as Traffic })}>
                {(Object.keys(TRAFFIC) as Traffic[]).map((k) => <option key={k} value={k}>{TRAFFIC[k].label}</option>)}
              </select>
            </Field>
            {!editing && (
              <>
                <Field label="ระดับน้ำ (ซม.) *"><input type="number" inputMode="decimal" min="0" className={inputCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></Field>
                <Field label="หมายเหตุ"><textarea rows={2} className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
                <Field label="ผู้รายงาน"><input className={inputCls} value={form.by} onChange={(e) => setForm({ ...form, by: e.target.value })} /></Field>
                <Field label="ภาพถ่าย (ไม่เกิน 10 รูป · บีบอัดอัตโนมัติ < 300KB)">
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 hover:bg-slate-100">
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-sm text-slate-600">{files.length ? `เลือกแล้ว ${files.length} รูป` : "เลือกรูปภาพ"}</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} />
                  </label>
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card title="ทางเลี่ยง" sub="ใส่พิกัดจุด A และ B ระบบสร้างเส้นตามถนนให้ (เส้นประสีเหลือง)">
          <div className="space-y-3">
            <CoordField label="พิกัดจุดเริ่มต้นทางเลี่ยง (จุด A)" tone="#16a34a" value={txt.detourA} onChange={(v) => setTxt({ ...txt, detourA: v })} onCommit={() => commitCoord("detour", "a")} onPick={pk("detour", "a")} picking={pick?.mode === "detour" && pick.which === "a"} />
            <CoordField label="พิกัดจุดสิ้นสุดทางเลี่ยง (จุด B)" tone="#D32F2F" value={txt.detourB} onChange={(v) => setTxt({ ...txt, detourB: v })} onCommit={() => commitCoord("detour", "b")} onPick={pk("detour", "b")} picking={pick?.mode === "detour" && pick.which === "b"} />
            <Field label="คำแนะนำทางเลี่ยง"><textarea rows={2} className={inputCls} placeholder="เช่น เลี้ยวขวาเข้า ทล.4157 …" value={form.detourNote} onChange={(e) => setForm({ ...form, detourNote: e.target.value })} /></Field>
            {lines.detour.length >= 2 && <Btn v="ghost" className="w-full" onClick={() => redraw("detour")}><Trash2 className="h-4 w-4" />ลบเส้นเลี่ยง</Btn>}
          </div>
        </Card>

        <Btn className="w-full" disabled={!canSave || busy} onClick={save}><Save className="h-4 w-4" />{editing ? "บันทึกการแก้ไข" : "บันทึกเหตุการณ์น้ำท่วม"}</Btn>
        {editing && <Btn v="ghost" className="w-full" onClick={onDone}>ยกเลิก</Btn>}
        {!canSave && <p className="text-center text-[11px] text-slate-400">ต้องมีเส้นน้ำท่วม หัวข้อ{editing ? "" : " และระดับน้ำ"}</p>}
      </div>
    </div>
  );
}
