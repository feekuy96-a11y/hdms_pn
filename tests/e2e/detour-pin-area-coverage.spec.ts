import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { resolveDetourPinArea, traceDetourRouteAreas } from "../../lib/area-lookup";
import { resetBaseHighwayNetworkCache } from "../../lib/gis-data";
import { isAdviceOnDrawnRoute } from "../../lib/gis-utils";

test("detour pin area uses the Pattani polygon reference across all 12 districts", async () => {
  const network = readFileSync("public/data/highway-base-network.json", "utf8");
  const original = globalThis.fetch;
  const requested: string[] = [];
  resetBaseHighwayNetworkCache();
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requested.push(url);
    if (!url.endsWith("/data/highway-base-network.json")) throw new Error("Only our area reference may be used");
    return new Response(network, { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const cases = [
    [101.246950, 6.867925, "สะบารัง", "เมืองปัตตานี"],
    [101.050825, 6.733025, "โคกโพธิ์", "โคกโพธิ์"],
    [101.202850, 6.813050, "เกาะเปาะ", "หนองจิก"],
    [101.489043, 6.852110, "ปะนาเระ", "ปะนาเระ"],
    [101.419500, 6.718100, "มายอ", "มายอ"],
    [101.401100, 6.602650, "ตะโละแมะนา", "ทุ่งยางแดง"],
    [101.635400, 6.693500, "ตะลุบัน", "สายบุรี"],
    [101.676200, 6.596050, "ไทรทอง", "ไม้แก่น"],
    [101.348313, 6.782900, "ตะโละ", "ยะหริ่ง"],
    [101.294625, 6.769500, "ยะรัง", "ยะรัง"],
    [101.547012, 6.572588, "กะรุบี", "กะพ้อ"],
    [101.225288, 6.645150, "แม่ลาน", "แม่ลาน"],
    // Opposite sides of the same Panare/Tha Kham boundary, approximately 50 m from it.
    [101.4888529, 6.8444251, "ท่าข้าม", "ปะนาเระ"],
    [101.4891471, 6.8452749, "ปะนาเระ", "ปะนาเระ"],
  ] as const;
  try {
    for (const [lon, lat, tambon, amphoe] of cases) {
      expect(await resolveDetourPinArea(lon, lat), `${lon}, ${lat}`).toMatchObject({
        tambon, amphoe, province: "ปัตตานี", source: "local",
      });
    }
    for (const [lon, lat] of [
      [101.4889794, 6.8447905], [101.4890000, 6.8448500], [101.4890206, 6.8449095],
      [101.2667, 6.5423], [101.66, 6.94], [Number.NaN, 6.85],
    ]) {
      expect(await resolveDetourPinArea(lon, lat), `${lon}, ${lat}`).toBeNull();
    }
    const left: [number, number] = [101.4888529, 6.8444251];
    const right: [number, number] = [101.4891471, 6.8452749];
    const names = async (points: Array<[number, number]>) => (await traceDetourRouteAreas(points))
      .map((area) => area?.tambon ?? null);
    expect(await names([left, right])).toEqual(["ท่าข้าม", "ปะนาเระ"]);
    expect(await names([right, left])).toEqual(["ปะนาเระ", "ท่าข้าม"]);
    expect(await names([left, right, left])).toEqual(["ท่าข้าม", "ปะนาเระ", "ท่าข้าม"]);
    expect(await names([[101.4877, 6.8453], [101.4903, 6.8444]])).toEqual([null]);
    expect(await names([[101.60, 6.98], [101.65, 6.94]])).toEqual([null]);
    expect(requested).toHaveLength(1);
  } finally {
    globalThis.fetch = original;
    resetBaseHighwayNetworkCache();
  }
});

test("route crossings preserve a narrow locality between vertices and re-entry even when pin areas are identical", async () => {
  type Point = [number, number];
  const rectangle = (left: number, bottom: number, right: number, top: number): Point[] =>
    [[left, bottom], [right, bottom], [right, top], [left, top]];
  const origin: Point = [101.48, 6.85];
  const shift = (p: Point): Point => [origin[0] + p[0], origin[1] + p[1]];
  const polygonA = [
    [0, 0], [.001, 0], [.001, .002], [.003, .002], [.003, 0], [.004, 0], [.004, .0035], [0, .0035],
  ] as Point[];
  const polygons = [polygonA, rectangle(.001, 0, .0015, .002), rectangle(.0015, 0, .003, .002),
    rectangle(.004, .0035, .005, .0045)];
  const subdistricts = polygons.map((shape, i) => {
    const polygon = shape.map(shift);
    return {
      tambon: ["ก", "ข", "ค", "ง"][i], amphoe: "อำเภอทดสอบ", polygon,
      bounds: [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1])),
        Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))],
    };
  });
  const original = globalThis.fetch;
  resetBaseHighwayNetworkCache();
  globalThis.fetch = (async () => new Response(JSON.stringify({ subdistricts, districtsGeojson: { features: [] } }))) as typeof fetch;
  const names = async (points: Point[]) => (await traceDetourRouteAreas(points.map(shift))).map((area) => area?.tambon ?? null);
  try {
    expect(await names([[.0005, .001], [.0035, .001]])).toEqual(["ก", "ข", "ค", "ก"]);
    expect(await names([[.0035, .001], [.0035, .0027], [.0005, .0027], [.0005, .001]])).toEqual(["ก"]);
    expect(await names([[.002, .0032], [.004, .0035], [.0036, .0031]])).toEqual(["ก"]);
    expect(await names([[.0015, .0003], [.0015, .0017]])).toEqual([null]);
  } finally {
    globalThis.fetch = original;
    resetBaseHighwayNetworkCache();
  }
});


test("routing advice refuses a parallel service road or different traveled order with the same endpoints", () => {
  const a = [101.488, 6.852] as [number, number];
  const b = [101.492, 6.852] as [number, number];
  const c = [101.489, 6.852] as [number, number];
  const d = [101.491, 6.852] as [number, number];
  expect(isAdviceOnDrawnRoute([a, b], [a, c, d, b])).toBe(true);
  expect(isAdviceOnDrawnRoute([a, b], [a, [101.489, 6.8522], [101.491, 6.8522], b])).toBe(false);
  expect(isAdviceOnDrawnRoute([a, d, c, b], [a, b])).toBe(false);
  // Equivalent geometry may have different intermediate vertex density.
  expect(isAdviceOnDrawnRoute([a, c, d, c, b], [a, d, c, d, b])).toBe(true);
  const north = [101.489, 6.8524] as [number, number];
  const south = [101.489, 6.8516] as [number, number];
  expect(isAdviceOnDrawnRoute([a, c, north, c, south, c, b], [a, c, south, c, north, c, b])).toBe(false);
});
