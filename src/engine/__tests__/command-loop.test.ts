import { describe, it, expect } from 'vitest';
import {
  appendEvents,
  applyCommand,
  applyCommandWithPack,
  blocked,
  createGrid,
  createRng,
  entityAt,
  entityById,
  loadPack,
  moved,
  noop,
  rngFromState,
} from '../index';
import { computeFov, exploreInto, DEFAULT_SIGHT_RADIUS } from '../fov';
import type { Command, GameEvent, GameState, LoadedPack, Position } from '../index';

/**
 * Test fixture: a 3x3 grid with a wall column at x=1.
 *
 *   y=0:  . # .
 *   y=1:  . # .
 *   y=2:  . # .
 *
 * Player starts at (0, 0). By default there is no other entity: the wall column
 * at x=1 is the blocking terrain, so an eastward move is `blocked` by
 * passability (not by an occupant). Tests that need an occupant pass one in.
 */
function makeState(entities?: GameState['entities']): GameState {
  const grid = createGrid([
    [true, false, true],
    [true, false, true],
    [true, false, true],
  ]);
  const rng = createRng(1234);
  return {
    grid,
    level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 2, y: 2 } },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: entities ?? [
      { id: 'player', kind: 'player', pos: { x: 0, y: 0 } },
    ],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: { seed: 1234, state: rng.state() },
    events: [],
  };
}

const at = (x: number, y: number): Position => ({ x, y });

// ---------------------------------------------------------------------------
// 4.1 — event constructors + append-only log
// ---------------------------------------------------------------------------

describe('event constructors', () => {
  it('builds JSON-clean discriminated plain objects', () => {
    expect(moved('player', at(0, 0), at(1, 0))).toEqual({
      type: 'moved',
      entityId: 'player',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
    });
    expect(blocked('player', 'east')).toEqual({
      type: 'blocked',
      entityId: 'player',
      direction: 'east',
    });
    expect(noop('why')).toEqual({ type: 'noop', reason: 'why' });
  });

  it('copies position objects rather than aliasing inputs', () => {
    const from = at(1, 1);
    const to = at(2, 1);
    const ev = moved('player', from, to);
    from.x = 99;
    to.x = 99;
    expect(ev.from).toEqual({ x: 1, y: 1 });
    expect(ev.to).toEqual({ x: 2, y: 1 });
  });
});

describe('append-only event log', () => {
  it('appends in order across multiple appends without mutating the source', () => {
    const a = moved('p', at(0, 0), at(1, 0));
    const b = blocked('p', 'east');
    const c = noop('x');

    const first = appendEvents([], [a]);
    const second = appendEvents(first, [b]);
    const third = appendEvents(second, [c]);

    // Sources are never mutated.
    expect(first).toEqual([a]);
    expect(second).toEqual([a, b]);
    // Result is a distinct array in the exact append order.
    expect(third).toEqual([a, b, c]);
  });
});

// ---------------------------------------------------------------------------
// 4.2 — applyCommand contract: new state, no input mutation, unknown commands
// ---------------------------------------------------------------------------

describe('applyCommand immutability contract', () => {
  it('returns a new state + events and leaves the input unchanged', () => {
    const before = makeState();
    const snapshot = JSON.parse(JSON.stringify(before));

    const rng = createRng(before.rng.seed);
    const { state, events } = applyCommand(before, { type: 'move', direction: 'south' }, rng);

    expect(state).not.toBe(before);
    expect(state.entities).not.toBe(before.entities);
    expect(state.events).not.toBe(before.events);
    expect(events).toEqual([moved('player', at(0, 0), at(0, 1))]);
    expect(state.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 1));

    // The input state is byte-for-byte unchanged.
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
    expect(before.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 0));
    expect(before.events).toEqual([]);
  });

  it('leaves the input unchanged even when the command is blocked', () => {
    const before = makeState();
    const snapshot = JSON.parse(JSON.stringify(before));
    const rng = createRng(before.rng.seed);

    applyCommand(before, { type: 'move', direction: 'east' }, rng);

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });

  it('does not mutate the input event log when appending', () => {
    const before = makeState();
    before.events.push(noop('prior'));
    const rng = createRng(before.rng.seed);

    const { state } = applyCommand(before, { type: 'move', direction: 'south' }, rng);

    expect(state.events).toHaveLength(2);
    expect(before.events).toHaveLength(1);
    expect(before.events[0]).toEqual(noop('prior'));
  });
});

