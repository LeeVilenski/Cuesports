import { makeBall, simulate, type BallState } from '@cuesports/physics';
import {
  canPlaceCueBall,
  ENGLISH_POOL,
  INTERNATIONAL_RULES,
  NINE_BALL,
  shotFacts,
  SNOOKER,
  TEN_BALL,
  type Ruleset,
  type RotationState,
  type SnookerState,
} from '@cuesports/rules';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { chooseDecision, chooseShot, type AiInput } from './ai';

const nineTable = NINE_BALL.table;
const spec = nineTable.balls.object;
const position = (balls: Record<string, [number, number]>): BallState[] =>
  Object.entries(balls).map(([id, [x, y]]) =>
    makeBall(id, id === 'cue' ? nineTable.balls.cue : spec, { x, y }),
  );

const rotationState = (over: Partial<RotationState> = {}): RotationState => ({
  phase: 'play',
  shooter: 1,
  fouls: [0, 0],
  ballInHand: 'none',
  ...over,
});

function nineInput(balls: BallState[], level: number, seed: number, over: Partial<AiInput> = {}): AiInput {
  const state = rotationState();
  const turn = {
    player: 1,
    ballInHand: 'none' as const,
    targets: ['1'],
    canPushOut: false,
    mustCall: false,
    decision: null,
    isBreak: false,
    fouls: 0,
  };
  return {
    ruleset: NINE_BALL as Ruleset<unknown, unknown>,
    options: NINE_BALL.defaults,
    state,
    turn,
    balls,
    me: 1,
    level,
    seed,
    budgetMs: 400,
    ...over,
  };
}

/** Plays the AI's chosen shot for real and reports whether the 1 went in. */
function potsTheOne(level: number, seed: number): boolean {
  const balls = position({ cue: [0.3, 0.1], '1': [0.9, 0.35], '9': [-0.8, -0.3] });
  const ai = chooseShot(nineInput(balls, level, seed));
  const r = simulate(nineTable, balls, ai.shot, { sampleRate: 0 });
  return r.events.some((e) => e.type === 'pocket' && e.ball === '1');
}

