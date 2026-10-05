# Architectural Decisions

> One entry per locked-in choice. Reverse chronological. Concise — not an ADR template.

## Format

    ## YYYY-MM-DD — <decision title>
    **Context:** Why we needed to decide.
    **Choice:** What we chose.
    **Trade-offs:** What we gave up.
    **Revisit:** Trigger that would re-open this decision (or "never").

---

## 2026-10-04 — Stage 7 (`second-theme-pack`) outcome — abstraction-leak test passed with an empty engine diff

**Context:** Stage 7 is the milestone's deliberate abstraction-leak test: author a second, thematically unrelated content pack (a comedic family-dog setting) under the *existing* version-2 pack schema and prove it loads with **zero changes to `src/engine/**`**. The engine had never actually been asked to express anything but fantasy, so the claim "content is data, not code" was asserted but untested. The acceptance criterion was mechanical: the diff of `src/engine/**` must be empty and `PACK_VERSION` must stay 2.

**Choice:**
- **The dogs pack is pure version-2 data and reuses only existing engine vocabulary.** `src/packs/dogs/pack.json`: 2 classes (`good-boy` 12hp/4atk, `chonker` 20hp/3atk), 3 monsters (`mail-carrier` and `vacuum` → `behavior: "chase"`; `squirrel` → `behavior: "idle"`), 2 items (`bone` → `{kind:'heal',amount:6}`, `treat` → `{kind:'roll-heal',min:3,max:8}`). Every theme element maps onto vocabulary the engine already has — **no new behavior, damage kind, effect kind, stat, or schema field was needed**, so no abstraction leak was found. (If one had been needed, the recorded response is to fix the generalization at the abstraction, not edit the engine for the pack.)
- **`src/packs/dogs/index.ts` mirrors `src/packs/fantasy/index.ts` exactly.** `import rawPack from './pack.json'` → `export const dogsPack = rawPack` (raw, **no cast**) → `export type DogsPack = Pack` for already-validated consumers → `export default dogsPack`. The sole path from raw JSON to a validated pack stays `loadPack`/`validatePack`; a cast would lie about malformed data and defeat the loud-failure contract.
- **The test adds a vocabulary-reuse "leak sentinel."** `src/packs/dogs/__tests__/dogs-pack.test.ts` (11 tests) asserts schema validity, the composition floor, the theme/identity (resolve-by-id, non-empty ids/names, one-char glyphs, positive class/monster `attack`), lossless JSON round-trip, and — the sentinel — every monster `behavior` is a key of the engine's exported `behaviorRegistry` and every item `effect.kind` is a kind the schema defines (`itemEffectSchema.options.map(o => o.shape.kind.value)`). A failure here means the pack leaked new vocabulary and the pack (not the engine) must be revised.
- **Pack selection remains a one-line UI import; no picker is added.** `src/ui/hooks/useGame.ts` still hardcodes `loadPack(fantasyPack)` (~lines 34 and 96). Running the dogs pack is documented as a one-line change to `import { dogsPack } from '../../packs/dogs'` + `loadPack(dogsPack)`. A user-facing pack picker stays out of scope — and, importantly, would still require zero engine support.

**Verification (recorded):** `git status --porcelain -- src/engine` → empty; `git diff --stat -- src/engine` → empty; `grep PACK_VERSION src/engine/schema/pack.ts` → `2`; `behaviorRegistry` reread → exactly `{chase, idle}`; effect union reread → exactly `heal`/`roll-heal`. `npm test` **409 passing** (was 398; +11), `npx tsc --noEmit` 0, `npm run lint` 0, `npx eslint src/engine --no-warn-ignored` 0, `npx vitest run src/packs/dogs` 11/11, all 10 task checkboxes ticked.

