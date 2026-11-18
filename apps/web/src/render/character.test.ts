import { makeBall, simulate, type ShotInput } from '@cuesports/physics';
import { AMERICAN_POOL_9FT as T } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import {
  Character,
  chooseTool,
  cueLine,
  stancePose,
  stanceSpot,
  type StanceInput,
  type TableFrame,
} from './character';
import { lookFor, PRESETS } from './figure';
import { exitDistance, len, sub, twoBone, v3, walkPath } from './ik';
import { ballAt, ShotCamera } from './shot-camera';

const frame: TableFrame = {
  hl: T.playfield.length / 2,
  hw: T.playfield.width / 2,
  hx: T.playfield.length / 2 + 0.16,
  hy: T.playfield.width / 2 + 0.16,
  railTop: 0.04,
  floorZ: -0.79,
};
const R = T.balls.cue.radius;
const shotAt = (aim: number, elevation = 0): ShotInput => ({
  ball: 'cue',
  aim,
  elevation,
  tip: { a: 0, b: 0 },
  speed: 2,
});
const outsideTable = (p: { x: number; y: number }, m = 0) =>
  Math.abs(p.x) >= frame.hx + m || Math.abs(p.y) >= frame.hy + m;

describe('two-bone IK', () => {
  it('reaches targets in range with exact bone lengths', () => {
    const root = v3(0, 0, 1);
    const target = v3(0.3, 0.2, 0.7);
    const { mid, end } = twoBone(root, target, 0.29, 0.27, v3(0, -1, 1));
    expect(len(sub(end, target))).toBeLessThan(1e-6);
    expect(len(sub(mid, root))).toBeCloseTo(0.29, 6);
    expect(len(sub(end, mid))).toBeCloseTo(0.27, 6);
  });

  it('straightens towards targets out of reach', () => {
    const { end } = twoBone(v3(0, 0, 0), v3(2, 0, 0), 0.3, 0.3, v3(0, 0, 1));
    expect(end.x).toBeCloseTo(0.6, 3);
  });
});

describe('walking round the table', () => {
  it('measures the way out of the table', () => {
    expect(exitDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, 2, 1)).toBeCloseTo(2);
    expect(exitDistance({ x: 0, y: 0 }, { x: 0, y: -1 }, 2, 1)).toBeCloseTo(1);
  });

  it('goes round corners, never across the table', () => {
    const path = walkPath({ x: 2.5, y: 0 }, { x: -2.5, y: 0.2 }, 2, 1);
    for (const p of path) expect(Math.abs(p.x) >= 2 - 1e-9 || Math.abs(p.y) >= 1 - 1e-9).toBe(true);
    // Two corners on the way from one end to the other.
    expect(path.length).toBeGreaterThanOrEqual(5);
  });
});

describe('stance', () => {
  const cases: [string, { x: number; y: number }, number][] = [
    ['middle of the table', { x: 0, y: 0 }, 0.3],
    ['near the end cushion', { x: frame.hl - 0.05, y: 0.2 }, Math.PI],
    ['frozen to a side cushion', { x: 0.3, y: -frame.hw + R }, Math.PI / 2],
    ['near a corner', { x: -frame.hl + 0.1, y: frame.hw - 0.1 }, -0.6],
  ];
  for (const [name, ball, aim] of cases)
    it(`stands outside the table with the bridge under the cue: ${name}`, () => {
      const st: StanceInput = { ball, R, shot: shotAt(aim), gap: 0.015 };
      const pose = stancePose(st, frame);
      expect(outsideTable(stanceSpot(st, frame))).toBe(true);
      expect(outsideTable(pose.lFoot)).toBe(true);
      expect(outsideTable(pose.rFoot)).toBe(true);
      // Feet on the floor, head above the cue line.
      expect(pose.lFoot.z).toBeCloseTo(frame.floorZ + 0.06, 1);
      const { tip, u } = cueLine(st);
      const k = (pose.head.x - tip.x) * u.x + (pose.head.y - tip.y) * u.y;
      expect(pose.head.z).toBeGreaterThan(tip.z + u.z * k);
      // Bridge hand (or rest head) on the cue line, behind the tip.
      const bridge = pose.restButt === pose.restHead ? pose.lHand : pose.restHead;
      const kb = (bridge.x - tip.x) * u.x + (bridge.y - tip.y) * u.y;
      expect(kb).toBeGreaterThan(0);
      const off = Math.abs((bridge.x - tip.x) * u.y - (bridge.y - tip.y) * u.x);
      expect(off).toBeLessThan(0.02);
    });

  it('uses a rest when the bridge is out of reach', () => {
    const big = { ...frame, hl: 1.78, hw: 0.89, hx: 1.95, hy: 1.06 };
    const pose = stancePose({ ball: { x: 0, y: 0 }, R, shot: shotAt(0), gap: 0.015 }, big);
    expect(len(sub(pose.restButt, pose.restHead))).toBeGreaterThan(0.5);
  });

  it('picks the hand, the rest or the spider', () => {
    const snooker = { ...frame, hl: 1.78, hw: 0.89, hx: 1.95, hy: 1.06, restReach: 0.55 };
    const near = { ball: { x: 1.5, y: 0 }, R, shot: shotAt(Math.PI), gap: 0.015 };
    expect(chooseTool(near, snooker).tool).toBe('hand');
    const far = { ball: { x: 0, y: 0 }, R, shot: shotAt(0), gap: 0.015 };
    expect(chooseTool(far, snooker).tool).toBe('rest');
    // A ball just behind the cue ball, where the rest head would go.
    const tucked = { ...far, others: [{ x: -0.09, y: 0.01 }] };
    const pick = chooseTool(tucked, snooker);
    expect(pick.tool).toBe('spider');
    expect(pick.kb).toBeGreaterThan(0.09 - 2 * R);
    // A ball well off to the side doesn't need the spider.
    expect(chooseTool({ ...far, others: [{ x: -0.1, y: 0.3 }] }, snooker).tool).toBe('rest');
  });

  it('the grip hand follows the stroke', () => {
    const st = { ball: { x: 0, y: 0 }, R, shot: shotAt(Math.PI), gap: 0.015 };
    const a = stancePose(st, frame);
    const b = stancePose({ ...st, gap: 0.2 }, frame);
    // Aiming along −x, drawing back moves the hand towards +x.
    expect(b.rHand.x - a.rHand.x).toBeGreaterThan(0.1);
    expect(len(sub(b.lHand, a.lHand))).toBeLessThan(1e-9);
  });
});

