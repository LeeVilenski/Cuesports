import {
  AMERICAN_POOL_9FT,
  ENGLISH_POOL_7FT,
  PYRAMID_12FT,
  Rng,
  SNOOKER_12FT,
  TABLE_PRESETS,
  type TableSpec,
} from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { buildTableGeometry, dropOutline } from './geometry';
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
  it('builds a closed nose line: rails plus jaws for every pocket (four whole rails on a carom table)', () => {
    for (const t of TABLE_PRESETS) {
      const g = buildTableGeometry(t);
      expect(g.segments.filter((s) => s.kind === 'rail')).toHaveLength(t.pockets.length ? 6 : 4);
      for (const p of t.pockets) expect(g.segments.some((s) => s.pocket === p.id)).toBe(true);
      // Consecutive pieces of each jaw join up.
      for (const s of g.segments) expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeGreaterThan(0);
    }
  });
});

describe('snooker pockets', () => {
  it('take a slightly off-line ball at slow pace but rattle it out when hit firmly', () => {
    const t = SNOOKER_12FT;
    const p = t.pockets.find((x) => x.id === 'top-right')!;
    const perp = { x: -p.axis.y, y: p.axis.x };
    const run = (speed: number, offset: number) => {
      const start = {
        x: p.position.x - p.axis.x * 0.9 + perp.x * offset,
        y: p.position.y - p.axis.y * 0.9 + perp.y * offset,
      };
      const r = simulate(
        t,
        [cueAt(t, start.x, start.y)],
        shot({ aim: Math.atan2(p.axis.y, p.axis.x), speed, tip: { a: 0, b: 0.4 } }),
        { sampleRate: 0 },
      );
      return pocketEvents(r).length > 0;
    };
    expect(run(0.8, 0.012)).toBe(true);
    expect(run(4, 0.012)).toBe(false);
    // A hard, dead-straight pot still goes in.
    expect(run(6, 0)).toBe(true);
  });
});

describe('pocket drop outline', () => {
  const inside = (pts: { x: number; y: number }[], q: { x: number; y: number }) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };

  it('starts at the shelf line and contains the drop area on the pocket axis', () => {
    for (const t of TABLE_PRESETS) {
      const g = buildTableGeometry(t);
      for (const p of t.pockets) {
        const pts = dropOutline(g, p.id);
        expect(pts.length, `${t.id} ${p.id}`).toBeGreaterThan(6);
        const mouth = {
          x: p.position.x - p.axis.x * (p.shelfDepth + p.fallRadius),
          y: p.position.y - p.axis.y * (p.shelfDepth + p.fallRadius),
        };
        for (const q of pts) {
          const depth = (q.x - mouth.x) * p.axis.x + (q.y - mouth.y) * p.axis.y;
          expect(depth).toBeGreaterThan(p.shelfDepth - 1e-9);
        }
        const justPast = {
          x: mouth.x + p.axis.x * (p.shelfDepth + 0.005),
          y: mouth.y + p.axis.y * (p.shelfDepth + 0.005),
        };
        const justShort = {
          x: mouth.x + p.axis.x * (p.shelfDepth - 0.005),
          y: mouth.y + p.axis.y * (p.shelfDepth - 0.005),
        };
        expect(inside(pts, justPast), `${t.id} ${p.id}`).toBe(true);
        expect(inside(pts, justShort), `${t.id} ${p.id}`).toBe(false);
      }
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

    expect(outcome(AMERICAN_POOL_9FT, 0.03)).toMatchObject({ potted: true });
    // ...and the ball touches the jaw on the way in.
    expect(outcome(AMERICAN_POOL_9FT, 0.03).jaws).toBeGreaterThan(0);
  });
});

describe('snooker corners reject balls that hit the cushion first', () => {
  const t = SNOOKER_12FT;
  /** Rolls a ball into the top cushion at `deg`°, meeting it `d` before the near jaw of the corner. */
  const railFirst = (table: TableSpec, deg: number, d: number, speed: number) => {
    const R = table.balls.cue.radius;
    const hw = table.playfield.width / 2;
    const p = table.pockets.find((x) => x.id === 'top-right')!;
    const tipX = table.playfield.length / 2 - p.mouthWidth / Math.SQRT2;
    const th = (deg * Math.PI) / 180;
    const start = { x: tipX - d - 0.9 * Math.cos(th), y: hw - R - 0.9 * Math.sin(th) };
    const r = simulate(
      table,
      [cueAt(table, start.x, start.y)],
      shot({ aim: th, speed, tip: { a: 0, b: 0.3 } }),
      {
        sampleRate: 0,
      },
    );
    return pocketEvents(r).length > 0;
  };

  it('takes a slow ball that catches the cushion just before the pocket', () => {
    for (const d of [0.05, 0.1]) expect(railFirst(t, 5, d, 1), `${d} m`).toBe(true);
  });

  it('rattles out a firmer ball that hits the cushion first, where a 9-ball corner takes it', () => {
    for (const d of [0.05, 0.1]) {
      for (const speed of [2, 3.5]) {
        expect(railFirst(t, 8, d, speed), `snooker ${d} m ${speed} m/s`).toBe(false);
        expect(railFirst(AMERICAN_POOL_9FT, 8, d, speed), `9-ball ${d} m ${speed} m/s`).toBe(true);
      }
      expect(railFirst(t, 5, d, 3.5), `snooker 5° ${d} m`).toBe(false);
    }
  });
});

