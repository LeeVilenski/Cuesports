import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { STRAIGHT_POOL as R, type StraightState } from './straight';

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

function start(): { s: StraightState; balls: BallState[] } {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, opening: false, inHand: false }, balls: f.balls };
}

describe('Straight pool', () => {
  it('needs every shot called', () => {
    expect(R.newFrame(R.defaults, new Rng(1), 0).turn.mustCall).toBe(true);
  });

  it('scores every ball when the called ball drops in its pocket', () => {
    const { s, balls } = start();
    const j = R.judge(
      s,
      { call: { ball: '3', pocket: 'top-right' } },
      balls,
      shot(balls, [hit('3'), pot('3'), pot('7', 'bottom-left')]),
      R.defaults,
    );
    expect(j.points).toEqual([2, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('spots balls and passes the turn when the call is missed', () => {
    const { s, balls } = start();
    const j = R.judge(
      s,
      { call: { ball: '3', pocket: 'top-left' } },
      balls,
      shot(balls, [hit('3'), pot('3')]),
      R.defaults,
    );
    expect(j.points).toEqual([0, 0]);
    expect(j.balls.find((b) => b.id === '3')!.state).toBe('stationary');
    expect(j.turn.player).toBe(1);
  });

  it('costs 2 for a break that does not drive two balls and the cue ball to a cushion', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    const j = R.judge(f.state, { safety: true }, f.balls, shot(f.balls, [hit('1'), rail('2')]), R.defaults);
    expect(j.points).toEqual([-2, 0]);
  });

  it('takes 15 more on the third foul in a row', () => {
    const { s, balls } = start();
    const j = R.judge({ ...s, fouls: [2, 0] }, { safety: true }, balls, shot(balls, []), R.defaults);
    expect(j.points).toEqual([-16, 0]);
  });

  it('racks the 14 again when one ball is left', () => {
    const { s, balls } = start();
    // Pot down to two balls, then pot one of them.
    for (const b of balls) if (b.id !== 'cue' && b.id !== '1' && b.id !== '2') b.state = 'pocketed';
    balls.find((b) => b.id === '1')!.pos = { x: -0.3, y: 0.3 };
    balls.find((b) => b.id === 'cue')!.pos = { x: -0.8, y: 0 };
    const j = R.judge(
      s,
      { call: { ball: '2', pocket: 'top-right' } },
      balls,
      shot(balls, [hit('2'), pot('2')]),
      R.defaults,
    );
    expect(j.points).toEqual([1, 0]);
    expect(j.balls.filter((b) => b.id !== 'cue' && b.state !== 'pocketed')).toHaveLength(15);
    expect(j.message).toMatch(/racked again/);
  });
});
