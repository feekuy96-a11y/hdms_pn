"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GisMapViewportApi } from "@/components/map/LongdoGisMap";
import { hasGisFilterChanged } from "@/lib/gis-filter-rules";
import {
  enterGisFocus,
  exitGisFocus,
  IDLE_GIS_FOCUS_STATE,
  updateGisFocusOptions,
  type GisFocusDirection,
  type GisFocusFilterSnapshot,
  type GisFocusOriginSnapshot,
  type GisFocusState,
  type GisFocusViewportSnapshot,
} from "@/lib/gis-focus-mode";

export interface UseSharedGisFocusParams {
  mapViewportApiRef: React.MutableRefObject<GisMapViewportApi | null>;
  /** Optional ref holding a viewport captured prior to opening a modal (center: [lon, lat]). */
  preFocusViewportRef?: React.MutableRefObject<GisFocusViewportSnapshot | null>;
  /** Current active filters; changing search/route/status auto-exits Focus Mode cleanly. */
  filters?: GisFocusFilterSnapshot | null;
  /** True when a modal dialog currently owns Escape handling. */
  isModalOpen?: boolean;
  /** Admin guard: auto-exits and prevents Focus Mode while map picking/editing is active. */
  isEditingBlocked?: boolean;
  /** Side-effect hook invoked before entering Focus Mode (e.g. close modals/drawers). */
  onBeforeEnterFocus?: () => void;
  /** Side-effect hook invoked after exiting Focus Mode (e.g. clear flyTo coordinates). */
  onAfterExitFocus?: () => void;
}

/**
 * Shared GIS Focus Mode lifecycle controller for both Public Dashboard and Admin Workspace.
 * Preserves immutable `{ lon, lat }` origin viewport snapshots, closes stale `.leaflet-popup`,
 * binds Escape exit, and auto-exits on filter changes or when Admin editing mode starts.
 */
export function useSharedGisFocus({
  mapViewportApiRef,
  preFocusViewportRef,
  filters = null,
  isModalOpen = false,
  isEditingBlocked = false,
  onBeforeEnterFocus,
  onAfterExitFocus,
}: UseSharedGisFocusParams) {
  const [gisFocus, setGisFocus] = useState<GisFocusState>(IDLE_GIS_FOCUS_STATE);

  const captureFocusOriginSnapshot = useCallback((): GisFocusOriginSnapshot => {
    const viewport = preFocusViewportRef?.current ?? mapViewportApiRef.current?.getViewport() ?? null;
    if (preFocusViewportRef) {
      preFocusViewportRef.current = null;
    }
    return {
      viewport,
      filters: filters ? { ...filters } : null,
    };
  }, [filters, mapViewportApiRef, preFocusViewportRef]);

  const enterFloodFocus = useCallback(
    (floodId: string) => {
      if (isEditingBlocked || !floodId) return;
      mapViewportApiRef.current?.closePopup();
      onBeforeEnterFocus?.();
      setGisFocus((prev) =>
        enterGisFocus(prev, {
          targetType: "FLOOD",
          targetId: floodId,
          direction: "FORWARD",
          showLinkedDetour: false,
          linkedDetourId: null,
          captureSnapshot: captureFocusOriginSnapshot,
        })
      );
    },
    [captureFocusOriginSnapshot, isEditingBlocked, mapViewportApiRef, onBeforeEnterFocus]
  );

  const enterDetourFocus = useCallback(
    (detourId: string, direction: GisFocusDirection = "FORWARD") => {
      if (isEditingBlocked || !detourId) return;
      mapViewportApiRef.current?.closePopup();
      onBeforeEnterFocus?.();
      setGisFocus((prev) =>
        enterGisFocus(prev, {
          targetType: "DETOUR",
          targetId: detourId,
          direction,
          captureSnapshot: captureFocusOriginSnapshot,
        })
      );
    },
    [captureFocusOriginSnapshot, isEditingBlocked, mapViewportApiRef, onBeforeEnterFocus]
  );

  const updateFocusOptions = useCallback(
    (
      patch: Partial<Pick<GisFocusState, "direction" | "showLinkedDetour" | "linkedDetourId">> & {
        refit?: boolean;
        openDirectionEndpoint?: boolean;
      }
    ) => {
      setGisFocus((prev) => updateGisFocusOptions(prev, patch));
    },
    []
  );

  const exitFocus = useCallback(
    (options?: { restoreViewport?: boolean }) => {
      if (preFocusViewportRef) {
        preFocusViewportRef.current = null;
      }
      onAfterExitFocus?.();
      setGisFocus((prev) => {
        const { nextState, restoreSnapshot } = exitGisFocus(prev);
        if (options?.restoreViewport !== false && restoreSnapshot?.viewport) {
          const vp = restoreSnapshot.viewport;
          window.requestAnimationFrame(() => {
            mapViewportApiRef.current?.restoreViewport(vp);
          });
        }
        return nextState;
      });
    },
    [mapViewportApiRef, onAfterExitFocus, preFocusViewportRef]
  );

  // Escape shortcut when focused and no modal owns focus
  useEffect(() => {
    if (gisFocus.status !== "focused" || isModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exitFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFocus, gisFocus.status, isModalOpen]);

  // Auto-exit when filter criteria change so stale focus never conflicts with filtered view
  const prevFiltersRef = useRef<GisFocusFilterSnapshot | null>(filters);
  useEffect(() => {
    const prev = prevFiltersRef.current;
    prevFiltersRef.current = filters;
    if (gisFocus.status === "focused" && hasGisFilterChanged(prev, filters)) {
      setGisFocus((current) => exitGisFocus(current).nextState);
    }
  }, [filters, gisFocus.status]);

  // Admin editing guard: auto-exit without snapping viewport away when editing/picking starts
  useEffect(() => {
    if (isEditingBlocked && gisFocus.status === "focused") {
      setGisFocus((current) => exitGisFocus(current).nextState);
    }
  }, [isEditingBlocked, gisFocus.status]);

  return {
    gisFocus,
    setGisFocus,
    isFocused: gisFocus.status === "focused",
    enterFloodFocus,
    enterDetourFocus,
    updateFocusOptions,
    exitFocus,
  };
}
