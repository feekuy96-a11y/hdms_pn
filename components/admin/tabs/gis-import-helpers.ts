import { ExtractedGisFeature } from "@/lib/gis-utils";

export function kilometerPostMeters(value: unknown): number | null {
  const raw = String(value ?? "").replace(/กม\.?/gi, "").replace(/,/g, "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)\s*\+\s*(\d{1,3})$/);
  if (match) return Number(match[1]) * 1000 + Number(match[2]);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.round(Number.isInteger(numeric) && numeric >= 1000 ? numeric : numeric * 1000) : null;
}

export function formatKilometerPost(value: unknown): string {
  const meters = kilometerPostMeters(value);
  if (meters === null) return "";
  return `${Math.floor(meters / 1000)}+${String(meters % 1000).padStart(3, "0")}`;
}

export function normalizeSurface(value: unknown): string {
  const surface = String(value ?? "").toLowerCase();
  if (surface.includes("conc") || surface.includes("pcc") || surface.includes("concrete")) return "Conc.";
  if (surface.includes("dst")) return "DST.";
  return "AC.";
}

export function normalizeLanes(value: unknown): string {
  const match = String(value ?? "").match(/[2-8๒-๘]/)?.[0];
  const digit = match && /[๒-๘]/.test(match) ? String("๒๓๔๕๖๗๘".indexOf(match) + 2) : match;
  return ["2", "3", "4", "6", "8"].includes(digit || "") ? `${digit} ช่องจราจร` : "4 ช่องจราจร";
}

export function calculateDistanceKm(start: unknown, end: unknown): string {
  const startMeters = kilometerPostMeters(start);
  const endMeters = kilometerPostMeters(end);
  return startMeters === null || endMeters === null
    ? ""
    : (Math.abs(endMeters - startMeters) / 1000).toFixed(3);
}

export function previewLines(features: ExtractedGisFeature[]): [number, number][][] {
  const maxLines = 500;
  const maxPointsPerLine = 500;
  return features.slice(0, maxLines).map(({ coords }) => {
    if (coords.length <= maxPointsPerLine) return coords;
    const step = (coords.length - 1) / (maxPointsPerLine - 1);
    return Array.from({ length: maxPointsPerLine }, (_, index) => coords[Math.round(index * step)]);
  });
}

export function simplifyInWorker(features: ExtractedGisFeature[], tolerance: number): Promise<ExtractedGisFeature[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/route-simplify-worker.js`);
    worker.onmessage = (event: MessageEvent<{ features?: ExtractedGisFeature[]; error?: string }>) => {
      worker.terminate();
      if (event.data.error || !event.data.features) reject(new Error(event.data.error || "ไม่สามารถประมวลผลเส้นทางได้"));
      else resolve(event.data.features);
    };
    worker.onerror = () => { worker.terminate(); reject(new Error("ไม่สามารถประมวลผลไฟล์ในเบื้องหลังได้")); };
    worker.postMessage({ features, tolerance });
  });
}

export function lineCoordinates(geometry: any): [number, number][] {
  const coordinates = geometry?.type === "LineString"
    ? geometry.coordinates
    : geometry?.type === "MultiLineString"
      ? geometry.coordinates.flat(1)
      : [];
  return Array.isArray(coordinates)
    ? coordinates.filter((point: any) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map((point: any) => [Number(point[0]), Number(point[1])] as [number, number])
    : [];
}
