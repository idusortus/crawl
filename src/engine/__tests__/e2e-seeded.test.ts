/**
 * End-to-end seeded test (task 5.1).
 *
 * This is the first test that exercises the *whole* public engine surface in a
 * single scenario rather than probing one module in isolation:
 *
 *   build grid -> fixed command sequence -> full event stream + final state
 *
 * It proves three things the Phase 3 unit tests each only cover in fragments:
 *
 *   1. Full-run determinism: the same seed + the same command sequence produce
 *      an identical event stream and an identical final state.
 *   2. Lossless save/replay: serializing the mid-run state *and* the command log
 *      to JSON, then deserializing and replaying the remaining commands,
 *      reproduces the uninterrupted run's event stream and final state exactly.
 *   3. A mixed stream of successful `move`s and refused (`blocked`) `move`s —
 *      plus a `noop` from an unknown command type — stays JSON-clean end-to-end.
 *
 * Everything is imported from the public surface (`@engine`), matching the
 * "consumers import the barrel, never a deep module" rule from task 4.4.
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createGrid,
  createRng,
  rngFromState,
  rngToState,
} from '@engine/index';
import type {
  Command,
  GameEvent,
  GameState,
  Position,
} from '@engine/index';

// ---------------------------------------------------------------------------
// Scenario fixture
// ---------------------------------------------------------------------------

/** Fixed seed shared by the reference run, the replay, and the resume run. */
const SEED = 0xc0ffee;

const at = (x: number, y: number): Position => ({ x, y });

/**
 * A 4x4 world with a wall row at y=1 and a wall column at x=3.
 *
 *        x=0    x=1    x=2    x=3
 *   y=0   .      .      .      #
 *   y=1   #      #      #      #
 *   y=2   .      .      .      #
 *   y=3   .      .      .      #
 *
 * Player starts at (0, 0); a rock occupies (1, 0), blocking the only eastward
 * step from the start tile. This guarantees a mix of successful and refused
 * steps without relying on randomness at all.
 */
function createScenarioGrid() {
  return createGrid([
    [true, true, true, false],
    [false, false, false, false],
    [true, true, true, false],
    [true, true, true, false],
  ]);
}

/** The immutable starting state for a run: grid + player + rock, empty log. */
function createInitialState(): GameState {
  const rng = createRng(SEED);
  return {
    grid: createScenarioGrid(),
    entities: [
      { id: 'player', kind: 'player', pos: at(0, 0) },
      { id: 'rock', kind: 'rock', pos: at(1, 0) },
    ],
    playerId: 'player',
    rng: rngToState(SEED, rng),
    events: [],
  };
}

/**
 * A command sequence in which **every** move is refused, so the event stream is
 * `blocked` x6 followed by one `noop`. This is the harshest case for a "does
 * the log stay consistent?" e2e: nothing moves, yet the append-only log must
 * still grow by exactly one event per command and replay must reproduce it.
 *
 * With the player at (0, 0) and the rock at (1, 0), step by step:
 *
 *   1. move east  -> blocked (rock occupies (1, 0))
 *   2. move south -> blocked (wall row y=1)
 *   3. move west  -> blocked (x=-1 out of bounds)
 *   4. move north -> blocked (y=-1 out of bounds)
 *   5. move east  -> blocked (rock, still at (1, 0))
 *   6. move south -> blocked (wall row y=1)
 *   7. teleport   -> noop    (unknown command, state unchanged)
 */
const BLOCKED_SEQUENCE: Command[] = [
  { type: 'move', direction: 'east' },
  { type: 'move', direction: 'south' },
  { type: 'move', direction: 'west' },
  { type: 'move', direction: 'north' },
  { type: 'move', direction: 'east' },
  { type: 'move', direction: 'south' },
  { type: 'teleport', destination: 'moon' } as unknown as Command,
];

/**
 * Full mixed sequence used by the e2e: five refusals + one `noop`, then real
 * movement after the player is relocated onto open floor (see `runMixed`).
 *
 * Commands 0–4 run from the start tile (0, 0) with the rock at (1, 0):
 *   0. move east  -> blocked (rock)
 *   1. move south -> blocked (wall row y=1)
 *   2. move west  -> blocked (out of bounds x=-1)
 *   3. move north -> blocked (out of bounds y=-1)
 *   4. teleport   -> noop    (unknown command)
 *
 * `runMixed` then places the player at (0, 2) via a fixture edit (not an engine
 * command; M1 has no teleport), and commands 5–11 walk the open room:
 *   5.  move east  -> moved (0,2) -> (1,2)
 *   6.  move east  -> moved (1,2) -> (2,2)
 *   7.  move east  -> blocked (wall column x=3)
 *   8.  move south -> moved (2,2) -> (2,3)
 *   9.  move west  -> moved (2,3) -> (1,3)
 *  10.  move north -> moved (1,3) -> (1,2)
 *  11.  move west  -> moved (1,2) -> (0,2)
 *
 * The test asserts the resulting event types exactly (see `EXPECTED_TYPES`) and
 * checks the final player tile, rather than hand-encoding every intermediate.
 */
