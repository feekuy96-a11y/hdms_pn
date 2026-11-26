import { expect, test } from "@playwright/test";
import { resolveCitizenOfficeDirectory } from "../../components/public/citizen-office-directory";

const base = process.env.BASE_PATH || "";
const date = "2026-11-25T07:20:00.000Z";
const coords = [[101.186, 6.881], [101.205, 6.892]];
const payload = {
  updatedAt: date,
  floodRoutes: [{
    id: "F43", route_no: "43", section_name: "หนองจิก ทดสอบ", km_start: "97+127", km_end: "97+252",
    lat_start: 6.881, lon_start: 101.186, lat_end: 6.892, lon_end: 101.205, coordinates_json: coords,
    water_level_cm: 30, traffic_status: "WARNING", direction_meta: {}, latest_photo_url: "", is_active: true, updated_at: date,
  }],
  detourRoutes: [{
    id: "D43", flood_id_ref: "F43", route_name: "ทางเลี่ยงหนองจิก ทดสอบ", description: "1. ออกจากถนนสายหลัก\n2. กลับเข้าถนนสายหลัก",
    direction_mode: "FORWARD_ONLY", is_active: true, updated_at: date, lat_start: 6.881, lon_start: 101.186,
    lat_end: 6.892, lon_end: 101.205, coordinates_json: coords,
  }],
  highwayLayers: [], timelineUpdates: [], mitigationProjects: [], offices: [], mapStyles: null,
  systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวง", phone: "1586" },
};

test("citizen shell keeps one map and the selected flood across phone, tablet and desktop widths", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  await expect(page.getByText("น้ำท่วม 1 จุด")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  const flood = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  const map = page.locator(".leaflet-container").first();
  await expect(map).toBeVisible();
  const originalMap = await map.elementHandle();
  await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม" }).click();
  await expect(drawer).toBeVisible();
  await expect(nav).toHaveCount(0);
  await drawer.getByRole("button", { name: /เส้นทางเลี่ยง 1 สาย/ }).click();
  await expect(flood).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await flood.getByRole("button", { name: /ทางเลี่ยงหนองจิก ทดสอบ/ }).click();
  await expect(flood.getByRole("link", { name: "ดูบน Google Maps" })).toBeVisible();

  const zoom = () => page.locator("[data-public-layer-opacities]").evaluate((el) =>
    JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}").zoom as number
  );
  await expect.poll(zoom).toBe(13); // Wait for the existing Leaflet flight to settle before measuring resize.
  const focusedZoom = await zoom();
  for (const [width, height] of [[320,568],[360,640],[480,800],[568,320],[667,375],[768,1024],[820,1180],[900,600],[980,664],[1023,740],[1024,768],[1100,750],[1280,800],[1440,900],[768,1024],[390,844]]) {
    await page.setViewportSize({ width, height });
    await expect(flood).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(flood.getByRole("button", { name: /ทางเลี่ยงหนองจิก ทดสอบ/ })).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.evaluate((node) => node.isConnected, originalMap)).toBe(true);
    expect(await zoom()).toBe(focusedZoom);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await flood.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /หนองจิก ทดสอบ/, pressed: true })).toBeVisible();
  await page.setViewportSize({ width: 568, height: 320 });
  await drawer.getByRole("button", { name: /เส้นทางเลี่ยง 1 สาย/ }).click();
  await expect(flood).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await flood.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();
  await drawer.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  await nav.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  await drawer.getByRole("button", { name: /ทางเลี่ยงหนองจิก ทดสอบ/ }).click();
  const detour = page.getByRole("dialog", { name: /คำแนะนำเส้นทางเลี่ยง/ });
  await expect(detour).toBeVisible();
  await expect(detour.getByRole("button", { name: /ขากลับ/ })).toBeDisabled();
  await expect(drawer).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
});

test("mobile shortcuts fit with 44px hit regions and desktop keeps the existing layout", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(base + "/");
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  for (const [width, height] of [[320,568],[390,844],[568,320],[744,1133],[820,1180],[1023,768]]) {
    await page.setViewportSize({ width, height });
    await expect(nav).toBeVisible();
    const fits = await nav.locator("button, a").evaluateAll((els) => els.every(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width/2,r.top + r.height/2);
      return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
        && !!hit && el.contains(hit);
    }));
    expect(fits).toBe(true);
    await expect(nav.getByRole("button", { name: "ติดต่อ", exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nav).toBeHidden();
  await expect(page.getByPlaceholder(/ค้นหาสายทาง.*ทล[.]43/)).toBeVisible();
  await expect(page.getByRole("link", { name: "โทรสายด่วน 1586", exact: true })).toBeVisible();
});

