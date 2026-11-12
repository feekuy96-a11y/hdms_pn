import { test, expect } from "@playwright/test";
import { resolveDetourGoogleMapsNavigation, getUnifiedTrafficStatus, sampleWaypointsForGoogleMaps } from "../../lib/detour-navigation";
import { DetourRoute, FloodRoute } from "../../db/default-data";

test.describe("Phase 5.7: Google Maps Detour Navigation Architecture (5 Steps)", () => {
  const dummyFlood: FloodRoute = {
    id: "flood-closed-1",
    route_no: "418",
    section_name: "ตอนดอนยาง - ยะลา",
    km_start: "10+000",
    km_end: "10+500",
    lat_start: 6.85,
    lon_start: 101.25,
    lat_end: 6.855,
    lon_end: 101.255,
    coordinates_json: [[101.25, 6.85], [101.255, 6.855]],
    water_level_cm: 65,
    traffic_status: "CLOSED",
    latest_photo_url: "",
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  test("Step 1: Uses approved Google Maps URL directly when available", () => {
    const detourWithApprovedUrl: DetourRoute = {
      id: "detour-1",
      direction_mode: "TWO_WAY",
      flood_id_ref: null,
      route_name: "ทางเลี่ยงดอนยาง",
      lat_start: 6.84,
      lon_start: 101.23,
      lat_end: 6.87,
      lon_end: 101.28,
      coordinates_json: [[101.23, 6.84], [101.28, 6.87]],
      description: "ทางเลี่ยงแนะนำ",
      is_active: true,
      updated_at: new Date().toISOString(),
      detour_meta: {
        google_maps_url_forward: "https://maps.app.goo.gl/officerApproved123",
      },
    };

    const result = resolveDetourGoogleMapsNavigation(detourWithApprovedUrl, "FORWARD");
    expect(result.isValid).toBe(true);
    expect(result.source).toBe("APPROVED_URL");
    expect(result.url).toBe("https://maps.app.goo.gl/officerApproved123");
  });

  test("Step 2 & 4: Blocks detour and warns when route conflicts with closed flood", () => {
    const detourThroughFlood: DetourRoute = {
      id: "detour-bad",
      direction_mode: "TWO_WAY",
      flood_id_ref: null,
      route_name: "ทางเลี่ยงตัดผ่านน้ำท่วม",
      lat_start: 6.84,
      lon_start: 101.24,
      lat_end: 6.86,
      lon_end: 101.26,
      // แนวเส้นวิ่งผ่านพิกัดของ flood-closed-1 พอดี
      coordinates_json: [
        [101.24, 6.84],
        [101.252, 6.852],
        [101.26, 6.86],
      ],
      description: "อันตราย",
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const result = resolveDetourGoogleMapsNavigation(detourThroughFlood, "FORWARD", [dummyFlood]);
    expect(result.isValid).toBe(false);
    expect(result.source).toBe("UNVERIFIED");
    expect(result.url).toBeNull();
    expect(result.warning).toContain("ปิดการจราจร");
  });

  test("Step 3: Constructs correct A -> B URL with origin, destination, and waypoints", () => {
    const safeDetour: DetourRoute = {
      id: "detour-safe",
      direction_mode: "TWO_WAY",
      flood_id_ref: null,
      route_name: "ทางเลี่ยงปลอดภัย",
      lat_start: 6.84,
      lon_start: 101.22,
      lat_end: 6.88,
      lon_end: 101.29,
      coordinates_json: [
        [101.22, 6.84],
        [101.24, 6.85],
        [101.26, 6.86],
        [101.27, 6.87],
        [101.29, 6.88],
      ],
      description: "ปลอดภัย",
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const forwardNav = resolveDetourGoogleMapsNavigation(safeDetour, "FORWARD", [dummyFlood]);
    expect(forwardNav.isValid).toBe(true);
    expect(forwardNav.source).toBe("GENERATED_WAYPOINTS");
    expect(forwardNav.url).toContain("origin=6.84,101.22");
    expect(forwardNav.url).toContain("destination=6.88,101.29");
    expect(forwardNav.url).toContain("waypoints=");
    expect(forwardNav.url).toContain("travelmode=driving");
  });

  test("Step 3 (Reverse): Reverses origin/destination for B -> A when no reverse coords specified", () => {
    const safeDetour: DetourRoute = {
      id: "detour-safe-rev",
      flood_id_ref: null,
      route_name: "ทางเลี่ยงไปกลับ",
      lat_start: 6.84,
      lon_start: 101.22,
      lat_end: 6.88,
      lon_end: 101.29,
      coordinates_json: [
        [101.22, 6.84],
        [101.25, 6.86],
        [101.29, 6.88],
      ],
      description: "ทางเลี่ยง",
      is_active: true,
      updated_at: new Date().toISOString(),
      direction_mode: "TWO_WAY",
    };

    const revNav = resolveDetourGoogleMapsNavigation(safeDetour, "REVERSE", []);
    expect(revNav.isValid).toBe(true);
    expect(revNav.source).toBe("GENERATED_WAYPOINTS");
    // ต้นทางต้องกลายเป็นจุด B (6.88, 101.29) และปลายทางเป็นจุด A (6.84, 101.22)
    expect(revNav.url).toContain("origin=6.88,101.29");
    expect(revNav.url).toContain("destination=6.84,101.22");
  });

  test("Waypoint sampling respects the <= 8 waypoints limit", () => {
    const manyCoords: [number, number][] = [];
    for (let i = 0; i < 50; i++) {
      manyCoords.push([101.0 + i * 0.01, 6.0 + i * 0.01]);
    }
    const sampled = sampleWaypointsForGoogleMaps(manyCoords, 8);
    expect(sampled.length).toBeLessThanOrEqual(8);
  });
});

test.describe("Phase 5.1: Unified Traffic Status Presentation (5 Statuses + Pending)", () => {
  test("Accurately differentiates 5 traffic statuses", () => {
    const sClosed = getUnifiedTrafficStatus("CLOSED", 70);
    expect(sClosed.color).toBe("red");
    expect(sClosed.icon).toBe("⛔");
    expect(sClosed.label).toBe("ผ่านไม่ได้");

    const sWarning = getUnifiedTrafficStatus("WARNING", 35);
    expect(sWarning.color).toBe("orange");
    expect(sWarning.icon).toBe("⚠️");
    expect(sWarning.label).toBe("รถเล็กไม่สามารถผ่านได้");

    const sOneLane = getUnifiedTrafficStatus("ONE_LANE", 20);
    expect(sOneLane.color).toBe("amber");
    expect(sOneLane.icon).toBe("↔️");
    expect(sOneLane.label).toBe("รถเล็กผ่านได้ ๑ ช่องทาง");

    const sLightVehicles = getUnifiedTrafficStatus("LIGHT_VEHICLES_ONLY", 15);
    expect(sLightVehicles.color).toBe("sky");
    expect(sLightVehicles.icon).toBe("🚗");
    expect(sLightVehicles.label).toBe("รถเล็กผ่านได้");

    const sPassable = getUnifiedTrafficStatus("PASSABLE", 0);
    expect(sPassable.color).toBe("emerald");
    expect(sPassable.icon).toBe("✅");
    expect(sPassable.label).toBe("ผ่านได้ปกติ");

    const sPending = getUnifiedTrafficStatus("PENDING_VERIFICATION", 0);
    expect(sPending.color).toBe("slate");
    expect(sPending.icon).toBe("⏳");
    expect(sPending.label).toBe("รอตรวจสอบสถานะ");

    const sUnknown = getUnifiedTrafficStatus("UNRECOGNIZED_STATUS", 0);
    expect(sUnknown.key).toBe("PENDING_VERIFICATION");
    expect(sUnknown.label).toBe("รอตรวจสอบสถานะ");
  });
});
