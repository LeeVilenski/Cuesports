import { makeBall, type BallState, type ShotInput, type ShotResult } from '@cuesports/physics';
import type { Judgement, ShotDeclaration } from '@cuesports/rules';
import type { ClothSpeed } from './games';
import type { MatchConfig } from './match';

/**
 * Compact match records. These are what a replay or the stats screen reads back: a shot is the
 * table before it (each ball at rest as `[id, x, y]`, a potted ball as `[id]`, in the
 * simulation's order), the stroke and
 * what the rules made of it. The physics is deterministic, so replaying a shot is simulating it
 * again from `before` with `shot`. Nothing about the trajectory is stored.
 */

/**
 * A ball at rest: id and position (metres, full precision so the replay matches exactly), or just
 * the id for a ball that is off the table.
 */
export type BallAt = [id: string, x: number, y: number] | [id: string];

export interface ShotRecord {
  player: number;
  before: BallAt[];
  shot: ShotInput;
  decl: ShotDeclaration;
  /** Ball the cue ball hit first, or null for a miss. */
  firstHit: string | null;
  /** Object balls potted. */
  potted: string[];
  /** Foul codes; empty for a legal shot. */
  fouls: string[];
  /** Points the shooter scored (snooker), or legal pots (pool). */
  scored: number;
  /** The shot was the break-off. */
  isBreak: boolean;
}

export interface RackRecord {
  breaker: number;
  shots: ShotRecord[];
  /** Null while the rack is in progress (or was abandoned). */
  winner: number | null;
  reason: string;
}

export interface MatchRecord {
  id: string;
  /** Start time, ms since the epoch. */
  date: number;
  config: MatchConfig;
  cloth: ClothSpeed;
  /** Radius and mass per ball id, to rebuild the balls. */
  specs: Record<string, [radius: number, mass: number]>;
  racks: RackRecord[];
  /** Racks or frames won. */
  score: [number, number];
  winner: number | null;
}

/** One saved shot. */
export interface Highlight {
  id: string;
  date: number;
  title: string;
  /** The match's game, or null for a practice table. */
  game: MatchConfig['game'] | null;
  /** Practice table id (GameDef id) when `game` is null. */
  table?: string;
  cloth: ClothSpeed;
  players: [string, string];
  specs: MatchRecord['specs'];
  shot: ShotRecord;
}

export function compactBalls(balls: readonly BallState[]): BallAt[] {
  return balls.map((b) => (b.state === 'pocketed' ? [b.id] : [b.id, b.pos.x, b.pos.y]));
}

export function specsOf(balls: readonly BallState[]): MatchRecord['specs'] {
  return Object.fromEntries(balls.map((b) => [b.id, [b.radius, b.mass]]));
}

/** Rebuilds the balls at rest, in the same order (the simulation's results depend on it). */
export function expandBalls(at: readonly BallAt[], specs: MatchRecord['specs']): BallState[] {
  return at.map(([id, x, y]) => {
    const [radius, mass] = specs[id] ?? [0.028575, 0.17];
    const b = makeBall(id, { radius, mass }, { x: x ?? 0, y: y ?? 0 });
    if (x === undefined) b.state = 'pocketed';
    return b;
  });
}

/** Where a ball stood before the shot, or null if it was off the table. */
export function ballAt(at: readonly BallAt[], id: string | null): { x: number; y: number } | null {
  const b = at.find((a) => a[0] === id);
  return b && b.length === 3 ? { x: b[1], y: b[2] } : null;
}

/** The ball the struck ball touched first. */
export function firstContact(result: ShotResult, cue: string): string | null {
  for (const e of result.events) {
    if (e.type === 'ball' && (e.a === cue || e.b === cue)) return e.a === cue ? e.b : e.a;
  }
  return null;
}

export function shotRecord(
  player: number,
  before: readonly BallState[],
  shot: ShotInput,
  decl: ShotDeclaration,
  result: ShotResult,
  j: Judgement<unknown>,
  scored: number,
  isBreak: boolean,
): ShotRecord {
  return {
    player,
    before: compactBalls(before),
    shot: structuredClone(shot),
    decl: structuredClone(decl),
    firstHit: firstContact(result, shot.ball),
    potted: [...j.potted],
    fouls: j.fouls.map((f) => f.code),
    scored,
    isBreak,
  };
}

/** A sortable, unique-enough id. */
export const recordId = (date: number): string =>
  `${date.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Shots to watch one after another: a frame of a saved match, or a highlight. */
export interface Reel {
  title: string;
  /** GameDef id of the table. */
  table: string;
  cloth: ClothSpeed;
  players: [string, string];
  specs: MatchRecord['specs'];
  shots: ShotRecord[];
}

export function reelOfRack(m: MatchRecord, rack: number): Reel {
  const unit = m.config.game === 'snooker' ? 'Frame' : 'Rack';
  return {
    title: `${m.config.players[0]} v ${m.config.players[1]} · ${unit} ${rack + 1}`,
    table: m.config.game,
    cloth: m.cloth,
    players: m.config.players,
    specs: m.specs,
    shots: m.racks[rack]?.shots ?? [],
  };
}

export function reelOfHighlight(h: Highlight): Reel {
  return {
    title: h.title,
    table: h.game ?? h.table ?? 'nine-ball',
    cloth: h.cloth,
    players: h.players,
    specs: h.specs,
    shots: [h.shot],
  };
}

/** "the 9", "a red", "the black" for a list of potted balls. */
export function ballsLabel(ids: readonly string[]): string {
  return ids.map((id) => (/^red\d*$/.test(id) ? 'a red' : `the ${id}`)).join(', ');
}
