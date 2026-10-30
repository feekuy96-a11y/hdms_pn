"use client";
/**
 * หน้าประชาชน "/"  — มือถือเป็นหลัก
 *  • แผนที่ Longdo Map v3 (Base Map มาตรฐาน ภาษาไทย) เต็มจอตั้งแต่โหลด ไม่มีป้ายสถานะลอยบนจอ
 *  • ปักหมุดตามจุดน้ำท่วม (สีตามสถานะจราจร + วงแหวนกระพริบ) แตะหมุด/แถวรายการเพื่อดูรายละเอียด
 *  • แผงล่าง 3 สถานะ: ย่อ (สรุป 1 บรรทัด) → รายการ → รายละเอียด ปัดขึ้น/ลงหรือแตะที่ที่จับได้
 *  • ปุ่มลอยมีแค่ 2–4 ปุ่ม (เลเยอร์/ตำแหน่งของฉัน/ซูม[เฉพาะจอใหญ่])
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp, Clock, Droplets, ExternalLink, Layers, LocateFixed,
  Minus, Navigation2, Plus, ShieldCheck, WifiOff, X,
} from "lucide-react";
import { supabase, type HistoryPoint, type Incident, type RouteRow, type Settings } from "@/lib/supabase";
import { fetchFloods, fetchHistory, fetchRoutes, fetchSettings, imageUrl } from "@/lib/api";
import { COLORS } from "@/lib/config";
import { createMap, esc, fitTo, loadLongdo, marker, polyline, type LngLat } from "@/lib/longdo";
import { toLines } from "@/lib/geo";
import { LevelChart, TRAFFIC, TrendBadge, fmtTime } from "@/components/common";

type Sheet = "peek" | "list" | "detail";

const pinHtml = (f: Incident, sel: boolean) => {
  const c = TRAFFIC[f.traffic_status]?.color ?? COLORS.flood;
  return `<div class="fm-pin${sel ? " sel" : ""}" style="--c:${c}" data-fid="${esc(f.incident_id)}"><i class="ring"></i><b class="body"></b><span class="val">${esc(f.latest_level_cm ?? "–")}</span></div>`;
};
const shieldHtml = (r: RouteRow) =>
  `<div class="fm-shield" data-rt="${esc("ทล." + r.route_code + " — " + r.route_name)}" title="${esc("ทล." + r.route_code + " " + r.route_name)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="#FBC02D"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/></svg></div>`;

export default function PublicPage() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const routeOv = useRef<any[]>([]);
  const floodOv = useRef<any[]>([]);
  const pinOv = useRef<any[]>([]);
  const meOv = useRef<any>(null);
  const selectRef = useRef<(id: string) => void>(() => {});

  const [settings, setSettings] = useState<Settings | null>(null);
  const [floods, setFloods] = useState<Incident[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [netErr, setNetErr] = useState(false);
  const [mapErr, setMapErr] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [layers, setLayers] = useState({ primary: true, secondary: true, detour: true, shields: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const [tip, setTip] = useState("");

  const sel = useMemo(() => floods.find((f) => f.incident_id === selId) ?? null, [floods, selId]);
  const rising = floods.filter((f) => f.trend === "rising").length;

  /* ───────── โหลดข้อมูล ───────── */
  const loadFloods = useCallback(async () => {
    try { setFloods(await fetchFloods()); setNetErr(false); } catch { setNetErr(true); } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    fetchSettings().then((s) => s && setSettings(s)).catch(() => {});
    fetchRoutes().then(setRoutes).catch(() => setNetErr(true));
    loadFloods();
    // อัปเดตทันทีเมื่อ Admin แก้ (Realtime) + สำรองด้วยการดึงทุก 90 วิ เฉพาะตอนเปิดหน้าอยู่
    let timer: any;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(loadFloods, 800); };
    const ch = supabase.channel("public_floods")
      .on("postgres_changes", { event: "*", schema: "public", table: "flood_incidents" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "flood_updates" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, () => fetchSettings().then((s) => s && setSettings(s)))
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") loadFloods(); }, 90_000);
    const vis = () => { if (document.visibilityState === "visible") loadFloods(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(timer); clearInterval(poll); document.removeEventListener("visibilitychange", vis); supabase.removeChannel(ch); };
  }, [loadFloods]);

  /* ───────── สร้างแผนที่ Longdo (Base Map มาตรฐานตั้งแต่เริ่ม) ───────── */
  useEffect(() => {
    let dead = false;
    const box = boxRef.current;
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const pin = t.closest?.("[data-fid]") as HTMLElement | null;
      if (pin?.dataset.fid) { selectRef.current(pin.dataset.fid); return; }
      const rt = t.closest?.("[data-rt]") as HTMLElement | null;
      if (rt?.dataset.rt) setTip(rt.dataset.rt);
    };
    loadLongdo().then((L) => {
      if (dead || !box || mapRef.current) return;
      LRef.current = L;
      mapRef.current = createMap(L, box);
      box.addEventListener("click", onClick, true); // จับการแตะหมุดแบบ event delegation
      setMapReady(true);
    }).catch((e) => !dead && setMapErr(e.message));
    return () => { dead = true; box?.removeEventListener("click", onClick, true); };
  }, []);

  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(""), 4000); return () => clearTimeout(t); }, [tip]);

  /* ───────── วาดเส้นถนน + เส้นน้ำท่วม + ทางเลี่ยง ───────── */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    [...routeOv.current, ...floodOv.current].forEach((o) => m.Overlays.remove(o));
    routeOv.current = []; floodOv.current = [];
    const addTo = (arr: any[], o: any) => { m.Overlays.add(o); arr.push(o); };

    for (const r of routes) {                                   // เลเยอร์เส้นถนนทับบนแผนที่ Longdo
      if (!layers[r.route_type]) continue;
      const prim = r.route_type === "primary";
      for (const part of toLines(r.geojson)) {
        addTo(routeOv.current, polyline(L, part, { color: "rgba(255,255,255,.95)", width: prim ? 9 : 6 }));
        addTo(routeOv.current, polyline(L, part, { color: prim ? COLORS.main : COLORS.sub, width: prim ? 5 : 3.5 }));
      }
    }
    for (const f of floods) {
      if (layers.detour && f.detour_geojson) for (const part of toLines(f.detour_geojson)) {
        addTo(floodOv.current, polyline(L, part, { color: "#111111", width: 9 }));
        addTo(floodOv.current, polyline(L, part, { color: COLORS.yellow, width: 5, dashed: true }));
      }
      for (const part of toLines(f.flood_geojson)) {
        addTo(floodOv.current, polyline(L, part, { color: "rgba(211,47,47,.28)", width: 18 }));   // รัศมีเรือง
        addTo(floodOv.current, polyline(L, part, { color: COLORS.flood, width: 7 }));
      }
    }
  }, [mapReady, routes, floods, layers.primary, layers.secondary, layers.detour]);

  /* ───────── หมุด ───────── */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    pinOv.current.forEach((o) => m.Overlays.remove(o));
    pinOv.current = [];
    for (const f of floods) {
      const mk = marker(L, [f.pin_lng, f.pin_lat], pinHtml(f, f.incident_id === selId), { x: 17, y: 42 });
      m.Overlays.add(mk); pinOv.current.push(mk);
    }
    if (layers.shields) for (const r of routes) {
      if (!layers[r.route_type]) continue;
      const mk = marker(L, [r.pin_lng, r.pin_lat], shieldHtml(r), { x: 11, y: 11 });
      m.Overlays.add(mk); pinOv.current.push(mk);
    }
  }, [mapReady, floods, routes, selId, layers.shields, layers.primary, layers.secondary]);

  /* ───────── เลือกเหตุการณ์ ───────── */
  const focus = useCallback((f: Incident) => {
    const m = mapRef.current; if (!m) return;
    const z = Math.max(Number(m.zoom()) || 0, 13);
    const mobile = window.innerWidth < 768;
    // เลื่อนจุดกึ่งกลางลงเล็กน้อยบนมือถือ เพื่อให้หมุดไม่ถูกแผงล่างบัง
    const mPerPx = (156543.03 * Math.cos((f.pin_lat * Math.PI) / 180)) / 2 ** z;
    const dLat = mobile ? (0.22 * window.innerHeight * mPerPx) / 111320 : 0;
    m.zoom(z, true);
    m.location({ lon: f.pin_lng, lat: f.pin_lat - dLat }, true);
  }, []);

  const select = useCallback((id: string) => {
    const f = floods.find((x) => x.incident_id === id);
    if (!f) return;
    setSelId(id); setSheet("detail"); setLayersOpen(false); focus(f);
  }, [floods, focus]);
  selectRef.current = select;

  useEffect(() => {
    if (!selId) { setHistory([]); return; }
    let ok = true;
    fetchHistory(selId).then((h) => ok && setHistory(h)).catch(() => {});
    return () => { ok = false; };
  }, [selId, sel?.latest_recorded_at]);

  useEffect(() => { if (selId && !sel && loaded) { setSelId(null); setSheet("list"); } }, [sel, selId, loaded]);

  /* ───────── ปุ่มบนแผนที่ ───────── */
  const zoom = (inn: boolean) => mapRef.current?.zoom(inn);
  const viewAll = () => {
    const pts = floods.flatMap((f) => toLines(f.flood_geojson).flat()) as LngLat[];
    if (mapRef.current && pts.length) fitTo(mapRef.current, pts, 0.02);
    setSelId(null); setSheet("list");
  };
  const locate = () => {
    if (!navigator.geolocation) return setTip("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const m = mapRef.current, L = LRef.current; if (!m) return;
        if (meOv.current) m.Overlays.remove(meOv.current);
        meOv.current = marker(L, [p.coords.longitude, p.coords.latitude], '<div class="fm-me"></div>', { x: 8, y: 8 });
        m.Overlays.add(meOv.current);
        m.location({ lon: p.coords.longitude, lat: p.coords.latitude }, true);
        m.zoom(14, true);
      },
      () => setTip("ไม่สามารถระบุตำแหน่งได้ — ตรวจสอบสิทธิ์ตำแหน่งของเบราว์เซอร์"),
      { enableHighAccuracy: true, timeout: 10000 });
  };

  /* ───────── ปัดแผงล่าง ───────── */
  const drag = useRef<number | null>(null);
  const up = () => setSheet((s) => (s === "peek" ? "list" : s));
  const down = () => setSheet((s) => (s === "detail" ? "list" : "peek"));
  const tap = () => setSheet((s) => (s === "peek" ? "list" : s === "list" ? "peek" : "list"));
  const onDown = (e: React.PointerEvent) => { drag.current = e.clientY; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); };
  const onUp = (e: React.PointerEvent) => {
    const y0 = drag.current; drag.current = null;
    if (y0 == null) return;
    const dy = e.clientY - y0;
    if (Math.abs(dy) < 12) tap(); else if (dy < -30) up(); else if (dy > 30) down();
  };

  const heightCls = sheet === "peek" ? "h-[84px]" : sheet === "list" ? "h-[min(56dvh,540px)]" : "h-[min(76dvh,720px)]";
  const chart = history.map((h) => ({ t: new Date(h.recorded_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }), cm: h.water_level_cm }));

  return (
    <main className="fixed inset-0 overflow-hidden bg-slate-200">
      {/* แผนที่ */}
      <div ref={boxRef} className="fm-map absolute inset-0" />

      {mapErr && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-100 p-6 text-center">
          <div className="max-w-xs">
            <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="font-semibold text-slate-800">โหลดแผนที่ไม่สำเร็จ</p>
            <p className="mt-1 text-xs text-slate-500">{mapErr}</p>
            <button onClick={() => location.reload()} className="mt-3 rounded-lg bg-[#0B2A5B] px-4 py-2 text-sm font-semibold text-white">ลองใหม่</button>
          </div>
        </div>
      )}

      {/* หัวเรื่อง (กะทัดรัด) */}
      <header className="pointer-events-none absolute left-0 right-16 top-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto inline-flex max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-white shadow-[0_4px_20px_rgba(7,27,61,.3)]"
          style={{ background: `linear-gradient(120deg,${COLORS.navyDark},${COLORS.navy})`, borderBottom: `3px solid ${COLORS.yellow}` }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
            {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-5 w-5 text-yellow-300" />}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-bold sm:text-sm">{settings?.system_name ?? "ระบบรายงานสถานการณ์น้ำท่วม"}</span>
            <span className="hidden truncate text-[11px] text-white/65 sm:block">{settings?.organization ?? "แขวงทางหลวงปัตตานี"}</span>
          </span>
        </div>
        {netErr && (
          <div className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 shadow">
            <WifiOff className="h-3.5 w-3.5" /> เชื่อมต่อไม่ได้ กำลังแสดงข้อมูลล่าสุด
          </div>
        )}
      </header>

      {/* ปุ่มลอย (ขวาบน) */}
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col gap-2">
        {([
          [layersOpen ? X : Layers, () => setLayersOpen((v) => !v), "เลเยอร์แผนที่", true],
          [LocateFixed, locate, "ตำแหน่งของฉัน", true],
          [Plus, () => zoom(true), "ขยาย", false],
          [Minus, () => zoom(false), "ย่อ", false],
        ] as const).map(([Ic, fn, label, mobile], i) => (
          <button key={i} onClick={fn} aria-label={label}
            className={`${mobile ? "grid" : "hidden md:grid"} h-11 w-11 place-items-center rounded-xl bg-white text-slate-700 shadow-lg ring-1 ring-black/5 active:scale-95`}>
            <Ic className="h-5 w-5" style={{ color: COLORS.navy }} />
          </button>
        ))}
      </div>

      {/* แผงเลเยอร์ */}
      {layersOpen && (
        <div className="absolute right-[3.75rem] top-[max(0.75rem,env(safe-area-inset-top))] z-20 w-56 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">แสดงบนแผนที่</p>
          {([
            ["primary", "ทางหลวงสายหลัก", COLORS.main], ["secondary", "ทางหลวงสายรอง", COLORS.sub],
            ["detour", "ทางเลี่ยง", COLORS.yellow], ["shields", "ไอคอนทางหลวง", COLORS.navy],
          ] as const).map(([k, l, c]) => (
            <label key={k} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-slate-700 active:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-[#0B2A5B]" checked={layers[k]} onChange={() => setLayers((s) => ({ ...s, [k]: !s[k] }))} />
              <span className="h-1.5 w-5 shrink-0 rounded-full" style={{ background: c }} />{l}
            </label>
          ))}
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span className="h-1.5 w-5 rounded-full shadow-[0_0_8px_2px_rgba(211,47,47,.6)]" style={{ background: COLORS.flood }} />น้ำท่วม
          </div>
        </div>
      )}

      {tip && (
        <div className="absolute left-1/2 top-[5.25rem] z-30 max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">{tip}</div>
      )}

      {/* แผงล่าง */}
      <section
        className={`absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-2 right-2 z-30 flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(7,27,61,.3)] transition-[height] duration-300 md:left-4 md:right-auto md:w-[400px] ${heightCls}`}>
        {/* ที่จับ + สรุป */}
        <div className="shrink-0 touch-none select-none px-4 pb-2 pt-2" onPointerDown={onDown} onPointerUp={onUp}>
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300" />
          {sheet === "detail" && sel ? (
            <div className="flex items-center gap-2">
              <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => { setSelId(null); setSheet("list"); }}
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600" aria-label="กลับ"><ChevronDown className="h-5 w-5 rotate-90" /></button>
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{sel.title}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${floods.length ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                {floods.length ? <Droplets className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[15px] font-bold text-slate-900">
                  {!loaded ? "กำลังโหลดข้อมูล…" : floods.length ? `น้ำท่วม ${floods.length} จุด` : "ไม่มีรายงานน้ำท่วมในขณะนี้"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {floods.length ? (rising ? `น้ำเพิ่มขึ้น ${rising} จุด · ` : "") + "แตะเพื่อดูรายการ" : "เส้นทางสัญจรได้ตามปกติ"}
                </p>
              </div>
              {sheet === "peek" ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </div>
          )}
        </div>

        {/* รายการ */}
        {sheet === "list" && (
          <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto border-t border-slate-100 px-3 py-2">
            {floods.length > 1 && (
              <button onClick={viewAll} className="mb-1 w-full rounded-lg py-2 text-xs font-semibold text-[#0B2A5B] active:bg-slate-50">ดูทุกจุดบนแผนที่</button>
            )}
            {floods.map((f) => (
              <button key={f.incident_id} onClick={() => select(f.incident_id)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left active:bg-slate-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: TRAFFIC[f.traffic_status]?.color }}>
                  {f.latest_level_cm ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{f.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{TRAFFIC[f.traffic_status]?.short}</span><span>·</span><span>{fmtTime(f.latest_recorded_at)}</span>
                  </span>
                </span>
                <TrendBadge trend={f.trend} />
              </button>
            ))}
            {loaded && !floods.length && <p className="py-8 text-center text-sm text-slate-400">ขอบคุณที่ตรวจสอบ ✓ ตอนนี้ยังไม่มีเหตุน้ำท่วมบนเส้นทางหลวง</p>}
          </div>
        )}

        {/* รายละเอียด */}
        {sheet === "detail" && sel && (
          <div className="sheet-scroll min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-slate-100 p-4">
            <div className="flex items-end justify-between gap-3 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg,${COLORS.navyDark},${COLORS.navy})` }}>
              <div>
                <p className="text-[11px] text-white/60">ระดับน้ำล่าสุด</p>
                <p className="text-4xl font-extrabold leading-none tabular-nums">{sel.latest_level_cm ?? "–"}<span className="ml-1 text-sm font-medium text-white/70">ซม.</span></p>
              </div>
              <div className="space-y-1.5 text-right">
                <TrendBadge trend={sel.trend} diff={sel.level_diff_cm} />
                <p className="flex items-center justify-end gap-1 text-[11px] text-white/65"><Clock className="h-3 w-3" />{fmtTime(sel.latest_recorded_at)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${TRAFFIC[sel.traffic_status]?.badge}`}>{TRAFFIC[sel.traffic_status]?.label}</span>
              {sel.route_code && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">ทล.{sel.route_code}</span>}
              {sel.location_name && <span className="text-xs text-slate-500">{sel.location_name}</span>}
            </div>

            {chart.length > 1 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">ประวัติระดับน้ำ</p>
                <LevelChart data={chart} />
              </div>
            )}

            {sel.detour_note && (
              <div className="flex gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-3.5">
                <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
                <div><p className="text-xs font-bold text-yellow-900">ทางเลี่ยง (เส้นประสีเหลือง)</p><p className="mt-0.5 text-xs leading-relaxed text-yellow-900/80">{sel.detour_note}</p></div>
              </div>
            )}
            {sel.latest_note && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{sel.latest_note}</p>}

            {!!sel.latest_image_paths?.length && (
              <div className="grid grid-cols-2 gap-2">
                {sel.latest_image_paths.slice(0, 4).map((p) => (
                  <a key={p} href={imageUrl(p)} target="_blank" rel="noreferrer">
                    <img src={imageUrl(p)} alt="ภาพสถานการณ์" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                  </a>
                ))}
              </div>
            )}

            <a href={`https://www.google.com/maps/dir/?api=1&destination=${sel.pin_lat},${sel.pin_lng}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 active:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> เปิดเส้นทางใน Google Maps
            </a>
            <p className="pb-1 text-center text-[11px] text-slate-400">
              ผู้รายงาน: {sel.latest_reported_by || "เจ้าหน้าที่"} · {sel.update_count} ครั้ง{settings?.contact_phone ? ` · โทร ${settings.contact_phone}` : ""}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