describe('Character', () => {
  it('walks round to a new shot, then gets down', () => {
    const c = new Character(lookFor(PRESETS[0]!, 'nine-ball'));
    c.setTable(frame, { x: 0, y: -(frame.hy + 1) }, Math.PI / 2);
    const first: StanceInput = { ball: { x: 0.8, y: 0 }, R, shot: shotAt(Math.PI), gap: 0.015 };
    c.place({ kind: 'shoot', stance: first });
    expect(c.isDown).toBe(true);
    // Shot over: stand and watch.
    for (let i = 0; i < 30; i++) c.update(1 / 30, { kind: 'watch' });
    expect(c.isDown).toBe(false);
    // Next shot from the other end.
    const next: StanceInput = { ball: { x: -0.8, y: 0 }, R, shot: shotAt(0), gap: 0.015 };
    let walked = false;
    for (let i = 0; i < 30 * 8 && !(c.isDown && !c.busy); i++) {
      c.update(1 / 30, { kind: 'shoot', stance: next });
      if (c.busy && !c.isDown) walked = true;
      expect(outsideTable(c.pose!.pelvis)).toBe(true);
    }
    expect(walked).toBe(true);
    expect(c.isDown).toBe(true);
    c.dispose();
  });
});

describe('shot camera', () => {
  const balls = [
    makeBall('cue', T.balls.cue, { x: -0.6, y: 0 }),
    makeBall('1', T.balls.object, { x: 0.6, y: 0.4 }),
  ];
  const pocket = T.pockets.find((p) => p.position.x > 0 && p.position.y > 0)!;
  const aim = Math.atan2(0.4, 1.2);
  const result = simulate(T, balls, { ...shotAt(aim), speed: 2.5 });

  it('follows the cue ball, then the ball it hits', () => {
    const cam = new ShotCamera(result, T, 'follow', aim);
    const v0 = cam.view(0.05)!;
    const cue = ballAt(result, 'cue', 0.05)!;
    expect(Math.hypot(v0.look.x - cue.x, v0.look.y - cue.y)).toBeLessThan(0.5);
    const hit = result.events.find((e) => e.type === 'ball')!;
    const later = cam.view(hit.t + 0.3)!;
    const one = ballAt(result, '1', hit.t + 0.3);
    if (one) expect(Math.hypot(later.look.x - one.x, later.look.y - one.y)).toBeLessThan(0.5);
  });

  it('cuts to the pocket for a pot', () => {
    const pot = result.events.find((e) => e.type === 'pocket' && e.ball === '1');
    expect(pot, 'test shot should pot the 1').toBeTruthy();
    if (pot?.type !== 'pocket') return;
    const hit = result.events.find((e) => e.type === 'ball')!;
    const cam = new ShotCamera(result, T, 'cinematic', aim);
    let cutAt = -1;
    for (let t = 0; t <= pot.t && cutAt < 0; t += 1 / 60) {
      const v = cam.view(t)!;
      if (v.cut) {
        cutAt = t;
        expect(Math.hypot(v.eye.x - pocket.position.x, v.eye.y - pocket.position.y)).toBeLessThan(0.5);
      }
    }
    // Cuts once, after the cue ball has hit the 1 and before it drops.
    expect(cutAt).toBeGreaterThan(hit.t);
    expect(cutAt).toBeLessThan(pot.t);
    expect(cam.view(cutAt + 0.05)!.cut).toBe(false);
  });
});
