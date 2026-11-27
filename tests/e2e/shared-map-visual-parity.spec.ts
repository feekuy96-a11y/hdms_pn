import { expect, test } from "@playwright/test";
import { DEFAULT_MAP_STYLES } from "../../lib/constants";
import { resolveMapDetourDash } from "../../components/map/useLongdoRouteLayers";
import { getTrafficPresentation, TRAFFIC_ACCENT } from "../../lib/traffic-presentation";

const base = process.env.BASE_PATH || "";
const routeShape = [[101.246, 6.811], [101.251, 6.815], [101.254, 6.818]];
const update = "2026-11-26T07:00:00.000Z";
const styles = structuredClone(DEFAULT_MAP_STYLES);
Object.assign(styles.flood, { color: "#2563eb", pattern: "dash", dashArray: "9,5", animationEnabled: false });
Object.assign(styles.detour, { color: "#6b21a8", pattern: "solid", dashArray: "", animationEnabled: false });
const sample = {
  updatedAt: update,
  floodRoutes: [{ id: "PARITY-F", route_no: "43", section_name: "ช่วงจำลอง", km_start: "97+100", km_end: "97+300", is_active: true,
    lon_start: 101.246, lat_start: 6.811, lon_end: 101.254, lat_end: 6.818, water_level_cm: 35, traffic_status: "CLOSED",
    coordinates_json: routeShape, updated_at: update }],
  detourRoutes: [{ id: "PARITY-D", route_name: "ทางเลี่ยงจำลอง", is_active: true, direction_mode: "TWO_WAY",
    lon_start: 101.246, lat_start: 6.811, lon_end: 101.254, lat_end: 6.818, coordinates_json: routeShape, updated_at: update }],
  highwayLayers: [
    { layer_id: "MAIN_HIGHWAY", layer_name: "ถนนหลักจำลอง", is_visible: true,
      geojson_data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { route_no: "43" }, geometry: { type: "LineString", coordinates: routeShape } }] } },
    { layer_id: "SECOND_HIGHWAY", layer_name: "ถนนรองจำลอง", is_visible: true,
      geojson_data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { route_no: "4078" }, geometry: { type: "LineString", coordinates: routeShape } }] } },
  ], offices: [], timelineUpdates: [], mitigationProjects: [], mapStyles: styles,
  systemSettings: { name: "แผนที่ทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586" },
};

test("shared detour dash defaults do not replace explicit saved patterns", () => {
  expect(resolveMapDetourDash(undefined)).toBe("8 6");
  expect(resolveMapDetourDash({ pattern: "solid" })).toBeUndefined();
  expect(resolveMapDetourDash({ pattern: "dash", dashArray: "10,4" })).toBe("10,4");
});

