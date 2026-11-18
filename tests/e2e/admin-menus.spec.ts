import { expect, test } from "@playwright/test";
import JSZip from "jszip";

const menus = [
  ["จัดการระบบ", "ข้อมูลทั่วไปและเบอร์โทรฉุกเฉิน"],
  ["จัดการแผนที่", "จัดการแผนที่และรายงานเหตุการณ์"],
  ["รายการเหตุการณ์", "ทะเบียนเหตุการณ์น้ำท่วม"],
  ["รายการทางเลี่ยง", "เส้นทางเลี่ยงทั้งหมด"],
  ["โครงข่ายสายทาง", "โครงข่ายสายทาง"],
  ["สไตล์เส้นทาง", "สตูดิโอปรับแต่งสไตล์เส้น"],
  ["งานเบื้องหลัง", "งานส่งข้อมูลเบื้องหลัง"],
] as const;
const base = process.env.BASE_PATH || "";
const openMenu = async (page: import("@playwright/test").Page, menu: string) => {
  await page.getByRole("complementary").getByRole("button", { name: new RegExp(menu) }).click();
};

test("admin menus open real workspaces without UI errors", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Full menu audit is desktop-first; mobile smoke is covered separately");
  await page.goto(`${base}/admin/`);
  await expect(page).toHaveURL(/\/admin\/?$/);

  for (const [menu, landmark] of menus) {
    await openMenu(page, menu);
    await expect(page.locator(".doh-form").getByText(landmark, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  }
});

test("highway specifications use kilometer posts, office data, and calculated distance", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Specification modal is covered in desktop layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "โครงข่ายสายทาง");
  await page.getByRole("button", { name: /เพิ่มสายทางใหม่/ }).click();
  await expect(page.getByText("กม.เริ่มต้น", { exact: true })).toBeVisible();
  await expect(page.getByText("กม.สิ้นสุด", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ระยะทางคำนวณอัตโนมัติ")).toHaveAttribute("readonly", "");

  await page.getByLabel("กม.เริ่มต้น").fill("1+020");
  await page.getByLabel("กม.สิ้นสุด").fill("69+759");
  await expect(page.getByLabel("ระยะทางคำนวณอัตโนมัติ")).toHaveValue("68.739");
  for (const lanes of ["2 ช่องจราจร", "3 ช่องจราจร", "4 ช่องจราจร", "6 ช่องจราจร", "8 ช่องจราจร"]) {
    await expect(page.locator("select").filter({ has: page.locator(`option[value="${lanes}"]`) })).toHaveCount(1);
  }
  for (const surface of ["AC.", "Conc.", "DST."]) await expect(page.locator(`option[value="${surface}"]`)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "บันทึกคุณสมบัติทางวิศวกรรม" })).toBeVisible();
});

