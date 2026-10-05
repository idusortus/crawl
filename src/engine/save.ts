/**
 * Save/load — a versioned JSON envelope + resume-by-replay (change
 * `core-gameplay-loop`, tasks 8.1 / design D8).
 *
 * This module is **pure, with no I/O**: it serializes/deserializes plain JSON
 * and replays a command log. It never touches the platform (no `AsyncStorage`,
 * no `Date`, no `Math.random`) — the client owns storage I/O, the engine owns
 * the semantics (design D8).
 *
 * ## The envelope
 *
 *     { version: SAVE_VERSION, state, commands, appliedCount }
 *
 *  - `state` is the **FULL current game state** (`grid`, `level` incl. stairs,
 *    `explored`, `entities`, `playerId`, `status`, `carriedItemIds`, `rng`,
 *    `events`) — not a seed and not an initial state.
 *  - `commands` is the **FULL command log** for the run (the audit trail; never
 *    truncated).
 *  - `appliedCount` is the number of commands from the log's **head** already
 *    reflected in `state`.
 *
 * ## The one contract
 *
 * Resume deserializes the full saved state and replays **only the remainder**
 * (`commands.slice(appliedCount)`) from that state, through the pack-aware
 * entry point when a pack is supplied and the content-free entry point
 * otherwise (which noops `use-item`). The already-applied prefix
 * (`commands.slice(0, appliedCount)`) is **never** replayed against the saved
 * state — that would double-apply every command.
 *
 * There is **no seed→initial-state primitive in the engine** (`createInitialState`
 * lives in `src/ui`). Resume never rebuilds initial state from a seed; "from the
 * seed" means *from the saved state, whose `rng.seed` is recorded*.
 *
 * Unknown `SAVE_VERSION`s are rejected **loudly** with a typed
 * `UnknownSaveVersionError` naming the version, rather than mis-parsing the
 * payload (design D8; save-load spec "A save declares a version that is checked
 * on load").
 *
 * A pack-free replay whose unapplied remainder contains a content-dependent
 * command (`use-item` or `descend`) is rejected **loudly** with a typed
 * `PackRequiredForReplayError` naming the offending command types, rather than
 * silently replaying a world that diverges from the pack-aware run (change
 * `review-fixes-augment`, design D2). This is a precondition **at the replay
 * seam only**: the content-free entry point's own `use-item`/`descend`
 * behavior is unchanged (decisions.md Stage-6 Phase-7/Phase-8), and a remainder
 * of only content-free commands still replays without a pack.
 *
 * `SAVE_VERSION` is deliberately **separate** from `PACK_VERSION`: the save
 * envelope's format and the content pack's format evolve independently.
 *
 * This module is framework-free and deterministic (no react/react-native/expo,
 * no `Math.random`/`Date`), per the `src/engine` boundary rules.
 */

import { applyCommand, applyCommandWithPack } from './commands';
import { rngFromState } from './rng';
import type { LoadedPack } from './pack';
import type { Command, GameState } from './types';

/**
 * The save-format version carried in the envelope.
 *
 * Distinct from `PACK_VERSION` (design D8): the save envelope and the content
 * pack are different formats at different rates of change. Bumping this is a
 * breaking save-format change and makes older saves fail loudly on load.
 */
export const SAVE_VERSION = 1;

/**
 * The plain-data save envelope: the full current state, the full command log,
 * and the applied-count cursor.
 *
 * JSON-clean by construction: `state` is plain data (the engine guarantees it),
 * `commands` are plain command objects, `appliedCount` is a number, and
 * `version` is a number.
 */
export interface SaveEnvelope {
  /** The save-format version; checked on load (`SAVE_VERSION`). */
  version: number;
  /** The FULL current game state (not a seed, not an initial state). */
  state: GameState;
  /** The FULL ordered command log for the run (audit trail; never truncated). */
  commands: Command[];
  /**
   * How many commands from the head of `commands` are already reflected in
   * `state`. The remainder (`commands.slice(appliedCount)`) is what resume
   * replays.
   */
  appliedCount: number;
}

