import type { TableSpec } from '@cuesports/shared';
import { makeBall } from './layouts';
import type { BallState, ShotInput } from './types';

export const shot = (over: Partial<ShotInput> = {}): ShotInput => ({
  ball: 'cue',
  aim: 0,
  elevation: 0,
  tip: { a: 0, b: 0 },
  speed: 2,
  ...over,
});

export const cueAt = (t: TableSpec, x: number, y: number): BallState =>
  makeBall('cue', t.balls.cue, { x, y });
export const objAt = (t: TableSpec, id: string, x: number, y: number): BallState =>
  makeBall(id, t.balls.object, { x, y });

export const byId = (balls: BallState[], id: string): BallState => {
  const b = balls.find((x) => x.id === id);
  if (!b) throw new Error(`missing ${id}`);
  return b;
};

export const speed = (b: BallState): number => Math.hypot(b.vel.x, b.vel.y);

export const kinetic = (b: BallState): number => {
  const I = 0.4 * b.mass * b.radius * b.radius;
  return (
    0.5 * b.mass * (b.vel.x ** 2 + b.vel.y ** 2) + 0.5 * I * (b.spin.x ** 2 + b.spin.y ** 2 + b.spin.z ** 2)
  );
};

export const deg = (rad: number): number => (rad * 180) / Math.PI;
