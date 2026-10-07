/**
 * Pure auto-travel path planning and stop predicate for the client (change
 * `travel-and-repeat-move`, design D3/D4; tasks 1.1-1.3).
 *
 * Framework-free — no React, no React Native — so both the planned route and the
 * "should travel stop now?" decision can be unit-tested under the node Vitest
 * environment, exactly like `ranged.ts`/`stairs.ts`/`input.ts`. It imports only
 * the `@engine` public barrel, so the values it derives are presentation-only and
 * never enter `GameState`.
 *
 * Travel is a client scheduler of the existing `move` command (design D1): the
 * planner returns an ordered list of cardinal directions to dispatch one per
 * step, and the stop predicate inspects each step's authoritative
 * `CommandResult` to decide whether to keep walking. The engine, the save
 * format, and replay semantics are untouched — every step is an ordinary logged
 * turn on which monsters act.
 */

import {
  attackTargetAt,
  computeFov,
  coordOf,
  DEFAULT_SIGHT_RADIUS,
  entityById,
  indexOf,
  isLiving,
  isPassable,
  isStairs,
} from '@engine';
import type {
  CommandResult,
  Direction,
  Entity,
  GameEvent,
  GameState,
  Grid,
  Position,
} from '@engine';

/**
 * The fixed cardinal neighbour visit order (design D3 assumption e). Pinning
 * north, east, south, west makes the first-discovered shortest path
 * deterministic; `travel.test.ts` pins the resulting routes so a change to this
 * order is caught.
 */
const NEIGHBOUR_ORDER: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** Unit step for each direction. North is `-y`, matching the engine's `move`. */
const STEP: Readonly<Record<Direction, Position>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/** True when `a` and `b` are the same tile. */
function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The player entity, or `undefined` when the state has no such entity. */
function playerOf(state: GameState): Entity | undefined {
  return entityById(state.entities, state.playerId);
}

/**
 * True when `pos` is a tile auto-travel may stand on: in bounds, explored,
 * passable, and free of any living entity other than the player (design D3).
 *
 * The player's own tile is allowed so the planner can seed the search at the
 * player's position (the "start exception"); every other traversable tile must
 * be unoccupied by a living entity. An item occupant is a feature, not a living
 * entity, so it is traversable — a move onto it is a normal `enter`.
 */
function isTraversable(
  grid: Grid,
  explored: readonly boolean[],
  entities: Entity[],
  pos: Position,
  playerId: string,
): boolean {
  if (!isPassable(grid, pos)) return false;
  if (explored[indexOf(grid, pos)] !== true) return false;
  const occupant = attackTargetAt(entities, pos);
  return occupant === undefined || occupant.id === playerId;
}

/** A planned auto-travel route and the tile travel walks toward (design D1). */
export interface TravelPlan {
  /** The ordered cardinal steps to dispatch, one per turn. */
  route: Direction[];
  /**
   * The tile the route ends on: the chosen destination when it was reachable, or
   * the reachable tile that best approaches it otherwise. `startTravel` threads
   * this into the stop predicate, so reaching the goal reports
   * `destination-reached` rather than `path-blocked`.
   */
  goal: Position;
}

