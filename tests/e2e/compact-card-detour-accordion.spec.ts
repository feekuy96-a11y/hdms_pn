import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("compact flood card, detour jump link, ordered exclusive accordion, and real data integrity", async ({ page }) => {
  const updatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [
          {
            id: "F-NARATHIWAT-1",
            route_no: "4061",
            section_name: "สะพานปะนาเระ",
            km_start: "26+790",
            km_end: "32+200",
            lat_start: 6.45,
            lon_start: 101.82,
            lat_end: 6.46,
            lon_end: 101.83,
            coordinates_json: [[101.82, 6.45], [101.83, 6.46]],
            water_level_cm: 45,
            traffic_status: "LIGHT_VEHICLES_ONLY",
            road_side: "LEFT",
            direction_meta: {
              schemaVersion: 2,
              eventId: "EV-4061",
              directionCode: "A_TO_B",
              roadSide: "LEFT",
              trafficStatusDetail: "NO_SMALL_VEHICLES",
              waterLevelKnown: true,
              affectedParts: ["LEFT_LANE"],
              updatedAt,
              photos: [],
            },
            latest_photo_url: "",
            is_active: true,
            updated_at: updatedAt,
            subdistrict: "ตันหยงมัส",
            district: "ระแงะ",
            province: "นราธิวาส",
            trend: "RISING",
          },
          {
            id: "F-PARTIAL-2",
            route_no: "418",
            section_name: "ตอนมะพร้าวต้นเดียว",
            km_start: "10+000",
            km_end: "12+500",
            lat_start: 6.81,
            lon_start: 101.21,
            lat_end: 6.82,
            lon_end: 101.22,
            coordinates_json: [[101.21, 6.81], [101.22, 6.82]],
            water_level_cm: 20,
            traffic_status: "WARNING",
            road_side: "RIGHT",
            direction_meta: {
              schemaVersion: 2,
              eventId: "EV-418",
              directionCode: "B_TO_A",
              roadSide: "RIGHT",
              trafficStatusDetail: "CAUTION",
              waterLevelKnown: true,
              affectedParts: ["RIGHT_LANE"],
              updatedAt,
              photos: [],
            },
            latest_photo_url: "",
            is_active: true,
            updated_at: updatedAt,
            district: "หนองจิก",
            trend: "STEADY",
          },
        ],
        detourRoutes: [
          {
            id: "D-SECOND",
            flood_id_ref: "F-NARATHIWAT-1",
            route_name: "ทางเลี่ยงสำรอง สาย ข",
            direction_mode: "FORWARD_ONLY",
            lat_start: 6.45,
            lon_start: 101.82,
            lat_end: 6.46,
            lon_end: 101.83,
            coordinates_json: [[101.82, 6.45], [101.825, 6.455], [101.83, 6.46]],
            description: "1. จุดเริ่มต้น: แยกบ้านน้ำบ่อ\n2. ถึงจุดบรรจบแยกปะนาเระ สัญจรต่อได้ตามปกติ",
            detour_meta: { order_index: 2, event_orders: { "EV-IGNORED": 9, "F-NARATHIWAT-1": 2 } },
            is_active: true,
            updated_at: updatedAt,
          },
          {
            id: "D-FIRST",
            flood_id_ref: "F-NARATHIWAT-1",
            route_name: "ทางเลี่ยงหลัก สาย ก",
            direction_mode: "TWO_WAY",
            lat_start: 6.45,
            lon_start: 101.82,
            lat_end: 6.46,
            lon_end: 101.83,
            coordinates_json: [[101.82, 6.45], [101.822, 6.458], [101.83, 6.46]],
            description: "=== ทิศทางขาไป ===\n1. จุดเริ่มต้น: แยกตะลุโบ๊ะ\n2. ถึงจุดบรรจบแยกสายหมอ สัญจรต่อได้ตามปกติ\n\n=== ทิศทางขากลับ ===\n1. จุดเริ่มต้น: แยกสายหมอ\n2. ถึงจุดบรรจบแยกตะลุโบ๊ะ สัญจรต่อได้ตามปกติ",
            detour_meta: {
              order_index: 1,
              event_orders: { "F-NARATHIWAT-1": 1 },
              forward_distance_m: 3400,
              forward_duration_s: 300,
              reverse_distance_m: 3600,
              reverse_duration_s: 360,
            },
            is_active: true,
            updated_at: updatedAt,
          },
        ],
        timelineUpdates: [],
        mitigationProjects: [],
        highwayLayers: [],
        offices: [],
        mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "กรมทางหลวง", desc: "", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await page.getByRole("button", { name: "ดูรายการสายทาง" }).click();
  }

  // Group 1-6 checks on first compact FloodCard (real non-Pattani province)
  const firstCard = page.locator("article:visible").filter({ hasText: "สะพานปะนาเระ" }).first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("ทล.4061 · ตอน สะพานปะนาเระ");
  await expect(firstCard).toContainText("รถเล็กไม่สามารถผ่านได้");
  await expect(firstCard).toContainText("กม.26+790 – กม.32+200");
  await expect(firstCard).toContainText("ต.ตันหยงมัส อ.ระแงะ จ.นราธิวาส");
  await expect(firstCard).toContainText("45 ซม.");
  await expect(firstCard).toContainText("ซ้ายทาง (LT)");
  await expect(firstCard).toContainText(/อัปเดต\s+5 นาทีที่แล้ว/);

  // Ensure second card has real partial area ONLY (no hardcoded จ.ปัตตานี) and shows ไม่มีเส้นทางเลี่ยง
  const partialCard = page.locator("article:visible").filter({ hasText: "ตอนมะพร้าวต้นเดียว" }).first();
  await expect(partialCard).toBeVisible();
  await expect(partialCard).toContainText("อ.หนองจิก");
  await expect(partialCard).not.toContainText("ปัตตานี");
  await expect(partialCard).toContainText("ไม่มีเส้นทางเลี่ยง");

  // Click clickable detour count on first card -> opens dossier scrolled to detour section
  await firstCard.getByRole("button", { name: "เส้นทางเลี่ยง 2 สาย" }).click();
  const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dialog).toBeVisible();

  // Accordions are ordered (#1 สาย ก, #2 สาย ข) and collapsed by default
  const firstTrigger = dialog.getByRole("button", { name: /ทางเลี่ยงที่ 1.*ทางเลี่ยงหลัก สาย ก/ });
  const secondTrigger = dialog.getByRole("button", { name: /ทางเลี่ยงที่ 2.*ทางเลี่ยงสำรอง สาย ข/ });
  await expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(secondTrigger).toHaveAttribute("aria-expanded", "false");

  // Duration integrity: recorded 300s -> 5 นาที; unrecorded -> ยังไม่มีข้อมูลเวลาเดินทาง (never 40 km/h)
  await expect(firstTrigger).toContainText("เวลาประมาณ 5 นาที");
  await expect(secondTrigger).toContainText("ยังไม่มีข้อมูลเวลาเดินทาง");
  await expect(dialog.getByText("ทางเลี่ยงหลัก สาย ก", { exact: true })).toBeVisible();
  await expect(dialog.getByText("นำทางด้วย Google Maps")).toHaveCount(0);

  // Direct action buttons are visible on the collapsed detour card without expanding first
  const firstCardWrapper = dialog.locator('[data-detour-card="D-FIRST"]');
  await expect(firstCardWrapper.getByRole("link", { name: /นำทางด้วย Google Maps/ })).toBeVisible();
  await expect(firstCardWrapper.getByRole("button", { name: /ดูตำแหน่งบนแผนที่/ })).toBeVisible();

  // Expand first accordion -> hides header summary (no duplicate) and shows metrics in 2-col grid below
  await firstTrigger.click();
  await expect(firstTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(firstTrigger).not.toContainText("เวลาประมาณ 5 นาที");
  const firstPanel = dialog.locator("#dossier-detour-panel-D-FIRST");
  await expect(firstPanel).toContainText("เวลาประมาณ 5 นาที");
  await expect(firstCardWrapper.getByRole("link", { name: /นำทางด้วย Google Maps/ })).toBeVisible();
  await expect(firstCardWrapper.getByRole("button", { name: /ดูตำแหน่งบนแผนที่/ })).toBeVisible();

  // Expand second accordion -> exclusively collapses the first
  await secondTrigger.click();
  await expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
});

