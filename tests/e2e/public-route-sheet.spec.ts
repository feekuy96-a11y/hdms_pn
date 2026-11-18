import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

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
  await expect(page.getByText("จุดเฝ้าระวังน้ำท่วม 2 จุด")).toBeVisible();
  await expect(page.locator('link[data-system-favicon="true"]')).toHaveAttribute("href", /agency-logo\.png/);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 6.700001, longitude: 101.200001 });
  await page.getByRole("button", { name: "ตำแหน่งของฉัน" }).click();
  await expect(page.getByText("แสดงตำแหน่งของคุณแล้ว")).toBeVisible();
  await page.getByRole("button", { name: "ดูรายการสายทาง" }).click();
  const list = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading", { name: "สถานการณ์ทางหลวง" })).toBeVisible();
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
  await page.getByRole("button", { name: /เฝ้าระวัง \/ ระมัดระวัง/ }).click();
  await expect(list).toBeVisible();
  await expect(list.getByText("ทดสอบจุดน้ำท่วม ทล.42")).toBeVisible();
  await expect(list.getByText("สายทางที่ผ่านได้ปกติสำหรับทดสอบตัวกรอง")).toHaveCount(0);
  await list.getByRole("button", { name: "แสดงทุกสถานะ" }).click();
  await list.getByLabel("สายทาง", { exact: true }).selectOption("ALL");
  await expect(list.getByText("สายทางที่ผ่านได้ปกติสำหรับทดสอบตัวกรอง")).toBeVisible();
});

test("citizen map popups fit 360x640 mobile viewport without overflow or changing accessible names", async ({ page }) => {
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
          lat_start: 6.86,
          lon_start: 101.24,
          lat_end: 6.87,
          lon_end: 101.25,
          coordinates_json: [[101.24, 6.86], [101.25, 6.87]],
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
          lat_start: 6.85,
          lon_start: 101.23,
          lat_end: 6.855,
          lon_end: 101.25,
          coordinates_json: [[101.23, 6.85], [101.238, 6.842], [101.25, 6.855]],
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

  // 1. Flood summary popup at 360x640
  await page.locator(".doh-map-capsule-pin").first().click({ force: true });
  const floodPopup = page.locator(".doh-flood-leaflet-popup");
  await expect(floodPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await floodPopup.boundingBox();
    return Boolean(box && box.width <= 344 && box.height <= 370 && box.x >= 0 && box.x + box.width <= 360);
  }).toBe(true);
  await expect(floodPopup.getByRole("button", { name: "ดูรายละเอียด" })).toBeVisible();
  await expect(floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Open flood dossier dialog from popup and verify accessible name + close button size
  await floodPopup.getByRole("button", { name: "ดูรายละเอียด" }).click();
  await expect(floodPopup).toHaveCount(0);
  const dossier = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dossier).toBeVisible();
  const dossierClose = dossier.getByRole("button", { name: "ปิดรายละเอียด" });
  const dossierCloseBox = await dossierClose.boundingBox();
  expect(dossierCloseBox!.width).toBeGreaterThanOrEqual(44);
  expect(dossierCloseBox!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(dossier).toHaveCount(0);

  // 2. Detour popup at 360x640
  await page.locator(".doh-detour-symbol").first().click({ force: true });
  const detourPopup = page.locator(".doh-detour-leaflet-popup").filter({ hasText: "เส้นทางเลี่ยง" });
  await expect(detourPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await detourPopup.boundingBox();
    return Boolean(box && box.width <= 344 && box.height <= 370 && box.x >= 0 && box.x + box.width <= 360);
  }).toBe(true);
  await expect(detourPopup.getByRole("button", { name: "ขาไป A → B" })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: "ขากลับ B → A" })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: /นำทางด้วย Google Maps/ })).toBeVisible();
  await expect(detourPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Close button must not be obscured by top overlays or Leaflet zoom controls
  await detourPopup.locator(".leaflet-popup-close-button").click();
  await expect(detourPopup).toHaveCount(0);

  // 3. Point photo popup at 360x640
  await page.locator(".doh-detour-photo-start").first().click({ force: true });
  const photoPopup = page.locator(".doh-detour-point-photo-popup");
  await expect(photoPopup).toBeVisible();
  await expect.poll(async () => {
    const box = await photoPopup.boundingBox();
    return Boolean(box && box.width <= 344 && box.height <= 370 && box.x >= 0 && box.x + box.width <= 360);
  }).toBe(true);
  await expect(photoPopup.getByRole("button", { name: "ดูคำแนะนำทางเลี่ยง" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".doh-detour-leaflet-popup .leaflet-popup-close-button").click();
  await expect(photoPopup).toHaveCount(0);
});
