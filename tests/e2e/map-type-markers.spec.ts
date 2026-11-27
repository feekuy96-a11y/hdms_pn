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
    const wave = await pins.first().locator('[data-flood-type-glyph="wave"]').getAttribute("d");
    const legend = map.getByRole("region",{name:"เลเยอร์และสัญลักษณ์แผนที่"});
    const referencePaths = await legend.locator('[data-flood-type-glyph="wave"]').evaluateAll(el=>el.map(path=>path.getAttribute("d")));
    expect(referencePaths).toHaveLength(2);
    expect(referencePaths.every(path=>path===wave)).toBe(true);
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
    await expect(w).toHaveCSS("background-image", /linear-gradient/);
    await expect(detour).toHaveCSS("background-image", /linear-gradient.*255, 227, 148.*246, 187, 71/);
    await expect(detour).toHaveCSS("color", "rgb(20, 35, 49)");
    await expect(map.locator(".doh-type-flood .hdms-status-sign")).toHaveCount(0);
    await expect(c).toHaveCSS("--flood-pin-accent", "#dc2626");
    await expect(w).toHaveCSS("--flood-pin-accent", "#f97316");
    await expect(w).toHaveAttribute("title", /รถเล็กผ่านไม่ได้/);
    expect(await c.evaluate(el => getComputedStyle(el).backgroundImage)).not.toBe(await w.evaluate(el => getComputedStyle(el).backgroundImage));

    const contrast = await map.evaluate(() => {
      const lum = (r: number, g: number, b: number) => [r, g, b].map((x) => x / 255)
        .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * v, 0);
      return [".doh-type-flood", ".doh-type-detour"].map((selector) => {
        const css = getComputedStyle(document.querySelector(selector)!);
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const read = (value: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return lum(r, g, b);
        };
        const fg = read(css.color);
        const stops = css.backgroundImage.match(/(?:rgba?|color)\([^()]+\)/g) || [css.backgroundColor];
        return Math.min(...stops.map(read).map((bg) => (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05)));
      });
    });
    expect(contrast).toHaveLength(2);
    for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
    console.log("MARKER_CONTRAST " + JSON.stringify({ admin, isMobile, flood: contrast[0], detour: contrast[1] }));
  });
}

const knownStatuses = [
  ["CLOSED", "red", "ผ่านไม่ได้"],
  ["NO_SMALL_VEHICLES", "orange", "รถเล็กไม่สามารถผ่านได้"],
  ["ONE_LANE", "amber", "รถเล็กผ่านได้ ๑ ช่องทาง"],
  ["LIGHT_VEHICLES_ONLY", "sky", "รถทุกชนิดผ่านได้แต่ไม่สะดวก"],
  ["PASSABLE", "emerald", "ผ่านได้ปกติ"],
] as const;

test("five flood markers share one glyph but keep distinct status bands and edges in both themes", async ({ page, baseURL, isMobile }, testInfo) => {
  test.skip(isMobile || before, "Desktop capture of five status fixtures");
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
  const bands = new Set<string>();
  const glyphs = new Set<string>();
  const edges = new Set<string>();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    for (const [, key, label] of knownStatuses) {
      const marker = page.locator(`.doh-type-flood.doh-capsule-${key === "emerald" ? "green" : key}`);
      await expect(marker).toHaveAttribute("title", new RegExp(label));
      await expect(marker.locator("svg")).toHaveCount(1);
      const shape = marker.locator('[data-flood-type-glyph="wave"]');
      await expect(shape).toHaveCount(1);
      glyphs.add((await shape.getAttribute("d"))!);
      edges.add(await marker.evaluate(el=>{const style=getComputedStyle(el);return `${style.outlineStyle}:${style.outlineWidth}`;}));
      await expect(marker.locator(".doh-type-flood-wave svg")).toHaveCSS("stroke", "rgb(255, 255, 255)");
      await expect(marker.locator(".hdms-status-sign")).toHaveCount(0);
      bands.add(await marker.evaluate(el => getComputedStyle(el).getPropertyValue("--flood-pin-accent").trim()));
      await marker.screenshot({ path: testInfo.outputPath(`map-status-${key}-${theme}.png`), animations: "disabled" });
    }
  }
  expect(bands.size).toBe(5);
  expect(glyphs.size).toBe(1);
  expect(edges.size).toBe(5);
});

