import { AMERICAN_POOL_9FT as T, ENGLISH_POOL_7FT as E } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { collideBalls, collideCluster } from './ball-collision';
import { layout } from './layouts';
import { classify } from './motion';
import { simulate } from './simulate';
import { byId, cueAt, deg, kinetic, objAt, shot, speed } from './test-utils';

const R = T.balls.object.radius;

/** Aim angle from the cue ball at (cx, 0) to send an object ball at (0, 0) off at `cutDeg` (no throw). */
function cutAim(cx: number, cutDeg: number): number {
  const a = (-cutDeg * Math.PI) / 180;
  const gx = -2 * R * Math.cos(a);
  const gy = -2 * R * Math.sin(a);
  return Math.atan2(gy, gx - cx);
}

/** Runs until just after the first ball–ball contact and returns the balls. */
function firstContact(cutDeg: number, over: Parameters<typeof shot>[0] = {}) {
  const balls = [cueAt(T, -0.4, 0), objAt(T, '1', 0, 0)];
  const s = shot({ aim: cutAim(-0.4, cutDeg), ...over });
  const res = simulate(T, balls, s, { sampleRate: 0, maxTime: 2 });
  const hit = res.events.find((e) => e.type === 'ball');
  if (!hit) throw new Error('no contact');
  const after = simulate(T, balls, s, { sampleRate: 0, maxTime: hit.t + 1e-4 });
  return after.final;
}

describe('ball–ball collisions', () => {
  it('a full-ball stun shot stops the cue ball dead', () => {
    const [cue, obj] = firstContact(0, { speed: 3 });
    expect(speed(cue!)).toBeLessThan(0.05 * speed(obj!));
    expect(obj!.vel.x).toBeGreaterThan(0);
  });

  it('follow carries the cue ball forward; draw brings it back', () => {
    const balls = [cueAt(T, -0.4, 0), objAt(T, '1', 0, 0)];
    const cueAfter = (tip: { a: number; b: number }, speed: number) => {
      const s = shot({ tip, speed });
      const hit = simulate(T, balls, s, { sampleRate: 0 }).events.find((e) => e.type === 'ball')!;
      return byId(simulate(T, balls, s, { sampleRate: 0, maxTime: hit.t + 1 }).final, 'cue');
    };
    expect(cueAfter({ a: 0, b: 0.4 }, 1.5).pos.x).toBeGreaterThan(-2 * R + 0.05);
    expect(cueAfter({ a: 0, b: -0.5 }, 2.5).pos.x).toBeLessThan(-2 * R - 0.1);
  });

  it('cut-induced throw pushes the object ball a few degrees off the line of centres', () => {
    const [, obj] = firstContact(30, { speed: 1 });
    const dir = deg(Math.atan2(obj!.vel.y, obj!.vel.x));
    const throwDeg = dir + 30;
    // Alciatore: a 30° stun cut at slow speed throws about 2–4°.
    expect(throwDeg).toBeGreaterThan(1);
    expect(throwDeg).toBeLessThan(5);
  });

  it('throw is larger for slow shots than fast ones', () => {
    const slow = firstContact(30, { speed: 0.6 })[1]!;
    const fast = firstContact(30, { speed: 5 })[1]!;
    const thr = (b: typeof slow) => deg(Math.atan2(b.vel.y, b.vel.x)) + 30;
    expect(thr(slow)).toBeGreaterThan(thr(fast));
  });

  it('gearing outside english cancels the throw; inside english still throws', () => {
    // A stun cue ball arriving at a 30° cut (object ball goes off at −30°).
    const n = { x: Math.cos(-Math.PI / 6), y: Math.sin(-Math.PI / 6) };
    const throwWith = (wz: number) => {
      const cue = cueAt(T, -2 * R * n.x, -2 * R * n.y);
      const obj = objAt(T, '1', 0, 0);
      cue.vel = { x: 1, y: 0 };
      cue.spin = { x: 0, y: 0, z: wz };
      cue.state = classify(cue);
      collideBalls(cue, obj, T.balls);
      return deg(Math.atan2(obj.vel.y, obj.vel.x)) + 30;
    };
    const plain = throwWith(0);
    // Left-hand side (wz < 0) is outside english for a cut to the right.
    const gearing = throwWith(-0.5 / R);
    const inside = throwWith(0.5 / R);
    expect(plain).toBeGreaterThan(1);
    expect(Math.abs(gearing)).toBeLessThan(0.01);
    // Inside english doubles the slip, which lowers ball–ball friction (Alciatore's speed-dependent
    // μ), so it throws in the same direction but not more than stun.
    expect(inside).toBeGreaterThan(1);
  });

  it('a stun cut sends the cue ball off near the tangent line (90° rule)', () => {
    const [cue, obj] = firstContact(30, { speed: 2 });
    const a = Math.atan2(cue!.vel.y, cue!.vel.x);
    const b = Math.atan2(obj!.vel.y, obj!.vel.x);
    const sep = Math.abs(deg(a - b));
    expect(sep).toBeGreaterThan(80);
    expect(sep).toBeLessThan(95);
  });

  it('never adds energy', () => {
    for (const vx of [0.3, 1, 4]) {
      for (const wz of [-30, 0, 30]) {
        const a = cueAt(T, -2 * R, 0.01);
        const b = objAt(T, '1', 0, 0);
        a.vel = { x: vx, y: 0 };
        a.spin = { x: 3, y: vx / R, z: wz };
        a.state = classify(a);
        // Move to touching.
        a.pos.x = b.pos.x - Math.sqrt((2 * R) ** 2 - a.pos.y ** 2);
        const before = kinetic(a) + kinetic(b);
        collideBalls(a, b, T.balls);
        expect(kinetic(a) + kinetic(b)).toBeLessThanOrEqual(before * (1 + 1e-12));
      }
    }
  });

  it('works with unequal balls (English pool cue ball is smaller and lighter)', () => {
    const balls = [cueAt(E, -0.4, 0), objAt(E, '1', 0, 0)];
    const res = simulate(E, balls, shot({ speed: 2 }), { sampleRate: 0, maxTime: 0.25 });
    // A lighter cue ball bounces back slightly after a full stun hit.
    expect(byId(res.final, 'cue').vel.x).toBeLessThan(0.05);
    expect(byId(res.final, '1').vel.x).toBeGreaterThan(0);
  });
});

