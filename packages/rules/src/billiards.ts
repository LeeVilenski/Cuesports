import { cloneBall, makeBall, type BallState, type ShotResult } from '@cuesports/physics';
import { SNOOKER_12FT, type Rng, type Vec2 } from '@cuesports/shared';
import { headStringX, spotBall, spotFree, spotOf, theD } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * English Billiards (WPBSA rules, the parts that matter in play):
 * - Three balls on a snooker table: each player's cue ball (plain white 'cue' and yellow
 *   'spot') and the red. The red starts on the billiard spot (the black's spot).
 * - Scoring: a cannon (the cue ball hits both other balls) 2; potting the red 3; potting the
 *   opponent's white 2; an in-off (the cue ball goes into a pocket after hitting a ball) 3 off the
 *   red, 2 off the white (by whichever it hit first). A stroke can score several of these.
 * - A scoring stroke continues the turn. A potted red is spotted again (billiard spot, then the
 *   pyramid spot, then the centre spot; after two pots in a row from the billiard spot it goes to
 *   the centre spot). The striker's ball, after an in-off, is in hand in the D. A potted opponent's
 *   white stays off until that player's turn, when they play from the D.
 * - In hand, the striker may not play directly at a ball in baulk: the cue ball must leave baulk
 *   (or hit a cushion out of baulk) before touching one.
 * - Fouls (a miss, the cue ball off the table, playing at a ball in baulk from hand) give the
 *   opponent 2 points, and the opponent plays next from the D.
 * - Limits: no more than 15 hazards (pots and in-offs) in a row without a cannon, and no more
 *   than 75 cannons in a row; reaching either ends the turn.
 * - The game is to a points target (100 by default).
 */

export interface BilliardsOptions {
  target: number;
}

export interface BilliardsState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  hazards: number;
  cannons: number;
  /** Consecutive pots of the red from the billiard spot. */
  redFromSpot: number;
  /** Where the red was last spotted from (to count pots from the spot). */
  redOnSpot: boolean;
  /** The striker is playing from hand (their ball was off the table). */
  inHand: boolean;
}

export const BALL_OF = ['cue', 'spot'] as const;
export const HAZARD_LIMIT = 15;
export const CANNON_LIMIT = 75;
export const FOUL_POINTS = 2;

const table = SNOOKER_12FT;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;

export function billiardSpot(): Vec2 {
  return spotOf(table, 'black')!;
}

/** Spots the red: billiard spot, else pyramid spot, else centre spot (or straight to centre). */
function spotRed(balls: BallState[], centreFirst: boolean): boolean {
  const order = centreFirst ? ['blue', 'pink', 'black'] : ['black', 'pink', 'blue'];
  for (const id of order) {
    const p = spotOf(table, id)!;
    if (spotFree(balls, 'red', p)) {
      spotBall(table, balls, 'red', p);
      return id === 'black';
    }
  }
  spotBall(table, balls, 'red', spotOf(table, 'blue')!);
  return false;
}

function turnFor(player: Seat, balls: readonly BallState[]): Turn {
  const mine = balls.find((b) => b.id === BALL_OF[player])!;
  return {
    player,
    cueBall: BALL_OF[player],
    ballInHand: mine.state === 'pocketed' ? 'in-d' : 'none',
    targets: [],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: false,
    fouls: 0,
  };
}

/** Puts a ball out of play (picked up), to come back in hand. */
function pickUp(b: BallState): void {
  b.state = 'pocketed';
  delete b.pocket;
  b.vel = { x: 0, y: 0 };
  b.spin = { x: 0, y: 0, z: 0 };
}

export interface BilliardsFacts {
  first: string | null;
  cannon: boolean;
  /** The other balls the cue ball touched, in order. */
  touched: string[];
  inOff: boolean;
  offTable: boolean;
  potted: string[];
  /** The cue ball touched a cushion before any ball (for playing at a ball in baulk from hand). */
  cushionFirst: boolean;
}

