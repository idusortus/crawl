/**
 * `use-item` command + `item-used` event tests (change `content-packs-v1`,
 * phase 5, tasks 5.4/5.5).
 *
 * These exercise the first content-driven command end-to-end:
 *
 *  - a deterministic (`heal`) effect is applied and a fully informative
 *    `item-used` event is emitted with the correct actor/item/effect;
 *  - a seeded-random (`roll-heal`) effect draws from the injected RNG, records
 *    the drawn amount, reproduces for the same seed, and diverges across seeds
 *    (Stage-1 review Finding 2);
 *  - unknown item id, unknown effect kind, and missing actor degrade to a single
 *    `noop` with state equivalent to the input and no throw;
 *  - the produced state round-trips through JSON and behaves identically for
 *    further commands;
 *  - `move` still resolves via `applyCommand` with no pack in scope, and
 *    unrecognized command types still degrade to `noop` after the union widens.
 *
 * The pack under test is a hand-authored `unknown`-shaped literal so the tests
 * go through the real `loadPack` boundary; it is deliberately NOT the shipped
 * fantasy pack (fixtures are throwaway).
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createGrid,
  createRng,
  moved,
  noop,
  rngFromState,
} from '../index';
import { applyCommandWithPack } from '../commands';
import { itemUsed } from '../events';
import { loadPack, type LoadedPack } from '../pack';
import { resolveEffect } from '../effects';
import type { PackItem } from '../schema/pack';
import type { Command, Entity, GameState } from '../types';

/** A minimal valid pack with one deterministic and one random heal item. */
function testPack(): Record<string, unknown> {
  return {
    id: 'test-pack',
    name: 'Test Pack',
    version: 2,
    classes: [
      { id: 'hero', name: 'Hero', glyph: '@', hp: 10, attack: 4 },
      { id: 'sage', name: 'Sage', glyph: 'S', hp: 8, attack: 3 },
    ],
    monsters: [
      { id: 'slime', name: 'Slime', glyph: 's', hp: 2, behavior: 'chase', attack: 1 },
    ],
    items: [
      { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
      {
        id: 'elixir',
        name: 'Elixir',
        glyph: '&',
        effect: { kind: 'roll-heal', min: 2, max: 7 },
      },
    ],
  };
}

/**
 * Builds a `LoadedPack`-shaped stub whose item lookup returns an entry with an
 * effect kind the schema would reject. The real loader cannot produce this (the
 * schema enumerates kinds), so this exercises the engine's *runtime* resilience
 * to unknown effect data — the case D8 says degrades to a noop, not a crash.
 */
function packWithUnknownEffect(): LoadedPack {
  const base = loadPack(testPack());
  const cursed = {
    id: 'cursed',
    name: 'Cursed Idol',
    glyph: '?',
    effect: { kind: 'mystery-blast', amount: 99 },
  } as unknown as PackItem;
  return {
    ...base,
    item(id: string) {
      return id === 'cursed' ? cursed : base.item(id);
    },
  };
}

/** A state with a player at (0,0) carrying `hp`. */
function makeState(hp = 10): GameState {
  const grid = createGrid([
    [true, true],
    [true, true],
  ]);
  const rng = createRng(1234);
  return {
    grid,
    level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 1 } },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [{ id: 'player', kind: 'hero', pos: { x: 0, y: 0 }, hp }],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: { seed: 1234, state: rng.state() },
    events: [],
  };
}

// ---------------------------------------------------------------------------
// 5.1 — effect registry
// ---------------------------------------------------------------------------

