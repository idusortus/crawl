/**
 * `GameScreen` — the playable screen (change `expo-glyph-renderer`, task 3.5;
 * extended by `core-gameplay-loop` task 9.1/9.3 / design D10).
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
 * Input controls mount below the map (`Dpad` / `ActionBar`); every control
 * dispatches through the game hook's `dispatch` or invokes a defined
 * save/resume/new-run action (design D10). The web-only keyboard hook receives
 * the same callbacks, so all input paths share one command entry point.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { ActionBar } from '../components/ActionBar';
import { Dpad } from '../components/Dpad';
import { GameOver } from '../components/GameOver';
import { Hud } from '../components/Hud';
import { MapView } from '../components/MapView';
import { isTerminal } from '../logic/glyphs';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { colors } from '../theme/colors';

export function GameScreen() {
  const { state, dispatch, save, resume, newRun, error } = useGameContext();

  // Web-only: arrows move, activation keys dispatch gameplay commands, S/R/N
  // invoke save/resume/new-run. On native this registers no listener (design
  // D3/D10).
  useKeyboardInput({ dispatch, save, resume, newRun });

  if (error !== undefined) {
    return (
      <View style={styles.errorContainer}>
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
    <View style={styles.screen}>
      <Hud />
      <View style={styles.mapArea}>
        <MapView />
      </View>
      <View style={styles.inputSlot}>
        <Dpad />
        <ActionBar />
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
