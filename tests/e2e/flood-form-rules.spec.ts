import { expect, test } from "@playwright/test";
import {
  deriveTrafficStatusFromWaterLevel,
  TRAFFIC_STATUS_OPTIONS,
  getTrafficPresentation,
} from "../../lib/traffic-presentation";
import { decodeFloodImpactParts, encodeFloodImpactParts, formatFloodImpactParts, mirrorFloodImpactForReverse, parseFloodDirectionMeta, toggleFloodImpactPart } from "../../lib/flood-event-schema";
import { getAvailableHighwayRoutes } from "../../lib/highway-schema";
import { detectClosedRoadConflicts, detectPassabilityFloodWarnings } from "../../lib/gis-utils";

const base = process.env.BASE_PATH || "";

test.describe("Flood traffic status rules and highway selector deduplication", () => {
  test("legacy pairs stay independent while explicit left/right frontage-shoulder combinations round-trip", () => {
    for (const [side, thai] of [["LEFT", "ซ้าย"], ["RIGHT", "ขวา"]] as const) {
      const shoulder = `${side}_SHOULDER` as const;
      const frontage = `${side}_FRONTAGE` as const;
      expect(formatFloodImpactParts({ affectedParts: [shoulder] })).toBe(`ไหล่ทาง${thai}ทาง`);
      expect(formatFloodImpactParts({ affectedParts: [frontage] })).toBe(`ทางขนาน${thai}ทาง`);
      const legacy = parseFloodDirectionMeta({ affectedParts: [shoulder, frontage] });
      expect(formatFloodImpactParts(legacy)).toBe(`ไหล่ทาง${thai}ทาง, ทางขนาน${thai}ทาง`);
      expect(toggleFloodImpactPart(decodeFloodImpactParts(legacy), "ALL_LANES")).toEqual([shoulder, frontage, "ALL_LANES"]);
      const picked = toggleFloodImpactPart([shoulder, "ALL_LANES"], frontage);
      const wire = JSON.parse(JSON.stringify(encodeFloodImpactParts(picked)));
      expect(wire).toEqual({ affectedParts: ["ALL_LANES", frontage], frontageShoulderSides: [side] });
      expect(formatFloodImpactParts(parseFloodDirectionMeta(wire))).toBe(`ทุกช่องจราจร, ไหล่ทางของทางขนาน${thai}ทาง`);
      expect(toggleFloodImpactPart(picked, "UNSPECIFIED")).toEqual(["UNSPECIFIED"]);
      expect(toggleFloodImpactPart(picked, frontage)).toEqual(["ALL_LANES", shoulder]);
      const mirrored = mirrorFloodImpactForReverse(picked);
      expect(encodeFloodImpactParts(mirrored).frontageShoulderSides).toEqual([side === "LEFT" ? "RIGHT" : "LEFT"]);
    }
  });

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

  for (const outcome of ["shared carriageway", "both saved", "right rejected then retried", "right response lost", "right verification rejected", "left rejected"] as const) {
  test(`admin flood form saves split 4-lane records: ${outcome}`, async ({ page, isMobile }) => {
    test.skip(isMobile && !["shared carriageway", "both saved", "right rejected then retried"].includes(outcome), "Remaining transport variants are covered on desktop.");
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const savedCalls: any[] = [];
    const reportCalls: string[] = [];
    let publishedRows: unknown[] = [];
    const updated_at = new Date().toISOString();
    let releaseFloodForward!: () => void;
    const floodForwardGate = new Promise<void>(resolve => { releaseFloodForward = resolve; });
    const requestedDirections: string[] = [];
    let rejectFloodReverse = true;
    if (outcome === "both saved") {
      await page.route("**/route/v1/driving/**", route => route.fulfill({ json: { code: "NoRoute", routes: [] } }));
      await page.route("**/directions/v2:computeRoutes*", route => route.fulfill({ json: { routes: [] } }));
    }


    await page.route("**/functions/v1/hdms-api", async (route) => {
      const body = route.request().postDataJSON() as { action?: string; args?: any[] };
      const action = body?.action || "";

      if (publishedRows.length && ["getSystemDataAction", "getPublicSystemDataAction", "getAdminOperationalDataAction"].includes(action)) {
        const system = { updatedAt: updated_at, floodRoutes: publishedRows, detourRoutes: [], highwayLayers: [], offices: [], timelineUpdates: [], mitigationProjects: [],
          mapStyles: null, systemSettings: { name: "ระบบทดสอบ", org: "แขวงทางหลวงปัตตานี", phone: "1586" } };
        if (action === "getAdminOperationalDataAction") return route.fulfill({ status: 400, json: { error: "Unknown operation" } });
        return route.fulfill({ json: system });
      }

      if (action === "getAdminOperationalDataAction") {
        await route.fulfill({ status: 400, json: { error: "Unknown operation" } });
        return;
      }

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

      if ((outcome === "both saved" || outcome === "shared carriageway") && action === "snapRouteAction") {
        const [from, to] = body.args as [[number, number], [number, number]];
        const reverse = from[0] > to[0];
        requestedDirections.push(reverse ? "B→A" : "A→B");
        if (!reverse && outcome === "both saved") await floodForwardGate;
        const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + (reverse ? 0.0005 : 0)];
        await route.fulfill({ json: reverse && rejectFloodReverse ? null : [from, middle, to] });
        return;
      }

      if (action === "upsertRouteAction") {
        const arg = body.args?.[0] || {};
        savedCalls.push(arg);
        if (outcome === "right response lost" && arg.roadSide === "RIGHT") {
          await route.abort("failed");
          return;
        }
        const rejected = (outcome === "left rejected" && arg.roadSide === "LEFT") ||
          (outcome === "right rejected then retried" && arg.roadSide === "RIGHT" && savedCalls.length === 2);
        if (rejected) {
          await route.fulfill({
            status: 422,
            json: { error: "บันทึกไม่สำเร็จ: โปรดตรวจสอบ schema/migration ของช่องจราจรและทิศทาง" },
          });
          return;
        }
        if (outcome === "right verification rejected" && arg.roadSide === "RIGHT") {
          await route.fulfill({
            status: 409,
            json: { error: "บันทึกแล้วแต่ค่าฝั่งถนน/ช่องจราจร/ทิศทางที่อ่านกลับมาไม่ตรง กรุณาตรวจสอบก่อนเผยแพร่" },
          });
          return;
        }
        await route.fulfill({ status: 200, json: { success: true, savedId: arg.id } });
        return;
      }

      if (action === "syncReportingRowAction") {
        reportCalls.push(body.args?.[0]?.recordId);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ synced: true }) });
        return;
      }

      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: `Unexpected ${action}` }) });
    });

    await page.goto(`${base}/admin/`);
    const menu = isMobile ? page.getByRole("navigation", { name: "เมนูจัดการแอดมินมือถือ" }) : page.getByRole("complementary");
    await menu.getByRole("button", { name: /รายงานสถานการณ์น้ำท่วม/ }).click();
    const sidePicker = page.getByRole("group", { name: "เลือกฝั่งถนน" });
    await expect(sidePicker).toHaveCount(1);
    if (outcome === "shared carriageway") {
      const submit = page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true });
      await submit.click();
      const error = page.getByRole("alert").filter({ hasText: "กรุณาเลือกฝั่งถนนที่น้ำท่วม" });
      await expect(error).toBeVisible();
      await expect(sidePicker).toBeFocused();
      await page.waitForTimeout(4200);
      await expect(error).toBeVisible();
      expect(savedCalls).toHaveLength(0);
    }

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

    await page.getByRole("button", { name: /ทั้งสองฝั่ง A⇄B/ }).click();
    await expect(page.getByLabel("ระดับน้ำขาไป (ซม.) *")).toHaveCount(0);
    await expect(page.getByLabel("เลือกทิศทางสำหรับดัดเส้น")).toHaveCount(0);

    if (outcome === "shared carriageway") {
      const primary = page.getByRole("group", { name: "ส่วนที่ได้รับผลกระทบ ทั้งสองฝั่ง" });
      const unspecified = primary.getByRole("button", { name: "ไม่ระบุ", exact: true });
      await unspecified.click();
      await expect(unspecified).toHaveAttribute("aria-pressed", "true");
      const mainShoulder = primary.getByRole("button", { name: "ไหล่ทางซ้าย", exact: true });
      const frontage = primary.getByRole("button", { name: "ทางขนานซ้าย", exact: true });
      await frontage.click();
      await expect(primary.getByRole("status")).toContainText("น้ำท่วมบริเวณทางขนานซ้ายทาง");
      await mainShoulder.click();
      await expect(unspecified).toHaveAttribute("aria-pressed", "false");
      await expect(primary.getByRole("status")).toContainText("น้ำท่วมบริเวณไหล่ทางของทางขนานซ้ายทาง");
      await waterInputSingle.fill("");
      await page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true }).click();
      await expect(waterInputSingle).toBeFocused();
      await expect(waterInputSingle).toHaveAttribute("aria-invalid", "true");
      await expect(waterInputSingle).toHaveAccessibleDescription(/ระดับน้ำตั้งแต่ 0/);
      expect(savedCalls).toHaveLength(0);
      await waterInputSingle.fill("0");
      await expect(waterInputSingle).not.toHaveAttribute("aria-invalid", "true");
      const carriageway = page.getByLabel("โครงสร้างถนนสำหรับสองทิศทาง");
      await expect(carriageway).toHaveValue("");
      await carriageway.selectOption("SHARED");
      await page.getByRole("button", { name: "หาแนวเส้นจากช่วง กม." }).click();
      await page.getByRole("button", { name: "คำนวณเส้นเกาะถนน" }).click();
      await expect(page.getByText(/คำนวณเส้นทางเกาะโครงข่ายถนนสำเร็จ/)).toBeVisible();
      expect(requestedDirections).toEqual(["A→B"]);
      await page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true }).click();
      await expect.poll(() => savedCalls.length).toBe(1);
      expect(savedCalls[0]).toMatchObject({
        roadSide: "BOTH", waterLevelCm: 0,
        directionMeta: { affectedParts: ["LEFT_FRONTAGE"], frontageShoulderSides: ["LEFT"], waterLevelKnown: true, directionCode: "BOTH", arrow_direction: "TWO_WAY", carriageway_type: "SINGLE_CENTERLINE" },
      });
      return;
    }

    // 3. Switch to 4-lane highway -> slice KM -> verify split line switch (A->B / B->A) & separate water inputs
    await page.getByRole("button", { name: "หมายเลขทางหลวง" }).click();
    await page.getByRole("listbox", { name: "รายการทางหลวง" }).getByText("ทล.42 - ดอนยาง - บ้านดี").click();

    await page.getByRole("button", { name: "หาแนวเส้นจากช่วง กม." }).click();
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
    if (outcome === "both saved") {
      await fwdSection.getByRole("button", { name: "ไหล่ทางซ้าย", exact: true }).click();
      await expect(fwdSection.getByRole("status")).toContainText("ไหล่ทางซ้ายทาง");
      await fwdSection.getByRole("button", { name: "ทางขนานซ้าย", exact: true }).click();
      await expect(fwdSection.getByRole("status")).toContainText("ทุกช่องจราจร / ไหล่ทางของทางขนานซ้ายทาง");
    }
    await fwdSection.getByLabel("ระดับน้ำขาไป (ซม.) *").fill("42");
    await expect(fwdSection.getByLabel("สถานะสภาพการจราจรขาไป (๕ สถานะ)")).toHaveValue("CLOSED");

    const revSection = page.getByRole("group", { name: "ข้อมูลฝั่งขากลับ B → A" });
    await revSection.getByRole("button", { name: "ช่องจราจรขวา", exact: true }).click();
    if (outcome === "both saved") {
      await revSection.getByRole("button", { name: "ไหล่ทางขวา", exact: true }).click();
      await expect(revSection.getByRole("status")).toContainText("ไหล่ทางขวาทาง");
      await revSection.getByRole("button", { name: "ทางขนานขวา", exact: true }).click();
      await expect(revSection.getByRole("status")).toContainText("ไหล่ทางของทางขนานขวาทาง");
    }
    await revSection.getByLabel("ระดับน้ำขากลับ (ซม.) *").fill("30");
    await expect(revSection.getByLabel("สถานะสภาพการจราจรขากลับ (๕ สถานะ)")).toHaveValue("ONE_LANE");

    if (outcome === "right rejected then retried") {
      await revSection.getByRole("button", { name: /ใช้ส่วนที่ได้รับผลกระทบเหมือนขาไป/ }).click();
      await expect(revSection.getByRole("button", { name: "ทุกช่องจราจร", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(revSection.getByRole("button", { name: "ช่องจราจรขวา", exact: true })).toHaveAttribute("aria-pressed", "false");
      await revSection.getByText("ไม่ทราบค่า", { exact: true }).click();
    }

    if (outcome === "both saved") {
      const reversePins = page.getByRole("group", { name: "หมุดเส้นทางขากลับ (B → A)" });
      const reverseStart = reversePins.getByLabel("พิกัดจุดเริ่มต้นขากลับ (B → A)");
      const reverseEnd = reversePins.getByLabel("พิกัดจุดสิ้นสุดขากลับ (B → A)");
      await reverseStart.fill("6.8396, 101.1906");
      await reverseStart.blur();
      await reverseEnd.fill("6.8297, 101.1806");
      await reverseEnd.blur();
      await page.getByRole("button", { name: "คำนวณเส้นเกาะถนน" }).click();
      try {
        await expect.poll(() => requestedDirections).toEqual(["A→B"]);
        await expect(page.getByText("กำลังคำนวณเส้นน้ำท่วม A→B…")).toBeVisible();
      } finally {
        releaseFloodForward();
      }
      await expect(page.getByText(/คำนวณเส้นน้ำท่วม B→A ไม่สำเร็จ/)).toBeVisible();
      await page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true }).click();
      await expect(page.getByText("กรุณาตรวจแนวเส้น A→B และ B→A ให้ครบทั้งสองทิศก่อนบันทึก")).toBeVisible();
      expect(savedCalls).toHaveLength(0);
      rejectFloodReverse = false;
      await page.getByRole("button", { name: "คำนวณเส้นเกาะถนน" }).click();
      await expect(page.getByText(/คำนวณเส้นน้ำท่วม ๒ ฝั่งแยกกัน: ขาไป A→B/)).toBeVisible();
      expect(requestedDirections).toEqual(["A→B", "B→A", "A→B", "B→A"]);
    }

    // Submit and inspect both payloads
    await page.getByRole("button", { name: "บันทึกเหตุการณ์", exact: true }).click();
    if (outcome === "left rejected") {
      await expect(page.getByText("ฝั่งซ้ายไม่สำเร็จ ระบบยังไม่ได้บันทึกฝั่งขวา", { exact: true })).toBeVisible();
      expect(savedCalls.map(call => call.roadSide)).toEqual(["LEFT"]);
      expect(reportCalls).toEqual([]);
      return;
    }
    await expect.poll(() => savedCalls.length).toBe(2);
    if (outcome === "right response lost" || outcome === "right verification rejected") {
      await expect(page.getByText("บันทึกฝั่งซ้ายแล้ว แต่ยังยืนยันผลฝั่งขวาไม่ได้", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
      await expect(page.getByRole("button", { name: "ตรวจผลบันทึกในทะเบียนเหตุการณ์ก่อน" })).toBeDisabled();
      expect(reportCalls).toEqual([]);
      return;
    }
    if (outcome === "right rejected then retried") {
      await expect(page.getByText("บันทึกได้เพียงฝั่งซ้าย", { exact: true })).toBeVisible();
      expect(reportCalls).toEqual([]);
      await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
      await page.getByRole("button", { name: "ลองบันทึกฝั่งขวาอีกครั้ง", exact: true }).click();
      await expect.poll(() => savedCalls.length).toBe(3);
      expect(savedCalls.map(call => call.roadSide)).toEqual(["LEFT", "RIGHT", "RIGHT"]);
      expect(savedCalls[2]).toEqual(savedCalls[1]);
    }
    await expect(page.getByText("บันทึกเหตุการณ์ ๒ ทิศทางสำเร็จ", { exact: true })).toBeVisible();
    expect(reportCalls).toEqual([savedCalls[0].id, savedCalls[1].id]);

    const fwdPayload = savedCalls.find((c) => c.roadSide === "LEFT");
    const revPayload = savedCalls.find((c) => c.roadSide === "RIGHT");
    expect(fwdPayload).toBeTruthy();
    expect(revPayload).toBeTruthy();
    expect(fwdPayload.waterLevelCm).toBe(42);
    expect(fwdPayload.trafficStatus).toBe("CLOSED");
    expect(fwdPayload.directionMeta.directionCode).toBe("A_TO_B");
    expect(revPayload.waterLevelCm).toBe(outcome === "both saved" ? 30 : 0);
    if (outcome === "both saved") expect(revPayload.trafficStatus).toBe("ONE_LANE");
    expect(revPayload.directionMeta.waterLevelKnown).toBe(outcome === "both saved");
    expect(revPayload.directionMeta.water_level_known).toBe(outcome === "both saved");
    expect(revPayload.directionMeta.eventId).toBe(fwdPayload.directionMeta.eventId);
    expect(revPayload.directionMeta.directionCode).toBe("B_TO_A");
    expect(fwdPayload.directionMeta.affectedParts).toEqual(outcome === "both saved" ? ["ALL_LANES", "LEFT_FRONTAGE"] : ["ALL_LANES"]);
    expect(fwdPayload.directionMeta.frontageShoulderSides).toEqual(outcome === "both saved" ? ["LEFT"] : undefined);
    expect(fwdPayload.affectedShoulder).toBe("NONE");
    expect(revPayload.directionMeta.affectedParts).toEqual(outcome === "both saved" ? ["RIGHT_LANE", "RIGHT_FRONTAGE"] : ["ALL_LANES"]);
    expect(revPayload.directionMeta.frontageShoulderSides).toEqual(outcome === "both saved" ? ["RIGHT"] : undefined);
    // Forward starts near [101.18, 6.83], Reverse runs along reverse B->A carriageway starting near [101.1906, 6.8396]
    expect(fwdPayload.coordinates[0][0]).toBeCloseTo(101.18, 3);
    expect(revPayload.coordinates[0][0]).toBeCloseTo(101.1906, 3);
    if (outcome === "both saved") {
      expect(revPayload.coordinates[0]).toEqual([101.1906, 6.8396]);
      expect(revPayload.coordinates.at(-1)).toEqual([101.1806, 6.8297]);
      expect(revPayload.coordinates).not.toEqual([...fwdPayload.coordinates].reverse());
      // Round-trip the existing Edge persistence shape; no real database is written.
      const persisted = (payload: typeof fwdPayload) => JSON.parse(JSON.stringify({
        id: payload.id, route_no: payload.routeNo, section_name: payload.sectionName,
        km_start: payload.kmStart, km_end: payload.kmEnd,
        lat_start: payload.latStart, lon_start: payload.lonStart, lat_end: payload.latEnd, lon_end: payload.lonEnd,
        coordinates_json: payload.coordinates, water_level_cm: payload.waterLevelCm,
        road_side: payload.roadSide, traffic_status: payload.trafficStatus,
        affected_lanes: payload.affectedLanes, affected_shoulder: payload.affectedShoulder,
        direction_meta: payload.directionMeta, is_active: true, updated_at,
      }));
      publishedRows = [persisted(fwdPayload)];
      await page.goto(`${base}/admin/`);
      await page.getByRole("button", { name: "รายการเหตุการณ์", exact: true }).filter({ visible: true }).first().click();
      await page.getByRole("button", { name: /กางดูช่วงย่อยทั้งหมด/ }).first().click();
      await page.locator(".doh-incident-segment").getByRole("button", { name: "แก้ไข", exact: true }).click();
      const reopened = page.getByRole("group", { name: "ส่วนที่ได้รับผลกระทบ ฝั่งซ้ายทาง", exact: true });
      await expect(reopened.getByRole("status")).toContainText("ไหล่ทางของทางขนานซ้ายทาง");
      await expect(reopened.getByRole("button", { name: "ทุกช่องจราจร", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.goto(`${base}/`);
      await page.locator(".doh-map-capsule-pin").first().press("Enter");
      const popup = page.locator(".doh-flood-leaflet-popup");
      await expect(popup).toContainText("น้ำท่วมบริเวณทุกช่องจราจร, ไหล่ทางของทางขนานซ้ายทาง");
      publishedRows = [persisted(revPayload)];
      await page.reload();
      await page.locator(".doh-map-capsule-pin").first().press("Enter");
      await expect(popup).toContainText("น้ำท่วมบริเวณช่องจราจรขวา, ไหล่ทางของทางขนานขวาทาง");

      const legacy = persisted(fwdPayload);
      delete legacy.direction_meta.frontageShoulderSides;
      legacy.direction_meta.affectedParts = ["LEFT_SHOULDER", "LEFT_FRONTAGE"];
      legacy.affected_lanes = "ไหล่ทางซ้าย, ทางขนานซ้าย";
      publishedRows = [legacy];
      await page.reload();
      await page.locator(".doh-map-capsule-pin").first().press("Enter");
      await expect(popup).toContainText("น้ำท่วมบริเวณไหล่ทางซ้ายทาง, ทางขนานซ้ายทาง");
      await expect(popup).not.toContainText("ไหล่ทางของทางขนานซ้ายทาง");


    }
  });
  }

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
    await page.getByRole("complementary").getByRole("button", { name: /รายงานสถานการณ์น้ำท่วม/ }).click();

    const quickDirGroup = page.getByRole("group", { name: "เลือกฝั่งถนน" });
    await expect(quickDirGroup).toBeVisible();
    await quickDirGroup.getByRole("button", { name: "ซ้ายทาง · ขาไป A→B" }).click();

    await page.getByLabel("กม. เริ่มต้น").fill("0+000");
    await page.getByLabel("กม. สิ้นสุด").fill("25+000");
    await expect(page.getByText(/ช่วง กม\. นี้ยาว 25\.0 กม\./)).toBeVisible();
    await page.getByRole("button", { name: "ล้าง กม." }).click();
    await expect(page.getByLabel("กม. เริ่มต้น")).toHaveValue("");
    await expect(page.getByLabel("กม. สิ้นสุด")).toHaveValue("");
  });
});