describe('effect registry', () => {
  it('applies a deterministic heal without touching the RNG or the input actor', () => {
    const rng = createRng(1);
    const before = rng.state();
    const actor: Entity = { id: 'p', kind: 'hero', pos: { x: 0, y: 0 }, hp: 3 };

    const result = resolveEffect('heal', actor, { kind: 'heal', amount: 4 }, rng);

    expect(result).toBeDefined();
    expect(result?.actorAfter).toEqual({
      id: 'p',
      kind: 'hero',
      pos: { x: 0, y: 0 },
      hp: 7,
    });
    expect(result?.applied).toEqual({ kind: 'heal', amount: 4 });
    // Pure: input actor untouched, and a deterministic effect draws nothing.
    expect(actor.hp).toBe(3);
    expect(rng.state()).toBe(before);
  });

  it('treats a missing hp as 0 and does not invent other entity fields', () => {
    const rng = createRng(1);
    const actor: Entity = { id: 'p', kind: 'hero', pos: { x: 0, y: 0 } };
    const result = resolveEffect('heal', actor, { kind: 'heal', amount: 6 }, rng);
    expect(result?.actorAfter.hp).toBe(6);
    expect(Object.keys(result?.actorAfter ?? {}).sort()).toEqual([
      'hp',
      'id',
      'kind',
      'pos',
    ]);
  });

  it('applies roll-heal within [min,max] and records the drawn amount', () => {
    const rng = createRng(99);
    const actor: Entity = { id: 'p', kind: 'hero', pos: { x: 0, y: 0 }, hp: 0 };
    const result = resolveEffect(
      'roll-heal',
      actor,
      { kind: 'roll-heal', min: 3, max: 3 },
      rng,
    );
    // A collapsed range is deterministic even though it draws.
    expect(result?.applied).toEqual({ kind: 'roll-heal', amount: 3 });
    expect(result?.actorAfter.hp).toBe(3);
  });

  it('returns an explicit miss for an unknown effect kind', () => {
    const rng = createRng(1);
    const actor: Entity = { id: 'p', kind: 'hero', pos: { x: 0, y: 0 } };
    const result = resolveEffect(
      'does-not-exist',
      actor,
      { kind: 'heal', amount: 1 },
      rng,
    );
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5.2/5.4 — deterministic effect + event shape
// ---------------------------------------------------------------------------

describe('use-item — deterministic effect', () => {
  it('applies the effect, emits item-used, and leaves the input state unchanged', () => {
    const pack = loadPack(testPack());
    const before = makeState(4);
    const snapshot = JSON.parse(JSON.stringify(before));

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([itemUsed('player', 'potion', { kind: 'heal', amount: 5 })]);
    expect(state.entities.find((e) => e.id === 'player')?.hp).toBe(9);
    // Input is byte-for-byte unchanged.
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
    // A deterministic effect does not advance the RNG.
    expect(state.rng).toEqual(before.rng);
  });

  it('writes the RNG state back into the returned state', () => {
    const pack = loadPack(testPack());
    const before = makeState(0);
    const rng = rngFromState(before.rng);

    const { state } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rng,
      pack,
    );

    expect(state.rng).toEqual({ seed: before.rng.seed, state: rng.state() });
  });
});

// ---------------------------------------------------------------------------
// 5.4 — seeded-random effect
// ---------------------------------------------------------------------------

describe('use-item — seeded-random effect', () => {
  it('draws within [min,max] and records the drawn amount in the event', () => {
    const pack = loadPack(testPack());
    const before = makeState(1);

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'elixir' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.type).toBe('item-used');
    if (event.type !== 'item-used') return;
    expect(event.actorId).toBe('player');
    expect(event.itemId).toBe('elixir');
    expect(event.effect.kind).toBe('roll-heal');
    expect(event.effect.amount).toBeGreaterThanOrEqual(2);
    expect(event.effect.amount).toBeLessThanOrEqual(7);

    const player = state.entities.find((e) => e.id === 'player');
    expect(player?.hp).toBe(1 + event.effect.amount);
    // The random draw advanced the RNG, and the new state carries that advance.
    expect(state.rng.state).not.toBe(before.rng.state);
    expect(state.rng.seed).toBe(before.rng.seed);
  });
});

// ---------------------------------------------------------------------------
// 5.4 — failure modes degrade to noop, never throw
// ---------------------------------------------------------------------------

describe('use-item — rejection without corruption', () => {
  it('rejects an unknown item id with a single noop and state equivalent to input', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    let result!: ReturnType<typeof applyCommandWithPack>;
    expect(() => {
      result = applyCommandWithPack(
        before,
        { type: 'use-item', itemId: 'not-in-pack' },
        rngFromState(before.rng),
        pack,
      );
    }).not.toThrow();

    expect(result.events).toEqual([noop('unknown-item:not-in-pack')]);
    expect(result.state.grid).toEqual(before.grid);
    expect(result.state.entities).toEqual(before.entities);
    expect(result.state.playerId).toBe(before.playerId);
    expect(result.state.rng).toEqual(before.rng);
    expect(result.state.events).toEqual(before.events.concat(result.events));
  });

  it('rejects an unknown effect kind with a single noop', () => {
    const pack = packWithUnknownEffect();
    const before = makeState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'cursed' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('unknown-effect:mystery-blast')]);
    expect(state.entities).toEqual(before.entities);
    expect(state.rng).toEqual(before.rng);
  });

  it('rejects a use-item with a non-string item id as a single noop without throwing', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    let result!: ReturnType<typeof applyCommandWithPack>;
    expect(() => {
      result = applyCommandWithPack(
        before,
        { type: 'use-item', itemId: 42 } as any,
        rngFromState(before.rng),
        pack,
      );
    }).not.toThrow();

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(noop('malformed-command'));
    expect(result.state.entities).toEqual(before.entities);
    expect(result.state.rng).toEqual(before.rng);
    expect(result.state.events).toEqual(before.events.concat(result.events));
  });

  it('rejects a use-item with a missing item id as a single noop', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item' } as any,
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('malformed-command')]);
    expect(state.entities).toEqual(before.entities);
  });

  it('rejects a use-item with no actor with a single noop', () => {
    const pack = loadPack(testPack());
    const before = makeState();
    // Point playerId at an entity that does not exist in `entities`.
    const noActor: GameState = { ...before, playerId: 'ghost' };

    const { state, events } = applyCommandWithPack(
      noActor,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(noActor.rng),
      pack,
    );

    expect(events).toEqual([noop('no-player-entity')]);
    expect(state.entities).toEqual(noActor.entities);
    expect(state.rng).toEqual(noActor.rng);
  });
});

