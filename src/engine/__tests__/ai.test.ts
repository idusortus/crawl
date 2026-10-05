/**
 * Monster AI tests (change `core-gameplay-loop`, tasks 4.1–4.2 / design D3/D5).
 *
 * This suite pins the two Phase-4 publics:
 *
 *  1. The named **behavior registry** (`behaviorRegistry` / `resolveBehavior`):
 *     `chase` steps toward a visible/in-range player over legal tiles, attacks an
 *     adjacent player through the damage registry (HP drops), never passes
 *     through a wall or another occupant, and an unknown id degrades to the safe
 *     `idle` default (never throws).
 *  2. The per-turn **advance step** (`advanceMonsters`): every living monster
 *     acts exactly once in `entities` order, dead monsters do not act, replay
 *     from the same seed reproduces the same interleaving, and the step stops the
 *     moment the player dies.
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  advanceMonsters,
  behaviorRegistry,
  DEFAULT_BEHAVIOR_RANGE,
  resolveBehavior,
} from '../ai';
import { entityHp, MELEE_DAMAGE_KIND, resolveDamage } from '../combat';
import { createGrid } from '../grid';
import { createRng, rngFromState } from '../rng';
import type { Entity, GameEvent, GameState, Grid, Position } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const at = (x: number, y: number): Position => ({ x, y });

/**
 * Builds an all-passable `width x height` grid. Most tests use a small open room
 * so the only thing that blocks a chase step is an explicit wall/occupant.
 */
function openGrid(width: number, height: number): Grid {
  return createGrid(
    Array.from({ length: height }, () =>
      Array.from({ length: width }, () => true),
    ),
  );
}

/**
 * Assembles a minimal but complete `GameState`. The player is placed at
 * `playerPos` and any `monsters`/`extras` are appended after it, so the
 * `entities` order is `[player, ...]` and monster turn order follows the given
 * array order.
 */
function makeState(options: {
  grid?: Grid;
  playerPos?: Position;
  playerHp?: number;
  monsters?: Entity[];
  extra?: Entity[];
  status?: GameState['status'];
  seed?: number;
}): GameState {
  const grid = options.grid ?? openGrid(8, 8);
  const playerPos = options.playerPos ?? at(0, 0);
  const seed = options.seed ?? 1234;
  const rng = createRng(seed);
  const player: Entity = {
    id: 'player',
    kind: 'hero',
    pos: { ...playerPos },
    hp: options.playerHp ?? 10,
    attack: 4,
  };
  return {
    grid,
    level: { depth: 1, spawn: { ...playerPos }, stairs: at(grid.width - 1, grid.height - 1) },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [player, ...(options.monsters ?? []), ...(options.extra ?? [])],
    playerId: 'player',
    status: options.status ?? 'playing',
    carriedItemIds: [],
    rng: { seed, state: rng.state() },
    events: [],
  };
}

/** A monster with the supplied fields, defaulting to a chaser with attack 1. */
function monster(
  id: string,
  pos: Position,
  overrides: Partial<Entity> = {},
): Entity {
  return {
    id,
    kind: 'goblin',
    pos: { ...pos },
    hp: 3,
    behavior: 'chase',
    attack: 2,
    ...overrides,
  };
}

const posOf = (entities: Entity[], id: string): Position | undefined => {
  const found = entities.find((entity) => entity.id === id);
  return found === undefined ? undefined : found.pos;
};

// ---------------------------------------------------------------------------
// 4.1 — behavior registry
// ---------------------------------------------------------------------------

describe('behaviorRegistry', () => {
  it('registers at least the chase and idle behaviors', () => {
    expect(typeof behaviorRegistry.chase).toBe('function');
    expect(typeof behaviorRegistry.idle).toBe('function');
  });

  it('resolves a known id to its registered resolver', () => {
    expect(resolveBehavior('chase')).toBe(behaviorRegistry.chase);
    expect(resolveBehavior('idle')).toBe(behaviorRegistry.idle);
    expect(DEFAULT_BEHAVIOR_RANGE).toBe(8);
  });

  it('degrades an unknown id to a safe idle behavior that never throws', () => {
    const fallback = resolveBehavior('does-not-exist');
    expect(typeof fallback).toBe('function');

    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(3, 0), { behavior: 'does-not-exist' })],
    });
    const rng = createRng(1);
    // Resolving and running the fallback on an adjacent-to-nothing player must
    // be inert and must not throw.
    const result = fallback(state, state.entities[1], rng);
    expect(result.entities).toEqual(state.entities);
    expect(result.events).toEqual([]);
  });
});

