/**
 * Engine types
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 3.1): strictly JSON-clean
 * plain-data types. Everything here is deliberately free of class instances,
 * functions, `Map`/`Set`, and `undefined`-as-meaningful-values so that
 * `JSON.stringify`/`JSON.parse` is a lossless save/replay primitive
 * (design D4/D5).
 *
 * This module must stay framework-free and dependency-free.
 */

/** A cardinal direction on the 2D grid. */
export type Direction = 'north' | 'south' | 'east' | 'west';

/** An integer tile coordinate. Both fields are plain numbers. */
export interface Position {
  x: number;
  y: number;
}

/**
 * A plain-data entity: a stable id, a content kind, a position, and any number
 * of additional primitive/plain properties. No behavior lives here (design D4).
 *
 * Extra properties MUST themselves be JSON-clean (primitives, plain objects,
 * or arrays thereof).
 */
export interface Entity {
  id: string;
  kind: string;
  pos: Position;
  [key: string]: unknown;
}

/**
 * A bounded 2D grid of tiles.
 *
 * `passable` is a flat row-major array of length `width * height`; index
 * `y * width + x` holds tile `(x, y)`'s passability. A flat array (rather than
 * a nested array or a `Map`) keeps the grid JSON-clean and cheap to serialize.
 */
export interface Grid {
  width: number;
  height: number;
  passable: boolean[];
}

/**
 * Serializable RNG state.
 *
 * `seed` records the run's original seed (for provenance/replay metadata);
 * `state` is the current internal generator state and is what resume relies on.
 */
export interface RngState {
  seed: number;
  state: number;
}

/** A single tile step command. The command discriminated union, M1 version. */
export interface MoveCommand {
  type: 'move';
  direction: Direction;
}

/**
 * A command to use an item, named by id (change `content-packs-v1`, D7).
 *
 * The command carries only the id — content is never embedded in state or in
 * the command (design D1). Resolving the id to an effect requires a loaded
 * pack, so `use-item` is handled by the pack-aware command entry point; `move`
 * continues to resolve without a pack (design D6).
 */
export interface UseItemCommand {
  type: 'use-item';
  itemId: string;
}

/** Every command the engine understands. Extended as new actions land. */
export type Command = MoveCommand | UseItemCommand;

/** Emitted when an entity successfully steps into a new tile. */
export interface MovedEvent {
  type: 'moved';
  entityId: string;
  from: Position;
  to: Position;
}

/** Emitted when a step is refused (non-passable / out-of-bounds / occupied). */
export interface BlockedEvent {
  type: 'blocked';
  entityId: string;
  direction: Direction;
}

/** Emitted when a command has no world effect. */
export interface NoopEvent {
  type: 'noop';
  reason: string;
}

/**
 * Emitted when an entity successfully uses an item (change `content-packs-v1`,
 * D7). Carries the acting entity, the item id, and the effect that was applied
 * as plain data, so it is fully serializable and records the actual outcome
 * (e.g. the rolled heal amount, not the range).
 *
 * `effect` mirrors `AppliedEffect` from `effects.ts` structurally. It is
 * inlined here rather than imported to keep `types.ts` dependency-free — the
 * engine's type module must not import the effect module (or vice versa).
 */
export interface ItemUsedEvent {
  type: 'item-used';
  actorId: string;
  itemId: string;
  effect: { kind: string; amount: number };
}

/** Discriminated union of everything a command can report (design D3). */
export type GameEvent =
  | MovedEvent
  | BlockedEvent
  | NoopEvent
  | ItemUsedEvent;

/**
 * The complete, JSON-serializable game state.
 *
 * `rng.state` is advanced only through the command loop; helpers in `rng.ts`
 * operate on an `Rng` instance created from these fields (design D2).
 */
export interface GameState {
  grid: Grid;
  entities: Entity[];
  playerId: string;
  rng: RngState;
  events: GameEvent[];
}
