import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MAP_STYLES } from "../lib/constants.ts";
import { motionGlyph, routeMotionEffect, routeMotionPeriod, routeMotionToggle, visibleMotionSegments } from "../lib/route-motion.ts";

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
  assert.deepEqual(motionGlyph(forward, 0.5, 10, "flow")[1], [50, 30]);
  assert.ok(motionGlyph(forward, 0.5, 10, "flow")[0][0] < 50);
  assert.ok(motionGlyph(reverse, 0.5, 10, "flow")[0][0] > 50);
  assert.notDeepEqual(motionGlyph(forward, 0.2, 10, "flow"), motionGlyph(forward, 0.7, 10, "flow"));
  assert.ok(motionGlyph(forward, 0.5, 10, "wave").some(([, y]) => y < 30));
  assert.ok(motionGlyph(forward, 0.5, 10, "wave").some(([, y]) => y > 30));
});
