/**
 * Pure unit tests for auto-travel planning and the stop predicate (change
 * `travel-and-repeat-move`, design D3/D4; tasks 1.4).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the `src/ui` test glob. It imports only the `@engine` public
 * surface, mirroring the client. Path expectations are pinned to the fixed
 * north/east/south/west neighbour order so a change to that order is caught.
 */

import { describe, expect, it } from 'vitest';

import { createGrid } from '@engine';
import type {
  CommandResult,
  Entity,
  GameEvent,
  GameState,
  Grid,
  Position,
} from '@engine';

import { planTravel, travelStartBlocked, travelStopReason } from './travel';

const PLAYER_ID = 'player';

/** Builds a minimal playing run with the player on `playerPos`. */
function makeState(
  grid: Grid,
  playerPos: Position,
  options: {
    explored?: boolean[];
    entities?: Entity[];
    stairs?: Position;
    status?: GameState['status'];
    playerHp?: number;
  } = {},
): GameState {
  const player: Entity = {
    id: PLAYER_ID,
    kind: 'fighter',
    pos: { x: playerPos.x, y: playerPos.y },
    hp: options.playerHp ?? 10,
    attack: 4,
  };
  return {
    grid,
    level: {
      depth: 1,
      spawn: { x: playerPos.x, y: playerPos.y },
      stairs: options.stairs ?? { x: grid.width - 1, y: grid.height - 1 },
    },
    explored:
      options.explored ??
      new Array<boolean>(grid.width * grid.height).fill(true),
    entities: [player, ...(options.entities ?? [])],
    playerId: PLAYER_ID,
    status: options.status ?? 'playing',
    carriedItemIds: [],
    rng: { seed: 1, state: 1 },
    events: [],
  };
}

/** Wraps an after-state and its step events as the engine's `CommandResult`. */
function stepResult(
  afterState: GameState,
  events: GameEvent[] = [],
): CommandResult {
  return { state: afterState, events };
}

/** A living monster fixture. */
function monster(id: string, pos: Position, hp = 5): Entity {
  return { id, kind: 'goblin', pos: { x: pos.x, y: pos.y }, hp };
}

