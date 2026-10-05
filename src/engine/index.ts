/**
 * Public engine surface.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 4.4) established this as the
 * only module outside `src/engine` that may be imported from. Stage 2
 * (`content-packs-v1`, task 6.1) extends it with the content-pack surface: the
 * schema types + `validatePack`, the loader (`loadPack`/`LoadedPack` + typed
 * errors), the effect registry, and the pack-aware command entry point. Stage 3
 * (`levelgen-and-fov`, task 5.1) extends it with the level/FOV surface: the FOV
 * primitives (`computeFov`/`exploreInto`/`DEFAULT_SIGHT_RADIUS`), the level
 * generator seam (`generateLevel` + `generateBspLevel` + the id list + typed
 * `UnknownGeneratorIdError`), the `descend` command/event, and `levelChanged`.
 * The existing exports are kept intact.
 *
 * Stage 6 (`core-gameplay-loop`, tasks 5.1/6.1/8.2) extends it with the combat
 * surface (`damageRegistry`/`resolveDamage`/`MELEE_DAMAGE_KIND`/`DEFAULT_ATTACK`
 * + types), the monster-AI surface (`behaviorRegistry`/`resolveBehavior`/
 * `advanceMonsters` + types), the level-population seam (`populateLevel` +
 * `LevelPopulation`), the pickup/attack commands + events, and the save surface
 * (`SAVE_VERSION`/`serializeSave`/`deserializeSave`/`replayCommands`/
 * `resumeRun` + `SaveEnvelope`). Change `review-fixes-augment` adds the typed
 * `PackRequiredForReplayError` (pack-free replay of a content-dependent
 * remainder fails loudly).
 *
 * Nothing outside `src/engine` should reach deeper than this module. This module
 * must remain framework-free (no react / react-native / expo).
 */

// Types (JSON-clean plain data — design D4/D5).
export type {
  AttackCommand,
  AttackedEvent,
  BlockedEvent,
  Command,
  DeathEvent,
  DescendCommand,
  Direction,
  Entity,
  GameEvent,
  GameState,
  Grid,
  ItemPickedUpEvent,
  ItemUsedEvent,
  Level,
  LevelChangedEvent,
  MovedEvent,
  MoveCommand,
  NoopEvent,
  PickupCommand,
  PlayerDiedEvent,
  Position,
  RngState,
  UseItemCommand,
} from './types';

// Command loop.
export { applyCommand, applyCommandWithPack } from './commands';
export type { CommandResult } from './commands';

// Content-pack schema (zod source of truth) + non-throwing validator.
export { PACK_VERSION, validatePack } from './schema/index';
export type {
  ItemEffect,
  Pack,
  PackClass,
  PackItem,
  PackMonster,
  PackValidationResult,
} from './schema/index';

// Content-pack loader + id resolution (design D5).
export {
  loadPack,
  MIN_CLASSES,
  MIN_ITEMS,
  MIN_MONSTERS,
  PackLoadError,
  UnknownContentIdError,
} from './pack';
export type { ContentCollection, LoadedPack } from './pack';

// Named effect registry + resolvers (design D8).
export { actorHp, effectRegistry, resolveEffect } from './effects';
export type {
  AppliedEffect,
  EffectResolution,
  EffectResolver,
} from './effects';

// Named damage registry + resolvers (change `core-gameplay-loop`, design D2).
export {
  DEFAULT_ATTACK,
  damageRegistry,
  entityHp,
  MELEE_DAMAGE_KIND,
  resolveDamage,
} from './combat';
export type {
  AppliedDamage,
  DamageResolution,
  DamageResolver,
} from './combat';

// Monster AI: named behavior registry + the per-turn advance step (design D3).
export {
  advanceMonsters,
  behaviorRegistry,
  DEFAULT_BEHAVIOR_RANGE,
  resolveBehavior,
} from './ai';
export type { BehaviorResolver, BehaviorResult } from './ai';

// Seeded RNG.
export { createRng, randInt, rngFromState, rngToState } from './rng';
export type { Rng } from './rng';

// Spatial grid + occupancy.
export {
  attackTargetAt,
  coordOf,
  createGrid,
  entityAt,
  entityById,
  forEachCoord,
  inBounds,
  indexOf,
  isFeature,
  isLiving,
  isPassable,
  isStairs,
} from './grid';

// Event constructors + append-only log.
export {
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

// Field of view — pure, derived (design D4). Visibility is never stored; the
// stored record is the explored mask, which `exploreInto` grows monotonically.
export { computeFov, DEFAULT_SIGHT_RADIUS, exploreInto } from './fov';

// Level generation — the named-generator seam (design D2/D3). Only
// `generateLevel` and the id list are exposed; the mutable registry object stays
// private to `level.ts` so consumers cannot mutate engine internals.
export {
  DEFAULT_GENERATOR_ID,
  generateBspLevel,
  generateLevel,
  generatorIds,
  populateLevel,
  UnknownGeneratorIdError,
} from './level';
export type {
  GeneratedLevel,
  GenerateLevelInput,
  LevelGenerator,
  LevelGeneratorOptions,
  LevelPopulation,
} from './level';

// Save/load — a versioned JSON envelope + resume-by-replay (change
// `core-gameplay-loop`, tasks 8.1/8.2 / design D8). Pure, no I/O: serializes
// the full state, the full command log, and an `appliedCount` cursor; resume
// replays only `commands.slice(appliedCount)` from the saved state. The client
// owns storage I/O.
export {
  deserializeSave,
  PackRequiredForReplayError,
  replayCommands,
  resumeRun,
  SAVE_VERSION,
  serializeSave,
  UnknownSaveVersionError,
} from './save';
export type { SaveEnvelope } from './save';
