/**
 * lib/api.ts — เรียกใช้จาก Client Component เท่านั้น (เว็บเป็น Static Export)
 *  อ่าน  : ตาราง/วิวผ่าน anon key (RLS select)
 *  เขียน : ผ่าน rpc_* เท่านั้น (ตรวจข้อมูล + audit + รหัสผ่านแอดมินถ้าเปิดใช้)
 */
import { supabase, type AdminRoute, type HistoryPoint, type Incident, type Office, type RouteRow, type Settings, type Traffic } from "./supabase";
import { LONGDO_KEY, SUPABASE_URL } from "./config";
import { cleanLine, simplify } from "./geo";
import type { LngLat } from "./longdo";

/* ───────────── RPC + รหัสผ่านแอดมิน (ไม่บังคับ) ───────────── */
let passcode: string | null = typeof window !== "undefined" ? sessionStorage.getItem("fm_admin_pass") : null;
let askPass: (() => Promise<string | null>) | null = null;
export const registerPasscodePrompt = (fn: () => Promise<string | null>) => { askPass = fn; };

export async function rpc<T = any>(name: string, args: Record<string, any> = {}, withPass = true): Promise<T> {
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase.rpc(name, withPass ? { p_pass: passcode, ...args } : args);
    if (!error) return data as T;
    if (error.message.includes("PASSCODE_REQUIRED")) {
      const p = askPass ? await askPass() : null;
      if (p == null) throw new Error("ต้องใส่รหัสผ่านแอดมินจึงจะบันทึกได้");
      passcode = p;
      sessionStorage.setItem("fm_admin_pass", p);
      continue;
    }
    throw new Error(friendly(error.message));
  }
  throw new Error("รหัสผ่านแอดมินไม่ถูกต้อง");
}

function friendly(m: string) {
  const map: Record<string, string> = {
    INVALID_TITLE: "หัวข้อไม่ถูกต้อง (ว่าง หรือยาวเกิน 200 ตัวอักษร)",
    INVALID_LEVEL: "ระดับน้ำต้องอยู่ระหว่าง 0–1000 ซม.",
    INVALID_FLOOD_GEOMETRY: "เส้นน้ำท่วมไม่ถูกต้อง",
    INVALID_DETOUR_GEOMETRY: "เส้นเลี่ยงไม่ถูกต้อง",
    INCIDENT_NOT_FOUND: "ไม่พบเหตุการณ์ (อาจถูกลบไปแล้ว)",
  };
  const k = Object.keys(map).find((x) => m.includes(x));
  return k ? map[k] : m;
}

export const passcodeRequired = async () => !!(await rpc<boolean>("rpc_passcode_required", {}, false).catch(() => false));

/* ───────────── อ่านข้อมูล ───────────── */
export async function fetchSettings(): Promise<Settings | null> {
  const { data } = await supabase.from("system_settings").select("system_name,organization,description,logo_url,contact_phone,map_style").eq("id", 1).maybeSingle();
  return (data as Settings) ?? null;
}

export async function fetchFloods(): Promise<Incident[]> {
  const { data, error } = await supabase.from("v_map_active_floods").select("*").order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Incident[];
}

export async function fetchAdminIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase.from("v_incidents_full").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Incident[];
}

export async function fetchHistory(incidentId: string): Promise<HistoryPoint[]> {
  const { data } = await supabase
    .from("flood_updates").select("water_level_cm,recorded_at,note,reported_by")
    .eq("incident_id", incidentId).order("recorded_at");
  return (data ?? []) as HistoryPoint[];
}

/**
 * เส้นทาง: เทียบ "เวอร์ชัน" (จำนวน+เวลาแก้ไขล่าสุด) ก่อนใช้แคชใน localStorage
 *  → นำเข้า/แก้เส้นทางแล้วทุกคนเห็นทันที ไม่ค้างแคชเก่า แต่ยังประหยัด egress (ดึงเต็มเฉพาะตอนมีการเปลี่ยน)
 */
