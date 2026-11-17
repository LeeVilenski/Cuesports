import { cloneBall, simulate, type BallState, type ShotInput } from '@cuesports/physics';
import {
  canPlaceCueBall,
  theD,
  type Judgement,
  type Ruleset,
  type ShotDeclaration,
  type Turn,
} from '@cuesports/rules';
import { Rng, type TableSpec, type Vec2 } from '@cuesports/shared';
import { bestPotEase, len, potLine, sub, unit, type PotLine } from './geometry';
import { skill as skillFor, type SkillProfile } from './skill';

/**
 * Shot search: generate candidate shots (pots, safeties, breaks, cue-ball placements), simulate each
 * with the real physics and judge it with the real rules, score the outcome, then play the best one
 * with the player's errors applied. Runs anywhere (tests, a Web Worker); the same seed gives the same
 * choice.
 */

export interface AiInput<S = unknown, O = unknown> {
  ruleset: Ruleset<S, O>;
  options: O;
  state: S;
  turn: Turn;
  balls: BallState[];
  /** The AI's player index. */
  me: number;
  level: number;
  seed: number;
  /** Table used for simulation (cloth speed may differ from the ruleset's table). */
  simTable?: TableSpec;
  /** Thinking budget in milliseconds. */
  budgetMs?: number;
  now?: () => number;
}

export interface AiShot {
  shot: ShotInput;
  decl: ShotDeclaration;
  /** Where to put the cue ball first (ball in hand). */
  place?: Vec2;
  /** What the AI meant to do, for the HUD ("pot the 3 in the top-right corner"). */
  label: string;
  score: number;
  /** Candidates evaluated. */
  considered: number;
}

interface Candidate {
  shot: ShotInput;
  decl: ShotDeclaration;
  place?: Vec2;
  label: string;
}

const STRIKE_TO_BALL = 1.33; // cue speed → ball speed for a centre hit (approximately)
const MIN_CUE = 0.6;
const MAX_CUE = 9;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Cue speed to get the object ball to the pocket with a little to spare. */
function potSpeed(table: TableSpec, line: PotLine): number {
  const g = 9.81;
  const mr = table.cloth.rollFriction;
  const ms = table.cloth.slideFriction;
  // Object ball arrives at the pocket at about 0.6 m/s.
  const vObj = Math.sqrt(0.36 + 2 * mr * g * line.d2 * 1.3);
  // Cue ball at contact (cut shots pass on cos(cut) of the speed).
  const vHit = vObj / Math.max(0.25, Math.cos(line.cut)) / 0.97;
  // Lost on the way: sliding, then rolling.
  const vStart = Math.sqrt(vHit * vHit + 2 * (ms * 0.3 + mr) * g * line.d1);
  return clamp(vStart / STRIKE_TO_BALL, MIN_CUE, MAX_CUE);
}

const isSnooker = (r: Ruleset<unknown, unknown>) => r.id === 'snooker';

function snookerBreakOff(input: AiInput): boolean {
  if (!isSnooker(input.ruleset as Ruleset<unknown, unknown>) || input.turn.ballInHand !== 'in-d')
    return false;
  const reds = input.balls.filter((b) => b.id.startsWith('red') && b.state !== 'pocketed');
  if (reds.length < 6) return false;
  const pink = input.balls.find((b) => b.id === 'pink');
  return !!pink && reds.every((r) => Math.hypot(r.pos.x - pink.pos.x, r.pos.y - pink.pos.y) < 0.35);
}

function declFor(input: AiInput, target: string, pocket: string | null, safety: boolean): ShotDeclaration {
  const t = input.turn;
  if (t.mustCall) return safety || !pocket ? { safety: true } : { call: { ball: target, pocket } };
  if (t.mustNominate) return { nominate: target };
  return {};
}

const describePocket = (id: string) =>
  id
    .replace('-', ' ')
    .replace('side', 'side pocket')
    .replace(/(left|right)$/, '$1 corner');

