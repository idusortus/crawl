/**
 * Save/load tests (change `core-gameplay-loop`, task 8.1 / design D8).
 *
 * These pin the whole save/replay contract:
 *
 *  - **Round-trip**: `serializeSave` -> `deserializeSave` returns the full
 *    current state, the full command log, and the applied-count cursor, plain
 *    and lossless.
 *  - **Resume matches uninterrupted**: a run saved mid-flight and resumed by
 *    replaying only `commands.slice(appliedCount)` reproduces the never-saved
 *    run's state and event stream exactly, including seeded monster draws and a
 *    `use-item` success (so the pack-aware path is exercised).
 *  - **Mid-run state + remaining log**: `appliedCount < commands.length` replays
 *    only the remainder.
 *  - **Fully-applied save replays nothing**: `appliedCount === commands.length`.
 *  - **Resume determinism**: the same save resumed twice is identical.
 *  - **Unknown `SAVE_VERSION` rejection**: loud, typed, naming the version.
 *  - **Pack-free inspection**: noops `use-item` without a pack, and the save is
 *    well-formed with content referenced by id only.
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 * Everything imported from `@engine/save` / `@engine/index` is the public
 * surface (the save module is re-exported from the barrel by task 8.2).
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommandWithPack,
  createGrid,
  createRng,
  itemUsed,
  loadPack,
  rngFromState,
  rngToState,
  } from '@engine/index';
import type {
  Command,
  Entity,
  GameState,
  LoadedPack,
} from '@engine/index';
import {
  deserializeSave,
  PackRequiredForReplayError,
  replayCommands,
  resumeRun,
  SAVE_VERSION,
  serializeSave,
  UnknownSaveVersionError,
} from '@engine/save';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A pack with a chase monster and a deterministic heal item. */
function testPack(): LoadedPack {
  return loadPack({
    id: 'save-test-pack',
    name: 'Save Test Pack',
    version: 2,
    classes: [
      { id: 'hero', name: 'Hero', glyph: '@', hp: 20, attack: 4 },
      { id: 'sage', name: 'Sage', glyph: 'S', hp: 8, attack: 3 },
    ],
    monsters: [
      { id: 'slime', name: 'Slime', glyph: 's', hp: 6, behavior: 'chase', attack: 2 },
    ],
    items: [
      { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
    ],
  });
}

const SEED = 0x5a7e;

/**
 * An 8x8 open room. The player starts at (0, 0); the stairs are at (7, 7); a
 * single monster is placed at (3, 3) so the AI advances on successful turns
 * (drawing seeded damage once it reaches the player).
 */
function makeState(pack: LoadedPack): GameState {
  const rng = createRng(SEED);
  const grid = createGrid(Array.from({ length: 8 }, () => Array(8).fill(true)));
  const player = pack.class('hero');
  return {
    grid,
    level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 7, y: 7 } },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [
      {
        id: 'player',
        kind: 'hero',
        pos: { x: 0, y: 0 },
        hp: player.hp,
        attack: player.attack,
      },
      {
        id: 'slime',
        kind: 'slime',
        pos: { x: 3, y: 3 },
        hp: 6,
        behavior: 'chase',
        attack: 2,
      },
      { id: 'item-0', kind: 'potion', pos: { x: 1, y: 0 }, item: true },
    ],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: rngToState(SEED, rng),
    events: [],
  };
}

/** The command sequence the run applies; a mix of moves, a pickup, a use. */
const COMMANDS: Command[] = [
  { type: 'move', direction: 'east' }, // 0: onto potion (feature) at (1,0)
  { type: 'pickup' }, // 1: pick up potion
  { type: 'use-item', itemId: 'potion' }, // 2: heal (carried)
  { type: 'move', direction: 'north' }, // 3
  { type: 'move', direction: 'east' }, // 4
  { type: 'attack', direction: 'east' }, // 5
  { type: 'move', direction: 'east' }, // 6
];

/**
 * Applies a command sequence from a starting state through the pack-aware entry
 * point, resuming the RNG from each running state, exactly as a live client does.
 */
function replay(start: GameState, commands: Command[], pack: LoadedPack): GameState {
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

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('serializeSave / deserializeSave — round-trip', () => {
  it('carries the full state, full command log, and appliedCount as plain JSON', () => {
    const pack = testPack();
    const state = makeState(pack);

    const json = serializeSave(state, COMMANDS, 3);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'version',
      'state',
      'commands',
      'appliedCount',
    ]);
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.appliedCount).toBe(3);

    const env = deserializeSave(json);
    expect(env.version).toBe(SAVE_VERSION);
    expect(env.appliedCount).toBe(3);
    expect(env.commands).toEqual(COMMANDS);
    // The full state round-trips without loss.
    expect(env.state).toEqual(state);
    expect(env.state.grid).toEqual(state.grid);
    expect(env.state.entities).toEqual(state.entities);
    expect(env.state.rng).toEqual(state.rng);
  });

  it('never mutates the live state or the command log', () => {
    const pack = testPack();
    const state = makeState(pack);
    const before = JSON.parse(JSON.stringify(state)) as GameState;

    serializeSave(state, COMMANDS, COMMANDS.length);

    expect(state).toEqual(before);
    expect(COMMANDS).toHaveLength(7);
    // The live run still accepts commands identically after a save.
    const after = applyCommandWithPack(
      state,
      { type: 'move', direction: 'east' },
      rngFromState(state.rng),
      pack,
    );
    expect(after.events[0].type).toBe('moved');
  });
});

