import { cloneBall, makeBall, rackRows, type BallState, type ShotResult } from '@cuesports/physics';
import { CHINESE_8BALL_9FT, ENGLISH_POOL_7FT, type Rng, type TableSpec } from '@cuesports/shared';
import { shotFacts } from './analysis';
import { headStringX, spotBall, spotOf } from './placement';
import { anyPartHittable, isSnookered } from './snookered';
import type { BallInHand, Foul, Judgement, Ruleset, ShotDeclaration, Turn } from './types';

/**
 * English eight-ball pool (reds, yellows and the black 8), with the differences between rulebooks as
 * options. Two presets, each transcribed from its rulebook:
 *
 * - INTERNATIONAL: International Eightball Pool Rules v2d (Jan 2026), endorsed by Ultimate Pool.
 *   Clause numbers in comments refer to it.
 * - WEPF: World Eightball Pool Federation rules (abridged, Jan 2020), used by the EPA.
 *   Clause letters in comments refer to it.
 *
 * Both: a legal shot hits a ball "on" first, then pots a ball or sends any ball to a cushion (6p, G1).
 * The frame is lost by fouling while potting the 8, potting it before the group is cleared, or potting
 * it with the last ball of the group (6f, M). Balls forced off the table are re-spotted (6m, S).
 *
 * Not implemented (they need a referee's judgement or real-world events): lag for break, shot clock,
 * frozen-ball rule (6h), stalemate (6g, W), push shots and double hits, coaching and conduct fouls.
 */

export type Group = 'red' | 'yellow';
/**
 * Internally the two groups are always 'red' and 'yellow'. With numbered balls (Chinese 8-ball)
 * the solids 1–7 are the 'red' group and the stripes 9–15 the 'yellow' group.
 */
const groupOf = (id: string): Group | null => {
  if (id.startsWith('r')) return 'red';
  if (id.startsWith('y')) return 'yellow';
  const n = Number(id);
  return n >= 1 && n <= 7 ? 'red' : n >= 9 && n <= 15 ? 'yellow' : null;
};

/** How the groups are named to the player. */
export type BallStyle = 'colours' | 'numbers';
const plural = (g: Group, style: BallStyle): string =>
  style === 'numbers' ? (g === 'red' ? 'solids' : 'stripes') : `${g}s`;
const otherGroup = (g: Group): Group => (g === 'red' ? 'yellow' : 'red');

export interface EnglishOptions {
  /** 4f: three points (pots plus balls past the centre line). F4a: a colour potted or four balls to a cushion. */
  legalBreak: 'three-points' | 'colour-or-four-cushions';
  /** 4g: re-rack and the opponent chooses who breaks. F4b: re-rack and the opponent breaks. */
  illegalBreak: 'rerack-opponent-chooses' | 'rerack-opponent-breaks';
  /** 4i: the 8 is re-spotted. F5: re-rack and the same player breaks again. */
  eightOnBreak: 'respot' | 'rerack-same-breaker';
  /** Visits for the incoming player after a standard foul: 6e one visit; K two visits. */
  foulVisits: 1 | 2;
  /** 6e: cue ball in hand anywhere. WEPF: played from where it lies (from baulk if it went in or off). */
  foulCueBall: 'in-hand-anywhere' | 'where-it-lies';
  /** 6d: potting an opponent's ball (without your own) is loss of turn. K3: it is a standard foul. */
  opponentBall: 'loss-of-turn' | 'foul';
  /** G3b: when totally snookered, only the first contact is required (no pot or cushion). */
  totalSnooker: boolean;
  /** P: after a foul that leaves the next player snookered, they may nominate an opponent's ball or the 8. */
  foulSnooker: boolean;
  /** Open table. 6a: the group struck first is the call. H3: potting both colours means choosing one. */
  groupChoice: 'first-contact' | 'choose-after-both';
}

export const INTERNATIONAL_RULES: EnglishOptions = {
  legalBreak: 'three-points',
  illegalBreak: 'rerack-opponent-chooses',
  eightOnBreak: 'respot',
  foulVisits: 1,
  foulCueBall: 'in-hand-anywhere',
  opponentBall: 'loss-of-turn',
  totalSnooker: false,
  foulSnooker: false,
  groupChoice: 'first-contact',
};

