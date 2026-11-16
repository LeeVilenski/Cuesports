import { type Vec2, norm2 } from './math';
import type { BallSetSpec, ClothSpec, CushionSpec, MarkingSpec, PocketSpec, TableSpec } from './specs';

interface PocketParams {
  mouthWidth: number;
  jawAngle: number;
  jawRadius: number;
  shelfDepth: number;
  fallRadius: number;
}

/** Builds the six pockets of a standard table from corner and side pocket parameters. */
export function sixPockets(
  length: number,
  width: number,
  corner: PocketParams,
  side: PocketParams,
): PocketSpec[] {
  const hl = length / 2;
  const hw = width / 2;
  const pockets: PocketSpec[] = [];
  const corners: [string, number, number][] = [
    ['bottom-left', -1, -1],
    ['bottom-right', 1, -1],
    ['top-right', 1, 1],
    ['top-left', -1, 1],
  ];
  for (const [id, sx, sy] of corners) {
    const axis = norm2({ x: sx, y: sy });
    // The mouth is the hypotenuse between the jaw tips; its midpoint is mouthWidth/2 from the corner.
    const mouth: Vec2 = {
      x: sx * hl - (axis.x * corner.mouthWidth) / 2,
      y: sy * hw - (axis.y * corner.mouthWidth) / 2,
    };
    pockets.push(makePocket(id, 'corner', mouth, axis, corner));
  }
  for (const [id, sy] of [
    ['bottom-side', -1],
    ['top-side', 1],
  ] as const) {
    pockets.push(makePocket(id, 'side', { x: 0, y: sy * hw }, { x: 0, y: sy }, side));
  }
  return pockets;
}

function makePocket(
  id: string,
  kind: 'corner' | 'side',
  mouth: Vec2,
  axis: Vec2,
  p: PocketParams,
): PocketSpec {
  const d = p.shelfDepth + p.fallRadius;
  return { id, kind, position: { x: mouth.x + axis.x * d, y: mouth.y + axis.y * d }, axis, ...p };
}

const STANDARD_BALL_FRICTION = { a: 9.951e-3, b: 0.108, c: 1.088 };

// --- Snooker -----------------------------------------------------------------------------------

const SNOOKER_L = 3.569;
const SNOOKER_W = 1.778;
const BAULK_X = -SNOOKER_L / 2 + 0.737;
const D_RADIUS = 0.292;

const snookerMarkings: MarkingSpec[] = [
  { type: 'line', id: 'baulk', a: { x: BAULK_X, y: -SNOOKER_W / 2 }, b: { x: BAULK_X, y: SNOOKER_W / 2 } },
  { type: 'arc', id: 'D', centre: { x: BAULK_X, y: 0 }, radius: D_RADIUS, startDeg: 90, endDeg: 270 },
  // Viewed from the baulk end (looking along +x), yellow is on the right (−y).
  { type: 'spot', id: 'yellow', position: { x: BAULK_X, y: -D_RADIUS } },
  { type: 'spot', id: 'brown', position: { x: BAULK_X, y: 0 } },
  { type: 'spot', id: 'green', position: { x: BAULK_X, y: D_RADIUS } },
  { type: 'spot', id: 'blue', position: { x: 0, y: 0 } },
  { type: 'spot', id: 'pink', position: { x: SNOOKER_L / 4, y: 0 } },
  { type: 'spot', id: 'black', position: { x: SNOOKER_L / 2 - 0.324, y: 0 } },
];

export const SNOOKER_12FT: TableSpec = {
  id: 'snooker-12ft',
  name: 'Snooker 12 ft',
  playfield: { length: SNOOKER_L, width: SNOOKER_W },
  cushion: {
    noseHeight: 0.0335,
    restitution: 0.88,
    restitutionSlope: 0.03,
    minRestitution: 0.7,
    friction: 0.2,
    profile: 'snooker',
  },
  cloth: { slideFriction: 0.17, rollFriction: 0.0125, spinFriction: 0.0075 } satisfies ClothSpec,
  pockets: sixPockets(
    SNOOKER_L,
    SNOOKER_W,
    { mouthWidth: 0.086, jawAngle: 135, jawRadius: 0.04, shelfDepth: 0.015, fallRadius: 0.045 },
    { mouthWidth: 0.105, jawAngle: 92, jawRadius: 0.03, shelfDepth: 0.02, fallRadius: 0.05 },
  ),
  markings: snookerMarkings,
  balls: {
    object: { radius: 0.02625, mass: 0.142 },
    cue: { radius: 0.02625, mass: 0.142 },
    restitution: 0.94,
    friction: STANDARD_BALL_FRICTION,
  } satisfies BallSetSpec,
};

