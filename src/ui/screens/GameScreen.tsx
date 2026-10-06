/**
 * `GameScreen` — the playable screen (change `expo-glyph-renderer`, task 3.5;
 * extended by `core-gameplay-loop` task 9.1/9.3 / design D10; target mode by
 * `mobile-client-playability` tasks 6.2/9.1 / design D7/D6; auto-travel by
 * `travel-and-repeat-move` tasks 4.2/4.4/5.1/5.2 / design D2/D4/D5).
 *
 * Composes the HUD and the glyph map, and renders the recoverable pack-load
 * error surface when the provider captured one (design D7): a bad pack shows the
 * error message instead of white-screening. The map's FOV is derived in
 * `MapView` from `GameState` (design D5).
 *
 * When `state.status === 'dead'` the screen renders the terminal {@link GameOver}
 * surface **instead of** the play view, so a dead player is never shown an
 * ordinary frozen map (spec: glyph-renderer "The terminal status is surfaced" /
 * "A game-over surface renders from the terminal state"). The pure `isTerminal`
 * predicate owns that decision, so the screen cannot drift from the state enum.
 *
 * Ranged **target mode** is ephemeral, presentation-only `useState` here
 * (design D7): it is passed to `ActionBar` (toggle + visibility) and `MapView`
 * (tap interpretation), never enters `GameState`, and is cleared when a shot is
 * dispatched, a non-target tap cancels, or the run ends. It can only be entered
 * while a ranged weapon is carried. The web-only keyboard hook receives the same
 * toggle, so all input paths share one mode.
 *
 * **Travel-target mode** and the in-progress travel are likewise ephemeral
 * `useState`/refs (change `travel-and-repeat-move`, design D2): a destination tap
 * plans a route with the pure `planTravel`, then the scheduler dispatches one
 * ordinary `move` per step at `TRAVEL_STEP_INTERVAL_MS`, deciding after each step
 * with the pure `travelStopReason` over the authoritative `CommandResult` returned
 * by `dispatch` (design D1/D4). Nothing about travel enters `GameState`, the
 * command log, or the save. `interceptCommand` cancels travel and swallows a
 * direction/wait press while travel is active (design D5), and the timer is
 * cleared on stop, level change, terminal status, run replacement (`runEpoch`),
 * mode exit, and unmount. Travel also refuses to start when a living monster is
 * already visible or adjacent, so it cannot take a step before the stop
 * predicate can fire (post-apply review Fixes 1/6).
 *
 * Safe-area insets (design D6) pad the container top/bottom so the HUD clears the
 * status bar and the controls clear the navigation bar; the `mapArea: flex: 1`
 * layout is untouched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entityById } from '@engine';
import type { Command, Direction, GameState, Position } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { ActionBar } from '../components/ActionBar';
import { Dpad } from '../components/Dpad';
import { GameOver } from '../components/GameOver';
import { Hud } from '../components/Hud';
import { MapView } from '../components/MapView';
import { ObjectInfo } from '../components/ObjectInfo';
import { isTerminal } from '../logic/glyphs';
import { hasRangedWeapon } from '../logic/ranged';
import { isTravelCancellingCommand, nextStepPosition } from '../logic/input';
import { planTravel, travelStartBlocked, travelStopReason } from '../logic/travel';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { colors } from '../theme/colors';

/**
 * The fixed cadence, in milliseconds, at which auto-travel dispatches one step
 * (change `travel-and-repeat-move`, design D6). A presentation constant, not a
 * spec contract: it can be tuned without changing behavior.
 */
export const TRAVEL_STEP_INTERVAL_MS = 150;

