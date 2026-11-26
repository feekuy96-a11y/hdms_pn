import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";

type PublicLayerOpacities = {
  zoom: number;
  highwayFeatures: Record<string, { opacity: number; x: number; y: number }>;
  floods: Record<string, number>;
  detours: Record<string, number>;
  highways: Record<string, number>;
  interactive: { floods: Record<string, boolean>; detours: Record<string, boolean> };
};

const readPublicLayerOpacities = async (page: Page) =>
  page.locator("[data-public-layer-opacities]").evaluate((element) =>
    JSON.parse((element as HTMLElement).dataset.publicLayerOpacities || "{}") as PublicLayerOpacities
  );

for (const admin of [false, true]) {
test(`${admin ? "admin" : "public"} highway popup restores the search filter after closing`, async ({ page, isMobile }) => {
  test.skip(admin && isMobile, "Admin map verification on desktop");
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
      highwayLayers: [{ layer_id: "MAIN_HIGHWAY", layer_name: "สายหลัก", is_visible: true,
        color_hex: "#1B5E20", line_width: 5,
        geojson_data: { type: "FeatureCollection", features: [
          { type: "Feature", properties: { route_no: "42", section_name: "ช่วงทดสอบ A" }, geometry: { type: "LineString", coordinates: [[101.18, 6.85], [101.22, 6.85]] } },
          { type: "Feature", properties: { route_no: "42", section_name: "ช่วงทดสอบ B" }, geometry: { type: "LineString", coordinates: [[101.18, 6.90], [101.22, 6.90]] } },
          { type: "Feature", properties: { route_no: "43" }, geometry: { type: "LineString", coordinates: [[101.18, 6.88], [101.22, 6.88]] } },
        ] } }],
    }),
  }));
  await page.goto(`${base}/${admin ? "admin/" : ""}`);
  await expect.poll(async () => Object.keys((await readPublicLayerOpacities(page)).highwayFeatures || {}).length).toBe(3);
  if (!isMobile) {
    await page.locator('input[type="search"], input[placeholder*="ค้นหาสายทาง"]').first().fill("42");
    await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures["MAIN_HIGHWAY:2"].opacity).toBe(0);
  }
  for (const [selected, other, title] of [
    ["MAIN_HIGHWAY:0", "MAIN_HIGHWAY:1", "ช่วงทดสอบ A"],
    ["MAIN_HIGHWAY:1", "MAIN_HIGHWAY:0", "ช่วงทดสอบ B"],
  ]) {
    const features = (await readPublicLayerOpacities(page)).highwayFeatures;
    expect(features[selected].opacity).toBeGreaterThan(0);
    expect(features[other].opacity).toBeGreaterThan(0);
    const map = page.locator("[data-public-layer-opacities]");
    await map.click({ position: { x: features[selected].x, y: features[selected].y } });
    await expect(page.locator(".leaflet-popup")).toContainText(title);
    await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures[other].opacity).toBe(0);
    await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures[selected].opacity).toBeGreaterThan(0);
    const close = page.locator(".leaflet-popup-close-button");
    const adminToolbar = page.getByRole("group", { name: "เครื่องมือแผนที่" });
    if (admin) {
      await expect(adminToolbar).toBeVisible();
      // Leaflet keeps the close button reachable without covering the right toolbar.
      await expect.poll(async () => {
        const toolbar = await adminToolbar.boundingBox();
        return close.evaluate((element, bar) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return Boolean(bar && (rect.top >= bar.y + bar.height || rect.left >= bar.x + bar.width || rect.right <= bar.x) && hit && element.contains(hit));
        }, toolbar);
      }).toBe(true);
    }
    await close.click();
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    if (admin) await expect(adminToolbar).toBeVisible();
    await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures[other].opacity).toBeGreaterThan(0);
    if (!isMobile) {
      await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures["MAIN_HIGHWAY:2"].opacity).toBe(0);
    }
  }
  if (admin) {
    await page.getByRole("button", { name: "เลือกจุด A", exact: true }).click();
    await expect.poll(async () => (await readPublicLayerOpacities(page)).highwayFeatures["MAIN_HIGHWAY:2"].opacity).toBeGreaterThan(0);
  }
});
}