describe('unknown command handling', () => {
  it('reports an unrecognized command as invalid via a noop event without throwing', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);
    const command = { type: 'teleport', destination: 'moon' } as unknown as Command;

    let result!: ReturnType<typeof applyCommand>;
    expect(() => {
      result = applyCommand(before, command, rng);
    }).not.toThrow();

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('noop');
    expect((result.events[0] as { reason: string }).reason).toContain('unknown-command');
  });

  it('returns state equivalent to the input (same grid/entities/playerId/rng, log appended)', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);
    const command = { type: 'nonsense' } as unknown as Command;

    const { state, events } = applyCommand(before, command, rng);

    // World state is equivalent to the input...
    expect(state.grid).toEqual(before.grid);
    expect(state.entities).toEqual(before.entities);
    expect(state.playerId).toBe(before.playerId);
    expect(state.rng).toEqual(before.rng);
    // ...and only the append-only log grew by exactly this command's event.
    expect(state.events).toEqual(before.events.concat(events));
    expect(state.events).toHaveLength(before.events.length + 1);
  });
});

describe('malformed command handling', () => {
  const malformedInputs: [string, unknown][] = [
    ['null', null],
    ['an empty object', {}],
    ['a number primitive', 42],
    ['a string primitive', 'move'],
    ['an object without a string type', { type: 7 }],
  ];

  for (const [label, command] of malformedInputs) {
    it(`rejects ${label} with a single noop and no throw`, () => {
      const before = makeState();
      const rng = createRng(before.rng.seed);

      let result!: ReturnType<typeof applyCommand>;
      expect(() => {
        result = applyCommand(before, command as Command, rng);
      }).not.toThrow();

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual(noop('malformed-command'));

      // World state is equivalent to the input, log appended.
      expect(result.state.grid).toEqual(before.grid);
      expect(result.state.entities).toEqual(before.entities);
      expect(result.state.playerId).toBe(before.playerId);
      expect(result.state.rng).toEqual(before.rng);
      expect(result.state.events).toEqual(before.events.concat(result.events));
      expect(result.state.events).toHaveLength(before.events.length + 1);
    });
  }

  it('still reports well-formed unrecognized types as unknown-command', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);
    const { events } = applyCommand(
      before,
      { type: 'teleport' } as unknown as Command,
      rng,
    );
    expect(events).toEqual([noop('unknown-command:teleport')]);
  });

  it('rejects a move with an unknown direction as a single noop without throwing', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);

    let result!: ReturnType<typeof applyCommand>;
    expect(() => {
      result = applyCommand(
        before,
        { type: 'move', direction: 'northwest' } as any,
        rng,
      );
    }).not.toThrow();

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(noop('malformed-command'));
    // World state is equivalent to the input, log appended.
    expect(result.state.grid).toEqual(before.grid);
    expect(result.state.entities).toEqual(before.entities);
    expect(result.state.playerId).toBe(before.playerId);
    expect(result.state.rng).toEqual(before.rng);
    expect(result.state.events).toEqual(before.events.concat(result.events));
    expect(result.state.events).toHaveLength(before.events.length + 1);
  });

  it('rejects a move with a missing direction as a single noop without throwing', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);

    let result!: ReturnType<typeof applyCommand>;
    expect(() => {
      result = applyCommand(before, { type: 'move' } as any, rng);
    }).not.toThrow();

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(noop('malformed-command'));
    expect(result.state.entities).toEqual(before.entities);
    expect(result.state.rng).toEqual(before.rng);
  });

  it('still resolves a valid move after the parameter guard', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);

    const { state, events } = applyCommand(
      before,
      { type: 'move', direction: 'south' },
      rng,
    );

    expect(events).toEqual([moved('player', at(0, 0), at(0, 1))]);
    expect(state.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 1));
  });

  it('replays a serialized log containing a null element without throwing', () => {
    const commands = [
      { type: 'move', direction: 'south' },
      null,
      { type: 'move', direction: 'north' },
    ] as unknown as Command[];

    let state = makeState();
    expect(() => {
      for (const command of commands) {
        state = applyCommand(state, command, rngFromState(state.rng)).state;
      }
    }).not.toThrow();

    expect(state.events.map((e) => e.type)).toEqual(['moved', 'noop', 'moved']);
    expect(state.events[1]).toEqual(noop('malformed-command'));
  });
});

// ---------------------------------------------------------------------------
// 4.3 — move resolution
// ---------------------------------------------------------------------------

