/**
 * End-to-end seeded test (task 5.1; extended by task 10.2).
 *
 * This test exercises the *whole* public engine surface in a single scenario
 * rather than probing one module in isolation:
 *
 *   build grid -> fixed command sequence -> full event stream + final state
 *
 * It proves, in two scenarios:
 *
 *   A. **Content-free movement** (the original task-5.1 scenario): the same seed
 *      + the same `move`/`noop` sequence produce an identical event stream and
 *      final state, the state is JSON-clean, and a serialize-the-mid-run-state +
 *      remaining-log resume reproduces the uninterrupted run exactly.
 *
 *   B. **Monster AI + combat + save/load** (task 10.2): a pinned-seed run with a
 *      real pack where a monster acts (attacks the player), the player kills it
 *      (a `death`), and a save taken mid-run then resumed by replaying only the
 *      unapplied remainder reproduces the uninterrupted run exactly — including
 *      the loud rejection of an unknown `SAVE_VERSION`.
 *
 * Everything is imported from the public surface (`@engine`), matching the
 * "consumers import the barrel, never a deep module" rule from task 4.4.
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  applyCommandWithPack,
  createGrid,
  createRng,
  deserializeSave,
  loadPack,
  MELEE_DAMAGE_KIND,
  rngFromState,
  rngToState,
  resumeRun,
  SAVE_VERSION,
  serializeSave,
  UnknownSaveVersionError,
} from '@engine/index';
import type {
  Command,
  GameEvent,
  GameState,
  LoadedPack,
  Position,
} from '@engine/index';

// ---------------------------------------------------------------------------
// Scenario fixture
// ---------------------------------------------------------------------------

/** Fixed seed shared by the reference run, the replay, and the resume run. */
const SEED = 0xc0ffee;

const at = (x: number, y: number): Position => ({ x, y });

/**
 * A 4x4 world with a wall row at y=1 and a wall column at x=3, plus a wall tile
 * at (1, 0).
 *
 *        x=0    x=1    x=2    x=3
 *   y=0   .      #      .      #
 *   y=1   #      #      #      #
 *   y=2   .      .      .      #
 *   y=3   .      .      .      #
 *
 * Player starts at (0, 0); the wall at (1, 0) blocks the only eastward step from
 * the start tile. This guarantees a mix of successful and refused steps without
 * relying on randomness at all. (The former `rock` occupant became a wall tile:
 * after bump-to-attack, a living occupant would be attacked rather than blocking,
 * so terrain is the honest fixture for a `blocked` assertion — task 5.2.)
 */
function createScenarioGrid() {
  return createGrid([
    [true, false, true, false],
    [false, false, false, false],
    [true, true, true, false],
    [true, true, true, false],
  ]);
}

