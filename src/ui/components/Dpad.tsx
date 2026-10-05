/**
 * `Dpad` — the directional on-screen controls (change `expo-glyph-renderer`,
 * design D3; task 4.1; extended by `core-gameplay-loop` task 9.2 / design D10).
 *
 * A row of four movement `Pressable`s (N/S/E/W) dispatching
 * `{ type: 'move', direction }`, plus a second row of four directional attack
 * `Pressable`s dispatching `{ type: 'attack', direction }` — the explicit,
 * direction-bearing form the engine's `AttackCommand` requires (design D2). The
 * component owns no state and never touches `GameState` — it is a pure
 * dispatcher, so every input flows through the single command path in `useGame`
 * (design D3/D4/D10).
 *
 * Each group has a visible caption (`"Move"` / `"Attack"`) and the attack group
 * carries a distinct filled-background treatment in addition to its
 * `colors.entity` border, so the two rows are distinguishable at a glance
 * without a screen reader (design D2 of `ui-fit-and-persistence`). Each button
 * also carries an `accessibilityLabel` and `accessibilityRole`, since the
 * directional glyphs alone are not self-describing to a screen reader.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Direction } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

/** The four directional buttons, in reading order: north, south, east, west. */
const DIRECTIONS: readonly { direction: Direction; label: string; glyph: string }[] = [
  { direction: 'north', label: 'north', glyph: '▲' },
  { direction: 'south', label: 'south', glyph: '▼' },
  { direction: 'east', label: 'east', glyph: '▶' },
  { direction: 'west', label: 'west', glyph: '◀' },
];

export function Dpad() {
  const { dispatch } = useGameContext();

  return (
    <View style={styles.pad}>
      <Text style={styles.caption}>Move</Text>
      <View style={styles.row}>
        {DIRECTIONS.map(({ direction, label, glyph }) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            accessibilityLabel={`Move ${label}`}
            onPress={() => dispatch({ type: 'move', direction })}
            style={({ pressed }) => [
              styles.button,
              pressed === true && styles.pressed,
            ]}
          >
            <Text style={styles.glyph}>{glyph}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.caption, styles.attackCaption]}>Attack</Text>
      <View style={styles.row}>
        {DIRECTIONS.map(({ direction, label, glyph }) => (
          <Pressable
            key={`attack-${direction}`}
            accessibilityRole="button"
            accessibilityLabel={`Attack ${label}`}
            onPress={() => dispatch({ type: 'attack', direction })}
            style={({ pressed }) => [
              styles.attackButton,
              pressed === true && styles.attackPressed,
            ]}
          >
            <Text style={[styles.glyph, styles.attackGlyph]}>{glyph}</Text>
          </Pressable>
        ))}
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
  attackCaption: {
    color: colors.entity,
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
  attackButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.entity,
    borderWidth: 1,
    borderColor: colors.entity,
  },
  pressed: {
    backgroundColor: colors.floor,
  },
  attackPressed: {
    backgroundColor: colors.player,
  },
  glyph: {
    color: colors.visible,
    fontSize: 22,
  },
  attackGlyph: {
    color: colors.background,
    fontWeight: '700',
  },
});
