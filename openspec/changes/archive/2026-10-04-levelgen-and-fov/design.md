# Design

## Context

See `proposal.md` → Why. The engine has a flat-passability `Grid` (`grid.ts`), a seeded RNG (`rng.ts`), a command-in/event-out loop (`commands.ts`), and validated content packs. `GameState` is `{ grid, entities, playerId, rng, events }` — strictly JSON-clean. There are 145 tests and an enforced purity boundary. Levels today exist only as test fixtures built with `createGrid(rows)`.

The binding constraint is **reproducibility**: generation and vision must be pure functions of seed + inputs, or every earlier determinism guarantee (replay, save/resume) silently breaks. A second constraint is keeping `GameState` a serializable value — FOV must not smuggle non-JSON data (sets, closures) into it.

## Goals / Non-Goals

**Goals:**
- A pure, seeded `(seed, depth) -> Level` producing a connected, bounded dungeon.
- A generator registry so alternative generators slot in without engine/state changes.
- Recursive-shadowcasting FOV as a pure function; explored mask persisted in state, visibility derived.
- A `descend` command giving the loop depth progression, fully deterministic and replayable.

**Non-Goals:**
- No monster/item population of levels (Stages 5+), no rendering, no combat.
- No save-file I/O (state remains a serializable value; persistence is a later/UI concern).
- No second generator shipped — only the registry *seam* (BSP is the sole v1 entry).
- No diagonal movement or per-tile lighting/opacity beyond passable-vs-wall.

## Decisions

### D1 — Level model extends state additively; `Grid` stays a flat passability array
`GameState` gains `level: { depth, spawn }` and `explored: boolean[]` (flat, row-major like `grid.passable`). The `Grid` type itself is unchanged, so `grid.ts` helpers, Stage-2 content references, and all existing tests keep working. *Alternatives:* a richer tile type array (rejected: bigger change, not needed for FOV which only needs passability); nesting `Grid` inside a `Level` object and replacing `state.grid` (rejected: forces churn in every existing consumer for no v1 benefit). Keep `state.grid` and add `state.level`/`state.explored`.

### D2 — BSP rooms-and-corridors as the default generator
Recursive binary space partition: split the region until leaves are room-sized, place a room in each leaf, then connect sibling subtrees. Corridors are carved as an **L-shaped connected floor path** (a horizontal run then a vertical run) between the two child subtrees' representative room centers, over the same passable array, with no later partition step walling it over. Connectivity is therefore **asserted by the flood-fill connectivity test** (not merely claimed "by construction") — the honest statement, since a naive straight-line connection could leave floors unreachable. Fully deterministic given a seeded `Rng`; all randomness (split points, room sizes) draws from the injected RNG. *Alternatives:* cellular automata (organic caves, but connectivity needs flood-fill repair) — deferred behind the registry; simple random rooms (weaker structure, more rejection sampling).

### D3 — Generator registry keyed by named id
`generators: Record<string, LevelGenerator>` where `LevelGenerator = (rng, { width, height, depth }) => Level`. `generateLevel(input)` picks a generator by `id` (default `'bsp'`) and reports unknown ids explicitly — mirroring the effect registry (no scripting, no pack-supplied code). Adding a generator is one registry entry, no state or command changes. This is the seam the spec's "named id" requirement exists for.

### D4 — FOV: recursive shadowcasting, visibility derived
`computeFov(grid, origin, radius) -> boolean[]` (flat, same indexing as `grid.passable`) implements recursive shadowcasting over the 8 octants: from the origin, sweep each octant maintaining visible scan intervals, marking tiles visible and recursing around walls. It is pure and does not mutate the grid. Visibility is recomputed each time from the current grid + player position; it is **not** stored in state. The **explored** mask (stored) is updated as `explored = explored OR visible`. *Alternatives:* naive ray-casting per tile (simpler but O(tiles×radius) and gives symmetric artifacts); storing visibility in state (rejected: bloats state and duplicates a pure computation).

