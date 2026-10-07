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
 * - A tile seen only through a **two-wall diagonal corner** (both orthogonal
 *   tiles sharing that corner non-passable) is removed by a restrictive corner
 *   pass after the shadowcast; the pass only ever removes tiles.
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

  removeCornerLeaks(grid, visible, origin, radius);

  return visible;
}

/** The eight single-step neighbour offsets, in a fixed order (determinism). */
const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * Restrictive corner pass (change `fix-fov-and-remembered-items`, design D1).
 *
 * The shadowcast above is permissive: it can mark a tile visible through a
 * diagonal gap between two non-passable tiles (a two-wall corner). This pass
 * removes exactly those tiles and never adds any, so it cannot reveal anything
 * the shadowcast did not:
 *
 * 1. Flood from the origin through **passable, already-visible** tiles within
 *    the same Chebyshev radius. A 4-neighbour step to such a tile is always
 *    allowed; a diagonal step is allowed only when at least one of the two
 *    orthogonal tiles sharing the corner is passable ("no squeezing through a
 *    corner"). The flood seeds from the origin even when it is non-passable,
 *    because the origin is always visible, but it only ever lands on passable
 *    tiles — propagating from or into a wall would re-admit the corner through
 *    the wall's orthogonal neighbour.
 * 2. Keep a shadowcast-visible tile only if it is the origin, a tile reached by
 *    the flood, or a non-passable tile 4-adjacent to a flooded tile (so blocking
 *    walls, and the walls lining a seen corridor, stay visible).
 *
 * `visible` is the freshly created array from `computeFov` (never a caller's
 * array) and is updated in place. The grid is only read.
 */
function removeCornerLeaks(
  grid: Grid,
  visible: boolean[],
  origin: Position,
  radius: number,
): void {
  const { width, height } = grid;
  const total = width * height;
  const originIndex = origin.y * width + origin.x;

  const reachable = new Array<boolean>(total).fill(false);
  reachable[originIndex] = true;
  const queue: number[] = [originIndex];

  // `queue` only grows, so a head index walks it without shifting.
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const currentX = index % width;
    const currentY = Math.floor(index / width);

    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;

      const nextIndex = nextY * width + nextX;
      if (reachable[nextIndex]) continue;
      // The flood may only land on a passable, shadowcast-visible tile within
      // the radius.
      if (!visible[nextIndex] || tileBlocks(grid, nextX, nextY)) continue;
      if (
        Math.max(Math.abs(nextX - origin.x), Math.abs(nextY - origin.y)) > radius
      ) {
        continue;
      }
      // A diagonal step must not squeeze between two non-passable tiles.
      if (dx !== 0 && dy !== 0) {
        const cornerPassable =
          !tileBlocks(grid, currentX + dx, currentY) ||
          !tileBlocks(grid, currentX, currentY + dy);
        if (!cornerPassable) continue;
      }

      reachable[nextIndex] = true;
      queue.push(nextIndex);
    }
  }

  for (let index = 0; index < total; index++) {
    // Keep the origin, every flooded tile, and anything not shadowcast-visible.
    if (!visible[index] || index === originIndex || reachable[index]) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    // A non-passable tile 4-adjacent to a flooded tile stays visible (the wall
    // itself, and corridor walls). Every other non-reached tile is a leak.
    if (
      tileBlocks(grid, x, y) &&
      hasReachableOrthogonal(reachable, width, height, x, y)
    ) {
      continue;
    }
    visible[index] = false;
  }
}

/** True when any in-bounds 4-neighbour of `(x, y)` was reached by the flood. */
function hasReachableOrthogonal(
  reachable: boolean[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x > 0 && reachable[y * width + x - 1]) return true;
  if (x + 1 < width && reachable[y * width + x + 1]) return true;
  if (y > 0 && reachable[(y - 1) * width + x]) return true;
  if (y + 1 < height && reachable[(y + 1) * width + x]) return true;
  return false;
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
