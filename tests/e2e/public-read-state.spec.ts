import { expect, test, type Page } from "@playwright/test";
import publicDisplayCopy from "../../config/public-display-copy.json";

const base = process.env.BASE_PATH || "";
const empty = {
  updatedAt: "2026-11-26T02:09:01Z",
  floodRoutes: [], detourRoutes: [], highwayLayers: [], timelineUpdates: [],
  mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
};
const row = {
  id: "F-1", route_no: "43", section_name: "ช่วงทดสอบสถานะข้อมูล", is_active: true,
  traffic_status: "WARNING", water_level_cm: 15, updated_at: "2026-11-24T08:50:00Z",
  km_start: "0+000", km_end: "0+100", lat_start: 6.87, lon_start: 101.25,
  lat_end: 6.871, lon_end: 101.251, coordinates_json: [[101.25, 6.87], [101.251, 6.871]],
};
const messages = {
  loading: "กำลังโหลดข้อมูลสถานการณ์ล่าสุด…",
  unavailable: "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง",
  stale: "อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลจากการโหลดครั้งก่อน",
  empty: publicDisplayCopy.emptyFloodReports,
  fresh: /มีข้อมูลสถานการณ์อัปเดตล่าสุดจากศูนย์ปฏิบัติการ/,
};
async function resultsPanel(page: Page, isMobile: boolean) {
  if (!isMobile) return page.locator(".citizen-sidebar");
  await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  return page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
}
async function refresh(page: Page) {
  // Exercise React Query's real reconnect refetch without changing the browser network.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
}

test("pending and failed public reads never present a confirmed empty list; retry can confirm zero reports", async ({ page, isMobile }) => {
  test.setTimeout(40_000);
  let mode: "held" | "fail" | "empty" = "held";
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/functions/v1/hdms-api", async route => {
    if (mode === "held") await gate;
    if (mode === "fail") await route.fulfill({ status: 503, json: { error: "fixture read unavailable" } });
    else await route.fulfill({ json: empty });
  });
  await page.goto(base + "/");
  const panel = await resultsPanel(page, isMobile);
  const summary = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
  try {
    await expect(panel.getByText(messages.loading, { exact: true })).toBeVisible();
    await expect(page.getByText(messages.empty, { exact: true })).toHaveCount(0);
    await expect(summary.getByRole("button", { name: "น้ำท่วม 0 จุด", exact: true, includeHidden: true })).toHaveCount(0);
  } finally {
    mode = "fail";
    release();
  }
  await expect(panel.getByText(messages.unavailable, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(messages.empty, { exact: true })).toHaveCount(0);
  mode = "empty";
  const retry = isMobile
    ? panel.getByRole("button", { name: /โหลดข้อมูลล่าสุดไม่สำเร็จ/ })
    : page.getByRole("alert").getByRole("button", { name: "ลองอีกครั้ง" });
  await retry.click();
  await expect(panel.getByText(messages.empty, { exact: true })).toBeVisible();
  if (isMobile) await panel.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await expect(summary.getByRole("button", { name: "น้ำท่วม 0 จุด", exact: true })).toBeVisible();
  await expect(page.getByText(messages.fresh)).toHaveCount(0);
});

test("identical and reordered reports stay quiet; failed refresh preserves records and actual change notifies", async ({ page, isMobile }) => {
  test.setTimeout(45_000);
  const second = { ...row, id: "F-2", section_name: "ช่วงประกอบ" };
  let payload = { ...empty, floodRoutes: [row, second] };
  let fail = false;
  let calls = 0;
  await page.route("**/functions/v1/hdms-api", async route => {
    calls++;
    if (fail) await route.fulfill({ status: 503, json: { error: "fixture refresh unavailable" } });
    else await route.fulfill({ json: payload });
  });
  await page.goto(base + "/");
  const panel = await resultsPanel(page, isMobile);
  await expect(panel.locator(".citizen-card")).toHaveCount(2);
  await expect(panel.getByText(/เวลาอัปเดตรายงานล่าสุด/)).toBeVisible();
  await expect(panel.getByText(/ดึงข้อมูลสำเร็จล่าสุด/)).toBeVisible();
  await expect(page.getByText(messages.fresh)).toHaveCount(0);

  payload = { ...payload, updatedAt: "2026-11-26T02:09:04Z", floodRoutes: [second, row] };
  const sameResponse = page.waitForResponse(r => r.url().endsWith("/functions/v1/hdms-api") && r.ok());
  await refresh(page);
  await sameResponse;
  await expect(page.getByText(messages.fresh)).toHaveCount(0);

  fail = true;
  const beforeFailure = calls;
  await refresh(page);
  await expect.poll(() => calls).toBeGreaterThan(beforeFailure);
  await expect(panel.getByText(messages.stale, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator(".citizen-card")).toHaveCount(2);
  await expect(page.getByText(messages.empty, { exact: true })).toHaveCount(0);
  await expect(page.getByText(messages.fresh)).toHaveCount(0);

  fail = false;
  payload = { ...payload, floodRoutes: [second, { ...row, water_level_cm: 32 }] };
  if (isMobile) await panel.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await page.getByRole("alert").getByRole("button", { name: "ลองอีกครั้ง" }).click();
  await expect(page.getByText(messages.fresh)).toBeVisible();
  await expect(page.getByText(messages.stale, { exact: true })).toHaveCount(0);
});

test("unknown flood water is not treated as a confirmed zero on the public map", async ({ page, isMobile }) => {
  const cases = [
    { flags: { waterLevelKnown: false }, showsPin: true },
    { flags: { water_level_known: false }, showsPin: true },
    { flags: { waterLevelKnown: false, water_level_known: true }, showsPin: true },
    { flags: { waterLevelKnown: true, water_level_known: false }, showsPin: false },
    { flags: {}, showsPin: false },
  ];
  for (const [index, scenario] of cases.entries()) {
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({
      json: { ...empty, floodRoutes: [{ ...row, water_level_cm: 0, direction_meta: scenario.flags }] },
    }));
    await page.goto(base + "/");
    await expect(page.getByText("น้ำท่วม 1 จุด", { exact: true }).first()).toBeVisible();
    const pin = page.locator(".doh-map-capsule-pin");
    await expect(pin).toHaveCount(scenario.showsPin ? 1 : 0);
    if (index === 0) {
      await pin.press("Enter");
      const popup = page.locator(".doh-flood-leaflet-popup");
      await expect(popup).toContainText("รอตรวจสอบระดับน้ำ");
      await popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
      const focus = page.getByTestId("gis-focus-mode-bar");
      await expect(focus).toContainText("รอตรวจสอบระดับน้ำ");
      await expect(focus).not.toContainText("สถานการณ์คลี่คลายแล้ว");
    }
    if (isMobile && index === 2) {
      const list = await resultsPanel(page, isMobile);
      await expect(list).toContainText("รอตรวจสอบ");
    }
    await page.unroute("**/functions/v1/hdms-api");
  }
});
