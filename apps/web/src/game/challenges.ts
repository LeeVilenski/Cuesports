import type { ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, SNOOKER_12FT, type TableSpec, type Vec2 } from '@cuesports/shared';
import { firstContact, type BallAt } from './record';

/**
 * Challenges: hand-made positions with an objective and star thresholds (the plan's
 * ChallengeSpec). Three kinds:
 *
 * - pot: pot `ball` (as a bank off a cushion, or a combination off `via`, if asked). One shot an
 *   attempt; stars for how few attempts it took.
 * - position: pot `ball` and stop the cue ball inside the target ring; stars for how close.
 * - clear: pot every object ball, playing on from where they stop; stars for how few shots.
 *
 * Scratching (or fouling the cue ball off) always ends the attempt.
 */

export type ChallengeKind = 'pot' | 'position' | 'clear';

export interface ChallengeSpec {
  id: string;
  title: string;
  /** What to do, in one line. */
  goal: string;
  /** GameDef id of the table: 'nine-ball' (9ft pool) or 'snooker'. */
  table: 'nine-ball' | 'snooker';
  /** Starting layout; the cue ball is 'cue'. */
  balls: BallAt[];
  kind: ChallengeKind;
  /** pot / position: the ball to pot. */
  ball?: string;
  /** pot: it must reach a cushion before it drops. */
  bank?: boolean;
  /** pot: the cue ball must hit this ball first (a combination). */
  via?: string;
  /** position: where the cue ball should stop, and the ring radii for 3, 2 and 1 stars (metres). */
  target?: { x: number; y: number; r: [number, number, number] };
  /** pot / position: attempts allowed. clear: shots allowed. */
  limit: number;
  /** clear: most shots for 3 and 2 stars (1 star is anything within `limit`). */
  shots?: [number, number];
}

const POOL = AMERICAN_POOL_9FT;
const R = POOL.balls.object.radius;

const pocketAt = (table: TableSpec, id: string): Vec2 => {
  const p = table.pockets.find((x) => x.id === id)!;
  return { ...p.position };
};
const unit = (a: Vec2, b: Vec2): Vec2 => {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const along = (p: Vec2, d: Vec2, t: number): Vec2 => ({ x: p.x + d.x * t, y: p.y + d.y * t });
const rot = (d: Vec2, deg: number): Vec2 => {
  const a = (deg * Math.PI) / 180;
  return { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) };
};
const at = (id: string, p: Vec2): BallAt => [id, p.x, p.y];

/** The 1 on a straight line between the cue ball and the top-right corner. */
function straight(): BallAt[] {
  const cue = { x: -0.5, y: -0.25 };
  const d = unit(cue, pocketAt(POOL, 'top-right'));
  return [at('cue', cue), at('1', along(cue, d, 0.95))];
}

/** The cue ball at (x, y) and the 1 `dist` along the line from it to the top-right corner. */
function lineToCorner(x: number, y: number, dist: number): BallAt[] {
  const cue = { x, y };
  return [at('cue', cue), at('1', along(cue, unit(cue, pocketAt(POOL, 'top-right')), dist))];
}

/** A point `t` along the same line (negative: behind the cue ball's start). */
function ringOnLine(x: number, y: number, t: number): Vec2 {
  const cue = { x, y };
  return along(cue, unit(cue, pocketAt(POOL, 'top-right')), t);
}

/** Where a firm screw shot brings the cue ball back to, along the line (measured in the physics). */
const SCREW_BACK_STOP = -0.3;

/** A cut of `deg` degrees into `pocket`, the cue ball `dist` back from the object ball. */
function cut(ball: Vec2, pocket: string, deg: number, dist: number, table = POOL, id = '1'): BallAt[] {
  const toPocket = unit(ball, pocketAt(table, pocket));
  const r = table.balls.object.radius;
  const ghost = along(ball, toPocket, -2 * r);
  const back = rot({ x: -toPocket.x, y: -toPocket.y }, deg);
  return [at('cue', along(ghost, back, dist)), at(id, ball)];
}

