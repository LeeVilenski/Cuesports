import { Rng } from '@cuesports/shared';
import type { MatchGame } from './match';
import { tourPlayer, type TourId } from './roster';
import { tourEventById, TOUR_VENUES } from './tour-events';
import { migratedPlayer, newPlayer, type Attr, type CareerPlayer, type Ratings } from './attributes';

/**
 * Career: a fictional circuit from the pub to the arena. Each venue holds events for one or two
 * disciplines; an event is a knockout bracket you play through round by round, against computer
 * players with levels and personalities of their own. Winning an event opens the next tier and
 * unlocks something for the customiser. There is no currency: only progress.
 *
 * Every venue, player and event here is fictional.
 */

export interface Venue {
  id: string;
  name: string;
  kind: 'Pub' | 'Club' | 'Hall' | 'Arena';
  tier: number;
}

export interface Opponent {
  id: string;
  name: string;
  /** Index into the figure presets. */
  look: number;
  /** −1 cautious … 1 attacking. */
  attack: number;
  /** Shown on the bracket and the rival card. */
  style: string;
}

export interface CareerEvent {
  id: string;
  title: string;
  venue: string;
  tier: number;
  game: MatchGame;
  /** Racks (or frames) to win, per round, first round first. The bracket has 2^rounds players. */
  raceTo: number[];
  /** Opponents' levels, weakest to strongest, in this event. */
  levels: [number, number];
  /** The tier's rival, waiting at the other end of the bracket. */
  rival: string;
  /** Unlocked by winning (see REWARDS). */
  reward: string;
  /** Snooker: reds in the rack. */
  reds?: 15 | 10 | 6;
  /** Billiards and carom: points to win a game (shorter than the standard for the career). */
  target?: number;
  /** Russian Pyramid: which rules (Free when unset). */
  pyramid?: 'free' | 'neva';
}

export const VENUES: Venue[] = [
  { id: 'red-lion', name: 'The Red Lion', kind: 'Pub', tier: 0 },
  { id: 'corner-pocket', name: 'Corner Pocket Club', kind: 'Club', tier: 1 },
  { id: 'cannon-room', name: 'The Cannon Room', kind: 'Club', tier: 1 },
  { id: 'riverside', name: 'Riverside Hall', kind: 'Hall', tier: 2 },
  { id: 'carambole', name: 'Café Carambole', kind: 'Hall', tier: 2 },
  { id: 'neva', name: 'Neva Billiard Hall', kind: 'Hall', tier: 2 },
  { id: 'northgate', name: 'Northgate Arena', kind: 'Arena', tier: 3 },
];

export const ROSTER: Opponent[] = [
  { id: 'gaz', name: 'Gaz Doyle', look: 1, attack: 0.8, style: 'Pots everything, fears nothing' },
  { id: 'priya', name: 'Priya Shah', look: 6, attack: -0.4, style: 'Patient, safety first' },
  { id: 'viktor', name: 'Viktor Lenz', look: 3, attack: 0.2, style: 'Cold, precise, relentless' },
  { id: 'cal', name: 'Cal "The Wire" Marlow', look: 5, attack: 0.5, style: 'The one everyone wants to beat' },
  { id: 'jo', name: 'Jo Fenn', look: 7, attack: 0.3, style: 'Quick and loose' },
  { id: 'eddie', name: 'Eddie Burke', look: 2, attack: -0.6, style: 'Grinds you down' },
  { id: 'nia', name: 'Nia Osei', look: 0, attack: 0.1, style: 'Steady all-rounder' },
  { id: 'tom', name: 'Tom Okafor', look: 4, attack: 0.6, style: 'Loves a long pot' },
  { id: 'mei', name: 'Mei Tanaka', look: 3, attack: -0.2, style: 'Sharp safety player' },
  { id: 'rob', name: 'Rob Hale', look: 2, attack: 0, style: 'Old-school club player' },
  { id: 'dani', name: 'Dani Cruz', look: 0, attack: 0.4, style: 'Plays the percentages' },
  { id: 'lewis', name: 'Lewis Grant', look: 7, attack: -0.3, style: 'Careful cueing' },
  { id: 'sam', name: 'Sam Petrov', look: 4, attack: 0.7, style: 'Breaks hard, runs out' },
  { id: 'ola', name: 'Ola Nilsen', look: 6, attack: -0.1, style: 'Never gives up' },
];

