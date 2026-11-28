import { describe, expect, it } from 'vitest';
import { makeBall } from '@cuesports/physics';
import { AMERICAN_POOL_9FT } from '@cuesports/shared';
import {
  addLevelXp,
  addXp,
  applyTuning,
  ATTRS,
  ceilingFor,
  effective,
  FULL_ELEVATION,
  FULL_TIP,
  levelCost,
  migratedPlayer,
  newPlayer,
  playedGame,
  pointCost,
  rust,
  shotTuning,
  shotXp,
  spendPoint,
  START,
  trainingXp,
  TRAINING,
  visionTuning,
  type CareerPlayer,
} from './attributes';
import { CHALLENGES } from './challenges';
import { careerShape, computeGuide, cueAfterContact, travel } from './guide';
import { enterEvent, gainsText, playMatch, spend, train } from './agent';
import { careerEvent, newCareer, parseCareer } from './career';
import type { ShotRecord } from './record';

const maxed = (): CareerPlayer => {
  const p = newPlayer();
  for (const { id } of ATTRS) p.ratings[id] = 99;
  p.familiarity['nine-ball'] = 100;
  return p;
};

describe('ratings and XP', () => {
  it('raises a rating when its XP passes the cost, each point costing more', () => {
    expect(pointCost(30)).toBeGreaterThan(pointCost(10));
    const { player, ups } = addXp(newPlayer(), { vision: pointCost(1) + pointCost(2) }, 40);
    expect(player.ratings.vision).toBe(3);
    expect(ups).toEqual([{ attr: 'vision', from: 1, to: 3 }]);
  });

  it('stops at the ceiling', () => {
    expect([0, 1, 2, 3].map(ceilingFor)).toEqual([40, 60, 80, 99]);
    const { player } = addXp(newPlayer(), { cueing: 1e6 }, 40);
    expect(player.ratings.cueing).toBe(40);
    // Raising the ceiling lets the waiting XP through (at most one point's worth).
    expect(addXp(player, { cueing: 1 }, 60).player.ratings.cueing).toBe(41);
  });

  it('levels up into skill points, and spends them up to the ceiling', () => {
    const { player, levels } = addLevelXp(newPlayer(), levelCost(1) + levelCost(2));
    expect(levels).toBe(2);
    expect(player.points).toBe(2);
    const spent = spendPoint(player, 'spin', 40);
    expect(spent.ratings.spin).toBe(START.spin + 1);
    expect(spent.points).toBe(1);
    const capped = { ...player, ratings: { ...player.ratings, spin: 40 } };
    expect(spendPoint(capped, 'spin', 40)).toBe(capped);
  });

  it('builds familiarity by playing, and loses a little elsewhere', () => {
    let p = newPlayer();
    for (let i = 0; i < 10; i++) p = playedGame(p, 'snooker');
    expect(p.familiarity.snooker).toBeGreaterThan(55);
    expect(p.familiarity.snooker).toBeLessThan(80);
    expect(effective(p, 'snooker').cueing).toBeGreaterThan(effective(p, 'nine-ball').cueing);
    p = rust(playedGame(p, 'nine-ball'), 'snooker');
    expect(p.familiarity['nine-ball']).toBe(9);
  });

  it('migrates an old career to ratings for the tier it reached', () => {
    expect(migratedPlayer(0).ratings).toEqual(START);
    expect(migratedPlayer(2).ratings.cueing).toBe(START.cueing + 24);
    const old = parseCareer(JSON.stringify({ best: { 'lion-9ball': 2 }, unlocked: [], h2h: {}, run: null }));
    expect(old.player.ratings.cueing).toBe(START.cueing + 12);
  });
});