describe('AI shot choice', () => {
  it('a strong AI pots a simple ball reliably; a beginner less so', () => {
    const pro = Array.from({ length: 8 }, (_, i) => potsTheOne(5, 100 + i)).filter(Boolean).length;
    const beginner = Array.from({ length: 8 }, (_, i) => potsTheOne(1, 100 + i)).filter(Boolean).length;
    expect(pro).toBeGreaterThanOrEqual(7);
    expect(pro).toBeGreaterThan(beginner);
  });

  it('is deterministic for a given seed', () => {
    const balls = position({ cue: [0.3, 0.1], '1': [0.9, 0.35], '9': [-0.8, -0.3] });
    const a = chooseShot(nineInput(balls, 4, 7));
    const b = chooseShot(nineInput(balls, 4, 7));
    expect(a.shot).toEqual(b.shot);
    expect(a.label).toBe(b.label);
  });

  it('plays a legal 9-ball break at the 1', () => {
    const { balls, state, turn } = NINE_BALL.newFrame(NINE_BALL.defaults, new Rng(3), 1);
    const ai = chooseShot({ ...nineInput(balls, 3, 2), state, turn: { ...turn, player: 1 } });
    expect(ai.label).toBe('break');
    const r = simulate(nineTable, balls, ai.shot, { sampleRate: 0 });
    expect(shotFacts(r).firstContact).toBe('1');
  });

  it('calls its shot in 10-ball', () => {
    const balls = position({ cue: [0.3, 0.1], '1': [0.9, 0.35], '10': [-0.8, -0.3] });
    const ai = chooseShot({
      ...nineInput(balls, 4, 1),
      ruleset: TEN_BALL as Ruleset<unknown, unknown>,
      turn: {
        player: 1,
        ballInHand: 'none',
        targets: ['1'],
        canPushOut: false,
        mustCall: true,
        decision: null,
        isBreak: false,
        fouls: 0,
      },
    });
    expect(ai.decl.call?.ball ?? (ai.decl.safety ? 'safety' : null)).toBeTruthy();
    if (ai.decl.call) expect(ai.decl.call.ball).toBe('1');
  });

  it('places the cue ball legally with ball in hand', () => {
    const balls = position({ cue: [0, 0], '1': [0.9, 0.35], '9': [-0.8, -0.3] });
    const ai = chooseShot({
      ...nineInput(balls, 3, 4),
      turn: {
        player: 1,
        ballInHand: 'anywhere',
        targets: ['1'],
        canPushOut: false,
        mustCall: false,
        decision: null,
        isBreak: false,
        fouls: 0,
      },
    });
    expect(ai.place).toBeDefined();
    expect(canPlaceCueBall(nineTable, balls, 'anywhere', ai.place!)).toBe(true);
  });

  it('respects its thinking budget', () => {
    const { balls, state, turn } = NINE_BALL.newFrame(NINE_BALL.defaults, new Rng(3), 1);
    const t0 = Date.now();
    chooseShot({
      ...nineInput(balls, 5, 2),
      state,
      turn: { ...turn, isBreak: false, ballInHand: 'anywhere', player: 1 },
      budgetMs: 200,
    });
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('AI in snooker', () => {
  it('breaks off from the D and hits a red', () => {
    const { balls, state, turn } = SNOOKER.newFrame(SNOOKER.defaults, new Rng(2), 1);
    const ai = chooseShot({
      ruleset: SNOOKER as Ruleset<unknown, unknown>,
      options: SNOOKER.defaults,
      state,
      turn,
      balls,
      me: 1,
      level: 4,
      seed: 3,
      budgetMs: 1500,
    });
    expect(ai.label).toBe('break off');
    expect(canPlaceCueBall(SNOOKER.table, balls, 'in-d', ai.place!)).toBe(true);
    const before = balls.map((b) => (b.id === 'cue' ? { ...b, pos: ai.place! } : b));
    const r = simulate(SNOOKER.table, before, ai.shot, { sampleRate: 0 });
    expect(shotFacts(r).firstContact).toMatch(/^red/);
  });

  it('nominates the colour it plays at', () => {
    const t = SNOOKER.table;
    const balls = [
      makeBall('cue', t.balls.cue, { x: 1.2, y: 0.2 }),
      makeBall('black', t.balls.object, { x: 1.5, y: 0.5 }),
      makeBall('pink', t.balls.object, { x: 0.9, y: 0 }),
      makeBall('red1', t.balls.object, { x: -1, y: 0.4 }),
    ];
    const state: SnookerState = {
      phase: 'play',
      shooter: 1,
      scores: [0, 1],
      break: 1,
      on: 'colour',
      freeBall: false,
      ballInHand: 'none',
      misses: [0, 0],
      respottedBlack: false,
      pending: null,
    };
    const ai = chooseShot({
      ruleset: SNOOKER as Ruleset<unknown, unknown>,
      options: SNOOKER.defaults,
      state,
      turn: {
        player: 1,
        ballInHand: 'none',
        targets: ['pink', 'black'],
        canPushOut: false,
        mustCall: false,
        mustNominate: true,
        decision: null,
        isBreak: false,
        fouls: 0,
      },
      balls,
      me: 1,
      level: 4,
      seed: 1,
      budgetMs: 600,
    });
    expect(['pink', 'black']).toContain(ai.decl.nominate);
  });
});

describe('AI decisions', () => {
  const base = (choices: string[], extra: Partial<AiInput['turn']> = {}): AiInput => ({
    ...nineInput(position({ cue: [0, 0], '1': [0.9, 0.35] }), 3, 1),
    turn: {
      player: 1,
      ballInHand: 'none',
      targets: ['1'],
      canPushOut: false,
      mustCall: false,
      isBreak: false,
      fouls: 0,
      decision: { prompt: '', choices: choices.map((id) => ({ id, label: id })) },
      ...extra,
    },
  });

  it('chooses a colour, takes the break, and plays on with a free ball', () => {
    expect(['red', 'yellow']).toContain(
      chooseDecision({
        ...base(['red', 'yellow']),
        ruleset: ENGLISH_POOL as Ruleset<unknown, unknown>,
        options: INTERNATIONAL_RULES,
      }),
    );
    expect(chooseDecision(base(['break', 'pass']))).toBe('break');
    expect(chooseDecision(base(['play', 'again', 'replace'], { freeBall: true }))).toBe('play');
  });
});

describe('AI labels', () => {
  it('names numbered balls by number and snooker/English balls by colour', () => {
    const balls = position({ cue: [0.3, 0.1], '1': [0.9, 0.35], '9': [-0.8, -0.3] });
    const ai = chooseShot(nineInput(balls, 5, 3));
    expect(ai.label).toMatch(/the 1 /);
  });
});

describe('AI spin choice', () => {
  it('does not follow in-off on a straight pot near the corner (stun or draw instead)', () => {
    // The 1 a short way from the top-right corner on the diagonal; the cue ball straight behind it.
    const balls = position({ cue: [0.82, 0.185], '1': [1.07, 0.435], '2': [-0.5, 0.2], '9': [-0.9, -0.4] });
    for (const seed of [1, 2, 3]) {
      const ai = chooseShot({ ...nineInput(balls, 5, seed), budgetMs: 3000 });
      expect(ai.label).toMatch(/pot the 1/);
      expect(ai.shot.tip.b).toBeLessThan(0.15);
    }
  });
});

describe('AI plants and kicks', () => {
  it('plays a plant when the ball on is lined up with another ball and a pocket', () => {
    // The 1 directly behind the 5, both on the line to the top-right corner.
    const balls = position({ cue: [0.2, 0.08], '1': [0.68, 0.31], '5': [0.95, 0.44], '9': [-0.8, -0.4] });
    const ai = chooseShot({ ...nineInput(balls, 4, 2), budgetMs: 3000 });
    // Either the explicit plant or a contact on the 1 that it has found pots the 5.
    expect(ai.label).toMatch(/plant the 1 into the 5|play off the 1 to pot/);
    const r = simulate(nineTable, balls, ai.shot, { sampleRate: 0 });
    expect(shotFacts(r).firstContact).toBe('1');
    expect(r.events.some((e) => e.type === 'pocket' && e.ball === '5')).toBe(true);
  });

  it('kicks off a cushion when snookered instead of running into the ball in front', () => {
    // A wall of balls between the cue ball and the 1.
    const balls = position({
      cue: [-0.8, 0],
      '1': [0.7, 0],
      '2': [0, 0],
      '3': [0, 0.058],
      '4': [0, -0.058],
      '5': [0, 0.116],
      '6': [0, -0.116],
      '9': [0.9, -0.4],
    });
    const ai = chooseShot({ ...nineInput(balls, 3, 5), budgetMs: 3000 });
    expect(ai.label).toMatch(/kick/);
    let hits = 0;
    for (const seed of [1, 2, 3]) {
      const shot = chooseShot({ ...nineInput(balls, 3, seed), budgetMs: 3000 }).shot;
      if (shotFacts(simulate(nineTable, balls, shot, { sampleRate: 0 })).firstContact === '1') hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});
