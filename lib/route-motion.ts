import type { MapLineStyleItem } from "./constants";

type Effect = MapLineStyleItem["animation"];
export type RouteMotionLayer = "flood" | "detour" | "primary" | "secondary";
export const HIGHWAY_MOTION_MIN_ZOOM = 11;

export function isHighwayMotionLayer(layer: RouteMotionLayer) {
  return layer === "primary" || layer === "secondary";
}
type XY = { x: number; y: number };

export function routeMotionEffect(style?: MapLineStyleItem): Effect {
  return style?.animationEnabled === false ? "none" : style?.animation ?? "none";
}

export function routeMotionToggle(style: MapLineStyleItem, layer: RouteMotionLayer, enabled: boolean): Partial<MapLineStyleItem> {
  return {
    animationEnabled: enabled,
    animation: enabled && style.animation === "none" ? (layer === "flood" ? "wave" : layer === "detour" ? "flow" : "pulse") : style.animation,
  };
}

export function routeMotionSpeedPercent(speed: unknown): number {
  if (typeof speed === "number" && Number.isFinite(speed)) return Math.max(0, Math.min(100, Math.round(speed)));
  return speed === "slow" ? 25 : speed === "fast" ? 100 : 60;
}

function routeMotionSpeedFactor(speed: MapLineStyleItem["animationSpeed"]) {
  const value = routeMotionSpeedPercent(speed);
  if (value === 0) return Infinity;
  // Piecewise interpolation preserves existing slow/normal/fast ratios.
  if (value <= 25) return 3.25 - 1.5 * value / 25;
  if (value <= 60) return 1.75 - 0.75 * (value - 25) / 35;
  return 1 - 0.5 * (value - 60) / 40;
}

export function routeMotionPeriod(effect: Effect, speed?: MapLineStyleItem["animationSpeed"]): number {
  const period = effect === "blink" ? 1000 : effect === "pulse" || effect === "wave" ? 2000 : 1800;
  return period * routeMotionSpeedFactor(speed);
}

export type MotionDirection = "forward" | "reverse" | "both";
type Segment = { a: XY; dx: number; dy: number; length: number; end: number; spanStart: number };

export function routeIncidentMotionEffect(effect: Effect, layer: RouteMotionLayer) {
  if (effect === "pulse" || effect === "blink" || effect === "none") return effect;
  if (isHighwayMotionLayer(layer)) {
    if (effect === "arrows" || effect === "chaser" || effect === "flow") return "highlight";
    return effect === "wave" ? "ribbon" : "none";
  }
  // Route vertex order is not evidence of water flow; legacy moving flood
  // styles retain their stored values but all render as a stationary cue.
  if (effect === "extent") return layer === "flood" ? "extent" : "none";
  if (effect === "spotlight") return "spotlight";
  if (layer === "flood" || effect === "wave") return "ribbon";
  if (effect === "chevrons") return "chevrons";
  return "highlight";
}

// Motion is measured in screen pixels per millisecond, not in traversals per
// line (a longer route takes longer, without making its preview move slower).
export function routeMotionTravelPeriod(length: number, speed?: MapLineStyleItem["animationSpeed"], wrapPadding = 32) {
  return ((length + wrapPadding) / 0.048) * routeMotionSpeedFactor(speed);
}

export function routeRibbonOpacity(phase: number) {
  return 0.14 + (1 - Math.cos(2 * Math.PI * phase)) * 0.13;
}

// Clip each segment independently so disconnected visible spans never get joined.
export function visibleMotionSegments(points: readonly XY[], width: number, height: number) {
  const segments: Segment[] = [];
  let total = 0;
  let spanStart = 0;
  let lastEnd: XY | undefined;
  const finishSpan = () => { spanStart = total; };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) continue;
    let min = 0;
    let max = 1;
    for (const [d, distance] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]]) {
      if (d === 0) {
        if (distance < 0) { min = 1; max = 0; break; }
      } else if (d < 0) min = Math.max(min, distance / d);
      else max = Math.min(max, distance / d);
    }
    if (min >= max) { finishSpan(); lastEnd = undefined; continue; }
    const length = Math.hypot(dx, dy) * (max - min);
    const start = { x: a.x + dx * min, y: a.y + dy * min };
    if (min > 0 || !lastEnd || Math.hypot(start.x - lastEnd.x, start.y - lastEnd.y) > 1e-6) finishSpan();
    total += length;
    segments.push({ a: start, dx: dx * (max - min), dy: dy * (max - min), length, end: total, spanStart });
    lastEnd = { x: a.x + dx * max, y: a.y + dy * max };
    if (max < 1) { finishSpan(); lastEnd = undefined; }
  }
  finishSpan();
  return { segments, total };
}

