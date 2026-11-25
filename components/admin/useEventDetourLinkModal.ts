"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetourRoute, SystemDataPayload } from "@/db/default-data";
import {
  getEventDetourLinksAction,
  replaceEventDetourLinksAction,
  type EventDetourLinksResult,
} from "@/app/actions/doh-actions";
import {
  getEventSupportedRecommendedDirections,
  getRecommendationReviewBlockers,
  isDetourDirectionAllowed,
  recommendationToLinkStatus,
  resequenceEventDetourLinks,
  compareEventDetourLinks,
  resolveDefaultDetourDirection,
  resolveDefaultEventDirection,
  validateEventDetourLinks,
  type DetourRecommendation,
  type DetourTravelDirection,
  type EventDetourLink,
  type EventTravelDirection,
  type LinkStatusMode,
} from "@/lib/event-detour-links";
import {
  groupFloodRoutesIntoEvents,
  type ParentFloodEventGroup,
} from "@/lib/flood-event-schema";

export interface ByDetourRowDraft {
  linked: boolean;
  sourceEventDirection: EventTravelDirection | null;
  eventDirection: EventTravelDirection;
  detourDirection: DetourTravelDirection;
  status: LinkStatusMode;
}

export interface LoadedEventState {
  status: "ok" | "error";
  version: number;
  links: EventDetourLink[];
  error?: string;
}

