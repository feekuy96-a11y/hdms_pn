"use client";

import React, { useEffect } from "react";
import { DetourRoute, FloodRoute, SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import { defaultDetourDirection, isDetourDirectionAllowed } from "@/lib/detour-presentation";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { groupFloodRoutesIntoEvents } from "@/lib/flood-event-schema";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import {
  addLineCasing,
  buildDetourFallbackPinSpec,
  buildDetourPointPhotoPopupHtml,
  buildDetourPopupHtml,
  buildFloodPopupHtml,
  dashArrayFor,
  escapeHtml,
  getResponsivePopupOptions,
  hasDetourPointMetadata,
  isFloodLineVisibleOnCurrentMap,
  lineAnimationClasses,
  parseRouteCoordinates,
  raisePathLayers,
  resolveDetourPointPinCoord,
  toLeafletLatLng,
  type AnimatedLineEntry,
  type FloodLineEntry,
} from "./longdo-map-popups";
import {
  buildDetourPhotoBadgeSpec,
  buildDetourSymbolIconSpec,
  type FloodMarkerCandidate,
  buildFloodMarkerCandidates,
  buildZoomAdaptiveFloodPinSpec,
  clusterFloodMarkerCandidates,
  computeDeoverlappedMarkerCoord,
  computeFloodEventCenter,
  resolveDetourDefaultDirection,
  resolveDetourPhotoPointCoords,
} from "./longdo-layer-builders";

export interface UseLongdoPopupBridgeParams {
  leafletMapRef: React.MutableRefObject<any>;
  leafletRef: React.MutableRefObject<any>;
  systemDataRef: React.MutableRefObject<SystemDataPayload>;
  onSelectFloodRef: React.MutableRefObject<((id: string) => void) | undefined>;
  onOpenFloodDetoursRef: React.MutableRefObject<((id: string) => void) | undefined>;
  onSelectDetourRef: React.MutableRefObject<((detour: DetourRoute) => void) | undefined>;
  setPreviewPointPhoto: React.Dispatch<React.SetStateAction<{ url: string; title: string } | null>>;
}

/**
 * Registers global popup DOM event handlers (window.__toggleDetourPopupDir,
 * __openFloodDossier, __openDetourGoogleMaps, etc.) and cleans them up on unmount.
 */
export function useLongdoPopupBridge({
  leafletMapRef,
  leafletRef,
  systemDataRef,
  onSelectFloodRef,
  onOpenFloodDetoursRef,
  onSelectDetourRef,
  setPreviewPointPhoto,
}: UseLongdoPopupBridgeParams) {
  useEffect(() => {
    const activeDirMap: Record<string, "FORWARD" | "REVERSE"> = {};

    (window as any).__getDetourCurrentDir = (id: string) => {
      return activeDirMap[id] || "FORWARD";
    };

    (window as any).__openFloodDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      onSelectFloodRef.current?.(id);
    };

    (window as any).__openFloodDetourDossier = (id: string) => {
      leafletMapRef.current?.closePopup();
      if (onOpenFloodDetoursRef.current) {
        onOpenFloodDetoursRef.current(id);
      } else {
        onSelectFloodRef.current?.(id);
      }
    };

    (window as any).__focusFloodOnMap = (id: string) => {
      const map = leafletMapRef.current;
      const L = leafletRef.current;
      const flood = (systemDataRef.current.floodRoutes || []).find((f) => f.id === id);
      if (!map || !L || !flood) return;
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        map.fitBounds(L.latLngBounds(coords.map(toLeafletLatLng)), { padding: [48, 48], maxZoom: 16 });
      } else if (
        coords.length === 1 &&
        Number.isFinite(coords[0][0]) &&
        Number.isFinite(coords[0][1]) &&
        (coords[0][0] !== 0 || coords[0][1] !== 0)
      ) {
        map.setView(toLeafletLatLng(coords[0]), 15);
      } else if (
        Number.isFinite(flood.lat_start) &&
        Number.isFinite(flood.lon_start) &&
        (flood.lat_start !== 0 || flood.lon_start !== 0)
      ) {
        map.setView([flood.lat_start, flood.lon_start], 15);
      }
    };

    (window as any).__openDetourModal = (id: string) => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => d.id === id);
      if (detour) {
        onSelectDetourRef.current?.(detour);
      }
    };

    (window as any).__openDetourPointPhoto = (url: string, title?: string) => {
      if (!url) return;
      setPreviewPointPhoto({ url, title: title || "ภาพทางเข้าเส้นทางเลี่ยง" });
    };

    (window as any).__openDetourGoogleMaps = (safeId: string, dir?: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const detour = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === safeId);
      if (!detour) return;
      const targetDir = dir || activeDirMap[safeId] || defaultDetourDirection(detour.direction_mode) || "FORWARD";
      const nav = resolveDetourGoogleMapsNavigation(detour, targetDir, systemDataRef.current.floodRoutes || []);
      if (nav.url) {
        window.open(nav.url, "_blank", "noopener,noreferrer");
      } else if (nav.warning) {
        alert(nav.warning);
      }
    };

    (window as any).__toggleDetourPopupDir = (id: string, dir: "FORWARD" | "REVERSE") => {
      const routes = systemDataRef.current.detourRoutes || [];
      const route = routes.find((d) => String(d.id || "").replace(/[^a-zA-Z0-9_-]/g, "_") === id);
      if (!isDetourDirectionAllowed(route?.direction_mode, dir)) return;
      activeDirMap[id] = dir;
      const fwdBtn = document.getElementById(`detour-btn-fwd-${id}`);
      const revBtn = document.getElementById(`detour-btn-rev-${id}`);
      const fwdDesc = document.getElementById(`detour-desc-fwd-${id}`);
      const revDesc = document.getElementById(`detour-desc-rev-${id}`);
      const navSub = document.getElementById(`detour-nav-subtext-${id}`);
      if (!fwdBtn || !revBtn || !fwdDesc || !revDesc) return;

      const activeClasses =
        "min-h-[38px] py-1.5 px-2.5 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1 bg-[#f59e0b] text-slate-950 shadow-sm disabled:opacity-35 disabled:cursor-not-allowed";
      const inactiveClasses =
        "min-h-[38px] py-1.5 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 text-slate-300 hover:bg-slate-800/70 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed";

      if (dir === "FORWARD") {
        fwdBtn.className = activeClasses;
        revBtn.className = inactiveClasses;
        fwdBtn.setAttribute("aria-pressed", "true");
        revBtn.setAttribute("aria-pressed", "false");
        fwdDesc.classList.remove("hidden");
        fwdDesc.classList.add("block");
        revDesc.classList.remove("block");
        revDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขาไป A ➔ B)";
      } else {
        revBtn.className = activeClasses;
        fwdBtn.className = inactiveClasses;
        revBtn.setAttribute("aria-pressed", "true");
        fwdBtn.setAttribute("aria-pressed", "false");
        revDesc.classList.remove("hidden");
        revDesc.classList.add("block");
        fwdDesc.classList.remove("block");
        fwdDesc.classList.add("hidden");
        if (navSub) navSub.textContent = "(ขากลับ B ➔ A)";
      }
    };

    return () => {
      delete (window as any).__openFloodDossier;
      delete (window as any).__openFloodDetourDossier;
      delete (window as any).__focusFloodOnMap;
      delete (window as any).__toggleDetourPopupDir;
      delete (window as any).__openDetourModal;
      delete (window as any).__openDetourPointPhoto;
      delete (window as any).__openDetourGoogleMaps;
      delete (window as any).__getDetourCurrentDir;
    };
  }, []);
}

