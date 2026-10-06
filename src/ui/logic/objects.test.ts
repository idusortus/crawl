/**
 * Pure unit tests for the "what is underfoot?" helpers.
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the `src/ui` test glob, mirroring `stairs.test.ts`/
 * `ranged.test.ts`. Packs are loaded through the public `@engine` surface, so
 * the tests exercise the same resolution path the app does.
 */

import { describe, expect, it } from 'vitest';

import { createGrid, createRng, loadPack } from '@engine';
import type { Entity, GameState, LoadedPack, PackItem, Position } from '@engine';

import { fantasyPack } from '../../packs/fantasy';

import {
  floorItemAt,
  GENERIC_ITEM_DETAIL,
  isOnStairs,
  objectInfoAt,
  STAIRS_DETAIL,
  STAIRS_TITLE,
  UNKNOWN_ITEM_TITLE,
} from './objects';

const fantasy: LoadedPack = loadPack(fantasyPack);

/**
 * A minimal valid pack around a single item, so an item `description` (which no
 * repo pack currently authors) can be exercised. `loadPack` enforces the two
 * classes / one monster / one item composition floor, so the fixture supplies
 * those.
 */
function packWithItem(item: PackItem): LoadedPack {
  return loadPack({
    id: 'test',
    name: 'Test',
    version: 2,
    classes: [
      { id: 'fighter', name: 'Fighter', glyph: '@', hp: 14, attack: 4 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 9, attack: 3 },
    ],
    monsters: [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 5, behavior: 'chase', attack: 2 },
    ],
    items: [item],
  });
}

const PLAYER_POS: Position = { x: 1, y: 1 };
const STAIRS_POS: Position = { x: 2, y: 2 };

/** Builds a 3x3 all-passable state with the player at `playerPos`. */
function makeState(entities: Entity[], stairs: Position = STAIRS_POS): GameState {
  const grid = createGrid([
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ]);
  const rng = createRng(7);
  return {
    grid,
    level: { depth: 1, spawn: PLAYER_POS, stairs },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities,
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: { seed: 7, state: rng.state() },
    events: [],
  };
}

/** The player entity at `pos` (defaults to {@link PLAYER_POS}). */
function player(pos: Position = PLAYER_POS): Entity {
  return { id: 'player', kind: 'fighter', pos, hp: 14, attack: 4 };
}

/** A floor item at `pos`, with the engine's `item: true` discriminator. */
function item(kind: string, pos: Position = PLAYER_POS): Entity {
  return { id: `item-${kind}`, kind, pos, item: true };
}

describe('floorItemAt', () => {
  it("returns the feature on the player's tile even when the player sorts first", () => {
    const floorItem = item('healing-potion');
    const state = makeState([player(), floorItem]);
    expect(floorItemAt(state)).toBe(floorItem);
  });

  it('returns undefined on an empty tile', () => {
    const state = makeState([player()]);
    expect(floorItemAt(state)).toBeUndefined();
  });

  it('ignores an item on a different tile', () => {
    const state = makeState([player(), item('healing-potion', { x: 0, y: 0 })]);
    expect(floorItemAt(state)).toBeUndefined();
  });

  it('returns undefined when the player entity is absent', () => {
    const state = makeState([item('healing-potion')]);
    expect(floorItemAt(state)).toBeUndefined();
  });
});

describe('isOnStairs', () => {
  it('is true when the player stands on the stairs tile', () => {
    const state = makeState([player(STAIRS_POS)]);
    expect(isOnStairs(state)).toBe(true);
  });

  it('is false when the player is elsewhere', () => {
    const state = makeState([player()]);
    expect(isOnStairs(state)).toBe(false);
  });

  it('is false when the player entity is absent', () => {
    const state = makeState([]);
    expect(isOnStairs(state)).toBe(false);
  });
});

describe('objectInfoAt', () => {
  it("uses the pack item's name and description when a description is set", () => {
    const pack = packWithItem({
      id: 'runed-blade',
      name: 'Runed Blade',
      glyph: '/',
      effect: { kind: 'heal', amount: 1 },
      description: 'Its edge hums with old magic.',
    });
    const state = makeState([player(), item('runed-blade')]);
    expect(objectInfoAt(state, pack)).toEqual({
      title: 'Runed Blade',
      detail: 'Its edge hums with old magic.',
    });
  });

  it('falls back to a generic detail when the pack item has no description', () => {
    // `healing-potion` declares no `description` (the common case in this repo).
    const state = makeState([player(), item('healing-potion')]);
    expect(objectInfoAt(state, fantasy)).toEqual({
      title: 'Healing Potion',
      detail: GENERIC_ITEM_DETAIL,
    });
  });

  it('describes the stairs when the player is on them with no item', () => {
    const state = makeState([player(STAIRS_POS)]);
    expect(objectInfoAt(state, fantasy)).toEqual({
      title: STAIRS_TITLE,
      detail: STAIRS_DETAIL,
    });
  });

  it('returns undefined on an empty tile', () => {
    const state = makeState([player()]);
    expect(objectInfoAt(state, fantasy)).toBeUndefined();
  });

  it('does not throw for an item id absent from the pack and returns a safe fallback', () => {
    const state = makeState([player(), item('not-in-pack')]);
    expect(() => objectInfoAt(state, fantasy)).not.toThrow();
    expect(objectInfoAt(state, fantasy)).toEqual({
      title: UNKNOWN_ITEM_TITLE,
      detail: GENERIC_ITEM_DETAIL,
    });
  });

  it('prefers an item over the stairs when both share the tile', () => {
    const state = makeState(
      [player(STAIRS_POS), item('healing-potion', STAIRS_POS)],
      STAIRS_POS,
    );
    expect(objectInfoAt(state, fantasy)?.title).toBe('Healing Potion');
  });
});
