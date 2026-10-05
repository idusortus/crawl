# Proposal

## Why

A detailed code review found three defects that pass the current suite but break real behavior: (A) the client hardcodes the fantasy `fighter` class, so the dogs pack cannot start at all; (B) pack-free replay of a log tail containing a content-dependent command silently produces a diverged world instead of failing; and (C) two engine contracts — the exact seeded level placement and the descend-turn rule — are not pinned by any test, so a draw-order or turn-gate regression ships green. This change makes each defect loud or pinned without altering the engine's locked semantics.

## What Changes

- **Player class is no longer hardcoded (Finding A).** `createInitialState` takes an optional `classId` that defaults to the pack's first declared class (`pack.pack.classes[0].id`), so any schema-valid pack — including the dogs pack (`good-boy`/`chonker`) — is playable. The pack-specific `'fighter'` literal is removed from the factory; `PLAYER_CLASS_ID` is kept only as an exported, documented convenience default for the fantasy pack. `useGame` keeps calling `createInitialState(seed, pack)` and works through the default.
- **Pack-free replay fails loudly on a content-dependent tail (Finding B).** When `replayCommands` is called without a pack and the unapplied remainder contains a `use-item` or `descend` command, it throws a new typed `PackRequiredForReplayError` naming the offending command types instead of silently replaying a divergent world. With a pack supplied nothing changes; a fully-applied save and a remainder of only content-free commands (`move`/`attack`/`pickup`) still replay. `deserializeSave` remains pack-free for inspection. This **preserves** the locked decision that the content-free path no-ops `use-item` and generates unpopulated levels on descend — it only adds a guard at the replay seam.
- **Two engine contracts become observable (Finding C).** Add (a) a frozen seeded-placement golden test pinning `generateLevel` `{spawn, stairs}` and the `populateLevel` placements for fixed `(seed, width, height, depth)` tuples, so a draw-order change fails CI; and (b) a seed-swept descend-turn test where a freshly placed monster is within range after descent, so a wrongly promoted `level-changed` gate fails CI.

## Capabilities

### New Capabilities

_None — this change modifies existing capabilities only._

### Modified Capabilities

- `ui/app-shell`: the client builds the player from the loaded pack's own class (defaulting to its first declared class) rather than a hardcoded class id, so any schema-valid pack is playable.
- `engine/save-load`: pack-free replay of a remainder containing a content-dependent command (`use-item`/`descend`) fails with a typed error instead of silently diverging; pack-aware replay and pack-free inspection are unchanged.
- `engine/level-generation`: the seeded placement output (`{spawn, stairs}` and the initial monster/item placements) is a pinned contract that a draw-order change must break.
- `engine/command-loop`: a successful descend is observable as not advancing the newly generated level's monsters, and this rule is pinned by a seed-swept scenario.

## Impact

- Code: `src/ui/state/createInitialState.ts`, `src/ui/hooks/useGame.ts` (doc-comment/typing only), `src/engine/save.ts`, `src/engine/index.ts` (barrel export of the new error), and tests under `src/ui/state/` and `src/engine/__tests__/`.
- Engine purity: no `react`/`react-native`/`expo` imports, no ambient randomness; the new error is plain data on the `@engine` surface. The UI remains a pure `@engine` client.
- No behavior change to the locked content-free `descend`/`use-item` semantics (decisions.md Stage-6 Phase-7/Phase-8); Finding B adds only a loud replay guard.
- No new runtime dependency.
