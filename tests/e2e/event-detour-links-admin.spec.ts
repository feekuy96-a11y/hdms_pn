import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

interface MockLink {
  eventId: string;
  detourId: string;
  eventDirection: "A_TO_B" | "B_TO_A" | "BOTH" | "UNKNOWN";
  detourDirection: "FORWARD" | "REVERSE" | "TWO_WAY" | "UNKNOWN";
  position: number;
  eventPosition?: number;
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

  await dialog.getByLabel("ทิศทางเหตุการณ์ของ ทางเลี่ยงสาย 4092").selectOption("A_TO_B");
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
    eventDirection: "A_TO_B",
    detourDirection: "FORWARD",
    position: 1,
    eventPosition: 1,
    recommendation: "WITHDRAWN",
  });
  expect(lastSavedPayload!.links[1]).toMatchObject({
    detourId: "D-1",
    eventDirection: "BOTH",
    detourDirection: "TWO_WAY",
    position: 1,
    eventPosition: 2,
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

    if (action === "getSystemDataAction" || action === "getPublicSystemDataAction") {
      const eventDetourLinks = Object.values(store).flatMap((entry) => entry.links).reverse();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createSystemData({ eventDetourLinks })) });
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
    eventPosition: 1,
  });
  expect(store["EV-F-2"].version).toBe(3);
  expect(store["EV-F-2"].links.map((l) => [l.detourId, l.eventPosition])).toEqual([["D-2", 1], ["D-1", 2]]);

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

  await page.goto(`${base}/`);
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  }
  const card = page.locator("article").filter({ hasText: "หนองจิก" }).filter({ visible: true }).first();
  await card.getByRole("button", { name: /ดูรายละเอียด/ }).click();
  const dossier = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(dossier.getByText("ทางเลี่ยงที่ 1 – ทางเลี่ยงสาย 4092")).toBeVisible();
  await expect(dossier.getByText("ทางเลี่ยงที่ 2 – ทางเลี่ยงสาย 418")).toBeVisible();

  await page.reload();
  const marker = page.locator('.leaflet-marker-icon[aria-label^="ทล.43"][aria-label*="ซม."]')
    .or(page.locator('.leaflet-marker-icon[aria-label^="ทล.43"][aria-label*="หนองจิก"]')).first();
  await marker.click();
  await page.locator(".leaflet-popup").getByRole("button", { name: /ทางเลี่ยง 2 สาย/ }).click();
  await expect(dossier.getByText("ทางเลี่ยงที่ 1 – ทางเลี่ยงสาย 4092")).toBeVisible();
  await expect(dossier.getByText("ทางเลี่ยงที่ 2 – ทางเลี่ยงสาย 418")).toBeVisible();
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
  await page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด/ }).first().click();

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

  const dispatchBtn = page.getByTitle("ออกรายงานเสนอผู้ว่าฯ (ด่วนที่สุด)").filter({ visible: true }).first();
  if (await dispatchBtn.isVisible().catch(() => false)) {
    await dispatchBtn.click();
    const reportDialog = page.getByRole("dialog", { name: "แบบรายงานสถานการณ์อุทกภัย" });
    await expect(reportDialog).toBeVisible();
    await expect(reportDialog).toContainText("ทางเลี่ยงสาย 418 / ทางเลี่ยงสาย 4092");
    await expect(reportDialog).not.toContainText("ทางเลี่ยงสายสำรอง 2003");
    await page.keyboard.press("Escape");
  }

  // 2. Citizen Public Portal
  await page.goto(`${base}/`);
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
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
    const openSheetBtn = page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true });
    if (await openSheetBtn.isVisible().catch(() => false)) {
      await openSheetBtn.click();
    }
  }
  await page.locator(".citizen-section-tabs").filter({ visible: true }).getByRole("button", { name: /^ทางเลี่ยง/ }).click();
  const detourBtn = page.getByRole("button", { name: /ทางเลี่ยงสาย 418/ }).filter({ hasText: "ทล.42, ทล.43", visible: true }).first();
  await expect(detourBtn).toContainText("ทล.42, ทล.43");
  await detourBtn.click();
  const publicDetourDialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(publicDetourDialog).toBeVisible();
  await expect(publicDetourDialog).toContainText("ทล.42");
  await expect(publicDetourDialog).toContainText("ทล.43");
});

