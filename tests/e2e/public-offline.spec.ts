import { expect, test } from "@playwright/test";
import publicDisplayCopy from "../../config/public-display-copy.json";

const base = process.env.BASE_PATH || "";
const enabled = process.env.HDMS_TEST_PUBLIC_OFFLINE === "1";
const endpoint = [[101.186, 6.881], [101.205, 6.892]];
const stamp = "2026-11-25T07:20:00.000Z";
const payload = (suffix: string) => ({
  updatedAt: stamp,
  floodRoutes: [{
    id: "OFF-F", route_no: "43", section_name: `น้ำท่วมทดสอบ${suffix}`, km_start: "97+127", km_end: "97+252",
    lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: endpoint,
    water_level_cm: 30, traffic_status: "CLOSED", is_active: true, updated_at: stamp,
    reporter_name: "PRIVATE-OFFLINE-TEST", latest_photo_url: "/private-album", affected_lanes: ["ช่องซ้าย", "ไหล่ทางขวา"],
    direction_meta: { photos: [{ dataUrl: "/private-album" }], waterLevelKnown: true },
  }, { id: "PRIVATE-DRAFT", route_no: "42", section_name: "DRAFT", is_active: false }],
  detourRoutes: [],
  timelineUpdates: [{ reporter_name: "PRIVATE-TIMELINE" }],
  highwayLayers: [], mitigationProjects: [], mapStyles: null, offices: [{ id: "PRIVATE-OFFICE" }],
  systemSettings: { name: "ทดสอบออฟไลน์", org: "ข้อมูลจำลอง", phone: "1586" },
});

test("public service worker opens a warm offline reload and new tab with the same dated public snapshot", async ({ context, page, isMobile }, info) => {
  test.skip(!enabled, "Run against a build explicitly enabling NEXT_PUBLIC_HDMS_PUBLIC_OFFLINE=1.");
  test.setTimeout(90000);
  let connected = true;
  let suffix = "เดิม";
  await context.route("**/functions/v1/hdms-api*", (route) => connected
    ? route.fulfill({ json: payload(suffix) }) : route.abort("internetdisconnected"));
  await page.goto(base + "/");
  const map = page.locator(".leaflet-container").first();
  await expect(map).toBeVisible();
  const summary = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
  await expect(summary.getByRole("button", { name: "น้ำท่วม 1 จุด" })).toBeVisible();
  const indexName = `hdms-public-offline-index-v2:${base}/`;

  await expect.poll(() => page.evaluate(async (indexName) => {
    if (!navigator.serviceWorker?.controller?.scriptURL.endsWith("/sw-public-offline.js")) return false;
    const index = await caches.open(indexName);
    const pointer = await index.match(new URL(".hdms-offline-shell-index", location.href).href);
    if (!pointer) return false;
    const names = await pointer.json() as string[];
    const cache = await caches.open(names[0]);
    const entries = new Set((await cache.keys()).map((item) => item.url));
    const scriptUrls = performance.getEntriesByType("resource").map((item) => item.name)
      .filter(url => url.startsWith(location.origin) && /\/_next\/static\/[^?#]+\.(?:js|css)$/.test(url));
    return scriptUrls.length > 3 && scriptUrls.every(url => entries.has(url)) &&
      entries.has(location.origin + location.pathname);
  }, indexName), { timeout: 25000 }).toBe(true);

  const getSnapshot = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("hdms:public-display:v1:"));
    return key ? localStorage.getItem(key) : null;
  });
  const initial = (await getSnapshot())!;
  expect(initial).toContain("น้ำท่วมทดสอบเดิม");
  expect(initial).not.toMatch(/PRIVATE|private-album/);
  expect(initial).toContain("ช่องซ้าย, ไหล่ทางขวา");
  const cachedKeys = await page.evaluate(async indexName => {
    const index = await caches.open(indexName);
    const pointer = await index.match(new URL(".hdms-offline-shell-index", location.href).href);
    const names = await pointer!.json() as string[];
    return (await (await caches.open(names[0])).keys()).map(k => new URL(k.url).pathname);
  }, indexName);
  expect(cachedKeys.every(path => path === base + "/" || path.startsWith(base + "/_next/static/") ||
    path === base + "/data/highway-base-network.json" || path === base + "/route-simplify-worker.js")).toBe(true);

  connected = false;
  await context.setOffline(true);
  await page.reload();
  await expect(map).toBeVisible();
  const notice = page.getByText(/ข้อมูลที่บันทึกไว้เมื่อ .*ไม่ใช่สถานการณ์ปัจจุบัน/);
  await expect(notice).toBeVisible();
  const savedAt = JSON.parse(initial).fetchedAt as number;
  const expectedSavedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(savedAt);
  await expect(notice).toContainText(expectedSavedAt);
  await expect(summary.getByRole("button", { name: "น้ำท่วม 1 จุด" })).toBeVisible();
  expect(await getSnapshot()).toBe(initial);
  await page.screenshot({ path: info.outputPath("public-offline-snapshot.png"), animations: "disabled", scale: "css" });
  const floodList = page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true });
  const reportList = isMobile ? page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" }) : page.locator(".citizen-sidebar");
  if (isMobile) await floodList.click();
  await reportList.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  const dossier = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม.*เดิม/ });
  await expect(dossier.getByText(/ไม่ใช่สถานการณ์ปัจจุบัน/)).toContainText(expectedSavedAt);
  await dossier.getByRole("button", { name: "ปิดรายละเอียด" }).click();
  const other = await context.newPage();
  await other.goto(base + "/");
  await expect(other.locator(".leaflet-container").first()).toBeVisible();
  await expect(other.getByText(/ไม่ใช่สถานการณ์ปัจจุบัน/)).toBeVisible();
  await other.close();
  const admin = await context.newPage();
  await expect(admin.goto(base + "/admin/")).rejects.toThrow();
  await admin.close();

  // Not the "first-ever visit" promise: the shell is installed but its data is absent.
  const stash = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("hdms:public-display:v1:"))!;
    const data = localStorage.getItem(key)!; localStorage.removeItem(key); return { key, data };
  });
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: /ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ/ })).toBeVisible();
  await expect(page.getByText(publicDisplayCopy.emptyFloodReports, { exact: true })).toHaveCount(0);
  await expect(summary.getByRole("button", { name: /น้ำท่วม \d+ จุด/ })).toHaveCount(0);
  await page.evaluate(({ key, data }) => localStorage.setItem(key, data), stash);

  suffix = "ใหม่";
  connected = true;
  await context.setOffline(false);
  await page.reload();
  await expect.poll(getSnapshot, { timeout: 15000 }).toContain("น้ำท่วมทดสอบใหม่");
  await expect(notice).toBeHidden();
  if (isMobile) await floodList.click();
  await expect(reportList.getByText(/น้ำท่วมทดสอบใหม่/)).toBeVisible();
});

test("installed public worker without a cached shell shows an honest offline fallback", async ({ page, context }) => {
  test.skip(!enabled, "Requires the opt-in offline build.");
  await context.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: payload("ทดสอบ") }));
  await page.goto(base + "/");
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  await page.evaluate(async (name) => { await caches.delete(name); }, `hdms-public-offline-index-v2:${base}/`);
  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("heading", { name: "เปิดแผนที่ออฟไลน์ไม่ได้" })).toBeVisible();
});
