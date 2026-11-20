/// <reference lib="webworker" />
import { chooseShot, type AiShot } from '@cuesports/ai';
import type { BallState } from '@cuesports/physics';
import { ENGLISH_POOL, NINE_BALL, SNOOKER, TEN_BALL, type Ruleset, type Turn } from '@cuesports/rules';
import type { TableSpec } from '@cuesports/shared';

export interface AiRequest {
  id: number;
  game: string;
  options: unknown;
  state: unknown;
  turn: Turn;
  balls: BallState[];
  me: number;
  level: number;
  seed: number;
  simTable: TableSpec;
  budgetMs: number;
  /** Personality: −1 cautious to 1 attacking. */
  attack?: number;
}

export interface AiResponse {
  id: number;
  ai: AiShot;
  ms: number;
}

const RULESETS: Record<string, Ruleset<unknown, unknown>> = {
  'nine-ball': NINE_BALL as Ruleset<unknown, unknown>,
  'ten-ball': TEN_BALL as Ruleset<unknown, unknown>,
  snooker: SNOOKER as Ruleset<unknown, unknown>,
  english: ENGLISH_POOL as Ruleset<unknown, unknown>,
};

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const r = e.data;
  const t0 = performance.now();
  const ai = chooseShot({
    ruleset: RULESETS[r.game]!,
    options: r.options,
    state: r.state,
    turn: r.turn,
    balls: r.balls,
    me: r.me,
    level: r.level,
    seed: r.seed,
    simTable: r.simTable,
    budgetMs: r.budgetMs,
    attack: r.attack ?? 0,
    now: () => performance.now(),
  });
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({
    id: r.id,
    ai,
    ms: performance.now() - t0,
  } satisfies AiResponse);
};