test("route geometry editor opens with coordinate selection and export controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Geometry editor is covered in desktop layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "โครงข่ายสายทาง");
  const editRoute = page.getByRole("button", { name: "แนวถนน", exact: true }).first();
  test.skip(await editRoute.count() === 0, "No imported highway geometry is currently available");
  await editRoute.click();
  await expect(page.getByRole("heading", { name: "ปรับแนวถนนทางหลวง" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เกาะแนวถนน" })).toBeVisible();
  await expect(page.getByRole("button", { name: "คืนค่าแนวเดิม" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งออก GeoJSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งออก KML" })).toBeVisible();
});

test("admin workspaces expose their primary controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Full menu audit is desktop-first; mobile smoke is covered separately");
  await page.goto(`${base}/admin/`);
  const checks = [
    ["จัดการระบบ", "บันทึกข้อมูลระบบ"],
    ["รายการเหตุการณ์", "เพิ่มเหตุการณ์"],
    ["รายการทางเลี่ยง", "วาดทางเลี่ยงใหม่บนแผนที่"],
    ["โครงข่ายสายทาง", "เลือกไฟล์โครงข่ายเส้นทางหลวง"],
  ] as const;

  for (const [menu, control] of checks) {
    await openMenu(page, menu);
    await expect(page.getByText(control, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  }

  // Hidden Governor & Executive View controls per current UI scope
  await expect(page.getByRole("button", { name: /โครงการผู้ว่า/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /รายงานผู้ว่าฯ ด่วน/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /รายงานผู้ว่าฯ \/ KPI/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /ระบบหลังบ้าน/ })).toHaveCount(0);
});

test("route editor keeps A and B markers visible and permits a map bend point", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  const pointA = page.getByLabel("พิกัดจุด A");
  const pointB = page.getByLabel("พิกัดจุด B");
  await pointA.fill("6.8340, 101.1860");
  await pointA.blur();
  await pointB.fill("6.8390, 101.1920");
  await pointB.blur();
  await expect(page.locator(".doh-draft-endpoint")).toHaveCount(2);
  await page.getByRole("button", { name: /เพิ่มจุดดัดเส้น/ }).click();
  await expect(page.getByRole("button", { name: /คลิกถนนเพื่อดัด/ })).toBeVisible();
});

test("route editor lists and removes an individual bend point", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await page.getByLabel("พิกัดจุด A").fill("6.8340, 101.1860");
  await page.getByLabel("พิกัดจุด A").blur();
  await page.getByLabel("พิกัดจุด B").fill("6.8390, 101.1920");
  await page.getByLabel("พิกัดจุด B").blur();
  await page.getByRole("button", { name: "แตะจุดกลางเส้นเพื่อเพิ่มจุด" }).click();
  await expect(page.getByLabel("รายการจุดดัดเส้น")).toBeVisible();
  await page.getByRole("button", { name: "ลบจุดดัดที่ 1" }).click();
  await expect(page.getByLabel("รายการจุดดัดเส้น")).toHaveCount(0);
});

test("detour routing can force a straight heading through a selected intersection", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  await page.route("**/route/v1/driving/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "Ok",
        routes: [{ geometry: { type: "LineString", coordinates: [[101.186, 6.834], [101.189, 6.8365], [101.192, 6.839]] } }],
      }),
    });
  });
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await page.getByLabel("พิกัดจุด A").fill("6.8340, 101.1860");
  await page.getByLabel("พิกัดจุด A").blur();
  await page.getByLabel("พิกัดจุด B").fill("6.8390, 101.1920");
  await page.getByLabel("พิกัดจุด B").blur();
  await page.getByRole("checkbox", { name: /บังคับตรงผ่านสามแยก\/สี่แยก/ }).check();
  await page.getByRole("button", { name: "แตะจุดกลางเส้นเพื่อเพิ่มจุด" }).click();
  const routingRequest = page.waitForRequest((request) => request.url().includes("/route/v1/driving/") && request.url().includes("continue_straight=true"));
  await page.getByRole("button", { name: "คำนวณเส้นเกาะถนน" }).click();
  const request = await routingRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get("continue_straight")).toBe("true");
  expect(url.searchParams.get("alternatives")).toBe("false");
  expect(url.searchParams.get("bearings")).toMatch(/^;\d{1,3},45;$/);
  await expect(page.getByText("คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ", { exact: false })).toBeVisible();
});

test("office markers unlock only while their record is being edited", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Office map editing is verified in the desktop workspace");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการระบบ");
  const editOffice = page.getByRole("button", { name: /แก้ไขสำนักงาน/ }).first();
  test.skip(await editOffice.count() === 0, "No office record is currently available");
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(0);
  await editOffice.click();
  await expect(page.getByText("หมุดของรายการนี้ปลดล็อกแล้ว", { exact: false })).toBeVisible();
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(1);
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(page.locator(".doh-office-marker.leaflet-marker-draggable")).toHaveCount(0);
});

