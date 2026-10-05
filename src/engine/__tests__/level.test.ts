/**
 * Level generation tests (change `levelgen-and-fov`, tasks 3.1–3.3).
 *
 * Covers the level-generation spec deltas:
 *
 *  - seeded determinism (same seed + depth ⇒ identical grid + spawn + depth)
 *  - seed divergence (different seeds produce different layouts)
 *  - connectivity: a flood-fill from the spawn reaches **every** passable tile,
 *    asserted across many seeds and a couple of sizes (the strongest guarantee,
 *    per design D2 — connectivity is asserted, not merely claimed)
 *  - bounded dimensions + non-passable outer boundary
 *  - spawn on a passable in-bounds tile; depth recorded
 *  - registry selection (known id), unknown id reporting, default when omitted
 *  - JSON-clean output; `width * height === passable.length`
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GENERATOR_ID,
  UnknownGeneratorIdError,
  generateBspLevel,
  generateLevel,
  generatorIds,
  type GeneratedLevel,
} from '../level';
import { createRng } from '../rng';
import type { Grid, Position } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates with the public entry point from a numeric seed. */
function gen(
  seed: number,
  width: number,
  height: number,
  depth: number,
  id?: string,
): GeneratedLevel {
  return generateLevel({ id, rng: createRng(seed), width, height, depth });
}

/** Four-neighbour in-bounds passable offsets (cardinal adjacency only). */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Flood-fills from `start` over passable tiles using cardinal adjacency and
 * returns how many passable tiles were reached, plus the passable total. A
 * level is connected iff `reached === total`.
 */
function floodFill(grid: Grid, start: Position): {
  reached: number;
  total: number;
} {
  const total = grid.passable.filter((p) => p === true).length;
  const started = grid.passable[start.y * grid.width + start.x] === true;
  if (!started) return { reached: 0, total };

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
  return { reached, total };
}

