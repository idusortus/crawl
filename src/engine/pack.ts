/**
 * Pack loader + id resolution (design D2/D5; spec: content/pack-loader).
 *
 * `loadPack(input)` is the single boundary at which unknown data becomes a
 * *usable* content pack. It:
 *
 *  1. validates `input` against the zod schema (`validatePack`), and
 *  2. enforces the **composition floor** the spec requires — at least two
 *     classes, at least one monster, and at least one item. The schema itself
 *     permits empty collections (so partial fixtures can be validated); "a
 *     usable pack" is a loader policy, owned here.
 *
 * On success it returns a `LoadedPack`: the original validated, JSON-clean
 * `pack` data plus id lookup (`class`/`monster`/`item`). Lookup misses throw a
 * typed `UnknownContentIdError`, never a silent `undefined` — an unknown id is
 * reported unambiguously (design D5).
 *
 * Failures are **loud**: an invalid or under-composed pack throws a typed
 * `PackLoadError` carrying the actionable, path-bearing validation message.
 * Callers that prefer a non-throwing result can call `validatePack` directly.
 *
 * The lookup index is a private `Map` held inside the closure and NEVER leaves
 * this module or appears in `LoadedPack.pack`/state, so serialized data stays
 * plain. This module must remain framework-free and deterministic (no
 * react/react-native/expo, no `Math.random`/`Date`), per the `src/engine`
 * boundary rules.
 */

import {
  PACK_VERSION,
  validatePack,
  type Pack,
  type PackClass,
  type PackItem,
  type PackMonster,
} from './schema/index';

/** The minimum number of classes a usable pack must declare (spec). */
export const MIN_CLASSES = 2;
/** The minimum number of monsters a usable pack must declare (spec). */
export const MIN_MONSTERS = 1;
/** The minimum number of items a usable pack must declare (spec). */
export const MIN_ITEMS = 1;

/** Error code for a pack that failed schema validation. */
export type PackLoadErrorCode = 'invalid-pack' | 'composition';

/**
 * Thrown when a pack cannot be loaded: either it fails schema validation, or it
 * is well-formed but does not meet the composition floor. `message` is always
 * actionable and names the failing field(s)/collection(s).
 */
export class PackLoadError extends Error {
  /** Which load step failed. */
  readonly code: PackLoadErrorCode;

  constructor(code: PackLoadErrorCode, message: string) {
    super(message);
    this.name = 'PackLoadError';
    this.code = code;
  }
}

/** The collection an id lookup was made against. */
export type ContentCollection = 'class' | 'monster' | 'item';

/**
 * Thrown when a class/monster/item id is requested but absent from the loaded
 * pack. Reports the id and collection so the caller cannot confuse a miss with
 * an empty value (design D5).
 */
export class UnknownContentIdError extends Error {
  /** The collection searched (`'class' | 'monster' | 'item'`). */
  readonly collection: ContentCollection;
  /** The id that was not found. */
  readonly id: string;
  /** The pack id the lookup was made against. */
  readonly packId: string;

  constructor(collection: ContentCollection, id: string, packId: string) {
    super(
      `unknown ${collection} id "${id}" in pack "${packId}"`,
    );
    this.name = 'UnknownContentIdError';
    this.collection = collection;
    this.id = id;
    this.packId = packId;
  }
}

/**
 * A validated, composition-checked content pack made available for id lookup.
 *
 * `pack` is the plain JSON-clean data exactly as validated (identity + the
 * three entry collections). The lookup methods return the entry or throw
 * `UnknownContentIdError`; they never return `undefined`.
 */
export interface LoadedPack {
  /** The validated pack data. Plain, JSON-clean, safe to serialize. */
  readonly pack: Pack;
  /** Resolve a class by id, or throw `UnknownContentIdError`. */
  class(id: string): PackClass;
  /** Resolve a monster by id, or throw `UnknownContentIdError`. */
  monster(id: string): PackMonster;
  /** Resolve an item by id, or throw `UnknownContentIdError`. */
  item(id: string): PackItem;
}

/**
 * Builds a private `id -> entry` index over a collection. Duplicate ids are
 * impossible here because `validatePack` already rejected them, so a later
 * entry would only ever overwrite an identical id; the first write wins
 * deterministically.
 */
function indexById<TEntry extends { id: string }>(
  entries: readonly TEntry[],
): Map<string, TEntry> {
  const index = new Map<string, TEntry>();
  for (const entry of entries) {
    if (!index.has(entry.id)) index.set(entry.id, entry);
  }
  return index;
}

/** Plural display name for each collection, used only in error messages. */
const COLLECTION_PLURAL: Record<ContentCollection, string> = {
  class: 'classes',
  monster: 'monsters',
  item: 'items',
};

/**
 * Returns an actionable message when a collection is below its floor, or
 * `undefined` when it meets it.
 */
function compositionIssue(
  collection: ContentCollection,
  actual: number,
  minimum: number,
): string | undefined {
  if (actual >= minimum) return undefined;
  return `${COLLECTION_PLURAL[collection]}: expected at least ${minimum}, got ${actual}`;
}

/**
 * Validates `input` and returns a usable pack for id lookup.
 *
 * @throws {PackLoadError} with code `'invalid-pack'` when `input` fails schema
 *   validation (message is the path-bearing validation error), or code
 *   `'composition'` when the pack is valid but below the composition floor.
 */
export function loadPack(input: unknown): LoadedPack {
  const result = validatePack(input);
  if (!result.ok) {
    throw new PackLoadError('invalid-pack', result.error);
  }

  const pack = result.pack;

  const issues = [
    compositionIssue('class', pack.classes.length, MIN_CLASSES),
    compositionIssue('monster', pack.monsters.length, MIN_MONSTERS),
    compositionIssue('item', pack.items.length, MIN_ITEMS),
  ].filter((issue): issue is string => issue !== undefined);

  if (issues.length > 0) {
    throw new PackLoadError(
      'composition',
      `pack "${pack.id}" (version ${PACK_VERSION}) is incomplete — ` +
        issues.join('; '),
    );
  }

  const classes = indexById(pack.classes);
  const monsters = indexById(pack.monsters);
  const items = indexById(pack.items);

  return {
    pack,
    class(id: string): PackClass {
      const entry = classes.get(id);
      if (entry === undefined) {
        throw new UnknownContentIdError('class', id, pack.id);
      }
      return entry;
    },
    monster(id: string): PackMonster {
      const entry = monsters.get(id);
      if (entry === undefined) {
        throw new UnknownContentIdError('monster', id, pack.id);
      }
      return entry;
    },
    item(id: string): PackItem {
      const entry = items.get(id);
      if (entry === undefined) {
        throw new UnknownContentIdError('item', id, pack.id);
      }
      return entry;
    },
  };
}
