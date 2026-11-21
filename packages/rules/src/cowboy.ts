import { cloneBall, makeBall, type BallState, type ShotResult } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, type Rng, type Vec2 } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { headStringX, spotBall, spotOf } from './placement';
import type { Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Cowboy pool (BCA rules):
 * - The cue ball and the 1, 3 and 5: the 1 on the head spot, the 3 on the foot spot, the 5 on the
 *   centre spot. A potted ball goes straight back on its own spot.
 * - The break is from the kitchen and must hit the 3 first; otherwise the opponent chooses to break
 *   themself or make the breaker break again.
 * - To 90, points come from a carom into two object balls (1), into all three (2), and the number
 *   of each ball potted. 90 must be reached exactly: going past it is a foul.
 * - From 90 to 100 only caroms count (pots score nothing; going past 100 is also a foul here).
 * - The 101st point must be a losing hazard: the cue ball goes in off the 1. Going in off the 3 or
 *   the 5 is a foul.
 * - A shot that scores nothing ends the inning. A foul (a scratch other than the final in-off, a
 *   miss, a ball off the table) loses every point scored in the inning; the opponent plays the cue
 *   ball where it lies, or from the kitchen after a scratch.
 */

export interface CowboyOptions {
  target: number;
}

export interface CowboyState {
  phase: 'break' | 'decision' | 'play' | 'over';
  shooter: number;
  scores: [number, number];
  /** Points scored in the current inning (lost on a foul). */
  inning: number;
  inHand: boolean;
}

const table = AMERICAN_POOL_9FT;
const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;
export const COWBOY_BALLS = ['1', '3', '5'] as const;
const VALUE: Record<string, number> = { '1': 1, '3': 3, '5': 5 };
const SPOT: Record<string, string> = { '1': 'head', '3': 'foot', '5': 'centre' };

function turnFor(s: CowboyState): Turn {
  return {
    player: s.shooter,
    ballInHand: s.inHand ? 'behind-head-string' : 'none',
    targets: s.phase === 'break' ? ['3'] : [],
    canPushOut: false,
    mustCall: false,
    decision:
      s.phase === 'decision'
        ? {
            prompt: `${name(s.shooter)}: the break missed the 3. Break yourself, or make them break again?`,
            choices: [
              { id: 'break', label: 'I will break' },
              { id: 'again', label: 'Break again' },
            ],
          }
        : null,
    isBreak: s.phase === 'break',
    fouls: 0,
  };
}

function rack(): BallState[] {
  const spot = (id: string): Vec2 => spotOf(table, SPOT[id]!)!;
  return [
    ...COWBOY_BALLS.map((id) => makeBall(id, table.balls.object, spot(id))),
    makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.15, y: 0.3 }),
  ];
}

/** Points for a shot, by the phase the shooter is in (`score` before the shot). */
export function cowboyPoints(score: number, caromed: number, potted: string[]): number {
  const carom = caromed >= 3 ? 2 : caromed === 2 ? 1 : 0;
  if (score >= 90) return carom;
  return carom + potted.reduce((n, id) => n + (VALUE[id] ?? 0), 0);
}

