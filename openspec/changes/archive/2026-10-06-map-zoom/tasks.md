# Tasks

## 1. Pure zoom logic

- [x] 1.1 Add `src/ui/logic/zoom.ts` with an ordered list of zoom factors (1× = the fit-to-width base), a `zoomFactor(level)` accessor, and `zoomIn` / `zoomOut` / `clampZoom` steppers; pure and framework-free (no React / RN import), importing only what it needs; verify `npx tsc --noEmit` and `npm run lint`
- [x] 1.2 Add `src/ui/logic/zoom.test.ts` covering the bounds (no-op at min/max), stepping in/out, and the default being 1×; verify `npx vitest run src/ui/logic/zoom.test.ts`
- [x] 1.3 Extract the inline touch→tile conversion (`MapView.tsx:191-194`) as a pure `tileAt(locationAxis, appliedOffset, tileSize)` helper in `src/ui/logic/camera.ts`, and extend `src/ui/logic/camera.test.ts` with zoomed tile sizes asserting `axisOffset` / `appliedAxisOffset` and that `tileAt` round-trips a touch point to the expected tile at a zoomed-in and a zoomed-out size; verify the tests pass

## 2. Zoom in the map view

- [x] 2.1 In `src/ui/components/MapView.tsx`, add a `zoom` factor prop and compute `tileSize` as `max(1, round(fit-to-width base × factor))` (including the pre-layout `TILE_SIZE` fallback); derive `fitted*`, the centering flags, the camera offsets, the tap conversion (via `tileAt` from 1.3), and each `Tile`'s `size` from that one value; verify `npx tsc --noEmit` and, by inspection, that no second tile-size computation remains
- [x] 2.2 Confirm `centerX` / `centerY` and `axisOffset` are evaluated against the zoomed `fitted*` so a zoomed-in map switches to `flex-start` + camera translation and a zoomed-out map centers; verify via the camera tests from 1.3

## 3. Ephemeral state and controls

- [x] 3.1 Add ephemeral `zoom` state to `src/ui/screens/GameScreen.tsx` (alongside `targetMode` / `travelMode`), pass the factor to `MapView`, and pass zoom-in / zoom-out callbacks plus the current level to the controls; verify `npx tsc --noEmit`
- [x] 3.2 Add zoom-in / zoom-out controls (and a current-level display) to `src/ui/components/ActionBar.tsx`, or a small dedicated control component, wired to the pure helpers and with accessibility labels; verify `npx tsc --noEmit` / lint and that a control press changes the rendered tile size
- [x] 3.3 (Optional, web-only) map `+` / `-` (and/or wheel) to zoom in `src/ui/hooks/useKeyboardInput.ts` through a pure mapper addition; verify native registers no listener and the mapping is unit-tested

## 4. Verification

- [x] 4.1 Verify no engine / save / content change: `git status --porcelain -- src/engine src/packs` is empty and a serialized run contains no zoom field
- [x] 4.2 Run `npm run lint`, `npx tsc --noEmit`, and `npm test`; verify all pass
- [x] 4.3 Confirm the `ui/glyph-renderer` delta in this change matches the implemented 1×-base behavior and run `openspec validate map-zoom --strict`
