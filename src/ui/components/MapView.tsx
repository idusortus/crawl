/**
 * `MapView` — the fixed glyph grid (change `expo-glyph-renderer`, design
 * D2/D5; task 3.4).
 *
 * Reads `GameState` from the game context and draws a fixed 40×30 flex grid of
 * memoized {@link Tile}s. FOV is **derived per render** from `state.grid` +
 * the player position + `DEFAULT_SIGHT_RADIUS` (design D5) and memoized on those
 * inputs; the persistent `state.explored` mask is read directly. Visibility is
 * never stored, matching the engine's model.
 *
 * Tile resolution is delegated to the pure `tileRender` helper, so this
 * component only maps state → per-tile primitives (glyph/color/background),
 * which is exactly what lets `Tile` memoize.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  computeFov,
  DEFAULT_SIGHT_RADIUS,
  entityAt,
  entityById,
  forEachCoord,
} from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { tileRender } from '../logic/glyphs';
import { colors } from '../theme/colors';

import { TILE_SIZE, Tile } from './Tile';

/** One resolved cell, ready to hand to a memoized `Tile`. */
interface Cell {
  glyph: string;
  color: string;
  backgroundColor: string;
}

export function MapView() {
  const { state, pack } = useGameContext();

  const player = state && entityById(state.entities, state.playerId);

  // Visibility is a pure function of the grid + observer + radius (design D5),
  // so it is memoized on exactly those inputs rather than stored in state.
  const visible = useMemo(() => {
    if (state === undefined || player === undefined) return undefined;
    return computeFov(state.grid, player.pos, DEFAULT_SIGHT_RADIUS);
  }, [state, player]);

  // Resolve every tile once per (state, visible-mask, pack) change. The grid is
  // fixed at 1,200 cells; the outer array is re-created only when inputs move,
  // while the memoized `Tile`s skip re-rendering when their props are unchanged.
  const cells = useMemo<Cell[]>(() => {
    if (state === undefined || pack === undefined || visible === undefined) {
      return [];
    }
    const next: Cell[] = [];
    forEachCoord(state.grid, (pos, index) => {
      const entity = entityAt(state.entities, pos);
      next.push(
        tileRender({
          passable: state.grid.passable[index] === true,
          visible: visible[index] === true,
          explored: state.explored[index] === true,
          entity,
          pack,
          isPlayer: entity !== undefined && entity.id === state.playerId,
        }),
      );
    });
    return next;
  }, [state, pack, visible]);

  if (state === undefined || pack === undefined || visible === undefined) {
    return null;
  }

  const { width, height } = state.grid;

  return (
    <View
      style={[
        styles.map,
        { width: width * TILE_SIZE, height: height * TILE_SIZE },
      ]}
    >
      {cells.map((cell, index) => (
        <Tile
          key={index}
          glyph={cell.glyph}
          color={cell.color}
          backgroundColor={cell.backgroundColor}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.unseen,
  },
});
