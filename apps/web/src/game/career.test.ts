import { describe, expect, it } from 'vitest';
import {
  bestText,
  careerEvent,
  enter,
  EVENTS,
  inRound,
  isLocked,
  newCareer,
  nextOpponent,
  opponent,
  recordMatch,
  REWARDS,
  ROSTER,
  rounds,
  roundName,
  tierOpen,
  VENUES,
  YOU,
  type CareerState,
} from './career';
import { PRESETS } from '../render/figure';

const start = (id: string, seed = 1): CareerState => ({ ...newCareer(), run: enter(careerEvent(id)!, seed) });

describe('career data', () => {
  it('is consistent', () => {
    for (const e of EVENTS) {
      expect(VENUES.some((v) => v.id === e.venue && v.tier === e.tier)).toBe(true);
      expect(ROSTER.some((o) => o.id === e.rival)).toBe(true);
      expect(REWARDS[e.reward]).toBeDefined();
      expect(e.levels[0]).toBeLessThan(e.levels[1]);
    }
    for (const o of ROSTER) expect(PRESETS[o.look]).toBeDefined();
    // Every reward is won somewhere.
    for (const key of Object.keys(REWARDS)) expect(EVENTS.some((e) => e.reward === key)).toBe(true);
  });
});

describe('a career event', () => {
  it('draws a full bracket: you first, the rival last, levels rising', () => {
    const run = enter(careerEvent('club-9ball')!, 4);
    expect(run.entrants).toHaveLength(8);
    expect(run.entrants[0]!.id).toBe(YOU);
    expect(run.entrants.at(-1)!.id).toBe('priya');
    expect(new Set(run.entrants.map((x) => x.id)).size).toBe(8);
    const levels = run.entrants.slice(1).map((x) => x.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(nextOpponent(run)!.level).toBe(levels[0]);
  });

  it('plays through to the title, unlocking the reward and the next tier', () => {
    let s = start('lion-9ball');
    const e = careerEvent('lion-9ball')!;
    expect(tierOpen(s, 1)).toBe(false);
    expect(isLocked(s, e.reward)).toBe(true);
    for (let r = 0; r < rounds(e); r++) {
      expect(roundName(e, s.run!.round)).toBe(r === rounds(e) - 1 ? 'Final' : 'Semi-final');
      s = recordMatch(s, true, r + 1);
      expect(inRound(s.run!, r + 1)).toContain(YOU);
    }
    expect(s.run!.status).toBe('won');
    expect(nextOpponent(s.run!)).toBeNull();
    expect(s.best[e.id]).toBe(rounds(e));
    expect(bestText(e, s.best[e.id])).toBe('Champion');
    expect(isLocked(s, e.reward)).toBe(false);
    expect(tierOpen(s, 1)).toBe(true);
    expect(tierOpen(s, 2)).toBe(false);
    // The rival was always in the other half, so they're the final opponent if they got there.
    expect(Object.values(s.h2h).reduce((n, [w]) => n + w, 0)).toBe(rounds(e));
  });

  it('ends on a loss and keeps the best round reached', () => {
    let s = start('club-9ball');
    const first = nextOpponent(s.run!)!.id;
    s = recordMatch(s, true, 1);
    const second = nextOpponent(s.run!)!.id;
    s = recordMatch(s, false, 2);
    expect(s.run!.status).toBe('out');
    expect(s.best['club-9ball']).toBe(1);
    expect(bestText(careerEvent('club-9ball')!, 1)).toBe('Reached the semi-final');
    expect(s.h2h[first]).toEqual([1, 0]);
    expect(s.h2h[second]).toEqual([0, 1]);
    expect(s.unlocked).toEqual([]);
    // Nothing more happens once out.
    expect(recordMatch(s, true, 3)).toBe(s);
  });

  it('gives every roster player a usable look and personality', () => {
    for (const o of ROSTER) {
      expect(Math.abs(o.attack)).toBeLessThanOrEqual(1);
      expect(opponent(o.id)).toBe(o);
    }
  });
});
