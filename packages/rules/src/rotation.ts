import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, type Rng, type TableSpec } from '@cuesports/shared';
import { numberedOnTable, shotFacts, type ShotFacts } from './analysis';
import { footSpot, headStringX, spotBall } from './placement';
import type { BallInHand, Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Rotation games under WPA world standardised rules: 9-ball and 10-ball.
 *
 * Common to both:
 * - Break from behind the head string. A legal break hits the 1 first and either pots a ball or
 *   drives at least four object balls to a cushion; otherwise it is a foul.
 * - Every shot must hit the lowest ball first, then pot a ball or send any ball to a cushion.
 * - After any foul the incoming player has ball in hand anywhere.
 * - The player who shoots straight after a legal break may push out. The opponent then chooses to
 *   play from there or pass the shot back.
 * - The game ball potted on a foul or push out, or knocked off the table, is spotted. No other ball
 *   is ever spotted.
 * - Three consecutive fouls by the same player lose the rack (an option, on by default).
 *
 * 9-ball: the 9 potted on any legal shot wins, including on the break.
 *
 * 10-ball: every shot after the break is called (ball and pocket) or declared a safety. A called
 * ball in its called pocket keeps the shooter at the table. A ball potted without being called (or
 * in the wrong pocket) is not a foul, but the turn passes and the incoming player chooses to play
 * from there or pass the shot back. The 10 wins only when called and potted on a legal shot; on the
 * break, or uncalled, it is spotted.
 *
 * Messages use {p0} and {p1} for the players' names.
 */

export type RotationPhase = 'break' | 'first-shot' | 'push-response' | 'option-response' | 'play' | 'over';

export interface RotationState {
  phase: RotationPhase;
  shooter: number;
  /** Consecutive fouls per player in this rack. */
  fouls: [number, number];
  ballInHand: BallInHand;
}

export interface RotationOptions {
  threeFoulRule: boolean;
  /** Object balls that must reach a cushion on a break that pots nothing. */
  breakRailBalls: number;
}

/** @deprecated use RotationState */
export type NineBallState = RotationState;
/** @deprecated use RotationOptions */
export type NineBallOptions = RotationOptions;
export type NineBallPhase = RotationPhase;

interface RotationGame {
  id: string;
  name: string;
  gameBall: string;
  /** Ball ids in rack order (rows from the apex), with '?' for a random ball. */
  rows: number[];
  rackOrder: string[];
  callShot: boolean;
  /** The game ball potted on a legal break wins (9-ball) or is spotted (10-ball). */
  winsOnBreak: boolean;
}

const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;

function rack(table: TableSpec, rng: Rng, game: RotationGame): BallState[] {
  const fixed = new Set(game.rackOrder.filter((x) => x !== '?'));
  const rest: string[] = [];
  const total = game.rows.reduce((a, b) => a + b, 0);
  for (let n = 1; n <= total; n++) if (!fixed.has(String(n))) rest.push(String(n));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  let k = 0;
  const ids = game.rackOrder.map((x) => (x === '?' ? rest[k++]! : x));
  const balls = rackRows(ids, table.balls.object, footSpot(table), game.rows, { rng });
  balls.push(makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.25, y: 0 }));
  return balls;
}

