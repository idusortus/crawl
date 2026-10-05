# Tasks

## 1. Pack data and schema (ranged weapon)

- [x] 1.1 Add an optional `ranged` descriptor (`{ range: positive integer, damage: positive number }`) and make `effect` optional in `src/engine/schema/pack.ts`, with a refinement requiring an item to declare at least one of `effect`/`ranged`; verify with schema unit cases that a weapon-only item validates and a neither-item fails naming `effect`/`ranged` (note: `npm run typecheck` is not expected to pass until 1.4 narrows the consumers of the now-optional `effect`)
- [x] 1.2 Update the existing "rejects an item missing its effect" case in `src/engine/__tests__/pack-schema.test.ts` so it asserts the new at-least-one rule (item with neither `effect` nor `ranged` fails, item with only `ranged` passes); verify `npm test -- pack-schema`
- [x] 1.3 Add a ranged weapon item (e.g. `shortbow`, `ranged: { range: 6, damage: 4 }`) to `src/packs/fantasy/pack.json`, and optionally one to `src/packs/dogs/pack.json`; verify `npm test -- fantasy-pack dogs-pack` after 1.4 updates the count/effect assertions
- [x] 1.4 Update the type-level and runtime consumers of the now-optional `effect` so `npm run typecheck` passes: in `src/packs/fantasy/__tests__/fantasy-pack.test.ts` change the item count (5 → 6, or the new expected number) and narrow `item.effect` reads at lines 72/79/85–87; in `src/packs/dogs/__tests__/dogs-pack.test.ts` narrow `item.effect.kind` at line 118; in `src/engine/__tests__/index-surface.test.ts:191` narrow the `const effect: ItemEffect = item.effect` assignment (guard/skip effect-less items); verify `npm run typecheck` and `npm test -- fantasy-pack dogs-pack index-surface`

## 2. Engine ranged command, combat, and save guard

- [x] 2.1 Add `RangedAttackCommand` (`{ type: 'ranged-attack'; target: Position }`) to `src/engine/types.ts` and to the `Command` union; verify `npm run typecheck`
- [x] 2.2 Parameterize the melee damage computation in `src/engine/combat.ts` so the emitted `applied.kind` is settable (e.g. a `makeDamageResolver(kind)` factory, or a wrapper that overwrites `applied.kind = RANGED_DAMAGE_KIND`), and register a `RANGED_DAMAGE_KIND = 'ranged'` entry; `resolveMelee` currently hardcodes `MELEE_DAMAGE_KIND`, so a bare alias would emit the wrong kind; verify with a `combat` unit test asserting `resolveDamage('ranged', ...)` returns `applied.kind === 'ranged'` (`npm test -- combat`)
- [x] 2.3 Generalize the private `resolveAttack` in `src/engine/commands.ts` to accept a damage kind and implement `applyRangedAttack` (resolve equipped weapon = first carried item with a `ranged` descriptor, require a living in-range visible target via Chebyshev distance + `computeFov`, resolve with a synthetic `{ ...actor, attack: weapon.damage }` attacker); verify engine command tests pass
- [x] 2.4 Wire `ranged-attack` into `applyCommandWithPack` (malformed target → `noop('malformed-command')`) and leave `applyCommand` rejecting it as unknown; verify a content-free call emits an unknown-command noop
- [x] 2.5 Add `ranged-attack` to `CONTENT_DEPENDENT_COMMAND_TYPES` in `src/engine/save.ts`; verify `npm test -- save-load`
- [x] 2.6 Guard `applyUseItem` for `item.effect === undefined` (noop `item-has-no-effect`, no consumption); verify `npm test -- item-use`
- [x] 2.7 Export `RangedAttackCommand` and `RANGED_DAMAGE_KIND` from `src/engine/index.ts`; verify `npm test -- index-surface` and `npm run lint` (engine purity rules still pass)

## 3. Engine tests and regenerated golden values

- [x] 3.1 Add engine tests covering: an in-range visible hit deals seeded damage, emits an `attacked` event whose `kind` is `ranged`, and advances monsters; no ranged weapon, out-of-range, unseen, empty/non-living, and malformed target all no-op; a lethal hit removes the target; the weapon is not consumed; replay determinism; verify `npm test -- combat command-loop`
- [x] 3.2 Add a save-load test that a pack-free replay whose remainder contains `ranged-attack` throws the typed replay error naming it; verify `npm test -- save-load`
- [x] 3.3 Regenerate the pinned placement values in `src/engine/__tests__/level-placement-golden.test.ts` (the only golden test that loads the fantasy pack) after the pack gains an item; `src/engine/__tests__/e2e-seeded.test.ts` uses inline custom packs and is not affected; verify `npm test`

## 4. Map fit-to-width

