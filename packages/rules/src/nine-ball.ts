import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, type Rng, type TableSpec } from '@cuesports/shared';
import { numberedOnTable, shotFacts } from './analysis';
import { footSpot, headStringX, spotBall } from './placement';
import type { BallInHand, Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * 9-ball under WPA world standardised rules:
 * - Rack: 1 on the foot spot at the apex, 9 in the middle, the rest at random.
 * - Break from behind the head string. A legal break hits the 1 first and either pots a ball or
 *   drives at least four object balls to a cushion; otherwise it is a foul.
 * - Every shot must hit the lowest ball first, then pot a ball or send any ball to a cushion.
 * - After any foul the incoming player has ball in hand anywhere.
 * - The player who shoots straight after a legal break may push out. The opponent then chooses to
 *   play from there or pass the shot back.
 * - Potting the 9 legally wins, including on the break. A 9 potted on a foul or push out, or knocked
 *   off the table, is spotted. No other ball is ever spotted.
 * - Three consecutive fouls by the same player lose the rack (an option, on by default).
 *
 * Messages use {p0} and {p1} for the players' names.
 */

export type NineBallPhase = 'break' | 'first-shot' | 'push-response' | 'play' | 'over';

export interface NineBallState {
  phase: NineBallPhase;
  shooter: number;
  /** Consecutive fouls per player in this rack. */
  fouls: [number, number];
  ballInHand: BallInHand;
}

export interface NineBallOptions {
  threeFoulRule: boolean;
  /** Object balls that must reach a cushion on a break that pots nothing. */
  breakRailBalls: number;
}

const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;

function rack(table: TableSpec, rng: Rng): BallState[] {
  const middle = ['2', '3', '4', '5', '6', '7', '8'];
  for (let i = middle.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [middle[i], middle[j]] = [middle[j]!, middle[i]!];
  }
  // Rows of the diamond: 1 | a b | c 9 d | e f | g
  const ids = ['1', middle[0]!, middle[1]!, middle[2]!, '9', middle[3]!, middle[4]!, middle[5]!, middle[6]!];
  const balls = rackRows(ids, table.balls.object, footSpot(table), [1, 2, 3, 2, 1], { rng });
  balls.push(makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.25, y: 0 }));
  return balls;
}

function turnFor(state: NineBallState, balls: readonly BallState[], decision: Turn['decision'] = null): Turn {
  const lowest = numberedOnTable(balls)[0];
  return {
    player: state.shooter,
    ballInHand: state.ballInHand,
    targets: lowest ? [lowest] : [],
    canPushOut: state.phase === 'first-shot',
    decision,
    isBreak: state.phase === 'break',
    fouls: state.fouls[state.shooter] ?? 0,
  };
}

/** Puts a potted cue ball back on the table (on the head spot, or nearby) for ball in hand. */
function returnCueBall(table: TableSpec, balls: BallState[]): void {
  const cue = balls.find((b) => b.id === 'cue');
  if (cue && cue.state === 'pocketed') spotBall(table, balls, 'cue', { x: headStringX(table), y: 0 });
}

function describeFoul(
  f: Foul['code'],
  facts: ReturnType<typeof shotFacts>,
  lowest: string | undefined,
): string {
  switch (f) {
    case 'scratch':
      return 'the cue ball went in';
    case 'no-contact':
      return 'the cue ball hit nothing';
    case 'wrong-ball-first':
      return `hit the ${facts.firstContact} first (needed the ${lowest})`;
    case 'no-rail':
      return 'no ball reached a cushion after contact';
    case 'off-table':
      return 'a ball left the table';
    case 'illegal-break':
      return 'illegal break: nothing potted and fewer than four balls reached a cushion';
    case 'three-fouls':
      return 'three fouls in a row';
  }
}

