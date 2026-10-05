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
 *  - the returned state's `rng` is captured **after** both `generateLevel` and
 *    `populateLevel` have drawn from the **same** `Rng` instance, so dispatching
 *    a command continues the stream rather than replaying the generation or
 *    population draws (design D4/D6/D7).
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
  populateLevel,
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

  // The player's class stats are copied from the pack at spawn (design D2):
  // without `attack` the engine would fall back to `DEFAULT_ATTACK` (1) and the
  // fighter would hit for 1 instead of its class's 4.
  const player = {
    id: PLAYER_ID,
    kind: PLAYER_CLASS_ID,
    pos: generated.level.spawn,
    hp: pack.class(PLAYER_CLASS_ID).hp,
    attack: pack.class(PLAYER_CLASS_ID).attack,
  };

  // Population shares the SAME `rng` instance generation just consumed, so
  // depth 1 has monsters/items (design D6/D7's one-shared-`Rng` contract). The
  // player is placed first, then the population; initial population emits no
  // events.
  const populated = populateLevel(generated, pack, rng);
  const entities = [player, ...populated.entities];

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
    entities,
    status: 'playing',
    carriedItemIds: [],
    // Capture the RNG state AFTER generation + population consumed their draws,
    // so the next command resumes the stream instead of replaying either.
    rng: rngToState(seed, rng),
    events: [],
  };
}
