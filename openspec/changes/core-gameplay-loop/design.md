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
- A floor item is an entity whose `kind` is a pack item id and which carries a discriminator (e.g. `kind`-category or an `item: true` flag) so the grid can classify occupancy without a pack in scope (D4). No pack entry is copied into state (content-as-data).

Rationale: the command loop and UI must distinguish a living occupant (attack target) from a floor item / stairs (enterable). Keeping one flat `entities` array (rather than separate monster/item arrays) avoids a parallel collection and keeps `entityAt`/`entityById` valid. Alternative considered: nested `level.features` — rejected because terrain features like stairs would then live in two places. Alternative: separate `monsters`/`items` arrays — rejected (duplicates `entities`, breaks helpers).

Purity/JSON implications: all additive plain data; every existing `GameState`/`Level` fixture gains fields (as Stage 3 did), which `tsc` will surface. No `Map`/`Set`/class/function.

### D2 — Combat is a named damage registry, resolved inside the command loop

Add `src/engine/combat.ts` exposing:

- `damageRegistry: Record<string, DamageResolver>` and `resolveDamage(kind, attacker, target, rng) -> { targetAfter, applied }`, structurally mirroring `effects.ts` (id → pure resolver). The default resolver reads the attacker's attack value and draws a seeded amount via `randInt`.
- A `combat` design keeps damage **data-driven by kind but behavior-owned by the engine** — packs name a damage/attack kind, never supply logic.

Attacks are triggered two ways:
1. Explicit `AttackCommand { type: 'attack', direction }` — targets `entityAt(target)`; a living occupant resolves combat; empty/wall/self → `noop`.
2. **Bump-to-attack**: `applyMove` changes from "any occupant blocks" to "a *living* occupant is attacked; a non-blocking feature (stairs, floor item) is entered; walls/out-of-bounds are `blocked`". This preserves `move`'s signature and exactly matches the modified `spatial-grid` requirement.

Combat resolution: `resolveDamage` produces the target's new HP; if `<= 0` the entity is removed from `entities` and a `death` event is emitted. If the target is the player and HP `<= 0`, state `status` becomes `'dead'` and a `player-died` event is emitted.

Rationale: reusing the effect-registry pattern keeps "named registry, never pack-supplied closures." Alternatives: putting combat in `effects.ts` — rejected (effects are item-scoped; combat is a distinct concern and the file is already focused). Inlining in `commands.ts` — rejected (no registry seam, violates the AGENTS.md behavior rule).

Damage draws only through `randInt(rng, ...)`; a deterministic damage value (e.g. fixed attack) draws nothing, so noop/no-draw paths leave `rng.state` unchanged.

### D3 — Monster AI is a named behavior registry stepped once per turn

Add `src/engine/ai.ts` exposing `behaviorRegistry: Record<string, BehaviorResolver>` and `resolveBehavior(id) -> BehaviorResolver` (default/unknown id → a safe `idle` behavior, never a throw — consistent with `resolveEffect` returning `undefined` and the commander turning that into a noop, but here an explicit safe default avoids a noop-only monster). A `BehaviorResolver = (state, monster, rng) -> { entities, events }`-shaped pure function of serializable inputs.

