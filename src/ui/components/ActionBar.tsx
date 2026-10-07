/**
 * `ActionBar` — the non-directional gameplay controls (change
 * `expo-glyph-renderer`, design D3; task 4.1; extended by
 * `core-gameplay-loop` task 9.2 / design D10; ranged control added by
 * `mobile-client-playability` tasks 6.1/6.4 / design D7; zoom-in/out controls
 * added by `map-zoom` task 3.2 / design D6).
 *
 * Renders the on-screen controls for the core gameplay actions — pickup, the
 * carried consumable list (use-item), the ranged-attack control, and
 * save/resume, plus the existing Descend button. Every control is a stateless
 * `Pressable` that dispatches a command (or a defined save/resume/target-mode
 * action) through the game hook's `dispatch`/`save`/`resume` or the
 * presentation callback; it holds no state and never mutates `GameState`
 * (design D10; spec: input-mapping "Every input dispatches a command or a
 * defined action without mutating state").
 *
 * The carried-item buttons are derived from `state.carriedItemIds`, so the list
 * reflects live state and a use always names an id the player actually carries.
 * **Ranged weapons are filtered out of that list** (task 6.4): a weapon is
 * fired through the ranged control, never consumed as a use-item.
 *
 * Inapplicable actions are hidden: `Pick up` renders only
 * while a floor item is underfoot (`floorItemAt`) and `Descend` only while the
 * player stands on the stairs (`isOnStairs`), so the bar never offers an action
 * the engine would refuse.
 *
 * The ranged control is rendered **only** while the player carries an item whose
 * pack entry declares a `ranged` descriptor, and its pressed state toggles
 * ephemeral target mode owned by `GameScreen` (design D7). It is hidden
 * otherwise, so it never clutters the controls when unusable.
 *
 * The travel control (change `travel-and-repeat-move`, tasks 4.1/5.2) is always
 * rendered: it toggles the ephemeral travel-target mode, and a second press
 * cancels the mode and any travel in progress without dispatching a command. Its
 * `active` flag highlights it while the mode is on **or** auto-travel is running
 * (post-apply review Fix 8), mirroring the ranged Fire/Cancel control.
 *
 * Save feedback (change `ui-fit-and-persistence`, design D3): a successful save
 * flips the hook's presentation-only `savedIndicator`, and a storage/hydration
 * failure lands in the separate non-fatal `saveError` channel. Both are shown as
 * an inline note — the indicator is transient and cleared by the next action,
 * and the error note never hides the game (unlike the fatal pack-load `error`).
 *
 * Travel-refusal feedback (change `auto-travel-reliability`, design D3; task
 * 3.2): the optional `travelNotice` string renders in the same inline-note slot
 * as the save feedback (after a save error, before the "Saved" indicator), so a
 * tap that cannot begin travel is visible without a new surface or dependency.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGameContext } from '../providers/GameProvider';
import { hasRangedWeapon, isRangedWeapon } from '../logic/ranged';
import { floorItemAt, isOnStairs } from '../logic/objects';
import { zoomFactor } from '../logic/zoom';
import { colors } from '../theme/colors';

/** One on-screen action button, described declaratively. */
interface ActionButton {
  /** The visible label. */
  label: string;
  /** The accessibility label (more descriptive than the short visible text). */
  accessibilityLabel: string;
  /** Dispatches the command / invokes the action when pressed. */
  onPress: () => void;
  /** True when the control reflects an active mode (renders highlighted). */
  active?: boolean;
}

/** Props for {@link ActionBar}. */
export interface ActionBarProps {
  /** Whether ranged target mode is currently active (presentation-only). */
  targetMode: boolean;
  /** Toggles ranged target mode; pressing again cancels it. */
  onToggleTargetMode: () => void;
  /** Whether travel-target mode is currently active (presentation-only). */
  travelMode: boolean;
  /** Toggles travel-target mode; pressing again cancels the mode and any travel. */
  onToggleTravelMode: () => void;
  /**
   * Whether auto-travel is currently running (change `travel-and-repeat-move`,
   * post-apply review Fix 8). `travelMode` alone is not enough: `startTravel`
   * exits travel-target mode as soon as a destination is chosen, so while the
   * player is auto-walking the control would otherwise show no active state.
   */
  travelInProgress: boolean;
  /**
   * A brief refusal message raised when a travel tap cannot begin travel
   * (change `auto-travel-reliability`, design D3; task 3.2), or `undefined`.
   * Presentation-only: never part of `GameState` or the save.
   */
  travelNotice?: string;
  /**
   * The current zoom level: an index into the pure `logic/zoom` ladder (change
   * `map-zoom`, design D1/D6; task 3.2). Presentation-only — it comes from
   * `GameScreen`'s ephemeral state and never touches `GameState`.
   */
  zoomLevel: number;
  /** Steps the zoom level up one (a no-op at the maximum bound). */
  onZoomIn: () => void;
  /** Steps the zoom level down one (a no-op at the minimum bound). */
  onZoomOut: () => void;
}

