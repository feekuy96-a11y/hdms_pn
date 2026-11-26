import { expect, test } from "@playwright/test";

test("flood photo is staged before save and only cleaned up if its record save fails", async ({ page, baseURL }) => {
  const local = new URL(baseURL ?? "");
  const base = process.env.BASE_PATH || "";
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4YQAAAAASUVORK5CYII=", "base64");
  const stagedUrl = "https://example.invalid/storage/v1/object/public/hdms-media-staging/QA.webp";
  const flood = { id: "MEDIA-FLOOD", route_no: "42", section_name: "จุดทดสอบเก็บภาพ", km_start: "10+000", km_end: "11+000", coordinates_json: [[101.25,6.87],[101.26,6.88]], traffic_status: "WARNING", water_level_cm: 20, is_active: true, updated_at: "2026-11-18T00:00:00.000Z", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26,
    road_side: "LEFT", direction_meta: { eventId: "MEDIA-EVENT", eventTitle: "เหตุการณ์ทดสอบภาพ", directionCode: "A_TO_B" } };
  const data = { floodRoutes: [flood], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], mapStyles: null, offices: [], highwayLayers: [],
    systemSettings: { name: "ระบบทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586" } };
  let fail = true;
  const calls: { action: string; args: unknown[] }[] = [];
  const tracked = ["uploadExternalMediaAction", "upsertRouteAction", "deleteExternalMediaAction", "syncReportingRowAction"];
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action, args = [] } = request.postDataJSON() as { action: string; args?: unknown[] };
      if (tracked.includes(action)) calls.push({ action, args });
      if (action === "uploadExternalMediaAction") return route.fulfill({ json: { mediaId: "QA-image", url: stagedUrl, mimeType: "image/webp", sizeBytes: 88 } });
      if (action === "upsertRouteAction") return fail
        ? route.fulfill({ status: 500, json: { error: "การทดสอบจำลองการบันทึกล้มเหลว" } })
        : route.fulfill({ json: { success: true, savedId: flood.id, systemData: data } });
      if (action === "deleteExternalMediaAction") return route.fulfill({ json: { success: true } });
      if (action === "syncReportingRowAction") return route.fulfill({ json: { success: true, queued: true } });
      return route.fulfill({ json: data });
    }
    return url.origin === local.origin && ["localhost", "127.0.0.1"].includes(local.hostname) ? route.continue() : route.abort();
  });
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด.*เหตุการณ์ทดสอบภาพ/ }).click();
  await page.locator(".doh-incident-segment").getByRole("button", { name: "แก้ไข", exact: true }).click();
  await page.locator('input[type=file][aria-label="เลือกรูปภาพหน้างาน"]').setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: image });
  await expect(page.getByRole("button", { name: "ลบรูปภาพที่ 1" })).toBeVisible();
  expect(calls).toHaveLength(0);
  const save = page.getByRole("button", { name: "บันทึกการแก้ไขเหตุการณ์", exact: true });
  await save.click();
  const error = page.getByRole("dialog", { name: "เกิดข้อผิดพลาดในการบันทึก" });
  await expect(error).toBeVisible();
  expect(calls.map(({ action }) => action)).toEqual(["uploadExternalMediaAction", "upsertRouteAction", "deleteExternalMediaAction"]);
  expect(calls[0].args[0]).toEqual(expect.objectContaining({ ownerType: "FLOOD", ownerId: flood.id, dataUrl: expect.stringMatching(/^data:image\//) }));
  expect(calls[1].args[0]).toEqual(expect.objectContaining({ id: flood.id, latestPhotoUrl: stagedUrl,
    directionMeta: expect.objectContaining({ photos: [expect.objectContaining({ dataUrl: stagedUrl })] }) }));
  expect(calls[2].args).toEqual([{ mediaId: "QA-image" }]);
  await error.getByRole("button", { name: "ตกลง" }).click();
  await expect(page.getByRole("button", { name: "ลบรูปภาพที่ 1" })).toBeVisible();
  calls.length = 0;
  fail = false;
  await save.click();
  await expect(page.getByRole("dialog", { name: "แก้ไขข้อมูลสำเร็จ" })).toBeVisible();
  expect(calls.map(({ action }) => action)).toEqual(["uploadExternalMediaAction", "upsertRouteAction", "syncReportingRowAction"]);
  expect(calls[1].args[0]).toEqual(expect.objectContaining({ id: flood.id, isActive: true, latestPhotoUrl: stagedUrl,
    directionMeta: expect.objectContaining({ photos: [expect.objectContaining({ dataUrl: stagedUrl })] }) }));
  expect(calls[2].args[0]).toEqual(expect.objectContaining({ recordId: flood.id, recordType: "FLOOD" }));
});
