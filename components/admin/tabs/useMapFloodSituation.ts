"use client";

import React, { useMemo, useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import {
  findBestHighwayGroupForSelection,
  sliceBranchByKmRange,
} from "@/components/admin/tabs/map-management-helpers";
import {
  AFFECTED_LANES_OPTIONS,
  AffectedShoulderType,
  RoadSideType,
  SAFETY_MEASURES,
} from "@/lib/constants";
import {
  AffectedRoadPart,
  FloodDirectionCode,
  parseKmPostMeters,
} from "@/lib/flood-event-schema";
import {
  cleanHighwaySectionName,
  getAvailableHighwayRoutes,
} from "@/lib/highway-schema";
import { deriveTrafficStatusFromWaterLevel } from "@/lib/traffic-presentation";

export type TrafficStatusValue =
  | "WARNING"
  | "CLOSED"
  | "PASSABLE"
  | "LIGHT_VEHICLES_ONLY"
  | "ONE_LANE";

export interface UseMapFloodSituationParams {
  systemData: SystemDataPayload;
  routeMode: "FLOOD" | "DETOUR";
  routeNo: string;
  selectedHighwayName: string;
  sectionName: string;
  kmStart: string;
  kmEnd: string;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  originalReverseRouteCoordinatesRef: React.MutableRefObject<[number, number][]>;
}

/**
 * Manages flood severity, traffic status auto-derivation, dual-carriageway division checks,
 * highway selection lookup, reverse flood geometry slicing, and flood state reset.
 */
export function useMapFloodSituation({
  systemData,
  routeMode,
  routeNo,
  selectedHighwayName,
  sectionName,
  kmStart,
  kmEnd,
  draftReverseCoordinates,
  setDraftReverseCoordinates,
  originalReverseRouteCoordinatesRef,
}: UseMapFloodSituationParams) {
  // Directional & Lane-Specific Flood Attributes
  const [roadSide, setRoadSide] = useState<RoadSideType>("UNKNOWN");
  const [affectedLanes, setAffectedLanes] = useState<string>(AFFECTED_LANES_OPTIONS[0]);
  const [affectedShoulder, setAffectedShoulder] = useState<AffectedShoulderType>("NONE");
  const [waterLevelKnown, setWaterLevelKnown] = useState<boolean>(true);
  const [useCarriagewaySnapping, setUseCarriagewaySnapping] = useState<boolean>(false);

  // Flood Severity & Traffic Status + Dual Carriageway Support
  const [routeWaterLevel, setRouteWaterLevel] = useState<number | string>("");
  const [routeStatus, setRouteStatus] = useState<TrafficStatusValue>("WARNING");
  const [selectedMeasure, setSelectedMeasure] = useState<string>(SAFETY_MEASURES[0]);
  const [directionCode, setDirectionCode] = useState<FloodDirectionCode>("UNKNOWN");
  const [affectedParts, setAffectedParts] = useState<AffectedRoadPart[]>(["UNSPECIFIED"]);
  const [reverseRouteWaterLevel, setReverseRouteWaterLevel] = useState<number | string>("");
  const [reverseRouteStatus, setReverseRouteStatus] = useState<TrafficStatusValue>("WARNING");
  const [reverseWaterLevelKnown, setReverseWaterLevelKnown] = useState<boolean>(true);
  const [reverseAffectedParts, setReverseAffectedParts] = useState<AffectedRoadPart[]>(["ALL_LANES"]);

  // Dynamic Highway Routes strictly from highwayLayers database
  const availableHighways = useMemo(() => getAvailableHighwayRoutes(systemData), [systemData]);

  const selectedHighwayOption = useMemo(() => {
    if (!routeNo && !selectedHighwayName) return undefined;
    if (selectedHighwayName) {
      const byName = availableHighways.find((h) => h.name === selectedHighwayName);
      if (byName) return byName;
    }
    const cleanNo = String(routeNo || "").replace(/^ทล\.?/i, "").trim();
    const candidates = availableHighways.filter((h) => h.no === cleanNo);
    if (candidates.length === 0) return undefined;
    const cleanSec = cleanHighwaySectionName(sectionName);
    if (cleanSec) {
      const bySec = candidates.find((h) => cleanHighwaySectionName(h.sectionName) === cleanSec);
      if (bySec) return bySec;
    }
    const kmSMeters = parseKmPostMeters(kmStart);
    const kmEMeters = parseKmPostMeters(kmEnd);
    if (kmSMeters !== null && kmEMeters !== null) {
      const mid = (kmSMeters + kmEMeters) / 2;
      const containing = candidates.find((h) => {
        const hs = parseKmPostMeters(h.kmStart);
        const he = parseKmPostMeters(h.kmEnd);
        return hs !== null && he !== null && mid >= Math.min(hs, he) && mid <= Math.max(hs, he);
      });
      if (containing) return containing;
    }
    return candidates[0];
  }, [availableHighways, routeNo, selectedHighwayName, sectionName, kmStart, kmEnd]);

  const selectedHighwayLaneCount = selectedHighwayOption?.laneCount ?? 0;
  const isSelectedHighwayDivided = Boolean(
    selectedHighwayOption && (selectedHighwayOption.laneCount >= 4 || selectedHighwayOption.hasDualCarriageway)
  );
  const isDividedBothFlood =
    routeMode === "FLOOD" && roadSide === "BOTH" && directionCode === "BOTH" && isSelectedHighwayDivided;

  const availableOfficeNames = useMemo(() => {
    const names = new Set<string>();
    (systemData.offices || []).forEach((o) => {
      if (o.is_active && o.name) names.add(o.name.trim());
    });
    availableHighways.forEach((h) => {
      if (h.responsibleOffice) names.add(h.responsibleOffice);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "th"));
  }, [systemData.offices, availableHighways]);

  // Water-level & affected road parts -> auto-derive suggested traffic status (editable manually afterward)
  const handleWaterLevelInputChange = (rawValue: string) => {
    const nextVal: number | string = rawValue === "" ? "" : Number(rawValue);
    setRouteWaterLevel(nextVal);
    if (nextVal !== "" && waterLevelKnown) {
      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, affectedParts);
      if (suggested) setRouteStatus(suggested);
    }
  };

  const handleReverseWaterLevelInputChange = (rawValue: string) => {
    const nextVal: number | string = rawValue === "" ? "" : Number(rawValue);
    setReverseRouteWaterLevel(nextVal);
    if (nextVal !== "" && reverseWaterLevelKnown) {
      const suggested = deriveTrafficStatusFromWaterLevel(nextVal, reverseAffectedParts);
      if (suggested) setReverseRouteStatus(suggested);
    }
  };

  const toggleAffectedPartWithAutoStatus = (
    part: AffectedRoadPart,
    currentParts: AffectedRoadPart[],
    setParts: React.Dispatch<React.SetStateAction<AffectedRoadPart[]>>,
    waterLevelValue: number | string,
    isKnown: boolean,
    setStatus: React.Dispatch<React.SetStateAction<TrafficStatusValue>>
  ) => {
    const isSelected = currentParts.includes(part);
    let nextParts: AffectedRoadPart[];
    if (part === "ALL_LANES") {
      nextParts = isSelected ? ["UNSPECIFIED"] : ["ALL_LANES"];
    } else {
      const filtered = currentParts.filter((p) => p !== "ALL_LANES" && p !== "UNSPECIFIED");
      if (isSelected) {
        const remaining = filtered.filter((p) => p !== part);
        nextParts = remaining.length ? remaining : ["UNSPECIFIED"];
      } else {
        nextParts = [...filtered, part];
      }
    }
    setParts(nextParts);
    if (isKnown && waterLevelValue !== "") {
      const suggested = deriveTrafficStatusFromWaterLevel(waterLevelValue, nextParts);
      if (suggested) setStatus(suggested);
    }
  };

  // Seed or slice reverse carriageway geometry when "ท่วมทั้งสองฝั่งจราจร" is chosen on a >= 4-lane highway
  const ensureReverseFloodGeometry = (forwardSource: [number, number][]) => {
    if (!isSelectedHighwayDivided) return;
    if (routeNo && kmStart && kmEnd) {
      const bestGroup = findBestHighwayGroupForSelection(
        systemData.highwayLayers,
        routeNo,
        sectionName,
        kmStart,
        kmEnd
      );
      const fwdBranch =
        bestGroup?.branches.find((b) => b.directionCode === "A_TO_B" && b.coordinates.length >= 2) ||
        bestGroup?.primaryBranch;
      const revBranch = bestGroup?.branches.find(
        (b) => b.directionCode === "B_TO_A" && b.coordinates.length >= 2
      );
      if (bestGroup && revBranch) {
        const slicedRev = sliceBranchByKmRange(
          revBranch,
          fwdBranch,
          bestGroup.kmStart,
          bestGroup.kmEnd,
          kmStart,
          kmEnd,
          true
        );
        if (slicedRev.length >= 2) {
          setDraftReverseCoordinates?.(slicedRev);
          originalReverseRouteCoordinatesRef.current = slicedRev.map((p) => [...p] as [number, number]);
          return;
        }
      }
    }
    if (draftReverseCoordinates.length < 2 && forwardSource.length >= 2) {
      const seeded = [...forwardSource].reverse().map((p) => [...p] as [number, number]);
      setDraftReverseCoordinates?.(seeded);
      originalReverseRouteCoordinatesRef.current = seeded.map((p) => [...p] as [number, number]);
    }
  };

  const resetFloodSituationState = () => {
    setRouteWaterLevel("");
    setRoadSide("UNKNOWN");
    setAffectedLanes(AFFECTED_LANES_OPTIONS[0]);
    setAffectedShoulder("NONE");
    setWaterLevelKnown(true);
    setUseCarriagewaySnapping(false);
    setDirectionCode("UNKNOWN");
    setAffectedParts(["UNSPECIFIED"]);
    setRouteStatus("WARNING");
    setReverseRouteWaterLevel("");
    setReverseRouteStatus("WARNING");
    setReverseWaterLevelKnown(true);
    setReverseAffectedParts(["ALL_LANES"]);
  };

  return {
    roadSide,
    setRoadSide,
    affectedLanes,
    setAffectedLanes,
    affectedShoulder,
    setAffectedShoulder,
    waterLevelKnown,
    setWaterLevelKnown,
    useCarriagewaySnapping,
    setUseCarriagewaySnapping,
    routeWaterLevel,
    setRouteWaterLevel,
    routeStatus,
    setRouteStatus,
    selectedMeasure,
    setSelectedMeasure,
    directionCode,
    setDirectionCode,
    affectedParts,
    setAffectedParts,
    reverseRouteWaterLevel,
    setReverseRouteWaterLevel,
    reverseRouteStatus,
    setReverseRouteStatus,
    reverseWaterLevelKnown,
    setReverseWaterLevelKnown,
    reverseAffectedParts,
    setReverseAffectedParts,
    availableHighways,
    selectedHighwayOption,
    selectedHighwayLaneCount,
    isSelectedHighwayDivided,
    isDividedBothFlood,
    availableOfficeNames,
    handleWaterLevelInputChange,
    handleReverseWaterLevelInputChange,
    toggleAffectedPartWithAutoStatus,
    ensureReverseFloodGeometry,
    resetFloodSituationState,
  };
}
