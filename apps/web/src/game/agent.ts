import { Rng } from '@cuesports/shared';
import {
  careerEvent,
  EVENTS,
  enter,
  nextOpponent,
  opponent,
  recordMatch,
  rounds,
  roundName,
  tierOpen,
  topTier,
  VENUES,
  type CareerEvent,
  type CareerMessage,
  type CareerState,
} from './career';
import type { MatchGame } from './match';
import {
  addLevelXp,
  addXp,
  ATTRS,
  ceilingFor,
  matchXp,
  playedGame,
  rust,
  spendPoint,
  sumXp,
  trainingXp,
  type Attr,
  type Ratings,
  type Training,
} from './attributes';

/**
 * Old Joe, your agent. He books your events, sets you a target for each one and talks you through
 * it: before, between matches and after. His confidence in you rises and falls with how you do
 * against his targets. Everything he says comes from templates picked with a seeded RNG, so it
 * works offline and is the same every time for the same career.
 */

export const AGENT = { name: 'Old Joe', initials: 'OJ' } as const;

export interface IntroCard {
  title: string;
  text: string;
}

/** The first time you open the career: who you are, who Joe is, how it works. */
export const INTRO: IntroCard[] = [
  {
    title: 'So you want to play',
    text:
      "You're young, you're hungry and you can hold a cue. You want to get as far as this game will take " +
      "you, any way you can. Pool, snooker, billiards: you don't care, as long as there's a table and a " +
      'trophy at the end of it.',
  },
  {
    title: 'Meet Old Joe',
    text:
      "\"Name's Joe. Old Joe, they call me, and they're not wrong. I've been getting players on tables for " +
      "forty years. I've seen you play. You're raw, but there's something there. You do the potting, I'll " +
      'do the phoning. Deal?"',
  },
  {
    title: 'Anything going',
    text:
      '"I\'ll get you into anything I can find. Nine-ball one week, six-reds the next, a billiards handicap ' +
      "after that. That's how you learn. I'll tell you what I expect before each event, and I'll tell you " +
      'straight how you did after."',
  },
  {
    title: 'Up the ladder',
    text:
      '"Pub first, then the clubs, then the halls, then the arena. Win where you are and the phone starts ' +
      "ringing. Beat my targets and I'll get you better bookings. Miss them and, well, we'll talk. Now, " +
      'chalk up."',
  },
];

// ---------------------------------------------------------------------------------------------
// Words

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;

/** What Joe calls the game. */
export function gameName(e: CareerEvent): string {
  const names: Partial<Record<MatchGame, string>> = {
    'nine-ball': 'nine-ball',
    'ten-ball': 'ten-ball',
    english: 'UK eight-ball',
    snooker: e.reds === 6 ? 'six-reds' : e.reds === 10 ? 'ten-reds snooker' : 'snooker',
    billiards: 'English billiards',
    'three-cushion': 'three-cushion',
    pyramid: 'Russian pyramid',
  };
  return names[e.game] ?? e.game;
}

/** A line about the game, and a reminder of how it works for the first time you play it. */
function gameLines(e: CareerEvent, firstTime: boolean): string[] {
  const about: Partial<Record<MatchGame, [string, string]>> = {
    'nine-ball': [
      "Nine-ball. Rack 'em, break 'em, run 'em out, and don't you dare leave the nine hanging.",
      'Hit the lowest ball first every time. Whoever pots the nine wins the rack, however it goes down.',
    ],
    'ten-ball': [
      "Ten-ball. Call your shots. There's no slop in this one, so no lucky pots.",
      'Lowest ball first, and you call the ball and pocket. Pot the ten, legally called, to win the rack.',
    ],
    english: [
      'UK eight-ball. Small table, tight pockets, and the black ends everything.',
      'Reds or yellows: clear your seven, then the black. Two shots after a foul, so keep it clean.',
    ],
    snooker: [
      e.reds === 15
        ? 'Full-size snooker. Fifteen reds, the big table and the long frames. Patience.'
        : `${e.reds === 6 ? 'Six-reds' : 'Ten-reds'}. Snooker, but quicker. Bigger table, smaller pockets. Don't panic.`,
      'Red, then a colour, then a red. When the reds are gone, the colours in order. Most points wins the frame.',
    ],
    billiards: [
      "English billiards. Old game, gentleman's game. Keep the balls together and keep scoring.",
      'Three balls. Pots, in-offs and cannons all score. First to the target wins.',
    ],
    'three-cushion': [
      "Three-cushion. No pockets at all. It's geometry with a cue.",
      'Hit both other balls, with at least three cushions before the second one. One point each time.',
    ],
    pyramid: [
      "Russian pyramid. Pockets barely wider than the balls. Hit 'em firm and hit 'em straight.",
      'Any ball can be potted, by any ball. First to eight wins the frame.',
    ],
  };
  const [line, rules] = about[e.game] ?? [`${gameName(e)} this week.`, ''];
  return firstTime && rules ? [line, `Never played it? ${rules}`] : [line];
}

