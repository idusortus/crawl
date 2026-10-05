/**
 * `Hud` — the status bar (change `expo-glyph-renderer`, task 3.4; stairs hint
 * added by `mobile-client-playability` design D5 / task 8.2).
 *
 * Reads `GameState` from the game context and shows the current level depth,
 * a discoverability aid toward the level's stairs, and the player's HP via the
 * engine's `actorHp` accessor. The stairs hint is derived purely from the
 * player position and `state.level.stairs` (see `stairsHint`), so the HUD
 * updates automatically as the player moves; it is absent when the player is
 * on the stairs or the level has none.
 */

import { StyleSheet, Text, View } from 'react-native';

import { actorHp, entityById } from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { stairsHint } from '../logic/stairs';
import { colors } from '../theme/colors';

export function Hud() {
  const { state } = useGameContext();

  if (state === undefined) return null;

  const player = entityById(state.entities, state.playerId);
  const hp = player === undefined ? '?' : String(actorHp(player));
  const hint =
    player === undefined ? undefined : stairsHint(player.pos, state.level.stairs);

  return (
    <View style={styles.bar}>
      <Text style={styles.label}>Depth {state.level.depth}</Text>
      {hint !== undefined && (
        <Text style={styles.label}>
          Stairs {hint.direction} ({hint.distance})
        </Text>
      )}
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
