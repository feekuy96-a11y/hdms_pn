import { test, expect } from "@playwright/test";
import {
  enterGisFocus,
  exitGisFocus,
  IDLE_GIS_FOCUS_STATE,
  resolveDetourFocusGeometry,
  resolveFloodFocusData,
  updateGisFocusOptions,
} from "../../lib/gis-focus-mode";
import type { SystemDataPayload } from "../../db/default-data";
import { getTrafficPresentation } from "../../lib/traffic-presentation";
import { DEFAULT_MAP_STYLES } from "../../lib/constants";

const base = process.env.BASE_PATH || "";
const mockUpdatedAt = "2026-11-24T06:00:00.000Z";

function createMockPayload(): SystemDataPayload {
  return {
    updatedAt: mockUpdatedAt,
    floodRoutes: [
      {
        id: "F-42-LT",
        route_no: "42",
        section_name: "นาจวก - ดอนยาง",
        km_start: "76+000",
        km_end: "77+100",
        lat_start: 6.79,
        lon_start: 101.14,
        lat_end: 6.8,
        lon_end: 101.15,
        coordinates_json: [
          [101.14, 6.79],
          [101.15, 6.8],
        ],
        water_level_cm: 35,
        traffic_status: "WARNING",
        direction_meta: { sideCode: "LT", impactMode: "ONE_SIDE" },
        latest_photo_url: "",
        is_active: true,
        updated_at: mockUpdatedAt,
        subdistrict: "มะกรูด",
        district: "โคกโพธิ์",
        province: "ปัตตานี",
      },
      {
        id: "F-42-RT",
        route_no: "42",
        section_name: "นาจวก - ดอนยาง",
        km_start: "76+000",
        km_end: "77+100",
        lat_start: 6.791,
        lon_start: 101.141,
        lat_end: 6.801,
        lon_end: 101.151,
        coordinates_json: [
          [101.141, 6.791],
          [101.151, 6.801],
        ],
        water_level_cm: 30,
        traffic_status: "WARNING",
        direction_meta: { sideCode: "RT", impactMode: "ONE_SIDE" },
        latest_photo_url: "",
        is_active: true,
        updated_at: mockUpdatedAt,
        subdistrict: "มะกรูด",
        district: "โคกโพธิ์",
        province: "ปัตตานี",
      },
      {
        id: "F-RESOLVED",
        route_no: "43",
        section_name: "ปัตตานี - หนองจิก",
        km_start: "10+000",
        km_end: "11+000",
        lat_start: 6.85,
        lon_start: 101.2,
        lat_end: 6.86,
        lon_end: 101.21,
        coordinates_json: [
          [101.2, 6.85],
          [101.21, 6.86],
        ],
        water_level_cm: 0,
        traffic_status: "PASSABLE",
        direction_meta: {},
        latest_photo_url: "",
        is_active: true,
        updated_at: mockUpdatedAt,
      },
    ],
    detourRoutes: [
      {
        id: "D-2043",
        flood_id_ref: "F-42-LT",
        route_name: "เส้นทางเลี่ยง ปน.2043",
        direction_mode: "TWO_WAY",
        lat_start: 6.78,
        lon_start: 101.13,
        lat_end: 6.81,
        lon_end: 101.17,
        coordinates_json: [
          [101.13, 6.78],
          [101.145, 6.795],
          [101.17, 6.81],
        ],
        reverse_coordinates_json: [
          [101.17, 6.81],
          [101.15, 6.796],
          [101.13, 6.78],
        ],
        description: "1. จุดเริ่มต้น ทล.42\n2. ตรงไป ปน.2043",
        is_active: true,
        updated_at: mockUpdatedAt,
        detour_meta: { road_condition: "ผิวทางลาดยาง สัญจรได้ตามปกติ" },
      },
    ],
    timelineUpdates: [],
    mitigationProjects: [],
    highwayLayers: [],
    offices: [],
    mapStyles: null,
    systemSettings: { name: "HDMS Test", desc: "ระบบเฝ้าระวังน้ำท่วม", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
  };
}

test.describe("Shared GIS Focus Mode — Pure State & Geometry Contracts", () => {
  test("preserves immutable originSnapshot when switching focus A -> B without exiting", () => {
    const snapA = {
      viewport: { center: [101.25, 6.87] as [number, number], zoom: 11 },
      filters: { activeTab: "FLOOD" as const, statusFilter: "ALL", routeFilter: "ALL", searchQuery: "" },
    };
    const snapB = {
      viewport: { center: [101.14, 6.79] as [number, number], zoom: 15 },
      filters: { activeTab: "DETOUR" as const, statusFilter: "WARNING", routeFilter: "42", searchQuery: "42" },
    };

    const focusedA = enterGisFocus(IDLE_GIS_FOCUS_STATE, {
      targetType: "FLOOD",
      targetId: "F-42-LT",
      captureSnapshot: () => snapA,
    });
    expect(focusedA.status).toBe("focused");
    expect(focusedA.originSnapshot).toEqual(snapA);

    const focusedB = enterGisFocus(focusedA, {
      targetType: "DETOUR",
      targetId: "D-2043",
      direction: "REVERSE",
      captureSnapshot: () => snapB,
    });
    expect(focusedB.targetType).toBe("DETOUR");
    expect(focusedB.targetId).toBe("D-2043");
    expect(focusedB.direction).toBe("REVERSE");
    expect(focusedB.originSnapshot).toEqual(snapA);

    const toggled = updateGisFocusOptions(focusedB, { direction: "FORWARD", refit: true });
    expect(toggled.originSnapshot).toEqual(snapA);

    const { nextState, restoreSnapshot } = exitGisFocus(toggled);
    expect(nextState.status).toBe("idle");
    expect(restoreSnapshot).toEqual(snapA);
  });

  test("resolves detour A->B and B->A geometry without mutating original arrays", () => {
    const payload = createMockPayload();
    const detour = payload.detourRoutes[0];
    const originalFwd = JSON.stringify(detour.coordinates_json);
    const originalRev = JSON.stringify(detour.reverse_coordinates_json);

    const fwd = resolveDetourFocusGeometry(detour, "FORWARD");
    const rev = resolveDetourFocusGeometry(detour, "REVERSE");

    expect(fwd.startCoord).toEqual([101.13, 6.78]);
    expect(fwd.endCoord).toEqual([101.17, 6.81]);
    expect(rev.startCoord).toEqual([101.17, 6.81]);
    expect(rev.endCoord).toEqual([101.13, 6.78]);
    expect(JSON.stringify(detour.coordinates_json)).toBe(originalFwd);
    expect(JSON.stringify(detour.reverse_coordinates_json)).toBe(originalRev);
  });

  test("groups LT/RT flood segments and recognizes 0 cm resolved flood", () => {
    const payload = createMockPayload();
    const active = resolveFloodFocusData("F-42-LT", payload);
    expect(active.isResolved).toBe(false);
    expect(active.activeSegments.length).toBe(2);
    expect(active.maxWaterLevelCm).toBe(35);
    expect(active.linkedDetours.map((d) => d.id)).toEqual(["D-2043"]);

    const resolved = resolveFloodFocusData("F-RESOLVED", payload);
    expect(resolved.isResolved).toBe(true);
    expect(resolved.activeSegments.length).toBe(0);
  });

  test("handles missing / empty / zero [0,0] geometry gracefully and keeps fitRequestId stable on non-refit updates", () => {
    const payload = createMockPayload();
    const emptyDetour = {
      ...payload.detourRoutes[0],
      id: "D-EMPTY",
      lat_start: 0,
      lon_start: 0,
      lat_end: 0,
      lon_end: 0,
      coordinates_json: [],
      reverse_coordinates_json: [],
    };
    const emptyFlood = {
      ...payload.floodRoutes[0],
      id: "F-EMPTY",
      route_no: "418",
      section_name: "จุดทดสอบไม่มีพิกัด",
      km_start: "1+000",
      km_end: "2+000",
      lat_start: 0,
      lon_start: 0,
      lat_end: 0,
      lon_end: 0,
      coordinates_json: [],
    };
    payload.detourRoutes.push(emptyDetour);
    payload.floodRoutes.push(emptyFlood);

    const dGeom = resolveDetourFocusGeometry(emptyDetour, "REVERSE");
    expect(dGeom.coords).toEqual([]);
    expect(dGeom.startCoord).toBeNull();
    expect(dGeom.endCoord).toBeNull();

    const fData = resolveFloodFocusData("F-EMPTY", payload);
    expect(fData.coordsList).toEqual([]);
    expect(fData.pointFallbacks).toEqual([]);

    const focused = enterGisFocus(IDLE_GIS_FOCUS_STATE, {
      targetType: "FLOOD",
      targetId: "F-42-LT",
      captureSnapshot: () => ({ viewport: null, filters: null }),
    });
    const updatedWithoutRefit = updateGisFocusOptions(focused, { showLinkedDetour: true });
    expect(updatedWithoutRefit.fitRequestId).toBe(focused.fitRequestId);
  });
});

test.describe("Shared GIS Focus Mode — Public Map E2E", () => {
  test("Flood Focus -> linked detour -> A/B switch -> Exit via Esc on Desktop", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop Esc & sidebar verification");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await expect(floodDialog).toBeVisible();

    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();
    await expect(floodDialog).toHaveCount(0);

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await expect(focusBar).toContainText("โหมดโฟกัส: เหตุการณ์น้ำท่วม");
    await expect(focusBar).toContainText("ซ่อนชั้นข้อมูลอื่นชั่วคราว");
    await expect(focusBar).toContainText("ระดับน้ำ 35 ซม.");

    const openDetour = page.getByTestId("gis-focus-open-linked-detour");
    await expect(openDetour).toBeVisible();
    await expect(focusBar.locator("[data-flood-focus-status]").first()).toContainText("รถเล็กผ่านไม่ได้");
    await expect(focusBar.getByRole("button", { name: "อ่านคำแนะนำเส้นทาง" })).toHaveCount(0);
    await openDetour.click();
    await expect(focusBar).toContainText("โหมดโฟกัส: เส้นทางเลี่ยง");
    await expect(focusBar.getByRole("button", { name: "กลับไปจุดน้ำท่วม" })).toBeVisible();
    await expect(page.getByTestId("gis-focus-dir-reverse")).toBeVisible();
    await page.getByTestId("gis-focus-dir-reverse").click();
    await expect(page.getByTestId("gis-focus-dir-reverse")).toHaveAttribute("aria-pressed", "true");

    await expect(page.locator("[data-detour-endpoint=END]")).toBeVisible();
    // Escape closes the endpoint first, then exits focus, without reopening a modal.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-detour-endpoint]")).toHaveCount(0);
    if (await focusBar.isVisible()) await page.keyboard.press("Escape");
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
  });

  test("multiple linked detours require a choice and open that route's B marker before returning to the same flood", async ({ page, isMobile }, testInfo) => {
    const payload = createMockPayload();
    const first = payload.detourRoutes[0];
    const second = structuredClone(first);
    second.id = "D-SECOND-LINK";
    second.route_name = "ทางเลี่ยงสายเลือกทดสอบ";
    second.direction_mode = "REVERSE_ONLY";
    second.detour_meta = { ...second.detour_meta, reverse_distance_m: 1900, reverse_duration_s: 180, end_point_photo: { caption: "จุดสังเกตของเส้นที่สอง" } };
    payload.floodRoutes[1].traffic_status = "CLOSED";
    payload.detourRoutes.push(second);
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/`);
    await page.locator(".doh-map-capsule-pin").first().press("Enter");
    await page.locator(".doh-flood-leaflet-popup").getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    const bar = page.getByTestId("gis-focus-mode-bar");
    await expect(bar).toContainText("นาจวก - ดอนยาง");
    await expect(bar.getByRole("listitem").filter({ hasText: "ซ้ายทาง" })).toContainText("รถเล็กผ่านไม่ได้");
    await expect(bar.getByRole("listitem").filter({ hasText: "ขวาทาง" })).toContainText("ผ่านไม่ได้");
    await expect(page.locator(".hdms-focus-endpoint")).toHaveCount(0);
    const choices = bar.getByRole("list", { name: "ทางเลี่ยงที่เกี่ยวข้อง" });
    await bar.getByRole("button", { name: "ดูทางเลี่ยง (2 เส้น)", exact: true }).click();
    await expect(choices.getByRole("button")).toHaveCount(2);
    const secondChoice = choices.getByRole("button", { name: /ทางเลี่ยงสายเลือกทดสอบ.*เฉพาะขากลับ/ });
    await expect(secondChoice).toContainText("ขากลับ: 1.9 กม. · ประมาณ 3 นาที");
    await page.screenshot({ path: testInfo.outputPath("flood-focus-linked-route-selection.png"), animations: "disabled" });
    await expect(bar).toContainText("โหมดโฟกัส: เหตุการณ์น้ำท่วม");
    await expect(page.locator(".hdms-focus-endpoint")).toHaveCount(0);
    await secondChoice.click();
    await expect(bar).toContainText("ทางเลี่ยงสายเลือกทดสอบ");
    if (isMobile) await bar.getByRole("button", { name: "ตัวเลือกเส้นทาง", exact: true }).click();
    await expect(bar.getByTestId("gis-focus-dir-forward")).toHaveCount(0);
    await bar.getByTestId("gis-focus-dir-reverse").click();
    const popup = page.locator("[data-detour-endpoint=END]");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("จุดสังเกตของเส้นที่สอง");
    await bar.getByRole("button", { name: "กลับไปจุดน้ำท่วม" }).click();
    await expect(bar).toContainText("นาจวก - ดอนยาง");
    await expect(bar).toContainText("โหมดโฟกัส: เหตุการณ์น้ำท่วม");
    await expect(page.locator("[data-detour-endpoint], .hdms-focus-endpoint")).toHaveCount(0);
    await expect(choices).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "ดูทางเลี่ยง (2 เส้น)", exact: true })).toBeVisible();
  });

  test("flood focus uses visible severity tokens and distinguishes freshness in both themes", async ({ page }) => {
    const payload = createMockPayload();
    payload.floodRoutes[1].traffic_status = "CLOSED";
    await page.clock.install({ time: new Date("2026-11-24T07:00:00.000Z") });
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/`);
    await page.locator(".doh-map-capsule-pin").first().press("Enter");
    await page.locator(".doh-flood-leaflet-popup").getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    const bar = page.getByTestId("gis-focus-mode-bar");
    const freshness = bar.locator(".citizen-freshness");
    await expect(freshness).toHaveAttribute("data-freshness", "fresh");
    await expect(freshness.locator("svg")).toHaveCount(1);
    const readColor = (severity: string) => bar.locator(`[data-flood-focus-status=${severity}]`).evaluate(node => getComputedStyle(node).color);
    const red = await readColor("red"), orange = await readColor("orange");
    expect(red).not.toBe(orange);
    const themeButton = page.getByRole("button", { name: /เปิดธีม(?:มืด|สว่าง)/ });
    const theme = page.locator(".citizen-ui");
    const oldTheme = await theme.getAttribute("data-citizen-theme");
    await themeButton.click();
    await expect(theme).not.toHaveAttribute("data-citizen-theme", oldTheme!);
    expect(await readColor("red")).not.toBe(red);
    expect(await readColor("orange")).not.toBe(orange);
    expect(await readColor("red")).not.toBe(await readColor("orange"));
    await page.clock.fastForward(3 * 60 * 60_000);
    await expect(freshness).toHaveAttribute("data-freshness", "aging");
    await expect(freshness.locator("svg")).toHaveCount(0);
    await page.clock.fastForward(3 * 60 * 60_000);
    await expect(freshness).toHaveAttribute("data-freshness", "stale");
    await expect(freshness).toContainText("โปรดตรวจสอบซ้ำ");
  });

  test("unconfirmed links do not count as eligible detour choices", async ({ page }) => {
    const payload = createMockPayload();
    const first = payload.detourRoutes[0];
    payload.detourRoutes.push({ ...first, id: "D-PENDING", route_name: "ทางเลี่ยงรอตรวจสอบ" });
    payload.eventDetourLinks = [
      { eventId: "EV-F-42-LT", detourId: first.id, eventDirection: "BOTH", detourDirection: "FORWARD", position: 1, recommendation: "RECOMMENDED", reviewedGeometryVersion: 1 },
      { eventId: "EV-F-42-LT", detourId: "D-PENDING", eventDirection: "BOTH", detourDirection: "TWO_WAY", position: 2, recommendation: "PENDING", reviewedGeometryVersion: null },
    ];
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/`);
    await page.locator(".doh-map-capsule-pin").first().press("Enter");
    await page.locator(".doh-flood-leaflet-popup").getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    const bar = page.getByTestId("gis-focus-mode-bar");
    await bar.getByRole("button", { name: "ดูทางเลี่ยง", exact: true }).click();
    await expect(bar).toContainText(first.route_name);
    await expect(bar.getByRole("list", { name: "ทางเลี่ยงที่เกี่ยวข้อง" })).toHaveCount(0);
    await expect(bar.getByTestId("gis-focus-dir-reverse")).toHaveCount(0);
  });

  test("flood focus without linked routes does not offer an unrelated detour", async ({ page }) => {
    const payload = createMockPayload();
    payload.detourRoutes = [];
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/`);
    await page.locator(".doh-map-capsule-pin").first().press("Enter");
    await page.locator(".doh-flood-leaflet-popup").getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    const bar = page.getByTestId("gis-focus-mode-bar");
    await expect(bar).toContainText("ยังไม่มีทางเลี่ยงที่ยืนยันทิศทางสำหรับจุดนี้");
    await expect(bar.getByTestId("gis-focus-open-linked-detour")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "รายละเอียดน้ำท่วม" })).toBeVisible();
  });

  test("Detour Focus from DetourDossierModal on Mobile collapses drawer and exits cleanly", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile viewport drawer & focus verification");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    const drawer = page.locator(".citizen-drawer");
    await drawer.getByRole("group", { name: "ประเภทข้อมูล" }).getByRole("button", { name: /^ทางเลี่ยง/ }).click();
    await drawer.getByRole("button", { name: /เส้นทางเลี่ยง ปน\.2043/ }).first().click();

    const detourDialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
    await expect(detourDialog).toBeVisible();
    await detourDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
    await expect(detourDialog).toHaveCount(0);

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await expect(focusBar).toContainText("โหมดโฟกัส: เส้นทางเลี่ยง");
    await expect(focusBar).toContainText("ซ่อนชั้นข้อมูลอื่นชั่วคราว");

    await page.getByRole("button", { name: "ตัวเลือกเส้นทาง" }).click();
    await page.getByTestId("gis-focus-dir-reverse").click();
    await expect(focusBar).toContainText("ขากลับ (B → A)");
    await expect(page.locator("[data-detour-endpoint=END]")).toBeVisible();

    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(detourDialog).toHaveCount(0);
  });

  test("Missing / empty coordinates_json shows alert without crashing map and exits without reopening popup", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop card -> modal flow");
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const payload = createMockPayload();
    payload.floodRoutes = [
      {
        ...payload.floodRoutes[0],
        id: "F-NO-GEOM",
        route_no: "418",
        section_name: "จุดไม่มีพิกัดเส้นทาง",
        lat_start: 0,
        lon_start: 0,
        lat_end: 0,
        lon_end: 0,
        coordinates_json: [],
      },
    ];
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await expect(floodDialog).toBeVisible();

    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();
    await expect(floodDialog).toHaveCount(0);

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await expect(focusBar.getByRole("alert")).toContainText("ไม่พบข้อมูลพิกัดเส้นทาง");
    await expect(page.locator(".leaflet-container")).toBeVisible();

    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("Live data refresh updates Focus Bar in place without overriding user pan/zoom or opening popup", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop pan/zoom & focus live refresh verification");
    let currentPayload = createMockPayload();
    let apiCalls = 0;

    await page.route("**/functions/v1/hdms-api", (route) => {
      apiCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentPayload),
      });
    });

    await page.goto(`${base}/`);
    await page.locator(".leaflet-control-zoom-in").waitFor({ state: "visible" });

    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toContainText("ระดับน้ำ 35 ซม.");
    await page.waitForTimeout(550);

    // User manually zooms out and pans map during Focus Mode
    await page.locator(".leaflet-control-zoom-out").click();
    await page.waitForTimeout(350);
    const mapBox = await page.locator(".leaflet-container").boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.move(mapBox!.x + mapBox!.width / 2, mapBox!.y + mapBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(mapBox!.x + mapBox!.width / 2 + 90, mapBox!.y + mapBox!.height / 2 + 50, { steps: 6 });
    await page.mouse.up();
    // The drag may schedule one frame before applying Leaflet's inertia class.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-(pan|zoom)-anim/);

    const userViewportSnapshot = await page.evaluate(() => ({
      proxyTransform: document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || "",
      paneTransform: document.querySelector<HTMLElement>(".leaflet-map-pane")?.style.transform || "",
    }));

    // Push live update via focus refetch
    const updatedPayload = createMockPayload();
    updatedPayload.updatedAt = "2026-11-24T06:45:00.000Z";
    updatedPayload.floodRoutes[0].water_level_cm = 72;
    updatedPayload.floodRoutes[0].traffic_status = "CLOSED";
    currentPayload = updatedPayload;

    const callsBeforeRefresh = apiCalls;
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await expect.poll(() => apiCalls).toBeGreaterThan(callsBeforeRefresh);

    await expect(focusBar).toContainText("ระดับน้ำ 72 ซม.");
    await page.waitForTimeout(450);

    const viewportAfterRefresh = await page.evaluate(() => ({
      proxyTransform: document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || "",
      paneTransform: document.querySelector<HTMLElement>(".leaflet-map-pane")?.style.transform || "",
    }));

    expect(viewportAfterRefresh.proxyTransform).toBe(userViewportSnapshot.proxyTransform);
    expect(viewportAfterRefresh.paneTransform).toBe(userViewportSnapshot.paneTransform);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  });

  test("Switching Focus A (Flood) -> B (Detour) without exiting restores pre-A Origin Snapshot without reopening popup", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar switching without exiting");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.locator(".leaflet-control-zoom-in").waitFor({ state: "visible" });

    // Set a distinct pre-A zoom level (zoom in once from default zoom 11 -> 12)
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(350);
    const originProxyTransform = await page.evaluate(
      () => document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || ""
    );

    const parseProxy = (transform: string) => {
      const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*[-\d.]+px\)\s*scale\(([-\d.]+)\)/.exec(transform);
      return m ? { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) } : null;
    };

    const originProxy = parseProxy(originProxyTransform);
    expect(originProxy).not.toBeNull();

    // 1. Focus Item A (Flood)
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toContainText("โหมดโฟกัส: เหตุการณ์น้ำท่วม");
    await page.waitForTimeout(550);

    // Confirm map actually zoomed in to Item A (different proxy scale from pre-A)
    const itemAProxyTransform = await page.evaluate(
      () => document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || ""
    );
    const itemAProxy = parseProxy(itemAProxyTransform);
    expect(itemAProxy?.scale).not.toBe(originProxy!.scale);

    // 2. Switch directly to Item B (Detour) via sidebar without exiting Focus
    await page.getByRole("button", { name: /ทางเลี่ยง/ }).first().click();
    await page.getByRole("button", { name: /เส้นทางเลี่ยง ปน\.2043/ }).first().click();
    const detourDialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
    await expect(detourDialog).toBeVisible();
    await detourDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();

    await expect(detourDialog).toHaveCount(0);
    await expect(focusBar).toContainText("โหมดโฟกัส: เส้นทางเลี่ยง");
    await expect(focusBar).toContainText("เส้นทางเลี่ยง ปน.2043");
    await page.waitForTimeout(550);

    // 3. Exit Focus -> must restore exact pre-A Origin Snapshot center + zoom (not drifted by handleSelectFlood flyTo!)
    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
    await expect(detourDialog).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);

    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || "")
      )
      .toBe(originProxyTransform);
  });

  test("FloodDossierSections detour card launches Detour Focus with chosen B -> A direction and restores exact viewport on Exit", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop FloodDossier detour accordion -> Focus verification");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.locator(".leaflet-control-zoom-in").waitFor({ state: "visible" });
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(350);
    const preModalTransform = await page.evaluate(
      () => document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || ""
    );

    // Open Flood Dossier -> expand detour accordion -> choose B -> A -> click "ดูตำแหน่งบนแผนที่" inside detour card
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await expect(floodDialog).toBeVisible();

    await floodDialog.getByRole("button", { name: /ทางเลี่ยงที่ 1/ }).click();
    await floodDialog.getByRole("button", { name: "ขากลับ (B → A)" }).click();
    await floodDialog.locator("#dossier-detour-section").getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).first().click();

    await expect(floodDialog).toHaveCount(0);
    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await expect(focusBar).toContainText("โหมดโฟกัส: เส้นทางเลี่ยง");
    await expect(focusBar).toContainText("เส้นทางเลี่ยง ปน.2043");
    await expect(focusBar).toContainText("ขากลับ (B → A)");
    await page.waitForTimeout(550);

    await page.keyboard.press("Escape");
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);

    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelector<HTMLElement>(".leaflet-proxy")?.style.transform || "")
      )
      .toBe(preModalTransform);
  });

  test("Sidebar Filter Auto-Exit leaves Focus Mode cleanly without keeping stale popup or modal", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar filter auto-exit verification");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();

    // Change filter in sidebar (search query) while focused -> must auto-exit Focus Mode
    const searchInput = page.getByPlaceholder(/ค้นหาสายทาง/);
    await searchInput.fill("42");

    await expect(focusBar).toHaveCount(0);
    await expect(searchInput).toHaveValue("42");
    await expect(floodDialog).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  });

  test("Enter and Exit Focus Mode 3 times leaves no leaked listeners, popups, or errors", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop 3-cycle enter/exit stability verification");
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    const focusBar = page.getByTestId("gis-focus-mode-bar");

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
      await expect(floodDialog).toBeVisible();
      await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

      await expect(floodDialog).toHaveCount(0);
      await expect(focusBar).toBeVisible();

      if (cycle < 3) {
        await page.keyboard.press("Escape");
      } else {
        await page.getByTestId("gis-focus-exit-btn").click();
      }

      await expect(focusBar).toHaveCount(0);
      await expect(floodDialog).toHaveCount(0);
      await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    }

    // Extra Escape press after exit must stay clean
    await page.keyboard.press("Escape");
    await expect(focusBar).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("Mobile 360x640 Focus Bar respects Safe Padding and does not overlap map controls or floating bar", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile 360x640 layout overlap verification");
    await page.setViewportSize({ width: 360, height: 640 });
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await page.waitForTimeout(350);

    const layoutCheck = await page.evaluate(() => {
      const overlaps = (a: DOMRect | undefined, b: DOMRect | undefined) => {
        if (!a || !b) return false;
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      };
      const bar = document.querySelector('[data-testid="gis-focus-mode-bar"]');
      const barRect = bar?.getBoundingClientRect();
      const zoomIn = document.querySelector(".leaflet-control-zoom-in");
      const zoomOut = document.querySelector(".leaflet-control-zoom-out");
      const locateBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.getAttribute("aria-label") === "ตำแหน่งของฉัน"
      );
      const legendBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.getAttribute("aria-label") === "เลเยอร์"
      );
      const listBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.closest('[aria-label="เมนูประชาชน"]') && b.textContent?.includes("เหตุการณ์")
      );
      const statusBar = document.querySelector('[aria-label="สรุปสถานการณ์บนแผนที่"]');
      const floodPill = statusBar
        ? statusBar.querySelector(".citizen-map-status-flood")
        : undefined;
      const detourPill = statusBar
        ? statusBar.querySelector(".citizen-map-status-detours")
        : undefined;
      const exitBtn = document.querySelector('[data-testid="gis-focus-exit-btn"]');

      const centerHit = (el: Element | null | undefined) => {
        if (!el) return { present: false, hitSelf: false };
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { present: true, hitSelf: Boolean(hit && (el === hit || el.contains(hit))) };
      };

      return {
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth,
        overlapZoomIn: overlaps(barRect, zoomIn?.getBoundingClientRect()),
        overlapZoomOut: overlaps(barRect, zoomOut?.getBoundingClientRect()),
        overlapLocate: overlaps(barRect, locateBtn?.getBoundingClientRect()),
        overlapLegend: overlaps(barRect, legendBtn?.getBoundingClientRect()),
        overlapFloodPill: overlaps(barRect, floodPill?.getBoundingClientRect()),
        overlapDetourPill: overlaps(barRect, detourPill?.getBoundingClientRect()),
        overlapFloatingBar: overlaps(barRect, listBtn?.closest(".fixed")?.getBoundingClientRect()),
        hitZoomIn: centerHit(zoomIn),
        hitLocate: centerHit(locateBtn),
        hitLegend: centerHit(legendBtn),
        hitFloodPill: centerHit(floodPill),
        hitDetourPill: centerHit(detourPill),
        hitFloatingList: centerHit(listBtn),
        hitExitBtn: centerHit(exitBtn),
      };
    });

    expect(layoutCheck.docOverflowX).toBe(false);
    expect(layoutCheck.overlapZoomIn).toBe(false);
    expect(layoutCheck.overlapZoomOut).toBe(false);
    expect(layoutCheck.overlapLocate).toBe(false);
    expect(layoutCheck.overlapLegend).toBe(false);
    expect(layoutCheck.overlapFloodPill).toBe(false);
    expect(layoutCheck.overlapDetourPill).toBe(false);
    expect(layoutCheck.overlapFloatingBar).toBe(false);
    expect(layoutCheck.hitZoomIn).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitLocate).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitLegend).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitFloodPill).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitDetourPill).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitFloatingList).toEqual({ present: true, hitSelf: true });
    expect(layoutCheck.hitExitBtn).toEqual({ present: true, hitSelf: true });

    // Opening the linked route should keep its endpoints clear of the mobile Focus Bar.
    await page.getByTestId("gis-focus-open-linked-detour").click();
    await page.waitForTimeout(550);

    const focusClearance = await page.evaluate(() => {
      const barRect = document.querySelector('[data-testid="gis-focus-mode-bar"]')?.getBoundingClientRect();
      const endpoints = Array.from(document.querySelectorAll(".hdms-focus-endpoint")).map((el) =>
        el.getBoundingClientRect()
      );
      return {
        barTop: barRect?.top ?? 0,
        endpointCount: endpoints.length,
        allAboveFocusBar: endpoints.length > 0 && Boolean(barRect) && endpoints.every((r) => r.top < barRect!.top),
        maxEndpointTop: endpoints.reduce((m, r) => Math.max(m, r.top), 0),
      };
    });

    expect(focusClearance.endpointCount).toBeGreaterThanOrEqual(2);
    expect(focusClearance.allAboveFocusBar).toBe(true);

    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
  });

  test("Desktop 1280x800 Focus Bar does not overlap top floating pills or map controls", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop 1280x800 layout overlap verification");
    await page.setViewportSize({ width: 1280, height: 800 });
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("button", { name: /ดูรายละเอียด/ }).first().click();
    const floodDialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    await floodDialog.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).last().click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await page.waitForTimeout(450);
    await page.getByTestId("gis-focus-open-linked-detour").click();
    await page.waitForTimeout(550);

    const desktopLayout = await page.evaluate(() => {
      const overlaps = (a: DOMRect | undefined, b: DOMRect | undefined) => {
        if (!a || !b) return false;
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      };
      const barRect = document.querySelector('[data-testid="gis-focus-mode-bar"]')?.getBoundingClientRect();
      const statusBar = document.querySelector('[aria-label="สรุปสถานการณ์บนแผนที่"]');
      const floodPill = statusBar
        ? statusBar.querySelector(".citizen-map-status-flood")
        : undefined;
      const detourPill = statusBar
        ? statusBar.querySelector(".citizen-map-status-detours")
        : undefined;
      const zoomIn = document.querySelector(".leaflet-control-zoom-in");
      const zoomOut = document.querySelector(".leaflet-control-zoom-out");
      const locateBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.getAttribute("aria-label") === "ตำแหน่งของฉัน"
      );
      const legendBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.getAttribute("aria-label") === "เลเยอร์"
      );
      const exitBtn = document.querySelector('[data-testid="gis-focus-exit-btn"]');

      const centerHit = (el: Element | null | undefined) => {
        if (!el) return { present: false, hitSelf: false };
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { present: true, hitSelf: Boolean(hit && (el === hit || el.contains(hit))) };
      };

      const endpoints = Array.from(document.querySelectorAll(".hdms-focus-endpoint")).map((el) =>
        el.getBoundingClientRect()
      );

      return {
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth,
        overlapFloodPill: overlaps(barRect, floodPill?.getBoundingClientRect()),
        overlapDetourPill: overlaps(barRect, detourPill?.getBoundingClientRect()),
        overlapZoomIn: overlaps(barRect, zoomIn?.getBoundingClientRect()),
        overlapZoomOut: overlaps(barRect, zoomOut?.getBoundingClientRect()),
        overlapLocate: overlaps(barRect, locateBtn?.getBoundingClientRect()),
        overlapLegend: overlaps(barRect, legendBtn?.getBoundingClientRect()),
        hitFloodPill: centerHit(floodPill),
        hitDetourPill: centerHit(detourPill),
        hitZoomIn: centerHit(zoomIn),
        hitLocate: centerHit(locateBtn),
        hitLegend: centerHit(legendBtn),
        hitExitBtn: centerHit(exitBtn),
        endpointCount: endpoints.length,
        allBelowFocusBar:
          endpoints.length > 0 && Boolean(barRect) && endpoints.every((r) => r.top >= barRect!.bottom - 4),
      };
    });

    expect(desktopLayout.docOverflowX).toBe(false);
    expect(desktopLayout.overlapFloodPill).toBe(false);
    expect(desktopLayout.overlapDetourPill).toBe(false);
    expect(desktopLayout.overlapZoomIn).toBe(false);
    expect(desktopLayout.overlapZoomOut).toBe(false);
    expect(desktopLayout.overlapLocate).toBe(false);
    expect(desktopLayout.overlapLegend).toBe(false);
    expect(desktopLayout.hitFloodPill).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.hitDetourPill).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.hitZoomIn).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.hitLocate).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.hitLegend).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.hitExitBtn).toEqual({ present: true, hitSelf: true });
    expect(desktopLayout.endpointCount).toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const barRect = document.querySelector('[data-testid="gis-focus-mode-bar"]')?.getBoundingClientRect();
          const endpoints = Array.from(document.querySelectorAll(".hdms-focus-endpoint")).map((el) =>
            el.getBoundingClientRect()
          );
          return endpoints.length >= 2 && Boolean(barRect) && endpoints.every((r) => r.top >= barRect!.bottom - 4);
        })
      )
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
  });

  test("Flood & Detour Map Popup 'ดูตำแหน่งบนแผนที่' buttons enter Focus Mode (preserving B->A) and auto-close popup without stacked modals", async ({ page }) => {
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.locator(".leaflet-control-zoom-in").waitFor({ state: "visible" });

    // 1. Flood Map Popup -> Focus Mode
    const floodPin = page.locator(".doh-map-capsule-pin").first();
    await expect(floodPin).toBeVisible();
    await floodPin.click();

    const floodPopup = page.locator(".doh-flood-leaflet-popup");
    await expect(floodPopup).toBeVisible();
    await floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();

    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toBeVisible();
    await expect(focusBar).toContainText("โหมดโฟกัส: เหตุการณ์น้ำท่วม");
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.waitForTimeout(350);
    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);

    // 2. Detour Map Popup -> toggle B -> A -> Focus Mode (must not open DetourDossierModal)
    const detourSymbol = page.locator(".doh-detour-symbol").first();
    await expect(detourSymbol).toBeVisible();
    await detourSymbol.focus();
    await detourSymbol.press("Enter");

    const detourPopup = page.locator(".doh-detour-leaflet-popup").filter({ hasText: "เส้นทางเลี่ยง" });
    await expect(detourPopup).toBeVisible();
    await detourPopup.getByRole("button", { name: "ขากลับ B → A" }).click();
    await expect(detourPopup.getByRole("button", { name: "ขากลับ B → A" })).toHaveAttribute("aria-pressed", "true");
    await detourPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();

    await expect(focusBar).toBeVisible();
    await expect(focusBar).toContainText("โหมดโฟกัส: เส้นทางเลี่ยง");
    await expect(focusBar).toContainText("เส้นทางเลี่ยง ปน.2043");
    await expect(focusBar).toContainText("ขากลับ (B → A)");
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.waitForTimeout(350);
    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(focusBar).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

for (const admin of [false, true]) {
  test(`${admin ? "admin" : "public"} draws saved road, flood and detour colors in the map and focus views`, async ({ page, isMobile }) => {
    const colors = { flood: "#8b214f", detour: "#2875a3", primary: "#39632b", secondary: "#6451ad" };
    const payload = createMockPayload();
    payload.floodRoutes[0].traffic_status = "CLOSED";
    payload.floodRoutes[1].traffic_status = "PASSABLE";
    const statusColors = payload.floodRoutes.slice(0, 2).map(flood =>
      getTrafficPresentation(flood.traffic_status, flood.water_level_cm).hex.toLowerCase());
    expect(new Set(statusColors).size).toBe(2);
    payload.mapStyles = structuredClone(DEFAULT_MAP_STYLES);
    for (const key of ["flood", "detour", "primary", "secondary"] as const) {
      payload.mapStyles[key].color = colors[key];
      payload.mapStyles[key].animationEnabled = false;
    }
    payload.highwayLayers = (["MAIN_HIGHWAY", "SECOND_HIGHWAY"] as const).map((layer_id, index) => ({
      layer_id, layer_name: layer_id, is_visible: true, color_hex: "#112233", line_width: 5,
      geojson_data: { type: "FeatureCollection", features: [{
        type: "Feature", properties: { route_no: "42", section_name: "ช่วงทดสอบ" },
        geometry: { type: "LineString", coordinates: [[101.13, 6.83 + index * .01], [101.2, 6.83 + index * .01]] },
      }] },
    }));
    await page.addInitScript(() => {
      const events = new Map<string, number>();
      Object.defineProperty(window, "__mapStrokeCounts", { value: events });
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke = function (...args: [Path2D?]) {
        const color = this.strokeStyle;
        if (this.canvas.closest("[data-hdms-map]") && typeof color === "string") {
          events.set(color, (events.get(color) ?? 0) + 1);
        }
        return Reflect.apply(stroke, this, args);
      };
    });
    const count = (color: string) => page.evaluate(c =>
      ((window as unknown as { __mapStrokeCounts: Map<string, number> }).__mapStrokeCounts.get(c) ?? 0), color);
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/${admin ? "admin/" : ""}`);
    if (admin && isMobile) await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
    const tools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
    await tools.getByRole("button", { name: "เลเยอร์", exact: true }).click();
    const legend = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
    await legend.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
    await legend.getByRole("checkbox", { name: /แสดงสายรองทุกระดับซูม/ }).check();
    await tools.getByRole("button", { name: "เลเยอร์", exact: true }).click();
    for (const color of Object.values(colors)) await expect.poll(() => count(color)).toBeGreaterThan(0);
    if (!admin) {
      for (const color of statusColors) await expect.poll(() => count(color)).toBeGreaterThan(0);
    }

    for (const [pin, popup, color] of [
      [".doh-map-capsule-pin", ".doh-flood-leaflet-popup", colors.flood],
      [".doh-detour-symbol", ".doh-detour-leaflet-popup", colors.detour],
    ]) {
      await page.locator(pin).first().press("Enter");
      await page.locator(popup).getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
      await expect(page.getByTestId(admin ? "admin-gis-focus-exit-bar" : "gis-focus-mode-bar")).toBeVisible();
      const beforeRedraw = await count(color);
      const beforeStatus = await Promise.all(statusColors.map(count));
      await tools.getByRole("button", { name: "Zoom out", exact: true }).click();
      await expect.poll(() => count(color)).toBeGreaterThan(beforeRedraw);
      if (!admin && color === colors.flood) {
        await expect.poll(async () => (await Promise.all(statusColors.map(count)))
          .some((value, i) => value > beforeStatus[i])).toBe(true);
      }
      await page.getByTestId("gis-focus-exit-btn").click();
    }
  });
}

test.describe("Admin Shared GIS Focus Mode", () => {
  test("admin map legend, zoom and symbols use shared contrast without tinting map imagery", async ({ page, isMobile }) => {
    test.skip(isMobile, "Uses the admin map and theme menu together on a desktop split view.");
    await page.setViewportSize({ width: 1440, height: 900 });
    const payload = createMockPayload();
    payload.highwayLayers = [{
      layer_id: "MAIN_HIGHWAY", layer_name: "สายหลัก", is_visible: true, color_hex: "#1b5e20", line_width: 5,
      geojson_data: { type: "FeatureCollection", features: [{
        type: "Feature", properties: { route_no: "42", section_name: "ช่วงทดสอบ" },
        geometry: { type: "LineString", coordinates: [[101.18, 6.85], [101.22, 6.85]] },
      }] },
    }];
    await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
    await page.goto(`${base}/admin/`);
    const map = page.locator("[data-hdms-map]").first();
    const legend = map.locator(".citizen-legend");
    const zoom = map.locator(".leaflet-control-zoom-in");
    for (const theme of [
      { mode: "ธีมสว่าง", surface: "rgb(255, 255, 255)", ink: "rgb(23, 53, 74)", active: "rgb(20, 89, 104)", primaryCode: "rgb(25, 95, 67)" },
      { mode: "ธีมมืด", surface: "rgb(26, 45, 62)", ink: "rgb(244, 248, 250)", active: "rgb(172, 209, 226)", primaryCode: "rgb(162, 228, 204)" },
    ]) {
      await page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ" }).click();
      await page.getByRole("button", { name: theme.mode, exact: true }).click();
      const tools = map.getByRole("group", { name: "เครื่องมือแผนที่" });
      const toggle = tools.getByRole("button", { name: "เลเยอร์", exact: true });
      await expect(tools.getByRole("button")).toHaveCount(4);
      await expect(toggle).toHaveCSS("background-color", theme.surface);
      await expect(toggle).toHaveCSS("color", theme.ink);
      await expect(zoom).toHaveCSS("color", theme.ink);
      await toggle.click();
      await expect(legend).toHaveCSS("background-color", theme.surface);
      await expect(legend).toHaveCSS("color", theme.ink);
      const rows = legend.locator(".citizen-visibility label");
      await expect(rows).toHaveCount(6);
      for (const label of await rows.all()) {
        await expect(label).toHaveCSS("color", theme.ink);
      }
      const symbols = legend.locator(".hdms-map-symbol svg");
      for (const symbol of await symbols.all()) {
        const contrast = await symbol.evaluate(svg => {
          const lum = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).map(Number)
            .map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
            .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          const a = lum(getComputedStyle(svg).stroke);
          const b = lum(getComputedStyle(svg.parentElement!).backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(3);
      }
      const routeListToggle = legend.getByRole("button", { name: "ดูรายชื่อทางหลวงสายหลัก", exact: true });
      await routeListToggle.press("Enter");
      const routeList = map.getByRole("tooltip", { name: "รายชื่อทางหลวงสายหลัก", exact: true });
      await expect(routeList).toHaveCSS("background-color", theme.surface);
      await expect(routeList.getByText("ทล.42", { exact: true })).toHaveCSS("color", theme.primaryCode);
      await expect(legend.getByRole("button", { name: "Longdo", exact: true })).toBeVisible();
      await expect(legend.getByRole("button", { name: "ดาวเทียม", exact: true })).toBeVisible();
      const choice = legend.getByRole("button", { name: "ถนน OSM", exact: true });
      await choice.click();
      await expect(choice).toHaveCSS("background-color", theme.active);
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      for (const pane of [".leaflet-tile-pane", ".leaflet-overlay-pane", ".leaflet-marker-pane"]) {
        await expect(map.locator(pane)).toHaveCSS("filter", "none");
      }
      await expect(map.locator(".hdms-map-canvas")).toHaveCSS("background-color", "rgb(220, 232, 225)");
      for (const tone of ["danger", "warning"]) {
        await expect(legend.locator(`[data-map-tone=${tone}]`)).toBeVisible();
      }
      await legend.getByRole("button", { name: "ย่อแถบควบคุมเลเยอร์" }).click();
    }
  });

  test("Admin popup triggers compact Focus Exit pill (Flood + Detour B->A) and auto-exits when entering map-pick edit mode", async ({ page, isMobile }) => {
    test.skip(isMobile, "Admin split-pane map+form focus test runs on desktop layout");
    await page.setViewportSize({ width: 1280, height: 800 });

    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/admin/`);
    await page.locator(".leaflet-control-zoom-in").waitFor({ state: "visible" });

    // 1. Enter Flood Focus from Admin map popup -> verify compact Focus Exit pill only
    const floodPin = page.locator(".doh-map-capsule-pin").first();
    await expect(floodPin).toBeVisible();
    await floodPin.click();

    const floodPopup = page.locator(".doh-flood-leaflet-popup");
    await expect(floodPopup).toBeVisible();
    await floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();

    const adminExitBar = page.getByTestId("admin-gis-focus-exit-bar");
    await expect(adminExitBar).toBeVisible();
    await expect(adminExitBar).toContainText("โฟกัส: ทล.42 นาจวก - ดอนยาง");
    await expect(page.getByTestId("gis-focus-mode-bar")).toHaveCount(0);
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);

    const exitHitCheck = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="admin-gis-focus-exit-bar"]');
      const exitBtn = document.querySelector('[data-testid="gis-focus-exit-btn"]');
      if (!bar || !exitBtn) return { barPresent: false, hitSelf: false, overlapsCollapse: false };
      const barRect = bar.getBoundingClientRect();
      const btnRect = exitBtn.getBoundingClientRect();
      const hit = document.elementFromPoint(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
      const collapseBtn = document.querySelector('button[aria-label*="แผงควบคุม"]');
      const collapseRect = collapseBtn?.getBoundingClientRect();
      const overlapsCollapse = Boolean(
        collapseRect &&
          barRect.left < collapseRect.right &&
          barRect.right > collapseRect.left &&
          barRect.top < collapseRect.bottom &&
          barRect.bottom > collapseRect.top
      );
      return {
        barPresent: true,
        hitSelf: Boolean(hit && (exitBtn === hit || exitBtn.contains(hit))),
        overlapsCollapse,
      };
    });
    expect(exitHitCheck).toEqual({ barPresent: true, hitSelf: true, overlapsCollapse: false });

    await page.getByTestId("gis-focus-exit-btn").click();
    await expect(adminExitBar).toHaveCount(0);

    // 2. Enter Detour B -> A Focus and exit with Escape
    const detourSymbol = page.locator(".doh-detour-symbol").first();
    await expect(detourSymbol).toBeVisible();
    await detourSymbol.focus();
    await detourSymbol.press("Enter");

    const detourPopup = page.locator(".doh-detour-leaflet-popup").filter({ hasText: "เส้นทางเลี่ยง" });
    await expect(detourPopup).toBeVisible();
    await detourPopup.getByRole("button", { name: "ขากลับ B → A" }).click();
    await detourPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();

    await expect(adminExitBar).toBeVisible();
    await expect(adminExitBar).toContainText("เส้นทางเลี่ยง ปน.2043 (B → A)");
    await expect(page.locator(".hdms-focus-endpoint")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(adminExitBar).toHaveCount(0);

    // Re-enter by keyboard; the first step already asserts opening by pointer.
    await floodPin.press("Enter");
    await expect(floodPopup).toBeVisible();
    await floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
    await expect(adminExitBar).toBeVisible();

    await page.getByRole("complementary").getByRole("button", { name: /รายงานสถานการณ์น้ำท่วม/ }).click();
    await page.getByRole("button", { name: "เลือกจุด A", exact: true }).click();

    await expect(adminExitBar).toHaveCount(0);
    await expect(page.getByText("คลิกบนแผนที่เพื่อกำหนดจุดเริ่มต้น...")).toBeVisible();
  });
});

