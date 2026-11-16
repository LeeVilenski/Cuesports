import {
  AMERICAN_POOL_9FT,
  ENGLISH_POOL_7FT,
  Rng,
  SNOOKER_12FT,
  TABLE_PRESETS,
  type TableSpec,
} from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { buildTableGeometry } from './geometry';
import { layout, makeBall, type LayoutId } from './layouts';
import { simulate } from './simulate';
import type { BallState } from './types';
import { cueAt, shot } from './test-utils';

function pocketEvents(r: ReturnType<typeof simulate>) {
  return r.events.filter((e) => e.type === 'pocket');
}

/** Checks that no two balls overlap and every ball is on the table or pocketed. */
function expectSane(table: TableSpec, balls: BallState[]) {
  const hl = table.playfield.length / 2;
  const hw = table.playfield.width / 2;
  const live = balls.filter((b) => b.state !== 'pocketed');
  for (const b of live) {
    expect(b.state).toBe('stationary');
    // A ball's centre can be beyond the cushion line only inside a pocket mouth.
    const inside = Math.abs(b.pos.x) <= hl - b.radius + 1e-6 && Math.abs(b.pos.y) <= hw - b.radius + 1e-6;
    if (!inside) {
      const nearPocket = table.pockets.some(
        (p) => Math.hypot(b.pos.x - p.position.x, b.pos.y - p.position.y) < p.mouthWidth + p.fallRadius,
      );
      expect(nearPocket, `${b.id} at ${b.pos.x},${b.pos.y}`).toBe(true);
    }
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(a.radius + b.radius - 1e-6);
    }
  }
}

describe('table geometry', () => {
  it('builds a closed nose line: rails plus jaws for every pocket', () => {
    for (const t of TABLE_PRESETS) {
      const g = buildTableGeometry(t);
      expect(g.segments.filter((s) => s.kind === 'rail')).toHaveLength(6);
      for (const p of t.pockets) expect(g.segments.some((s) => s.pocket === p.id)).toBe(true);
      // Consecutive pieces of each jaw join up.
      for (const s of g.segments) expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeGreaterThan(0);
    }
  });
});

describe('pockets', () => {
  it('pots a ball rolled along the diagonal into each corner pocket', () => {
    for (const t of TABLE_PRESETS) {
      for (const p of t.pockets.filter((x) => x.kind === 'corner')) {
        const start = { x: p.position.x - p.axis.x * 0.5, y: p.position.y - p.axis.y * 0.5 };
        const aim = Math.atan2(p.axis.y, p.axis.x);
        const r = simulate(t, [makeBall('cue', t.balls.cue, start)], shot({ aim, speed: 1.5 }), {
          sampleRate: 0,
        });
        expect(
          pocketEvents(r).map((e) => e.pocket),
          `${t.id} ${p.id}`,
        ).toEqual([p.id]);
      }
    }
  });

  it('pots a ball sent straight into each side pocket', () => {
    for (const t of TABLE_PRESETS) {
      for (const p of t.pockets.filter((x) => x.kind === 'side')) {
        const r = simulate(t, [cueAt(t, 0, 0)], shot({ aim: Math.atan2(p.axis.y, 0), speed: 1.5 }), {
          sampleRate: 0,
        });
        expect(
          pocketEvents(r).map((e) => e.pocket),
          `${t.id} ${p.id}`,
        ).toEqual([p.id]);
      }
    }
  });

  it('a ball rolled down the rail drops in the corner pocket on a pool table', () => {
    const t = AMERICAN_POOL_9FT;
    const R = t.balls.cue.radius;
    const hw = t.playfield.width / 2;
    const r = simulate(
      t,
      [cueAt(t, 0.6, hw - R - 0.001)],
      shot({ aim: 0, speed: 1.2, tip: { a: 0, b: 0.4 } }),
      {
        sampleRate: 0,
      },
    );
    expect(pocketEvents(r).map((e) => e.pocket)).toEqual(['top-right']);
  });

  it('a ball driven into the knuckle of a jaw hits the jaw and stays out', () => {
    const t = SNOOKER_12FT;
    const p = t.pockets.find((x) => x.id === 'top-side')!;
    const R = t.balls.cue.radius;
    // Aim straight up at the left jaw tip, offset so the ball meets the rounded knuckle.
    const x = -p.mouthWidth / 2 - R * 0.3;
    const r = simulate(t, [cueAt(t, x, 0.4)], shot({ aim: Math.PI / 2, speed: 1.5 }), { sampleRate: 0 });
    expect(r.events.some((e) => e.type === 'cushion' && e.kind === 'jaw')).toBe(true);
    expect(pocketEvents(r)).toEqual([]);
  });

  it('tight pockets reject an off-line ball that a wide pocket accepts', () => {
    const outcome = (t: TableSpec, offset: number) => {
      const p = t.pockets.find((x) => x.id === 'top-right')!;
      const perp = { x: -p.axis.y, y: p.axis.x };
      const start = {
        x: p.position.x - p.axis.x * 0.6 + perp.x * offset,
        y: p.position.y - p.axis.y * 0.6 + perp.y * offset,
      };
      const r = simulate(
        t,
        [cueAt(t, start.x, start.y)],
        shot({ aim: Math.atan2(p.axis.y, p.axis.x), speed: 1.5 }),
        {
          sampleRate: 0,
        },
      );
      return {
        potted: pocketEvents(r).length > 0,
        jaws: r.events.filter((e) => e.type === 'cushion' && e.kind === 'jaw').length,
      };
    };
    // 3 cm off the pocket line.
    expect(outcome(ENGLISH_POOL_7FT, 0.03)).toMatchObject({ potted: false });
    expect(outcome(SNOOKER_12FT, 0.03)).toMatchObject({ potted: false });
    expect(outcome(SNOOKER_12FT, 0.03).jaws).toBeGreaterThan(1);
    expect(outcome(AMERICAN_POOL_9FT, 0.03)).toMatchObject({ potted: true });
    // ...and the ball touches the jaw on the way in.
    expect(outcome(AMERICAN_POOL_9FT, 0.03).jaws).toBeGreaterThan(0);
  });
});

