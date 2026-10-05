/**
 * `useGame` — the client-side game hook (change `expo-glyph-renderer`, design
 * D4/D7; tasks 2.3/2.4; extended by `core-gameplay-loop` task 9.3 / design D10;
 * extended by `ui-fit-and-persistence` design D3/D4; fresh seed per run by
 * `mobile-client-playability` design D4 / task 7.1).
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
 * Persistence (design D3/D4): the engine owns serialization (`serializeSave`),
 * replay (`resumeRun`), and the command log/cursor contract; `save.ts` remains
 * the pure synchronous boundary; `saveStorage.ts` is the only module touching
 * device storage. This hook owns the run lifecycle around them. The save slot is
 * hydrated once on mount from durable storage behind a `hydratedRef` barrier:
 * `save()`/auto-save are no-ops until hydration settles, so a first move cannot
 * clobber a stored run. Hydration never replaces the live run — the fresh run is
 * built synchronously and resumes only when the user explicitly presses Resume
 * (design D4 merge policy, not auto-resume). The public `save`/`resume` handlers
 * stay synchronous `() => void`; the async I/O is internal, so `KeyboardHandlers`
 * / `ActionBar` / the provider types do not drift.
 *
 * Save feedback and errors (design D3): a successful save flips a transient
 * presentation-only `savedIndicator` boolean (no clock/random; the client clears
 * it on the next action) and any storage/hydration failure lands in the separate
 * non-fatal `saveError` channel — never the fatal pack-load `error`, which would
 * hide the game behind the pack-load error screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { applyCommandWithPack, loadPack, rngFromState } from '@engine';
import type { Command, GameState, LoadedPack } from '@engine';

import { fantasyPack } from '../../packs/fantasy';
import { createInitialState } from '../state/createInitialState';
import { resumeRunState, saveRun } from '../logic/save';
import { createAsyncStorageAdapter, createSaveStorage } from '../logic/saveStorage';
import type { SaveStorage } from '../logic/saveStorage';
import type { RunState } from '../logic/save';

/**
 * Draws a fresh seed at the client boundary (change
 * `mobile-client-playability`, design D4; task 7.1).
 *
 * This is the one place in `src/ui` that consults the wall clock and ambient
 * randomness. The ENGINE must not — it receives this number as the injected
 * seed and stays fully deterministic for a given seed (ESLint enforces that on
 * `src/engine/**`). Mixing the two sources keeps two rapid launches (which can
 * share a millisecond) from colliding. The value is a non-negative integer;
 * `createRng` coerces it with `>>> 0` regardless.
 */
export function freshSeed(): number {
  const time = Date.now() % 0x7fffffff;
  const random = Math.floor(Math.random() * 0x7fffffff);
  return time ^ random;
}

/**
 * The durable store, created once at module scope from the real AsyncStorage
 * adapter. `saveStorage.ts` owns the native import; this hook only holds the
 * resulting `SaveStorage` value. Kept out of component state because it is a
 * plain object with no React identity.
 */
