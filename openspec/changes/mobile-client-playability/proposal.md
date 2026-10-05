# Proposal

## Why

The Expo/React Native client is playable but has six concrete usability blockers reported against the current build: the 40-tile-wide map overflows the phone horizontally, the movement controls are an unintuitive flat row with redundant directional attack arrows, there is no ranged attack, every run is byte-identical because the seed is hard-coded, the stairs become unfindable once they leave field of view, and the OS status/navigation bars overlay the top and bottom of the play screen. Fixing these makes the existing engine actually usable on a phone.

## What Changes

- **Map fits the screen width.** Size map tiles from the measured viewport so the full 40-tile level width is visible instead of overflowing ~3 tiles past each screen edge; keep the vertical camera for any height overflow and center the map when it fits.
- **Intuitive navigation.** Replace the flat N/S/E/W move row with a spatial cross D-pad, and **remove the directional attack arrows**. Melee remains reachable through the existing bump-to-attack (moving into a living occupant resolves an attack). Add tap-to-move on a cardinal-adjacent map tile (which bumps when occupied).
- **Ranged attacks (intentional, scoped `src/engine` exception).** Add a ranged weapon to the pack (range + damage), a new pack-aware `ranged-attack` command that takes an explicit target position and resolves seeded damage, and a client control that appears only when a ranged weapon is carried, enters target mode, and fires when the player taps a monster. "Equipped" is interpreted as "currently carried" (there is no equipment system). The change to `src/engine` is deliberate and bounded; rationale is recorded in `design.md`.
- **A different map each run.** Derive a fresh seed per new run at the UI layer (the UI may use time/random; the engine must not), replacing the hard-coded `DEFAULT_SEED = 1`.
- **Findable stairs.** Draw the stairs glyph on explored (remembered) tiles as well as currently visible ones, and add a HUD direction/distance hint to the stairs.
- **Safe areas.** Apply `useSafeAreaInsets()` top/bottom padding in the game screen (play, error, and game-over surfaces) so the OS status bar and navigation bar no longer overlay the UI.

## Capabilities

### New Capabilities

<!-- None: every change lands in an existing capability. -->

### Modified Capabilities

- `content/pack-format`: items may declare an optional ranged-weapon descriptor (`ranged: { range, damage }`); `effect` becomes optional but an item SHALL declare at least one of `effect`/`ranged`.
- `engine/combat`: a ranged attack resolves seeded damage against a visible target within the equipped weapon's range, reusing death/removal and permadeath, and tags its damage event as kind `ranged`.
- `engine/command-loop`: a pack-aware `ranged-attack` command taking an explicit target position, with the same no-op/advance contract as other commands.
- `engine/item-use`: using an effect-less item (a ranged weapon) is a no-op that consumes nothing.
- `engine/save-load`: pack-free replay now treats `ranged-attack` as content-dependent and fails loudly on it like `use-item`/`descend`.
- `ui/glyph-renderer`: fit-to-width tile sizing so the full level width is visible; stairs rendered on remembered tiles; HUD stairs direction/distance hint.
- `ui/input-mapping`: spatial cross D-pad for movement; directional attack controls removed; ranged attack control with target mode and tap-to-fire; tap-to-move on adjacent tiles.
- `ui/app-shell`: fresh per-run seed at the client boundary; safe-area insets applied to the game and game-over screens.

## Impact

- **Content data:** `src/packs/fantasy/pack.json` (and optionally `src/packs/dogs/pack.json`) gain a ranged-weapon item; existing items are unchanged. Adding an item changes `items.length` and introduces an effect-less item, so the pinned placement golden `src/engine/__tests__/level-placement-golden.test.ts` (the only test that loads the fantasy pack) and the pack tests `src/packs/fantasy/__tests__/fantasy-pack.test.ts` / `src/packs/dogs/__tests__/dogs-pack.test.ts` must be updated for the new count and for items that carry no `effect`.
- **Engine:** `src/engine/schema/pack.ts` (item schema), `src/engine/types.ts` (`RangedAttackCommand`, command union), `src/engine/combat.ts` (ranged damage kind), `src/engine/commands.ts` (`applyRangedAttack`), `src/engine/save.ts` (content-dependent command set), `src/engine/index.ts` (public exports). All changes preserve purity (no `Math.random`/`Date`, JSON-serializable state, content-as-data).
- **UI:** `src/ui/components/Tile.tsx`, `MapView.tsx`, `Dpad.tsx`, `ActionBar.tsx`, `Hud.tsx`, `GameOver.tsx`; `src/ui/screens/GameScreen.tsx`; `src/ui/hooks/useGame.ts`, `useKeyboardInput.ts`; `src/ui/logic/glyphs.ts`, `camera.ts`, `input.ts`, and the new `stairs.ts`. `src/ui/state/createInitialState.ts` is unchanged (it already accepts a seed).
- **Tests:** engine command/combat/save/schema/item-use tests; the type-level consumers of `PackItem.effect` (`src/engine/__tests__/index-surface.test.ts`, both pack tests) that must be narrowed now that `effect` is optional; UI `glyphs.test.ts`/`camera.test.ts`/`input.test.ts` plus a new `stairs.test.ts`; and the pinned `src/engine/__tests__/level-placement-golden.test.ts` values. `src/engine/__tests__/e2e-seeded.test.ts` uses inline packs and is unaffected.
- **Non-goals:** no equipment/inventory UI, no ammunition tracking or weapon durability, no pathfinding for long-distance tap-to-move, no BSP parameter changes for extra layout variety (a fresh seed already makes runs differ), no redesign of the visual theme.
