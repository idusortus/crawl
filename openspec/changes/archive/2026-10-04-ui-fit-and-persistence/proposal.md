# Proposal

## Why

Three defects surfaced from real device testing that each make the shipped app worse than the engine underneath it:

1. **The map does not fit the screen.** `TILE_SIZE = 14` over a 40×30 grid renders a fixed 560×420 dp map. A phone is ~360–412 dp wide, so the map overflows horizontally and `GameScreen` centers it — walking east/west scrolls the player out of view with no way to see where they are.
2. **The attack controls read as a duplicate.** `Dpad` renders two identical-looking directional rows; the second dispatches `attack` but differs only by border color and carries no visible label, so the user reasonably asked "what is the second line of directional buttons for?".
3. **Save appears to do nothing.** `save()` writes to an in-memory `useState` string and returns nothing visible, while auto-save already sets `hasSave` after the first turn — so pressing Save changes no pixels. Worse, the store is in-memory only, so it cannot survive an app restart, which is what "Save" is expected to mean.

Each is purely a `src/ui` client concern. The engine already owns serialization and replay, and already renders a full grid; none of these fixes requires an engine change.

## What Changes

- **Camera-following map viewport.** Render the full 560×420 map inside a viewport clipped to the available screen. Translate the inner map container so the player's tile stays centered, clamped at the map edges (no letterboxing past an edge, offset `0` when the map fits). Prefer the simplest deterministic mechanism (an `overflow: 'hidden'` wrapper plus a translated inner `View`); no animation. Measure the visible viewport with `onLayout` so the clamp is correct on any device, and handle the not-yet-measured first render; `GameScreen`'s `mapArea` drops its centering so `onLayout` measures the visible viewport rather than the map. `TILE_SIZE` and the grid stay unchanged; `src/engine` is untouched.
- **Labeled, distinguishable attack controls.** Add visible captions above the two `Dpad` rows (e.g. "Move" / "Attack") and keep the attack row visually distinct, so the second row is self-evident. Both rows continue to dispatch through `dispatch` with no component state.
- **Real, durable persistence with visible feedback.** Replace the in-memory `useState` save slot with an async storage adapter behind the existing `src/ui/logic/save.ts` helpers, backed by `@react-native-async-storage/async-storage` at the exact Expo SDK 57 version `2.2.0`. The store module (`src/ui/logic/saveStorage.ts`) takes an injected async storage adapter (`getItem`/`setItem`/`removeItem`) so its pure logic is unit-tested with a fake in-memory adapter (`src/ui/logic/saveStorage.test.ts`), while the real AsyncStorage is wired only in `useGame`; the test must NOT import the native module (node env can't resolve it). Hydrate any existing save on startup; write on save and auto-save; surface a transient "Saved" indication plus a clear Save/Resume affordance. Hydration must not block first paint, a `hydratedRef` barrier makes save/auto-save no-ops until hydration settles (so a first move cannot clobber the stored run), `hasSave` is evaluated after hydration, and storage failures surface through a separate non-fatal `saveError` channel rather than replacing the game screen. The resume policy is "offer Resume — never silently replace the live run". No `Date`/`Math.random`; a resumed run still equals the uninterrupted run because the engine already guarantees it.
- **Exact dependency pin.** Add the dependency via `npx expo install @react-native-async-storage/async-storage` so the lockfile stays consistent; the version must be the SDK-57 pin `2.2.0` so `expo prebuild`/APK CI stay green.

## Capabilities

### New Capabilities
<!-- None: this change modifies existing UI capabilities only. -->

### Modified Capabilities
- `ui/glyph-renderer`: the map is presented through a viewport that follows the player, keeping the player's tile visible and clamped at the map edges.
- `ui/input-mapping`: the attack controls are visibly labeled and distinguishable from the movement controls.
- `ui/app-shell`: the run is persisted to device storage and restored on the next launch, so save/resume is durable rather than in-memory.

## Impact

- **Client (`src/ui/**`):** `components/MapView.tsx` (viewport + camera translation, possibly a new `MapViewport`/`Camera` component), `components/GameScreen.tsx` (`mapArea` drops `alignItems/justifyContent: 'center'` so `onLayout` measures the visible viewport, not the 560 dp map), `components/Dpad.tsx` (row captions + distinct treatment), `hooks/useGame.ts` (async hydration/write, `hydratedRef` barrier, transient saved feedback, separate non-fatal `saveError`), `logic/save.ts`, the new `logic/saveStorage.ts` + `logic/camera.ts`, and the provider/screen wiring for the async store; still a pure `@engine` client importing only from `@engine`.
- **Dependency:** `package.json`/lockfile gain `@react-native-async-storage/async-storage@2.2.0` (SDK-57 pin), autolinked through `expo prebuild` for the APK CI.
- **Engine (`src/engine/**`):** untouched. Determinism is preserved — persistence only reuses the engine's existing `serializeSave`/`resumeRun` surface.
- **Tests/docs:** UI logic tests for the camera offset maths (`logic/camera.test.ts`) and the async save adapter (`logic/saveStorage.test.ts`, fake adapter) under node Vitest; these existing tests stay green unchanged — `logic/save.test.ts`, `logic/glyphs.test.ts`, `logic/input.test.ts`, `state/createInitialState.test.ts`, and the engine's `__tests__/index-surface.test.ts`. The new storage test must NOT import the native AsyncStorage module (node env can't resolve it). The APK gate is `npx expo prebuild --platform android` and/or a `v*` run — `npx expo export --platform android` proves JS bundling only, not native autolinking. `STATE.md`/`decisions.md` updated after apply.
- **Not in scope:** engine changes, pack changes, a seed-selection UI, animation, Skia/canvas rendering, a web target.
