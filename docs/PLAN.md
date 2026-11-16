# Cuesports — Project Plan

A 3D, mobile-first browser game covering several cue sports. It uses realistic ball physics, 3D balls and
venues, and animated 3D players at the table. It is free, installable as an offline PWA, and also playable
on desktop.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Launch games | Snooker, English Pool (blackball), 9-ball, 10-ball |
| Later games | English Billiards, 3-Cushion, Balkline, Russian Pyramid; then national and pub variants: Chinese 8-ball, straight pool, one-pocket, cowboy pool, slosh and more (see §4) |
| Play modes | Vs AI, local pass-and-play, practice / trick shots. **No online multiplayer at launch** (but architecture should not preclude it) |
| Single player | Quick match, career / tour mode, character customisation, stats & replays |
| Rules | Official rulesets by default (WPBSA, WPA; **Ultimate Pool rules** for English pool), with the other rule variants available as toggles |
| Hosting | Vercel (static PWA build, Git-connected preview and production deployments) |
| Tech | TypeScript, Three.js rendering, custom deterministic physics engine |
| Characters | Animated 3D players visible at the table (between shots, cinematic cams, replays) |
| Controls | Both drag-to-aim + power slider **and** pull-back cue stroke, switchable in settings |
| Art style | Stylised realistic. Placeholder art first, final art source decided later |
| Platform | Installable PWA, works offline, landscape **and** portrait, desktop (mouse/keyboard) secondary |
| Monetisation | None (free, no ads, no accounts required) |

---

## 2. Architecture overview

The codebase is split into layers. Each layer depends only on the layers below it:

```
┌─────────────────────────────────────────────────────────────┐
│ app/          UI shell, menus, career, settings, PWA         │
├─────────────────────────────────────────────────────────────┤
│ game/         match flow, turn mgmt, input → shot, AI driver │
├───────────────┬───────────────────────┬─────────────────────┤
│ render/       │ rules/                │ ai/                 │
│ Three.js      │ pure TS rulesets      │ shot search using   │
│ scene, cams,  │ (snooker, pool, …)    │ physics simulation  │
│ characters    │                       │                     │
├───────────────┴───────────┬───────────┴─────────────────────┤
│ physics/   deterministic ball/table simulation (no DOM, no Three.js)   │
├─────────────────────────────────────────────────────────────┤
│ shared/    vector math, seeded RNG, table/ball specs (data)  │
└─────────────────────────────────────────────────────────────┘
```

Key principles:

1. **`physics/` and `rules/` are headless.** They import nothing from Three.js or the DOM. They run in Node
   for unit tests, in a Web Worker for the AI, and on the main thread during play.
2. **Determinism.** Given the same table state and shot parameters, the simulation always produces the same
   result. The engine uses a fixed timestep, no `Math.random` (seeded RNG only), and a stable iteration
   order. Replays are therefore just `(initial state, shot params)` and are tiny. Online play could be added
   later on top of this.
3. **Data-driven tables and games.** Tables, pockets, balls and cloths are described by JSON-like specs, and
   a ruleset is a module that plugs into a common interface. Adding Russian Pyramid later should mean
   adding a spec and a ruleset, not changing the engine.
4. **Physics produces events and rules consume them.** The simulation emits a timeline of events (ball–ball
   contact, cushion contact, pocketed, came to rest, and so on). Rulesets judge the shot from that timeline
   alone.

### Repository layout (pnpm workspace)

```
cuesports/
├─ apps/
│  └─ web/                 # Vite + TS app: app/, game/, render/ code, assets, PWA config
├─ packages/
│  ├─ shared/              # math, RNG, specs, types
│  ├─ physics/             # simulation engine + tests
│  ├─ rules/               # rulesets + tests
│  └─ ai/                  # AI shot selection (runs in worker)
├─ tools/
│  ├─ physics-lab/         # 2D top-down debug harness for tuning physics
│  └─ asset-pipeline/      # glTF optimisation, KTX2 texture compression scripts
├─ assets-src/             # source art (Blender files etc.; may move to LFS)
└─ docs/
```

### Tooling