/** The immutable starting state for a run: grid + player, empty log. */
function createInitialState(): GameState {
  const rng = createRng(SEED);
  const grid = createScenarioGrid();
  return {
    grid,
    level: { depth: 1, spawn: at(0, 0), stairs: at(2, 3) },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [{ id: 'player', kind: 'player', pos: at(0, 0) }],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
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
 * With the player at (0, 0) and the wall tile at (1, 0), step by step:
 *
 *   1. move east  -> blocked (wall tile (1, 0))
 *   2. move south -> blocked (wall row y=1)
 *   3. move west  -> blocked (x=-1 out of bounds)
 *   4. move north -> blocked (y=-1 out of bounds)
 *   5. move east  -> blocked (wall tile, still at (1, 0))
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
 * Commands 0–4 run from the start tile (0, 0) with the wall at (1, 0):
 *   0. move east  -> blocked (wall tile (1,0))
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
  { type: 'move', direction: 'east' }, // blocked by wall at (1,0)
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
  'blocked', // east  (wall tile)
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
    // The player is the only entity: the blocking tile is terrain, not a rock.
    expect(replayed.entities).toHaveLength(1);
    expect(replayed.entities[0].id).toBe('player');
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

  it('preserves the originating seed verbatim through a full run', () => {
    // Every command here is content-free and no monsters are present, so `move`
    // resolution draws nothing. What the seed field must do is survive the whole
    // run unchanged — this asserts the seed is never silently reset or
    // re-seeded. It deliberately does NOT compare the cross-seed event streams:
    // once monsters act (and any combat draw happens), the stream becomes a
    // function of the seed, so event-equality across seeds is not a valid claim
    // (task 5.2 rewrite).
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

    // Seed survival/preservation only.
    expect(runB.rng.seed).toBe(otherSeed);
    expect(runA.rng.seed).toBe(SEED);
    // The seed survives every command in the log, including the noop.
    expect(runB.events.map((event) => event.type)).toEqual(EXPECTED_TYPES);
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

// ---------------------------------------------------------------------------
// Task 10.2 — seeded monster AI + combat + save/load end-to-end
// ---------------------------------------------------------------------------

/**
 * A pack with one chase monster (3 HP) and one deterministic heal item. The
 * monster's copied `attack` is 1 and the hero's is 10, so an adjacent fight is
 * decided in the player's favour within a couple of turns — giving a
 * deterministic *monster acts* + *player kill* run without depending on a damage
 * roll's outcome (the kill is guaranteed).
 */
function combatPack(): LoadedPack {
  return loadPack({
    id: 'e2e-combat-pack',
    name: 'E2E Combat Pack',
    version: 2,
    classes: [
      { id: 'hero', name: 'Hero', glyph: '@', hp: 20, attack: 10 },
      { id: 'sage', name: 'Sage', glyph: 'S', hp: 8, attack: 3 },
    ],
    monsters: [
      { id: 'slime', name: 'Slime', glyph: 's', hp: 3, behavior: 'chase', attack: 1 },
    ],
    items: [
      { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
    ],
  });
}

/** The pinned seed shared by the combat run, its replay, and its resume. */
const COMBAT_SEED = 0xc0ffee;

/**
 * A 6x6 open room. The player starts at (0, 0) with the pack class's HP/attack;
 * a chase monster sits at (2, 0) (two tiles east, in sight); a potion lies at
 * (1, 0) between them; the stairs are at (5, 5).
 *
 * Layout (all open floor):
 *
 *        x=0     x=1     x=2     ...
 *   y=0   player  potion  slime
 *   y=5                                   stairs
 *
 * The potion *between* the player and the monster is deliberate: stepping east
 * onto it puts the player adjacent to the monster, so the monster acts (attacks)
 * on the very same turn — the first evidence of the per-turn AI step.
 */
function createCombatState(pack: LoadedPack): GameState {
  const rng = createRng(COMBAT_SEED);
  const grid = createGrid(Array.from({ length: 6 }, () => Array(6).fill(true)));
  const hero = pack.class('hero');
  return {
    grid,
    level: { depth: 1, spawn: at(0, 0), stairs: at(5, 5) },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [
      {
        id: 'player',
        kind: 'hero',
        pos: at(0, 0),
        hp: hero.hp,
        attack: hero.attack,
      },
      {
        id: 'slime',
        kind: 'slime',
        pos: at(2, 0),
        hp: 3,
        behavior: 'chase',
        attack: 1,
      },
      { id: 'item-0', kind: 'potion', pos: at(1, 0), item: true },
    ],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: rngToState(COMBAT_SEED, rng),
    events: [],
  };
}

/**
 * The combat command sequence. With the player at (0, 0) and the monster at
 * (2, 0), step by step (each successful gameplay command advances the monster
 * per D5):
 *
 *   0. move east  -> moved (0,0)->(1,0) onto the potion; monster adjacent
 *                    (2,0) attacks -> attacked(slime -> player)
 *   1. pickup     -> item-picked-up; monster attacks again -> attacked(slime)
 *   2. attack east-> attacked(player -> slime, 10); `death` removes the monster
 *   3. attack east-> noop (nothing-to-attack: the monster is gone)
 *   4. move south -> moved (1,0)->(1,1)
 *
 * The monster acts at commands 0 and 1; command 2 is the kill; command 3 proves
 * the kill is real (the target is gone). Split at 2 replays the kill on resume.
 */
const COMBAT_SEQUENCE: Command[] = [
  { type: 'move', direction: 'east' },
  { type: 'pickup' },
  { type: 'attack', direction: 'east' },
  { type: 'attack', direction: 'east' },
  { type: 'move', direction: 'south' },
];

/** The event type per command index for the combat scenario above. */
const COMBAT_EXPECTED_TYPES: GameEvent['type'][] = [
  'moved', // east: step onto the potion, monster attacks
  'attacked', // monster's attack on the move turn
  'item-picked-up', // pickup
  'attacked', // monster's attack on the pickup turn
  'attacked', // player's killing blow
  'death', // the monster is removed
  'noop', // attack east with nothing there
  'moved', // south
];

/**
 * Runs the combat scenario end-to-end through the **pack-aware** entry point,
 * resuming the RNG from each running state exactly as a live client does.
 */
function runCombat(
  pack: LoadedPack,
  commands: Command[] = COMBAT_SEQUENCE,
  start: GameState = createCombatState(pack),
): GameState {
  let state = start;
  for (const command of commands) {
    state = applyCommandWithPack(
      state,
      command,
      rngFromState(state.rng),
      pack,
    ).state;
  }
  return state;
}

describe('end-to-end seeded combat run (task 10.2)', () => {
  it('reproduces monster acts and a kill from a pinned seed', () => {
    const pack = combatPack();
    const run = runCombat(pack);

    // The full stream, exactly.
    expect(run.events.map((event) => event.type)).toEqual(COMBAT_EXPECTED_TYPES);

    // A monster acted: at least one attack whose attacker is the monster and
    // whose target is the player.
    const monsterAttacks = run.events.filter(
      (event) =>
        event.type === 'attacked' &&
        event.attackerId === 'slime' &&
        event.targetId === 'player',
    );
    expect(monsterAttacks.length).toBeGreaterThanOrEqual(1);
    // Damage is reported with the exported damage-kind constant, never a literal.
    expect(
      monsterAttacks.every((event) =>
        event.type === 'attacked' ? event.kind === MELEE_DAMAGE_KIND : false,
      ),
    ).toBe(true);

    // A kill happened: a `death` for the monster, which is then gone.
    expect(run.events.some((event) => event.type === 'death')).toBe(true);
    expect(run.entities.some((entity) => entity.id === 'slime')).toBe(false);

    // The player survived the fight and the run is still live.
    expect(run.status).toBe('playing');
    const player = run.entities.find((entity) => entity.id === 'player');
    expect(player?.hp).toBeLessThan(20);
    expect(player?.pos).toEqual(at(1, 1));

    // The picked-up potion was carried (content-as-data: an id, not an entry).
    expect(run.carriedItemIds).toEqual(['potion']);
  });

  it('is deterministic: the same seed reproduces the same stream and state', () => {
    const pack = combatPack();
    const reference = runCombat(pack);
    const replayed = runCombat(pack);

    expect(replayed.events).toEqual(reference.events);
    expect(replayed).toEqual(reference);
  });

  it('resumes a mid-run save by replaying only the remainder, exactly', () => {
    const pack = combatPack();
    const reference = runCombat(pack);

    // Take the save after the pickup and the monster's two attacks — the monster
    // is still alive at the split, so the remainder contains the kill.
    const SPLIT = 2;
    const midRun = runCombat(pack, COMBAT_SEQUENCE.slice(0, SPLIT));
    expect(midRun.entities.some((entity) => entity.id === 'slime')).toBe(true);

    // A mid-run save: full current state + full log + appliedCount < length.
    const save = serializeSave(midRun, COMBAT_SEQUENCE, SPLIT);
    const envelope = deserializeSave(save);
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.appliedCount).toBe(SPLIT);
    expect(envelope.appliedCount).toBeLessThan(COMBAT_SEQUENCE.length);

    // Resume replays only `commands.slice(SPLIT)` from the saved state.
    const resumed = resumeRun(save, pack);

    // The resumed run matches the uninterrupted reference run exactly.
    expect(resumed.events).toEqual(reference.events);
    expect(resumed).toEqual(reference);
    expect(resumed.events.map((event) => event.type)).toEqual(
      COMBAT_EXPECTED_TYPES,
    );
    expect(resumed.entities).toEqual(reference.entities);
    expect(resumed.rng).toEqual(reference.rng);
    expect(resumed.carriedItemIds).toEqual(reference.carriedItemIds);
    expect(resumed.status).toBe(reference.status);
  });

  it('rejects an unknown SAVE_VERSION loudly, naming the version', () => {
    const pack = combatPack();
    const midRun = runCombat(pack, COMBAT_SEQUENCE.slice(0, 2));
    const parsed = JSON.parse(
      serializeSave(midRun, COMBAT_SEQUENCE, 2),
    ) as { version: number };

    // A save from a future format must not be mis-parsed as a valid run.
    parsed.version = 999;
    let caught: unknown;
    try {
      deserializeSave(JSON.stringify(parsed));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownSaveVersionError);
    const err = caught as UnknownSaveVersionError;
    expect(err.version).toBe(999);
    expect(err.supported).toBe(SAVE_VERSION);
    expect(err.message).toContain('999');
    expect(err.message).toContain(String(SAVE_VERSION));
  });

  it('carries the originating seed verbatim (seed survival, not stream equality)', () => {
    // Every command here draws through the shared RNG (a monster attack does,
    // once adjacent), so the event stream is a function of the seed — event
    // equality across *different* seeds is NOT a valid claim. What must hold is
    // that the originating seed is never silently reset or re-seeded.
    const pack = combatPack();
    const runA = runCombat(pack);
    expect(runA.rng.seed).toBe(COMBAT_SEED);

    const otherSeed = COMBAT_SEED + 1;
    const otherRng = createRng(otherSeed);
    const different: GameState = {
      ...createCombatState(pack),
      rng: rngToState(otherSeed, otherRng),
    };
    const runB = runCombat(pack, COMBAT_SEQUENCE, different);

    expect(runB.rng.seed).toBe(otherSeed);
    expect(runA.rng.seed).toBe(COMBAT_SEED);
    // The seed survives every command in the log, including the kill and noop.
    expect(runB.events.map((event) => event.type)).toEqual(
      COMBAT_EXPECTED_TYPES,
    );
  });
});