/** A computer player: one of the circuit regulars, or a tour player. */
export function opponent(id: string): Opponent {
  const o = ROSTER.find((x) => x.id === id);
  if (o) return o;
  const t = tourPlayer(id);
  return t ? { id: t.id, name: t.name, look: t.look, attack: t.attack, style: t.style } : ROSTER[0]!;
}

export const EVENTS: CareerEvent[] = [
  // The pub: short races, weaker players.
  {
    id: 'lion-9ball',
    title: 'Red Lion 9-Ball Night',
    venue: 'red-lion',
    tier: 0,
    game: 'nine-ball',
    raceTo: [2, 3],
    levels: [1, 2],
    rival: 'gaz',
    reward: 'wood:maple',
  },
  {
    id: 'lion-uk8',
    title: 'Red Lion Winter Cup',
    venue: 'red-lion',
    tier: 0,
    game: 'english',
    raceTo: [2, 3],
    levels: [1, 2],
    rival: 'gaz',
    reward: 'wrap:#141414',
  },
  // The club.
  {
    id: 'club-9ball',
    title: 'Corner Pocket 9-Ball Open',
    venue: 'corner-pocket',
    tier: 1,
    game: 'nine-ball',
    raceTo: [3, 3, 4],
    levels: [1.8, 3],
    rival: 'priya',
    reward: 'ferrule:ivory',
  },
  {
    id: 'club-10ball',
    title: 'Corner Pocket 10-Ball Classic',
    venue: 'corner-pocket',
    tier: 1,
    game: 'ten-ball',
    raceTo: [3, 3, 4],
    levels: [1.8, 3],
    rival: 'priya',
    reward: 'cloth.pool:#7a1f2b',
  },
  {
    id: 'club-snooker',
    title: 'Corner Pocket Six-Reds',
    venue: 'corner-pocket',
    tier: 1,
    game: 'snooker',
    raceTo: [2, 2, 3],
    levels: [1.8, 3],
    rival: 'priya',
    reward: 'waistcoat:#3a1f52',
    reds: 6,
  },
  // The hall.
  {
    id: 'hall-snooker',
    title: 'Riverside Ten-Reds',
    venue: 'riverside',
    tier: 2,
    game: 'snooker',
    raceTo: [2, 3, 3],
    levels: [2.8, 4],
    rival: 'viktor',
    reward: 'wood:rosewood',
    reds: 10,
  },
  {
    id: 'hall-9ball',
    title: 'Riverside 9-Ball Masters',
    venue: 'riverside',
    tier: 2,
    game: 'nine-ball',
    raceTo: [4, 4, 5],
    levels: [2.8, 4],
    rival: 'viktor',
    reward: 'wrap:#a3201c',
  },
  // The arena.
  {
    id: 'arena-snooker',
    title: 'Northgate Snooker Championship',
    venue: 'northgate',
    tier: 3,
    game: 'snooker',
    raceTo: [3, 3, 4],
    levels: [3.8, 5],
    rival: 'cal',
    reward: 'wood:ebony',
    reds: 15,
  },
  {
    id: 'arena-9ball',
    title: 'Northgate 9-Ball World Open',
    venue: 'northgate',
    tier: 3,
    game: 'nine-ball',
    raceTo: [5, 5, 7],
    levels: [3.8, 5],
    rival: 'cal',
    reward: 'ferrule:black',
  },
];

// The newer games: billiards at a club, then carom and pyramid in the halls.
EVENTS.push(
  {
    id: 'cannon-billiards',
    title: 'Cannon Room Billiards Handicap',
    venue: 'cannon-room',
    tier: 1,
    game: 'billiards',
    raceTo: [1, 1, 1],
    levels: [2, 3],
    rival: 'priya',
    reward: 'waistcoat:#5c3d12',
    target: 50,
  },
  {
    id: 'carambole-3c',
    title: 'Café Carambole 3-Cushion Open',
    venue: 'carambole',
    tier: 2,
    game: 'three-cushion',
    raceTo: [1, 1, 1],
    levels: [3, 4],
    rival: 'viktor',
    reward: 'wrap:#c9a227',
    target: 10,
  },
  {
    id: 'neva-pyramid',
    title: 'Neva Pyramid Cup',
    venue: 'neva',
    tier: 2,
    game: 'pyramid',
    pyramid: 'neva',
    raceTo: [2, 2, 3],
    levels: [3, 4],
    rival: 'viktor',
    reward: 'cloth.pool:#5a2f7a',
  },
);