test("admin detour order controls swap order_index and persist updates", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Admin table reorder test targets desktop view");
  const updated_at = "2026-11-15T10:00:00.000Z";
  const state = {
    updatedAt: updated_at,
    floodRoutes: [
      {
        id: "F-ORD",
        route_no: "42",
        section_name: "ตอนทดสอบจัดลำดับ",
        km_start: "0+000",
        km_end: "1+000",
        lat_start: 6.87,
        lon_start: 101.25,
        lat_end: 6.88,
        lon_end: 101.26,
        coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
        water_level_cm: 20,
        traffic_status: "WARNING",
        is_active: true,
        updated_at,
      },
    ],
    detourRoutes: [
      {
        id: "D-A",
        route_name: "ทางเลี่ยงลำดับที่หนึ่ง",
        flood_id_ref: "F-ORD",
        lat_start: 6.87,
        lon_start: 101.25,
        lat_end: 6.88,
        lon_end: 101.26,
        coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
        description: "สาย ก",
        direction_mode: "FORWARD_ONLY",
        detour_meta: { order_index: 1, event_orders: { "F-ORD": 1 } },
        is_active: true,
        updated_at,
      },
      {
        id: "D-B",
        route_name: "ทางเลี่ยงลำดับที่สอง",
        flood_id_ref: "F-ORD",
        lat_start: 6.87,
        lon_start: 101.25,
        lat_end: 6.88,
        lon_end: 101.26,
        coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
        description: "สาย ข",
        direction_mode: "FORWARD_ONLY",
        detour_meta: { order_index: 2, event_orders: { "F-ORD": 2 } },
        is_active: true,
        updated_at,
      },
    ],
    timelineUpdates: [],
    mitigationProjects: [],
    highwayLayers: [],
    offices: [],
    mapStyles: null,
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
  };

  const upsertPayloads: Array<{ id?: string; detourMeta?: Record<string, any> }> = [];

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      const p = body?.args?.[0] || body?.payload;
      if (body?.action === "upsertRouteAction" && p) {
        upsertPayloads.push({ id: p.id, detourMeta: p.detourMeta });
        const target = state.detourRoutes.find((d) => d.id === p.id);
        if (target && p.detourMeta) {
          target.detour_meta = p.detourMeta;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, savedId: p.id, systemData: { ...state } }),
        });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state),
    });
  });

  await page.goto(`${base}/admin/`);
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("button", { name: /รายการทางเลี่ยง/ }).click();

  const rows = page.locator("tbody tr");
  await expect(rows.nth(0)).toContainText("ทางเลี่ยงลำดับที่หนึ่ง");
  await expect(rows.nth(1)).toContainText("ทางเลี่ยงลำดับที่สอง");

  await page.getByRole("button", { name: "เลื่อนทางเลี่ยง ทางเลี่ยงลำดับที่หนึ่ง ลง" }).click();

  await expect(rows.nth(0)).toContainText("ทางเลี่ยงลำดับที่สอง");
  await expect(rows.nth(1)).toContainText("ทางเลี่ยงลำดับที่หนึ่ง");
  expect(upsertPayloads.find((p) => p.id === "D-B")?.detourMeta?.order_index).toBe(1);
  expect(upsertPayloads.find((p) => p.id === "D-A")?.detourMeta?.order_index).toBe(2);
  expect(upsertPayloads.find((p) => p.id === "D-B")?.detourMeta?.event_orders?.["F-ORD"]).toBe(1);
  expect(upsertPayloads.find((p) => p.id === "D-A")?.detourMeta?.event_orders?.["F-ORD"]).toBe(2);
});

