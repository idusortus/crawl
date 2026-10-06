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
 *
 * `item` is an explicit **item discriminator** (change `core-gameplay-loop`,
 * design D1/D4): a floor item is an entity carrying `item: true`. It is
 * optional and present only on items, so occupancy can classify an item without
 * resolving its pack `kind` (the content-free path cannot resolve a kind). It is
 * never inferred from `kind` — `kind` is a pack id the engine treats as opaque.
 */
export interface Entity {
  id: string;
  kind: string;
  pos: Position;
  /** Present only on floor items; the engine's pack-free item discriminator. */
  item?: true;
  [key: string]: unknown;
}

/**
 * A bounded 2D grid of tiles.
 *
 * `passable` is a flat row-major array of length `width * height`; index
 * `y * width + x` holds tile `(x, y)`'s passability. A flat array (rather than
 * a nested array or a `Map`) keeps the grid JSON-clean and cheap to serialize.
 *
 * This indexing convention is shared by every flat per-tile array in state
 * (notably `GameState.explored`): a tile's flat index is always `y * width + x`
 * for a grid of the same dimensions (design D1).
 */
export interface Grid {
  width: number;
  height: number;
  passable: boolean[];
}

/**
 * Metadata for the level the player is currently on (change
 * `levelgen-and-fov`, design D1).
 *
 * The level's terrain stays in `GameState.grid` — `Grid` itself is unchanged so
 * existing consumers keep working. This object records only the progression
 * metadata: how deep the player is, where they spawned, and where the stairs
 * are. It is plain data (numbers + `Position`s) and therefore JSON-clean.
 *
 * `stairs` was added by change `core-gameplay-loop` (design D1/D6): it is the
 * passable tile that gates `descend` and is distinct from `spawn`. Like `spawn`
 * it is metadata on `Level`, never an entity — terrain features live in one
 * place (the level), so the grid stays a pure terrain/occupancy view.
 */
