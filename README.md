# crawl

A framework-free, deterministic TypeScript roguelike **engine** (`src/engine`) with an Expo + React Native client. Stage 5 makes it **playable**: the app boots into a 40×30 glyph screen with FOV/explored rendering, a depth+HP HUD, and D-pad / Descend input (plus a web-only keyboard). The engine is consumed only through `@engine` and is untouched by the UI.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Verify the toolchain (no device required)
npm test          # Vitest engine + pack + pure-UI tests (241)
npm run typecheck # tsc --noEmit
npm run lint      # ESLint, incl. the src/engine purity boundary

# 3. Run the app (requires a device/simulator — not available in CI)
npm start         # expo start  (Expo Router file-based routes under src/app/)
```

Node ≥ 22.13 is required (Node 24.x tested).

## Usage

The app boots into a playable screen (`npm start` / a device or simulator): a 40×30 glyph map with a HUD showing depth and player HP, where currently-visible, remembered-but-unseen (dimmed), and never-seen (blank) tiles are visually distinct. Input is an on-screen D-pad (N/S/E/W → `move`) plus a Descend button (`descend`); arrow keys / Enter / `>` are a web-only dev convenience. Every input path dispatches a command through the client reducer and never mutates state. Consume the engine **only** through the public surface at `@engine` (i.e. `src/engine/index.ts`); nothing outside `src/engine` should import deeper modules.

```ts
import { applyCommand, createGrid, createRng, rngFromState } from '@engine';
import type { Command, GameState } from '@engine';

const state: GameState = {
  grid: createGrid([[true, true], [true, false]]),
  entities: [{ id: 'player', kind: 'player', pos: { x: 0, y: 0 } }],
  playerId: 'player',
  rng: { seed: 7, state: createRng(7).state() },
  events: [],
};

const command: Command = { type: 'move', direction: 'east' };
const { state: next, events } = applyCommand(state, command, rngFromState(state.rng));
// next is a NEW state; `state` is untouched. `events` is always ≥ 1 event.
```

The loop is **command-in / event-out** (`applyCommand(state, command, rng) -> { state, events }`):
- the input state is never mutated; a fresh state object is returned,
- every command emits at least one event (`moved` / `blocked` / `noop`),
- the emitted events are appended to `state.events` in order (append-only),
- unknown command types are reported as invalid via a `noop` event — never thrown.

The engine is **pure**: it must never import `react`/`react-native`/`expo`, and must never use `Math.random`/`Date.now`/`Date`. Determinism comes from an injected seeded RNG whose state travels inside `GameState` (`{ seed, state }`). ESLint fails CI on any violation under `src/engine/**`. The app entry is now **Expo Router** (`main: expo-router/entry`), with file-based routes under `src/app/`; the placeholder `App.tsx`/`index.ts` root entry has been removed. Consume the engine from UI code with a **bare** `import { … } from '@engine'` — `tsconfig.json` maps the exact path.

> Scope: Stages 1–5 ship the Expo/TS scaffold + tooling; the engine core (seeded RNG, 2D grid + occupancy, JSON-clean types, command loop with `move`/`use-item`/`descend`); a versioned content-pack schema/loader with the first real pack; level generation + FOV; and an Expo Router glyph renderer with D-pad/Descend input (memoized `<Text>` tiles, HUD, recoverable pack-load error surface). The APK pipeline builds an installable Android APK in CI. AI, combat, a content-driven `use-item` UI, save/load, and a second theme pack are later stages.

## Building an Android APK / Releases

An installable Android APK is built in CI by [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) — no Expo/EAS account, secrets, or Android SDK on your machine are required (the GitHub-hosted runner supplies them).

**Cut a release** (recommended path):

```bash
git tag v0.2.0
git push origin v0.2.0
```

Pushing a `v*` tag triggers the workflow, which prebuilds the native project (`npx expo prebuild --platform android --no-install`), runs `./gradlew assembleRelease`, verifies the APK, and publishes it to the matching **GitHub Release**. The asset is named:

```
crawl-<tag>.apk        # e.g. crawl-v0.2.0.apk
```

Download it from the repository's **Releases** page and sideload it (`adb install crawl-v0.2.0.apk`). The APK is built for the application id `com.idusortus.crawl`.

**Manual run (no tag):** open **Actions → Android APK → Run workflow**. A manual run always uploads the APK as a downloadable workflow artifact (`crawl-android-apk`, asset `crawl-<sha>.apk`). Pass the optional `version` input (e.g. `v0.2.0`) to additionally attach it to that Release; with no version it only produces the workflow artifact.

### Signing (testing artifact)

Release APKs are signed with the auto-generated **debug keystore** — zero secrets, fine for sideloading and testing, but **not** upgrade-stable against a differently signed build and not valid for the Play Store. This is a deliberate trade-off for an install-and-test artifact.

> **Future: production signing.** To ship properly signed builds, generate a release keystore, add `SIGNING_KEYSTORE_BASE64` / `SIGNING_KEYSTORE_PASSWORD` / `SIGNING_KEY_ALIAS` / `SIGNING_KEY_PASSWORD` repository secrets, decode the keystore in the workflow, and add a `signingConfigs.release` block (using those secrets) to the generated `android/app/build.gradle`. That is a follow-up, not part of this pipeline.

## Layout

```
crawl/
  app.json                         # Expo config (scheme: crawl, typedRoutes, expo-router plugin)
  assets/                          # Expo icons/splash
  src/
    app/    # Expo Router routes: _layout.tsx (shell) + index.tsx (game screen)
    engine/ # PURE TypeScript engine — no framework imports
      types.ts     # GameState, Command, GameEvent, Entity, Position, Grid
      rng.ts       # seeded Mulberry32 + JSON-clean RngState helpers
      grid.ts      # grid + passability + occupancy helpers
      events.ts    # event constructors + append-only log helper
      commands.ts  # applyCommand: move -> moved/blocked/noop
      fov.ts       # computeFov (recursive shadowcasting) + exploreInto union
      pack.ts      # loadPack: validate + composition floor + id lookup
      schema/      # zod pack schema (Pack/PackClass/PackMonster/PackItem/ItemEffect)
      index.ts     # public surface (@engine) — import here, not deeper
      __tests__/
    packs/  # content packs (data only)
      fantasy/   # pack.json + thin TS entry + tests (2 classes, 3 monsters, 5 items)
    ui/     # React Native client (Stage 5): components/, hooks/, logic/, providers/, screens/, state/, theme/
  openspec/  # change proposals & specs
```

## Tech stack

- **Expo SDK** ~57.0.26 (New Architecture)
- **Expo Router** ~57.0.24 (`main: expo-router/entry`, routes under `src/app/`)
- **React Native** 0.86.3 · **React** 19.2.3
- **TypeScript** 5.9 (strict), extends `expo/tsconfig.base`
- **Vitest** 5 (`environment: 'node'`) + `vite-tsconfig-paths`
- **ESLint** 9 flat config (`eslint-config-expo/flat` + `typescript-eslint`)
- **Node** ≥ 22.13
