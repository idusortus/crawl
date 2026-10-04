/**
 * Unit tests for `createInitialState` (change `expo-glyph-renderer`, tasks
 * 2.2/2.4; design D4/D7/D8).
 *
 * These are pure `.ts` tests — no React, no React Native — so they run under the
 * existing Vitest node environment. They pin the shape and determinism of the
 * initial state, the player's pack-sourced HP, the explored mask, and the RNG
 * capture point (that generation's draws were consumed before the state's `rng`
 * was written back).
 */

import { describe, expect, it } from 'vitest';

import {
  actorHp,
  applyCommandWithPack,
  createRng,
  entityById,
  inBounds,
  isPassable,
  loadPack,
  generateLevel,
  rngFromState,
} from '@engine';
import type { GameState } from '@engine';

import { fantasyPack } from '../../packs/fantasy';

import {
  createInitialState,
  PLAYER_CLASS_ID,
  PLAYER_ID,
} from './createInitialState';

const pack = loadPack(fantasyPack);
const SEED = 42;

describe('createInitialState', () => {
  it('generates a 40×30 depth-1 level', () => {
    const state = createInitialState(SEED, pack);

    expect(state.grid.width).toBe(40);
    expect(state.grid.height).toBe(30);
    expect(state.grid.passable).toHaveLength(40 * 30);
    expect(state.level.depth).toBe(1);
  });

  it('places the player on the passable in-bounds spawn tile', () => {
    const state = createInitialState(SEED, pack);
    const player = entityById(state.entities, state.playerId);

    expect(player).toBeDefined();
    expect(player?.id).toBe(PLAYER_ID);
    expect(player?.kind).toBe(PLAYER_CLASS_ID);
    expect(player?.pos).toEqual(state.level.spawn);
    expect(inBounds(state.grid, player!.pos)).toBe(true);
    expect(isPassable(state.grid, player!.pos)).toBe(true);
  });

  it('explores the spawn FOV into a full-length mask', () => {
    const state = createInitialState(SEED, pack);

    expect(state.explored).toHaveLength(state.grid.width * state.grid.height);

    const spawnIndex = state.level.spawn.y * state.grid.width + state.level.spawn.x;
    expect(state.explored[spawnIndex]).toBe(true);
    // At least the spawn itself is explored, never an all-false mask.
    expect(state.explored.some((tile) => tile === true)).toBe(true);
  });

  it("sources the player's HP from the pack's fighter class", () => {
    const state = createInitialState(SEED, pack);
    const player = entityById(state.entities, state.playerId);

    expect(actorHp(player!)).toBe(pack.class(PLAYER_CLASS_ID).hp);
    expect(actorHp(player!)).toBeGreaterThan(0);
  });

  it('is deterministic: the same seed yields an identical state', () => {
    expect(createInitialState(SEED, pack)).toEqual(createInitialState(SEED, pack));
  });

  it('writes back the RNG after generation consumed its draws', () => {
    const state = createInitialState(SEED, pack);

    // A fresh RNG at the same seed produces a different level than one resumed
    // from the state's captured RNG — proving `generateLevel`'s draws advanced
    // the stream before `rngToState` captured it. If the capture point were
    // wrong (before generation), these would match.
    const fromState = generateLevel({
      rng: rngFromState(state.rng),
      width: state.grid.width,
      height: state.grid.height,
      depth: 1,
    });
    const fromFresh = generateLevel({
      rng: createRng(SEED),
      width: state.grid.width,
      height: state.grid.height,
      depth: 1,
    });

    expect(fromState).not.toEqual(fromFresh);
  });

  it('starts with an empty event log and the player as the only entity', () => {
    const state = createInitialState(SEED, pack);

    expect(state.events).toEqual([]);
    expect(state.entities).toHaveLength(1);
    expect(state.playerId).toBe(PLAYER_ID);
  });
});

describe('dispatch contract', () => {
  it('returns a new state object and leaves the previous state unchanged', () => {
    const before = createInitialState(SEED, pack);
    const beforeSnapshot = JSON.parse(JSON.stringify(before)) as GameState;

    const result = applyCommandWithPack(
      before,
      { type: 'move', direction: 'east' },
      rngFromState(before.rng),
      pack,
    );

    expect(result.state).not.toBe(before);
    // The input state is not mutated — engine and client both guarantee this.
    expect(before).toEqual(beforeSnapshot);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('threads the RNG state through dispatch without replaying it', () => {
    const before = createInitialState(SEED, pack);

    const result = applyCommandWithPack(
      before,
      { type: 'descend' },
      rngFromState(before.rng),
      pack,
    );

    expect(result.state.rng.seed).toBe(before.rng.seed);
    // `descend` generates a level, so it must advance the RNG past the input.
    expect(result.state.rng.state).not.toBe(before.rng.state);
  });
});
