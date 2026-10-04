/**
 * `descend` command + level-change wiring tests (change `levelgen-and-fov`,
 * phase 4, tasks 4.1–4.4 / design D5–D7).
 *
 * These exercise the first world-progression command end-to-end:
 *
 *  - `descend` generates a level at `depth + 1`, places the player at its spawn,
 *    and emits an observable `level-changed { depth }` event;
 *  - it is deterministic: the same descend sequence from the same seed yields
 *    byte-identical states (generation draws only from the injected RNG);
 *  - it does not mutate its input state;
 *  - the explored mask is reset per level (no tiles leak from the previous
 *    level), and is immediately seeded from the new spawn's FOV;
 *  - the new level is immediately playable (a subsequent `move` succeeds);
 *  - the post-descend state round-trips through JSON and behaves identically
 *    for further commands;
 *  - it resolves through **both** `applyCommand` and `applyCommandWithPack`;
 *  - unknown commands still degrade to `noop` after the union gains `descend`.
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createGrid,
  createRng,
  noop,
  rngFromState,
} from '../index';
import { applyCommandWithPack } from '../commands';
import { levelChanged } from '../events';
import { loadPack } from '../pack';
import { computeFov, DEFAULT_SIGHT_RADIUS } from '../fov';
import type { Command, GameState, Position } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const at = (x: number, y: number): Position => ({ x, y });

/** A minimal valid pack; `descend` needs no content, so any loaded pack works. */
function testPack() {
  return loadPack({
    id: 'descend-test-pack',
    name: 'Descend Test Pack',
    version: 1,
    classes: [
      { id: 'hero', name: 'Hero', glyph: '@', hp: 10 },
      { id: 'sage', name: 'Sage', glyph: 'S', hp: 8 },
    ],
    monsters: [{ id: 'slime', name: 'Slime', glyph: 's', hp: 2 }],
    items: [
      {
        id: 'potion',
        name: 'Potion',
        glyph: '!',
        effect: { kind: 'heal', amount: 5 },
      },
    ],
  });
}

/**
 * A small hand-built level-1 fixture: a 3x3 room with a wall column at x=1.
 *
 *   y=0:  . # .
 *   y=1:  . # .
 *   y=2:  . # .
 *
 * Player at (0, 0) and spawn (0, 0). Depth is pinned to 1 so a descend reaches
 * depth 2.
 */
function makeState(seed = 0x51eed): GameState {
  const grid = createGrid([
    [true, false, true],
    [true, false, true],
    [true, false, true],
  ]);
  const rng = createRng(seed);
  return {
    grid,
    level: { depth: 1, spawn: at(0, 0) },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [{ id: 'player', kind: 'player', pos: at(0, 0) }],
    playerId: 'player',
    rng: { seed, state: rng.state() },
    events: [],
  };
}

/** The tile the player currently occupies. */
function playerPos(state: GameState): Position | undefined {
  return state.entities.find((entity) => entity.id === state.playerId)?.pos;
}

// ---------------------------------------------------------------------------
// 4.1/4.2 — descend generates a deeper level, player at spawn, event emitted
// ---------------------------------------------------------------------------