// ---------------------------------------------------------------------------
// Resume matches an uninterrupted run
// ---------------------------------------------------------------------------

describe('resumeRun — replay the remainder from the saved state', () => {
  it('matches an uninterrupted run exactly (pack-aware, mid-run split)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const reference = replay(initial, COMMANDS, pack);

    // Save after the first three commands; the remaining four are unapplied.
    const SPLIT = 3;
    const midRun = replay(initial, COMMANDS.slice(0, SPLIT), pack);
    const save = serializeSave(midRun, COMMANDS, SPLIT);

    const resumed = resumeRun(save, pack);

    // Same world state, same full event stream, same RNG.
    expect(resumed).toEqual(reference);
    expect(resumed.events).toEqual(reference.events);
    expect(resumed.rng).toEqual(reference.rng);
    expect(resumed.entities).toEqual(reference.entities);
    expect(resumed.carriedItemIds).toEqual(reference.carriedItemIds);

    // The run really did exercise a pickup, a use, and combat/AI.
    expect(reference.events.some((e) => e.type === 'item-picked-up')).toBe(true);
    expect(reference.events.some((e) => e.type === 'item-used')).toBe(true);
    expect(reference.events.some((e) => e.type === 'attacked')).toBe(true);
  });

  it('appliedCount < commands.length replays only the remainder', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);

    // Replaying the remainder from the mid-run state equals the full run.
    const replayed = replayCommands(midRun, COMMANDS, 2, pack);
    const reference = replay(initial, COMMANDS, pack);
    expect(replayed).toEqual(reference);
  });

  it('a fully-applied save replays nothing', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const settled = replay(initial, COMMANDS, pack);

    const save = serializeSave(settled, COMMANDS, COMMANDS.length);
    const resumed = resumeRun(save, pack);

    // Nothing re-applied: identical state and event stream.
    expect(resumed).toEqual(settled);
    expect(resumed.events).toEqual(settled.events);
    expect(resumed.events).toHaveLength(settled.events.length);
  });

  it('is deterministic: the same save resumed twice is identical', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 4), pack);
    const save = serializeSave(midRun, COMMANDS, 4);

    const first = resumeRun(save, pack);
    const second = resumeRun(save, pack);
    expect(first).toEqual(second);
    expect(first.events).toEqual(second.events);
  });

  it('a resumed run accepts further commands under the normal contract', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 3), pack);
    const resumed = resumeRun(serializeSave(midRun, COMMANDS, 3), pack);

    const next = applyCommandWithPack(
      resumed,
      { type: 'move', direction: 'east' },
      rngFromState(resumed.rng),
      pack,
    );
    expect(next.state.rng).not.toEqual(resumed.rng);
    expect(next.events.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Version rejection
// ---------------------------------------------------------------------------

describe('deserializeSave — version check', () => {
  it('rejects an unknown SAVE_VERSION loudly, naming the version', () => {
    const pack = testPack();
    const state = makeState(pack);
    const parsed = JSON.parse(serializeSave(state, COMMANDS, 0)) as {
      version: number;
    };
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

  it('also rejects an old version (not just a future one)', () => {
    expect(() =>
      deserializeSave(
        JSON.stringify({
          version: SAVE_VERSION - 1,
          state: {},
          commands: [],
          appliedCount: 0,
        }),
      ),
    ).toThrow(UnknownSaveVersionError);
  });

  it('rejects a malformed envelope shape', () => {
    expect(() => deserializeSave('[]')).toThrow(TypeError);
    expect(() =>
      deserializeSave(
        JSON.stringify({
          version: SAVE_VERSION,
          state: {},
          commands: 'nope',
          appliedCount: 0,
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      deserializeSave(
        JSON.stringify({
          version: SAVE_VERSION,
          state: {},
          commands: [],
          appliedCount: 3,
        }),
      ),
    ).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Pack-free inspection
// ---------------------------------------------------------------------------

describe('save inspection without the pack', () => {
  it('is well-formed and references content by id only', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);
    const json = serializeSave(midRun, COMMANDS, 2);

    // Deserializable with no pack in scope, and every entity kind is an id.
    const env = deserializeSave(json);
    expect(env.state.entities.every((e: Entity) => typeof e.kind === 'string')).toBe(
      true,
    );
    // No pack entry objects are embedded in the saved state.
    const asText = JSON.stringify(env.state);
    expect(asText).not.toContain('"effect"');
    expect(asText).not.toContain('"classes"');
  });

  it('deserializes a content-dependent remainder without a pack (inspection stays pack-free)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);
    const json = serializeSave(midRun, COMMANDS, 2);

    // `deserializeSave` never needs a pack: the envelope parses and still names
    // the unapplied `use-item` by id, with no embedded content objects.
    const env = deserializeSave(json);
    expect(env.appliedCount).toBe(2);
    expect(env.commands[2]).toEqual({ type: 'use-item', itemId: 'potion' });
  });
});

// ---------------------------------------------------------------------------
// Pack-free replay guard (change `review-fixes-augment`, task 2.1/2.3)
// ---------------------------------------------------------------------------

describe('replayCommands — pack-free content-dependent remainder fails loudly', () => {
  it('throws PackRequiredForReplayError naming "use-item" (no pack)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);

    // The remainder (from appliedCount = 2) contains `use-item` at index 2.
    let caught: unknown;
    try {
      replayCommands(midRun, COMMANDS, 2); // no pack
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PackRequiredForReplayError);
    const err = caught as PackRequiredForReplayError;
    expect(err.commandTypes).toEqual(['use-item']);
    expect(err.message).toContain('use-item');
    expect(err.message).toContain('pack');
  });

  it('throws PackRequiredForReplayError naming "descend" (no pack)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const descendLog: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'descend' },
    ];
    const midRun = replay(initial, descendLog.slice(0, 1), pack);

    expect(() => replayCommands(midRun, descendLog, 1)).toThrow(
      PackRequiredForReplayError,
    );
    let caught: unknown;
    try {
      replayCommands(midRun, descendLog, 1);
    } catch (error) {
      caught = error;
    }
    expect((caught as PackRequiredForReplayError).commandTypes).toEqual([
      'descend',
    ]);
  });

  it('throws PackRequiredForReplayError naming "ranged-attack" (no pack)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    // The remainder (from appliedCount = 1) contains only `ranged-attack`, the
    // newly content-dependent command (change `mobile-client-playability`).
    const log: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'ranged-attack', target: { x: 3, y: 3 } },
    ];
    const midRun = replay(initial, log.slice(0, 1), pack);

    let caught: unknown;
    try {
      replayCommands(midRun, log, 1); // no pack
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PackRequiredForReplayError);
    const err = caught as PackRequiredForReplayError;
    expect(err.commandTypes).toEqual(['ranged-attack']);
    expect(err.message).toContain('ranged-attack');
  });

  it('names both offending types deduplicated in first-seen order', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const log: Command[] = [
      { type: 'descend' },
      { type: 'use-item', itemId: 'potion' },
      { type: 'use-item', itemId: 'potion' },
      { type: 'descend' },
    ];

    let caught: unknown;
    try {
      replayCommands(initial, log, 0); // no pack
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PackRequiredForReplayError);
    expect((caught as PackRequiredForReplayError).commandTypes).toEqual([
      'descend',
      'use-item',
    ]);
  });

  it('replays an all-move/attack/pickup remainder pack-free without error', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const contentFree: Command[] = [
      { type: 'move', direction: 'east' }, // onto the potion feature
      { type: 'pickup' }, // pick it up
      { type: 'attack', direction: 'east' }, // nothing there -> noop
    ];

    // No content-dependent command in the remainder: no error, state produced.
    const packFree = replayCommands(initial, contentFree, 0);
    expect(packFree).toBeDefined();
    expect(packFree.events.some((e) => e.type === 'item-picked-up')).toBe(true);
    expect(packFree.carriedItemIds).toEqual(['potion']);
  });

  it('a fully-applied save replays nothing without error (empty remainder)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    // appliedCount === commands.length; the saved state already reflects the
    // whole log (which *does* contain `use-item`/`descend`-free content).
    const settled = replay(initial, COMMANDS, pack);
    const json = serializeSave(settled, COMMANDS, COMMANDS.length);

    const resumed = resumeRun(json); // no pack, empty remainder
    expect(resumed).toEqual(settled);
    // The whole log contains `use-item` but it is already applied, so no throw.
    expect(COMMANDS.some((c) => c.type === 'use-item')).toBe(true);
  });

  it('the same use-item/descend remainder replays fine WITH a pack', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);
    const json = serializeSave(midRun, COMMANDS, 2);

    // Pack supplied: the guard does not fire and the run resumes as before.
    const resumed = resumeRun(json, pack);
    const reference = replay(initial, COMMANDS, pack);
    expect(resumed).toEqual(reference);
    expect(resumed.carriedItemIds).toEqual([]);

    const used = resumed.events.find((e) => e.type === 'item-used');
    expect(used).toBeDefined();
    if (used !== undefined && used.type === 'item-used') {
      expect(used).toEqual(itemUsed('player', 'potion', { kind: 'heal', amount: 5 }));
    }
  });

  it('resumeRun inherits the guard (no pack, content-dependent remainder)', () => {
    const pack = testPack();
    const initial = makeState(pack);
    const midRun = replay(initial, COMMANDS.slice(0, 2), pack);
    const json = serializeSave(midRun, COMMANDS, 2);

    expect(() => resumeRun(json)).toThrow(PackRequiredForReplayError);
  });
});
