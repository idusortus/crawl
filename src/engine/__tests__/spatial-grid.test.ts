import { describe, it, expect } from 'vitest';
import {
  createGrid,
  entityAt,
  entityById,
  inBounds,
  isPassable,
} from '../grid';
import type { Entity, Grid, Position } from '../types';

/**
 * 3x2 grid, row-major. `#` = wall (not passable), `.` = floor (passable).
 *
 *   y=0:  . # .
 *   y=1:  # . .
 */
const grid: Grid = createGrid([
  [true, false, true],
  [false, true, true],
]);

function at(x: number, y: number): Position {
  return { x, y };
}

describe('Grid construction', () => {
  it('exposes explicit width/height and a flat row-major passable array', () => {
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.passable).toHaveLength(6);
    expect(grid.passable).toEqual([true, false, true, false, true, true]);
  });

  it('rejects ragged rows', () => {
    expect(() => createGrid([[true, false], [true]])).toThrow();
  });

  it('handles an empty grid', () => {
    const empty = createGrid([]);
    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
    expect(empty.passable).toEqual([]);
    expect(isPassable(empty, at(0, 0))).toBe(false);
  });
});

describe('inBounds', () => {
  it('accepts coordinates inside the grid', () => {
    expect(inBounds(grid, at(0, 0))).toBe(true);
    expect(inBounds(grid, at(2, 1))).toBe(true);
  });

  it('rejects coordinates outside the grid', () => {
    expect(inBounds(grid, at(-1, 0))).toBe(false);
    expect(inBounds(grid, at(0, -1))).toBe(false);
    expect(inBounds(grid, at(3, 0))).toBe(false);
    expect(inBounds(grid, at(0, 2))).toBe(false);
  });
});

describe('isPassable', () => {
  it('returns the tile passability for in-bounds coordinates', () => {
    expect(isPassable(grid, at(0, 0))).toBe(true); // floor
    expect(isPassable(grid, at(1, 0))).toBe(false); // wall
    expect(isPassable(grid, at(2, 1))).toBe(true); // floor
  });

  it('reports out-of-bounds as not passable without throwing', () => {
    expect(() => isPassable(grid, at(-1, 0))).not.toThrow();
    expect(isPassable(grid, at(-1, 0))).toBe(false);
    expect(isPassable(grid, at(3, 0))).toBe(false);
    expect(isPassable(grid, at(0, 2))).toBe(false);
    expect(isPassable(grid, at(999, 999))).toBe(false);
    expect(isPassable(grid, at(-999, -999))).toBe(false);
  });
});

describe('occupancy lookup', () => {
  const entities: Entity[] = [
    { id: 'player', kind: 'player', pos: at(0, 0) },
    { id: 'goblin-1', kind: 'goblin', pos: at(2, 1), hp: 3 },
  ];

  it('returns the occupying entity when one exists', () => {
    expect(entityAt(entities, at(0, 0))?.id).toBe('player');
    expect(entityAt(entities, at(2, 1))?.id).toBe('goblin-1');
  });

  it('returns undefined for an empty tile', () => {
    expect(entityAt(entities, at(1, 1))).toBeUndefined();
  });

  it('returns undefined for out-of-bounds / no entities', () => {
    expect(entityAt(entities, at(99, 99))).toBeUndefined();
    expect(entityAt([], at(0, 0))).toBeUndefined();
  });

  it('finds entities by id', () => {
    expect(entityById(entities, 'goblin-1')?.pos).toEqual(at(2, 1));
    expect(entityById(entities, 'missing')).toBeUndefined();
  });

  it('preserves extra plain properties on entities', () => {
    expect(entityById(entities, 'goblin-1')?.hp).toBe(3);
  });
});