export const WEPF_RULES: EnglishOptions = {
  legalBreak: 'colour-or-four-cushions',
  illegalBreak: 'rerack-opponent-breaks',
  eightOnBreak: 'rerack-same-breaker',
  foulVisits: 2,
  foulCueBall: 'where-it-lies',
  opponentBall: 'foul',
  totalSnooker: true,
  foulSnooker: true,
  groupChoice: 'choose-after-both',
};

export const ENGLISH_PRESETS = {
  international: { label: 'International / Ultimate Pool (default)', options: INTERNATIONAL_RULES },
  wepf: { label: 'World Eightball (WEPF / EPA)', options: WEPF_RULES },
} as const;

export interface EnglishState {
  phase: 'break' | 'play' | 'decision' | 'over';
  shooter: number;
  groups: [Group | null, Group | null];
  /** Visits left for the shooter, including the current one. */
  visits: number;
  ballInHand: BallInHand;
  /** WEPF H2c(ii): a colour chosen after the break that the player must pot next to be on it. */
  pendingGroup: Group | null;
  /** WEPF P: the shooter may nominate an opponent's ball or the 8 for this shot. */
  foulSnooker: boolean;
  decision: 'illegal-break' | 'choose-group' | null;
  /** Groups potted on the last shot (for choose-group decisions). */
  lastPotted: Group[];
}

const other = (p: number) => 1 - p;
const name = (p: number) => `{p${p}}`;
const live = (balls: readonly BallState[]) => balls.filter((b) => b.state !== 'pocketed' && b.id !== 'cue');
const ballsOfGroup = (balls: readonly BallState[], g: Group) =>
  live(balls)
    .filter((b) => groupOf(b.id) === g)
    .map((b) => b.id);

/** Balls the shooter may hit first. */
function ballsOn(state: EnglishState, balls: readonly BallState[]): string[] {
  const g = state.groups[state.shooter];
  if (!g)
    return live(balls)
      .filter((b) => groupOf(b.id) !== null)
      .map((b) => b.id);
  const own = ballsOfGroup(balls, g);
  return own.length ? own : live(balls).some((b) => b.id === '8') ? ['8'] : [];
}

function rack(table: TableSpec, rng: Rng, style: BallStyle): BallState[] {
  const spec = table.balls.object;
  const spot = spotOf(table, 'black') ?? spotOf(table, 'foot') ?? { x: table.playfield.length / 4, y: 0 };
  // Rule 5: the 8 on the 8-ball spot, in the middle of the third row.
  const pitch = 2 * spec.radius + 0.0002;
  const apex = { x: spot.x - 2 * ((pitch * Math.sqrt(3)) / 2), y: 0 };
  const ids =
    style === 'numbers'
      ? ['1', '9', '2', '10', '8', '3', '11', '4', '12', '5', '13', '6', '14', '7', '15']
      : ['r1', 'y1', 'r2', 'r3', '8', 'y2', 'y3', 'r4', 'y4', 'r5', 'r6', 'y5', 'y6', 'r7', 'y7'];
  const balls = rackRows(ids, spec, apex, [1, 2, 3, 4, 5], { rng });
  balls.push(makeBall('cue', table.balls.cue, { x: headStringX(table) - 0.12, y: 0.05 }));
  return balls;
}

function turnFor(state: EnglishState, balls: readonly BallState[], decision: Turn['decision'] = null): Turn {
  const g = state.groups[state.shooter];
  const nominatable = state.foulSnooker
    ? [
        ...(g ? ballsOfGroup(balls, otherGroup(g)) : []),
        ...(live(balls).some((b) => b.id === '8') ? ['8'] : []),
      ]
    : [];
  return {
    player: state.shooter,
    ballInHand: state.ballInHand,
    targets: state.foulSnooker ? nominatable : ballsOn(state, balls),
    canPushOut: false,
    mustCall: false,
    mustNominate: state.foulSnooker && nominatable.length > 0,
    freeBall: state.foulSnooker,
    decision,
    isBreak: state.phase === 'break',
    fouls: 0,
    visits: state.visits,
  };
}

