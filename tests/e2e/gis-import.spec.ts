import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("KML import previews a valid route without reloading or crashing", async ({ page }) => {
  await page.goto(`${base}/admin/`);
  const sidebar = page.getByRole("complementary");
  const routeMenu = await sidebar.count()
    ? sidebar.getByRole("button", { name: /โครงข่ายสายทาง/ })
    : page.getByRole("button", { name: "โครงข่ายสายทาง", exact: true });
  await routeMenu.click();

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
      <name>QA KML route</name><LineString><coordinates>
      101.2440,6.8700,0 101.2480,6.8740,0 101.2520,6.8780,0
      </coordinates></LineString>
    </Placemark></Document></kml>`;

  await page.locator('input[type="file"]').setInputFiles({
    name: "qa-route.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(kml),
  });

  await expect(page.getByText("ตรวจสอบโครงข่ายสำเร็จ", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/พบเส้นทาง 1 เส้นในไฟล์/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Database operation failed");
  await expect(page.locator("body")).not.toContainText("but-unzip");
});
