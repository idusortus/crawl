# Design

## Context

See `proposal.md` — Why. The client is a pure `@engine` consumer: `src/ui/**` imports only the engine barrel, all input flows through the single `dispatch` in `src/ui/hooks/useGame.ts`, and ephemeral presentation modes already exist (ranged target mode is a `useState` boolean in `src/ui/screens/GameScreen.tsx`, passed to `ActionBar`/`MapView` and never entering `GameState`). Framework-free helpers live in `src/ui/logic/*` and are unit-tested under node Vitest (`camera.ts`, `stairs.ts`, `ranged.ts`, `objects.ts`, `input.ts`); React components live in `src/ui/components/*`. The engine resolves every command through `applyCommandWithPack(state, command, rng, pack) -> { state, events }`; a `move` emits `moved` (advancing the turn, so monsters act) or `blocked` (no advance). FOV is derived per render from `state.grid` + player position + `DEFAULT_SIGHT_RADIUS`; `state.explored` is the persistent explored mask. There is no equipment, no pathfinding, and no long-press behavior anywhere in the client today. The specs are `ui/auto-travel` (new) and `ui/input-mapping` (modified); read them for the exact requirements.

## Goals / Non-Goals

**Goals:**

- Let a held on-screen direction repeat moves at a fixed cadence, stopping on release, a blocked step, or the end of the run — without adding keyboard-hold behavior.
- Let the player pick an explored destination and auto-walk there one ordinary `move` command per step, stopping on the full interruption/danger trigger set.
- Keep the engine, the save format, replay semantics, and the content boundary completely untouched: every step is a real logged `move`.
- Keep all planning/cancellation logic pure and deterministic so it is unit-testable without a renderer.

**Non-Goals:**

- No engine change of any kind (no `travel`/`auto-move` command, no engine pathfinding).
- No keyboard hold-to-repeat.
- No travel through unexplored tiles, no route around a visible monster, no persistence of travel/repeat state.
- No change to ranged target mode, the D-pad cross layout, or the existing tap-to-move/tap-to-fire behavior.
- No timer/animation-driven camera or scheduler in the engine.

## Decisions

### D1 — No engine change: travel and repeat are client schedulers of the existing `move` command

Both features dispatch ordinary `{ type: 'move', direction }` commands through the existing single path (`useGame.dispatch` → `applyCommandWithPack`). Each successful step is therefore a normal logged turn, monsters act, and save/replay stay correct with no format change. Travel and repeat are presentation schedulers that choose *when* to dispatch an existing command; they never mutate `GameState` and are never recorded as new command types.

- **Why not an engine `travel` command.** A travel command would have to encode a destination and then walk it inside the engine, but the stop conditions depend on client presentation concerns (touch cadence, a swallowed cancelling input) and on player perception (a monster becoming visible mid-walk). Embedding that in the engine would pull UI timing into the pure core, complicate determinism, and force a save-format/log change for a convenience. A scheduler of `move` gets all of that for free and keeps the abstraction boundary intact.
- **Why not batch steps into one command.** A single multi-step command would desync the command log (one log entry for many turns), break the "one logged command per turn" contract, and hide the intermediate danger stops. One command per step is the whole point.
- **Alternatives.** (a) Engine-side pathfinding command: rejected as above. (b) A new client command type outside `@engine`: rejected — the client may only dispatch real engine commands.

### D2 — Travel mode and repeat state are ephemeral presentation state

Travel-target mode, the destination, the in-progress route, and the hold-repeat timer live in `GameScreen` (a `useState` mode plus refs for the active scheduler), exactly like the existing ranged target mode. They never enter `GameState`, the command log, or the save. Resuming a run always starts with no travel and no repeat.

- **Alternatives.** (a) Store in engine state: rejected — it would pollute the JSON-serializable save/replay contract for a UI-only mode. (b) A context/store: viable but heavier than the existing local `useState` + refs pattern for one screen; the ranged-mode precedent is local state.

### D3 — Deterministic pathfinding over explored, passable, unoccupied tiles

A pure helper in `src/ui/logic/travel.ts` (e.g. `planTravel(grid, explored, entities, from, to, playerId) -> Direction[] | Position[]`) runs a breadth-first search from the player's tile to the destination over tiles that are simultaneously explored, passable, and free of any living entity (the player's own tile excepted as the start). Neighbors are visited in a fixed cardinal order so the first-discovered path is deterministic; predecessors reconstruct the ordered step list. The destination must itself be explored, passable, and unoccupied. An empty route (already at the destination) is valid and ends travel immediately. When no route exists, `planTravel` returns `undefined` and travel does not begin.

