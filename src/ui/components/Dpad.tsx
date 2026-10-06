/**
 * `Dpad` — the directional on-screen controls (change `expo-glyph-renderer`,
 * design D3; task 4.1; extended by `core-gameplay-loop` task 9.2 / design D10;
 * reworked into a spatial cross by `mobile-client-playability` design D2,
 * task 5.1; given press-and-hold repeat by `travel-and-repeat-move` design D6,
 * task 3.1).
 *
 * A plus-shaped cross of four movement `Pressable`s — north above, west/east
 * flanking, south below — dispatching `{ type: 'move', direction }`. The centre of
 * the cross is a wait button dispatching the deterministic `{ type: 'wait' }`
 * command, so a player can pass a turn in place. There is no directional attack
 * row: melee is bump-to-attack when a move enters a living occupant (design D2),
 * so no `{ type: 'attack' }` is dispatched from here. The component owns no state
 * and never touches `GameState` — it is a pure dispatcher, so every input flows
 * through the single command path in `useGame`.
 *
 * On a touch platform a held direction repeats its move at `REPEAT_INTERVAL_MS`
 * (design D6): press-in dispatches the first step and starts the interval,
 * press-out clears it, and a `blocked` step or terminal run status stops the
 * repeat so refused moves are never dispatched in a loop. A quick tap still
 * dispatches exactly one move because release clears the interval before its
 * first tick. This is touch-only — the web keyboard keeps relying on the OS key
 * repeat and `useKeyboardInput` gains no hold behavior.
 *
 * Each button carries an `accessibilityLabel` and `accessibilityRole`, since the
 * directional glyphs alone are not self-describing to a screen reader.
 *
 * While auto-travel is active, an optional `interceptCommand` prop is consulted
 * before dispatching a move or wait: it cancels travel and reports the input
 * swallowed, so no command is dispatched for that press. A continued hold still
 * begins repeating from the next cadence tick — the interval starts without an
 * immediate dispatch (change `travel-and-repeat-move`, design D5 assumption b;
 * post-apply review Fix 4).
 *
 * An optional `runEpoch` prop clears any in-flight repeat when the live run is
 * replaced (`resume`/`newRun`), so a stale interval can never dispatch a move
 * into the replacement run (change `travel-and-repeat-move`, post-apply review
 * Fix 1).
 */

import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Command, Direction } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { stepStopsRepeat } from '../logic/repeat';
import { colors } from '../theme/colors';

/**
 * The fixed cadence, in milliseconds, at which a held direction button repeats
 * its move (change `travel-and-repeat-move`, design D6). A presentation
 * constant, not a spec contract: it can be tuned without changing behavior.
 */
export const REPEAT_INTERVAL_MS = 150;

/** Props for one cross button. */
interface DirectionButtonProps {
  /** The cardinal direction the button moves. */
  direction: Direction;
  /** The visible directional glyph. */
  glyph: string;
  /** Begins a hold (or a single tap) for this direction. */
  onPressIn: (direction: Direction) => void;
  /** Ends a hold for this direction. */
  onPressOut: () => void;
}

/** One stateless movement button; `accessibilityLabel` matches the old row. */
function DirectionButton({
  direction,
  glyph,
  onPressIn,
  onPressOut,
}: DirectionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
      onPressIn={() => onPressIn(direction)}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.button,
        pressed === true && styles.pressed,
      ]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

/** Props for the centre wait button. */
interface WaitButtonProps {
  /** Dispatches the wait command. */
  onPress: () => void;
}

/**
 * The stateless centre button. Sits between west and east and dispatches the
 * deterministic `{ type: 'wait' }` command so a turn can be passed in place.
 */
function WaitButton({ onPress }: WaitButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Wait a turn"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed === true && styles.pressed,
      ]}
    >
      <Text style={styles.glyph}>•</Text>
    </Pressable>
  );
}

/** Props for {@link Dpad}. */
export interface DpadProps {
  /**
   * Consulted before dispatching a move or a wait; returns `true` when the input
   * was swallowed (auto-travel cancelled it). A swallowed press dispatches
   * nothing; a continued hold still begins repeating from the next cadence tick
   * (change `travel-and-repeat-move`, design D5; post-apply review Fix 4).
   * Optional so a call site that does not need it typechecks.
   */
  interceptCommand?: (command: Command) => boolean;
  /**
   * The run-generation counter from `useGame` (change `travel-and-repeat-move`,
   * post-apply review Fix 1). A change means the live run was replaced
   * (`resume`/`newRun`), so any hold-repeat interval must be cleared — the
   * interval would otherwise dispatch a stray move into the replacement run.
   * Optional so a call site that does not need it typechecks.
   */
  runEpoch?: number;
}