/** What Joe expects, as a phrase: "win a match", "make the semis", "win it". */
export function targetText(e: CareerEvent, target: number): string {
  const n = rounds(e);
  if (target >= n) return 'win it';
  if (target === n - 1) return 'make the final';
  if (target === n - 2 && n >= 3) return 'make the semis';
  if (target === n - 3 && n >= 4) return 'make the quarters';
  return target <= 1 ? 'win a match' : `win ${target} matches`;
}

// ---------------------------------------------------------------------------------------------
// Targets and confidence

/** Events already played at a tier, and titles won there. */
function record(state: CareerState, tier: number): { played: number; titles: number } {
  let played = 0;
  let titles = 0;
  for (const l of state.log) {
    if (careerEvent(l.event)?.tier !== tier) continue;
    played++;
    if (l.champion) titles++;
  }
  return { played, titles };
}

/**
 * Joe's target for an event: one match on your first visit to a tier, then more as you play there,
 * a title expected once you've won at that tier, and a defence of any title you hold. More
 * confidence means he expects a little more.
 */
export function targetFor(state: CareerState, e: CareerEvent): number {
  const n = rounds(e);
  if ((state.best[e.id] ?? 0) >= n) return n;
  const { played, titles } = record(state, e.tier);
  const t = 1 + Math.floor(played / 2) + (titles > 0 ? 1 : 0) + (state.confidence >= 75 ? 1 : 0);
  return Math.max(1, Math.min(n, t));
}

/** How confidence moves for a result against the target. */
export function confidenceDelta(reached: number, target: number, champion: boolean): number {
  const diff = reached - target;
  if (champion) return diff >= 0 ? 12 + 3 * diff : 12;
  if (diff > 0) return 6 + 2 * diff;
  if (diff === 0) return 4;
  return diff === -1 ? -5 : -9;
}

export const confidenceBand = (c: number): string =>
  c >= 80
    ? 'Over the moon'
    : c >= 60
      ? 'Believes in you'
      : c >= 40
        ? 'Hopeful'
        : c >= 20
          ? 'Worried'
          : 'Losing patience';

// ---------------------------------------------------------------------------------------------
// Talks

/** Joe's talk before an event. */
export function preTalk(state: CareerState, e: CareerEvent, target: number, seed: number): string[] {
  const rng = new Rng(seed);
  const venue = VENUES.find((v) => v.id === e.venue)!;
  const firstTime = !state.log.some((l) => careerEvent(l.event)?.game === e.game);
  const holder = (state.best[e.id] ?? 0) >= rounds(e);
  const opener = holder
    ? pick(rng, [
        `Back to ${venue.name}. You're the champion here, so everyone wants your scalp.`,
        `${e.title} again. You won it last time, and they haven't forgotten.`,
      ])
    : pick(rng, [
        `Right, I've got you in the ${e.title}.`,
        `Good news: ${venue.name} have a spot for you in the ${e.title}.`,
        `Took some phoning, but you're in the ${e.title}.`,
      ]);
  const field = pick(rng, [
    `${2 ** rounds(e)} players. ${opponent(e.rival).name} is in the other half. ${opponent(e.rival).style}.`,
    `Watch out for ${opponent(e.rival).name}. If you're both still standing at the end, it's you and them.`,
  ]);
  const want = targetText(e, target);
  const ask =
    state.confidence < 30
      ? `I need you to ${want}. I mean it, kid.`
      : state.confidence >= 75
        ? pick(rng, [`I think you can ${want}. People are watching now.`, `Go and ${want}. You're ready.`])
        : pick(rng, [
            `I want you to ${want}.`,
            `${want[0]!.toUpperCase()}${want.slice(1)}, and I'll be happy.`,
          ]);
  return [opener, ...gameLines(e, firstTime), field, ask];
}