export interface UseLongdoRouteLayersParams {
  onActivateMapEntity?: (entity: { type: "FLOOD" | "DETOUR"; id: string }) => void;
  mapReady: boolean;
  systemData: SystemDataPayload;
  mapStyles: NonNullable<SystemDataPayload["mapStyles"]>;
  effectiveShowDetourLayer: boolean;
  effectiveShowFloodLayer: boolean;
  floodDisplayMode: "EVENTS" | "SEGMENTS";
  currentZoom: number;
  leafletRef: React.MutableRefObject<any>;
  rendererRef: React.MutableRefObject<any>;
  detourGroupRef: React.MutableRefObject<any>;
  floodGroupRef: React.MutableRefObject<any>;
  draftGroupRef: React.MutableRefObject<any>;
  detourLinesRef: React.MutableRefObject<Array<AnimatedLineEntry & { id: string; filterOpacity: number }>>;
  floodLinesRef: React.MutableRefObject<Record<string, FloodLineEntry & { baseOpacity: number; filterOpacity: number }>>;
  allowLineAnimationRef: React.MutableRefObject<boolean>;
  selectedFloodIdRef: React.MutableRefObject<string | null | undefined>;
}

/**
 * Manages drawing active Detour routes (forward, reverse, entrance photo markers)
 * and Flood routes (polylines + de-overlapped segment/event capsule markers).
 */
