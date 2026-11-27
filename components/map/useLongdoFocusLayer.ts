"use client";

import { useEffect, type RefObject } from "react";
import type { LayerGroup, Map as LeafletMap, Renderer } from "leaflet";
import type { DetourRoute, SystemDataPayload } from "@/db/default-data";
import { LAYER_CONFIG } from "@/lib/constants";
import { isDetourDirectionAllowed } from "@/lib/detour-presentation";
import { collectFocusBoundsPoints, resolveDetourFocusGeometry, resolveFloodFocusData, type GisFocusDirection, type GisFocusState } from "@/lib/gis-focus-mode";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
import { getTrafficPresentation } from "@/lib/traffic-presentation";
import { placeArrowsOnLine } from "./longdo-arrow-layer";
import { drawFloodStatusAccent } from "./longdo-flood-status-accent";
import { buildDetourPhotoBadgeSpec, resolveDetourPhotoPointCoords } from "./longdo-layer-builders";
import {
  bindPublicEndpointInspector,
  bindSharedMapPopup,
  buildDetourFallbackPinSpec,
  buildMapDetourEndpointPopup,
  dashArrayFor,
  escapeHtml,
  getPublicDetourEndpointLabel,
  labelPublicDetourEndpointMarker,
  parseRouteCoordinates,
  raisePathLayers,
  toLeafletLatLng,
} from "./longdo-map-popups";
import { resolveMapDetourDash } from "./useLongdoRouteLayers";

interface FocusLayerOptions {
  mapReady: boolean;
  gisFocus?: GisFocusState | null;
  systemData: SystemDataPayload;
  mapStyles: NonNullable<SystemDataPayload["mapStyles"]>;
  publicMode: boolean;
  leafletRef: RefObject<typeof import("leaflet") | null>;
  leafletMapRef: RefObject<LeafletMap | null>;
  focusGroupRef: RefObject<LayerGroup | null>;
  rendererRef: RefObject<Renderer | undefined | null>;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  isProgrammaticMoveRef: RefObject<boolean>;
  userInteractedDuringFocusRef: RefObject<boolean>;
  lastFittedRequestIdRef: RefObject<number>;
  onFocusDetourOnMapRef: RefObject<((detourId: string, direction: GisFocusDirection) => void) | undefined>;
}

