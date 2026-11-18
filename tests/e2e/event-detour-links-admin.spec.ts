import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

interface MockLink {
  eventId: string;
  detourId: string;
  eventDirection: "A_TO_B" | "B_TO_A" | "BOTH" | "UNKNOWN";
  detourDirection: "FORWARD" | "REVERSE" | "TWO_WAY" | "UNKNOWN";
  position: number;
  recommendation: "PENDING" | "RECOMMENDED" | "UNAVAILABLE" | "WITHDRAWN";
  reviewedGeometryVersion: number | null;
}

function createSystemData(extra?: {
  eventDetourLinks?: MockLink[];
  eventSegments?: Array<{ flood_id: string; event_id: string; event_direction: string; segment_position: number }>;
  floodEvents?: Array<{ id: string; link_version: number }>;
}) {
  const updated_at = "2026-11-18T00:00:00.000Z";
  return {
    updatedAt: updated_at,
    floodRoutes: [
      {
        id: "F-1",
        route_no: "42",
        section_name: "คลองแงะ",
        km_start: "10+000",
        km_end: "11+000",
        lat_start: 6.87,
        lon_start: 101.25,
        lat_end: 6.88,
        lon_end: 101.26,
        coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
        water_level_cm: 35,
        traffic_status: "CLOSED",
        is_active: true,
        updated_at,
        road_side: "BOTH",
        direction_meta: {
          eventId: "EV-F-1",
          eventTitle: "ทล.42 ตอนคลองแงะ",
          directionCode: "BOTH",
        },
      },
      {
        id: "F-2",
        route_no: "43",
        section_name: "หนองจิก",
        km_start: "20+000",
        km_end: "21+500",
        lat_start: 6.85,
        lon_start: 101.20,
        lat_end: 6.86,
        lon_end: 101.21,
        coordinates_json: [[101.20, 6.85], [101.21, 6.86]],
        water_level_cm: 25,
        traffic_status: "WARNING",
        is_active: true,
        updated_at,
        road_side: "RIGHT",
        direction_meta: {
          eventId: "EV-F-2",
          eventTitle: "ทล.43 ตอนหนองจิก",
          directionCode: "B_TO_A",
        },
      },
    ],
    detourRoutes: [
      {
        id: "D-1",
        route_name: "ทางเลี่ยงสาย 418",
        flood_id_ref: "F-1",
        lat_start: 6.87,
        lon_start: 101.25,
        lat_end: 6.88,
        lon_end: 101.26,
        coordinates_json: [[101.25, 6.87], [101.26, 6.88]],
        description: "ใช้ทางเลี่ยง ทล.418",
        direction_mode: "TWO_WAY",
        geometry_revision: 3,
        is_active: true,
        updated_at,
      },
      {
        id: "D-2",
        route_name: "ทางเลี่ยงสาย 4092",
        flood_id_ref: null,
        lat_start: 6.85,
        lon_start: 101.20,
        lat_end: 6.86,
        lon_end: 101.21,
        coordinates_json: [[101.20, 6.85], [101.21, 6.86]],
        description: "ใช้ทางเลี่ยง ทล.4092",
        direction_mode: "FORWARD_ONLY",
        geometry_revision: 2,
        is_active: true,
        updated_at,
      },
      {
        id: "D-3",
        route_name: "ทางเลี่ยงสายสำรอง 2003",
        flood_id_ref: null,
        lat_start: 6.84,
        lon_start: 101.19,
        lat_end: 6.85,
        lon_end: 101.20,
        coordinates_json: [[101.19, 6.84], [101.20, 6.85]],
        description: "ใช้ทางเลี่ยง ปน.2003",
        direction_mode: "TWO_WAY",
        geometry_revision: 1,
        is_active: true,
        updated_at,
      },
    ],
    timelineUpdates: [],
    mitigationProjects: [],
    highwayLayers: [],
    offices: [],
    mapStyles: null,
    systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", desc: "", phone: "1586" },
    ...(extra || {}),
  };
}

