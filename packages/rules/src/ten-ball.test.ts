import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { footSpot } from './placement';
import { TEN_BALL, type RotationState } from './rotation';

const R = TEN_BALL;
const opts = R.defaults;

function shot(before: BallState[], events: PhysicsEvent[]): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket' && e.type !== 'off-table') continue;
    const b = final.find((x) => x.id === e.ball);
    if (!b) continue;
    b.state = 'pocketed';
    if (e.type === 'pocket') b.pocket = e.pocket;
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}

const strike: PhysicsEvent = { type: 'strike', t: 0, ball: 'cue', speed: 5, miscue: false };
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 3 });
const rail = (ball: string, t = 0.5): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});
const pot = (ball: string, pocket = 'top-right', t = 0.6): PhysicsEvent => ({
  type: 'pocket',
  t,
  ball,
  pocket,
});

const fresh = () => R.newFrame(opts, new Rng(5), 0);
function midRack(over: Partial<RotationState> = {}) {
  const { balls } = fresh();
  return {
    balls,
    state: { phase: 'play', shooter: 0, fouls: [0, 0], ballInHand: 'none', ...over } as RotationState,
  };
}

describe('10-ball', () => {
  it('racks ten balls in a triangle: the 1 on the foot spot, the 10 in the middle', () => {
    const { balls, turn } = fresh();
    expect(balls.filter((b) => b.id !== 'cue')).toHaveLength(10);
    const one = balls.find((b) => b.id === '1')!;
    const ten = balls.find((b) => b.id === '10')!;
    expect(Math.abs(one.pos.x - footSpot(R.table).x)).toBeLessThan(0.001);
    expect(Math.abs(ten.pos.y)).toBeLessThan(0.001);
    expect(ten.pos.x).toBeGreaterThan(one.pos.x + 0.08);
    expect(turn).toMatchObject({ isBreak: true, mustCall: false, ballInHand: 'behind-head-string' });
  });

  it('the 10 potted on the break is spotted, and the breaker continues', () => {
    const { balls, state } = fresh();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('10')]), opts);
    expect(j.frame).toBeNull();
    expect(j.balls.find((b) => b.id === '10')!.state).toBe('stationary');
    expect(j.turn).toMatchObject({ player: 0, mustCall: true, canPushOut: true });
  });

  it('a called ball in the called pocket keeps the shooter at the table', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '1', pocket: 'top-right' } },
      balls,
      shot(balls, [strike, hit('1'), pot('1')]),
      opts,
    );
    expect(j.turn).toMatchObject({ player: 0, decision: null, mustCall: true });
  });

  it('a ball potted in the wrong pocket gives the opponent the option', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '1', pocket: 'top-left' } },
      balls,
      shot(balls, [strike, hit('1'), pot('1', 'top-right')]),
      opts,
    );
    expect(j.fouls).toEqual([]);
    expect(j.turn.player).toBe(1);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['play', 'pass']);
    // The ball stays down even though it was not called.
    expect(j.balls.find((b) => b.id === '1')!.state).toBe('pocketed');
    const passed = R.decide(j.state, 'pass', j.balls, opts);
    expect(passed.turn.player).toBe(0);
  });

  it('an uncalled ball dropping as well as the called one still counts as made', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '1', pocket: 'top-right' } },
      balls,
      shot(balls, [strike, hit('1'), pot('1'), pot('5', 'bottom-left', 0.7)]),
      opts,
    );
    expect(j.turn).toMatchObject({ player: 0, decision: null });
  });

  it('the 10 called and potted wins, including on a combination', () => {
    const { balls, state } = midRack();
    const events: PhysicsEvent[] = [
      strike,
      hit('1'),
      { type: 'ball', t: 0.3, a: '1', b: '10', speed: 2 },
      pot('10'),
    ];
    const j = R.judge(state, { call: { ball: '10', pocket: 'top-right' } }, balls, shot(balls, events), opts);
    expect(j.frame).toEqual({ winner: 0, reason: 'potted the 10' });
  });

  it('the 10 potted without being called is spotted and the opponent has the option', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '1', pocket: 'top-right' } },
      balls,
      shot(balls, [strike, hit('1'), pot('10', 'bottom-left')]),
      opts,
    );
    expect(j.frame).toBeNull();
    expect(j.balls.find((b) => b.id === '10')!.state).toBe('stationary');
    expect(j.turn.decision).not.toBeNull();
  });

  it('a declared safety passes the turn with no option, and balls potted stay down', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, { safety: true }, balls, shot(balls, [strike, hit('1'), pot('4')]), opts);
    expect(j.turn).toMatchObject({ player: 1, decision: null, ballInHand: 'none' });
    expect(j.balls.find((b) => b.id === '4')!.state).toBe('pocketed');
  });

  it('a called shot that misses with nothing potted just passes the turn', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '1', pocket: 'top-right' } },
      balls,
      shot(balls, [strike, hit('1'), rail('1')]),
      opts,
    );
    expect(j.turn).toMatchObject({ player: 1, decision: null, ballInHand: 'none' });
  });

  it('fouls are judged as in 9-ball', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      { call: { ball: '3', pocket: 'top-right' } },
      balls,
      shot(balls, [strike, hit('3'), pot('3')]),
      opts,
    );
    expect(j.fouls.map((f) => f.code)).toEqual(['wrong-ball-first']);
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'anywhere' });
  });
});
