import type { Ratings } from './attributes';
import type { MatchSnapshot } from './match';

/**
 * Matches left unfinished, to pick up again from the menu: one career match and one other (quick
 * or friendly) match, each saved after every shot. Drills aren't kept.
 */

export type ResumeSlot = 'career' | 'match';

export interface SavedMatch {
  /** Format version; a save from an older version is dropped rather than misread. */
  v: 1;
  saved: number;
  match: MatchSnapshot;
  /** Career XP earned so far in the match, and at the start of the rack being played. */
  xp?: { match: Partial<Ratings>; rack: Partial<Ratings> };
}

const KEY: Record<ResumeSlot, string> = {
  career: 'cuesports.resume.career',
  match: 'cuesports.resume.match',
};

export const slotOf = (s: MatchSnapshot): ResumeSlot => (s.config.career ? 'career' : 'match');

export function loadSaved(slot: ResumeSlot): SavedMatch | null {
  try {
    const raw = localStorage.getItem(KEY[slot]);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedMatch;
    return s.v === 1 && s.match?.config ? s : null;
  } catch {
    return null;
  }
}

export function storeSaved(s: SavedMatch): void {
  try {
    localStorage.setItem(KEY[slotOf(s.match)], JSON.stringify(s));
  } catch {
    // Full or blocked: the match just can't be resumed after closing.
  }
}

export function clearSaved(slot: ResumeSlot): void {
  try {
    localStorage.removeItem(KEY[slot]);
  } catch {
    // Nothing to do.
  }
}
