/**
 * Pure unit tests for the key→command / tap→direction mapping (change
 * `expo-glyph-renderer`, design D3; post-apply review Fix 3; extended by
 * `core-gameplay-loop` task 9.2 / design D10; directional attack removed and a
 * target-mode key + `directionForDelta` added by `mobile-client-playability`
 * tasks 5.2/5.4; the `.` wait key added by the wait-turn control phase).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the src/ui test glob (design D8).
 */

import { describe, expect, it } from 'vitest';

import { actionForKey, commandForKey, directionForDelta } from './input';

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

  it('maps pickup keys to the pickup command', () => {
    expect(commandForKey('p')).toEqual({ type: 'pickup' });
    expect(commandForKey('g')).toEqual({ type: 'pickup' });
  });

  it('maps the wait key "." to the wait command and leaves others unhandled', () => {
    expect(commandForKey('.')).toEqual({ type: 'wait' });
    expect(commandForKey('b')).toBeUndefined();
    expect(commandForKey(' ')).toBeUndefined();
  });

  it('returns undefined for an unhandled key', () => {
    expect(commandForKey('Escape')).toBeUndefined();
    expect(commandForKey('a')).toBeUndefined();
    // The ranged target-mode key is an action, not a command.
    expect(commandForKey('f')).toBeUndefined();
  });
});

describe('actionForKey', () => {
  it('maps save/resume/new-run keys to their actions', () => {
    expect(actionForKey('s')).toBe('save');
    expect(actionForKey('r')).toBe('resume');
    expect(actionForKey('n')).toBe('new-run');
  });

  it('maps the ranged target-mode key to its action', () => {
    expect(actionForKey('f')).toBe('toggle-target-mode');
  });

  it('returns undefined for a key that is not an action', () => {
    expect(actionForKey('ArrowUp')).toBeUndefined();
    expect(actionForKey('p')).toBeUndefined();
    expect(actionForKey('Escape')).toBeUndefined();
  });
});

describe('directionForDelta', () => {
  const from = { x: 5, y: 5 };

  it('resolves each cardinal-adjacent delta to its direction', () => {
    expect(directionForDelta(from, { x: 5, y: 4 })).toBe('north');
    expect(directionForDelta(from, { x: 5, y: 6 })).toBe('south');
    expect(directionForDelta(from, { x: 6, y: 5 })).toBe('east');
    expect(directionForDelta(from, { x: 4, y: 5 })).toBe('west');
  });

  it('returns undefined for the same tile', () => {
    expect(directionForDelta(from, { x: 5, y: 5 })).toBeUndefined();
  });

  it('returns undefined for a diagonal delta', () => {
    expect(directionForDelta(from, { x: 6, y: 4 })).toBeUndefined();
    expect(directionForDelta(from, { x: 4, y: 6 })).toBeUndefined();
  });

  it('returns undefined for a non-adjacent delta', () => {
    expect(directionForDelta(from, { x: 5, y: 7 })).toBeUndefined();
    expect(directionForDelta(from, { x: 8, y: 5 })).toBeUndefined();
    expect(directionForDelta(from, { x: 0, y: 0 })).toBeUndefined();
  });
});
