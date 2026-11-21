import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { billiardSpot, ENGLISH_BILLIARDS as R, type BilliardsState } from './billiards';
import { spotOf } from './placement';

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
const hit = (a: string, b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a, b, speed: 3 });
const pot = (ball: string, t = 0.6): PhysicsEvent => ({ type: 'pocket', t, ball, pocket: 'top-right' });
const rail = (ball: string, t = 0.05): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});

/** A frame with player 0's ball placed in the D and the spot white on the table up the other end. */
function start(): { s: BilliardsState; balls: BallState[] } {
  const f = R.newFrame(R.defaults, new Rng(1), 0);
  const balls = f.balls.map(cloneBall);
  const d = spotOf(R.table, 'brown')!;
  for (const b of balls) {
    if (b.id === 'cue') Object.assign(b, { state: 'stationary', pos: { x: d.x, y: 0.1 } });
    if (b.id === 'spot') Object.assign(b, { state: 'stationary', pos: { x: 0.5, y: 0.4 } });
  }
  return { s: { ...f.state, inHand: false }, balls };
}

describe('English Billiards', () => {
  it('starts with the red on the billiard spot and the breaker in hand', () => {
    const f = R.newFrame(R.defaults, new Rng(1), 0);
    expect(f.balls.find((b) => b.id === 'red')!.pos).toEqual(billiardSpot());
    expect(f.turn.ballInHand).toBe('in-d');
    expect(f.turn.cueBall).toBe('cue');
  });

  it('scores a cannon 2 and keeps the turn', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('cue', 'red'), hit('cue', 'spot', 0.4)]), R.defaults);
    expect(j.points).toEqual([2, 0]);
    expect(j.turn.player).toBe(0);
  });

  it('pots the red for 3 and spots it again', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('cue', 'red'), pot('red')]), R.defaults);
    expect(j.points).toEqual([3, 0]);
    const red = j.balls.find((b) => b.id === 'red')!;
    expect(red.state).toBe('stationary');
  });

  it('scores an in-off by the ball hit first, and puts the cue ball in hand', () => {
    const { s, balls } = start();
    const offRed = R.judge(s, {}, balls, shot(balls, [hit('cue', 'red'), pot('cue')]), R.defaults);
    expect(offRed.points).toEqual([3, 0]);
    expect(offRed.turn.ballInHand).toBe('in-d');
    const offWhite = R.judge(s, {}, balls, shot(balls, [hit('cue', 'spot'), pot('cue')]), R.defaults);
    expect(offWhite.points).toEqual([2, 0]);
  });

  it('adds up a cannon and a pot in one stroke', () => {
    const { s, balls } = start();
    const j = R.judge(
      s,
      {},
      balls,
      shot(balls, [hit('cue', 'spot'), hit('cue', 'red', 0.3), pot('red')]),
      R.defaults,
    );
    expect(j.points).toEqual([5, 0]);
  });

  it('gives the opponent 2 for a miss, and they play from the D', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, []), R.defaults);
    expect(j.points).toEqual([0, 2]);
    expect(j.turn.player).toBe(1);
    expect(j.turn.cueBall).toBe('spot');
    expect(j.turn.ballInHand).toBe('in-d');
  });

  it('passes the turn after a stroke that scores nothing', () => {
    const { s, balls } = start();
    const j = R.judge(s, {}, balls, shot(balls, [hit('cue', 'red')]), R.defaults);
    expect(j.points).toEqual([0, 0]);
    expect(j.turn.player).toBe(1);
    expect(j.turn.ballInHand).toBe('none');
  });

  it('fouls playing directly at a ball in baulk from hand, but not off a cushion', () => {
    const { s, balls } = start();
    const spot = balls.find((b) => b.id === 'spot')!;
    spot.pos = { x: -1.3, y: -0.5 };
    const inHand = { ...s, inHand: true };
    const direct = R.judge(inHand, {}, balls, shot(balls, [hit('cue', 'spot')]), R.defaults);
    expect(direct.fouls[0]?.code).toBe('wrong-ball-first');
    const offCushion = R.judge(inHand, {}, balls, shot(balls, [rail('cue'), hit('cue', 'spot')]), R.defaults);
    expect(offCushion.fouls).toEqual([]);
  });

  it('ends the turn after 15 hazards in a row', () => {
    const { s, balls } = start();
    const j = R.judge(
      { ...s, hazards: 14 },
      {},
      balls,
      shot(balls, [hit('cue', 'red'), pot('red')]),
      R.defaults,
    );
    expect(j.turn.player).toBe(1);
    expect(j.message).toMatch(/15 hazards/);
  });

  it('wins on reaching the target', () => {
    const { s, balls } = start();
    const j = R.judge(
      { ...s, scores: [98, 40] },
      {},
      balls,
      shot(balls, [hit('cue', 'red'), hit('cue', 'spot', 0.3)]),
      R.defaults,
    );
    expect(j.frame?.winner).toBe(0);
  });
});
