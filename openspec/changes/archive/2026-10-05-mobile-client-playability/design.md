# Design

## Context

See `proposal.md` — Why. The client is a pure `@engine` consumer: `src/ui/**` imports only the engine barrel and holds all rendering and input. The engine (`src/engine/**`) is pure TypeScript with injected seeded RNG, JSON-serializable state, and no `Math.random`/`Date`, enforced by ESLint. A level is 40×30 (`src/ui/state/createInitialState.ts`, `src/engine/commands.ts`) and tiles are a fixed 14 dp (`src/ui/components/Tile.tsx`), so the inner map is 560 dp wide while a phone viewport is ~360–410 dp. `MapView.tsx` currently clips and translates that map with a clamped camera (`src/ui/logic/camera.ts`); the user wants the whole level width visible instead. The only combat is melee: `move` into a living occupant resolves bump-to-attack (`src/engine/commands.ts` `applyMove`), and `attack` is an explicit direction command. Every pack item is a heal (`src/packs/*/pack.json`); packs declare no weapons. `SafeAreaProvider` is mounted (`src/app/_layout.tsx`) but no screen reads insets.

## Goals / Non-Goals

**Goals**

- Show the full level width on a phone without horizontal overflow, keeping the map readable and the player visible.
- Provide intuitive movement (spatial cross D-pad and map taps) and remove the redundant directional attack controls while preserving bump-to-attack.
- Add a deterministic, pack-driven ranged attack with a minimal targeting UI.
- Give each run a different level without touching engine randomness rules.
- Make the stairs findable after they leave field of view.
- Keep the play and game-over surfaces clear of OS chrome.

**Non-Goals**

- No equipment/inventory system, ammunition, reloading, or weapon durability.
- No long-range pathfinding for tap-to-move (only cardinal-adjacent taps move/bump).
- No new level generator or BSP parameter change (a fresh seed already varies layouts).
- No save-format bump: existing saves and logs remain replayable.

## Decisions

### D1 — Fit the map to the measured viewport width

`MapView` already measures its clipped viewport via `onLayout` and derives the camera per render. Change the tile side length from the constant in `Tile.tsx` to a value derived per render: `tileSize = Math.max(1, Math.floor(viewport.width / grid.width))`, uniform across the grid. `Tile` gains a primitive `size` prop (its memoization stays meaningful — `size` is a primitive). Because the fitted map width `grid.width * tileSize` is `<= viewport.width`, `axisOffset` in `camera.ts` already returns `0` for the horizontal axis, so no camera change is needed there. **Conditional alignment rule:** for each axis, when the fitted map size is `<=` the measured viewport size the viewport aligns the map to the center of that axis (`alignItems: 'center'` for the horizontal axis, `justifyContent: 'center'` for the vertical); when the fitted map overflows the axis it stays `flex-start` so `axisOffset` is measured from the map's origin. Keep the vertical camera for height overflow (the same `axisOffset` logic).

- **Alternatives.** (a) Keep 14 dp and let the camera clip: rejected — the user explicitly wants the full width visible. (b) Scale the whole inner map with a `transform: [{ scale }]`: rejected — RN text scaling blurs glyphs and makes hit-testing coordinates harder. (c) Fit both axes aggressively: rejected — on 40×30 the height fit would shrink tiles below useful legibility; fit-to-width + vertical camera keeps tiles as large as the width allows.

### D2 — Spatial cross D-pad + map taps for navigation

Replace the flat N/S/E/W row in `Dpad.tsx` with a plus-shaped layout (north above, west/east flanking, south below). Delete the second "Attack" row entirely — melee is already bump-to-attack in `applyMove`. Add tap-to-move on the map: a tap on a cardinal-adjacent tile dispatches `move` in that direction (the engine bumps if occupied). The pure direction resolution for a tap delta belongs in `src/ui/logic/input.ts` (add a `directionForDelta(from, to)` helper) so it is testable without a renderer.

- **Alternatives.** (a) 8-way thumbstick: rejected — the engine `Direction` union is four cardinal directions, and diagonals would need engine changes. (b) Swipe gestures: rejected — ambiguous in a scrolling/Accessibility context and hard to unit-test. (c) Tap-to-move only: rejected — imprecise for single-step play; the cross keeps precise control.

### D3 — Minimal ranged attack

**Pack data.** Add an optional `ranged: { range, damage }` descriptor to `packItemSchema` (`src/engine/schema/pack.ts`) and make `effect` optional, with a refinement requiring at least one of the two. An item is either a consumable (effect) or a weapon (ranged). The fantasy pack gains a ranged weapon item (e.g. `shortbow`, `range: 6`, `damage: 4`); the dogs pack may gain one too (data-only, demonstrating theme-agnosticism).

- **Alternatives.** (a) A new `effect` kind (`{ kind: 'ranged', range, damage }`): rejected — `effect` means "what happens when you use the item", and a weapon that noops or consumes itself on Use is semantically wrong. (b) A new top-level `weapons` collection: rejected — larger schema/loader change for one feature. (c) Required `effect` plus optional `ranged`: rejected — forces a heal effect onto a weapon. **No `PACK_VERSION` bump**: packs that already declare `effect` remain valid, and a pack with no ranged item simply has no ranged weapon (graceful degradation), so the additive optional field is not the "engine now requires it" case the version-bump requirement targets.

