import { expect, test } from "@playwright/test";
import { DEFAULT_MAP_STYLES, type MapLineStyleItem } from "../../lib/constants";

const base = process.env.BASE_PATH || "";

test("incident motion saves per layer and moves on the public map after reload", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop style editor workflow");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let styles: Record<string, MapLineStyleItem> = structuredClone(DEFAULT_MAP_STYLES);
  let saves = 0;
  const coords = [[101.22, 6.81], [101.25, 6.815], [101.28, 6.82]];
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
        lon_start: 101.22, lat_start: 6.81, lon_end: 101.28, lat_end: 6.82, coordinates_json: coords,
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
  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /สไตล์เส้นทาง/ }).click();
  const enabled = page.getByRole("checkbox", { name: "เปิดแอนิเมชันชั้นนี้" });
  const save = page.getByRole("button", { name: "บันทึกสไตล์เส้น", exact: true });
  await expect(enabled).toBeChecked();
  await expect(page.locator("#line-style-animation-select")).toHaveValue("wave");
  await expect(page.locator("path.doh-route-motion-flood").first()).toBeVisible({ timeout: 15_000 });
  await enabled.uncheck();
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await expect(enabled).toBeChecked();
  await expect(page.locator("#line-style-animation-select")).toHaveValue("flow");
  await page.locator("#line-style-speed-select").selectOption("fast");
  await expect(page.locator(".doh-route-motion-preview animateMotion").first()).toHaveAttribute("dur", "900ms");
  await save.click();
  await expect.poll(() => saves).toBe(1);
  expect(styles.flood.animationEnabled).toBe(false);
  expect(styles.detour.animation).toBe("flow");
  expect(styles.detour.animationSpeed).toBe("fast");

  const detour = page.locator("path.doh-route-motion-detour").first();
  const expectSavedMotion = async () => {
    await expect(detour).toBeVisible({ timeout: 15_000 });
    const before = await detour.getAttribute("d");
    await expect.poll(() => detour.getAttribute("d")).not.toBe(before);
    await expect(page.locator("path.doh-route-motion-flood")).toHaveCount(0);
  };
  await page.reload();
  await expectSavedMotion();

  await page.goto(`${base}/`);
  await page.reload();
  await expectSavedMotion();
  await expect(enabled).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(detour).toHaveCount(0);
});