const MIXED_SEQUENCE: Command[] = [
  { type: 'move', direction: 'east' }, // blocked by rock at (1,0)
  { type: 'move', direction: 'south' }, // blocked by wall row y=1
  { type: 'move', direction: 'west' }, // blocked out of bounds
  { type: 'move', direction: 'north' }, // blocked out of bounds
  { type: 'teleport', destination: 'moon' } as unknown as Command, // noop
  { type: 'move', direction: 'east' }, // moved (0,2)->(1,2)
  { type: 'move', direction: 'east' }, // moved (1,2)->(2,2)
  { type: 'move', direction: 'east' }, // blocked by wall column x=3
  { type: 'move', direction: 'south' }, // moved (2,2)->(2,3)
  { type: 'move', direction: 'west' }, // moved (2,3)->(1,3)
  { type: 'move', direction: 'north' }, // moved (1,3)->(1,2)
  { type: 'move', direction: 'west' }, // moved (1,2)->(0,2)
];

// ---------------------------------------------------------------------------
// Run helpers
// ---------------------------------------------------------------------------

/**
 * Applies a command sequence to `start` using the RNG resumed from the passed
 * state, exactly as a real consumer would. Returns the final state; because the
 * state also carries the append-only event log, its `events` field is the full
 * stream for the run.
 */
function replay(start: GameState, commands: Command[]): GameState {
  let state = start;
  for (const command of commands) {
    state = applyCommand(state, command, rngFromState(state.rng)).state;
  }
  return state;
}

/**
 * Runs `MIXED_SEQUENCE` end-to-end, relocating the player to (0, 2) between
 * commands 4 and 5 so the tail exercises real movement. The relocation is a
 * fixture edit on a plain-data copy (M1 has no teleport command); it keeps the
 * state strictly JSON-clean and matches the split index used by the save/replay
 * test so the two runs are directly comparable.
 */
function runMixed(): GameState {
  const initial = createInitialState();
  const beforeRelocation = replay(initial, MIXED_SEQUENCE.slice(0, 5));
  const relocated: GameState = {
    ...beforeRelocation,
    entities: beforeRelocation.entities.map((entity) =>
      entity.id === 'player' ? { ...entity, pos: at(0, 2) } : entity,
    ),
  };
  return replay(relocated, MIXED_SEQUENCE.slice(5));
}

// ---------------------------------------------------------------------------
// Deriving expected streams for assertions (kept explicit, not generated from
// the implementation under test, so a regression in either run is caught).
// ---------------------------------------------------------------------------

/** Expected event type per command index for the mixed scenario above. */
const EXPECTED_TYPES: GameEvent['type'][] = [
  'blocked', // east  (rock)
  'blocked', // south (wall)
  'blocked', // west  (oob)
  'blocked', // north (oob)
  'noop', // teleport (unknown)
  'moved', // east
  'moved', // east
  'blocked', // east  (wall column)
  'moved', // south
  'moved', // west
  'moved', // north
  'moved', // west
];

// ---------------------------------------------------------------------------
// 5.1 — end-to-end seeded test
// ---------------------------------------------------------------------------

