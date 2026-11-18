import { makeBall, simulate } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import type { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BallsView } from './balls-view';

// Textures need a canvas; the ball paths don't.
vi.mock('./textures', () => ({ ballTexture: () => null, shadowTexture: () => null }));

const WELL = 0.16;
const rest = new Map(
  T.pockets.map((p) => [p.id, { x: p.position.x + p.axis.x * 0.03, y: p.position.y + p.axis.y * 0.03 }]),
);

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
        view.setPockets(rest, WELL);
        view.setBalls([cue]);
        const mesh = (view as unknown as { balls: { mesh: Mesh }[] }).balls[0]!.mesh;
        const R = cue.radius;
        const step = 0.001;
        let prev: { x: number; y: number; z: number } | null = null;
        for (let t = Math.max(0, pot!.t - 0.15); t < pot!.t + 0.6; t += step) {
          view.showFrame(r, t);
          expect(mesh.visible, `visible at pot${(t - pot!.t).toFixed(3)}s`).toBe(true);
          const p = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
          if (prev) {
            // Once it starts to sink it never pops back up towards the slate.
            if (prev.z < R - 1e-6)
              expect(p.z, `rises at pot${(t - pot!.t).toFixed(3)}s`).toBeLessThanOrEqual(prev.z + 1e-6);
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