/** 6m / S2d: object balls off the table go on the 8-ball spot line, towards the top cushion first. */
function respotOffTable(table: TableSpec, balls: BallState[], ids: string[]): void {
  const spot = spotOf(table, 'black') ?? { x: table.playfield.length / 4, y: 0 };
  const order = (id: string) => (id === '8' ? 0 : id.startsWith('r') ? 1 : 2);
  for (const id of [...ids].sort((a, b) => order(a) - order(b))) spotBall(table, balls, id, spot);
}

/** Puts the cue ball back on the table for ball in hand. */
function returnCueBall(table: TableSpec, balls: BallState[]): void {
  const cue = balls.find((b) => b.id === 'cue');
  if (cue && cue.state === 'pocketed') spotBall(table, balls, 'cue', { x: headStringX(table) - 0.1, y: 0 });
}

export function makeEnglish(
  table: TableSpec = ENGLISH_POOL_7FT,
  style: BallStyle = 'colours',
  id = 'english',
  title = 'English pool',
): Ruleset<EnglishState, EnglishOptions> {
  const ruleset: Ruleset<EnglishState, EnglishOptions> = {
    id,
    name: title,
    table,
    players: { min: 2, max: 2 },
    options: [],
    defaults: INTERNATIONAL_RULES,

    newFrame(_opts, rng, breaker) {
      const balls = rack(table, rng, style);
      const state: EnglishState = {
        phase: 'break',
        shooter: breaker,
        groups: [null, null],
        visits: 1,
        ballInHand: 'behind-head-string',
        pendingGroup: null,
        foulSnooker: false,
        decision: null,
        lastPotted: [],
      };
      return { balls, state, turn: turnFor(state, balls) };
    },

    judge(state, decl: ShotDeclaration, before, result: ShotResult, opts): Judgement<EnglishState> {
      const facts = shotFacts(result);
      const balls = result.final.map(cloneBall);
      const shooter = state.shooter;
      const potted = facts.potted;
      const pottedGroups = [...new Set(potted.map(groupOf).filter((g): g is Group => g !== null))];

      if (state.phase === 'break') return judgeBreak(state, before, balls, facts, opts);

      // --- Ordinary shot ------------------------------------------------------------------------
      const own = state.groups[shooter];
      const onIds = ballsOn(state, before);
      const nominated = state.foulSnooker ? decl.nominate : undefined;
      const allowed = nominated ? [...onIds, nominated] : onIds;
      const cue = before.find((b) => b.id === 'cue')!;
      const touching = before.some(
        (b) =>
          allowed.includes(b.id) &&
          b.state !== 'pocketed' &&
          Math.hypot(b.pos.x - cue.pos.x, b.pos.y - cue.pos.y) <= b.radius + cue.radius + 1e-4,
      );
      const totallySnookered = opts.totalSnooker && !anyPartHittable(before, 'cue', onIds);
      const onEight = own !== null && onIds.length === 1 && onIds[0] === '8';

      const fouls: Foul[] = [];
      if (facts.cueScratch) fouls.push({ code: 'scratch', message: 'the cue ball went in or off' });
      if (!facts.firstContact && !touching)
        fouls.push({ code: 'no-contact', message: 'the cue ball hit nothing' });
      else if (facts.firstContact && !allowed.includes(facts.firstContact) && !touching) {
        fouls.push({ code: 'wrong-ball-first', message: `hit ${describe(facts.firstContact)} first` });
      }
      const pottedLegalBall = potted.some((id) => id !== '8' || onEight);
      if (!totallySnookered && !pottedLegalBall && !facts.railAfterContact && fouls.length === 0) {
        fouls.push({ code: 'no-rail', message: 'nothing was potted and no ball reached a cushion' });
      }
      if (own && opts.opponentBall === 'foul') {
        const theirs = potted.filter((id) => groupOf(id) === otherGroup(own) && id !== nominated);
        if (theirs.length)
          fouls.push({ code: 'wrong-ball-potted', message: `potted ${describe(theirs[0]!)}` });
      }
      if (facts.offTable.length) fouls.push({ code: 'off-table', message: 'a ball left the table' });

      // The 8.
      if (potted.includes('8')) {
        const winner = fouls.length === 0 && onEight ? shooter : other(shooter);
        const reason =
          winner === shooter
            ? 'potted the 8'
            : fouls.length
              ? 'fouled while potting the 8'
              : 'potted the 8 before clearing the group';
        const next: EnglishState = { ...state, phase: 'over' };
        return {
          state: next,
          balls,
          fouls,
          potted,
          turn: turnFor(next, balls),
          frame: { winner, reason },
          message:
            winner === shooter
              ? `${name(shooter)} pots the 8 and wins the frame.`
              : `${name(shooter)} ${reason}: ${name(winner)} wins the frame.`,
        };
      }

      if (fouls.length) {
        respotOffTable(table, balls, facts.offTable);
        const cueGone = facts.cueScratch;
        if (cueGone) returnCueBall(table, balls);
        const incoming = other(shooter);
        const ballInHand: BallInHand =
          opts.foulCueBall === 'in-hand-anywhere' ? 'anywhere' : cueGone ? 'behind-head-string' : 'none';
        const draft: EnglishState = {
          ...state,
          phase: 'play',
          shooter: incoming,
          visits: opts.foulVisits,
          ballInHand,
          pendingGroup: null,
          foulSnooker: false,
          decision: null,
          lastPotted: [],
        };
        const theirOwn = draft.groups[incoming];
        const snookered =
          opts.foulSnooker &&
          theirOwn !== null &&
          !cueGone &&
          isSnookered(balls, 'cue', ballsOn(draft, balls));
        const next: EnglishState = { ...draft, foulSnooker: snookered };
        let message = `Foul: ${fouls[0]!.message}. ${name(incoming)} has ${opts.foulVisits === 2 ? 'two visits' : 'one visit'}`;
        message +=
          ballInHand === 'anywhere'
            ? ' with ball in hand.'
            : ballInHand === 'behind-head-string'
              ? ', playing from baulk.'
              : '.';
        if (snookered)
          message += ` Foul snooker: ${name(incoming)} may nominate one of the opponent's balls.`;
        return { state: next, balls, fouls, potted, turn: turnFor(next, balls), frame: null, message };
      }

      // Legal shot.
      let groups = state.groups;
      let continues = false;
      let decision: EnglishState['decision'] = null;
      let message = '';
      if (!own) {
        // Open table.
        const firstGroup = facts.firstContact ? groupOf(facts.firstContact) : null;
        if (state.pendingGroup && pottedGroups.includes(state.pendingGroup)) {
          groups = assign(shooter, state.pendingGroup);
          continues = true;
          message = `${name(shooter)} is on ${plural(state.pendingGroup!, style)}.`;
        } else if (opts.groupChoice === 'first-contact') {
          if (firstGroup && pottedGroups.includes(firstGroup)) {
            groups = assign(shooter, firstGroup);
            continues = true;
            message = `${name(shooter)} is on ${firstGroup}s.`;
          } else if (pottedGroups.length) {
            message = `${name(shooter)} potted the other group: loss of turn, the table is still open.`;
          }
        } else if (pottedGroups.length === 1) {
          groups = assign(shooter, pottedGroups[0]!);
          continues = true;
          message = `${name(shooter)} is on ${pottedGroups[0]}s.`;
        } else if (pottedGroups.length === 2) {
          continues = true;
          decision = 'choose-group';
          message = `${name(shooter)} potted both colours and must choose.`;
        }
      } else {
        const mine = potted.filter((id) => groupOf(id) === own || id === nominated);
        if (mine.length) {
          continues = true;
          message = `${name(shooter)} pots ${mine.length === 1 ? describe(mine[0]!) : `${mine.length} balls`}.`;
        } else if (potted.length) {
          message = `${name(shooter)} potted ${describe(potted[0]!)}: loss of turn.`;
        }
      }

      let next: EnglishState;
      if (decision) {
        next = {
          ...state,
          phase: 'decision',
          groups,
          decision,
          foulSnooker: false,
          ballInHand: 'none',
          lastPotted: pottedGroups,
        };
        return {
          state: next,
          balls,
          fouls: [],
          potted,
          turn: turnFor(next, balls, chooseGroupDecision(shooter, style)),
          frame: null,
          message,
        };
      }
      if (continues) {
        next = {
          ...state,
          phase: 'play',
          groups,
          foulSnooker: false,
          ballInHand: 'none',
          pendingGroup: null,
        };
      } else if (state.visits > 1) {
        next = {
          ...state,
          phase: 'play',
          groups,
          visits: state.visits - 1,
          foulSnooker: false,
          ballInHand: 'none',
        };
        message = `${message ? message + ' ' : ''}${name(shooter)} has a second visit.`;
      } else {
        next = {
          ...state,
          phase: 'play',
          shooter: other(shooter),
          groups,
          visits: 1,
          foulSnooker: false,
          ballInHand: 'none',
          pendingGroup: null,
        };
        message = `${message ? message + ' ' : ''}${name(other(shooter))} to play.`;
      }
      return { state: next, balls, fouls: [], potted, turn: turnFor(next, balls), frame: null, message };
    },

    decide(state, choice, balls) {
      if (state.decision === 'illegal-break') {
        // 4g: the opponent (shooter now) breaks, or gives the break back.
        const breaker = choice === 'break' ? state.shooter : other(state.shooter);
        return {
          state: { ...state, decision: null },
          balls: balls.map(cloneBall),
          fouls: [],
          potted: [],
          turn: turnFor(state, balls),
          frame: null,
          message: `Re-rack: ${name(breaker)} breaks.`,
          rerack: { breaker },
        };
      }
      if (state.decision === 'choose-group') {
        const g = (choice === 'yellow' ? 'yellow' : 'red') as Group;
        // H2c: a colour potted on the last shot is assigned; otherwise it must be potted next.
        const assigned = state.lastPotted.includes(g);
        const next: EnglishState = {
          ...state,
          phase: 'play',
          decision: null,
          groups: assigned ? assign(state.shooter, g) : state.groups,
          pendingGroup: assigned ? null : g,
        };
        return {
          state: next,
          balls: balls.map(cloneBall),
          fouls: [],
          potted: [],
          turn: turnFor(next, balls),
          frame: null,
          message: assigned
            ? `${name(state.shooter)} is on ${plural(g, style)}.`
            : `${name(state.shooter)} chooses ${plural(g, style)} and must pot one next to be on them.`,
        };
      }
      throw new Error('No decision is pending');
    },
  };

  function judgeBreak(
    state: EnglishState,
    before: BallState[],
    balls: BallState[],
    facts: ReturnType<typeof shotFacts>,
    opts: EnglishOptions,
  ): Judgement<EnglishState> {
    const shooter = state.shooter;
    const potted = facts.potted;
    const colours = potted.filter((id) => groupOf(id) !== null);
    let legal: boolean;
    if (opts.legalBreak === 'three-points') {
      // 4f: 1 point per object ball potted (8 included) and per ball wholly past the centre line.
      const passed = live(balls).filter(
        (b) => b.pos.x + b.radius < 0 && before.find((x) => x.id === b.id)!.pos.x > 0,
      );
      legal = potted.length + passed.length >= 3;
    } else {
      legal = colours.length >= 1 || facts.objectBallsToRail >= 4;
    }

    if (potted.includes('8') && opts.eightOnBreak === 'rerack-same-breaker') {
      return rerackJudgement(
        state,
        balls,
        shooter,
        `The 8 went in on the break: re-rack, ${name(shooter)} breaks again.`,
      );
    }
    if (!legal) {
      if (opts.illegalBreak === 'rerack-opponent-breaks') {
        return rerackJudgement(
          state,
          balls,
          other(shooter),
          `Not a fair break: re-rack, ${name(other(shooter))} breaks.`,
        );
      }
      const next: EnglishState = {
        ...state,
        phase: 'decision',
        shooter: other(shooter),
        decision: 'illegal-break',
      };
      return {
        state: next,
        balls,
        fouls: [{ code: 'illegal-break', message: 'not a legal break' }],
        potted,
        turn: turnFor(next, balls, {
          prompt: `Not a legal break. ${name(other(shooter))}: break yourself, or make ${name(shooter)} break again?`,
          choices: [
            { id: 'break', label: 'I will break' },
            { id: 'pass', label: 'Break again' },
          ],
        }),
        frame: null,
        message: `Not a legal break: the balls will be re-racked.`,
      };
    }
    if (potted.includes('8')) respotOffTable(table, balls, ['8']); // 4i: re-spotted
    respotOffTable(table, balls, facts.offTable);

    // Cue ball on a legal break: in-off is loss of turn, played from baulk (4j1, F4c).
    if (facts.cueScratch) {
      returnCueBall(table, balls);
      const offTable = facts.offTable.length > 0;
      const next: EnglishState = {
        ...state,
        phase: 'play',
        shooter: other(shooter),
        visits: 1,
        ballInHand: offTable && opts.foulCueBall === 'in-hand-anywhere' ? 'anywhere' : 'behind-head-string',
      };
      return {
        state: next,
        balls,
        fouls: [],
        potted,
        turn: turnFor(next, balls),
        frame: null,
        message: `In-off on the break: ${name(other(shooter))} plays from baulk.`,
      };
    }

    const pottedGroups = [...new Set(colours.map(groupOf).filter((g): g is Group => g !== null))];
    // WEPF H2: colours potted on the break mean the breaker chooses a colour.
    if (opts.groupChoice === 'choose-after-both' && pottedGroups.length) {
      const next: EnglishState = {
        ...state,
        phase: 'decision',
        decision: 'choose-group',
        lastPotted: pottedGroups,
      };
      return {
        state: next,
        balls,
        fouls: [],
        potted,
        turn: turnFor(next, balls, chooseGroupDecision(shooter, style)),
        frame: null,
        message: `Good break. ${name(shooter)} chooses a colour.`,
      };
    }
    // 4h, 4i: the table stays open; the breaker continues if a colour went in.
    const continues = colours.length > 0;
    const next: EnglishState = {
      ...state,
      phase: 'play',
      shooter: continues ? shooter : other(shooter),
      visits: 1,
      ballInHand: 'none',
    };
    return {
      state: next,
      balls,
      fouls: [],
      potted,
      turn: turnFor(next, balls),
      frame: null,
      message: continues
        ? `Good break: ${name(shooter)} continues on an open table.`
        : `${name(other(shooter))} to play.`,
    };
  }

  function rerackJudgement(
    state: EnglishState,
    balls: BallState[],
    breaker: number,
    message: string,
  ): Judgement<EnglishState> {
    return {
      state: { ...state, phase: 'over' },
      balls,
      fouls: [],
      potted: [],
      turn: turnFor(state, balls),
      frame: null,
      message,
      rerack: { breaker },
    };
  }

  return ruleset;
}

