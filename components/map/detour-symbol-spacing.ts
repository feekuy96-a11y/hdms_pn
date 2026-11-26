export type DetourSymbolPoint = Readonly<{ x: number; y: number }>;
type DetourSymbolAnchor = DetourSymbolPoint & { key: string };

const CLEARANCE = 36;

/** Preserve clear original positions first, then place colliding symbols in
 * nearby free slots. Input points are projected pixels, never stored coordinates. */
export function getDetourSymbolOffsets(anchors: readonly DetourSymbolAnchor[]) {
  const ordered = [...anchors].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const grid = new Map<string, DetourSymbolPoint[]>();
  const cell = (n: number) => Math.floor(n / CLEARANCE);
  const key = (x: number, y: number) => `${x}:${y}`;
  const occupies = (p: DetourSymbolPoint) => {
    const x = cell(p.x), y = cell(p.y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (grid.get(key(x + dx, y + dy))?.some((other) =>
        Math.abs(other.x - p.x) < CLEARANCE && Math.abs(other.y - p.y) < CLEARANCE)) return true;
    }
    return false;
  };
  const add = (p: DetourSymbolPoint) => {
    const k = key(cell(p.x), cell(p.y));
    const points = grid.get(k);
    if (points) points.push(p); else grid.set(k, [p]);
  };
  const displaced: DetourSymbolAnchor[] = [];
  const offsets = new Map<string, DetourSymbolPoint>();
  for (const p of ordered) {
    if (occupies(p)) displaced.push(p);
    else {
      add(p);
      offsets.set(p.key, { x: 0, y: 0 });
    }
  }

  const slots: DetourSymbolPoint[] = [];
  let scannedRing = 0;
  for (const p of displaced) {
    // A free slot must exist: each occupied marker blocks only finitely many
    // positions on the 36 px lattice. Expand only as needed for dense groups.
    let found: DetourSymbolPoint | undefined;
    while (!found) {
      found = slots.find((s) => !occupies({ x: p.x + s.x, y: p.y + s.y }));
      if (found) break;
      const r = ++scannedRing;
      const next: DetourSymbolPoint[] = [];
      for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) {
        if (Math.max(Math.abs(x), Math.abs(y)) === r) next.push({ x: x * CLEARANCE, y: y * CLEARANCE });
      }
      next.sort((a, b) => (a.x ** 2 + a.y ** 2) - (b.x ** 2 + b.y ** 2) || b.x - a.x || a.y - b.y);
      slots.push(...next);
    }
    offsets.set(p.key, found);
    add({ x: p.x + found.x, y: p.y + found.y });
  }
  return offsets;
}