export function billiardsFacts(result: ShotResult, cue: string): BilliardsFacts {
  const touched: string[] = [];
  let inOff = false;
  let offTable = false;
  const potted: string[] = [];
  let cushionFirst = false;
  for (const e of result.events) {
    if (e.type === 'ball' && (e.a === cue || e.b === cue)) {
      const o = e.a === cue ? e.b : e.a;
      if (!touched.includes(o)) touched.push(o);
    } else if (e.type === 'cushion' && e.ball === cue && touched.length === 0) {
      if (e.kind !== 'pocket') cushionFirst = true;
    } else if (e.type === 'pocket') {
      if (e.ball === cue) inOff = true;
      else potted.push(e.ball);
    } else if (e.type === 'off-table') {
      if (e.ball === cue) offTable = true;
      else potted.push(e.ball);
    }
  }
  return {
    first: touched[0] ?? null,
    cannon: touched.length >= 2,
    touched,
    inOff: inOff && touched.length > 0,
    offTable,
    potted,
    cushionFirst,
  };
}

/** Points a stroke scores, with the parts named for the HUD. */
export function strokePoints(f: BilliardsFacts, opponentBall: string): { points: number; parts: string[] } {
  let points = 0;
  const parts: string[] = [];
  if (f.cannon) {
    points += 2;
    parts.push('cannon');
  }
  if (f.potted.includes('red')) {
    points += 3;
    parts.push('pot red');
  }
  if (f.potted.includes(opponentBall)) {
    points += 2;
    parts.push('pot white');
  }
  if (f.inOff) {
    const off = f.first === 'red' ? 3 : 2;
    points += off;
    parts.push(f.first === 'red' ? 'in-off red' : 'in-off white');
  }
  return { points, parts };
}

