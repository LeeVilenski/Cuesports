import { cloneBall, makeBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { spotOf } from './placement';
import { pointsRemaining, SNOOKER, type SnookerState } from './snooker';
import { isSnookered } from './snookered';

const R = SNOOKER;
const opts = R.defaults;
const table = R.table;
const spec = table.balls.object;

function shot(
  before: BallState[],
  events: PhysicsEvent[],
  moves: Record<string, { x: number; y: number }> = {},
): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket' && e.type !== 'off-table') continue;
    const b = final.find((x) => x.id === e.ball)!;
    b.state = 'pocketed';
    if (e.type === 'pocket') b.pocket = e.pocket;
  }
  for (const [id, p] of Object.entries(moves)) final.find((x) => x.id === id)!.pos = { ...p };
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const strike: PhysicsEvent = { type: 'strike', t: 0, ball: 'cue', speed: 3, miscue: false };
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 2 });
const pot = (ball: string, pocket = 'top-right', t = 0.6): PhysicsEvent => ({
  type: 'pocket',
  t,
  ball,
  pocket,
});
const rail = (ball: string, t = 0.5): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});

const fresh = () => R.newFrame(opts, new Rng(3), 0);
const state = (over: Partial<SnookerState> = {}): SnookerState => ({
  phase: 'play',
  shooter: 0,
  scores: [0, 0],
  break: 0,
  on: 'red',
  freeBall: false,
  ballInHand: 'none',
  misses: [0, 0],
  respottedBlack: false,
  pending: null,
  ...over,
});
/** A custom position: cue ball and the given balls at the given points. */
const position = (balls: Record<string, [number, number]>): BallState[] =>
  Object.entries(balls).map(([id, [x, y]]) => makeBall(id, id === 'cue' ? table.balls.cue : spec, { x, y }));

describe('snooker: set-up', () => {
  it('racks 15 reds behind the pink, colours on their spots, cue ball in hand in the D', () => {
    const { balls, turn } = fresh();
    expect(balls.filter((b) => b.id.startsWith('red'))).toHaveLength(15);
    for (const c of ['yellow', 'green', 'brown', 'blue', 'pink', 'black']) {
      expect(balls.find((b) => b.id === c)!.pos).toEqual(spotOf(table, c));
    }
    expect(turn).toMatchObject({ ballInHand: 'in-d', mustNominate: false });
    expect(turn.targets).toHaveLength(15);
  });

  it('can be played with 10 or 6 reds', () => {
    expect(
      R.newFrame({ ...opts, reds: 6 }, new Rng(1), 0).balls.filter((b) => b.id.startsWith('red')),
    ).toHaveLength(6);
    expect(
      R.newFrame({ ...opts, reds: 10 }, new Rng(1), 0).balls.filter((b) => b.id.startsWith('red')),
    ).toHaveLength(10);
  });
});