describe('planTravel', () => {
  const open3x3 = createGrid([
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ]);

  it('plans a path over explored passable tiles, with the destination as goal', () => {
    const explored = new Array<boolean>(9).fill(true);
    const plan = planTravel(
      open3x3,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      PLAYER_ID,
    );
    expect(plan).toEqual({
      route: ['east', 'east', 'south', 'south'],
      goal: { x: 2, y: 2 },
    });
  });

  it('is deterministic: the same inputs yield the same pinned plan', () => {
    const explored = new Array<boolean>(9).fill(true);
    const first = planTravel(
      open3x3,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      PLAYER_ID,
    );
    const second = planTravel(
      open3x3,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      PLAYER_ID,
    );
    expect(second).toEqual(first);
    expect(first).toEqual({
      route: ['east', 'east', 'south', 'south'],
      goal: { x: 2, y: 2 },
    });
  });

  it("treats the player's own tile as the traversable start", () => {
    const explored = new Array<boolean>(9).fill(true);
    const player = monster(PLAYER_ID, { x: 0, y: 0 });
    const plan = planTravel(
      open3x3,
      explored,
      [player],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      PLAYER_ID,
    );
    expect(plan).toEqual({
      route: ['east', 'east', 'south', 'south'],
      goal: { x: 2, y: 2 },
    });
  });

  it('does not route through unexplored tiles', () => {
    const corridor = createGrid([[true, true, true]]);
    const explored = [true, false, true];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('does not route through a non-passable tile when no detour exists', () => {
    const corridor = createGrid([[true, false, true]]);
    const explored = [true, true, true];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('routes around a non-passable tile rather than through it', () => {
    const grid = createGrid([
      [true, false, true],
      [true, true, true],
      [true, true, true],
    ]);
    const explored = new Array<boolean>(9).fill(true);
    const plan = planTravel(
      grid,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      PLAYER_ID,
    );
    expect(plan).toEqual({
      route: ['south', 'east', 'east', 'north'],
      goal: { x: 2, y: 0 },
    });
  });

  it('does not route through a living occupant when no detour exists', () => {
    const corridor = createGrid([[true, true, true]]);
    const explored = [true, true, true];
    const blocker = monster('goblin-1', { x: 1, y: 0 });
    expect(
      planTravel(
        corridor,
        explored,
        [blocker],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('routes around a living occupant rather than through it', () => {
    const explored = new Array<boolean>(9).fill(true);
    const blocker = monster('goblin-1', { x: 1, y: 0 });
    const plan = planTravel(
      open3x3,
      explored,
      [blocker],
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      PLAYER_ID,
    );
    expect(plan).toEqual({
      route: ['south', 'east', 'east', 'north'],
      goal: { x: 2, y: 0 },
    });
  });

  it('rejects a destination that is not explored', () => {
    const corridor = createGrid([[true, true, true]]);
    const explored = [true, true, false];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('rejects a destination that is not passable', () => {
    const corridor = createGrid([[true, true, false]]);
    const explored = [true, true, true];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('rejects a destination occupied by a living entity', () => {
    const corridor = createGrid([[true, true, true]]);
    const explored = [true, true, true];
    const occupant = monster('goblin-1', { x: 2, y: 0 });
    expect(
      planTravel(
        corridor,
        explored,
        [occupant],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('rejects a destination outside the grid', () => {
    const corridor = createGrid([[true, true, true]]);
    const explored = [true, true, true];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });

  it('returns an empty route when the player is already at the destination', () => {
    const explored = new Array<boolean>(9).fill(true);
    expect(
      planTravel(
        open3x3,
        explored,
        [],
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        PLAYER_ID,
      ),
    ).toEqual({ route: [], goal: { x: 1, y: 1 } });
  });

  it('routes to the best-approach goal when the destination is unreachable', () => {
    // A wall at (3,0) splits the row; (4,0) is explored/passable/unoccupied but
    // unreachable, so travel heads for the nearest reachable tile: (2,0).
    const corridor = createGrid([[true, true, true, false, true]]);
    const explored = [true, true, true, true, true];
    const plan = planTravel(
      corridor,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      PLAYER_ID,
    );
    expect(plan).toEqual({
      route: ['east', 'east'],
      goal: { x: 2, y: 0 },
    });
  });

  it('breaks a best-approach tie by ascending row-major index', () => {
    // (2,2) is an explored, passable, unoccupied pocket sealed off by walls, so
    // it is unreachable. Four reachable tiles tie at Chebyshev distance 2 from
    // it; the lowest row-major index — (1,0), index 1 — must win.
    const grid = createGrid([
      [true, true, true],
      [true, false, false],
      [true, false, true],
    ]);
    const explored = new Array<boolean>(9).fill(true);
    const plan = planTravel(
      grid,
      explored,
      [],
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      PLAYER_ID,
    );
    expect(plan).toEqual({ route: ['east'], goal: { x: 1, y: 0 } });
  });

  it('returns undefined when no reachable fallback tile exists', () => {
    // The destination is traversable but walled off, and the player's only
    // reachable tile is their own: travel cannot begin.
    const corridor = createGrid([[true, false, true]]);
    const explored = [true, true, true];
    expect(
      planTravel(
        corridor,
        explored,
        [],
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        PLAYER_ID,
      ),
    ).toBeUndefined();
  });
});

describe('travelStopReason', () => {
  const grid = createGrid([
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
  ]);
  const destination: Position = { x: 4, y: 0 };
  const nextStep: Position = { x: 2, y: 0 };

  it('returns undefined for a clean intermediate step', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBeUndefined();
  });

  it('stops when the run has ended', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 }, { status: 'dead' });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('run-ended');
  });

  it('stops when a player-died event is emitted', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after, [{ type: 'player-died' }]),
        destination,
        nextStep,
      }),
    ).toBe('run-ended');
  });

  it('stops when the level changes', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after, [{ type: 'level-changed', depth: 2 }]),
        destination,
        nextStep,
      }),
    ).toBe('level-changed');
  });

  it('stops when the player is attacked', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after, [
          {
            type: 'attacked',
            attackerId: 'goblin-1',
            targetId: PLAYER_ID,
            amount: 3,
            kind: 'melee',
          },
        ]),
        destination,
        nextStep,
      }),
    ).toBe('attacked');
  });

  it('stops when the player loses hit points', () => {
    const before = makeState(grid, { x: 0, y: 0 }, { playerHp: 10 });
    const after = makeState(grid, { x: 1, y: 0 }, { playerHp: 7 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('attacked');
  });

  it('stops when the destination is reached', () => {
    const before = makeState(grid, { x: 3, y: 0 });
    const after = makeState(grid, { x: 4, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep: undefined,
      }),
    ).toBe('destination-reached');
  });

  it('stops on a blocked step', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 0, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after, [
          { type: 'blocked', entityId: PLAYER_ID, direction: 'east' },
        ]),
        destination,
        nextStep,
      }),
    ).toBe('path-blocked');
  });

  it('stops when the step neither moved nor blocked and the tile is unchanged', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 0, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after, [
          { type: 'noop', reason: 'malformed-command' },
        ]),
        destination,
        nextStep,
      }),
    ).toBe('path-blocked');
  });

  it('stops when the route is interrupted (no next step)', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep: undefined,
      }),
    ).toBe('path-blocked');
  });

  it('stops when the next step is no longer free', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const occupant = monster('goblin-1', { x: 2, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 }, { entities: [occupant] });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('path-blocked');
  });

  it('stops before a step that would land on the stairs', () => {
    const stairs: Position = { x: 2, y: 0 };
    const before = makeState(grid, { x: 0, y: 0 }, { stairs });
    const after = makeState(grid, { x: 1, y: 0 }, { stairs });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('next-step-stairs');
  });

  it('stops when a living monster is orthogonally adjacent', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const adjacent = monster('goblin-1', { x: 1, y: 1 });
    const after = makeState(grid, { x: 1, y: 0 }, { entities: [adjacent] });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('monster-adjacent');
  });

  it('stops when a living monster becomes visible', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const visible = monster('goblin-1', { x: 3, y: 0 });
    const after = makeState(grid, { x: 1, y: 0 }, { entities: [visible] });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBe('monster-visible');
  });

  it('does not stop for an adjacent or visible item (only living occupants count)', () => {
    const before = makeState(grid, { x: 0, y: 0 });
    const item: Entity = {
      id: 'item-1',
      kind: 'healing-potion',
      pos: { x: 2, y: 0 },
      item: true,
    };
    const after = makeState(grid, { x: 1, y: 0 }, { entities: [item] });
    expect(
      travelStopReason({
        before,
        after: stepResult(after),
        destination,
        nextStep,
      }),
    ).toBeUndefined();
  });
});

