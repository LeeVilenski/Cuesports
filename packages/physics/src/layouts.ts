import { quatIdentity, Rng, type BallSpec, type TableSpec, type Vec2 } from '@cuesports/shared';
import type { BallState } from './types';

/**
 * Ball layouts used by the physics lab and tests. Rulesets (M3/M4) will own the official racks;
 * these give physically sensible starting positions.
 */

export function makeBall(id: string, spec: BallSpec, pos: Vec2): BallState {
  return {
    id,
    radius: spec.radius,
    mass: spec.mass,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    spin: { x: 0, y: 0, z: 0 },
    orient: quatIdentity(),
    state: 'stationary',
  };
}

export interface RackOptions {
  /** Rng for tiny position jitter, so a rack is never perfectly frozen. */
  rng?: Rng;
  /** Maximum jitter per ball in metres (balls never overlap). */
  jitter?: number;
}

/**
 * Places balls in rows behind an apex point, with rows extending along +x. `rows` gives the
 * number of balls in each row, e.g. [1, 2, 3, 4, 5] for a triangle or [1, 2, 3, 2, 1] for a diamond.
 */
export function rackRows(
  ids: string[],
  spec: BallSpec,
  apex: Vec2,
  rows: number[],
  opts: RackOptions = {},
): BallState[] {
  const jitter = opts.jitter ?? 0.0001;
  const pitch = 2 * spec.radius + 2 * jitter;
  const rowStep = (pitch * Math.sqrt(3)) / 2;
  const out: BallState[] = [];
  let k = 0;
  rows.forEach((count, r) => {
    for (let j = 0; j < count; j++) {
      const id = ids[k++];
      if (id === undefined) return;
      const pos = { x: apex.x + r * rowStep, y: apex.y + (j - (count - 1) / 2) * pitch };
      if (opts.rng) {
        pos.x += opts.rng.range(-jitter, jitter) * 0.7;
        pos.y += opts.rng.range(-jitter, jitter) * 0.7;
      }
      out.push(makeBall(id, spec, pos));
    }
  });
  return out;
}

function spot(table: TableSpec, id: string, fallback: Vec2): Vec2 {
  const m = table.markings.find((x) => x.type === 'spot' && x.id === id);
  return m && m.type === 'spot' ? m.position : fallback;
}

export type LayoutId =
  | 'snooker'
  | 'billiards'
  | 'carom'
  | 'eight-ball'
  | 'nine-ball'
  | 'ten-ball'
  | 'blackball'
  | 'two-balls'
  | 'empty';

/** A break-off layout for the given game, with the cue ball in a typical break position. */
export function layout(table: TableSpec, id: LayoutId, seed = 1): BallState[] {
  const rng = new Rng(seed);
  const obj = table.balls.object;
  const hl = table.playfield.length / 2;
  const cueBall = (pos: Vec2): BallState => makeBall('cue', table.balls.cue, pos);
  const foot = spot(table, 'foot', spot(table, 'black', { x: hl / 2, y: 0 }));

  switch (id) {
    case 'snooker': {
      const pink = spot(table, 'pink', { x: hl / 2, y: 0 });
      const reds = Array.from({ length: 15 }, (_, i) => `red${i + 1}`);
      const apex = { x: pink.x + 2 * obj.radius + 0.002, y: 0 };
      const balls = rackRows(reds, obj, apex, [1, 2, 3, 4, 5], { rng });
      for (const c of ['yellow', 'green', 'brown', 'blue', 'pink', 'black']) {
        balls.push(makeBall(c, obj, spot(table, c, { x: 0, y: 0 })));
      }
      const brown = spot(table, 'brown', { x: -hl / 2, y: 0 });
      balls.push(cueBall({ x: brown.x - 0.05, y: 0.12 }));
      return balls;
    }
    case 'billiards': {
      // English Billiards: red on the billiard spot, both whites in the D.
      const brown = spot(table, 'brown', { x: -hl / 2, y: 0 });
      const d = spot(table, 'green', { x: brown.x, y: 0.29 }).y;
      return [
        makeBall('red', obj, spot(table, 'black', foot)),
        makeBall('spot', table.balls.cue, { x: brown.x, y: d / 2 }),
        cueBall({ x: brown.x - 0.02, y: -d / 2 }),
      ];
    }
    case 'carom': {
      // Carom opening: red on the foot spot, yellow on the head spot, white beside it.
      const head = spot(table, 'head', { x: -hl / 2, y: 0 });
      return [
        makeBall('red', obj, foot),
        makeBall('yellow', table.balls.cue, head),
        cueBall(spot(table, 'start-right', { x: head.x, y: -0.18 })),
      ];
    }
    case 'eight-ball':
    case 'blackball': {
      const ids =
        id === 'eight-ball'
          ? ['1', '9', '2', '10', '8', '3', '11', '4', '12', '5', '13', '6', '14', '7', '15']
          : ['r1', 'y1', 'r2', 'r3', '8', 'y2', 'y3', 'r4', 'y4', 'r5', 'y5', 'r6', 'y6', 'y7', 'r7'];
      const balls = rackRows(ids, obj, foot, [1, 2, 3, 4, 5], { rng });
      // English pool breaks from baulk (the cue ball's centre behind the baulk line).
      const baulk = table.markings.find((m) => m.type === 'line' && m.id === 'baulk');
      const x = id === 'blackball' && baulk?.type === 'line' ? baulk.a.x - 0.12 : -hl / 2;
      balls.push(cueBall({ x, y: 0.05 }));
      return balls;
    }
    case 'nine-ball': {
      const ids = ['1', '2', '3', '4', '9', '5', '6', '7', '8'];
      const balls = rackRows(ids, obj, foot, [1, 2, 3, 2, 1], { rng });
      balls.push(cueBall({ x: -hl / 2, y: 0.1 }));
      return balls;
    }
    case 'ten-ball': {
      const ids = ['1', '2', '3', '4', '10', '5', '6', '7', '8', '9'];
      const balls = rackRows(ids, obj, foot, [1, 2, 3, 4], { rng });
      balls.push(cueBall({ x: -hl / 2, y: 0.1 }));
      return balls;
    }
    case 'two-balls':
      return [makeBall('1', obj, { x: hl / 3, y: 0 }), cueBall({ x: -hl / 3, y: 0 })];
    case 'empty':
      return [cueBall({ x: -hl / 2, y: 0 })];
  }
}
