/**
 * `Dpad` — the directional on-screen controls (change `expo-glyph-renderer`,
 * design D3; task 4.1; extended by `core-gameplay-loop` task 9.2 / design D10;
 * reworked into a spatial cross by `mobile-client-playability` design D2,
 * task 5.1).
 *
 * A plus-shaped cross of four movement `Pressable`s — north above, west/east
 * flanking, south below — dispatching `{ type: 'move', direction }`. There is no
 * directional attack row: melee is bump-to-attack when a move enters a living
 * occupant (design D2), so no `{ type: 'attack' }` is dispatched from here. The
 * component owns no state and never touches `GameState` — it is a pure
 * dispatcher, so every input flows through the single command path in `useGame`.
 *
 * Each button carries an `accessibilityLabel` and `accessibilityRole`, since the
 * directional glyphs alone are not self-describing to a screen reader.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Direction } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

/** Props for one cross button. */
interface DirectionButtonProps {
  /** The cardinal direction the button moves. */
  direction: Direction;
  /** The visible directional glyph. */
  glyph: string;
  /** Dispatches the move for this direction. */
  onPress: (direction: Direction) => void;
}

/** One stateless movement button; `accessibilityLabel` matches the old row. */
function DirectionButton({ direction, glyph, onPress }: DirectionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
      onPress={() => onPress(direction)}
      style={({ pressed }) => [
        styles.button,
        pressed === true && styles.pressed,
      ]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

export function Dpad() {
  const { dispatch } = useGameContext();
  const move = (direction: Direction) => dispatch({ type: 'move', direction });

  return (
    <View style={styles.pad}>
      <Text style={styles.caption}>Move</Text>
      <View style={styles.cross}>
        <View style={styles.row}>
          <DirectionButton direction="north" glyph="▲" onPress={move} />
        </View>
        <View style={styles.row}>
          <DirectionButton direction="west" glyph="◀" onPress={move} />
          <DirectionButton direction="east" glyph="▶" onPress={move} />
        </View>
        <View style={styles.row}>
          <DirectionButton direction="south" glyph="▼" onPress={move} />
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