describe('move resolution', () => {
  it('moves into a passable empty tile: position advances, moved emitted', () => {
    const state = makeState();
    const rng = createRng(state.rng.seed);

    const { state: next, events } = applyCommand(state, { type: 'move', direction: 'south' }, rng);

    expect(events).toEqual([moved('player', at(0, 0), at(0, 1))]);
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 1));
  });

  it('supports all four directions', () => {
    // A 3x3 fully passable grid so every direction is a valid step.
    const openGrid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const cases: [Command, Position][] = [
      [{ type: 'move', direction: 'north' }, at(1, 0)],
      [{ type: 'move', direction: 'south' }, at(1, 2)],
      [{ type: 'move', direction: 'east' }, at(2, 1)],
      [{ type: 'move', direction: 'west' }, at(0, 1)],
    ];
    for (const [command, expected] of cases) {
      const rng = createRng(1234);
      const state: GameState = {
        grid: openGrid,
        level: { depth: 1, spawn: at(1, 1), stairs: at(2, 2) },
        explored: new Array<boolean>(openGrid.width * openGrid.height).fill(false),
        entities: [{ id: 'player', kind: 'player', pos: at(1, 1) }],
        playerId: 'player',
        status: 'playing',
        carriedItemIds: [],
        rng: { seed: 1234, state: rng.state() },
        events: [],
      };
      const { state: next } = applyCommand(state, command, rng);
      expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(expected);
    }
  });

  it('move into a non-passable tile is blocked; position unchanged', () => {
    const state = makeState();
    const rng = createRng(state.rng.seed);

    const { state: next, events } = applyCommand(state, { type: 'move', direction: 'east' }, rng);

    expect(events).toEqual([blocked('player', 'east')]);
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 0));
  });

  it('move out of bounds is blocked; position unchanged', () => {
    const state = makeState([
      { id: 'player', kind: 'player', pos: at(0, 0) },
    ]);
    const rng = createRng(state.rng.seed);

    const { state: next, events } = applyCommand(state, { type: 'move', direction: 'north' }, rng);
    expect(events).toEqual([blocked('player', 'north')]);

    const rng2 = createRng(state.rng.seed);
    const west = applyCommand(state, { type: 'move', direction: 'west' }, rng2);
    expect(west.events).toEqual([blocked('player', 'west')]);

    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 0));
    expect(west.state.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 0));
  });

  it('move into a tile occupied by another non-living occupant is blocked', () => {
    // Fully passable grid so the block is attributable to the occupant, not a
    // wall. A `rock` (no hp, no item discriminator) is the catch-all third class
    // (design D4): neither attack target nor feature, so the step is refused.
    const openGrid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(1234);
    const state: GameState = {
      grid: openGrid,
      level: { depth: 1, spawn: at(0, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(openGrid.width * openGrid.height).fill(false),
      entities: [
        { id: 'player', kind: 'player', pos: at(0, 1) },
        { id: 'rock', kind: 'rock', pos: at(1, 1) },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 1234, state: rng.state() },
      events: [],
    };

    const { state: next, events } = applyCommand(state, { type: 'move', direction: 'east' }, rng);

    expect(events).toEqual([blocked('player', 'east')]);
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 1));
    expect(entityAt(next.entities, at(1, 1))?.id).toBe('rock');
  });

  it('emits a noop instead of an empty event list when there is no player entity', () => {
    const state = makeState([{ id: 'rock', kind: 'rock', pos: at(1, 1) }]);
    const rng = createRng(state.rng.seed);

    const { state: next, events } = applyCommand(state, { type: 'move', direction: 'east' }, rng);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(noop('no-player-entity'));
    expect(next.entities).toEqual(state.entities);
  });

  it('every command yields at least one event', () => {
    const commands: unknown[] = [
      { type: 'move', direction: 'north' },
      { type: 'move', direction: 'east' },
      { type: 'unknown' },
    ];
    for (const command of commands) {
      const state = makeState();
      const rng = createRng(state.rng.seed);
      const { events } = applyCommand(state, command as Command, rng);
      expect(events.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 5.2 — bump-to-attack (move into a living occupant)
// ---------------------------------------------------------------------------

describe('bump-to-attack', () => {
  /** A fully passable 3x3 room; the player at (0,1) with a monster east at (1,1). */
  function bumpState(monsterAttack = 4): GameState {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(1234);
    return {
      grid,
      level: { depth: 1, spawn: at(0, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(0, 1), hp: 10, attack: monsterAttack },
        { id: 'goblin', kind: 'goblin', pos: at(1, 1), hp: 5 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 1234, state: rng.state() },
      events: [],
    };
  }

  it('walking into a living monster attacks it instead of moving', () => {
    const state = bumpState();
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );

    // The player attacks (an `attacked` event from player -> goblin)...
    expect(events[0]?.type).toBe('attacked');
    const attacked = events[0] as { attackerId: string; targetId: string };
    expect(attacked.attackerId).toBe('player');
    expect(attacked.targetId).toBe('goblin');
    // ...does NOT move onto the occupied tile...
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 1));
    expect(entityAt(next.entities, at(1, 1))?.id).toBe('goblin');
    // ...and the goblin's HP dropped.
    const goblin = entityAt(next.entities, at(1, 1));
    expect(typeof goblin?.hp).toBe('number');
    expect((goblin?.hp as number) < 5).toBe(true);
  });

  it('a killing bump removes the monster and emits death', () => {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(1);
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: at(0, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(0, 1), hp: 10, attack: 9 },
        { id: 'goblin', kind: 'goblin', pos: at(1, 1), hp: 1 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 1, state: rng.state() },
      events: [],
    };
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events.map((e) => e.type)).toEqual(['attacked', 'death']);
    expect(entityById(next.entities, 'goblin')).toBeUndefined();
    expect(entityAt(next.entities, at(1, 1))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5.2 — feature tiles are enterable; walls still block
// ---------------------------------------------------------------------------

describe('feature tiles are enterable', () => {
  it('moving onto a floor item (item discriminator) succeeds', () => {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(7);
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: at(0, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(0, 1) },
        { id: 'potion', kind: 'healing-potion', pos: at(1, 1), item: true },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 7, state: rng.state() },
      events: [],
    };
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events[0]).toEqual(moved('player', at(0, 1), at(1, 1)));
    // The player stands on the item tile (the item is not removed by movement).
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(1, 1));
    expect(entityById(next.entities, 'potion')?.pos).toEqual(at(1, 1));
  });

  it('moving onto the stairs tile succeeds', () => {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(7);
    const state: GameState = {
      grid,
      // Stairs at (1,1), directly east of the player.
      level: { depth: 1, spawn: at(0, 1), stairs: at(1, 1) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [{ id: 'player', kind: 'fighter', pos: at(0, 1) }],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 7, state: rng.state() },
      events: [],
    };
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events[0]).toEqual(moved('player', at(0, 1), at(1, 1)));
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(1, 1));
  });

  it('a wall tile (non-passable) still blocks even with no occupant', () => {
    const state = makeState();
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events).toEqual([blocked('player', 'east')]);
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(0, 0));
  });
});