export function useLongdoFocusLayer({
  mapReady, gisFocus, systemData, mapStyles, publicMode, leafletRef, leafletMapRef, focusGroupRef, rendererRef,
  mapContainerRef, isProgrammaticMoveRef, userInteractedDuringFocusRef, lastFittedRequestIdRef, onFocusDetourOnMapRef,
}: FocusLayerOptions) {
  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const group = focusGroupRef.current;
    if (!mapReady || !L || !map || !group) return;

    group.clearLayers();
    if (!gisFocus || gisFocus.status !== "focused" || !gisFocus.targetType || !gisFocus.targetId) {
      userInteractedDuringFocusRef.current = false;
      return;
    }

    const renderer = rendererRef.current ?? undefined;
    const allPolylines: [number, number][][] = [];
    const allPoints: ([number, number] | null)[] = [];
    const requestedEndpoint: { marker?: ReturnType<typeof L.marker> } = {};
    const shouldOpenDirectionEndpoint = publicMode && gisFocus.openDirectionEndpoint &&
      gisFocus.fitRequestId !== lastFittedRequestIdRef.current;

    const drawDetourFocusOverlay = (
      detour: DetourRoute,
      direction: "FORWARD" | "REVERSE",
      isPrimary: boolean
    ) => {
      const geom = resolveDetourFocusGeometry(detour, direction);
      const style = mapStyles.detour;
      const color = style?.color || LAYER_CONFIG.DETOUR_YELLOW_LINE.color;
      const weight = (style?.weight || LAYER_CONFIG.DETOUR_YELLOW_LINE.weight) + (isPrimary ? 1.5 : 0);
      const borderColor = style?.borderActive ? style.borderColor || "#ffffff" : "#091326";
      const borderWidth = style?.borderActive ? Math.max(1, Number(style.borderWidth) || 1) : 2;
      const arrowColor = resolveVisibleArrowColor(color, style?.arrowColor || "#0f172a");

      if (geom.coords.length >= 2) {
        const latLngs = geom.coords.map(toLeafletLatLng);
        L.polyline(latLngs, {
          renderer,
          color: borderColor,
          weight: weight + borderWidth * 2,
          opacity: style?.opacity ?? 0.95,
        }).addTo(group);
        const line = L.polyline(latLngs, {
          renderer,
          color,
          weight,
          opacity: style?.opacity ?? 0.95,
          dashArray: isPrimary ? resolveMapDetourDash(style) : "10, 6",
        }).addTo(group);
        raisePathLayers(line);
        allPolylines.push(geom.coords);

        const viewport = map.getBounds().pad(0.6);
        placeArrowsOnLine(
          L,
          map,
          group,
          geom.coords,
          "FORWARD",
          arrowColor,
          style?.arrowSize || 14,
          style?.arrowSpacingPx || 96,
          color,
          viewport,
          { count: 0 }
        );
      } else if (geom.startCoord) {
        allPoints.push(geom.startCoord);
      }

      // Keep the A/B markers on their saved point coordinates (falling back to canonical
      // detour endpoints), regardless of travel direction, and keep Popups interactive
      // even when a point does not have a photo attached yet.
      const photoPoints = resolveDetourPhotoPointCoords(
        detour,
        parseRouteCoordinates(detour.coordinates_json)
      );
      const startPhoto = detour.detour_meta?.start_point_photo;
      const endPhoto = detour.detour_meta?.end_point_photo;
      const startPin = photoPoints.start;
      const endPin = photoPoints.end;
      const endpoints = [
        { point: "START" as const, lat: startPin.lat, lon: startPin.lon, photo: startPhoto },
        { point: "END" as const, lat: endPin.lat, lon: endPin.lon, photo: endPhoto },
      ];

      const validEndpoints = endpoints.filter(({ lat, lon }) =>
        Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)
      );
      const markers = new Map<"START" | "END", ReturnType<typeof L.marker>>();
      validEndpoints.forEach(({ point, lat, lon, photo }) => {
        const hasPhoto = Boolean(typeof photo?.url === "string" && photo.url.trim());
        const marker = L.marker([lat, lon], {
          interactive: true,
          zIndexOffset: 900,
          icon: L.divIcon(
            hasPhoto
              ? buildDetourPhotoBadgeSpec(point, "FULL", true)
              : buildDetourFallbackPinSpec(point, "FULL", true)
          ),
        }).addTo(group);
        markers.set(point, marker);
        if (shouldOpenDirectionEndpoint && isDetourDirectionAllowed(detour.direction_mode, direction) &&
            point === (direction === "FORWARD" ? "START" : "END")) requestedEndpoint.marker = marker;
        allPoints.push([lon, lat]);
        bindSharedMapPopup(L, map, marker, "focused-endpoint", publicMode, () =>
          buildMapDetourEndpointPopup(detour, point, photo, direction, systemData.floodRoutes || [], { lat, lon }, publicMode)
        );
        if (publicMode) {
          labelPublicDetourEndpointMarker(marker, getPublicDetourEndpointLabel(detour, point, direction));
          bindPublicEndpointInspector(L, map, marker, markers, point, () => {
            const focusOnMap = onFocusDetourOnMapRef.current;
            if (focusOnMap && (!isPrimary || gisFocus.targetType !== "DETOUR")) focusOnMap(detour.id, direction);
            else marker.getElement()?.focus({ preventScroll: true });
          }, true);
        }
        marker.on("click", (event: any) => {
          L.DomEvent.stopPropagation(event);
          marker.openPopup();
        });
      });
    };

    if (gisFocus.targetType === "DETOUR") {
      const detour = (systemData.detourRoutes || []).find((d) => d.id === gisFocus.targetId);
      if (detour) {
        drawDetourFocusOverlay(detour, gisFocus.direction, true);
        // Show linked flood impact warning marker if an active flood affects this detour
        const linkedFlood = (systemData.floodRoutes || []).find(
          (f) => f.id === detour.flood_id_ref && f.is_active !== false && f.water_level_cm > 0
        );
        if (linkedFlood && Number.isFinite(linkedFlood.lon_start) && Number.isFinite(linkedFlood.lat_start)) {
          const status = getTrafficPresentation(linkedFlood.traffic_status);
          L.marker([linkedFlood.lat_start, linkedFlood.lon_start], {
            interactive: false,
            zIndexOffset: 850,
            icon: L.divIcon({
              className: "hdms-focus-warning",
              html: `<div style="transform:translate(-50%,-50%)" class="rounded-lg border border-rose-400 bg-rose-950/95 px-2 py-0.5 text-[10px] font-bold text-rose-200 shadow-lg whitespace-nowrap">⚠️ ทล.${escapeHtml(linkedFlood.route_no)} ${escapeHtml(status.label)}</div>`,
              iconSize: [0, 0],
            }),
          }).addTo(group);
        }
      }
    } else if (gisFocus.targetType === "FLOOD") {
      const floodData = resolveFloodFocusData(gisFocus.targetId, systemData);
      if (floodData.primaryFlood && !floodData.isResolved) {
        // Draw all active segments (including LT/RT siblings) exempt from zoom-dependent hiding
        const style = mapStyles.flood;
        const borderColor = style?.borderActive ? style.borderColor || "#ffffff" : "#091326";
        const borderWidth = style?.borderActive ? Math.max(1, Number(style.borderWidth) || 1) : 2;
        const weight = (style?.weight || LAYER_CONFIG.FLOOD_RED_LINE.weight) + 0.5;
        const color = style?.color || LAYER_CONFIG.FLOOD_RED_LINE.color;
        floodData.activeSegments.forEach((seg) => {
          const segCoords = (floodData.coordsList.find((_, idx) => floodData.activeSegments[idx]?.id === seg.id)) || [];
          if (segCoords.length >= 2) {
            const latLngs = segCoords.map(toLeafletLatLng);
            L.polyline(latLngs, {
              renderer,
              color: borderColor,
              weight: weight + borderWidth * 2,
              opacity: style?.opacity ?? 0.95,
            }).addTo(group);
            const line = L.polyline(latLngs, {
              renderer,
              color,
              weight,
              opacity: style?.opacity ?? 0.95,
              dashArray: dashArrayFor(style),
            }).addTo(group);
            raisePathLayers(line);
            drawFloodStatusAccent(L, group, latLngs, renderer, seg, weight, style?.opacity ?? 0.95);
            allPolylines.push(segCoords);
          } else if (Number.isFinite(seg.lon_start) && Number.isFinite(seg.lat_start)) {
            allPoints.push([seg.lon_start, seg.lat_start]);
            L.circleMarker([seg.lat_start, seg.lon_start], {
              renderer,
              radius: 10,
              color: borderColor,
              weight: borderWidth,
              fillColor: getTrafficPresentation(seg.traffic_status, seg.water_level_cm, seg.direction_meta?.trafficStatusDetail).hex,
              fillOpacity: style?.opacity ?? 0.95,
            }).addTo(group);
          }
        });
      } else if (floodData.primaryFlood && floodData.isResolved) {
        // Resolved / 0 cm flood: do NOT draw as an active impacted flood line; keep neutral location point only for bounds
        floodData.pointFallbacks.forEach((pt) => allPoints.push(pt));
        floodData.coordsList.forEach((line) => allPolylines.push(line));
      }

      if (gisFocus.showLinkedDetour && floodData.linkedDetours.length > 0) {
        const linked =
          floodData.linkedDetours.find((d) => d.id === gisFocus.linkedDetourId) ??
          floodData.linkedDetours[0];
        if (linked) {
          drawDetourFocusOverlay(linked, gisFocus.direction, false);
        }
      }
    }

    // Fit bounds only on explicit fit requests (not on live data refresh after user pan/zoom)
    const shouldFit =
      gisFocus.fitRequestId !== lastFittedRequestIdRef.current ||
      !userInteractedDuringFocusRef.current;

    if (shouldFit && gisFocus.fitRequestId !== lastFittedRequestIdRef.current) {
      lastFittedRequestIdRef.current = gisFocus.fitRequestId;
      userInteractedDuringFocusRef.current = false;
      map.closePopup();

      const boundsPoints = collectFocusBoundsPoints(allPolylines, allPoints);
      const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 640;
      const mapEl = mapContainerRef.current;
      const mapRect = mapEl?.getBoundingClientRect();
      const focusBarRect = document
        .querySelector('[data-testid="gis-focus-mode-bar"]')
        ?.getBoundingClientRect();

      const leftPadding = isMobileViewport ? 58 : 24;
      const rightPadding = isMobileViewport ? 44 : 24;
      let topPadding = isMobileViewport ? 108 : 132;
      let bottomPadding = isMobileViewport ? 240 : 40;
      if (mapRect && focusBarRect && mapRect.height > 0) {
        const barCenterY = focusBarRect.top + focusBarRect.height / 2;
        const mapCenterY = mapRect.top + mapRect.height / 2;
        if (isMobileViewport && barCenterY > mapCenterY) {
          // Photo A/B markers have a visible 30px footprint, unlike the
          // former zero-size endpoint labels. Keep their full icon clear of
          // the Focus Bar rather than fitting only their coordinate center.
          const neededBottom = Math.ceil(mapRect.bottom - focusBarRect.top) + 48;
          const minimumVisibleRouteHeight = publicMode ? 64 : 96;
          if (publicMode) {
            // Reserve only the compact summary's height when an expanded focus bar or test banner makes the visible map short.
            topPadding = Math.min(topPadding, Math.max(58, Math.floor(mapRect.height - neededBottom - minimumVisibleRouteHeight)));
          }
          bottomPadding = Math.min(Math.max(120, neededBottom), Math.max(120, mapRect.height - topPadding - minimumVisibleRouteHeight));
        } else if (!isMobileViewport && barCenterY < mapCenterY) {
          const neededTop = Math.ceil(focusBarRect.bottom - mapRect.top) + 48;
          topPadding = Math.min(Math.max(132, neededTop), Math.max(132, mapRect.height - bottomPadding - 120));
        }
      }
      if (boundsPoints.length >= 2) {
        isProgrammaticMoveRef.current = true;
        map.stop();
        map.fitBounds(L.latLngBounds(boundsPoints.map(toLeafletLatLng)), {
          paddingTopLeft: [leftPadding, topPadding],
          paddingBottomRight: [rightPadding, bottomPadding],
          maxZoom: 15,
          animate: !requestedEndpoint.marker,
        });
        window.setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 400);
      } else if (boundsPoints.length === 1) {
        isProgrammaticMoveRef.current = true;
        map.stop();
        const targetZoom = 14;
        const targetLatLng = toLeafletLatLng(boundsPoints[0]);
        const offsetY = Math.round((bottomPadding - topPadding) / 2);
        const targetCenter =
          offsetY !== 0 && typeof map.project === "function" && typeof map.unproject === "function"
            ? map.unproject(map.project(targetLatLng, targetZoom).add([0, offsetY]), targetZoom)
            : targetLatLng;
        map.setView(targetCenter, targetZoom, { animate: !requestedEndpoint.marker });
        window.setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 400);
      }
      // This runs once for an explicit direction press, never on a data refresh.
      requestedEndpoint.marker?.openPopup();
    }

    return () => {
      group.clearLayers();
    };
  }, [mapReady, gisFocus, systemData, mapStyles, publicMode, rendererRef, leafletRef, leafletMapRef, focusGroupRef, userInteractedDuringFocusRef, lastFittedRequestIdRef, onFocusDetourOnMapRef, mapContainerRef, isProgrammaticMoveRef]);
}