**Command.** Add `RangedAttackCommand = { type: 'ranged-attack'; target: Position }` to `src/engine/types.ts`, resolved only by `applyCommandWithPack` (it needs pack data), so `applyCommand` reports it as `unknown-command:ranged-attack`. Add it to `CONTENT_DEPENDENT_COMMAND_TYPES` in `src/engine/save.ts` so pack-free replay fails loudly instead of diverging.

- **Alternatives.** (a) Carry `itemId` in the command: rejected for the minimal interpretation — the user asked for a command that "takes an explicit target position", and "equipped" is being defined as carried. (b) Reuse the direction-bearing `attack` command with a tile: rejected — it would break the direction contract and the existing no-op semantics.

**"Equipped" semantics (assumption, recorded).** There is no equipment system. "Equipped" SHALL mean "currently carried": the engine picks the **first** id in `state.carriedItemIds` (in list order) whose pack entry declares `ranged`. Deterministic because the list is ordered and plain. If none, `noop('no-ranged-weapon')`. Firing does **not** remove the weapon (no ammo).

**Resolution.** In `applyRangedAttack(state, target, rng, pack)`: find actor and equipped weapon; `attackTargetAt` the target tile; require Chebyshev distance `<= weapon.range` (the same metric `computeFov` uses) and `computeFov(state.grid, actor.pos, DEFAULT_SIGHT_RADIUS)[targetIndex] === true` (wall-blocking and "tap a visible monster" fall out for free; pack ranges should stay `<= DEFAULT_SIGHT_RADIUS = 8`). Resolve via the existing combat machinery: register `RANGED_DAMAGE_KIND = 'ranged'` in `combat.ts` through a **kind-tagging resolver** — because `resolveMelee` hardcodes `applied.kind = MELEE_DAMAGE_KIND`, `DamageResolver` receives no registry key, and `resolveDamage` never passes one, the melee computation must be parameterized (a `makeDamageResolver(kind)` factory, or a registered wrapper that overwrites `applied.kind = RANGED_DAMAGE_KIND`) so the emitted event's `kind` is `ranged`. Generalize the private `resolveAttack` in `commands.ts` to accept a damage kind. Call it with a synthetic attacker `{ ...actor, attack: weapon.damage }` so the seeded `randInt(1, attack)` draw, `attacked` event (kind `ranged`), death removal, and player-death wiring are all reused; the synthetic object is constructed inline and never stored. A successful hit emits `attacked`, which is already in `ADVANCING_EVENT_TYPES`, so monsters advance exactly as for a melee hit.

- **Alternatives.** (a) Change `DamageResolver`/`resolveDamage` to take the damage amount or kind as an explicit argument: rejected — it ripples through the public resolver type and the AI call site; a kind-parameterized factory keeps the existing signature. (b) Inline damage/death handling in `applyRangedAttack`: rejected — duplicates `resolveAttack`'s permadeath logic. (c) Bresenham line-of-sight check: rejected — `computeFov` already provides visibility and blocker semantics with no new engine code. (d) No line-of-sight at all: rejected — allows shooting through walls.

**Why an engine change is correct here.** The project treats any engine change demanded by a pack as an abstraction leak to fix, but ranged combat is a new *capability*, not a pack needing a workaround. Implementing it in the UI would embed engine behavior (damage, RNG draws, death) in a client that cannot save or replay it, violating the purity rule. The change is scoped to the schema, the command union, one damage kind, one command branch, the save guard, and the barrel — all pure and deterministic, with no `Math.random`/`Date` and JSON-serializable state.

### D4 — Fresh seed per run, at the client boundary

Replace `DEFAULT_SEED = 1` in `src/ui/hooks/useGame.ts` with a `freshSeed()` helper (e.g. `Math.floor(Date.now() % 0x7fffffff) ^ (Math.random() * 0x7fffffff)`) used when no explicit `seed` prop is supplied, and derive a fresh seed in `newRun` instead of `seedRef.current + 1`. `createInitialState` already accepts a seed and is unchanged; the engine stays free of time/randomness. The `seed` prop override remains for tests/stories.

- **Alternatives.** (a) Seed inside the engine: rejected — violates the engine purity rule. (b) Keep incrementing: rejected — the *initial* run would still be seed 1 forever, which is the reported bug. (c) Ship a seed-selection UI: out of scope.

### D5 — Remember stairs, and hint at them in the HUD

In `src/ui/logic/glyphs.ts`, change the stairs branch of `tileRender` to draw `STAIRS_GLYPH` when `onStairs && (visible || explored)`, dimmed on explored-only tiles; the "no occupant on explored tiles" rule continues to apply to monsters and items (they render only when `visible`). Add a pure `stairsHint(from, stairs)` helper (new `src/ui/logic/stairs.ts`) returning an 8-way direction label and Chebyshev distance, and render it in `Hud.tsx`.

