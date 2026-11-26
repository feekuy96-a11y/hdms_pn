import type { SystemDataPayload } from "@/db/default-data";

export type PublicReadState = "loading" | "unavailable" | "stale" | "ready";

export const PUBLIC_READ_MESSAGES = {
  loading: "กำลังโหลดข้อมูลสถานการณ์ล่าสุด…",
  unavailable: "ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ โปรดลองอีกครั้ง",
  stale: "อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลจากการโหลดครั้งก่อน",
} satisfies Record<Exclude<PublicReadState, "ready">, string>;

export function resolvePublicReadState(hasSnapshot: boolean, unavailable: boolean): PublicReadState {
  if (unavailable) return hasSnapshot ? "stale" : "unavailable";
  return hasSnapshot ? "ready" : "loading";
}

// The response timestamp can advance on every read. Compare the public reports
// themselves, independently of response time and row order.
export function inspectPublicReports(data: SystemDataPayload) {
  const floods = data.floodRoutes.filter((row) => row.is_active);
  const detours = data.detourRoutes.filter((row) => row.is_active);
  const activeIds = new Set(detours.map((row) => row.id));
  const links = (data.eventDetourLinks ?? []).filter((link) => activeIds.has(link.detourId));
  const order = (rows: unknown[][]) => rows.map((row) => JSON.stringify(row)).sort();
  const dates = [...floods, ...detours].map((row) => row.updated_at ? Date.parse(row.updated_at) : NaN).filter(Number.isFinite);
  return {
    latestReportMs: dates.length > 0 ? Math.max(...dates) : null,
    fingerprint: JSON.stringify([
      order(floods.map((row) => [row.id, row.updated_at, row.water_level_cm, row.traffic_status, row.direction_meta?.trafficStatusDetail])),
      order(detours.map((row) => [row.id, row.updated_at, row.direction_mode, row.geometry_revision])),
      order(links.map((link) => [link.eventId, link.detourId, link.eventDirection, link.detourDirection, link.position, link.recommendation])),
    ]),
  };
}
