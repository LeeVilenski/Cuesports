import type { MatchGame } from './match';

/**
 * Pressure: how big the ball you're on is, from the rules and the score. A frame or rack ball (the
 * 9, the 10, the black, the pot that puts a snooker frame out of reach, the last points of a
 * points game) is a pressure ball, more so when you're on the hill and most when it's for the
 * match. The stakes of the event scale it (a pub semi-final is nothing next to a final at the
 * arena), and Nerve decides how much of it you feel.
 */

export interface PressureInput {
  game: MatchGame;
  /** Balls the shooter must hit first (empty: any). */
  targets: readonly string[];
  /** Object balls still on the table. */
  onTable: readonly string[];
  /** Racks or frames won: yours first. */
  score: readonly [number, number];
  raceTo: number;
  /** Points games and snooker: points in this frame or game, yours first. */
  points?: readonly [number, number] | undefined;
  /** Snooker: points left on the table. */
  remaining?: number | null | undefined;
  /** Points games: the target. */
  target?: number | undefined;
}

const SNOOKER_VALUE: Record<string, number> = { yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };
const snookerValue = (id: string) => (id.startsWith('red') ? 1 : (SNOOKER_VALUE[id] ?? 0));

const MONEY: Partial<Record<MatchGame, string>> = {
  'nine-ball': '9',
  'ten-ball': '10',
  english: '8',
  'chinese-8ball': '8',
};

/** How much this ball decides the rack or frame: 1 for a frame ball, less for one close to it. */
export function ballStakes(p: PressureInput): number {
  const money = MONEY[p.game];
  if (money) {
    if (p.targets.length === 1 && p.targets[0] === money) return 1;
    // One or two balls before the money ball: the run-out is on.
    const left = p.onTable.filter((b) => b !== money).length;
    if (p.onTable.includes(money) && left <= 2 && (p.targets.length === 0 || !p.targets.includes(money)))
      return left <= 1 ? 0.5 : 0.3;
    return 0;
  }
  if (p.game === 'snooker' && p.points) {
    const [me, them] = p.points;
    const remaining = p.remaining ?? 0;
    // Already out of reach: nothing riding on it.
    if (me - them > remaining) return 0;
    // The ball on is worth its value (a red: one, and then the black is on).
    const on = p.targets.length ? Math.max(...p.targets.map(snookerValue)) : 7;
    const value = p.targets.some((t) => t.startsWith('red')) ? 1 : on;
    if (me + value - them > remaining - value) return 1;
    if (me + value + 7 > them + remaining - value - 7 && remaining <= 27) return 0.5;
    return 0;
  }
  if (p.points && p.target) {
    const need = p.target - p.points[0];
    if (need <= 1) return 1;
    if (need <= Math.max(2, Math.ceil(p.target * 0.1))) return 0.5;
    return 0;
  }
  return 0;
}

/** Pressure on the shot, 0–1, before the stakes and your Nerve. */
export function situation(p: PressureInput): number {
  const big = ballStakes(p);
  const hill = p.score[0] >= p.raceTo - 1;
  const theirHill = p.score[1] >= p.raceTo - 1;
  const decider = hill && theirHill;
  const raw = big * (hill ? 1 : 0.55) + (decider ? 0.15 : 0);
  return Math.min(1, raw);
}

/** The stakes of a career match: by tier (pub 0 … arena 3) and how close to the final it is. */
export function stakes(tier: number, roundsLeft: number): number {
  const round = roundsLeft <= 1 ? 0.25 : roundsLeft === 2 ? 0.1 : 0;
  return Math.min(1, 0.35 + 0.2 * tier + round);
}

/** What you feel of it: Nerve 99 shrugs off most of it. */
export function felt(pressure: number, nerve: number): number {
  return pressure * (1 - 0.85 * ((Math.max(1, Math.min(99, nerve)) - 1) / 98));
}

/** In words, for the HUD. */
export function pressureLabel(p: number): string | null {
  return p >= 0.6 ? 'Big pressure' : p >= 0.3 ? 'Pressure' : p >= 0.12 ? 'Nervy' : null;
}

/**
 * The aim's slow sway under pressure (radians): two slow waves, so it never looks mechanical.
 * Up to about a third of a degree at full pressure.
 */
export function sway(t: number, p: number): number {
  const amp = ((0.35 * Math.PI) / 180) * p;
  return amp * (0.6 * Math.sin(1.3 * t) + 0.4 * Math.sin(3.1 * t + 1));
}
