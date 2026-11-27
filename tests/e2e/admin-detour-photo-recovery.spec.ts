import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const stamp = "2026-11-27T00:00:00.000Z";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVQImWNgAAIAAAUAAarVyFEAAAAASUVORK5CYII=", "base64");
const panare = [101.489036, 6.852032], mayo = [101.4195, 6.7181];
const title = "ทางเลี่ยงทดสอบแสดงภาพ";
const makeRoute = (url: string, end: string) => ({
  id: "D-TEST-PHOTO", route_name: title, is_active: true, direction_mode: "FORWARD_ONLY", description: "",
  lat_start: panare[1], lon_start: panare[0], lat_end: mayo[1], lon_end: mayo[0], coordinates_json: [panare, mayo], updated_at: stamp,
  detour_meta: {
    start_point_photo: { url, lat: panare[1], lon: panare[0], caption: "ภาพหน้าซุ้มประตู" },
    end_point_photo: { url: end, lat: mayo[1], lon: mayo[0], caption: "ภาพปลายทาง" },
  },
});

test("save a replacement, recover a relocated photo after reload, and retry a missing A/B image without another upload", async ({ page, baseURL, isMobile }) => {
  const origin = new URL(baseURL!).origin;
  const mediaOrigin = "https://test-media.example.test";
  const staging = mediaOrigin + "/test-media/staged-A.png", durable = mediaOrigin + "/test-media/loaded-A.png", end = mediaOrigin + "/test-media/B.png";
  let routeRow = makeRoute(mediaOrigin + "/test-media/initial-A.png", end);
  let promote = false, bReady = false, stagingRequested = false;
  const writes: string[] = [], requests: string[] = [];
  const snapshot = () => ({ updatedAt: stamp, floodRoutes: [], detourRoutes: [routeRow], timelineUpdates: [], mitigationProjects: [],
    highwayLayers: [], offices: [], mapStyles: null, systemSettings: { name: "ทดสอบ", org: "ทดสอบ" } });

  await page.route("**/*", async (r) => {
    const req = r.request(), url = new URL(req.url());
    if (url.origin === mediaOrigin && url.pathname.startsWith("/test-media/")) {
      requests.push(url.pathname);
      if (url.pathname.endsWith("staged-A.png")) stagingRequested = true;
      const ok = url.pathname.endsWith("initial-A.png") || url.pathname.endsWith("loaded-A.png") || (url.pathname.endsWith("/B.png") && bReady);
      return ok ? r.fulfill({ status: 200, contentType: "image/png", body: image, headers: { "Cache-Control": "no-store" } })
        : r.fulfill({ status: 404, body: "not found", headers: { "Cache-Control": "no-store" } });
    }
    if (!url.pathname.endsWith("/functions/v1/hdms-api")) return url.origin === origin ? r.continue() : r.abort();
    const { action, args = [] } = req.postDataJSON();
    if (action === "uploadExternalMediaAction") {
      writes.push(action);
      return r.fulfill({ json: { mediaId: "fixture-stage", url: staging, mimeType: "image/png", sizeBytes: image.length } });
    }
    if (action === "upsertRouteAction") {
      writes.push(action);
      routeRow = { ...routeRow, detour_meta: args[0].detourMeta };
      return r.fulfill({ json: { success: true, systemData: snapshot() } });
    }
    if (action === "getAdminOperationalDataAction" && promote && stagingRequested) {
      routeRow = makeRoute(durable, end);
      return r.fulfill({ json: snapshot() });
    }
    if (String(action).startsWith("get")) return r.fulfill({ json: snapshot() });
    return r.abort();
  });

  const openEditor = async () => {
    await page.goto(base + "/admin/");
    const list = page.getByRole("button", { name: "รายการทางเลี่ยง", exact: true });
    if (isMobile && !await list.isVisible()) await page.getByRole("button", { name: "เมนู", exact: true }).click();
    await list.click();
    await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: /จุด A/ })).toBeVisible();
  };
  await openEditor();
  const photoA = page.getByRole("img", { name: "ภาพทางเข้าจุดเริ่มต้น A" });
  await expect.poll(() => photoA.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const chosen = page.getByLabel("แนบภาพจุดเริ่มต้น A", { exact: true });
  await chosen.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: image });
  await expect(photoA).toHaveAttribute("src", /^data:image\//);
  await page.getByRole("button", { name: /บันทึกการแก้ไข|บันทึกข้อมูล/ }).last().click();
  await expect(page.getByRole("dialog", { name: "บันทึกข้อมูลเส้นทางเลี่ยงสำเร็จ" })).toBeVisible();
  expect(writes).toEqual(["uploadExternalMediaAction", "upsertRouteAction"]);
  expect(routeRow.detour_meta.start_point_photo.url).toBe(staging);

  promote = true;
  await openEditor();
  await expect(photoA).toHaveAttribute("src", durable);
  await expect.poll(() => photoA.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(requests).toContain("/test-media/staged-A.png");
  await expect(page.getByLabel("คำอธิบายภาพจุดเริ่มต้น A")).toHaveValue("ภาพหน้าซุ้มประตู");
  await page.getByRole("tab", { name: /จุด B/ }).click();
  await expect(page.getByText(/โหลดรูปไม่สำเร็จ/)).toBeVisible();
  await expect(page.getByLabel("คำอธิบายภาพจุดสิ้นสุด B")).toHaveValue("ภาพปลายทาง");
  await expect(page.getByRole("img", { name: "ภาพทางเข้าจุดสิ้นสุด B" })).toHaveCount(0);
  bReady = true;
  await page.getByRole("button", { name: "ลองโหลดรูปอีกครั้ง", exact: true }).click();
  await expect.poll(() => page.getByRole("img", { name: "ภาพทางเข้าจุดสิ้นสุด B" }).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(writes).toEqual(["uploadExternalMediaAction", "upsertRouteAction"]);
});