test("citizen theme inverts active filters without dimming the basemap or overlays", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  const shell = page.locator(".citizen-ui");
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  await expect(shell).toHaveAttribute("data-citizen-theme", "light");
  await expect(nav).toBeVisible();
  const basemap = page.locator(".leaflet-container").first();
  const pane = basemap.locator(".leaflet-tile-pane");
  await expect(pane).toHaveCSS("filter", "none");
  const mapLight = await basemap.evaluate(el => getComputedStyle(el).backgroundColor);
  const summary = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
  const filter = summary.locator("[data-map-flood-status]").first();
  const activeColors = () => filter.evaluate(el => {
    const css = getComputedStyle(el);
    return { bg: css.backgroundColor, text: css.color };
  });
  const contrast = (pair: Awaited<ReturnType<typeof activeColors>>) => {
    const luminance = (color: string) => (color.match(/\d+/g) || []).slice(0, 3)
      .map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [a, b] = [luminance(pair.bg), luminance(pair.text)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  await summary.getByRole("button", { name: /น้ำท่วม \d+ จุด/ }).click();
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(filter.locator("svg.citizen-flood-filter-icon")).toBeVisible();
  const lightPair = await activeColors();
  expect(contrast(lightPair)).toBeGreaterThanOrEqual(4.5);
  const light = await shell.evaluate(el => getComputedStyle(el).getPropertyValue("--surface-panel").trim());
  await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
  await expect(shell).toHaveAttribute("data-citizen-theme", "dark");
  expect(await shell.evaluate(el => getComputedStyle(el).getPropertyValue("--surface-panel").trim())).not.toBe(light);
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  const darkPair = await activeColors();
  expect(darkPair).not.toEqual(lightPair);
  expect(contrast(darkPair)).toBeGreaterThanOrEqual(4.5);
  await expect(pane).toHaveCSS("filter", "none");
  await expect(basemap).toHaveCSS("filter", "none");
  await expect(basemap.locator(".leaflet-overlay-pane")).toHaveCSS("filter", "none");
  await expect(basemap.locator(".leaflet-marker-pane")).toHaveCSS("filter", "none");
  await expect(basemap).toHaveCSS("background-color", mapLight);
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  await layers.click();
  const legend = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
  await expect(legend).toHaveCSS("background-color", "rgb(26, 45, 62)");
  const street = legend.getByRole("button", { name: "ถนน OSM", exact: true });
  await street.click();
  await expect(street).toHaveCSS("background-color", "rgb(172, 209, 226)");
  await expect(street).toHaveAttribute("aria-pressed", "true");
  await expect(legend.locator(".hdms-map-symbol svg").first()).toBeVisible();
  await layers.click();
  await nav.getByRole("button", { name: "ติดต่อ", exact: true }).click();
  const contacts = page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" });
  await expect(contacts).toHaveAttribute("data-hdms-popup", "panel");
  await expect(contacts).toHaveCSS("background-color", "rgb(26, 45, 62)");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(shell).toHaveAttribute("data-citizen-theme", "dark");
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "เปิดธีมสว่าง" }).click();
  await expect(shell).toHaveAttribute("data-citizen-theme", "light");
  await expect(pane).toHaveCSS("filter", "none");
  await nav.getByRole("button", { name: "ติดต่อ", exact: true }).click();
  await expect(contacts).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

for (const [status, label] of [
  ["CLOSED", "ผ่านไม่ได้"],
  ["PENDING_VERIFICATION", "รอตรวจสอบสถานะ"],
] as const) {
  test(`public flood popup keeps ${status} and the incident details readable in both themes`, async ({ page }) => {
    const criticalFlood = { ...payload.floodRoutes[0], traffic_status: status, direction_meta: { trafficStatusDetail: status }, subdistrict: "บ้านนอก", district: "ปะนาเระ", province: "ปัตตานี" };
    await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: { ...payload, floodRoutes: [criticalFlood] } }));
    await page.goto(base + "/");
    const pin = page.locator(".doh-map-capsule-pin").first();
    const popup = page.locator(".doh-flood-leaflet-popup");

    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
      await pin.click();
      await expect(popup).toHaveClass(/hdms-popup-map/);
      await expect(popup.locator(".leaflet-popup-content-wrapper")).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(26, 45, 62)");
      await expect(popup.getByText("ต.บ้านนอก อ.ปะนาเระ จ.ปัตตานี")).toBeVisible();
      await expect(popup.getByText(label, { exact: true })).toBeVisible();
      for (const selector of [".doh-flood-popup-area span", ".doh-flood-popup-water", ".doh-flood-popup-status", ".leaflet-popup-close-button"]) {
        const contrast = await popup.locator(selector).evaluate(element => {
          const rgb = (color: string) => (color.match(/[\d.]+/g) || []).map(Number);
          const luma = (color: number[]) => color.slice(0, 3).reduce((sum, byte, channel) => {
            const n = byte / 255;
            return sum + (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][channel];
          }, 0);
          const foreground = luma(rgb(getComputedStyle(element).color));
          // The transparent Leaflet close link is a sibling painted over the popup surface.
          const backdrop = element.matches(".leaflet-popup-close-button")
            ? element.closest(".leaflet-popup")?.querySelector(".leaflet-popup-content-wrapper") ?? element
            : element;
          for (let node: Element | null = backdrop; node; node = node.parentElement) {
            const bg = rgb(getComputedStyle(node).backgroundColor);
            if (bg.length === 3 || bg[3] === 1) {
              const background = luma(bg);
              return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
            }
          }
          return 0;
        });
        expect(contrast, theme + " " + selector).toBeGreaterThanOrEqual(4.5);
      }
      await popup.locator(".leaflet-popup-close-button").click();
      await expect(popup).toHaveCount(0);
    }
  });
}