export function Dpad({ interceptCommand, runEpoch }: DpadProps) {
  const { dispatch } = useGameContext();

  // The active repeat interval, or `undefined` when no direction is held. Kept
  // in a ref, not state: a timer must not trigger a re-render, and the press
  // handlers read it synchronously.
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  // True while a direction is held. Checked at the top of each tick so a tick
  // already queued when the finger lifts dispatches nothing.
  const heldRef = useRef(false);

  /** Stops any repeat and marks the direction as no longer held. */
  const clearRepeat = useCallback(() => {
    heldRef.current = false;
    if (intervalRef.current !== undefined) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  // Never leave a repeat timer running after the D-pad unmounts.
  useEffect(() => clearRepeat, [clearRepeat]);

  // A run replacement (`resume`/`newRun`) must also clear an in-flight hold:
  // the interval closure captures the old direction and would dispatch a stray
  // move into the replacement run (post-apply review Fix 1).
  useEffect(() => {
    clearRepeat();
  }, [runEpoch, clearRepeat]);

  /**
   * Starts the fixed-cadence interval for `direction`. Each tick re-checks
   * `heldRef` (so a tick queued after release dispatches nothing) and stops the
   * moment the engine refuses the step or the run ends.
   */
  const scheduleRepeat = useCallback(
    (direction: Direction) => {
      intervalRef.current = setInterval(() => {
        if (!heldRef.current) return;
        // Every repeated step is a normal logged `move` through the shared
        // dispatch; stop the moment the engine refuses it or the run ends.
        if (stepStopsRepeat(dispatch({ type: 'move', direction }))) {
          clearRepeat();
        }
      }, REPEAT_INTERVAL_MS);
    },
    [clearRepeat, dispatch],
  );

  const startRepeat = useCallback(
    (direction: Direction) => {
      // A second press (or a different direction) supersedes any repeat in
      // flight, so at most one interval is ever live.
      clearRepeat();

      // While auto-travel is active, a direction press cancels travel and is
      // swallowed: no move is dispatched for this press. A continued hold still
      // begins repeating from the next cadence tick (design D5 assumption b), so
      // start the interval WITHOUT an immediate dispatch.
      if (interceptCommand?.({ type: 'move', direction }) === true) {
        heldRef.current = true;
        scheduleRepeat(direction);
        return;
      }

      heldRef.current = true;

      // The press itself is the first step. A quick tap clears the interval
      // before its first tick, so a tap dispatches exactly one move.
      if (stepStopsRepeat(dispatch({ type: 'move', direction }))) {
        clearRepeat();
        return;
      }

      scheduleRepeat(direction);
    },
    [clearRepeat, dispatch, interceptCommand, scheduleRepeat],
  );

  const wait = () => {
    // A wait press during auto-travel also cancels travel and is swallowed
    // (task 5.1), so it dispatches no wait and costs no turn.
    if (interceptCommand?.({ type: 'wait' }) === true) return;
    dispatch({ type: 'wait' });
  };

  return (
    <View style={styles.pad}>
      <Text style={styles.caption}>Move</Text>
      <View style={styles.cross}>
        <View style={styles.row}>
          <DirectionButton
            direction="north"
            glyph="▲"
            onPressIn={startRepeat}
            onPressOut={clearRepeat}
          />
        </View>
        <View style={styles.row}>
          <DirectionButton
            direction="west"
            glyph="◀"
            onPressIn={startRepeat}
            onPressOut={clearRepeat}
          />
          <WaitButton onPress={wait} />
          <DirectionButton
            direction="east"
            glyph="▶"
            onPressIn={startRepeat}
            onPressOut={clearRepeat}
          />
        </View>
        <View style={styles.row}>
          <DirectionButton
            direction="south"
            glyph="▼"
            onPressIn={startRepeat}
            onPressOut={clearRepeat}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingVertical: 4,
  },
  caption: {
    color: colors.explored,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cross: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  button: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.floor,
  },
  pressed: {
    backgroundColor: colors.floor,
  },
  glyph: {
    color: colors.visible,
    fontSize: 22,
  },
});
