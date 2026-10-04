/**
 * Fantasy content pack (design D9).
 *
 * The pack itself is plain JSON (`./pack.json`) so it mirrors the eventual
 * swappable data packs; this module is the thin typed entry the app imports.
 * `src/packs` sits OUTSIDE the `src/engine` purity boundary, so importing the
 * engine schema type here is allowed.
 *
 * The JSON is authored as `unknown`-shaped data and is NOT cast to `Pack`: the
 * only code path that turns raw pack data into a validated `Pack` is
 * `loadPack`/`validatePack`. Keeping the runtime value JSON-authored means a
 * malformed pack fails validation loudly instead of being lied about by a cast.
 * The `Pack` type is imported purely for documentation/consumers who have
 * already validated the pack.
 *
 * Framework-free note: this file is outside `src/engine`, so the engine
 * boundary rules (no react/expo, no ambient randomness) do not apply to it.
 */

import rawPack from './pack.json';
import type { Pack } from '../../engine/schema/pack';

/** The raw, unvalidated fantasy pack data (exactly as authored in JSON). */
export const fantasyPack = rawPack;

/**
 * The fantasy pack's expected validated shape. Consumers must run
 * `loadPack(fantasyPack)` (or `validatePack`) before relying on this type.
 */
export type FantasyPack = Pack;

export default fantasyPack;
