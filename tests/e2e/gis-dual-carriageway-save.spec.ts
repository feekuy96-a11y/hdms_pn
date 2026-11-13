import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("dual-carriageway save persists both directional lines", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Dual-carriageway editing uses the desktop workspace");
  let savedPayload: any = null;
  const layer = {
    layer_id: "MAIN_HIGHWAY", layer_name: "ทางหลวงสายหลัก", is_visible: true, metadata: {},
    geojson_data: { type: "FeatureCollection", features: [{
      type: "Feature",
      properties: { route_no: "42", section_name: "ตอนทดสอบคันทางคู่", km_start: "0+000", km_end: "1+000", lanes: "4" },
      geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.32, 6.92]] },
    }] },
  };
  const payload = { updatedAt: "2026-11-13T00:00:00.000Z", floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null, systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" }, highwayLayers: [layer] };
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const request = JSON.parse(route.request().postData() || "{}");
    if (request.action === "updateHighwayLayerAction") {
      savedPayload = request.args[0];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("https://router.project-osrm.org/**", async (route) => {
    const reverse = route.request().url().includes("101.32,6.92;101.2,6.84");
    const coordinates = reverse
      ? [[101.32, 6.921], [101.26, 6.881], [101.20, 6.841]]
      : [[101.20, 6.84], [101.26, 6.88], [101.32, 6.92]];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ geometry: { coordinates } }] }) });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบคันทางคู่" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await page.getByLabel("โครงสร้างทางหลวงตามจริง").selectOption("DUAL_CARRIAGEWAY");
  await expect(page.getByLabel("ทิศทางลูกศรจราจรบนเส้น")).toBeDisabled();
  await page.getByRole("button", { name: "เกาะแนวถนน" }).click();
  await expect(page.getByText("แยก 2 คันทางจริง", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "บันทึกแนวถนน" }).click();
  await expect(page.getByText("บันทึกแนวถนนสำเร็จ", { exact: true })).toBeVisible();
  expect(savedPayload.geojsonData.features).toHaveLength(2);
  expect(savedPayload.geojsonData.features[0].properties.carriageway_type).toBe("DUAL_CARRIAGEWAY");
  expect(savedPayload.geojsonData.features[1].properties.section_name).toContain("ขากลับ B→A");
});