test("map management exposes all approved traffic choices without color labels", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop sidebar navigation is covered here; mobile smoke is separate");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  for (const label of [
    "ผ่านได้ปกติ",
    "รถทุกชนิดผ่านได้แต่ไม่สะดวก",
    "รถเล็กผ่านได้ ๑ ช่องทาง",
    "รถเล็กผ่านไม่ได้",
    "ผ่านไม่ได้",
  ]) {
    await expect(page.getByRole("option", { name: label, exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: "เส้นน้ำท่วม", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ทางเลี่ยง", exact: true })).toBeVisible();
});

test("map workflows expose import, safe reset, and multi-format exports", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop administration workflow");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await expect(page.getByText("นำเข้าแนวเส้นเพื่อแก้รายละเอียดภายหลัง", { exact: false })).toBeVisible();
  await expect(page.getByText("บันทึกเป็นฉบับร่าง (ยังไม่แสดงบนแผนที่ประชาชน)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ล้างข้อมูลทั้งหมด" })).toBeVisible();

  await openMenu(page, "รายการเหตุการณ์");
  await expect(page.getByLabel("ขอบเขตส่งออกเหตุการณ์")).toHaveValue("FILTERED");
  const incidentExport = page.getByLabel("รูปแบบส่งออกเหตุการณ์");
  for (const value of ["csv", "geojson", "kml", "kmz", "shapefile"]) await expect(incidentExport.locator(`option[value="${value}"]`)).toHaveCount(1);

  await openMenu(page, "รายการทางเลี่ยง");
  await expect(page.getByLabel("ขอบเขตส่งออกทางเลี่ยง")).toHaveValue("FILTERED");
  const detourExport = page.getByLabel("รูปแบบส่งออกทางเลี่ยง");
  for (const value of ["csv", "geojson", "kml", "kmz", "shapefile"]) await expect(detourExport.locator(`option[value="${value}"]`)).toHaveCount(1);
});

test("GIS import parses GeoJSON, KML, and GPX into a review-only preview", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "GIS import review is desktop-first");
  const kmz = new JSZip();
  kmz.file("doc.kml", '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>KMZ QA</name><LineString><coordinates>101.18,6.83,0 101.19,6.84,0</coordinates></LineString></Placemark></Document></kml>');
  const shpwrite = await import("@mapbox/shp-write");
  const shapefile = await (shpwrite as any).zip({ type: "FeatureCollection", features: [{ type: "Feature", properties: { route_no: "42", section_name: "Shapefile QA" }, geometry: { type: "LineString", coordinates: [[101.18, 6.83], [101.19, 6.84]] } }] }, { folder: "routes", types: { line: "routes" } });
  const fixtures = [
    {
      name: "routes.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { route_no: "42", section_name: "GeoJSON QA" }, geometry: { type: "LineString", coordinates: [[101.18, 6.83], [101.19, 6.84]] } }] })),
    },
    {
      name: "routes.kml",
      mimeType: "application/vnd.google-earth.kml+xml",
      buffer: Buffer.from('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>KML QA</name><LineString><coordinates>101.18,6.83,0 101.19,6.84,0</coordinates></LineString></Placemark></Document></kml>'),
    },
    {
      name: "routes.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from('<?xml version="1.0"?><gpx version="1.1" creator="HDMS QA"><trk><name>GPX QA</name><trkseg><trkpt lat="6.83" lon="101.18"/><trkpt lat="6.84" lon="101.19"/></trkseg></trk></gpx>'),
    },
    {
      name: "routes.kmz",
      mimeType: "application/vnd.google-earth.kmz",
      buffer: await kmz.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    },
    {
      name: "routes.zip",
      mimeType: "application/zip",
      // @mapbox/shp-write returns a base64 ZIP string in Node test runtime.
      buffer: Buffer.from(shapefile as string, "base64"),
    },
  ];

  await page.goto(`${base}/admin/`);
  await openMenu(page, "โครงข่ายสายทาง");
  const upload = page.locator('input[type="file"]').first();
  for (const fixture of fixtures) {
    await upload.setInputFiles(fixture);
    await expect(page.getByText("พรีวิวตรวจสอบโครงข่าย: พบ 1 เส้นทาง", { exact: false })).toBeVisible();
    await expect(page.getByText("ไฟล์ข้อมูลไม่ถูกต้อง", { exact: true })).toHaveCount(0);
  }
});

