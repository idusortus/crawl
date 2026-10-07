/**
 * Pure unit tests for the camera-offset helper (change `ui-fit-and-persistence`,
 * design D1/D5; task 1.1).
 *
 * No React, no React Native — this file runs under the node Vitest environment
 * (the `src/ui` test glob). Every assertion is an **exact** integer:
 * both `TILE_SIZE` and `onLayout` measurements are dp, so no rounding tolerance
 * is appropriate (design D5).
 */

import { describe, expect, it } from 'vitest';

import { appliedAxisOffset, axisOffset, tileAt } from './camera';

// A 40x30 map at the shipped `TILE_SIZE = 14` (design D1): 560x420 dp.
const TILE_SIZE = 14;
const MAP_X = 40 * TILE_SIZE; // 560
const MAP_Y = 30 * TILE_SIZE; // 420
const VIEWPORT_X = 360;
const VIEWPORT_Y = 640;

describe('axisOffset', () => {
  it('centres the player tile in the viewport', () => {
    // offset = 360/2 - 20*14 = 180 - 280 = -100, inside [-200, 0].
    expect(axisOffset(MAP_X, VIEWPORT_X, 20, TILE_SIZE)).toBe(-100);
    // offset = 640/2 - 20*14 = 320 - 280 = 40 → clamped to 0 (map fits on Y).
    expect(axisOffset(MAP_Y, VIEWPORT_Y, 20, TILE_SIZE)).toBe(0);
  });

  it('clamps at the left/top map edge (never a positive/blank margin)', () => {
    // offset = 180 - 0*14 = +180 → clamped to 0 by the upper bound.
    expect(axisOffset(MAP_X, VIEWPORT_X, 0, TILE_SIZE)).toBe(0);
    // Just past half a viewport: 180 - 12*14 = 180 - 168 = 12 → clamped to 0.
    // 12 tiles * 14 = 168 dp < 180 dp (half a viewport), so the edge clamp holds.
    expect(axisOffset(MAP_X, VIEWPORT_X, 12, TILE_SIZE)).toBe(0);
    // 13 tiles * 14 = 182 dp > 180 dp, so centring is now negative and active.
    expect(axisOffset(MAP_X, VIEWPORT_X, 13, TILE_SIZE)).toBe(-2);
  });

  it('clamps at the right/bottom map edge (no pull past the map)', () => {
    // offset = 180 - 39*14 = 180 - 546 = -366, clamped up to -200.
    expect(axisOffset(MAP_X, VIEWPORT_X, 39, TILE_SIZE)).toBe(-200);
    // offset = 320 - 29*14 = 320 - 406 = -86, clamped up to -420+640? No:
    // map (420) fits viewport (640), so the range is [0, 0] and the result is 0.
    expect(axisOffset(MAP_Y, VIEWPORT_Y, 29, TILE_SIZE)).toBe(0);
  });

  it('returns exactly 0 when the map fits the viewport axis (range [0, 0])', () => {
    // Map narrower than the viewport: range min(0, 200 - 360) = 0 → [0, 0].
    expect(axisOffset(200, 360, 5, TILE_SIZE)).toBe(0);
    expect(axisOffset(200, 360, 40, TILE_SIZE)).toBe(0);
    // Exactly equal: min(0, 0) = 0 → [0, 0].
    expect(axisOffset(360, 360, 25, TILE_SIZE)).toBe(0);
  });

  it('returns exactly 0 for the fitted map width (fit-to-width, task 4.4)', () => {
    // `MapView` derives tileSize = floor(viewport / grid.width); the fitted map
    // width is then `<=` the viewport, so the horizontal axis is centred by the
    // layout and the camera offset must be 0 at every player column.
    const gridWidth = 40;
    const tileSize = Math.max(1, Math.floor(VIEWPORT_X / gridWidth)); // 9
    const fittedWidth = gridWidth * tileSize; // 360
    expect(fittedWidth).toBeLessThanOrEqual(VIEWPORT_X);
    for (let x = 0; x < gridWidth; x += 1) {
      expect(axisOffset(fittedWidth, VIEWPORT_X, x, tileSize)).toBe(0);
    }
  });

  it('returns 0 when the viewport is unmeasured (safe first render)', () => {
    expect(axisOffset(MAP_X, 0, 20, TILE_SIZE)).toBe(0);
    expect(axisOffset(MAP_Y, 0, 20, TILE_SIZE)).toBe(0);
    expect(axisOffset(MAP_X, Number.NaN, 20, TILE_SIZE)).toBe(0);
  });

  it('produces an integer, tile-aligned offset for a phone-sized viewport', () => {
    const offset = axisOffset(MAP_X, 412, 20, TILE_SIZE);
    // offset = 206 - 280 = -74, integer and not fractional.
    expect(offset).toBe(-74);
    expect(Number.isInteger(offset)).toBe(true);
  });

  it('keeps the player tile visible at every step across a full east sweep', () => {
    // The player's tile in viewport coordinates is the map offset plus the tile
    // origin; the tile is visible iff that origin lies within [0, viewport].
    for (let x = 0; x < 40; x += 1) {
      const offset = axisOffset(MAP_X, VIEWPORT_X, x, TILE_SIZE);
      const tileLeft = offset + x * TILE_SIZE;
      expect(tileLeft).toBeGreaterThanOrEqual(0);
      expect(tileLeft + TILE_SIZE).toBeLessThanOrEqual(VIEWPORT_X);
    }
  });
});

