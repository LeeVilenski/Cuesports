# AI opponents

`packages/ai`. Headless: it uses the same physics and rules as the game, runs in a Web Worker in the game
(`apps/web/src/game/ai.worker.ts`) and in Node for tests, and gives the same choice for the same seed.

## How it chooses a shot

1. **Candidates.**
   - Pots: for every ball the player may hit and every pocket, a ghost-ball aim, skipped if the cue
     ball's or the object ball's path is blocked or the cut is thinner than 78°. Each pot is tried at
     several paces (from an estimate of the speed needed) and with stun, follow and draw.
   - Plants (Amateur and up): the cue ball sends a ball on into another ball that drops, when the
     second ball is within 0.9 m and both cuts are under 60°. Caroms come out of the normal pots.
   - Kicks: when no ball on can be hit directly, one-cushion shots off each rail, aimed by mirroring
     the target and searched across a ±5° fan (the cushion doesn't reflect like a mirror). Semi-pro and
     Pro also consider kicks when a ball is hittable.
   - Safeties: soft contacts across the nearest balls on, from thin to full.
   - Breaks: firm shots at the apex ball. Snooker break-off: thin contacts on the end reds of the pack
     from the D, with side.
   - Ball in hand: cue-ball positions behind the ghost ball on a straight or slightly angled line
     ("anywhere"), or a grid inside the zone (behind the head string, in baulk, in the D).
2. **Evaluation.** Each candidate is simulated with the real physics and judged by the real ruleset.
   Scores: winning or losing the frame dominates; fouls cost a lot; snooker points count; keeping the
   table is worth more with an easy next pot (straighter, shorter, unobstructed); handing over the table
   costs according to how easy the opponent's best pot is. A cue ball frozen to (or near) a cushion
   counts as harder to play from. Hard shots (over 3.5 m/s) are penalised because errors grow with
   pace and fast balls rattle in the jaws.
3. **Spin refinement** (Club and up). The best three (Semi-pro and Pro: four) pots are retried with a
   range of follow and draw (from firm draw to firm follow) at three paces; Semi-pro and Pro then try the best of those with left
   and right side. Every variant is simulated and scored on where the cue ball ends up, so the AI
   chooses stun, follow, draw or side for position (and avoids following in-off).
4. **Robustness.** Stronger players re-run their best five (Semi-pro and Pro: eight) shots with their
   own errors applied and average, so they prefer shots that still work when slightly mis-hit.
   Position is worth less than making the pot, so a pot with good position never beats a safer pot by
   much when the risk is real.
5. **Execution.** The chosen shot is played with the player's aim, power and spin errors.

The AI calls 10-ball shots, nominates snooker colours and free balls, and answers decisions: push-out
replies and 10-ball options (play if there is a reasonable pot), snooker after a foul (play on with a
free ball or a chance, otherwise make the opponent play again, or replace the balls after a miss), the
English pool colour choice (the colour with fewer balls left) and illegal-break re-racks (break).

## Skill levels

| Level | Aim error | Power error | Position play | Robustness | Safeties |
|---|---|---|---|---|---|
| 1 Beginner | 1.0° | 14% | none | – | no |
| 2 Amateur | 0.6° | 10% | a little | – | no |
| 3 Club | 0.4° | 8% | some | 2 re-runs | yes |
| 4 Semi-pro | 0.2° | 5% | good | 4 re-runs | yes |
| 5 Pro | 0.1° | 3% | best | 6 re-runs | yes |

Weaker levels also sometimes pick a lesser shot (never one they can see is a foul).

Self-play in 9-ball (5 racks each): the Pro pots about 1.5 balls per visit with under 2% fouls and
averages about 0.9 s thinking on a desktop (budget 1.5 s); the Club player about 0.6 with 9% fouls; the
Amateur about 0.5 with 17% fouls.

In the game, the next shot starts half a second after the last ball drops, so a pot is seen to settle
in the pocket before the camera moves on.

## Not yet

Two-cushion kicks, banks (object ball off a cushion), safety play that plans two shots ahead, and snooker shot
selection that plans a break several balls ahead. Push outs are never played by the AI.