test("line styling accepts precise low-resource line widths and casing", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop style studio");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "สไตล์เส้นทาง");
  const weight = page.getByLabel("ความหนาเส้นเป็นพิกเซล");
  await weight.fill("0.1");
  await expect(weight).toHaveValue("0.1");
  await expect(page.getByText("เปิดเส้นขอบ (Stroke/Casing)", { exact: true })).toBeVisible();
});

test("incident and detour records use consistent symbols and detail controls", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop record layout");
  await page.goto(`${base}/admin/`);
  await openMenu(page, "รายการเหตุการณ์");
  await expect(page.getByRole("heading", { name: "ทะเบียนเหตุการณ์น้ำท่วม" })).toBeVisible();
  const expandFirst = page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด/ }).first();
  const emptyIncident = page.getByText("ไม่พบรายการเหตุการณ์", { exact: false });
  await expect(expandFirst.or(emptyIncident)).toBeVisible();
  if (await expandFirst.isVisible()) {
    await expandFirst.click();
  }
  const floodSymbol = page.locator('[title="จุดน้ำท่วม"]').first();
  await expect(floodSymbol.or(emptyIncident)).toBeVisible();

  await openMenu(page, "รายการทางเลี่ยง");
  const detourSymbol = page.locator('[title="เส้นทางเลี่ยง"]').first();
  const emptyDetour = page.getByText("ไม่พบรายการเส้นทางเลี่ยง", { exact: false });
  await expect(detourSymbol.or(emptyDetour)).toBeVisible();
  await expect(page.getByRole("button", { name: /วาดทางเลี่ยงใหม่/ })).toBeVisible();
});

test("admin detour console fetches full system data and keeps deactivated detours restorable", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop detour table layout");
  const updated_at = "2026-11-17T03:00:00.000Z";
  const actionsSeen: string[] = [];
  const detours = [
    {
      id: "D-ACTIVE",
      route_name: "ทางเลี่ยงทดสอบเปิดใช้งาน",
      flood_id_ref: null,
      lat_start: 6.87,
      lon_start: 101.25,
      lat_end: 6.88,
      lon_end: 101.26,
      coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
      description: "เส้นทางเปิดอยู่",
      direction_mode: "TWO_WAY",
      is_active: true,
      updated_at,
    },
    {
      id: "D-INACTIVE",
      route_name: "ทางเลี่ยงทดสอบซ่อนชั่วคราว",
      flood_id_ref: null,
      lat_start: 6.89,
      lon_start: 101.27,
      lat_end: 6.9,
      lon_end: 101.28,
      coordinates_json: [[101.27, 6.89], [101.28, 6.9]],
      description: "ซ่อนไว้ก่อนหน้า",
      direction_mode: "FORWARD_ONLY",
      is_active: false,
      updated_at,
    },
  ];

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const payload = route.request().postDataJSON() as { action?: string; args?: unknown[] };
    const action = payload?.action || "";
    actionsSeen.push(action);

    if (action === "getSystemDataAction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updatedAt: updated_at,
          floodRoutes: [],
          detourRoutes: detours,
          timelineUpdates: [],
          mitigationProjects: [],
          highwayLayers: [],
          offices: [],
          mapStyles: null,
          systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
        }),
      });
      return;
    }

    if (action === "toggleDetourStatusAction") {
      const [id, nextActive] = (payload.args || []) as [string, boolean];
      const target = detours.find((item) => item.id === id);
      if (target) target.is_active = nextActive;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }

    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: `Unexpected action: ${action}` }) });
  });

  await page.goto(`${base}/admin/`);
  await openMenu(page, "รายการทางเลี่ยง");

  await expect(page.getByText("ทางเลี่ยงทดสอบเปิดใช้งาน").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("ทางเลี่ยงทดสอบซ่อนชั่วคราว").filter({ visible: true }).first()).toBeVisible();
  expect(actionsSeen).toContain("getSystemDataAction");
  expect(actionsSeen).not.toContain("getPublicSystemDataAction");

  // Deactivate the active detour and verify both rows appear under ปิดชั่วคราว.
  const visibleItems = page.locator(".doh-auto-table-cards > div, tbody tr").filter({ visible: true });
  await visibleItems.filter({ hasText: "ทางเลี่ยงทดสอบเปิดใช้งาน" }).getByRole("button", { name: "เปิดใช้งาน", exact: true }).click();
  const statusModal = page.locator(".fixed.z-\\[9999\\]");
  await expect(statusModal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(statusModal).toHaveCount(0);

  const statusSelect = page.locator("select").filter({ hasText: "สถานะทั้งหมด" });
  await expect(statusSelect).toContainText("ปิดชั่วคราว (2)");
  await statusSelect.selectOption("INACTIVE");
  await expect(page.getByText("ทางเลี่ยงทดสอบเปิดใช้งาน").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("ทางเลี่ยงทดสอบซ่อนชั่วคราว").filter({ visible: true }).first()).toBeVisible();

  // Re-activate one of the hidden detours directly from the ปิดชั่วคราว filter view.
  await visibleItems.filter({ hasText: "ทางเลี่ยงทดสอบซ่อนชั่วคราว" }).getByRole("button", { name: "ปิดชั่วคราว", exact: true }).click();
  await expect(statusModal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(statusModal).toHaveCount(0);
  await expect(statusSelect).toContainText("เปิดใช้งาน (1)");
  await expect(statusSelect).toContainText("ปิดชั่วคราว (1)");
});

