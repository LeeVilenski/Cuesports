import { Rng } from '@cuesports/shared';
import {
  draw,
  playOut,
  reachedAll,
  rounds,
  topTier,
  YOU,
  type CareerEvent,
  type CareerRun,
  type CareerState,
  type Entrant,
  type TourMembership,
} from './career';
import { HOPEFULS, PROS, TOUR_PLAYERS, tourDef, tourField, TOURS, type TourId } from './roster';
import {
  FINALS_FIELD,
  isTourEvent,
  kindsInWeek,
  MAJOR_FIELD,
  tourEvent,
  type TourEvent,
} from './tour-events';

/**
 * Specialising and the tours: which tours you're on, your tour card, the rankings (rolling prize
 * money over two seasons), who plays each event, and what happens at the end of a season. Every
 * tour's events are played every week (by the computer when you're not in them), so the rankings
 * live and breathe whether you're on that tour or not.
 */

export const MAX_TOURS = 2;
/** Keep your card at its end by finishing inside this ranking. */
export const CARD_CUT = 16;
/** Top of the Challenge Tour at the end of a season: a card. */
export const CHALLENGE_CARDS = 2;
/** Top of the Challenge Tour: a free Q-School place. */
export const QSCHOOL_PLACES = 4;
/** Q-School: reach the semi-finals for a card. */
export const QSCHOOL_CARD_ROUND = 2;
export const CARD_SEASONS = 2;

/** Past the club tables: once the halls are open, you can specialise. */
export const canSpecialise = (s: CareerState): boolean => topTier(s) >= 2;

export const membership = (s: CareerState, tour: TourId): TourMembership | undefined =>
  s.tours.find((m) => m.tour === tour);

export function hasCard(s: CareerState, tour: TourId, season = s.season): boolean {
  const c = membership(s, tour)?.card;
  return !!c && c.from <= season && season <= c.until;
}

/** You can choose your tours when you first specialise, and again in the first week of a season. */
export const canChooseTours = (s: CareerState): boolean =>
  canSpecialise(s) && s.run?.status !== 'playing' && (s.tours.length === 0 || s.week === 1);

/** Joins and leaves tours: those you keep keep their card; new ones start on the Challenge Tour. */
export function chooseTours(s: CareerState, ids: TourId[]): CareerState {
  if (!canChooseTours(s) || ids.length === 0 || ids.length > MAX_TOURS) return s;
  const tours = ids.map((t) => membership(s, t) ?? { tour: t, joined: s.season, card: null });
  return { ...s, tours };
}

// ---------------------------------------------------------------------------------------------
// Rankings

export const challengeKey = (tour: TourId): string => `${tour}-ch`;

/** Season 0: a ranking already in place when the career starts, so the tables have shape. */
function baseline(key: string): Record<string, number> {
  const [tour, ch] = key.split('-') as [TourId, string | undefined];
  const out: Record<string, number> = {};
  // A little variety per player, so no two tables look alike.
  const rng = new Rng([...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261));
  const vary = () => 0.75 + 0.5 * rng.next();
  if (ch) {
    TOUR_PLAYERS.filter((p) => p.home === tour)
      .slice(PROS)
      .forEach((p) => (out[p.id] = Math.round(300 * vary() * Math.max(0, p.level - 2) ** 2)));
    return out;
  }
  for (const f of tourField(tour)) out[f.id] = Math.round(4000 * vary() * Math.max(0, f.level - 2.5) ** 3);
  return out;
}

/** A ranking: prize money over this season and last (with season 0 standing in early on), richest first. */
export function ranking(s: CareerState, key: string): { id: string; money: number }[] {
  const seasons = s.tourMoney[key] ?? {};
  const total: Record<string, number> = {};
  const add = (m: Record<string, number>) => {
    for (const [id, v] of Object.entries(m)) total[id] = (total[id] ?? 0) + v;
  };
  if (s.season - 1 < 1) add(baseline(key));
  add(seasons[String(s.season - 1)] ?? {});
  add(seasons[String(s.season)] ?? {});
  // You're on the table once you're on the tour.
  const [tour] = key.split('-') as [TourId];
  if (membership(s, tour) && total[YOU] === undefined) total[YOU] = 0;
  return Object.entries(total)
    .map(([id, money]) => ({ id, money }))
    .sort((a, b) => b.money - a.money || a.id.localeCompare(b.id));
}

/** Your place in a ranking (1 = top), or null. */
export function rankOf(s: CareerState, key: string, id = YOU): number | null {
  const i = ranking(s, key).findIndex((r) => r.id === id);
  return i < 0 ? null : i + 1;
}

