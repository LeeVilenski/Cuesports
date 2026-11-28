import { simulate } from '@cuesports/physics';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH, Match } from './match';

describe('Match', () => {
  it('fills in player names and starts with the first player breaking', () => {
    const m = new Match({ ...DEFAULT_MATCH, players: ['Ann', 'Bo'] });
    expect(m.message).toBe('Rack 1: Ann to break.');
    expect(m.turn).toMatchObject({ player: 0, isBreak: true, ballInHand: 'behind-head-string' });
    expect(m.names('{p1} to play')).toBe('Bo to play');
  });

  it('plays a real simulated break through the rules', () => {
    const m = new Match(DEFAULT_MATCH, 3);
    const cue = m.balls.find((b) => b.id === 'cue')!;
    const one = m.balls.find((b) => b.id === '1')!;
    const aim = Math.atan2(one.pos.y - cue.pos.y, one.pos.x - cue.pos.x);
    const before = m.balls;
    const result = simulate(m.table, before, {
      ball: 'cue',
      aim,
      elevation: 0,
      tip: { a: 0, b: 0 },
      speed: 8,
    });
    const j = m.judge({}, before, result);
    expect(j.fouls.map((f) => f.code)).not.toContain('wrong-ball-first');
    expect(m.message.length).toBeGreaterThan(0);
    expect(m.message).not.toMatch(/\{p\d\}/);
  });

  it('scores racks, alternates the break and ends the match at the race', () => {
    const m = new Match({ ...DEFAULT_MATCH, raceTo: 2, breaks: 'alternate' });
    // Simulate rack wins by feeding the rules a golden break.
    const golden = () => {
      const before = m.balls;
      const final = before.map((b) =>
        b.id === '9' ? { ...b, state: 'pocketed' as const, pocket: 'top-right' } : b,
      );
      m.judge({}, before, {
        ids: before.map((b) => b.id),
        events: [
          { type: 'strike', t: 0, ball: 'cue', speed: 8, miscue: false },
          { type: 'ball', t: 0.1, a: 'cue', b: '1', speed: 7 },
          { type: 'pocket', t: 0.5, ball: '9', pocket: 'top-right' },
        ],
        frames: [],
        final,
        duration: 1,
        truncated: false,
      });
    };
    golden();
    expect(m.score).toEqual([1, 0]);
    expect(m.rackResult?.reason).toBe('golden break');
    expect(m.breaker).toBe(1);
    m.startRack();
    expect(m.turn.player).toBe(1);
    golden();
    expect(m.score).toEqual([1, 1]);
    m.startRack();
    golden();
    expect(m.winner).toBe(0);
  });
});

describe('Match: snooker', () => {
  it('plays a real simulated break-off through the snooker rules', () => {
    const m = new Match({ ...DEFAULT_MATCH, game: 'snooker', raceTo: 2 }, 4);
    expect(m.message).toMatch(/Frame 1: .* to break off\./);
    expect(m.turn).toMatchObject({ ballInHand: 'in-d', player: 0 });
    const cue = m.balls.find((b) => b.id === 'cue')!;
    const red = m.balls.find((b) => b.id === 'red1')!;
    // A gentle break-off: thin on the side of the reds.
    const aim = Math.atan2(red.pos.y + 0.12 - cue.pos.y, red.pos.x - cue.pos.x);
    const before = m.balls;
    const result = simulate(m.table, before, {
      ball: 'cue',
      aim,
      elevation: 0,
      tip: { a: 0, b: 0 },
      speed: 4,
    });
    m.judge({}, before, result);
    expect(m.message).not.toMatch(/\{p\d\}/);
    expect(m.framePoints).not.toBeNull();
    expect(m.framePoints!.remaining).toBeLessThanOrEqual(147);
  });

  it('concession ends the frame and alternates the break-off', () => {
    const m = new Match({ ...DEFAULT_MATCH, game: 'snooker', raceTo: 2 }, 4);
    m.concede();
    expect(m.score).toEqual([0, 1]);
    expect(m.breaker).toBe(1);
  });
});

describe('Match: English pool', () => {
  it('plays a real simulated break under International rules', () => {
    const m = new Match({ ...DEFAULT_MATCH, game: 'english' }, 6);
    expect(m.turn).toMatchObject({ isBreak: true, ballInHand: 'behind-head-string' });
    const cue = m.balls.find((b) => b.id === 'cue')!;
    const apex = m.balls.find((b) => b.id === 'r1')!;
    const before = m.balls;
    const result = simulate(m.table, before, {
      ball: 'cue',
      aim: Math.atan2(apex.pos.y - cue.pos.y, apex.pos.x - cue.pos.x),
      elevation: 0,
      tip: { a: 0, b: 0 },
      speed: 8,
    });
    m.judge({}, before, result);
    expect(m.message).not.toMatch(/\{p\d\}/);
    expect(m.turn.isBreak).toBe(m.reracked);
  });

  it('re-racks without scoring when the WEPF break is not fair', () => {
    const m = new Match({ ...DEFAULT_MATCH, game: 'english', english: 'wepf' }, 6);
    const before = m.balls;
    // A tap that barely moves the rack: not a fair break.
    m.judge({}, before, {
      ids: before.map((b) => b.id),
      events: [
        { type: 'strike', t: 0, ball: 'cue', speed: 1, miscue: false },
        { type: 'ball', t: 0.5, a: 'cue', b: 'r1', speed: 0.5 },
      ],
      frames: [],
      final: before,
      duration: 1,
      truncated: false,
    });
    expect(m.reracked).toBe(true);
    expect(m.score).toEqual([0, 0]);
    expect(m.rack).toBe(1);
    expect(m.turn).toMatchObject({ player: 1, isBreak: true });
  });
});

describe('Match snapshots', () => {
  it('picks up again from a snapshot, through JSON, at the same shot', () => {
    const m = new Match({ ...DEFAULT_MATCH, players: ['Ann', 'Bo'], raceTo: 2 }, 5);
    const cue = m.balls.find((b) => b.id === 'cue')!;
    const one = m.balls.find((b) => b.id === '1')!;
    const before = m.balls;
    const result = simulate(m.table, before, {
      ball: 'cue',
      aim: Math.atan2(one.pos.y - cue.pos.y, one.pos.x - cue.pos.x),
      elevation: 0,
      tip: { a: 0, b: 0 },
      speed: 8,
    });
    m.judge({}, before, result, { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 8 });
    const back = Match.restore(JSON.parse(JSON.stringify(m.snapshot())));
    expect(back.turn).toEqual(m.turn);
    // JSON turns −0 into 0, which is the same to the physics.
    const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;
    expect(back.balls).toEqual(json(m.balls));
    expect(back.state).toEqual(m.state);
    expect(back.record).toEqual(m.record);
    expect(back.rack).toBe(1);
    // The same rng: the next rack is racked the same way in both.
    m.concede();
    back.concede();
    m.startRack();
    back.startRack();
    expect(json(back.balls)).toEqual(json(m.balls));
    expect(back.record.racks).toHaveLength(2);
  });
});