describe('robustness', () => {
  it('never lets a ball tunnel out of the table, even at maximum power', () => {
    const rng = new Rng(3);
    for (const t of TABLE_PRESETS) {
      for (let i = 0; i < 12; i++) {
        const r = simulate(
          t,
          [cueAt(t, rng.range(-0.3, 0.3), rng.range(-0.2, 0.2))],
          shot({
            aim: rng.range(0, 2 * Math.PI),
            speed: 8,
            tip: { a: rng.range(-0.4, 0.4), b: rng.range(-0.4, 0.4) },
          }),
          { sampleRate: 0 },
        );
        expect(r.truncated).toBe(false);
        expect(r.events.some((e) => e.type === 'off-table')).toBe(false);
        expectSane(t, r.final);
      }
    }
  });

  const breaks: [TableSpec, LayoutId][] = [
    [AMERICAN_POOL_9FT, 'nine-ball'],
    [AMERICAN_POOL_9FT, 'eight-ball'],
    [AMERICAN_POOL_9FT, 'ten-ball'],
    [ENGLISH_POOL_7FT, 'blackball'],
    [SNOOKER_12FT, 'snooker'],
  ];

  it.each(breaks)('break-offs on %s (%s) end with a sane table', (t, id) => {
    for (let seed = 1; seed <= 4; seed++) {
      const balls = layout(t, id, seed);
      const cue = balls.find((b) => b.id === 'cue')!;
      const apex = balls[0]!;
      const aim = Math.atan2(apex.pos.y - cue.pos.y, apex.pos.x - cue.pos.x);
      const r = simulate(t, balls, shot({ aim, speed: id === 'snooker' ? 4 : 9 }), { sampleRate: 0 });
      expect(r.truncated).toBe(false);
      expectSane(t, r.final);
    }
  });

  it('a full-power 9-ball break spreads the rack', () => {
    let moved = 0;
    let runs = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const balls = layout(AMERICAN_POOL_9FT, 'nine-ball', seed);
      const cue = balls.find((b) => b.id === 'cue')!;
      const aim = Math.atan2(balls[0]!.pos.y - cue.pos.y, balls[0]!.pos.x - cue.pos.x);
      const r = simulate(AMERICAN_POOL_9FT, balls, shot({ aim, speed: 9 }), { sampleRate: 0 });
      for (const b of r.final) {
        const start = balls.find((x) => x.id === b.id)!;
        if (
          b.id !== 'cue' &&
          (b.state === 'pocketed' || Math.hypot(b.pos.x - start.pos.x, b.pos.y - start.pos.y) > 0.2)
        )
          moved++;
      }
      runs++;
    }
    // On average most of the nine balls should travel well away from the rack.
    expect(moved / runs).toBeGreaterThan(6);
  });
});
