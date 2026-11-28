import { describe, expect, it } from 'vitest';
import {
  booking,
  confidenceDelta,
  enterEvent,
  finishIntro,
  INTRO,
  markRead,
  nextGoal,
  playMatch,
  preTalk,
  statLine,
  targetFor,
  targetText,
  unread,
} from './agent';
import { careerEvent, EVENTS, newCareer, parseCareer, rounds, tierOpen, type CareerState } from './career';

/** Plays a whole event, winning the first `wins` matches. */
function play(s: CareerState, id: string, wins: number, seed = 1): CareerState {
  s = enterEvent(s, careerEvent(id)!, seed);
  let i = 0;
  while (s.run?.status === 'playing') s = playMatch(s, i++ < wins, seed + i);
  return s;
}

describe('Old Joe', () => {
  it('introduces himself, then leaves a welcome in the inbox', () => {
    expect(INTRO.length).toBeGreaterThanOrEqual(3);
    const s = finishIntro(newCareer());
    expect(s.introSeen).toBe(true);
    expect(unread(s)).toBe(1);
    expect(unread(markRead(s, 'welcome'))).toBe(0);
    // Only once.
    expect(finishIntro(s).inbox).toHaveLength(1);
  });

  it('sets modest targets at first, and expects a defence of a title', () => {
    const s = newCareer();
    const e = careerEvent('lion-9ball')!;
    expect(targetFor(s, e)).toBe(1);
    // Two rounds at the pub: one win puts you in the final.
    expect(targetText(e, 1)).toBe('make the final');
    expect(targetText(careerEvent('arena-9ball')!, 1)).toBe('make the semis');
    expect(targetText(e, rounds(e))).toBe('win it');
    const champ = play(s, 'lion-9ball', 99);
    expect(targetFor(champ, e)).toBe(rounds(e));
  });

  it('talks about the event, the game and the target', () => {
    const e = careerEvent('club-snooker')!;
    const lines = preTalk(newCareer(), e, 2, 5);
    expect(lines.join(' ')).toMatch(/Corner Pocket Six-Reds/);
    // First time at snooker: a reminder of the rules.
    expect(lines.join(' ')).toMatch(/Never played it\?/);
    expect(lines.join(' ')).toMatch(/make the final|win 2 matches/i);
  });

  it('is the same for the same seed', () => {
    const a = play(newCareer(), 'lion-uk8', 1, 42);
    const b = play(newCareer(), 'lion-uk8', 1, 42);
    expect(a).toEqual(b);
  });

  it('moves confidence with results against the target', () => {
    expect(confidenceDelta(3, 1, true)).toBeGreaterThan(confidenceDelta(2, 1, false));
    expect(confidenceDelta(1, 1, false)).toBeGreaterThan(0);
    expect(confidenceDelta(0, 1, false)).toBeLessThan(0);
    expect(confidenceDelta(0, 3, false)).toBeLessThan(confidenceDelta(2, 3, false));
    const won = play(newCareer(), 'lion-9ball', 99);
    expect(won.confidence).toBeGreaterThan(50);
    const lost = play(newCareer(), 'lion-9ball', 0);
    expect(lost.confidence).toBeLessThan(50);
    expect(lost.run?.debrief?.length).toBeGreaterThan(0);
    expect(lost.log).toEqual([{ event: 'lion-9ball', reached: 0, target: 1, champion: false }]);
  });

  it('never talks about potting in a game without pockets', () => {
    const carom = {
      potPct: null,
      best: 1,
      word: 'run',
      fouls: 0,
      game: 'three-cushion' as const,
      carom: true,
    };
    expect(statLine(false, carom)).not.toMatch(/potting/);
    expect(statLine(true, { ...carom, best: 5 })).toMatch(/5 run/);
    expect(statLine(false, { potPct: 30, best: 2, word: 'break', fouls: 0 })).toMatch(/30% potting/);
  });

  it('previews the next opponent between rounds', () => {
    let s = enterEvent(newCareer(), careerEvent('lion-9ball')!, 3);
    s = playMatch(s, true, 4, { potPct: 80, best: 4, word: 'run', fouls: 0 });
    expect(s.run?.status).toBe('playing');
    expect(s.run?.talk?.join(' ')).toMatch(/80%/);
    expect(s.run?.talk?.join(' ')).toMatch(/final/i);
  });

  it('sends news: a first title, a new venue, a rival beaten', () => {
    const s = play(newCareer(), 'lion-9ball', 99);
    const ids = s.inbox.map((m) => m.id);
    expect(ids).toContain('first-title');
    expect(ids).toContain('venue-corner-pocket');
    expect(ids).toContain('rival-gaz');
    expect(tierOpen(s, 1)).toBe(true);
    // The second title isn't a first title.
    const again = play(s, 'lion-uk8', 99);
    expect(again.inbox.filter((m) => m.id === 'first-title')).toHaveLength(1);
  });

  it('books open events, mixing up the games', () => {
    let s = newCareer();
    const games = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const e = booking(s, 9)!;
      expect(tierOpen(s, e.tier)).toBe(true);
      games.add(e.game);
      s = play(s, e.id, 99, i + 1);
    }
    expect(games.size).toBeGreaterThan(2);
  });

  it('keeps a struggling player a tier lower', () => {
    let s = play(newCareer(), 'lion-9ball', 99);
    s = { ...s, confidence: 10 };
    expect(booking(s, 1)!.tier).toBe(0);
  });

  it('names the next goal', () => {
    expect(nextGoal(newCareer())).toMatch(/Red Lion/);
    const all = EVENTS.reduce((s, e) => ({ ...s, best: { ...s.best, [e.id]: rounds(e) } }), newCareer());
    expect(nextGoal(all)).toMatch(/won everything/);
  });

  it('loads an old career with Joe at the start', () => {
    const s = parseCareer(JSON.stringify({ best: { 'lion-9ball': 2 }, unlocked: [], h2h: {}, run: null }));
    expect(s.introSeen).toBe(false);
    expect(s.confidence).toBe(50);
    expect(s.inbox).toEqual([]);
    expect(s.best['lion-9ball']).toBe(2);
  });
});