test("operational map portals align shared chrome and draw the same saved and status styles", async ({ page, isMobile }, testInfo) => {
  const origin = new URL(testInfo.project.use.baseURL!).origin;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: sample }));
  await page.addInitScript(() => {
    const palette = new Set<string>();
    Object.defineProperty(window, "__parityRenderedStrokes", { value: palette });
    const originalStroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (this: CanvasRenderingContext2D, ...args: [path?: Path2D]) {
      if (typeof this.strokeStyle === "string") palette.add(`${this.strokeStyle.toLowerCase()}:${this.getLineDash().join(",")}`);
      Reflect.apply(originalStroke, this, args);
    };
  });
  const sizes = isMobile ? [{ width: 360, height: 640 }, { width: 390, height: 844 }] : [{ width: 1440, height: 900 }];
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    const measurements: number[][] = [];
    for (const admin of [false, true]) {
      await page.goto(base + (admin ? "/admin/" : "/"));
      const tabs = page.getByRole("group", { name: "สลับมุมมองฟอร์มและแผนที่บนมือถือ", exact: true });
      if (admin && isMobile) await tabs.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
      const map = page.locator("[data-hdms-map]");
      const rail = map.getByRole("group", { name: "เครื่องมือแผนที่", exact: true });
      const status = map.locator(".hdms-map-status-head");
      const flood = status.locator("[data-status-chip=flood]");
      const detour = status.locator("[data-status-chip=detours]");
      const layerButton = rail.getByRole("button", { name: "เลเยอร์", exact: true });
      const panel = map.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่", exact: true });
      await expect(flood).toHaveText("น้ำท่วม 1 จุด");
      await expect(detour).toHaveText("ทางเลี่ยง 1 เส้นทาง");
      await expect(flood.locator("svg.lucide-waves")).toHaveCount(1);
      await expect(detour.locator("svg.lucide-route")).toHaveCount(1);
      expect(await flood.evaluate(el => el.tagName)).toBe(admin ? "SPAN" : "BUTTON");
      const asBox = (loc: typeof map) => loc.boundingBox().then(rect => rect!);
      const snap = Math.round;
      const [canvasBounds, rails, counters] = await Promise.all([asBox(map), asBox(rail), asBox(status)]);
      expect(counters.x + counters.width).toBeLessThan(rails.x);
      expect(counters.height).toBeGreaterThanOrEqual(43.999);
      measurements.push([rails.x-canvasBounds.x-canvasBounds.width, rails.y-canvasBounds.y, rails.width,
        counters.x-canvasBounds.x, counters.y-canvasBounds.y, counters.width, counters.height].map(snap));
      if (!admin) {
        await flood.click();
        await expect(map.locator("#citizen-map-status-filters")).toBeVisible();
        await flood.click();
      }
      if (admin && isMobile) {
        const back = page.getByRole("button", { name: "กลับไปส่วนกรอกฟอร์ม", exact: true });
        const search = page.getByRole("searchbox", { name: "ค้นหาสายทางบนแผนที่", exact: true });
        await page.locator(".hdms-admin-map-pane").evaluate(el => el.scrollIntoView({ block: "start", behavior: "instant" }));
        const [tabBox, buttonBox, s, m, c] = await Promise.all([asBox(tabs), asBox(back), asBox(search), asBox(map), asBox(status)]);
        expect(c.y).toBeGreaterThanOrEqual(tabBox.y + tabBox.height);
        expect(buttonBox.x + buttonBox.width).toBeLessThan(s.x);
        expect(Math.min(buttonBox.y, s.y)).toBeGreaterThan(m.y + m.height);
        await back.click({ trial: true });
        await search.click({ trial: true });
        await search.fill("43");
        await expect(search).toHaveValue("43");
        await search.fill("");
      }

      await expect(map.locator(".doh-map-capsule-pin")).toHaveCount(1);
      await expect(map.locator(".doh-detour-symbol .doh-route-symbol")).toBeVisible();
      const statusColor = getTrafficPresentation("CLOSED", 35).hex.toLowerCase();
      const amber = await map.locator(".doh-route-symbol").evaluate((el, color) => {
        const probe = document.createElement("span"); probe.style.color = color;
        document.body.append(probe);
        const isMatch = getComputedStyle(el).backgroundColor === getComputedStyle(probe).color;
        probe.remove();
        return isMatch;
      }, TRAFFIC_ACCENT.amber);
      expect(amber).toBe(true);
      await expect.poll(() => page.evaluate(() => Array.from((window as Window & { __parityRenderedStrokes?: Set<string> }).__parityRenderedStrokes || [])))
        .toEqual(expect.arrayContaining(["#2563eb:9,5", `${statusColor}:4,7`, "#6b21a8:"]));
      await expect(map.locator(".doh-detour-point-fallback:visible")).toHaveCount(0);
      const layerSnapshot = () => map.locator(".hdms-map-canvas").evaluate(el =>
        JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}") as { zoom: number; highways: Record<string, number> });
      const zoom = async () => (await layerSnapshot()).zoom;
      const hasSecondary = async () => Object.hasOwn((await layerSnapshot()).highways ?? {}, "4078");
      await expect.poll(zoom).toBe(11);
      await expect.poll(hasSecondary).toBe(true);
      await rail.getByRole("button", { name: "Zoom out", exact: true }).click();
      await expect.poll(zoom).toBe(10);
      await expect.poll(hasSecondary).toBe(true);
      await expect.poll(async () => Object.hasOwn((await layerSnapshot()).highways, "43")).toBe(true);
      await rail.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect.poll(zoom).toBe(11);
      await expect.poll(hasSecondary).toBe(true);
      // Exercise shared interactions deeply once per browser profile; each portal and
      // viewport still gets a real +/- click, open/close and placement assertions.
      const runSharedDetails = !admin && viewport === sizes[0];
      if (runSharedDetails) {
        for (let level = 12; level <= 14; level++) {
          await rail.getByRole("button", { name: "Zoom in", exact: true }).click();
          await expect.poll(zoom).toBe(level);
        }
        await expect(map.locator(".doh-detour-point-fallback:visible")).toHaveCount(2);
      }

      await layerButton.click();
      await expect(panel).toBeVisible();
      const p = await asBox(panel), toolbar = await asBox(rail);
      expect(p.x + p.width).toBeLessThan(toolbar.x);
      if (runSharedDetails || (admin && viewport === sizes[0])) {
        const secondRoads = panel.getByRole("checkbox", { name: /ทางหลวงสายรอง/ });
        await secondRoads.uncheck();
        await expect.poll(hasSecondary).toBe(false);
        await expect.poll(async () => Object.hasOwn((await layerSnapshot()).highways, "43")).toBe(true);
        await secondRoads.check();
        await expect.poll(hasSecondary).toBe(true);
      }
      if (runSharedDetails) {
        const highwayList = panel.getByRole("button", { name: "ดูรายชื่อทางหลวงสายหลัก", exact: true });
        await highwayList.press("Enter");
        const pinned = map.getByRole("tooltip", { name: "รายชื่อทางหลวงสายหลัก", exact: true });
        await expect(pinned).toBeVisible();
        await expect(pinned.getByText("ทล.43", { exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(pinned).toHaveCount(0);
        await expect(panel).toBeVisible();
      }
      await layerButton.click(); await expect(panel).toHaveCount(0);
      if (admin && isMobile) {
        await page.getByRole("button", { name: "กลับไปส่วนกรอกฟอร์ม", exact: true }).click();
        await expect(rail).toBeHidden();
      }
    }
    expect(measurements[0]).toEqual(measurements[1]);
  }
});
