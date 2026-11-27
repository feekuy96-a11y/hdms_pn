import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { SystemDataPayload } from "../../db/default-data";
import { parseBoundaryIndex, parseBoundarySelection } from "../../lib/admin-boundaries";

const base = process.env.BASE_PATH || "";
const loadAsset = (name: string) => JSON.parse(readFileSync(`public/boundaries/th/${name}.json`, "utf8"));
const outline = ".hdms-administrative-boundaries path";

test("GeoThai asset validators preserve exact coverage, shared outline and axes", () => {
  const index = loadAsset("index");
  expect(parseBoundaryIndex(index).provinces).toHaveLength(77);
  expect(() => parseBoundaryIndex({ ...index, provinces: index.provinces.slice(1) })).toThrow("Incomplete provinces");
  expect(parseBoundarySelection(loadAsset("94"), "94").children).toHaveLength(12);
  const bangkokA = parseBoundarySelection(loadAsset("100905"), "100905").feature;
  const bangkokB = parseBoundarySelection(loadAsset("100910"), "100910").feature;
  expect(bangkokA).toEqual(bangkokB);
  expect(bangkokA.properties.codes).toEqual(["100905", "100910"]);
  expect(() => parseBoundarySelection(loadAsset("95"), "94")).toThrow("Invalid boundary asset");
  const bad = loadAsset("940101");
  const polygon = bad.feature.geometry.type === "Polygon" ? bad.feature.geometry.coordinates : bad.feature.geometry.coordinates[0];
  polygon[0][0].reverse();
  expect(() => parseBoundarySelection(bad, "940101")).toThrow("Invalid WGS84 coordinate");
});

const updatedAt = "2026-11-26T00:00:00Z";
const markerRecords: Pick<SystemDataPayload, "floodRoutes" | "detourRoutes"> = {
  floodRoutes: [{
    id: "F-BOUNDARIES", route_no: "42", section_name: "ช่วงทดสอบหมุดน้ำท่วม",
    km_start: "10+000", km_end: "10+500", lat_start: 6.823, lon_start: 101.231, lat_end: 6.828, lon_end: 101.241,
    coordinates_json: [[101.231, 6.823], [101.241, 6.828]], water_level_cm: 30,
    traffic_status: "WARNING", direction_meta: { sideCode: "LT", impactMode: "ONE_SIDE" },
    latest_photo_url: "", is_active: true, updated_at: updatedAt, province: "ปัตตานี",
  }],
  detourRoutes: [{
    id: "D-BOUNDARIES", flood_id_ref: "F-BOUNDARIES", route_name: "ปน.2043 ทดสอบหมุดทางเลี่ยง",
    direction_mode: "TWO_WAY", lat_start: 6.813, lon_start: 101.303, lat_end: 6.818, lon_end: 101.313,
    coordinates_json: [[101.303, 6.813], [101.307, 6.816], [101.313, 6.818]],
    description: "ตรงไป ปน.2043", is_active: true, updated_at: updatedAt,
  }],
};

async function openMap(page: Page, address: string, mobile: boolean, withMarkers = false) {
  // Only the app's own records and basemap are stubbed. The boundary network reads the generated, pinned assets.
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: {
    updatedAt, floodRoutes: [], detourRoutes: [], ...(withMarkers ? markerRecords : {}), highwayLayers: [], offices: [],
    timelineUpdates: [], mitigationProjects: [], mapStyles: null, systemSettings: { name: "ระบบทดสอบ", phone: "1586" },
  } }));
  await page.route(url => url.hostname !== "localhost" && url.hostname !== "127.0.0.1" &&
    !url.pathname.includes("/functions/v1/hdms-api"), route => route.abort());
  await page.goto(base + address);
  if (address === "/admin/" && mobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
  await page.locator("[data-hdms-map]").getByRole("button", { name: "เลเยอร์", exact: true }).click();
}

