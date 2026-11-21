import type { LayoutId } from '@cuesports/physics';
import {
  AMERICAN_POOL_9FT,
  BALKLINE_47,
  CHINESE_8BALL_9FT,
  BALKLINE_71,
  CAROM_10FT,
  ENGLISH_POOL_7FT,
  PYRAMID_12FT,
  SNOOKER_12FT,
  type TableSpec,
} from '@cuesports/shared';

export interface GameDef {
  id: string;
  label: string;
  table: TableSpec;
  layout: LayoutId;
  /** Cue speed at full power, m/s. */
  maxSpeed: number;
}

/** Prototype set-ups. Rules arrive in M3/M4; for now every game is free practice on the right table. */
export const GAMES: GameDef[] = [
  { id: 'nine-ball', label: '9-ball', table: AMERICAN_POOL_9FT, layout: 'nine-ball', maxSpeed: 9 },
  { id: 'eight-ball', label: '8-ball', table: AMERICAN_POOL_9FT, layout: 'eight-ball', maxSpeed: 9 },
  { id: 'ten-ball', label: '10-ball', table: AMERICAN_POOL_9FT, layout: 'ten-ball', maxSpeed: 9 },
  { id: 'english', label: 'English pool', table: ENGLISH_POOL_7FT, layout: 'blackball', maxSpeed: 8 },
  {
    id: 'chinese-8ball',
    label: 'Chinese 8-ball',
    table: CHINESE_8BALL_9FT,
    layout: 'eight-ball',
    maxSpeed: 9,
  },
  { id: 'snooker', label: 'Snooker', table: SNOOKER_12FT, layout: 'snooker', maxSpeed: 7.5 },
  { id: 'billiards', label: 'English Billiards', table: SNOOKER_12FT, layout: 'billiards', maxSpeed: 7.5 },
  { id: 'three-cushion', label: '3-Cushion', table: CAROM_10FT, layout: 'carom', maxSpeed: 9 },
  { id: 'balkline-47-2', label: 'Balkline 47/2', table: BALKLINE_47, layout: 'carom', maxSpeed: 9 },
  { id: 'balkline-71-2', label: 'Balkline 71/2', table: BALKLINE_71, layout: 'carom', maxSpeed: 9 },
  { id: 'pyramid', label: 'Russian Pyramid', table: PYRAMID_12FT, layout: 'pyramid', maxSpeed: 9 },
  {
    id: 'practice',
    label: 'Practice: two balls',
    table: AMERICAN_POOL_9FT,
    layout: 'two-balls',
    maxSpeed: 9,
  },
];

/**
 * Maps the power bar (0–1) to cue speed, with fine control at the soft end. Halfway is a medium
 * shot (a cue ball of about 2.9 m/s); the top of the bar is a break.
 */
export const powerToSpeed = (p: number, max: number): number => 0.25 + (max - 0.25) * Math.pow(p, 2.2);

/**
 * An off-centre hit gives the ball less speed for the same cue speed (the impulse also has to
 * spin it). Players stroke a little harder for spin without thinking about it, so the game makes
 * up about a third of that. More than that made spin shots carry too far in playtesting.
 */
export const STROKE_COMPENSATION = 0.35;

export function strokeSpeed(
  cueSpeed: number,
  tip: { a: number; b: number },
  ballMass: number,
  cueMass: number,
): number {
  const loss = (2.5 * (tip.a * tip.a + tip.b * tip.b)) / (1 + ballMass / cueMass);
  return cueSpeed * (1 + STROKE_COMPENSATION * loss);
}

export type ClothSpeed = 'fast' | 'medium' | 'slow';

/**
 * Rolling resistance multipliers. The presets are medium (club) cloth; fast is close to a new
 * tournament cloth, slow to a worn pub table. Sliding friction is unchanged so spin behaves the same.
 */
export const CLOTH_SPEEDS: Record<ClothSpeed, { label: string; roll: number }> = {
  fast: { label: 'Fast (tournament)', roll: 0.8 },
  medium: { label: 'Medium (club)', roll: 1 },
  slow: { label: 'Slow (pub)', roll: 1.25 },
};

export function withClothSpeed(table: TableSpec, speed: ClothSpeed): TableSpec {
  const t = structuredClone(table);
  t.cloth.rollFriction *= CLOTH_SPEEDS[speed].roll;
  return t;
}

/**
 * What a scoring visit is called. American pool calls it a run ("a run of 6"); British pool,
 * snooker and billiards call it a break. (The opening shot is the break in every game.)
 */
export type VisitWord = 'break' | 'run';

/** Games played under American terms. New American games (straight pool, one-pocket) go here. */
const AMERICAN = new Set(['nine-ball', 'ten-ball', 'eight-ball', 'straight-pool', 'one-pocket', 'cowboy']);

export const visitWord = (game: string): VisitWord => (AMERICAN.has(game) ? 'run' : 'break');
