/**
 * `Hud` — the status bar (change `expo-glyph-renderer`, task 3.4).
 *
 * Reads `GameState` from the game context and shows the current level depth and
 * the player's HP via the engine's `actorHp` accessor. No HP-changing command
 * exists this stage, so the value is static; the HUD is still derived from state
 * rather than hard-coded so it updates automatically once commands exist.
 */

import { StyleSheet, Text, View } from 'react-native';

import { actorHp, entityById } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

export function Hud() {
  const { state } = useGameContext();

  if (state === undefined) return null;

  const player = entityById(state.entities, state.playerId);
  const hp = player === undefined ? '?' : String(actorHp(player));

  return (
    <View style={styles.bar}>
      <Text style={styles.label}>Depth {state.level.depth}</Text>
      <Text style={styles.label}>HP {hp}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  label: {
    color: colors.visible,
    fontSize: 16,
  },
});
