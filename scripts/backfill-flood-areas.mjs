#!/usr/bin/env node
/**
 * One-off Dry-Run & SQL generator for backfilling `district` and `subdistrict`
 * on `public.doh_flood_routes` from `(lon_start, lat_start)` using the
 * 115 DOPA subdistrict polygons in `lib/gis-data.ts`.
 *
 * Usage:
 *   node scripts/backfill-flood-areas.mjs          # Read-only Dry-Run table
 *   node scripts/backfill-flood-areas.mjs --sql    # Output idempotent SQL + Rollback
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GIS_DATA_PATH = path.join(ROOT, "lib", "gis-data.ts");
const PUBLIC_CFG_PATH = path.join(ROOT, ".github", "hdms-public.json");

function loadDopaSubdistricts() {
  const src = fs.readFileSync(GIS_DATA_PATH, "utf8");
  const startMarker = "export const PATTANI_SUBDISTRICTS_DATA: SubdistrictDataEntry[] = [";
  const endMarker = "];\n\nexport const PATTANI_DISTRICTS_GEOJSON";
  const sIdx = src.indexOf(startMarker);
  const eIdx = src.indexOf(endMarker);
  if (sIdx === -1 || eIdx === -1) {
    throw new Error("Could not locate PATTANI_SUBDISTRICTS_DATA in lib/gis-data.ts");
  }
  const arraySrc = src.slice(sIdx + startMarker.length - 1, eIdx + 1);
  return JSON.parse(arraySrc);
}

function isPointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function resolveDopaArea(subdistricts, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { district: "", subdistrict: "", method: "invalid" };
  }
  for (const s of subdistricts) {
    const [minX, minY, maxX, maxY] = s.bounds;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (Array.isArray(s.polygon) && s.polygon.length >= 3 && isPointInRing([lon, lat], s.polygon)) {
      return { district: s.amphoe, subdistrict: s.tambon, method: "polygon" };
    }
  }
  let best = subdistricts[0];
  let bestDist = Infinity;
  for (const s of subdistricts) {
    const [cx, cy] = s.center || [
      (s.bounds[0] + s.bounds[2]) / 2,
      (s.bounds[1] + s.bounds[3]) / 2,
    ];
    const d = Math.hypot(lon - cx, lat - cy);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return { district: best.amphoe, subdistrict: best.tambon, method: "nearest-center" };
}

function sqlLiteral(val) {
  return `'${String(val).replace(/[\r\n]+/g, " ").replace(/'/g, "''")}'`;
}

function cleanLogText(val) {
  return String(val ?? "").replace(/[\r\n\t]+/g, " ").trim();
}

async function fetchFloodRoutesReadOnly() {
  const cfg = JSON.parse(fs.readFileSync(PUBLIC_CFG_PATH, "utf8"));
  const parsedUrl = new URL(cfg.supabaseUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Invalid supabaseUrl protocol");
  }
  const res = await fetch(`${parsedUrl.origin}/functions/v1/hdms-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.supabasePublishableKey,
      Authorization: `Bearer ${cfg.supabasePublishableKey}`,
    },
    body: JSON.stringify({ action: "getSystemDataAction", args: [{ light: true }] }),
  });
  if (!res.ok) {
    throw new Error(`Edge read failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.floodRoutes || [];
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const wantSql = args.has("--sql");
  const subdistricts = loadDopaSubdistricts();
  const routes = await fetchFloodRoutesReadOnly();

  const candidates = routes
    .filter((r) => !String(r.district || "").trim() || !String(r.subdistrict || "").trim())
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((r) => {
      const resolved = resolveDopaArea(subdistricts, Number(r.lon_start), Number(r.lat_start));
      return {
        id: r.id,
        route_no: r.route_no,
        section_name: r.section_name,
        lat_start: Number(r.lat_start),
        lon_start: Number(r.lon_start),
        currentDistrict: r.district || "",
        currentSubdistrict: r.subdistrict || "",
        proposedDistrict: resolved.district,
        proposedSubdistrict: resolved.subdistrict,
        method: resolved.method,
      };
    });

  if (wantSql) {
    if (candidates.length === 0) {
      console.log("-- No active flood routes require backfill.");
      return;
    }
    const valuesRows = candidates
      .map(
        (c) =>
          `    (${sqlLiteral(c.id)}, ${sqlLiteral(c.proposedDistrict)}, ${sqlLiteral(c.proposedSubdistrict)})`
      )
      .join(",\n");
    const idsList = candidates.map((c) => `  ${sqlLiteral(c.id)}`).join(",\n");

    console.log(`-- Backfill SQL (${candidates.length} rows)`);
    console.log(`UPDATE public.doh_flood_routes AS route`);
    console.log(`SET`);
    console.log(`  district = CASE WHEN COALESCE(TRIM(route.district), '') = '' THEN v.district ELSE route.district END,`);
    console.log(`  subdistrict = CASE WHEN COALESCE(TRIM(route.subdistrict), '') = '' THEN v.subdistrict ELSE route.subdistrict END`);
    console.log(`FROM (\n  VALUES\n${valuesRows}\n) AS v(id, district, subdistrict)`);
    console.log(`WHERE route.id = v.id`);
    console.log(`  AND (COALESCE(TRIM(route.district), '') = '' OR COALESCE(TRIM(route.subdistrict), '') = '');`);
    console.log(`\n-- Rollback SQL`);
    console.log(`-- UPDATE public.doh_flood_routes SET district = '', subdistrict = '' WHERE id IN (\n-- ${idsList.replace(/\n/g, "\n-- ")}\n-- );`);
    return;
  }

  console.log(`Dry-Run Summary: ${candidates.length} active rows with blank district/subdistrict (total fetched: ${routes.length})`);
  for (const c of candidates) {
    console.log(
      `${cleanLogText(c.id)} | ทล.${cleanLogText(c.route_no)} | ${cleanLogText(c.section_name)} | (${c.lat_start}, ${c.lon_start}) => ต.${cleanLogText(c.proposedSubdistrict)} อ.${cleanLogText(c.proposedDistrict)} [${c.method}]`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
