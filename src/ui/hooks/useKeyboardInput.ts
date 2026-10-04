/**
 * `useKeyboardInput` — web-only keyboard controls (change `expo-glyph-renderer`,
 * design D3; task 4.2).
 *
 * A development convenience for the web target: arrow keys map to the four move
 * commands and Enter (or `>`, the roguelike descend key) maps to descend. Every
 * key resolves to a `dispatch(command)` call — the hook never touches state.
 *
 * The handler is registered **only** on `Platform.OS === 'web'`; on native the
 * effect returns a no-op cleanup and no listener is ever attached. `window` is
 * only read inside the web branch, so a native bundle never evaluates it and the
 * hook cannot crash off-web (design D3).
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Command } from '@engine';

import { commandForKey } from '../logic/input';

/**
 * Registers web keyboard controls that forward commands to `dispatch`.
 *
 * @param dispatch The game hook's command dispatcher (see `useGameContext`).
 * @returns Nothing; the effect attaches and cleans up the listener itself.
 */
export function useKeyboardInput(dispatch: (command: Command) => void): void {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Native has no keyboard: register nothing and clean up nothing.
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey(event.key);
      if (command === undefined) return;
      // Stop the browser from scrolling on arrow keys / submitting on Enter.
      event.preventDefault();
      dispatch(command);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);
}
