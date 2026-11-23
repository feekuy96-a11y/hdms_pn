"use client";

import type React from "react";
import { SystemDataPayload } from "@/db/default-data";
import { snapRouteAction } from "@/app/actions/doh-actions";
import { buildDetourRoutingParams } from "@/components/admin/tabs/map-management-helpers";
import { calculatePolylineRoadDistanceKm } from "@/lib/detour-presentation";
import {
  fetchOsrmWithFailover,
  computeGoogleRouteHybrid,
  detectClosedRoadConflicts,
  detectPassabilityFloodWarnings,
  haversineDistanceKm,
} from "@/lib/gis-utils";
import { RoadSideType, DetourDirectionModeType } from "@/lib/constants";

export interface UseDualRoadSnappingParams {
  systemData: SystemDataPayload;
  routeMode: "FLOOD" | "DETOUR";
  detourDirectionMode: DetourDirectionModeType;
  forceStraightThrough: boolean;
  useCarriagewaySnapping: boolean;
  isDividedBothFlood: boolean;
  roadSide: RoadSideType;
  freeEditEnabled: boolean;
  setFreeEditEnabled: (enabled: boolean) => void;
  revStartLat: string | number;
  revStartLon: string | number;
  revEndLat: string | number;
  revEndLon: string | number;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  draftReverseWaypoints: [number, number][];
  routingRequest: React.MutableRefObject<number>;
  durationFwdManualRef: React.MutableRefObject<boolean>;
  durationRevManualRef: React.MutableRefObject<boolean>;
  detourDurationSeconds: { forward: number; reverse: number };
  setDetourDistanceMeters: React.Dispatch<React.SetStateAction<{ forward: number; reverse: number }>>;
  setDetourDurationSeconds: React.Dispatch<React.SetStateAction<{ forward: number; reverse: number }>>;
  setDetourDurationMinFwd: (val: string) => void;
  setDetourDurationMinRev: (val: string) => void;
  setClosedRoadConflicts: (msgs: string[]) => void;
  setPassabilityWarnings: (msgs: string[]) => void;
  setDraftConflictPoints?: (points: { coord: [number, number]; label: string }[]) => void;
  setSnappingStatusText: (text: string) => void;
  onToast: (msg: string) => void;
}

