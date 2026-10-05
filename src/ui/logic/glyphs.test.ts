/**
 * Pure unit tests for the glyph resolver (change `expo-glyph-renderer`, task
 * 3.3; design D6/D8).
 *
 * No React, no React Native — this file runs under the node Vitest environment
 * (Phase 5 widens `vitest.config.ts` to include the `src/ui` test glob). The
 * pack is loaded through the public `@engine` surface, mirroring the app.
 */

import { describe, expect, it } from 'vitest';

import { entityAt, loadPack } from '@engine';
import type { Entity, LoadedPack, Position } from '@engine';

import { fantasyPack } from '../../packs/fantasy';
import { colors } from '../theme/colors';
import { PLAYER_CLASS_ID } from '../state/createInitialState';

import {
  entityGlyph,
  FLOOR_GLYPH,
  isTerminal,
  STAIRS_GLYPH,
  terrainGlyph,
  tileRender,
  UNKNOWN_GLYPH,
  UNSEEN_GLYPH,
  visibilityCategory,
  visibilityStyle,
  WALL_GLYPH,
} from './glyphs';

const pack: LoadedPack = loadPack(fantasyPack);

const POS: Position = { x: 1, y: 1 };

/** A minimal entity; `kind` is the only field glyph resolution reads. */
function entity(kind: string, pos: Position = POS): Entity {
  return { id: `entity-${kind}`, kind, pos };
}

describe('terrainGlyph', () => {
  it('renders a passable tile as floor "."', () => {
    expect(terrainGlyph(true)).toBe(FLOOR_GLYPH);
  });

  it('renders a non-passable tile as wall "#"', () => {
    expect(terrainGlyph(false)).toBe(WALL_GLYPH);
  });
});

describe('entityGlyph', () => {
  it("resolves the player's glyph from its class via PLAYER_CLASS_ID", () => {
    // The player entity's kind is the class id; the pack defines its glyph.
    expect(entityGlyph(pack, entity(PLAYER_CLASS_ID))).toBe(
      pack.class(PLAYER_CLASS_ID).glyph,
    );
  });

  it('resolves a pack-sourced monster glyph', () => {
    const monster = pack.pack.monsters[0];
    expect(entityGlyph(pack, entity(monster.id))).toBe(monster.glyph);
  });

  it('resolves a pack-sourced item glyph', () => {
    const item = pack.pack.items[0];
    expect(entityGlyph(pack, entity(item.id))).toBe(item.glyph);
  });

  it('falls back to "?" for an unknown kind and never throws', () => {
    const unknown = entity('kind-absent-from-pack');

    expect(() => entityGlyph(pack, unknown)).not.toThrow();
    expect(entityGlyph(pack, unknown)).toBe(UNKNOWN_GLYPH);
  });
});

describe('visibilityCategory', () => {
  it('prefers visible over explored', () => {
    expect(visibilityCategory(true, true)).toBe('visible');
    expect(visibilityCategory(true, false)).toBe('visible');
  });

  it('falls to explored when not visible', () => {
    expect(visibilityCategory(false, true)).toBe('explored');
  });

  it('falls to unseen when neither', () => {
    expect(visibilityCategory(false, false)).toBe('unseen');
  });
});

