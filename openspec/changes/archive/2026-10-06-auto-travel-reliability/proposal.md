# Proposal

## Why

The Travel control frequently appears to do nothing. Diagnosis of the real client paths shows two silent refusals:

1. When the tapped explored tile is not connected to the player through explored + passable + unoccupied tiles — the majority of *distant remembered* taps (sampled ≈73%) — `planTravel` returns no route and travel never begins.
2. When any living monster is merely inside the field of view (≈20% of spawns) the pre-start gate refuses to begin.

Neither failure produces any feedback, so a refused travel is indistinguishable from a broken button.

## What Changes

- Make travel **best-effort**: when the tapped destination is explored, passable, and unoccupied but not reachable, plan a route to the reachable explored / passable / unoccupied tile that best approaches the destination, so the character still starts walking toward the clicked area. Travel refuses to begin only when no reachable destination tile exists.
- Narrow the pre-start danger gate to an **orthogonally adjacent living monster** (immediate, unavoidable danger). A living monster that is merely visible no longer vetoes the start; the existing post-step danger stop still halts travel as soon as danger is real.
- Surface a brief, non-blocking indication when a travel tap still cannot begin travel, so a refusal is never silent.
- Engine, save format, replay, and determinism are untouched: best-effort routing is pure client logic over the existing `move` command.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui/auto-travel`: path planning becomes best-effort toward an unreachable destination and a feedback requirement is added for a travel tap that cannot begin.
- `ui/input-mapping`: the pre-start travel condition is narrowed from "a living monster is visible or adjacent" to "a living monster is orthogonally adjacent" (the post-step danger stop in `ui/auto-travel` covers the merely-visible case).

## Impact

- `src/ui/logic/travel.ts`: best-effort goal selection in `planTravel`; `travelStartBlocked` narrowed to adjacency.
- `src/ui/screens/GameScreen.tsx`: pass the tapped tile through best-effort planning; surface and clear a transient travel notice.
- `src/ui/components/ActionBar.tsx` / `MapView.tsx`: render the transient notice (reuse the existing inline-note pattern).
- `src/ui/logic/travel.test.ts`: new cases (unreachable destination → best-approach route; no reachable tile → no start; adjacency gate; determinism).
- No `src/engine/**`, save-format, schema, or pack change.
