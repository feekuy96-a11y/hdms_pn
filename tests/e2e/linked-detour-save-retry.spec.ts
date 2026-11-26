import { expect, test } from "@playwright/test";

for (const firstReply of ["pending", "disconnected"] as const) {
  test(`linked detour retry preserves saved ID and both endpoint photos (${firstReply})`, async ({ page, baseURL, isMobile }) => {
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const origin = new URL(baseURL!).origin;
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4YQAAAAASUVORK5CYII=", "base64");
    const updatedAt = "2026-11-25T10:00:00.000Z";
    const data = { updatedAt, floodRoutes: [{
      id: "F-1", route_no: "42", section_name: "น้ำท่วมจำลอง", km_start: "10+000", km_end: "11+000",
      coordinates_json: [[101.25, 6.87], [101.26, 6.88]], lat_start: 6.87, lon_start: 101.25,
      lat_end: 6.88, lon_end: 101.26, water_level_cm: 15, traffic_status: "WARNING",
      is_active: true, updated_at: updatedAt,
      direction_meta: { eventId: "E-1", eventTitle: "น้ำท่วมจำลอง", directionCode: "BOTH" },
    }], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null,
    systemSettings: { name: "ทดสอบ", org: "ทดสอบ", phone: "1586" } };
    const attempts: Array<{ id: string; detourRefId: string; linkedDetourCreate: boolean; detourMeta: unknown }> = [];
    const uploads: string[] = [];
    const routeRequests: string[] = [];
    const deletes: string[] = [];
    const mediaUrl = (id: string) => "https://example.invalid/media/" + id;

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith("/functions/v1/hdms-api")) {
        const { action, args = [] } = request.method() === "POST" ? (request.postDataJSON() || {}) : {};
        if (action === "uploadExternalMediaAction") {
          const id = "fixture-photo-" + (uploads.length + 1);
          uploads.push(id);
          return route.fulfill({ json: { mediaId: id, url: mediaUrl(id), mimeType: "image/png", sizeBytes: image.length } });
        }
        if (action === "deleteExternalMediaAction") {
          deletes.push(args[0].mediaId);
          return route.fulfill({ json: { success: true } });
        }
        if (action === "upsertRouteAction") {
          attempts.push(args[0]);
          if (attempts.length === 1 && firstReply === "disconnected") return route.abort("connectionreset");
          return route.fulfill({ json: {
            success: true, savedId: args[0].id, detourLinkState: attempts.length === 1 ? "PENDING" : "LINKED",
          } });
        }
        return route.fulfill({ json: data });
      }
      if (url.pathname.includes("/route/v1/driving/")) {
        routeRequests.push(url.pathname);
        return route.fulfill({ json: { code: "Ok", routes: [{
          distance: 1200, duration: 90, geometry: { type: "LineString", coordinates: [[101.21, 6.82], [101.22, 6.825], [101.23, 6.83]] },
        }] } });
      }
      return url.origin === origin ? route.continue() : route.abort();
    });

    await page.goto((process.env.BASE_PATH || "") + "/admin/");
    await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
    await page.getByPlaceholder(/เช่น ทางเลี่ยง ทล.4092/).fill("ทางเลี่ยงจำลอง 409");
    await page.getByLabel("ผูกกับจุดน้ำท่วมอ้างอิง").selectOption("F-1");
    const calculate = page.getByRole("button", { name: "คำนวณตามถนน", exact: true });
    await expect(calculate).toHaveCount(1);
    const afterAandB = await calculate.evaluate((button) => {
      const labels = ["พิกัดจุด A", "พิกัดจุด B", "โครงสร้างถนนสำหรับสองทิศทาง"];
      const inputs = labels.slice(0, 2).map((label) => document.querySelector(`[aria-label="${label}"]`));
      const road = [...document.querySelectorAll("label")].find((el) => el.textContent?.startsWith(labels[2]));
      const advanced = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "ดัดเส้นอิสระ");
      return [...inputs, road].every((el) => el != null && Boolean(el.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)) &&
        advanced != null && Boolean(button.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(afterAandB).toBe(true);
    await expect(calculate).toBeDisabled();
    await expect(calculate).toHaveAccessibleDescription("ระบุจุด A และ B · เลือกรูปแบบถนน");
    await calculate.dispatchEvent("click");
    expect(routeRequests).toHaveLength(0);
    for (const [name, value] of [["พิกัดจุด A", "6.8200, 101.2100"], ["พิกัดจุด B", "6.8300, 101.2300"]]) {
      const field = page.getByLabel(name, { exact: true });
      await field.fill(value);
      await field.blur();
    }
    const carriageway = page.getByLabel("โครงสร้างถนนสำหรับสองทิศทาง");
    await expect(carriageway).toHaveValue("");
    await expect(calculate).toBeDisabled();
    await expect(calculate).toHaveAccessibleDescription("เลือกรูปแบบถนน");
    await calculate.dispatchEvent("click");
    expect(routeRequests).toHaveLength(0);
    await carriageway.selectOption("SHARED");
    await expect(page.getByRole("group", { name: /หมุดเส้นทางขากลับ/ })).toHaveCount(0);
    await expect(calculate).toBeEnabled();
    await calculate.click();
    await expect(page.getByText(/คำนวณทางเลี่ยงตามถนนสำเร็จ/)).toBeVisible();
    expect(routeRequests).toHaveLength(1);
    expect(routeRequests[0]).toContain("101.21,6.82;101.23,6.83");
    await page.getByLabel("แนบภาพจุดเริ่มต้น A", { exact: true }).setInputFiles({ name: "a.png", mimeType: "image/png", buffer: image });
    await page.getByRole("tab", { name: /จุด B \(ปลายทาง\)/ }).click();
    await page.getByLabel("แนบภาพจุดสิ้นสุด B", { exact: true }).setInputFiles({ name: "b.png", mimeType: "image/png", buffer: image });
    await page.getByRole("button", { name: /บันทึกทางเลี่ยงเข้าสู่ระบบสารสนเทศ/ }).click();

    const notice = page.getByRole("dialog", { name: firstReply === "pending"
      ? "บันทึกทางเลี่ยงแล้ว แต่ยังผูกเหตุการณ์ไม่สำเร็จ"
      : "ยังยืนยันผลการบันทึกทางเลี่ยงไม่ได้" });
    await expect(notice).toBeVisible();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ directionMode: "TWO_WAY", reverseCoordinates: [], reverseWaypoints: [] });
    expect(attempts[0]).toMatchObject({ id: expect.stringMatching(/^D-/), detourRefId: "F-1", linkedDetourCreate: true });
    await expect(notice).toContainText(attempts[0].id);
    for (const upload of uploads) expect(JSON.stringify(attempts[0].detourMeta)).toContain(mediaUrl(upload));
    expect(uploads).toHaveLength(2);
    expect(deletes).toEqual([]);
    await notice.getByRole("button", { name: "ตกลง" }).click();
    await page.getByRole("button", { name: "ลองผูกเหตุการณ์อีกครั้ง", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "ผูกทางเลี่ยงกับเหตุการณ์สำเร็จ" })).toBeVisible();
    expect(attempts).toEqual([attempts[0], attempts[0]]);
    expect(uploads).toHaveLength(2);
    expect(deletes).toEqual([]);
  });
}