/**
 * Thrown when a save's version is not the one the engine supports.
 *
 * An unknown version is a legitimate caller/data error, so it is reported
 * **loudly** with the offending version named rather than silently mis-parsed
 * (design D8; save-load spec "Unknown save version is rejected"). The
 * `message` names both the unsupported version and the supported one.
 */
export class UnknownSaveVersionError extends Error {
  /** The version found in the loaded save. */
  readonly version: number;
  /** The save version this engine supports (`SAVE_VERSION`). */
  readonly supported: number;

  constructor(version: number, supported: number) {
    super(
      `unsupported save version ${version} (this engine supports ${supported})`,
    );
    this.name = 'UnknownSaveVersionError';
    this.version = version;
    this.supported = supported;
  }
}

/**
 * Thrown when a **pack-free** replay is asked to apply a content-dependent
 * command.
 *
 * The content-free entry point has a documented, legitimate noop/unpopulated
 * behavior for `use-item` (`unknown-command:use-item`) and `descend` (an
 * unpopulated level) — decisions.md Stage-6 Phase-7/Phase-8. That asymmetry is
 * only wrong for **replay**, where the caller's intent is to reproduce the
 * original run: silently replaying noop/unpopulated commands produces a state
 * that diverges from the pack-aware run. So `replayCommands` throws this error
 * **before applying anything** when no pack is supplied and the unapplied
 * remainder contains a `use-item` or `descend` command, naming the offending
 * command types (change `review-fixes-augment`, design D2).
 *
 * Supplying the pack restores the correct path; a remainder of only
 * content-free commands (`move`/`attack`/`pickup`) still replays without a pack,
 * and `deserializeSave` (inspection) is untouched.
 */
export class PackRequiredForReplayError extends Error {
  /** The offending command types, deduplicated in first-seen order. */
  readonly commandTypes: string[];

  constructor(commandTypes: string[]) {
    super(
      `a content pack is required to replay the remaining command log: ` +
        `it contains content-dependent command type(s) ${commandTypes
          .map((type) => `"${type}"`)
          .join(', ')}`,
    );
    this.name = 'PackRequiredForReplayError';
    this.commandTypes = commandTypes;
  }
}

/** Returns true when `value` is a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serializes a run to a JSON string.
 *
 * `state` is stored **as given** (the full current state), `commands` as the
 * full command log, and `appliedCount` as the cursor. The live state is not
 * read from or written to, and the input is never mutated; `JSON.stringify`
 * of plain data is the whole operation. The exact key order is fixed
 * (`version`, `state`, `commands`, `appliedCount`) so the output is stable for
 * identical inputs.
 */
export function serializeSave(
  state: GameState,
  commandLog: Command[],
  appliedCount: number,
): string {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    state,
    commands: commandLog,
    appliedCount,
  };
  return JSON.stringify(envelope);
}

/**
 * Parses and validates a save JSON string, rejecting an unknown version loudly.
 *
 * Validation is deliberately shallow — the engine cannot (and should not)
 * re-validate the whole game state here; the guarantees come from the engine
 * having produced that state. What this checks is the envelope's own shape:
 *
 *  - the payload is a JSON object;
 *  - `version` is the supported `SAVE_VERSION` (else
 *    `UnknownSaveVersionError` naming the version);
 *  - `state` is an object, `commands` is an array, and `appliedCount` is a
 *    finite integer in `[0, commands.length]`.
 *
 * A malformed payload (wrong types) throws a plain `TypeError` with an
 * actionable message, matching the engine's "loud on malformed persisted data"
 * posture.
 */
export function deserializeSave(json: string): SaveEnvelope {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) {
    throw new TypeError('deserializeSave: save payload is not a JSON object');
  }

  const { version, state, commands, appliedCount } = parsed;
  if (version !== SAVE_VERSION) {
    throw new UnknownSaveVersionError(
      typeof version === 'number' ? version : Number.NaN,
      SAVE_VERSION,
    );
  }

  if (!isRecord(state)) {
    throw new TypeError('deserializeSave: "state" is not a JSON object');
  }
  if (!Array.isArray(commands)) {
    throw new TypeError('deserializeSave: "commands" is not an array');
  }
  if (
    typeof appliedCount !== 'number' ||
    !Number.isInteger(appliedCount) ||
    appliedCount < 0 ||
    appliedCount > commands.length
  ) {
    throw new TypeError(
      `deserializeSave: "appliedCount" must be an integer in [0, ${commands.length}]`,
    );
  }

  return {
    version: SAVE_VERSION,
    state: state as unknown as GameState,
    commands: commands as Command[],
    appliedCount,
  };
}

