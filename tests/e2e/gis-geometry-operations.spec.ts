import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("freeform editor supports add, delete, split, join and multi-step undo redo", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry operations use the desktop workspace");
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
          geojson_data: { type: "FeatureCollection", features: [
            {
              type: "Feature",
              properties: { route_no: "42", section_name: "ตอนทดสอบจัดการจุด", km_start: "0+000", km_end: "1+000", lanes: "4" },
              geometry: { type: "LineString", coordinates: [[101.20, 6.84], [101.26, 6.88], [101.32, 6.92]] },
            },
            {
              type: "Feature",
              properties: { route_no: "43", section_name: "ตอนทดสอบเชื่อม", km_start: "1+000", km_end: "2+000", lanes: "4" },
              geometry: { type: "LineString", coordinates: [[101.32, 6.92], [101.38, 6.96]] },
            },
          ] },
        }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงข่ายสายทาง/ }).click();
  const routeRow = page.getByRole("row").filter({ hasText: "ตอนทดสอบจัดการจุด" }).first();
  await routeRow.getByRole("button", { name: "แนวถนน", exact: true }).click();
  await page.getByRole("button", { name: "วาด/แก้ไขอิสระ" }).click();
  const pointCount = (count: number) => page.getByText(`เส้นปัจจุบัน ${count} จุด`, { exact: false });
  const undo = page.getByRole("button", { name: "ย้อนกลับ" });
  const redo = page.getByRole("button", { name: "ทำซ้ำ" });
  await expect(pointCount(3)).toBeVisible();

  await page.locator(".doh-vertex-mid").first().click();
  await expect(pointCount(4)).toBeVisible();
  await undo.click();
  await expect(pointCount(3)).toBeVisible();
  await redo.click();
  await expect(pointCount(4)).toBeVisible();

  await page.getByRole("button", { name: "ลบจุด" }).click();
  await page.locator(".doh-vertex-handle").nth(1).click();
  await expect(pointCount(3)).toBeVisible();
  await undo.click();
  await expect(pointCount(4)).toBeVisible();
  await undo.click();
  await expect(pointCount(3)).toBeVisible();

  await page.getByRole("button", { name: "ตัดเส้น" }).click();
  await page.locator(".doh-vertex-handle").nth(1).click();
  await expect(page.getByText("ส่วนที่ 2 2 จุด", { exact: false })).toBeVisible();
  await undo.click();
  await expect(page.getByText("ส่วนที่ 2 2 จุด", { exact: false })).toHaveCount(0);
  await redo.click();
  await expect(page.getByText("ส่วนที่ 2 2 จุด", { exact: false })).toBeVisible();
  await undo.click();

  const joinSelect = page.getByLabel("เลือกสายทางที่จะเชื่อม");
  const joinOption = joinSelect.locator("option").filter({ hasText: "ทล.43 · ตอนทดสอบเชื่อม" });
  await expect(joinOption).toHaveCount(1);
  const joinValue = await joinOption.getAttribute("value");
  expect(joinValue).not.toBeNull();
  await joinSelect.selectOption(joinValue!);
  await page.getByRole("button", { name: "เชื่อมเส้น" }).click();
  await expect(page.getByText("รวมสายทางอื่น 1 เส้น", { exact: false })).toBeVisible();
  await undo.click();
  await expect(page.getByText("รวมสายทางอื่น 1 เส้น", { exact: false })).toHaveCount(0);
  await redo.click();
  await expect(page.getByText("รวมสายทางอื่น 1 เส้น", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toHaveCount(0);
});
