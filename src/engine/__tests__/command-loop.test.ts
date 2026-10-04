import { describe, it, expect } from 'vitest';
import {
  appendEvents,
  applyCommand,
  blocked,
  createGrid,
  createRng,
  entityAt,
  moved,
  noop,
  rngFromState,
} from '../index';
import { computeFov, exploreInto, DEFAULT_SIGHT_RADIUS } from '../fov';
import type { Command, GameEvent, GameState, Position } from '../index';

/**
 * Test fixture: a 3x3 grid with a wall column at x=1.
 *
 *   y=0:  . # .
 *   y=1:  . # .
 *   y=2:  . # .
 *
 * Player starts at (0, 0); a rock occupies (2, 0).
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
    level: { depth: 1, spawn: { x: 0, y: 0 } },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: entities ?? [
      { id: 'player', kind: 'player', pos: { x: 0, y: 0 } },
      { id: 'rock', kind: 'rock', pos: { x: 2, y: 0 } },
    ],
    playerId: 'player',
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
        level: { depth: 1, spawn: at(1, 1) },
        explored: new Array<boolean>(openGrid.width * openGrid.height).fill(false),
        entities: [{ id: 'player', kind: 'player', pos: at(1, 1) }],
        playerId: 'player',
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

  it('move into a tile occupied by a blocking entity is blocked', () => {
    // Fully passable grid so the block is attributable to the occupant, not a wall.
    const openGrid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(1234);
    const state: GameState = {
      grid: openGrid,
      level: { depth: 1, spawn: at(0, 1) },
      explored: new Array<boolean>(openGrid.width * openGrid.height).fill(false),
      entities: [
        { id: 'player', kind: 'player', pos: at(0, 1) },
        { id: 'rock', kind: 'rock', pos: at(1, 1) },
      ],
      playerId: 'player',
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
      level: { depth: 1, spawn: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [{ id: 'player', kind: 'player', pos: at(2, 2) }],
      playerId: 'player',
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