- `chase`: if the player is visible (`computeFov(grid, monster.pos, radius)` marks the player's tile) or within the behavior's range, step toward the player (deterministic greedy step over passable, unoccupied tiles); if adjacent, attack the player through the same damage registry.
- `idle`: does nothing (emits nothing, or is skipped).

Advancement: the command loop runs a **turn step** after each successful *gameplay* command (D5): iterate living monsters in a deterministic order (their order in `entities`, which is spawn order and stable) and apply each monster's behavior once. Monster events are appended after the player's events in order. A monster that dies this turn does not act.

Rationale: the behavior id comes from the monster entity (copied from the resolved `PackMonster` at spawn — a string id, not the entry). Deterministic ordering by array position avoids a `Map`/sort and is stable under serialization. Alternatives: monsters acting only when visible — rejected (makes turns inconsistent); a single global "AI" function — rejected (no named-id seam).

### D4 — Occupancy/attack classification is a pure grid helper

Add to `grid.ts` (or a small `entity` helper) predicates: `isLiving(entity)` (has numeric `hp`-style combat stats / not an item), `isFeature(entity)` (item/stairs), and `attackTargetAt(entities, pos)`. These read entity fields only — no pack needed — so `applyMove` can decide attack vs. enter vs. block while staying content-free. `entityAt` remains as-is.

Rationale: keeps `src/engine` pack-free for movement/combat classification; a monster vs. item is structural data, not a pack lookup. Alternative: consult the pack in `applyMove` — rejected (would couple the content-free entry point to content).

### D5 — Turn semantics: monsters act on successful gameplay commands, not on no-ops or post-death

Define a "gameplay command" as one that changes the world for the player: a successful `move`, `attack`, `pickup`, or `use-item`, and a successful `descend` (which resets the level, so the *new* level's monsters do not immediately act). A `noop`/`blocked` command, a malformed command, and any command after `status === 'dead'` do **not** advance monsters. This is enforced once, in a wrapper around the command branches, so both entry points share it.

Rationale: avoids "wasted turn" drift and keeps replay deterministic (the rule is a pure function of the command + prior state, so replay is identical). Alternative: monsters always act — rejected (a noop would let monsters move for free, and post-death action contradicts permadeath).

Post-death: `applyCommand`/`applyCommandWithPack` early-return `noop('run-over')` for any gameplay command when `status === 'dead'`, so permadeath is terminal (spec: combat "commands after game over do not advance the world").

### D6 — Descend is gated on stairs; generated levels spawn monsters/items/stairs

`applyDescend` checks `state.entities` for the player's position `=== state.level.stairs`; off the stairs → `noop('not-on-stairs')`. On the stairs → generate the next level, then **populate** it (D7), place the player at spawn, reset `explored` (existing behavior), and thread the RNG.

`level.ts` extends `GeneratedLevel` to `{ level, grid, spawns }` where `spawns = { monsters: {kind,pos}[], items: {kind,pos}[], stairs: Position }`, or generation grows a `populate` step in `commands.ts` that consumes the same RNG. Decision: keep **generation** responsible for layout + stairs, and put **pack-driven population** in a separate pure function `populateLevel(generated, pack, rng) -> { entities, stairs, ... }` in `level.ts` (or `spawn.ts`) so `generateLevel` stays pack-agnostic (it takes no pack today) while the selected kinds still come from the loaded pack. `populateLevel` picks monster/item kinds by seeded index from `pack.pack.monsters`/`pack.pack.items` (stable array order) and places them on distinct passable tiles.

Rationale: preserves `generateLevel`'s existing pack-free signature (a real seam — adding a `pack` arg would couple generation to content) and keeps the placement logic pure. Alternative: pass the pack into `generateLevel` — rejected as a coupling regression; alternative: spawn in the command loop only — rejected (would duplicate for `createInitialState` and `descend`).

`createInitialState` (UI) also calls `populateLevel` so depth 1 has monsters/items/stairs.

### D7 — Items: pickup command + carried list; use consumes carried

`PickupCommand { type: 'pickup' }` picks the floor-item entity on the player's tile: removes it from `entities`, appends its `kind` to `state.carriedItemIds`, emits `item-picked-up`. On an empty tile → `noop('nothing-to-pick-up')`. `use-item` is extended so that on success it removes one instance of the id from `carriedItemIds` (if present) in addition to applying the effect; using a non-carried id remains resolvable (keeps Stage-2 behavior valid) but the spec's carried-item path is the intended UI flow.

Rationale: a pickup *command* (rather than silent auto-pickup) keeps the command log explicit — every state change is a command, which is what makes replay exact. Auto-pickup would make movement mutate the carried list implicitly (still replayable, but hides intent and complicates "pick up on empty = what event?"). Decision: **explicit pickup command**, documented here. Alternative: auto-pickup — rejected for the above; can be revisited as a UX toggle without changing replay semantics.

### D8 — Save/load is JSON state + command log, resumed by replay

Add `src/engine/save.ts` (pure, no I/O) exposing:

- `serializeSave(state, commandLog) -> string` and `deserializeSave(json) -> { state, commandLog }` — a plain `{ version, state, commands }` JSON envelope (`version` = save-format version, distinct from `PACK_VERSION`).
- `replayCommands(state, commands, pack?) -> GameState` — applies commands through the appropriate entry point (pack-aware when a pack is passed) from the seed; `resumeRun(save, pack?) -> GameState` = deserialize then replay.

The engine owns serialization/replay; the **client owns storage I/O** (e.g. a RN/Expo `AsyncStorage`-style or in-memory store). This keeps `src/engine` free of platform I/O and `Date`/ambient state.

Rationale: the locked choice — JSON state + command log, resume by replay from the seed — is exactly the determinism promise; implementing replay in the engine (not the client) keeps the UI a thin client. Alternative: serialize state only (no log) — rejected (does not prove replay; loses the audit trail). Alternative: client-side replay loop — rejected (duplicates engine semantics, weakens the boundary). Note: replaying a *saved mid-run state* plus the *remaining* commands is already proven by `e2e-seeded.test.ts`; `save.ts` generalizes it into a public contract.

### D9 — Pack format gains declarative monster fields; version bump

`pack-format` gains, on `packMonsterSchema`: `behavior: string` (a named behavior id) and `attack: number` (positive). `PACK_VERSION` bumps to `2`; a version-1 pack fails with the existing "unsupported pack version" message. `packMonsterStrictSchema` extends the positivity rules. `fantasy/pack.json` updates all three monsters with `behavior` (e.g. `chase`) and `attack`.

**Seam call-out:** this is a real seam event (a pack-format change that the engine now relies on). It stays content-as-data: the new fields are a **string id** and a **number** — no functions, no scripts, no engine logic in the pack. The engine resolves `behavior` through `behaviorRegistry` and `attack` through the damage path; a pack can never inject code. The version bump makes old packs fail loudly instead of silently missing fields. Alternative: infer behavior from `hp`/name — rejected (implicit, un-themeable). Alternative: no version bump — rejected (would silently reinterpret v1 packs and violate the forward-compat seam locked in Stage 2).

### D10 — UI: game-over surface, gameplay controls, save/resume, pure client

- `GameScreen` renders a **game-over surface** when `state.status === 'dead'` (a title/message plus a "New run" affordance) instead of the play view — no silent freeze (spec: glyph-renderer/app-shell).
- New controls in `ActionBar`/`Dpad`/keyboard: attack (directional, e.g. a modifier or a direction+attack key), pickup, use-item (a list of `carriedItemIds`), descend (existing), and save/resume. All dispatch new commands through `dispatch`; `commandForKey` gains the new keys (web-only).
- `glyphs.ts` already draws any entity via `pack.monster`/`pack.item` and renders stairs distinctly (terrain feature); `MapView` passes the stairs position. Explored-but-not-visible tiles still show no occupant (Stage-5 fix preserved).
- Save/resume/auto-save live in `useGame.ts` (the single engine call site) or a small `useSave` helper; auto-save runs on turn boundaries without mutating live state.
- All UI imports remain `@engine`-only; no engine edits are required *from* the UI (the abstraction-leak test is Stage 7).

Rationale: keeps the Stage-5 contract (one dispatch site, derived FOV, fallible lookups). Alternatives: a game-over modal library — rejected (no new dependency); auto-pickup UI — already decided against (D7).

## Risks / Trade-offs

- **[Required `GameState`/`Level` fields break every fixture]** → `tsc --noEmit` enumerates them; update fixtures to include `status`, `carriedItemIds`, and `level.stairs` (same approach Stage 3 used for `level`/`explored`). Keep them required rather than optional so absence can never be silently valid.
- **[Bump-to-attack changes move semantics and could break existing `blocked` tests]** → the change is deliberate and spec'd (`spatial-grid` MODIFIED); existing tests that used a generic occupant to force `blocked` must use a wall or a non-attackable feature, or assert `attack`. Audit `command-loop.test.ts` / `e2e-seeded.test.ts` (their `rock` occupant becomes an attack target) and update them.
- **[Monster turns make previously-seed-independent tests seed-dependent]** → `e2e-seeded.test.ts`'s claim that `move` draws nothing no longer holds once monsters act; tests must pin the seed and assert the full interleaved stream. Called out in tasks.
- **[Pack version bump invalidates the shipped pack until updated in the same change]** → `fantasy/pack.json` and the version are updated together; `loadPack` fails loudly if they drift (desired).
- **[Behavior registry could be mistaken for a scripting surface]** → like `effectRegistry`, it is a small enumerated map of pure functions; behaviors are engine-owned, packs supply only ids. Treat any pack-supplied logic as an abstraction leak.
- **[Save format version drift]** → a separate `SAVE_VERSION` in the envelope; `deserializeSave` rejects an unknown version loudly rather than mis-parsing.
- **[Determinism across replay vs. live]** → all new randomness flows through `randInt`/`rng`; no `Math.random`/`Date`; engine-lint (`npx eslint src/engine --no-warn-ignored`) is the gate.
- **[Monster chase traversal cost]** → v1 levels are 40×30 with modest monster counts; a greedy step is O(1) per monster per turn; no pathfinding library. Revisit only if profiling demands.
- **[UI test stack is limited (no React render tests)]** → pure logic (glyph/input/save-resume helpers) is unit-tested under node Vitest; UI wiring is covered by `tsc`/lint and the export gate, as in Stage 5. Documented as a known gap.

## Migration Plan

Apply phase is inherently ordered by the phases below (engine first, UI last). Rollback is per-phase via git; no data migration beyond regenerating the shipped pack (v1 → v2) and updating `GameState` fixtures. On completion, update `STATE.md` and append to `decisions.md` (the Stage-6 outcome + the `PACK_VERSION`/save-format seam entries).