- **Why BFS.** Every step costs the same and the level is a 40×30 grid, so BFS gives the shortest path with a trivial, obviously deterministic implementation; A* would add a heuristic and tie-breaking complexity for no benefit.
- **Why exclude living-occupied tiles.** The requirement forbids routing through a living entity, and the danger trigger stops travel as soon as a monster is visible, so there is no "route around a monster" behavior to design. Occupied tiles are simply not traversable for planning.
- **Assumptions (recorded).** (a) Travel does **not** attempt to route around monsters; a route that would require an occupied tile simply does not exist. (b) No path ⇒ travel does not start and dispatches nothing. (c) Already at the destination ⇒ an empty route, travel ends immediately with no move. (d) The stairs tile **is** routed through: `planTravel` does not exclude it, and the scheduler's `next-step-stairs` check (D5's stop set) stops travel *before* the step that would land on the stairs, leaving the descend decision to the player. `isTravelDestination` likewise accepts the stairs as a destination, so tapping them plans a route and travel stops on the tile before them. (e) The fixed neighbor order is north, east, south, west; it is an implementation detail pinned by tests, not a spec contract.
- **Alternatives.** (a) A*: rejected — uniform cost, no need. (b) Greedy step-toward-target: rejected — can stall on concave walls and is not obviously shortest. (c) Route around monsters: rejected — contradicted by the aggro-stop requirement.

### D4 — The scheduler observes each step through the dispatch result; cancellation is a pure predicate

`useGame.dispatch` currently computes the `CommandResult` synchronously from `latestRunRef` and discards it. Extend it to return that result (state + events) so the scheduler can, after each step, inspect the authoritative outcome: a `blocked` event (step refused), an `attacked` event or a drop in player HP (took damage), a `level-changed` event (level changed), a `player-died` event / terminal `status` (run ended), the player tile (destination reached), the next tile (stairs), the FOV-visible living monsters (aggro), and living-monster adjacency. The decision to continue or stop is a pure function in `src/ui/logic/travel.ts` (e.g. `travelStopReason(before, after, visible, destination, ...) -> reason | undefined`) over before/after state, so it is unit-testable without a renderer. The hold-repeat uses the same observation to stop on a `blocked` step.

- **Why return the result rather than re-read context state.** React state updates are asynchronous; reading `state` after `dispatch` can observe the previous render. The result returned from `dispatch` is the exact synchronous outcome of the command and avoids races. Returning it is an internal signature change only — `dispatch` still dispatches the same command through the same engine entry point, so no spec-level behavior changes.
- **Blocked detection.** Prefer the `blocked` event (authoritative); the "player tile unchanged" check is the fallback and the same condition the requirement describes. Both are cheap.
- **Alternatives.** (a) Expose events via a separate context field: rejected — more surface for the same value. (b) Poll `state` in an effect after dispatch: rejected — async/race-prone and harder to test.

### D5 — The full cancellation trigger set, and the swallowed cancelling input (confirmed with the user)

Auto-travel stops (and dispatches no further step) when any of these holds after a step: the destination is reached; the next step is blocked or the route is interrupted; a living monster is FOV-visible; the player was attacked or took damage; a living monster is orthogonally adjacent; the next step would arrive on the stairs tile; the level changed; or the run ended. In addition, a direction press (on-screen control or web arrow key) or a wait press (center cell or `.` key) while travel is active **cancels travel and is swallowed**: the input dispatches no move and no wait, so it costs no turn. Pressing the travel control again also cancels without dispatching. The D-pad and the keyboard handler consult the live travel state (via a ref, to avoid stale closures) before dispatching, and route the press to the cancel path instead.

- **Why swallow.** Letting the cancelling input dispatch would add a turn the player did not ask for (and could kill them). Swallowing makes the input purely a mode exit; the next press then moves normally. This matches the user's confirmed requirement.
- **Keyboard scope.** Swallowing a keyboard arrow/`.` during travel is a *cancellation*, not hold-repeat, so it does not conflict with the touch-only hold decision: the web keyboard still gains no hold behavior.
- **Assumptions (recorded).** (a) An invalid destination tap (unexplored, non-passable, occupied, or out of bounds) dispatches nothing and ends travel-target mode, mirroring ranged target mode's "a non-target tap cancels". (b) The cancelling direction press is swallowed and dispatches no move; a continued hold starts the repeat interval immediately and its first repeat dispatches on the next cadence tick. (c) Travel does not begin while the run is terminal.
- **Alternatives.** (a) Forward the cancelling input as a normal command: rejected — costs an unwanted turn. (b) Cancel travel only from the travel control: rejected — the user named direction/wait as cancellers.

