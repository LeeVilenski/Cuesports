import type { RackRecord } from './record';

/**
 * The rack in a few words, for the sheet between racks: a golden break, a break and run, a
 * run out, a gift... or just a rack won. `seed` picks among the plain ones so they vary.
 */
export function rackBadge(rack: RackRecord, winner: number, seed = 0): string {
  const shots = rack.shots;
  if (rack.reason === 'conceded') return 'Conceded!';
  if (/three (fouls|misses)/.test(rack.reason)) return 'Three strikes!';
  if (shots.length && shots.every((s) => s.player === winner)) {
    if (shots[0]!.isBreak && shots.length === 1) return 'Golden break!';
    if (shots[0]!.isBreak) return 'Break and run!';
    return 'Clean sweep!';
  }
  const last = shots.at(-1);
  // The loser's own shot ended it: an early money ball, a scratch on the black...
  if (last && last.player !== winner) return 'A gift!';
  // The winner's last visit: the shots since the loser was last at the table.
  const lastLoser = shots.map((s) => s.player).lastIndexOf(1 - winner);
  const visit = shots.slice(lastLoser + 1);
  const pots = visit.reduce((n, s) => n + (s.fouls.length ? 0 : s.potted.length), 0);
  if (pots >= 5) return 'Run out!';
  const before = shots[lastLoser];
  if (before?.fouls.length && visit.length <= 2) return 'Punished!';
  let visits = 0;
  shots.forEach((s, i) => (visits += i === 0 || shots[i - 1]!.player !== s.player ? 1 : 0));
  if (visits >= 10) return 'Hard fought!';
  const plain = ['Nicely done!', 'In the bag!', "That's the rack!"];
  return plain[Math.abs(seed) % plain.length]!;
}

/** Where the match stands after a rack: hill-hill, one from the match, level, or who leads. */
export function matchSituation(
  players: readonly [string, string] | readonly string[],
  score: readonly [number, number] | readonly number[],
  raceTo: number,
  unit: string,
): string {
  const [a, b] = [score[0] ?? 0, score[1] ?? 0];
  if (a === raceTo - 1 && b === raceTo - 1) return `Hill-hill: the next ${unit} decides it`;
  const hill = a === raceTo - 1 ? 0 : b === raceTo - 1 ? 1 : -1;
  if (hill >= 0) return `${players[hill]} is one ${unit} from the match`;
  if (a === b) return `All square at ${a}–${b}`;
  const lead = a > b ? 0 : 1;
  return `${players[lead]} leads ${Math.max(a, b)}–${Math.min(a, b)}, race to ${raceTo}`;
}