test("incident registry hides event codes, verifies complete saves, uses map flood icon, and avoids button overlap on narrow panes", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop admin console layout test");
  const updated_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const savedPayloads: any[] = [];

  const floods = [
    {
      id: "F-COMPLETE",
      route_no: "4061",
      section_name: "สะกอม - ปานาเระ",
      km_start: "26+790",
      km_end: "32+200",
      lat_start: 6.75,
      lon_start: 101.45,
      lat_end: 6.76,
      lon_end: 101.46,
      coordinates_json: [[101.45, 6.75], [101.46, 6.76]],
      water_level_cm: 45,
      traffic_status: "WARNING",
      road_side: "BOTH",
      reporter_name: "หมวดทางหลวงปะนาเระ",
      is_active: true,
      updated_at,
      direction_meta: {
        schemaVersion: 2,
        eventId: "EV-4061-COMPLETE",
        eventCode: "FL-4061-ce5",
        eventTitle: "ทล.4061 ตอนสะกอม - ปานาเระ",
        directionCode: "BOTH",
        roadSide: "BOTH",
        affectedParts: ["ALL_LANES"],
        trafficStatusDetail: "CAUTION",
        waterLevelKnown: true,
        status_verified: true,
        villageOrLandmark: "บ้านคลอง ต.พ่อมิ่ง อ.ปะนาเระ",
        photos: [{ id: "ph-1", dataUrl: "https://lh3.googleusercontent.com/d/mock1", sizeBytes: 120000 }],
        updatedAt: updated_at,
      },
    },
    {
      id: "F-INCOMPLETE",
      route_no: "42",
      section_name: "ดอนยาง",
      km_start: "100+000",
      km_end: "101+000",
      lat_start: 6.86,
      lon_start: 101.24,
      lat_end: 6.87,
      lon_end: 101.25,
      coordinates_json: [[101.24, 6.86], [101.25, 6.87]],
      water_level_cm: 0,
      traffic_status: "ONE_LANE",
      road_side: "UNKNOWN",
      is_active: true,
      updated_at,
      direction_meta: {
        schemaVersion: 2,
        eventId: "EV-42-INCOMPLETE",
        eventCode: "FL-42-99",
        eventTitle: "ทล.42 ตอนดอนยาง",
        directionCode: "UNKNOWN",
        roadSide: "UNKNOWN",
        affectedParts: ["UNSPECIFIED"],
        trafficStatusDetail: "PENDING_VERIFICATION",
        waterLevelKnown: false,
        photos: [],
        updatedAt: updated_at,
      },
    },
  ];

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const payload = route.request().postDataJSON() as { action?: string; args?: unknown[] };
    const action = payload?.action || "";

    if (action === "getSystemDataAction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updatedAt: updated_at,
          floodRoutes: floods,
          detourRoutes: [],
          timelineUpdates: [],
          mitigationProjects: [],
          highwayLayers: [],
          offices: [],
          mapStyles: { flood: { color: "#dc2626", weight: 7, opacity: 0.9 } },
          systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
        }),
      });
      return;
    }

    if (action === "saveTimelineUpdateAction") {
      const arg = (payload.args?.[0] || {}) as any;
      savedPayloads.push(arg);
      const target = floods.find((f) => f.id === arg.floodId);
      if (target) {
        target.water_level_cm = arg.waterLevelCm;
        target.traffic_status = arg.trafficStatus;
        target.direction_meta = {
          ...(target.direction_meta as any),
          ...(arg.directionMeta || {}),
        };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }

    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: `Unexpected action: ${action}` }) });
  });

  // Desktop width ~1050px keeps split-pane workspace < 860px to verify Option A container stacking
  await page.setViewportSize({ width: 1050, height: 820 });
  await page.goto(`${base}/admin/`);
  await openMenu(page, "รายการเหตุการณ์");

  // Default collapsed: child segments start hidden until user expands the event
  await expect(page.locator(".doh-incident-segment")).toHaveCount(0);
  const expandBtns = page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด/ });
  const expandCount = await expandBtns.count();
  for (let i = 0; i < expandCount; i++) {
    await expandBtns.first().click();
  }

  const completeCard = page.locator(".doh-incident-segment").filter({ hasText: "26+790" }).first();
  await expect(completeCard).toBeVisible();

  // 1. Event codes hidden, no 300KB text, no ส่วนผิวทาง text
  await expect(page.getByText("FL-4061-ce5")).toHaveCount(0);
  await expect(completeCard).not.toContainText("300KB");
  await expect(completeCard).not.toContainText("ส่วนผิวทาง");

  // 2. Complete record displays real unified status, NOT รอตรวจสอบสถานะ, with updated time and เส้นทางที่ได้รับผลกระทบ
  await expect(completeCard).toContainText("รถเล็กผ่านไม่ได้");
  await expect(completeCard).not.toContainText("รอตรวจสอบสถานะ");
  await expect(completeCard).not.toContainText("ข้อมูลไม่ครบ");
  await expect(completeCard).toContainText("เส้นทางที่ได้รับผลกระทบ:");
  await expect(completeCard).toContainText("ทุกช่องจราจร");
  await expect(completeCard).toContainText("1 ภาพ");
  await expect(completeCard).toContainText(/อัปเดต/);

  // 3. Flood badge matches map flood color (#dc2626 -> rgb(220, 38, 38))
  const iconBadge = completeCard.locator('[title="จุดน้ำท่วม"]');
  await expect(iconBadge).toHaveCSS("background-color", "rgb(220, 38, 38)");

  // 4. Incomplete record shows specific incomplete warning instead of stale verified status
  const incompleteCard = page.locator(".doh-incident-segment").filter({ hasText: "100+000" }).first();
  await expect(incompleteCard).toContainText("ข้อมูลไม่ครบ");
  await expect(incompleteCard).toContainText("ยังไม่ระบุระดับน้ำ");
  await expect(incompleteCard).toContainText("ยังไม่ระบุเส้นทางที่ได้รับผลกระทบ");

  // 5. Action buttons do not overlap info text and do not clip off-screen in narrow container
  const deleteBtn = completeCard.locator('[title="ลบช่วงนี้ (กู้คืนได้)"]');
  const cardBox = await completeCard.boundingBox();
  const infoBox = await completeCard.locator("> div").first().boundingBox();
  const actionsBox = await completeCard.locator(".doh-incident-actions").boundingBox();
  const deleteBox = await deleteBtn.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(infoBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  expect(actionsBox!.y).toBeGreaterThanOrEqual(infoBox!.y + infoBox!.height - 2);
  expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

  // 6. Quick update updates directionMeta.trafficStatusDetail and verifies status without รอตรวจสอบสถานะ option
  await completeCard.getByRole("button", { name: /อัปเดตด่วน/ }).click();
  const quickDialog = page.getByRole("dialog", { name: "อัปเดตระดับน้ำ" });
  await expect(quickDialog.getByRole("option", { name: "รอตรวจสอบสถานะ" })).toHaveCount(0);
  await quickDialog.locator("select").selectOption("PASSABLE");
  await quickDialog.getByRole("button", { name: "บันทึกการอัปเดต" }).click();
  await page.keyboard.press("Escape");
  expect(savedPayloads[0]?.directionMeta?.trafficStatusDetail).toBe("PASSABLE");
  expect(savedPayloads[0]?.directionMeta?.status_verified).toBe(true);
});

