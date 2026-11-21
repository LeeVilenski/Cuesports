import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, type Rng } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { footSpot, headStringX, spotBall } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * One-pocket, WPA rules (the core of them):
 * - Before the break the breaker chooses one of the two corner pockets at the foot of the table;
 *   the opponent gets the other. Only balls in your own pocket score for you.
 * - A ball in your pocket scores 1 and you continue. A ball in your opponent's pocket scores for
 *   them, even on your shot. Balls in the other four pockets are spotted (on the foot spot) after
 *   the shot. A shot that scores nothing for the shooter passes the turn.
 * - A legal shot hits a ball and then pots one or sends a ball to a cushion. A foul (including a
 *   scratch) costs 1 point (scores can go below zero) and gives the opponent ball in hand behind
 *   the head string if the cue ball went in; on a foul no balls score for the shooter (balls in
 *   their pocket are spotted).
 * - First to 8 wins.
 */

export interface OnePocketOptions {
  target: number;
}

export interface OnePocketState {
  phase: 'choose' | 'play' | 'over';
  shooter: number;
  scores: [number, number];
  break: number;
  /** Each player's pocket. */
  pockets: [string, string] | null;
  opening: boolean;
  inHand: boolean;
}

export const FOOT_POCKETS = ['top-right', 'bottom-right'] as const;
const table = AMERICAN_POOL_9FT;
const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;
const IDS = ['1', '9', '2', '10', '8', '3', '11', '4', '12', '5', '13', '6', '14', '7', '15'];
const LABEL: Record<string, string> = { 'top-right': 'left corner', 'bottom-right': 'right corner' };

function turnFor(s: OnePocketState): Turn {
  return {
    player: s.shooter,
    ballInHand: s.inHand ? 'behind-head-string' : 'none',
    targets: [],
    canPushOut: false,
    mustCall: false,
    decision:
      s.phase === 'choose'
        ? {
            prompt: `${name(s.shooter)}: choose your pocket (at the far end).`,
            choices: FOOT_POCKETS.map((p) => ({ id: p, label: `Far ${LABEL[p]}` })),
          }
        : null,
    isBreak: s.opening,
    fouls: 0,
  };
}

export const ONE_POCKET: Ruleset<OnePocketState, OnePocketOptions> = {
  id: 'one-pocket',
  name: 'One-pocket',
  table,
  players: { min: 2, max: 2 },
  options: [{ id: 'target', label: 'Balls to win', type: 'number', default: 8, min: 3, max: 8 }],
  defaults: { target: 8 },

  newFrame(_opts, rng: Rng, breaker) {
    const balls = rackRows(IDS, table.balls.object, footSpot(table), [1, 2, 3, 4, 5], { rng });
    balls.push(makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.1, y: 0.05 }));
    const state: OnePocketState = {
      phase: 'choose',
      shooter: breaker,
      scores: [0, 0],
      break: 0,
      pockets: null,
      opening: true,
      inHand: true,
    };
    return { balls, state, turn: turnFor(state) };
  },

  judge(s, _decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const balls = result.final.map(cloneBall);
    const f = shotFacts(result);
    const pockets = s.pockets ?? [FOOT_POCKETS[0], FOOT_POCKETS[1]];
    const state: OnePocketState = {
      ...s,
      scores: [...s.scores] as [number, number],
      opening: false,
      phase: 'play',
    };
    const fouls: Foul[] = [];
    if (f.cueScratch) fouls.push({ code: 'scratch', message: 'The cue ball went in' });
    else if (!f.firstContact) fouls.push({ code: 'no-contact', message: 'Missed every ball' });
    else if (f.offTable.length) fouls.push({ code: 'off-table', message: 'A ball left the table' });
    else if (!f.potted.length && !f.railAfterContact)
      fouls.push({ code: 'no-rail', message: 'No ball potted or sent to a cushion' });

    const mine = f.potted.filter((id) => f.pocketOf.get(id) === pockets[me] && !fouls.length);
    const theirs = f.potted.filter((id) => f.pocketOf.get(id) === pockets[other(me)]);
    const spotted = [...f.potted.filter((id) => !mine.includes(id) && !theirs.includes(id)), ...f.offTable];
    for (const id of spotted) spotBall(table, balls, id, footSpot(table));
    state.scores[me] += mine.length;
    state.scores[other(me)] += theirs.length;

    const cue = balls.find((b) => b.id === 'cue')!;
    if (fouls.length) {
      state.scores[me] -= 1;
      state.break = 0;
      state.shooter = other(me);
      state.inHand = cue.state === 'pocketed';
      return done(
        state,
        balls,
        fouls,
        `Foul: ${fouls[0]!.message.toLowerCase()}. ${name(me)} loses a point.`,
        opts,
        theirs,
      );
    }
    state.inHand = false;
    const gift = theirs.length ? ` ${theirs.length} for ${name(other(me))}.` : '';
    if (!mine.length) {
      state.break = 0;
      state.shooter = other(me);
      return done(
        state,
        balls,
        [],
        `${f.potted.length ? 'Nothing in your pocket.' : 'No score.'}${gift} ${name(other(me))} to play.`,
        opts,
        theirs,
      );
    }
    state.break += mine.length;
    return done(
      state,
      balls,
      [],
      `${mine.length} in your pocket: ${state.scores[me]} of ${opts.target}.${gift}`,
      opts,
      [...mine, ...theirs],
    );
  },

  decide(s, choice, balls) {
    const mine = choice === FOOT_POCKETS[1] ? FOOT_POCKETS[1] : FOOT_POCKETS[0];
    const theirs = mine === FOOT_POCKETS[0] ? FOOT_POCKETS[1] : FOOT_POCKETS[0];
    const pockets: [string, string] = s.shooter === 0 ? [mine, theirs] : [theirs, mine];
    const state: OnePocketState = { ...s, phase: 'play', pockets };
    return {
      state,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(state),
      frame: null,
      message: `${name(s.shooter)} takes the far ${LABEL[mine]}.`,
      points: [...s.scores],
    };
  },
};

function done(
  state: OnePocketState,
  balls: BallState[],
  fouls: Foul[],
  message: string,
  opts: OnePocketOptions,
  potted: string[],
): Judgement<OnePocketState> {
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
