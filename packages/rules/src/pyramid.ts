import { cloneBall, layout, type BallState, type ShotResult } from '@cuesports/physics';
import { PYRAMID_12FT, type Rng } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { footSpot, spotBall } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Russian Pyramid, Neva rules (Nevskaya), the commonest club form:
 * - Fifteen white balls racked with the apex on the foot spot, and one coloured cue ball ('pcue')
 *   played from behind the head string on the break.
 * - Every ball potted counts 1, and so does the cue ball going in off a ball it has hit; after an
 *   in-off the cue ball is in hand behind the head string. A scoring shot continues the turn.
 * - A shot must hit a ball and then either pot one or send a ball to a cushion. Otherwise, or with
 *   a ball off the table, it is a foul: the offender loses a point (scores can go below zero) and
 *   balls potted on the stroke are spotted on the foot spot. The turn passes.
 * - The first player to 8 wins.
 *
 * Not yet: the Free (American) and Moscow variants, where any ball may be the cue ball.
 */

export interface PyramidOptions {
  target: number;
}

export interface PyramidState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  inHand: boolean;
  opening: boolean;
}

export const PYRAMID_CUE = 'pcue';
const table = PYRAMID_12FT;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;

function turnFor(player: number, inHand: boolean, opening: boolean): Turn {
  return {
    player,
    cueBall: PYRAMID_CUE,
    ballInHand: inHand ? 'behind-head-string' : 'none',
    targets: [],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: opening,
    fouls: 0,
  };
}

export const RUSSIAN_PYRAMID: Ruleset<PyramidState, PyramidOptions> = {
  id: 'pyramid',
  name: 'Russian Pyramid',
  table,
  players: { min: 2, max: 2 },
  options: [{ id: 'target', label: 'Balls to win', type: 'number', default: 8, min: 3, max: 8 }],
  defaults: { target: 8 },

  newFrame(_opts, rng: Rng, breaker) {
    const balls = layout(table, 'pyramid', Math.floor(rng.next() * 1e6));
    const state: PyramidState = {
      phase: 'play',
      shooter: seat(breaker),
      scores: [0, 0],
      break: 0,
      inHand: true,
      opening: true,
    };
    return { balls, state, turn: turnFor(breaker, true, true) };
  },

  judge(s, _decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const balls = result.final.map(cloneBall);
    const f = shotFacts(result, PYRAMID_CUE);
    const state: PyramidState = { ...s, scores: [...s.scores] as [number, number], opening: false };
    const fouls: Foul[] = [];
    if (!f.firstContact) fouls.push({ code: 'no-contact', message: 'Missed every ball' });
    else if (f.offTable.length) fouls.push({ code: 'off-table', message: 'A ball left the table' });
    else if (!f.potted.length && !f.cueScratch && !f.railAfterContact)
      fouls.push({ code: 'no-rail', message: 'No ball potted or sent to a cushion' });

    const cue = balls.find((b) => b.id === PYRAMID_CUE)!;
    const cueDown = cue.state === 'pocketed';
    if (cueDown) {
      // Back in hand behind the head string (the game places it).
      cue.vel = { x: 0, y: 0 };
      cue.spin = { x: 0, y: 0, z: 0 };
    }
    const potted = [...f.potted];

    if (fouls.length) {
      for (const id of [...potted, ...f.offTable]) spotBall(table, balls, id, footSpot(table));
      state.scores[me] -= 1;
      state.break = 0;
      state.shooter = other(me);
      state.inHand = cueDown;
      return done(
        state,
        balls,
        fouls,
        `Foul: ${fouls[0]!.message.toLowerCase()}. ${name(me)} loses a point.`,
        opts,
      );
    }

    const points = potted.length + (cueDown ? 1 : 0);
    if (points === 0) {
      state.break = 0;
      state.shooter = other(me);
      state.inHand = false;
      return done(state, balls, [], `No score. ${name(other(me))} to play.`, opts);
    }
    state.scores[me] += points;
    state.break += points;
    state.inHand = cueDown;
    const what = [potted.length ? `${potted.length} potted` : '', cueDown ? 'in-off' : '']
      .filter(Boolean)
      .join(' + ');
    return done(state, balls, [], `${what}: ${points}. ${state.scores[me]} of ${opts.target}.`, opts, potted);
  },

  decide(s, _choice, balls) {
    return {
      state: s,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(s.shooter, s.inHand, s.opening),
      frame: null,
      message: '',
      points: [...s.scores],
    };
  },
};

function done(
  state: PyramidState,
  balls: BallState[],
  fouls: Foul[],
  message: string,
  opts: PyramidOptions,
  potted: string[] = [],
): Judgement<PyramidState> {
  const winner = state.scores.findIndex((p) => p >= opts.target);
  if (winner >= 0) state.phase = 'over';
  return {
    state,
    balls,
    fouls,
    potted,
    turn: turnFor(state.shooter, state.inHand, false),
    frame: winner >= 0 ? { winner, reason: `${name(winner)} pots ${opts.target}` } : null,
    message,
    points: [...state.scores],
  };
}
