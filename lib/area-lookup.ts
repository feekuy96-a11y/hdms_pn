// One place that answers "which ตำบล / อำเภอ / หมู่บ้าน / ถนน is this coordinate in?".
//
// Before this module, two functions answered the same question differently:
//   - getDetailedPattaniAddress  : local boxes -> Nominatim          (used by the advice generator and the map form)
//   - reverseGeocodeTambonAmphoe : Longdo -> Nominatim -> district   (used to name a flood point)
// so the same point could get two different tambons, nothing was cached across a reload, every call went to the
// public Nominatim server straight away (its policy is at most one request per second, and the advice generator
// asked once per route step), and when the network was down every call waited out a 3.5 second timeout.
//
// What this module does:
//   - one answer per point, in the same order for every screen: Longdo (if a key is set) -> Nominatim -> local data
//   - 30 day cache in memory and in localStorage (administrative names do not change), in-flight de-duplication,
//     and reuse of a nearby answer (150 m) when only the area name is needed
//   - Nominatim calls are queued at least one second apart, retried once for 429/5xx/timeouts, and after a failure
//     the online sources are skipped for a minute so offline use is not slowed down
//   - an honest confidence level: only an online answer that names the tambon is "high". The local dataset
//     (hand-drawn rectangles for 22 tambons, overlapping each other, plus rough district outlines) is "low" and is
//     never allowed to guess a tambon where two rectangles overlap. Its village names are not used.
// The old public helpers (isPointInPolygon, findPattaniDistrictName, cleanThaiAdminPrefix) live here now and are
// re-exported from lib/gis-utils.ts, so existing imports keep working.

import { PATTANI_DISTRICTS_GEOJSON, PATTANI_SUBDISTRICTS_DATA } from "./gis-data";

export interface AreaInfo {
  /** Village name without "บ." - only from an online source, "" otherwise. */
  village: string;
  /** Subdistrict (ตำบล) without "ต.". */
  tambon: string;
  /** District (อำเภอ) without "อ.". */
  amphoe: string;
  /** Province without "จ.". */
  province: string;
  /** Road name from the reverse geocoder ("" if unknown). */
  road: string;
  source: "longdo" | "nominatim" | "local" | "district";
  /** high: online answer naming the tambon · medium: tambon taken from a municipality/town field · low: local data. */
  confidence: "high" | "medium" | "low";
}

