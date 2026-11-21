import type { BallState, ShotInput, ShotResult } from '@cuesports/physics';
import {
  BALKLINE_47_2,
  BALKLINE_71_2,
  THREE_CUSHION,
  RUSSIAN_PYRAMID,
  CHINESE_8BALL,
  STRAIGHT_POOL,
  ONE_POCKET,
  type OnePocketState,
  type StraightState,
  type PyramidState,
  type CaromState,
  ENGLISH_BILLIARDS,
  type BilliardsOptions,
  type BilliardsState,
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
import { drillRule, lineupBalls, type DrillId } from './drills';
import type { ClothSpeed } from './games';
import { recordId, shotRecord, specsOf, type MatchRecord, type RackRecord } from './record';

export type MatchGame =
  | 'nine-ball'
  | 'ten-ball'
  | 'snooker'
  | 'english'
  | 'billiards'
  | 'three-cushion'
  | 'balkline-47-2'
  | 'balkline-71-2'
  | 'pyramid'
  | 'chinese-8ball'
  | 'straight-pool'
  | 'one-pocket';

/** Games scored in points rather than racks won (frame or game to a target). */
export const POINTS_GAMES = new Set<MatchGame>([
  'snooker',
  'billiards',
  'three-cushion',
  'balkline-47-2',
  'balkline-71-2',
  'pyramid',
  'straight-pool',
  'one-pocket',
]);
/** Games without pockets. */
export const CAROM_GAMES = new Set<MatchGame>(['three-cushion', 'balkline-47-2', 'balkline-71-2']);
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
  /** English Billiards: points to win a game. Older saves lack it. */
  billiards?: BilliardsOptions | undefined;
  /** Carom games: points to win a game (0 = the game's own default). */
  caromTarget?: number | undefined;
  /** English pool rulebook preset. */
  english: EnglishPreset;
  /** Skill level (1–5) of the computer playing as player 2, or null for a second human. */
  ai: number | null;
  /** A practice drill (snooker line-up, 9-ball ghost) instead of a match. */
  drill?: DrillId | undefined;
  /** The computer's personality, −1 cautious to 1 attacking (career opponents). */
  aiAttack?: number | undefined;
  /** The computer's look: an index into the presets (career opponents have their own). */
  aiLook?: number | undefined;
  /** A career match: the event and round it belongs to. */
  career?: { event: string; round: number } | undefined;
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
  /** Snooker only: points left on the table. */
  remaining: number | null;
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
  /** Everything played so far, for replays and stats. */
  readonly record: MatchRecord;
  private rng: Rng;

  constructor(
    readonly config: MatchConfig,
    seed = 1,
    cloth: ClothSpeed = 'medium',
    date = Date.now(),
  ) {
    this.rng = new Rng(seed);
    this.record = {
      id: recordId(date),
      date,
      config: structuredClone(config),
      cloth,
      specs: {},
      racks: [],
      score: [0, 0],
      winner: null,
    };
    const games: Record<MatchGame, [AnyRuleset, unknown]> = {
      'nine-ball': [NINE_BALL as AnyRuleset, config.rules],
      'ten-ball': [TEN_BALL as AnyRuleset, config.rules],
      snooker: [SNOOKER as AnyRuleset, config.snooker],
      english: [ENGLISH_POOL as AnyRuleset, ENGLISH_PRESETS[config.english].options],
      billiards: [ENGLISH_BILLIARDS as AnyRuleset, config.billiards ?? ENGLISH_BILLIARDS.defaults],
      'three-cushion': [
        THREE_CUSHION as AnyRuleset,
        { target: config.caromTarget || THREE_CUSHION.defaults.target },
      ],
      'balkline-47-2': [
        BALKLINE_47_2 as AnyRuleset,
        { target: config.caromTarget || BALKLINE_47_2.defaults.target },
      ],
      pyramid: [RUSSIAN_PYRAMID as AnyRuleset, RUSSIAN_PYRAMID.defaults],
      'chinese-8ball': [CHINESE_8BALL as AnyRuleset, CHINESE_8BALL.defaults],
      'one-pocket': [ONE_POCKET as AnyRuleset, ONE_POCKET.defaults],
      'straight-pool': [
        STRAIGHT_POOL as AnyRuleset,
        { target: config.caromTarget || STRAIGHT_POOL.defaults.target },
      ],
      'balkline-71-2': [
        BALKLINE_71_2 as AnyRuleset,
        { target: config.caromTarget || BALKLINE_71_2.defaults.target },
      ],
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

  /** "rack", "frame" or "game". */
  get unit(): string {
    return this.isSnooker ? 'frame' : POINTS_GAMES.has(this.config.game) ? 'game' : 'rack';
  }

  /** Snooker frame points, break and points remaining, or null for pool. */
  get framePoints(): FramePoints | null {
    if (this.config.game === 'one-pocket') {
      const op = this.state as OnePocketState;
      return { points: op.scores, break: op.break, remaining: null };
    }
    if (this.config.game === 'straight-pool') {
      const sp = this.state as StraightState;
      return { points: sp.scores, break: sp.break, remaining: null };
    }
    if (this.config.game === 'pyramid') {
      const py = this.state as PyramidState;
      return { points: py.scores, break: py.break, remaining: null };
    }
    if (CAROM_GAMES.has(this.config.game)) {
      const c = this.state as CaromState;
      return { points: c.scores, break: c.break, remaining: null };
    }
    if (this.config.game === 'billiards') {
      const b = this.state as BilliardsState;
      return { points: b.scores, break: b.break, remaining: null };
    }
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
    this.balls = this.config.drill === 'lineup' ? lineupBalls(this.table, f.balls) : f.balls;
    // A re-rack after an illegal break carries on in the same rack record.
    if (this.record.racks.length < this.rack)
      this.record.racks.push({ breaker: this.breaker, shots: [], winner: null, reason: '' });
    Object.assign(this.record.specs, specsOf(f.balls));
    const what = this.config.drill
      ? this.config.drill === 'lineup'
        ? `${this.config.players[0]}: ball in hand in the D. Make your best break.`
        : `Rack ${this.rack}: ${this.config.players[0]} to break.`
      : this.isSnooker
        ? `Frame ${this.rack}: ${this.config.players[this.breaker]} to break off.`
        : POINTS_GAMES.has(this.config.game) && this.config.game !== 'billiards'
          ? `Game ${this.rack}: ${this.config.players[this.breaker]} to open on the red.`
          : this.config.game === 'billiards'
            ? `Game ${this.rack}: ${this.config.players[this.breaker]} to play first, from the D.`
            : `Rack ${this.rack}: ${this.config.players[this.breaker]} to break.`;
    this.message = what;
    this.notable = true;
  }

  /** The rack or frame being played, in the record. */
  get rackRecord(): RackRecord | undefined {
    return this.record.racks[this.rack - 1];
  }

  /**
   * Judges a shot. With the stroke given, the shot is also added to the match record (the AI's
   * look-ahead and tests can leave it out).
   */
  judge(
    decl: ShotDeclaration,
    before: BallState[],
    result: ShotResult,
    shot?: ShotInput,
  ): Judgement<unknown> {
    const player = this.turn.player;
    const isBreak = this.turn.isBreak;
    const rack = this.rackRecord;
    const pointsBefore = this.framePoints?.points[player] ?? 0;
    const j = this.ruleset.judge(this.state, decl, before, result, this.options);
    this.apply(j);
    const drill = this.config.drill;
    if (drill && !j.frame && !j.rerack) {
      const d = drillRule(drill, j, isBreak, this.config.players);
      this.state = d.state;
      this.turn = d.turn;
      if (d.message) {
        this.message = d.message;
        this.notable = true;
      }
      if (d.frame) this.endRack(d.frame);
    }
    if (shot && rack) {
      const scored = this.isSnooker
        ? Math.max(0, (this.framePoints?.points[player] ?? 0) - pointsBefore)
        : j.fouls.length
          ? 0
          : j.potted.length;
      rack.shots.push(shotRecord(player, before, shot, decl, result, j, scored, isBreak));
    }
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
    const rack = this.rackRecord;
    if (rack) {
      rack.winner = frame.winner;
      rack.reason = frame.reason;
    }
    this.record.score = [...this.score];
    if ((this.score[frame.winner] ?? 0) >= this.config.raceTo) this.winner = frame.winner;
    else {
      const alternate = this.isSnooker || this.config.breaks === 'alternate';
      // In a drill the player always breaks.
      this.breaker = this.config.drill ? 0 : alternate ? 1 - this.breaker : frame.winner;
    }
    this.record.winner = this.winner;
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
