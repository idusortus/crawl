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

import {
  attackTargetAt,
  entityById,
  entityAt,
  isFeature,
  isPassable,
  isStairs,
} from './grid';
import { advanceMonsters } from './ai';
import { entityHp, MELEE_DAMAGE_KIND, resolveDamage } from './combat';
import { computeFov, exploreInto, DEFAULT_SIGHT_RADIUS } from './fov';
import { generateLevel, populateLevel } from './level';
import {
  appendEvents,
  attacked,
  blocked,
  death,
  itemPickedUp,
  itemUsed,
  levelChanged,
  moved,
  noop,
  playerDied,
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
  /**
   * The run's lifecycle. Provided only by a lethal resolution (a player-killing
   * attack) to flip the state to `'dead'`; every other branch omits it so the
   * input's `'playing'` status is carried through (design D5).
   */
  status?: GameState['status'];
  /**
   * The player's carried item ids. Provided by `pickup` (append) and by
   * `use-item` (remove one carried instance); every other branch omits it so
   * the input's list is carried through (design D7).
   */
  carriedItemIds?: string[];
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
      ...(overrides.status === undefined ? {} : { status: overrides.status }),
      ...(overrides.carriedItemIds === undefined
        ? {}
        : { carriedItemIds: overrides.carriedItemIds }),
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
 * Resolves a single attack by `attacker` against the living entity in
 * `direction`, applying the shared combat rules for **both** the explicit
 * `attack` command and bump-to-attack (design D2; task 5.2).
 *
 * The caller has already established that the target tile holds a living
 * occupant; this helper performs the resolution itself:
 *
 *  - `resolveDamage(MELEE_DAMAGE_KIND, attacker, target, rng)` draws the seeded
 *    damage. An unregistered kind is a defensive miss → a `noop` (never a throw).
 *  - `attacked` is always emitted with the attacker, target, amount, and kind.
 *  - when the target's HP reaches ≤ 0 it is **removed** from `entities` and a
 *    `death` event is emitted; if the target is the player, the state's `status`
 *    flips to `'dead'` and a `player-died` event is emitted (permadeath).
 *
 * The attacker is never moved, and the input state is never mutated: `entities`
 * is a fresh array and the target update is a shallow copy.
 */
function resolveAttack(
  state: GameState,
  attacker: Entity,
  target: Entity,
  rng: Rng,
): CommandResult {
  const resolution = resolveDamage(
    MELEE_DAMAGE_KIND,
    attacker,
    target,
    rng,
  );
  if (resolution === undefined) {
    return commit(state, rng, [noop('unknown-damage-kind')]);
  }

  const events: GameEvent[] = [
    attacked(
      attacker.id,
      target.id,
      resolution.applied.amount,
      resolution.applied.kind,
    ),
  ];

  // No death: replace the target with its damaged copy, keep everyone else.
  if (entityHp(resolution.targetAfter) > 0) {
    const entities = state.entities.map((entity) =>
      entity.id === target.id ? resolution.targetAfter : entity,
    );
    return commit(state, rng, events, { entities });
  }

  // Death: remove the target from the world.
  const entities = state.entities.filter((entity) => entity.id !== target.id);
  events.push(death(target.id));

  // Player death is terminal: mark the run dead in this same command.
  if (target.id === state.playerId) {
    events.push(playerDied());
    return commit(state, rng, events, { entities, status: 'dead' });
  }

  return commit(state, rng, events, { entities });
}

/**
 * Resolves a `move` command for the current player entity.
 *
 * Emits `moved` and advances the entity on success, or `blocked` when the
 * target is out-of-bounds, non-passable, or occupied. A missing player entity
 * is a `noop` (nothing to move) rather than a crash.
 *
 * Occupancy is classified **totally** (design D4; engine/spatial-grid spec
 * "Occupancy distinguishes living entities from terrain features"):
 *
 *  - **living** occupant (`attackTargetAt`) → **bump-to-attack**: resolve an
 *    attack through the same combat path as the explicit `attack` command; the
 *    player never steps onto the target's tile.
 *  - **feature** tile — a floor item (`isFeature`) or the `level.stairs` tile
 *    (`isStairs`) → **enter**: the step succeeds and the player stands on it.
 *  - **any other non-living occupant** (a wall is handled by `!isPassable`; a
 *    content-free `rock`-like occupant has neither `hp` nor the item
 *    discriminator) → **blocked**.
 *
 * On a successful empty/feature step the tiles visible from the **new** position
 * are OR'd into the `explored` mask (change `levelgen-and-fov` D6 / spatial-grid
 * spec: "Moving reveals on the way"), so exploring is a side effect of
 * movement. A blocked move takes the early `commit` path with no overrides, so
 * `grid`, `level`, and `explored` are all left unchanged apart from the
 * appended event.
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

  // Living occupant: attack instead of moving (bump-to-attack).
  const attackTarget = attackTargetAt(state.entities, target);
  if (attackTarget !== undefined) {
    return resolveAttack(state, entity, attackTarget, rng);
  }

  // Feature tile (floor item or the stairs position): enter it. The occupant
  // check is deliberately separate from passability so a feature on a passable
  // tile is walkable; stairs are not an entity and are detected by position.
  const occupant = entityAt(state.entities, target);
  const featureTile =
    (occupant !== undefined && isFeature(occupant)) ||
    isStairs(target, state.level.stairs);

  if (!isPassable(state.grid, target)) {
    return commit(state, rng, [blocked(entity.id, direction)]);
  }
  // A non-living, non-feature occupant (e.g. a content-free `rock`) blocks.
  if (occupant !== undefined && !featureTile) {
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
 * Resolves an explicit `attack` command in `direction` (design D2; engine/combat
 * spec "Attacking an adjacent entity").
 *
 * Only a **living** occupant is a valid target: the attack resolves through
 * `resolveAttack` (damage, possible death, possible `player-died`). An empty
 * tile, out-of-bounds, a non-passable tile, or a non-living occupant all degrade
 * to a single `noop` without changing the world. Targeting the attacker's own
 * tile is structurally impossible (a cardinal direction is always a different
 * tile), so no self-target branch is needed; a missing player is a `noop` like
 * `move`.
 *
 * The input state is never mutated and an unresolved/unregistered damage kind is
 * a `noop`, never a throw.
 */
function applyAttack(
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

  const targetEntity = attackTargetAt(state.entities, target);
  if (targetEntity === undefined) {
    // Empty / wall / OOB / non-living occupant: no world change.
    return commit(state, rng, [noop('nothing-to-attack')]);
  }

  return resolveAttack(state, entity, targetEntity, rng);
}

/**
 * Resolves a `pickup` command (change `core-gameplay-loop`, phase 6, design D7;
 * engine/command-loop spec "Item pickup command"; engine/item-use spec "Items
 * lie on the floor and can be picked up").
 *
 * The player picks up the floor item on their own tile. Resolution:
 *
 *  - no player entity -> `noop('no-player-entity')` (consistent with `move`);
 *  - no feature item on the player's tile -> `noop('nothing-to-pick-up')`
 *    (empty tile, a wall, or any non-item occupant);
 *  - a feature item on the tile -> remove that one entity from `entities`,
 *    append its `kind` to `carriedItemIds`, and emit `item-picked-up`.
 *
 * The item discriminator (`isFeature`) — not the pack `kind` — decides what is
 * pickable, so this stays pack-free (content-as-data: only the id is recorded,
 * never the resolved entry). The input state is never mutated: `entities` and
 * `carriedItemIds` are fresh arrays.
 */
function applyPickup(state: GameState, rng: Rng): CommandResult {
  const actor = entityById(state.entities, state.playerId);
  if (actor === undefined) {
    return commit(state, rng, [noop('no-player-entity')]);
  }

  const occupant = state.entities.find(
    (entity) =>
      isFeature(entity) &&
      entity.pos.x === actor.pos.x &&
      entity.pos.y === actor.pos.y,
  );
  if (occupant === undefined) {
    return commit(state, rng, [noop('nothing-to-pick-up')]);
  }

  const entities = state.entities.filter((entity) => entity.id !== occupant.id);
  const carriedItemIds = [...state.carriedItemIds, occupant.kind];
  return commit(state, rng, [itemPickedUp(actor.id, occupant.kind, occupant.id)], {
    entities,
    carriedItemIds,
  });
}

/**
 * Resolves a `use-item` command against a loaded pack (change
 * `content-packs-v1`, D6/D7; consumption added by change `core-gameplay-loop`,
 * task 6.2 / design D7).
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
 *
 * **Carry gates consumption, not resolution** (design D7; engine/item-use spec
 * "Using SHALL consume the item ... only when it is carried"). When the id is
 * present in `carriedItemIds`, exactly **one** instance is removed; using a
 * non-carried id still resolves the effect and consumes nothing, so the Stage-2
 * use-by-id behavior stays valid. Removal takes the first matching index, so a
 * duplicated carry shrinks by exactly one occurrence.
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

  // Consume one carried instance only when carried; a non-carried id resolves
  // without changing the carried list (design D7).
  const carriedIndex = state.carriedItemIds.indexOf(itemId);
  const carriedItemIds =
    carriedIndex === -1
      ? state.carriedItemIds
      : [
          ...state.carriedItemIds.slice(0, carriedIndex),
          ...state.carriedItemIds.slice(carriedIndex + 1),
        ];

  return commit(state, rng, [itemUsed(actor.id, itemId, resolution.applied)], {
    entities,
    carriedItemIds,
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
 * Resolves a `descend` command (change `levelgen-and-fov`, design D6; gating +
 * population added by change `core-gameplay-loop`, tasks 7.1/7.2 / design D6).
 *
 * ## Stairs gate (task 7.1)
 *
 * The player must be standing on `state.level.stairs`. When they are not, the
 * command degrades to a single `noop('not-on-stairs')` with **no world change
 * and no generation** — the level, grid, explored mask, entities, and RNG are
 * all left exactly as the input had them (spec: "Descending off the stairs is a
 * no-op"). The gate is checked before `generateLevel`, so an off-stairs attempt
 * never draws from the RNG either.
 *
 * ## On the stairs (task 7.2 / design D6)
 *
 * Generates a level at `state.level.depth + 1` using the injected RNG via
 * `generateLevel` (default generator), then returns a state whose `grid` is the
 * generated terrain, whose `level` is the generated metadata (new depth + spawn
 * + stairs), and whose `explored` mask is **fresh for the new level**: all-false
 * OR'd with the spawn's FOV, so tiles from the previous level cannot leak in
 * (command-loop spec "Level change resets per-level view state").
 *
 * The new level is **populated** with monsters and items when a loaded pack is
 * supplied (`populateLevel(generated, pack, rng)`, sharing the same `Rng`
 * instance generation just consumed — design D6's one-shared-`Rng` contract).
 * The previous level's entities are **discarded** rather than carried over: the
 * new `entities` array is `[player, ...population]`, so no old-level monster or
 * item leaks onto the new floor. The player is repositioned onto the new spawn:
 * generation guarantees `stairs !== spawn`, and `populateLevel` excludes both
 * the spawn and the stairs tile, so the player's spawn is distinct from the
 * stairs and from every monster/item.
 *
 * ## Pack-free vs. pack-aware (documented decision)
 *
 * `applyCommand` (content-free) calls this without a pack, so it generates an
 * **unpopulated** level — preserving its Stage-3 contract that `descend` is
 * content-free and resolvable through **both** entry points. Population is a
 * pack-only concern, so only `applyCommandWithPack` fulfills the spec's "the new
 * level SHALL be populated" requirement; the UI always uses the pack-aware path
 * (`useGame.ts` is the single pack-aware call site). This mirrors the existing
 * `use-item` split: the content-free path cannot resolve content and so degrades
 * to its content-free behavior rather than reaching for an ambient pack.
 *
 * A `level-changed` event carrying the new depth is emitted. The RNG state is
 * threaded back through `commit` (generation + population consume randomness, so
 * it must persist for replay). The input state is never mutated.
 *
 * A missing player entity is a `noop` (nothing to place) rather than a crash —
 * consistent with `move`'s missing-actor handling.
 */
function applyDescend(
  state: GameState,
  rng: Rng,
  pack?: LoadedPack,
): CommandResult {
  const entity = entityById(state.entities, state.playerId);
  if (entity === undefined) {
    return commit(state, rng, [noop('no-player-entity')]);
  }

  // Stairs gate: an off-stairs descend is a pure no-op that never generates.
  if (!isStairs(entity.pos, state.level.stairs)) {
    return commit(state, rng, [noop('not-on-stairs')]);
  }

  const depth = state.level.depth + 1;
  const generated = generateLevel({
    rng,
    width: DESCEND_LEVEL_WIDTH,
    height: DESCEND_LEVEL_HEIGHT,
    depth,
  });

  const spawn = generated.level.spawn;

  // Population shares the SAME `rng` instance generation just consumed (design
  // D6). Without a pack the level is generated unpopulated (content-free path).
  const population =
    pack === undefined ? [] : populateLevel(generated, pack, rng).entities;

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

  // The new level starts fresh: the player is placed at spawn and the previous
  // level's entities are dropped (never carried across levels).
  const player: Entity = { ...entity, pos: { x: spawn.x, y: spawn.y } };
  const entities = [player, ...population];

  return commit(state, rng, [levelChanged(depth)], {
    grid: generated.grid,
    level: generated.level,
    explored,
    entities,
  });
}

// ---------------------------------------------------------------------------
// Turn step + permadeath (design D5; tasks 5.3 / command-loop spec "A turn
// advances monsters after the player acts")
// ---------------------------------------------------------------------------

/**
 * The events that may advance monsters, per the D5 outcome→advance matrix.
 *
 * A command's world-changing events signal whether the turn step runs:
 *
 *  - `moved` (move-empty / walk onto a feature), `item-used` (use-item success),
 *    and `item-picked-up` (pickup success) always advance.
 *  - `attacked` (bump-attack or an explicit attack hit) advances **unless** it
 *    also killed the player — an `attacked` targeting the player is a monster's
 *    attack, never the player's own, so a player-death outcome must not advance.
 *  - `death` (a monster killed by the player) advances: the outcome was a
 *    successful attack-hit, and the step then skips the removed monster.
 *  - `blocked`, `noop`, `player-died`, and `level-changed` never advance.
 *
 * `level-changed` is deliberately **absent**: descend replaces the level
 * atomically, so the current level's monsters are discarded and the new level's
 * monsters are freshly placed and must not act on the descent turn (design D5
 * "the NEW level's monsters do NOT act"; command-loop spec "Descent advances the
 * current level only"). With no surviving current-level monster, the net effect
 * is that no monster acts.
 */
const ADVANCING_EVENT_TYPES = new Set<GameEvent['type']>([
  'moved',
  'attacked',
  'item-used',
  'item-picked-up',
  'death',
]);

/**
 * Decides whether the command just resolved should advance monsters (design D5).
 *
 * Read purely from the command's own events and the resulting status, so the
 * rule is a deterministic function of `(command, prior state)` and replay stays
 * identical. A command that killed the player is inert: no monster gets a free
 * act against a corpse. A successful descend is inert too: the newly generated
 * level's monsters do not act on the turn they were placed.
 */
function shouldAdvance(events: GameEvent[], status: GameState['status']): boolean {
  if (status === 'dead') return false;
  if (events.some((event) => event.type === 'player-died')) return false;
  if (events.some((event) => event.type === 'level-changed')) return false;
  return events.some((event) => ADVANCING_EVENT_TYPES.has(event.type));
}

/**
 * The one place the world advances: resolves `command`, then runs the turn step
 * when the outcome warrants it (design D5; task 5.3).
 *
 * Both public entry points funnel through this wrapper so the shorten-to-one-turn
 * rule and the post-death gate are defined exactly once:
 *
 *  - **Terminal permadeath.** A gameplay command on a `status === 'dead'` state
 *    early-returns `noop('run-over')`; no monsters advance and the state is
 *    equivalent to the input (log appended). Used by both gameplay commands and
 *    noop/malformed ones — permadeath is terminal.
 *  - **Outcome→advance matrix.** After a successful gameplay command the monster
 *    step (`advanceMonsters`) runs once, and it re-reads the run status so it
 *    stops the moment the player dies (e.g. a monster's lethal counter-blow).
 *    A refused/no-op command, a malformed/unknown one, or a death outcome runs no
 *    step.
 *
 * `resolve` is the branch function for a recognized command; it returns the
 * command's own events and world changes. The turn step appends its events after
 * the player's, so an event stream reads player-then-monsters in order.
 */
function advanceTurn(
  state: GameState,
  rng: Rng,
  resolve: () => CommandResult,
): CommandResult {
  // Permadeath is terminal: any command (including malformed) when the run has
  // ended is inert. No RNG draw, no monster step.
  if (state.status === 'dead') {
    return commit(state, rng, [noop('run-over')]);
  }

  const commandResult = resolve();
  if (!shouldAdvance(commandResult.events, commandResult.state.status)) {
    return commandResult;
  }

  // `advanceMonsters` sees the post-command state (so the player's new position
  // and any killed monster are already reflected) and reads its `status` before
  // each monster acts, stopping the instant the player's HP reaches <= 0.
  const monsterStep = advanceMonsters(commandResult.state, rng);

  // The turn step's own events — a monster's `moved`/`attacked`. A lethal
  // counter-attack that drove the player's HP to <= 0 is settled below.
  const turnEvents: GameEvent[] = [...monsterStep.events];
  let entities = monsterStep.entities;
  let status: GameState['status'] = commandResult.state.status;

  // Settle player death caused by a monster during the turn step. `advanceMonsters`
  // lowers the player's HP but does not own the world-level permadeath write
  // (`status`/removal/`player-died`), so the command loop does it here once the
  // step has stopped. This keeps the mid-step stop (no later monster acts on a
  // corpse) and the terminal state in one place.
  const playerAfter = entityById(entities, state.playerId);
  const playerDiedThisTurn =
    playerAfter !== undefined &&
    typeof playerAfter.hp === 'number' &&
    playerAfter.hp <= 0;
  if (status !== 'dead' && (playerAfter === undefined || playerDiedThisTurn)) {
    status = 'dead';
    entities = entities.filter((entity) => entity.id !== state.playerId);
    turnEvents.push(playerDied());
  }

  if (turnEvents.length === 0 && entities === commandResult.state.entities) {
    return commandResult;
  }

  // Write the monsters' entities + events back through `commit` so the RNG state
  // (drawn by monster attacks) is threaded into the returned state and the
  // events are appended after the player's. `commit` only appends `turnEvents`
  // (the new ones); the returned `events` is the full player-then-monster set.
  const committed = commit(commandResult.state, rng, turnEvents, {
    entities,
    ...(status === commandResult.state.status ? {} : { status }),
  });
  return { state: committed.state, events: [...commandResult.events, ...turnEvents] };
}

/**
 * The structural boundary for `pickup` shared by both entry points (task 6.1).
 *
 * `pickup` takes no parameters, so any key beyond `type` is a malformed command
 * (matching the move/attack/use-item "missing/extra params → malformed" rule).
 * A well-formed pickup resolves the real `applyPickup` through the shared
 * `advanceTurn` wrapper, so its success advances monsters per the D5 matrix and
 * its empty-tile noop does not. A missing player is the branch's own noop.
 */
function resolvePickup(
  state: GameState,
  rng: Rng,
  command: unknown,
): CommandResult {
  const record = command as Record<string, unknown>;
  const extraKeys = Object.keys(record).filter((key) => key !== 'type');
  if (extraKeys.length > 0) {
    return advanceTurn(state, rng, () =>
      commit(state, rng, [noop('malformed-command')]),
    );
  }
  return advanceTurn(state, rng, () => applyPickup(state, rng));
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
    return advanceTurn(state, rng, () => commit(state, rng, [noop('malformed-command')]));
  }

  // `pickup` is handled structurally before the `switch` so its malformed-
  // parameter posture (any key beyond `type`) can be checked even though the
  // declared `PickupCommand` only carries `type` (task 6.1). A malformed pickup
  // degrades to `malformed-command`; a well-formed one resolves the real pickup.
  if ((command as { type: string }).type === 'pickup') {
    return resolvePickup(state, rng, command);
  }

  switch (command.type) {
    case 'move':
      // A recognized command with a bad parameter must degrade to a noop, not
      // crash inside `step` (`move` with a missing/unknown direction).
      if (!isValidDirection(command.direction)) {
        return advanceTurn(state, rng, () =>
          commit(state, rng, [noop('malformed-command')]),
        );
      }
      return advanceTurn(state, rng, () =>
        applyMove(state, command.direction, rng),
      );
    case 'attack':
      // The direction is guarded exactly like `move`'s (design D2 / task 5.2).
      if (!isValidDirection(command.direction)) {
        return advanceTurn(state, rng, () =>
          commit(state, rng, [noop('malformed-command')]),
        );
      }
      return advanceTurn(state, rng, () =>
        applyAttack(state, command.direction, rng),
      );
    case 'descend':
      // `descend` is content-free: without a pack it generates an unpopulated
      // level (the pack-free Stage-3 contract), and only `applyCommandWithPack`
      // populates the new level (design D6). It never falls through to the
      // `default` noop.
      return advanceTurn(state, rng, () => applyDescend(state, rng));
    default: {
      // `command` is `never` for a recognized variant, but unrecognized types
      // arrive from serialized logs, so widen to a structural check. The
      // boundary guard above guarantees `.type` is a string here.
      const unknown = command as { type: string };
      return advanceTurn(state, rng, () =>
        commit(state, rng, [noop(`unknown-command:${unknown.type}`)]),
      );
    }
  }
}

