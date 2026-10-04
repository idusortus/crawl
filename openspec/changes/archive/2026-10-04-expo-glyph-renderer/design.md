# Design

## Context

See `proposal.md` → Why. Stages 1–4 built a headless, deterministic engine behind a single public surface (`src/engine/index.ts`): `applyCommand`/`applyCommandWithPack`, `rngFromState`/`rngToState`, `createRng`, `computeFov`/`exploreInto`/`DEFAULT_SIGHT_RADIUS`, `generateLevel`, `loadPack`, `entityAt`/`entityById`, `forEachCoord`, `actorHp`, and the event constructors, plus the `GameState`/`Command`/`Entity`/`LoadedPack` types. The only app shell today is a dead placeholder: `index.ts` calls `registerRootComponent(App)` from `App.tsx`, both of which are unused by the real product. `app.json` has no `scheme` or typed routes; `package.json` `main` is `index.ts`.

The binding constraints are: (1) the engine is finished for this stage and MUST NOT change; (2) the UI must be a pure client that imports only from `@engine` and never mutates `GameState`; (3) determinism must survive into the client — the same state plus the same command must reproduce the same result, which means the client threads the RNG through `rngFromState(state.rng)` on every dispatch rather than holding an ambient generator.

## Goals / Non-Goals

**Goals:**
- An Expo Router shell that boots straight into a playable game screen.
- A glyph renderer that draws terrain, entities, and the player from `GameState`, with visible / explored / unseen clearly distinct.
- Input mapping (D-pad + Descend; web-only keyboard) that dispatches commands.
- A client state model (React reducer) that owns `GameState` + `LoadedPack` and applies the immutable command-dispatch contract.
- Keep `src/engine/**` byte-for-byte untouched and keep the engine boundary lint green.

**Non-Goals:**
- No monster AI/spawning, combat, inventory or `use-item` UI, save/load UI, animation, or audio.
- No Skia/canvas renderer, no camera/scrolling — the fixed 40×30 map fits on screen.
- No new engine exports, no new engine behavior, no pack changes, no second content pack.
- No persistence beyond in-memory React state.

## Decisions

