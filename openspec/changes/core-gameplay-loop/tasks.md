# Tasks

> Each task names its verification. Engine phases must keep `src/engine/**` pure (no `react`/`react-native`/`expo*`, no `Math.random`/`Date`); verify with `npx eslint src/engine --no-warn-ignored` in the phases that touch it. Phases are ordered and file-disjoint.

## 1. State model + entity/feature classification (types, grid)

- [ ] 1.1 Add `status: 'playing' | 'dead'`, `carriedItemIds: string[]` to `GameState`; add `stairs: Position` to `Level`; add `Entity` item discriminator convention (an `item`/feature flag) — verify `npx tsc --noEmit` reports every stale `GameState`/`Level` fixture and they are updated to include the new required fields, and `src/engine/__tests__/serialization.test.ts` round-trips a state with the new fields
- [ ] 1.2 Add pure occupancy predicates in `grid.ts` (e.g. `isLiving`, `isFeature`, `attackTargetAt`) that classify entities from their own fields with no pack — verify a new `src/engine/__tests__/grid-occupancy.test.ts` (or additions to `spatial-grid.test.ts`) covers living vs. feature vs. empty, and `npx eslint src/engine --no-warn-ignored` exits 0

## 2. Pack format: declarative monster behavior + attack, version bump

- [ ] 2.1 Add `behavior: string` and `attack: positive number` to `packMonsterSchema`/`packMonsterStrictSchema`, bump `PACK_VERSION` to 2, and update `src/packs/fantasy/pack.json` monsters — verify `src/engine/__tests__/pack-schema.test.ts` passes (missing/typed behavior+attack rejected; v1 rejected with the version named) and `src/packs/fantasy/__tests__/fantasy-pack.test.ts` passes
- [ ] 2.2 Expose the new monster fields through `LoadedPack` and a stable-order enumeration of monsters/items for seeded selection — verify `src/engine/__tests__/pack-loader.test.ts` asserts `pack.monster(id).behavior`/`.attack` and that two loads select the same kind by seeded index

## 3. Level generation + population (level.ts / spawn.ts)

- [ ] 3.1 Report a `stairs: Position` from generation on a passable tile distinct from spawn, using the injected RNG — verify additions to `src/engine/__tests__/level.test.ts` assert stairs in-bounds/passable/distinct and identical across two generations from the same seed
- [ ] 3.2 Add a pure `populateLevel(generated, pack, rng) -> placements` (monsters/items/stairs on distinct passable tiles, kinds by seeded index from the pack, spawn excluded, connectivity preserved) while `generateLevel` stays pack-free — verify a new `src/engine/__tests__/populate.test.ts` covers determinism, non-overlap, spawn exclusion, and reachability; `npx eslint src/engine --no-warn-ignored` exits 0

## 4. Monster AI: named behavior registry + per-turn advance

- [ ] 4.1 Add `src/engine/ai.ts` with `behaviorRegistry` (`chase`, `idle`), `resolveBehavior(id)` with a safe default for unknown ids, and pure resolvers that see the player via `computeFov`/range and attack through the combat registry when adjacent — verify a new `src/engine/__tests__/ai.test.ts` covers chase step, adjacent attack, blocked/no-pass-through, unknown-id safe default, and no ambient randomness
- [ ] 4.2 Add a deterministic per-turn monster-advance step (ordered by `entities` position) used by the command loop — verify `src/engine/__tests__/ai.test.ts` asserts every living monster acts once, dead monsters do not act, and replay produces the same interleaving

## 5. Combat: damage registry, attacks, death, permadeath

- [ ] 5.1 Add `src/engine/combat.ts` with `damageRegistry`/`resolveDamage(kind, attacker, target, rng)` (seeded draw, no-draw dull path leaves RNG unchanged) and `death`/`player-died` event factories — verify a new `src/engine/__tests__/combat.test.ts` covers seeded damage reproducibility, HP reduction, death removal, and the terminal player-death status
- [ ] 5.2 Add `AttackCommand { type: 'attack', direction }` and make `move` bump-to-attack (living occupant → attack; feature tile → enter; wall/out-of-bounds → blocked), wiring both entry points through `commit` — verify `src/engine/__tests__/command-loop.test.ts` and `spatial-grid.test.ts` cover attack-on-living, enter-feature, block-on-wall, self/empty attack → noop, and unknown/malformed → noop; audit/update the `rock` occupant cases in `command-loop.test.ts` and `e2e-seeded.test.ts`
- [ ] 5.3 Enforce terminal permadeath: gameplay commands on `status === 'dead'` early-return `noop('run-over')` and no monsters advance; monsters advance only after a successful gameplay command — verify `combat.test.ts`/`ai.test.ts` cover "commands after game over are inert" and "noop does not advance monsters"

