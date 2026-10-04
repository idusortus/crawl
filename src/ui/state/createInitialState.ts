/**
 * Initial client game state (change `expo-glyph-renderer`, design D4/D7).
 *
 * This is the client-side factory that assembles the first `GameState` the
 * renderer ever draws. It is deliberately a pure function of `(seed, pack)` so
 * a run is reproducible from its seed and the loaded content pack:
 *
 *  - the pack is passed in (never imported here) and MUST already be loaded,
 *    because the player's starting HP comes from `pack.class(PLAYER_CLASS_ID)`
 *    and a pack lookup throws `UnknownContentIdError` on a miss;
 *  - the level is generated from an RNG seeded from `seed`, the exact same
 *    injected RNG the command loop threads through state;
 *  - the returned state's `rng` is captured **after** `generateLevel` has drawn
 *    its randomness, so dispatching a command continues the stream rather than
 *    replaying the generation draws (design D4).
 *
 * Everything here flows through the `@engine` public surface — the UI is a pure
 * client of the engine and must never reach deeper into `src/engine`.
 */

import {
  computeFov,
  createRng,
  DEFAULT_SIGHT_RADIUS,
  exploreInto,
  generateLevel,
  rngToState,
} from '@engine';
import type { GameState, LoadedPack } from '@engine';

/**
 * The fantasy pack's player class id. The pack defines `fighter`/`rogue` and no
 * `player` class, so the player is a `fighter`; hard-coding any other id would
 * make every `pack.class(...)` lookup throw (design D4).
 */
export const PLAYER_CLASS_ID = 'fighter';

/** The stable id of the single player entity in `GameState.entities`. */
export const PLAYER_ID = 'player';

/**
 * The dimensions of the starting level.
 *
 * 40×30 deliberately matches the engine's `DESCEND_LEVEL_WIDTH` /
 * `DESCEND_LEVEL_HEIGHT`, so descending generates a level of the same size and
 * the renderer never has to change its fixed grid (design D4).
 */
const LEVEL_WIDTH = 40;
const LEVEL_HEIGHT = 30;
const LEVEL_DEPTH = 1;

/**
 * Builds the initial `GameState` for a run.
 *
 * @param seed  The run's seed; the same seed plus the same pack yields an
 *   identical state (determinism is a structural engine invariant).
 * @param pack  The loaded content pack the player's class/HP are sourced from.
 */
export function createInitialState(seed: number, pack: LoadedPack): GameState {
  const rng = createRng(seed);
  const generated = generateLevel({
    rng,
    width: LEVEL_WIDTH,
    height: LEVEL_HEIGHT,
    depth: LEVEL_DEPTH,
  });

  const player = {
    id: PLAYER_ID,
    kind: PLAYER_CLASS_ID,
    pos: generated.level.spawn,
    hp: pack.class(PLAYER_CLASS_ID).hp,
  };

  const visible = computeFov(
    generated.grid,
    generated.level.spawn,
    DEFAULT_SIGHT_RADIUS,
  );
  const explored = exploreInto(
    new Array<boolean>(generated.grid.width * generated.grid.height).fill(
      false,
    ),
    visible,
  );

  return {
    grid: generated.grid,
    level: generated.level,
    explored,
    playerId: PLAYER_ID,
    entities: [player],
    // Capture the RNG state AFTER `generateLevel` consumed its draws, so the
    // next command resumes the stream instead of replaying generation.
    rng: rngToState(seed, rng),
    events: [],
  };
}
