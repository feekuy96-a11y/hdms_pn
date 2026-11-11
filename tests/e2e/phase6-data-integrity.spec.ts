import { test, expect } from "@playwright/test";
import { resolveDetourGoogleMapsNavigation } from "../../lib/detour-navigation";
import { parseFloodDirectionMeta } from "../../lib/flood-event-schema";
import { resolveVisibleArrowColor } from "../../lib/map-style-utils";
import { insertVertex, moveVertex, removeVertex, nearestInsertIndex } from "../../lib/line-edit";
import type { DetourRoute } from "../../db/default-data";

const base = {
  id: "test-detour", route_name: "Test", flood_id_ref: null,
  lat_start: 6.84, lon_start: 101.2, lat_end: 6.88, lon_end: 101.3,
  coordinates_json: [[101.2, 6.84], [101.22, 6.85], [101.3, 6.88]],
  is_active: true, updated_at: "2026-11-11T00:00:00Z", description: "",
} as DetourRoute;

test.describe("Phase 6 data integrity and map contracts", () => {
  test("missing direction remains unverified, never inferred as two-way", () => {
    const nav = resolveDetourGoogleMapsNavigation(base, "REVERSE", []);
    expect(nav.isValid).toBe(false);
    expect(nav.url).toBeNull();
    expect(nav.warning).toContain("ทิศทาง");
  });

  test("approved Google Maps URL may not point to a lookalike domain", () => {
    const detour = { ...base, direction_mode: "TWO_WAY" as const,
      detour_meta: { google_maps_url_forward: "https://www.google.com.maps.attacker.example/dir/" } };
    const nav = resolveDetourGoogleMapsNavigation(detour, "FORWARD", []);
    expect(nav.isValid).toBe(true);
    expect(nav.source).toBe("GENERATED_WAYPOINTS");
    expect(nav.url).toContain("www.google.com/maps/dir/?api=1");
  });

  test("reverse navigation is blocked for a forward-only detour", () => {
    const nav = resolveDetourGoogleMapsNavigation({ ...base, direction_mode: "FORWARD_ONLY" }, "REVERSE", []);
    expect(nav.isValid).toBe(false);
    expect(nav.url).toBeNull();
  });

  test("unverified flood metadata never invents A->B or two-way", () => {
    expect(parseFloodDirectionMeta({}, { id: "f1", road_side: "UNKNOWN" }).directionCode).toBe("UNKNOWN");
    expect(parseFloodDirectionMeta({}, { id: "f2", road_side: "BOTH" }).directionCode).toBe("BOTH");
    expect(parseFloodDirectionMeta({}, { id: "f3", road_side: "LEFT" }).directionCode).toBe("A_TO_B");
  });

  test("arrows remain visible against white or dark route lines", () => {
    expect(resolveVisibleArrowColor("#ffffff", "#ffffff")).toBe("#0f172a");
    expect(resolveVisibleArrowColor("#020617", "#0f172a")).toBe("#ffffff");
    expect(resolveVisibleArrowColor("#facc15", "#0f172a")).toBe("#0f172a");
  });

  test("all three line types use safe add/move/remove vertex helpers", () => {
    const path: [number, number][] = [[101, 6], [102, 7]];
    const inserted = insertVertex(path, nearestInsertIndex(path, [101.4, 6.4]).index, [101.4, 6.4]);
    expect(inserted).toHaveLength(3);
    const moved = moveVertex(inserted, 1, [101.5, 6.5]);
    expect(moved[1]).toEqual([101.5, 6.5]);
    expect(path[0]).toEqual([101, 6]);
    expect(removeVertex(moved, 1)).toEqual(path);
    expect(removeVertex(path, 1)).toEqual(path); // never delete below two endpoints
  });
});