- **Build:** Vite, TypeScript (strict), pnpm workspaces
- **Rendering:** Three.js (WebGL2 first; WebGPU renderer as an optional upgrade later)
- **UI:** a lightweight DOM UI layer (Preact or Solid) overlaid on the canvas, which keeps menus accessible and responsive
- **State:** a plain TS state machine for match flow and a small store for UI
- **Testing:** Vitest (physics, rules, AI), Playwright (smoke tests, screenshots on mobile viewports)
- **PWA:** `vite-plugin-pwa` (Workbox) for precaching and offline play
- **Storage:** IndexedDB (via `idb`) for career saves, stats, replays and settings
- **Lint/format:** ESLint + Prettier; CI on GitHub Actions (typecheck, lint, test, build)
- **Hosting:** Vercel, connected to the GitHub repo. Every branch or pull request gets a preview URL, which
  can be opened on a phone to test. `main` deploys to production. The game is a static Vite build, so no
  serverless functions are needed. `vercel.json` sets the cache headers: the service worker and
  `index.html` are never cached long-term, while hashed assets are cached permanently. This stops old
  versions sticking after an update.

---

## 3. Physics engine (the core of "realistic")

### 3.1 Model

Each ball has a position, velocity, angular velocity (full 3D spin), and orientation (a quaternion, used for
rendering numbers and spots). Balls are simulated on the table plane, with limited vertical motion so that
jumps and jaw rattles can be added later.

**Ball motion states.** Each state has its own analytic equations of motion:
- **Sliding:** the contact point slips on the cloth. Kinetic friction (μs ≈ 0.2) changes both velocity and
  spin until natural roll is reached.
- **Rolling:** rolling resistance (μr ≈ 0.01) decelerates the ball.
- **Spinning in place:** spin friction about the vertical axis decays sidespin.
- **Stationary**

**Cue strike.** Inputs are the tip offset (a, b) on the cue ball, the cue elevation, the power and the cue
mass. These produce the initial linear velocity and spin. The model includes **squirt** (cue-ball
deflection from sidespin) and, with cue elevation, **swerve/masse**. Miscues happen when the tip offset
goes past about 0.5R.

**Ball–ball collisions.** Mostly elastic (e ≈ 0.93–0.96), with ball–ball friction producing **throw**
(cut-induced and spin-induced), so that english affects the object ball the way it does in real play.
This follows Alciatore's throw model.

**Cushion collisions.** Uses the Han (2005) or Mathavan et al. (2010) cushion model. The cushion contact
point sits above the ball centre (nose height ≈ 0.63–0.65 × 2R, varying by table), so spin changes the
rebound angle and running/check side behaves realistically. Restitution depends on speed.

**Pockets.** Pockets are modelled as real geometry rather than "a circle that eats balls":
- Jaws (curved cushion segments) with a configurable mouth width, jaw angle and jaw radius
- A pocket "fall" region with a shelf/drop. This produces rattles, jaw-hangs and balls that drop off the
  shelf
- Profiles differ per game: snooker has tight rounded pockets, English pool has tight rounded pockets,
  American pool has wider cut pockets, and Russian Pyramid has pockets only a few mm wider than the ball
- Pocketless tables (carom) simply have no pocket segments

### 3.2 Integration strategy

The recommended approach is a **hybrid of event-based and fixed-step simulation**:
- Between collisions, ball motion has closed-form solutions in each motion state. The engine predicts the
  next event time: a collision, a cushion hit, or a state transition such as sliding → rolling.
- Collisions are found by solving polynomial time-of-impact equations (quartic for two balls in
  quadratic motion), with a robust solver and tolerance handling.
- This approach (as used by `pooltool`) is exact and fast, and it gives no tunnelling at high power, which
  matters for break shots on mobile CPUs.
- If the event solver proves too fiddly, the fallback is a fixed 1 ms step with sub-stepping and
  swept-sphere checks. The engine interface is the same either way.

**Output:** a `ShotResult` containing a sampled trajectory for rendering at 60–120 Hz, a list of events,
and the final state. During play the simulation runs a little ahead of the renderer, which interpolates.

### 3.3 Validation

- Unit tests against known physics, for example: a stun shot on a full-ball hit stops dead; a 30° cut
  sends the cue ball off on the tangent line with throw ≈ X°; natural angle off a rail; the break spread
  is statistically sensible.
