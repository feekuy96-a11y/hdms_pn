import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const date = "2026-11-27T01:10:00.000Z";
const geometry = (lat: number) => ({
  lat_start: lat, lon_start: 101.23, lat_end: lat + 0.004, lon_end: 101.26,
  coordinates_json: [[101.23, lat], [101.245, lat + 0.002], [101.26, lat + 0.004]],
  updated_at: date,
});
const floods = [
  { id: "F-NORTH", route_no: "42", section_name: "ทดสอบฝั่งเหนือ", traffic_status: "CLOSED", lat: 6.84, is_active: true, water_level_cm: 50 },
  { id: "F-SOUTH", route_no: "43", section_name: "ทดสอบฝั่งใต้", traffic_status: "WARNING", lat: 6.81, is_active: true, water_level_cm: 20 },
  { id: "F-RESOLVED", route_no: "44", section_name: "ทดสอบคืนสภาพ", traffic_status: "NORMAL", lat: 6.88, is_active: false, water_level_cm: 0 },
].map(({ lat, ...row }) => ({ ...geometry(lat), ...row, km_start: "5+000", km_end: "6+000", direction_meta: {} }));
const detours = [
  { id: "D-2065", route_name: "ทางเลี่ยง ปน.2065 ทดสอบ", flood_id_ref: "F-NORTH", lat: 6.855, is_active: true },
  { id: "D-2016", route_name: "ทางเลี่ยง ปน.2016 ทดสอบ", flood_id_ref: "F-SOUTH", lat: 6.825, is_active: true },
  { id: "D-INACTIVE", route_name: "ทางเลี่ยงปิดชั่วคราว", flood_id_ref: "F-NORTH", lat: 6.87, is_active: false },
].map(({ lat, ...row }) => ({ ...geometry(lat), direction_mode: "FORWARD_ONLY", description: "", ...row }));
const testData = {
  updatedAt: date, floodRoutes: floods, detourRoutes: detours, offices: [], highwayLayers: [],
  timelineUpdates: [], mitigationProjects: [], floodEvents: [], eventDetourLinks: [], eventSegments: [],
  systemSettings: { name: "ระบบทดสอบ", org: "ปัตตานี", phone: "1586" },
};
async function open(page: Page) {
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: testData }));
  await page.goto(base + "/admin/");
}
async function showPane(page: Page, isMobile: boolean, name: "ฟอร์มข้อมูล" | "แผนที่ GIS") {
  if (isMobile) await page.getByRole("group", { name: "สลับมุมมองฟอร์มและแผนที่บนมือถือ" }).getByRole("button", { name }).click();
}
async function expectRoutes(page: Page, isMobile: boolean, floodIds: string[], detourIds: string[]) {
  await showPane(page, isMobile, "แผนที่ GIS");
  const canvas = page.locator(".hdms-map-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => {
    const data = JSON.parse(await canvas.getAttribute("data-public-layer-opacities", { timeout: 4000 }) || "{}");
    return [Object.keys(data.floods ?? {}).sort(), Object.keys(data.detours ?? {}).sort()];
  }).toEqual([[...floodIds].sort(), [...detourIds].sort()]);
  await showPane(page, isMobile, "ฟอร์มข้อมูล");
}

test("admin detour search and dropdowns filter the actual map overlays without hiding floods", async ({ page, isMobile }) => {
  await open(page);
  await page.getByRole("button", { name: "รายการทางเลี่ยง", exact: true }).click();
  const search = page.getByRole("textbox", { name: "ค้นหาเส้นทางเลี่ยง" });
  const flood = page.getByLabel("กรองตามจุดน้ำท่วม");
  const status = page.getByLabel("กรองตามสถานะทางเลี่ยง");
  const allFloods = ["F-NORTH", "F-SOUTH"];
  await expectRoutes(page, isMobile, allFloods, ["D-2065", "D-2016"]);
  await search.fill("2065");
  await expect(page.getByText(detours[0].route_name, { exact: true }).last()).toBeVisible();
  await expectRoutes(page, isMobile, allFloods, ["D-2065"]);
  await flood.selectOption("F-SOUTH");
  await expectRoutes(page, isMobile, allFloods, []);
  await search.clear();
  await expectRoutes(page, isMobile, allFloods, ["D-2016"]);
  await status.selectOption("INACTIVE");
  await expectRoutes(page, isMobile, allFloods, []);
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await expectRoutes(page, isMobile, allFloods, ["D-2065", "D-2016"]);
  await search.fill("2065");
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).click();
  await expectRoutes(page, isMobile, allFloods, ["D-2065", "D-2016"]);
});

test("admin flood search and dropdowns filter flood segments without hiding detours", async ({ page, isMobile }) => {
  await open(page);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).click();
  const search = page.getByRole("textbox", { name: "ค้นหาเหตุการณ์น้ำท่วม" });
  const road = page.getByLabel("กรองตามสายทางหลวง");
  const detourIds = ["D-2065", "D-2016"];
  await expectRoutes(page, isMobile, ["F-NORTH", "F-SOUTH"], detourIds);
  await search.fill("ฝั่งเหนือ");
  await expectRoutes(page, isMobile, ["F-NORTH"], detourIds);
  await road.selectOption("43");
  await expectRoutes(page, isMobile, [], detourIds);
  await search.clear();
  await expectRoutes(page, isMobile, ["F-SOUTH"], detourIds);
  await road.selectOption("44");
  await page.getByRole("button", { name: /^ปกติแล้ว/ }).click();
  await expectRoutes(page, isMobile, [], detourIds);
  await page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }).click();
  await expectRoutes(page, isMobile, ["F-NORTH", "F-SOUTH"], detourIds);
});
