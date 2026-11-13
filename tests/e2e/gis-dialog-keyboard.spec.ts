import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("GIS route dialogs contain focus and restore it after Escape", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "GIS table keyboard workflow uses desktop layout");
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
            properties: { route_no: "42", section_name: "ตอนทดสอบคีย์บอร์ด", km_start: "0+000", km_end: "1+000", lanes: "4" },
            geometry: { type: "LineString", coordinates: [[101.25, 6.87], [101.26, 6.88]] },
          }] },
        }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบคีย์บอร์ด" }).first();
  await expect(routeRow).toBeVisible();
  const settingsButton = routeRow.getByRole("button", { name: "ตั้งค่า" });
  await settingsButton.focus();
  await page.keyboard.press("Enter");
  const settings = page.getByRole("dialog", { name: "ตั้งค่าคุณสมบัติทางวิศวกรรม" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("button", { name: "บันทึกคุณสมบัติทางวิศวกรรม" })).toBeVisible();
  await settings.getByRole("button", { name: "บันทึกคุณสมบัติทางวิศวกรรม" }).focus();
  await page.keyboard.press("Tab");
  await expect(settings.getByRole("button", { name: "ปิดหน้าต่างแก้ไขคุณสมบัติ" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(settingsButton).toBeFocused();

  await routeRow.getByText("ตอนทดสอบคีย์บอร์ด").click();
  const details = page.getByRole("dialog", { name: "รายละเอียดสายทาง" });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "ลบ", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(details.getByRole("button", { name: "ปิดรายละเอียด" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
});
