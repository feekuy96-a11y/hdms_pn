import type { MapLineStyleItem } from "./constants";

type Effect = MapLineStyleItem["animation"];
type Layer = "flood" | "detour";
type XY = { x: number; y: number };

export function routeMotionEffect(style?: MapLineStyleItem): Effect {
  return style?.animationEnabled === false ? "none" : style?.animation ?? "none";
}

export function routeMotionToggle(style: MapLineStyleItem, layer: Layer, enabled: boolean): Partial<MapLineStyleItem> {
  return {
    animationEnabled: enabled,
    animation: enabled && style.animation === "none" ? (layer === "flood" ? "wave" : "flow") : style.animation,
  };
}

export function routeMotionPeriod(effect: Effect, speed?: MapLineStyleItem["animationSpeed"]): number {
  const period = effect === "blink" ? 1000 : effect === "pulse" || effect === "wave" ? 2000 : 1800;
  return period * (speed === "slow" ? 1.75 : speed === "fast" ? 0.5 : 1);
}

// Clip each segment independently so disconnected visible spans never get joined.
export function visibleMotionSegments(points: readonly XY[], width: number, height: number) {
  const segments: { a: XY; dx: number; dy: number; length: number; end: number }[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let min = 0;
    let max = 1;
    for (const [d, distance] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]]) {
      if (d === 0) {
        if (distance < 0) { min = 1; max = 0; break; }
      } else if (d < 0) min = Math.max(min, distance / d);
      else max = Math.min(max, distance / d);
    }
    if (min >= max) continue;
    const length = Math.hypot(dx, dy) * (max - min);
    if (length === 0) continue;
    total += length;
    segments.push({ a: { x: a.x + dx * min, y: a.y + dy * min }, dx: dx * (max - min), dy: dy * (max - min), length, end: total });
  }
  return { segments, total };
}

export function motionGlyph(path: ReturnType<typeof visibleMotionSegments>, phase: number, size: number, effect: "chaser" | "arrows" | "wave" | "flow"): [number, number][] {
  const distance = phase * path.total;
  let low = 0;
  let high = path.segments.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (distance < path.segments[mid].end) high = mid;
    else low = mid + 1;
  }
  const segment = path.segments[low];
  if (!segment) return [];
  const u = (distance - (segment.end - segment.length)) / segment.length;
  const { x, y } = { x: segment.a.x + u * segment.dx, y: segment.a.y + u * segment.dy };
  const vx = segment.dx / segment.length * size;
  const vy = segment.dy / segment.length * size;
  if (effect === "wave") {
    return Array.from({ length: 13 }, (_, i): [number, number] => {
      const t = i / 12;
      const amplitude = Math.sin(t * Math.PI * 2) * 0.38;
      return [x + (t - 0.5) * vx * 2 - vy * amplitude, y + (t - 0.5) * vy * 2 + vx * amplitude];
    });
  }
  return effect === "arrows" || effect === "flow"
    ? [[x - vx - vy / 2, y - vy + vx / 2], [x, y], [x - vx + vy / 2, y - vy - vx / 2]]
    : [[x - vx, y - vy], [x + vx / 2, y + vy / 2]];
}
