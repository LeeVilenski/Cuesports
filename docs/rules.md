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

## 9-ball (WPA)

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

The match layer (`apps/web/src/game/match.ts`) adds players, a race to N racks and who breaks next
(alternate, or the winner).

Not yet: the break box option, and fouls that need ball tracking in the hand (touching a ball, double hits).