export const ENGLISH_BILLIARDS: Ruleset<BilliardsState, BilliardsOptions> = {
  id: 'english-billiards',
  name: 'English Billiards',
  table,
  players: { min: 2, max: 2 },
  options: [{ id: 'target', label: 'Points to win', type: 'number', default: 50, min: 50, max: 500 }],
  defaults: { target: 50 },

  newFrame(_opts: BilliardsOptions, _rng: Rng, breaker: number) {
    const d = theD(table)!;
    const cue = makeBall('cue', table.balls.cue, { x: d.centre.x, y: -d.radius / 2 });
    const spot = makeBall('spot', table.balls.cue, { x: d.centre.x, y: d.radius / 2 });
    const red = makeBall('red', table.balls.object, billiardSpot());
    pickUp(cue);
    pickUp(spot);
    const balls = [cue, spot, red];
    const state: BilliardsState = {
      phase: 'play',
      shooter: seat(breaker),
      scores: [0, 0],
      break: 0,
      hazards: 0,
      cannons: 0,
      redFromSpot: 0,
      redOnSpot: true,
      inHand: true,
    };
    return { balls, state, turn: turnFor(seat(breaker), balls) };
  },

  judge(
    s: BilliardsState,
    _decl: ShotDeclaration,
    before: BallState[],
    result: ShotResult,
    opts: BilliardsOptions,
  ) {
    const me = s.shooter;
    const cue = BALL_OF[me];
    const theirs = BALL_OF[other(me)];
    const balls = result.final.map(cloneBall);
    const state: BilliardsState = { ...s, scores: [...s.scores] as [number, number] };
    const f = billiardsFacts(result, cue);
    const fouls: Foul[] = [];

    const baulk = headStringX(table);
    if (!f.first) fouls.push({ code: 'no-contact', message: 'Missed both balls' });
    else if (f.offTable) fouls.push({ code: 'off-table', message: 'Cue ball off the table' });
    else if (s.inHand) {
      // From hand, a ball in baulk can't be hit directly: the cue ball must come off a cushion first.
      const target = before.find((b) => b.id === f.first);
      if (target && target.pos.x < baulk && !f.cushionFirst)
        fouls.push({ code: 'wrong-ball-first', message: 'Played directly at a ball in baulk from hand' });
    }

    const redBefore = before.find((b) => b.id === 'red')!;
    const wasOnSpot =
      s.redOnSpot &&
      Math.hypot(redBefore.pos.x - billiardSpot().x, redBefore.pos.y - billiardSpot().y) < 1e-6;

    // Balls that went down or off.
    const myBall = balls.find((b) => b.id === cue)!;
    const theirBall = balls.find((b) => b.id === theirs)!;
    const red = balls.find((b) => b.id === 'red')!;
    if (myBall.state === 'pocketed') pickUp(myBall);
    if (theirBall.state === 'pocketed') pickUp(theirBall);
    const potted = f.potted.filter((id) => id !== cue);

    if (fouls.length) {
      if (red.state === 'pocketed') state.redOnSpot = spotRed(balls, false);
      state.scores[other(me)] += FOUL_POINTS;
      // The incoming player plays from the D.
      pickUp(myBall);
      const next = other(me);
      pickUp(balls.find((b) => b.id === BALL_OF[next])!);
      return finish(
        state,
        next,
        balls,
        fouls,
        potted,
        `Foul: ${fouls[0]!.message.toLowerCase()}. ${FOUL_POINTS} to ${name(next)}.`,
        opts,
      );
    }

    const { points, parts } = strokePoints(f, theirs);
    if (red.state === 'pocketed') {
      const twice = wasOnSpot && s.redFromSpot + 1 >= 2;
      state.redFromSpot = wasOnSpot ? s.redFromSpot + 1 : 0;
      state.redOnSpot = spotRed(balls, twice);
      if (twice) state.redFromSpot = 0;
    } else {
      state.redOnSpot =
        state.redOnSpot && Math.hypot(red.pos.x - billiardSpot().x, red.pos.y - billiardSpot().y) < 1e-6;
    }

    if (points === 0) {
      state.break = 0;
      state.hazards = 0;
      state.cannons = 0;
      const next = other(me);
      return finish(state, next, balls, [], potted, `No score. ${name(next)} to play.`, opts);
    }

    state.scores[me] += points;
    state.break += points;
    const hazard = f.inOff || potted.length > 0;
    state.hazards = f.cannon ? (hazard ? 1 : 0) : state.hazards + (hazard ? 1 : 0);
    state.cannons = f.cannon && !hazard ? state.cannons + 1 : 0;
    const desc = `${parts.join(' + ')}: ${points}. Break ${state.break}.`;
    if (state.hazards >= HAZARD_LIMIT || state.cannons >= CANNON_LIMIT) {
      const limit = state.hazards >= HAZARD_LIMIT ? `${HAZARD_LIMIT} hazards` : `${CANNON_LIMIT} cannons`;
      state.break = 0;
      state.hazards = 0;
      state.cannons = 0;
      return finish(
        state,
        other(me),
        balls,
        [],
        potted,
        `${desc} That's ${limit} in a row: ${name(other(me))} to play.`,
        opts,
      );
    }
    return finish(state, me, balls, [], potted, desc, opts);
  },

  decide(s, _choice, balls) {
    return {
      state: s,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(s.shooter, balls),
      frame: null,
      message: '',
      points: [...s.scores],
    };
  },
};

function finish(
  state: BilliardsState,
  next: Seat,
  balls: BallState[],
  fouls: Foul[],
  potted: string[],
  message: string,
  opts: BilliardsOptions,
): Judgement<BilliardsState> {
  const me = state.shooter;
  if (next !== me) {
    state.break = 0;
    state.hazards = 0;
    state.cannons = 0;
  }
  state.shooter = next;
  state.inHand = balls.find((b) => b.id === BALL_OF[next])!.state === 'pocketed';
  const winner = state.scores.findIndex((p) => p >= opts.target);
  const frame = winner >= 0 ? { winner, reason: `${name(winner)} reaches ${opts.target}` } : null;
  if (frame) state.phase = 'over';
  return {
    state,
    balls,
    fouls,
    potted,
    turn: turnFor(next, balls),
    frame,
    message,
    points: [...state.scores],
  };
}
