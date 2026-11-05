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
  await expect(page.getByTitle("ระบบจัดการข้อมูลหลังบ้าน Admin")).toBeVisible();
});

test("public search exposes a recoverable empty state", async ({ page }) => {
  await page.goto(`${base}/`);
  const mobileList = page.getByRole("button", { name: "ดูรายการสายทาง" });
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await expect(mobileList).toBeVisible();
    await mobileList.click();
  }
  const search = page.locator('input[placeholder*="ค้นหาสายทาง"]:visible').first();
  await search.fill("ไม่มีข้อมูลนี้");
  await expect(page.locator("p:visible, h4:visible").filter({ hasText: /ยังไม่มีรายงานจุดน้ำท่วม|ไม่พบจุดที่ตรงกับตัวกรอง/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).filter({ visible: true }).click();
  await expect(search).toHaveValue("");
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
    await page.getByRole("button", { name: "ดูรายการสายทาง" }).click();
  }

  await expect(page.getByRole("button", { name: /ทางเลี่ยงอิสระสายทดสอบ/ }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button").filter({ hasText: "ตอนบ้านดี - ปะลัส", visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/รถเล็กผ่านได้ ๑ ช่องทาง/).first()).toBeVisible();
  await expect(dialog.getByText("ทางเลี่ยงจุดน้ำท่วม ทล.42", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/อัปเดตล่าสุด:/)).toBeVisible();
});