export async function fetchRoutes(force = false): Promise<RouteRow[]> {
  const KEY = "fm_routes_v3";
  let ver: string | null = null;
  try {
    const { data } = await supabase.from("v_routes_version").select("n,v").maybeSingle();
    if (data) ver = `${(data as any).n}|${(data as any).v}`;
  } catch { /* ยังไม่ได้รัน SQL v3 → ไม่ใช้แคช */ }
  if (!force && ver) {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && c.k === ver) return c.d;
    } catch { /* ignore */ }
  }
  const out: RouteRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("v_map_routes").select("*").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as RouteRow[]));
    if (!data || data.length < 1000) break;
  }
  if (ver) { try { localStorage.setItem(KEY, JSON.stringify({ k: ver, d: out })); } catch { /* เกินโควตา ข้ามได้ */ } }
  return out;
}

export async function fetchOffices(): Promise<Office[]> {
  const { data } = await supabase.from("offices").select("id,name,address,phone,lng,lat,is_active").order("sort_order").order("name");
  return (data ?? []) as Office[];
}

export async function fetchAdminRoutes(): Promise<AdminRoute[]> {
  const out: AdminRoute[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("v_admin_routes").select("*").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as AdminRoute[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* ───────────── รูปภาพ (บีบ < 300KB ด้วย Canvas ในเบราว์เซอร์) ───────────── */
const MAX_BYTES = 300 * 1024;

export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์ที่เลือกไม่ใช่รูปภาพ");
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any); // หมุนตาม EXIF
  } catch {
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("อ่านรูปไม่ได้ (ถ้าเป็น HEIC ให้ตั้งกล้องเป็น JPEG)")); };
      im.src = url;
    });
  }
  const w0 = (bmp as any).width as number, h0 = (bmp as any).height as number;
  let scale = Math.min(1, 1600 / Math.max(w0, h0));

  for (let round = 0; round < 6; round++) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * scale));
    c.height = Math.max(1, Math.round(h0 * scale));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // กัน PNG โปร่งใสกลายเป็นพื้นดำ
    ctx.drawImage(bmp as any, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size < MAX_BYTES) return blob;
    }
    scale *= 0.8; // ยังใหญ่เกิน → ลดความละเอียดแล้วลองใหม่
  }
  throw new Error("บีบอัดรูปให้ต่ำกว่า 300KB ไม่สำเร็จ");
}

