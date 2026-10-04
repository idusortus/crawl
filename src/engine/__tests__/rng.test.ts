import { describe, it, expect } from 'vitest';
import { createRng, randInt, rngFromState, rngToState } from '../rng';
import type { RngState } from '../types';

describe('createRng / Mulberry32', () => {
  it('produces floats in [0, 1) across many draws', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 100_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('reproduces the exact same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('locks the algorithm with hardcoded expected values', () => {
    // These values are the observable contract of the Mulberry32 transition
    // from design D2. If they change, every seeded run changes: breaking.
    const rng = createRng(0);
    // Captured from the frozen implementation.
    const expected = [
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197,
      0.1462021479383111, 0.46732782293111086,
    ];
    for (const e of expected) {
      expect(rng.next()).toBe(e);
    }
  });

  it('advances state on each draw and reports it as uint32', () => {
    const rng = createRng(7);
    const before = rng.state();
    rng.next();
    const after = rng.state();
    expect(after).not.toBe(before);
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(after)).toBe(true);
  });
});

describe('randInt bounded inclusive draws', () => {
  it('stays within the inclusive range across many draws', () => {
    const rng = createRng(20260101);
    for (let i = 0; i < 50_000; i++) {
      const v = randInt(rng, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('repeats exactly when replayed from the same seed', () => {
    const a = createRng(999);
    const b = createRng(999);
    for (let i = 0; i < 500; i++) {
      expect(randInt(a, 1, 6)).toBe(randInt(b, 1, 6));
    }
  });

  it('can produce both endpoints of the range', () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(randInt(rng, 1, 2));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
  });

  it('collapses safely when max < min', () => {
    const rng = createRng(5);
    expect(randInt(rng, 7, 4)).toBe(7);
  });
});

describe('RngState travels with game state', () => {
  it('serializes and resumes with identical subsequent output', () => {
    const rng = createRng(0xdeadbeef);
    // Burn some draws to get a non-initial state.
    for (let i = 0; i < 17; i++) rng.next();

    const saved: RngState = rngToState(0xdeadbeef, rng);

    // The saved state is JSON-clean.
    const roundTripped: RngState = JSON.parse(JSON.stringify(saved));
    expect(roundTripped).toEqual(saved);

    // Uninterrupted continuation.
    const uninterrupted = createRng(0xdeadbeef);
    uninterrupted.setState(saved.state);

    // Restored continuation from the serialized state.
    const restored = rngFromState(roundTripped);

    for (let i = 0; i < 100; i++) {
      expect(restored.next()).toBe(uninterrupted.next());
    }
  });
});

describe('Anti-ambient-randomness guard', () => {
  const SEED = 1337;

  function replay(seed: number, draws: number): number[] {
    const rng = createRng(seed);
    const out: number[] = [];
    for (let i = 0; i < draws; i++) out.push(randInt(rng, 0, 1000));
    return out;
  }

  it('produces byte-for-byte identical results for two independent runs from the same seed', () => {
    expect(replay(SEED, 200)).toEqual(replay(SEED, 200));
  });

  it('diverges for different seeds', () => {
    expect(replay(SEED, 200)).not.toEqual(replay(SEED + 1, 200));
  });

  it('is deterministic across three replays', () => {
    const a = replay(SEED, 200);
    const b = replay(SEED, 200);
    const c = replay(SEED, 200);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