test("admin links multiple detours to one event using two-way defaults, KM ranges, and Active/Inactive status", async ({ page }) => {
  const store: Record<string, { version: number; links: MockLink[] }> = {
    "EV-F-1": { version: 0, links: [] },
    "EV-F-2": { version: 0, links: [] },
  };
  const callLog: Array<{ action: string; eventId?: string; linksCount?: number }> = [];
  let lastSavedPayload: { eventId: string; expectedVersion: number; links: MockLink[] } | null = null;

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const body = route.request().postDataJSON() as { action: string; args?: any[] };
    const action = body.action;
    const arg = body.args?.[0];

    if (action === "getSystemDataAction") {
      const allLinks = [...store["EV-F-1"].links, ...store["EV-F-2"].links];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          createSystemData({
            eventDetourLinks: allLinks,
            eventSegments: [
              { flood_id: "F-1", event_id: "EV-F-1", event_direction: "BOTH", segment_position: 1 },
              { flood_id: "F-2", event_id: "EV-F-2", event_direction: "B_TO_A", segment_position: 1 },
            ],
            floodEvents: [
              { id: "EV-F-1", link_version: store["EV-F-1"].version },
              { id: "EV-F-2", link_version: store["EV-F-2"].version },
            ],
          })
        ),
      });
      return;
    }
    if (action === "getEventDetourLinksAction") {
      const eventId = String(arg || "");
      const entry = store[eventId] ?? { version: 0, links: [] };
      callLog.push({ action, eventId });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ eventId, version: entry.version, links: entry.links }),
      });
      return;
    }
    if (action === "replaceEventDetourLinksAction") {
      const payload = arg as { eventId: string; expectedVersion: number; operationId: string; links: MockLink[] };
      lastSavedPayload = payload;
      const entry = store[payload.eventId];
      if (!entry || entry.version !== payload.expectedVersion) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Event-detour links changed; reload before saving" }),
        });
        return;
      }
      entry.version += 1;
      entry.links = payload.links;
      callLog.push({ action, eventId: payload.eventId, linksCount: payload.links.length });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ eventId: payload.eventId, version: entry.version, links: entry.links }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();

  const openModalBtn = page.getByRole("button", { name: /จัดการทางเลี่ยงเชื่อมโยง ทล\.42 ตอนคลองแงะ/ });
  await openModalBtn.focus();
  await openModalBtn.click();

  const dialog = page.getByRole("dialog", { name: "จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("เวอร์ชันข้อมูล v0")).toBeVisible();

  // Verify KM range is visible in flood event selector
  const eventSelect = dialog.getByLabel("เลือกเหตุการณ์น้ำท่วม");
  await expect(eventSelect.locator("option", { hasText: "กม.10+000 - 11+000" })).toHaveCount(1);
  await expect(dialog.getByLabel("ทิศทางเหตุการณ์ที่จะเพิ่ม")).toHaveValue("BOTH");

  await dialog.getByRole("button", { name: "เพิ่มทางเลี่ยง ทางเลี่ยงสาย 418" }).click();
  await dialog.getByRole("button", { name: "เพิ่มทางเลี่ยง ทางเลี่ยงสาย 4092" }).click();

  // Verify defaults come from flood & detour records: BOTH/TWO_WAY and status=ACTIVE
  await expect(dialog.getByLabel("ทิศทางเหตุการณ์ของ ทางเลี่ยงสาย 418")).toHaveValue("BOTH");
  await expect(dialog.getByLabel("ทิศทางทางเลี่ยงของ ทางเลี่ยงสาย 418")).toHaveValue("TWO_WAY");
  await expect(dialog.getByLabel("สถานะของ ทางเลี่ยงสาย 418")).toHaveValue("ACTIVE");
  await expect(dialog.getByLabel("ทิศทางทางเลี่ยงของ ทางเลี่ยงสาย 4092")).toHaveValue("FORWARD");

  // Two-way detour direction is disabled on FORWARD_ONLY detour
  const twoWayOptOnForwardOnly = dialog
    .getByLabel("ทิศทางทางเลี่ยงของ ทางเลี่ยงสาย 4092")
    .locator('option[value="TWO_WAY"]');
  await expect(twoWayOptOnForwardOnly).toBeDisabled();

  await dialog.getByRole("button", { name: "เลื่อนลำดับ ทางเลี่ยงสาย 4092 ขึ้น" }).click();
  // Test toggling status to INACTIVE on one link, then keeping the other ACTIVE
  await dialog.getByLabel("สถานะของ ทางเลี่ยงสาย 4092").selectOption("INACTIVE");

  const saveIdxBefore = callLog.length;
  await dialog.getByRole("button", { name: "บันทึกความสัมพันธ์" }).click();

  await expect(dialog.getByText("เวอร์ชันข้อมูล v1")).toBeVisible();
  await expect(dialog.getByText("ยืนยันข้อมูลจากฐานข้อมูลแล้ว (เวอร์ชัน v1 · 2 ความสัมพันธ์)")).toBeVisible();

  expect(lastSavedPayload).not.toBeNull();
  expect(lastSavedPayload!.eventId).toBe("EV-F-1");
  expect(lastSavedPayload!.expectedVersion).toBe(0);
  expect(lastSavedPayload!.links).toHaveLength(2);
  expect(lastSavedPayload!.links[0]).toMatchObject({
    detourId: "D-2",
    eventDirection: "BOTH",
    detourDirection: "FORWARD",
    position: 1,
    recommendation: "WITHDRAWN",
  });
  expect(lastSavedPayload!.links[1]).toMatchObject({
    detourId: "D-1",
    eventDirection: "BOTH",
    detourDirection: "TWO_WAY",
    position: 2,
    recommendation: "RECOMMENDED",
    reviewedGeometryVersion: 3,
  });

  const postSaveCalls = callLog.slice(saveIdxBefore);
  expect(postSaveCalls.map((c) => c.action)).toEqual([
    "replaceEventDetourLinksAction",
    "getEventDetourLinksAction",
  ]);
  expect(postSaveCalls[1].eventId).toBe("EV-F-1");

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflow).toBe(false);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openModalBtn).toBeFocused();
});

