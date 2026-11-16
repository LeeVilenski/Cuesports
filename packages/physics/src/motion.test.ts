import { AMERICAN_POOL_9FT as T, quatIdentity } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { advanceBall, classify } from './motion';
import { simulate } from './simulate';
import { applyStrike } from './strike';
import { byId, cueAt, shot, speed } from './test-utils';

const g = 9.81;
const R = T.balls.cue.radius;

describe('ball motion', () => {
  it('a centre-ball hit slides, then rolls at 5/7 of its launch speed', () => {
    const b = cueAt(T, 0, 0);
    applyStrike(b, shot({ speed: 2 }));
    const v0 = speed(b);
    expect(b.state).toBe('sliding');
    const tSlide = (2 * v0) / (7 * T.cloth.slideFriction * g);
    advanceBall(b, tSlide + 1e-9, T.cloth, g);
    expect(b.state).toBe('rolling');
    expect(speed(b) / v0).toBeCloseTo(5 / 7, 3);
    // Slide distance for a stun-launched ball is 12 v² / (49 μs g).
    expect(b.pos.x).toBeCloseTo((12 * v0 * v0) / (49 * T.cloth.slideFriction * g), 3);
    // Rolling spin is consistent with the velocity.
    expect(b.spin.y * R).toBeCloseTo(b.vel.x, 9);
  });

  it('a rolling ball stops after v² / (2 μr g)', () => {
    const b = cueAt(T, 0, 0);
    b.vel = { x: 1, y: 0 };
    b.spin = { x: 0, y: 1 / R, z: 0 };
    b.state = classify(b);
    expect(b.state).toBe('rolling');
    advanceBall(b, 100, T.cloth, g);
    expect(b.state).toBe('stationary');
    expect(b.pos.x).toBeCloseTo(1 / (2 * T.cloth.rollFriction * g), 6);
  });

  it('sidespin on a stationary ball decays to rest', () => {
    const b = cueAt(T, 0, 0);
    b.spin = { x: 0, y: 0, z: 20 };
    b.state = classify(b);
    expect(b.state).toBe('spinning');
    advanceBall(b, 100, T.cloth, g);
    expect(b.state).toBe('stationary');
    expect(b.pos).toEqual({ x: 0, y: 0 });
    expect(b.orient).not.toEqual(quatIdentity());
  });

  it('a draw shot reverses spin direction relative to travel while sliding', () => {
    const b = cueAt(T, 0, 0);
    applyStrike(b, shot({ tip: { a: 0, b: -0.4 }, speed: 2 }));
    expect(b.spin.y).toBeLessThan(0);
  });

  it('an elevated cue with side spin swerves the cue ball (masse)', () => {
    const balls = [cueAt(T, -1, 0)];
    const straight = simulate(T, balls, shot({ speed: 1.5 }), { sampleRate: 0 });
    const masse = simulate(T, balls, shot({ speed: 1.5, tip: { a: 0.4, b: 0 }, elevation: 0.5 }), {
      sampleRate: 0,
    });
    expect(byId(straight.final, 'cue').pos.y).toBeCloseTo(0, 9);
    // Right-hand side with an elevated cue curves the ball to the right (−y when aiming along +x).
    expect(byId(masse.final, 'cue').pos.y).toBeLessThan(-0.01);
  });
});
