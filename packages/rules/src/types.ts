import type { BallState, ShotResult } from '@cuesports/physics';
import type { Rng, TableSpec } from '@cuesports/shared';

/**
 * Rulesets are pure functions of (state, shot, physics result). They never touch the DOM or the
 * renderer, so they run in tests, in the AI worker (M5) and in the game the same way.
 */

/** Where the incoming player may place the cue ball. */
export type BallInHand = 'none' | 'anywhere' | 'behind-head-string' | 'in-d';

export interface RuleOption {
  id: string;
  label: string;
  type: 'boolean' | 'number';
  default: boolean | number;
  min?: number;
  max?: number;
}

export interface Decision {
  prompt: string;
  choices: { id: string; label: string }[];
}

/** What the player at the table may or must do next. */
export interface Turn {
  player: number;
  ballInHand: BallInHand;
  /** Balls the cue ball must hit first. Empty means any ball. */
  targets: string[];
  /** The player may declare a push out for this shot. */
  canPushOut: boolean;
  /** The shot must be called (ball and pocket) or declared a safety. */
  mustCall: boolean;
  /** The player must nominate a ball (snooker: a colour after a red, or a free ball). */
  mustNominate?: boolean;
  /** A free ball has been awarded: any ball may be nominated as the ball on. */
  freeBall?: boolean;
  /** A choice the player must make before anyone shoots (e.g. after a push out). */
  decision: Decision | null;
  isBreak: boolean;
  /** Consecutive fouls by this player in the current frame (for the three-foul warning). */
  fouls: number;
}

/** What the shooter declared before the shot. */
export interface ShotDeclaration {
  pushOut?: boolean;
  /** Called ball and pocket, for call-shot games (10-ball, straight pool). */
  call?: { ball: string; pocket: string };
  /** A declared safety in a call-shot game: balls potted stay down and the turn passes. */
  safety?: boolean;
  /** Nominated ball (snooker: the colour after a red, or the free ball). */
  nominate?: string;
}

export interface Foul {
  code:
    | 'scratch'
    | 'no-contact'
    | 'wrong-ball-first'
    | 'no-rail'
    | 'off-table'
    | 'illegal-break'
    | 'three-fouls'
    | 'wrong-ball-potted'
    | 'no-nomination'
    | 'three-misses';
  message: string;
}

export interface FrameResult {
  winner: number;
  reason: string;
}

export interface Judgement<S> {
  state: S;
  /** Balls after the rules have been applied (spotted balls, etc.). */
  balls: BallState[];
  fouls: Foul[];
  /** Object balls potted on this shot. */
  potted: string[];
  turn: Turn;
  frame: FrameResult | null;
  /** One-line summary for the HUD, e.g. "Foul: hit the 3 first. Player 2 has ball in hand." */
  message: string;
  /** Points per player, for scoring games (unused by 9-ball). */
  points?: number[];
}

export interface Ruleset<S, O> {
  id: string;
  name: string;
  table: TableSpec;
  players: { min: number; max: number };
  options: RuleOption[];
  defaults: O;
  /** Racks the balls and returns the opening state, with `breaker` to break. */
  newFrame(opts: O, rng: Rng, breaker: number): { balls: BallState[]; state: S; turn: Turn };
  /** Judges a shot from the balls before it, the declaration and the physics result. */
  judge(state: S, decl: ShotDeclaration, before: BallState[], result: ShotResult, opts: O): Judgement<S>;
  /** Applies a decision (from Turn.decision) taken by the current player. */
  decide(state: S, choice: string, balls: BallState[], opts: O): Judgement<S>;
}
