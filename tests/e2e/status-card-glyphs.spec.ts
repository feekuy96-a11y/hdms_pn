import { expect, test } from "@playwright/test";
import { MAP_STATUS_GLYPHS } from "../../lib/map-status-glyphs";

test("status cards share five pictograms and active filters invert color without adding a separate map badge", async ({ page, baseURL, isMobile }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const values = ["CLOSED", "NO_SMALL_VEHICLES", "ONE_LANE", "LIGHT_VEHICLES_ONLY", "PASSABLE"];
  await page.route(/\/functions\/v1\/hdms-api\/?$/, (route) => route.fulfill({ json: {
    floodRoutes: values.map((traffic_status, i) => {
      const lng = 101.12 + i * .06;
      return {
        id: "CARD-" + i, route_no: String(40 + i), section_name: "ช่วงทดสอบ", km_start: "0+100", km_end: "0+400",
        is_active: true, traffic_status, lon_start: lng, lat_start: 6.835, lon_end: lng + .008, lat_end: 6.839,
        water_level_cm: 25, coordinates_json: [[lng, 6.835], [lng + .008, 6.839]], direction_meta: { eventId: "CARD-EVENT-" + i },
      };
    }),
    highwayLayers: [], detourRoutes: [], timelineUpdates: [], offices: [], mitigationProjects: [],
    systemSettings: { name: "แผนที่ทดสอบ", org: "หน่วยงานทดสอบ", phone: "1586" },
  } }));
  await page.setViewportSize(isMobile ? { width: Number(process.env.HDMS_CARD_WIDTH || 320), height: Number(process.env.HDMS_CARD_WIDTH || 320) > 320 ? 844 : 568 } : { width: 1440, height: 900 });
  await page.goto((process.env.BASE_PATH || "") + "/");
  const list = page.getByRole("list", { name: "สรุปสถานการณ์ทุกจุด" });
  const nav = page.getByRole("navigation", { name: "เมนูประชาชน" });
  const drawer = page.getByRole("dialog", { name: "รายการสายทางและจุดเฝ้าระวัง" });
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "เปิดธีมมืด" }).click();
    const summary = page.getByRole("complementary", { name: "สรุปสถานการณ์บนแผนที่" });
    await summary.getByRole("button", { name: "น้ำท่วม 5 จุด", exact: true }).click();
    const filterIcons = await summary.locator("[data-traffic-glyph]").evaluateAll((icons) =>
      icons.map(svg => [svg.getAttribute("data-traffic-glyph"), svg.querySelector(".hdms-status-sign-face")?.getAttribute("d")]));
    await expect(summary.locator("[data-passability-tone]")).toHaveCount(5);
    await summary.locator("[aria-label='กรองตามการผ่านทาง']").screenshot({ path: testInfo.outputPath(`map-summary-${theme}.png`), animations: "disabled" });
    const selected = summary.locator('[data-passability-tone="red"]');
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(selected).toHaveCSS("background-image", "none");
    await expect(selected).toHaveCSS("background-color", await selected.evaluate(el => {
      const node = document.createElement("i");
      node.style.color = "var(--brand-active-bg)";
      el.append(node);
      const color = getComputedStyle(node).color;
      node.remove();
      return color;
    }));
    await expect(selected).toHaveCSS("color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(20, 35, 49)");
    await expect(selected.locator(".citizen-flood-filter-count")).toHaveCSS("color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(20, 35, 49)");
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "false");
    await expect(selected).toHaveCSS("background-image", /linear-gradient/);
    await summary.getByRole("button", { name: "น้ำท่วม 5 จุด", exact: true }).click();
    if (isMobile) await nav.getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
    for (const key of ["red", "orange", "amber", "sky", "emerald"] as const) {
      const glyph = MAP_STATUS_GLYPHS[key];
      const card = list.locator(`[data-traffic-card="${key}"]`);
      await expect(card.locator("strong")).toHaveText("1");
      expect(filterIcons).toContainEqual([glyph.key, glyph.face]);
      await expect(page.locator(".doh-type-flood .hdms-status-sign")).toHaveCount(0);
      const badge = card.locator(`[data-traffic-glyph="${glyph.key}"]`);
      for (const layer of ["face", "inset", "route"] as const) {
        await expect(badge.locator(`.hdms-status-sign-${layer}`)).toHaveAttribute("d", glyph[layer]);
      }
      const reads = await badge.evaluate((svg) => {
        const colors = [".hdms-status-sign-face", ".hdms-status-sign-inset"].map((selector) =>
          getComputedStyle(svg.querySelector(selector)!).fill);
        const fg = getComputedStyle(svg.querySelector(".hdms-status-sign-route")!).stroke;
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const lum = (color: string) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((v) => v / 255)
            .reduce((s, v, i) => s + [0.2126, .7152, .0722][i] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4), 0);
        };
        const ink = lum(fg);
        return Math.min(...colors.map((color) => {
          const bg = lum(color);
          return (Math.max(bg, ink) + .05) / (Math.min(bg, ink) + .05);
        }));
      });
      expect(reads).toBeGreaterThanOrEqual(4.5);
      await badge.screenshot({ path: testInfo.outputPath(`status-sign-${key}-${theme}.png`), animations: "disabled" });
    }
    await list.screenshot({ path: testInfo.outputPath(`status-cards-${theme}.png`), animations: "disabled" });
    if (isMobile) await drawer.getByRole("button", { name: "ปิดรายการสายทาง" }).click();
  }
});
