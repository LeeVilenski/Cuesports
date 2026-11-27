import { cloneBall, layout, type BallState, type ShotResult } from '@cuesports/physics';
import { PYRAMID_12FT, type Rng } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { footSpot, spotBall } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Russian Pyramid: sixteen balls, fifteen white ones racked with the apex on the foot spot and one
 * coloured ball ('pcue') that breaks from the house (behind the head string). Two rule sets:
 *
 * Free (American) pyramid, the default and the usual form in clubs and tournaments:
 * - After the break any ball may be the cue ball, the coloured one included. All sixteen are equal.
 * - Every ball potted counts 1, and so does the struck ball going in off a ball it has hit. Potted
 *   balls stay down. After an in-off the player continues with ball in hand in the house: any ball
 *   on the table is picked up and played from there. A scoring shot continues the turn.
 * - A foul passes the turn and gives the opponent ball in hand in the house; balls potted on the
 *   stroke are spotted on the foot spot.
 *
 * Neva (Nevskaya) pyramid:
 * - Only the coloured ball is ever the cue ball. An in-off counts 1 and it comes back in hand in
 *   the house.
 * - A foul costs the offender a point (scores can go below zero) and passes the turn; balls potted
 *   on the stroke are spotted on the foot spot.
 *
 * Both: a shot must hit a ball and then either pot one or send a ball to a cushion; missing every
 * ball or knocking a ball off the table is a foul. The first player to 8 wins.
 */

export interface PyramidOptions {
  target: number;
  /** Free pyramid (any ball as cue ball); false plays Neva rules. Older saves lack it: Free. */
  free?: boolean;
}

export interface PyramidState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  inHand: boolean;
  opening: boolean;
  /** The ball suggested as the cue ball next (Free pyramid: the last one struck, while it is up). */
  cue?: string;
}

export const PYRAMID_CUE = 'pcue';
const table = PYRAMID_12FT;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;
const isFree = (opts: PyramidOptions) => opts.free !== false;

function turnFor(s: PyramidState, balls: BallState[], free: boolean): Turn {
  const up = balls.filter((b) => b.state !== 'pocketed').map((b) => b.id);
  const any = free && !s.opening;
  const cue = !any
    ? PYRAMID_CUE
    : ([s.cue, PYRAMID_CUE, up[0]].find((id): id is string => !!id && up.includes(id)) ?? PYRAMID_CUE);
  return {
    player: s.shooter,
    cueBall: cue,
    ...(any ? { cueBallChoices: up } : {}),
    ballInHand: s.inHand ? 'behind-head-string' : 'none',
    targets: [],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: s.opening,
    fouls: 0,
  };
}

/** The ball the player struck (the strike event names it). */
function struckBall(result: ShotResult): string {
  for (const e of result.events) if (e.type === 'strike') return e.ball;
  return PYRAMID_CUE;
}

export const RUSSIAN_PYRAMID: Ruleset<PyramidState, PyramidOptions> = {
  id: 'pyramid',
  name: 'Russian Pyramid',
  table,
  players: { min: 2, max: 2 },
  options: [
    { id: 'target', label: 'Balls to win', type: 'number', default: 8, min: 3, max: 8 },
    { id: 'free', label: 'Free pyramid: any ball may be the cue ball', type: 'boolean', default: true },
  ],
  defaults: { target: 8, free: true },

  newFrame(opts, rng: Rng, breaker) {
    const balls = layout(table, 'pyramid', Math.floor(rng.next() * 1e6));
    const state: PyramidState = {
      phase: 'play',
      shooter: seat(breaker),
      scores: [0, 0],
      break: 0,
      inHand: true,
      opening: true,
      cue: PYRAMID_CUE,
    };
    return { balls, state, turn: turnFor(state, balls, isFree(opts)) };
  },

  judge(s, _decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const free = isFree(opts);
    const balls = result.final.map(cloneBall);
    const cueId = struckBall(result);
    const f = shotFacts(result, cueId);
    const state: PyramidState = { ...s, scores: [...s.scores] as [number, number], opening: false };
    const fouls: Foul[] = [];
    const cueOff = result.events.some((e) => e.type === 'off-table' && e.ball === cueId);
    if ((!free || s.opening) && cueId !== PYRAMID_CUE)
      fouls.push({ code: 'wrong-cue-ball', message: 'Struck the wrong ball' });
    else if (!f.firstContact) fouls.push({ code: 'no-contact', message: 'Missed every ball' });
    else if (f.offTable.length || cueOff) fouls.push({ code: 'off-table', message: 'A ball left the table' });
    else if (!f.potted.length && !f.cueScratch && !f.railAfterContact)
      fouls.push({ code: 'no-rail', message: 'No ball potted or sent to a cushion' });

    const cue = balls.find((b) => b.id === cueId)!;
    const cueDown = cue.state === 'pocketed';
    if (cueDown && !free) {
      // Back in hand behind the head string (the game places it).
      cue.vel = { x: 0, y: 0 };
      cue.spin = { x: 0, y: 0, z: 0 };
    }
    const potted = [...f.potted];

    if (fouls.length) {
      const spot = [...potted, ...f.offTable];
      // Free pyramid: a struck ball that went down on a foul is an ordinary ball and is spotted too.
      if (free && cueDown) spot.push(cueId);
      for (const id of spot) spotBall(table, balls, id, footSpot(table));
      if (!free) state.scores[me] -= 1;
      state.break = 0;
      state.shooter = other(me);
      state.inHand = free || cueDown;
      state.cue = free ? cueId : PYRAMID_CUE;
      const penalty = free
        ? `${name(other(me))} has ball in hand in the house.`
        : `${name(me)} loses a point.`;
      return done(state, balls, fouls, `Foul: ${fouls[0]!.message.toLowerCase()}. ${penalty}`, opts);
    }

    const points = potted.length + (cueDown ? 1 : 0);
    state.cue = free ? cueId : PYRAMID_CUE;
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
    const scored = free && cueDown ? [...potted, cueId] : potted;
    return done(state, balls, [], `${what}: ${points}. ${state.scores[me]} of ${opts.target}.`, opts, scored);
  },

  decide(s, _choice, balls, opts) {
    return {
      state: s,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(s, balls, isFree(opts)),
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
    turn: turnFor(state, balls, isFree(opts)),
    frame: winner >= 0 ? { winner, reason: `${name(winner)} pots ${opts.target}` } : null,
    message,
    points: [...state.scores],
  };
}
