import type { BallState, ShotResult } from '@cuesports/physics';
import {
  ENGLISH_POOL,
  ENGLISH_PRESETS,
  NINE_BALL,
  pointsRemaining,
  SNOOKER,
  TEN_BALL,
  type Judgement,
  type RotationOptions,
  type Ruleset,
  type ShotDeclaration,
  type SnookerOptions,
  type SnookerState,
  type Turn,
} from '@cuesports/rules';
import { Rng } from '@cuesports/shared';

export type MatchGame = 'nine-ball' | 'ten-ball' | 'snooker' | 'english';
export type EnglishPreset = keyof typeof ENGLISH_PRESETS;

export interface MatchConfig {
  game: MatchGame;
  players: [string, string];
  /** Racks (or frames) needed to win the match. */
  raceTo: number;
  /** Who breaks the next rack. (Snooker alternates the break-off.) */
  breaks: 'winner' | 'alternate';
  rules: RotationOptions;
  snooker: SnookerOptions;
  /** English pool rulebook preset. */
  english: EnglishPreset;
  /** Skill level (1–5) of the computer playing as player 2, or null for a second human. */
  ai: number | null;
}

export const DEFAULT_MATCH: MatchConfig = {
  game: 'nine-ball',
  players: ['Player 1', 'Player 2'],
  raceTo: 3,
  breaks: 'alternate',
  rules: NINE_BALL.defaults,
  snooker: SNOOKER.defaults,
  english: 'international',
  ai: null,
};

/** Frame points, current break and points remaining (snooker). */
export interface FramePoints {
  points: [number, number];
  break: number;
  remaining: number;
}

// The match only needs the common ruleset interface; each game's state stays inside its ruleset.
type AnyRuleset = Ruleset<unknown, unknown>;

/**
 * A local two-player match of 9-ball, 10-ball or snooker: racks or frames, scores and turns. The
 * ruleset does the judging.
 */
export class Match {
  readonly ruleset: AnyRuleset;
  private readonly options: unknown;
  /** Racks or frames won. */
  score: [number, number] = [0, 0];
  rack = 0;
  breaker = 0;
  state: unknown;
  turn!: Turn;
  balls: BallState[] = [];
  /** Message about the last shot or decision, with names filled in. */
  message = '';
  /**
   * Whether the latest message needs the player's attention (a foul, ball in hand, a decision, a push
   * out, a new or finished rack). Routine results ("potted the 8 and plays again") are not shown.
   */
  notable = true;
  /** Set when a rack or frame ends: who won it and why. */
  rackResult: { winner: number; reason: string } | null = null;
  /** Set when the match is over. */
  winner: number | null = null;
  /** Set when the last shot or decision re-racked the balls (an illegal break, say). */
  reracked = false;
  private rng: Rng;

  constructor(
    readonly config: MatchConfig,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    const games: Record<MatchGame, [AnyRuleset, unknown]> = {
      'nine-ball': [NINE_BALL as AnyRuleset, config.rules],
      'ten-ball': [TEN_BALL as AnyRuleset, config.rules],
      snooker: [SNOOKER as AnyRuleset, config.snooker],
      english: [ENGLISH_POOL as AnyRuleset, ENGLISH_PRESETS[config.english].options],
    };
    [this.ruleset, this.options] = games[config.game];
    this.startRack();
  }

  get table() {
    return this.ruleset.table;
  }

  /** The ruleset's options for this match (passed to the AI). */
  get ruleOptions(): unknown {
    return this.options;
  }

  /** Whether the given player is the computer. */
  isAi(player: number): boolean {
    return this.config.ai !== null && player === 1;
  }

  get isSnooker(): boolean {
    return this.config.game === 'snooker';
  }

  /** "rack" or "frame". */
  get unit(): string {
    return this.isSnooker ? 'frame' : 'rack';
  }

  /** Snooker frame points, break and points remaining, or null for pool. */
  get framePoints(): FramePoints | null {
    if (!this.isSnooker) return null;
    const s = this.state as SnookerState;
    return { points: s.scores, break: s.break, remaining: pointsRemaining(s, this.balls) };
  }

  /** Fills in player names in a ruleset message. */
  names(text: string): string {
    return text.replace(/\{p([01])\}/g, (_, i: string) => this.config.players[Number(i)]!);
  }

  startRack(): void {
    this.rack++;
    this.rackResult = null;
    const f = this.ruleset.newFrame(this.options, this.rng, this.breaker);
    this.state = f.state;
    this.turn = f.turn;
    this.balls = f.balls;
    const what = this.isSnooker
      ? `Frame ${this.rack}: ${this.config.players[this.breaker]} to break off.`
      : `Rack ${this.rack}: ${this.config.players[this.breaker]} to break.`;
    this.message = what;
    this.notable = true;
  }

  judge(decl: ShotDeclaration, before: BallState[], result: ShotResult): Judgement<unknown> {
    const j = this.ruleset.judge(this.state, decl, before, result, this.options);
    this.apply(j);
    if (j.frame) this.endRack(j.frame);
    return j;
  }

  decide(choice: string): Judgement<unknown> {
    const j = this.ruleset.decide(this.state, choice, this.balls, this.options);
    this.apply(j);
    return j;
  }

  /** Re-racks without scoring (illegal break, 8 on the break), keeping the ruleset's message. */
  private rerack(breaker: number): void {
    const message = this.message;
    this.breaker = breaker;
    this.rack--;
    this.startRack();
    this.message = `${message} ${this.message}`;
    this.reracked = true;
  }

  /** The player at the table concedes the rack or frame. */
  concede(): void {
    if (this.rackResult || this.winner !== null) return;
    const loser = this.turn.player;
    this.message = `${this.config.players[loser]} concedes the ${this.unit}.`;
    this.notable = true;
    this.endRack({ winner: 1 - loser, reason: 'conceded' });
  }

  private endRack(frame: { winner: number; reason: string }): void {
    this.score[frame.winner] = (this.score[frame.winner] ?? 0) + 1;
    this.rackResult = frame;
    if ((this.score[frame.winner] ?? 0) >= this.config.raceTo) this.winner = frame.winner;
    else {
      const alternate = this.isSnooker || this.config.breaks === 'alternate';
      this.breaker = alternate ? 1 - this.breaker : frame.winner;
    }
  }

  private apply(j: Judgement<unknown>): void {
    this.reracked = false;
    this.state = j.state;
    this.turn = j.turn;
    this.balls = j.balls;
    this.message = this.names(j.message);
    const t = j.turn;
    this.notable =
      j.fouls.length > 0 ||
      !!j.frame ||
      !!j.rerack ||
      !!t.decision ||
      t.ballInHand !== 'none' ||
      !!t.freeBall ||
      t.canPushOut;
    if (j.rerack) this.rerack(j.rerack.breaker);
  }
}
