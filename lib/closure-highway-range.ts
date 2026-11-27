import type { HighwaySectionGroup } from "@/lib/highway-schema";
import type { ClosureCoordinate } from "@/lib/closure-local-record";
import { sliceBranchByKmRange } from "@/components/admin/tabs/map-management-helpers";

export function closureKmMeters(value: string): number | null {
  const match = value.trim().match(/^(\d{1,4})\+(\d{3})$/);
  return match ? Number(match[1]) * 1000 + Number(match[2]) : null;
}

export function orderedClosureKm(start: string, end: string): boolean {
  const a = closureKmMeters(start), b = closureKmMeters(end);
  return a !== null && b !== null && a < b;
}

/** Selects only the explicit section. No nearest-section, clamping or straight-line fallback. */
export function closureHighwayRange(section: HighwaySectionGroup, start: string, end: string): ClosureCoordinate[] {
  const a = closureKmMeters(start), b = closureKmMeters(end);
  const x = closureKmMeters(section.kmStart), y = closureKmMeters(section.kmEnd);
  if (a === null || b === null || x === null || y === null || a >= b ||
      a < Math.min(x, y) || b > Math.max(x, y)) return [];
  const branch = section.branches.find(item => {
    if (item.branchType !== "MAIN_CARRIAGEWAY" || item.directionCode === "B_TO_A" || item.coordinates.length < 2) return false;
    const first = closureKmMeters(item.properties.km_start || section.kmStart);
    const last = closureKmMeters(item.properties.km_end || section.kmEnd);
    return first !== null && last !== null && first !== last && a >= Math.min(first, last) && b <= Math.max(first, last);
  });
  if (!branch || !branch.coordinates.every(p => p.length === 2 && Number.isFinite(p[0]) &&
      Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 && (p[0] !== 0 || p[1] !== 0))) return [];
  const line = sliceBranchByKmRange(branch, branch, section.kmStart, section.kmEnd, start.trim(), end.trim(), false);
  if (line.length < 2 || line.length > 2000) return [];
  const first = line[0], last = line[line.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? [] : line;
}
