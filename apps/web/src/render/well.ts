import type { Vec2 } from '@cuesports/shared';

/** Distance from a point to the nearest edge of a closed outline. */
export function distanceToOutline(o: readonly Vec2[], x: number, y: number): number {
  let d2 = Infinity;
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % o.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / l2)) : 0;
    d2 = Math.min(d2, (x - a.x - ex * k) ** 2 + (y - a.y - ey * k) ** 2);
  }
  return Math.sqrt(d2);
}

function inside(o: readonly Vec2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = o[i]!;
    const b = o[j]!;
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c;
  }
  return c;
}

/**
 * The roomiest point of a pocket's hole (furthest from every edge), where potted balls come to
 * rest. The centroid can sit close to one side of a lopsided pocket outline.
 */
export function wellCentre(o: readonly Vec2[]): Vec2 {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of o)
    [x0, y0, x1, y1] = [Math.min(x0, p.x), Math.min(y0, p.y), Math.max(x1, p.x), Math.max(y1, p.y)];
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  let bd = -1;
  // Coarse grid, then refine around the best point.
  for (let step = Math.max(x1 - x0, y1 - y0) / 40, pass = 0; pass < 3; pass++, step /= 8) {
    const c = best;
    const span = pass === 0 ? Infinity : step * 8;
    for (let x = Math.max(x0, c.x - span); x <= Math.min(x1, c.x + span); x += step) {
      for (let y = Math.max(y0, c.y - span); y <= Math.min(y1, c.y + span); y += step) {
        if (!inside(o, x, y)) continue;
        const d = distanceToOutline(o, x, y);
        if (d > bd) [bd, best] = [d, { x, y }];
      }
    }
  }
  return best;
}
