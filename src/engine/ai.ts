/**
 * Monster AI — a named behavior registry + a per-turn advance step (change
 * `core-gameplay-loop`, design D3/D5).
 *
 * This module has two publics:
 *
 *  1. A **behavior registry**: a small, enumerated map from a behavior id string
 *     to a pure `BehaviorResolver`. V1 registers `chase` and `idle`. A monster's
 *     behavior id is copied onto its entity at spawn (`monster.behavior`, a
 *     plain string) and resolved here; content supplies only the id, never
 *     executable logic (design D3/D9). `resolveBehavior` maps an unknown id to a
 *     **safe `idle` behavior** rather than throwing, so a monster can never be
 *     left without an action.
 *
 *  2. A **per-turn advance step** (`advanceMonsters`): a deterministic function
 *     that iterates the living monsters in their `entities`-array order (spawn
 *     order, stable under serialization) and applies each one's behavior exactly
 *     once. It is the function the command loop will call after a successful
 *     gameplay command (Phase 5 does the wiring) — it is deliberately **not**
 *     wired into `commands.ts` here, so Phase 5's bump-to-attack work does not
 *     collide with this phase.
 *
 * ## Behavior contract
 *
 * `BehaviorResolver = (state, monster, rng) -> { entities, events }`
 *
 * given the **whole** read-only state (needed for the grid, the player position,
 * and occupancy), the acting monster entity, and the injected seeded source. It
 * returns a fresh `entities` array (never mutating the input) plus the events it
 * emitted (≥ 0). All randomness flows through `rng`; no `Math.random`/`Date` is
 * used anywhere in this module (design D3/D6).
 *
 * ## Attacks go through the damage registry
 *
 * An adjacent chase against the player resolves through `combat.ts`'s
 * `resolveDamage(MELEE_DAMAGE_KIND, monster, player, rng)` — the same path the
 * player's own attacks take. Phase 4 ships a final-shaped `combat.ts` (see its
 * header) so this call site never needs to change: Phase 5 adds the death /
 * permadeath wiring around it.
 *
 * ## The death re-read seam
 *
 * The run's lifecycle is `state.status` (`'playing' | 'dead'`). `advanceMonsters`
 * re-reads the **effective** status before each monster acts and stops the moment
 * the player is dead, so a later monster in the same step never gets a free hit
 * on a corpse (design D5). Phase 4 has no world-level permadeath writer yet
 * (Phase 5 owns setting `status = 'dead'`), so `effectiveStatus` treats a player
 * whose working HP has dropped to ≤ 0 as dead too. That makes the
 * stop-on-death ordering testable now; when Phase 5 writes the real status, the
 * check is already correct and needs no signature change.
 *
 * This module is framework-free and deterministic.
 */

import { entityHp, resolveDamage, MELEE_DAMAGE_KIND } from './combat';
import { attacked, moved } from './events';
import { computeFov } from './fov';
import { entityById, isLiving, isPassable } from './grid';
import type { Rng } from './rng';
import type { Entity, GameEvent, GameState, Position } from './types';

/**
 * The radius (Chebyshev) within which a `chase` monster notices the player even
 * if line of sight is blocked. A monster that can see the player via
 * `computeFov` always pursues regardless of distance; this is the additional
 * "within range" sense so a close-by but occluded player is still pursued
 * (design D3).
 */
export const DEFAULT_BEHAVIOR_RANGE = 8;

/**
 * The result of a single behavior resolution: a fresh `entities` array plus the
 * events the behavior emitted. Plain data only — no bundle ever embeds state.
 */
export interface BehaviorResult {
  entities: Entity[];
  events: GameEvent[];
}

/**
 * A pure behavior: given the current state, the acting monster, and the injected
 * RNG, return the post-behavior entities and events. Must not mutate its inputs.
 */
export type BehaviorResolver = (
  state: GameState,
  monster: Entity,
  rng: Rng,
) => BehaviorResult;

/** The cardinal step deltas, in a fixed order used for greedy tie-breaking. */
const CARDINAL_STEPS: readonly Position[] = [
  { x: 0, y: -1 }, // north
  { x: 0, y: 1 }, // south
  { x: -1, y: 0 }, // west
  { x: 1, y: 0 }, // east
];

/** Chebyshev distance between two tiles (the FOV/range metric). */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Returns true when `monster` has line of sight to the player at `playerPos`:
 * the player's tile is marked visible by
 * `computeFov(grid, monster.pos, DEFAULT_BEHAVIOR_RANGE)`.
 */
function playerVisible(
  state: GameState,
  monster: Entity,
  playerPos: Position,
): boolean {
  const visible = computeFov(state.grid, monster.pos, DEFAULT_BEHAVIOR_RANGE);
  return visible[playerPos.y * state.grid.width + playerPos.x] === true;
}

