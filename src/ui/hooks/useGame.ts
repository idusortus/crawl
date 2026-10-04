/**
 * `useGame` — the client-side game hook (change `expo-glyph-renderer`, design
 * D4/D7; tasks 2.3/2.4).
 *
 * Owns the `{ state, pack }` pair and the immutable command-dispatch contract.
 * This is the ONLY place in `src/ui` that calls the engine's command entry
 * point (`applyCommandWithPack`): every input path goes through `dispatch`.
 *
 * Startup order matters (design D7): the pack loads FIRST, because
 * `createInitialState` needs it to source the player's class/HP. If the pack
 * fails to load, the typed error is captured as a recoverable `error` value and
 * no state is constructed — the app renders the error surface instead of
 * white-screening. If the pack loads, the initial state is built once.
 *
 * Determinism: the hook never holds an ambient RNG. Every dispatch derives an
 * `Rng` from `state.rng` via `rngFromState`, so state is the single source of
 * truth and a replayed command log is reproducible.
 */

import { useCallback, useState } from 'react';

import {
  applyCommandWithPack,
  loadPack,
  rngFromState,
} from '@engine';
import type { Command, GameState, LoadedPack } from '@engine';

import { fantasyPack } from '../../packs/fantasy';
import { createInitialState } from '../state/createInitialState';

/** The default run seed until a seed-selection UI exists. */
const DEFAULT_SEED = 1;

/**
 * The recoverable startup failure surfaced to the UI (design D7).
 *
 * `loadPack` throws the typed `PackLoadError` (invalid/under-composed pack) and
 * `UnknownContentIdError` (a lookup miss, e.g. a player class absent from the
 * pack); the union names both, with a plain `Error` fallback so any thrown
 * value still surfaces as a message.
 */
export type GameError = Error;

/** The value `useGame` returns to consumers. */
export interface UseGameResult {
  /** The current game state, or `undefined` if the pack failed to load. */
  state: GameState | undefined;
  /** The loaded content pack, or `undefined` if loading failed. */
  pack: LoadedPack | undefined;
  /** Applies a command immutably, advancing the game (no-op before load). */
  dispatch: (command: Command) => void;
  /** A recoverable startup failure, or `undefined` on success. */
  error: GameError | undefined;
}

/** The outcome of the one-time startup load. */
interface StartupResult {
  state?: GameState;
  pack?: LoadedPack;
  error?: GameError;
}

/**
 * Attempts the one-time startup load: `loadPack(fantasyPack)` then
 * `createInitialState(seed, pack)`. Returns the pair on success, or the thrown
 * error as a value (never propagating a throw out of render).
 *
 * Kept as a plain function so a throw is caught into a value rather than
 * escaping the hook, and so the load runs exactly once.
 */
function loadGame(seed: number): StartupResult {
  try {
    const pack = loadPack(fantasyPack);
    return { state: createInitialState(seed, pack), pack };
  } catch (caught) {
    return {
      error: caught instanceof Error ? caught : new Error(String(caught)),
    };
  }
}

/**
 * Loads the pack and builds the initial state once, then exposes an immutable
 * `dispatch`.
 *
 * `loadGame` runs in a single lazy `useState` initializer, so the pack is
 * loaded and the level generated exactly once for the lifetime of the hook.
 */
export function useGame(seed: number = DEFAULT_SEED): UseGameResult {
  const [startup, setStartup] = useState<StartupResult>(() => loadGame(seed));

  const dispatch = useCallback((command: Command) => {
    setStartup((current) => {
      if (current.state === undefined || current.pack === undefined) {
        return current;
      }
      const result = applyCommandWithPack(
        current.state,
        command,
        rngFromState(current.state.rng),
        current.pack,
      );
      return { ...current, state: result.state };
    });
  }, []);

  return {
    state: startup.state,
    pack: startup.pack,
    dispatch,
    error: startup.error,
  };
}