/** Joe's line after a match you won, before the next round. */
export function betweenRounds(state: CareerState, seed: number, stat?: string): string[] {
  const run = state.run;
  const e = run && careerEvent(run.event);
  const opp = run && nextOpponent(run);
  if (!run || !e || !opp) return [];
  const rng = new Rng(seed);
  const o = opponent(opp.id);
  const won = pick(rng, ['Nice work.', "That's more like it.", 'Job done.', 'Good. Keep that going.']);
  const next =
    opp.id === e.rival
      ? `${o.name} next, in the ${roundName(e, run.round).toLowerCase()}. ${o.style}. This is the one.`
      : `${o.name} in the ${roundName(e, run.round).toLowerCase()}. ${o.style}.`;
  return [stat ? `${won} ${stat}` : won, next];
}

/** Joe's verdict on the whole event. */
export function debrief(
  e: CareerEvent,
  reached: number,
  target: number,
  champion: boolean,
  seed: number,
  stat?: string,
): string[] {
  const rng = new Rng(seed);
  const diff = reached - target;
  const verdict = champion
    ? pick(rng, [
        `Champion! The ${e.title} is yours. I told you there was something there.`,
        'You only went and won it! Drinks are on me. Well, one drink.',
      ])
    : diff > 0
      ? pick(rng, [
          'Better than I asked for. Much better.',
          "That's beyond what I wanted. Phone's going to ring.",
        ])
      : diff === 0
        ? pick(rng, ["That's what I asked for. Solid.", 'Target met. No complaints from me.'])
        : diff === -1
          ? pick(rng, [
              'Not quite what I wanted, but not the end of the world.',
              'Close. Not close enough, but close.',
            ])
          : pick(rng, [
              'That was poor, kid, and you know it.',
              "I stuck my neck out for that booking. Let's not do that again.",
            ]);
  const out =
    reached === 0 ? 'Out in the first match.' : champion ? '' : `You won ${reached} of ${rounds(e)} matches.`;
  return [verdict, ...(out ? [out] : []), ...(stat ? [stat] : [])];
}

/** A short comment on how you played, from the last match's figures. */
export function statLine(won: boolean, f: MatchFigures): string {
  // Carom games have no pockets: a run is counted in points, and nobody pots anything.
  const big = f.carom ? (f.game === 'three-cushion' ? 4 : 25) : 50;
  if (f.best >= big) return `That ${f.best} ${f.word} was the real deal.`;
  if (f.potPct !== null && f.potPct >= 75) return `Potting ${f.potPct}%. Lovely.`;
  if (f.fouls >= 4) return `${f.fouls} fouls, though. You can't give tables away like that.`;
  if (!won && f.potPct !== null && f.potPct < 50) return `Only ${f.potPct}% potting. We'll fix that.`;
  if (!won && f.carom && f.best <= 1) return 'Never got a run going. These carom games take time.';
  return '';
}

// ---------------------------------------------------------------------------------------------
// Bookings

/**
 * The event Joe has lined up next: something you haven't won at the highest tier open to you (or
 * a lower one), in a different game from the last one where he can, so you play everything.
 */
export function booking(state: CareerState, seed: number): CareerEvent | null {
  const open = EVENTS.filter((e) => tierOpen(state, e.tier));
  if (!open.length) return null;
  const top = Math.max(...open.map((e) => e.tier));
  const unwon = open.filter((e) => (state.best[e.id] ?? 0) < rounds(e));
  // Confidence buys a booking at the top tier; doubt keeps you a tier lower.
  const tier = state.confidence < 30 && top > 0 ? top - 1 : top;
  let pool = unwon.filter((e) => e.tier === tier);
  if (!pool.length) pool = unwon.filter((e) => e.tier <= top);
  if (!pool.length) pool = open.filter((e) => e.tier === top);
  const last = state.log.at(-1);
  const lastGame = last && careerEvent(last.event)?.game;
  const fresh = pool.filter((e) => e.game !== lastGame);
  const rng = new Rng(seed + state.log.length * 7919);
  return pick(rng, fresh.length ? fresh : pool);
}

/** Joe's pitch for a booking. */
export function bookingPitch(state: CareerState, e: CareerEvent, seed: number): string {
  const rng = new Rng(seed + state.log.length);
  if (!state.log.length)
    return `First booking: the ${e.title}. ${gameName(e)[0]!.toUpperCase()}${gameName(e).slice(1)}. Let's see what you've got.`;
  return pick(rng, [
    `I've got you a spot in the ${e.title}. ${gameName(e)[0]!.toUpperCase()}${gameName(e).slice(1)} this time.`,
    `${gameName(e)[0]!.toUpperCase()}${gameName(e).slice(1)} next. The ${e.title}. Interested?`,
    `The ${e.title} has a space. It's ${gameName(e)}, and it's yours if you want it.`,
  ]);
}

