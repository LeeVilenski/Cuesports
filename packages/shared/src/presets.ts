import { type Vec2, norm2 } from './math';
import type { BallSetSpec, ClothSpec, CushionSpec, MarkingSpec, PocketSpec, TableSpec } from './specs';

interface PocketParams {
  mouthWidth: number;
  jawAngle: number;
  jawRadius: number;
  shelfDepth: number;
  dropSag: number;
  fallRadius: number;
  dropFacingRestitution: number | null;
  backRestitution: number | null;
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
  // About 136mm of cushion and rail each side: 3.84m x 2.05m overall, like full-size match tables.
  trim: { cushionWidth: 0.05, railWidth: 0.086, cushionTopAboveNose: 0.007, railTopAboveNose: 0.013 },
  cushion: {
    noseHeight: 0.0335,
    restitution: 0.8,
    restitutionSlope: 0.04,
    minRestitution: 0.6,
    hugSpeed: 0.12,
    friction: 0.2,
    profile: 'snooker',
  },
  cloth: { slideFriction: 0.18, rollFriction: 0.0125, spinFriction: 0.0075 } satisfies ClothSpec,
  pockets: sixPockets(
    SNOOKER_L,
    SNOOKER_W,
    // Tight, lively snooker pockets: a smaller knuckle that throws back balls clipping the jaw, and a
    // soft pocket back, so firm pots that catch a jaw rattle out (playtest: they were far too easy).
    // The corner facings close in towards the back (142°, not parallel at 135°): a ball that hits
    // the cushion just before the pocket meets the far facing square-on and is thrown back out
    // unless it is going slowly (playtest: cushion-first pots dropped at any pace, like pool).
    {
      mouthWidth: 0.086,
      jawAngle: 142,
      jawRadius: 0.015,
      shelfDepth: 0.02,
      dropSag: 0.01,
      fallRadius: 0.045,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
    {
      mouthWidth: 0.105,
      jawAngle: 92,
      jawRadius: 0.015,
      shelfDepth: 0.015,
      dropSag: 0.008,
      fallRadius: 0.05,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
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
    restitution: 0.85,
    restitutionSlope: 0.04,
    minRestitution: 0.65,
    hugSpeed: 0.12,
    friction: 0.2,
    profile: 'K66',
  } satisfies CushionSpec,
  cloth: { slideFriction: 0.18, rollFriction: 0.014, spinFriction: 0.0075 },
  pockets: sixPockets(
    EP_L,
    EP_W,
    // Tight English pockets, built like the snooker ones, corner facings closing in included.
    {
      mouthWidth: 0.088,
      jawAngle: 142,
      jawRadius: 0.015,
      shelfDepth: 0.015,
      dropSag: 0.01,
      fallRadius: 0.045,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
    {
      mouthWidth: 0.098,
      jawAngle: 92,
      jawRadius: 0.015,
      shelfDepth: 0.015,
      dropSag: 0.008,
      fallRadius: 0.05,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
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

// --- American pool -----
// Pockets follow the WPA tournament specification: corner mouth 4.5" (4.5–4.625"), facing angle
// 142°, shelf 1–2.25"; side mouth 5.125" (5–5.125"), facing angle 103–104°, shelf 0–0.375".--------------------------------------------------------------------------

const AP_L = 2.54;
const AP_W = 1.27;

export const AMERICAN_POOL_9FT: TableSpec = {
  id: 'american-pool-9ft',
  name: 'American pool 9 ft',
  playfield: { length: AP_L, width: AP_W },
  cushion: {
    noseHeight: 0.0363,
    restitution: 0.85,
    restitutionSlope: 0.04,
    minRestitution: 0.65,
    hugSpeed: 0.12,
    friction: 0.2,
    profile: 'K66',
  },
  cloth: { slideFriction: 0.18, rollFriction: 0.0125, spinFriction: 0.0075 },
  pockets: sixPockets(
    AP_L,
    AP_W,
    {
      mouthWidth: 0.1143,
      jawAngle: 142,
      jawRadius: 0.0127,
      shelfDepth: 0.0254,
      dropSag: 0.012,
      fallRadius: 0.055,
      dropFacingRestitution: 0.35,
      backRestitution: null,
    },
    {
      mouthWidth: 0.13,
      jawAngle: 104,
      jawRadius: 0.0127,
      shelfDepth: 0.003,
      dropSag: 0.008,
      fallRadius: 0.06,
      dropFacingRestitution: 0.35,
      backRestitution: null,
    },
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

// --- Carom ------------------------------------------------------------------------------------
// Match table (UMB): 2840 x 1420 mm playing area, 61.5 mm balls of 205–220 g, no pockets, heated
// slate and a fast cloth, with livelier, higher cushions than pool.

const CAROM_L = 2.84;
const CAROM_W = 1.42;

export const CAROM_10FT: TableSpec = {
  id: 'carom-10ft',
  name: 'Carom 10 ft',
  playfield: { length: CAROM_L, width: CAROM_W },
  trim: { cushionWidth: 0.05, railWidth: 0.11, cushionTopAboveNose: 0.006, railTopAboveNose: 0.012 },
  cushion: {
    noseHeight: 0.037,
    restitution: 0.9,
    restitutionSlope: 0.03,
    minRestitution: 0.7,
    hugSpeed: 0.12,
    friction: 0.22,
    profile: 'carom',
  },
  cloth: { slideFriction: 0.2, rollFriction: 0.0095, spinFriction: 0.006 },
  pockets: [],
  markings: [
    { type: 'spot', id: 'head', position: { x: -CAROM_L / 4, y: 0 } },
    { type: 'spot', id: 'centre', position: { x: 0, y: 0 } },
    { type: 'spot', id: 'foot', position: { x: CAROM_L / 4, y: 0 } },
    // The opening positions: the striker's ball 18.25 cm either side of the head spot.
    { type: 'spot', id: 'start-left', position: { x: -CAROM_L / 4, y: 0.1825 } },
    { type: 'spot', id: 'start-right', position: { x: -CAROM_L / 4, y: -0.1825 } },
  ],
  balls: {
    object: { radius: 0.03075, mass: 0.21 },
    cue: { radius: 0.03075, mass: 0.21 },
    restitution: 0.93,
    friction: STANDARD_BALL_FRICTION,
  },
};

/** Balkline: the carom table with lines `d` from each cushion, making nine areas. */
export function balklineTable(d: number, id: string): TableSpec {
  const hl = CAROM_L / 2;
  const hw = CAROM_W / 2;
  return {
    ...CAROM_10FT,
    id,
    name: `Balkline ${id}`,
    markings: [
      ...CAROM_10FT.markings,
      { type: 'line', id: 'balk-x1', a: { x: -hl + d, y: -hw }, b: { x: -hl + d, y: hw } },
      { type: 'line', id: 'balk-x2', a: { x: hl - d, y: -hw }, b: { x: hl - d, y: hw } },
      { type: 'line', id: 'balk-y1', a: { x: -hl, y: -hw + d }, b: { x: hl, y: -hw + d } },
      { type: 'line', id: 'balk-y2', a: { x: -hl, y: hw - d }, b: { x: hl, y: hw - d } },
    ],
  };
}

export const BALKLINE_47: TableSpec = balklineTable(0.47, 'balkline-47');
export const BALKLINE_71: TableSpec = balklineTable(0.71, 'balkline-71');

// --- Russian Pyramid -----------------------------------------------------------------------------
// 12 ft (3550 x 1775 mm playing area), 68 mm balls of about 280 g, and pockets only a few mm wider
// than the ball: corners about 73 mm, middles about 83 mm at the mouth.

const RP_L = 3.55;
const RP_W = 1.775;

export const PYRAMID_12FT: TableSpec = {
  id: 'pyramid-12ft',
  name: 'Russian Pyramid 12 ft',
  playfield: { length: RP_L, width: RP_W },
  trim: { cushionWidth: 0.055, railWidth: 0.11, cushionTopAboveNose: 0.008, railTopAboveNose: 0.014 },
  cushion: {
    noseHeight: 0.0435,
    restitution: 0.82,
    restitutionSlope: 0.04,
    minRestitution: 0.6,
    hugSpeed: 0.12,
    friction: 0.2,
    profile: 'snooker',
  },
  cloth: { slideFriction: 0.18, rollFriction: 0.0125, spinFriction: 0.0075 },
  pockets: sixPockets(
    RP_L,
    RP_W,
    {
      // 3 mm wider than the 73 mm of a match table, with parallel facings (playtest: too tight,
      // ±5 mm straight in). A ball that reaches the back of the pocket drops: pyramid pots are hit
      // hard, and a firm, accurate pot should stay down.
      mouthWidth: 0.076,
      jawAngle: 135,
      jawRadius: 0.012,
      shelfDepth: 0.02,
      dropSag: 0.01,
      fallRadius: 0.05,
      dropFacingRestitution: null,
      backRestitution: null,
    },
    {
      mouthWidth: 0.083,
      jawAngle: 95,
      jawRadius: 0.012,
      shelfDepth: 0.015,
      dropSag: 0.008,
      fallRadius: 0.055,
      dropFacingRestitution: null,
      backRestitution: null,
    },
  ),
  markings: [
    { type: 'line', id: 'head-string', a: { x: -RP_L / 4, y: -RP_W / 2 }, b: { x: -RP_L / 4, y: RP_W / 2 } },
    { type: 'spot', id: 'head', position: { x: -RP_L / 4, y: 0 } },
    { type: 'spot', id: 'centre', position: { x: 0, y: 0 } },
    { type: 'spot', id: 'foot', position: { x: RP_L / 4, y: 0 } },
  ],
  balls: {
    object: { radius: 0.034, mass: 0.28 },
    cue: { radius: 0.034, mass: 0.28 },
    restitution: 0.94,
    friction: STANDARD_BALL_FRICTION,
  },
};

// --- Chinese 8-ball (heyball) ---------------------------------------------------------------------
// A 9 ft table (2540 x 1270 mm) with 57.15 mm balls but tight, rounded pockets cut like a snooker
// table's: about 85 mm at the corners and 90 mm in the middle.

export const CHINESE_8BALL_9FT: TableSpec = {
  ...AMERICAN_POOL_9FT,
  id: 'chinese-8ball-9ft',
  name: 'Chinese 8-ball 9 ft',
  cushion: { ...AMERICAN_POOL_9FT.cushion, profile: 'snooker' },
  pockets: sixPockets(
    AP_L,
    AP_W,
    {
      mouthWidth: 0.085,
      jawAngle: 135,
      jawRadius: 0.016,
      shelfDepth: 0.02,
      dropSag: 0.01,
      fallRadius: 0.05,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
    {
      mouthWidth: 0.09,
      jawAngle: 95,
      jawRadius: 0.016,
      shelfDepth: 0.015,
      dropSag: 0.008,
      fallRadius: 0.055,
      dropFacingRestitution: null,
      backRestitution: 0.15,
    },
  ),
};

export const TABLE_PRESETS: readonly TableSpec[] = [
  SNOOKER_12FT,
  ENGLISH_POOL_7FT,
  AMERICAN_POOL_9FT,
  CAROM_10FT,
  PYRAMID_12FT,
  CHINESE_8BALL_9FT,
];
