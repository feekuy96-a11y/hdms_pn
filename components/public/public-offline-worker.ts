const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const scopePath = base + "/";
const workerPath = base + "/sw-public-offline.js";

function matchesPublicWorker(worker: ServiceWorker | null | undefined): worker is ServiceWorker {
  return worker?.scriptURL === window.location.origin + workerPath;
}

export function warmPublicOfflineShell(): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  let stopped = false;
  let timer: number | undefined;
  let attempts = 0;
  let lastSignature = "";

  function prime() {
    if (stopped || !navigator.onLine) return;
    const worker = navigator.serviceWorker.controller;
    // A complete public map proves that its dynamically loaded renderer also ran.
    if (!matchesPublicWorker(worker) || !document.querySelector(".leaflet-container")) {
      if (++attempts <= 15) schedule();
      return;
    }
    const urls = new Set(performance.getEntriesByType("resource").map((entry) => entry.name));
    for (const element of document.querySelectorAll("script[src],link[href]")) {
      const url = element.getAttribute("src") ?? element.getAttribute("href");
      if (url) urls.add(new URL(url, location.origin).href);
    }
    const firstParty = [...urls]
      .filter((name) => name.startsWith(window.location.origin + scopePath))
      .filter((name) => /\/_next\/static\/[^?#]+\.(?:js|css|woff2|woff|wasm)$/.test(name) ||
        name.endsWith("/data/highway-base-network.json") || name.endsWith("/route-simplify-worker.js"))
      .sort();
    const signature = firstParty.join("\n");
    if (!signature || signature === lastSignature) return;
    lastSignature = signature;
    worker.postMessage({ kind: "hdms-prime-public", urls: firstParty });
  }

  function schedule() {
    if (stopped || timer !== undefined) return;
    timer = window.setTimeout(() => { timer = undefined; prime(); }, 550);
  }

  function resume() {
    attempts = 0;
    lastSignature = "";
    schedule();
  }

  const observer = typeof PerformanceObserver === "function" ? new PerformanceObserver(schedule) : undefined;
  try { observer?.observe({ type: "resource", buffered: true }); } catch { /* unsupported resource observation */ }
  navigator.serviceWorker.addEventListener("controllerchange", resume);
  window.addEventListener("online", resume);

  void navigator.serviceWorker.register(workerPath, { scope: scopePath }).then(schedule)
    .catch(() => { /* Offline support is best-effort; never impede live maps. */ });

  return () => {
    stopped = true;
    observer?.disconnect();
    navigator.serviceWorker.removeEventListener("controllerchange", resume);
    window.removeEventListener("online", resume);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/** Only retire this opt-in worker/storage after a connected flag-off citizen page loads. */
export function retirePublicOfflineShell() {
  if (!navigator.onLine) return;
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistration(scopePath).then(async (registration) => {
      if (!registration || registration.scope !== window.location.origin + scopePath) return;
      const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
      if (workers.length && workers.every(matchesPublicWorker)) await registration.unregister();
    }).catch(() => { /* Never block the online app. */ });
  }
  if ("caches" in window) {
    const index = `hdms-public-offline-index-v2:${scopePath}`;
    const prefix = `hdms-public-offline-shell-v2:${scopePath}:`;
    void caches.keys().then((names) => Promise.all(names.filter((name) => name === index || name.startsWith(prefix))
      .map((name) => caches.delete(name)))).catch(() => {});
  }
  try { window.localStorage.removeItem(`hdms:public-display:v1:${base || "/"}`); } catch { /* storage unavailable */ }
}