## 6. Items: pickup command + carried list + use consumption

- [ ] 6.1 Add `PickupCommand { type: 'pickup' }` (remove the item entity on the player's tile, append its kind to `carriedItemIds`, emit `item-picked-up`; empty tile → noop) — verify `src/engine/__tests__/item-use.test.ts` covers pickup, empty-tile noop, determinism, and JSON round-trip
- [ ] 6.2 Consume one instance of a carried id on successful `use-item` — verify `item-use.test.ts` asserts the carried list shrinks by exactly one and the effect applies, and the no-actor/unknown-id noops are unchanged

## 7. Stairs / descend gating + populated descent

- [ ] 7.1 Gate `applyDescend` on the player standing on `state.level.stairs` (off-stairs → `noop('not-on-stairs')`; never generate) — verify `src/engine/__tests__/descend.test.ts` covers on-stairs success and off-stairs noop with the level unchanged
- [ ] 7.2 On successful descend, populate the new level with monsters/items (D6) and place the player at spawn distinct from stairs/monsters, resetting `explored` — verify `descend.test.ts` asserts the new level is populated, the player spawn is distinct, and the explored record reflects only the new level

## 8. Save/load: JSON state + command log, resume by replay

- [ ] 8.1 Add `src/engine/save.ts` with a versioned JSON envelope (`serializeSave`/`deserializeSave`), `replayCommands(state, commands, pack?)`, and `resumeRun(save, pack?)`, plus a `SAVE_VERSION` that rejects unknown versions loudly — verify a new `src/engine/__tests__/save-load.test.ts` covers round-trip, resume-matches-uninterrupted, resume determinism, unknown-version rejection, and pack-free inspection
- [ ] 8.2 Export the new public surface from `src/engine/index.ts` (new types/commands/events, `damageRegistry`/`resolveDamage`, `behaviorRegistry`/`resolveBehavior`, `populateLevel`, save/replay helpers) — verify `src/engine/__tests__/index-surface.test.ts` imports only from `@engine/index` and exercises the additions

## 9. UI: game-over surface, gameplay controls, save/resume (pure `@engine` client)

- [ ] 9.1 Render monsters/items/stairs and a game-over surface from `state.status` in `glyphs.ts`/`MapView`/`GameScreen` (explored-but-not-visible tiles still show no occupant) — verify `src/ui/logic/glyphs.test.ts` covers monster/item/stairs glyphs and the terminal surface predicate, plus `npx tsc --noEmit`
- [ ] 9.2 Add attack/pickup/use-item/descend/save/resume controls (on-screen + web-only keyboard via `commandForKey`) dispatching the new commands — verify `src/ui/logic/input.test.ts` covers every new key-to-command mapping and `npx tsc --noEmit` passes
- [ ] 9.3 Wire save/resume + auto-save and "new run" in `useGame.ts`/`GameProvider`/`AppShell` through the engine save path without mutating live state or importing deeper than `@engine` — verify `npx tsc --noEmit`, `npx eslint .` (UI deep-import gate), and `src/ui/state/createInitialState.test.ts` (populated initial state) pass

## 10. Verification + docs

- [ ] 10.1 Run the full local gate: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx eslint src/engine --no-warn-ignored` — verify all exit 0 with the new suites included and no `src/engine` boundary violations
- [ ] 10.2 Confirm the determinism/permadeath/save end-to-end: extend `src/engine/__tests__/e2e-seeded.test.ts` so a seeded run with a pinned seed reproduces monster acts, a kill, and a save/resume split exactly — verify the test passes
- [ ] 10.3 Run `openspec validate core-gameplay-loop --strict` and `openspec status --change core-gameplay-loop` — verify valid and planning complete
- [ ] 10.4 Update `STATE.md` and append the Stage-6 outcome + the `PACK_VERSION`/save-format seam decisions to `decisions.md` — verify the docs name the new surface and the seam call-out
