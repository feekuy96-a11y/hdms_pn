import { expect, test } from "@playwright/test";

const menus = [
  ["จัดการระบบ", "ข้อมูลทั่วไปและเบอร์โทรฉุกเฉิน"],
  ["จัดการแผนที่", "จัดการแผนที่และรายงานเหตุการณ์"],
  ["รายการเหตุการณ์", "ทะเบียนเหตุการณ์น้ำท่วม"],
  ["รายการทางเลี่ยง", "เส้นทางเลี่ยงทั้งหมด"],
  ["โครงข่ายสายทาง", "นำเข้าโครงข่ายสายทางและกำหนดฟิลด์แสดงผล"],
  ["สไตล์เส้นทาง", "สตูดิโอปรับแต่งสไตล์เส้น"],
  ["โครงการผู้ว่าฯ", "แผนงานโครงการแก้ไขปัญหาน้ำท่วม"],
] as const;
const base = process.env.BASE_PATH || "";
const openMenu = async (page: import("@playwright/test").Page, menu: string) => {
  await page.getByRole("complementary").getByRole("button", { name: new RegExp(menu) }).click();
};

test("admin menus open real workspaces without UI errors", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Full menu audit is desktop-first; mobile smoke is covered separately");
  await page.goto(`${base}/admin/`);
  await expect(page).toHaveURL(/\/admin\/?$/);

  for (const [menu, landmark] of menus) {
    await openMenu(page, menu);
    await expect(page.getByText(landmark, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  }
});

test("highway specifications use kilometer posts, office data, and calculated distance", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Specification modal is covered in desktop layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "โครงข่ายสายทาง");
  await page.getByRole("button", { name: /เพิ่มสายทางใหม่/ }).click();
  await expect(page.getByText("กม.เริ่มต้น", { exact: true })).toBeVisible();
  await expect(page.getByText("กม.สิ้นสุด", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ระยะทางคำนวณอัตโนมัติ")).toHaveAttribute("readonly", "");

  await page.getByLabel("กม.เริ่มต้น").fill("1+020");
  await page.getByLabel("กม.สิ้นสุด").fill("69+759");
  await expect(page.getByLabel("ระยะทางคำนวณอัตโนมัติ")).toHaveValue("68.739");
  for (const lanes of ["2 ช่องจราจร", "3 ช่องจราจร", "4 ช่องจราจร", "6 ช่องจราจร", "8 ช่องจราจร"]) {
    await expect(page.locator("select").filter({ has: page.locator(`option[value="${lanes}"]`) })).toHaveCount(1);
  }
  for (const surface of ["AC.", "Conc.", "DST."]) await expect(page.locator(`option[value="${surface}"]`)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "บันทึกคุณสมบัติทางวิศวกรรม" })).toBeVisible();
});

test("route geometry editor opens with coordinate selection and export controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry editor is covered in desktop layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "โครงข่ายสายทาง");
  const editRoute = page.getByRole("button", { name: "แนวถนน", exact: true }).first();
  test.skip(await editRoute.count() === 0, "No imported highway geometry is currently available");
  await editRoute.click();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เกาะแนวถนน" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งออก GeoJSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งออก KML" })).toBeVisible();
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
    await openMenu(page, menu);
    await expect(page.getByText(control, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  }
});
