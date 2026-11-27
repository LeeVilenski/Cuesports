import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { RUSSIAN_PYRAMID as R, type PyramidState } from './pyramid';

function shot(before: BallState[], events: PhysicsEvent[]): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket' && e.type !== 'off-table') continue;
    const b = final.find((x) => x.id === e.ball)!;
    b.state = 'pocketed';
    if (e.type === 'pocket') b.pocket = e.pocket;
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const hit = (b: string, t = 0.1, a = 'pcue'): PhysicsEvent => ({ type: 'ball', t, a, b, speed: 3 });
const strike = (ball: string): PhysicsEvent => ({ type: 'strike', t: 0, ball, speed: 3, miscue: false });
const NEVA = { ...R.defaults, free: false };
const pot = (ball: string, t = 0.6): PhysicsEvent => ({ type: 'pocket', t, ball, pocket: 'top-right' });
const rail = (ball: string, t = 0.5): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});

function start(): { s: PyramidState; balls: BallState[] } {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, opening: false, inHand: false }, balls: f.balls };
}

describe('Russian Pyramid', () => {
  it('racks fifteen balls and breaks from behind the head string with the coloured ball', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.balls).toHaveLength(16);
    expect(f.turn.cueBall).toBe('pcue');
    expect(f.turn.ballInHand).toBe('behind-head-string');
  });

  it('scores every ball potted and keeps the turn', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), pot('p1'), pot('p5', 0.7)]), R.defaults);
    expect(j.points).toEqual([2, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('scores an in-off and gives the cue ball in hand', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), pot('pcue')]), R.defaults);
    expect(j.points).toEqual([1, 0]);
    expect(j.turn.ballInHand).toBe('behind-head-string');
  });

  it('passes the turn after a safe shot that reaches a cushion', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), rail('p1')]), R.defaults);
    expect(j.fouls).toEqual([]);
    expect(j.turn.player).toBe(1);
  });

  it('Neva rules: takes a point for a foul and spots balls potted on it', () => {
    const { s, balls } = start();
    const miss = R.judge(s, {}, balls, shot(balls, []), NEVA);
    expect(miss.points).toEqual([-1, 0]);
    const noRail = R.judge(s, {}, balls, shot(balls, [hit('p1')]), NEVA);
    expect(noRail.fouls[0]?.code).toBe('no-rail');
    const potOnFoul = R.judge(s, {}, balls, shot(balls, [pot('p3')]), NEVA);
    expect(potOnFoul.balls.find((b) => b.id === 'p3')?.state).not.toBe('pocketed');
  });

  it('Neva rules: only the coloured ball is the cue ball', () => {
    const { s, balls } = start();
    expect(R.decide(s, '', balls, NEVA).turn.cueBallChoices).toBeUndefined();
    const j = R.judge(s, {}, balls, shot(balls, [strike('p4'), hit('p1', 0.1, 'p4'), pot('p1')]), NEVA);
    expect(j.fouls[0]?.code).toBe('wrong-cue-ball');
  });

  it('Neva rules: an in-off brings the coloured ball back in hand', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), pot('pcue')]), NEVA);
    expect(j.turn.cueBall).toBe('pcue');
    expect(j.potted).toEqual([]);
  });
});

describe('Free pyramid', () => {
  it('breaks with the coloured ball, then any ball may be the cue ball', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.turn.cueBall).toBe('pcue');
    expect(f.turn.cueBallChoices).toBeUndefined();
    const breakOff = R.judge(
      f.state,
      {},
      f.balls,
      shot(f.balls, [strike('p4'), hit('p1', 0.1, 'p4')]),
      R.defaults,
    );
    expect(breakOff.fouls[0]?.code).toBe('wrong-cue-ball');
    const { s, balls } = start();
    expect(R.decide(s, '', balls, R.defaults).turn.cueBallChoices).toHaveLength(16);
  });

  it('scores with a white ball as the cue ball and suggests it again', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [strike('p4'), hit('p1', 0.1, 'p4'), pot('p1')]), R.defaults);
    expect(j.fouls).toEqual([]);
    expect(j.points).toEqual([1, 0]);
    expect(j.turn.player).toBe(0);
    expect(j.turn.cueBall).toBe('p4');
    expect(j.turn.cueBallChoices).not.toContain('p1');
  });

  it('counts an in-off, keeps the ball down and gives ball in hand with any ball', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [strike('p4'), hit('p1', 0.1, 'p4'), pot('p4')]), R.defaults);
    expect(j.points).toEqual([1, 0]);
    expect(j.potted).toEqual(['p4']);
    expect(j.balls.find((b) => b.id === 'p4')?.state).toBe('pocketed');
    expect(j.turn.ballInHand).toBe('behind-head-string');
    expect(j.turn.cueBallChoices).not.toContain('p4');
    expect(j.turn.cueBall).toBe('pcue');
  });

  it('a foul costs no point but gives the opponent ball in hand, and spots what went down', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [strike('p4'), pot('p4')]), R.defaults);
    expect(j.fouls[0]?.code).toBe('no-contact');
    expect(j.points).toEqual([0, 0]);
    expect(j.turn.player).toBe(1);
    expect(j.turn.ballInHand).toBe('behind-head-string');
    expect(j.balls.find((b) => b.id === 'p4')?.state).not.toBe('pocketed');
  });

  it('knocking the cue ball off the table is a foul, not an in-off', () => {
    const { s, balls } = start();
    const off: PhysicsEvent = { type: 'off-table', t: 0.5, ball: 'pcue' };
    const j = R.judge(s, {}, balls, shot(balls, [hit('p1'), off]), R.defaults);
    expect(j.fouls[0]?.code).toBe('off-table');
  });

  it('wins at 8', () => {
    const { s, balls } = start();
    const j = R.judge({ ...s, scores: [7, 3] }, {}, balls, shot(balls, [hit('p1'), pot('p1')]), R.defaults);
    expect(j.frame?.winner).toBe(0);
  });
});
