import { expect, test } from "@playwright/test";

test("detour advice uses the actual A/B boundary and never generates an unverified itinerary", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const asked: string[] = [];
  const data = { updatedAt: "2026-11-27T00:00:00Z", floodRoutes: [], detourRoutes: [],
    timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null,
    systemSettings: { name: "ทดสอบ", org: "ทดสอบ", phone: "1586" } };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action } = request.method() === "POST" ? request.postDataJSON() || {} : {};
      asked.push(action);
      if (String(action).includes("Geocode")) return route.fulfill({ json: {
        available: true, configured: true, found: true, subdistrict: "พ่อมิ่ง", district: "ปะนาเระ",
      } });
      if (action === "computeGoogleDetourRouteAction") return route.fulfill({ json: { configured: false } });
      return route.fulfill({ json: data });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto((process.env.BASE_PATH || "") + "/admin/");
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  const generate = page.getByRole("button", { name: "วิเคราะห์คำแนะนำ (ไป-กลับ)", exact: true });
  const advice = page.locator("#detour-advice-textarea");
  await generate.click();
  await expect(page.getByText("กรุณากำหนดพิกัดจุด A และ B ก่อนวิเคราะห์คำแนะนำ", { exact: true })).toBeVisible();
  await expect(advice).toHaveValue("");
  expect(asked).not.toContain("computeGoogleDetourRouteAction");

  for (const [label, value] of [["พิกัดจุด A", "6.852110, 101.489043"], ["พิกัดจุด B", "6.852099, 101.489054"]]) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.blur();
  }
  await expect(page.getByRole("textbox", { name: /^ตำบลภาพ/ }).first()).toHaveValue("ปะนาเระ");
  await generate.click();
  await expect(advice).toHaveValue(/A → จุด B \(ต\.ปะนาเระ อ\.ปะนาเระ → ต\.ปะนาเระ อ\.ปะนาเระ\)/);
  const text = await advice.inputValue();
  expect(text).toContain("B → จุด A");
  expect(text).toContain("ยังไม่มีแนวเส้นที่ยืนยัน");
  expect(text).not.toMatch(/พ่อมิ่ง|ผิวทางลาดยาง|รถยนต์ทุกชนิด|สัญจรต่อได้ตามปกติ/);
});

for (const detourLeavesDrawnRoute of [false, true]) {
  test(`route steps must match the drawn detour (${detourLeavesDrawnRoute ? "mismatch" : "match"})`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const data = { updatedAt: "2026-11-27T00:00:00Z", floodRoutes: [], detourRoutes: [],
      timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null,
      systemSettings: { name: "ทดสอบ", org: "ทดสอบ", phone: "1586" } };
    await page.route("**/*", async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.endsWith("/functions/v1/hdms-api")) {
        return url.origin === origin ? route.continue() : route.abort();
      }
      const { action, args } = req.method() === "POST" ? req.postDataJSON() || {} : {};
      if (action === "proxyOsrmRouteAction") {
        const { coords, steps } = args[0];
        const [from, to] = [coords[0], coords.at(-1)] as [number, number][];
        const bend = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + (steps && detourLeavesDrawnRoute ? 0.003 : 0)];
        const geometry = { type: "LineString", coordinates: [from, bend, to] };
        const legs = [{ steps: [
          { distance: 300, name: "ถนนทดสอบ", maneuver: { type: "depart", location: from }, geometry },
          { distance: 200, name: "ถนนจุดเลี้ยวทดสอบ", maneuver: { type: "turn", modifier: "right", location: bend }, geometry },
          { distance: 0, name: "", maneuver: { type: "arrive", location: to } },
        ] }];
        return route.fulfill({ json: { available: true, found: true, data: { routes: [{ distance: 500, duration: 60, geometry, legs }] } } });
      }
      if (action === "computeGoogleDetourRouteAction") return route.fulfill({ json: { configured: false } });
      return route.fulfill({ json: data });
    });
    await page.goto((process.env.BASE_PATH || "") + "/admin/");
    await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
    for (const [label, value] of [["พิกัดจุด A", "6.852110, 101.489043"], ["พิกัดจุด B", "6.854000, 101.493000"]]) {
      const field = page.getByLabel(label, { exact: true });
      await field.fill(value);
      await field.blur();
    }
    await page.getByLabel("โครงสร้างถนนสำหรับสองทิศทาง").selectOption("SHARED");
    await page.getByRole("button", { name: "คำนวณตามถนน", exact: true }).click();
    await expect(page.getByText(/คำนวณทางเลี่ยงตามถนนสำเร็จ/)).toBeVisible();
    await page.getByRole("button", { name: "วิเคราะห์คำแนะนำ (ไป-กลับ)", exact: true }).click();
    const advice = page.locator("#detour-advice-textarea");
    await expect(advice).toHaveValue(detourLeavesDrawnRoute ? /ยังยืนยันจุดเลี้ยว/ : /รวมระยะทางเลี่ยง: 0\.5 กม\./);
    expect(await advice.inputValue()).toContain("พื้นที่ตามแนวเส้นที่เลือก: ต.ปะนาเระ อ.ปะนาเระ");
    expect(await advice.inputValue()).not.toMatch(/รถยนต์ทุกชนิด|สัญจรต่อได้ตามปกติ/);
  });
}

