/**
 * Pure key→action mapping for the web keyboard controls (change
 * `expo-glyph-renderer`, design D3; task 4.2; extended by
 * `core-gameplay-loop` task 9.2 / design D10; directional attack removed and a
 * ranged target-mode key added by `mobile-client-playability` design D2/D7,
 * tasks 5.2/5.3/5.4).
 *
 * Framework-free on purpose — no React, no React Native, no DOM — so the mapping
 * can be unit-tested under the node Vitest environment (design D8). The hook
 * `useKeyboardInput` owns the DOM listener and imports this module; keeping the
 * mapping here leaves the hook as a thin adapter.
 *
 * Three flavors are produced:
 *  - {@link commandForKey} maps a key to an engine `Command` (move, pickup,
 *    descend) — all of which flow through `dispatch`. There is deliberately no
 *    directional attack mapping: melee is bump-to-attack (design D2).
 *  - {@link actionForKey} maps a key to a named non-command action (save / resume
 *    / new-run / toggle-target-mode), which the client handles through its save
 *    path or presentation state. Keeping actions distinct from commands means the
 *    command path stays exhaustive.
 *  - {@link directionForDelta} resolves a tap's `from`/`to` tile delta to a
 *    cardinal `Direction` (or `undefined`), so map taps are testable without a
 *    renderer.
 */

import type { Command, Direction, Position } from '@engine';

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
export type InputAction =
  | 'save'
  | 'resume'
  | 'new-run'
  | 'toggle-target-mode';

/** Keys that resolve to the save / resume / new-run / target-mode client actions. */
export const ACTION_KEYS: Readonly<Record<string, InputAction>> = {
  s: 'save',
  r: 'resume',
  n: 'new-run',
  f: 'toggle-target-mode',
};

/**
 * Resolves a `KeyboardEvent.key` to a command, or `undefined` for a key the
 * controls do not handle. Kept pure so the mapping is easy to scan and test in
 * isolation from the DOM.
 *
 * Arrows always move; there is no modifier mapping to a directional attack (that
 * control was removed — melee is bump-to-attack).
 */
export function commandForKey(key: string): Command | undefined {
  const direction = ARROW_DIRECTIONS[key];
  if (direction !== undefined) {
    return { type: 'move', direction };
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
 * Resolves a `KeyboardEvent.key` to a named client action (save/resume/new-run/
 * target-mode), or `undefined`. Pure, so `useKeyboardInput` stays a thin adapter.
 */
export function actionForKey(key: string): InputAction | undefined {
  return ACTION_KEYS[key];
}

/**
 * Resolves the cardinal {@link Direction} from `from` to `to` when `to` is
 * orthogonally adjacent to `from`, or `undefined` otherwise.
 *
 * The engine's `Direction` union is cardinal only (design D2), so a diagonal, the
 * same tile, or any non-unit delta yields `undefined` — a non-adjacent tap
 * dispatches nothing. North is `-y`, matching the engine's movement step.
 */
export function directionForDelta(from: Position, to: Position): Direction | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 'north';
  if (dx === 0 && dy === 1) return 'south';
  if (dx === 1 && dy === 0) return 'east';
  if (dx === -1 && dy === 0) return 'west';
  return undefined;
}
