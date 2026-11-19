import { expect, test } from "@playwright/test";
import {
  deriveTrafficStatusFromWaterLevel,
  TRAFFIC_STATUS_OPTIONS,
  getTrafficPresentation,
} from "../../lib/traffic-presentation";
import { getAvailableHighwayRoutes } from "../../lib/highway-schema";
import { detectClosedRoadConflicts, detectPassabilityFloodWarnings } from "../../lib/gis-utils";

const base = process.env.BASE_PATH || "";

test.describe("Flood traffic status rules and highway selector deduplication", () => {
  test("TRAFFIC_STATUS_OPTIONS and deriveTrafficStatusFromWaterLevel follow exact water-depth rules", () => {
    expect(TRAFFIC_STATUS_OPTIONS.map((o) => o.label)).toEqual([
      "ผ่านได้ปกติ",
      "รถทุกชนิดผ่านได้แต่ไม่สะดวก",
      "รถเล็กผ่านได้ ๑ ช่องทาง",
      "รถเล็กผ่านไม่ได้",
      "ผ่านไม่ได้",
    ]);
    expect(getTrafficPresentation("LIGHT_VEHICLES_ONLY", 12).label).toBe("รถทุกชนิดผ่านได้แต่ไม่สะดวก");

    expect(deriveTrafficStatusFromWaterLevel(0, ["ALL_LANES"])).toBe("PASSABLE");
    expect(deriveTrafficStatusFromWaterLevel(1, ["ALL_LANES"])).toBe("LIGHT_VEHICLES_ONLY");
    expect(deriveTrafficStatusFromWaterLevel(25, ["LEFT_LANE"])).toBe("LIGHT_VEHICLES_ONLY");
    expect(deriveTrafficStatusFromWaterLevel(26, ["ALL_LANES"])).toBe("WARNING");
    expect(deriveTrafficStatusFromWaterLevel(35, ["ALL_LANES"])).toBe("WARNING");
    expect(deriveTrafficStatusFromWaterLevel(26, ["LEFT_LANE"])).toBe("ONE_LANE");
    expect(deriveTrafficStatusFromWaterLevel(35, ["RIGHT_SHOULDER"])).toBe("ONE_LANE");
    expect(deriveTrafficStatusFromWaterLevel(36, ["LEFT_LANE"])).toBe("CLOSED");
    expect(deriveTrafficStatusFromWaterLevel("", ["ALL_LANES"])).toBeNull();
  });

  test("getAvailableHighwayRoutes reads only highwayLayers, strips direction labels, and merges A->B / B->A", () => {
    const routes = getAvailableHighwayRoutes({
      highwayLayers: [
        {
          layer_name: "ทล.42",
          geojson_data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {
                  route_no: "42",
                  section_name: "ตอน ดอนยาง - บ้านดี (ขาไป A → B)",
                  km_start: "103+200",
                  km_end: "104+850",
                  direction_code: "A_TO_B",
                  lanes: "4 ช่องจราจร",
                },
                geometry: { type: "LineString", coordinates: [[101.18, 6.83], [101.19, 6.84]] },
              },
              {
                type: "Feature",
                properties: {
                  route_no: "42",
                  section_name: "ตอน ดอนยาง - บ้านดี (ขากลับ B → A)",
                  km_start: "103+200",
                  km_end: "104+850",
                  direction_code: "B_TO_A",
                  lanes: "4 ช่องจราจร",
                },
                geometry: { type: "LineString", coordinates: [[101.1905, 6.8405], [101.1805, 6.8305]] },
              },
              {
                type: "Feature",
                properties: {
                  route_no: "4061",
                  section_name: "สายรองบ้านคลอง",
                  km_start: "1+000",
                  km_end: "5+500",
                  direction_code: "BOTH",
                  lanes: "2 ช่องจราจร",
                },
                geometry: { type: "LineString", coordinates: [[101.4, 6.75], [101.42, 6.76]] },
              },
            ],
          },
        },
      ],
      floodRoutes: [
        { route_no: "43", section_name: "จุดน้ำท่วมชั่วคราว (ไม่ควรโผล่)", km_start: "76+500", km_end: "77+800" },
      ],
      mitigationProjects: [
        { route_no: "43", location_name: "ตอน บ่อทอง - ดอนยาง (จุดวิกฤตคลองตุยง)" },
      ],
    });

    expect(routes).toHaveLength(2);
    expect(routes[0].name).toBe("ทล.42 - ดอนยาง - บ้านดี");
    expect(routes[0].kmStart).toBe("103+200");
    expect(routes[0].kmEnd).toBe("104+850");
    expect(routes[0].laneCount).toBe(4);
    expect(routes[0].hasDualCarriageway).toBe(true);
    expect(routes[1].name).toBe("ทล.4061 - สายรองบ้านคลอง");
    expect(routes[1].laneCount).toBe(2);
    expect(routes[1].hasDualCarriageway).toBe(false);
  });

  test("admin flood form supports clean highway combobox, auto-status, and split BOTH line/water for >= 4-lane roads", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop admin form workflow");
    const savedCalls: any[] = [];
    const updated_at = new Date().toISOString();

    await page.route("**/functions/v1/hdms-api", async (route) => {
      const body = route.request().postDataJSON() as { action?: string; args?: any[] };
      const action = body?.action || "";

      if (action === "getSystemDataAction") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            updatedAt: updated_at,
            floodRoutes: [
              {
                id: "F-OLD",
                route_no: "43",
                section_name: "เหตุการณ์น้ำท่วมไม่ควรติดในช่องทางหลวง",
                km_start: "76+500",
                km_end: "77+800",
                lat_start: 6.8,
                lon_start: 101.2,
                lat_end: 6.81,
                lon_end: 101.21,
                coordinates_json: [[101.2, 6.8], [101.21, 6.81]],
                water_level_cm: 20,
                traffic_status: "LIGHT_VEHICLES_ONLY",
                is_active: true,
                updated_at,
              },
            ],
            detourRoutes: [],
            timelineUpdates: [],
            mitigationProjects: [
              { id: "P-1", route_no: "43", location_name: "ตอน บ่อทอง - ดอนยาง (จุดวิกฤตคลองตุยง)" },
            ],
            highwayLayers: [
              {
                layer_id: "MAIN_HIGHWAY",
                layer_name: "ทางหลวงแผ่นดินสายหลัก",
                geojson_data: {
                  type: "FeatureCollection",
                  features: [
                    {
                      type: "Feature",
                      properties: {
                        route_no: "42",
                        section_name: "ตอน ดอนยาง - บ้านดี (ขาไป A → B)",
                        km_start: "103+200",
                        km_end: "104+850",
                        direction_code: "A_TO_B",
                        lanes: "4 ช่องจราจร",
                      },
                      geometry: { type: "LineString", coordinates: [[101.18, 6.83], [101.185, 6.835], [101.19, 6.84]] },
                    },
                    {
                      type: "Feature",
                      properties: {
                        route_no: "42",
                        section_name: "ตอน ดอนยาง - บ้านดี (ขากลับ B → A)",
                        km_start: "103+200",
                        km_end: "104+850",
                        direction_code: "B_TO_A",
                        lanes: "4 ช่องจราจร",
                      },
                      geometry: { type: "LineString", coordinates: [[101.1906, 6.8396], [101.1856, 6.8346], [101.1806, 6.8296]] },
                    },
                    {
                      type: "Feature",
                      properties: {
                        route_no: "4061",
                        section_name: "สายรองบ้านคลอง",
                        km_start: "1+000",
                        km_end: "5+500",
                        direction_code: "BOTH",
                        lanes: "2 ช่องจราจร",
                      },
                      geometry: { type: "LineString", coordinates: [[101.4, 6.75], [101.42, 6.76]] },
                    },
                  ],
                },
              },
            ],
            offices: [],
            mapStyles: null,
            systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" },
          }),
        });
        return;
      }

      if (action === "upsertRouteAction") {
        const arg = body.args?.[0] || {};
        savedCalls.push(arg);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, savedId: `F-SAVED-${savedCalls.length}` }),
        });
        return;
      }

      if (action === "syncReportingRowAction") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ synced: true }) });
        return;
      }

      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: `Unexpected ${action}` }) });
    });

    await page.goto(`${base}/admin/`);
    await page.getByRole("complementary").getByRole("button", { name: /จัดการแผนที่/ }).click();

    // 1. Open Highway Combobox -> verify clean deduplicated options only from highwayLayers
    await page.getByRole("button", { name: "หมายเลขทางหลวง" }).click();
    const highwayList = page.getByRole("listbox", { name: "รายการทางหลวง" });
    await expect(highwayList.getByText("ทล.42 - ดอนยาง - บ้านดี")).toHaveCount(1);
    await expect(highwayList.getByText("103+200 - 104+850")).toHaveCount(1);
    await expect(highwayList.getByText("ทล.4061 - สายรองบ้านคลอง")).toHaveCount(1);
    await expect(highwayList.getByText(/จุดวิกฤตคลองตุยง|เหตุการณ์น้ำท่วมไม่ควรติดในช่องทางหลวง|ขาไป|ขากลับ/)).toHaveCount(0);

    // 2. Pick 2-lane highway -> verify auto-status rules + no dual line/water split when BOTH selected
    await highwayList.getByText("ทล.4061 - สายรองบ้านคลอง").click();
    const waterInputSingle = page.getByLabel("ระดับน้ำท่วมผิวทาง (ซม.) *");
    const statusSelectSingle = page.getByLabel("สถานะสภาพการจราจร (๕ สถานะ)");

    await waterInputSingle.fill("0");
    await expect(statusSelectSingle).toHaveValue("PASSABLE");

    await waterInputSingle.fill("18");
    await expect(statusSelectSingle).toHaveValue("LIGHT_VEHICLES_ONLY");

    await page.getByRole("button", { name: "ทุกช่องจราจร", exact: true }).click();
    await waterInputSingle.fill("30");
    await expect(statusSelectSingle).toHaveValue("WARNING");

    await page.getByRole("button", { name: "ช่องจราจรซ้าย", exact: true }).click();
    await expect(statusSelectSingle).toHaveValue("ONE_LANE");

    await waterInputSingle.fill("40");
    await expect(statusSelectSingle).toHaveValue("CLOSED");

    await statusSelectSingle.selectOption("WARNING");
    await expect(statusSelectSingle).toHaveValue("WARNING");

    await page.getByRole("button", { name: /ท่วมทั้งสองฝั่งจราจร/ }).click();
    await expect(page.getByLabel("ระดับน้ำขาไป (ซม.) *")).toHaveCount(0);
    await expect(page.getByLabel("เลือกทิศทางสำหรับดัดเส้น")).toHaveCount(0);

    // 3. Switch to 4-lane highway -> slice KM -> verify split line switch (A->B / B->A) & separate water inputs
    await page.getByRole("button", { name: "หมายเลขทางหลวง" }).click();
    await page.getByRole("listbox", { name: "รายการทางหลวง" }).getByText("ทล.42 - ดอนยาง - บ้านดี").click();

    await page.getByRole("button", { name: /คำนวณแนวเส้นจากช่วง กม\. อัตโนมัติ/ }).click();
    await expect(page.getByLabel("เลือกทิศทางสำหรับดัดเส้น")).toBeVisible();
    await expect(page.getByLabel("ระดับน้ำขาไป (ซม.) *")).toBeVisible();
    await expect(page.getByLabel("ระดับน้ำขากลับ (ซม.) *")).toBeVisible();

    // Switch to ขากลับ (B -> A) inside geometry editor (both road-follow & free-edit)
    const dirSwitch = page.getByLabel("เลือกทิศทางสำหรับดัดเส้น");
    await dirSwitch.getByRole("button", { name: "ขากลับ B → A" }).click();
    await page.getByRole("button", { name: "ดัดเส้นอิสระ", exact: true }).click();
    await expect(page.getByText(/กำลังดัดเส้น:.*ขากลับ \(B → A\)/)).toBeVisible();

    // Enter separate water levels & affected lanes per direction
    const fwdSection = page.getByRole("group", { name: "ข้อมูลฝั่งขาไป A → B" });
    await fwdSection.getByRole("button", { name: "ทุกช่องจราจร", exact: true }).click();
    await fwdSection.getByLabel("ระดับน้ำขาไป (ซม.) *").fill("42");
    await expect(fwdSection.getByLabel("สถานะสภาพการจราจรขาไป (๕ สถานะ)")).toHaveValue("CLOSED");

    const revSection = page.getByRole("group", { name: "ข้อมูลฝั่งขากลับ B → A" });
    await revSection.getByRole("button", { name: "ช่องจราจรขวา", exact: true }).click();
    await revSection.getByLabel("ระดับน้ำขากลับ (ซม.) *").fill("30");
    await expect(revSection.getByLabel("สถานะสภาพการจราจรขากลับ (๕ สถานะ)")).toHaveValue("ONE_LANE");

    // Submit and inspect both payloads
    await page.getByRole("button", { name: /บันทึกเหตุการณ์เข้าสู่ระบบสารสนเทศ/ }).click();
    await expect.poll(() => savedCalls.length).toBe(2);

    const fwdPayload = savedCalls.find((c) => c.roadSide === "LEFT");
    const revPayload = savedCalls.find((c) => c.roadSide === "RIGHT");
    expect(fwdPayload).toBeTruthy();
    expect(revPayload).toBeTruthy();
    expect(fwdPayload.waterLevelCm).toBe(42);
    expect(fwdPayload.trafficStatus).toBe("CLOSED");
    expect(fwdPayload.directionMeta.directionCode).toBe("A_TO_B");
    expect(revPayload.waterLevelCm).toBe(30);
    expect(revPayload.trafficStatus).toBe("ONE_LANE");
    expect(revPayload.directionMeta.directionCode).toBe("B_TO_A");
    // Forward starts near [101.18, 6.83], Reverse runs along reverse B->A carriageway starting near [101.1906, 6.8396]
    expect(fwdPayload.coordinates[0][0]).toBeCloseTo(101.18, 3);
    expect(revPayload.coordinates[0][0]).toBeCloseTo(101.1906, 3);
  });

  test("Step 1 quick direction selector & long KM span warning work without regressing step 3, and passability warnings flag WARNING/ONE_LANE floods", async ({ page }) => {
    const detourCoords: [number, number][] = [[101.18, 6.83], [101.20, 6.83]];
    const warningFloods = [
      {
        id: "F-WARN",
        route_no: "42",
        section_name: "แยกดอนยาง",
        km_start: "103+000",
        km_end: "103+400",
        is_active: true,
        traffic_status: "WARNING",
        coordinates_json: [[101.19, 6.825], [101.19, 6.835]] as [number, number][],
      },
    ];
    expect(detectClosedRoadConflicts(detourCoords, warningFloods)).toHaveLength(0);
    const warnings = detectPassabilityFloodWarnings(detourCoords, warningFloods);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].trafficStatus).toBe("WARNING");

    test.skip((page.viewportSize()?.width ?? 1280) < 800, "Desktop admin form workflow");
    await page.goto(`${base}/admin/`);
    await page.getByRole("complementary").getByRole("button", { name: /จัดการแผนที่/ }).click();

    const quickDirGroup = page.getByRole("group", { name: "เลือกฝั่งถนนเบื้องต้น" });
    await expect(quickDirGroup).toBeVisible();
    await quickDirGroup.getByRole("button", { name: "ขาไป A→B" }).click();

    await page.getByLabel("กม. เริ่มต้น").fill("0+000");
    await page.getByLabel("กม. สิ้นสุด").fill("25+000");
    await expect(page.getByText(/ช่วง กม\. นี้ยาว 25\.0 กม\./)).toBeVisible();
    await page.getByRole("button", { name: "ล้าง กม." }).click();
    await expect(page.getByLabel("กม. เริ่มต้น")).toHaveValue("");
    await expect(page.getByLabel("กม. สิ้นสุด")).toHaveValue("");
  });
});