function assign(shooter: number, g: Group): [Group, Group] {
  return shooter === 0 ? [g, otherGroup(g)] : [otherGroup(g), g];
}

function chooseGroupDecision(shooter: number, style: BallStyle = 'colours'): Turn['decision'] {
  return {
    prompt:
      style === 'numbers'
        ? `${name(shooter)}: choose solids or stripes.`
        : `${name(shooter)}: choose your colour.`,
    choices: [
      { id: 'red', label: style === 'numbers' ? 'Solids' : 'Reds' },
      { id: 'yellow', label: style === 'numbers' ? 'Stripes' : 'Yellows' },
    ],
  };
}

function describe(id: string): string {
  if (id === '8') return 'the 8';
  const g = groupOf(id);
  if (g && /^\d+$/.test(id)) return `the ${id}`;
  return g ? `a ${g}` : id;
}

export const ENGLISH_POOL = makeEnglish();

/**
 * Chinese 8-ball (heyball): solids and stripes on a 9 ft table with tight pockets. Played here
 * with the shared eight-ball engine: a break must pot a ball or drive four to a cushion (or it is
 * re-racked for the opponent), the table stays open until a group is potted, a foul gives ball in
 * hand anywhere, and the 8 potted early or on a foul loses the frame.
 */
export const CHINESE_RULES: EnglishOptions = {
  legalBreak: 'colour-or-four-cushions',
  illegalBreak: 'rerack-opponent-breaks',
  eightOnBreak: 'respot',
  foulVisits: 1,
  foulCueBall: 'in-hand-anywhere',
  opponentBall: 'loss-of-turn',
  totalSnooker: false,
  foulSnooker: false,
  groupChoice: 'choose-after-both',
};

export const CHINESE_8BALL = {
  ...makeEnglish(CHINESE_8BALL_9FT, 'numbers', 'chinese-8ball', 'Chinese 8-ball'),
  defaults: CHINESE_RULES,
};
