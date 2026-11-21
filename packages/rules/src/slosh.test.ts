import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { SLOSH as R, type SloshState } from './slosh';

function shot(before: BallState[], events: PhysicsEvent[]): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    if (e.type !== 'pocket') continue;
    const b = final.find((x) => x.id === e.ball)!;
    b.state = 'pocketed';
    b.pocket = e.pocket;
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 3 });
const pot = (ball: string, pocket: string): PhysicsEvent => ({ type: 'pocket', t: 0.6, ball, pocket });
const play = (over: Partial<SloshState> = {}) => {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, opening: false, inHand: false, ...over }, balls: f.balls };
};

describe('Slosh', () => {
  it('opens from the D at the black', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.turn.ballInHand).toBe('in-d');
    expect(f.turn.targets).toEqual(['pink', 'black']);
    expect(f.balls).toHaveLength(7);
  });

  it('scores a colour in one of its own pockets, and spots it again', () => {
    const { s, balls } = play();
    const j = R.judge(s, {}, balls, shot(balls, [hit('black'), pot('black', 'top-right')]), R.defaults);
    expect(j.points).toEqual([7, 0]);
    expect(j.turn.player).toBe(0);
    expect(j.balls.find((b) => b.id === 'black')!.state).toBe('stationary');
  });

  it('takes the value off the striker for a colour in the wrong pocket', () => {
    const { s, balls } = play({ scores: [20, 0] });
    const j = R.judge(s, {}, balls, shot(balls, [hit('blue'), pot('blue', 'top-right')]), R.defaults);
    expect(j.points).toEqual([15, 0]);
    expect(j.turn.player).toBe(1);
  });

  it('scores 2 for a cannon and costs 2 for an in-off', () => {
    const { s, balls } = play({ scores: [10, 0] });
    const c = R.judge(s, {}, balls, shot(balls, [hit('pink'), hit('black', 0.3)]), R.defaults);
    expect(c.points).toEqual([12, 0]);
    const off = R.judge(s, {}, balls, shot(balls, [hit('pink'), pot('cue', 'top-left')]), R.defaults);
    expect(off.points).toEqual([8, 0]);
    expect(off.turn.ballInHand).toBe('in-d');
  });

  it('wins on exactly 100, and drops back to 50 for going past', () => {
    const { s, balls } = play({ scores: [95, 0] });
    const win = R.judge(s, {}, balls, shot(balls, [hit('blue'), pot('blue', 'top-side')]), R.defaults);
    expect(win.frame?.winner).toBe(0);
    const over = R.judge(s, {}, balls, shot(balls, [hit('black'), pot('black', 'top-right')]), R.defaults);
    expect(over.points).toEqual([50, 0]);
    expect(over.frame).toBeNull();
    expect(over.turn.player).toBe(0);
  });
});

describe('Slosh opening', () => {
  it('has a clear line from the starting cue ball to the pink', async () => {
    const { simulate } = await import('@cuesports/physics');
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    const c = f.balls.find((b) => b.id === 'cue')!.pos;
    const k = f.balls.find((b) => b.id === 'pink')!.pos;
    for (const speed of [2, 4, 6]) {
      const r = simulate(
        R.table,
        f.balls,
        { ball: 'cue', aim: Math.atan2(k.y - c.y, k.x - c.x), elevation: 0, tip: { a: 0, b: 0 }, speed },
        { sampleRate: 0 },
      );
      const first = r.events.find((e) => e.type === 'ball');
      expect(first && first.type === 'ball' ? [first.a, first.b] : []).toContain('pink');
    }
  });
});

describe('Slosh opening rule', () => {
  it('fouls an opening that hits a baulk colour or the blue first', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    const bad = R.judge(f.state, {}, f.balls, shot(f.balls, [hit('blue')]), R.defaults);
    expect(bad.fouls[0]?.code).toBe('wrong-ball-first');
    const ok = R.judge(f.state, {}, f.balls, shot(f.balls, [hit('pink')]), R.defaults);
    expect(ok.fouls).toEqual([]);
  });
});