export function ActionBar({
  targetMode,
  onToggleTargetMode,
  travelMode,
  onToggleTravelMode,
  travelInProgress,
  travelNotice,
  zoomLevel,
  onZoomIn,
  onZoomOut,
}: ActionBarProps) {
  const { dispatch, save, resume, hasSave, state, pack, savedIndicator, saveError } =
    useGameContext();

  const carried = state?.carriedItemIds ?? [];
  const rangedCarried = hasRangedWeapon(pack, carried);
  // A weapon is fired through the ranged control, so it is never offered as a
  // consumable (task 6.4).
  const usableItems = carried.filter((itemId) => !isRangedWeapon(pack, itemId));

  // `Pick up` is only meaningful while a floor item is underfoot and `Descend`
  // only while the player is on the stairs tile; both are hidden otherwise so
  // the bar never offers an action the engine would refuse. `state` may be
  // undefined before the run loads, so the helpers are guarded by the nullish
  // checks rather than called unconditionally.
  const canPickUp = state !== undefined && floorItemAt(state) !== undefined;
  const canDescend = state !== undefined && isOnStairs(state);

  const buttons: ActionButton[] = [];
  if (canPickUp) {
    buttons.push({
      label: 'Pick up',
      accessibilityLabel: 'Pick up the item on your tile',
      onPress: () => dispatch({ type: 'pickup' }),
    });
  }
  if (canDescend) {
    buttons.push({
      label: 'Descend',
      accessibilityLabel: 'Descend to the next level',
      onPress: () => dispatch({ type: 'descend' }),
    });
  }
  if (rangedCarried) {
    buttons.push({
      label: targetMode ? 'Cancel' : 'Fire',
      accessibilityLabel: targetMode
        ? 'Cancel ranged targeting'
        : 'Enter ranged targeting mode',
      onPress: onToggleTargetMode,
      active: targetMode,
    });
  }
  // The travel control is always available: it toggles travel-target mode and,
  // on a second press, cancels the mode and any travel in progress without
  // dispatching (change `travel-and-repeat-move`, design D5; tasks 4.1/5.2). It
  // is highlighted while the mode is active OR auto-travel is running, so its
  // state is unambiguous after `startTravel` exits the mode (post-apply review
  // Fix 8); pressing it still cancels travel without dispatching.
  buttons.push({
    label: travelMode ? 'Cancel' : 'Travel',
    accessibilityLabel: travelMode
      ? 'Cancel travel targeting'
      : 'Enter travel targeting mode',
    onPress: onToggleTravelMode,
    active: travelMode || travelInProgress,
  });
  buttons.push({
    label: 'Save',
    accessibilityLabel: 'Save the current run',
    onPress: save,
  });
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
              button.active === true && styles.active,
              pressed === true && styles.pressed,
            ]}
          >
            <Text style={styles.label}>{button.label}</Text>
          </Pressable>
        ))}
        {/* Map zoom controls (change `map-zoom`, design D6; task 3.2): two
            buttons reusing the action-bar styling plus the current level, wired
            to the pure ladder steppers. A press at either bound is a no-op. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={onZoomOut}
          style={({ pressed }) => [
            styles.button,
            pressed === true && styles.pressed,
          ]}
        >
          <Text style={styles.label}>−</Text>
        </Pressable>
        <Text style={styles.zoomLevel}>Zoom {zoomFactor(zoomLevel)}×</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={onZoomIn}
          style={({ pressed }) => [
            styles.button,
            pressed === true && styles.pressed,
          ]}
        >
          <Text style={styles.label}>+</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {usableItems.length === 0 ? (
          <Text style={styles.empty}>No items to use</Text>
        ) : (
          usableItems.map((itemId, index) => (
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
      ) : travelNotice !== undefined ? (
        <Text style={styles.travelNotice}>{travelNotice}</Text>
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
  active: {
    backgroundColor: colors.floor,
    borderColor: colors.player,
    borderWidth: 2,
  },
  pressed: {
    backgroundColor: colors.floor,
  },
  label: {
    color: colors.visible,
    fontSize: 15,
  },
  zoomLevel: {
    color: colors.explored,
    fontSize: 15,
    alignSelf: 'center',
    paddingHorizontal: 4,
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
  travelNotice: {
    color: colors.entity,
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
