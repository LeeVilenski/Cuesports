import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { balkArea, BALKLINE_47_2, THREE_CUSHION, type CaromState } from './carom';

function shot(
  before: BallState[],
  events: PhysicsEvent[],
  moves: Record<string, { x: number; y: number }> = {},
): ShotResult {
  const final = before.map(cloneBall);
  for (const [id, p] of Object.entries(moves)) final.find((b) => b.id === id)!.pos = { ...p };
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const hit = (b: string, t: number): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 2 });
const rail = (t: number): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball: 'cue',
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});

function start(R = THREE_CUSHION): { s: CaromState; balls: BallState[] } {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, opening: false }, balls: f.balls };
}

describe('3-Cushion', () => {
  it('opens with the red on the foot spot, which must be hit first', () => {
    const f = THREE_CUSHION.newFrame(THREE_CUSHION.defaults, new Rng(1), 0);
    expect(f.turn.cueBall).toBe('cue');
    expect(f.turn.targets).toEqual(['red']);
    const j = THREE_CUSHION.judge(
      f.state,
      {},
      f.balls,
      shot(f.balls, [hit('yellow', 0.1), rail(0.2), rail(0.3), rail(0.4), hit('red', 0.5)]),
      THREE_CUSHION.defaults,
    );
    expect(j.fouls[0]?.code).toBe('wrong-ball-first');
    expect(j.turn.player).toBe(1);
    expect(j.turn.cueBall).toBe('yellow');
  });

  it('counts a point with three cushions before the second ball', () => {
    const { s, balls } = start();
    const j = THREE_CUSHION.judge(
      s,
      {},
      balls,
      shot(balls, [hit('red', 0.1), rail(0.2), rail(0.3), rail(0.4), hit('yellow', 0.5)]),
      THREE_CUSHION.defaults,
    );
    expect(j.points).toEqual([1, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('does not count two cushions, or cushions after the second ball', () => {
    const { s, balls } = start();
    const two = THREE_CUSHION.judge(
      s,
      {},
      balls,
      shot(balls, [hit('red', 0.1), rail(0.2), rail(0.3), hit('yellow', 0.5), rail(0.6)]),
      THREE_CUSHION.defaults,
    );
    expect(two.points).toEqual([0, 0]);
    expect(two.message).toMatch(/2 cushions/);
    expect(two.turn.player).toBe(1);
  });

  it('counts cushions before the first ball too', () => {
    const { s, balls } = start();
    const j = THREE_CUSHION.judge(
      s,
      {},
      balls,
      shot(balls, [rail(0.05), rail(0.08), hit('red', 0.1), rail(0.3), hit('yellow', 0.5)]),
      THREE_CUSHION.defaults,
    );
    expect(j.points).toEqual([1, 0]);
  });
});

describe('Balkline 47/2', () => {
  const R = BALKLINE_47_2;
  it('splits the table into nine areas', () => {
    expect(balkArea(R.table, { x: 0, y: 0 })).toBe(4);
    expect(balkArea(R.table, { x: -1.3, y: -0.6 })).toBe(0);
    expect(balkArea(R.table, { x: 1.3, y: 0.6 })).toBe(8);
  });

  it('allows one count with both balls in a balk area; the next must bring one out', () => {
    const { s, balls } = start(R);
    for (const b of balls)
      if (b.id !== 'cue') b.pos = b.id === 'red' ? { x: 1.3, y: 0.6 } : { x: 1.25, y: 0.55 };
    const stay = { red: { x: 1.3, y: 0.62 }, yellow: { x: 1.22, y: 0.55 } };
    const first = R.judge(s, {}, balls, shot(balls, [hit('red', 0.1), hit('yellow', 0.2)], stay), R.defaults);
    expect(first.points).toEqual([1, 0]);
    const second = R.judge(
      first.state,
      {},
      first.balls,
      shot(first.balls, [hit('red', 0.1), hit('yellow', 0.2)], stay),
      R.defaults,
    );
    expect(second.points).toEqual([1, 0]);
    expect(second.turn.player).toBe(1);
    const out = R.judge(
      first.state,
      {},
      first.balls,
      shot(first.balls, [hit('red', 0.1), hit('yellow', 0.2)], { red: { x: 0, y: 0 } }),
      R.defaults,
    );
    expect(out.points).toEqual([2, 0]);
  });
});