test("citizen route sheet filters floods and detours and returns from details without stacking sheets", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Citizen sheet is a mobile-only view");
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const updatedAt = "2026-11-11T03:00:00.000Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [{
          id: "F-42", route_no: "42", section_name: "ทดสอบจุดน้ำท่วม ทล.42",
          km_start: "1+000", km_end: "1+200", lat_start: 6.87, lon_start: 101.25,
          lat_end: 6.88, lon_end: 101.27, coordinates_json: [[101.25, 6.87], [101.27, 6.88]],
          water_level_cm: 30, traffic_status: "WARNING", direction_meta: {},
          latest_photo_url: "", is_active: true, updated_at: updatedAt,
        }, {
          id: "F-43", route_no: "43", section_name: "สายทางที่ผ่านได้ปกติสำหรับทดสอบตัวกรอง",
          km_start: "2+000", km_end: "2+200", lat_start: 6.89, lon_start: 101.28,
          lat_end: 6.90, lon_end: 101.30, coordinates_json: [[101.28, 6.89], [101.30, 6.90]],
          water_level_cm: 0, traffic_status: "PASSABLE", direction_meta: {},
          latest_photo_url: "", is_active: true, updated_at: updatedAt,
        }],
        detourRoutes: [{
          id: "D-42", flood_id_ref: "F-42",
          route_name: "เส้นทางเลี่ยง ทล.42 ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่โดยไม่หายไป",
          description: "1. เริ่มจากทางแยก ทล.42\n2. เลี้ยวเข้าถนนท้องถิ่น",
          direction_mode: "FORWARD_ONLY", is_active: true, updated_at: updatedAt,
          lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.27,
          coordinates_json: [[101.25, 6.87], [101.27, 6.88]],
        }, {
          id: "D-LOCAL-006", flood_id_ref: null,
          route_name: "ทางเลี่ยง ปน.ถ.006 ทดสอบชิปอิสระ",
          description: "ใช้ ปน.ถ.006 เมื่อเส้นหลักปิด",
          direction_mode: "FORWARD_ONLY", is_active: true, updated_at: updatedAt,
          lat_start: 6.90, lon_start: 101.30, lat_end: 6.91, lon_end: 101.31,
          coordinates_json: [[101.30, 6.90], [101.31, 6.91]],
        }],
        timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [],
        mapStyles: null, systemSettings: {
          name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586",
          logoUrl: "https://cdn.example.test/agency-logo.png",
        },
      }),
    });
  });

  await page.goto(`${base}/`);
  // Wait for the intercepted live payload instead of opening an empty sheet
  // while TanStack Query is still resolving its initial request.
  await expect(page.getByText("น้ำท่วม 2 จุด")).toBeVisible();
  await expect(page.locator('link[data-system-favicon="true"]')).toHaveAttribute("href", /agency-logo\.png/);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 6.700001, longitude: 101.200001 });
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).click();
  await expect(page.getByText("แสดงตำแหน่งของคุณแล้ว")).toBeVisible();
  await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  const list = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading", { name: "เหตุการณ์น้ำท่วม" })).toBeVisible();
  // Flood chips only represent active highway flood routes; local-road detours
  // must not leak into this tab.
  expect((await list.getByLabel("สายทาง", { exact: true }).locator("option").allTextContents()).join(" ")).not.toContain("ปน.");
  await list.getByLabel("สายทาง", { exact: true }).selectOption("42");
  await list.getByRole("button", { name: /ทางเลี่ยง \(1\)/ }).click();
  const detour = list.getByRole("button", { name: /ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่/ });
  await expect(detour).toBeVisible();
  await detour.click();
  const detail = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(detail).toBeVisible();
  await expect(list).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "ปิดหน้าต่างคำแนะนำทางเลี่ยง" })).toBeFocused();
  await expect(detail.getByRole("heading", { name: /ชื่อเส้นทางยาวที่ต้องขึ้นบรรทัดใหม่/ })).toBeVisible();
  await expect(detail.getByRole("button", { name: /ขาไป.*A.*B/ })).toBeEnabled();
  await expect(detail.getByRole("button", { name: /ขากลับ.*B.*A/ })).toBeDisabled();
  await expect(detail.getByText("เริ่มจากทางแยก ทล.42")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(list).toBeVisible();
  await expect(list.getByLabel("สายทาง", { exact: true })).toHaveValue("42");
  await list.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await expect(list).toHaveCount(0);

  // A status card is a real map/list filter, not decoration. Selecting the
  // warning bucket must hide a normally-passable record from the citizen sheet.
  await page.getByRole("button", { name: "น้ำท่วม 2 จุด", exact: true }).click();
  await page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" }).getByRole("button", { name: /รถเล็กไม่สามารถผ่านได้|รถเล็กผ่านไม่ได้/ }).click();
  await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  await expect(list).toBeVisible();
  await expect(list.getByText("ทดสอบจุดน้ำท่วม ทล.42")).toBeVisible();
  await expect(list.getByText("สายทางที่ผ่านได้ปกติสำหรับทดสอบตัวกรอง")).toHaveCount(0);
  await list.getByRole("button", { name: "แสดงทุกสถานะ" }).click();
  await list.getByLabel("สายทาง", { exact: true }).selectOption("ALL");
  await expect(list.getByText("สายทางที่ผ่านได้ปกติสำหรับทดสอบตัวกรอง")).toBeVisible();

  await list.getByRole("button", { name: /ทางเลี่ยง \(2\)/ }).click();
  const routeSelect = list.getByLabel("สายทาง", { exact: true });
  expect((await routeSelect.locator("option").allTextContents()).join(" ")).toContain("ปน.ถ.006");
  await routeSelect.selectOption("ปน.ถ.006");
  await expect(list.getByRole("button", { name: /ปน\.ถ\.006 ทดสอบชิปอิสระ/ })).toBeVisible();
  await expect(page.getByText("กำลังกรอง: ปน.ถ.006")).toBeVisible();
  await expect(page.locator("[data-public-filter-counts]")).toHaveAttribute("data-public-filter-counts", /detour:1/);
  // Verify the actual Leaflet marker wrapper is de-emphasized, not only React state.
  await expect.poll(() => page.locator(".doh-detour-symbol").first().evaluate((element) =>
    element.closest(".leaflet-marker-icon")?.getAttribute("data-filter-opacity")
  )).toBe("0");
});