test("two-way detour uses configured line style color for both directions and arrow badges", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map style rendering test runs on desktop viewport");

  const styledPayload = {
    updatedAt: "2026-11-19T00:00:00.000Z",
    floodRoutes: [],
    detourRoutes: [
      {
        id: "DET-STYLE-2WAY",
        route_name: "ทางเลี่ยงทดสอบสีสองทิศทาง",
        description: "ทดสอบสีสไตล์เส้นทาง",
        is_active: true,
        direction_mode: "TWO_WAY",
        lat_start: 6.86,
        lon_start: 101.24,
        lat_end: 6.88,
        lon_end: 101.27,
        coordinates_json: [
          [101.24, 6.86],
          [101.255, 6.87],
          [101.27, 6.88],
        ],
        reverse_coordinates_json: [
          [101.271, 6.879],
          [101.256, 6.869],
          [101.241, 6.859],
        ],
        detour_meta: { show_arrows: true },
      },
    ],
    timelineUpdates: [],
    mitigationProjects: [],
    offices: [],
    highwayLayers: [],
    mapStyles: {
      flood: { color: "#D32F2F", weight: 6, opacity: 0.95, borderActive: true, borderColor: "#ffffff", borderWidth: 1.5, pattern: "solid", animation: "none" },
      detour: { color: "#10B981", weight: 4.5, opacity: 0.95, borderActive: true, borderColor: "#000000", borderWidth: 1, pattern: "long-dash-dot", animation: "arrows", showArrows: true, arrowColor: "#0f172a", arrowSize: 12, arrowSpacingPx: 80, arrowMinZoom: 10 },
      primary: { color: "#1B5E20", weight: 5, opacity: 0.9, pattern: "solid", animation: "none" },
      secondary: { color: "#0284c7", weight: 3.5, opacity: 0.85, pattern: "solid", animation: "none" },
    },
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
  };

  await page.route("**/functions/v1/hdms-api*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(styledPayload) });
  });

  await page.goto(`${base}/`);
  await expect(page.locator(".doh-detour-symbol")).toBeVisible({ timeout: 10_000 });
  const arrowBadges = page.locator(".doh-dir-arrow-icon > div");
  await expect.poll(async () => await arrowBadges.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  const badgeColors = await arrowBadges.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor)
  );
  expect(badgeColors.length).toBeGreaterThanOrEqual(2);
  for (const bg of badgeColors) {
    expect(bg).toBe("rgb(16, 185, 129)");
  }
  expect(badgeColors).not.toContain("rgb(56, 189, 248)");
});

