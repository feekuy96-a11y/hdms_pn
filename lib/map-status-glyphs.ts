import type { StatusColor } from "./traffic-presentation";

/** Original 24-unit road SC signage. The tint is part of each pictogram, not an enclosing badge. */
type Glyph = { key: string; face: string; inset: string; route: string };
export const MAP_STATUS_GLYPHS = {
  // High-visibility road barricade: a striped panel, with legs grounded on both sides.
  red: {
    key: "closed", face: "M2 6h20v9H2z", inset: "m4 14 4-7h4l-4 7zm8 0 4-7h4l-4 7z",
    route: "M6 15v5m12-5v5M4 20h4m8 0h4",
  },
  // Profile of a small vehicle, cut through with a visible restriction slash.
  orange: {
    key: "vehicle", face: "M2 14v-2l4-1 3-5h6l4 5 3 2v4H2zM6 17a2 2 0 1 0 4 0m4 0a2 2 0 1 0 4 0",
    inset: "m9 7-2 4h11l-3-4z", route: "M4 21 20 3",
  },
  // Tapered single carriageway; chevrons point inward toward the one open lane.
  amber: {
    key: "warning", face: "M9 3h6l4 18H5z", inset: "M12 4h2l4 16h-6z",
    route: "M12 7v3m0 3v3M2 8l3 3-3 3m20-6-3 3 3 3",
  },
  // Deliberate S-curve and a pair of short delay marks, not the old gauge.
  sky: {
    key: "slow", face: "M3 21c0-7 12-6 12-10 0-2-4-2-4-5 0-1 1-2 3-3h6c-3 1-4 2-4 3 0 2 5 2 5 5 0 5-11 5-11 10z",
    inset: "M4 20c1-5 9-5 11-8l3 2c-2 4-7 3-8 6z", route: "M2 8h5m-4 3h4",
  },
  // An open carriageway with its check integrated in the through-direction.
  emerald: {
    key: "passable", face: "M9 3h6l6 18H3z", inset: "M12 4h2l6 16h-8z",
    route: "m7 12 3.5 3.5L17 8M10 19h4",
  },
  slate: {
    key: "pending", face: "m12 2 10 10-10 10L2 12z", inset: "m12 3 9 9-9 9z",
    route: "M9.5 9a2.5 2.5 0 1 1 4.1 1.9L12 12.5v1m0 3v.2",
  },
} as const satisfies Record<StatusColor, Glyph>;
