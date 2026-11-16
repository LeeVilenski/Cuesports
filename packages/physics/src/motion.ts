import { quatIntegrate, type ClothSpec } from '@cuesports/shared';
import type { BallState, MotionState } from './types';

/** Speeds below this are treated as zero. */
export const EPS_V = 1e-6;
export const EPS_W = 1e-5;

/** Velocity of the ball's contact point with the cloth (the slip velocity). */
export function slip(b: BallState): { x: number; y: number } {
  return { x: b.vel.x - b.radius * b.spin.y, y: b.vel.y + b.radius * b.spin.x };
}

/** Classifies a ball's motion state from its velocities. */
export function classify(b: BallState): MotionState {
  if (b.state === 'pocketed') return 'pocketed';
  const u = slip(b);
  if (Math.sqrt(u.x * u.x + u.y * u.y) > EPS_V) return 'sliding';
  if (Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y) > EPS_V) return 'rolling';
  if (Math.abs(b.spin.z) > EPS_W) return 'spinning';
  return 'stationary';
}

export type TransitionSink = (b: BallState, from: MotionState, to: MotionState, dt: number) => void;

function setState(b: BallState, to: MotionState, elapsed: number, sink: TransitionSink | undefined): void {
  if (b.state !== to) {
    const from = b.state;
    b.state = to;
    sink?.(b, from, to, elapsed);
  }
}

function decaySpinZ(b: BallState, alpha: number, tau: number): void {
  const wz = b.spin.z;
  const d = alpha * tau;
  b.spin.z = wz > d ? wz - d : wz < -d ? wz + d : 0;
}

/**
 * Advances one ball by h seconds with the closed-form equations of motion for each state,
 * splitting the interval at state transitions (sliding → rolling → spinning → stationary).
 */
export function advanceBall(
  b: BallState,
  h: number,
  cloth: ClothSpec,
  g: number,
  sink?: TransitionSink,
): void {
  const R = b.radius;
  const spinAlpha = (5 * cloth.spinFriction * g) / (2 * R);
  let elapsed = 0;
  let guard = 0;
  while (h > 0 && guard++ < 8) {
    switch (b.state) {
      case 'pocketed':
      case 'stationary':
        return;

      case 'sliding': {
        const u = slip(b);
        const us = Math.sqrt(u.x * u.x + u.y * u.y);
        if (us <= EPS_V) {
          setState(b, classify(b), elapsed, sink);
          continue;
        }
        const a = cloth.slideFriction * g;
        const tEnd = (2 * us) / (7 * a);
        const tau = Math.min(h, tEnd);
        const ux = u.x / us;
        const uy = u.y / us;
        const w0 = { x: b.spin.x, y: b.spin.y, z: b.spin.z };
        b.pos.x += b.vel.x * tau - 0.5 * a * ux * tau * tau;
        b.pos.y += b.vel.y * tau - 0.5 * a * uy * tau * tau;
        b.vel.x -= a * ux * tau;
        b.vel.y -= a * uy * tau;
        const k = (5 * a) / (2 * R);
        b.spin.x -= k * uy * tau;
        b.spin.y += k * ux * tau;
        decaySpinZ(b, spinAlpha, tau);
        b.orient = quatIntegrate(
          b.orient,
          { x: (w0.x + b.spin.x) / 2, y: (w0.y + b.spin.y) / 2, z: (w0.z + b.spin.z) / 2 },
          tau,
        );
        h -= tau;
        elapsed += tau;
        if (tau === tEnd) {
          // Natural roll reached: make the spin exactly consistent with the velocity.
          b.spin.x = -b.vel.y / R;
          b.spin.y = b.vel.x / R;
          setState(b, classify(b), elapsed, sink);
        }
        break;
      }

      case 'rolling': {
        const s = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
        if (s <= EPS_V) {
          b.vel.x = 0;
          b.vel.y = 0;
          b.spin.x = 0;
          b.spin.y = 0;
          setState(b, classify(b), elapsed, sink);
          continue;
        }
        const dec = cloth.rollFriction * g;
        const tEnd = s / dec;
        const tau = Math.min(h, tEnd);
        const dx = b.vel.x / s;
        const dy = b.vel.y / s;
        const dist = s * tau - 0.5 * dec * tau * tau;
        const s1 = tau === tEnd ? 0 : s - dec * tau;
        const wz0 = b.spin.z;
        const sm = (s + s1) / 2;
        b.pos.x += dx * dist;
        b.pos.y += dy * dist;
        b.vel.x = dx * s1;
        b.vel.y = dy * s1;
        b.spin.x = -b.vel.y / R;
        b.spin.y = b.vel.x / R;
        decaySpinZ(b, spinAlpha, tau);
        b.orient = quatIntegrate(
          b.orient,
          { x: (-dy * sm) / R, y: (dx * sm) / R, z: (wz0 + b.spin.z) / 2 },
          tau,
        );
        h -= tau;
        elapsed += tau;
        if (tau === tEnd) setState(b, classify(b), elapsed, sink);
        break;
      }

      case 'spinning': {
        const wz = b.spin.z;
        const tEnd = Math.abs(wz) / spinAlpha;
        const tau = Math.min(h, tEnd);
        decaySpinZ(b, spinAlpha, tau);
        if (tau === tEnd) b.spin.z = 0;
        b.orient = quatIntegrate(b.orient, { x: 0, y: 0, z: (wz + b.spin.z) / 2 }, tau);
        h -= tau;
        elapsed += tau;
        if (tau === tEnd) setState(b, classify(b), elapsed, sink);
        break;
      }
    }
  }
}