for (const admin of [false, true]) {
  test(`${admin ? "Admin" : "Public"} detour symbols clear collisions without merging route identities`, async ({ page, isMobile, baseURL }) => {
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await fixture(page, new URL(baseURL!).origin);
    const start = [101.240, 6.858];
    const end = [101.256, 6.866];
    const midpoint = [101.248, 6.862];
    const detour = { ...sample.detourRoutes[0], id: "SPACE-A", route_name: "ทางเลี่ยงทดสอบคู่",
      lon_start: start[0], lat_start: start[1], lon_end: end[0], lat_end: end[1],
      coordinates_json: [start, midpoint, end],
      reverse_coordinates_json: [[end[0], end[1] + .002], midpoint, [start[0], start[1] + .002]],
    };
    await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({ json: {
      ...sample, floodRoutes: [], detourRoutes: [detour, {
        ...detour, id: "SPACE-B", route_name: "ทางเลี่ยงทดสอบอิสระ", direction_mode: "FORWARD_ONLY", reverse_coordinates_json: [],
        coordinates_json: [[101.240, 6.854], [midpoint[0] + .004, midpoint[1]], [101.256, 6.865]],
      }],
    } }));
    await page.goto(base + (admin ? "/admin/" : "/"));
    if (admin && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const map = page.locator("[data-hdms-map]");
    const symbols = map.locator(".doh-detour-symbol");
    const shifted = symbols.locator("xpath=self::*[@data-detour-symbol-shifted]");
    const partlyMoved = () => symbols.evaluateAll((items) => {
      const rects = items.map((item) => item.getBoundingClientRect());
      return rects.every((a, i) => rects.slice(i + 1).every((b) =>
        a.right + 4 <= b.left || b.right + 4 <= a.left || a.bottom + 4 <= b.top || b.bottom + 4 <= a.top));
    });
    await expect(symbols).toHaveCount(2);
    await expect(shifted).toHaveCount(1);
    await expect.poll(partlyMoved).toBe(true);
    const layers = map.getByRole("button", { name: "เลเยอร์", exact: true });
    await layers.click();
    const panel = map.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
    const split = panel.getByRole("button", { name: "แยกตามทิศทาง", exact: true });
    if (!await split.isVisible()) await panel.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
    await split.click();
    await layers.click();
    await expect(symbols).toHaveCount(3);
    await expect(shifted).toHaveCount(2);
    await expect.poll(partlyMoved).toBe(true);
    const zoom = map.getByRole("button", { name: "Zoom in", exact: true });
    const zoomLevel = () => map.locator("[data-public-layer-opacities]").evaluate((e) => JSON.parse(e.getAttribute("data-public-layer-opacities") || "{}").zoom as number);
    const initialZoom = await zoomLevel();
    expect(initialZoom).toBeLessThan(14);
    for (let level = initialZoom; level < 14; level++) {
      await zoom.click();
      await expect.poll(zoomLevel).toBe(level + 1);
    }
    await expect(shifted).toHaveCount(1);
    await expect(map.locator('.doh-detour-symbol[aria-label*="อิสระ"]')).not.toHaveAttribute("data-detour-symbol-shifted", "");
    await expect.poll(partlyMoved).toBe(true);
    const inMap = map.locator('.doh-detour-symbol[aria-label^="ขากลับ B → A:"]');
    await expect(inMap).toHaveAttribute("aria-label", /ทางเลี่ยงทดสอบคู่/);
    await inMap.press("Enter");
    const popup = map.locator(".doh-detour-leaflet-popup");
    await expect(popup).toContainText("ทางเลี่ยงทดสอบคู่");
    await expect(popup.getByRole("button", { name: "ขากลับ B → A", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
}
