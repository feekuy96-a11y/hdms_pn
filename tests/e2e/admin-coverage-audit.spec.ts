import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const flood = { id: "AUDIT-FLOOD", route_no: "42", section_name: "ช่วงทดสอบ", km_start: "10+000", km_end: "11+000", coordinates_json: [[101.25,6.87],[101.26,6.88]], traffic_status: "WARNING", water_level_cm: 20, is_active: true, updated_at: "2026-11-18T00:00:00.000Z", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26 };
const office = { id: "OFF-AUDIT", name: "หมวดทางหลวงเดิม", type: "SUBDIVISION", address: "ปัตตานี", phone: "1586", lat: 6.87, lon: 101.25, is_active: true };
const init = () => ({ floodRoutes: [flood], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], mapStyles: null, offices: [office], highwayLayers: [],
  systemSettings: { name: "ระบบทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586", desc: "", logoUrl: "" } });

async function setup(page: Page, baseURL?: string) {
  const allowed = new URL(baseURL ?? "");
  const data = init();
  let deleted = [{ id: "RESTORE-ME", route_no: "43", section_name: "รายการลบจำลอง" }];
  const calls: { action: string; args: unknown[] }[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action, args = [] } = request.postDataJSON() as { action: string; args?: unknown[] };
      calls.push({ action, args });
      if (action === "getDeletedRoutesAction") return route.fulfill({ json: deleted });
      if (action === "restoreRouteAction") {
        deleted = [];
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      if (action === "updateSystemSettingsAction") {
        data.systemSettings = { ...data.systemSettings, ...(args[0] as typeof data.systemSettings) };
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      if (action === "saveOfficeAction") {
        const record = args[0] as typeof office;
        data.offices = [...data.offices.filter((item) => item.id !== record.id), record];
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      if (action === "deleteOfficeAction") {
        data.offices = data.offices.filter((item) => item.id !== args[0]);
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      return route.fulfill({ json: data });
    }
    if (url.origin === allowed.origin && ["localhost", "127.0.0.1"].includes(allowed.hostname)) return route.continue();
    return route.abort();
  });
  await page.goto(`${base}/admin/`);
  return calls;
}

test("audit: actual filtered CSV and deleted incident restoration", async ({ page, baseURL }) => {
  const calls = await setup(page, baseURL);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("combobox", { name: "รูปแบบส่งออกเหตุการณ์" }).selectOption("csv"),
  ]);
  expect(download.suggestedFilename()).toMatch(/incidents.*\.csv$/);
  expect(await readFile((await download.path())!, "utf8")).toContain('AUDIT-FLOOD,42,"ช่วงทดสอบ",10+000,11+000');
  await page.getByRole("button", { name: "รายการที่ลบ / กู้คืน" }).click();
  await expect(page.getByText("ทล.43 รายการลบจำลอง")).toBeVisible();
  await page.getByRole("button", { name: "กู้คืน", exact: true }).click();
  await expect(page.getByText("ไม่มีรายการที่ลบ")).toBeVisible();
  expect(calls.filter((call) => call.action === "restoreRouteAction").map((call) => call.args)).toEqual([["FLOOD", "RESTORE-ME"]]);
});

test("office subdivision badge remains readable in both system themes", async ({ page, isMobile, baseURL }) => {
  await setup(page, baseURL);
  if (isMobile) await page.getByRole("navigation", { name: "เมนูจัดการแอดมินมือถือ" }).locator("summary").click();
  await page.getByRole("button", { name: "จัดการระบบ", exact: true }).filter({ visible: true }).first().click();
  const badge = page.getByText("หมวดทางหลวง", { exact: true }).filter({ visible: true });
  for (const [colorScheme, color, background] of [
    ["light", "rgb(20, 89, 116)", "rgb(226, 238, 244)"],
    ["dark", "rgb(175, 215, 242)", "rgb(35, 62, 85)"],
  ] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(badge).toHaveCSS("color", color);
    await expect(badge).toHaveCSS("background-color", background);
  }
});

