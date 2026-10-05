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
  AttackedEvent,
  BlockedEvent,
  DeathEvent,
  Direction,
  GameEvent,
  ItemPickedUpEvent,
  ItemUsedEvent,
  LevelChangedEvent,
  MovedEvent,
  NoopEvent,
  PlayerDiedEvent,
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
 * Creates a `level-changed` event reporting the depth of the new level (change
 * `levelgen-and-fov`, design D6). The depth is a plain number, so the event is
 * JSON-clean like every other.
 */
export function levelChanged(depth: number): LevelChangedEvent {
  return { type: 'level-changed', depth };
}

/**
 * Creates an `attacked` event reporting one entity hitting another (change
 * `core-gameplay-loop`, design D2/D3). Carries the attacker, the target, the
 * resolved damage amount, and the damage kind as plain data, so the combat spec's
 * "attacker, target, damage dealt" payload is fully serializable.
 *
 * Introduced by Phase 4 for the AI's attacks through the damage registry; Phase
 * 5's player attack path reuses it rather than adding a second shape.
 */
export function attacked(
  attackerId: string,
  targetId: string,
  amount: number,
  kind: string,
): AttackedEvent {
  return { type: 'attacked', attackerId, targetId, amount, kind };
}

/**
 * Creates a `death` event reporting that the entity with `entityId` was removed
 * because its hit points reached zero or below (change `core-gameplay-loop`,
 * design D2; engine/combat spec "Death removes the entity").
 *
 * Only the victim id is carried — the companion to an `attacked` event's damage
 * report — so it stays a minimal plain-data record.
 */
export function death(entityId: string): DeathEvent {
  return { type: 'death', entityId };
}

/**
 * Creates a `player-died` event marking the run as ended (change
 * `core-gameplay-loop`, design D2/D5; engine/combat spec "Player death ends the
 * run (permadeath)"). It carries no payload: the terminal fact is the state's
 * `status === 'dead'`, which the same command sets.
 */
export function playerDied(): PlayerDiedEvent {
  return { type: 'player-died' };
}

/**
 * Creates an `item-picked-up` event reporting the acting entity, the picked-up
 * item's pack id, and the floor entity that was removed (change
 * `core-gameplay-loop`, design D7; engine/command-loop spec "Item pickup
 * command").
 *
 * `itemId` is the pack content id (the value appended to `carriedItemIds`);
 * `entityId` identifies the floor entity that left the world. Both are plain
 * strings, so the event is JSON-clean like every other.
 */
export function itemPickedUp(
  actorId: string,
  itemId: string,
  entityId: string,
): ItemPickedUpEvent {
  return { type: 'item-picked-up', actorId, itemId, entityId };
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
