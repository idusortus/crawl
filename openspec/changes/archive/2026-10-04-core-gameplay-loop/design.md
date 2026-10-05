# Design

## Context

See `proposal.md` — Why. The current engine surface that constrains the approach:

- `GameState` (`src/engine/types.ts`) is `{ grid, level, explored, entities, playerId, rng, events }` — all plain data. `Entity` is `{ id, kind, pos, [key: string]: unknown }`, so `hp` is an undeclared convention read by `actorHp` (`effects.ts`). `Level` is metadata only: `{ depth, spawn }`; terrain is `state.grid: Grid` (flat `passable: boolean[]`, `y*width+x`).
- `Command = MoveCommand | UseItemCommand | DescendCommand`; `GameEvent = moved | blocked | noop | item-used | level-changed`.
- `commands.ts` exposes `applyCommand(state, command, rng)` (content-free) and `applyCommandWithPack(state, command, rng, pack)`; both funnel through one private `commit(state, rng, events, overrides)` that writes `rng.state()` back, appends events, and replaces `entities`/`grid`/`level`/`explored` via `StateOverrides`. `applyMove` blocks on any occupant; `applyDescend` unconditionally generates depth+1 at 40×30 and repositions the player.
- `effects.ts` has `effectRegistry: Record<string, EffectResolver>` (`heal`, `roll-heal`) + `resolveEffect(kind, actor, effect, rng)` + `actorHp`. This is the precedent for a **named registry that maps id → pure resolver**, and the pattern `AGENTS.md` requires for behaviors.
- `level.ts` exposes `generateLevel({ id?, rng, width, height, depth })` and `generateBspLevel` over a module-private `generators` registry; `GeneratedLevel = { level, grid }`. Generation is pure and seeded.
- `fov.ts` gives `computeFov(grid, origin, radius)` and `exploreInto`; `rng.ts` gives `createRng`/`randInt`/`rngFromState`/`rngToState`.
- `packs/fantasy/pack.json` has classes, monsters (`hp`), and items (`effect`); `loadPack` returns `LoadedPack` with `class`/`monster`/`item(id)` throwing `UnknownContentIdError`, plus private `Map` indexes. `PACK_VERSION = 1`.
- The client (`src/ui/**`) is a pure `@engine` client: `useGame.ts` is the single `applyCommandWithPack` call site; `createInitialState(seed, pack)` assembles state; `MapView` derives FOV; `glyphs.ts` does fallible pack lookups with a `?` fallback and a blank unseen tile.

Hard constraints (unchanged): `src/engine` pure (no `react`/`react-native`/`expo*`, no `Math.random`/`Date`), command-in/event-out, input never mutated, `GameState` JSON-serializable, content-as-data, behavior via named registry ids, import only through `@engine`.

## Goals / Non-Goals

**Goals:**
- A complete, deterministic roguelike turn loop: seeded spawn → move → attack/be attacked → pick up → use → descend → die, fully reproducible from seed + command log.
- Keep every behavior behind an engine-owned **named registry** (combat damage, monster behaviors), so content stays declarative data.
- Prove the milestone's save/replay promise end to end (JSON state + command log → identical resumed run).
- Prove the `src/engine` purity boundary still holds and that the UI is still a pure `@engine` client.

**Non-Goals:**
- No ECS, no scripting engine, no event bus, no data-driven effect *code*.
- No second theme pack (Stage 7 is the abstraction-leak test).
- No camera/scrolling, animation, audio, or web target.
- No new external dependency (combat/AI need no library).
- Not deciding balance/values — content owns balance; engine owns mechanics.

## Decisions

### D1 — Entities, features, and the level carry spawn metadata on `GameState`

`Entity` stays `{ id, kind, pos, ... }` and remains the single representation for the player, monsters, and floor items; `kind` is a pack id. New plain-data fields are added as required top-level state:

- `Level` gains `stairs: Position` (metadata alongside `depth`/`spawn`) — mirrors the existing metadata-only design (Stage 3 D1) and keeps terrain in `grid`.
- `GameState` gains `status: 'playing' | 'dead'` (a string enum, JSON-clean) and `carriedItemIds: string[]` (a plain list of content ids). Both are required so "is the run over?" and "what can I use?" can never be silently absent — matching the Stage-3 precedent of required `level`/`explored`.
- A floor item is an entity whose `kind` is a pack item id and which carries an explicit **item discriminator field** (a boolean `item: true` flag written at spawn) so the grid can classify occupancy without a pack in scope (D4). Classification keys off this field for items (NOT off `kind`, since `kind` is a pack id the content-free path cannot resolve); stairs are identified by the `level.stairs` position, never as an entity. No pack entry is copied into state (content-as-data).

