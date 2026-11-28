import { applyStrike, type BallState, type ShotInput } from '@cuesports/physics';
import { DEFAULT_CUE, type CueSpec, type TableSpec, type Vec2 } from '@cuesports/shared';

export interface Guide {
  from: Vec2;
  /** End of the cue ball's straight path (ghost ball centre, or the cushion). */
  end: Vec2;
  ghost: Vec2 | null;
  radius: number;
  object: { id: string; from: Vec2; dir: Vec2 } | null;
  /** Stun-shot cue-ball direction after contact (the tangent line). */
  tangent: Vec2 | null;
}

/** Straight-line aiming guide. It ignores squirt, swerve and throw, which is what makes them skills. */
export function computeGuide(
  table: TableSpec,
  balls: readonly BallState[],
  cueId: string,
  aim: number,
): Guide | null {
  const cue = balls.find((b) => b.id === cueId);
  if (!cue || cue.state === 'pocketed') return null;
  const dir = { x: Math.cos(aim), y: Math.sin(aim) };
  let best = Infinity;
  let hit: BallState | null = null;
  for (const b of balls) {
    if (b === cue || b.state === 'pocketed') continue;
    const D = b.radius + cue.radius;
    const px = b.pos.x - cue.pos.x;
    const py = b.pos.y - cue.pos.y;
    const along = px * dir.x + py * dir.y;
    if (along <= 0) continue;
    const perp2 = px * px + py * py - along * along;
    if (perp2 > D * D) continue;
    const t = along - Math.sqrt(D * D - perp2);
    if (t < best) {
      best = t;
      hit = b;
    }
  }
  const hl = table.playfield.length / 2 - cue.radius;
  const hw = table.playfield.width / 2 - cue.radius;
  const tx = dir.x > 0 ? (hl - cue.pos.x) / dir.x : dir.x < 0 ? (-hl - cue.pos.x) / dir.x : Infinity;
  const ty = dir.y > 0 ? (hw - cue.pos.y) / dir.y : dir.y < 0 ? (-hw - cue.pos.y) / dir.y : Infinity;
  const wall = Math.max(0, Math.min(tx, ty));
  if (hit && best < wall) {
    const ghost = { x: cue.pos.x + dir.x * best, y: cue.pos.y + dir.y * best };
    const ox = hit.pos.x - ghost.x;
    const oy = hit.pos.y - ghost.y;
    const ol = Math.hypot(ox, oy);
    const od = { x: ox / ol, y: oy / ol };
    // The cue ball leaves along the tangent, on the side away from the object ball's path.
    const side = dir.x * od.y - dir.y * od.x;
    const tangent = Math.abs(side) < 1e-6 ? null : side > 0 ? { x: od.y, y: -od.x } : { x: -od.y, y: od.x };
    return {
      from: cue.pos,
      end: ghost,
      ghost,
      radius: cue.radius,
      object: { id: hit.id, from: hit.pos, dir: od },
      tangent,
    };
  }
  return {
    from: cue.pos,
    end: { x: cue.pos.x + dir.x * wall, y: cue.pos.y + dir.y * wall },
    ghost: null,
    radius: cue.radius,
    object: null,
    tangent: null,
  };
}

/** Direction the cue ball actually leaves the tip: the aim turned by squirt (left for right-hand side). */
export function launchDirection(ball: BallState, shot: ShotInput, cue: CueSpec = DEFAULT_CUE): number {
  const probe = { ...ball, pos: { ...ball.pos }, vel: { x: 0, y: 0 }, spin: { x: 0, y: 0, z: 0 } };
  const out = applyStrike(probe, shot, cue);
  return shot.aim + out.squirt;
}

/** The pocket an object ball is heading for, if its path points into one (for auto-calling shots). */
export function pocketAhead(table: TableSpec, from: Vec2, dir: Vec2): string | null {
  let best: string | null = null;
  let bestErr = Infinity;
  for (const p of table.pockets) {
    const dx = p.position.x - from.x;
    const dy = p.position.y - from.y;
    const d = Math.hypot(dx, dy);
    // Sideways miss distance at the pocket, compared with the size of the mouth.
    const along = dx * dir.x + dy * dir.y;
    if (along <= 0) continue;
    const miss = Math.abs(dx * dir.y - dy * dir.x);
    const err = miss / p.mouthWidth + d * 0.01;
    if (miss < p.mouthWidth * 1.5 && err < bestErr) {
      bestErr = err;
      best = p.id;
    }
  }
  return best;
}

