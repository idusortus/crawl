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
 *    descend, wait) — all of which flow through `dispatch`. There is deliberately
 *    no directional attack mapping: melee is bump-to-attack (design D2).
 *  - {@link actionForKey} maps a key to a named non-command action (save / resume
 *    / new-run / toggle-target-mode), which the client handles through its save
 *    path or presentation state. Keeping actions distinct from commands means the
 *    command path stays exhaustive.
 *  - {@link directionForDelta} resolves a tap's `from`/`to` tile delta to a
 *    cardinal `Direction` (or `undefined`), so map taps are testable without a
 *    renderer.
 *  - {@link isTravelCancellingCommand} classifies a resolved command as a
 *    travel-cancelling input (a direction `move` or a `wait`), the one
 *    definition shared by the keyboard handler, the D-pad, and the travel
 *    scheduler (change `travel-and-repeat-move`, design D5; task 1.5).
 *  - {@link stepPosition} and {@link isTravelDestination} support the travel
 *    scheduler and the travel-mode map tap (change `travel-and-repeat-move`,
 *    tasks 4.3/4.4): the former names the tile a planned step lands on, the
 *    latter is the tap's "is this a legal destination?" test.
 */

import { attackTargetAt, inBounds, indexOf, isPassable } from '@engine';
import type { Command, Direction, Entity, Grid, Position } from '@engine';

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

/** Wait keys that resolve to a wait command (`.` is the roguelike pass key). */
export const WAIT_KEYS: ReadonlySet<string> = new Set(['.']);

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
 * control was removed — melee is bump-to-attack). `.` waits a turn.
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
  if (WAIT_KEYS.has(key)) {
    return { type: 'wait' };
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
 * True when `command` is a travel-cancelling input that is **swallowed** while
 * auto-travel is active (change `travel-and-repeat-move`, design D5; task 1.5):
 * a directional `move` or a `wait`. Such a press cancels travel and dispatches
 * no command, so it costs no turn. Every other command (pickup/descend/use-item/
 * attack/ranged-attack) and `undefined` are not travel-cancelling.
 *
 * Kept beside {@link commandForKey} so the keyboard handler, the on-screen
 * controls, and the travel scheduler share one definition; the existing
 * `commandForKey`/`actionForKey` mappings are unchanged.
 */
export function isTravelCancellingCommand(
  command: Command | undefined,
): boolean {
  return command?.type === 'move' || command?.type === 'wait';
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

/** The cardinal unit delta for a `Direction`; north is `-y`, matching `move`. */
const DIRECTION_STEP: Readonly<Record<Direction, Position>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/**
 * The tile one cardinal step from `from` in `direction` (change
 * `travel-and-repeat-move`, task 4.4).
 *
 * The travel scheduler uses this to name the tile its next planned step would
 * land on, so `travelStopReason` can test that tile for the stairs or a lost
 * route without a second copy of the delta table. Pure, so it is unit-tested.
 */
export function stepPosition(from: Position, direction: Direction): Position {
  const delta = DIRECTION_STEP[direction];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

/**
 * The tile the next planned travel step would land on, or `undefined` when the
 * route is exhausted or the player's position is unknown (change
 * `travel-and-repeat-move`, post-apply review Fix 7).
 *
 * The travel scheduler derives `travelStopReason`'s `nextStep` from the player's
 * position *after* a step plus the following route direction. Extracting that
 * combination here makes it a pure, node-testable function instead of an inline
 * ternary in the renderer; `stepPosition` remains its single-step primitive.
 */
export function nextStepPosition(
  from: Position | undefined,
  direction: Direction | undefined,
): Position | undefined {
  if (from === undefined || direction === undefined) return undefined;
  return stepPosition(from, direction);
}

/**
 * True when `pos` is a legal auto-travel destination: in bounds, explored,
 * passable, and free of any living entity other than the player (change
 * `travel-and-repeat-move`, design D3/D5; task 4.3).
 *
 * This is the travel-mode map tap's "is this tile a destination?" test, and it
 * mirrors `planTravel`'s destination acceptance exactly so the tap handler and
 * the planner cannot disagree. It does **not** test reachability — `planTravel`
 * stays the authority for whether a route exists. The player's own tile is
 * accepted (it is the empty-route start exception), matching the planner.
 */
export function isTravelDestination(
  grid: Grid,
  explored: readonly boolean[],
  entities: Entity[],
  playerId: string,
  pos: Position,
): boolean {
  if (!inBounds(grid, pos)) return false;
  if (explored[indexOf(grid, pos)] !== true) return false;
  if (!isPassable(grid, pos)) return false;
  const occupant = attackTargetAt(entities, pos);
  return occupant === undefined || occupant.id === playerId;
}
