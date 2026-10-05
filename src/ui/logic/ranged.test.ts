/**
 * Pure unit tests for the ranged-weapon helpers (change
 * `mobile-client-playability`, tasks 6.1/6.3/6.4; design D3/D7).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the `src/ui` test glob. The pack is loaded through the public
 * `@engine` surface, mirroring the app.
 */

import { describe, expect, it } from 'vitest';

import {
  applyCommandWithPack,
  computeFov,
  createGrid,
  createRng,
  DEFAULT_SIGHT_RADIUS,
  loadPack,
  rngFromState,
} from '@engine';
import type { Entity, GameState, LoadedPack } from '@engine';

import { fantasyPack } from '../../packs/fantasy';

import { hasRangedWeapon, isRangedWeapon, rangedTargetAt } from './ranged';

const pack: LoadedPack = loadPack(fantasyPack);

describe('isRangedWeapon', () => {
  it('is true for a pack item declaring a ranged descriptor', () => {
    expect(isRangedWeapon(pack, 'shortbow')).toBe(true);
  });

  it('is false for a consumable (effect-only) item', () => {
    expect(isRangedWeapon(pack, 'healing-potion')).toBe(false);
  });

  it('is false for an id absent from the pack and never throws', () => {
    expect(() => isRangedWeapon(pack, 'not-in-pack')).not.toThrow();
    expect(isRangedWeapon(pack, 'not-in-pack')).toBe(false);
  });

  it('is false when the pack is not loaded', () => {
    expect(isRangedWeapon(undefined, 'shortbow')).toBe(false);
  });
});

describe('hasRangedWeapon', () => {
  it('is true when any carried id is a ranged weapon', () => {
    expect(hasRangedWeapon(pack, ['healing-potion', 'shortbow'])).toBe(true);
  });

  it('is false when no carried id is a ranged weapon', () => {
    expect(hasRangedWeapon(pack, ['healing-potion', 'bandage'])).toBe(false);
  });

  it('is false for an empty carry list or an unloaded pack', () => {
    expect(hasRangedWeapon(pack, [])).toBe(false);
    expect(hasRangedWeapon(undefined, ['shortbow'])).toBe(false);
  });
});

describe('rangedTargetAt', () => {
  // A 3x3 all-passable grid: index = y * 3 + x.
  const grid = createGrid([
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ]);

  const player: Entity = {
    id: 'player',
    kind: 'fighter',
    pos: { x: 0, y: 0 },
    hp: 14,
    attack: 4,
  };
  const monster: Entity = {
    id: 'monster-1',
    kind: 'goblin',
    pos: { x: 1, y: 0 },
    hp: 5,
  };
  const item: Entity = {
    id: 'item-1',
    kind: 'healing-potion',
    pos: { x: 2, y: 0 },
    item: true,
  };
  const entities = [player, monster, item];
  const allVisible = new Array<boolean>(9).fill(true);

  it('returns a visible living monster that is not the player', () => {
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: 1, y: 0 }),
    ).toBe(monster);
  });

  it("returns undefined for the player's own tile", () => {
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: 0, y: 0 }),
    ).toBeUndefined();
  });

  it('returns undefined for a non-living (item) occupant', () => {
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: 2, y: 0 }),
    ).toBeUndefined();
  });

  it('returns undefined for an empty tile', () => {
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: 1, y: 1 }),
    ).toBeUndefined();
  });

  it('returns undefined when the tile is not currently visible', () => {
    const hidden = new Array<boolean>(9).fill(false);
    expect(
      rangedTargetAt(grid, entities, hidden, player.id, { x: 1, y: 0 }),
    ).toBeUndefined();
  });

  it('returns undefined for an out-of-bounds tile', () => {
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: -1, y: 0 }),
    ).toBeUndefined();
    expect(
      rangedTargetAt(grid, entities, allVisible, player.id, { x: 3, y: 0 }),
    ).toBeUndefined();
  });
});

describe('target-mode tap wiring (client decision → engine command)', () => {
  // End-to-end: the exact command `MapView` builds for a target-mode tap (a bare
  // `{ type: 'ranged-attack', target }`) is accepted by the engine and resolves
  // as a ranged hit. No renderer is involved, so this pins the wiring the RN
  // component cannot be render-tested for.
  it('selects a visible monster and the dispatched command resolves as a ranged hit', () => {
    const grid = createGrid([
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
    ]);
    const rng = createRng(42);
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: { x: 1, y: 1 }, stairs: { x: 3, y: 3 } },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: { x: 1, y: 1 }, hp: 14, attack: 4 },
        {
          id: 'goblin',
          kind: 'goblin',
          pos: { x: 2, y: 1 },
          hp: 5,
          behavior: 'chase',
          attack: 2,
        },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: ['shortbow'],
      rng: { seed: 42, state: rng.state() },
      events: [],
    };

    const visible = computeFov(grid, { x: 1, y: 1 }, DEFAULT_SIGHT_RADIUS);
    const tile = { x: 2, y: 1 };
    // The UI's hit-test picks the monster...
    const target = rangedTargetAt(
      grid,
      state.entities,
      visible,
      state.playerId,
      tile,
    );
    expect(target?.id).toBe('goblin');

    // ...and the exact command MapView dispatches is engine-valid.
    const { events } = applyCommandWithPack(
      state,
      { type: 'ranged-attack', target: tile },
      rngFromState(state.rng),
      pack,
    );
    const hit = events[0];
    expect(hit?.type).toBe('attacked');
    if (hit?.type !== 'attacked') return;
    expect(hit.kind).toBe('ranged');
    expect(hit.targetId).toBe('goblin');
  });
});