test("citizen map popups fit 360x640 mobile viewport without overflow or changing accessible names", async ({ page }) => {
  // This flow exercises several popups and an intentional zoom transition
  // before the progressive A/B photo marker becomes available.
  test.setTimeout(90_000);
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Mobile popup layout verification runs in mobile view");
  await page.setViewportSize({ width: 360, height: 640 });
  const updatedAt = new Date(Date.now() - 8 * 60 * 1000).toISOString();

  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [{
          id: "F-MOB-42",
          route_no: "42",
          section_name: "ตอนดอนยาง - บ้านดี ชื่อตอนยาวสำหรับทดสอบมือถือ",
          km_start: "103+200",
          km_end: "104+850",
          lat_start: 6.83,
          lon_start: 101.225,
          lat_end: 6.84,
          lon_end: 101.235,
          coordinates_json: [[101.225, 6.83], [101.235, 6.84]],
          water_level_cm: 35,
          traffic_status: "WARNING",
          road_side: "RIGHT",
          affected_lanes: "ช่องจราจรขวา",
          direction_meta: {
            schemaVersion: 2,
            directionCode: "BOTH",
            roadSide: "RIGHT",
            trafficStatusDetail: "CAUTION",
            waterLevelKnown: true,
            affectedParts: ["RIGHT_LANE"],
            updatedAt,
            photos: [{ dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=" }],
          },
          latest_photo_url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
          is_active: true,
          updated_at: updatedAt,
          subdistrict: "บ้านนอก",
          district: "ปะนาเระ",
          province: "ปัตตานี",
        }],
        detourRoutes: [{
          id: "D-MOB-1",
          flood_id_ref: "F-MOB-42",
          route_name: "เส้นทางเลี่ยง ทล.42 ชื่อยาวสำหรับทดสอบป๊อปอัพมือถือไม่ให้ล้นจอ",
          direction_mode: "TWO_WAY",
          lat_start: 6.79,
          lon_start: 101.26,
          lat_end: 6.79,
          lon_end: 101.29,
          coordinates_json: [[101.26, 6.79], [101.275, 6.795], [101.29, 6.79]],
          description: "=== ทิศทางขาไป ===\n1. จุดเริ่มต้น: แยกเมาะมาวี\n2. ถึงจุดบรรจบแยกบ้านดี\n\n=== ทิศทางขากลับ ===\n1. จุดเริ่มต้น: แยกบ้านดี\n2. ถึงจุดบรรจบแยกเมาะมาวี",
          detour_meta: {
            order_index: 1,
            forward_distance_m: 12600,
            reverse_distance_m: 14100,
            start_point_photo: {
              url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
              caption: "ภาพปากทางเข้าจุด A",
            },
          },
          is_active: true,
          updated_at: updatedAt,
        }],
        timelineUpdates: [],
        mitigationProjects: [],
        highwayLayers: [],
        offices: [],
        mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);
  await expect(page.locator(".doh-map-capsule-pin").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".doh-detour-symbol").first()).toBeVisible({ timeout: 15_000 });

  // 0. Top summary bar at 360x640 must show both badges fully without clipping or colliding with legend toggle
  const floodBadge = page.getByText("น้ำท่วม 1 จุด", { exact: true });
  const detourBadge = page.getByText("ทางเลี่ยง 1 เส้นทาง", { exact: true });
  const legendBtn = page.getByRole("button", { name: /เลเยอร์/, exact: true });
  await expect(floodBadge).toBeVisible();
  await expect(detourBadge).toBeVisible();
  await expect(legendBtn).toBeVisible();
  const [floodBadgeBox, detourBadgeBox, legendBtnBox] = await Promise.all([
    floodBadge.boundingBox(),
    detourBadge.boundingBox(),
    legendBtn.boundingBox(),
  ]);
  expect(floodBadgeBox && detourBadgeBox && legendBtnBox).toBeTruthy();
  const boxesDoNotOverlap = (a: NonNullable<typeof floodBadgeBox>, b: NonNullable<typeof floodBadgeBox>) =>
    a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
  expect(boxesDoNotOverlap(floodBadgeBox!, legendBtnBox!)).toBe(true);
  expect(boxesDoNotOverlap(detourBadgeBox!, legendBtnBox!)).toBe(true);
  expect(detourBadgeBox!.x + detourBadgeBox!.width).toBeLessThanOrEqual(360);
  await expect.poll(() =>
    detourBadge.evaluate((el) => {
      const container = el.parentElement?.parentElement;
      return container ? container.scrollWidth <= container.clientWidth + 1 : true;
    })
  ).toBe(true);

  // 1. Flood summary popup at 360x640
  await page.locator(".doh-map-capsule-pin").first().click();
  const floodPopup = page.locator(".doh-flood-leaflet-popup");
  await expect(floodPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await floodPopup.boundingBox();
    return box
      ? { okWidth: box.width <= 344, okHeight: box.height <= 370, okLeft: box.x >= 0, okRight: box.x + box.width <= 360 }
      : null;
  }).toEqual({ okWidth: true, okHeight: true, okLeft: true, okRight: true });
  await expect(floodPopup.getByRole("button", { name: "ดูรายละเอียด" })).toBeVisible();
  await expect(floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Responsive flood markers may change appearance on zoom, but their open
  // popup must remain attached to the same retained marker layer.
  // The compact mobile popup deliberately occupies the control corner. Send a
  // wheel event to Leaflet's canvas and assert that a real zoom change occurs.
  const mapCanvas = page.locator(".leaflet-container");
  const zoomBefore = await mapCanvas.evaluate((element) =>
    JSON.parse(element.getAttribute("data-public-layer-opacities") || "{}").zoom
  );
  await mapCanvas.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -720,
    }));
  });
  await expect.poll(() => mapCanvas.evaluate((element) =>
    JSON.parse(element.getAttribute("data-public-layer-opacities") || "{}").zoom
  )).toBeGreaterThan(zoomBefore);
  await expect(floodPopup).toBeVisible();

  // Open flood dossier dialog from popup and verify accessible name + close button size
  await floodPopup.getByRole("button", { name: "ดูรายละเอียด" }).click();
  await expect(floodPopup).toHaveCount(0);
  const dossier = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dossier).toBeVisible();
  const dossierClose = dossier.getByRole("button", { name: "ปิดรายละเอียด" });
  const dossierCloseBox = await dossierClose.boundingBox();
  expect(dossierCloseBox!.width).toBeGreaterThanOrEqual(43.99);
  expect(dossierCloseBox!.height).toBeGreaterThanOrEqual(43.99);
  await page.keyboard.press("Escape");
  await expect(dossier).toHaveCount(0);

  // 2. Detour popup at 360x640
  // Activate the detour marker via keyboard (role="button", tabindex=0). After closing the dossier,
  // Leaflet flyTo() can leave the marker under the mobile floating bar or the A endpoint marker,
  // so a pointer click is position-dependent; Enter exercises the same accessible control deterministically.
  const detourSymbol = page.locator(".doh-detour-symbol").first();
  await detourSymbol.focus();
  await detourSymbol.press("Enter");
  const detourPopup = page.locator(".doh-detour-leaflet-popup").filter({ hasText: "เส้นทางเลี่ยง" });
  await expect(detourPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await detourPopup.boundingBox();
    return box
      ? { okWidth: box.width <= 344, okHeight: box.height <= 370, okLeft: box.x >= 0, okRight: box.x + box.width <= 360 }
      : null;
  }).toEqual({ okWidth: true, okHeight: true, okLeft: true, okRight: true });
  await expect(detourPopup.getByRole("button", { name: "ขาไป A → B" })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: "ขากลับ B → A" })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: /ดูบน Google Maps/ })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Close button must not be obscured by top overlays or Leaflet zoom controls
  await detourPopup.locator(".leaflet-popup-close-button").click();
  await expect(detourPopup).toHaveCount(0);

  // 3. Point photo popup at 360x640
  // A/B photo markers are deliberately hidden in the default overview and
  // become available only after the user zooms in.
  await page.getByRole("button", { name: "Zoom in" }).click();
  const startPhotoMarker = page.locator(".doh-detour-photo-start").first();
  await expect(startPhotoMarker).toBeVisible();
  // The marker can be outside the current mobile viewport after a prior map
  // focus; keyboard activation remains available and avoids a coordinate-only
  // assertion for this accessible map control.
  await startPhotoMarker.focus();
  await startPhotoMarker.press("Enter");
  const photoPopup = page.locator(".doh-detour-point-photo-popup");
  await expect(photoPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await photoPopup.boundingBox();
    return box
      ? { okWidth: box.width <= 344, okHeight: box.height <= 370, okLeft: box.x >= 0, okRight: box.x + box.width <= 360 }
      : null;
  }).toEqual({ okWidth: true, okHeight: true, okLeft: true, okRight: true });
  await expect(photoPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".doh-detour-leaflet-popup .leaflet-popup-close-button").click();
  await expect(photoPopup).toHaveCount(0);
});

