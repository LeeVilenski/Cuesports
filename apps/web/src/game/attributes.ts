import type { PhysicsEvent, ShotInput } from '@cuesports/physics';
import type { MatchGame } from './match';
import type { ShotRecord } from './record';

/**
 * Your career player: six attributes rated 1–99, the XP behind each one, a player level with skill
 * points to spend, and a familiarity with each game. They only change career matches and career
 * training. At 99 (and full familiarity) you play exactly as in quick play: no extra error, the
 * full spin and elevation range and the longest guide.
 */

export type Attr = 'vision' | 'nerve' | 'cueing' | 'spin' | 'cushion' | 'rest' | 'touch';

export const ATTRS: { id: Attr; label: string; low: string; trained: string }[] = [
  {
    id: 'vision',
    label: 'Vision',
    low: 'Guide lines: object ball, cue ball, spin, then cushion rebounds',
    trained: 'Pots, and position shots that leave a pot',
  },
  {
    id: 'nerve',
    label: 'Composure',
    low: 'Your guide lines on money and frame balls: none at first',
    trained: 'Pressure balls potted, deciders and matches won',
  },
  {
    id: 'cueing',
    label: 'Cueing',
    low: 'How much power you can put into a shot',
    trained: 'Long pots and good runs',
  },
  {
    id: 'spin',
    label: 'Spin',
    low: 'How far from centre you can strike',
    trained: 'Pots with screw, follow or side',
  },
  {
    id: 'cushion',
    label: 'Cushion craft',
    low: 'Your guide lines with the cue ball on the cushion, or the cue raised over a ball or the rail: none at first',
    trained: 'Pots off the cushion, banks, kicks and escapes',
  },
  {
    id: 'rest',
    label: 'Rest play',
    low: 'Your guide lines on the rest or the spider: none at first',
    trained: 'Pots made on the rest or the spider',
  },
  {
    id: 'touch',
    label: 'Touch',
    low: 'How well the guide allows for side pushing the cue ball off line',
    trained: 'Safeties and soft pots',
  },
];

export type Ratings = Record<Attr, number>;

export interface CareerPlayer {
  ratings: Ratings;
  /** XP towards each attribute's next point. */
  xp: Ratings;
  level: number;
  /** XP towards the next level. */
  levelXp: number;
  /** Skill points to spend. */
  points: number;
  /** 0–100 per game. */
  familiarity: Partial<Record<MatchGame, number>>;
}

/** The situational skills (Composure, Cushion craft, Rest play) start at 1: no lines on those shots. */
export const START: Ratings = { vision: 1, nerve: 1, cueing: 15, spin: 10, cushion: 1, rest: 1, touch: 15 };

const zero = (): Ratings => ({ vision: 0, nerve: 0, cueing: 0, spin: 0, cushion: 0, rest: 0, touch: 0 });

export const newPlayer = (): CareerPlayer => ({
  ratings: { ...START },
  xp: zero(),
  level: 1,
  levelXp: 0,
  points: 0,
  familiarity: {},
});

/** Your ceiling, from the highest tier open to you: 40 at the pub, 60 at the clubs, 80 in the halls, 99 at the arena. */
export const ceilingFor = (topTier: number): number => [40, 60, 80, 99][Math.max(0, Math.min(3, topTier))]!;

/** XP for the next point of an attribute rated r: each point costs a little more than the last. */
export const pointCost = (r: number): number => 8 + r;

/** XP for the next level. */
export const levelCost = (level: number): number => 100 + 40 * level;