test("map flood pin opens summary popup without stacking, per-route detour direction stays isolated, and citizen filter hides ALL", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "Map pin click integration runs in desktop view");
  const updatedAt = new Date(Date.now() - 8 * 60 * 1000).toISOString();

  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [
          {
            id: "F-MAP-1",
            route_no: "42",
            section_name: "ดอนยาง - บ้านดี",
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
              eventId: "EV-MAP-42",
              directionCode: "BOTH",
              roadSide: "RIGHT",
              trafficStatusDetail: "CAUTION",
              waterLevelKnown: true,
              affectedParts: ["RIGHT_LANE"],
              updatedAt,
              photos: [],
            },
            latest_photo_url: "",
            is_active: true,
            updated_at: updatedAt,
            subdistrict: "บ้านนอก",
            district: "ปะนาเระ",
            province: "ปัตตานี",
            trend: "STEADY",
          },
        ],
        detourRoutes: [
          {
            id: "D-MAP-1",
            flood_id_ref: "F-MAP-1",
            route_name: "ทางเลี่ยงหลัก สาย 1",
            direction_mode: "TWO_WAY",
            lat_start: 6.86,
            lon_start: 101.24,
            lat_end: 6.87,
            lon_end: 101.25,
            coordinates_json: [[101.24, 6.86], [101.25, 6.87]],
            description: "=== ทิศทางขาไป ===\n1. จุดเริ่มต้น: แยกเมาะมาวี\n2. ถึงจุดบรรจบแยกบ้านดี\n\n=== ทิศทางขากลับ ===\n1. จุดเริ่มต้น: แยกบ้านดี\n2. ถึงจุดบรรจบแยกเมาะมาวี",
            detour_meta: {
              order_index: 1,
              forward_distance_m: 12600,
              reverse_distance_m: 14100,
              reverse_duration_s: 960,
              start_point_photo: {
                url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
                caption: "ภาพปากทางเข้าแยกเมาะมาวี ฝั่งจุด A",
              },
              end_point_photo: {
                url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
                caption: "ภาพปากทางเข้าแยกบ้านดี ฝั่งจุด B (ขากลับ)",
              },
            },
            is_active: true,
            updated_at: updatedAt,
          },
          {
            id: "D-MAP-2",
            flood_id_ref: "F-MAP-1",
            route_name: "ทางเลี่ยงรอง สาย 2",
            direction_mode: "TWO_WAY",
            lat_start: 6.86,
            lon_start: 101.24,
            lat_end: 6.87,
            lon_end: 101.25,
            coordinates_json: [[101.24, 6.86], [101.25, 6.87]],
            description: "=== ทิศทางขาไป ===\n1. จุดเริ่มต้น: สาย 2 ขาไป\n\n=== ทิศทางขากลับ ===\n1. จุดเริ่มต้น: สาย 2 ขากลับ",
            detour_meta: { order_index: 2, forward_distance_m: 5400, reverse_distance_m: 5900 },
            is_active: true,
            updated_at: updatedAt,
          },
        ],
        timelineUpdates: [],
        mitigationProjects: [],
        highwayLayers: [],
        offices: [],
        mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "กรมทางหลวง", desc: "", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);

  // Filter tabs have only น้ำท่วม (default) and ทางเลี่ยง — NO ทั้งหมด button
  await expect(page.getByRole("button", { name: /^ทั้งหมด/ })).toHaveCount(0);
  const floodTab = page.getByRole("button", { name: /น้ำท่วม \(1\)/ }).first();
  const detourTab = page.getByRole("button", { name: /ทางเลี่ยง \(2\)/ }).first();
  await expect(floodTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".doh-map-capsule-pin").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".doh-detour-symbol").first()).toBeVisible({ timeout: 10_000 });

  // Switch to Detour tab -> list filters to detours while both map layers remain visible
  await detourTab.click();
  await expect(detourTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".doh-detour-symbol").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".doh-map-capsule-pin").first()).toBeVisible({ timeout: 10_000 });

  // Switch back to Flood tab -> flood list returns and flood pin stays clickable
  await floodTab.click();
  await expect(floodTab).toHaveAttribute("aria-pressed", "true");
  const floodPin = page.locator(".doh-map-capsule-pin").first();
  await expect(floodPin).toBeVisible();

  // Click flood marker -> ONLY summary popup opens; full dossier dialog does NOT auto-open
  await floodPin.click({ force: true });
  const popup = page.locator(".doh-flood-leaflet-popup");
  await expect(popup).toBeVisible();
  await expect(page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ })).toHaveCount(0);
  await expect(popup).toContainText("ช่องจราจร: ช่องจราจรขวา");
  await expect(popup).not.toContainText("ช่องจราจรขวาทาง");
  await expect(popup).not.toContainText("อีกฝั่งจราจร");

  // Click ดูรายละเอียด inside summary popup -> closes popup and opens full Dossier modal
  await popup.getByRole("button", { name: "ดูรายละเอียด" }).click();
  await expect(popup).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("อีกฝั่งจราจร");
  await expect(dialog.getByText("ช่องจราจรขวา", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel(/แผนที่แสดงตำแหน่งเหตุการณ์ ทล\.42/)).toBeVisible();

  // Toggle direction on Route 1 to B -> A; Route 2 must remain A -> B independently
  const r1Trigger = dialog.getByRole("button", { name: /ทางเลี่ยงที่ 1 – ทางเลี่ยงหลัก สาย 1/ });
  await r1Trigger.click();
  const r1Panel = dialog.locator("#dossier-detour-panel-D-MAP-1");
  await expect(r1Panel.getByText("ภาพปากทางเข้าแยกเมาะมาวี ฝั่งจุด A")).toBeVisible();
  await r1Panel.getByRole("button", { name: "ขากลับ (B → A)" }).click();
  await expect(r1Panel.getByText(/จุดเริ่มต้น: แยกบ้านดี/)).toBeVisible();
  await expect(r1Panel.getByText("ภาพปากทางเข้าแยกบ้านดี ฝั่งจุด B (ขากลับ)")).toBeVisible();
  await expect(r1Panel.getByText("1.6 กม.")).toBeVisible();
  await expect(r1Panel.getByText("เวลาประมาณ 16 นาที")).toBeVisible();

  const r2Trigger = dialog.getByRole("button", { name: /ทางเลี่ยงที่ 2 – ทางเลี่ยงรอง สาย 2/ });
  await r2Trigger.click();
  const r2Panel = dialog.locator("#dossier-detour-panel-D-MAP-2");
  await expect(r2Panel.getByRole("button", { name: "ขาไป (A → B)" })).toHaveAttribute("aria-pressed", "true");
  await expect(r2Panel.getByText(/สาย 2 ขาไป/)).toBeVisible();

  // Expand water level history -> shows real empty-history message when no DB history exists
  await dialog.getByRole("button", { name: "ดูประวัติระดับน้ำท่วม" }).click();
  await expect(dialog.getByText("ยังไม่มีข้อมูลประวัติระดับน้ำสำหรับจุดนี้")).toBeVisible();

  // Verify point photo markers A and B on the map open photo popup when clicked
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const startPhotoPin = page.locator(".doh-detour-photo-start").first();
  const endPhotoPin = page.locator(".doh-detour-photo-end").first();
  await expect(startPhotoPin).toBeVisible();
  await expect(endPhotoPin).toBeVisible();
  await startPhotoPin.click({ force: true });
  await expect(page.locator(".doh-detour-point-photo-popup")).toContainText("ภาพปากทางเข้าแยกเมาะมาวี ฝั่งจุด A");
});