/** Returns true when every tile on the outer ring is non-passable. */
function boundaryIsSolid(grid: Grid): boolean {
  const { width, height, passable } = grid;
  for (let x = 0; x < width; x++) {
    if (passable[0 * width + x] === true) return false;
    if (passable[(height - 1) * width + x] === true) return false;
  }
  for (let y = 0; y < height; y++) {
    if (passable[y * width + 0] === true) return false;
    if (passable[y * width + (width - 1)] === true) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Seeded deterministic generation
// ---------------------------------------------------------------------------

describe('level generation — seeded determinism', () => {
  it('produces an identical grid, spawn, stairs, and depth for the same seed + depth', () => {
    const first = gen(0x51eed, 40, 30, 3);
    const second = gen(0x51eed, 40, 30, 3);
    expect(second.grid).toEqual(first.grid);
    expect(second.level.spawn).toEqual(first.level.spawn);
    expect(second.level.stairs).toEqual(first.level.stairs);
    expect(second.level.depth).toBe(first.level.depth);
    expect(second).toEqual(first);
  });

  it('draws stairs from the injected RNG: the same seed reproduces the same tile', () => {
    for (const seed of [1, 2, 7, 42, 777, 0x51eed]) {
      const first = gen(seed, 40, 30, 1);
      const second = gen(seed, 40, 30, 1);
      expect(second.level.stairs).toEqual(first.level.stairs);
    }
  });

  it('derives determinism from the injected RNG (resuming its state reproduces it)', () => {
    // Two independently-created RNGs with the same seed must yield the same
    // level, proving nothing ambient (time/global random) is consulted.
    const a = generateLevel({ rng: createRng(1234), width: 24, height: 24, depth: 1 });
    const b = generateLevel({ rng: createRng(1234), width: 24, height: 24, depth: 1 });
    expect(a).toEqual(b);
  });

  it('does not mutate the input RNG object identity contract beyond advancing it', () => {
    const rng = createRng(99);
    const before = rng.state();
    generateBspLevel(rng, { width: 20, height: 20, depth: 1 });
    // Generation must consume randomness (a fixed layout would be suspicious)
    // but must do so deterministically through the injected RNG.
    expect(rng.state()).not.toBe(before);
  });

  it('different seeds diverge (across a spread of seed pairs)', () => {
    const base = gen(1, 40, 30, 1);
    let diverged = 0;
    for (const seed of [2, 3, 7, 42, 777, 0xbeef, 0xfeed, 0x1234, 0xabc, 0x99]) {
      const other = gen(seed, 40, 30, 1);
      if (JSON.stringify(other.grid) !== JSON.stringify(base.grid)) diverged++;
    }
    // Layouts are not required to match; require the seed genuinely drives the
    // layout by demanding the overwhelming majority differ.
    expect(diverged).toBeGreaterThanOrEqual(9);
  });
});

// ---------------------------------------------------------------------------
// Connected and bounded
// ---------------------------------------------------------------------------

describe('level generation — connected and bounded', () => {
  it('reports explicit dimensions and every tile falls within them', () => {
    const { grid } = gen(7, 41, 27, 2);
    expect(grid.width).toBe(41);
    expect(grid.height).toBe(27);
    expect(grid.passable).toHaveLength(41 * 27);
    expect(grid.width * grid.height).toBe(grid.passable.length);
  });

  it('leaves the outer boundary non-passable', () => {
    for (const seed of [1, 2, 3, 7, 42, 777]) {
      const { grid } = gen(seed, 40, 30, 1);
      expect(boundaryIsSolid(grid)).toBe(true);
    }
  });

  it('every passable tile is reachable from spawn — across 60 seeds and two sizes', () => {
    const sizes: readonly (readonly [number, number])[] = [
      [40, 30],
      [64, 48],
    ];
    let levelsChecked = 0;
    let tilesChecked = 0;

    for (const [width, height] of sizes) {
      for (let seed = 1; seed <= 60; seed++) {
        const { grid, level } = gen(seed, width, height, 1);
        const { reached, total } = floodFill(grid, level.spawn);
        expect(reached).toBe(total);
        expect(total).toBeGreaterThan(0);
        levelsChecked++;
        tilesChecked += total;
      }
    }

    // Guards against the loop silently doing nothing.
    expect(levelsChecked).toBe(120);
    expect(tilesChecked).toBeGreaterThan(120);
  });

  it('connectivity holds at a larger depth and odd dimensions too', () => {
    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88, 99, 111]) {
      const { grid, level } = gen(seed, 53, 37, 9);
      expect(floodFill(grid, level.spawn).reached).toBe(
        floodFill(grid, level.spawn).total,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Spawn + depth
// ---------------------------------------------------------------------------

describe('level generation — spawn and depth', () => {
  it('places spawn on a passable in-bounds tile', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { grid, level } = gen(seed, 40, 30, 4);
      const { x, y } = level.spawn;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(grid.width);
      expect(y).toBeLessThan(grid.height);
      expect(grid.passable[y * grid.width + x]).toBe(true);
    }
  });

  it('records the requested depth', () => {
    expect(gen(5, 30, 30, 1).level.depth).toBe(1);
    expect(gen(5, 30, 30, 12).level.depth).toBe(12);
  });

  it('places stairs on a passable in-bounds tile distinct from spawn', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { grid, level } = gen(seed, 40, 30, 4);
      const { x, y } = level.stairs;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(grid.width);
      expect(y).toBeLessThan(grid.height);
      expect(grid.passable[y * grid.width + x]).toBe(true);
      // A normal-size level has many floor tiles, so stairs never equal spawn.
      expect(level.stairs).not.toEqual(level.spawn);
    }
  });
});

// ---------------------------------------------------------------------------
// JSON cleanliness
// ---------------------------------------------------------------------------

describe('level generation — JSON cleanliness', () => {
  it('produces a JSON-clean value that round-trips without loss', () => {
    const generated = gen(0x51eed, 40, 30, 3);
    const roundTripped: GeneratedLevel = JSON.parse(JSON.stringify(generated));
    expect(roundTripped).toEqual(generated);
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(generated));
  });

  it('contains no non-serializable values (all passable entries are booleans)', () => {
    const { grid } = gen(9, 24, 20, 1);
    expect(grid.passable.every((p) => typeof p === 'boolean')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generator registry (by named id)
// ---------------------------------------------------------------------------

describe('level generation — generator registry', () => {
  it('selects a known generator by id', () => {
    const generated = gen(3, 32, 24, 1, 'bsp');
    expect(generated.grid.passable).toHaveLength(32 * 24);
    expect(boundaryIsSolid(generated.grid)).toBe(true);
  });

  it('reports an unknown generator id explicitly (no silent fallback)', () => {
    expect(() => gen(3, 32, 24, 1, 'cellular')).toThrow(UnknownGeneratorIdError);
    try {
      gen(3, 32, 24, 1, 'cellular');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownGeneratorIdError);
      const typed = error as UnknownGeneratorIdError;
      expect(typed.id).toBe('cellular');
      expect(typed.knownIds).toContain(DEFAULT_GENERATOR_ID);
      expect(typed.message).toContain('cellular');
    }
  });

  it('uses the default generator when none is named', () => {
    const withDefault = generateLevel({
      rng: createRng(555),
      width: 32,
      height: 24,
      depth: 1,
    });
    const explicitBsp = gen(555, 32, 24, 1, DEFAULT_GENERATOR_ID);
    // Same seed, same options, explicit default id ⇒ identical level.
    expect(withDefault).toEqual(explicitBsp);
  });

  it('exposes the registered ids including the default, without the registry object', () => {
    const ids = generatorIds();
    expect(ids).toContain(DEFAULT_GENERATOR_ID);
    expect(ids).toContain('bsp');
    // The list is a fresh array; mutating it must not affect the registry.
    ids.push('bogus');
    expect(generatorIds()).not.toContain('bogus');
  });

  it('the raw BSP generator is directly callable and consistent with the registry entry', () => {
    const direct = generateBspLevel(createRng(321), {
      width: 30,
      height: 22,
      depth: 2,
    });
    const viaRegistry = gen(321, 30, 22, 2, 'bsp');
    expect(direct).toEqual(viaRegistry);
  });
});

// ---------------------------------------------------------------------------
// Degenerate sizes (documented behaviour: bounded, never throws)
// ---------------------------------------------------------------------------

describe('level generation — degenerate sizes stay bounded', () => {
  it('returns a bounded (all-wall) grid for a 1x1 request without throwing', () => {
    const { grid, level } = gen(1, 1, 1, 1);
    expect(grid.width).toBe(1);
    expect(grid.height).toBe(1);
    expect(grid.passable).toEqual([false]);
    // No passable tile exists, so spawn falls back to (0, 0).
    expect(level.spawn).toEqual({ x: 0, y: 0 });
  });

  it('carves a single playable tile for a 3x3 request', () => {
    const { grid, level } = gen(1, 3, 3, 1);
    expect(grid.passable).toHaveLength(9);
    expect(boundaryIsSolid(grid)).toBe(true);
    expect(grid.passable[level.spawn.y * grid.width + level.spawn.x]).toBe(true);
  });

  it('keeps a solid outer boundary on the previously-leaking thin interiors', () => {
    // These sizes have one interior axis exactly MIN_ROOM (3) while the other
    // is >= 3, which used to route into the BSP branch and carve a room onto the
    // outer boundary (design-regression guard for `engine/level-generation`).
    const sizes: readonly (readonly [number, number])[] = [
      [5, 5],
      [5, 6],
      [6, 5],
      [7, 5],
      [10, 5],
    ];
    for (const [width, height] of sizes) {
      for (const seed of [1, 2, 3, 7, 42, 777]) {
        const { grid, level } = gen(seed, width, height, 1);
        expect(boundaryIsSolid(grid)).toBe(true);
        expect(grid.passable[level.spawn.y * grid.width + level.spawn.x]).toBe(
          true,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Small-size boundary + connectivity sweep
// ---------------------------------------------------------------------------

describe('level generation — small-size boundary and connectivity sweep', () => {
  it('keeps a solid boundary and a passable spawn across every 3..14 size', () => {
    let levelsChecked = 0;
    for (let width = 3; width <= 14; width++) {
      for (let height = 3; height <= 14; height++) {
        for (const seed of [1, 2, 3, 7, 42]) {
          const { grid, level } = gen(seed, width, height, 1);
          expect(boundaryIsSolid(grid)).toBe(true);

          const floorCount = grid.passable.filter((p) => p === true).length;
          if (floorCount > 0) {
            const { x, y } = level.spawn;
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(grid.width);
            expect(y).toBeLessThan(grid.height);
            expect(grid.passable[y * grid.width + x]).toBe(true);
          }
          levelsChecked++;
        }
      }
    }
    // 12 * 12 * 5 — guards against the loops silently doing nothing.
    expect(levelsChecked).toBe(720);
  });

  it('is connected whenever it has a floor tile (5x5 and other small sizes)', () => {
    const sizes: readonly (readonly [number, number])[] = [
      [5, 5],
      [5, 6],
      [6, 5],
      [7, 7],
      [9, 5],
      [12, 12],
    ];
    let nonTrivialLevels = 0;
    for (const [width, height] of sizes) {
      for (let seed = 1; seed <= 20; seed++) {
        const { grid, level } = gen(seed, width, height, 1);
        const { reached, total } = floodFill(grid, level.spawn);
        if (total > 1) {
          expect(reached).toBe(total);
          nonTrivialLevels++;
        } else {
          // Trivially connected (0 or 1 floor tiles); spawn carries the single
          // tile when one exists.
          expect(reached).toBe(total);
        }
      }
    }
    // At least the >=7 sizes exercise the multi-room connected path.
    expect(nonTrivialLevels).toBeGreaterThan(0);
  });

  it('exposes the all-wall case for a 1-wide request at any height', () => {
    const { grid, level } = gen(3, 1, 10, 1);
    expect(grid.width).toBe(1);
    expect(grid.passable).toEqual(new Array<boolean>(10).fill(false));
    expect(level.spawn).toEqual({ x: 0, y: 0 });
  });
});