// ---------------------------------------------------------------------------
// 6.1 — pickup command
// ---------------------------------------------------------------------------

/** A state with a player and an optional floor item on the player's tile. */
function pickupState(): GameState {
  const before = makeState();
  before.entities = [
    ...before.entities,
    { id: 'item-0', kind: 'potion', pos: { x: 0, y: 0 }, item: true },
  ];
  return before;
}

describe('pickup command', () => {
  it('removes the floor item, carries its kind, and emits item-picked-up', () => {
    const pack = loadPack(testPack());
    const before = pickupState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'pickup' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([
      {
        type: 'item-picked-up',
        actorId: 'player',
        itemId: 'potion',
        entityId: 'item-0',
      },
    ]);
    expect(state.entities.some((e) => e.id === 'item-0')).toBe(false);
    expect(state.carriedItemIds).toEqual(['potion']);
    // Input state unchanged.
    expect(before.entities.some((e) => e.id === 'item-0')).toBe(true);
    expect(before.carriedItemIds).toEqual([]);
  });

  it('resolves identically through the content-free entry point', () => {
    const before = pickupState();

    const viaCore = applyCommand(before, { type: 'pickup' }, rngFromState(before.rng));
    const viaPack = applyCommandWithPack(
      before,
      { type: 'pickup' },
      rngFromState(before.rng),
      loadPack(testPack()),
    );

    expect(viaPack.events).toEqual(viaCore.events);
    expect(viaPack.state).toEqual(viaCore.state);
  });

  it('degrades to nothing-to-pick-up on an empty tile', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'pickup' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('nothing-to-pick-up')]);
    expect(state.entities).toEqual(before.entities);
    expect(state.carriedItemIds).toEqual([]);
    expect(state.rng).toEqual(before.rng);
  });

  it('degrades a malformed pickup (extra params) to malformed-command', () => {
    const pack = loadPack(testPack());
    const before = pickupState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'pickup', itemId: 'potion' } as unknown as Command,
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('malformed-command')]);
    expect(state.entities).toEqual(before.entities);
    expect(state.carriedItemIds).toEqual([]);
  });

  it('is deterministic and round-trips through JSON', () => {
    const pack = loadPack(testPack());

    const run = (start: GameState): GameState =>
      applyCommandWithPack(start, { type: 'pickup' }, rngFromState(start.rng), pack)
        .state;

    const a = run(pickupState());
    const b = run(pickupState());
    expect(b).toEqual(a);

    const roundTripped: GameState = JSON.parse(JSON.stringify(a));
    expect(roundTripped).toEqual(a);
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(a));
  });
});