- **Alternatives.** (a) Only the remembered glyph: rejected — a stairs tile never yet explored still shows nothing, so a player who has not seen it is stuck. (b) Only a HUD hint: rejected — the remembered glyph is the direct, intuitive fix and cheap. Both together cover seen and unseen cases. (c) A minimap: out of scope.

### D6 — Safe-area insets in the game surfaces

Use `useSafeAreaInsets()` (from the already-installed `react-native-safe-area-context`, provider already mounted) in `GameScreen.tsx` and apply `paddingTop: insets.top` / `paddingBottom: insets.bottom` to the screen container; apply the same in `GameOver.tsx`. Padding is cross-platform and needs no native config change.

- **Alternatives.** (a) `app.json` translucent/edge-to-edge + `expo-status-bar`: rejected — platform-specific and brittle, and the user allowed either approach. (b) `SafeAreaView` from the same library: viable, but explicit insets padding keeps the flex layout (`mapArea: flex: 1`) predictable.

### D7 — Target mode is ephemeral client UI state

Target mode is a `useState` boolean in `GameScreen`, passed to `ActionBar` (toggle + visibility) and `MapView` (interpreting taps), reset when a shot is dispatched or cancelled. It is presentation-only and never enters `GameState`, preserving JSON-serializable, replayable engine state. The ranged control's visibility is derived from `state.carriedItemIds` plus `pack.item(id).ranged` (the UI already holds the loaded pack).

- **Alternatives.** (a) A context/store: viable but heavier than one boolean for two components. (b) Storing target mode in engine state: rejected — it is UI-only and would pollute the save/replay contract.

**Tap hit-testing.** Rather than mounting a `Pressable` per cell (1,200 pressables), wrap the grid in a single press handler that converts the touch location plus the known `tileSize`/offset into a tile coordinate, then dispatch the adjacent-move or ranged-target decision. The conversion SHALL account for the conditional alignment: when an axis is centered, subtract that axis's centering margin `(viewportAxis - mapAxis) / 2` first; when the axis overflows and the camera is translating, subtract the camera offset instead. The offset/margin used for hit-testing SHALL be exactly the one the renderer applied, so a tap lands on the tile the player sees.

## Risks / Trade-offs

- **Tiny tiles on very narrow screens** (fit-to-width on a 40-wide level gives ~9 dp tiles) → tiles stay readable enough for glyphs, and the height fit may allow centering; the trade-off is accepted to satisfy "full width visible".
- **Added pack item shifts seeded placements** and breaks the pinned golden test `level-placement-golden.test.ts` (the only golden test that loads the fantasy pack; `e2e-seeded.test.ts` uses inline custom packs and is unaffected) → regenerate its frozen expected values and note it as an intentional content-driven contract change.
- **Synthetic attacker could leak into state** → construct it inline as a call argument only; never assign it to `state.entities`.
- **Weapon range vs FOV radius mismatch** → keep authored ranges `<= DEFAULT_SIGHT_RADIUS` (8); the range gate and the visibility gate then agree.
- **Making `effect` optional ripples into TypeScript and runtime consumers** → `npm run typecheck` (`tsc --noEmit`, which includes `**/*.ts`) fails wherever code assumes `item.effect` is defined: `src/engine/__tests__/index-surface.test.ts:191` (`const effect: ItemEffect = item.effect;`), `src/packs/fantasy/__tests__/fantasy-pack.test.ts` (line 72 `expect(potion.effect).toEqual(...)` and lines 79/85–87 `item.effect.kind`), and `src/packs/dogs/__tests__/dogs-pack.test.ts:118` (`item.effect.kind`). Each SHALL be fixed by narrowing (`if (item.effect !== undefined)` or filtering to items that declare an effect) rather than casting. Additionally `applyUseItem` SHALL guard `item.effect === undefined` (noop `item-has-no-effect`), the schema test that asserts a missing effect fails SHALL now cover the effect-or-ranged rule, and the `ActionBar` SHALL filter ranged weapon ids out of the carried-item Use list.
- **Single press wrapper hit-testing** depends on layout offset math → reuse the same `tileSize`/offset values the renderer computed; keep the mapping in a pure helper for unit tests.
- **Removing Shift+arrow attack** could surprise web users → bump-to-attack remains the melee path and the README/help text can note it.
- **Safe-area padding alone on Android edge-to-edge** may still show translucent bars → padding keeps content clear of them; if needed, a follow-up can set edge-to-edge in `app.json`.

## Migration Plan

Single client release; no persisted-data migration. Existing saves (`SAVE_VERSION` unchanged at 1) replay unchanged because old logs contain no `ranged-attack`. Packs are additive. Deploy order: bump pack JSON + schema, then engine, then UI, then regenerate goldens; rollback is a normal revert since no data format changed.

## Open Questions

- Which ranged weapon(s) to author for the dogs pack (deferred; data-only).
- How to choose among multiple carried ranged weapons once more than one exists (deferred; this change deterministically uses the first carried ranged weapon).
- Whether to tune `DEFAULT_SIGHT_RADIUS` or weapon ranges for balance (deferred; not a structural decision).
