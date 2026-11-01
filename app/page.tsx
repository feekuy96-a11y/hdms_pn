"use client";
/**
 * หน้าประชาชน "/" — มือถือเป็นหลัก, เดสก์ท็อปเป็นแผงข้างซ้าย
 *  ลำดับการสื่อสาร:  (1) แถบสถานการณ์รวมใต้หัวเรื่อง → (2) หมุดบนแผนที่ (ไอคอนน้ำท่วม + ระดับน้ำ)
 *                    → (3) รายการเรียงตามความรุนแรง → (4) รายละเอียด: คำแนะนำ/พื้นที่/กม./กราฟ/ทางเลี่ยง/รูป/นำทาง/แชร์/ติดต่อ
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Clock, ExternalLink, Layers, LocateFixed,
  MapPin, Minus, Navigation2, Phone, Plus, Ruler, Share2, ShieldCheck, WifiOff, X,
} from "lucide-react";
import { supabase, type HistoryPoint, type Incident, type Office, type RouteRow, type Settings, type Traffic } from "@/lib/supabase";
import { fetchFloods, fetchHistory, fetchOffices, fetchRoutes, fetchSettings, imageUrl } from "@/lib/api";
import { COLORS } from "@/lib/config";
import { createMap, esc, fitTo, loadLongdo, marker, type LngLat } from "@/lib/longdo";
import { toLines, zoomIconScale } from "@/lib/geo";
import { MapLayers } from "@/lib/mapLayers";
import { DEFAULT_STYLE, mergeStyle } from "@/lib/mapStyle";
import { LevelChart, TRAFFIC, TrendBadge, fmtTime } from "@/components/common";

type Sheet = "peek" | "list" | "detail";
type Sel = { kind: "flood" | "office"; id: string } | null;

/* ───────── ตัวช่วยแสดงผล ───────── */
const SEV: Record<Traffic, number> = { closed: 0, large_vehicle_only: 1, open_limited: 2 };
const ADVICE: Record<Traffic, { title: string; text: string; cls: string }> = {
  closed: { title: "งดใช้เส้นทางช่วงนี้", text: "ปิดการจราจร โปรดใช้ทางเลี่ยงหรือรอประกาศเปิดเส้นทาง", cls: "border-red-200 bg-red-50 text-red-900" },
  large_vehicle_only: { title: "ผ่านได้เฉพาะรถยกสูง/รถบรรทุกขนาดใหญ่", text: "รถยนต์ขนาดเล็กไม่ควรผ่าน เสี่ยงน้ำเข้าเครื่องยนต์และรถดับกลางทาง", cls: "border-amber-200 bg-amber-50 text-amber-900" },
  open_limited: { title: "ผ่านได้ด้วยความระมัดระวัง", text: "ลดความเร็ว เว้นระยะห่าง และระวังสิ่งกีดขวางใต้น้ำ", cls: "border-emerald-200 bg-emerald-50 text-emerald-900" },
};
const ago = (v?: string | number | null) => {
  if (!v) return "–";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  return s < 60 ? "เมื่อสักครู่" : s < 3600 ? `${Math.floor(s / 60)} นาทีที่แล้ว` : s < 86400 ? `${Math.floor(s / 3600)} ชม.ที่แล้ว` : `${Math.floor(s / 86400)} วันที่แล้ว`;
};
const meaningful = (v?: string | null) => { const t = (v ?? "").trim(); return t && !/^[-–—.]+$/.test(t) ? t : ""; };
const pre = (v: string | null | undefined, p: string) => { const t = meaningful(v); return t ? (/^(ต\.|อ\.|ตำบล|อำเภอ|แขวง|เขต)/.test(t) ? t : p + t) : ""; };
const place = (f: Incident) => [pre(f.location_name, "ต."), pre(f.district, "อ.")].filter(Boolean).join(" ");
const hwy = (c?: string | null) => (c ? `ทล.${String(c).replace(/^0+(?=\d)/, "")}` : "");
const fmtLen = (m?: number | null) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`);
const km = (f: Incident) => (f.km_start != null || f.km_end != null ? `กม. ${f.km_start ?? "?"}${f.km_end != null ? ` – ${f.km_end}` : ""}` : "");
const useMedia = (q: string) => {
  const [m, setM] = useState(false);
  useEffect(() => { const mm = window.matchMedia(q); const f = () => setM(mm.matches); f(); mm.addEventListener("change", f); return () => mm.removeEventListener("change", f); }, [q]);
  return m;
};

/* ───────── HTML ของหมุด (esc ทุกค่าจากฐานข้อมูล) ───────── */
const WAVES = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c2.4 3 3.8 5 3.8 6.9a3.8 3.8 0 0 1-7.6 0c0-1.9 1.4-3.9 3.8-6.9z"/><path d="M2 15.5c1.7 1.4 3.3 1.4 5 0s3.3-1.4 5 0 3.3 1.4 5 0 3.3-1.4 5 0"/><path d="M2 20c1.7 1.4 3.3 1.4 5 0s3.3-1.4 5 0 3.3 1.4 5 0 3.3-1.4 5 0"/></svg>`;
const BUILDING = `<svg viewBox="0 0 24 24" fill="none" stroke="#FBC02D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2"/></svg>`;
const floodPin = (f: Incident, sel: boolean, pulse: boolean) => {
  const t = TRAFFIC[f.traffic_status] ?? TRAFFIC.closed;
  const arrow = f.trend === "rising" ? "▲" : f.trend === "falling" ? "▼" : "";
  return `<div class="fm-fp${sel ? " sel" : ""}${pulse ? " pulse" : ""}" data-fid="${esc(f.incident_id)}"><div class="pill"><b>${esc(f.latest_level_cm ?? "–")}</b><small>ซม.</small>${arrow ? `<em class="${esc(f.trend)}">${arrow}</em>` : ""}</div><div class="ic"><i class="ring"></i><span class="badge">${WAVES}</span><u style="background:${t.color}"></u></div><div class="tip"></div></div>`;
};
const officePin = (o: Office) => `<div class="fm-op" data-oid="${esc(o.id)}" title="${esc(o.name)}">${BUILDING}</div>`;
const shieldPin = (r: RouteRow) => `<div class="fm-shield" data-rt="${esc(hwy(r.route_code) + " — " + r.route_name)}" title="${esc(hwy(r.route_code) + " " + r.route_name)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="#FBC02D"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/></svg></div>`;

