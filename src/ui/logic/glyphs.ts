/**
 * Pure glyph resolution for the tile renderer (change `expo-glyph-renderer`,
 * design D6; task 3.2; extended by `core-gameplay-loop` task 9.1 / design D10).
 *
 * This module is deliberately framework-free — no React, no React Native — so
 * it can be unit-tested under the node Vitest environment and so the pack
 * lookups are separated from layout. It imports only the `@engine` public
 * surface (types + `LoadedPack`) and the color tokens.
 *
 * Rules encoded here:
 *  - Entity glyphs are sourced from the loaded pack's `glyph` fields
 *    (`pack.class` / `pack.monster` / `pack.item`). Monsters and floor items
 *    now carry `hp`/`behavior`/`attack` and the `item: true` discriminator
 *    respectively, but glyph resolution still reads only `kind`.
 *  - Stairs are a terrain feature, not an entity: they have no pack entry and
 *    are drawn from the level's `stairs` position with the exported
 *    {@link STAIRS_GLYPH} (`'>'`).
 *  - EVERY pack lookup is fallible: the `LoadedPack` resolvers throw
 *    `UnknownContentIdError` on a miss rather than returning `undefined`, so
 *    each lookup is wrapped and falls back to the safe glyph `?`. An entity
 *    kind present in state but absent from the pack is therefore rendered, never
 *    crashed on.
 *  - Terrain is a documented pair: `.` for passable floor, `#` for a wall.
 *  - Visibility is a three-way treatment (visible > explored > unseen); unseen
 *    tiles reveal nothing, so their glyph is the blank string. Monsters render
 *    only when visible. A floor item is a remembered feature too: an explored-
 *    but-not-visible tile holding one keeps showing the item's pack glyph
 *    (dimmed), just like the stairs keep {@link STAIRS_GLYPH} (dimmed).
 */

import { isFeature as isItemEntity } from '@engine';
import type { Entity, LoadedPack, Position } from '@engine';

import { colors } from '../theme/colors';
import type { ThemeColors } from '../theme/colors';

/** The glyph shown for an entity whose kind the pack does not define. */
export const UNKNOWN_GLYPH = '?';

/** The glyph for a passable floor tile. */
export const FLOOR_GLYPH = '.';

/** The glyph for a non-passable wall tile. */
export const WALL_GLYPH = '#';

/** The glyph for the stairs terrain feature (`>`), which has no pack entry. */
export const STAIRS_GLYPH = '>';

/** The glyph for a tile the player has never seen — renders nothing. */
export const UNSEEN_GLYPH = ' ';

/** Terrain glyph for a tile, by passability. Passable ⇒ floor `.`, else wall `#`. */
export function terrainGlyph(passable: boolean): string {
  return passable ? FLOOR_GLYPH : WALL_GLYPH;
}

/**
 * Resolves the glyph for `entity` from the loaded pack.
 *
 * Tries each collection in turn (`class` → `monster` → `item`) because an
 * `Entity` stores only `kind`, not which collection its kind came from. A miss
 * in every collection — or any lookup throw — returns {@link UNKNOWN_GLYPH}
 * instead of propagating the error (design D6). Never throws.
 */
export function entityGlyph(pack: LoadedPack, entity: Entity): string {
  const lookups: readonly (() => { glyph: string })[] = [
    () => pack.class(entity.kind),
    () => pack.monster(entity.kind),
    () => pack.item(entity.kind),
  ];
  for (const lookup of lookups) {
    try {
      return lookup().glyph;
    } catch {
      // `UnknownContentIdError` (or anything else) — try the next collection.
    }
  }
  return UNKNOWN_GLYPH;
}

/** The three-way visibility category, ordered visible > explored > unseen. */
export type VisibilityCategory = 'visible' | 'explored' | 'unseen';

/**
 * Returns true when the run has ended and the renderer must show the game-over
 * surface instead of the play view (spec: glyph-renderer "The terminal status is
 * surfaced"). Kept a pure predicate so the terminal decision is unit-testable
 * without a renderer and so `GameScreen` cannot drift from the state enum.
 */
export function isTerminal(status: 'playing' | 'dead'): boolean {
  return status === 'dead';
}

/**
 * Classifies a tile's visibility. `visible` wins over `explored`; a tile that
 * is neither is `unseen` (design D5/D6).
 */
export function visibilityCategory(
  visible: boolean,
  explored: boolean,
): VisibilityCategory {
  if (visible) return 'visible';
  if (explored) return 'explored';
  return 'unseen';
}