- [x] 4.1 Add a primitive `size` prop to `src/ui/components/Tile.tsx` (use it for width/height/lineHeight/fontSize) while keeping `TILE_SIZE` as the fallback default; verify `npm run typecheck`
- [x] 4.2 In `src/ui/components/MapView.tsx` compute `tileSize = Math.max(1, Math.floor(viewport.width / grid.width))` after measurement, size the inner map from it, and pass `size` to each `Tile`; verify the full 40-column level fits the measured width and no column overflows
- [x] 4.3 Apply the conditional alignment rule per axis: center the map (`alignItems`/`justifyContent: 'center'`) when the fitted map does not overflow that axis, and keep `flex-start` when it overflows so the camera offset is measured from the map origin; verify by inspection that a fitted map is centered and an overflowing one is not
- [x] 4.4 Confirm the fitted width makes `axisOffset` return `0` horizontally and retain the clamped vertical camera; add/adjust a `src/ui/logic/camera.test.ts` case asserting the offset is `0` when the map axis is `<=` the viewport; verify `npm test -- camera`

## 5. Navigation: cross D-pad, tap-to-move, keyboard

- [x] 5.1 Rework `src/ui/components/Dpad.tsx` into a spatial cross (north above; west/east flanking; south below) and delete the directional attack row; verify by inspection that no `{ type: 'attack' }` dispatch remains and all four move directions are present
- [x] 5.2 Add a pure `directionForDelta(from, to)` helper to `src/ui/logic/input.ts` returning a `Direction` only for a cardinal-adjacent delta; verify with a new `src/ui/logic/input.test.ts` case set (`npm test -- input`)
- [x] 5.3 Handle taps in `MapView`: convert the touch location to a tile coordinate using the computed `tileSize` plus the alignment offset — subtract the per-axis centering margin when the axis is centered, or the camera translation when it overflows — and in normal mode dispatch `move` for a cardinal-adjacent tap (bump-to-attack happens in the engine); verify a tap test or manual browser check that a tap lands on the tile under the finger
- [x] 5.4 Remove the Shift+arrow `attack` mapping from `src/ui/logic/input.ts` and add a ranged target-mode toggle key for the web in `useKeyboardInput`; verify `npm test -- input` and `npm run typecheck`

## 6. Ranged attack UI

- [x] 6.1 Add a ranged-attack control to `src/ui/components/ActionBar.tsx` that is rendered only when `state.carriedItemIds` contains an id whose `pack.item(id)` declares `ranged`; verify by inspection and typecheck
- [x] 6.2 Lift target mode to `src/ui/screens/GameScreen.tsx` as ephemeral `useState`, wire the toggle from the ranged control, and cancel on a second press; verify target mode never enters `GameState`
- [x] 6.3 In ranged target mode, a `MapView` tap on a visible monster dispatches `{ type: 'ranged-attack', target: { x, y } }`, and a non-monster tap cancels without dispatch; verify `npm run typecheck` and a manual/browser flow (arm button → tap monster → shot resolves)
- [x] 6.4 Filter ranged weapon ids out of the carried-item "Use {itemId}" list in `src/ui/components/ActionBar.tsx` (skip ids where `pack.item(id).ranged !== undefined`), so a weapon is only fired via the ranged control and never offered as a consumable; verify by inspection that a carried ranged weapon renders no Use button and that `use-item` on it is never dispatched

## 7. Fresh seed per run

- [x] 7.1 Replace `DEFAULT_SEED = 1` in `src/ui/hooks/useGame.ts` with a `freshSeed()` helper used when no explicit `seed` prop is supplied, and derive a fresh seed in `newRun` (not `seedRef.current + 1`); keep the explicit-seed override; verify two consecutive new runs generate different levels and no `src/engine` file gained a time/random source (`npm run lint`)

## 8. Remembered stairs and HUD hint

- [x] 8.1 Change the stairs branch of `tileRender` in `src/ui/logic/glyphs.ts` to draw `STAIRS_GLYPH` when the tile is on the stairs and is visible or explored (dimmed when only explored), while monsters/items still render only when visible; verify with updated `glyphs.test.ts` cases
- [x] 8.2 Add a pure `stairsHint(from, stairs)` helper in `src/ui/logic/stairs.ts` returning an 8-way direction label and Chebyshev distance, and render it in `src/ui/components/Hud.tsx`; verify with a new `stairs.test.ts` and a HUD inspection
- [x] 8.3 Update `src/ui/logic/glyphs.test.ts` so the remembered-stairs case now expects `STAIRS_GLYPH` (it previously expected flat floor); verify `npm test -- glyphs stairs`

## 9. Safe-area insets

- [x] 9.1 Apply `useSafeAreaInsets()` top/bottom padding to the container in `src/ui/screens/GameScreen.tsx` for the play and pack-load error views; verify on-device/browser that the HUD clears the status bar and the controls clear the navigation bar
- [x] 9.2 Apply the same insets padding to `src/ui/components/GameOver.tsx`; verify the game-over content clears the top and bottom chrome

## 10. Integration verification

- [x] 10.1 Run `npm run lint`, `npm run typecheck`, and `npm test`; verify all pass, including the engine-purity ESLint rules and the regenerated golden values
- [ ] 10.2 Manually verify the full flow on the client (web and/or device): full level width visible with no 3-tile overflow; cross D-pad moves and bumps; ranged control appears only with a ranged weapon, targets a visible monster on tap, and consumes nothing; repeated new runs differ; stairs remain visible after leaving FOV and the HUD hint is shown; top/bottom chrome does not overlay the UI
