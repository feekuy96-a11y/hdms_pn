import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_MAP_STYLES, type MapLineStyleItem } from "../../lib/constants";

const base = process.env.BASE_PATH || "";

async function mockIncidentMotion(page: Page) {
  let styles: Record<string, MapLineStyleItem> = structuredClone(DEFAULT_MAP_STYLES);
  styles.detour.arrowMinZoom = 0;
  let saves = 0;
  const coords = [[101.165, 6.81], [101.23, 6.828], [101.29, 6.82], [101.345, 6.856]];
  const detourCoords = [[101.165, 6.81], [101.198, 6.86], [101.26, 6.90], [101.31, 6.877], [101.345, 6.856]];
  await page.route("**/functions/v1/hdms-api*", async (route) => {
    const request = route.request().postDataJSON() as { action?: string; args?: [Record<string, MapLineStyleItem>] };
    if (request.action === "updateMapStyleAction" && request.args?.[0]) {
      styles = request.args[0];
      saves++;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: {
      updatedAt: "2026-11-25T00:00:00.000Z",
      floodRoutes: [{
        id: "MOTION-FLOOD", route_no: "42", section_name: "ช่วงทดสอบ", km_start: "0+000", km_end: "1+000",
        lon_start: 101.22, lat_start: 6.81, lon_end: 101.28, lat_end: 6.82, coordinates_json: coords,
        is_active: true, water_level_cm: 20, traffic_status: "PASSABLE", road_side: "BOTH",
      }],
      detourRoutes: [{
        id: "MOTION-DETOUR", route_name: "ทางเลี่ยงทดสอบ", is_active: true, direction_mode: "FORWARD_ONLY",
        lon_start: 101.22, lat_start: 6.81, lon_end: 101.28, lat_end: 6.82, coordinates_json: detourCoords,
      }],
      offices: [], timelineUpdates: [], mitigationProjects: [], mapStyles: styles,
      highwayLayers: [{
        layer_id: "MAIN_HIGHWAY", layer_name: "โครงข่ายทดสอบ", is_visible: false,
        geojson_data: { type: "FeatureCollection", features: Array.from({ length: 251 }, () => ({
          type: "Feature", properties: { route_no: "42" }, geometry: { type: "LineString", coordinates: coords },
        })) },
      }],
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
    } });
  });
  return {
    styles: () => styles,
    saves: () => saves,
    extendFloodPastViewport: () => { coords.unshift([99.0, 6.78]); coords.push([103.0, 6.96]); },
  };
}