export const NINE_BALL: Ruleset<NineBallState, NineBallOptions> = {
  id: 'nine-ball',
  name: '9-ball',
  table: AMERICAN_POOL_9FT,
  players: { min: 2, max: 2 },
  options: [
    { id: 'threeFoulRule', label: 'Three fouls in a row lose the rack', type: 'boolean', default: true },
    {
      id: 'breakRailBalls',
      label: 'Balls to a cushion for a legal break',
      type: 'number',
      default: 4,
      min: 0,
      max: 9,
    },
  ],
  defaults: { threeFoulRule: true, breakRailBalls: 4 },

  newFrame(_opts, rng, breaker) {
    const balls = rack(this.table, rng);
    const state: NineBallState = {
      phase: 'break',
      shooter: breaker,
      fouls: [0, 0],
      ballInHand: 'behind-head-string',
    };
    return { balls, state, turn: turnFor(state, balls) };
  },

  judge(state, decl: ShotDeclaration, before, result: ShotResult, opts): Judgement<NineBallState> {
    const facts = shotFacts(result);
    const balls = result.final.map(cloneBall);
    const lowest = numberedOnTable(before)[0];
    const shooter = state.shooter;
    const isBreak = state.phase === 'break';
    const pushOut = !!decl.pushOut && state.phase === 'first-shot';
    const fouls: Foul['code'][] = [];

    if (facts.cueScratch) fouls.push('scratch');
    if (!pushOut) {
      if (!facts.firstContact) fouls.push('no-contact');
      else if (facts.firstContact !== lowest) fouls.push('wrong-ball-first');
      else if (!isBreak && facts.potted.length === 0 && !facts.railAfterContact) fouls.push('no-rail');
    }
    if (facts.offTable.length) fouls.push('off-table');
    if (
      isBreak &&
      fouls.length === 0 &&
      facts.potted.length === 0 &&
      facts.objectBallsToRail < opts.breakRailBalls
    ) {
      fouls.push('illegal-break');
    }

    const fouled = fouls.length > 0;
    const nineIn = facts.potted.includes('9');
    const nineOff = facts.offTable.includes('9');
    const potted = facts.potted;
    let message: string;

    // A legally potted 9 wins the rack.
    if (nineIn && !fouled && !pushOut) {
      const next: NineBallState = { ...state, phase: 'over' };
      return {
        state: next,
        balls,
        fouls: [],
        potted,
        turn: turnFor(next, balls),
        frame: { winner: shooter, reason: isBreak ? 'golden break' : 'potted the 9' },
        message: isBreak
          ? `Golden break! ${name(shooter)} wins the rack.`
          : `${name(shooter)} pots the 9 and wins the rack.`,
      };
    }
    // Otherwise a 9 that went down or off the table comes back to the foot spot.
    if (nineIn || nineOff) spotBall(this.table, balls, '9', footSpot(this.table));

    const foulCount: [number, number] = [...state.fouls];
    foulCount[shooter] = fouled ? (foulCount[shooter] ?? 0) + 1 : 0;
    const foulList: Foul[] = fouls.map((code) => ({ code, message: describeFoul(code, facts, lowest) }));

    if (fouled && opts.threeFoulRule && (foulCount[shooter] ?? 0) >= 3) {
      const next: NineBallState = { ...state, phase: 'over', fouls: foulCount };
      foulList.push({ code: 'three-fouls', message: describeFoul('three-fouls', facts, lowest) });
      return {
        state: next,
        balls,
        fouls: foulList,
        potted,
        turn: turnFor(next, balls),
        frame: { winner: other(shooter), reason: 'three fouls' },
        message: `Third foul in a row: ${name(other(shooter))} wins the rack.`,
      };
    }

    let next: NineBallState;
    let decision: Turn['decision'] = null;
    if (fouled) {
      returnCueBall(this.table, balls);
      next = { phase: 'play', shooter: other(shooter), fouls: foulCount, ballInHand: 'anywhere' };
      message = `Foul: ${foulList[0]!.message}. ${name(other(shooter))} has ball in hand.`;
      if (foulCount[shooter] === 2 && opts.threeFoulRule) message += ` ${name(shooter)} is on two fouls.`;
    } else if (pushOut) {
      next = { phase: 'push-response', shooter: other(shooter), fouls: foulCount, ballInHand: 'none' };
      decision = {
        prompt: `${name(shooter)} pushed out. ${name(other(shooter))}: play from here, or pass the shot back?`,
        choices: [
          { id: 'play', label: 'Play from here' },
          { id: 'pass', label: `Pass back` },
        ],
      };
      message = `${name(shooter)} pushes out.`;
    } else if (potted.length > 0) {
      next = { phase: isBreak ? 'first-shot' : 'play', shooter, fouls: foulCount, ballInHand: 'none' };
      message = `${name(shooter)} potted the ${potted.join(', ')} and plays again.`;
    } else {
      next = {
        phase: isBreak ? 'first-shot' : 'play',
        shooter: other(shooter),
        fouls: foulCount,
        ballInHand: 'none',
      };
      message = `${name(other(shooter))} to play.`;
    }
    if (next.phase === 'first-shot') message += ` ${name(next.shooter)} may push out.`;

    return {
      state: next,
      balls,
      fouls: foulList,
      potted,
      turn: turnFor(next, balls, decision),
      frame: null,
      message,
    };
  },

  decide(state, choice, balls) {
    if (state.phase !== 'push-response') throw new Error('No decision is pending');
    const shooter = choice === 'pass' ? other(state.shooter) : state.shooter;
    const next: NineBallState = { ...state, phase: 'play', shooter, ballInHand: 'none' };
    return {
      state: next,
      balls: balls.map(cloneBall),
      fouls: [],
      potted: [],
      turn: turnFor(next, balls),
      frame: null,
      message:
        choice === 'pass' ? `Passed back: ${name(shooter)} to play.` : `${name(shooter)} plays from here.`,
    };
  },
};
