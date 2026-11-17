import { cloneBall, makeBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { ENGLISH_POOL, INTERNATIONAL_RULES, WEPF_RULES, type EnglishState } from './english';
import { spotOf } from './placement';

const R = ENGLISH_POOL;
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
const strike: PhysicsEvent = { type: 'strike', t: 0, ball: 'cue', speed: 5, miscue: false };
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 3 });
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

const fresh = () => R.newFrame(INTERNATIONAL_RULES, new Rng(9), 0);
const state = (over: Partial<EnglishState> = {}): EnglishState => ({
  phase: 'play',
  shooter: 0,
  groups: [null, null],
  visits: 1,
  ballInHand: 'none',
  pendingGroup: null,
  foulSnooker: false,
  decision: null,
  lastPotted: [],
  ...over,
});
const position = (balls: Record<string, [number, number]>): BallState[] =>
  Object.entries(balls).map(([id, [x, y]]) => makeBall(id, id === 'cue' ? table.balls.cue : spec, { x, y }));

describe('English pool: rack and break (International rules)', () => {
  it('racks 7 reds, 7 yellows and the 8 on the 8-ball spot; the break is from baulk', () => {
    const { balls, turn } = fresh();
    expect(balls.filter((b) => b.id.startsWith('r'))).toHaveLength(7);
    expect(balls.filter((b) => b.id.startsWith('y'))).toHaveLength(7);
    const eight = balls.find((b) => b.id === '8')!;
    const spot = spotOf(table, 'black')!;
    expect(Math.abs(eight.pos.x - spot.x)).toBeLessThan(0.001);
    expect(Math.abs(eight.pos.y)).toBeLessThan(0.001);
    expect(turn).toMatchObject({ isBreak: true, ballInHand: 'behind-head-string' });
  });

  it('4f: a break worth three points is legal; the table stays open and the breaker continues after a pot', () => {
    const { balls, state: s } = fresh();
    const j = R.judge(
      s,
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('y1'), pot('r2', 'top-left')], { r3: { x: -0.2, y: 0.1 } }),
      INTERNATIONAL_RULES,
    );
    expect(j.rerack).toBeUndefined();
    expect(j.state.groups).toEqual([null, null]);
    expect(j.turn.player).toBe(0);
  });

  it('4g: an illegal break means a re-rack, and the opponent chooses who breaks', () => {
    const { balls, state: s } = fresh();
    const j = R.judge(s, {}, balls, shot(balls, [strike, hit('r1'), rail('y1')]), INTERNATIONAL_RULES);
    expect(j.turn.player).toBe(1);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['break', 'pass']);
    expect(R.decide(j.state, 'pass', j.balls, INTERNATIONAL_RULES).rerack).toEqual({ breaker: 0 });
    expect(R.decide(j.state, 'break', j.balls, INTERNATIONAL_RULES).rerack).toEqual({ breaker: 1 });
  });

  it('4i: the 8 potted on the break is re-spotted', () => {
    const { balls, state: s } = fresh();
    const j = R.judge(
      s,
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('8'), pot('r2'), pot('y1', 'top-left')]),
      INTERNATIONAL_RULES,
    );
    expect(j.frame).toBeNull();
    expect(j.balls.find((b) => b.id === '8')!.state).toBe('stationary');
  });

  it('4j: an in-off on a legal break is loss of turn, played from baulk', () => {
    const { balls, state: s } = fresh();
    const j = R.judge(
      s,
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('r2'), pot('y1'), pot('r3'), pot('cue', 'bottom-left', 0.9)]),
      INTERNATIONAL_RULES,
    );
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'behind-head-string' });
  });
});

describe('English pool: groups and play (International rules)', () => {
  it('6a: the first legal pot decides the groups', () => {
    const balls = fresh().balls;
    const j = R.judge(state(), {}, balls, shot(balls, [strike, hit('y1'), pot('y1')]), INTERNATIONAL_RULES);
    expect(j.state.groups).toEqual(['yellow', 'red']);
    expect(j.turn.player).toBe(0);
  });

  it('6a(4): potting one of each, the player is on the group struck first', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state(),
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('r1'), pot('y1', 'top-left')]),
      INTERNATIONAL_RULES,
    );
    expect(j.state.groups[0]).toBe('red');
  });

  it('6a(5d): hitting one group but potting only the other is loss of turn and the table stays open', () => {
    const balls = fresh().balls;
    const j = R.judge(state(), {}, balls, shot(balls, [strike, hit('r1'), pot('y1')]), INTERNATIONAL_RULES);
    expect(j.state.groups).toEqual([null, null]);
    expect(j.turn.player).toBe(1);
    expect(j.fouls).toEqual([]);
  });

  it('6d: potting an opponent ball without your own is loss of turn, not a foul', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('y1')]),
      INTERNATIONAL_RULES,
    );
    expect(j.fouls).toEqual([]);
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'none' });
  });

  it('6e: a foul gives one visit with ball in hand anywhere', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('y1')]),
      INTERNATIONAL_RULES,
    );
    expect(j.fouls.map((f) => f.code)).toEqual(['wrong-ball-first']);
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'anywhere', visits: 1 });
  });

  it('6p: a legal shot needs a pot or a ball to reach a cushion after contact', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('r1')]),
      INTERNATIONAL_RULES,
    );
    expect(j.fouls.map((f) => f.code)).toEqual(['no-rail']);
  });

  it('6m: an object ball forced off the table is a foul and is re-spotted', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('r1'), rail('r1'), { type: 'off-table', t: 0.7, ball: 'y2' }]),
      INTERNATIONAL_RULES,
    );
    expect(j.fouls.map((f) => f.code)).toEqual(['off-table']);
    expect(j.balls.find((b) => b.id === 'y2')!.state).toBe('stationary');
  });
});