describe('snooker: scoring', () => {
  it('a red scores 1 and the player must then nominate a colour', () => {
    const { balls } = fresh();
    const j = R.judge(state(), {}, balls, shot(balls, [strike, hit('red1'), pot('red1')]), opts);
    expect(j.state.scores).toEqual([1, 0]);
    expect(j.turn).toMatchObject({ player: 0, mustNominate: true });
    expect(j.state.on).toBe('colour');
  });

  it('two reds in one stroke score 2', () => {
    const { balls } = fresh();
    const j = R.judge(
      state(),
      {},
      balls,
      shot(balls, [strike, hit('red1'), pot('red1'), pot('red2', 'top-left')]),
      opts,
    );
    expect(j.state.scores).toEqual([2, 0]);
  });

  it('the nominated colour scores its value and is re-spotted while reds remain', () => {
    const { balls } = fresh();
    const s = state({ on: 'colour', scores: [1, 0], break: 1 });
    const j = R.judge(s, { nominate: 'pink' }, balls, shot(balls, [strike, hit('pink'), pot('pink')]), opts);
    expect(j.state.scores).toEqual([7, 0]);
    expect(j.state.break).toBe(7);
    expect(j.state.on).toBe('red');
    const pink = j.balls.find((b) => b.id === 'pink')!;
    expect(pink.state).toBe('stationary');
    expect(pink.pos).toEqual(spotOf(table, 'pink'));
  });

  it('a missed pot ends the visit and the break', () => {
    const { balls } = fresh();
    const j = R.judge(
      state({ break: 9, scores: [9, 0] }),
      {},
      balls,
      shot(balls, [strike, hit('red1'), rail('red1')]),
      opts,
    );
    expect(j.turn.player).toBe(1);
    expect(j.state.break).toBe(0);
  });

  it('once the reds are gone the colours are taken in order and stay down', () => {
    const balls = position({ cue: [0, -0.3], yellow: [-0.5, -0.3], green: [-0.5, 0.3], black: [1.4, 0] });
    const j = R.judge(
      state({ on: 'yellow' }),
      {},
      balls,
      shot(balls, [strike, hit('yellow'), pot('yellow')]),
      opts,
    );
    expect(j.state.scores).toEqual([2, 0]);
    expect(j.balls.find((b) => b.id === 'yellow')!.state).toBe('pocketed');
    expect(j.state.on).toBe('green');
  });

  it('counts points remaining: 8 a red plus the colours', () => {
    const { balls } = fresh();
    expect(pointsRemaining(state(), balls)).toBe(15 * 8 + 27);
  });
});

describe('snooker: fouls', () => {
  it('hitting a colour first when on a red gives the opponent the higher of 4 and its value', () => {
    const { balls } = fresh();
    const j = R.judge(state(), {}, balls, shot(balls, [strike, hit('blue')]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['wrong-ball-first']);
    expect(j.state.scores).toEqual([0, 5]);
    expect(j.turn.player).toBe(1);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['play', 'again', 'replace']);
  });

  it('potting a colour other than the nominated one is a foul worth the higher value, and it is re-spotted', () => {
    const { balls } = fresh();
    const s = state({ on: 'colour' });
    const j = R.judge(s, { nominate: 'pink' }, balls, shot(balls, [strike, hit('pink'), pot('black')]), opts);
    expect(j.state.scores).toEqual([0, 7]);
    expect(j.balls.find((b) => b.id === 'black')!.state).toBe('stationary');
  });

  it('an in-off is a foul (minimum 4) and gives ball in hand in the D', () => {
    const { balls } = fresh();
    const j = R.judge(state(), {}, balls, shot(balls, [strike, hit('red1'), pot('cue')]), opts);
    expect(j.state.scores).toEqual([0, 4]);
    const played = R.decide(j.state, 'play', j.balls, opts);
    expect(played.turn).toMatchObject({ player: 1, ballInHand: 'in-d' });
  });

  it('a foul and a miss lets the opponent replace the balls and make the offender play again', () => {
    const { balls } = fresh();
    const moved = { red1: { x: 0.3, y: 0.3 } };
    const j = R.judge(state(), {}, balls, shot(balls, [strike, rail('cue')], moved), opts);
    expect(j.message).toContain('Foul and a miss');
    const replaced = R.decide(j.state, 'replace', j.balls, opts);
    expect(replaced.turn.player).toBe(0);
    expect(replaced.balls.find((b) => b.id === 'red1')!.pos).toEqual(balls.find((b) => b.id === 'red1')!.pos);
    const again = R.decide(j.state, 'again', j.balls, opts);
    expect(again.turn.player).toBe(0);
    expect(again.balls.find((b) => b.id === 'red1')!.pos).toEqual({ x: 0.3, y: 0.3 });
  });

  it('three misses in a row with a clear view lose the frame', () => {
    const balls = position({ cue: [0, 0], red1: [0.6, 0], black: [1.4, 0] });
    let s = state({ misses: [2, 0] });
    const j = R.judge(s, {}, balls, shot(balls, [strike, rail('cue')]), opts);
    expect(j.frame).toEqual({ winner: 1, reason: 'three misses' });
    // With the miss rule off for amateurs, missing when snookered is not a miss.
    s = state();
    const snookered = position({ cue: [0, 0], blue: [0.25, 0], red1: [0.6, 0], black: [1.4, 0] });
    const am = R.judge(s, {}, snookered, shot(snookered, [strike, rail('cue')]), {
      ...opts,
      missRule: false,
    });
    expect(am.message).not.toContain('Foul and a miss');
  });

  it('a ball touching the cue ball counts as hit when the player plays away', () => {
    const balls = position({ cue: [0, 0], red1: [2 * spec.radius, 0], black: [1.4, 0] });
    const j = R.judge(state(), {}, balls, shot(balls, [strike, rail('cue')]), opts);
    expect(j.fouls).toEqual([]);
  });
});