test("citizen situation summary status filter, route chips, clear button, and empty state reset", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "Desktop citizen sidebar filter integration");
  const updatedAt = new Date().toISOString();

  await page.route("**/functions/v1/hdms-api", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        updatedAt,
        floodRoutes: [
          {
            id: "F-EMERALD-418",
            route_no: "418",
            section_name: "ดอนยาง - ยะลา (ปกติ)",
            km_start: "5+000",
            km_end: "5+500",
            lat_start: 6.80,
            lon_start: 101.20,
            lat_end: 6.81,
            lon_end: 101.21,
            coordinates_json: [[101.20, 6.80], [101.21, 6.81]],
            water_level_cm: 0,
            traffic_status: "PASSABLE",
            is_active: true,
            updated_at: updatedAt,
          },
          {
            id: "F-RED-42",
            route_no: "42",
            section_name: "ดอนยาง - บ้านดี (ผ่านไม่ได้)",
            km_start: "103+200",
            km_end: "104+000",
            lat_start: 6.86,
            lon_start: 101.24,
            lat_end: 6.87,
            lon_end: 101.25,
            coordinates_json: [[101.24, 6.86], [101.25, 6.87]],
            water_level_cm: 50,
            traffic_status: "CLOSED",
            is_active: true,
            updated_at: updatedAt,
          },
          {
            id: "F-ORANGE-42",
            route_no: "42",
            section_name: "ดอนยาง - ปะนาเระ (รถเล็กผ่านไม่ได้)",
            km_start: "110+000",
            km_end: "110+400",
            lat_start: 6.88,
            lon_start: 101.26,
            lat_end: 6.89,
            lon_end: 101.27,
            coordinates_json: [[101.26, 6.88], [101.27, 6.89]],
            water_level_cm: 25,
            traffic_status: "WARNING",
            direction_meta: { trafficStatusDetail: "NO_SMALL_VEHICLES" },
            is_active: true,
            updated_at: updatedAt,
          },
        ],
        detourRoutes: [],
        timelineUpdates: [],
        mitigationProjects: [],
        highwayLayers: [],
        offices: [],
        mapStyles: null,
        systemSettings: { name: "ระบบทดสอบ", org: "กรมทางหลวง", desc: "", phone: "1586" },
      }),
    });
  });

  await page.goto(`${base}/`);

  const sidebar = page.locator("div.lg\\:flex").filter({ hasText: "จุดเฝ้าระวังและน้ำท่วมทางหลวง" });
  await expect(sidebar).toBeVisible();

  // 1. SituationSummary lists items with counts
  const summary = sidebar.locator("ul[aria-label='สรุปสถานการณ์ทุกจุด']");
  await expect(summary).toBeVisible();
  const redFilterBtn = summary.getByRole("button", { name: /1 ผ่านไม่ได้/ });
  const orangeFilterBtn = summary.getByRole("button", { name: /1 รถเล็กไม่สามารถผ่านได้/ });
  const emeraldFilterBtn = summary.getByRole("button", { name: /1 ผ่านได้ปกติ/ });
  await expect(redFilterBtn).toBeVisible();
  await expect(orangeFilterBtn).toBeVisible();
  await expect(emeraldFilterBtn).toBeVisible();

  // 2. Initial list displays all 3 items sorted by severity: CLOSED > WARNING > PASSABLE
  const floodCards = sidebar.locator("article");
  await expect(floodCards).toHaveCount(3);
  await expect(floodCards.nth(0)).toContainText("ทล.42");
  await expect(floodCards.nth(0)).toContainText("ผ่านไม่ได้");
  await expect(floodCards.nth(1)).toContainText("รถเล็กไม่สามารถผ่านได้");
  await expect(floodCards.nth(2)).toContainText("ผ่านได้ปกติ");

  // 3. Click red filter button -> only CLOSED card shown, "แสดงทุกสถานะ" button appears
  await redFilterBtn.click();
  await expect(redFilterBtn).toHaveAttribute("aria-pressed", "true");
  await expect(floodCards).toHaveCount(1);
  await expect(floodCards.first()).toContainText("ผ่านไม่ได้");

  const showAllStatusBtn = sidebar.getByRole("button", { name: "แสดงทุกสถานะ" });
  await expect(showAllStatusBtn).toBeVisible();
  await showAllStatusBtn.click();
  await expect(redFilterBtn).toHaveAttribute("aria-pressed", "false");
  await expect(floodCards).toHaveCount(3);

  // 4. Click route chip ทล.418 -> only 418 shown, and clear filter button appears next to search
  const chip418 = sidebar.getByRole("button", { name: "ทล.418", exact: true });
  await expect(chip418).toBeVisible();
  await chip418.click();
  await expect(chip418).toHaveAttribute("aria-pressed", "true");
  await expect(floodCards).toHaveCount(1);
  await expect(floodCards.first()).toContainText("ดอนยาง - ยะลา (ปกติ)");

  const clearFilterBtn = sidebar.getByRole("button", { name: "ล้างตัวกรอง" });
  await expect(clearFilterBtn).toBeVisible();

  // 5. Select CLOSED while on 418 -> 0 matches -> empty state with clear button
  await redFilterBtn.click();
  await expect(floodCards).toHaveCount(0);
  await expect(sidebar.getByText(/กรุณาลองเปลี่ยนคำค้นหา หรือกดปุ่มด้านล่างเพื่อล้างตัวกรอง/)).toBeVisible();
  const emptyResetBtn = sidebar.getByRole("button", { name: "ล้างตัวกรอง" });
  await expect(emptyResetBtn).toBeVisible();
  await emptyResetBtn.click();

  // 6. All items restored
  await expect(floodCards).toHaveCount(3);
  await expect(redFilterBtn).toHaveAttribute("aria-pressed", "false");
  await expect(chip418).toHaveAttribute("aria-pressed", "false");
});
