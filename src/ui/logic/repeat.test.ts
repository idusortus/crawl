/**
 * Pure unit tests for the hold-repeat stop predicate (change
 * `travel-and-repeat-move`, design D6; post-apply review Fix 3).
 *
 * No React, no React Native, no DOM — this file runs under the node Vitest
 * environment via the `src/ui` test glob. The predicate used to live inside
 * `Dpad.tsx` (which imports react-native and so cannot be node-tested); it is
 * now extracted to `./repeat` and covered here.
 */

import { describe, expect, it } from 'vitest';

import { createGrid } from '@engine';
import type { CommandResult, GameEvent, GameState } from '@engine';

import { stepStopsRepeat } from './repeat';

const PLAYER_ID = 'player';

/** Builds a minimal run; the tile is unchanged across cases unless noted. */
function makeState(status: GameState['status'] = 'playing'): GameState {
  const grid = createGrid([
    [true, true],
    [true, true],
  ]);
  return {
    grid,
    level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 1 } },
    explored: new Array<boolean>(grid.width * grid.height).fill(true),
    entities: [
      { id: PLAYER_ID, kind: 'fighter', pos: { x: 0, y: 0 }, hp: 10, attack: 4 },
    ],
    playerId: PLAYER_ID,
    status,
    carriedItemIds: [],
    rng: { seed: 1, state: 1 },
    events: [],
  };
}

/** Wraps an after-state and its step events as the engine's `CommandResult`. */
function stepResult(
  events: GameEvent[] = [],
  status: GameState['status'] = 'playing',
): CommandResult {
  return { state: makeState(status), events };
}

describe('stepStopsRepeat', () => {
  it('stops on a missing result (no run loaded)', () => {
    expect(stepStopsRepeat(undefined)).toBe(true);
  });

  it('stops when the run is terminal', () => {
    expect(
      stepStopsRepeat(
        stepResult(
          [
            {
              type: 'moved',
              entityId: PLAYER_ID,
              from: { x: 0, y: 0 },
              to: { x: 1, y: 0 },
            },
          ],
          'dead',
        ),
      ),
    ).toBe(true);
  });

  it('stops on a blocked step', () => {
    expect(
      stepStopsRepeat(
        stepResult([
          { type: 'blocked', entityId: PLAYER_ID, direction: 'east' },
        ]),
      ),
    ).toBe(true);
  });

  it('stops when the step neither moved nor struck (e.g. a noop)', () => {
    expect(
      stepStopsRepeat(stepResult([{ type: 'noop', reason: 'malformed-command' }])),
    ).toBe(true);
  });

  it('continues on a moved step', () => {
    expect(
      stepStopsRepeat(
        stepResult([
          {
            type: 'moved',
            entityId: PLAYER_ID,
            from: { x: 0, y: 0 },
            to: { x: 1, y: 0 },
          },
        ]),
      ),
    ).toBe(false);
  });

  it('continues on a bump-to-attack (attacked, player tile unchanged)', () => {
    expect(
      stepStopsRepeat(
        stepResult([
          {
            type: 'attacked',
            attackerId: PLAYER_ID,
            targetId: 'goblin-1',
            amount: 3,
            kind: 'melee',
          },
        ]),
      ),
    ).toBe(false);
  });
});
