import JSZip from "jszip";

export type GisExportFormat = "csv" | "geojson" | "kml" | "kmz" | "shapefile";

type ExportFeature = GeoJSON.Feature<GeoJSON.LineString, Record<string, unknown>>;

const escapeXml = (value: unknown) => String(value ?? "").replace(/[<>&"']/g, (char) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
}[char] || char));

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const toKml = (features: ExportFeature[]) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${features.map((feature) => {
  const properties = feature.properties || {};
  const name = properties.name || properties.route_name || properties.section_name || properties.route_no || "เส้นทาง";
  const description = Object.entries(properties).map(([key, value]) => `${key}: ${String(value ?? "")}`).join("\n");
  const coordinates = feature.geometry.coordinates.map(([lon, lat]) => `${lon},${lat},0`).join(" ");
  return `<Placemark><name>${escapeXml(name)}</name><description>${escapeXml(description)}</description><LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString></Placemark>`;
}).join("")}</Document></kml>`;

export async function exportLineFeatures(
  features: ExportFeature[],
  format: GisExportFormat,
  basename: string,
) {
  const collection: GeoJSON.FeatureCollection<GeoJSON.LineString, Record<string, unknown>> = { type: "FeatureCollection", features };
  if (format === "geojson") {
    downloadBlob(new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json;charset=utf-8" }), `${basename}.geojson`);
    return;
  }
  if (format === "kml") {
    downloadBlob(new Blob([toKml(features)], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" }), `${basename}.kml`);
    return;
  }
  if (format === "kmz") {
    const zip = new JSZip();
    zip.file("doc.kml", toKml(features));
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${basename}.kmz`);
    return;
  }
  if (format === "shapefile") {
    const shpwrite = await import("@mapbox/shp-write");
    const zipData = await (shpwrite as any).zip(collection, {
      folder: basename,
      types: { line: "routes" },
      compression: "DEFLATE",
      outputType: "blob",
    });
    const blob = zipData instanceof Blob ? zipData : new Blob([zipData], { type: "application/zip" });
    downloadBlob(blob, `${basename}.zip`);
  }
}

export function parseLineCoordinates(value: unknown): [number, number][] {
  if (Array.isArray(value)) return value as [number, number][];
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}