test("flood popup close is borderless and clears the photo and heading", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
  await page.goto(base + "/");
  await page.locator(".doh-map-capsule-pin").first().press("Enter");
  const popup = page.locator(".doh-flood-leaflet-popup");
  const close = popup.getByRole("button", { name: "Close popup" });
  await expect(close).toHaveCSS("border-top-width", "0px");
  await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const x = (await close.boundingBox())!;
  const heading = (await popup.locator(".hdms-map-popup-heading > div").boundingBox())!;
  const photo = (await popup.locator(".doh-flood-popup-card > div").nth(1).boundingBox())!;
  expect(x.x).toBeGreaterThanOrEqual(heading.x + heading.width);
  expect(x.y + x.height).toBeLessThanOrEqual(photo.y);
  await close.press("Enter");
  await expect(popup).toHaveCount(0);
});

test("office map popup uses a borderless close control without covering the office name", async ({ page }) => {
  const name = "แขวงทางหลวงปัตตานี (สำนักงานใหญ่สำหรับทดสอบชื่อยาว)";
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: {
    ...payload,
    offices: [{ id: "OFFICE-QA", type: "HEADQUARTERS", name, address: "ถนนทดสอบ", phone: "073-336051", lat: 6.81, lon: 101.17, is_active: true }],
  } }));
  await page.goto(base + "/");
  await page.locator(".doh-office-marker").press("Enter");
  const popup = page.locator(".doh-office-leaflet-popup");
  const close = popup.getByRole("button", { name: "Close popup" });
  const title = popup.getByRole("heading", { name, exact: true });
  await expect(title).toBeVisible();
  await expect(close).toHaveCSS("border-top-width", "0px");
  await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(43.99);
  expect((await title.boundingBox())!.x + (await title.boundingBox())!.width).toBeLessThan((await close.boundingBox())!.x);
  await close.press("Enter");
  await expect(popup).toHaveCount(0);
});

