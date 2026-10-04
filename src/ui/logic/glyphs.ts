/**
 * Pure glyph resolution for the tile renderer (change `expo-glyph-renderer`,
 * design D6; task 3.2).
 *
 * This module is deliberately framework-free — no React, no React Native — so
 * it can be unit-tested under the node Vitest environment and so the pack
 * lookups are separated from layout. It imports only the `@engine` public
 * surface (types + `LoadedPack`) and the color tokens.
 *
 * Design D6 rules encoded here:
 *  - Entity glyphs are sourced from the loaded pack's `glyph` fields
 *    (`pack.class` / `pack.monster` / `pack.item`).
 *  - EVERY pack lookup is fallible: the `LoadedPack` resolvers throw
 *    `UnknownContentIdError` on a miss rather than returning `undefined`, so
 *    each lookup is wrapped and falls back to the safe glyph `?`. An entity
 *    kind present in state but absent from the pack is therefore rendered, never
 *    crashed on.
 *  - Terrain is a documented pair: `.` for passable floor, `#` for a wall.
 *  - Visibility is a three-way treatment (visible > explored > unseen); unseen
 *    tiles reveal nothing, so their glyph is the blank string.
 */

import type { Entity, LoadedPack } from '@engine';

import { colors } from '../theme/colors';
import type { ThemeColors } from '../theme/colors';

/** The glyph shown for an entity whose kind the pack does not define. */
export const UNKNOWN_GLYPH = '?';

/** The glyph for a passable floor tile. */
export const FLOOR_GLYPH = '.';

/** The glyph for a non-passable wall tile. */
export const WALL_GLYPH = '#';

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
  /** The loaded pack, needed only to resolve an entity glyph. */
  pack: LoadedPack;
  /** True when `entity` is the player (renderer distinguishes it). */
  isPlayer?: boolean;
  /** Palette override for tests; defaults to the shared `colors`. */
  palette?: ThemeColors;
}

/**
 * Resolves the complete render pair for a tile: terrain or the entity over it,
 * plus the color for its visibility state.
 *
 * Unseen tiles short-circuit: no glyph and the unseen background, revealing
 * nothing about terrain or occupants. On a seen tile the occupant's glyph is
 * drawn only while the tile is currently `visible`; an explored-but-not-visible
 * tile shows terrain alone (dimmed), never an occupant that has since left FOV.
 */
export function tileRender(input: TileRenderInput): TileRender {
  const { passable, visible, explored, entity, pack, isPlayer } = input;
  const palette = input.palette ?? colors;

  if (!visible && !explored) {
    return {
      glyph: UNSEEN_GLYPH,
      color: visibilityStyle(false, false, palette),
      backgroundColor: palette.unseen,
    };
  }

  let glyph = terrainGlyph(passable);
  if (visible && entity !== undefined) {
    glyph = entityGlyph(pack, entity);
  }

  const dimmed = !visible;
  const color = dimmed
    ? visibilityStyle(false, true, palette)
    : isPlayer === true
      ? palette.player
      : entity !== undefined
        ? palette.entity
        : passable
          ? palette.floor
          : palette.wall;

  return { glyph, color, backgroundColor: palette.background };
}