export function useDualRoadSnapping(params: UseDualRoadSnappingParams) {
  const {
    systemData,
    routeMode,
    detourDirectionMode,
    forceStraightThrough,
    useCarriagewaySnapping,
    isDividedBothFlood,
    roadSide,
    freeEditEnabled,
    setFreeEditEnabled,
    revStartLat,
    revStartLon,
    revEndLat,
    revEndLon,
    draftCoordinates,
    setDraftCoordinates,
    setDraftReverseCoordinates,
    draftWaypoints,
    draftReverseWaypoints,
    routingRequest,
    durationFwdManualRef,
    durationRevManualRef,
    detourDurationSeconds,
    setDetourDistanceMeters,
    setDetourDurationSeconds,
    setDetourDurationMinFwd,
    setDetourDurationMinRev,
    setClosedRoadConflicts,
    setPassabilityWarnings,
    setDraftConflictPoints,
    setSnappingStatusText,
    onToast,
  } = params;

  const triggerDualRoadSnapping = async (
    sLat: number | string,
    sLon: number | string,
    eLat: number | string,
    eLon: number | string,
    waypoints: [number, number][] = draftWaypoints,
    reverseWaypoints: [number, number][] = draftReverseWaypoints,
    revOverrides?: {
      revSLat?: number | string;
      revSLon?: number | string;
      revELat?: number | string;
      revELon?: number | string;
      reverseOnly?: boolean;
    }
  ) => {
    const requestId = ++routingRequest.current;
    if (freeEditEnabled) setFreeEditEnabled(false);
    const numSLat = Number(sLat);
    const numSLon = Number(sLon);
    const numELat = Number(eLat);
    const numELon = Number(eLon);
    const effRevSLat = Number(revOverrides?.revSLat ?? revStartLat) || numELat;
    const effRevSLon = Number(revOverrides?.revSLon ?? revStartLon) || numELon;
    const effRevELat = Number(revOverrides?.revELat ?? revEndLat) || numSLat;
    const effRevELon = Number(revOverrides?.revELon ?? revEndLon) || numSLon;

    if (!numSLat || !numSLon || !numELat || !numELon || isNaN(numSLat) || isNaN(numELat)) {
      onToast("กรุณาระบุพิกัด A และ B ให้ครบถ้วนก่อนคำนวณเส้นเกาะถนน");
      return;
    }

    setSnappingStatusText("กำลังคำนวณเส้นเกาะถนนจริง (Dual-Source Snapping)...");
    try {
      if (routeMode === "DETOUR") {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[effRevSLon, effRevSLat], ...reverseWaypoints, [effRevELon, effRevELat]];
        if (forceStraightThrough && waypoints.length === 0) {
          setDraftCoordinates([[numSLon, numSLat], [numELon, numELat]]);
          setSnappingStatusText("กรุณาเพิ่มจุดดัดบนสามแยก/สี่แยกอย่างน้อย 1 จุด แล้วคำนวณอีกครั้ง");
          return;
        }

        const pickSafeRoute = (routingRes: any) => {
          const routes = Array.isArray(routingRes?.data?.routes) ? routingRes.data.routes : [];
          if (routes.length === 0) return { coords: [] as [number, number][], distance: 0, duration: 0, conflicts: [] as ReturnType<typeof detectClosedRoadConflicts> };
          for (const candidate of routes) {
            const cCoords = candidate?.geometry?.coordinates;
            if (!Array.isArray(cCoords) || cCoords.length < 2) continue;
            const cConflicts = detectClosedRoadConflicts(cCoords, systemData.floodRoutes || []);
            if (cConflicts.length === 0) {
              return { coords: cCoords as [number, number][], distance: Number(candidate.distance) || 0, duration: Number(candidate.duration) || 0, conflicts: [] };
            }
          }
          const primary = routes[0];
          const pCoords = (primary?.geometry?.coordinates || []) as [number, number][];
          return {
            coords: pCoords,
            distance: Number(primary?.distance) || 0,
            duration: Number(primary?.duration) || 0,
            conflicts: detectClosedRoadConflicts(pCoords, systemData.floodRoutes || []),
          };
        };

        const resolveDetourDirection = async (points: [number, number][]) => {
          const googleRes = await computeGoogleRouteHybrid(points, "TRAFFIC_UNAWARE");
          if (googleRes && googleRes.coords.length >= 2) {
            const gConflicts = detectClosedRoadConflicts(googleRes.coords, systemData.floodRoutes || []);
            if (gConflicts.length === 0 || forceStraightThrough) {
              return { coords: googleRes.coords, distance: googleRes.distanceMeters, duration: googleRes.durationSeconds, conflicts: gConflicts };
            }
            const osrmAlt = pickSafeRoute(
              await fetchOsrmWithFailover(
                points.map((point) => point.join(",")).join(";"),
                buildDetourRoutingParams(points, forceStraightThrough),
              )
            );
            if (osrmAlt.coords.length >= 2 && osrmAlt.conflicts.length === 0) {
              return osrmAlt;
            }
            return { coords: googleRes.coords, distance: googleRes.distanceMeters, duration: googleRes.durationSeconds, conflicts: gConflicts };
          }
          return pickSafeRoute(
            await fetchOsrmWithFailover(
              points.map((point) => point.join(",")).join(";"),
              buildDetourRoutingParams(points, forceStraightThrough),
            )
          );
        };

        const emptyPicked = { coords: [] as [number, number][], distance: 0, duration: 0, conflicts: [] as ReturnType<typeof detectClosedRoadConflicts> };
        const preserveForward = Boolean(revOverrides?.reverseOnly && draftCoordinates.length >= 2);
        const [pickedAB, pickedBA] = await Promise.all([
          !preserveForward && detourDirectionMode !== "REVERSE_ONLY" ? resolveDetourDirection(pointsAB) : Promise.resolve(emptyPicked),
          detourDirectionMode !== "FORWARD_ONLY" ? resolveDetourDirection(pointsBA) : Promise.resolve(emptyPicked),
        ]);
        if (requestId !== routingRequest.current) return;

        const forwardCoords = preserveForward
          ? draftCoordinates
          : detourDirectionMode === "REVERSE_ONLY"
            ? pickedBA.coords
            : pickedAB.coords;
        const reverseCoords = detourDirectionMode === "TWO_WAY" ? pickedBA.coords : [];

        if (forwardCoords.length < 2) {
          setDraftCoordinates([]);
          setDraftReverseCoordinates?.([]);
          setSnappingStatusText("ไม่สามารถคำนวณทางเลี่ยงตามถนนได้ กรุณาเพิ่มจุดดัดหรือลองใหม่");
          return;
        }

        if (!preserveForward) {
          setDraftCoordinates(forwardCoords);
        }
        setDraftReverseCoordinates?.(reverseCoords);
        setDetourDistanceMeters((prev) => ({
          forward: preserveForward ? prev.forward : detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.distance,
          reverse: detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.distance,
        }));
        const nextFwdDurS = preserveForward ? detourDurationSeconds.forward : detourDirectionMode === "REVERSE_ONLY" ? 0 : pickedAB.duration;
        const nextRevDurS = detourDirectionMode === "FORWARD_ONLY" ? 0 : pickedBA.duration;
        setDetourDurationSeconds({
          forward: nextFwdDurS,
          reverse: nextRevDurS,
        });
        if (!durationFwdManualRef.current && nextFwdDurS > 0) {
          setDetourDurationMinFwd(String(Math.max(1, Math.round(nextFwdDurS / 60))));
        }
        if (!durationRevManualRef.current && nextRevDurS > 0) {
          setDetourDurationMinRev(String(Math.max(1, Math.round(nextRevDurS / 60))));
        }

        const fwdConflicts = preserveForward
          ? detectClosedRoadConflicts(forwardCoords, systemData.floodRoutes || [])
          : pickedAB.conflicts;
        const allConflicts = [...fwdConflicts, ...pickedBA.conflicts];
        const uniqueConflictMsgs = Array.from(
          new Set(allConflicts.map((c) => `ทล.${c.routeNo} (${c.sectionName})`))
        );
        setClosedRoadConflicts(uniqueConflictMsgs);

        const fwdPassWarnings = detectPassabilityFloodWarnings(forwardCoords, systemData.floodRoutes || [], "FORWARD");
        const revPassWarnings = detourDirectionMode === "TWO_WAY" && pickedBA.coords.length >= 2
          ? detectPassabilityFloodWarnings(pickedBA.coords, systemData.floodRoutes || [], "REVERSE")
          : [];
        const uniquePassMsgs = Array.from(
          new Set(
            [...fwdPassWarnings, ...revPassWarnings].map(
              (w) => `ทล.${w.routeNo} กม.${w.kmStart}–${w.kmEnd} (${w.trafficStatus === "ONE_LANE" ? "ผ่านได้ ๑ ช่องทาง" : "รถเล็กผ่านไม่ได้"})`
            )
          )
        );
        setPassabilityWarnings(uniquePassMsgs);
        setDraftConflictPoints?.(
          allConflicts.map((c) => ({
            coord: c.conflictPoint,
            label: `ทับซ้อนจุดปิดการจราจร: ทล.${c.routeNo} ${c.sectionName}`,
          }))
        );

        if (uniqueConflictMsgs.length > 0) {
          setSnappingStatusText(
            `⚠️ พบเส้นทางเลี่ยงตัดผ่านจุดที่ปิดการจราจร (${uniqueConflictMsgs.join(", ")}) — กรุณาเพิ่มจุดดัดเพื่ออ้อมจุดปิดจราจร`
          );
          onToast(`คำเตือน: เส้นทางตัดผ่านจุดปิดการจราจร (${uniqueConflictMsgs.join(", ")})`);
        } else {
          const straightLabel = forceStraightThrough ? "คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ" : "คำนวณทางเลี่ยงตามถนนสำเร็จ";
          setSnappingStatusText(
            detourDirectionMode === "TWO_WAY"
              ? `✓ ${straightLabel}: A→B (${forwardCoords.length} จุด) และ B→A (${pickedBA.coords.length} จุด) — ปลอดจุดปิดจราจร`
              : `✓ ${straightLabel} (${forwardCoords.length} จุด) — ปลอดจุดปิดจราจร`
          );
        }
        return;
      }

      const snapFloodDirected = async (directedPoints: [number, number][]): Promise<[number, number][] | null> => {
        const segments = await Promise.all(
          directedPoints.slice(1).map((point, index) => snapRouteAction(directedPoints[index], point).catch(() => null))
        );
        if (requestId !== routingRequest.current) return null;
        if (segments.every((segment) => Array.isArray(segment) && segment.length >= 2)) {
          return segments.flatMap((segment, index) => (index === 0 ? segment! : segment!.slice(1)));
        }

        if (useCarriagewaySnapping || isDividedBothFlood) {
          const directKm = haversineDistanceKm(directedPoints[0], directedPoints[directedPoints.length - 1]);
          const acceptNonUTurn = (coords: [number, number][]) => {
            const polyKm = calculatePolylineRoadDistanceKm(coords);
            if (directKm > 0.05 && polyKm > Math.max(0.8, directKm * 2.5)) {
              onToast("⚠️ พบแนวเส้นอ้อมจุดกลับรถยาวผิดปกติ — ระบบขอใช้จุดพิกัดตรงแทนเพื่อกันเส้นเลยจุดท่วม");
              return false;
            }
            return true;
          };
          const googleCarriageway = await computeGoogleRouteHybrid(directedPoints, "TRAFFIC_UNAWARE");
          if (requestId !== routingRequest.current) return null;
          if (googleCarriageway && googleCarriageway.coords.length >= 2 && acceptNonUTurn(googleCarriageway.coords)) {
            return googleCarriageway.coords;
          }
          const osrmRes = await fetchOsrmWithFailover(
            directedPoints.map((p) => p.join(",")).join(";"),
            "overview=full&geometries=geojson"
          );
          if (requestId !== routingRequest.current) return null;
          const osrmCoords = osrmRes?.data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
          if (Array.isArray(osrmCoords) && osrmCoords.length >= 2 && acceptNonUTurn(osrmCoords)) {
            return osrmCoords;
          }
        }
        return null;
      };

      if (isDividedBothFlood) {
        const pointsAB: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const pointsBA: [number, number][] = [[effRevSLon, effRevSLat], ...reverseWaypoints, [effRevELon, effRevELat]];
        const preserveForward = Boolean(revOverrides?.reverseOnly && draftCoordinates.length >= 2);
        const [fwdSnapped, revSnapped] = await Promise.all([
          preserveForward ? Promise.resolve(draftCoordinates) : snapFloodDirected(pointsAB),
          snapFloodDirected(pointsBA),
        ]);
        if (requestId !== routingRequest.current) return;
        const resolvedFwd = fwdSnapped && fwdSnapped.length >= 2 ? fwdSnapped : pointsAB;
        const resolvedRev = revSnapped && revSnapped.length >= 2 ? revSnapped : [...resolvedFwd].reverse();
        if (!preserveForward) {
          setDraftCoordinates(resolvedFwd);
        }
        setDraftReverseCoordinates?.(resolvedRev);
        setSnappingStatusText(
          `✓ คำนวณเส้นน้ำท่วม ๒ ฝั่งแยกกัน: ขาไป A→B (${resolvedFwd.length} จุด) และ ขากลับ B→A (${resolvedRev.length} จุด)`
        );
        onToast(`คำนวณแนวเส้นน้ำท่วม ๒ ฝั่งแยกกันสำเร็จ (A→B ${resolvedFwd.length} จุด, B→A ${resolvedRev.length} จุด)`);
        return;
      }

      if (useCarriagewaySnapping && (roadSide === "LEFT" || roadSide === "RIGHT")) {
        const directedPoints: [number, number][] =
          roadSide === "RIGHT"
            ? [[numELon, numELat], ...[...waypoints].reverse(), [numSLon, numSLat]]
            : [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        const snappedCoords = await snapFloodDirected(directedPoints);
        if (requestId !== routingRequest.current) return;
        if (Array.isArray(snappedCoords) && snappedCoords.length >= 2) {
          setDraftCoordinates(snappedCoords);
          setSnappingStatusText(
            `✓ คำนวณเส้นน้ำท่วมแยกตามคันทางจริง (${roadSide === "LEFT" ? "ฝั่งซ้าย ขาไป A→B" : "ฝั่งขวา ขากลับ B→A"}, ${snappedCoords.length} จุด)`
          );
          onToast(`เกาะแนวคันทาง ${roadSide === "LEFT" ? "ฝั่งซ้าย" : "ฝั่งขวา"} สำเร็จ (${snappedCoords.length} จุด)`);
          return;
        }
      }

      const points: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
      const segments = await Promise.all(points.slice(1).map((point, index) => snapRouteAction(points[index], point).catch(() => null)));
      if (requestId !== routingRequest.current) return;
      if (segments.some((segment) => !segment || segment.length < 2)) {
        setDraftCoordinates([]);
        setSnappingStatusText("ไม่พบแนวทางหลวงที่เชื่อมจุดที่เลือก กรุณาเลือกตำแหน่งบนเลเยอร์ทางหลวงอีกครั้ง");
        return;
      }
      const snapped = segments.flatMap((segment, index) => index === 0 ? segment! : segment!.slice(1));
      if (snapped && snapped.length > 0) {
        setDraftCoordinates(snapped);
        setSnappingStatusText(`✓ คำนวณเส้นทางเกาะโครงข่ายถนนสำเร็จ (${snapped.length} จุด)`);
        onToast(`สร้างแนวเส้นทางเกาะถนนสำเร็จ: ${snapped.length} จุด`);
      } else {
        const fallback: [number, number][] = [[numSLon, numSLat], ...waypoints, [numELon, numELat]];
        setDraftCoordinates(fallback);
        setSnappingStatusText("ไม่สามารถเชื่อมต่อโครงข่ายทางหลวงได้ จึงใช้เส้นตรงระหว่างจุด");
      }
    } catch {
      if (requestId !== routingRequest.current) return;
      if (routeMode === "DETOUR") {
        setDraftCoordinates([]);
        setSnappingStatusText("ไม่สามารถคำนวณทางเลี่ยงตามถนนได้ กรุณาลองใหม่");
        return;
      }
      setDraftCoordinates([]);
      setSnappingStatusText("ไม่สามารถเกาะแนวทางหลวงได้ กรุณาตรวจตำแหน่งแล้วลองใหม่");
    }
  };

  return { triggerDualRoadSnapping };
}
