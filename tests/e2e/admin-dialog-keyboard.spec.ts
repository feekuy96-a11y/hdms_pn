import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("incident and detour edit dialogs keep keyboard focus", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Admin table workflow uses desktop layout");
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const updated_at = "2026-11-13T00:00:00.000Z";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      updatedAt: updated_at,
      floodRoutes: [{ id: "F-QA", route_no: "42", section_name: "ตอนทดสอบคีย์บอร์ด", km_start: "0+000", km_end: "1+000", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]], water_level_cm: 20, traffic_status: "WARNING", is_active: true, updated_at }],
      detourRoutes: [{ id: "D-QA", route_name: "ทางเลี่ยงทดสอบคีย์บอร์ด", flood_id_ref: "F-QA", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]], description: "ใช้ทางเลี่ยง", direction_mode: "FORWARD_ONLY", is_active: true, updated_at }],
      timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    }) });
  });

  await page.goto(`${base}/admin/`);
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: /รายการเหตุการณ์/ }).click();
  const quickUpdate = page.getByRole("button", { name: /อัปเดตด่วน/ }).first();
  await quickUpdate.focus();
  await page.keyboard.press("Enter");
  const incident = page.getByRole("dialog", { name: "อัปเดตระดับน้ำ" });
  await expect(incident).toBeVisible();
  await incident.getByRole("button", { name: "บันทึกการอัปเดต" }).focus();
  await page.keyboard.press("Tab");
  await expect(incident.getByRole("spinbutton").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(incident).toHaveCount(0);
  await expect(quickUpdate).toBeFocused();

  await sidebar.getByRole("button", { name: /รายการทางเลี่ยง/ }).click();
  const edit = page.getByRole("button", { name: "แก้ไข", exact: true }).first();
  await edit.focus();
  await page.keyboard.press("Enter");
  const detour = page.getByRole("dialog", { name: "แก้ไขข้อมูลเส้นทางเลี่ยง" });
  await expect(detour).toBeVisible();
  await detour.getByRole("button", { name: "บันทึกข้อมูล" }).focus();
  await page.keyboard.press("Tab");
  await expect(detour.getByRole("button", { name: "ปิดหน้าต่างแก้ไขเส้นทางเลี่ยง" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detour).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test("split and merge incident dialogs trap Tab and restore focus", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Admin incident workflow uses desktop layout");
  const updated_at = "2026-11-13T00:00:00.000Z";
  const flood = (id: string, km_start: string, km_end: string) => ({
    id, route_no: "42", section_name: "ตอนทดสอบแบ่งรวม", km_start, km_end,
    lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26,
    coordinates_json: [[101.25, 6.87], [101.26, 6.88]], water_level_cm: 20,
    traffic_status: "WARNING", is_active: true, updated_at,
  });
  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      updatedAt: updated_at,
      floodRoutes: [flood("F-SPLIT-1", "0+000", "1+000"), flood("F-SPLIT-2", "1+000", "2+000")],
      detourRoutes: [], timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    }) });
  });
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /รายการเหตุการณ์/ }).click();

  const splitButton = page.getByRole("button", { name: "แบ่งช่วง", exact: true }).first();
  await splitButton.focus();
  await page.keyboard.press("Enter");
  const split = page.getByRole("dialog", { name: "แบ่งช่วงกิโลเมตรน้ำท่วม" });
  await expect(split).toBeVisible();
  await split.getByRole("button", { name: "ยกเลิก" }).focus();
  await page.keyboard.press("Tab");
  await expect(split.getByRole("textbox").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(split).toHaveCount(0);
  await expect(splitButton).toBeFocused();

  const mergeButton = page.getByRole("button", { name: "รวมช่วง", exact: true }).first();
  await mergeButton.focus();
  await page.keyboard.press("Enter");
  const merge = page.getByRole("dialog", { name: "รวมช่วงกิโลเมตรน้ำท่วม" });
  await expect(merge).toBeVisible();
  await merge.getByRole("button", { name: "ยกเลิก" }).focus();
  await page.keyboard.press("Tab");
  await expect(merge.getByRole("button", { name: /เลือกรวม/ }).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(merge).toHaveCount(0);
  await expect(mergeButton).toBeFocused();
});

test("incident and detour details open and close with keyboard on desktop and mobile", async ({ page }) => {
  const updated_at = "2026-11-13T00:00:00.000Z";
  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      updatedAt: updated_at,
      floodRoutes: [{ id: "F-DETAIL", route_no: "42", section_name: "ตอนรายละเอียดทดสอบ", km_start: "0+000", km_end: "1+000", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]], water_level_cm: 20, traffic_status: "WARNING", is_active: true, updated_at }],
      detourRoutes: [{ id: "D-DETAIL", route_name: "ทางเลี่ยงรายละเอียดทดสอบ", flood_id_ref: "F-DETAIL", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]], description: "ใช้ทางเลี่ยง", direction_mode: "FORWARD_ONLY", is_active: true, updated_at }],
      timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    }) });
  });
  await page.goto(`${base}/admin/`);
  const menu = (label: string) => page.getByRole("button", { name: label, exact: true }).filter({ visible: true }).first();
  await menu("รายการเหตุการณ์").click();
  const detailButton = page.getByRole("button", { name: "รายละเอียด", exact: true }).first();
  await detailButton.focus();
  await page.keyboard.press("Enter");
  const incident = page.getByRole("dialog", { name: "รายละเอียดเหตุการณ์" });
  await expect(incident).toBeVisible();
  await incident.getByRole("button", { name: "ลบ", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(incident.getByRole("button", { name: "ปิดรายละเอียด" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(incident).toHaveCount(0);
  await expect(detailButton).toBeFocused();

  await menu("รายการทางเลี่ยง").click();
  const detourItem = (page.viewportSize()?.width ?? 1280) < 768
    ? page.getByRole("button", { name: "รายละเอียด", exact: true }).first()
    : page.getByText("ทางเลี่ยงรายละเอียดทดสอบ", { exact: true }).filter({ visible: true }).first();
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await detourItem.focus();
    await page.keyboard.press("Enter");
  } else {
    await detourItem.click();
  }
  const detour = page.getByRole("dialog", { name: "รายละเอียดเส้นทางเลี่ยง" });
  await expect(detour).toBeVisible();
  await detour.getByRole("button", { name: "ลบทางเลี่ยง" }).focus();
  await page.keyboard.press("Tab");
  await expect(detour.getByRole("button", { name: "ปิดรายละเอียด" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detour).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 1280) < 768) await expect(detourItem).toBeFocused();
});
