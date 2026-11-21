import { cloneBall, makeBall, type BallState, type ShotResult } from '@cuesports/physics';
import { BALKLINE_47, BALKLINE_71, CAROM_10FT, type Rng, type TableSpec } from '@cuesports/shared';
import { spotOf } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Carom billiards on a table without pockets. Each player has a cue ball (white 'cue' and
 * 'yellow'); the red is shared. A point is scored by hitting both other balls with your own:
 * - 3-Cushion: the cue ball must also touch at least three cushions before it meets the second
 *   ball.
 * - Balkline (47/2, 71/2): the table is divided by lines into nine areas. When both object balls
 *   lie in the same outer area, only `/n` points may be made there before at least one of them
 *   leaves it.
 * Scoring continues the turn; anything else passes it. The opening shot (red on the foot spot, the
 * opponent's ball on the head spot) must hit the red first. Games are to a points target.
 */

export type CaromGame = 'three-cushion' | 'balkline-47-2' | 'balkline-71-2';

export interface CaromOptions {
  target: number;
}

export interface CaromState {
  phase: 'play' | 'over';
  shooter: Seat;
  scores: [number, number];
  break: number;
  /** Highest run so far, per player. */
  best: [number, number];
  /** Points made in a row with both object balls in the same balk area, and which area. */
  inArea: { area: number; count: number } | null;
  opening: boolean;
}

export const CAROM_BALLS = ['cue', 'yellow'] as const;
type Seat = 0 | 1;
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const seat = (p: number): Seat => (p === 1 ? 1 : 0);
const name = (p: number) => `{p${p}}`;

export interface CaromFacts {
  /** Object balls the cue ball touched, in order. */
  touched: string[];
  /** Cushions the cue ball touched before it reached the second object ball (all, if it never did). */
  cushionsBeforeSecond: number;
  offTable: boolean;
}

export function caromFacts(result: ShotResult, cue: string): CaromFacts {
  const touched: string[] = [];
  let cushions = 0;
  let offTable = false;
  for (const e of result.events) {
    if (e.type === 'ball' && (e.a === cue || e.b === cue)) {
      const o = e.a === cue ? e.b : e.a;
      if (!touched.includes(o)) touched.push(o);
    } else if (e.type === 'cushion' && e.ball === cue && touched.length < 2) cushions++;
    else if (e.type === 'off-table') offTable = true;
  }
  return { touched, cushionsBeforeSecond: cushions, offTable };
}

/** Which of the nine balkline areas a point is in (0–8, 4 is the unrestricted centre). */
export function balkArea(table: TableSpec, p: { x: number; y: number }): number {
  const lines = table.markings.filter((m) => m.type === 'line' && m.id.startsWith('balk-'));
  const xs = lines.filter((m) => m.id.startsWith('balk-x')).map((m) => (m.type === 'line' ? m.a.x : 0));
  const ys = lines.filter((m) => m.id.startsWith('balk-y')).map((m) => (m.type === 'line' ? m.a.y : 0));
  const band = (v: number, cuts: number[]) => {
    const [lo, hi] = [...cuts].sort((a, b) => a - b);
    return v < lo! ? 0 : v > hi! ? 2 : 1;
  };
  return band(p.y, ys) * 3 + band(p.x, xs);
}

function makeCarom(game: CaromGame): Ruleset<CaromState, CaromOptions> {
  const table = game === 'three-cushion' ? CAROM_10FT : game === 'balkline-47-2' ? BALKLINE_47 : BALKLINE_71;
  const limit = game === 'three-cushion' ? Infinity : 2;
  const label = {
    'three-cushion': '3-Cushion',
    'balkline-47-2': 'Balkline 47/2',
    'balkline-71-2': 'Balkline 71/2',
  }[game];
  const target = game === 'three-cushion' ? 25 : 100;

  const turnFor = (player: Seat, opening: boolean): Turn => ({
    player,
    cueBall: CAROM_BALLS[player],
    ballInHand: 'none',
    targets: opening ? ['red'] : [],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: opening,
    fouls: 0,
  });

  /** The area both object balls share at the start of a stroke (outer areas only), or null. */
  const sharedArea = (balls: readonly BallState[], cue: string): number | null => {
    if (limit === Infinity) return null;
    const objs = balls.filter((b) => b.id !== cue && b.state !== 'pocketed');
    if (objs.length !== 2) return null;
    const a = balkArea(table, objs[0]!.pos);
    return a !== 4 && a === balkArea(table, objs[1]!.pos) ? a : null;
  };

  return {
    id: game,
    name: label,
    table,
    players: { min: 2, max: 2 },
    options: [{ id: 'target', label: 'Points to win', type: 'number', default: target, min: 5, max: 400 }],
    defaults: { target },

    newFrame(_opts, _rng: Rng, breaker) {
      const side = spotOf(table, breaker === 0 ? 'start-right' : 'start-left')!;
      const balls = [
        makeBall(CAROM_BALLS[seat(breaker)], table.balls.cue, side),
        makeBall(CAROM_BALLS[other(seat(breaker))], table.balls.cue, spotOf(table, 'head')!),
        makeBall('red', table.balls.object, spotOf(table, 'foot')!),
      ];
      const state: CaromState = {
        phase: 'play',
        shooter: seat(breaker),
        scores: [0, 0],
        break: 0,
        best: [0, 0],
        inArea: null,
        opening: true,
      };
      return { balls, state, turn: turnFor(seat(breaker), true) };
    },

    judge(s, _decl: ShotDeclaration, before, result: ShotResult, opts) {
      const me = s.shooter;
      const cue = CAROM_BALLS[me];
      const balls = result.final.map(cloneBall);
      const f = caromFacts(result, cue);
      const state: CaromState = {
        ...s,
        scores: [...s.scores] as [number, number],
        best: [...s.best] as [number, number],
        opening: false,
      };
      const fouls: Foul[] = [];
      if (f.offTable) fouls.push({ code: 'off-table', message: 'A ball left the table' });
      else if (s.opening && f.touched[0] && f.touched[0] !== 'red')
        fouls.push({ code: 'wrong-ball-first', message: 'The opening shot must hit the red first' });

      // A ball off the table goes back on its spot (red: foot, whites: head; centre if taken).
      for (const b of balls)
        if (b.state === 'pocketed') {
          const spot = spotOf(table, b.id === 'red' ? 'foot' : 'head')!;
          Object.assign(b, {
            state: 'stationary',
            pos: { ...spot },
            vel: { x: 0, y: 0 },
            spin: { x: 0, y: 0, z: 0 },
          });
          delete b.pocket;
        }

      let scored = !fouls.length && f.touched.length >= 2;
      let why = '';
      if (scored && game === 'three-cushion' && f.cushionsBeforeSecond < 3) {
        scored = false;
        why = `only ${f.cushionsBeforeSecond} cushion${f.cushionsBeforeSecond === 1 ? '' : 's'}`;
      }
      // Balkline: points made with both object balls in the same outer area.
      const area = sharedArea(before, cue);
      if (scored && area !== null) {
        const count = state.inArea?.area === area ? state.inArea.count : 0;
        const after = sharedArea(balls, cue);
        if (count >= limit - 1 && after === area) {
          scored = false;
          why = `both balls still in the same balk area after ${limit}`;
        }
        state.inArea = after === area ? { area, count: count + 1 } : null;
      } else state.inArea = null;

      if (!scored) {
        state.break = 0;
        state.inArea = null;
        state.shooter = other(me);
        const msg = fouls.length
          ? `Foul: ${fouls[0]!.message.toLowerCase()}. ${name(other(me))} to play.`
          : f.touched.length < 2
            ? `Missed. ${name(other(me))} to play.`
            : `No count (${why}). ${name(other(me))} to play.`;
        return done(state, balls, fouls, msg, opts);
      }
      state.scores[me]++;
      state.break++;
      state.best[me] = Math.max(state.best[me], state.break);
      return done(state, balls, [], `Point! Run ${state.break}.`, opts);
    },

    decide(s, _choice, balls) {
      return {
        state: s,
        balls,
        fouls: [],
        potted: [],
        turn: turnFor(s.shooter, s.opening),
        frame: null,
        message: '',
        points: [...s.scores],
      };
    },
  };

  function done(
    state: CaromState,
    balls: BallState[],
    fouls: Foul[],
    message: string,
    opts: CaromOptions,
  ): Judgement<CaromState> {
    const winner = state.scores.findIndex((p) => p >= opts.target);
    if (winner >= 0) state.phase = 'over';
    return {
      state,
      balls,
      fouls,
      potted: [],
      turn: turnFor(state.shooter, false),
      frame: winner >= 0 ? { winner, reason: `${name(winner)} reaches ${opts.target}` } : null,
      message,
      points: [...state.scores],
    };
  }
}

export const THREE_CUSHION = makeCarom('three-cushion');
export const BALKLINE_47_2 = makeCarom('balkline-47-2');
export const BALKLINE_71_2 = makeCarom('balkline-71-2');
