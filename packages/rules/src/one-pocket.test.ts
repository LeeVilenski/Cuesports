import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { ONE_POCKET as R } from './one-pocket';

function shot(before: BallState[], events: PhysicsEvent[]): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket') continue;
    const b = final.find((x) => x.id === e.ball)!;
    b.state = 'pocketed';
    b.pocket = e.pocket;
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const hit = (b: string): PhysicsEvent => ({ type: 'ball', t: 0.1, a: 'cue', b, speed: 3 });
const pot = (ball: string, pocket: string): PhysicsEvent => ({ type: 'pocket', t: 0.6, ball, pocket });

function chosen() {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  expect(f.turn.decision?.choices).toHaveLength(2);
  const d = R.decide(f.state, 'top-right', f.balls, R.defaults);
  return { s: { ...d.state, opening: false, inHand: false }, balls: f.balls };
}

describe('One-pocket', () => {
  it('lets the breaker choose a foot pocket; the opponent gets the other', () => {
    const { s } = chosen();
    expect(s.pockets).toEqual(['top-right', 'bottom-right']);
  });

  it('scores balls in your pocket and continues', () => {
    const { s, balls } = chosen();
    const j = R.judge(s, {}, balls, shot(balls, [hit('1'), pot('1', 'top-right')]), R.defaults);
    expect(j.points).toEqual([1, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('credits the opponent for a ball in their pocket, and spots balls in the others', () => {
    const { s, balls } = chosen();
    const j = R.judge(
      s,
      {},
      balls,
      shot(balls, [hit('1'), pot('1', 'bottom-right'), pot('2', 'top-left')]),
      R.defaults,
    );
    expect(j.points).toEqual([0, 1]);
    expect(j.balls.find((b) => b.id === '2')!.state).toBe('stationary');
    expect(j.turn.player).toBe(1);
  });

  it('takes a point for a scratch', () => {
    const { s, balls } = chosen();
    const j = R.judge(s, {}, balls, shot(balls, [hit('1'), pot('cue', 'top-left')]), R.defaults);
    expect(j.points).toEqual([-1, 0]);
    expect(j.turn.ballInHand).toBe('behind-head-string');
  });

  const inPocket = (balls: BallState[], p: string) =>
    balls.filter((b) => b.state === 'pocketed' && b.pocket === p).length;
  const scratch = (balls: BallState[]) => shot(balls, [hit('1'), pot('cue', 'top-left')]);

  it('returns a ball from your pocket when a foul costs you a point', () => {
    const { s, balls } = chosen();
    const a = R.judge(s, {}, balls, shot(balls, [hit('1'), pot('1', 'top-right')]), R.defaults);
    const b = R.judge(a.state, {}, a.balls, scratch(a.balls), R.defaults);
    expect(b.points).toEqual([0, 0]);
    expect(inPocket(b.balls, 'top-right')).toBe(0);
    expect(b.balls.find((x) => x.id === '1')!.state).toBe('stationary');
  });

  it('owes a ball when fouling on no points, and pays it once a run ends on 1 or more', () => {
    const { s, balls } = chosen();
    const a = R.judge(s, {}, balls, scratch(balls), R.defaults);
    expect(a.points).toEqual([-1, 0]);
    expect(a.state.owed).toEqual([1, 0]);
    // Back to player 0 (opponent misses), who runs three then misses.
    const back = { ...a.state, shooter: 0 as const, inHand: false };
    let j = R.judge(back, {}, a.balls, shot(a.balls, [hit('2'), pot('2', 'top-right')]), R.defaults);
    j = R.judge(j.state, {}, j.balls, shot(j.balls, [hit('3'), pot('3', 'top-right')]), R.defaults);
    expect(j.state.owed).toEqual([1, 0]); // not until the run ends
    j = R.judge(j.state, {}, j.balls, shot(j.balls, [hit('4'), pot('4', 'top-right')]), R.defaults);
    j = R.judge(
      j.state,
      {},
      j.balls,
      shot(j.balls, [hit('5'), { type: 'cushion', t: 0.3, ball: '5', segment: 'r', kind: 'rail', speed: 1 }]),
      R.defaults,
    );
    expect(j.points).toEqual([2, 0]);
    expect(j.state.owed).toEqual([0, 0]);
    expect(inPocket(j.balls, 'top-right')).toBe(2);
  });

  it('keeps owing while a finished run leaves you below 1', () => {
    const { s, balls } = chosen();
    const a = R.judge(s, {}, balls, scratch(balls), R.defaults);
    const back = { ...a.state, shooter: 0 as const, inHand: false };
    let j = R.judge(back, {}, a.balls, shot(a.balls, [hit('2'), pot('2', 'top-right')]), R.defaults);
    j = R.judge(
      j.state,
      {},
      j.balls,
      shot(j.balls, [hit('3'), { type: 'cushion', t: 0.3, ball: '3', segment: 'r', kind: 'rail', speed: 1 }]),
      R.defaults,
    );
    expect(j.points).toEqual([0, 0]);
    expect(j.state.owed).toEqual([1, 0]);
    expect(inPocket(j.balls, 'top-right')).toBe(1);
  });
});
