import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

for (const admin of [false, true]) {
  test(`${admin ? "Admin" : "Public"} highway type hint is independent of layer and route list actions`, async ({ page, isMobile, baseURL }) => {
    await page.setViewportSize(isMobile ? { width: 320, height: 568 } : { width: 1440, height: 900 });
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({ json: {
      floodRoutes: [], detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [],
      systemSettings: { name: "แผนที่ทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586" },
    } }));
    await page.goto(base + (admin ? "/admin/" : "/"));
    if (admin && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const map = page.locator("[data-hdms-map]");
    const layers = map.getByRole("button", { name: "เลเยอร์", exact: true });
    await layers.click();
    const panel = map.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
    const primary = panel.getByRole("button", { name: "อธิบายสัญลักษณ์ทางหลวงสายหลัก" });
    const secondary = panel.getByRole("button", { name: "อธิบายสัญลักษณ์ทางหลวงสายรอง" });
    const checkbox = panel.getByRole("checkbox", { name: "ทางหลวงสายหลัก", exact: true });
    const initiallyChecked = await checkbox.isChecked();
    const hint = panel.locator("[data-highway-type-hint]").getByRole("tooltip");
    const routeList = map.getByRole("tooltip", { name: "รายชื่อทางหลวงสายหลัก", exact: true });

    if (isMobile) {
      await primary.tap();
      await expect(hint).toHaveText("ทางหลวงสายหลัก");
      const triggerBox = (await primary.boundingBox())!;
      const tooltipBox = (await hint.boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      expect(triggerBox.width).toBeGreaterThanOrEqual(44);
      expect(triggerBox.height).toBeGreaterThanOrEqual(44);
      expect(tooltipBox.x).toBeGreaterThanOrEqual(panelBox.x);
      expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
      await secondary.tap();
      await expect(hint).toHaveText("ทางหลวงสายรอง");
      await panel.getByText("แผนที่ฐาน", { exact: true }).tap();
      await expect(hint).toHaveCount(0);
    } else {
      await primary.hover();
      await expect(hint).toHaveText("ทางหลวงสายหลัก");
      await hint.hover();
      await expect(hint).toBeVisible();
      await layers.hover();
      await expect(hint).toHaveCount(0);
      const basemap = panel.getByRole("button", { name: "ดาวเทียม", exact: true });
      await basemap.focus();
      await page.keyboard.press("Tab");
      await expect(primary).toBeFocused();
      await expect(hint).toHaveText("ทางหลวงสายหลัก");
      await page.keyboard.press("Escape");
      await expect(hint).toHaveCount(0);
      await expect(primary).toBeFocused();
      await expect(panel).toBeVisible();
      await secondary.press("Enter");
      await expect(hint).toHaveText("ทางหลวงสายรอง");
      await secondary.press("Enter");
      await expect(hint).toHaveCount(0);
    }

    await expect(checkbox).toHaveJSProperty("checked", initiallyChecked);
    await expect(routeList).toHaveCount(0);
    await checkbox.setChecked(!initiallyChecked);
    await expect(checkbox).toHaveJSProperty("checked", !initiallyChecked);
    const info = panel.getByRole("button", { name: "ดูรายชื่อทางหลวงสายหลัก", exact: true });
    await info.click();
    await expect(routeList).toBeVisible();
    await expect(hint).toHaveCount(0);
  });
}