describe('descend generates a deeper level', () => {
  it('advances depth by one, replaces grid/level, and places the player at the spawn', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);

    const { state, events } = applyCommand(before, { type: 'descend' }, rng);

    // New depth is exactly one deeper.
    expect(state.level.depth).toBe(2);

    // A genuinely new, larger level replaced the fixture.
    expect(state.grid).not.toBe(before.grid);
    expect(state.grid.width).toBe(40);
    expect(state.grid.height).toBe(30);

    // The player stands on the new spawn, which is passable and in bounds.
    expect(playerPos(state)).toEqual(state.level.spawn);
    const spawnIndex =
      state.level.spawn.y * state.grid.width + state.level.spawn.x;
    expect(state.grid.passable[spawnIndex]).toBe(true);

    // The observable event reports the new depth.
    expect(events).toEqual([levelChanged(2)]);
    expect(events[0]).toEqual({ type: 'level-changed', depth: 2 });
  });

  it('emits exactly one event and appends it to the log', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);
    const { state, events } = applyCommand(before, { type: 'descend' }, rng);
    expect(events).toHaveLength(1);
    expect(state.events).toEqual(before.events.concat(events));
  });

  it('can descend repeatedly, increasing depth each time', () => {
    let state = makeState();
    for (let expectedDepth = 2; expectedDepth <= 5; expectedDepth++) {
      const rng = rngFromState(state.rng);
      state = applyCommand(state, { type: 'descend' }, rng).state;
      expect(state.level.depth).toBe(expectedDepth);
    }
    expect(state.events.map((event) => event.type)).toEqual([
      'level-changed',
      'level-changed',
      'level-changed',
      'level-changed',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4.2/4.4 — determinism, purity, RNG threading
// ---------------------------------------------------------------------------

describe('descend determinism and purity', () => {
  it('produces identical states for the same seed + descend sequence', () => {
    function run(): GameState {
      let state = makeState(0xd00d);
      for (let i = 0; i < 3; i++) {
        state = applyCommand(
          state,
          { type: 'descend' },
          rngFromState(state.rng),
        ).state;
      }
      return state;
    }

    const a = run();
    const b = run();

    // Full structural equality: grid, level, explored, entities, rng, events.
    expect(b).toEqual(a);
    expect(b.grid).toEqual(a.grid);
    expect(b.explored).toEqual(a.explored);
    expect(b.rng).toEqual(a.rng);
  });

  it('advances the RNG state (generation consumes randomness) and threads it back', () => {
    const before = makeState(777);
    const rng = createRng(before.rng.seed);
    const { state } = applyCommand(before, { type: 'descend' }, rng);

    // Generation must consume randomness, so the committed rng state differs
    // from the pre-descend state...
    expect(state.rng.seed).toBe(777);
    expect(state.rng.state).not.toBe(before.rng.state);
    // ...and is exactly what the injected RNG reports after generation.
    expect(state.rng.state).toBe(rng.state());
  });

  it('does not mutate the input state (byte-for-byte JSON snapshot unchanged)', () => {
    const before = makeState();
    const snapshot = JSON.parse(JSON.stringify(before));
    const rng = createRng(before.rng.seed);

    applyCommand(before, { type: 'descend' }, rng);

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
    expect(before.grid.width).toBe(3);
    expect(before.level.depth).toBe(1);
    expect(playerPos(before)).toEqual(at(0, 0));
    expect(before.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4.3/4.4 — explored reset per level + seeded from the new spawn
// ---------------------------------------------------------------------------

describe('descend resets the per-level explored mask', () => {
  it('does not carry tiles from the previous level into the new one', () => {
    const before = makeState();
    // Mark the entire previous level explored, as if walked over.
    before.explored = before.explored.map(() => true);

    const rng = createRng(before.rng.seed);
    const { state } = applyCommand(before, { type: 'descend' }, rng);

    // The new explored mask is aligned to the *new* grid, not the old one.
    expect(state.explored).toHaveLength(state.grid.width * state.grid.height);
    expect(state.explored).not.toHaveLength(before.grid.width * before.grid.height);

    // The old level's tiles are gone: mask length equals new grid size, and the
    // number of explored tiles is bounded by the spawn's FOV (not "everything").
    const visibleAtSpawn = computeFov(
      state.grid,
      state.level.spawn,
      DEFAULT_SIGHT_RADIUS,
    );
    const spawnFovCount = visibleAtSpawn.filter(Boolean).length;
    const exploredCount = state.explored.filter(Boolean).length;
    expect(exploredCount).toBe(spawnFovCount);
    expect(exploredCount).toBeLessThan(state.explored.length);
  });

  it("a level-1 floor tile not visible from the new spawn is NOT explored in level 2", () => {
    const before = makeState();
    // Suppose (2, 2) was explored on level 1.
    before.explored[2 * before.grid.width + 2] = true;

    const rng = createRng(before.rng.seed);
    const { state } = applyCommand(before, { type: 'descend' }, rng);

    // The old coordinate indexes into the *new* grid now; assert that tile is
    // not explored by coincidence (the mask was rebuilt, not copied).
    const reusedIndex = 2 * state.grid.width + 2;
    const visibleAtSpawn = computeFov(
      state.grid,
      state.level.spawn,
      DEFAULT_SIGHT_RADIUS,
    );
    if (!visibleAtSpawn[reusedIndex]) {
      expect(state.explored[reusedIndex]).toBe(false);
    }

    // Strongest form: every explored tile is visible from the spawn (nothing
    // survived from the old level).
    state.explored.forEach((isExplored, index) => {
      if (isExplored) expect(visibleAtSpawn[index]).toBe(true);
    });
  });

  it('seeds the new explored mask from the spawn vicinity', () => {
    const before = makeState();
    const rng = createRng(before.rng.seed);
    const { state } = applyCommand(before, { type: 'descend' }, rng);

    const spawnIndex =
      state.level.spawn.y * state.grid.width + state.level.spawn.x;
    expect(state.explored[spawnIndex]).toBe(true);

    const visibleAtSpawn = computeFov(
      state.grid,
      state.level.spawn,
      DEFAULT_SIGHT_RADIUS,
    );
    expect(state.explored).toEqual(visibleAtSpawn);
  });
});

// ---------------------------------------------------------------------------
// 4.4 — new level immediately playable
// ---------------------------------------------------------------------------

describe('the new level is immediately playable', () => {
  it('a move after descending succeeds or is legitimately blocked, never a noop', () => {
    const before = makeState();
    let state = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    ).state;

    // Try all four directions from the spawn; at least one must be a real move
    // (a spawn is on a floor tile with at least one passable neighbour in a BSP
    // level), and none may be a `noop`.
    const directions = ['north', 'south', 'east', 'west'] as const;
    let movedCount = 0;
    for (const direction of directions) {
      const { events } = applyCommand(
        state,
        { type: 'move', direction },
        rngFromState(state.rng),
      );
      expect(events[0].type === 'moved' || events[0].type === 'blocked').toBe(
        true,
      );
      if (events[0].type === 'moved') movedCount++;
    }
    expect(movedCount).toBeGreaterThan(0);
  });

  it('moving on the new level reveals more tiles than the spawn alone', () => {
    const before = makeState();
    let state = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    ).state;

    const exploredAfterDescend = state.explored.slice();

    // Find a direction that moves, then assert explored grew.
    for (const direction of ['north', 'south', 'east', 'west'] as const) {
      const result = applyCommand(
        state,
        { type: 'move', direction },
        rngFromState(state.rng),
      );
      if (result.events[0].type === 'moved') {
        state = result.state;
        break;
      }
    }

    // Explored is a superset of the pre-move mask (monotonic) and strictly
    // larger, since the new position adds unseen tiles.
    exploredAfterDescend.forEach((wasExplored, index) => {
      if (wasExplored) expect(state.explored[index]).toBe(true);
    });
    expect(state.explored.filter(Boolean).length).toBeGreaterThan(
      exploredAfterDescend.filter(Boolean).length,
    );
  });
});

// ---------------------------------------------------------------------------
// 4.4 — JSON round-trip of a post-descend state
// ---------------------------------------------------------------------------

describe('JSON round-trip of a post-descend state', () => {
  it('round-trips without loss and behaves identically for further commands', () => {
    const before = makeState();
    const afterDescend = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    ).state;

    const roundTripped: GameState = JSON.parse(
      JSON.stringify(afterDescend),
    );
    expect(roundTripped).toEqual(afterDescend);
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(afterDescend));

    // Further identical commands produce identical results from both states.
    const commands: Command[] = [
      { type: 'move', direction: 'south' },
      { type: 'descend' },
      { type: 'move', direction: 'east' },
    ];

    function run(start: GameState): GameState {
      let state = start;
      for (const command of commands) {
        state = applyCommand(state, command, rngFromState(state.rng)).state;
      }
      return state;
    }

    const fromOriginal = run(afterDescend);
    const fromRoundTripped = run(roundTripped);
    expect(fromRoundTripped).toEqual(fromOriginal);
    expect(fromRoundTripped.events).toEqual(fromOriginal.events);
  });
});

// ---------------------------------------------------------------------------
// 4.2/4.4 — descend resolves through BOTH entry points
// ---------------------------------------------------------------------------

describe('descend through both command entry points', () => {
  it('resolves via applyCommand', () => {
    const before = makeState();
    const { state, events } = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    );
    expect(state.level.depth).toBe(2);
    expect(events).toEqual([levelChanged(2)]);
  });

  it('resolves via applyCommandWithPack identically (pack is irrelevant to descend)', () => {
    const before = makeState();
    const pack = testPack();

    const viaPlain = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    );
    const viaPack = applyCommandWithPack(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
      pack,
    );

    expect(viaPack.events).toEqual(viaPlain.events);
    expect(viaPack.state).toEqual(viaPlain.state);
    expect(viaPack.events).toEqual([levelChanged(2)]);
  });
});

// ---------------------------------------------------------------------------
// 4.4 — unknown commands still degrade to noop after the union widens
// ---------------------------------------------------------------------------

describe('unknown commands still degrade to noop', () => {
  it('an unrecognized type after descend still yields a single noop', () => {
    const before = makeState();
    const { state, events } = applyCommand(
      before,
      { type: 'ascend' } as unknown as Command,
      rngFromState(before.rng),
    );
    expect(events).toEqual([noop('unknown-command:ascend')]);
    // State equivalent to the input, log appended.
    expect(state.grid).toEqual(before.grid);
    expect(state.level).toEqual(before.level);
    expect(state.explored).toEqual(before.explored);
    expect(state.rng).toEqual(before.rng);
  });

  it('a malformed command still yields a single noop and does not throw', () => {
    const before = makeState();
    let result!: ReturnType<typeof applyCommand>;
    expect(() => {
      result = applyCommand(before, null as unknown as Command, rngFromState(before.rng));
    }).not.toThrow();
    expect(result.events).toEqual([noop('malformed-command')]);
  });

  it('a noop after descend leaves grid/level/explored unchanged', () => {
    const before = makeState();
    const descended = applyCommand(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
    ).state;

    const { state } = applyCommand(
      descended,
      { type: 'teleport' } as unknown as Command,
      rngFromState(descended.rng),
    );

    expect(state.grid).toEqual(descended.grid);
    expect(state.level).toEqual(descended.level);
    expect(state.explored).toEqual(descended.explored);
  });
});

// ---------------------------------------------------------------------------
// 4.3 — explored-on-move with a hand-built grid (focused, non-random)
// ---------------------------------------------------------------------------

describe('movement updates explored (focused fixture)', () => {
  /**
   * A 5x5 open room; player at (2, 2). A successful move must OR the new
   * position's FOV into `explored`; a blocked move must leave it byte-identical.
   */
  function openState(): GameState {
    const grid = createGrid(
      Array.from({ length: 5 }, () => new Array<boolean>(5).fill(true)),
    );
    const rng = createRng(42);
    return {
      grid,
      level: { depth: 1, spawn: at(2, 2) },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [{ id: 'player', kind: 'player', pos: at(2, 2) }],
      playerId: 'player',
      rng: { seed: 42, state: rng.state() },
      events: [],
    };
  }

  it('a successful move ORs the new position FOV into explored', () => {
    const before = openState();
    const { state } = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    );

    expect(playerPos(state)).toEqual(at(3, 2));
    // Explored equals the FOV from the new tile OR'd into the old mask (which
    // was all-false here).
    const visibleAtNew = computeFov(
      state.grid,
      at(3, 2),
      DEFAULT_SIGHT_RADIUS,
    );
    expect(state.explored).toEqual(visibleAtNew);
    expect(state.explored.filter(Boolean).length).toBeGreaterThan(0);
  });

  it('explored is monotonic and persists across a subsequent blocked move', () => {
    const before = openState();
    const afterMove = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    ).state;
    const exploredAfterMove = afterMove.explored.slice();

    // Move into the wall-less edge? (2,2)->(3,2)->(4,2) then east again would be
    // out of bounds at x=5. Instead step to the outer boundary and press east.
    const atEdge = applyCommand(
      afterMove,
      { type: 'move', direction: 'east' },
      rngFromState(afterMove.rng),
    ).state;
    expect(playerPos(atEdge)).toEqual(at(4, 2));

    const exploredAtEdge = atEdge.explored.slice();
    const blockedResult = applyCommand(
      atEdge,
      { type: 'move', direction: 'east' },
      rngFromState(atEdge.rng),
    );

    expect(blockedResult.events[0].type).toBe('blocked');
    // Blocked move: explored is byte-for-byte unchanged.
    expect(blockedResult.state.explored).toEqual(exploredAtEdge);
    // And it is a superset of the earlier snapshot (monotonic growth).
    exploredAfterMove.forEach((wasExplored, index) => {
      if (wasExplored) expect(blockedResult.state.explored[index]).toBe(true);
    });
    // The blocked move did not corrupt grid/level either.
    expect(blockedResult.state.grid).toEqual(atEdge.grid);
    expect(blockedResult.state.level).toEqual(atEdge.level);
  });

  it('a fully blocked move leaves grid/level/explored unchanged', () => {
    const before = openState();
    // Player at the top-left corner; north and west are out of bounds.
    const corner: GameState = {
      ...before,
      entities: [{ id: 'player', kind: 'player', pos: at(0, 0) }],
    };
    const { state, events } = applyCommand(
      corner,
      { type: 'move', direction: 'north' },
      rngFromState(corner.rng),
    );
    expect(events[0].type).toBe('blocked');
    expect(state.grid).toEqual(corner.grid);
    expect(state.level).toEqual(corner.level);
    expect(state.explored).toEqual(corner.explored);
  });
});
