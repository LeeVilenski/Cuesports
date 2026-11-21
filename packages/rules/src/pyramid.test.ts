import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { RUSSIAN_PYRAMID as R, type PyramidState } from './pyramid';

function shot(before: BallState[], events: PhysicsEvent[]): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket' && e.type !== 'off-table') continue;
    const b = final.find((x) => x.id === e.ball)!;
    b.state = 'pocketed';
    if (e.type === 'pocket') b.pocket = e.pocket;
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'pcue', b, speed: 3 });
const pot = (ball: string, t = 0.6): PhysicsEvent => ({ type: 'pocket', t, ball, pocket: 'top-right' });
const rail = (ball: string, t = 0.5): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});

function start(): { s: PyramidState; balls: BallState[] } {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, opening: false, inHand: false }, balls: f.balls };
}

describe('Russian Pyramid', () => {
  it('racks fifteen balls and breaks from behind the head string with the coloured ball', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.balls).toHaveLength(16);
    expect(f.turn.cueBall).toBe('pcue');
    expect(f.turn.ballInHand).toBe('behind-head-string');
  });

  it('scores every ball potted and keeps the turn', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), pot('p1'), pot('p5', 0.7)]), R.defaults);
    expect(j.points).toEqual([2, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('scores an in-off and gives the cue ball in hand', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), pot('pcue')]), R.defaults);
    expect(j.points).toEqual([1, 0]);
    expect(j.turn.ballInHand).toBe('behind-head-string');
  });

  it('passes the turn after a safe shot that reaches a cushion', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), rail('p1')]), R.defaults);
    expect(j.fouls).toEqual([]);
    expect(j.turn.player).toBe(1);
  });

  it('takes a point for a foul and spots balls potted on it', () => {
    const { s, balls } = start();
    const miss = R.judge(s, {}, balls, shot(balls, []), R.defaults);
    expect(miss.points).toEqual([-1, 0]);
    const noRail = R.judge(s, {}, balls, shot(balls, [hit('p1')]), R.defaults);
    expect(noRail.fouls[0]?.code).toBe('no-rail');
  });

  it('wins at 8', () => {
    const { s, balls } = start();
    const j = R.judge({ ...s, scores: [7, 3] }, {}, balls, shot(balls, [hit('p1'), pot('p1')]), R.defaults);
    expect(j.frame?.winner).toBe(0);
  });
});
