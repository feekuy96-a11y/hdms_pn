import { SystemDataPayload } from "@/db/default-data";
import { slicePolylineByKmRange } from "@/lib/gis-utils";
import { AffectedShoulderType } from "@/lib/constants";
import {
  AffectedRoadPart,
  AFFECTED_ROAD_PART_LABELS,
  parseKmPostMeters,
} from "@/lib/flood-event-schema";
import {
  groupHighwayFeatures,
  cleanHighwaySectionName,
  haversineDistanceMeters,
  HighwaySectionGroup,
  HighwayBranchItem,
} from "@/lib/highway-schema";

export function parseCoordinatePair(value: string): [number, number] | null {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 2) return null;
  const [lat, lon] = numbers;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

export function calculateBearing(from: [number, number], to: [number, number]): number {
  const fromLat = (from[1] * Math.PI) / 180;
  const toLat = (to[1] * Math.PI) / 180;
  const deltaLon = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export function buildDetourRoutingParams(points: [number, number][], forceStraightThrough: boolean): string {
  const base = "overview=full&geometries=geojson";
  if (!forceStraightThrough || points.length < 3) return `${base}&alternatives=true`;
  const bearings = points
    .map((point, index) => {
      if (index === 0 || index === points.length - 1) return "";
      return `${calculateBearing(points[index - 1], points[index + 1])},45`;
    })
    .join(";");
  return `${base}&continue_straight=true&alternatives=false&bearings=${encodeURIComponent(bearings)}`;
}

export function findBestHighwayGroupForSelection(
  highwayLayers: SystemDataPayload["highwayLayers"] | undefined,
  routeNo: string,
  sectionName: string,
  kmStart: string,
  kmEnd: string
): HighwaySectionGroup | null {
  const cleanRoute = String(routeNo || "").replace(/^ทล\.?/i, "").trim();
  if (!cleanRoute) return null;
  const matchingGroups = groupHighwayFeatures(highwayLayers || []).filter((g) => g.routeNo === cleanRoute);
  if (matchingGroups.length === 0) return null;

  const cleanSec = cleanHighwaySectionName(sectionName);
  if (cleanSec) {
    const bySection = matchingGroups.find((g) => cleanHighwaySectionName(g.sectionName) === cleanSec);
    if (bySection) return bySection;
  }

  const tStartMeters = parseKmPostMeters(kmStart);
  const tEndMeters = parseKmPostMeters(kmEnd);
  if (tStartMeters !== null && tEndMeters !== null) {
    const targetMid = (tStartMeters + tEndMeters) / 2;
    let bestGroup = matchingGroups[0];
    let minDiff = Infinity;
    for (const g of matchingGroups) {
      const sMeters = parseKmPostMeters(g.kmStart);
      const eMeters = parseKmPostMeters(g.kmEnd);
      if (sMeters !== null && eMeters !== null) {
        const minKm = Math.min(sMeters, eMeters);
        const maxKm = Math.max(sMeters, eMeters);
        if (targetMid >= minKm && targetMid <= maxKm) return g;
        const diff = Math.min(Math.abs(targetMid - minKm), Math.abs(targetMid - maxKm));
        if (diff < minDiff) {
          minDiff = diff;
          bestGroup = g;
        }
      }
    }
    return bestGroup;
  }
  return matchingGroups[0];
}

export function sliceBranchByKmRange(
  branch: HighwayBranchItem,
  referenceForwardBranch: HighwayBranchItem | undefined,
  groupKmStart: string,
  groupKmEnd: string,
  targetKmStart: string,
  targetKmEnd: string,
  wantReverseOrder: boolean
): [number, number][] {
  let sourceCoords = branch.coordinates;
  const secStart = branch.properties?.km_start || groupKmStart;
  const secEnd = branch.properties?.km_end || groupKmEnd;
  if (
    branch.directionCode === "B_TO_A" &&
    referenceForwardBranch &&
    referenceForwardBranch.coordinates.length >= 2 &&
    sourceCoords.length >= 2
  ) {
    const fwdStart = referenceForwardBranch.coordinates[0];
    const fwdEnd = referenceForwardBranch.coordinates[referenceForwardBranch.coordinates.length - 1];
    const distToFwdStart = haversineDistanceMeters(sourceCoords[0], fwdStart);
    const distToFwdEnd = haversineDistanceMeters(sourceCoords[0], fwdEnd);
    const revPropsStart = parseKmPostMeters(secStart);
    const revPropsEnd = parseKmPostMeters(secEnd);
    if (revPropsStart !== null && revPropsEnd !== null && revPropsStart < revPropsEnd && distToFwdEnd < distToFwdStart) {
      sourceCoords = [...sourceCoords].reverse();
    }
  }
  return slicePolylineByKmRange(sourceCoords, secStart, secEnd, targetKmStart, targetKmEnd, wantReverseOrder);
}

export function buildAffectedPartSummary(parts: AffectedRoadPart[]): { lanesSummary: string; shoulderSummary: AffectedShoulderType } {
  const lanesSummary = parts.includes("ALL_LANES")
    ? "ทุกช่องจราจร"
    : parts.map((p) => AFFECTED_ROAD_PART_LABELS[p]).join(", ") || "ไม่ระบุ";
  const shoulderSummary = (parts.includes("LEFT_SHOULDER") && parts.includes("RIGHT_SHOULDER"))
    ? "BOTH"
    : parts.includes("LEFT_SHOULDER")
      ? "LEFT"
      : parts.includes("RIGHT_SHOULDER")
        ? "RIGHT"
        : "NONE";
  return { lanesSummary, shoulderSummary };
}