/** The career guide: what your Vision lets you see after contact. */
export interface CareerGuideTuning {
  /** Object-ball line length (m); 0 hides it. */
  object: number;
  /** Cue-ball line length after contact (m); 0 hides it. */
  cue: number;
  /** The cue-ball line allows for screw, stun and follow. */
  spinAware: boolean;
  /** Lines carry on past the first cushion. */
  rebound: boolean;
}

export interface GuideShape {
  object: Vec2[];
  cue: Vec2[];
}

/**
 * A line from `from` along `dir` for `len` metres, stopping at the first cushion (the playfield
 * edge less a ball radius), or bouncing off it once when `rebound` is set. A ball heading into a
 * pocket stops there.
 */
export function travel(
  table: TableSpec,
  from: Vec2,
  dir: Vec2,
  len: number,
  radius: number,
  rebound: boolean,
): Vec2[] {
  const pts: Vec2[] = [from];
  if (len <= 0) return [];
  const hl = table.playfield.length / 2 - radius;
  const hw = table.playfield.width / 2 - radius;
  let p = from;
  let d = dir;
  let left = len;
  for (let bounce = 0; bounce < 2 && left > 1e-4; bounce++) {
    const tx = d.x > 1e-9 ? (hl - p.x) / d.x : d.x < -1e-9 ? (-hl - p.x) / d.x : Infinity;
    const ty = d.y > 1e-9 ? (hw - p.y) / d.y : d.y < -1e-9 ? (-hw - p.y) / d.y : Infinity;
    const t = Math.max(0, Math.min(tx, ty));
    if (t >= left) {
      pts.push({ x: p.x + d.x * left, y: p.y + d.y * left });
      break;
    }
    const hit = { x: p.x + d.x * t, y: p.y + d.y * t };
    pts.push(hit);
    left -= t;
    const inPocket = table.pockets.some(
      (k) => Math.hypot(k.position.x - hit.x, k.position.y - hit.y) < k.mouthWidth * 0.9,
    );
    if (!rebound || inPocket) break;
    d = tx < ty ? { x: -d.x, y: d.y } : { x: d.x, y: -d.y };
    p = hit;
  }
  return pts;
}

/**
 * The cue ball's direction once it has gripped the cloth after contact. Straight after the hit it
 * leaves along the tangent; its top or back spin then pulls it forwards or back along the shot
 * line: v = 5/7·(tangent velocity) + 2/7·s·(shot line), where s is the spin ratio at contact (1 is
 * natural roll, 0 stun, −1 a full screw). Spin from the tip (s = 2.5·b) wears towards roll while
 * the ball slides to the object ball. Returns the direction and its strength (0 = it stops dead).
 */
export function cueAfterContact(
  dir: Vec2,
  objectDir: Vec2,
  tipB: number,
  speed: number,
  distance: number,
): { dir: Vec2; strength: number } {
  const s0 = Math.max(-1.5, Math.min(1.5, 2.5 * tipB));
  const slideTime = (2 * Math.abs(1 - s0) * Math.max(speed, 0.1)) / (7 * 0.2 * 9.81);
  const slideDist = Math.max(1e-3, speed * slideTime);
  const s = 1 - (1 - s0) * Math.max(0, 1 - distance / slideDist);
  const along = dir.x * objectDir.x + dir.y * objectDir.y;
  const tx = dir.x - along * objectDir.x;
  const ty = dir.y - along * objectDir.y;
  const vx = (5 / 7) * tx + (2 / 7) * s * dir.x;
  const vy = (5 / 7) * ty + (2 / 7) * s * dir.y;
  const l = Math.hypot(vx, vy);
  return l < 1e-6 ? { dir, strength: 0 } : { dir: { x: vx / l, y: vy / l }, strength: Math.min(1, l / 0.6) };
}

