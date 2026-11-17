# Physics engine

The engine lives in `packages/physics`. It is headless (no DOM, no Three.js) and deterministic.

## Conventions

- SI units: metres, kilograms, seconds, radians.
- The table centre is the origin. x runs along the length, y across, z up. The playfield edges are the
  cushion nose lines at x = ±length/2 and y = ±width/2.
- Ball positions are centres on the table plane. Spin is a full 3D angular velocity.

## Entry point

```ts
simulate(table: TableSpec, balls: BallState[], shot: ShotInput | null, opts?): ShotResult
```

`ShotInput` is the struck ball, aim angle, cue elevation, tip offset (fractions of the radius) and cue speed.
`ShotResult` holds the event timeline (strike, ball–ball, cushion, pocket, off-table, motion-state changes),
trajectory frames at `sampleRate` Hz, and the final ball states. Rulesets judge a shot from the events alone.

## Model

| Part | Model |
|---|---|
| Free motion | Closed-form sliding, rolling and spinning states with μs, μr and μsp. Each step is split at state transitions. |
| Cue strike | Impulse along the cue axis at the tip contact point, sized by an elastic cue/ball collision with tip restitution. Squirt uses Alciatore's end-mass formula; the default cue is a low-deflection shaft (4.5 g end mass, about 1.5° of squirt at half-ball side). The aiming guide can follow the squirted launch direction. Elevation tilts the spin axis, giving swerve and masse. Offsets beyond the miscue limit miscue. |
| Ball–ball | Impulse with restitution plus friction, using Alciatore's speed-dependent μ(v) = a + b·e^(−c·v). This gives cut-induced and spin-induced throw, capped at the gearing (no-slip) limit. Works with unequal balls (the smaller English pool cue ball). |
| Cushions (values) | Restitution 0.85 at low speed for pool (pooltool's default), 0.8 for snooker, falling by 0.04 per m/s of impact speed. It was 0.92 at first, which made cue balls too lively after the first cushion. |
| Cushions | Mathavan, Jackson & Parkin (2010): the impulse is integrated in small steps, with friction at both the cushion nose (above the ball's equator) and the slate. Restitution falls with impact speed. |
| Rail hugging | Below roughly `hugSpeed` (0.12 m/s) of normal impact speed the cushion's rebound fades out, so a ball that grazes the rail runs along it rather than drifting off. Without this, an object ball cut down the rail nicks the cushion, drifts a few centimetres off it and meets the far jaw head-on. |
| Pockets | Built from `PocketSpec`: rails stop at the jaw tips, a rounded knuckle (jaw radius) turns into a straight facing at the facing angle, and an arc closes the back. The slate's drop edge is a curve: `shelfDepth` behind the mouth on the pocket's centre line, curving `dropSag` deeper where it meets each jaw (an arc of the circle through those three points). A ball is over the drop once its centre is inside that circle, anywhere across the mouth, so a ball riding a facing counts too. The renderer cuts the same shape out of the cloth and rolls the cloth over the edge with a 5 mm radius (BCA allows 1/8–1/4"). A ball drops once it has been over the drop long enough to fall 0.7 radius, or when it reaches the back. Facings hit by a ball already over the hole are much deader (restitution 0.35), because the ball meets the undercut facing below the nose. Jaw hits at the mouth keep full cushion behaviour, so a ball that catches a knuckle can still rattle out. The 9 ft table follows WPA specs: corner mouth 4.5", 142° facings, 1" shelf; side mouth 5.125", 104° facings, ⅛" shelf. |

## Cloth speed

| Table | Slide μs | Roll μr | 1 m/s roll distance | Lag (head → foot → head) |
|---|---|---|---|---|
| American pool 9 ft | 0.18 | 0.0125 | 4.1 m | ~7.6 s |
| English pool 7 ft | 0.18 | 0.014 | 3.6 m | ~6.2 s |
| Snooker 12 ft | 0.18 | 0.0125 | 4.1 m | ~8.9 s |

These are medium (club) cloths. pooltool's default μr = 0.01 is closer to a fast tournament cloth. The game's
cloth-speed setting scales μr by 0.8 (fast), 1 (medium) or 1.25 (slow, pub). Sliding friction sets how long
spin survives before the ball rolls. Playtesting moved it from 0.2 to 0.16 (draw died too quickly) and then to
0.18 (strong spin carried too far). The game also tops up off-centre hits by a third of the pace the strike
loses (`STROKE_COMPENSATION`).

## Integration

A fixed base step (1 ms) is split at the earliest contact, found with swept tests (circle–circle and
circle–capsule) using each ball's velocity at the start of the step. Balls are advanced exactly to that time,
the contact is resolved, and the search repeats. Balls can't tunnel at any speed, and a rack of touching balls
resolves as a sequence of contacts. Racks get seeded jitter of up to 0.1 mm so a break is never perfectly
symmetric.

## Determinism

- No `Math.random`: use `Rng` from `@cuesports/shared`, seeded.
- No `Math.sin`, `Math.cos`, `Math.exp` or `Math.atan2` in simulation code. Their results can differ between
  JavaScript engines. `detSin`, `detCos` and `detExp` use only exactly rounded operations. ESLint enforces this
  for `packages/shared` and `packages/physics`.
- Golden tests (`golden.test.ts`) check that a fixed set of shots gives bit-identical end states and event
  timelines.

## Known limitations and tuning to do

These are for tuning in the lab and for playtests in M2:

- **Snooker and English pool pockets (first pass, M4).** They now differ from American pockets in three
  ways (all `PocketSpec` fields): a smaller knuckle (15 mm) that throws back balls that clip the jaw, lively
  facings even over the drop (`dropFacingRestitution: null`), and a soft pocket back that the ball bounces
  off (`backRestitution: 0.15`) instead of dropping on contact. Measured straight-in tolerance on a snooker
  corner (sideways offset that still drops, from 0.9 m): ±25 mm slow, ±23 medium, ±8 firm, ±5 very hard,
  against ±33 at all paces for a 9-ball corner. Still to judge in playtesting.
- **Pocket pace sensitivity is weak.** Off-line balls correctly rattle out of tight pockets, but a ball rolled
  down the rail into a corner drops at almost any pace. Real tight pockets reject fast rail shots more often.
  The drop depth (`DROP_DEPTH` in `simulate.ts`), shelf depth and facing angles are the levers.
- **Check side has a smaller effect than running side** off a cushion. This follows from the Mathavan model
  (cushion friction is already saturated for most impacts without side). Cushion friction μw is the lever if it
  feels wrong.
- **No vertical motion yet.** Balls never leave the slate: no jump shots, and no ball rising on a hard cushion
  hit. The data model leaves room for it.
- **No cloth nap.** Snooker nap drift is not modelled.
- **Cross-engine determinism has only been verified in Node (V8).** The golden tests should also run in
  WebKit and Firefox once Playwright tests are added in M2.

## Cue clearance

The cue can't pass through the cushion, the rail or another ball (`cue-clearance.ts`). Before a shot,
the cue's elevation is raised to the lowest angle at which its tapered shaft clears the cushion top,
the rail top and every ball along its length, measured from where the tip meets the cue ball, so
hitting higher (follow) needs less lift than hitting low. A real cue always has a few degrees of
natural lift over the rail; the game's 0° stands for that, so only elevation beyond about 3° is forced.
The game shows the forced angle in red on the spin widget ("raised to clear" in the spin sheet), and
the AI simulates its shots with the same raised cue.
