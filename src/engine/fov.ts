/**
 * Field of view — recursive shadowcasting over the eight octants.
 *
 * Change `levelgen-and-fov` (tasks 2.1/2.3, design D4/D5): visibility is a
 * **pure, derived** computation from the current grid + observer position +
 * sight radius. It is never stored in `GameState`; the stored per-level record
 * is the **explored** mask, which is the append-only union of every tile ever
 * visible while on that level (`exploreInto`).
 *
 * The result is a flat row-major `boolean[]` indexed `y * width + x` — the same
 * indexing as `grid.passable` and `GameState.explored` (design D1). The function
 * does not mutate the grid and is deterministic: the same inputs always produce
 * the same output.
 *
 * This module is framework-free and uses no `Math.random`/`Date`; it satisfies
 * the `src/engine` purity boundary.
 */

import { inBounds } from './grid';
import type { Grid, Position } from './types';

/** The default sight radius (engine constant for v1; design D4). */
export const DEFAULT_SIGHT_RADIUS = 8;

/**
 * Octant transforms.
 *
 * `[xx, xy, yx, yy]` maps an octant-local offset `(col, row)` (where `row` is
 * the scan depth and `col` runs `0..row`) to an absolute grid offset:
 *
 *     x = origin.x + xx * col + xy * row
 *     y = origin.y + yx * col + yy * row
 *
 * There are eight of them (mirrors of the first octant, a 45° wedge from the
 * positive x-axis down toward the positive y-axis), so together they cover the
 * full circle. This is the standard Björn Bergström shadowcasting table.
 */
const OCTANTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/**
 * Computes the tiles visible from `origin` within `radius`, using recursive
 * shadowcasting over the eight octants.
 *
 * - The radius is measured as **Chebyshev distance** (`max(|dx|, |dy|) <= radius`).
 * - The origin tile is **always** visible, even when it is non-passable — a wall
 *   is seen rather than hidden by itself.
 * - A non-passable tile blocks tiles behind it but is itself marked visible; its
 *   shadow is recursed into so the next interval is scanned separately.
 * - An origin outside the grid returns an all-false array and does not throw.
 *
 * Pure: returns a fresh array and never mutates `grid`. Same inputs ⇒ same
 * output.
 */
export function computeFov(
  grid: Grid,
  origin: Position,
  radius: number,
): boolean[] {
  const size = grid.width * grid.height;
  const visible = new Array<boolean>(size).fill(false);

  if (!inBounds(grid, origin)) return visible;

  // The origin is always visible, before any radius check (radius 0 ⇒ origin
  // only; a non-passable origin is still "seen" rather than blocking itself).
  visible[origin.y * grid.width + origin.x] = true;
  if (radius < 1) return visible;

  for (const [xx, xy, yx, yy] of OCTANTS) {
    // Slopes run 1.0 (the near edge of the wedge) down to 0.0 (the axis), so the
    // initial visible interval is `[1.0, 0.0]`.
    castLight(grid, visible, origin, radius, 1, 0, 1, xx, xy, yx, yy);
  }

  return visible;
}

/**
 * Recursively scans one shadowcasting wedge.
 *
 * `row` is the current scan depth (Chebyshev ring), `(startSlope, endSlope)`
 * bound the visible interval at that depth, and `(xx, xy, yx, yy)` is the octant
 * transform (see `OCTANTS`). `visible` is mutated in place — it is the fresh
 * array created by `computeFov`, never a caller's array.
 */
function castLight(
  grid: Grid,
  visible: boolean[],
  origin: Position,
  radius: number,
  startSlope: number,
  endSlope: number,
  row: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
): void {
  if (startSlope < endSlope) return;
  if (row > radius) return;

  let slope = startSlope;
  let blocked = false;

  for (let distance = row; distance <= radius && !blocked; distance++) {
    for (let col = -distance; col <= 0; col++) {
      const deltaRow = -distance;
      const absoluteX = origin.x + xx * col + xy * deltaRow;
      const absoluteY = origin.y + yx * col + yy * deltaRow;

      // Slopes to the left/right edges of this cell as seen from the origin.
      const leftSlope = (col - 0.5) / (deltaRow + 0.5);
      const rightSlope = (col + 0.5) / (deltaRow - 0.5);

      // This cell lies entirely outside the interval already scanned.
      if (startSlope < rightSlope) {
        continue;
      }
      // Past the end of the interval; nothing more at this depth is visible.
      if (endSlope > leftSlope) {
        break;
      }

      // In bounds and within the Chebyshev radius ⇒ visible. (The depth loop
      // already enforces the radius bound; the explicit check documents it and
      // guards against any transform arithmetic.)
      if (
        absoluteX >= 0 &&
        absoluteY >= 0 &&
        absoluteX < grid.width &&
        absoluteY < grid.height &&
        Math.max(
          Math.abs(absoluteX - origin.x),
          Math.abs(absoluteY - origin.y),
        ) <= radius
      ) {
        visible[absoluteY * grid.width + absoluteX] = true;
      }

      if (blocked) {
        // We were inside a wall's shadow and this cell is opaque: the shadow
        // continues, so advance the interval's start edge.
        if (!tileBlocks(grid, absoluteX, absoluteY)) {
          blocked = false;
          startSlope = slope;
        } else {
          slope = rightSlope;
        }
      } else if (col > -distance && tileBlocks(grid, absoluteX, absoluteY)) {
        // A wall just started inside a visible interval: enclose the visible
        // band above it by recursing, then continue below the shadow.
        blocked = true;
        castLight(
          grid,
          visible,
          origin,
          radius,
          startSlope,
          leftSlope,
          distance + 1,
          xx,
          xy,
          yx,
          yy,
        );
        slope = rightSlope;
      }
    }
  }
}

/**
 * Reports whether a tile blocks sight. Anything outside the grid blocks (sight
 * is not projected through the map edge), as does an in-bounds non-passable
 * tile.
 */
function tileBlocks(grid: Grid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return true;
  return grid.passable[y * grid.width + x] !== true;
}

/**
 * Returns a **new** array that is the element-wise OR of the explored mask and
 * the freshly computed visibility, i.e. `explored OR visible`.
 *
 * The explored record only ever grows (a tile that was once `true` stays
 * `true`), which is the monotonicity the field-of-view spec requires while on a
 * level. Neither input is mutated. The inputs are expected to have the same
 * length (generally `width * height`).
 */
export function exploreInto(
  explored: boolean[],
  visible: boolean[],
): boolean[] {
  const result = new Array<boolean>(explored.length);
  for (let index = 0; index < explored.length; index++) {
    result[index] = explored[index] === true || visible[index] === true;
  }
  return result;
}