describe('chase behavior — movement', () => {
  it('takes a step that reduces distance to an in-range player', () => {
    // Player (0,0), monster (4,0): within range (Chebyshev 4 <= 8), not adjacent.
    // The greedy step toward the player moves west, (4,0) -> (3,0).
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(4, 0))],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(9));

    expect(posOf(result.entities, 'm')).toEqual(at(3, 0));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      type: 'moved',
      entityId: 'm',
      from: at(4, 0),
      to: at(3, 0),
    });
  });

  it('steps toward a player along the axis of greatest distance (greedy)', () => {
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(5, 2))],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(2));
    // Chebyshev is 5; a step reducing it must land on (4,2).
    expect(posOf(result.entities, 'm')).toEqual(at(4, 2));
  });

  it('does not mutate the input state', () => {
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(4, 0))],
    });
    const snapshot = JSON.parse(JSON.stringify(state));
    resolveBehavior('chase')(state, state.entities[1], createRng(9));
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('idles when the player is neither visible nor in range', () => {
    // A 20x20 open room: the player at (0,0) and a monster at (19,19) are
    // Chebyshev 19 apart, well beyond DEFAULT_BEHAVIOR_RANGE (8), and the FOV
    // radius cannot reach across the room either. The chaser must stay put.
    const state = makeState({
      grid: openGrid(20, 20),
      playerPos: at(0, 0),
      monsters: [monster('m', at(19, 19))],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(3));
    expect(posOf(result.entities, 'm')).toEqual(at(19, 19));
    expect(result.events).toEqual([]);
  });
});

