/**
 * Pure unit tests for the key→command mapping (change `expo-glyph-renderer`,
 * design D3; post-apply review Fix 3).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the src/ui test glob (design D8).
 */

import { describe, expect, it } from 'vitest';

import { commandForKey } from './input';

describe('commandForKey', () => {
  it('maps each arrow key to its move direction', () => {
    expect(commandForKey('ArrowUp')).toEqual({
      type: 'move',
      direction: 'north',
    });
    expect(commandForKey('ArrowDown')).toEqual({
      type: 'move',
      direction: 'south',
    });
    expect(commandForKey('ArrowRight')).toEqual({
      type: 'move',
      direction: 'east',
    });
    expect(commandForKey('ArrowLeft')).toEqual({
      type: 'move',
      direction: 'west',
    });
  });

  it('maps Enter and ">" to descend', () => {
    expect(commandForKey('Enter')).toEqual({ type: 'descend' });
    expect(commandForKey('>')).toEqual({ type: 'descend' });
  });

  it('returns undefined for an unhandled key', () => {
    expect(commandForKey('Escape')).toBeUndefined();
    expect(commandForKey('a')).toBeUndefined();
  });
});