// ---------------------------------------------------------------------------
// 6.2 — use-item consumes one carried instance (carry gates consumption)
// ---------------------------------------------------------------------------

describe('use-item consumes a carried instance', () => {
  it('removes exactly one carried id and applies the effect', () => {
    const pack = loadPack(testPack());
    const before = makeState(3);
    before.carriedItemIds = ['potion'];

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([
      itemUsed('player', 'potion', { kind: 'heal', amount: 5 }),
    ]);
    expect(state.carriedItemIds).toEqual([]);
    expect(state.entities.find((e) => e.id === 'player')?.hp).toBe(8);
  });

  it('consumes only one instance when the same id is carried twice', () => {
    const pack = loadPack(testPack());
    const before = makeState(3);
    before.carriedItemIds = ['potion', 'elixir', 'potion'];

    const { state } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
      pack,
    );

    expect(state.carriedItemIds).toEqual(['elixir', 'potion']);
  });

  it('still resolves a non-carried id but consumes nothing (Stage-2 behavior)', () => {
    const pack = loadPack(testPack());
    const before = makeState(3);
    // No carried items at all.
    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([
      itemUsed('player', 'potion', { kind: 'heal', amount: 5 }),
    ]);
    expect(state.entities.find((e) => e.id === 'player')?.hp).toBe(8);
    expect(state.carriedItemIds).toEqual([]);

    // A carried-but-different id is also untouched.
    const other: GameState = { ...makeState(3), carriedItemIds: ['elixir'] };
    const result = applyCommandWithPack(
      other,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(other.rng),
      pack,
    );
    expect(result.state.carriedItemIds).toEqual(['elixir']);
  });

  it('still rejects unknown ids and no-actor use without consuming', () => {
    const pack = loadPack(testPack());
    const withCarry: GameState = { ...makeState(), carriedItemIds: ['potion'] };

    const unknown = applyCommandWithPack(
      withCarry,
      { type: 'use-item', itemId: 'not-in-pack' },
      rngFromState(withCarry.rng),
      pack,
    );
    expect(unknown.events).toEqual([noop('unknown-item:not-in-pack')]);
    expect(unknown.state.carriedItemIds).toEqual(['potion']);

    const noActor: GameState = {
      ...makeState(),
      playerId: 'ghost',
      carriedItemIds: ['potion'],
    };
    const missing = applyCommandWithPack(
      noActor,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(noActor.rng),
      pack,
    );
    expect(missing.events).toEqual([noop('no-player-entity')]);
    expect(missing.state.carriedItemIds).toEqual(['potion']);
  });
});

// ---------------------------------------------------------------------------
// 5.4 — observability, round-trip, union extensibility
// ---------------------------------------------------------------------------

describe('item-used event is observable and JSON-clean', () => {
  it('appends the event to the log in order', () => {
    const pack = loadPack(testPack());
    const before = makeState();
    before.events.push(moved('player', { x: 0, y: 0 }, { x: 0, y: 0 }));

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
      pack,
    );

    expect(state.events).toHaveLength(2);
    expect(state.events[0].type).toBe('moved');
    expect(state.events[1]).toEqual(events[0]);
    expect(state.events[1].type).toBe('item-used');
  });

  it('round-trips through JSON and behaves identically for further commands', () => {
    const pack = loadPack(testPack());

    const run = (start: GameState): GameState =>
      applyCommandWithPack(
        start,
        { type: 'use-item', itemId: 'elixir' },
        rngFromState(start.rng),
        pack,
      ).state;

    const original = run(makeState());
    const roundTripped: GameState = JSON.parse(JSON.stringify(original));
    expect(roundTripped).toEqual(original);

    // Re-serializing is stable (no functions/Map/Set/undefined in events).
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(original));

    // A further identical command yields identical results from both.
    const nextCommand: Command = { type: 'use-item', itemId: 'potion' };
    const fromOriginal = applyCommandWithPack(
      original,
      nextCommand,
      rngFromState(original.rng),
      pack,
    );
    const fromRoundTripped = applyCommandWithPack(
      roundTripped,
      nextCommand,
      rngFromState(roundTripped.rng),
      pack,
    );
    expect(fromRoundTripped.events).toEqual(fromOriginal.events);
    expect(fromRoundTripped.state).toEqual(fromOriginal.state);
  });

  it('still degrades unrecognized command types to noop after the union widened', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    const { state, events } = applyCommandWithPack(
      before,
      { type: 'teleport', destination: 'moon' } as unknown as Command,
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('unknown-command:teleport')]);
    expect(state.entities).toEqual(before.entities);
    expect(state.rng).toEqual(before.rng);
  });

  it('still rejects malformed commands at the pack-aware boundary', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    const { events } = applyCommandWithPack(
      before,
      null as unknown as Command,
      rngFromState(before.rng),
      pack,
    );

    expect(events).toEqual([noop('malformed-command')]);
  });
});