test("public focus endpoint markers inspect A and B without changing travel direction", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 640 : 900 });
  const payload = createMockPayload();
  const detour = payload.detourRoutes[0];
  detour.detour_meta = {
    ...detour.detour_meta,
    start_point_photo: { url: "https://images.example.test/start.png", caption: "ทะเบียนภาพจุด A", subdistrict: "ตัวอย่าง ก", district: "ทดสอบ ก", province: "ปัตตานี" },
    end_point_photo: { caption: "ทะเบียนจุด B ไม่มีรูป", subdistrict: "ตัวอย่าง ข", district: "ทดสอบ ข", province: "ปัตตานี" },
  };
  detour.description = "ขาไป:\n1. แยกต้นทาง\n2. สะพานกลางทาง\n3. แยกสิ้นสุด\nขากลับ:\n1. แยกสิ้นสุด\n2. สะพานขากลับ\n3. แยกต้นทาง";
  await page.route("https://images.example.test/start.png", route => route.fulfill({
    contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACwAAAAAAQABAAA=", "base64"),
  }));
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.goto(base + "/");
  const detourSymbol = page.locator(".doh-detour-symbol").first();
  await detourSymbol.focus();
  await detourSymbol.press("Enter");
  const overview = page.locator(".doh-detour-popup");
  await overview.getByRole("button", { name: "ขากลับ B → A" }).click();
  await overview.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
  const focusBar = page.getByTestId("gis-focus-mode-bar");
  await expect(focusBar).toContainText("ขากลับ (B → A)");
  const pointA = page.locator(".hdms-focus-endpoint.doh-detour-photo-start");
  const pointB = page.locator(".hdms-focus-endpoint.doh-detour-photo-end");
  await expect(pointA).toBeVisible();
  await pointA.press("Enter");
  const popup = page.locator("[data-detour-endpoint]");
  const leafletPopup = page.locator(".leaflet-popup");
  await expect(popup.getByRole("heading", { name: "A · จุดเริ่มต้น" })).toBeVisible();
  await expect(pointA).toHaveAccessibleName("A · จุดเริ่มต้น (ปลายทางของขากลับ B → A)");
  await expect(popup.locator(".citizen-endpoint-caption")).toHaveText("ทะเบียนภาพจุด A");
  const guide = popup.locator("[data-endpoint-guide]");
  await expect(guide).toContainText("สะพานขากลับ");
  await expect(guide).not.toContainText("สะพานกลางทาง");
  await expect(guide.getByRole("listitem")).toHaveCount(3);
  await expect(popup.locator("[data-endpoint-locality]")).toContainText("ต.ตัวอย่าง ก");
  const endpointPhoto = popup.getByRole("button", { name: "เปิดภาพขนาดเต็ม A · จุดเริ่มต้น" });
  const photoBox = await endpointPhoto.locator("img").boundingBox();
  expect(photoBox!.width / photoBox!.height).toBeCloseTo(16 / 9, 1);
  await endpointPhoto.click();
  const viewer = page.getByRole("dialog", { name: "ภาพถ่ายสถานการณ์ขนาดเต็ม" });
  await expect(viewer).toHaveAttribute("data-hdms-popup", "photo");
  await expect(viewer.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(endpointPhoto).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(pointA).toBeFocused();

  await expect(pointB).toHaveAccessibleName("B · จุดสิ้นสุด (ต้นทางของขากลับ B → A)");
  await pointB.press("Enter");
  await expect(leafletPopup).toHaveCount(1);
  await expect(popup.getByRole("heading", { name: "B · จุดสิ้นสุด" })).toBeVisible();
  await expect(popup.locator("[data-endpoint-locality]")).toContainText("ต.ตัวอย่าง ข");
  await expect(popup.getByRole("img")).toHaveCount(0);
  await expect(focusBar).toContainText("ขากลับ (B → A)");
  await popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
  await expect(leafletPopup).toHaveCount(0);
  await expect(focusBar).toContainText("ขากลับ (B → A)");
});

