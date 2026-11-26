import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_MAP_STYLES, type MapLineStyleItem } from "../../lib/constants";

const base = process.env.BASE_PATH || "";
const main = ".doh-route-motion-primary";
const secondary = ".doh-route-motion-secondary";
const mapRoot = ".leaflet-container:not(.doh-route-motion-preview)";
const preview = ".doh-route-motion-preview";
const speed = "#line-style-speed-range";
const effect = "#line-style-animation-select";

async function fixture(page: Page) {
  await page.route("**/*", (route) => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let styles = structuredClone(DEFAULT_MAP_STYLES);
  let saves = 0;
  function layer(layerId: string, lat: number, route: string) {
    const make = (i: number, offset = 0) => [[101.08, lat + i * 0.001 + offset], [101.26, lat + i * 0.001 + offset], [101.40, lat + i * 0.001 + offset]];
    return {
      layer_id: layerId, layer_name: "ทดสอบ", is_visible: true,
      geojson_data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { route_no: route }, geometry: { type: "MultiLineString", coordinates: [make(0), make(0, 0.003)] } },
          ...Array.from({ length: 269 }, (_, i) => ({
            type: "Feature", properties: { route_no: route },
            geometry: { type: "LineString", coordinates: make(i % 12, i > 49 ? 25 : 0) },
          })),
        ],
      },
    };
  }
  await page.route("**/functions/v1/hdms-api*", async (route) => {
    const request = route.request().postDataJSON() as { action?: string; args?: [Record<string, MapLineStyleItem>] };
    if (request.action === "updateMapStyleAction" && request.args?.[0]) {
      styles = request.args[0];
      saves++;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: {
      updatedAt: "2026-11-25T00:00:00.000Z",
      offices: [], timelineUpdates: [], mitigationProjects: [], floodRoutes: [], detourRoutes: [], mapStyles: styles,
      highwayLayers: [layer("MAIN_HIGHWAY", 6.83, "42"), layer("SECOND_HIGHWAY", 6.91, "4157")],
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    } });
  });
  return { styles: () => styles, saves: () => saves };
}

const openStyles = (page: Page) => page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
const tab = (page: Page, secondary = false) => page.getByRole("button", { name: secondary ? "ทางหลวงสายรอง" : "ทางหลวงสายหลัก", exact: true }).click();
const changeSpeed = (page: Page, value: string) => page.locator(speed).fill(value);

async function horizontalRate(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((path) => new Promise<number>((resolve) => {
    const initial = performance.now();
    const samples: [number, number][] = [];
    const tick = (now: number) => {
      const match = path.getAttribute("d")?.match(/^M\s*(-?[\d.]+)/);
      if (match && path.getAttribute("d") !== "M0 0") samples.push([now, Number(match[1])]);
      if (now - initial < 650) requestAnimationFrame(tick);
      else {
        // Skip clipped stationary ends and seam jumps. Horizontal fixture geometry gives actual px/s.
        const rates = samples.slice(1).map(([t, x], i) => Math.abs(x - samples[i][1]) * 1000 / (t - samples[i][0]))
          .filter((v) => v > 5 && v < 140).sort((a, b) => a - b);
        resolve(rates[Math.floor(rates.length / 2)] ?? 0);
      }
    };
    requestAnimationFrame(tick);
  }));
}

