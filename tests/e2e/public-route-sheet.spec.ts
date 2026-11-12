import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("citizen route sheet filters floods and detours and returns from details without stacking sheets", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Citizen sheet is a mobile-only view");
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const updatedAt = "2026-11-11T03:00:00.000Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [{
          id: "F-42", route_no: "42", section_name: "ทดสอบจุดน้ำท่วม ทล.42",
          km_start: "1+000", km_end: "1+200", lat_start: 6.87, lon_start: 101.25,
          lat_end: 6.88, lon_end: 101.27, coordinates_json: [[101.25, 6.87], [101.27, 6.88]],
          water_level_cm: 30, traffic_status: "WARNING", direction_meta: {},
          latest_photo_url: "", is_active: true, updated_at: updatedAt,
        }],
        detourRoutes: [{
          id: "D-42", flood_id_ref: "F-42",
          route_name: "เส้นทางเลี่ยง ทล.42 ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่โดยไม่หายไป",
          description: "1. เริ่มจากทางแยก ทล.42\n2. เลี้ยวเข้าถนนท้องถิ่น",
          direction_mode: "FORWARD_ONLY", is_active: true, updated_at: updatedAt,
          lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.27,
          coordinates_json: [[101.25, 6.87], [101.27, 6.88]],
        }],
        timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [],
        mapStyles: null, systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);
  await page.getByRole("button", { name: "ดูรายการสายทาง" }).click();
  const list = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading", { name: "สถานการณ์ทางหลวง" })).toBeVisible();
  await list.getByLabel("สายทาง", { exact: true }).selectOption("42");
  await list.getByRole("button", { name: /ทางเลี่ยง \(1\)/ }).click();
  const detour = list.getByRole("button", { name: /ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่/ });
  await expect(detour).toBeVisible();
  await detour.click();
  const detail = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(detail).toBeVisible();
  await expect(list).toHaveCount(0);
  await expect(detail.getByRole("heading", { name: /ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่/ })).toBeVisible();
  await expect(detail.getByRole("button", { name: /ขาไป.*A.*B/ })).toBeEnabled();
  await expect(detail.getByRole("button", { name: /ขากลับ.*B.*A/ })).toBeDisabled();
  await expect(detail.getByText("เริ่มจากทางแยก ทล.42")).toBeVisible();
  await detail.getByRole("button", { name: "ปิดหน้าต่างคำแนะนำทางเลี่ยง" }).click();
  await expect(detail).toHaveCount(0);
  await expect(list).toBeVisible();
  await expect(list.getByLabel("สายทาง", { exact: true })).toHaveValue("42");
  await list.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await expect(list).toHaveCount(0);
});
