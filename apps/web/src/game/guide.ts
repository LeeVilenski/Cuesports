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
