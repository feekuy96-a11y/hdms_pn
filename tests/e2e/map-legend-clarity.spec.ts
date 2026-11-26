import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const coords = [[101.225, 6.831], [101.236, 6.842]];
const payload = {
  floodRoutes: [{ id: "LEG-F", route_no: "43", section_name: "ช่วงทดสอบ", km_start: "97+100", km_end: "97+200",
    lon_start: 101.225, lat_start: 6.831, lon_end: 101.236, lat_end: 6.842, coordinates_json: coords,
    water_level_cm: 25, traffic_status: "WARNING", is_active: true }],
  detourRoutes: [{ id: "LEG-D", route_name: "ทางเลี่ยงทดสอบ", direction_mode: "TWO_WAY", coordinates_json: coords,
    reverse_coordinates_json: [[101.236, 6.843], [101.225, 6.832]], is_active: true }],
  offices: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
};

test("map legend explains the three symbols and distinguishes the two display settings", async ({ page, baseURL, isMobile }, testInfo) => {
  await page.setViewportSize(isMobile ? { width: 320, height: 640 } : { width: 1280, height: 800 });
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await page.route("**/functions/v1/hdms-api*", route => route.fulfill({ json: payload }));
  await page.goto(base + "/");
  const map = page.locator("[data-hdms-map]");
  const layerButton = map.getByRole("button", { name: "เลเยอร์", exact: true });
  const panel = map.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });

  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    await layerButton.click();
    await expect(panel.getByRole("checkbox", { name: /^จุดน้ำท่วม/ })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: /^เส้นน้ำท่วม/ })).toHaveCount(0);
    const key = panel.locator(".citizen-legend-explainer");
    const items = key.getByRole("listitem");
    await expect(key).not.toHaveAttribute("open", "");
    await key.locator("summary").click();
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("แตะเพื่อดูสถานะการผ่านทาง");
    await expect(items.nth(1)).toContainText("แตะหมุดสี่เหลี่ยม");
    await expect(items.nth(2)).toContainText("ลูกศรสองหัว");
    for (const kind of ["flood", "detour", "direction"]) await expect(key.locator(`[data-kind="${kind}"] svg`)).toBeVisible();
    await expect(key.getByText(/ไม่มีหมุด ไม่ได้แปลว่าถนนผ่านได้เสมอ/)).toBeVisible();
    const roadExamples = key.getByRole("group", { name: "ตัวอย่างเส้นทางหลวง" });
    const main = roadExamples.getByRole("button", { name: "อธิบายสัญลักษณ์ทางหลวงสายหลัก" });
    const secondary = roadExamples.getByRole("button", { name: "อธิบายสัญลักษณ์ทางหลวงสายรอง" });
    const mainVisible = panel.getByRole("checkbox", { name: "ทางหลวงสายหลัก" });
    const secondaryVisible = panel.getByRole("checkbox", { name: "ทางหลวงสายรอง" });
    const initialVisibility = [await mainVisible.isChecked(), await secondaryVisible.isChecked()];
    const activate = (button: typeof main) => isMobile ? button.tap() : button.click();
    await activate(main);
    await expect(roadExamples.getByRole("tooltip")).toHaveText("ทางหลวงสายหลัก");
    await expect(main).toHaveAttribute("aria-expanded", "true");
    await activate(secondary);
    await expect(roadExamples.getByRole("tooltip")).toHaveText("ทางหลวงสายรอง");
    await expect(main).toHaveAttribute("aria-expanded", "false");
    expect([await mainVisible.isChecked(), await secondaryVisible.isChecked()]).toEqual(initialVisibility);
    await key.screenshot({ path: testInfo.outputPath(`map-legend-${theme}.png`) });
    await secondary.press("Escape");
    await expect(roadExamples.getByRole("tooltip")).toHaveCount(0);
    await expect(panel).toBeVisible();
    await key.locator("summary").click();

    const advanced = panel.getByText("ตั้งค่าเพิ่มเติม", { exact: true });
    await advanced.click();
    const flood = panel.getByRole("group", { name: "รูปแบบแสดงหมุดน้ำท่วม" });
    const detour = panel.getByRole("group", { name: "รูปแบบแสดงทางเลี่ยง" });
    const splitFlood = flood.getByRole("button", { name: "แยกช่วง" });
    const combinedFlood = flood.getByRole("button", { name: "รวมเหตุการณ์" });
    const splitDetour = detour.getByRole("button", { name: "แยกตามทิศทาง" });
    const combinedDetour = detour.getByRole("button", { name: "รวมทางเลี่ยง" });
    await expect(combinedFlood).toHaveAttribute("aria-pressed", "true");
    await expect(combinedDetour).toHaveAttribute("aria-pressed", "true");
    await splitFlood.click();
    await expect(splitFlood).toHaveAttribute("aria-pressed", "true");
    await expect(combinedDetour).toHaveAttribute("aria-pressed", "true");
    await splitDetour.click();
    await expect(splitDetour).toHaveAttribute("aria-pressed", "true");
    await expect(splitFlood).toHaveAttribute("aria-pressed", "true");
    for (const group of [flood, detour]) {
      expect(await group.getByRole("button").evaluateAll(buttons => buttons.every(b => b.getBoundingClientRect().height >= 44 && b.scrollWidth <= b.clientWidth))).toBe(true);
    }
    await combinedFlood.click();
    await combinedDetour.click();
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await advanced.click();
    await layerButton.click();
    await expect(panel).toHaveCount(0);
  }
});