for (const address of ["/", "/admin/"]) {
  test(`GeoThai layer lazily cascades Pattani, Yala and Bangkok on ${address}`, async ({ page, isMobile }) => {
    const requests: string[] = [];
    page.on("request", req => {
      const pathname = new URL(req.url()).pathname;
      if (pathname.includes("/boundaries/th/")) requests.push(pathname.split("/").at(-1)!);
    });
    await openMap(page, address, isMobile);
    const toggle = page.getByRole("checkbox", { name: "แสดงขอบเขตการปกครอง" });
    await expect(toggle).not.toBeChecked();
    expect(requests).toEqual([]);
    if (isMobile) await toggle.tap();
    else await toggle.check();
    const province = page.getByRole("combobox", { name: "จังหวัด", exact: true });
    const district = page.getByRole("combobox", { name: "อำเภอ/เขต", exact: true });
    const subdistrict = page.getByRole("combobox", { name: "ตำบล/แขวง", exact: true });
    await expect(province).toHaveValue("94");
    await expect(province.locator("option")).toHaveCount(77);
    await expect(district.locator("option")).toHaveCount(13);
    await expect(page.locator(outline)).toHaveCount(1);
    await expect(page.locator(".hdms-administrative-boundaries")).toHaveCSS("pointer-events", "none");
    await expect(page.locator(".hdms-administrative-boundaries")).toHaveCSS("z-index", "350");
    expect(requests).toEqual(["index.json", "94.json"]);
    await expect(page.getByRole("link", { name: "CC BY 3.0 IGO" })).toBeVisible();
    await district.selectOption("9401");
    await expect(subdistrict.locator("option[value='940101']")).toHaveText(/สะบารัง/);
    await subdistrict.selectOption("940101");
    await expect(page.locator(outline)).toHaveCount(1);
    await province.selectOption("95");
    await expect(district).toHaveValue("");
    await expect(subdistrict).toBeDisabled();
    await expect(district.locator("option")).toHaveCount(9);
    await expect(page.locator(outline)).toHaveCount(1);
    await province.selectOption("10");
    await expect(district.locator("option")).toHaveCount(51);
    await district.selectOption("1009");
    await expect(subdistrict.locator("option[value='100905']")).toHaveCount(1);
    await subdistrict.selectOption("100905");
    await expect(page.getByText(/ขอบเขตร่วม:.*ไม่มีเส้นขอบเขตแยกรายแขวง/)).toBeVisible();
    await expect(page.locator(outline)).toHaveAttribute("stroke-dasharray", "2 5");
    await subdistrict.selectOption("100910");
    await expect(page.getByText(/ขอบเขตร่วม:.*ไม่มีเส้นขอบเขตแยกรายแขวง/)).toBeVisible();
    await expect(page.locator(outline)).toHaveCount(1);
    expect(requests).toEqual(["index.json", "94.json", "9401.json", "940101.json", "95.json", "10.json", "1009.json", "100905.json", "100910.json"]);
    if (isMobile) await toggle.tap();
    else await toggle.uncheck();
    await expect(page.locator(outline)).toHaveCount(0);
    await expect(province).toHaveCount(0);
  });

  test(`Pattani outline does not block flood and detour marker actions on ${address}`, async ({ page, isMobile }) => {
    await openMap(page, address, isMobile, true);
    const map = page.locator("[data-hdms-map]");
    const toggle = page.getByRole("checkbox", { name: "แสดงขอบเขตการปกครอง" });
    if (isMobile) await toggle.tap();
    else await toggle.check();
    await expect(page.locator(outline)).toBeVisible();
    await map.getByRole("button", { name: "เลเยอร์", exact: true }).click();
    await expect(toggle).not.toBeVisible();

    const floodMarker = map.locator('.leaflet-marker-icon[aria-label^="ทล.42"]');
    if (isMobile) await floodMarker.tap();
    else {
      const canvas = map.locator(".hdms-map-canvas");
      await canvas.evaluate(el => el.addEventListener("focus", () => el.setAttribute("data-test-map-focused", ""), { once: true }));
      await floodMarker.click();
      // The marker press must not focus the scrollable map canvas before mouseup.
      await expect(canvas).not.toHaveAttribute("data-test-map-focused", "");
    }
    const floodPopup = map.locator(".doh-flood-leaflet-popup");
    await expect(floodPopup).toContainText("ช่วงทดสอบหมุดน้ำท่วม");
    await expect(page.locator(outline)).toBeVisible();
    await floodPopup.locator(".leaflet-popup-close-button").click();
    await expect(floodPopup).toHaveCount(0);

    // On a narrow map, opening a flood popup may pan the second marker outside
    // of the viewport. Test the next marker from the normal map view, without
    // disabling the boundary layer or bypassing real touch hit testing.
    if (isMobile) {
      const layers = map.getByRole("button", { name: "เลเยอร์", exact: true });
      await layers.click();
      await map.getByRole("button", { name: "รีเซ็ต", exact: true }).click();
      await expect(toggle).toBeChecked();
      await layers.click();
      await expect(toggle).not.toBeVisible();
    }
    const detourMarker = map.locator('.leaflet-marker-icon[aria-label="ทางเลี่ยง: ปน.2043 ทดสอบหมุดทางเลี่ยง"]');
    if (isMobile) await detourMarker.tap();
    else await detourMarker.click();
    const detourPopup = map.locator(".doh-detour-leaflet-popup");
    await expect(detourPopup).toContainText("ปน.2043 ทดสอบหมุดทางเลี่ยง");
    await expect(page.locator(outline)).toBeVisible();
  });
}

test("boundary requests recover independently and stale province response never changes selection", async ({ page, isMobile }) => {
  await openMap(page, "/", isMobile);
  let first = true;
  await page.route("**/boundaries/th/94.json", route => {
    if (!first) return route.continue();
    first = false;
    return route.fulfill({ status: 503 });
  });
  let releaseSlow!: () => void;
  let slowStarted!: () => void;
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  const started = new Promise<void>(resolve => { slowStarted = resolve; });
  await page.route("**/boundaries/th/95.json", async route => {
    slowStarted();
    await slow;
    await route.continue().catch(() => {});
  });
  await page.getByRole("checkbox", { name: "แสดงขอบเขตการปกครอง" }).check();
  await expect(page.getByText("โหลดขอบเขตการปกครองไม่สำเร็จ", { exact: true })).toBeVisible();
  await expect(page.locator("[data-hdms-map]")).toBeVisible();
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(page.locator(outline)).toHaveCount(1);
  const province = page.getByRole("combobox", { name: "จังหวัด", exact: true });
  const district = page.getByRole("combobox", { name: "อำเภอ/เขต", exact: true });
  await province.selectOption("95");
  await started;
  try {
    await expect(page.getByText("กำลังโหลดขอบเขตการปกครอง", { exact: true })).toBeVisible();
    await expect(page.locator(outline)).toHaveCount(0);
    await province.selectOption("10");
    await expect(district.locator("option")).toHaveCount(51);
  } finally {
    releaseSlow();
  }
  await expect(province).toHaveValue("10");
  await expect(district.locator("option")).toHaveCount(51);
  await expect(page.locator(outline)).toHaveCount(1);
});
