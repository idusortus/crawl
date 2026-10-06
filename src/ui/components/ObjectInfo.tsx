/**
 * `ObjectInfo` — the "what am I standing on?" line.
 *
 * Reads `{ state, pack }` from the game context and renders the pure
 * `objectInfoAt(state, pack)` result as a short, single line: the item's name
 * (or "Stairs down") with its detail as supporting text. It renders nothing
 * when the tile is empty, when the pack has not loaded, or before the first
 * run, so the HUD stays quiet on ordinary floor tiles.
 *
 * Stateless and read-only: it derives its text and never dispatches or mutates
 * `GameState`. It reads the same shared palette as the neighbouring HUD
 * components so it drops into the existing layout without new tokens.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { objectInfoAt } from '../logic/objects';
import { colors } from '../theme/colors';

export function ObjectInfo() {
  const { state, pack } = useGameContext();

  if (state === undefined || pack === undefined) return null;

  const info = objectInfoAt(state, pack);
  if (info === undefined) return null;

  return (
    <View
      style={styles.bar}
      accessible
      accessibilityLabel={`${info.title}. ${info.detail}`}
    >
      <Text style={styles.title}>{info.title}</Text>
      <Text style={styles.detail}>{info.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.visible,
    fontSize: 15,
    fontWeight: 'bold',
  },
  detail: {
    color: colors.explored,
    fontSize: 13,
    paddingTop: 2,
  },
});
