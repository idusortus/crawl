import { describe, it, expect } from 'vitest';
import { PACK_VERSION, validatePack } from '../schema';
import {
  loadPack,
  PackLoadError,
  UnknownContentIdError,
  type LoadedPack,
} from '../pack';
import type { Entity, GameState, Grid } from '../types';

/** A minimal valid pack that satisfies the loader's composition floor. */
function validPack(): Record<string, unknown> {
  return {
    id: 'fantasy-core',
    name: 'Fantasy Core',
    version: PACK_VERSION,
    classes: [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 4 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 8, attack: 3 },
    ],
    monsters: [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 'chase', attack: 2 },
    ],
    items: [
      { id: 'potion', name: 'Healing Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
    ],
  };
}

const smallGrid: Grid = {
  width: 2,
  height: 2,
  passable: [true, true, true, false],
};

describe('loadPack — valid pack', () => {
  it('loads a well-formed pack and exposes plain data', () => {
    const loaded: LoadedPack = loadPack(validPack());
    expect(loaded.pack.id).toBe('fantasy-core');
    expect(loaded.pack.classes).toHaveLength(2);
    expect(loaded.pack.monsters).toHaveLength(1);
    expect(loaded.pack.items).toHaveLength(1);
  });

  it('exposes a JSON-clean pack (round-trips losslessly)', () => {
    const loaded = loadPack(validPack());
    const serialized = JSON.stringify(loaded.pack);
    expect(JSON.stringify(JSON.parse(serialized))).toBe(serialized);
  });
});

describe('loadPack — invalid pack yields no loaded pack', () => {
  it('throws PackLoadError with the actionable validation error', () => {
    const bad = validPack();
    bad.version = 999;

    let error: unknown;
    try {
      loadPack(bad);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PackLoadError);
    const loadError = error as PackLoadError;
    expect(loadError.code).toBe('invalid-pack');
    expect(loadError.message).toContain('version');
    expect(loadError.message).toContain('999');
  });

  it('surfaces the identical message that validatePack reports', () => {
    const bad = validPack();
    bad.monsters = [{ id: 'goblin', name: 'Goblin', glyph: 'g' }];

    const validation = validatePack(bad);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;

    expect(() => loadPack(bad)).toThrowError(
      new RegExp(escapeRegExp(validation.error)),
    );
  });

  it('returns no loaded pack on failure (function either returns or throws)', () => {
    let loaded: LoadedPack | undefined;
    try {
      loaded = loadPack({ id: 'broken' });
    } catch {
      loaded = undefined;
    }
    expect(loaded).toBeUndefined();
  });
});

describe('loadPack — composition floor (loader policy, not schema)', () => {
  it('rejects a pack with only one class', () => {
    const pack = validPack();
    pack.classes = [{ id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 4 }];

    // The schema permits it; the loader must not.
    expect(validatePack(pack).ok).toBe(true);

    let error: unknown;
    try {
      loadPack(pack);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PackLoadError);
    expect((error as PackLoadError).code).toBe('composition');
    expect((error as PackLoadError).message).toContain('classes');
  });

  it('rejects a pack with zero monsters', () => {
    const pack = validPack();
    pack.monsters = [];
    expect(validatePack(pack).ok).toBe(true);
    expect(() => loadPack(pack)).toThrowError(/monsters/);
  });

  it('rejects a pack with zero items', () => {
    const pack = validPack();
    pack.items = [];
    expect(validatePack(pack).ok).toBe(true);
    expect(() => loadPack(pack)).toThrowError(/items/);
  });

  it('reports every floor violation it finds in one message', () => {
    const pack = validPack();
    pack.classes = [{ id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 4 }];
    pack.monsters = [];
    pack.items = [];

    expect(() => loadPack(pack)).toThrowError(/classes[\s\S]*monsters[\s\S]*items/);
  });
});

describe('loadPack — known ids resolve to the right entries', () => {
  it('resolves a known class, monster, and item by id', () => {
    const loaded = loadPack(validPack());

    expect(loaded.class('rogue')).toEqual({
      id: 'rogue',
      name: 'Rogue',
      glyph: 'R',
      hp: 8,
      attack: 3,
    });
    expect(loaded.monster('goblin').name).toBe('Goblin');
    expect(loaded.item('potion').effect).toEqual({ kind: 'heal', amount: 5 });
  });

  it('exposes a resolved monster behavior/attack and a class attack', () => {
    const loaded = loadPack(validPack());

    const goblin = loaded.monster('goblin');
    expect(goblin.behavior).toBe('chase');
    expect(goblin.attack).toBe(2);

    expect(loaded.class('fighter').attack).toBe(4);
    expect(loaded.class('rogue').attack).toBe(3);
  });

  it('resolves without ambiguity when ids collide across collections', () => {
    const pack = validPack();
    pack.monsters = [
      { id: 'rogue', name: 'Rogue Wolf', glyph: 'w', hp: 6, behavior: 'chase', attack: 2 },
    ];
    pack.items = [
      { id: 'rogue', name: 'Rogue Charm', glyph: '?', effect: { kind: 'heal', amount: 2 } },
    ];

    const loaded = loadPack(pack);
    expect(loaded.class('rogue').name).toBe('Rogue');
    expect(loaded.monster('rogue').name).toBe('Rogue Wolf');
    expect(loaded.item('rogue').name).toBe('Rogue Charm');
  });
});

