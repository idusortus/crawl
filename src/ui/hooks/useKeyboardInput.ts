/**
 * `useKeyboardInput` — web-only keyboard controls (change `expo-glyph-renderer`,
 * design D3; task 4.2; extended by `core-gameplay-loop` task 9.2 / design D10;
 * directional attack removed and a target-mode key added by
 * `mobile-client-playability` design D2/D7, task 5.4).
 *
 * A development convenience for the web target: arrow keys map to the four move
 * commands, `p`/`g` to pickup, Enter (or `>`, the roguelike descend key) to
 * descend, `.` to wait a turn, `f` to toggle ranged target mode, and `s`/`r`/`n`
 * to the save / resume / new-run client actions. Command keys resolve through
 * `dispatch`; action keys invoke the matching callback. The hook never touches
 * state.
 *
 * There is no keyboard attack: directional melee was removed along with the
 * on-screen attack row (melee is bump-to-attack). The target-mode callback is
 * optional so a call site that does not need it typechecks; `GameScreen` wires
 * `onToggleTargetMode`, so `f` is live.
 *
 * The handler is registered **only** on `Platform.OS === 'web'`; on native the
 * effect returns a no-op cleanup and no listener is ever attached. `window` is
 * only read inside the web branch, so a native bundle never evaluates it and the
 * hook cannot crash off-web (design D3).
 *
 * While auto-travel is active, an optional `interceptCommand` is consulted before
 * dispatching a resolved command: a travel-cancelling arrow/`.` press cancels
 * travel and is swallowed (no command dispatched), so it costs no turn (change
 * `travel-and-repeat-move`, design D5; task 5.1). No hold behavior is added —
 * the web keyboard still repeats only through the OS.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Command } from '@engine';

import { actionForKey, commandForKey } from '../logic/input';

/** The callback bundle the hook forwards input to. */
export interface KeyboardHandlers {
  /** Dispatches a resolved engine command (move/pickup/descend). */
  dispatch: (command: Command) => void;
  /** Saves the current run through the client's save path. */
  save: () => void;
  /** Resumes the stored save. */
  resume: () => void;
  /** Starts a fresh run. */
  newRun: () => void;
  /**
   * Toggles ranged target mode. Optional while target mode is a later phase; a
   * press with no handler wired is a no-op.
   */
  onToggleTargetMode?: () => void;
  /**
   * Consulted before dispatching a resolved command; returns `true` when the
   * input was swallowed (auto-travel cancelled it), so no command is dispatched
   * (change `travel-and-repeat-move`, design D5; task 5.1). Optional so a call
   * site that does not need it typechecks.
   */
  interceptCommand?: (command: Command) => boolean;
}

/**
 * Registers web keyboard controls that forward input to the handlers.
 *
 * @param handlers The command dispatcher plus the save/resume/new-run callbacks
 *   (see `useGameContext`), and an optional target-mode toggle.
 * @returns Nothing; the effect attaches and cleans up the listener itself.
 */
export function useKeyboardInput(handlers: KeyboardHandlers): void {
  const { dispatch, save, resume, newRun, onToggleTargetMode, interceptCommand } =
    handlers;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Native has no keyboard: register nothing and clean up nothing.
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey(event.key);
      if (command !== undefined) {
        // Stop the browser from scrolling on arrow keys / submitting on Enter.
        event.preventDefault();
        // A travel-cancelling press during auto-travel is swallowed: the
        // interceptor cancels travel and we dispatch nothing (task 5.1).
        if (interceptCommand?.(command) === true) return;
        dispatch(command);
        return;
      }

      const action = actionForKey(event.key);
      if (action === 'save') save();
      else if (action === 'resume') resume();
      else if (action === 'new-run') newRun();
      else if (action === 'toggle-target-mode') onToggleTargetMode?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, save, resume, newRun, onToggleTargetMode, interceptCommand]);
}
