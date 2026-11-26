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
      if (width <= 390) await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`nav-${theme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Tab");
    await map.focus();
    await expect(map).toHaveAttribute("aria-current", "page");
    if (!baseline) {
      await expect(nav).toHaveCSS("backdrop-filter", "blur(5px) saturate(1.25)");
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
      expect(contrast.alpha).toBeCloseTo(theme === "light" ? 0.58 : 0.68, 2);
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
      if (!baseline) await expect(drawer).toHaveCSS("backdrop-filter", "blur(6px) saturate(1.15)");
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${short}-${theme}-390.png`) });
      await drawer.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
      await expect(nav).toBeVisible();
    }
    const contacts = nav.getByRole("button", { name: "ติดต่อ", exact: true });
    await contacts.click();
    const directory = page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" });
    await expect(directory).toBeVisible();
    if (!baseline) await expect(directory).toHaveCSS("backdrop-filter", "blur(6px) saturate(1.15)");
    await expect(directory.getByRole("link", { name: /โทรสอบถาม/ }).first()).toHaveAttribute("href", "tel:073123456");
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`contacts-${theme}-390.png`) });
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
    const style = getComputedStyle(card);
    const top = getComputedStyle(card.querySelector(".citizen-traffic-card-top")!);
    return { color: card.getAttribute("data-traffic-card"), y: r.y, width: r.width,
      fits: (card as HTMLElement).scrollWidth <= (card as HTMLElement).clientWidth && r.height >= 44,
      centeredRelief: style.textAlign === "center" && top.justifyContent === "center" &&
        style.backgroundImage.includes("linear-gradient") && style.boxShadow.includes("inset") };
  }));
  const readableCards = () => summary.locator("[data-traffic-card]").evaluateAll((cards) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((v) => v / 255);
    };
    const lum = (rgb: number[]) => rgb.reduce((s, v, i) =>
      s + [0.2126, 0.7152, 0.0722][i] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4), 0);
    const contrast = (face: number[], ink: number[]) => {
      const p = [lum(face), lum(ink)].sort((a, b) => a - b);
      return (p[1] + .05) / (p[0] + .05);
    };
    return cards.every((card) => {
      const style = getComputedStyle(card);
      const top = rgb(style.getPropertyValue("--status-card-start").trim());
      const bottom = rgb(style.getPropertyValue("--status-card-end").trim());
      const badge = card.querySelector(".citizen-traffic-card-value")!;
      const label = card.querySelector(".citizen-traffic-card-label")!;
      const badgeStyle = getComputedStyle(badge);
      const ink = rgb(getComputedStyle(label).color);
      const grade = Math.max(...top.map((v, i) => Math.abs(v - bottom[i])));
      return grade >= .16 && [top, bottom].every((face) => contrast(face, ink) >= 4.5) &&
        contrast(rgb(badgeStyle.backgroundColor), rgb(badgeStyle.color)) >= 4.5;
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
    expect(boxes.every(({ fits, centeredRelief }) => fits && centeredRelief)).toBe(true);
    expect(await readableCards()).toBe(true);
    const rows = [...new Set(boxes.map(({ y }) => y))].map((y) => boxes.filter((b) => b.y === y));
    expect(rows.map((row) => row.length)).toEqual(expectedRows[Math.min(i, 4)]);
    for (const row of rows) expect(Math.max(...row.map((b) => b.width)) - Math.min(...row.map((b) => b.width))).toBeLessThan(1);
    if (i >= 4) expect(boxes[0].width).toBeGreaterThan(boxes[1].width * 1.9);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`status-${i + 1}-light-320.png`) });
    if (i === 4) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await readableCards()).toBe(true);
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("status-five-with-closure-light-390.png") });
      await page.setViewportSize({ width: 320, height: 568 });
    }
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
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("status-five-dark-390.png") });
  indices = cases[4];
  await page.reload();
  await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  await expect(summary.getByRole("button", { name: "1 ผ่านไม่ได้", exact: true })).toBeVisible();
  expect(await readableCards()).toBe(true);
  const closure = summary.getByRole("button", { name: "1 ผ่านไม่ได้", exact: true });
  await expect(closure).toHaveCSS("text-align", "center");
  await expect(closure.locator(".citizen-traffic-card-top")).toHaveCSS("justify-content", "center");
  await expect(closure).toHaveCSS("background-image", /linear-gradient/);
  await expect(closure).toHaveCSS("box-shadow", /inset/);
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("status-five-with-closure-dark-390.png") });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await readableCards()).toBe(true);
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("status-five-with-closure-dark-320.png") });
});


