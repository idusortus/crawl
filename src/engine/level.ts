/**
 * Level generation — BSP rooms-and-corridors + a named generator registry.
 *
 * Change `levelgen-and-fov` (tasks 3.1/3.2, design D2/D3): a **pure, seeded**
 * `(seed, depth) -> Level`-style function. The layout is produced by recursive
 * binary space partition: the interior region is split until leaves are
 * room-sized, a room is placed in each leaf, and sibling subtrees are joined by
 * carving an L-shaped floor corridor (a horizontal run then a vertical run)
 * between their representative room centres over the shared passable array.
 *
 * All randomness (split positions, room sizes) is drawn from the injected `Rng`
 * — never `Math.random`/`Date` — so the same seed and depth reproduce an
 * identical level (design D2). Corridors are carved over the *same* passable
 * array with no later partition step walling them over, so connectivity holds by
 * construction and is **asserted** by the flood-fill test (design D2/risks).
 *
 * The registry is keyed by named id and defaults to `'bsp'`; an unknown id is
 * reported explicitly (typed `UnknownGeneratorIdError`), never silently
 * substituted (design D3). Adding a generator is one registry entry — no state
 * or command-loop change.
 *
 * This module is framework-free and deterministic: no react/react-native/expo,
 * no `Math.random`/`Date` (enforced by ESLint on `src/engine/**`).
 *
 * ## Return shape (documented decision)
 *
 * `Level` (from `types.ts`) is *metadata only* — `{ depth, spawn }` — while the
 * terrain is the `Grid`. A generator therefore cannot return a bare `Level`
 * without losing the terrain. This module returns:
 *
 *     GeneratedLevel = { level: Level; grid: Grid }
 *
 * so Phase 4's `descend` can do `state.grid = generated.grid` and
 * `state.level = generated.level` directly, with no re-derivation. `level.spawn`
 * is always a passable in-bounds tile.
 */

import { randInt, type Rng } from './rng';
import type { Grid, Level, Position } from './types';

/**
 * The terrain + metadata produced by a generator.
 *
 * Kept as two sibling fields (rather than nesting `Grid` inside `Level`) because
 * `GameState` stores them separately (`state.grid` + `state.level`, design D1);
 * returning them already split means Phase 4 assembly is a direct field copy.
 */
export interface GeneratedLevel {
  /** Progression metadata: the requested depth and the chosen spawn tile. */
  level: Level;
  /** The bounded terrain; `passable` is flat row-major, length `width*height`. */
  grid: Grid;
}

/** Options a generator receives. Width/height are the full grid dimensions. */
export interface LevelGeneratorOptions {
  width: number;
  height: number;
  depth: number;
}

/**
 * A generator: a pure function of the injected RNG and the requested options.
 * Same `(rng state, options)` ⇒ identical `GeneratedLevel`.
 */
export type LevelGenerator = (
  rng: Rng,
  options: LevelGeneratorOptions,
) => GeneratedLevel;

/** A rectangular region of the grid, inclusive of both corners. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A BSP node: either an internal split or a leaf holding a placed room. */
interface BspNode {
  /** The region this node covers (a partition boundary, not necessarily floor). */
  region: Rect;
  left: BspNode | null;
  right: BspNode | null;
  /** Room rectangle for a leaf; `null` for an internal node. */
  room: Rect | null;
}

const MIN_ROOM = 3;
/**
 * Regions larger than `MAX_ROOM + 2` on either axis are split again, so leaves
 * stay room-sized and rooms do not swallow the whole map.
 */
const MAX_ROOM = 9;
/**
 * Minimum side length of a leaf region. A room needs `MIN_ROOM` plus at least
 * two tiles of padding (one per side) so it never touches its region border and
 * corridors always fit around it. Splits are bounded so every child is at least
 * this large.
 */
const MIN_LEAF = MIN_ROOM + 2;
/** A region can be split only if both children can each be at least `MIN_LEAF`. */
const MIN_LEAF_FOR_SPLIT = 2 * MIN_LEAF;