Rationale: the command loop and UI must distinguish a living occupant (attack target) from a floor item / stairs (enterable). Keeping one flat `entities` array (rather than separate monster/item arrays) avoids a parallel collection and keeps `entityAt`/`entityById` valid. Alternative considered: nested `level.features` — rejected because terrain features like stairs would then live in two places. Alternative: separate `monsters`/`items` arrays — rejected (duplicates `entities`, breaks helpers).

Purity/JSON implications: all additive plain data; every existing `GameState`/`Level` fixture gains the new required fields (as Stage 3 did). This is a **known, enumerated fixture break** — `tsc` surfaces it, but the plan names every site rather than relying on the compiler alone: see tasks 1.1/3.1 (the fixture list). No `Map`/`Set`/class/function.

### D2 — Combat is a named damage registry, resolved inside the command loop

Add `src/engine/combat.ts` exposing:

- `damageRegistry: Record<string, DamageResolver>` and `resolveDamage(kind, attacker, target, rng) -> { targetAfter, applied }`, structurally mirroring `effects.ts` (id → pure resolver). `damageRegistry` is **keyed on a damage kind string**; v1 registers one kind under the exported constant **`MELEE_DAMAGE_KIND = 'melee'`**, used both at the attack call site (`resolveDamage(MELEE_DAMAGE_KIND, ...)`) and in tests instead of a bare literal. The default resolver reads the attacker's attack value (below) and draws a seeded amount via `randInt`. A resolver that adds no variability (fixed attack) draws nothing.
- **Attack-value plumbing (decided).** `packClassSchema` **and** `packMonsterSchema` each gain `attack: positive number` (a `PACK_VERSION` impact on CLASSES too, see D9). At spawn, `populateLevel`/`createInitialState` **copy** the resolved `(attack, behavior)` onto the entity, so the resolver reads `attacker.attack` — a plain number on the entity — instead of reaching for a pack (the same pattern `actorHp`/`hp` already uses). The player entity gets `attack` from `pack.class(PLAYER_CLASS_ID)`. An entity with no copied `attack` falls back to the fixed base constant `DEFAULT_ATTACK`. The monster's `behavior` id is copied the same way for AI (D3).

Attacks are triggered two ways:
1. Explicit `AttackCommand { type: 'attack', direction }` — targets `entityAt(target)`; a living occupant resolves combat; empty/wall/self → `noop`.
2. **Bump-to-attack**: `applyMove` changes from "any occupant blocks" to a total three-way classification (D4): living → attack; feature (floor item via `isFeature(entity)` / the `level.stairs` tile via `isStairs(pos, level.stairs)`) → enter; **any other non-living occupant** (including content-free fixtures such as the `rock` with neither `hp` nor the item discriminator) → `blocked`. This preserves `move`'s signature and exactly matches the modified `spatial-grid` requirement.

Combat resolution: `resolveDamage` produces the target's new HP; if `<= 0` the entity is removed from `entities` and a `death` event is emitted. If the target is the player and HP `<= 0`, state `status` becomes `'dead'` and a `player-died` event is emitted.

Rationale: reusing the effect-registry pattern keeps "named registry, never pack-supplied closures." Alternatives: putting combat in `effects.ts` — rejected (effects are item-scoped; combat is a distinct concern and the file is already focused). Inlining in `commands.ts` — rejected (no registry seam, violates the AGENTS.md behavior rule).

Damage draws only through `randInt(rng, ...)`; a deterministic damage value (e.g. fixed attack) draws nothing, so noop/no-draw paths leave `rng.state` unchanged.

### D3 — Monster AI is a named behavior registry stepped once per turn

Add `src/engine/ai.ts` exposing `behaviorRegistry: Record<string, BehaviorResolver>` and `resolveBehavior(id) -> BehaviorResolver` (default/unknown id → a safe `idle` behavior, never a throw — consistent with `resolveEffect` returning `undefined` and the commander turning that into a noop, but here an explicit safe default avoids a noop-only monster). A `BehaviorResolver = (state, monster, rng) -> { entities, events }`-shaped pure function of serializable inputs.