export const COWBOY_POOL: Ruleset<CowboyState, CowboyOptions> = {
  id: 'cowboy',
  name: 'Cowboy pool',
  table,
  players: { min: 2, max: 2 },
  options: [],
  defaults: { target: 101 },

  newFrame(_opts, _rng: Rng, breaker) {
    const state: CowboyState = { phase: 'break', shooter: breaker, scores: [0, 0], inning: 0, inHand: true };
    return { balls: rack(), state, turn: turnFor(state) };
  },

  judge(s, _decl: ShotDeclaration, _before, result: ShotResult, opts) {
    const me = s.shooter;
    const balls = result.final.map(cloneBall);
    const f = shotFacts(result);
    const state: CowboyState = { ...s, scores: [...s.scores] as [number, number] };
    const touched = new Set<string>();
    for (const e of result.events)
      if (e.type === 'ball' && (e.a === 'cue' || e.b === 'cue')) touched.add(e.a === 'cue' ? e.b : e.a);
    const potted = [...f.potted];
    // Potted balls go straight back on their spots.
    for (const id of [...potted, ...f.offTable]) spotBall(table, balls, id, spotOf(table, SPOT[id]!)!);

    // The break must hit the 3 first.
    if (s.phase === 'break' && f.firstContact !== '3') {
      const back = rack();
      const next: CowboyState = { ...state, phase: 'decision', shooter: other(me), inHand: true, inning: 0 };
      return {
        state: next,
        balls: back,
        fouls: [{ code: 'illegal-break', message: 'The break must hit the 3 first' }],
        potted: [],
        turn: turnFor(next),
        frame: null,
        message: `The break missed the 3. ${name(other(me))} chooses who breaks.`,
        points: [...state.scores],
      };
    }
    state.phase = 'play';

    const score = s.scores[me];
    const fouls: Foul[] = [];
    let won = false;
    if (f.cueScratch) {
      // At 100 the only way to win: in off the 1.
      if (score >= opts.target - 1 && f.firstContact === '1' && !f.offTable.length) won = true;
      else
        fouls.push({
          code: 'scratch',
          message: score >= opts.target - 1 ? 'The final point must be in off the 1' : 'The cue ball went in',
        });
    } else if (!f.firstContact) fouls.push({ code: 'no-contact', message: 'Missed every ball' });
    else if (f.offTable.length) fouls.push({ code: 'off-table', message: 'A ball left the table' });

    if (won) {
      state.scores[me] = opts.target;
      state.phase = 'over';
      return done(state, balls, [], `In off the 1: ${name(me)} wins!`, opts);
    }

    let points = 0;
    if (!fouls.length && score < opts.target - 1) {
      points = cowboyPoints(score, touched.size, potted);
      // 90 and 100 must be reached exactly.
      const limit = score < 90 ? 90 : opts.target - 1;
      if (score + points > limit)
        fouls.push({
          code: 'wrong-ball-potted',
          message: `That goes past ${limit}: it must be reached exactly`,
        });
    }

    const cue = balls.find((b) => b.id === 'cue')!;
    if (fouls.length) {
      state.scores[me] -= s.inning;
      const lost = s.inning;
      state.inning = 0;
      state.shooter = other(me);
      state.inHand = cue.state === 'pocketed';
      return done(
        state,
        balls,
        fouls,
        `Foul: ${fouls[0]!.message.toLowerCase()}.${lost ? ` ${name(me)} loses the ${lost} from this inning.` : ''}`,
        opts,
      );
    }
    if (!points) {
      state.inning = 0;
      state.shooter = other(me);
      state.inHand = false;
      const hint = score >= opts.target - 1 ? ' (Only an in-off from the 1 wins now.)' : '';
      return done(state, balls, [], `No score.${hint} ${name(other(me))} to play.`, opts);
    }
    state.scores[me] += points;
    state.inning += points;
    state.inHand = false;
    const now = state.scores[me];
    const phase =
      now >= opts.target - 1 ? ' Now in off the 1 to win.' : now >= 90 ? ' Caroms only from here.' : '';
    return done(state, balls, [], `${points} point${points === 1 ? '' : 's'}: ${now}.${phase}`, opts, potted);
  },

  decide(s, choice, balls) {
    const breaker = choice === 'break' ? s.shooter : other(s.shooter);
    const state: CowboyState = { ...s, phase: 'break', shooter: breaker, inHand: true };
    return {
      state,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(state),
      frame: null,
      message: `${name(breaker)} breaks.`,
      points: [...s.scores],
    };
  },
};

function done(
  state: CowboyState,
  balls: BallState[],
  fouls: Foul[],
  message: string,
  opts: CowboyOptions,
  potted: string[] = [],
): Judgement<CowboyState> {
  const winner = state.phase === 'over' ? state.scores.findIndex((p) => p >= opts.target) : -1;
  return {
    state,
    balls,
    fouls,
    potted,
    turn: turnFor(state),
    frame: winner >= 0 ? { winner, reason: `${name(winner)} goes in off the 1 for ${opts.target}` } : null,
    message,
    points: [...state.scores],
  };
}
