# Tasks

## 1. Diagonal-gap occlusion

- [x] 1.1 In `src/engine/fov.ts`, after the octant shadowcast, add a pure restrictive-corner pass that removes any visible tile seen only through a two-wall diagonal corner. Implement per design D1: flood from the origin through **passable, already-visible** tiles only (4-neighbour steps always allowed; a diagonal step allowed only if at least one shared orthogonal tile is passable), then keep only the origin, flooded tiles, and non-passable tiles 4-adjacent to a flooded tile. Traversing from/into non-passable tiles would re-admit the corner. Keep the origin always visible and never mutate the inputs; verify `npx tsc --noEmit` and `npx eslint src/engine --no-warn-ignored`
- [x] 1.2 Add `src/engine/__tests__/fov.test.ts` cases: the two-wall diagonal corner is not visible; a tile diagonally past a single wall end remains visible; an open diagonal area is visible; determinism and no-mutation still hold; verify `npx vitest run src/engine/__tests__/fov.test.ts`
- [x] 1.3 Audit existing FOV / explored expectations that pinned a diagonal-gap sight line and update them to the new rule; verify `npm test` passes and `git status --porcelain -- src/engine` shows only `fov.ts` and its tests changed

## 2. Remembered items

- [x] 2.1 In `src/ui/logic/glyphs.ts`, extend `tileRender` so an explored-but-not-currently-visible tile holding a floor item draws the item's pack glyph in the dimmed explored treatment; import `isFeature` from `@engine` under an alias (e.g. `isFeature as isItemEntity`) or rename the existing local `isFeature` boolean in `tileRender` (`glyphs.ts:199`) to avoid the name collision; monsters stay hidden and remembered stairs are unchanged; keep the visible-tile precedence intact; verify `npx tsc --noEmit`
- [x] 2.2 Add `src/ui/logic/glyphs.test.ts` cases: an explored-not-visible item shows the item glyph dimmed; an explored-not-visible monster shows flat terrain; an explored-not-visible stairs tile still shows `>` dimmed; an item on a remembered stairs tile shows the item; verify `npx vitest run src/ui/logic/glyphs.test.ts`

## 3. Spec alignment and verification

- [x] 3.1 Confirm AI is unaffected: add or keep a `monster-ai` test showing a `chase` monster within Chebyshev 8 pursues regardless of the FOV tightening, and that `advanceMonsters` output is unchanged for a fixed seed; verify `npx vitest run src/engine/__tests__`
- [x] 3.2 Verify purity: `npx eslint src/engine --no-warn-ignored` reports no React / RN / `Math.random` / `Date` usage in `fov.ts`
- [x] 3.3 Run `npm run lint`, `npx tsc --noEmit`, and `npm test`; verify all pass; run `openspec validate fix-fov-and-remembered-items --strict`
