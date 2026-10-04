# Proposal

## Why

The engine can generate a dungeon, compute field of view, and resolve commands — but it is invisible. Every stage so far proved a structural invariant behind a headless boundary; the product is still only exercisable from tests. Stage 5 is the first real UI: an Expo Router shell plus a glyph renderer and input mapping that make the headless engine **playable on a phone**, while proving the engine boundary holds in the direction that matters — a client can consume `@engine` and nothing else.

## What Changes

- **App shell moves to Expo Router.** `package.json` `main` becomes `expo-router/entry`; `expo-router`, `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, and `expo-constants` are added via `npx expo install`; `app.json` gains `scheme` and `experiments.typedRoutes`; `src/app/_layout.tsx` + `src/app/index.tsx` replace the dead `App.tsx`/`index.ts`.
- **`@engine` resolves bare, for tsc and Vitest.** `tsconfig.json` adds the exact `"@engine": ["./src/engine/index.ts"]` path entry, because the existing `"@engine/*"` glob matches only subpaths (proved: `tsc` → TS2307 on a bare `@engine` import). This is a config change, not engine code — `src/engine/**` stays byte-for-byte untouched.
- **Glyph renderer.** The map is drawn as a fixed 40×30 flex grid of memoized React Native `<Text>` tiles (1,200 cells), no Skia/canvas. Terrain, entities, and the player are drawn from `GameState`; FOV-visible, explored-but-not-visible, and unseen tiles are visually distinct. A HUD shows dungeon depth and player HP.
- **Input mapping.** An on-screen D-pad (N/S/E/W) emits `move` commands and a Descend button emits `descend`; keyboard arrow keys/Enter are a web/dev-only convenience. Input never mutates state — it only dispatches commands.
- **Client state is a React reducer.** The client holds `GameState` + `LoadedPack`; each command runs through `applyCommandWithPack(state, command, rngFromState(state.rng), pack)` and replaces state immutably. FOV is derived each render via `computeFov(grid, playerPos, DEFAULT_SIGHT_RADIUS)`; `explored` comes from state. Startup builds the first level with `generateLevel({ rng, width: 40, height: 30, depth: 1 })` and ORs the initial FOV into `explored` via `exploreInto`.
- **The engine is not changed.** `src/engine/**` is untouched; the UI imports only from `@engine` and never mutates `GameState`.

**Non-goals (later stages):** no monster AI or spawning, no combat, no inventory/use-item UI, no save/load UI, no animation, no Skia/canvas rendering, no new engine behavior, no second content pack.

## Capabilities

### New Capabilities
- `ui/app-shell`: The Expo Router shell and client game-state ownership — startup pack load with a typed-error fallback, holding `GameState` + `LoadedPack`, and the immutable command-dispatch contract through `applyCommandWithPack`.
- `ui/glyph-renderer`: Drawing the map (terrain + entities) and HUD from state, with FOV-visible / explored / unseen tiles visually distinct and glyphs sourced from the loaded pack.
- `ui/input-mapping`: Mapping on-screen controls (D-pad directions → `move`, Descend → `descend`) and web-only keyboard input to engine commands, without any direct state mutation.

### Modified Capabilities
<!-- None: the engine surface and existing specs are unchanged; the UI is a pure client. -->

## Impact

- **New code**: `src/app/_layout.tsx`, `src/app/index.tsx`, `src/ui/state/createInitialState.ts`, `src/ui/hooks/useGame.ts`, `src/ui/hooks/useKeyboardInput.ts`, `src/ui/providers/GameProvider.tsx`, `src/ui/theme/colors.ts`, `src/ui/logic/glyphs.ts`, `src/ui/components/{Tile,MapView,Hud,Dpad,ActionBar}.tsx`, `src/ui/screens/GameScreen.tsx`.
- **Changed config**: `package.json` (`main` + deps), `app.json` (`scheme`, `experiments.typedRoutes`), `tsconfig.json` (add the bare `"@engine": ["./src/engine/index.ts"]` path — config only, no engine code), `vitest.config.ts` (add `src/ui/**/*.test.ts` to `include`).
- **Deleted**: `App.tsx`, `index.ts` (dead once Expo Router owns the entry point).
- **New tests**: `createInitialState` and `glyphs` unit tests; existing engine/pack tests stay green. Verification is `npm test` / `npm run lint` / `npx tsc --noEmit` plus a pre-tag `npx expo export --platform android` bundling check; the `v*` APK CI rebuild is the on-device check. `npm run web` is **not** a required check this stage (the web target would need `react-native-web`/`react-dom` and a web bundler; it is optional/future).
- **Unchanged**: `src/engine/**` and all existing `openspec/specs/**` requirements — no engine or spec behavior changes.
