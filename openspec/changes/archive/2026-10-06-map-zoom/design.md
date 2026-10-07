# Design

## Context

See `proposal.md`. Today `MapView` fits tiles to the measured width (`src/ui/components/MapView.tsx:157-160`, `tileSize = floor(viewport.width / grid.width)`), derives the fitted map size from that `tileSize`, positions the map with `axisOffset` / `appliedAxisOffset` (`src/ui/logic/camera.ts`), and converts a tap to a tile with `floor((location - appliedOffset) / tileSize)` (`MapView.tsx:189-194`). Every downstream value is already a function of `tileSize`, so a single zoom multiplier is the natural extension point. The ephemeral map-tap modes (ranged target, travel) already live in `GameScreen` as `useState` and never enter `GameState`.

## Goals / Non-Goals

**Goals:**

- A legible, tappable map scale with explicit zoom-in / zoom-out controls and a visible current level.
- Correct camera and exact hit-testing at every zoom level.
- Zero engine, save, or content impact.

**Non-Goals:**

- Pinch-zoom or drag-to-pan gestures; smooth/animated zoom; a stored (persistent) zoom level.
- Changing field of view, sight radius, or anything gameplay-affecting.
- A minimap or an overview mode.

## Decisions

- **D1 — Zoom is ephemeral `GameScreen` state.** The zoom level lives in `GameScreen`, alongside `targetMode` / `travelMode`, and is passed to `MapView` and to the zoom controls. It is not stored in `GameState`. Alternative: state inside `MapView` — rejected because the controls belong with the other input controls in the input area.
- **D2 — A single tile-size source.** `MapView` computes `baseTileSize = measured ? max(1, floor(viewport.width / grid.width)) : TILE_SIZE` and then `tileSize = max(1, round(baseTileSize * zoomFactor))`. `fittedWidth` / `fittedHeight`, `centerX` / `centerY`, `axisOffset`, `appliedAxisOffset`, the tap conversion, the inner `View` dimensions, and each `Tile`'s `size` all consume that one `tileSize`, so camera and hit-testing follow automatically. The pre-layout fallback (`TILE_SIZE`) is zoomed too. The `max(1, …)` floor keeps the tile positive even if a future factor below `1/baseTileSize` is added.
- **D3 — Do NOT implement zoom with `transform: scale`.** React Native reports `onPress` `locationX` / `locationY` in the parent (untransformed) space; a scale transform would require inverse-scaling and re-deriving offsets. Scaling the layout `tileSize` keeps the existing, tested conversion correct.
- **D4 — Discrete, bounded levels.** Zoom is an ordered list of factors (starting `[0.5, 0.75, 1, 1.25, 1.5, 2, 3]`) with 1× at the fit-to-width base. Step and clamp logic lives in a pure `src/ui/logic/zoom.ts` helper so it is node-tested and cannot drift from the control. Alternative: continuous pinch — deferred (non-goal).
- **D5 — Integer tile sizes.** Round the zoomed tile size to an integer to avoid sub-pixel seams on Android and to keep the camera's tile alignment meaningful (the offset is already rounded).
- **D6 — Controls in the action bar; optional web wheel.** Zoom-in / zoom-out `Pressable`s render with the other action buttons and show the current level. The web-only keyboard hook may add wheel / `+` `-` as a convenience; no native gesture is added. This mirrors the existing web-only keyboard pattern.
- **D7 — Extract a pure tap→tile helper.** The touch→tile conversion is currently inline in `MapView.tsx:191-194`; extract it as a pure `tileAt(locationAxis, appliedOffset, tileSize)` (or `tileFromPoint`) in `src/ui/logic/camera.ts` so the zoomed round-trip can be unit-tested against the real code instead of a re-implemented formula. `MapView` calls the helper on both axes.

## Risks / Trade-offs

- [Fractional tile sizes → blurred edges / sub-pixel seams] → D5 rounds to an integer.
- [Hit-testing desyncs from rendering] → one `tileSize` source (D2); add a camera / zoom unit test asserting the tap→tile round-trip at several zoom levels.
- [Zoomed-in map exceeds the viewport, so the old "full width visible" guarantee no longer holds above 1×] → the `ui/glyph-renderer` delta re-scopes that guarantee to 1×; the camera centering / clamping scenarios still hold at every zoom.
- [Every `Tile` re-renders on zoom] → acceptable; `Tile` memo keys on the primitive `size`, so only a zoom change invalidates it.

## Open Questions

None.
