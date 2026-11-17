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
  for (const label of ["ผ่านได้ปกติ", "รถเล็กผ่านได้", "รถเล็กผ่านได้ ๑ ช่องทาง", "ผ่านไม่ได้"]) {
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
  const floodSymbol = page.locator('[title="จุดน้ำท่วม"]').first();
  const emptyIncident = page.getByText("ไม่พบรายการเหตุการณ์", { exact: false });
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
