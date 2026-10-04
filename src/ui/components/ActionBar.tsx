/**
 * `ActionBar` — the non-directional action controls (change
 * `expo-glyph-renderer`, design D3; task 4.1).
 *
 * Renders the Descend button, dispatching `{ type: 'descend' }` through the game
 * hook's `dispatch`. Like {@link Dpad}, it holds no state and never mutates
 * `GameState`; the command is the only thing it produces (design D3/D4).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

export function ActionBar() {
  const { dispatch } = useGameContext();

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Descend to the next level"
        onPress={() => dispatch({ type: 'descend' })}
        style={({ pressed }) => [styles.button, pressed === true && styles.pressed]}
      >
        <Text style={styles.label}>Descend</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.player,
  },
  pressed: {
    backgroundColor: colors.floor,
  },
  label: {
    color: colors.visible,
    fontSize: 16,
  },
});
