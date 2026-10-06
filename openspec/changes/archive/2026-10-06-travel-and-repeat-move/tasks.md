# Tasks

## 1. Pure travel logic and tests

- [x] 1.1 Add `src/ui/logic/travel.ts` with a pure `planTravel(grid, explored, entities, from, to, playerId)` (BFS over explored + passable + unoccupied tiles, fixed north/east/south/west neighbor order, predecessor reconstruction) returning an ordered step list or `undefined` when no route exists; import only the `@engine` barrel (`isPassable`, `entityAt`/`attackTargetAt`, `indexOf`, types); verify `npm run typecheck` and `npm run lint` (no deep engine import, no React/RN)
- [x] 1.2 Make `planTravel` reject a destination that is not explored, not passable, or holds a living entity, return an empty route when `from` equals `to`, and exclude living-occupied tiles from the searchable set; verify each case is covered by tests in 1.4
- [x] 1.3 Add a pure `travelStopReason(before, after, visible, destination, ...)` (or equivalently named) to `src/ui/logic/travel.ts` returning a stop reason when the destination is reached, the next step is blocked, a living monster is FOV-visible, the player was attacked / took damage, a living monster is orthogonally adjacent, the next step would land on the stairs, the level changed, or the run ended; verify it is a side-effect-free function of its inputs (`npm run typecheck`)
- [x] 1.4 Add `src/ui/logic/travel.test.ts` under node Vitest covering: a path over explored passable tiles; unexplored tiles not routed through; non-passable tiles not routed through; living occupants not routed through; no path ⇒ `undefined`; already-at-destination ⇒ empty route; deterministic path (same inputs, same order, pinned expectation); and each `travelStopReason` trigger; verify `npm test -- travel`
- [x] 1.5 Add travel key/action classification to `src/ui/logic/input.ts` only if needed (e.g. a helper identifying a direction or wait input as travel-cancelling), keeping the existing `commandForKey`/`actionForKey` mappings intact; verify `npm test -- input`

## 2. Dispatch observation

- [x] 2.1 Change `src/ui/hooks/useGame.ts` so `dispatch` returns the `CommandResult` (state + events) it already computes synchronously from `latestRunRef`, leaving the command application, log append, and cursor update unchanged; update `UseGameResult.dispatch`'s type; verify `npm run typecheck` and that existing UI tests still pass
- [x] 2.2 Confirm the returned result exposes everything the schedulers need — the emitted event types (`blocked`, `attacked`, `level-changed`, `player-died`) and the next state (player tile/HP, `status`) — with no second source of truth; verify by inspection and `npm test -- travel input`

## 3. D-pad hold-to-move (touch only)

- [x] 3.1 Add press-and-hold repeat to the direction buttons in `src/ui/components/Dpad.tsx`: on press-in start dispatching `{ type: 'move', direction }` on a fixed cadence constant, on release clear the timer, and on a `blocked` step result or terminal run status stop the repeat; keep a single tap dispatching exactly one move; verify `npm run typecheck`
- [x] 3.2 Ensure the repeat dispatches only through the shared `dispatch` (each step a normal logged turn) and never mutates state directly; verify by inspection and that the command log grows one entry per repeated step in an integration check
- [x] 3.3 Confirm no hold behavior is added to `src/ui/hooks/useKeyboardInput.ts` and the web arrow keys are unchanged; verify `npm test -- input` and by inspection that the hook registers no repeat timer

## 4. Travel mode, control, and map tap

- [x] 4.1 Add a travel control to `src/ui/components/ActionBar.tsx` that toggles travel-target mode (an ephemeral prop/callback owned by `GameScreen`, mirroring the existing ranged target control), is visually marked active, and cancels the mode on a second press; verify `npm run typecheck`
- [x] 4.2 Add travel-target mode state to `src/ui/screens/GameScreen.tsx` (a `useState` boolean plus refs for the active route/scheduler), reset it on terminal status alongside the existing target-mode reset, and pass it to `MapView` and `ActionBar`; verify `npm run typecheck`
- [x] 4.3 Add a travel-mode tap branch to `src/ui/components/MapView.tsx`: while travel-target mode is active, a tap on an explored, passable, unoccupied tile sets the destination and starts auto-travel, while any other tap dispatches nothing and ends travel-target mode; reuse the existing tile hit-testing; verify `npm run typecheck`
- [x] 4.4 Implement the travel scheduler in `src/ui/screens/GameScreen.tsx`: plan the route with `planTravel`, then dispatch one `move` per step at a fixed interval through `dispatch`, stopping on the first `travelStopReason` and clearing the timer on stop/level change/run end/unmount; verify by inspection that no step is batched and the timer is always cleared

## 5. Cancellation wiring and input swallowing

- [x] 5.1 Route a direction press (on-screen control and web arrow key) and a wait press (center cell and `.` key) to the cancel path while travel is active: cancel travel and swallow the input (dispatch no move and no wait); read the live travel flag through a ref so the handlers never see stale state; verify by inspection and with the input tests (`npm test -- input`)
- [x] 5.2 Make the travel control's second press cancel any travel in progress without dispatching a command; verify by inspection
- [x] 5.3 Verify the cancelling input costs no turn: no command is appended to the log and the player tile/HP are unchanged after a direction or wait press during travel; verify with a focused integration check

## 6. Integration verification

- [x] 6.1 Run `npm run lint`, `npm run typecheck`, and `npm test`; verify all pass, including the engine-purity rules (no `src/engine/**` change) and the new `travel` suite
- [x] 6.2 Confirm the engine and save/replay are untouched: `git diff --stat src/engine` is empty, and a run with travel in its history serializes, resumes, and replays identically to the same commands dispatched manually; verify with the existing save/replay tests (`npm test -- save`)
- [ ] 6.3 Manually verify on the client: holding an on-screen arrow repeats moves and stops on release/a blocked step/run end; the travel control enters travel mode, tapping an explored tile auto-walks, and travel stops on each trigger; pressing a direction/wait during travel cancels with no extra turn; the web keyboard gains no hold behavior
