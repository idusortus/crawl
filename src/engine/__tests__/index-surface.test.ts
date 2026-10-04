import { describe, it, expect } from 'vitest';
// Task 4.4: nothing outside `src/engine` should reach deeper than `index.ts`.
// This test imports ONLY from the public surface (via the `@engine` alias) to
// prove the barrel re-exports everything the full flow needs.
import {
  applyCommand,
  appendEvents,
  blocked,
  createGrid,
  createRng,
  entityAt,
  entityById,
  inBounds,
  isPassable,
  moved,
  noop,
  randInt,
  rngFromState,
  rngToState,
} from '@engine/index';
import type {
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
  Rng,
  RngState,
} from '@engine/index';

describe('public engine surface (@engine)', () => {
  it('exposes the full command→event→state→serialize flow', () => {
    const grid: Grid = createGrid([
      [true, true],
      [true, false],
    ]);
    const rng: Rng = createRng(7);
    const player: Entity = { id: 'player', kind: 'player', pos: { x: 0, y: 0 } };
    const state: GameState = {
      grid,
      entities: [player],
      playerId: 'player',
      rng: rngToState(7, rng),
      events: [],
    };

    expect(inBounds(grid, { x: 0, y: 0 })).toBe(true);
    expect(isPassable(grid, { x: 1, y: 1 })).toBe(false);
    expect(entityAt(state.entities, { x: 0, y: 0 })?.id).toBe('player');
    expect(entityById(state.entities, 'player')?.kind).toBe('player');

    const command: Command = { type: 'move', direction: 'east' };
    const result = applyCommand(state, command, rngFromState(state.rng));

    const ev: GameEvent = result.events[0];
    expect(ev.type).toBe('moved');
    expect(result.state.entities[0].pos).toEqual({ x: 1, y: 0 });
    expect(result.state.events).toHaveLength(1);
  });

  it('re-exports the event constructors and log helper', () => {
    const m: MovedEvent = moved('p', { x: 0, y: 0 }, { x: 1, y: 0 });
    const b: BlockedEvent = blocked('p', 'east');
    const n: NoopEvent = noop('r');
    const log: GameEvent[] = appendEvents([], [m, b, n]);
    expect(log.map((e) => e.type)).toEqual(['moved', 'blocked', 'noop']);
  });

  it('re-exports the RNG helpers (types + bounded draw)', () => {
    const draw = (rng: Rng): number => randInt(rng, 0, 9);
    const saved: RngState = rngToState(3, createRng(3));
    const restored: Rng = rngFromState(saved);
    expect(draw(createRng(3))).toBe(draw(restored));
    const command: MoveCommand = { type: 'move', direction: 'north' as Direction };
    expect(command.type).toBe('move');
    const pos: Position = { x: 0, y: 0 };
    expect(pos.y).toBe(0);
  });
});