### D6 — Hold-to-move is touch-only (confirmed with the user)

`Dpad.tsx` gains press-and-hold behavior on each direction button (e.g. `onPressIn`/`onPressOut` with a timer, or `onLongPress` plus a repeating interval) that dispatches `{ type: 'move', direction }` at a fixed cadence until release, a `blocked` step, or the end of the run. No hold behavior is added to `useKeyboardInput`; the web keyboard continues to rely on the OS key repeat for arrows. A single tap still dispatches exactly one move as before.

- **Why touch-only.** The user confirmed the scope: the web keyboard already repeats via the OS, so an input-layer hold would double up or fight the OS. Native touch has no OS auto-repeat, so the repeat must be implemented there.
- **Assumption (recorded).** The repeat cadence is a fixed constant (proposed 150 ms; travel's per-step interval likewise). It is a presentation choice pinned by tests as a named constant, not a spec contract, so it can be tuned without changing behavior contracts.
- **Alternatives.** (a) `onLongPress` only (single delayed dispatch): rejected — it does not repeat. (b) Add keyboard hold: rejected by the user's scope.

### D7 — Capability placement: new `ui/auto-travel`, input behavior in `ui/input-mapping`

Travel path planning, stepwise execution, and the pure stop predicate are a distinct behavior with no existing owner (no capability covers multi-step planning or a command scheduler), so they become a new `ui/auto-travel` capability with its own `## Purpose`. The D-pad hold-repeat, the travel control, the travel-mode map tap, and the swallowed cancelling input are input-layer behaviors and land in `ui/input-mapping`, which already owns "Directional controls emit move commands", "A wait control passes a turn", "On-screen controls cover pickup, use-item, and ranged attack", and "Tapping the map dispatches movement or a target". The travel-mode map tap stays with `ui/input-mapping` because the existing tap-to-move/tap-to-fire behavior is specified there — keeping all map-tap modes in one capability avoids splitting one gesture across two specs. The two direction/wait requirements are MODIFIED (they gain the travel-cancel exception) rather than re-stated as new ADDED requirements, so the main specs do not end up with contradictory direction/wait behavior.

- **Alternatives.** (a) Put everything in `ui/input-mapping`: rejected — path planning and the multi-step scheduler are not input mapping and would bloat a control-mapping capability. (b) Put the tap in `ui/glyph-renderer`: rejected — the renderer owns drawing and visibility, and tap dispatch is already specified in `ui/input-mapping`.

## Risks / Trade-offs

- **[Scheduler vs React async state]** → Observe the `CommandResult` returned synchronously from `dispatch`; never read post-dispatch context state. Keep the stop decision a pure function of the before/after result so it is testable.
- **[Timers leaking across unmount, run end, or level change]** → Clear the repeat/travel timers on release, on stop, on mode exit, on terminal status, and on unmount; re-check the run status before each scheduled step.
- **[Stale travel state in the keyboard/D-pad cancel path]** → Hold the active-travel flag in a ref that the handlers read, mirroring the existing `rangedAvailableRef` pattern, so a cancel is honored even before a re-render.
- **[Blocked detection ambiguity]** → Prefer the engine's `blocked` event; fall back to "player tile unchanged". Both describe the same refused step and both stop the repeat/travel.
- **[Determinism of pathfinding]** → Fixed neighbor visit order and predecessor reconstruction; pin the chosen path in unit tests. No randomness anywhere.
- **[Very long travel across a large explored map]** → Steps are paced by the same fixed interval; the danger/aggro stop fires as soon as anything becomes visible, and the player can always cancel with any direction/wait input.
- **[Changing `dispatch`'s return type could ripple]** → It is a client-internal signature; the value is additive (callers that ignore the return keep working). Typecheck and the existing UI tests cover it.

## Migration Plan

Single client release; no persisted-data migration and no `SAVE_VERSION`/`PACK_VERSION` change. Existing saves and command logs replay unchanged because neither feature introduces a new command type — travel and repeat only emit existing `move` commands. Rollback is a normal revert.

## Open Questions

- Exact repeat/travel cadence values (150 ms proposed) — tunable presentation constants, not behavioral decisions.
- Whether to later let travel route around known-but-not-visible monsters — deferred; the confirmed requirement stops on any visible monster.
