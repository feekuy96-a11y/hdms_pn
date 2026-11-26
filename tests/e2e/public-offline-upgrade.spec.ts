import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const optIn = process.env.HDMS_TEST_PUBLIC_OFFLINE === "1";
const disabledOutput = process.env.HDMS_TEST_OFFLINE_DISABLED_OUTPUT;
const indexName = `hdms-public-offline-index-v2:${base}/`;
type Release = "v1" | "v2";

async function serveVersionedShell(disabled?: string) {
  let release: Release = "v1";
  let corrupt = false;
  let useDisabled = false;
  let candidateReads = 0;
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname.slice(base.length));
      if (base && !url.pathname.startsWith(base + "/")) throw new Error("Wrong base");
      const marker = relative.match(/^\/_next\/static\/chunks\/hdms-release-(v1|v2)\.js$/);
      res.setHeader("Cache-Control", "no-store");
      if (marker) {
        if (marker[1] === "v2") candidateReads++;
        res.setHeader("Content-Type", "text/javascript");
        if (corrupt && marker[1] === "v2") {
          res.writeHead(503); res.end(""); return;
        }
        res.end(`window.__HDMS_TEST_RELEASE__=${JSON.stringify(marker[1])};`);
        return;
      }
      const root = resolve(useDisabled && disabled ? disabled : "out");
      let file = resolve(root, "." + relative);
      if (file !== root && !file.startsWith(root + sep)) throw new Error("Unsafe path");
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
      const bytes = await readFile(file);
      res.end(filepathIsRoot(file, root) ?
        bytes.toString("utf8").replace("<head>", `<head><script defer src="${base}/_next/static/chunks/hdms-release-${release}.js"></script>`) : bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture HTTP address missing");
  return {
    baseUrl: `http://127.0.0.1:${address.port}${base}/`,
    setRelease: (value: Release, interrupted = false) => { release = value; corrupt = interrupted; },
    setFlagOff: (value: boolean) => { useDisabled = value; },
    candidateReads: () => candidateReads,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

function filepathIsRoot(file: string, root: string): boolean {
  return file === resolve(root, "index.html");
}

function generation(page: Page) {
  return page.evaluate(async (name) => {
    if (!(await caches.keys()).includes(name)) return null;
    const pointer = await (await caches.open(name)).match(new URL(".hdms-offline-shell-index", location.href).href);
    return pointer ? (await pointer.json() as string[])[0] : null;
  }, indexName);
}

function marker(page: Page) {
  return page.evaluate(() => Reflect.get(window, "__HDMS_TEST_RELEASE__") as string | undefined);
}

test("an interrupted real public shell update keeps last complete assets, then promotes after reconnect", async ({ page, context }) => {
  test.skip(!optIn, "Requires the opt-in offline build.");
  test.setTimeout(90000);
  let online = true;
  await context.route("**/functions/v1/hdms-api*", (route) => online
    ? route.fulfill({ json: { floodRoutes: [], detourRoutes: [], timelineUpdates: [], highwayLayers: [], mitigationProjects: [] } })
    : route.abort("internetdisconnected"));
  const fixture = await serveVersionedShell();
  try {
    await page.goto(fixture.baseUrl);
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(() => generation(page), { timeout: 30000 }).not.toBeNull();
    const goodV1 = await generation(page);
    expect(await marker(page)).toBe("v1");

    fixture.setRelease("v2", true);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(fixture.candidateReads, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    expect(await marker(page)).toBeUndefined();
    expect(await generation(page)).toBe(goodV1);

    online = false;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    expect(await marker(page)).toBe("v1");
    expect(await generation(page)).toBe(goodV1);

    fixture.setRelease("v2");
    online = true;
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(() => marker(page)).toBe("v2");
    await expect.poll(() => generation(page), { timeout: 30000 }).not.toBe(goodV1);
    const goodV2 = await generation(page);
    expect(goodV2).not.toBeNull();
    expect(await page.evaluate(async name => (await caches.keys()).includes(name!), goodV1)).toBe(true);

    online = false;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    expect(await marker(page)).toBe("v2");
    expect(await generation(page)).toBe(goodV2);
  } finally { await fixture.close(); }
});

test("flag-off build preserves a legacy registration and retires only its prior opt-in worker on reconnect", async ({ context, page }) => {
  test.skip(!optIn || !disabledOutput, "Also build with the flag off and pass HDMS_TEST_OFFLINE_DISABLED_OUTPUT.");
  test.setTimeout(90000);
  const fixture = await serveVersionedShell(disabledOutput);
  await context.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: {
    floodRoutes: [], detourRoutes: [], timelineUpdates: [], highwayLayers: [], mitigationProjects: [],
  } }));
  try {
    fixture.setFlagOff(true);
    await page.goto(fixture.baseUrl);
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await page.evaluate(async (base) => { await navigator.serviceWorker.register(base + "/sw.js"); }, base);
    const script = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null);
    await expect.poll(script).toMatch(/\/sw\.js$/);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(script).toMatch(/\/sw\.js$/);
    expect(await generation(page)).toBeNull();
    await page.evaluate(async () => { await caches.open("unrelated-test-cache"); localStorage.setItem("unrelated-test-data", "kept"); });

    fixture.setFlagOff(false);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(script).toMatch(/\/sw-public-offline\.js$/);
    await expect.poll(() => generation(page), { timeout: 30000 }).not.toBeNull();

    fixture.setFlagOff(true);
    await page.reload();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect.poll(script).toBeNull();
    await expect.poll(() => generation(page)).toBeNull();
    expect(await page.evaluate(async () => ({
      kept: localStorage.getItem("unrelated-test-data"),
      cache: (await caches.keys()).includes("unrelated-test-cache"),
      snapshot: Object.keys(localStorage).some((key) => key.startsWith("hdms:public-display:v1:")),
    }))).toEqual({ kept: "kept", cache: true, snapshot: false });

    const next = await context.newPage();
    await page.close();
    await context.setOffline(true);
    await expect(next.goto(fixture.baseUrl)).rejects.toThrow();
    await next.close();
  } finally { await fixture.close(); }
});