test("focus retains readable direction controls without the duplicate advice panel", async ({ page, isMobile }) => {
  const payload = createMockPayload();
  payload.detourRoutes[0].description = "ขาไป:\n1. เริ่มต้น\n2. เลี้ยวซ้ายที่แยก\n3. สิ้นสุด\nขากลับ:\n1. เริ่มต้นขากลับ\n2. ใช้สะพาน\n3. สิ้นสุด";
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base + "/");
  await page.locator(".doh-detour-symbol").first().press("Enter");
  await page.locator(".doh-detour-popup").getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
  const bar = page.getByTestId("gis-focus-mode-bar");
  if (isMobile) await bar.getByRole("button", { name: "ตัวเลือกเส้นทาง", exact: true }).click();
  const duplicateAdvice = bar.getByRole("button", { name: /(?:อ่าน|ซ่อน)คำแนะนำเส้นทาง/ });
  const retiredPanel = page.getByTestId("gis-focus-timeline-panel");
  await expect(duplicateAdvice).toHaveCount(0);
  await expect(retiredPanel).toHaveCount(0);
  const theme = page.locator(".citizen-ui");
  const reverse = bar.getByTestId("gis-focus-dir-reverse");
  const forward = bar.getByTestId("gis-focus-dir-forward");
  await expect(forward).toHaveCSS("transition-property", "box-shadow");
  await expect(reverse).toHaveCSS("transition-property", "box-shadow");
  await expect(theme).toHaveAttribute("data-citizen-theme", "light");
  const keyboardHint = bar.locator("kbd");
  if (!isMobile) {
    await expect(keyboardHint).toHaveCSS("color", "rgb(23, 53, 74)");
    await expect(keyboardHint).toHaveCSS("background-color", "rgb(230, 238, 241)");
  }
  const ratios = () => page.evaluate(() => {
    function luminance(color: string) {
      const rgba = color.match(/[\d.]+/g)?.map(Number) ?? [];
      if (rgba.length < 3) throw new Error(`Unsupported color: ${color}`);
      const linear = rgba.slice(0, 3).map(value => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    const selectors = [
      ".citizen-focus-directions button",
    ];
    return selectors.flatMap(selector => {
      const nodes = [...document.querySelectorAll(selector)];
      if (!nodes.length) throw new Error(`No nodes for ${selector}`);
      return nodes.map(el => {
        let surface = el;
        while (getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)" && surface.parentElement) surface = surface.parentElement;
        const [a, b] = [luminance(getComputedStyle(el).color), luminance(getComputedStyle(surface).backgroundColor)];
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    });
  });
  expect(Math.min(...await ratios())).toBeGreaterThanOrEqual(4.5);
  await reverse.click();
  await expect(reverse).toHaveAttribute("aria-pressed", "true");
  await expect(forward).toHaveAttribute("aria-pressed", "false");
  await expect(bar).toContainText("ขากลับ (B → A)");
  await expect(retiredPanel).toHaveCount(0);
  await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
  await expect(theme).toHaveAttribute("data-citizen-theme", "dark");
  if (!isMobile) {
    await expect(keyboardHint).toHaveCSS("color", "rgb(244, 248, 250)");
    await expect(keyboardHint).toHaveCSS("background-color", "rgb(34, 53, 72)");
  }
  expect(Math.min(...await ratios())).toBeGreaterThanOrEqual(4.5);
  await expect(reverse).toHaveAttribute("aria-pressed", "true");
  await expect(duplicateAdvice).toHaveCount(0);
  const popup = page.locator("[data-detour-endpoint]");
  const guide = popup.locator("[data-endpoint-guide]");
  await expect(popup).toHaveAttribute("data-detour-endpoint", "END");
  await expect(guide).toContainText("ใช้สะพาน");
  await expect(guide).not.toContainText("เลี้ยวซ้ายที่แยก");
  await expect(retiredPanel).toHaveCount(0);
  await forward.click();
  await expect(popup).toHaveCount(1);
  await expect(popup).toHaveAttribute("data-detour-endpoint", "START");
  await expect(guide).toContainText("เลี้ยวซ้ายที่แยก");
  await expect(guide).not.toContainText("ใช้สะพาน");
  await page.locator(".leaflet-popup-close-button").click();
  await expect(popup).toHaveCount(0);
  await forward.click();
  await expect(popup).toHaveAttribute("data-detour-endpoint", "START");
});

test("public overview A and B use the same anchored inspector, retaining the chosen reverse itinerary", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1280, height: isMobile ? 760 : 900 });
  const payload = createMockPayload();
  const route = payload.detourRoutes[0];
  route.detour_meta = { ...route.detour_meta, start_point_photo: { caption: "ข้อมูลปลาย A ในแผนที่รวม", subdistrict: "ตัวอย่าง ก" }, end_point_photo: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=" } };
  route.description = "ขาไป:\n1. จุด A\n2. ผ่านแยกไป\n3. จุด B\nขากลับ:\n1. จุด B\n2. ผ่านแยกกลับ\n3. จุด A";
  await page.route("**/functions/v1/hdms-api", (request) => request.fulfill({ json: payload }));
  await page.goto(base + "/");
  if (isMobile) await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
  const symbol = page.locator(".doh-detour-symbol").first();
  await expect(symbol).toBeVisible();
  const pointA = page.locator(".doh-detour-photo-start:not(.hdms-focus-endpoint)").first();
  const pointB = page.locator(".doh-detour-photo-end:not(.hdms-focus-endpoint)").first();
  await expect(pointA).toBeHidden();
  await expect(pointB).toBeHidden();
  await symbol.press("Enter");
  await expect(page.locator(".doh-detour-popup")).toBeVisible();
  await expect(pointA).toBeVisible();
  await expect(pointB).toBeVisible();
  await page.locator(".leaflet-popup-close-button").click();
  await expect(pointA).toBeHidden();
  await expect(pointB).toBeHidden();
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomLevel = () => page.locator("[data-public-layer-opacities]").evaluate(el =>
    JSON.parse((el as HTMLElement).dataset.publicLayerOpacities || "{}").zoom as number
  );
  for (let i = 0; i < 6 && !(await pointB.isVisible()); i++) {
    const previous = await zoomLevel();
    await zoomIn.click();
    await expect.poll(zoomLevel).toBeGreaterThan(previous);
  }
  await expect(pointB).toHaveAccessibleName("B · จุดสิ้นสุด (ปลายทางของขาไป A → B)");
  await symbol.press("Enter");
  await page.locator(".doh-detour-popup").getByRole("button", { name: "ขากลับ B → A" }).click();
  await page.locator(".leaflet-popup-close-button").click();
  await expect(pointB).toHaveAccessibleName("B · จุดสิ้นสุด (ต้นทางของขากลับ B → A)");
  await zoomIn.click();
  await expect(pointB).toHaveAccessibleName("B · จุดสิ้นสุด (ต้นทางของขากลับ B → A)");
  await pointB.press("Enter");
  const popup = page.locator("[data-detour-endpoint]");
  await expect(popup.getByRole("heading", { name: "B · จุดสิ้นสุด" })).toBeVisible();
  const photoB = popup.getByRole("button", { name: "เปิดภาพขนาดเต็ม B · จุดสิ้นสุด" });
  await photoB.click();
  const viewer = page.getByRole("dialog", { name: "ภาพถ่ายสถานการณ์ขนาดเต็ม" });
  await expect(viewer.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(photoB).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);

  await expect(pointA).toHaveAccessibleName("A · จุดเริ่มต้น (ปลายทางของขากลับ B → A)");
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  }
  await pointA.press("Enter");
  await expect(popup.getByRole("heading", { name: "A · จุดเริ่มต้น" })).toBeVisible();
  await expect(popup).toContainText("ข้อมูลปลาย A ในแผนที่รวม");
  const advice = popup.locator("[data-endpoint-guide]");
  await expect(advice).toContainText("ผ่านแยกกลับ");
  await expect(advice).not.toContainText("ผ่านแยกไป");
  const body = popup.locator("[data-endpoint-scroll]");
  await page.waitForTimeout(650);
  const mapBeforeScroll = await page.locator(".leaflet-map-pane").first().evaluate(el => getComputedStyle(el).transform);
  await body.press("End");
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(advice.getByText("สภาพเส้นทาง", { exact: true })).toBeInViewport();
  expect(await page.locator(".leaflet-map-pane").first().evaluate(el => getComputedStyle(el).transform)).toBe(mapBeforeScroll);
  await expect.poll(() => popup.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  const actions = popup.locator(".citizen-endpoint-actions");
  await expect(actions.locator(":scope > :first-child")).toHaveText("ดูบน Google Maps");
  const locate = actions.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" });
  await expect(locate).toBeInViewport();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  await locate.click();
  await expect(page.getByTestId("gis-focus-mode-bar")).toContainText("ขากลับ (B → A)");
  await expect(popup).toHaveCount(0);
});

test("public recommendation and both endpoint cards use the identical Maps URL for the selected direction", async ({ page, isMobile }) => {
  const data = createMockPayload();
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: data }));
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  for (const reverse of [false, true]) {
    await page.goto(base + "/");
    const nav = isMobile
      ? page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "ทางเลี่ยง", exact: true })
      : page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" }).getByRole("button", { name: /ทางเลี่ยง \d+ เส้นทาง/ });
    await nav.click();
    const list = page.getByRole("region", { name: "รายการทางเลี่ยง" }).filter({ visible: true });
    await list.getByRole("button", { name: /เส้นทางเลี่ยง ปน\.2043/ }).click();
    const detail = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
    if (reverse) await detail.getByRole("button", { name: "ขากลับ B → A", exact: true }).click();
    const maps = (container: typeof detail) => container.getByRole("link", { name: /ดูบน Google Maps/ });
    const url = await maps(detail).getAttribute("href");
    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("origin")).toBe(reverse ? "6.81,101.17" : "6.78,101.13");
    expect(parsed.searchParams.get("destination")).toBe(reverse ? "6.78,101.13" : "6.81,101.17");
    await detail.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    const focusBar = page.getByTestId("gis-focus-mode-bar");
    await expect(focusBar).toContainText(reverse ? "ขากลับ (B → A)" : "ขาไป (A → B)");
    await page.locator(".hdms-focus-endpoint.doh-detour-photo-start").press("Enter");
    const popup = page.locator("[data-detour-endpoint]");
    await expect(maps(popup)).toHaveAttribute("href", url!);
    await page.keyboard.press("Escape");
    await page.locator(".hdms-focus-endpoint.doh-detour-photo-end").press("Enter");
    await expect(maps(popup)).toHaveAttribute("href", url!);
    await expect(focusBar).toContainText(reverse ? "ขากลับ (B → A)" : "ขาไป (A → B)");
  }
});

