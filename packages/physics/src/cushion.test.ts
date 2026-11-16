import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { collideCushion } from './cushion';
import { classify } from './motion';
import { cueAt, deg, kinetic } from './test-utils';

const R = T.balls.cue.radius;
/** Normal pointing from the right-hand short rail back towards the table. */
const N = { x: -1, y: 0 };

function rollingBall(vx: number, vy: number, wz = 0) {
  const b = cueAt(T, 1, 0);
  b.vel = { x: vx, y: vy };
  b.spin = { x: -vy / R, y: vx / R, z: wz };
  b.state = classify(b);
  return b;
}

const hit = (b: ReturnType<typeof rollingBall>) => collideCushion(b, N, T.cushion, T.cloth.slideFriction);

describe('cushion collisions (Mathavan 2010)', () => {
  it('a head-on rolling ball rebounds slower, with the right speed ratio', () => {
    const b = rollingBall(2, 0);
    expect(hit(b)).toBeCloseTo(2, 12);
    expect(b.vel.x).toBeLessThan(0);
    const ratio = -b.vel.x / 2;
    // Measured rebound ratios for pool cushions are roughly 0.6–0.85 at this speed.
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.9);
    expect(b.vel.y).toBeCloseTo(0, 12);
  });

  it('ignores a ball moving away from the cushion', () => {
    const b = rollingBall(-1, 0.2);
    expect(hit(b)).toBe(0);
    expect(b.vel).toEqual({ x: -1, y: 0.2 });
  });

  it('left and right side mirror each other', () => {
    const l = rollingBall(1.5, 0, 30);
    const r = rollingBall(1.5, 0, -30);
    hit(l);
    hit(r);
    expect(l.vel.y).toBeCloseTo(-r.vel.y, 10);
    expect(l.vel.x).toBeCloseTo(r.vel.x, 10);
    expect(Math.abs(l.vel.y)).toBeGreaterThan(0.05);
  });

  it('running side widens the rebound angle, check side narrows it', () => {
    // Ball arriving at 45° heading towards +y. Running side for this bank is wz < 0.
    const angleOut = (wz: number) => {
      const b = rollingBall(1, 1, wz);
      hit(b);
      return deg(Math.atan2(b.vel.y, -b.vel.x)); // angle from the normal
    };
    const plain = angleOut(0);
    expect(angleOut(-40)).toBeGreaterThan(plain + 3);
    // Without side, friction already acts against the ball's run along the cushion for most of
    // the impact, so check side narrows the angle less than running side widens it.
    expect(angleOut(40)).toBeLessThan(plain - 1);
  });

  it('a rolling ball rebounds off a cushion at roughly its incoming angle at medium pace', () => {
    const b = rollingBall(1, 1);
    hit(b);
    const out = deg(Math.atan2(b.vel.y, -b.vel.x));
    expect(out).toBeGreaterThan(30);
    expect(out).toBeLessThan(65);
  });

  it('a ball grazing the cushion hugs it instead of bouncing away', () => {
    const graze = rollingBall(0.05, 1.5);
    hit(graze);
    // Barely any speed away from the cushion, so the ball keeps running along it.
    expect(-graze.vel.x).toBeLessThan(0.02);
    const firm = rollingBall(1, 1);
    hit(firm);
    expect(-firm.vel.x).toBeGreaterThan(0.5);
  });

  it('never adds energy', () => {
    for (const [vx, vy, wz] of [
      [0.5, 0, 0],
      [3, 1, 20],
      [6, -2, -40],
      [1, 3, 10],
    ] as const) {
      const b = rollingBall(vx, vy, wz);
      const before = kinetic(b);
      hit(b);
      expect(kinetic(b)).toBeLessThan(before);
    }
  });

  it('restitution falls with impact speed', () => {
    const slow = rollingBall(0.5, 0);
    const fast = rollingBall(5, 0);
    hit(slow);
    hit(fast);
    expect(-fast.vel.x / 5).toBeLessThan(-slow.vel.x / 0.5);
  });
});
