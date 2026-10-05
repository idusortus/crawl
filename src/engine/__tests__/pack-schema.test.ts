import { describe, it, expect } from 'vitest';
import {
  PACK_VERSION,
  validatePack,
  type Pack,
} from '../schema';

/**
 * A minimal, fully-valid *raw* pack (plain object, not pre-typed) used as the
 * happy-path fixture and as the mutation base for the invalid cases. Kept as
 * `unknown`-shaped input on purpose: `validatePack` must accept whatever a
 * pack author hands it, so building fixtures as loose objects exercises the
 * real boundary.
 */
function validFantasyPack(): Record<string, unknown> {
  return {
    id: 'fantasy-core',
    name: 'Fantasy Core',
    version: PACK_VERSION,
    classes: [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 4 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 8, attack: 3, description: 'Sneaky.' },
    ],
    monsters: [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 'chase', attack: 2 },
    ],
    items: [
      { id: 'potion', name: 'Healing Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
      { id: 'herb', name: 'Herb', glyph: '*', effect: { kind: 'roll-heal', min: 1, max: 4 } },
    ],
  };
}

/** Deep clone so each test mutates an independent fixture. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Assert a failed result and that its message names the given fragment. */
function expectFailureWith(input: unknown, ...fragments: string[]): void {
  const result = validatePack(input);
  expect(result.ok).toBe(false);
  if (result.ok) return; // type narrowing; unreachable after expect(false)
  for (const fragment of fragments) {
    expect(result.error).toContain(fragment);
  }
}

describe('pack schema — valid pack', () => {
  it('accepts a well-formed pack and exposes its identity/collections', () => {
    const result = validatePack(validFantasyPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pack: Pack = result.pack;
    expect(pack.id).toBe('fantasy-core');
    expect(pack.version).toBe(PACK_VERSION);
    expect(pack.classes).toHaveLength(2);
    expect(pack.monsters).toHaveLength(1);
    expect(pack.items).toHaveLength(2);
  });

  it('produces a JSON-clean validated pack (round-trips losslessly)', () => {
    const result = validatePack(validFantasyPack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.pack);
    expect(JSON.stringify(JSON.parse(serialized))).toBe(serialized);
    expect(JSON.parse(serialized)).toEqual(result.pack);
  });
});

describe('pack schema — identity is rejected when missing/empty', () => {
  it('rejects a missing id', () => {
    const pack = validFantasyPack();
    delete pack.id;
    expectFailureWith(pack, 'id');
  });

  it('rejects an empty id', () => {
    const pack = validFantasyPack();
    pack.id = '';
    expectFailureWith(pack, 'id');
  });

  it('rejects a missing name', () => {
    const pack = validFantasyPack();
    delete pack.name;
    expectFailureWith(pack, 'name');
  });

  it('rejects an empty name', () => {
    const pack = validFantasyPack();
    pack.name = '';
    expectFailureWith(pack, 'name');
  });

  it('rejects a missing version', () => {
    const pack = validFantasyPack();
    delete pack.version;
    expectFailureWith(pack, 'version');
  });

  it('rejects an unsupported version and names the version', () => {
    const pack = validFantasyPack();
    pack.version = 999;
    expectFailureWith(pack, 'version', '999');
  });

  it('rejects a previous-version (1) pack and names the version', () => {
    const pack = validFantasyPack();
    pack.version = 1;
    expectFailureWith(pack, 'version', '1', `version ${PACK_VERSION}`);
  });

  it('rejects a non-numeric version', () => {
    const pack = validFantasyPack();
    pack.version = 'one';
    expectFailureWith(pack, 'version');
  });
});

describe('pack schema — duplicate ids within a collection', () => {
  it('rejects duplicate class ids and names the id', () => {
    const pack = validFantasyPack();
    pack.classes = [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 4 },
      { id: 'fighter', name: 'Fighter Two', glyph: 'f', hp: 10, attack: 3 },
    ];
    expectFailureWith(pack, 'class', 'fighter');
  });

  it('rejects duplicate monster ids and names the id', () => {
    const pack = validFantasyPack();
    pack.monsters = [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 'chase', attack: 2 },
      { id: 'goblin', name: 'Goblin Chief', glyph: 'G', hp: 9, behavior: 'chase', attack: 3 },
    ];
    expectFailureWith(pack, 'monster', 'goblin');
  });

  it('rejects duplicate item ids and names the id', () => {
    const pack = validFantasyPack();
    pack.items = [
      { id: 'potion', name: 'Potion', glyph: '!', effect: { kind: 'heal', amount: 5 } },
      { id: 'potion', name: 'Big Potion', glyph: 'P', effect: { kind: 'heal', amount: 9 } },
    ];
    expectFailureWith(pack, 'item', 'potion');
  });

  it('does not reject the same id across different collections', () => {
    const pack = validFantasyPack();
    pack.monsters = [
      { id: 'rogue', name: 'Rogue Wolf', glyph: 'w', hp: 6, behavior: 'chase', attack: 2 },
    ];
    expect(validatePack(pack).ok).toBe(true);
  });
});

