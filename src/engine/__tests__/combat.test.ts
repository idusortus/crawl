/**
 * Combat tests (change `core-gameplay-loop`, task 5.1 / design D2).
 *
 * This suite pins the damage seam that both the player's attacks and the
 * monster AI resolve through:
 *
 *  1. The named **damage registry** (`damageRegistry` / `resolveDamage`): one
 *     registered kind under the exported `MELEE_DAMAGE_KIND` constant (never a
 *     bare `'melee'` literal), a safe `undefined` miss for an unknown kind, and
 *     the attacker's copied `attack` (with a `DEFAULT_ATTACK` fallback) driving
 *     the damage.
 *  2. Seeded **reproducibility**: the same seed + identical inputs resolve the
 *     same amount, while different seeds vary a wide range; no ambient
 *     randomness is consulted.
 *  3. **HP reduction** and the **`entityHp`** reader.
 *  4. **Death removal** and the terminal **player-death status**, exercised
 *     through the command loop's `attack` command so the world-level wiring
 *     (entity removal, `status = 'dead'`, `death`/`player-died` events) is
 *     covered end to end.
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  createGrid,
  createRng,
  entityAt,
  entityById,
  rngFromState,
} from '../index';
import {
  DEFAULT_ATTACK,
  damageRegistry,
  entityHp,
  MELEE_DAMAGE_KIND,
  resolveDamage,
} from '../combat';
import { attacked, death, playerDied } from '../events';
import type { Entity, GameState, Position } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const at = (x: number, y: number): Position => ({ x, y });

function attacker(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'player',
    kind: 'fighter',
    pos: at(0, 0),
    hp: 10,
    attack: 4,
    ...overrides,
  };
}

function target(overrides: Partial<Entity> = {}): Entity {
  return { id: 'goblin', kind: 'goblin', pos: at(1, 0), hp: 5, ...overrides };
}

/**
 * A small all-passable room with a player and one or more entities, complete
 * enough for the command loop. The player is first in `entities`.
 */
