import { simulate, type ShotInput } from '@cuesports/physics';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH, Match } from './match';
import { compactBalls, expandBalls } from './record';
import { MAX_MATCHES, MemoryStore } from './store';

const breakShot = (m: Match): ShotInput => {
  const cue = m.balls.find((b) => b.id === 'cue')!;
  const one = m.balls.find((b) => b.id === '1')!;
  return {
    ball: 'cue',
    aim: Math.atan2(one.pos.y - cue.pos.y, one.pos.x - cue.pos.x),
    elevation: 0,
    tip: { a: 0, b: 0 },
    speed: 8,
  };
};

describe('match records', () => {
  it('records each judged shot with the stroke and the result', () => {
    const m = new Match(DEFAULT_MATCH, 3, 'fast', 1000);
    const before = m.balls;
    const shot = breakShot(m);
    const result = simulate(m.table, before, shot);
    m.judge({}, before, result, shot);
    expect(m.record).toMatchObject({ date: 1000, cloth: 'fast', racks: [{ breaker: 0 }] });
    const s = m.record.racks[0]!.shots[0]!;
    expect(s).toMatchObject({ player: 0, isBreak: true, firstHit: '1', shot });
    expect(s.before).toHaveLength(10);
    expect(Object.keys(m.record.specs)).toHaveLength(10);
  });

  it('leaves the record alone when no stroke is given (AI look-ahead)', () => {
    const m = new Match(DEFAULT_MATCH, 3);
    const shot = breakShot(m);
    m.judge({}, m.balls, simulate(m.table, m.balls, shot));
    expect(m.record.racks[0]!.shots).toHaveLength(0);
  });

  it('replays a shot exactly from the compact record', () => {
    const m = new Match(DEFAULT_MATCH, 7);
    const shot = breakShot(m);
    const original = simulate(m.table, m.balls, shot);
    const again = simulate(m.table, expandBalls(compactBalls(m.balls), { ...m.record.specs }), shot);
    const pos = (r: typeof original) => r.final.map((b) => [b.id, b.pos.x, b.pos.y, b.state]);
    expect(pos(again)).toEqual(pos(original));
    expect(again.events.length).toBe(original.events.length);
  });

  it('survives a JSON round trip unchanged', () => {
    const m = new Match(DEFAULT_MATCH, 3);
    const shot = breakShot(m);
    m.judge({}, m.balls, simulate(m.table, m.balls, shot), shot);
    expect(JSON.parse(JSON.stringify(m.record))).toEqual(m.record);
  });

  it('marks rack winners and the match winner', () => {
    const m = new Match({ ...DEFAULT_MATCH, raceTo: 1 });
    m.concede();
    expect(m.record.racks[0]).toMatchObject({ winner: 1, reason: 'conceded' });
    expect(m.record).toMatchObject({ winner: 1, score: [0, 1] });
  });
});

describe('MemoryStore', () => {
  it('keeps the newest matches only', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < MAX_MATCHES + 5; i++)
      await store.putMatch(new Match(DEFAULT_MATCH, 1, 'medium', i).record);
    const all = await store.matches();
    expect(all).toHaveLength(MAX_MATCHES);
    expect(all[0]!.date).toBe(MAX_MATCHES + 4);
  });
});
