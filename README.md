# crawl

A framework-free, deterministic TypeScript roguelike **engine** with an Expo + React Native client. Milestone 1 is a **headless** engine skeleton — no UI yet.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Verify the toolchain (no device required)
npm test          # Vitest engine tests (RNG + grid + command loop + serialization + seeded e2e)
npm run typecheck # tsc --noEmit
npm run lint      # ESLint, incl. the src/engine purity boundary

# 3. Run the app (requires a device/simulator — not available in CI)
npm start         # expo start
```

Node ≥ 22.13 is required (Node 24.x tested).

## Usage

Milestone 1 is a pure engine; there is no runnable gameplay UI yet. Consume it **only** through the public surface at `@engine` (i.e. `src/engine/index.ts`); nothing outside `src/engine` should import deeper modules.

```ts
import { applyCommand, createGrid, createRng, rngFromState } from '@engine';
import type { Command, GameState } from '@engine';

const state: GameState = {
  grid: createGrid([[true, true], [true, false]]),
  entities: [{ id: 'player', kind: 'player', pos: { x: 0, y: 0 } }],
  playerId: 'player',
  rng: { seed: 7, state: createRng(7).state() },
  events: [],
};

const command: Command = { type: 'move', direction: 'east' };
const { state: next, events } = applyCommand(state, command, rngFromState(state.rng));
// next is a NEW state; `state` is untouched. `events` is always ≥ 1 event.
```

The loop is **command-in / event-out** (`applyCommand(state, command, rng) -> { state, events }`):
- the input state is never mutated; a fresh state object is returned,
- every command emits at least one event (`moved` / `blocked` / `noop`),
- the emitted events are appended to `state.events` in order (append-only),
- unknown command types are reported as invalid via a `noop` event — never thrown.

The engine is **pure**: it must never import `react`/`react-native`/`expo`, and must never use `Math.random`/`Date.now`/`Date`. Determinism comes from an injected seeded RNG whose state travels inside `GameState` (`{ seed, state }`). ESLint fails CI on any violation under `src/engine/**`. The app's placeholder entry (`App.tsx`) merely proves Expo boots.

> Scope: this milestone ships the Expo/TS scaffold + tooling and the engine core — seeded RNG, 2D grid + occupancy, JSON-clean types, and the command loop with `move` resolution. Rendering, level generation, AI, and content packs are later stages.

## Layout

```
crawl/
  App.tsx / index.ts / app.json   # Expo app entry (placeholder for M1)
  assets/                          # Expo icons/splash
  src/
    app/    # Expo Router routes (Stage 4+, empty)
    engine/ # PURE TypeScript engine — no framework imports
      types.ts     # GameState, Command, GameEvent, Entity, Position, Grid
      rng.ts       # seeded Mulberry32 + JSON-clean RngState helpers
      grid.ts      # grid + passability + occupancy helpers
      events.ts    # event constructors + append-only log helper
      commands.ts  # applyCommand: move -> moved/blocked/noop
      index.ts     # public surface (@engine) — import here, not deeper
      __tests__/
    packs/  # content packs (Stage 2+, empty)
    ui/     # React Native components (Stage 4+, empty)
  openspec/  # change proposals & specs
```

## Tech stack

- **Expo SDK** ~57.0.26 (expo-router-capable; New Architecture)
- **React Native** 0.86.3 · **React** 19.2.3
- **TypeScript** 5.9 (strict), extends `expo/tsconfig.base`
- **Vitest** 5 (`environment: 'node'`) + `vite-tsconfig-paths`
- **ESLint** 9 flat config (`eslint-config-expo/flat` + `typescript-eslint`)
- **Node** ≥ 22.13
