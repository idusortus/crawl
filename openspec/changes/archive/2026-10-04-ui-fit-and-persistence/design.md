# Design

## Context

See `proposal.md` — Why. The client surface that constrains this change, as it exists today:

- **Map rendering.** `src/ui/components/Tile.tsx` exports `TILE_SIZE = 14`; `MapView.tsx` renders a flex-wrap grid sized `width * TILE_SIZE` × `height * TILE_SIZE` (40×30 → 560×420 dp) with no clipping or scaling. `GameScreen.tsx` centers it in `styles.mapArea` (`flex: 1`, `alignItems/justifyContent: 'center'`), so on a ~360–412 dp phone the horizontal overflow is simply clipped and the player walks off-screen east/west. `state.grid` is `{ width, height, passable }`; the player is `entityById(state.entities, state.playerId).pos` with an integer `{ x, y }` in tile coordinates. **The viewport is the `flex: 1`, `overflow: 'hidden'` node that `onLayout` measures — the VISIBLE viewport, not the 560 dp inner map.** Therefore `GameScreen`'s `mapArea` MUST drop `alignItems/justifyContent: 'center'`: if the container still centers, the measured width is the map's 560 dp (not the screen's), so the camera never follows. `MapView`'s own outer viewport already sets `alignItems/justifyContent: 'flex-start'` (D1).
- **Input controls.** `Dpad.tsx` renders two `View` rows of four `Pressable`s each: the first dispatches `{ type: 'move', direction }` (`borderColor: colors.floor`), the second `{ type: 'attack', direction }` (`borderColor: colors.entity`). Neither row has a visible caption; both carry accessibility labels. The component is stateless and dispatches through `useGameContext().dispatch`.
- **Save/resume.** `useGame.ts` holds the save string in an in-memory `useState` slot; `save()` (lines 169–176) and the auto-save `useEffect` (218–228) both call `setSaveStore(saveRun(...))`. `hasSave` is `saveStore !== undefined`; `ActionBar.tsx` adds a Resume button only when `hasSave` is true, and Save always renders. `src/ui/logic/save.ts` wraps the engine's `serializeSave`/`resumeRun` behind pure `saveRun`/`resumeRunState` helpers taking/returning a `RunState` (`{ state, commands, appliedCount }`). `saveRun`/`resumeRun` are synchronous and framework-free.
- **Purity constraints.** `src/engine/**` must not import `react`/`react-native`/`expo*` or use `Math.random`/`Date`; the UI imports only from `@engine`. No engine file may be edited by this change.

Existing specs read in full before drafting: `openspec/specs/ui/{app-shell,glyph-renderer,input-mapping}/spec.md`. Only observable contracts that actually change are in the delta.

## Goals / Non-Goals

**Goals:**
- Keep the player's tile visible on any phone-sized viewport while rendering the full map at the existing fixed tile size.
- Make the attack controls self-evident (visible labels + distinct treatment) without changing dispatch.
- Make "Save" durable across app restarts and give it visible feedback, while keeping the engine pure and the client a thin `@engine` client.
- Add exactly one new dependency at the Expo SDK 57 pin so `expo prebuild`/APK CI stay green.

**Non-Goals:**
- Any change to `src/engine` (types, state, save format, or behavior).
- Changing `TILE_SIZE`, the 40×30 grid, level generation, or rendering deck semantics.
- Animation, inertia scrolling, pinch-zoom, or a minimap.
- A seed-selection UI or a multi-slot save browser (one slot, as today).
- Web-specific persistence (AsyncStorage is native/React Native; the web target is out of scope for this product).

## Decisions

### D1 — Camera is a pure offset applied to a translated inner map inside a clipped viewport

`MapView` gains an outer viewport `View` (`overflow: 'hidden'`, `flex: 1`, `alignItems: 'flex-start'`, `justifyContent: 'flex-start'`) that clips the full-size inner map `View` and applies `transform: [{ translateX }, { translateY }]`. The offset is computed by a pure helper so it is unit-testable:

```
offset(mapAxis, viewportAxis, playerAxis) = clamp(viewportAxis / 2 - playerAxis * TILE_SIZE, min(0, viewportAxis - mapAxis), 0)
```

where `mapAxis` = `grid.width * TILE_SIZE` (resp. height), `playerAxis` = `player.pos.x` (resp. `y`), and the offset range is stated **once** as `[min(0, viewportAxis − mapAxis), 0]`. This single range expression is what `tasks.md` 1.1 references; do not re-transcribe it elsewhere. The lower bound must be `min(0, viewportAxis − mapAxis)` — a bare `[mapAxis − viewportAxis, 0]` (or `[min(0, mapAxis − viewportAxis), 0]`) is wrong: with a 560 dp map in a 360 dp viewport it evaluates to a positive lower bound, inverting the range to `[+200, 0]` so every offset clamps to `0` and the camera never follows. Properties this yields, matching the spec:

- Not yet measured (`viewportAxis === 0` or non-finite) → offset `0` (safe first render; the map shows its top-left and adopts the correct camera once `onLayout` fires).
- Map fits the axis (`mapAxis <= viewportAxis`) → the lower clamp bound `min(0, viewportAxis − mapAxis)` is `0`, so the range is `[0, 0]` and the offset is `0`.
- Player near an edge → the offset is clamped to `[min(0, viewportAxis − mapAxis), 0]` (negative for a map larger than the viewport), so no blank margin appears past the map edge.
- Otherwise the player is centered within the viewport.

The offset is a tile-aligned integer in dp: the centering term is `playerAxis * TILE_SIZE`, i.e. the player tile's top-left origin in dp, and `TILE_SIZE` is dp, so the unit test asserts exact integer values with no rounding tolerance.

Translate the inner `View` (rather than using a `ScrollView`) because it is the simplest deterministic mechanism: it renders the full grid once, applies no animation or momentum, needs no imperative `scrollTo`/`contentOffset` coordination, and keeps `Tile` memoization intact (the inner map's children never re-mount — only the transform changes). A `ScrollView` with a programmatic `contentOffset` was considered and rejected: it adds imperative scroll state, can fight the user's own scroll gesture, and needs `scrollEnabled={false}` plus per-frame synchronization to be deterministic.

**Viewport measurement.** The viewport's size is captured with `onLayout` into `useState` (width/height, initial `0`), so the clamp is exact on any device and the first render is safe. `onLayout` fires once and only again on rotation/resize, so the state update is not a render loop.

**Recomposition.** The current `MapView` returns `null` before state/pack are ready; the viewport wrapper is added only in the ready branch. The cell-resolution `useMemo` is untouched, so FOV derivation and the memoized-cell behavior are preserved. The offset is derived from `state` + measured viewport, not stored in `GameState`, keeping the engine's "visibility is derived, never stored" model intact. The offset is intentionally **not** memoized against a stable `cells` identity: `applyCommand` already returns a new `state` reference each turn, so `cells` is recreated and a per-turn map re-render is expected regardless of the camera — the camera must not be scoped as a way to avoid it.

Alternative considered: scaling the map to fit (`transform: scale`). Rejected — glyph text at a scaled-down size becomes unreadable and the spec asks for following the player, not shrinking the map.

### D2 — `Dpad` rows get visible captions and a distinct attack treatment

Add a small caption `Text` above each row (`"Move"` and `"Attack"`) with matching `styles.caption`; keep the existing per-button accessibility labels. Keep the attack buttons visually distinct via their existing `colors.entity` border and add a distinguishable treatment (for example a subtly different background or a filled glyph color) so the two groups do not read as duplicates even at a glance. Both rows remain stateless `Pressable`s dispatching through `dispatch`; no new props or state, so the "every input dispatches a command without mutating state" contract is unchanged. The move row gets a "Move" caption too, for symmetry, so the pair is unambiguous.

Alternative considered: remove the attack row and use a modifier (long-press) for attack. Rejected — it hides a core action behind an undiscoverable gesture and reduces reachability; the existing spec requires an on-screen attack control in a chosen direction.

### D3 — The store slot becomes an async, device-persistent adapter; `save.ts` gains an I/O boundary

Keep `src/ui/logic/save.ts` as the pure serialization/replay boundary (unchanged public helpers). Add a small framework-thin async store module (for example `src/ui/logic/saveStorage.ts`) that wraps AsyncStorage and exposes `loadSave(): Promise<string | undefined>` and `persistSave(value: string): Promise<void>` (and a `clearSave` if needed). The `save.ts` helpers remain pure and unit-testable under node Vitest; the storage module is the only place that imports `@react-native-async-storage/async-storage`, so serialization tests never touch native I/O. The module takes an **injected async storage adapter** (an interface with `getItem`/`setItem`/`removeItem`) so the pure part lives in `src/ui/logic/saveStorage.ts` and its test `src/ui/logic/saveStorage.test.ts` uses a fake in-memory adapter. The real AsyncStorage is wired only in `useGame` (through a thin `createAsyncStorageAdapter()` that `useGame` imports and the test never imports); this is required because the node test environment cannot resolve `@react-native-async-storage/async-storage` — the test must NOT import it directly. See D5.

`useGame.ts` changes:
- The save slot becomes `useState<string | undefined>` hydrated by an effect that calls `loadSave()` on mount; a `useEffect` with an empty dependency list runs it once. Hydration failure is captured as an error value (never thrown out of render).
- **`hydratedRef` barrier.** A `useRef(false)` flips to `true` only once hydration settles (success or failure). Until then `save()` and auto-save are **no-ops** — they neither read nor overwrite the slot. This prevents a first-move auto-save from clobbering a stored run before the load effect resolves (the "first-move clobber" race). Hydration must also **not** overwrite a slot already written earlier this session: if the barrier shows a write already happened, the loaded value is discarded in favour of the in-session value.
- `save()` serializes via `saveRun`, then `void persistSave(...)` (the async work is internal — see the signature note below), then sets the in-memory copy and flips a transient saved indicator. Errors set the separate `saveError` slot.
- Auto-save calls the same persist path after a turn boundary, so the stored run matches `saveStore`. Auto-save failures are surfaced the same way; they do not block play. Auto-save also respects the `hydratedRef` barrier.
- `hasSave = saveStore !== undefined`, evaluated **after hydration** — so a save loaded from disk enables Resume on next launch, and no Resume button flashes before the barrier settles.
- A transient "Saved" indicator is a small timestamp-free boolean set on success and cleared after a fixed delay. Because `Date`/`Math.random` are banned in the engine only, but the client should stay deterministic-friendly, the indicator uses a `setTimeout` counter/id rather than a clock value to decide visibility; it is presentation-only and never affects stored content (spec: "Persistence introduces no ambient nondeterminism"). The timer id/indicator state is kept OUT of any stored content — `serializeSave` never sees it.

**Public `save`/`resume` signatures stay synchronous.** `UseGameResult.save` and `UseGameResult.resume` remain `() => void`; the async I/O is internal (e.g. `void persistSave(...)`), so `KeyboardHandlers`, `ActionBar`, and the provider types do not drift to `Promise`-returning handlers.

**`saveError` is a separate, non-fatal channel.** A storage/hydration failure MUST NOT be routed to the fatal pack-load `error`, because that error hides the whole game behind `GameScreen`'s pack-load error screen. Instead it is surfaced as a non-fatal `saveError` rendered in the UI — for example an inline note on the `ActionBar` (the same surface that carries the transient "Saved" indication) — while play continues.

**Merge policy (decided):** do **not** auto-resume. On startup the client presents the fresh run immediately and, if a stored save exists, exposes Resume. This never silently discards a live run, matches the current `ActionBar` Resume affordance, and satisfies the spec's "A stored save does not silently replace the live run". An alternative — auto-resume when a save exists — was rejected because it surprises the user on every launch and makes "start a fresh run" require an explicit extra step.

**Async hydration without blocking paint:** the game state is built synchronously in the existing `useState` initializer (unchanged), so first paint is the fresh run; the load effect resolves afterward and only updates the save slot/`hasSave`, never the live `GameState`. There is therefore no loading gate and the fresh run is never replaced.

Alternative considered: make `saveRun`/`resumeRunState` async and thread promises through the hook. Rejected — it spreads async through pure helpers for no benefit; the serialization itself is synchronous and only the I/O is async.

### D4 — Dependency is pinned to the SDK-57 version and verified through the native-module path

Add `@react-native-async-storage/async-storage` at exactly `2.2.0` (the version Expo SDK 57 pins), installed with `npx expo install @react-native-async-storage/async-storage` so `package.json`/the lockfile stay consistent (the project already learned this the hard way in the react-dom incident). It autolinks through `expo prebuild`, so the Android build picks it up without a config-plugin entry. Verification: `npx expo prebuild --platform android` (the APK CI path — this is what actually exercises native autolinking) and/or a `v*` APK run; **`npx expo export --platform android` proves JS bundling only and does NOT prove native autolinking**, so it is not the gate. Plus `npx tsc --noEmit`, `npm test`, `npm run lint`.

Alternative considered: a hand-rolled file store via `expo-file-system`. Rejected — AsyncStorage is the SDK-pinned, autolinked, minimal choice for a single key/value slot, and adding it does not couple the engine.

### D5 — Camera offset and store behaviour are unit-tested as pure logic

The camera offset math is extracted into a pure function (for example `src/ui/logic/camera.ts`) so node Vitest covers: centering, both-edge clamping, fit-to-viewport zero offset, and the unmeasured (`0`) case. Both `TILE_SIZE` and `onLayout` measurements are dp, so the offset is a tile-aligned integer and the test asserts exact values (no tolerance): centering uses the player tile's top-left origin `playerAxis * TILE_SIZE`. The async store wrapper is tested with an injected/fake in-memory storage adapter covering load-missing → `undefined`, load-error → surfaced error, and persist round-trip. The test lives at `src/ui/logic/saveStorage.test.ts`, uses a fake adapter, and MUST NOT import `@react-native-async-storage/async-storage` (node env can't resolve it). This mirrors the existing pattern of unit-testing `glyphs.ts`/`save.ts`/`input.ts` logic under `environment: 'node'` while UI wiring is covered by `tsc`/lint/prebuild, the known Stage-5 gap.

## Risks / Trade-offs

- **Native module missing at runtime (red box).** AsyncStorage is autolinked; a stale `node_modules`/prebuild cache could still miss it → run `npx expo install` (expo format) and verify with `npx expo prebuild --platform android` (and/or the APK CI run) before shipping. `npx expo export --platform android` only proves JS bundling, not native autolinking.
- **`onLayout` first-render offset of 0** shows the map's top-left for the first frame(s) rather than a centered player → acceptable and safe; the offset corrects as soon as layout reports. No flash of a *wrong* offset beyond that first measurement, since the inner map is always the full grid.
- **Transform clipping on Android** can clip differently at fractional offsets → clamp offsets to integers (tile-aligned translation) to avoid sub-pixel seams between tiles.
- **Save feedback without a clock** → the indicator is a presentation-only boolean with a timer; it never participates in stored content, so determinism of the *run* is unaffected.
- **Async save races (save vs. auto-save).** Both write the same key; AsyncStorage writes for one key are ordered, and each write is the full serialized run at its moment, so the last write wins and is a complete, valid envelope. No partial state.
- **Hydration vs. write race.** A first move before hydration resolves could auto-save over the stored run. Mitigated by the `hydratedRef` barrier in D3: save/auto-save are no-ops until hydration settles, and hydration never overwrites a slot written earlier in the session.
- **Storage quota/availability** → AsyncStorage may throw on read/write; both paths capture the error into the separate non-fatal `saveError` surface (not the fatal pack-load `error`, which would hide the game) instead of swallowing it (spec: "A storage failure is surfaced").
- **UI render tests absent** → camera/offset and store behaviour are covered as pure logic; the visual fit is confirmed on-device. Documented as the known gap.
- **Scope creep into the engine** → explicitly out of scope; any needed engine change would be an abstraction leak and a design failure. The engine's `serializeSave`/`resumeRun` already provide everything persistence needs.

## Migration Plan

Phases are file-disjoint and ordered: (1) camera viewport in `MapView` (+ `camera.ts` + tests); (2) `Dpad` labels/treatment; (3) dependency pin + async store module + `useGame` hydration/write/feedback (+ tests); (4) verification (typecheck/lint/test/export + on-device check). Rollback is per-phase via git; there is no data migration — the save format is unchanged, only where the string is stored changes (an in-memory slot for a persisted key). On completion, update `STATE.md` and append the persistence/camera decisions to `decisions.md`.