test("responsive Admin flood editor and ranked detour dialog retain reachable actions", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(45_000);
  const viewports = isMobile
    ? [{ name: "portrait", width: 390, height: 844 }]
    : [
      { name: "landscape", width: 844, height: 390 },
      { name: "tablet", width: 820, height: 1180 },
      { name: "desktop", width: 1440, height: 900 },
    ];
  const baseLinks: MockLink[] = [
    { eventId: "EV-F-1", detourId: "D-1", eventDirection: "BOTH", detourDirection: "TWO_WAY",
      position: 1, eventPosition: 1, recommendation: "RECOMMENDED", reviewedGeometryVersion: 3 },
    { eventId: "EV-F-1", detourId: "D-2", eventDirection: "BOTH", detourDirection: "FORWARD",
      position: 2, eventPosition: 2, recommendation: "PENDING", reviewedGeometryVersion: null },
  ];
  let links = baseLinks;
  let version = 1;
  let savedRanks: Array<string | undefined> = [];
  const systemData = () => createSystemData({
    eventDetourLinks: links,
    eventSegments: [
      { flood_id: "F-1", event_id: "EV-F-1", event_direction: "BOTH", segment_position: 1 },
      { flood_id: "F-2", event_id: "EV-F-2", event_direction: "B_TO_A", segment_position: 1 },
    ],
    floodEvents: [{ id: "EV-F-1", link_version: version }, { id: "EV-F-2", link_version: 0 }],
  });
  await page.route("**/functions/v1/hdms-api*", async (route) => {
    const body = route.request().postDataJSON() as { action?: string; args?: unknown[] };
    if (body.action === "getEventDetourLinksAction") {
      return route.fulfill({ json: { eventId: body.args?.[0], version, links } });
    }
    if (body.action === "replaceEventDetourLinksAction") {
      const payload = body.args?.[0] as { eventId: string; expectedVersion: number; links: MockLink[] };
      expect(payload.expectedVersion).toBe(version);
      links = payload.links;
      savedRanks = links.map((link) => link.detourId);
      version += 1;
      return route.fulfill({ json: { eventId: payload.eventId, version, links } });
    }
    return route.fulfill({ json: systemData() });
  });

  await page.emulateMedia({ colorScheme: "light" });
  for (const view of viewports) {
    links = baseLinks;
    version = 1;
    savedRanks = [];
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.goto(`${base}/admin/`);
    const workspace = page.locator("[data-admin-theme]");
    const themeChooser = page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ" });
    const chooseTheme = async (mode: "system" | "light" | "dark") => {
      await themeChooser.click();
      await page.getByRole("group", { name: "เลือกธีมพื้นที่จัดการ" })
        .getByRole("button", { name: { system: "ตามอุปกรณ์", light: "ธีมสว่าง", dark: "ธีมมืด" }[mode], exact: true }).click();
      await expect(themeChooser).toBeFocused();
      await expect(themeChooser).toHaveAttribute("aria-expanded", "false");
    };
    await themeChooser.focus();
    await page.keyboard.press("Enter");
    await expect(themeChooser).toHaveAttribute("aria-expanded", "true");
    if (view.name === "portrait" || view.name === "desktop") {
      await page.screenshot({ path: testInfo.outputPath(`admin-theme-choices-${view.name}.png`), animations: "disabled" });
    }
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "ตามอุปกรณ์", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(themeChooser).toBeFocused();
    await expect(themeChooser).toHaveAttribute("aria-expanded", "false");
    await expect(workspace).toHaveAttribute("data-admin-theme", "system");
    const editorHeading = page.getByRole("heading", { name: "รายงานสถานการณ์น้ำท่วม" });
    await expect(editorHeading).toHaveCSS("color", "rgb(23, 53, 74)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(editorHeading).toHaveCSS("color", "rgb(244, 248, 250)");
    await page.emulateMedia({ colorScheme: "light" });
    await chooseTheme("dark");
    await page.reload();
    await expect(workspace).toHaveAttribute("data-admin-theme", "dark");
    await expect(editorHeading).toHaveCSS("color", "rgb(244, 248, 250)");
    await chooseTheme("light");
    await expect(editorHeading).toHaveCSS("color", "rgb(23, 53, 74)");
    await page.screenshot({ path: testInfo.outputPath(`admin-initial-${view.name}.png`), animations: "disabled" });
    const incidents = page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first();
    if (view.width < 1024) {
      const mobileNav = page.getByRole("navigation", { name: "เมนูจัดการแอดมินมือถือ" });
      const daily = mobileNav.getByRole("group", { name: "งานภาคสนาม" });
      await expect(daily.getByRole("button")).toHaveCount(3);
      await expect(daily.getByRole("button").nth(0)).toHaveAccessibleName("รายการเหตุการณ์");
      await expect(daily.getByRole("button").nth(1)).toHaveAttribute("aria-current", "page");
      await expect(daily.getByRole("button").nth(2)).toHaveAccessibleName("รายการทางเลี่ยง");
      const tools = mobileNav.locator("summary");
      const highwayWorkspace = mobileNav.getByRole("button", { name: "โครงข่ายสายทาง" });
      await expect(highwayWorkspace).toBeHidden();
      await tools.focus();
      await page.keyboard.press("Enter");
      await expect(highwayWorkspace).toBeVisible();
      if (view.name === "portrait" || view.name === "tablet") {
        await page.screenshot({ path: testInfo.outputPath(`admin-tools-${view.name}.png`), animations: "disabled" });
      }
      await highwayWorkspace.focus();
      await page.keyboard.press("Escape");
      await expect(highwayWorkspace).toBeHidden();
      await expect(tools).toBeFocused();
    }
    await incidents.click();
    const launch = page.getByRole("button", { name: /จัดการทางเลี่ยงเชื่อมโยง ทล\.42 ตอนคลองแงะ/ });
    await launch.click();
    const dialog = page.getByRole("dialog", { name: "จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง" });
    const body = dialog.getByRole("region", { name: "รายละเอียดการเชื่อมโยง" });
    const save = dialog.getByRole("button", { name: "บันทึกความสัมพันธ์", exact: true });
    const move = dialog.getByRole("button", { name: "เลื่อนลำดับ ทางเลี่ยงสาย 4092 ขึ้น", exact: true });
    await expect(move).toBeEnabled();
    await move.click();
    await expect(dialog.getByText("อันดับ 1", { exact: true })).toBeVisible();
    await expect(save).toBeInViewport();
    await expect(save).toBeEnabled();
    const [bodyBox, saveBox] = await Promise.all([body.boundingBox(), save.boundingBox()]);
    expect(bodyBox!.height).toBeGreaterThan(120);
    expect(saveBox!.height).toBeGreaterThanOrEqual(44);
    expect(saveBox!.y).toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height - 1);
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(view.height);
    await dialog.getByText("อันดับ 1", { exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const remove = dialog.getByTitle("นำออกจากเหตุการณ์").first();
    await expect(remove).toHaveCSS("background-color", "rgb(249, 229, 230)");
    await expect(remove).toHaveCSS("color", "rgb(150, 43, 53)");
    await page.screenshot({ path: testInfo.outputPath(`admin-rank-${view.name}.png`), animations: "disabled" });

    await save.click();
    await expect(dialog.getByText(/ยืนยันข้อมูลจากฐานข้อมูลแล้ว/)).toBeVisible();
    expect(savedRanks).toEqual(["D-2", "D-1"]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(launch).toBeFocused();
    await expect(page.getByText("บันทึกและโหลดยืนยันความสัมพันธ์จากฐานข้อมูลเรียบร้อย", { exact: true })).toBeHidden();

    if (view.name === "portrait") {
      await chooseTheme("dark");
      await launch.click();
      await expect(dialog).toHaveCSS("background-color", "rgb(26, 45, 62)");
      await dialog.getByText("อันดับ 1", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("admin-rank-dark-portrait.png"), animations: "disabled" });
      await page.keyboard.press("Escape");
      await chooseTheme("light");
    }

    const expand = page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด/ }).first();
    await expand.click();
    const segment = page.locator(".doh-incident-segment").filter({ hasText: "10+000" }).first();
    await segment.getByRole("button", { name: "แก้ไข", exact: true }).click();
    const exitEdit = page.getByRole("button", { name: "ออกจากโหมดแก้ไข" });
    await expect(exitEdit).toBeVisible();
    await expect(page.getByText("เผยแพร่ขึ้นแผนที่ประชาชน", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "แนวเส้นและพิกัด" })).toBeVisible();
    const formNav = page.getByRole("navigation", { name: "ข้ามไปยังส่วนของแบบฟอร์ม" });
    await expect(formNav).toBeVisible();
    const geometry = page.getByRole("region", { name: "แนวเส้นและพิกัด" });
    await expect(geometry.locator('input[type="file"][accept*=".kml"]')).toHaveCount(1);
    await formNav.getByRole("button", { name: "เลือกวิธีบันทึกและเผยแพร่" }).click();
    const publish = page.getByRole("region", { name: "เลือกวิธีบันทึกและเผยแพร่" });
    await expect(publish).toBeFocused();
    const draft = publish.getByRole("checkbox", { name: /บันทึกเป็นฉบับร่าง/ });
    await draft.check();
    await expect(page.getByRole("button", { name: "บันทึกร่างเหตุการณ์" })).toBeVisible();
    await expect(page.getByText("โหมดฉบับร่าง (ยังไม่แสดงประชาชน)", { exact: true })).toBeVisible();
    await draft.uncheck();
    await expect(page.getByRole("button", { name: "บันทึกการแก้ไขเหตุการณ์" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`admin-publish-${view.name}.png`), animations: "disabled" });
    if (view.width < 1024) {
      await formNav.getByRole("button", { name: "ข้อมูลสถานการณ์น้ำท่วม" }).click();
      const situation = page.getByRole("region", { name: "ข้อมูลสถานการณ์น้ำท่วม" });
      await expect(situation).toBeFocused();
      await expect(situation).toBeInViewport();
      await expect(page.getByRole("button", { name: "บันทึกการแก้ไขเหตุการณ์" })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`admin-flood-status-${view.name}.png`), animations: "disabled" });
      if (view.name === "portrait") {
        await page.getByRole("button", { name: "แผนที่ GIS", exact: true }).click();
        await expect(page.getByRole("button", { name: "บันทึกการแก้ไขเหตุการณ์" })).toBeHidden();
        await expect(page.locator(".leaflet-container").first()).toBeVisible();
        await expect(themeChooser).toBeInViewport();
        await page.getByRole("button", { name: "ฟอร์มข้อมูล", exact: true }).click();
        await expect(exitEdit).toBeVisible();
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.width);
    await formNav.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`admin-flood-${view.name}.png`), animations: "disabled" });

    // Change the same browser-local presentation preference without navigating out of this edit.
    await chooseTheme("dark");
    await expect(editorHeading).toHaveCSS("color", "rgb(244, 248, 250)");
    await expect(exitEdit).toBeVisible();
    await formNav.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`admin-flood-dark-${view.name}.png`), animations: "disabled" });
    await chooseTheme("system");

  }
});

