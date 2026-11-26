import { expect, test } from "@playwright/test";
const base = process.env.BASE_PATH || "";

test("public flood map loads without horizontal overflow", async ({ page }) => {
  await page.goto(`${base}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ทางหลวง");
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await page.locator(".leaflet-container").boundingBox())?.height ?? 0).toBeGreaterThan(400);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("admin route opens directly", async ({ page }) => {
  await page.goto(`${base}/admin/`);
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("public search exposes a recoverable empty state", async ({ page }) => {
  await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({
    json: {
      updatedAt: "2026-11-25T07:20:00.000Z",
      floodRoutes: [{
        id: "F-SEARCH-43", route_no: "43", section_name: "หนองจิก ทดสอบค้นหา",
        km_start: "97+100", km_end: "97+200", lat_start: 6.88, lon_start: 101.19,
        lat_end: 6.89, lon_end: 101.20, coordinates_json: [[101.19, 6.88], [101.20, 6.89]],
        water_level_cm: 20, traffic_status: "CLOSED", is_active: true, updated_at: "2026-11-25T07:20:00.000Z",
      }], detourRoutes: [], timelineUpdates: [], mitigationProjects: [],
      highwayLayers: [], offices: [], mapStyles: null, systemSettings: null,
    },
  }));
  await page.goto(`${base}/`);
  const mobileList = page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true });
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await expect(mobileList).toBeVisible();
    await mobileList.click();
  }
  const search = page.locator('input[placeholder*="ค้นหาสายทาง"]:visible').first();
  const incident = page.locator("article:visible").filter({ hasText: "หนองจิก ทดสอบค้นหา" });
  await expect(incident).toBeVisible();
  await search.fill("ไม่มีข้อมูลนี้");
  await expect(incident).toHaveCount(0);
  await expect(page.getByText(/ไม่พบจุดที่ตรงกับตัวกรอง/).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).filter({ visible: true }).click();
  await expect(search).toHaveValue("");
  await expect(incident).toBeVisible();
});

test("public incident details group linked detours and keep standalone detours searchable", async ({ page }) => {
  const updatedAt = "2026-11-05T08:30:00.000Z";
  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [{
          id: "F-TEST-42",
          route_no: "42",
          section_name: "ตอนบ้านดี - ปะลัส",
          km_start: "105+152",
          km_end: "109+152",
          lat_start: 6.87,
          lon_start: 101.25,
          lat_end: 6.88,
          lon_end: 101.27,
          coordinates_json: [[101.25, 6.87], [101.27, 6.88]],
          water_level_cm: 35,
          traffic_status: "ONE_LANE",
          latest_photo_url: "",
          is_active: true,
          updated_at: updatedAt,
          district: "ปะนาเระ",
          subdistrict: "บ้านดี",
          trend: "STEADY",
          detour_advice: "ทิศทางขาไป: ใช้ถนนท้องถิ่น\nทิศทางขากลับ: ใช้เส้นทางเดิมย้อนกลับ",
        }],
        detourRoutes: [
          { id: "D-LINKED", flood_id_ref: "F-TEST-42", route_name: "ทางเลี่ยงจุดน้ำท่วม ทล.42", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.27, coordinates_json: [[101.25, 6.87], [101.27, 6.88]], description: "เลี่ยงผ่านถนนท้องถิ่น", is_active: true, updated_at: updatedAt },
          { id: "D-STANDALONE", flood_id_ref: null, route_name: "ทางเลี่ยงอิสระสายทดสอบ", lat_start: 6.9, lon_start: 101.3, lat_end: 6.91, lon_end: 101.31, coordinates_json: [[101.3, 6.9], [101.31, 6.91]], description: "เปิดดูได้โดยไม่ผูกจุดน้ำท่วม", is_active: true, updated_at: updatedAt },
        ],
        timelineUpdates: [],
        mitigationProjects: [],
        highwayLayers: [],
        offices: [],
        mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", desc: "", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  }

  await expect(page.getByRole("button", { name: /เลเยอร์/, exact: true })).toBeVisible();
  await expect(page.locator(".doh-map-capsule-pin").first()).toBeVisible();
  await expect(page.locator(".doh-map-capsule-pin .doh-type-flood-wave svg").first()).toHaveCSS("stroke", "rgb(255, 255, 255)");
  await expect(page.locator(".doh-detour-symbol").first()).toBeVisible();

  await page.getByRole("button", { name: /ทางเลี่ยง \(/ }).filter({ visible: true }).first().click();
  await expect(page.locator(".doh-map-capsule-pin").first()).toBeVisible();
  await expect(page.locator(".doh-detour-symbol").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /ทางเลี่ยงอิสระสายทดสอบ/ }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /น้ำท่วม \(/ }).filter({ visible: true }).first().click();
  await page.getByRole("button").filter({ hasText: "ตอนบ้านดี - ปะลัส", visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/รถเล็กผ่านได้ ๑ ช่องทาง/).first()).toBeVisible();
  await expect(dialog.getByText("ทางเลี่ยงจุดน้ำท่วม ทล.42", { exact: true })).toBeVisible();
  const recordedUpdate = dialog.getByRole("group", { name: "ช่วงถนน พื้นที่ และเวลาอัปเดต" }).locator("time");
  await expect(recordedUpdate).toBeVisible();
  await expect(recordedUpdate).toHaveAttribute("datetime", updatedAt);
});
