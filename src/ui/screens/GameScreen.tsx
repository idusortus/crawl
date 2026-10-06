/**
 * `GameScreen` — the playable screen (change `expo-glyph-renderer`, task 3.5;
 * extended by `core-gameplay-loop` task 9.1/9.3 / design D10; target mode by
 * `mobile-client-playability` tasks 6.2/9.1 / design D7/D6).
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
 * Safe-area insets (design D6) pad the container top/bottom so the HUD clears the
 * status bar and the controls clear the navigation bar; the `mapArea: flex: 1`
 * layout is untouched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGameContext } from '../providers/GameProvider';
import { ActionBar } from '../components/ActionBar';
import { Dpad } from '../components/Dpad';
import { GameOver } from '../components/GameOver';
import { Hud } from '../components/Hud';
import { MapView } from '../components/MapView';
import { ObjectInfo } from '../components/ObjectInfo';
import { isTerminal } from '../logic/glyphs';
import { hasRangedWeapon } from '../logic/ranged';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { colors } from '../theme/colors';

export function GameScreen() {
  const { state, pack, dispatch, save, resume, newRun, error } = useGameContext();
  const insets = useSafeAreaInsets();

  // Ephemeral, presentation-only ranged target mode (design D7). Never enters
  // `GameState`.
  const [targetMode, setTargetMode] = useState(false);

  // Whether the player can currently enter target mode (carries a ranged
  // weapon). Held in a ref so the toggle callback stays identity-stable across
  // turns (the keyboard effect re-registers only while its inputs change).
  const rangedAvailable = hasRangedWeapon(pack, state?.carriedItemIds ?? []);
  const rangedAvailableRef = useRef(rangedAvailable);
  useEffect(() => {
    rangedAvailableRef.current = rangedAvailable;
  }, [rangedAvailable]);

  // Enter only with a ranged weapon; a second press always cancels.
  const toggleTargetMode = useCallback(() => {
    setTargetMode((active) => (active ? false : rangedAvailableRef.current));
  }, []);
  const exitTargetMode = useCallback(() => setTargetMode(false), []);

  // A run that has ended must not linger in target mode. Adjusted during render
  // (React's documented "reset state when derived props change" pattern) rather
  // than in an effect, so it lands in the same render without a cascading commit.
  const status = state?.status;
  if (status !== 'playing' && targetMode) {
    setTargetMode(false);
  }

  // Web-only: arrows move, activation keys dispatch gameplay commands, S/R/N
  // invoke save/resume/new-run, and `f` toggles ranged target mode. On native
  // this registers no listener (design D3/D10/D7).
  useKeyboardInput({
    dispatch,
    save,
    resume,
    newRun,
    onToggleTargetMode: toggleTargetMode,
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
        <MapView targetMode={targetMode} onExitTargetMode={exitTargetMode} />
      </View>
      <View style={styles.inputSlot}>
        <Dpad />
        <ActionBar
          targetMode={targetMode}
          onToggleTargetMode={toggleTargetMode}
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
