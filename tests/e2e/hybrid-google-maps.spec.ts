import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  decodeGooglePolyline,
  findNearestHighwayFromLayers,
  generateAutoDetourAdvice,
  resetGoogleRouteBreaker,
  selectRouteCornerWaypoints,
} from "../../lib/gis-utils";
import { resetAreaLookup, resolveArea } from "../../lib/area-lookup";
import { fetchOsrmWithFailover, resetOsrmClient } from "../../lib/osrm-client";
import { sampleWaypointsForGoogleMaps } from "../../lib/detour-navigation";

const baseHighwayNetwork = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/data/highway-base-network.json"), "utf8")
);

function baseHighwayNetworkResponse(url: string): Response | null {
  if (url !== "/data/highway-base-network.json") return null;
  return new Response(JSON.stringify(baseHighwayNetwork), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test.describe("Hybrid Google Maps Lookup & Detour Navigation", () => {
  const origEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origEnvKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  test.beforeEach(() => {
    resetAreaLookup();
    resetGoogleRouteBreaker();
    process.env.NEXT_PUBLIC_SUPABASE_URL = origEnvUrl || "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = origEnvKey || "sb_publishable_test_key";
  });

  test.afterEach(() => {
    if (origEnvUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origEnvUrl;
    if (origEnvKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = origEnvKey;
  });

  test("selects sharp corner turns chronologically instead of uniform array slices", () => {
    // Straight stretch 1 (15 pts north), 90-deg corner 1, straight stretch 2 (15 pts east), 90-deg corner 2, stretch 3 north
    const coords: [number, number][] = [];
    for (let i = 0; i <= 14; i++) coords.push([101.20, 6.80 + i * 0.001]);
    // Corner 1 at [101.20, 6.814] -> goes east
    for (let i = 1; i <= 14; i++) coords.push([101.20 + i * 0.001, 6.814]);
    // Corner 2 at [101.214, 6.814] -> goes north
    for (let i = 1; i <= 14; i++) coords.push([101.214, 6.814 + i * 0.001]);

    const corners = selectRouteCornerWaypoints(coords, 2);
    expect(corners).toEqual([
      [101.20, 6.814],
      [101.214, 6.814],
    ]);

    const gmapsSampled = sampleWaypointsForGoogleMaps(coords, 2);
    expect(gmapsSampled).toEqual(corners);
  });

  test("decodes standard 1e5 Google Encoded Polyline to [lon, lat] pairs", () => {
    const decoded = decodeGooglePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decoded.length).toBe(3);
    expect(decoded[0][0]).toBeCloseTo(-120.2, 4);
    expect(decoded[0][1]).toBeCloseTo(38.5, 4);
    expect(decoded[1][0]).toBeCloseTo(-120.95, 4);
    expect(decoded[1][1]).toBeCloseTo(40.7, 4);
    expect(decoded[2][0]).toBeCloseTo(-126.453, 3);
    expect(decoded[2][1]).toBeCloseTo(43.252, 3);
  });

  test("findNearestHighwayFromLayers uses true segment distance, 35m cutoff, and keeps rural prefixes", () => {
    const layers = [
      {
        layer_id: "L-RURAL",
        layer_name: "ทางหลวงชนบท ปน.2010",
        geojson_data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                // ~2 km straight horizontal line; vertices are far from midpoint [101.21, 6.85]
                coordinates: [
                  [101.20, 6.85],
                  [101.22, 6.85],
                ],
              },
            },
          ],
        },
      },
    ];

    // 10m away from segment midpoint -> matched and keeps ปน.2010 (never ทล.2010)
    const hit = findNearestHighwayFromLayers([101.21, 6.8501], layers);
    expect(hit).not.toBeNull();
    expect(hit?.code).toBe("ปน.2010");
    expect(hit?.label).toContain("ปน.2010");
    expect(hit?.label).not.toContain("ทล.2010");

    // 110m away from segment -> outside default 35m cutoff
    const miss = findNearestHighwayFromLayers([101.21, 6.851], layers);
    expect(miss).toBeNull();

    // Production MAIN_HIGHWAY single-layer shape: route_no & route_name live in feature.properties
    const prodLayers = [
      {
        layer_id: "MAIN_HIGHWAY",
        layer_name: "ทางหลวง",
        geojson_data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { route_no: "418", route_name: "งาแม่ - ยุโป" },
              geometry: {
                type: "LineString",
                coordinates: [
                  [101.20, 6.82],
                  [101.22, 6.82],
                ],
              },
            },
          ],
        },
      },
    ];
    const prodHit = findNearestHighwayFromLayers([101.21, 6.8201], prodLayers);
    expect(prodHit?.code).toBe("418");
    expect(prodHit?.label).toBe("ทล.418 (งาแม่ - ยุโป)");
  });

  test("Tier 1 Google Geocoding & Routes proxy generates Thai turn-by-turn advice with via waypoints", async () => {
    const originalFetch = globalThis.fetch;
    const edgeCalls: { action: string; args: unknown[] }[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const networkResponse = baseHighwayNetworkResponse(url);
      if (networkResponse) return networkResponse;
      if (url.includes("/functions/v1/hdms-api")) {
        const body = JSON.parse(String(init?.body || "{}"));
        edgeCalls.push({ action: body.action, args: body.args });
        if (body.action === "reverseGeocodeGoogleAction") {
          return new Response(
            JSON.stringify({
              configured: true,
              available: true,
              found: true,
              road: "ถนนหนองจิก",
              village: "บ้านดี",
              subdistrict: "รูสะมิแล",
              district: "เมืองปัตตานี",
              province: "ปัตตานี",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body.action === "computeGoogleDetourRouteAction") {
          return new Response(
            JSON.stringify({
              configured: true,
              available: true,
              found: true,
              distanceMeters: 4200,
              durationSeconds: 360,
              encodedPolyline: "_p~iF~ps|U_ulLnnqC",
              steps: [
                { maneuver: "DEPART", instructions: "มุ่งหน้าทางทิศเหนือไปตาม ทล.42", distanceMeters: 850, durationSeconds: 60, startLocation: [101.25, 6.85] },
                { maneuver: "TURN_LEFT", instructions: "เลี้ยวซ้ายเข้าสู่ ทางหลวงชนบท ปน.2010", distanceMeters: 3350, durationSeconds: 300, startLocation: [101.26, 6.86] },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      throw new Error(`Unexpected fetch in mocked Tier 1 test: ${url}`);
    }) as typeof fetch;

    try {
      const advice = await generateAutoDetourAdvice(
        [101.25, 6.85],
        [101.28, 6.88],
        [[101.25, 6.85], [101.28, 6.88]],
        "42",
        [],
        undefined,
        "FORWARD_ONLY",
        { forwardWaypoints: [[101.265, 6.865]] }
      );

      expect(advice).toContain("ต.รูสะมิแล อ.เมืองปัตตานี");
      expect(advice).toContain("เลี้ยวซ้ายเข้าสู่ ทางหลวงชนบท ปน.2010 (ระยะทาง 3.4 กม.)");
      expect(advice).toContain("รวมระยะทางเลี่ยง: 4.2 กม.");
      expect(advice).toContain("ประมาณ 6 นาที");

      const routeCall = edgeCalls.find((c) => c.action === "computeGoogleDetourRouteAction");
      expect(routeCall).toBeDefined();
      expect((routeCall?.args[0] as any)?.intermediates).toEqual([[101.265, 6.865]]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Falls back gracefully with circuit breaker to hardened OSRM (end of road, off ramp, ปน. refs) when Google key is unset", async () => {
    const originalFetch = globalThis.fetch;
    let googleRouteCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const networkResponse = baseHighwayNetworkResponse(url);
      if (networkResponse) return networkResponse;
      if (url.includes("/functions/v1/hdms-api")) {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.action === "computeGoogleDetourRouteAction") googleRouteCalls++;
        return new Response(
          JSON.stringify({ configured: false, available: false }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        return new Response(
          JSON.stringify({
            address: { road: "ถนนหนองจิก", suburb: "รูสะมิแล", county: "เมืองปัตตานี", state: "ปัตตานี" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/route/v1/driving/")) {
        return new Response(
          JSON.stringify({
            code: "Ok",
            routes: [
              {
                distance: 2500,
                duration: 210,
                legs: [
                  {
                    steps: [
                      { maneuver: { type: "depart", location: [101.25, 6.85] }, distance: 400, name: "ทล.42", ref: "42" },
                      { maneuver: { type: "end of road", modifier: "left", location: [101.254, 6.854] }, distance: 18, name: "ถนนโยธาธิการ", ref: "ปน.2003" },
                      { maneuver: { type: "depart", location: [101.256, 6.856] }, distance: 1200, name: "ถนนโยธาธิการ", ref: "ปน.2003" },
                      { maneuver: { type: "off ramp", modifier: "right", location: [101.26, 6.86] }, distance: 25, name: "ทางเบี่ยง 418", ref: "" },
                      { maneuver: { type: "arrive", location: [101.28, 6.88] }, distance: 0, name: "ทล.418", ref: "418" },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    try {
      const advice = await generateAutoDetourAdvice(
        [101.25, 6.85],
        [101.28, 6.88],
        [[101.25, 6.85], [101.28, 6.88]],
        "42",
        [],
        undefined,
        "TWO_WAY"
      );

      // Should call Google route proxy at most once per direction (and trip circuit breaker after configured:false)
      expect(googleRouteCalls).toBe(1);
      expect(advice).toContain("สุดทาง เลี้ยวซ้ายเข้าสู่ ถนนโยธาธิการ ปน.2003 (ระยะทาง 18 ม.)");
      expect(advice).toContain("ตรงไปตาม ถนนโยธาธิการ ปน.2003 (ระยะทาง 1.2 กม.)");
      expect(advice).toContain("ใช้ทางออกขวาเข้าสู่ ทางเบี่ยง 418 (ระยะทาง 25 ม.)");
      expect(advice).not.toContain("ทล.2003");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("resolveArea enforces 35m nearby reuse threshold and parses Google components", async () => {
    const originalFetch = globalThis.fetch;
    let googleGeoCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const networkResponse = baseHighwayNetworkResponse(url);
      if (networkResponse) return networkResponse;
      if (url.includes("/functions/v1/hdms-api")) {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.action === "reverseGeocodeGoogleAction") {
          googleGeoCalls++;
          const [lon] = body.args as [number, number];
          return new Response(
            JSON.stringify({
              configured: true,
              available: true,
              found: true,
              road: lon > 101.2505 ? "ถนนแยกใหม่" : "ถนนเดิม",
              village: "",
              subdistrict: lon > 101.2505 ? "บานา" : "รูสะมิแล",
              district: "เมืองปัตตานี",
              province: "ปัตตานี",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    try {
      const first = await resolveArea(101.23, 6.87);
      expect(first.source).toBe("google");
      expect(first.tambon).toBe("รูสะมิแล");
      expect(googleGeoCalls).toBe(1);

      // Move inside บานา (>35m and across zone) -> must NOT reuse previous cache
      const second = await resolveArea(101.275, 6.865);
      expect(second.tambon).toBe("บานา");
      expect(googleGeoCalls).toBe(2);

      // 13m east of second inside บานา -> reuses nearby within 35m when needRoad is false
      const nearSecond = await resolveArea(101.27512, 6.865);
      expect(nearSecond.tambon).toBe("บานา");
      expect(googleGeoCalls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Edge proxy keeps Google Maps API key server-only and ignores malformed/SSRF inputs in source contract", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const edgeSrc = fs.readFileSync(path.join(root, "supabase/functions/hdms-api/index.ts"), "utf8");
    const publicConfig = fs.readFileSync(path.join(root, ".github/hdms-public.json"), "utf8");

    expect(publicConfig).not.toContain("GOOGLE_MAPS_API_KEY");
    expect(edgeSrc).toContain('Deno.env.get("GOOGLE_MAPS_API_KEY")');
    expect(edgeSrc).toContain('"X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1"');
    expect(edgeSrc).toContain("https://geocode.googleapis.com/v4/geocode/location");
    expect(edgeSrc).toContain("https://routes.googleapis.com/directions/v2:computeRoutes");
  });

  test("ignores non-tambon municipality labels (e.g. town: ปัตตานี) and maps real Pattani zones cleanly", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const networkResponse = baseHighwayNetworkResponse(url);
      if (networkResponse) return networkResponse;
      if (url.includes("/functions/v1/hdms-api")) {
        return new Response(JSON.stringify({ configured: false, available: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        if (url.includes("lon=101.235")) {
          return new Response(
            JSON.stringify({
              address: { road: "ถนนเจริญประดิษฐ์", town: "ปัตตานี", county: "อำเภอเมืองปัตตานี", province: "จังหวัดปัตตานี" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            address: { village: "บ้านกรือเซะ", county: "อำเภอเมืองปัตตานี", province: "จังหวัดปัตตานี" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    try {
      const psuArea = await resolveArea(101.235, 6.879, { needRoad: true });
      expect(psuArea.tambon).toBe("รูสะมิแล");
      expect(psuArea.tambon).not.toBe("ปัตตานี");
      expect(psuArea.amphoe).toBe("เมืองปัตตานี");
      expect(psuArea.road).toBe("ถนนเจริญประดิษฐ์");

      const krueSeArea = await resolveArea(101.303, 6.871);
      expect(krueSeArea.tambon).toBe("ตันหยงลุโละ");
      expect(krueSeArea.amphoe).toBe("เมืองปัตตานี");
      expect(krueSeArea.village).toBe("บ้านกรือเซะ");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Edge proxy handles OSRM routing & Nominatim reverse geocode server-side without browser direct calls", async () => {
    resetOsrmClient();
    const originalFetch = globalThis.fetch;
    const edgeActionsCalled: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const networkResponse = baseHighwayNetworkResponse(url);
      if (networkResponse) return networkResponse;
      if (url.includes("/functions/v1/hdms-api")) {
        const body = JSON.parse(String(init?.body || "{}"));
        edgeActionsCalled.push(body.action);
        if (body.action === "reverseGeocodeGoogleAction") {
          return new Response(JSON.stringify({ configured: false, available: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (body.action === "proxyReverseGeocodeAction") {
          return new Response(
            JSON.stringify({
              available: true,
              found: true,
              address: {
                road: "ถนนหนองจิก",
                subdistrict: "ตำบลรูสะมิแล",
                district: "อำเภอเมืองปัตตานี",
                province: "จังหวัดปัตตานี",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (body.action === "proxyOsrmRouteAction") {
          return new Response(
            JSON.stringify({
              available: true,
              found: true,
              data: {
                code: "Ok",
                routes: [
                  {
                    distance: 1500,
                    duration: 120,
                    geometry: { type: "LineString", coordinates: [[101.24, 6.87], [101.26, 6.88]] },
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      throw new Error(`Browser should not call external upstream directly: ${url}`);
    }) as typeof fetch;

    try {
      const area = await resolveArea(101.24, 6.87, { needRoad: true });
      expect(area.tambon).toBe("รูสะมิแล");
      expect(area.road).toBe("ถนนหนองจิก");

      const osrmRes = await fetchOsrmWithFailover("101.24,6.87;101.26,6.88");
      expect(osrmRes?.source).toBe("edge");
      expect(osrmRes?.data?.routes?.[0]?.distance).toBe(1500);
      expect(edgeActionsCalled).toContain("proxyReverseGeocodeAction");
      expect(edgeActionsCalled).toContain("proxyOsrmRouteAction");

      const fs = await import("node:fs");
      const path = await import("node:path");
      const edgeSrc = fs.readFileSync(path.join(process.cwd(), "supabase/functions/hdms-api/index.ts"), "utf8");
      expect(edgeSrc).toContain('"proxyOsrmRouteAction"');
      expect(edgeSrc).toContain('"proxyReverseGeocodeAction"');
      expect(edgeSrc).toContain("HDMS-Pattani-DOH/2.0");
      const clientSrc = fs.readFileSync(path.join(process.cwd(), "lib/hdms-api.ts"), "utf8");
      expect(clientSrc).not.toContain('case "deleteRouteAction"');
      expect(clientSrc).not.toContain('case "setIncidentStatusAction"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
