/**
 * `Tile` — a single memoized map cell (change `expo-glyph-renderer`, design D2;
 * task 3.4).
 *
 * A fixed-size `<Text>` glyph. Props are primitives only (`glyph`, `color`,
 * `backgroundColor`) so `React.memo`'s shallow comparison is meaningful and the
 * 1,200-cell grid only re-renders the cells whose props actually changed (design
 * D2). The cell size is a module constant so every tile aligns into the fixed
 * grid without layout maths at the call site.
 */

import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

/** Side length in pixels of a single map cell. */
export const TILE_SIZE = 14;

/** Props for {@link Tile}. Kept primitive-only so memoization works. */
export interface TileProps {
  /** The character to draw (`' '` renders a blank cell). */
  glyph: string;
  /** Foreground color. */
  color: string;
  /** Background color. */
  backgroundColor: string;
}

function TileComponent({ glyph, color, backgroundColor }: TileProps) {
  return (
    <Text
      style={[
        styles.tile,
        {
          color,
          backgroundColor,
        },
      ]}
      numberOfLines={1}
    >
      {glyph}
    </Text>
  );
}

/** Memoized so unchanged cells skip re-render on each input. */
export const Tile = memo(TileComponent);

const styles = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    lineHeight: TILE_SIZE,
    fontSize: 11,
    textAlign: 'center',
    // A monospace face keeps the fixed grid from shifting between glyphs.
    fontFamily: 'monospace',
  },
});
