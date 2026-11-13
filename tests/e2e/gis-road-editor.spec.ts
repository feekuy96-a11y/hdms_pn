import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("road-snapped editor adds, recalculates and removes a map waypoint", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Road editor uses the desktop workspace");
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
            properties: { route_no: "42", section_name: "ตอนทดสอบเกาะถนน", km_start: "0+000", km_end: "1+000", lanes: "4" },
            geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.32, 6.92]] },
          }] },
        }],
      }),
    });
  });
  await page.route("https://router.project-osrm.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "Ok",
        routes: [{ geometry: { coordinates: [[101.20, 6.84], [101.26, 6.88], [101.32, 6.92]] } }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบเกาะถนน" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await expect(page.getByRole("button", { name: "เกาะแนวถนน" })).toBeVisible();

  await page.getByRole("button", { name: "เพิ่มจุดดัดแนวจากแผนที่" }).click();
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("ไม่พบแผนที่สำหรับเลือกจุดดัดแนว");
  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.5);

  const waypointList = page.getByLabel("รายการจุดดัดแนวถนน");
  await expect(waypointList).toBeVisible();
  await expect(waypointList.getByText("จุดดัดแนวถนน (1 จุด)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เกาะแนวถนน" }).click();
  await expect(page.getByRole("button", { name: "เกาะแนวถนน" })).toBeEnabled();
  await page.getByRole("button", { name: "ลบจุดดัดแนวถนนที่ 1" }).click();
  await expect(waypointList).toHaveCount(0);
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
});