export const careerEvent = (id: string): CareerEvent | undefined =>
  EVENTS.find((e) => e.id === id) ?? tourEventById(id);

/** An event's venue: a circuit venue or a tour one. */
export const venueOf = (e: CareerEvent): Venue =>
  VENUES.find((v) => v.id === e.venue) ?? TOUR_VENUES.find((v) => v.id === e.venue) ?? VENUES[0]!;

/**
 * Customiser items won in the career, keyed `kind:value`. Anything not listed here is open from
 * the start.
 */
export const REWARDS: Record<string, string> = {
  'wood:maple': 'Maple cue',
  'wood:rosewood': 'Rosewood cue',
  'wood:ebony': 'Ebony cue',
  'ferrule:ivory': 'Ivory ferrule',
  'ferrule:black': 'Black ferrule',
  'wrap:#141414': 'Black wrap',
  'wrap:#a3201c': 'Red wrap',
  'cloth.pool:#7a1f2b': 'Burgundy cloth',
  'waistcoat:#3a1f52': 'Plum waistcoat',
  'waistcoat:#5c3d12': 'Tan waistcoat',
  'wrap:#c9a227': 'Gold wrap',
  'cloth.pool:#5a2f7a': 'Purple cloth',
};

// ---------------------------------------------------------------------------------------------
// Progress

/** One entrant in a bracket: you, or a computer player at a level. */
export interface Entrant {
  id: string;
  level: number;
}

export interface CareerRun {
  event: string;
  /** Bracket order: slot 2k plays 2k+1 in the first round. You are always slot 0. */
  entrants: Entrant[];
  /** Winners' ids per completed round. */
  winners: string[][];
  /** Your current round (0 = first), or the round you went out in. */
  round: number;
  status: 'playing' | 'won' | 'out';
  /** Old Joe's target: matches he expects you to win in this event (see agent.ts). */
  target?: number;
  /** Old Joe's talk before the event, and after the last match you played in it. */
  talk?: string[];
  /** His verdict once the event is over for you. */
  debrief?: string[];
  /** Joe booked it (he pays the travel). */
  booked?: boolean;
}

/** A message in the career inbox. */
export interface CareerMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  read: boolean;
}

/** One finished event, for the timeline and Old Joe's memory. */
export interface CareerLogEntry {
  event: string;
  /** Matches won. */
  reached: number;
  target: number;
  champion: boolean;
  /** When it was played (older saves lack these). */
  season?: number;
  week?: number;
  /** Prize money after Joe's cut. */
  prize?: number;
}

export interface CareerState {
  /** Best round reached per event (the number of rounds means it was won). */
  best: Record<string, number>;
  unlocked: string[];
  /** Your record against each player: [won, lost]. */
  h2h: Record<string, [number, number]>;
  run: CareerRun | null;
  /** Old Joe's introduction has been seen. */
  introSeen: boolean;
  /** Old Joe's confidence in you, 0–100. */
  confidence: number;
  /** Newest first. */
  inbox: CareerMessage[];
  /** Finished events, oldest first. */
  log: CareerLogEntry[];
  /** Your ratings, XP, level and familiarity. */
  player: CareerPlayer;
  /** A training session is available (one between events). */
  trainingReady: boolean;
  /** What your last career match or session earned, for the result sheet and the hub. */
  lastGains: CareerGains | null;
  /** Seeds the calendar. */
  seed: number;
  season: number;
  /** 1 to WEEKS (season.ts). */
  week: number;
  /** Money in the bank, in pounds. */
  money: number;
  /** The tours you've joined (up to two), once you've specialised. */
  tours: TourMembership[];
  /**
   * Prize money won on each tour, by ranking (tour id, or `${tour}-ch` for the Challenge Tour), then
   * season, then player. The ranking is the last two seasons of it.
   */
  tourMoney: Record<string, Record<string, Record<string, number>>>;
}

export interface TourMembership {
  tour: TourId;
  /** Season you joined. */
  joined: number;
  /** Your tour card: valid from one season to another (inclusive), or none yet. */
  card: { from: number; until: number } | null;
}