test("grouped detours keep linked alternatives separate and split only the recorded directional pair", async ({ page }) => {
  const payload = createMockPayload();
  const primary = payload.detourRoutes[0];
  primary.description = "ขาไป:\n1. เลนขาไป\nขากลับ:\n1. เลนขากลับ";
  primary.reverse_coordinates_json = [[101.17, 6.812], [101.15, 6.803], [101.13, 6.792]];
  payload.detourRoutes.push({
    ...primary,
    id: "D-OTHER",
    route_name: "ทางเลี่ยงอีกสายที่ผูกเหตุเดียวกัน",
    direction_mode: "FORWARD_ONLY",
    coordinates_json: [[101.13, 6.85], [101.15, 6.86], [101.17, 6.87]],
    reverse_coordinates_json: [],
  } as typeof primary);
  payload.detourRoutes.push({
    ...primary,
    id: "D-SHARED",
    route_name: "ทางเลี่ยงคันทางเดียว",
    coordinates_json: [[101.13, 6.83], [101.17, 6.84]],
    reverse_coordinates_json: [[101.17, 6.84], [101.13, 6.83]],
  } as typeof primary);
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
  await page.goto(base + "/");

  const symbols = page.locator(".doh-detour-symbol");
  await expect(symbols).toHaveCount(3);
  const layerButton = page.getByRole("group", { name: "เครื่องมือแผนที่" }).getByRole("button", { name: "เลเยอร์", exact: true });
  await layerButton.click();
  const legend = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
  await legend.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
  const mode = legend.getByRole("group", { name: "รูปแบบแสดงทางเลี่ยง" });
  await expect(mode.getByRole("button", { name: "รวมทางเลี่ยง" })).toHaveAttribute("aria-pressed", "true");
  await mode.getByRole("button", { name: "แยกตามทิศทาง" }).click();
  await expect(symbols).toHaveCount(4);
  await layerButton.click();
  const reverseMarker = page.getByRole("button", { name: "ขากลับ B → A: เส้นทางเลี่ยง ปน.2043", exact: true });
  await reverseMarker.press("Enter");
  const popup = page.locator(".doh-detour-popup");
  await expect(popup.getByRole("button", { name: "ขากลับ B → A" })).toHaveAttribute("aria-pressed", "true");
  await expect(popup.getByText("เลนขากลับ")).toBeVisible();
  await popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
  await expect(page.getByTestId("gis-focus-mode-bar")).toContainText("ขากลับ (B → A)");
  await page.getByRole("button", { name: "ออกจากโหมดโฟกัส" }).click();

  await layerButton.click();
  if (!(await mode.isVisible())) await legend.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
  await mode.getByRole("button", { name: "รวมทางเลี่ยง" }).click();
  await expect(symbols).toHaveCount(3);
  await layerButton.click();
  await page.getByRole("button", { name: "ทางเลี่ยง: ทางเลี่ยงอีกสายที่ผูกเหตุเดียวกัน", exact: true }).press("Enter");
  await expect(popup.getByRole("button", { name: "ขากลับ B → A" })).toBeDisabled();
});

