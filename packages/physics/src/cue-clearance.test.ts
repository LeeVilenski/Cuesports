import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { cueClearElevation } from './cue-clearance';
import { makeBall } from './layouts';
import type { ShotInput } from './types';

const R = T.balls.cue.radius;
const hl = T.playfield.length / 2;
const toDeg = (r: number) => (r * 180) / Math.PI;
const shot = (aim: number, b = 0, elevation = 0): ShotInput => ({
  ball: 'cue',
  aim,
  elevation,
  tip: { a: 0, b },
  speed: 2,
});

describe('cue clearance', () => {
  it('leaves the cue level on an open table', () => {
    const balls = [makeBall('cue', T.balls.cue, { x: 0, y: 0 })];
    expect(cueClearElevation(T, balls, shot(0))).toBe(0);
    expect(cueClearElevation(T, balls, shot(0, 0, 0.2))).toBe(0.2);
  });

  it('raises the cue over the cushion when the cue ball is frozen to it; hitting higher needs less', () => {
    // Cue ball touching the right-hand cushion, shot towards the left (the cue comes over the rail).
    const balls = [makeBall('cue', T.balls.cue, { x: hl - R, y: 0 })];
    const centre = toDeg(cueClearElevation(T, balls, shot(Math.PI)));
    const high = toDeg(cueClearElevation(T, balls, shot(Math.PI, 0.5)));
    expect(centre).toBeGreaterThan(25);
    expect(high).toBeGreaterThan(3);
    expect(high).toBeLessThan(centre - 10);
    // Shooting away from the cushion is unaffected.
    expect(cueClearElevation(T, balls, shot(0))).toBe(0);
  });

  it('needs a little elevation near the cushion and none further out', () => {
    const near = [makeBall('cue', T.balls.cue, { x: hl - R - 0.03, y: 0 })];
    const far = [makeBall('cue', T.balls.cue, { x: hl - R - 0.6, y: 0 })];
    expect(toDeg(cueClearElevation(T, near, shot(Math.PI)))).toBeGreaterThan(1);
    expect(cueClearElevation(T, far, shot(Math.PI))).toBe(0);
  });

  it('raises the cue over a ball behind the cue ball', () => {
    const close = [
      makeBall('cue', T.balls.cue, { x: 0, y: 0 }),
      makeBall('3', T.balls.object, { x: -2.05 * R, y: 0 }),
    ];
    const away = [
      makeBall('cue', T.balls.cue, { x: 0, y: 0 }),
      makeBall('3', T.balls.object, { x: -0.2, y: 0 }),
    ];
    const aside = [
      makeBall('cue', T.balls.cue, { x: 0, y: 0 }),
      makeBall('3', T.balls.object, { x: -0.3, y: 0.1 }),
    ];
    const c = toDeg(cueClearElevation(T, close, shot(0)));
    const a = toDeg(cueClearElevation(T, away, shot(0)));
    expect(c).toBeGreaterThan(30);
    expect(a).toBeGreaterThan(1);
    expect(a).toBeLessThan(c);
    expect(cueClearElevation(T, aside, shot(0))).toBe(0);
    // Far back, the cue's natural lift is enough (or nearly).
    const beyond = [
      makeBall('cue', T.balls.cue, { x: 0, y: 0 }),
      makeBall('3', T.balls.object, { x: -0.6, y: 0 }),
    ];
    expect(toDeg(cueClearElevation(T, beyond, shot(0)))).toBeLessThan(1);
  });
});
