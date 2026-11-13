import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

const heapBytes = async (page: import("@playwright/test").Page) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const metrics = await session.send("Performance.getMetrics");
  await session.detach();
  return metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0;
};

test("repeated vertex dragging keeps the editor canvas stable", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Vertex dragging is a desktop workspace flow");
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
            properties: { route_no: "42", section_name: "ตอนทดสอบลากจุด", km_start: "0+000", km_end: "1+000", lanes: "4" },
            geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.26, 6.88], [101.32, 6.92]] },
          }] },
        }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบลากจุด" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
  const canvasCount = await page.locator(".leaflet-overlay-pane canvas").count();
  const initialHeap = await heapBytes(page);
  const undo = page.getByRole("button", { name: "ย้อนกลับ" });

  for (let move = 0; move < 12; move += 1) {
    const handle = page.locator(".doh-vertex-handle").nth(1);
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("ไม่พบตำแหน่งหมุดจุดดัดบนแผนที่");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 3, centerY + 2, { steps: 2 });
    await page.mouse.up();
    await expect(undo).toBeEnabled();
  }

  expect(await page.locator(".leaflet-overlay-pane canvas").count()).toBe(canvasCount);
  await testInfo.attach("gis-geometry-drag-performance.json", {
    body: JSON.stringify({ initialHeap, finalHeap: await heapBytes(page), canvasCount, dragCount: 12 }, null, 2),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
});