export function GameScreen() {
  const { state, pack, dispatch, save, resume, newRun, error, runEpoch } =
    useGameContext();
  const insets = useSafeAreaInsets();

  // Ephemeral, presentation-only map-tap modes (design D7 / D2). Never enters
  // `GameState`. The two modes are mutually exclusive: entering one exits the
  // other so a tap has exactly one meaning.
  const [targetMode, setTargetMode] = useState(false);
  const [travelMode, setTravelMode] = useState(false);

  // Whether auto-travel is currently running, as the run token (depth + epoch)
  // it belongs to. `travelMode` is not enough: `startTravel` exits travel-target
  // mode as soon as a destination is chosen, so this reactive token is what lets
  // `ActionBar` show an active Travel control during the walk and lets the flag
  // be reset in render when the run is gone (change `travel-and-repeat-move`,
  // post-apply review Fixes 1/8). Kept as state, not a ref, because it must be
  // read during render (refs may not be).
  const [travelRun, setTravelRun] = useState<
    { depth: number; epoch: number } | undefined
  >(undefined);
  const travelInProgress = travelRun !== undefined;

  // Whether the player can currently enter target mode (carries a ranged
  // weapon). Held in a ref so the toggle callback stays identity-stable across
  // turns (the keyboard effect re-registers only while its inputs change).
  const rangedAvailable = hasRangedWeapon(pack, state?.carriedItemIds ?? []);
  const rangedAvailableRef = useRef(rangedAvailable);
  useEffect(() => {
    rangedAvailableRef.current = rangedAvailable;
  }, [rangedAvailable]);

  // The travel scheduler's presentation-only state: the active route, the index
  // of the next step, the state before the next step, the destination, and the
  // live interval. All refs, so a scheduled step never reads stale React state
  // and a timer never triggers a render (design D2/D4).
  const travelActiveRef = useRef(false);
  const travelRouteRef = useRef<Direction[]>([]);
  const travelIndexRef = useRef(0);
  const travelBeforeRef = useRef<GameState | undefined>(undefined);
  const travelDestinationRef = useRef<Position | undefined>(undefined);
  const travelTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  /**
   * Clears the active flag and interval. Ref-only — no React state — so it is
   * safe to call from an effect (the `react-hooks/set-state-in-effect` rule
   * forbids a synchronous setState in an effect body).
   */
  const clearTravelTimer = useCallback(() => {
    travelActiveRef.current = false;
    if (travelTimerRef.current !== undefined) {
      clearInterval(travelTimerRef.current);
      travelTimerRef.current = undefined;
    }
  }, []);

  /** Stops auto-travel: clears the timer and the reactive in-progress state. */
  const stopTravel = useCallback(() => {
    clearTravelTimer();
    setTravelRun(undefined);
  }, [clearTravelTimer]);

  /**
   * Dispatches one travel step and decides whether to continue. Reads the
   * authoritative `CommandResult` returned by `dispatch` and calls the pure
   * `travelStopReason` with the state *before* the step, so it never races React
   * state (design D4). Returns `true` to keep travelling.
   */
  const runTravelStep = useCallback((): boolean => {
    if (!travelActiveRef.current) return false;
    const route = travelRouteRef.current;
    const index = travelIndexRef.current;
    const before = travelBeforeRef.current;
    const destination = travelDestinationRef.current;
    if (before === undefined || destination === undefined) {
      stopTravel();
      return false;
    }
    const direction = route[index];
    if (direction === undefined) {
      stopTravel();
      return false;
    }
    // The tile the *next* planned step would land on, for the stop predicate's
    // stairs/traversability checks (undefined when the route is exhausted).
    const nextDirection = route[index + 1];
    const result = dispatch({ type: 'move', direction });
    if (result === undefined) {
      stopTravel();
      return false;
    }
    const afterPlayer = entityById(result.state.entities, result.state.playerId);
    const nextStep = nextStepPosition(afterPlayer?.pos, nextDirection);
    const reason = travelStopReason({
      before,
      after: result,
      destination,
      nextStep,
    });
    travelIndexRef.current = index + 1;
    travelBeforeRef.current = result.state;
    if (reason !== undefined) {
      stopTravel();
      return false;
    }
    return true;
  }, [dispatch, stopTravel]);

  /**
   * Plans a route to `destination` and starts auto-travel, dispatching the first
   * step immediately and the rest at {@link TRAVEL_STEP_INTERVAL_MS}. Exits
   * travel-target mode in every case. A missing/empty route starts nothing.
   */
  const startTravel = useCallback(
    (destination: Position) => {
      setTravelMode(false);
      stopTravel();
      if (state === undefined) return;
      const player = entityById(state.entities, state.playerId);
      if (player === undefined) return;
      const route = planTravel(
        state.grid,
        state.explored,
        state.entities,
        player.pos,
        destination,
        state.playerId,
      );
      // No route, or already at the destination: travel does not begin.
      if (route === undefined || route.length === 0) return;
      // Danger already present (a living monster visible or adjacent): do not
      // start, so travel cannot take a step before the stop predicate can fire
      // (change `travel-and-repeat-move`, post-apply review Fix 6).
      if (travelStartBlocked(state)) return;
      travelActiveRef.current = true;
      setTravelRun({ depth: state.level.depth, epoch: runEpoch });
      travelRouteRef.current = route;
      travelIndexRef.current = 0;
      travelBeforeRef.current = state;
      travelDestinationRef.current = destination;
      if (runTravelStep()) {
        travelTimerRef.current = setInterval(() => {
          runTravelStep();
        }, TRAVEL_STEP_INTERVAL_MS);
      }
    },
    [state, runTravelStep, stopTravel, runEpoch],
  );

  /**
   * Cancels auto-travel when `command` is a travel-cancelling input and travel is
   * active, reporting the input swallowed so the caller dispatches nothing
   * (design D5; tasks 5.1/5.3). Reads the live flag through a ref, so a press is
   * honoured even before a re-render.
   */
  const interceptCommand = useCallback(
    (command: Command): boolean => {
      if (!travelActiveRef.current) return false;
      if (!isTravelCancellingCommand(command)) return false;
      stopTravel();
      return true;
    },
    [stopTravel],
  );

  // Enter only with a ranged weapon; a second press always cancels. Entering
  // target mode cancels any auto-travel in progress (the same `stopTravel` path
  // `toggleTravelMode` uses) and exits travel-target mode, so the two ephemeral
  // map-tap modes are mutually exclusive and no travel interval keeps dispatching
  // steps while a shot is armed (design D7; post-apply review Fix 9). `stopTravel`
  // is a no-op when no travel is active.
  const toggleTargetMode = useCallback(() => {
    stopTravel();
    setTargetMode((active) => (active ? false : rangedAvailableRef.current));
    setTravelMode(false);
  }, [stopTravel]);
  const exitTargetMode = useCallback(() => setTargetMode(false), []);

  // Toggle travel-target mode. A second press cancels the mode AND any travel in
  // progress without dispatching a command (task 5.2); `stopTravel` is a no-op
  // when no travel is active, so the toggle needs no live-mode read.
  const toggleTravelMode = useCallback(() => {
    stopTravel();
    setTravelMode((active) => !active);
    setTargetMode(false);
  }, [stopTravel]);
  const exitTravelMode = useCallback(() => setTravelMode(false), []);

  // A run that has ended must not linger in either mode. Adjusted during render
  // (React's documented "reset state when derived props change" pattern) rather
  // than in an effect, so it lands in the same render without a cascading commit.
  const status = state?.status;
  const depth = state?.level.depth;
  if (status !== 'playing' && targetMode) {
    setTargetMode(false);
  }
  if (status !== 'playing' && travelMode) {
    setTravelMode(false);
  }
  // The reactive travel-in-progress state is reset the same way when the run it
  // belongs to is gone (terminal status, a level change, or a replaced run), so
  // the Travel control never shows a stale active state after the effects below
  // clear the timer (post-apply review Fixes 1/8).
  if (
    travelRun !== undefined &&
    (status !== 'playing' ||
      depth !== travelRun.depth ||
      runEpoch !== travelRun.epoch)
  ) {
    setTravelRun(undefined);
  }

  // Stop the scheduler on terminal status, a level change, a run replacement,
  // and unmount so no interval can leak (design D4 risk; post-apply review
  // Fix 1). These call the ref-only `clearTravelTimer` — a setState in an effect
  // body is forbidden by `react-hooks/set-state-in-effect`; the reactive flag is
  // reset in render above. `clearTravelTimer` is identity-stable, so the unmount
  // effect only ever fires its cleanup once.
  useEffect(() => {
    if (status !== 'playing') clearTravelTimer();
  }, [status, clearTravelTimer]);
  useEffect(() => {
    clearTravelTimer();
  }, [depth, clearTravelTimer]);
  // A replaced run (`resume`/`newRun`) usually keeps `depth === 1`, so the
  // depth effect above does not fire; the run epoch does, cancelling travel
  // before its interval can dispatch a stray move into the new run.
  useEffect(() => {
    clearTravelTimer();
  }, [runEpoch, clearTravelTimer]);
  useEffect(() => clearTravelTimer, [clearTravelTimer]);

  // Web-only: arrows move, activation keys dispatch gameplay commands, S/R/N
  // invoke save/resume/new-run, and `f` toggles ranged target mode. On native
  // this registers no listener (design D3/D10/D7). `interceptCommand` swallows a
  // travel-cancelling press while auto-travel is active.
  useKeyboardInput({
    dispatch,
    save,
    resume,
    newRun,
    onToggleTargetMode: toggleTargetMode,
    interceptCommand,
  });

  if (error !== undefined) {
    return (
      <View
        style={[
          styles.errorContainer,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.errorTitle}>Could not load the content pack</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
      </View>
    );
  }

  // The terminal surface replaces the play view entirely once the run ends.
  if (state !== undefined && isTerminal(state.status)) {
    return <GameOver />;
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Hud />
      <ObjectInfo />
      <View style={styles.mapArea}>
        <MapView
          targetMode={targetMode}
          onExitTargetMode={exitTargetMode}
          travelMode={travelMode}
          onStartTravel={startTravel}
          onExitTravelMode={exitTravelMode}
          interceptCommand={interceptCommand}
        />
      </View>
      <View style={styles.inputSlot}>
        <Dpad interceptCommand={interceptCommand} runEpoch={runEpoch} />
        <ActionBar
          targetMode={targetMode}
          onToggleTargetMode={toggleTargetMode}
          travelMode={travelMode}
          onToggleTravelMode={toggleTravelMode}
          travelInProgress={travelInProgress}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.unseen,
  },
  mapArea: {
    // No centering: `MapView`'s viewport must fill this slot so `onLayout`
    // measures the screen, not the 560 dp map (change `ui-fit-and-persistence`,
    // design D1). Centering here would make the measured width the map's and the
    // camera could never follow the player.
    flex: 1,
  },
  inputSlot: {
    minHeight: 0,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  errorTitle: {
    color: colors.entity,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: colors.visible,
    fontSize: 14,
    textAlign: 'center',
  },
});
