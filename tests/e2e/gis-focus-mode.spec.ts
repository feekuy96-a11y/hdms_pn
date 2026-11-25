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
  test("Flood Focus -> linked detour overlay -> A/B switch -> Exit via Esc on Desktop", async ({ page, isMobile }) => {
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

    const overlayBtn = page.getByTestId("gis-focus-toggle-linked-detour");
    await expect(overlayBtn).toBeVisible();
    await overlayBtn.click();
    await expect(overlayBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("gis-focus-dir-reverse")).toBeVisible();
    await page.getByTestId("gis-focus-dir-reverse").click();
    await expect(page.getByTestId("gis-focus-dir-reverse")).toHaveAttribute("aria-pressed", "true");

    // Exit with Esc on Desktop — must not reopen modal/popup
    await page.keyboard.press("Escape");
    await expect(focusBar).toHaveCount(0);
    await expect(floodDialog).toHaveCount(0);
  });

  test("Detour Focus from DetourDossierModal on Mobile collapses drawer and exits cleanly", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile viewport drawer & focus verification");
    const payload = createMockPayload();
    await page.route("**/functions/v1/hdms-api", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) })
    );

    await page.goto(`${base}/`);
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    await page.getByRole("button", { name: /ทางเลี่ยง/ }).first().click();
    await page.getByRole("button", { name: /เส้นทางเลี่ยง ปน\.2043/ }).first().click();

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
    await page.waitForTimeout(350);

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

    // Toggle linked detour overlay -> verify fitBounds places endpoints cleanly above mobile Focus Bar
    await page.getByRole("button", { name: "ตัวเลือกเส้นทาง" }).click();
    await page.getByTestId("gis-focus-toggle-linked-detour").click();
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
    await page.getByTestId("gis-focus-toggle-linked-detour").click();
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

test.describe("Admin Shared GIS Focus Mode", () => {
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

    // 3. Re-enter Focus Mode, then trigger map pick mode -> isEditingBlocked must auto-exit Focus Mode
    await floodPin.click();
    await expect(floodPopup).toBeVisible();
    await floodPopup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" }).click();
    await expect(adminExitBar).toBeVisible();

    await page.getByRole("complementary").getByRole("button", { name: /รายงานสถานการณ์น้ำท่วม/ }).click();
    await page.getByRole("button", { name: "เลือกจุด A", exact: true }).click();

    await expect(adminExitBar).toHaveCount(0);
    await expect(page.getByText("คลิกบนแผนที่เพื่อกำหนดจุดเริ่มต้น...")).toBeVisible();
  });
});

test("public focus endpoint selector re-anchors one popup A to B to A without changing travel direction", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 640 : 900 });
  const payload = createMockPayload();
  const detour = payload.detourRoutes[0];
  detour.detour_meta = {
    ...detour.detour_meta,
    start_point_photo: { url: "https://images.example.test/start.png", caption: "ทะเบียนภาพจุด A", subdistrict: "ตัวอย่าง ก", district: "ทดสอบ ก", province: "ปัตตานี" },
    end_point_photo: { caption: "ทะเบียนจุด B ไม่มีรูป", subdistrict: "ตัวอย่าง ข", district: "ทดสอบ ข", province: "ปัตตานี" },
  };
  detour.description = "ขาไป:\n1. แยกต้นทาง\n2. สะพานกลางทาง\n3. แยกสิ้นสุด\nขากลับ:\n1. แยกสิ้นสุด\n2. สะพานขากลับ\n3. แยกต้นทาง";
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
  const group = popup.getByRole("group", { name: "เลือกจุดบนเส้นทาง" });
  const a = group.getByRole("button", { name: "A", exact: true });
  const b = group.getByRole("button", { name: "B", exact: true });
  const timeline = popup.getByRole("list", { name: "ลำดับจุดทางเลี่ยง" });
  async function checkAnchor() {
    const box = await leafletPopup.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual((page.viewportSize()?.width || 320) - 16);
    await expect(leafletPopup).toHaveCount(1);
    await expect(popup.locator("[data-endpoint-scroll]")).toBeVisible();
  }
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(popup.locator("img")).toHaveAttribute("src", /start/);
  await expect(popup.locator("[data-endpoint-locality]")).toContainText("ต.ตัวอย่าง ก");
  await expect(timeline).toContainText("สะพานขากลับ");
  const before = await leafletPopup.elementHandle();
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(popup.locator("[data-endpoint-locality]")).toContainText("ต.ตัวอย่าง ข");
  await expect(popup).toContainText("ยังไม่มีภาพถ่ายประกอบจุดนี้");
  await expect(timeline).toContainText("สะพานขากลับ");
  await expect.poll(() => page.evaluate((el) => el.isConnected, before)).toBe(false);
  await checkAnchor();
  await a.click();
  await expect(a).toHaveAttribute("aria-pressed", "true");
  const focusOnMap = popup.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" });
  await focusOnMap.scrollIntoViewIfNeeded();
  await expect(focusOnMap).toBeVisible();
  await checkAnchor();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(focusBar).toContainText("ขากลับ (B → A)");
  await pointB.press("Enter");
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await focusOnMap.click();
  await expect(leafletPopup).toHaveCount(0);
  await expect(focusBar).toContainText("ขากลับ (B → A)");
});

test("public overview A and B use the same anchored inspector, retaining the chosen reverse itinerary", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1280, height: isMobile ? 760 : 900 });
  const payload = createMockPayload();
  const route = payload.detourRoutes[0];
  route.detour_meta = { ...route.detour_meta, start_point_photo: { caption: "ข้อมูลปลาย A ในแผนที่รวม", subdistrict: "ตัวอย่าง ก" } };
  route.description = "ขาไป:\n1. จุด A\n2. ผ่านแยกไป\n3. จุด B\nขากลับ:\n1. จุด B\n2. ผ่านแยกกลับ\n3. จุด A";
  await page.route("**/functions/v1/hdms-api", (request) => request.fulfill({ json: payload }));
  await page.goto(base + "/");
  const symbol = page.locator(".doh-detour-symbol").first();
  await symbol.focus();
  await symbol.press("Enter");
  await page.locator(".doh-detour-popup").getByRole("button", { name: "ขากลับ B → A" }).click();
  await page.locator(".leaflet-popup-close-button").click();
  const pointA = page.locator(".doh-detour-photo-start:not(.hdms-focus-endpoint)").first();
  const pointB = page.locator(".doh-detour-photo-end:not(.hdms-focus-endpoint)").first();
  for (let i=0; i<4 && !(await pointB.isVisible()); i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pointB).toBeVisible();
  await pointB.press("Enter");
  const popup = page.locator("[data-detour-endpoint]");
  const a = popup.getByRole("button", { name: "A", exact:true });
  const b = popup.getByRole("button", { name: "B", exact:true });
  await expect(b).toHaveAttribute("aria-pressed","true");
  await expect(popup).toContainText("ยังไม่มีภาพถ่ายประกอบจุดนี้");
  await a.click();
  await expect(a).toHaveAttribute("aria-pressed","true");
  await expect(popup).toContainText("ข้อมูลปลาย A ในแผนที่รวม");
  await expect(popup.getByRole("list")).toContainText("ผ่านแยกกลับ");
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
  await expect(pointA).toBeVisible();
  await popup.getByRole("button", { name:"ดูตำแหน่งบนแผนที่" }).click();
  await expect(page.getByTestId("gis-focus-mode-bar")).toContainText("ขากลับ (B → A)");
  await expect(popup).toHaveCount(0);
});
