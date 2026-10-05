/**
 * Pure key→action mapping for the web keyboard controls (change
 * `expo-glyph-renderer`, design D3; task 4.2; extended by
 * `core-gameplay-loop` task 9.2 / design D10).
 *
 * Framework-free on purpose — no React, no React Native, no DOM — so the mapping
 * can be unit-tested under the node Vitest environment (design D8). The hook
 * `useKeyboardInput` owns the DOM listener and imports this module; keeping the
 * mapping here leaves the hook as a thin adapter.
 *
 * Two flavors are produced:
 *  - {@link commandForKey} maps a key to an engine `Command` (move, attack,
 *    pickup, use-item, descend) — all of which flow through `dispatch`.
 *  - {@link actionForKey} maps a key to a named non-command action (save /
 *    resume / new-run), which the client handles through its save path. Keeping
 *    actions distinct from commands means the command path stays exhaustive.
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

/** Keys that resolve to a pickup command. */
export const PICKUP_KEYS: ReadonlySet<string> = new Set(['p', 'g']);

/** A non-command client action the keyboard can trigger. */
export type InputAction = 'save' | 'resume' | 'new-run';

/** Keys that resolve to the save / resume / new-run client actions. */
export const ACTION_KEYS: Readonly<Record<string, InputAction>> = {
  s: 'save',
  r: 'resume',
  n: 'new-run',
};

/**
 * Resolves a `KeyboardEvent.key` (and whether a modifier is held) to a command,
 * or `undefined` for a key the controls do not handle. Kept pure so the mapping
 * is easy to scan and test in isolation from the DOM.
 *
 * Attack is a **modifier + direction** (Shift + arrow), matching the engine's
 * direction-bearing `AttackCommand` without requiring a stateful attack mode:
 * the modifier is passed in explicitly rather than read from the event here.
 */
export function commandForKey(key: string, shift = false): Command | undefined {
  const direction = ARROW_DIRECTIONS[key];
  if (direction !== undefined) {
    return shift ? { type: 'attack', direction } : { type: 'move', direction };
  }
  if (PICKUP_KEYS.has(key)) {
    return { type: 'pickup' };
  }
  if (DESCEND_KEYS.has(key)) {
    return { type: 'descend' };
  }
  return undefined;
}

/**
 * Resolves a `KeyboardEvent.key` to a named client action (save/resume/new-run),
 * or `undefined`. Pure, so `useKeyboardInput` stays a thin adapter.
 */
export function actionForKey(key: string): InputAction | undefined {
  return ACTION_KEYS[key];
}