export function useLongdoRouteLayers({
  mapReady,
  systemData,
  mapStyles,
  effectiveShowDetourLayer,
  effectiveShowFloodLayer,
  floodDisplayMode,
  currentZoom,
  leafletRef,
  rendererRef,
  detourGroupRef,
  floodGroupRef,
  draftGroupRef,
  detourLinesRef,
  floodLinesRef,
  allowLineAnimationRef,
  selectedFloodIdRef,
  onActivateMapEntity,
}: UseLongdoRouteLayersParams) {
  const activationRef = React.useRef(onActivateMapEntity);
  activationRef.current = onActivateMapEntity;
  const detourPhotoMarkerRefs = React.useRef<Array<{ marker: any; point: "START" | "END"; hasPhoto: boolean }>>([]);
  // Segment capsule markers are retained across zoom changes. Replacing only
  // their icon preserves an open Leaflet popup instead of destroying its layer.
  const floodSegmentMarkerRefs = React.useRef<Array<{
    marker: any;
    item: FloodMarkerCandidate;
    color: string;
    waveIcon: string;
    waveBadge: string;
  }>>([]);

  const syncDetourPhotoMarker = (
    L: any,
    marker: any,
    point: "START" | "END",
    zoom: number,
    hasPhoto: boolean
  ) => {
    const visible = zoom >= 12;
    const variant = zoom >= 14 ? "FULL" : "COMPACT";
    // Leaflet binds DOM listeners while creating the icon. Set this before
    // setIcon so a marker revealed after zooming is clickable immediately.
    marker.options.interactive = visible;
    marker.setIcon(
      L.divIcon(
        hasPhoto
          ? buildDetourPhotoBadgeSpec(point, variant)
          : buildDetourFallbackPinSpec(point, variant)
      )
    );
    marker.setOpacity(visible ? 1 : 0);
    const element = marker.getElement?.();
    if (element) {
      element.style.display = visible ? "" : "none";
      element.style.pointerEvents = visible ? "" : "none";
    }
  };
  // 4c. Detour routes + bidirectional symbol & entrance photo markers
  useEffect(() => {
    const L = leafletRef.current;
    const group = detourGroupRef.current;
    detourLinesRef.current = [];
    detourPhotoMarkerRefs.current = [];
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowDetourLayer) return;
    const renderer = rendererRef.current;
    const detourStyle = mapStyles.detour;
    const dColor = detourStyle?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
    const dDash = dashArrayFor(detourStyle);
    const className = lineAnimationClasses(detourStyle, allowLineAnimationRef.current);

    (systemData.detourRoutes || []).forEach((detour) => {
      if (!detour.is_active) return;
      const dirMode = detour.direction_mode || "TWO_WAY";
      const fwdCoords = parseRouteCoordinates(detour.coordinates_json);
      const revCoords = parseRouteCoordinates(detour.reverse_coordinates_json);

      const defaultDir = resolveDetourDefaultDirection(detour, systemData);

      // Draw forward A->B line if mode is TWO_WAY or FORWARD_ONLY
      if (dirMode !== "REVERSE_ONLY" && fwdCoords.length >= 2) {
        const latLngs = fwdCoords.map(toLeafletLatLng);
        const forwardWeight = detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight;
        const casing = addLineCasing(L, group, latLngs, detourStyle || {}, forwardWeight, renderer);
        if (casing) {
          casing.__dohFilterId = detour.id;
          casing.__dohBaseOpacity = detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity;
        }
        const polyline = L.polyline(latLngs as any, {
          color: dColor,
          weight: forwardWeight,
          dashArray: dDash,
          opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
          className,
          renderer,
        }).addTo(group);
        polyline.__dohFilterId = detour.id;
        detourLinesRef.current.push({
          id: detour.id,
          line: polyline,
          baseWeight: detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight,
          baseOpacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
          filterOpacity: 1,
        });
        const detourPopupOpts = getResponsivePopupOptions(L, 440, 320, "doh-detour-leaflet-popup");
        polyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), detourPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          activationRef.current?.({ type: "DETOUR", id: detour.id });
          polyline.openPopup(e.latlng);
        });

        const midPoint = latLngs[Math.floor(latLngs.length / 2)];
        const detourIcon = L.divIcon(buildDetourSymbolIconSpec(dColor));
        const detourMarker = L.marker(midPoint, { icon: detourIcon, interactive: true })
          .bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), detourPopupOpts)
          .addTo(group);
        detourMarker.__dohFilterId = detour.id;
        detourMarker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          activationRef.current?.({ type: "DETOUR", id: detour.id });
          detourMarker.openPopup();
        });
      }

      // Draw reverse B->A line if present and distinct (or when REVERSE_ONLY)
      if (dirMode !== "FORWARD_ONLY") {
        const effectiveRev = revCoords.length >= 2 ? revCoords : dirMode === "REVERSE_ONLY" ? fwdCoords : [];
        if (effectiveRev.length >= 2) {
          const revLatLngs = effectiveRev.map(toLeafletLatLng);
          const revColor = dColor;
          const reverseWeight = detourStyle?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight;
          const casing = addLineCasing(L, group, revLatLngs, detourStyle || {}, reverseWeight, renderer);
          if (casing) {
            casing.__dohFilterId = detour.id;
            casing.__dohBaseOpacity = detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity;
          }
          const revPolyline = L.polyline(revLatLngs as any, {
            color: revColor,
            weight: reverseWeight,
            dashArray: dDash,
            opacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
            className,
            renderer,
          }).addTo(group);
          revPolyline.__dohFilterId = detour.id;
          detourLinesRef.current.push({
            id: detour.id,
            line: revPolyline,
            baseWeight: reverseWeight,
            baseOpacity: detourStyle?.opacity ?? LAYER_CONFIG.DETOUR_YELLOW_LINE.opacity,
            filterOpacity: 1,
          });
          const revPopupOpts = getResponsivePopupOptions(L, 440, 320, "doh-detour-leaflet-popup");
          revPolyline.bindPopup(() => buildDetourPopupHtml(detour, dColor, defaultDir, systemData), revPopupOpts);
          revPolyline.on("click", (e: any) => {
            activationRef.current?.({ type: "DETOUR", id: detour.id });
            L.DomEvent.stopPropagation(e);
            revPolyline.openPopup(e.latlng);
          });
        }
      }

      // Draw Start Point A & End Point B markers when photo or point-first metadata exists
      const startPhoto = detour.detour_meta?.start_point_photo;
      const endPhoto = detour.detour_meta?.end_point_photo;
      const { startLat, startLon, endLat, endLon } = resolveDetourPhotoPointCoords(detour, fwdCoords);
      const endpointEntries = [
        {
          point: "START" as const,
          photo: startPhoto,
          pin: resolveDetourPointPinCoord(startPhoto, startLat, startLon),
          photoTooltip: `📷 ภาพทางเข้าจุดเริ่มต้น A (${detour.route_name})`,
          fallbackTooltip: `📍 จุดเริ่มต้น A (${detour.route_name})`,
        },
        {
          point: "END" as const,
          photo: endPhoto,
          pin: resolveDetourPointPinCoord(endPhoto, endLat, endLon),
          photoTooltip: `📷 ภาพทางเข้าจุดสิ้นสุด B - ฝั่งขากลับ (${detour.route_name})`,
          fallbackTooltip: `📍 จุดสิ้นสุด B - ฝั่งขากลับ (${detour.route_name})`,
        },
      ];

      endpointEntries.forEach(({ point, photo, pin, photoTooltip, fallbackTooltip }) => {
        if (!hasDetourPointMetadata(photo)) return;
        if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lon)) return;
        const hasPhoto = Boolean(typeof photo?.url === "string" && photo.url.trim());
        const markerIcon = L.divIcon(
          hasPhoto ? buildDetourPhotoBadgeSpec(point) : buildDetourFallbackPinSpec(point)
        );
        const marker = L.marker([pin.lat, pin.lon], {
          icon: markerIcon,
          interactive: true,
          zIndexOffset: 200,
        })
          .bindTooltip(hasPhoto ? photoTooltip : fallbackTooltip, { direction: "top" })
          .bindPopup(
            () => buildDetourPointPhotoPopupHtml(detour, point, photo, pin.lat, pin.lon),
            getResponsivePopupOptions(L, 380, 280, "doh-detour-leaflet-popup")
          )
          .addTo(group);
        detourPhotoMarkerRefs.current.push({ marker, point, hasPhoto });
        syncDetourPhotoMarker(L, marker, point, currentZoom, hasPhoto);
        marker.__dohFilterId = detour.id;
        marker.on("click", (e: any) => {
          activationRef.current?.({ type: "DETOUR", id: detour.id });
          L.DomEvent.stopPropagation(e);
          marker.openPopup();
        });
      });
    });

    // Keep stacking order: highways (bottom) < detours < floods < drafts.
    raisePathLayers(group, floodGroupRef.current, draftGroupRef.current);
    return () => {
      detourLinesRef.current = [];
      detourPhotoMarkerRefs.current = [];
      group.clearLayers();
    };
  }, [mapReady, systemData.detourRoutes, effectiveShowDetourLayer, mapStyles]);

  // A/B photo markers reveal progressively without recreating detour layers or
  // their open popups: hidden at the default overview, compact at mid zoom,
  // then labelled A/B when the user is close enough to inspect the route.
  useEffect(() => {
    const L = leafletRef.current;
    if (!mapReady || !L) return;
    detourPhotoMarkerRefs.current.forEach(({ marker, point, hasPhoto }) => {
      syncDetourPhotoMarker(L, marker, point, currentZoom, hasPhoto);
    });
  }, [mapReady, currentZoom, leafletRef]);

  // 4d. Flood routes + capsule markers (Hide flood line when confirmed water_level_cm === 0 while preserving DB history).
  useEffect(() => {
    const L = leafletRef.current;
    const group = floodGroupRef.current;
    floodLinesRef.current = {};
    floodSegmentMarkerRefs.current = [];
    if (!mapReady || !L || !group) return;
    group.clearLayers();
    if (!effectiveShowFloodLayer) return;
    const renderer = rendererRef.current;
    const floodStyle = mapStyles.flood;
    const fColor = floodStyle?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
    const floodWaveIcon = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M2 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M2 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/></svg>`;
    const floodWaveBadge = `<span style="background:${escapeHtml(fColor)};color:white" class="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/70 shadow-sm" aria-hidden="true">${floodWaveIcon}</span>`;
    const fBaseWeight = floodStyle?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight;
    const fOpacity = floodStyle?.opacity ?? LAYER_CONFIG.FLOOD_RED_LINE.opacity;
    const fDash = dashArrayFor(floodStyle);
    const className = lineAnimationClasses(floodStyle, allowLineAnimationRef.current);

    const countDetoursForFlood = (flood: FloodRoute) => getLinkedDetoursForFlood(flood, systemData).length;
    const floodPopupOpts = getResponsivePopupOptions(L, 370, 300, "doh-flood-leaflet-popup");

    const visibleFloods = (systemData.floodRoutes || []).filter((flood) => isFloodLineVisibleOnCurrentMap(flood));

    // First draw polylines for all visible flood routes using configured unified line style
    visibleFloods.forEach((flood) => {
      const coords = parseRouteCoordinates(flood.coordinates_json);
      if (coords.length >= 2) {
        const selectedWeight = fBaseWeight + (flood.id === selectedFloodIdRef.current ? 1.5 : 0);
        const latLngs = coords.map(toLeafletLatLng);
        const casing = addLineCasing(L, group, latLngs, floodStyle || {}, selectedWeight, renderer);
        if (casing) {
          casing.__dohFilterId = flood.id;
          casing.__dohBaseOpacity = fOpacity;
        }
        const polyline = L.polyline(coords.map(toLeafletLatLng) as any, {
          color: fColor,
          weight: selectedWeight,
          opacity: fOpacity,
          dashArray: fDash,
          className,
          renderer,
        }).addTo(group);
        polyline.__dohFilterId = flood.id;
        floodLinesRef.current[flood.id] = {
          line: polyline,
          baseWeight: fBaseWeight,
          baseOpacity: fOpacity,
          filterOpacity: 1,
          casing,
          baseBorderWidth: Number(floodStyle?.borderWidth) || 0,
        };
        polyline.bindPopup(() => buildFloodPopupHtml(flood, countDetoursForFlood(flood)), floodPopupOpts);
        polyline.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          activationRef.current?.({ type: "FLOOD", id: flood.id });
          polyline.openPopup(e.latlng);
        });
      }
    });

    if (floodDisplayMode === "EVENTS") {
      // Merged parent event capsule markers
      const parentEvents = groupFloodRoutesIntoEvents(visibleFloods);
      parentEvents.forEach((ev) => {
        const { centerLat, centerLon } = computeFloodEventCenter(ev.segments);
        const evPresentation = getTrafficPresentation(ev.mostSevereStatus, ev.maxWaterLevelCm);
        const zIndexMap = { red: 1000, orange: 800, amber: 700, sky: 600, slate: 400, emerald: 200 } as const;
        const zIndex = zIndexMap[evPresentation.color];
        const capsuleClass = evPresentation.capsuleClass;

        const pinIcon = L.divIcon({
          html: `
            <div class="${capsuleClass}">
              ${floodWaveBadge}
              <span>ทล.${escapeHtml(ev.routeNo)} [${ev.segments.length} ช่วง]</span>
              <span class="opacity-90">(${escapeHtml(ev.maxWaterLevelCm)} ซม.)</span>
            </div>
          `,
          className: "doh-map-capsule-pin",
          iconSize: [140, 28],
          iconAnchor: [70, 14],
        });

        const primarySeg = ev.segments[0];
        const clusterAriaLabel = `ทล.${ev.routeNo} (${ev.segments.length} ช่วง) ระดับน้ำสูงสุด ${ev.maxWaterLevelCm} ซม. — ${evPresentation.label}`;
        const marker = L.marker([centerLat, centerLon], {
          icon: pinIcon,
          zIndexOffset: zIndex,
          alt: clusterAriaLabel,
          title: clusterAriaLabel,
        }).addTo(group);
        marker.__dohFilterIds = ev.segments.map((segment) => segment.id);
        marker.getElement()?.setAttribute("aria-label", clusterAriaLabel);
        marker.bindPopup(() => buildFloodPopupHtml(primarySeg, countDetoursForFlood(primarySeg)), floodPopupOpts);
        marker.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          activationRef.current?.({ type: "FLOOD", id: primarySeg.id });
          marker.openPopup();
        });
      });
    } else {
      // Individual segment markers with smart de-overlapping & priority z-index
      const candidates = buildFloodMarkerCandidates(visibleFloods);
      const clusters = clusterFloodMarkerCandidates(candidates);

      clusters.forEach((cluster) => {
        const count = cluster.length;
        cluster.forEach((item, idx) => {
          const [renderLat, renderLon] = computeDeoverlappedMarkerCoord(item, idx, count);
          const pinIcon = L.divIcon(
            buildZoomAdaptiveFloodPinSpec(item, currentZoom, fColor, floodWaveIcon, floodWaveBadge)
          );

          const markerAriaLabel = `ทล.${item.flood.route_no}${item.sideBadge} ${item.flood.section_name} กม.${item.flood.km_start} — ${item.statusLabel}`;
          const marker = L.marker([renderLat, renderLon], {
            icon: pinIcon,
            zIndexOffset: item.zIndex,
            alt: markerAriaLabel,
            title: markerAriaLabel,
          }).addTo(group);
          marker.__dohFilterId = item.flood.id;
          marker.getElement()?.setAttribute("aria-label", markerAriaLabel);
          floodSegmentMarkerRefs.current.push({
            marker,
            item,
            color: fColor,
            waveIcon: floodWaveIcon,
            waveBadge: floodWaveBadge,
          });

          marker.bindPopup(() => buildFloodPopupHtml(item.flood, countDetoursForFlood(item.flood)), floodPopupOpts);
          marker.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            activationRef.current?.({ type: "FLOOD", id: item.flood.id });
            marker.openPopup();
          });
        });
      });
    }

    raisePathLayers(group, draftGroupRef.current);
    return () => {
      group.clearLayers();
      floodLinesRef.current = {};
      floodSegmentMarkerRefs.current = [];
    };
  }, [mapReady, systemData.floodRoutes, systemData.detourRoutes, effectiveShowFloodLayer, floodDisplayMode, mapStyles]);

  // Zoom must never recreate flood layers: an open popup belongs to the marker,
  // so update only its responsive icon in-place.
  useEffect(() => {
    const L = leafletRef.current;
    if (!mapReady || !L || floodDisplayMode !== "SEGMENTS") return;

    floodSegmentMarkerRefs.current.forEach(({ marker, item, color, waveIcon, waveBadge }) => {
      marker.setIcon(
        L.divIcon(buildZoomAdaptiveFloodPinSpec(item, currentZoom, color, waveIcon, waveBadge))
      );
    });
  }, [mapReady, floodDisplayMode, currentZoom, leafletRef]);
}
