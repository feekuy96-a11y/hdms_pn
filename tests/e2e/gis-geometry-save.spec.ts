import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const initialLayer = {
  layer_id: "MAIN_HIGHWAY", layer_name: "ทางหลวงสายหลัก", is_visible: true, metadata: {},
  geojson_data: { type: "FeatureCollection", features: [{
    type: "Feature",
    properties: { route_no: "42", section_name: "ตอนทดสอบบันทึกแนว", km_start: "0+000", km_end: "1+000", lanes: "4" },
    geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.32, 6.92]] },
  }] },
};

const systemPayload = (layer = initialLayer) => ({
  updatedAt: "2026-11-13T00:00:00.000Z",
  floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
  highwayLayers: [layer],
});

const openFreeformEditor = async (page: import("@playwright/test").Page) => {
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบบันทึกแนว" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
  await page.locator(".doh-vertex-mid").click();
  await expect(page.getByText("เส้นปัจจุบัน 3 จุด", { exact: false })).toBeVisible();
};

test("saving edited geometry sends the full layer and reloads the returned geometry", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry save workflow uses the desktop workspace");
  let savedLayer = initialLayer;
  let writePayload: any = null;
  let readCount = 0;
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const request = JSON.parse(route.request().postData() || "{}");
    if (request.action === "updateHighwayLayerAction") {
      writePayload = request;
      savedLayer = { ...initialLayer, geojson_data: request.args[0].geojsonData };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    readCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(systemPayload(savedLayer)) });
  });

  await openFreeformEditor(page);
  const readsBeforeSave = readCount;
  await page.getByRole("button", { name: "บันทึกแนวถนน" }).click();
  await expect(page.getByRole("dialog").getByText("บันทึกแนวถนนสำเร็จ", { exact: true })).toBeVisible();
  expect(writePayload).not.toBeNull();
  expect(writePayload.light).toBe(true);
  expect(writePayload.args[0].layerId).toBe("MAIN_HIGHWAY");
  expect(writePayload.args[0].geojsonData.features[0].geometry.coordinates).toHaveLength(3);
  await expect.poll(() => readCount).toBeGreaterThan(readsBeforeSave);
  await page.getByRole("button", { name: "ตกลง", exact: true }).click();

  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบบันทึกแนว" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
  await expect(page.getByText("เส้นปัจจุบัน 3 จุด", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
});

test("failed geometry save leaves the editor open and shows the server error", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry save workflow uses the desktop workspace");
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const request = JSON.parse(route.request().postData() || "{}");
    if (request.action === "updateHighwayLayerAction") {
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "แนวเส้นทดสอบไม่ถูกต้อง" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(systemPayload()) });
  });

  await openFreeformEditor(page);
  await page.getByRole("button", { name: "บันทึกแนวถนน" }).click();
  await expect(page.getByText("บันทึกแนวถนนไม่สำเร็จ: แนวเส้นทดสอบไม่ถูกต้อง", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
});
