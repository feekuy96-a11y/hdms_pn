import { expect, test } from "@playwright/test";
import { DEFAULT_MAP_STYLES } from "../../lib/constants";

const base = process.env.BASE_PATH || "";
const floodPoints = [[101.165, 6.81], [101.23, 6.828], [101.29, 6.82], [101.345, 6.856]];
const detourPoints = [[101.165, 6.81], [101.198, 6.86], [101.26, 6.90], [101.31, 6.877], [101.345, 6.856]];

test("persisted incident opacity is used by Canvas before and after GIS focus", async ({ page, isMobile }) => {
  await page.route("**/*", (route) => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const paints = new Set<string>();
    (window as Window & { routePaints?: Set<string> }).routePaints = paints;
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      if (this.canvas.closest(".leaflet-container:not(.doh-route-motion-preview)")) {
        paints.add([this.strokeStyle, this.lineWidth, this.globalAlpha].join("/"));
      }
      if (path) return stroke.call(this, path);
      return Reflect.apply(stroke, this, []);
    };
  });
  const styles = structuredClone(DEFAULT_MAP_STYLES);
  Object.assign(styles.flood, { color: "#d32f2f", opacity: 0.4, weight: 6, borderActive: true, borderColor: "#ffffff", borderWidth: 1.5 });
  Object.assign(styles.detour, { color: "#fbc02d", opacity: 0.6, weight: 5, borderActive: true, borderColor: "#0f172a", borderWidth: 1 });
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: {
    floodRoutes: [{
      id: "ALPHA-FLOOD", route_no: "42", section_name: "ช่วงทดสอบความทึบ", km_start: "0+000", km_end: "1+000",
      lon_start: 101.165, lat_start: 6.81, lon_end: 101.345, lat_end: 6.856, coordinates_json: floodPoints,
      is_active: true, water_level_cm: 20, traffic_status: "PASSABLE", road_side: "BOTH",
    }],
    detourRoutes: [{
      id: "ALPHA-DETOUR", route_name: "ทางเลี่ยงทดสอบความทึบ", is_active: true, direction_mode: "FORWARD_ONLY",
      lon_start: 101.165, lat_start: 6.81, lon_end: 101.345, lat_end: 6.856, coordinates_json: detourPoints,
    }],
    offices: [], timelineUpdates: [], mitigationProjects: [], highwayLayers: [], mapStyles: styles,
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
  } }));
  const strokes = () => page.evaluate(() => [...((window as Window & { routePaints?: Set<string> }).routePaints ?? [])]);
  const overview = async (selected = false) => {
    const floodWeight = selected ? 7.5 : 6;
    await expect.poll(strokes).toEqual(expect.arrayContaining([`#d32f2f/${floodWeight}/0.4`, "#fbc02d/5/0.6", `#ffffff/${floodWeight + 3}/0.4`, "#0f172a/7/0.6"]));
    expect(await strokes()).not.toEqual(expect.arrayContaining([`#d32f2f/${floodWeight}/1`]));
    expect(await strokes()).not.toEqual(expect.arrayContaining(["#fbc02d/5/1"]));
  };

  if (!isMobile) {
    await page.goto(base + "/admin/");
    await overview();
  }
  await page.goto(base + "/");
  await overview();
  if (!isMobile) {
    const search = page.locator('input[type="search"], input[placeholder*="ค้นหาสายทาง"]').first();
    const filteredAlpha = () => page.locator("[data-public-layer-opacities]").evaluate((el) => {
      const info = JSON.parse((el as HTMLElement).dataset.publicLayerOpacities ?? "{}");
      return [info.floods?.["ALPHA-FLOOD"], info.detours?.["ALPHA-DETOUR"]];
    });
    await search.fill("999999");
    await expect.poll(filteredAlpha).toEqual([0, 0]);
    await page.evaluate(() => (window as Window & { routePaints?: Set<string> }).routePaints?.clear());
    await search.clear();
    await expect.poll(filteredAlpha).toEqual([0.4, 0.6]);
    await overview();
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await dialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();
    await expect(page.getByTestId("gis-focus-mode-bar")).toBeVisible();
    await expect.poll(strokes).toContain("#d32f2f/6.5/0.4");
    await page.evaluate(() => (window as Window & { routePaints?: Set<string> }).routePaints?.clear());
    await page.getByTestId("gis-focus-exit-btn").click();
    // Focus exits to the currently selected flood (existing +1.5 px accent).
    await overview(true);
  }
});
