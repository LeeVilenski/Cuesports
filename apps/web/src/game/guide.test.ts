import { applyStrike, makeBall } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T, DEFAULT_CUE } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { powerToSpeed, strokeSpeed } from './games';
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
    expect(powerToSpeed(0.5, 9)).toBeLessThan(2.6);
  });
});

describe('stroke compensation', () => {
  it('leaves centre-ball hits alone', () => {
    expect(strokeSpeed(3, { a: 0, b: 0 }, 0.17, DEFAULT_CUE.mass)).toBe(3);
  });

  it('keeps an off-centre hit within ~15% of the pace of a centre hit', () => {
    const launch = (tip: { a: number; b: number }) => {
      const b = makeBall('cue', T.balls.cue, { x: 0, y: 0 });
      applyStrike(b, {
        ball: 'cue',
        aim: 0,
        elevation: 0,
        tip,
        speed: strokeSpeed(3, tip, b.mass, DEFAULT_CUE.mass),
      });
      return Math.hypot(b.vel.x, b.vel.y);
    };
    const centre = launch({ a: 0, b: 0 });
    for (const tip of [
      { a: 0, b: -0.5 },
      { a: 0, b: 0.45 },
      { a: 0.35, b: -0.35 },
    ]) {
      expect(launch(tip) / centre).toBeGreaterThan(0.85);
    }
  });
});
