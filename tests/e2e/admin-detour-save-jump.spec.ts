import { expect, test } from "@playwright/test";

test("detour Save shortcut scrolls only the form, leaves the map in place and does not submit", async ({ page, baseURL, isMobile }) => {
  const origin = new URL(baseURL!).origin;
  const writes: string[] = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action } = req.method() === "POST" ? req.postDataJSON() || {} : {};
      if (action === "upsertRouteAction" || action === "uploadExternalMediaAction") writes.push(action);
      return route.fulfill({ json: { updatedAt: "2026-11-27T00:00:00Z", floodRoutes: [], detourRoutes: [],
        timelineUpdates: [], mitigationProjects: [], offices: [], highwayLayers: [], mapStyles: null,
        systemSettings: { name: "ทดสอบ", org: "ทดสอบ", phone: "1586" } } });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto((process.env.BASE_PATH || "") + "/admin/");
  await page.getByRole("button", { name: "ทางเลี่ยง", exact: true }).click();
  const jump = page.getByRole("button", { name: "เลือกวิธีบันทึกและเผยแพร่", exact: true });
  const destination = page.getByRole("region", { name: "เลือกวิธีบันทึกและเผยแพร่", exact: true });
  await expect(jump).toBeVisible();
  const readLayout = () => jump.evaluate((el) => {
    const pane = el.closest(".doh-form")!;
    const map = document.querySelector("[data-hdms-map]");
    return { pane: Math.round(pane.scrollTop), shell: Math.round(pane.getBoundingClientRect().top),
      map: Math.round(map?.getBoundingClientRect().top ?? 0), page: scrollY };
  });
  const before = await readLayout();
  if (isMobile) await jump.tap();
  else { await jump.focus(); await jump.press("Enter"); }
  await expect(destination).toBeFocused();
  await expect(destination).toBeInViewport();
  const after = await readLayout();
  if (!isMobile) {
    expect(after.pane).toBeGreaterThan(before.pane);
    expect(after.page).toBe(before.page);
    expect(after.shell).toBe(before.shell);
    expect(after.map).toBe(before.map);
  }
  expect(writes).toEqual([]);
});
