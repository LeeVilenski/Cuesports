import type { PhysicsEvent } from '@cuesports/physics';
import type { Attr, Ratings } from './attributes';
import type { ShotRecord } from './record';

/**
 * Shots worth more than a plain pot, for career XP: escaping a snooker, a combination, a plant,
 * a cannon (the cue ball off one ball and into another that drops), and leaving the other player
 * snookered.
 */

export interface Spot {
  id: string;
  x: number;
  y: number;
}

/** Is a ball centred `p` within `r` of the segment a → b (not counting the ends)? */
function nearSegment(p: Spot, a: { x: number; y: number }, b: { x: number; y: number }, r: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t <= 0 || t >= 1) return false;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < r;
}

/**
 * Snookered: the cue ball can't reach any part of any ball on in a straight line. Each target is
 * tried full-ball and at both thin edges (the cue ball's centre two radii out to either side);
 * each path must be clear of every other ball by two radii. `targets` empty (any ball) is never
 * a snooker.
 */
export function snookered(
  balls: readonly Spot[],
  cueId: string,
  targets: readonly string[],
  R: number,
): boolean {
  const cue = balls.find((b) => b.id === cueId);
  const on = balls.filter((b) => targets.includes(b.id));
  if (!cue || !on.length) return false;
  // A touch short of two radii, so balls just kissing the line don't count as in the way.
  const clear = 2 * R * 0.98;
  for (const t of on) {
    const dx = t.x - cue.x;
    const dy = t.y - cue.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return false;
    const ux = dx / d;
    const uy = dy / d;
    const others = balls.filter((b) => b.id !== cue.id && b.id !== t.id);
    // Where the cue ball's centre is at contact: full ball, and grazing either side.
    // (-uy, ux) is square to the line of aim.
    const ends = [
      { x: t.x - 2 * R * ux, y: t.y - 2 * R * uy },
      { x: t.x - 2 * R * uy, y: t.y + 2 * R * ux },
      { x: t.x + 2 * R * uy, y: t.y - 2 * R * ux },
    ];
    for (const end of ends) if (!others.some((o) => nearSegment(o, cue, end, clear))) return false;
  }
  return true;
}

export interface ShotContext {
  /** You were snookered before the shot. */
  snookeredBefore: boolean;
  /** The other player comes to the table snookered (and without ball in hand). */
  leftSnookered: boolean;
  /** Ball radius. */
  R: number;
}

export interface Feats {
  /** In words, for the HUD: "Plant!", "Escaped the snooker". */
  names: string[];
  xp: Partial<Ratings>;
}

/** The fancy parts of one of your shots, and the XP they earn on top of shotXp's. */
export function shotFeats(rec: ShotRecord, events: readonly PhysicsEvent[], ctx: ShotContext): Feats {
  const names: string[] = [];
  const xp: Partial<Ratings> = {};
  const add = (a: Attr, n: number) => (xp[a] = (xp[a] ?? 0) + n);
  if (rec.fouls.length || rec.isBreak) return { names, xp };
  const cue = rec.shot.ball;
  const at = (id: string): Spot | null => {
    const b = rec.before.find(([x]) => x === id);
    return b && b.length === 3 ? { id, x: b[1], y: b[2] } : null;
  };

  if (ctx.snookeredBefore && rec.firstHit) {
    names.push('Escaped the snooker');
    add('vision', 4);
    const firstBall = events.find((e) => e.type === 'ball')?.t ?? Infinity;
    const kicked = events.some(
      (e) => e.type === 'cushion' && e.kind === 'rail' && e.ball === cue && e.t < firstBall,
    );
    // Off the cushion, or bent round the ball in the way.
    add(kicked ? 'cushion' : 'spin', 8);
  }

  // How each potted ball got there: the first ball to touch it.
  let combo = false;
  let plant = false;
  let cannon = false;
  for (const id of rec.potted) {
    const drop = events.find((e) => e.type === 'pocket' && e.ball === id)?.t ?? Infinity;
    const hit = events.find((e) => e.type === 'ball' && (e.a === id || e.b === id) && e.t < drop);
    if (!hit || hit.type !== 'ball') continue;
    const by = hit.a === id ? hit.b : hit.a;
    if (by === cue) {
      // The cue ball reached it only after another ball: a cannon (carom) into the pocket.
      if (id !== rec.firstHit) cannon = true;
      continue;
    }
    // Struck by an object ball. Touching (or nearly) before the shot: a plant; else a combination.
    const a = at(id);
    const b = at(by);
    const close = a && b ? Math.hypot(a.x - b.x, a.y - b.y) < 2 * ctx.R * 1.25 : false;
    if (close) plant = true;
    else combo = true;
  }
  if (combo) {
    names.push('Combination!');
    add('vision', 6);
    add('cueing', 2);
  }
  if (plant) {
    names.push('Plant!');
    add('vision', 5);
    add('touch', 3);
  }
  if (cannon) {
    names.push('Cannon!');
    add('vision', 4);
    add('touch', 4);
  }

  if (ctx.leftSnookered) {
    names.push('Left them snookered');
    add('touch', 8);
    add('vision', 3);
  }
  return { names, xp };
}
