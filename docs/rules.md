# Rules engine

Rulesets live in `packages/rules`. They are pure functions: given the state before a shot, what the player
declared (a push out, or a called ball and pocket later on), the balls before the shot and the physics
`ShotResult`, they return a `Judgement`: the new state, the balls after the rules have been applied (a
spotted 9, a returned cue ball), fouls, the next `Turn`, and whether the frame is over.

Rulesets never touch the DOM or the renderer, so the same code judges shots in tests, in the game and later
in the AI worker. Scenario tests build synthetic event timelines, so they need no physics.

## The interface

- `newFrame(options, rng, breaker)` racks the balls and returns the opening turn.
- `judge(state, declaration, before, result, options)` judges a shot.
- `decide(state, choice, balls, options)` applies a decision offered in `Turn.decision` (for example "play
  from here" or "pass back" after a push out).

A `Turn` says who is at the table, where they may place the cue ball (`none`, `anywhere`,
`behind-head-string`), which balls must be hit first, whether a push out is allowed, and any pending decision.
`Judgement.points` and `ShotDeclaration.call` are there for scoring and call-shot games.

Shared helpers: `shotFacts()` (first contact, rail after contact, pots, scratches, balls driven to a
cushion), `spotBall()` (on a spot, or as close as possible behind it on the long string), and
`canPlaceCueBall()`.

## 9-ball and 10-ball (WPA)

Both are built from one rotation ruleset (`rotation.ts`).

### 9-ball

- Rack: the 1 on the foot spot at the apex, the 9 in the middle, the rest at random.
- Break from behind the head string. A legal break hits the 1 first and either pots a ball or drives at
  least four object balls to a cushion (an option); otherwise it is a foul.
- Every shot must hit the lowest ball first, then pot a ball or send any ball to a cushion.
- After any foul the incoming player has ball in hand anywhere.
- The player who shoots straight after a legal break may push out; the opponent then plays from there or
  passes the shot back. No push out after a foul on the break.
- Potting the 9 legally wins, including on the break. A 9 potted on a foul or push out, or knocked off the
  table, is spotted. No other ball is ever spotted.
- Three consecutive fouls by the same player lose the rack (an option, on by default), with a warning after
  the second.

### 10-ball

- Rack: ten balls in a triangle, the 1 on the foot spot at the apex, the 10 in the middle of the third row.
- Same break, push out, foul and three-foul rules as 9-ball.
- Every shot after the break is called (ball and pocket) or declared a safety. The game calls automatically
  from the aim (the ball the guide hits and the pocket it is heading for); the player can override it.
- A called ball in its called pocket keeps the shooter at the table, even if other balls drop too.
- A ball potted without being called, or in the wrong pocket, is not a foul: the turn passes and the
  incoming player chooses to play from there or pass the shot back. Those balls stay down.
- A declared safety: any balls potted stay down and the turn passes, with no option.
- The 10 wins only when called and potted on a legal shot (combinations count). On the break, or uncalled,
  it is spotted.

The match layer (`apps/web/src/game/match.ts`) adds players, a race to N racks and who breaks next
(alternate, or the winner).

Not yet: the break box option, and fouls that need ball tracking in the hand (touching a ball, double hits).

## Snooker (WPBSA)

`packages/rules/src/snooker.ts`, with the snooker check in `snookered.ts`.

- Reds 1, yellow 2, green 3, brown 4, blue 5, pink 6, black 7. 15 reds by default (10 or 6 as options).
- Break-off from the D. While reds remain the player must hit a red; after potting one they nominate a
  colour (the game nominates the colour you are aiming at; tap the chip to choose another), and the colour
  is re-spotted. Once the reds are gone the colours are taken in order and stay down.
- Re-spotting: own spot, else the highest-value free spot, else as near as possible to its own spot towards
  the top cushion.
- Fouls score the opponent 4, or the value of the ball on, the ball hit first, or a ball wrongly potted or
  forced off the table, whichever is highest. An in-off gives ball in hand in the D.
- After a foul the next player plays from where the balls lie or makes the offender play again. If the
  offender failed to hit a ball on it is a miss (pro rule by default; the amateur option only calls it
  when the striker was not snookered), and the next player may also have the balls replaced.
- Three misses in a row with a clear view of a ball on lose the frame, with a warning after the second.
- Snookered: no ball on can be hit on both extreme edges in a straight line. After a foul that leaves the
  next player snookered they get a free ball: any ball nominated counts as the ball on.
- Touching ball: playing away from a ball on that the cue ball rests against counts as hitting it.
- A tie after the last black re-spots it; the player to go first is drawn by lot, and the next score or
  foul ends the frame. Either player may concede.

Not yet: an "angled" cue ball in the pocket jaws (counts as snookered), and the refinements to the miss
rule when a player needs snookers.

## English pool

`packages/rules/src/english.ts`. Reds, yellows and the 8, on the 7 ft English table. Two presets, each
transcribed from its rulebook, with every difference as an option (`EnglishOptions`):

| | International / Ultimate Pool (default) | World Eightball (WEPF / EPA) |
|---|---|---|
| Source | International Eightball Pool Rules v2d, Jan 2026 | WEPF rules, abridged, Jan 2020 |
| Legal break | 3 points: 1 per ball potted, 1 per ball wholly past the centre line (4f) | a colour potted or 4 balls to a cushion (F4a) |
| Illegal break | re-rack; the opponent breaks or gives it back (4g) | re-rack; the opponent breaks (F4b) |
| 8 on the break | re-spotted; play on (4i) | re-rack, same breaker (F5) |
| In-off on the break | loss of turn, incoming plays from baulk (4j) | turn passes (F4c) |
| Foul | one visit, ball in hand anywhere (6e) | two visits, cue ball where it lies (from baulk if it went in or off) (K) |
| Opponent's ball potted | loss of turn (6d) | standard foul (K3) |
| Open table | the group struck first is the call (6a) | potting both colours (or colours on the break) means choosing (H) |
| Total snooker | not used (stalemate instead, 6g) | only the first contact is required (G3b) |
| Foul snooker | not used | may nominate an opponent's ball or the 8 (P) |

Both: a legal shot hits a ball on first, then pots a ball or sends any ball to a cushion (6p, G1). The frame
is lost by fouling while potting the 8, potting it before the group is cleared, or potting it with the last
group ball (6f, M). Balls forced off the table are re-spotted on the 8-ball spot line (6m, S).

Not implemented (they need a referee or real-world events): the lag, shot clock, frozen-ball rule (6h),
stalemate (6g, W), push shots and double hits, conduct fouls. The WEPF two visits after re-breaking an
illegal break are not given. WPA Blackball and a traditional pub preset can be added once we have their
rulebooks.