/** The Chebyshev distance between two tiles (the metric the engine uses). */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * The flat index of the visited tile (excluding the player's own start tile)
 * that best approaches `to`, or `undefined` when the visited set has no tile
 * besides the start (change `auto-travel-reliability`, design D1).
 *
 * "Best" is the smallest Chebyshev distance to `to`; the loop visits indices in
 * ascending row-major order and only replaces on a strictly smaller distance, so
 * ties deterministically keep the lowest `y * width + x` index.
 */
function bestApproachIndex(
  grid: Grid,
  visited: readonly boolean[],
  fromIndex: number,
  to: Position,
): number | undefined {
  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < visited.length; index++) {
    if (!visited[index] || index === fromIndex) continue;
    const distance = chebyshev(coordOf(grid, index), to);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Walks the BFS predecessors from `goalIndex` back to `fromIndex` and reverses
 * them into travel order, or `undefined` on a defensive predecessor miss.
 */
function reconstructRoute(
  prev: readonly number[],
  arrivedBy: readonly (Direction | undefined)[],
  fromIndex: number,
  goalIndex: number,
): Direction[] | undefined {
  const route: Direction[] = [];
  let current = goalIndex;
  while (current !== fromIndex) {
    const direction = arrivedBy[current];
    if (direction === undefined) return undefined; // defensive; unreachable
    route.push(direction);
    current = prev[current];
  }
  route.reverse();
  return route;
}

/**
 * Plans an auto-travel route from `from` (the player's tile) toward `to`, or
 * `undefined` when travel cannot begin (change `auto-travel-reliability`, design
 * D1; spec `ui/auto-travel` "Travel plans a deterministic path over explored,
 * passable, unoccupied tiles").
 *
 * A breadth-first search runs over tiles that are simultaneously explored,
 * passable, and free of any living entity (the player's own start tile is
 * excepted). The destination must itself be explored, passable, and unoccupied;
 * otherwise no route is planned. When the destination is reachable, the goal is
 * the destination and the route is the shortest path to it. When the destination
 * is traversable but **not** reachable (an explored-mask fragment), the goal is
 * instead the visited tile that best approaches the destination — minimizing
 * Chebyshev distance, ties to the lowest row-major index — and the route ends on
 * that goal; `undefined` is returned only when no such fallback tile exists.
 *
 * Neighbours are visited in the fixed north/east/south/west order and
 * predecessors reconstruct the ordered steps, so the same inputs always yield
 * the same goal and route. When `from` equals `to` the route is empty — a valid
 * plan that ends travel immediately with no step. The inputs are never mutated.
 */
export function planTravel(
  grid: Grid,
  explored: readonly boolean[],
  entities: Entity[],
  from: Position,
  to: Position,
  playerId: string,
): TravelPlan | undefined {
  // Already at the destination: a valid, empty route (design D3 assumption c).
  if (samePos(from, to)) return { route: [], goal: to };

  // The destination must itself be explored, passable, and unoccupied.
  if (!isTraversable(grid, explored, entities, to, playerId)) return undefined;

  const size = grid.width * grid.height;
  const visited = new Array<boolean>(size).fill(false);
  const prev = new Array<number>(size).fill(-1);
  const arrivedBy = new Array<Direction | undefined>(size).fill(undefined);

  const fromIndex = indexOf(grid, from);
  const toIndex = indexOf(grid, to);
  visited[fromIndex] = true;

  // Breadth-first: every step costs the same, so BFS gives the shortest route.
  const queue: number[] = [fromIndex];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === toIndex) break;
    const currentPos = coordOf(grid, current);
    for (const direction of NEIGHBOUR_ORDER) {
      const delta = STEP[direction];
      const next: Position = {
        x: currentPos.x + delta.x,
        y: currentPos.y + delta.y,
      };
      if (!isTraversable(grid, explored, entities, next, playerId)) continue;
      const nextIndex = indexOf(grid, next);
      if (visited[nextIndex]) continue;
      visited[nextIndex] = true;
      prev[nextIndex] = current;
      arrivedBy[nextIndex] = direction;
      queue.push(nextIndex);
    }
  }

  // Reachable: the goal is the destination. Otherwise fall back to the reachable
  // tile that best approaches it, or refuse when the only visited tile is the
  // player's own (travel cannot begin).
  const goalIndex = visited[toIndex]
    ? toIndex
    : bestApproachIndex(grid, visited, fromIndex, to);
  if (goalIndex === undefined) return undefined;

  const route = reconstructRoute(prev, arrivedBy, fromIndex, goalIndex);
  if (route === undefined) return undefined;
  return { route, goal: coordOf(grid, goalIndex) };
}

/** Why auto-travel stopped after a step (design D4/D5). */
export type TravelStopReason =
  | 'run-ended'
  | 'level-changed'
  | 'attacked'
  | 'destination-reached'
  | 'path-blocked'
  | 'next-step-stairs'
  | 'monster-adjacent'
  | 'monster-visible';

/** Inputs to {@link travelStopReason}. */
export interface TravelStopInput {
  /** The state before the step was dispatched. */
  before: GameState;
  /** The step's authoritative result: the new state plus the events it emitted. */
  after: CommandResult;
  /**
   * The planned goal: the chosen destination when it was reachable, or the
   * best-approach tile otherwise (change `auto-travel-reliability`, design D1).
   */
  destination: Position;
  /**
   * The tile the next planned step would land on, or `undefined` when the route
   * has no remaining step (it was exhausted or interrupted).
   */
  nextStep: Position | undefined;
}

/** True when the step's own events contain an event of `type`. */
function hasEvent(result: CommandResult, type: GameEvent['type']): boolean {
  return result.events.some((event) => event.type === type);
}

/** True when the step's events report an attack against the player. */
function wasPlayerAttacked(result: CommandResult, playerId: string): boolean {
  return result.events.some(
    (event) => event.type === 'attacked' && event.targetId === playerId,
  );
}

/** True when a living monster occupies a cardinal neighbour of `pos`. */
function hasAdjacentLivingMonster(
  entities: Entity[],
  pos: Position,
  playerId: string,
): boolean {
  for (const direction of NEIGHBOUR_ORDER) {
    const delta = STEP[direction];
    const neighbour: Position = { x: pos.x + delta.x, y: pos.y + delta.y };
    const occupant = attackTargetAt(entities, neighbour);
    if (occupant !== undefined && occupant.id !== playerId) return true;
  }
  return false;
}

