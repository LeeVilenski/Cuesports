import type { CushionSpec } from '@cuesports/shared';
import { classify } from './motion';
import type { BallState } from './types';

/**
 * Ball–cushion collision using the model of Mathavan, Jackson & Parkin (2010), "A theoretical
 * analysis of billiard ball dynamics under cushion impacts".
 *
 * The cushion touches the ball at a point I above the centre (at the nose height), while the ball
 * also slides on the slate at C. The impulse is integrated numerically in small normal-impulse
 * increments, with friction at both contacts following the slip directions. Compression ends when
 * the normal velocity reaches zero; restitution continues until the work done equals e² times the
 * compression work.
 *
 * `normal` is the unit vector from the cushion contact towards the ball centre (horizontal).
 * Returns the normal impact speed, or 0 if the ball was moving away.
 */
export function collideCushion(
  b: BallState,
  normal: { x: number; y: number },
  cushion: CushionSpec,
  tableFriction: number,
  steps = 400,
): number {
  // Local frame: y′ points into the cushion, x′ along it, z up (right-handed).
  const yx = -normal.x;
  const yy = -normal.y;
  const xx = yy;
  const xy = -yx;

  let vx = b.vel.x * xx + b.vel.y * xy;
  let vy = b.vel.x * yx + b.vel.y * yy;
  let wx = b.spin.x * xx + b.spin.y * xy;
  let wy = b.spin.x * yx + b.spin.y * yy;
  let wz = b.spin.z;
  if (vy <= 0) return 0;
  const vn0 = vy;

  const R = b.radius;
  const M = b.mass;
  const I = 0.4 * M * R * R;
  const sinT = Math.max(0, Math.min(0.9, cushion.noseHeight / R - 1));
  const cosT = Math.sqrt(1 - sinT * sinT);
  const muW = cushion.friction;
  const muS = tableFriction;
  const eHigh = Math.min(
    cushion.restitution,
    Math.max(cushion.minRestitution, cushion.restitution - cushion.restitutionSlope * vn0),
  );
  // Rail hugging: a ball that only grazes the cushion barely bounces off it (the rubber soaks up
  // the tiny normal impact), so it runs along the rail instead of drifting away from it.
  const hug = cushion.hugSpeed;
  const e = hug > 0 ? (eHigh * vn0) / Math.sqrt(vn0 * vn0 + hug * hug) : eHigh;

  // Contact offsets from the centre: I on the cushion, C on the slate.
  const rIy = R * cosT;
  const rIz = R * sinT;
  const rCz = -R;
  const dP = (M * vn0 * (1 + e)) / steps;

  const step = (): void => {
    // Slip at the cushion contact, in the tangent basis (x′, t2) where t2 = (0, −sinθ, cosθ).
    const sx = vx + wy * rIz - wz * rIy;
    const st = -vy * sinT + wx * R;
    const sm = Math.sqrt(sx * sx + st * st);
    const fx = sm > 1e-12 ? sx / sm : 0;
    const ft = sm > 1e-12 ? st / sm : 0;
    // Force at I: normal −(0, cosθ, sinθ) plus friction −μw(fx, −ft·sinθ, ft·cosθ).
    const FIx = -muW * fx * dP;
    const FIy = (-cosT + muW * ft * sinT) * dP;
    const FIz = (-sinT - muW * ft * cosT) * dP;
    // The vertical push into the slate adds to the slate's normal impulse, giving slate friction.
    const nC = -FIz;
    const cx = vx - wy * R;
    const cy = vy + wx * R;
    const cm = Math.sqrt(cx * cx + cy * cy);
    const FCx = cm > 1e-12 ? (-muS * nC * cx) / cm : 0;
    const FCy = cm > 1e-12 ? (-muS * nC * cy) / cm : 0;

    vx += (FIx + FCx) / M;
    vy += (FIy + FCy) / M;
    // Torques r × F for I = (0, rIy, rIz) and C = (0, 0, rCz).
    wx += (rIy * FIz - rIz * FIy + -rCz * FCy) / I;
    wy += (rIz * FIx + rCz * FCx) / I;
    wz += (-rIy * FIx) / I;
  };

  let work = 0;
  let guard = 0;
  while (vy > 0 && guard++ < steps * 4) {
    work += vy * cosT * dP;
    step();
  }
  const target = e * e * work;
  let rwork = 0;
  guard = 0;
  while (rwork < target && guard++ < steps * 4) {
    rwork += Math.abs(vy) * cosT * dP;
    step();
  }

  b.vel = { x: vx * xx + vy * yx, y: vx * xy + vy * yy };
  b.spin = { x: wx * xx + wy * yx, y: wx * xy + wy * yy, z: wz };
  b.state = classify({ ...b, state: 'stationary' });
  return vn0;
}