describe('snooker: free ball', () => {
  it('detects a snooker: every ball on blocked by balls not on', () => {
    const blocked = position({ cue: [0, 0], blue: [0.25, 0], red1: [0.6, 0] });
    expect(isSnookered(blocked, 'cue', ['red1'])).toBe(true);
    const clear = position({ cue: [0, 0], blue: [0.25, 0.2], red1: [0.6, 0] });
    expect(isSnookered(clear, 'cue', ['red1'])).toBe(false);
  });

  it('after a foul that leaves the opponent snookered, they get a free ball that counts as a red', () => {
    const before = position({ cue: [-0.3, 0], blue: [0.25, 0], red1: [0.6, 0], black: [1.4, 0] });
    // The striker hits the blue first and the cue ball ends up behind it.
    const j = R.judge(
      state(),
      {},
      before,
      shot(before, [strike, hit('blue')], { cue: { x: 0, y: 0 } }),
      opts,
    );
    expect(j.message).toContain('Free ball');
    const play = R.decide(j.state, 'play', j.balls, opts);
    expect(play.turn).toMatchObject({ player: 1, freeBall: true, mustNominate: true });
    // Nominating the green as a free ball and potting it scores 1 (as a red) and it is re-spotted.
    const free = position({
      cue: [0, 0],
      green: [0.3, 0.3],
      blue: [0.25, 0],
      red1: [0.6, 0],
      black: [1.4, 0],
    });
    const pf = R.judge(
      play.state,
      { nominate: 'green' },
      free,
      shot(free, [strike, hit('green'), pot('green')]),
      opts,
    );
    expect(pf.fouls).toEqual([]);
    expect(pf.state.scores[1]).toBe(j.state.scores[1]! + 1);
    expect(pf.balls.find((b) => b.id === 'green')!.state).toBe('stationary');
    expect(pf.state.on).toBe('colour');
  });
});

describe('snooker: end of frame', () => {
  it('potting the last black ends the frame', () => {
    const balls = position({ cue: [0, 0], black: [1.4, 0] });
    const j = R.judge(
      state({ on: 'black', scores: [50, 40] }),
      {},
      balls,
      shot(balls, [strike, hit('black'), pot('black')]),
      opts,
    );
    expect(j.frame?.winner).toBe(0);
    expect(j.state.scores).toEqual([57, 40]);
  });

  it('a tie on the last black re-spots it; the next score or foul ends the frame', () => {
    const balls = position({ cue: [0, 0], black: [1.4, 0] });
    const j = R.judge(
      state({ on: 'black', scores: [40, 47] }),
      {},
      balls,
      shot(balls, [strike, hit('black'), pot('black')]),
      opts,
    );
    expect(j.frame).toBeNull();
    expect(j.state.respottedBlack).toBe(true);
    expect(j.turn.ballInHand).toBe('in-d');
    expect(j.balls.find((b) => b.id === 'black')!.pos).toEqual(spotOf(table, 'black'));
    // Whoever plays first then fouls: the opponent wins.
    const first = j.turn.player;
    const k = R.judge(j.state, {}, j.balls, shot(j.balls, [strike, rail('cue')]), opts);
    expect(k.frame?.winner).toBe(1 - first);
  });
});
