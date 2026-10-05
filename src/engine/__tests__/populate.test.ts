/**
 * Population tests (change `core-gameplay-loop`, task 3.2 / design D6/D7).
 *
 * `populateLevel(generated, pack, rng)` is a **pure** function that places
 * monsters and floor items — never stairs, which already live on
 * `generated.level.stairs` — on distinct passable tiles. This suite pins:
 *
 *  - determinism: the same seed + depth + pack reproduces identical entities;
 *  - non-overlap: no two entities share a tile, and none sits on the spawn, the
 *    stairs, or an impassable tile;
 *  - kinds/fields: monster entities copy `behavior`/`attack`/`hp` from the pack;
 *    item entities carry the `item: true` discriminator and their pack `kind`;
 *  - every placed kind is drawn from the supplied pack (no engine content);
 *  - connectivity is unaffected (placements never wall off a passable tile);
 *  - "a mid-run resume reproduces the same monster positions/kinds" — asserted
 *    as re-running `populateLevel` with the same seed yields identical
 *    placements (the save/replay surface lands in Phase 8);
 *  - the population is JSON-clean.
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import { generateLevel, populateLevel } from '../level';
import { createRng } from '../rng';
import { loadPack } from '../pack';
import type { Entity, Grid, Position } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A three-monster / two-item pack with **distinct** kinds, so a determinism
 * test can prove positions *and* kinds are reproduced (and a seeded index into
 * the stable arrays genuinely selects).
 */
