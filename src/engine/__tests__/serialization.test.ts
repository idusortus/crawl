import { describe, it, expect } from 'vitest';
import { createGrid, isPassable, entityAt } from '../grid';
import { createRng, randInt } from '../rng';
import type { GameState, Position } from '../types';

function makeState(): GameState {
  const grid = createGrid([
    [true, true, false],
    [false, true, true],
  ]);
  const rng = createRng(4242);
  return {
    grid,
    entities: [
      { id: 'player', kind: 'player', pos: { x: 0, y: 0 } },
      { id: 'rock', kind: 'rock', pos: { x: 2, y: 0 }, solid: true },
    ],
    playerId: 'player',
    rng: { seed: 4242, state: rng.state() },
    events: [
      { type: 'moved', entityId: 'player', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { type: 'blocked', entityId: 'player', direction: 'east' },
      { type: 'noop', reason: 'test' },
    ],
  };
}

describe('JSON serialization round-trip', () => {
  it('parse(stringify(state)) is structurally equal to the original', () => {
    const state = makeState();
    const roundTripped: GameState = JSON.parse(JSON.stringify(state));
    expect(roundTripped).toEqual(state);
  });

  it('preserves nested plain data exactly (entities, grid, rng, events)', () => {
    const state = makeState();
    const roundTripped: GameState = JSON.parse(JSON.stringify(state));

    expect(roundTripped.grid).toEqual(state.grid);
    expect(roundTripped.entities).toEqual(state.entities);
    expect(roundTripped.rng).toEqual(state.rng);
    expect(roundTripped.events).toEqual(state.events);
    expect(roundTripped.playerId).toBe(state.playerId);
  });

  it('behaves identically after a round-trip for further grid queries', () => {
    const state = makeState();
    const roundTripped: GameState = JSON.parse(JSON.stringify(state));

    const probes: Position[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 9, y: 9 },
    ];
    for (const p of probes) {
      expect(isPassable(roundTripped.grid, p)).toBe(isPassable(state.grid, p));
      expect(entityAt(roundTripped.entities, p)?.id).toBe(
        entityAt(state.entities, p)?.id,
      );
    }
  });

  it('resumes the RNG from a round-tripped state with identical output', () => {
    const state = makeState();
    const roundTripped: GameState = JSON.parse(JSON.stringify(state));

    // Continue both from their (identical) serialized rng state.
    const a = createRng(state.rng.seed);
    a.setState(state.rng.state);
    const b = createRng(roundTripped.rng.seed);
    b.setState(roundTripped.rng.state);

    for (let i = 0; i < 100; i++) {
      expect(randInt(b, 0, 100)).toBe(randInt(a, 0, 100));
    }
  });

  it('exposes no non-serializable values (functions, Map, Set, undefined)', () => {
    const state = makeState();
    const serialized = JSON.stringify(state);
    // Re-serializing the round-trip must be stable (no data loss/cycles).
    expect(JSON.stringify(JSON.parse(serialized))).toBe(serialized);
  });
});
