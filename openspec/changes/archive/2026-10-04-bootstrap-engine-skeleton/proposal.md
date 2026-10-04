# Proposal

## Why

`crawl` is a greenfield roguelike dungeon crawler whose long-term value is an **extensible game engine**, not any single game. The engine must be deterministic (seeded), headless (framework-free), and content-agnostic so that themes — fantasy (DCSS-like), sci-fi, or a comical "family dog" setting — are swappable **data packs** rather than engine forks.

Every one of those properties is a boundary decision that is cheap to make now and expensive to retrofit. This change establishes the foundation (Milestone 1): a pure-TypeScript engine that turns commands into events over serializable state, verified by seeded tests. It intentionally ships **no UI**, so the boundary is proven before a renderer can blur it.

## What Changes

- **Introduce `src/engine`** as a pure-TypeScript, framework-free module: no `react`/`react-native`/`expo*` imports, no `Math.random`, no `Date.now`.
- **Deterministic RNG**: a seeded pseudo-random generator whose state is captured in game state and injected into every stochastic operation. Same seed + same command sequence ⇒ identical outcome.
- **Command-in / event-out API**: `applyCommand(state, command, rng) -> { state, events }`. The caller never mutates state; results are described as events (e.g. `moved`, `blocked`, `noop`) that a future renderer animates.
- **JSON-serializable state**: state contains only plain data (no classes, functions, `Map`, or `Set`), so save/load, replay, and undo reduce to serialization plus the command log.
- **2D spatial model**: a grid of tiles, plain-data entities (an entity is `{ id, kind, pos, ...data }` — not an ECS), and a player entity. A `move` command resolves against the grid to `moved`/`blocked`/`noop` events.
- **Event log**: an append-only, serializable list of emitted events that doubles as the test and debugging surface.
- **Tooling**: Vitest for seeded unit tests; ESLint rule that fails on forbidden imports inside `src/engine`; TypeScript project setup.
- **Stack alignment**: project docs (`PROJECT.md`, `AGENTS.md`) are corrected from the generated `HTML + CSS + JS (CDN)` boilerplate to **Expo + React Native + TypeScript**.

**Not in this change** (later milestones): content packs / zod schemas, level generation, FOV, rendering, monster AI, combat, items, stairs, permadeath UI, save/load wiring, a second theme pack.

## Capabilities

### New Capabilities
- `engine/deterministic-rng`: A seeded, injectable random source whose state travels with game state, giving reproducible outcomes for a fixed seed and command sequence.
- `engine/command-loop`: The `applyCommand(state, command, rng) -> { state, events }` contract, JSON-serializable state, and the emitted event log.
- `engine/spatial-grid`: The 2D grid, plain-data entity model, and movement resolution (`move` command → `moved` / `blocked` events).

### Modified Capabilities
- _(none — no specs exist yet; this change introduces the first capabilities)_

## Impact

- **New code**: `src/engine/**` (types, RNG, state, command/event handling, grid), plus `src/engine/__tests__/**` and `src/engine/index.ts` public surface.
- **New config**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.*` (engine boundary rule), `.gitignore` updates.
- **Doc updates**: `PROJECT.md`, `AGENTS.md` stack + goals; `STATE.md`; `decisions.md`.
- **Dependencies**: TypeScript, Vitest, ESLint only. Expo/React Native/Zustand/zod/Skia are introduced in later milestones, not this one.
- **No breaking changes** (greenfield). No runtime/network/storage impact.

## Staged Roadmap

This change is **Stage 1**. Each later stage becomes its own OpenSpec change, implemented and reviewed one at a time. The ordering is deliberate: the second theme pack (Stage 6) is scheduled **before** adding more engine features, so any leak in the theme boundary surfaces while the code is still small.

| Stage | Change (planned) | Scope | Exit criterion |
|---|---|---|---|
| **1** | `bootstrap-engine-skeleton` *(this change)* | Pure-TS grid, entities, seeded RNG, `applyCommand→events`, event log, Vitest | Seeded engine test moves/blocks on a fixed grid; boundary lint passes |
| 2 | `content-packs-v1` | Pack loader + zod schema; tiny fantasy pack (2 classes, 3 monsters, 5 items); strings/glyphs as data | Engine loads a validated pack with zero hardcoded content |
| 3 | `levelgen-and-fov` | Pure `(seed, depth, pack) → Level` via rooms-and-corridors/BSP; recursive-shadowcasting FOV | Headless seeded level + FOV tests |
| 4 | `expo-glyph-renderer` | Expo Router app shell, glyph/ASCII grid renderer, tap-to-travel (A*) input mapping | Playable on device with ASCII tiles |
| 5 | `core-gameplay-loop` | Monster AI (named behavior registry), melee combat, items, stairs, permadeath, save/load | Full delve loop playable headless + on device |
| 6 | `second-theme-pack` | Build the "dogs" pack with **no engine changes** | Pack swap works; any needed engine change is treated as an abstraction-leak fix |
| 7+ | *(later)* | Tileset via `@shopify/react-native-skia`, more themes, deeper mechanics | — |