/** Candidate positions for the cue ball when it can be placed. */
function placements(
  input: AiInput,
  rulesTable: TableSpec,
  lines: { target: BallState; pocket: string }[],
): Vec2[] {
  const zone = input.turn.ballInHand;
  const out: Vec2[] = [];
  const cue = input.balls.find((b) => b.id === 'cue')!;
  const ok = (p: Vec2) => canPlaceCueBall(rulesTable, input.balls, zone, p);
  if (zone === 'anywhere') {
    for (const { target, pocket } of lines) {
      const p = rulesTable.pockets.find((x) => x.id === pocket)!;
      const dir = unit(sub(p.position, target.pos));
      for (const back of [0.25, 0.45]) {
        for (const turn of [0, 0.3, -0.3]) {
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          const d = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
          const pos = {
            x: target.pos.x - d.x * (back + 2 * cue.radius),
            y: target.pos.y - d.y * (back + 2 * cue.radius),
          };
          if (ok(pos)) out.push(pos);
        }
      }
    }
  } else {
    // Restricted zone (behind the head string, in baulk, in the D): try a grid.
    const hw = rulesTable.playfield.width / 2 - cue.radius;
    const d = theD(rulesTable);
    const xs = d
      ? [d.centre.x - 0.02, d.centre.x - d.radius * 0.5]
      : [-rulesTable.playfield.length / 2 + 0.25, -rulesTable.playfield.length / 3];
    const span = d ? d.radius * 0.9 : hw * 0.8;
    for (const x of xs)
      for (const f of [-1, -0.5, 0, 0.5, 1]) {
        const pos = { x, y: f * span };
        if (ok(pos)) out.push(pos);
      }
  }
  if (out.length === 0) out.push({ ...cue.pos });
  return out.slice(0, 12);
}

function generate(input: AiInput, sk: SkillProfile): Candidate[] {
  const rulesTable = input.ruleset.table;
  const simTable = input.simTable ?? rulesTable;
  const cands: Candidate[] = [];
  const cue = input.balls.find((b) => b.id === 'cue')!;
  const live = input.balls.filter((b) => b.state !== 'pocketed' && b.id !== 'cue');
  const targets = input.turn.targets.length ? input.turn.targets : live.map((b) => b.id);
  const targetBalls = live.filter((b) => targets.includes(b.id));

  // Breaks.
  if (input.turn.isBreak) {
    const apex = [...live].sort((a, b) => len(sub(a.pos, cue.pos)) - len(sub(b.pos, cue.pos)))[0]!;
    for (const dy of [0, 0.004, -0.004])
      for (const speed of [7.5, 8.5, 9]) {
        const aim = Math.atan2(apex.pos.y - cue.pos.y + dy, apex.pos.x - cue.pos.x);
        cands.push({
          shot: { ball: 'cue', aim, elevation: 0, tip: { a: 0, b: 0.05 }, speed },
          decl: {},
          label: 'break',
        });
      }
    return cands;
  }
  if (snookerBreakOff(input)) {
    const reds = live.filter((b) => b.id.startsWith('red'));
    const d = theD(rulesTable)!;
    for (const side of [1, -1]) {
      const place = { x: d.centre.x - 0.01, y: -side * d.radius * 0.55 };
      if (!canPlaceCueBall(rulesTable, input.balls, 'in-d', place)) continue;
      // The red at the end of the back row on this side, and the next one in.
      const ordered = [...reds].sort((a, b) => b.pos.x - a.pos.x || side * (b.pos.y - a.pos.y));
      for (const red of ordered.slice(0, 3)) {
        const dist = len(sub(red.pos, place));
        const half = Math.asin(Math.min(1, (cue.radius + red.radius) / dist));
        const base = Math.atan2(red.pos.y - place.y, red.pos.x - place.x);
        for (const f of [0.82, 0.9])
          for (const speed of [2.8, 3.4, 4]) {
            cands.push({
              shot: {
                ball: 'cue',
                aim: base + side * f * half,
                elevation: 0,
                tip: { a: -side * 0.3, b: 0 },
                speed,
              },
              decl: {},
              place,
              label: 'break off',
            });
          }
      }
    }
    if (cands.length) return cands;
  }

  // Pots (from where the cue ball lies, or from good positions when it can be placed).
  const lines: { target: BallState; pocket: string }[] = [];
  for (const t of targetBalls) for (const p of rulesTable.pockets) lines.push({ target: t, pocket: p.id });
  const spots = input.turn.ballInHand !== 'none' ? placements(input, rulesTable, lines) : [cue.pos];
  const tips =
    sk.level >= 3
      ? [
          { a: 0, b: 0 },
          { a: 0, b: 0.35 },
          { a: 0, b: -0.35 },
        ]
      : [
          { a: 0, b: 0 },
          { a: 0, b: 0.3 },
        ];
  const mult = sk.level >= 3 ? [1, 1.5, 2.2] : [1.2, 1.8];
  for (const spot of spots) {
    const cueHere = { ...cue, pos: spot };
    const balls = input.balls.map((b) => (b.id === 'cue' ? cueHere : b));
    for (const t of targetBalls)
      for (const p of rulesTable.pockets) {
        const l = potLine(rulesTable, balls, cueHere, t, p);
        if (!l) continue;
        const aim = Math.atan2(l.ghost.y - spot.y, l.ghost.x - spot.x);
        const base = potSpeed(simTable, l);
        for (const m of mult)
          for (const tip of tips) {
            cands.push({
              shot: { ball: 'cue', aim, elevation: 0, tip, speed: clamp(base * m, MIN_CUE, MAX_CUE) },
              decl: declFor(input, t.id, p.id, false),
              ...(input.turn.ballInHand !== 'none' ? { place: spot } : {}),
              label: `pot the ${t.id.replace(/\d+$/, '')} in the ${describePocket(p.id)}`,
            });
          }
      }
  }

  // Safeties: soft contacts across the ball on (and any shot that hits it, as a fallback).
  const nearest = [...targetBalls]
    .sort((a, b) => len(sub(a.pos, cue.pos)) - len(sub(b.pos, cue.pos)))
    .slice(0, 4);
  const fractions = sk.safeties ? [-0.85, -0.5, 0, 0.5, 0.85] : [0];
  const speeds = sk.safeties ? [1.2, 2] : [1.6];
  for (const spot of spots.slice(0, 3))
    for (const t of nearest) {
      const dist = len(sub(t.pos, spot));
      const half = Math.asin(Math.min(1, (cue.radius + t.radius) / Math.max(dist, cue.radius + t.radius)));
      const base = Math.atan2(t.pos.y - spot.y, t.pos.x - spot.x);
      for (const f of fractions)
        for (const speed of speeds) {
          cands.push({
            shot: { ball: 'cue', aim: base + f * half, elevation: 0, tip: { a: 0, b: 0 }, speed },
            decl: declFor(input, t.id, null, true),
            ...(input.turn.ballInHand !== 'none' ? { place: spot } : {}),
            label: `play safe off the ${t.id.replace(/\d+$/, '')}`,
          });
        }
    }
  return cands;
}

