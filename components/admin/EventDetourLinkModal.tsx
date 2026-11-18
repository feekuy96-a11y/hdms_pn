"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

// Stillness is the design: modal uses instant visibility without custom keyframe animations,
// keeping focus management predictable and respecting prefers-reduced-motion.

interface EventDetourLinkModalProps {
  isOpen: boolean;
  initialMode?: "BY_EVENT" | "BY_DETOUR";
  initialEventId?: string;
  initialDetourId?: string;
  systemData: SystemDataPayload;
  onDataRefresh?: (data?: any) => Promise<any> | void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface ByDetourRowDraft {
  linked: boolean;
  sourceEventDirection: EventTravelDirection | null;
  eventDirection: EventTravelDirection;
  detourDirection: DetourTravelDirection;
  status: LinkStatusMode;
}

interface LoadedEventState {
  status: "ok" | "error";
  version: number;
  links: EventDetourLink[];
  error?: string;
}

const EVENT_DIRECTION_LABELS: Record<EventTravelDirection, string> = {
  BOTH: "๒ ทิศทาง (ไป-กลับ A ⇄ B)",
  A_TO_B: "ขาไปตามหลัก กม. (A → B)",
  B_TO_A: "ขากลับย้อนหลัก กม. (B → A)",
  UNKNOWN: "ยังไม่ระบุทิศทางเหตุการณ์",
};

const DETOUR_DIRECTION_LABELS: Record<DetourTravelDirection, string> = {
  TWO_WAY: "๒ ทิศทาง (A ⇄ B)",
  FORWARD: "ขาไปของทางเลี่ยง (A → B)",
  REVERSE: "ขากลับของทางเลี่ยง (B → A)",
  UNKNOWN: "ยังไม่ระบุทิศทางทางเลี่ยง",
};

const STATUS_MODE_LABELS: Record<LinkStatusMode, string> = {
  ACTIVE: "ใช้งาน",
  INACTIVE: "ไม่ใช้งาน",
};

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

function getDetourModeLabel(mode?: string): string {
  if (mode === "FORWARD_ONLY") return "เฉพาะขาไป (A → B)";
  if (mode === "REVERSE_ONLY") return "เฉพาะขากลับ (B → A)";
  if (mode === "TWO_WAY") return "๒ ทิศทาง (A ⇄ B)";
  return "ไม่ระบุทิศทาง";
}

export function EventDetourLinkModal({
  isOpen,
  initialMode = "BY_EVENT",
  initialEventId,
  initialDetourId,
  systemData,
  onDataRefresh,
  onClose,
  onToast,
}: EventDetourLinkModalProps) {
  const dialog = useModalAccessibility(isOpen, onClose);

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
      setDraftLinks(resequenceEventDetourLinks(res.links || []));
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
              links: resequenceEventDetourLinks(result.value.links || []),
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

  const handleMoveLink = (
    detourId: string,
    eventDirection: EventTravelDirection,
    dir: "UP" | "DOWN"
  ) => {
    setDraftLinks((prev) => {
      const scopeLinks = prev.filter((l) => l.eventDirection === eventDirection);
      const otherLinks = prev.filter((l) => l.eventDirection !== eventDirection);
      const idx = scopeLinks.findIndex((l) => l.detourId === detourId);
      if (idx === -1) return prev;
      const targetIdx = dir === "UP" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= scopeLinks.length) return prev;

      const updatedScope = [...scopeLinks];
      const [moved] = updatedScope.splice(idx, 1);
      updatedScope.splice(targetIdx, 0, moved);
      return resequenceEventDetourLinks([...otherLinks, ...updatedScope]);
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
      const reloadedLinks = resequenceEventDetourLinks(reloaded.links || []);
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
          recommendation: resolved.recommendation,
          reviewedGeometryVersion: resolved.reviewedGeometryVersion,
        };
        candidateLinks.push(newOrUpdated);
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
        const reloadedLinks = resequenceEventDetourLinks(reloaded.links || []);
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

  if (!isOpen) return null;

  const filteredAvailableDetours = detourList.filter((d) => {
    if (!detourSearch.trim()) return true;
    const q = detourSearch.toLowerCase().trim();
    return (
      d.route_name.toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q)
    );
  });

  const selectedDetour = detourMap.get(selectedDetourId);

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-end justify-center bg-black/80 backdrop-blur-sm p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialog.dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="จัดการความสัมพันธ์เหตุการณ์และทางเลี่ยง"
        tabIndex={-1}
        onKeyDown={dialog.onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-amber-500/50 bg-[#0c162c] text-slate-100 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-6 bg-slate-950/70">
          <div className="min-w-0">
            <h2 className="font-heading font-black text-base sm:text-lg text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-400 shrink-0" />
              <span>จัดการความสัมพันธ์เหตุการณ์ ↔ ทางเลี่ยง (Many-to-Many)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              บันทึกผ่าน Atomic API และตรวจสอบข้อมูลกลับจากฐานข้อมูลจริง โดยไม่เขียนทับโครงสร้างเดิม
            </p>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่างจัดการความสัมพันธ์"
            onClick={onClose}
            className="min-h-10 min-w-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 pt-3 sm:px-6 border-b border-slate-800/80 pb-3 bg-slate-900/40 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("BY_EVENT");
              setSaveError(null);
              setVerifiedNotice(null);
            }}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              mode === "BY_EVENT"
                ? "bg-amber-500 text-slate-950 shadow"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800"
            }`}
          >
            จัดการตามเหตุการณ์ (1 เหตุการณ์ → หลายทางเลี่ยง)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("BY_DETOUR");
              setSaveError(null);
              setVerifiedNotice(null);
            }}
            className={`min-h-10 px-3.5 rounded-xl text-xs font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              mode === "BY_DETOUR"
                ? "bg-amber-500 text-slate-950 shadow"
                : "bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800"
            }`}
          >
            ผูกตามทางเลี่ยง (1 ทางเลี่ยง → หลายเหตุการณ์)
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* Status Feedback Banners */}
          {saveError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/60 bg-rose-950/60 p-3 text-rose-200 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  mode === "BY_EVENT"
                    ? void loadSingleEvent(selectedEventId)
                    : void loadAllEventsForDetourMode(selectedDetourId)
                }
                className="min-h-9 px-3 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white font-heading font-bold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> ลองโหลดใหม่
              </button>
            </div>
          )}

          {verifiedNotice && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3 text-emerald-200 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-heading font-bold">{verifiedNotice}</span>
            </div>
          )}

          {mode === "BY_EVENT" ? (
            <div className="space-y-4">
              {/* Event Selector + Version */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <div className="flex-1 min-w-0 space-y-1">
                  <label htmlFor="select-flood-event" className="block text-slate-300 font-heading font-bold">
                    เลือกเหตุการณ์น้ำท่วมหลัก
                  </label>
                  <select
                    id="select-flood-event"
                    aria-label="เลือกเหตุการณ์น้ำท่วม"
                    value={selectedEventId}
                    onChange={(e) => {
                      setSelectedEventId(e.target.value);
                      setVerifiedNotice(null);
                      setSaveError(null);
                    }}
                    className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    {parentEvents.length === 0 ? (
                      <option value="">-- ไม่มีเหตุการณ์น้ำท่วมในระบบ --</option>
                    ) : (
                      parentEvents.map((ev) => (
                        <option key={ev.eventId} value={ev.eventId}>
                          ทล.{ev.routeNo} · {ev.sectionName || ev.eventTitle}{ev.kmRangeLabel ? ` · ${ev.kmRangeLabel}` : ""} ({ev.segments.length} ช่วง)
                        </option>
                      ))
                    )}
                  </select>
                  {selectedEvent?.kmRangeLabel && (
                    <p className="text-[11px] text-amber-300/90 font-mono">
                      ช่วงหลักกิโลเมตร: {selectedEvent.kmRangeLabel} ({selectedEvent.segments.length} ช่วง)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="min-h-10 inline-flex items-center px-3 rounded-xl bg-sky-950/80 border border-sky-700/60 text-sky-300 font-mono font-bold">
                    เวอร์ชันข้อมูล v{eventVersion}
                  </span>
                </div>
              </div>

              {/* Linked Detours List */}
              {eventLoading ? (
                <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-2 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span>กำลังโหลดความสัมพันธ์จากฐานข้อมูล...</span>
                </div>
              ) : eventError ? (
                <div className="p-6 rounded-2xl border border-rose-500/50 bg-rose-950/30 text-center space-y-3">
                  <p className="text-rose-300 font-heading font-bold">{eventError}</p>
                  <button
                    type="button"
                    onClick={() => void loadSingleEvent(selectedEventId)}
                    className="min-h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-heading font-bold inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" /> ลองโหลดใหม่
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold text-sm text-white">
                      ทางเลี่ยงที่เชื่อมโยงกับเหตุการณ์นี้ ({draftLinks.length} รายการ)
                    </h3>
                  </div>

                  {draftLinks.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/80 text-center text-slate-400">
                      ยังไม่มีทางเลี่ยงที่ผูกกับเหตุการณ์นี้ — สามารถเลือกเพิ่มได้จากรายการด้านล่าง
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {draftLinks.map((link) => {
                        const detour = detourMap.get(link.detourId);
                        const detourName = detour?.route_name || link.detourId;
                        const scopeLinks = draftLinks.filter(
                          (l) => l.eventDirection === link.eventDirection
                        );
                        const scopeIdx = scopeLinks.findIndex(
                          (l) => l.detourId === link.detourId
                        );
                        const canUp = scopeIdx > 0;
                        const canDown = scopeIdx >= 0 && scopeIdx < scopeLinks.length - 1;
                        const statusMode = recommendationToLinkStatus(link.recommendation);
                        const blockers = getRecommendationReviewBlockers(
                          { ...link, recommendation: "RECOMMENDED" },
                          detour,
                          selectedEventSupportedDirs
                        );

                        return (
                          <div
                            key={`${link.eventDirection}::${link.detourId}`}
                            className="p-3.5 rounded-2xl border border-slate-800 bg-slate-950/90 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 font-mono font-black">
                                  #{link.position}
                                </span>
                                <span className="font-heading font-bold text-sm text-white break-words">
                                  {detourName}
                                </span>
                                {detour && !detour.is_active && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                    ปิดชั่วคราว
                                  </span>
                                )}
                                {detour && (
                                  <span className="text-[11px] text-sky-300">
                                    ({getDetourModeLabel(detour.direction_mode)})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  aria-label={`เลื่อนลำดับ ${detourName} ขึ้น`}
                                  disabled={!canUp}
                                  onClick={() =>
                                    handleMoveLink(link.detourId, link.eventDirection, "UP")
                                  }
                                  className="min-h-10 min-w-10 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed"
                                  title="เลื่อนลำดับขึ้น"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`เลื่อนลำดับ ${detourName} ลง`}
                                  disabled={!canDown}
                                  onClick={() =>
                                    handleMoveLink(link.detourId, link.eventDirection, "DOWN")
                                  }
                                  className="min-h-10 min-w-10 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-35 disabled:cursor-not-allowed"
                                  title="เลื่อนลำดับลง"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`นำทางเลี่ยง ${detourName} ออกจากเหตุการณ์`}
                                  onClick={() =>
                                    handleRemoveLink(link.detourId, link.eventDirection)
                                  }
                                  className="min-h-10 min-w-10 flex items-center justify-center rounded-xl border border-rose-800/60 bg-rose-950/50 hover:bg-rose-900 text-rose-300"
                                  title="นำออกจากเหตุการณ์"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางเหตุการณ์
                                </label>
                                <select
                                  aria-label={`ทิศทางเหตุการณ์ของ ${detourName}`}
                                  value={link.eventDirection}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      eventDirection: e.target.value as EventTravelDirection,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                                    <option key={dir} value={dir}>
                                      {EVENT_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางทางเลี่ยง
                                </label>
                                <select
                                  aria-label={`ทิศทางทางเลี่ยงของ ${detourName}`}
                                  value={link.detourDirection}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      detourDirection: e.target.value as DetourTravelDirection,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["TWO_WAY", "FORWARD", "REVERSE", "UNKNOWN"] as const).map((dir) => (
                                    <option
                                      key={dir}
                                      value={dir}
                                      disabled={
                                        detour
                                          ? !isDetourDirectionAllowed(dir, detour.direction_mode)
                                          : false
                                      }
                                    >
                                      {DETOUR_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  สถานะ
                                </label>
                                <select
                                  aria-label={`สถานะของ ${detourName}`}
                                  value={statusMode}
                                  onChange={(e) =>
                                    handleUpdateLink(link.detourId, link.eventDirection, {
                                      statusMode: e.target.value as LinkStatusMode,
                                    })
                                  }
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["ACTIVE", "INACTIVE"] as const).map((modeOpt) => (
                                    <option key={modeOpt} value={modeOpt}>
                                      {STATUS_MODE_LABELS[modeOpt]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {statusMode === "ACTIVE" && blockers.length > 0 && (
                              <p className="text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                                หมายเหตุ: {blockers.join(" · ")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Detour Section */}
                  <div className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                    <h3 className="font-heading font-bold text-sm text-amber-300 flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> เพิ่มทางเลี่ยงเข้าในเหตุการณ์นี้
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          aria-label="ค้นหาทางเลี่ยงเพื่อผูกกับเหตุการณ์"
                          placeholder="ค้นหาชื่อเส้นทางเลี่ยง..."
                          value={detourSearch}
                          onChange={(e) => setDetourSearch(e.target.value)}
                          className="w-full min-h-10 bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-slate-500"
                        />
                      </div>
                      <select
                        aria-label="ทิศทางเหตุการณ์ที่จะเพิ่ม"
                        value={addEventDirection}
                        onChange={(e) =>
                          setAddEventDirection(e.target.value as EventTravelDirection)
                        }
                        className="w-full min-h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs text-white"
                      >
                        {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                          <option key={dir} value={dir}>
                            เพิ่มสำหรับ {EVENT_DIRECTION_LABELS[dir]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {filteredAvailableDetours.length === 0 ? (
                        <p className="text-slate-400 py-2 text-center">ไม่พบทางเลี่ยงที่ค้นหา</p>
                      ) : (
                        filteredAvailableDetours.map((d) => {
                          const alreadyInDir = draftLinks.some(
                            (l) => l.detourId === d.id && l.eventDirection === addEventDirection
                          );
                          return (
                            <div
                              key={d.id}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80"
                            >
                              <div className="min-w-0">
                                <span className="font-heading font-bold text-white block truncate">
                                  {d.route_name}
                                </span>
                                <span className="text-slate-400">
                                  {getDetourModeLabel(d.direction_mode)}
                                  {!d.is_active ? " · ปิดชั่วคราว" : ""}
                                </span>
                              </div>
                              <button
                                type="button"
                                aria-label={`เพิ่มทางเลี่ยง ${d.route_name}`}
                                disabled={alreadyInDir || !selectedEventId}
                                onClick={() => handleAddDetourToEvent(d)}
                                className="min-h-10 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-heading font-bold shrink-0 inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{alreadyInDir ? "ผูกแล้ว" : "เพิ่ม"}</span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Detour Selector */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <label htmlFor="select-detour-route" className="block text-slate-300 font-heading font-bold">
                  เลือกเส้นทางเลี่ยงที่ต้องการผูกกับหลายเหตุการณ์
                </label>
                <select
                  id="select-detour-route"
                  aria-label="เลือกเส้นทางเลี่ยง"
                  value={selectedDetourId}
                  onChange={(e) => {
                    setSelectedDetourId(e.target.value);
                    setVerifiedNotice(null);
                    setSaveError(null);
                  }}
                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {detourList.length === 0 ? (
                    <option value="">-- ไม่มีเส้นทางเลี่ยงในระบบ --</option>
                  ) : (
                    detourList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.route_name} ({getDetourModeLabel(d.direction_mode)})
                      </option>
                    ))
                  )}
                </select>
                {selectedDetour && (
                  <p className="text-slate-400">
                    โหมดเดินรถ: <strong className="text-sky-300">{getDetourModeLabel(selectedDetour.direction_mode)}</strong>
                    {" · "}สถานะ: <strong className={selectedDetour.is_active ? "text-emerald-300" : "text-slate-300"}>{selectedDetour.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}</strong>
                    {" · "}เวอร์ชันแนวเส้น rev.{selectedDetour.geometry_revision || 1}
                  </p>
                )}
              </div>

              {byDetourLoading ? (
                <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center gap-2 text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span>กำลังโหลดความสัมพันธ์ของทุกเหตุการณ์จากฐานข้อมูล...</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {byDetourError && (
                    <div className="p-3 rounded-xl border border-amber-500/50 bg-amber-950/30 text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <span>{byDetourError}</span>
                      <button
                        type="button"
                        onClick={() => void loadAllEventsForDetourMode(selectedDetourId)}
                        className="min-h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-heading font-bold inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> ลองโหลดใหม่
                      </button>
                    </div>
                  )}

                  {parentEvents.length === 0 ? (
                    <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950 text-center text-slate-400">
                      ไม่มีเหตุการณ์น้ำท่วมในระบบ
                    </div>
                  ) : (
                    parentEvents.map((ev) => {
                      const state = eventStates[ev.eventId];
                      const draft = byDetourDrafts[ev.eventId];
                      const eventTitle = ev.eventTitle || `ทล.${ev.routeNo} ตอน${ev.sectionName}`;
                      const supported = getEventSupportedRecommendedDirections(ev.segments || []);
                      const previewLink: EventDetourLink | null = draft
                        ? {
                            eventId: ev.eventId,
                            detourId: selectedDetourId,
                            eventDirection: draft.eventDirection,
                            detourDirection: draft.detourDirection,
                            position: 1,
                            recommendation: "RECOMMENDED",
                            reviewedGeometryVersion: null,
                          }
                        : null;
                      const blockers = previewLink
                        ? getRecommendationReviewBlockers(previewLink, selectedDetour, supported)
                        : [];

                      return (
                        <div
                          key={ev.eventId}
                          className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                            draft?.linked
                              ? "border-amber-500/50 bg-slate-950"
                              : "border-slate-800 bg-slate-950/60"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                aria-label={`ผูกกับเหตุการณ์ ${eventTitle}`}
                                disabled={!state || state.status !== "ok"}
                                checked={Boolean(draft?.linked)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setByDetourDrafts((prev) => ({
                                    ...prev,
                                    [ev.eventId]: {
                                      ...(prev[ev.eventId] || {
                                        sourceEventDirection: null,
                                        eventDirection: resolveDefaultEventDirection(ev.segments || []),
                                        detourDirection: resolveDefaultDetourDirection(
                                          selectedDetour?.direction_mode
                                        ),
                                        status: "ACTIVE",
                                      }),
                                      linked: checked,
                                    },
                                  }));
                                  setVerifiedNotice(null);
                                  setSaveError(null);
                                }}
                                className="mt-0.5 h-5 w-5 accent-amber-500 rounded shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="font-heading font-bold text-sm text-white break-words block">
                                  {eventTitle}
                                </span>
                                {ev.kmRangeLabel && (
                                  <span className="text-[11px] font-mono text-amber-300/90 block">
                                    {ev.kmRangeLabel} ({ev.segments.length} ช่วง)
                                  </span>
                                )}
                              </span>
                            </label>
                            <span className="text-slate-400 font-mono">
                              {state?.status === "ok"
                                ? `v${state.version} · ${state.links.length} ทางเลี่ยง`
                                : state?.error || "โหลดไม่สำเร็จ"}
                            </span>
                          </div>

                          {draft?.linked && state?.status === "ok" && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางเหตุการณ์
                                </label>
                                <select
                                  aria-label={`ทิศทางเหตุการณ์สำหรับ ${eventTitle}`}
                                  value={draft.eventDirection}
                                  onChange={(e) => {
                                    const nextDir = e.target.value as EventTravelDirection;
                                    setByDetourDrafts((prev) => {
                                      const cur = prev[ev.eventId];
                                      if (!cur) return prev;
                                      return { ...prev, [ev.eventId]: { ...cur, eventDirection: nextDir } };
                                    });
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["BOTH", "A_TO_B", "B_TO_A", "UNKNOWN"] as const).map((dir) => (
                                    <option key={dir} value={dir}>
                                      {EVENT_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  ทิศทางทางเลี่ยง
                                </label>
                                <select
                                  aria-label={`ทิศทางทางเลี่ยงสำหรับ ${eventTitle}`}
                                  value={draft.detourDirection}
                                  onChange={(e) => {
                                    const nextDir = e.target.value as DetourTravelDirection;
                                    setByDetourDrafts((prev) => {
                                      const cur = prev[ev.eventId];
                                      if (!cur) return prev;
                                      return { ...prev, [ev.eventId]: { ...cur, detourDirection: nextDir } };
                                    });
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["TWO_WAY", "FORWARD", "REVERSE", "UNKNOWN"] as const).map((dir) => (
                                    <option
                                      key={dir}
                                      value={dir}
                                      disabled={
                                        selectedDetour
                                          ? !isDetourDirectionAllowed(
                                              dir,
                                              selectedDetour.direction_mode
                                            )
                                          : false
                                      }
                                    >
                                      {DETOUR_DIRECTION_LABELS[dir]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 mb-1">
                                  สถานะ
                                </label>
                                <select
                                  aria-label={`สถานะสำหรับ ${eventTitle}`}
                                  value={draft.status}
                                  onChange={(e) => {
                                    const nextStatus = e.target.value as LinkStatusMode;
                                    setByDetourDrafts((prev) => ({
                                      ...prev,
                                      [ev.eventId]: {
                                        ...prev[ev.eventId],
                                        status: nextStatus,
                                      },
                                    }));
                                    setVerifiedNotice(null);
                                  }}
                                  className="w-full min-h-10 bg-slate-900 border border-slate-700 rounded-xl px-2.5 text-xs text-white"
                                >
                                  {(["ACTIVE", "INACTIVE"] as const).map((modeOpt) => (
                                    <option key={modeOpt} value={modeOpt}>
                                      {STATUS_MODE_LABELS[modeOpt]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {draft.status === "ACTIVE" && blockers.length > 0 && (
                                <p className="sm:col-span-3 text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                                  หมายเหตุ: {blockers.join(" · ")}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions — primary save button MUST be last focusable element */}
        <div className="border-t border-slate-800 px-4 py-3.5 sm:px-6 bg-slate-950/90 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={isSaving || eventLoading || byDetourLoading}
            onClick={() =>
              mode === "BY_EVENT"
                ? void loadSingleEvent(selectedEventId)
                : void loadAllEventsForDetourMode(selectedDetourId)
            }
            className="min-h-10 px-3.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sky-300 font-heading font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> โหลดข้อมูลล่าสุดจากฐานข้อมูล
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-heading font-bold text-xs"
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={
                isSaving ||
                (mode === "BY_EVENT" ? eventLoading || !selectedEventId || Boolean(eventError) : byDetourLoading || !selectedDetourId)
              }
              onClick={() =>
                mode === "BY_EVENT" ? void handleSaveByEvent() : void handleSaveByDetour()
              }
              className="min-h-10 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs shadow-lg inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? "กำลังบันทึกและตรวจสอบ..." : "บันทึกความสัมพันธ์"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