function resolveSavedRecommendation(
  status: LinkStatusMode,
  link: Omit<EventDetourLink, "recommendation" | "reviewedGeometryVersion">,
  detour: DetourRoute | undefined,
  supportedDirections: Set<EventTravelDirection>
): { recommendation: DetourRecommendation; reviewedGeometryVersion: number | null } {
  if (status === "INACTIVE") {
    return { recommendation: "WITHDRAWN", reviewedGeometryVersion: null };
  }
  const probe: EventDetourLink = {
    ...link,
    recommendation: "RECOMMENDED",
    reviewedGeometryVersion: null,
  };
  const blockers = getRecommendationReviewBlockers(probe, detour, supportedDirections);
  if (blockers.length === 0) {
    return {
      recommendation: "RECOMMENDED",
      reviewedGeometryVersion: Math.max(1, Number(detour?.geometry_revision) || 1),
    };
  }
  return { recommendation: "PENDING", reviewedGeometryVersion: null };
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseEventDetourLinkModalParams {
  isOpen: boolean;
  initialMode?: "BY_EVENT" | "BY_DETOUR";
  initialEventId?: string;
  initialDetourId?: string;
  systemData: SystemDataPayload;
  onDataRefresh?: (data?: any) => Promise<any> | void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function useEventDetourLinkModal({
  isOpen,
  initialMode = "BY_EVENT",
  initialEventId,
  initialDetourId,
  systemData,
  onDataRefresh,
  onClose,
  onToast,
}: UseEventDetourLinkModalParams) {
  const parentEvents = useMemo<ParentFloodEventGroup[]>(
    () => groupFloodRoutesIntoEvents(systemData.floodRoutes || []),
    [systemData.floodRoutes]
  );
  const detourList = useMemo<DetourRoute[]>(
    () => systemData.detourRoutes || [],
    [systemData.detourRoutes]
  );
  const detourMap = useMemo(() => {
    const map = new Map<string, DetourRoute>();
    for (const d of detourList) map.set(d.id, d);
    return map;
  }, [detourList]);
  const eventMap = useMemo(() => {
    const map = new Map<string, ParentFloodEventGroup>();
    for (const ev of parentEvents) map.set(ev.eventId, ev);
    return map;
  }, [parentEvents]);

  const [mode, setMode] = useState<"BY_EVENT" | "BY_DETOUR">(initialMode);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDetourId, setSelectedDetourId] = useState<string>("");

  // Mode BY_EVENT state
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventVersion, setEventVersion] = useState<number>(0);
  const [draftLinks, setDraftLinks] = useState<EventDetourLink[]>([]);
  const [detourSearch, setDetourSearch] = useState("");
  const [addEventDirection, setAddEventDirection] = useState<EventTravelDirection>("BOTH");

  // Mode BY_DETOUR state
  const [byDetourLoading, setByDetourLoading] = useState(false);
  const [byDetourError, setByDetourError] = useState<string | null>(null);
  const [eventStates, setEventStates] = useState<Record<string, LoadedEventState>>({});
  const [byDetourDrafts, setByDetourDrafts] = useState<Record<string, ByDetourRowDraft>>({});

  // Shared Save / Feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);
  const [readySession, setReadySession] = useState(false);
  const wasOpenRef = useRef(false);
  const selectedDetourIdRef = useRef(selectedDetourId);
  selectedDetourIdRef.current = selectedDetourId;

  // Reset active mode & selection when modal opens
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setReadySession(false);
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setMode(initialMode);
      setSelectedEventId(initialEventId || parentEvents[0]?.eventId || "");
      setSelectedDetourId(initialDetourId || detourList[0]?.id || "");
      setDetourSearch("");
      setSaveError(null);
      setVerifiedNotice(null);
      setReadySession(true);
    }
  }, [isOpen, initialMode, initialEventId, initialDetourId, parentEvents, detourList]);

  const selectedEvent = eventMap.get(selectedEventId);
  const selectedEventSupportedDirs = useMemo(
    () => getEventSupportedRecommendedDirections(selectedEvent?.segments || []),
    [selectedEvent]
  );

  useEffect(() => {
    if (!isOpen) return;
    setAddEventDirection(resolveDefaultEventDirection(selectedEvent?.segments || []));
  }, [isOpen, selectedEventId, selectedEvent]);

  const loadSingleEvent = useCallback(async (eventId: string) => {
    if (!eventId) {
      setDraftLinks([]);
      setEventVersion(0);
      setEventError(null);
      return;
    }
    setEventLoading(true);
    setEventError(null);
    setSaveError(null);
    try {
      const res: EventDetourLinksResult = await getEventDetourLinksAction(eventId);
      setEventVersion(res.version);
      setDraftLinks(resequenceEventDetourLinks([...(res.links || [])].sort(compareEventDetourLinks)));
    } catch (err: any) {
      setEventError(err?.message || "ไม่สามารถโหลดความสัมพันธ์จากฐานข้อมูลได้");
    } finally {
      setEventLoading(false);
    }
  }, []);

  const buildByDetourDrafts = useCallback(
    (
      targetDetourId: string,
      states: Record<string, LoadedEventState>
    ): Record<string, ByDetourRowDraft> => {
      const targetDetour = detourMap.get(targetDetourId);
      const defaultDetourDir = resolveDefaultDetourDirection(targetDetour?.direction_mode);
      const nextDrafts: Record<string, ByDetourRowDraft> = {};

      for (const ev of parentEvents) {
        const loaded = states[ev.eventId];
        const matchingLinks = (loaded?.links || []).filter((l) => l.detourId === targetDetourId);
        const existing = matchingLinks[0];
        if (existing) {
          const allInactive = matchingLinks.every(
            (l) => recommendationToLinkStatus(l.recommendation) === "INACTIVE"
          );
          nextDrafts[ev.eventId] = {
            linked: true,
            sourceEventDirection: matchingLinks.length > 1 ? "BOTH" : existing.eventDirection,
            eventDirection: matchingLinks.length > 1 ? "BOTH" : existing.eventDirection,
            detourDirection: existing.detourDirection,
            status: allInactive ? "INACTIVE" : "ACTIVE",
          };
        } else {
          nextDrafts[ev.eventId] = {
            linked: false,
            sourceEventDirection: null,
            eventDirection: resolveDefaultEventDirection(ev.segments || []),
            detourDirection: defaultDetourDir,
            status: "ACTIVE",
          };
        }
      }
      return nextDrafts;
    },
    [detourMap, parentEvents]
  );

  const loadAllEventsForDetourMode = useCallback(
    async (targetDetourId: string) => {
      if (parentEvents.length === 0) {
        setEventStates({});
        setByDetourDrafts({});
        setByDetourError(null);
        return;
      }
      setByDetourLoading(true);
      setByDetourError(null);
      setSaveError(null);
      try {
        const results = await Promise.allSettled(
          parentEvents.map((ev) => getEventDetourLinksAction(ev.eventId))
        );
        const nextStates: Record<string, LoadedEventState> = {};
        let failureCount = 0;
        let firstError = "";

        results.forEach((result, idx) => {
          const ev = parentEvents[idx];
          if (result.status === "fulfilled") {
            nextStates[ev.eventId] = {
              status: "ok",
              version: result.value.version,
              links: resequenceEventDetourLinks([...(result.value.links || [])].sort(compareEventDetourLinks)),
            };
          } else {
            failureCount++;
            const msg = result.reason?.message || "โหลดข้อมูลเหตุการณ์ไม่สำเร็จ";
            if (!firstError) firstError = msg;
            nextStates[ev.eventId] = {
              status: "error",
              version: 0,
              links: [],
              error: msg,
            };
          }
        });

        setEventStates(nextStates);
        if (failureCount === parentEvents.length) {
          setByDetourError(firstError || "ไม่สามารถโหลดรายการความสัมพันธ์จากฐานข้อมูลได้");
        } else if (failureCount > 0) {
          setByDetourError(`โหลดข้อมูลไม่สำเร็จ ${failureCount} จาก ${parentEvents.length} เหตุการณ์ (${firstError})`);
        }
        setByDetourDrafts(buildByDetourDrafts(targetDetourId, nextStates));
      } finally {
        setByDetourLoading(false);
      }
    },
    [parentEvents, buildByDetourDrafts]
  );

  useEffect(() => {
    if (!isOpen || !readySession) return;
    if (mode === "BY_EVENT" && selectedEventId) {
      void loadSingleEvent(selectedEventId);
    } else if (mode === "BY_DETOUR") {
      void loadAllEventsForDetourMode(selectedDetourIdRef.current);
    }
  }, [isOpen, readySession, mode, selectedEventId, loadSingleEvent, loadAllEventsForDetourMode]);

  // Keep BY_DETOUR drafts synchronized when switching selected detour after states are loaded
  useEffect(() => {
    if (!isOpen || mode !== "BY_DETOUR") return;
    if (Object.keys(eventStates).length > 0) {
      setByDetourDrafts(buildByDetourDrafts(selectedDetourId, eventStates));
    }
  }, [isOpen, mode, selectedDetourId, eventStates, buildByDetourDrafts]);

  const handleAddDetourToEvent = (detour: DetourRoute) => {
    if (!selectedEventId) return;
    const sameDetourLinks = draftLinks.filter((l) => l.detourId === detour.id);
    const duplicateExact = sameDetourLinks.some((l) => l.eventDirection === addEventDirection);
    if (duplicateExact) {
      onToast(`ทางเลี่ยง "${detour.route_name}" ถูกผูกในทิศทางนี้แล้ว`);
      return;
    }
    if (
      sameDetourLinks.some((l) => l.eventDirection === "BOTH") ||
      (addEventDirection === "BOTH" && sameDetourLinks.length > 0)
    ) {
      onToast(`ทางเลี่ยง "${detour.route_name}" มีการผูกในเหตุการณ์นี้แล้ว กรุณาปรับทิศทางเดิมแทนการเพิ่มซ้ำ`);
      return;
    }

    const defaultDetourDir = resolveDefaultDetourDirection(detour.direction_mode);
    const resolved = resolveSavedRecommendation(
      "ACTIVE",
      {
        eventId: selectedEventId,
        detourId: detour.id,
        eventDirection: addEventDirection,
        detourDirection: defaultDetourDir,
        position: draftLinks.length + 1,
      },
      detour,
      selectedEventSupportedDirs
    );
    const newLink: EventDetourLink = {
      eventId: selectedEventId,
      detourId: detour.id,
      eventDirection: addEventDirection,
      detourDirection: defaultDetourDir,
      position: draftLinks.length + 1,
      recommendation: resolved.recommendation,
      reviewedGeometryVersion: resolved.reviewedGeometryVersion,
    };
    setDraftLinks((prev) => resequenceEventDetourLinks([...prev, newLink]));
    setVerifiedNotice(null);
    setSaveError(null);
  };

  const handleRemoveLink = (detourId: string, eventDirection: EventTravelDirection) => {
    setDraftLinks((prev) =>
      resequenceEventDetourLinks(
        prev.filter((l) => !(l.detourId === detourId && l.eventDirection === eventDirection))
      )
    );
    setVerifiedNotice(null);
    setSaveError(null);
  };

  const handleMoveLink = (detourId: string, dir: "UP" | "DOWN") => {
    setDraftLinks((prev) => {
      const ids = [...new Set(prev.map((link) => link.detourId))];
      const index = ids.indexOf(detourId);
      const target = index + (dir === "UP" ? -1 : 1);
      if (index < 0 || target < 0 || target >= ids.length) return prev;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return resequenceEventDetourLinks(ids.flatMap((id) => prev.filter((link) => link.detourId === id)));
    });
    setVerifiedNotice(null);
    setSaveError(null);
  };

  const handleUpdateLink = (
    detourId: string,
    currentEventDir: EventTravelDirection,
    patch: Partial<EventDetourLink> & { statusMode?: LinkStatusMode }
  ) => {
    const detour = detourMap.get(detourId);
    if (patch.eventDirection && patch.eventDirection !== currentEventDir) {
      const otherForDetour = draftLinks.filter(
        (l) => l.detourId === detourId && l.eventDirection !== currentEventDir
      );
      if (
        otherForDetour.some((l) => l.eventDirection === patch.eventDirection) ||
        (patch.eventDirection === "BOTH" && otherForDetour.length > 0) ||
        otherForDetour.some((l) => l.eventDirection === "BOTH")
      ) {
        setSaveError("ทางเลี่ยงนี้ถูกผูกในทิศทางเหตุการณ์ที่เลือกไว้แล้ว กรุณาเลือกทิศทางอื่นหรือลบรายการซ้ำก่อน");
        return;
      }
    }

    setDraftLinks((prev) =>
      resequenceEventDetourLinks(
        prev.map((link) => {
          if (link.detourId !== detourId || link.eventDirection !== currentEventDir) return link;
          const nextStatus =
            patch.statusMode ?? recommendationToLinkStatus(link.recommendation);
          const merged = {
            ...link,
            eventDirection: patch.eventDirection ?? link.eventDirection,
            detourDirection: patch.detourDirection ?? link.detourDirection,
          };
          const resolved = resolveSavedRecommendation(
            nextStatus,
            merged,
            detour,
            selectedEventSupportedDirs
          );
          return {
            ...merged,
            recommendation: resolved.recommendation,
            reviewedGeometryVersion: resolved.reviewedGeometryVersion,
          };
        })
      )
    );
    setVerifiedNotice(null);
    setSaveError(null);
  };

  const handleSaveByEvent = async () => {
    if (!selectedEventId) {
      setSaveError("กรุณาเลือกเหตุการณ์น้ำท่วมก่อนบันทึก");
      return;
    }

    const normalizedLinks = resequenceEventDetourLinks(draftLinks).map((link) => {
      const detour = detourMap.get(link.detourId);
      const statusMode = recommendationToLinkStatus(link.recommendation);
      const resolved = resolveSavedRecommendation(
        statusMode,
        link,
        detour,
        selectedEventSupportedDirs
      );
      return {
        ...link,
        recommendation: resolved.recommendation,
        reviewedGeometryVersion: resolved.reviewedGeometryVersion,
      };
    });

    const payload = {
      eventId: selectedEventId,
      expectedVersion: eventVersion,
      operationId: createOperationId(),
      links: normalizedLinks,
    };

    const validationErrors = validateEventDetourLinks(payload);
    if (validationErrors.length > 0) {
      setSaveError(validationErrors.join(" · "));
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setVerifiedNotice(null);
    try {
      await replaceEventDetourLinksAction(payload);
      const reloaded = await getEventDetourLinksAction(selectedEventId);
      const reloadedLinks = resequenceEventDetourLinks([...(reloaded.links || [])].sort(compareEventDetourLinks));
      setEventVersion(reloaded.version);
      setDraftLinks(reloadedLinks);
      await onDataRefresh?.();
      setVerifiedNotice(
        `ยืนยันข้อมูลจากฐานข้อมูลแล้ว (เวอร์ชัน v${reloaded.version} · ${reloadedLinks.length} ความสัมพันธ์)`
      );
      onToast("บันทึกและโหลดยืนยันความสัมพันธ์จากฐานข้อมูลเรียบร้อย");
    } catch (err: any) {
      setSaveError(err?.message || "บันทึกความสัมพันธ์ไม่สำเร็จ กรุณาลองโหลดข้อมูลใหม่");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveByDetour = async () => {
    if (!selectedDetourId) {
      setSaveError("กรุณาเลือกเส้นทางเลี่ยงก่อนบันทึก");
      return;
    }
    const targetDetour = detourMap.get(selectedDetourId);

    const modifiedEvents: Array<{
      ev: ParentFloodEventGroup;
      state: LoadedEventState;
      mergedLinks: EventDetourLink[];
    }> = [];

    for (const ev of parentEvents) {
      const loaded = eventStates[ev.eventId];
      const draft = byDetourDrafts[ev.eventId];
      if (!loaded || loaded.status !== "ok" || !draft) continue;

      const existingRows = loaded.links.filter((l) => l.detourId === selectedDetourId);
      const existing = existingRows[0];
      const existingDir: EventTravelDirection | null =
        existingRows.length > 1 ? "BOTH" : existing ? existing.eventDirection : null;
      const existingStatus: LinkStatusMode | null = existing
        ? existingRows.every((l) => recommendationToLinkStatus(l.recommendation) === "INACTIVE")
          ? "INACTIVE"
          : "ACTIVE"
        : null;

      const isUnchanged =
        (!existing && !draft.linked) ||
        (Boolean(existing) &&
          draft.linked &&
          existingDir === draft.eventDirection &&
          existing!.detourDirection === draft.detourDirection &&
          existingStatus === draft.status);

      if (isUnchanged) continue;

      const preservedOtherLinks = loaded.links.filter((l) => l.detourId !== selectedDetourId);
      const candidateLinks = [...preservedOtherLinks];

      if (draft.linked) {
        const supported = getEventSupportedRecommendedDirections(ev.segments || []);
        const resolved = resolveSavedRecommendation(
          draft.status,
          {
            eventId: ev.eventId,
            detourId: selectedDetourId,
            eventDirection: draft.eventDirection,
            detourDirection: draft.detourDirection,
            position: existing?.position ?? candidateLinks.length + 1,
          },
          targetDetour,
          supported
        );
        const newOrUpdated: EventDetourLink = {
          eventId: ev.eventId,
          detourId: selectedDetourId,
          eventDirection: draft.eventDirection,
          detourDirection: draft.detourDirection,
          position: existing?.position ?? candidateLinks.length + 1,
          eventPosition: existing?.eventPosition,
          recommendation: resolved.recommendation,
          reviewedGeometryVersion: resolved.reviewedGeometryVersion,
        };
        const originalIndex = loaded.links.findIndex((row) => row.detourId === selectedDetourId);
        candidateLinks.splice(originalIndex < 0 ? candidateLinks.length : originalIndex, 0, newOrUpdated);
      }

      const mergedLinks = resequenceEventDetourLinks(candidateLinks);
      const checkPayload = {
        eventId: ev.eventId,
        expectedVersion: loaded.version,
        operationId: createOperationId(),
        links: mergedLinks,
      };
      const errors = validateEventDetourLinks(checkPayload);
      if (errors.length > 0) {
        setSaveError(`เหตุการณ์ "${ev.eventTitle}": ${errors.join(" · ")}`);
        return;
      }

      modifiedEvents.push({ ev, state: loaded, mergedLinks });
    }

    if (modifiedEvents.length === 0) {
      setVerifiedNotice("ไม่มีการเปลี่ยนแปลงความสัมพันธ์ที่ต้องบันทึก");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setVerifiedNotice(null);
    const updatedStates = { ...eventStates };
    let savedCount = 0;
    let totalReloadedLinks = 0;
    try {
      for (const item of modifiedEvents) {
        await replaceEventDetourLinksAction({
          eventId: item.ev.eventId,
          expectedVersion: item.state.version,
          operationId: createOperationId(),
          links: item.mergedLinks,
        });
        const reloaded = await getEventDetourLinksAction(item.ev.eventId);
        const reloadedLinks = resequenceEventDetourLinks([...(reloaded.links || [])].sort(compareEventDetourLinks));
        totalReloadedLinks += reloadedLinks.length;
        savedCount++;
        updatedStates[item.ev.eventId] = {
          status: "ok",
          version: reloaded.version,
          links: reloadedLinks,
        };
        setEventStates({ ...updatedStates });
      }

      setByDetourDrafts(buildByDetourDrafts(selectedDetourId, updatedStates));
      await onDataRefresh?.();
      setVerifiedNotice(
        `ยืนยันข้อมูลจากฐานข้อมูลแล้ว (อัปเดต ${savedCount} เหตุการณ์ · รวม ${totalReloadedLinks} ความสัมพันธ์ในเหตุการณ์ที่ปรับปรุง)`
      );
      onToast("บันทึกและโหลดยืนยันความสัมพันธ์หลายเหตุการณ์เรียบร้อย");
    } catch (err: any) {
      if (savedCount > 0) {
        setByDetourDrafts(buildByDetourDrafts(selectedDetourId, updatedStates));
      }
      setSaveError(
        err?.message || "บันทึกความสัมพันธ์ไม่สำเร็จ กรุณากดลองโหลดใหม่ก่อนบันทึกซ้ำ"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAvailableDetours = detourList.filter((d) => {
    if (!detourSearch.trim()) return true;
    const q = detourSearch.toLowerCase().trim();
    return (
      d.route_name.toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q)
    );
  });

  const selectedDetour = detourMap.get(selectedDetourId);

  return {
    parentEvents,
    detourList,
    detourMap,
    eventMap,
    mode,
    setMode,
    selectedEventId,
    setSelectedEventId,
    selectedDetourId,
    setSelectedDetourId,
    eventLoading,
    eventError,
    eventVersion,
    draftLinks,
    detourSearch,
    setDetourSearch,
    addEventDirection,
    setAddEventDirection,
    byDetourLoading,
    byDetourError,
    eventStates,
    byDetourDrafts,
    setByDetourDrafts,
    isSaving,
    saveError,
    setSaveError,
    verifiedNotice,
    setVerifiedNotice,
    readySession,
    selectedEvent,
    selectedEventSupportedDirs,
    loadSingleEvent,
    loadAllEventsForDetourMode,
    handleAddDetourToEvent,
    handleRemoveLink,
    handleMoveLink,
    handleUpdateLink,
    handleSaveByEvent,
    handleSaveByDetour,
    filteredAvailableDetours,
    selectedDetour,
  };
}