/** Scores a judged outcome from the AI's point of view. */
function score(
  input: AiInput,
  sk: SkillProfile,
  j: Judgement<unknown>,
  beforePoints: number[] | undefined,
): number {
  const me = input.me;
  if (j.frame) return j.frame.winner === me ? 10000 : -10000;
  if (j.rerack) return -50;
  let s = 0;
  if (j.points && beforePoints) {
    const gain = j.points[me]! - beforePoints[me]! - (j.points[1 - me]! - beforePoints[1 - me]!);
    s += gain * 40;
  }
  if (j.fouls.length) s -= 300;
  const rulesTable = input.ruleset.table;
  const myTurn = j.turn.player === me && !j.turn.decision;
  if (myTurn) {
    const ease = j.turn.ballInHand !== 'none' ? 0.7 : bestPotEase(rulesTable, j.balls, j.turn.targets);
    s += 300 + 400 * sk.position * ease + 30 * j.potted.length;
  } else {
    const ease = j.turn.ballInHand !== 'none' ? 0.75 : bestPotEase(rulesTable, j.balls, j.turn.targets);
    s -= (sk.safeties ? 300 : 120) * ease;
  }
  return s;
}

function evaluate(input: AiInput, c: Candidate, sk: SkillProfile, rng: Rng | null): number {
  const simTable = input.simTable ?? input.ruleset.table;
  const before = input.balls.map(cloneBall);
  if (c.place) {
    const cue = before.find((b) => b.id === 'cue')!;
    cue.pos = { ...c.place };
    cue.state = 'stationary';
    delete cue.pocket;
  }
  const shot = rng ? withErrors(c.shot, sk, rng) : c.shot;
  const result = simulate(simTable, before, shot, { sampleRate: 0, maxTime: 40 });
  let j: Judgement<unknown>;
  try {
    j = input.ruleset.judge(input.state, c.decl, before, result, input.options);
  } catch {
    return -1e5;
  }
  const beforePoints = (input.state as { scores?: number[] }).scores;
  return score(input, sk, j, beforePoints);
}