export interface Level {
  /** 1-based dungeon depth; a freshly generated level is at least 1. */
  depth: number;
  /** The tile the player was placed on when entering this level. */
  spawn: Position;
  /** The tile the player must stand on to descend to the next level. */
  stairs: Position;
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

/**
 * A command to descend to the next dungeon level (change `levelgen-and-fov`,
 * design D6).
 *
 * It is deliberately parameterless in v1: the engine decides the next depth
 * (`current + 1`) and generates the new level from the injected RNG. Because it
 * carries no content reference it is resolved by **both** command entry points
 * (`applyCommand` and `applyCommandWithPack`), so a UI that uses the pack-aware
 * entry point for `use-item` can still descend.
 */
export interface DescendCommand {
  type: 'descend';
}

/**
 * A command to attack the entity in a cardinal direction (change
 * `core-gameplay-loop`, design D2; engine/combat spec "Attacking an adjacent
 * entity").
 *
 * The direction is guarded exactly like `move`'s: a missing or unknown direction
 * degrades to `noop('malformed-command')` rather than reaching the combat path.
 * Unlike `move`, an attack **never** relocates the attacker: it resolves against
 * the tile's living occupant (reducing HP and possibly killing it), and any tile
 * that is empty, out of bounds, non-passable, or holds a non-living occupant
 * degrades to a `noop` without changing the world. Targeting one's own tile is
 * structurally impossible because a cardinal direction is always a different
 * tile from the attacker's.
 */
export interface AttackCommand {
  type: 'attack';
  direction: Direction;
}

/**
 * A command to fire the equipped ranged weapon at an explicit target tile
 * (change `mobile-client-playability`, design D3; engine/combat spec "Ranged
 * attack resolved against an explicit target"; engine/command-loop spec "Ranged
 * attack command").
 *
 * It carries only the target `Position` — content is referenced by id through
 * the loaded pack, never embedded (design D3/D8). Resolving the weapon's range
 * and damage requires pack data, so `ranged-attack` is resolved only by
 * `applyCommandWithPack`; the content-free `applyCommand` rejects it as
 * `unknown-command:ranged-attack` rather than reaching for an ambient pack. A
 * missing or non-numeric target degrades to `noop('malformed-command')`.
 */
export interface RangedAttackCommand {
  type: 'ranged-attack';
  target: Position;
}

/**
 * A command to pick up the floor item on the player's tile (change
 * `core-gameplay-loop`, design D7; engine/item-use spec "Items lie on the floor
 * and can be picked up" and engine/command-loop spec "Item pickup command").
 *
 * It is deliberately parameterless in v1 — the engine reads the player's tile
 * from state, so the command log records intent ("pick up") without duplicating
 * positional data that could drift from the state. It carries no content
 * reference, so it resolves through **both** command entry points. Any extra
 * parameter beyond `type` is structurally malformed and degrades to
 * `noop('malformed-command')`.
 */
export interface PickupCommand {
  type: 'pickup';
}

/**
 * A command to pass a turn without acting, backing the client's "wait turn"
 * control.
 *
 * The player stays on their current tile and the turn advances exactly once, so
 * the monsters get their turn — the deterministic "wait / pass" action a client
 * needs to let the world move without committing to a move, attack, or item.
 *
 * Like `pickup`, it is deliberately parameterless in v1. The engine reads the
 * player's tile from state, so any extra parameter beyond `type` is structurally
 * malformed and degrades to `noop('malformed-command')` without advancing. It
 * carries no content reference, so it resolves through **both** command entry
 * points.
 */
export interface WaitCommand {
  type: 'wait';
}

/** Every command the engine understands. Extended as new actions land. */
export type Command =
  | MoveCommand
  | UseItemCommand
  | DescendCommand
  | AttackCommand
  | RangedAttackCommand
  | PickupCommand
  | WaitCommand;

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

/**
 * Emitted when the player descends to a newly generated level (change
 * `levelgen-and-fov`, design D6).
 *
 * Carries the **new** depth as a plain number so the event stream alone
 * describes progression; it is fully JSON-clean and appended to the log like
 * every other event.
 */
export interface LevelChangedEvent {
  type: 'level-changed';
  depth: number;
}

/**
 * Emitted when one entity attacks another (change `core-gameplay-loop`, design
 * D2/D3). Carries the attacker, the target, the resolved damage amount, and the
 * damage kind — exactly the "attacker, target, damage dealt" payload the combat
 * spec requires, as plain JSON-clean fields.
 *
 * Introduced by Phase 4 as the **final-shaped** attack event the AI emits through
 * the damage registry; Phase 5's combat wiring (the explicit `attack` command
 * and bump-to-attack) reuses the same event rather than introducing a second
 * shape. `death`/`player-died` are separate Phase-5 events.
 */
export interface AttackedEvent {
  type: 'attacked';
  attackerId: string;
  targetId: string;
  amount: number;
  kind: string;
}

/**
 * Emitted when an entity's hit points reach zero or below and it is removed from
 * the world (change `core-gameplay-loop`, design D2; engine/combat spec "Death
 * removes the entity").
 *
 * Carries only the victim's id — the pair to `attacked`'s damage report — so a
 * log reader can pair "N damage dealt" with "that target died". Plain and
 * JSON-clean like every event.
 */
export interface DeathEvent {
  type: 'death';
  entityId: string;
}

/**
 * Emitted when the player's hit points reach zero or below, ending the run
 * (change `core-gameplay-loop`, design D2/D5; engine/combat spec "Player death
 * ends the run (permadeath)").
 *
 * Marks the run as over; the returned state's `status` becomes `'dead'` in the
 * same command, making every subsequent gameplay command inert. Plain data.
 */
export interface PlayerDiedEvent {
  type: 'player-died';
}

/**
 * Emitted when the player successfully picks a floor item up (change
 * `core-gameplay-loop`, design D7; engine/command-loop spec "Item pickup
 * command").
 *
 * Carries the acting entity, the picked-up item's pack id, and the item
 * entity's id. Like every event it is plain, JSON-clean data; the id is a pack
 * content reference only — no pack entry is embedded (content-as-data).
 */
export interface ItemPickedUpEvent {
  type: 'item-picked-up';
  actorId: string;
  itemId: string;
  entityId: string;
}

/**
 * Emitted when the player passes a turn without acting (the client's "wait
 * turn" control).
 *
 * It carries no payload: the fact of the wait is the event itself. It is a
 * member of the advance matrix, so the command loop runs the monster turn step
 * after it, while a malformed or refused wait degrades to `noop` (which never
 * advances). Plain and JSON-clean like every event.
 */
export interface WaitedEvent {
  type: 'waited';
}

/** Discriminated union of everything a command can report (design D3). */
export type GameEvent =
  | MovedEvent
  | BlockedEvent
  | NoopEvent
  | ItemUsedEvent
  | LevelChangedEvent
  | AttackedEvent
  | DeathEvent
  | PlayerDiedEvent
  | ItemPickedUpEvent
  | WaitedEvent;

/**
 * The complete, JSON-serializable game state.
 *
 * `rng.state` is advanced only through the command loop; helpers in `rng.ts`
 * operate on an `Rng` instance created from these fields (design D2).
 *
 * `level` and `explored` were added by change `levelgen-and-fov` (design D1):
 *
 *  - `level` carries the current level's metadata (depth + spawn) while the
 *    terrain remains `grid`, kept as a top-level field to avoid churning every
 *    existing consumer.
 *  - `explored` is the per-level explored mask: a flat row-major `boolean[]` of
 *    length `grid.width * grid.height`, index `y * width + x` — the **same
 *    indexing as `grid.passable`**. It is monotonic while on a level (only ever
 *    grows) and is reset when a new level is entered. Visibility itself is
 *    derived by the FOV computation, not stored here.
 *
 * `status` and `carriedItemIds` were added by change `core-gameplay-loop`
 * (design D1/D7):
 *
 *  - `status` is the run's lifecycle enum (`'playing' | 'dead'`). It is required
 *    (not optional) so "is the run over?" can never be silently absent; the
 *    terminal `'dead'` value is what makes permadeath inert (design D5/D7).
 *  - `carriedItemIds` is a plain list of content ids the player holds. It stores
 *    **ids only** (content-as-data), never resolved pack entries.
 *
 * Both are plain data, so the whole state stays JSON-clean.
 */
export interface GameState {
  grid: Grid;
  level: Level;
  /** Flat row-major explored mask, length `width * height`; see `Level`/D1. */
  explored: boolean[];
  entities: Entity[];
  playerId: string;
  /** The run's lifecycle; `'dead'` is terminal and makes commands inert. */
  status: 'playing' | 'dead';
  /** Content ids the player has picked up; ids only, never pack entries. */
  carriedItemIds: string[];
  rng: RngState;
  events: GameEvent[];
}