/**
 * Returns a copy of `entities` with `id`'s position set to `pos`. A shallow
 * entity copy preserves every other plain property; the input array is never
 * mutated and a missing id returns the array unchanged.
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
 * Chooses the next tile for a greedy step from `from` toward `to`: the cardinal
 * neighbour that most reduces Chebyshev distance and is both passable and
 * unoccupied. Ties are broken in the fixed `CARDINAL_STEPS` order, so the step
 * is deterministic for a given state. Returns `undefined` when no neighbour is a
 * legal step (blocked), so the caller can leave the monster where it is.
 *
 * This is a single greedy step, not pathfinding: it never moves onto a
 * non-passable or occupied tile, so a monster cannot pass through a wall or
 * another occupant (design D3 / monster-ai spec "does not pass through walls").
 */
function greedyStep(
  state: GameState,
  entities: Entity[],
  from: Position,
  to: Position,
): Position | undefined {
  let best: Position | undefined;
  let bestDistance = chebyshev(from, to);

  for (const delta of CARDINAL_STEPS) {
    const target: Position = { x: from.x + delta.x, y: from.y + delta.y };
    const distance = chebyshev(target, to);
    // Only a tile strictly closer to the player is a candidate; equal distance
    // is a sidestep and is not progress.
    if (distance >= bestDistance) continue;
    if (!isPassable(state.grid, target)) continue;
    if (entityAtIn(entities, target) !== undefined) continue;
    best = target;
    bestDistance = distance;
  }

  return best;
}

/** Occupant lookup against an explicit entity list (no state import cycle). */
function entityAtIn(entities: Entity[], pos: Position): Entity | undefined {
  for (const entity of entities) {
    if (entity.pos.x === pos.x && entity.pos.y === pos.y) return entity;
  }
  return undefined;
}

/**
 * The `idle` behavior: does nothing. Emits no event and returns the entity list
 * unchanged (a fresh array, so callers can treat the result uniformly). This is
 * also the **safe default** for an unknown behavior id (design D3).
 */
function resolveIdle(
  state: GameState,
  _monster: Entity,
  _rng: Rng,
): BehaviorResult {
  return { entities: state.entities, events: [] };
}

/**
 * The `chase` behavior: if the player is visible (line of sight) or within
 * `DEFAULT_BEHAVIOR_RANGE`, take one greedy step toward the player over passable,
 * unoccupied tiles; if adjacent (Chebyshev distance 1) attack the player through
 * the damage registry instead of stepping. When the player is neither visible nor
 * in range, do nothing.
 *
 * The attack resolves `resolveDamage(MELEE_DAMAGE_KIND, monster, player, rng)`,
 * which reduces the player's HP by a seeded amount. If the damage kind were ever
 * unregistered (it is not in v1), the attack degrades to no-op rather than
 * throwing. The monster never mutates the input state; a return is always a
 * fresh `entities` array.
 */
function resolveChase(
  state: GameState,
  monster: Entity,
  rng: Rng,
): BehaviorResult {
  const player = entityById(state.entities, state.playerId);
  // A missing player entity means there is nothing to chase; stay put.
  if (player === undefined) return { entities: state.entities, events: [] };

  const distance = chebyshev(monster.pos, player.pos);
  const seesPlayer = playerVisible(state, monster, player.pos);
  const inRange = distance <= DEFAULT_BEHAVIOR_RANGE;

  // Not aware of the player: idle.
  if (!seesPlayer && !inRange) return { entities: state.entities, events: [] };

  // Adjacent: attack through the combat registry rather than stepping onto the
  // player's tile.
  if (distance === 1) {
    const resolution = resolveDamage(
      MELEE_DAMAGE_KIND,
      monster,
      player,
      rng,
    );
    if (resolution === undefined) return { entities: state.entities, events: [] };
    const entities = state.entities.map((entity) =>
      entity.id === player.id ? resolution.targetAfter : entity,
    );
    // Emit the final-shaped `attacked` event through the shared factory; Phase 5
    // reuses the same event for the player's attacks.
    return {
      entities,
      events: [
        attacked(
          monster.id,
          player.id,
          resolution.applied.amount,
          resolution.applied.kind,
        ),
      ],
    };
  }

  // Otherwise step greedily toward the player if a legal step exists.
  const next = greedyStep(state, state.entities, monster.pos, player.pos);
  if (next === undefined) return { entities: state.entities, events: [] };

  const entities = withEntityAt(state.entities, monster.id, next);
  return {
    entities,
    events: [moved(monster.id, monster.pos, next)],
  };
}

