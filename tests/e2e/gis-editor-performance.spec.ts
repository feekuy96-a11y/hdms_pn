import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const largeLine = Array.from({ length: 500 }, (_, index) => [101.21 + index * 0.00012, 6.84 + index * 0.00006]);

const heapBytes = async (page: import("@playwright/test").Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const metrics = await session.send("Performance.getMetrics");
  await session.detach();
  return metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0;
};

test("large highway editor caps visible handles and reuses the map canvas", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Large-line editor is a desktop workspace flow");
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
            properties: { route_no: "42", section_name: "ตอนทดสอบเส้นขนาดใหญ่", km_start: "0+000", km_end: "5+000", lanes: "4" },
            geometry: { type: "LineString", coordinates: largeLine },
          }] },
        }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบเส้นขนาดใหญ่" }).first();
  await expect(routeRow).toBeVisible();
  const editRoute = routeRow.getByRole("button", { name: "แนวถนน", exact: true });
  const canvasCount = await page.locator(".leaflet-overlay-pane canvas").count();
  expect(canvasCount).toBeGreaterThan(0);
  const baselineHeap = await heapBytes(page);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await editRoute.click();
    await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
    await expect(page.getByText("เส้นปัจจุบัน 500 จุด", { exact: false })).toBeVisible();
    const handles = await page.locator(".doh-vertex-handle").count();
    expect(handles).toBeGreaterThan(0);
    expect(handles).toBeLessThanOrEqual(400);
    expect(await page.locator(".leaflet-overlay-pane canvas").count()).toBe(canvasCount);
    await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toHaveCount(0);
  }

  await testInfo.attach("gis-editor-performance.json", {
    body: JSON.stringify({ baselineHeap, finalHeap: await heapBytes(page), canvasCount }, null, 2),
    contentType: "application/json",
  });
});
