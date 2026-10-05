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
import { dogsPack } from '../../packs/dogs';

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

  it("copies the player's attack from the pack's fighter class at spawn", () => {
    const state = createInitialState(SEED, pack);
    const player = entityById(state.entities, state.playerId);

    // Without the copied `attack` the engine would fall back to DEFAULT_ATTACK
    // (1) instead of the fighter's class attack (4) (design D2).
    expect(player?.attack).toBe(pack.class(PLAYER_CLASS_ID).attack);
    expect(player?.attack).toBeGreaterThan(0);
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

  it('starts with an empty event log and a populated level (player + monsters/items)', () => {
    const state = createInitialState(SEED, pack);

    // Initial population emits no events — the log starts empty.
    expect(state.events).toEqual([]);
    // The player is present and entities now include the depth-1 population.
    expect(state.entities.some((entity) => entity.id === PLAYER_ID)).toBe(true);
    expect(state.entities.length).toBeGreaterThan(1);
    expect(state.playerId).toBe(PLAYER_ID);
  });

  it("starts playing with no carried items and a stairs tile", () => {
    const state = createInitialState(SEED, pack);

    expect(state.status).toBe('playing');
    expect(state.carriedItemIds).toEqual([]);
    // Stairs are on a passable in-bounds tile distinct from the spawn.
    expect(inBounds(state.grid, state.level.stairs)).toBe(true);
    expect(isPassable(state.grid, state.level.stairs)).toBe(true);
    expect(state.level.stairs).not.toEqual(state.level.spawn);
  });
});

describe('createInitialState — pack-agnostic player class (Finding A)', () => {
  it('builds from the dogs pack with no class id (does not throw)', () => {
    const dogs = loadPack(dogsPack);

    // Against the old hardcoded `'fighter'` literal this threw
    // `UnknownContentIdError` because the dogs pack declares no `fighter`.
    const state = createInitialState(SEED, dogs);
    const player = entityById(state.entities, state.playerId);

    expect(player).toBeDefined();
    // The default is the pack's FIRST declared class (`good-boy`).
    expect(player?.kind).toBe('good-boy');
    expect(['good-boy', 'chonker']).toContain(player?.kind);
  });

  it("sources the dogs player's HP/attack from that same class", () => {
    const dogs = loadPack(dogsPack);
    const state = createInitialState(SEED, dogs);
    const player = entityById(state.entities, state.playerId);
    const cls = dogs.class(player!.kind);

    expect(actorHp(player!)).toBe(cls.hp);
    expect(player?.attack).toBe(cls.attack);
    expect(actorHp(player!)).toBeGreaterThan(0);
  });

  it('honors an explicit class id from any pack', () => {
    const dogs = loadPack(dogsPack);
    const state = createInitialState(SEED, dogs, 'chonker');
    const player = entityById(state.entities, state.playerId);

    expect(player?.kind).toBe('chonker');
    expect(actorHp(player!)).toBe(dogs.class('chonker').hp);
    expect(player?.attack).toBe(dogs.class('chonker').attack);
  });

  it('fails loudly when the explicit class id is absent from the pack', () => {
    const dogs = loadPack(dogsPack);
    expect(() => createInitialState(SEED, dogs, 'fighter')).toThrow();
  });

  it('leaves the fantasy default unchanged (still the fighter class)', () => {
    const state = createInitialState(SEED, pack);
    const player = entityById(state.entities, state.playerId);
    const fighter = pack.class(PLAYER_CLASS_ID);

    expect(player?.kind).toBe('fighter');
    expect(actorHp(player!)).toBe(fighter.hp);
    expect(player?.attack).toBe(fighter.attack);
    // The explicit-id and default paths agree for the fantasy pack.
    expect(createInitialState(SEED, pack, PLAYER_CLASS_ID)).toEqual(state);
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

    // The Phase-7 stairs gate requires the player to stand on the current
    // level's stairs; move them there via a fixture edit before dispatching.
    const onStairs: GameState = {
      ...before,
      entities: before.entities.map((entity) =>
        entity.id === before.playerId
          ? { ...entity, pos: { ...before.level.stairs } }
          : entity,
      ),
    };

    const result = applyCommandWithPack(
      onStairs,
      { type: 'descend' },
      rngFromState(onStairs.rng),
      pack,
    );

    expect(result.state.rng.seed).toBe(onStairs.rng.seed);
    // `descend` generates a level, so it must advance the RNG past the input.
    expect(result.state.rng.state).not.toBe(onStairs.rng.state);
  });
});
