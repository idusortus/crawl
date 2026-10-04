/**
 * Public engine surface.
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, task 4.4): the only module outside
 * `src/engine` should import from. Re-exports the engine types, the command
 * loop (`applyCommand`), the grid/RNG helpers, and the event constructors —
 * nothing outside `src/engine` needs to reach deeper than this module.
 *
 * This module must remain framework-free (no react / react-native / expo).
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
  MovedEvent,
  MoveCommand,
  NoopEvent,
  Position,
  RngState,
} from './types';

// Command loop.
export { applyCommand } from './commands';
export type { CommandResult } from './commands';

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
export { appendEvents, blocked, moved, noop } from './events';