// ---------------------------------------------------------------------------------------------
// Messages

const message = (id: string, subject: string, body: string): CareerMessage => ({
  id,
  from: AGENT.name,
  subject,
  body,
  read: false,
});

const hasMessage = (s: CareerState, id: string) => s.inbox.some((m) => m.id === id);

/** Adds a message once (by id), newest first. */
function send(s: CareerState, m: CareerMessage): CareerState {
  return hasMessage(s, m.id) ? s : { ...s, inbox: [m, ...s.inbox] };
}

/** The intro has been seen: Joe's welcome lands in the inbox. */
export function finishIntro(state: CareerState): CareerState {
  return send(
    { ...state, introSeen: true },
    message(
      'welcome',
      'The deal',
      "Here's how it works. I find the events, you play them. Before each one I'll tell you what I expect. " +
        "Beat it and I'll find you better ones. I take care of the phone calls; you take care of the balls. " +
        "Check in here: this is where I'll tell you when someone wants you.",
    ),
  );
}

export const unread = (s: CareerState): number => s.inbox.filter((m) => !m.read).length;

export const markRead = (s: CareerState, id: string): CareerState => ({
  ...s,
  inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)),
});

// ---------------------------------------------------------------------------------------------
// Actions

/** Enters an event with Joe's target and pre-event talk. */
export function enterEvent(state: CareerState, e: CareerEvent, seed: number): CareerState {
  const target = targetFor(state, e);
  const run = { ...enter(e, seed), target, talk: preTalk(state, e, target, seed) };
  return { ...state, run };
}

/** How you played the match: fed to Joe's comments. */
export interface MatchFigures {
  /** Pots made, as a percentage of attempts; null when there was nothing to pot (carom games). */
  potPct: number | null;
  best: number;
  word: string;
  fouls: number;
  game?: MatchGame;
  /** A carom game: no pockets. */
  carom?: boolean;
}

/**
 * Records your match (into the bracket) and lets Joe react: between rounds he previews the next
 * opponent; at the end of the event he gives his verdict, moves his confidence, logs the event and
 * sends any news (a first title, a new venue, a rival beaten, a talk about form).
 */
export function playMatch(
  state: CareerState,
  won: boolean,
  seed: number,
  figures?: MatchFigures,
  play?: MatchPlay,
): CareerState {
  const before = state;
  const run0 = state.run;
  if (!run0 || run0.status !== 'playing') return state;
  const e = careerEvent(run0.event)!;
  const opp = nextOpponent(run0)!;
  let s = recordMatch(state, won, seed);
  const run = s.run!;
  const champion = run.status === 'won';
  s = develop(s, e.game, won, champion, play ?? { xp: {}, deciders: 0 });
  const stat = figures ? statLine(won, figures) : '';
  if (run.status === 'playing') return { ...s, run: { ...run, talk: betweenRounds(s, seed, stat) } };

  s = { ...s, player: rust(s.player, e.game), trainingReady: true };
  const reached = champion ? rounds(e) : run.round;
  const target = run0.target ?? targetFor(before, e);
  const confidence = Math.max(0, Math.min(100, s.confidence + confidenceDelta(reached, target, champion)));
  s = {
    ...s,
    confidence,
    log: [...s.log, { event: e.id, reached, target, champion }],
    run: { ...run, debrief: debrief(e, reached, target, champion, seed, stat) },
  };

  if (topTier(s) > topTier(before))
    s = send(
      s,
      message(
        `ceiling-${topTier(s)}`,
        'Better players, better practice',
        `Moving up means playing better players, and you learn faster against them. Your ceiling has risen to ` +
          `${ceilingFor(topTier(s))}: every skill can go that high now.`,
      ),
    );
  if (champion && !before.log.some((l) => l.champion))
    s = send(
      s,
      message(
        'first-title',
        'Your first title',
        `The ${e.title}. Your first trophy. Put it somewhere you can see it, kid, because it won't be the last. ` +
          "Now let's get you somewhere harder.",
      ),
    );
  // Venues that this result opened.
  for (const v of VENUES)
    if (!tierOpen(before, v.tier) && tierOpen(s, v.tier))
      s = send(
        s,
        message(
          `venue-${v.id}`,
          `${v.name} rang`,
          `${v.name} rang this morning. They've heard about you. You're welcome there now: ` +
            `${EVENTS.filter((x) => x.venue === v.id)
              .map((x) => x.title)
              .join(', ')}. Bigger players, longer matches.`,
        ),
      );
  if (won && opp.id === e.rival && !(before.h2h[opp.id]?.[0] ?? 0))
    s = send(
      s,
      message(
        `rival-${opp.id}`,
        `You beat ${opponent(opp.id).name}`,
        `Everyone at ${VENUES.find((v) => v.id === e.venue)!.name} is talking about it. ${opponent(opp.id).name} doesn't lose often. ` +
          "Don't let it go to your head: they'll want it back.",
      ),
    );
  if (before.confidence >= 30 && confidence < 30)
    s = send(
      s,
      message(
        `talk-${s.log.length}`,
        'We need to talk',
        "Results haven't been good enough. I'm going to keep you on smaller events for a bit until you find " +
          'your game again. Win where I put you and we go again.',
      ),
    );
  if (before.confidence < 80 && confidence >= 80)
    s = send(
      s,
      message(
        `buzz-${s.log.length}`,
        'People are asking about you',
        "I've had three calls this week about you. Three! Keep this going and I'll be expecting more of you, mind.",
      ),
    );
  return s;
}