test("citizen directory lists six offices in order and enables only verified stored actions", async ({ page, isMobile }) => {
  const officeNames = ["แขวงทางหลวงปัตตานี", "หมวดทางหลวงโคกโพธิ์", "หมวดทางหลวงหนองจิก", "หมวดทางหลวงปะนาเระ", "หมวดทางหลวงสายบุรี", "หมวดทางหลวงยะรัง"];
  const records = officeNames.map((name, i) => ({
    id: "fixture-" + i, name, type: i === 0 ? "HEADQUARTERS" : "SUBDIVISION",
    address: "ตำแหน่งจำลอง " + (i + 1), phone: "๐๗๓-๑๒๓๔๕๖", lat: 6.81 + i * 0.01, lon: 101.17 + i * 0.01, is_active: true,
  }));
  records[0].name = "สำนักงาน แขวงทางหลวง ปัตตานี (สำนักงานใหญ่)";
  records[0].phone = "๐๗๓-๑๒๓๔๕๖ ต่อ ๑๐๓";
  records[1].phone = "0773-123456";
  records[3].phone = "+66 81 123 4567";
  records[2].lat = 101.17; // Inverted / invalid coordinate must not enable Directions.
  const offices = [...records.slice(0,5).reverse(), { ...records[4], id: "duplicate" },
    { ...records[0], id: "nonpublic", type: "SERVICE_POINT" },
    { ...records[5], id: "inactive", is_active: false },
  ];
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: { ...payload, offices } }));
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 568 : 900 });
  await page.goto(base + "/");
  const opener = isMobile
    ? page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "ติดต่อ", exact: true })
    : page.getByRole("button", { name: "ติดต่อ", exact: true });
  if (!isMobile) await expect(page.getByRole("link", { name: "โทรสายด่วน 1586", exact: true })).toHaveAttribute("href","tel:1586");
  await opener.click();
  const directory = page.getByRole("dialog", { name: "ติดต่อหน่วยงาน" });
  await expect(directory).toBeVisible();
  if (isMobile) await expect(directory.getByRole("link", { name: "โทรสายด่วน 1586", exact: true })).toHaveAttribute("href","tel:1586");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(await directory.locator("article h3").allTextContents()).toEqual(officeNames);
  const hq = directory.locator("article").filter({ hasText: officeNames[0] });
  await expect(hq.getByRole("link", { name: /โทรสอบถาม/ })).toHaveAttribute("href", "tel:073123456");
  await expect(hq).toContainText("ต่อ ๑๐๓");
  const href = await hq.getByRole("link", { name: /นำทาง/ }).getAttribute("href");
  const parsed = new URL(href!);
  expect(parsed.hostname).toBe("www.google.com");
  expect(parsed.searchParams.get("destination")).toBe("6.81,101.17");
  // Link destinations are inspected only, never dialed or navigated.
  await expect(directory.locator("article").nth(1).getByRole("button", { name: /โทรสอบถาม/ })).toBeDisabled();
  await expect(directory.locator("article").nth(1)).toContainText("0773-123456");
  await expect(directory.locator("article").nth(1)).toContainText("รูปแบบหมายเลขไม่ถูกต้อง");
  await expect(directory.locator("article").nth(1).getByRole("link", { name: /นำทาง/ })).toBeVisible();
  await expect(directory.locator("article").nth(3).getByRole("link", { name: /โทรสอบถาม/ })).toHaveAttribute("href", "tel:+66811234567");
  await expect(directory.locator("article").nth(2).getByRole("button", { name: /นำทาง/ })).toBeDisabled();
  await expect(directory.locator("article").nth(4)).toContainText("ยังยืนยันข้อมูลสำนักงานไม่ได้");
  await expect(directory.locator("article").nth(5)).toContainText("ยังไม่มีข้อมูลสำนักงาน");
  const closeDirectory = directory.getByRole("button", { name: "ปิดหน้าติดต่อ" });
  const lastLink = directory.getByRole("link").last();
  await closeDirectory.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(lastLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeDirectory).toBeFocused();

  await directory.locator("article").last().scrollIntoViewIfNeeded();
  expect(await directory.locator(".citizen-office-scroll").evaluate(el => el.scrollHeight >= el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(isMobile ? 320 : 1280);
  await page.keyboard.press("Escape");
  await expect(directory).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("citizen directory rejects conflicting HQ aliases and ambiguous multiple numbers", () => {
  const hq = { id: "mock-hq", name: "แขวงทางหลวงปัตตานี", type: "HEADQUARTERS" as const,
    address: "ที่อยู่สมมติ", phone: "073-123456", lat: 6.88, lon: 101.20, is_active: true };
  const alternate = { ...hq, id: "mock-another-hq", name: "แขวงทางหลวงปัตตานี (สำนักงานใหญ่)" };
  expect(resolveCitizenOfficeDirectory([hq, alternate])[0]).toMatchObject({ availability: "ambiguous", tel: null, directions: null });
  expect(resolveCitizenOfficeDirectory([{ ...hq, phone: "073-123456 / 073-654321" }])[0].tel).toBeNull();
  expect(resolveCitizenOfficeDirectory([{ ...hq, phone: "+66 73 123456 ext. 103" }])[0].tel).toBe("tel:+6673123456");
});

test("map-first hierarchy keeps travel status and source time above the detour list", async ({ page, isMobile }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
  await page.goto(base + "/");
  const map = page.getByRole("region", { name: "แผนที่และข้อมูลการเดินทาง" });
  await expect(map).toBeVisible();
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
  if (isMobile) {
    await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม" }).click();
    await expect(page.getByRole("heading", { name: "เหตุการณ์น้ำท่วม", exact: true })).toBeVisible();
  } else {
    const dock = page.locator(".citizen-sidebar");
    await expect(dock.getByRole("heading", { name: "ตรวจสอบเส้นทาง" })).toBeVisible();
    expect((await dock.boundingBox())!.x).toBeLessThan((await map.boundingBox())!.x);
  }
  const card = page.locator(".citizen-card:visible").first();
  await expect(card.locator(".citizen-flood-row-top")).toContainText("อัปเดต");
  await card.getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  const detail = page.getByRole("dialog", { name: /รายละเอียดจุดน้ำท่วม/ });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".citizen-incident-details")).toContainText("อัปเดตล่าสุด");
  await expect(detail.locator(".citizen-incident-facts")).toContainText("30");
  expect(await detail.evaluate(root => {
    const photo = root.querySelector(".citizen-incident-photo")!;
    const metadata = root.querySelector(".citizen-incident-details")!;
    const facts = root.querySelector(".citizen-incident-facts")!;
    const detour = root.querySelector("#dossier-detour-section")!;
    return Boolean(photo.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean(metadata.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean(facts.compareDocumentPosition(detour) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
});

test("public route dock moves left on desktop without changing mobile navigation", async ({ page }) => {
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + "/");
  const dock = page.locator("#public-map-route-pane");
  const map = page.locator("[data-hdms-map]");
  const tools = map.getByRole("group", { name: "เครื่องมือแผนที่" });
  await expect(dock).toBeVisible();
  const [d, m, t] = await Promise.all([dock.boundingBox(), map.boundingBox(), tools.boundingBox()]);
  expect(d!.x + d!.width).toBeLessThanOrEqual(m!.x);
  expect(m!.x + m!.width - t!.x - t!.width).toBeLessThanOrEqual(14);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dock).toBeHidden();
  await expect(map).toBeVisible();
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  await expect(page.getByRole("heading", { name: "เหตุการณ์น้ำท่วม", exact: true })).toBeVisible();
});

test("public map starts with four grouped tools and keeps one layer panel and the same viewport", async ({ page, isMobile }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 568 : 900 });
  await page.goto(base + "/");
  const map = page.locator(".leaflet-container").first();
  const tools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const layers = tools.getByRole("button", { name: "เลเยอร์", exact: true });
  const panel = page.getByRole("region", { name: "เลเยอร์และสัญลักษณ์แผนที่" });
  await expect(map).toBeVisible();
  await expect(tools.getByRole("button")).toHaveCount(4);
  const assertVerticalControlHits = () => tools.getByRole("button").evaluateAll((buttons) => {
    const rects = buttons.map((button) => button.getBoundingClientRect());
    return buttons.every((button, i) => {
      const r = rects[i];
      const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
      return button.textContent?.trim() === "" && r.width >= 44 && r.height >= 44 &&
        r.right <= innerWidth && r.bottom <= innerHeight && button.contains(hit) &&
        (i === 0 || (r.y >= rects[i-1].bottom && Math.abs(r.x - rects[i-1].x)<1));
    });
  });
  await expect(tools.getByRole("button", { name: "ตำแหน่งของฉัน", exact: true })).toBeEnabled();
  await expect(layers).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  const root = await map.elementHandle();
  const overlay = page.locator("[data-public-layer-opacities]");
  const zoom = () => overlay.evaluate(el => JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}").zoom as number);
  const initial = await zoom();
  await tools.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(zoom).toBeGreaterThan(initial);
  const current = await zoom();
  for (const [width,height] of [[320,568],[568,320],[768,1024],[1440,900]]) {
    await page.setViewportSize({ width,height });
    await expect.poll(assertVerticalControlHits).toBe(true);
    await layers.click();
    await expect.poll(assertVerticalControlHits).toBe(true);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCount(1);
    await expect(layers).toHaveAttribute("aria-expanded", "true");
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual((await tools.boundingBox())!.x);
    await expect(panel.getByRole("checkbox").first()).toBeVisible();
    await expect(panel.getByRole("heading", { name: "แผนที่ฐาน", exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "แสดงบนแผนที่", exact: true })).toBeVisible();
    expect(await panel.locator(".citizen-visibility label").evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 44))).toBe(true);
    await expect(panel.getByRole("button", { name: "Longdo", exact: true })).toBeAttached();
    await expect(panel.getByRole("button", { name: "ดาวเทียม", exact: true })).toBeAttached();
    await panel.getByRole("button", { name: "ถนน OSM", exact: true }).click();
    await expect(panel.getByRole("button", { name: "ถนน OSM", exact: true })).toHaveAttribute("aria-pressed","true");
    await panel.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
    await expect(panel.getByRole("button", { name: "แยกช่วง", exact: true })).toBeVisible();
    await panel.getByText("คำอธิบายสัญลักษณ์", { exact: true }).click();
    await expect(panel.getByText(/หมุดรูปคลื่นระบุจุดน้ำท่วม/)).toBeVisible();
    await layers.click();
    await expect(panel).toHaveCount(0);
    expect(await zoom()).toBe(current);
    expect(await page.evaluate(el=>el.isConnected,root)).toBe(true);
  }
});

