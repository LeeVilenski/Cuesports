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

  // Contact-point velocities: v + w × r, with r1 = R1·n and r2 = −R2·n (n horizontal).
  const c1x = b1.vel.x - b1.spin.z * R1 * ny;
  const c1y = b1.vel.y + b1.spin.z * R1 * nx;
  const c2x = b2.vel.x + b2.spin.z * R2 * ny;
  const c2y = b2.vel.y - b2.spin.z * R2 * nx;

  const rx = c1x - c2x;
  const ry = c1y - c2y;
  const vn = rx * nx + ry * ny;
  if (vn <= 0) return 0;

  const Jn = ((1 + spec.restitution) * vn) / (1 / m1 + 1 / m2);
  applyContactImpulse(b1, b2, nx, ny, Jn, spec);
  b1.state = classify({ ...b1, state: 'stationary' });
  b2.state = classify({ ...b2, state: 'stationary' });
  return vn;
}

/**
 * Applies a normal impulse Jn along n (from b1 to b2) plus the ball–ball friction impulse it
 * allows, from the contact-point slip at the moment of the call. With `normal` false only the
 * friction impulse is applied (the normal one is already in the velocities).
 */
function applyContactImpulse(
  b1: BallState,
  b2: BallState,
  nx: number,
  ny: number,
  Jn: number,
  spec: BallSetSpec,
  normal = true,
): void {
  const R1 = b1.radius;
  const R2 = b2.radius;
  const m1 = b1.mass;
  const m2 = b2.mass;
  const I1 = 0.4 * m1 * R1 * R1;
  const I2 = 0.4 * m2 * R2 * R2;

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
  const Jn0 = normal ? Jn : 0;
  const Px = -Jn0 * nx - (ts > 1e-9 ? (Jt * tx) / ts : 0);
  const Py = -Jn0 * ny - (ts > 1e-9 ? (Jt * ty) / ts : 0);
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
}

/** Balls closer than this (surface gap, m) to a colliding pair are treated as touching it. */
const CLUSTER_GAP = 0.001;
/** Effective Young's modulus E* of phenolic resin balls, Pa (E ≈ 5 GPa, ν ≈ 0.35). */
const E_STAR = 2.85e9;
const SUB_DT = 2e-6;
const MAX_CONTACT_TIME = 0.005;
/** The solve ends once no contact is pressed and none is due within this time. */
const LOOKAHEAD = 5e-5;

export interface ClusterContact {
  a: number;
  b: number;
  speed: number;
}

/**
 * Resolves a collision between balls i and j when either is touching (or all but touching)
 * another ball, as in a rack or a cluster. Separate hard-sphere impacts would send the impulse
 * down one chain of balls at a time (a full-ball break then only knocks the back corner balls
 * out and leaves the pack where it was). Instead the group's contacts are solved together as
 * compliant Hertzian contacts (F = k·δ^1.5, with Lankarani–Nikravesh damping for the
 * restitution), so the force spreads through every touching ball at once, as in a real rack.
 * Positions are left where they were (the contact lasts a fraction of a millisecond); velocities
 * take the result, and ball–ball friction is applied per contact from its normal impulse.
 *
 * Returns null when the pair is isolated (the caller resolves it as a single impact), else the
 * contacts that took place, the (i, j) one first.
 */
