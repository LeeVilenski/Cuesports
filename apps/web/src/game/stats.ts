import { GAMES } from './games';
import { POINTS_GAMES, type MatchConfig } from './match';
import { ballAt, type MatchRecord, type RackRecord, type ShotRecord } from './record';

/**
 * Player statistics, worked out from saved match records (nothing is counted separately, so a
 * change of definition here applies to every match already played).
 *
 * Definitions:
 * - A pot attempt is any shot except a break-off, a push out and a declared safety. It succeeds
 *   when it pots a ball without a foul.
 * - A long pot is an attempt where the first ball hit started at least half the table's length
 *   from the cue ball. It succeeds when that ball goes in without a foul.
 * - A safety is a legal shot that pots nothing (declared or not, so it includes some missed
 *   pots). It succeeds when the opponent's next shot pots nothing or fouls.
 * - A break (a run, in American pool) is the points (snooker) or legal pots (pool) in one visit.
 *   A century is 100+.
 * - A run-out is a visit that wins the rack and started after the opponent had been at the table.
 *   A break-and-run is a rack the breaker wins without the opponent taking a shot.
 */
export interface PlayerStats {
  matches: number;
  matchesWon: number;
  racks: number;
  racksWon: number;
  shots: number;
  potAttempts: number;
  pots: number;
  longAttempts: number;
  longPots: number;
  safeties: number;
  safetiesWon: number;
  fouls: number;
  highestBreak: number;
  centuries: number;
  runOuts: number;
  breakAndRuns: number;
}

export const emptyStats = (): PlayerStats => ({
  matches: 0,
  matchesWon: 0,
  racks: 0,
  racksWon: 0,
  shots: 0,
  potAttempts: 0,
  pots: 0,
  longAttempts: 0,
  longPots: 0,
  safeties: 0,
  safetiesWon: 0,
  fouls: 0,
  highestBreak: 0,
  centuries: 0,
  runOuts: 0,
  breakAndRuns: 0,
});

/** Playfield length of the table a game is played on, for the long-pot test. */
const tableLength = (game: MatchConfig['game']): number =>
  (GAMES.find((g) => g.id === game) ?? GAMES[0]!).table.playfield.length;

const legal = (s: ShotRecord) => s.fouls.length === 0;
const isAttempt = (s: ShotRecord) => !s.isBreak && !s.decl.pushOut && !s.decl.safety;

/** Visits to the table: consecutive shots by one player. */
function visits(rack: RackRecord): ShotRecord[][] {
  const out: ShotRecord[][] = [];
  for (const s of rack.shots) {
    const v = out.at(-1);
    if (v && v[0]!.player === s.player) v.push(s);
    else out.push([s]);
  }
  return out;
}

/** Adds one match to the stats of the player in seat `seat`. */
export function addMatch(stats: PlayerStats, m: MatchRecord, seat: number): void {
  const finished = m.winner !== null;
  if (finished) {
    stats.matches++;
    if (m.winner === seat) stats.matchesWon++;
  }
  const length = tableLength(m.config.game);
  for (const rack of m.racks) {
    if (rack.winner !== null) {
      stats.racks++;
      if (rack.winner === seat) stats.racksWon++;
    }
    const all = rack.shots;
    all.forEach((s, i) => {
      if (s.player !== seat) return;
      stats.shots++;
      if (!legal(s)) stats.fouls++;
      if (isAttempt(s)) {
        stats.potAttempts++;
        if (legal(s) && s.potted.length) stats.pots++;
        const cue = ballAt(s.before, s.shot.ball);
        const target = ballAt(s.before, s.firstHit);
        if (cue && target && Math.hypot(target.x - cue.x, target.y - cue.y) >= length / 2) {
          stats.longAttempts++;
          if (legal(s) && s.potted.includes(s.firstHit!)) stats.longPots++;
        }
      }
      if (!s.isBreak && legal(s) && !s.potted.length) {
        const next = all[i + 1];
        if (next && next.player !== seat) {
          stats.safeties++;
          if (!legal(next) || !next.potted.length) stats.safetiesWon++;
        }
      }
    });
    const vs = visits(rack);
    vs.forEach((v, i) => {
      if (v[0]!.player !== seat) return;
      const points = v.reduce((n, s) => n + s.scored, 0);
      stats.highestBreak = Math.max(stats.highestBreak, points);
      const pointsGame = POINTS_GAMES.has(m.config.game);
      if (pointsGame && points >= 100) stats.centuries++;
      const won = rack.winner === seat && i === vs.length - 1;
      if (!won || pointsGame) return;
      if (i === 0 && v[0]!.isBreak) stats.breakAndRuns++;
      else if (i > 0) stats.runOuts++;
    });
  }
}

export interface StatsQuery {
  /** Player name, matched case-insensitively. */
  player: string;
  game?: MatchConfig['game'] | undefined;
}

/** Stats for one player over the given matches, optionally for one game. */
export function playerStats(matches: readonly MatchRecord[], q: StatsQuery): PlayerStats {
  const stats = emptyStats();
  const name = q.player.trim().toLowerCase();
  for (const m of matches) {
    // Drills have their own bests; they would skew match figures (a line-up is all pots).
    if (m.config.drill) continue;
    if (q.game && m.config.game !== q.game) continue;
    m.config.players.forEach((p, seat) => {
      if (p.trim().toLowerCase() === name) addMatch(stats, m, seat);
    });
  }
  return stats;
}

/** Human players seen in the records, most matches first. The computer is left out. */
export function knownPlayers(matches: readonly MatchRecord[]): string[] {
  const count = new Map<string, number>();
  for (const m of matches) {
    if (m.config.drill) continue;
    m.config.players.forEach((p, seat) => {
      if (m.config.ai !== null && seat === 1) return;
      count.set(p, (count.get(p) ?? 0) + 1);
    });
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** "62%", or "–" with nothing to divide by. */
export const percent = (n: number, of: number): string => (of ? `${Math.round((100 * n) / of)}%` : '–');