test("field atlas keeps map controls and scene details usable in both themes", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "Uses explicit phone viewport sizes.");
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  const nav = await openFixture(page);
  const header = page.locator(".citizen-header");
  const controls = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  await expect(nav.getByRole("button", { name: "แผนที่", exact: true })).toHaveCSS("border-bottom-width", "2px");
  await expect(header.locator(".citizen-field-sign")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    await expect(header).toHaveCSS("background-color", theme === "light" ? "rgb(17, 57, 71)" : "rgb(11, 39, 52)");
    for (const [width, height] of [[320, 568], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const hotline = header.getByRole("link", { name: "โทรสายด่วน 1586" });
      await expect(hotline).toBeHidden();
      await controls.getByRole("button", { name: "เลเยอร์", exact: true }).click();
      const layers = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
      await expect(layers).toBeVisible();
      await controls.getByRole("button", { name: "เลเยอร์", exact: true }).click();
      await expect(layers).toBeHidden();
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`atlas-overview-${theme}-${width}.png`) });
      await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
      const reports = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
      await reports.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
      const detail = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
      await expect(detail.getByRole("heading", { name: "รายละเอียดน้ำท่วม" })).toBeVisible();
      await expect(detail.locator(".citizen-incident-facts")).toContainText("30");
      await expect(detail.locator(".citizen-route-id")).toHaveCSS("background-color", "rgb(17, 57, 71)");
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`atlas-flood-${theme}-${width}.png`) });
      await detail.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();
      if (await reports.isVisible()) await reports.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
      await expect(nav).toBeVisible();
      if (width === 390) {
        await nav.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
        await reports.getByRole("button", { name: /ทางเลี่ยงหนองจิก ทดสอบ/ }).click();
        const detour = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
        await expect(detour.getByRole("heading", { name: "ทางเลี่ยงหนองจิก ทดสอบ" })).toBeVisible();
        await expect(detour.getByRole("button", { name: "ดูตำแหน่งบนแผนที่" })).toBeEnabled();
        await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`atlas-detour-${theme}-${width}.png`) });
        await detour.getByRole("button", { name: "ปิดหน้าต่างคำแนะนำทางเลี่ยง" }).click();
        if (await reports.isVisible()) await reports.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(header.locator(".citizen-field-sign")).toBeHidden();
});

test("citizen mobile masthead preserves the full Thai brand and exposes hotline in Contacts", async ({ page, isMobile }, testInfo) => {
  const name = "ระบบติดตามโครงข่ายทางหลวงและการจัดการอุทกภัย";
  const org = "แขวงทางหลวงปัตตานี กรมทางหลวง";
  const phone = "073-123456";
  await page.setViewportSize({ width: 320, height: 568 });
  const nav = await openFixture(page, () => ({ ...payload, systemSettings: { name, org, phone } }));
  const header = page.locator(".citizen-header");
  const title = header.getByText(name, { exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("font-size", "12px");
  const showsFullBrand = () => header.evaluate((el) => {
    const symbol = el.querySelector(".citizen-theme-switch")!.getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll(".citizen-brand-name,h1"), (label) => {
      const text = document.createRange();
      text.selectNodeContents(label);
      return Array.from(text.getClientRects()).every(rect => rect.left >= bounds.left && rect.right <= symbol.left &&
        rect.top >= bounds.top && rect.bottom <= bounds.bottom);
    }).every(Boolean);
  });
  for (const [tone, name] of [["moon", "เปิดธีมมืด"], ["sun", "เปิดธีมสว่าง"]] as const) {
    const switcher = header.getByRole("button", { name, exact: true });
    await expect(switcher.locator(`[data-tone=${tone}]`)).toBeVisible();
    await expect(switcher).toHaveCSS("border-top-width", "0px");
    await expect(header.getByRole("link", { name: "โทรสายด่วน " + phone })).toBeHidden();
    const r = (await switcher.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(await showsFullBrand()).toBe(true);
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`masthead-${tone}-320.png`) });
    if (isMobile) await switcher.tap();
    else { await switcher.focus(); await page.keyboard.press("Space"); }
  }
  await expect(header.getByRole("button", { name: "เปิดธีมมืด", exact: true })).toHaveAttribute("aria-pressed", "false");
  await nav.getByRole("button", { name: "ติดต่อ", exact: true }).click();
  const contacts = page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" });
  await expect(contacts.getByRole("link", { name: "โทรสายด่วน " + phone })).toHaveAttribute("href", "tel:" + phone);
  await expect(contacts.getByRole("link", { name: /โทรสอบถาม/ }).first()).toHaveAttribute("href", "tel:073123456");
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("masthead-contacts-320.png") });
  await contacts.getByRole("button", { name: "ปิดหน้าติดต่อ" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(header.getByRole("link", { name: "โทรสายด่วน " + phone })).toBeVisible();
  await expect(header.locator(".citizen-themed-symbol")).toBeHidden();
});