/** Ball 2 just short of the corner, the 1 lined up behind it, the cue ball at a slight angle. */
function combination(): BallAt[] {
  const pocket = pocketAt(POOL, 'top-right');
  const two = { x: 0.85, y: 0.3 };
  const d = unit(two, pocket);
  const ghost2 = along(two, d, -2 * R);
  const one = along(ghost2, d, -0.18);
  const d1 = unit(one, ghost2);
  const ghost1 = along(one, d1, -2 * R);
  const cue = along(ghost1, rot({ x: -d1.x, y: -d1.y }, 8), 0.6);
  return [at('cue', cue), at('1', one), at('2', two)];
}

export const CHALLENGES: ChallengeSpec[] = [
  {
    id: 'straight-in',
    title: 'Straight in',
    goal: 'Pot the 1 in the corner.',
    table: 'nine-ball',
    balls: straight(),
    kind: 'pot',
    ball: '1',
    limit: 3,
  },
  {
    id: 'thin-cut',
    title: 'The cut',
    goal: 'Cut the 1 into the top corner.',
    table: 'nine-ball',
    balls: cut({ x: 0.75, y: 0.35 }, 'top-right', 35, 0.7),
    kind: 'pot',
    ball: '1',
    limit: 3,
  },
  {
    id: 'stop-shot',
    title: 'Stop shot',
    goal: 'Pot the 1 and stop the cue ball dead, in the ring.',
    table: 'nine-ball',
    balls: lineToCorner(-0.1, -0.3, 0.55),
    kind: 'position',
    ball: '1',
    target: { ...ringOnLine(-0.1, -0.3, 0.55 - 2 * R), r: [0.05, 0.1, 0.18] },
    limit: 3,
  },
  {
    id: 'screw-back',
    title: 'Screw back',
    goal: 'Pot the 1 and draw the cue ball back into the ring.',
    table: 'nine-ball',
    balls: lineToCorner(-0.1, -0.3, 0.55),
    kind: 'position',
    ball: '1',
    target: { ...ringOnLine(-0.1, -0.3, SCREW_BACK_STOP), r: [0.1, 0.18, 0.28] },
    limit: 3,
  },
  {
    id: 'bank',
    title: 'Off the cushion',
    goal: 'Bank the 1 off a cushion and into a pocket.',
    table: 'nine-ball',
    balls: [
      ['cue', -0.35, 0.15],
      ['1', 0.15, 0.42],
    ],
    kind: 'pot',
    ball: '1',
    bank: true,
    limit: 3,
  },
  {
    id: 'combination',
    title: 'Combination',
    goal: 'Hit the 1 first and pot the 2 with it.',
    table: 'nine-ball',
    balls: combination(),
    kind: 'pot',
    ball: '2',
    via: '1',
    limit: 3,
  },
  {
    id: 'three-balls',
    title: 'Three in a row',
    goal: 'Pot all three balls. Fewer shots, more stars.',
    table: 'nine-ball',
    balls: [
      ['cue', -0.6, 0],
      ['1', 0.95, 0.45],
      ['2', 0.95, -0.45],
      ['3', 0, 0.5],
    ],
    kind: 'clear',
    limit: 6,
    shots: [3, 4],
  },
  {
    id: 'long-red',
    title: 'Long red',
    goal: 'Pot the red the length of a snooker table.',
    table: 'snooker',
    balls: (() => {
      const cue = { x: -1.15, y: -0.45 };
      const d = unit(cue, pocketAt(SNOOKER_12FT, 'top-right'));
      return [at('cue', cue), at('red1', along(cue, d, 2.3))];
    })(),
    kind: 'pot',
    ball: 'red1',
    limit: 3,
  },
];

// ---------------------------------------------------------------------------------------------
// Playing one

export interface ChallengeRun {
  /** Attempts started (pot, position) and shots played (clear). */
  attempt: number;
  shots: number;
}

export type Verdict =
  | { status: 'continue'; message: string }
  /** The attempt failed but there are more: the table is set up again. */
  | { status: 'retry'; message: string }
  | { status: 'won'; stars: 1 | 2 | 3; message: string }
  | { status: 'failed'; message: string };

