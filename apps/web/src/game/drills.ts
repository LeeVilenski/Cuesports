import { makeBall, type BallState } from '@cuesports/physics';
import type { Judgement, RotationState, Turn } from '@cuesports/rules';
import type { TableSpec } from '@cuesports/shared';

/**
 * Practice drills. Each is a match against nobody (or a "ghost") on the normal rules, with a
 * set-up of its own and a rule for when it ends:
 *
 * - Snooker line-up: the reds in a line down the middle, the colours on their spots, ball in hand
 *   in the D. Make the highest break you can; the drill ends at the first miss or foul.
 * - 9-ball ghost: break, then ball in hand anywhere. Run the rack to win it; miss or foul and the
 *   ghost wins it. A race to five.
 */
export type DrillId = 'lineup' | 'ghost';

export interface DrillDef {
  id: DrillId;
  title: string;
  /** One line for the Practice screen. */
  blurb: string;
  game: 'snooker' | 'nine-ball';
  raceTo: number;
  /** Name for the other seat. */
  opponent: string;
}

export const DRILLS: Record<DrillId, DrillDef> = {
  lineup: {
    id: 'lineup',
    title: 'Snooker line-up',
    blurb: 'Reds in a line: make your best break',
    game: 'snooker',
    raceTo: 1,
    opponent: 'Line-up',
  },
  ghost: {
    id: 'ghost',
    title: '9-ball ghost',
    blurb: 'Run out, or the ghost wins the rack',
    game: 'nine-ball',
    raceTo: 5,
    opponent: 'Ghost',
  },
};

const spotOf = (table: TableSpec, id: string): { x: number; y: number } => {
  const m = table.markings.find((x) => x.type === 'spot' && x.id === id);
  return m && m.type === 'spot' ? { ...m.position } : { x: 0, y: 0 };
};

/**
 * The line-up: 15 reds evenly along the long axis between the brown and black spots, kept clear
 * of the colour spots on the way, with the colours on their spots. The cue ball waits in the D.
 */
export function lineupBalls(table: TableSpec, start: readonly BallState[]): BallState[] {
  const obj = table.balls.object;
  const R = obj.radius;
  const from = spotOf(table, 'brown').x + 4 * R;
  const to = spotOf(table, 'black').x - 3 * R;
  const spots = ['blue', 'pink', 'black', 'brown'].map((c) => spotOf(table, c).x);
  const slots: number[] = [];
  for (let x = from; x <= to; x += 2 * R + 0.004) {
    if (spots.every((s) => Math.abs(s - x) > 2 * R + 0.004)) slots.push(x);
  }
  const pick = (i: number) => slots[Math.round((i * (slots.length - 1)) / 14)] ?? 0;
  const reds = Array.from({ length: 15 }, (_, i) => makeBall(`red${i + 1}`, obj, { x: pick(i), y: 0 }));
  const rest = start.filter((b) => !b.id.startsWith('red')).map((b) => ({ ...b, pos: { ...b.pos } }));
  return [...reds, ...rest];
}

/** After the drill's first shot, what changes: the turn, and whether the rack is over. */
export interface DrillOutcome {
  state: unknown;
  turn: Turn;
  /** The rack ends here, won by this seat. */
  frame: { winner: number; reason: string } | null;
  message: string | null;
}

/** Applies the drill's own rule to a judged shot. */
export function drillRule(
  drill: DrillId,
  j: Judgement<unknown>,
  wasBreak: boolean,
  names: [string, string],
): DrillOutcome {
  const same: DrillOutcome = { state: j.state, turn: j.turn, frame: null, message: null };
  if (j.frame) return same;
  if (drill === 'lineup') {
    // One visit: the drill is over when the turn would pass.
    if (j.turn.player === 0) return same;
    return { ...same, frame: { winner: 1, reason: 'missed' }, message: `${names[0]}'s break is over.` };
  }
  // Ghost: ball in hand after the break, then any miss or foul gives the rack to the ghost.
  if (wasBreak) {
    const s = j.state as RotationState;
    return {
      state: { ...s, phase: 'play', shooter: 0, ballInHand: 'anywhere' } satisfies RotationState,
      turn: {
        ...j.turn,
        player: 0,
        ballInHand: 'anywhere',
        canPushOut: false,
        decision: null,
        fouls: 0,
        isBreak: false,
      },
      frame: null,
      message: `${names[0]}: ball in hand. Run the rack.`,
    };
  }
  if (j.turn.player === 0) return same;
  return { ...same, frame: { winner: 1, reason: 'missed' }, message: 'Missed: the ghost wins the rack.' };
}

/** Personal bests: the line-up's highest break, and racks won against the ghost in one race. */
export type DrillBests = Partial<Record<DrillId, number>>;

const BESTS_KEY = 'cuesports.drillBests';

export function loadBests(): DrillBests {
  try {
    return JSON.parse(localStorage.getItem(BESTS_KEY) ?? '{}') as DrillBests;
  } catch {
    return {};
  }
}

/** Records a score; returns true if it beats the previous best. */
export function recordBest(id: DrillId, score: number): boolean {
  const bests = loadBests();
  // Nothing is a best until something has been scored.
  const better = score > 0 && score > (bests[id] ?? 0);
  if (better) {
    bests[id] = score;
    try {
      localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
    } catch {
      // Not kept; fine for this session.
    }
  }
  return better;
}

/** "Best break 34" / "Best 4 of 5 racks", or the blurb before the first go. */
export function bestLabel(id: DrillId, bests: DrillBests = loadBests()): string {
  const b = bests[id];
  if (b === undefined) return DRILLS[id].blurb;
  return id === 'lineup' ? `Best break ${b}` : `Best ${b} of ${DRILLS[id].raceTo} racks`;
}
