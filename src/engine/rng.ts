/**
 * Seeded PRNG (hand-rolled Mulberry32).
 *
 * Milestone 1 (`bootstrap-engine-skeleton`, tasks 2.1/2.2): a deterministic,
 * dependency-free generator whose entire state is a single `uint32`. The state
 * travels with `GameState` (`RngState { seed, state }`), so save/load and
 * replay fall out for free (design D2).
 *
 * No ambient randomness: `Math.random`/`Date.now`/`Date` are banned here by
 * ESLint (design D6); all randomness must flow through this module.
 */

import type { RngState } from './types';

/** Tiny interface so the algorithm can be swapped without touching callers. */
export interface Rng {
  /** Returns the next float in `[0, 1)`. */
  next(): number;
  /** Returns the current internal `uint32` state. */
  state(): number;
  /** Overwrites the internal `uint32` state (used to resume a run). */
  setState(s: number): void;
}

/**
 * Creates a Mulberry32 generator from a numeric seed.
 *
 * The exact transition is fixed by design D2; changing it changes every seeded
 * run and must be treated as a breaking format change.
 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return s >>> 0;
    },
    setState(v) {
      s = v >>> 0;
    },
  };
}

/**
 * Draws an integer in the inclusive range `[min, max]`.
 *
 * Deterministic for a given generator state. `min`/`max` are rounded to
 * integers; if `max < min` the range collapses to `min` (no throw), which keeps
 * callers with dynamic ranges safe.
 */
export function randInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  const span = hi - lo + 1;
  return lo + Math.floor(rng.next() * span);
}

/** Builds an `Rng` from serialized `RngState` (`{ seed, state }`). */
export function rngFromState(s: RngState): Rng {
  const rng = createRng(s.seed);
  rng.setState(s.state);
  return rng;
}

/** Captures an `Rng`'s live state back into a JSON-clean `RngState`. */
export function rngToState(seed: number, rng: Rng): RngState {
  return { seed: seed >>> 0, state: rng.state() };
}
