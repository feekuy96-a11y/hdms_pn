import type { LatLng, Map as LeafletMap, Polyline } from "leaflet";
import type { MapLineStyleItem } from "@/lib/constants";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";
import {
  isHighwayMotionLayer, routeIncidentMotionEffect, routeMotionChevronPath, routeMotionEffect, routeMotionEndpointPath, routeMotionPathData, routeMotionPeriod,
  routeMotionSpeedPercent, routeMotionTrailPositions, routeMotionTravelPeriod, routeRibbonOpacity, visibleMotionSegments,
  type MotionDirection, type RouteMotionLayer,
} from "@/lib/route-motion";

type Source = { line: Polyline; baseOpacity: number; filterOpacity: number; motionDirection?: MotionDirection; coordinates?: LatLng[] };
type Group = { sources: () => Iterable<Source>; style: MapLineStyleItem; name: RouteMotionLayer; minZoom?: number };
type Effect = ReturnType<typeof routeIncidentMotionEffect>;
type Overlay = { layer: Polyline; node: SVGPathElement };
type ActiveRoute = {
  effect: Effect; period: number; path: ReturnType<typeof visibleMotionSegments>;
  overlays: Overlay[]; staggered: boolean;
};
const MAX_VISIBLE_PER_LAYER = 24;
const HIGHWAY_MOTION_CAP_WIDE = 8;
const HIGHWAY_MOTION_CAP_NARROW = 4;

