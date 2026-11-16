import { AMERICAN_POOL_9FT as T, DEFAULT_CUE } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { applyStrike } from './strike';
import { cueAt, deg, shot, speed } from './test-utils';

describe('cue strike', () => {
  it('a centre hit gives no spin and a launch speed set by the cue/ball mass ratio', () => {
    const b = cueAt(T, 0, 0);
    const out = applyStrike(b, shot({ speed: 3 }));
    expect(out.miscue).toBe(false);
    expect(b.spin.x).toBeCloseTo(0, 12);
    expect(b.spin.y).toBeCloseTo(0, 12);
    expect(b.spin.z).toBeCloseTo(0, 12);
    const expected = ((1 + DEFAULT_CUE.tipRestitution) * 3) / (1 + b.mass / DEFAULT_CUE.mass);
    expect(speed(b)).toBeCloseTo(expected, 10);
  });

  it('a top hit gives topspin, a bottom hit gives backspin', () => {
    const top = cueAt(T, 0, 0);
    applyStrike(top, shot({ tip: { a: 0, b: 0.4 } }));
    const bottom = cueAt(T, 0, 0);
    applyStrike(bottom, shot({ tip: { a: 0, b: -0.4 } }));
    expect(top.spin.y).toBeGreaterThan(0);
    expect(bottom.spin.y).toBeLessThan(0);
    // A hit at 2/5 R above centre gives natural roll straight away.
    const natural = cueAt(T, 0, 0);
    applyStrike(natural, shot({ tip: { a: 0, b: 0.4 } }));
    expect(natural.spin.y * natural.radius).toBeCloseTo(natural.vel.x, 2);
    expect(natural.state).toBe('rolling');
  });

  it('right-hand side spins the ball anticlockwise from above and squirts it left', () => {
    const b = cueAt(T, 0, 0);
    const out = applyStrike(b, shot({ tip: { a: 0.5, b: 0 } }));
    expect(b.spin.z).toBeGreaterThan(0);
    expect(b.vel.y).toBeGreaterThan(0);
    // Alciatore's measurements put half-tip squirt at about 1.5–3.5° for typical cues.
    expect(deg(out.squirt)).toBeGreaterThan(1);
    expect(deg(out.squirt)).toBeLessThan(4);
  });

  it('left and right side are mirror images', () => {
    const r = cueAt(T, 0, 0);
    const l = cueAt(T, 0, 0);
    applyStrike(r, shot({ tip: { a: 0.3, b: 0.1 }, aim: 0 }));
    applyStrike(l, shot({ tip: { a: -0.3, b: 0.1 }, aim: 0 }));
    expect(l.vel.x).toBeCloseTo(r.vel.x, 12);
    expect(l.vel.y).toBeCloseTo(-r.vel.y, 12);
    expect(l.spin.z).toBeCloseTo(-r.spin.z, 12);
  });

  it('miscues beyond the miscue limit', () => {
    const b = cueAt(T, 0, 0);
    const out = applyStrike(b, shot({ tip: { a: 0.6, b: 0.3 }, speed: 3 }));
    expect(out.miscue).toBe(true);
    expect(speed(b)).toBeLessThan(2);
  });
});
