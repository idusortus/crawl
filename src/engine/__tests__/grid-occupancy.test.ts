/**
 * Occupancy classification tests (change `core-gameplay-loop`, tasks 1.1/1.2;
 * design D4; engine/spatial-grid spec: "Occupancy distinguishes living entities
 * from terrain features").
 *
 * Classification is **total**: every tile falls into exactly one of three
 * classes, plus the empty case:
 *
 *   1. living (numeric `hp`, not an item)          -> attack target
 *   2. feature (item discriminator, or stairs tile) -> enterable
 *   3. other non-living occupant                    -> blocked (catch-all)
 *   4. empty                                        -> nothing
 *
 * The predicates are pure and pack-free: they read entity fields and
 * `level.stairs` only, never a pack. (`isFeature` checks the item discriminator
 * only; the stairs tile is a `Level` position checked via `isStairs`.)
 *
 * Vitest globals are OFF, so `describe`/`it`/`expect` are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  attackTargetAt,
  entityAt,
  isFeature,
  isLiving,
  isStairs,
} from '../grid';
import type { Entity, Position } from '../types';

const at = (x: number, y: number): Position => ({ x, y });

// ---------------------------------------------------------------------------
// Fixtures drawn from the four classes
// ---------------------------------------------------------------------------

/** living: a player-shaped entity with numeric hp. */
const player: Entity = { id: 'player', kind: 'fighter', pos: at(0, 0), hp: 12 };

/** living: a monster with numeric hp (attack target). */
const monster: Entity = { id: 'goblin', kind: 'goblin', pos: at(1, 0), hp: 3 };

/** feature-item: a floor item carrying the explicit discriminator. */
const item: Entity = { id: 'potion', kind: 'healing-potion', pos: at(2, 0), item: true };

/** other non-living occupant: no hp, no discriminator (the `rock` class). */
const rock: Entity = { id: 'rock', kind: 'rock', pos: at(3, 0), solid: true };

const entities: Entity[] = [player, monster, item, rock];

// The level's stairs tile: a feature that is NOT an entity.
const stairs: Position = at(2, 1);

// ---------------------------------------------------------------------------
// isLiving
// ---------------------------------------------------------------------------

describe('isLiving', () => {
  it('classifies entities with numeric hp as living', () => {
    expect(isLiving(player)).toBe(true);
    expect(isLiving(monster)).toBe(true);
  });

  it('does not classify a floor item as living even if it carries an hp', () => {
    // The item discriminator takes precedence over hp.
    expect(isLiving({ id: 'x', kind: 'x', pos: at(0, 0), item: true, hp: 5 })).toBe(false);
  });

  it('classifies non-item entities without a numeric hp as not living', () => {
    expect(isLiving(rock)).toBe(false);
    expect(isLiving({ id: 'y', kind: 'y', pos: at(0, 0) })).toBe(false);
    // A non-number hp is not a valid living marker.
    expect(isLiving({ id: 'z', kind: 'z', pos: at(0, 0), hp: 'lots' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isFeature — item discriminator only
// ---------------------------------------------------------------------------

describe('isFeature', () => {
  it('classifies an entity carrying the item discriminator as a feature', () => {
    expect(isFeature(item)).toBe(true);
  });

  it('does not infer item-ness from kind', () => {
    // Same kind as the real item, but no discriminator -> NOT a feature.
    expect(isFeature({ id: 'p2', kind: 'healing-potion', pos: at(0, 0) })).toBe(false);
  });

  it('does not classify living or other occupants as features', () => {
    expect(isFeature(player)).toBe(false);
    expect(isFeature(monster)).toBe(false);
    expect(isFeature(rock)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStairs — compares positions
// ---------------------------------------------------------------------------

describe('isStairs', () => {
  it('is true only on the stairs tile', () => {
    expect(isStairs(at(2, 1), stairs)).toBe(true);
    expect(isStairs(at(0, 0), stairs)).toBe(false);
    expect(isStairs(at(2, 0), stairs)).toBe(false);
    expect(isStairs(at(-1, -1), stairs)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// attackTargetAt — living occupant at a position, else undefined
// ---------------------------------------------------------------------------

describe('attackTargetAt', () => {
  it('returns the living entity at an occupied position', () => {
    expect(attackTargetAt(entities, at(0, 0))?.id).toBe('player');
    expect(attackTargetAt(entities, at(1, 0))?.id).toBe('goblin');
  });

  it('returns undefined for a feature item, another non-living occupant, or empty', () => {
    expect(attackTargetAt(entities, at(2, 0))).toBeUndefined(); // feature item
    expect(attackTargetAt(entities, at(3, 0))).toBeUndefined(); // rock (blocked class)
    expect(attackTargetAt(entities, at(9, 9))).toBeUndefined(); // empty
    expect(attackTargetAt([], at(0, 0))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Totality — every occupant falls into exactly one class
// ---------------------------------------------------------------------------

describe('occupancy classification is total', () => {
  it('assigns every occupant to exactly one of living / feature / blocked', () => {
    for (const entity of entities) {
      const classes = [isLiving(entity), isFeature(entity)].filter(Boolean).length;
      // living and feature are mutually exclusive; 0 means the blocked class.
      expect(classes).toBeLessThanOrEqual(1);
    }
  });

  it('the rock (neither hp nor discriminator) lands in the blocked class', () => {
    expect(isLiving(rock)).toBe(false);
    expect(isFeature(rock)).toBe(false);
    // It is a real occupant (so a caller sees it via entityAt) but not an
    // attack target, which is what makes it a blocking occupant.
    expect(entityAt(entities, rock.pos)?.id).toBe('rock');
    expect(attackTargetAt(entities, rock.pos)).toBeUndefined();
  });

  it('classifies the stairs tile as a feature even though no entity is present', () => {
    // Stairs are not an entity: entityAt is empty there, but isStairs is true.
    expect(entityAt(entities, stairs)).toBeUndefined();
    expect(isStairs(stairs, stairs)).toBe(true);
  });
});
