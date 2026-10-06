# Tasks

> Backfill: the implementation already exists in the working tree. Each task below is a check to confirm the existing code satisfies the change; check it off during apply after verifying it, and fix any genuine mismatch rather than trusting the code.

## 1. Engine wait command and `waited` event

- [x] 1.1 Add `WaitCommand { type: 'wait' }` and `WaitedEvent { type: 'waited' }` to `src/engine/types.ts` and add each to its discriminated union (`Command`, `GameEvent`); verify `npm run typecheck`
- [x] 1.2 Add a `waited()` constructor to `src/engine/events.ts` returning the payload-free `{ type: 'waited' }`; verify it is exported from `src/engine/index.ts` alongside the other event constructors (`npm test -- index-surface`)
- [x] 1.3 Implement `applyWait` in `src/engine/commands.ts` (no player entity → `noop('no-player-entity')`; otherwise emit `waited()` via the shared `commit`), add `'waited'` to `ADVANCING_EVENT_TYPES`, and add a private `resolveWait` that treats any key beyond `type` as `noop('malformed-command')`; verify the command-loop `wait command` suite passes (`npm test -- command-loop`)
- [x] 1.4 Route `type === 'wait'` to `resolveWait` in **both** `applyCommand` and `applyCommandWithPack` before their switches; verify a wait applied through each entry point returns a `waited` event and leaves the player on the same tile (`npm test -- command-loop`)
- [x] 1.5 Confirm the terminal-permadeath gate still precedes the monster step, so a wait on a dead run yields `noop('run-over')` with no advance; verify with the command-loop dead-run case (`npm test -- command-loop`)

## 2. Engine wait tests

- [x] 2.1 Add a `describe('wait command')` suite to `src/engine/__tests__/command-loop.test.ts` covering: `waited` is emitted and the player does not move; a chasing monster acts exactly once; the same seed + commands reproduce identical state; a malformed wait (extra key) is `malformed-command` with no advance and an untouched RNG; a wait with no player entity is `no-player-entity`; a dead run is `run-over`; and the pack-aware entry point resolves it identically; verify `npm test -- command-loop`
- [x] 2.2 Extend `src/engine/__tests__/index-surface.test.ts` so the public surface type-checks and runs `WaitCommand`/`WaitedEvent`/`waited()` through `applyCommand` and `appendEvents`; verify `npm test -- index-surface`
- [x] 2.3 Confirm a pack-free replay whose remainder contains `wait` is unaffected (it stays in the content-free set in `src/engine/save.ts`), and run the engine purity lint; verify `npm test -- save-load` and `npm run lint`

## 3. Object description line

- [x] 3.1 Add pure `floorItemAt(state)`, `isOnStairs(state)`, and `objectInfoAt(state, pack)` to a new `src/ui/logic/objects.ts`, importing only the `@engine` barrel; verify `npm run typecheck` and `npm run lint` (no deep engine import)
- [x] 3.2 Make `objectInfoAt` return the pack item's `name` plus its optional `description` (else the generic fallback constant), fall back to a safe "Unknown item" label when `pack.item(kind)` throws, describe the stairs as leading down when there is no item, and return `undefined` on an empty tile; verify the `objects.test.ts` suite (`npm test -- objects`)
- [x] 3.3 Add `src/ui/logic/objects.test.ts` covering item-with-description, item-without-description fallback, stairs, empty tile, unknown-kind safety, and item-over-stairs precedence; verify `npm test -- objects`
- [x] 3.4 Add `src/ui/components/ObjectInfo.tsx` that reads `{ state, pack }` from the game context, renders `null` when state/pack is absent or `objectInfoAt` is `undefined`, and otherwise renders the title and detail; render it from `src/ui/screens/GameScreen.tsx` below the HUD; verify `npm run typecheck`

## 4. Hide inapplicable controls

- [x] 4.1 In `src/ui/components/ActionBar.tsx` derive `canPickUp` from `floorItemAt(state)` and `canDescend` from `isOnStairs(state)`, guarded on `state !== undefined`, and push the `Pick up` / `Descend` buttons only when true; leave the other controls' conditions unchanged (the ranged `Fire` control stays gated on a carried ranged weapon); verify `npm run typecheck` and by inspection that the bar hides each action when inapplicable

## 5. Wait control in the D-pad and on the web keyboard

- [x] 5.1 Add a stateless center-cell wait button to `src/ui/components/Dpad.tsx` in the middle row between west and east, dispatching `{ type: 'wait' }` through the shared `dispatch`; verify by inspection that the four move directions remain and the center dispatches wait
- [x] 5.2 Add `WAIT_KEYS = new Set(['.'])` to `src/ui/logic/input.ts` and map it in `commandForKey` to `{ type: 'wait' }`; verify the `input.test.ts` case asserting `.` maps to wait and other keys stay unhandled (`npm test -- input`)
- [x] 5.3 Confirm `useKeyboardInput` forwards the `.` command through `dispatch` on web with no hook change beyond its documentation, and that native registers no listener; verify `npm run typecheck` and the existing input tests (`npm test -- input`)

## 6. Integration verification

- [x] 6.1 Run `npm run lint`, `npm run typecheck`, and `npm test`; verify all pass, including the engine-purity ESLint rules and the new engine/UI suites
- [ ] 6.2 Manually verify on the client: the D-pad center passes a turn and monsters move once; `.` does the same on web; standing on an item shows its name and detail, standing on the stairs shows "Stairs down", and an empty tile shows nothing; `Pick up` appears only on an item and `Descend` only on the stairs
