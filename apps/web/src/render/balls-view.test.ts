import { dropOutline, makeBall, simulate, tableGeometry } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import type { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BallsView } from './balls-view';
import { wellCentre } from './well';

// Textures need a canvas; the ball paths don't.
vi.mock('./textures', () => ({ ballTexture: () => null, shadowTexture: () => null }));

const WELL = 0.16;

const outlines = new Map(T.pockets.map((p) => [p.id, dropOutline(tableGeometry(T), p.id)]));
const rest = new Map([...outlines].map(([id, o]) => [id, wellCentre(o)]));

/** How far a ball's surface is from the edge of the hole (slate lip above, well wall below); < 0 = cutting into it. */
function clearance(pocket: string, p: { x: number; y: number; z: number }, R: number): number {
  const o = outlines.get(pocket)!;
  let d2 = Infinity;
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % o.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)));
    d2 = Math.min(d2, (p.x - a.x - ex * k) ** 2 + (p.y - a.y - ey * k) ** 2);
  }
  const d = Math.sqrt(d2);
  // Above the slate only the lip (at z = 0) can be hit; below it, the wall all the way down.
  return (p.z > 0 ? Math.hypot(d, p.z) : d) - R;
}

describe('a cue ball dropping into a pocket', () => {
  for (const pk of T.pockets) {
    for (const speed of [0.6, 1, 2, 3, 5, 8]) {
      it(`${pk.id} at ${speed} m/s falls smoothly and lands in the well`, () => {
        const from = { x: pk.position.x * 0.5, y: pk.position.y * 0.3 };
        const cue = makeBall('cue', T.balls.cue, from);
        const aim = Math.atan2(pk.position.y - from.y, pk.position.x - from.x);
        const r = simulate(
          T,
          [cue],
          { ball: 'cue', aim, elevation: 0, tip: { a: 0, b: 0 }, speed },
          { sampleRate: 120 },
        );
        const pot = r.events.find((e) => e.type === 'pocket');
        expect(pot, 'potted').toBeDefined();

        const view = new BallsView();
        view.setPockets(rest, WELL, outlines);
        view.setBalls([cue]);
        const mesh = (view as unknown as { balls: { mesh: Mesh }[] }).balls[0]!.mesh;
        const R = cue.radius;
        const step = 0.001;
        let prev: { x: number; y: number; z: number } | null = null;
        let lowest = Infinity;
        for (let t = Math.max(0, pot!.t - 0.15); t < pot!.t + 0.6; t += step) {
          view.showFrame(r, t);
          expect(mesh.visible, `visible at pot${(t - pot!.t).toFixed(3)}s`).toBe(true);
          const p = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
          if (p.z < R - 1e-6)
            expect(
              clearance(pk.id, p, R),
              `cuts the cloth at pot${(t - pot!.t).toFixed(3)}s`,
            ).toBeGreaterThan(-2e-4);
          if (prev) {
            // Once it starts to sink it never pops back up towards the slate (rolling over the lip
            // may lift it a fraction of a millimetre).
            lowest = Math.min(lowest, p.z);
            expect(p.z, `rises at pot${(t - pot!.t).toFixed(3)}s`).toBeLessThanOrEqual(lowest + 5e-4);
            // No teleporting: never faster than the shot itself (plus the fall).
            const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
            expect(d, `jumps at pot${(t - pot!.t).toFixed(3)}s`).toBeLessThan(
              (speed + 5) * step * 1.5 + 1e-4,
            );
          }
          prev = p;
        }
        // It ends up resting on the floor of the pocket's well.
        const target = rest.get(pk.id)!;
        expect(prev!.z).toBeCloseTo(-WELL + R, 4);
        expect(Math.hypot(prev!.x - target.x, prev!.y - target.y)).toBeLessThan(1e-3);
      });
    }
  }
});

describe('balls potted into the same pocket', () => {
  it('land on top of each other instead of passing through', () => {
    const pk = T.pockets.find((p) => p.id === 'bottom-left')!;
    const from = { x: pk.position.x * 0.5, y: pk.position.y * 0.3 };
    const aim = Math.atan2(pk.position.y - from.y, pk.position.x - from.x);
    const strike = (ball: string) => ({ ball, aim, elevation: 0, tip: { a: 0, b: 0 }, speed: 1 });
    const cue = makeBall('cue', T.balls.cue, { x: 0.8, y: 0.3 });
    const view = new BallsView();
    view.setPockets(rest, WELL, outlines);
    let balls = [
      cue,
      makeBall('1', T.balls.object, from),
      makeBall('2', T.balls.object, { x: 0.6, y: -0.3 }),
    ];
    view.setBalls(balls);
    const meshes = (view as unknown as { balls: { id: string; mesh: Mesh }[] }).balls;
    const m1 = meshes.find((b) => b.id === '1')!.mesh;
    const m2 = meshes.find((b) => b.id === '2')!.mesh;
    const R = T.balls.object.radius;
    const gap = () => m1.position.distanceTo(m2.position);

    const r1 = simulate(T, balls, strike('1'), { sampleRate: 120 });
    expect(r1.final.find((b) => b.id === '1')!.state).toBe('pocketed');
    view.commit(r1);
    balls = r1.final.map((b) => (b.id === '2' ? { ...b, pos: { ...from } } : b));
    view.showState(balls);

    for (const speed of [0.6, 1, 3]) {
      const r2 = simulate(T, balls, { ...strike('2'), speed }, { sampleRate: 120 });
      const pot = r2.events.find((e) => e.type === 'pocket' && e.ball === '2');
      expect(pot).toBeDefined();
      for (let t = pot!.t - 0.1; t < pot!.t + 0.6; t += 0.001) {
        view.showFrame(r2, t);
        expect(gap(), `overlap at pot${(t - pot!.t).toFixed(3)}s`).toBeGreaterThan(2 * R - 1e-4);
      }
      expect(m2.position.z).toBeGreaterThan(m1.position.z + R);
    }
  });
});
