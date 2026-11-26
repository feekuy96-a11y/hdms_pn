import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
test.beforeEach(async ({ page }) => {
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: {
    floodRoutes: [], detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
  } }));
});

test("Layers opens and closes smoothly, remains inert during exit, and stays interruptible", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 320, height: 568 } : { width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/");
  const map = page.locator(".leaflet-container");
  await expect(map).toHaveCount(1);
  const mapNode = (await map.elementHandle())!;
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  const panel = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
  const wrapper = page.locator("[data-hdms-layers-open]");
  await expect(wrapper).toHaveCSS("transition-duration", "0.15s, 0.15s, 0s");
  await layers.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "รีเซ็ต", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(layers).toBeFocused();
  await expect(layers).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  await expect(wrapper).toHaveAttribute("inert", "");
  await layers.press("Enter");
  await layers.press("Enter");
  await layers.press("Enter");
  await expect(panel).toHaveCount(1);
  await expect(wrapper).toHaveCSS("opacity", "1");
  expect(await map.evaluate((element, original) => element === original && original.isConnected, mapNode)).toBe(true);
});

test("reduced motion disables public panel transitions and dismissal restores its trigger", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base + "/");
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  await layers.click();
  await expect(page.locator("[data-hdms-layers-open]")).toHaveCSS("transition-duration", "0s");
  await layers.click();
  const contact = isMobile ? page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "ติดต่อ", exact: true }) : page.locator("[data-citizen-contact-desktop]");
  await contact.click();
  await expect(page.locator(".citizen-office-sheet")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" })).toHaveCount(0);
  await expect(contact).toBeFocused();
});

test("admin uses the right map controls and the text-free desktop sidebar toggle", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto(base + "/admin/");
  if (isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
  const map = page.locator("[data-hdms-map]");
  const tools = map.getByRole("group", { name: "เครื่องมือแผนที่" });
  const layers = tools.getByRole("button", { name: "เลเยอร์", exact: true });
  const panel = map.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
  const controlNames = ["Zoom in", "Zoom out", "ตำแหน่งของฉัน", "เลเยอร์"];
  const buttons = tools.getByRole("button");
  await expect(buttons).toHaveCount(4);
  for (const [index, name] of controlNames.entries()) {
    await expect(buttons.nth(index)).toHaveAccessibleName(name);
    await expect(buttons.nth(index)).toHaveText("");
  }
  await expect.poll(async () => {
    const [mapBounds, toolbar] = await Promise.all([map.boundingBox(), tools.boundingBox()]);
    return mapBounds!.x + mapBounds!.width - (toolbar!.x + toolbar!.width);
  }).toBeLessThanOrEqual(14);
  await layers.click();
  await expect(panel).toBeVisible();
  const [mapBounds, toolbar, bounds] = await Promise.all([map.boundingBox(), tools.boundingBox(), panel.boundingBox()]);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(toolbar!.x);
  expect(bounds!.x).toBeGreaterThanOrEqual(mapBounds!.x);
  await panel.getByRole("button", { name: "รีเซ็ต", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(layers).toBeFocused();
  await expect(layers).toHaveAttribute("aria-expanded", "false");

  if (isMobile) {
    await page.getByRole("button", { name: "กลับไปส่วนกรอกฟอร์ม", exact: true }).click();
    await expect(tools).toBeHidden();
  } else {
    await page.getByRole("button", { name: "พับแผงควบคุม", exact: true }).click();
    const rail = page.getByRole("button", { name: /^(ขยาย|ย่อ)เมนู$/ });
    await expect(rail).toHaveText("");
    await rail.click();
    await expect(rail).toHaveText("");
    await expect(rail.locator("svg")).toHaveCount(1);
    await expect(page.getByText("ย่อแถบเมนูข้าง", { exact: true })).toHaveCount(0);
  }
});

test("the icon-only side panel toggle precedes the status row in both desktop maps", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop side panel; mobile retains its form and list navigation.");
  await page.setViewportSize({ width: 1440, height: 900 });
  const glyphs: Array<{ expanded: string | null; collapsed: string | null }> = [];
  for (const admin of [false, true]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + (admin ? "/admin/" : "/"));
    const map = page.locator("[data-hdms-map]");
    const toggle = map.locator("[data-hdms-map-pane-toggle]");
    const status = admin
      ? map.getByLabel("สรุปสถานการณ์และแถบควบคุมบนแผนที่")
      : map.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
    await expect(toggle).toHaveAccessibleName(admin ? "พับแผงควบคุม" : "ย่อรายการสายทาง");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText("");
    await expect(status).toBeVisible();
    const [mapBox, buttonBox, statusBox] = await Promise.all([map.boundingBox(), toggle.boundingBox(), status.boundingBox()]);
    expect(buttonBox!.x - mapBox!.x).toBeLessThanOrEqual(14);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThan(statusBox!.x);
    expect(Math.abs(buttonBox!.y - statusBox!.y)).toBeLessThanOrEqual(2);
    const expanded = await toggle.locator("svg").getAttribute("class");
    await toggle.press("Enter");
    await expect(toggle).toHaveAccessibleName(admin ? "เปิดแผงควบคุม" : "แสดงรายการสายทาง");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText("");
    await expect(toggle).toBeFocused();
    const collapsed = await toggle.locator("svg").getAttribute("class");
    expect(collapsed).not.toBe(expanded);
    glyphs.push({ expanded, collapsed });
    await page.setViewportSize({ width: 1023, height: 768 });
    await expect(toggle).toBeHidden();
    if (admin) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    await expect(map.getByRole("button", { name: "เลเยอร์", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toBeHidden();
    await expect(map.getByRole("button", { name: "เลเยอร์", exact: true })).toBeVisible();
  }
  expect(glyphs[0]).toEqual(glyphs[1]);
});
