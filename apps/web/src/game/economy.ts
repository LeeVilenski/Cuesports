import { Rng } from '@cuesports/shared';
import { addXp, type Attr, type Ratings } from './attributes';
import { careerEvent, REWARDS, ROSTER, rounds, topTier, type CareerState, type Sponsor } from './career';
import { TOUR_PLAYERS, type TourId } from './roster';

/**
 * Spending, sponsors and the story's flavour: a shop of cues (with small stats) and kit, paid
 * coaching, a sponsor each season once you're worth one, a nickname, and rivals who earn the name.
 * Money speeds you up and dresses you up; it never raises your ceiling.
 */

// ---------------------------------------------------------------------------------------------
// Cues

export interface CueDef {
  id: string;
  name: string;
  price: number;
  /** Rating points it adds (or takes) while it's in your hands. Small on purpose. */
  bonus: Partial<Ratings>;
  blurb: string;
}

export const CUES: CueDef[] = [
  {
    id: 'house',
    name: 'House cue',
    price: 0,
    bonus: {},
    blurb: 'Off the rack at the Red Lion. It does the job.',
  },
  {
    id: 'ash',
    name: 'Ash club cue',
    price: 300,
    bonus: { cueing: 3 },
    blurb: 'A proper cue of your own: a bit more power.',
  },
  {
    id: 'breaker',
    name: 'Heavy breaker',
    price: 650,
    bonus: { cueing: 5, touch: -2 },
    blurb: 'All weight: big power, less feel.',
  },
  {
    id: 'spinner',
    name: 'Maple spinner',
    price: 650,
    bonus: { spin: 5, cueing: -1 },
    blurb: 'A whippy shaft that grips the ball: more spin.',
  },
  {
    id: 'lowdef',
    name: 'Low-deflection shaft',
    price: 900,
    bonus: { touch: 5 },
    blurb: 'Pushes the cue ball off line less: the guide allows for more.',
  },
  {
    id: 'carom',
    name: 'Carom special',
    price: 900,
    bonus: { cushion: 5 },
    blurb: 'Stiff and short: steadier off the cushion and over a ball.',
  },
  {
    id: 'ebony',
    name: 'Ebony pro cue',
    price: 2500,
    bonus: { cueing: 3, spin: 3, cushion: 3, touch: 3 },
    blurb: 'A cue the pros would be happy with. Everything a touch better.',
  },
];

export const cueDef = (id: string): CueDef => CUES.find((c) => c.id === id) ?? CUES[0]!;

/** The rating points your cue adds. */
export const cueBonus = (s: CareerState): Partial<Ratings> => cueDef(s.cue).bonus;

export function buyCue(s: CareerState, id: string): CareerState {
  const c = CUES.find((x) => x.id === id);
  if (!c || s.cues.includes(id) || s.money < c.price) return s;
  return { ...s, money: s.money - c.price, cues: [...s.cues, id], cue: id };
}

export const equipCue = (s: CareerState, id: string): CareerState =>
  s.cues.includes(id) ? { ...s, cue: id } : s;

// ---------------------------------------------------------------------------------------------
// Kit: the career's cosmetic prizes can be bought as well as won.

export const KIT_PRICES: Record<string, number> = {
  'wood:maple': 200,
  'wrap:#141414': 150,
  'ferrule:ivory': 250,
  'cloth.pool:#7a1f2b': 300,
  'waistcoat:#3a1f52': 300,
  'waistcoat:#5c3d12': 300,
  'wood:rosewood': 500,
  'wrap:#a3201c': 250,
  'wrap:#c9a227': 400,
  'cloth.pool:#5a2f7a': 400,
  'wood:ebony': 800,
  'ferrule:black': 350,
};

export function buyKit(s: CareerState, key: string): CareerState {
  const price = KIT_PRICES[key];
  if (price === undefined || !(key in REWARDS) || s.unlocked.includes(key) || s.money < price) return s;
  return { ...s, money: s.money - price, unlocked: [...s.unlocked, key] };
}

// ---------------------------------------------------------------------------------------------
// Coaching

/** XP from one paid session. */
export const COACHING_XP = 50;

/** A session costs more the higher you play. */
export function coachingPrice(s: CareerState): number {
  if (s.tours.length) return 300;
  return [40, 80, 150, 200][topTier(s)] ?? 200;
}

const weekKey = (s: CareerState) => `${s.season}-${s.week}`;
export const coachedThisWeek = (s: CareerState): boolean => s.coached === weekKey(s);