**Sight radius** is an engine constant for v1 (e.g. 8) exposed via the FOV function parameter so it can later come from the actor/pack without a signature break.

### D5 — Explored mask is monotonic per level; reset on descend
On entering/regenerating a level, `explored` starts all-false and is immediately OR'd with the spawn's FOV. On each successful move, it is OR'd with the new FOV. On descend, the mask is replaced (fresh for the new level), satisfying the command-loop spec's "does not carry across levels". *Alternative:* keep a shared explored across all levels (rejected by spec).

### D6 — `descend` reuses a generalized `commit` and threads the RNG like every other command
`descend` draws from the injected `Rng` to seed/advance generation (generation consumes the RNG), builds the new level via `generateLevel`, places the player at the new spawn, resets `explored` to the spawn FOV, and emits `level-changed { depth }`. It is content-free, so it resolves in **both** `applyCommand` and `applyCommandWithPack` (added as an explicit `case` in each switch — never left to the `default` noop, or a UI that uses `applyCommandWithPack` for `use-item` could never descend). The existing `commit()` helper currently only spreads `state` and optionally replaces `entities`; it is **generalized** to optionally replace `grid`/`level`/`explored` as well (or `descend` constructs the returned state directly), so RNG write-back and append-only logging stay centralized in one place. Malformed `descend` parameters (none in v1) and unknown command types keep degrading to `noop`.

**FOV update on move** also happens inside the move path (after a successful step), OR'd into `explored`, so `GameState` after any move reflects discovery — the spatial-grid spec requirement.

### D7 — Parameter validation extends to the new command
Stage 2's review hardened the boundary so a well-formed-but-bad-parameter command degrades to `noop` instead of throwing. `descend` has no parameters in v1, but the same guard discipline applies to any future ones; the design records that new commands MUST validate parameters at the boundary.

### D8 — Testing
Tests cover: levelgen determinism (same seed+id ⇒ identical level), seed divergence, connectivity (flood-fill from spawn reaches all floor tiles — the strongest guarantee), bounded edges, spawn-on-floor, depth recorded, registry selection + unknown-id reporting + default; FOV on hand-built grids (open area, wall occlusion, origin always visible, radius bound, determinism, no grid mutation); explored persistence across moves + reset on descend + JSON round-trip; `descend` regenerates at depth+1, is deterministic under replay, is observable, and does not mutate input.

## Risks / Trade-offs

- **BSP connectivity correctness** → Mitigation: carve each sibling connection as an L-shaped floor path over the shared passable array, and prove it with a flood-fill connectivity test over many seeds, not one.
- **Shadowcasting is fiddly to get right** → Mitigation: keep the implementation small, test against hand-built grids with known expected occlusion, and assert purity/determinism; swap in a simpler algorithm behind the same function signature if needed.
- **`GameState` grows (level + explored arrays)** → Mitigation: both are flat `boolean[]`/plain objects, JSON-clean and cheap; no sets/classes. Noted as the natural size cost of a real dungeon.
- **FOV recomputed every move could be a perf cost on large maps** → Mitigation: v1 radii/maps are small; radius is a parameter, and caching can be added later without a signature change. Not a v1 blocker.
- **Interaction with Stage-2 malformed-command hardening** → Mitigation: `descend` is parameterless; D7 records the rule so the next parameterized command is guarded from birth.

## Migration Plan

Additive within the project. Order: extend types/state → FOV module + tests → level module (BSP + registry) + tests → `descend`/`level-changed` wiring + tests → explored-on-move wiring → public exports → verification + docs. Existing 145 tests must stay green; `state.grid` and all content references are unchanged, so no data migration. Rollback is a revert of the stage.

## Open Questions

None that block this stage. The exact default sight radius and whether the player's class later supplies it are deferrable and change neither the specs nor the approach (v1 uses a fixed default parameter).