/** Applies a player's errors to a shot. */
export function withErrors(shot: ShotInput, sk: SkillProfile, rng: Rng): ShotInput {
  const a = shot.tip.a + rng.gaussian() * sk.tipSigma;
  const b = shot.tip.b + rng.gaussian() * sk.tipSigma;
  const l = Math.hypot(a, b);
  const k = l > 0.5 ? 0.5 / l : 1;
  return {
    ...shot,
    aim: shot.aim + (rng.gaussian() * sk.aimSigma * Math.PI) / 180,
    speed: clamp(shot.speed * (1 + rng.gaussian() * sk.powerSigma), 0.2, MAX_CUE),
    tip: { a: a * k, b: b * k },
  };
}

/** Picks and returns the shot to play, with the player's errors already applied. */
export function chooseShot(input: AiInput): AiShot {
  const sk = skillFor(input.level);
  const rng = new Rng(input.seed);
  const now = input.now ?? (() => Date.now());
  const start = now();
  const budget = input.budgetMs ?? 1500;
  const cands = generate(input, sk);
  // Evaluate in a stable but mixed order so a cut-off budget still sees a spread of shots.
  const order = cands
    .map((_, i) => i)
    .sort((a, b) => ((a * 7919) % cands.length) - ((b * 7919) % cands.length));
  const scored: { c: Candidate; s: number }[] = [];
  for (const i of order) {
    scored.push({ c: cands[i]!, s: evaluate(input, cands[i]!, sk, null) });
    if (now() - start > budget * 0.75 && scored.length >= 8) break;
  }
  scored.sort((a, b) => b.s - a.s);
  // Robustness: re-run the best few with errors and average.
  if (sk.robustness > 0) {
    for (const entry of scored.slice(0, 5)) {
      let sum = entry.s;
      for (let k = 0; k < sk.robustness; k++) sum += evaluate(input, entry.c, sk, rng);
      entry.s = sum / (sk.robustness + 1);
      if (now() - start > budget) break;
    }
    scored.sort((a, b) => b.s - a.s);
  }
  let pick = scored[0];
  if (pick && scored.length > 1 && rng.next() < sk.sloppiness)
    pick = scored[1 + rng.int(Math.min(3, scored.length - 1))];
  if (!pick) {
    const cue = input.balls.find((b) => b.id === 'cue')!;
    return {
      shot: {
        ball: 'cue',
        aim: Math.atan2(-cue.pos.y, -cue.pos.x),
        elevation: 0,
        tip: { a: 0, b: 0 },
        speed: 2,
      },
      decl: {},
      label: 'no shot found',
      score: -1e5,
      considered: 0,
    };
  }
  return {
    shot: withErrors(pick.c.shot, sk, rng),
    decl: pick.c.decl,
    ...(pick.c.place ? { place: pick.c.place } : {}),
    label: pick.c.label,
    score: pick.s,
    considered: scored.length,
  };
}

/** Answers a decision offered to the AI (push out reply, after a foul, choosing a colour…). */
export function chooseDecision(input: AiInput): string {
  const d = input.turn.decision;
  if (!d) return '';
  const ids = d.choices.map((c) => c.id);
  const ease = bestPotEase(input.ruleset.table, input.balls, input.turn.targets);
  if (ids.includes('red') && ids.includes('yellow')) {
    // Choose the colour with fewer balls left to pot.
    const left = (p: string) =>
      input.balls.filter((b) => b.state !== 'pocketed' && b.id.startsWith(p)).length;
    return left('r') <= left('y') ? 'red' : 'yellow';
  }
  if (ids.includes('break')) return 'break';
  if (ids.includes('again')) {
    // Snooker, after the opponent's foul: play on if there is a chance, otherwise make them play again
    // (or replace the balls after a miss).
    if (input.turn.freeBall || ease > 0.2) return 'play';
    return ids.includes('replace') ? 'replace' : 'again';
  }
  if (ids.includes('play') && ids.includes('pass')) return ease > 0.2 ? 'play' : 'pass';
  return ids[0]!;
}
