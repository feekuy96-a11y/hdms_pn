import { expect, test } from "@playwright/test";

test("GIS import persists independent layers, deduplicates the report picker, and confirms deletion", async ({ page, baseURL, isMobile }, testInfo) => {
  const local = new URL(baseURL ?? "");
  const base = process.env.BASE_PATH || "";
  const section = "สายทดสอบเลเยอร์ซ้ำ";
  const sectionLabel = `ทล.9471 - ${section}`;
  const coords = [[101.18, 6.83], [101.19, 6.84]];
  const geo = {
    type: "FeatureCollection",
    features: [{
      type: "Feature", properties: { route_no: "9471", section_name: section, km_start: "1+100", km_end: "2+200" },
      geometry: { type: "LineString", coordinates: coords },
    }],
  };
  type Layer = { layer_id: string; layer_name: string; color_hex: string; line_width: number; geojson_data: typeof geo; metadata: Record<string, unknown>; is_visible: boolean };
  type Import = { layerId: string; layerName: string; colorHex: string; lineWidth: number; geojsonData: typeof geo; metadata: Record<string, unknown> };
  const highwayLayers: Layer[] = [];
  const writes: Import[] = [];
  const deletions: string[] = [];
  const response = () => ({ floodRoutes: [], detourRoutes: [], timelineUpdates: [], mitigationProjects: [], highwayLayers, offices: [],
    mapStyles: null, systemSettings: { name: "ระบบทดสอบ GIS", org: "สำนักงานทดสอบ", phone: "1586" } });
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/hdms-api")) {
      const { action, args = [] } = request.postDataJSON() as { action: string; args?: unknown[] };
      if (action === "updateHighwayLayerAction") {
        const p = args[0] as Import;
        writes.push(p);
        highwayLayers.push({ layer_id: p.layerId, layer_name: p.layerName, color_hex: p.colorHex, line_width: p.lineWidth,
          geojson_data: p.geojsonData, metadata: p.metadata, is_visible: true });
        return route.fulfill({ json: { success: true, systemData: response() } });
      }
      if (action === "deleteHighwayLayerAction") {
        const id = String(args[0]);
        deletions.push(id);
        const index = highwayLayers.findIndex((layer) => layer.layer_id === id);
        if (index !== -1) highwayLayers.splice(index, 1);
        return route.fulfill({ json: { success: true, systemData: response() } });
      }
      return route.fulfill({ json: response() });
    }
    return url.origin === local.origin && ["localhost", "127.0.0.1"].includes(local.hostname)
      ? route.continue() : route.abort();
  });
  await page.goto(`${base}/admin/`);

  const network = async () => {
    if (isMobile) {
      const tools = page.getByRole("navigation", { name: "เมนูจัดการแอดมินมือถือ" }).locator("details");
      if ((await tools.getAttribute("open")) === null) await tools.locator("summary").click();
    }
    await page.getByRole("button", { name: "โครงข่ายสายทาง", exact: true }).filter({ visible: true }).first().click();
  };
  await network();
  const intake = page.getByRole("region", { name: "นำเข้าและตรวจสอบไฟล์ GIS" });
  const registry = page.getByRole("region", { name: "สายทางที่บันทึกไว้" });
  const preview = async (name: string) => {
    await intake.locator("input[type=file]").setInputFiles({
      name: `${name}.geojson`, mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(geo)),
    });
    const inspected = page.getByRole("dialog", { name: /ตรวจสอบโครงข่ายสำเร็จ/ });
    await expect(inspected).toBeVisible();
    await inspected.getByRole("button", { name: "ตกลง" }).click();
    await expect(intake.getByText(/พรีวิวตรวจสอบโครงข่าย: พบ 1 เส้นทาง/)).toBeVisible();
  };
  const saveImport = async () => {
    await intake.locator("select").filter({ has: page.locator("option[value='SECOND_HIGHWAY']") }).selectOption("SECOND_HIGHWAY");
    await intake.getByRole("button", { name: "บันทึกโครงข่ายเข้าสู่ระบบ" }).click();
    const saved = page.getByRole("dialog", { name: "บันทึกโครงข่ายสายทางสำเร็จ" });
    await expect(saved).toBeVisible();
    await saved.getByRole("button", { name: "ตกลง" }).click();
  };

  await preview("GIS-ต้นฉบับ");
  expect(writes).toHaveLength(0);
  await intake.getByRole("button", { name: "ยกเลิก" }).click();
  expect(writes).toHaveLength(0);
  await preview("GIS-ต้นฉบับ");
  await saveImport();
  await expect(registry.getByRole("button", { name: "ลบเลเยอร์โครงข่าย GIS-ต้นฉบับ" })).toBeVisible();
  await preview("GIS-สำเนา");
  expect(writes).toHaveLength(1);
  await saveImport();
  await expect(registry.getByRole("button", { name: "ลบเลเยอร์โครงข่าย GIS-สำเนา" })).toBeVisible();
  expect(writes.map(({ layerName }) => layerName)).toEqual(["GIS-ต้นฉบับ", "GIS-สำเนา"]);
  expect(writes.map(({ layerId }) => layerId)).toEqual([expect.stringMatching(/^IMPORT-/), expect.stringMatching(/^IMPORT-/)]);
  expect(writes[0].layerId).not.toBe(writes[1].layerId);
  for (const write of writes) {
    expect(write.geojsonData.features[0]).toMatchObject({
      properties: { route_no: "9471", section_name: section, highway_type: "SECOND_HIGHWAY" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  await page.reload();
  await page.getByRole("button", { name: "หมายเลขทางหลวง" }).click();
  const picker = page.getByRole("listbox", { name: "รายการทางหลวง" });
  await expect(picker.getByText(sectionLabel, { exact: true })).toHaveCount(1);
  await picker.getByText(sectionLabel, { exact: true }).click();
  await expect(page.getByLabel("กม. เริ่มต้น", { exact: true })).toHaveValue("1+100");
  await network();
  const remove = registry.getByRole("button", { name: "ลบเลเยอร์โครงข่าย GIS-สำเนา" });
  await remove.click();
  const confirm = page.getByRole("dialog", { name: "ยืนยันการลบเลเยอร์โครงข่าย?" });
  await expect(confirm).toContainText(writes[1].layerId);
  await confirm.getByRole("button", { name: "ยกเลิก" }).click();
  expect(deletions).toEqual([]);
  await remove.click();
  await confirm.getByRole("button", { name: "ตกลง" }).click();
  const deleted = page.getByRole("dialog", { name: "ลบชั้นข้อมูลสำเร็จ" });
  await expect(deleted).toBeVisible();
  await deleted.getByRole("button", { name: "ตกลง" }).click();
  expect(deletions).toEqual([writes[1].layerId]);
  await page.reload();
  await network();
  await expect(remove).toHaveCount(0);
  await expect(registry.getByRole("button", { name: "ลบเลเยอร์โครงข่าย GIS-ต้นฉบับ" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("GIS-retained-layer-after-reload.png"), animations: "disabled" });
});
