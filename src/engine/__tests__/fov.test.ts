import { describe, it, expect } from 'vitest';
import { computeFov, exploreInto, DEFAULT_SIGHT_RADIUS } from '../fov';
import { coordOf, createGrid, indexOf } from '../grid';
import type { Grid, Position } from '../types';

function at(x: number, y: number): Position {
  return { x, y };
}

/** Chebyshev distance between two tiles. */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Coordinates of every `true` entry, in row-major order. */
function visibleCoords(grid: Grid, visible: boolean[]): Position[] {
  const coords: Position[] = [];
  visible.forEach((isVisible, index) => {
    if (isVisible) coords.push(coordOf(grid, index));
  });
  return coords;
}

describe('computeFov — open area', () => {
  // A 9x9 all-passable room; the origin sits at the centre.
  const open: Grid = createGrid(
    Array.from({ length: 9 }, () => new Array<boolean>(9).fill(true)),
  );
  const origin = at(4, 4);

  it('marks tiles out to the radius in an open area', () => {
    const radius = 3;
    const visible = computeFov(open, origin, radius);

    expect(visible).toHaveLength(open.width * open.height);
    for (const pos of visibleCoords(open, visible)) {
      expect(chebyshev(pos, origin)).toBeLessThanOrEqual(radius);
    }
    // Every tile within the Chebyshev radius is visible (nothing occludes it).
    for (let y = 0; y < open.height; y++) {
      for (let x = 0; x < open.width; x++) {
        if (chebyshev(at(x, y), origin) <= radius) {
          expect(visible[indexOf(open, at(x, y))]).toBe(true);
        }
      }
    }
  });

  it('is bounded by Chebyshev distance — nothing beyond the radius is visible', () => {
    const radius = 2;
    const visible = computeFov(open, origin, radius);

    // No tile at Chebyshev distance > radius is marked.
    for (const pos of visibleCoords(open, visible)) {
      expect(chebyshev(pos, origin)).toBeLessThanOrEqual(radius);
    }
    // The corners at distance 2 ARE visible (Chebyshev 2) but distance 3 is not.
    expect(visible[indexOf(open, at(6, 6))]).toBe(true); // Chebyshev 2
    expect(visible[indexOf(open, at(7, 7))]).toBe(false); // Chebyshev 3
  });

  it('uses a default sight radius out to that radius and not beyond', () => {
    // A grid comfortably larger than the default radius.
    const big: Grid = createGrid(
      Array.from({ length: 25 }, () => new Array<boolean>(25).fill(true)),
    );
    const centre = at(12, 12);
    const visible = computeFov(big, centre, DEFAULT_SIGHT_RADIUS);

    expect(visible[indexOf(big, at(12 + DEFAULT_SIGHT_RADIUS, 12))]).toBe(true);
    expect(visible[indexOf(big, at(12 + DEFAULT_SIGHT_RADIUS + 1, 12))]).toBe(
      false,
    );
    for (const pos of visibleCoords(big, visible)) {
      expect(chebyshev(pos, centre)).toBeLessThanOrEqual(DEFAULT_SIGHT_RADIUS);
    }
  });
});

describe('computeFov — origin visibility', () => {
  it('marks the origin tile itself visible on a passable tile', () => {
    const grid = createGrid([[true, true], [true, true]]);
    const visible = computeFov(grid, at(1, 0), 1);
    expect(visible[indexOf(grid, at(1, 0))]).toBe(true);
  });

  it('marks a non-passable origin visible and does not throw', () => {
    // A single wall tile surrounded by floors.
    const grid = createGrid([
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ]);
    const origin = at(1, 1); // wall
    expect(() => computeFov(grid, origin, 1)).not.toThrow();

    const visible = computeFov(grid, origin, 1);
    expect(visible[indexOf(grid, origin)]).toBe(true);
  });
});

