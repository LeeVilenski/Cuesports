import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, type Rng, type Vec2 } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { footSpot, headStringX, spotBall, spotOf } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Straight pool (14.1 continuous), WPA rules:
 * - Every shot is called (ball and pocket) or declared a safety. If the called ball goes in its
 *   pocket, every ball potted on the shot scores a point and the shooter continues. Otherwise any
 *   balls potted are spotted, nothing scores, and the turn passes.
 * - When one object ball is left (and the cue ball), the other 14 are racked again with the apex
 *   space empty and play continues. If the 15th ball is in the rack area it goes on the head spot;
 *   if the cue ball is, it comes back in hand behind the head string.
 * - The opening break must pot a called ball, or drive two object balls and the cue ball to a
 *   cushion; otherwise it costs 2 points. Other fouls cost 1 point (scores can go below zero), and
 *   a third foul in a row costs a further 15.
 * - A foul gives the incoming player ball in hand behind the head string if the cue ball was
 *   potted, otherwise they play it where it lies.
 * - The game is to a points target (100 by default).
 */

export interface StraightOptions {
  target: number;
}

export interface StraightState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  fouls: [number, number];
  opening: boolean;
  inHand: boolean;
}

const table = AMERICAN_POOL_9FT;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;
const IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
const liveObjects = (balls: readonly BallState[]) =>
  balls.filter((b) => b.id !== 'cue' && b.state !== 'pocketed');

function turnFor(s: StraightState): Turn {
  return {
    player: s.shooter,
    ballInHand: s.inHand ? 'behind-head-string' : 'none',
    targets: [],
    canPushOut: false,
    mustCall: true,
    decision: null,
    isBreak: s.opening,
    fouls: s.fouls[s.shooter],
  };
}

/** Rack positions with the apex on the foot spot: 15 spots, apex first. */
function rackSpots(): Vec2[] {
  const spec = table.balls.object;
  return rackRows(IDS, spec, footSpot(table), [1, 2, 3, 4, 5], { jitter: 0 }).map((b) => b.pos);
}

/** Racks 14 balls again, leaving the apex empty; the last ball and the cue ball move if in the way. */
export function rerack14(balls: BallState[]): { cueInHand: boolean } {
  const spots = rackSpots();
  const R = table.balls.object.radius;
  const area = (p: Vec2) => spots.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 2 * R);
  const last = liveObjects(balls)[0];
  if (last && area(last.pos)) spotBall(table, balls, last.id, spotOf(table, 'head')!);
  const cue = balls.find((b) => b.id === 'cue')!;
  const cueInHand = cue.state !== 'pocketed' && area(cue.pos);
  if (cueInHand) cue.state = 'pocketed';
  let k = 1;
  for (const b of balls) {
    if (b.id === 'cue' || b.id === last?.id || b.state !== 'pocketed') continue;
    const p = spots[k++]!;
    Object.assign(b, { state: 'stationary', pos: { ...p }, vel: { x: 0, y: 0 }, spin: { x: 0, y: 0, z: 0 } });
    delete b.pocket;
  }
  return { cueInHand };
}

export const STRAIGHT_POOL: Ruleset<StraightState, StraightOptions> = {
  id: 'straight-pool',
  name: 'Straight pool',
  table,
  players: { min: 2, max: 2 },
  options: [{ id: 'target', label: 'Points to win', type: 'number', default: 100, min: 25, max: 150 }],
  defaults: { target: 100 },

  newFrame(_opts, rng: Rng, breaker) {
    const balls = rackRows(IDS, table.balls.object, footSpot(table), [1, 2, 3, 4, 5], { rng });
    balls.push(makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.1, y: 0.05 }));
    const state: StraightState = {
      phase: 'play',
      shooter: seat(breaker),
      scores: [0, 0],
      break: 0,
      fouls: [0, 0],
      opening: true,
      inHand: true,
    };
    return { balls, state, turn: turnFor(state) };
  },

  judge(s, decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const balls = result.final.map(cloneBall);
    const f = shotFacts(result);
    const state: StraightState = {
      ...s,
      scores: [...s.scores] as [number, number],
      fouls: [...s.fouls] as [number, number],
      opening: false,
    };
    const call = decl.call;
    const calledOk = !!call && !decl.safety && f.pocketOf.get(call.ball) === call.pocket;
    const fouls: Foul[] = [];
    let penalty = 1;
    if (s.opening && !calledOk) {
      const cueRail = result.events.some((e) => e.type === 'cushion' && e.ball === 'cue');
      if (f.objectBallsToRail < 2 || !cueRail) {
        fouls.push({
          code: 'illegal-break',
          message: 'The break needs two balls and the cue ball to a cushion',
        });
        penalty = 2;
      }
    }
    if (!fouls.length) {
      if (f.cueScratch) fouls.push({ code: 'scratch', message: 'The cue ball went in' });
      else if (!f.firstContact) fouls.push({ code: 'no-contact', message: 'Missed every ball' });
      else if (f.offTable.length) fouls.push({ code: 'off-table', message: 'A ball left the table' });
      else if (!f.potted.length && !f.railAfterContact)
        fouls.push({ code: 'no-rail', message: 'No ball potted or sent to a cushion' });
    }

    const cue = balls.find((b) => b.id === 'cue')!;
    const scoring = calledOk && !fouls.length;
    // Balls that don't score go back on the foot spot.
    if (!scoring) for (const id of [...f.potted, ...f.offTable]) spotBall(table, balls, id, footSpot(table));

    if (fouls.length) {
      state.fouls[me] += 1;
      let extra = '';
      if (state.fouls[me] >= 3) {
        penalty += 15;
        state.fouls[me] = 0;
        extra = ' Third foul in a row: 15 more off.';
      }
      state.scores[me] -= penalty;
      state.break = 0;
      state.shooter = other(me);
      state.inHand = cue.state === 'pocketed';
      return done(
        state,
        balls,
        fouls,
        `Foul: ${fouls[0]!.message.toLowerCase()}. ${name(me)} loses ${penalty}.${extra}`,
        opts,
      );
    }
    state.fouls[me] = 0;

    if (!scoring) {
      state.break = 0;
      state.shooter = other(me);
      state.inHand = false;
      const msg = decl.safety
        ? `Safety. ${name(other(me))} to play.`
        : f.potted.length
          ? `Not the called ball and pocket: spotted. ${name(other(me))} to play.`
          : `Missed. ${name(other(me))} to play.`;
      return done(state, balls, [], msg, opts);
    }

    const points = f.potted.length;
    state.scores[me] += points;
    state.break += points;
    state.inHand = false;
    let msg = `${points === 1 ? `The ${call!.ball}` : `${points} balls`}: run ${state.break}.`;
    if (liveObjects(balls).length === 1) {
      const { cueInHand } = rerack14(balls);
      state.inHand = cueInHand;
      msg += ' Fourteen balls racked again.';
    }
    return done(state, balls, [], msg, opts, f.potted);
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
  state: StraightState,
  balls: BallState[],
  fouls: Foul[],
  message: string,
  opts: StraightOptions,
  potted: string[] = [],
): Judgement<StraightState> {
  const winner = state.scores.findIndex((p) => p >= opts.target);
  if (winner >= 0) state.phase = 'over';
  return {
    state,
    balls,
    fouls,
    potted,
    turn: turnFor(state),
    frame: winner >= 0 ? { winner, reason: `${name(winner)} reaches ${opts.target}` } : null,
    message,
    points: [...state.scores],
  };
}
