# Design

## Context

See `proposal.md` — Why. Three review findings are in scope; this design fixes each against the code as it exists today.

- **Finding A** lives in `src/ui/state/createInitialState.ts`: the module exports `PLAYER_CLASS_ID = 'fighter'` (line 38) and builds the player with `pack.class(PLAYER_CLASS_ID)` twice (lines 77–78). `LoadedPack.pack` is the raw validated `Pack` (a `Map`-backed index is private to the loader, so `pack.pack.classes` is the stable declared-order array; `class(id)` is the only lookup that throws). The dogs pack (`src/packs/dogs/pack.json`) declares classes `['good-boy', 'chonker']`, so `createInitialState(seed, loadPack(dogsPack))` throws `UnknownContentIdError: unknown class id "fighter" in pack "dogs"` (verified probe).
- **Finding B** lives in `src/engine/save.ts` `replayCommands`/`resumeRun`: the branch `pack === undefined ? applyCommand(...) : applyCommandWithPack(...)` (lines 218–221) silently chooses the content-free path when no pack is passed. The content-free path no-ops `use-item` and generates an **unpopulated** level on `descend`. This is a **locked, documented decision**, not a bug: `decisions.md` Stage-6 Phase-7 entry ("pack-free `applyCommand` resolves `descend` to an UNPOPULATED level … pack-free = content-free = no population … otherwise never") and Phase-8 entry ("only the pack-aware path is the supported production path"). The defect is that the divergence is silent.
- **Finding C** has two gaps. (1) `src/engine/level.ts` `findStairs` draws a seeded index into a row-major candidate list and `populateLevel` draws counts then per-placement tile indices; no test pins the resulting values. Probe for `(seed 1, 40×30, depth 1)`: spawn `{x:2,y:2}`, stairs `{x:35,y:19}`, placements `skeleton@(31,15)`, `goblin@(3,22)`, `giant-rat@(36,6)`, `healing-potion@(26,17)`. Changing the spawn-exclusion draw shifts stairs for every seed while all 409 tests still pass. (2) `src/engine/__tests__/command-loop.test.ts` ~line 1162 asserts only `events === [{type:'level-changed', depth:2}]`, which passes whether or not `advanceMonsters` runs, because the fresh level's monsters idle when the player is far from them.

## Goals / Non-Goals

**Goals:**
- Make any schema-valid pack playable with no pack-specific player-class literal in the client.
- Make pack-free replay of a content-dependent remainder fail **loudly** with a typed error, without changing the content-free `descend`/`use-item` semantics or pack-aware behavior.
- Pin the seeded placement contract and the descend-turn rule as observable, testable behavior.

**Non-Goals:**
- Not changing the locked content-free `descend` (unpopulated level) or content-free `use-item` (noop) behavior.
- Not making `deserializeSave` require a pack — pack-free *inspection* stays allowed.
- Not adding a seed→initial-state primitive to the engine, or moving `createInitialState` into the engine.
- Not adding monster-advance behavior to `descend`, nor promoting `level-changed` into `ADVANCING_EVENT_TYPES`.
- Not introducing React render tests (the documented UI test-stack gap is unchanged).

## Decisions

### D1 — Player class defaults to the pack's first declared class (Finding A)

Change the signature to `createInitialState(seed: number, pack: LoadedPack, classId: string = pack.pack.classes[0].id): GameState`.

- **Why the raw array, not a lookup:** `pack.pack.classes` is the declared-order array from the validated data; `LoadedPack` exposes `pack` as raw `Pack` (property path confirmed in `src/engine/pack.ts`: `interface LoadedPack { readonly pack: Pack; class(id): ... }`). Reading `[0].id` cannot throw, and `loadPack`'s composition floor guarantees ≥ `MIN_CLASSES` (2) classes, so index 0 always exists. The explicit-`classId` branch still routes through `pack.class(classId)`, so an unknown explicit id throws `UnknownContentIdError` — the loud behavior is preserved for callers who name a class.
- **Fate of `PLAYER_CLASS_ID`:** Keep it exported as a documented convenience constant for the fantasy pack's default (`'fighter'`), but stop using it as the factory's implicit subject. It remains useful to `glyphs.test.ts` and to callers wanting the fantasy default. The pack-specific literal no longer influences `createInitialState(seed, pack)`.
- **Alternatives considered:** (a) Add a `playerClassId` field to the pack schema — rejected: requires a pack-format version bump and makes the player class content-schema-driven for a client concern; (b) infer from a `player: true` class flag — rejected: adds schema surface and the loader floor already guarantees a first class; (c) keep `'fighter'` and require the dogs pack to define it — rejected: violates the Stage-7 abstraction-leak result and makes new packs carry a fantasy class.
- **`useGame`:** unchanged call `createInitialState(seed, pack)` works through the default; only its doc-comment mentioning `PLAYER_CLASS_ID` is corrected.

### D2 — A loud typed guard at the replay seam (Finding B)

