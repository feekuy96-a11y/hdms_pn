import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

const publicPayload = {
  updatedAt: "2026-11-17T08:00:00.000Z",
  floodRoutes: [{
    id: "F-PUBLIC-ONLY",
    route_no: "42",
    section_name: "จุดทดสอบข้อมูลสาธารณะ",
    km_start: "0+000",
    km_end: "0+100",
    lat_start: 6.87,
    lon_start: 101.25,
    lat_end: 6.871,
    lon_end: 101.251,
    coordinates_json: [[101.25, 6.87], [101.251, 6.871]],
    water_level_cm: 10,
    traffic_status: "WARNING",
    latest_photo_url: "",
    is_active: true,
    updated_at: "2026-11-17T08:00:00.000Z",
    district: "เมืองปัตตานี",
    subdistrict: "สะบารัง",
    detour_advice: "โปรดใช้ความระมัดระวัง",
  }],
  detourRoutes: [],
  timelineUpdates: [],
  mitigationProjects: [],
  highwayLayers: [],
  offices: [],
  mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", desc: "", phone: "1586" },
};

test("public read fallback calls only the sanitized RPC when Edge is unavailable", async ({ page }) => {
  const rpcPaths: string[] = [];

  await page.route("**/functions/v1/hdms-api", async (route) => route.abort("failed"));
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    rpcPaths.push(path);
    if (path.endsWith("/doh_get_public_system_data_display_rpc")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicPayload) });
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "unexpected RPC" }) });
  });

  await page.goto(`${base}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ทางหลวง");
  await expect.poll(() => rpcPaths).toContain("/rest/v1/rpc/doh_get_public_system_data_display_rpc");
  expect(rpcPaths).not.toContain("/rest/v1/rpc/doh_get_system_data_display_rpc");
  expect(rpcPaths).not.toContain("/rest/v1/rpc/doh_get_system_data_rpc");
});

test("an old Edge response does not retry the full Admin action", async ({ page }) => {
  const actions: string[] = [];
  const rpcPaths: string[] = [];

  await page.route("**/functions/v1/hdms-api", async (route) => {
    const payload = route.request().postDataJSON() as { action?: string };
    actions.push(payload.action || "");
    if (payload.action === "getPublicSystemDataAction") {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Unknown operation" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ...publicPayload,
      floodRoutes: [{ ...publicPayload.floodRoutes[0], id: "F-DRAFT-SHOULD-NEVER-LOAD", is_active: false }],
    }) });
  });
  await page.route("**/rest/v1/rpc/**", async (route) => {
    rpcPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "unexpected RPC" }) });
  });

  await page.goto(`${base}/`);
  await expect(page.getByText("ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง", { exact: true })).toBeVisible();
  // TanStack Query retries a recoverable read, but every retry must preserve
  // the public action instead of switching to getSystemDataAction().
  expect(actions.length).toBeGreaterThan(0);
  expect(actions.every((action) => action === "getPublicSystemDataAction")).toBe(true);
  expect(rpcPaths).toEqual([]);
  await expect(page.getByText("F-DRAFT-SHOULD-NEVER-LOAD", { exact: true })).toHaveCount(0);
});
