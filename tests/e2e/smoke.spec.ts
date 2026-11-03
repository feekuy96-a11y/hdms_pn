import { expect, test } from "@playwright/test";
const base = process.env.BASE_PATH || "";

test("public flood map loads without horizontal overflow", async ({ page }) => {
  await page.goto(`${base}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ทางหลวง");
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await page.locator(".leaflet-container").boundingBox())?.height ?? 0).toBeGreaterThan(400);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("admin route requires authentication", async ({ page }) => {
  await page.goto(`${base}/admin/`);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบเจ้าหน้าที่" })).toBeVisible();
});

test("public search exposes a recoverable empty state", async ({ page }) => {
  await page.goto(`${base}/`);
  const mobileList = page.getByRole("button", { name: "ดูรายการสายทาง" });
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await expect(mobileList).toBeVisible();
    await mobileList.click();
  }
  const search = page.locator('input[placeholder*="ค้นหาสายทาง"]:visible').first();
  await search.fill("ไม่มีข้อมูลนี้");
  await expect(page.locator("p:visible, h4:visible").filter({ hasText: /ยังไม่มีรายงานจุดน้ำท่วม|ไม่พบจุดที่ตรงกับตัวกรอง/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).filter({ visible: true }).click();
  await expect(search).toHaveValue("");
});
