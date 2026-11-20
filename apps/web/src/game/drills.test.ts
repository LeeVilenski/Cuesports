import type { BallState, ShotResult } from '@cuesports/physics';
import { describe, expect, it } from 'vitest';
import { DRILLS } from './drills';
import { DEFAULT_MATCH, Match } from './match';

const drill = (id: 'lineup' | 'ghost') =>
  new Match({
    ...DEFAULT_MATCH,
    game: DRILLS[id].game,
    raceTo: DRILLS[id].raceTo,
    players: ['Ann', DRILLS[id].opponent],
    drill: id,
  });

/** A shot result where the cue ball hits `first` and the balls in `pot` drop. */
function result(before: BallState[], first: string, pot: string[] = []): ShotResult {
  const final = before.map((b) =>
    pot.includes(b.id) ? { ...b, state: 'pocketed' as const, pocket: 'top-right' } : { ...b },
  );
  return {
    ids: before.map((b) => b.id),
    events: [
      { type: 'strike', t: 0, ball: 'cue', speed: 3, miscue: false },
      { type: 'ball', t: 0.1, a: 'cue', b: first, speed: 2 },
      // A rail after contact, so a safe shot is legal.
      { type: 'cushion', t: 0.3, ball: first, segment: 'top', kind: 'rail', speed: 1 },
      ...pot.map((id) => ({ type: 'pocket' as const, t: 0.5, ball: id, pocket: 'top-right' })),
    ],
    frames: [],
    final,
    duration: 1,
    truncated: false,
  };
}

describe('snooker line-up', () => {
  it('lines the reds up down the middle, clear of each other and the colours', () => {
    const m = drill('lineup');
    const reds = m.balls.filter((b) => b.id.startsWith('red'));
    expect(reds).toHaveLength(15);
    expect(reds.every((b) => b.pos.y === 0)).toBe(true);
    const on = m.balls.filter((b) => b.id !== 'cue');
    for (const a of on)
      for (const b of on)
        if (a !== b) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThan(2 * a.radius);
    expect(m.turn).toMatchObject({ player: 0, ballInHand: 'in-d' });
  });

  it('keeps going while you pot and ends at the first miss', () => {
    const m = drill('lineup');
    const b1 = m.balls;
    m.judge({}, b1, result(b1, 'red1', ['red1']));
    expect(m.turn.player).toBe(0);
    expect(m.rackResult).toBeNull();
    const b2 = m.balls;
    m.judge({ nominate: 'black' }, b2, result(b2, 'black'));
    expect(m.rackResult).toMatchObject({ reason: 'missed' });
    expect(m.framePoints!.points[0]).toBe(1);
    expect(m.winner).not.toBeNull();
  });
});

describe('9-ball ghost', () => {
  it('gives ball in hand after the break, even when it pots nothing', () => {
    const m = drill('ghost');
    const b = m.balls;
    m.judge({}, b, result(b, '1'));
    expect(m.turn).toMatchObject({ player: 0, ballInHand: 'anywhere', isBreak: false, canPushOut: false });
    expect(m.rackResult).toBeNull();
  });

  it('gives the rack to the ghost on a miss, and the player breaks again', () => {
    const m = drill('ghost');
    const b = m.balls;
    m.judge({}, b, result(b, '1'));
    const after = m.balls;
    m.judge({}, after, result(after, '1'));
    expect(m.rackResult).toMatchObject({ winner: 1, reason: 'missed' });
    expect(m.score).toEqual([0, 1]);
    m.startRack();
    expect(m.turn.player).toBe(0);
  });

  it('wins the rack on the 9', () => {
    const m = drill('ghost');
    const b = m.balls;
    m.judge({}, b, result(b, '1'));
    const after = m.balls;
    m.judge({}, after, result(after, '1', ['9']));
    expect(m.rackResult).toMatchObject({ winner: 0 });
  });
});
