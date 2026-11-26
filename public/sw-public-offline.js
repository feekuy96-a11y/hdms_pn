/* Opt-in public shell. No admin, writes, API or third-party resources are cached. */
const home = new URL(self.registration.scope);
const indexName = `hdms-public-offline-index-v2:${home.pathname}`;
const generationPrefix = `hdms-public-offline-shell-v2:${home.pathname}:`;
const pointerKey = new URL(".hdms-offline-shell-index", home).href;
const MAX_ASSETS = 180;
const MAX_ITEM = 4 * 1024 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;
let commitQueue = Promise.resolve();

function isPublicPage(value) {
  if (!value) return false;
  const url = new URL(value, home);
  return url.origin === home.origin &&
    [home.pathname, home.pathname.replace(/\/$/, ""), home.pathname + "index.html"].includes(url.pathname);
}

function assetUrl(value) {
  if (typeof value !== "string") return null;
  const url = new URL(value, home);
  if (url.origin !== home.origin || url.search || url.hash || !url.pathname.startsWith(home.pathname)) return null;
  const path = url.pathname.slice(home.pathname.length);
  return /^_next\/static\/[\w./-]+\.(?:js|css|woff2|woff|wasm)$/.test(path) ||
    path === "data/highway-base-network.json" || path === "route-simplify-worker.js" ? url.href : null;
}

function shellReferences(html) {
  return [...new Set(Array.from(html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi), ([, value]) => assetUrl(value))
    .filter((url) => url && /\.(?:js|css)$/.test(url)))];
}

async function activeGenerations() {
  try {
    const index = await caches.open(indexName);
    const response = await index.match(pointerKey);
    const names = response ? await response.json() : [];
    return Array.isArray(names) ? names.filter((name) => typeof name === "string" && name.startsWith(generationPrefix)).slice(0, 2) : [];
  } catch { return []; }
}

async function lookupComplete(url) {
  const names = await activeGenerations();
  for (const name of names) {
    try {
      const hit = await (await caches.open(name)).match(url);
      if (hit) return hit;
    } catch { /* no cached response */ }
  }
  return null;
}

async function fetchPublicPage() {
  return fetch(home.href, { credentials: "omit", cache: "no-cache" });
}

async function boundedSize(response) {
  if (!response.body || Number(response.headers.get("content-length")) > MAX_ITEM) throw new Error("Missing or large asset");
  const stream = response.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      total += value.length;
      if (total > MAX_ITEM) throw new Error("Large asset");
    }
  } finally {
    if (total > MAX_ITEM) void stream.cancel().catch(() => {});
    stream.releaseLock();
  }
  if (!total) throw new Error("Empty asset");
  return total;
}

async function validatedAsset(url) {
  const immutable = new URL(url).pathname.startsWith(home.pathname + "_next/static/");
  const hit = immutable ? await lookupComplete(url) : null;
  const response = hit ?? await fetch(url, { credentials: "omit" });
  const mime = response.headers.get("content-type") ?? "";
  if (!response.ok || response.redirected || (/\.js$/.test(url) && !/javascript|ecmascript/.test(mime)) ||
    (/\.css$/.test(url) && !mime.includes("text/css")) || (/\.json$/.test(url) && !mime.includes("application/json"))) {
    throw new Error("Incomplete shell asset");
  }
  return response;
}

async function commitShell(observed) {
  const document = await fetchPublicPage();
  if (!document.ok || document.redirected || !document.headers.get("content-type")?.includes("text/html")) return;
  const htmlSize = await boundedSize(document.clone());
  const html = await document.clone().text();
  const required = shellReferences(html);
  // Client evidence must be from the currently served version, not an older open tab.
  if (!required.some((url) => url.endsWith(".js")) || !required.some((url) => url.endsWith(".css")) ||
    !required.every((url) => observed.includes(url))) return;
  const urls = [...new Set([...required, ...observed])].sort();
  if (urls.length > MAX_ASSETS) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html + "\n" + urls.join("\n")));
  const newName = generationPrefix + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const old = await activeGenerations();
  if (old[0] === newName) return;
  // A worker killed mid-copy can leave an uncommitted namespace. Only remove
  // inaccessible generations, never either index-referenced version.
  await Promise.all((await caches.keys()).filter((name) => name.startsWith(generationPrefix) && !old.includes(name))
    .map((name) => caches.delete(name)));
  const candidate = await caches.open(newName);
  let size = htmlSize;
  try {
    for (const url of urls) {
      const asset = await validatedAsset(url);
      size += await boundedSize(asset.clone());
      if (size > MAX_TOTAL) throw new Error("Shell exceeds storage budget");
      await candidate.put(url, asset);
    }
    await candidate.put(home.href, document);
    const index = await caches.open(indexName);
    // The document and every declared/observed dependency are present before this commit.
    const keep = [newName, ...old.filter((name) => name !== newName)].slice(0, 2);
    await index.put(pointerKey, new Response(JSON.stringify(keep), { headers: { "Content-Type": "application/json" } }));
    // Evict entire superseded generations only; never an active dependency.
    await Promise.all((await caches.keys()).filter((name) => name.startsWith(generationPrefix) && !keep.includes(name))
      .map((name) => caches.delete(name)));
  } catch {
    if (!old.includes(newName) && !(await activeGenerations()).includes(newName)) await caches.delete(newName);
  }
}

function offlinePage() {
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HDMS ออฟไลน์</title><main style="max-width:32rem;margin:12vh auto;padding:1rem;font:1.15rem/1.6 system-ui"><h1>เปิดแผนที่ออฟไลน์ไม่ได้</h1><p>เบราว์เซอร์นี้ยังไม่มีหน้าประชาชนที่บันทึกไว้ โปรดเชื่อมต่ออินเทอร์เน็ต แล้วเปิดเว็บไซต์อีกครั้งเพื่อเตรียมใช้งานออฟไลน์</p></main></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Retire only the two legacy HDMS-owned caches upon explicit opt-in, never on a flag-disabled build.
    await Promise.all(["hdms-gis-v2", "hdms-tiles-v2"].map((name) => caches.delete(name))).catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.kind !== "hdms-prime-public" || !isPublicPage(event.source?.url) || !Array.isArray(event.data.urls)) return;
  const observed = [...new Set(event.data.urls.slice(0, MAX_ASSETS + 1).map(assetUrl).filter(Boolean))];
  if (!observed.length || observed.length > MAX_ASSETS) return;
  commitQueue = commitQueue.then(() => commitShell(observed)).catch(() => {});
  event.waitUntil(commitQueue);
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  if (request.mode === "navigate" && isPublicPage(request.url)) {
    event.respondWith((async () => {
      try { return await fetchPublicPage(); }
      catch { return (await lookupComplete(home.href)) || offlinePage(); }
    })());
    return;
  }
  if (!event.clientId || !assetUrl(request.url)) return;
  event.respondWith((async () => {
    const client = await self.clients.get(event.clientId);
    if (!isPublicPage(client?.url)) return fetch(request);
    const immutable = new URL(request.url).pathname.startsWith(home.pathname + "_next/static/");
    if (immutable) return (await lookupComplete(request.url)) || fetch(request);
    try { return await fetch(request); }
    catch (error) { return (await lookupComplete(request.url)) || Promise.reject(error); }
  })());
});