describe('chase behavior — attacks', () => {
  it('attacks an adjacent player, reducing HP and emitting an attacked event', () => {
    const state = makeState({
      playerPos: at(0, 0),
      playerHp: 10,
      monsters: [monster('m', at(1, 1), { attack: 2 })],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(42));

    const playerAfter = result.entities.find((e) => e.id === 'player');
    expect(playerAfter).toBeDefined();
    // HP strictly dropped and stayed within [10 - attack, 10 - 1].
    const hp = entityHp(playerAfter as Entity);
    expect(hp).toBeLessThan(10);
    expect(hp).toBeGreaterThanOrEqual(8);

    expect(result.events).toHaveLength(1);
    const event = result.events[0] as GameEvent;
    expect(event.type).toBe('attacked');
    if (event.type !== 'attacked') return;
    expect(event.attackerId).toBe('m');
    expect(event.targetId).toBe('player');
    expect(event.kind).toBe(MELEE_DAMAGE_KIND);
    expect(event.amount).toBe(10 - hp);
  });

  it('is adjacent in any diagonal direction and still attacks', () => {
    const state = makeState({
      playerPos: at(3, 3),
      monsters: [monster('m', at(4, 4), { attack: 1 })],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(7));
    expect(result.events[0]?.type).toBe('attacked');
    expect(posOf(result.entities, 'm')).toEqual(at(4, 4));
  });
});

describe('chase behavior — no pass-through', () => {
  it('never steps onto a wall; stays put when every approach is walled', () => {
    // A walled pocket: player at (0,0), monster at (2,0). The west neighbour
    // (1,0) and the south neighbour (2,1) are both walls, and north/east are out
    // of bounds, so there is no legal step and the monster stays put.
    const grid = createGrid([
      [true, false, true],
      [false, false, true],
      [true, true, true],
    ]);
    const state = makeState({
      grid,
      playerPos: at(0, 0),
      monsters: [monster('m', at(2, 0))],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(5));
    // (2,0) -> candidates: west (1,0) wall; south (2,1) wall; north OOB; east
    // OOB. No legal step, so the monster stays on (2,0).
    expect(posOf(result.entities, 'm')).toEqual(at(2, 0));
    expect(result.events).toEqual([]);
  });

  it('never steps onto another occupant', () => {
    // Player (0,0); monster (3,0); a second monster occupies the tile (2,0) the
    // first would otherwise step onto.
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [
        monster('m1', at(3, 0)),
        monster('m2', at(2, 0)),
      ],
    });
    const result = resolveBehavior('chase')(state, state.entities[1], createRng(11));
    // The only strictly-closer tile west of (3,0) is (2,0), which is occupied,
    // so m1 cannot advance on that axis. It must not land on (2,0).
    expect(posOf(result.entities, 'm1')).not.toEqual(at(2, 0));
    expect(posOf(result.entities, 'm2')).toEqual(at(2, 0));
  });
});

describe('idle behavior', () => {
  it('does nothing and emits nothing', () => {
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(1, 0), { behavior: 'idle' })],
    });
    const result = resolveBehavior('idle')(state, state.entities[1], createRng(1));
    expect(result.entities).toEqual(state.entities);
    expect(result.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism + no ambient randomness
// ---------------------------------------------------------------------------

describe('no ambient randomness', () => {
  it('chase draws only through the injected rng (same seed -> same outcome)', () => {
    const build = () =>
      makeState({
        playerPos: at(0, 0),
        playerHp: 20,
        monsters: [monster('m', at(1, 0), { attack: 6 })],
      });
    const a = resolveBehavior('chase')(build(), build().entities[1], createRng(99));
    const b = resolveBehavior('chase')(build(), build().entities[1], createRng(99));
    expect(a).toEqual(b);

    // A different seed over a wide attack range should vary the drawn amount for
    // at least one pair (guards against a constant that ignores the rng).
    const amounts = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const state = makeState({
        playerPos: at(0, 0),
        playerHp: 100,
        monsters: [monster('m', at(1, 0), { attack: 20 })],
      });
      const result = resolveBehavior('chase')(state, state.entities[1], createRng(seed));
      const event = result.events[0];
      if (event?.type === 'attacked') amounts.add(event.amount);
    }
    expect(amounts.size).toBeGreaterThan(1);
  });

  it('advance draws only through the injected rng (same seed -> identical output)', () => {
    const build = () => makeState({
      playerPos: at(0, 0),
      playerHp: 50,
      monsters: [monster('m1', at(1, 0)), monster('m2', at(6, 6))],
    });
    const a = advanceMonsters(build(), createRng(0xabc));
    const b = advanceMonsters(build(), createRng(0xabc));
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// 4.2 — per-turn advance step
// ---------------------------------------------------------------------------

describe('advanceMonsters — ordering and coverage', () => {
  it('advances every living monster exactly once, in entities order', () => {
    // Two monsters, both in range of the player, at different distances.
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [
        monster('m1', at(4, 0)),
        monster('m2', at(0, 4)),
      ],
    });
    const result = advanceMonsters(state, createRng(123));

    // Each monster moved exactly one tile closer (m1 west, m2 north). Both acted
    // once — the events are in entities order.
    expect(posOf(result.entities, 'm1')).toEqual(at(3, 0));
    expect(posOf(result.entities, 'm2')).toEqual(at(0, 3));
    expect(result.events.map((event) => event.type)).toEqual(['moved', 'moved']);
    expect(result.events[0]).toEqual({
      type: 'moved',
      entityId: 'm1',
      from: at(4, 0),
      to: at(3, 0),
    });
    expect(result.events[1]).toEqual({
      type: 'moved',
      entityId: 'm2',
      from: at(0, 4),
      to: at(0, 3),
    });
  });

  it('skips dead monsters (hp <= 0) entirely', () => {
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [
        monster('dead', at(4, 0), { hp: 0 }),
        monster('alive', at(0, 4)),
      ],
    });
    const result = advanceMonsters(state, createRng(5));

    // The dead monster did not move and emitted nothing; the alive one acted.
    expect(posOf(result.entities, 'dead')).toEqual(at(4, 0));
    expect(posOf(result.entities, 'alive')).toEqual(at(0, 3));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      type: 'moved',
      entityId: 'alive',
      from: at(0, 4),
      to: at(0, 3),
    });
  });

  it('does not advance anything when the persisted status is already dead', () => {
    const state = makeState({
      playerPos: at(0, 0),
      status: 'dead',
      monsters: [monster('m', at(4, 0))],
    });
    const result = advanceMonsters(state, createRng(1));
    expect(result.entities).toEqual(state.entities);
    expect(result.events).toEqual([]);
  });

  it('is pure: the input state is never mutated', () => {
    const state = makeState({
      playerPos: at(0, 0),
      monsters: [monster('m', at(4, 0))],
    });
    const snapshot = JSON.parse(JSON.stringify(state));
    advanceMonsters(state, createRng(3));
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });
});

