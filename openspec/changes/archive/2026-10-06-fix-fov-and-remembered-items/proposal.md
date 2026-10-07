# Proposal

## Why

Players report seeing monsters and items on tiles that are behind walls. Diagnosis shows the renderer only ever draws an occupant on a tile the engine marks visible, and `computeFov` never leaks past a straight orthogonal wall — but its recursive shadowcasting reveals tiles through a **diagonal gap between two non-passable tiles** (a wall corner), so an occupant wedged in such a gap renders as if seen through a wall. Separately, a floor item that has been seen is erased the moment it leaves field of view; players expect remembered items to remain on the map, dimmed.

## What Changes

- Tighten field of view: a tile SHALL NOT be visible when its line of sight passes through a diagonal gap between two non-passable tiles (standard corner occlusion). Blocking by a straight wall is unchanged, and seeing around the end of a single wall is retained.
- Render a **remembered floor item** on an explored-but-not-currently-visible tile in the dimmed explored treatment, so seen items persist on the map. Monsters remain hidden once out of view; stairs keep their existing dimmed rendering.
- The engine stays pure and deterministic, and the client remains a pure `@engine` consumer. Monster AI behavior is unchanged (see Impact).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `engine/field-of-view`: the visibility rule gains diagonal-gap (corner) occlusion.
- `ui/glyph-renderer`: remembered floor items are drawn dimmed on explored tiles, and the visibility-treatment requirement is clarified accordingly.

## Impact

- `src/engine/fov.ts`: diagonal-gap occlusion (pure; the grid and state are not mutated).
- `src/ui/logic/glyphs.ts`: `tileRender` draws a floor item on an explored-not-visible tile in the explored treatment.
- Tests: `src/engine/__tests__/fov.test.ts` (corner cases), `src/ui/logic/glyphs.test.ts` (remembered item), and any seeded test that pins an `explored` mask, which shrinks where a diagonal gap was the only sight line.
- Other `computeFov` consumers are affected in benign, test-covered ways and must be included in the verification sweep: `src/ui/logic/travel.ts` `hasVisibleLivingMonster` (the post-step `monster-visible` stop) and `src/ui/logic/ranged.ts` `rangedTargetAt` (which monsters are targetable). No requirement changes for them.
- AI behavior is **unchanged**: `chase`'s `playerVisible` calls `computeFov(..., DEFAULT_BEHAVIOR_RANGE = 8)` and its `inRange` check already covers the same Chebyshev radius, so `seesPlayer` is subsumed and the FOV tightening cannot change monster awareness.
- No save-format, schema, or pack change.