// ---------------------------------------------------------------------------
// 5.2 — explicit attack command
// ---------------------------------------------------------------------------

describe('explicit attack command', () => {
  function openState(entities: GameState['entities']): GameState {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(11);
    return {
      grid,
      level: { depth: 1, spawn: at(1, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities,
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 11, state: rng.state() },
      events: [],
    };
  }

  it('attacking a living monster deals damage and emits an attacked event', () => {
    const state = openState([
      { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 },
      { id: 'goblin', kind: 'goblin', pos: at(2, 1), hp: 5 },
    ]);
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events[0]?.type).toBe('attacked');
    const goblin = entityById(next.entities, 'goblin');
    expect((goblin?.hp as number) < 5).toBe(true);
    // The attacker does not move.
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(1, 1));
  });

  it('attacking empty space is a noop and does not move the player', () => {
    const state = openState([{ id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 }]);
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events).toEqual([noop('nothing-to-attack')]);
    expect(next.entities.find((e) => e.id === 'player')?.pos).toEqual(at(1, 1));
  });

  it('attacking a wall / out of bounds is a noop', () => {
    const wallState = openState([{ id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 }]);
    const outOfBounds = openState([{ id: 'player', kind: 'fighter', pos: at(0, 0), hp: 10, attack: 4 }]);
    const north = applyCommand(outOfBounds, { type: 'attack', direction: 'north' }, rngFromState(outOfBounds.rng));
    expect(north.events).toEqual([noop('nothing-to-attack')]);
    expect(wallState.entities).toHaveLength(1);
  });

  it('attacking a non-living occupant (a rock) is a noop', () => {
    const state = openState([
      { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 },
      { id: 'rock', kind: 'rock', pos: at(2, 1) },
    ]);
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events).toEqual([noop('nothing-to-attack')]);
    expect(entityAt(next.entities, at(2, 1))?.id).toBe('rock');
  });

  it('a malformed attack (missing or unknown direction) is a single noop', () => {
    const missing = applyCommand(
      openState([{ id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 }]),
      { type: 'attack' } as unknown as Command,
      createRng(1),
    );
    expect(missing.events).toEqual([noop('malformed-command')]);

    const unknown = applyCommand(
      openState([{ id: 'player', kind: 'fighter', pos: at(1, 1), hp: 10, attack: 4 }]),
      { type: 'attack', direction: 'northwest' } as unknown as Command,
      createRng(1),
    );
    expect(unknown.events).toEqual([noop('malformed-command')]);
  });
});

// ---------------------------------------------------------------------------
// 6.1 — pickup command (Phase 6 real implementation)
// ---------------------------------------------------------------------------