test("legacy flood arrows visibly pulse in the preview and explain reduced motion", async ({ page, isMobile }) => {
  test.skip(isMobile, "Style preview is checked in the desktop editor.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const mock = await mockIncidentMotion(page);
  Object.assign(mock.styles().flood, { animation: "arrows", animationSpeed: 100, pattern: "dash", animationEnabled: true });
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  await expect(page.locator("#line-style-animation-select")).toHaveValue("arrows");
  const ribbon = page.locator(".doh-route-motion-preview .doh-motion-ribbon-core");
  await expect(ribbon).toBeVisible();
  await expect(page.getByText(/สว่าง–จางเป็นจังหวะอยู่กับที่/)).toBeVisible();
  const path = await ribbon.getAttribute("d");
  const opacity = Number(await ribbon.getAttribute("opacity"));
  await expect.poll(async () => Math.abs(Number(await ribbon.getAttribute("opacity")) - opacity)).toBeGreaterThan(0.06);
  await expect(ribbon).toHaveAttribute("d", path!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(ribbon).toHaveCount(0);
  await expect(page.getByText(/ตามการตั้งค่าลดการเคลื่อนไหวของอุปกรณ์/)).toBeVisible();
});

test("incident motion options save per layer and render on the public map after reload", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop style editor workflow");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const saved = await mockIncidentMotion(page);
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  const enabled = page.getByRole("checkbox", { name: "เปิดแอนิเมชันชั้นนี้" });
  const save = page.getByRole("button", { name: "บันทึกสไตล์เส้น", exact: true });
  await expect(enabled).toBeChecked();
  await expect(page.locator("#line-style-animation-select")).toHaveValue("wave");
  const preview = page.locator(".doh-route-motion-preview");
  const mapPath = (className: string) => page.locator(`.leaflet-container:not(.doh-route-motion-preview) path.${className}`).first();
  const floodRibbon = mapPath("doh-motion-ribbon-core");
  const ribbonPreview = preview.locator(".doh-motion-ribbon-core");
  await expect(ribbonPreview).toBeVisible();
  await expect(ribbonPreview).toHaveAttribute("stroke-width", "1.15");
  await expect(floodRibbon).toBeVisible({ timeout: 15_000 });
  const stationaryFlood = await floodRibbon.getAttribute("d");
  const initialIntensity = await floodRibbon.getAttribute("opacity");
  await expect.poll(() => floodRibbon.getAttribute("opacity")).not.toBe(initialIntensity);
  await expect(floodRibbon).toHaveAttribute("d", stationaryFlood ?? "");
  await page.locator("#line-style-animation-select").selectOption("spotlight");
  await expect(preview.locator(".doh-motion-spotlight-core")).toBeVisible();
  await enabled.uncheck();
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await expect(enabled).toBeChecked();
  await expect(page.locator("#line-style-animation-select")).toHaveValue("flow");
  await page.locator("#line-style-animation-select").selectOption("chevrons");
  await expect(preview.locator(".doh-motion-chevrons-core")).toBeVisible();
  await save.click();
  await expect.poll(saved.saves).toBe(1);
  expect(saved.styles().detour.animation).toBe("chevrons");
  await page.reload();
  const motionA = page.locator("path.doh-route-motion-detour.doh-motion-chevrons-core");
  await expect(motionA).toBeVisible();
  const beforeA = await motionA.getAttribute("d");
  await expect.poll(() => motionA.getAttribute("d")).not.toBe(beforeA);
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await page.locator("#line-style-animation-select").selectOption("flow");
  const speed = page.getByRole("slider", { name: "ความเร็วการเคลื่อนไหว" });
  await expect(speed).toHaveValue("60");
  await speed.focus();
  await speed.press("Home");
  await expect(speed).toHaveValue("0");
  await expect(speed).toHaveAttribute("aria-valuetext", "0% หยุดการเคลื่อนไหว");
  await expect(enabled).toBeChecked();
  await expect(preview.locator(".doh-motion-highlight-core")).toHaveCount(0);
  await expect(preview.locator(".doh-detour-chevron").first()).toBeVisible();
  await save.click();
  await expect.poll(saved.saves).toBe(2);
  expect(saved.styles().detour.animationSpeed).toBe(0);
  expect(saved.styles().flood.animationEnabled).toBe(false);
  expect(saved.styles().flood.animationSpeed).toBe("normal");

  await page.goto(`${base}/`);
  await expect(page.locator(".doh-detour-chevron").first()).toBeVisible();
  await expect(page.locator("path.doh-route-motion-detour")).toHaveCount(0);
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await expect(speed).toHaveValue("0");
  await speed.focus();
  await speed.press("End");
  await expect(speed).toHaveValue("100");
  await expect(speed).toHaveAttribute("aria-valuetext", "100%");
  const highlightPreview = preview.locator(".doh-motion-highlight-core");
  await expect(highlightPreview).toBeVisible();
  const previewStroke = await highlightPreview.getAttribute("stroke-width");
  await save.click();
  await expect.poll(saved.saves).toBe(3);
  expect(saved.styles().detour.animationEnabled).toBe(true);
  expect(saved.styles().detour.animation).toBe("flow");
  expect(saved.styles().detour.animationSpeed).toBe(100);

  const detour = mapPath("doh-motion-highlight-core");
  const expectSavedMotion = async () => {
    await expect(detour).toBeVisible({ timeout: 15_000 });
    await expect(detour).toHaveAttribute("stroke-width", previewStroke ?? "");
    const before = await detour.getAttribute("d");
    await expect.poll(() => detour.getAttribute("d")).not.toBe(before);
    await expect(page.locator("path.doh-route-motion-flood")).toHaveCount(0);
  };
  await page.reload();
  await expectSavedMotion();
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await expect(speed).toHaveValue("100");

  await page.goto(`${base}/`);
  await page.reload();
  await expectSavedMotion();
  await expect(enabled).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(detour).toHaveCount(0);
});

// Intentionally exercise the citizen map at mobile and desktop widths.
test("citizen ribbon stays on its segment while the detour highlight travels", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const saved = await mockIncidentMotion(page);
  await page.goto(`${base}/`);
  const flood = page.locator(".doh-motion-ribbon-core").first();
  const detour = page.locator(".doh-motion-highlight-core").first();
  await expect(flood).toBeVisible();
  const stationaryPath = await flood.getAttribute("d");
  const initialOpacity = await flood.getAttribute("opacity");
  const initialHighlight = await detour.getAttribute("d");
  await expect.poll(() => flood.getAttribute("opacity")).not.toBe(initialOpacity);
  await expect(flood).toHaveAttribute("d", stationaryPath ?? "");
  await expect.poll(() => detour.getAttribute("d")).not.toBe(initialHighlight);
  saved.styles().flood.animationSpeed = 0;
  await page.reload();
  await expect(flood).toBeVisible();
  await expect(flood).toHaveAttribute("opacity", "0.487");
  await expect(flood).toHaveAttribute("d", stationaryPath ?? "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".doh-route-motion-flood, .doh-route-motion-detour")).toHaveCount(0);
});

test("style C saves real endpoint rings and preserves them when motion is stopped", async ({ page }) => {
  const desktop = (page.viewportSize()?.width ?? 1280) >= 800;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const saved = await mockIncidentMotion(page);
  const mapPath = (className: string) => page.locator(`.leaflet-container:not(.doh-route-motion-preview) path.${className}`).first();
  const extent = mapPath("doh-motion-extent-core");
  const halo = mapPath("doh-motion-extent-halo");
  const endpoints = mapPath("doh-motion-extent-endpoint");
  if (desktop) {
    await page.goto(`${base}/admin/`);
    const openStyles = () => page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
    await openStyles();
    const effect = page.locator("#line-style-animation-select");
    await effect.selectOption("extent");
    const previewEndpoint = page.locator(".doh-route-motion-preview .doh-motion-extent-endpoint");
    await expect(previewEndpoint).toHaveAttribute("d", /^M[^M]+M[^M]+$/);
    await expect(previewEndpoint).toHaveAttribute("stroke-width", "2.25");
    await page.getByRole("button", { name: "บันทึกสไตล์เส้น", exact: true }).click();
    await expect.poll(saved.saves).toBe(1);
    expect(saved.styles().flood.animation).toBe("extent");
    expect(saved.styles().detour.animation).toBe("flow");
    await page.reload();
    await openStyles();
    await expect(effect).toHaveValue("extent");
    await expect(extent).toBeVisible();
    await expect(endpoints).toHaveAttribute("d", /^M[^M]+M[^M]+$/);
  } else {
    saved.styles().flood.animation = "extent";
  }

  await page.goto(`${base}/`);
  await expect(extent).toBeVisible();
  const originalLine = await extent.getAttribute("d");
  const originalHalo = await halo.getAttribute("opacity");
  await expect.poll(() => halo.getAttribute("opacity")).not.toBe(originalHalo);
  await expect(extent).toHaveAttribute("d", originalLine ?? "");
  await expect(endpoints).toHaveAttribute("d", /^M[^M]+M[^M]+$/);
  await expect(endpoints).toHaveAttribute("stroke-width", "2.25");

  const stableCheck = async () => {
    await expect(halo).toHaveAttribute("opacity", "0.180");
    const endpointD = await endpoints.getAttribute("d");
    const afterNextFrame = await halo.evaluate((node) => new Promise<string | null>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(node.getAttribute("opacity"))));
    }));
    expect(afterNextFrame).toBe("0.180");
    await expect(endpoints).toHaveAttribute("d", endpointD ?? "");
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stableCheck();
  await expect(page.locator(".doh-route-motion-detour")).toHaveCount(0);

  saved.styles().flood.animationSpeed = 0;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await stableCheck();

  saved.extendFloodPastViewport();
  await page.reload();
  await expect(extent).toBeVisible();
  await expect(endpoints).toHaveCount(0);
});
