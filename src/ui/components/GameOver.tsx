/**
 * `GameOver` — the terminal run-end surface (change `core-gameplay-loop`, task
 * 9.1 / design D10; spec: glyph-renderer "A game-over surface renders from the
 * terminal state"; safe-area insets added by `mobile-client-playability` task
 * 9.2 / design D6).
 *
 * Rendered by `GameScreen` when `state.status === 'dead'` instead of the play
 * view, so a dead player is never shown as an ordinary frozen map (spec:
 * "Game over is distinct from a frozen map"). It presents an unmistakable
 * title/message and a "New run" affordance; pressing it invokes the client's
 * `newRun`, which builds fresh initial state and returns to the play view. The
 * container is inset top/bottom by the device safe area so the content clears
 * the status and navigation bars.
 *
 * Stateless and dispatch-only: it reads `newRun` from context and never mutates
 * `GameState` (design D10).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGameContext } from '../providers/GameProvider';
import { colors } from '../theme/colors';

export function GameOver() {
  const { newRun } = useGameContext();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Text style={styles.title}>You have died</Text>
      <Text style={styles.message}>The dungeon claims another adventurer.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a new run"
        onPress={newRun}
        style={({ pressed }) => [styles.button, pressed === true && styles.pressed]}
      >
        <Text style={styles.buttonLabel}>New run</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.entity,
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: colors.visible,
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.player,
  },
  pressed: {
    backgroundColor: colors.floor,
  },
  buttonLabel: {
    color: colors.visible,
    fontSize: 18,
  },
});
