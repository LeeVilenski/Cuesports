import { detCos, detSin, type TableSpec } from '@cuesports/shared';
import type { BallState, ShotInput } from './types';

/** Cue dimensions (metres): the radius tapers linearly from the tip to the butt. */
export const CUE_SHAPE = { length: 1.45, tipRadius: 0.0062, buttRadius: 0.0145 };

/** The table around the playfield: cushion and wooden rail widths, and their heights above the nose. */
export const TABLE_TRIM = {
  cushionWidth: 0.05,
  railWidth: 0.1,
  cushionTopAboveNose: 0.007,
  railTopAboveNose: 0.013,
};

const MAX_ELEVATION = 1.4; // ~80°: near-vertical masse
const STEP = Math.PI / 360; // 0.5°
/**
 * A real cue is never quite level: the butt is always lifted a few degrees over the rail. The game's
 * "0°" stands for that natural lift, so only elevation needed beyond it is forced on the shot.
 */
export const NATURAL_LIFT = (3 * Math.PI) / 180;

/**
 * The cue elevation (radians, at least `shot.elevation`) at which the cue clears the cushion, the rail
 * and every other ball. The cue rests on whatever is in the way, so a cue ball near a cushion or close
 * behind another ball needs the butt raised; hitting higher on the cue ball (follow) needs less.
 */
export function cueClearElevation(table: TableSpec, balls: readonly BallState[], shot: ShotInput): number {
  const cue = balls.find((b) => b.id === shot.ball);
  if (!cue || cue.state === 'pocketed') return shot.elevation;
  const floor = shot.elevation + NATURAL_LIFT;
  if (clear(table, balls, cue, shot, floor)) return shot.elevation;
  let lo = floor;
  let hi = lo;
  while (hi < MAX_ELEVATION) {
    hi = Math.min(MAX_ELEVATION, hi + STEP);
    if (clear(table, balls, cue, shot, hi)) break;
    lo = hi;
  }
  if (hi >= MAX_ELEVATION) return MAX_ELEVATION;
  for (let k = 0; k < 6; k++) {
    const mid = (lo + hi) / 2;
    if (clear(table, balls, cue, shot, mid)) hi = mid;
    else lo = mid;
  }
  return Math.max(shot.elevation, hi - NATURAL_LIFT);
}

const cueRadius = (u: number): number =>
  CUE_SHAPE.tipRadius +
  ((CUE_SHAPE.buttRadius - CUE_SHAPE.tipRadius) * Math.min(u, CUE_SHAPE.length)) / CUE_SHAPE.length;

/** Whether a cue at elevation `e` touches nothing but the cue ball. */
function clear(
  table: TableSpec,
  balls: readonly BallState[],
  cue: BallState,
  shot: ShotInput,
  e: number,
): boolean {
  const R = cue.radius;
  const ch = detCos(shot.aim);
  const sh = detSin(shot.aim);
  const ce = detCos(e);
  const se = detSin(e);
  // d: the cue's direction of travel (down towards the ball); s: to the right; e2 = s × d: "up" on the ball.
  const d = { x: ce * ch, y: ce * sh, z: -se };
  const s = { x: sh, y: -ch, z: 0 };
  const e2 = { x: s.y * d.z - s.z * d.y, y: s.z * d.x - s.x * d.z, z: s.x * d.y - s.y * d.x };
  const { a, b } = shot.tip;
  const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
  // The tip's contact point on the cue ball.
  const P = {
    x: cue.pos.x + (s.x * a + e2.x * b - d.x * c) * R,
    y: cue.pos.y + (s.y * a + e2.y * b - d.y * c) * R,
    z: R + (s.z * a + e2.z * b - d.z * c) * R,
  };

  // Other balls: the distance from each centre to the cue's axis must exceed R + the cue's radius there.
  for (const o of balls) {
    if (o.id === cue.id || o.state === 'pocketed') continue;
    const C = { x: o.pos.x - P.x, y: o.pos.y - P.y, z: o.radius - P.z };
    const u = -(C.x * d.x + C.y * d.y + C.z * d.z); // distance back along the cue
    if (u <= 0 || u > CUE_SHAPE.length) continue;
    const px = C.x + d.x * u;
    const py = C.y + d.y * u;
    const pz = C.z + d.z * u;
    if (Math.hypot(px, py, pz) < o.radius + cueRadius(u)) return false;
  }

  // Cushion and rail: going back from the tip, the cue must be above the cushion top from the nose
  // line, and above the rail top from the cushion's back edge, until it leaves the table.
  if (ce < 1e-6) return true;
  const hl = table.playfield.length / 2;
  const hw = table.playfield.width / 2;
  const bx = -ch;
  const by = -sh;
  /** Horizontal distance back from the tip to where |x| or |y| first reaches the given offset outside the nose lines. */
  const reach = (k: number): number => {
    const tx = Math.abs(bx) > 1e-9 ? ((bx > 0 ? hl + k : -(hl + k)) - P.x) / bx : Infinity;
    const ty = Math.abs(by) > 1e-9 ? ((by > 0 ? hw + k : -(hw + k)) - P.y) / by : Infinity;
    return Math.max(0, Math.min(tx, ty));
  };
  const nose = table.cushion.noseHeight;
  const tanE = se / ce;
  const above = (dist: number, height: number): boolean => {
    const u = dist / ce;
    return P.z + dist * tanE - cueRadius(u) / ce >= height;
  };
  const edge = reach(TABLE_TRIM.cushionWidth + TABLE_TRIM.railWidth);
  const cushionAt = reach(0);
  const railAt = reach(TABLE_TRIM.cushionWidth);
  if (cushionAt < edge && !above(cushionAt, nose + TABLE_TRIM.cushionTopAboveNose)) return false;
  if (railAt < edge && !above(railAt, nose + TABLE_TRIM.railTopAboveNose)) return false;
  return true;
}
