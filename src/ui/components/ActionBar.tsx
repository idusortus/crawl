/**
 * `ActionBar` — the non-directional gameplay controls (change
 * `expo-glyph-renderer`, design D3; task 4.1; extended by
 * `core-gameplay-loop` task 9.2 / design D10).
 *
 * Renders the on-screen controls for the core gameplay actions — pickup, the
 * carried-item list (use-item), and save/resume, plus the existing Descend
 * button. Every control is a stateless `Pressable` that dispatches a command (or
 * a defined save/resume action) through the game hook's `dispatch`/`save`/
 * `resume`; it holds no state and never mutates `GameState` (design D10; spec:
 * input-mapping "Every input dispatches a command or a defined action without
 * mutating state").
 *
 * The carried-item buttons are derived from `state.carriedItemIds`, so the list
 * reflects live state and a use always names an id the player actually carries.
 *
 * Save feedback (change `ui-fit-and-persistence`, design D3): a successful save
 * flips the hook's presentation-only `savedIndicator`, and a storage/hydration
 * failure lands in the separate non-fatal `saveError` channel. Both are shown as
 * an inline note — the indicator is transient and cleared by the next action,
 * and the error note never hides the game (unlike the fatal pack-load `error`).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

/** One on-screen action button, described declaratively. */
interface ActionButton {
  /** The visible label. */
  label: string;
  /** The accessibility label (more descriptive than the short visible text). */
  accessibilityLabel: string;
  /** Dispatches the command / invokes the action when pressed. */
  onPress: () => void;
}

export function ActionBar() {
  const { dispatch, save, resume, hasSave, state, savedIndicator, saveError } =
    useGameContext();

  const carried = state?.carriedItemIds ?? [];

  const buttons: ActionButton[] = [
    {
      label: 'Pick up',
      accessibilityLabel: 'Pick up the item on your tile',
      onPress: () => dispatch({ type: 'pickup' }),
    },
    {
      label: 'Descend',
      accessibilityLabel: 'Descend to the next level',
      onPress: () => dispatch({ type: 'descend' }),
    },
    {
      label: 'Save',
      accessibilityLabel: 'Save the current run',
      onPress: save,
    },
  ];
  if (hasSave) {
    buttons.push({
      label: 'Resume',
      accessibilityLabel: 'Resume the saved run',
      onPress: resume,
    });
  }

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {buttons.map((button) => (
          <Pressable
            key={button.label}
            accessibilityRole="button"
            accessibilityLabel={button.accessibilityLabel}
            onPress={button.onPress}
            style={({ pressed }) => [
              styles.button,
              pressed === true && styles.pressed,
            ]}
          >
            <Text style={styles.label}>{button.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {carried.length === 0 ? (
          <Text style={styles.empty}>No items carried</Text>
        ) : (
          carried.map((itemId, index) => (
            <Pressable
              key={`${itemId}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Use ${itemId}`}
              onPress={() => dispatch({ type: 'use-item', itemId })}
              style={({ pressed }) => [
                styles.button,
                pressed === true && styles.pressed,
              ]}
            >
              <Text style={styles.label}>Use {itemId}</Text>
            </Pressable>
          ))
        )}
      </View>
      {saveError !== undefined ? (
        <Text style={styles.saveError}>
          Save failed: {saveError.message}
        </Text>
      ) : savedIndicator ? (
        <Text style={styles.saved}>Saved</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 15,
  },
  empty: {
    color: colors.explored,
    fontSize: 14,
  },
  saved: {
    color: colors.player,
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 2,
  },
  saveError: {
    color: colors.entity,
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 2,
  },
});