export default function PublicPage() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const lyRef = useRef<MapLayers | null>(null);
  const pinOv = useRef<any[]>([]);
  const meOv = useRef<any>(null);
  const pickRef = useRef<(s: Sel) => void>(() => {});
  const styleRef = useRef(DEFAULT_STYLE);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [floods, setFloods] = useState<Incident[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [netErr, setNetErr] = useState(false);
  const [mapErr, setMapErr] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [zoomLvl, setZoomLvl] = useState(10);          // ใช้ย่อไอคอนอัตโนมัติตอนซูมออก กัน "ไอคอนใหญ่บังแผนที่"
  const zoomTimer = useRef<any>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [flt, setFlt] = useState<"all" | Traffic>("all");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [layers, setLayers] = useState({ primary: true, secondary: true, detour: true, offices: true, shields: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const [tip, setTip] = useState("");
  const isMd = useMedia("(min-width: 768px)");

  const style = useMemo(() => mergeStyle(settings?.map_style), [settings?.map_style]);
  styleRef.current = style;

  const sorted = useMemo(() => [...floods].sort((a, b) =>
    SEV[a.traffic_status] - SEV[b.traffic_status]
    || Number(b.trend === "rising") - Number(a.trend === "rising")
    || new Date(b.latest_recorded_at ?? 0).getTime() - new Date(a.latest_recorded_at ?? 0).getTime()), [floods]);
  const shown = flt === "all" ? sorted : sorted.filter((f) => f.traffic_status === flt);
  const count = (t: Traffic) => floods.filter((f) => f.traffic_status === t).length;
  const rising = floods.filter((f) => f.trend === "rising").length;
  const selFlood = sel?.kind === "flood" ? floods.find((f) => f.incident_id === sel.id) ?? null : null;
  const selOffice = sel?.kind === "office" ? offices.find((o) => o.id === sel.id) ?? null : null;
  const top = sorted[0];

  /* ───────── โหลดข้อมูล ───────── */
  const loadFloods = useCallback(async () => {
    try { setFloods(await fetchFloods()); setNetErr(false); setLastFetch(Date.now()); } catch { setNetErr(true); } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    const loadSettings = () => fetchSettings().then((s) => s && setSettings(s)).catch(() => {});
    loadSettings();
    fetchRoutes().then(setRoutes).catch(() => setNetErr(true));
    fetchOffices().then(setOffices).catch(() => {});
    loadFloods();
    let timer: any;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(loadFloods, 800); };
    const ch = supabase.channel("public_floods")
      .on("postgres_changes", { event: "*", schema: "public", table: "flood_incidents" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "flood_updates" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, loadSettings)
      .on("postgres_changes", { event: "*", schema: "public", table: "offices" }, () => fetchOffices().then(setOffices).catch(() => {}))
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") loadFloods(); }, 90_000);
    const clock = setInterval(() => setTick((t) => t + 1), 30_000);
    const vis = () => { if (document.visibilityState === "visible") loadFloods(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(timer); clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", vis); supabase.removeChannel(ch); };
  }, [loadFloods]);

  /* ───────── แผนที่ Longdo (Base Map มาตรฐานตั้งแต่เริ่ม) ───────── */
  useEffect(() => {
    let dead = false;
    const box = boxRef.current;
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const f = t.closest?.("[data-fid]") as HTMLElement | null;
      const o = t.closest?.("[data-oid]") as HTMLElement | null;
      const r = t.closest?.("[data-rt]") as HTMLElement | null;
      if (f?.dataset.fid) pickRef.current({ kind: "flood", id: f.dataset.fid });
      else if (o?.dataset.oid) pickRef.current({ kind: "office", id: o.dataset.oid });
      else if (r?.dataset.rt) setTip(r.dataset.rt);
    };
    loadLongdo().then((L) => {
      if (dead || !box || mapRef.current) return;
      LRef.current = L;
      mapRef.current = createMap(L, box);
      lyRef.current = new MapLayers(L, mapRef.current, styleRef.current);
      box.addEventListener("click", onClick, true);
      // ย่อไอคอนอัตโนมัติตามระดับซูม (ดีบาวซ์ 150ms กันคำนวณรัวตอนลาก/scroll ซูม) — แก้บั๊ก "ซูมออกแล้วไอคอนบังแผนที่"
      const z0 = Number(mapRef.current.zoom()) || 10;
      setZoomLvl(z0);
      box.style.setProperty("--zs", String(zoomIconScale(z0)));
      try {
        mapRef.current.Event.bind("zoom", () => {
          clearTimeout(zoomTimer.current);
          zoomTimer.current = setTimeout(() => {
            const z = Number(mapRef.current?.zoom()) || z0;
            setZoomLvl(z);
            box.style.setProperty("--zs", String(zoomIconScale(z)));
          }, 150);
        });
      } catch { /* ignore */ }
      setMapReady(true);
    }).catch((e) => !dead && setMapErr(e.message));
    return () => { dead = true; clearTimeout(zoomTimer.current); box?.removeEventListener("click", onClick, true); };
  }, []);

  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(""), 4000); return () => clearTimeout(t); }, [tip]);

  /* เส้นถนน + เส้นน้ำท่วม + ทางเลี่ยง + เอฟเฟกต์ (ตามสไตล์ที่แอดมินตั้ง) */
  useEffect(() => { lyRef.current?.setStyle(style); }, [style, mapReady]);
  useEffect(() => { lyRef.current?.setRoutes(routes, { primary: layers.primary, secondary: layers.secondary }); }, [routes, layers.primary, layers.secondary, mapReady]);
  useEffect(() => { lyRef.current?.setFloods(floods, layers.detour); }, [floods, layers.detour, mapReady]);

  /* หมุด: น้ำท่วม · สำนักงาน · ไอคอนทางหลวง */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!mapReady || !m) return;
    pinOv.current.forEach((o) => { try { m.Overlays.remove(o); } catch { /* ignore */ } });
    pinOv.current = [];
    const add = (mk: any) => { m.Overlays.add(mk); pinOv.current.push(mk); };
    // ไอคอนทางหลวงมีจำนวนมากและเป็นข้อมูลรองลงมา — ซ่อนอัตโนมัติเมื่อซูมออกเกิน แม้ผู้ใช้เปิดเลเยอร์ไว้ กันบังแผนที่
    if (layers.shields && zoomLvl >= 12) for (const r of routes) if (layers[r.route_type]) add(marker(L, [r.pin_lng, r.pin_lat], shieldPin(r), { x: 11, y: 11 }));
    if (layers.offices) for (const o of offices) if (o.is_active) add(marker(L, [o.lng, o.lat], officePin(o), { x: 17, y: 17 }));
    for (const f of floods) add(marker(L, [f.pin_lng, f.pin_lat], floodPin(f, sel?.kind === "flood" && sel.id === f.incident_id, style.pinPulse), { x: 32, y: 74 }));
  }, [mapReady, floods, routes, offices, sel, style.pinPulse, layers.shields, layers.offices, layers.primary, layers.secondary, zoomLvl]);

  /* ───────── เลือก / โฟกัส ───────── */
  const focus = useCallback((lng: number, lat: number) => {
    const m = mapRef.current; if (!m) return;
    const z = Math.max(Number(m.zoom()) || 0, 14);
    const mpp = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    const dLat = isMd ? 0 : (0.2 * window.innerHeight * mpp) / 111320;
    const dLon = isMd ? (210 * mpp) / (111320 * Math.cos((lat * Math.PI) / 180)) : 0;
    m.zoom(z, true);
    m.location({ lon: lng - dLon, lat: lat - dLat }, true);
  }, [isMd]);

  const pick = useCallback((s: Sel) => {
    if (!s) return;
    setSel(s); setSheet("detail"); setLayersOpen(false);
    if (s.kind === "flood") { const f = floods.find((x) => x.incident_id === s.id); if (f) focus(f.pin_lng, f.pin_lat); }
    else { const o = offices.find((x) => x.id === s.id); if (o) focus(o.lng, o.lat); }
  }, [floods, offices, focus]);
  pickRef.current = pick;

  useEffect(() => {
    if (!selFlood) { setHistory([]); return; }
    let ok = true;
    fetchHistory(selFlood.incident_id).then((h) => ok && setHistory(h)).catch(() => {});
    return () => { ok = false; };
  }, [selFlood?.incident_id, selFlood?.latest_recorded_at]);

  useEffect(() => { if (sel && loaded && !selFlood && !selOffice) { setSel(null); setSheet("list"); } }, [sel, selFlood, selOffice, loaded]);

  /* ───────── ปุ่มบนแผนที่ ───────── */
  const viewAll = () => {
    const pts = floods.flatMap((f) => toLines(f.flood_geojson).flat()) as LngLat[];
    if (mapRef.current && pts.length) fitTo(mapRef.current, pts, 0.02);
    setSel(null); setSheet("list");
  };
  const locate = () => {
    if (!navigator.geolocation) return setTip("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
    navigator.geolocation.getCurrentPosition((p) => {
      const m = mapRef.current, L = LRef.current; if (!m) return;
      if (meOv.current) m.Overlays.remove(meOv.current);
      meOv.current = marker(L, [p.coords.longitude, p.coords.latitude], '<div class="fm-me"></div>', { x: 8, y: 8 });
      m.Overlays.add(meOv.current);
      m.location({ lon: p.coords.longitude, lat: p.coords.latitude }, true); m.zoom(14, true);
    }, () => setTip("ระบุตำแหน่งไม่ได้ — ตรวจสอบสิทธิ์ตำแหน่งของเบราว์เซอร์"), { enableHighAccuracy: true, timeout: 10000 });
  };
  const share = async (f: Incident) => {
    const data = { title: f.title, text: `${f.title} · ระดับน้ำ ${f.latest_level_cm ?? "–"} ซม. · ${TRAFFIC[f.traffic_status]?.label}`, url: location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); setTip("คัดลอกข้อความสำหรับแชร์แล้ว"); } } catch { /* ยกเลิก */ }
  };

  /* ───────── ปัดแผงล่าง ───────── */
  const drag = useRef<number | null>(null);
  const eff: Sheet = isMd && sheet === "peek" ? "list" : sheet;
  const onDown = (e: React.PointerEvent) => { drag.current = e.clientY; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); };
  const onUp = (e: React.PointerEvent) => {
    const y0 = drag.current; drag.current = null;
    if (y0 == null || isMd) return;
    const dy = e.clientY - y0;
    if (Math.abs(dy) < 12) setSheet((s) => (s === "peek" ? "list" : s === "list" ? "peek" : "list"));
    else if (dy < -30) setSheet((s) => (s === "peek" ? "list" : s));
    else if (dy > 30) setSheet((s) => (s === "detail" ? "list" : "peek"));
  };
  const heightCls = eff === "peek" ? "h-[88px]" : eff === "list" ? "h-[min(58dvh,560px)]" : "h-[min(80dvh,760px)]";

  const closed = count("closed");
  const strip = !loaded ? { cls: "bg-slate-600 text-white", msg: "กำลังตรวจสอบสถานการณ์…" }
    : closed > 0 ? { cls: "bg-red-600 text-white", msg: `ปิดการจราจร ${closed} จุด${count("large_vehicle_only") ? ` · เฉพาะรถใหญ่ ${count("large_vehicle_only")}` : ""}${count("open_limited") ? ` · ผ่านได้ระมัดระวัง ${count("open_limited")}` : ""}` }
    : floods.length ? { cls: "bg-amber-400 text-slate-900", msg: `น้ำท่วม ${floods.length} จุด · ${count("large_vehicle_only") ? `เฉพาะรถใหญ่ ${count("large_vehicle_only")}` : ""}${count("large_vehicle_only") && count("open_limited") ? " · " : ""}${count("open_limited") ? `ผ่านได้ระมัดระวัง ${count("open_limited")}` : ""}` }
    : { cls: "bg-emerald-600 text-white", msg: "ขณะนี้เส้นทางสัญจรได้ตามปกติ — ไม่มีรายงานน้ำท่วมบนทางหลวง" };

  const chart = history.map((h) => ({ t: new Date(h.recorded_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }), cm: h.water_level_cm }));
  const phone = meaningful(settings?.contact_phone);

  return (
    <main className="fixed inset-0 overflow-hidden bg-slate-200">
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

      {/* ───── หัวเรื่องทางการ + แถบสถานการณ์ ───── */}
      <header className="absolute inset-x-0 top-0 z-20 shadow-[0_6px_24px_rgba(7,27,61,.3)]" style={{ background: `linear-gradient(110deg,${COLORS.navyDark},${COLORS.navy})`, borderBottom: `3px solid ${COLORS.yellow}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/25">
            {settings?.logo_url ? <img src={settings.logo_url} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6 text-yellow-300" />}
          </span>
          <div className="min-w-0 flex-1 leading-tight text-white">
            <h1 className="truncate text-[14px] font-bold sm:text-base">{settings?.system_name ?? "ระบบรายงานสถานการณ์น้ำท่วม"}</h1>
            <p className="truncate text-[11px] text-white/70">{settings?.organization ?? "แขวงทางหลวงปัตตานี"}</p>
          </div>
          <div className="text-right text-white">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide"><i className="live-dot" />LIVE</span>
            <p className="mt-0.5 hidden text-[10px] text-white/65 sm:block">อัปเดต {ago(lastFetch)}</p>
          </div>
        </div>
        <button onClick={() => { setSel(null); setSheet("list"); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-bold sm:px-5 ${strip.cls}`}>
          {floods.length ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{strip.msg}</span>
          <span className="shrink-0 opacity-80">ดูรายการ ›</span>
        </button>
        {netErr && <p className="flex items-center gap-1.5 bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900 sm:px-5"><WifiOff className="h-3.5 w-3.5" />เชื่อมต่อไม่ได้ กำลังแสดงข้อมูลล่าสุด</p>}
      </header>

      {/* ───── ปุ่มลอย ───── */}
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+7.4rem)] z-20 flex flex-col gap-2">
        {([[layersOpen ? X : Layers, () => setLayersOpen((v) => !v), "เลเยอร์แผนที่", true], [LocateFixed, locate, "ตำแหน่งของฉัน", true],
          [Plus, () => mapRef.current?.zoom(true), "ขยาย", false], [Minus, () => mapRef.current?.zoom(false), "ย่อ", false]] as const).map(([Ic, fn, label, mobile], i) => (
          <button key={i} onClick={fn} aria-label={label} className={`${mobile ? "grid" : "hidden md:grid"} h-11 w-11 place-items-center rounded-xl bg-white shadow-lg ring-1 ring-black/5 active:scale-95`}>
            <Ic className="h-5 w-5" style={{ color: COLORS.navy }} />
          </button>
        ))}
      </div>

      {layersOpen && (
        <div className="absolute right-[3.75rem] top-[calc(env(safe-area-inset-top)+7.4rem)] z-20 w-60 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">แสดงบนแผนที่</p>
          {([["primary", "ทางหลวงสายหลัก", style.primary.color], ["secondary", "ทางหลวงสายรอง", style.secondary.color], ["detour", "ทางเลี่ยง", style.detour.color],
            ["offices", "สำนักงาน/จุดบริการ", COLORS.navy], ["shields", "ไอคอนทางหลวง", COLORS.navy]] as const).map(([k, l, c]) => (
            <label key={k} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-slate-700 active:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-[#0B2A5B]" checked={layers[k]} onChange={() => setLayers((s) => ({ ...s, [k]: !s[k] }))} />
              <span className="h-1.5 w-5 shrink-0 rounded-full" style={{ background: c }} />{l}
            </label>
          ))}
          {layers.shields && zoomLvl < 12 && <p className="px-1 text-[11px] text-slate-400">ไอคอนทางหลวงถูกซ่อนชั่วคราวเพราะซูมออกมาก — ซูมเข้าเพื่อแสดง</p>}
          <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
            <div className="flex items-center gap-2"><span className="h-1.5 w-5 rounded-full" style={{ background: style.flood.color, boxShadow: `0 0 8px 2px ${style.flood.color}88` }} />ช่วงน้ำท่วม</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%,#EF5350,#C62828)", border: "2px solid #fff", boxShadow: "0 0 0 1px #C62828" }} />หมุดน้ำท่วม + ระดับน้ำ (ซม.)</div>
          </div>
        </div>
      )}

      {tip && <div className="absolute left-1/2 top-[8.5rem] z-30 max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">{tip}</div>}

      {/* ───── แผงล่าง (มือถือ) / แผงซ้าย (เดสก์ท็อป) ───── */}
      <section className={`absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-2 right-2 z-30 flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(7,27,61,.32)] transition-[height] duration-300 md:bottom-4 md:left-4 md:right-auto md:top-[8.1rem] md:w-[420px] md:!h-auto ${heightCls}`}>
        <div className="shrink-0 touch-none select-none px-4 pb-2 pt-2 md:touch-auto" onPointerDown={onDown} onPointerUp={onUp}>
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" />
          {eff === "detail" && (selFlood || selOffice) ? (
            <div className="flex items-center gap-2">
              <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => { setSel(null); setSheet("list"); }}
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600" aria-label="กลับ"><ChevronDown className="h-5 w-5 rotate-90" /></button>
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{selFlood?.title ?? selOffice?.name}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${floods.length ? "bg-red-600 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                {floods.length ? <span className="text-xl font-extrabold">{floods.length}</span> : <CheckCircle2 className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[15px] font-bold text-slate-900">{!loaded ? "กำลังโหลดข้อมูล…" : floods.length ? "จุดที่ได้รับผลกระทบ" : "ไม่มีรายงานน้ำท่วมในขณะนี้"}</p>
                <p className="truncate text-xs text-slate-500">
                  {floods.length && top ? `${rising ? `น้ำเพิ่มขึ้น ${rising} จุด · ` : ""}ล่าสุด ${hwy(top.route_code) || top.title} ${top.latest_level_cm ?? "–"} ซม.` : "เส้นทางสัญจรได้ตามปกติ"}
                </p>
              </div>
              <span className="md:hidden">{eff === "peek" ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}</span>
            </div>
          )}
        </div>

        {/* ── รายการ ── */}
        {eff === "list" && (
          <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto border-t border-slate-100">
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
              {([["all", "ทั้งหมด", floods.length, "bg-[#0B2A5B] text-white"], ["closed", "ปิดการจราจร", count("closed"), "bg-red-600 text-white"],
                ["large_vehicle_only", "เฉพาะรถใหญ่", count("large_vehicle_only"), "bg-amber-500 text-white"], ["open_limited", "ผ่านได้ระมัดระวัง", count("open_limited"), "bg-emerald-600 text-white"]] as const).map(([k, l, n, on]) => (
                <button key={k} onClick={() => setFlt(k as any)} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${flt === k ? on : "bg-slate-100 text-slate-600"}`}>{l} {n}</button>
              ))}
            </div>
            <div className="space-y-2 px-3 pb-3">
              {floods.length > 1 && <button onClick={viewAll} className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#0B2A5B] active:bg-slate-50">ดูทุกจุดบนแผนที่</button>}
              {shown.map((f) => (
                <button key={f.incident_id} onClick={() => pick({ kind: "flood", id: f.incident_id })} className="flex w-full items-stretch gap-3 rounded-xl border border-slate-200 p-3 text-left active:bg-slate-50">
                  <span className="grid w-14 shrink-0 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(160deg,#EF5350,#C62828)" }}>
                    <span className="text-center leading-none"><b className="block text-xl font-extrabold tabular-nums">{f.latest_level_cm ?? "–"}</b><small className="text-[10px] opacity-90">ซม.</small></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{f.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{[hwy(f.route_code), place(f)].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TRAFFIC[f.traffic_status]?.badge}`}>{TRAFFIC[f.traffic_status]?.short}</span>
                      <TrendBadge trend={f.trend} diff={f.level_diff_cm} />
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">อัปเดต {ago(f.latest_recorded_at)}</span>
                  </span>
                </button>
              ))}
              {loaded && !shown.length && (
                <p className="py-8 text-center text-sm text-slate-400">{floods.length ? "ไม่มีรายการในหมวดนี้" : "ขอบคุณที่ตรวจสอบ ✓ ตอนนี้ยังไม่มีเหตุน้ำท่วมบนเส้นทางหลวง"}</p>
              )}
              {meaningful(settings?.description) && <p className="px-1 pt-1 text-center text-[11px] text-slate-400">{settings?.description}</p>}
            </div>
          </div>
        )}

        {/* ── รายละเอียดน้ำท่วม ── */}
        {eff === "detail" && selFlood && (
          <div className="sheet-scroll min-h-0 flex-1 space-y-3.5 overflow-y-auto border-t border-slate-100 p-4">
            <div className="flex items-end justify-between gap-3 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg,${COLORS.navyDark},${COLORS.navy})` }}>
              <div>
                <p className="text-[11px] text-white/60">ระดับน้ำล่าสุด</p>
                <p className="text-5xl font-extrabold leading-none tabular-nums">{selFlood.latest_level_cm ?? "–"}<span className="ml-1 text-base font-medium text-white/70">ซม.</span></p>
              </div>
              <div className="space-y-1.5 text-right">
                <TrendBadge trend={selFlood.trend} diff={selFlood.level_diff_cm} />
                <p className="flex items-center justify-end gap-1 text-[11px] text-white/70"><Clock className="h-3 w-3" />{ago(selFlood.latest_recorded_at)}</p>
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 ${ADVICE[selFlood.traffic_status].cls}`}>
              <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TRAFFIC[selFlood.traffic_status].color }} />{ADVICE[selFlood.traffic_status].title}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{ADVICE[selFlood.traffic_status].text}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              {([
                [MapPin, "พื้นที่", place(selFlood) || "—"], [Navigation2, "เส้นทาง", [hwy(selFlood.route_code), meaningful(selFlood.route_name)].filter(Boolean).join(" ") || "—"],
                [Ruler, "ช่วงที่ได้รับผลกระทบ", [km(selFlood), fmtLen(selFlood.flood_length_m)].filter(Boolean).join(" · ") || "—"],
                [CalendarClock, "เริ่มเกิดเหตุ", fmtTime(selFlood.started_at)],
              ] as const).map(([Ic, l, v]) => (
                <div key={l} className="rounded-xl bg-slate-50 p-2.5">
                  <dt className="flex items-center gap-1 text-[11px] font-semibold text-slate-400"><Ic className="h-3 w-3" />{l}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>

            {chart.length > 1 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">ประวัติระดับน้ำ ({chart.length} ครั้ง)</p><LevelChart data={chart} /></div>}

            {(selFlood.detour_geojson || meaningful(selFlood.detour_note)) && (
              <div className="flex gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3.5">
                <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-yellow-900">ทางเลี่ยง (เส้นประสีเหลือง){selFlood.detour_length_m ? ` · ${fmtLen(selFlood.detour_length_m)}` : ""}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-yellow-900/85">{meaningful(selFlood.detour_note) || "ดูเส้นทางเลี่ยงบนแผนที่"}</p>
                </div>
              </div>
            )}
            {meaningful(selFlood.latest_note) && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{selFlood.latest_note}</p>}

            {!!selFlood.latest_image_paths?.length && (
              <div className="grid grid-cols-2 gap-2">
                {selFlood.latest_image_paths.slice(0, 4).map((p) => (
                  <a key={p} href={imageUrl(p)} target="_blank" rel="noreferrer"><img src={imageUrl(p)} alt="ภาพสถานการณ์" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /></a>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${selFlood.pin_lat},${selFlood.pin_lng}`} target="_blank" rel="noreferrer"
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 active:bg-slate-50"><ExternalLink className="h-4 w-4" />นำทาง</a>
              <button onClick={() => share(selFlood)} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 active:bg-slate-50"><Share2 className="h-4 w-4" />แชร์</button>
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white" style={{ background: COLORS.navy }}><Phone className="h-4 w-4" />โทร {phone}</a>}
            </div>
            <p className="pb-1 text-center text-[11px] leading-relaxed text-slate-400">
              รายงานโดย {meaningful(selFlood.latest_reported_by) || "เจ้าหน้าที่แขวงทางหลวง"} · อัปเดต {selFlood.update_count} ครั้ง<br />ข้อมูลอาจเปลี่ยนแปลงตามสถานการณ์ โปรดติดตามประกาศล่าสุด
            </p>
          </div>
        )}

        {/* ── รายละเอียดสำนักงาน ── */}
        {eff === "detail" && selOffice && (
          <div className="sheet-scroll min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-slate-100 p-4">
            <div className="flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg,${COLORS.navyDark},${COLORS.navy})` }}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-yellow-300 bg-white/10"><Building2 className="h-6 w-6 text-yellow-300" /></span>
              <div className="min-w-0"><p className="text-[11px] text-white/60">สำนักงาน / จุดบริการ</p><p className="font-bold leading-snug">{selOffice.name}</p></div>
            </div>
            {meaningful(selOffice.address) && <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{selOffice.address}</p>}
            <div className="grid grid-cols-2 gap-2">
              {meaningful(selOffice.phone) && <a href={`tel:${selOffice.phone!.replace(/[^\d+]/g, "")}`} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white" style={{ background: COLORS.navy }}><Phone className="h-4 w-4" />โทร</a>}
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${selOffice.lat},${selOffice.lng}`} target="_blank" rel="noreferrer"
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 ${meaningful(selOffice.phone) ? "" : "col-span-2"}`}><ExternalLink className="h-4 w-4" />นำทาง</a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