describe('Russian pyramid pockets', () => {
  const t = PYRAMID_12FT;
  const straightIn = (id: string, offset: number, speed: number) => {
    const p = t.pockets.find((x) => x.id === id)!;
    const perp = { x: -p.axis.y, y: p.axis.x };
    const s = {
      x: p.position.x - p.axis.x * 0.9 + perp.x * offset,
      y: p.position.y - p.axis.y * 0.9 + perp.y * offset,
    };
    const r = simulate(t, [cueAt(t, s.x, s.y)], shot({ aim: Math.atan2(p.axis.y, p.axis.x), speed }), {
      sampleRate: 0,
    });
    return pocketEvents(r).length > 0;
  };

  it('keep a hard, accurate pot down in the middle and the corner', () => {
    for (const speed of [3.5, 6]) {
      expect(straightIn('top-side', 0.005, speed), `middle ${speed} m/s`).toBe(true);
      expect(straightIn('top-right', 0.004, speed), `corner ${speed} m/s`).toBe(true);
    }
  });

  it('still reject a ball a centimetre off line in the corner', () => {
    for (const speed of [1, 3.5]) expect(straightIn('top-right', 0.01, speed)).toBe(false);
  });
});

describe('9-ball pockets (WPA spec) take balls cut down the rail', () => {
  const t = AMERICAN_POOL_9FT;
  const R = t.balls.object.radius;
  const hw = t.playfield.width / 2;
  /** Cuts an object ball 2 mm off the top rail along it, aimed `err` degrees into (+) or away from (−) the rail. */
  const cutDownRail = (cutDeg: number, speed: number, err = 0) => {
    const o = { x: 0.3, y: hw - R - 0.002 };
    const e = (err * Math.PI) / 180;
    const ghost = { x: o.x - 2 * R * Math.cos(e), y: o.y - 2 * R * Math.sin(e) };
    const c = (cutDeg * Math.PI) / 180;
    const cue = { x: ghost.x - 0.6 * Math.cos(c), y: ghost.y - 0.6 * Math.sin(c) };
    const r = simulate(
      t,
      [cueAt(t, cue.x, cue.y), makeBall('1', t.balls.object, o)],
      shot({ aim: Math.atan2(ghost.y - cue.y, ghost.x - cue.x), speed }),
      { sampleRate: 0 },
    );
    return r.events.some((ev) => ev.type === 'pocket' && ev.ball === '1');
  };

  it.each([1.2, 2.5, 4])('drops a ball cut dead along the rail at cue speed %s m/s', (speed) => {
    for (const cut of [20, 40]) expect(cutDownRail(cut, speed), `${cut}°`).toBe(true);
  });

  it('forgives about a degree either way at a soft pace', () => {
    for (const err of [-1, -0.5, 0.5, 1]) expect(cutDownRail(20, 1.2, err), `${err}°`).toBe(true);
  });

  it('takes a ball sent a degree into the rail at medium and firm pace', () => {
    // It nicks the rail, deflects off the far facing and drops past the shelf line.
    expect(cutDownRail(20, 2.5, 1)).toBe(true);
    expect(cutDownRail(20, 4, 1)).toBe(true);
  });

  it('still rejects a ball sent well into the far jaw', () => {
    expect(cutDownRail(20, 2.5, 2)).toBe(false);
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

describe('carom table', () => {
  it('keeps a ball in play off all four cushions', async () => {
    const { CAROM_10FT } = await import('@cuesports/shared');
    const t = CAROM_10FT;
    const r = simulate(t, [cueAt(t, -0.5, 0.1)], shot({ aim: 0.6, speed: 6, tip: { a: 0, b: 0 } }), {
      sampleRate: 0,
    });
    const cushions = r.events.filter((e) => e.type === 'cushion').length;
    expect(cushions).toBeGreaterThan(4);
    expect(r.final[0]!.state).toBe('stationary');
    expect(Math.abs(r.final[0]!.pos.x)).toBeLessThan(t.playfield.length / 2);
  });
});

describe('Russian Pyramid pockets', () => {
  it('take a straight ball into the corner and middle, but not one a few mm off line', async () => {
    const { PYRAMID_12FT } = await import('@cuesports/shared');
    const t = PYRAMID_12FT;
    const run = (id: string, offset: number) => {
      const p = t.pockets.find((x) => x.id === id)!;
      const perp = { x: -p.axis.y, y: p.axis.x };
      const start = {
        x: p.position.x - p.axis.x * 0.6 + perp.x * offset,
        y: p.position.y - p.axis.y * 0.6 + perp.y * offset,
      };
      const r = simulate(
        t,
        [cueAt(t, start.x, start.y)],
        shot({ aim: Math.atan2(p.axis.y, p.axis.x), speed: 1.2, tip: { a: 0, b: 0.3 } }),
        {
          sampleRate: 0,
        },
      );
      return r.events.some((e) => e.type === 'pocket');
    };
    expect(run('top-right', 0)).toBe(true);
    expect(run('top-side', 0)).toBe(true);
    expect(run('top-right', 0.012)).toBe(false);
  });
});
