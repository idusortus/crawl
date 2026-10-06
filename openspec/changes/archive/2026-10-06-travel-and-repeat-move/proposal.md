# Proposal

## Why

Two everyday client interactions demand needless tapping. Crossing a corridor means tapping a direction once per tile, and walking to a remembered spot on an already-explored map means tapping a direction dozens of times while watching for danger. Both are pure client conveniences over the existing `move` command, so they can reduce tedium without touching the engine, the save format, or replay semantics.

## What Changes

- **Hold-to-move on the D-pad (touch only).** Pressing and holding an on-screen directional arrow repeats `move` commands for that direction at a fixed cadence; releasing stops the repeat. If a step is blocked (the engine emits a `blocked` event / the player's tile does not change), the repeat stops immediately rather than hammering a refused move ("don't waste turns"). It also stops when the run ends. This is **touch long-press only** — the web keyboard already repeats via the OS, so no keyboard-hold behavior is added.
- **"Travel to" auto-travel.** A control toggles a travel-target mode; while it is active, tapping an already-explored tile sets the destination and begins auto-travel. The player then walks one tile per step along a path over explored, passable, unoccupied tiles, dispatching a normal `move` command per step (one logged command each, so monsters act and save/replay stay correct). Travel stops when: the destination is reached; the next step is blocked or the path is interrupted; a living monster becomes visible; the player is attacked or takes damage; a living monster becomes orthogonally adjacent; the next step would land on the stairs tile or the level changes; the run ends; or the player presses a direction arrow or wait — and that cancelling input is **swallowed** (travel is cancelled without dispatching a move or wait, so it costs no turn).
- **Both features are ephemeral client presentation state.** Hold-repeat and travel mode live alongside the existing ranged target mode in `GameScreen` and never enter `GameState`.

## Capabilities

### New Capabilities

- `ui/auto-travel`: deterministic path planning and stepwise execution of auto-travel toward an explored destination using ordinary move commands, including the full interruption/danger stop-trigger set and the rule that travel state is ephemeral.

### Modified Capabilities

- `ui/input-mapping`: adds touch hold-to-repeat movement on the D-pad, a travel-mode control, tapping an explored map tile to select a travel destination, and the swallowed direction/wait input that cancels travel.

## Impact

- **Engine:** none. Every step is an existing `move` command through `applyCommandWithPack`; hold-repeat and travel are client-side schedulers of that command, so no `src/engine/**` change and no save-format or replay change.
- **UI logic (pure, node-Vitest):** new `src/ui/logic/travel.ts` (pathfinding over explored/passable/unoccupied tiles plus the pure stop/cancellation predicate); `src/ui/logic/input.ts` may gain travel-cancellation key/action classification.
- **UI components:** `src/ui/components/Dpad.tsx` (long-press repeat), `src/ui/components/MapView.tsx` (tap-to-select travel destination), `src/ui/components/ActionBar.tsx` (travel control), `src/ui/screens/GameScreen.tsx` (ephemeral travel mode + repeat/travel schedulers), `src/ui/hooks/useGame.ts` (the single `dispatch` path is observed by the schedulers).
- **Tests:** new `src/ui/logic/travel.test.ts`; extended `src/ui/logic/input.test.ts`.
- **Non-goals:** no engine change; no keyboard-hold behavior; no travel across unexplored tiles; no route that passes through or around a visible monster; no persistence of travel/repeat state.
