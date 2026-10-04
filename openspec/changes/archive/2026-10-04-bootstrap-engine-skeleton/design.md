# Design

## Context

See `proposal.md` → Why. This is a greenfield repo (no engine code yet). OpenSpec is initialized with the default `spec-driven` schema and an empty `openspec/specs/`. The generated `PROJECT.md`/`AGENTS.md` carry cli-five boilerplate claiming `HTML + CSS + JS (CDN)`, which contradicts the target stack and is corrected here.

Target runtime (verified against current releases): `expo@~57.0.0` / `expo-router@~57.0.24` on React Native `0.86` + React `19.2.3`, Node ≥ `22.13.x`. New Architecture is default and non-disableable — irrelevant to a headless M1 engine but noted so the UI stages account for it.

The binding constraint is **boundary integrity**: the engine must be provably framework-free and deterministic *before* any renderer or content exists, because both are impossible to retrofit cheaply. This design therefore optimizes for a small, testable, dependency-light core over feature coverage.

## Goals / Non-Goals

**Goals:**
- One authoritative way to advance the game: `applyCommand(state, command, rng) -> { state, events }`.
- Determinism as an invariant enforced by structure (injected RNG) and verified by seeded tests.
- State that is JSON-serializable with no exceptions, enabling save/replay/undo later.
- A minimal 2D grid + plain-data entity model that already supports a `move` command end-to-end.
- A mechanically enforced engine purity boundary that fails CI on violations.

**Non-Goals:**
- No UI, rendering, input, or Expo runtime wiring in this change.
- No content packs, zod schemas, level generation, FOV, AI, combat, items, or save/load I/O.
- No ECS, no scripting engine, no event bus, no abstractions built ahead of a second use case.

## Decisions

### D1 — Layout: single Expo app with an enforced `src/engine` folder (not a monorepo)
Use one repo with a strict module boundary rather than npm workspaces. Metro's support for workspaces is a recurring source of resolution/haste-map friction that buys nothing at this size. The boundary is enforced by lint + convention, and `src/engine` can be extracted into a standalone package later if it earns it.

Chosen tree (adapts to the Expo scaffold once created):

```
crawl/
  app.json / babel.config.js / metro.config.js   # Expo app config
  src/
    app/                    # expo-router file-based routes (Stage 4+, empty for now)
    engine/                 # PURE TypeScript — no react/react-native/expo, no Math.random/Date.now
      types.ts              # GameState, Command, GameEvent, Entity, Position, Grid, RngState
      rng.ts                # seeded PRNG (state travels in GameState)
      grid.ts               # grid + passability + occupancy helpers
      commands.ts           # applyCommand: move -> moved/blocked/noop
      events.ts             # event constructors + append-only log helper
      index.ts              # public engine surface (types + applyCommand + helpers)
      __tests__/
        rng.test.ts
        command-loop.test.ts
        spatial-grid.test.ts
    packs/                  # content packs (Stage 2+, empty for now)
    ui/                     # RN components (Stage 4+, empty for now)
  openspec/
  package.json
  tsconfig.json             # extends expo/tsconfig.base; paths @/* and @engine/*
  vitest.config.ts
  eslint.config.js
```

`src/app` is the officially supported Expo Router location (SDK 55+), so no custom router `root` config is needed.

*Alternatives considered:* npm workspaces/pnpm monorepo (rejected: premature tooling tax); putting the engine in its own repo (rejected: cross-repo iteration cost at this stage).

### D2 — Determinism via a seeded PRNG whose state lives in `GameState`
The RNG is not a hidden global; it is a small stateful generator whose internal state is a field on `GameState` (e.g. `rng: { seed, state }`) and whose draws go through a pure transition `draw(state) -> { value, nextState }` (or a mutable `Rng` object created from state and written back). No `Math.random`, no `Date.now`, no `crypto`. Save/load and replay then fall out for free: state + command log reproduces a session exactly.

Two candidate shapes, both fine for M1:
- **Hand-rolled `mulberry32`/`xoshiro128**`** driven by a numeric state. Pros: zero dependency, trivially serializable as a 32/128-bit integer, tiny. Cons: you own the algorithm and its statistical quality.
- **`seedrandom` with an explicit `state()`/`{state:…}` option.** Pros: battle-tested, well-known. Cons: extra dependency; its serialization surface is an opaque object that must be understood to keep state JSON-clean.

**Choice:** hand-rolled **Mulberry32**, dependency-free, with an explicit `uint32` state field. Its entire state is a single integer, which makes save/load trivial and the generator fully transparent — exactly the property that matters most here. Expose it behind a tiny interface (`next(): number`, `state(): number`, `setState(s: number): void`) so the algorithm can be swapped without touching callers, and persist `{ seed, rngState }` to resume the exact sequence.

```ts
export interface Rng { next(): number; state(): number; setState(s: number): void; }

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() { return s >>> 0; },
    setState(v) { s = v >>> 0; },
  };
}
```

`seedrandom@3.0.5` was the alternative; rejected because its saved state is a heavier opaque object, overkill for a deterministic loop and harder to keep JSON-clean.

