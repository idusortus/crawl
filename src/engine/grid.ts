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
 * Returns the flat row-major index of `pos`: `y * width + x`.
 *
 * The same convention indexes `grid.passable` and `GameState.explored` (design
 * D1). This helper is **index arithmetic only** — it does not bounds-check, so
 * an out-of-bounds `pos` still yields the arithmetic value (useful for a
 * caller that has already called `inBounds`). Use `isPassable`/`inBounds` when
 * a safe tile lookup is needed.
 */
export function indexOf(grid: Grid, pos: Position): number {
  return pos.y * grid.width + pos.x;
}

/**
 * Returns the coordinate of flat row-major `index` for `grid`, i.e. the inverse
 * of `indexOf`. `index` is expected to be in `[0, width * height)`; callers that
 * iterate always pass a valid index.
 */
export function coordOf(grid: Grid, index: number): Position {
  return { x: index % grid.width, y: Math.floor(index / grid.width) };
}

/**
 * Calls `visit(pos)` for every tile of `grid` in flat row-major order (the same
 * order as `grid.passable`), so callers can iterate tiles without duplicating
 * the `y * width + x` math. Pure with respect to the grid: it only reads
 * `width`/`height`.
 */
export function forEachCoord(
  grid: Grid,
  visit: (pos: Position, index: number) => void,
): void {
  for (let index = 0; index < grid.width * grid.height; index++) {
    visit(coordOf(grid, index), index);
  }
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
 * Returns true when `entity` is a **living** occupant: a non-item entity that
 * carries a numeric `hp`.
 *
 * This is one of the three total occupancy classes (change `core-gameplay-loop`,
 * design D4): living → attack, feature → enter, any other non-living occupant →
 * blocked. The predicate reads only the entity's own fields, so it stays
 * pack-free. The item discriminator takes precedence, so an item that also
 * happens to carry an `hp` is still classified as a feature, not as living.
 */
export function isLiving(entity: Entity): boolean {
  return entity.item !== true && typeof entity.hp === 'number';
}

/**
 * Returns true when `entity` is a **feature** occupant: a floor item carrying
 * the explicit item discriminator (`item: true`, design D1/D4).
 *
 * This is deliberately discriminator-only — it does **not** infer item-ness from
 * `kind` (a pack id the content-free path cannot resolve). The stairs tile is
 * **not** an entity and is detected separately via `isStairs(pos, stairs)`.
 */
export function isFeature(entity: Entity): boolean {
  return entity.item === true;
}

/**
 * Returns true when `pos` is the `stairs` tile (change `core-gameplay-loop`,
 * design D4). Stairs are a `Level` position, not an entity, so this takes the
 * `stairs` position explicitly rather than an entity — the content-free
 * `applyMove` calls this alongside `isFeature`.
 */
export function isStairs(pos: Position, stairs: Position): boolean {
  return pos.x === stairs.x && pos.y === stairs.y;
}

/**
 * Returns the **living** entity occupying `pos`, or `undefined` if the tile is
 * empty or holds a non-living occupant (an item, or any other non-living
 * entity).
 *
 * This is the pack-free attack-target lookup used by bump-to-attack (design
 * D2/D4): only a `isLiving` occupant is an attack target; a feature/other
 * occupant is handled by the caller's enter/blocked branches.
 */
export function attackTargetAt(
  entities: Entity[],
  pos: Position,
): Entity | undefined {
  const occupant = entityAt(entities, pos);
  return occupant !== undefined && isLiving(occupant) ? occupant : undefined;
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
