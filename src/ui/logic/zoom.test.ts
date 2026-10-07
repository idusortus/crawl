/**
 * Pure unit tests for the map-zoom step helper (change `map-zoom`, design D4;
 * task 1.2).
 *
 * No React, no React Native — this file runs under the node Vitest environment
 * (the `src/ui` test glob). Every assertion is exact: levels are integers and
 * factors are the literal ladder values.
 */

import { describe, expect, it } from 'vitest';

import {
  clampZoom,
  DEFAULT_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  ZOOM_FACTORS,
  zoomFactor,
  zoomIn,
  zoomOut,
} from './zoom';

describe('ZOOM_FACTORS', () => {
  it('is an ascending, positive ladder that contains the 1× base', () => {
    expect(ZOOM_FACTORS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
    for (const factor of ZOOM_FACTORS) {
      expect(factor).toBeGreaterThan(0);
    }
    for (let i = 1; i < ZOOM_FACTORS.length; i += 1) {
      expect(ZOOM_FACTORS[i]).toBeGreaterThan(ZOOM_FACTORS[i - 1]);
    }
  });
});

describe('default level', () => {
  it('defaults to 1× (the fit-to-width base)', () => {
    expect(zoomFactor(DEFAULT_ZOOM_LEVEL)).toBe(1);
    expect(ZOOM_FACTORS[DEFAULT_ZOOM_LEVEL]).toBe(1);
  });
});

describe('zoomFactor', () => {
  it('maps each level to its ladder factor', () => {
    expect(zoomFactor(MIN_ZOOM_LEVEL)).toBe(0.5);
    expect(zoomFactor(MAX_ZOOM_LEVEL)).toBe(3);
    expect(zoomFactor(1)).toBe(0.75);
    expect(zoomFactor(3)).toBe(1.25);
  });

  it('clamps an out-of-range level to a real factor', () => {
    expect(zoomFactor(-5)).toBe(ZOOM_FACTORS[MIN_ZOOM_LEVEL]);
    expect(zoomFactor(999)).toBe(ZOOM_FACTORS[MAX_ZOOM_LEVEL]);
    expect(zoomFactor(Number.NaN)).toBe(ZOOM_FACTORS[DEFAULT_ZOOM_LEVEL]);
  });
});

describe('clampZoom', () => {
  it('clamps below and above the ladder bounds', () => {
    expect(clampZoom(-1)).toBe(MIN_ZOOM_LEVEL);
    expect(clampZoom(MAX_ZOOM_LEVEL + 1)).toBe(MAX_ZOOM_LEVEL);
    expect(clampZoom(3)).toBe(3);
  });

  it('truncates a fractional level to an integer index', () => {
    expect(clampZoom(2.9)).toBe(2);
    expect(clampZoom(-0.5)).toBe(MIN_ZOOM_LEVEL);
  });
});

describe('zoomIn / zoomOut', () => {
  it('steps one level in and out from the default', () => {
    expect(zoomIn(DEFAULT_ZOOM_LEVEL)).toBe(DEFAULT_ZOOM_LEVEL + 1);
    expect(zoomOut(DEFAULT_ZOOM_LEVEL)).toBe(DEFAULT_ZOOM_LEVEL - 1);
    expect(zoomFactor(zoomIn(DEFAULT_ZOOM_LEVEL))).toBe(1.25);
    expect(zoomFactor(zoomOut(DEFAULT_ZOOM_LEVEL))).toBe(0.75);
  });

  it('is a no-op at the maximum for zoomIn', () => {
    expect(zoomIn(MAX_ZOOM_LEVEL)).toBe(MAX_ZOOM_LEVEL);
    expect(zoomFactor(zoomIn(MAX_ZOOM_LEVEL))).toBe(3);
  });

  it('is a no-op at the minimum for zoomOut', () => {
    expect(zoomOut(MIN_ZOOM_LEVEL)).toBe(MIN_ZOOM_LEVEL);
    expect(zoomFactor(zoomOut(MIN_ZOOM_LEVEL))).toBe(0.5);
  });

  it('clamps a wildly out-of-range start before stepping', () => {
    expect(zoomIn(999)).toBe(MAX_ZOOM_LEVEL);
    expect(zoomOut(-999)).toBe(MIN_ZOOM_LEVEL);
  });

  it('does not mutate its input', () => {
    const level = DEFAULT_ZOOM_LEVEL;
    zoomIn(level);
    zoomOut(level);
    expect(level).toBe(DEFAULT_ZOOM_LEVEL);
  });
});