test("public detour focus returns keyboard to the opener or a usable map control", async ({ page, isMobile }) => {
  await page.route(/https?:\/\/(?:[^/]+\.)?(?:longdo\.com|openstreetmap\.org|arcgisonline\.com)\//, route => route.abort());
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: createMockPayload() }));
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto(`${base}/`);
  const mapTools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const zoomIn = mapTools.getByRole("button", { name: "Zoom in", exact: true });
  const zoomOut = mapTools.getByRole("button", { name: "Zoom out", exact: true });
  const summaryDetours = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" })
    .getByRole("button", { name: /ทางเลี่ยง/ });
  const opener = page.getByRole("region", { name: "รายการทางเลี่ยง", exact: true })
    .getByRole("button", { name: /เส้นทางเลี่ยง ปน\.2043/ });
  const dossier = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  const focusBar = page.getByTestId("gis-focus-mode-bar");
  const exit = page.getByTestId("gis-focus-exit-btn");
  await summaryDetours.press("Enter");
  await opener.press("Enter");
  await expect(dossier).toBeVisible();
  await dossier.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).press("Enter");
  await expect(focusBar).toBeVisible();
  // Drive the visible exit explicitly; Escape uses the same shared exit lifecycle.
  await exit.press(isMobile ? "Escape" : "Enter");
  await expect(focusBar).toHaveCount(0);
  await expect(dossier).toHaveCount(0);
  await expect(isMobile ? zoomIn : opener).toBeFocused();
  await page.keyboard.press("Tab");
  if (isMobile) await expect(zoomOut).toBeFocused();
  else await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test("public detour popup keyboard focus exits without trapping Tab or stealing search focus", async ({ page, isMobile }) => {
  await page.route(/https?:\/\/(?:[^/]+\.)?(?:longdo\.com|openstreetmap\.org|arcgisonline\.com)\//, route => route.abort());
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: createMockPayload() }));
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto(`${base}/`);
  const pin = page.locator(".doh-detour-symbol").first();
  const popup = page.locator(".doh-detour-leaflet-popup");
  const focusBar = page.getByTestId("gis-focus-mode-bar");
  const exit = page.getByTestId("gis-focus-exit-btn");
  const mapTools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const enterFromPin = async () => {
    await pin.press("Enter");
    await expect(popup).toBeVisible();
    await popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).press("Enter");
    await expect(focusBar).toBeVisible();
    await expect(popup).toHaveCount(0);
  };
  await enterFromPin();
  await exit.press(isMobile ? "Enter" : "Escape");
  await expect(focusBar).toHaveCount(0);
  await expect(popup).toHaveCount(0);
  await expect(mapTools.getByRole("button", { name: "Zoom in", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(mapTools.getByRole("button", { name: "Zoom out", exact: true })).toBeFocused();

  if (!isMobile) {
    await enterFromPin();
    const search = page.getByPlaceholder(/ค้นหาสายทาง/);
    await search.fill("42");
    await expect(focusBar).toHaveCount(0);
    await expect(search).toHaveValue("42");
    await expect(search).toBeFocused();
    await expect(popup).toHaveCount(0);
  }
});

for (const endpoint of ["start", "end"]) {
  test(`opening focused detour ${endpoint} endpoint reveals it once without pulling a drag back`, async ({ page, context, isMobile, baseURL }) => {
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: isMobile ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const payload = createMockPayload();
    payload.detourRoutes = payload.detourRoutes.slice(0, 1);
    const route = payload.detourRoutes[0];
    route.detour_meta = {
      ...route.detour_meta,
      start_point_photo: { caption: "รายละเอียด A", district: "ตัวอย่าง ก", province: "ปัตตานี" },
      end_point_photo: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=", caption: "รายละเอียด B", district: "ตัวอย่าง ข", province: "ยะลา" },
    };
    const allowedOrigin = new URL(baseURL!).origin;
    await page.route("**/*", (request) => {
      const url = new URL(request.request().url());
      if (url.pathname === "/functions/v1/hdms-api" && /^get/.test(request.request().postDataJSON()?.action ?? "")) {
        return request.fulfill({ json: payload });
      }
      return url.origin === allowedOrigin ? request.continue() : request.abort();
    });
    await page.goto(base + "/");
    await page.locator(".doh-detour-symbol").first().press("Enter");
    const overview = page.locator(".doh-detour-popup");
    await overview.getByRole("button", { name: "ขากลับ B → A", exact: true }).click();
    await overview.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
    await expect(page.getByTestId("gis-focus-mode-bar")).toBeVisible();
    const marker = page.locator(`.hdms-focus-endpoint.doh-detour-photo-${endpoint}`);
    await marker.press("Enter");
    const popup = page.locator("[data-detour-endpoint]");
    const map = page.locator(".leaflet-container").first();
    await expect(popup).toBeVisible();
    await expect.poll(async () => {
      const [frame, bounds] = await Promise.all([popup.boundingBox(), map.boundingBox()]);
      return !!frame && !!bounds && frame.y >= bounds.y && frame.y + frame.height <= bounds.y + bounds.height;
    }).toBe(true);
    // Wait for the first auto-pan to settle before deliberately taking the map.
    await page.waitForTimeout(850);
    const start = await map.evaluate((el) => {
      const box = el.getBoundingClientRect();
      for (const fy of [.73, .68, .60]) for (const fx of [.34, .18, .65, .48, .8]) {
        const x = box.x + box.width * fx, y = box.y + box.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (y - 275 > box.top && hit && el.contains(hit) && !hit.closest("button,a,.leaflet-popup,.leaflet-marker-icon")) return { x, y };
      }
      return null;
    });
    expect(start).not.toBeNull();
    const { x, y } = start!;
    const panY = () => map.locator(".leaflet-map-pane").evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);
    const original = await panY();
    const step = Math.min(26, (y - 70) / 14);
    const touch = isMobile ? await context.newCDPSession(page) : null;
    if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    else {
      await page.mouse.move(x, y);
      await page.mouse.down();
    }
    for (let i = 1; i <= 13; i++) {
      if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * step }] });
      else await page.mouse.move(x, y - i * step);
      await page.waitForTimeout(27);
    }
    // A paused release intentionally avoids Leaflet drag inertia.
    await page.waitForTimeout(250);
    const beforeRelease = await panY();
    if (touch) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();
    } else await page.mouse.up();
    await page.waitForTimeout(850);
    expect(Math.abs(beforeRelease - original)).toBeGreaterThan(200);
    expect(Math.abs(await panY() - beforeRelease)).toBeLessThan(4);
    await expect(popup).toHaveCount(1);
    await page.locator(".leaflet-popup-close-button").press("Enter");
    await expect(popup).toHaveCount(0);
  });
}

