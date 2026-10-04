/**
 * Event constructors + append-only event log.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 4.1): events are the sole
 * description of "what happened" for a command (design D3). They are plain,
 * JSON-clean discriminated objects — no classes, functions, or `Map`/`Set`.
 *
 * The log helper is append-only by construction: it returns a new array and
 * only ever adds to the end, so events are never removed or reordered.
 */

import type {
  BlockedEvent,
  Direction,
  GameEvent,
  ItemUsedEvent,
  MovedEvent,
  NoopEvent,
  Position,
} from './types';

/** Creates a `moved` event for a successful step. */
export function moved(
  entityId: string,
  from: Position,
  to: Position,
): MovedEvent {
  return {
    type: 'moved',
    entityId,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
  };
}

/** Creates a `blocked` event for a refused step. */
export function blocked(
  entityId: string,
  direction: Direction,
): BlockedEvent {
  return { type: 'blocked', entityId, direction };
}

/** Creates a `noop` event for a command that had no world effect. */
export function noop(reason: string): NoopEvent {
  return { type: 'noop', reason };
}

/**
 * Creates an `item-used` event reporting the acting entity, the item id, and
 * the plain-data effect that was applied (change `content-packs-v1`, D7).
 *
 * The effect is copied field-by-field into a fresh object so callers cannot
 * alias or mutate it through the event (matching `moved`'s position copying).
 */
export function itemUsed(
  actorId: string,
  itemId: string,
  effect: { kind: string; amount: number },
): ItemUsedEvent {
  return {
    type: 'item-used',
    actorId,
    itemId,
    effect: { kind: effect.kind, amount: effect.amount },
  };
}

/**
 * Appends `incoming` events to `log`, returning a new array.
 *
 * Append-only: `log` itself is never mutated, no entry is ever removed, and
 * the relative order of existing entries is preserved. `incoming` is appended
 * in the order given (no sorting).
 */
export function appendEvents(
  log: GameEvent[],
  incoming: GameEvent[],
): GameEvent[] {
  return [...log, ...incoming];
}
