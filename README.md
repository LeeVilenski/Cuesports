# Cuesports

A mobile-first 3D browser game covering several cue sports, with realistic ball physics. The launch games are
Snooker, English Pool, 9-ball and 10-ball. English Billiards, 3-Cushion, Balkline and Russian Pyramid come later.

It is built with TypeScript, Three.js and a custom deterministic physics engine, and ships as an installable offline PWA.

See [docs/PLAN.md](docs/PLAN.md) for the full project plan and [docs/physics.md](docs/physics.md) for how the
physics engine works.

## Status

- **M0 Foundations:** done. pnpm workspace, strict TypeScript, ESLint, Prettier, Vitest, GitHub Actions CI,
  PWA skeleton, `vercel.json`. The Vercel project itself still has to be connected in the Vercel dashboard.
- **M1 Physics core:** done, ready for tuning. Deterministic engine, `physics-lab` harness, golden tests.
- **M2 3D table prototype:** ready for phone playtesting. Three.js table built from `TableSpec`, rotating balls,
  aim / top-down / free cameras, drag-to-aim with a pull-down power bar, spin and elevation, portrait and
  landscape.
- **M3 First complete game (9-ball):** playable. A `rules` package with a general ruleset interface and WPA
  9-ball (legal break, push out, ball in hand, three-foul rule, spotting the 9, golden break), a local
  two-player match (race to N, alternate or winner breaks), scoreboard, foul messages and ball-in-hand
  placement.
- **M4 All launch games:** playable. 10-ball (WPA, called shots), snooker (WPBSA, with free ball and the
  miss rule) and English pool (International / Ultimate Pool by default, or WEPF / EPA) as two-player
  matches. Snooker and English pool pockets are tighter and pace-sensitive.
- **M5 AI:** play against the computer at five levels (Beginner to Pro) in every game. Shot search with the
  real physics and rules, run in a Web Worker. See [docs/ai.md](docs/ai.md).
- **M6 Characters & cinematics:** first pass. Procedural players (no assets: eight fictional presets with
  natural proportions, faces, hair styles, casual pool clothes or snooker waistcoats) with an IK
  stance solved for every shot: bridge hand on the cloth or rail (or a rest when out of reach), chin over
  the cue, grip hand following the stroke, feet outside the table. They walk round the table to each shot,
  stay down through the follow-through, and the opponent sits in a chair. Shot cameras: cinematic (follow,
  then a low cut behind the pocket for each pot; also used for replays), follow, overview or stay. A
  pull-back stroke mode. Still to come: rigged glTF characters and a proper animation set (chalking,
  reactions), and walking in from the chair while the AI thinks.

- **Venues:** the table now stands in a room instead of the dark. Eleven procedural rooms (no assets): a pub
  (a different one each time in practice: name, colours, darts or a fire or a jukebox), a pool club with its other
  tables, a sports and social club, a billiard café, a sports hall, a grand billiard hall, a manor house library,
  an exhibition centre, a theatre with steep seats close round the table, a Victorian palace under a glass vault,
  and a full arena. Each career venue plays in its own room; the tours go from the sports hall (Challenge Tour,
  Q-School) to the exhibition centre and the manor (ranking events), then the palace, the arena and the theatre
  (majors; the Tour Finals in the arena). Settings has the room for practice and friendly matches. Lighting is
  baked into vertex colours and each room is merged into a few meshes, so even a full arena is cheap on a phone;
  anything hanging over the table hides when the camera rises past it.

## Playing the prototype

- **Aim:** drag sideways on the table. Slow drags turn the aim much more finely than fast ones. The strip along
  the bottom is a fine-aim wheel. In the top-down view, drag towards where you want to hit.
- **Shoot:** pull the power bar on the right down and let go. Drag it back to the top to cancel. With the
  Pull back stroke (Settings), pull down to draw the cue back, then push up through the start: the faster
  the push, the harder the shot (letting go cancels).
- **Player and shot camera:** Settings has a switch for the player at the table (hidden in the aim view
  while aiming) and the camera during shots (Cinematic, Follow, Overview or Stay).
- **Spin and elevation:** tap the small cue ball in the corner.
- **Camera:** Aim, Top and Free buttons. Pinch or scroll to zoom; drag two fingers up or down to tilt the aim cam.
- **9-ball match:** the start screen (or the menu's New 9-ball match) sets up names, race length, who breaks
  and the three-foul rule. With ball in hand, drag the cue ball (behind the head string on the break). After
  a legal break the next shooter can tap Push out; the opponent then chooses to play or pass it back.
- **Practice tools:** Move cue ball, Replay and Undo. The menu's Practice list has 9-ball, 8-ball, 10-ball,
  English pool, snooker and a two-ball practice table.
- **Keyboard:** ← → aim (Shift for bigger steps), ↑ ↓ tilt, Space shoots at the last power, 1/2/3 cameras.

## Getting started

Requires Node 22+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm lab          # physics lab on http://localhost:5173
pnpm dev          # the 3D game prototype
pnpm test         # unit, scenario and golden tests
pnpm e2e          # Playwright smoke tests (landscape and phone portrait)
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build        # builds apps/web/dist, with the lab at /lab/
```

If you change the physics on purpose, regenerate the golden files with `pnpm golden:update` and review the
diff in `packages/physics/src/__golden__/shots.json`.

## Layout

```
apps/web/            game app (Vite, PWA): src/render (Three.js), src/game (shot flow, worker), src/ui (HUD)
packages/shared/     math, deterministic trig/exp, seeded RNG, table/ball specs and presets
packages/physics/    simulation engine and tests
packages/ai/         AI opponents: shot search over physics and rules, skill levels
packages/rules/      rulesets (9-ball so far) judged from the physics event timeline, with scenario tests
tools/physics-lab/   2D top-down harness for tuning the physics
```

## Deploying to Vercel

Import the repository in Vercel and keep the root directory as the repository root. `vercel.json` sets the
install and build commands, the output directory (`apps/web/dist`) and the cache headers. Every branch gets a
preview URL; open `/lab/` on it to try the physics on a phone.