/**
 * The command types whose content-free resolution diverges from the pack-aware
 * one, so they cannot be replayed without a pack (design D2).
 *
 * `use-item` noops (`unknown-command:use-item`) and `descend` generates an
 * unpopulated level on the content-free path — both legitimate for a live
 * caller, both wrong for a replay that means to reproduce a run.
 */
const CONTENT_DEPENDENT_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'use-item',
  'descend',
]);

/**
 * Returns the content-dependent command types present in `commands`,
 * deduplicated in first-seen order. Used only to build the loud replay error.
 */
function contentDependentTypes(commands: Command[]): string[] {
  const found: string[] = [];
  for (const command of commands) {
    const type = (command as { type?: unknown }).type;
    if (
      typeof type === 'string' &&
      CONTENT_DEPENDENT_COMMAND_TYPES.has(type) &&
      !found.includes(type)
    ) {
      found.push(type);
    }
  }
  return found;
}

/**
 * Applies **only the remainder** of `commands` to `state`.
 *
 * `commands.slice(appliedCount)` is replayed in order from the saved state,
 * through `applyCommandWithPack` when `pack` is supplied (so `use-item`
 * resolves and `descend` populates) and through `applyCommand` otherwise. Each
 * command resumes the RNG from the running state's `rng` field exactly as a
 * live consumer would, so the replay advances identically.
 *
 * **Pack-free precondition (design D2).** When no pack is supplied and the
 * unapplied remainder contains a content-dependent command (`use-item` or
 * `descend`), this throws `PackRequiredForReplayError` naming the offending
 * types **before applying anything**, rather than silently producing a state
 * that diverges from the pack-aware run. A pack, an empty remainder
 * (`appliedCount === commands.length`), and a remainder of only content-free
 * commands (`move`/`attack`/`pickup`) replay unchanged.
 *
 * `appliedCount` is clamped defensively: a negative value replays the whole log
 * from the start, and a value beyond the log length replays nothing. A
 * well-formed save always carries a value in `[0, commands.length]`.
 *
 * The input `state` and `commands` are never mutated; a new state is returned.
 */
export function replayCommands(
  state: GameState,
  commands: Command[],
  appliedCount: number,
  pack?: LoadedPack,
): GameState {
  const start = Math.max(0, Math.min(appliedCount, commands.length));

  // Pack-free replay of a content-dependent remainder is rejected loudly before
  // anything is applied: the content-free path would silently noop `use-item`
  // and generate an unpopulated level on `descend`, diverging from the run the
  // caller means to reproduce (design D2). A pack, an empty remainder, and a
  // content-free remainder are unaffected.
  if (pack === undefined && start < commands.length) {
    const offending = contentDependentTypes(commands.slice(start));
    if (offending.length > 0) {
      throw new PackRequiredForReplayError(offending);
    }
  }

  let current = state;
  for (let i = start; i < commands.length; i++) {
    const command = commands[i];
    const result =
      pack === undefined
        ? applyCommand(current, command, rngFromState(current.rng))
        : applyCommandWithPack(current, command, rngFromState(current.rng), pack);
    current = result.state;
  }
  return current;
}

/**
 * Resumes a saved run: deserialize the envelope, then replay the remainder of
 * its command log from the saved state (design D8).
 *
 * This is the whole resume contract in one call:
 * `resumeRun(save, pack?) = replayCommands(deserializeSave(save), pack)`.
 * It does not rebuild initial state from a seed — the full saved state is the
 * starting point and only the unapplied commands run.
 */
export function resumeRun(save: string, pack?: LoadedPack): GameState {
  const envelope = deserializeSave(save);
  return replayCommands(
    envelope.state,
    envelope.commands,
    envelope.appliedCount,
    pack,
  );
}