describe('the shot', () => {
  it('starts with no lines after contact, and grows them with Vision', () => {
    expect(visionTuning(1)).toEqual({ object: 0, cue: 0, spinAware: false, rebound: false });
    // It starts growing almost at once, a little at a time.
    expect(visionTuning(4).object).toBeGreaterThan(0);
    expect(visionTuning(4).object).toBeLessThan(visionTuning(8).object);
    const v20 = visionTuning(20);
    expect(v20.object).toBeGreaterThan(0);
    expect(v20.cue).toBe(0);
    expect(visionTuning(45).cue).toBeGreaterThan(0);
    expect(visionTuning(65).spinAware).toBe(true);
    expect(visionTuning(90).rebound).toBe(true);
  });

  it('plays like the normal game at 99', () => {
    const t = shotTuning(maxed(), 'nine-ball');
    expect(t.maxPower).toBeCloseTo(1);
    expect(t.squirt).toBeCloseTo(1);
    expect(t.maxTip).toBeCloseTo(FULL_TIP);
    expect(t.maxElevation).toBe(FULL_ELEVATION);
    const s = { ball: 'cue', aim: 0.3, elevation: 0.1, tip: { a: 0.1, b: -0.2 }, speed: 2 };
    expect(applyTuning(s, t)).toEqual(s);
  });

  it('limits a starting player, but never moves the aim', () => {
    const t = shotTuning(newPlayer(), 'nine-ball');
    expect(t.maxTip).toBeLessThan(0.3);
    // Elevation is free: Cushion craft sets the lines on those shots instead.
    expect(t.maxElevation).toBe(FULL_ELEVATION);
    expect(t.maxPower).toBeLessThan(0.7);
    expect(t.squirt).toBeLessThan(0.2);
    const s = { ball: 'cue', aim: 0.7, elevation: 0.6, tip: { a: 0, b: -0.5 }, speed: 2 };
    const o = applyTuning(s, t);
    expect(o.aim).toBe(s.aim);
    expect(o.speed).toBe(s.speed);
    expect(Math.abs(o.tip.b)).toBeCloseTo(t.maxTip);
    expect(o.elevation).toBe(s.elevation);
  });
});

describe('hard shots', () => {
  it('start with no lines after contact, whatever your Vision, until their own skill grows', () => {
    const p = newPlayer();
    p.ratings.vision = 70;
    const none = { object: 0, cue: 0, spinAware: false, rebound: false };
    expect(shotTuning(p, 'snooker', { rest: true }).vision).toEqual(none);
    expect(shotTuning(p, 'snooker', { rest: true }).lines).toBe('rest');
    expect(shotTuning(p, 'snooker', { cushion: true }).lines).toBe('cushion');
    expect(shotTuning(p, 'snooker', { cushion: true }).vision).toEqual(none);
    p.ratings.rest = 40;
    p.ratings.cushion = 20;
    const t = shotTuning(p, 'snooker', { rest: true, cushion: true });
    // The weaker of the two sets them.
    expect(t.lines).toBe('cushion');
    expect(t.vision.object).toBeGreaterThan(0);
    expect(t.vision.object).toBeLessThan(shotTuning(p, 'snooker').vision.object);
    // Never better than your Vision.
    p.ratings.rest = 99;
    expect(shotTuning(p, 'snooker', { rest: true }).lines).toBe('vision');
  });

  it('gives an old save the new skill at its start', () => {
    const old = parseCareer(
      JSON.stringify({
        player: {
          ...newPlayer(),
          ratings: { vision: 30, nerve: 20, cueing: 30, spin: 20, cushion: 20, touch: 30 },
        },
      }),
    );
    expect(old.player.ratings.rest).toBe(1);
    expect(old.player.xp.rest).toBe(0);
    expect(old.player.ratings.vision).toBe(30);
  });
});