/** Adds prize money to a ranking for a season. Old seasons are dropped. */
function bank(s: CareerState, key: string, season: number, money: Record<string, number>): CareerState {
  const seasons = { ...(s.tourMoney[key] ?? {}) };
  const cur = { ...(seasons[String(season)] ?? {}) };
  for (const [id, v] of Object.entries(money)) if (v) cur[id] = (cur[id] ?? 0) + v;
  seasons[String(season)] = cur;
  for (const k of Object.keys(seasons)) if (Number(k) < season - 2) delete seasons[k];
  return { ...s, tourMoney: { ...s.tourMoney, [key]: seasons } };
}

/** The ranking an event's money counts towards. */
export const rankingKey = (e: TourEvent): string =>
  e.kind === 'challenge' || e.kind === 'qschool' ? challengeKey(e.tour) : e.tour;

/** Prize share for rounds won: all for the title, half for the final, a quarter for the semis. */
export function prizeShare(total: number, reached: number): number {
  if (reached === 0) return 0;
  return reached >= total
    ? 1
    : reached === total - 1
      ? 0.5
      : reached === total - 2
        ? 0.25
        : reached === total - 3
          ? 0.1
          : 0;
}

// ---------------------------------------------------------------------------------------------
// The week's tour events

/** The tour events this week for the tours you're on: the ones you can play, and the next rung up, locked. */
export function tourWeekEvents(s: CareerState, season = s.season, week = s.week): TourEvent[] {
  const out: TourEvent[] = [];
  for (const m of s.tours) {
    const card = hasCard(s, m.tour, season);
    for (const k of kindsInWeek(week)) {
      const e = tourEvent(m.tour, season, week, k);
      // Card holders don't go back to the Challenge Tour or Q-School.
      if (card && (k === 'challenge' || k === 'qschool')) continue;
      out.push(e);
    }
  }
  return out;
}

export type TourEligibility = { ok: true } | { ok: false; reason: string };

/** Whether your status on the tour lets you into an event. */
export function tourEligibility(s: CareerState, e: TourEvent): TourEligibility {
  const name = tourDef(e.tour).name;
  if (!membership(s, e.tour)) return { ok: false, reason: `Join the ${name} first` };
  const card = hasCard(s, e.tour);
  if (e.kind === 'ranking' && !card) return { ok: false, reason: 'Tour card holders only' };
  if (e.kind === 'major' || e.kind === 'finals') {
    if (!card) return { ok: false, reason: 'Tour card holders only' };
    const need = e.kind === 'major' ? MAJOR_FIELD : FINALS_FIELD;
    const r = rankOf(s, e.tour) ?? 999;
    if (r > need) return { ok: false, reason: `Top ${need} in the ranking (you're ${ordinal(r)})` };
  }
  return { ok: true };
}

/** Q-School is free for the top of the Challenge Tour. */
export function qschoolFree(s: CareerState, tour: TourId): boolean {
  return (rankOf(s, challengeKey(tour)) ?? 999) <= QSCHOOL_PLACES;
}

export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * Who plays an event (without you): the top of the ranking for majors and the finals, a mix of
 * the tour's pros and side-tour visitors for ranking events, and the hopefuls (with a few pros on
 * the way down) for the Challenge Tour and Q-School.
 */
export function fieldFor(s: CareerState, e: TourEvent, seed: number, withYou: boolean): Entrant[] {
  const size = 2 ** rounds(e) - (withYou ? 1 : 0);
  const players = tourField(e.tour);
  const level = (id: string) => players.find((p) => p.id === id)?.level ?? 2.5;
  const rng = new Rng(seed);
  const shuffle = <T>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
  };
  let ids: string[];
  if (e.kind === 'major' || e.kind === 'finals') {
    ids = ranking(s, e.tour)
      .map((r) => r.id)
      .filter((id) => id !== YOU && players.some((p) => p.id === id))
      .slice(0, size);
  } else if (e.kind === 'ranking') {
    const pool = ranking(s, e.tour)
      .map((r) => r.id)
      .filter((id) => id !== YOU && players.some((p) => p.id === id));
    // The top eight always play; the rest of the places are drawn.
    ids = [...pool.slice(0, 8), ...shuffle(pool.slice(8)).slice(0, Math.max(0, size - 8))];
  } else {
    const home = TOUR_PLAYERS.filter((p) => p.home === e.tour);
    const hopefuls = home.slice(PROS, PROS + HOPEFULS).map((p) => p.id);
    const fallers = home.slice(PROS - 8, PROS).map((p) => p.id);
    ids = [...shuffle(hopefuls), ...shuffle(fallers)].slice(0, size);
  }
  // Short of players: fill from the rest of the tour.
  for (const p of players) if (ids.length < size && !ids.includes(p.id)) ids.push(p.id);
  return ids.slice(0, size).map((id) => ({ id, level: level(id) }));
}