- `chase`: if the player is visible (`computeFov(grid, monster.pos, radius)` marks the player's tile) or within the behavior's range, step toward the player (deterministic greedy step over passable, unoccupied tiles); if adjacent, attack the player through the same damage registry.
- `idle`: does nothing (emits nothing, or is skipped).

Advancement: the command loop runs a **turn step** after each successful *gameplay* command (D5): iterate living monsters in a deterministic order (their order in `entities`, which is spawn order and stable) and apply each monster's behavior once. Monster events are appended after the player's events in order. A monster that dies this turn does not act.

Rationale: the behavior id comes from the monster entity (copied from the resolved `PackMonster` at spawn — a string id, not the entry). Deterministic ordering by array position avoids a `Map`/sort and is stable under serialization. Alternatives: monsters acting only when visible — rejected (makes turns inconsistent); a single global "AI" function — rejected (no named-id seam).

### D4 — Occupant classification is total and pack-free

Add to `grid.ts` (or a small `entity` helper) predicates with **exact signatures**: `isLiving(entity)` (a non-item entity carrying numeric combat stats — an `hp`), `isFeature(entity)` (an **item-discriminator-only** predicate: true iff the entity carries the D1 `item: true` field), `isStairs(pos, stairs)` (true iff `pos` equals the `level.stairs` position — stairs are not an entity), and `attackTargetAt(entities, pos)`. The **stairs case is an explicit `isStairs(pos, stairs)` check performed in `applyMove`** (not folded into `isFeature`, which cannot see `level.stairs` from an entity alone). These read entity fields and `level.stairs` only — no pack needed — so `applyMove` can decide attack vs. enter vs. block while staying content-free. `entityAt` remains as-is. D2's bump-to-attack classification uses exactly these two callsite checks (item discriminator via `isFeature(entity)`; stairs tile via `isStairs(playerPos, level.stairs)`).

**Classification is total and explicit — every occupant falls into exactly one of three classes:**

1. **living** (`isLiving`: has `hp`, not an item) → **attack** (bump-to-attack) — the tile is never entered.
2. **feature** (floor item with the D1 discriminator, or the `level.stairs` tile) → **enter** — the player may stand on it and `pickup`/`descend`.
3. **any other non-living occupant** (neither `hp` nor the item discriminator, and not the stairs tile) → **blocked**. This is the catch-all third class; content-free fixtures such as the `rock` (`{id:'rock',kind:'rock',solid:true}`, no `hp`, not an item/stairs) land here, so classification never falls through undefined.

`isFeature` keys the item case off the D1 **discriminator field** (not the pack `kind`, which is unresolvable pack-free); the stairs tile is detected by the separate `isStairs(pos, level.stairs)` check in `applyMove` (stairs are not an entity). Rationale: keeps `src/engine` pack-free for movement/combat classification and makes "what happens when I walk into X?" a total function of `(entity fields, level.stairs)` with no unclassified gap. Alternative: consult the pack in `applyMove` — rejected (would couple the content-free entry point to content).

### D5 — Turn semantics: an explicit outcome→advance matrix

Define a "gameplay command" as one that changes the world for the player. Whether monsters advance is decided **per command outcome**, exactly:

| Player outcome | Advance monsters? |
| --- | --- |
| move-empty (step succeeds) | **yes** |
| bump-attack (living target) | **yes** |
| move-blocked (wall/OOB/other non-living occupant) | **no** |
| attack-hit | **yes** |
| attack-noop / attack-self / attack-empty | **no** |
| pickup-success | **yes** |
| pickup-empty (noop) | **no** |
| use-item-success | **yes** |
| use-item-noop | **no** |
| descend-success | **yes, but the NEW level's monsters do NOT act this turn** |
| descend-off-stairs (noop) | **no** |
| noop / malformed / unknown command | **no** |
| post-death (any gameplay command when `status === 'dead'`) | **no** |

Rationale: avoids "wasted turn" drift and keeps replay deterministic (the rule is a pure function of the command + prior state, so replay is identical). Alternative: monsters always act — rejected (a noop would let monsters move for free, and post-death action contradicts permadeath). Note the two non-obvious rows: a successful `descend` advances nothing on the newly generated level (its monsters were just placed, so acting the same turn would be double-movement), and any outcome is moot once `status === 'dead'`.

The turn step re-reads `status` as it advances and **stops advancing monsters the moment the player dies** mid-step (a later monster does not get a free hit on a corpse). A monster that dies earlier in the step does not act when its turn comes. The advancement is enforced once, in a wrapper around the command branches, so both entry points share it.

Post-death: `applyCommand`/`applyCommandWithPack` early-return `noop('run-over')` for any gameplay command when `status === 'dead'`, so permadeath is terminal (spec: combat "commands after game over do not advance the world").

### D6 — Descend is gated on stairs; generated levels spawn monsters/items/stairs

`applyDescend` checks `state.entities` for the player's position `=== state.level.stairs`; off the stairs → `noop('not-on-stairs')`. On the stairs → generate the next level, then **populate** it (D7), place the player at spawn, reset `explored` (existing behavior), and thread the RNG.

`level.ts` **keeps `GeneratedLevel`'s shape UNCHANGED** as `{ level, grid }`; `Level` gains `stairs: Position`, so `generateLevel`/`generateBspLevel` populate `generated.level.stairs`. Pack-driven population is a separate pure function `populateLevel(generated, pack, rng) -> { entities }` in `level.ts` (or a new `spawn.ts`) so `generateLevel` stays pack-agnostic (it takes no pack today) while the selected kinds still come from the loaded pack. `populateLevel` resolves into a single `entities` array (monsters + items only — stairs were already drawn during generation via `generated.level.stairs`, so `populateLevel` neither draws nor returns stairs) and picks monster/item kinds by seeded index from `pack.pack.monsters`/`pack.pack.items` (stable array order) and places them on distinct passable tiles, copying each monster's resolved `behavior`/`attack` onto its entity (D2).

**RNG-sharing/ordering contract (pinned).** Generation, population, and stairs placement draw from **one** `Rng` instance created from `state.rng`. `state.rng` is captured **after** generation + population + stairs complete (never re-create an `Rng` mid-step, which would reset the stream). Concretely, `populateLevel(generated, pack, rng)` receives the **same `Rng` instance** `generateLevel` just consumed (stairs are drawn as part of generation — D6 — so population follows): the caller creates `rng = createRng(state.rng.seed)` once (or resumes from `rngFromState(state.rng)`), generates, then populates, then writes `state.rng = rngToState(seed, rng)`. Call sites: `createInitialState` (src/ui/state/createInitialState.ts) and the `descend` branch of `commands.ts` both follow this single-shared-Rng rule.

Spawn-exclusion/occupancy draw order is fixed so placement is reproducible: `populateLevel` iterates candidate tiles **row-major** (`y*width+x`), skipping non-passable tiles, the spawn tile, the stairs tile, and any tile already occupied by an earlier placement. The number of monsters/items is itself a seeded draw (or a fixed per-depth count drawn from the same stream) — either way it is decided before the row-major placement pass, so the same seed+depth+pack yields identical positions and kinds.

Rationale: preserves `generateLevel`'s existing pack-free signature (a real seam — adding a `pack` arg would couple generation to content) and keeps the placement logic pure. Alternative: pass the pack into `generateLevel` — rejected as a coupling regression; alternative: spawn in the command loop only — rejected (would duplicate for `createInitialState` and `descend`).

`createInitialState` (UI) also calls `populateLevel`, sharing the same single `Rng` as its `generateLevel` call (see the contract above), so depth 1 has monsters/items/stairs and a mid-run resume reproduces the same monsters/kinds.

### D7 — Items: pickup command + carried list; use consumes carried

`PickupCommand { type: 'pickup' }` picks the floor-item entity on the player's tile: removes it from `entities`, appends its `kind` to `state.carriedItemIds`, emits `item-picked-up`. On an empty tile → `noop('nothing-to-pick-up')`. `use-item` is extended so that on success it removes one instance of the id from `carriedItemIds` (if present) in addition to applying the effect; using a non-carried id remains resolvable (keeps Stage-2 behavior valid) but the spec's carried-item path is the intended UI flow.

Rationale: a pickup *command* (rather than silent auto-pickup) keeps the command log explicit — every state change is a command, which is what makes replay exact. Auto-pickup would make movement mutate the carried list implicitly (still replayable, but hides intent and complicates "pick up on empty = what event?"). Decision: **explicit pickup command**, documented here. Alternative: auto-pickup — rejected for the above; can be revisited as a UX toggle without changing replay semantics.

### D8 — Save/load is full JSON state + full command log + an applied-count cursor, resumed by replaying the remainder

Add `src/engine/save.ts` (pure, no I/O) exposing:

- `serializeSave(state, commandLog, appliedCount) -> string` and `deserializeSave(json) -> { state, commands, appliedCount }` — a plain `{ version, state, commands, appliedCount }` JSON envelope (`version` = `SAVE_VERSION`, the save-format version, distinct from `PACK_VERSION`). **`state` is the FULL current state** (grid, level incl. stairs, explored, entities, playerId, rng, events, status, carriedItemIds); **`commands` is the FULL command log** for the run (the audit trail — never truncated); and **`appliedCount` is the number of commands from the head of that log already reflected in `state`**.
- `replayCommands(state, commands, appliedCount, pack?) -> GameState` — applies `commands.slice(appliedCount)` (the **remainder**) through the appropriate entry point **from the saved state** (pack-aware `applyCommandWithPack` when a pack is passed; the content-free `applyCommand` otherwise, which noops `use-item`), returning the final state and appending the same events. `appliedCount` defaults to `commands.length` when a caller holds a fully-applied log, and `0` when `state` is an initial run state paired with a fresh log.
- `resumeRun(save, pack?) -> GameState` = `deserializeSave(save)` → `replayCommands(state, commands, appliedCount, pack?)`.

**One contract, stated plainly:** the envelope carries the **full current state**, the **full command log**, and an **`appliedCount` cursor** telling replay where the log's applied prefix ends. Resume replays **only the remaining commands (`commands.slice(appliedCount)`) from the saved state** — never the whole log against the full state (that would re-apply every command a second time). There is **no seed→initial-state primitive in the engine** (`createInitialState` lives in `src/ui`). Resume never rebuilds initial state from a seed; it deserializes the **full saved state** and replays the **remainder** from there. The phrase "from the seed" in the proposal/specs means *from the saved state, whose `rng.seed` is recorded* — not a re-derivation from the seed alone. The engine owns serialization/replay; the **client owns storage I/O** (e.g. an RN/Expo `AsyncStorage`-style or in-memory store). This keeps `src/engine` free of platform I/O and `Date`/ambient state.

Rationale: the locked choice — JSON state + full command log + cursor, resume by replaying the remaining log from the saved state — is exactly the determinism promise and preserves **both** the audit trail (the full log) and the proven *mid-run state + remaining commands* pattern in `e2e-seeded.test.ts` (`MIXED_SEQUENCE.slice(SPLIT)` applied to the deserialized mid-run state). A save of an in-progress run sets `appliedCount < commands.length`; a save of a completed/settled run sets `appliedCount === commands.length` (resume replays nothing). Alternative: serialize state only (no log) — rejected (does not prove replay; loses the audit trail). Alternative: initial-state + full-log replay (no cursor, state must be the initial run state) — rejected because it discards the current state and cannot express a save taken mid-run without rebuilding from a seed the engine does not own. Alternative: client-side replay loop — rejected (duplicates engine semantics, weakens the boundary). `deserializeSave` rejects an unknown `SAVE_VERSION` loudly rather than mis-parsing.

### D9 — Pack format gains declarative monster fields; version bump

`pack-format` gains, on `packMonsterSchema`: `behavior: string` (a named behavior id) and `attack: number` (positive); **and on `packClassSchema`: `attack: number` (positive)** so the player has an attack source (D2/M8). `PACK_VERSION` bumps to `2`; a version-1 pack fails with the existing "unsupported pack version" message — the **schema** (not just the loader) requires the new fields, so a v1 fixture that sets `version: PACK_VERSION` but omits `behavior`/`attack` fails validation. `packMonsterStrictSchema` extends the positivity rules. `fantasy/pack.json` updates all three monsters with `behavior` (e.g. `chase`) and `attack`, and both classes with `attack`.

**Seam call-out:** this is a real seam event (a pack-format change that the engine now relies on). It stays content-as-data: the new fields are a **string id** and a **number** — no functions, no scripts, no engine logic in the pack. The engine resolves `behavior` through `behaviorRegistry` and `attack` through the damage path; a pack can never inject code. The version bump makes old packs fail loudly instead of silently missing fields. Alternative: infer behavior from `hp`/name — rejected (implicit, un-themeable). Alternative: no version bump — rejected (would silently reinterpret v1 packs and violate the forward-compat seam locked in Stage 2).

### D10 — UI: game-over surface, gameplay controls, save/resume, pure client

- `GameScreen` renders a **game-over surface** when `state.status === 'dead'` (a title/message plus a "New run" affordance) instead of the play view — no silent freeze (spec: glyph-renderer/app-shell).
- New controls in `ActionBar`/`Dpad`/keyboard: attack (directional, e.g. a modifier or a direction+attack key), pickup, use-item (a list of `carriedItemIds`), descend (existing), and save/resume. All dispatch new commands through `dispatch`; `commandForKey` gains the new keys (web-only).
- `glyphs.ts` already draws any entity via `pack.monster`/`pack.item` and renders stairs distinctly via an exported `STAIRS_GLYPH` constant (`'>'`) rather than a pack lookup (terrain feature has no pack entry); `tileRender` gains a `stairs` input and `MapView` passes `state.level.stairs`. The explored-but-not-visible rule (Stage-5 fix preserved) also governs stairs: an explored-but-not-currently-visible stairs tile shows the stairs only if it is currently visible, else no occupant/feature is drawn beyond the flat terrain.
- Save/resume/auto-save live in `useGame.ts` (the single engine call site) or a small `useSave` helper; auto-save runs on turn boundaries without mutating live state.
- All UI imports remain `@engine`-only; no engine edits are required *from* the UI (the abstraction-leak test is Stage 7).

Rationale: keeps the Stage-5 contract (one dispatch site, derived FOV, fallible lookups). Alternatives: a game-over modal library — rejected (no new dependency); auto-pickup UI — already decided against (D7).

## Risks / Trade-offs

- **[Required `GameState`/`Level` fields break every fixture]** → `tsc --noEmit` surfaces them, but the plan enumerates every site (tasks 1.1/3.1) rather than trusting the compiler alone. The verified break list: `command-loop.test.ts` (`makeState`/`openState`/inline literals), `serialization.test.ts:12`, `e2e-seeded.test.ts:70`, `item-use.test.ts`, `descend.test.ts`, `pack-loader.test.ts:224,243`, `index-surface.test.ts:90,176,275`, `level.test.ts` equality asserts (`:113,121,274,293`) + a new stairs assertion; and outside the engine `src/ui/state/createInitialState.ts:87` + its test, `src/packs/fantasy/__tests__/fantasy-pack.test.ts`. `Level.stairs` lives on `Level`; `generateBspLevel`/`GeneratedLevel` must populate it (shape unchanged, N12). Keep fields required rather than optional so absence can never be silently valid.
- **[Bump-to-attack changes move semantics and could break existing `blocked` tests]** → the change is deliberate and spec'd (`spatial-grid` MODIFIED). **Decision on the `rock` occupant:** in `command-loop.test.ts` the `rock` becomes a **wall** (`solid`/non-passable terrain) where a `blocked` assertion is wanted, and a **living monster with `hp`** where an attack assertion is wanted; in `e2e-seeded.test.ts` the `rock` becomes a wall so the `BLOCKED_SEQUENCE` stays blocked. This is a test-fixture rewrite, not an engine behavior change.
- **[Monster turns make previously-seed-independent tests seed-dependent]** → `e2e-seeded.test.ts`'s claim that `move` draws nothing no longer holds once monsters act; tests must pin the seed and assert the full interleaved stream. Called out in tasks.
- **[Pack version bump invalidates the shipped pack until updated in the same change]** → `fantasy/pack.json` and the version are updated together; `loadPack` fails loudly if they drift (desired).
- **[Behavior registry could be mistaken for a scripting surface]** → like `effectRegistry`, it is a small enumerated map of pure functions; behaviors are engine-owned, packs supply only ids. Treat any pack-supplied logic as an abstraction leak.
- **[Save format version drift]** → a separate `SAVE_VERSION` in the envelope; `deserializeSave` rejects an unknown version loudly rather than mis-parsing.
- **[Determinism across replay vs. live]** → all new randomness flows through `randInt`/`rng`; no `Math.random`/`Date`; engine-lint (`npx eslint src/engine --no-warn-ignored`) is the gate.
- **[Monster chase traversal cost]** → v1 levels are 40×30 with modest monster counts; a greedy step is O(1) per monster per turn; no pathfinding library. Revisit only if profiling demands.
- **[UI test stack is limited (no React render tests)]** → pure logic (glyph/input/save-resume helpers) is unit-tested under node Vitest; UI wiring is covered by `tsc`/lint and the export gate, as in Stage 5. Documented as a known gap.

## Migration Plan

Apply phase is inherently ordered by the phases below (engine first, UI last). Rollback is per-phase via git; no data migration beyond regenerating the shipped pack (v1 → v2) and updating `GameState` fixtures. On completion, update `STATE.md` and append to `decisions.md` (the Stage-6 outcome + the `PACK_VERSION`/save-format seam entries).
