/**
 * Pure unit tests for the stairs hint (change `mobile-client-playability`,
 * design D5; task 8.3).
 *
 * No React, no React Native — this file runs under the node Vitest environment
 * via the `src/ui` test glob, mirroring `glyphs.test.ts`/`input.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { Position } from '@engine';

import { stairsHint } from './stairs';

const FROM: Position = { x: 5, y: 5 };

describe('stairsHint', () => {
  it('returns undefined when the player is standing on the stairs', () => {
    expect(stairsHint(FROM, { x: 5, y: 5 })).toBeUndefined();
  });

  it('returns undefined when the level has no stairs', () => {
    expect(stairsHint(FROM, undefined)).toBeUndefined();
  });

  it('labels each of the eight compass directions at distance 1', () => {
    expect(stairsHint(FROM, { x: 5, y: 4 })).toEqual({ direction: 'N', distance: 1 });
    expect(stairsHint(FROM, { x: 6, y: 4 })).toEqual({ direction: 'NE', distance: 1 });
    expect(stairsHint(FROM, { x: 6, y: 5 })).toEqual({ direction: 'E', distance: 1 });
    expect(stairsHint(FROM, { x: 6, y: 6 })).toEqual({ direction: 'SE', distance: 1 });
    expect(stairsHint(FROM, { x: 5, y: 6 })).toEqual({ direction: 'S', distance: 1 });
    expect(stairsHint(FROM, { x: 4, y: 6 })).toEqual({ direction: 'SW', distance: 1 });
    expect(stairsHint(FROM, { x: 4, y: 5 })).toEqual({ direction: 'W', distance: 1 });
    expect(stairsHint(FROM, { x: 4, y: 4 })).toEqual({ direction: 'NW', distance: 1 });
  });

  it('uses the Chebyshev distance', () => {
    // Diagonal: distance is the larger absolute delta, not the Euclidean length.
    expect(stairsHint(FROM, { x: 8, y: 6 })).toEqual({ direction: 'SE', distance: 3 });
    expect(stairsHint(FROM, { x: 1, y: 9 })).toEqual({ direction: 'SW', distance: 4 });
  });

  it('reports the straight-line distance for a cardinal offset', () => {
    expect(stairsHint(FROM, { x: 5, y: 1 })).toEqual({ direction: 'N', distance: 4 });
    expect(stairsHint(FROM, { x: 1, y: 5 })).toEqual({ direction: 'W', distance: 4 });
    expect(stairsHint(FROM, { x: 9, y: 5 })).toEqual({ direction: 'E', distance: 4 });
    expect(stairsHint(FROM, { x: 5, y: 12 })).toEqual({ direction: 'S', distance: 7 });
  });

  it('tracks the player: the same stairs yields a new goal when the player moves', () => {
    const stairs: Position = { x: 10, y: 5 };
    expect(stairsHint({ x: 5, y: 5 }, stairs)).toEqual({
      direction: 'E',
      distance: 5,
    });
    expect(stairsHint({ x: 8, y: 4 }, stairs)).toEqual({
      direction: 'SE',
      distance: 2,
    });
  });
});
