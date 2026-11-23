import { calculatePolylineLengthKm } from "./geo-math";

export interface ExtractedGisFeature {
  coords: [number, number][];
  properties: Record<string, any>;
  lengthKm: number;
}

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จากไฟล์ KMZ
 */
export async function extractFeaturesFromKmz(file: File): Promise<ExtractedGisFeature[]> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    let kmlContent = "";

    for (const filename of Object.keys(zip.files)) {
      if (filename.toLowerCase().endsWith(".kml")) {
        kmlContent = await zip.files[filename].async("text");
        break;
      }
    }

    if (kmlContent) {
      return extractFeaturesFromKml(kmlContent);
    }
  } catch (err) {
    console.warn("Error parsing KMZ with JSZip:", err);
  }
  return [];
}

/**
 * สกัดแนวเส้นทางจากไฟล์ KMZ (บีบอัดไฟล์ KML ภายใน)
 */
export async function extractLinesFromKmz(file: File): Promise<[number, number][][]> {
  const features = await extractFeaturesFromKmz(file);
  return features.map((f) => f.coords);
}

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จาก GeoJSON
 */
export function extractFeaturesFromGeoJson(geojsonObj: any): ExtractedGisFeature[] {
  const result: ExtractedGisFeature[] = [];
  try {
    const collections = Array.isArray(geojsonObj) ? geojsonObj : [geojsonObj];
    collections.forEach((col) => {
      const features = col.features || [col];
      features.forEach((f: any) => {
        const geom = f.geometry || f;
        const props = f.properties || {};
        if (!geom) return;
        if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
          result.push(
            ...extractFeaturesFromGeoJson(
              geom.geometries.map((geometry: any) => ({ type: "Feature", geometry, properties: props }))
            )
          );
        } else if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
          result.push({
            coords: geom.coordinates,
            properties: props,
            lengthKm: calculatePolylineLengthKm(geom.coordinates),
          });
        } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
          geom.coordinates.forEach((seg: [number, number][]) => {
            result.push({
              coords: seg,
              properties: props,
              lengthKm: calculatePolylineLengthKm(seg),
            });
          });
        }
      });
    });
  } catch (e) {
    console.warn("Error parsing GeoJSON features:", e);
  }
  return result;
}

/**
 * ดึงเส้น LineString / MultiLineString จาก GeoJSON (รองรับแบบเดิม)
 */
export function extractLinesFromGeoJson(geojsonObj: any): [number, number][][] {
  const features = extractFeaturesFromGeoJson(geojsonObj);
  return features.map((f) => f.coords);
}

/**
 * สกัดฟีเจอร์เส้นทางพร้อมข้อมูล Attributes จากไฟล์ KML
 */
export function extractFeaturesFromKml(kmlText: string): ExtractedGisFeature[] {
  const result: ExtractedGisFeature[] = [];
  try {
    const xml = new DOMParser().parseFromString(kmlText, "text/xml");
    const placemarks = xml.getElementsByTagName("Placemark");

    if (placemarks.length > 0) {
      for (let i = 0; i < placemarks.length; i++) {
        const p = placemarks[i];
        const nameNode = p.getElementsByTagName("name")[0];
        const descNode = p.getElementsByTagName("description")[0];
        const name = nameNode ? (nameNode.textContent || "").trim() : "";
        const description = descNode ? (descNode.textContent || "").trim() : "";

        const props: Record<string, any> = { name, description };

        // Parse SimpleData in ExtendedData if available
        const simpleDataNodes = p.getElementsByTagName("SimpleData");
        for (let j = 0; j < simpleDataNodes.length; j++) {
          const s = simpleDataNodes[j];
          const attrName = s.getAttribute("name");
          if (attrName) {
            props[attrName] = (s.textContent || "").trim();
          }
        }

        const coordNodes = p.getElementsByTagName("coordinates");
        for (let j = 0; j < coordNodes.length; j++) {
          const raw = (coordNodes[j].textContent || "").trim();
          const pts = raw
            .split(/\s+/)
            .map((chunk) => {
              const [lon, lat] = chunk.split(",");
              return [Number(lon), Number(lat)] as [number, number];
            })
            .filter((pt) => !isNaN(pt[0]) && !isNaN(pt[1]));

          if (pts.length >= 2) {
            result.push({
              coords: pts,
              properties: props,
              lengthKm: calculatePolylineLengthKm(pts),
            });
          }
        }
      }
    } else {
      // Fallback for coordinate nodes without Placemarks
      const coordNodes = xml.getElementsByTagName("coordinates");
      for (let i = 0; i < coordNodes.length; i++) {
        const raw = (coordNodes[i].textContent || "").trim();
        const pts = raw
          .split(/\s+/)
          .map((chunk) => {
            const [lon, lat] = chunk.split(",");
            return [Number(lon), Number(lat)] as [number, number];
          })
          .filter((pt) => !isNaN(pt[0]) && !isNaN(pt[1]));

        if (pts.length >= 2) {
          result.push({
            coords: pts,
            properties: { name: `เส้นทางที่ ${i + 1}`, description: "" },
            lengthKm: calculatePolylineLengthKm(pts),
          });
        }
      }
    }
  } catch (e) {
    console.warn("Error parsing KML features:", e);
  }
  return result;
}

/**
 * สกัดแนวเส้นทางจากเนื้อหาไฟล์ KML (รองรับแบบเดิม)
 */
export function extractLinesFromKml(kmlText: string): [number, number][][] {
  const features = extractFeaturesFromKml(kmlText);
  return features.map((f) => f.coords);
}

/**
 * ดึงรายชื่อฟิลด์ Attribute ทั้งหมดที่มีในชุดข้อมูล GIS
 */
export function extractAvailableGisFields(features: ExtractedGisFeature[]): string[] {
  const fieldSet = new Set<string>();
  features.forEach((f) => {
    Object.keys(f.properties || {}).forEach((k) => {
      if (k && typeof k === "string") fieldSet.add(k);
    });
  });
  return Array.from(fieldSet);
}

/**
 * ตรวจจับการจับคู่ฟิลด์อัจฉริยะ (Smart Field Mapping) ตามมาตรฐานข้อมูลกรมทางหลวง
 */
export function detectSmartFieldMapping(fields: string[]): {
  routeCodeField: string;
  routeNameField: string;
  routeTypeField: string;
} {
  let routeCodeField = "";
  let routeNameField = "";
  let routeTypeField = "";

  for (const f of fields) {
    const lower = f.toLowerCase();
    if (!routeCodeField && /^(road_?no|route_?no|route|hwy_?no|hwy|code|ref|สายทาง|ทล|no)$/i.test(lower)) {
      routeCodeField = f;
    }
    if (!routeNameField && /^(road_?name|name|section_?name|section|desc|description|label|title|ชื่อสายทาง)$/i.test(lower)) {
      routeNameField = f;
    }
    if (!routeTypeField && /^(class|type|category|hier|road_?type|ประเภท)$/i.test(lower)) {
      routeTypeField = f;
    }
  }

  return { routeCodeField, routeNameField, routeTypeField };
}
