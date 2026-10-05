/**
 * Dogs pack data tests (Stage 7, change `second-theme-pack`).
 *
 * These assert that the second pack is *real data* the engine accepts with no
 * engine change: it passes `validatePack`, meets `loadPack`'s composition floor,
 * carries the family-dog theme in names/glyphs, and — the leak sentinel — uses
 * only vocabulary the engine already knows (monster `behavior` ids registered in
 * `behaviorRegistry`, item `effect.kind`s the schema already defines). A failure
 * on the vocabulary assertions means the pack leaked new vocabulary and must be
 * revised, not the engine.
 *
 * The test lives under `src/packs` (co-located with the data it guards), in the
 * same place as `fantasy-pack.test.ts`, so the existing vitest `include` picks
 * it up with no test-config change.
 */

import { describe, it, expect } from 'vitest';
import {
  PACK_VERSION,
  itemEffectSchema,
  validatePack,
} from '../../../engine/schema';
import { behaviorRegistry } from '../../../engine/ai';
import { loadPack } from '../../../engine/pack';
import { dogsPack } from '../index';

describe('dogs pack — schema + composition', () => {
  it('validates against the engine pack schema', () => {
    const result = validatePack(dogsPack);
    expect(result.ok).toBe(true);
  });

  it('loads with at least 2 classes, 1 monster, and 1 item', () => {
    const loaded = loadPack(dogsPack);
    expect(loaded.pack.id).toBe('dogs');
    expect(loaded.pack.version).toBe(PACK_VERSION);
    expect(loaded.pack.classes.length).toBeGreaterThanOrEqual(2);
    expect(loaded.pack.monsters.length).toBeGreaterThanOrEqual(1);
    expect(loaded.pack.items.length).toBeGreaterThanOrEqual(1);
  });

  it('resolves a known class id', () => {
    const loaded = loadPack(dogsPack);
    const goodBoy = loaded.class('good-boy');
    expect(goodBoy.name).toBe('Good Boy');
    expect(goodBoy.glyph).toBe('d');
    expect(goodBoy.hp).toBeGreaterThan(0);
    expect(goodBoy.attack).toBeGreaterThan(0);
  });

  it('resolves a known monster id', () => {
    const loaded = loadPack(dogsPack);
    const vacuum = loaded.monster('vacuum');
    expect(vacuum.name).toBe('Vacuum Cleaner');
    expect(vacuum.glyph).toBe('v');
    expect(vacuum.hp).toBeGreaterThan(0);
    expect(vacuum.behavior.length).toBeGreaterThan(0);
    expect(vacuum.attack).toBeGreaterThan(0);
  });

  it('resolves a known item id', () => {
    const loaded = loadPack(dogsPack);
    const bone = loaded.item('bone');
    expect(bone.name).toBe('Bone');
    expect(bone.glyph).toBe('b');
    if (bone.effect === undefined) {
      throw new Error('bone must declare an effect');
    }
    expect(bone.effect).toEqual({ kind: 'heal', amount: 6 });
  });
});

describe('dogs pack — theme + identity', () => {
  it('every class and monster declares a positive attack and one-character glyph', () => {
    const loaded = loadPack(dogsPack);
    for (const entry of [...loaded.pack.classes, ...loaded.pack.monsters]) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.glyph).toHaveLength(1);
      expect(entry.attack).toBeGreaterThan(0);
    }
  });

  it('every class declares positive hp', () => {
    const loaded = loadPack(dogsPack);
    for (const cls of loaded.pack.classes) {
      expect(cls.hp).toBeGreaterThan(0);
    }
  });

  it('every item declares a non-empty id, name, and one-character glyph', () => {
    const loaded = loadPack(dogsPack);
    for (const item of loaded.pack.items) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.glyph).toHaveLength(1);
    }
  });

  it('the raw JSON is JSON-clean and round-trips losslessly', () => {
    const serialized = JSON.stringify(dogsPack);
    expect(JSON.parse(serialized)).toEqual(dogsPack);
    expect(JSON.stringify(JSON.parse(serialized))).toBe(serialized);
  });
});

describe('dogs pack — vocabulary reuse (the leak sentinel)', () => {
  it('every monster behavior is a key of the engine behavior registry', () => {
    const loaded = loadPack(dogsPack);
    for (const monster of loaded.pack.monsters) {
      expect(Object.keys(behaviorRegistry)).toContain(monster.behavior);
    }
  });

  it('every item effect kind is one the pack schema defines', () => {
    const loaded = loadPack(dogsPack);
    const schemaKinds = itemEffectSchema.options.map(
      (option) => option.shape.kind.value,
    );
    for (const item of loaded.pack.items) {
      if (item.effect === undefined) {
        // A weapon (ranged-only item) carries no effect; assert it declares the
        // ranged descriptor instead of an effect kind.
        expect(item.ranged).toBeDefined();
        continue;
      }
      expect(schemaKinds).toContain(item.effect.kind);
    }
  });
});
