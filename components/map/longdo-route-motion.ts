import type { LatLng, Map as LeafletMap, Polyline } from "leaflet";
import type { MapLineStyleItem } from "@/lib/constants";
import { motionGlyph, routeMotionEffect, routeMotionPeriod, visibleMotionSegments } from "@/lib/route-motion";
import { resolveVisibleArrowColor } from "@/lib/map-style-utils";

type Source = { line: Polyline; baseOpacity: number; filterOpacity: number };
type Group = { sources: () => Source[]; style: MapLineStyleItem; name: "flood" | "detour" };
const MAX_VISIBLE_PER_LAYER = 24;
const FRAME_MS = 100;

export function installRouteMotion(L: typeof import("leaflet"), map: LeafletMap, groups: Group[]) {
  if (!groups.some((group) => routeMotionEffect(group.style) !== "none")) return;
  const renderer = L.svg();
  const start = performance.now();
  const active = new Map<Source, {
    group: Group;
    path: ReturnType<typeof visibleMotionSegments> | null;
    overlay?: Polyline;
  }>();
  let paused = false;
  let timer: number | undefined;

  const clear = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    active.forEach(({ overlay }, source) => {
      overlay?.remove();
      if (map.hasLayer(source.line)) source.line.setStyle({ opacity: source.baseOpacity * source.filterOpacity });
    });
    active.clear();
  };

  const tick = () => {
    const now = performance.now() - start;
    active.forEach(({ group, path, overlay }, source) => {
      if (!map.hasLayer(source.line)) { overlay?.remove(); active.delete(source); return; }
      const { style } = group;
      const effect = routeMotionEffect(style);
      const period = routeMotionPeriod(effect, style.animationSpeed);
      const phase = (now % period) / period;
      const opacity = source.baseOpacity * source.filterOpacity;
      if (effect === "blink" || effect === "pulse") {
        const factor = effect === "blink" ? (phase < 0.5 ? 1 : 0.25) : (0.65 + 0.35 * (1 - Math.cos(phase * Math.PI * 2)) / 2);
        source.line.setStyle({ opacity: opacity * factor });
      } else if (overlay && path && effect !== "none") {
        if (!opacity) { overlay.setStyle({ opacity: 0 }); return; }
        const phases = effect === "flow" && path.total > 60 ? [phase, (phase + 0.5) % 1] : [phase];
        const size = Math.min(18, Math.max(6, style.arrowSize || 12));
        overlay.setLatLngs(phases.map((position) => motionGlyph(path, position, size, effect).map((point) => map.containerPointToLatLng(point))));
        overlay.setStyle({ opacity });
      }
    });
  };

  const draw = () => {
    clear();
    if (paused) return;
    const { x: width, y: height } = map.getSize();
    const bounds = map.getBounds();
    for (const group of groups) {
      const effect = routeMotionEffect(group.style);
      if (effect === "none") continue;
      let drawn = 0;
      for (const source of group.sources()) {
        if (drawn >= MAX_VISIBLE_PER_LAYER) break;
        if (!source.filterOpacity || !source.baseOpacity || !map.hasLayer(source.line) || !source.line.getBounds().intersects(bounds)) continue;
        const latLngs = source.line.getLatLngs();
        if (!latLngs.length || Array.isArray(latLngs[0])) continue;
        const path = visibleMotionSegments((latLngs as LatLng[]).map((latLng) => map.latLngToContainerPoint(latLng)), width, height);
        if (path.total < 8) continue;
        const moving = effect !== "blink" && effect !== "pulse";
        const style = group.style;
        const overlay = moving ? L.polyline([], {
          renderer,
          interactive: false,
          className: `doh-route-motion-${group.name}`,
          color: resolveVisibleArrowColor(style.color, style.arrowColor || "#ffffff"),
          weight: effect === "chaser" ? Math.max(2, style.weight / 2) : 2.5,
          opacity: 0,
        }).addTo(map) : undefined;
        active.set(source, { group, path: moving ? path : null, overlay });
        drawn++;
      }
    }
    if (active.size) {
      tick();
      timer = window.setInterval(tick, FRAME_MS);
    }
  };
  const onStart = () => { paused = true; clear(); };
  const onEnd = () => { paused = false; draw(); };
  map.on("movestart zoomstart", onStart);
  map.on("moveend zoomend resize", onEnd);
  // Let the filtering effect update route opacity before choosing the visible paths.
  const first = window.requestAnimationFrame(draw);
  return () => {
    window.cancelAnimationFrame(first);
    map.off("movestart zoomstart", onStart);
    map.off("moveend zoomend resize", onEnd);
    clear();
    if (map.hasLayer(renderer)) renderer.remove();
  };
}