/**
 * Maps a tile's visibility to its foreground color token, always reading the
 * passed `palette` so a custom theme is honored. Unseen tiles map to the unseen
 * background (they draw no glyph), so this is only meaningful for the
 * visible/explored categories.
 */
export function visibilityStyle(
  visible: boolean,
  explored: boolean,
  palette: ThemeColors = colors,
): string {
  const category = visibilityCategory(visible, explored);
  if (category === 'visible') return palette.visible;
  if (category === 'explored') return palette.explored;
  return palette.unseen;
}

/** The resolved render pair for a single tile. */
export interface TileRender {
  /** The character drawn for the tile (blank when unseen). */
  glyph: string;
  /** The glyph's foreground color. */
  color: string;
  /** The tile's background color. */
  backgroundColor: string;
}

/** Input for {@link tileRender}; all fields are plain data. */
export interface TileRenderInput {
  /** Tile passability from `grid.passable[index]`. */
  passable: boolean;
  /** Whether the tile is currently in FOV. */
  visible: boolean;
  /** Whether the tile has ever been seen (`state.explored[index]`). */
  explored: boolean;
  /** The entity occupying the tile, if any (`entityAt(...)`). */
  entity?: Entity;
  /**
   * The tile's own coordinates. Required to test it against `stairs`; when
   * omitted, a `stairs` input cannot match (so stairs simply are not drawn).
   */
  pos?: Position;
  /**
   * The level's stairs position (`state.level.stairs`). When supplied and equal
   * to `pos`, the tile is a stairs feature. Stairs are not an entity and have no
   * pack entry, so they are drawn with {@link STAIRS_GLYPH} rather than a pack
   * lookup.
   */
  stairs?: Position;
  /** The loaded pack, needed only to resolve an entity glyph. */
  pack: LoadedPack;
  /** True when `entity` is the player (renderer distinguishes it). */
  isPlayer?: boolean;
  /** Palette override for tests; defaults to the shared `colors`. */
  palette?: ThemeColors;
}

/**
 * Resolves the complete render pair for a tile: terrain, stairs, or the entity
 * over it, plus the color for its visibility state.
 *
 * Unseen tiles short-circuit: no glyph and the unseen background, revealing
 * nothing about terrain or occupants. On a seen tile an occupant's glyph is
 * drawn while the tile is currently `visible`. On an explored-but-not-visible
 * tile a **floor item**'s glyph is still drawn (dimmed) so remembered features
 * stay findable, while a monster is hidden and only the flat terrain shows. The
 * stairs are likewise remembered, so the stairs glyph is drawn whenever the
 * tile is seen — visible or merely explored — dimmed in the explored-only case
 * (change `mobile-client-playability`, design D5).
 *
 * Precedence on a visible tile is entity over stairs over terrain: a monster or
 * item standing on the stairs tile is what the player must see. On a remembered
 * tile a floor item likewise takes precedence over remembered stairs.
 */
export function tileRender(input: TileRenderInput): TileRender {
  const { passable, visible, explored, entity, pos, stairs, pack, isPlayer } =
    input;
  const palette = input.palette ?? colors;

  if (!visible && !explored) {
    return {
      glyph: UNSEEN_GLYPH,
      color: visibilityStyle(false, false, palette),
      backgroundColor: palette.unseen,
    };
  }

  const onStairs =
    pos !== undefined &&
    stairs !== undefined &&
    pos.x === stairs.x &&
    pos.y === stairs.y;

  let glyph = terrainGlyph(passable);
  let isFeature = false;
  if (visible && entity !== undefined) {
    // A visible occupant (monster, item, or player) wins over stairs/terrain.
    glyph = entityGlyph(pack, entity);
    isFeature = true;
  } else if (!visible && entity !== undefined && isItemEntity(entity)) {
    // A remembered floor item stays drawn (dimmed), taking precedence over
    // remembered stairs to mirror the visible-tile rule. Only the item
    // discriminator qualifies, so monsters remain hidden on remembered tiles.
    glyph = entityGlyph(pack, entity);
    isFeature = true;
  } else if (onStairs) {
    // Reached only when the tile is seen (the unseen case returned above), so
    // this covers both visible stairs and remembered (explored-only) stairs.
    glyph = STAIRS_GLYPH;
    isFeature = true;
  }

  const dimmed = !visible;
  const color = dimmed
    ? visibilityStyle(false, true, palette)
    : isPlayer === true
      ? palette.player
      : isFeature
        ? palette.entity
        : passable
          ? palette.floor
          : palette.wall;

  return { glyph, color, backgroundColor: palette.background };
}
