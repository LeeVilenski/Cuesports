import { Rng } from '@cuesports/shared';
import {
  careerEvent,
  EVENTS,
  rounds,
  tierOpen,
  topTier,
  VENUES,
  type CareerEvent,
  type CareerState,
} from './career';
import { isTourEvent } from './tour-events';
import { prizeShare, qschoolFree, tourEligibility, tourWeekEvents } from './tours';

/**
 * The season: twelve weeks, each with a few events on the calendar (seeded, so a season is the same
 * every time you look at it), and the money that goes with them. Entry fees and travel go out; prize
 * money comes in, less Old Joe's cut. One event a week, or a week off.
 */

export const WEEKS = 12;

/** Entry fee by tier: the pub is free. */
export const FEES = [0, 20, 50, 100];
/** Travel by tier: the pub is down the road. */
export const TRAVEL = [0, 10, 30, 60];
/** The winner's prize by tier. */
export const PRIZES = [100, 400, 1200, 4000];

export const fee = (e: CareerEvent, s?: CareerState): number =>
  isTourEvent(e) ? (e.kind === 'qschool' && s && qschoolFree(s, e.tour) ? 0 : e.fee) : (FEES[e.tier] ?? 0);
export const travel = (e: CareerEvent): number => TRAVEL[e.tier] ?? 0;

/**
 * The prize for a result: all of it for the title, half for the runner-up, a quarter for losing in
 * the semis. Losing your first match pays nothing, whatever the round is called.
 */
export function prize(e: CareerEvent, reached: number): number {
  const n = rounds(e);
  if (isTourEvent(e)) return Math.round(e.purse * prizeShare(n, reached));
  if (reached === 0) return 0;
  const share = reached >= n ? 1 : reached === n - 1 ? 0.5 : reached === n - 2 ? 0.25 : 0;
  return Math.round((PRIZES[e.tier] ?? 0) * share);
}

/** Joe's cut of prize money: 20% at first, 15% once the halls know you, 10% at the arena. */
export const cut = (s: CareerState): number =>
  s.tours.length || topTier(s) >= 3 ? 0.1 : topTier(s) >= 2 ? 0.15 : 0.2;

/** What an event costs you: Joe pays the travel to his own bookings, and the entry too when he rates you. */
export function cost(
  s: CareerState,
  e: CareerEvent,
  booked: boolean,
): { fee: number; travel: number; total: number } {
  const f = booked && s.confidence >= 75 ? 0 : fee(e, s);
  const t = booked ? 0 : travel(e);
  return { fee: f, travel: t, total: f + t };
}

/** A well-mixed seed from the career seed, season and week (neighbouring weeks must not look alike). */
function mix(seed: number, season: number, week: number): number {
  let h = (seed ^ Math.imul(season, 0x9e3779b1) ^ Math.imul(week, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** This week's events: one you can enter at least, a couple more, and something to aim for. */
export function weekEvents(s: CareerState, season = s.season, week = s.week): CareerEvent[] {
  // Once you've specialised, your tours are your calendar.
  if (s.tours.length) return tourWeekEvents(s, season, week);
  const rng = new Rng(mix(s.seed, season, week));
  const shuffled = [...EVENTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const open = shuffled.filter((e) => tierOpen(s, e.tier));
  const top = topTier(s);
  const picked: CareerEvent[] = [];
  const add = (e: CareerEvent | undefined) => e && !picked.includes(e) && picked.push(e);
  // One at your level (a tier lower when Joe has lost faith), one at any open level in a different
  // game, and one just above you.
  if (s.confidence < 30 && top > 0) add(open.find((e) => e.tier === top - 1));
  add(open.find((e) => e.tier === top) ?? open[0]);
  add(
    open.find((e) => !picked.includes(e) && !picked.some((p) => p.game === e.game)) ??
      open.find((e) => !picked.includes(e)),
  );
  add(shuffled.find((e) => e.tier === top + 1));
  if (picked.length < 3) add(open.find((e) => !picked.includes(e)));
  return picked.sort((a, b) => a.tier - b.tier);
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Whether you can enter an event this week, and why not. */
export function eligibility(s: CareerState, e: CareerEvent, booked = false): Eligibility {
  if (s.run?.status === 'playing') {
    const cur = careerEvent(s.run.event);
    return { ok: false, reason: `Finish the ${cur?.title ?? 'event you are in'} first` };
  }
  if (isTourEvent(e)) {
    const t = tourEligibility(s, e);
    if (!t.ok) return t;
  } else if (!tierOpen(s, e.tier)) {
    const below = VENUES.filter((v) => v.tier === e.tier - 1).map((v) => v.name);
    return { ok: false, reason: `Win an event at ${below.join(' or ')} first` };
  }
  if (!weekEvents(s).some((x) => x.id === e.id)) return { ok: false, reason: 'Not on this week' };
  const c = cost(s, e, booked);
  if (c.total > s.money) return { ok: false, reason: `Costs £${c.total}: you have £${s.money}` };
  return { ok: true };
}

/** Pays to enter (the run is started by the caller). */
export const pay = (s: CareerState, e: CareerEvent, booked: boolean): CareerState => ({
  ...s,
  money: s.money - cost(s, e, booked).total,
});

/** Prize money for a finished event, after Joe's cut. */
export function winnings(
  s: CareerState,
  e: CareerEvent,
  reached: number,
): { gross: number; cut: number; net: number } {
  const gross = prize(e, reached);
  const c = Math.round(gross * cut(s));
  return { gross, cut: c, net: gross - c };
}

/** On to the next week; after the last week the season ends and the next one starts. */
export function nextWeek(s: CareerState): { state: CareerState; seasonOver: boolean } {
  if (s.week < WEEKS) return { state: { ...s, week: s.week + 1 }, seasonOver: false };
  return { state: { ...s, season: s.season + 1, week: 1 }, seasonOver: true };
}

/** A season's results, from the log. */
export function seasonSummary(s: CareerState, season: number) {
  const events = s.log.filter((l) => l.season === season);
  return {
    events: events.length,
    titles: events.filter((l) => l.champion).length,
    met: events.filter((l) => l.reached >= l.target).length,
    earned: events.reduce((a, l) => a + (l.prize ?? 0), 0),
  };
}
