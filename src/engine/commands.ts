/**
 * Command loop: `applyCommand(state, command, rng) -> { state, events }`.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, tasks 4.2/4.3): the single entry
 * point through which the game advances (design D3). It is a pure function:
 * the input state is never mutated — a new state object is returned with new
 * `entities`/`events` arrays, and every command emits at least one event.
 *
 * Occupancy semantics (M1, deliberate simplification — design D4/risks):
 * any entity occupying the target tile blocks the step. There is no combat and
 * no pass-through; a `move` into an occupied tile is `blocked`. Later stages
 * may refine this to per-entity `solid` flags without changing the signature.
 */

import { entityById, entityAt, isPassable } from './grid';
import { appendEvents, blocked, moved, noop } from './events';
import type { Rng } from './rng';
import type {
  Command,
  Direction,
  Entity,
  GameEvent,
  GameState,
  Position,
} from './types';

/** The successful result of resolving a command. */
export interface CommandResult {
  state: GameState;
  events: GameEvent[];
}

/** Unit step for each direction. North is `-y`, matching screen-style rows. */
function step(direction: Direction): Position {
  switch (direction) {
    case 'north':
      return { x: 0, y: -1 };
    case 'south':
      return { x: 0, y: 1 };
    case 'west':
      return { x: -1, y: 0 };
    case 'east':
      return { x: 1, y: 0 };
  }
}

/**
 * Returns a copy of `entities` with `id`'s position set to `pos`.
 *
 * A full array copy with a shallow entity copy keeps `applyCommand` free of
 * input mutation while leaving extra plain entity properties intact. If the
 * entity is missing, the entities are returned unchanged.
 */
function withEntityAt(
  entities: Entity[],
  id: string,
  pos: Position,
): Entity[] {
  return entities.map((entity) =>
    entity.id === id ? { ...entity, pos: { x: pos.x, y: pos.y } } : entity,
  );
}

/**
 * Resolves a `move` command for the current player entity.
 *
 * Emits `moved` and advances the entity on success, or `blocked` when the
 * target is out-of-bounds, non-passable, or occupied. A missing player entity
 * is a `noop` (nothing to move) rather than a crash.
 */
function applyMove(
  state: GameState,
  direction: Direction,
  rng: Rng,
): CommandResult {
  const entity = entityById(state.entities, state.playerId);
  if (entity === undefined) {
    const events = [noop('no-player-entity')];
    return {
      state: {
        ...state,
        rng: { seed: state.rng.seed, state: rng.state() },
        events: appendEvents(state.events, events),
      },
      events,
    };
  }

  const delta = step(direction);
  const target: Position = {
    x: entity.pos.x + delta.x,
    y: entity.pos.y + delta.y,
  };

  const targetPassable = isPassable(state.grid, target);
  const occupant = entityAt(state.entities, target);

  if (!targetPassable || occupant !== undefined) {
    const events = [blocked(entity.id, direction)];
    return {
      state: {
        ...state,
        rng: { seed: state.rng.seed, state: rng.state() },
        events: appendEvents(state.events, events),
      },
      events,
    };
  }

  const events = [moved(entity.id, entity.pos, target)];
  return {
    state: {
      ...state,
      entities: withEntityAt(state.entities, entity.id, target),
      rng: { seed: state.rng.seed, state: rng.state() },
      events: appendEvents(state.events, events),
    },
    events,
  };
}

/**
 * The single way to advance the game.
 *
 * Accepts the current `state`, a `command`, and the injected `rng`, and returns
 * a **new** state object plus the events emitted by this command. The input
 * state is never mutated, and the emitted events are also appended to the
 * returned state's `events` log in order.
 *
 * Malformed commands (null, non-object, or lacking a string `type`) and unknown
 * command types are reported as invalid via a `noop` event; they never throw and
 * the returned state is equivalent to the input (same grid/entities/playerId/rng,
 * with the log appended). Malformed input is rejected as `malformed-command` so a
 * corrupt or hand-edited serialized log can still be replayed without corruption.
 */
export function applyCommand(
  state: GameState,
  command: Command,
  rng: Rng,
): CommandResult {
  // Shape guard: commands arrive from serialized logs, so a malformed entry
  // (null/non-object/missing string type) must be rejected without throwing.
  if (
    command === null ||
    typeof command !== 'object' ||
    typeof (command as { type?: unknown }).type !== 'string'
  ) {
    const events = [noop('malformed-command')];
    return {
      state: {
        ...state,
        rng: { seed: state.rng.seed, state: rng.state() },
        events: appendEvents(state.events, events),
      },
      events,
    };
  }

  switch (command.type) {
    case 'move':
      return applyMove(state, command.direction, rng);
    default: {
      // Exhaustiveness: with M1's single-variant `Command`, `command` is
      // `never` here. The runtime branch exists for unrecognized types that
      // arrive from serialized logs, so we widen to a structural check.
      const unknown = command as { type: string };
      const events = [noop(`unknown-command:${unknown.type}`)];
      return {
        state: {
          ...state,
          rng: { seed: state.rng.seed, state: rng.state() },
          events: appendEvents(state.events, events),
        },
        events,
      };
    }
  }
}
