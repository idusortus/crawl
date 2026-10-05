/**
 * `MapView` — the fixed glyph grid behind a camera viewport (change
 * `expo-glyph-renderer`, design D2/D5; task 3.4; camera added by
 * `ui-fit-and-persistence` design D1/D5, task 1.2).
 *
 * Reads `GameState` from the game context and draws a fixed 40×30 flex grid of
 * memoized {@link Tile}s inside an outer, clipped viewport `View`. FOV is
 * **derived per render** from `state.grid` + the player position +
 * `DEFAULT_SIGHT_RADIUS` (design D5) and memoized on those inputs; the persistent
 * `state.explored` mask is read directly. Visibility is never stored, matching the
 * engine's model.
 *
 * The inner map stays the full `width * TILE_SIZE` × `height * TILE_SIZE` dp; the
 * outer viewport clips it and translates it by the camera offset so the player's
 * tile stays visible on a phone-sized screen. The offset is a pure function of the
 * player position and the **measured viewport** (the `flex: 1`, `overflow: 'hidden'`
 * node — not the 560 dp inner map), computed by {@link axisOffset}. It is derived,
 * never stored in `GameState` (the engine keeps "visibility is derived").
 *
 * Tile resolution is delegated to the pure `tileRender` helper, so this
 * component only maps state → per-tile primitives (glyph/color/background),
 * which is exactly what lets `Tile` memoize.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  computeFov,
  DEFAULT_SIGHT_RADIUS,
  entityAt,
  entityById,
  forEachCoord,
} from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { axisOffset } from '../logic/camera';
import { tileRender } from '../logic/glyphs';
import { colors } from '../theme/colors';

import { TILE_SIZE, Tile } from './Tile';

/** One resolved cell, ready to hand to a memoized `Tile`. */
interface Cell {
  glyph: string;
  color: string;
  backgroundColor: string;
}

/** The measured viewport size in dp; `0` until the first `onLayout` fires. */
interface ViewportSize {
  width: number;
  height: number;
}

export function MapView() {
  const { state, pack } = useGameContext();

  // The visible viewport size, captured from `onLayout` on the clipped outer
  // node. Initial `0` keeps the first render safe (offset 0) — the map shows its
  // top-left and adopts the correct camera once layout reports (design D1).
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });

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
          pos,
          stairs: state.level.stairs,
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

  // The camera offset is derived per render from the player + measured viewport.
  // `player` is defined here (the ready branch implies state + entity resolution),
  // but guard anyway so the math never reads an undefined tile.
  const offsetX =
    player === undefined
      ? 0
      : axisOffset(
          width * TILE_SIZE,
          viewport.width,
          player.pos.x,
          TILE_SIZE,
        );
  const offsetY =
    player === undefined
      ? 0
      : axisOffset(
          height * TILE_SIZE,
          viewport.height,
          player.pos.y,
          TILE_SIZE,
        );

  return (
    <View
      style={styles.viewport}
      onLayout={(event) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        setViewport({ width: w, height: h });
      }}
    >
      <View
        style={[
          styles.map,
          {
            width: width * TILE_SIZE,
            height: height * TILE_SIZE,
            transform: [{ translateX: offsetX }, { translateY: offsetY }],
          },
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
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    // The VISIBLE, clipped node: `onLayout` measures this (flex: 1), never the
    // full-size inner map. `flex-start` pins the map's origin so the translate
    // offset is measured from the top-left.
    flex: 1,
    overflow: 'hidden',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  map: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.unseen,
  },
});