test("grouped and split floods use the same wave pin and reveal labels at the same zooms", async ({ page }) => {
  const first = { ...payload.floodRoutes[0], direction_meta: { eventId: "EV-WAVE-PARITY" } };
  await page.route("**/functions/v1/hdms-api", route => route.fulfill({ json: {
    ...payload,
    floodRoutes: [first, { ...first, id: "F43-B", km_start: "97+252", km_end: "97+420", water_level_cm: 45, traffic_status: "CLOSED" }],
  } }));
  await page.goto(base + "/");
  const pins = page.locator(".doh-map-capsule-pin");
  const overlay = page.locator("[data-public-layer-opacities]");
  const zoom = () => overlay.evaluate(el => JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}").zoom as number);
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  const chooseMode = async (name: "รวมเหตุการณ์" | "แยกช่วง") => {
    await layers.click();
    const details = page.getByText("ตั้งค่าเพิ่มเติม", { exact: true });
    const option = page.getByRole("button", { name, exact: true });
    if (!await option.isVisible()) await details.click();
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
    await layers.click();
  };
  // The viewer starts grouped and numbered; users can still turn either option off.
  await expect(pins).toHaveCount(1);
  await layers.click();
  const shields = page.getByRole("checkbox", { name: /หมายเลขทางหลวง/ });
  await expect(shields).toBeChecked();
  await shields.uncheck();
  await expect(shields).not.toBeChecked();
  await shields.check();
  await page.getByText("ตั้งค่าเพิ่มเติม", { exact: true }).click();
  await expect(page.getByRole("button", { name: "รวมเหตุการณ์", exact: true })).toHaveAttribute("aria-pressed", "true");
  await layers.click();
  const wave = () => pins.first().locator(".doh-type-flood-wave svg").evaluate(svg => svg.outerHTML);
  await chooseMode("แยกช่วง");
  await expect(pins).toHaveCount(2);
  const warning = pins.filter({ has: page.locator(".doh-capsule-orange") });
  const closed = pins.filter({ has: page.locator(".doh-capsule-red") });
  for (const pin of [warning, closed]) {
    await expect(pin.locator(".doh-capsule-zoom-far")).toHaveCSS("background-color", "rgb(133, 27, 49)");
  }
  expect(await warning.locator(".doh-type-flood-status").evaluate((el) => getComputedStyle(el).getPropertyValue("--status-sign-color").trim())).toBe("#f97316");
  await expect(warning.locator(".doh-type-flood-status")).toHaveAttribute("data-status-glyph", "vehicle");
  expect(await closed.locator(".doh-type-flood-status").evaluate((el) => getComputedStyle(el).getPropertyValue("--status-sign-color").trim())).toBe("#dc2626");
  await expect(closed.locator(".doh-type-flood-status")).toHaveAttribute("data-status-glyph", "closed");
  await expect(pins.first().locator(".doh-capsule-zoom-far")).toBeVisible();
  const svg = await wave();
  await chooseMode("รวมเหตุการณ์");
  await expect(pins).toHaveCount(1);
  const far = pins.locator(".doh-capsule-zoom-far");
  await expect(far).toBeVisible();
  await expect(far).toHaveCSS("background-color", "rgb(133, 27, 49)");
  await expect(far.locator(".doh-type-flood-status")).toHaveAttribute("data-status-glyph", "closed");
  await expect(far).not.toContainText("ทล.");
  expect(await wave()).toBe(svg);
  await expect(pins).toHaveAttribute("aria-label", /ทล\.43 \(2 ช่วง\).*45 ซม\./);
  await pins.press("Enter");
  const popup = page.locator(".doh-flood-leaflet-popup");
  await expect(popup).toBeVisible();
  await expect(popup.locator(".doh-flood-popup-status")).toHaveText("ผ่านไม่ได้");
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  const zoomTo = async (level: number) => {
    for (let current = await zoom(); current < level; current = await zoom()) {
      await zoomIn.press("Enter");
      await expect.poll(zoom).toBeGreaterThan(current);
    }
  };
  await zoomTo(12);
  const mid = pins.locator(".doh-capsule-zoom-mid");
  await expect(mid).toHaveText("ทล.43");
  expect(await wave()).toBe(svg);
  await expect(popup).toBeVisible();
  await zoomTo(14);
  const near = pins.locator(".doh-capsule-zoom-near");
  await expect(near).toContainText(/ทล\.43[\s\S]*2 ช่วง[\s\S]*45 ซม\./);
  expect(await wave()).toBe(svg);
  await expect(popup).toBeVisible();
});