test("admin links one detour to multiple events with KM ranges and recovers from 409 conflict", async ({ page }) => {
  const store: Record<string, { version: number; links: MockLink[] }> = {
    "EV-F-1": { version: 0, links: [] },
    "EV-F-2": {
      version: 2,
      links: [
        {
          eventId: "EV-F-2",
          detourId: "D-2",
          eventDirection: "B_TO_A",
          detourDirection: "FORWARD",
          position: 1,
          recommendation: "PENDING",
          reviewedGeometryVersion: null,
        },
      ],
    },
  };
  let forceConflict = false;
  const callLog: Array<{ action: string; eventId?: string }> = [];

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const body = route.request().postDataJSON() as { action: string; args?: any[] };
    const action = body.action;
    const arg = body.args?.[0];

    if (action === "getSystemDataAction") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createSystemData()) });
      return;
    }
    if (action === "getEventDetourLinksAction") {
      const eventId = String(arg || "");
      const entry = store[eventId] ?? { version: 0, links: [] };
      callLog.push({ action, eventId });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ eventId, version: entry.version, links: entry.links }),
      });
      return;
    }
    if (action === "replaceEventDetourLinksAction") {
      const payload = arg as { eventId: string; expectedVersion: number; links: MockLink[] };
      callLog.push({ action, eventId: payload.eventId });
      const entry = store[payload.eventId];
      if (forceConflict || !entry || entry.version !== payload.expectedVersion) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Event-detour links changed; reload before saving" }),
        });
        return;
      }
      entry.version += 1;
      entry.links = payload.links;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ eventId: payload.eventId, version: entry.version, links: entry.links }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการทางเลี่ยง", exact: true }).filter({ visible: true }).first().click();

  const linkDetourBtn = page
    .getByRole("button", { name: "ผูกหลายเหตุการณ์ ทางเลี่ยงสาย 418" })
    .filter({ visible: true })
    .first();
  await linkDetourBtn.click();

  const dialog = page.getByRole("dialog", { name: "จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง" });
  await expect(dialog).toBeVisible();

  // Verify KM ranges are visible next to event titles
  await expect(dialog.getByText("กม.10+000 - 11+000 (1 ช่วง)")).toBeVisible();
  await expect(dialog.getByText("กม.20+000 - 21+500 (1 ช่วง)")).toBeVisible();

  const ev1Check = dialog.getByLabel(/ผูกกับเหตุการณ์ ทล\.42 ตอนคลองแงะ/);
  const ev2Check = dialog.getByLabel(/ผูกกับเหตุการณ์ ทล\.43 ตอนหนองจิก/);
  await expect(ev1Check).toBeEnabled();
  await expect(ev2Check).toBeEnabled();

  await ev1Check.check();
  await ev2Check.check();

  // Verify event & detour directions pulled from saved data
  await expect(dialog.getByLabel(/ทิศทางเหตุการณ์สำหรับ ทล\.42 ตอนคลองแงะ/)).toHaveValue("BOTH");
  await expect(dialog.getByLabel(/ทิศทางทางเลี่ยงสำหรับ ทล\.42 ตอนคลองแงะ/)).toHaveValue("TWO_WAY");
  await expect(dialog.getByLabel(/ทิศทางเหตุการณ์สำหรับ ทล\.43 ตอนหนองจิก/)).toHaveValue("B_TO_A");
  await expect(dialog.getByLabel(/สถานะสำหรับ ทล\.42 ตอนคลองแงะ/)).toHaveValue("ACTIVE");

  const beforeSaveIdx = callLog.length;
  await dialog.getByRole("button", { name: "บันทึกความสัมพันธ์" }).click();

  await expect(dialog.getByText(/ยืนยันข้อมูลจากฐานข้อมูลแล้ว \(อัปเดต 2 เหตุการณ์/)).toBeVisible();
  expect(store["EV-F-1"].version).toBe(1);
  expect(store["EV-F-1"].links[0]).toMatchObject({
    detourId: "D-1",
    eventDirection: "BOTH",
    detourDirection: "TWO_WAY",
    recommendation: "RECOMMENDED",
  });
  expect(store["EV-F-2"].version).toBe(3);
  expect(store["EV-F-2"].links.map((l) => l.detourId)).toEqual(["D-2", "D-1"]);

  const saveAndReloadSeq = callLog.slice(beforeSaveIdx);
  expect(saveAndReloadSeq).toEqual([
    { action: "replaceEventDetourLinksAction", eventId: "EV-F-1" },
    { action: "getEventDetourLinksAction", eventId: "EV-F-1" },
    { action: "replaceEventDetourLinksAction", eventId: "EV-F-2" },
    { action: "getEventDetourLinksAction", eventId: "EV-F-2" },
  ]);

  // Simulate concurrent modification causing 409 conflict
  forceConflict = true;
  store["EV-F-1"].version = 5;
  await ev1Check.uncheck();
  await dialog.getByRole("button", { name: "บันทึกความสัมพันธ์" }).click();

  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Event-detour links changed; reload before saving");

  forceConflict = false;
  const reloadBeforeIdx = callLog.length;
  await alert.getByRole("button", { name: "ลองโหลดใหม่" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog.getByText("v5 · 1 ทางเลี่ยง")).toBeVisible();
  await expect(ev1Check).toBeChecked();
  expect(callLog.slice(reloadBeforeIdx)).toEqual([
    { action: "getEventDetourLinksAction", eventId: "EV-F-1" },
    { action: "getEventDetourLinksAction", eventId: "EV-F-2" },
  ]);
});

