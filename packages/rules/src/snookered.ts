import type { BallState } from '@cuesports/physics';

/**
 * Snooker's definition of being snookered: the cue ball is snookered when a straight-line stroke to
 * every ball on is wholly or partly blocked by balls not on. If some ball on can be hit on both its
 * extreme edges with nothing in the way, the cue ball is not snookered. (Cushion "angles" in the
 * pocket jaws are not checked yet.)
 */
export function isSnookered(balls: readonly BallState[], cueId: string, on: readonly string[]): boolean {
  const cue = balls.find((b) => b.id === cueId && b.state !== 'pocketed');
  if (!cue) return false;
  for (const id of on) {
    const t = balls.find((b) => b.id === id && b.state !== 'pocketed');
    if (!t) continue;
    if (bothEdgesClear(balls, cue, t, on)) return false;
  }
  return true;
}

/** Whether both extreme edges of `t` can be struck in a straight line from the cue ball. */
export function bothEdgesClear(
  balls: readonly BallState[],
  cue: BallState,
  t: BallState,
  on: readonly string[],
): boolean {
  const dx = t.pos.x - cue.pos.x;
  const dy = t.pos.y - cue.pos.y;
  const d = Math.hypot(dx, dy);
  const D = cue.radius + t.radius;
  // A ball on touching the cue ball can always be played (touching-ball rule).
  if (d <= D + 1e-6) return true;
  const theta = Math.atan2(dy, dx);
  const half = Math.asin(D / d);
  const reach = Math.sqrt(d * d - D * D);
  for (const side of [-1, 1]) {
    const a = theta + side * half;
    const gx = cue.pos.x + Math.cos(a) * reach;
    const gy = cue.pos.y + Math.sin(a) * reach;
    for (const b of balls) {
      if (b === cue || b === t || b.state === 'pocketed' || on.includes(b.id)) continue;
      if (segmentDistance(cue.pos.x, cue.pos.y, gx, gy, b.pos.x, b.pos.y) < cue.radius + b.radius - 1e-9) {
        return false;
      }
    }
  }
  return true;
}

function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  let u = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(ax + ex * u - px, ay + ey * u - py);
}
