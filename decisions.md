# Architectural Decisions

> One entry per locked-in choice. Reverse chronological. Concise — not an ADR template.

## Format

    ## YYYY-MM-DD — <decision title>
    **Context:** Why we needed to decide.
    **Choice:** What we chose.
    **Trade-offs:** What we gave up.
    **Revisit:** Trigger that would re-open this decision (or "never").

---

## 2026-10-04 — Milestone 1 architecture recommendations

**Context:** Need to bootstrap a pure-TypeScript headless roguelike engine inside an Expo Router TypeScript client for Milestone 1.

**Choice:** Single Expo app project (not a monorepo) with top-level `src/engine`, `src/packs`, `src/ui`, and `src/app`; enforce the pure-engine boundary via ESLint `no-restricted-imports`; use Vitest with `environment: 'node'` for engine tests; hand-rolled Mulberry32 RNG for serializable save/replay state; Zod v4 for future content-pack schemas; target Expo SDK 57 / React Native 0.86 / React 19.2.3.

**Trade-offs:** A single app couples engine release cadence to Expo dependencies. A hand-rolled RNG means we own correctness. Using Vitest only for M1 means later UI tests need either `jest-expo` or `vitest-native`.

**Revisit:** If the engine needs to ship independently as a package or be consumed by non-Expo clients, move to an npm workspace / monorepo.

## 2026-10-04 — First OpenSpec change scope: Milestone 1 only

**Context:** The full plan spans ~7 stages (engine skeleton → packs → levelgen/FOV → Expo renderer → gameplay loop → second theme pack). One OpenSpec change cannot reviewably cover all of it.

**Choice:** The first change `bootstrap-engine-skeleton` covers **Milestone 1 only** (headless pure-TS engine skeleton). The full staged roadmap lives inside the proposal; each later stage becomes its own change, applied and reviewed one at a time. Stage 6 ("build the dogs pack with no engine changes") is retained as the deliberate abstraction-leak test before adding features.

**Trade-offs:** More OpenSpec change overhead per stage; the roadmap lives in a proposal doc rather than a single tracked epic.

**Revisit:** Never — staging is the operating model; adjust only the stage contents.

## 2026-10-04 — Stack override: Expo + React Native + TypeScript

**Context:** The cli-five scaffold generated `PROJECT.md`/`AGENTS.md` declaring `HTML + CSS + JS (CDN, no bundler)`, which conflicts with the user's stated Expo target.

**Choice:** Treat the boilerplate as wrong; the real stack is Expo (`~57`) + React Native (`0.86`) + React (`19.2`) + TypeScript, with Vitest for engine tests and zod (Stage 2) for packs.

**Trade-offs:** The generated docs are now partly hand-maintained; scaffold conventions no longer match a plain web SPA.

**Revisit:** If the target client moves away from Expo (e.g. web-only), which reopens the client stage only.

## 2026-10-04 — Scaffold choices for Milestone 1 (Phase 1)

**Context:** Bootstrapping the Expo app + engine tooling into a non-empty repo (OpenSpec docs already present) had to pick concrete package versions and a few config shapes.

**Choice:**
- Scaffolded manually from `expo-template-blank-typescript@57.0.28` (assets + `app.json` + `index.ts` + `App.tsx`) because `create-expo-app` dislikes a non-empty directory; pinned `expo ~57.0.26`, `react-native 0.86.3`, `react 19.2.3` (matches design.md).
- Used **TypeScript `^5.9.3`** instead of the template's `~6.0.3`, because `typescript-eslint@8.71.0` peer-supports only `typescript >=4.8.4 <6.1.0`.
- `test` script is `vitest run --passWithNoTests` so the no-tests state exits 0.
- Kept `vite-tsconfig-paths` (Vitest 5 also has a native `resolve.tsconfigPaths`, but the plugin is what design.md specifies) and `globals: false`.
- `eslint.config.js` composes `eslint-config-expo/flat` with a `src/engine/**/*.ts` override implementing the D2/D6 boundary.

**Trade-offs:** Manual scaffold means Expo config is hand-maintained vs. a future `create-expo-app` baseline; TS 5.9 will need bumping when typescript-eslint supports TS 6.

**Revisit:** When typescript-eslint ships TS 6 support, or when an Expo upgrade changes the template's pinned TS/RN versions.

## 2026-10-04 — Phase 2 engine core shapes (RNG / grid / types)

**Context:** Implementing `bootstrap-engine-skeleton` tasks 2.1–3.3 required concrete decisions on the RNG serialization surface, the grid representation, and how helpers relate to state.

**Choice:**
- **RNG state is two fields** `{ seed: number; state: number }` (`RngState`), not a single opaque blob. `seed` is provenance/replay metadata; `state` is what resume uses. `createRng(seed)` matches design D2 exactly; `rngFromState`/`rngToState` convert to/from the live `Rng`. Bounded draws are a free function `randInt(rng, min, max)` (inclusive), not a method on `Rng`, so the interface stays the three-method swap surface from D2.
- **Grid passability is a flat row-major `boolean[]`** indexed `y * width + x`, rather than nested arrays or `Map`/`Set`. Nested arrays would be JSON-clean too, but a flat array has no per-row object overhead and a single canonical index formula. `createGrid(rows: boolean[][])` is the ergonomic test/authoring constructor; it throws on ragged rows.
- **Out-of-bounds is `false`, checked before indexing** via a shared `inBounds` helper, satisfying "never reads undefined tile data".
- **`entityAt`/`entityById` are free functions over `entities: Entity[]`**, not a Map-on-state, preserving D5 (helpers live in modules, state stays plain).
- **`Entity` is an interface with an index signature** (`[key: string]: unknown`) so extra plain props (e.g. `hp`) type-check while staying open-ended for M1.

