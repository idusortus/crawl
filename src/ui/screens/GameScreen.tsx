/**
 * `GameScreen` — the playable screen (change `expo-glyph-renderer`, task 3.5;
 * extended by `core-gameplay-loop` task 9.1/9.3 / design D10; target mode by
 * `mobile-client-playability` tasks 6.2/9.1 / design D7/D6; auto-travel by
 * `travel-and-repeat-move` tasks 4.2/4.4/5.1/5.2 / design D2/D4/D5; best-effort
 * goal + refusal feedback by `auto-travel-reliability` tasks 2.2/3.1/3.2/4.1 /
 * design D1/D2/D3; ephemeral map zoom by `map-zoom` tasks 3.1/3.3 / design D1).
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
 * mode exit, and unmount. Travel refuses to start when a living monster is
 * **orthogonally adjacent** (change `auto-travel-reliability`, design D2); a
 * merely visible monster is handled by the post-step `monster-visible` stop.
 * A tap that cannot begin travel — no reachable goal, an adjacent monster, or an
 * illegal destination tile rejected in `MapView` — raises the presentation-only
 * `travelNotice`, shown as an inline note by `ActionBar` and cleared when travel
 * begins or the run is replaced (design D3; tasks 3.1/3.2/4.1).
 *
 * **Map zoom** is a third ephemeral `useState` (`zoomLevel`, an index into the
 * pure `logic/zoom` ladder; change `map-zoom`, design D1/D4; task 3.1). The
 * derived factor goes to `MapView` and the level plus step callbacks to
 * `ActionBar`; the web-only keyboard also maps `+`/`-` (task 3.3). Like the
 * other modes it never enters `GameState`, the command log, or a save.
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
import {
  DEFAULT_ZOOM_LEVEL,
  zoomFactor,
  zoomIn as zoomInLevel,
  zoomOut as zoomOutLevel,
} from '../logic/zoom';
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

  // Ephemeral, presentation-only map zoom (change `map-zoom`, design D1; task
  // 3.1): an index into the pure `logic/zoom` ladder. The derived factor goes to
  // `MapView` and the level to the zoom controls. It never enters `GameState`,
  // the command log, or a save, and changing it dispatches no command.
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM_LEVEL);

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

  // Presentation-only refusal notice (change `auto-travel-reliability`, design
  // D3): a brief inline string set when a travel-mode tap cannot begin travel,
  // and never part of `GameState`, the command log, or a save. It carries the
  // run epoch it was raised in so a replaced run clears it — the same token
  // pattern as `travelRun`. No clock, no randomness.
  const [travelNotice, setTravelNotice] = useState<
    { text: string; epoch: number } | undefined
  >(undefined);

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
   * Raises the presentation-only refusal notice, tagged with the current run
   * epoch so a replaced run can clear it in render (design D3). An event-handler
   * setter — never called during render.
   */
  const raiseTravelNotice = useCallback(
    (text: string) => setTravelNotice({ text, epoch: runEpoch }),
    [runEpoch],
  );

  /** The invalid-destination tap path (raised from `MapView`'s travel branch). */
  const refuseInvalidDestination = useCallback(
    () => raiseTravelNotice('That tile cannot be a travel destination'),
    [raiseTravelNotice],
  );

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
      const plan = planTravel(
        state.grid,
        state.explored,
        state.entities,
        player.pos,
        destination,
        state.playerId,
      );
      // No reachable goal at all: travel cannot begin; surface the refusal
      // (change `auto-travel-reliability`, design D3).
      if (plan === undefined) {
        raiseTravelNotice('No route to that spot');
        return;
      }
      // Already at the destination: a valid but empty plan; nothing to walk.
      if (plan.route.length === 0) return;
      // A living monster is already orthogonally adjacent: do not start, so
      // travel cannot walk into immediate danger on its first step (design D2).
      // A merely visible monster no longer blocks the start.
      if (travelStartBlocked(state)) {
        raiseTravelNotice('A monster is too close to travel');
        return;
      }
      // Travel actually begins: clear any earlier refusal notice.
      setTravelNotice(undefined);
      travelActiveRef.current = true;
      setTravelRun({ depth: state.level.depth, epoch: runEpoch });
      travelRouteRef.current = plan.route;
      travelIndexRef.current = 0;
      travelBeforeRef.current = state;
      // Thread the planner's goal — the destination, or the best-approach tile
      // when it was unreachable — so reaching it reports `destination-reached`
      // through `travelStopReason` rather than falling through to `path-blocked`
      // when the route is exhausted (design D1).
      travelDestinationRef.current = plan.goal;
      if (runTravelStep()) {
        travelTimerRef.current = setInterval(() => {
          runTravelStep();
        }, TRAVEL_STEP_INTERVAL_MS);
      }
    },
    [state, runTravelStep, stopTravel, runEpoch, raiseTravelNotice],
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

  // Zoom steps are pure ladder operations (change `map-zoom`, design D4; task
  // 3.1); the clamped steppers make a press at either bound a no-op. Identity
  // stable, so the keyboard effect does not re-register per turn.
  const handleZoomIn = useCallback(
    () => setZoomLevel((level) => zoomInLevel(level)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoomLevel((level) => zoomOutLevel(level)),
    [],
  );

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
  // A refusal notice belongs to the run it was raised in; a replaced run clears
  // it in the same render, mirroring the `travelRun` token above. The displayed
  // text is derived, so a stale notice never flashes after the reset.
  if (travelNotice !== undefined && travelNotice.epoch !== runEpoch) {
    setTravelNotice(undefined);
  }
  const travelNoticeText =
    travelNotice !== undefined && travelNotice.epoch === runEpoch
      ? travelNotice.text
      : undefined;

  // The zoom factor actually handed to the renderer; derived, never stored
  // (change `map-zoom`, task 3.1).
  const zoom = zoomFactor(zoomLevel);

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
  // invoke save/resume/new-run, `f` toggles ranged target mode, and `+`/`-`
  // step the map zoom. On native this registers no listener (design
  // D3/D10/D7; zoom keys by `map-zoom` task 3.3). `interceptCommand` swallows a
  // travel-cancelling press while auto-travel is active.
  useKeyboardInput({
    dispatch,
    save,
    resume,
    newRun,
    onToggleTargetMode: toggleTargetMode,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
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
          onTravelRefused={refuseInvalidDestination}
          interceptCommand={interceptCommand}
          zoom={zoom}
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
          travelNotice={travelNoticeText}
          zoomLevel={zoomLevel}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
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
