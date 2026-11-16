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

## Getting started

Requires Node 22+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm lab          # physics lab on http://localhost:5173
pnpm dev          # the game app (currently a landing page with a live physics demo)
pnpm test         # unit, scenario and golden tests
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build        # builds apps/web/dist, with the lab at /lab/
```

If you change the physics on purpose, regenerate the golden files with `pnpm golden:update` and review the
diff in `packages/physics/src/__golden__/shots.json`.

## Layout

```
apps/web/            game app (Vite, PWA)
packages/shared/     math, deterministic trig/exp, seeded RNG, table/ball specs and presets
packages/physics/    simulation engine and tests
tools/physics-lab/   2D top-down harness for tuning the physics
```

## Deploying to Vercel

Import the repository in Vercel and keep the root directory as the repository root. `vercel.json` sets the
install and build commands, the output directory (`apps/web/dist`) and the cache headers. Every branch gets a
preview URL; open `/lab/` on it to try the physics on a phone.
