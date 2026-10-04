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
import { computeFov, exploreInto, DEFAULT_SIGHT_RADIUS } from './fov';
import { generateLevel } from './level';
import {
  appendEvents,
  blocked,
  itemUsed,
  levelChanged,
  moved,
  noop,
} from './events';
import { resolveEffect } from './effects';
import type { LoadedPack } from './pack';
import type { PackItem } from './schema/pack';
import type { Rng } from './rng';
import type {
  Command,
  Direction,
  Entity,
  GameEvent,
  GameState,
  Grid,
  Level,
  Position,
} from './types';

/** The successful result of resolving a command. */
export interface CommandResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Optional world-state overrides for `commit`. Each field, when present,
 * replaces the corresponding top-level field of the returned state; an omitted
 * field leaves the input's value in place. This is what lets a command replace
 * `entities` (as `move`/`use-item` do) **or** swap in an entirely new level
 * (as `descend` does) through one centralized write-back path, so the
 * RNG-threading and append-only-log invariants are still defined in exactly one
 * place (M1 design D3; change `levelgen-and-fov` D6).
 */
interface StateOverrides {
  entities?: Entity[];
  grid?: Grid;
  level?: Level;
  explored?: boolean[];
}

/**
 * Writes the live `rng` state back into `state`, applies any world-state
 * overrides, and appends `events` to the log, returning a new state. Every
 * command branch funnels through this so the RNG-threading and append-only-log
 * invariants are defined in exactly one place (M1 design D3; change
 * `content-packs-v1` D7; generalized by change `levelgen-and-fov` D6).
 *
 * Omitted override fields leave `state`'s value untouched (`noop`/`blocked`
 * paths pass none); provided fields replace the corresponding top-level field
 * with a fresh value. The input `state` is never mutated.
 */
function commit(
  state: GameState,
  rng: Rng,
  events: GameEvent[],
  overrides: StateOverrides = {},
): CommandResult {
  return {
    state: {
      ...state,
      ...(overrides.entities === undefined
        ? {}
        : { entities: overrides.entities }),
      ...(overrides.grid === undefined ? {} : { grid: overrides.grid }),
      ...(overrides.level === undefined ? {} : { level: overrides.level }),
      ...(overrides.explored === undefined
        ? {}
        : { explored: overrides.explored }),
      rng: { seed: state.rng.seed, state: rng.state() },
      events: appendEvents(state.events, events),
    },
    events,
  };
}

/**
 * Narrows an unknown value to a `Direction`.
 *
 * Commands arrive from serialized logs, so a recognized command can still carry
 * a bad parameter (e.g. `{ type: 'move', direction: 'northwest' }`, or a missing
 * direction). This guard lets the command boundary degrade such entries to a
 * `noop` instead of reaching `step`/`delta.x` and throwing (M1's malformed-command
 * posture, extended from the command *shape* to its *parameters*).
 */
