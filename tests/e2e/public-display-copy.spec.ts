import { expect, test } from "@playwright/test";
import publicDisplayCopy from "../../config/public-display-copy.json";

test.use({ serviceWorkers: "block" });

test("the public empty flood copy is visible without overflow and retains its safety cue", async ({ page, isMobile }) => {
  const stamp = new Date().toISOString();
  await page.route(/\/functions\/v1\/hdms-api\/?$/, route => route.fulfill({
    json: { updatedAt: stamp, floodRoutes: [], detourRoutes: [], timelineUpdates: [],
      mitigationProjects: [], highwayLayers: [], offices: [], mapStyles: null,
      systemSettings: { name: "ทดสอบระบบทางหลวง", org: "แขวงทางหลวงปัตตานี", phone: "1586" } },
  }));
  await page.goto(`${process.env.BASE_PATH || ""}/`);
  if (isMobile) await page.getByRole("navigation", { name: "เมนูประชาชน" })
    .getByRole("button", { name: "เหตุการณ์น้ำท่วม", exact: true }).click();
  const copy = page.getByText(publicDisplayCopy.emptyFloodReports, { exact: true }).filter({ visible: true });
  await expect(copy).toBeVisible();
  await expect(copy.locator("..")).toContainText("ข้อมูลนี้ไม่ยืนยันว่าทุกเส้นทางปลอดภัย");
  await expect.poll(() => copy.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