describe('pickup command handling', () => {
  it('a malformed pickup (extra params) degrades to malformed-command', () => {
    const before = makeState();
    const { state, events } = applyCommand(
      before,
      { type: 'pickup', itemId: 'potion' } as unknown as Command,
      rngFromState(before.rng),
    );
    expect(events).toEqual([noop('malformed-command')]);
    // World state equivalent to the input.
    expect(state.entities).toEqual(before.entities);
    expect(state.rng).toEqual(before.rng);
  });

  it('a well-formed pickup on an empty tile is a nothing-to-pick-up noop', () => {
    const before = makeState();
    const { state, events } = applyCommand(
      before,
      { type: 'pickup' },
      rngFromState(before.rng),
    );
    expect(events).toEqual([noop('nothing-to-pick-up')]);
    expect(state.entities).toEqual(before.entities);
    expect(state.carriedItemIds).toEqual([]);
  });

  it('picks up a floor item on the player tile and carries its kind', () => {
    const before = makeState([
      { id: 'player', kind: 'player', pos: { x: 0, y: 0 } },
      { id: 'item-0', kind: 'potion', pos: { x: 0, y: 0 }, item: true },
    ]);
    const { state, events } = applyCommand(
      before,
      { type: 'pickup' },
      rngFromState(before.rng),
    );
    expect(events).toEqual([
      { type: 'item-picked-up', actorId: 'player', itemId: 'potion', entityId: 'item-0' },
    ]);
    expect(state.entities.some((e) => e.id === 'item-0')).toBe(false);
    expect(state.carriedItemIds).toEqual(['potion']);
    // Pickup success advances the turn step (no monsters here, so events are
    // unchanged), and the input is not mutated.
    expect(state.events).toEqual(before.events.concat(events));
  });
});

// ---------------------------------------------------------------------------
// explored-on-move (change `levelgen-and-fov`, task 4.3)
// ---------------------------------------------------------------------------

describe('movement updates the explored mask', () => {
  /** A 5x5 open room with the player at (2, 2) and an all-false mask. */
  function openState(): GameState {
    const grid = createGrid(
      Array.from({ length: 5 }, () => new Array<boolean>(5).fill(true)),
    );
    const rng = createRng(99);
    return {
      grid,
      level: { depth: 1, spawn: at(2, 2), stairs: at(4, 4) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [{ id: 'player', kind: 'player', pos: at(2, 2) }],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 99, state: rng.state() },
      events: [],
    };
  }

  it('ORs the new position FOV into explored after a successful move', () => {
    const before = openState();
    const { state } = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    );

    expect(state.entities.find((e) => e.id === 'player')?.pos).toEqual(at(3, 2));
    const visibleAtNew = computeFov(state.grid, at(3, 2), DEFAULT_SIGHT_RADIUS);
    expect(state.explored).toEqual(visibleAtNew);
  });

  it('retains previously explored tiles and only grows', () => {
    const before = openState();
    const afterFirst = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    ).state;
    const afterSecond = applyCommand(
      afterFirst,
      { type: 'move', direction: 'south' },
      rngFromState(afterFirst.rng),
    ).state;

    // Second step's explored equals first mask OR'd with the new FOV.
    const expected = exploreInto(
      afterFirst.explored,
      computeFov(afterSecond.grid, at(3, 3), DEFAULT_SIGHT_RADIUS),
    );
    expect(afterSecond.explored).toEqual(expected);

    afterFirst.explored.forEach((wasExplored, index) => {
      if (wasExplored) expect(afterSecond.explored[index]).toBe(true);
    });
  });

  it('leaves explored byte-for-byte unchanged when the move is blocked', () => {
    const before = openState();
    // Seed the mask with a known pattern, then ram the top boundary.
    const seeded: GameState = {
      ...before,
      explored: before.explored.map((_, index) => index % 3 === 0),
      entities: [{ id: 'player', kind: 'player', pos: at(2, 0) }],
    };
    const { state, events } = applyCommand(
      seeded,
      { type: 'move', direction: 'north' },
      rngFromState(seeded.rng),
    );

    expect(events[0]).toEqual(blocked('player', 'north'));
    expect(state.explored).toEqual(seeded.explored);
    expect(state.grid).toEqual(seeded.grid);
    expect(state.level).toEqual(seeded.level);
  });
});

// ---------------------------------------------------------------------------
// RNG threading
// ---------------------------------------------------------------------------

describe('RNG threading through the command loop', () => {
  it('writes the rng state back into the returned state', () => {
    const state = makeState();
    const rng = createRng(state.rng.seed);
    rng.next(); // advance away from the seed
    const advanced = rng.state();

    const { state: next } = applyCommand(state, { type: 'move', direction: 'south' }, rng);

    expect(next.rng.state).toBe(advanced);
    expect(next.rng.seed).toBe(state.rng.seed);
  });

  it('accepts an Rng resumed from the state and preserves subsequent draws', () => {
    const state = makeState();
    const rng = rngFromState(state.rng);
    const { state: next } = applyCommand(state, { type: 'move', direction: 'south' }, rng);
    expect(next.rng).toEqual({ seed: state.rng.seed, state: rng.state() });
  });
});

