/**
 * Spatial grid + passability + occupancy helpers.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 3.2): the bounded 2D world.
 * Out-of-bounds access is always safe — it reports "not passable" and never
 * reads an `undefined` tile (spec: spatial-grid).
 *
 * All helpers are pure and operate on the plain-data `Grid`/`Entity` shapes
 * from `types.ts`; no Map/Set/class instances appear in state (design D5).
 */

import type { Entity, Grid, Position } from './types';

/** Returns true when `(x, y)` lies inside the grid's explicit bounds. */
export function inBounds(grid: Grid, pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.y >= 0 &&
    pos.x < grid.width &&
    pos.y < grid.height
  );
}

/**
 * Returns the passability of the tile at `pos`.
 *
 * Coordinates outside the grid report `false` (not passable) and never read
 * undefined tile data. The flat row-major index is `y * width + x`.
 */
export function isPassable(grid: Grid, pos: Position): boolean {
  if (!inBounds(grid, pos)) return false;
  return grid.passable[pos.y * grid.width + pos.x] === true;
}

/** Returns the entity occupying `pos`, or `undefined` if the tile is empty. */
export function entityAt(
  entities: Entity[],
  pos: Position,
): Entity | undefined {
  for (const entity of entities) {
    if (entity.pos.x === pos.x && entity.pos.y === pos.y) return entity;
  }
  return undefined;
}

/** Returns the entity with the given id, or `undefined` if absent. */
export function entityById(
  entities: Entity[],
  id: string,
): Entity | undefined {
  for (const entity of entities) {
    if (entity.id === id) return entity;
  }
  return undefined;
}

/**
 * Builds a flat row-major `Grid` from a rectangular array of rows, where a
 * truthy cell means passable. Throws if the rows are ragged — a malformed grid
 * is a programmer error, not a runtime condition.
 */
export function createGrid(rows: boolean[][]): Grid {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const passable: boolean[] = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) {
      throw new Error(
        `createGrid: row ${y} has width ${row.length}, expected ${width}`,
      );
    }
    for (let x = 0; x < width; x++) {
      passable.push(row[x] === true);
    }
  }
  return { width, height, passable };
}
