import { describe, it, expect } from 'vitest';
import {
  coordOf,
  createGrid,
  entityAt,
  entityById,
  forEachCoord,
  inBounds,
  indexOf,
  isPassable,
} from '../grid';
import { applyCommand, createRng, rngFromState } from '../index';
import type { Command, Entity, GameState, Grid, Position } from '../types';

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

describe('flat-index helpers', () => {
  it('indexOf computes y * width + x (same indexing as grid.passable)', () => {
    expect(indexOf(grid, at(0, 0))).toBe(0);
    expect(indexOf(grid, at(2, 0))).toBe(2);
    expect(indexOf(grid, at(0, 1))).toBe(3);
    expect(indexOf(grid, at(2, 1))).toBe(5);
  });

  it('coordOf is the inverse of indexOf for every in-bounds tile', () => {
    for (let index = 0; index < grid.width * grid.height; index++) {
      expect(indexOf(grid, coordOf(grid, index))).toBe(index);
    }
  });

  it('coordOf maps a flat index back to its coordinate', () => {
    expect(coordOf(grid, 0)).toEqual(at(0, 0));
    expect(coordOf(grid, 2)).toEqual(at(2, 0));
    expect(coordOf(grid, 3)).toEqual(at(0, 1));
    expect(coordOf(grid, 5)).toEqual(at(2, 1));
  });

  it('forEachCoord visits every tile once in row-major order', () => {
    const seen: Position[] = [];
    const indices: number[] = [];
    forEachCoord(grid, (pos, index) => {
      seen.push(pos);
      indices.push(index);
    });

    expect(seen).toEqual([
      at(0, 0),
      at(1, 0),
      at(2, 0),
      at(0, 1),
      at(1, 1),
      at(2, 1),
    ]);
    // Indices ascend 0..width*height-1, matching `grid.passable`.
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
    // Each visited index maps back to the reported coordinate.
    seen.forEach((pos, i) => expect(coordOf(grid, indices[i])).toEqual(pos));
  });

  it('forEachCoord visits nothing for an empty grid', () => {
    let calls = 0;
    forEachCoord(createGrid([]), () => {
      calls++;
    });
    expect(calls).toBe(0);
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

// ---------------------------------------------------------------------------
// Move resolution classifies every occupant totally (change
// `core-gameplay-loop`, task 5.2; engine/spatial-grid spec "Occupancy
// distinguishes living entities from terrain features")
// ---------------------------------------------------------------------------

describe('move resolution: total occupancy classification', () => {
  const at = (x: number, y: number): Position => ({ x, y });

  /**
   * A 3x3 all-passable room with the player at (1,1). The optional `occupant`
   * is placed east at (2,1); `stairs` defaults to a far tile so it never
   * interferes with the east step.
   */
  function makeState(occupant?: Entity, stairs: Position = at(0, 0)): GameState {
    const room = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(1234);
    return {
      grid: room,
      level: { depth: 1, spawn: at(1, 1), stairs },
      explored: new Array<boolean>(room.width * room.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 },
        ...(occupant === undefined ? [] : [occupant]),
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 1234, state: rng.state() },
      events: [],
    };
  }

  const east: Command = { type: 'move', direction: 'east' };

  it('a living occupant is attacked, not entered', () => {
    const state = makeState({ id: 'goblin', kind: 'goblin', pos: at(2, 1), hp: 5 });
    const { state: next, events } = applyCommand(state, east, rngFromState(state.rng));
    expect(events[0]?.type).toBe('attacked');
    // The player did not move onto the monster's tile.
    expect(entityById(next.entities, 'player')?.pos).toEqual(at(1, 1));
    expect(entityById(next.entities, 'goblin')).toBeDefined();
  });

  it('a floor item (discriminator) is entered', () => {
    const state = makeState({ id: 'potion', kind: 'potion', pos: at(2, 1), item: true });
    const { state: next, events } = applyCommand(state, east, rngFromState(state.rng));
    expect(events[0]?.type).toBe('moved');
    expect(entityById(next.entities, 'player')?.pos).toEqual(at(2, 1));
  });

  it('a non-living, non-feature occupant is blocked', () => {
    const state = makeState({ id: 'rock', kind: 'rock', pos: at(2, 1) });
    const { state: next, events } = applyCommand(state, east, rngFromState(state.rng));
    expect(events[0]?.type).toBe('blocked');
    expect(entityById(next.entities, 'player')?.pos).toEqual(at(1, 1));
    expect(entityAt(next.entities, at(2, 1))?.id).toBe('rock');
  });

  it('the stairs tile (no entity) is entered', () => {
    const state = makeState(undefined, at(2, 1));
    const { state: next, events } = applyCommand(state, east, rngFromState(state.rng));
    expect(events[0]?.type).toBe('moved');
    expect(entityById(next.entities, 'player')?.pos).toEqual(at(2, 1));
  });

  it('an empty tile is entered', () => {
    const state = makeState();
    const { state: next, events } = applyCommand(state, east, rngFromState(state.rng));
    expect(events[0]?.type).toBe('moved');
    expect(entityById(next.entities, 'player')?.pos).toEqual(at(2, 1));
  });
});
