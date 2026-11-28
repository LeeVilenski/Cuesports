import { describe, expect, it } from 'vitest';
import { booking, enterEvent, playMatch, restWeek } from './agent';
import { careerEvent, newCareer, parseCareer, tierOpen, type CareerState } from './career';
import { cost, cut, eligibility, fee, prize, weekEvents, WEEKS, winnings } from './season';

function playOut(s: CareerState, id: string, wins: number, booked = false): CareerState {
  s = enterEvent(s, careerEvent(id)!, 3, booked);
  let i = 0;
  while (s.run?.status === 'playing') s = playMatch(s, i++ < wins, 10 + i);
  return s;
}

describe('the calendar', () => {
  it('has a few events a week, one of them open, and is the same every time', () => {
    const s = { ...newCareer(), seed: 42 };
    for (let w = 1; w <= WEEKS; w++) {
      const evs = weekEvents(s, 1, w);
      expect(evs.length).toBeGreaterThanOrEqual(2);
      expect(evs.some((e) => tierOpen(s, e.tier))).toBe(true);
      expect(weekEvents(s, 1, w)).toEqual(evs);
    }
    // Something to aim for: the clubs show up, locked.
    const all = Array.from({ length: WEEKS }, (_, w) => weekEvents(s, 1, w + 1)).flat();
    expect(all.some((e) => !tierOpen(s, e.tier))).toBe(true);
    expect(eligibility(s, careerEvent('club-9ball')!)).toMatchObject({ ok: false });
  });

  it('moves on a week after each event, or a week off, and reviews the season', () => {
    let s = newCareer();
    s = playOut(s, weekEvents(s)[0]!.id, 0);
    expect(s.week).toBe(2);
    s = restWeek(s);
    expect(s.week).toBe(3);
    expect(s.trainingReady).toBe(true);
    for (let i = 0; i < WEEKS - 2; i++) s = restWeek(s);
    expect(s.season).toBe(2);
    expect(s.week).toBe(1);
    expect(s.inbox.find((m) => m.id === 'season-1')?.body).toMatch(/1 event/);
  });

  it("won't let you enter a second event while you're in one", () => {
    let s = enterEvent(newCareer(), weekEvents(newCareer())[0]!, 1);
    expect(eligibility(s, weekEvents(s)[0]!)).toMatchObject({ ok: false, reason: /Finish/ });
    expect(restWeek(s)).toBe(s);
    s = { ...s, run: null };
    expect(eligibility(s, weekEvents(s)[0]!).ok).toBe(true);
  });
});

describe('money', () => {
  it('charges entry and travel, with Joe paying travel to his bookings', () => {
    const club = careerEvent('club-9ball')!;
    const s = { ...newCareer(), money: 100 };
    expect(fee(careerEvent('lion-9ball')!)).toBe(0);
    expect(cost(s, club, false).total).toBe(30);
    expect(cost(s, club, true).total).toBe(20);
    // When he rates you, he covers the entry too.
    expect(cost({ ...s, confidence: 80 }, club, true).total).toBe(0);
    expect(eligibility({ ...s, money: 5 }, careerEvent('lion-9ball')!).ok).toBe(true);
  });

  it("won't let you enter what you can't afford", () => {
    const s = { ...newCareer(), money: 10, best: { 'lion-9ball': 2 } };
    const club = weekEvents(s).find((e) => e.tier === 1);
    if (club) expect(eligibility(s, club)).toMatchObject({ ok: false, reason: /Costs £/ });
  });

  it('pays prize money by round, less Joe’s cut', () => {
    const e = careerEvent('club-9ball')!;
    expect(prize(e, 3)).toBe(400);
    expect(prize(e, 2)).toBe(200);
    expect(prize(e, 1)).toBe(100);
    expect(prize(e, 0)).toBe(0);
    const s = newCareer();
    expect(cut(s)).toBe(0.2);
    expect(winnings(s, e, 3)).toEqual({ gross: 400, cut: 80, net: 320 });
    const won = playOut(s, 'lion-9ball', 99);
    expect(won.money).toBe(50 + 80);
    expect(won.log.at(-1)).toMatchObject({ season: 1, week: 1, prize: 80 });
    expect(won.run?.debrief?.join(' ')).toMatch(/£100 in prize money/);
  });

  it('only books what is on and affordable', () => {
    const s = { ...newCareer(), seed: 9 };
    const b = booking(s, 1)!;
    expect(weekEvents(s)).toContain(b);
    expect(eligibility(s, b, true).ok).toBe(true);
  });

  it('starts an old career at season 1, week 1, with a little money', () => {
    const s = parseCareer(JSON.stringify({ best: {}, unlocked: [], h2h: {}, run: null }));
    expect([s.season, s.week, s.money]).toEqual([1, 1, 50]);
  });
});
