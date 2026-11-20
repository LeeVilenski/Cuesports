import { simulate, type BallState, type ShotInput } from '@cuesports/physics';
import { AMERICAN_POOL_9FT, SNOOKER_12FT, type TableSpec, type Vec2 } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { CHALLENGES, judgeChallenge, newRun, type ChallengeSpec, type Verdict } from './challenges';
import { compactBalls, expandBalls } from './record';

const tableOf = (s: ChallengeSpec): TableSpec => (s.table === 'snooker' ? SNOOKER_12FT : AMERICAN_POOL_9FT);

function startBalls(s: ChallengeSpec): BallState[] {
  const t = tableOf(s);
  const specs = Object.fromEntries(
    s.balls.map(([id]) => {
      const b = id === 'cue' ? t.balls.cue : t.balls.object;
      return [id, [b.radius, b.mass] as [number, number]];
    }),
  );
  return expandBalls(s.balls, specs);
}

const unit = (a: Vec2, b: Vec2): Vec2 => {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

/** Aim points: ghost balls for every pocket, straight, off each cushion, and through another ball. */
function aimPoints(t: TableSpec, balls: BallState[]): Vec2[] {
  const R = t.balls.object.radius;
  const hl = t.playfield.length / 2 - R;
  const hw = t.playfield.width / 2 - R;
  const on = balls.filter((b) => b.id !== 'cue' && b.state !== 'pocketed');
  const pts: Vec2[] = [];
  const ghost = (b: Vec2, to: Vec2) => {
    const d = unit(b, to);
    return { x: b.x - d.x * 2 * R, y: b.y - d.y * 2 * R };
  };
  for (const p of t.pockets) {
    const mirrors = [
      p.position,
      { x: p.position.x, y: 2 * hw - p.position.y },
      { x: p.position.x, y: -2 * hw - p.position.y },
      { x: 2 * hl - p.position.x, y: p.position.y },
      { x: -2 * hl - p.position.x, y: p.position.y },
    ];
    for (const b of on) {
      for (const m of mirrors) pts.push(ghost(b.pos, m));
      // Combination: another ball sent into b's ghost ball.
      const g = ghost(b.pos, p.position);
      for (const a of on) if (a !== b) pts.push(ghost(a.pos, g));
    }
  }
  return pts;
}

/** Every shot to try from this table, best-guess first. */
function* candidates(t: TableSpec, balls: BallState[]): Generator<ShotInput> {
  const cue = balls.find((b) => b.id === 'cue')!;
  const offsets = [0, 0.15, -0.15, 0.3, -0.3, 0.6, -0.6].map((d) => (d * Math.PI) / 180);
  for (const p of aimPoints(t, balls)) {
    const aim = Math.atan2(p.y - cue.pos.y, p.x - cue.pos.x);
    for (const da of offsets)
      for (const b of [0, -0.2, -0.5, 0.4])
        for (const speed of [1.6, 2, 2.5, 3.4, 5])
          yield { ball: 'cue', aim: aim + da, elevation: 0, tip: { a: 0, b }, speed };
  }
}

/** Plays the challenge with the first shots that work, for the most stars. */
function solve(s: ChallengeSpec): { verdict: Verdict; shots: ShotInput[] } {
  const t = tableOf(s);
  if (s.kind !== 'clear') {
    let best: { verdict: Verdict; shots: ShotInput[] } = {
      verdict: { status: 'failed', message: '' },
      shots: [],
    };
    for (const shot of candidates(t, startBalls(s))) {
      const v = judgeChallenge(s, newRun(), simulate(t, startBalls(s), shot, { sampleRate: 0 }));
      if (v.status === 'won' && (best.verdict.status !== 'won' || v.stars > best.verdict.stars))
        best = { verdict: v, shots: [shot] };
      if (best.verdict.status === 'won' && best.verdict.stars === 3) break;
    }
    return best;
  }
  // Clear: greedily take a shot that pots something and leaves the cue ball on the table.
  const run = newRun();
  let balls = startBalls(s);
  const shots: ShotInput[] = [];
  for (let n = 0; n < s.limit; n++) {
    let next: { v: Verdict; balls: BallState[]; shot: ShotInput } | null = null;
    const left = balls.filter((b) => b.id !== 'cue' && b.state !== 'pocketed').length;
    for (const shot of candidates(t, balls)) {
      const r = simulate(t, balls, shot, { sampleRate: 0 });
      const after = r.final.filter((b) => b.id !== 'cue' && b.state !== 'pocketed').length;
      const scratched = r.final.find((b) => b.id === 'cue')?.state === 'pocketed';
      if (after < left && !scratched) {
        next = { v: judgeChallenge(s, { ...run }, r), balls: r.final, shot };
        break;
      }
    }
    if (!next) break;
    run.shots++;
    shots.push(next.shot);
    // Rebuild at rest from the compact form, as a replay would.
    balls = expandBalls(
      compactBalls(next.balls),
      Object.fromEntries(next.balls.map((b) => [b.id, [b.radius, b.mass]])),
    );
    if (next.v.status === 'won') return { verdict: next.v, shots };
  }
  return { verdict: { status: 'failed', message: 'no clearance found' }, shots };
}

describe('challenges', () => {
  it('have unique ids and legal layouts', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      const t = tableOf(c);
      const balls = startBalls(c);
      for (const b of balls) {
        expect(Math.abs(b.pos.x)).toBeLessThan(t.playfield.length / 2 - b.radius);
        expect(Math.abs(b.pos.y)).toBeLessThan(t.playfield.width / 2 - b.radius);
        for (const o of balls)
          if (o !== b)
            expect(Math.hypot(o.pos.x - b.pos.x, o.pos.y - b.pos.y)).toBeGreaterThan(b.radius + o.radius);
      }
    }
  });

  for (const c of CHALLENGES) {
    it(`"${c.title}" can be done for three stars`, { timeout: 120_000 }, () => {
      const { verdict } = solve(c);
      expect(verdict).toMatchObject({ status: 'won', stars: 3 });
    });
  }
});

describe('judgeChallenge', () => {
  const spec = CHALLENGES.find((c) => c.id === 'straight-in')!;
  const t = AMERICAN_POOL_9FT;
  const miss: ShotInput = { ball: 'cue', aim: Math.PI, elevation: 0, tip: { a: 0, b: 0 }, speed: 1 };

  it('gives another attempt after a miss, then fails', () => {
    const run = newRun();
    expect(judgeChallenge(spec, run, simulate(t, startBalls(spec), miss, { sampleRate: 0 })).status).toBe(
      'retry',
    );
    expect(run.attempt).toBe(2);
    judgeChallenge(spec, run, simulate(t, startBalls(spec), miss, { sampleRate: 0 }));
    expect(judgeChallenge(spec, run, simulate(t, startBalls(spec), miss, { sampleRate: 0 })).status).toBe(
      'failed',
    );
  });

  it('gives fewer stars for later attempts', () => {
    const { shots } = solve(spec);
    const run = newRun();
    judgeChallenge(spec, run, simulate(t, startBalls(spec), miss, { sampleRate: 0 }));
    const v = judgeChallenge(spec, run, simulate(t, startBalls(spec), shots[0]!, { sampleRate: 0 }));
    expect(v).toMatchObject({ status: 'won', stars: 2 });
  });
});