function testPack() {
  return loadPack({
    id: 'populate-test-pack',
    name: 'Populate Test Pack',
    version: 2,
    classes: [
      { id: 'hero', name: 'Hero', glyph: '@', hp: 10, attack: 4 },
      { id: 'sage', name: 'Sage', glyph: 'S', hp: 8, attack: 3 },
    ],
    monsters: [
      { id: 'slime', name: 'Slime', glyph: 's', hp: 2, behavior: 'chase', attack: 1 },
      { id: 'bat', name: 'Bat', glyph: 'b', hp: 3, behavior: 'chase', attack: 2 },
      { id: 'ogre', name: 'Ogre', glyph: 'O', hp: 9, behavior: 'idle', attack: 5 },
    ],
    items: [
      { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
      { id: 'scroll', name: 'Scroll', glyph: '?', effect: { kind: 'roll-heal', min: 1, max: 4 } },
    ],
  });
}

const pack = testPack();

/** Generates a depth-1 level and populates it from one shared Rng instance. */
function populate(seed: number, width = 40, height = 30, depth = 1): {
  generated: ReturnType<typeof generateLevel>;
  entities: Entity[];
} {
  const rng = createRng(seed);
  const generated = generateLevel({ rng, width, height, depth });
  const { entities } = populateLevel(generated, pack, rng);
  return { generated, entities };
}

const key = (pos: Position): string => `${pos.x},${pos.y}`;

/** Four-neighbour cardinal offsets. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Flood-fills passable tiles from `start` and returns the reached count. */
function reachableFrom(grid: Grid, start: Position): number {
  const started = grid.passable[start.y * grid.width + start.x] === true;
  if (!started) return 0;
  const seen = new Array<boolean>(grid.width * grid.height).fill(false);
  const stack: Position[] = [start];
  seen[start.y * grid.width + start.x] = true;
  let reached = 0;
  while (stack.length > 0) {
    const current = stack.pop() as Position;
    reached++;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const index = ny * grid.width + nx;
      if (seen[index] || grid.passable[index] !== true) continue;
      seen[index] = true;
      stack.push({ x: nx, y: ny });
    }
  }
  return reached;
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('populateLevel — determinism', () => {
  it('reproduces identical entities from the same seed and depth', () => {
    const first = populate(0x51eed);
    const second = populate(0x51eed);
    // Whole-array structural equality covers id, kind, pos, hp, behavior, attack.
    expect(second.entities).toEqual(first.entities);
  });

  it('reproduces the same monster positions and kinds on a "resume" (same seed)', () => {
    // A mid-run resume replays from saved state; the save surface lands in
    // Phase 8, so this pins the underlying guarantee: re-running population on
    // an identical seed yields identical monster placements and kinds.
    const seeds = [1, 2, 7, 42, 777, 0xbeef];
    for (const seed of seeds) {
      const a = populate(seed);
      const b = populate(seed);
      const monstersOf = (entities: Entity[]) =>
        entities
          .filter((entity) => entity.item !== true)
          .map((entity) => ({ kind: entity.kind, pos: entity.pos }));
      expect(monstersOf(b.entities)).toEqual(monstersOf(a.entities));
    }
  });

  it('produces a non-trivial population (at least one monster and item)', () => {
    const { entities } = populate(0x51eed);
    expect(entities.some((entity) => entity.item !== true)).toBe(true);
    expect(entities.some((entity) => entity.item === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placement validity
// ---------------------------------------------------------------------------

describe('populateLevel — placement validity', () => {
  it('never places two entities on the same tile', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { entities } = populate(seed);
      const tiles = entities.map((entity) => key(entity.pos));
      expect(new Set(tiles).size).toBe(tiles.length);
    }
  });

  it('excludes the spawn tile and the stairs tile', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { generated, entities } = populate(seed);
      const spawn = key(generated.level.spawn);
      const stairs = key(generated.level.stairs);
      for (const entity of entities) {
        expect(key(entity.pos)).not.toBe(spawn);
        expect(key(entity.pos)).not.toBe(stairs);
      }
    }
  });

  it('places every entity on a passable in-bounds tile', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { generated, entities } = populate(seed);
      const { grid } = generated;
      for (const entity of entities) {
        const { x, y } = entity.pos;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(grid.width);
        expect(y).toBeLessThan(grid.height);
        expect(grid.passable[y * grid.width + x]).toBe(true);
      }
    }
  });

  it('preserves connectivity: population never reduces reachable passable tiles', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { generated, entities } = populate(seed);
      const total = generated.grid.passable.filter((p) => p === true).length;
      // Entities never alter terrain, so every passable tile (including stairs)
      // stays reachable from spawn. Assert both counts agree.
      expect(reachableFrom(generated.grid, generated.level.spawn)).toBe(total);
      // Placing entities must not change the passable map at all.
      expect(entities.every((entity) => {
        const { x, y } = entity.pos;
        return generated.grid.passable[y * generated.grid.width + x] === true;
      })).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Entity shape (pack-sourced)
// ---------------------------------------------------------------------------

describe('populateLevel — entity fields', () => {
  it('copies each monster\u2019s resolved behavior/attack/hp from the pack', () => {
    const { entities } = populate(0x51eed);
    const monsters = entities.filter((entity) => entity.item !== true);
    expect(monsters.length).toBeGreaterThan(0);
    for (const monster of monsters) {
      const entry = pack.monster(monster.kind);
      expect(monster.hp).toBe(entry.hp);
      expect(monster.behavior).toBe(entry.behavior);
      expect(monster.attack).toBe(entry.attack);
      // A monster is never a feature occupant.
      expect(monster.item).toBeUndefined();
    }
  });

  it('marks each item entity with the item discriminator and its pack kind', () => {
    const { entities } = populate(0x51eed);
    const items = entities.filter((entity) => entity.item === true);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.item).toBe(true);
      // `pack.item(kind)` throws on an unknown id, so this proves pack sourcing.
      expect(pack.item(item.kind).id).toBe(item.kind);
    }
  });

  it('selects every placed kind from the supplied pack (no engine content)', () => {
    const monsterIds = new Set(pack.pack.monsters.map((m) => m.id));
    const itemIds = new Set(pack.pack.items.map((i) => i.id));
    for (let seed = 1; seed <= 30; seed++) {
      const { entities } = populate(seed);
      for (const entity of entities) {
        const pool = entity.item === true ? itemIds : monsterIds;
        expect(pool.has(entity.kind)).toBe(true);
      }
    }
  });

  it('assigns stable, unique entity ids', () => {
    const { entities } = populate(0x51eed);
    const ids = entities.map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// JSON cleanliness + degenerate levels
// ---------------------------------------------------------------------------

describe('populateLevel — robustness', () => {
  it('returns a JSON-clean entity list that round-trips losslessly', () => {
    const { entities } = populate(0x51eed);
    const roundTripped = JSON.parse(JSON.stringify(entities)) as Entity[];
    expect(roundTripped).toEqual(entities);
  });

  it('never places more entities than there are candidate tiles', () => {
    // A tiny 3x3 level has one floor tile (the spawn), so no candidate tiles
    // exist and population must yield an empty list rather than throwing.
    const rng = createRng(5);
    const generated = generateLevel({ rng, width: 3, height: 3, depth: 1 });
    const { entities } = populateLevel(generated, pack, rng);
    expect(entities).toEqual([]);
  });
});
