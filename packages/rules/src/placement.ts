import type { BallState } from '@cuesports/physics';
import type { TableSpec, Vec2 } from '@cuesports/shared';
import type { BallInHand } from './types';

const free = (balls: readonly BallState[], id: string, p: Vec2, R: number): boolean =>
  balls.every(
    (b) =>
      b.id === id ||
      b.state === 'pocketed' ||
      Math.hypot(b.pos.x - p.x, b.pos.y - p.y) >= b.radius + R - 1e-9,
  );

/** x of the head string (the line the cue ball must be behind on the break). */
export function headStringX(table: TableSpec): number {
  const m = table.markings.find((x) => x.type === 'line' && (x.id === 'head-string' || x.id === 'baulk'));
  return m && m.type === 'line' ? m.a.x : -table.playfield.length / 4;
}

/** Whether the cue ball may be placed at p with the given ball in hand. */
export function canPlaceCueBall(
  table: TableSpec,
  balls: readonly BallState[],
  zone: BallInHand,
  p: Vec2,
  cueId = 'cue',
): boolean {
  if (zone === 'none') return false;
  const cue = balls.find((b) => b.id === cueId);
  const R = cue?.radius ?? table.balls.cue.radius;
  const hl = table.playfield.length / 2 - R;
  const hw = table.playfield.width / 2 - R;
  if (Math.abs(p.x) > hl || Math.abs(p.y) > hw) return false;
  // Behind the head string means the ball's centre is behind the line.
  if (zone === 'behind-head-string' && p.x >= headStringX(table)) return false;
  if (zone === 'in-d') {
    const d = theD(table);
    if (!d || p.x > d.centre.x || Math.hypot(p.x - d.centre.x, p.y - d.centre.y) > d.radius) return false;
  }
  return free(balls, cueId, p, R);
}

/**
 * Puts a ball on a spot. If something is in the way it goes on the long string as close as possible
 * behind the spot (towards the foot cushion), then in front of it if there is no room behind.
 */
export function spotBall(table: TableSpec, balls: BallState[], id: string, spot: Vec2): void {
  const b = balls.find((x) => x.id === id);
  if (!b) return;
  const hl = table.playfield.length / 2 - b.radius;
  const step = 0.0005;
  let p: Vec2 = { ...spot };
  if (!free(balls, id, p, b.radius)) {
    let found = false;
    for (let x = spot.x; x <= hl; x += step) {
      if (free(balls, id, { x, y: spot.y }, b.radius)) {
        p = { x, y: spot.y };
        found = true;
        break;
      }
    }
    if (!found) {
      for (let x = spot.x; x >= -hl; x -= step) {
        if (free(balls, id, { x, y: spot.y }, b.radius)) {
          p = { x, y: spot.y };
          break;
        }
      }
    }
  }
  b.pos = p;
  b.vel = { x: 0, y: 0 };
  b.spin = { x: 0, y: 0, z: 0 };
  b.state = 'stationary';
  delete b.pocket;
}

export function footSpot(table: TableSpec): Vec2 {
  const m = table.markings.find((x) => x.type === 'spot' && x.id === 'foot');
  return m && m.type === 'spot' ? m.position : { x: table.playfield.length / 4, y: 0 };
}

/** The snooker D: a semicircle on the baulk line, on the baulk side. */
export function theD(table: TableSpec): { centre: Vec2; radius: number } | null {
  const m = table.markings.find((x) => x.type === 'arc' && x.id === 'D');
  return m && m.type === 'arc' ? { centre: m.centre, radius: m.radius } : null;
}

/** A spot marking by id. */
export function spotOf(table: TableSpec, id: string): Vec2 | null {
  const m = table.markings.find((x) => x.type === 'spot' && x.id === id);
  return m && m.type === 'spot' ? m.position : null;
}

/** Whether a ball could be spotted at p without touching another ball. */
export function spotFree(balls: readonly BallState[], id: string, p: Vec2): boolean {
  const b = balls.find((x) => x.id === id);
  return free(balls, id, p, b?.radius ?? 0);
}
