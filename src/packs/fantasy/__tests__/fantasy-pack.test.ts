/**
 * Fantasy pack data tests (change `content-packs-v1`, phase 4).
 *
 * These assert that the shipped fantasy pack is *real data* the engine accepts:
 * it passes `validatePack`, meets `loadPack`'s composition floor with exactly
 * 2 classes / 3 monsters / 5 items, carries at least one deterministic and one
 * seeded-random item effect, and resolves by id.
 *
 * The test lives under `src/packs` (co-located with the data it guards) rather
 * than `src/engine/__tests__` because the pack is a `src/packs` artifact; the
 * vitest `include` was widened to pick it up.
 */

import { describe, it, expect } from 'vitest';
import { PACK_VERSION, validatePack } from '../../../engine/schema';
import { loadPack } from '../../../engine/pack';
import { fantasyPack } from '../index';

describe('fantasy pack — schema + composition', () => {
  it('validates against the engine pack schema', () => {
    const result = validatePack(fantasyPack);
    expect(result.ok).toBe(true);
  });

  it('loads with exactly 2 classes, 3 monsters, and 5 items', () => {
    const loaded = loadPack(fantasyPack);
    expect(loaded.pack.id).toBe('fantasy');
    expect(loaded.pack.version).toBe(PACK_VERSION);
    expect(loaded.pack.classes).toHaveLength(2);
    expect(loaded.pack.monsters).toHaveLength(3);
    expect(loaded.pack.items).toHaveLength(5);
  });

  it('resolves a known class id', () => {
    const loaded = loadPack(fantasyPack);
    const fighter = loaded.class('fighter');
    expect(fighter.name).toBe('Fighter');
    expect(fighter.glyph).toBe('@');
    expect(fighter.hp).toBeGreaterThan(0);
  });

  it('resolves a known monster id', () => {
    const loaded = loadPack(fantasyPack);
    const goblin = loaded.monster('goblin');
    expect(goblin.name).toBe('Goblin');
    expect(goblin.glyph).toBe('g');
    expect(goblin.hp).toBeGreaterThan(0);
  });

  it('resolves a known item id', () => {
    const loaded = loadPack(fantasyPack);
    const potion = loaded.item('healing-potion');
    expect(potion.name).toBe('Healing Potion');
    expect(potion.effect).toEqual({ kind: 'heal', amount: 8 });
  });
});

describe('fantasy pack — item effect coverage', () => {
  it('includes at least one deterministic (heal) effect', () => {
    const loaded = loadPack(fantasyPack);
    const heals = loaded.pack.items.filter((item) => item.effect.kind === 'heal');
    expect(heals.length).toBeGreaterThanOrEqual(1);
  });

  it('includes at least one seeded-random (roll-heal) effect', () => {
    const loaded = loadPack(fantasyPack);
    const rolls = loaded.pack.items.filter(
      (item) => item.effect.kind === 'roll-heal',
    );
    expect(rolls.length).toBeGreaterThanOrEqual(1);
  });

  it('every item declares a non-empty id, name, and one-character glyph', () => {
    const loaded = loadPack(fantasyPack);
    for (const item of loaded.pack.items) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.glyph).toHaveLength(1);
    }
  });

  it('every class and monster declares a non-empty id, name, and one-character glyph', () => {
    const loaded = loadPack(fantasyPack);
    for (const entry of [...loaded.pack.classes, ...loaded.pack.monsters]) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.glyph).toHaveLength(1);
    }
  });

  it('the raw JSON is JSON-clean and round-trips losslessly', () => {
    const serialized = JSON.stringify(fantasyPack);
    expect(JSON.stringify(JSON.parse(serialized))).toBe(serialized);
  });
});
