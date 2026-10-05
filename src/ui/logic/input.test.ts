/**
 * Pure unit tests for the key→command mapping (change `expo-glyph-renderer`,
 * design D3; post-apply review Fix 3; extended by `core-gameplay-loop` task 9.2 /
 * design D10).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the src/ui test glob (design D8).
 */

import { describe, expect, it } from 'vitest';

import { actionForKey, commandForKey } from './input';

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

  it('maps Shift + arrow to a directional attack', () => {
    expect(commandForKey('ArrowUp', true)).toEqual({
      type: 'attack',
      direction: 'north',
    });
    expect(commandForKey('ArrowRight', true)).toEqual({
      type: 'attack',
      direction: 'east',
    });
    expect(commandForKey('ArrowLeft', true)).toEqual({
      type: 'attack',
      direction: 'west',
    });
    expect(commandForKey('ArrowDown', true)).toEqual({
      type: 'attack',
      direction: 'south',
    });
  });

  it('maps Enter and ">" to descend', () => {
    expect(commandForKey('Enter')).toEqual({ type: 'descend' });
    expect(commandForKey('>')).toEqual({ type: 'descend' });
  });

  it('maps pickup keys to the pickup command', () => {
    expect(commandForKey('p')).toEqual({ type: 'pickup' });
    expect(commandForKey('g')).toEqual({ type: 'pickup' });
  });

  it('returns undefined for an unhandled key', () => {
    expect(commandForKey('Escape')).toBeUndefined();
    expect(commandForKey('a')).toBeUndefined();
    // A modifier alone does not change an unhandled key into an attack.
    expect(commandForKey('Escape', true)).toBeUndefined();
  });
});

describe('actionForKey', () => {
  it('maps save/resume/new-run keys to their actions', () => {
    expect(actionForKey('s')).toBe('save');
    expect(actionForKey('r')).toBe('resume');
    expect(actionForKey('n')).toBe('new-run');
  });

  it('returns undefined for a key that is not an action', () => {
    expect(actionForKey('ArrowUp')).toBeUndefined();
    expect(actionForKey('p')).toBeUndefined();
    expect(actionForKey('Escape')).toBeUndefined();
  });
});
