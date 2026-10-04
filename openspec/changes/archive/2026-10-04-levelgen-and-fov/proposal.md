# Proposal

## Why

The engine can move on a hand-built grid and consume validated content, but it cannot **make a world**. Every level so far is a test fixture, there is no notion of depth or progression, and nothing models what the player can actually see — so the game is not yet a *dungeon*. This stage adds deterministic, seeded level generation and field of view, wiring a generated level into `GameState` and giving the player a way to descend. Like Stage 1's boundary and Stage 2's content seam, both must be **pure functions of the seed** so a run stays reproducible and testable.

## What Changes

- **Deterministic level generation.** A pure `generateLevel({ id?, rng, width, height, depth }) -> Level` produces a connected dungeon via **BSP rooms-and-corridors** (recursive partition → a room per leaf → corridors carved between siblings). Same seed + depth ⇒ identical level. Generation takes no content pack in v1 (design D3).
- **Generator registry seam.** Generators are selected by a named id from a registry (mirroring the effect registry), so cellular-automata/cave generators can be added later **without changing the engine or `GameState`**.
- **Level model in `GameState`.** State carries the current level (a `Grid` plus level metadata such as depth and the player's spawn point) and a per-level **explored** mask (tiles ever seen). Explored data is JSON-clean and serializes with the save.
- **Recursive-shadowcasting FOV.** A pure `computeFov(grid, origin, radius) -> visible tiles` marks what the player currently sees; the explored mask is the union of everything seen so far. Visibility is **derived** (recomputed), not stored, keeping state minimal.
- **A `descend` command** that regenerates the level at `depth + 1` from the seeded RNG, repositions the player at the new spawn, resets/keeps explored data appropriately, and emits an observable `level-changed` event — giving the dungeon progression.
- **Wire FOV into the loop.** After the player moves (and on level entry), the explored mask updates from the current FOV so the state reflects what has been discovered.

**Non-goals (later stages):** no monster spawning or AI (Stage 5), no rendering (Stage 4), no items placed in the level, no stairs-down *tile* semantics beyond what `descend` needs, no combat, no multiple generators shipped beyond BSP (the registry is the seam, not a catalog).

## Capabilities

### New Capabilities
- `engine/level-generation`: Deterministic, seeded construction of a connected dungeon level from a named generator, with a registry seam for future generators.
- `engine/field-of-view`: Computation of the set of tiles currently visible from an origin using recursive shadowcasting, and the persistent "explored" union it feeds.

### Modified Capabilities
- `engine/spatial-grid`: The world model grows from a bare `Grid` to a level (grid + depth + spawn), and state carries an explored mask; movement and level entry update what has been seen.
- `engine/command-loop`: The command union gains `descend`, the event union gains `level-changed`, and the loop keeps its "every command yields ≥1 event / unknown degrades to noop / state stays JSON-clean" contract.

## Impact

- **New code**: `src/engine/level.ts` (Level model + `generateLevel` + generator registry), `src/engine/fov.ts` (recursive shadowcasting + explored-union helper), and the `descend`/`level-changed` additions in `types.ts`, `events.ts`, `commands.ts`.
- **Changed code**: `GameState` gains level/explored fields; `grid.ts` may gain small helpers (e.g. index/neighbor utilities) as needed; `src/engine/index.ts` exports the new surface.
- **New tests**: seeded levelgen determinism + connectivity + registry selection; FOV correctness on hand-built grids + symmetry/occlusion cases; explored-union persistence across moves; `descend` regeneration + RNG threading + JSON round-trip.
- **Docs**: `STATE.md`, `decisions.md`, roadmap status, `PROJECT.md`/`AGENTS.md`.
- **No breaking changes to existing behavior**: `Grid` remains a flat passability array; existing specs' requirements hold. `GameState` is extended additively (content still referenced by id; level/explored are plain data). Unknown commands and malformed parameters still degrade to `noop`.
