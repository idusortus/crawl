/**
 * Pure key→command mapping for the web keyboard controls (change
 * `expo-glyph-renderer`, design D3; task 4.2).
 *
 * Framework-free on purpose — no React, no React Native, no DOM — so the mapping
 * can be unit-tested under the node Vitest environment (design D8). The hook
 * `useKeyboardInput` owns the DOM listener and imports this module; keeping the
 * mapping here leaves the hook as a thin adapter.
 */

import type { Command, Direction } from '@engine';

/** Maps an arrow key name to its move direction. */
export const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowRight: 'east',
  ArrowLeft: 'west',
};

/** Activation keys that resolve to a descend command. */
export const DESCEND_KEYS: ReadonlySet<string> = new Set(['Enter', '>']);

/**
 * Resolves a `KeyboardEvent.key` to a command, or `undefined` for a key the
 * controls do not handle. Kept pure so the mapping is easy to scan and test in
 * isolation from the DOM.
 */
export function commandForKey(key: string): Command | undefined {
  const direction = ARROW_DIRECTIONS[key];
  if (direction !== undefined) {
    return { type: 'move', direction };
  }
  if (DESCEND_KEYS.has(key)) {
    return { type: 'descend' };
  }
  return undefined;
}