/**
 * True when any living monster other than the player is visible in the player's
 * field of view, derived with the engine's `computeFov` + `DEFAULT_SIGHT_RADIUS`
 * from the player's current tile (the same derivation the renderer uses).
 */
function hasVisibleLivingMonster(
  state: GameState,
  playerPos: Position,
): boolean {
  const visible = computeFov(state.grid, playerPos, DEFAULT_SIGHT_RADIUS);
  for (const entity of state.entities) {
    if (entity.id === state.playerId) continue;
    if (!isLiving(entity)) continue;
    if (visible[indexOf(state.grid, entity.pos)] === true) return true;
  }
  return false;
}

/**
 * True when auto-travel must **not begin** from the player's current position
 * because danger is already present **and orthogonally adjacent** (change
 * `auto-travel-reliability`, design D2; spec `ui/input-mapping` "Tapping the map
 * in travel mode selects an explored destination").
 *
 * The first travel step could walk into a monster already beside the player, so
 * that case refuses to start. A monster that is merely *visible* but not
 * adjacent does **not** block the start: travel begins and the post-step
 * `monster-visible` stop in {@link travelStopReason} halts it after the step
 * that reveals (or re-reveals) the danger. A missing player is treated as
 * blocked. Pure, so it is unit-tested under node.
 */
export function travelStartBlocked(state: GameState): boolean {
  const player = playerOf(state);
  if (player === undefined) return true;
  return hasAdjacentLivingMonster(state.entities, player.pos, state.playerId);
}

/**
 * Decides whether auto-travel should stop after a step, returning the first
 * matching stop reason or `undefined` to continue (design D4/D5; spec
 * `ui/auto-travel` "Travel stops when the destination is reached or the path is
 * interrupted" / "Travel stops when danger appears").
 *
 * The check order is: run ended, level changed, attacked/took damage,
 * destination reached, path blocked or interrupted, next step would land on the
 * stairs, living monster adjacent, living monster visible. It is a pure function
 * of its inputs — the step's `CommandResult` carries the authoritative events
 * (`blocked`/`attacked`/`level-changed`/`player-died`) and the new state — so the
 * decision is unit-testable without a renderer. It reads `after.events` (the
 * step's own events), never the append-only `after.state.events` log, so an
 * earlier turn's event cannot be mistaken for this step's.
 */
export function travelStopReason(
  input: TravelStopInput,
): TravelStopReason | undefined {
  const { before, after, destination, nextStep } = input;
  const afterPlayer = playerOf(after.state);

  // 1. The run ended (terminal status, permadeath event, or a missing player).
  if (after.state.status !== 'playing') return 'run-ended';
  if (hasEvent(after, 'player-died')) return 'run-ended';
  if (afterPlayer === undefined) return 'run-ended';

  // 2. The level changed (e.g. a descend slipped through).
  if (hasEvent(after, 'level-changed')) return 'level-changed';

  // 3. The player was attacked or took damage.
  if (wasPlayerAttacked(after, after.state.playerId)) return 'attacked';
  const beforePlayer = playerOf(before);
  const beforeHp = beforePlayer?.hp;
  const afterHp = afterPlayer.hp;
  if (
    typeof beforeHp === 'number' &&
    typeof afterHp === 'number' &&
    afterHp < beforeHp
  ) {
    return 'attacked';
  }

  // 4. The destination is reached.
  if (samePos(afterPlayer.pos, destination)) return 'destination-reached';

  // 5. The next step is blocked or the route is interrupted. Prefer the
  //    authoritative `blocked` event, then the "player tile unchanged" fallback,
  //    then a next step that is gone or no longer free.
  if (hasEvent(after, 'blocked')) return 'path-blocked';
  if (beforePlayer !== undefined && samePos(beforePlayer.pos, afterPlayer.pos)) {
    return 'path-blocked';
  }
  if (nextStep === undefined) return 'path-blocked';
  if (
    !isTraversable(
      after.state.grid,
      after.state.explored,
      after.state.entities,
      nextStep,
      after.state.playerId,
    )
  ) {
    return 'path-blocked';
  }

  // 6. The next step would land on the stairs tile; leave descend to the player.
  if (isStairs(nextStep, after.state.level.stairs)) return 'next-step-stairs';

  // 7. A living monster is orthogonally adjacent.
  if (
    hasAdjacentLivingMonster(
      after.state.entities,
      afterPlayer.pos,
      after.state.playerId,
    )
  ) {
    return 'monster-adjacent';
  }

  // 8. A living monster is visible in the field of view.
  if (hasVisibleLivingMonster(after.state, afterPlayer.pos)) {
    return 'monster-visible';
  }

  return undefined;
}
