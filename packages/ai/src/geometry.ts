import type { BallState } from '@cuesports/physics';
import type { PocketSpec, TableSpec, Vec2 } from '@cuesports/shared';

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const unit = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};

function segmentDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const e = sub(b, a);
  const l2 = e.x * e.x + e.y * e.y;
  let u = l2 > 0 ? ((p.x - a.x) * e.x + (p.y - a.y) * e.y) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(a.x + e.x * u - p.x, a.y + e.y * u - p.y);
}

/** Whether a ball of radius r can travel from a to b without touching any ball except those in `ignore`. */
export function pathClear(
  balls: readonly BallState[],
  a: Vec2,
  b: Vec2,
  r: number,
  ignore: readonly string[],
): boolean {
  for (const o of balls) {
    if (o.state === 'pocketed' || ignore.includes(o.id)) continue;
    if (segmentDistance(a, b, o.pos) < r + o.radius - 1e-6) return false;
  }
  return true;
}

/** The point an object ball should be sent at to drop in a pocket (a little inside the mouth). */
export function pocketAim(p: PocketSpec): Vec2 {
  const back = p.shelfDepth + p.fallRadius - 0.01;
  return { x: p.position.x - p.axis.x * back, y: p.position.y - p.axis.y * back };
}

export interface PotLine {
  target: string;
  pocket: string;
  /** Where the cue ball's centre must be at contact. */
  ghost: Vec2;
  /** Cut angle in radians (0 = straight). */
  cut: number;
  /** Cue ball to ghost, and object ball to pocket, distances. */
  d1: number;
  d2: number;
}

/** Straight-line pot of `target` into `pocket` from the cue ball, or null if blocked or too thin. */
export function potLine(
  table: TableSpec,
  balls: readonly BallState[],
  cue: BallState,
  target: BallState,
  pocket: PocketSpec,
  maxCut = (78 * Math.PI) / 180,
): PotLine | null {
  const aimAt = pocketAim(pocket);
  const toPocket = unit(sub(aimAt, target.pos));
  // The object ball must be heading into the mouth, not across it.
  if (toPocket.x * pocket.axis.x + toPocket.y * pocket.axis.y < 0.35) return null;
  const D = cue.radius + target.radius;
  const ghost = { x: target.pos.x - toPocket.x * D, y: target.pos.y - toPocket.y * D };
  const toGhost = sub(ghost, cue.pos);
  const d1 = len(toGhost);
  if (d1 < 1e-4) return null;
  const cosCut = (toGhost.x * toPocket.x + toGhost.y * toPocket.y) / d1;
  const cut = Math.acos(Math.max(-1, Math.min(1, cosCut)));
  if (cut > maxCut) return null;
  if (!pathClear(balls, cue.pos, ghost, cue.radius, [cue.id, target.id])) return null;
  if (!pathClear(balls, target.pos, aimAt, target.radius, [cue.id, target.id])) return null;
  void table;
  return { target: target.id, pocket: pocket.id, ghost, cut, d1, d2: len(sub(aimAt, target.pos)) };
}

/** 0–1: how easy a pot is (straighter and shorter is easier). */
export const potEase = (l: PotLine): number => Math.cos(l.cut) ** 2 * Math.exp(-(l.d1 + 1.5 * l.d2) / 2.2);

/** The easiest pot available from the cue ball's position on any of `targets` (0 if none). */
export function bestPotEase(
  table: TableSpec,
  balls: readonly BallState[],
  targets: readonly string[],
): number {
  const cue = balls.find((b) => b.id === 'cue' && b.state !== 'pocketed');
  if (!cue) return 0.6; // ball in hand: usually a good chance
  let best = 0;
  for (const id of targets) {
    const t = balls.find((b) => b.id === id && b.state !== 'pocketed');
    if (!t) continue;
    for (const p of table.pockets) {
      const l = potLine(table, balls, cue, t, p);
      if (l) best = Math.max(best, potEase(l));
    }
  }
  return best;
}