/** Plays a whole event between computer players. */
export function simulateEvent(s: CareerState, e: TourEvent, seed: number): Record<string, number> {
  const run: CareerRun = {
    event: e.id,
    entrants: draw(fieldFor(s, e, seed, false), seed + 1),
    winners: [],
    round: 0,
    status: 'out',
  };
  return reachedAll(run, playOut(run, rounds(e), seed + 2));
}

/** Prize money for a finished event, to its ranking: everyone's, from rounds won. */
export function bankEvent(s: CareerState, e: TourEvent, reached: Record<string, number>): CareerState {
  const money: Record<string, number> = {};
  for (const [id, r] of Object.entries(reached)) money[id] = Math.round(e.purse * prizeShare(rounds(e), r));
  return bank(s, rankingKey(e), e.season, money);
}

/** The rounds everyone won in your event, once you're out (or won it): the rest is played out. */
export function finishYourEvent(run: CareerRun, e: CareerEvent, seed: number): Record<string, number> {
  return reachedAll(run, playOut(run, rounds(e), seed));
}

/**
 * The end of a week on every tour: each event the computer plays (all but the one you played)
 * is played out and its prize money banked.
 */
export function playTourWeek(
  s: CareerState,
  season: number,
  week: number,
  played: string | null,
): CareerState {
  let out = s;
  TOURS.forEach((t, ti) => {
    for (const k of kindsInWeek(week)) {
      if (k === 'qschool') continue;
      const e = tourEvent(t.id, season, week, k);
      if (e.id === played) continue;
      out = bankEvent(
        out,
        e,
        simulateEvent(out, e, s.seed * 31 + season * 1009 + week * 97 + ti * 7 + k.length),
      );
    }
  });
  return out;
}

export interface SeasonNews {
  id: string;
  subject: string;
  body: string;
}

/**
 * The end of a season on your tours: cards that run out are kept inside the cut or lost, and the
 * top of each Challenge Tour earns a card. Returns the new state and Joe's news.
 */
export function endTourSeason(s: CareerState, season: number): { state: CareerState; news: SeasonNews[] } {
  const news: SeasonNews[] = [];
  // Rankings as they stood at the end of the season that just finished.
  const at = { ...s, season };
  const tours = s.tours.map((m) => {
    const name = tourDef(m.tour).name;
    if (m.card && m.card.until === season) {
      const r = rankOf(at, m.tour) ?? 999;
      if (r <= CARD_CUT) {
        news.push({
          id: `card-kept-${m.tour}-${season}`,
          subject: `Card kept: ${name}`,
          body: `You finished ${ordinal(r)} on the ${name} ranking, inside the top ${CARD_CUT}. Your card's good for another ${CARD_SEASONS} seasons.`,
        });
        return { ...m, card: { from: season + 1, until: season + CARD_SEASONS } };
      }
      news.push({
        id: `card-lost-${m.tour}-${season}`,
        subject: `Card lost: ${name}`,
        body: `${ordinal(r)} on the ranking. It needed top ${CARD_CUT}, so the card's gone. Back to the Challenge Tour and Q-School. It happens to the best of them. We go again.`,
      });
      return { ...m, card: null };
    }
    if (!m.card || m.card.until < season) {
      const r = rankOf(at, challengeKey(m.tour)) ?? 999;
      if (r <= CHALLENGE_CARDS) {
        news.push({
          id: `card-won-ch-${m.tour}-${season}`,
          subject: `Tour card: ${name}`,
          body: `${ordinal(r)} on the Challenge Tour. That's a tour card, kid, ${CARD_SEASONS} seasons on the ${name}. Ranking events from next week.`,
        });
        return { ...m, card: { from: season + 1, until: season + CARD_SEASONS } };
      }
    }
    return m;
  });
  return { state: { ...s, tours }, news };
}

/** A Q-School result: reach the semi-finals for a card from next season. */
export function qschoolResult(
  s: CareerState,
  e: TourEvent,
  reached: number,
): { state: CareerState; news: SeasonNews | null } {
  if (e.kind !== 'qschool' || reached < QSCHOOL_CARD_ROUND) return { state: s, news: null };
  const name = tourDef(e.tour).name;
  const tours = s.tours.map((m) =>
    m.tour === e.tour ? { ...m, card: { from: e.season + 1, until: e.season + CARD_SEASONS } } : m,
  );
  return {
    state: { ...s, tours },
    news: {
      id: `card-won-qs-${e.tour}-${e.season}`,
      subject: `Tour card: ${name}`,
      body: `Through Q-School! You're on the ${name} for ${CARD_SEASONS} seasons from next season. Ranking events, majors if you climb high enough. This is the big time.`,
    },
  };
}

/** Your best status anywhere: a card raises your ceiling to 99, being on a tour to 80. */
export function tourCeiling(s: CareerState): number | null {
  if (s.tours.some((m) => hasCard(s, m.tour))) return 99;
  return s.tours.length ? 80 : null;
}

export { isTourEvent };
