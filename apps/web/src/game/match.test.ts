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
