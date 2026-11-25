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
  const wrapper = page.locator("[data-citizen-layers-open]");
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
  await expect(page.locator("[data-citizen-layers-open]")).toHaveCSS("transition-duration", "0s");
  await layers.click();
  const contact = isMobile ? page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "ติดต่อ", exact: true }) : page.locator("[data-citizen-contact-desktop]");
  await contact.click();
  await expect(page.locator(".citizen-office-sheet")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" })).toHaveCount(0);
  await expect(contact).toBeFocused();
});
