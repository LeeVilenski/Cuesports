import { DEFAULT_CUE, type PocketSpec, type TableSpec, type Vec2 } from '@cuesports/shared';
import { collideBalls } from './ball-collision';
import { collideCushion } from './cushion';
import { tableGeometry, type Segment } from './geometry';
import { advanceBall } from './motion';
import { applyStrike } from './strike';
import type { BallState, Frame, PhysicsEvent, ShotInput, ShotResult, SimOptions } from './types';

/** Collisions resolved within one base step before the step is forced to finish. */
const MAX_CONTACTS_PER_STEP = 1000;
const TOUCH_TOL = 1e-9;
/** A ball drops once its centre has been over the hole long enough to fall this far (× radius). */
const DROP_DEPTH = 0.7;
/**
 * Restitution of a jaw facing hit by a ball whose centre is already over the hole. The ball has
 * started to drop, so it meets the undercut facing (the 12–15° vertical pocket angle) below the
 * nose, which deadens the hit and pushes the ball down instead of back out.
 */
const FALLING_JAW_RESTITUTION = 0.35;

type Contact =
  { kind: 'ball'; t: number; i: number; j: number } | { kind: 'cushion'; t: number; i: number; seg: Segment };

export function cloneBall(b: BallState): BallState {
  const c: BallState = {
    id: b.id,
    radius: b.radius,
    mass: b.mass,
    pos: { ...b.pos },
    vel: { ...b.vel },
    spin: { ...b.spin },
    orient: { ...b.orient },
    state: b.state,
  };
  if (b.pocket !== undefined) c.pocket = b.pocket;
  return c;
}

const isMoving = (b: BallState): boolean => b.state === 'sliding' || b.state === 'rolling';
const isActive = (b: BallState): boolean => b.state !== 'stationary' && b.state !== 'pocketed';

/** Earliest t in [0, h] at which two circles (linear motion) touch while approaching, or −1. */
function circleToi(px: number, py: number, vx: number, vy: number, D: number, h: number): number {
  const b = px * vx + py * vy;
  if (b >= 0) return -1; // separating or parallel
  const c = px * px + py * py - D * D;
  if (c <= TOUCH_TOL * D) return 0;
  const a = vx * vx + vy * vy;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= h ? Math.max(0, t) : -1;
}