function turnFor(
  game: RotationGame,
  state: RotationState,
  balls: readonly BallState[],
  decision: Turn['decision'] = null,
): Turn {
  const lowest = numberedOnTable(balls)[0];
  return {
    player: state.shooter,
    ballInHand: state.ballInHand,
    targets: lowest ? [lowest] : [],
    canPushOut: state.phase === 'first-shot',
    mustCall: game.callShot && (state.phase === 'play' || state.phase === 'first-shot'),
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

function describeFoul(f: Foul['code'], facts: ShotFacts, lowest: string | undefined): string {
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

const POCKET_NAMES: Record<string, string> = {
  'top-left': 'top-left corner',
  'top-right': 'top-right corner',
  'bottom-left': 'bottom-left corner',
  'bottom-right': 'bottom-right corner',
  'top-side': 'top side',
  'bottom-side': 'bottom side',
};
export const pocketName = (id: string): string => POCKET_NAMES[id] ?? id;

function makeRotation(game: RotationGame): Ruleset<RotationState, RotationOptions> {
  const ruleset: Ruleset<RotationState, RotationOptions> = {
    id: game.id,
    name: game.name,
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
      const balls = rack(ruleset.table, rng, game);
      const state: RotationState = {
        phase: 'break',
        shooter: breaker,
        fouls: [0, 0],
        ballInHand: 'behind-head-string',
      };
      return { balls, state, turn: turnFor(game, state, balls) };
    },

    judge(state, decl: ShotDeclaration, before, result: ShotResult, opts): Judgement<RotationState> {
      const table = ruleset.table;
      const facts = shotFacts(result);
      const balls = result.final.map(cloneBall);
      const lowest = numberedOnTable(before)[0];
      const shooter = state.shooter;
      const isBreak = state.phase === 'break';
      const pushOut = !!decl.pushOut && state.phase === 'first-shot';
      const g = game.gameBall;
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
      const potted = facts.potted;
      const gameBallIn = potted.includes(g);
      const calling = game.callShot && !isBreak && !pushOut;
      const call = decl.call;
      const calledOk =
        calling &&
        !decl.safety &&
        call !== undefined &&
        potted.includes(call.ball) &&
        facts.pocketOf.get(call.ball) === call.pocket;
      let message: string;

      // Winning: the game ball potted on a legal shot (called, in 10-ball).
      const wins =
        gameBallIn &&
        !fouled &&
        !pushOut &&
        (game.callShot ? calledOk && call!.ball === g : isBreak ? game.winsOnBreak : true);
      if (wins) {
        const next: RotationState = { ...state, phase: 'over' };
        return {
          state: next,
          balls,
          fouls: [],
          potted,
          turn: turnFor(game, next, balls),
          frame: { winner: shooter, reason: isBreak ? 'golden break' : `potted the ${g}` },
          message: isBreak
            ? `Golden break! ${name(shooter)} wins the rack.`
            : `${name(shooter)} pots the ${g} and wins the rack.`,
        };
      }
      // Otherwise a game ball that went down or off the table comes back to the foot spot.
      if (gameBallIn || facts.offTable.includes(g)) spotBall(table, balls, g, footSpot(table));

      const foulCount: [number, number] = [...state.fouls];
      foulCount[shooter] = fouled ? (foulCount[shooter] ?? 0) + 1 : 0;
      const foulList: Foul[] = fouls.map((code) => ({ code, message: describeFoul(code, facts, lowest) }));

      if (fouled && opts.threeFoulRule && (foulCount[shooter] ?? 0) >= 3) {
        const next: RotationState = { ...state, phase: 'over', fouls: foulCount };
        foulList.push({ code: 'three-fouls', message: describeFoul('three-fouls', facts, lowest) });
        return {
          state: next,
          balls,
          fouls: foulList,
          potted,
          turn: turnFor(game, next, balls),
          frame: { winner: other(shooter), reason: 'three fouls' },
          message: `Third foul in a row: ${name(other(shooter))} wins the rack.`,
        };
      }

      let next: RotationState;
      let decision: Turn['decision'] = null;
      const firstShot = isBreak ? 'first-shot' : 'play';
      if (fouled) {
        returnCueBall(table, balls);
        next = { phase: 'play', shooter: other(shooter), fouls: foulCount, ballInHand: 'anywhere' };
        message = `Foul: ${foulList[0]!.message}. ${name(other(shooter))} has ball in hand.`;
        if (foulCount[shooter] === 2 && opts.threeFoulRule) message += ` ${name(shooter)} is on two fouls.`;
      } else if (pushOut) {
        next = { phase: 'push-response', shooter: other(shooter), fouls: foulCount, ballInHand: 'none' };
        decision = {
          prompt: `${name(shooter)} pushed out. ${name(other(shooter))}: play from here, or pass the shot back?`,
          choices: [
            { id: 'play', label: 'Play from here' },
            { id: 'pass', label: 'Pass back' },
          ],
        };
        message = `${name(shooter)} pushes out.`;
      } else if (calling && decl.safety) {
        next = { phase: 'play', shooter: other(shooter), fouls: foulCount, ballInHand: 'none' };
        message = `${name(shooter)} plays safe. ${name(other(shooter))} to play.`;
      } else if (calling && potted.length > 0 && !calledOk) {
        // 10-ball: a ball went in that was not called. The incoming player has the option.
        next = { phase: 'option-response', shooter: other(shooter), fouls: foulCount, ballInHand: 'none' };
        const what = call
          ? `didn't pot the ${call.ball} in the ${pocketName(call.pocket)}`
          : `potted the ${potted.join(', ')} without calling it`;
        decision = {
          prompt: `${name(shooter)} ${what}. ${name(other(shooter))}: play from here, or pass the shot back?`,
          choices: [
            { id: 'play', label: 'Play from here' },
            { id: 'pass', label: 'Pass back' },
          ],
        };
        message = `${name(shooter)} ${what}.`;
      } else if (potted.length > 0) {
        next = { phase: firstShot, shooter, fouls: foulCount, ballInHand: 'none' };
        message = calledOk
          ? `${name(shooter)} potted the ${call!.ball} as called and plays again.`
          : `${name(shooter)} potted the ${potted.join(', ')} and plays again.`;
      } else {
        next = { phase: firstShot, shooter: other(shooter), fouls: foulCount, ballInHand: 'none' };
        message = `${name(other(shooter))} to play.`;
      }
      if (next.phase === 'first-shot') message += ` ${name(next.shooter)} may push out.`;

      return {
        state: next,
        balls,
        fouls: foulList,
        potted,
        turn: turnFor(game, next, balls, decision),
        frame: null,
        message,
      };
    },

    decide(state, choice, balls) {
      if (state.phase !== 'push-response' && state.phase !== 'option-response') {
        throw new Error('No decision is pending');
      }
      const shooter = choice === 'pass' ? other(state.shooter) : state.shooter;
      const next: RotationState = { ...state, phase: 'play', shooter, ballInHand: 'none' };
      return {
        state: next,
        balls: balls.map(cloneBall),
        fouls: [],
        potted: [],
        turn: turnFor(game, next, balls),
        frame: null,
        message:
          choice === 'pass' ? `Passed back: ${name(shooter)} to play.` : `${name(shooter)} plays from here.`,
      };
    },
  };
  return ruleset;
}

export const NINE_BALL = makeRotation({
  id: 'nine-ball',
  name: '9-ball',
  gameBall: '9',
  rows: [1, 2, 3, 2, 1],
  // 1 at the apex, 9 in the middle.
  rackOrder: ['1', '?', '?', '?', '9', '?', '?', '?', '?'],
  callShot: false,
  winsOnBreak: true,
});

export const TEN_BALL = makeRotation({
  id: 'ten-ball',
  name: '10-ball',
  gameBall: '10',
  rows: [1, 2, 3, 4],
  // 1 at the apex, 10 in the middle of the third row.
  rackOrder: ['1', '?', '?', '?', '10', '?', '?', '?', '?', '?'],
  callShot: true,
  winsOnBreak: false,
});
