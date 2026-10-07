/**
 * Pure camera-offset math for the map viewport (change `ui-fit-and-persistence`,
 * design D1/D5; task 1.1).
 *
 * Framework-free on purpose — no React, no React Native — so the offset can be
 * unit-tested under the node Vitest environment (the `src/ui` glob), exactly like
 * `glyphs.ts`/`input.ts`/`save.ts`. The renderer (`MapView`) owns measuring the
 * viewport; this module owns only the deterministic translation it applies.
 *
 * The camera is a pure function of the player position and the measured viewport:
 * the offset is the same for a given `(map, viewport, player)` and never animates.
 */

/**
 * The canonical clamp range for one axis, **stated once** (design D1).
 *
 * The lower bound is `min(0, viewportAxis - mapAxis)` and the upper bound is `0`.
 * For a map larger than the viewport this is `[viewportAxis - mapAxis, 0]`
 * (e.g. 560 dp map in a 360 dp viewport → `[-200, 0]`), the exact negative
 * translation available before the map's right edge is pulled past the viewport.
 * When the map fits (`mapAxis <= viewportAxis`) the lower bound collapses to `0`
 * and the range is `[0, 0]`, so a map smaller than the viewport is never offset.
 *
 * NOTE on design D1 wording: the design text states this range as
 * `min(0, mapAxis - viewportAxis)`, which for `mapAxis > viewportAxis` evaluates
 * to `+200` and would make the range `[0, 0]` — i.e. the camera would never
 * translate and a player past the first viewport-width would walk off-screen,
 * contradicting the requirement "the player's tile remains within the viewport"
 * (spec `ui/glyph-renderer`). The mathematically consistent expression that
 * satisfies every property D1 lists is the operand-swapped `min(0, viewportAxis -
 * mapAxis)` used here. See `decisions.md` for the recorded correction.
 */
function clampRange(mapAxis: number, viewportAxis: number): [number, number] {
  return [Math.min(0, viewportAxis - mapAxis), 0];
}

/**
 * Computes the camera offset in dp for a single axis.
 *
 * The offset centres the player's tile within the viewport using the tile's
 * top-left origin (`playerAxisTiles * tileSize`), then clamps it to
 * {@link clampRange}. Both the map and viewport axes are dp and `tileSize` is dp,
 * so the result is an exact integer and the map stays tile-aligned (no sub-pixel
 * seams between translated tiles on Android).
 *
 * @param mapAxis - The full map size on this axis in dp (`grid.width * TILE_SIZE`).
 * @param viewportAxis - The measured visible viewport size on this axis in dp.
 *   `0` (or non-finite) before `onLayout` has fired; the result is then `0`, so
 *   the safe first render shows the map's top-left.
 * @param playerAxisTiles - The player's tile coordinate on this axis (`player.pos.x`/`.y`).
 * @param tileSize - The tile side length in dp (`TILE_SIZE`).
 * @returns A clamped, tile-aligned integer offset in dp, in the range
 *   `[min(0, viewportAxis - mapAxis), 0]` (exactly `0` when the axis is
 *   unmeasured or the map fits).
 */
export function axisOffset(
  mapAxis: number,
  viewportAxis: number,
  playerAxisTiles: number,
  tileSize: number,
): number {
  // Unmeasured (or otherwise unusable) viewport: no camera yet, no error. The
  // map renders at its top-left and adopts the correct offset once measured.
  if (!Number.isFinite(viewportAxis) || viewportAxis <= 0) {
    return 0;
  }

  const centred = viewportAxis / 2 - playerAxisTiles * tileSize;
  const [min, max] = clampRange(mapAxis, viewportAxis);
  return Math.round(Math.min(Math.max(centred, min), max));
}

/**
 * Resolves the dp offset actually applied to the map on one axis, for
 * hit-testing a tap (change `mobile-client-playability`, design D7; task 5.3).
 *
 * When the fitted map fits the viewport on the axis it is centred by the layout,
 * so the offset a touch must be measured against is the centring margin
 * `(viewportAxis - fittedAxis) / 2` (the camera translation is then `0`). When
 * the map overflows the axis it is pinned to `flex-start` and the camera
 * translation moved it, so that translation is the applied offset. Using exactly
 * this value for the touch→tile conversion makes a tap land on the tile under
 * the finger.
 *
 * @param fittedAxis - The fitted map size on this axis in dp (`grid.width * tileSize`).
 * @param viewportAxis - The measured viewport size on this axis in dp.
 * @param cameraOffset - The camera translation on this axis in dp ({@link axisOffset}).
 * @returns The dp offset applied to the map's origin before a tile is drawn.
 */
export function appliedAxisOffset(
  fittedAxis: number,
  viewportAxis: number,
  cameraOffset: number,
): number {
  return fittedAxis <= viewportAxis
    ? (viewportAxis - fittedAxis) / 2
    : cameraOffset;
}

/**
 * Resolves a touch coordinate on one axis to the tile index drawn under it
 * (change `map-zoom`, design D7; task 1.3).
 *
 * This is the exact conversion `MapView` applied inline before zoom
 * (`floor((locationAxis - appliedOffset) / tileSize)`), extracted so the zoomed
 * tap round-trip can be unit-tested against the real code. The caller supplies
 * the dp offset actually applied to the map origin on that axis
 * ({@link appliedAxisOffset}) and the current tile side length, so both the
 * camera translation and a zoomed `tileSize` are handled without a second copy
 * of the formula.
 *
 * `tileSize` is assumed positive — `MapView` derives it as `max(1, …)` (design
 * D2) — so the division is always finite. The result is an unclamped tile index
 * (it may be negative or past the grid in the centring margin); callers bound it
 * against the grid before use.
 */
export function tileAt(
  locationAxis: number,
  appliedOffset: number,
  tileSize: number,
): number {
  return Math.floor((locationAxis - appliedOffset) / tileSize);
}
