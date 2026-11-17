import type { LayoutId } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, ENGLISH_POOL_7FT, SNOOKER_12FT, type TableSpec } from '@cuesports/shared';

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
  { id: 'snooker', label: 'Snooker', table: SNOOKER_12FT, layout: 'snooker', maxSpeed: 7.5 },
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
 * shot (about 3 m/s off the tip, Alciatore's "medium" speed); the top of the bar is a break.
 */
export const powerToSpeed = (p: number, max: number): number => 0.25 + (max - 0.25) * p * p;

/**
 * An off-centre hit gives the ball less speed for the same cue speed (the impulse also has to
 * spin it). Players stroke a little harder for spin without thinking about it, so the game makes
 * most of that up: power sets the pace, and spin changes the pace only slightly.
 */
export const STROKE_COMPENSATION = 0.7;

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