test("admin and citizen detail views render all linked detours and linked flood events from doh_event_detour_links", async ({ page }) => {
  const sharedLinks: MockLink[] = [
    {
      eventId: "EV-F-1",
      detourId: "D-1",
      eventDirection: "BOTH",
      detourDirection: "TWO_WAY",
      position: 1,
      recommendation: "RECOMMENDED",
      reviewedGeometryVersion: 3,
    },
    {
      eventId: "EV-F-1",
      detourId: "D-2",
      eventDirection: "A_TO_B",
      detourDirection: "FORWARD",
      position: 2,
      recommendation: "PENDING",
      reviewedGeometryVersion: null,
    },
    {
      eventId: "EV-F-1",
      detourId: "D-3",
      eventDirection: "BOTH",
      detourDirection: "TWO_WAY",
      position: 3,
      recommendation: "WITHDRAWN",
      reviewedGeometryVersion: null,
    },
    {
      eventId: "EV-F-2",
      detourId: "D-1",
      eventDirection: "B_TO_A",
      detourDirection: "TWO_WAY",
      position: 1,
      recommendation: "RECOMMENDED",
      reviewedGeometryVersion: 3,
    },
  ];

  const payload = createSystemData({
    eventDetourLinks: sharedLinks,
    eventSegments: [
      { flood_id: "F-1", event_id: "EV-F-1", event_direction: "BOTH", segment_position: 1 },
      { flood_id: "F-2", event_id: "EV-F-2", event_direction: "B_TO_A", segment_position: 1 },
    ],
    floodEvents: [
      { id: "EV-F-1", link_version: 2 },
      { id: "EV-F-2", link_version: 1 },
    ],
  });

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "getSystemDataAction" || body.action === "getPublicSystemDataAction") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  // 1. Admin Incident & Detour detail modals
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();

  await page.getByRole("button", { name: "รายละเอียด" }).first().click();
  const incidentModal = page.getByRole("dialog", { name: "รายละเอียดเหตุการณ์" });
  await expect(incidentModal).toBeVisible();
  await expect(incidentModal.getByText("ทางเลี่ยงที่เชื่อมโยง (2 สาย)")).toBeVisible();
  await expect(incidentModal.getByText(/ทางเลี่ยงสาย 418/)).toBeVisible();
  await expect(incidentModal.getByText(/ทางเลี่ยงสาย 4092/)).toBeVisible();
  await expect(incidentModal.getByText(/ทางเลี่ยงสายสำรอง 2003/)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "รายการทางเลี่ยง", exact: true }).filter({ visible: true }).first().click();
  await page.getByText("ทางเลี่ยงสาย 418").first().click();
  const detourModal = page.getByRole("dialog", { name: "รายละเอียดเส้นทางเลี่ยง" });
  await expect(detourModal).toBeVisible();
  await expect(detourModal.getByText(/ทล\.42 คลองแงะ/)).toBeVisible();
  await expect(detourModal.getByText(/ทล\.43 หนองจิก/)).toBeVisible();
  await page.keyboard.press("Escape");

  // 2. Citizen Public Portal
  await page.goto(`${base}/`);
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("button", { name: "ดูรายการสายทาง" }).click();
  }
  const firstCard = page.locator("article").filter({ visible: true }).first();
  await expect(firstCard).toContainText("เส้นทางเลี่ยง 2 สาย");
  await firstCard.getByRole("button", { name: /ดูรายละเอียด/ }).click();

  const dossier = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dossier).toBeVisible();
  await expect(dossier.getByText("ทางเลี่ยงแนะนำ (2 สาย)")).toBeVisible();
  await expect(dossier.getByText(/ทางเลี่ยงสาย 418/)).toBeVisible();
  await expect(dossier.getByText(/ทางเลี่ยงสาย 4092/)).toBeVisible();
  await expect(dossier.getByText(/ทางเลี่ยงสายสำรอง 2003/)).toHaveCount(0);
  await dossier.getByRole("button", { name: /ปิด/ }).first().click();

  // Citizen detour tab shows BOTH linked flood events on D-1
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const openSheetBtn = page.getByRole("button", { name: "ดูรายการสายทาง" });
    if (await openSheetBtn.isVisible().catch(() => false)) {
      await openSheetBtn.click();
    }
  }
  await page.getByRole("button", { name: /ทางเลี่ยง/ }).filter({ visible: true }).first().click();
  const detourBtn = page.getByRole("button", { name: /ทางเลี่ยงสาย 418/ }).filter({ visible: true }).first();
  await expect(detourBtn).toContainText("ทล.42, ทล.43");
  await detourBtn.click();
  const publicDetourDialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(publicDetourDialog).toBeVisible();
  await expect(publicDetourDialog).toContainText("ทล.42");
  await expect(publicDetourDialog).toContainText("ทล.43");
});