describe('the career guide', () => {
  const table = AMERICAN_POOL_9FT;
  const R = table.balls.object.radius;
  const balls = [
    makeBall('cue', table.balls.cue, { x: -0.5, y: 0 }),
    makeBall('1', table.balls.object, { x: 0, y: 0.03 }),
  ];
  const g = computeGuide(table, balls, 'cue', 0)!;

  it('shows nothing after contact at Vision 1', () => {
    expect(careerShape(table, g, visionTuning(1), 0, 2)).toEqual({ object: [], cue: [] });
  });

  it('follows, stuns and screws the cue ball after a nearly full hit', () => {
    const d = { x: 1, y: 0 };
    const o = { x: 1, y: 0 };
    expect(cueAfterContact(d, o, 0.4, 2, 0.01).dir.x).toBeGreaterThan(0.9);
    expect(cueAfterContact(d, o, -0.4, 2, 0.01).dir.x).toBeLessThan(-0.9);
    expect(cueAfterContact(d, o, 0, 2, 0.01).strength).toBeLessThan(0.05);
    // Screw wears off over a long way at a gentle pace: it rolls through instead.
    expect(cueAfterContact(d, o, -0.4, 0.5, 2).dir.x).toBeGreaterThan(0);
  });

  it('bounces off one cushion when Vision is high enough', () => {
    const pts = travel(table, { x: 0, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 3, R, true);
    expect(pts.length).toBe(3);
    expect(travel(table, { x: 0, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, 3, R, false).length).toBe(2);
    const shape = careerShape(table, g, visionTuning(90), 0.3, 2);
    expect(shape.object.length).toBeGreaterThanOrEqual(2);
    expect(shape.cue.length).toBeGreaterThanOrEqual(2);
  });
});

describe('XP from play', () => {
  const rec = (over: Partial<ShotRecord>): ShotRecord => ({
    player: 0,
    before: [
      ['cue', -1, 0],
      ['1', 0.5, 0],
    ],
    shot: { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 2 },
    decl: {},
    firstHit: '1',
    potted: [],
    fouls: [],
    scored: 0,
    isBreak: false,
    ...over,
  });

  it('rewards pots, long pots and spin', () => {
    const xp = shotXp(
      rec({ potted: ['1'], shot: { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: -0.4 }, speed: 2 } }),
      [],
    );
    expect(xp.vision).toBe(2);
    expect(xp.cueing).toBe(4);
    expect(xp.spin).toBe(3);
  });

  it('rewards banks and kicks, and nothing for a foul', () => {
    const events = [
      { type: 'cushion', t: 0.2, ball: 'cue', segment: 'a', kind: 'rail', speed: 1 },
      { type: 'ball', t: 0.5, a: 'cue', b: '1', speed: 1 },
      { type: 'cushion', t: 0.8, ball: '1', segment: 'b', kind: 'rail', speed: 1 },
      { type: 'pocket', t: 1.2, ball: '1', pocket: 'p' },
    ] as const;
    const xp = shotXp(rec({ potted: ['1'] }), events as never);
    expect(xp.cushion).toBe(9);
    expect(shotXp(rec({ potted: ['1'], fouls: ['x'] }), events as never)).toEqual({});
  });

  it('feeds the career: XP, familiarity, a level, and a training session after the event', () => {
    let s = enterEvent(newCareer(), careerEvent('lion-9ball')!, 1);
    s = { ...s, trainingReady: false };
    s = playMatch(s, true, 2, undefined, { xp: { vision: 40 }, deciders: 1 });
    expect(s.player.ratings.vision).toBeGreaterThan(1);
    expect(s.player.familiarity['nine-ball']).toBeGreaterThan(0);
    expect(gainsText(s.lastGains)).toMatch(/Vision 1 → /);
    expect(s.trainingReady).toBe(false);
    s = playMatch(s, true, 3, undefined, { xp: {}, deciders: 0 });
    expect(s.run?.status).toBe('won');
    expect(s.trainingReady).toBe(true);
    expect(s.player.level).toBeGreaterThan(1);
    // The pub title opens the clubs and raises the ceiling.
    expect(s.inbox.some((m) => m.id === 'ceiling-1')).toBe(true);
    const spent = spend(s, 'touch');
    expect(spent.player.ratings.touch).toBe(s.player.ratings.touch + 1);
  });

  it('trains on the challenges', () => {
    for (const t of TRAINING) expect(CHALLENGES.some((c) => c.id === t.id)).toBe(true);
    const t = TRAINING.find((x) => x.id === 'bank')!;
    expect(trainingXp(t, 3).cushion).toBeGreaterThan(trainingXp(t, 0).cushion!);
    const s = train(newCareer(), t, 3);
    expect(s.trainingReady).toBe(false);
    expect(s.player.xp.cushion + s.player.ratings.cushion).toBeGreaterThan(START.cushion);
  });
});