function makeState(entities: Entity[], playerHp = 10, seed = 1234): GameState {
  const grid = createGrid([
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ]);
  const rng = createRng(seed);
  return {
    grid,
    level: { depth: 1, spawn: at(1, 1), stairs: at(2, 2) },
    explored: new Array<boolean>(grid.width * grid.height).fill(false),
    entities: [
      { id: 'player', kind: 'fighter', pos: at(1, 1), hp: playerHp, attack: 4 },
      ...entities,
    ],
    playerId: 'player',
    status: 'playing',
    carriedItemIds: [],
    rng: { seed, state: rng.state() },
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Registry shape + the exported kind constant
// ---------------------------------------------------------------------------

describe('damage registry', () => {
  it('registers the melee kind under the exported MELEE_DAMAGE_KIND constant', () => {
    expect(MELEE_DAMAGE_KIND).toBe('melee');
    expect(typeof damageRegistry[MELEE_DAMAGE_KIND]).toBe('function');
  });

  it('returns undefined for an unknown damage kind (safe miss, no throw)', () => {
    expect(
      resolveDamage('not-a-kind', attacker(), target(), createRng(1)),
    ).toBeUndefined();
  });

  it('reads the attacker copied attack value, falling back to DEFAULT_ATTACK', () => {
    // A copy with no numeric attack falls back to the base constant.
    const bare: Entity = { id: 'p', kind: 'p', pos: at(0, 0) };
    const hit = resolveDamage(
      MELEE_DAMAGE_KIND,
      bare,
      target(),
      createRng(7),
    );
    expect(hit).toBeDefined();
    expect(hit?.applied.amount).toBe(DEFAULT_ATTACK);

    // A declared attack of `n` bounds the drawn amount in `[1, n]`.
    const strong = resolveDamage(
      MELEE_DAMAGE_KIND,
      attacker({ attack: 6 }),
      target({ hp: 100 }),
      createRng(7),
    );
    expect(strong?.applied.amount).toBeGreaterThanOrEqual(1);
    expect(strong?.applied.amount).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Seeded reproducibility + HP reduction
// ---------------------------------------------------------------------------

describe('resolveDamage reproducibility and HP reduction', () => {
  it('the same seed reproduces the same damage and resulting hit points', () => {
    const a = resolveDamage(
      MELEE_DAMAGE_KIND,
      attacker(),
      target(),
      createRng(0xbeef),
    );
    const b = resolveDamage(
      MELEE_DAMAGE_KIND,
      attacker(),
      target(),
      createRng(0xbeef),
    );
    expect(a).toEqual(b);
    expect(a?.targetAfter.hp).toBe(5 - (a?.applied.amount ?? 0));
  });

  it('varies the drawn amount across seeds (the draw is not a constant)', () => {
    const amounts = new Set<number>();
    for (let seed = 1; seed <= 24; seed++) {
      const hit = resolveDamage(
        MELEE_DAMAGE_KIND,
        attacker({ attack: 20 }),
        target({ hp: 100 }),
        createRng(seed),
      );
      if (hit !== undefined) amounts.add(hit.applied.amount);
    }
    expect(amounts.size).toBeGreaterThan(1);
  });

  it('never mutates the attacker or target', () => {
    const a = attacker();
    const t = target();
    const snapshot = JSON.parse(JSON.stringify({ a, t }));
    resolveDamage(MELEE_DAMAGE_KIND, a, t, createRng(3));
    expect(JSON.parse(JSON.stringify({ a, t }))).toEqual(snapshot);
  });

  it('entityHp reads a numeric hp and treats a non-number as 0', () => {
    expect(entityHp({ id: 'x', kind: 'x', pos: at(0, 0), hp: 3 })).toBe(3);
    expect(entityHp({ id: 'x', kind: 'x', pos: at(0, 0) })).toBe(0);
    expect(entityHp({ id: 'x', kind: 'x', pos: at(0, 0), hp: 'lots' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Death removal (monster) through the explicit attack command
// ---------------------------------------------------------------------------

describe('death removes the entity', () => {
  it('a slain monster is removed and a death event is emitted', () => {
    // A 1-HP monster adjacent to the player; any positive damage kills it.
    const state = makeState([{ id: 'goblin', kind: 'goblin', pos: at(2, 1), hp: 1 }]);
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );

    // attacked first, then death.
    expect(events[0]?.type).toBe('attacked');
    expect(events[1]).toEqual(death('goblin'));
    // The goblin is gone from the world...
    expect(entityById(next.entities, 'goblin')).toBeUndefined();
    // ...and its former tile is empty.
    expect(entityAt(next.entities, at(2, 1))).toBeUndefined();
    expect(next.status).toBe('playing');
  });
});

// ---------------------------------------------------------------------------
// Terminal player-death status through the command loop
// ---------------------------------------------------------------------------

describe('player death ends the run (permadeath)', () => {
  it('a lethal monster counter-attack sets status dead and emits player-died', () => {
    // Player at (1,1) with 1 HP, monster adjacent with a lethal attack and
    // `chase`; the player attacks a *different* adjacent 1-HP monster, and the
    // surviving lethal monster's turn kills the player.
    const state = makeState(
      [
        { id: 'victim', kind: 'goblin', pos: at(2, 1), hp: 1 },
        { id: 'killer', kind: 'goblin', pos: at(1, 0), hp: 9, behavior: 'chase', attack: 20 },
      ],
      1,
    );
    const { state: next, events } = applyCommand(
      state,
      { type: 'attack', direction: 'east' },
      rngFromState(state.rng),
    );

    // The victim died from the player's attack...
    expect(events.some((event) => event.type === 'death')).toBe(true);
    // ...then the killer's counter-attack killed the player.
    expect(events.some((event) => event.type === 'attacked' && event.targetId === 'player')).toBe(true);
    expect(events[events.length - 1]).toEqual(playerDied());
    expect(next.status).toBe('dead');
    // The player entity is removed from the world (combat spec: death removes
    // the entity).
    expect(entityById(next.entities, 'player')).toBeUndefined();
  });

  it('a state that is already dead is inert to a further attack command', () => {
    const base = makeState([{ id: 'goblin', kind: 'goblin', pos: at(2, 1), hp: 5 }]);
    const dead: GameState = { ...base, status: 'dead' };
    const { state: next, events } = applyCommand(
      dead,
      { type: 'attack', direction: 'east' },
      rngFromState(dead.rng),
    );
    expect(events).toEqual([{ type: 'noop', reason: 'run-over' }]);
    expect(next.entities).toEqual(dead.entities);
    expect(next.status).toBe('dead');
  });
});

// ---------------------------------------------------------------------------
// Event factories are plain data
// ---------------------------------------------------------------------------

describe('combat event factories', () => {
  it('build JSON-clean plain objects', () => {
    expect(attacked('a', 'b', 3, MELEE_DAMAGE_KIND)).toEqual({
      type: 'attacked',
      attackerId: 'a',
      targetId: 'b',
      amount: 3,
      kind: 'melee',
    });
    expect(death('goblin')).toEqual({ type: 'death', entityId: 'goblin' });
    expect(playerDied()).toEqual({ type: 'player-died' });
    // Round-trip stays lossless.
    const events = [attacked('a', 'b', 3, MELEE_DAMAGE_KIND), death('b'), playerDied()];
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });
});
