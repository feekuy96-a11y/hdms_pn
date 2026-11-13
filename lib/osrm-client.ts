// Resilient client for the OSRM routing engines (local service first, public demo server second).
//
// Why this exists: the public OSRM demo server has no SLA and a fair-use limit of about one request per
// second, and the admin screens call it on every snap / drag / undo. This module keeps the same public
// API as before (fetchOsrmWithFailover) but adds, in one place:
//   - a 30 minute cache, so undo/redo and re-snapping the same points cost no network call
//   - in-flight de-duplication, so two identical concurrent requests share one call
//   - one retry for transient failures (network error, timeout, HTTP 429 / 5xx), never for definitive answers
//   - a queue that spaces calls to the public server at least one second apart
//   - a 60 second circuit breaker for the local service, so a switched-off local service does not add its
//     1.2 second timeout to every call
//   - a failure hint, so screens can tell the officer what to do instead of a generic error
// No imports: it can be tested on its own.

export type OsrmFailure = "rate_limited" | "unreachable" | "no_route";
export interface OsrmResult {
  data: any;
  source: "local" | "public";
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 60;
const PUBLIC_MIN_GAP_MS = 1000;
const RETRY_DELAY_MS = 700;
const LOCAL_TIMEOUT_MS = 1200;
const PUBLIC_TIMEOUT_MS = 6500;
const LOCAL_BREAKER_MS = 60 * 1000;

const cache = new Map<string, { at: number; value: OsrmResult }>();
const inflight = new Map<string, Promise<OsrmResult | null>>();
let lastFailure: OsrmFailure | null = null;
let lastPublicCallAt = 0;
let localDownUntil = 0;
let publicQueue: Promise<unknown> = Promise.resolve();

/** Why the most recent request failed (null after a success). */
export function getOsrmFailureHint(): OsrmFailure | null {
  return lastFailure;
}

/** Clears cache and counters (used by tests and when settings change). */
export function resetOsrmClient() {
  cache.clear();
  inflight.clear();
  lastFailure = null;
  lastPublicCallAt = 0;
  localDownUntil = 0;
  publicQueue = Promise.resolve();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A plain shape (not a discriminated union): this project compiles with strict mode off, where
// narrowing on `ok` does not work.
interface AttemptResult {
  ok: boolean;
  data?: any;
  failure?: OsrmFailure;
  retryable?: boolean;
}

async function requestOnce(url: string, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) return { ok: false, failure: "rate_limited", retryable: true };
    if (response.status >= 500) return { ok: false, failure: "unreachable", retryable: true };
    const data = await response.json().catch(() => null);
    if (response.ok && data?.routes?.[0]) return { ok: true, data };
    // 4xx or an OSRM "NoRoute" answer is definitive: asking again cannot help.
    return { ok: false, failure: "no_route", retryable: false };
  } catch {
    return { ok: false, failure: "unreachable", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

function enqueuePublic<T>(task: () => Promise<T>): Promise<T> {
  const run = publicQueue.then(task, task);
  publicQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function viaPublic(url: string): Promise<AttemptResult> {
  return enqueuePublic(async () => {
    let last: AttemptResult = { ok: false, failure: "unreachable", retryable: true };
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = lastPublicCallAt + PUBLIC_MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastPublicCallAt = Date.now();
      last = await requestOnce(url, PUBLIC_TIMEOUT_MS);
      if (last.ok || !last.retryable) return last;
      if (attempt === 0) await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 300));
    }
    return last;
  });
}

function remember(key: string, value: OsrmResult) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function resolveRoute(coordString: string, params: string): Promise<OsrmResult | null> {
  const localBase = process.env.NEXT_PUBLIC_OSRM_LOCAL_URL;
  const publicBase = process.env.NEXT_PUBLIC_OSRM_ROUTING_URL || "https://router.project-osrm.org/route/v1/driving";
  const key = `${coordString}?${params}`;

  // Tier 1: local microservice (LAN / the officer's own machine). Skipped for a minute after it fails.
  if (localBase && Date.now() >= localDownUntil) {
    const local = await requestOnce(`${localBase}/${coordString}?${params}`, LOCAL_TIMEOUT_MS);
    if (local.ok) {
      const value: OsrmResult = { data: local.data, source: "local" };
      remember(key, value);
      lastFailure = null;
      return value;
    }
    if (local.failure === "unreachable") localDownUntil = Date.now() + LOCAL_BREAKER_MS;
  }

  // Tier 2: public OSRM, spaced and retried once.
  const result = await viaPublic(`${publicBase}/${coordString}?${params}`);
  if (result.ok) {
    const value: OsrmResult = { data: result.data, source: "public" };
    remember(key, value);
    lastFailure = null;
    return value;
  }
  lastFailure = result.failure ?? "unreachable";
  return null;
}

export async function fetchOsrmWithFailover(
  coordString: string,
  params: string = "overview=full&geometries=geojson"
): Promise<OsrmResult | null> {
  const key = `${coordString}?${params}`;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    lastFailure = null;
    return cached.value;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = resolveRoute(coordString, params).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

