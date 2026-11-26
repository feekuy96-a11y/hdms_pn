import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const name = "สถานการณ์ภัยพิบัติบนทางหลวง";
const org = "แขวงทางหลวงปัตตานี";
const payload = {
  floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name, org, phone: "1586" },
  highwayLayers: [{
    layer_id: "MAIN_HIGHWAY", layer_name: "สายหลัก", is_visible: true, color_hex: "#1B5E20", line_width: 5,
    geojson_data: { type: "FeatureCollection", features: [{
      type: "Feature", properties: { route_no: "42", section_name: "ช่วงทดสอบ", length_km: "19.85", lanes: "2 ช่องจราจร", km_start: "0+000", km_end: "19+850" },
      geometry: { type: "LineString", coordinates: [[101.18, 6.85], [101.22, 6.85]] },
    }] },
  }],
};

test("admin brand, GIS dock and highway detail expose readable controls in both themes", async ({ page, baseURL, isMobile }, testInfo) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1366, height: 900 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("hdms-admin-workspace-theme")) localStorage.setItem("hdms-admin-workspace-theme", "light");
  });
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await page.route("**/functions/v1/hdms-api*", r => r.fulfill({ json: payload }));
  await page.goto(base + "/admin/");
  const brand = page.getByRole("group", { name: "ระบบจัดการของส่วนราชการ" });
  await expect(brand.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(brand.locator("p")).toHaveText(org);
  const pane = page.getByRole("button", { name: "แผนที่ GIS", exact: true });
  if (isMobile) await pane.click();
  const toolbar = page.getByRole("group", { name: "เครื่องมือค้นหาและกลับไปฟอร์ม" });
  const search = toolbar.getByRole("searchbox");
  const back = toolbar.getByRole("button", { name: "กลับไปส่วนกรอกฟอร์ม" });
  const themeButton = page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ" });
  const map = page.locator("[data-public-layer-opacities]");
  const popup = page.locator(".doh-highway-popup");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await themeButton.click();
      await page.getByRole("button", { name: "ธีมมืด", exact: true }).click();
    }
    await expect(page.locator("[data-admin-theme]")).toHaveAttribute("data-admin-theme", theme);
    await expect(search).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(26, 45, 62)");
    await search.fill("42");
    await expect(search).toHaveValue("42");
    await search.fill("");
    if (isMobile) {
      await expect(back).toBeVisible();
      expect((await back.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    const feature = async () => map.evaluate(el => JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}").highwayFeatures?.["MAIN_HIGHWAY:0"]);
    await expect.poll(async () => (await feature())?.opacity || 0).toBeGreaterThan(0);
    const { x, y } = await feature();
    await map.click({ position: { x, y } });
    await expect(popup).toContainText("19.85 กม.");
    await expect(popup).toContainText("2 ช่องจราจร");
    await expect(popup.locator(".doh-highway-type")).toHaveText("ทางหลวงสายหลัก");
    const ratios = await popup.evaluate(el => {
      const luminance = (color: string) => (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3)
        .reduce((sum, c, i) => {
          const x = Number(c) / 255;
          return sum + (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
        }, 0);
      return Array.from(el.querySelectorAll(".doh-highway-metric-label, .doh-highway-metric-value, .doh-highway-type"), item => {
        const bg = luminance(getComputedStyle(item.closest(".doh-highway-metric, .doh-highway-type")!).backgroundColor);
        const fg = luminance(getComputedStyle(item).color);
        return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      });
    });
    expect(ratios).toHaveLength(5);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath(`admin-chrome-${theme}.png`), animations: "disabled" });
    await page.locator(".leaflet-popup-close-button").click();
    await expect(popup).toHaveCount(0);
  }
  if (isMobile) {
    await back.click();
    await expect(pane).toHaveAttribute("aria-pressed", "false");
    await expect(search).toBeHidden();
  }
});
