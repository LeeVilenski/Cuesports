# Career mode v2: plan

Status: phases 1–4 (Old Joe and the hub, attributes and the guide, pressure, the calendar and money) are built; phases 5–6 are planned. The current career (`apps/web/src/game/career.ts`) is the v1
this replaces.

## Where we are

The v1 career is a fixed ladder: pub → club → hall → arena. Each venue holds a few knockout events, and
winning one opens the next tier and unlocks a cosmetic. It works, but:

- **No player.** You play exactly as you do in quick play. Nothing about you improves.
- **No calendar and no story.** You pick events off a list. Nobody talks to you, and nothing builds.
- **No money and no rankings.** A win only unlocks a cue colour.
- **Every discipline is the same ladder.** Nothing says "I'm a snooker player" or "I'm a pool player".

## Goals

1. **A story with a guide.** You're a youngster who wants to get as far as possible in cue sports, any way
   you can. You've signed with an **agent**, who explains the career, books your events and talks you
   through every tournament.
2. **The journeyman years.** At first the agent takes whatever they can find, so it might be 9-ball one week
   and six-reds the next. You play everything.
3. **Specialise and join tours.** Once you're past the club tables, you pick up to **two tours** (for
   example the American Pool Tour and the Snooker Tour), each with its own rankings, cards, qualifying
   school and majors.
4. **A real RPG: you get better.** You start with no lines after contact, a small spin range, low
   elevation and shaky nerves. Matches and training improve each of these. Pressure on frame, money and
   match balls pulls your lines back in.

## Decisions (agreed)

- **Agent:** a single recurring character, **Old Joe**, who also explains the career and training. There
  is no separate coach. He's an old-school fixer who has seen it all, with a soft spot for you.
- **Starting guide:** the cue line to the contact point (the ghost ball) only. There's no object-ball line
  and no cue-ball line after contact. Vision grows the object-ball line first, then the cue-ball line.
- **Specialising:** you can be on up to two tours. At the end of every season you can keep them, drop one or
  pick a new one. A tour you're not on (or have dropped off) has to be earned again through its qualifying
  school or qualifiers.
- **Money:** prize money, minus the agent's cut, pays for **entry fees and travel**, **cosmetics**,
  **coaching and training**, and **cues with small stats**.
- **Skill scope:** six shared attributes, plus a **familiarity** for each game that you only build by
  playing that game.
- **Agent stakes:** the agent has a **confidence** in you that moves with results against the targets they
  set. It changes the quality of your bookings, invitations and sponsor offers.
- **Pressure:** guide lines shrink (by up to about 60% at low Nerve) and you get a small aim wobble, both
  scaled by the stakes.
- **Pace:** 4–6 seasons of about 12 weeks from your first pub event to the top of a tour.
- **Guide setting:** in career matches the guide comes from Vision and pressure, and the "Aiming guide"
  setting is ignored. The setting still applies everywhere else.
- **3-cushion guide:** a longer line for the cue ball, to the first cushion and a short stub of the
  rebound off it (the second and third cushions are yours to judge). On by default and switchable in
  Settings. It's shown in career 3-cushion too, whatever your Vision.