test("audit: system metadata and office saves persist and removal remains confirmed", async ({ page, isMobile, baseURL }) => {
  const calls = await setup(page, baseURL);
  const gotoSystem = async () => {
    if (isMobile) await page.getByRole("navigation", { name: "เมนูจัดการแอดมินมือถือ" }).locator("summary").click();
    await page.getByRole("button", { name: "จัดการระบบ", exact: true }).filter({ visible: true }).first().click();
  };
  await gotoSystem();
  await page.locator("#sys-name-input").fill("ระบบทดสอบที่บันทึกแล้ว");
  await page.getByRole("button", { name: "บันทึกข้อมูลระบบ" }).click();
  await expect(page.getByRole("dialog", { name: "บันทึกข้อมูลระบบเรียบร้อย" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "เพิ่มสำนักงาน" }).click();
  await page.locator("#office-name-input").fill("หมวดทางหลวงเพิ่มใหม่");
  await page.locator("#office-address-input").fill("ปัตตานี สายทดสอบ");
  await page.locator("#office-type-select").selectOption("SUBDIVISION");
  await page.locator("#office-coord-input").fill("6.871, 101.253");
  await page.getByRole("button", { name: "บันทึกหมุดสำนักงาน" }).click();
  await expect(page.getByRole("dialog", { name: "บันทึกสำนักงานสำเร็จ" })).toBeVisible();
  const created = calls.find(({ action }) => action === "saveOfficeAction")?.args[0] as typeof office;
  expect(created).toEqual(expect.objectContaining({ name: "หมวดทางหลวงเพิ่มใหม่", address: "ปัตตานี สายทดสอบ", type: "SUBDIVISION", lat: 6.871, lon: 101.253, is_active: true }));
  await page.keyboard.press("Escape");
  await page.reload();
  await gotoSystem();
  await expect(page.locator("#sys-name-input")).toHaveValue("ระบบทดสอบที่บันทึกแล้ว");
  await page.getByRole("button", { name: "แก้ไขสำนักงาน หมวดทางหลวงเพิ่มใหม่" }).click();
  await expect(page.locator("#office-address-input")).toHaveValue("ปัตตานี สายทดสอบ");
  await page.locator("#office-address-input").fill("ที่อยู่ที่แก้ไขแล้ว");
  await page.getByRole("button", { name: "บันทึกหมุดสำนักงาน" }).click();
  await expect(page.getByRole("dialog", { name: "บันทึกสำนักงานสำเร็จ" })).toBeVisible();
  expect(calls.filter(({ action }) => action === "saveOfficeAction")[1]?.args[0]).toEqual(expect.objectContaining({ id: created.id, address: "ที่อยู่ที่แก้ไขแล้ว" }));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ลบสำนักงาน หมวดทางหลวงเพิ่มใหม่" }).click();
  const confirm = page.getByRole("dialog", { name: "ยืนยันการลบจุดสำนักงาน?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "ตกลง" }).click();
  await expect(page.getByRole("dialog", { name: "ลบจุดสำนักงานเรียบร้อย" })).toBeVisible();
  expect(calls.filter(({ action }) => action === "deleteOfficeAction").map(({ args }) => args)).toEqual([[created.id]]);
  await page.keyboard.press("Escape");
  await page.reload();
  await gotoSystem();
  await expect(page.getByRole("heading", { name: "หมวดทางหลวงเพิ่มใหม่" })).toHaveCount(0);
});

test("audit: split segments and merge them back without changing the event identity", async ({ page, baseURL }) => {
  const allowed = new URL(baseURL ?? "");
  const eventId = "EV-AUDIT";
  const first = { ...flood, direction_meta: { eventId, eventTitle: "เหตุการณ์ทดสอบแบ่งรวม", directionCode: "A_TO_B" }, road_side: "LEFT" };
  const data = { ...init(), floodRoutes: [first] };
  type Upsert = { id?: string; kmStart: string; kmEnd: string; coordinates: typeof flood.coordinates_json; waterLevelCm: number; trafficStatus: string; isActive: boolean; directionMeta: typeof first.direction_meta & { splitFromSegmentId?: string } };
  const upserts: Upsert[] = [];
  const statusChanges: unknown[][] = [];
  const timeline: unknown[] = [];
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action, args = [] } = request.postDataJSON() as { action: string; args?: unknown[] };
      if (action === "upsertRouteAction") {
        const params = args[0] as Upsert;
        upserts.push(params);
        const id = params.id || "AUDIT-SPLIT-NEW";
        const next = { ...first, id, coordinates_json: params.coordinates, km_start: params.kmStart, km_end: params.kmEnd,
          water_level_cm: params.waterLevelCm, traffic_status: params.trafficStatus, is_active: params.isActive, direction_meta: params.directionMeta };
        data.floodRoutes = [...data.floodRoutes.filter((item) => item.id !== id), next];
        return route.fulfill({ json: { success: true, savedId: id, systemData: data } });
      }
      if (action === "setIncidentStatusAction") {
        statusChanges.push(args);
        data.floodRoutes = data.floodRoutes.map((item) => item.id === args[0] ? { ...item, is_active: Boolean(args[1]) } : item);
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      if (action === "saveTimelineUpdateAction") {
        timeline.push(args[0]);
        return route.fulfill({ json: { success: true, systemData: data } });
      }
      return route.fulfill({ json: data });
    }
    return url.origin === allowed.origin && ["localhost", "127.0.0.1"].includes(allowed.hostname) ? route.continue() : route.abort();
  });
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด.*เหตุการณ์ทดสอบแบ่งรวม/ }).click();
  const original = page.locator(".doh-incident-segment").filter({ hasText: /กม\.10\+000/ });
  await original.getByRole("button", { name: "แบ่งช่วง", exact: true }).click();
  const split = page.getByRole("dialog", { name: "แบ่งช่วงกิโลเมตรน้ำท่วม" });
  await split.locator("#split-km-input").fill("10+500");
  await split.getByRole("button", { name: "ยืนยันการแบ่งช่วง" }).click();
  await expect(page.getByRole("dialog", { name: "แบ่งช่วงสำเร็จ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".doh-incident-header")).toHaveCount(1);
  await expect(page.locator(".doh-incident-segment")).toHaveCount(2);
  expect(upserts[0]).toEqual(expect.objectContaining({ id: flood.id, kmStart: "10+000", kmEnd: "10+500", directionMeta: expect.objectContaining({ eventId }) }));
  expect(upserts[1]).toEqual(expect.objectContaining({ kmStart: "10+500", kmEnd: "11+000", directionMeta: expect.objectContaining({ eventId, splitFromSegmentId: flood.id }) }));
  expect(upserts[1].id).toBeUndefined();
  expect(upserts[0].coordinates.at(-1)).toEqual(upserts[1].coordinates[0]);

  await original.getByRole("button", { name: "รวมช่วง", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "รวมช่วงกิโลเมตรน้ำท่วม" });
  await merge.getByRole("button", { name: /10\+500.*11\+000/ }).click();
  await merge.getByRole("button", { name: "ยืนยันการรวมช่วง" }).click();
  await expect(page.getByRole("dialog", { name: "รวมช่วงสำเร็จ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".doh-incident-header")).toHaveCount(1);
  await expect(page.locator(".doh-incident-segment")).toHaveCount(1);
  await expect(original).toContainText("กม.11+000");
  expect(upserts[2]).toEqual(expect.objectContaining({ id: flood.id, kmStart: "10+000", kmEnd: "11+000", directionMeta: expect.objectContaining({ eventId }) }));
  expect(statusChanges).toEqual([["AUDIT-SPLIT-NEW", false]]);
  expect(timeline).toEqual([expect.objectContaining({ floodId: flood.id })]);
});