describe('travelStartBlocked', () => {
  const grid = createGrid([
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
  ]);

  it('allows travel to start when no living monster is visible or adjacent', () => {
    expect(travelStartBlocked(makeState(grid, { x: 0, y: 0 }))).toBe(false);
  });

  it('blocks travel to start when a living monster is orthogonally adjacent', () => {
    const adjacent = monster('goblin-1', { x: 1, y: 0 });
    expect(
      travelStartBlocked(
        makeState(grid, { x: 0, y: 0 }, { entities: [adjacent] }),
      ),
    ).toBe(true);
  });

  it('does not block travel to start for a visible but non-adjacent monster', () => {
    // Design D2: the pre-start gate is adjacency-only; a merely visible monster
    // is handled by the post-step `monster-visible` stop in `travelStopReason`.
    const visible = monster('goblin-1', { x: 3, y: 0 });
    expect(
      travelStartBlocked(
        makeState(grid, { x: 0, y: 0 }, { entities: [visible] }),
      ),
    ).toBe(false);
  });

  it('does not block for an adjacent or visible item (only living occupants count)', () => {
    const item: Entity = {
      id: 'item-1',
      kind: 'healing-potion',
      pos: { x: 1, y: 0 },
      item: true,
    };
    expect(
      travelStartBlocked(makeState(grid, { x: 0, y: 0 }, { entities: [item] })),
    ).toBe(false);
  });

  it('blocks travel to start when the player entity is missing', () => {
    const state = makeState(grid, { x: 0, y: 0 });
    state.entities = [];
    expect(travelStartBlocked(state)).toBe(true);
  });
});
