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
});
