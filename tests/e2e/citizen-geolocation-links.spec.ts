import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const staffUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
const configuredStaffUrl = staffUrl?.startsWith("https://") ? staffUrl : undefined;
const mockPhone = "073-123456";
const apiPayload = {
  floodRoutes: [], detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: mockPhone },
};
test.beforeEach(async ({ page }) => {
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: apiPayload }));
});

test("public geolocation grant recenters and denial keeps the same map and zoom controls usable", async ({ page, context, isMobile }) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await context.grantPermissions(["geolocation"], { origin });
  await context.setGeolocation({ latitude: 6.88, longitude: 101.2 });
  await page.setViewportSize(isMobile ? { width: 320, height: 568 } : { width: 1440, height: 900 });
  await page.goto(base + "/");
  const map = page.locator(".leaflet-container");
  await expect(map).toHaveCount(1);
  const mapNode = (await map.elementHandle())!;
  const tools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const locate = tools.getByRole("button", { name: "ตำแหน่งของฉัน", exact: true });
  const debugOverlay = page.locator("[data-public-layer-opacities]");
  const zoom = () => debugOverlay.evaluate(node => JSON.parse(node.getAttribute("data-public-layer-opacities") || "{}").zoom as number);
  await locate.click();
  await expect(page.getByText("แสดงตำแหน่งของคุณแล้ว", { exact: true })).toBeVisible();
  await expect.poll(zoom).toBeGreaterThanOrEqual(14);
  const marker = map.locator('path[fill="#2563eb"][fill-opacity="0.95"]');
  await expect(marker).toHaveCount(1);
  await expect.poll(async () => {
    const mapRect = (await map.boundingBox())!;
    const markerRect = await marker.boundingBox();
    return markerRect !== null && Math.abs((mapRect.x + mapRect.width / 2) - (markerRect.x + markerRect.width / 2)) < 5 &&
      Math.abs((mapRect.y + mapRect.height / 2) - (markerRect.y + markerRect.height / 2)) < 5;
  }).toBe(true);

  // Chromium permission UI varies by headless platform: exercise the same browser API error callback without an OS prompt.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_success: unknown, fail: (error: { code: number; PERMISSION_DENIED: number }) => void) =>
        fail({ code: 1, PERMISSION_DENIED: 1 }),
    } });
  });
  await locate.click();
  await expect(page.getByText("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาเปิดสิทธิ์ในเบราว์เซอร์", { exact: true })).toBeVisible();
  await expect(locate).toBeEnabled();
  const before = await zoom();
  await tools.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(zoom).toBeLessThan(before);
  await expect(map).toHaveCount(1);
  expect(await map.evaluate((element, original) => element === original && original.isConnected, mapNode)).toBe(true);
});

test("configured public hotline and desktop staff destinations are valid links without launching them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + "/");
  await expect(page.getByRole("link", { name: `โทรสายด่วน ${mockPhone}` })).toHaveAttribute("href", `tel:${mockPhone}`);
  await expect(page.getByText(`ติดต่อศูนย์ความปลอดภัย: ${mockPhone}`, { exact: true })).toBeVisible();
  const staff = page.getByRole("link", { name: "สำหรับเจ้าหน้าที่", exact: true });
  if (configuredStaffUrl) await expect(staff).toHaveAttribute("href", configuredStaffUrl);
  else await expect(staff).toHaveCount(0);
});
