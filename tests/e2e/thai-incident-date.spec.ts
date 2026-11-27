import { expect, test } from "@playwright/test";
import { parseIncidentWallTime, serializeIncidentWallTime } from "../../components/admin/ThaiIncidentDateTimePicker";

const base = process.env.BASE_PATH || "";

test("Thai picker keeps the Gregorian wall-clock wire format and validates leap days", () => {
  const value = "2024-02-29T16:08";
  const parsed = parseIncidentWallTime(value);
  expect(parsed).toEqual({ year: 2024, month: 2, day: 29, hour: 16, minute: 8 });
  expect(serializeIncidentWallTime(parsed!)).toBe(value);
  expect(parseIncidentWallTime("2026-02-29T16:08")).toBeNull();
  expect(parseIncidentWallTime("2026-11-27T24:00")).toBeNull();
});

test("new flood form displays Thai Buddhist dates and keeps canceled calendar edits out", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 690 });
  await page.clock.setFixedTime(new Date("2026-11-27T15:08:00Z"));
  const writes: string[] = [];
  await page.route("**/functions/v1/hdms-api", async route => {
    const action = route.request().postDataJSON()?.action;
    if (action && !action.startsWith("get")) writes.push(action);
    return route.fulfill({ json: { floodRoutes: [], detourRoutes: [], highwayLayers: [], offices: [], mitigationProjects: [], mapStyles: null } });
  });
  await page.goto(`${base}/admin/`);
  const form = page.getByRole("button", { name: /วันและเวลาเริ่มเกิดเหตุ/ });
  await expect(form).toContainText("27 พ.ย. 2569");
  await form.click();
  const picker = page.getByRole("dialog", { name: "เลือกวันและเวลาเริ่มเกิดเหตุ" });
  const month = picker.getByRole("combobox", { name: "เดือน", exact: true });
  const year = picker.getByRole("combobox", { name: "ปี พ.ศ.", exact: true });
  await expect(month.locator("option:checked")).toHaveText("พฤศจิกายน");
  await expect(year.locator("option:checked")).toHaveText("2569");
  await expect(picker.getByRole("button", { name: "27 พ.ย. 2569", exact: true })).toBeFocused();
  const bounds = await picker.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  await picker.getByRole("button", { name: "27 พ.ย. 2569", exact: true }).press("ArrowRight");
  await expect(picker.getByRole("button", { name: "28 พ.ย. 2569", exact: true })).toBeFocused();
  await picker.getByRole("button", { name: "เดือนถัดไป", exact: true }).click();
  await expect(month.locator("option:checked")).toHaveText("ธันวาคม");
  await picker.getByRole("button", { name: "เดือนถัดไป", exact: true }).click();
  await expect(year.locator("option:checked")).toHaveText("2570");
  await picker.getByRole("button", { name: "1 ม.ค. 2570", exact: true }).click();
  await picker.getByRole("combobox", { name: "ชั่วโมง", exact: true }).selectOption("8");
  await picker.getByRole("combobox", { name: "นาที", exact: true }).selectOption("5");
  await picker.getByRole("button", { name: "ใช้วันและเวลานี้", exact: true }).click();
  await expect(form).toBeFocused();
  await expect(form).toContainText("1 ม.ค. 2570 · 08:05 น.");

  await form.click();
  await picker.getByRole("button", { name: "เดือนก่อนหน้า", exact: true }).click();
  await picker.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(form).toContainText("1 ม.ค. 2570 · 08:05 น.");
  expect(writes).toEqual([]);
});
