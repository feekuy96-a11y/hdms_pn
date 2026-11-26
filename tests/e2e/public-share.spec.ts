import { expect, test } from "@playwright/test";
import { getPublicFloodShareUrl, readPublicFloodShareRef, resolvePublicFloodShare, sharePublicLink } from "../../components/public/public-share";

const ref = { kind: "event", id: "F-42" } as const;
const url = "https://public.example.test/hdms_pn/?flood=event%3AF-42";
const data = { title: "สถานการณ์ทางหลวง", url };

test("public site share strips current path, credentials and user state", () => {
  expect(getPublicFloodShareUrl("https://u:p@public.example.test/admin/?gps=sample#private", ref, "/hdms_pn")).toBe(url);
  expect(getPublicFloodShareUrl("https://public.example.test/admin/?gps=sample#private", ref, "")).toBe("https://public.example.test/?flood=event%3AF-42");
  expect(() => getPublicFloodShareUrl("file:///admin", ref)).toThrow();
  expect(readPublicFloodShareRef(new URL(url).search)).toEqual(ref);
  expect(readPublicFloodShareRef("?flood=event:one&flood=event:two")).toBe("invalid");
  expect(readPublicFloodShareRef("?flood=event:../")).toBe("invalid");
  expect(readPublicFloodShareRef("?flood=admin:one")).toBe("invalid");
});

test("native public share reports completion or cancellation without clipboard writes", async () => {
  const calls: string[] = [];
  const clipboard = { writeText: async (value: string) => { calls.push(value); } };
  expect(await sharePublicLink({ share: async (payload) => { expect(payload).toEqual(data); }, clipboard }, data)).toBe("shared");
  expect(await sharePublicLink({ share: async () => { throw new DOMException("Cancelled", "AbortError"); }, clipboard }, data)).toBe("cancelled");
  expect(calls).toEqual([]);
});

test("public share falls back to clipboard or read-only manual link", async () => {
  const calls: string[] = [];
  const clipboard = { writeText: async (value: string) => { calls.push(value); } };
  const share = async () => { throw new DOMException("Not allowed", "NotAllowedError"); };
  expect(await sharePublicLink({ clipboard }, data)).toBe("copied");
  expect(await sharePublicLink({ share, clipboard }, data)).toBe("copied");
  expect(await sharePublicLink({ share, canShare: () => false, clipboard }, data)).toBe("copied");
  expect(calls).toEqual([url, url, url]);
  expect(await sharePublicLink({ share, clipboard: { writeText: async () => { throw new Error("Denied"); } } }, data)).toBe("manual");
  expect(await sharePublicLink({}, data)).toBe("manual");
});


test("unknown or removed public event never falls back to another report", () => {
  const active = { id: "live-1", is_active: true } as import("../../db/default-data").FloodRoute;
  const inactive = { id: "off-1", is_active: false } as import("../../db/default-data").FloodRoute;
  const data = {
    floodRoutes: [inactive, active],
    eventSegments: [
      { flood_id: "off-1", event_id: "removed", segment_position: 1, event_direction: "BOTH" as const },
      { flood_id: "live-1", event_id: "published", segment_position: 2, event_direction: "BOTH" as const },
    ],
  };
  expect(resolvePublicFloodShare({ kind: "event", id: "published" }, data)).toEqual(active);
  expect(resolvePublicFloodShare({ kind: "event", id: "removed" }, data)).toBeUndefined();
  expect(resolvePublicFloodShare({ kind: "event", id: "unknown" }, data)).toBeUndefined();
  expect(resolvePublicFloodShare({ kind: "segment", id: "off-1" }, data)).toBeUndefined();
});

const base = process.env.BASE_PATH || "";
const positions = [[101.186, 6.881], [101.205, 6.892]];
const publicPayload = () => ({
  updatedAt: "2026-11-25T07:20:00.000Z",
  floodRoutes: ["route-first", "route-target", "route-withdrawn"].map((id, i) => ({
    id, route_no: String(i + 42), section_name: "ตัวอย่างน้ำท่วม " + id, km_start: "97+127", km_end: "97+252",
    lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: positions,
    water_level_cm: 30, traffic_status: "CLOSED", is_active: i < 2, updated_at: "2026-11-25T07:20:00.000Z",
  })),
  eventSegments: [
    { flood_id: "route-target", event_id: "publication-two", segment_position: 1, event_direction: "BOTH" },
    { flood_id: "route-withdrawn", event_id: "publication-withdrawn", segment_position: 1, event_direction: "BOTH" },
  ],
  detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name: "ทดสอบระบบ", org: "แขวงทางหลวง", phone: "1586" },
});

test("share the exact public flood and open its dossier from the generated link", async ({ page }) => {
  await page.route("**/*", (route) => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: publicPayload() }));
  await page.addInitScript(() => {
    const store = { sent: "", mode: "native", copied: "" };
    Reflect.set(window, "testPublicShare", store);
    Object.defineProperty(navigator, "share", { configurable: true, value: async (d: ShareData) => {
      if (store.mode === "cancel") throw new DOMException("Cancelled", "AbortError");
      if (store.mode !== "native") throw new DOMException("Denied", "NotAllowedError");
      store.sent = d.url ?? "";
    } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => {
      if (store.mode === "manual") throw new DOMException("Denied", "NotAllowedError");
      store.copied = value;
    } } });
  });
  await page.goto(base + "/?flood=segment%3Aroute-target&gps=private#camera");
  const dialog = page.getByRole("dialog", { name: "รายละเอียดจุดน้ำท่วม ตัวอย่างน้ำท่วม route-target" });
  await expect(dialog).toBeVisible();
  const share = dialog.getByRole("button", { name: "แชร์เหตุการณ์น้ำท่วม" });
  await expect(share).toBeVisible();
  const rect = await share.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  await share.click();
  await expect(dialog.getByRole("status").filter({ hasText: "ส่งลิงก์ให้แอปที่เลือกแล้ว" })).toBeVisible();
  const sent = await page.evaluate(() => (Reflect.get(window, "testPublicShare") as { sent: string }).sent);
  expect(new URL(sent).search).toBe("?flood=event%3Apublication-two");
  expect(new URL(sent).hash).toBe("");
  await page.evaluate(() => { Reflect.get(window, "testPublicShare").mode = "cancel"; });
  await share.click();
  await expect(dialog.getByRole("status").filter({ hasText: "ยกเลิกการแชร์แล้ว" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "testPublicShare").copied)).toBe("");
  await page.evaluate(() => { Reflect.get(window, "testPublicShare").mode = "clipboard"; });
  await share.click();
  await expect(dialog.getByRole("status").filter({ hasText: "คัดลอกลิงก์แล้ว" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "testPublicShare").copied)).toBe(sent);
  await page.evaluate(() => { Reflect.get(window, "testPublicShare").mode = "manual"; });
  await share.click();
  const field = dialog.getByLabel("คัดลอกลิงก์เหตุการณ์ด้วยตนเอง");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(sent);
  await field.press("Escape");
  await expect(share).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.goto(sent);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog", { name: /route-first/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await page.reload();
  await expect(dialog).toBeHidden();
  expect(await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button").count()).toBeLessThanOrEqual(4);
});

test("the public map rejects withdrawn and unknown flood references without showing other events", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: publicPayload() }));
  for (const id of ["publication-withdrawn", "unknown"]) {
    await page.goto(base + "/?flood=" + encodeURIComponent("event:" + id));
    await expect(page.getByText("ไม่พบเหตุการณ์น้ำท่วมนี้ในรายงานสาธารณะล่าสุด", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).search).toBe("");
  }
});