- **Players cross tours:** a shared roster where top names also play other tours at a lower level (see
  [Crossover players](#crossover-players)).

## The path (player's view)

| Stage | Where you play | How you get in | How you move on |
| --- | --- | --- | --- |
| **1. The Local** | Pub nights in whatever the agent finds: 9-ball, 8-ball, English pool, six-reds | From the start | Reputation and agent confidence earn club bookings |
| **2. The Clubs** | Club opens and handicaps across every discipline (10-ball, ten-reds, billiards, 3-cushion, pyramid) | Agent bookings, or a wildcard after a pub title | Reputation band "Club name" plus a club title: the agent offers to **specialise** |
| **3. Specialise** | A one-off scene: pick one or two tours. The agent's advice uses your familiarity and results | End of a season once eligible, and again at every season end | Each tour starts you on its feeder circuit or at Q-School, depending on your results |
| **4. Tours** | Each tour: feeder events → Q-School → tour card → ranking events | Tour card (2 seasons), the ranking, or qualifiers | Keep your card by staying inside the ranking cut when it expires. Drop out and it's Q-School again |
| **5. Majors** | Each tour's 3–4 majors on the TV stage | Ranking top N, or win a qualifier | Trophies, legacy, sponsor offers |

Example season 1:

> **Intro.** _"Right, kid. I've seen you play. You're raw, but there's something there. I don't care if it's
> pool, snooker or billiards. If there's a table and a prize, I'll get you on it. You do the potting, I'll do
> the phoning. Deal?"_
> **Week 1:** Red Lion 9-Ball Night. Pre-event: _"Pub crowd, nobody special. Get me to the semis."_ You lose
> in the quarter-final. After: _"Not the end of the world. Your safety let you down, so we'll work on that."_
> **Week 2:** The Anchor Six-Reds. _"Snooker this week. Bigger table, smaller pockets. Don't panic."_ You win
> it. _"Now we're talking. The Corner Pocket rang. They want you at their 10-ball open."_
> **Season end:** a review from the agent with your results against their targets, how confidence moved and
> what's next ("Get to Club name and I'll talk to the tours").

## Systems

### 1. The agent

- A single fictional character with a name, a face (an existing figure preset) and a voice in text. They
  speak in a short, warm, slightly pushy tone.
- **First visit:** a short intro over 3–4 cards that covers who you are, what the agent does, how weeks work
  and what the guide and skills mean. You can replay it from Profile.
- **Pre-event talk:** the event, the discipline (with a one-line reminder of the rules if your familiarity
  is low), the field and any rival, and a **target** (e.g. "reach the quarter-finals").
- **Post-event talk:** your result against the target, a stat to praise or criticise (long pots, safety
  success, breaks), the change in confidence, and any news.
- **Inbox:** wildcards, invitations, sponsor offers, the specialise offer, coaching offers and cue offers.
- The lines are templates with slots for names, results and stats, picked by a seeded RNG, so they work
  offline with no LLM.

**Confidence** (0–100, starts at 50):

- It goes up when you beat a target, and more for a title or an upset. It goes down when you miss one.
- **High confidence:** bigger events, wildcards, sponsors and a smaller cut. **Low confidence:** smaller pub
  nights, no wildcards, and a firmer tone in the talks.
- The **agent's cut** is 20% at the start, falls to 15% and then 10% as your reputation grows, and is
  negotiable through one inbox offer at each band.

### 2. Season calendar

- Seasons of about 12 weeks. Each week offers 1–3 events from the circuits and tours you can enter.
- In the **journeyman years** the agent picks a **booked** event each week. You can accept it, swap it for
  another event you're eligible for, or rest. Booked events have no travel cost.
- **On tour** you pick events from your tours' calendars. Two tours can clash in the same week, so you
  choose one.
- Events are data:
  `{ id, name, circuit, game, kind: 'pub'|'open'|'ranking'|'qualifier'|'qschool'|'major', week, fieldSize, format, entry, fee, travel, prize, points, venue }`.
- `eligibility(state, event)` returns `{ ok } | { locked, reason, progress }`, and locked events stay
  visible with a padlock and the reason.
- Training: one session per week alongside that week's event, plus paid coaching sessions (see below).

### 3. Tours

| Tour | Games | Feeder | Majors (fictional names) |
| --- | --- | --- | --- |
| **American Pool Tour** | 8-ball, 9-ball, 10-ball | Regional opens | 3 majors, one per game, plus a Masters |
| **Snooker Tour** | Snooker (15 reds), six-reds, ten-reds | Challenge events | A championship, a Masters, a six-reds world event |
| **Blackball Tour** | English pool | County events | National and international finals |
| **Billiards & Carom** | English billiards, 3-cushion, balkline | Club leagues | Billiards championship, 3-cushion cup |
| **Pyramid Tour** | Russian pyramid (Free and Neva) | Hall events | Pyramid cup |

- Each tour has a **rolling money ranking** over 2 seasons, seeded with a season 0 so it has shape from
  the start. The ranking decides seedings, major invites and whether you keep your card.
- **Tour cards** last 2 seasons. When yours expires you keep it only inside the ranking cut.
- **Q-School** at season end: 3 knockout days with points per round. The top N on points get a card.
- **Switching tours** at the end of a season: you can drop a tour and enter a new tour's Q-School straight
  away, or start on its feeder circuit. You keep your card on a tour you stay on.
- Brackets are seeded with byes where needed, in fields of 16–64. AI-only matches use a fast statistical
  sim.

### Crossover players

There is one shared roster of fictional players, not a separate field per tour. Each player has a **home
tour** with their full level, and can also play some events on other tours, where they're weaker. How much
weaker comes from a crossover table (home tour → other tour, as a level offset):

| Home tour ↓ / plays on → | Pool | Snooker | Blackball | Billiards & Carom | Pyramid |
| --- | --- | --- | --- | --- | --- |
| **Snooker** | −1.0 (mid-ranked) | — | −0.8 | −1.0 | −1.2 |
| **Pool** | — | −1.8 (low-ranked) | −0.6 | −1.5 | −1.0 |
| **Blackball** | −0.8 | −1.6 | — | −1.6 | −1.2 |
| **Billiards & Carom** | −1.2 | −0.8 | −1.0 | — | −1.0 |
| **Pyramid** | −0.8 | −1.0 | −1.0 | −1.2 | — |

- So the snooker world number 1 turns up on the Pool Tour as a solid mid-table player, a top pool player
  scrapes around the bottom of the Snooker Tour, and the best billiards players are dangerous anywhere,
  above all on the Snooker Tour.
- Each player has one or two **side tours** (seeded from their style), plays a few of those tours' events a
  season, and earns ranking money there like anyone else. Their rank on a side tour is a real one, earned
  from their results.
- This gives you familiar faces, and rivals, on every tour you join, and a "you vs the snooker champion"
  moment in a pool major.
- The crossover numbers are starting points, tuned with `quickSim` so the side-tour rankings come out
  roughly where the table says.

### 4. Player attributes

There are six attributes, each rated 1–99. They affect **career** matches and career training only. Quick
play, practice and challenges are unchanged.

| Attribute | Low (start) | High | What it changes | Trained by |
| --- | --- | --- | --- | --- |
| **Vision** | Cue line to contact only | Long object-ball line, cue-ball path after contact, first cushion rebound | Guide line lengths (`guide-view.ts`) | Pots, position shots that leave a pot |
| **Nerve** | Lines shrink hard and the aim wobbles on pressure balls | Barely affected | Pressure multiplier on lines and wobble | Pressure balls potted, deciders won |
| **Cueing** | The strike drifts a little off the aim | Strikes go where you aim | Gaussian aim error on the strike | Long pots, clean strikes, runs and breaks |
| **Spin** | Spin widget reach about 0.25R, applied spin scatters | Full reach (to miscue), accurate | Tip-offset cap and offset error | Successful screw, stun and side shots |
| **Cushion craft** | Max elevation about 10°, banks and kicks scatter | Full elevation, massé and jump | Elevation cap, extra error on cushion-first and bank shots | Banks, kicks, cushion-first escapes |
| **Touch** | Power is applied loosely | Precise pace | Power error | Safeties that leave no pot, lag shots, gentle positional shots |

**Vision in detail (the guide grows):**

| Vision | Guide |
| --- | --- |
| 1–14 | Cue line to the ghost ball only |
| 15–34 | Plus a short object-ball line (growing from 10% to 40% of its full length) |
| 35–59 | Plus a short cue-ball tangent line, and the object-ball line grows to full length |
| 60–79 | The cue-ball line grows and shows the effect of the chosen spin (stun, screw or follow) |
| 80–99 | Plus the first cushion rebound for both balls |

The guide in career mode always ignores squirt, swerve and throw, as it does now, so those stay real skills.

**Familiarity** (per game, 0–100): how well you know that game's table, pockets and rules. Low familiarity
scales your shared attributes down for that game (about ×0.8 at 0, ×1.0 at 100). It's built only by playing
and training that game, and decays slowly when you don't play it. This is what makes the journeyman years
and the choice to specialise matter.

**How you improve (XP):**

- **Use-based XP** comes from career matches: each attribute gains from the matching actions in the table.
- **Level-ups:** match XP (more for wins, upsets and titles) raises your player level. Each level gives a
  skill point to spend on any attribute.
- **Training:** one free drill per week from `drills.ts` (for example a long-pot drill trains Cueing, a
  cushion drill Cushion craft, a pressure drill Nerve). XP scales with how well you do.
- **Coaching:** paid sessions (the agent arranges them) give extra XP to one attribute or one game's
  familiarity. Money speeds progress up but never raises the ceiling.
- **Stage ceilings:** 40 at the pub, 60 at the clubs, 80 on a tour's feeder circuit, 99 with a tour card.
  The agent tells you when your ceiling rises.

### 5. Pressure

- `pressure(matchState) → 0..1` is worked out from the rules and the score:
  - **Frame or rack ball:** the 9 (or the 10) in 9-ball and 10-ball, the black in 8-ball and English pool,
    the ball in snooker that takes the frame beyond reach (or the last ball), and the last few points in a
    points game.
  - **Hill and match ball:** extra when you're on the hill, and most when it's for the match.
  - **Stakes:** a multiplier per round and event (pub final < club final < tour ranking event < major
    final).
- **Effect:** guide lengths ×(1 − 0.6 · pressure · (1 − nerve)), plus a visible slow sway of the aim
  whose size scales with pressure × (1 − nerve) (no hidden error). A small HUD cue (a pulse on the ball or a heartbeat icon) shows when a ball
  is a pressure ball.

### 6. Money

- **In:** prize money minus the agent's cut, and sponsor deals (a fixed amount per season with a goal, e.g.
  "reach two quarter-finals").
- **Out:**
  - **Entry fees:** pub free, club £20–50, feeder £100, ranking events £250, Q-School £1000. Wildcards and
    agent bookings are free.
  - **Travel:** per event, by distance. Booked events have no travel cost.
  - **Coaching:** a fee per session.
  - **Cosmetics:** cues, wraps, ferrules, waistcoats, cloths (the v1 rewards become shop items, and titles
    still unlock special ones).
- **Cues with stats:** a small range of fictional cues, each with modest effects. For example: low-deflection
  shafts (less squirt), a heavier butt (more power, less touch), a stiffer tip (more spin reach, more miscue
  risk). The caps are about ±5 rating points, so a cue never replaces training.
- **Going broke:** if you can't afford an entry, the agent books free pub nights and points it out in the
  talk. You can't go below zero.

### 7. Reputation, milestones and rivals

- Reputation bands: Unknown → Pub regular → Club name → Circuit regular → Tour pro → Star → Legend.
- Milestones are data rules (`{ id, when(state), once, effect, message }`) for club bookings, the
  specialise offer, each tour's Q-School place, the nickname, the first major invite, the first 147 or a
  century, a golden break, and so on.
- Rivals: the player who beats you most, or knocks you out of a final, becomes a rival per tour, with
  pre-match lines and a head-to-head on the walk-on card. The v1 rivals (Gaz, Priya, Viktor, Cal) carry
  over.

## UI plan

A full-screen **Career Hub** with tabs:

1. **Home:** the agent's card with their latest line, this week's booking (accept, swap or rest), the next
   fixture, your form, a confidence meter and the next goal.
2. **Calendar:** the season week by week, in circuit and tour colours, with the status of each event:
   booked, entered, eligible, locked (reason) or result.
3. **Tours:** your tours' rankings, card status and cut lines, plus the tours you could join and what each
   would take.
4. **Profile:** attributes with XP bars and skill points to spend, familiarity per game, cue and kit,
   stats, trophies and a timeline. Retire and the replayed intro live here.
5. **Inbox:** agent messages with action buttons.

Other screens: the agent's intro, the pre-event talk, the walk-on card (opponent, stakes, h2h), a post-match
strip (XP, ratings up, money), the post-event talk, the specialise and switch-tour scene, a shop, and the
season review.

## Engine and file layout

```
apps/web/src/game/career/
  career.ts       state, newCareer, weeks, recordResult (orchestration)
  circuits.ts     circuits, tours, event templates, formats, prizes, points, fees, travel
  calendar.ts     seeded season generation, agent bookings
  entry.ts        eligibility, reasons and progress
  bracket.ts      seeded N-round knockouts with byes
  quickSim.ts     fast statistical results per game and level
  ranking.ts      circuit tables, rolling tour rankings, card expiry
  attributes.ts   ratings, XP, levels, caps, familiarity, and the career shot tuning
  pressure.ts     pressure from rules and match state, and its effect on the guide and wobble
  agent.ts        confidence, targets, cut, talk templates
  milestones.ts   rules → effects and messages
  economy.ts      fees, travel, coaching, shop, cues with stats
  stats.ts        career stats and head-to-head
  migrate.ts      v1 → v2 save migration
```

- **Career shot tuning:** one function maps (attributes, familiarity, cue, pressure) to guide lengths, aim
  error σ, power error, spin-offset cap and error, and the elevation cap. The shot flow and guide view read
  it only when a career match is in progress.
- Everything is pure and seeded, and unit-tested with fixed seeds. That includes a playthrough test: a bot
  that wins everything reaches a tour card in the expected number of seasons, and one that loses everything
  stays at the pub.
- Save key `cuesports.career.v2`. v1 saves are migrated: the best tier reached sets your stage, and your
  unlocks, head-to-heads and titles carry over. Attributes start at that stage's level.

## Phases

Each phase ships on its own and leaves the game playable.

1. **The agent and the hub.** _Built._ The tabbed hub (Home, Events, Inbox, Profile) on top of the v1
   events: Old Joe's intro, his booking each time you're free, a target and talk before each event, a line
   after each match (also in the result sheet), his verdict at the end, confidence that moves with results
   against his targets (and keeps you a tier lower when it's low), inbox news (first title, new venues,
   rivals beaten, form talks), the walk-on card and a career timeline. Code: `game/agent.ts`.
2. **Attributes and the guide.** _Built._ Six ratings with XP (`game/attributes.ts`): from your shots in
   career matches (pots, long pots, spin pots, banks and kicks, safeties and soft pots), from deciders and
   wins (Nerve), and from training. Player levels give skill points to spend on the Profile tab. Ceilings
   of 40/60/80/99 by the highest tier open, and Joe tells you when one rises. Familiarity per game scales
   your ratings (×0.8 to ×1). **Nothing is random: the ball always goes where you aim it.** Low ratings
   show you less and let you do less, and every limit is visible:
   - **Vision**: the guide. Contact only at first, then an object-ball line that grows a few
     centimetres at a time from Vision 3, then the stun line from 35, a spin-aware cue-ball path from 60,
     and one cushion rebound from 80.
   - **Cueing**: the most power you can use (60% of the bar at first, all of it at 99). The rest of the
     power bar is shaded.
   - **Spin**: how far from centre you can strike (the spin widget shades the rest).
   - **Cushion craft**: how high you can raise the cue (the elevation slider stops there).
   - **Touch**: how much the guide allows for squirt from side (none at first, all of it at 99).
   - **Nerve**: see pressure.

   At 99 everything is exactly as in quick play. Training: one session between events, on eight of the
   challenges, with XP by stars. Old careers start with ratings for the tier they reached. (The first
   version also scattered the aim, pace and tip at low ratings. That was taken out after playtesting:
   missing a pot you aimed right felt like pot luck.)
3. **Pressure.** _Built._ `game/pressure.ts` reads the ball and the score: the money ball in 9-ball,
   10-ball and eight-ball (and a little for the last two or three balls before it), the snooker pot that
   puts the frame out of reach, and the last points of a points game. It's worth more on the hill, and a
   hill-hill decider adds a touch on every ball. The event's stakes scale it (by tier, more in the semis
   and most in the final), and Nerve takes up to 85% of it away. What you feel shrinks the Vision lines
   (by up to 60%), adds a slow sway of the aim that you can see on the cue and the guide (off with reduced motion), and shows a
   heartbeat badge ("Nervy", "Pressure", "Big pressure"). Potting a pressure ball cleanly earns Nerve XP.