/** What you did in a match, for XP: per-shot XP summed, and deciding racks won. */
export interface MatchPlay {
  xp: Partial<Ratings>;
  deciders: number;
}

export const ceiling = (s: CareerState): number => ceilingFor(topTier(s));

/** XP into your ratings and level, and familiarity with the game, after a career match. */
function develop(
  s: CareerState,
  game: MatchGame,
  won: boolean,
  champion: boolean,
  play: MatchPlay,
): CareerState {
  const m = matchXp(won, play.deciders, champion);
  const xp = sumXp(play.xp, { nerve: m.nerve });
  const a = addXp(playedGame(s.player, game), xp, ceiling(s));
  const l = addLevelXp(a.player, m.level);
  return { ...s, player: l.player, lastGains: { xp, ups: a.ups, levels: l.levels } };
}

/** A training session: XP by stars, and it uses up the session until after the next event. */
export function train(s: CareerState, t: Training, stars: number): CareerState {
  const xp = trainingXp(t, stars);
  const a = addXp(s.player, xp, ceiling(s));
  return { ...s, player: a.player, trainingReady: false, lastGains: { xp, ups: a.ups, levels: 0 } };
}

/** Spends a skill point. */
export function spend(s: CareerState, attr: Attr): CareerState {
  return { ...s, player: spendPoint(s.player, attr, ceiling(s)) };
}

/** XP gains and rating rises, in words: "Vision +12, Cueing 15 → 16". */
export function gainsText(g: CareerState['lastGains']): string {
  if (!g) return '';
  const parts = ATTRS.filter((a) => (g.xp[a.id] ?? 0) > 0).map((a) => {
    const up = g.ups.find((u) => u.attr === a.id);
    return up ? `${a.label} ${up.from} → ${up.to}` : `${a.label} +${g.xp[a.id]} XP`;
  });
  if (g.levels) parts.push(g.levels > 1 ? `${g.levels} levels up` : 'Level up: a skill point to spend');
  return parts.join(' · ');
}

/** Your career in numbers, for the profile. */
export function careerRecord(s: CareerState): { won: number; lost: number; titles: number; events: number } {
  let won = 0;
  let lost = 0;
  for (const [w, l] of Object.values(s.h2h)) {
    won += w;
    lost += l;
  }
  return { won, lost, titles: s.log.filter((l) => l.champion).length, events: s.log.length };
}

/** The next thing to aim for, in words. */
export function nextGoal(s: CareerState): string {
  const shut = VENUES.find((v) => !tierOpen(s, v.tier));
  if (shut) {
    const below = VENUES.filter((v) => v.tier === shut.tier - 1).map((v) => v.name);
    return `Win an event at ${below.join(' or ')} to play at ${shut.name}.`;
  }
  const left = EVENTS.filter((e) => (s.best[e.id] ?? 0) < rounds(e));
  return left.length
    ? `Win every event: ${EVENTS.length - left.length} of ${EVENTS.length} so far.`
    : "You've won everything. Legend.";
}