- The `tools/physics-lab` 2D harness has sliders for every coefficient, overlays trajectories, and lets
  shots be recorded and replayed. Tuning happens here before touching the 3D game.
- Golden-file tests: a set of saved shots must produce identical end states, which catches determinism
  regressions.

### 3.4 Specs (data)

```ts
interface BallSpec   { radius: number; mass: number; restitution: number; /* per set */ }
interface ClothSpec  { slideFriction: number; rollFriction: number; spinFriction: number; nap?: NapSpec; }
interface CushionSpec{ noseHeight: number; restitution: number; friction: number; profile: 'K66'|'L-shape'|... }
interface PocketSpec { id: string; position: Vec2; mouthWidth: number; jawAngle: number; jawRadius: number;
                       shelfDepth: number; fallRadius: number; }
interface TableSpec  { id: string; playfield: { length: number; width: number }; cushion: CushionSpec;
                       pockets: PocketSpec[]; cloth: ClothSpec; markings: MarkingSpec[]; /* baulk, D, spots */ }
```

Initial table presets:

| Preset | Playfield (approx.) | Balls | Pockets |
|---|---|---|---|
| Snooker 12 ft | 3569 × 1778 mm | 52.5 mm, 22 balls | Tight, rounded |
| English pool 7 ft | ~1980 × 990 mm | 2″ object, 1⅞″ cue ball | Tight, rounded |
| American pool 9 ft | 2540 × 1270 mm | 2¼″ | Cut, wider |
| *(Later)* English billiards | Snooker table | 3 balls, 52.5 mm | Snooker |
| *(Later)* Carom 10 ft (3-cushion, balkline) | 2840 × 1420 mm | 61.5 mm | None (heated slate, faster cloth) |
| *(Later)* Russian Pyramid 12 ft | ~3569 × 1778 mm | 68 mm, 16 balls (all the same colour) | Barely wider than the ball |

---

## 4. Rules engine

```ts
interface Ruleset<S> {
  id: string;                      // 'snooker', 'blackball', 'nineball', 'tenball', ...
  options: RuleOptionSchema;       // configurable house-rule toggles
  setup(opts, rng): { table: TableSpec; balls: BallState[]; state: S };
  legalActions(state: S): ActionSpec;   // ball-in-hand zone, nominate/call, push-out, re-rack choice…
  judge(state: S, shot: ShotInput, result: ShotResult): Judgement<S>;
  // Judgement: fouls, points, re-spots, next player, choices offered (e.g. "play again or hand back"), game over
}
```

### Launch rulesets

- **Snooker (WPBSA):** reds/colours sequence, re-spotting (including occupied spots), foul values (min 4),
  **free ball**, **miss rule** with replacement of the balls (with a toggle for the amateur version),
  snookered detection, respotted black on a tie, touching ball, concession logic. Options: 6/10/15 reds.
- **English Pool:** the default preset follows the **Ultimate Pool** rulebook. The rules will be transcribed
  from the current published rulebook during M4 and checked clause by clause in scenario tests. Every
  point where rulesets differ is a separate toggle, so any combination can be played. These include
  ball-in-hand anywhere vs. behind the baulk line, single shot vs. two visits after a foul, break
  requirements, how groups are assigned on an open table, the "total snooker" rule, and black-ball win
  and loss conditions. Alongside the default there are presets that set these toggles in one go:
  "WPA Blackball (World Rules)", "EPA", and "Traditional pub (two shots)". The game refers to rulesets by
  name only, with no organisation logos or branding.
- **9-ball (WPA):** lowest ball first, push-out after the break, ball in hand anywhere, three-foul rule
  (an option), golden break, plus a break-box option.
- **10-ball (WPA):** call shot (ball + pocket), push-out, the opponent's option after an uncalled pot,
  and a 10 pocketed on the break is re-spotted.

**Shared building blocks:** first-contact detection, the "cushion after contact" check, cue ball off the
table, ball-in-hand placement zones (anywhere, behind the head string or baulk, within the D), and ball
re-spotting with fallback spots.

