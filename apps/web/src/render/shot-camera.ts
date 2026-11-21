import type { ShotResult } from '@cuesports/physics';
import type { TableSpec } from '@cuesports/shared';
import type { P2, P3 } from './ik';

/**
 * What the aim camera does while a shot plays:
 * - overview: rises up and back to see the whole table;
 * - follow: chases the cue ball, then the first ball it hits;
 * - cinematic: follows, and cuts to a low camera behind the pocket for each pot;
 * - stay: stays where it was while aiming.
 */
export type ShotCameraMode = 'overview' | 'follow' | 'cinematic' | 'stay';

export interface ShotView {
  eye: P3;
  look: P3;
  /** Cut straight to this view instead of easing. */
  cut: boolean;
}

/** A ball's position at time t, interpolated from the recorded frames (null once potted). */
export function ballAt(result: ShotResult, id: string, t: number): P2 | null {
  const i = result.ids.indexOf(id);
  const fr = result.frames;
  if (i < 0 || fr.length === 0) return null;
  let lo = 0;
  let hi = fr.length - 1;
  if (t <= fr[0]!.t) hi = 0;
  else if (t >= fr[hi]!.t) lo = hi;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fr[mid]!.t <= t) lo = mid;
      else hi = mid;
    }
  const a = fr[lo]!;
  const b = fr[hi]!;
  if (a.pocketed[i] === 1) return null;
  const k = hi === lo ? 0 : (t - a.t) / (b.t - a.t);
  return {
    x: a.pos[2 * i]! + (b.pos[2 * i]! - a.pos[2 * i]!) * k,
    y: a.pos[2 * i + 1]! + (b.pos[2 * i + 1]! - a.pos[2 * i + 1]!) * k,
  };
}

/** The pots worth cutting to: object balls (not the cue ball), in order. */
export function potCuts(result: ShotResult): { ball: string; pocket: string; t: number }[] {
  const cue = struck(result);
  return result.events.flatMap((e) =>
    e.type === 'pocket' && e.ball !== cue ? [{ ball: e.ball, pocket: e.pocket, t: e.t }] : [],
  );
}

/** The ball the cue struck ('cue' unless billiards' yellow). */
export function struck(result: ShotResult): string {
  const s = result.events.find((e) => e.type === 'strike');
  return s && s.type === 'strike' ? s.ball : 'cue';
}

/** Seconds before a pot that the cinematic camera cuts to the pocket, and how long it stays after. */
export const CUT_BEFORE = 1.1;
export const CUT_AFTER = 0.9;

/** Plans and tracks the camera for one shot. */
export class ShotCamera {
  private dir: P2 = { x: 1, y: 0 };
  private subject = 'cue';
  private cue = 'cue';
  private lastCut = -1;
  private readonly cuts: { ball: string; pocket: string; t: number }[];
  private readonly firstHit: { t: number; ball: string } | null;

  constructor(
    private readonly result: ShotResult,
    private readonly table: TableSpec,
    private readonly mode: ShotCameraMode,
    aim: number,
  ) {
    this.dir = { x: Math.cos(aim), y: Math.sin(aim) };
    this.cuts = mode === 'cinematic' ? potCuts(result) : [];
    const cue = (this.cue = struck(result));
    this.subject = cue;
    const hit = result.events.find((e) => e.type === 'ball' && (e.a === cue || e.b === cue));
    this.firstHit = hit && hit.type === 'ball' ? { t: hit.t, ball: hit.a === cue ? hit.b : hit.a } : null;
  }

  /** The view at time t, or null to leave the camera as it is (overview and stay). */
  view(t: number): ShotView | null {
    if (this.mode === 'overview' || this.mode === 'stay') return null;
    const R = this.table.balls.object.radius;
    // Pocket cut.
    // Never before the cue ball has made contact: the strike itself is worth seeing.
    const earliest = (this.firstHit?.t ?? 0) + 0.15;
    const cutIdx = this.cuts.findIndex(
      (c) => t >= Math.max(c.t - CUT_BEFORE, Math.min(earliest, c.t - 0.3)) && t <= c.t + CUT_AFTER,
    );
    if (cutIdx >= 0) {
      const c = this.cuts[cutIdx]!;
      const pocket = this.table.pockets.find((p) => p.id === c.pocket);
      if (pocket) {
        const out = Math.hypot(pocket.position.x, pocket.position.y) || 1;
        const ox = pocket.position.x / out;
        const oy = pocket.position.y / out;
        // Low, just outside the pocket, looking back up the table at the ball coming in.
        const eye = { x: pocket.position.x + ox * 0.32, y: pocket.position.y + oy * 0.32, z: 0.16 };
        const ball = ballAt(this.result, c.ball, Math.min(t, c.t - 0.02)) ?? pocket.position;
        const look = {
          x: ball.x * 0.7 + pocket.position.x * 0.3,
          y: ball.y * 0.7 + pocket.position.y * 0.3,
          z: R,
        };
        const cut = this.lastCut !== cutIdx;
        this.lastCut = cutIdx;
        return { eye, look, cut };
      }
    }
    const wasCut = this.lastCut >= 0;
    this.lastCut = -1;
    // Follow: the cue ball, then the first ball it hits.
    if (this.firstHit && t > this.firstHit.t + 0.12) this.subject = this.firstHit.ball;
    let at = ballAt(this.result, this.subject, t);
    if (!at) at = ballAt(this.result, this.cue, t);
    if (!at) return null;
    const ahead = ballAt(this.result, this.subject, t + 0.12);
    if (ahead) {
      const dx = ahead.x - at.x;
      const dy = ahead.y - at.y;
      const l = Math.hypot(dx, dy);
      // Turn slowly with the ball, and only while it is really moving.
      if (l > 0.01) {
        const k = Math.min(1, l * 2);
        const nx = this.dir.x * (1 - k) + (dx / l) * k;
        const ny = this.dir.y * (1 - k) + (dy / l) * k;
        const n = Math.hypot(nx, ny) || 1;
        this.dir = { x: nx / n, y: ny / n };
      }
    }
    const eye = { x: at.x - this.dir.x * 0.9, y: at.y - this.dir.y * 0.9, z: 0.75 };
    const look = { x: at.x + this.dir.x * 0.35, y: at.y + this.dir.y * 0.35, z: R };
    return { eye, look, cut: wasCut };
  }
}