// ---------------------------------------------------------------------------
// BSP construction
// ---------------------------------------------------------------------------

/**
 * Recursively partitions `region` into leaves, placing a room in each leaf.
 *
 * The region is split along its longer axis at a random position (drawn from
 * `rng`) such that both children stay large enough to hold a room. A region too
 * small to split becomes a leaf and gets a room whose size is drawn from `rng`.
 * Recursion always terminates: every split strictly shrinks the region.
 */
function buildTree(rng: Rng, region: Rect): BspNode {
  const canSplitHorizontally = region.height >= MIN_LEAF_FOR_SPLIT;
  const canSplitVertically = region.width >= MIN_LEAF_FOR_SPLIT;

  if (!canSplitHorizontally && !canSplitVertically) {
    return {
      region,
      left: null,
      right: null,
      room: placeRoom(rng, region),
    };
  }

  // Prefer splitting the longer axis; if that axis cannot be split safely, fall
  // back to the other. (`canSplit*` already guarantees a safe split exists.)
  let splitHorizontally: boolean;
  if (canSplitHorizontally && canSplitVertically) {
    splitHorizontally = region.height >= region.width;
  } else {
    splitHorizontally = canSplitHorizontally;
  }

  if (splitHorizontally) {
    const min = MIN_LEAF;
    const max = region.height - MIN_LEAF;
    const split = randInt(rng, min, max);
    const top: Rect = {
      x: region.x,
      y: region.y,
      width: region.width,
      height: split,
    };
    const bottom: Rect = {
      x: region.x,
      y: region.y + split,
      width: region.width,
      height: region.height - split,
    };
    return {
      region,
      left: buildTree(rng, top),
      right: buildTree(rng, bottom),
      room: null,
    };
  }

  const min = MIN_LEAF;
  const max = region.width - MIN_LEAF;
  const split = randInt(rng, min, max);
  const left: Rect = {
    x: region.x,
    y: region.y,
    width: split,
    height: region.height,
  };
  const right: Rect = {
    x: region.x + split,
    y: region.y,
    width: region.width - split,
    height: region.height,
  };
  return {
    region,
    left: buildTree(rng, left),
    right: buildTree(rng, right),
    room: null,
  };
}

/**
 * Places a room inside a leaf region, centered on a randomly drawn position so
 * it never touches the region border (leaving room for corridors between rooms).
 * The room is at least `MIN_ROOM` and at most `min(MAX_ROOM, region - 2)` per
 * axis.
 *
 * The gate in `generateBspLevel` only carves rooms into regions at least
 * `MIN_LEAF` on both axes, so `region - 2 >= MIN_ROOM` always holds and the
 * drawn ranges below are never degenerate. The explicit clamp is a defensive
 * guard for any future caller: a region too small to hold a bordered `MIN_ROOM`
 * room — i.e. one that would compute a max size below `MIN_ROOM` — is clamped
 * to keep the room strictly inside the region with at least one tile of padding
 * per side, rather than letting `randInt` collapse to `MIN_ROOM` and overrun the
 * border.
 */
function placeRoom(rng: Rng, region: Rect): Rect {
  const maxWidth = Math.min(MAX_ROOM, region.width - 2);
  const maxHeight = Math.min(MAX_ROOM, region.height - 2);
  const width = randInt(rng, MIN_ROOM, maxWidth);
  const height = randInt(rng, MIN_ROOM, maxHeight);

  // Defensive border safeguard: `region - 2` is the largest room that leaves one
  // tile of padding per side. If that is smaller than `MIN_ROOM`, a normal draw
  // could exceed `region - 2`, so clamp the room back inside the region.
  const safeWidth = Math.max(1, Math.min(width, region.width - 2));
  const safeHeight = Math.max(1, Math.min(height, region.height - 2));

  // The available slack per axis is `region - room`; keep at least 1 tile of
  // padding so rooms never share an edge with the partition boundary.
  const slackX = region.width - safeWidth;
  const slackY = region.height - safeHeight;
  const x = region.x + randInt(rng, 1, slackX - 1);
  const y = region.y + randInt(rng, 1, slackY - 1);

  return { x, y, width: safeWidth, height: safeHeight };
}

