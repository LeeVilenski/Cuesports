import { DEFAULT_CUE, detCos, detSin, type CueSpec } from '@cuesports/shared';
import { classify } from './motion';
import type { BallState, ShotInput } from './types';

export interface StrikeOutcome {
  miscue: boolean;
  /** Cue-ball launch speed (horizontal). */
  speed: number;
  /** Squirt (cue-ball deflection) angle in radians, positive = to the left of the aim. */
  squirt: number;
}

/**
 * Applies a cue strike to a ball (in place).
 *
 * The impulse acts along the cue axis at the tip contact point. Its size comes from an elastic
 * collision between the cue mass and the ball's effective mass at the contact point. Squirt uses
 * Alciatore's end-mass model, and an elevated cue gives the spin axis a tilt that produces swerve
 * and masse during the sliding phase.
 */
export function applyStrike(ball: BallState, shot: ShotInput, cue: CueSpec = DEFAULT_CUE): StrikeOutcome {
  const R = ball.radius;
  const m = ball.mass;
  let a = shot.tip.a;
  let b = shot.tip.b;
  const offset = Math.sqrt(a * a + b * b);
  let miscue = false;
  let speed = shot.speed;
  if (offset > cue.miscueLimit) {
    // The tip skids off: a weak hit with most of the intended spin lost.
    miscue = true;
    const k = (cue.miscueLimit * 0.5) / offset;
    a *= k;
    b *= k;
    speed *= 0.3;
  }

  const ch = detCos(shot.aim);
  const sh = detSin(shot.aim);
  const ce = detCos(shot.elevation);
  const se = detSin(shot.elevation);

  // Cue direction (forward and down), side axis (right of the cue) and up axis perpendicular to the cue.
  const d = { x: ce * ch, y: ce * sh, z: -se };
  const s = { x: sh, y: -ch, z: 0 };
  const e2 = { x: s.y * d.z - s.z * d.y, y: s.z * d.x - s.x * d.z, z: s.x * d.y - s.y * d.x };
  const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
  // Contact point relative to the ball centre.
  const p = {
    x: R * (a * s.x + b * e2.x - c * d.x),
    y: R * (a * s.y + b * e2.y - c * d.y),
    z: R * (a * s.z + b * e2.z - c * d.z),
  };

  const J = ((1 + cue.tipRestitution) * m * speed) / (1 + m / cue.mass + 2.5 * (a * a + b * b));
  const I = 0.4 * m * R * R;

  // Linear velocity: the vertical part is absorbed by the slate.
  let vx = (J * d.x) / m;
  let vy = (J * d.y) / m;

  // Squirt: deflect the launch direction away from the side of the tip offset.
  const aa = Math.min(Math.abs(a), 0.99);
  const tanSq = (2.5 * aa * Math.sqrt(1 - aa * aa)) / (1 + m / cue.endMass + 2.5 * (1 - aa * aa));
  const cosSq = 1 / Math.sqrt(1 + tanSq * tanSq);
  const sinSq = (a > 0 ? 1 : a < 0 ? -1 : 0) * tanSq * cosSq;
  const rx = vx * cosSq - vy * sinSq;
  const ry = vx * sinSq + vy * cosSq;
  vx = rx;
  vy = ry;

  const Fx = J * d.x;
  const Fy = J * d.y;
  const Fz = J * d.z;
  ball.vel = { x: vx, y: vy };
  ball.spin = {
    x: (p.y * Fz - p.z * Fy) / I,
    y: (p.z * Fx - p.x * Fz) / I,
    z: (p.x * Fy - p.y * Fx) / I,
  };
  ball.state = 'stationary';
  ball.state = classify(ball);
  return { miscue, speed: Math.sqrt(vx * vx + vy * vy), squirt: Math.asin(sinSq) };
}
