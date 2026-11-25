import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MAP_STYLES } from "../lib/constants.ts";
import { routeIncidentMotionEffect, routeMotionEndpointPath, routeMotionPathData, routeMotionSpeedPercent, routeMotionTrailPositions, routeRibbonOpacity, routeMotionTravelPeriod, routeMotionEffect, routeMotionPeriod, routeMotionToggle, visibleMotionSegments } from "../lib/route-motion.ts";

test("new defaults and per-layer persisted choices", () => {
  const { flood, detour, primary, secondary } = DEFAULT_MAP_STYLES;
  assert.equal(routeMotionEffect(flood), "wave");
  assert.equal(routeMotionEffect(detour), "flow");
  assert.equal(routeMotionEffect(primary), "none");
  assert.equal(routeMotionEffect(secondary), "none");
  const legacy = { ...flood, animation: "pulse", animationSpeed: "slow" };
  assert.equal(routeMotionEffect(legacy), "pulse");
  const off = JSON.parse(JSON.stringify({ ...legacy, ...routeMotionToggle(legacy, "flood", false) }));
  assert.equal(routeMotionEffect(off), "none");
  assert.equal(routeMotionEffect(detour), "flow");
  assert.equal(off.animationSpeed, "slow");
  assert.equal(routeMotionEffect({ ...off, ...routeMotionToggle(off, "flood", true) }), "pulse");
  assert.equal(routeMotionEffect({ ...detour, animation: "none" }), "none");
});

test("different speeds, clipped glyph paths and directional arrowheads", () => {
  for (const effect of ["wave", "flow", "chaser", "arrows", "pulse", "blink"]) {
    assert.ok(routeMotionPeriod(effect, "fast") < routeMotionPeriod(effect));
    assert.ok(routeMotionPeriod(effect) < routeMotionPeriod(effect, "slow"));
  }
  const forward = visibleMotionSegments([{ x: -50, y: 30 }, { x: 150, y: 30 }], 100, 100);
  const reverse = visibleMotionSegments([{ x: 150, y: 30 }, { x: -50, y: 30 }], 100, 100);
  assert.equal(forward.total, 100);
  assert.equal(visibleMotionSegments([{ x: -20, y: 20 }, { x: -10, y: 40 }], 100, 100).total, 0);
  assert.equal(routeMotionPathData(forward, 45, 55, {x: 0, y: 0}), "M45.0 30.0L55.0 30.0");
  assert.equal(routeMotionPathData(reverse, 45, 55, {x: 0, y: 0}), "M55.0 30.0L45.0 30.0");
  const duration = routeMotionTravelPeriod(1000);
  assert.ok(1000 / duration <= 0.048);
  assert.equal(routeMotionTravelPeriod(1000, "fast"), duration / 2);
});

test("flood is stationary even for legacy styles and trails taper without spanning clipped gaps", () => {
  assert.equal(routeIncidentMotionEffect("wave", "flood"), "ribbon");
  assert.equal(routeIncidentMotionEffect("spotlight", "flood"), "spotlight");
  assert.equal(routeIncidentMotionEffect("chevrons", "detour"), "chevrons");
  assert.equal(routeIncidentMotionEffect("arrows", "flood"), "ribbon");
  assert.equal(routeIncidentMotionEffect("arrows", "detour"), "highlight");
  assert.equal(routeRibbonOpacity(0), routeRibbonOpacity(1));
  assert.ok(routeRibbonOpacity(0.5) > routeRibbonOpacity(0));
  const gap = visibleMotionSegments([{ x: 50, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 70 }, { x: 50, y: 70 }], 100, 100);
  assert.equal(routeMotionPathData(gap, 45, 55, {x: 0, y: 0}), "M95.0 20.0L100.0 20.0M100.0 70.0L95.0 70.0");
  const [tail] = routeMotionTrailPositions(gap.total, 1, "forward", false);
  assert.equal(routeMotionPathData(gap, tail - 16, tail + 16, {x: 0, y: 0}), "");
  const [reverseAtStart] = routeMotionTrailPositions(gap.total, 0, "reverse", false);
  assert.equal(reverseAtStart, tail);
  assert.equal(routeMotionTrailPositions(gap.total, 0.33, "both", false).length, 2);
});

test("speed percentage preserves legacy turn rates, pauses at zero, and stays bounded at 100", () => {
  assert.deepEqual(["slow","normal","fast",undefined].map(routeMotionSpeedPercent), [25,60,100,60]);
  assert.equal(routeMotionSpeedPercent(-5),0);
  assert.equal(routeMotionSpeedPercent(150),100);
  assert.equal(routeMotionSpeedPercent(51.2),51);
  assert.equal(routeMotionPeriod("flow", "normal"),routeMotionPeriod("flow",60));
  assert.equal(routeMotionPeriod("flow", "fast"),routeMotionPeriod("flow",100));
  assert.equal(routeMotionPeriod("wave",0),Infinity);
  assert.equal(routeMotionTravelPeriod(500,100),routeMotionTravelPeriod(500,500));
});

test("visible endpoint rings belong only to true flood geometry endpoints, not viewport seams", () => {
  const origin = {x: 20, y: 30};
  const spanning = [{x: -10,y: 40}, {x: 35,y: 40}, {x: 110,y: 40}];
  const visible = visibleMotionSegments(spanning, 100, 100);
  assert.equal(visible.total, 100);
  assert.equal(routeMotionEndpointPath(spanning, 100, 100, origin), "");
  assert.equal(routeMotionEndpointPath([spanning[0], spanning[1]], 100, 100, origin),
    "M51.0 70.0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z");
  assert.equal(routeMotionEndpointPath([spanning[1], {x: 85,y: 45}], 100, 100, origin).split("M").length - 1, 2);
  assert.equal(routeIncidentMotionEffect("extent", "flood"), "extent");
  assert.equal(routeIncidentMotionEffect("extent", "detour"), "none");
});

test("the same percentage moves equal screen distances at both preview and map scales", () => {
  // Shorter preview geometry loops sooner without changing the visible speed.
  for (const setting of [1,25,60,100,"slow","normal","fast"]) {
    const speed = (length) => (length + 32) / routeMotionTravelPeriod(length,setting);
    assert.ok(Math.abs(speed(200) - speed(1400)) < 1e-10);
  }
  assert.equal(routeMotionTravelPeriod(1400,0),Infinity);
  assert.ok(Math.abs(200 / routeMotionTravelPeriod(200,100,0) - 0.096) < 1e-10);
});