test("highway motion uses the preview renderer and survives style save/reload independently", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop studio controls");
  const mock = await fixture(page);
  await page.goto(base + "/admin/");
  await openStyles(page);
  await tab(page);
  await expect(page.locator(effect)).toHaveValue("none");
  await expect(page.locator(preview + " " + main)).toHaveCount(0);
  await page.locator(effect).selectOption("pulse");
  const pulsePreview = page.locator(preview + " " + main + ".doh-motion-pulse-halo");
  await expect(pulsePreview).toBeVisible();
  const alpha = await pulsePreview.getAttribute("opacity");
  await expect.poll(() => pulsePreview.getAttribute("opacity")).not.toBe(alpha);
  await page.getByRole("checkbox", { name: "เปิดแอนิเมชันชั้นนี้" }).uncheck();
  await expect(pulsePreview).toHaveCount(0);
  await page.getByRole("checkbox", { name: "เปิดแอนิเมชันชั้นนี้" }).check();
  await changeSpeed(page, "0");
  await expect(pulsePreview).toHaveCount(0);
  await expect(page.locator(preview + " canvas")).toBeVisible();
  await changeSpeed(page, "100");
  await expect(pulsePreview).toBeVisible();

  await tab(page, true);
  await page.locator(effect).selectOption("chaser");
  const chaserPreview = preview + " " + secondary + ".doh-motion-highlight-core";
  await expect(page.locator(chaserPreview)).toBeVisible();
  await changeSpeed(page, "50");
  const slow = Math.max(await horizontalRate(page, chaserPreview), await horizontalRate(page, chaserPreview));
  await changeSpeed(page, "100");
  const fast = Math.max(await horizontalRate(page, chaserPreview), await horizontalRate(page, chaserPreview));
  expect(slow).toBeGreaterThan(22);
  expect(fast).toBeGreaterThan(slow * 1.45);
  await page.getByRole("button", { name: "บันทึกสไตล์เส้น", exact: true }).click();
  await expect.poll(mock.saves).toBe(1);
  expect(mock.styles().primary).toMatchObject({ animation: "pulse", animationEnabled: true, animationSpeed: 100 });
  expect(mock.styles().secondary).toMatchObject({ animation: "chaser", animationEnabled: true, animationSpeed: 100 });
  await page.reload();
  const primaryMap = page.locator(mapRoot + " " + main + ".doh-motion-pulse-halo");
  const secondaryMap = page.locator(mapRoot + " " + secondary + ".doh-motion-highlight-core");
  await expect(primaryMap.first()).toHaveAttribute("d", /^M.+L/);
  await expect(secondaryMap.first()).toHaveAttribute("stroke-width", "1.7");
  const previous = await secondaryMap.first().getAttribute("d");
  await expect.poll(() => secondaryMap.first().getAttribute("d")).not.toBe(previous);
});

test("dense highway motion is clipped, bounded and pauses on zoom/drag/reduced motion", async ({ page, isMobile }) => {
  const mock = await fixture(page);
  Object.assign(mock.styles().primary, { animation: "pulse", animationSpeed: 100 });
  Object.assign(mock.styles().secondary, { animation: "arrows", animationSpeed: 100 });
  await page.goto(base + "/");
  const mainLayer = page.locator(main + ".doh-motion-pulse-halo");
  const wideCap = 8;
  const map = page.locator(mapRoot);
  const box = (await map.boundingBox())!;
  const cap = box.width < 640 ? 4 : wideCap;
  await expect(mainLayer).toHaveCount(cap);
  const secondaryLayer = page.locator(secondary + ".doh-motion-highlight-core");
  await expect(secondaryLayer).toHaveCount(cap);
  expect(await mainLayer.first().getAttribute("d")).toMatch(/^M/);
  const pre = await mainLayer.first().getAttribute("opacity");
  await expect.poll(() => mainLayer.first().getAttribute("opacity")).not.toBe(pre);
  const renderedZoom = () => map.evaluate((el) => JSON.parse((el as HTMLElement).dataset.publicLayerOpacities ?? "{}").zoom);
  const originalZoom = await renderedZoom();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(renderedZoom).toBe(originalZoom - 1);
  await expect(mainLayer).toHaveCount(0);
  await expect(secondaryLayer).toHaveCount(0);
  await expect(map.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(renderedZoom).toBe(originalZoom);
  await expect(mainLayer).toHaveCount(cap);
  if (!isMobile) {
    const x = box.x + box.width * 0.6, y = box.y + box.height * 0.6;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 45, y + 10, { steps: 10 });
    await expect(mainLayer).toHaveCount(0);
    await page.mouse.up();
    await expect(mainLayer).toHaveCount(cap);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(mainLayer).toHaveCount(0);
  await expect(secondaryLayer).toHaveCount(0);
  await expect(map.locator("canvas").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(mainLayer).toHaveCount(cap);
  mock.styles().primary.animationEnabled = false;
  mock.styles().secondary.animationSpeed = 0;
  await page.reload();
  await expect(map.locator("canvas").first()).toBeVisible();
  await expect(mainLayer).toHaveCount(0);
  await expect(secondaryLayer).toHaveCount(0);
});