/** Earliest t in [0, h] at which a moving circle touches a segment (as a capsule), or −1. */
function segmentToi(p: Vec2, v: Vec2, R: number, s: Segment, h: number): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const L = Math.sqrt(ex * ex + ey * ey);
  let nx = -ey / L;
  let ny = ex / L;
  let d0 = (p.x - s.a.x) * nx + (p.y - s.a.y) * ny;
  if (d0 < 0) {
    nx = -nx;
    ny = -ny;
    d0 = -d0;
  }
  const vn = v.x * nx + v.y * ny;
  let best = -1;
  if (vn < 0) {
    const t = d0 <= R ? 0 : (d0 - R) / -vn;
    if (t <= h) {
      const sx = ((p.x + v.x * t - s.a.x) * ex + (p.y + v.y * t - s.a.y) * ey) / (L * L);
      if (sx >= 0 && sx <= 1) best = t;
    }
  }
  if (best === 0) return 0;
  for (const q of [s.a, s.b]) {
    const t = circleToi(p.x - q.x, p.y - q.y, v.x, v.y, R, h);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

function closestPoint(p: Vec2, s: Segment): Vec2 {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  let u = ((p.x - s.a.x) * ex + (p.y - s.a.y) * ey) / (ex * ex + ey * ey);
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return { x: s.a.x + ex * u, y: s.a.y + ey * u };
}

/**
 * Simulates a shot until every ball is at rest (or maxTime). Deterministic: the same inputs give
 * bit-identical output.
 *
 * Integration uses a fixed base step (1 ms by default). Within each step, balls follow the
 * closed-form motion for their state, and the step is split at the earliest contact (found by
 * a swept test), so fast balls can never tunnel through each other or a cushion.
 */
export function simulate(
  table: TableSpec,
  balls: readonly BallState[],
  shot: ShotInput | null,
  opts: SimOptions = {},
): ShotResult {
  const g = opts.gravity ?? 9.81;
  const dt = opts.dt ?? 0.001;
  const maxTime = opts.maxTime ?? 120;
  const sampleRate = opts.sampleRate ?? 60;
  const cue = opts.cue ?? DEFAULT_CUE;
  const geo = tableGeometry(table);
  const cloth = table.cloth;
  const state = balls.map(cloneBall);
  const ids = state.map((b) => b.id);
  // Time at which each ball's centre moved over a pocket's drop (NaN = supported by the slate).
  const overHole = new Float64Array(state.length).fill(NaN);
  const events: PhysicsEvent[] = [];
  const frames: Frame[] = [];
  let t = 0;

  if (shot) {
    const b = state.find((x) => x.id === shot.ball);
    if (!b) throw new Error(`No ball with id ${shot.ball}`);
    if (b.state === 'pocketed') throw new Error(`Ball ${shot.ball} is not on the table`);
    const out = applyStrike(b, shot, cue);
    events.push({ type: 'strike', t: 0, ball: b.id, speed: out.speed, miscue: out.miscue });
  }

  // Drawn sink depth per ball. A ball that rattles back out of a pocket rises back onto the slate
  // over a few frames instead of popping up.
  const sunk = new Float64Array(state.length);
  let lastRecord = 0;
  const record = (): void => {
    const n = state.length;
    const since = t - lastRecord;
    lastRecord = t;
    const f: Frame = {
      t,
      pos: new Float64Array(2 * n),
      orient: new Float64Array(4 * n),
      pocketed: new Uint8Array(n),
      drop: new Float64Array(n),
    };
    state.forEach((b, i) => {
      f.pos[2 * i] = b.pos.x;
      f.pos[2 * i + 1] = b.pos.y;
      f.orient[4 * i] = b.orient.x;
      f.orient[4 * i + 1] = b.orient.y;
      f.orient[4 * i + 2] = b.orient.z;
      f.orient[4 * i + 3] = b.orient.w;
      f.pocketed[i] = b.state === 'pocketed' ? 1 : 0;
      // A ball over the drop falls freely (it is no longer supported by the slate).
      const t0 = overHole[i]!;
      if (b.state === 'pocketed') sunk[i] = 0;
      else if (!Number.isNaN(t0)) sunk[i] = -0.5 * g * (t - t0) * (t - t0);
      else sunk[i] = sunk[i]! * Math.max(0, 1 - since * 25);
      f.drop[i] = sunk[i]!;
    });
    frames.push(f);
  };

  const interval = sampleRate > 0 ? 1 / sampleRate : Infinity;
  let sampleIndex = 0;
  let nextSample = 0;
  if (sampleRate > 0) {
    record();
    sampleIndex = 1;
    nextSample = interval;
  }

  let tNow = 0;
  const sink = (b: BallState, from: BallState['state'], to: BallState['state'], el: number): void => {
    events.push({ type: 'state', t: tNow + el, ball: b.id, from, to });
  };
  const advanceRaw = (h: number): void => {
    tNow = t;
    for (const b of state) if (isActive(b)) advanceBall(b, h, cloth, g, sink);
    t += h;
  };
  const advanceAll = (h: number): void => {
    while (h > 0) {
      if (nextSample <= t + h) {
        const h1 = Math.max(0, nextSample - t);
        advanceRaw(h1);
        t = nextSample;
        record();
        sampleIndex++;
        nextSample = sampleIndex * interval;
        h -= h1;
      } else {
        advanceRaw(h);
        h = 0;
      }
    }
  };

  const fallingJaw = {
    ...table.cushion,
    restitution: FALLING_JAW_RESTITUTION,
    minRestitution: FALLING_JAW_RESTITUTION,
    restitutionSlope: 0,
  };
  const hl = geo.halfLength;
  const hw = geo.halfWidth;

  const earliestContact = (h: number): Contact | null => {
    let best: Contact | null = null;
    const n = state.length;
    for (let i = 0; i < n; i++) {
      const a = state[i]!;
      if (a.state === 'pocketed') continue;
      const aMoving = isMoving(a);
      for (let j = i + 1; j < n; j++) {
        const b = state[j]!;
        if (b.state === 'pocketed' || (!aMoving && !isMoving(b))) continue;
        const tc = circleToi(
          b.pos.x - a.pos.x,
          b.pos.y - a.pos.y,
          b.vel.x - a.vel.x,
          b.vel.y - a.vel.y,
          a.radius + b.radius,
          h,
        );
        if (tc >= 0 && (!best || tc < best.t)) best = { kind: 'ball', t: tc, i, j };
      }
      if (!aMoving) continue;
      // Broad phase: only balls that can reach the cushion line during this step.
      const reach = a.radius + Math.sqrt(a.vel.x * a.vel.x + a.vel.y * a.vel.y) * h + 1e-4;
      if (Math.abs(a.pos.x) + reach < hl && Math.abs(a.pos.y) + reach < hw) continue;
      for (const seg of geo.segments) {
        const tc = segmentToi(a.pos, a.vel, a.radius, seg, h);
        if (tc >= 0 && (!best || tc < best.t)) best = { kind: 'cushion', t: tc, i, seg };
      }
    }
    return best;
  };

  const resolve = (c: Contact): void => {
    if (c.kind === 'ball') {
      const a = state[c.i]!;
      const b = state[c.j]!;
      const speed = collideBalls(a, b, table.balls);
      if (speed > 0) events.push({ type: 'ball', t, a: a.id, b: b.id, speed });
    } else {
      const b = state[c.i]!;
      const cp = closestPoint(b.pos, c.seg);
      const dx = b.pos.x - cp.x;
      const dy = b.pos.y - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) return;
      if (c.seg.kind === 'pocket' && c.seg.pocket !== undefined) {
        // Reaching the back of the pocket means the ball is already over the hole: it drops.
        pocketBall(b);
        b.pocket = c.seg.pocket;
        events.push({ type: 'pocket', t, ball: b.id, pocket: c.seg.pocket });
        return;
      }
      const falling = c.seg.kind === 'jaw' && !Number.isNaN(overHole[c.i]!);
      const speed = collideCushion(
        b,
        { x: dx / d, y: dy / d },
        falling ? fallingJaw : table.cushion,
        cloth.slideFriction,
      );
      if (speed > 0) {
        const e: PhysicsEvent = {
          type: 'cushion',
          t,
          ball: b.id,
          segment: c.seg.id,
          kind: c.seg.kind,
          speed,
        };
        if (c.seg.pocket !== undefined) e.pocket = c.seg.pocket;
        events.push(e);
      }
    }
  };

  const dropTime = state.map((b) => Math.sqrt((2 * DROP_DEPTH * b.radius) / g));

  /**
   * A ball whose centre is over the hole starts to fall. It drops if it stays over the hole for
   * the time needed to fall DROP_DEPTH radii, or comes to rest there. A fast ball crosses the hole
   * before that, hits the facing or the back of the pocket, and can rattle back out.
   */
  const checkPockets = (): void => {
    state.forEach((b, i) => {
      if (b.state === 'pocketed') return;
      let over: string | null = null;
      for (const p of geo.pockets) {
        if (overDrop(b.pos, p)) {
          over = p.id;
          break;
        }
      }
      if (over === null) {
        overHole[i] = NaN;
      } else {
        if (Number.isNaN(overHole[i]!)) overHole[i] = t;
        if (t - overHole[i]! >= dropTime[i]! || !isMoving(b)) {
          pocketBall(b);
          b.pocket = over;
          events.push({ type: 'pocket', t, ball: b.id, pocket: over });
          return;
        }
      }
      if (Math.abs(b.pos.x) > hl + 0.3 || Math.abs(b.pos.y) > hw + 0.3) {
        pocketBall(b);
        events.push({ type: 'off-table', t, ball: b.id });
      }
    });
  };

  let truncated = false;
  while (state.some(isActive)) {
    if (t >= maxTime) {
      truncated = true;
      break;
    }
    const stepEnd = Math.min(t + dt, maxTime);
    let contacts = 0;
    while (t < stepEnd) {
      const h = stepEnd - t;
      const c = contacts < MAX_CONTACTS_PER_STEP ? earliestContact(h) : null;
      if (c) {
        advanceAll(c.t);
        resolve(c);
        contacts++;
      } else {
        advanceAll(h);
        t = stepEnd;
      }
      checkPockets();
    }
  }
  if (sampleRate > 0 && frames[frames.length - 1]?.t !== t) record();

  return { ids, events, frames, final: state, duration: t, truncated };
}

