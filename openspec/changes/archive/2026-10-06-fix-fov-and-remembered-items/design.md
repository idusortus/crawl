# Design

## Context

See `proposal.md`. `computeFov` (`src/engine/fov.ts:63-85`) casts eight octants; the origin is always visible and a non-passable tile blocks but is itself visible. Diagnosis confirmed that a straight orthogonal wall hides the tile behind it, but a tile reached only through a two-wall diagonal corner — `#` at `(2,1)` and `(1,2)` from origin `(1,1)`, target `(2,2)` — is marked visible. `tileRender` (`src/ui/logic/glyphs.ts:179-222`) draws an entity only under `visible && entity` and draws the stairs whenever the tile is seen (dimmed when only explored). AI's `playerVisible` (`src/engine/ai.ts:108-115`) uses `computeFov(..., DEFAULT_BEHAVIOR_RANGE = 8)` and `chase` already pursues anything within Chebyshev 8, so `seesPlayer` is subsumed by `inRange`.

## Goals / Non-Goals

**Goals:**

- No occupant appears through a wall corner.
- A single wall end still permits diagonal sight (standard roguelike look).
- Remembered floor items persist dimmed; monsters still vanish out of view.
- Determinism and engine purity preserved; monster AI behavior unchanged.

**Non-Goals:**

- Changing the sight radius.
- Restricting sight through a single-wall end.
- Rendering remembered monsters (or last-known monster positions).
- Any pack, schema, or save-format change.

## Decisions

- **D1 — Diagonal-gap occlusion in `computeFov`.** Keep recursive shadowcasting for the base (permissive) visibility, then apply a restrictive corner pass that only ever *removes* tiles, so it cannot reveal anything new:
  1. Flood from the origin through **passable, already-visible** tiles, respecting the same Chebyshev radius: a 4-neighbour step to such a tile is always allowed; a diagonal step to such a tile is allowed only when at least one of the two orthogonal tiles sharing the corner is passable ("no squeezing through a corner").
  2. Keep a shadowcast-visible tile only if it is the origin, a tile reached by the flood, or a non-passable tile 4-adjacent to a flooded tile (so blocking walls and the walls lining a seen corridor stay visible).
  The origin is always visible. This is O(cells) and pure. It preserves straight-line blocking and the single-wall-end case (one flanking tile is passable) while removing a tile seen only through a two-wall corner.
  - **Pitfall:** a flood that propagates from *any* visible tile (including walls) or to *any* visible tile would re-admit the corner through the wall's orthogonal neighbour — the flood must traverse/land on passable tiles only. This is why a naive "both immediate orthogonals are walls" per-cell check is insufficient beyond distance 1, and why the flood (rather than a local check) is used.
- **D2 — Remembered items via the existing precedence chain in `tileRender`.** After the `visible && entity` branch, add `else if (explored && entity is a floor item)` → draw the item's pack glyph and set the feature flag; the existing `dimmed = !visible` path then selects the explored colour. `isFeature` is already exported by `@engine`. Monsters are not matched, so they stay hidden. The remembered-stairs branch is unchanged. Precedence stays entity-over-stairs-over-terrain, applied to remembered tiles too, so an item on a remembered stairs tile shows the item.
- **D3 — Keep the client a pure consumer.** No new engine surface is required beyond `isFeature` (already public); `fov.ts` gains no dependency and stays free of React / RN / `Math.random` / `Date`.

## Risks / Trade-offs

- [Tightening FOV shrinks the explored mask where a diagonal gap was the only sight line, so seeded tests that pin an explored mask change] → update the pinned expectations; this is the intended behavior change, documented by the FOV spec delta.
- [The flood pass could over-block narrow diagonal corridors] → the "one flanking tile passable" rule preserves single-wall-end sight; add the retain-sight scenario as a test.
- [Remembered items could clutter the map or be mistaken for visible loot] → they render in the dim explored colour, matching remembered stairs; picking the item removes it from the map.
- [AI behavior could shift] → argued unchanged: `chase` awareness is `seesPlayer || inRange`, both radius 8, and the radius bound makes `seesPlayer` redundant; keep a test locking awareness within Chebyshev 8.

## Open Questions

None.
