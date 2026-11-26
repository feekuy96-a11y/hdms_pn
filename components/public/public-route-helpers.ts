import type { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { getHighwayIdsForDetour } from "@/lib/event-detour-links";
import type { resolveEffectiveRoadSide } from "@/lib/flood-event-schema";
import { TRAFFIC_ACCENT, type StatusColor } from "@/lib/traffic-presentation";

// Most severe first, so the points citizens must avoid are always at the top of the list.
export const STATUS_ORDER: Record<StatusColor, number> = {
  red: 0,
  orange: 1,
  amber: 2,
  sky: 3,
  emerald: 4,
  slate: 5,
};

export const STATUS_BAR = TRAFFIC_ACCENT;

export const STATUS_CHIP: Record<StatusColor, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/50",
  orange: "bg-orange-500/15 text-orange-200 border-orange-500/50",
  amber: "bg-amber-500/15 text-amber-200 border-amber-500/50",
  sky: "bg-sky-500/15 text-sky-200 border-sky-500/50",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-500/50",
  slate: "bg-slate-500/15 text-slate-300 border-slate-500/50",
};

export const SUMMARY_ITEMS: ReadonlyArray<{ color: StatusColor; label: string; dot: string }> = [
  { color: "red", label: "ผ่านไม่ได้", dot: "bg-red-500" },
  { color: "orange", label: "รถเล็กไม่สามารถผ่านได้", dot: "bg-orange-500" },
  { color: "amber", label: "รถเล็กผ่านได้ ๑ ช่องทาง", dot: "bg-amber-500" },
  { color: "sky", label: "รถทุกชนิดผ่านได้แต่ไม่สะดวก", dot: "bg-sky-400" },
  { color: "emerald", label: "ผ่านได้ปกติ", dot: "bg-emerald-500" },
  { color: "slate", label: "รอตรวจสอบ", dot: "bg-slate-400" },
];

export function highwayIdsInDetour(route: DetourRoute, systemData: SystemDataPayload): string[] {
  return getHighwayIdsForDetour(route, systemData);
}

export function formatAreaSegment(prefix: string, value?: string | null): string | null {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "-") return null;
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

export function formatFloodAreaLine(flood: FloodRoute): string | null {
  const sub = formatAreaSegment("ต.", flood.subdistrict);
  const dist = formatAreaSegment("อ.", flood.district);
  const provRaw =
    flood.province ||
    (flood.direction_meta as { province?: string } | undefined)?.province;
  const prov = formatAreaSegment("จ.", provRaw);
  const parts = [sub, dist, prov].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : null;
}

export function formatKmText(value?: string | number | null): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "-";
  return trimmed.startsWith("กม.") ? trimmed : `กม.${trimmed}`;
}

export function parseRouteCoordinates(raw?: string | [number, number][] | null): [number, number][] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatFloodSideShortLabel(side: ReturnType<typeof resolveEffectiveRoadSide>): string | null {
  if (side === "LEFT") return "ซ้ายทาง (LT)";
  if (side === "RIGHT") return "ขวาทาง (RT)";
  if (side === "BOTH") return "ทั้งสองฝั่ง";
  return null;
}