for (const kind of ["flood", "detour"] as const) {
  for (const opener of ["line", "symbol"] as const) {
    test(`${kind} ${opener} popup preserves manual map pan and zoom without entering focus`, async ({ page, context, isMobile, baseURL }) => {
      await page.setViewportSize({ width: isMobile ? 390 : 1440, height: isMobile ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const payload = createMockPayload();
      const [flood] = payload.floodRoutes;
      const [detour] = payload.detourRoutes;
      payload.floodRoutes = [flood];
      payload.detourRoutes = [detour];
      function placeLine<T extends typeof flood | typeof detour>(route: T, lat: number) {
        Object.assign(route, {
          lat_start: lat, lat_end: lat, lon_start: 101.12, lon_end: 101.38,
          coordinates_json: [[101.12, lat], [101.25, lat], [101.38, lat]],
        });
      }
      placeLine(flood, 6.76);
      placeLine(detour, 6.875);
      detour.reverse_coordinates_json = [[101.38, 6.875], [101.25, 6.875], [101.12, 6.875]];
      payload.mapStyles = structuredClone(DEFAULT_MAP_STYLES);
      const colors = { flood: "#e52b80", detour: "#092bd9" };
      for (const key of ["flood", "detour"] as const) {
        Object.assign(payload.mapStyles[key], { color: colors[key], weight: 11, opacity: 1, animationEnabled: false });
      }
      const origin = new URL(baseURL!).origin;
      await page.route("**/*", request => {
        const url = new URL(request.request().url());
        if (url.pathname === "/functions/v1/hdms-api" && /^get/.test(request.request().postDataJSON()?.action ?? "")) {
          return request.fulfill({ json: payload });
        }
        return url.origin === origin ? request.continue() : request.abort();
      });
      await page.goto(base + "/");
      const initialUrl = page.url();
      const map = page.locator(".leaflet-container").first();
      const marker = map.locator(kind === "flood" ? ".doh-map-capsule-pin" : ".doh-detour-symbol").first();
      await expect(marker).toBeVisible();
      if (opener === "symbol") {
        await marker.press("Enter");
      } else {
        // Leaflet draws vector paths on canvas. Target a pixel from the actual
        // synthetic route stroke, away from any symbol or overlaying control.
        let target: { x: number; y: number } | null = null;
        await expect.poll(async () => {
          target = await map.evaluate((el, hex) => {
            const canvas = el.querySelector<HTMLCanvasElement>(".leaflet-overlay-pane canvas");
            if (!canvas) return null;
            const cr = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
            const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
            const color = hex.slice(1).match(/../g)!.map(n => parseInt(n, 16));
            const markerFrames = [...el.querySelectorAll(".leaflet-marker-icon")].map(icon => icon.getBoundingClientRect());
            for (let row = 0; row < canvas.height; row += 2) {
              for (let col = 0; col < canvas.width; col += 2) {
                const i = (row * canvas.width + col) * 4;
                if (pixels[i] !== color[0] || pixels[i + 1] !== color[1] || pixels[i + 2] !== color[2] || pixels[i + 3] < 240) continue;
                const x = cr.x + col * cr.width / canvas.width, y = cr.y + row * cr.height / canvas.height;
                if (x < Math.max(r.left, 0) + 22 || x > Math.min(r.right, innerWidth) - 22 ||
                  y < Math.max(r.top, 70) + 25 || y > Math.min(r.bottom, innerHeight) - 90) continue;
                if (markerFrames.some(b => x > b.left - 14 && x < b.right + 14 && y > b.top - 14 && y < b.bottom + 14)) continue;
                const hit = document.elementFromPoint(x, y);
                if (hit && el.contains(hit) && !hit.closest("a,button,.leaflet-popup,.leaflet-marker-icon")) return { x, y };
              }
            }
            return null;
          }, colors[kind]);
          return !!target;
        }).toBe(true);
        const { x, y } = target!;
        if (isMobile) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      }
      const popup = map.locator(kind === "flood" ? ".doh-flood-leaflet-popup" : ".doh-detour-leaflet-popup");
      await expect(popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true })).toBeVisible();
      // Wait through native initial pan and the single initial reveal guard.
      await page.waitForTimeout(850);
      const start = await map.evaluate(el => {
        const r = el.getBoundingClientRect();
        for (const fy of [.73, .68, .60, .77]) for (const fx of [.34, .18, .65, .48, .8]) {
          const x = r.x + r.width * fx, y = r.y + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (y - 276 > Math.max(r.top, 70) && hit && el.contains(hit) && !hit.closest("button,a,.leaflet-popup,.leaflet-marker-icon")) return { x, y };
        }
        return null;
      });
      expect(start).not.toBeNull();
      const { x, y } = start!;
      const camera = () => map.locator(".leaflet-map-pane").evaluate(el => {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return [m.m41, m.m42];
      });
      const initial = await camera();
      const touch = isMobile ? await context.newCDPSession(page) : null;
      if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      for (let step = 1; step <= 13; step++) {
        if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 26 }] });
        else await page.mouse.move(x, y - step * 26);
        await page.waitForTimeout(27);
      }
      // Paused release excludes legitimate inertia from the measured correction.
      await page.waitForTimeout(250);
      const release = await camera();
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await touch.detach();
      } else await page.mouse.up();
      await page.waitForTimeout(850);
      expect(Math.abs(release[1] - initial[1])).toBeGreaterThan(200);
      expect(await camera()).toEqual(release);
      await expect(popup).toHaveCount(1);
      const zoomLevel = () => map.evaluate(el => JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}").zoom as number);
      const zoom = await zoomLevel();
      await page.getByRole("button", { name: "Zoom out", exact: true }).press("Enter");
      await expect.poll(zoomLevel).toBe(zoom - 1);
      const afterZoom = await camera();
      await page.waitForTimeout(650);
      expect(await camera()).toEqual(afterZoom);
      await expect(popup).toHaveCount(1);
      await expect(page).toHaveURL(initialUrl);
      await expect(page.getByTestId("gis-focus-mode-bar")).toHaveCount(0);
    });
  }
}

