import type { CueSpec, Quat, Vec2, Vec3 } from '@cuesports/shared';

export type MotionState = 'stationary' | 'spinning' | 'rolling' | 'sliding' | 'pocketed';

export interface BallState {
  id: string;
  radius: number;
  mass: number;
  /** Centre position on the table plane (the centre is at height = radius). */
  pos: Vec2;
  vel: Vec2;
  /** Angular velocity in rad/s (world frame, z up). */
  spin: Vec3;
  /** Orientation, used for rendering numbers and spots. */
  orient: Quat;
  state: MotionState;
  /** Set when state is 'pocketed'. */
  pocket?: string;
}

export interface ShotInput {
  /** Id of the ball struck by the cue. */
  ball: string;
  /** Horizontal aim direction in radians (0 = +x). */
  aim: number;
  /** Cue elevation in radians (0 = level). */
  elevation: number;
  /** Cue tip offset from the ball centre as fractions of the radius: a = right(+)/left(−), b = top(+)/bottom(−). */
  tip: { a: number; b: number };
  /** Cue speed at impact in m/s. */
  speed: number;
}

export type PhysicsEvent =
  | { type: 'strike'; t: number; ball: string; speed: number; miscue: boolean }
  | { type: 'ball'; t: number; a: string; b: string; speed: number }
  | {
      type: 'cushion';
      t: number;
      ball: string;
      segment: string;
      kind: 'rail' | 'jaw' | 'pocket';
      pocket?: string;
      speed: number;
    }
  | { type: 'pocket'; t: number; ball: string; pocket: string }
  | { type: 'off-table'; t: number; ball: string }
  | { type: 'state'; t: number; ball: string; from: MotionState; to: MotionState };

export interface Frame {
  t: number;
  /** x, y for each ball in the order of ShotResult.ids. */
  pos: Float64Array;
  /** x, y, z, w for each ball. */
  orient: Float64Array;
  /** 1 if the ball is pocketed (or off the table). */
  pocketed: Uint8Array;
  /** How far each ball has sunk below the slate (metres, ≤ 0) while it is over a pocket's drop. */
  drop: Float64Array;
}

export interface ShotResult {
  ids: string[];
  events: PhysicsEvent[];
  frames: Frame[];
  final: BallState[];
  duration: number;
  /** True if the simulation hit maxTime before all balls stopped. */
  truncated: boolean;
}

export interface SimOptions {
  /** Base time step in seconds. */
  dt?: number;
  /** Stop after this much simulated time. */
  maxTime?: number;
  /** Trajectory sample rate in Hz (0 = no frames). */
  sampleRate?: number;
  cue?: CueSpec;
  gravity?: number;
}