**Trade-offs:** The index signature weakens excess-property checking on entities (any key is allowed); `randInt` collapsing to `min` when `max < min` instead of throwing hides caller bugs; flat-grid indexing is duplicated knowledge if a second grid type appears.

**Revisit:** If entities need strict per-kind schemas, prefer a discriminated union over the index signature (Stage 2 zod packs). If a Map-based spatial index is needed for performance, add it as a derived cache, never on `GameState`.

## 2026-10-04 — Phase 3 command loop & event log (tasks 4.1–4.4)

**Context:** Implementing `applyCommand` required concrete decisions on the event shapes, the append-only log, occupancy semantics, and how the RNG state is threaded through a command.

**Choice:**
- **Events are free-function factories** in `events.ts` (`moved`/`blocked`/`noop`) returning plain discriminated objects, plus one `appendEvents(log, incoming)` helper. `appendEvents` returns `[...log, ...incoming]` — a new array, never mutating/reordering — so "append-only" is structural, not a convention.
- **`applyCommand(state, command, rng) -> { state, events }` is a pure function.** The M1 `Command` union has a single variant (`move`); the `default` branch widens structurally to catch unrecognized serialized types and emits `noop('unknown-command:<type>')` instead of throwing, returning a state equivalent to the input with the log appended.
- **RNG threading:** every branch writes `rng: { seed: state.rng.seed, state: rng.state() }` back into the returned state. `move` itself draws nothing (no randomness in M1), but the signature and state threading are correct so later commands can draw.
- **Occupancy semantics (M1):** any entity at the target tile blocks — no combat, no pass-through, no `solid` flag. The block check is `!inBounds || !isPassable || entityAt(...) !== undefined`, giving one `blocked` event for all three refusal reasons (spec only requires "blocked", not a reason code).
- **Missing player entity** is a `noop('no-player-entity')` rather than a throw, preserving the "every command yields ≥ 1 event" invariant.
- **`index.ts` is a pure barrel** re-exporting types + `applyCommand` + helpers + event constructors; nothing outside `src/engine` imports deeper. Verified by a test that imports only from `@engine`.

**Trade-offs:** `blocked` loses the specific refusal reason (wall vs. out-of-bounds vs. occupied): a caller wanting to distinguish must re-derive it from the world. The `default` branch's structural widening weakens compile-time exhaustiveness for future command variants. Every branch duplicates the rng-writeback snippet; a shared helper could remove it but adds indirection for three call sites.

**Revisit:** When a second command variant lands, replace the `default` noop branch with a true exhaustive `never` check (and keep the noop for deserialized unknowns at the boundary). When entities gain `solid`/combat, replace the unconditional occupant-block with per-entity resolution.

## 2026-10-04 — Stage 1 (`bootstrap-engine-skeleton`) outcome

**Context:** Milestone 1 needed to land the headless pure-TS engine and prove the determinism / framework-freedom / JSON-clean boundaries *before* any renderer or content exists, then correct the scaffolded docs to the real stack.

**Choice:** Stage 1 is complete and verified. `src/engine` ships `types.ts`, `rng.ts` (seeded Mulberry32), `grid.ts`, `events.ts`, `commands.ts`, `index.ts`, and 6 test files — **58 tests passing**, ESLint 0 errors/0 warnings, `tsc --noEmit` clean. The public surface is the `@engine` barrel only. `PROJECT.md`/`AGENTS.md` are corrected to **Expo SDK ~57.0.26 + RN 0.86.3 + React 19.2.3 + TypeScript 5.9** (Node ≥ 22.13), Vitest 5 for engine tests, ESLint 9 flat config for the boundary, zod planned for Stage 2. `STATE.md` records completion and points next at `content-packs-v1`. No engine source or tests were changed in the docs phase.

**Trade-offs:** The engine is exercised by exactly one command (`move`) and a synthetic in-test fixture, so its abstraction seams are only lightly used — the deliberate Stage 6 "dogs pack with no engine changes" test is what will really stress the content boundary. Docs are now hand-maintained rather than scaffold-generated.

**Revisit:** Stage 2 (`content-packs-v1`) is the first real test of the content seam; if it forces engine changes, treat that as a boundary defect. Revisit the RNG/entity shapes if zod packs need a discriminated entity union (see the Phase 2 entry).

## 2026-10-04 — Engine boundary hardening for malformed serialized input

**Context:** Review of `bootstrap-engine-skeleton` found that `applyCommand`'s unknown-command branch (`src/engine/commands.ts`) reads `command.type` unguarded, so a `null`/`undefined`/non-object command (e.g. from a corrupt or hand-edited serialized command log) throws `TypeError` instead of being handled as invalid. The code comment claims the branch exists precisely "for unrecognized types that arrive from serialized logs," but it only handles well-formed objects. Because save/replay is a core M1 promise (state + command log), a malformed log must not crash the loop.

**Choice:** Treat engine entry points as boundaries for external data. `applyCommand` must reject non-object / missing-`type` commands with a `noop` event (and unchanged world state), never throw; likewise `randInt`/grid helpers already tolerate out-of-domain inputs by design.

**Trade-offs:** Adds a runtime shape guard at the command boundary; slight overlap with TypeScript's compile-time `Command` type, which cannot protect against deserialized input.

**Revisit:** When the command union grows past one variant, add a schema (zod, Stage 2) at the deserialization seam and keep the boundary guard as defense-in-depth. Trigger to re-open: any new command whose parameters are read before a shape check.