// ---------------------------------------------------------------------------
// 5.4 — move still works with no pack; use-item requires the pack-aware entry
// ---------------------------------------------------------------------------

describe('move remains pack-free', () => {
  it('resolves a move via applyCommand with no pack in scope', () => {
    const before = makeState();

    const { state, events } = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    );

    expect(events).toEqual([moved('player', { x: 0, y: 0 }, { x: 1, y: 0 })]);
    expect(state.entities.find((e) => e.id === 'player')?.pos).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('resolves a move through the pack-aware entry identically', () => {
    const pack = loadPack(testPack());
    const before = makeState();

    const viaCore = applyCommand(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
    );
    const viaPack = applyCommandWithPack(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
      pack,
    );

    expect(viaPack.events).toEqual(viaCore.events);
    expect(viaPack.state).toEqual(viaCore.state);
  });

  it('does not resolve use-item through the pack-free applyCommand', () => {
    const before = makeState();
    const { events } = applyCommand(
      before,
      { type: 'use-item', itemId: 'potion' },
      rngFromState(before.rng),
    );
    expect(events).toEqual([noop('unknown-command:use-item')]);
  });
});

// ---------------------------------------------------------------------------
// 5.5 — RNG divergence through applyCommandWithPack (Stage-1 Finding 2)
// ---------------------------------------------------------------------------

describe('seeded-random use-item is driven by the injected RNG', () => {
  it('reproduces identical state + events from the same seed', () => {
    const pack = loadPack(testPack());

    const run = () =>
      applyCommandWithPack(
        makeState(0),
        { type: 'use-item', itemId: 'elixir' },
        rngFromState(makeState(0).rng),
        pack,
      );

    const a = run();
    const b = run();

    expect(b.events).toEqual(a.events);
    expect(b.state).toEqual(a.state);
  });

  it('diverges across seeds for at least one bounded seed pair', () => {
    const pack = loadPack(testPack());

    const roll = (seed: number): number => {
      const grid = createGrid([
        [true, true],
        [true, true],
      ]);
      const rng = createRng(seed);
      const state: GameState = {
        grid,
        level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 1 } },
        explored: new Array<boolean>(grid.width * grid.height).fill(false),
        entities: [{ id: 'player', kind: 'hero', pos: { x: 0, y: 0 }, hp: 0 }],
        playerId: 'player',
        status: 'playing',
        carriedItemIds: [],
        rng: { seed, state: rng.state() },
        events: [],
      };
      const { events } = applyCommandWithPack(
        state,
        { type: 'use-item', itemId: 'elixir' },
        rngFromState(state.rng),
        pack,
      );
      const event = events[0];
      if (event.type !== 'item-used') {
        throw new Error(`expected item-used, got ${event.type}`);
      }
      return event.effect.amount;
    };

    // Lock the same-seed reproducibility, then search a bounded seed set for a
    // divergence. Because the range is [2,7] (6 outcomes), a divergence is
    // overwhelmingly likely; the assertion is "at least one pair differs" so it
    // cannot flake on any particular pair.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const rolls = seeds.map((seed) => roll(seed));
    expect(new Set(rolls).size).toBeGreaterThan(1);

    // Same seed, repeated: the roll is stable (no ambient randomness).
    expect(roll(1)).toBe(roll(1));
  });
});