describe('English pool: the 8 (both rulebooks)', () => {
  const onlyEight = () => position({ cue: [0, 0], '8': [0.5, 0], y1: [-0.5, 0.3] });

  it('7: potting the 8 legally after clearing the group wins', () => {
    const balls = onlyEight();
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('8'), pot('8')]),
      INTERNATIONAL_RULES,
    );
    expect(j.frame).toEqual({ winner: 0, reason: 'potted the 8' });
  });

  it('6f(3): fouling while potting the 8 loses the frame', () => {
    const balls = onlyEight();
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('8'), pot('8'), pot('cue', 'top-left', 0.8)]),
      INTERNATIONAL_RULES,
    );
    expect(j.frame?.winner).toBe(1);
  });

  it('6f(4): potting the 8 with group balls still on the table loses the frame, including with the last one', () => {
    const balls = position({ cue: [0, 0], '8': [0.5, 0], r1: [0.3, 0.2], y1: [-0.5, 0.3] });
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('r1'), pot('8', 'top-left')]),
      INTERNATIONAL_RULES,
    );
    expect(j.frame?.winner).toBe(1);
  });
});

describe('English pool: WEPF rules', () => {
  it('F4: a fair break needs a colour potted or four balls to a cushion; otherwise re-rack and the opponent breaks', () => {
    const { balls, state: s } = R.newFrame(WEPF_RULES, new Rng(2), 0);
    const j = R.judge(s, {}, balls, shot(balls, [strike, hit('r1'), rail('y1'), rail('r2')]), WEPF_RULES);
    expect(j.rerack).toEqual({ breaker: 1 });
  });

  it('F5: the 8 on the break means a re-rack with the same breaker', () => {
    const { balls, state: s } = R.newFrame(WEPF_RULES, new Rng(2), 0);
    const j = R.judge(s, {}, balls, shot(balls, [strike, hit('r1'), pot('8')]), WEPF_RULES);
    expect(j.rerack).toEqual({ breaker: 0 });
  });

  it('H2: colours potted on the break mean the breaker chooses; a potted colour is assigned', () => {
    const { balls, state: s } = R.newFrame(WEPF_RULES, new Rng(2), 0);
    const j = R.judge(s, {}, balls, shot(balls, [strike, hit('r1'), pot('r2')]), WEPF_RULES);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['red', 'yellow']);
    expect(R.decide(j.state, 'red', j.balls, WEPF_RULES).state.groups).toEqual(['red', 'yellow']);
    // Choosing a colour that was not potted means it must be potted next to be on it.
    const y = R.decide(j.state, 'yellow', j.balls, WEPF_RULES);
    expect(y.state.groups).toEqual([null, null]);
    expect(y.state.pendingGroup).toBe('yellow');
  });

  it('K: a foul gives the opponent two visits, playing from where the cue ball lies', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('y1')]),
      WEPF_RULES,
    );
    expect(j.turn).toMatchObject({ player: 1, visits: 2, ballInHand: 'none' });
    // The first visit ends with a miss: the same player has a second visit.
    const miss = R.judge(j.state, {}, j.balls, shot(j.balls, [strike, hit('y1'), rail('y1')]), WEPF_RULES);
    expect(miss.turn).toMatchObject({ player: 1, visits: 1 });
    expect(miss.message).toContain('second visit');
  });

  it('K3: potting an opponent ball is a standard foul', () => {
    const balls = fresh().balls;
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, hit('r1'), pot('r1'), pot('y1', 'top-left')]),
      WEPF_RULES,
    );
    expect(j.fouls.map((f) => f.code)).toEqual(['wrong-ball-potted']);
  });

  it('G3b: totally snookered, only the first contact is required', () => {
    // The only red is boxed in by yellows: no straight line reaches any part of it.
    const balls = position({
      cue: [-0.6, 0],
      r1: [0.4, 0],
      y1: [0.3, 0],
      y2: [0.4, 0.06],
      y3: [0.4, -0.06],
      y4: [0.5, 0],
      '8': [0.9, 0.3],
    });
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      balls,
      shot(balls, [strike, rail('cue', 0.2), hit('r1', 0.5)]),
      WEPF_RULES,
    );
    expect(j.fouls).toEqual([]);
  });

  it('P: after a foul that leaves the next player snookered, they may nominate an opponent ball', () => {
    const before = position({
      cue: [-0.6, 0.3],
      r1: [0.4, 0],
      y1: [0.25, 0],
      y2: [-0.3, 0.2],
      '8': [0.9, 0.3],
    });
    // Red player fouls (hits a yellow first) and leaves the cue ball behind y1, so the yellow player...
    // is on yellows; make the cue ball end where the yellows are blocked by the red instead.
    const j = R.judge(
      state({ groups: ['red', 'yellow'] }),
      {},
      before,
      shot(before, [strike, hit('y2')], { cue: { x: 0.6, y: 0 }, y2: { x: 0.0, y: 0 } }),
      WEPF_RULES,
    );
    expect(j.turn.player).toBe(1);
    expect(j.message).toContain('Foul snooker');
    expect(j.turn).toMatchObject({ mustNominate: true, freeBall: true });
    expect(j.turn.targets).toContain('r1');
  });
});