/**
 * True when a ball's centre is past the edge of the slate in a pocket. The slate is cut back
 * along the whole shelf line between the facings, so a ball is over the drop once its centre is
 * more than `shelfDepth` behind the mouth line, wherever it is across the mouth. (Only the pocket
 * corridor reaches that far: on the table, the cushions keep every ball in front of it.)
 */
function overDrop(pos: Vec2, p: PocketSpec): boolean {
  const dx = pos.x - p.position.x;
  const dy = pos.y - p.position.y;
  const reach = p.fallRadius + p.mouthWidth;
  if (dx * dx + dy * dy > reach * reach) return false;
  // Depth behind the mouth line, measured from the fall-circle centre (shelf + fall radius back).
  const depth = dx * p.axis.x + dy * p.axis.y + p.fallRadius;
  return depth >= 0;
}

function pocketBall(b: BallState): void {
  b.state = 'pocketed';
  b.vel = { x: 0, y: 0 };
  b.spin = { x: 0, y: 0, z: 0 };
}

/** Linearly interpolated ball positions at time t (for rendering between frames). */
export function sampleAt(result: ShotResult, t: number): Frame {
  const fr = result.frames;
  if (fr.length === 0) throw new Error('No frames recorded');
  if (t <= fr[0]!.t) return fr[0]!;
  const last = fr[fr.length - 1]!;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = fr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = fr[lo]!;
  const b = fr[hi]!;
  const k = (t - a.t) / (b.t - a.t);
  const pos = new Float64Array(a.pos.length);
  for (let i = 0; i < pos.length; i++) pos[i] = a.pos[i]! + (b.pos[i]! - a.pos[i]!) * k;
  const drop = new Float64Array(a.drop.length);
  for (let i = 0; i < drop.length; i++) drop[i] = a.drop[i]! + (b.drop[i]! - a.drop[i]!) * k;
  return { t, pos, orient: k < 0.5 ? a.orient : b.orient, pocketed: k < 1 ? a.pocketed : b.pocketed, drop };
}
