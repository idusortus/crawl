/**
 * `Dpad` — the four-direction on-screen control (change `expo-glyph-renderer`,
 * design D3; task 4.1).
 *
 * Four `Pressable` buttons (N/S/E/W) that dispatch `{ type: 'move', direction }`
 * through the game hook's `dispatch`. The component owns no state and never
 * touches `GameState` — it is a pure dispatcher, so every move flows through the
 * single command path in `useGame` (design D3/D4).
 *
 * Each button carries an `accessibilityLabel` and `accessibilityRole`, since the
 * directional glyphs alone are not self-describing to a screen reader.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Direction } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

/** The four directional buttons, in reading order: north, south, east, west. */
const DIRECTIONS: readonly { direction: Direction; label: string; glyph: string }[] = [
  { direction: 'north', label: 'Move north', glyph: '▲' },
  { direction: 'south', label: 'Move south', glyph: '▼' },
  { direction: 'east', label: 'Move east', glyph: '▶' },
  { direction: 'west', label: 'Move west', glyph: '◀' },
];

export function Dpad() {
  const { dispatch } = useGameContext();

  return (
    <View style={styles.pad}>
      {DIRECTIONS.map(({ direction, label, glyph }) => (
        <Pressable
          key={direction}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => dispatch({ type: 'move', direction })}
          style={({ pressed }) => [styles.button, pressed === true && styles.pressed]}
        >
          <Text style={styles.glyph}>{glyph}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
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
