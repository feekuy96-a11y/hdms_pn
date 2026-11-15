import { expect, test } from "@playwright/test";

const base = process.env.BASE_PATH || "";

test("project evidence uploads before the record is saved and reporting sync runs last", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop administration workflow");

  const calls: Array<{ action: string; args: any[] }> = [];
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON() as { action?: string; args?: any[] };
    if (!body.action || !["uploadExternalMediaAction", "upsertMitigationProjectAction", "syncReportingRowAction"].includes(body.action)) {
      return route.continue();
    }
    calls.push({ action: body.action, args: body.args || [] });
    if (body.action === "uploadExternalMediaAction") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mediaId: "drive-test-1",
          url: "https://drive.google.com/uc?export=view&id=drive-test-1",
          mimeType: "image/png",
          sizeBytes: 68,
          provider: "google-drive",
        }),
      });
    }
    if (body.action === "upsertMitigationProjectAction") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, synced: true }) });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงการผู้ว่าฯ/ }).click();
  await page.getByRole("button", { name: "เพิ่มโครงการใหม่" }).click();
  await page.getByText("ชื่อโครงการ / สถานที่ดำเนินงาน *", { exact: true }).locator("..").locator("input").fill("จุดทดสอบการจัดเก็บรูป");
  await page.getByText("รายละเอียดแนวทางการแก้ไขปัญหาทางวิศวกรรม *", { exact: true }).locator("..").locator("textarea").fill("ทดสอบลำดับการบันทึกโดยไม่เขียนข้อมูลจริง");
  await page.getByText("รูปถ่ายก่อนแก้ไข", { exact: true }).locator("..").locator('input[type="file"]').setInputFiles({
    name: "before.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4YQAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "บันทึกโครงการ" }).click();
  await expect(page.getByText("บันทึกโครงการสำเร็จ", { exact: true })).toBeVisible();

  expect(calls.map((call) => call.action)).toEqual([
    "uploadExternalMediaAction",
    "upsertMitigationProjectAction",
    "syncReportingRowAction",
  ]);
  expect(calls[1].args[0].beforeImageUrl).toBe("https://drive.google.com/uc?export=view&id=drive-test-1");
  expect(calls[2].args[0].recordType).toBe("PROJECT");
});

test("an unreferenced Drive upload is deleted when the project save fails", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop administration workflow");

  const actions: string[] = [];
  await page.route("**/functions/v1/hdms-api", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON() as { action?: string };
    if (!body.action || !["uploadExternalMediaAction", "upsertMitigationProjectAction", "deleteExternalMediaAction", "syncReportingRowAction"].includes(body.action)) {
      return route.continue();
    }
    actions.push(body.action);
    if (body.action === "uploadExternalMediaAction") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mediaId: "drive-orphan-1", url: "https://drive.google.com/uc?export=view&id=drive-orphan-1", mimeType: "image/png", sizeBytes: 68, provider: "google-drive" }),
      });
    }
    if (body.action === "upsertMitigationProjectAction") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "simulated save failure" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.goto(`${base}/admin/`);
  await page.getByRole("complementary").getByRole("button", { name: /โครงการผู้ว่าฯ/ }).click();
  await page.getByRole("button", { name: "เพิ่มโครงการใหม่" }).click();
  await page.getByText("ชื่อโครงการ / สถานที่ดำเนินงาน *", { exact: true }).locator("..").locator("input").fill("จุดทดสอบชดเชยไฟล์");
  await page.getByText("รายละเอียดแนวทางการแก้ไขปัญหาทางวิศวกรรม *", { exact: true }).locator("..").locator("textarea").fill("จำลองฐานข้อมูลบันทึกล้มเหลว");
  await page.getByText("รูปถ่ายก่อนแก้ไข", { exact: true }).locator("..").locator('input[type="file"]').setInputFiles({
    name: "before.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4YQAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "บันทึกโครงการ" }).click();
  await expect.poll(() => actions).toEqual([
    "uploadExternalMediaAction",
    "upsertMitigationProjectAction",
    "deleteExternalMediaAction",
  ]);
  await expect(page.getByRole("button", { name: "บันทึกโครงการ" })).toBeEnabled();
  expect(actions).not.toContain("syncReportingRowAction");
});
