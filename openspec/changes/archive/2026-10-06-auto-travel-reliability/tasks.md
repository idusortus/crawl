# Tasks

## 1. Best-effort path planning

- [x] 1.1 In `src/ui/logic/travel.ts`, change `planTravel` to return `{ route: Direction[]; goal: Position }` (or `undefined`): when the tapped destination is reachable the goal is the destination and the route is unchanged; when it is explored/passable/unoccupied but unreachable, the goal is the visited tile (excluding the player's own) minimizing Chebyshev distance to the destination and the route ends on it; ties break by ascending row-major index; return `undefined` only when no fallback tile exists; verify `npx tsc --noEmit` and `npx vitest run src/ui/logic/travel.test.ts`
- [x] 1.2 Keep the goal selection in `travel.ts` (a small pure `bestApproachGoal` helper if it keeps `planTravel` readable); import only from `@engine`; verify `npm run lint` reports no React / RN import
- [x] 1.3 Add `src/ui/logic/travel.test.ts` cases: an unreachable destination routes to the best-approach goal; no fallback tile yields `undefined`; the tie-break is deterministic (same inputs → same goal / route, pinned); a reachable destination yields `goal === destination` and an unchanged route; verify `npx vitest run src/ui/logic/travel.test.ts`

## 2. Pre-start gate and goal threading

- [x] 2.1 In `src/ui/logic/travel.ts`, narrow `travelStartBlocked` to an orthogonally adjacent living monster only (remove the visible-monster clause), keeping the missing-player = blocked rule; verify tests cover adjacent-blocked and visible-but-not-adjacent-allowed
- [x] 2.2 In `src/ui/screens/GameScreen.tsx`, set `travelDestinationRef.current` to the planner's `goal` (not the tapped tile) so a best-approach goal reports `destination-reached` via `travelStopReason`; verify `npx tsc --noEmit`
- [x] 2.3 Confirm the post-step danger stop (`travelStopReason` → `monster-visible`) is untouched and still halts a started travel after the step that reveals a monster; verify `npx vitest run src/ui/logic/travel.test.ts`

## 3. Refusal feedback

- [x] 3.1 Add a presentation-only `travelNotice` state to `src/ui/screens/GameScreen.tsx`, set at each refusal path — `startTravel`'s no-reachable-goal and adjacency-gate returns, and the illegal-destination tap — and cleared on the next dispatch / action; verify by inspection it never enters `GameState` or the log and that `npx tsc --noEmit` passes
- [x] 3.2 Write the notice as an inline note near the action bar (reusing the existing `savedIndicator` / `saveError` style); verify a refused tap shows it and a started travel does not

## 4. Illegal-destination refusal path

- [x] 4.1 Add an `onTravelRefused?: () => void` prop to `src/ui/components/MapView.tsx`, called from the travel-mode branch when `isTravelDestination` is false (before ending travel-target mode), and wire it in `GameScreen` to set the notice; keep the existing `onExitTravelMode` behavior; verify `npx tsc --noEmit` and that an unexplored-tile tap in travel mode shows the notice

## 5. Verification

- [x] 5.1 Verify no engine / save / content change: `git status --porcelain -- src/engine src/packs` is empty and `git diff --stat src/engine` is empty
- [x] 5.2 Run `npm run lint`, `npx tsc --noEmit`, and `npm test`; verify all pass
- [ ] 5.3 Manually verify on the client: travel mode + a distant explored tile starts movement toward it (or surfaces a refusal); a visible-but-not-adjacent monster does not block the start; an adjacent monster refuses with a notice; an unexplored-tile tap shows the notice; run `openspec validate auto-travel-reliability --strict`