describe('pack schema — missing required stat', () => {
  it('rejects a class missing hp and names the entry path', () => {
    const pack = validFantasyPack();
    pack.classes = [{ id: 'fighter', name: 'Fighter', glyph: 'F' }];
    expectFailureWith(pack, 'classes[0]', 'hp');
  });

  it('rejects a monster missing hp', () => {
    const pack = validFantasyPack();
    pack.monsters = [{ id: 'goblin', name: 'Goblin', glyph: 'g' }];
    expectFailureWith(pack, 'monsters[0]', 'hp');
  });

  it('rejects a class with zero/negative hp (positive required)', () => {
    const pack = validFantasyPack();
    pack.classes = [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 0 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: -3 },
    ];
    expectFailureWith(pack, 'hp');
  });

  it('rejects a monster missing behavior and names the entry path', () => {
    const pack = validFantasyPack();
    pack.monsters = [{ id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, attack: 2 }];
    expectFailureWith(pack, 'monsters[0]', 'behavior');
  });

  it('rejects a monster missing attack and names the entry path', () => {
    const pack = validFantasyPack();
    pack.monsters = [{ id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 'chase' }];
    expectFailureWith(pack, 'monsters[0]', 'attack');
  });

  it('rejects a class missing attack and names the entry path', () => {
    const pack = validFantasyPack();
    pack.classes = [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 8, attack: 3 },
    ];
    expectFailureWith(pack, 'classes[0]', 'attack');
  });

  it('rejects a class with zero/negative attack (positive required)', () => {
    const pack = validFantasyPack();
    pack.classes = [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 12, attack: 0 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 8, attack: -3 },
    ];
    expectFailureWith(pack, 'attack');
  });

  it('rejects a monster with zero/negative attack (positive required)', () => {
    const pack = validFantasyPack();
    pack.monsters = [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 'chase', attack: 0 },
    ];
    expectFailureWith(pack, 'attack');
  });

  it('rejects an item that declares neither an effect nor a ranged descriptor', () => {
    const pack = validFantasyPack();
    pack.items = [{ id: 'potion', name: 'Potion', glyph: '!' }];
    expectFailureWith(pack, 'items[0]', 'effect', 'ranged');
  });

  it('rejects an item effect with an unknown kind', () => {
    const pack = validFantasyPack();
    pack.items = [
      { id: 'wand', name: 'Wand', glyph: '/', effect: { kind: 'explode', radius: 3 } },
    ];
    expectFailureWith(pack, 'items[0]', 'effect');
  });
});

describe('pack schema — ranged weapon descriptor', () => {
  it('accepts a weapon-only item that declares ranged and no effect', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'shortbow',
        name: 'Shortbow',
        glyph: ')',
        ranged: { range: 6, damage: 4 },
      },
    ];

    const result = validatePack(pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const weapon = result.pack.items[0];
    expect(weapon.effect).toBeUndefined();
    expect(weapon.ranged).toEqual({ range: 6, damage: 4 });
  });

  it('rejects an item that declares neither effect nor ranged and names both', () => {
    const pack = validFantasyPack();
    pack.items = [{ id: 'inert', name: 'Inert Thing', glyph: '?' }];
    expectFailureWith(pack, 'items[0]', 'effect', 'ranged');
  });

  it('accepts an item that declares both an effect and a ranged descriptor', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'flaming-sword',
        name: 'Flaming Sword',
        glyph: '/',
        effect: { kind: 'heal', amount: 1 },
        ranged: { range: 2, damage: 3 },
      },
    ];
    expect(validatePack(pack).ok).toBe(true);
  });

  it('rejects a non-integer range at the ranged path', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'shortbow',
        name: 'Shortbow',
        glyph: ')',
        ranged: { range: 2.5, damage: 4 },
      },
    ];
    expectFailureWith(pack, 'items[0]', 'ranged', 'range');
  });

  it('rejects a non-positive damage at the ranged path', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'shortbow',
        name: 'Shortbow',
        glyph: ')',
        ranged: { range: 6, damage: 0 },
      },
    ];
    expectFailureWith(pack, 'items[0]', 'ranged', 'damage');
  });
});