export async function uploadImages(folder: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const f of files.slice(0, 10)) {
    const blob = await compressImage(f);
    const path = `${folder}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("flood-images").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

export const imageUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/flood-images/${path}`;

/* ───────────── เกาะเส้นตามถนนอัตโนมัติ ───────────── */
export interface RouteResult { coords: LngLat[]; via: "db" | "osrm" | "line"; label?: string }

/**
 * ลำดับความพยายาม:
 *  1) db   — ตัดช่วงจากเส้นทางหลวงที่นำเข้า (SHP) ด้วย PostGIS: แม่นที่สุด ใช้ข้อมูลของแขวงเอง
 *  2) osrm — ถนนอื่นที่ไม่อยู่ในข้อมูลนำเข้า (เซิร์ฟเวอร์สาธิตของ OSRM ใช้เป็นตัวเสริมเท่านั้น)
 *  3) line — เส้นตรง (Admin ดัดเองได้)
 */
export async function autoRoute(a: LngLat, b: LngLat, prefer: "db" | "osrm" = "db"): Promise<RouteResult> {
  const viaDb = async (): Promise<RouteResult | null> => {
    try {
      const r = await rpc<any>("rpc_snap_line", { p_a_lng: a[0], p_a_lat: a[1], p_b_lng: b[0], p_b_lat: b[1], p_max_m: 200 }, false);
      if (r?.found) return { coords: r.geojson.coordinates, via: "db", label: r.route_code };
    } catch { /* ไปขั้นถัดไป */ }
    return null;
  };
  const viaOsrm = async (): Promise<RouteResult | null> => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`, { signal: ctl.signal });
      clearTimeout(t);
      const j = await res.json();
      if (j.code === "Ok" && j.routes?.[0]) return { coords: j.routes[0].geometry.coordinates, via: "osrm" };
    } catch { /* ไปขั้นถัดไป */ }
    return null;
  };
  // เส้นน้ำท่วมควรอยู่บนแนวทางหลวงที่นำเข้า (db ก่อน) · ทางเลี่ยงมักผ่านถนนหลายสาย (OSRM ก่อน)
  const order = prefer === "db" ? [viaDb, viaOsrm] : [viaOsrm, viaDb];
  for (const f of order) { const r = await f(); if (r) return r; }
  return { coords: [a, b], via: "line" };
}

/** ดึง ตำบล/อำเภอ/จังหวัด จากพิกัด (Longdo ก่อน แล้วสำรองด้วย OpenStreetMap) */
export async function reverseGeocode(lng: number, lat: number): Promise<{ subdistrict: string; district: string; province: string } | null> {
  const strip = (v?: string) => (v ?? "").replace(/^(ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ต\.|อ\.|จ\.)\s*/, "").trim();
  try {
    const r = await fetch(`https://api.longdo.com/map/services/address?lon=${lng}&lat=${lat}&key=${encodeURIComponent(LONGDO_KEY)}`);
    if (r.ok) {
      const j = await r.json();
      const o = { subdistrict: strip(j.subdistrict), district: strip(j.district), province: strip(j.province) };
      if (o.subdistrict || o.district) return o;
    }
  } catch { /* ลองตัวสำรอง */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=th&zoom=14`);
    if (r.ok) {
      const a = (await r.json()).address ?? {};
      return {
        subdistrict: strip(a.suburb || a.village || a.neighbourhood || a.hamlet),
        district: strip(a.county || a.city_district || a.district || a.town || a.city),
        province: strip(a.state || a.province),
      };
    }
  } catch { /* ไม่ได้ก็ปล่อยให้กรอกเอง */ }
  return null;
}

/* ───────────── เขียนข้อมูล (ผ่าน RPC) ───────────── */
export interface SaveIncidentInput {
  id?: string;
  title: string; location?: string; district?: string; traffic: Traffic;
  flood: LngLat[]; detour?: LngLat[] | null; detourNote?: string;
  routeId?: string | null; kmStart?: number | null; kmEnd?: number | null;
  levelCm?: number; note?: string; reportedBy?: string; images?: File[];
}

export async function saveIncident(i: SaveIncidentInput): Promise<string> {
  const id = i.id ?? crypto.randomUUID();
  const flood = { type: "LineString", coordinates: cleanLine(i.flood) };
  const detour = i.detour && i.detour.length >= 2 ? { type: "LineString", coordinates: cleanLine(i.detour) } : null;
  const paths = !i.id && i.images?.length ? await uploadImages(id, i.images) : [];
  await rpc("rpc_save_incident", {
    p_id: id, p_title: i.title, p_location: i.location || null, p_district: i.district || null, p_traffic: i.traffic,
    p_flood: flood, p_detour: detour, p_detour_note: i.detourNote || null, p_route_id: i.routeId || null,
    p_km_start: i.kmStart ?? null, p_km_end: i.kmEnd ?? null,
    p_level: i.id ? null : i.levelCm ?? null, p_note: i.note || null, p_reported_by: i.reportedBy || null, p_image_paths: paths,
  });
  return id;
}

export async function addUpdate(incidentId: string, p: { levelCm: number; note?: string; reportedBy?: string; images?: File[] }) {
  const paths = p.images?.length ? await uploadImages(incidentId, p.images) : [];
  await rpc("rpc_add_update", {
    p_incident_id: incidentId, p_level: p.levelCm, p_note: p.note || null, p_reported_by: p.reportedBy || null, p_image_paths: paths,
  });
}

export const setStatus = (id: string, status: "active" | "resolved") => rpc("rpc_set_status", { p_id: id, p_status: status });
export const deleteIncident = (id: string) => rpc("rpc_delete_incident", { p_id: id });

export async function saveSettings(s: { name: string; org: string; desc: string; phone: string; logo?: File | null }) {
  let logo_url: string | null = null;
  if (s.logo) {
    const small = s.logo.size <= MAX_BYTES && /png|svg|webp/.test(s.logo.type);
    const blob = small ? s.logo : await compressImage(s.logo);
    const ext = small ? (s.logo.type.includes("svg") ? "svg" : s.logo.type.includes("webp") ? "webp" : "png") : "jpg";
    const path = `logo_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, blob, { contentType: small ? s.logo.type : "image/jpeg" });
    if (error) throw new Error(`อัปโหลดโลโก้ไม่สำเร็จ: ${error.message}`);
    logo_url = `${SUPABASE_URL}/storage/v1/object/public/branding/${path}`;
  }
  await rpc("rpc_save_settings", { p_name: s.name, p_org: s.org, p_desc: s.desc || null, p_logo_url: logo_url, p_phone: s.phone || null });
}

