import type { Vec2 } from './math';

/** All lengths in metres, masses in kg, speeds in m/s, angles in degrees unless stated. */

export interface BallSpec {
  radius: number;
  mass: number;
}

export interface BallFrictionSpec {
  /** Ball–ball friction μ(v) = a + b·e^(−c·v), v = relative sliding speed (Alciatore's fit). */
  a: number;
  b: number;
  c: number;
}

export interface BallSetSpec {
  object: BallSpec;
  cue: BallSpec;
  /** Ball–ball coefficient of restitution. */
  restitution: number;
  friction: BallFrictionSpec;
}

export interface ClothSpec {
  /** Sliding friction μs between ball and cloth. */
  slideFriction: number;
  /** Rolling resistance μr. */
  rollFriction: number;
  /** Spin (about the vertical axis) friction μsp. */
  spinFriction: number;
}

export interface CushionSpec {
  /** Height of the cushion nose (contact point) above the slate. */
  noseHeight: number;
  /** Restitution at low impact speed. */
  restitution: number;
  /** Restitution loss per m/s of normal impact speed. */
  restitutionSlope: number;
  /** Lower bound for restitution at high speed. */
  minRestitution: number;
  /**
   * Below roughly this normal impact speed (m/s) the rebound fades out, so a ball grazing the
   * cushion hugs it. 0 disables it.
   */
  hugSpeed: number;
  /** Ball–cushion friction μw. */
  friction: number;
  profile: 'K66' | 'L-shape' | 'snooker' | 'carom';
}

export interface PocketSpec {
  id: string;
  kind: 'corner' | 'side';
  /** Centre of the fall circle. A ball whose centre enters the circle drops. */
  position: Vec2;
  /** Unit vector from the mouth into the pocket. */
  axis: Vec2;
  /** Distance between the jaw tips (where the cushion noses would meet). */
  mouthWidth: number;
  /** Facing angle between the cushion nose line and the jaw facing (142° typical pool corner). */
  jawAngle: number;
  /** Radius of the rounded knuckle where the cushion nose turns into the jaw facing. */
  jawRadius: number;
  /** Distance from the mouth line to the edge of the drop. */
  shelfDepth: number;
  /**
   * The slate's drop edge is a curve, not a straight line: it is `shelfDepth` behind the mouth on
   * the pocket's centre line and curves this much deeper where it meets each jaw facing.
   */
  dropSag: number;
  fallRadius: number;
  /**
   * Restitution of the jaw facings for a ball already over the drop. American pocket facings are
   * undercut, so a dropping ball meets them below the nose and dies (about 0.35). Snooker and English
   * pockets have rounded, lively jaws that throw balls back out: null keeps normal cushion behaviour.
   */
  dropFacingRestitution: number | null;
  /**
   * The back of the pocket. null: a ball that reaches it is already over the hole and drops (deep
   * American drop pockets). A number: the ball bounces off it with this restitution and only drops if
   * it stays over the hole long enough, so a firm ball can rattle back out (snooker, English pool).
   */
  backRestitution: number | null;
}

export type MarkingSpec =
  | { type: 'line'; id: string; a: Vec2; b: Vec2 }
  | { type: 'arc'; id: string; centre: Vec2; radius: number; startDeg: number; endDeg: number }
  | { type: 'spot'; id: string; position: Vec2 };

export interface TableSpec {
  id: string;
  name: string;
  /** Playfield measured between cushion noses. The table centre is the origin, x along the length. */
  playfield: { length: number; width: number };
  cushion: CushionSpec;
  cloth: ClothSpec;
  pockets: PocketSpec[];
  markings: MarkingSpec[];
  balls: BallSetSpec;
}

export interface CueSpec {
  mass: number;
  /** Effective end mass of the shaft, which sets the amount of squirt. */
  endMass: number;
  /** Tip–ball restitution. */
  tipRestitution: number;
  /** Tip offsets beyond this fraction of the ball radius miscue. */
  miscueLimit: number;
}

export const DEFAULT_CUE: CueSpec = {
  mass: 0.54,
  // A low-deflection shaft: about 1.5° of squirt at half-ball side (a standard shaft, ~8 g, gives
  // about 2.5°). Even a little side squirts the cue ball enough to matter over a metre.
  endMass: 0.0045,
  tipRestitution: 0.75,
  miscueLimit: 0.55,
};
