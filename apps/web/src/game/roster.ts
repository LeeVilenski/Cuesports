import { Rng } from '@cuesports/shared';
import type { MatchGame } from './match';

/**
 * The tours and the players on them. Every name here is made up. Each player has a home tour,
 * where they play at their full level, and one or two side tours, where they're weaker by the
 * crossover table: a snooker star is a solid mid-table pool player, a pool star scrapes around
 * the bottom of the snooker tour, and the best billiards players are dangerous anywhere.
 */

export type TourId = 'pool' | 'snooker' | 'blackball' | 'billiards' | 'pyramid';

export interface TourDef {
  id: TourId;
  name: string;
  /** The games played on the tour, in the order the weeks rotate through them. */
  games: MatchGame[];
  /** One line for the specialise screen. */
  blurb: string;
  /** Accent for its cards. */
  colour: string;
}

export const TOURS: TourDef[] = [
  {
    id: 'pool',
    name: 'American Pool Tour',
    games: ['nine-ball', 'ten-ball', 'nine-ball', 'straight-pool'],
    blurb: '9-ball, 10-ball and straight pool on the big tables',
    colour: 'blue',
  },
  {
    id: 'snooker',
    name: 'Snooker Tour',
    games: ['snooker'],
    blurb: 'Six-reds, ten-reds and the full fifteen',
    colour: 'green',
  },
  {
    id: 'blackball',
    name: 'Blackball Tour',
    games: ['english', 'english', 'chinese-8ball'],
    blurb: 'UK eight-ball, plus Chinese 8-ball events',
    colour: 'red',
  },
  {
    id: 'billiards',
    name: 'Billiards & Carom Tour',
    games: ['billiards', 'three-cushion', 'billiards', 'balkline-47-2'],
    blurb: 'English billiards, 3-cushion and balkline',
    colour: 'orange',
  },
  {
    id: 'pyramid',
    name: 'Pyramid Tour',
    games: ['pyramid'],
    blurb: 'Russian pyramid: tight pockets, hard hitting',
    colour: 'purple',
  },
];

export const tourDef = (id: TourId): TourDef => TOURS.find((t) => t.id === id)!;

/** How much weaker a player is on another tour: home tour (rows) → tour played (columns). */
export const CROSSOVER: Record<TourId, Record<TourId, number>> = {
  snooker: { snooker: 0, pool: -1.0, blackball: -0.8, billiards: -1.0, pyramid: -1.2 },
  pool: { pool: 0, snooker: -1.8, blackball: -0.6, billiards: -1.5, pyramid: -1.0 },
  blackball: { blackball: 0, pool: -0.8, snooker: -1.6, billiards: -1.6, pyramid: -1.2 },
  billiards: { billiards: 0, pool: -1.2, snooker: -0.8, blackball: -1.0, pyramid: -1.0 },
  pyramid: { pyramid: 0, pool: -0.8, snooker: -1.0, blackball: -1.0, billiards: -1.2 },
};

export interface TourPlayer {
  id: string;
  name: string;
  /** Index into the figure presets. */
  look: number;
  /** −1 cautious … 1 attacking. */
  attack: number;
  style: string;
  home: TourId;
  /** Level on the home tour (1–5, as the computer levels). */
  level: number;
  /** Tours they also play some events on. */
  sides: TourId[];
}

const FIRST = [
  'Aled',
  'Bea',
  'Callum',
  'Dara',
  'Elif',
  'Femi',
  'Greta',
  'Hugo',
  'Ines',
  'Jonas',
  'Kasia',
  'Liam',
  'Maren',
  'Nico',
  'Orla',
  'Pavel',
  'Quinn',
  'Rosa',
  'Sven',
  'Tara',
  'Umar',
  'Vera',
  'Wes',
  'Yara',
  'Zane',
  'Anouk',
  'Bram',
  'Chloe',
  'Dev',
  'Esme',
  'Finn',
  'Gil',
  'Hana',
  'Ivo',
  'Jade',
  'Kofi',
  'Lena',
  'Milo',
  'Nadia',
  'Otto',
];
const LAST = [
  'Ashby',
  'Brennan',
  'Castell',
  'Dunmore',
  'Ekwueme',
  'Faulds',
  'Garrow',
  'Holm',
  'Iqbal',
  'Jessop',
  'Kerrigan',
  'Lindqvist',
  'Mabry',
  'Novak',
  'Okonjo',
  'Pryce',
  'Quarry',
  'Rook',
  'Sallis',
  'Tamm',
  'Ulven',
  'Varga',
  'Wynne',
  'Yoshida',
  'Zorn',
  'Achterberg',
  'Brisco',
  'Cardew',
  'Delacroix',
  'Ewart',
];
const STYLES = [
  'Heavy scorer',
  'Safety specialist',
  'Fast and fearless',
  'Grinds you down',
  'Silky cue action',
  'Long-pot merchant',
  'Tactical genius',
  'Streaky but deadly',
  'Ice in the veins',
  'Never misses a short one',
  'Old head, young legs',
  'Breaks like thunder',
];

/** Players per tour: 16 pros and 8 hopefuls. */
export const PROS = 16;
export const HOPEFULS = 8;

function makeRoster(): TourPlayer[] {
  const rng = new Rng(20261128);
  const used = new Set<string>();
  const out: TourPlayer[] = [];
  for (const t of TOURS) {
    for (let i = 0; i < PROS + HOPEFULS; i++) {
      const pickName = () =>
        `${FIRST[Math.floor(rng.next() * FIRST.length)]} ${LAST[Math.floor(rng.next() * LAST.length)]}`;
      let name = pickName();
      while (used.has(name)) name = pickName();
      used.add(name);
      // Pros from 5.0 down to 3.6; hopefuls from 3.4 down to 2.4.
      const level =
        i < PROS
          ? Math.round((5 - (1.4 * i) / (PROS - 1)) * 10) / 10
          : Math.round((3.4 - (1.0 * (i - PROS)) / (HOPEFULS - 1)) * 10) / 10;
      // The top half of the pros play a side tour or two.
      const others = TOURS.map((x) => x.id).filter((x) => x !== t.id);
      const sides: TourId[] = [];
      if (i < PROS / 2) {
        sides.push(others[Math.floor(rng.next() * others.length)]!);
        if (i < 3) {
          const more = others.filter((x) => !sides.includes(x));
          sides.push(more[Math.floor(rng.next() * more.length)]!);
        }
      }
      out.push({
        id: `${t.id}-${i}`,
        name,
        look: Math.floor(rng.next() * 8),
        attack: Math.round((rng.next() * 2 - 1) * 10) / 10,
        style: STYLES[Math.floor(rng.next() * STYLES.length)]!,
        home: t.id,
        level,
        sides,
      });
    }
  }
  return out;
}

export const TOUR_PLAYERS: TourPlayer[] = makeRoster();

export const tourPlayer = (id: string): TourPlayer | undefined => TOUR_PLAYERS.find((p) => p.id === id);

/** A player's level on a tour (their home level less the crossover), or null if they don't play it. */
export function levelOn(p: TourPlayer, tour: TourId): number | null {
  if (p.home === tour) return p.level;
  if (!p.sides.includes(tour)) return null;
  return Math.max(1, Math.round((p.level + CROSSOVER[p.home][tour]) * 10) / 10);
}

/** Everyone who plays a tour, with their level on it, strongest first. */
export function tourField(tour: TourId): { id: string; level: number }[] {
  return TOUR_PLAYERS.flatMap((p) => {
    const l = levelOn(p, tour);
    return l === null ? [] : [{ id: p.id, level: l }];
  }).sort((a, b) => b.level - a.level);
}