/**
 * The behavior registry: behavior id -> resolver.
 *
 * A plain object (not a `Map`) is deliberate: module-owned data, never part of
 * game state. A pack names a behavior id; adding a behavior is one entry here,
 * never pack-supplied code (design D3/D9).
 */
export const behaviorRegistry: Record<string, BehaviorResolver> = {
  chase: resolveChase,
  idle: resolveIdle,
};

/**
 * Resolves a behavior by id.
 *
 * An **unknown id returns the safe `idle` behavior** (never throws), so a monster
 * whose behavior was authored with a typo or from a newer pack degrades to doing
 * nothing rather than crashing the turn (design D3 / monster-ai spec "An unknown
 * behavior id is handled safely").
 */
export function resolveBehavior(id: string): BehaviorResolver {
  return behaviorRegistry[id] ?? resolveIdle;
}

/**
 * A monster entity is any **living** entity that is not the player. "Living" for
 * turn purposes additionally requires HP > 0: `grid.isLiving` only means "has a
 * numeric hp", so a monster reduced to 0 or below (e.g. killed earlier) must not
 * act.
 */
function isMonster(state: GameState, entity: Entity): boolean {
  return entity.id !== state.playerId && isLiving(entity) && entityHp(entity) > 0;
}

/**
 * Computes the effective run status from the state plus the working entity list.
 *
 * Phase 4 has no world-level death writer (Phase 5 sets `status = 'dead'` and
 * removes the entity), so in addition to the persisted status this treats a
 * player whose working HP has reached ≤ 0 as dead. The advance step uses this to
 * stop the moment the player is killed mid-turn; when Phase 5 writes the real
 * status the same check still holds (design D5).
 */
function effectiveStatus(
  status: GameState['status'],
  entities: Entity[],
  playerId: string,
): GameState['status'] {
  if (status === 'dead') return 'dead';
  const player = entityById(entities, playerId);
  if (player === undefined) return 'dead';
  const hp = player.hp;
  return typeof hp === 'number' && hp <= 0 ? 'dead' : 'playing';
}

/**
 * The per-turn advance step: every living monster acts exactly once, in
 * `entities`-array order (spawn order, stable under serialization).
 *
 * Contract (design D3/D5):
 *
 *  - **Deterministic order**: iterate the monsters in `state.entities` order.
 *  - **Every living monster acts once**: a monster alive at the start of the step
 *    that is still alive when its turn comes acts exactly once.
 *  - **Dead monsters do not act**: an entity that is no longer living (removed or
 *    reduced to ≤ 0 HP by an earlier step) is skipped.
 *  - **Stop on player death**: before each monster acts, the effective status is
 *    re-read; once the player is dead, no further monster acts.
 *  - **Pure**: the input state is never mutated; a fresh `entities` array and the
 *    appended events are returned.
 *
 * It is intentionally **not** wired into `commands.ts` by this phase — Phase 5
 * calls it after a successful gameplay command per the D5 outcome→advance matrix.
 * The signature is the stable seam: `advanceMonsters(state, rng) -> { entities,
 * events }`.
 */
export function advanceMonsters(state: GameState, rng: Rng): BehaviorResult {
  // Already over: no monster acts (permadeath is terminal).
  if (effectiveStatus(state.status, state.entities, state.playerId) === 'dead') {
    return { entities: state.entities, events: [] };
  }

  const events: GameEvent[] = [];
  let entities = state.entities;

  // Snapshot the acting order from the *input* entities so an entity removed
  // mid-step cannot shift later monsters' turns; each id is re-resolved against
  // the working list below (dead monsters are skipped).
  const actingOrder = entities
    .filter((entity) => isMonster(state, entity))
    .map((entity) => entity.id);

  for (const monsterId of actingOrder) {
    // Re-read death each iteration: once the player is dead, stop advancing.
    if (effectiveStatus(state.status, entities, state.playerId) === 'dead') {
      break;
    }

    const monster = entityById(entities, monsterId);
    // Skip a monster that died (or was removed) earlier in this same step.
    if (monster === undefined || !isMonster(state, monster)) continue;

    const resolver = resolveBehavior(
      typeof monster.behavior === 'string' ? monster.behavior : 'idle',
    );
    // Behaviors are pure functions of a `GameState`. To chain monsters within one
    // step, hand each one an intermediate state carrying the entities produced so
    // far — never the original `state`, or an earlier monster's move would be
    // discarded by the next resolver. The intermediate state is a fresh object
    // and the input `state` is never mutated.
    const stepState: GameState = { ...state, entities };
    const result = resolver(stepState, monster, rng);
    entities = result.entities;
    for (const event of result.events) events.push(event);
  }

  return { entities, events };
}
