# Proposal

## Why

The client can move, fight, pick up, and descend, but it cannot deliberately pass a turn — there is no way to let monsters act once without committing to a move, attack, or item. It also gives the player no readout of what is underfoot (a floor item or the stairs), and it offers actions the engine will only refuse: `Pick up` on an empty tile and `Descend` off the stairs. Three small client features close these gaps, and the first requires one new content-free engine command so a wait is deterministic, replayable, and shared by every client path.

## What Changes

- **Engine `wait` command.** Add a parameterless `{ type: 'wait' }` command that passes a turn: the player stays on their tile and monsters act exactly once. It emits a new JSON-clean `WaitedEvent { type: 'waited' }`, which is a member of the turn-advance set. It is content-free and resolves through **both** `applyCommand` and `applyCommandWithPack`. A malformed wait (any key beyond `type`) degrades to `noop('malformed-command')` and does not advance; a wait on a dead run is `noop('run-over')`.
- **Object description line.** When the player stands on a floor item or the stairs, the client shows a short line: the pack item's `name` plus its optional `description` (else a generic fallback), or "Stairs down" on the stairs. It renders nothing on an empty tile, and an unknown item id degrades to a safe label rather than crashing.
- **Hide inapplicable controls.** The action bar renders `Pick up` only while a floor item is underfoot and `Descend` only while the player is on the stairs tile; the other controls keep their existing conditions (e.g. `Fire` only while a ranged weapon is carried).
- **Wait control.** The D-pad's center cell (between west and east) becomes a wait button dispatching `{ type: 'wait' }`, and the web keyboard binds `.` to the wait command.

This is a backfill: the implementation above already exists as uncommitted working-tree code, and these artifacts specify the behavior and the tasks that code satisfies.

## Capabilities

### New Capabilities

<!-- None: every behavior lands in an existing capability. -->

### Modified Capabilities

- `engine/command-loop`: adds a parameterless content-free `wait` command and a `waited` event that advances monsters once, with the existing malformed/no-op and dead-run contracts.
- `ui/glyph-renderer`: adds an underfoot object-description line to the heads-up display (item name + optional description, or "Stairs down"), with a safe fallback for unknown item ids.
- `ui/input-mapping`: adds a center-cell wait control and the `.` web key, and hides the `Pick up`/`Descend` controls unless the player is on a floor item / the stairs.

## Impact

- **Engine:** `src/engine/types.ts` (`WaitCommand`, `WaitedEvent`, union members), `src/engine/events.ts` (`waited()` constructor), `src/engine/commands.ts` (`applyWait`, `resolveWait`, both entry points, advance matrix), `src/engine/index.ts` (public exports). Pure and deterministic: no `Math.random`/`Date`, JSON-serializable state; a pack-free replay with `wait` in the remainder is unaffected (`wait` is content-free).
- **UI:** new `src/ui/logic/objects.ts` (`floorItemAt`/`isOnStairs`/`objectInfoAt`) and `src/ui/components/ObjectInfo.tsx`; rendered from `src/ui/screens/GameScreen.tsx`; `src/ui/components/ActionBar.tsx` and `src/ui/components/Dpad.tsx`; `src/ui/logic/input.ts` (`WAIT_KEYS`); `src/ui/hooks/useKeyboardInput.ts` (doc).
- **Tests:** `src/engine/__tests__/command-loop.test.ts` (`wait command`), `src/engine/__tests__/index-surface.test.ts`; `src/ui/logic/objects.test.ts` (new), `src/ui/logic/input.test.ts`.
- **Non-goals:** no time/ambient randomness in the engine; no change to save format or replay semantics; no new equipment/inventory surface; no change to monster AI beyond the existing once-per-turn step.