describe('pack schema — wrong-typed field', () => {
  it('rejects a non-string glyph and reports the glyph path', () => {
    const pack = validFantasyPack();
    pack.monsters = [{ id: 'goblin', name: 'Goblin', glyph: 42, hp: 4 }];
    expectFailureWith(pack, 'monsters[0]', 'glyph');
  });

  it('rejects a multi-character glyph', () => {
    const pack = validFantasyPack();
    pack.items = [
      { id: 'potion', name: 'Potion', glyph: 'ab', effect: { kind: 'heal', amount: 5 } },
    ];
    expectFailureWith(pack, 'items[0]', 'glyph');
  });

  it('rejects a non-number hp and reports the hp path', () => {
    const pack = validFantasyPack();
    pack.classes = [
      { id: 'fighter', name: 'Fighter', glyph: 'F', hp: 'twelve', attack: 4 },
      { id: 'rogue', name: 'Rogue', glyph: 'R', hp: 8, attack: 3 },
    ];
    expectFailureWith(pack, 'classes[0]', 'hp');
  });

  it('rejects a numeric (non-string) behavior and reports the behavior path', () => {
    const pack = validFantasyPack();
    pack.monsters = [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: 7, attack: 2 },
    ];
    expectFailureWith(pack, 'monsters[0]', 'behavior');
  });

  it('rejects an empty behavior id', () => {
    const pack = validFantasyPack();
    pack.monsters = [
      { id: 'goblin', name: 'Goblin', glyph: 'g', hp: 4, behavior: '', attack: 2 },
    ];
    expectFailureWith(pack, 'monsters[0]', 'behavior');
  });

  it('rejects a missing (rather than empty) collection', () => {
    const pack = validFantasyPack();
    delete pack.items;
    expectFailureWith(pack, 'items');
  });
});

describe('pack schema — roll-heal range', () => {
  it('rejects a reversed range and names the constraint', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'herb',
        name: 'Herb',
        glyph: '*',
        effect: { kind: 'roll-heal', min: 10, max: 2 },
      },
    ];
    expectFailureWith(pack, 'roll-heal', 'max', 'min');
  });

  it('accepts a valid range', () => {
    const pack = validFantasyPack();
    pack.items = [
      {
        id: 'herb',
        name: 'Herb',
        glyph: '*',
        effect: { kind: 'roll-heal', min: 1, max: 4 },
      },
    ];
    expect(validatePack(pack).ok).toBe(true);
  });
});

describe('pack schema — theme-agnostic proof', () => {
  it('validates a non-fantasy (sci-fi) pack under the same schema', () => {
    const sciFiPack = {
      id: 'sci-fi-core',
      name: 'Orbital Station',
      version: PACK_VERSION,
      classes: [
        { id: 'android', name: 'Android', glyph: 'A', hp: 14, attack: 5, description: 'Synthetic.' },
        { id: 'engineer', name: 'Engineer', glyph: 'E', hp: 9, attack: 3 },
      ],
      monsters: [
        { id: 'drone', name: 'Security Drone', glyph: 'd', hp: 5, behavior: 'chase', attack: 2 },
      ],
      items: [
        {
          id: 'laser-pistol',
          name: 'Laser Pistol',
          glyph: ')',
          effect: { kind: 'roll-heal', min: 2, max: 8 },
        },
      ],
    };

    const fantasy = validatePack(validFantasyPack());
    const sciFi = validatePack(sciFiPack);

    expect(fantasy.ok).toBe(true);
    expect(sciFi.ok).toBe(true);

    // No schema change was needed: both share the same shape and version.
    if (fantasy.ok && sciFi.ok) {
      expect(fantasy.pack.version).toBe(sciFi.pack.version);
      expect(Object.keys(fantasy.pack).sort()).toEqual(
        Object.keys(sciFi.pack).sort(),
      );
      expect(sciFi.pack.items[0].name).toBe('Laser Pistol');
      expect(sciFi.pack.monsters[0].id).toBe('drone');
    }
  });
});

describe('pack schema — validator does not mutate its input', () => {
  it('leaves the raw input byte-identical after validation', () => {
    const raw = validFantasyPack();
    const before = clone(raw);
    validatePack(raw);
    expect(raw).toEqual(before);
  });
});