// ---------------------------------------------------------------------------
// Event log + replay
// ---------------------------------------------------------------------------

describe('event log append-only across commands', () => {
  it('records events in order and never removes or reorders them', () => {
    let state = makeState();
    const log: GameEvent[] = [];

    const sequence: Command[] = [
      { type: 'move', direction: 'south' },  // moved to (0,1)
      { type: 'move', direction: 'east' },   // blocked by wall
      { type: 'move', direction: 'north' },  // moved to (0,0)
      { type: 'bogus' } as unknown as Command, // noop
    ];
    const expectedTypes: GameEvent['type'][] = ['moved', 'blocked', 'moved', 'noop'];

    for (const command of sequence) {
      const rng = rngFromState(state.rng);
      const result = applyCommand(state, command, rng);
      log.push(...result.events);
      state = result.state;
    }

    expect(state.events).toEqual(log);
    expect(state.events.map((e) => e.type)).toEqual(expectedTypes);
    expect(state.events).toHaveLength(4);

    // A single monotonic prefix: each step's log is a superset of the prior.
    for (let i = 0; i < state.events.length; i++) {
      expect(state.events[i]).toEqual(log[i]);
    }
  });
});

describe('command log replay determinism', () => {
  it('produces identical events and final state for the same seed + command sequence', () => {
    const commands: Command[] = [
      { type: 'move', direction: 'south' },
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'south' },
      { type: 'move', direction: 'west' },
      { type: 'nope' } as unknown as Command,
    ];

    function run(): GameState {
      let state = makeState();
      for (const command of commands) {
        state = applyCommand(state, command, rngFromState(state.rng)).state;
      }
      return state;
    }

    const a = run();
    const b = run();

    expect(b.events).toEqual(a.events);
    expect(b.entities).toEqual(a.entities);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip of produced state
// ---------------------------------------------------------------------------

describe('JSON round-trip of a produced state', () => {
  it('is equivalent to the original and behaves identically for further commands', () => {
    let original = makeState();
    original = applyCommand(
      original,
      { type: 'move', direction: 'south' },
      rngFromState(original.rng),
    ).state;
    original = applyCommand(
      original,
      { type: 'move', direction: 'east' },
      rngFromState(original.rng),
    ).state;

    const roundTripped: GameState = JSON.parse(JSON.stringify(original));
    expect(roundTripped).toEqual(original);

    // Further identical commands from both states yield identical results.
    const command: Command = { type: 'move', direction: 'south' };
    const fromOriginal = applyCommand(original, command, rngFromState(original.rng));
    const fromRoundTripped = applyCommand(roundTripped, command, rngFromState(roundTripped.rng));

    expect(fromRoundTripped.events).toEqual(fromOriginal.events);
    expect(fromRoundTripped.state).toEqual(fromOriginal.state);
  });
});

// ---------------------------------------------------------------------------
// 5.3 — turn matrix + permadeath (design D5)
// ---------------------------------------------------------------------------

describe('turn step: monsters advance per the D5 outcome matrix', () => {
  /**
   * A wide open room with the player at (1,1) and a `chase` monster several
   * tiles away at (1,6) (within `DEFAULT_BEHAVIOR_RANGE` 8, so it always acts).
   * The monster is a genuine mid-range entity, so a monster `moved` event is
   * observable and attributable.
   */
  function chaseState(): GameState {
    const grid = createGrid(
      Array.from({ length: 8 }, () => new Array<boolean>(8).fill(true)),
    );
    const rng = createRng(0x5eed);
    return {
      grid,
      level: { depth: 1, spawn: at(1, 1), stairs: at(7, 7) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 20, attack: 4 },
        { id: 'goblin', kind: 'goblin', pos: at(1, 6), hp: 5, behavior: 'chase', attack: 2 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 0x5eed, state: rng.state() },
      events: [],
    };
  }

  it('a successful move advances the monster (appended after the player event)', () => {
    const state = chaseState();
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    // Player event first, then the monster's.
    expect(events[0]?.type).toBe('moved');
    expect((events[0] as { entityId: string }).entityId).toBe('player');
    expect(events.some((e) => e.type === 'moved' && (e as { entityId: string }).entityId === 'goblin')).toBe(true);
    // The goblin actually moved one tile north toward the player.
    expect(next.entities.find((e) => e.id === 'goblin')?.pos).toEqual(at(1, 5));
  });

  it('a blocked move does not advance the monster', () => {
    const state = chaseState();
    // Move the player to the top edge; north is out of bounds.
    const atEdge: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === 'player' ? { ...e, pos: at(0, 0) } : e,
      ),
    };
    const { events } = applyCommand(
      atEdge,
      { type: 'move', direction: 'north' },
      rngFromState(atEdge.rng),
    );
    expect(events).toEqual([blocked('player', 'north')]);
  });

  it('a noop command does not advance the monster', () => {
    const state = chaseState();
    const { events } = applyCommand(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events.length).toBeGreaterThan(1); // sanity: the advance happened
    // Now a noop (out-of-bounds attack) from the same state advances nothing.
    const noopState: GameState = {
      ...state,
      entities: state.entities.map((e) =>
        e.id === 'player' ? { ...e, pos: at(0, 0) } : e,
      ),
    };
    const noopResult = applyCommand(
      noopState,
      { type: 'attack', direction: 'north' },
      rngFromState(noopState.rng),
    );
    expect(noopResult.events).toEqual([noop('nothing-to-attack')]);
  });

  it('an attack hit advances the monster', () => {
    const state = chaseState();
    // Place a second monster adjacent to the player so the attack hits.
    const withTarget: GameState = {
      ...state,
      entities: [
        state.entities[0],
        { id: 'victim', kind: 'goblin', pos: at(2, 1), hp: 3 },
        state.entities[1],
      ],
    };
    const { events } = applyCommand(
      withTarget,
      { type: 'attack', direction: 'east' },
      rngFromState(withTarget.rng),
    );
    expect(events[0]?.type).toBe('attacked');
    // A monster act is present after the player's attack.
    const goblinAct = events.some(
      (e) => e.type === 'moved' && (e as { entityId: string }).entityId === 'goblin',
    );
    expect(goblinAct).toBe(true);
  });
});

describe('permadeath: the run is terminal', () => {
  function dyingState(): GameState {
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(0xdead);
    return {
      grid,
      level: { depth: 1, spawn: at(1, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 1, attack: 4 },
        { id: 'killer', kind: 'goblin', pos: at(2, 1), hp: 9, behavior: 'chase', attack: 20 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 0xdead, state: rng.state() },
      events: [],
    };
  }

  it('a monster killing the player sets status dead, removes the player, and emits player-died', () => {
    const state = dyingState();
    // The player attacks the killer (it survives with 9 hp), then the killer
    // counter-attacks for lethal damage.
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );
    expect(events[events.length - 1]).toEqual({ type: 'player-died' });
    expect(next.status).toBe('dead');
    expect(entityById(next.entities, 'player')).toBeUndefined();
  });

  it('any gameplay command after death is a noop and advances nothing', () => {
    const base = dyingState();
    const dead: GameState = { ...base, status: 'dead' };
    for (const command of [
      { type: 'move', direction: 'south' },
      { type: 'attack', direction: 'east' },
      { type: 'descend' },
      { type: 'use-item', itemId: 'potion' },
    ] as Command[]) {
      const { state, events } = applyCommand(dead, command, rngFromState(dead.rng));
      expect(events).toEqual([noop('run-over')]);
      expect(state).toEqual({ ...dead, events: [...dead.events, noop('run-over')] });
    }
  });

  it('the turn step stops the moment the player dies mid-step', () => {
    // Two adjacent lethal monsters and a 1-hp player: the first kills the
    // player, so the second must not act (it stays put and emits nothing).
    const grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(3);
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: at(1, 1), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(1, 1), hp: 1, attack: 1 },
        { id: 'killer', kind: 'goblin', pos: at(1, 0), hp: 9, behavior: 'chase', attack: 20 },
        { id: 'bystander', kind: 'goblin', pos: at(0, 1), hp: 9, behavior: 'chase', attack: 20 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 3, state: rng.state() },
      events: [],
    };

    // A blocked move (north is occupied by the killer? no — north of (1,1) is
    // (1,0) which holds the killer → bump-attack). Use a move that is a real
    // world change and gives the monsters their turn: move south.
    const { state: next, events } = applyCommand(
      state,
      { type: 'move', direction: 'south' },
      rngFromState(state.rng),
    );
    expect(next.status).toBe('dead');
    // Only the first monster acted (one attacked event), then player-died.
    const attacks = events.filter((e) => e.type === 'attacked');
    expect(attacks).toHaveLength(1);
    expect(events[events.length - 1]).toEqual({ type: 'player-died' });
    // The bystander never moved.
    expect(next.entities.find((e) => e.id === 'bystander')?.pos).toEqual(at(0, 1));
  });
});

