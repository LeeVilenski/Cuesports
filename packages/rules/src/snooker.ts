import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { Rng, SNOOKER_12FT, type TableSpec, type Vec2 } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { spotFree, spotOf, theD } from './placement';
import { isSnookered } from './snookered';
import type { BallInHand, Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * Snooker under the WPBSA Official Rules (summary of what is implemented):
 * - Reds are worth 1, then yellow 2, green 3, brown 4, blue 5, pink 6, black 7.
 * - Break-off from the D. While reds remain, a player must hit a red; after potting one they nominate
 *   a colour, and after that colour (re-spotted) it is back to reds. Once the reds are gone the colours
 *   are taken in order, yellow to black, and stay down.
 * - A foul scores the opponent 4, or the value of the ball on, the ball hit first, or a ball wrongly
 *   potted or forced off the table, whichever is highest.
 * - After a foul the next player plays from where the balls lie, or makes the offender play again.
 *   If the offender failed to hit a ball on, a miss is called (an option; the amateur version only calls
 *   it when the striker was not snookered), and the next player may also have the balls replaced and
 *   the offender play again. Three misses in a row with a clear view of a ball on lose the frame.
 * - Free ball: after a foul, if the next player is snookered on every ball on, they may nominate any
 *   ball as the ball on. It counts as the ball on (a red's value while reds remain) and is re-spotted.
 * - Touching ball: if the cue ball rests against a ball on, playing away counts as hitting it.
 * - The frame ends when the black is potted (or a foul is made) as the last ball. If the scores are
 *   then level, the black is re-spotted, the cue ball is in hand in the D, the player to go first is
 *   drawn by lot, and the next score or foul ends the frame.
 *
 * Not yet: angled cue ball in the jaws (counts as snookered), the "push stroke", "jump shot" and
 * "foul and a miss" refinements when a player needs snookers.
 */

export const COLOURS = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'] as const;
export type Colour = (typeof COLOURS)[number];
export const VALUE: Record<string, number> = { yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };
export const ballValue = (id: string): number => (id.startsWith('red') ? 1 : (VALUE[id] ?? 0));
const isRed = (id: string) => id.startsWith('red');

/** What the striker is on: any red, a colour of their choice (after a red), or a particular colour. */
export type BallOn = 'red' | 'colour' | Colour;

export interface SnookerState {
  phase: 'play' | 'decision' | 'over';
  shooter: number;
  scores: [number, number];
  /** Points in the current break. */
  break: number;
  on: BallOn;
  freeBall: boolean;
  ballInHand: BallInHand;
  /** Consecutive misses with a clear view of a ball on, per player. */
  misses: [number, number];
  /** Re-spotted black after a tie: the next score or foul ends the frame. */
  respottedBlack: boolean;
  /** Set while the next player decides after a foul. */
  pending: {
    offender: number;
    miss: boolean;
    /** Balls before the foul stroke (for "replace and play again" after a miss). */
    before: BallState[];
    beforeOn: BallOn;
    beforeBallInHand: BallInHand;
    freeBall: boolean;
  } | null;
}

export interface SnookerOptions {
  reds: 15 | 10 | 6;
  /** Call a miss whenever the striker fails to hit a ball on (pro); off = only when not snookered. */
  missRule: boolean;
  /** Three misses in a row with a clear view of a ball on lose the frame. */
  threeMissRule: boolean;
}

const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;
const onTable = (balls: readonly BallState[]) =>
  balls.filter((b) => b.state !== 'pocketed' && b.id !== 'cue');
const redsLeft = (balls: readonly BallState[]) => onTable(balls).filter((b) => isRed(b.id));

/** The lowest-value colour still on the table (the ball on once the reds are gone). */
function lowestColour(balls: readonly BallState[]): Colour | null {
  for (const c of COLOURS) if (balls.some((b) => b.id === c && b.state !== 'pocketed')) return c;
  return null;
}

/** Which ball is on for a new visit to the table. */
function onForNewVisit(balls: readonly BallState[]): BallOn {
  return redsLeft(balls).length > 0 ? 'red' : (lowestColour(balls) ?? 'black');
}

/** Ids of the balls that are on (before any nomination). */
function ballsOn(balls: readonly BallState[], on: BallOn): string[] {
  if (on === 'red') return redsLeft(balls).map((b) => b.id);
  if (on === 'colour') return COLOURS.filter((c) => balls.some((b) => b.id === c && b.state !== 'pocketed'));
  return [on];
}

const describeOn = (on: BallOn) => (on === 'red' ? 'a red' : on === 'colour' ? 'a colour' : `the ${on}`);

/** Points still available to the player at the table. */
export function pointsRemaining(state: SnookerState, balls: readonly BallState[]): number {
  const reds = redsLeft(balls).length;
  const colours = COLOURS.filter((c) => balls.some((b) => b.id === c && b.state !== 'pocketed'));
  const colourSum = colours.reduce((a, c) => a + VALUE[c]!, 0);
  return reds * 8 + colourSum + (state.on === 'colour' ? 7 : 0);
}

/**
 * Re-spots a colour: on its own spot, else the highest-value free spot, else as near as possible to its
 * own spot towards the top cushion (then towards the baulk cushion).
 */
export function respotColour(table: TableSpec, balls: BallState[], id: string): void {
  const b = balls.find((x) => x.id === id);
  if (!b) return;
  const place = (p: Vec2) => {
    b.pos = { ...p };
    b.vel = { x: 0, y: 0 };
    b.spin = { x: 0, y: 0, z: 0 };
    b.state = 'stationary';
    delete b.pocket;
  };
  b.state = 'pocketed'; // so it does not block itself
  const own = spotOf(table, id)!;
  if (spotFree(balls, id, own)) return place(own);
  for (const c of [...COLOURS].reverse()) {
    const s = spotOf(table, c)!;
    if (spotFree(balls, id, s)) return place(s);
  }
  const hl = table.playfield.length / 2 - b.radius;
  for (let x = own.x; x <= hl; x += 0.0005)
    if (spotFree(balls, id, { x, y: own.y })) return place({ x, y: own.y });
  for (let x = own.x; x >= -hl; x -= 0.0005)
    if (spotFree(balls, id, { x, y: own.y })) return place({ x, y: own.y });
  place(own);
}

/** Puts the cue ball back in the D (on the brown spot side) for ball in hand. */
function cueToD(table: TableSpec, balls: BallState[]): void {
  const cue = balls.find((b) => b.id === 'cue');
  const d = theD(table);
  if (!cue || !d) return;
  const candidates = [
    { x: d.centre.x - d.radius * 0.5, y: d.radius * 0.4 },
    { x: d.centre.x - d.radius * 0.5, y: -d.radius * 0.4 },
    { x: d.centre.x - d.radius * 0.8, y: 0 },
  ];
  const p = candidates.find((c) => spotFree(balls, 'cue', c)) ?? candidates[0]!;
  cue.pos = p;
  cue.vel = { x: 0, y: 0 };
  cue.spin = { x: 0, y: 0, z: 0 };
  cue.state = 'stationary';
  delete cue.pocket;
}

function rack(table: TableSpec, reds: number, rng: Rng): BallState[] {
  const obj = table.balls.object;
  const pink = spotOf(table, 'pink')!;
  const rows = reds === 15 ? [1, 2, 3, 4, 5] : reds === 10 ? [1, 2, 3, 4] : [1, 2, 3];
  const ids = Array.from({ length: reds }, (_, i) => `red${i + 1}`);
  const balls = rackRows(ids, obj, { x: pink.x + 2 * obj.radius + 0.002, y: 0 }, rows, { rng });
  for (const c of COLOURS) balls.push(makeBall(c, obj, spotOf(table, c)!));
  const d = theD(table)!;
  balls.push(makeBall('cue', table.balls.cue, { x: d.centre.x - 0.05, y: d.radius * 0.4 }));
  return balls;
}

function turnFor(state: SnookerState, balls: readonly BallState[], decision: Turn['decision'] = null): Turn {
  const on = state.freeBall ? onTable(balls).map((b) => b.id) : ballsOn(balls, state.on);
  return {
    player: state.shooter,
    ballInHand: state.ballInHand,
    targets: on,
    canPushOut: false,
    mustCall: false,
    mustNominate: state.phase === 'play' && (state.on === 'colour' || state.freeBall),
    freeBall: state.freeBall,
    decision,
    isBreak: false,
    fouls: state.misses[state.shooter] ?? 0,
  };
}

/** The scores decide the frame, or the black is re-spotted on a tie. */
function frameEnd(
  table: TableSpec,
  state: SnookerState,
  balls: BallState[],
  rng: Rng,
  message: string,
): Judgement<SnookerState> {
  const [a, b] = state.scores;
  if (a !== b) {
    const winner = a > b ? 0 : 1;
    const next: SnookerState = { ...state, phase: 'over', pending: null };
    return {
      state: next,
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(next, balls),
      frame: { winner, reason: `${a}–${b}` },
      message: `${message} ${name(winner)} wins the frame ${Math.max(a, b)}–${Math.min(a, b)}.`,
      points: [a, b],
    };
  }
  // Tie: re-spotted black.
  const black = balls.find((x) => x.id === 'black')!;
  black.state = 'pocketed';
  respotColour(table, balls, 'black');
  cueToD(table, balls);
  const first = rng.int(2);
  const next: SnookerState = {
    ...state,
    phase: 'play',
    shooter: first,
    on: 'black',
    freeBall: false,
    ballInHand: 'in-d',
    break: 0,
    respottedBlack: true,
    pending: null,
  };
  return {
    state: next,
    balls,
    fouls: [],
    potted: [],
    turn: turnFor(next, balls),
    frame: null,
    message: `${message} Scores level: the black is re-spotted. ${name(first)} plays first (drawn by lot).`,
    points: [a, b],
  };
}

export function makeSnooker(table: TableSpec = SNOOKER_12FT): Ruleset<SnookerState, SnookerOptions> {
  // Lot for the re-spotted black; seeded per frame from the rack seed.
  let lot = new Rng(1);
  const ruleset: Ruleset<SnookerState, SnookerOptions> = {
    id: 'snooker',
    name: 'Snooker',
    table,
    players: { min: 2, max: 2 },
    options: [
      { id: 'reds', label: 'Reds', type: 'number', default: 15, min: 6, max: 15 },
      { id: 'missRule', label: 'Miss rule (pro)', type: 'boolean', default: true },
      { id: 'threeMissRule', label: 'Three misses lose the frame', type: 'boolean', default: true },
    ],
    defaults: { reds: 15, missRule: true, threeMissRule: true },

    newFrame(opts, rng, breaker) {
      lot = new Rng(rng.nextU32());
      const balls = rack(table, opts.reds, rng);
      const state: SnookerState = {
        phase: 'play',
        shooter: breaker,
        scores: [0, 0],
        break: 0,
        on: 'red',
        freeBall: false,
        ballInHand: 'in-d',
        misses: [0, 0],
        respottedBlack: false,
        pending: null,
      };
      return { balls, state, turn: turnFor(state, balls) };
    },

    judge(state, decl: ShotDeclaration, before, result: ShotResult, opts): Judgement<SnookerState> {
      const facts = shotFacts(result);
      const balls = result.final.map(cloneBall);
      const shooter = state.shooter;
      const scores: [number, number] = [...state.scores];
      const fouls: { code: Foul['code']; message: string; value: number }[] = [];

      // What is on for this stroke.
      const reds = redsLeft(before).map((b) => b.id);
      let nominated = decl.nominate;
      if (state.on === 'colour' && !nominated && facts.firstContact && !isRed(facts.firstContact)) {
        // Lenient: treat the colour hit first as nominated (a referee assumes the obvious nomination).
        nominated = facts.firstContact;
      }
      const freeBallId = state.freeBall ? nominated : undefined;
      let onIds: string[];
      let onValue: number;
      if (state.on === 'red') {
        onIds = freeBallId ? [...reds, freeBallId] : reds;
        onValue = 1;
      } else if (state.on === 'colour') {
        onIds = nominated ? [nominated] : [];
        onValue = nominated ? ballValue(nominated) : 7;
      } else {
        onIds = freeBallId ? [state.on, freeBallId] : [state.on];
        onValue = VALUE[state.on]!;
      }
      // A free ball counts as the ball on; its own value only matters for penalties.
      const cue = before.find((b) => b.id === 'cue')!;
      const touching = before.find(
        (b) =>
          b.id !== 'cue' &&
          b.state !== 'pocketed' &&
          onIds.includes(b.id) &&
          Math.hypot(b.pos.x - cue.pos.x, b.pos.y - cue.pos.y) <= b.radius + cue.radius + 1e-4,
      );

      const add = (code: Foul['code'], message: string, value: number) =>
        fouls.push({ code, message, value });
      if (state.on === 'colour' && !nominated) add('no-nomination', 'no colour was nominated', 7);
      if (facts.cueScratch) add('scratch', 'in-off', onValue);
      if (!facts.firstContact) {
        if (!touching) add('no-contact', `missed ${describeOn(state.on)}`, onValue);
      } else if (!onIds.includes(facts.firstContact) && !touching) {
        add(
          'wrong-ball-first',
          `hit the ${facts.firstContact.replace(/\d+$/, '')} first`,
          ballValue(facts.firstContact),
        );
      }
      for (const id of facts.potted) {
        if (!onIds.includes(id))
          add('wrong-ball-potted', `potted the ${id.replace(/\d+$/, '')}`, ballValue(id));
      }
      // In the colour phase only the nominated colour (one ball) may go in.
      if (state.on !== 'red' && facts.potted.filter((id) => onIds.includes(id)).length > 1) {
        add('wrong-ball-potted', 'potted more than the ball on', onValue);
      }
      for (const id of facts.offTable)
        add('off-table', `forced the ${id.replace(/\d+$/, '')} off the table`, ballValue(id));

      const potted = facts.potted;

      if (fouls.length > 0) {
        const penalty = Math.max(4, onValue, ...fouls.map((f) => f.value));
        scores[other(shooter)] = (scores[other(shooter)] ?? 0) + penalty;
        // Colours that went down or off are re-spotted (reds stay down).
        for (const id of [...potted, ...facts.offTable]) if (!isRed(id)) respotColour(table, balls, id);
        const scratched = facts.cueScratch;
        if (scratched) cueToD(table, balls);

        const failedToHit = fouls.some((f) => f.code === 'no-contact' || f.code === 'wrong-ball-first');
        const wasSnookered = isSnookered(before, 'cue', onIds);
        const miss = failedToHit && (opts.missRule || !wasSnookered);
        const misses: [number, number] = [...state.misses];
        misses[shooter] = miss && !wasSnookered ? (misses[shooter] ?? 0) + 1 : 0;
        const foulMsg = `Foul: ${fouls[0]!.message}. ${penalty} to ${name(other(shooter))}.`;

        if (opts.threeMissRule && (misses[shooter] ?? 0) >= 3) {
          const next: SnookerState = { ...state, phase: 'over', scores, misses, pending: null };
          return {
            state: next,
            balls,
            fouls: fouls.map(({ code, message }) => ({ code, message })),
            potted,
            turn: turnFor(next, balls),
            frame: { winner: other(shooter), reason: 'three misses' },
            message: `${foulMsg} Third miss with a clear view: ${name(other(shooter))} wins the frame.`,
            points: scores,
          };
        }
        // A foul on the re-spotted black (or with only the black left) ends the frame.
        const onlyBlackLeft = onTable(balls).every((b) => b.id === 'black');
        if (state.respottedBlack || (onlyBlackLeft && state.on === 'black')) {
          return frameEnd(table, { ...state, scores, misses }, balls, lot, foulMsg);
        }

        // The next player may be snookered: free ball.
        const nextOn = onForNewVisit(balls);
        const free = !scratched && isSnookered(balls, 'cue', ballsOn(balls, nextOn));
        const choices = [
          { id: 'play', label: 'Play from here' },
          { id: 'again', label: `${name(shooter)} plays again` },
        ];
        if (miss) choices.push({ id: 'replace', label: `Replace balls, ${name(shooter)} plays again` });
        const next: SnookerState = {
          phase: 'decision',
          shooter: other(shooter),
          scores,
          break: 0,
          on: nextOn,
          freeBall: free,
          ballInHand: scratched ? 'in-d' : 'none',
          misses,
          respottedBlack: false,
          pending: {
            offender: shooter,
            miss,
            before: before.map(cloneBall),
            beforeOn: state.on,
            beforeBallInHand: state.ballInHand,
            freeBall: state.freeBall,
          },
        };
        let message = foulMsg + (miss ? ' Foul and a miss.' : '');
        if (free) message += ` Free ball for ${name(other(shooter))}.`;
        if ((misses[shooter] ?? 0) === 2 && opts.threeMissRule)
          message += ` ${name(shooter)} has missed twice: a third miss loses the frame.`;
        return {
          state: next,
          balls,
          fouls: fouls.map(({ code, message: m }) => ({ code, message: m })),
          potted,
          turn: turnFor(next, balls, { prompt: `${name(other(shooter))}: ${message}`, choices }),
          frame: null,
          message,
          points: scores,
        };
      }

      // Legal stroke.
      let scored = 0;
      for (const id of potted) scored += id === freeBallId ? onValue : ballValue(id);
      // Free ball potted (and colours potted while reds remain, or in the colour-after-red phase) go back.
      const respot: string[] = [];
      if (freeBallId && potted.includes(freeBallId)) respot.push(freeBallId);
      const misses: [number, number] = [...state.misses];
      misses[shooter] = 0;

      if (potted.length === 0) {
        const next: SnookerState = {
          ...state,
          phase: 'play',
          shooter: other(shooter),
          break: 0,
          on: onForNewVisit(balls),
          freeBall: false,
          ballInHand: 'none',
          misses,
          pending: null,
        };
        if (state.respottedBlack) return frameEnd(table, next, balls, lot, '');
        return {
          state: next,
          balls,
          fouls: [],
          potted,
          turn: turnFor(next, balls),
          frame: null,
          message: `${name(other(shooter))} to play.`,
          points: scores,
        };
      }

      scores[shooter] = (scores[shooter] ?? 0) + scored;
      // The colour potted after a red always goes back; in the final sequence the ball on stays down.
      if (state.on === 'colour') respot.push(...potted.filter((id) => !isRed(id)));
      for (const id of new Set(respot)) respotColour(table, balls, id);
      const on: BallOn =
        state.on === 'red' ? 'colour' : redsLeft(balls).length > 0 ? 'red' : (lowestColour(balls) ?? 'black');

      const brk = state.break + scored;
      const what = potted.map((id) => id.replace(/\d+$/, '')).join(', ');
      const base = `${name(shooter)} pots the ${what} (${scored}). Break ${brk}.`;
      const ballsLeft = onTable(balls).length;
      if (ballsLeft === 0 || state.respottedBlack) {
        return frameEnd(table, { ...state, scores, break: brk, misses }, balls, lot, base);
      }
      const next: SnookerState = {
        ...state,
        phase: 'play',
        scores,
        break: brk,
        on,
        freeBall: false,
        ballInHand: 'none',
        misses,
        pending: null,
      };
      return {
        state: next,
        balls,
        fouls: [],
        potted,
        turn: turnFor(next, balls),
        frame: null,
        message: base + (on === 'colour' ? ' Nominate a colour.' : ''),
        points: scores,
      };
    },

    decide(state, choice, balls) {
      const p = state.pending;
      if (state.phase !== 'decision' || !p) throw new Error('No decision is pending');
      let next: SnookerState;
      let out = balls.map(cloneBall);
      let message: string;
      if (choice === 'play') {
        next = { ...state, phase: 'play', pending: null };
        message = `${name(state.shooter)} plays${state.freeBall ? ' a free ball' : ''}.`;
      } else if (choice === 'replace' && p.miss) {
        out = p.before.map(cloneBall);
        next = {
          ...state,
          phase: 'play',
          shooter: p.offender,
          on: p.beforeOn,
          freeBall: p.freeBall,
          ballInHand: p.beforeBallInHand,
          pending: null,
        };
        message = `Balls replaced: ${name(p.offender)} plays again.`;
      } else {
        // The offender plays again from where the balls lie (no free ball for the offender).
        next = { ...state, phase: 'play', shooter: p.offender, freeBall: false, pending: null };
        message = `${name(p.offender)} plays again.`;
      }
      return {
        state: next,
        balls: out,
        fouls: [],
        potted: [],
        turn: turnFor(next, out),
        frame: null,
        message,
        points: next.scores,
      };
    },
  };
  return ruleset;
}

export const SNOOKER = makeSnooker();
