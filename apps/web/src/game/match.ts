import type { BallState, ShotResult } from '@cuesports/physics';
import {
  NINE_BALL,
  type Judgement,
  type NineBallOptions,
  type NineBallState,
  type ShotDeclaration,
  type Turn,
} from '@cuesports/rules';
import { Rng } from '@cuesports/shared';

export interface MatchConfig {
  players: [string, string];
  /** Racks needed to win the match. */
  raceTo: number;
  /** Who breaks the next rack. */
  breaks: 'winner' | 'alternate';
  rules: NineBallOptions;
}

export const DEFAULT_MATCH: MatchConfig = {
  players: ['Player 1', 'Player 2'],
  raceTo: 3,
  breaks: 'alternate',
  rules: NINE_BALL.defaults,
};

/** A local two-player 9-ball match: racks, scores and turns. The ruleset does the judging. */
export class Match {
  readonly ruleset = NINE_BALL;
  score: [number, number] = [0, 0];
  rack = 0;
  breaker = 0;
  state!: NineBallState;
  turn!: Turn;
  balls: BallState[] = [];
  /** Message about the last shot or decision, with names filled in. */
  message = '';
  /** Set when a rack ends: who won it and why. */
  rackResult: { winner: number; reason: string } | null = null;
  /** Set when the match is over. */
  winner: number | null = null;
  private rng: Rng;

  constructor(
    readonly config: MatchConfig,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    this.startRack();
  }

  get table() {
    return this.ruleset.table;
  }

  /** Fills in player names in a ruleset message. */
  names(text: string): string {
    return text.replace(/\{p([01])\}/g, (_, i: string) => this.config.players[Number(i)]!);
  }

  startRack(): void {
    this.rack++;
    this.rackResult = null;
    const f = this.ruleset.newFrame(this.config.rules, this.rng, this.breaker);
    this.state = f.state;
    this.turn = f.turn;
    this.balls = f.balls;
    this.message = `Rack ${this.rack}: ${this.config.players[this.breaker]} to break.`;
  }

  judge(decl: ShotDeclaration, before: BallState[], result: ShotResult): Judgement<NineBallState> {
    const j = this.ruleset.judge(this.state, decl, before, result, this.config.rules);
    this.apply(j);
    if (j.frame) {
      this.score[j.frame.winner] = (this.score[j.frame.winner] ?? 0) + 1;
      this.rackResult = j.frame;
      if ((this.score[j.frame.winner] ?? 0) >= this.config.raceTo) this.winner = j.frame.winner;
      else this.breaker = this.config.breaks === 'winner' ? j.frame.winner : 1 - this.breaker;
    }
    return j;
  }

  decide(choice: string): Judgement<NineBallState> {
    const j = this.ruleset.decide(this.state, choice, this.balls, this.config.rules);
    this.apply(j);
    return j;
  }

  private apply(j: Judgement<NineBallState>): void {
    this.state = j.state;
    this.turn = j.turn;
    this.balls = j.balls;
    this.message = this.names(j.message);
  }
}
