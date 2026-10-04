# Architectural Decisions

> One entry per locked-in choice. Reverse chronological. Concise — not an ADR template.

## Format

    ## YYYY-MM-DD — <decision title>
    **Context:** Why we needed to decide.
    **Choice:** What we chose.
    **Trade-offs:** What we gave up.
    **Revisit:** Trigger that would re-open this decision (or "never").

---

## 2026-10-04 — APK pipeline: local Gradle on the runner, debug-keystore signing, tag + dispatch triggers

**Context:** After Stage 3 the user queued a build/CI change to produce an installable Android APK before further engine work. Three choices were locked with the user before writing the change: how to build (EAS cloud vs. local Gradle), how to sign, and how to trigger. The change is tooling/CI only, so it carries `skip_specs: true` (no behavior change, no spec deltas).

**Choice:**
- **Build on the GitHub runner via CNG + local Gradle.** `npx expo prebuild --platform android --no-install` generates `android/` (gitignored), then `./gradlew assembleRelease` builds `app-release.apk`. No Expo account, EAS token, or cloud minutes. Chosen over EAS Build (needs an external account/token) and over committing `android/` (defeats CNG).
- **Debug-keystore signing (zero secrets).** The generated Gradle release buildType uses `signingConfigs.debug`; the artifact is sideload/test-only — explicitly not Play-Store-valid and not upgrade-stable against a future real keystore. Production signing is a documented follow-up (`SIGNING_*` secrets + a `signingConfigs.release` block).
- **Triggers: `push: tags: ['v*']` and `workflow_dispatch`.** A tag builds and attaches `crawl-<tag>.apk` to a GitHub Release via the built-in `GITHUB_TOKEN` (`permissions: contents: write`, idempotent); manual dispatch always uploads a workflow artifact.
- **Toolchain pins:** JDK 17 (temurin), Node 22.x, no `expo-build-properties`; effective RN 0.86.3 / Expo SDK 57 defaults are **compileSdk 36 / targetSdk 36 / buildTools 36.0.0** (NOT the design's initially-assumed 37/37.0.0), and `ubuntu-latest` ships platform `android-36`.
- **Review-driven hardening:** `gh release create` omits `--target` (a workflow-modifying tagged commit makes the Releases API return 404 for `GITHUB_TOKEN`); `gh release edit --draft=false` after upload (guards a stranded draft); an empty-SDK guard before apksigner discovery; the `version` input validated `^[A-Za-z0-9._-]+$`.

**Trade-offs:** The APK is debug-signed (test-only, not upgrade-stable). The first live run may auto-download NDK `27.1.12297006` (~1 GB) because the runner ships 27.3+ — accepted as the authoritative first-run check. CI consumes runner minutes per tag. The app still boots the placeholder screen until Stage 5 makes it worth installing.

**Revisit:** When a production / Play-Store path is wanted, add a real keystore + a `signingConfigs.release` block. If the first run fails on the NDK, add `expo-build-properties` pinning an installed NDK (one line). If EAS becomes desirable, replace only the build steps and keep the trigger/release shape. Otherwise never — the delivery path is the operating model.

---

## 2026-10-04 — Public generator API needs an explicit size floor (or clamping) and a small-size boundary test

**Context:** Review of `levelgen-and-fov` found `generateBspLevel`/`generateLevel` claim "the outer ring of the grid is never carved" but leak onto the outer boundary for small requested sizes. `generateBspLevel` calls `buildTree` whenever `interior.{width,height} >= MIN_ROOM (3)`, but `placeRoom` assumes the region is at least `MIN_LEAF (5)`; on a 3-wide region `maxWidth = min(9, region-2) = 1`, and `randInt(rng, 3, 1)` silently returns `3` (its documented `max < min` collapse), so the room overshoots the region into the boundary ring. Concretely `generateLevel({width:5, height:5, ...})` yields floor tiles at `x = width-1` and `y = height-1`, violating the level-generation spec requirement "The outer boundary is non-passable". The existing boundary test only exercises 40×30; the degenerate-size tests only exercise 1×1 and 3×3 (which route to the single-tile branch), so `5x5`, `5x6`, `6x5`, `7x5`, … were entirely uncovered. `descend` hardcodes 40×30, so the shipped game path is unaffected — but `generateLevel` is public API and the spec names no size floor.

**Choice:** Make the size contract explicit and enforced in one of two ways, and add coverage: (a) raise the `buildTree` gate from `MIN_ROOM` to `MIN_LEAF` so any region fed to `placeRoom` is guaranteed `region - 2 >= MIN_ROOM` (then `randInt`'s range is always valid); or (b) keep the gate and clamp `width = min(maxWidth, max(MIN_ROOM, maxWidth))` / guard `placeRoom` against `region - 2 < MIN_ROOM`, falling back to the centered single-tile carve. Whichever is chosen, `level.test.ts` must assert a solid boundary across a **size sweep** (e.g. every `w,h` in `[3..12]`) over several seeds, not just 40×30.

**Trade-offs:** Option (a) means 5×5..7×7 interiors produce a single centered tile instead of a (too-big) room — a smaller-but-valid level, consistent with the 3×3 behavior. Option (b) keeps a room where one fits but adds a clamp branch. Both are cheap; the real cost of *not* deciding is a silent public-API contract that breaks at small sizes while the suite stays green.

**Revisit:** If a minimum playable level size becomes a product requirement, replace the floor with an explicit `MIN_LEVEL_SIZE` validated at the boundary (throw `UnknownGeneratorIdError`-style typed error rather than silently producing a degenerate level). Otherwise never — pin the floor and test the boundary.

## 2026-10-04 — Stage 3 (`levelgen-and-fov`) outcome: BSP+registry, derived FOV / stored explored, level state shape, descend generalization

**Context:** Stage 3 turned the flat engine world into a real dungeon and needed four choices locked that are costly to reverse now that later stages build on them: (a) how levels are produced and selected, (b) what vision is stored vs. recomputed, (c) the exact additive shape of the level/explored state, and (d) how `descend` swaps the world and what size it generates. All are implemented and verified in Phases 1–4; recording the consolidated outcome.

**Choice:**
- **(a) BSP generator + named-id registry seam.** `src/engine/level.ts` exposes `generateBspLevel(rng, {width,height,depth})` (recursive binary space partition: split interior into room-sized leaves, place a room per leaf, join sibling subtrees with an L-shaped floor corridor over the *same* passable array) and `generateLevel({id?, rng, width, height, depth})` picking from a **module-private** `generators: Record<string, LevelGenerator>` (design D3). `LevelGenerator = (rng, options) => GeneratedLevel` where `GeneratedLevel = { level: Level; grid: Grid }` — metadata and terrain returned as siblings because `GameState` stores them separately. Unknown ids throw typed `UnknownGeneratorIdError` (with `.id`/`.knownIds`) — a loud caller error, matching the pack-loader precedent, never a silent fallback. Only `generateLevel`/`generateBspLevel`/`DEFAULT_GENERATOR_ID`/`generatorIds`/the error + types are exported; the registry object never leaves the module.
- **(b) Visibility derived; explored stored.** `computeFov(grid, origin, radius)` recomputes visibility every time (recursive shadowcasting, 8 octants, Chebyshev bound, origin always visible, OOB safe) and is **never** in `GameState`. The stored per-level record is the monotonic `explored: boolean[]`, grown via the pure `exploreInto(explored, visible)` element-wise OR helper. Design D4/D5.
- **(c) Level/explored live additively on `GameState`.** `GameState` gains `level: { depth: number; spawn: Position }` and `explored: boolean[]` (flat row-major, `y*width+x`, same indexing as `grid.passable`). `state.grid` stays top-level and unchanged (terrain is not nested in `Level`). Both fields are **required** (not optional) so a level can never be silently absent; both are plain data and JSON-lossless. Flat-index helpers `indexOf`/`coordOf`/`forEachCoord` live in `grid.ts`.
- **(d) `descend` generates a fixed 40×30 level; `commit` generalized to a `StateOverrides` object.** `descend` carries no dimensions, so it uses module constants `DESCEND_LEVEL_WIDTH = 40` / `DESCEND_LEVEL_HEIGHT = 30` — comfortably above the BSP split floor on both axes, small enough for v1 FOV/serialization — rather than inheriting whatever fixture size the caller started from (tests start at 3×3, which the partitioner cannot subdivide). `commit(state, rng, events, overrides: StateOverrides = {})` was generalized from `entities?: Entity[]` to `{ entities?, grid?, level?, explored? }` so `descend` swaps grid+level+explored+entities through the one centralized RNG-writeback/log-append path (design D6); omitted fields leave the input value. `descend` is dispatched as an explicit `case` in **both** `applyCommand` and `applyCommandWithPack` (never left to the `default` noop).

**Trade-offs:** The private registry duplicates nothing but means a second generator is one registry entry with no state/command change (the intended seam). FOV recomputed each move is O(radius²)/octant — acceptable at v1 sizes; `radius` is a parameter so caching can be added behind the same signature later. Required `level`/`explored` broke every existing `GameState` literal (~a dozen across 6 test files), fixed by editing fixtures rather than making fields optional (which would reopen the "is there a level?" hole). Fixed descend dimensions mean the starting level may differ from deeper levels; everything below depth 1 is uniform. The `commit` signature change is breaking at the call-site level only (tsc catches positional array calls).

**Revisit:** If profiling shows per-move FOV is hot, add a derived cache keyed by `(grid, origin, radius)` behind the same signature. If a second generator (e.g. cellular-automata caves) lands, it should need only a registry entry — if it needs a command/state change, that is a seam defect. If descend must vary size by depth, replace the constants with a depth→size policy without touching the command shape. Otherwise never — the shape and seam are the operating model and are pinned in design D1–D6.

---

## 2026-10-04 — FOV: recursive shadowcasting, Chebyshev bound, visibility derived

**Context:** Stage 3 (`levelgen-and-fov`) task 2.1 needed the vision algorithm locked: the spec requires non-passable tiles to block sight while themselves being visible, a Chebyshev-distance radius bound, an out-of-bounds origin to be safe, and purity/determinism. Design D4 already chose recursive shadowcasting over the 8 octants and "visibility derived, explored stored".

**Choice:**
- `computeFov(grid, origin, radius) -> boolean[]` in `src/engine/fov.ts` returns a fresh flat row-major `boolean[]` of length `width*height` (same `y*width+x` indexing as `grid.passable`/`explored`). It marks the origin visible **before** the radius check (so a non-passable origin is seen and `radius 0` yields the origin only); an out-of-bounds origin returns an all-false array of correct length without throwing. It never mutates the grid and is deterministic.
- The 8-octant transform is the standard Björn Bergström table `[[1,0,0,1],[0,1,1,0],[0,-1,1,0],[-1,0,0,1],[-1,0,0,-1],[0,-1,-1,0],[0,1,-1,0],[1,0,0,-1]]`, applied as `x = xx*col + xy*row`, `y = yx*col + yy*row` with `col` from `-row..0` and `row = -distance`. Intervals start at `(startSlope, endSlope) = (1.0, 0.0)`. The radius is enforced by the depth loop **and** an explicit `Math.max(|dx|,|dy|) <= radius` before marking.
- `DEFAULT_SIGHT_RADIUS = 8` is exported and used only as the documented default; the function still takes an explicit `radius` (design D4's "sight radius as a parameter so it can later come from the actor/pack without a signature break").
- `exploreInto(explored, visible) -> boolean[]` is the pure append-only union helper: element-wise OR into a **new** array sized by `explored`. It only grows and never mutates either input (design D5). Phase 4 will OR the post-move FOV into `state.explored` through it.

**Trade-offs:** Shadowcasting is fiddly — the initial `endSlope` must be `0` (not `1`) or cardinal directions stop at distance 1, and a mis-transcribed octant table yields a rotated pattern; both are now recorded in `histories/coder.md`. The algorithm is O(radius²) per octant per call, recomputed every move (design D4 accepts this at v1 map sizes; `radius` is a parameter so caching can be added later without a signature change). `exploreInto` does not validate equal lengths — it iterates `explored.length` and treats a missing `visible[index]` as `false`, which is the intended semantics (a shorter visibility array can only fail to add tiles).

**Revisit:** If profiling shows FOV recomputation on large maps is a cost, add a derived cache keyed by `(grid, origin, radius)` behind the same signature. If a second FOV algorithm (e.g. permissiveness variants) is needed, keep the signature and swap internals. Otherwise never — the spec pins the behavior, not the algorithm.


---

## 2026-10-04 — Level & explored live additively on `GameState`; flat-index helpers in `grid.ts`

**Context:** Stage 3 (`levelgen-and-fov`) needs the world to become a *level* (depth + spawn + a persistent explored mask) without breaking any Stage-1/2 consumer or the JSON-clean/purity invariants. The pinned shape was in the change design (D1); implementation raised one sub-choice: where the shared flat-index math lives and whether to add helpers at all.

**Choice:**
- `GameState` gains `level: { depth: number; spawn: Position }` and `explored: boolean[]` (flat, row-major, index `y * width + x` — the same indexing as `grid.passable`). `state.grid` is unchanged; the terrain stays top-level rather than nested inside `Level`. All three are plain data (no `Map`/`Set`/class), so state round-trips through JSON losslessly.
- New pure helpers in `grid.ts`: `indexOf(grid, pos)` → `y * width + x`, `coordOf(grid, index)` → `Position` (inverse), and `forEachCoord(grid, visit)` for row-major tile iteration. They are index arithmetic only: `indexOf` does **not** bounds-check (callers use `inBounds`/`isPassable` for safe access), and `forEachCoord` calls back with `(pos, index)` so FOV/levelgen can share one traversal ordering. `Level` and the helpers are exported through the `@engine` barrel.
- Every `GameState` fixture now sets `level: { depth: 1, spawn: <player start> }` and `explored: new Array<boolean>(width*height).fill(false)` (all-false, exact length) rather than making the fields optional — the type stays required so a real level can never be silently absent.

**Trade-offs:** A required `level`/`explored` broke ~a dozen state literals across 6 test files, which was fixed by editing them (the alternative — optional fields/defaults — was rejected as it reopens the "is there a level?" hole). `indexOf` being unchecked means a misuse on an out-of-bounds `pos` silently computes a bogus index; that is intentional (levelgen/FOV already gate on `inBounds`) and documented at the declaration. `forEachCoord` allocates a `Position` per tile — fine at v1 map sizes, revisit only if profiling says otherwise.

**Revisit:** If a second generator or a larger map makes allocation/iteration a measured cost, or if more than three per-tile flat arrays appear (then consider a single cursor/iterator abstraction). Otherwise never — the shape is pinned in design D1.

---

## 2026-10-04 — Recognized commands must guard their parameters, not just `type`

**Context:** Stage-2 review of `content-packs-v1` found the command boundary guard (added in M1 to stop `null`/non-object commands crashing the loop) only checks that `command.type` is a string. Once a variant is *recognized*, its parameters are read unguarded: `applyCommand(state, { type: 'move' } as Command, rng)` throws `TypeError: Cannot read properties of undefined (reading 'x')` inside `applyMove` (`step(direction)` returns `undefined`, then `.x` is read); `{ type: 'move', direction: 'sideways' }` can only be reached as a widened/noop path by the switch, not the parameter read. Commands arrive from serialized/hand-edited logs, which is exactly why the boundary guard exists. This is the same finding class as the M1 `default`-branch bug, one level deeper: now a recognized variant's *payload* is untrusted.

**Choice:** At the command boundary, validate the parameters of every recognized variant before dispatching, not only the discriminator. Either (a) route the whole `Command` through a zod schema at the deserialization seam (the Revisit trigger from "Engine boundary conventions for malformed serialized input"), or (b) add per-branch guards (e.g. `direction` must be one of the four literals; `itemId` must be a string) that degrade to `noop('malformed-command')`. Until then, both `applyCommand` and `applyCommandWithPack` are unsound for attacker/corruption-shaped but well-typed input.

**Trade-offs:** A full zod parse at the boundary costs a small per-command allocation and duplicates the TS union; per-branch guards are cheaper but easy to forget as the union grows. The zod route has the merit of one source of truth (matches design D2 for packs).

**Revisit:** Stage 3 (`levelgen-and-fov`) adds commands; whichever option is chosen should land *before* the next new command variant is added, or the gap compounds. Trigger: any new command whose parameters are read before a size/type check.

---

## 2026-10-04 — Milestone 1 architecture recommendations

**Context:** Need to bootstrap a pure-TypeScript headless roguelike engine inside an Expo Router TypeScript client for Milestone 1.

**Choice:** Single Expo app project (not a monorepo) with top-level `src/engine`, `src/packs`, `src/ui`, and `src/app`; enforce the pure-engine boundary via ESLint `no-restricted-imports`; use Vitest with `environment: 'node'` for engine tests; hand-rolled Mulberry32 RNG for serializable save/replay state; Zod v4 for future content-pack schemas; target Expo SDK 57 / React Native 0.86 / React 19.2.3.

**Trade-offs:** A single app couples engine release cadence to Expo dependencies. A hand-rolled RNG means we own correctness. Using Vitest only for M1 means later UI tests need either `jest-expo` or `vitest-native`.

**Revisit:** If the engine needs to ship independently as a package or be consumed by non-Expo clients, move to an npm workspace / monorepo.

## 2026-10-04 — First OpenSpec change scope: Milestone 1 only

**Context:** The full plan spans ~7 stages (engine skeleton → packs → levelgen/FOV → Expo renderer → gameplay loop → second theme pack). One OpenSpec change cannot reviewably cover all of it.

**Choice:** The first change `bootstrap-engine-skeleton` covers **Milestone 1 only** (headless pure-TS engine skeleton). The full staged roadmap lives inside the proposal; each later stage becomes its own change, applied and reviewed one at a time. Stage 6 ("build the dogs pack with no engine changes") is retained as the deliberate abstraction-leak test before adding features.

**Trade-offs:** More OpenSpec change overhead per stage; the roadmap lives in a proposal doc rather than a single tracked epic.

**Revisit:** Never — staging is the operating model; adjust only the stage contents.

## 2026-10-04 — Stack override: Expo + React Native + TypeScript

**Context:** The cli-five scaffold generated `PROJECT.md`/`AGENTS.md` declaring `HTML + CSS + JS (CDN, no bundler)`, which conflicts with the user's stated Expo target.

**Choice:** Treat the boilerplate as wrong; the real stack is Expo (`~57`) + React Native (`0.86`) + React (`19.2`) + TypeScript, with Vitest for engine tests and zod (Stage 2) for packs.

**Trade-offs:** The generated docs are now partly hand-maintained; scaffold conventions no longer match a plain web SPA.

**Revisit:** If the target client moves away from Expo (e.g. web-only), which reopens the client stage only.

## 2026-10-04 — Scaffold choices for Milestone 1 (Phase 1)

**Context:** Bootstrapping the Expo app + engine tooling into a non-empty repo (OpenSpec docs already present) had to pick concrete package versions and a few config shapes.

**Choice:**
- Scaffolded manually from `expo-template-blank-typescript@57.0.28` (assets + `app.json` + `index.ts` + `App.tsx`) because `create-expo-app` dislikes a non-empty directory; pinned `expo ~57.0.26`, `react-native 0.86.3`, `react 19.2.3` (matches design.md).
- Used **TypeScript `^5.9.3`** instead of the template's `~6.0.3`, because `typescript-eslint@8.71.0` peer-supports only `typescript >=4.8.4 <6.1.0`.
- `test` script is `vitest run --passWithNoTests` so the no-tests state exits 0.
- Kept `vite-tsconfig-paths` (Vitest 5 also has a native `resolve.tsconfigPaths`, but the plugin is what design.md specifies) and `globals: false`.
- `eslint.config.js` composes `eslint-config-expo/flat` with a `src/engine/**/*.ts` override implementing the D2/D6 boundary.

**Trade-offs:** Manual scaffold means Expo config is hand-maintained vs. a future `create-expo-app` baseline; TS 5.9 will need bumping when typescript-eslint supports TS 6.

**Revisit:** When typescript-eslint ships TS 6 support, or when an Expo upgrade changes the template's pinned TS/RN versions.

## 2026-10-04 — Phase 2 engine core shapes (RNG / grid / types)

**Context:** Implementing `bootstrap-engine-skeleton` tasks 2.1–3.3 required concrete decisions on the RNG serialization surface, the grid representation, and how helpers relate to state.

**Choice:**
- **RNG state is two fields** `{ seed: number; state: number }` (`RngState`), not a single opaque blob. `seed` is provenance/replay metadata; `state` is what resume uses. `createRng(seed)` matches design D2 exactly; `rngFromState`/`rngToState` convert to/from the live `Rng`. Bounded draws are a free function `randInt(rng, min, max)` (inclusive), not a method on `Rng`, so the interface stays the three-method swap surface from D2.
- **Grid passability is a flat row-major `boolean[]`** indexed `y * width + x`, rather than nested arrays or `Map`/`Set`. Nested arrays would be JSON-clean too, but a flat array has no per-row object overhead and a single canonical index formula. `createGrid(rows: boolean[][])` is the ergonomic test/authoring constructor; it throws on ragged rows.
- **Out-of-bounds is `false`, checked before indexing** via a shared `inBounds` helper, satisfying "never reads undefined tile data".
- **`entityAt`/`entityById` are free functions over `entities: Entity[]`**, not a Map-on-state, preserving D5 (helpers live in modules, state stays plain).
- **`Entity` is an interface with an index signature** (`[key: string]: unknown`) so extra plain props (e.g. `hp`) type-check while staying open-ended for M1.

**Trade-offs:** The index signature weakens excess-property checking on entities (any key is allowed); `randInt` collapsing to `min` when `max < min` instead of throwing hides caller bugs; flat-grid indexing is duplicated knowledge if a second grid type appears.

**Revisit:** If entities need strict per-kind schemas, prefer a discriminated union over the index signature (Stage 2 zod packs). If a Map-based spatial index is needed for performance, add it as a derived cache, never on `GameState`.

## 2026-10-04 — Phase 3 command loop & event log (tasks 4.1–4.4)

**Context:** Implementing `applyCommand` required concrete decisions on the event shapes, the append-only log, occupancy semantics, and how the RNG state is threaded through a command.

**Choice:**
- **Events are free-function factories** in `events.ts` (`moved`/`blocked`/`noop`) returning plain discriminated objects, plus one `appendEvents(log, incoming)` helper. `appendEvents` returns `[...log, ...incoming]` — a new array, never mutating/reordering — so "append-only" is structural, not a convention.
- **`applyCommand(state, command, rng) -> { state, events }` is a pure function.** The M1 `Command` union has a single variant (`move`); the `default` branch widens structurally to catch unrecognized serialized types and emits `noop('unknown-command:<type>')` instead of throwing, returning a state equivalent to the input with the log appended.
- **RNG threading:** every branch writes `rng: { seed: state.rng.seed, state: rng.state() }` back into the returned state. `move` itself draws nothing (no randomness in M1), but the signature and state threading are correct so later commands can draw.
- **Occupancy semantics (M1):** any entity at the target tile blocks — no combat, no pass-through, no `solid` flag. The block check is `!inBounds || !isPassable || entityAt(...) !== undefined`, giving one `blocked` event for all three refusal reasons (spec only requires "blocked", not a reason code).
- **Missing player entity** is a `noop('no-player-entity')` rather than a throw, preserving the "every command yields ≥ 1 event" invariant.
- **`index.ts` is a pure barrel** re-exporting types + `applyCommand` + helpers + event constructors; nothing outside `src/engine` imports deeper. Verified by a test that imports only from `@engine`.

**Trade-offs:** `blocked` loses the specific refusal reason (wall vs. out-of-bounds vs. occupied): a caller wanting to distinguish must re-derive it from the world. The `default` branch's structural widening weakens compile-time exhaustiveness for future command variants. Every branch duplicates the rng-writeback snippet; a shared helper could remove it but adds indirection for three call sites.

**Revisit:** When a second command variant lands, replace the `default` noop branch with a true exhaustive `never` check (and keep the noop for deserialized unknowns at the boundary). When entities gain `solid`/combat, replace the unconditional occupant-block with per-entity resolution.

## 2026-10-04 — Stage 1 (`bootstrap-engine-skeleton`) outcome

**Context:** Milestone 1 needed to land the headless pure-TS engine and prove the determinism / framework-freedom / JSON-clean boundaries *before* any renderer or content exists, then correct the scaffolded docs to the real stack.

**Choice:** Stage 1 is complete and verified. `src/engine` ships `types.ts`, `rng.ts` (seeded Mulberry32), `grid.ts`, `events.ts`, `commands.ts`, `index.ts`, and 6 test files — **58 tests passing**, ESLint 0 errors/0 warnings, `tsc --noEmit` clean. The public surface is the `@engine` barrel only. `PROJECT.md`/`AGENTS.md` are corrected to **Expo SDK ~57.0.26 + RN 0.86.3 + React 19.2.3 + TypeScript 5.9** (Node ≥ 22.13), Vitest 5 for engine tests, ESLint 9 flat config for the boundary, zod planned for Stage 2. `STATE.md` records completion and points next at `content-packs-v1`. No engine source or tests were changed in the docs phase.

**Trade-offs:** The engine is exercised by exactly one command (`move`) and a synthetic in-test fixture, so its abstraction seams are only lightly used — the deliberate Stage 6 "dogs pack with no engine changes" test is what will really stress the content boundary. Docs are now hand-maintained rather than scaffold-generated.

**Revisit:** Stage 2 (`content-packs-v1`) is the first real test of the content seam; if it forces engine changes, treat that as a boundary defect. Revisit the RNG/entity shapes if zod packs need a discriminated entity union (see the Phase 2 entry).

## 2026-10-04 — Stage 2 Phase 2–3: pack loader policy & version-message

**Context:** Implementing `content-packs-v1` tasks 2.1–2.3 / 3.1–3.4 needed concrete choices on (a) how `loadPack` signals failure, (b) where the "usable pack" composition floor lives, (c) how id lookups behave on a miss, and (d) a genuine Phase-1 spec gap: the version error did not name the unsupported version.

**Choice:**
- **`loadPack` throws typed errors** rather than returning a result union: `PackLoadError` (with `code: 'invalid-pack' | 'composition'`) and `UnknownContentIdError` (carries `collection`, `id`, `packId`). Rationale: a pack failing to load is a boundary/authoring failure that should be loud; callers wanting a non-throwing probe call `validatePack` directly (already exists). Consistent with `createGrid` throwing on malformed input. Trade-off: callers must try/catch; accepted because load is an explicit startup step, not a hot path.
- **Composition floor (≥2 classes, ≥1 monster, ≥1 item) lives in the loader, not the schema** — matches design D2/D5 and the Phase-1 note. Schema stays permissive so partial fixtures can be validated; `loadPack` is what guarantees "a usable pack". Exported `MIN_CLASSES`/`MIN_MONSTERS`/`MIN_ITEMS` make the policy discoverable and testable.
- **Id lookups via a private `Map` held in the loader closure** (never on `LoadedPack.pack`, never in state). `LoadedPack` exposes the plain `pack` data + `class`/`monster`/`item` methods that throw `UnknownContentIdError` on miss — no silent `undefined`. This satisfies the constraint that serialized/exported content stays plain while allowing O(1) lookup.
- **Version message fix:** replaced `z.literal(PACK_VERSION)` with `z.number().superRefine(...).transform(value => value as 1)`, and added a `packVersionSchema` export. The refine-only form has a static message that could not echo the received value; `superRefine` interpolates it (`unsupported pack version 999; this engine supports version 1`), satisfying the spec's "message naming the unsupported version". The `.transform` cast keeps `z.infer` as the literal `1`.

**Trade-offs:** Throwing loader means every caller wraps try/catch; a result union would be more ergonomic but weaker at the "load must succeed" boundary. Handler-based (throw) errors are harder to compose than values. The private Map duplicates the arrays (memory) for O(1) lookup we don't yet need at this scale.

**Revisit:** If `loadPack` is adopted on a hot/repeated path (e.g. hot-reload), switch to a result union or cache the `LoadedPack`. If the two-error-type split (`PackLoadError` code union) proves awkward, split into `PackValidationError` + `PackCompositionError`. If Phase 5 needs the loaded pack in a public type, surface `LoadedPack` and the errors through `@engine`.

---

## 2026-10-04 — Engine boundary hardening for malformed serialized input

**Context:** Review of `bootstrap-engine-skeleton` found that `applyCommand`'s unknown-command branch (`src/engine/commands.ts`) reads `command.type` unguarded, so a `null`/`undefined`/non-object command (e.g. from a corrupt or hand-edited serialized command log) throws `TypeError` instead of being handled as invalid. The code comment claims the branch exists precisely "for unrecognized types that arrive from serialized logs," but it only handles well-formed objects. Because save/replay is a core M1 promise (state + command log), a malformed log must not crash the loop.

**Choice:** Treat engine entry points as boundaries for external data. `applyCommand` must reject non-object / missing-`type` commands with a `noop` event (and unchanged world state), never throw; likewise `randInt`/grid helpers already tolerate out-of-domain inputs by design.

**Trade-offs:** Adds a runtime shape guard at the command boundary; slight overlap with TypeScript's compile-time `Command` type, which cannot protect against deserialized input.

**Revisit:** When the command union grows past one variant, add a schema (zod, Stage 2) at the deserialization seam and keep the boundary guard as defense-in-depth. Trigger to re-open: any new command whose parameters are read before a shape check.

---

## 2026-10-04 — Stage 2 Phase 4: fantasy pack ships raw JSON, validated not cast

**Context:** Phase 4 authors the first real content pack (`src/packs/fantasy/`) as `pack.json` + a thin `index.ts`. Two choices needed settling: (a) whether the thin entry should type the JSON as the engine's `Pack`, and (b) whether its test lives under `src/packs` (requiring a `vitest.config.ts` `include` widening) or under `src/engine/__tests__`.

**Choice:**
- **Raw, uncast export.** `index.ts` exports the JSON verbatim (`import rawPack from './pack.json'`) as `fantasyPack`, with the `Pack` type imported only as a named alias (`FantasyPack`) for documentation. The JSON is deliberately NOT cast to `Pack`: `loadPack`/`validatePack` is the only path that promotes raw data to a validated pack, so a malformed pack fails loudly instead of a cast lying about its shape. (The schema itself is never cast away — the test runs the real validator.)
- **Test co-located under `src/packs`.** The test lives at `src/packs/fantasy/__tests__/fantasy-pack.test.ts` and `vitest.config.ts` `include` was widened to `['src/engine/**/*.test.ts', 'src/packs/**/*.test.ts']`, because the pack is a `src/packs` artifact and the engine test tree should stay about the engine.
- **Test imports the loader directly.** `loadPack` is not (yet) re-exported through `@engine`; the test imports `../../../engine/pack` and `../../../engine/schema` explicitly. Do not widen the engine's public `index.ts` for this phase (out of the assigned task).

**Trade-offs:** A second `include` glob to maintain; the deeper test path needs correct relative imports (`../../../engine`, not `../../engine`). The package id is `"fantasy"` (matching the folder) rather than the `"fantasy-core"` used in Phase 1–3 *fixtures* — fixtures are throwaway test data, the shipped pack's id is its identity.

**Revisit:** When Phase 5+ wires `loadPack`/`LoadedPack`/pack errors through `@engine`, switch the test import to the public surface. If more pack dirs appear, consider a shared `test` setup rather than a per-dir glob.

---

## 2026-10-04 — Stage 2 (`content-packs-v1`) outcome: pack format/versioning + pack-aware command entry

**Context:** Stage 2 needed to lock two things that will be costly to reverse now that other stages build on them: (a) the on-disk pack format and how it evolves, and (b) how a content-dependent command reaches the content without widening the M1 command hot path. Both were settled during implementation (design D1–D9) and are now verified; recording them as one durable entry.

**Choice:**
- **Pack format is `{ id, name, version, classes[], monsters[], items[] }`** (design D3), authored as plain JSON with a thin typed TS entry per pack (`src/packs/fantasy/`). Entries carry `id`/`name`/`glyph`/stats; items carry a **declarative** `effect` discriminated union (`{kind:'heal',amount}` | `{kind:'roll-heal',min,max}`) that is *data, not code*. The format is theme-agnostic — a sci-fi pack validates under the identical schema — and it is validated, never cast: raw JSON is promoted to a `Pack` only through `validatePack`/`loadPack`.
- **Versioning is explicit and checked**: the pack declares `version` and the engine supports exactly `PACK_VERSION = 1`. `packVersionSchema` uses `z.number().superRefine(...).transform(v => v as 1)` so an unsupported version fails with a message *naming the received version* (a `z.literal` message is static and cannot), while `z.infer` still yields the literal `1`. This is the forward-compat seam: a new schema is a new `PACK_VERSION` branch, not a silent reinterpretation of old packs.
- **D6 choice = option (a): a separate pack-aware entry point.** `applyCommand(state, command, rng)` stays 3-arg and content-free; it rejects `use-item` as `noop('unknown-command:use-item')` rather than reaching for an ambient pack. `applyCommandWithPack(state, command, rng, pack)` handles both `move` (delegating to the same `applyMove`) and `use-item`. Both share one `commit(state, rng, events, entities?)` helper, so RNG-writeback and append-only-log live in exactly one place. Content reaches a command only when the caller passes a `LoadedPack` explicitly.

**Trade-offs:**
- **Two command entry points** is the cost of keeping M1's 3-arg contract and all its tests intact. A caller must know that `use-item` needs `applyCommandWithPack`; a widened 4-arg signature would have forced every `move` caller/test to pass a pack it never uses. Mitigation: both are exported from the single `@engine` barrel, and tests assert `move` works without a pack and `use-item` does not resolve through `applyCommand`.
- **Schema churn** is expected as later stages add fields; the explicit `version` + reject-unknown-version bounds the blast radius (revisit at Stage 5 when combat/equipment need more).
- **Effect registry could be mistaken for a scripting surface**; it is deliberately a small enumerated map of pure resolvers — packs name a kind, never supply logic (D8). Treat any pack-supplied logic as an abstraction leak.
- **A private `Map` lookup index duplicates the arrays** in memory for O(1) id resolution not yet needed at this scale; it never leaves the loader closure and never touches state.

**Revisit:** Triggered by (a) any pack field later stages need that changes the meaning of existing data — bump `PACK_VERSION`; (b) the second real theme pack (`second-theme-pack`) forcing *any* engine change — that is the abstraction-leak test and reopens the format/schema; (c) if `applyCommandWithPack` proves awkward for many content commands, consider binding a `LoadedPack` into a resolver object rather than adding a function per command family. Otherwise never — the format and entry-point split are the operating model.