describe('advanceMonsters — replay determinism', () => {
  it('reproduces the same monster interleaving from the same seed', () => {
    const build = () => makeState({
      playerPos: at(0, 0),
      playerHp: 50,
      monsters: [
        monster('a', at(1, 0)),
        monster('b', at(5, 5)),
        monster('c', at(0, 6)),
      ],
    });

    const runA = advanceMonsters(build(), createRng(0x5eed));
    const runB = advanceMonsters(build(), createRng(0x5eed));
    expect(runB.entities).toEqual(runA.entities);
    expect(runB.events).toEqual(runA.events);
  });

  it('resuming from the captured rng state continues the same stream', () => {
    const build = () => makeState({
      playerPos: at(0, 0),
      playerHp: 100,
      monsters: [monster('m', at(1, 0), { attack: 20 })],
      seed: 0x1234,
    });

    // Run one full step from the state's rng, capture the advanced rng state,
    // then resume a *second* step from that captured rng and the state whose
    // `rng` is the captured value. A resume must reproduce what an uninterrupted
    // second step from the same rng would produce.
    const state = build();
    const rng = createRng(state.rng.seed);
    rng.setState(state.rng.state);
    advanceMonsters(state, rng);
    const captured = { seed: state.rng.seed, state: rng.state() };

    const nextState = { ...state, rng: captured };

    const uninterruptedRng = createRng(captured.seed);
    uninterruptedRng.setState(captured.state);
    const uninterrupted = advanceMonsters(nextState, uninterruptedRng);

    const resumed = advanceMonsters(nextState, rngFromState(captured));
    expect(resumed).toEqual(uninterrupted);
  });
});

describe('advanceMonsters — stop on player death', () => {
  it('stops advancing the moment the player is killed mid-step', () => {
    // Two adjacent monsters with lethal attacks. The player has 1 HP, so any
    // positive damage (the resolver always deals >= 1) kills them on the first
    // attack; the second monster must then NOT act.
    const state = makeState({
      playerPos: at(1, 1),
      playerHp: 1,
      monsters: [
        monster('killer', at(1, 0), { attack: 20 }),
        monster('bystander', at(0, 1), { attack: 20 }),
      ],
    });
    const result = advanceMonsters(state, createRng(8));

    // Only the first monster acted (one attacked event).
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe('attacked');
    if (result.events[0]?.type !== 'attacked') return;
    expect(result.events[0].attackerId).toBe('killer');

    // The player is dead in the working entities.
    const playerAfter = result.entities.find((e) => e.id === 'player');
    expect(entityHp(playerAfter as Entity)).toBeLessThanOrEqual(0);
    // The bystander never moved or attacked.
    expect(posOf(result.entities, 'bystander')).toEqual(at(0, 1));
  });

  it('is inert once a persisted dead status is present, even with living monsters', () => {
    const state = makeState({
      playerPos: at(1, 1),
      playerHp: 0,
      status: 'dead',
      monsters: [monster('m', at(1, 0), { attack: 20 })],
    });
    const result = advanceMonsters(state, createRng(2));
    expect(result.events).toEqual([]);
    expect(result.entities).toEqual(state.entities);
  });
});

// ---------------------------------------------------------------------------
// Damage seam (used by the AI's adjacent attack)
// ---------------------------------------------------------------------------

describe('damage seam used by the AI', () => {
  it('resolveDamage(MELEE_DAMAGE_KIND, ...) reduces the target hp deterministically', () => {
    const attacker = monster('m', at(1, 0), { attack: 5 });
    const target: Entity = {
      id: 'player',
      kind: 'hero',
      pos: at(0, 0),
      hp: 20,
      attack: 4,
    };
    const a = resolveDamage(MELEE_DAMAGE_KIND, attacker, target, createRng(77));
    const b = resolveDamage(MELEE_DAMAGE_KIND, attacker, target, createRng(77));
    expect(a).toEqual(b);
    expect(a?.targetAfter.hp).toBeLessThan(20);
    expect(a?.applied.kind).toBe(MELEE_DAMAGE_KIND);
    // The original target is untouched.
    expect(target.hp).toBe(20);
  });

  it('returns undefined for an unknown damage kind (safe miss)', () => {
    const attacker = monster('m', at(1, 0));
    const target: Entity = { id: 'player', kind: 'hero', pos: at(0, 0), hp: 5 };
    expect(resolveDamage('not-a-kind', attacker, target, createRng(1))).toBeUndefined();
  });

  it('falls back to the base attack when the attacker has no copied attack', () => {
    const attacker = monster('m', at(1, 0), { attack: undefined });
    const target: Entity = { id: 'player', kind: 'hero', pos: at(0, 0), hp: 5 };
    const resolution = resolveDamage(MELEE_DAMAGE_KIND, attacker, target, createRng(1));
    expect(resolution).toBeDefined();
    expect(resolution?.applied.amount).toBeGreaterThanOrEqual(1);
  });
});