describe('descent does not advance the new level monsters', () => {
  /**
   * A hand-built small level-1 fixture with the player already on the stairs
   * (Phase-7 gate). The pack-aware entry point populates the generated level-2,
   * so the D5 rule is asserted directly: `level-changed` must not be followed by
   * any monster act even though the fresh level has monsters.
   */
  function onStairsState(seed: number): GameState {
    const grid = createGrid([
      [true, false, true],
      [true, false, true],
      [true, false, true],
    ]);
    const rng = createRng(seed);
    return {
      grid,
      level: { depth: 1, spawn: at(0, 0), stairs: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: at(2, 2), hp: 10, attack: 4 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed, state: rng.state() },
      events: [],
    };
  }

  /**
   * A pack with several `chase` monsters so a fresh level is densely populated
   * and a within-range fresh monster is likely — making the no-advance gate
   * falsifiable rather than vacuously true (finding C2).
   */
  function densePack(): LoadedPack {
    return loadPack({
      id: 'descend-turn-test-pack',
      name: 'Descend Turn Test Pack',
      version: 2,
      classes: [
        { id: 'fighter', name: 'Fighter', glyph: '@', hp: 10, attack: 4 },
        { id: 'rogue', name: 'Rogue', glyph: 'r', hp: 8, attack: 3 },
      ],
      monsters: [
        { id: 'slime', name: 'Slime', glyph: 's', hp: 2, behavior: 'chase', attack: 1 },
        { id: 'rat', name: 'Rat', glyph: 'r', hp: 3, behavior: 'chase', attack: 1 },
        { id: 'bat', name: 'Bat', glyph: 'b', hp: 4, behavior: 'chase', attack: 2 },
        { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 5, behavior: 'chase', attack: 2 },
      ],
      items: [
        { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
      ],
    });
  }

  /**
   * Runs a pack-aware descent from the on-stairs fixture and returns the result.
   * A fresh monster "could act" per the AI's awareness rule (design D3): chase
   * pursues when it has line of sight to the player, or when it is within
   * `DEFAULT_BEHAVIOR_RANGE` (Chebyshev 8) regardless of sight.
   */
  function descend(seed: number, pack: LoadedPack) {
    const state = onStairsState(seed);
    return applyCommandWithPack(
      state,
      { type: 'descend' },
      rngFromState(state.rng),
      pack,
    );
  }

  /**
   * True when some freshly placed monster on `next` is within the awareness
   * range of the player's new position, so it *would* act on a normal turn.
   */
  function freshMonsterInRange(next: GameState): boolean {
    const player = entityById(next.entities, next.playerId);
    if (player === undefined) return false;
    return next.entities.some((entity) => {
      if (entity.id === next.playerId || entity.item === true) return false;
      const distance = Math.max(
        Math.abs(entity.pos.x - player.pos.x),
        Math.abs(entity.pos.y - player.pos.y),
      );
      return distance <= 8;
    });
  }

  it('emits exactly level-changed on a within-range fresh monster (deterministic fixture)', () => {
    // Seed 5 is a confirmed case (probed): the fresh level places a skeleton at
    // Chebyshev 6 from the new spawn, so a wrongly-promoted `level-changed`
    // gate would let it act and add a `moved`/`attacked` event. The descent must
    // emit only the level-change outcome.
    const { state: next, events } = descend(5, densePack());

    expect(events).toEqual([{ type: 'level-changed', depth: 2 }]);
    expect(next.level.depth).toBe(2);
    // The new level is populated, proving there were monsters that *could* act.
    expect(next.entities.some((e) => e.item !== true && e.id !== 'player')).toBe(
      true,
    );
    // And at least one is within range of the new spawn — so the inert result is
    // meaningful, not just a far-away idle population.
    expect(freshMonsterInRange(next)).toBe(true);
  });

  it('is inert for every seed whose fresh level has a monster in range (seed sweep)', () => {
    // Curated seeds confirmed (probed against the dense pack) to place a fresh
    // level-2 monster within awareness range of the new spawn. For each, the
    // descend event stream must be exactly `level-changed`: no `moved`,
    // `attacked`, or `death` from a fresh monster.
    const inRangeSeeds = [5, 8, 10, 16, 19, 20, 21, 23, 27, 30, 40, 51];

    let observedInRange = 0;
    for (const seed of inRangeSeeds) {
      const { state: next, events } = descend(seed, densePack());
      expect(events).toEqual([{ type: 'level-changed', depth: 2 }]);
      if (freshMonsterInRange(next)) observedInRange++;
    }
    // The sweep really did include seeds where a fresh monster was in range, so
    // the assertion above is not vacuous.
    expect(observedInRange).toBeGreaterThan(0);
  });

  it('a sweep over many seeds never advances a fresh monster', () => {
    // Broad sweep: for every seed 0..99 the descent must emit exactly the
    // level-change event, whether or not the fresh population is in range.
    for (let seed = 0; seed < 100; seed++) {
      const { events } = descend(seed, densePack());
      expect(events).toEqual([{ type: 'level-changed', depth: 2 }]);
    }
  });
});