// --- English pool --------------------------------------------------------------------------------

const EP_L = 1.98;
const EP_W = 0.99;

export const ENGLISH_POOL_7FT: TableSpec = {
  id: 'english-pool-7ft',
  name: 'English pool 7 ft',
  playfield: { length: EP_L, width: EP_W },
  cushion: {
    noseHeight: 0.0323,
    restitution: 0.9,
    restitutionSlope: 0.03,
    minRestitution: 0.7,
    friction: 0.2,
    profile: 'K66',
  } satisfies CushionSpec,
  cloth: { slideFriction: 0.16, rollFriction: 0.014, spinFriction: 0.0075 },
  pockets: sixPockets(
    EP_L,
    EP_W,
    { mouthWidth: 0.088, jawAngle: 135, jawRadius: 0.03, shelfDepth: 0.012, fallRadius: 0.045 },
    { mouthWidth: 0.098, jawAngle: 92, jawRadius: 0.025, shelfDepth: 0.015, fallRadius: 0.05 },
  ),
  markings: [
    {
      type: 'line',
      id: 'baulk',
      a: { x: -EP_L / 2 + EP_L / 5, y: -EP_W / 2 },
      b: { x: -EP_L / 2 + EP_L / 5, y: EP_W / 2 },
    },
    { type: 'spot', id: 'black', position: { x: EP_L / 4, y: 0 } },
  ],
  balls: {
    object: { radius: 0.0254, mass: 0.14 },
    cue: { radius: 0.0238, mass: 0.122 },
    restitution: 0.94,
    friction: STANDARD_BALL_FRICTION,
  },
};

// --- American pool -------------------------------------------------------------------------------

const AP_L = 2.54;
const AP_W = 1.27;

export const AMERICAN_POOL_9FT: TableSpec = {
  id: 'american-pool-9ft',
  name: 'American pool 9 ft',
  playfield: { length: AP_L, width: AP_W },
  cushion: {
    noseHeight: 0.0363,
    restitution: 0.92,
    restitutionSlope: 0.03,
    minRestitution: 0.7,
    friction: 0.2,
    profile: 'K66',
  },
  cloth: { slideFriction: 0.16, rollFriction: 0.0125, spinFriction: 0.0075 },
  pockets: sixPockets(
    AP_L,
    AP_W,
    { mouthWidth: 0.1143, jawAngle: 142, jawRadius: 0.0127, shelfDepth: 0.02, fallRadius: 0.055 },
    { mouthWidth: 0.13, jawAngle: 104, jawRadius: 0.0127, shelfDepth: 0.01, fallRadius: 0.06 },
  ),
  markings: [
    { type: 'line', id: 'head-string', a: { x: -AP_L / 4, y: -AP_W / 2 }, b: { x: -AP_L / 4, y: AP_W / 2 } },
    { type: 'spot', id: 'head', position: { x: -AP_L / 4, y: 0 } },
    { type: 'spot', id: 'centre', position: { x: 0, y: 0 } },
    { type: 'spot', id: 'foot', position: { x: AP_L / 4, y: 0 } },
  ],
  balls: {
    object: { radius: 0.028575, mass: 0.17 },
    cue: { radius: 0.028575, mass: 0.17 },
    restitution: 0.95,
    friction: STANDARD_BALL_FRICTION,
  },
};

export const TABLE_PRESETS: readonly TableSpec[] = [SNOOKER_12FT, ENGLISH_POOL_7FT, AMERICAN_POOL_9FT];