export function installRouteMotion(L: typeof import("leaflet"), map: LeafletMap, groups: Group[], allowMotion = true) {
  if (!groups.some(({ style, name }) => {
    const effect = routeIncidentMotionEffect(routeMotionEffect(style), name);
    return effect === "extent" || (allowMotion && effect !== "none");
  })) return;
  const renderer = L.svg();
  const active = new Map<Source, ActiveRoute>();
  let paused = false;
  let frame: number | undefined;
  let drawFrame: number | undefined;
  let origin = L.point(0, 0);
  let hasMotion = false;

  const clear = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    active.forEach(({ overlays }, source) => {
      overlays.forEach(({ layer }) => layer.remove());
      if (!overlays.length && map.hasLayer(source.line)) source.line.setStyle({ opacity: source.baseOpacity * source.filterOpacity });
    });
    active.clear();
    hasMotion = false;
  };

  const tick = (now: number) => {
    active.forEach(({ effect, period, path, overlays, staggered }, source) => {
      if (!map.hasLayer(source.line)) {
        overlays.forEach(({ layer }) => layer.remove());
        active.delete(source);
        return;
      }
      const phase = Number.isFinite(period) ? (now % period) / period : 0.25;
      const opacity = source.baseOpacity * source.filterOpacity;
      if (effect === "blink" || effect === "pulse") {
        const factor = effect === "blink" ? (phase < 0.5 ? 1 : 0.25) : (0.65 + 0.35 * (1 - Math.cos(phase * Math.PI * 2)) / 2);
        const emphasis = overlays[0]?.node;
        if (emphasis) {
          // Keep the base highway legible, and avoid per-frame redraws of the shared road canvas.
          const alpha = effect === "blink" ? (phase < 0.5 ? 0.45 : 0.08) : (factor - 0.65) * 1.2;
          emphasis.setAttribute("opacity", (opacity * alpha).toFixed(3));
        } else {
          source.line.setStyle({ opacity: opacity * factor });
        }
      } else if (effect === "ribbon") {
        const intensity = opacity * routeRibbonOpacity(phase);
        overlays[0].node.setAttribute("opacity", intensity.toFixed(3));
        overlays[1].node.setAttribute("opacity", Math.min(0.7, 0.23 + intensity).toFixed(3));
      } else if (effect === "extent") {
        overlays[0].node.setAttribute("opacity", (opacity * routeRibbonOpacity(phase) * 0.7).toFixed(3));
        overlays[1].node.setAttribute("opacity", (opacity * 0.72).toFixed(3));
        for (const { node } of overlays.slice(2)) node.setAttribute("opacity", Math.min(1, opacity * 1.18).toFixed(3));
      } else if (effect === "spotlight") {
        overlays[0].node.setAttribute("opacity", (opacity * routeRibbonOpacity(phase)).toFixed(3));
        overlays[1].node.setAttribute("opacity", (opacity * routeRibbonOpacity(phase + 0.5)).toFixed(3));
      } else if (effect === "chevrons") {
        const data = routeMotionChevronPath(path, phase, source.motionDirection ?? "forward", origin) || "M0 0";
        for (const { node } of overlays) {
          node.setAttribute("d", data);
          node.setAttribute("opacity", (opacity * 0.88).toFixed(3));
        }
      } else if (effect === "highlight") {
        const points = routeMotionTrailPositions(path.total, phase, source.motionDirection ?? "forward", staggered);
        const drawTrail = (halfWidth: number) => points
          .map((center) => routeMotionPathData(path, center - halfWidth, center + halfWidth, origin)).join("");
        overlays[0].node.setAttribute("d", drawTrail(16) || "M0 0");
        overlays[0].node.setAttribute("opacity", (opacity * 0.30).toFixed(3));
        overlays[1].node.setAttribute("d", drawTrail(8) || "M0 0");
        overlays[1].node.setAttribute("opacity", (opacity * 0.55).toFixed(3));
      }
    });
    frame = active.size && hasMotion ? window.requestAnimationFrame(tick) : undefined;
  };

  const draw = () => {
    drawFrame = undefined;
    clear();
    if (paused || document.hidden) return;
    const { x: width, y: height } = map.getSize();
    const bounds = map.getBounds();
    origin = map.containerPointToLayerPoint([0, 0]);
    for (const group of groups) {
      const { style, name } = group;
      if (group.minZoom !== undefined && map.getZoom() < group.minZoom) continue;
      const highway = isHighwayMotionLayer(name);
      const cap = highway ? (width < 640 ? HIGHWAY_MOTION_CAP_NARROW : HIGHWAY_MOTION_CAP_WIDE) : MAX_VISIBLE_PER_LAYER;
      const savedEffect = routeMotionEffect(style);
      const effect = routeIncidentMotionEffect(savedEffect, group.name);
      if (effect === "none" || (!allowMotion && effect !== "extent")) continue;
      const freeze = !allowMotion || routeMotionSpeedPercent(style.animationSpeed) === 0;
      if (freeze && effect !== "ribbon" && effect !== "spotlight" && effect !== "extent") continue;
      let drawn = 0;
      for (const source of group.sources()) {
        if (drawn >= cap) break;
        if (!source.filterOpacity || !source.baseOpacity || !map.hasLayer(source.line) || !source.line.getBounds().intersects(bounds)) continue;
        const latLngs = source.coordinates ?? source.line.getLatLngs();
        if (!latLngs.length || Array.isArray(latLngs[0])) continue;
        const projected = (latLngs as LatLng[]).map((latLng) => map.latLngToContainerPoint(latLng));
        const path = visibleMotionSegments(L.LineUtil.simplify(projected, 0.65), width, height);
        const endpointPath = effect === "extent" ? routeMotionEndpointPath(projected, width, height, origin) : "";
        if (path.total < 8 && !endpointPath) continue;
        const overlays: Overlay[] = [];
        const highwayEmphasis = highway && (effect === "pulse" || effect === "blink");
        if (highwayEmphasis || effect === "ribbon" || effect === "highlight" || effect === "spotlight" || effect === "chevrons" || effect === "extent") {
          const weight = Math.max(2, Math.min(10, style.weight || 5));
          const options = highwayEmphasis
            ? [{ color: resolveVisibleArrowColor(style.color, style.arrowColor || "#ffffff"), weight: 2 }]
            : effect === "extent"
            ? [{ color: style.glow ? style.glowColor || style.color : style.color, weight: weight + 9 },
              { color: "#e8f6fc", weight: 1.3 },
              ...(endpointPath ? [{ color: "#0e2230", weight: 5 }, { color: "#edfbff", weight: 2.25 }] : [])]
            : effect === "ribbon"
            ? [{ color: style.glow ? style.glowColor || style.color : style.color, weight: weight + 5 },
              { color: "#e9f8ff", weight: 1.15, dashArray: "2 7" }]
            : effect === "spotlight"
              ? Array.from({ length: 2 }, () => ({ color: style.glowColor || style.color, weight: weight + 7 }))
              : effect === "chevrons"
                ? [{ color: style.color, weight: 3.3 }, { color: resolveVisibleArrowColor(style.color, style.arrowColor || "#fff3d3"), weight: 1.55 }]
                : [{ color: "#ffd99e", weight: 3.2 }, { color: "#fff3d3", weight: 1.7 }];
          for (const [index, stroke] of options.entries()) {
            const extentEndpoint = effect === "extent" && index >= 2;
            const role = extentEndpoint ? (index === 2 ? "endpoint-outline" : "endpoint") : (index === 0 ? "halo" : "core");
            const layer = L.polyline([], { ...stroke, renderer, interactive: false,
              className: `doh-route-motion-${group.name} doh-motion-${effect}-${role}`,
              opacity: 1,
            }).addTo(map);
            const node = layer.getElement();
            if (!(node instanceof SVGPathElement)) { layer.remove(); continue; }
            if (extentEndpoint) node.setAttribute("d", endpointPath);
            else if (highwayEmphasis || effect === "extent" || effect === "ribbon") node.setAttribute("d", routeMotionPathData(path, 0, path.total, origin));
            if (effect === "spotlight") {
              const center = path.total * (index === 0 ? 0.34 : 0.68);
              const half = Math.min(14, path.total * 0.12);
              node.setAttribute("d", routeMotionPathData(path, center - half, center + half, origin));
            }
            node.setAttribute("opacity", "0");
            node.setAttribute("aria-hidden", "true");
            overlays.push({ layer, node });
          }
          if (overlays.length !== options.length) { overlays.forEach(({ layer }) => layer.remove()); continue; }
        }
        const period = freeze ? Infinity
          : effect === "highlight" || effect === "chevrons" ? routeMotionTravelPeriod(path.total, style.animationSpeed, effect === "chevrons" ? 0 : 32)
          : effect === "ribbon" || effect === "spotlight" || effect === "extent" ? routeMotionPeriod("wave", style.animationSpeed) * 2.25
          : routeMotionPeriod(savedEffect, style.animationSpeed);
        active.set(source, { effect, period, path, overlays, staggered: savedEffect === "flow" });
        hasMotion ||= Number.isFinite(period);
        drawn++;
      }
    }
    if (active.size) frame = window.requestAnimationFrame(tick);
  };

  const schedule = () => {
    if (drawFrame === undefined) drawFrame = window.requestAnimationFrame(draw);
  };
  const onStart = () => { paused = true; clear(); };
  const onEnd = () => { paused = false; schedule(); };
  const onVisibility = () => { clear(); if (!document.hidden) schedule(); };
  map.on("movestart zoomstart", onStart);
  map.on("moveend zoomend resize", onEnd);
  document.addEventListener("visibilitychange", onVisibility);
  schedule();
  return () => {
    if (drawFrame !== undefined) window.cancelAnimationFrame(drawFrame);
    map.off("movestart zoomstart", onStart);
    map.off("moveend zoomend resize", onEnd);
    document.removeEventListener("visibilitychange", onVisibility);
    clear();
    if (map.hasLayer(renderer)) renderer.remove();
  };
}
