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
  await expect(page.getByRole("button", { name: "คืนค่าแนวเดิม" })).toBeVisible();
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

test("route editor keeps A and B markers visible and permits a map bend point", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  const pointA = page.getByLabel("พิกัดจุด A");
  const pointB = page.getByLabel("พิกัดจุด B");
  await pointA.fill("6.8340, 101.1860");
  await pointA.blur();
  await pointB.fill("6.8390, 101.1920");
  await pointB.blur();
  await expect(page.locator(".doh-draft-endpoint")).toHaveCount(2);
  await page.getByRole("button", { name: /เพิ่มจุดดัดเส้น/ }).click();
  await expect(page.getByRole("button", { name: /คลิกถนนเพื่อดัด/ })).toBeVisible();
});

test("route editor lists and removes an individual bend point", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await page.getByLabel("พิกัดจุด A").fill("6.8340, 101.1860");
  await page.getByLabel("พิกัดจุด A").blur();
  await page.getByLabel("พิกัดจุด B").fill("6.8390, 101.1920");
  await page.getByLabel("พิกัดจุด B").blur();
  await page.getByRole("button", { name: "แตะจุดกลางเส้นเพื่อเพิ่มจุด" }).click();
  await expect(page.getByLabel("รายการจุดดัดเส้น")).toBeVisible();
  await page.getByRole("button", { name: "ลบจุดดัดที่ 1" }).click();
  await expect(page.getByLabel("รายการจุดดัดเส้น")).toHaveCount(0);
});

test("office markers unlock only while their record is being edited", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Office map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการระบบ");
  const editOffice = page.getByRole("button", { name: /แก้ไขสำนักงาน/ }).first();
  test.skip(await editOffice.count() === 0, "No office record is currently available");
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(0);
  await editOffice.click();
  await expect(page.getByText("หมุดของรายการนี้ปลดล็อกแล้ว", { exact: false })).toBeVisible();
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(1);
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(0);
});

test("map management exposes all approved traffic choices without color labels", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop sidebar navigation is covered here; mobile smoke is separate");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  for (const label of ["ผ่านได้ปกติ", "รถเล็กผ่านได้", "รถเล็กผ่านได้ ๑ ช่องทาง", "ผ่านไม่ได้"]) {
    await expect(page.getByRole("option", { name: label, exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: "เส้นน้ำท่วม", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ทางเลี่ยง", exact: true })).toBeVisible();
});

test("map workflows expose import, safe reset, and multi-format exports", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop administration workflow");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await expect(page.getByText("นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง", { exact: false })).toBeVisible();
  await expect(page.getByText("บันทึกเป็นฉบับร่าง (ยังไม่แสดงบนแผนที่ประชาชน)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ล้างข้อมูลทั้งหมด" })).toBeVisible();

  await openMenu(page, "รายการเหตุการณ์");
  await expect(page.getByLabel("ขอบเขตส่งออกเหตุการณ์")).toHaveValue("FILTERED");
  const incidentExport = page.getByLabel("รูปแบบส่งออกเหตุการณ์");
  for (const value of ["csv", "geojson", "kml", "kmz", "shapefile"]) await expect(incidentExport.locator(`option[value="${value}"]`)).toHaveCount(1);

  await openMenu(page, "รายการทางเลี่ยง");
  await expect(page.getByLabel("ขอบเขตส่งออกทางเลี่ยง")).toHaveValue("FILTERED");
  const detourExport = page.getByLabel("รูปแบบส่งออกทางเลี่ยง");
  for (const value of ["csv", "geojson", "kml", "kmz", "shapefile"]) await expect(detourExport.locator(`option[value="${value}"]`)).toHaveCount(1);
});

test("line styling accepts precise low-resource line widths and casing", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop style studio");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "สไตล์เส้นทาง");
  const weight = page.getByLabel("ความหนาเส้นเป็นพิกเซล");
  await weight.fill("0.1");
  await expect(weight).toHaveValue("0.1");
  await expect(page.getByText("เปิดเส้นขอบ (Stroke/Casing)", { exact: true })).toBeVisible();
});

test("incident and detour records use consistent symbols and detail controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop record layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "รายการเหตุการณ์");
  await expect(page.getByRole("heading", { name: "ทะเบียนเหตุการณ์น้ำท่วม" })).toBeVisible();
  await expect(page.locator('[title="จุดน้ำท่วม"]').first()).toBeVisible();

  await openMenu(page, "รายการทางเลี่ยง");
  const detourSymbol = page.locator('[title="เส้นทางเลี่ยง"]').first();
  if (await detourSymbol.count()) await expect(detourSymbol).toBeVisible();
  else await expect(page.getByText("ไม่พบรายการเส้นทางเลี่ยง", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /วาดทางเลี่ยงใหม่/ })).toBeVisible();
});