describe('end-to-end seeded run', () => {
  it('emits the expected full event stream with a mix of moved/blocked/noop', () => {
    const finalState = runMixed();

    expect(finalState.events).toHaveLength(MIXED_SEQUENCE.length);
    expect(finalState.events.map((event) => event.type)).toEqual(EXPECTED_TYPES);
    // Sanity: the scenario really does contain both outcomes and a noop.
    expect(finalState.events.some((event) => event.type === 'moved')).toBe(true);
    expect(finalState.events.some((event) => event.type === 'blocked')).toBe(true);
    expect(finalState.events.some((event) => event.type === 'noop')).toBe(true);
  });

  it('reproduces an identical event stream and final state from the same seed', () => {
    const reference = runMixed();
    const replayed = runMixed();

    // The full event stream matches in type, order, and payload.
    expect(replayed.events).toEqual(reference.events);
    // The final world state matches (grid, entities, playerId, rng state, log).
    expect(replayed).toEqual(reference);

    // The player lands on the expected tile: walked west off (1,2) to (0,2).
    expect(
      replayed.entities.find((entity) => entity.id === 'player')?.pos,
    ).toEqual(at(0, 2));
    // The rock never moved (no engine-supported push in M1).
    expect(
      replayed.entities.find((entity) => entity.id === 'rock')?.pos,
    ).toEqual(at(1, 0));
  });

  it('is a pure JSON value: the whole run round-trips without loss', () => {
    const finalState = runMixed();
    const roundTripped: GameState = JSON.parse(JSON.stringify(finalState));
    expect(roundTripped).toEqual(finalState);
    // Re-serializing must be byte-stable (guards JSON-clean/no undefined).
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(finalState));
  });

  it('is lossless through a save/replay cycle (serialized state + command log)', () => {
    // ---- Reference run: uninterrupted, all 12 commands. ----
    const reference = runMixed();

    // ---- Save/replay run: run the first 5 commands, serialize the mid-run
    // state AND the *remaining* command log to JSON, then resume. ----
    const SPLIT = 5;
    const initial = createInitialState();
    const beforeRelocation = replay(initial, MIXED_SEQUENCE.slice(0, SPLIT));

    // The relocation fixture edit (see `runMixed`) is part of the scenario
    // state, so it must be serialized too.
    const relocated: GameState = {
      ...beforeRelocation,
      entities: beforeRelocation.entities.map((entity) =>
        entity.id === 'player' ? { ...entity, pos: at(0, 2) } : entity,
      ),
    };

    // Serialize state + the remaining command log to JSON, then deserialize.
    const saved = JSON.stringify(relocated);
    const savedLog = JSON.stringify(MIXED_SEQUENCE.slice(SPLIT));
    const resumed: GameState = JSON.parse(saved);
    const remaining: Command[] = JSON.parse(savedLog);

    // The deserialized state is identical to what was saved.
    expect(resumed).toEqual(relocated);

    // Replay the remaining commands on the deserialized state.
    const resumedFinal = replay(resumed, remaining);

    // ---- The resumed run must match the uninterrupted reference run exactly. ----
    expect(resumedFinal.events).toEqual(reference.events);
    expect(resumedFinal).toEqual(reference);

    // Spell out the key matching fields so a failure points at the culprit.
    expect(resumedFinal.events.map((event) => event.type)).toEqual(EXPECTED_TYPES);
    expect(resumedFinal.entities).toEqual(reference.entities);
    expect(resumedFinal.rng).toEqual(reference.rng);
    expect(resumedFinal.playerId).toBe(reference.playerId);
    expect(resumedFinal.grid).toEqual(reference.grid);
  });

  it('carries the originating seed verbatim through a full run', () => {
    // M1 `move` resolution is deterministic and seed-independent: no branch
    // draws from the RNG, so for the same command count the state's rng *state*
    // advances identically regardless of seed, and the event stream is likewise
    // seed-independent. What the seed field must do is survive the whole run
    // unchanged — this asserts the seed is never silently reset or re-seeded.
    const runA = runMixed();

    const otherSeed = SEED + 1;
    const rng = createRng(otherSeed);
    const different: GameState = {
      ...createInitialState(),
      rng: rngToState(otherSeed, rng),
    };
    const beforeRelocation = replay(different, MIXED_SEQUENCE.slice(0, 5));
    const relocated: GameState = {
      ...beforeRelocation,
      entities: beforeRelocation.entities.map((entity) =>
        entity.id === 'player' ? { ...entity, pos: at(0, 2) } : entity,
      ),
    };
    const runB = replay(relocated, MIXED_SEQUENCE.slice(5));

    expect(runB.rng.seed).toBe(otherSeed);
    expect(runA.rng.seed).toBe(SEED);
    expect(runB.events).toEqual(runA.events);
  });
});

// Keep `BLOCKED_SEQUENCE` and the docs above honest: the all-refused variant is
// also replayed to prove a stream can be entirely refusals and still be exact.
describe('end-to-end seeded run (all-refusals variant)', () => {
  it('replays a command sequence where nothing moves to an identical stream', () => {
    const start = createInitialState();

    const reference = replay(start, BLOCKED_SEQUENCE);
    const replayed = replay(start, BLOCKED_SEQUENCE);

    expect(reference.events.map((event) => event.type)).toEqual([
      'blocked',
      'blocked',
      'blocked',
      'blocked',
      'blocked',
      'blocked',
      'noop',
    ]);
    expect(replayed.events).toEqual(reference.events);
    expect(replayed).toEqual(reference);
    // Nothing moved: the player is still on its start tile.
    expect(
      reference.entities.find((entity) => entity.id === 'player')?.pos,
    ).toEqual(at(0, 0));
  });
});