export interface RouteImportRow {
  route_code: string; route_name: string; route_type: "primary" | "secondary";
  source: string; props: Record<string, any>; lines: LngLat[][];
}

/** นำเข้าเส้นทาง: ลดจุดเล็กน้อย (~1 ม.) แล้วแบ่งส่งเป็นชุดละ ~600KB */
export async function importRoutes(rows: RouteImportRow[], onProgress?: (done: number, total: number) => void): Promise<{ imported: number; skipped: number }> {
  let total = 0, skipped = 0, batch: any[] = [], size = 0, done = 0;
  const flush = async () => {
    if (!batch.length) return;
    const r = await rpc<{ imported: number; skipped: number }>("rpc_import_routes", { p_rows: batch });
    total += r?.imported ?? 0; skipped += r?.skipped ?? 0;
    done += batch.length; onProgress?.(done, rows.length);
    batch = []; size = 0;
  };
  for (const r of rows) {
    const coords = r.lines.map((l) => simplify(l, 0.000008)).filter((l) => l.length >= 2)
      .map((l) => l.map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]));
    if (!coords.length) continue;
    const item = {
      route_code: r.route_code, route_name: r.route_name, route_type: r.route_type, source: r.source,
      props: slimProps(r.props), geometry: { type: "MultiLineString", coordinates: coords },
    };
    const s = JSON.stringify(item).length;
    if (batch.length && (size + s > 600_000 || batch.length >= 100)) await flush();
    batch.push(item); size += s;
  }
  await flush();
  return { imported: total, skipped };
}

const slimProps = (p: Record<string, any>) =>
  Object.fromEntries(Object.entries(p ?? {}).slice(0, 30).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 200) : v]));

export const saveMapStyle = (style: unknown) => rpc("rpc_save_map_style", { p_style: style });

export interface OfficeInput { id?: string; name: string; address?: string; phone?: string; lng: number; lat: number; active: boolean }
export const saveOffice = (o: OfficeInput) =>
  rpc("rpc_save_office", { p_id: o.id ?? null, p_name: o.name, p_address: o.address || null, p_phone: o.phone || null, p_lng: o.lng, p_lat: o.lat, p_active: o.active });
export const deleteOffice = (id: string) => rpc("rpc_delete_office", { p_id: id });

export const updateRoute = (id: string, name: string, type: "primary" | "secondary", active: boolean) =>
  rpc("rpc_update_route", { p_id: id, p_name: name, p_type: type, p_active: active });
export const deleteRoute = (id: string) => rpc("rpc_delete_route", { p_id: id });

/* ───────────── ส่งออก CSV ───────────── */
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // กัน CSV injection (Excel ตีความเป็นสูตร)
  return `"${s.replace(/"/g, '""')}"`;
};

export async function exportUpdatesCsv(): Promise<number> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("flood_updates")
      .select("id,incident_id,water_level_cm,note,reported_by,recorded_at,image_paths,flood_incidents!inner(title,location_name,district,deleted_at)")
      .is("flood_incidents.deleted_at", null)
      .order("recorded_at", { ascending: false }).order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const head = ["update_id", "incident_id", "title", "location", "district", "level_cm", "note", "reported_by", "recorded_at", "image_urls"];
  const lines = rows.map((r) => {
    const inc = Array.isArray(r.flood_incidents) ? r.flood_incidents[0] : r.flood_incidents;
    return [r.id, r.incident_id, inc?.title, inc?.location_name, inc?.district, r.water_level_cm, r.note, r.reported_by,
      new Date(r.recorded_at).toISOString(), (r.image_paths ?? []).map(imageUrl).join(" | ")].map(csvCell).join(",");
  });
  const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" }); // BOM ให้ Excel อ่านไทยได้
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `flood_updates_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return rows.length;
}
