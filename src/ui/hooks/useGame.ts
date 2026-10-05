/**
 * `useGame` — the client-side game hook (change `expo-glyph-renderer`, design
 * D4/D7; tasks 2.3/2.4; extended by `core-gameplay-loop` task 9.3 / design D10).
 *
 * Owns the `{ state, pack }` pair, the immutable command-dispatch contract, and
 * the client-side save/resume flow. This is the ONLY place in `src/ui` that
 * calls the engine's command entry point (`applyCommandWithPack`): every input
 * path goes through `dispatch`.
 *
 * Startup order matters (design D7/D1): the pack loads FIRST, because
 * `createInitialState` sources the player's class/HP/attack from it — by
 * default the pack's first declared class, so any schema-valid pack (fantasy,
 * dogs, or a future theme) is playable with no pack-specific class literal. If
 * the pack fails to load, the typed error is captured as a recoverable `error`
 * value and no state is constructed — the app renders the error surface
 * instead of white-screening. If the pack loads, the initial state is built
 * once. `createInitialState(seed, pack)` is called without a class id, which
 * selects the pack's first declared class (change `review-fixes-augment`, D1).
 *
 * Determinism: the hook never holds an ambient RNG. Every dispatch derives an
 * `Rng` from `state.rng` via `rngFromState`, so state is the single source of
 * truth and a replayed command log is reproducible.
 *
 * Save/resume (design D8/D10): the engine owns serialization (`serializeSave`),
 * replay (`resumeRun`), and the command log/cursor contract; this hook owns the
 * client-side storage and the run lifecycle around it. The save string is held
 * in a `useState` slot — an in-memory store is deliberately sufficient for this
 * stage (no external storage dependency). Auto-save runs on turn boundaries,
 * after a state change, and never mutates the live state. All engine calls go
 * through `@engine`; the UI never implements engine behavior.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { applyCommandWithPack, loadPack, rngFromState } from '@engine';
import type { Command, GameState, LoadedPack } from '@engine';

import { fantasyPack } from '../../packs/fantasy';
import { createInitialState } from '../state/createInitialState';
import { resumeRunState, saveRun } from '../logic/save';

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
  /**
   * Saves the current run through the engine's `serializeSave` path (the full
   * state + full command log + `appliedCount` cursor) into the client store.
   * No-op before load.
   */
  save: () => void;
  /**
   * Resumes the stored save through the engine's `resumeRun` path, replacing
   * live state with the resumed state. No-op when there is no save or the save
   * cannot be loaded (a load error is surfaced via `error`).
   */
  resume: () => void;
  /** Starts a fresh run (new seed) and clears the game-over surface. */
  newRun: () => void;
  /** True when a save exists in the client store and can be resumed. */
  hasSave: boolean;
  /** A recoverable startup/save failure, or `undefined` on success. */
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

/** Wraps any thrown value as an `Error` so `error.message` is always valid. */
function asError(caught: unknown): GameError {
  return caught instanceof Error ? caught : new Error(String(caught));
}

/**
 * Loads the pack and builds the initial state once, then exposes an immutable
 * `dispatch` plus the save/resume/new-run lifecycle.
 *
 * `loadGame` runs in a single lazy `useState` initializer, so the pack is
 * loaded and the level generated exactly once for the lifetime of the hook.
 */
export function useGame(seed: number = DEFAULT_SEED): UseGameResult {
  const [startup, setStartup] = useState<StartupResult>(() => loadGame(seed));

  // The client-side store. An in-memory string is sufficient for this stage and
  // keeps `src/engine` free of platform I/O (design D8/D10). Persistence across
  // sessions would swap only this slot for an AsyncStorage-backed ref.
  const [saveStore, setSaveStore] = useState<string | undefined>(undefined);

  // The command log and cursor for the *current* run. They are a ref, not state:
  // appending to them must not trigger a re-render, and a save reads both plus
  // the live state at save time so they can never drift apart.
  const logRef = useRef<Command[]>([]);
  const appliedRef = useRef(0);

  // The seed of the *current* run (the prop is only the initial seed). `newRun`
  // increments this, so pressing "New run" repeatedly walks seeds rather than
  // rebuilding the same level from the constant prop (finding 3).
  const seedRef = useRef(seed);

  /** The live run as the pure save helper sees it. */
  const currentRun = useCallback((): { state: GameState; commands: Command[]; appliedCount: number } | undefined => {
    if (startup.state === undefined) return undefined;
    return {
      state: startup.state,
      commands: logRef.current,
      appliedCount: appliedRef.current,
    };
  }, [startup.state]);

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
      // The command is applied to the live state immediately (so play is
      // responsive); the refs record the log + cursor for the next save.
      logRef.current = [...logRef.current, command];
      appliedRef.current = logRef.current.length;
      return { ...current, state: result.state };
    });
  }, []);

  const save = useCallback(() => {
    const run = currentRun();
    if (run === undefined) return;
    // `saveRun` serializes the FULL current state + FULL log + cursor; the live
    // state is only read, never mutated (spec: app-shell "Auto-save does not
    // disturb play").
    setSaveStore(saveRun(run));
  }, [currentRun]);

  const resume = useCallback(() => {
    if (saveStore === undefined) return;
    try {
      // The engine replays only `commands.slice(appliedCount)` from the saved
      // state (design D8); the client resets its log/cursor to the envelope so
      // the next save stays coherent.
      const run = resumeRunState(saveStore, startup.pack);
      logRef.current = run.commands;
      appliedRef.current = run.appliedCount;
      setStartup((prev) => ({ ...prev, state: run.state, error: undefined }));
    } catch (caught) {
      setStartup((prev) => ({ ...prev, error: asError(caught) }));
    }
  }, [saveStore, startup.pack]);

  const newRun = useCallback(() => {
    // A new run clears the game-over surface by building fresh initial state
    // for a new seed and resetting the log/cursor (spec: app-shell "A new run
    // is available after game over").
    const current = startup;
    if (current.pack === undefined) return;
    // Advance the current run's seed, not the constant prop, so repeated
    // presses yield distinct levels (finding 3).
    const nextSeed = seedRef.current + 1;
    seedRef.current = nextSeed;
    logRef.current = [];
    appliedRef.current = 0;
    setStartup({
      ...current,
      state: createInitialState(nextSeed, current.pack),
      error: undefined,
    });
  }, [startup]);

  // Auto-save on turn boundaries (design D10): every state change caused by a
  // dispatched command is a boundary, so the effect persists the run without a
  // user action. It reads the live state and never writes it, so play is
  // undisturbed (spec: app-shell "Auto-save preserves the run without user
  // action"). The initial state (an empty log) is intentionally not saved —
  // there is nothing to resume yet.
  useEffect(() => {
    if (startup.state === undefined) return;
    if (logRef.current.length === 0) return;
    setSaveStore(
      saveRun({
        state: startup.state,
        commands: logRef.current,
        appliedCount: appliedRef.current,
      }),
    );
  }, [startup.state]);

  return {
    state: startup.state,
    pack: startup.pack,
    dispatch,
    save,
    resume,
    newRun,
    hasSave: saveStore !== undefined,
    error: startup.error,
  };
}
