import { SNOOKER_12FT as T } from '@cuesports/shared';
import { describe, expect, it, vi } from 'vitest';
import { alongPath, RUNNER_BALLS, runnerSlots } from './snooker-pocket';
import { buildTableView } from './table-view';

// Textures need a canvas; geometry doesn't.
vi.mock('./textures', async () => {
  const { Texture } = await import('three');
  const t = () => new Texture();
  return {
    ballTexture: t,
    shadowTexture: t,
    clothColour: () => '#1f7a3a',
    clothTexture: t,
    woodTexture: t,
    leatherTexture: t,
    netTexture: t,
  };
});

describe('snooker pocket runners', () => {
  const view = buildTableView(T);
  const R = T.balls.object.radius;
  for (const p of T.pockets) {
    it(`${p.id} holds six balls without overlapping, outside the table`, () => {
      const path = view.pocketRunners.get(p.id)!;
      expect(path).toBeDefined();
      const slots = runnerSlots(path, R);
      expect(slots).toHaveLength(RUNNER_BALLS);
      // The last ball still sits on the runner, under the net.
      expect(slots[RUNNER_BALLS - 1]!).toBeGreaterThanOrEqual(0);
      const pts = slots.map((s) => alongPath(path, s));
      for (let k = 1; k < pts.length; k++) {
        const [a, b] = [pts[k - 1]!, pts[k]!];
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThanOrEqual(2 * R - 1e-9);
      }
      // The end stop is out beyond the side of the table, where the runners hang.
      expect(Math.abs(pts[0]!.y)).toBeGreaterThan(view.outer.hy);
    });
  }
});
