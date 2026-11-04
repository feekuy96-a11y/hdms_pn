import { kml, gpx } from "@tmcw/togeojson";
import { extractFeaturesFromGeoJson, type ExtractedGisFeature } from "./gis-utils";

export async function readRouteFile(file: File): Promise<ExtractedGisFeature[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 20 MB");
  const extension = file.name.split(".").pop()?.toLowerCase();
  let data: unknown;
  const parseXml = (text: string, format: "kml" | "gpx") => {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("โครงสร้าง XML ไม่ถูกต้อง");
    return format === "kml" ? kml(xml) : gpx(xml);
  };
  if (extension === "kmz") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && /\.kml$/i.test(entry.name));
    if (!entries.length) throw new Error("ไม่พบ KML ใน KMZ");
    const features = [];
    for (const entry of entries) {
      const text = await entry.async("text");
      if (text.length > 20 * 1024 * 1024) throw new Error("KML หลังคลายไฟล์มีขนาดเกินกำหนด");
      features.push(...parseXml(text, "kml").features);
    }
    data = { type: "FeatureCollection", features };
  } else if (extension === "zip" || extension === "shp") {
    data = await (await import("shpjs")).default(await file.arrayBuffer());
  } else if (extension === "kml" || extension === "gpx") {
    data = parseXml(await file.text(), extension);
  } else if (extension === "json" || extension === "geojson") {
    data = JSON.parse(await file.text());
  } else throw new Error("รองรับ KML, KMZ, Shapefile (.zip หรือ .shp), GeoJSON และ GPX เท่านั้น");
  const features = extractFeaturesFromGeoJson(data);
  if (!features.length) throw new Error("ไม่พบเส้นทางในไฟล์");
  const seen = new Set<string>();
  return features.filter(({ coords }) => {
    if (coords.length < 2 || coords.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) throw new Error("พิกัดเส้นทางไม่ถูกต้อง ต้องเป็น WGS84");
    const key = [JSON.stringify(coords), JSON.stringify([...coords].reverse())].sort()[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