/** The integer centre of a rectangle. */
function centerOf(rect: Rect): Position {
  return {
    x: rect.x + Math.floor(rect.width / 2),
    y: rect.y + Math.floor(rect.height / 2),
  };
}

/**
 * The representative room of a subtree: the first room found in a pre-order
 * walk. Every leaf has a room, so an internal node always has one in its left
 * subtree; `null` is returned only for a defensive empty subtree.
 */
function representativeRoom(node: BspNode): Rect | null {
  if (node.room !== null) return node.room;
  if (node.left !== null) {
    const left = representativeRoom(node.left);
    if (left !== null) return left;
  }
  if (node.right !== null) return representativeRoom(node.right);
  return null;
}

/** Carves a single tile floor at `(x, y)` into the flat passable array. */
function carve(grid: Grid, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  grid.passable[y * grid.width + x] = true;
}

/** Fills a room rectangle solid with floor. */
function carveRect(grid: Grid, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      carve(grid, x, y);
    }
  }
}

/**
 * Carves an L-shaped corridor between two centres: a horizontal run at the
 * source's y, then a vertical run to the target's y. Both runs mutate the same
 * passable array as the rooms, so the connection cannot be walled over later.
 */
function carveCorridor(grid: Grid, from: Position, to: Position): void {
  const xStep = from.x <= to.x ? 1 : -1;
  for (let x = from.x; x !== to.x + xStep; x += xStep) {
    carve(grid, x, from.y);
  }
  const yStep = from.y <= to.y ? 1 : -1;
  for (let y = from.y; y !== to.y + yStep; y += yStep) {
    carve(grid, to.x, y);
  }
}

/**
 * Walks the tree post-order, carving every room and connecting each internal
 * node's two subtrees by an L-shaped corridor between their representative room
 * centres. Because both subtrees are already fully connected internally, one
 * corridor per internal node makes the whole level connected.
 */
function carveTree(grid: Grid, node: BspNode): void {
  if (node.room !== null) {
    carveRect(grid, node.room);
    return;
  }

  const left = node.left;
  const right = node.right;
  if (left === null || right === null) return;

  carveTree(grid, left);
  carveTree(grid, right);

  const leftRoom = representativeRoom(left);
  const rightRoom = representativeRoom(right);
  if (leftRoom === null || rightRoom === null) return;

  carveCorridor(grid, centerOf(leftRoom), centerOf(rightRoom));
}

/**
 * Picks the spawn: the first floor tile in row-major order. Generated levels
 * always contain at least one room, so a passable tile always exists. A
 * deterministic choice (rather than a random draw) keeps the spawn reproducible
 * from the same grid alone.
 */
