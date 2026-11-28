import { describe, expect, it } from 'vitest';
import { enterEvent, playMatch, restWeek } from './agent';
import { careerEvent, newCareer, YOU, type CareerState } from './career';
import { CROSSOVER, HOPEFULS, levelOn, PROS, TOUR_PLAYERS, TOURS, tourField } from './roster';
import { eligibility, weekEvents, WEEKS } from './season';
import { kindsInWeek, MAJOR_WEEKS, tourEvent, tourEventById } from './tour-events';
import {
  canChooseTours,
  canSpecialise,
  challengeKey,
  chooseTours,
  endTourSeason,
  hasCard,
  ordinal,
  playTourWeek,
  rankOf,
  ranking,
  tourEligibility,
} from './tours';

/** A career past the clubs (the halls open), with money to spend. */
const ready = (): CareerState => ({
  ...newCareer(),
  seed: 5,
  money: 5000,
  best: { 'lion-9ball': 2, 'club-9ball': 3 },
});

function play(s: CareerState, id: string, wins: number): CareerState {
  s = enterEvent(s, careerEvent(id)!, 11);
  let i = 0;
  while (s.run?.status === 'playing') s = playMatch(s, i++ < wins, 40 + i);
  return s;
}

describe('the tour roster', () => {
  it('has a full field on every tour, all with made-up names', () => {
    expect(TOUR_PLAYERS).toHaveLength(TOURS.length * (PROS + HOPEFULS));
    expect(new Set(TOUR_PLAYERS.map((p) => p.name)).size).toBe(TOUR_PLAYERS.length);
    for (const t of TOURS) expect(tourField(t.id).length).toBeGreaterThanOrEqual(PROS + HOPEFULS);
  });

  it('makes stars weaker away from home: snooker stars mid-table at pool, pool stars low at snooker', () => {
    expect(CROSSOVER.snooker.pool).toBeGreaterThan(CROSSOVER.pool.snooker);
    const visitor = TOUR_PLAYERS.find((p) => p.sides.length)!;
    const side = visitor.sides[0]!;
    expect(levelOn(visitor, side)).toBeLessThan(visitor.level);
    expect(
      levelOn(visitor, TOURS.find((t) => t.id !== visitor.home && !visitor.sides.includes(t.id))!.id),
    ).toBeNull();
    // A snooker star playing pool sits among the pool pros, not at the top.
    const star = TOUR_PLAYERS.find((p) => p.home === 'snooker' && p.sides.includes('pool'));
    if (star) {
      const field = tourField('pool');
      const at = field.findIndex((f) => f.id === star.id);
      expect(at).toBeGreaterThan(2);
    }
  });
});

describe('tour events', () => {
  it('rebuild from their id, the same every time', () => {
    const e = tourEvent('snooker', 2, 4, 'major');
    expect(tourEventById(e.id)).toEqual(e);
    expect(careerEvent(e.id)?.title).toBe(e.title);
    expect(tourEventById('lion-9ball')).toBeUndefined();
    expect(kindsInWeek(MAJOR_WEEKS[0]!)).toContain('major');
    expect(kindsInWeek(WEEKS)).toEqual(['qschool', 'finals']);
    expect(tourEvent('pool', 1, 1, 'ranking').raceTo).toHaveLength(4);
    expect(tourEvent('billiards', 1, 1, 'challenge').target).toBeGreaterThan(0);
  });
});

describe('specialising', () => {
  it('opens once the halls are open, for up to two tours', () => {
    expect(canSpecialise(newCareer())).toBe(false);
    const s = ready();
    expect(canSpecialise(s)).toBe(true);
    expect(chooseTours(s, ['pool', 'snooker', 'pyramid'])).toBe(s);
    const on = chooseTours(s, ['pool', 'snooker']);
    expect(on.tours.map((m) => m.tour)).toEqual(['pool', 'snooker']);
    expect(on.tours.every((m) => m.card === null)).toBe(true);
    // Only in week 1 from then on.
    expect(canChooseTours({ ...on, week: 3 })).toBe(false);
    expect(canChooseTours({ ...on, week: 1 })).toBe(true);
  });

  it('Joe tells you when it is time to choose', () => {
    let s: CareerState = { ...newCareer(), best: { 'lion-9ball': 2 } };
    s = play(s, 'club-9ball', 99);
    expect(s.inbox.some((m) => m.id === 'specialise')).toBe(true);
  });

  it('turns the calendar into your tours: the Challenge Tour first, ranking events locked', () => {
    const s = chooseTours(ready(), ['pool']);
    const evs = weekEvents(s);
    expect(evs.every((e) => e.id.startsWith('t.pool.'))).toBe(true);
    const ch = evs.find((e) => e.id.endsWith('challenge'))!;
    const rk = evs.find((e) => !e.id.endsWith('challenge'))!;
    expect(eligibility(s, ch).ok).toBe(true);
    expect(eligibility(s, rk)).toMatchObject({ ok: false, reason: 'Tour card holders only' });
  });
});

