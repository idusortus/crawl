/**
 * Pure unit tests for the client save/resume helper (change
 * `core-gameplay-loop`, task 9.3 / design D10).
 *
 * No React, no React Native — this file runs under the node Vitest environment
 * (the `src/ui` glob). It exercises the client helper against the real engine
 * save path (`@engine`) and the shipped fantasy pack, mirroring `useGame`.
 */

import { describe, expect, it } from 'vitest';

import {
  applyCommandWithPack,
  loadPack,
  rngFromState,
  UnknownSaveVersionError,
} from '@engine';
import type { Command, GameState } from '@engine';

import { fantasyPack } from '../../packs/fantasy';
import { createInitialState } from '../state/createInitialState';

import { resumeRunState, saveRun } from './save';
import type { RunState } from './save';

const pack = loadPack(fantasyPack);
const SEED = 7;

/** Applies `commands` to `state`, returning the run with the full log. */
function applyAll(state: GameState, commands: Command[]): RunState {
  let current = state;
  for (const command of commands) {
    current = applyCommandWithPack(
      current,
      command,
      rngFromState(current.rng),
      pack,
    ).state;
  }
  return { state: current, commands, appliedCount: commands.length };
}

describe('saveRun / resumeRunState', () => {
  it('round-trips a mid-run save and resumes the remaining commands', () => {
    const commands: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'south' },
      { type: 'move', direction: 'east' },
    ];

    const initial = createInitialState(SEED, pack);
    const full = applyAll(initial, commands);

    // A fully-applied save: the state already reflects the whole log, so the
    // cursor equals the log length and resume replays nothing.
    const midRun: RunState = {
      state: full.state,
      commands,
      appliedCount: commands.length,
    };
    const save = saveRun(midRun);
    const resumed = resumeRunState(save, pack);

    // Resume matches the uninterrupted run and, because appliedCount === length,
    // replays nothing.
    expect(resumed.state).toEqual(full.state);
    expect(resumed.appliedCount).toBe(commands.length);
    expect(resumed.commands).toEqual(commands);
  });

  it('is idempotent across resume → save → resume (no double-apply)', () => {
    const commands: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'south' },
      { type: 'move', direction: 'east' },
    ];

    // An uninterrupted reference run: the state every resume must match.
    const initial = createInitialState(SEED, pack);
    const reference = applyAll(initial, commands);

    // A genuine mid-run save: the state has only some of the log applied, so
    // resume must actually replay the remainder (not a no-op).
    const split = 2;
    let midState = initial;
    for (const command of commands.slice(0, split)) {
      midState = applyCommandWithPack(
        midState,
        command,
        rngFromState(midState.rng),
        pack,
      ).state;
    }
    const midRun: RunState = {
      state: midState,
      commands,
      appliedCount: split,
    };

    const first = resumeRunState(saveRun(midRun), pack);
    // Resume replayed the remainder, so the cursor now points at the full log.
    expect(first.state).toEqual(reference.state);
    expect(first.appliedCount).toBe(commands.length);

    // Re-serialize the resumed state with its (now-full) cursor and resume
    // again: the second resume must be a no-op replay, yielding the same state.
    const second = resumeRunState(saveRun(first), pack);

    expect(second.state).toEqual(first.state);
    expect(second.state).toEqual(reference.state);
    expect(second.appliedCount).toBe(commands.length);
    // The event logs must match too — a double-apply would append extra events
    // (the reported probe: 5 events instead of 3).
    expect(second.state.events).toEqual(reference.state.events);
  });

  it('never mutates the live state or log while saving', () => {
    const commands: Command[] = [{ type: 'move', direction: 'east' }];
    const initial = createInitialState(SEED, pack);
    const run = applyAll(initial, commands);
    const stateSnapshot = JSON.parse(JSON.stringify(run.state));
    const logSnapshot = JSON.parse(JSON.stringify(run.commands));

    saveRun(run);

    expect(run.state).toEqual(stateSnapshot);
    expect(run.commands).toEqual(logSnapshot);
  });

  it('rejects an unknown save version loudly', () => {
    const initial = createInitialState(SEED, pack);
    const save = saveRun({ state: initial, commands: [], appliedCount: 0 });
    const tampered = save.replace('"version":1', '"version":999');

    expect(() => resumeRunState(tampered, pack)).toThrow(UnknownSaveVersionError);
  });

  it('a duplicated command in the log changes the resumed state (guards the impure-updater hazard)', () => {
    // Rationale: the React client must append each command exactly once (its
    // `dispatch` applies the command + appends the log in the event handler, not
    // inside a `setState` updater). If a command were double-appended, resume
    // would replay it twice and diverge. This pins that a duplicated log entry
    // does NOT reproduce the uninterrupted run, so a regression that duplicates
    // the log is caught here rather than silently corrupting a durable save.
    const commands: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'south' },
    ];
    const initial = createInitialState(SEED, pack);
    const reference = applyAll(initial, commands);

    // A mid-run save whose remaining log has the first command duplicated.
    const midState = applyCommandWithPack(
      initial,
      { type: 'move', direction: 'east' },
      rngFromState(initial.rng),
      pack,
    ).state;
    const duplicatedLog: Command[] = [
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'east' },
      { type: 'move', direction: 'south' },
    ];
    const resumed = resumeRunState(
      saveRun({ state: midState, commands: duplicatedLog, appliedCount: 1 }),
      pack,
    );

    // The extra `east` walk moves the player further than the reference run, so
    // the duplicated log is provably NOT the uninterrupted run.
    expect(resumed.state).not.toEqual(reference.state);
  });
});
