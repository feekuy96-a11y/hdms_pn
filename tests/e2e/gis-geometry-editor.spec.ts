import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("freeform highway editor changes vertices without multiplying map canvases", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry editor controls use the desktop workspace");
  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt: "2026-11-13T00:00:00.000Z",
        floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
        highwayLayers: [{
          layer_id: "MAIN_HIGHWAY", layer_name: "ทางหลวงสายหลัก", is_visible: true, metadata: {},
          geojson_data: { type: "FeatureCollection", features: [{
            type: "Feature",
            properties: { route_no: "42", section_name: "ตอนทดสอบแก้แนว", km_start: "0+000", km_end: "1+000", lanes: "4" },
            geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.26, 6.88], [101.32, 6.92]] },
          }] },
        }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบแก้แนว" }).first();
  await expect(routeRow).toBeVisible();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toBeVisible();

  const canvasCount = await page.locator(".leaflet-overlay-pane canvas").count();
  expect(canvasCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
  await expect(page.locator(".doh-vertex-handle")).toHaveCount(3);
  await expect(page.locator(".doh-vertex-mid")).toHaveCount(2);
  await expect(page.getByText("เส้นปัจจุบัน 3 จุด", { exact: false })).toBeVisible();

  await page.locator(".doh-vertex-mid").first().click();
  await expect(page.getByText("เส้นปัจจุบัน 4 จุด", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "ย้อนกลับ" })).toBeEnabled();
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect(page.getByText("เส้นปัจจุบัน 3 จุด", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "ทำซ้ำ" })).toBeEnabled();
  await page.getByRole("button", { name: "ทำซ้ำ" }).click();
  await expect(page.getByText("เส้นปัจจุบัน 4 จุด", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "ลบจุด" }).click();
  await page.locator(".doh-vertex-handle").nth(1).click();
  await expect(page.getByText("เส้นปัจจุบัน 3 จุด", { exact: false })).toBeVisible();
  expect(await page.locator(".leaflet-overlay-pane canvas").count()).toBe(canvasCount);

  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toHaveCount(0);
});
