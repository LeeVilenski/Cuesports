import { describe, expect, it } from 'vitest';
import { detCos, detExp, detSin } from './math';
import { Rng } from './rng';

describe('deterministic math', () => {
  it('detSin/detCos match Math.sin/cos closely', () => {
    for (let x = -50; x <= 50; x += 0.0137) {
      expect(Math.abs(detSin(x) - Math.sin(x))).toBeLessThan(1e-14);
      expect(Math.abs(detCos(x) - Math.cos(x))).toBeLessThan(1e-14);
    }
  });

  it('detExp matches Math.exp closely', () => {
    for (let x = -40; x <= 40; x += 0.0173) {
      expect(Math.abs(detExp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-14);
    }
  });
});

describe('Rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('produces a known sequence (guards against accidental changes)', () => {
    const r = new Rng(1);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toMatchSnapshot();
  });

  it('next() is in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
