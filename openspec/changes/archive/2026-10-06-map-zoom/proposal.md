# Proposal

## Why

The map is scaled to fit the viewport width, so a 40-column level on a phone renders tiles roughly 9 dp wide. Glyphs are hard to read and precise taps are hard to land. Players need to zoom the map in for detail and out for context, without changing how the game itself behaves.

## What Changes

- Add **ephemeral map zoom** with discrete zoom-in / zoom-out controls and an observable current zoom level. The default 1× is today's fit-to-width rendering.
- The rendered tile side length becomes the fit-to-width base multiplied by the zoom factor; the camera keeps the player's tile visible and stays clamped at map edges at every zoom, and tap-to-tile hit-testing stays exact at every zoom.
- Zoom is presentation-only client state: it never enters `GameState`, the command log, or a save, and it dispatches no command. Saving, resuming, and starting a new run are unaffected.
- Optional web-only convenience: wheel / `+` `-` zoom, mirroring the existing web-only keyboard handling (no native gesture added).

## Capabilities

### New Capabilities

- `ui/map-zoom`: the map zoom feature — bounded discrete zoom levels, zoom controls, presentation-only zoom state, and the camera / hit-testing guarantees that must hold at every zoom level.

### Modified Capabilities

- `ui/glyph-renderer`: the "The map viewport follows the player" requirement is re-scoped so fit-to-width defines the 1× base scale and a zoom factor multiplies that base (the "full level width visible" guarantee applies at 1×).

## Impact

- `src/ui/screens/GameScreen.tsx`: ephemeral zoom state (alongside the existing target / travel modes) and control wiring.
- `src/ui/components/MapView.tsx`: zoom-aware tile sizing; camera and hit-testing continue to derive from that one tile size.
- `src/ui/components/ActionBar.tsx` (or a small zoom control component): zoom-in / zoom-out controls plus the current-level display.
- `src/ui/logic/zoom.ts` (new, pure): bounded zoom steps, node-tested.
- `src/ui/logic/camera.ts`, `src/ui/components/Tile.tsx`: no behavior change expected (already parameterized by tile size); covered by tests.
- Engine, save format, and content packs are untouched (`git diff --stat src/engine` stays empty).
