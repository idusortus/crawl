# Tasks

## 1. Level & state model

- [x] 1.1 Extend `src/engine/types.ts` with the pinned level model: `GameState` gains `level: { depth: number; spawn: Position }` and `explored: boolean[]` (flat, length `width * height`, row-major, same indexing as `grid.passable`); `state.grid` stays unchanged (design D1). Keep everything JSON-clean. Then update the shared `makeState`/`createInitialState` helpers AND the inline `GameState` literals so `tsc` compiles again — the affected files are `command-loop.test.ts`, `e2e-seeded.test.ts`, `item-use.test.ts`, `index-surface.test.ts`, `pack-loader.test.ts`, and `serialization.test.ts`. Verify `npx tsc --noEmit` and `npm test` pass.
- [x] 1.2 Add small grid helpers if needed for flat-index math / coordinate iteration shared by levelgen and FOV (e.g. `indexOf(grid,pos)`, `coordOf(grid,index)`); verify they are pure and covered by a test
- [x] 1.3 Verify the engine still passes `npm run lint`, `npx eslint src/engine --no-warn-ignored`, and `npx tsc --noEmit` after the type change

## 2. Field of view

- [x] 2.1 Implement `src/engine/fov.ts` `computeFov(grid, origin, radius) -> boolean[]` via recursive shadowcasting over the 8 octants (pure; marks the origin visible; blocks behind walls; bounded by radius; does not mutate the grid). Use **Chebyshev distance** for the radius bound and export a named default constant `DEFAULT_SIGHT_RADIUS = 8`. An out-of-bounds origin returns all-false without throwing (per the field-of-view spec). Verify with a hand-built-grid test asserting open-area visibility, wall occlusion, origin-visible, radius bound, and the out-of-bounds case
- [x] 2.2 Add FOV determinism/purity tests: two computations match; the grid input is unchanged; out-of-bounds origin is handled safely (returns no visible tiles rather than throwing)
- [x] 2.3 Add an explored-union helper (e.g. `exploreInto(explored, visible) -> boolean[]`) that ORs visibility into the explored mask immutably; verify it only grows and never removes tiles
- [x] 2.4 Verify `npm test` passes with the FOV suite and `npm run lint` is clean

## 3. Level generation (BSP + registry)

- [x] 3.1 Implement `src/engine/level.ts` with the `LevelGenerator` type, a BSP rooms-and-corridors generator (recursive partition → room per leaf → connect siblings), drawing all randomness from the injected `Rng`; produce a bounded grid with non-passable outer boundary and a spawn point on a floor tile
- [x] 3.2 Add `generateLevel(input)` with a **generator registry** keyed by named id (default `'bsp'`), reporting unknown ids explicitly and never silently falling back wrongly; verify a known id generates, an unknown id is reported, and the default is used when none is named
- [x] 3.3 Add `src/engine/__tests__/level.test.ts`: same seed+depth ⇒ identical level; different seeds diverge; **connectivity** — flood-fill from spawn reaches every passable tile (test across many seeds); dimensions explicit + boundary non-passable; spawn on a passable in-bounds tile; depth recorded; registry selection/unknown/default
- [x] 3.4 Verify `npm test` passes with the level suite, and `npx tsc --noEmit` / `npm run lint` are clean

## 4. `descend` command & level wiring

- [x] 4.1 Extend `src/engine/types.ts` + `src/engine/events.ts`: add a `DescendCommand` (`{ type: 'descend' }`) to the `Command` union and a `LevelChangedEvent` (`{ type: 'level-changed'; depth: number }`) to the `GameEvent` union, plus a `levelChanged(depth)` constructor; keep unions additive and JSON-clean
- [x] 4.2 Implement `descend` resolution in `src/engine/commands.ts` per design D6: generate a level at `depth + 1` from the injected RNG, place the player at the new spawn, reset `explored` to the spawn FOV, emit `level-changed`, thread RNG state back, and never mutate the input. Dispatch `descend` in **BOTH** `applyCommand` and `applyCommandWithPack` as an explicit `case` (never left to the `default` noop — a consumer using the pack-aware entry point for `use-item` must still be able to descend). Generalize `commit` to optionally replace `grid`/`level`/`explored` in addition to `entities` (or construct the returned state directly). Guard parameters per D7 and keep unknown/malformed → `noop`
- [x] 4.3 Wire explored-on-move: after a successful `move`, OR the new position's FOV into `explored`; ensure blocked moves leave the level/explored **unchanged** (including `explored`) apart from event logging
- [x] 4.4 Add tests (`descend.test.ts` / extend `command-loop.test.ts`): descend generates depth+1, player at spawn, `level-changed` emitted, deterministic under same-seed replay, input unmutated, explored reset (no cross-level leak), new level immediately playable; explored grows on move and persists; JSON round-trip of a post-descend state behaves identically; unknown command still degrades to noop
- [x] 4.5 Verify `npm test` passes, `npx tsc --noEmit` clean, and `npm run lint` + `npx eslint src/engine --no-warn-ignored` clean

## 5. Public surface, verification & docs

- [x] 5.1 Export the new surface from `src/engine/index.ts`: `computeFov`, `DEFAULT_SIGHT_RADIUS`, the explored-union helper, `generateLevel`, and the set of registered generator ids, plus `Level`/`LevelGenerator` types, `DescendCommand`/`LevelChangedEvent`, and `levelChanged`. Keep the mutable generator registry object **private** to `level.ts` (export only `generateLevel` and the id list, so consumers cannot mutate engine internals). Extend `src/engine/__tests__/index-surface.test.ts` to run a generated level + FOV + descend flow importing only `@engine`
- [x] 5.2 Run the full suite + lint + engine-scoped lint + `tsc --noEmit` and confirm all green with zero boundary violations under `src/engine`
- [x] 5.3 Update `STATE.md`, append a `decisions.md` entry (BSP + registry seam; FOV derived vs. explored stored; level/explored state shape), log the session in `agent-diary.md`/`histories/*`, and update the roadmap in `PROJECT.md`/`AGENTS.md` (Stage 3 done, Stage 4 next; note the APK pipeline change is queued after Stage 3)
- [x] 5.4 Update `openspec/config.yaml` project context only if warranted; verify `openspec validate levelgen-and-fov --strict` passes