**Later:** English Billiards (pots, in-offs and cannons, hazard limits, 15-hazard and 75-break cannon
limits), 3-Cushion, balkline (47/1, 47/2, 71/2 zone limits), Russian Pyramid (Free / Moscow / Nevskaya
variants). The interface already supports "choices offered" and "any ball as cue ball" (Pyramid), so these
fit without changes.

**National and pub variants (after M9):** all of these are planned, along with others suggested by
players:

| Variant | What it needs beyond the launch engine |
|---|---|
| Chinese 8-ball (heyball) | A 9 ft table with tight, rounded pockets (a new `TableSpec` preset) and its own break and foul rules |
| Straight pool (14.1 continuous) | Call shot, point scoring across racks, and re-racking 14 balls mid-frame while the 15th ball and the cue ball stay where they are |
| One-pocket | Each player is assigned one pocket, chosen at the break. Pots into other pockets are re-spotted |
| Cowboy pool | Points for pots, cannons and in-offs on a pool table, a fixed finishing sequence, and a final in-off. This reuses the carom scoring from English Billiards |
| Slosh | A pub game with its own ball values and scoring. Rules will be confirmed from a written source before it is built |
| Further candidates | Bank pool, 7-ball, 6-ball, rotation, killer (a multi-player elimination game), and American 8-ball |

The `Ruleset` interface needs a few general features to cover these: point scoring per ball and per
event, an assigned pocket for each player, re-racking mid-frame, and more than two players (for killer).
These are added to the interface in M3, so the variants only need their own ruleset modules.

**Testing:** each rule gets scenario tests built from synthetic `ShotResult` event lists. These need no
physics, so they are fast and exact.

---

## 5. AI opponents

- Runs in a **Web Worker** using the headless physics engine.
- **Candidate generation:** for each target ball and pocket (or carom path), compute ghost-ball aim lines,
  then sample spins and powers around them. Add safety candidates (snooker behind a ball, leave a long
  shot) and kicks or banks when no direct pot is available.
- **Evaluation:** simulate each candidate with noise applied to aim, power and spin, according to skill.
  Score the outcome as P(pot) × value + position quality for the next shot − risk (opponent's best
  chance). A depth of 1–2 shots is enough for convincing play.
- **Skill model:** each AI profile has aim error σ, power error, spin control, safety preference,
  break-building planning depth and aggressiveness. Career opponents get distinct "personalities".
- **Budget:** the AI is time-sliced so that it always "thinks" within about 0.5–2 s on mid-range phones.
  A cinematic camera covers the thinking time.

---

## 6. Rendering, cameras and visuals

### 6.1 Scene

- Stylised-realistic PBR. A baked lightmap and ambient occlusion for the venue, with one or two real-time
  lights over the table (a canopy light) and **soft contact shadows under the balls**. These shadows are
  essential for reading depth.
- **Balls:** a high-quality sphere mesh with clearcoat material and environment reflections from a small
  baked cubemap of the venue. Numbered and striped balls use a texture atlas. Ball rotation comes straight
  from the physics quaternion, so spin is visible.
- **Cloth:** a subtle normal or noise texture, a nap shading direction, and a chalk-mark decal option.
- **Table:** a modular glTF made of rails, pockets (leather/net or drop pockets), and markings generated
  from `TableSpec`. The same visual geometry is built from the physics data, so they never disagree.
- **Quality tiers:** Low/Medium/High chosen automatically from GPU detection and frame-time monitoring.
  The tiers control shadow resolution, MSAA/FXAA, reflection detail, character LOD and resolution scale
  (dynamic resolution).

### 6.2 Cameras

| Camera | Use |
|---|---|
| **Aim cam** | Behind the cue ball, low angle, pinch to zoom and pitch. This is the main aiming view |
| **Top-down** | Orthographic overview with an aim line. Rotated 90° in portrait mode |
| **Free/orbit** | Look around the table before a shot |
| **Follow cam** | Tracks the cue ball or object ball after the strike, with an optional smart switch |
| **Cinematic/broadcast** | Pocket-cam for close pots, wide shots between turns, player close-ups |
| **Replay** | Any camera, slow motion and scrubbing (cheap because the physics is deterministic) |

### 6.3 Aiming aids (configurable per difficulty)