/**
 * The pack-aware way to advance the game.
 *
 * Resolves `move`, `attack`, and `descend` exactly as `applyCommand` does
 * (ignoring `pack`), and routes `use-item` through the loaded pack. `move`/`attack`
 * therefore still work without a pack via `applyCommand`, and `use-item` cannot
 * be resolved without one (design D6, option (a): a separate pack-aware entry
 * point).
 *
 * Guarantees mirror `applyCommand` plus the D7 item rules:
 *
 *  - the input state is never mutated; a new state is returned;
 *  - the RNG state is written back into the returned state exactly as the
 *    content-free path does, so a random effect's advance (and monster attacks'
 *    draws) are persisted and replayable;
 *  - unknown item id, unknown effect kind, and missing actor all degrade to a
 *    single `noop` (never a throw);
 *  - malformed commands are still rejected by the same shape guard;
 *  - the same terminal-permadeath gate and D5 turn step apply, because every
 *    branch funnels through `advanceTurn`.
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
    return advanceTurn(state, rng, () => commit(state, rng, [noop('malformed-command')]));
  }

  // Same structural `pickup` handling as the content-free entry point (task
  // 6.1): malformed → `malformed-command`, well-formed → real pickup. `pickup`
  // is content-free, so both entry points resolve it identically.
  if ((command as { type: string }).type === 'pickup') {
    return resolvePickup(state, rng, command);
  }

  switch (command.type) {
    case 'move':
      if (!isValidDirection(command.direction)) {
        return advanceTurn(state, rng, () =>
          commit(state, rng, [noop('malformed-command')]),
        );
      }
      return advanceTurn(state, rng, () =>
        applyMove(state, command.direction, rng),
      );
    case 'attack':
      if (!isValidDirection(command.direction)) {
        return advanceTurn(state, rng, () =>
          commit(state, rng, [noop('malformed-command')]),
        );
      }
      return advanceTurn(state, rng, () =>
        applyAttack(state, command.direction, rng),
      );
    case 'descend':
      // Pack-aware: the new level is populated from the loaded pack (design D6,
      // task 7.2), sharing the RNG instance generation just consumed.
      return advanceTurn(state, rng, () => applyDescend(state, rng, pack));
    case 'use-item':
      // A non-string/empty item id must not reach the pack lookup (which would
      // throw or silently miss); reject it as a malformed command.
      if (typeof command.itemId !== 'string' || command.itemId.length === 0) {
        return advanceTurn(state, rng, () =>
          commit(state, rng, [noop('malformed-command')]),
        );
      }
      return advanceTurn(state, rng, () =>
        applyUseItem(state, command.itemId, rng, pack),
      );
    default: {
      const unknown = command as { type: string };
      return advanceTurn(state, rng, () =>
        commit(state, rng, [noop(`unknown-command:${unknown.type}`)]),
      );
    }
  }
}