export interface ResolveAreaOptions {
  /** The caller needs the road name of exactly this point (a nearby answer would not do). */
  needRoad?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Name helpers and local data (moved here from lib/gis-utils.ts, same behaviour)
// ---------------------------------------------------------------------------------------------------------------

/** ตัดคำนำหน้าชื่อหน่วยการปกครองไทย (ตำบล, อำเภอ, จังหวัด, เทศบาล ...) ให้กระชับ */
export function cleanThaiAdminPrefix(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(
      /^(เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|อบต\.|องค์การบริหารส่วนตำบล|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|หมู่บ้าน|ชุมชน|ต\.|อ\.|จ\.|บ\.|ม\.)\s*/,
      ""
    )
    .trim();
}

export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const PATTANI_AMPHOE_CENTERS = [
  { name: "อ.เมืองปัตตานี", pt: [101.25, 6.868] },
  { name: "อ.หนองจิก", pt: [101.176, 6.852] },
  { name: "อ.โคกโพธิ์", pt: [101.127, 6.723] },
  { name: "อ.ยะหริ่ง", pt: [101.37, 6.865] },
  { name: "อ.ปะนาเระ", pt: [101.493, 6.858] },
  { name: "อ.มายอ", pt: [101.423, 6.745] },
  { name: "อ.ยะรัง", pt: [101.293, 6.758] },
  { name: "อ.สายบุรี", pt: [101.618, 6.702] },
  { name: "อ.ไม้แก่น", pt: [101.675, 6.612] },
  { name: "อ.กะพ้อ", pt: [101.558, 6.575] },
  { name: "อ.ทุ่งยางแดง", pt: [101.468, 6.638] },
  { name: "อ.แม่ลาน", pt: [101.205, 6.65] },
];

/** ค้นหาชื่ออำเภอใน จ.ปัตตานี จากพิกัด (รูปหลายเหลี่ยมโดยประมาณ แล้วใช้ศูนย์กลางอำเภอที่ใกล้ที่สุด) */
export function findPattaniDistrictName(coord: [number, number]): string {
  if (!coord || coord.length < 2) return "จ.ปัตตานี";
  for (const feat of PATTANI_DISTRICTS_GEOJSON.features) {
    const poly = feat.geometry.coordinates[0] as [number, number][];
    if (isPointInPolygon(coord, poly)) {
      return feat.properties.name;
    }
  }

  let bestDist = Infinity;
  let bestName = "อ.เมืองปัตตานี";
  for (const item of PATTANI_AMPHOE_CENTERS) {
    const d = Math.hypot(coord[0] - item.pt[0], coord[1] - item.pt[1]);
    if (d < bestDist) {
      bestDist = d;
      bestName = item.name;
    }
  }
  return bestName;
}

/**
 * Local answer. The tambon rectangles in gis-data.ts overlap, so a point is only given a tambon when exactly one
 * rectangle contains it; with two or more it gets the district only (the old code returned whichever rectangle
 * came first in the list).
 */
export function localArea(lon: number, lat: number): AreaInfo {
  const matches = PATTANI_SUBDISTRICTS_DATA.filter((s) => {
    const [minX, minY, maxX, maxY] = s.bounds;
    return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
  });
  const district = cleanThaiAdminPrefix(findPattaniDistrictName([lon, lat]));

  if (matches.length === 1) {
    return {
      village: "",
      tambon: matches[0].tambon,
      amphoe: matches[0].amphoe,
      province: "ปัตตานี",
      road: "",
      source: "local",
      confidence: "low",
    };
  }
  const amphoes = Array.from(new Set(matches.map((m) => m.amphoe)));
  return {
    village: "",
    tambon: "",
    amphoe: amphoes.length === 1 ? amphoes[0] : district,
    province: "ปัตตานี",
    road: "",
    source: matches.length > 1 ? "local" : "district",
    confidence: "low",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Online lookup
// ---------------------------------------------------------------------------------------------------------------

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_ANSWER_TTL_MS = 2 * 60 * 1000;
const STORE_KEY = "doh-area-cache-v1";
const STORE_MAX_ENTRIES = 300;
const NEARBY_REUSE_METERS = 150;
const NOMINATIM_MIN_GAP_MS = 1000;
const NOMINATIM_TIMEOUT_MS = 3500;
const LONGDO_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 1500;
const BREAKER_MS = 60 * 1000;
const RATE_LIMIT_BREAKER_MS = 120 * 1000;

const memory = new Map<string, { at: number; ttl: number; info: AreaInfo }>();
const inflight = new Map<string, Promise<AreaInfo>>();
const recent: Array<{ lon: number; lat: number; info: AreaInfo }> = [];
let persisted: Record<string, { t: number; v: AreaInfo }> | null = null;
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;
let nominatimDownUntil = 0;
let longdoDownUntil = 0;

/** Clears caches and counters (tests, or after the data source changes). */
export function resetAreaLookup() {
  memory.clear();
  inflight.clear();
  recent.length = 0;
  persisted = null;
  nominatimQueue = Promise.resolve();
  lastNominatimAt = 0;
  nominatimDownUntil = 0;
  longdoDownUntil = 0;
  try {
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.removeItem(STORE_KEY);
  } catch {
    // storage may be blocked; the in-memory cache still works
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const cacheKey = (lon: number, lat: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`;

function metersBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dx = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110574;
  return Math.hypot(dx, dy);
}

function readStore(): Record<string, { t: number; v: AreaInfo }> {
  if (persisted) return persisted;
  const store: Record<string, { t: number; v: AreaInfo }> = {};
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") Object.assign(store, parsed);
    }
  } catch {
    // unreadable storage: start empty
  }
  persisted = store;
  return store;
}

function saveToStore(key: string, info: AreaInfo) {
  const store = readStore();
  store[key] = { t: Date.now(), v: info };
  const keys = Object.keys(store);
  if (keys.length > STORE_MAX_ENTRIES) {
    keys
      .sort((a, b) => store[a].t - store[b].t)
      .slice(0, keys.length - STORE_MAX_ENTRIES)
      .forEach((oldKey) => delete store[oldKey]);
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // quota or blocked storage: ignore
  }
}

// A plain shape (not a discriminated union): this project compiles with strict mode off, where narrowing on `ok`
// does not work.
interface FetchResult {
  ok: boolean;
  data?: any;
  retryable?: boolean;
  rateLimited?: boolean;
}

async function getJson(url: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) return { ok: false, retryable: true, rateLimited: true };
    if (response.status >= 500) return { ok: false, retryable: true, rateLimited: false };
    if (!response.ok) return { ok: false, retryable: false, rateLimited: false };
    const data = await response.json().catch(() => null);
    return data ? { ok: true, data } : { ok: false, retryable: false, rateLimited: false };
  } catch {
    return { ok: false, retryable: true, rateLimited: false };
  } finally {
    clearTimeout(timer);
  }
}

function enqueueNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(task, task);
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function queryLongdo(lon: number, lat: number, key: string): Promise<Partial<AreaInfo> | null> {
  const url = `https://api.longdo.com/map/services/address?lon=${lon}&lat=${lat}&key=${encodeURIComponent(key)}`;
  const result = await getJson(url, LONGDO_TIMEOUT_MS);
  if (!result.ok) {
    // A temporary failure pauses Longdo for a minute; a rejected request (for example a wrong or expired key) for ten.
    longdoDownUntil = Date.now() + (result.retryable ? BREAKER_MS : 10 * 60 * 1000);
    return null;
  }
  const data = result.data;
  const tambon = cleanThaiAdminPrefix(data.subdistrict);
  const amphoe = cleanThaiAdminPrefix(data.district);
  if (!tambon && !amphoe) return null;
  return {
    village: "",
    tambon,
    amphoe,
    province: cleanThaiAdminPrefix(data.province) || "ปัตตานี",
    road: typeof data.road === "string" ? data.road : "",
    source: "longdo",
    confidence: tambon ? "high" : "medium",
  };
}

async function queryNominatim(lon: number, lat: number): Promise<Partial<AreaInfo> | null> {
  if (Date.now() < nominatimDownUntil) return null;
  // No "User-Agent" header: browsers do not allow scripts to set it (it was silently ignored), and sending
  // other custom headers would only add a preflight request.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th&zoom=18`;

  const result = await enqueueNominatim(async () => {
    let last: FetchResult = { ok: false, retryable: true, rateLimited: false };
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = lastNominatimAt + NOMINATIM_MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastNominatimAt = Date.now();
      last = await getJson(url, NOMINATIM_TIMEOUT_MS);
      if (last.ok || !last.retryable) return last;
      if (attempt === 0) await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 400));
    }
    return last;
  });

  if (!result.ok) {
    if (result.retryable) nominatimDownUntil = Date.now() + (result.rateLimited ? RATE_LIMIT_BREAKER_MS : BREAKER_MS);
    return null;
  }

  const addr = result.data?.address || {};
  const village = cleanThaiAdminPrefix(addr.village || addr.hamlet || addr.neighbourhood);
  // Fields that name a ตำบล are trusted more than a municipality/town name, which only often equals it.
  const strongTambon = cleanThaiAdminPrefix(addr.subdistrict || addr.suburb);
  const weakTambon = cleanThaiAdminPrefix(addr.municipality || addr.town || addr.city_district);
  const tambon = strongTambon || weakTambon;
  const amphoe = cleanThaiAdminPrefix(addr.district || addr.county || addr.city_district || addr.city);
  if (!tambon && !amphoe && !village && !addr.road) return null;
  return {
    village,
    tambon,
    amphoe,
    province: cleanThaiAdminPrefix(addr.state || addr.province) || "ปัตตานี",
    road: typeof addr.road === "string" ? addr.road : "",
    source: "nominatim",
    confidence: strongTambon ? "high" : tambon ? "medium" : "low",
  };
}

async function resolveOnline(lon: number, lat: number): Promise<AreaInfo | null> {
  const local = localArea(lon, lat);
  const merge = (online: Partial<AreaInfo>): AreaInfo => {
    const tambonFromLocal = !online.tambon && local.tambon && (!online.amphoe || online.amphoe === local.amphoe);
    return {
      village: online.village || "",
      tambon: online.tambon || (tambonFromLocal ? local.tambon : ""),
      amphoe: online.amphoe || local.amphoe,
      province: online.province || "ปัตตานี",
      road: online.road || "",
      source: online.source || "nominatim",
      confidence: online.tambon ? online.confidence || "medium" : tambonFromLocal ? "low" : online.confidence || "low",
    };
  };

  const longdoKey = process.env.NEXT_PUBLIC_LONGDO_MAP_KEY;
  if (longdoKey && Date.now() >= longdoDownUntil) {
    const fromLongdo = await queryLongdo(lon, lat, longdoKey);
    if (fromLongdo) return merge(fromLongdo);
  }

  const fromNominatim = await queryNominatim(lon, lat);
  return fromNominatim ? merge(fromNominatim) : null;
}

/**
 * Area name for a coordinate. Never throws and never waits longer than one or two network timeouts: if no online
 * source answers, the local answer (confidence "low") is returned.
 */
export async function resolveArea(lon: number, lat: number, options: ResolveAreaOptions = {}): Promise<AreaInfo> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { village: "", tambon: "", amphoe: "", province: "ปัตตานี", road: "", source: "district", confidence: "low" };
  }

  const key = cacheKey(lon, lat);
  const now = Date.now();

  const hit = memory.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.info;

  const stored = readStore()[key];
  if (stored && now - stored.t < CACHE_TTL_MS) {
    memory.set(key, { at: now, ttl: CACHE_TTL_MS, info: stored.v });
    return stored.v;
  }

  // Only the area name is needed: an online answer for a point within 150 m is good enough.
  if (!options.needRoad) {
    const near = recent.find((item) => metersBetween(lon, lat, item.lon, item.lat) <= NEARBY_REUSE_METERS);
    if (near) return { ...near.info, road: "" };
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const online = await resolveOnline(lon, lat);
    if (online) {
      memory.set(key, { at: Date.now(), ttl: CACHE_TTL_MS, info: online });
      saveToStore(key, online);
      recent.unshift({ lon, lat, info: online });
      if (recent.length > 12) recent.pop();
      return online;
    }
    // Offline or rate limited: answer locally, but remember it only briefly so a later call can upgrade it.
    const fallback = localArea(lon, lat);
    memory.set(key, { at: Date.now(), ttl: LOCAL_ANSWER_TTL_MS, info: fallback });
    return fallback;
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}