These range from a full guide line (cue ball path plus object-ball direction and cue-ball deflection),
through a short guide, down to none ("pro" mode). Ghost-ball and contact-point indicators are available.
The spin selector is a cue-ball widget, and cue elevation is set with a vertical slider.

---

## 7. Characters

- **Placeholder phase:** simple stylised low-poly humanoid (Mixamo-compatible humanoid rig) with a few
  procedural colour/shape variations for the customiser.
- **Animation set:** idle, walk to table, chalk cue, get down (stance), feathering (synchronised with the
  pull-back gesture), stroke (synchronised with power), stay down, react (good shot / miss / foul /
  win), sit in chair (opponent), bridge variations (normal, over a ball, rail bridge, rest/spider for
  snooker).
- **Procedural IK:** the stance animation is adapted at runtime by IK. The bridge hand plants on the cloth
  near the cue ball, the cue aligns with the actual aim line, and feet are placed around the table edge.
  The character walks to the computed position for the shot. This is what makes characters look correct
  for every shot instead of reusing a canned pose.
- **Visibility rules:** during aiming the character fades or hides if it would block the aim cam. Players
  can switch it off to "cue only".
- **Customisation:** body type, skin tone, hair, face presets, outfit (waistcoat/bow-tie for snooker,
  casual for pool), cue (wood, ferrule, wrap) and table cloth colour. Customisation is data-driven so final
  art can be dropped in later.
- **Art pipeline:** Blender → glTF 2.0 → `gltf-transform` (meshopt + KTX2/Basis textures) → runtime
  loading. Rough per-character budget: ≤15k triangles at LOD0, ≤5k at LOD1, 1–2 × 1024² texture sets.
- **IP:** all characters, venues and tournaments are fictional. No real players, governing-body logos,
  or brand names.

---

## 8. Controls & UX

- **Mode A: drag-to-aim and power slider.** A one-finger drag on the table rotates the aim, with fine-aim
  via a slow drag zone or a nudge wheel. A vertical power bar on the side is pulled down and released to
  shoot.
- **Mode B: pull-back stroke.** The player drags back from the cue to set the backswing, then flicks
  forward. Power comes from the forward speed, with smoothing and clamping to avoid accidental max-power
  shots.
- **Common to both:** a spin widget (tap or drag on a mini cue ball), an elevation slider, camera buttons,
  ball-in-hand placement by drag with zone highlighting, undo while aiming (not after striking), and
  left-handed layout mirroring.
- **Desktop:** mouse aiming, scroll to zoom, keyboard fine-aim, mouse pull-back stroke, and space or click
  for slider mode.
- **Orientation:** layouts are responsive. In landscape the HUD sits around the table; in portrait the
  table is shown vertically, with the HUD at the top and bottom. Changing orientation mid-match keeps
  the state.
- **Accessibility:** colour-blind-friendly ball outlines/labels (important for snooker colours), haptics
  on strike/pot (Vibration API where supported), scalable UI text, and reduced-motion camera option.

---

## 9. Game modes & progression

- **Quick Match:** choose the game, ruleset preset, frames or races, opponent (AI level or local player),
  table and cloth.
- **Local pass-and-play:** 2 players, with an optional "hand the phone over" interstitial.
- **Practice:** free table, ball placement editor, line-up drills (the snooker line-up, 9-ball ghost) and
  repeatable shots (undo after the shot to retry it).
- **Trick shots / challenges:** hand-authored levels (`ChallengeSpec`: initial layout, objectives, star
  thresholds), with a level editor available in debug builds.
- **Career / Tour:** a fictional circuit of venues from pub to club to arena. Events per discipline have
  brackets and frame formats. Progress unlocks venues, cues, cloths and outfits; there is no currency
  shop, just progression. A rival system draws on the AI personalities.
- **Stats:** per game and per player. Pot success %, long-pot %, highest break, century count, safety
  success, run-outs, break-and-runs and win rates.
- **Replays:** stored as compact `(state, shot)` sequences in IndexedDB. Players can save highlights, and
  the last frame is replayable shot by shot. Exporting or sharing a replay as a file or link comes later.

---

## 10. Performance & platform targets