export interface CareerGains {
  xp: Partial<Ratings>;
  ups: { attr: Attr; from: number; to: number }[];
  levels: number;
}

export const YOU = 'you';

export const newCareer = (): CareerState => ({
  best: {},
  unlocked: [],
  h2h: {},
  run: null,
  introSeen: false,
  confidence: 50,
  inbox: [],
  log: [],
  player: newPlayer(),
  trainingReady: true,
  lastGains: null,
  seed: 1,
  season: 1,
  week: 1,
  money: 50,
  tours: [],
  tourMoney: {},
});

export const rounds = (e: CareerEvent): number => e.raceTo.length;

/** Tiers open: the pub always, then each tier once an event in the one below has been won. */
export function tierOpen(state: CareerState, tier: number): boolean {
  if (tier === 0) return true;
  return EVENTS.some((e) => e.tier === tier - 1 && (state.best[e.id] ?? 0) >= rounds(e));
}

/** The highest tier open to you. */
export const topTier = (state: CareerState): number =>
  Math.max(...VENUES.filter((v) => tierOpen(state, v.tier)).map((v) => v.tier));

export const isLocked = (state: CareerState, key: string): boolean =>
  key in REWARDS && !state.unlocked.includes(key);

/** The event that unlocks an item, for the customiser's "Win … to unlock". */
export const unlockedBy = (key: string): CareerEvent | undefined => EVENTS.find((e) => e.reward === key);

/**
 * Enters an event: you in the first slot, the rival in the last (you can only meet in the final),
 * the rest drawn from the roster, with levels spread across the event's range.
 */
export function enter(e: CareerEvent, seed: number): CareerRun {
  const rng = new Rng(seed);
  const size = 2 ** rounds(e);
  const others = ROSTER.filter((o) => o.id !== e.rival && !EVENTS.some((x) => x.rival === o.id));
  // Shuffle the field.
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const [lo, hi] = e.levels;
  const field = others.slice(0, size - 2).map((o, i) => ({
    id: o.id,
    level: Math.round((lo + ((hi - lo) * 0.85 * (i + 0.5)) / (size - 2)) * 10) / 10,
  }));
  // Weaker players first, so your first-round opponent is the gentlest.
  field.sort((a, b) => a.level - b.level);
  const entrants: Entrant[] = [{ id: YOU, level: 0 }, ...field, { id: e.rival, level: hi }];
  return { event: e.id, entrants, winners: [], round: 0, status: 'playing' };
}

/**
 * Enters an event with a given field (tour events): you in the first slot, the strongest player in
 * the last, the rest drawn at random.
 */
export function enterField(e: CareerEvent, field: Entrant[], seed: number): CareerRun {
  return {
    event: e.id,
    entrants: draw([{ id: YOU, level: 0 }, ...field], seed),
    winners: [],
    round: 0,
    status: 'playing',
  };
}

/** A seeded draw: the first entrant first, the strongest last, the rest shuffled. */
export function draw(entrants: Entrant[], seed: number): Entrant[] {
  const rng = new Rng(seed);
  const [first, ...rest] = entrants;
  rest.sort((a, b) => b.level - a.level);
  const [top, ...others] = rest;
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  return [first!, ...others, ...(top ? [top] : [])];
}

/** Win chance for a against b in a career bracket. */
const edge = (a: number, b: number) => Math.min(0.85, Math.max(0.15, 0.5 + 0.18 * (a - b)));

/**
 * Plays out the rest of a bracket without you (after you went out, or an event you weren't in):
 * the stronger player usually goes through. Returns the winners for every round.
 */
export function playOut(run: CareerRun, total: number, seed: number): string[][] {
  const rng = new Rng(seed);
  const winners = run.winners.map((w) => [...w]);
  const level = (id: string) => run.entrants.find((x) => x.id === id)?.level ?? 1;
  while (winners.length < total) {
    const ids = winners.length === 0 ? run.entrants.map((x) => x.id) : winners.at(-1)!;
    const next: string[] = [];
    for (let i = 0; i < ids.length; i += 2) {
      const a = ids[i]!;
      const b = ids[i + 1]!;
      next.push(rng.next() < edge(level(a), level(b)) ? a : b);
    }
    winners.push(next);
  }
  return winners;
}

