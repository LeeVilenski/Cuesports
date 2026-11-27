import { Rng } from '@cuesports/shared';
import type { MatchGame } from './match';
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

export const opponent = (id: string): Opponent => ROSTER.find((o) => o.id === id) ?? ROSTER[0]!;

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

export const careerEvent = (id: string): CareerEvent | undefined => EVENTS.find((e) => e.id === id);

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
    champion && !state.unlocked.includes(e.reward) ? [...state.unlocked, e.reward] : state.unlocked;
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
    return parseCareer(localStorage.getItem(KEY));
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