test("editing a saved detour uses each stored pin, not route-wide area or a guessed province", async ({ page, baseURL, isMobile }) => {
  const origin = new URL(baseURL!).origin;
  const a = [101.489043, 6.852110], b = [101.660000, 6.940000];
  const data = { updatedAt: "2026-11-27T00:00:00Z", floodRoutes: [], detourRoutes: [{
    id: "DET-PIN-REVIEW", direction_mode: "FORWARD_ONLY", route_name: "ทางเลี่ยงทดสอบพิกัดเดิม", description: "", is_active: true,
    lat_start: a[1], lon_start: a[0], lat_end: b[1], lon_end: b[0], coordinates_json: [a, b],
    subdistrict: "พ่อมิ่ง", district: "ปะนาเระ",
    detour_meta: { start_point_photo: { lat: a[1], lon: a[0], caption: "ภาพต้นทาง" },
    end_point_photo: { lat: b[1], lon: b[0], caption: "ภาพปลายทาง" } },
  }], timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null,
  systemSettings: { name: "ทดสอบ", org: "ทดสอบ", phone: "1586" } };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action } = route.request().postDataJSON() || {};
      if (String(action).includes("Geocode")) return route.fulfill({ json: {
        available: true, configured: true, found: true, subdistrict: "พ่อมิ่ง", district: "ปะนาเระ",
      } });
      return route.fulfill({ json: data });
    }
    return route.abort();
  });
  await page.goto((process.env.BASE_PATH || "") + "/admin/");
  const list = page.getByRole("button", { name: "รายการทางเลี่ยง", exact: true });
  if (isMobile && !await list.isVisible()) await page.getByRole("button", { name: "เมนู", exact: true }).click();
  await list.click();
  await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();
  await expect(page.getByLabel("ตำบลภาพจุดเริ่มต้น A")).toHaveValue("ปะนาเระ");
  await page.getByRole("tab", { name: /จุด B/ }).click();
  await expect(page.getByText(/ยังไม่พบข้อมูลพื้นที่/)).toBeVisible();
  await expect(page.getByLabel("จังหวัดภาพจุดสิ้นสุด B")).toHaveValue("");
  await page.getByRole("tab", { name: /จุด A/ }).click();
  await page.getByRole("button", { name: "ดึงจากจุด A", exact: true }).click();
  await expect(page.getByLabel("ตำบลภาพจุดเริ่มต้น A")).toHaveValue("ปะนาเระ");
  const lon = page.getByLabel("ลองจิจูดภาพจุดเริ่มต้น A"), lat = page.getByLabel("ละติจูดภาพจุดเริ่มต้น A");
  await lon.fill("101.419500");
  await lat.fill("6.718100");
  await lat.blur();
  await expect(page.getByLabel("ตำบลภาพจุดเริ่มต้น A")).toHaveValue("มายอ");
  await page.getByRole("button", { name: "วิเคราะห์คำแนะนำอัตโนมัติ", exact: true }).click();
  await expect(page.locator("#edit-detour-advice-textarea")).toHaveValue(/A → จุด B \(ต\.มายอ อ\.มายอ → ยังไม่ยืนยันพื้นที่\)/);
});