/** One paid session a week, on one attribute, up to your ceiling. */
export function coach(s: CareerState, attr: Attr, ceiling: number): CareerState {
  const price = coachingPrice(s);
  if (coachedThisWeek(s) || s.money < price || s.player.ratings[attr] >= ceiling) return s;
  const a = addXp(s.player, { [attr]: COACHING_XP }, ceiling);
  return {
    ...s,
    money: s.money - price,
    coached: weekKey(s),
    player: a.player,
    lastGains: { xp: { [attr]: COACHING_XP }, ups: a.ups, levels: 0 },
  };
}

// ---------------------------------------------------------------------------------------------
// Sponsors

const SPONSORS = [
  "Brennan's Chalk Co.",
  'Velvet Baize Mills',
  'Hollowmere Brewery',
  'Ravensgate Motors',
  'Kelstone Cue Works',
  'Larkhaven Bakery',
  'Stonebury Building Supplies',
  'Marrowby Kebab House',
];

/** You're worth a sponsor once you've won a couple of titles, or got onto a tour. */
export const sponsorable = (s: CareerState): boolean =>
  s.tours.length > 0 || s.log.filter((l) => l.champion).length >= 2;

/** This season's offer. */
export function sponsorOffer(s: CareerState): Sponsor {
  const rng = new Rng(s.seed * 13 + s.season * 7);
  const retainer = s.tours.length ? 1500 : topTier(s) >= 2 ? 500 : 150;
  return {
    name: SPONSORS[Math.floor(rng.next() * SPONSORS.length)]!,
    season: s.season,
    retainer,
    semis: 3,
    bonus: retainer * 2,
  };
}

export function signSponsor(s: CareerState, offer: Sponsor): CareerState {
  if (s.sponsor?.season === offer.season) return s;
  return { ...s, sponsor: offer, money: s.money + offer.retainer };
}

/** Semi-finals or better this season, for the sponsor's bonus. */
export function semisReached(s: CareerState, season: number): number {
  return s.log.filter((l) => {
    const e = careerEvent(l.event);
    return l.season === season && e && l.reached >= Math.max(1, rounds(e) - 2);
  }).length;
}

// ---------------------------------------------------------------------------------------------
// Nicknames

export const NICKNAMES = [
  'The Hammer',
  'The Professor',
  'Lightning',
  'The Rocket',
  'Silk',
  'The Grinder',
  'Iceman',
  'The Magician',
  'Steady',
  'The Wizard',
  'Thunder',
  'The Ghost',
];

/** Four to choose from, seeded per career. */
export function nicknameChoices(s: CareerState): string[] {
  const rng = new Rng(s.seed * 17 + 3);
  const xs = [...NICKNAMES];
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs.slice(0, 4);
}

/** Earned with three titles, or a tour card. */
export const nicknameEarned = (s: CareerState): boolean =>
  s.log.filter((l) => l.champion).length >= 3 || s.tours.some((m) => m.card);

export const chooseNickname = (s: CareerState, name: string): CareerState =>
  NICKNAMES.includes(name) ? { ...s, nickname: name } : s;

// ---------------------------------------------------------------------------------------------
// Rivals

/** Who counts as which group's player: the circuit, or a tour (home or side). */
function group(id: string): 'circuit' | TourId | null {
  if (ROSTER.some((o) => o.id === id)) return 'circuit';
  return TOUR_PLAYERS.find((p) => p.id === id)?.home ?? null;
}

/**
 * Your rivals: in each group (the circuit, each tour), the player who has beaten you most, as long
 * as they've beaten you at least twice and lead the head-to-head.
 */
export function rivals(
  s: CareerState,
): { id: string; group: 'circuit' | TourId; won: number; lost: number }[] {
  const best = new Map<string, { id: string; won: number; lost: number }>();
  for (const [id, [won, lost]] of Object.entries(s.h2h)) {
    const g = group(id);
    if (!g || lost < 2 || lost <= won) continue;
    const cur = best.get(g);
    if (!cur || lost - won > cur.lost - cur.won || (lost - won === cur.lost - cur.won && lost > cur.lost))
      best.set(g, { id, won, lost });
  }
  return [...best.entries()].map(([g, r]) => ({ ...r, group: g as 'circuit' | TourId }));
}

export const isRival = (s: CareerState, id: string): boolean => rivals(s).some((r) => r.id === id);