### D3 — Command-in / event-out with immutable state
`applyCommand` returns a **new** state object and an `events` array; the input state is treated as frozen. Events are discriminated plain objects (`{ type: 'moved', entityId, from, to }`, `{ type: 'blocked', entityId, direction }`, `{ type: 'noop', reason }`). Events are the sole description of "what happened", which later drives UI animation and is the primary debug/test surface.

*Alternatives considered:* mutate-in-place state with a return value (rejected: breaks replay/undo and encourages UI coupling); an event bus/pub-sub (rejected: needless indirection; a returned array is enough).

### D4 — Plain-data entities, no ECS, no behavior objects
An entity is `{ id, kind, pos: {x,y}, ...plainProps }`. There is no behavior or component system in M1 — a `move` command operates directly on grid + occupancy. This deliberately avoids the ECS abstraction until Stage 5 (AI) proves it's needed; a data-bag model is sufficient and keeps state trivially serializable.

### D5 — State is strictly JSON-clean
No `Map`/`Set`/class instances/functions/`undefined`-as-meaningful-values inside `GameState`. Any collection is an array or a plain object keyed by string id; a lookup helper lives in `grid.ts` next to the array it operates on. This makes `JSON.stringify`/`parse` a lossless save/replay primitive and removes the need for incremental serialization in M1. A Vitest assertion that `structuredClone(state)`/round-trip equals state guards this invariant.

### D6 — Purity enforced by ESLint (flat config) on `src/engine/**`
A boundary rule fails lint if engine files import `react`, `react-native`, or `expo*`. This is the mechanism that keeps D2/D5 true over time. ESLint 9 flat config is the default for Expo SDK 53+, extending `eslint-config-expo/flat`, with a scoped override:

```js
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'coverage/*', 'node_modules/*']),
  expoConfig,
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react/*'], message: 'src/engine must remain framework-free; do not import React' },
          { group: ['react-native', 'react-native/*'], message: 'src/engine must remain framework-free; do not import React Native' },
          { group: ['expo*', '@expo/**'], message: 'src/engine must remain framework-free; do not import Expo packages' },
        ],
      }],
    },
  },
]);
```

A companion rule bans `Math.random` / `Date.now` / `Date` usage inside `src/engine` so determinism (D2) cannot be reintroduced via a global.

### D7 — Test-first determinism with Vitest and fixed seeds
Every engine test constructs state from an explicit seed and asserts on the event stream. Tests cover: same-seed reproducibility, seed divergence, serialization round-trip + resumed replay, and movement resolution (passable / non-passable / out-of-bounds / occupied). Vitest is the single test runner for the engine; the app's own tooling is unaffected in M1 (no app code yet).

Config (Metro resolves `tsconfig` paths automatically, Vitest does **not** — hence `vite-tsconfig-paths`):

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { globals: false, environment: 'node', include: ['src/engine/**/*.test.ts'] },
});
```

Engine tests run under `environment: 'node'` (never `jsdom`). Keep Vitest globals and any future `jest-expo` globals separate; if `jest-expo` is kept for UI tests later, drop `"jest"` from `tsconfig` `types`.

### D8 — No pack/schema work in M1, but leave the seam
`src/packs/` exists as an empty boundary and is documented as Stage 2. The engine references content only through ids/kinds that will later resolve against a pack; M1 hardcodes a single test grid and player *only inside tests*, never as engine-embedded content. Stage 2 targets **`zod@^4.6.0`** (lockstep `@zod/mini` if engine bundle size later matters).

## Risks / Trade-offs

- **Premature structure**: adding lint boundaries and a folder split before features may feel heavy. → Mitigation: these are a handful of files and one lint rule; the cost is bounded and directly protects the hardest-to-reverse property.
- **Hand-rolled PRNG quality**: a naive generator could have poor statistical properties or short cycles. → Mitigation: choose a known-good small algorithm (mulberry32-class), keep it isolated behind an interface, and add a basic distribution/cycle sanity test; swap later if needed.
- **`structuredClone`/JSON round-trip hides non-serializable values**: nested class instances could slip in unnoticed until serialization. → Mitigation: the round-trip equality test plus a lint rule banning class declarations and `Date`/`Math.random` in `src/engine`.
- **Boundary erosion when the UI arrives (Stage 4)**: the renderer may be tempted to read/mutate engine state directly. → Mitigation: keep the public surface (`src/engine/index.ts`) narrow and document the "events only" contract; enforce with the same lint rule.
- **Over-scoping Stage 1**: adding movement now risks pulling in AI/combat. → Mitigation: `move` exists solely to exercise the full command→event→state→serialize loop; no occupant semantics beyond "blocked".

## Migration Plan

Greenfield — no migration or rollback complexity. Bootstrap order: create the Expo TypeScript app scaffold, add the engine folder + tooling, write failing seeded tests, implement `rng`/`grid`/`commands` until green, then correct `PROJECT.md`/`AGENTS.md`. All work is additive and reversible via git.

## Open Questions

None that block M1. Stage 2 will pin the exact `zod` minor, and the UI stages (4+) will pin Expo/RN/testing-library versions against the then-current SDK.