### D1 — App shell is Expo Router; bare `@engine` resolution; delete the placeholder entry
`package.json` `main` becomes `expo-router/entry`; `expo-router`, `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, and `expo-constants` are installed with `npx expo install` (Expo resolves versions compatible with SDK 57). `app.json` gains a `scheme` and `experiments.typedRoutes`. **`typedRoutes` caveat:** it generates a gitignored `.expo/types` (and `expo-env.d.ts`) only after a dev-server/prebuild run, so `tsc --noEmit` does not require route types on a clean checkout; for this single-route app it is optional and kept only as a convenience — if it disrupts a clean `tsc`, drop the `experiments.typedRoutes` flag (the renderer does not depend on it). `tsconfig.json` also gains `"@engine": ["./src/engine/index.ts"]`: the project documents `@engine` as the single public import specifier, but the existing `"@engine/*"` glob matches only subpaths, so a bare `import { ... } from '@engine'` fails `tsc` (TS2307) until the exact path is added. The exact entry affects **both** resolvers — `tsc` via `paths` and Vitest via `vite-tsconfig-paths` — so it is added once in `tsconfig.json` and both stay green. Routes live under `src/app/`: `_layout.tsx` wraps the tree in the game provider + safe-area context; `index.tsx` renders `GameScreen`. `App.tsx` and `index.ts` are **deleted** — once `expo-router/entry` is the main entry, `registerRootComponent` is dead code. *Alternatives:* keep the manual `registerRootComponent` root (rejected: the locked decision is Expo Router, and it is the documented path for file-based routing); put routes at the repo root `app/` (rejected: the project colocates source under `src/`, and Expo Router supports a `src/app` directory); keep only `@engine/*` and import deep paths (rejected: violates the public-surface rule, which mandates the bare entry point).

### D2 — Rendering is memoized RN `<Text>` tiles in a fixed flex grid
The map is 40×30 = 1,200 cells. Each cell is a `Tile` component: a memoized `<Text>` (React `memo` with a stable key/props) rendered inside a fixed-size flex row/column layout. Glyphs are single characters, so `<Text>` is sufficient and avoids a Skia/canvas dependency entirely. Memoization keeps re-renders proportional to what changed rather than redrawing 1,200 cells on every keypress. *Alternatives:* Skia or a canvas (rejected: new heavy dependency, not needed for a 1,200-cell text grid); a virtualized list (rejected: the grid is small and fixed, and virtualization complicates the row layout).

### D3 — Input is on-screen D-pad + Descend; keyboard is web-only
`Dpad.tsx` renders four directional buttons that dispatch `{ type: 'move', direction }`; `ActionBar.tsx` renders a Descend button that dispatches `{ type: 'descend' }`. `useKeyboardInput.ts` adds arrow-key/Enter handling only on the web platform, as a dev convenience. Every input path calls the same `dispatch(command)` from the game hook — no component constructs or mutates state itself. *Alternatives:* keyboard-only (rejected: the product target is a phone, which needs on-screen controls); a swipe gesture layer (rejected: more complexity for no v1 benefit).

### D4 — Client state is a React reducer holding `GameState` + `LoadedPack`
`GameProvider.tsx` + `useGame.ts` expose `{ state, pack, dispatch }`. The reducer's initial value is built by `createInitialState.ts`, whose signature is **`createInitialState(seed, pack: LoadedPack)`** — the pack MUST load first (D7), because the player entity is seeded from it. `createInitialState` pins the player's class with a named constant `PLAYER_CLASS_ID = 'fighter'` (the fantasy pack defines classes `fighter`/`rogue` only — there is no `player` class), then:
1. `const rng = createRng(seed)` and `const generated = generateLevel({ rng, width: 40, height: 30, depth: 1 })`. The 40×30 size is deliberate: it matches the engine's `DESCEND_LEVEL_WIDTH`/`DESCEND_LEVEL_HEIGHT` so a descried level has the same dimensions as the initial one (no renderer dimension change on descend).
2. Builds the player entity as `{ id: PLAYER_ID, kind: PLAYER_CLASS_ID, pos: generated.level.spawn, hp: pack.class(PLAYER_CLASS_ID).hp }` — the HP MUST come from the pack so the player is a real actor with non-zero `actorHp` (no HP-changing command exists this stage, so the HUD is static; see the spec).
3. Assembles `GameState` with `explored` = `exploreInto(allFalse, computeFov(grid, spawn, DEFAULT_SIGHT_RADIUS))`, and `rng: rngToState(seed, rng)` written back **after** `generateLevel` has consumed the generation stream, so the returned state resumes the RNG *after* those draws rather than replaying them.
On dispatch the reducer calls `applyCommandWithPack(state, command, rngFromState(state.rng), pack)` and returns `result.state` — a **new** object; the input is never mutated (the engine already guarantees this, and the reducer simply replaces the reference). *Alternatives:* `useState` with an ad-hoc updater (rejected: a reducer centralizes the dispatch contract in one testable place); holding the RNG instance in a ref (rejected: it would make determinism depend on render history; deriving it from state keeps state the single source of truth); hard-coding a `'player'` kind (rejected: the pack has no such class, so every `pack.class('player')` lookup would throw `UnknownContentIdError`).

### D5 — FOV is derived per render; `explored` comes from state
Visibility is never stored: the renderer computes `computeFov(state.grid, playerPos, DEFAULT_SIGHT_RADIUS)` each render and reads `state.explored` for the persistent mask. The player position comes from `entityById(state.entities, state.playerId)`. This mirrors the engine's design (D4 in `levelgen-and-fov`): the stored record is the monotonic explored mask, and visibility is a pure function of grid + origin + radius. Deriving in the renderer is cheap at this map size and cannot drift from state. *Alternatives:* cache visible tiles in the reducer (rejected: duplicates a pure computation and risks staleness).

### D6 — Glyph resolution is a pure lookup, pack-sourced, with fallbacks
`src/ui/logic/glyphs.ts` is a pure module: given a tile's terrain/visibility and any entity at that position, it returns the glyph and a style category. Entity glyphs come from `pack.class`/`pack.monster`/`pack.item` (the `glyph` field in `src/packs/fantasy/pack.json`); the player's glyph comes from its class (`PLAYER_CLASS_ID`). **Every pack lookup is fallible and MUST be treated as such:** `LoadedPack.class`/`monster`/`item` throw `UnknownContentIdError` on a miss (they never return `undefined`), so `entityGlyph` MUST wrap each lookup in a try/catch or an existence check and return a safe fallback glyph (e.g. `?`) instead of propagating the throw. This makes an entity kind present in state but absent from the pack — or a player class the pack does not define — a rendered glyph, never a crash. `src/ui/theme/colors.ts` defines the three visibility treatments. Keeping this pure makes it unit-testable without React. *Alternatives:* resolve glyphs inline in `Tile` (rejected: harder to test, scatters the pack lookup); assume lookups succeed (rejected: the loader is explicitly throw-on-miss, so the renderer would crash on any unknown kind).

### D7 — Startup pack load surfaces typed errors, never crashes
The provider calls `loadPack(fantasyPack)` **before** `createInitialState(seed, pack)` is built (D4 needs the pack to seed the player's class/HP). `loadPack` throws `PackLoadError` on invalid/incomplete packs and `UnknownContentIdError` on lookup misses; the client catches these and renders a recoverable error surface (the error's message) instead of white-screening — the initial state is not constructed until a pack is available. The pack JSON is imported as data (the fantasy pack), consistent with content-as-data. *Alternatives:* let the throw propagate (rejected: a bad pack should be a visible, recoverable error, not a crash).

### D8 — Test and lint alignment
`vitest.config.ts` `include` is widened to add `src/ui/**/*.test.ts` so the pure UI logic (`createInitialState`, `glyphs`) is unit-tested under the existing node environment. **Scope note:** the node-env include covers only pure `.ts` UI tests that import no React Native — any test that imports RN components (e.g. `Tile`) is out of scope for this include and is not added this stage. No React renderer is added to the test stack; the pure modules carry the assertions, and the device/APK check covers the rendered shell. **Routing note:** `tsconfig.json` adds the bare `"@engine"` path (D1); because Vitest resolves through `vite-tsconfig-paths`, this single entry fixes both `tsc` and Vitest — no separate Vitest alias is needed.

The engine boundary lint is unchanged; **no new ESLint override is needed.** `src/ui/**` inherits `eslint-config-expo/flat` and may import RN/Expo freely, while the existing `src/engine/**` block stays untouched and green (no engine file is edited).

**Spec-coverage map** (which scenarios are verified how this stage):
- *Unit-tested (node env, pure .ts):* `createInitialState` well-formedness, player class/HP (`actorHp(player) === pack.class('fighter').hp`), RNG capture point, same-seed determinism, and the immutable-dispatch contract (`ui/app-shell`); channel/terrain glyphs, pack-sourced monster/item glyph, unknown-kind fallback, unseen-tile blankness (`ui/glyph-renderer`).
- *Manual / APK-verified (rendered shell):* cold start reaching the game screen, full-grid rendering, FOV visible/explored/unseen visual distinctness, HUD display, D-pad/Descend/interaction wiring, and on-device behavior (input-mapping scenarios that depend on the rendered controls).
*Alternatives:* add a React Native testing library now (rejected: extra dependency; the pure logic plus the on-device build give sufficient coverage for this stage).

## Risks / Trade-offs

- **Expo Router config mismatch (wrong deps/versions, missing `scheme`)** → Mitigation: install with `npx expo install` (SDK-pinned versions), add `scheme` + `experiments.typedRoutes` together, and verify with `npx tsc --noEmit` and the `v*` APK CI rebuild.
- **Bare `@engine` failing to resolve (TS2307 / Vitest)** → Mitigation: add `"@engine": ["./src/engine/index.ts"]` to `tsconfig.json` `paths` (D1); both `tsc` and `vite-tsconfig-paths` honor it.
- **Unknown entity kind crashing the renderer** → Mitigation: every `pack.class`/`monster`/`item` lookup is wrapped and falls back to a safe glyph (D6); the player's class is pinned to an existing pack id (`PLAYER_CLASS_ID = 'fighter'`, D4).
- **RNG replayed on the initial level** → Mitigation: `rngToState(seed, rng)` is written back *after* `generateLevel` consumes the stream (D4), and a test asserts state-derived RNG differs from a fresh `createRng(seed)`.
- **1,200 tiles re-rendering per input** → Mitigation: memoized `Tile` with stable keys/props so only changed cells re-render; map size is fixed and small.
- **Determinism leaking out of the engine** → Mitigation: the client never holds an ambient RNG; it derives one from `state.rng` on every dispatch, and never calls `Math.random`/`Date`.
- **Pack load failure white-screening the app** → Mitigation: D7 catches typed load errors and shows a recoverable error surface.
- **Deep engine imports creeping in** → Mitigation: all UI imports go through `@engine` (enabled by the D1 `tsconfig.json` path); the existing `no-restricted-imports` rule and review enforce the boundary, and no engine file is edited.
- **Deleting `App.tsx`/`index.ts` breaking the old entry** → Mitigation: `main` switches to `expo-router/entry` in the same change, so nothing references the deleted files.
- **Assuming `npm run web` works without web deps** → Mitigation: **web is dropped as a required check this stage** (it needs `react-native-web`/`react-dom` + a web bundler); verification is `tsc`, unit tests, and the pre-tag `npx expo export --platform android` bundle plus the `v*` APK run. Web is optional/future.

## Migration Plan

Additive except for the deliberate entry-point swap. Order: (1) router shell + deps + `app.json`/`package.json`/`tsconfig.json` + delete `App.tsx`/`index.ts`; (2) client state model (`createInitialState` + test, `useGame`, `GameProvider`); (3) glyph renderer (`colors`, `glyphs` + test, `Tile`/`MapView`/`Hud`, `GameScreen`); (4) input (`Dpad`/`ActionBar`, `useKeyboardInput`, wire into `GameScreen`); (5) test/lint alignment (`vitest.config.ts`, verify `npm test`/`lint`/`tsc`, run the pre-tag `npx expo export --platform android` check, then rely on the `v*` APK rebuild). Rollback is a revert of the change; the engine is unaffected either way. No data migration — game state is in-memory only.

## Open Questions

None that block this stage. Whether to add a React render-test stack, a scrolling camera, or a `use-item` UI is deferrable to a later stage and changes neither the specs nor this approach.