function isValidDirection(value: unknown): value is Direction {
  return (
    value === 'north' ||
    value === 'south' ||
    value === 'east' ||
    value === 'west'
  );
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
 *
 * On success the tiles visible from the **new** position are OR'd into the
 * `explored` mask (change `levelgen-and-fov` D6 / spatial-grid spec: "Moving
 * reveals on the way"), so exploring is a side effect of movement. A blocked
 * move takes the early `commit` path with no overrides, so `grid`, `level`, and
 * `explored` are all left unchanged apart from the appended event.
 */
function applyMove(
  state: GameState,
  direction: Direction,
  rng: Rng,
): CommandResult {
  const entity = entityById(state.entities, state.playerId);
  if (entity === undefined) {
    return commit(state, rng, [noop('no-player-entity')]);
  }

  const delta = step(direction);
  const target: Position = {
    x: entity.pos.x + delta.x,
    y: entity.pos.y + delta.y,
  };

  const targetPassable = isPassable(state.grid, target);
  const occupant = entityAt(state.entities, target);

  if (!targetPassable || occupant !== undefined) {
    return commit(state, rng, [blocked(entity.id, direction)]);
  }

  // Discovery is derived from the new tile only; previously explored tiles are
  // retained by the OR (`exploreInto` is monotonic).
  const visible = computeFov(state.grid, target, DEFAULT_SIGHT_RADIUS);
  const explored = exploreInto(state.explored, visible);

  return commit(state, rng, [moved(entity.id, entity.pos, target)], {
    entities: withEntityAt(state.entities, entity.id, target),
    explored,
  });
}

/**
 * Resolves a `use-item` command against a loaded pack (change
 * `content-packs-v1`, D6/D7).
 *
 * The acting entity is `state.playerId`. Every failure mode degrades to a
 * single `noop` (never a throw), matching M1's malformed-command posture:
 *
 *  - no player entity  -> `noop('no-player-entity')`
 *  - unknown item id   -> `noop('unknown-item:<id>')`
 *  - unknown effect    -> `noop('unknown-effect:<kind>')`
 *
 * On success the effect is resolved by the registry, applied to a **copy** of
 * the actor (the input entity is never mutated), the new entity array replaces
 * the old one, the RNG state is written back, and an `item-used` event is
 * appended to the log. A successful random effect advances the RNG; a
 * deterministic one leaves it untouched (the resolver simply does not draw).
 */
function applyUseItem(
  state: GameState,
  itemId: string,
  rng: Rng,
  pack: LoadedPack,
): CommandResult {
  const actor = entityById(state.entities, state.playerId);
  if (actor === undefined) {
    // A noop must not advance the RNG, so nothing was drawn (commit writes the
    // current — unchanged — rng state back, which is equivalent to the input).
    return commit(state, rng, [noop('no-player-entity')]);
  }

  let item: PackItem;
  try {
    item = pack.item(itemId);
  } catch {
    // `LoadedPack.item` reports an unknown id by throwing `UnknownContentIdError`
    // (design D5). At the command boundary that is a noop, not a crash.
    return commit(state, rng, [noop(`unknown-item:${itemId}`)]);
  }

  const resolution = resolveEffect(item.effect.kind, actor, item.effect, rng);
  if (resolution === undefined) {
    return commit(state, rng, [noop(`unknown-effect:${item.effect.kind}`)]);
  }

  const entities = state.entities.map((entity) =>
    entity.id === actor.id ? resolution.actorAfter : entity,
  );
  return commit(state, rng, [itemUsed(actor.id, itemId, resolution.applied)], {
    entities,
  });
}

/**
 * The dimensions of a generated dungeon level (see the decision below).
 *
 * `descend` does not carry dimensions, and reusing the current grid's size would
 * couple level size to whatever fixture a caller happened to start with.
 * Instead every descended level is generated at a fixed, documented size:
 * **40 wide × 30 tall** — large enough for the BSP partitioner to produce
 * several rooms (comfortably above `MIN_LEAF_FOR_SPLIT` on both axes) while
 * staying small for v1 FOV/serialization costs. Starting levels may differ (a
 * hand-built fixture), but the dungeon below depth 1 is uniform.
 */
const DESCEND_LEVEL_WIDTH = 40;
const DESCEND_LEVEL_HEIGHT = 30;

/**
 * Resolves a `descend` command (change `levelgen-and-fov`, design D6).
 *
 * Generates a level at `state.level.depth + 1` using the injected RNG via
 * `generateLevel` (default generator), then returns a state whose `grid` is the
 * generated terrain, whose `level` is the generated metadata (new depth +
 * spawn), and whose `explored` mask is **fresh for the new level**: all-false
 * OR'd with the spawn's FOV, so tiles from the previous level cannot leak in
 * (D5 / command-loop spec "Level change resets per-level view state"). The
 * player entity is repositioned onto the new spawn.
 *
 * A `level-changed` event carrying the new depth is emitted. The RNG state is
 * threaded back through `commit` (generation consumes randomness, so it must
 * persist for replay). The input state is never mutated.
 *
 * A missing player entity is a `noop` (nothing to place) rather than a crash —
 * consistent with `move`'s missing-actor handling.
 */
function applyDescend(state: GameState, rng: Rng): CommandResult {
  const entity = entityById(state.entities, state.playerId);
  if (entity === undefined) {
    return commit(state, rng, [noop('no-player-entity')]);
  }

  const depth = state.level.depth + 1;
  const generated = generateLevel({
    rng,
    width: DESCEND_LEVEL_WIDTH,
    height: DESCEND_LEVEL_HEIGHT,
    depth,
  });

  const spawn = generated.level.spawn;
  const visible = computeFov(
    generated.grid,
    spawn,
    DEFAULT_SIGHT_RADIUS,
  );
  const explored = exploreInto(
    new Array<boolean>(generated.grid.width * generated.grid.height).fill(
      false,
    ),
    visible,
  );

  return commit(state, rng, [levelChanged(depth)], {
    grid: generated.grid,
    level: generated.level,
    explored,
    entities: withEntityAt(state.entities, entity.id, spawn),
  });
}

/**
 * The single way to advance the game for content-free commands.
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
 *
 * `use-item` needs content, so it is resolved by `applyCommandWithPack`; this
 * entry point rejects it as `unknown-command:use-item` rather than reaching for
 * an ambient pack (design D6). That keeps `move` — and every M1 caller — working
 * with no pack in scope.
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
    return commit(state, rng, [noop('malformed-command')]);
  }

  switch (command.type) {
    case 'move':
      // A recognized command with a bad parameter must degrade to a noop, not
      // crash inside `step` (`move` with a missing/unknown direction).
      if (!isValidDirection(command.direction)) {
        return commit(state, rng, [noop('malformed-command')]);
      }
      return applyMove(state, command.direction, rng);
    case 'descend':
      // `descend` is content-free and parameterless, so it resolves here as
      // well as in `applyCommandWithPack` (design D6). It never falls through
      // to the `default` noop.
      return applyDescend(state, rng);
    default: {
      // `command` is `never` for a recognized variant, but unrecognized types
      // arrive from serialized logs, so widen to a structural check. The
      // boundary guard above guarantees `.type` is a string here.
      const unknown = command as { type: string };
      return commit(state, rng, [noop(`unknown-command:${unknown.type}`)]);
    }
  }
}

/**
 * The pack-aware way to advance the game.
 *
 * Resolves `move` exactly as `applyCommand` does (ignoring `pack`), and routes
 * `use-item` through the loaded pack. `move` therefore still works without a
 * pack via `applyCommand`, and `use-item` cannot be resolved without one
 * (design D6, option (a): a separate pack-aware entry point).
 *
 * Guarantees mirror `applyCommand` plus the D7 item rules:
 *
 *  - the input state is never mutated; a new state is returned;
 *  - the RNG state is written back into the returned state exactly as `move`
 *    does, so a random effect's advance is persisted and replayable;
 *  - unknown item id, unknown effect kind, and missing actor all degrade to a
 *    single `noop` (never a throw);
 *  - malformed commands are still rejected by the same shape guard.
 */
export function applyCommandWithPack(
  state: GameState,
  command: Command,
  rng: Rng,
  pack: LoadedPack,
): CommandResult {
  if (
    command === null ||
    typeof command !== 'object' ||
    typeof (command as { type?: unknown }).type !== 'string'
  ) {
    return commit(state, rng, [noop('malformed-command')]);
  }

  switch (command.type) {
    case 'move':
      if (!isValidDirection(command.direction)) {
        return commit(state, rng, [noop('malformed-command')]);
      }
      return applyMove(state, command.direction, rng);
    case 'descend':
      // Content-free: same resolution as `applyCommand`, so a UI that supplies
      // a pack for `use-item` can still descend (design D6).
      return applyDescend(state, rng);
    case 'use-item':
      // A non-string/empty item id must not reach the pack lookup (which would
      // throw or silently miss); reject it as a malformed command.
      if (typeof command.itemId !== 'string' || command.itemId.length === 0) {
        return commit(state, rng, [noop('malformed-command')]);
      }
      return applyUseItem(state, command.itemId, rng, pack);
    default: {
      const unknown = command as { type: string };
      return commit(state, rng, [noop(`unknown-command:${unknown.type}`)]);
    }
  }
}
