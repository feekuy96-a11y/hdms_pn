import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const baseline = process.env.HDMS_SMOOTHNESS_BASELINE === "1";
const flood = {
  id: "SMOOTH-F", route_no: "43", section_name: "ช่วงทดสอบ", km_start: "97+127", km_end: "97+252",
  lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: [[101.186, 6.881], [101.205, 6.892]],
  water_level_cm: 30, traffic_status: "WARNING", is_active: true, updated_at: "2026-11-25T07:20:00.000Z",
};

async function setup(page: Page) {
  await page.route("**/*", (route) => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: {
    floodRoutes: [flood], detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [],
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
  } }));
}

type Frame = { ms: number; painted: boolean; opacity: number; inert: boolean };
async function recordFrames(page: Page, trigger: string, surface: string, opacityTarget = surface) {
  await page.evaluate(({ trigger, surface, opacityTarget }) => {
    const root = window as Window & { __motionFrames?: Promise<Frame[]> };
    root.__motionFrames = new Promise((resolve) => document.addEventListener("click", (event) => {
      if (!event.composedPath().some((node) => node instanceof Element && node.matches(trigger))) return;
      const start = performance.now();
      const samples: Frame[] = [];
      const listener = () => {
        const now = performance.now();
        const node = document.querySelector(surface);
        const painted = node !== null;
        const opacity = document.querySelector(opacityTarget);
        samples.push({ ms: +(now - start).toFixed(2), painted, opacity: opacity ? +getComputedStyle(opacity).opacity : 0,
          inert: Boolean(node?.closest("[inert]")) });
        if (now - start < 270) requestAnimationFrame(listener);
        else resolve(samples);
      };
      requestAnimationFrame(listener);
    }, { capture: true, once: true }));
  }, { trigger, surface, opacityTarget });
}
const frames = (page: Page) => page.evaluate(() => (window as Window & { __motionFrames?: Promise<Frame[]> }).__motionFrames);
const profile = (samples: Frame[]) => ({
  firstPaintMs: samples.find((f) => f.painted)?.ms ?? null,
  firstAlpha: samples.find((f) => f.painted)?.opacity ?? null,
  firstSolidMs: samples.find((f) => f.painted && f.opacity >= 0.99)?.ms ?? null,
  firstAbsentMs: samples.find((f) => !f.painted)?.ms ?? null,
  paintedInertFrames: samples.filter((f) => f.painted && f.inert).length,
  maxFrameGap: +Math.max(...samples.slice(1).map((f, i) => f.ms - samples[i].ms)).toFixed(2),
});

for (const admin of [false, true]) {
  test(`${admin ? "Admin" : "Public"} Leaflet popup keeps controls immediate while only the popup animates`, async ({ page, isMobile }) => {
    await setup(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(base + (admin ? "/admin/" : "/"));
    if (admin && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const scope = page.locator("[data-hdms-map]").first();
    const marker = scope.locator(".doh-map-capsule-pin").first();
    const popup = scope.locator(".leaflet-popup.hdms-popup-map");
    const map = scope.locator(".leaflet-container");
    await expect(marker).toBeVisible();
    const actualMap = await map.elementHandle();
    await recordFrames(page, ".doh-map-capsule-pin", ".leaflet-popup.hdms-popup-map");
    await marker.click();
    await expect(popup).toBeVisible();
    const opened = await frames(page);
    expect(opened?.some((frame) => frame.painted)).toBe(true);
    if (!baseline) expect(opened?.some((frame) => frame.opacity < 0.995 && frame.opacity >= 0.8)).toBe(true);
    await recordFrames(page, ".leaflet-popup-close-button", ".leaflet-popup.hdms-popup-map");
    await popup.locator(".leaflet-popup-close-button").click();
    await expect(popup).toHaveCount(0);
    const closed = await frames(page);
    console.log("POPUP_MOTION " + JSON.stringify({ admin, isMobile, open: profile(opened!), close: profile(closed!) }));
    // The map instance and its existing tile behavior must remain unchanged.
    expect(await map.evaluate((node, original) => node === original, actualMap)).toBe(true);
    await expect(map).not.toHaveClass(/leaflet-fade-anim/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await marker.click();
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS("animation-name", "none");
    const dismiss = popup.locator(".leaflet-popup-close-button");
    if (!isMobile && !baseline) {
      const box = (await dismiss.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(dismiss).toHaveCSS("box-shadow", /2px inset/);
      await page.mouse.up();
    } else {
      await dismiss.click();
    }
    await expect(popup).toHaveCount(0);
  });
}

test("public list exit paints briefly but releases pointer and accessibility immediately", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile bottom sheet");
  await setup(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/");
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  const floodButton = nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true });
  const close = drawer.getByRole("button", { name: "ปิดรายการสายทาง" });
  // Measure the effective alpha of the entire frame rather than just its CSS timing.
  await recordFrames(page, ".citizen-nav button", ".citizen-drawer", baseline ? ".citizen-drawer" : "[data-hdms-drawer-open]");
  await floodButton.click();
  await expect(drawer).toBeVisible();
  const opened = await frames(page);
  await recordFrames(page, "[data-hdms-popup-close]", ".citizen-drawer", baseline ? ".citizen-drawer" : "[data-hdms-drawer-open]");
  await close.click();
  await expect(drawer).toHaveCount(0);
  const closed = await frames(page);
  console.log("DRAWER_MOTION " + JSON.stringify({ open: profile(opened!), close: profile(closed!) }));
  if (!baseline) {
    expect(closed?.some((f) => f.painted && f.inert)).toBe(true);
    expect(closed?.some((f) => f.painted && f.opacity < 0.99 && f.opacity > 0)).toBe(true);
  }
  await floodButton.click();
  await close.click();
  // Reopen before the previous visual exit deadline. Only one pane can be interactive.
  await nav.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await expect(drawer).toHaveCount(1);
  await expect(drawer.getByRole("heading", { name: "ทางเลี่ยง", exact: true })).toBeVisible();
  if (baseline) {
    await close.click();
  } else {
    await close.focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "ทางเลี่ยง", exact: true })).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await floodButton.click();
  await recordFrames(page, "[data-hdms-popup-close]", ".citizen-drawer");
  await close.click();
  await expect(drawer).toHaveCount(0);
  const reduced = await frames(page);
  expect((reduced ?? []).filter((f) => f.painted && f.ms > 35)).toHaveLength(0);
});

test("closing the mobile drawer does not steal focus from a same-frame external action", async ({ page, isMobile }) => {
  test.skip(!isMobile || baseline, "Mobile drawer focus restoration only.");
  await setup(page);
  await page.goto(base + "/");
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  const close = drawer.getByRole("button", { name: "ปิดรายการสายทาง" });
  await expect(close).toBeFocused();
  const external = await layers.elementHandle();
  // Deliberately put both actions in one browser task, before the deferred restore runs.
  await close.evaluate((button, next) => {
    (button as HTMLButtonElement).click();
    (next as HTMLElement).focus();
  }, external);
  await expect(drawer).toHaveCount(0);
  await expect(nav).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(layers).toBeFocused();
});
