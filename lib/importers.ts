/**
 * อ่านไฟล์ข้อมูลเชิงพื้นที่ในเบราว์เซอร์ (ไม่ส่งไฟล์ดิบไปไหน)
 *   • KML / KMZ  : ใช้ togeojson ก่อน ถ้าไม่ได้เส้น → อ่าน <coordinates> ของ LineString เอง (กันไฟล์จาก Google Earth/My Maps แปลกๆ)
 *   • Shapefile  : .zip (.shp .dbf .prj [.cpg]) — shpjs แปลงพิกัดตาม .prj เป็น WGS84
 *   • GeoJSON    : .geojson / .json     • GPX : .gpx
 */
import { toLines } from "./geo";
import type { LngLat } from "./longdo";

export interface SpatialFeature { props: Record<string, any>; lines: LngLat[][] }
export interface SpatialResult { features: SpatialFeature[]; fields: string[]; warnings: string[] }

/** KML ดิบ: หา <Placemark> ที่มี LineString (รวมใน MultiGeometry) */
function parseKmlManually(doc: Document): any[] {
  const feats: any[] = [];
  const marks = Array.from(doc.getElementsByTagName("Placemark"));
  for (const pm of marks) {
    const name = pm.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const desc = pm.getElementsByTagName("description")[0]?.textContent?.trim() ?? "";
    const lines: number[][][] = [];
    for (const ls of Array.from(pm.getElementsByTagName("LineString"))) {
      const txt = ls.getElementsByTagName("coordinates")[0]?.textContent ?? "";
      const pts = txt.trim().split(/\s+/).map((t) => t.split(",").map(Number)).filter((a) => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]));
      if (pts.length >= 2) lines.push(pts.map((a) => [a[0], a[1]]));
    }
    if (lines.length) feats.push({ type: "Feature", properties: { name, description: desc }, geometry: { type: "MultiLineString", coordinates: lines } });
  }
  return feats;
}

async function kmlToFeatures(text: string): Promise<any[]> {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("ไฟล์ KML อ่านไม่ได้ (รูปแบบ XML ไม่ถูกต้อง)");
  let feats: any[] = [];
  try {
    const tj: any = await import("@tmcw/togeojson");
    feats = (tj.kml(doc)?.features ?? []) as any[];
  } catch { /* ใช้ตัวอ่านสำรองด้านล่าง */ }
  if (!feats.some((f) => toLines(f.geometry).length)) feats = parseKmlManually(doc);
  return feats;
}

async function unzip(buf: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const { unzipSync } = await import("fflate");
  return unzipSync(new Uint8Array(buf));
}

export async function readSpatialFile(file: File): Promise<SpatialResult> {
  const name = file.name.toLowerCase();
  const warnings: string[] = [];
  let feats: any[] = [];

  if (name.endsWith(".kml")) {
    feats = await kmlToFeatures(await file.text());
  } else if (name.endsWith(".kmz")) {
    const files = await unzip(await file.arrayBuffer());
    const k = Object.keys(files).find((n) => n.toLowerCase().endsWith(".kml"));
    if (!k) throw new Error("ไม่พบไฟล์ .kml ภายใน KMZ");
    feats = await kmlToFeatures(new TextDecoder("utf-8").decode(files[k]));
  } else if (name.endsWith(".gpx")) {
    const tj: any = await import("@tmcw/togeojson");
    feats = tj.gpx(new DOMParser().parseFromString(await file.text(), "text/xml")).features ?? [];
  } else if (name.endsWith(".geojson") || name.endsWith(".json")) {
    const j = JSON.parse(await file.text());
    feats = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : [{ type: "Feature", properties: {}, geometry: j }];
  } else if (name.endsWith(".zip")) {
    const buf = await file.arrayBuffer();
    const inner = await unzip(buf);
    const kml = Object.keys(inner).find((n) => n.toLowerCase().endsWith(".kml"));
    if (kml && !Object.keys(inner).some((n) => n.toLowerCase().endsWith(".shp"))) {
      feats = await kmlToFeatures(new TextDecoder("utf-8").decode(inner[kml]));
    } else {
      const mod: any = await import("shpjs");
      const fc = await (mod.default ?? mod)(buf);
      const colls: any[] = Array.isArray(fc) ? fc : [fc];
      feats = colls.flatMap((c) => (c?.type === "FeatureCollection" ? c.features : []));
    }
  } else if (/\.(shp|dbf|prj)$/.test(name)) {
    throw new Error("กรุณาบีบไฟล์ .shp .dbf .prj (และ .cpg) รวมเป็น .zip เดียว แล้วอัปโหลดไฟล์ zip");
  } else {
    throw new Error("รองรับ .kml, .kmz, .zip (Shapefile), .geojson, .json, .gpx");
  }

  const features: SpatialFeature[] = [];
  const skippedKinds: Record<string, number> = {};
  for (const f of feats) {
    const lines = toLines(f?.geometry).filter((l) => l.length >= 2);
    if (!lines.length) { const t = f?.geometry?.type ?? "ไม่ทราบ"; skippedKinds[t] = (skippedKinds[t] ?? 0) + 1; continue; }
    features.push({ props: f.properties ?? {}, lines });
  }
  const sk = Object.entries(skippedKinds).map(([k, v]) => `${k} ${v}`).join(", ");
  if (sk) warnings.push(`ข้ามรายการที่ไม่ใช่เส้น: ${sk} (ระบบนำเข้าเฉพาะเส้นถนน — ถ้าถนนเป็น Polygon ให้แปลงเป็นเส้นกลางถนนก่อน)`);
  if (!features.length) throw new Error("ไม่พบ “เส้น” ถนนในไฟล์นี้ (พบแต่จุด/พื้นที่) — ตรวจว่าไฟล์เป็นเส้นทาง (LineString)");

  const first = features[0].lines[0][0];
  if (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90) warnings.push("พิกัดดูเหมือนไม่ใช่ lat/lng — ไฟล์อาจไม่มี .prj กรุณาแปลงเป็น WGS84 (EPSG:4326) ก่อน");
  else if (first[0] < 97 || first[0] > 106 || first[1] < 5 || first[1] > 21) warnings.push("พิกัดอยู่นอกประเทศไทย — ตรวจระบบพิกัดของไฟล์");

  const fields = Array.from(new Set(features.slice(0, 200).flatMap((f) => Object.keys(f.props))));
  return { features, fields, warnings };
}