/** Rounds each entrant won, from a bracket's winners. */
export function reachedAll(run: CareerRun, winners: string[][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of run.entrants) out[x.id] = 0;
  for (const round of winners) for (const id of round) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** The players in round r, in bracket order (round 0: everyone). */
export function inRound(run: CareerRun, r: number): string[] {
  return r === 0 ? run.entrants.map((x) => x.id) : (run.winners[r - 1] ?? []);
}

/** Your opponent in the current round. */
export function nextOpponent(run: CareerRun): Entrant | null {
  if (run.status !== 'playing') return null;
  const ids = inRound(run, run.round);
  const me = ids.indexOf(YOU);
  const them = ids[me ^ 1];
  return run.entrants.find((x) => x.id === them) ?? null;
}

const levelOf = (run: CareerRun, id: string) => run.entrants.find((x) => x.id === id)?.level ?? 1;

/**
 * Records your match in the current round, decides the round's other matches (the stronger
 * player usually goes through) and moves on. Updates the bests, unlocks and head-to-heads.
 */
export function recordMatch(state: CareerState, won: boolean, seed: number): CareerState {
  const run = state.run;
  if (!run || run.status !== 'playing') return state;
  const e = careerEvent(run.event)!;
  const rng = new Rng(seed);
  const ids = inRound(run, run.round);
  const opp = nextOpponent(run)!;
  const winners: string[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i]!;
    const b = ids[i + 1]!;
    if (a === YOU || b === YOU) winners.push(won ? YOU : opp.id);
    else {
      const p = Math.min(0.85, Math.max(0.15, 0.5 + 0.18 * (levelOf(run, a) - levelOf(run, b))));
      winners.push(rng.next() < p ? a : b);
    }
  }
  const h2h = { ...state.h2h };
  const [w, l] = h2h[opp.id] ?? [0, 0];
  h2h[opp.id] = won ? [w + 1, l] : [w, l + 1];
  const reached = won ? run.round + 1 : run.round;
  const best = { ...state.best, [e.id]: Math.max(state.best[e.id] ?? 0, reached) };
  const champion = won && run.round === rounds(e) - 1;
  const next: CareerRun = {
    ...run,
    winners: [...run.winners, winners],
    round: won && !champion ? run.round + 1 : run.round,
    status: champion ? 'won' : won ? 'playing' : 'out',
  };
  const unlocked =
    champion && e.reward && !state.unlocked.includes(e.reward)
      ? [...state.unlocked, e.reward]
      : state.unlocked;
  return { ...state, best, unlocked, h2h, run: next };
}

/** "Final", "Semi-final", "Quarter-final", "Round 1" for round r of an event. */
export function roundName(e: CareerEvent, r: number): string {
  const left = rounds(e) - r;
  return left === 1 ? 'Final' : left === 2 ? 'Semi-final' : left === 3 ? 'Quarter-final' : `Round ${r + 1}`;
}

/** The best result in an event, in words. */
export function bestText(e: CareerEvent, reached: number | undefined): string {
  if (reached === undefined) return 'Not entered';
  if (reached >= rounds(e)) return 'Champion';
  return reached === 0
    ? `Out in ${roundName(e, 0).toLowerCase()}`
    : `Reached the ${roundName(e, reached).toLowerCase()}`;
}

// ---------------------------------------------------------------------------------------------
// Saving

const KEY = 'cuesports.career';

export function loadCareer(): CareerState {
  try {
    const raw = localStorage.getItem(KEY);
    // A new career gets a calendar of its own.
    return raw ? parseCareer(raw) : { ...newCareer(), seed: (Math.random() * 1e9) | 0 };
  } catch {
    return newCareer();
  }
}

/** A saved career, with anything an older save lacks (Old Joe, the inbox) at its start. */
export function parseCareer(raw: string | null): CareerState {
  if (!raw) return newCareer();
  try {
    const saved = JSON.parse(raw) as Partial<CareerState>;
    const s = { ...newCareer(), ...saved };
    // A career from before ratings: start them at the level of the tiers it reached.
    if (!saved.player) s.player = migratedPlayer(topTier(s));
    return s;
  } catch {
    return newCareer();
  }
}

export function saveCareer(s: CareerState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; fine for this session.
  }
}
