import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const demo = pathToFileURL(resolve("docs/prototypes/weather-animation/index.html")).href;

test("rain/storm prototype stays offline and separates simulated frames", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
  const network: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await page.goto(demo);
  await expect(page.getByText("ข้อมูลจำลองเท่านั้น")).toBeVisible();
  const frame = page.getByRole("slider", { name: "เลือกเฟรมเวลา" });
  await expect(frame).toHaveAttribute("aria-valuetext", "09:00 น.");
  await frame.press("ArrowRight");
  await expect(frame).toHaveAttribute("aria-valuetext", "09:10 น.");
  await page.getByRole("button", { name: "เล่น", exact: true }).click();
  await expect(frame).not.toHaveValue("1");
  await page.getByRole("button", { name: "หยุด", exact: true }).click();
  await expect(page.getByRole("button", { name: "เล่น", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "เส้นทางพายุตัวอย่าง" }).click();
  await expect(page.getByText(/เวลาวิเคราะห์/)).toBeVisible();
  await frame.press("End");
  await expect(page.getByText(/เวลาคาดการณ์/)).toBeVisible();
  await expect(page.getByText(/เส้นประ = คาดการณ์/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => innerWidth));
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});
