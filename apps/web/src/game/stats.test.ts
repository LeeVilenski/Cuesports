import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH } from './match';
import type { MatchRecord, ShotRecord } from './record';
import { knownPlayers, percent, playerStats } from './stats';

const shot = (player: number, o: Partial<ShotRecord> = {}): ShotRecord => ({
  player,
  before: [
    ['cue', 0, 0],
    ['1', 0.3, 0],
  ],
  shot: { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 2 },
  decl: {},
  firstHit: '1',
  potted: [],
  fouls: [],
  scored: 0,
  isBreak: false,
  ...o,
});
const pot = (player: number, o: Partial<ShotRecord> = {}) => shot(player, { potted: ['1'], scored: 1, ...o });

const match = (o: Partial<MatchRecord>): MatchRecord => ({
  id: 'm',
  date: 0,
  config: { ...DEFAULT_MATCH, players: ['Ann', 'Bo'] },
  cloth: 'medium',
  specs: {},
  racks: [],
  score: [0, 0],
  winner: null,
  ...o,
});

describe('playerStats', () => {
  it('counts pots, fouls, safeties, racks and the match', () => {
    const m = match({
      winner: 0,
      racks: [
        {
          breaker: 0,
          winner: 0,
          reason: '9 potted',
          shots: [
            shot(0, { isBreak: true }),
            shot(1), // safety by Bo...
            shot(0, { fouls: ['no-rail'] }), // ...which works: Ann fouls.
            pot(1),
            shot(1), // safety by Bo, answered with a pot.
            pot(0),
            pot(0),
          ],
        },
      ],
    });
    const ann = playerStats([m], { player: 'ann' });
    expect(ann).toMatchObject({ matches: 1, matchesWon: 1, racks: 1, racksWon: 1, shots: 4, fouls: 1 });
    expect(ann).toMatchObject({ potAttempts: 3, pots: 2, highestBreak: 2, runOuts: 1, breakAndRuns: 0 });
    const bo = playerStats([m], { player: 'Bo' });
    expect(bo).toMatchObject({ safeties: 2, safetiesWon: 1, highestBreak: 1, matchesWon: 0 });
  });

  it('spots a break-and-run and long pots', () => {
    const long = pot(0, {
      before: [
        ['cue', -1, 0],
        ['1', 0.4, 0],
      ],
    });
    const m = match({
      racks: [{ breaker: 0, winner: 0, reason: '', shots: [pot(0, { isBreak: true }), long, pot(0)] }],
    });
    const s = playerStats([m], { player: 'Ann' });
    expect(s).toMatchObject({ breakAndRuns: 1, runOuts: 0, longAttempts: 1, longPots: 1, potAttempts: 2 });
    // The match isn't finished, so it isn't counted as played.
    expect(s.matches).toBe(0);
  });

  it('counts snooker centuries and filters by game', () => {
    const shots = Array.from({ length: 15 }, () => pot(0, { scored: 8 }));
    const m = match({
      config: { ...DEFAULT_MATCH, game: 'snooker', players: ['Ann', 'Bo'] },
      racks: [{ breaker: 0, winner: null, reason: '', shots }],
    });
    expect(playerStats([m], { player: 'Ann' })).toMatchObject({ highestBreak: 120, centuries: 1 });
    expect(playerStats([m], { player: 'Ann', game: 'nine-ball' }).shots).toBe(0);
  });

  it('lists human players, most matches first', () => {
    const vsCpu = match({ config: { ...DEFAULT_MATCH, ai: 3, players: ['Bo', 'CPU (Club)'] } });
    expect(knownPlayers([match({}), vsCpu])).toEqual(['Bo', 'Ann']);
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('–');
  });
});

describe('visitWord', () => {
  it('says run for American pool and break elsewhere', async () => {
    const { visitWord } = await import('./games');
    expect(['nine-ball', 'ten-ball', 'eight-ball'].map(visitWord)).toEqual(['run', 'run', 'run']);
    expect(['english', 'snooker'].map(visitWord)).toEqual(['break', 'break']);
  });
});
