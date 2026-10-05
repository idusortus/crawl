# crawl — Project Vision

## One-line
A deterministic, theme-swappable roguelike engine: a pure-TypeScript headless core (`src/engine`) driven by command-in / event-out over JSON-serializable state, rendered by an Expo + React Native client, with all game content supplied as swappable data packs.

## Goal
Build one engine whose determinism, framework-freedom, and content-agnosticism are structural invariants — proven before any renderer or content exists — so that whole settings (fantasy, sci-fi, a comical "family dog" theme) are data packs rather than engine forks.

## Stack
- **Expo SDK** ~57.0.26 + **React Native** 0.86.3 + **React** 19.2.3 (New Architecture)
- **TypeScript** 5.9 (strict), extends `expo/tsconfig.base`
- **Node** ≥ 22.13 (Node 24.x tested)
- CDN-less, bundler-driven (Metro for the app; no browser CDN scripts)

## Frameworks / Key Libraries
- **expo / expo-router** — app shell and (later) file-based routing
- **Vitest 5** — engine unit tests under `environment: 'node'` (with `vite-tsconfig-paths` for the `@engine` alias)
- **ESLint 9** flat config (`eslint-config-expo/flat` + `typescript-eslint`) — enforces the `src/engine` purity boundary
- **zod** — runtime schemas for content packs (Stage 2, already a direct dependency)

## Quickstart
```bash
# 1. Install dependencies
npm install

# 2. Verify the toolchain (headless — no device required)
npm test          # Vitest engine tests
npm run typecheck # tsc --noEmit
npm run lint      # ESLint, incl. the src/engine purity boundary

# 3. Run the app (requires a device/simulator)
npm start         # expo start
```

## Hard Constraints
- `src/engine` is **pure TypeScript**: no `react` / `react-native` / `expo*` imports, no `Math.random`, no `Date.now` (or `Date` at all). Enforced by ESLint on `src/engine/**`.
- The one authoritative way to advance the game is `applyCommand(state, command, rng) -> { state, events }`. Input state is never mutated.
- `GameState` is **JSON-serializable** with no exceptions (no classes, `Map`, `Set`, functions, or meaningful `undefined`) so save/replay/undo reduce to serialization plus a command log.
- Randomness is only ever drawn through the injected seeded RNG whose state travels in `GameState`. Same seed + same command sequence ⇒ identical outcome.
- Content never lives in the engine. Content is data in `src/packs` (Stage 2+); M1 hardcodes fixtures only inside tests.

## Out of Scope (through Stage 6)
- Engine changes driven by the client — the renderer consumes `@engine` only; determinism, framework-freedom, and content-as-data remain structural invariants.
- A second theme pack (Stage 7) — the abstraction-leak test.
- Skia/canvas rendering, a camera/scrolling, animation, or audio — the fixed 40×30 glyph grid is the v1 renderer.
- A web target (`react-native-web`/`react-dom` + web bundler) — input/web-keyboard is a dev convenience only.
- ECS, scripting engine, event bus, or abstractions built ahead of a second use case (the Stage 7 "dogs" pack is the abstraction-leak test).

## Success Criteria
- A seeded engine test builds a fixed grid, applies a fixed command sequence, and reproduces the exact final state and event stream — including across a serialize/resume split.
- `applyCommand` is proven pure (input state unchanged) and JSON round-trip is lossless.
- The `src/engine` purity boundary fails CI on any `react`/`react-native`/`expo*` import or ambient randomness, and passes on the real tree.
- Vitest, `tsc --noEmit`, and ESLint all exit 0.

## Roadmap (staged; one OpenSpec change per stage)
1. **`bootstrap-engine-skeleton`** — pure-TS grid, entities, seeded RNG, `applyCommand → events`, event log, Vitest. *(complete)*
2. **`content-packs-v1`** — pack loader + zod schema; tiny fantasy pack; `use-item` command/event drawing from the injected RNG. *(complete)*
3. **`levelgen-and-fov`** — seeded BSP level generation + named-generator registry, recursive-shadowcasting FOV, stored explored mask, deterministic `descend`. *(complete)*
4. **APK pipeline** — build/CI change to produce an installable Android APK. *(complete — the workflow is proven live: `v0.1.0` and `v0.2.0` each built, verified, and attached a signed `crawl-<tag>.apk` to a GitHub Release)*
5. **`expo-glyph-renderer`** — Expo Router shell + glyph renderer + input mapping. *(complete)*
6. **`core-gameplay-loop`** — AI, combat, items, stairs, permadeath, save/load. *(complete — seeded monster/item population, named behavior + damage registries, bump-to-attack + permadeath, pickup/use-item, stairs-gated populated descent, and a JSON-state + command-log save/load surface resumed by replaying the remainder; the UI dispatches the new commands through a game-over surface and saves/resumes via the engine save path)*
7. `second-theme-pack` — the "dogs" pack with **no engine changes** (the abstraction-leak test). *(next)*

---

_This file is the durable vision. It changes rarely. Day-to-day status lives in `STATE.md`._
