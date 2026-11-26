"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { MapLineStyleItem } from "@/lib/constants";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
import { isHighwayMotionLayer, type RouteMotionLayer } from "@/lib/route-motion";
import { addLineCasing, dashArrayFor } from "./longdo-map-popups";
import { placeArrowsOnLine, usesCompactDetourArrows } from "./longdo-arrow-layer";
import { installRouteMotion } from "./longdo-route-motion";

// Use the actual map painter on an isolated, tile-free viewport. There is no
// scaled SVG preview, second animation clock, or separate set of glyph shapes.
export function RouteMotionPreview({ style, layer }: {
  style: MapLineStyleItem;
  layer: RouteMotionLayer;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const [leaflet, setLeaflet] = useState<typeof Leaflet>();
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => { if (!disposed) setLeaflet(L); });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowMotion(!preference.matches && !document.hidden);
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      disposed = true;
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    const L = leaflet;
    const root = rootRef.current;
    if (!L || !root) return;
    const map = L.map(root, {
      crs: L.CRS.Simple, zoomControl: false, attributionControl: false,
      zoomAnimation: false, dragging: false, doubleClickZoom: false,
      scrollWheelZoom: false, boxZoom: false, keyboard: false, touchZoom: false,
    }).setView([0, 0], 12);
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [leaflet]);

  useEffect(() => {
    const L = leaflet;
    const root = rootRef.current;
    const map = mapRef.current;
    if (!L || !root || !map) return;
    const canvas = L.canvas();
    const groups = L.layerGroup().addTo(map);
    let stopMotion: (() => void) | undefined;

    const render = () => {
      stopMotion?.();
      stopMotion = undefined;
      groups.clearLayers();
      map.invalidateSize({ animate: false, pan: false });
      const { x: width, y: height } = map.getSize();
      if (width < 32 || height < 20) return;
      const margin = Math.min(26, width / 8);
      const latLngs = Array.from({ length: 33 }, (_, i) => {
        const x = i / 32;
        return map.containerPointToLatLng([margin + (width - 2 * margin) * x, height / 2 - Math.sin(x * Math.PI * 2) * Math.min(13, height / 5)]);
      });
      const weight = style.weight || 5;
      const opacity = style.opacity ?? 0.9;
      addLineCasing(L, groups, latLngs.map(({ lat, lng }) => [lat, lng]), style, weight, canvas);
      const line = L.polyline(latLngs, {
        color: style.color, weight, opacity, renderer: canvas, dashArray: dashArrayFor(style), interactive: false,
      }).addTo(groups);
      if (layer === "detour" && (style.showArrows ?? true) && map.getZoom() >= (style.arrowMinZoom ?? 11)) {
        placeArrowsOnLine(L, map, groups, latLngs.map(({ lat, lng }) => [lng, lat]), "FORWARD",
          resolveVisibleArrowColor(style.color, style.arrowColor || "#0f172a"), style.arrowSize || 12,
          style.arrowSpacingPx || 120, style.color, map.getBounds(), { count: 0 },
          usesCompactDetourArrows(style.animation));
      }
      stopMotion = installRouteMotion(L, map, [{ name: layer, style,
        sources: () => [{ line, baseOpacity: opacity, filterOpacity: 1, motionDirection: isHighwayMotionLayer(layer) ? "both" : "forward" }],
      }], allowMotion);
    };
    render();
    const resize = new ResizeObserver(render);
    resize.observe(root);
    return () => {
      resize.disconnect();
      stopMotion?.();
      if (map.hasLayer(groups)) groups.remove();
      if (map.hasLayer(canvas)) canvas.remove();
    };
  }, [allowMotion, leaflet, layer, style]);

  return <div ref={rootRef} className="doh-route-motion-preview pointer-events-none absolute inset-0" style={{ background: "transparent" }} aria-hidden="true" />;
}
