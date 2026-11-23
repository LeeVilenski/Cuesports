import { describe, expect, it } from 'vitest';
import { shuffled, TRACKS } from './sound';

describe('music playlist', () => {
  it('plays every track once a lap, never repeating across laps', () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let last: string | undefined;
    for (let lap = 0; lap < 50; lap++) {
      const order = shuffled(TRACKS, last, random);
      expect([...order].sort()).toEqual([...TRACKS].sort());
      expect(order[0]).not.toBe(last);
      last = order[order.length - 1];
    }
  });
});
