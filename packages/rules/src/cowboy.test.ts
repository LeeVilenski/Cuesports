import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { COWBOY_POOL as R, type CowboyState } from './cowboy';

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
const pot = (ball: string, t = 0.6): PhysicsEvent => ({ type: 'pocket', t, ball, pocket: 'top-right' });

const play = (over: Partial<CowboyState> = {}): { s: CowboyState; balls: BallState[] } => {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  return { s: { ...f.state, phase: 'play', inHand: false, ...over }, balls: f.balls };
};

describe('Cowboy pool', () => {
  it('sets the 1, 3 and 5 on their spots; the break must hit the 3 first', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.balls.map((b) => b.id).sort()).toEqual(['1', '3', '5', 'cue']);
    expect(f.turn.targets).toEqual(['3']);
    const j = R.judge(f.state, {}, f.balls, shot(f.balls, [hit('1')]), R.defaults);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['break', 'again']);
    expect(j.turn.player).toBe(1);
  });

  it('scores caroms and pots, and puts potted balls back on their spots', () => {
    const { s, balls } = play();
    const j = R.judge(s, {}, balls, shot(balls, [hit('3'), hit('5', 0.3), pot('5')]), R.defaults);
    expect(j.points).toEqual([6, 0]);
    expect(j.balls.find((b) => b.id === '5')!.state).toBe('stationary');
    const all = R.judge(
      s,
      {},
      balls,
      shot(balls, [hit('1'), hit('3', 0.2), hit('5', 0.3), pot('1'), pot('3'), pot('5')]),
      R.defaults,
    );
    expect(all.points).toEqual([11, 0]);
  });

  it('must reach 90 exactly, and loses the inning on a foul', () => {
    const { s, balls } = play({ scores: [89, 0], inning: 9 });
    const j = R.judge(s, {}, balls, shot(balls, [hit('3'), pot('3')]), R.defaults);
    expect(j.fouls.length).toBe(1);
    expect(j.points).toEqual([80, 0]);
  });

  it('counts only caroms from 90', () => {
    const { s, balls } = play({ scores: [92, 0] });
    const j = R.judge(s, {}, balls, shot(balls, [hit('3'), hit('5', 0.2), pot('5')]), R.defaults);
    expect(j.points).toEqual([93, 0]);
  });

  it('wins at 100 only by going in off the 1', () => {
    const { s, balls } = play({ scores: [100, 40] });
    const off3 = R.judge(s, {}, balls, shot(balls, [hit('3'), pot('cue')]), R.defaults);
    expect(off3.frame).toBeNull();
    expect(off3.fouls[0]?.code).toBe('scratch');
    const off1 = R.judge(s, {}, balls, shot(balls, [hit('1'), pot('cue')]), R.defaults);
    expect(off1.frame?.winner).toBe(0);
  });
});