test("Admin registries surface location and update time while keeping filters and actions", async ({ page, isMobile }, testInfo) => {
  const systemData = createSystemData();
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: systemData }));
  await page.emulateMedia({ colorScheme: isMobile ? "dark" : "light" });
  await page.goto(`${base}/admin/`);
  const openMenu = (name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first().click();

  await openMenu("รายการเหตุการณ์");
  const incidents = page.getByRole("region", { name: "งานติดตามเหตุการณ์น้ำท่วม" });
  const event = incidents.locator(".doh-incident-header").filter({ hasText: "คลองแงะ" });
  await expect(event.locator("time")).toHaveAttribute("datetime", "2026-11-18T00:00:00.000Z");
  await expect(event.getByText(/10\+000/)).toBeVisible();
  await expect(event.getByRole("button", { name: /จัดการทางเลี่ยงเชื่อมโยง/ })).toBeVisible();
  await expect(event.locator("svg.lucide-waves")).toHaveCount(1);
  await expect(incidents.getByRole("combobox", { name: "กรองตามสถานะจราจร" })).toBeVisible();
  const searchIncidents = incidents.getByRole("textbox", { name: "ค้นหาเหตุการณ์น้ำท่วม" });
  await searchIncidents.fill("ไม่มีเหตุการณ์นี้");
  await expect(event).toHaveCount(0);
  await incidents.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(event).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("incident-registry.png"), animations: "disabled" });

  await openMenu("รายการทางเลี่ยง");
  const detours = page.getByRole("region", { name: "งานจัดการเส้นทางเลี่ยง" });
  await expect(detours.getByRole("button", { name: "วาดทางเลี่ยงใหม่บนแผนที่" })).toBeVisible();
  await expect(detours.getByRole("button", { name: "จัดการความสัมพันธ์ (หลายจุด)" })).toBeVisible();
  await expect(detours.getByRole("combobox", { name: "ขอบเขตส่งออกทางเลี่ยง" })).toBeVisible();
  const detourUpdate = detours.locator("time[datetime='2026-11-18T00:00:00.000Z']").filter({ visible: true }).first();
  await expect(detourUpdate).toBeInViewport();
  const searchDetours = detours.getByRole("textbox", { name: "ค้นหาเส้นทางเลี่ยง" });
  await searchDetours.fill("ไม่มีเส้นทางเลี่ยงนี้");
  await expect(detours.locator("time").filter({ visible: true })).toHaveCount(0);
  await detours.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(detours.locator("time").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("detour-registry.png"), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("existing flood edit cancels cleanly or discards only unsaved changes", async ({ page }) => {
  const writes: string[] = [];
  const systemData = createSystemData();
  const existing = systemData.floodRoutes.find((row) => row.id === "F-1")!;
  Object.assign(existing, { affected_lanes: "ทุกช่องจราจร, ทางขนานซ้าย", affected_shoulder: "RIGHT" });
  const upserts: Array<{ id?: string; isActive?: boolean }> = [];
  await page.route("**/functions/v1/hdms-api*", (route) => {
    const body = route.request().postDataJSON() as { action?: string; args?: [{ id?: string; isActive?: boolean }] };
    if (body.action && /upsert|delete|save|replace/i.test(body.action)) writes.push(body.action);
    if (body.action === "upsertRouteAction") {
      if (body.args?.[0]) upserts.push(body.args[0]);
      return route.fulfill({ json: { success: true, savedId: "F-1", systemData } });
    }
    return route.fulfill({ json: systemData });
  });
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด.*คลองแงะ/ }).click();
  const row = page.locator(".doh-incident-segment").filter({ hasText: "10+000" });
  const selected = row.getByRole("checkbox");
  await selected.check();
  const edit = row.getByRole("button", { name: "แก้ไข", exact: true });
  const cancelEdit = page.getByRole("button", { name: "ออกจากโหมดแก้ไข", exact: true });
  const confirm = page.getByRole("dialog", { name: "ออกจากการแก้ไขโดยไม่บันทึก?" });
  await edit.click();
  await expect(cancelEdit).toBeVisible();
  await page.evaluate(() => localStorage.setItem("hdms_admin_map_draft_v1", "unrelated-local-draft"));
  await cancelEdit.click();
  await expect(confirm).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(selected).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("hdms_admin_map_draft_v1"))).toBe("unrelated-local-draft");

  await edit.click();
  const landmark = page.getByRole("textbox", { name: /จุดสังเกตหน้างาน/ });
  const savedLandmark = await landmark.inputValue();
  await landmark.fill("จุดชั่วคราวที่ยังไม่ได้บันทึก");
  await cancelEdit.click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "แก้ไขต่อ", exact: true }).click();
  await expect(landmark).toHaveValue("จุดชั่วคราวที่ยังไม่ได้บันทึก");
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  await confirm.getByRole("button", { name: "ละทิ้งการเปลี่ยนแปลง" }).click();
  await expect(edit).toBeFocused();
  await expect(selected).toBeChecked();
  expect(writes).toEqual([]);
  await edit.click();
  await expect(landmark).toHaveValue(savedLandmark);
  const impact = page.getByRole("group", { name: "ส่วนที่ได้รับผลกระทบ ทั้งสองฝั่ง" });
  await expect(impact.getByRole("button", { name: "ทางขนานซ้าย", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(impact.getByRole("button", { name: "ไหล่ทางขวา", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(impact.getByRole("button", { name: "ทุกช่องจราจร", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("checkbox", { name: /บันทึกเป็นฉบับร่าง/ }).check();
  await page.getByRole("button", { name: "บันทึกร่างเหตุการณ์", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "บันทึกร่างสำเร็จ" })).toBeVisible();
  expect(upserts).toEqual([expect.objectContaining({ id: "F-1", isActive: false, directionMeta: expect.objectContaining({ affectedParts: ["ALL_LANES", "LEFT_FRONTAGE", "RIGHT_SHOULDER"] }) })]);
});

test("incident subdivision filter combines verified office, road and traffic status", async ({ page }) => {
  const systemData = createSystemData();
  const officeName = "หมวดทางหลวงทดสอบ";
  const offices = [{ id: "HQ-TEST", name: "แขวงทดสอบ", type: "HEADQUARTERS" }, { id: "OFFICE-TEST", name: officeName, type: "SUBDIVISION" }];
  const [first, second] = systemData.floodRoutes;
  const floodRoutes = [
    { ...first, direction_meta: { ...first.direction_meta, subdivisionName: officeName }, reporter_name: "ผู้รายงานบุคคล" },
    { ...second, reporter_name: "นายช่างภาคสนาม" },
    { ...second, id: "F-3", route_no: "44", section_name: "ทดสอบชื่อเดิม", reporter_name: officeName,
      direction_meta: { ...second.direction_meta, eventId: "EV-F-3", eventTitle: "ทดสอบชื่อเดิม" } },
  ];
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: { ...systemData, offices, floodRoutes } }));
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  const area = page.getByRole("combobox", { name: "กรองตามหมวดทางหลวง" });
  const road = page.getByRole("combobox", { name: "กรองตามสายทางหลวง" });
  const traffic = page.getByRole("combobox", { name: "กรองตามสถานะจราจร" });
  const rows = page.locator(".doh-incident-header");
  await expect(area).toHaveValue("ALL");
  await expect(rows).toHaveCount(3);
  await area.selectOption(`office:${officeName}`);
  await expect(rows).toHaveCount(2);
  await road.selectOption("42");
  await expect(rows).toHaveCount(1);
  await traffic.selectOption("WARNING");
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(area).toHaveValue("ALL");
  await expect(road).toHaveValue("ALL");
  await expect(traffic).toHaveValue("ALL");
  await area.selectOption("UNASSIGNED");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("หนองจิก");
});

test("Admin theme and ranked dialog motion supports fast reopen, focus and reduced motion", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api*", (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON()?.action === "getEventDetourLinksAction") {
      return route.fulfill({ json: { eventId: "EV-F-1", version: 1, links: [] } });
    }
    return route.fulfill({ json: createSystemData() });
  });
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${base}/admin/`);
    const theme = page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ" });
    const choices = page.locator("#admin-theme-choices");
    const duration = reducedMotion === "reduce" ? "0s" : "0.15s, 0.15s";
    await theme.focus();
    await page.keyboard.press("Enter");
    await expect(choices).toHaveCSS("transition-duration", duration);
    await page.keyboard.press("Escape");
    await expect(theme).toHaveAttribute("aria-expanded", "false");
    await expect(choices).toHaveAttribute("inert", "");
    await page.keyboard.press("Enter");
    await expect(choices).toHaveAttribute("data-motion-open", "true");
    await page.keyboard.press("Escape");
    await expect(choices).toBeHidden();
    await expect(theme).toBeFocused();

    await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
    const launch = page.getByRole("button", { name: /จัดการทางเลี่ยงเชื่อมโยง.*คลองแงะ/ });
    const ranked = page.getByRole("dialog", { name: "จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง" });
    await launch.click();
    await expect(ranked).toBeVisible();
    await expect(ranked).toHaveCSS("transition-duration", duration);
    await ranked.getByRole("button", { name: "ปิดหน้าต่างจัดการความสัมพันธ์" }).focus();
    await page.keyboard.press("Escape");
    await expect(launch).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(ranked).toBeVisible();
    await ranked.getByRole("button", { name: "ปิดหน้าต่างจัดการความสัมพันธ์" }).focus();
    await page.keyboard.press("Escape");
    await expect(ranked).toHaveCount(0);
    await expect(launch).toBeFocused();
  }
});
