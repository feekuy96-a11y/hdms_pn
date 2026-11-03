import { expect, test } from "@playwright/test";

const menus = [
  ["จัดการระบบ", "ข้อมูลทั่วไปและเบอร์โทรฉุกเฉิน"],
  ["จัดการแผนที่", "จัดการแผนที่และรายงานเหตุการณ์"],
  ["รายการเหตุการณ์", "ทะเบียนเหตุการณ์น้ำท่วม"],
  ["รายการทางเลี่ยง", "เส้นทางเลี่ยงทั้งหมด"],
  ["โครงข่ายสายทาง", "นำเข้าโครงข่ายสายทาง GIS"],
  ["สไตล์เส้นทาง", "สตูดิโอปรับแต่งสไตล์เส้น"],
  ["โครงการผู้ว่าฯ", "แผนงานโครงการแก้ไขปัญหาน้ำท่วม"],
] as const;
const base = process.env.BASE_PATH || "";

test("admin menus open real workspaces without UI errors", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Full menu audit is desktop-first; mobile smoke is covered separately");
  await page.goto(`${base}/admin/`);
  await expect(page).toHaveURL(/\/admin\/?$/);

  for (const [menu, landmark] of menus) {
    await page.locator(`button[title="${menu}"]`).last().click();
    await expect(page.getByText(landmark, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  }
});

test("admin workspaces expose their primary controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Full menu audit is desktop-first; mobile smoke is covered separately");
  await page.goto(`${base}/admin/`);
  const checks = [
    ["จัดการระบบ", "บันทึกข้อมูลระบบ"],
    ["รายการเหตุการณ์", "เพิ่มเหตุการณ์"],
    ["รายการทางเลี่ยง", "วาดทางเลี่ยงใหม่บนแผนที่"],
    ["โครงข่ายสายทาง", "เลือกไฟล์โครงข่ายเส้นทางหลวง"],
    ["โครงการผู้ว่าฯ", "เพิ่มโครงการใหม่"],
  ] as const;

  for (const [menu, control] of checks) {
    await page.locator(`button[title="${menu}"]`).last().click();
    await expect(page.getByText(control, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  }
});
