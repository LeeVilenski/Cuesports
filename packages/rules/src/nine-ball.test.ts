import { cloneBall, type BallState, type PhysicsEvent, type ShotResult } from '@cuesports/physics';
import { Rng } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { NINE_BALL, type NineBallState } from './rotation';
import { footSpot } from './placement';

const R = NINE_BALL;
const opts = R.defaults;
const table = R.table;

/** A synthetic shot: the given events, with pocket/off-table events applied to the final balls. */
function shot(
  before: BallState[],
  events: PhysicsEvent[],
  moves: Record<string, { x: number; y: number }> = {},
): ShotResult {
  const final = before.map(cloneBall);
  for (const e of events) {
    const id = e.type === 'pocket' || e.type === 'off-table' ? e.ball : null;
    const b = id ? final.find((x) => x.id === id) : undefined;
    if (b) {
      b.state = 'pocketed';
      if (e.type === 'pocket') b.pocket = e.pocket;
    }
  }
  for (const [id, p] of Object.entries(moves)) {
    const b = final.find((x) => x.id === id)!;
    b.pos = { ...p };
  }
  return { ids: before.map((b) => b.id), events, frames: [], final, duration: 1, truncated: false };
}

const strike: PhysicsEvent = { type: 'strike', t: 0, ball: 'cue', speed: 5, miscue: false };
const hit = (b: string, t = 0.1): PhysicsEvent => ({ type: 'ball', t, a: 'cue', b, speed: 3 });
const rail = (ball: string, t = 0.5): PhysicsEvent => ({
  type: 'cushion',
  t,
  ball,
  segment: 'rail:top:0',
  kind: 'rail',
  speed: 1,
});
const pot = (ball: string, t = 0.6): PhysicsEvent => ({ type: 'pocket', t, ball, pocket: 'top-right' });

function fresh(breaker = 0) {
  return R.newFrame(opts, new Rng(7), breaker);
}

/** A mid-rack position: state after the break with the given shooter, phase and ball in hand. */
function midRack(over: Partial<NineBallState> = {}): { balls: BallState[]; state: NineBallState } {
  const { balls } = fresh();
  return { balls, state: { phase: 'play', shooter: 0, fouls: [0, 0], ballInHand: 'none', ...over } };
}

describe('9-ball: rack and break', () => {
  it('racks the 1 on the foot spot, the 9 in the middle, and gives ball in hand behind the head string', () => {
    const { balls, turn } = fresh();
    const one = balls.find((b) => b.id === '1')!;
    const nine = balls.find((b) => b.id === '9')!;
    const spot = footSpot(table);
    expect(Math.abs(one.pos.x - spot.x)).toBeLessThan(0.001);
    expect(Math.abs(one.pos.y)).toBeLessThan(0.001);
    // The 9 is in the middle of the diamond: two rows behind the 1, on the long string.
    expect(nine.pos.x).toBeGreaterThan(one.pos.x + 0.08);
    expect(Math.abs(nine.pos.y)).toBeLessThan(0.001);
    expect(balls).toHaveLength(10);
    expect(turn).toMatchObject({
      player: 0,
      ballInHand: 'behind-head-string',
      isBreak: true,
      targets: ['1'],
    });
  });

  it('a break that pots a ball keeps the breaker at the table, who may push out', () => {
    const { balls, state } = fresh();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('5')]), opts);
    expect(j.fouls).toEqual([]);
    expect(j.turn).toMatchObject({ player: 0, canPushOut: true, ballInHand: 'none' });
  });

  it('a break with four balls to a cushion and nothing potted passes the turn, and the opponent may push out', () => {
    const { balls, state } = fresh();
    const events = [strike, hit('1'), rail('2'), rail('3'), rail('4'), rail('5')];
    const j = R.judge(state, {}, balls, shot(balls, events), opts);
    expect(j.fouls).toEqual([]);
    expect(j.turn).toMatchObject({ player: 1, canPushOut: true });
  });

  it('a break with too few balls to a cushion is a foul: ball in hand anywhere, no push out', () => {
    const { balls, state } = fresh();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), rail('2'), rail('3')]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['illegal-break']);
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'anywhere', canPushOut: false });
  });

  it('potting the 9 on a legal break wins (golden break)', () => {
    const { balls, state } = fresh();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('9')]), opts);
    expect(j.frame).toEqual({ winner: 0, reason: 'golden break' });
  });

  it('a 9 potted on a break that scratches is spotted and the opponent has ball in hand', () => {
    const { balls, state } = fresh();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('9'), pot('cue', 0.9)]), opts);
    expect(j.frame).toBeNull();
    expect(j.fouls.map((f) => f.code)).toEqual(['scratch']);
    const nine = j.balls.find((b) => b.id === '9')!;
    expect(nine.state).toBe('stationary');
    // The foot spot is occupied by the rack, so the 9 goes behind it on the long string.
    expect(nine.pos.y).toBe(0);
    expect(nine.pos.x).toBeGreaterThanOrEqual(footSpot(table).x);
    expect(j.balls.find((b) => b.id === 'cue')!.state).toBe('stationary');
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'anywhere' });
  });
});