function findSpawn(grid: Grid): Position {
  for (let index = 0; index < grid.passable.length; index++) {
    if (grid.passable[index] === true) {
      return { x: index % grid.width, y: Math.floor(index / grid.width) };
    }
  }
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// The BSP generator
// ---------------------------------------------------------------------------

/**
 * The BSP rooms-and-corridors generator (design D2). Pure function of the
 * injected RNG and the requested dimensions/depth.
 *
 * The interior `[1, width-1) x [1, height-1)` is partitioned; the outer ring of
 * the grid is never carved, so it stays non-passable and bounds the level. The
 * returned `grid.passable` has length `width * height` and the returned
 * `level.spawn` is on a passable in-bounds tile.
 */
export function generateBspLevel(
  rng: Rng,
  options: LevelGeneratorOptions,
): GeneratedLevel {
  const { width, height, depth } = options;

  // A level needs a bordered interior that can hold at least one room. For
  // degenerate sizes we still return a well-formed (if tiny) bounded grid
  // rather than throwing: a single interior tile when there is room for it.
  const interior: Rect = {
    x: 1,
    y: 1,
    width: Math.max(0, width - 2),
    height: Math.max(0, height - 2),
  };

  const grid: Grid = {
    width,
    height,
    passable: new Array<boolean>(width * height).fill(false),
  };

  // Rooms are only carved when the interior can host at least one leaf region
  // large enough for `placeRoom` to respect its border padding: both axes must
  // be at least `MIN_LEAF`, so `interior - 2 >= MIN_ROOM` always holds. A single
  // interior axis smaller than that (e.g. a 5x5 grid's 3-wide interior) is not
  // safely partitionable — carving into it would run a room onto the outer
  // boundary — so it falls through to the small-size branch below.
  if (interior.width >= MIN_LEAF && interior.height >= MIN_LEAF) {
    const tree = buildTree(rng, interior);
    carveTree(grid, tree);
  } else if (width >= 3 && height >= 3) {
    // Too small to partition, but there is a usable interior: carve a single
    // centred floor tile so the level is still playable.
    carve(grid, Math.floor(width / 2), Math.floor(height / 2));
  }

  return {
    level: { depth, spawn: findSpawn(grid) },
    grid,
  };
}

// ---------------------------------------------------------------------------
// Generator registry (design D3)
// ---------------------------------------------------------------------------

/**
 * The generator registry: named id -> generator.
 *
 * This object is **private to the module** — it is intentionally not exported,
 * so consumers cannot mutate engine internals. Callers select a generator only
 * through `generateLevel` and can enumerate the ids via `generatorIds`.
 */
const generators: Record<string, LevelGenerator> = {
  bsp: generateBspLevel,
};

/** The generator used when `generateLevel` is called without an id. */
export const DEFAULT_GENERATOR_ID = 'bsp';

/**
 * Thrown when `generateLevel` is asked for an id that is not registered.
 *
 * An unknown id is a legitimate caller error (a typo, or content naming a
 * generator this build does not ship), so it is reported **loudly** rather than
 * silently falling back to a default — mirroring the pack loader's loud
 * `PackLoadError`/`UnknownContentIdError` precedent. The `message` names the id
 * and lists the registered ids so the failure is actionable.
 */
export class UnknownGeneratorIdError extends Error {
  /** The id that was requested but not registered. */
  readonly id: string;
  /** The ids that are registered, in registration order. */
  readonly knownIds: string[];

  constructor(id: string, knownIds: string[]) {
    super(
      `unknown level generator id "${id}" (registered: ${knownIds.join(', ')})`,
    );
    this.name = 'UnknownGeneratorIdError';
    this.id = id;
    this.knownIds = knownIds;
  }
}

/** The registered generator ids, in registration order. */
export function generatorIds(): string[] {
  return Object.keys(generators);
}

/** Input to `generateLevel`: an optional id, the injected RNG + options. */
export interface GenerateLevelInput extends LevelGeneratorOptions {
  /** The injected seeded source; all layout randomness flows through it. */
  rng: Rng;
  /** Registered generator id; defaults to `DEFAULT_GENERATOR_ID` (`'bsp'`). */
  id?: string;
}

/**
 * Selects a generator by named id and runs it.
 *
 * - Omitting `id` (or passing `undefined`) uses `DEFAULT_GENERATOR_ID`.
 * - A registered id runs that generator.
 * - An unregistered id throws `UnknownGeneratorIdError` — never a silent
 *   fallback (design D3).
 *
 * The returned value is pure plain data (a `Grid` of booleans + a `Level` of
 * numbers/`Position`), so it is JSON-clean and cheap to serialize.
 */
export function generateLevel(input: GenerateLevelInput): GeneratedLevel {
  const id = input.id ?? DEFAULT_GENERATOR_ID;
  const generator = generators[id];
  if (generator === undefined) {
    throw new UnknownGeneratorIdError(id, generatorIds());
  }
  return generator(input.rng, {
    width: input.width,
    height: input.height,
    depth: input.depth,
  });
}
