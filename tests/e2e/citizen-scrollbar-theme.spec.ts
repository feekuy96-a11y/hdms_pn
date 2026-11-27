import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`citizen horizontal and vertical scrollbars are visible in ${theme} mode`, async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "The desktop route sidebar is replaced by a drawer on mobile.");
    const origin = new URL(baseURL!).origin;
    const updatedAt = "2026-11-27T00:00:00Z";
    await page.addInitScript((mode) => localStorage.setItem("hdms.citizen.theme", mode), theme);
    await page.setViewportSize({ width: 1440, height: 840 });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/functions/v1/hdms-api")) return url.origin === origin ? route.continue() : route.abort();
      const floodRoutes = Array.from({ length: 9 }, (_, i) => ({
        id: `F-SCROLL-${i}`, route_no: `${4000 + i}`, section_name: `ช่วงทดสอบแถบเลื่อน ${i}`,
        km_start: "1+000", km_end: "2+000", lat_start: 6.82, lon_start: 101.23, lat_end: 6.84, lon_end: 101.25,
        coordinates_json: [[101.23, 6.82], [101.25, 6.84]], water_level_cm: 25,
        traffic_status: "WARNING", is_active: true, updated_at: updatedAt,
      }));
      return route.fulfill({ json: { updatedAt, floodRoutes, detourRoutes: [], offices: [], highwayLayers: [],
        timelineUpdates: [], mitigationProjects: [], mapStyles: null, systemSettings: { name: "ทดสอบ" } } });
    });
    await page.goto((process.env.BASE_PATH || "") + "/");
    await expect(page.locator("[data-citizen-theme]")).toHaveAttribute("data-citizen-theme", theme);
    const rails = page.locator("#public-map-route-pane .hdms-themed-scrollbar");
    await expect(rails).toHaveCount(2);
    const vals = await rails.evaluateAll((nodes) => nodes.map((el, i) => {
      const style = getComputedStyle(el);
      const [thumb, track] = style.scrollbarColor.match(/rgb\([^)]+\)/g) || [];
      const luminance = (value: string | undefined) => {
        if (!value) return Number.NaN;
        return (value.match(/[\d.]+/g) || []).slice(0, 3).map((v) => Number(v) / 255)
          .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          .reduce((sum, v, j) => sum + v * [0.2126, 0.7152, 0.0722][j], 0);
      };
      const a = luminance(thumb), b = luminance(track);
      if (i === 0) el.scrollLeft = 90;
      else el.scrollTop = 90;
      return { thumb, track, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        overflow: i === 0 ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
        moved: i === 0 ? el.scrollLeft : el.scrollTop };
    }));
    for (const v of vals) {
      expect(v.overflow).toBeGreaterThan(0);
      expect(v.moved).toBeGreaterThan(0);
      expect(v.contrast).toBeGreaterThanOrEqual(3);
    }
    expect(vals[0].thumb).toBe(vals[1].thumb);
    expect(vals[0].track).toBe(vals[1].track);
    console.log(theme, vals);
  });
}
