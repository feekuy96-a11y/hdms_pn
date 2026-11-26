import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const cache = resolve(process.env.HDMS_GEOTHAI_CACHE || join(root, ".cache/geothai"));
const output = join(root, "public/boundaries/th");
const stages = ["provinces", "districts", "subdistricts"];
const shapes = "https://raw.githubusercontent.com/GeoThai/boundaries/v2026.10.23";
const names = "https://raw.githubusercontent.com/GeoThai/data/v2026.10.22/json";
const pins = {
  "boundaries-provinces.geojson": "26741e78228724f03f39c35648027034c75faaeb4fed6db0cb0b44e517a93eac",
  "boundaries-districts.geojson": "6c52e6c12bccdb7abeb67216f0dd28d3a6d4342b9d93e270e37b2f546def6d75",
  "boundaries-subdistricts.geojson": "165f0659e4095775617250f6d75982685be4f0ec44ce589ed3e1b7419f0509f5",
  "registry-provinces.json": "62399e4f6591d1f80a3255e462ec5a22eb48cfca7788a36e2b83f1d538e194ab",
  "registry-districts.json": "505f01d4c1baf27eab7f15854b52d1b6bccf98ae32434a03b1e5019c843a03de",
  "registry-subdistricts.json": "831cd24e385896288ddc5a0d488364820c84f24544f7c533aab44ddcb15c1189",
};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const check = (predicate, message) => { if (!predicate) throw new Error(message); };

async function load(name, url) {
  const path = join(cache, name);
  let bytes = await readFile(path).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!bytes) {
    check(process.env.HDMS_GEOTHAI_OFFLINE !== "1", `Missing offline GeoThai source: ${name}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    check(response.ok, `GeoThai download failed for ${name} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    check(sha256(bytes) === pins[name], `Unexpected GeoThai download checksum: ${name}`);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, path);
  }
  check(sha256(bytes) === pins[name], `GeoThai cache checksum mismatch: ${name}`);
  return JSON.parse(bytes);
}

await mkdir(cache, { recursive: true });
const datasets = await Promise.all(stages.map(async stage => ({
  stage,
  shapes: await load(`boundaries-${stage}.geojson`, `${shapes}/${stage}.geojson`),
  names: await load(`registry-${stage}.json`, `${names}/${stage}.json`),
})));
const areas = new Map();
const children = new Map();
const features = new Map();
const sharedGroups = new Set();
for (const [level, dataset] of datasets.entries()) {
  const expected = [77, 928, 7436][level];
  check(dataset.names.length === expected, `Unexpected registry count: ${dataset.stage}`);
  const codes = new Map(dataset.names.map(row => [row.code, row]));
  check(codes.size === expected, `Duplicate registry code: ${dataset.stage}`);
  for (const row of codes.values()) {
    const code = row.code;
    const parent = code.slice(0, -2);
    check(new RegExp(`^\\d{${2 * level + 2}}$`).test(code) && row.name_th?.trim(), `Invalid area: ${code}`);
    if (parent) {
      check(areas.has(parent) && row.province_code === code.slice(0, 2) &&
        (level !== 2 || row.district_code === parent), `Invalid hierarchy: ${code}`);
    }
    const area = { code, name: row.name_th };
    areas.set(code, area);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(area);
  }
  check(dataset.shapes.type === "FeatureCollection" && dataset.shapes.features.length === [77, 928, 7425][level], `Unexpected geometry count: ${dataset.stage}`);
  for (const entry of dataset.shapes.features) {
    const p = entry.properties;
    const associated = p.code === null ? p.codes : [p.code];
    check(Array.isArray(associated) && associated.length && (p.code !== null ||
      (level === 2 && associated.length > 1 && p.province_code === "10")), "Invalid shared shape");
    if (associated.length > 1) sharedGroups.add(associated.join(","));
    const g = entry.geometry;
    check(entry.type === "Feature" && ["Polygon", "MultiPolygon"].includes(g.type), "Unsupported GeoThai geometry");
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    let positions = 0;
    for (const polygon of polygons) {
      check(polygon.length, "Empty polygon");
      for (const ring of polygon) {
        positions += ring.length;
        check(ring.length >= 4 && ring[0].every((x, n) => x === ring.at(-1)[n]) &&
          ring.every(([lon, lat, ...rest]) => !rest.length && Number.isFinite(lon) && Number.isFinite(lat) &&
            lon >= 96 && lon <= 107 && lat >= 4 && lat <= 22), "Invalid WGS84 polygon");
      }
    }
    check(positions > 0 && positions <= 100000, "Geometry position budget exceeded");
    const feature = { type: "Feature", properties: { codes: associated }, geometry: g };
    for (const code of associated) {
      const row = codes.get(code);
      check(row && !features.has(code) && (p.code === null || row.name_th === p.name_th) &&
        (level === 0 || row.province_code === p.province_code) &&
        (level !== 2 || row.district_code === p.district_code), `Invalid shape join: ${code}`);
      features.set(code, feature);
      codes.delete(code);
    }
  }
  check(codes.size === 0, `Unmapped codes: ${[...codes.keys()].join(", ")}`);
}
check(sharedGroups.size === 7, "Unexpected count of shared shapes");
for (const childAreas of children.values()) childAreas.sort((a, b) => a.code.localeCompare(b.code, "en"));

const nextOutput = `${output}-${process.pid}.tmp`;
await mkdir(nextOutput, { recursive: true });
try {
  let raw = 0;
  let max = 0;
  let maxId = "";
  async function save(id, payload) {
    const json = Buffer.from(JSON.stringify(payload));
    check(json.byteLength <= (id === "index" ? 32_000 : 1_000_000), `Boundary asset too large: ${id}`);
    raw += json.byteLength;
    if (json.byteLength > max) { max = json.byteLength; maxId = id; }
    await writeFile(join(nextOutput, id + ".json"), json);
    if (["index", "94", "9401", "940101", "10", "1009", "100905"].includes(id)) {
      console.log(`GeoThai ${id}: ${json.byteLength} B / ${gzipSync(json).byteLength} B gzip`);
    }
  }
  for (const code of [...areas.keys()].sort()) {
    await save(code, { version: 2, code, children: children.get(code) || [], feature: features.get(code) });
  }
  await save("index", { version: 2, provinces: children.get("") });
  await writeFile(join(nextOutput, "ATTRIBUTION.md"), await readFile(join(root, "docs/ADMIN_BOUNDARY_ASSETS.md")));
  await rm(output, { recursive: true, force: true });
  await rename(nextOutput, output);
  console.log(`GeoThai: ${areas.size + 1} assets; ${raw} B raw; largest ${maxId} at ${max} B.`);
} finally {
  await rm(nextOutput, { recursive: true, force: true });
}
