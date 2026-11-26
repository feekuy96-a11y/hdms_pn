import { writeFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const thai = "คลองทดสอบสายทางหมู่บ้านปากน้ำเหนือและจุดเชื่อมต่อสะพานข้ามคลองสายหลัก";
const title = `ทล.42 ตอน${thai}${thai}`;
const flood = { id: "F-1", route_no: "42", section_name: thai, km_start: "10+000", km_end: "11+000", traffic_status: "CLOSED", water_level_cm: 35, is_active: true,
  road_side: "LEFT", lat_start: 6.87, lon_start: 101.25, lat_end: 6.88, lon_end: 101.26, updated_at: "2026-11-18T00:00:00.000Z",
  coordinates_json: [[101.25,6.87],[101.26,6.88]], direction_meta: { eventId: "EV-F-1", eventTitle: title, directionCode: "A_TO_B", villageOrLandmark: thai } };
const detours = Array.from({ length: 5 }, (_, i) => ({
  id: `D-${i + 1}`, route_name: `ทางเลี่ยง ${i + 1} ${thai}${thai}`, is_active: true, direction_mode: "FORWARD_ONLY", geometry_revision: 3,
  updated_at: "2026-11-18T00:00:00.000Z", coordinates_json: [[101.23,6.84],[101.27,6.86]],
  lat_start: 6.84, lon_start: 101.23, lat_end: 6.86, lon_end: 101.27,
}));
const links = detours.map((d, i) => ({ eventId: "EV-F-1", detourId: d.id, eventDirection: "BOTH", detourDirection: "FORWARD", position: i + 1,
  eventPosition: i + 1, recommendation: "PENDING", reviewedGeometryVersion: null }));
const data = { floodRoutes: [flood], detourRoutes: detours, floodEvents: [{ id: "EV-F-1", link_version: 1 }],
  eventSegments: [{ flood_id: "F-1", event_id: "EV-F-1", event_direction: "A_TO_B", segment_position: 1 }], eventDetourLinks: links,
  timelineUpdates: [], mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
  systemSettings: { name: thai.repeat(2), org: thai.repeat(2), phone: "1586" } };
async function hit(target: Locator, tag: string) {
  await expect(target, tag).toBeInViewport();
  const result = await target.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const found = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { hit: Boolean(found && element.contains(found)), blocker: found?.className?.toString(), width: r.width, height: r.height };
  });
  expect(result.hit, `${tag}: ${JSON.stringify(result)}`).toBeTruthy();
  // A transformed surface may report 43.99999 for an actual 44 CSS px box.
  expect(result.height, tag).toBeGreaterThanOrEqual(43.95);
  expect(result.width, tag).toBeGreaterThanOrEqual(43.95);
}
const views = [
  { name: "320-portrait", width: 320, height: 568, scale: 100 },
  { name: "short-landscape", width: 568, height: 320, scale: 100 },
  { name: "intermediate", width: 768, height: 630, scale: 100 },
  { name: "desktop", width: 1440, height: 900, scale: 100 },
  { name: "320-text150", width: 320, height: 568, scale: 150 },
  { name: "320-text120", width: 320, height: 568, scale: 120 },
  { name: "landscape-text120", width: 640, height: 360, scale: 120 },
];
for (const v of views) test(`admin overlap audit ${v.name}`, async ({ page, isMobile, baseURL }, testInfo) => {
  test.skip(isMobile !== (v.width === 320));
  test.setTimeout(25_000);
  const allowed = new URL(baseURL ?? "");
  await page.setViewportSize(v);
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action } = request.postDataJSON() as { action: string };
      if (action === "getEventDetourLinksAction") return route.fulfill({ json: { eventId: "EV-F-1", version: 1, links } });
      return route.fulfill({ json: data });
    }
    return url.origin === allowed.origin && ["localhost", "127.0.0.1"].includes(allowed.hostname) ? route.continue() : route.abort();
  });
  await page.goto(`${process.env.BASE_PATH || ""}/admin/`);
  if (v.scale !== 100) await page.addStyleTag({ content: `html { font-size: ${v.scale}%; }` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(v.width);
  if (v.width === 320) {
    const fieldNav = page.getByRole("group", { name: "งานภาคสนาม", exact: true });
    for (const label of ["รายงานสถานการณ์", "รายการเหตุการณ์", "รายการทางเลี่ยง"]) {
      const text = fieldNav.getByText(label, { exact: true });
      await expect(text).toBeVisible();
      expect(await text.evaluate(el => {
        const button = el.closest("button")!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const badge = el.parentElement?.querySelector('[class*="navCount"]')?.getBoundingClientRect();
        return Array.from(range.getClientRects()).every(rect =>
          rect.left >= button.left - 1 && rect.right <= button.right + 1 &&
          (!badge || rect.top >= badge.bottom || rect.bottom <= badge.top || rect.left >= badge.right || rect.right <= badge.left)
        );
      }), label).toBeTruthy();
    }
  }
  const fieldSave = page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true });
  await hit(fieldSave, "field save initial");
  const heading = page.getByRole("heading", { name: "รายงานสถานการณ์น้ำท่วม", exact: true });
  const intro = await heading.locator("../../..").boundingBox();
  const firstForm = await page.getByRole("region", { name: "สายทางและหลักกิโลเมตร" }).boundingBox();
  await writeFile(testInfo.outputPath(`metrics-${v.name}.json`), JSON.stringify({
    introHeight: intro?.height, firstFormTop: firstForm?.y,
    headingSize: await heading.evaluate((el) => getComputedStyle(el).fontSize),
  }));
  await page.screenshot({ path: testInfo.outputPath(`initial-${v.name}.png`) });
  const theme = page.getByRole("button", { name: "รูปแบบสีพื้นที่จัดการ" });
  await hit(theme, "theme control");
  const brand = page.getByRole("group", { name: "ระบบจัดการของส่วนราชการ", exact: true });
  const brandTitle = brand.getByRole("heading", { level: 1 });
  const brandOrg = brand.locator("p");
  await expect(brandTitle).toHaveText(data.systemSettings.name);
  await expect(brandOrg).toHaveText(data.systemSettings.org);
  const [titleBox, orgBox, themeRect] = await Promise.all([brandTitle.boundingBox(), brandOrg.boundingBox(), theme.boundingBox()]);
  expect(titleBox!.x + titleBox!.width, "brand stays clear of theme control").toBeLessThanOrEqual(themeRect!.x);
  expect(orgBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 1);
  expect(await brandTitle.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  expect(await brandOrg.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await theme.click();
  const dark = page.getByRole("button", { name: "ธีมมืด", exact: true });
  await hit(dark, "theme choices during opening");
  await dark.click({ timeout: 2500 });
  await expect(page.locator("[data-admin-theme]")).toHaveAttribute("data-admin-theme", "dark");
  const nav = page.getByRole("navigation", { name: "ข้ามไปยังส่วนของแบบฟอร์ม" });
  const release = nav.getByRole("button", { name: "เลือกวิธีบันทึกและเผยแพร่" });
  await release.click({ timeout: 3500 });
  const publish = page.getByRole("region", { name: "เลือกวิธีบันทึกและเผยแพร่" });
  await expect(publish).toBeFocused();
  await publish.getByRole("checkbox").check({ timeout: 3500 });
  await hit(page.getByRole("button", { name: "บันทึกร่างเหตุการณ์", exact: true }), "draft save remains reachable");
  if (v.width < 1024) {
    await hit(page.getByRole("button", { name: "ฟอร์มข้อมูล", exact: true }), "sticky form pane switch after scrolling");
    await hit(page.getByRole("button", { name: "แผนที่ GIS", exact: true }), "sticky map pane switch after scrolling");
    for (const label of ["ฟอร์มข้อมูล", "แผนที่ GIS"]) {
      const button = await page.getByRole("button", { name: label, exact: true }).boundingBox();
      const header = await page.getByRole("banner").boundingBox();
      expect(button!.y, `${label} is below the sticky header`).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    }
  }
  await page.screenshot({ path: testInfo.outputPath(`form-${v.name}.png`) });

  const incidents = page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first();
  await incidents.click({ timeout: 5000 });
  const eventHeader = page.locator(".doh-incident-header").filter({ hasText: thai });
  const launch = eventHeader.getByRole("button", { name: /จัดการทางเลี่ยงเชื่อมโยง/ });
  await launch.scrollIntoViewIfNeeded();
  await hit(launch, "registry link action");
  await page.screenshot({ path: testInfo.outputPath(`registry-${v.name}.png`) });
  await launch.click({ timeout: 2500 });
  const dialog = page.getByRole("dialog", { name: "จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง" });
  await expect(dialog).toHaveAttribute("data-hdms-popup", "panel");
  await expect(dialog).toHaveCSS("background-color", "rgb(26, 45, 62)");
  await expect(dialog).toHaveCSS("color", "rgb(244, 248, 250)");
  const body = dialog.getByRole("region", { name: "รายละเอียดการเชื่อมโยง" });
  const save = dialog.getByRole("button", { name: "บันทึกความสัมพันธ์", exact: true });
  const close = dialog.getByRole("button", { name: "ปิดหน้าต่างจัดการความสัมพันธ์" });
  await hit(close, "ranked close initial");
  await hit(save, "ranked footer save initial");
  const dims = await body.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight, width: element.clientWidth, contentWidth: element.scrollWidth }));
  expect(dims.height).toBeGreaterThan(75);
  expect(dims.content).toBeGreaterThan(dims.height);
  expect(dims.contentWidth).toBeLessThanOrEqual(dims.width);
  await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const longDetour = body.getByText(detours[4].route_name, { exact: true }).last();
  await expect(longDetour).toBeVisible();
  expect(await longDetour.evaluate((element) => element.scrollWidth <= element.clientWidth), "long detour name wraps without horizontal clipping").toBe(true);
  await hit(save, "ranked save after internal scroll");
  await page.screenshot({ path: testInfo.outputPath(`rank-${v.name}.png`) });
  await close.click({ timeout: 3500 });
  await expect(launch).toBeFocused();
  await launch.click({ timeout: 3500 });
  await hit(close, "ranked close after reopening");
  await page.keyboard.press("Escape");
  await expect(launch).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(v.width);
});
