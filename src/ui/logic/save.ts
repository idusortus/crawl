/**
 * Pure client-side save/resume helpers (change `core-gameplay-loop`, task 9.3 /
 * design D10).
 *
 * These wrap the engine's save surface (`serializeSave` / `resumeRun`) behind a
 * tiny, framework-free API so the client's persistence logic is unit-testable
 * under the node Vitest environment and `useGame` stays a thin adapter holding
 * only the store slot. All serialization/replay is delegated to `@engine`; this
 * module implements no engine behavior of its own (spec: app-shell "Saving never
 * leaves the engine boundary").
 *
 * A run's client-side bookkeeping is a `RunState`: the live `GameState`, the
 * full command log, and the applied-count cursor. Saving serializes all three;
 * resuming deserializes + replays only the remainder and returns a fresh
 * `RunState` (with the log/cursor reset to the envelope's contents).
 */

import { deserializeSave, resumeRun, serializeSave } from '@engine';
import type { Command, GameState, LoadedPack } from '@engine';

/** A run's live state plus the log/cursor used to persist it. */
export interface RunState {
  state: GameState;
  /** The full ordered command log for the run (audit trail; never truncated). */
  commands: Command[];
  /** How many leading commands are already reflected in `state`. */
  appliedCount: number;
}

/**
 * Serializes a run through the engine's envelope (`{ version, state, commands,
 * appliedCount }`). The input is only read; the live state is never mutated
 * (spec: app-shell "Auto-save does not disturb play").
 */
export function saveRun(run: RunState): string {
  return serializeSave(run.state, run.commands, run.appliedCount);
}

/**
 * Resumes a saved run: the engine deserializes the full state and replays only
 * `commands.slice(appliedCount)` from it (design D8), then the client resets
 * its log/cursor to the saved envelope so the next save is coherent.
 *
 * The returned cursor is `commands.length`, **not** the envelope's
 * `appliedCount`: `resumeRun` has already folded the whole remainder into
 * `state`, so the returned state reflects the entire log. Re-using the old
 * split would leave the cursor pointing at commands that are now already
 * applied — a subsequent save would then replay the remainder a second time on
 * the next resume. Keeping the cursor at the log length makes
 * `resume → save → resume` idempotent.
 *
 * Throws when the save cannot be loaded (e.g. an unknown `SAVE_VERSION`); the
 * caller surfaces that as an error rather than silently continuing.
 */
export function resumeRunState(save: string, pack?: LoadedPack): RunState {
  const envelope = deserializeSave(save);
  const state = resumeRun(save, pack);
  return {
    state,
    commands: envelope.commands,
    // `resumeRun` replayed the whole remainder, so the state now reflects the
    // entire log; the cursor must advance to match (see the doc comment above).
    appliedCount: envelope.commands.length,
  };
}