describe('rack breaks', () => {
  // A rack is solved as one compliant contact: separate hard-sphere impacts sent the impulse down
  // the two edge chains only, so a full-ball break knocked out the back corners and little else.
  it('a full-power blackball break spreads the pack and is legal', () => {
    const table = E;
    for (let seed = 1; seed <= 6; seed++) {
      const balls = layout(table, 'blackball', seed);
      const cue = balls.find((b) => b.id === 'cue')!;
      const apex = balls[0]!;
      const aim = Math.atan2(apex.pos.y - cue.pos.y, apex.pos.x - cue.pos.x);
      const r = simulate(
        table,
        balls,
        { ball: 'cue', aim, elevation: 0.05, tip: { a: 0, b: 0 }, speed: 8 },
        { sampleRate: 0 },
      );
      const obj = r.final.filter((b) => b.id !== 'cue');
      const potted = obj.filter((b) => b.state === 'pocketed').length;
      const passed = obj.filter((b) => b.state !== 'pocketed' && b.pos.x + b.radius < 0).length;
      const railed = new Set(
        r.events
          .filter((e) => e.type === 'cushion' && e.ball !== 'cue')
          .map((e) => (e.type === 'cushion' ? e.ball : '')),
      ).size;
      expect(potted + passed, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(railed, `seed ${seed}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('a cluster contact conserves momentum and reports the struck pair first', () => {
    const table = E;
    const balls = layout(table, 'blackball', 1);
    const cue = balls.find((b) => b.id === 'cue')!;
    const apex = balls[0]!;
    cue.pos = { x: apex.pos.x - apex.radius - cue.radius, y: apex.pos.y };
    cue.vel = { x: 5, y: 0 };
    cue.state = 'sliding';
    const p0 = { x: 0, y: 0 };
    for (const b of balls) {
      p0.x += b.mass * b.vel.x;
      p0.y += b.mass * b.vel.y;
    }
    const out = collideCluster(balls, balls.indexOf(apex), balls.indexOf(cue), table.balls)!;
    expect(out.length).toBeGreaterThan(10);
    expect(new Set([balls[out[0]!.a]!.id, balls[out[0]!.b]!.id])).toEqual(new Set(['cue', apex.id]));
    const p1 = { x: 0, y: 0 };
    for (const b of balls) {
      p1.x += b.mass * b.vel.x;
      p1.y += b.mass * b.vel.y;
    }
    expect(p1.x).toBeCloseTo(p0.x, 6);
    expect(p1.y).toBeCloseTo(p0.y, 6);
    const moving = balls.filter((b) => b.id !== 'cue' && Math.hypot(b.vel.x, b.vel.y) > 0.05).length;
    expect(moving).toBeGreaterThanOrEqual(12);
  });
});
