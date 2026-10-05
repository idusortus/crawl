/**
 * `MapView` — the fitted glyph grid behind a camera viewport (change
 * `expo-glyph-renderer`, design D2/D5; task 3.4; camera added by
 * `ui-fit-and-persistence` design D1/D5, task 1.2; fit-to-width + tap-to-move
 * added by `mobile-client-playability` design D1/D2/D7, tasks 4.2/4.3/5.3).
 *
 * Reads `GameState` from the game context and draws the grid of memoized
 * {@link Tile}s inside an outer, clipped viewport `View`. FOV is **derived per
 * render** from `state.grid` + the player position + `DEFAULT_SIGHT_RADIUS`
 * (design D5) and memoized on those inputs; the persistent `state.explored` mask
 * is read directly. Visibility is never stored, matching the engine's model.
 *
 * The tile side length is fitted to the measured viewport width
 * (`floor(viewportWidth / grid.width)`, at least 1) so the full level width is
 * visible (design D1). Before the first `onLayout` the width is 0, so the fixed
 * `TILE_SIZE` is used for a safe first render. Each axis is centred when the
 * fitted map fits the measured viewport on that axis, and pinned to `flex-start`
 * with the clamped camera translation when it overflows (the vertical axis on a
 * phone).
 *
 * A single `Pressable` wrapper handles taps: the touch location plus the applied
 * per-axis offset is converted to a tile. In normal play a cardinal-adjacent tap
 * dispatches a `move` (the engine bumps-to-attack when the tile is occupied) and
 * a non-adjacent tap does nothing. In ranged target mode a tap on a **visible
 * living monster** (not the player) dispatches a `ranged-attack` at that tile and
 * exits target mode; any other tap exits target mode without dispatching (task
 * 6.3; design D7). The target test is the pure `rangedTargetAt` helper so it is
 * unit-tested without a renderer.
 *
 * Tile resolution is delegated to the pure `tileRender` helper, so this
 * component only maps state → per-tile primitives (glyph/color/background),
 * which is exactly what lets `Tile` memoize.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  computeFov,
  DEFAULT_SIGHT_RADIUS,
  entityAt,
  entityById,
  forEachCoord,
} from '@engine';

import { useGameContext } from '../providers/GameProvider';
import { appliedAxisOffset, axisOffset } from '../logic/camera';
import { tileRender } from '../logic/glyphs';
import { directionForDelta } from '../logic/input';
import { rangedTargetAt } from '../logic/ranged';
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

/** Props for {@link MapView}; target mode is owned by `GameScreen` (design D7). */
export interface MapViewProps {
  /** True while ranged target mode is active; taps then aim instead of move. */
  targetMode?: boolean;
  /** Invoked after a ranged shot is dispatched or a non-target tap cancels. */
  onExitTargetMode?: () => void;
}

export function MapView({ targetMode = false, onExitTargetMode }: MapViewProps) {
  const { state, pack, dispatch } = useGameContext();

  // The visible viewport size, captured from `onLayout` on the clipped outer
  // node. Initial `0` keeps the first render safe (fixed tile size, offset 0) —
  // the map shows its top-left and adopts the fit once layout reports (design D1).
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });

  const player = state && entityById(state.entities, state.playerId);

  // Visibility is a pure function of the grid + observer + radius (design D5),
  // so it is memoized on exactly those inputs rather than stored in state.
  const visible = useMemo(() => {
    if (state === undefined || player === undefined) return undefined;
    return computeFov(state.grid, player.pos, DEFAULT_SIGHT_RADIUS);
  }, [state, player]);

  // Resolve every tile once per (state, visible-mask, pack) change. The outer
  // array is re-created only when inputs move, while the memoized `Tile`s skip
  // re-rendering when their props are unchanged.
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

  // Fit tiles to the measured viewport width (design D1). Before measurement the
  // width is 0, so fall back to the fixed `TILE_SIZE`.
  const measured = viewport.width > 0;
  const tileSize = measured
    ? Math.max(1, Math.floor(viewport.width / width))
    : TILE_SIZE;

  const fittedWidth = width * tileSize;
  const fittedHeight = height * tileSize;

  // A fitted width never exceeds the viewport (floor division), so the
  // horizontal axis is always centred; the vertical axis is centred only when
  // the fitted height fits, otherwise it is pinned to `flex-start` and the
  // clamped camera translates it.
  const centerX = measured && fittedWidth <= viewport.width;
  const centerY = viewport.height > 0 && fittedHeight <= viewport.height;

  // The camera translation is derived per render from the player + viewport. For
  // a centred axis `axisOffset` already returns 0 (the map fits that axis).
  const offsetX =
    player === undefined
      ? 0
      : axisOffset(fittedWidth, viewport.width, player.pos.x, tileSize);
  const offsetY =
    player === undefined
      ? 0
      : axisOffset(fittedHeight, viewport.height, player.pos.y, tileSize);

  // The dp offset actually applied to the map's origin on each axis: the
  // centring margin when centred, else the camera translation. Hit-testing must
  // subtract exactly this so a tap lands on the tile the player sees (D7).
  const appliedX = appliedAxisOffset(fittedWidth, viewport.width, offsetX);
  const appliedY = appliedAxisOffset(fittedHeight, viewport.height, offsetY);

  const handlePress = (locationX: number, locationY: number) => {
    if (player === undefined) return;
    const tile = {
      x: Math.floor((locationX - appliedX) / tileSize),
      y: Math.floor((locationY - appliedY) / tileSize),
    };

    if (targetMode) {
      // Target mode: a tap on a visible living monster (not the player) fires at
      // that tile — the engine stays the range/visibility authority and will
      // no-op an out-of-range or unseen target. Any other tap cancels target
      // mode without dispatching (task 6.3; design D7).
      const target = rangedTargetAt(
        state.grid,
        state.entities,
        visible,
        state.playerId,
        tile,
      );
      if (target !== undefined) {
        dispatch({ type: 'ranged-attack', target: tile });
      }
      onExitTargetMode?.();
      return;
    }

    // Normal mode: a cardinal-adjacent tap moves (the engine bumps-to-attack if
    // the tile is occupied). A non-adjacent tap dispatches nothing, and so does
    // a tap outside the grid — e.g. in the centring margin when the fitted map
    // is centred (design D7).
    const inBounds =
      tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height;
    if (!inBounds) return;

    const direction = directionForDelta(player.pos, tile);
    if (direction !== undefined) {
      dispatch({ type: 'move', direction });
    }
  };

  return (
    <Pressable
      style={[
        styles.viewport,
        {
          alignItems: centerX ? 'center' : 'flex-start',
          justifyContent: centerY ? 'center' : 'flex-start',
        },
      ]}
      onLayout={(event) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        setViewport({ width: w, height: h });
      }}
      onPress={(event) => {
        handlePress(event.nativeEvent.locationX, event.nativeEvent.locationY);
      }}
    >
      <View
        style={[
          styles.map,
          {
            width: fittedWidth,
            height: fittedHeight,
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
            size={tileSize}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewport: {
    // The VISIBLE, clipped node: `onLayout` measures this (flex: 1), never the
    // full-size inner map. The per-axis alignment is applied inline (centre when
    // the fitted map fits, `flex-start` when it overflows so the translate
    // offset is measured from the top-left).
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.unseen,
  },
});