test("two-way detour supports separate B->A pins and freeform endpoint/vertex customization", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Map editing is verified in the desktop workspace");
  const savedPayloads: any[] = [];
  const requestedRoutes: string[] = [];

  await page.route("**/functions/v1/hdms-api*", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.action === "upsertRouteAction") {
      savedPayloads.push(body.args[0]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, savedId: "DET-NEW-1", systemData: { updatedAt: "2026-11-19T00:00:00.000Z", floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null, systemSettings: { name: "ทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" } } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updatedAt: "2026-11-19T00:00:00.000Z", floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null, systemSettings: { name: "ทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" } }),
    });
  });

  await page.route("**/route/v1/driving/**", async (route) => {
    const url = route.request().url();
    requestedRoutes.push(url);
    const isReverse = url.includes("101.194,6.841;101.184,6.832");
    const coords = isReverse
      ? [[101.194, 6.841], [101.189, 6.837], [101.184, 6.832]]
      : [[101.186, 6.834], [101.189, 6.836], [101.192, 6.839]];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "Ok",
        routes: [{ distance: 1200, duration: 90, geometry: { type: "LineString", coordinates: coords } }],
      }),
    });
  });

  await page.goto(`${base}/admin/`);
  await openMenu(page, "จัดการแผนที่");
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await page.getByPlaceholder("เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์").fill("ทางเลี่ยงทดสอบแยกหมุดสองทิศทาง");

  await page.getByLabel("พิกัดจุด A").fill("6.8340, 101.1860");
  await page.getByLabel("พิกัดจุด A").blur();
  await page.getByLabel("พิกัดจุด B").fill("6.8390, 101.1920");
  await page.getByLabel("พิกัดจุด B").blur();

  const revGroup = page.getByRole("group", { name: "หมุดเส้นทางขากลับ (B → A)" });
  await expect(revGroup).toBeVisible();
  await revGroup.getByLabel("พิกัดจุดเริ่มต้นขากลับ (B → A)").fill("6.8410, 101.1940");
  await revGroup.getByLabel("พิกัดจุดเริ่มต้นขากลับ (B → A)").blur();
  await revGroup.getByLabel("พิกัดจุดสิ้นสุดขากลับ (B → A)").fill("6.8320, 101.1840");
  await revGroup.getByLabel("พิกัดจุดสิ้นสุดขากลับ (B → A)").blur();

  await expect(page.locator(".doh-draft-endpoint")).toHaveCount(2);
  await expect(page.locator(".doh-draft-rev-endpoint")).toHaveCount(2);

  await page.getByRole("button", { name: "คำนวณเส้นเกาะถนน" }).click();
  await expect(page.getByText(/คำนวณทางเลี่ยงตามถนนสำเร็จ: A→B \(3 จุด\) และ B→A \(3 จุด\)/)).toBeVisible();
  expect(requestedRoutes.some((u) => u.includes("101.186,6.834;101.192,6.839"))).toBe(true);
  expect(requestedRoutes.some((u) => u.includes("101.194,6.841;101.184,6.832"))).toBe(true);

  // Enter free edit mode and verify both directions switch cleanly without endpoint lock errors
  await page.getByRole("button", { name: "ดัดเส้นอิสระ", exact: true }).click();
  await expect(page.locator(".doh-vertex-handle")).toHaveCount(3);

  const dirSwitch = page.getByLabel("เลือกทิศทางสำหรับดัดเส้น");
  await dirSwitch.getByRole("button", { name: "ขากลับ B → A" }).click();
  await expect(page.getByText(/กำลังดัดเส้น:.*ขากลับ \(B → A\)/)).toBeVisible();
  await expect(page.locator(".doh-vertex-handle")).toHaveCount(3);

  // Insert a midpoint vertex on reverse B -> A line via midpoint handle click
  await page.locator(".doh-vertex-mid").first().click();
  await expect(page.locator(".doh-vertex-handle")).toHaveCount(4);

  // Save and verify both forward and reverse geometries are preserved
  await page.getByRole("button", { name: /บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ/ }).click();
  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(savedPayloads[0].directionMode).toBe("TWO_WAY");
  expect(savedPayloads[0].coordinates).toHaveLength(3);
  expect(savedPayloads[0].reverseCoordinates).toHaveLength(4);
  expect(savedPayloads[0].reverseCoordinates[0][0]).toBeCloseTo(101.194, 3);
  expect(savedPayloads[0].reverseCoordinates[3][0]).toBeCloseTo(101.184, 3);
});