const potted = (result: ShotResult): string[] =>
  result.events.flatMap((e) => (e.type === 'pocket' ? [e.ball] : []));

/** Whether `ball` touched a rail before dropping. */
function banked(result: ShotResult, ball: string): boolean {
  for (const e of result.events) {
    if (e.type === 'cushion' && e.ball === ball && e.kind === 'rail') return true;
    if (e.type === 'pocket' && e.ball === ball) return false;
  }
  return false;
}

const starsFor = (value: number, limits: readonly number[]): 0 | 1 | 2 | 3 =>
  value <= limits[0]! ? 3 : value <= limits[1]! ? 2 : value <= limits[2]! ? 1 : 0;

/** Judges one shot of a challenge. `run` is updated: the shot (and a new attempt) are counted. */
export function judgeChallenge(spec: ChallengeSpec, run: ChallengeRun, result: ShotResult): Verdict {
  run.shots++;
  const down = potted(result);
  const scratched =
    down.includes('cue') || result.final.some((b) => b.id === 'cue' && b.state === 'pocketed');
  const again = (why: string): Verdict => {
    if (spec.kind === 'clear' || run.attempt >= spec.limit)
      return { status: 'failed', message: `${why} Out of ${spec.kind === 'clear' ? 'shots' : 'attempts'}.` };
    run.attempt++;
    return { status: 'retry', message: `${why} Attempt ${run.attempt} of ${spec.limit}.` };
  };
  if (scratched)
    return spec.kind === 'clear'
      ? { status: 'failed', message: 'Scratch: the cue ball went in.' }
      : again('Scratch.');

  if (spec.kind === 'clear') {
    const left = result.final.filter((b) => b.id !== 'cue' && b.state !== 'pocketed').length;
    if (left === 0) {
      const [three, two] = spec.shots ?? [spec.limit, spec.limit];
      const stars = run.shots <= three ? 3 : run.shots <= two ? 2 : 1;
      return { status: 'won', stars, message: `Cleared in ${run.shots} shot${run.shots === 1 ? '' : 's'}.` };
    }
    if (run.shots >= spec.limit) return { status: 'failed', message: `Out of shots: ${left} left.` };
    return { status: 'continue', message: `${left} to go · shot ${run.shots + 1} of ${spec.limit}.` };
  }

  const ball = spec.ball!;
  if (!down.includes(ball)) return again(`Missed the ${ball.replace(/\d+$/, '')}.`);
  if (spec.via && firstContact(result, 'cue') !== spec.via) return again(`Hit the ${spec.via} first.`);
  if (spec.bank && !banked(result, ball)) return again('It has to come off a cushion.');

  if (spec.kind === 'pot') {
    const stars = (4 - Math.min(3, run.attempt)) as 1 | 2 | 3;
    return {
      status: 'won',
      stars,
      message: run.attempt === 1 ? 'First time!' : `Done on attempt ${run.attempt}.`,
    };
  }
  const cue = result.final.find((b) => b.id === 'cue')!;
  const t = spec.target!;
  const miss = Math.hypot(cue.pos.x - t.x, cue.pos.y - t.y);
  const stars = starsFor(miss, t.r);
  if (!stars) return again(`Potted, but ${Math.round(miss * 100)}cm from the ring.`);
  return { status: 'won', stars, message: `${Math.round(miss * 100)}cm from the centre.` };
}

export const newRun = (): ChallengeRun => ({ attempt: 1, shots: 0 });

// ---------------------------------------------------------------------------------------------
// Stars

const STARS_KEY = 'cuesports.challengeStars';

export function loadStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STARS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/** Keeps the best stars for a challenge; returns true if this improved on them. */
export function recordStars(id: string, stars: number): boolean {
  const all = loadStars();
  if (stars <= (all[id] ?? 0)) return false;
  all[id] = stars;
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(all));
  } catch {
    // Not kept; fine for this session.
  }
  return true;
}

export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);