describe('tileRender', () => {
  const base = { passable: true, pack };

  it('reveals nothing on an unseen tile', () => {
    const render = tileRender({ ...base, visible: false, explored: false });

    expect(render.glyph).toBe(UNSEEN_GLYPH);
    // An occupant must not leak through: unseen still draws no entity glyph.
    const withEntity = tileRender({
      ...base,
      visible: false,
      explored: false,
      entity: entity('goblin'),
    });
    expect(withEntity.glyph).toBe(UNSEEN_GLYPH);
    expect(withEntity.backgroundColor).toBe(render.backgroundColor);
  });

  it('draws terrain when no entity occupies a seen tile', () => {
    expect(tileRender({ ...base, visible: true, explored: true }).glyph).toBe(
      FLOOR_GLYPH,
    );
    expect(
      tileRender({ ...base, passable: false, visible: true, explored: true })
        .glyph,
    ).toBe(WALL_GLYPH);
  });

  it('draws the occupant glyph over a seen tile', () => {
    const goblin = pack.pack.monsters[0];
    const render = tileRender({
      ...base,
      visible: true,
      explored: true,
      entity: entity(goblin.id),
    });
    expect(render.glyph).toBe(goblin.glyph);
  });

  it('shows only terrain on an explored-but-not-visible tile, never an occupant', () => {
    const goblin = pack.pack.monsters[0];

    const floor = tileRender({
      ...base,
      visible: false,
      explored: true,
      entity: entity(goblin.id),
    });
    expect(floor.glyph).toBe(FLOOR_GLYPH);
    expect(floor.glyph).not.toBe(goblin.glyph);

    const wall = tileRender({
      ...base,
      passable: false,
      visible: false,
      explored: true,
      entity: entity(goblin.id),
    });
    expect(wall.glyph).toBe(WALL_GLYPH);
  });

  it('renders an unknown occupant kind as the safe fallback', () => {
    const render = tileRender({
      ...base,
      visible: true,
      explored: true,
      entity: entity('not-in-any-collection'),
    });
    expect(render.glyph).toBe(UNKNOWN_GLYPH);
  });

  it('dims an explored-but-not-visible tile relative to a visible one', () => {
    const seen = tileRender({ ...base, visible: true, explored: true });
    const remembered = tileRender({ ...base, visible: false, explored: true });

    expect(remembered.color).not.toBe(seen.color);
    expect(remembered.glyph).toBe(FLOOR_GLYPH);
  });

  it('places an entity through entityAt without losing the glyph', () => {
    const goblin = pack.pack.monsters[0];
    const entities = [entity(goblin.id, POS)];
    const occupant = entityAt(entities, POS);

    const render = tileRender({
      ...base,
      visible: true,
      explored: true,
      entity: occupant,
    });
    expect(render.glyph).toBe(goblin.glyph);
  });

  it('honors a custom palette for every visibility treatment', () => {
    const palette = {
      ...colors,
      visible: '#010101',
      explored: '#020202',
      unseen: '#030303',
      background: '#040404',
    };

    // The visible/explored/unseen tokens are exposed through `visibilityStyle`;
    // `tileRender` must route explored/unseen through the same passed palette.
    expect(visibilityStyle(true, true, palette)).toBe(palette.visible);
    expect(visibilityStyle(false, true, palette)).toBe(palette.explored);
    expect(visibilityStyle(false, false, palette)).toBe(palette.unseen);

    expect(
      tileRender({ ...base, visible: false, explored: true, palette }).color,
    ).toBe(palette.explored);
    expect(
      tileRender({ ...base, visible: false, explored: false, palette }).color,
    ).toBe(palette.unseen);
  });
});

describe('tileRender — stairs (change core-gameplay-loop, task 9.1)', () => {
  const base = { passable: true, pack };
  const STAIRS: Position = { x: 3, y: 2 };

  it('draws STAIRS_GLYPH on a visible stairs tile, distinct from floor', () => {
    const render = tileRender({
      ...base,
      visible: true,
      explored: true,
      pos: STAIRS,
      stairs: STAIRS,
    });

    expect(render.glyph).toBe(STAIRS_GLYPH);
    expect(render.glyph).not.toBe(FLOOR_GLYPH);
  });

  it('does not draw stairs on a visible non-stairs tile', () => {
    const elsewhere = tileRender({
      ...base,
      visible: true,
      explored: true,
      pos: { x: STAIRS.x + 1, y: STAIRS.y },
      stairs: STAIRS,
    });

    expect(elsewhere.glyph).toBe(FLOOR_GLYPH);
  });

  it('shows flat terrain on an explored-but-not-visible stairs tile', () => {
    const remembered = tileRender({
      ...base,
      visible: false,
      explored: true,
      pos: STAIRS,
      stairs: STAIRS,
    });

    // The explored-but-not-visible rule governs stairs too.
    expect(remembered.glyph).toBe(FLOOR_GLYPH);
    expect(remembered.glyph).not.toBe(STAIRS_GLYPH);
  });

  it('reveals nothing on an unseen stairs tile', () => {
    const unseen = tileRender({
      ...base,
      visible: false,
      explored: false,
      pos: STAIRS,
      stairs: STAIRS,
    });

    expect(unseen.glyph).toBe(UNSEEN_GLYPH);
  });

  it('prefers a visible occupant over the stairs glyph on a shared tile', () => {
    const item = pack.pack.items[0];
    const render = tileRender({
      ...base,
      visible: true,
      explored: true,
      entity: entity(item.id, STAIRS),
      pos: STAIRS,
      stairs: STAIRS,
    });

    expect(render.glyph).toBe(item.glyph);
    expect(render.glyph).not.toBe(STAIRS_GLYPH);
  });
});

describe('isTerminal (change core-gameplay-loop, task 9.1)', () => {
  it('is false while the run is playing', () => {
    expect(isTerminal('playing')).toBe(false);
  });

  it('is true once the run is dead', () => {
    expect(isTerminal('dead')).toBe(true);
  });
});
