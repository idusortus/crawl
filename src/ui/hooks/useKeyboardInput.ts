/**
 * `useKeyboardInput` — web-only keyboard controls (change `expo-glyph-renderer`,
 * design D3; task 4.2; extended by `core-gameplay-loop` task 9.2 / design D10).
 *
 * A development convenience for the web target: arrow keys map to the four move
 * commands, Shift+arrow to a directional attack, `p`/`g` to pickup, Enter (or
 * `>`, the roguelike descend key) to descend, and `s`/`r`/`n` to the save /
 * resume / new-run client actions. Command keys resolve through `dispatch`;
 * action keys invoke the matching callback. The hook never touches state.
 *
 * The handler is registered **only** on `Platform.OS === 'web'`; on native the
 * effect returns a no-op cleanup and no listener is ever attached. `window` is
 * only read inside the web branch, so a native bundle never evaluates it and the
 * hook cannot crash off-web (design D3).
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Command } from '@engine';

import { actionForKey, commandForKey } from '../logic/input';

/** The callback bundle the hook forwards input to. */
export interface KeyboardHandlers {
  /** Dispatches a resolved engine command (move/attack/pickup/descend). */
  dispatch: (command: Command) => void;
  /** Saves the current run through the client's save path. */
  save: () => void;
  /** Resumes the stored save. */
  resume: () => void;
  /** Starts a fresh run. */
  newRun: () => void;
}

/**
 * Registers web keyboard controls that forward input to the handlers.
 *
 * @param handlers The command dispatcher plus the save/resume/new-run callbacks
 *   (see `useGameContext`).
 * @returns Nothing; the effect attaches and cleans up the listener itself.
 */
export function useKeyboardInput(handlers: KeyboardHandlers): void {
  const { dispatch, save, resume, newRun } = handlers;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Native has no keyboard: register nothing and clean up nothing.
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey(event.key, event.shiftKey);
      if (command !== undefined) {
        // Stop the browser from scrolling on arrow keys / submitting on Enter.
        event.preventDefault();
        dispatch(command);
        return;
      }

      const action = actionForKey(event.key);
      if (action === 'save') save();
      else if (action === 'resume') resume();
      else if (action === 'new-run') newRun();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, save, resume, newRun]);
}
