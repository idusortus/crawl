/**
 * Pure "what is underfoot?" helpers for the client HUD object/description line.
 *
 * Framework-free — no React, no React Native — so the description of the tile
 * the player is standing on can be unit-tested under the node Vitest
 * environment, exactly like `stairs.ts`/`glyphs.ts`/`ranged.ts`. It imports only
 * the `@engine` public surface (types + the pure `entityById`/`isFeature`/
 * `isStairs` helpers), so the value it derives is presentation-only and never
 * enters `GameState`.
 *
 * The player's tile can hold one of two notable things and they are resolved in
 * that order:
 *  - a **floor item** — an `Entity` carrying the engine's `item: true`
 *    discriminator (`isFeature`); its display strings come from the loaded pack.
 *  - the **stairs** — a `Level` position, not an entity (detected with
 *    `isStairs`). The engine has no ascend command, so this is always "stairs
 *    down".
 *
 * A pack item's `description` is optional and none of this repo's packs set it,
 * so the generic fallback detail is the common path. Every pack lookup is
 * fallible (`LoadedPack.item` throws `UnknownContentIdError` on a miss), so an
 * unknown id degrades to a safe generic label instead of crashing the HUD.
 */

import { entityById, isFeature, isStairs } from '@engine';
import type { Entity, GameState, LoadedPack } from '@engine';

/** Title shown when a floor item's kind is absent from the loaded pack. */
export const UNKNOWN_ITEM_TITLE = 'Unknown item';

/**
 * Generic detail for a floor item with no `description` (or an unresolvable
 * kind). Packs do not currently author item descriptions, so this is what the
 * HUD usually shows for an item.
 */
export const GENERIC_ITEM_DETAIL = 'An item resting on the floor.';

/** Title for the stairs tile (the engine has no ascend, so it is always down). */
export const STAIRS_TITLE = 'Stairs down';

/** Detail for the stairs tile. */
export const STAIRS_DETAIL = 'A stairway descending to the next level.';

/** The player entity, or `undefined` when state has no such entity. */
function playerAt(state: GameState): Entity | undefined {
  return entityById(state.entities, state.playerId);
}

/**
 * The floor-item entity (`isFeature`) on the player's tile, if any.
 *
 * Scans `state.entities` rather than taking the first `entityAt` occupant: the
 * player and a floor item share a tile after the player steps onto it, and
 * whichever of the two sorts first in `entities` must not decide the result. A
 * missing player entity yields `undefined`.
 */
export function floorItemAt(state: GameState): Entity | undefined {
  const player = playerAt(state);
  if (player === undefined) return undefined;
  for (const entity of state.entities) {
    if (
      isFeature(entity) &&
      entity.pos.x === player.pos.x &&
      entity.pos.y === player.pos.y
    ) {
      return entity;
    }
  }
  return undefined;
}

/**
 * True when the player's tile is the level's stairs tile. `false` when the
 * player entity is absent. Mirrors the engine's `isStairs` position check.
 */
export function isOnStairs(state: GameState): boolean {
  const player = playerAt(state);
  if (player === undefined) return false;
  return isStairs(player.pos, state.level.stairs);
}

/** The render-ready description of the player's tile. */
export interface ObjectInfo {
  /** Short heading, e.g. the pack item's name or "Stairs down". */
  title: string;
  /** One-line supporting detail. */
  detail: string;
}

/**
 * Describes whatever the player is standing on, or `undefined` for an empty
 * tile.
 *
 * A floor item wins over the stairs (a visible item on the stairs tile is what
 * the player should read). The item's title is its pack `name`; its detail is
 * the pack `description` when set, else {@link GENERIC_ITEM_DETAIL}. An item
 * whose `kind` the pack does not define — `pack.item` throws — falls back to
 * {@link UNKNOWN_ITEM_TITLE} with the generic detail, so a bad reference is
 * shown, never thrown at the HUD. With no item, the stairs tile yields
 * {@link STAIRS_TITLE}/{@link STAIRS_DETAIL}; otherwise `undefined`.
 */
export function objectInfoAt(
  state: GameState,
  pack: LoadedPack,
): ObjectInfo | undefined {
  const item = floorItemAt(state);
  if (item !== undefined) {
    try {
      const entry = pack.item(item.kind);
      return {
        title: entry.name,
        detail: entry.description ?? GENERIC_ITEM_DETAIL,
      };
    } catch {
      return { title: UNKNOWN_ITEM_TITLE, detail: GENERIC_ITEM_DETAIL };
    }
  }
  if (isOnStairs(state)) {
    return { title: STAIRS_TITLE, detail: STAIRS_DETAIL };
  }
  return undefined;
}
