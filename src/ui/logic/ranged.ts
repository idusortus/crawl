/**
 * Pure ranged-weapon helpers for the client (change
 * `mobile-client-playability`, design D3/D7; tasks 6.1/6.3/6.4).
 *
 * Framework-free — no React, no React Native — so the ranged-control
 * visibility and the target-mode hit-selection can be unit-tested under the
 * node Vitest environment (design D8), with no renderer. Both answers are
 * derived from live state + the loaded pack, so "carries a ranged weapon" and
 * "this tap is a valid target" have exactly one definition shared by the
 * component that renders the control and the component that interprets the tap.
 *
 * The client never resolves the weapon's damage/range itself: it only decides
 * *whether* the player has a ranged weapon (to show/hide the control) and
 * *whether* a tap landed on a visible living monster. The engine remains the
 * authority on range, visibility, damage, and death.
 */

import { attackTargetAt, inBounds, indexOf } from '@engine';
import type { Entity, Grid, LoadedPack, Position } from '@engine';

/**
 * True when `id` resolves to a pack item declaring a `ranged` descriptor.
 *
 * A pack lookup miss throws `UnknownContentIdError`; an id absent from the pack
 * is simply not a ranged weapon (never a crash), matching how the glyph
 * resolver treats fallible pack lookups. `undefined` pack means "not loaded",
 * so nothing is a weapon.
 */
export function isRangedWeapon(
  pack: LoadedPack | undefined,
  id: string,
): boolean {
  if (pack === undefined) return false;
  try {
    return pack.item(id).ranged !== undefined;
  } catch {
    return false;
  }
}

/**
 * True when the player carries at least one ranged weapon, so the ranged
 * control may be rendered (it is hidden otherwise). Derived from
 * `carriedItemIds` in list order — the same order the engine uses to pick the
 * equipped weapon — but only the boolean is needed here.
 */
export function hasRangedWeapon(
  pack: LoadedPack | undefined,
  carriedItemIds: readonly string[],
): boolean {
  return carriedItemIds.some((id) => isRangedWeapon(pack, id));
}

/**
 * The valid ranged target on `tile`, or `undefined`.
 *
 * In target mode a tap is a shot only when it lands on a **currently visible
 * living monster that is not the player**; every other case (out of bounds,
 * unseen/explored-only, empty, an item, or the player's own tile) returns
 * `undefined` so the caller cancels target mode without dispatching. Mirrors
 * the engine's target lookup (`attackTargetAt` = a living occupant) plus the
 * client's FOV mask, so the UI and the engine agree on what a "monster" is.
 */
export function rangedTargetAt(
  grid: Grid,
  entities: Entity[],
  visible: readonly boolean[],
  playerId: string,
  tile: Position,
): Entity | undefined {
  if (!inBounds(grid, tile)) return undefined;
  if (visible[indexOf(grid, tile)] !== true) return undefined;
  const occupant = attackTargetAt(entities, tile);
  if (occupant === undefined || occupant.id === playerId) return undefined;
  return occupant;
}
