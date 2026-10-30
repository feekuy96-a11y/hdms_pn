/**
 * อ่านไฟล์ข้อมูลเชิงพื้นที่ในเบราว์เซอร์ (ไม่ต้องอัปโหลดไปไหน)
 *   • Shapefile  : .zip (มี .shp .dbf .prj [.cpg]) — shpjs แปลงพิกัดตาม .prj เป็น WGS84 ให้
 *   • GeoJSON    : .geojson / .json
 *   • KML / GPX  : .kml / .gpx
 */
import { toLines } from "./geo";
import type { LngLat } from "./longdo";

export interface SpatialFeature { props: Record<string, any>; lines: LngLat[][] }
export interface SpatialResult { features: SpatialFeature[]; fields: string[]; warnings: string[] }

export async function readSpatialFile(file: File): Promise<SpatialResult> {
  const name = file.name.toLowerCase();
  const warnings: string[] = [];
  let fc: any;

  if (name.endsWith(".zip")) {
    const mod: any = await import("shpjs");
    const shp = mod.default ?? mod;
    fc = await shp(await file.arrayBuffer());
  } else if (name.endsWith(".kml") || name.endsWith(".gpx")) {
    const tj: any = await import("@tmcw/togeojson");
    const doc = new DOMParser().parseFromString(await file.text(), "text/xml");
    fc = name.endsWith(".kml") ? tj.kml(doc) : tj.gpx(doc);
  } else if (name.endsWith(".geojson") || name.endsWith(".json")) {
    fc = JSON.parse(await file.text());
  } else if (name.endsWith(".shp") || name.endsWith(".dbf") || name.endsWith(".prj")) {
    throw new Error("กรุณาบีบไฟล์ .shp .dbf .prj (และ .cpg) รวมเป็น .zip เดียว แล้วอัปโหลดไฟล์ zip");
  } else {
    throw new Error("รองรับ .zip (Shapefile), .geojson, .json, .kml, .gpx");
  }

  const colls: any[] = Array.isArray(fc) ? fc : [fc];                 // zip หลายเลเยอร์ → array
  const feats: any[] = colls.flatMap((c) => (c?.type === "FeatureCollection" ? c.features : c?.type === "Feature" ? [c] : []));
  const features: SpatialFeature[] = [];
  let skipped = 0;
  for (const f of feats) {
    const lines = toLines(f.geometry).filter((l) => l.length >= 2);
    if (!lines.length) { skipped++; continue; }
    features.push({ props: f.properties ?? {}, lines });
  }
  if (skipped) warnings.push(`ข้าม ${skipped} รายการที่ไม่ใช่เส้น (จุด/พื้นที่)`);
  if (!features.length) throw new Error("ไม่พบข้อมูลที่เป็นเส้นถนนในไฟล์นี้");

  const first = features[0].lines[0][0];
  if (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90) {
    warnings.push("พิกัดดูเหมือนไม่ใช่ lat/lng — ไฟล์ SHP อาจไม่มี .prj กรุณาแปลงเป็น WGS84 (EPSG:4326) ก่อน");
  } else if (first[0] < 97 || first[0] > 106 || first[1] < 5 || first[1] > 21) {
    warnings.push("พิกัดอยู่นอกประเทศไทย — ตรวจระบบพิกัดของไฟล์");
  }
  const fields = Array.from(new Set(features.slice(0, 200).flatMap((f) => Object.keys(f.props))));
  return { features, fields, warnings };
}