/** Adds XP to attributes, raising each one as far as the ceiling allows. Returns the new player and what went up. */
export function addXp(
  p: CareerPlayer,
  gains: Partial<Ratings>,
  ceiling: number,
): { player: CareerPlayer; ups: { attr: Attr; from: number; to: number }[] } {
  const ratings = { ...p.ratings };
  const xp = { ...p.xp };
  const ups: { attr: Attr; from: number; to: number }[] = [];
  for (const { id } of ATTRS) {
    const g = Math.max(0, Math.round(gains[id] ?? 0));
    if (!g) continue;
    const from = ratings[id];
    xp[id] += g;
    while (ratings[id] < ceiling && xp[id] >= pointCost(ratings[id])) {
      xp[id] -= pointCost(ratings[id]);
      ratings[id]++;
    }
    // At the ceiling the XP waits (up to one point's worth) for the ceiling to rise.
    if (ratings[id] >= ceiling) xp[id] = Math.min(xp[id], pointCost(ratings[id]));
    if (ratings[id] > from) ups.push({ attr: id, from, to: ratings[id] });
  }
  return { player: { ...p, ratings, xp }, ups };
}

/** Adds player-level XP: each level gives a skill point. */
export function addLevelXp(p: CareerPlayer, amount: number): { player: CareerPlayer; levels: number } {
  let { level, levelXp, points } = p;
  levelXp += Math.max(0, Math.round(amount));
  let levels = 0;
  while (levelXp >= levelCost(level)) {
    levelXp -= levelCost(level);
    level++;
    points++;
    levels++;
  }
  return { player: { ...p, level, levelXp, points }, levels };
}

/** Spends a skill point on an attribute (if there is one, and the ceiling allows). */
export function spendPoint(p: CareerPlayer, attr: Attr, ceiling: number): CareerPlayer {
  if (p.points <= 0 || p.ratings[attr] >= ceiling) return p;
  return { ...p, points: p.points - 1, ratings: { ...p.ratings, [attr]: p.ratings[attr] + 1 } };
}

/** Playing a match in a game: familiarity rises quickly at first, then slowly. */
export function playedGame(p: CareerPlayer, game: MatchGame): CareerPlayer {
  const f = p.familiarity[game] ?? 0;
  return {
    ...p,
    familiarity: { ...p.familiarity, [game]: Math.min(100, Math.round(f + 10 * (1 - f / 100))) },
  };
}

/** At the end of an event, every other game slips a little. */
export function rust(p: CareerPlayer, except: MatchGame): CareerPlayer {
  const familiarity = { ...p.familiarity };
  for (const k of Object.keys(familiarity) as MatchGame[])
    if (k !== except) familiarity[k] = Math.max(0, familiarity[k]! - 1);
  return { ...p, familiarity };
}

/** A rating as it plays in a game: unfamiliar games play below your ratings (×0.8 at none, ×1 at 100). */
export function effective(p: CareerPlayer, game: MatchGame): Ratings {
  const f = 0.8 + (0.2 * (p.familiarity[game] ?? 0)) / 100;
  const r = zero();
  for (const { id } of ATTRS) r[id] = Math.max(1, Math.min(99, (p.ratings[id] ?? START[id]) * f));
  return r;
}

// ---------------------------------------------------------------------------------------------
// How the ratings change the shot

export interface VisionTuning {
  /** Length of the object-ball line in metres (0: none). */
  object: number;
  /** Length of the cue-ball line after contact (0: none). */
  cue: number;
  /** The cue-ball line allows for the spin (stun, screw, follow). */
  spinAware: boolean;
  /** Lines carry on past the first cushion. */
  rebound: boolean;
}

/**
 * What your ratings change about a shot. Nothing here is random: the ball goes where you aim it.
 * Low ratings show you less (the guide) and let you do less (power, spin, elevation), and those
 * limits are always visible.
 */
