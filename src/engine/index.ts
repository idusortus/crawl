/**
 * Public engine surface.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 4.4) established this as the
 * only module outside `src/engine` that may be imported from. Stage 2
 * (`content-packs-v1`, task 6.1) extends it with the content-pack surface: the
 * schema types + `validatePack`, the loader (`loadPack`/`LoadedPack` + typed
 * errors), the effect registry, and the pack-aware command entry point. The
 * existing exports are kept intact.
 *
 * Nothing outside `src/engine` should reach deeper than this module. This module
 * must remain framework-free (no react / react-native / expo).
 */

// Types (JSON-clean plain data — design D4/D5).
export type {
  BlockedEvent,
  Command,
  Direction,
  Entity,
  GameEvent,
  GameState,
  Grid,
  ItemUsedEvent,
  MovedEvent,
  MoveCommand,
  NoopEvent,
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

// Seeded RNG.
export { createRng, randInt, rngFromState, rngToState } from './rng';
export type { Rng } from './rng';

// Spatial grid + occupancy.
export {
  createGrid,
  entityAt,
  entityById,
  inBounds,
  isPassable,
} from './grid';

// Event constructors + append-only log.
export { appendEvents, blocked, itemUsed, moved, noop } from './events';