const saveStorage: SaveStorage = createSaveStorage(createAsyncStorageAdapter());

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
   * state + full command log + `appliedCount` cursor) to durable storage. The
   * handler is synchronous (`() => void`); the storage write is internal. No-op
   * before load or before hydration settles.
   */
  save: () => void;
  /**
   * Resumes the stored save through the engine's `resumeRun` path, replacing
   * live state with the resumed state. No-op when there is no save or the save
   * cannot be loaded (a load error is surfaced via `saveError`).
   */
  resume: () => void;
  /** Starts a fresh run (new seed) and clears the game-over surface. */
  newRun: () => void;
  /** True when a save exists and can be resumed, evaluated after hydration. */
  hasSave: boolean;
  /**
   * A recoverable fatal startup failure (e.g. a bad content pack), or
   * `undefined` on success. This hides the game behind the error surface and is
   * never set by the persistence path.
   */
  error: GameError | undefined;
  /**
   * A non-fatal storage/hydration failure, or `undefined` on success. Surfaced
   * inline in the UI while play continues; never routed to the fatal `error`.
   */
  saveError: GameError | undefined;
  /** True for a short spell after an explicit successful save. */
  savedIndicator: boolean;
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
export function useGame(seed?: number): UseGameResult {
  // Build the first run once. An explicit `seed` (tests/stories, or a future
  // seed picker) pins it; otherwise `freshSeed()` draws at the client boundary
  // so a cold start varies run to run (design D4). The lazy initializer runs
  // exactly once, so the draw is single-shot and never re-randomizes on render
  // (spec: app-shell "Each run starts from a fresh seed" / "An explicit seed is
  // honored").
  const [startup, setStartup] = useState<StartupResult>(() =>
    loadGame(seed ?? freshSeed()),
  );

  // The client-side save slot, hydrated once from durable storage. The live
  // `GameState` is built synchronously above, so first paint is the fresh run
  // and never waits on the load.
  const [saveStore, setSaveStore] = useState<string | undefined>(undefined);

  // Non-fatal persistence failure (load or write). Separate from the fatal
  // pack-load `startup.error` so a storage hiccup never hides the game.
  const [saveError, setSaveError] = useState<GameError | undefined>(undefined);

  // Presentation-only "Saved" flag. Cleared on the next successful action; uses
  // no clock or randomness, and is never part of stored content.
  const [savedIndicator, setSavedIndicator] = useState(false);

  // The command log and cursor for the *current* run. They are a ref, not state:
  // appending to them must not trigger a re-render, and a save reads both plus
  // the live state at save time so they can never drift apart.
  const logRef = useRef<Command[]>([]);
  const appliedRef = useRef(0);

  // The hydration barrier (design D3). `false` until the one-time load effect
  // settles (success or failure); save/auto-save are no-ops while false, so a
  // first move cannot overwrite a stored run before the load resolves.
  const hydratedRef = useRef(false);

  // True once this session has written the slot. Hydration must not overwrite a
  // slot written earlier in the session (the other half of the same race).
  const wroteRef = useRef(false);

  // A mirror of the *committed* `{ state, pack }`. `dispatch` reads it to apply
  // the next command OUTSIDE a `setState` updater (which React may invoke more
  // than once), keeping the command application + log append single-shot and
  // replay-safe. Kept in sync at every state-mutating path (init, dispatch,
  // resume, newRun) via the `commitRun` helper below.
  const latestRunRef = useRef<{ state: GameState | undefined; pack: LoadedPack | undefined }>({
    state: startup.state,
    pack: startup.pack,
  });

  /** Records the current `{ state, pack }` into the dispatch mirror. */
  const commitRun = useCallback((state: GameState | undefined, pack: LoadedPack | undefined) => {
    latestRunRef.current = { state, pack };
  }, []);

  /** The live run as the pure save helper sees it. */
  const currentRun = useCallback((): RunState | undefined => {
    // Read the dispatch mirror, not the committed render value: `dispatch`
    // updates `latestRunRef` synchronously, so this stays consistent with the
    // log/cursor even if a save is invoked in the same tick as an uncommitted
    // dispatch (avoids saving one turn behind).
    const { state } = latestRunRef.current;
    if (state === undefined) return undefined;
    return {
      state,
      commands: logRef.current,
      appliedCount: appliedRef.current,
    };
  }, []);

  /**
   * Persists a serialized run to durable storage. Reads the pure envelope at the
   * call site; the async write is fired without blocking the caller. Failures
   * surface through `saveError` (never thrown out of render) and leave the game
   * running (spec: app-shell "A storage failure is surfaced without hiding the
   * game").
   */
  const persist = useCallback((envelope: string) => {
    void saveStorage.persistSave(envelope).then(
      () => {
        setSaveError(undefined);
      },
      (caught: unknown) => {
        setSaveError(asError(caught));
      },
    );
  }, []);

  const dispatch = useCallback((command: Command) => {
    // Dispatching is a user action: clear the transient "Saved" acknowledgement
    // so the next save (or auto-save) can show it again.
    setSavedIndicator(false);
    // Compute the next run OUTSIDE the state updater. React may invoke a
    // `setState` updater more than once under concurrent rendering, so an
    // updater must be pure; applying the command and appending to the log here
    // (in the event handler) keeps both the state transition and the log/cursor
    // single-shot and replay-safe. `latestRunRef` mirrors the committed run.
    const current = latestRunRef.current;
    if (current.state === undefined || current.pack === undefined) return;
    const result = applyCommandWithPack(
      current.state,
      command,
      rngFromState(current.state.rng),
      current.pack,
    );
    logRef.current = [...logRef.current, command];
    appliedRef.current = logRef.current.length;
    latestRunRef.current = { state: result.state, pack: current.pack };
    setStartup((prev) => ({ ...prev, state: result.state }));
  }, []);

  const save = useCallback(() => {
    // No-op until hydration settles: a save before the load resolves must not
    // overwrite the stored run (design D3 hydration barrier).
    if (!hydratedRef.current) return;
    const run = currentRun();
    if (run === undefined) return;
    // `saveRun` serializes the FULL current state + FULL log + cursor; the live
    // state is only read, never mutated (spec: app-shell "Auto-save does not
    // disturb play").
    const envelope = saveRun(run);
    wroteRef.current = true;
    setSaveStore(envelope);
    setSavedIndicator(true);
    persist(envelope);
  }, [currentRun, persist]);

  const resume = useCallback(() => {
    if (saveStore === undefined) return;
    setSavedIndicator(false);
    try {
      // The engine replays only `commands.slice(appliedCount)` from the saved
      // state (design D8); the client resets its log/cursor to the envelope so
      // the next save stays coherent.
      const run = resumeRunState(saveStore, startup.pack);
      logRef.current = run.commands;
      appliedRef.current = run.appliedCount;
      commitRun(run.state, startup.pack);
      setStartup((prev) => ({ ...prev, state: run.state, error: undefined }));
      setSaveError(undefined);
    } catch (caught) {
      setSaveError(asError(caught));
    }
  }, [saveStore, startup.pack, commitRun]);

  const newRun = useCallback(() => {
    // A new run clears the game-over surface by building fresh initial state
    // for a new seed and resetting the log/cursor (spec: app-shell "A new run
    // is available after game over").
    const current = startup;
    if (current.pack === undefined) return;
    // Draw a fresh seed for the new run rather than walking the initial seed, so
    // every "New run" produces a different level (design D4; spec: app-shell
    // "Repeated new runs differ").
    const nextSeed = freshSeed();
    logRef.current = [];
    appliedRef.current = 0;
    const nextState = createInitialState(nextSeed, current.pack);
    commitRun(nextState, current.pack);
    setSavedIndicator(false);
    setStartup({
      ...current,
      state: nextState,
      error: undefined,
    });
  }, [startup, commitRun]);

  // One-time hydration (design D3/D4): load any stored save and expose it to
  // Resume. The live run is untouched — resume only swaps state when the user
  // presses Resume. Hydration settles the barrier even on failure so save/auto-
  // save become live; a load failure surfaces via `saveError`.
  useEffect(() => {
    let cancelled = false;
    void saveStorage.loadSave().then(
      (stored) => {
        if (cancelled) return;
        // Do not overwrite a slot written earlier this session.
        if (!wroteRef.current) {
          setSaveStore(stored);
        }
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSaveError(asError(caught));
      },
    ).finally(() => {
      if (!cancelled) {
        hydratedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-save on turn boundaries (design D10, extended D3): every state change
  // caused by a dispatched command is a boundary, so the effect persists the run
  // without a user action. It reads the live state and never writes it, so play
  // is undisturbed (spec: app-shell "Auto-save preserves the run without user
  // action"). Behind the hydration barrier; the initial state (an empty log) is
  // intentionally not saved — there is nothing to resume yet. Auto-save does NOT
  // raise the transient "Saved" acknowledgement: that feedback is reserved for an
  // explicit Save press, so it stays meaningful rather than ambient.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (startup.state === undefined) return;
    if (logRef.current.length === 0) return;
    const envelope = saveRun({
      state: startup.state,
      commands: logRef.current,
      appliedCount: appliedRef.current,
    });
    wroteRef.current = true;
    setSaveStore(envelope);
    persist(envelope);
  }, [startup.state, persist]);

  return {
    state: startup.state,
    pack: startup.pack,
    dispatch,
    save,
    resume,
    newRun,
    hasSave: saveStore !== undefined,
    error: startup.error,
    saveError,
    savedIndicator,
  };
}