export interface ShotTuning {
  vision: VisionTuning;
  /** Most power you can put into a shot, 0–1 of the power bar (Cueing). */
  maxPower: number;
  /** How much of the squirt from side the guide allows for, 0–1 (Touch). */
  squirt: number;
  /** Furthest tip offset from centre, as a fraction of the radius. */
  maxTip: number;
  /** Highest cue elevation you can play, in degrees. */
  maxElevation: number;
  /** The pressure on this shot (0–1). */
  felt: number;
  /** The skill setting the guide on this shot. */
  lines: Attr;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/** The guide for a rating (0 lengths are not drawn). */
export function visionTuning(v: number): VisionTuning {
  let t: VisionTuning;
  // No object-ball line at first; it grows from Vision 3 a few centimetres at a time.
  if (v < 3) t = { object: 0, cue: 0, spinAware: false, rebound: false };
  else if (v < 35) t = { object: lerp(0.03, 0.35, (v - 3) / 32), cue: 0, spinAware: false, rebound: false };
  else if (v < 60)
    t = {
      object: lerp(0.35, 0.6, (v - 35) / 25),
      cue: lerp(0.05, 0.25, (v - 35) / 25),
      spinAware: false,
      rebound: false,
    };
  else if (v < 80)
    t = {
      object: lerp(0.6, 0.8, (v - 60) / 20),
      cue: lerp(0.25, 0.5, (v - 60) / 20),
      spinAware: true,
      rebound: false,
    };
  else
    t = {
      object: lerp(0.8, 1.2, (v - 80) / 19),
      cue: lerp(0.5, 0.8, (v - 80) / 19),
      spinAware: true,
      rebound: true,
    };
  return t;
}

/** The full range the normal game allows. */
export const FULL_TIP = 0.52;
export const FULL_ELEVATION = 60;

/** Everything the ratings change about a shot, for one game. */
/** The kind of shot it is: a money ball, on the rest or spider, off the cushion or over a ball. */
export interface ShotSituation {
  /** Pressure on the ball (pressure.ts), 0–1. A pressure ball from 0.25. */
  pressure?: number;
  /** On the rest or the spider. */
  rest?: boolean;
  /** Cue ball on the cushion, or the cue raised to clear the rail or a ball. */
  cushion?: boolean;
}

/** A pressure ball: from here, Composure sets your lines. */
export const PRESSURE_BALL = 0.25;

/**
 * The skill that sets your guide on this shot: Vision normally, and on a hard shot the lower of
 * Vision and that shot's own skill (Composure on a money ball, Cushion craft off the cushion or over
 * a ball, Rest play on the rest), so each of those shots starts with no lines after contact.
 */
export function lineSkill(r: Ratings, sit: ShotSituation): { rating: number; by: Attr } {
  let best: { rating: number; by: Attr } = { rating: r.vision, by: 'vision' };
  const limit = (by: Attr) => {
    if (r[by] < best.rating) best = { rating: r[by], by };
  };
  if ((sit.pressure ?? 0) >= PRESSURE_BALL) limit('nerve');
  if (sit.cushion) limit('cushion');
  if (sit.rest) limit('rest');
  return best;
}

export function shotTuning(
  p: CareerPlayer,
  game: MatchGame,
  sit: ShotSituation = {},
  /** Rating points from your cue (economy.ts). */
  bonus: Partial<Ratings> = {},
): ShotTuning {
  const r = effective(p, game);
  for (const k of Object.keys(bonus) as Attr[]) r[k] = Math.max(1, Math.min(99, r[k] + (bonus[k] ?? 0)));
  const x = (a: Attr) => (r[a] - 1) / 98;
  const lines = lineSkill(r, sit);
  return {
    felt: sit.pressure ?? 0,
    lines: lines.by,
    vision: visionTuning(lines.rating),
    maxPower: lerp(0.6, 1, x('cueing')),
    squirt: x('touch'),
    maxTip: lerp(0.22, FULL_TIP, x('spin')),
    maxElevation: FULL_ELEVATION,
  };
}

/**
 * The shot kept inside your limits: the tip within your reach and the cue no higher than you can
 * raise it. (The HUD already holds you there; this is the backstop.) The aim is never touched.
 */
export function applyTuning(s: ShotInput, t: ShotTuning): ShotInput {
  const l = Math.hypot(s.tip.a, s.tip.b);
  const k = l > t.maxTip ? t.maxTip / l : 1;
  return {
    ...s,
    tip: { a: s.tip.a * k, b: s.tip.b * k },
    elevation: Math.min(s.elevation, (t.maxElevation * Math.PI) / 180),
  };
}

// ---------------------------------------------------------------------------------------------
// XP from play

/** XP earned by one of your shots in a career match. */
export function shotXp(rec: ShotRecord, events: readonly PhysicsEvent[]): Partial<Ratings> {
  const g: Partial<Ratings> = {};
  const add = (a: Attr, n: number) => (g[a] = (g[a] ?? 0) + n);
  if (rec.fouls.length || rec.isBreak) return g;
  const pots = rec.potted.length;
  const at = (id: string) => {
    const b = rec.before.find(([x]) => x === id);
    return b && b.length === 3 ? { x: b[1], y: b[2] } : null;
  };
  const cuePos = at(rec.shot.ball);
  for (const id of rec.potted) {
    add('vision', 2);
    const b = at(id);
    const long = cuePos && b ? Math.hypot(b.x - cuePos.x, b.y - cuePos.y) > 1.0 : false;
    add('cueing', long ? 4 : 1);
    // A bank: the ball reached a cushion before it dropped.
    const dropT = events.find((e) => e.type === 'pocket' && e.ball === id)?.t ?? Infinity;
    if (events.some((e) => e.type === 'cushion' && e.kind === 'rail' && e.ball === id && e.t < dropT))
      add('cushion', 5);
  }
  if (pots) {
    const { a, b } = rec.shot.tip;
    if (Math.abs(b) > 0.2 || Math.abs(a) > 0.2) add('spin', 3);
    if (rec.shot.speed < 1.2) add('touch', 2);
    if (rec.shot.elevation > 0.15) add('cushion', 2);
  } else if (rec.firstHit) add('touch', 1);
  // Cue ball to a cushion before it reached a ball (a kick or an escape), and a legal hit.
  const firstBall = events.find((e) => e.type === 'ball')?.t ?? Infinity;
  if (
    rec.firstHit &&
    events.some(
      (e) => e.type === 'cushion' && e.kind === 'rail' && e.ball === rec.shot.ball && e.t < firstBall,
    )
  )
    add('cushion', 4);
  return g;
}

/** XP for the match itself: player-level XP, and Nerve for winning it and for deciding racks. */
export function matchXp(won: boolean, deciders: number, champion: boolean): { level: number; nerve: number } {
  return { level: 30 + (won ? 40 : 0) + (champion ? 100 : 0), nerve: (won ? 8 : 2) + 10 * deciders };
}

/** Sums XP gains. */
export function sumXp(a: Partial<Ratings>, b: Partial<Ratings>): Partial<Ratings> {
  const out: Partial<Ratings> = { ...a };
  for (const k of Object.keys(b) as Attr[]) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Training

export interface Training {
  /** Challenge id. */
  id: string;
  attrs: Attr[];
}

/** Training sessions: the challenges, each working on one or two attributes. */
export const TRAINING: Training[] = [
  { id: 'straight-in', attrs: ['cueing'] },
  { id: 'thin-cut', attrs: ['vision', 'cueing'] },
  { id: 'long-red', attrs: ['cueing', 'nerve'] },
  { id: 'stop-shot', attrs: ['spin', 'touch'] },
  { id: 'screw-back', attrs: ['spin'] },
  { id: 'bank', attrs: ['cushion', 'vision'] },
  { id: 'combination', attrs: ['vision'] },
  { id: 'three-balls', attrs: ['touch', 'vision'] },
];

/** XP from a training session: something for trying, more for each star. */
export function trainingXp(t: Training, stars: number): Partial<Ratings> {
  const each = Math.round((10 + 18 * stars) / t.attrs.length);
  return Object.fromEntries(t.attrs.map((a) => [a, each]));
}

/** Rough ratings for an old career, from the highest tier it reached. */
export function migratedPlayer(topTier: number): CareerPlayer {
  const p = newPlayer();
  const cap = ceilingFor(topTier);
  const lift = 12 * topTier;
  for (const { id } of ATTRS) p.ratings[id] = Math.min(cap, START[id] + lift);
  return p;
}