describe('loadPack — unknown ids are reported, never silently empty', () => {
  it('throws UnknownContentIdError for an unknown class id', () => {
    const loaded = loadPack(validPack());
    expect(() => loaded.class('sorcerer')).toThrowError(UnknownContentIdError);
  });

  it('reports the collection and id on the error', () => {
    const loaded = loadPack(validPack());
    try {
      loaded.monster('dragon');
      expect.unreachable('expected an UnknownContentIdError');
    } catch (caught) {
      const error = caught as UnknownContentIdError;
      expect(error).toBeInstanceOf(UnknownContentIdError);
      expect(error.collection).toBe('monster');
      expect(error.id).toBe('dragon');
      expect(error.packId).toBe('fantasy-core');
      expect(error.message).toContain('dragon');
    }
  });

  it('throws for unknown item ids too', () => {
    const loaded = loadPack(validPack());
    expect(() => loaded.item('sword')).toThrowError(/sword/);
  });
});

describe('loadPack — deterministic load', () => {
  it('loading the same pack twice yields equivalent content', () => {
    const first = loadPack(validPack());
    const second = loadPack(validPack());
    expect(first.pack).toEqual(second.pack);
  });

  it('resolves the same entries across independent loads', () => {
    const first = loadPack(validPack());
    const second = loadPack(validPack());
    expect(first.class('fighter')).toEqual(second.class('fighter'));
    expect(first.monster('goblin')).toEqual(second.monster('goblin'));
    expect(first.item('potion')).toEqual(second.item('potion'));
  });

  it('does not mutate the raw input object', () => {
    const raw = validPack();
    const before = JSON.parse(JSON.stringify(raw));
    loadPack(raw);
    expect(raw).toEqual(before);
  });
});

describe('loadPack — stable-order spawnable enumeration', () => {
  /** A pack whose collections have a meaningful, distinguishable order. */
  function orderedPack(): Record<string, unknown> {
    return {
      id: 'ordered-pack',
      name: 'Ordered Pack',
      version: PACK_VERSION,
      classes: [
        { id: 'alpha', name: 'Alpha', glyph: 'A', hp: 10, attack: 2 },
        { id: 'beta', name: 'Beta', glyph: 'B', hp: 8, attack: 3 },
      ],
      monsters: [
        { id: 'first', name: 'First', glyph: '1', hp: 3, behavior: 'chase', attack: 1 },
        { id: 'second', name: 'Second', glyph: '2', hp: 4, behavior: 'chase', attack: 2 },
        { id: 'third', name: 'Third', glyph: '3', hp: 5, behavior: 'chase', attack: 3 },
      ],
      items: [
        { id: 'heal', name: 'Heal', glyph: '!', effect: { kind: 'heal', amount: 2 } },
        { id: 'roll', name: 'Roll', glyph: '?', effect: { kind: 'roll-heal', min: 1, max: 3 } },
      ],
    };
  }

  it('enumerates monsters/items in declared (stable) array order', () => {
    const loaded = loadPack(orderedPack());
    expect(loaded.pack.monsters.map((m) => m.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(loaded.pack.items.map((i) => i.id)).toEqual(['heal', 'roll']);
  });

  it('selects the same kind by seeded index across two independent loads', () => {
    const first = loadPack(orderedPack());
    const second = loadPack(orderedPack());

    // The same seeded index must resolve to the same kind on both loads.
    for (const index of [0, 1, 2]) {
      expect(first.pack.monsters[index].id).toBe(
        second.pack.monsters[index].id,
      );
      expect(first.monster(first.pack.monsters[index].id).behavior).toBe(
        second.monster(second.pack.monsters[index].id).behavior,
      );
    }
    expect(first.pack.items[0].id).toBe(second.pack.items[0].id);
  });
});

describe('content is not embedded in game state', () => {
  it('stores only the content id on a state entity, not the pack entry', () => {
    const loaded = loadPack(validPack());
    const goblin = loaded.monster('goblin');

    const goblinEntity: Entity = {
      id: 'mob-1',
      kind: goblin.id, // the id, not the object
      pos: { x: 1, y: 0 },
    };
    const state: GameState = {
      grid: smallGrid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 0 } },
      explored: new Array<boolean>(smallGrid.width * smallGrid.height).fill(false),
      entities: [goblinEntity],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 1, state: 1 },
      events: [],
    };

    expect(state.entities[0].kind).toBe('goblin');
    // The rich entry data (name/glyph/hp) must NOT leak into state.
    expect(Object.keys(state.entities[0])).toEqual(['id', 'kind', 'pos']);
    expect(JSON.stringify(state)).not.toContain('Goblin');
    expect(JSON.stringify(state)).not.toContain('hp');
  });

  it('is well-formed and behaves identically WITHOUT the pack present', () => {
    const loaded = loadPack(validPack());
    const state: GameState = {
      grid: smallGrid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 0 } },
      explored: new Array<boolean>(smallGrid.width * smallGrid.height).fill(false),
      entities: [
        { id: 'player', kind: loaded.class('fighter').id, pos: { x: 0, y: 0 } },
        { id: 'mob-1', kind: loaded.monster('goblin').id, pos: { x: 1, y: 0 } },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: { seed: 42, state: 7 },
      events: [],
    };

    // Round-trip with no pack in scope at all.
    const restored: GameState = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state);

    // Re-serializing is stable (no dangling objects / non-plain data).
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));

    // Content references remain ids a *separate* pack load can still resolve.
    const reloaded = loadPack(validPack());
    expect(reloaded.class(restored.entities[0].kind).id).toBe('fighter');
    expect(reloaded.monster(restored.entities[1].kind).id).toBe('goblin');
  });
});

/** Escapes a string for safe embedding in a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