describe('computeFov — walls block sight', () => {
  it('sees the blocking wall but not the tile behind it', () => {
    // A wall at (2,1); the observer at (0,1) looks east along row 1.
    //   y=1:  . . # . .
    const grid = createGrid([
      [true, true, true, true, true],
      [true, true, false, true, true],
      [true, true, true, true, true],
    ]);
    const origin = at(0, 1);
    const visible = computeFov(grid, origin, 4);

    expect(visible[indexOf(grid, at(1, 1))]).toBe(true); // floor before wall
    expect(visible[indexOf(grid, at(2, 1))]).toBe(true); // the wall itself
    expect(visible[indexOf(grid, at(3, 1))]).toBe(false); // behind the wall
    expect(visible[indexOf(grid, at(4, 1))]).toBe(false); // farther behind
  });

  it('blocks a tile directly behind a wall in a corridor', () => {
    //   y=0:  . # .
    const grid = createGrid([[true, false, true]]);
    const origin = at(0, 0);
    const visible = computeFov(grid, origin, 2);

    expect(visible[indexOf(grid, at(1, 0))]).toBe(true); // wall seen
    expect(visible[indexOf(grid, at(2, 0))]).toBe(false); // hidden behind
  });

  it('still sees floors around the ends of a short wall', () => {
    // A wall pillar at (2,1); the floor directly behind it stays hidden while
    // the diagonal neighbours that are not shadowed remain visible.
    const grid = createGrid([
      [true, true, true, true, true],
      [true, true, false, true, true],
      [true, true, true, true, true],
    ]);
    const visible = computeFov(grid, at(0, 1), 3);

    expect(visible[indexOf(grid, at(2, 1))]).toBe(true); // wall
    expect(visible[indexOf(grid, at(3, 1))]).toBe(false); // directly behind
    expect(visible[indexOf(grid, at(2, 0))]).toBe(true); // above the wall end
    expect(visible[indexOf(grid, at(2, 2))]).toBe(true); // below the wall end
  });
});

describe('computeFov — out of bounds', () => {
  const grid = createGrid([
    [true, true],
    [true, true],
  ]);

  it('returns an all-false array for an out-of-bounds origin, without throwing', () => {
    for (const origin of [at(-1, 0), at(0, -1), at(2, 0), at(0, 2), at(99, 99)]) {
      let visible: boolean[] = [];
      expect(() => {
        visible = computeFov(grid, origin, 5);
      }).not.toThrow();
      expect(visible).toHaveLength(grid.width * grid.height);
      expect(visible.every((value) => value === false)).toBe(true);
    }
  });
});

describe('computeFov — determinism and purity', () => {
  it('produces identical results for the same inputs', () => {
    const grid = createGrid([
      [true, true, true, true],
      [true, false, true, true],
      [true, true, true, false],
      [true, true, true, true],
    ]);
    const origin = at(0, 0);
    const first = computeFov(grid, origin, 3);
    const second = computeFov(grid, origin, 3);
    expect(second).toEqual(first);
  });

  it('does not mutate the grid input', () => {
    const grid = createGrid([
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ]);
    const snapshot = JSON.stringify(grid);
    computeFov(grid, at(0, 0), 3);
    expect(JSON.stringify(grid)).toBe(snapshot);
    expect(grid.passable).toEqual([true, true, true, true, false, true, true, true, true]);
  });
});

describe('exploreInto — append-only union', () => {
  it('is the element-wise OR of explored and visible', () => {
    const explored = [true, false, false, true];
    const visible = [false, true, false, false];
    expect(exploreInto(explored, visible)).toEqual([true, true, false, true]);
  });

  it('only ever grows: a tile once true stays true', () => {
    const explored = [true, false, true, false, false];
    const visible = [false, false, false, false, false];
    const after = exploreInto(explored, visible);

    explored.forEach((wasExplored, index) => {
      if (wasExplored) expect(after[index]).toBe(true);
    });
    expect(after).toEqual(explored);
  });

  it('accumulates across several visibility snapshots', () => {
    let explored: boolean[] = [false, false, false, false];
    const firstVisible = [true, false, false, false];
    const secondVisible = [false, false, true, false];

    explored = exploreInto(explored, firstVisible);
    explored = exploreInto(explored, secondVisible);
    expect(explored).toEqual([true, false, true, false]);
  });

  it('does not mutate either input', () => {
    const explored = [true, false, false];
    const visible = [false, true, false];
    const exploredSnapshot = [...explored];
    const visibleSnapshot = [...visible];

    const result = exploreInto(explored, visible);

    expect(explored).toEqual(exploredSnapshot);
    expect(visible).toEqual(visibleSnapshot);
    expect(result).not.toBe(explored);
    expect(result).not.toBe(visible);
  });
});