test("citizen glass transmits measurable map pixels and the accessible fallback is solid", async ({ page }) => {
  test.skip(baseline, "New compositing target checked on candidate.");
  await page.setViewportSize({ width: 320, height: 568 });
  const nav = await openFixture(page);
  const map = page.locator(".leaflet-container").first();
  async function sampleMapThroughNav(underlay: string) {
    await map.evaluate((el, tone) => {
      // Leaflet may render opaque provider/placeholder panes over its background.
      // Give this fixture its own flat plane above those panes, but still under
      // the real navigator and inside the production map's stacking context.
      let plane = el.querySelector<HTMLElement>("[data-glass-test-underlay]");
      if (!plane) {
        plane = document.createElement("div");
        plane.dataset.glassTestUnderlay = "";
        plane.style.cssText = "position:absolute;inset:0;z-index:9999;forced-color-adjust:none";
        el.appendChild(plane);
      }
      plane.style.setProperty("background-color", tone, "important");
      // Wait for this fixture change to reach the compositor before capturing.
      return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, underlay);
    const points = await nav.evaluate((element) => {
      const rail = element.getBoundingClientRect();
      const last = element.querySelector("button:last-child")!.getBoundingClientRect();
      // Use the nav's reserved edge padding, not a position inside a label.
      const x = Math.floor((last.right + rail.right) / 2);
      const y = Math.floor(rail.top + rail.height * .35);
      if (document.elementFromPoint(x, y) !== element) throw new Error("Glass probe is covered by a foreground control");
      const reference = { x, y: Math.floor(rail.top - 30) };
      const hit = document.elementFromPoint(reference.x, reference.y);
      if (!hit?.matches("[data-glass-test-underlay]")) {
        throw new Error(`Map paint reference is covered by ${hit?.outerHTML.slice(0, 180)}`);
      }
      return { rail: { x, y }, underlay: reference, viewport: { w: innerWidth, h: innerHeight } };
    });
    // Capture the complete viewport so the backing map remains in the paint
    // viewport even on headless compositors. Read a strip of actual raster pixels.
    const screenshot = await page.screenshot({ scale: "css", animations: "disabled" });
    return page.evaluate(async ({ png, points }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + png;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const sample = ({ x, y }: { x: number; y: number }) => {
        const scaleX = img.width / points.viewport.w;
        const scaleY = img.height / points.viewport.h;
        const pixels = ctx.getImageData(Math.floor(x * scaleX), Math.floor(y * scaleY), 1, 5).data;
        return [0, 1, 2].map((channel) => Array.from({ length: 5 }, (_, row) => pixels[4 * row + channel])
          .reduce((sum, value) => sum + value, 0) / 5);
      };
      return { rail: sample(points.rail), underlay: sample(points.underlay) };
    }, { png: screenshot.toString("base64"), points });
  }

  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    for (const [w, h] of [[320, 568], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await expect(nav).toHaveCSS("backdrop-filter", "blur(5px) saturate(1.25)");
      const ink = await sampleMapThroughNav("black");
      const paper = await sampleMapThroughNav("white");
      const channelDelta = (light: number[], dark: number[]) =>
        Math.min(...light.map((channel, i) => channel - dark[i]));
      expect(channelDelta(paper.underlay, ink.underlay), `map fixture at ${theme}/${w}, black ${ink.underlay}, white ${paper.underlay}`).toBeGreaterThanOrEqual(220);
      // The light bar must visibly transmit more of the same backing map.
      expect(channelDelta(paper.rail, ink.rail),
        `glass at ${theme}/${w}, black ${ink.rail}, white ${paper.rail}`).toBeGreaterThanOrEqual(theme === "light" ? 100 : 60);
    }
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(nav).toHaveCSS("backdrop-filter", "none");
  expect((await sampleMapThroughNav("white")).rail).toEqual((await sampleMapThroughNav("black")).rail);
});
