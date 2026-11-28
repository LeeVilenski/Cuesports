import { describe, expect, it } from 'vitest';
import type { PhysicsEvent } from '@cuesports/physics';
import { shotFeats, snookered, type Spot } from './feats';
import type { ShotRecord } from './record';

const R = 0.028;
const spot = (id: string, x: number, y: number): Spot => ({ id, x, y });

describe('snookered', () => {
  it('sees a wall of balls in the way, and a clear line round it', () => {
    const wall = [-2, -1, 0, 1, 2].map((k) => spot(`w${k}`, 0, k * 2.05 * R));
    const balls = [spot('cue', -0.5, 0), spot('1', 0.5, 0), ...wall];
    expect(snookered(balls, 'cue', ['1'], R)).toBe(true);
    // A ball half across the line blocks the full ball, but the far edge is still on.
    expect(snookered([spot('cue', -0.5, 0), spot('1', 0.5, 0), spot('2', 0, 1.5 * R)], 'cue', ['1'], R)).toBe(
      false,
    );
    // Dead in the middle, a ball the same size covers both edges: snookered.
    expect(snookered([spot('cue', -0.5, 0), spot('1', 0.5, 0), spot('2', 0, 0)], 'cue', ['1'], R)).toBe(true);
    // Any ball on that's in sight means no snooker.
    expect(snookered([...balls, spot('3', -0.5, 0.4)], 'cue', ['1', '3'], R)).toBe(false);
    expect(snookered(balls, 'cue', [], R)).toBe(false);
  });
});

const rec = (o: Partial<ShotRecord>): ShotRecord =>
  ({
    player: 0,
    before: [],
    shot: { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 2 },
    decl: {},
    firstHit: '1',
    potted: [],
    fouls: [],
    scored: 0,
    isBreak: false,
    ...o,
  }) as ShotRecord;
const ctx = { snookeredBefore: false, leftSnookered: false, R };
const ball = (t: number, a: string, b: string): PhysicsEvent => ({ type: 'ball', t, a, b, speed: 1 });
const pocket = (t: number, id: string): PhysicsEvent =>
  ({ type: 'pocket', t, ball: id, pocket: 'p' }) as never;

describe('shotFeats', () => {
  it('tells a plant from a combination', () => {
    const events = [ball(0.2, 'cue', '1'), ball(0.3, '1', '2'), pocket(0.8, '2')];
    const plant = shotFeats(
      rec({
        potted: ['2'],
        before: [
          ['cue', -0.5, 0],
          ['1', 0, 0],
          ['2', 2.1 * R, 0],
        ],
      }),
      events,
      ctx,
    );
    expect(plant.names).toEqual(['Plant!']);
    expect(plant.xp.vision).toBeGreaterThan(0);
    const combo = shotFeats(
      rec({
        potted: ['2'],
        before: [
          ['cue', -0.5, 0],
          ['1', 0, 0],
          ['2', 0.4, 0],
        ],
      }),
      events,
      ctx,
    );
    expect(combo.names).toEqual(['Combination!']);
  });

  it('spots a cannon, a snooker escaped off the cushion, and a snooker left', () => {
    const cannon = shotFeats(
      rec({ potted: ['2'] }),
      [ball(0.2, 'cue', '1'), ball(0.5, 'cue', '2'), pocket(0.9, '2')],
      ctx,
    );
    expect(cannon.names).toEqual(['Cannon!']);
    const kick: PhysicsEvent = {
      type: 'cushion',
      t: 0.3,
      ball: 'cue',
      segment: 's',
      kind: 'rail',
      speed: 1,
    } as never;
    const escape = shotFeats(rec({}), [kick, ball(0.6, 'cue', '1')], { ...ctx, snookeredBefore: true });
    expect(escape.names).toEqual(['Escaped the snooker']);
    expect(escape.xp.cushion).toBe(8);
    expect(shotFeats(rec({}), [ball(0.2, 'cue', '1')], { ...ctx, leftSnookered: true }).names).toEqual([
      'Left them snookered',
    ]);
  });

  it('gives nothing for a foul or a plain pot', () => {
    expect(shotFeats(rec({ fouls: ['x'] }), [], { ...ctx, leftSnookered: true }).names).toEqual([]);
    expect(shotFeats(rec({ potted: ['1'] }), [ball(0.2, 'cue', '1'), pocket(0.6, '1')], ctx).names).toEqual(
      [],
    );
  });
});
