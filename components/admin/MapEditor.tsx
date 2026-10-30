"use client";
/**
 * ตัวแก้ไขเส้นบนแผนที่ (เพิ่ม/แก้เหตุการณ์น้ำท่วม)
 *
 * เส้นอัตโนมัติ  : คลิกจุด A แล้วจุด B → ระบบตัดช่วงตามเส้นทางหลวงที่นำเข้า (PostGIS)
 *                  ถ้าไม่พบ → OSRM (สำรอง) → ถ้ายังไม่ได้ → เส้นตรง
 * ดัดเส้นอิสระ   : ลากจุดขาว (vertex) เพื่อย้าย · แตะจุดประกลางเส้นเพื่อ "เพิ่มจุด"
 *                  แตะจุดเพื่อเลือกแล้วกด "ลบจุด" · "ย้อนกลับ" ได้ 30 ขั้น
 * วาดเอง        : เปลี่ยนเป็นโหมด "วาดเอง" แล้วคลิกต่อเนื่องทีละจุด
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PenLine, RotateCcw, Save, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { autoRoute, fetchRoutes, saveIncident } from "@/lib/api";
import { COLORS } from "@/lib/config";
import { fitTo, createMap, loadLongdo, marker, polyline, type LngLat } from "@/lib/longdo";
import { lengthM, simplifyToMax, toLines } from "@/lib/geo";
import type { Incident, RouteRow, Traffic } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, TRAFFIC } from "@/components/common";

type Mode = "flood" | "detour";
type Lines = { flood: LngLat[]; detour: LngLat[] };

export default function MapEditor({ editing, onDone, toast }: {
  editing: Incident | null; onDone: () => void; toast: (m: string, err?: boolean) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const ov = useRef<any[]>([]);
  const bgOv = useRef<any[]>([]);
  const vtx = useRef<any[]>([]);
  const lastMarkerClick = useRef(0);
  const lastDrop = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<Mode>("flood");
  const [tool, setTool] = useState<"auto" | "manual">("auto");
  const [lines, setLines] = useState<Lines>(() => ({
    flood: editing ? toLines(editing.flood_geojson)[0] ?? [] : [],
    detour: editing?.detour_geojson ? toLines(editing.detour_geojson)[0] ?? [] : [],
  }));
  const [hist, setHist] = useState<Lines[]>([]);
  const [pendingA, setPendingA] = useState<LngLat | null>(null);
  const [selV, setSelV] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: editing?.title ?? "", location: editing?.location_name ?? "", district: editing?.district ?? "",
    traffic: (editing?.traffic_status ?? "closed") as Traffic, level: "", note: "", by: "",
    routeId: editing?.route_id ?? "", detourNote: editing?.detour_note ?? "",
    kmStart: editing?.km_start != null ? String(editing.km_start) : "", kmEnd: editing?.km_end != null ? String(editing.km_end) : "",
  });

  // สถานะล่าสุดให้ event handler ของแผนที่อ่าน (ผูก handler ครั้งเดียว)
  const st = useRef({ mode, tool, lines, pendingA, busy, routes, routeId: form.routeId });
  st.current = { mode, tool, lines, pendingA, busy, routes, routeId: form.routeId };

  const commit = useCallback((next: Lines) => {
    setHist((h) => [...h.slice(-29), st.current.lines]);
    setLines(next);
  }, []);

  /* ───── คลิกบนแผนที่ ───── */
  const handleClick = useCallback(async (pt: LngLat) => {
    const s = st.current;
    if (s.busy) return;
    if (s.tool === "manual") { commit({ ...s.lines, [s.mode]: [...s.lines[s.mode], pt] }); return; }
    if (s.lines[s.mode].length >= 2 && !s.pendingA) { setInfo("มีเส้นแล้ว — ลากจุดเพื่อดัดเส้น หรือกด “ลากเส้นใหม่” เพื่อเริ่มใหม่"); return; }
    if (!s.pendingA) { setPendingA(pt); setInfo("คลิกจุด B (ปลายทาง) บนแผนที่"); return; }
    setBusy(true); setInfo("กำลังเกาะเส้นตามถนน…");
    const mode = s.mode;
    const r = await autoRoute(s.pendingA, pt);
    commit({ ...st.current.lines, [mode]: simplifyToMax(r.coords, 90) });
    setPendingA(null); setBusy(false); setSelV(null);
    setInfo(r.via === "db" ? `เกาะตามถนน ทล.${r.label} จากข้อมูลที่นำเข้า ✓ — ดัดเส้นเพิ่มได้`
      : r.via === "osrm" ? "เกาะถนนด้วย OSRM (ตัวสำรอง) — ตรวจแนวเส้นก่อนบันทึก"
      : "ไม่พบถนนใกล้จุดที่คลิก จึงลากเส้นตรงให้ — ลากจุด/เพิ่มจุดเพื่อดัดตามถนนได้");
    if (r.via === "db" && mode === "flood" && !st.current.routeId) {
      const hit = st.current.routes.find((x) => x.route_code === r.label);
      if (hit) setForm((f) => ({ ...f, routeId: hit.id }));
    }
  }, [commit]);

  const syncVertices = useCallback(() => {
    if (!vtx.current.length) return;
    const pts = vtx.current.map((m) => { const p = m.location(); return [p.lon, p.lat] as LngLat; });
    commit({ ...st.current.lines, [st.current.mode]: pts });
  }, [commit]);

  const insertMid = useCallback((i: number) => {
    const s = st.current, cur = s.lines[s.mode];
    if (!cur[i] || !cur[i + 1]) return;
    const mid: LngLat = [(cur[i][0] + cur[i + 1][0]) / 2, (cur[i][1] + cur[i + 1][1]) / 2];
    commit({ ...s.lines, [s.mode]: [...cur.slice(0, i + 1), mid, ...cur.slice(i + 1)] });
    setSelV(i + 1);
  }, [commit]);

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
    return () => { dead = true; box?.removeEventListener("click", onBox, true); };
  }, []);

  useEffect(() => {
    if (mapReady && editing && lines.flood.length) fitTo(mapRef.current, lines.flood, 0.01);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  /* ───── เส้นทางหลวงเป็นพื้นหลังอ้างอิง ───── */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    bgOv.current.forEach((o) => m.Overlays.remove(o)); bgOv.current = [];
    for (const r of routes) for (const part of toLines(r.geojson)) {
      for (const o of [polyline(L, part, { color: "rgba(255,255,255,.9)", width: 8 }), polyline(L, part, { color: "rgba(27,94,32,.75)", width: 4 })]) {
        m.Overlays.add(o); bgOv.current.push(o);
      }
    }
    setTick((t) => t + 1); // ให้ชั้นแก้ไขวาดทับอีกครั้ง
  }, [mapReady, routes]);

  /* ───── ชั้นแก้ไข: เส้น + จุดจับ ───── */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    ov.current.forEach((o) => m.Overlays.remove(o)); ov.current = []; vtx.current = [];
    const add = (o: any) => { m.Overlays.add(o); ov.current.push(o); };
    if (lines.detour.length >= 2) {
      add(polyline(L, lines.detour, { color: "#111111", width: 9 }));
      add(polyline(L, lines.detour, { color: COLORS.yellow, width: 5, dashed: true }));
    }
    if (lines.flood.length >= 2) {
      add(polyline(L, lines.flood, { color: "rgba(211,47,47,.28)", width: 18 }));
      add(polyline(L, lines.flood, { color: COLORS.flood, width: 7 }));
    }
    const cur = lines[mode];
    cur.forEach((c, i) => {
      const cls = `fm-vtx${i === 0 ? " a" : i === cur.length - 1 ? " b" : ""}${selV === i ? " sel" : ""}`;
      const mk = marker(L, c, `<div class="${cls}" data-vi="${i}"></div>`, { x: 10, y: 10 }, { draggable: true });
      add(mk); vtx.current.push(mk);
    });
    for (let i = 0; i < cur.length - 1; i++) {
      const mid: LngLat = [(cur[i][0] + cur[i + 1][0]) / 2, (cur[i][1] + cur[i + 1][1]) / 2];
      add(marker(L, mid, `<div class="fm-mid" data-mid="${i}"></div>`, { x: 6, y: 6 }));
    }
    if (pendingA) add(marker(L, pendingA, '<div class="fm-pend">A</div>', { x: 13, y: 13 }));
  }, [mapReady, lines, mode, selV, pendingA, tick]);

  /* ───── เครื่องมือ ───── */
  const undo = () => { const h = hist[hist.length - 1]; if (!h) return; setHist((x) => x.slice(0, -1)); setLines(h); setSelV(null); };
  const delVertex = () => {
    const cur = lines[mode];
    if (selV == null || cur.length <= 2) return;
    commit({ ...lines, [mode]: cur.filter((_, i) => i !== selV) }); setSelV(null);
  };
  const redraw = () => { commit({ ...lines, [mode]: [] }); setPendingA(null); setSelV(null); setInfo(tool === "auto" ? "คลิกจุด A บนแผนที่" : "คลิกวาดทีละจุด"); };
  const switchMode = (m: Mode) => { setMode(m); setPendingA(null); setSelV(null); };

  const fl = lengthM(lines.flood);
  const hint = busy ? "กำลังเกาะเส้นตามถนน…" : info
    || (lines[mode].length >= 2 ? "ลากจุดขาวเพื่อดัดเส้น · แตะจุดกลางเส้นเพื่อเพิ่มจุด"
      : tool === "auto" ? (pendingA ? "คลิกจุด B" : "คลิกจุด A และ B บนถนน ระบบจะลากเส้นตามถนนให้") : "คลิกวางจุดต่อเนื่องตามแนวถนน");

  const canSave = lines.flood.length >= 2 && form.title.trim() && (editing || form.level !== "");

  const save = async () => {
    setSaving(true);
    try {
      await saveIncident({
        id: editing?.incident_id, title: form.title.trim(), location: form.location, district: form.district, traffic: form.traffic,
        flood: lines.flood, detour: lines.detour, detourNote: form.detourNote, routeId: form.routeId || null,
        kmStart: form.kmStart ? Number(form.kmStart) : null, kmEnd: form.kmEnd ? Number(form.kmEnd) : null,
        levelCm: Number(form.level), note: form.note, reportedBy: form.by, images: files,
      });
      toast(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มเหตุการณ์แล้ว — แสดงบนหน้าประชาชนทันที");
      onDone();
    } catch (e: any) { toast(e.message, true); } finally { setSaving(false); }
  };

  const seg = (on: boolean) => `flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${on ? "bg-white text-slate-900 shadow" : "text-slate-500"}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="overflow-hidden" title={editing ? "แก้ไขเหตุการณ์" : "กำหนดจุดน้ำท่วมบนแผนที่"}
        right={
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button className={seg(mode === "flood")} onClick={() => switchMode("flood")}><i className="h-2 w-2 rounded-full bg-[#D32F2F]" />เส้นน้ำท่วม</button>
            <button className={seg(mode === "detour")} onClick={() => switchMode("detour")}><i className="h-2 w-2 rounded-full bg-[#FBC02D]" />เส้นเลี่ยง</button>
          </div>
        }>
        <div className="-m-4 sm:-m-5">
          <div className="relative h-[56dvh] min-h-[320px] bg-slate-200 lg:h-[calc(100dvh-17rem)]">
            <div ref={boxRef} className="fm-map absolute inset-0" />
            {busy && <div className="absolute inset-0 z-10 grid place-items-center bg-white/40"><Loader2 className="h-8 w-8 animate-spin text-[#0B2A5B]" /></div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex rounded-lg bg-slate-200/70 p-0.5">
              <button className={seg(tool === "auto")} onClick={() => { setTool("auto"); setPendingA(null); }}><Wand2 className="h-3.5 w-3.5" />อัตโนมัติ</button>
              <button className={seg(tool === "manual")} onClick={() => { setTool("manual"); setPendingA(null); }}><PenLine className="h-3.5 w-3.5" />วาดเอง</button>
            </div>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={undo} disabled={!hist.length}><Undo2 className="h-4 w-4" />ย้อนกลับ</Btn>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={delVertex} disabled={selV == null || lines[mode].length <= 2}><Trash2 className="h-4 w-4" />ลบจุด</Btn>
            <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={redraw}><RotateCcw className="h-4 w-4" />ลากเส้นใหม่</Btn>
            <span className="ml-auto text-xs font-semibold text-slate-500">{fl > 0 ? `ช่วงน้ำท่วมยาว ~${fl >= 1000 ? (fl / 1000).toFixed(2) + " กม." : Math.round(fl) + " ม."}` : ""}</span>
          </div>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-600">{hint}</p>
        </div>
      </Card>

      <Card title="รายละเอียดเหตุการณ์">
        <div className="space-y-3">
          <Field label="หัวข้อเหตุการณ์ *"><input className={inputCls} placeholder="เช่น น้ำท่วม ทล.42 กม.15–16" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="ตำบล/จุดสังเกต"><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="อำเภอ"><input className={inputCls} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="กม.เริ่มต้น"><input type="number" inputMode="decimal" className={inputCls} value={form.kmStart} onChange={(e) => setForm({ ...form, kmStart: e.target.value })} /></Field>
            <Field label="กม.สิ้นสุด"><input type="number" inputMode="decimal" className={inputCls} value={form.kmEnd} onChange={(e) => setForm({ ...form, kmEnd: e.target.value })} /></Field>
          </div>
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
          <Field label="คำแนะนำทางเลี่ยง"><textarea rows={2} className={inputCls} placeholder="เช่น เลี้ยวขวาเข้า ทล.4157…" value={form.detourNote} onChange={(e) => setForm({ ...form, detourNote: e.target.value })} /></Field>
          <Btn className="w-full" disabled={!canSave || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editing ? "บันทึกการแก้ไข" : "บันทึกเหตุการณ์น้ำท่วม"}
          </Btn>
          {editing && <Btn v="ghost" className="w-full" onClick={onDone}>ยกเลิก</Btn>}
          {!canSave && <p className="text-center text-[11px] text-slate-400">ต้องมีเส้นน้ำท่วม หัวข้อ{editing ? "" : " และระดับน้ำ"}</p>}
        </div>
      </Card>
    </div>
  );
}
