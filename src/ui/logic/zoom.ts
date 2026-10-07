/**
 * Pure map-zoom step logic (change `map-zoom`, design D4; tasks 1.1).
 *
 * Framework-free on purpose — no React, no React Native — so the discrete zoom
 * ladder and its steppers can be unit-tested under the node Vitest environment
 * (the `src/ui` test glob), exactly like `camera.ts`/`input.ts`/`travel.ts`.
 *
 * A zoom *level* is an index into the ordered {@link ZOOM_FACTORS} ladder; a
 * *factor* is the dimensionless multiplier applied to the fit-to-width base tile
 * size. `1×` sits at the fit-to-width base, so the default level is the index of
 * `1` in the ladder (design D4). `MapView` consumes only the factor.
 *
 * The ladder is intentionally discrete (non-goal: continuous pinch-zoom) and
 * bounded: a zoom-in at the maximum or a zoom-out at the minimum is a no-op
 * (spec: `ui/map-zoom` "Zoom is bounded").
 */

/**
 * The ordered zoom ladder. Each entry is the multiplier applied to the
 * fit-to-width base tile size; `1` is the fit-to-width base (design D4).
 */
export const ZOOM_FACTORS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** The lowest zoom level (index `0`). */
export const MIN_ZOOM_LEVEL = 0;

/** The highest zoom level (the last ladder index). */
export const MAX_ZOOM_LEVEL = ZOOM_FACTORS.length - 1;

/**
 * The default zoom level: the ladder index whose factor is exactly `1×` (the
 * fit-to-width base). Derived from the ladder so it cannot drift from the list.
 */
export const DEFAULT_ZOOM_LEVEL = ZOOM_FACTORS.indexOf(1);

/**
 * Clamps an arbitrary zoom level into `[MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL]` and
 * truncates it to an integer index, so a caller can never index off the ladder.
 * A non-finite level falls back to {@link DEFAULT_ZOOM_LEVEL}. Pure and total.
 */
export function clampZoom(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_ZOOM_LEVEL;
  const index = Math.trunc(level);
  if (index <= MIN_ZOOM_LEVEL) return MIN_ZOOM_LEVEL;
  if (index > MAX_ZOOM_LEVEL) return MAX_ZOOM_LEVEL;
  return index;
}

/**
 * The zoom factor (multiplier over the fit-to-width base) at `level`, clamped to
 * a valid level first so an out-of-range input still yields a real factor.
 */
export function zoomFactor(level: number): number {
  return ZOOM_FACTORS[clampZoom(level)];
}

/**
 * One step up the ladder, clamped at {@link MAX_ZOOM_LEVEL} (a no-op there).
 * Returns a new level; the input is never mutated.
 */
export function zoomIn(level: number): number {
  return clampZoom(clampZoom(level) + 1);
}

/**
 * One step down the ladder, clamped at {@link MIN_ZOOM_LEVEL} (a no-op there).
 * Returns a new level; the input is never mutated.
 */
export function zoomOut(level: number): number {
  return clampZoom(clampZoom(level) - 1);
}
