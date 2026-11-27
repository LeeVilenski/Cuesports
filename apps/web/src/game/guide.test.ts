import { applyStrike, makeBall } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T, DEFAULT_CUE } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { powerToSpeed, strokeSpeed } from './games';
import { computeGuide, launchDirection } from './guide';

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

  it('makes up part of the pace an off-centre hit loses', () => {
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
      expect(launch(tip) / centre).toBeGreaterThan(0.75);
    }
  });
});

describe('launch direction (guide with squirt)', () => {
  const cue = makeBall('cue', T.balls.cue, { x: 0, y: 0 });
  const shotWith = (a: number) => ({ ball: 'cue', aim: 0.3, elevation: 0, tip: { a, b: 0 }, speed: 2 });

  it('is the aim for a centre-ball hit', () => {
    expect(launchDirection(cue, shotWith(0))).toBeCloseTo(0.3, 12);
  });

  it('turns left for right-hand side and right for left-hand side, by a degree or two at most', () => {
    const right = launchDirection(cue, shotWith(0.4)) - 0.3;
    const left = launchDirection(cue, shotWith(-0.4)) - 0.3;
    expect(right).toBeGreaterThan(0);
    expect(left).toBeCloseTo(-right, 12);
    expect((right * 180) / Math.PI).toBeLessThan(2);
  });

  it('matches where the cue ball really goes', () => {
    const b = { ...cue, pos: { ...cue.pos } };
    applyStrike(b, shotWith(0.3));
    expect(Math.atan2(b.vel.y, b.vel.x)).toBeCloseTo(launchDirection(cue, shotWith(0.3)), 12);
  });
});

describe('3-cushion path', () => {
  it('follows the cue ball off the first ball round three cushions', async () => {
    const { CAROM_10FT: C } = await import('@cuesports/shared');
    const { cushionPath } = await import('./guide');
    const balls = [
      makeBall('cue', C.balls.cue, { x: -0.6, y: -0.2 }),
      makeBall('white', C.balls.object, { x: 0, y: 0 }),
      makeBall('red', C.balls.object, { x: 1.2, y: 0.6 }),
    ];
    // A half-ball hit on the white, with a little follow.
    const aim = Math.atan2(0.2 + C.balls.object.radius, 0.6);
    const g = computeGuide(C, balls, 'cue', aim)!;
    expect(g.object?.id).toBe('white');
    const pts = cushionPath(C, balls, g, 'cue', 0.2, 3);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    const hl = C.playfield.length / 2 - g.radius;
    const hw = C.playfield.width / 2 - g.radius;
    // Every point between the ends is on a cushion line.
    for (const p of pts.slice(1, -1))
      expect(Math.abs(Math.abs(p.x) - hl) < 1e-6 || Math.abs(Math.abs(p.y) - hw) < 1e-6).toBe(true);
  });

  it('starts at the first cushion on a cushion-first shot, and stops at a ball', async () => {
    const { CAROM_10FT: C } = await import('@cuesports/shared');
    const { cushionPath } = await import('./guide');
    const hw = C.playfield.width / 2 - C.balls.cue.radius;
    const balls = [
      makeBall('cue', C.balls.cue, { x: -0.5, y: 0 }),
      // Straight up to the cushion and back down onto this ball.
      makeBall('red', C.balls.object, { x: -0.5 + 2 * hw * 0.5, y: 0 }),
    ];
    const g = computeGuide(C, balls, 'cue', Math.atan2(hw, hw * 0.5))!;
    expect(g.object).toBeNull();
    const pts = cushionPath(C, balls, g, 'cue', 0, 3);
    expect(pts[0]).toEqual(g.end);
    const last = pts.at(-1)!;
    expect(Math.hypot(last.x - balls[1]!.pos.x, last.y)).toBeCloseTo(2 * C.balls.cue.radius, 2);
  });
});