describe('9-ball: fouls', () => {
  it('hitting a higher ball first is a foul', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('3'), pot('3')]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['wrong-ball-first']);
    expect(j.message).toContain('hit the 3 first (needed the 1)');
    // Balls potted on a foul stay down (only the 9 is ever spotted).
    expect(j.balls.find((b) => b.id === '3')!.state).toBe('pocketed');
    expect(j.turn).toMatchObject({ player: 1, ballInHand: 'anywhere' });
  });

  it('no ball reaching a cushion after contact is a foul', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, rail('cue', 0.05), hit('1', 0.1)]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['no-rail']);
  });

  it('missing everything is a foul', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, rail('cue')]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['no-contact']);
  });

  it('knocking an object ball off the table is a foul and the ball stays off', () => {
    const { balls, state } = midRack();
    const events: PhysicsEvent[] = [strike, hit('1'), rail('1'), { type: 'off-table', t: 0.7, ball: '4' }];
    const j = R.judge(state, {}, balls, shot(balls, events), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['off-table']);
    expect(j.balls.find((b) => b.id === '4')!.state).toBe('pocketed');
  });

  it('three fouls in a row lose the rack, with a warning after the second', () => {
    let { balls, state } = midRack({ fouls: [1, 0] });
    const miss = [strike, rail('cue')];
    const second = R.judge(state, {}, balls, shot(balls, miss), opts);
    expect(second.message).toContain('{p0} is on two fouls');
    // Opponent plays a legal shot, then player 0 fouls again.
    state = { ...second.state, shooter: 0, ballInHand: 'none' };
    balls = second.balls;
    const third = R.judge(state, {}, balls, shot(balls, miss), opts);
    expect(third.frame).toEqual({ winner: 1, reason: 'three fouls' });
  });

  it('a legal shot resets the foul count', () => {
    const { balls, state } = midRack({ fouls: [2, 0] });
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), rail('1')]), opts);
    expect(j.state.fouls[0]).toBe(0);
  });

  it('the three-foul rule can be turned off', () => {
    const { balls, state } = midRack({ fouls: [2, 0] });
    const j = R.judge(state, {}, balls, shot(balls, [strike, rail('cue')]), {
      ...opts,
      threeFoulRule: false,
    });
    expect(j.frame).toBeNull();
  });
});

describe('9-ball: play', () => {
  it('potting a ball legally keeps the shooter at the table', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('1')]), opts);
    expect(j.turn).toMatchObject({ player: 0, ballInHand: 'none', targets: ['2'] });
  });

  it('a miss passes the turn', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), rail('1')]), opts);
    expect(j.turn.player).toBe(1);
  });

  it('a combination on the 9 wins', () => {
    const { balls, state } = midRack();
    const j = R.judge(
      state,
      {},
      balls,
      shot(balls, [strike, hit('1'), { type: 'ball', t: 0.3, a: '1', b: '9', speed: 2 }, pot('9')]),
      opts,
    );
    expect(j.frame).toEqual({ winner: 0, reason: 'potted the 9' });
  });

  it('potting the 9 while scratching spots it and fouls', () => {
    const { balls, state } = midRack();
    const j = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('9'), pot('cue', 0.8)]), opts);
    expect(j.frame).toBeNull();
    expect(j.balls.find((b) => b.id === '9')!.state).toBe('stationary');
  });
});

describe('9-ball: push out', () => {
  function afterBreak() {
    const { balls, state } = fresh();
    const events = [strike, hit('1'), rail('2'), rail('3'), rail('4'), rail('5')];
    return R.judge(state, {}, balls, shot(balls, events), opts);
  }

  it('a push out may hit nothing, and the opponent then decides', () => {
    const j0 = afterBreak();
    expect(j0.turn).toMatchObject({ player: 1, canPushOut: true });
    const j = R.judge(j0.state, { pushOut: true }, j0.balls, shot(j0.balls, [strike]), opts);
    expect(j.fouls).toEqual([]);
    expect(j.turn.player).toBe(0);
    expect(j.turn.decision?.choices.map((c) => c.id)).toEqual(['play', 'pass']);
  });

  it('the opponent can pass the shot back to the player who pushed', () => {
    const j0 = afterBreak();
    const pushed = R.judge(j0.state, { pushOut: true }, j0.balls, shot(j0.balls, [strike]), opts);
    const passed = R.decide(pushed.state, 'pass', pushed.balls, opts);
    expect(passed.turn).toMatchObject({ player: 1, canPushOut: false, decision: null });
    const played = R.decide(pushed.state, 'play', pushed.balls, opts);
    expect(played.turn).toMatchObject({ player: 0, canPushOut: false });
  });

  it('a 9 potted on a push out is spotted', () => {
    const j0 = afterBreak();
    const j = R.judge(
      j0.state,
      { pushOut: true },
      j0.balls,
      shot(j0.balls, [strike, hit('6'), pot('9')]),
      opts,
    );
    expect(j.frame).toBeNull();
    expect(j.balls.find((b) => b.id === '9')!.state).toBe('stationary');
  });

  it('scratching on a push out is still a foul', () => {
    const j0 = afterBreak();
    const j = R.judge(j0.state, { pushOut: true }, j0.balls, shot(j0.balls, [strike, pot('cue')]), opts);
    expect(j.fouls.map((f) => f.code)).toEqual(['scratch']);
    expect(j.turn).toMatchObject({ player: 0, ballInHand: 'anywhere' });
  });

  it('no push out after a foul on the break, or later in the rack', () => {
    const { balls, state } = fresh();
    const foul = R.judge(state, {}, balls, shot(balls, [strike, hit('1'), pot('cue')]), opts);
    expect(foul.turn.canPushOut).toBe(false);
    const later = R.judge(midRack().state, {}, balls, shot(balls, [strike, hit('1'), rail('1')]), opts);
    expect(later.turn.canPushOut).toBe(false);
  });
});