4. **Calendar and money.** _Built._ `game/season.ts`: seasons of 12 weeks. Each week has three events on
   the calendar, seeded per career, so a season looks the same every time: one at your level (a tier lower
   when Joe has lost faith), one in a different game, and one locked just above you to aim for. You
   play one event a week or rest, and the week moves on when your event ends. A rest week gives you a
   training session. Entry fees by tier: pub free, £20, £50, £100. Travel: free, £10, £30, £60. Joe's
   bookings save you the travel, and he covers the entry too when his confidence is 75 or more. Prize
   money by tier (£100, £400, £1,200, £4,000 to the winner): half for the runner-up, a quarter for
   losing in the semis, nothing for losing your first match. Joe takes 20% (15% once the halls are
   open, 10% at the arena). You start with £50, can't enter what you can't afford, and the pub is
   always free. At the end of the season Joe sends a review. The Events tab is now the Calendar: this
   week, coming up, and the season so far. Not built: the bigger fields and quick simulation, which
   wait for the tours in phase 5. Spending on coaching, cues and kit comes with phase 6.
5. **Specialising and tours.** The specialise scene, the five tours, rankings, cards, Q-School, majors and
   qualifiers, switching tours at season end.
6. **Flavour.** The shop and cues with stats, coaching, sponsors, rivals per tour, nicknames, venues (pub,
   club, hall, TV arena).

