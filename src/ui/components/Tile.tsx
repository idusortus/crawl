/**
 * `Tile` — a single memoized map cell (change `expo-glyph-renderer`, design D2;
 * task 3.4; fitted `size` prop added by `mobile-client-playability` D1, task 4.1).
 *
 * A `<Text>` glyph. Props are primitives only (`glyph`, `color`,
 * `backgroundColor`, `size`) so `React.memo`'s shallow comparison is meaningful
 * and the 1,200-cell grid only re-renders the cells whose props actually changed
 * (design D2). `size` is the fitted side length in dp; it defaults to the module
 * constant {@link TILE_SIZE}, so a caller that omits it keeps the original fixed
 * grid and the component still aligns without layout maths at the call site.
 */

import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

/** Fallback side length in pixels of a single map cell. */
export const TILE_SIZE = 14;

/** Props for {@link Tile}. Kept primitive-only so memoization works. */
export interface TileProps {
  /** The character to draw (`' '` renders a blank cell). */
  glyph: string;
  /** Foreground color. */
  color: string;
  /** Background color. */
  backgroundColor: string;
  /** Fitted side length in dp; defaults to {@link TILE_SIZE}. */
  size?: number;
}

function TileComponent({ glyph, color, backgroundColor, size = TILE_SIZE }: TileProps) {
  return (
    <Text
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          lineHeight: size,
          fontSize: size,
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
    textAlign: 'center',
    // A monospace face keeps the fitted grid from shifting between glyphs.
    fontFamily: 'monospace',
  },
});