test("detour summary and endpoint guide keep compact text spacing and readable route units", async ({ page, isMobile }, testInfo) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1280, height: isMobile ? 844 : 900 });
  const payload = createMockPayload();
  payload.detourRoutes[0].description = "ขาไป:\n1. จุดเริ่มต้น\n2. ขับตรงตามถนนในเขตตำบลท่ากำชำ อำเภอหนองจิก จังหวัดปัตตานี\n3. ถึงจุดบรรจบทางหลวงสายหลัก";
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
  await page.goto(base + "/");
  await page.locator(".doh-detour-symbol").first().press("Enter");
  const overview = page.locator(".doh-detour-popup");
  const assertCards = async (scope: typeof overview) => {
    const cards = scope.locator(".doh-detour-step-card:visible");
    await expect(cards.first()).toBeVisible();
    const layout = await cards.evaluateAll(nodes => nodes.map(node => {
      const card = node as HTMLElement;
      const p = card.querySelector<HTMLElement>(".doh-detour-step-detail");
      const badge = card.querySelector<HTMLElement>(".doh-detour-step-badge")!;
      return {
        horizontalOverflow: card.scrollWidth - card.clientWidth,
        badge: getComputedStyle(badge).whiteSpace,
        paragraphGap: p ? parseFloat(getComputedStyle(p).marginTop) : 0,
        paragraphEnd: p ? parseFloat(getComputedStyle(p).marginBottom) : 0,
        lineHeight: parseFloat(getComputedStyle(card).lineHeight),
      };
    }));
    expect(layout.every(x => x.horizontalOverflow <= 1 && x.badge === "nowrap" &&
      x.paragraphGap < x.lineHeight && x.paragraphEnd === 0)).toBeTruthy();
    expect(await scope.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  };
  await expect(overview).toBeVisible();
  await assertCards(overview);
  await expect(overview.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true })).toHaveCSS("min-height","44px");
  await page.screenshot({ path: testInfo.outputPath("compact-detour-guide.png"), animations:"disabled" });
  await overview.getByRole("button", { name: "ดูตำแหน่งบนแผนที่", exact: true }).click();
  await expect(page.getByTestId("gis-focus-mode-bar")).toBeVisible();
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  }
  await page.locator(".hdms-focus-endpoint.doh-detour-photo-start").press("Enter");
  const endpoint = page.locator("[data-detour-endpoint=START]");
  await expect(endpoint).toBeVisible();
  const detail = endpoint.locator("[data-endpoint-scroll]");
  await detail.press("End");
  await assertCards(endpoint);
  await expect(endpoint.getByRole("button", { name:"ดูตำแหน่งบนแผนที่", exact:true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("compact-endpoint-guide.png"), animations:"disabled" });
});
