/**
 * Frozen seeded-placement golden test (change `review-fixes-augment`, tasks
 * 3.1/3.2 / design D3; engine/level-generation specs "The seeded spawn and
 * stairs are a pinned value" and "The seeded initial placements are a pinned
 * value").
 *
 * `findStairs` draws a seeded index into a row-major candidate list and
 * `populateLevel` draws counts then per-placement tile indices; the resulting
 * values are a **pinned contract**. These tests freeze the semantic output —
 * spawn/stairs positions and monster/item `{kind, pos}` placements — for a
 * small set of fixed `(seed, width, height, depth)` tuples, so a draw-order
 * change fails CI instead of silently shifting every seed while the rest of the
 * suite stays green.
 *
 * Deliberately **not** a snapshot: only positions and kinds are asserted, never
 * the full grid bytes or RNG internals, so an unrelated refactor does not make
 * the contract brittle (design D3).
 *
 * The expected values were **probed against the current code and confirmed**,
 * not assumed: for `(seed 1, 40×30, depth 1)` the design's list
 * (`skeleton@(31,15)`, `goblin@(3,22)`, `giant-rat@(36,6)`,
 * `healing-potion@(26,17)`) matched exactly (task 3.2).
 */

import { describe, expect, it } from 'vitest';

import {
  createRng,
  generateLevel,
  loadPack,
  populateLevel,
} from '@engine/index';
import type { Entity, Position } from '@engine/index';

import { fantasyPack } from '../../packs/fantasy';

/** A frozen tuple to pin: seed + dimensions + depth. */
interface Tuple {
  seed: number;
  width: number;
  height: number;
  depth: number;
}

/** The frozen level-generation contract for one tuple. */
interface LevelGolden {
  spawn: Position;
  stairs: Position;
}

/** The frozen population placement contract for one tuple. */
interface PlacementGolden {
  monsters: { kind: string; pos: Position }[];
  items: { kind: string; pos: Position }[];
}

/**
 * The frozen tuples. Seed 1 @40×30 d1 is the design's worked example; the
 * others vary seed, and one varies both size and depth, so the contract has
 * teeth without being over-frozen.
 */
const TUPLES: Tuple[] = [
  { seed: 1, width: 40, height: 30, depth: 1 },
  { seed: 2, width: 40, height: 30, depth: 1 },
  { seed: 7, width: 40, height: 30, depth: 2 },
  { seed: 3, width: 24, height: 18, depth: 1 },
];

/** `{spawn, stairs}` frozen from the current deterministic generator output. */
const LEVEL_GOLDEN: Record<string, LevelGolden> = {
  '1:40x30:d1': { spawn: { x: 2, y: 2 }, stairs: { x: 35, y: 19 } },
  '2:40x30:d1': { spawn: { x: 2, y: 2 }, stairs: { x: 8, y: 8 } },
  '7:40x30:d2': { spawn: { x: 2, y: 2 }, stairs: { x: 25, y: 5 } },
  '3:24x18:d1': { spawn: { x: 3, y: 2 }, stairs: { x: 12, y: 9 } },
};

/**
 * Population frozen from the current deterministic `populateLevel` output with
 * the fantasy pack. Monsters and items are kept separate (kind + position) in
 * placement order.
 */
const PLACEMENT_GOLDEN: Record<string, PlacementGolden> = {
  '1:40x30:d1': {
    monsters: [
      { kind: 'skeleton', pos: { x: 31, y: 15 } },
      { kind: 'goblin', pos: { x: 3, y: 22 } },
      { kind: 'giant-rat', pos: { x: 36, y: 6 } },
    ],
    items: [{ kind: 'healing-potion', pos: { x: 26, y: 17 } }],
  },
  '2:40x30:d1': {
    monsters: [
      { kind: 'goblin', pos: { x: 23, y: 27 } },
      { kind: 'goblin', pos: { x: 8, y: 24 } },
      { kind: 'skeleton', pos: { x: 22, y: 9 } },
      { kind: 'giant-rat', pos: { x: 14, y: 26 } },
    ],
    items: [{ kind: 'sacred-relic', pos: { x: 32, y: 11 } }],
  },
  '7:40x30:d2': {
    monsters: [
      { kind: 'giant-rat', pos: { x: 25, y: 20 } },
      { kind: 'skeleton', pos: { x: 3, y: 11 } },
      { kind: 'skeleton', pos: { x: 8, y: 20 } },
    ],
    items: [
      { kind: 'wild-herb', pos: { x: 37, y: 14 } },
      { kind: 'elixir', pos: { x: 8, y: 12 } },
    ],
  },
  '3:24x18:d1': {
    monsters: [
      { kind: 'giant-rat', pos: { x: 2, y: 9 } },
      { kind: 'skeleton', pos: { x: 21, y: 9 } },
      { kind: 'giant-rat', pos: { x: 13, y: 14 } },
      { kind: 'skeleton', pos: { x: 2, y: 8 } },
    ],
    items: [
      { kind: 'elixir', pos: { x: 3, y: 13 } },
      { kind: 'sacred-relic', pos: { x: 18, y: 15 } },
    ],
  },
};

/** Builds the lookup key for a tuple. */
function key(tuple: Tuple): string {
  return `${tuple.seed}:${tuple.width}x${tuple.height}:d${tuple.depth}`;
}

/** Generates a level for a tuple from a fresh RNG at its seed. */
function generate(tuple: Tuple) {
  const rng = createRng(tuple.seed);
  return generateLevel({
    rng,
    width: tuple.width,
    height: tuple.height,
    depth: tuple.depth,
  });
}

describe('seeded level generation — frozen spawn/stairs contract', () => {
  for (const tuple of TUPLES) {
    it(`pins spawn and stairs for ${key(tuple)}`, () => {
      const generated = generate(tuple);
      const expected = LEVEL_GOLDEN[key(tuple)];

      expect(generated.level.spawn).toEqual(expected.spawn);
      expect(generated.level.stairs).toEqual(expected.stairs);
      // Depth is carried through unchanged; spawn is always passable.
      expect(generated.level.depth).toBe(tuple.depth);
      expect(
        generated.grid.passable[
          generated.level.spawn.y * generated.grid.width +
            generated.level.spawn.x
        ],
      ).toBe(true);
    });
  }

  it('is reproducible: the same tuple generates identical metadata', () => {
    for (const tuple of TUPLES) {
      const first = generate(tuple);
      const second = generate(tuple);
      expect(first.level.spawn).toEqual(second.level.spawn);
      expect(first.level.stairs).toEqual(second.level.stairs);
    }
  });
});

describe('seeded population — frozen placement contract', () => {
  const pack = loadPack(fantasyPack);

  for (const tuple of TUPLES) {
    it(`pins monster and item placements for ${key(tuple)}`, () => {
      // Generation and population share one RNG instance, exactly as the
      // engine's one-shared-`Rng` contract requires (design D6/D7).
      const rng = createRng(tuple.seed);
      const generated = generateLevel({
        rng,
        width: tuple.width,
        height: tuple.height,
        depth: tuple.depth,
      });
      const population = populateLevel(generated, pack, rng);
      const expected = PLACEMENT_GOLDEN[key(tuple)];

      const monsters = population.entities.filter(
        (entity: Entity) => entity.item !== true,
      );
      const items = population.entities.filter(
        (entity: Entity) => entity.item === true,
      );

      expect(
        monsters.map((entity) => ({ kind: entity.kind, pos: entity.pos })),
      ).toEqual(expected.monsters);
      expect(
        items.map((entity) => ({ kind: entity.kind, pos: entity.pos })),
      ).toEqual(expected.items);
    });
  }
});