test("public map restores flood, detour and highway opacity after closing each dossier", async ({ page }) => {
  const updatedAt = "2026-11-11T03:00:00.000Z";
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      updatedAt,
      floodRoutes: [
        { id: "F-42", route_no: "42", section_name: "น้ำท่วม ทล.42", km_start: "1+000", km_end: "1+200", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.27, coordinates_json: [[101.25, 6.87], [101.27, 6.88]], water_level_cm: 30, traffic_status: "WARNING", direction_meta: {}, latest_photo_url: "", is_active: true, updated_at: updatedAt },
        { id: "F-43", route_no: "43", section_name: "น้ำท่วม ทล.43", km_start: "2+000", km_end: "2+200", lat_start: 6.89, lon_start: 101.28, lat_end: 6.90, lon_end: 101.30, coordinates_json: [[101.28, 6.89], [101.30, 6.90]], water_level_cm: 20, traffic_status: "WARNING", direction_meta: {}, latest_photo_url: "", is_active: true, updated_at: updatedAt },
      ],
      detourRoutes: [
        { id: "D-42", flood_id_ref: "F-42", route_name: "ทางเลี่ยง ทล.42", description: "ทางเลี่ยงสำหรับ ทล.42", direction_mode: "TWO_WAY", is_active: true, updated_at: updatedAt, lat_start: 6.86, lon_start: 101.24, lat_end: 6.88, lon_end: 101.27, coordinates_json: [[101.24, 6.86], [101.27, 6.88]] },
        { id: "D-43", flood_id_ref: "F-43", route_name: "ทางเลี่ยง ทล.43", description: "ทางเลี่ยงสำหรับ ทล.43", direction_mode: "TWO_WAY", is_active: true, updated_at: updatedAt, lat_start: 6.88, lon_start: 101.27, lat_end: 6.90, lon_end: 101.31, coordinates_json: [[101.27, 6.88], [101.31, 6.90]] },
      ],
      highwayLayers: [{
        layer_id: "MAIN_HIGHWAY", layer_name: "ทางหลวงสายหลัก", color_hex: "#1B5E20", line_width: 5, is_visible: true,
        geojson_data: { type: "FeatureCollection", features: [
          { type: "Feature", properties: { route_no: "42", route_name: "ทล.42" }, geometry: { type: "LineString", coordinates: [[101.23, 6.85], [101.28, 6.89]] } },
          { type: "Feature", properties: { route_no: "43", route_name: "ทล.43" }, geometry: { type: "LineString", coordinates: [[101.27, 6.88], [101.32, 6.91]] } },
        ] },
      }],
      timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
      systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
    }),
  }));

  await page.goto(`${base}/`);
  await expect(page.locator(".doh-map-capsule-pin")).toHaveCount(2);
  await expect.poll(async () => Object.keys((await readPublicLayerOpacities(page)).highways).sort().join(",")).toBe("42,43");
  const initial = await readPublicLayerOpacities(page);
  expect(initial.floods["F-42"]).toBeCloseTo(initial.floods["F-43"], 4);
  expect(initial.detours["D-42"]).toBeCloseTo(initial.detours["D-43"], 4);
  expect(initial.highways["42"]).toBeCloseTo(initial.highways["43"], 4);
  const ratio = async (kind: "floods" | "detours" | "highways", id: string) =>
    (await readPublicLayerOpacities(page))[kind][id] / initial[kind][id];

  while ((await readPublicLayerOpacities(page)).zoom >= 10) {
    const zoom = (await readPublicLayerOpacities(page)).zoom;
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect.poll(async () => (await readPublicLayerOpacities(page)).zoom).toBeLessThan(zoom);
  }
  await expect.poll(() => ratio("floods", "F-43")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("detours", "D-43")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("highways", "43")).toBeCloseTo(1, 4);

  await page.locator(".doh-map-capsule-pin").first().click();
  await page.locator(".doh-flood-leaflet-popup").getByRole("button", { name: "ดูรายละเอียด" }).click();
  const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(floodDialog).toBeVisible();
  await expect.poll(() => ratio("floods", "F-42")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("floods", "F-43")).toBe(0);
  await expect.poll(() => ratio("detours", "D-42")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("detours", "D-43")).toBe(0);
  await expect.poll(() => ratio("highways", "42")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("highways", "43")).toBe(0);
  await expect.poll(async () => (await readPublicLayerOpacities(page)).interactive.floods["F-43"]).toBe(false);
  await expect.poll(async () => (await readPublicLayerOpacities(page)).interactive.detours["D-43"]).toBe(false);
  await page.keyboard.press("Escape");
  await expect(floodDialog).toHaveCount(0);
  await expect.poll(() => ratio("floods", "F-43")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("detours", "D-43")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("highways", "43")).toBeCloseTo(1, 4);
  await expect.poll(async () => (await readPublicLayerOpacities(page)).interactive.floods["F-43"]).toBe(true);
  await expect.poll(async () => (await readPublicLayerOpacities(page)).interactive.detours["D-43"]).toBe(true);

  const routeList = (page.viewportSize()?.width ?? 1280) < 1024
    ? page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" })
    : page.locator("div.hidden.lg\\:flex").filter({ has: page.getByRole("heading", { name: /ตรวจสอบเส้นทาง/ }) });
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  }
  await expect(routeList).toBeVisible();
  await routeList.getByRole("button", { name: /ทางเลี่ยง \(2\)/ }).click();
  await routeList.getByRole("button", { name: /ทางเลี่ยง ทล\.42/ }).click();
  const detourDialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(detourDialog).toBeVisible();
  await expect.poll(() => ratio("detours", "D-42")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("detours", "D-43")).toBe(0);
  await expect.poll(() => ratio("highways", "42")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("highways", "43")).toBe(0);
  await page.keyboard.press("Escape");
  await expect(detourDialog).toHaveCount(0);
  await expect.poll(() => ratio("detours", "D-43")).toBeCloseTo(1, 4);
  await expect.poll(() => ratio("highways", "43")).toBeCloseTo(1, 4);
});
