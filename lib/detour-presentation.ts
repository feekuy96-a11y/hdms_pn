// Shared presentation logic for detour details.
// Used by BOTH the Leaflet popup (components/map/LongdoGisMap.tsx, HTML string) and the citizen
// detail sheet (app/page.tsx, React) so the two surfaces can never disagree about direction rules,
// advice steps or distance. This file has no React/Leaflet dependency on purpose.

export type DetourDirectionMode = "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
export type DetourDirection = "FORWARD" | "REVERSE";

const VALID_MODES: readonly string[] = ["TWO_WAY", "FORWARD_ONLY", "REVERSE_ONLY"];

/** True only for a direction value that was really recorded. Missing/legacy values are NOT two-way. */
export function isRecordedDetourDirection(mode: unknown): mode is DetourDirectionMode {
  return VALID_MODES.includes(String(mode ?? ""));
}

/** A direction is selectable only when the recorded mode allows it. Unknown mode allows neither. */
export function isDetourDirectionAllowed(mode: unknown, direction: DetourDirection): boolean {
  if (!isRecordedDetourDirection(mode)) return false;
  if (mode === "TWO_WAY") return true;
  return direction === "FORWARD" ? mode === "FORWARD_ONLY" : mode === "REVERSE_ONLY";
}

/** First selectable direction, or null when the record has no confirmed direction. */
export function defaultDetourDirection(mode: unknown): DetourDirection | null {
  if (isDetourDirectionAllowed(mode, "FORWARD")) return "FORWARD";
  if (isDetourDirectionAllowed(mode, "REVERSE")) return "REVERSE";
  return null;
}

export function detourDirectionBadge(mode: unknown): string {
  if (mode === "FORWARD_ONLY") return "A → B";
  if (mode === "REVERSE_ONLY") return "B → A";
  if (mode === "TWO_WAY") return "A ⇄ B";
  return "รอตรวจสอบทิศทาง";
}

/**
 * Split staff-written advice into numbered steps and side notes.
 * Never invents text: an empty input yields empty arrays.
 */
export function parseDetourAdvice(rawAdvice: string): { steps: string[]; notes: string[] } {
  const advice = (rawAdvice || "").trim();
  if (!advice) return { steps: [], notes: [] };
  const normalized = advice
    .replace(/\s+(?=\d+[.)]\s)/g, "\n")
    .replace(/\s+(?=[-•]\s)/g, "\n");
  const steps: string[] = [];
  const notes: string[] = [];
  for (const entry of normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
    if (/^[-•–]\s*/.test(entry)) notes.push(entry.replace(/^[-•–]\s*/, ""));
    else steps.push(entry.replace(/^\d+[.)]\s*/, ""));
  }
  return { steps, notes };
}

/** Distance in metres for the chosen direction, only when a real recorded value exists. */
export function detourDistanceMeters(
  meta: { forward_distance_m?: number; forward_distance_km?: number; reverse_distance_m?: number; reverse_distance_km?: number } | null | undefined,
  direction: DetourDirection
): number | null {
  if (!meta) return null;
  const meters = direction === "FORWARD"
    ? meta.forward_distance_m ?? (meta.forward_distance_km != null ? meta.forward_distance_km * 1000 : undefined)
    : meta.reverse_distance_m ?? (meta.reverse_distance_km != null ? meta.reverse_distance_km * 1000 : undefined);
  return typeof meters === "number" && Number.isFinite(meters) && meters > 0 ? meters : null;
}

export function formatDetourDistanceKm(meters: number): string {
  return (meters / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 });
}

