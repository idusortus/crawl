# Tasks

## 1. Scaffold & tooling

- [x] 1.1 Create the Expo + TypeScript project scaffold (Blank/TypeScript, expo-router-capable) at the repo root and verify `npx expo start` boots; leave `app/`/`src/ui` empty for now
- [x] 1.2 Add engine dev dependencies (TypeScript, Vitest, ESLint flat-config, typescript-eslint) and a `test` script; verify `npm test` runs (0 tests) without error
- [x] 1.3 Add `tsconfig.json` path aliases (`@engine/*` → `src/engine/*`) and matching `vitest.config.ts` alias config; verify a trivial aliased import resolves under Vitest
- [x] 1.4 Add `eslint.config.js` boundary rule banning `react`, `react-native`, and `expo*` imports plus `Math.random`/`Date.now` under `src/engine/**`; verify lint fails on a temporary violating file, then passes once removed
- [x] 1.5 Create `src/engine/`, `src/packs/`, and `src/ui/` directories with the planned file stubs (`types.ts`, `rng.ts`, `grid.ts`, `commands.ts`, `events.ts`, `index.ts`, `__tests__/`)

## 2. Deterministic RNG

- [x] 2.1 Implement the seeded PRNG in `src/engine/rng.ts` with an explicit integer state and a bounded inclusive-range integer draw; verify `rng.test.ts` asserts in-range values and exact seed replay
- [x] 2.2 Make the RNG state part of `GameState` and ensure draws advance it through the command loop only; verify a test serializes state and resumes with identical subsequent output
- [x] 2.3 Add a guard test proving no ambient randomness/time is used (e.g. lint rule + a test that spies/asserts determinism across two identical runs); verify `rng.test.ts` covers same-seed equality and different-seed divergence

## 3. Spatial grid & entities

- [x] 3.1 Define `Position`, `Entity`, `Grid`, `GameState`, `Command`, and `GameEvent` types in `src/engine/types.ts` as strictly JSON-clean plain data
- [x] 3.2 Implement `src/engine/grid.ts` with width/height, per-tile passability, out-of-bounds handling (report non-passable, never read undefined), and occupancy lookup; verify `spatial-grid.test.ts` covers in-bounds, out-of-bounds, and occupancy queries
- [x] 3.3 Add a serialization round-trip test asserting `JSON.parse(JSON.stringify(state))` is structurally equal to and behaves like the original (guards the JSON-clean invariant)

## 4. Command loop & events

- [x] 4.1 Implement `src/engine/events.ts` event constructors and the append-only event-log helper (never removed/reordered); verify tests confirm ordering across multiple commands
- [x] 4.2 Implement `src/engine/commands.ts` `applyCommand(state, command, rng)` returning new state + events without mutating input; verify unknown commands yield an invalid/noop outcome with state equivalent to input
- [x] 4.3 Implement the `move` command resolution: `moved` on success, `blocked` on non-passable/out-of-bounds/occupied, and guarantee every command yields ≥1 event (no-op otherwise); verify `command-loop.test.ts` and `spatial-grid.test.ts` scenario tests pass
- [x] 4.4 Fix the engine public surface in `src/engine/index.ts` (types + `applyCommand` + helpers only) and verify nothing outside `src/engine` needs to reach deeper

## 5. Verification & docs

- [x] 5.1 Add an end-to-end seeded test: build a grid, apply a fixed command sequence, and assert the full event stream and final state match a replayed run from the same seed; verify it passes under `npm test`
- [x] 5.2 Run the full engine test suite and lint, and confirm zero boundary violations under `src/engine`
- [x] 5.3 Correct `PROJECT.md` and `AGENTS.md` to the Expo + React Native + TypeScript stack and the engine goals; verify the stack sections no longer mention CDN/HTML/CSS/JS
- [x] 5.4 Update `STATE.md`, append to `decisions.md`, and log the session in `agent-diary.md`/`histories/orchestrator.md`; verify each file reflects Stage 1 completion and the new stack
