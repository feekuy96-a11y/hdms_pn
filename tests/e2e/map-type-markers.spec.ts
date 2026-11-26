import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_MAP_STYLES } from "../../lib/constants";

const base = process.env.BASE_PATH || "";
const before = process.env.HDMS_MARKER_BASELINE === "1";
const date = "2026-11-26T07:00:00.000Z";
const styles = structuredClone(DEFAULT_MAP_STYLES);
Object.assign(styles.flood, { color: "#2563eb", pattern: "dash", dashArray: "9,5", animationEnabled: false });
Object.assign(styles.detour, { color: "#6b21a8", pattern: "solid", dashArray: "", animationEnabled: false });
const flood = {
  id: "TYPE-A", route_no: "43", section_name: "ช่วงทดสอบ", km_start: "97+100", km_end: "97+300",
  lon_start: 101.227, lat_start: 6.834, lon_end: 101.236, lat_end: 6.835, water_level_cm: 25, traffic_status: "WARNING",
  coordinates_json: [[101.227, 6.834], [101.236, 6.835]], is_active: true, updated_at: date, direction_meta: { eventId: "TYPE-EVENT" },
};
const sample = {
  updatedAt: date, floodRoutes: [flood, {
    ...flood, id: "TYPE-B", km_start: "97+300", km_end: "97+600", water_level_cm: 40, traffic_status: "CLOSED",
    lon_start: 101.236, lat_start: 6.835, lon_end: 101.265, lat_end: 6.841, coordinates_json: [[101.236, 6.835], [101.265, 6.841]],
  }],
  detourRoutes: [{
    id: "TYPE-D", route_name: "ทางเลี่ยงจำลอง", is_active: true, direction_mode: "TWO_WAY", updated_at: date,
    lon_start: 101.246, lat_start: 6.811, lon_end: 101.254, lat_end: 6.818, coordinates_json: [[101.246, 6.811], [101.251, 6.815], [101.254, 6.818]],
  }], highwayLayers: [], offices: [], timelineUpdates: [], mitigationProjects: [], mapStyles: styles,
  systemSettings: { name: "แผนที่ทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586" },
};
async function fixture(page: Page, origin: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({ json: sample }));
}

for (const admin of [false, true]) {
  test(`${admin ? "Admin" : "Public"} type markers stay distinct while group/split preserve traffic meaning`, async ({ page, isMobile, baseURL }, testInfo) => {
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await fixture(page, new URL(baseURL!).origin);
    await page.goto(base + (admin ? "/admin/" : "/"));
    if (admin && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const map = page.locator("[data-hdms-map]");
    const pins = map.locator(".doh-map-capsule-pin");
    const detour = map.locator(".doh-detour-symbol .doh-route-symbol");
    const layers = map.getByRole("button", { name: "เลเยอร์", exact: true });
    await expect(pins).toHaveCount(1);
    await expect(detour).toBeVisible();
    await expect(pins.first().locator('.doh-type-flood-wave svg')).toHaveCSS("stroke", "rgb(255, 255, 255)");
    await expect(pins.first()).toHaveAttribute("aria-label", /ผ่านไม่ได้/);
    await map.screenshot({ path: testInfo.outputPath("grouped.png"), animations: "disabled" });
    await layers.click();
    const split = map.getByRole("button", { name: "แยกช่วง", exact: true });
    if (!await split.isVisible()) await map.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
    await split.click();
    await expect(split).toHaveAttribute("aria-pressed", "true");
    await layers.click();
    await expect(pins).toHaveCount(2);
    await map.screenshot({ path: testInfo.outputPath("split.png"), animations: "disabled" });
    if (before) return;
    const c = map.locator(".doh-capsule-red.doh-type-flood");
    const w = map.locator(".doh-capsule-orange.doh-type-flood");
    await expect(c).toBeVisible();
    await expect(w).toBeVisible();
    await expect(c).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(w).toHaveCSS("background-image", /linear-gradient.*169, 37, 59.*133, 27, 49/);
    await expect(detour).toHaveCSS("background-image", /linear-gradient.*255, 227, 148.*246, 187, 71/);
    await expect(detour).toHaveCSS("color", "rgb(20, 35, 49)");
    await expect(c.locator(".doh-type-flood-status")).toHaveAttribute("data-status-glyph", "closed");
    await expect(w.locator(".doh-type-flood-status")).toHaveAttribute("data-status-glyph", "vehicle");
    await expect(w.locator(".doh-type-flood-status")).toHaveAttribute("title", /รถเล็กผ่านไม่ได้/);
    expect(await w.locator(".doh-type-flood-status").evaluate((el) => getComputedStyle(el).getPropertyValue("--status-sign-color").trim())).toBe("#f97316");

    const contrast = await map.evaluate(() => {
      const lum = (r: number, g: number, b: number) => [r, g, b].map((x) => x / 255)
        .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * v, 0);
      return [".doh-type-flood", ".doh-type-detour"].map((selector) => {
        const css = getComputedStyle(document.querySelector(selector)!);
        const rgb = (s: string) => [...s.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => lum(+m[1], +m[2], +m[3]));
        const [fg] = rgb(css.color);
        return Math.min(...rgb(css.backgroundImage).map((bg) => (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05)));
      });
    });
    expect(contrast).toHaveLength(2);
    for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
    console.log("MARKER_CONTRAST " + JSON.stringify({ admin, isMobile, flood: contrast[0], detour: contrast[1] }));
  });
}

const knownStatuses = [
  ["CLOSED", "closed", "ผ่านไม่ได้"],
  ["NO_SMALL_VEHICLES", "vehicle", "รถเล็กไม่สามารถผ่านได้"],
  ["ONE_LANE", "warning", "รถเล็กผ่านได้ ๑ ช่องทาง"],
  ["LIGHT_VEHICLES_ONLY", "slow", "รถทุกชนิดผ่านได้แต่ไม่สะดวก"],
  ["PASSABLE", "passable", "ผ่านได้ปกติ"],
] as const;

test("five actual map icon silhouettes are legible in both themes", async ({ page, baseURL, isMobile }, testInfo) => {
  test.skip(isMobile || before, "Desktop capture of all five distinct route fixtures");
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page, new URL(baseURL!).origin);
  await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({ json: {
    ...sample,
    floodRoutes: knownStatuses.map(([status], i) => {
      const lng = 101.12 + i * 0.06;
      return { ...flood, id: "ICON-" + i, route_no: String(40 + i), traffic_status: status,
        lon_start: lng, lat_start: 6.835, lon_end: lng + 0.008, lat_end: 6.839,
        direction_meta: { eventId: "ICON-EVENT-" + i },
        coordinates_json: [[lng, 6.835], [lng + 0.008, 6.839]] };
    }),
  } }));
  await page.goto(base + "/");
  const paths = new Set<string>();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    for (const [, key, label] of knownStatuses) {
      const glyph = page.locator(`[data-status-glyph="${key}"]`);
      await expect(glyph).toHaveAttribute("title", label);
      await expect(glyph.locator(".hdms-status-sign-route")).toHaveCSS("stroke", "rgb(20, 35, 49)");
      paths.add((await glyph.locator(".hdms-status-sign-face").getAttribute("d"))!);
      await glyph.screenshot({ path: testInfo.outputPath(`map-status-${key}-${theme}.png`), animations: "disabled" });
    }
  }
  expect(paths.size).toBe(5);
});
