import { cloneBall, makeBall, type BallState, type ShotResult } from '@cuesports/physics';
import { SNOOKER_12FT, type Rng } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { spotBall, spotOf, theD } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Slosh (Russian billiards, Indian pool), from the Wikipedia article and the Canadian Russian
 * billiards rules:
 * - The cue ball and the six snooker colours on their spots, on a snooker table. The first shot is
 *   from the D and must be played towards the black: the first ball hit must be the pink or the
 *   black (the pink stands in front of the black, so the black itself can't be hit first).
 * - Potting a colour scores its value (yellow 2 … black 7), but each colour may only go in its own
 *   pockets: yellow, green and brown in the two baulk corners; blue in the middle pockets; pink in
 *   any corner; black in the two top corners. A cannon (the cue ball hitting two colours) scores 2.
 *   Colours always go back on their spots. A scoring shot continues the turn.
 * - Fouls (a colour in the wrong pocket, an in-off, a miss, a ball off the table, the opening shot
 *   not hitting the black first) cost the striker the value of the ball involved, 2 for a miss or an
 *   in-off; the turn passes, and after an in-off the next player plays from the D.
 * - The game ends on exactly 100. A player who goes past 100 drops back to 50 and carries on.
 *
 * Not yet: the 30-minute time limit, and three or four players.
 */

export interface SloshOptions {
  target: number;
}

export interface SloshState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  inHand: boolean;
  opening: boolean;
}

export const SLOSH_COLOURS = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'] as const;
const VALUE: Record<string, number> = { yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };
const BAULK = ['bottom-left', 'top-left'];
const TOP = ['bottom-right', 'top-right'];
const MIDDLE = ['bottom-side', 'top-side'];
/** The pockets each colour may be potted in. */
export const SLOSH_POCKETS: Record<string, string[]> = {
  yellow: BAULK,
  green: BAULK,
  brown: BAULK,
  blue: MIDDLE,
  pink: [...BAULK, ...TOP],
  black: TOP,
};

const table = SNOOKER_12FT;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;

function turnFor(s: SloshState): Turn {
  return {
    player: s.shooter,
    ballInHand: s.inHand ? 'in-d' : 'none',
    targets: s.opening ? ['pink', 'black'] : [],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: s.opening,
    fouls: 0,
  };
}

export const SLOSH: Ruleset<SloshState, SloshOptions> = {
  id: 'slosh',
  name: 'Slosh',
  table,
  players: { min: 2, max: 2 },
  options: [],
  defaults: { target: 100 },

  newFrame(_opts, _rng: Rng, breaker) {
    const d = theD(table)!;
    const balls = [
      ...SLOSH_COLOURS.map((c) => makeBall(c, table.balls.object, spotOf(table, c)!)),
      makeBall('cue', table.balls.cue, { x: d.centre.x - 0.05, y: 0.12 }),
    ];
    const state: SloshState = {
      phase: 'play',
      shooter: seat(breaker),
      scores: [0, 0],
      break: 0,
      inHand: true,
      opening: true,
    };
    return { balls, state, turn: turnFor(state) };
  },

  judge(s, _decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const balls = result.final.map(cloneBall);
    const f = shotFacts(result);
    const state: SloshState = { ...s, scores: [...s.scores] as [number, number], opening: false };
    const touched = new Set<string>();
    for (const e of result.events)
      if (e.type === 'ball' && (e.a === 'cue' || e.b === 'cue')) touched.add(e.a === 'cue' ? e.b : e.a);

    const fouls: Foul[] = [];
    let penalty = 0;
    const foul = (code: Foul['code'], message: string, value: number) => {
      fouls.push({ code, message });
      penalty = Math.max(penalty, value);
    };
    if (!f.firstContact) foul('no-contact', 'Missed every ball', 2);
    else if (s.opening && f.firstContact !== 'black' && f.firstContact !== 'pink')
      foul(
        'wrong-ball-first',
        'The first shot must be played towards the black (the pink or black first)',
        VALUE[f.firstContact] ?? 2,
      );
    if (f.cueScratch) foul('scratch', 'In-off', 2);
    for (const id of f.offTable) foul('off-table', `The ${id} left the table`, VALUE[id] ?? 2);
    const good: string[] = [];
    for (const id of f.potted) {
      if (SLOSH_POCKETS[id]?.includes(f.pocketOf.get(id) ?? '')) good.push(id);
      else foul('wrong-ball-potted', `The ${id} went in the wrong pocket`, VALUE[id] ?? 2);
    }
    // Every colour goes back on its spot.
    for (const id of [...f.potted, ...f.offTable]) spotBall(table, balls, id, spotOf(table, id)!);

    const cue = balls.find((b) => b.id === 'cue')!;
    if (fouls.length) {
      state.scores[me] -= penalty;
      state.break = 0;
      state.shooter = other(me);
      state.inHand = cue.state === 'pocketed';
      return done(
        state,
        balls,
        fouls,
        `Foul: ${fouls[0]!.message.toLowerCase()}. ${name(me)} loses ${penalty}.`,
        opts,
      );
    }

    const points = good.reduce((n, id) => n + VALUE[id]!, 0) + (touched.size >= 2 ? 2 : 0);
    if (!points) {
      state.break = 0;
      state.shooter = other(me);
      state.inHand = false;
      return done(state, balls, [], `No score. ${name(other(me))} to play.`, opts);
    }
    state.scores[me] += points;
    state.break += points;
    state.inHand = false;
    let msg = `${points}: ${state.scores[me]}.`;
    if (state.scores[me] > opts.target) {
      state.scores[me] = opts.target / 2;
      msg = `${points} takes ${name(me)} past ${opts.target}: back to ${opts.target / 2}.`;
    }
    return done(state, balls, [], msg, opts, good);
  },

  decide(s, _choice, balls) {
    return {
      state: s,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(s),
      frame: null,
      message: '',
      points: [...s.scores],
    };
  },
};

function done(
  state: SloshState,
  balls: BallState[],
  fouls: Foul[],
  message: string,
  opts: SloshOptions,
  potted: string[] = [],
): Judgement<SloshState> {
  const winner = state.scores.findIndex((p) => p === opts.target);
  if (winner >= 0) state.phase = 'over';
  return {
    state,
    balls,
    fouls,
    potted,
    turn: turnFor(state),
    frame: winner >= 0 ? { winner, reason: `${name(winner)} finishes on exactly ${opts.target}` } : null,
    message,
    points: [...state.scores],
  };
}
