import { expect, test, type Locator } from "@playwright/test";

async function contrast(text: Locator, surface: Locator) {
  const bg = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  return text.evaluate((el, background) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const color = (value: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const luminance = (x: number[]) => x.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(color(getComputedStyle(el).color)), b = luminance(color(background));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, bg);
}

for (const theme of ["ธีมสว่าง", "ธีมมืด"]) {
  test(`admin popup instructions have readable text in ${theme}`, async ({ page, baseURL, isMobile }) => {
    const origin = new URL(baseURL!).origin;
    const updated_at = "2026-11-27T00:00:00Z";
    const name = "ทางเลี่ยงทดสอบสีตัวอักษร";
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/functions/v1/hdms-api")) return url.origin === origin ? route.continue() : route.abort();
      return route.fulfill({ json: { updatedAt: updated_at, floodRoutes: [], timelineUpdates: [], mitigationProjects: [],
        highwayLayers: [], offices: [], mapStyles: null, systemSettings: { name: "ทดสอบ", org: "ทดสอบ" },
        detourRoutes: [{ id: "D-INK", route_name: name, flood_id_ref: "", lat_start: 6.87, lon_start: 101.25,
          lat_end: 6.88, lon_end: 101.26, coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
          description: "=== ทิศทางขาไป: จุด A → จุด B ===\n1. ตรงไปตามแนวเส้นที่ตรวจสอบแล้ว\n2. เลี้ยวซ้ายเข้าสู่ทางหลวงชนบท\n=== ทิศทางขากลับ: จุด B → จุด A ===\n1. ตรงไปตามขากลับที่ตรวจสอบแล้ว", direction_mode: "TWO_WAY", is_active: true, updated_at }] } });
    });
    await page.goto((process.env.BASE_PATH || "") + "/admin/");
    await page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ", exact: true }).click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page.getByRole("button", { name: /รายการทางเลี่ยง/ }).filter({ visible: true }).first().click();
    if (isMobile) await page.getByRole("button", { name: "รายละเอียด", exact: true }).first().click();
    else await page.getByRole("row").filter({ hasText: name }).click();
    const text = page.getByRole("dialog").getByText("ตรงไปตามแนวเส้นที่ตรวจสอบแล้ว", { exact: true });
    await expect(text).toBeVisible();
    const surface = text.locator("xpath=ancestor::div[contains(@class,'max-h-48')]");
    const ratio = await contrast(text, surface);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    const second = page.getByRole("dialog").getByText("เลี้ยวซ้ายเข้าสู่ทางหลวงชนบท", { exact: true });
    await expect(second).toBeVisible();
    expect(await contrast(second, surface)).toBeGreaterThanOrEqual(4.5);
    const backward = page.getByRole("dialog").getByRole("button", { name: /ขากลับ/ });
    await backward.click();
    const reverse = page.getByRole("dialog").getByText("ตรงไปตามขากลับที่ตรวจสอบแล้ว", { exact: true });
    await expect(reverse).toBeVisible();
    expect(await contrast(reverse, reverse.locator("xpath=ancestor::div[contains(@class,'max-h-48')]"))).toBeGreaterThanOrEqual(4.5);
    console.log(theme, ratio.toFixed(2));
  });
}

for (const audience of ["admin", "citizen"]) {
  test(`the shared flood popup has readable light-mode text on ${audience}`, async ({ page, baseURL, isMobile }) => {
    const origin = new URL(baseURL!).origin;
    const updated_at = "2026-11-27T00:00:00Z";
    await page.emulateMedia({ colorScheme: "light" });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/functions/v1/hdms-api")) return url.origin === origin ? route.continue() : route.abort();
      return route.fulfill({ json: { updatedAt: updated_at, timelineUpdates: [], mitigationProjects: [], highwayLayers: [],
        offices: [], mapStyles: null, systemSettings: { name: "ทดสอบ", org: "ทดสอบ" }, detourRoutes: [],
        floodRoutes: [{ id: "F-INK", route_no: "418", section_name: "งาแม่ - ยุโป", km_start: "3+800", km_end: "5+900",
          lat_start: 6.823, lon_start: 101.231, lat_end: 6.828, lon_end: 101.241,
          coordinates_json: [[101.231, 6.823], [101.241, 6.828]], water_level_cm: 35, affected_lanes: "ทุกช่องจราจร",
          traffic_status: "WARNING", latest_photo_url: "", is_active: true, updated_at }] } });
    });
    await page.goto((process.env.BASE_PATH || "") + (audience === "admin" ? "/admin/" : "/"));
    if (audience === "admin" && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const map = page.locator("[data-hdms-map]");
    const marker = map.locator('.leaflet-marker-icon[aria-label^="ทล.418"]').first();
    await expect(marker).toBeVisible();
    await marker.dispatchEvent("click");
    const popup = map.locator(".doh-flood-popup-card");
    await expect(popup).toBeVisible();
    const photo = popup.getByText("ยังไม่มีภาพถ่ายเหตุการณ์", { exact: true });
    const button = popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" });
    const lanes = popup.locator("strong").filter({ hasText: /ทุกช่องจราจร/ }).first();
    const water = popup.locator(".doh-flood-popup-water");
    const ratios = [await contrast(photo, photo.locator("../..")), await contrast(button, button),
      await contrast(lanes, lanes.locator("..")), await contrast(water, water.locator("../.."))];
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    console.log(audience, ratios.map((ratio) => ratio.toFixed(2)).join(", "));
  });
}
