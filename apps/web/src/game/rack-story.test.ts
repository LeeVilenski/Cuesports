import { describe, expect, it } from 'vitest';
import { matchSituation, rackBadge } from './rack-story';
import type { RackRecord, ShotRecord } from './record';

const shot = (player: number, potted: string[] = [], o: Partial<ShotRecord> = {}): ShotRecord =>
  ({
    player,
    potted,
    fouls: [],
    isBreak: false,
    scored: potted.length,
    before: [],
    firstHit: '1',
    ...o,
  }) as never;
const rack = (shots: ShotRecord[], reason = 'pots the 9'): RackRecord => ({
  breaker: 0,
  shots,
  winner: 0,
  reason,
});

describe('rackBadge', () => {
  it('spots a golden break and a break and run', () => {
    expect(rackBadge(rack([shot(0, ['9'], { isBreak: true })]), 0)).toBe('Golden break!');
    expect(rackBadge(rack([shot(0, ['1'], { isBreak: true }), shot(0, ['2']), shot(0, ['9'])]), 0)).toBe(
      'Break and run!',
    );
  });

  it('spots a run out, a gift and a punished foul', () => {
    const runOut = [shot(1, [], { isBreak: true }), shot(0, ['1', '2']), shot(0, ['3']), shot(0, ['4', '9'])];
    expect(rackBadge(rack(runOut), 0)).toBe('Run out!');
    expect(rackBadge(rack([shot(0, [], { isBreak: true }), shot(1, ['8'])]), 0)).toBe('A gift!');
    const foul = [shot(0, [], { isBreak: true }), shot(1, [], { fouls: ['scratch'] }), shot(0, ['9'])];
    expect(rackBadge(rack(foul), 0)).toBe('Punished!');
  });

  it('falls back to a plain line, chosen by the seed', () => {
    const r = rack([shot(1, [], { isBreak: true }), shot(0, []), shot(1, []), shot(0, ['9'])]);
    expect(rackBadge(r, 0, 0)).not.toBe(rackBadge(r, 0, 1));
  });
});

describe('matchSituation', () => {
  const p = ['Edward', 'Rob'] as const;
  it('says hill-hill, one from the match, level or who leads', () => {
    expect(matchSituation(p, [3, 3], 4, 'rack')).toBe('Hill-hill: the next rack decides it');
    expect(matchSituation(p, [3, 1], 4, 'rack')).toBe('Edward is one rack from the match');
    expect(matchSituation(p, [1, 1], 4, 'frame')).toBe('All square at 1–1');
    expect(matchSituation(p, [0, 2], 5, 'rack')).toBe('Rob leads 2–0, race to 5');
  });
});