describe('rankings and cards', () => {
  it('has a ranking from the start, and every tour plays its week', () => {
    const s = chooseTours(ready(), ['snooker']);
    const before = ranking(s, 'snooker');
    expect(before.length).toBeGreaterThan(PROS);
    expect(rankOf(s, 'snooker')).toBe(before.length);
    const after = playTourWeek(s, 1, 1, null);
    expect(ranking(after, 'pool')).not.toEqual(ranking(s, 'pool'));
  });

  it('banks your Challenge Tour money, and the week moves on', () => {
    let s = chooseTours(ready(), ['pool']);
    const ch = weekEvents(s).find((e) => e.id.endsWith('challenge'))!;
    s = play(s, ch.id, 99);
    expect(s.week).toBe(2);
    const mine = ranking(s, challengeKey('pool')).find((r) => r.id === YOU)!;
    expect(mine.money).toBeGreaterThan(0);
    expect(rankOf(s, challengeKey('pool'))).toBe(1);
  });

  it('gives a card for the Q-School semi-finals, from next season', () => {
    let s = chooseTours({ ...ready(), week: WEEKS }, ['pyramid']);
    const qs = weekEvents(s).find((e) => e.id.endsWith('qschool'))!;
    s = play(s, qs.id, 2);
    expect(s.season).toBe(2);
    expect(hasCard(s, 'pyramid')).toBe(true);
    expect(s.inbox.some((m) => m.id.startsWith('card-won-qs-pyramid'))).toBe(true);
    // With a card the calendar has ranking events, and no more Challenge Tour.
    const evs = weekEvents(s);
    expect(evs.some((e) => e.id.endsWith('ranking'))).toBe(true);
    expect(evs.some((e) => e.id.endsWith('challenge'))).toBe(false);
  });

  it('keeps a card inside the cut and takes it away outside it', () => {
    const base = chooseTours(ready(), ['pool']);
    const withCard = { ...base, tours: [{ tour: 'pool' as const, joined: 1, card: { from: 1, until: 1 } }] };
    // Nothing won all season: well outside the cut.
    const lost = endTourSeason(withCard, 1);
    expect(lost.state.tours[0]!.card).toBeNull();
    // A big season: inside it.
    const rich = { ...withCard, tourMoney: { pool: { '1': { [YOU]: 1e6 } } } };
    const kept = endTourSeason(rich, 1);
    expect(kept.state.tours[0]!.card).toEqual({ from: 2, until: 3 });
  });

  it('lets only the top of the ranking into the majors', () => {
    const s = {
      ...chooseTours(ready(), ['snooker']),
      week: MAJOR_WEEKS[0]!,
      tours: [{ tour: 'snooker' as const, joined: 1, card: { from: 1, until: 2 } }],
    };
    const major = tourEvent('snooker', 1, MAJOR_WEEKS[0]!, 'major');
    expect(tourEligibility(s, major)).toMatchObject({ ok: false, reason: /Top 12/ });
    const top = { ...s, tourMoney: { snooker: { '1': { [YOU]: 1e6 } } } };
    expect(tourEligibility(top, major).ok).toBe(true);
  });

  it('plays a whole season on tour without getting stuck', () => {
    let s = chooseTours(ready(), ['blackball', 'billiards']);
    for (let w = 0; w < WEEKS; w++) {
      const e = weekEvents(s).find((x) => eligibility(s, x).ok);
      s = e ? play(s, e.id, 1) : restWeek(s);
    }
    expect(s.season).toBe(2);
    expect(s.inbox.some((m) => m.id === 'season-1')).toBe(true);
  });

  it('says 1st, 2nd, 3rd, 11th, 22nd', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '22nd',
      '101st',
    ]);
  });
});