type MotionPath = ReturnType<typeof visibleMotionSegments>;

function motionSegmentIndex(path: MotionPath, distance: number) {
  let low = 0;
  let high = path.segments.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (distance < path.segments[mid].end) high = mid;
    else low = mid + 1;
  }
  return low;
}

function pointOnSegment(segment: Segment, distance: number): XY {
  const u = Math.max(0, Math.min(1, (distance - (segment.end - segment.length)) / segment.length));
  return { x: segment.a.x + u * segment.dx, y: segment.a.y + u * segment.dy };
}

function motionCoordinates(point: XY, origin: XY) {
  return `${(origin.x + point.x).toFixed(1)} ${(origin.y + point.y).toFixed(1)}`;
}

// Use distinct SVG subpaths for disconnected spans clipped by the viewport.
export function routeMotionPathData(path: MotionPath, from: number, to: number, origin: XY) {
  const start = Math.max(0, from);
  const end = Math.min(path.total, to);
  if (end <= start) return "";
  let data = "";
  let previousSpan = -1;
  for (let i = motionSegmentIndex(path, start); i < path.segments.length; i++) {
    const seg = path.segments[i];
    const lo = Math.max(start, seg.end - seg.length);
    const hi = Math.min(end, seg.end);
    if (hi <= lo) break;
    if (previousSpan !== seg.spanStart) data += `M${motionCoordinates(pointOnSegment(seg, lo), origin)}`;
    data += `L${motionCoordinates(pointOnSegment(seg, hi), origin)}`;
    previousSpan = seg.spanStart;
    if (seg.end >= end) break;
  }
  return data;
}

// Endpoint rings use the stored geometry endpoints, not clipping intersections.
export function routeMotionEndpointPath(points: readonly XY[], width: number, height: number, origin: XY) {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const candidates = Math.hypot(last.x - first.x, last.y - first.y) < 2 ? [first] : [first, last];
  const radius = 4;
  return candidates.filter(({ x, y }) => x >= 0 && y >= 0 && x <= width && y <= height)
    .map(({ x, y }) => `M${motionCoordinates({ x: x - radius, y }, origin)}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z`)
    .join("");
}

export function routeMotionTrailPositions(total: number, phase: number, direction: MotionDirection, staggered: boolean) {
  // Start/end beyond the visible line so the highlight tapers entirely off
  // before wrapping, instead of jumping sharply from one endpoint to another.
  const at = (progress: number) => (total + 32) * progress - 16;
  if (direction === "both") return [at(phase), at((1.5 - phase) % 1)];
  const progress = direction === "reverse" ? 1 - phase : phase;
  return staggered && total > 120
    ? [at(progress), at((progress + 0.5) % 1)]
    : [at(progress)];
}

export function routeMotionChevronPath(path: MotionPath, phase: number, direction: MotionDirection, origin: XY) {
  const count = Math.max(direction === "both" ? 2 : 1, Math.min(4, Math.floor(path.total / 54)));
  let data = "";
  for (let i = 0; i < count; i++) {
    const backwards = direction === "reverse" || (direction === "both" && i % 2 === 1);
    const progress = (phase + i / count) % 1;
    const distance = path.total * (backwards ? 1 - progress : progress);
    const seg = path.segments[motionSegmentIndex(path, distance)];
    if (!seg) continue;
    const size = 4.2 * Math.min(1, Math.max(0, Math.min(distance, path.total - distance) / 12));
    if (size < 0.25) continue;
    const center = pointOnSegment(seg, distance);
    const before = path.segments[motionSegmentIndex(path, Math.max(0, distance - 5))];
    const after = path.segments[motionSegmentIndex(path, Math.min(path.total, distance + 5))];
    const lo = pointOnSegment(before?.spanStart === seg.spanStart ? before : seg, distance - 5);
    const hi = pointOnSegment(after?.spanStart === seg.spanStart ? after : seg, distance + 5);
    const ref = Math.hypot(hi.x - lo.x, hi.y - lo.y) > 1e-6 ? { x: hi.x - lo.x, y: hi.y - lo.y } : seg;
    const x = "dx" in ref ? ref.dx : ref.x, y = "dy" in ref ? ref.dy : ref.y;
    const length = Math.hypot(x, y);
    const vx = x / length * size * (backwards ? -1 : 1);
    const vy = y / length * size * (backwards ? -1 : 1);
    const wing = (sign: number) => motionCoordinates({ x: center.x - vx + sign * vy * 0.74, y: center.y - vy - sign * vx * 0.74 }, origin);
    data += `M${wing(-1)}L${motionCoordinates(center, origin)}L${wing(1)}`;
  }
  return data;
}