describe('appliedAxisOffset', () => {
  it('uses the centring margin when the fitted map fits the axis', () => {
    // Fitted 360 dp in a 412 dp viewport → margin (412 - 360) / 2 = 26; the
    // camera translation is 0 (the axis fits), and the layout margin is what a
    // touch must subtract.
    const tileSize = 9;
    const fittedWidth = 40 * tileSize; // 360
    const cameraOffset = axisOffset(fittedWidth, 412, 20, tileSize); // 0
    expect(cameraOffset).toBe(0);
    expect(appliedAxisOffset(fittedWidth, 412, cameraOffset)).toBe(26);
  });

  it('uses the camera translation when the fitted map overflows the axis', () => {
    // Overflowing vertical axis: the map is pinned to flex-start, so the applied
    // offset is exactly the camera translation.
    const cameraOffset = axisOffset(MAP_Y, 200, 20, TILE_SIZE);
    expect(cameraOffset).toBeLessThan(0);
    expect(appliedAxisOffset(MAP_Y, 200, cameraOffset)).toBe(cameraOffset);
  });
});

// Zoomed tile sizes (change `map-zoom`, design D2/D5; task 1.3). The base tile
// size is the fit-to-width `floor(360 / 40) = 9`; `MapView` then rounds
// `base * factor` (D5). `Math.round(9 * 1.5) = 14`, `Math.round(9 * 0.5) = 5`.
describe('axisOffset / appliedAxisOffset at zoomed tile sizes', () => {
  const GRID_WIDTH = 40;
  const GRID_HEIGHT = 30;
  const BASE = Math.max(1, Math.floor(VIEWPORT_X / GRID_WIDTH)); // 9

  it('overflows horizontally when zoomed in, so the camera translates', () => {
    const tileSize = Math.max(1, Math.round(BASE * 1.5)); // 14
    const fittedWidth = GRID_WIDTH * tileSize; // 560
    expect(fittedWidth).toBeGreaterThan(VIEWPORT_X);
    const offset = axisOffset(fittedWidth, VIEWPORT_X, 20, tileSize);
    expect(offset).toBe(-100);
    // Overflow: the applied offset is the camera translation, not a margin.
    expect(appliedAxisOffset(fittedWidth, VIEWPORT_X, offset)).toBe(-100);
  });

  it('still centres a zoomed-out map that fits the viewport', () => {
    const tileSize = Math.max(1, Math.round(BASE * 0.5)); // 5
    const fittedWidth = GRID_WIDTH * tileSize; // 200
    expect(fittedWidth).toBeLessThan(VIEWPORT_X);
    const offset = axisOffset(fittedWidth, VIEWPORT_X, 20, tileSize);
    expect(offset).toBe(0);
    // Fit: the applied offset is the centring margin (360 - 200) / 2 = 80.
    expect(appliedAxisOffset(fittedWidth, VIEWPORT_X, offset)).toBe(80);
  });

  it('centres the zoomed-in vertical axis because it still fits', () => {
    const tileSize = Math.max(1, Math.round(BASE * 1.5)); // 14
    const fittedHeight = GRID_HEIGHT * tileSize; // 420
    expect(fittedHeight).toBeLessThan(VIEWPORT_Y);
    expect(axisOffset(fittedHeight, VIEWPORT_Y, 20, tileSize)).toBe(0);
    // (640 - 420) / 2 = 110.
    expect(appliedAxisOffset(fittedHeight, VIEWPORT_Y, 0)).toBe(110);
  });
});

// The tap→tile round-trip at zoomed sizes (change `map-zoom`, design D7; task
// 1.3). A touch at the centre of a drawn tile must resolve back to that tile,
// using exactly the applied offset the renderer positioned the map with.
describe('tileAt', () => {
  const GRID_WIDTH = 40;
  const BASE = Math.max(1, Math.floor(VIEWPORT_X / GRID_WIDTH)); // 9

  it('round-trips a touch centre to its tile when zoomed in', () => {
    const tileSize = Math.max(1, Math.round(BASE * 1.5)); // 14
    const fittedWidth = GRID_WIDTH * tileSize; // 560 (overflows)
    const appliedX = appliedAxisOffset(
      fittedWidth,
      VIEWPORT_X,
      axisOffset(fittedWidth, VIEWPORT_X, 20, tileSize),
    ); // -100
    expect(appliedX).toBe(-100);
    // Tile 10 spans [appliedX + 140, appliedX + 154) = [40, 54); its centre 47.
    const locationX = appliedX + 10 * tileSize + Math.floor(tileSize / 2); // 47
    expect(tileAt(locationX, appliedX, tileSize)).toBe(10);
    // The tile's left edge and last pixel both stay on tile 10.
    expect(tileAt(appliedX + 10 * tileSize, appliedX, tileSize)).toBe(10);
    expect(tileAt(appliedX + 11 * tileSize - 1, appliedX, tileSize)).toBe(10);
  });

  it('round-trips a touch centre to its tile when zoomed out', () => {
    const tileSize = Math.max(1, Math.round(BASE * 0.5)); // 5
    const fittedWidth = GRID_WIDTH * tileSize; // 200 (fits, centred)
    const appliedX = appliedAxisOffset(
      fittedWidth,
      VIEWPORT_X,
      axisOffset(fittedWidth, VIEWPORT_X, 20, tileSize),
    ); // 80
    expect(appliedX).toBe(80);
    // Tile 10 spans [80 + 50, 80 + 55) = [130, 135); its centre 132.
    const locationX = appliedX + 10 * tileSize + Math.floor(tileSize / 2); // 132
    expect(tileAt(locationX, appliedX, tileSize)).toBe(10);
  });

  it('matches the inline floor conversion it replaces', () => {
    const tileSize = 14;
    const appliedOffset = -100;
    for (const location of [-100, -87, 0, 47, 200, 359]) {
      expect(tileAt(location, appliedOffset, tileSize)).toBe(
        Math.floor((location - appliedOffset) / tileSize),
      );
    }
  });
});