export function collideCluster(
  balls: BallState[],
  i: number,
  j: number,
  spec: BallSetSpec,
): ClusterContact[] | null {
  const n = balls.length;
  const live = (k: number): boolean => balls[k]!.state !== 'pocketed';
  const gap = (p: number, q: number): number => {
    const a = balls[p]!;
    const b = balls[q]!;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    return Math.sqrt(dx * dx + dy * dy) - a.radius - b.radius;
  };

  // Is anything touching the pair (directly or through other touching balls)?
  const touching = [i, j];
  const inTouch = new Uint8Array(n);
  inTouch[i] = 1;
  inTouch[j] = 1;
  for (let q = 0; q < touching.length; q++) {
    for (let k = 0; k < n; k++) {
      if (inTouch[k] || !live(k)) continue;
      if (gap(touching[q]!, k) < CLUSTER_GAP) {
        inTouch[k] = 1;
        touching.push(k);
      }
    }
  }
  if (touching.length <= 2) return null;

  // Everything the group's balls could reach during the contact takes part.
  let vmax = 0;
  for (const k of touching) {
    const v = balls[k]!.vel;
    vmax = Math.max(vmax, Math.sqrt(v.x * v.x + v.y * v.y));
  }
  const reach = CLUSTER_GAP + 2 * vmax * MAX_CONTACT_TIME;
  const group = [...touching];
  const inGroup = inTouch;
  for (let q = 0; q < group.length; q++) {
    for (let k = 0; k < n; k++) {
      if (inGroup[k] || !live(k)) continue;
      if (gap(group[q]!, k) < reach) {
        inGroup[k] = 1;
        group.push(k);
      }
    }
  }

  const m = group.length;
  const px = new Float64Array(m);
  const py = new Float64Array(m);
  const vx = new Float64Array(m);
  const vy = new Float64Array(m);
  const inv = new Float64Array(m);
  const rad = new Float64Array(m);
  group.forEach((k, g) => {
    const b = balls[k]!;
    px[g] = b.pos.x;
    py[g] = b.pos.y;
    vx[g] = b.vel.x;
    vy[g] = b.vel.y;
    inv[g] = 1 / b.mass;
    rad[g] = b.radius;
  });

  // Candidate pairs: those that could meet during the contact.
  const pa: number[] = [];
  const pb: number[] = [];
  for (let p = 0; p < m; p++) {
    for (let q = p + 1; q < m; q++) {
      if (gap(group[p]!, group[q]!) < reach) {
        pa.push(p);
        pb.push(q);
      }
    }
  }
  const np = pa.length;
  const stiff = new Float64Array(np);
  for (let c = 0; c < np; c++) {
    const r1 = rad[pa[c]!]!;
    const r2 = rad[pb[c]!]!;
    stiff[c] = (4 / 3) * E_STAR * Math.sqrt((r1 * r2) / (r1 + r2));
  }
  const v0 = new Float64Array(np); // approach speed at first touch (0 = not yet touched)
  const order: number[] = [];
  const jn = new Float64Array(np);
  const nxs = new Float64Array(np);
  const nys = new Float64Array(np);
  const damp = 0.75 * (1 - spec.restitution * spec.restitution);
  const fx = new Float64Array(m);
  const fy = new Float64Array(m);
  // Offsets from the starting positions (kept small and separate for precision).
  const dx = new Float64Array(m);
  const dy = new Float64Array(m);

  for (let t = 0; t < MAX_CONTACT_TIME; t += SUB_DT) {
    fx.fill(0);
    fy.fill(0);
    let pressed = false;
    let due = false;
    for (let c = 0; c < np; c++) {
      const p = pa[c]!;
      const q = pb[c]!;
      const rx = px[q]! + dx[q]! - px[p]! - dx[p]!;
      const ry = py[q]! + dy[q]! - py[p]! - dy[p]!;
      const d = Math.sqrt(rx * rx + ry * ry);
      const ux = rx / d;
      const uy = ry / d;
      const approach = (vx[p]! - vx[q]!) * ux + (vy[p]! - vy[q]!) * uy;
      const delta = rad[p]! + rad[q]! - d;
      if (delta <= 0) {
        if (approach > 0 && -delta < approach * LOOKAHEAD) due = true;
        continue;
      }
      pressed = true;
      if (v0[c] === 0) {
        v0[c] = Math.max(approach, 1e-4);
        order.push(c);
      }
      const f = Math.max(0, stiff[c]! * delta * Math.sqrt(delta) * (1 + (damp * approach) / v0[c]!));
      fx[p] = fx[p]! - f * ux;
      fy[p] = fy[p]! - f * uy;
      fx[q] = fx[q]! + f * ux;
      fy[q] = fy[q]! + f * uy;
      jn[c] = jn[c]! + f * SUB_DT;
      nxs[c] = nxs[c]! + f * ux;
      nys[c] = nys[c]! + f * uy;
    }
    if (!pressed && !due) break;
    for (let g = 0; g < m; g++) {
      vx[g] = vx[g]! + fx[g]! * inv[g]! * SUB_DT;
      vy[g] = vy[g]! + fy[g]! * inv[g]! * SUB_DT;
      dx[g] = dx[g]! + vx[g]! * SUB_DT;
      dy[g] = dy[g]! + vy[g]! * SUB_DT;
    }
  }

  // The normal impulses become velocity changes; friction follows contact by contact.
  group.forEach((k, g) => {
    const b = balls[k]!;
    b.vel.x = vx[g]!;
    b.vel.y = vy[g]!;
  });
  for (const c of order) {
    const l = Math.sqrt(nxs[c]! * nxs[c]! + nys[c]! * nys[c]!);
    if (l === 0) continue;
    const ux = nxs[c]! / l;
    const uy = nys[c]! / l;
    const b1 = balls[group[pa[c]!]!]!;
    const b2 = balls[group[pb[c]!]!]!;
    // The normal part is already in the velocities: only the friction it allows is added.
    applyContactImpulse(b1, b2, ux, uy, jn[c]!, spec, false);
  }
  for (const k of group) {
    const b = balls[k]!;
    b.state = classify({ ...b, state: 'stationary' });
  }

  const out: ClusterContact[] = order.map((c) => ({ a: group[pa[c]!]!, b: group[pb[c]!]!, speed: v0[c]! }));
  // The pair that triggered the solve is reported first.
  const first = out.findIndex((x) => (x.a === i && x.b === j) || (x.a === j && x.b === i));
  if (first > 0) out.unshift(...out.splice(first, 1));
  return out;
}