- **Target:** a steady 60 fps on mid-range 2021+ phones (for example Pixel 5a, iPhone 11, Galaxy A52),
  degrading to 30 fps rather than below on low-end devices.
- **Budgets:** ≤100 draw calls in play, ≤300k triangles on screen, ≤ 8 MB initial download, and full
  offline content ≤ 60 MB. Venues and characters load lazily.
- **Memory:** ≤ 300 MB, so that iOS Safari doesn't kill the tab. Textures use KTX2 everywhere.
- **Battery:** the renderer drops to idle rendering (on demand) when nothing is moving and the player
  isn't interacting.
- **Browsers:** iOS Safari 16+, Chrome Android, and desktop Chrome, Firefox, Safari and Edge.
- **PWA:** manifest, icons, fullscreen/landscape hints, precached app shell, and runtime-cached asset
  packs with an "available offline" indicator. Audio is unlocked on the first touch.

---

## 11. Audio

Audio covers ball–ball clicks (with volume and pitch scaled by impact speed), cushion thuds, pocket drops
or rattles, cue tip strikes, chalk, crowd and ambience for each venue, and an optional referee or
commentary call-outs for snooker scores. Web Audio API is used with pooled voices. The physics events
drive the sound directly.

---

## 12. Milestones

Each milestone ends with something playable or testable.

| # | Milestone | Deliverable |
|---|---|---|
| **M0** | Foundations | pnpm workspace, Vite app, TS strict, lint, Vitest, CI, PWA skeleton, Vercel project with preview and production deployments |
| **M1** | Physics core | Ball states, cue strike, ball–ball (with throw), cushions (Han/Mathavan), pocket jaws; `physics-lab` 2D harness; determinism + golden tests |
| **M2** | 3D table prototype | Three.js scene from `TableSpec`, balls with rotation, aim cam + top-down, drag-aim + slider controls, portrait/landscape. *First "feel" playtest on real phones* |
| **M3** | First complete game: 9-ball | Rules engine interface + 9-ball, ball-in-hand, HUD, local 2-player. Proves the end-to-end loop |
| **M4** | All launch games | English pool (both presets), 10-ball, snooker (incl. free ball, miss rule), per-game tables |
| **M5** | AI | Worker-based shot search, 5 difficulty levels, safety play, snooker break-building |
| **M6** | Characters & cinematics | Placeholder rigged characters, animation set, IK stance & bridge, walk-to-shot, cinematic/follow/replay cameras, pull-back stroke control mode |
| **M7** | Progression | Quick match flow polish, practice & drills, challenges, career/tour, character customiser, stats, replays (IndexedDB) |
| **M8** | Polish & release | Audio, quality tiers, performance pass on device matrix, accessibility, offline PWA hardening, onboarding tutorial |
| **M9** | Billiards expansion | English Billiards, carom table + 3-Cushion, Balkline, Russian Pyramid (+ pocket-profile tuning), more venues |
| **M10+** | National & pub variants | Chinese 8-ball, straight pool, one-pocket, cowboy pool, slosh, then further candidates (§4) |
| **Later** | Optional | Final art (commissioned or packs), online play (deterministic lockstep or server-validated shots), replay sharing |

**Biggest risks to tackle early:**
1. **Physics feel.** Realistic and enjoyable are not always the same. Tune in M1 and M2 with real-device
   playtests.
2. **Mobile aiming precision.** Prototype both control modes in M2 and M6, and test them with real
   players.
3. **Character IK at the table.** Prototype it early, even in M2, with a capsule "mannequin" to find out
   about camera occlusion and pose problems.
4. **iOS Safari memory and performance.** Test on a real iPhone from M2 onwards, not just in desktop
   emulation.

---

## 13. Open questions (to decide later)

- The final art source: commissioned, asset packs, or in-house. The pipeline in §7 works for any of them.
- Whether replay sharing needs a small backend (a Vercel function) or can use URL-encoded shot data.
- Which further variants to prioritise after the M10 list.

### Resolved

- **English pool default:** Ultimate Pool rules, with WPA, EPA and pub variants available as toggles and presets.
- **National variants:** yes. Chinese 8-ball, straight pool, one-pocket, cowboy pool, slosh and others, from M10.
- **Hosting:** Vercel.
