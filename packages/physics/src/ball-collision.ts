import { detExp, type BallSetSpec } from '@cuesports/shared';
import { classify } from './motion';
import type { BallState } from './types';

/**
 * Resolves a collision between two touching balls (in place) with an impulse model that includes
 * ball–ball friction. The friction gives cut-induced and spin-induced throw, following Alciatore's
 * throw model: the tangential impulse is μ·Jn, capped so the contact points never slip past each
 * other (the "gearing" limit). Returns the normal approach speed, or 0 if the balls were separating.
 */
export function collideBalls(b1: BallState, b2: BallState, spec: BallSetSpec): number {
  let nx = b2.pos.x - b1.pos.x;
  let ny = b2.pos.y - b1.pos.y;
  const dist = Math.sqrt(nx * nx + ny * ny);
  if (dist === 0) return 0;
  nx /= dist;
  ny /= dist;

  const R1 = b1.radius;
  const R2 = b2.radius;
  const m1 = b1.mass;
  const m2 = b2.mass;
  const I1 = 0.4 * m1 * R1 * R1;
  const I2 = 0.4 * m2 * R2 * R2;

  // Contact-point velocities: v + w × r, with r1 = R1·n and r2 = −R2·n (n horizontal).
  const c1x = b1.vel.x - b1.spin.z * R1 * ny;
  const c1y = b1.vel.y + b1.spin.z * R1 * nx;
  const c1z = R1 * (b1.spin.x * ny - b1.spin.y * nx);
  const c2x = b2.vel.x + b2.spin.z * R2 * ny;
  const c2y = b2.vel.y - b2.spin.z * R2 * nx;
  const c2z = -R2 * (b2.spin.x * ny - b2.spin.y * nx);

  const rx = c1x - c2x;
  const ry = c1y - c2y;
  const rz = c1z - c2z;
  const vn = rx * nx + ry * ny;
  if (vn <= 0) return 0;

  const Jn = ((1 + spec.restitution) * vn) / (1 / m1 + 1 / m2);

  // Tangential slip (3D, perpendicular to n).
  const tx = rx - vn * nx;
  const ty = ry - vn * ny;
  const tz = rz;
  const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
  let Jt = 0;
  if (ts > 1e-9) {
    const f = spec.friction;
    const mu = f.a + f.b * detExp(-f.c * ts);
    const kt = 1 / m1 + 1 / m2 + (R1 * R1) / I1 + (R2 * R2) / I2;
    Jt = Math.min(mu * Jn, ts / kt);
  }

  // Impulse on ball 1 (ball 2 gets the opposite).
  const Px = -Jn * nx - (ts > 1e-9 ? (Jt * tx) / ts : 0);
  const Py = -Jn * ny - (ts > 1e-9 ? (Jt * ty) / ts : 0);
  const Pz = ts > 1e-9 ? (-Jt * tz) / ts : 0;

  b1.vel.x += Px / m1;
  b1.vel.y += Py / m1;
  b2.vel.x -= Px / m2;
  b2.vel.y -= Py / m2;

  // Angular impulse r × P. r1 = (R1 nx, R1 ny, 0); r2 = (−R2 nx, −R2 ny, 0) with impulse −P.
  b1.spin.x += (R1 * ny * Pz) / I1;
  b1.spin.y += (-R1 * nx * Pz) / I1;
  b1.spin.z += (R1 * (nx * Py - ny * Px)) / I1;
  b2.spin.x += (R2 * ny * Pz) / I2;
  b2.spin.y += (-R2 * nx * Pz) / I2;
  b2.spin.z += (R2 * (nx * Py - ny * Px)) / I2;

  b1.state = classify({ ...b1, state: 'stationary' });
  b2.state = classify({ ...b2, state: 'stationary' });
  return vn;
}
