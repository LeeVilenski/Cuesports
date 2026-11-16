import { makeBall } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { powerToSpeed } from './games';
import { computeGuide } from './guide';

describe('aiming guide', () => {
  const cue = makeBall('cue', T.balls.cue, { x: -0.5, y: 0 });
  const obj = makeBall('1', T.balls.object, { x: 0, y: 0 });

  it('puts the ghost ball touching the object ball on a straight shot', () => {
    const g = computeGuide(T, [cue, obj], 'cue', 0)!;
    expect(g.ghost!.x).toBeCloseTo(-2 * T.balls.object.radius, 9);
    expect(g.object!.dir.x).toBeCloseTo(1, 9);
    expect(g.tangent).toBeNull();
  });

  it('sends the cue ball off on the far side of a cut', () => {
    // Aim slightly left (+y) of full: the object ball goes right (−y), the cue ball left (+y).
    const g = computeGuide(T, [cue, obj], 'cue', 0.03)!;
    expect(g.object!.dir.y).toBeLessThan(0);
    expect(g.tangent!.y).toBeGreaterThan(0);
  });

  it('runs to the cushion when nothing is in the way', () => {
    const g = computeGuide(T, [cue, obj], 'cue', Math.PI)!;
    expect(g.ghost).toBeNull();
    expect(g.end.x).toBeCloseTo(-T.playfield.length / 2 + T.balls.cue.radius, 9);
  });
});

describe('power curve', () => {
  it('is monotonic from a soft touch to the maximum', () => {
    expect(powerToSpeed(0, 9)).toBeCloseTo(0.25);
    expect(powerToSpeed(1, 9)).toBeCloseTo(9);
    expect(powerToSpeed(0.5, 9)).toBeLessThan(4.6);
  });
});
