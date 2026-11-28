import type { CareerEvent, Venue } from './career';
import type { MatchGame } from './match';
import { tourDef, tourField, TOURS, type TourId } from './roster';

/**
 * Tour events, as data: what each tour plays each week of a season. They are made up from the tour,
 * season, week and kind, so an event's id is enough to rebuild it (`t.pool.2.5.ranking`).
 *
 * - Challenge events (weeks 1–11): for players without a tour card. Small fields, short races.
 * - Ranking events (every other week): for card holders. Their prize money is the ranking.
 * - Majors (weeks 4, 8 and 11): the top of the ranking only, the biggest purses.
 * - Week 12: Q-School (for a tour card) and the Tour Finals (the top 8).
 */

export type TourEventKind = 'challenge' | 'ranking' | 'major' | 'qschool' | 'finals';

export interface TourEvent extends CareerEvent {
  tour: TourId;
  kind: TourEventKind;
  season: number;
  week: number;
  /** Entry fee in pounds. */
  fee: number;
  /** The winner's prize. */
  purse: number;
}

export const MAJOR_WEEKS = [4, 8, 11];
/** Majors take the top of the ranking; the finals the top 8. */
export const MAJOR_FIELD = 12;
export const FINALS_FIELD = 8;

export const TOUR_VENUES: Venue[] = [
  { id: 'tour-challenge', name: 'Challenge Tour hall', kind: 'Hall', tier: 2 },
  { id: 'tour-ranking', name: 'Exhibition Centre', kind: 'Arena', tier: 3 },
  { id: 'tour-major', name: 'The Grand Arena', kind: 'Arena', tier: 3 },
];

const PLACES = [
  'Marrowby',
  'Kelstone',
  'Dunhallow',
  'Brightwater',
  'Ravensgate',
  'Hollowmere',
  'Stonebury',
  'Larkhaven',
];

const MAJORS: Record<TourId, string[]> = {
  pool: ['American Pool Masters', 'World 10-Ball Classic', 'International 9-Ball Open'],
  snooker: ['Snooker Masters', 'Six-Reds World Cup', 'Snooker Championship'],
  blackball: ['Blackball Masters', 'World Eight-Ball Classic', 'Blackball Championship'],
  billiards: ['Billiards Masters', 'Three-Cushion World Cup', 'Billiards Championship'],
  pyramid: ['Pyramid Masters', 'Neva Cup', 'Pyramid Championship'],
};

/** Games scored to a points target: one game a round, to `target`. */
const TARGET_GAMES = new Set<MatchGame>([
  'billiards',
  'three-cushion',
  'balkline-47-2',
  'balkline-71-2',
  'straight-pool',
]);

const TARGETS: Partial<Record<MatchGame, [number, number, number]>> = {
  billiards: [50, 75, 100],
  'three-cushion': [8, 10, 12],
  'balkline-47-2': [50, 75, 100],
  'balkline-71-2': [50, 75, 100],
  'straight-pool': [25, 40, 50],
};

/** Race lengths per round, short to long: challenge, ranking, major. */
function races(game: MatchGame, kind: TourEventKind): number[] {
  const size = kind === 'challenge' ? 3 : kind === 'finals' ? 3 : 4;
  if (TARGET_GAMES.has(game)) return Array.from({ length: size }, () => 1);
  const big = kind === 'major' || kind === 'finals';
  if (game === 'snooker')
    return kind === 'challenge' ? [1, 1, 2] : big ? [2, 2, 3, 3].slice(-size) : [1, 2, 2, 3];
  if (game === 'pyramid')
    return kind === 'challenge' ? [2, 2, 3] : big ? [3, 3, 3, 4].slice(-size) : [2, 2, 3, 3];
  return kind === 'challenge' ? [2, 3, 3] : big ? [4, 4, 5, 5].slice(-size) : [3, 3, 4, 4];
}

const PURSE: Record<TourEventKind, number> = {
  challenge: 1500,
  qschool: 0,
  ranking: 8000,
  major: 25000,
  finals: 40000,
};
const FEE: Record<TourEventKind, number> = {
  challenge: 100,
  qschool: 500,
  ranking: 250,
  major: 0,
  finals: 0,
};

/** The events a tour holds in a week. */
export function kindsInWeek(week: number): TourEventKind[] {
  if (week >= 12) return ['qschool', 'finals'];
  return ['challenge', MAJOR_WEEKS.includes(week) ? 'major' : 'ranking'];
}

export function tourEvent(tour: TourId, season: number, week: number, kind: TourEventKind): TourEvent {
  const t = tourDef(tour);
  const n = MAJOR_WEEKS.indexOf(week);
  const game =
    kind === 'major' && tour === 'billiards' && n === 1
      ? 'three-cushion'
      : t.games[(week + season) % t.games.length]!;
  const reds: 6 | 10 | 15 | undefined =
    game !== 'snooker'
      ? undefined
      : kind === 'challenge'
        ? 6
        : kind === 'major' && n === 1
          ? 6
          : kind === 'ranking'
            ? week % 2
              ? 10
              : 15
            : 15;
  const place = PLACES[(week * 3 + season + TOURS.findIndex((x) => x.id === tour)) % PLACES.length]!;
  const short = t.name.replace(/ Tour$/, '');
  const title =
    kind === 'challenge'
      ? `${short} Challenge ${week}`
      : kind === 'ranking'
        ? `${place} ${short} Open`
        : kind === 'major'
          ? MAJORS[tour][n]!
          : kind === 'qschool'
            ? `${short} Q-School`
            : `${short} Tour Finals`;
  const level = kind === 'challenge' || kind === 'qschool' ? 2 : 3;
  const targets = TARGETS[game];
  const target = targets
    ? targets[kind === 'challenge' || kind === 'qschool' ? 0 : kind === 'ranking' ? 1 : 2]
    : undefined;
  const raceTo = races(game, kind);
  const rival = tourField(tour)[0]!.id;
  const e: TourEvent = {
    id: `t.${tour}.${season}.${week}.${kind}`,
    title,
    venue:
      kind === 'challenge' || kind === 'qschool'
        ? 'tour-challenge'
        : kind === 'ranking'
          ? 'tour-ranking'
          : 'tour-major',
    tier: level,
    game,
    raceTo: kind === 'finals' ? raceTo.slice(-3) : raceTo,
    levels: level === 2 ? [2.4, 3.6] : [3.6, 5],
    rival,
    reward: '',
    tour,
    kind,
    season,
    week,
    fee: FEE[kind],
    purse: PURSE[kind],
  };
  if (reds) e.reds = reds;
  if (target) e.target = target;
  if (game === 'pyramid') e.pyramid = week % 2 ? 'neva' : 'free';
  return e;
}

/** Rebuilds a tour event from its id, or undefined if it isn't one. */
export function tourEventById(id: string): TourEvent | undefined {
  const m = /^t\.(\w+)\.(\d+)\.(\d+)\.(\w+)$/.exec(id);
  if (!m) return undefined;
  const tour = m[1] as TourId;
  if (!TOURS.some((t) => t.id === tour)) return undefined;
  return tourEvent(tour, Number(m[2]), Number(m[3]), m[4] as TourEventKind);
}

export const isTourEvent = (e: CareerEvent | undefined): e is TourEvent => !!e && 'tour' in e;