/** The lines your Vision shows after contact, for a guide. */
export function careerShape(
  table: TableSpec,
  g: Guide,
  t: CareerGuideTuning,
  tipB: number,
  speed: number,
): GuideShape {
  const out: GuideShape = { object: [], cue: [] };
  if (!g.object || !g.ghost) return out;
  out.object = travel(table, g.object.from, g.object.dir, t.object, g.radius, t.rebound);
  if (t.cue <= 0) return out;
  if (!t.spinAware) {
    if (g.tangent) out.cue = travel(table, g.ghost, g.tangent, t.cue, g.radius, false);
    return out;
  }
  const dx = g.ghost.x - g.from.x;
  const dy = g.ghost.y - g.from.y;
  const dist = Math.hypot(dx, dy);
  const dir = dist > 1e-9 ? { x: dx / dist, y: dy / dist } : g.object.dir;
  const after = cueAfterContact(dir, g.object.dir, tipB, speed, dist);
  if (after.strength > 0.02)
    out.cue = travel(table, g.ghost, after.dir, t.cue * Math.max(0.15, after.strength), g.radius, t.rebound);
  return out;
}

/**
 * A longer guide for 3-cushion: the cue ball's path to the first cushion, and a short stub of the
 * rebound off it (`tail` metres). After a hit on the first ball it leaves as screw, stun or follow
 * allows and runs to the cushion; on a cushion-first shot the guide already reaches the cushion, so
 * only the stub is added. The second and third cushions are yours to judge. Mirroring ignores side
 * and the cushion's grip, so it's a guide, not a promise. A ball in the way ends it.
 */
export function cushionPath(
  table: TableSpec,
  balls: readonly BallState[],
  g: Guide,
  cueId: string,
  tipB: number,
  speed: number,
  tail = 0.3,
): Vec2[] {
  const r = g.radius;
  let from: Vec2;
  let dir: Vec2;
  let skip: string | null = null;
  if (g.object && g.ghost) {
    const dx = g.ghost.x - g.from.x;
    const dy = g.ghost.y - g.from.y;
    const dist = Math.hypot(dx, dy);
    const d = dist > 1e-9 ? { x: dx / dist, y: dy / dist } : g.object.dir;
    const after = cueAfterContact(d, g.object.dir, tipB, speed, dist);
    if (after.strength < 0.02) return [];
    from = g.ghost;
    dir = after.dir;
    skip = g.object.id;
  } else {
    // Off the first cushion: mirror the shot at the rail it reaches.
    const dx = g.end.x - g.from.x;
    const dy = g.end.y - g.from.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) return [];
    const hl = table.playfield.length / 2 - r;
    const hw = table.playfield.width / 2 - r;
    const d = { x: dx / l, y: dy / l };
    const onEnd = Math.abs(Math.abs(g.end.x) - hl) < 1e-6;
    const onSide = Math.abs(Math.abs(g.end.y) - hw) < 1e-6;
    dir = { x: onEnd ? -d.x : d.x, y: onSide ? -d.y : d.y };
    from = g.end;
  }
  const others = balls.filter((b) => b.id !== cueId && b.id !== skip && b.state !== 'pocketed');
  const hl = table.playfield.length / 2 - r;
  const hw = table.playfield.width / 2 - r;
  const pts: Vec2[] = [from];
  // After a ball: on to the first cushion, then the stub. Cushion-first: just the stub.
  const cushionFirst = skip === null;
  let left = cushionFirst ? tail : 10;
  for (let k = 0; k <= (cushionFirst ? 0 : 1) && left > 1e-4; k++) {
    const tx = dir.x > 1e-9 ? (hl - from.x) / dir.x : dir.x < -1e-9 ? (-hl - from.x) / dir.x : Infinity;
    const ty = dir.y > 1e-9 ? (hw - from.y) / dir.y : dir.y < -1e-9 ? (-hw - from.y) / dir.y : Infinity;
    const wall = Math.max(0, Math.min(tx, ty, left));
    // A ball in the way ends the path where the cue ball would touch it.
    let hit = Infinity;
    for (const b of others) {
      const D = b.radius + r;
      const px = b.pos.x - from.x;
      const py = b.pos.y - from.y;
      const along = px * dir.x + py * dir.y;
      if (along <= 1e-6) continue;
      const perp2 = px * px + py * py - along * along;
      if (perp2 > D * D) continue;
      hit = Math.min(hit, along - Math.sqrt(D * D - perp2));
    }
    if (hit < wall) {
      pts.push({ x: from.x + dir.x * hit, y: from.y + dir.y * hit });
      break;
    }
    from = { x: from.x + dir.x * wall, y: from.y + dir.y * wall };
    pts.push(from);
    left = k === 0 && !cushionFirst ? tail : left - wall;
    dir = tx < ty ? { x: -dir.x, y: dir.y } : { x: dir.x, y: -dir.y };
  }
  return pts;
}
