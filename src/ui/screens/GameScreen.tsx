/**
 * `GameScreen` — the playable screen (change `expo-glyph-renderer`, task 3.5).
 *
 * Composes the HUD and the glyph map, and renders the recoverable pack-load
 * error surface when the provider captured one (design D7): a bad pack shows the
 * error message instead of white-screening. The map's FOV is derived in
 * `MapView` from `GameState` (design D5).
 *
 * Phase 4 mounts the input controls (D-pad / ActionBar / keyboard) below the
 * map in `inputSlot`. Every control dispatches through the game hook's
 * `dispatch` (design D3/D4); the web-only keyboard hook receives the same
 * dispatcher, so all input paths share one command entry point.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { ActionBar } from '../components/ActionBar';
import { Dpad } from '../components/Dpad';
import { Hud } from '../components/Hud';
import { MapView } from '../components/MapView';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { colors } from '../theme/colors';

export function GameScreen() {
  const { dispatch, error } = useGameContext();

  // Web-only: arrow keys move, Enter/`>` descends. On native this registers
  // no listener (design D3).
  useKeyboardInput(dispatch);

  if (error !== undefined) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Could not load the content pack</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
      </View>
    );
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