test("top map filters count logical flood points and avoid changing unrelated detours", async ({ page, isMobile }) => {
  const prototype = payload.floodRoutes[0];
  const statuses = [
    { id: "F-A-left", publicCase: "ช่วงซ้ายรถเล็กผ่านไม่ได้", use: "WARNING", detail: "CAUTION", event: "EV-A" },
    { id: "F-A-right", publicCase: "ช่วงขวารถเล็กผ่านไม่ได้", use: "WARNING", detail: "NO_SMALL_VEHICLES", event: "EV-A" },
    { id: "F-B", publicCase: "หนึ่งช่องทางทดสอบ", use: "ONE_LANE", detail: "ONE_LANE", event: "EV-B" },
    { id: "F-C", publicCase: "ผ่านไม่สะดวกทดสอบ", use: "LIGHT_VEHICLES_ONLY", detail: "LIGHT_VEHICLES_ONLY", event: "EV-C" },
    { id: "F-D", publicCase: "รอตรวจสอบทดสอบ", use: "WARNING", detail: "PENDING_VERIFICATION", event: "EV-D" },
  ];
  const floods = statuses.map((status) => ({ ...prototype, id: status.id, section_name: status.publicCase, traffic_status: status.use,
    direction_meta: { trafficStatusDetail: status.detail, eventId: status.event } }));
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: {
    ...payload, floodRoutes: floods,
    eventSegments: statuses.map(status => ({ flood_id: status.id, event_id: status.event })),
  } }));
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 568 : 900 });
  await page.goto(base + "/");
  const summary = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
  const count = summary.getByRole("button", { name: "น้ำท่วม 4 จุด", exact: true });
  const layers = page.getByRole("button", { name: "เลเยอร์", exact: true });
  await count.click();
  await expect(summary).toContainText("มี 1 จุดรอตรวจสอบสถานะ");
  await expect(summary).toContainText("ทางเลี่ยง 1 เส้นทาง");
  const allowed = summary.getByRole("button", { name: /รถเล็ก(?:ไม่สามารถผ่านได้|ผ่านไม่ได้)/ });
  await expect(allowed).toContainText("1");
  await expect(summary.getByRole("button", { name: /๑ ช่องทาง/ })).toContainText("1");
  await expect(summary.getByRole("button", { name: /รอตรวจสอบ/ })).toContainText("1");
  await allowed.click();
  await expect(summary.getByRole("button", { name:"ล้างตัวกรองสถานะ" })).toBeVisible();
  const opacities = () => page.locator("[data-public-layer-opacities]").evaluate(el =>
    JSON.parse(el.getAttribute("data-public-layer-opacities") || "{}") as { floods: Record<string,number>; detours: Record<string,number> }
  );
  await expect.poll(async () => (await opacities()).floods["F-B"]).toBe(0);
  await expect.poll(async () => (await opacities()).detours.D43).toBeGreaterThan(0);
  await layers.click();
  await expect(summary).toHaveCount(0);
  await layers.click();
  await expect(summary.getByRole("button", { name:"ล้างตัวกรองสถานะ" })).toBeVisible();
  const tools = page.getByRole("group", { name: "เครื่องมือแผนที่" });
  const assertSeparated = async () => {
    const s = (await summary.boundingBox())!;
    const t = (await tools.boundingBox())!;
    expect(s.x + s.width <= t.x || t.x + t.width <= s.x || s.y + s.height <= t.y || t.y + t.height <= s.y).toBe(true);
  };
  await assertSeparated();
  if (isMobile) {
    await page.setViewportSize({ width: 568, height: 320 });
    await assertSeparated();
    await page.getByRole("navigation", { name:"เมนูประชาชน" }).getByRole("button",{ name:"เหตุการณ์น้ำท่วม",exact:true }).click();
    const list = page.getByRole("dialog", { name:"รายการสายทางและจุดเฝ้าระวัง" });
    await expect(list).toContainText("ช่วงซ้ายรถเล็กผ่านไม่ได้");
    await expect(list).not.toContainText("หนึ่งช่องทางทดสอบ");
    await list.getByRole("button", {name:"ปิดรายการสายทาง"}).click();
  } else {
    await expect(page.locator(".citizen-sidebar")).toContainText("ช่วงซ้ายรถเล็กผ่านไม่ได้");
    await expect(page.locator(".citizen-sidebar")).not.toContainText("หนึ่งช่องทางทดสอบ");
  }
  await summary.getByRole("button", { name:"ล้างตัวกรองสถานะ" }).click();
  await expect.poll(async () => (await opacities()).floods["F-B"]).toBeGreaterThan(0);
});