Add `PackRequiredForReplayError extends Error` to `src/engine/save.ts` and export it from the `@engine` barrel (`src/engine/index.ts`). In `replayCommands`, after clamping `start`, compute `remainder = commands.slice(start)`; if `pack === undefined` and any remainder command's `type` is `'use-item'` or `'descend'`, throw the error naming the offending types (deduplicated, in first-seen order) before applying anything.

- **Why at the seam, not in `applyCommand`:** The asymmetry is legitimate content-free behavior for a *live* caller; it is only wrong for *replay*, where the caller's intent is to reproduce a run. `applyCommand` keeps its documented content-free semantics (the decisions.md Phase-7/Phase-8 entries are preserved verbatim); `replayCommands` gains a precondition.
- **Boundary cases:** remainder empty (`appliedCount === commands.length`) → no error; remainder of only `move`/`attack`/`pickup` → no error (pickup is content-free per `applyPickup`); remainder containing `use-item`/`descend` with a pack supplied → unchanged behavior. `deserializeSave` untouched (inspection stays pack-free). The `start` clamp is preserved so `appliedCount < 0` (whole log) is checked against the same remainder.
- **Error content:** the message names the offending command types and states that a pack is required to replay them, mirroring the engine's existing loud-error posture (`UnknownSaveVersionError`, `UnknownContentIdError`, `UnknownGeneratorIdError`).
- **Alternatives considered:** (a) Make the content-free path throw from `applyCommand` — rejected: breaks the locked decision and the pack-free inspection path; (b) return a warning alongside the state — rejected: engine returns state, not diagnostics, and a silent warning is the very defect; (c) split `replayCommands` into two functions — rejected: a breaking API change for no behavioral gain over the guard.

### D3 — Frozen golden placement test (Finding C1)

Add `src/engine/__tests__/level-placement-golden.test.ts` that, for a small set of fixed `(seed, width, height, depth)` tuples, asserts `generateLevel(...)`'s `level.spawn` and `level.stairs`, and `populateLevel(...)`'s entity `{kind, pos}` list (with the fantasy pack loaded via `loadPack`). Values are frozen from the current deterministic output (seed 1 @40×30 d1: spawn `{2,2}`, stairs `{35,19}`, placements as listed in Context).

- **Contract, not snapshot:** assert semantic values (positions/kinds), not `toMatchSnapshot` or full-grid bytes, so the test fails on a draw-order change but not on unrelated refactors. Multiple tuples (varied seeds and at least one different size/depth) give the contract teeth without brittleness.
- **Why a test only:** the behavior already satisfies "deterministic"; the missing piece is that the *specific* seeded output is observable. The `engine/level-generation` delta adds the "pinned contract" scenarios so the requirement is explicit.

### D4 — Seed-swept descend-turn test (Finding C2)

Replace/augment the vacuous assertion in `command-loop.test.ts` with a seed sweep: for many candidate seeds, build a level-1 fixture with the player on the stairs, run pack-aware `descend`, and assert the event stream is exactly the `level-changed` event (no `moved`/`attacked`/`death` from a fresh monster). Source probe found ~37/200 seeds place a fresh monster within spawn-FOV, so a sweep that includes such seeds observes a fresh monster that *could* act — making the gate falsifiable. A fixture may also directly place a monster at a fixed small offset from the new spawn to guarantee observability independent of the seed.

- **Why not just assert `ADVANCING_EVENT_TYPES` membership:** that is a source-shape test; an observable scenario is the spec's contract. The `engine/command-loop` delta adds "Descent does not advance a fresh monster in range".

## Risks / Trade-offs

- **[Changing `createInitialState`'s default class changes the starting HP/attack for the fantasy pack]** → With `pack.pack.classes[0]` and the fantasy pack declaring `fighter` first, the default resolves to the same `'fighter'`, so fantasy output is byte-identical. A golden/equality test asserts the unchanged fantasy state, and the new dogs test asserts the new behavior.
- **[The replay guard is a behavior change for a caller that relied on silent pack-free `use-item`/`descend` replay]** → This is intentional and is the finding's point; the change is scoped to `replayCommands`/`resumeRun`, and supplying a pack restores the old (correct) path. `deserializeSave`-only callers are unaffected. Documented in the `engine/save-load` delta.
- **[Golden tests can be brittle if frozen too broadly]** → Pin only spawn/stairs and placement positions/kinds for a few tuples; no full-grid snapshots, no RNG internals beyond what the scenario needs.
- **[Seed sweep may be slow if too many seeds]** → Bound the sweep to a curated seed list that provably includes in-range fresh-monster seeds, plus a deterministic fixture; keep the runtime in the normal unit-test band.
- **[Adding an error class to the barrel changes the public surface]** → Additive only; no existing export changes shape. `index-surface.test.ts` (if it enumerates exports) is updated to include the new symbol.

## Migration Plan

No data migration. `SAVE_VERSION` is unchanged (the envelope format is unchanged; only a replay precondition is added). `PACK_VERSION` is unchanged. Rollback is reverting the change directory's implementation edits; no persisted artifacts require conversion.

## Open Questions

None. The exact `PackRequiredForReplayError` name is proposed here and is an internal, additive detail that does not change the specs or task breakdown.
