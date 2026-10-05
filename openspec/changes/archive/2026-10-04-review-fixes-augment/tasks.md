# Tasks

## 1. Finding A — pack-agnostic player class

- [x] 1.1 Change `createInitialState` in `src/ui/state/createInitialState.ts` to `createInitialState(seed: number, pack: LoadedPack, classId: string = pack.pack.classes[0].id)`, using `classId` for the player's `kind`, `hp`, and `attack` via `pack.class(classId)`; keep `PLAYER_CLASS_ID` exported as the documented fantasy default but stop using it as the implicit subject. Verify with `npx tsc --noEmit` and ESLint.
- [x] 1.2 Update the `createInitialState` doc-comments (and the `useGame.ts` comment that names `PLAYER_CLASS_ID`) to describe the first-declared-class default and the explicit-classId override. Verify no stale claim that `'fighter'` is mandatory remains (grep).
- [x] 1.3 Add a test in `src/ui/state/createInitialState.test.ts` building initial state from `loadPack(dogsPack)` with no class id: assert it does not throw, the player's `kind` is one of `['good-boy', 'chonker']`, and its HP/attack come from that class. Verify the new test passes and would fail against the old hardcoded literal.
- [x] 1.4 Add a test asserting the fantasy default is unchanged by the refactor: `createInitialState(SEED, loadPack(fantasyPack))` still yields player `kind === 'fighter'` with the fighter's HP/attack. Verify existing `createInitialState` and `save.test.ts` suites pass unchanged.

## 2. Finding B — loud pack-free replay guard

- [x] 2.1 Add `PackRequiredForReplayError extends Error` to `src/engine/save.ts` (fields naming the offending command types; message states a pack is required), and export it from `src/engine/index.ts`. Verify `npx tsc --noEmit` and the `@engine` surface test pass.
- [x] 2.2 In `replayCommands`, compute the remainder after the existing `start` clamp and throw `PackRequiredForReplayError` when `pack === undefined` and the remainder contains a `use-item` or `descend` command, before applying anything. Leave the `pack`-supplied branch, the empty-remainder case, and the content-free-remainder case unchanged. Verify `resumeRun` inherits the guard.
- [x] 2.3 Add tests in the save/load suite: (a) pack-free replay of a remainder containing `use-item` throws the typed error naming `use-item`; (b) likewise for `descend`; (c) pack-free replay of an all-`move`/`attack`/`pickup` remainder succeeds; (d) a fully-applied save replays nothing without error; (e) the same `use-item`/`descend` remainder with a pack supplied replays without the error. Verify all pass and `deserializeSave` inspection remains pack-free.
- [x] 2.4 Confirm no change to `applyCommand`'s content-free `use-item`/`descend` behavior and cite the preserved `decisions.md` Stage-6 Phase-7/Phase-8 entries in the implementation notes. Verify the existing `descend`/`use-item` content-free tests still pass.

## 3. Finding C — pin the seeded placement contract

- [x] 3.1 Add `src/engine/__tests__/level-placement-golden.test.ts` pinning `generateLevel` `{spawn, stairs}` for a few fixed `(seed, width, height, depth)` tuples (including seed 1 @40×30 d1: spawn `{2,2}`, stairs `{35,19}`), freezing semantic values rather than full-grid snapshots. Verify the test passes on current code.
- [x] 3.2 Extend the golden test to pin `populateLevel` placements (position + kind) for the same tuples with the fantasy pack loaded (seed 1 @40×30 d1: `skeleton@(31,15)`, `goblin@(3,22)`, `giant-rat@(36,6)`, `healing-potion@(26,17)`). Verify it passes and that a deliberate draw-order edit (temporary local probe, then reverted) makes it fail.

## 4. Finding C — make the descend-turn rule observable

- [x] 4.1 Add a seed-swept descend-turn test (in `src/engine/__tests__/command-loop.test.ts`) that, for a curated seed list including seeds where a fresh level-2 monster is within spawn range, runs pack-aware `descend` and asserts the event stream is exactly the `level-changed` event (no `moved`/`attacked`/`death`). Keep or add a deterministic fixture placing a monster adjacent to the new spawn to guarantee observability. Verify the test passes and fails if `level-changed` is temporarily added to `ADVANCING_EVENT_TYPES`.
- [x] 4.2 Replace the vacuous ~line 1162 assertion so the descend-turn test no longer passes solely on `events === [level-changed]` with idle monsters. Verify the suite is green and the test's failure mode is the intended gate.

## 5. Verification and boundary checks

- [x] 5.1 Run the full suite (`npx vitest run`) and confirm all tests pass, including the new golden, descend-sweep, dogs-pack, and replay-guard tests.
- [x] 5.2 Run `npx tsc --noEmit` and ESLint; confirm `src/engine/**` still has no react/react-native/expo imports and no ambient randomness, and that all cross-boundary imports use `@engine`.
- [x] 5.3 Run `openspec validate review-fixes-augment --strict` and confirm the change validates.
