import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const checkedAt = "2026-11-25T07:20:00.000Z";
const section = "หนองจิก ช่วงสายทางมะพร้าวต้นเดียวถึงปูยุดบารู";
const photo = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#adc0c4"/></svg>');
const fakeFlood = {
  id: "F-E44", route_no: "43", section_name: section, subdistrict: "ปุโละปุโย", district: "หนองจิก", province: "ปัตตานี",
  km_start: "97+127", km_end: "97+252", lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205,
  coordinates_json: [[101.186, 6.881], [101.205, 6.892]], water_level_cm: 30, traffic_status: "CLOSED",
  direction_meta: {}, is_active: true, updated_at: checkedAt,
};

test("mobile flood essentials remain above scroll with compact loaded photo or no-photo fallback", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Public narrow viewport flood panel");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/rest/v1/doh_flood_routes?*", route => route.fulfill({ json: [] }));
  const cases = [[320, 568, 100, true], [390, 844, 100, true], [568, 320, 100, true], [320, 568, 150, true], [320, 568, 150, false], [320, 568, 100, "broken"]] as const;
  for (const [width, height, scale, hasPhoto] of cases) {
    await page.setViewportSize({ width, height });
    const endpoint = /\/functions\/v1\/hdms-api\/?$/;
    await page.route(endpoint, route => route.fulfill({ json: {
      updatedAt: checkedAt,
      floodRoutes: [{ ...fakeFlood, latest_photo_url: hasPhoto === "broken" ? "data:image/png;base64,bm90LXBuZw==" : hasPhoto ? photo : null }],
      detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
      systemSettings: { name: "แผนที่ประชาชน", org: "แขวงทางหลวง", phone: "1586" },
    } }));
    await page.goto(base + "/");
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size}%`; }, scale);
    const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
    await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    await page.locator(".citizen-card").filter({ hasText: section }).getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
    const body = dialog.locator(".citizen-incident-grid");
    const capture = body.locator(".citizen-incident-photo");
    const area = dialog.locator(".citizen-incident-area");
    const status = capture.locator(".citizen-photo-status").getByText("ผ่านไม่ได้", { exact: true });
    const source = dialog.locator(".citizen-incident-update time");
    await expect(area).toContainText(/ปุโละปุโย.*หนองจิก.*ปัตตานี/);
    await expect(status).toBeVisible();
    await expect(source).toHaveAttribute("datetime", checkedAt);
    await expect(dialog.locator(".citizen-route-id")).toContainText("ทล.43");
    await expect(dialog.getByRole("heading", { name: "รายละเอียดน้ำท่วม", exact: true })).toBeVisible();
    await expect(body.locator(":scope > *").nth(0)).toHaveClass(/citizen-incident-photo/);
    await expect(body.locator(":scope > *").nth(1)).toHaveClass(/citizen-incident-details/);
    await expect(body.locator(":scope > *").nth(2)).toHaveClass(/citizen-incident-facts/);
    await expect(dialog.locator("time")).toHaveCount(1);
    if (hasPhoto === true) {
      await expect.poll(() => capture.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(capture.locator(".citizen-photo-placeholder")).toHaveCount(0);
      await expect(capture.getByRole("button", { name: "ขยายภาพสถานการณ์เต็มจอ", exact: true })).toBeVisible();
    } else {
      await expect(capture).toContainText(hasPhoto === "broken" ? "โหลดภาพแนบไม่สำเร็จ" : "ยังไม่มีภาพแนบ");
      await expect(capture.locator(".citizen-photo-placeholder svg")).toBeVisible();
      await expect(capture.locator("img")).toHaveCount(0);
    }
    await expect(dialog.getByText("ผ่านไม่ได้", { exact: true })).toHaveCount(1);
    expect(await capture.evaluate(node => {
      const r = node.getBoundingClientRect();
      const b = node.querySelector(".citizen-photo-status")!.getBoundingClientRect();
      const conflicts = Array.from(node.querySelectorAll("button, .citizen-photo-caption, .citizen-photo-placeholder > p"))
        .filter(el => el.getBoundingClientRect().width > 0)
        .some(el => {const x=el.getBoundingClientRect();return x.left < b.right && x.right > b.left && x.top < b.bottom && x.bottom > b.top;});
      return b.top >= r.top && b.right <= r.right && b.right > r.left + r.width * .75 && !conflicts;
    })).toBe(true);
    await expect.poll(async () => {
      const positions = await Promise.all([status.boundingBox(), capture.boundingBox(), ...(height >= 568 && scale === 100 ? [area.boundingBox(), source.boundingBox()] : [])]);
      return positions.every(rect => rect !== null && rect.y >= 0 && rect.y + rect.height <= height + 1 && rect.x >= 0 && rect.x + rect.width <= width + 1);
    }, { message: `All essentials initially in view at ${width}×${height}/${scale}%` }).toBe(true);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toBeInViewport();
    const close = dialog.getByRole("button", { name: "ปิดรายละเอียด", exact: true });
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.height).toBeGreaterThanOrEqual(43.99);
    await close.click();
    await expect(dialog).toHaveCount(0);
    await page.unroute(endpoint);
  }
});

test("long Thai detour dossier title reflows at enlarged text while real close stays tappable", async ({ page, isMobile }) => {
  const longRoad = "ทางเลี่ยงถนนสายรองช่วงโรงเรียนบ้านมะพร้าวต้นเดียวไปยังแยกหนองจิก";
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: {
    updatedAt: checkedAt, floodRoutes: [{ ...fakeFlood, latest_photo_url: photo }],
    detourRoutes: [{ id: "D-LONG", flood_id_ref: fakeFlood.id, route_name: longRoad, description: "1. เลี้ยวซ้าย\n2. กลับสู่ถนนหลัก",
      direction_mode: "TWO_WAY", is_active: true, updated_at: checkedAt,
      lat_start: 6.89, lon_start: 101.183, lat_end: 6.895, lon_end: 101.21,
      coordinates_json: [[101.183, 6.89], [101.21, 6.895]] }],
    highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
    systemSettings: { name: "แผนที่ประชาชน", org: "แขวงทางหลวง", phone: "1586" },
  } }));
  const viewports = isMobile ? [{ width: 320, height: 568 }, { width: 568, height: 320 }] : [{ width: 1440, height: 900 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(base + "/");
    await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
    await page.getByRole("button", { name: "ทางเลี่ยง 1 เส้นทาง", exact: true }).click();
    const detail = page.getByRole("region", { name: "รายการทางเลี่ยง", exact: true }).getByRole("button", { name: new RegExp(longRoad) });
    await detail.click();
    const dialog = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
    const title = dialog.getByRole("heading", { name: longRoad, exact: true });
    const close = dialog.getByRole("button", { name: "ปิดหน้าต่างคำแนะนำทางเลี่ยง", exact: true });
    await expect(title).toBeVisible();
    await expect(close).toBeVisible();
    const bounds = (await close.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(43.99);
    expect(bounds.width).toBeGreaterThanOrEqual(43.99);
    expect(await title.evaluate(el => {
      const panel = el.closest('[role="dialog"]')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      return Array.from(range.getClientRects()).every(r => r.left >= panel.left && r.right <= panel.right && r.bottom <= panel.bottom);
    })).toBe(true);
    await close.click();
    await expect(dialog).toHaveCount(0);
  }
});

test("public photo album shows loading, preserves known photos, and retries a failed read only on reopen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Public mobile dossier album states");
  let knownPhoto = "";
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({ json: {
    updatedAt: checkedAt, floodRoutes: [{ ...fakeFlood, latest_photo_url: knownPhoto }],
    detourRoutes: [], highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
    systemSettings: { name: "แผนที่ประชาชน", org: "แขวงทางหลวง", phone: "1586" },
  } }));
  let reads = 0;
  let release!: () => void;
  const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/rest/v1/doh_flood_routes?*", async route => {
    reads++;
    if (reads === 1) {
      await waitForRelease;
      await route.fulfill({ status: 500, json: { message: "synthetic album read failure" } });
    } else if (reads === 2) {
      await route.fulfill({ json: [] });
    } else {
      await route.fulfill({ json: [{ direction_meta: { photos: [{ dataUrl: reads === 3 ? "invalid-album-photo-url" : photo }] } }] });
    }
  });
  const open = async () => {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    await page.locator(".citizen-card").filter({ hasText: section }).getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  };
  const dialog = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  const close = dialog.getByRole("button", { name: "ปิดรายละเอียด", exact: true });
  await page.goto(base + "/");
  await open();
  try {
    await expect(dialog.getByText("กำลังโหลดภาพแนบ", { exact: true })).toBeVisible();
    await expect(dialog.getByText("ยังไม่มีภาพแนบ", { exact: true })).toHaveCount(0);
    await expect.poll(() => reads).toBe(1);
  } finally {
    release();
  }
  await expect(dialog.getByText("โหลดภาพแนบไม่สำเร็จ", { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await close.click();
  await open();
  await expect(dialog.getByText("ยังไม่มีภาพแนบ", { exact: true })).toBeVisible();
  expect(reads).toBe(2);
  await close.click();
  await open();
  await expect(dialog.getByText("ยังไม่มีภาพแนบ", { exact: true })).toBeVisible();
  expect(reads).toBe(2);

  knownPhoto = photo;
  await page.reload();
  await open();
  await expect.poll(() => reads).toBe(3);
  await expect.poll(() => dialog.locator(".citizen-incident-photo img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByText("โหลดภาพแนบไม่สำเร็จ", { exact: true })).toHaveCount(0);

  knownPhoto = "";
  await page.reload();
  await open();
  await expect.poll(() => reads).toBe(4);
  await expect.poll(() => dialog.locator(".citizen-incident-photo img").evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByText("ยังไม่มีภาพแนบ", { exact: true })).toHaveCount(0);
});
