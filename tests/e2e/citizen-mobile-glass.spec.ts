import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_PATH || "";
const baseline = process.env.HDMS_GLASS_BASELINE === "1";
const coords = [[101.186, 6.881], [101.205, 6.892]];
const date = "2026-11-25T07:20:00.000Z";
const payload = {
  updatedAt: date,
  floodRoutes: [{
    id: "GLASS-F", route_no: "43", section_name: "หนองจิก ทดสอบ", km_start: "97+127", km_end: "97+252",
    lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: coords,
    water_level_cm: 30, traffic_status: "WARNING", is_active: true, updated_at: date,
  }],
  detourRoutes: [{
    id: "GLASS-D", flood_id_ref: "GLASS-F", route_name: "ทางเลี่ยงหนองจิก ทดสอบ", direction_mode: "FORWARD_ONLY",
    lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: coords, is_active: true, updated_at: date,
  }],
  highwayLayers: [], timelineUpdates: [], mitigationProjects: [], mapStyles: null,
  offices: [{ id: "GLASS-O", type: "HEADQUARTERS", name: "แขวงทางหลวงปัตตานี", address: "ถนนทดสอบ",
    phone: "073-123456", lat: 6.88, lon: 101.20, is_active: true }],
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
};

async function openFixture(page: Page, getPayload = () => payload) {
  await page.route("**/*", (route) => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.route("**/functions/v1/hdms-api*", (route) => route.fulfill({ json: getPayload() }));
  await page.goto(base + "/");
  const map = page.locator(".leaflet-container").first();
  await expect(map).toBeVisible();
  // Same deliberately mixed, offline imagery under both builds. No map network is queried.
  await map.evaluate((el) => {
    (el as HTMLElement).style.backgroundSize = "100% 100%";
    (el as HTMLElement).style.backgroundImage =
      "repeating-linear-gradient(124deg, transparent 0 62px, #fff8 63px 67px, transparent 68px 116px), radial-gradient(ellipse at 8% 78%, #2d6245 0%, transparent 55%), radial-gradient(ellipse at 95% 54%, #366783 0%, transparent 60%), linear-gradient(142deg, #cad49b 15%, #9aba91 52%, #dccdae 73%, #667f65 100%)";
  });
  return page.getByRole("navigation", { name: "เมนูประชาชน" });
}

test("citizen mobile glass keeps readable navigation and all four actions", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "Explicit phone, landscape, tablet and desktop widths are set in this case.");
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = await openFixture(page);
  const map = nav.getByRole("button", { name: "แผนที่", exact: true });
  const labels = ["แผนที่", "เหตุการณ์น้ำท่วม", "ทางเลี่ยง", "ติดต่อ"];
  const bounds = async () => nav.getByRole("button").evaluateAll((buttons) => buttons.every((button) => {
    const r = button.getBoundingClientRect();
    const center = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth &&
      r.y >= 0 && r.bottom <= innerHeight && !!center && button.contains(center);
  }));
  await expect(nav.getByRole("button")).toHaveCount(4);
  for (const label of labels) {
    const button = nav.getByRole("button", { name: label, exact: true });
    await expect(button.locator('svg[aria-hidden="true"]')).toBeVisible();
  }
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    await expect(page.locator(".citizen-ui")).toHaveAttribute("data-citizen-theme", theme);
    for (const [width, height] of [[320, 568], [390, 844], [568, 320], [820, 1180], [1023, 768]]) {
      await page.setViewportSize({ width, height });
      await expect(nav).toBeVisible();
      await expect.poll(bounds).toBe(true);
      if (width <= 390) await page.screenshot({ path: testInfo.outputPath(`nav-${theme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Tab");
    await map.focus();
    await expect(map).toHaveAttribute("aria-current", "page");
    if (!baseline) {
      await expect(nav).toHaveCSS("backdrop-filter", "blur(8px) saturate(1.25)");
      await expect(map).toHaveCSS("outline-offset", "-2px");
      await expect(map).toHaveCSS("outline-style", "solid");
      const contrast = await nav.evaluate((element) => {
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const color = (value: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data, (v) => v / 255);
        };
        const lum = (values: number[]) => values.slice(0, 3).reduce((s, v, i) =>
          s + [0.2126, 0.7152, 0.0722][i] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4), 0);
        const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
        const bar = color(getComputedStyle(element).backgroundColor);
        const composite = (layer: number[], under: number[]) => layer.slice(0, 3).map((v, i) => v * layer[3] + under[i] * (1 - layer[3]));
        const bases = [[0, 0, 0], [1, 1, 1]].map((under) => composite(bar, under));
        const buttons = Array.from(element.querySelectorAll("button"), (item) => {
          const css = getComputedStyle(item);
          const bg = color(css.backgroundColor), fg = color(css.color);
          return Math.min(...bases.map((value) => ratio(fg, composite(bg, value))));
        });
        const css = getComputedStyle(element.querySelector("button")!);
        return { alpha: bar[3], labels: Math.min(...buttons), activeFocus: ratio(color(css.outlineColor), color(css.backgroundColor)) };
      });
      expect(contrast.alpha).toBeGreaterThanOrEqual(0.92);
      expect(contrast.labels).toBeGreaterThanOrEqual(4.5);
      expect(contrast.activeFocus).toBeGreaterThanOrEqual(3);
    }
    await page.keyboard.press("Enter");
    await expect(nav).toBeVisible();
    for (const [label, short] of [["เหตุการณ์น้ำท่วม", "flood"], ["ทางเลี่ยง", "detour"]] as const) {
      await nav.getByRole("button", { name: label, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
      await expect(drawer.getByRole("heading", { name: label, exact: true })).toBeVisible();
      await expect(nav).toHaveCount(0);
      if (!baseline) await expect(drawer).toHaveCSS("backdrop-filter", "none");
      await page.screenshot({ path: testInfo.outputPath(`${short}-${theme}-390.png`) });
      await drawer.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
      await expect(nav).toBeVisible();
    }
    const contacts = nav.getByRole("button", { name: "ติดต่อ", exact: true });
    await contacts.click();
    const directory = page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" });
    await expect(directory).toBeVisible();
    await expect(directory.getByRole("link", { name: /โทรสอบถาม/ }).first()).toHaveAttribute("href", "tel:073123456");
    await page.screenshot({ path: testInfo.outputPath(`contacts-${theme}-390.png`) });
    await page.keyboard.press("Escape");
    await expect(directory).toHaveCount(0);
    await expect(contacts).toBeFocused();
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(nav).toHaveCSS("backdrop-filter", "none");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nav).toBeHidden();
});

test("mobile flood status cards lead the switch and adapt to one through five statuses", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile || baseline, "Explicit layout viewports; candidate only.");
  test.setTimeout(45000);
  await page.setViewportSize({ width: 320, height: 568 });
  const statuses = ["CLOSED", "NO_SMALL_VEHICLES", "ONE_LANE", "LIGHT_VEHICLES_ONLY", "PASSABLE", "PENDING_VERIFICATION"];
  const colors = ["red", "orange", "amber", "sky", "emerald", "slate"];
  let indices = [0];
  const nav = await openFixture(page, () => ({
    ...payload,
    floodRoutes: indices.slice().reverse().map((status) => ({
      ...payload.floodRoutes[0],
      id: `GLASS-F-${status}`, route_no: String(40 + status), section_name: `ช่วงทดสอบ ${status}`,
      traffic_status: statuses[status],
    })),
  }));
  const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  const region = drawer.getByRole("region", { name: "สถานะการผ่านทางจากรายงานน้ำท่วม" });
  const summary = region.getByRole("list", { name: "สรุปสถานการณ์ทุกจุด" });
  const tabs = drawer.getByRole("group", { name: "ประเภทข้อมูล" });
  const measurement = () => summary.locator("[data-traffic-card]").evaluateAll((cards) => cards.map((card) => {
    const r = card.getBoundingClientRect();
    return { color: card.getAttribute("data-traffic-card"), y: r.y, width: r.width,
      fits: (card as HTMLElement).scrollWidth <= (card as HTMLElement).clientWidth && r.height >= 44 };
  }));
  const readableCards = () => summary.locator("[data-traffic-card]").evaluateAll((cards) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const lum = (color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
        .map((v) => v / 255).reduce((s, v, i) =>
          s + [0.2126, 0.7152, 0.0722][i] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4), 0);
    };
    return cards.every((card) => {
      const bg = lum(getComputedStyle(card).backgroundColor);
      return Array.from(card.querySelectorAll(".citizen-traffic-card-label, .citizen-traffic-card-top")).every((el) => {
        const fg = lum(getComputedStyle(el).color);
        return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) >= 4.5;
      });
    });
  });
  const expectedRows = [[1], [2], [3], [2, 2], [1, 2, 2]];
  const cases = [[0], [0, 3], [0, 2, 3], [0, 1, 3, 4], [0, 1, 2, 3, 4], [1, 2, 3, 4, 5]];
  for (const [i, active] of cases.entries()) {
    indices = active;
    if (i > 0) await page.reload();
    await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    await expect(summary.locator("[data-traffic-card]")).toHaveCount(active.length);
    expect((await region.boundingBox())!.y).toBeLessThan((await tabs.boundingBox())!.y);
    const boxes = await measurement();
    expect(boxes.map(({ color }) => color)).toEqual(active.map((j) => colors[j]));
    expect(boxes.every(({ fits }) => fits)).toBe(true);
    expect(await readableCards()).toBe(true);
    const rows = [...new Set(boxes.map(({ y }) => y))].map((y) => boxes.filter((b) => b.y === y));
    expect(rows.map((row) => row.length)).toEqual(expectedRows[Math.min(i, 4)]);
    for (const row of rows) expect(Math.max(...row.map((b) => b.width)) - Math.min(...row.map((b) => b.width))).toBeLessThan(1);
    if (i >= 4) expect(boxes[0].width).toBeGreaterThan(boxes[1].width * 1.9);
    await page.screenshot({ path: testInfo.outputPath(`status-${i + 1}-light-320.png`) });
  }
  await expect(summary.getByRole("button", { name: "1 ผ่านไม่ได้", exact: true })).toHaveCount(0);
  const mostSevere = summary.getByRole("button", { name: "1 รถเล็กไม่สามารถผ่านได้", exact: true });
  await mostSevere.click();
  await expect(mostSevere).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 568, height: 320 });
  const detour = tabs.getByRole("button", { name: /ทางเลี่ยง/ });
  await detour.focus();
  await page.keyboard.press("Enter");
  await expect(detour).toHaveAttribute("aria-pressed", "true");
  await expect(region).toBeVisible();
  await drawer.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
  await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  await expect(summary.locator("[data-traffic-card]")).toHaveCount(5);
  expect(await readableCards()).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("status-five-dark-390.png") });
});
