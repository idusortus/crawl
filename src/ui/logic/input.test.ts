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

import { createGrid } from '@engine';
import type { Entity, Position } from '@engine';

import {
  actionForKey,
  commandForKey,
  directionForDelta,
  isTravelCancellingCommand,
  isTravelDestination,
  nextStepPosition,
  stepPosition,
} from './input';

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

describe('isTravelCancellingCommand', () => {
  it('treats a resolved direction command as travel-cancelling', () => {
    expect(isTravelCancellingCommand(commandForKey('ArrowUp'))).toBe(true);
    expect(isTravelCancellingCommand({ type: 'move', direction: 'west' })).toBe(
      true,
    );
  });

  it('treats a resolved wait command as travel-cancelling', () => {
    expect(isTravelCancellingCommand(commandForKey('.'))).toBe(true);
    expect(isTravelCancellingCommand({ type: 'wait' })).toBe(true);
  });

  it('treats every other command and undefined as not travel-cancelling', () => {
    expect(isTravelCancellingCommand({ type: 'pickup' })).toBe(false);
    expect(isTravelCancellingCommand({ type: 'descend' })).toBe(false);
    expect(isTravelCancellingCommand({ type: 'attack', direction: 'north' })).toBe(
      false,
    );
    expect(isTravelCancellingCommand({ type: 'use-item', itemId: 'potion' })).toBe(
      false,
    );
    expect(
      isTravelCancellingCommand({
        type: 'ranged-attack',
        target: { x: 1, y: 1 },
      }),
    ).toBe(false);
    expect(isTravelCancellingCommand(undefined)).toBe(false);
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

describe('stepPosition', () => {
  const from: Position = { x: 5, y: 5 };

  it('steps one tile in each cardinal direction (north is -y)', () => {
    expect(stepPosition(from, 'north')).toEqual({ x: 5, y: 4 });
    expect(stepPosition(from, 'south')).toEqual({ x: 5, y: 6 });
    expect(stepPosition(from, 'east')).toEqual({ x: 6, y: 5 });
    expect(stepPosition(from, 'west')).toEqual({ x: 4, y: 5 });
  });

  it('does not mutate the input position', () => {
    const input: Position = { x: 1, y: 2 };
    stepPosition(input, 'east');
    expect(input).toEqual({ x: 1, y: 2 });
  });
});

describe('nextStepPosition', () => {
  it('derives the tile the next planned step lands on', () => {
    expect(nextStepPosition({ x: 1, y: 0 }, 'east')).toEqual({ x: 2, y: 0 });
    expect(nextStepPosition({ x: 1, y: 0 }, 'north')).toEqual({ x: 1, y: -1 });
  });

  it('returns undefined when the route has no remaining step', () => {
    expect(nextStepPosition({ x: 1, y: 0 }, undefined)).toBeUndefined();
  });

  it('returns undefined when the player position is unknown', () => {
    expect(nextStepPosition(undefined, 'east')).toBeUndefined();
    expect(nextStepPosition(undefined, undefined)).toBeUndefined();
  });
});

describe('isTravelDestination', () => {
  const grid = createGrid([
    [true, true, true],
    [true, false, true],
    [true, true, true],
  ]);
  const allExplored = new Array<boolean>(grid.width * grid.height).fill(true);

  const monster = (pos: Position): Entity => ({
    id: 'goblin-1',
    kind: 'goblin',
    pos,
    hp: 5,
  });
  const player = (pos: Position): Entity => ({
    id: 'player',
    kind: 'fighter',
    pos,
    hp: 10,
    attack: 4,
  });

  it('accepts an explored, passable, unoccupied tile', () => {
    expect(
      isTravelDestination(grid, allExplored, [], 'player', { x: 2, y: 2 }),
    ).toBe(true);
  });

  it("accepts the player's own tile (the empty-route start exception)", () => {
    expect(
      isTravelDestination(
        grid,
        allExplored,
        [player({ x: 0, y: 0 })],
        'player',
        { x: 0, y: 0 },
      ),
    ).toBe(true);
  });

  it('rejects an unexplored tile', () => {
    const explored = [...allExplored];
    explored[8] = false;
    expect(
      isTravelDestination(grid, explored, [], 'player', { x: 2, y: 2 }),
    ).toBe(false);
  });

  it('rejects a non-passable tile', () => {
    expect(
      isTravelDestination(grid, allExplored, [], 'player', { x: 1, y: 1 }),
    ).toBe(false);
  });

  it('rejects a tile occupied by a living entity', () => {
    expect(
      isTravelDestination(
        grid,
        allExplored,
        [monster({ x: 2, y: 2 })],
        'player',
        { x: 2, y: 2 },
      ),
    ).toBe(false);
  });

  it('rejects a tile outside the grid', () => {
    expect(
      isTravelDestination(grid, allExplored, [], 'player', { x: 3, y: 0 }),
    ).toBe(false);
    expect(
      isTravelDestination(grid, allExplored, [], 'player', { x: -1, y: 0 }),
    ).toBe(false);
  });
});
