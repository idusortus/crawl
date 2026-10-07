# Design

## Context

See `proposal.md`. Relevant current code:

- `planTravel` (`src/ui/logic/travel.ts:103-161`) runs a BFS over explored + passable + unoccupied tiles from the player and returns `undefined` when the tapped destination is not visited — the tap then silently no-ops.
- `startTravel` (`src/ui/screens/GameScreen.tsx:186-220`) returns silently at `:202` (no route / empty route) and at `:206` (`travelStartBlocked`); it stores the **tapped tile** in `travelDestinationRef` (`:212`).
- `travelStartBlocked` (`src/ui/logic/travel.ts:246-253`) refuses when a living monster is adjacent **or** merely visible (`hasVisibleLivingMonster`).
- The tap predicate `isTravelDestination` (`src/ui/logic/input.ts:187-199`) accepts in-bounds + explored + passable + unoccupied; reachability is `planTravel`'s job. Illegal-destination taps are handled **in `MapView`** (`src/ui/components/MapView.tsx:196-217`) by calling `onExitTravelMode()`, so `startTravel` is never invoked for them.
- The post-step stop (`travelStopReason`, `travel.ts:270-340`) halts on a visible monster, an adjacent monster, damage, a blocked step, the stairs, a level change, or run end, and reports `destination-reached` when `afterPlayer.pos === destination` (`travel.ts:298`).

Diagnosis measured that the dominant silent no-move is the unreachable destination (≈73% for a distant remembered tap), with the visible-monster pre-start gate second (≈20%). Tap-coordinate conversion was verified correct.

## Goals / Non-Goals

**Goals:**

- A travel tap reliably starts movement toward the clicked area.
- A merely visible monster does not veto the start.
- A refusal is observable to the player.

**Non-Goals:**

- Routing through unexplored tiles or through living monsters.
- Re-planning the route mid-travel, or a full pathfinder that avoids visible monsters.
- Changing the post-step stop-trigger set.
- Persisting travel, or any engine / save change.

## Decisions

- **D1 — Best-effort goal selection, and the goal is threaded to the stop predicate.** Keep the existing BFS from the player. If the tapped destination is visited, the goal is the destination (today's behavior, byte-for-byte). Otherwise the goal is the visited tile excluding the player's own that minimizes `chebyshev(goal, destination)`, tie-broken by ascending row-major index (`y * width + x`); reconstruct the route to it. If no such fallback tile exists, `planTravel` returns `undefined` (travel does not begin, and the caller surfaces a notice). **`planTravel` returns `{ route, goal }`** (not a bare `Direction[]`), and `startTravel` stores `goal` in `travelDestinationRef`, so reaching a best-approach goal reports `destination-reached` through the existing `travelStopReason` check rather than falling through to `path-blocked` when the route is exhausted.
  - Rationale: Chebyshev distance to the clicked tile is a deterministic, cheap proxy for "toward the area you clicked"; the row-major tie-break makes it reproducible; threading the goal keeps the stop contract honest.
  - Alternatives considered: (a) reject unreachable — the current bug; (b) a BFS-step-count proxy — no more faithful and less direct; (c) mid-travel re-planning — out of scope; (d) keep the bare route and amend the stop to "route exhausted" — rejected as less precise.
  - Consequence: because the BFS only traverses explored + passable + unoccupied tiles, the fallback goal is always legitimately reachable, so an explored-but-unreachable fragment (which the FOV diagonal leak can create) no longer silently kills travel. The separate `fix-fov-and-remembered-items` change reduces those fragments at the source.
- **D2 — The pre-start gate is adjacency-only.** `travelStartBlocked` (`travel.ts`) drops its `hasVisibleLivingMonster` clause and keeps `hasAdjacentLivingMonster` (and the missing-player = blocked rule). This is the implementation of the narrowed rule specified in `ui/input-mapping`. A visible-but-distant monster is handled by `travelStopReason`'s post-step `monster-visible` stop.
- **D3 — Feedback is a transient `GameScreen` string, raised from both refusal sites.** A presentation-only `travelNotice` state (mirroring the existing `savedIndicator` pattern) is set at each refusal and cleared on the next dispatch / action. Two call paths feed it: (a) `startTravel` sets it when there is no reachable goal or the adjacency gate blocks; (b) illegal-destination taps never reach `startTravel`, so `MapView` gains an `onTravelRefused` callback (called in its travel-mode else-branch) that `GameScreen` wires to set the same notice. The notice renders as a brief inline note near the action bar, uses no clock or randomness, and is never serialized. The pure planner cannot emit it (it is a pure function); the caller decides to show it.
  - Alternative: a toast/modal library — rejected (new dependency; the inline-note pattern already exists).
- **D4 — The tap predicate is unchanged.** `isTravelDestination` still gates which tiles are tappable; best-effort only changes the *route / goal* chosen afterward, not the acceptance of the tap.

## Risks / Trade-offs

- [Best-effort travel stops short of the clicked tile, which could surprise the player] → the goal is always the reachable tile closest to the tap, so travel visibly heads toward it and reports `destination-reached` at that goal; a refusal notice covers the no-goal case; the player can re-tap as more of the map is revealed. Documented behavior.
- [Changing `planTravel`'s return shape touches its existing tests] → intended; the tests are extended in the same task and pin the new `{ route, goal }` shape.
- [The adjacency-only gate lets travel start next to a visible monster] → the post-step stop halts it after one step; this is spec-aligned and preferable to a silent no-op.
- [Determinism] → goal selection is a pure function of `(grid, explored, entities, from, to, playerId)`; scenario tests pin the tie-break.

## Open Questions

None.
