import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("admin report and confirmation dialogs restore keyboard focus", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Admin sidebar keyboard workflow uses desktop layout");
  const updated_at = "2026-11-13T00:00:00.000Z";
  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      updatedAt: updated_at,
      floodRoutes: [{ id: "F-QA", route_no: "42", section_name: "ตอนทดสอบคีย์บอร์ด", km_start: "0+000", km_end: "1+000", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]], water_level_cm: 20, traffic_status: "WARNING", is_active: true, updated_at }],
      detourRoutes: [], timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    }) });
  });
  await page.goto(`${base}/admin/`);

  const print = page.getByRole("button", { name: "ออกรายงานเสนอผู้ว่าฯ (ด่วนที่สุด)" });
  await print.focus();
  await page.keyboard.press("Enter");
  const report = page.getByRole("dialog", { name: "แบบรายงานสถานการณ์อุทกภัย" });
  await expect(report).toBeVisible();
  await report.getByRole("button", { name: "ปิดแบบรายงาน" }).focus();
  await page.keyboard.press("Tab");
  await expect(report.getByRole("button", { name: /พิมพ์แบบรายงาน/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(report).toHaveCount(0);
  await expect(print).toBeFocused();

  await page.getByRole("complementary").getByRole("button", { name: /รายการเหตุการณ์/ }).click();
  const deleteButton = page.getByRole("button", { name: "ลบช่วงนี้ (กู้คืนได้)" }).first();
  await deleteButton.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "ยืนยันการลบจุดน้ำท่วม?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "ตกลง" }).focus();
  await page.keyboard.press("Tab");
  await expect(confirm.getByRole("button", { name: "ปิดหน้าต่าง" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(deleteButton).toBeFocused();
});
