/**
 * Pure stairs-discoverability helper for the HUD (change
 * `mobile-client-playability`, design D5; task 8.2).
 *
 * Framework-free — no React, no React Native — so the direction/distance the
 * HUD shows can be unit-tested under the node Vitest environment, exactly like
 * `glyphs.ts`/`camera.ts`/`input.ts`. It imports only the `@engine` public type
 * surface; the value it derives is presentation-only and never enters
 * `GameState`.
 *
 * Coordinates match the engine's screen convention: north is `-y`, east is
 * `+x` (see `directionForDelta` in `input.ts`). Distance is the Chebyshev
 * metric (the number of king-moves between tiles), the same metric the engine
 * uses for sight and for ranged range, so the number the HUD shows matches how
 * the engine reasons about how far away the stairs are.
 */

import type { Position } from '@engine';

/** The eight compass labels the stairs hint can report. */
export type StairsDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** The render-ready stairs hint: a compass direction and a tile distance. */
export interface StairsHint {
  /** The 8-way compass label from the player toward the stairs. */
  direction: StairsDirection;
  /** The Chebyshev distance in tiles (`max(|dx|, |dy|)`), always ≥ 1. */
  distance: number;
}

/**
 * Combines a non-zero `(dx, dy)` into an 8-way compass label. `dy < 0` is north
 * and `dx > 0` is east, so the label reads north/south before east/west
 * (`'NE'`, `'SW'`, ...). Only called when at least one delta is non-zero.
 */
function directionLabel(dx: number, dy: number): StairsDirection {
  const vertical = dy < 0 ? 'N' : dy > 0 ? 'S' : '';
  const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
  return `${vertical}${horizontal}` as StairsDirection;
}

/**
 * Resolves the direction and distance from `from` (the player) to `stairs`, or
 * `undefined` when there is nothing useful to show — the player is standing on
 * the stairs, or the level has no stairs. Every other case returns a hint with
 * a distance of at least 1, so the HUD can render "Stairs NE (5)" and show
 * nothing otherwise (spec: ui/glyph-renderer "The stairs hint is displayed" /
 * "The stairs hint updates with the player").
 */
export function stairsHint(
  from: Position,
  stairs: Position | undefined,
): StairsHint | undefined {
  if (stairs === undefined) return undefined;
  const dx = stairs.x - from.x;
  const dy = stairs.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  return {
    direction: directionLabel(dx, dy),
    distance: Math.max(Math.abs(dx), Math.abs(dy)),
  };
}