**Trade-offs:** The dogs pack runs only by a source-level import swap until a picker exists (acceptable — the pack's contract is loadability and engine-neutrality, proven by tests, not that the shipped app selects it). The leak sentinel reads the schema's kinds programmatically rather than hardcoding, so it stays correct if the schema legitimately gains a kind later — but that also means the sentinel alone would not fail on an engine *addition*; the empty-diff check plus the fixed `PACK_VERSION`/registry reread are what catch an engine edit.

**Revisit:** Never for the core claim — a second theme with an empty engine diff is now proven, and the boundary is an enforceable precedent. If a third pack ever appears to need a new behavior/effect/stat, treat it as a deliberate abstraction change with its own `PACK_VERSION` bump and spec delta, never as a pack-local workaround. If a picker is wanted, it is a `src/ui` change (list the available packs, swap the import) needing no engine support.

---

**Context:** The post-apply review of `core-gameplay-loop` (396 engine/pack/pure-UI tests, all gates green) probed the *seams the tests under-cover* and found two real defects in the `src/ui` client that no test exercises. Both are outside the engine and do not affect engine determinism, but they break shipped behavior: `createInitialState.ts` never copies the class `attack` onto the player entity, and the client save/resume cursor drifts so a second resume double-applies.

**Choice:** Record them as review findings to be fixed:
- **Player attack plumbing is incomplete.** `src/ui/state/createInitialState.ts:70-75` builds the player as `{ id, kind, pos, hp }` only; `attack` is never copied from `pack.class(PLAYER_CLASS_ID)`, so the player resolves melee via the `DEFAULT_ATTACK = 1` fallback instead of the class value (probe: player attack event `amount:1`, fighter `attack:4`). Design D2 and the combat spec require copying the class attack at spawn exactly as `populateLevel` copies a monster's. Fix: add `attack: pack.class(PLAYER_CLASS_ID).attack` to the player entity object (and add a `createInitialState` assertion on `player.attack`).
- **`resumeRunState` returns a stale `appliedCount`.** `src/ui/logic/save.ts:47-55` returns `{ state, commands: envelope.commands, appliedCount: envelope.appliedCount }`, but the `state` returned by `resumeRun` has already replayed `commands.slice(appliedCount)`. The state is therefore *fully applied* while the returned cursor still names the old split. `useGame.resume` stores that cursor, and the next auto-save/save serializes full state + stale cursor; a subsequent resume replays the already-applied remainder a second time (probe: 5 events vs the correct 3 for an uninterrupted run). Fix: after resume the cursor must be `envelope.commands.length` (the state now reflects the whole log); keep the full `commands` log.

**Trade-offs:** None — both are plain omissions/contract slips, not design choices. The `appliedCount` fix preserves the engine's remainder-replay semantics (which are correct) and only corrects the client-side cursor bookkeeping after a resume has already consumed the remainder.

**Revisit:** Never as a design question. If a future client keeps a partial-application cursor distinct from a fully-resumed state, add an explicit invariant test ("resume → save → resume is idempotent") so the cursor cannot drift silently.

---

## 2026-10-04 — Stage 6 (`core-gameplay-loop`) outcome

**Context:** Stage 6 turned the headless engine into a complete deterministic roguelike loop and needed its load-bearing choices recorded before Stage 7 (`second-theme-pack`) tests the content seam. All were settled across Phases 1–9 (design D1–D10) and are implemented, verified, and reviewed (pre-apply review NEEDS REVISION → findings fixed; final suite 398 tests).

**Choice:**
- **Pack v2 seam — content stays declarative data.** `packMonsterSchema` gains `behavior: string` + `attack: number` (positive), `packClassSchema` gains `attack: number`; `PACK_VERSION` bumps 1 → 2 (a `version: 1` pack is rejected naming the version). The **schema** (not just the loader) requires the fields, so every v1 fixture was upgraded. No functions/scripts/logic in the pack: the engine resolves `behavior` through `behaviorRegistry` and `attack` through the damage path; the pack supplies only a string id and a number. This is the deliberate seam event.
- **Named registries, never pack-supplied closures.** `combat.ts` mirrors `effects.ts`: `damageRegistry` keyed on a damage-kind id with exported `MELEE_DAMAGE_KIND = 'melee'` (no bare literal at the call site or in tests), `resolveDamage(kind, attacker, target, rng)`, `DEFAULT_ATTACK` fallback. `ai.ts`: `behaviorRegistry` (`chase`, `idle`) + `resolveBehavior(id)` with a **safe `idle` default** for an unknown id (never throws). Spawn copies the resolved `(attack, behavior)` onto the entity, so resolvers read plain entity fields — no pack lookup during resolution.
- **Total, pack-free occupancy classification.** `grid.ts` gains `isLiving` (numeric `hp`, not an item), `isFeature` (the `item: true` discriminator only), `isStairs(pos, stairs)` (the `level.stairs` tile; stairs are not an entity), and `attackTargetAt`. Every occupant falls into exactly one class: **living → attack** (bump-to-attack / explicit `attack`), **feature item / stairs tile → enter**, **any other non-living occupant (e.g. a content-free `rock`) → blocked**. Classification is a total function of `(entity fields, level.stairs)` with no content in scope.
- **D5 turn matrix (explicit outcome→advance rule).** Monsters advance only after a successful gameplay command — move-empty, bump-attack, attack-hit, pickup-success, use-item-success, descend-success — and not on blocked/noop/malformed/unknown or post-death. Implemented once as `advanceTurn` wrapping every branch of both entry points, reading the command's own events (`shouldAdvance`). Two non-obvious rows: **a successful `descend` does not advance the new level's monsters** (the old level's entities are atomically discarded and the freshly placed ones do not act on the placement turn — `level-changed` is explicitly non-advancing), and **post-death is terminal** (`status === 'dead'` → `noop('run-over')`, no monster step). The step re-reads status per monster, stopping the instant the player dies.
- **Save contract (`SAVE_VERSION` ≠ `PACK_VERSION`).** Envelope `{ version, state, commands, appliedCount }` where `state` is the **full current state**, `commands` the **full, never-truncated command log** (audit trail), and `appliedCount` the count of leading commands already reflected in `state`. `resumeRun` deserializes and replays **only `commands.slice(appliedCount)`** from the saved state (pack-aware with a pack, content-free otherwise — which noops `use-item`). There is no seed→initial-state primitive; "resume from the seed" means from the saved state, whose `rng.seed` is recorded. Unknown versions are rejected loudly with typed `UnknownSaveVersionError`. `src/engine/save.ts` is pure/no-I/O; the client owns storage.

**Trade-offs:** The pack v2 bump invalidates all v1 packs/fixtures (enumerated and upgraded in the same change — loud failure over silent field-absence); the schema requiring the fields means partial fixtures must carry them. Reading the advance rule from the command's own events is less explicit than a per-command table but cannot drift from the branch emitting them. The save envelope stores the full state *and* the full log (larger than a seed-only save) and its `appliedCount` can drift from a mismatched log — accepted because the contract is explicit and validated on load. A pack-free replay of a save whose remainder contains `use-item` or `descend` diverges from the pack-aware run (noop / unpopulated level); only the pack-aware path is the supported production path. The UI test stack has no React render tests, so the wiring is covered by `tsc`/lint and the pure-helper unit tests (a known, documented gap).

**Revisit:** If Stage 7 (`second-theme-pack`, the abstraction-leak test) forces *any* engine change, that is a seam defect and reopens the pack format/registries. If behavior ever needs to be optional (an "inert" default), re-open the schema requirement deliberately rather than weakening it ad hoc. If balance wants spawn counts content-owned, move the count bands into pack data — do not add a second source. If save size becomes a problem, the cursor design already supports a compact "state only, `appliedCount === commands.length`" mode. If a true pathfinder is wanted behind `chase`, swap `greedyStep`'s internals without changing `BehaviorResolver`. Otherwise never — these are the Stage-6 operating contracts.

---

## 2026-10-04 — Stage 6 Phase 9: UI is a thin dispatcher/persistence client; stairs compare by tile `pos`; auto-save is a turn-boundary effect

**Context:** Applying `core-gameplay-loop` Phase 9 (tasks 9.1–9.3) wires the UI to the Stage-6 engine surface (design D10). Three implementation choices were not fully pinned by the design: how `tileRender` learns a tile *is* the stairs (it only receives a `stairs` position, not its own coordinates), how keyboard attack maps to the direction-bearing `AttackCommand` without a stateful attack mode, and how the client persists the run (auto-save trigger + where storage lives) while keeping `useGame` the single engine call site.

**Choice:**
- **Stairs identify by tile position; `tileRender` gains both `pos` and `stairs`.** The spec pins "`tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position", so `stairs: Position` is the input; testing it requires the tile's own `pos: Position`, which `MapView` supplies from `forEachCoord`'s `pos`. On a visible tile precedence is entity > stairs > terrain (a monster/item on the stairs is what the player must see); the explored-but-not-visible rule governs stairs too (a remembered stairs tile shows flat terrain, unseen shows nothing). `STAIRS_GLYPH = '>'` is exported and never pack-resolved (terrain has no pack entry).
- **Attack is `Shift` + arrow via a second `commandForKey(key, shift)` parameter.** Rather than a stateful attack-mode toggle (which would couple `Dpad`/`ActionBar` to shared component state), the pure mapper takes an explicit `shift` boolean and returns `{type:'attack', direction}`; `useKeyboardInput` passes `event.shiftKey`. On-screen, `Dpad` gains a second row of four directional attack `Pressable`s. This keeps every control a stateless dispatcher and the mapper fully unit-testable.
- **Client persistence is a pure `src/ui/logic/save.ts` (`saveRun`/`resumeRunState`) behind an in-memory `useState` slot.** `useGame` still owns the single `applyCommandWithPack` call site; it now also owns the run's command log + `appliedCount` cursor in refs (appending must not re-render) and calls the pure helpers. `saveRun` wraps `serializeSave`; `resumeRunState` wraps `deserializeSave`+`resumeRun` and resets the log/cursor to the saved envelope. No external storage dependency is added — an in-memory string is sufficient for this stage and keeps `src/engine` I/O-free (design D8/D10).
- **Auto-save is a turn-boundary `useEffect` keyed on `startup.state`.** Every dispatched command produces a new state reference (a turn boundary), so the effect re-saves the full state + log + cursor without user action, reading the live state only (never mutating it). The initial state (empty log) is intentionally not saved, and `newRun`/`resume` reset the log first so a fresh run is not immediately persisted over the store.
- **New keys are split into commands vs. actions.** `commandForKey` covers move/attack/pickup/descend (all through `dispatch`); a separate `actionForKey` covers `s`/`r`/`n` → save/resume/new-run (client actions). Keeping them distinct means the command path stays exhaustive and the save path is explicit.
- **Game-over is a pure `isTerminal(status)` predicate + a stateless `GameOver` component.** `GameScreen` swaps the play view for `GameOver` when terminal, so a dead player is never shown a frozen map; "New run" calls the client's `newRun`, which builds fresh initial state (status `'playing'`) and clears the surface.

**Trade-offs:** Adding `pos` to `TileRenderInput` is one more field every `tileRender` call must supply (an omitted `pos` simply never matches stairs — safe); folding stairs into entity rendering was rejected because stairs are not an entity. `Shift`+arrow is a modifier convention that some keyboards/browsers may intercept less predictably than a plain key, but it needs no state and is covered by tests. The log/cursor refs are a second source of truth alongside `startup.state`; they are written only from `dispatch` and reset on `resume`/`newRun`, and `saveRun` reads them together with the live state so they cannot drift within a save. Auto-save writes to React state on every turn (one `setState` per command) — negligible at v1 and the price of "no user action" persistence. The in-memory store does not survive an app restart; swapping it for `AsyncStorage` is a one-slot change behind the same pure helpers.

**Revisit:** If a persistent store is wanted, back `saveStore` with `AsyncStorage`/an Expo storage module and make `save`/`resume` async behind the same `saveRun`/`resumeRunState` helpers — no engine change. If attack should not use Shift, change only `commandForKey`'s mapping (and the on-screen attack row if the interaction model changes). If a larger map needs a camera, `MapView` supplies `pos` per tile already. Otherwise never — thin dispatcher + pure persistence helpers is the Stage-6 UI contract.

---

## 2026-10-04 — Stage 6 Phase 8: save/load is a separate-version JSON envelope resumed by replaying only the remainder

**Context:** Applying `core-gameplay-loop` Phase 8 (tasks 8.1–8.2) implements `src/engine/save.ts` (design D8). D8 pinned "full JSON state + full command log + an `appliedCount` cursor, resume by replaying `commands.slice(appliedCount)`", but left open how the save-format version relates to `PACK_VERSION`, how shape validation and version rejection are expressed, and how the content-free vs. pack-aware replay split works without an ambient pack.

**Choice:**
- **`SAVE_VERSION` is a separate exported constant (= 1), distinct from `PACK_VERSION`.** The save envelope and the content-pack schema are independent formats at independent rates of change; coupling them would force a pack-format bump to invalidate saves, or vice versa.
- **The envelope is `{ version, state, commands, appliedCount }`**, produced by `serializeSave(state, commandLog, appliedCount)` (stable key order via `JSON.stringify`) and parsed by `deserializeSave(json)`. `state` is the **full current state** (not a seed, not an initial state) and `commands` is the **full, never-truncated log** (the audit trail).
- **`deserializeSave` rejects an unknown version loudly** with a typed `UnknownSaveVersionError` naming the offending and supported versions; envelope shape (`state` object, `commands` array, `appliedCount` an integer in `[0, commands.length]`) is validated defensively with a `TypeError`. The engine does not re-validate the whole state — the guarantees come from having produced it.
- **`replayCommands(state, commands, appliedCount, pack?)` replays only `commands.slice(appliedCount)`** from the saved state, choosing `applyCommandWithPack` when a pack is passed (so `use-item` resolves) and `applyCommand` otherwise (whose content-free path noops `use-item` as `unknown-command:use-item`). Each command resumes the RNG from the running state's `rng` field exactly as a live client does. `resumeRun(save, pack?) = replayCommands(deserializeSave(save), pack)`.
- **There is no seed→initial-state primitive.** Resume never rebuilds from the seed; "from the seed" means *from the saved state, whose `rng.seed` is recorded*. `createInitialState` stays in `src/ui`.
- **`src/engine/save.ts` is pure with no I/O** (no `AsyncStorage`, no `Date`, no `Math.random`) — the client owns storage. The barrel (`index.ts`) re-exports the save surface (`SAVE_VERSION`/`serializeSave`/`deserializeSave`/`replayCommands`/`resumeRun`/`UnknownSaveVersionError`/`SaveEnvelope`).

**Trade-offs:** Storing the full state plus the full log is larger than a seed-only save, and `appliedCount` can drift if a caller pairs a state with a mismatched log — both accepted because the contract is explicit and the determinism guarantee is worth the bytes; the cursor is validated against the log length on load. Pack-free replay of a save whose remainder contains `use-item` diverges from the pack-aware run (the item is not consumed and no effect applies), the same accepted asymmetry as pack-free `descend`/`use-item` in general; only the pack-aware path is the supported production path. `deserializeSave` returning `SaveEnvelope` (rather than a bespoke `{ state, commands, appliedCount }`) keeps `version` visible for callers/tests without a second type.

**Revisit:** If a save ever needs to be inspected/upgraded across a `SAVE_VERSION` bump, add a migration step keyed on `version` in `deserializeSave` rather than a permissive parse. If the full-state-plus-full-log envelope becomes a size problem, the cursor design already supports a "state only, `appliedCount === commands.length`" compact mode — but keep the log for replay/audit unless a requirement drops it. Otherwise never — separate save version + remainder replay is the operating persistence model.

---

## 2026-10-04 — Stage 6 Phase 6: pickup is a parameterless command matched structurally; `use-item` carry gates consumption, not resolution

**Context:** Applying `core-gameplay-loop` Phase 6 (tasks 6.1–6.2) implements the real `pickup` command (replacing the Phase-5 structural shim) and extends the Stage-2 `use-item` command so a successful use consumes one carried instance. Two mechanics needed a fixed choice: how a parameterless command validates its own malformed-parameter case, and exactly what "consume on use" means for ids the player does not carry.

**Choice:**
- **`PickupCommand { type: 'pickup' }` is a real `Command` union member but is still matched structurally before the `switch`** in both entry points, because the declared type carries no parameters and a `case` alone could not reject extra keys. The shared `resolvePickup(state, rng, command)` helper does the malformed check (`Object.keys(record).filter(k => k !== 'type').length > 0` → `noop('malformed-command')`) and routes the well-formed command through `advanceTurn` to `applyPickup`. Success emits `item-picked-up` (added to `ADVANCING_EVENT_TYPES`, so it advances monsters per D5); an empty tile is `noop('nothing-to-pick-up')` and does not.
- **`applyPickup` finds the feature item by scanning for `isFeature` on the player's tile** (not `entityAt`, whose first-match semantics return the player when a player and item share a tile). The item discriminator — not the pack `kind` — decides pickability, so the command stays pack-free; only the removed entity's `kind` string is appended to `carriedItemIds`.
- **Carry gates consumption, not resolution** (design D7). `applyUseItem` removes exactly one instance via `state.carriedItemIds.indexOf(itemId)` **only when present**; a non-carried id still resolves the effect and consumes nothing, preserving the Stage-2 use-by-id behavior. `StateOverrides` gained an optional `carriedItemIds` so both `pickup` (append) and `use-item` (remove-one) write the list through the one `commit` path.

**Trade-offs:** Keeping the structural pre-`switch` guard means the `switch`'s `pickup` arm is unreachable (the union member exists but the guard returns first), so the switch is not exhaustively covering `pickup` — acceptable because the default still handles genuinely unknown types and the guard is the single malformed-parameter boundary. Scanning entities linearly per pickup is O(n) on a small entities array; no index needed at v1 scale. Consuming the *first* matching index means a duplicate carry shrinks by exactly one (spec: "exactly one instance"), not by kind-count.

**Revisit:** If `pickup` ever gains a declared parameter (e.g. a direction), move the malformed check into a `case 'pickup':` arm and drop the structural guard; if a second pickable-item tile interaction appears, promote the tile scan into a shared `featureAt(entities, pos)` helper (used by both pickup and move's feature-enter check) rather than duplicating the predicate. Otherwise never — explicit pickup + carry-gated consumption is the operating item loop.

---

## 2026-10-04 — Stage 6 Phase 5: the turn step is a single `advanceTurn` wrapper keyed on the command's own events

**Context:** Applying `core-gameplay-loop` Phase 5 (tasks 5.1–5.3) completes combat (`attack` command + bump-to-attack + death), enforces permadeath, and wires the Phase-4 `advanceMonsters` step into the command loop per D5's outcome→advance matrix. The design pinned the matrix and "stop when the player dies" but left two mechanics open: how the two entry points share the turn step without duplicating the rule, and how player death caused by a *monster* during the step gets finalized (Phase 4's `advanceMonsters` only lowers HP; it does not write `status`, remove the player, or emit `player-died`).

**Choice:**
- **One `advanceTurn(state, rng, resolve)` wrapper wraps every branch of both entry points.** `resolve()` runs the recognized command's branch and returns its `CommandResult`; the wrapper applies the terminal-permadeath gate (`state.status === 'dead'` → `noop('run-over')`), decides whether to advance, runs `advanceMonsters` at most once, settles any player death, and returns the combined event stream. Both `applyCommand` and `applyCommandWithPack` delegate to it, so the matrix and post-death rule live in exactly one place (Phase 6/7 add `pickup`/stairs gating to a branch, not to the wrapper).
- **The advance decision is read from the command's own events**, not a per-command enum: `shouldAdvance(events, status)` is true iff the run is still playing, no `player-died` is present, and at least one of `moved`/`attacked`/`item-used`/`level-changed`/`death` is present. This encodes every D5 row (blocked/noop/malformed carry none; a monster's lethal `attacked` against the player is excluded by the `player-died` guard; a player-killed monster's `death` advances and the step then skips the removed monster).
- **Player death is settled after the step, by the wrapper.** `advanceMonsters` already stops mid-step the moment the working player's HP ≤ 0 (Phase-4 `effectiveStatus`), but the wrapper owns the world write: it detects a missing or HP-≤-0 player in the post-step entities, removes the player, sets `status = 'dead'`, and appends `player-died`. The explicit `resolveAttack` path settles the symmetric case (an attack that targets the player) inline.
- **The returned `events` is `commandResult.events.concat(turnEvents)` while `commit` receives only `turnEvents`.** `commandResult.state.events` already contains the player's events, so committing the full list would double-append them; the wrapper separates "what the state log appends" from "what this command reports".
- **bump-to-attack is total and pack-free:** `move` classifies the target as living (`attackTargetAt` → attack), feature (`isFeature(occupant)` or `isStairs(target, level.stairs)` → enter), else `blocked`. The explicit `attack` command noops on anything non-living (including self, which is structurally impossible with a cardinal direction). `death`/`player-died` event factories + `AttackCommand`/`DeathEvent`/`PlayerDiedEvent` types are additive; the public barrel re-exports the combat + AI surface.
- **`pickup` is matched structurally until Phase 6 adds the union member** (a `case 'pickup'` fails `tsc` TS2678). Malformed pickup (extra keys) → `noop('malformed-command')`; well-formed-but-unimplemented → `noop('unknown-command:pickup')`. Phase 6 deletes the shim.

**Trade-offs:** Reading the matrix from events is less explicit than a per-command table, but it is the same information and cannot drift from the branch that emits the events; the trade is that a future command must emit an event in `ADVANCING_EVENT_TYPES` to advance. The wrapper allocates a combined event array per turn (fine at v1). `resolveAttack` and the wrapper can both settle player death (an explicit attack targeting the player, vs. a monster's counter-attack during the step) — the two paths are disjoint in practice (a player's own attack never targets the player) and each is covered by a test. The e2e's cross-seed event-equality assertion had to be dropped (mandated): with monsters acting, streams are seed-divergent by design.

**Revisit:** If a future command needs a bespoke advance rule (e.g. "attack-miss still advances"), replace `shouldAdvance`'s event-set check with an explicit per-outcome classification — the wrapper is the only site. If `pickup`/descend gating (Phases 6/7) needs pre-dispatch parameter validation, add it in the branch's `resolve` closure, not the wrapper. Otherwise never — this is the Stage-6 turn-loop contract.

---

## 2026-10-04 — Stage 6 Phase 4: AI is a named registry + a pure per-turn step; the damage seam is shipped final-shaped

**Context:** Applying `core-gameplay-loop` Phase 4 (tasks 4.1–4.2) adds `src/engine/ai.ts` (behavior registry + per-turn advance) and its tests. Two implementation details were not fully pinned by design D3/D5: (a) how the AI attacks without `combat.ts` existing yet — Phase 5 owns it — and (b) how the per-turn step re-reads `status` and stops on player death when Phase 4 has no world-level death writer.

**Choice:**
- **`combat.ts` ships now, final-shaped, as the least-churn Phase-4 seam.** Rather than a throwaway placeholder, `src/engine/combat.ts` implements exactly D2's contract: `MELEE_DAMAGE_KIND = 'melee'`, `damageRegistry: Record<string, DamageResolver>`, `resolveDamage(kind, attacker, target, rng) -> { targetAfter, applied } | undefined`, plus `DEFAULT_ATTACK` and `entityHp`. The resolver reads `attacker.attack` (copied onto the entity at spawn) with a `DEFAULT_ATTACK` fallback and draws `randInt(rng, 1, attack)`. Phase 5 adds only the `death`/`player-died` event factories and the world-level wiring (entity removal, `status = 'dead'`) — it does **not** change this signature or the constant. `ai.ts` therefore calls `resolveDamage(MELEE_DAMAGE_KIND, ...)` exactly as the final call site will, so no signal churns.
- **`AttackedEvent` (`type: 'attacked'`) + an `attacked(...)` factory in `events.ts`.** The combat spec requires an event reporting attacker/target/damage, so Phase 4 needed one. It is introduced final-shaped (attacker id, target id, amount, kind) and the `GameEvent` union is widened; Phase 5's player attack path reuses it instead of inventing a second shape. This is additive and JSON-clean.
- **`BehaviorResolver = (state, monster, rng) -> { entities, events }`**, a pure function of serializable inputs. `behaviorRegistry` registers `chase` and `idle`; `resolveBehavior(unknown)` returns the safe `idle` resolver — never a throw. `chase` pursues when the player is visible (`computeFov` marks the player's tile) **or** within `DEFAULT_BEHAVIOR_RANGE` (Chebyshev 8), takes one deterministic greedy cardinal step over passable, unoccupied, strictly-closer tiles (fixed N/S/W/E tie-break order), and attacks when adjacent. `idle` is inert.
- **`advanceMonsters(state, rng) -> { entities, events }`** is the per-turn step, deliberately **not** wired into `commands.ts` (Phase 5 does that per D5's outcome→advance matrix). It snapshots the acting order from the input `entities` (so removal cannot shift turns), re-resolves each id against the working list, skips monsters that are no longer alive (hp ≤ 0 or removed), and re-reads the effective status before each act, breaking the moment the player is dead.
- **Death re-read without a permadeath writer.** `effectiveStatus(status, entities, playerId)` returns `'dead'` if the persisted status is `'dead'` **or** the player is missing **or** the working player's HP ≤ 0. This makes "stop the moment the player dies mid-step" testable now; when Phase 5 writes the real `status`, the check is already correct and the signature is unchanged.
- **Chaining monsters within one step passes each resolver an intermediate `GameState`** (`{ ...state, entities }` carrying the entities produced so far). Behaviors are pure functions of a `GameState`; passing the original state would let the next resolver discard an earlier monster's move. The input `state` is never mutated.

**Trade-offs:** Shipping `combat.ts` in Phase 4 front-loads a little of Phase 5's file, but it is the final shape and avoids a placeholder that tests would have to churn against; the alternative (AI-local inline damage) would duplicate the registry seam and force Phase 5 to rewrite the AI call site. `DEFAULT_BEHAVIOR_RANGE` is range-only awareness (a close occluded player is still pursued), not pathfinding — a greedy step can stall against a concave wall, which is acceptable at v1 and explicitly not "pass through" behavior. Treating HP ≤ 0 as a death signal in `effectiveStatus` is a small anticipation of Phase 5; it is additive and cannot misfire once the real status is written. `advanceMonsters` allocates one intermediate state object per acting monster (fine at v1 counts).

**Revisit:** If a behavior ever needs to see a *removed* monster's death within the same step, `advanceMonsters` already re-resolves per id against the working list — extend there, not in a behavior. If balance wants a true pathfinder (A*/flow field) behind `chase`, swap `greedyStep`'s internals without changing `BehaviorResolver`. If Phase 5 wants the attack event named differently, that is a rename of one factory/type, not a structural change. Otherwise never — this is the Phase-4 AI/damage seam.

---

**Context:** Applying `core-gameplay-loop` Phase 3 (tasks 3.1–3.2) replaces the Phase-1 `findStairs` placeholder with an RNG-drawn stairs tile and adds the pure pack-driven `populateLevel`. The design pinned *that* both draw from the shared `Rng` and iterate candidates row-major, but left two implementation details open: how the stairs candidate is selected, and how many monsters/items spawn and how their tiles are chosen without overlap.

**Choice:**
- **Stairs = a seeded index into the row-major list of passable tiles excluding spawn.** `findStairs(rng, grid, spawn)` gathers candidates in row-major order, then `randInt(rng, 0, candidates.length - 1)`. On a degenerate level with no distinct candidate (e.g. a 3×3 whose only floor tile is the spawn) it falls back to `spawn` and **draws nothing**, so a degenerate level does not perturb the caller's shared RNG stream. This replaces the deterministic last-floor-tile placeholder and is a pure function of `(seed, depth, dimensions)`.
- **Population count bounds are engine mechanics, not content.** `populateLevel` draws a monster count in `[2,4]` then an item count in `[1,3]` (fixed order, before tile selection), then draws each kind by seeded index into the pack's stable `monsters`/`items` arrays. Counts are engine-owned spawn mechanics; kinds are always pack data (design D9 seam preserved).
- **Tile selection = seeded index into the remaining candidate list, then `splice` it out.** Candidates are gathered once in row-major order (skipping non-passable/spawn/stairs); each placement draws an index into *remaining* candidates and removes it, so overlap is impossible by construction. Terrain is never touched, so connectivity is unaffected. Placements carry their resolved role (`monster`/`item` + entry) explicitly rather than re-deriving it from the id, since the loader only rejects duplicate ids *within* a collection.
- **Entity ids are stable and deterministic** (`monster-0`, `item-0`, …); monsters copy resolved `hp`/`behavior`/`attack`, items carry `item: true`. `LevelPopulation = { entities }` returns monsters + items only — stairs stay on `generated.level.stairs`.

**Trade-offs:** The fixed count bands are a balance-flavored engine constant; if balance should be content-owned, they move to the pack later (the design explicitly says content owns balance, engine owns mechanics — spawn *counts* were judged mechanics here). A seeded index into a shrinking candidate list is O(n) per placement via `splice`; fine at 40×30 (≤7 placements). The role-carrying `Placement` union is slightly more code than re-scanning by id, but immune to cross-collection id collisions.

**Revisit:** If spawn counts should be pack-declared (or depth-scaled), move the bands into pack data with a schema field — do not hardcode a second source. If `populateLevel` ever needs to place without a preceding `generateLevel`, take an explicit RNG position rather than re-seeding (per the earlier shared-`Rng` decision). Otherwise never — this is the Phase-3 placement contract.

---

## 2026-10-04 — Stage 6 Phase 2: pack v2 requires `behavior`/`attack` (schema, not loader); loader views flow by `z.infer`

**Context:** Applying `core-gameplay-loop` Phase 2 (tasks 2.1–2.2) makes the pack format declarative for combat/AI: monster `behavior` (named id) + `attack`, class `attack`. Two choices were available: enforce the fields only in the loader (composition floor) or in the schema, and whether to add a hand-written `LoadedPack` enumeration helper.

**Choice:**
- **The schema requires the new fields; `PACK_VERSION` bumps 1 → 2.** `packMonsterSchema` gains `behavior: z.string().min(1)` and `attack: z.number()`, with positive-number refinement on the strict form; `packClassSchema` gains `attack: z.number()`, positive on the strict form. Because the *schema* enforces presence (not just the loader), any pack that sets `version: PACK_VERSION` (2) but omits a field fails validation regardless of declared version — matching the `pack-format` spec. `PACK_VERSION` is 2; the existing `superRefine`-based version check still names the received version (a `version: 1` pack is rejected naming `1`).
- **`LoadedPack` exposes the new fields by inference, not a hand-written type.** `class(id): PackClass` / `monster(id): PackMonster` where `PackClass`/`PackMonster` are `z.infer` of the strict schemas, so `behavior`/`attack` flow automatically; no `LoadedPack` shape change was needed.
- **No new enumeration abstraction for stable-order selection.** `pack.pack.monsters`/`pack.pack.items` are already the declared arrays in stable order; seeded selection indexes them directly. The loader test pins this by selecting the same index across two independent `loadPack` calls.

**Trade-offs:** The version bump breaks every v1 fixture in the same change (enumerated and upgraded: `pack-schema`, `pack-loader`, `item-use`, `descend`, `index-surface` via `fantasyPack`, and the shipped `fantasy/pack.json`) — desired loud failure over silent field-absence. Requiring `behavior`/`attack` at the schema layer (rather than only the loader) means a partial fixture must still carry them; the schema stays permissive on collection *counts* (loader owns the floor), consistent with Stage 2.

**Revisit:** If a future pack format makes behavior optional (e.g. an "inert" default), re-open the schema requirement deliberately rather than weakening it ad hoc. If stable-order selection ever needs filtering (e.g. only spawnable monsters), add an explicit loader helper then — not before. Otherwise never; this is the Stage-6 pack-format seam.

---

## 2026-10-04 — Stage 6 Phase 1: required `Level.stairs` forces a generation placeholder; occupancy is total and pack-free

**Context:** Applying `core-gameplay-loop` Phase 1 (tasks 1.1–1.2) adds required `GameState.status`/`carriedItemIds`, required `Level.stairs`, and an explicit `Entity.item` discriminator, plus pure occupancy predicates in `grid.ts`. Two implementation choices were not fully pinned by the design: where `Level.stairs` gets its value in this phase, and the exact precedence rules among the occupancy predicates.

**Choice:**
- **`generateBspLevel` sets `level.stairs` now, via a deterministic placeholder.** A non-optional `Level.stairs` makes every `level: { depth, spawn }` construction a type error — including `level.ts` itself and `commands.ts` `applyDescend`'s copy of `generated.level`. Added a documented `findStairs(grid, spawn)` (last passable tile in row-major order; falls back to `spawn` on a degenerate single-floor-tile level) so the phase stays additive and no type is weakened. Phase 3 (task 3.1) replaces it with an RNG-drawn stairs distinct from spawn; `GeneratedLevel`'s shape stays `{level, grid}`.
- **`isLiving` gives the item discriminator precedence over `hp`.** An entity with `item === true` is never living even if it also carries a numeric `hp`; `isLiving(entity) = entity.item !== true && typeof entity.hp === 'number'`. This keeps the three classes mutually exclusive and makes classification total (living / feature / other-non-living-blocked).
- **`attackTargetAt` is `entityAt` + `isLiving`,** returning `undefined` for empty, feature, and blocked-class occupants alike — the caller's enter/blocked branches handle the latter two.
- **The predicates are exported from `@engine`** so later phases and the UI classify occupancy through the public surface (Phase 1's only barrel change).

**Trade-offs:** The `findStairs` placeholder duplicates a value Phase 3 will recompute from the RNG; it is confined to one function with a "Phase 3 replaces this" note, and it is deterministic so determinism/JSON tests are unaffected. Precedence on the discriminator means an item that somehow carries `hp` is a feature, not a target — intended, since items are never combatants.

**Revisit:** Nothing here should be revisited; Phase 3 subsumes `findStairs`. If occupancy ever needs a fourth class (e.g. a pushable-occupant), re-open D4 rather than adding a predicate ad hoc.

---

## 2026-10-04 — Stage 6 planning fix round: save envelope gains an `appliedCount` cursor; melee-kind constant; pack-free classification signatures

**Context:** The post-revision re-review of `core-gameplay-loop` found one new Blocker and minor wording gaps. The Blocker: D8/spec/proposal/task 8.1 described a save as `{ version, state, commands }` where `state` was the **full current state** and `commands` the **full command log**, AND resume "replayed the log from that state" — which would re-apply every already-applied command a second time and break "resumed run matches uninterrupted run". A heading said "remaining log" while the requirement said "full log", and the envelope had no cursor to distinguish the applied prefix from the remainder. The minors: `isFeature(entity)` was defined using `level.stairs` it cannot see; the item-use spec could be read as gating *resolution* (not just consumption) on carrying; `populateLevel`'s return listed `stairs` it does not draw; the pack-loader spec omitted the class-`attack` missing-field case; and the melee damage kind was a bare literal.

**Choice:**
- **Save envelope = full current state + full command log + `appliedCount` cursor.** `{ version: SAVE_VERSION, state: <full current state>, commands: <full command log>, appliedCount: <number of leading commands already reflected in state> }`. `deserializeSave(json)` validates `version` (rejecting unknown versions loudly) and returns `{ state, commands, appliedCount }`. `replayCommands(state, commands, appliedCount, pack?)` applies **only `commands.slice(appliedCount)`** (the remainder) from the saved state — pack-aware with a pack, content-free (noops `use-item`) without one. `resumeRun(save, pack?)` = deserialize → replay remainder. A mid-run save has `appliedCount < commands.length`; a fully-applied save has `appliedCount === commands.length` (replay is a no-op). The log is never truncated (audit trail preserved) and the engine never rebuilds initial state from a seed. This is **option (b)**: it preserves both the full audit trail and the proven *mid-run state + remaining commands* pattern in `e2e-seeded.test.ts` (`MIXED_SEQUENCE.slice(SPLIT)` applied to the deserialized mid-run state), and it cannot double-apply.
- **`MELEE_DAMAGE_KIND = 'melee'`** is an exported constant used at the attack call site (`resolveDamage(MELEE_DAMAGE_KIND, ...)`) and in tests, instead of a bare `'melee'` literal (D2 / tasks 5.1).
- **Classification signatures are explicit and pack-free.** `isFeature(entity)` is an **item-discriminator-only** predicate (`item: true`); stairs are checked by a separate **`isStairs(pos, stairs)`** predicate called in `applyMove` (stairs are not an entity, so `isFeature` cannot see `level.stairs`). D2's bump-to-attack branch names both checks. `isLiving(entity)` keys off `hp`; any other non-living occupant is `blocked`.
- **`populateLevel(generated, pack, rng) -> { entities }`** returns monsters + items only; stairs are drawn during generation and live on `generated.level.stairs`, so population neither draws nor returns them.
- **Carry gates consumption, not resolution** (item-use): using a non-carried id still resolves and applies the effect and consumes nothing from `carriedItemIds` (keeps Stage-2 use-by-id behavior/tests valid).
- **Pack-loader requires a class `attack`**: a class omitting `attack` fails loading with an actionable error, matching `pack-format`.

**Trade-offs:** The `appliedCount` cursor is one more field every save must carry and keep coherent with its log; the alternative (initial-state + full-log replay) is simpler per save but cannot express a mid-run state without a seed→initial-state primitive the engine does not own, and discards the current state. A stale `appliedCount` (log and cursor drifting apart) would mis-replay, so `serializeSave` takes both the log and the cursor from the same call site. The `isStairs` split adds a second call in `applyMove` rather than one combined predicate, in exchange for `isFeature` staying a clean entity-only discriminator.

**Revisit:** If a future packed/multi-level format makes the full-state payload a size problem, revisit (e.g. store a checkpoint + tail log) without changing the `appliedCount` replay semantics. If `populateLevel` ever needs to run without a preceding `generateLevel`, take an explicit `Rng` position parameter rather than re-seeding. If stairs ever become an entity (not just a `Level.stairs` position), fold the `isStairs` check back into a unified classifier. Otherwise never — these are the Stage-6 save-envelope and classification contracts.

---

## 2026-10-04 — Stage 6 planning: `populateLevel` shares one `Rng`; save/load replays full state + full log

**Context:** The pre-apply planning review of `core-gameplay-loop` (NEEDS REVISION: 3 blockers, 5 majors, 4 minors) found two conventions under-specified that would otherwise be re-decided ad hoc during apply — (a) how level generation, population, and stairs placement share the injected RNG (D6 said `populateLevel(generated, pack, rng)` but never pinned that it uses the *same* `Rng` instance `generateLevel` consumed, nor the draw order), and (b) what a "save" is and how resume works (D8/spec said "resume from the seed", but there is no engine seed→initial-state primitive — `createInitialState` lives in `src/ui`). Both are determinism-critical and costly to reverse once monsters/items exist.

**Choice:**
- **One shared `Rng`, captured once per step.** Generation, population, and stairs placement all draw from **one** `Rng` created from `state.rng` (or resumed via `rngFromState(state.rng)`); `state.rng` is written back **after** all three complete (`rngToState`). Never re-create an `Rng` mid-step — that would reset the stream and break replay. `populateLevel(generated, pack, rng)` receives the same instance `generateLevel` just consumed. Placement iterates candidate tiles **row-major** (`y*width+x`), skipping non-passable, spawn, stairs, and already-occupied tiles; the count and kinds are seeded draws decided before that pass. Call sites: `createInitialState` (src/ui/state/createInitialState.ts) and the `descend` branch of `commands.ts`. `GeneratedLevel`'s shape stays `{level, grid}`; `Level` gains `stairs`, so `generateBspLevel` sets `generated.level.stairs` (no `{level,grid,spawns}` extension).
- **Save = full state + full log; resume = deserialize then replay from the saved state.** The envelope is `{ version: SAVE_VERSION, state, commands }` where `state` is the **full current state** and `commands` the **full command log**. `resumeRun(save, pack?)` = `deserializeSave` → `replayCommands(state, commands, pack?)` **from the saved state** (pack-aware entry point with a pack; the content-free `applyCommand` noops `use-item` without one). The engine does **not** rebuild initial state from a seed; "from the seed" in the proposal/specs means from the saved state whose `rng.seed` is recorded. `deserializeSave` rejects an unknown `SAVE_VERSION` loudly.

**Trade-offs:** A single shared stream means population cannot be re-run independently of generation without re-deriving the stream position (correct but less flexible); the alternative — separate `Rng`s per step — would make a mid-step resume diverge. Storing the **full** state rather than only the seed duplicates data but is required because the engine has no seed→state primitive and keeps the UI thin (no client-side rebuild). Row-major placement makes the exact tile draw a spec-visible convention rather than an implementation detail.

**Revisit:** If a future packed/multi-level format makes the full-state payload a size problem, revisit (e.g. store a checkpoint + tail log) without changing the replay semantics. If `populateLevel` ever needs to run without a preceding `generateLevel`, take an explicit `Rng` position parameter rather than re-seeding. Otherwise never — these are the Stage-6 determinism/save contracts.

> **Superseded (same day):** the envelope in this entry (`{ version, state, commands }`, "full log from the saved state") was corrected to `{ version, state, commands, appliedCount }` with resume replaying only `commands.slice(appliedCount)`. See the newer entry "Stage 6 planning fix round" above for the operative contract.

---

## 2026-10-04 — Stage 5 (`expo-glyph-renderer`) outcome

**Context:** Stage 5 turned the headless engine into a playable phone app and needed its UI choices locked as the operating model for later stages. All were settled across Phases 1–5 (design D1–D8), applied, reviewed (pre-apply review NEEDS REVISION → 12 findings fixed; post-apply review PASS WITH NOTES), and verified. The engine boundary held: `src/engine/**` and `src/packs/**` were untouched.

**Choice:**
- **App shell is Expo Router with routes under `src/app`.** `package.json` `main` → `expo-router/entry`; `app.json` gains `scheme: "crawl"` + `experiments.typedRoutes: true`; `src/app/_layout.tsx` wraps `<Slot/>` in `<GameProvider>` inside `<SafeAreaProvider>`; `src/app/index.tsx` renders `<GameScreen/>`. The dead `App.tsx`/`index.ts` (`registerRootComponent`) were deleted in the same change.
- **Renderer is memoized RN `<Text>` tiles in a fixed flex grid — no Skia/canvas.** Each of the 1,200 (40×30) cells is a `React.memo`'d `Tile` with primitive props, laid out flex-wrap; `MapView` derives FOV per render (`computeFov` in a `useMemo` keyed `[state, player]`) and reads `state.explored` directly.
- **Input is an on-screen D-pad + Descend, with web-only keyboard.** `Dpad`/`ActionBar` are stateless pure dispatchers reading `useGameContext()`; `useKeyboardInput` is gated by `Platform.OS !== 'web'` (never touches `window` on native) and factors the mapping into the pure `commandForKey(key)`.
- **Client state is a React reducer/context holding `GameState` + `LoadedPack`.** `useGame` performs one lazy startup load (`loadPack(fantasyPack)` then `createInitialState(seed, pack)` in a try/catch, `error` as a value); `dispatch` runs `applyCommandWithPack(state, command, rngFromState(state.rng), pack)` and replaces state immutably. `useGame.ts` is the single production call site. The engine is untouched.
- **Visibility is derived (FOV) / explored is stored.** The renderer computes visibility each render; `state.explored` is the persistent monotonic mask OR-ed at startup and on `descend` via `exploreInto`.
- **Every pack glyph lookup is fallible with a safe `?` fallback.** `entityGlyph` tries `pack.class`→`monster`→`item` each in a try/catch and returns `UNKNOWN_GLYPH = '?'` on a miss (the loader throws `UnknownContentIdError`), so an unknown kind renders, never crashes. Unseen tiles short-circuit to a blank glyph so occupancy cannot leak.
- **Bare `@engine` path added to `tsconfig.json` for both tsc and Vitest.** `"@engine": ["./src/engine/index.ts"]` fixes the TS2307 the `"@engine/*"` glob could not; `vite-tsconfig-paths` reads the same `paths`, so no separate Vitest alias.

**Trade-offs:** Trying all three collections per entity does up to three `Map` lookups for an unknown kind (acceptable at 1,200 cells, removed from the hot path by memoizing the resolved cell array) and assumes ids are unique across collections (the loader only rejects duplicates *within* a collection; no current pack collides). `useGameContext()` throws without a provider — deliberate fail-fast. The fixed 40×30 grid has no camera; larger maps would not fit. Web is not a supported target this stage (needs `react-native-web`/`react-dom` + a web bundler); the keyboard is a dev convenience. `commandForKey` is exported but untested (no DOM test stack).

**Revisit:** If tile count grows or per-input re-render cost is measured, revisit the memoization strategy or virtualize; if a camera/scrolling is needed for larger maps, add it to `MapView` without touching state. If the pack schema ever permits cross-collection id collisions, `entityGlyph` needs an explicit `kind → collection` hint instead of trial lookup. If a React render-test stack or DOM env lands, assert `commandForKey` and the native no-op directly; if the web target becomes required, add the web deps and a bundler first. Otherwise never — this is the Stage-5 renderer/input/state contract.

---


**Context:** Phase 4 of `expo-glyph-renderer` (tasks 4.1–4.3) adds the input layer: on-screen D-pad + Descend plus a web-only keyboard hook. Design D3 fixes the shape (four direction buttons → `move`, one button → `descend`, keyboard as a web dev convenience, every path through the hook's `dispatch`). Three sub-choices were open: how the components read the dispatcher, how the keyboard mapping is factored, and how the hook avoids touching `window` on native.

**Choice:**
- **`Dpad`/`ActionBar` consume `useGameContext()` directly and are stateless.** Each is a pure dispatcher: `onPress={() => dispatch({ type: 'move', direction })}` / `dispatch({ type: 'descend' })`. No local state, no `GameState` access, no engine import beyond the `Direction`/`Command` types. This keeps every input path funneled through the one production `dispatch` in `useGame` (the container/presentational split was unnecessary for four buttons).
- **Keyboard mapping is a pure exported helper `commandForKey(key)`.** It maps `ArrowUp/Down/Right/Left` → the four directions and `Enter`/`>` → descend, returning `Command | undefined`. Factoring the mapping out of the effect makes it scannable and unit-testable without a DOM; the hook only wires `keydown` → `commandForKey` → `dispatch`.
- **Web gate is `Platform.OS !== 'web'` with an early `return undefined` from the effect.** `window` is referenced only inside the web branch, so a native bundle never evaluates it (`useKeyboardInput` cannot crash off-web). The handler calls `event.preventDefault()` so arrows don't scroll and Enter doesn't submit.
- **Both buttons call `accessibilityRole="button"` + `accessibilityLabel`** (arrow glyphs/`Descend` are not self-describing). Press feedback uses the `style={({ pressed }) => [...]}` callback form.

**Trade-offs:** `useGameContext()` throws without a provider, so Dpad/ActionBar inherit the same fail-fast behavior as Hud/MapView — deliberate. Reading context twice (screen + each child) is cheap. `commandForKey` is exported but untested this phase (no DOM test stack; the APK run covers interaction) — the pure helper is ready for a test when one is added.

**Revisit:** If a React render-test stack or a DOM test environment lands, assert `commandForKey` and the effect's native no-op directly. If input needs remapping/multiple keymaps, promote `ARROW_DIRECTIONS`/`DESCEND_KEYS` to config. Otherwise never — dispatch-only components + a web-gated keyboard hook are the operating input model.

---

## 2026-10-04 — Client state model: one lazy startup load, error-as-value, `useGameContext` guard

**Context:** Phase 2 of `expo-glyph-renderer` (tasks 2.1–2.4) builds the client state model (`createInitialState`, `useGame`, `GameProvider`). Design D4/D7 fixes the essential contract (pack loads first, player seeded from `pack.class('fighter')`, RNG captured after `generateLevel`, dispatch via `applyCommandWithPack` deriving the RNG from `state.rng`), but three sub-choices were left open: how the hook represents a recoverable pack-load failure, how many times the startup load runs, and what the context consumer does without a provider.

**Choice:**
- **`createInitialState` owns all initial-state assembly.** Constants `PLAYER_CLASS_ID = 'fighter'` and `PLAYER_ID = 'player'` are exported (they are the renderer's lookup keys too), while `LEVEL_WIDTH/HEIGHT/DEPTH` stay module-private (they are an implementation detail matching the engine's descend size; nothing outside needs them). Imports only from `@engine` and receives the pack as a parameter.
- **`useGame` performs one lazy startup load and stores an `{ state?, pack?, error? }` result.** A single `useState(() => loadGame(seed))` initializer calls `loadPack(fantasyPack)` then `createInitialState(seed, pack)` in a try/catch, so the pack is loaded and the level generated **exactly once** and any throw becomes a value. An earlier draft used two `useState` initializers (one for game, one for error), which loaded the pack and generated the level twice and could in principle disagree; consolidated to one.
- **`GameError = Error`.** `loadPack` throws `PackLoadError`/`UnknownContentIdError`, both `Error` subclasses, and a non-`Error` throw is wrapped with `new Error(String(caught))`. The alias documents the two typed errors in its JSDoc rather than a three-way union, keeping the consumer's render path (`error.message`) valid for every case.
- **`dispatch` never calls `Math.random`/`Date`; it derives `rngFromState(current.state.rng)` per command** and replaces only `state` in the startup result, leaving `pack`/`error` stable. This is the single production call site of `applyCommandWithPack` in `src/ui` (the test file calls it only to assert the immutable-dispatch contract).
- **`GameProvider` exposes a typed context and `useGameContext()` throws** when called outside a provider, so a missing provider fails immediately at the misuse site instead of yielding `undefined` and failing later.

**Trade-offs:** `useGameContext()` throwing means a component rendered outside the provider crashes its render rather than degrading — deliberate, since a missing provider is a programming error, not a runtime state. Holding `error` inside the same startup object means `dispatch` carries it through on every update (`{ ...current, state }`), a tiny per-dispatch spread cost. `state`/`pack` are `undefined` in the error case, so every consumer must narrow before use; the screen renders `error` first, which is the intended D7 flow.

**Revisit:** If seed selection or multiple runs land, `useGame` needs a `reset(seed)`/`newGame` action rather than a single immutable startup load. If a React render-test stack is added, the provider/consumer split can be tested directly. Otherwise never — the lazy-load + error-as-value shape is the operating model for this stage.

---

## 2026-10-04 — APK pipeline: local Gradle on the runner, debug-keystore signing, tag + dispatch triggers

**Context:** After Stage 3 the user queued a build/CI change to produce an installable Android APK before further engine work. Three choices were locked with the user before writing the change: how to build (EAS cloud vs. local Gradle), how to sign, and how to trigger. The change is tooling/CI only, so it carries `skip_specs: true` (no behavior change, no spec deltas).

**Choice:**
- **Build on the GitHub runner via CNG + local Gradle.** `npx expo prebuild --platform android --no-install` generates `android/` (gitignored), then `./gradlew assembleRelease` builds `app-release.apk`. No Expo account, EAS token, or cloud minutes. Chosen over EAS Build (needs an external account/token) and over committing `android/` (defeats CNG).
- **Debug-keystore signing (zero secrets).** The generated Gradle release buildType uses `signingConfigs.debug`; the artifact is sideload/test-only — explicitly not Play-Store-valid and not upgrade-stable against a future real keystore. Production signing is a documented follow-up (`SIGNING_*` secrets + a `signingConfigs.release` block).
- **Triggers: `push: tags: ['v*']` and `workflow_dispatch`.** A tag builds and attaches `crawl-<tag>.apk` to a GitHub Release via the built-in `GITHUB_TOKEN` (`permissions: contents: write`, idempotent); manual dispatch always uploads a workflow artifact.
- **Toolchain pins:** JDK 17 (temurin), Node 22.x, no `expo-build-properties`; effective RN 0.86.3 / Expo SDK 57 defaults are **compileSdk 36 / targetSdk 36 / buildTools 36.0.0** (NOT the design's initially-assumed 37/37.0.0), and `ubuntu-latest` ships platform `android-36`.
- **Review-driven hardening:** `gh release create` omits `--target` (a workflow-modifying tagged commit makes the Releases API return 404 for `GITHUB_TOKEN`); `gh release edit --draft=false` after upload (guards a stranded draft); an empty-SDK guard before apksigner discovery; the `version` input validated `^[A-Za-z0-9._-]+$`.

**Trade-offs:** The APK is debug-signed (test-only, not upgrade-stable). The first live run may auto-download NDK `27.1.12297006` (~1 GB) because the runner ships 27.3+ — accepted as the authoritative first-run check. CI consumes runner minutes per tag. The app still boots the placeholder screen until Stage 5 makes it worth installing.

**Revisit:** When a production / Play-Store path is wanted, add a real keystore + a `signingConfigs.release` block. If the first run fails on the NDK, add `expo-build-properties` pinning an installed NDK (one line). If EAS becomes desirable, replace only the build steps and keep the trigger/release shape. Otherwise never — the delivery path is the operating model.

---

## 2026-10-04 — Public generator API needs an explicit size floor (or clamping) and a small-size boundary test

**Context:** Review of `levelgen-and-fov` found `generateBspLevel`/`generateLevel` claim "the outer ring of the grid is never carved" but leak onto the outer boundary for small requested sizes. `generateBspLevel` calls `buildTree` whenever `interior.{width,height} >= MIN_ROOM (3)`, but `placeRoom` assumes the region is at least `MIN_LEAF (5)`; on a 3-wide region `maxWidth = min(9, region-2) = 1`, and `randInt(rng, 3, 1)` silently returns `3` (its documented `max < min` collapse), so the room overshoots the region into the boundary ring. Concretely `generateLevel({width:5, height:5, ...})` yields floor tiles at `x = width-1` and `y = height-1`, violating the level-generation spec requirement "The outer boundary is non-passable". The existing boundary test only exercises 40×30; the degenerate-size tests only exercise 1×1 and 3×3 (which route to the single-tile branch), so `5x5`, `5x6`, `6x5`, `7x5`, … were entirely uncovered. `descend` hardcodes 40×30, so the shipped game path is unaffected — but `generateLevel` is public API and the spec names no size floor.

**Choice:** Make the size contract explicit and enforced in one of two ways, and add coverage: (a) raise the `buildTree` gate from `MIN_ROOM` to `MIN_LEAF` so any region fed to `placeRoom` is guaranteed `region - 2 >= MIN_ROOM` (then `randInt`'s range is always valid); or (b) keep the gate and clamp `width = min(maxWidth, max(MIN_ROOM, maxWidth))` / guard `placeRoom` against `region - 2 < MIN_ROOM`, falling back to the centered single-tile carve. Whichever is chosen, `level.test.ts` must assert a solid boundary across a **size sweep** (e.g. every `w,h` in `[3..12]`) over several seeds, not just 40×30.

**Trade-offs:** Option (a) means 5×5..7×7 interiors produce a single centered tile instead of a (too-big) room — a smaller-but-valid level, consistent with the 3×3 behavior. Option (b) keeps a room where one fits but adds a clamp branch. Both are cheap; the real cost of *not* deciding is a silent public-API contract that breaks at small sizes while the suite stays green.

**Revisit:** If a minimum playable level size becomes a product requirement, replace the floor with an explicit `MIN_LEVEL_SIZE` validated at the boundary (throw `UnknownGeneratorIdError`-style typed error rather than silently producing a degenerate level). Otherwise never — pin the floor and test the boundary.

## 2026-10-04 — Stage 3 (`levelgen-and-fov`) outcome: BSP+registry, derived FOV / stored explored, level state shape, descend generalization

**Context:** Stage 3 turned the flat engine world into a real dungeon and needed four choices locked that are costly to reverse now that later stages build on them: (a) how levels are produced and selected, (b) what vision is stored vs. recomputed, (c) the exact additive shape of the level/explored state, and (d) how `descend` swaps the world and what size it generates. All are implemented and verified in Phases 1–4; recording the consolidated outcome.

**Choice:**
- **(a) BSP generator + named-id registry seam.** `src/engine/level.ts` exposes `generateBspLevel(rng, {width,height,depth})` (recursive binary space partition: split interior into room-sized leaves, place a room per leaf, join sibling subtrees with an L-shaped floor corridor over the *same* passable array) and `generateLevel({id?, rng, width, height, depth})` picking from a **module-private** `generators: Record<string, LevelGenerator>` (design D3). `LevelGenerator = (rng, options) => GeneratedLevel` where `GeneratedLevel = { level: Level; grid: Grid }` — metadata and terrain returned as siblings because `GameState` stores them separately. Unknown ids throw typed `UnknownGeneratorIdError` (with `.id`/`.knownIds`) — a loud caller error, matching the pack-loader precedent, never a silent fallback. Only `generateLevel`/`generateBspLevel`/`DEFAULT_GENERATOR_ID`/`generatorIds`/the error + types are exported; the registry object never leaves the module.
- **(b) Visibility derived; explored stored.** `computeFov(grid, origin, radius)` recomputes visibility every time (recursive shadowcasting, 8 octants, Chebyshev bound, origin always visible, OOB safe) and is **never** in `GameState`. The stored per-level record is the monotonic `explored: boolean[]`, grown via the pure `exploreInto(explored, visible)` element-wise OR helper. Design D4/D5.
- **(c) Level/explored live additively on `GameState`.** `GameState` gains `level: { depth: number; spawn: Position }` and `explored: boolean[]` (flat row-major, `y*width+x`, same indexing as `grid.passable`). `state.grid` stays top-level and unchanged (terrain is not nested in `Level`). Both fields are **required** (not optional) so a level can never be silently absent; both are plain data and JSON-lossless. Flat-index helpers `indexOf`/`coordOf`/`forEachCoord` live in `grid.ts`.
- **(d) `descend` generates a fixed 40×30 level; `commit` generalized to a `StateOverrides` object.** `descend` carries no dimensions, so it uses module constants `DESCEND_LEVEL_WIDTH = 40` / `DESCEND_LEVEL_HEIGHT = 30` — comfortably above the BSP split floor on both axes, small enough for v1 FOV/serialization — rather than inheriting whatever fixture size the caller started from (tests start at 3×3, which the partitioner cannot subdivide). `commit(state, rng, events, overrides: StateOverrides = {})` was generalized from `entities?: Entity[]` to `{ entities?, grid?, level?, explored? }` so `descend` swaps grid+level+explored+entities through the one centralized RNG-writeback/log-append path (design D6); omitted fields leave the input value. `descend` is dispatched as an explicit `case` in **both** `applyCommand` and `applyCommandWithPack` (never left to the `default` noop).

**Trade-offs:** The private registry duplicates nothing but means a second generator is one registry entry with no state/command change (the intended seam). FOV recomputed each move is O(radius²)/octant — acceptable at v1 sizes; `radius` is a parameter so caching can be added behind the same signature later. Required `level`/`explored` broke every existing `GameState` literal (~a dozen across 6 test files), fixed by editing fixtures rather than making fields optional (which would reopen the "is there a level?" hole). Fixed descend dimensions mean the starting level may differ from deeper levels; everything below depth 1 is uniform. The `commit` signature change is breaking at the call-site level only (tsc catches positional array calls).

**Revisit:** If profiling shows per-move FOV is hot, add a derived cache keyed by `(grid, origin, radius)` behind the same signature. If a second generator (e.g. cellular-automata caves) lands, it should need only a registry entry — if it needs a command/state change, that is a seam defect. If descend must vary size by depth, replace the constants with a depth→size policy without touching the command shape. Otherwise never — the shape and seam are the operating model and are pinned in design D1–D6.

---

## 2026-10-04 — FOV: recursive shadowcasting, Chebyshev bound, visibility derived

**Context:** Stage 3 (`levelgen-and-fov`) task 2.1 needed the vision algorithm locked: the spec requires non-passable tiles to block sight while themselves being visible, a Chebyshev-distance radius bound, an out-of-bounds origin to be safe, and purity/determinism. Design D4 already chose recursive shadowcasting over the 8 octants and "visibility derived, explored stored".

**Choice:**
- `computeFov(grid, origin, radius) -> boolean[]` in `src/engine/fov.ts` returns a fresh flat row-major `boolean[]` of length `width*height` (same `y*width+x` indexing as `grid.passable`/`explored`). It marks the origin visible **before** the radius check (so a non-passable origin is seen and `radius 0` yields the origin only); an out-of-bounds origin returns an all-false array of correct length without throwing. It never mutates the grid and is deterministic.
- The 8-octant transform is the standard Björn Bergström table `[[1,0,0,1],[0,1,1,0],[0,-1,1,0],[-1,0,0,1],[-1,0,0,-1],[0,-1,-1,0],[0,1,-1,0],[1,0,0,-1]]`, applied as `x = xx*col + xy*row`, `y = yx*col + yy*row` with `col` from `-row..0` and `row = -distance`. Intervals start at `(startSlope, endSlope) = (1.0, 0.0)`. The radius is enforced by the depth loop **and** an explicit `Math.max(|dx|,|dy|) <= radius` before marking.
- `DEFAULT_SIGHT_RADIUS = 8` is exported and used only as the documented default; the function still takes an explicit `radius` (design D4's "sight radius as a parameter so it can later come from the actor/pack without a signature break").
- `exploreInto(explored, visible) -> boolean[]` is the pure append-only union helper: element-wise OR into a **new** array sized by `explored`. It only grows and never mutates either input (design D5). Phase 4 will OR the post-move FOV into `state.explored` through it.

**Trade-offs:** Shadowcasting is fiddly — the initial `endSlope` must be `0` (not `1`) or cardinal directions stop at distance 1, and a mis-transcribed octant table yields a rotated pattern; both are now recorded in `histories/coder.md`. The algorithm is O(radius²) per octant per call, recomputed every move (design D4 accepts this at v1 map sizes; `radius` is a parameter so caching can be added later without a signature change). `exploreInto` does not validate equal lengths — it iterates `explored.length` and treats a missing `visible[index]` as `false`, which is the intended semantics (a shorter visibility array can only fail to add tiles).

**Revisit:** If profiling shows FOV recomputation on large maps is a cost, add a derived cache keyed by `(grid, origin, radius)` behind the same signature. If a second FOV algorithm (e.g. permissiveness variants) is needed, keep the signature and swap internals. Otherwise never — the spec pins the behavior, not the algorithm.


---

## 2026-10-04 — Level & explored live additively on `GameState`; flat-index helpers in `grid.ts`

**Context:** Stage 3 (`levelgen-and-fov`) needs the world to become a *level* (depth + spawn + a persistent explored mask) without breaking any Stage-1/2 consumer or the JSON-clean/purity invariants. The pinned shape was in the change design (D1); implementation raised one sub-choice: where the shared flat-index math lives and whether to add helpers at all.

**Choice:**
- `GameState` gains `level: { depth: number; spawn: Position }` and `explored: boolean[]` (flat, row-major, index `y * width + x` — the same indexing as `grid.passable`). `state.grid` is unchanged; the terrain stays top-level rather than nested inside `Level`. All three are plain data (no `Map`/`Set`/class), so state round-trips through JSON losslessly.
- New pure helpers in `grid.ts`: `indexOf(grid, pos)` → `y * width + x`, `coordOf(grid, index)` → `Position` (inverse), and `forEachCoord(grid, visit)` for row-major tile iteration. They are index arithmetic only: `indexOf` does **not** bounds-check (callers use `inBounds`/`isPassable` for safe access), and `forEachCoord` calls back with `(pos, index)` so FOV/levelgen can share one traversal ordering. `Level` and the helpers are exported through the `@engine` barrel.
- Every `GameState` fixture now sets `level: { depth: 1, spawn: <player start> }` and `explored: new Array<boolean>(width*height).fill(false)` (all-false, exact length) rather than making the fields optional — the type stays required so a real level can never be silently absent.

**Trade-offs:** A required `level`/`explored` broke ~a dozen state literals across 6 test files, which was fixed by editing them (the alternative — optional fields/defaults — was rejected as it reopens the "is there a level?" hole). `indexOf` being unchecked means a misuse on an out-of-bounds `pos` silently computes a bogus index; that is intentional (levelgen/FOV already gate on `inBounds`) and documented at the declaration. `forEachCoord` allocates a `Position` per tile — fine at v1 map sizes, revisit only if profiling says otherwise.

**Revisit:** If a second generator or a larger map makes allocation/iteration a measured cost, or if more than three per-tile flat arrays appear (then consider a single cursor/iterator abstraction). Otherwise never — the shape is pinned in design D1.

---

## 2026-10-04 — Recognized commands must guard their parameters, not just `type`

**Context:** Stage-2 review of `content-packs-v1` found the command boundary guard (added in M1 to stop `null`/non-object commands crashing the loop) only checks that `command.type` is a string. Once a variant is *recognized*, its parameters are read unguarded: `applyCommand(state, { type: 'move' } as Command, rng)` throws `TypeError: Cannot read properties of undefined (reading 'x')` inside `applyMove` (`step(direction)` returns `undefined`, then `.x` is read); `{ type: 'move', direction: 'sideways' }` can only be reached as a widened/noop path by the switch, not the parameter read. Commands arrive from serialized/hand-edited logs, which is exactly why the boundary guard exists. This is the same finding class as the M1 `default`-branch bug, one level deeper: now a recognized variant's *payload* is untrusted.

**Choice:** At the command boundary, validate the parameters of every recognized variant before dispatching, not only the discriminator. Either (a) route the whole `Command` through a zod schema at the deserialization seam (the Revisit trigger from "Engine boundary conventions for malformed serialized input"), or (b) add per-branch guards (e.g. `direction` must be one of the four literals; `itemId` must be a string) that degrade to `noop('malformed-command')`. Until then, both `applyCommand` and `applyCommandWithPack` are unsound for attacker/corruption-shaped but well-typed input.

**Trade-offs:** A full zod parse at the boundary costs a small per-command allocation and duplicates the TS union; per-branch guards are cheaper but easy to forget as the union grows. The zod route has the merit of one source of truth (matches design D2 for packs).

**Revisit:** Stage 3 (`levelgen-and-fov`) adds commands; whichever option is chosen should land *before* the next new command variant is added, or the gap compounds. Trigger: any new command whose parameters are read before a size/type check.

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

## 2026-10-04 — Stage 2 Phase 2–3: pack loader policy & version-message

**Context:** Implementing `content-packs-v1` tasks 2.1–2.3 / 3.1–3.4 needed concrete choices on (a) how `loadPack` signals failure, (b) where the "usable pack" composition floor lives, (c) how id lookups behave on a miss, and (d) a genuine Phase-1 spec gap: the version error did not name the unsupported version.

**Choice:**
- **`loadPack` throws typed errors** rather than returning a result union: `PackLoadError` (with `code: 'invalid-pack' | 'composition'`) and `UnknownContentIdError` (carries `collection`, `id`, `packId`). Rationale: a pack failing to load is a boundary/authoring failure that should be loud; callers wanting a non-throwing probe call `validatePack` directly (already exists). Consistent with `createGrid` throwing on malformed input. Trade-off: callers must try/catch; accepted because load is an explicit startup step, not a hot path.
- **Composition floor (≥2 classes, ≥1 monster, ≥1 item) lives in the loader, not the schema** — matches design D2/D5 and the Phase-1 note. Schema stays permissive so partial fixtures can be validated; `loadPack` is what guarantees "a usable pack". Exported `MIN_CLASSES`/`MIN_MONSTERS`/`MIN_ITEMS` make the policy discoverable and testable.
- **Id lookups via a private `Map` held in the loader closure** (never on `LoadedPack.pack`, never in state). `LoadedPack` exposes the plain `pack` data + `class`/`monster`/`item` methods that throw `UnknownContentIdError` on miss — no silent `undefined`. This satisfies the constraint that serialized/exported content stays plain while allowing O(1) lookup.
- **Version message fix:** replaced `z.literal(PACK_VERSION)` with `z.number().superRefine(...).transform(value => value as 1)`, and added a `packVersionSchema` export. The refine-only form has a static message that could not echo the received value; `superRefine` interpolates it (`unsupported pack version 999; this engine supports version 1`), satisfying the spec's "message naming the unsupported version". The `.transform` cast keeps `z.infer` as the literal `1`.

**Trade-offs:** Throwing loader means every caller wraps try/catch; a result union would be more ergonomic but weaker at the "load must succeed" boundary. Handler-based (throw) errors are harder to compose than values. The private Map duplicates the arrays (memory) for O(1) lookup we don't yet need at this scale.

**Revisit:** If `loadPack` is adopted on a hot/repeated path (e.g. hot-reload), switch to a result union or cache the `LoadedPack`. If the two-error-type split (`PackLoadError` code union) proves awkward, split into `PackValidationError` + `PackCompositionError`. If Phase 5 needs the loaded pack in a public type, surface `LoadedPack` and the errors through `@engine`.

---

## 2026-10-04 — Engine boundary hardening for malformed serialized input

**Context:** Review of `bootstrap-engine-skeleton` found that `applyCommand`'s unknown-command branch (`src/engine/commands.ts`) reads `command.type` unguarded, so a `null`/`undefined`/non-object command (e.g. from a corrupt or hand-edited serialized command log) throws `TypeError` instead of being handled as invalid. The code comment claims the branch exists precisely "for unrecognized types that arrive from serialized logs," but it only handles well-formed objects. Because save/replay is a core M1 promise (state + command log), a malformed log must not crash the loop.

**Choice:** Treat engine entry points as boundaries for external data. `applyCommand` must reject non-object / missing-`type` commands with a `noop` event (and unchanged world state), never throw; likewise `randInt`/grid helpers already tolerate out-of-domain inputs by design.

**Trade-offs:** Adds a runtime shape guard at the command boundary; slight overlap with TypeScript's compile-time `Command` type, which cannot protect against deserialized input.

**Revisit:** When the command union grows past one variant, add a schema (zod, Stage 2) at the deserialization seam and keep the boundary guard as defense-in-depth. Trigger to re-open: any new command whose parameters are read before a shape check.

---

## 2026-10-04 — Stage 2 Phase 4: fantasy pack ships raw JSON, validated not cast

**Context:** Phase 4 authors the first real content pack (`src/packs/fantasy/`) as `pack.json` + a thin `index.ts`. Two choices needed settling: (a) whether the thin entry should type the JSON as the engine's `Pack`, and (b) whether its test lives under `src/packs` (requiring a `vitest.config.ts` `include` widening) or under `src/engine/__tests__`.

**Choice:**
- **Raw, uncast export.** `index.ts` exports the JSON verbatim (`import rawPack from './pack.json'`) as `fantasyPack`, with the `Pack` type imported only as a named alias (`FantasyPack`) for documentation. The JSON is deliberately NOT cast to `Pack`: `loadPack`/`validatePack` is the only path that promotes raw data to a validated pack, so a malformed pack fails loudly instead of a cast lying about its shape. (The schema itself is never cast away — the test runs the real validator.)
- **Test co-located under `src/packs`.** The test lives at `src/packs/fantasy/__tests__/fantasy-pack.test.ts` and `vitest.config.ts` `include` was widened to `['src/engine/**/*.test.ts', 'src/packs/**/*.test.ts']`, because the pack is a `src/packs` artifact and the engine test tree should stay about the engine.
- **Test imports the loader directly.** `loadPack` is not (yet) re-exported through `@engine`; the test imports `../../../engine/pack` and `../../../engine/schema` explicitly. Do not widen the engine's public `index.ts` for this phase (out of the assigned task).

**Trade-offs:** A second `include` glob to maintain; the deeper test path needs correct relative imports (`../../../engine`, not `../../engine`). The package id is `"fantasy"` (matching the folder) rather than the `"fantasy-core"` used in Phase 1–3 *fixtures* — fixtures are throwaway test data, the shipped pack's id is its identity.

**Revisit:** When Phase 5+ wires `loadPack`/`LoadedPack`/pack errors through `@engine`, switch the test import to the public surface. If more pack dirs appear, consider a shared `test` setup rather than a per-dir glob.

---

## 2026-10-04 — Stage 2 (`content-packs-v1`) outcome: pack format/versioning + pack-aware command entry

**Context:** Stage 2 needed to lock two things that will be costly to reverse now that other stages build on them: (a) the on-disk pack format and how it evolves, and (b) how a content-dependent command reaches the content without widening the M1 command hot path. Both were settled during implementation (design D1–D9) and are now verified; recording them as one durable entry.

**Choice:**
- **Pack format is `{ id, name, version, classes[], monsters[], items[] }`** (design D3), authored as plain JSON with a thin typed TS entry per pack (`src/packs/fantasy/`). Entries carry `id`/`name`/`glyph`/stats; items carry a **declarative** `effect` discriminated union (`{kind:'heal',amount}` | `{kind:'roll-heal',min,max}`) that is *data, not code*. The format is theme-agnostic — a sci-fi pack validates under the identical schema — and it is validated, never cast: raw JSON is promoted to a `Pack` only through `validatePack`/`loadPack`.
- **Versioning is explicit and checked**: the pack declares `version` and the engine supports exactly `PACK_VERSION = 1`. `packVersionSchema` uses `z.number().superRefine(...).transform(v => v as 1)` so an unsupported version fails with a message *naming the received version* (a `z.literal` message is static and cannot), while `z.infer` still yields the literal `1`. This is the forward-compat seam: a new schema is a new `PACK_VERSION` branch, not a silent reinterpretation of old packs.
- **D6 choice = option (a): a separate pack-aware entry point.** `applyCommand(state, command, rng)` stays 3-arg and content-free; it rejects `use-item` as `noop('unknown-command:use-item')` rather than reaching for an ambient pack. `applyCommandWithPack(state, command, rng, pack)` handles both `move` (delegating to the same `applyMove`) and `use-item`. Both share one `commit(state, rng, events, entities?)` helper, so RNG-writeback and append-only-log live in exactly one place. Content reaches a command only when the caller passes a `LoadedPack` explicitly.

**Trade-offs:**
- **Two command entry points** is the cost of keeping M1's 3-arg contract and all its tests intact. A caller must know that `use-item` needs `applyCommandWithPack`; a widened 4-arg signature would have forced every `move` caller/test to pass a pack it never uses. Mitigation: both are exported from the single `@engine` barrel, and tests assert `move` works without a pack and `use-item` does not resolve through `applyCommand`.
- **Schema churn** is expected as later stages add fields; the explicit `version` + reject-unknown-version bounds the blast radius (revisit at Stage 5 when combat/equipment need more).
- **Effect registry could be mistaken for a scripting surface**; it is deliberately a small enumerated map of pure resolvers — packs name a kind, never supply logic (D8). Treat any pack-supplied logic as an abstraction leak.
- **A private `Map` lookup index duplicates the arrays** in memory for O(1) id resolution not yet needed at this scale; it never leaves the loader closure and never touches state.

**Revisit:** Triggered by (a) any pack field later stages need that changes the meaning of existing data — bump `PACK_VERSION`; (b) the second real theme pack (`second-theme-pack`) forcing *any* engine change — that is the abstraction-leak test and reopens the format/schema; (c) if `applyCommandWithPack` proves awkward for many content commands, consider binding a `LoadedPack` into a resolver object rather than adding a function per command family. Otherwise never — the format and entry-point split are the operating model.




---

## 2026-10-04 — Stage 5 app shell: Expo Router with a bare `@engine` path entry, dead entry points deleted

**Context:** Stage 5 is the first real UI. It needs an app shell that boots straight into the game, while preserving the engine boundary (UI imports only from `@engine`) and the determinism contract (client threads the RNG from `state.rng`, never an ambient generator). The pre-existing shell was a dead placeholder: `index.ts` → `registerRootComponent(App)` with `App.tsx`, and `package.json` `main: "index.ts"`. Separately, the project documents `@engine` as the single public import specifier, but the existing `"@engine/*"` glob matches only subpaths, so a bare `import { … } from '@engine'` failed `tsc` with TS2307. Phase 1 (this entry) settles the shell/entry/config questions; Phases 2–4 add the state model, renderer, and input.

**Choice:**
- **App shell is Expo Router.** `package.json` `main` → `expo-router/entry`; routes live under `src/app/` (`src/app/_layout.tsx`, `src/app/index.tsx`). `expo-router`, `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, `expo-constants` installed via `npx expo install` (SDK-57-pinned versions). Chosen over keeping the manual `registerRootComponent` root because file-based routing is the locked Stage-5 direction and the documented Expo SDK 57 path; `src/app/` (not root `app/`) because the project colocates source under `src/`.
- **`app.json` gains `scheme: "crawl"` + `experiments.typedRoutes: true`.** `typedRoutes` is a convenience only — route types are generated to gitignored `.expo/types` after a dev-server/prebuild run, so a clean-checkout `tsc --noEmit` does not require them (verified). `npx expo install` also auto-added the `expo-router` config plugin (`plugins: ["expo-router"]`), which is required for native registration.
- **`tsconfig.json` gains the exact `"@engine": ["./src/engine/index.ts"]` path.** It is added once and fixes **both** resolvers — `tsc` via `paths` and Vitest via `vite-tsconfig-paths`. A bare `@engine` import is now resolvable; no separate Vitest alias. This is config-only; `src/engine/**` is byte-for-byte untouched.
- **`App.tsx`, `index.ts`, and `src/app/.gitkeep` are deleted.** Once `expo-router/entry` is `main`, `registerRootComponent` is dead code. Deletion ships in the same change as the `main` swap, so nothing references the removed files (verified by grep across the tree excluding `node_modules`).
- **Route shell is minimal.** `_layout.tsx` wraps `<Slot />` in `<SafeAreaProvider>`; a later phase adds the `GameProvider`. `index.tsx` is a placeholder `<View><Text>crawl</Text></View>` that a later phase replaces with `<GameScreen />`. No `src/ui/**` files are created in Phase 1.

**Trade-offs:** `npx expo install` mutates `app.json` (adds the plugin) as a side effect of installing, so the config diff is larger than the two fields hand-added. `typedRoutes` may need to be dropped if route-type generation ever disrupts a clean `tsc`. Web is not a required check this stage (needs `react-native-web`/`react-dom` + a web bundler); verification is `tsc`/unit tests/lint plus the pre-tag `npx expo export --platform android` bundling gate.

**Revisit:** If `typedRoutes` causes a clean-checkout `tsc` failure, remove the `experiments.typedRoutes` flag (the renderer does not depend on it). If a second route or a nested layout appears, switch the single `Slot` for a `<Stack />`. When a web target becomes required, add `react-native-web`/`react-dom` and a web bundler before re-enabling `npm run web` as a check. Otherwise never — Expo Router is the operating shell.

---

## 2026-10-04 — Stage 5 Phase 3: glyph resolution is a pure, pack-sourced lookup with safe fallbacks

**Context:** The renderer needs to turn `(tile passability, visibility mask, explored mask, optional occupant)` into a glyph + color for 1,200 cells. Entity glyphs live in the pack's `glyph` fields, but the `LoadedPack` accessors (`class`/`monster`/`item`) **throw** `UnknownContentIdError` on a miss rather than returning `undefined`, so any code path that resolves an entity kind the pack does not define would crash the screen. The client must also never mutate `GameState` and must keep visibility derived, not stored.

**Choice:**
- **Glyph logic is a framework-free module (`src/ui/logic/glyphs.ts`).** No React/RN import, so it is unit-testable under the existing node Vitest environment; the pack lookups are separated from layout and color.
- **Every pack lookup is wrapped and falls back to `'?'`.** `entityGlyph(pack, entity)` tries `class`→`monster`→`item` (an `Entity` carries only `kind`, not its source collection), each in a `try/catch`; a miss returns `UNKNOWN_GLYPH = '?'`. The resolver never throws (design D6).
- **Terrain convention is documented in-code:** passable ⇒ `.` (`FLOOR_GLYPH`), non-passable ⇒ `#` (`WALL_GLYPH`).
- **Visibility is a three-way category, visible > explored > unseen**, via `visibilityCategory`/`visibilityStyle`; unseen tiles short-circuit in `tileRender` to a blank glyph (`UNSEEN_GLYPH = ' '`) and the unseen background, so an occupant cannot leak through an unseen tile.
- **`tileRender` is the single `{ glyph, color, backgroundColor }` entry point** consumed by `Tile`/`MapView`. Colors come from `src/ui/theme/colors.ts` (plain hex, no React import): `visible`/`explored`/`unseen` treatments plus terrain/player/entity accents.
- **`MapView` derives FOV per render** with `computeFov(state.grid, player.pos, DEFAULT_SIGHT_RADIUS)` inside a `useMemo` keyed on `[state, player]`, reads `state.explored` directly, iterates via `forEachCoord`, and renders a fixed `width*TILE_SIZE × height*TILE_SIZE` flex-wrap grid of `React.memo`'d `Tile`s whose props are primitives only (so memoization is effective). Player is found with `entityById(state.entities, state.playerId)`.
- **`_layout.tsx` mounts `GameProvider` inside `SafeAreaProvider`**, wrapping `<Slot />`; `src/app/index.tsx` renders `<GameScreen />`, which composes `<Hud />` + `<MapView />` and renders the recoverable `error.message` surface instead of the map when the provider captured a pack-load failure (design D7). An empty `inputSlot` View is left below the map for Phase 4's controls.

**Trade-offs:** Trying all three collections per entity is O(1)-ish (`Map` lookups) but does up to three failed lookups for an unknown kind — acceptable for 1,200 cells and removed from the hot path by memoizing the whole cell array. Resolving entity kind by trial across collections assumes ids are unique (the loader already rejects duplicate ids *within* a collection, not across them) — a cross-collection id collision would resolve to `class` first; no current pack has one. Seeding the resolved cell array as a fresh `Cell[]` per state change means `Tile` memoization is only as good as primitive prop equality, which is why `Tile`'s props are primitives.

**Revisit:** If a tile ever needs more than one glyph (e.g. items stacked on terrain), replace the single-glyph `TileRender` with a small cell model — do not add a second resolver. If the pack schema ever allows cross-collection id collisions, `entityGlyph` needs an explicit `kind → collection` hint rather than trial lookup. Otherwise never — the fallback + derived-visibility model is the operating renderer contract.

---

## 2026-10-04 — Stage 6 Phase 7: descend is stairs-gated; population is pack-only, so the pack-free `descend` generates an unpopulated level

**Context:** Two Phase-7 questions had no pre-existing answer. (1) `applyDescend` unconditionally generated depth+1, so `descend` worked anywhere; the spec now requires it be gated on the player standing on `state.level.stairs` and be a pure `noop('not-on-stairs')` otherwise. (2) The new level must be populated with monsters/items, but `populateLevel` needs a `LoadedPack` and `applyCommand` (the content-free entry point) has none — while `descend.test.ts` and `index-surface.test.ts` resolved `descend` through **both** entry points, and `DescendCommand`'s own doc says it is resolved by both. Separately, Phase 5's D5 turn rule advanced monsters after a `level-changed`; that passed only because pre-Phase-7 descend produced an *unpopulated* level, so `advanceMonsters` found nothing. Populating the new level would silently let the fresh monsters act on the descent turn.

**Choice:**
- **Pack-free `applyCommand` resolves `descend` to an UNPOPULATED level** (Stage-3 behavior), and **`applyCommandWithPack` is the only path that populates**. Rationale: `descend` carries no content reference and is documented as resolvable through both entry points; making the pack-free path `noop` would break both-entry-point resolvability and the save/replay pack-free inspection path (`replayCommands` without a pack), whereas generating unpopulated keeps `descend` content-free and simply yields no monsters/items — exactly parallel to how the pack-free path noops `use-item`. The UI always uses the pack-aware path (`useGame.ts` is the single pack-aware call site), so the spec's "the new level SHALL be populated" requirement is fulfilled where content is available.
- **The stairs gate is checked before `generateLevel`.** An off-stairs descend does not draw from the RNG (`state.rng` stays byte-identical), so the noop is not just event-inert but stream-inert — replay-safe.
- **The new level's entity list is `[player@spawn, ...population]`.** The old level's entities are dropped rather than merged; `withEntityAt` (which would preserve them) is no longer used by `applyDescend`. Spawn distinctness from stairs/monsters is guaranteed by generation (`stairs !== spawn`) plus `populateLevel` excluding spawn and stairs.
- **Descend success does not advance monsters.** Removed `level-changed` from `ADVANCING_EVENT_TYPES` and added an explicit `level-changed → false` guard in `shouldAdvance`. The D5 row "descend advances the current level only" resolves to *no monster acts*: the current level's monsters are atomically discarded by the level swap, and the new level's monsters are freshly placed (spec scenario: "the new level's monsters are placed but do NOT act on the same turn").

**Trade-offs:** The pack-free path now produces a level that violates the spec's population clause *for that path only* — accepted because the engine cannot populate without content and the alternative (noop) would break `descend`'s content-free contract and pack-free replay. A pack-free replay of a descend therefore yields a different entity list than the pack-aware run (same terrain/level/explored/RNG); this is the same asymmetry already accepted for `use-item` (pack-free noops it). `state.rng` is captured after generation **and** population, so the two paths diverge in population draws too — only the pack-aware path is the supported production path.

**Revisit:** If a future requirement makes pack-free replay need populated levels, add an explicit id-source parameter to the content-free descend path (an "equivalent id source", which the level-generation spec already contemplates) rather than reaching for an ambient pack. If `descend` ever gains parameters, move it into the exhaustive `switch` with a malformed-parameter guard. Otherwise never — pack-free = content-free = no population; pack-aware = populated is the operating model for descent.

---

## 2026-10-04 — Test-suite coverage review — "assert the semantic value, not just its presence" becomes the test-design rule; pin RNG-derived placements and make the descend-turn rule observable

**Context:** A read-only review of the whole suite (23 files / 409 tests) with adversarial mutation probing against pristine engine source found the suite green but under-covering two spec rules. Both are *recurring-class* problems, not one-offs: the project's tests repeatedly assert a property's **presence** (e.g. "stairs are distinct from spawn", "descend emits exactly one event") without asserting the **value or execution** that makes it meaningful. (1) Deleting the spawn-exclusion in `findStairs` (`src/engine/level.ts:350`) shifts the stairs tile for every seed at 40×30 (probe: seed 1 `(35,19)`→`(34,19)`) yet all 409 tests pass — `level.test.ts:231` only checks distinctness over 50 seeds, and distinctness holds either way. No test pins the exact stairs tile, so any change to the stairs RNG draw is invisible, including a replay-breaking one. (2) Promoting `level-changed` into `ADVANCING_EVENT_TYPES` **and** deleting its `shouldAdvance` guard (a direct violation of "Descent advances the current level only / the new level's monsters do NOT act") passes all 409 — `command-loop.test.ts:1162` asserts `events == [level-changed]`, but the newly populated level's `chase` monsters spawn out of `DEFAULT_BEHAVIOR_RANGE` of the fresh spawn and idle, so the assertion holds whether or not the turn step runs.

**Choice:**
- **Add a golden/pinned-placement test for generation.** Pin `generateLevel`'s exact `level.stairs` (and, ideally, `spawn`, monster/item positions) for a small fixed set of `(seed, depth, size)` tuples. This is the missing golden-file/serialization snapshot: it makes any change to the seeded draw order or candidate filtering — the class of bug that silently breaks replay — a test failure, rather than a property that can still pass.
- **Make the descend-turn rule observable, not merely plausible.** The D5 test must guarantee a monster *would* act that turn: either hand-build the new level so a `chase` monster is within range/LOS of the spawn, or assert directly that `advanceMonsters` was not invoked (e.g. by asserting its effect is absent on a fixture where it *would* move). A test whose negative assertion holds for an unrelated reason (out-of-range monsters) is not coverage.
- **Generalize the project's test-design rule:** a test for a property `P(data)` must also pin the *value* that `P` is intended to protect (distinctness ⇒ also pin the value; "one event" ⇒ also prove the world step that would add a second event is actually reachable and gated), and must exercise the guard discriminatively (a mutation that flips the gate should fail it).
- **Record the redundant/dead guards so they are not mistaken for coverage.** `shouldAdvance`'s `level-changed` guard (masked by set non-membership), the `player-died` guard (masked by `status === 'dead'`), `advanceMonsters`' initial dead early-return (masked by the per-iteration re-check), and `CARDINAL_STEPS` tie-break order (Chebyshev + "strictly closer" makes cardinal ties geometrically unreachable) all survived mutation *because they are unobservable*, not because tests cover them. Leave them (cheap, defensive) but do not cite them as tested behavior.
- **Known untested surface (accepted for now):** the React hooks `src/ui/hooks/useGame.ts` and `useKeyboardInput.ts` and every `.tsx` component run under no test (node env, no DOM/RN). The `ui/app-shell` spec's save/resume/auto-save/new-run/terminal requirements are covered only indirectly via the pure `save.ts`/`createInitialState.ts` helpers. If the client orchestration grows, extract its pure core (reducer-style) so it is node-testable, or add a jsdom/RN test env — do not rely on the pure-helper tests as evidence for hook behavior.

**Trade-offs:** Golden placement tests are brittle to intentional determinism-breaking changes (they *should* fail then — that is the point) and require regeneration discipline when the RNG contract legitimately changes; keep them small and clearly labeled as the frozen seeded contract. A Hook-level test env adds tooling weight and RN transform/config risk; extraction is preferred. The redundant guards add minor dead surface but no bug.

**Revisit:** Trigger to re-open the golden placement tests: only a deliberate, versioned change to the seeded generation contract (a `PACK_VERSION`-style breaking change with its own decision entry). Revisit the hook-coverage decision when client state logic gains branching beyond save/resume/new-run, or when a client regression ships. Otherwise never for the test-design rule — "assert the semantic value, not just its presence" is the standard.

---

## 2026-10-04 — `review-fixes-augment` applied: pack-agnostic player class, a loud pack-free replay guard, and the two pinned contracts

**Context:** Applying all 15 tasks of `review-fixes-augment` (Findings A/B/C from the post-Stage-7 coverage review). Three implementation details were not fully pinned by the design and needed a fixed choice: how `createInitialState` reads the pack's first class, exactly where the replay guard sits relative to the `start` clamp, and how the descend-turn test is made falsifiable given the engine's existing `level-changed` early-return in `shouldAdvance`.

**Choice:**
- **Finding A — `createInitialState(seed, pack, classId = pack.pack.classes[0].id)`.** The default reads the validated pack's declared-order array directly (the loader's composition floor guarantees ≥ 2 classes, so index 0 always exists and reading it cannot throw); the explicit branch still routes through `pack.class(classId)`, so an unknown explicit id throws `UnknownContentIdError` (loud preserved). `PLAYER_CLASS_ID = 'fighter'` stays exported as the documented fantasy convenience default but is no longer the factory's implicit subject. The `LoadedPack.pack` raw-array path was confirmed against `src/engine/pack.ts`. Tests: dogs-pack no-classId (defaults to `good-boy`), dogs explicit `chonker`, dogs explicit `fighter` throws, and fantasy default byte-identical to the old output.
- **Finding B — guard at the replay seam, after the `start` clamp, before any `apply`.** `replayCommands` computes `commands.slice(start)` and, when `pack === undefined` and the remainder contains `use-item`/`descend`, throws typed `PackRequiredForReplayError` naming the offending types deduped in first-seen order. The guard is gated on `start < commands.length` so an empty remainder (fully-applied save) never throws even if the log's applied prefix contains content-dependent commands. `CONTENT_DEPENDENT_COMMAND_TYPES` is a module-local `Set`; `contentDependentTypes` is a small first-seen-order dedupe helper. `applyCommand`'s content-free `use-item`/`descend` behavior is untouched (decisions.md Stage-6 Phase-7/Phase-8 preserved verbatim); `deserializeSave` stays pack-free. The one existing test that asserted the old silent-noop pack-free replay (`save-load.test.ts`) was rewritten to assert the typed throw plus a pack-free *inspection* assertion.
- **Finding C1 — `level-placement-golden.test.ts`** pins `{spawn, stairs}` and monster/item `{kind, pos}` for four `(seed,width,height,depth)` tuples (seed 1 @40×30 d1, seed 2 @40×30 d1, seed 7 @40×30 d2, seed 3 @24×18 d1). **All expected values were probed against current code and confirmed**, including the design's seed-1 list exactly (`skeleton@(31,15)`, `goblin@(3,22)`, `giant-rat@(36,6)`, `healing-potion@(26,17)`). Semantic values only — no `toMatchSnapshot`, no full-grid bytes. A temporary draw-order edit (swapping the monster/item count draws) was confirmed to fail the test (3 placement failures), then reverted.
- **Finding C2 — the descend-turn gate's real discriminator is the `shouldAdvance` `level-changed` early-return, not set membership.** `ADVANCING_EVENT_TYPES` omitting `level-changed` is redundant with the explicit `if (events.some(level-changed)) return false` guard, so adding `level-changed` to the set alone is inert and the old vacuous test could not catch it. The replacement test (`command-loop.test.ts`) uses a dense 4-chase-monster pack and (a) a deterministic fixture at seed 5 (probed: fresh skeleton at Chebyshev 6 from the new spawn, so it would act) asserting events `=== [level-changed]` and `freshMonsterInRange === true`, (b) a curated in-range seed sweep [5,8,10,16,19,20,21,23,27,30,40,51] with an `observedInRange > 0` guard, and (c) a broad 0..99 sweep. The failure mode was confirmed by removing the `shouldAdvance` `level-changed` early-return **and** adding it to the set (the true "wrongly promoted" mutation) → the three new tests fail; a lone set-membership edit is inert and was *not* used as the falsification.

**Trade-offs:** The replay guard is a behavior change for any caller that relied on silent pack-free replay of a content-dependent tail — intentional, and supplying a pack restores the prior path. The golden tests are intentionally brittle to seeded-contract changes (regenerate only on a deliberate, versioned change). The descend sweep adds 12+100 descents (each a 40×30 generation) to the unit band; the full suite stayed ~1.7s.

**Revisit:** Never as a design question for A/B/C — these are the applied contract. If a future save format wants pack-free content-dependent replay, it must supply an equivalent id source rather than relaxing the guard. If the seeded generation contract legitimately changes, regenerate the golden values in the same versioned change. Otherwise the descend-turn falsification is the reference mutation (remove the `shouldAdvance` `level-changed` early-return), not set membership.

**Verification (recorded):** `npx vitest run` **432 passed** (was 409; +23). `npx tsc --noEmit` 0, `npm run lint` 0, `npx eslint src/engine --no-warn-ignored` 0, `npx openspec validate review-fixes-augment --strict` valid, 15/15 task checkboxes ticked. `git status --porcelain -- src/engine` shows only `save.ts`, `index.ts`, `save-load.test.ts`, `command-loop.test.ts`, and the new `level-placement-golden.test.ts` — `level.ts`, `commands.ts`, `combat.ts` unchanged.
