import { describe, expect, it } from 'vitest';
import { ballStakes, felt, pressureLabel, situation, stakes, sway, type PressureInput } from './pressure';
import { newPlayer, shotTuning } from './attributes';

const nine = (over: Partial<PressureInput> = {}): PressureInput => ({
  game: 'nine-ball',
  targets: ['3'],
  onTable: ['3', '5', '7', '9'],
  score: [0, 0],
  raceTo: 3,
  ...over,
});

describe('pressure balls', () => {
  it('knows the money ball in 9-ball, 10-ball and eight-ball', () => {
    expect(ballStakes(nine())).toBe(0);
    expect(ballStakes(nine({ targets: ['9'], onTable: ['9'] }))).toBe(1);
    expect(ballStakes(nine({ targets: ['8'], onTable: ['8', '9'] }))).toBe(0.5);
    expect(ballStakes(nine({ game: 'ten-ball', targets: ['10'], onTable: ['10'] }))).toBe(1);
    expect(ballStakes(nine({ game: 'english', targets: ['8'], onTable: ['8', 'r1'] }))).toBe(1);
  });

  it('knows a snooker frame ball', () => {
    const s = (me: number, them: number, remaining: number, targets: string[]): PressureInput => ({
      game: 'snooker',
      targets,
      onTable: [],
      score: [0, 0],
      raceTo: 2,
      points: [me, them],
      remaining,
    });
    // 10 ahead with the pink and black left (13): the pink makes it safe.
    expect(ballStakes(s(50, 40, 13, ['pink']))).toBe(1);
    // Already out of reach: no pressure.
    expect(ballStakes(s(60, 20, 13, ['pink']))).toBe(0);
    // Early in the frame: nothing on it.
    expect(ballStakes(s(10, 8, 120, ['red1', 'red2']))).toBe(0);
  });

  it('knows the last points of a points game', () => {
    const c = (me: number): PressureInput => ({
      game: 'three-cushion',
      targets: [],
      onTable: [],
      score: [0, 0],
      raceTo: 1,
      points: [me, 3],
      target: 10,
    });
    expect(ballStakes(c(9))).toBe(1);
    expect(ballStakes(c(8))).toBe(0.5);
    expect(ballStakes(c(2))).toBe(0);
  });

  it('is biggest on the hill and for the match', () => {
    const money = nine({ targets: ['9'], onTable: ['9'] });
    const early = situation(money);
    const hill = situation({ ...money, score: [2, 0] });
    const decider = situation({ ...money, score: [2, 2] });
    expect(early).toBeGreaterThan(0);
    expect(hill).toBeGreaterThan(early);
    expect(decider).toBe(1);
    // Hill-hill, even on an ordinary ball, is a little nervy.
    expect(situation(nine({ score: [2, 2] }))).toBeGreaterThan(0);
  });

  it('scales with the stakes, and Nerve takes most of it away', () => {
    expect(stakes(0, 2)).toBeLessThan(stakes(0, 1));
    expect(stakes(3, 1)).toBe(1);
    expect(felt(1, 1)).toBe(1);
    expect(felt(1, 99)).toBeCloseTo(0.15);
    expect(pressureLabel(0.05)).toBeNull();
    expect(pressureLabel(0.8)).toBe('Big pressure');
  });

  it('shrinks the guide and sways the aim (where you can see it)', () => {
    const p = newPlayer();
    p.ratings.vision = 50;
    const calm = shotTuning(p, 'nine-ball', 0);
    const tense = shotTuning(p, 'nine-ball', 1);
    expect(tense.vision.object).toBeLessThan(calm.vision.object * 0.6);
    expect(tense.felt).toBeGreaterThan(calm.felt);
    expect(sway(1, 0)).toBe(0);
    const swings = Array.from({ length: 50 }, (_, i) => Math.abs(sway(i * 0.1, 1)));
    expect(Math.max(...swings)).toBeLessThan((0.36 * Math.PI) / 180);
    expect(Math.max(...swings)).toBeGreaterThan(0.002);
  });
});