test("separate map summary buttons remain usable during flood breakdown", async ({ page, isMobile }) => {
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: payload }));
  await page.setViewportSize({ width: isMobile ? 320 : 1280, height: isMobile ? 568 : 900 });
  await page.goto(base + "/");
  const summary = page.getByRole("complementary", { name:"สรุปสถานการณ์บนแผนที่" });
  const flood = summary.getByRole("button", { name:"น้ำท่วม 1 จุด", exact:true });
  const detours = summary.getByRole("button", { name:"ทางเลี่ยง 1 เส้นทาง", exact:true });
  await flood.click();
  const breakdown = summary.locator("#citizen-map-status-filters");
  await expect(breakdown).toBeVisible();
  const d = (await detours.boundingBox())!;
  const f = (await flood.boundingBox())!;
  const b = (await breakdown.boundingBox())!;
  expect(f.y).toBe(d.y);
  expect(f.x + f.width).toBeLessThan(d.x);
  expect(d.y + d.height).toBeLessThan(b.y);
  expect(d.height).toBeGreaterThanOrEqual(44);
  expect(await detours.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
  })).toBe(true);
  await detours.click();
  if (isMobile) {
    const drawer = page.getByRole("dialog", { name:"รายการสายทางและจุดเฝ้าระวัง" });
    await expect(drawer.getByRole("heading", { name:"ทางเลี่ยง",exact:true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  } else {
    await expect(page.locator(".citizen-sidebar").getByRole("button", { name:/ทางเลี่ยง \(1\)/, pressed:true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("flood breakdown uses original map colors as accents in both themes", async ({ page }) => {
  const statuses = ["CLOSED", "WARNING", "LIGHT_VEHICLES_ONLY", "ONE_LANE", "PASSABLE"] as const;
  const floods = statuses.map((status, i) => ({ ...payload.floodRoutes[0], id:"status-" + i,
    section_name:"ตัวอย่าง " + i, traffic_status:status, direction_meta:{}, latest_photo_url:"" }));
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json:{ ...payload, floodRoutes:floods } }));
  await page.setViewportSize({ width:320,height:568 });
  await page.goto(base + "/");
  const summary = page.getByRole("complementary",{ name:"สรุปสถานการณ์บนแผนที่" });
  await summary.getByRole("button", {name:"น้ำท่วม 5 จุด",exact:true}).click();
  const rows = summary.locator("[data-map-flood-status]");
  for (const theme of ["light","dark"] as const) {
    if(theme==="dark") await page.getByRole("button",{name:"เปิดธีมมืด"}).click();
    await expect(rows).toHaveCount(5);
    const actual = await rows.evaluateAll(els => els.map(el => ({
      id: el.getAttribute("data-map-flood-status"),
      color: getComputedStyle(el).getPropertyValue("--flood-status-color").trim(),
      swatch:getComputedStyle(el.querySelector(".citizen-flood-filter-swatch")!).backgroundColor,
      ink:getComputedStyle(el).color,
      count:getComputedStyle(el.querySelector(".citizen-flood-filter-count")!).color,
    })));
    const source = (await import("../../lib/flood-event-schema")).DETAILED_TRAFFIC_STATUS_CONFIG;
    for (const row of actual) {
      expect(row.color).toBe(source[row.id as keyof typeof source].hex);
      expect(row.ink).toBe(row.count);
      expect(row.swatch).not.toBe(row.ink);
    }
    const closed = rows.filter({hasText:"ผ่านไม่ได้"}).first();
    await closed.click();
    await expect(closed).toHaveAttribute("aria-pressed","true");
    await closed.click();
    await expect(closed).toHaveAttribute("aria-pressed","false");
  }
});

test("summary holds one unabridged horizontal row with three-digit counts at 320px", async ({ page }) => {
  const floodRoutes = Array.from({length:128}, (_, i) => ({...payload.floodRoutes[0],
    id:"many-f-" + i, coordinates_json:[], lat_start:0, lon_start:0, lat_end:0, lon_end:0 }));
  const detourRoutes = Array.from({length:256}, (_, i) => ({...payload.detourRoutes[0],
    id:"many-d-" + i, flood_id_ref:null, coordinates_json:[], lat_start:0, lon_start:0, lat_end:0, lon_end:0 }));
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json:{...payload, floodRoutes, detourRoutes} }));
  await page.setViewportSize({ width:320,height:568 });
  await page.goto(base + "/");
  const summary = page.getByRole("complementary", { name:"สรุปสถานการณ์บนแผนที่" });
  const flood = summary.getByRole("button", {name:"น้ำท่วม 128 จุด",exact:true});
  const detour = summary.getByRole("button", {name:"ทางเลี่ยง 256 เส้นทาง",exact:true});
  await expect(detour).toBeVisible();
  const tool = page.getByRole("group", { name:"เครื่องมือแผนที่" });
  for (const [width,height,scale] of [[320,568,100],[320,568,125],[320,568,150],[568,320,150],[768,1024,150],[1024,768,100],[1440,900,100]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(percent => { document.documentElement.style.fontSize = `${percent}%`; }, scale);
    expect(await page.locator(".citizen-nav button:visible").evaluateAll(buttons => buttons.every(button =>
      button.scrollWidth <= button.clientWidth && button.getBoundingClientRect().height >= 44
    ))).toBe(true);
    await expect(tool).toBeVisible();
    const f = (await flood.boundingBox())!, d = (await detour.boundingBox())!, t = (await tool.boundingBox())!;
    expect(f.y).toBe(d.y);
    expect(f.x+f.width).toBeLessThan(d.x);
    expect(d.x+d.width).toBeLessThan(t.x);
    expect(d.height).toBeGreaterThanOrEqual(44);
    expect(await detour.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await flood.click();
    const breakdown = summary.locator("#citizen-map-status-filters");
    const b = (await breakdown.boundingBox())!;
    expect(b.y).toBeGreaterThan(d.y+d.height);
    expect(b.x+b.width).toBeLessThan(t.x);
    expect(await detour.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
    })).toBe(true);
    await flood.click();
  }
});

test("traffic cards show all reported buckets and filter accurately with several statuses together", async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const states = [
    { color: "red", use: "CLOSED", detail: "CLOSED", label: "ผ่านไม่ได้", count: 2 },
    { color: "orange", use: "WARNING", detail: "NO_SMALL_VEHICLES", label: "รถเล็กไม่สามารถผ่านได้", count: 1 },
    { color: "amber", use: "ONE_LANE", detail: "ONE_LANE", label: "รถเล็กผ่านได้ ๑ ช่องทาง", count: 2 },
    { color: "sky", use: "LIGHT_VEHICLES_ONLY", detail: "LIGHT_VEHICLES_ONLY", label: "รถทุกชนิดผ่านได้แต่ไม่สะดวก", count: 1 },
    { color: "emerald", use: "PASSABLE", detail: "PASSABLE", label: "ผ่านได้ปกติ", count: 1 },
    { color: "slate", use: "WARNING", detail: "PENDING_VERIFICATION", label: "รอตรวจสอบ", count: 1 },
  ];
  const floods = states.flatMap(item => Array.from({ length: item.count }, (_, index) => ({
    ...payload.floodRoutes[0], id: item.color + index, section_name: `ช่วงทดสอบ-${item.color}-${index + 1}`,
    traffic_status: item.use, direction_meta: { trafficStatusDetail: item.detail },
  })));
  await page.route("**/functions/v1/hdms-api", (route) => route.fulfill({ json: { ...payload, floodRoutes: floods } }));
  await page.setViewportSize(isMobile ? { width: 320, height: 568 } : { width: 1440, height: 900 });
  await page.goto(base + "/");

  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด", exact: true }).click();
    const panel = isMobile
      ? page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" })
      : page.locator(".citizen-sidebar");
    if (isMobile) {
      await page.getByRole("navigation", { name: "เมนูประชาชน" }).getByRole("button", { name: "เหตุการณ์น้ำท่วม" }).click();
    }
    const summary = panel.getByRole("list", { name: "สรุปสถานการณ์ทุกจุด" });
    const stories = panel.locator(".citizen-card");
    await expect(summary.getByRole("button")).toHaveCount(states.length);
    await expect(stories).toHaveCount(floods.length);
    await page.screenshot({ path: testInfo.outputPath(`traffic-cards-${theme}.png`) });
    for (const state of states) {
      const card = summary.getByRole("button", { name: `${state.count} ${state.label}`, exact: true });
      await expect(card).toHaveAttribute("data-traffic-card", state.color);
      expect(await card.evaluate(el => {
        const label = el.querySelector(".citizen-traffic-card-label")!;
        const bounds = el.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(label);
        return bounds.height >= 43.95 && Array.from(text.getClientRects()).every(rect =>
          rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom
        );
      }), state.label).toBe(true);
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await expect(stories).toHaveCount(state.count);
      for (const story of await stories.all()) await expect(story).toContainText(new RegExp(`ช่วงทดสอบ-${state.color}-`));
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "false");
      await expect(stories).toHaveCount(floods.length);
    }
    if (isMobile) await panel.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});
